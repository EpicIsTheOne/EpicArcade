'use strict';
/* GRAYLINE — Night Shift :: WebAudio synth engine (all sounds procedural) */
window.G = window.G || {};

G.Audio = class {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('grayline_mute') === '1';
    this.buzz = { L: null, R: null };
    this.heartTimer = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.ratio.value = 6;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.noiseBuf = this._makeNoise();
    this._ambience();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('grayline_mute', this.muted ? '1' : '0');
    this.applyGain();
    return this.muted;
  }

  vol() {
    const v = parseFloat(localStorage.getItem('grayline_vol'));
    return isNaN(v) ? 0.9 : v;
  }

  setVol(v) {
    localStorage.setItem('grayline_vol', String(v));
    this.applyGain();
  }

  applyGain() {
    if (!this.ctx) return;
    const target = this.muted ? 0 : this.vol();
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  _makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  _noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = loop;
    return s;
  }

  _env(gainVal, attack, decay, t0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainVal, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  _pan(p) {
    if (!this.ctx.createStereoPanner) return null;
    const n = this.ctx.createStereoPanner();
    n.pan.value = G.clamp(p, -1, 1);
    return n;
  }

  _out(node, pan) {
    let tail = node;
    if (pan !== undefined) {
      const pn = this._pan(pan);
      if (pn) { tail.connect(pn); tail = pn; }
    }
    tail.connect(this.master);
  }

  _ambience() {
    const c = this.ctx;
    // room tone: filtered brown noise
    const src = this._noiseSrc(true);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.4;
    this.roomGain = c.createGain(); this.roomGain.gain.value = 0.055;
    src.connect(lp); lp.connect(this.roomGain); this.roomGain.connect(this.master);
    src.start();
    // electrical hum
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 110;
    const hg = c.createGain(); hg.gain.value = 0.010;
    const hg2 = c.createGain(); hg2.gain.value = 0.004;
    o1.connect(hg); hg.connect(this.master); o2.connect(hg2); hg2.connect(this.master);
    o1.start(); o2.start();
    this.humNodes = [o1, o2, hg, hg2];
  }

  /* duck ambience (power out / jumpscare) */
  ambienceLevel(v) {
    if (!this.ctx) return;
    this.roomGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
    for (const h of this.humNodes.slice(2)) h.gain.setTargetAtTime(v * 0.35, this.ctx.currentTime, 0.3);
  }

  /* ---------- one-shots ---------- */

  footstep(side, near) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const pan = side === 'L' ? -0.7 : 0.7;
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.22;
      const s = this._noiseSrc();
      const bp = c.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 140 - i * 30; bp.Q.value = 1.2;
      const g = this._env(near ? 0.5 : 0.16 + Math.random() * 0.06, 0.008, 0.18, t);
      const ping = c.createOscillator(); ping.type = 'triangle';
      ping.frequency.setValueAtTime(G.rand(900, 1400), t);
      ping.frequency.exponentialRampToValueAtTime(300, t + 0.09);
      const pg = this._env(near ? 0.10 : 0.03, 0.002, 0.08, t);
      s.connect(bp); bp.connect(g); ping.connect(pg);
      this._out(g, pan); this._out(pg, pan);
      s.start(t); s.stop(t + 0.25); ping.start(t); ping.stop(t + 0.12);
    }
  }

  skitter(pan) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    for (let i = 0; i < 7; i++) {
      const t = t0 + i * G.rand(0.03, 0.07);
      const s = this._noiseSrc();
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const g = this._env(0.08, 0.001, 0.04, t);
      s.connect(hp); hp.connect(g); this._out(g, pan);
      s.start(t); s.stop(t + 0.06);
    }
  }

  doorSlam() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.14);
    const g = this._env(0.85, 0.004, 0.32, t0);
    o.connect(g); this._out(g);
    o.start(t0); o.stop(t0 + 0.4);
    const s = this._noiseSrc();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = this._env(0.3, 0.002, 0.12, t0);
    s.connect(lp); lp.connect(ng); this._out(ng);
    s.start(t0); s.stop(t0 + 0.2);
  }

  doorOpen() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = this._noiseSrc();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.14, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    s.connect(bp); bp.connect(g); this._out(g);
    s.start(t0); s.stop(t0 + 0.5);
  }

  camFlip(up) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(up ? 220 : 180, t0);
    o.frequency.exponentialRampToValueAtTime(up ? 90 : 320, t0 + 0.08);
    const g = this._env(0.10, 0.003, 0.1, t0);
    o.connect(g); this._out(g);
    o.start(t0); o.stop(t0 + 0.15);
    this.staticBlip(0.06);
  }

  staticBlip(vol = 0.12) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = this._noiseSrc();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = this._env(vol, 0.004, 0.14, t0);
    s.connect(hp); hp.connect(g); this._out(g);
    s.start(t0); s.stop(t0 + 0.2);
  }

  seizureBurst() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = this._noiseSrc();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.28, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
    s.connect(bp); bp.connect(g); this._out(g);
    s.start(t0); s.stop(t0 + 0.6);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(2400, t0);
    o.frequency.exponentialRampToValueAtTime(120, t0 + 0.4);
    const og = this._env(0.06, 0.01, 0.4, t0);
    o.connect(og); this._out(og);
    o.start(t0); o.stop(t0 + 0.5);
  }

  knock(pan = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.26;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
      const g = this._env(0.4, 0.004, 0.16, t);
      o.connect(g); this._out(g, pan);
      o.start(t); o.stop(t + 0.2);
    }
  }

  breath(dur = 3) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = this._noiseSrc(true);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 1.6;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.42;
    const lg = c.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(bp.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.11, t0 + 0.5);
    g.gain.setValueAtTime(0.11, t0 + dur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp); bp.connect(g); this._out(g);
    s.start(t0); s.stop(t0 + dur);
    lfo.start(t0); lfo.stop(t0 + dur);
  }

  lightBuzzStart(side) {
    if (!this.ctx || this.buzz[side]) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 118;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 236;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
    const g = c.createGain(); g.gain.value = 0.014;
    o.connect(f); o2.connect(f); f.connect(g);
    this._out(g, side === 'L' ? -0.8 : 0.8);
    o.start(); o2.start();
    this.buzz[side] = { o, o2, g };
  }

  lightBuzzStop(side) {
    const b = this.buzz[side];
    if (!b || !this.ctx) return;
    b.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
    setTimeout(() => { try { b.o.stop(); b.o2.stop(); } catch (e) {} }, 120);
    this.buzz[side] = null;
  }

  chime() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this._env(0.09, 0.01, 1.2, t0 + i * 0.35);
      o.connect(g); this._out(g);
      o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 1.3);
    });
  }

  hourBell() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 392;
    const g = this._env(0.07, 0.01, 0.9, t0);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 196;
    const g2 = this._env(0.05, 0.01, 1.1, t0);
    o.connect(g); o2.connect(g2); this._out(g); this._out(g2);
    o.start(t0); o.stop(t0 + 1.2); o2.start(t0); o2.stop(t0 + 1.3);
  }

  heartbeat() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    for (const [dt, v] of [[0, 0.5], [0.24, 0.34]]) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(64, t0 + dt);
      o.frequency.exponentialRampToValueAtTime(30, t0 + dt + 0.12);
      const g = this._env(v, 0.008, 0.16, t0 + dt);
      o.connect(g); this._out(g);
      o.start(t0 + dt); o.stop(t0 + dt + 0.3);
    }
  }

  rumble(dur = 3.2) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const s = this._noiseSrc();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(70, t0);
    lp.frequency.linearRampToValueAtTime(190, t0 + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(60, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.20, t0 + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    s.connect(lp); lp.connect(g); this._out(g);
    s.start(t0); s.stop(t0 + dur + 0.1);
  }

  scream() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    this.ambienceLevel(0);
    // noise blast
    const s = this._noiseSrc();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    const dist = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
    dist.curve = curve;
    const g = c.createGain();
    g.gain.setValueAtTime(0.75, t0);
    g.gain.setValueAtTime(0.75, t0 + 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.25);
    s.connect(hp); hp.connect(dist); dist.connect(g); this._out(g);
    s.start(t0); s.stop(t0 + 1.3);
    // detuned saw cluster diving
    for (const base of [620, 466, 311]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * G.rand(0.98, 1.02), t0);
      o.frequency.exponentialRampToValueAtTime(base * 0.28, t0 + 1.1);
      const vib = c.createOscillator(); vib.frequency.value = G.rand(9, 14);
      const vg = c.createGain(); vg.gain.value = base * 0.05;
      vib.connect(vg); vg.connect(o.frequency);
      const og = c.createGain();
      og.gain.setValueAtTime(0.16, t0);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
      const d2 = c.createWaveShaper();
      d2.curve = curve;
      o.connect(d2); d2.connect(og); this._out(og);
      o.start(t0); o.stop(t0 + 1.25); vib.start(t0); vib.stop(t0 + 1.25);
    }
    // sub hit
    const sub = c.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(90, t0);
    sub.frequency.exponentialRampToValueAtTime(28, t0 + 0.9);
    const sg = this._env(0.7, 0.005, 1.0, t0);
    sub.connect(sg); this._out(sg);
    sub.start(t0); sub.stop(t0 + 1.1);
  }

  bells() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const seq = [523.25, 587.33, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      const t = t0 + i * 0.42;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.76;
      const g = this._env(0.14, 0.008, 1.6, t);
      const g2 = this._env(0.04, 0.008, 0.9, t);
      o.connect(g); o2.connect(g2); this._out(g); this._out(g2);
      o.start(t); o.stop(t + 1.7); o2.start(t); o2.stop(t + 1.0);
    });
  }

  typeTick() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = G.rand(1800, 2600);
    const g = this._env(0.015, 0.001, 0.02, t0);
    o.connect(g); this._out(g);
    o.start(t0); o.stop(t0 + 0.04);
  }

  beep(freq = 880, vol = 0.08) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = this._env(vol, 0.004, 0.12, t0);
    o.connect(g); this._out(g);
    o.start(t0); o.stop(t0 + 0.16);
  }
};

G.audio = new G.Audio();
