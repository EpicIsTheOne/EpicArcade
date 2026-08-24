// Lumencraft multiplayer backend for ox-live (see ox-live/README.md).
// Regular rooms are ephemeral (seed + edit log + peer states, in memory).
// The site SMP room ('SMP') is a persistent shared world: seed + edit log
// survive process restarts via a debounced JSON store.
// ESM + stdlib only, per the platform contract.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SMP_ROOM = 'SMP';
const SMP_SEED = 'site-smp';
const SMP_MAX_EDITS = 200000;
const SMP_MAX_PEERS = 32;
const ROOM_MAX_PEERS = 15;
const MAX_EDITS = 50000;
const NAME_RE = /[^\x20-\x7e]/g;

function smpStorePath() {
  return process.env.SMP_STORE ||
    fileURLToPath(new URL('../../../../smp-world.json', import.meta.url));
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

export default {
  maxSockets: 96,
  tickMs: 100,
  create(ctx) {
    const rooms = new Map();     // code -> room
    const peerRoom = new Map();  // ws.id -> code

    // ---- SMP persistence ----
    let smpLoaded = null;        // {seed, t0, edits: Map} from disk (once)
    let saveTimer = null;
    let smpDirty = false;

    function loadSmp() {
      if (smpLoaded) return smpLoaded;
      smpLoaded = { seed: SMP_SEED, t0: Date.now(), edits: new Map() };
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
      };
      for (const [k, v] of edits) {
        const [x, y, z] = k.split(',').map(Number);
        out.edits.push([x, y, z, v[0], v[1]]);
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
            peers: new Map(),
          };
        } else {
          room = {
            code,
            seed: seedReq || ('mp-' + code.toLowerCase()),
            t0: Date.now(),
            edits: new Map(),
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
        if (id === exceptId) continue;
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
          const wantSmp = cleanRoom(msg.room) === SMP_ROOM;
          const room = getRoom(cleanRoom(msg.room), cleanSeed(msg.seed));
          const cap = room.smp ? SMP_MAX_PEERS : ROOM_MAX_PEERS;
          if (room.peers.size >= cap) {
            ws.send({ op: 'denied', reason: room.smp ? 'SMP world full' : 'room full' });
            return;
          }
          const name = cleanName(msg.name, 'Player' + ws.id);
          const peer = { name, s: [0.5, -100, 0.5, 0, 0], ws, blockT: [], chatT: [] };
          room.peers.set(ws.id, peer);
          peerRoom.set(ws.id, room.code);

          // SMP: suggest spawning next to an existing player
          let spawnNear = null;
          if (room.smp) {
            const candidates = [...room.peers.values()].filter((p) => p.s[1] > 0);
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
          ws.send({
            op: 'welcome', you: ws.id, room: room.code, seed: room.seed,
            t0: room.t0, now: Date.now(), players: playerList(room, ws.id), edits,
            smp: !!room.smp, spawnNear,
          });
          broadcast(room, ws.id, { op: 'joined', id: ws.id, name, s: peer.s });
          ctx.log(`room ${room.code}: ${name} joined (${room.peers.size} online)`);
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
        broadcast(room, ws.id, { op: 'left', id: ws.id });
        if (peer) ctx.log(`room ${code}: ${peer.name} left (${room.peers.size} online)`);
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
          for (const [id, p] of room.peers) ps.push([id, ...p.s]);
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
