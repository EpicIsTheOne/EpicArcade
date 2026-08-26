// Multiplayer client: WebSocket transport for the ox-live backend.
// Rooms are per-world: everyone in a room shares a seed + a server-side edit
// log, sees each other as avatars, and gets block edits relayed live.
import { RemotePlayers } from './remotes.js';

export const DAY_MS = 600000;   // matches DAY_LENGTH seconds
const BASE_DAY = 0.28;          // day fraction a fresh room starts at

export function resolveWsUrl() {
  try {
    const q = new URLSearchParams(location.search).get('ws');
    if (q) return q;
    const ls = localStorage.getItem('lumencraft_ws');
    if (ls) return ls;
  } catch {}
  const secure = location.protocol === 'https:';
  return (secure ? 'wss://' : 'ws://') + location.host + '/ws/lumencraft';
}

function sanitizeName(raw, fallback) {
  let n = String(raw ?? '').replace(/[\x00-\x20\x7f]/g, ' ').trim().slice(0, 16);
  return n || fallback;
}

// sparse wire slots [[idx,id,count,dur?],...] -> {type:'chest', slots: Array(27)}
function chestWireToContainer(slots) {
  if (!Array.isArray(slots) || slots.length > 27) return null;
  const out = { type: 'chest', slots: new Array(27).fill(null) };
  for (const s of slots) {
    if (!Array.isArray(s) || s.length < 3) continue;
    const [idx, id, count, dur] = s;
    if (!Number.isInteger(idx) || idx < 0 || idx > 26) continue;
    out.slots[idx] = { id, count, dur: dur === undefined || dur === -1 ? undefined : dur };
  }
  return out;
}

// full 27-slot container -> sparse wire
function containerToChestWire(slots) {
  const out = [];
  for (let i = 0; i < slots.length && i < 27; i++) {
    const s = slots[i];
    if (!s) continue;
    out.push(s.dur === undefined ? [i, s.id, s.count] : [i, s.id, s.count, s.dur]);
  }
  return out;
}

export class Net {
  /**
   * opts: { url, room, name, scene, world,
   *         onToast(msg), onChat(entry), onStatus(status) }
   */
  constructor(opts) {
    this.url = opts.url;
    this.room = String(opts.room || '').toUpperCase();
    this.myName = sanitizeName(opts.name, 'Player');
    this.pin = String(opts.pin || '').slice(0, 16);
    this.scene = opts.scene;
    this.world = null;
    this.onToast = opts.onToast || (() => {});
    this.onChat = opts.onChat || (() => {});
    this.onStatus = opts.onStatus || (() => {});

    this.ws = null;
    this.status = 'connecting';   // connecting | online | offline | error
    this.you = null;
    this.seed = null;
    this.t0 = 0;
    this.clockOffset = 0;
    this.edits = [];              // [[x,y,z,id,face]...] applied at world boot
    this.spawnNear = null;        // [x,z] suggested spawn (SMP)
    this.isSmp = false;
    this.claims = new Map();      // "cx,cz" -> owner (SMP)
    this._localEdits = new Map(); // "x,y,z" -> prevId for deny-revert (cap 256)
    this.containers = [];         // welcome snapshot: [[x,y,z,slots]...]
    this.signs = new Map();       // "x,y,z" -> {text, owner}
    this.onSignsReset = null;     // (entries[[x,y,z,owner,text]...]) — bulk replace
    this.onSign = null;           // ({x,y,z,text,owner}|{x,y,z,text:null}) — live update
    this.hostId = null;           // shared-mob authority (peer id or null)
    this.onHost = null;           // (hostId) — host changed (incl. "me")
    this.onMobs = null;           // (ms) — mirrored mob snapshot
    this.onMobHit = null;         // ({id,dmg,kx,kz,by}) — routed to the host only
    this.onMobDie = null;         // ({id,killer}) — mob death broadcast
    this.onDrops = null;          // (ds) — mirrored item-drop snapshot
    this.onTaken = null;          // ({did,by}) — a pickup was granted
    this.onDrop = null;           // ({did,id,count,x,y,z,vx,vy,vz,by}) — mirror injection, host only
    this.onTake = null;           // ({did,tx,ty,tz,by}) — pickup claim, host arbitrates
    this.ui = null;               // attached for chest poll sync
    this._chestWire = new Map();  // "x,y,z" -> last sent JSON (dedup)
    this._chestPollT = 0;
    this.remotes = null;          // created once we have the scene + welcome
    this._welcomeResolvers = [];
    this._retries = 0;
    this._sendT = 0;
    this._lastState = [0, -100, 0, 0, 0];
    this._closedForGood = false;
  }

  connect() {
    if (this._closedForGood) return Promise.reject(new Error('disposed'));
    this.status = 'connecting';
    this.onStatus(this.status);
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        this.status = 'error';
        this.onStatus(this.status);
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error('connect timeout')), 8000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: 'join', room: this.room, name: this.myName, pin: this.pin || undefined }));
      };
      ws.onerror = () => { clearTimeout(timer); fail(new Error('websocket error')); };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) { fail(new Error('closed before welcome')); return; }
        this._dropped();
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!msg || typeof msg.op !== 'string') return;
        if (msg.op === 'denied') {
          clearTimeout(timer);
          this.onToast('Multiplayer: ' + (msg.reason || 'rejected'));
          fail(new Error(msg.reason || 'denied'));
          return;
        }
        if (msg.op === 'welcome') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this._onWelcome(msg);
            resolve(msg);
          } else {
            this._rewelcome(msg);
          }
          return;
        }
        if (msg.op === 'rejoin') {
          // handler swap under a live socket — re-join with the same identity
          if (this.you !== null && this.ws === ws && ws.readyState === 1) {
            try { ws.send(JSON.stringify({ op: 'join', room: this.room, name: this.myName, pin: this.pin || undefined })); } catch {}
          }
          return;
        }
        this._onMsg(msg);
      };
    });
  }

  _onWelcome(m) {
    this.you = m.you;
    this.seed = m.seed;
    this.room = m.room;
    this.t0 = m.t0;
    this.clockOffset = m.now - Date.now();
    this.hostId = Number.isInteger(m.host) ? m.host : null;
    this.edits = Array.isArray(m.edits) ? m.edits : [];
    this.spawnNear = Array.isArray(m.spawnNear) ? m.spawnNear : null;
    this.isSmp = !!m.smp;
    this.claims = new Map();
    for (const c of (m.claims || [])) {
      if (Array.isArray(c) && c.length >= 3) this.claims.set(c[0] + ',' + c[1], String(c[2]));
    }
    this.signs = new Map();
    const signEntries = Array.isArray(m.signs) ? m.signs : [];
    for (const s of signEntries) {
      if (Array.isArray(s) && s.length >= 5) this.signs.set(s[0] + ',' + s[1] + ',' + s[2], { text: s[4], owner: s[3] });
    }
    this.onSignsReset?.(signEntries);
    this._retries = 0;
    this.status = 'online';
    this.onStatus(this.status);
    if (!this.remotes) this.remotes = new RemotePlayers(this.scene);
    for (const p of (m.players || [])) this.remotes.add(p[0], p[1], p.slice(2));
    const where = this.isSmp ? 'the site SMP world' : `'${m.room}'`;
    this.onToast(`Online in ${where} — ${this.remotes.count()} other player${this.remotes.count() === 1 ? '' : 's'} here`);
  }

  /** server swapped handlers under us and we re-joined: resync everything */
  _rewelcome(m) {
    this.you = m.you;
    this.t0 = m.t0;
    this.clockOffset = m.now - Date.now();
    this.hostId = Number.isInteger(m.host) ? m.host : null;
    this.onHost?.(this.hostId);
    if (this.remotes) {
      for (const id of [...this.remotes.map.keys()]) this.remotes.remove(id);
      for (const p of (m.players || [])) this.remotes.add(p[0], p[1], p.slice(2));
    }
    this.claims = new Map();
    for (const c of (m.claims || [])) {
      if (Array.isArray(c) && c.length >= 3) this.claims.set(c[0] + ',' + c[1], String(c[2]));
    }
    this.containers = Array.isArray(m.containers) ? m.containers : [];
    this.signs = new Map();
    for (const s of (m.signs || [])) {
      if (Array.isArray(s) && s.length >= 5) this.signs.set(s[0] + ',' + s[1] + ',' + s[2], { text: s[4], owner: s[3] });
    }
    this.onSignsReset?.(m.signs || []);
    this._applyContainers();
    this._chestWire.clear();
    // bake any edits that landed while we were desynced; visible ones apply live
    const w = this.world;
    if (w && Array.isArray(m.edits)) {
      for (const e of m.edits) {
        if (!Array.isArray(e) || e.length < 4) continue;
        const [x, y, z] = e;
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || y < 0 || y >= 128) continue;
        const bid = e[3] & 255, face = (e[4] | 0) & 3;
        if (w.getChunk(x >> 4, z >> 4)) w.setBlock(x, y, z, bid, { face });
        else {
          const k = (x >> 4) + ',' + (z >> 4);
          let em = w.edits.get(k);
          if (!em) { em = new Map(); w.edits.set(k, em); }
          em.set((y << 8) | ((z & 15) << 4) | (x & 15), (bid & 255) + ((face & 3) << 8));
        }
      }
    }
    this.onChat({ kind: 'sys', text: 'Resynced with the server' });
    this.onToast('Rejoined the world');
  }

  _dropped() {
    if (this._closedForGood) return;
    this.status = 'offline';
    this.onStatus(this.status);
    this.hostId = null;
    if (this.remotes) { this.remotes.dispose(); this.remotes = null; }
    this.onHost?.(null);
    if (this._retries >= 5) {
      this.status = 'error';
      this.onStatus(this.status);
      this.onToast('Multiplayer connection lost.');
      return;
    }
    const delay = Math.min(8000, 600 * Math.pow(2, this._retries++));
    this.onToast(`Connection lost — retrying in ${Math.round(delay / 1000)}s…`);
    setTimeout(() => { this.connect().catch(() => {}); }, delay);
  }

  _onMsg(m) {
    switch (m.op) {
      case 'joined':
        if (this.remotes && m.id !== this.you) {
          this.remotes.add(m.id, m.name, m.s || [0, -100, 0, 0, 0]);
          this.onChat({ kind: 'sys', text: `${m.name} joined the world` });
        }
        break;
      case 'left':
        if (this.remotes && this.remotes.has(m.id)) {
          const r = this.remotes.get(m.id);
          this.onChat({ kind: 'sys', text: `${r.name} left the world` });
          this.remotes.remove(m.id);
        }
        break;
      case 'states':
        if (!this.remotes) break;
        for (const s of m.ps) {
          const id = s[0];
          if (id === this.you) continue;
          if (!this.remotes.has(id)) this.remotes.add(id, '?' + id, s.slice(1));
          else this.remotes.setState(id, s.slice(1));
        }
        break;
      case 'block':
        this._applyBlock(m.x, m.y, m.z, m.b, m.f | 0);
        if (m.b === 0 && this.world) {
          const bk = m.x + ',' + m.y + ',' + m.z;
          this.world.containers.delete(bk);
          this._chestWire.delete(bk);
          if (this.signs.has(bk)) {
            this.signs.delete(bk);
            this.onSign?.({ x: m.x, y: m.y, z: m.z, text: null, owner: null });
          }
        }
        break;
      case 'sign': {
        const sk = m.x + ',' + m.y + ',' + m.z;
        this.signs.set(sk, { text: m.text, owner: m.owner });
        this.onSign?.({ x: m.x, y: m.y, z: m.z, text: m.text, owner: m.owner });
        break;
      }
      case 'deny': {
        // server rejected an edit we applied optimistically — revert it
        const key = m.x + ',' + m.y + ',' + m.z;
        if (this._localEdits.has(key) && this.world) {
          const prev = this._localEdits.get(key);
          this._localEdits.delete(key);
          if (this.world.getChunk(m.x >> 4, m.z >> 4)) {
            this.world.setBlock(m.x, m.y, m.z, prev);
          }
        }
        this.onToast(m.reason ? `${m.owner}: ${m.reason}` : `Protected by ${m.owner || 'a claim'}`);
        break;
      }
      case 'claim': {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          this.claims.set((m.cx + dx) + ',' + (m.cz + dz), String(m.owner));
        }
        this.onChat({ kind: 'sys', text: `${m.owner} claimed land near ${m.cx * 16}, ${m.cz * 16}` });
        break;
      }
      case 'unclaim': {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          this.claims.delete((m.cx + dx) + ',' + (m.cz + dz));
        }
        break;
      }
      case 'chest': {
        if (!this.world) break;
        const key = m.x + ',' + m.y + ',' + m.z;
        const cont = chestWireToContainer(m.slots);
        if (!cont) break;
        this.world.containers.set(key, cont);
        this._chestWire.set(key, JSON.stringify(m.slots));
        if (this.ui && this.ui.currentContainerKey === key) this.ui.refreshOpenWindow();
        break;
      }
      case 'host':
        this.hostId = Number.isInteger(m.id) ? m.id : null;
        this.onHost?.(this.hostId);
        break;
      case 'mobs':
        this.onMobs?.(m.ms);
        break;
      case 'mobhit':
        this.onMobHit?.(m);
        break;
      case 'mobdie':
        this.onMobDie?.(m);
        break;
      case 'drops':
        this.onDrops?.(m.ds);
        break;
      case 'drop':
        this.onDrop?.(m);
        break;
      case 'take':
        this.onTake?.(m);
        break;
      case 'taken':
        this.onTaken?.(m);
        break;
      case 'chat':
        this.onChat({ kind: 'chat', name: m.name, text: m.text });
        break;
      case 'sys':
        this.onChat({ kind: 'sys', text: String(m.text || '').slice(0, 140) });
        break;
      default:
        break;
    }
  }

  _applyBlock(x, y, z, bid, face) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    if (y < 0 || y >= 128) return;
    if (!(bid >= 0 && bid < 256)) return;
    if (Math.abs(x) > 1e6 || Math.abs(z) > 1e6) return;
    const w = this.world;
    if (!w) return;
    this._applyingRemote = true;
    try {
      if (w.getChunk(x >> 4, z >> 4)) {
        w.setBlock(x, y, z, bid, face !== undefined ? { face } : {});
      } else {
        // chunk not streamed yet — record so generation bakes it in
        const k = (x >> 4) + ',' + (z >> 4);
        let em = w.edits.get(k);
        if (!em) { em = new Map(); w.edits.set(k, em); }
        em.set((y << 8) | ((z & 15) << 4) | (x & 15), (bid & 255) + ((face & 3) << 8));
      }
    } finally {
      this._applyingRemote = false;
    }
  }

  get connected() { return this.status === 'online' && this.ws && this.ws.readyState === 1; }

  attachWorld(world) {
    this.world = world;
    // capture pre-edit block ids so a server deny can revert the optimistic
    // local apply precisely (interaction.js applies before it sends)
    const orig = world.setBlock.bind(world);
    world.setBlock = (x, y, z, id, opts) => {
      if (!this._applyingRemote && this.connected) {
        const key = x + ',' + y + ',' + z;
        this._localEdits.set(key, world.getBlockRaw(x, y, z));
        if (this._localEdits.size > 256) {
          this._localEdits.delete(this._localEdits.keys().next().value);
        }
      }
      return orig(x, y, z, id, opts);
    };
    this._applyContainers();
  }

  attachUi(ui) {
    this.ui = ui;
  }

  /** bake the welcome/rewelcome container snapshot into the world */
  _applyContainers() {
    if (!this.world || !Array.isArray(this.containers)) return;
    for (const c of this.containers) {
      if (!Array.isArray(c) || c.length < 4) continue;
      const [x, y, z] = c;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
      const cont = chestWireToContainer(c[3]);
      if (cont) this.world.containers.set(x + ',' + y + ',' + z, cont);
    }
  }

  peerCount() { return this.remotes ? this.remotes.count() : 0; }

  sendState(p, yaw, pitch) {
    this._lastState = [p.x, p.y, p.z, yaw, pitch];
  }

  sendBlock(x, y, z, bid, face = 0) {
    if (!this.connected) return;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    this.ws.send(JSON.stringify({ op: 'block', x: fx, y: fy, z: fz, b: bid & 255, f: face & 3 }));
  }

  claimOwnerAt(x, z) {
    return this.claims.get((x >> 4) + ',' + (z >> 4)) || null;
  }

  sendChat(text) {
    if (!this.connected) return false;
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t) return false;
    this.ws.send(JSON.stringify({ op: 'chat', text: t }));
    return true;
  }

  sendDied(cause) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ op: 'died', c: String(cause || '').slice(0, 16) }));
  }

  sendSign(x, y, z, text) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify({ op: 'sign', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), text: String(text || '').slice(0, 100) }));
    return true;
  }

  // ---- shared mobs (host-authoritative) ----
  sendMobs(ms) {
    if (!this.connected || !Array.isArray(ms)) return;
    this.ws.send(JSON.stringify({ op: 'mobs', ms }));
  }

  sendMobHit(id, dmg, kx, kz) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({
      op: 'mobhit', id: id | 0,
      dmg: Math.max(0.1, Math.min(20, +dmg || 1)),
      kx: Math.max(-3, Math.min(3, +kx || 0)),
      kz: Math.max(-3, Math.min(3, +kz || 0)),
    }));
  }

  sendMobDie(id, killer) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ op: 'mobdie', id: id | 0, killer: String(killer || '').slice(0, 16) }));
  }

  // ---- shared item drops ----
  sendDrops(ds) {
    if (!this.connected || !Array.isArray(ds)) return;
    this.ws.send(JSON.stringify({ op: 'drops', ds }));
  }

  sendInjectDrop(o) {
    if (!this.connected || !o) return;
    this.ws.send(JSON.stringify({
      op: 'drop', did: o.did, id: o.id, count: Math.max(1, Math.min(64, o.count | 0)),
      x: +(+o.x).toFixed(2), y: +(+o.y).toFixed(2), z: +(+o.z).toFixed(2),
      vx: (o.vx | 0) || undefined, vy: (o.vy | 0) || undefined, vz: (o.vz | 0) || undefined,
    }));
  }

  sendTake(did, tx, ty, tz) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ op: 'take', did, tx: +(tx).toFixed(2), ty: +(ty).toFixed(2), tz: +(tz).toFixed(2) }));
  }

  sendTaken(did, by) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ op: 'taken', did, by: String(by || '').slice(0, 16) }));
  }

  /** shared day fraction while online (else null → caller keeps local clock) */
  dayT() {
    if (!this.connected) return null;
    return ((BASE_DAY + ((Date.now() + this.clockOffset - this.t0) / DAY_MS)) % 1 + 1) % 1;
  }

  update(dt) {
    if (!this.connected) return;
    this._sendT -= dt;
    if (this._sendT <= 0) {
      this._sendT = 0.1;
      const s = this._lastState;
      const r = (v) => Math.round(v * 100) / 100;
      this.ws.send(JSON.stringify({ op: 'state', s: [r(s[0]), r(s[1]), r(s[2]), r(s[3]), r(s[4])] }));
    }
    this._pollChest(dt);
    if (this.remotes) this.remotes.update(dt);
  }

  /** while a chest window is open, push local changes to the server (0.5s poll) */
  _pollChest(dt) {
    if (!this.ui || !this.world) return;
    this._chestPollT -= dt;
    if (this._chestPollT > 0) return;
    this._chestPollT = 0.5;
    if (this.ui.extType !== 'chest' || !this.ui.currentContainerKey || this.ui.openWindow == null) return;
    const key = this.ui.currentContainerKey;
    const cont = this.world.containers.get(key);
    if (!cont || cont.type !== 'chest') return;
    const wire = containerToChestWire(cont.slots);
    const s = JSON.stringify(wire);
    if (this._chestWire.get(key) === s) return; // unchanged since last send
    this._chestWire.set(key, s);
    if (this._chestWire.size > 64) this._chestWire.delete(this._chestWire.keys().next().value);
    const [x, y, z] = key.split(',').map(Number);
    this.ws.send(JSON.stringify({ op: 'chest', x, y, z, slots: wire }));
  }

  dispose() {
    this._closedForGood = true;
    if (this.remotes) { this.remotes.dispose(); this.remotes = null; }
    if (this.ws) {
      try { this.ws.close(1000); } catch {}
      this.ws = null;
    }
    this.status = 'offline';
    this.onStatus(this.status);
  }
}
