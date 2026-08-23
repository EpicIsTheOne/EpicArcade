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
        if (msg.op === 'welcome' && !settled) {
          settled = true;
          clearTimeout(timer);
          this._onWelcome(msg);
          resolve(msg);
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
    this._retries = 0;
    this.status = 'online';
    this.onStatus(this.status);
    if (!this.remotes) this.remotes = new RemotePlayers(this.scene);
    for (const p of (m.players || [])) this.remotes.add(p[0], p[1], p.slice(2));
    this.onToast(`Online in '${m.room}' — ${this.remotes.count()} other player${this.remotes.count() === 1 ? '' : 's'} here`);
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
      case 'chat':
        this.onChat({ kind: 'chat', name: m.name, text: m.text });
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
    if (w.getChunk(x >> 4, z >> 4)) {
      w.setBlock(x, y, z, bid, face !== undefined ? { face } : {});
    } else {
      // chunk not streamed yet — record so generation bakes it in
      const k = (x >> 4) + ',' + (z >> 4);
      let em = w.edits.get(k);
      if (!em) { em = new Map(); w.edits.set(k, em); }
      em.set((y << 8) | ((z & 15) << 4) | (x & 15), (bid & 255) + ((face & 3) << 8));
    }
  }

  get connected() { return this.status === 'online' && this.ws && this.ws.readyState === 1; }

  attachWorld(world) { this.world = world; }

  peerCount() { return this.remotes ? this.remotes.count() : 0; }

  sendState(p, yaw, pitch) {
    this._lastState = [p.x, p.y, p.z, yaw, pitch];
  }

  sendBlock(x, y, z, bid, face = 0) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ op: 'block', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), b: bid & 255, f: face & 3 }));
  }

  sendChat(text) {
    if (!this.connected) return false;
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t) return false;
    this.ws.send(JSON.stringify({ op: 'chat', text: t }));
    return true;
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
