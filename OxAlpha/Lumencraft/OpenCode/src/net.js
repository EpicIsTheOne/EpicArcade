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

export class Net {
  /**
   * opts: { url, room, name, scene, world,
   *         onToast(msg), onChat(entry), onStatus(status) }
   */
  constructor(opts) {
    this.url = opts.url;
    this.room = String(opts.room || '').toUpperCase();
    this.myName = sanitizeName(opts.name, 'Player');
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
        ws.send(JSON.stringify({ op: 'join', room: this.room, name: this.myName }));
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
            try { ws.send(JSON.stringify({ op: 'join', room: this.room, name: this.myName })); } catch {}
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
    this.edits = Array.isArray(m.edits) ? m.edits : [];
    this.spawnNear = Array.isArray(m.spawnNear) ? m.spawnNear : null;
    this.isSmp = !!m.smp;
    this.claims = new Map();
    for (const c of (m.claims || [])) {
      if (Array.isArray(c) && c.length >= 3) this.claims.set(c[0] + ',' + c[1], String(c[2]));
    }
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
    if (this.remotes) {
      for (const id of [...this.remotes.map.keys()]) this.remotes.remove(id);
      for (const p of (m.players || [])) this.remotes.add(p[0], p[1], p.slice(2));
    }
    this.claims = new Map();
    for (const c of (m.claims || [])) {
      if (Array.isArray(c) && c.length >= 3) this.claims.set(c[0] + ',' + c[1], String(c[2]));
    }
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
    if (this.remotes) { this.remotes.dispose(); this.remotes = null; }
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
        break;
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
    if (this.remotes) this.remotes.update(dt);
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
