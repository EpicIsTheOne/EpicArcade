// HYPERLINE audio — fully synthesized (no external assets)
import { clamp, randRange } from './utils.js';

class AudioSys {
  constructor() {
    this.ctx = null;
    this.ok = false;
    this.sfxVol = 0.85;
    this.musicVol = 0.7;
    this.coinChain = 0;
    this._lastCoinT = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain(); this.master.gain.value = 1;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 22;
    this.comp.ratio.value = 5; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.master.connect(this.comp); this.comp.connect(c.destination);

    this.busSfx = c.createGain(); this.busSfx.connect(this.master);
    this.busMusic = c.createGain(); this.busMusic.connect(this.master);
    this.setVolumes();

    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.ok = true;
    this.startMusic();
  }

  setVolumes() {
    if (!this.ctx) return;
    this.busSfx.gain.value = this.sfxVol * 0.9;
    this.busMusic.gain.value = this.musicVol * 0.34;
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _env(g, t0, a, peak, dec, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(end, 1e-4), t0 + a + dec);
  }

  _osc(type, f, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    return o;
  }

  _noise(filterType, freq, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    src.connect(f);
    return [src, f];
  }

  _out(node, t0, dur) {
    node.start(t0); node.stop(t0 + dur + 0.05);
  }

  // ---------------- SFX ----------------
  coin(chainT) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    if (t - this._lastCoinT > 1.2) this.coinChain = 0; else this.coinChain++;
    this._lastCoinT = t;
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const semi = steps[Math.min(this.coinChain, steps.length - 1)];
    const f = 660 * Math.pow(2, semi / 12);
    const o = this._osc('square', f), g = c.createGain(), o2 = this._osc('triangle', f * 2);
    const g2 = c.createGain();
    o.connect(g); o2.connect(g2); g.connect(this.busSfx); g2.connect(this.busSfx);
    this._env(g, t, 0.002, 0.16, 0.09);
    this._env(g2, t, 0.002, 0.05, 0.13);
    this._out(o, t, 0.15); this._out(o2, t, 0.18);
  }

  gem() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    [880, 1108, 1318, 1760].forEach((f, i) => {
      const o = this._osc('triangle', f), g = c.createGain();
      o.connect(g); g.connect(this.busSfx);
      this._env(g, t + i * 0.06, 0.004, 0.12, 0.3);
      this._out(o, t + i * 0.06, 0.36);
    });
  }

  jump() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = this._osc('sine', 300), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(700, t + 0.14);
    const [n, nf] = this._noise('bandpass', 1400, 1.4);
    nf.connect(g); o.connect(g); g.connect(this.busSfx);
    this._env(g, t, 0.004, 0.14, 0.16);
    this._out(o, t, 0.2); this._out(n, t, 0.2);
  }

  land(hard) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = this._osc('sine', hard ? 150 : 120), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(55, t + 0.11);
    o.connect(g); g.connect(this.busSfx);
    this._env(g, t, 0.003, hard ? 0.28 : 0.17, 0.13);
    this._out(o, t, 0.16);
    const [n, nf] = this._noise('lowpass', 500);
    const ng = c.createGain(); nf.connect(ng); ng.connect(this.busSfx);
    this._env(ng, t, 0.002, 0.08, 0.08);
    this._out(n, t, 0.1);
  }

  slide() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const [n, nf] = this._noise('lowpass', 900, 0.7);
    const g = c.createGain(); nf.connect(g); g.connect(this.busSfx);
    nf.frequency.setValueAtTime(1600, t);
    nf.frequency.exponentialRampToValueAtTime(350, t + 0.32);
    this._env(g, t, 0.01, 0.12, 0.34);
    this._out(n, t, 0.4);
  }

  swipe() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const [n, nf] = this._noise('bandpass', 2400, 2);
    const g = c.createGain(); nf.connect(g); g.connect(this.busSfx);
    nf.frequency.setValueAtTime(2600, t);
    nf.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    this._env(g, t, 0.002, 0.07, 0.1);
    this._out(n, t, 0.12);
  }

  stumble() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = this._osc('sawtooth', 180), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    o.connect(g); g.connect(this.busSfx); this._env(g, t, 0.003, 0.25, 0.25);
    this._out(o, t, 0.3);
    const [n, nf] = this._noise('highpass', 2000);
    const ng = c.createGain(); nf.connect(ng); ng.connect(this.busSfx);
    this._env(ng, t, 0.001, 0.12, 0.12);
    this._out(n, t, 0.14);
  }

  crash(big) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = this._osc('square', 130), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    o.connect(g); g.connect(this.busSfx); this._env(g, t, 0.004, big ? 0.4 : 0.3, 0.45);
    this._out(o, t, 0.5);
    // metal clang
    [520, 790, 1180].forEach((f, i) => {
      const oo = this._osc('triangle', f * randRange(0.96, 1.04)), gg = c.createGain();
      oo.connect(gg); gg.connect(this.busSfx);
      this._env(gg, t + 0.01 + i * 0.02, 0.002, 0.09, 0.35);
      this._out(oo, t, 0.45);
    });
    const [n, nf] = this._noise('lowpass', 800);
    const ng = c.createGain(); nf.connect(ng); ng.connect(this.busSfx);
    this._env(ng, t, 0.002, 0.22, 0.4);
    this._out(n, t, 0.5);
  }

  whistle() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = this._osc('sine', 2350), g = c.createGain();
      o.frequency.setValueAtTime(2350, t + k * 0.16);
      o.frequency.linearRampToValueAtTime(2650, t + k * 0.16 + 0.12);
      o.connect(g); g.connect(this.busSfx);
      this._env(g, t + k * 0.16, 0.01, 0.07, 0.13);
      this._out(o, t + k * 0.16, 0.16);
    }
  }

  horn() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    [233, 277].forEach(f => {
      const o = this._osc('sawtooth', f, randRange(-6, 6)), g = c.createGain(), fl = c.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 900;
      o.connect(fl); fl.connect(g); g.connect(this.busSfx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.05);
      g.gain.setValueAtTime(0.11, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      this._out(o, t, 0.8);
    });
  }

  powerup(kind = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const roots = [[523, 659, 784], [587, 740, 880]][kind % 2];
    roots.forEach((f, i) => {
      const o = this._osc('square', f), g = c.createGain();
      o.connect(g); g.connect(this.busSfx);
      this._env(g, t + i * 0.07, 0.004, 0.1, 0.22);
      this._out(o, t + i * 0.07, 0.26);
    });
    const o2 = this._osc('sine', roots[2] * 2), g2 = c.createGain();
    o2.connect(g2); g2.connect(this.busSfx);
    this._env(g2, t + 0.21, 0.004, 0.08, 0.4);
    this._out(o2, t, 0.65);
  }

  powerEnd() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    [700, 520].forEach((f, i) => {
      const o = this._osc('square', f), g = c.createGain();
      o.connect(g); g.connect(this.busSfx);
      this._env(g, t + i * 0.09, 0.004, 0.07, 0.12);
      this._out(o, t + i * 0.09, 0.14);
    });
  }

  ui() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = this._osc('sine', 900), g = c.createGain();
    o.connect(g); g.connect(this.busSfx);
    this._env(g, t, 0.001, 0.08, 0.05);
    this._out(o, t, 0.07);
  }

  boardOn() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = this._osc('sawtooth', 160), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3;
    o.connect(f); f.connect(g); g.connect(this.busSfx);
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
    this._env(g, t, 0.01, 0.14, 0.4);
    this._out(o, t, 0.45);
  }

  shatter() {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const [n, nf] = this._noise('highpass', 2500);
    const g = c.createGain(); nf.connect(g); g.connect(this.busSfx);
    this._env(g, t, 0.002, 0.2, 0.3);
    this._out(n, t, 0.32);
    [1800, 2600, 3400].forEach((f, i) => {
      const o = this._osc('triangle', f), gg = c.createGain();
      o.connect(gg); gg.connect(this.busSfx);
      this._env(gg, t + i * 0.03, 0.001, 0.06, 0.18);
      this._out(o, t, 0.25);
    });
  }

  countGo(last) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const f = last ? 1046 : 523;
    const o = this._osc('square', f), g = c.createGain();
    o.connect(g); g.connect(this.busSfx);
    this._env(g, t, 0.003, 0.12, last ? 0.5 : 0.18);
    this._out(o, t, 0.55);
  }

  // ---------------- ambience: train rumble ----------------
  startAmbience() {
    if (!this.ok || this.rumble) return;
    const c = this.ctx;
    const [n, nf] = this._noise('lowpass', 220, 0.4);
    const g = c.createGain(); g.gain.value = 0;
    n.connect(nf); nf.connect(g); g.connect(this.busSfx);
    this._out(n, c.currentTime, 999999);
    // slow LFO wobble
    const lfo = this._osc('sine', 0.7), lg = c.createGain();
    lfo.frequency.value = 0.7; lg.gain.value = 60;
    lfo.connect(lg); lg.connect(nf.frequency); lfo.start();
    this.rumble = g;
  }
  setRumble(v) { if (this.rumble) this.rumble.gain.value = clamp(v, 0, 0.16); }

  // ---------------- generative music ----------------
  startMusic() {
    if (this.musicTimer) return;
    const c = this.ctx;
    this.music = {
      bpm: 112,
      step: 0,
      nextT: c.currentTime + 0.1,
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G (midi)
      pent: [69, 72, 74, 76, 79, 81],
    };
    this.musicTimer = setInterval(() => this._schedMusic(), 40);
  }

  setMusicIntensity(speedNorm) {
    if (this.music) this.music.bpm = 112 + speedNorm * 22;
  }

  _midi(f) { return 440 * Math.pow(2, (f - 69) / 12); }

  _note(type, midiF, t0, dur, vol, dest) {
    const o = this._osc(type, this._midi(midiF)), g = this.ctx.createGain();
    const fl = this.ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 2100;
    o.connect(fl); fl.connect(g); g.connect(dest || this.busMusic);
    this._env(g, t0, 0.012, vol, dur);
    this._out(o, t0, dur + 0.1);
  }

  _hat(t0, vol) {
    const [n, nf] = this._noise('highpass', 6500);
    const g = this.ctx.createGain();
    nf.connect(g); g.connect(this.busMusic);
    this._env(g, t0, 0.001, vol, 0.045);
    this._out(n, t0, 0.07);
  }

  _kick(t0) {
    const o = this._osc('sine', 130), g = this.ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
    o.connect(g); g.connect(this.busMusic);
    this._env(g, t0, 0.003, 0.5, 0.14);
    this._out(o, t0, 0.2);
  }

  _schedMusic() {
    const m = this.music; if (!m || !this.ok) return;
    const c = this.ctx;
    while (m.nextT < c.currentTime + 0.14) {
      const t = m.nextT, s = m.step;
      const bar = Math.floor(s / 8) % 4;
      const chord = m.chords[bar];
      const spb = 60 / m.bpm / 2;   // 8th notes
      if (s % 8 === 0) {
        // pad
        chord.forEach(n => {
          const o1 = this._osc('sawtooth', this._midi(n - 12), -7);
          const o2 = this._osc('sawtooth', this._midi(n - 12), 7);
          const g = c.createGain(), fl = c.createBiquadFilter();
          fl.type = 'lowpass'; fl.frequency.value = 750;
          o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.busMusic);
          this._env(g, t, 0.25, 0.045, spb * 8);
          this._out(o1, t, spb * 8 + 0.3); this._out(o2, t, spb * 8 + 0.3);
        });
        this._kick(t);
      }
      if (s % 8 === 4) this._kick(t);
      if (s % 2 === 1) this._hat(t, 0.03);
      // sparse lead
      if ((s % 8 === 2 || s % 8 === 5 || s % 8 === 7) && Math.random() < 0.55) {
        const n = m.pent[(Math.random() * m.pent.length) | 0] - 12;
        this._note('triangle', n, t, 0.22, 0.055);
      }
      // bass on 0 and 5
      if (s % 8 === 0 || s % 8 === 5) {
        this._note('square', chord[0] - 24, t, 0.2, 0.07);
      }
      m.nextT += spb;
      m.step = (m.step + 1) % 64;
    }
  }
}

export const AudioSysInstance = new AudioSys();
