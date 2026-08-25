// Lumencraft multiplayer backend for ox-live (see ox-live/README.md).
// Regular rooms are ephemeral (seed + edit log + peer states, in memory).
// The site SMP room ('SMP') is a persistent shared world: seed + edit log
// survive process restarts via a debounced JSON store.
// ESM + stdlib only, per the platform contract.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const SMP_ROOM = 'SMP';
const SMP_SEED = 'site-smp';
const SMP_MAX_EDITS = 200000;
const SMP_MAX_PEERS = 32;
const ROOM_MAX_PEERS = 15;
const MAX_EDITS = 50000;
const NAME_RE = /[^\x20-\x7e]/g;
const CLAIM_TOTEM_ID = 60;   // keep in sync with src/blocks.js B.CLAIM_TOTEM
const CLAIM_RANGE = 1;       // chunks each direction → 3×3 chunk claim
const MAX_CLAIMS_PER_PLAYER = 2;
const MAX_CONTAINERS = 300;  // synced chests per room
const MAX_OBSERVERS = 24;    // map viewers per room (don't eat player slots)

function smpStorePath() {
  return process.env.SMP_STORE ||
    fileURLToPath(new URL('../../../../smp-world.json', import.meta.url));
}

function pinStorePath() {
  return process.env.PIN_STORE ||
    fileURLToPath(new URL('../../../../lumencraft-pins.json', import.meta.url));
}

function pinHash(name, salt, pin) {
  return createHash('sha256').update(name + '|' + salt + '|' + pin).digest('hex');
}

function cleanName(raw, fallback) {
  const n = String(raw ?? '').replace(NAME_RE, ' ').trim().slice(0, 16);
  return n || fallback;
}

function cleanRoom(raw) {
  let r = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (!r) r = randomCode();
  return r;
}

function cleanSeed(raw) {
  return String(raw ?? '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 48);
}

function cleanCause(raw) {
  return String(raw ?? '').replace(NAME_RE, ' ').trim().slice(0, 16);
}

function cleanPin(raw) {
  return String(raw ?? '').replace(NAME_RE, ' ').trim().slice(0, 16);
}

function randomCode() {
  const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

function validBlockOp(m) {
  return Number.isInteger(m.x) && Number.isInteger(m.y) && Number.isInteger(m.z) &&
    m.y >= 0 && m.y < 128 && Math.abs(m.x) <= 1e6 && Math.abs(m.z) <= 1e6 &&
    Number.isInteger(m.b) && m.b >= 0 && m.b < 256 &&
    Number.isInteger(m.f | 0);
}

// chest slots wire format: [[idx,id,count,dur?],...] — sparse, non-null slots only
function validChestOp(m) {
  if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || !Number.isInteger(m.z)) return false;
  if (m.y < 0 || m.y >= 128 || Math.abs(m.x) > 1e6 || Math.abs(m.z) > 1e6) return false;
  if (!Array.isArray(m.slots) || m.slots.length > 27) return false;
  for (const s of m.slots) {
    if (!Array.isArray(s) || s.length < 3 || s.length > 4) return false;
    const [idx, id, count, dur] = s;
    if (!Number.isInteger(idx) || idx < 0 || idx > 26) return false;
    if (typeof id === 'number') {
      if (!Number.isInteger(id) || id < 0 || id > 255) return false;
    } else if (typeof id === 'string') {
      if (!/^[\w-]{1,24}$/.test(id)) return false;
    } else return false;
    if (!Number.isInteger(count) || count < 1 || count > 64) return false;
    if (s.length === 4 && (!Number.isInteger(dur) || dur < -1 || dur > 100000)) return false;
  }
  return true;
}

export default {
  maxSockets: 96,
  tickMs: 100,
  create(ctx) {
    const rooms = new Map();     // code -> room
    const peerRoom = new Map();  // ws.id -> code

    // ---- name PINs (opt-in identity lock; global across rooms) ----
    // name -> {salt, hash}; a name with a registered PIN only joins with it.
    const pins = new Map();
    try {
      const raw = JSON.parse(readFileSync(pinStorePath(), 'utf8'));
      if (raw && typeof raw === 'object') {
        for (const [name, rec] of Object.entries(raw)) {
          if (rec && typeof rec.salt === 'string' && typeof rec.hash === 'string') {
            pins.set(cleanName(name, ''), rec);
          }
        }
        if (pins.size) ctx.log(`name PINs loaded: ${pins.size}`);
      }
    } catch (e) {
      if (e && e.code !== 'ENOENT') ctx.log('PIN store unreadable, starting fresh: ' + e.message);
    }

    function savePins() {
      try {
        mkdirSync(dirname(pinStorePath()), { recursive: true });
        const tmp = pinStorePath() + '.tmp';
        const out = {};
        for (const [name, rec] of pins) out[name] = rec;
        writeFileSync(tmp, JSON.stringify(out));
        renameSync(tmp, pinStorePath());
      } catch (e) {
        ctx.log('PIN save failed: ' + e.message);
      }
    }

    // ---- SMP persistence ----
    let smpLoaded = null;        // {seed, t0, edits: Map} from disk (once)
    let saveTimer = null;
    let smpDirty = false;

    // claims live only in the SMP world: "cx,cz" -> {owner, totem, placedAt, lastSeen}
    const claims = new Map();      // chunk key -> claim
    const totemClaim = new Map();  // "x,y,z" -> center chunk key

    function loadSmp() {
      if (smpLoaded) return smpLoaded;
      smpLoaded = { seed: SMP_SEED, t0: Date.now(), edits: new Map(), containers: new Map() };
      try {
        const raw = JSON.parse(readFileSync(smpStorePath(), 'utf8'));
        if (raw && typeof raw.seed === 'string' && Array.isArray(raw.edits)) {
          smpLoaded.seed = cleanSeed(raw.seed) || SMP_SEED;
          if (Number.isFinite(raw.t0)) smpLoaded.t0 = raw.t0;
          for (const e of raw.edits) {
            if (Array.isArray(e) && e.length >= 3 &&
                Number.isInteger(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]) &&
                Number.isInteger(e[3]) && e[3] >= 0 && e[3] < 256) {
              smpLoaded.edits.set(e[0] + ',' + e[1] + ',' + e[2], [e[3] & 255, (e[4] | 0) & 3]);
            }
          }
          if (Array.isArray(raw.containers)) {
            let n = 0;
            for (const c of raw.containers) {
              if (!Array.isArray(c) || c.length < 4) continue;
              const [x, y, z, slots] = c;
              const probe = { x, y, z, slots };
              if (!validChestOp(probe)) continue;
              smpLoaded.containers.set(x + ',' + y + ',' + z, { slots, at: 0 });
              if (++n >= MAX_CONTAINERS) break;
            }
            if (n) ctx.log(`SMP containers loaded: ${n}`);
          }
          if (Array.isArray(raw.claims)) {
            for (const c of raw.claims) {
              if (!Array.isArray(c) || c.length < 7) continue;
              const [cx, cz, owner, tx, ty, tz] = c;
              if (!Number.isInteger(cx) || !Number.isInteger(cz)) continue;
              const name = cleanName(owner, '');
              if (!name) continue;
              const totem = Number.isInteger(tx) && Number.isInteger(ty) && Number.isInteger(tz)
                ? tx + ',' + ty + ',' + tz : null;
              const rec = { owner: name, totem, placedAt: +c[6] || 0, lastSeen: +c[7] || 0 };
              claims.set(cx + ',' + cz, rec);
              if (totem) totemClaim.set(totem, cx + ',' + cz);
            }
            ctx.log(`SMP claims loaded: ${claims.size} chunks`);
          }
          ctx.log(`SMP world loaded: ${smpLoaded.edits.size} edits (saved ${new Date(raw.savedAt || 0).toISOString()})`);
        }
      } catch (e) {
        if (e && e.code !== 'ENOENT') ctx.log('SMP store unreadable, starting fresh: ' + e.message);
      }
      return smpLoaded;
    }

    function saveSmp() {
      saveTimer = null;
      if (!smpDirty) return;
      const smp = rooms.get(SMP_ROOM);
      const edits = smp ? smp.edits : loadSmp().edits;
      const out = {
        v: 1,
        seed: SMP_SEED,
        t0: smp ? smp.t0 : loadSmp().t0,
        savedAt: Date.now(),
        edits: [],
        claims: [],
        containers: [],
      };
      for (const [k, v] of edits) {
        const [x, y, z] = k.split(',').map(Number);
        out.edits.push([x, y, z, v[0], v[1]]);
      }
      const conts = smp ? smp.containers : loadSmp().containers;
      for (const [k, c] of conts) {
        const [x, y, z] = k.split(',').map(Number);
        out.containers.push([x, y, z, c.slots]);
      }
      for (const [k, c] of claims) {
        const [cx, cz] = k.split(',').map(Number);
        const [tx, ty, tz] = c.totem ? c.totem.split(',').map(Number) : [0, -1, 0];
        out.claims.push([cx, cz, c.owner, tx, ty, tz, c.placedAt, c.lastSeen]);
      }
      try {
        mkdirSync(dirname(smpStorePath()), { recursive: true });
        const tmp = smpStorePath() + '.tmp';
        writeFileSync(tmp, JSON.stringify(out));
        renameSync(tmp, smpStorePath());
        smpDirty = false;
      } catch (e) {
        ctx.log('SMP save failed: ' + e.message);
      }
    }

    function scheduleSmpSave() {
      smpDirty = true;
      if (!saveTimer) saveTimer = setTimeout(saveSmp, 10000);
    }

    function getRoom(code, seedReq) {
      let room = rooms.get(code);
      if (!room) {
        if (code === SMP_ROOM) {
          const saved = loadSmp();
          room = {
            code, smp: true,
            seed: saved.seed,
            t0: saved.t0,
            edits: saved.edits,
            containers: saved.containers,
            peers: new Map(),
          };
        } else {
          room = {
            code,
            seed: seedReq || ('mp-' + code.toLowerCase()),
            t0: Date.now(),
            edits: new Map(),
            containers: new Map(),
            peers: new Map(),
          };
        }
        rooms.set(code, room);
        ctx.log(`room ${code} created (seed "${room.seed}")`);
      }
      return room;
    }

    function broadcast(room, exceptId, obj) {
      for (const [id, p] of room.peers) {
        if (id === exceptId) continue;
        try { p.ws.send(obj); } catch {}
      }
    }

    function playerList(room, exceptId) {
      const out = [];
      for (const [id, p] of room.peers) {
        if (id === exceptId || p.observer) continue;
        out.push([id, p.name, ...p.s]);
      }
      return out;
    }

    return {
      open(ws) {
        // join is required as the first message; nothing to do yet
      },

      message(ws, msg) {
        if (!msg || typeof msg !== 'object') return;
        const code = peerRoom.get(ws.id);

        if (msg.op === 'join' && !code) {
          const name = cleanName(msg.name, 'Player' + ws.id);
          const pin = cleanPin(msg.pin);

          // PIN-protected names: prove ownership or stay out
          const pinRec = pins.get(name);
          if (pinRec) {
            if (!pin || pinHash(name, pinRec.salt, pin) !== pinRec.hash) {
              ws._pinFails = (ws._pinFails || 0) + 1;
              if (ws._pinFails >= 5) {
                ctx.log(`pin: ${ws.ip || '?'} locked out after 5 failed attempts for "${name}"`);
                try { ws.close(1008); } catch {}
                return;
              }
              ws.send({ op: 'denied', reason: `name "${name}" is PIN-protected — enter your PIN` });
              return;
            }
          } else if (pin) {
            if (pin.length < 4) {
              ws.send({ op: 'denied', reason: 'PIN must be at least 4 characters' });
              return;
            }
            const salt = randomBytes(8).toString('hex');
            pins.set(name, { salt, hash: pinHash(name, salt, pin) });
            savePins();
            ctx.log(`pin: name "${name}" is now PIN-protected`);
          }

          const room = getRoom(cleanRoom(msg.room), cleanSeed(msg.seed));
          const isMap = msg.map === true;

          if (isMap) {
            // map observers: invisible, read-only, separate cap
            const observers = [...room.peers.values()].filter((p) => p.observer).length;
            if (observers >= MAX_OBSERVERS) {
              ws.send({ op: 'denied', reason: 'too many map viewers' });
              return;
            }
            const peer = { name: '[map]', observer: true, s: [0, -100, 0, 0, 0], ws, blockT: [], chatT: [] };
            room.peers.set(ws.id, peer);
            peerRoom.set(ws.id, room.code);
            ws.send({
              op: 'welcome', you: ws.id, room: room.code, seed: room.seed,
              t0: room.t0, now: Date.now(), players: playerList(room, -1),
              edits: [], smp: !!room.smp, spawnNear: null, claims: [], containers: [],
            });
            ctx.log(`room ${room.code}: map viewer attached (${room.peers.size} sockets)`);
            return;
          }

          const cap = room.smp ? SMP_MAX_PEERS : ROOM_MAX_PEERS;
          const playersOnline = [...room.peers.values()].filter((p) => !p.observer).length;
          if (playersOnline >= cap) {
            ws.send({ op: 'denied', reason: room.smp ? 'SMP world full' : 'room full' });
            return;
          }
          const peer = { name, s: [0.5, -100, 0.5, 0, 0], ws, blockT: [], chatT: [] };
          room.peers.set(ws.id, peer);
          peerRoom.set(ws.id, room.code);

          // SMP: suggest spawning next to an existing player (never an observer)
          let spawnNear = null;
          if (room.smp) {
            const candidates = [...room.peers.values()].filter((p) => !p.observer && p.s[1] > 0);
            if (candidates.length) {
              const c = candidates[(Math.random() * candidates.length) | 0];
              spawnNear = [Math.round(c.s[0]), Math.round(c.s[2])];
            }
          }

          const capEdits = room.smp ? SMP_MAX_EDITS : MAX_EDITS;
          const edits = [];
          for (const [k, v] of room.edits) {
            const [x, y, z] = k.split(',').map(Number);
            edits.push([x, y, z, v[0], v[1]]);
            if (edits.length >= capEdits) break;
          }
          // claims snapshot for client-side F3 display
          const claimsOut = [];
          if (room.smp) {
            for (const [k, c] of claims) {
              const [cx, cz] = k.split(',').map(Number);
              claimsOut.push([cx, cz, c.owner]);
              if (claimsOut.length >= 2000) break;
            }
          }
          // shared container snapshot (sparse slots)
          const containersOut = [];
          for (const [k, c] of room.containers) {
            const [cx, cy, cz] = k.split(',').map(Number);
            containersOut.push([cx, cy, cz, c.slots]);
            if (containersOut.length >= MAX_CONTAINERS) break;
          }
          ws.send({
            op: 'welcome', you: ws.id, room: room.code, seed: room.seed,
            t0: room.t0, now: Date.now(), players: playerList(room, ws.id), edits,
            smp: !!room.smp, spawnNear, claims: claimsOut, containers: containersOut,
          });
          broadcast(room, ws.id, { op: 'joined', id: ws.id, name, s: peer.s });
          ctx.log(`room ${room.code}: ${name} joined (${room.peers.size} online)`);
          return;
        }

        // identity op: release a name's PIN (works joined or not)
        if (msg.op === 'unpin') {
          const name = cleanName(msg.name, '');
          const pin = cleanPin(msg.pin);
          const rec = name ? pins.get(name) : null;
          if (!rec) {
            ws.send({ op: 'denied', reason: name ? `name "${name}" has no PIN` : 'missing name' });
            return;
          }
          if (!pin || pinHash(name, rec.salt, pin) !== rec.hash) {
            ws._pinFails = (ws._pinFails || 0) + 1;
            if (ws._pinFails >= 5) {
              ctx.log(`pin: ${ws.ip || '?'} locked out after 5 failed attempts for "${name}"`);
              try { ws.close(1008); } catch {}
              return;
            }
            ws.send({ op: 'denied', reason: 'wrong PIN' });
            return;
          }
          pins.delete(name);
          savePins();
          ws.send({ op: 'unpinned', name });
          ctx.log(`pin: name "${name}" unlocked`);
          return;
        }

        // Ops from a socket the current handler doesn't know (hot reload
        // swapped handlers under a live socket): ask the client to re-join.
        if (!code) {
          if (msg.op === 'state' || msg.op === 'block' || msg.op === 'chat' || msg.op === 'died') {
            const now = Date.now();
            if (!ws._rejoinAt || now - ws._rejoinAt > 2000) {
              ws._rejoinAt = now;
              try { ws.send({ op: 'rejoin' }); } catch {}
            }
          }
          return;
        }
        const room = rooms.get(code);
        const peer = room && room.peers.get(ws.id);
        if (!peer) return;

        // map observers are read-only: drop every gameplay op they send
        if (peer.observer) {
          if (msg.op === 'mapdata') {
            const capEdits = room.smp ? SMP_MAX_EDITS : MAX_EDITS;
            const edits = [];
            for (const [k, v] of room.edits) {
              const [x, y, z] = k.split(',').map(Number);
              edits.push([x, y, z, v[0]]);
              if (edits.length >= capEdits) break;
            }
            const claimsOut = [];
            for (const [k, c] of claims) {
              const [cx, cz] = k.split(',').map(Number);
              claimsOut.push([cx, cz, c.owner]);
              if (claimsOut.length >= 2000) break;
            }
            const containersOut = [];
            for (const [k, c] of room.containers) {
              const [cx, cy, cz] = k.split(',').map(Number);
              containersOut.push([cx, cy, cz, c.slots]);
              if (containersOut.length >= MAX_CONTAINERS) break;
            }
            ws.send({
              op: 'mapdata', seed: room.seed, t0: room.t0, now: Date.now(),
              edits, claims: claimsOut, containers: containersOut,
              players: playerList(room, -1),
            });
          }
          return;
        }

        if (msg.op === 'state' && Array.isArray(msg.s)) {
          const s = msg.s;
          if (s.length >= 5 &&
              Number.isFinite(s[0]) && Number.isFinite(s[1]) && Number.isFinite(s[2]) &&
              Number.isFinite(s[3]) && Number.isFinite(s[4])) {
            peer.s = [+s[0].toFixed(2), +Math.max(-40, Math.min(300, s[1])).toFixed(2),
                      +s[2].toFixed(2), +s[3].toFixed(3), +s[4].toFixed(3)];
          }
          return;
        }

        if (msg.op === 'block') {
          const now = Date.now();
          peer.blockT = peer.blockT.filter((t) => now - t < 1000);
          peer.blockT.push(now);
          if (peer.blockT.length > 40) return; // rate limit: 40 edits/sec
          if (!validBlockOp(msg)) return;

          // ---- SMP claim enforcement ----
          if (room.smp) {
            const key = msg.x + ',' + msg.y + ',' + msg.z;
            const ck = (msg.x >> 4) + ',' + (msg.z >> 4);
            const here = claims.get(ck);
            const isTotemPlace = msg.b === CLAIM_TOTEM_ID;

            if (isTotemPlace) {
              // overlap check first so a totem inside someone's claim gets a
              // specific reason instead of the generic ownership deny
              for (let dz = -CLAIM_RANGE; dz <= CLAIM_RANGE; dz++) {
                for (let dx = -CLAIM_RANGE; dx <= CLAIM_RANGE; dx++) {
                  const other = claims.get(((msg.x >> 4) + dx) + ',' + ((msg.z >> 4) + dz));
                  if (other) {
                    ws.send({ op: 'deny', x: msg.x, y: msg.y, z: msg.z, owner: other.owner, reason: `overlaps ${other.owner}'s claim` });
                    return;
                  }
                }
              }
              const mine = [...claims.values()].filter((c) => c.owner === peer.name).length;
              if (mine >= MAX_CLAIMS_PER_PLAYER) {
                ws.send({ op: 'deny', x: msg.x, y: msg.y, z: msg.z, owner: peer.name, reason: `claim limit reached (${MAX_CLAIMS_PER_PLAYER})` });
                return;
              }
            } else if (here && here.owner !== peer.name) {
              ws.send({ op: 'deny', x: msg.x, y: msg.y, z: msg.z, owner: here.owner });
              return;
            }

            // placing a totem → register the claim (checks passed above)
            if (isTotemPlace) {
              const ccx = msg.x >> 4, ccz = msg.z >> 4;
              const rec = { owner: peer.name, totem: key, placedAt: now, lastSeen: now };
              for (let dz = -CLAIM_RANGE; dz <= CLAIM_RANGE; dz++) {
                for (let dx = -CLAIM_RANGE; dx <= CLAIM_RANGE; dx++) {
                  claims.set((ccx + dx) + ',' + (ccz + dz), rec);
                }
              }
              totemClaim.set(key, ccx + ',' + ccz);
              scheduleSmpSave();
              broadcast(room, -1, { op: 'claim', owner: peer.name, cx: ccx, cz: ccz });
              ctx.log(`claim: ${peer.name} claimed ${ccx},${ccz} (+3×3)`);
            }

            // breaking the totem block → release its claim (owner only, enforced above)
            if (msg.b === 0 && totemClaim.has(key)) {
              const centerKey = totemClaim.get(key);
              const rec = claims.get(centerKey);
              if (rec && rec.totem === key) {
                const [ccx, ccz] = centerKey.split(',').map(Number);
                for (let dz = -CLAIM_RANGE; dz <= CLAIM_RANGE; dz++) {
                  for (let dx = -CLAIM_RANGE; dx <= CLAIM_RANGE; dx++) {
                    const k = (ccx + dx) + ',' + (ccz + dz);
                    if (claims.get(k) === rec) claims.delete(k);
                  }
                }
                totemClaim.delete(key);
                scheduleSmpSave();
                broadcast(room, -1, { op: 'unclaim', cx: ccx, cz: ccz });
                ctx.log(`claim: ${peer.name} released ${ccx},${ccz}`);
              } else {
                totemClaim.delete(key);
              }
            }
          }

          // chest broken → its synced contents go with it
          if (room.containers && room.containers.size && msg.b === 0) {
            const ck2 = msg.x + ',' + msg.y + ',' + msg.z;
            if (room.containers.delete(ck2) && room.smp) scheduleSmpSave();
          }

          room.edits.set(msg.x + ',' + msg.y + ',' + msg.z, [msg.b, msg.f | 0]);
          const capEdits = room.smp ? SMP_MAX_EDITS : MAX_EDITS;
          if (room.edits.size > capEdits) {
            // drop oldest third (insertion order proxy for oldest)
            let drop = Math.floor(capEdits / 3);
            for (const k of room.edits.keys()) { room.edits.delete(k); if (--drop <= 0) break; }
          }
          if (room.smp) scheduleSmpSave();
          broadcast(room, ws.id, { op: 'block', x: msg.x, y: msg.y, z: msg.z, b: msg.b, f: msg.f | 0 });
          return;
        }

        if (msg.op === 'chest') {
          if (!validChestOp(msg)) return;
          const key = msg.x + ',' + msg.y + ',' + msg.z;
          if (!room.containers.has(key) && room.containers.size >= MAX_CONTAINERS) {
            ws.send({ op: 'deny', x: msg.x, y: msg.y, z: msg.z, owner: 'server', reason: 'container sync limit reached' });
            return;
          }
          const slots = msg.slots.map((s) => (s.length === 4 ? [s[0], s[1], s[2], s[3]] : [s[0], s[1], s[2]]));
          room.containers.set(key, { slots, at: Date.now() });
          if (room.smp) scheduleSmpSave();
          broadcast(room, ws.id, { op: 'chest', x: msg.x, y: msg.y, z: msg.z, slots });
          return;
        }

        if (msg.op === 'chat') {
          const now = Date.now();
          peer.chatT = peer.chatT.filter((t) => now - t < 1000);
          peer.chatT.push(now);
          if (peer.chatT.length > 5) return;
          const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
          if (!text) return;
          broadcast(room, -1, { op: 'chat', id: ws.id, name: peer.name, text });
          return;
        }

        if (msg.op === 'died') {
          const now = Date.now();
          peer.chatT = peer.chatT.filter((t) => now - t < 1000);
          peer.chatT.push(now);
          if (peer.chatT.length > 5) return;
          const cause = cleanCause(msg.c);
          broadcast(room, ws.id, { op: 'sys', text: `${peer.name} died${cause ? ' (' + cause + ')' : ''}` });
          return;
        }
      },

      close(ws) {
        const code = peerRoom.get(ws.id);
        if (!code) return;
        peerRoom.delete(ws.id);
        const room = rooms.get(code);
        if (!room) return;
        const peer = room.peers.get(ws.id);
        room.peers.delete(ws.id);
        if (peer && peer.observer) {
          ctx.log(`room ${code}: map viewer detached (${room.peers.size} sockets)`);
        } else {
          broadcast(room, ws.id, { op: 'left', id: ws.id });
          if (peer) ctx.log(`room ${code}: ${peer.name} left (${room.peers.size} online)`);
        }
        if (room.peers.size === 0 && !room.smp) {
          rooms.delete(code);
          ctx.log(`room ${code} empty — reclaimed`);
        } else if (room.smp && smpDirty && !saveTimer) {
          saveSmp();
        }
      },

      tick() {
        for (const room of rooms.values()) {
          if (room.peers.size < 2) continue;
          const ps = [];
          for (const [id, p] of room.peers) {
            if (!p.observer) ps.push([id, ...p.s]);
          }
          if (!ps.length) continue;
          broadcast(room, -1, { op: 'states', ps });
        }
      },

      stop() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        saveSmp();
        rooms.clear();
        peerRoom.clear();
      },
    };
  },
};
