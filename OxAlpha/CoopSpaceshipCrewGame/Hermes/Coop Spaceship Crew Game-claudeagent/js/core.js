/* ORION RUN — core: utils, audio synth, network link (plain script, file:// safe) */
'use strict';
window.OR = window.OR || {};

OR.util = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
  fmtT(s) { s = Math.max(0, Math.ceil(s)); const m = (s / 60) | 0; return m + ':' + String(s % 60).padStart(2, '0'); },
  esc(s) { return String(s).replace(/[<>&]/g, ''); },
  uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); },
};

/* ---------------- persistent player identity ---------------- */
OR.identity = {
  get() {
    try {
      let d = JSON.parse(localStorage.getItem('orion.pid') || 'null');
      if (!d || !d.pid) throw 0;
      return d;
    } catch {
      const d = { pid: OR.util.uid(), name: '', ci: ((Math.random() * 4) | 0) };
      this.save(d);
      return d;
    }
  },
  save(d) { try { localStorage.setItem('orion.pid', JSON.stringify(d)); } catch { } },
};

/* ---------------- audio (WebAudio, gesture-gated) ---------------- */
OR.Audio = class {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.alarmN = 0;
    this._alarmAcc = 0;
    try { this.muted = localStorage.getItem('orion.mute') === '1'; } catch { }
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    return true;
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('orion.mute', m ? '1' : '0'); } catch { }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone(f0, f1, dur, type = 'square', vol = 0.2, delay = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.25, lp = 1200, delay = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  play(name) {
    switch (name) {
      case 'ui': this.tone(660, 660, 0.05, 'square', 0.08); break;
      case 'console': this.tone(520, 780, 0.09, 'triangle', 0.14); break;
      case 'laser': this.tone(1400, 300, 0.12, 'sawtooth', 0.12); break;
      case 'eshot': this.tone(340, 180, 0.16, 'sawtooth', 0.10); break;
      case 'thit': this.noise(0.08, 0.18, 2600); this.tone(200, 90, 0.1, 'square', 0.1); break;
      case 'shieldhit': this.tone(900, 500, 0.14, 'sine', 0.16); break;
      case 'hit': this.noise(0.22, 0.3, 700); this.tone(140, 60, 0.2, 'square', 0.16); break;
      case 'boom': this.noise(0.5, 0.35, 420); this.tone(110, 40, 0.45, 'sawtooth', 0.2); break;
      case 'fix': this.tone(500, 900, 0.1, 'triangle', 0.14); this.tone(700, 1200, 0.1, 'triangle', 0.12, 0.09); break;
      case 'ready': this.tone(880, 880, 0.09, 'sine', 0.16); this.tone(1320, 1320, 0.12, 'sine', 0.14, 0.1); break;
      case 'jump': this.tone(160, 1500, 0.7, 'sine', 0.2); this.noise(0.5, 0.12, 2400); break;
      case 'alarm': /* handled by loop tick */ break;
      case 'down': this.tone(400, 120, 0.4, 'sawtooth', 0.16); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.18, i * 0.13)); break;
      case 'lose': [400, 320, 240, 150].forEach((f, i) => this.tone(f, f * 0.92, 0.26, 'sawtooth', 0.16, i * 0.17)); break;
    }
  }
  // Klaxon while emergencies active
  setAlarms(n) {
    this.alarmN = n > 0;
  }
  update(dt) {
    if (!this.ctx || !this.alarmN) return;
    this._alarmAcc += dt;
    if (this._alarmAcc >= 1.15) {
      this._alarmAcc = 0;
      this.tone(950, 640, 0.28, 'square', 0.07);
    }
  }
};

/* ---------------- network link (auto-reconnect w/ backoff) ---------------- */
const WS_SLUG = 'coop-spaceship-crew-game';
OR.wsUrl = function () {
  // Same-origin/subpath-safe per platform contract.
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/' + WS_SLUG;
};

OR.Net = class {
  constructor(handlers) {
    this.h = handlers;            // {onMessage(obj), onStatus(state, detail)}
    this.ws = null;
    this.want = false;
    this.attempt = 0;
    this.timer = null;
    this.queue = [];
    this.state = 'idle';
  }
  connect() {
    this.want = true;
    this._open();
  }
  _setStatus(s, d) { this.state = s; this.h.onStatus && this.h.onStatus(s, d); }
  _open() {
    clearTimeout(this.timer);
    let url;
    try { url = OR.wsUrl(); } catch { url = null; }
    if (!url || !window.WebSocket) { this._setStatus('unavailable'); return; }
    this._setStatus(this.attempt ? 'reconnecting' : 'connecting');
    let ws;
    try { ws = new WebSocket(url); } catch { this._retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.attempt = 0; this.queue.splice(0).forEach(o => this.send(o)); this._setStatus('online'); };
    ws.onmessage = e => {
      let obj; try { obj = JSON.parse(e.data); } catch { return; }
      this.h.onMessage && this.h.onMessage(obj);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.want) this._retry(); else this._setStatus('idle');
    };
    ws.onerror = () => { try { ws.close(); } catch { } };
  }
  _retry() {
    const delay = Math.min(8000, 400 * Math.pow(1.7, Math.min(8, this.attempt++)));
    this._setStatus('reconnecting', Math.round(delay / 100) / 10);
    this.timer = setTimeout(() => this._open(), delay);
  }
  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch { }
    } else if (this.queue.length < 30) {
      this.queue.push(obj);
    }
  }
  close() {
    this.want = false;
    clearTimeout(this.timer);
    if (this.ws) { try { this.ws.close(); } catch { } this.ws = null; }
    this.queue.length = 0;
    this._setStatus('idle');
  }
};
