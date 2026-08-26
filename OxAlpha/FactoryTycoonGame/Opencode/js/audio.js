// ---------- Synthesized sound effects (WebAudio, no assets) ----------
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.8;
    this._lastSell = 0;
    this._sellCombo = 0;
    this._windSrc = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * 0.9;
    this.master.connect(this.ctx.destination);
    this._wind();
  }
  setVolume(v) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v * 0.9; }
  setMute(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume * 0.9;
  }
  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _osc(type, f0, f1, t0, dur, gain, dest) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _noise(t0, dur, gain, filterType, freq, q) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  _wind() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.04) * 0.985; d[i] = last * 3; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.028;
    // slow swell
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this._windSrc = src;
  }

  ok() { return !!this.ctx; }
  place() {
    if (!this.ok()) return;
    const t = this._now();
    this._noise(t, 0.09, 0.5, 'lowpass', 700);
    this._osc('sine', 170, 80, t, 0.13, 0.5);
  }
  demolish() {
    if (!this.ok()) return;
    const t = this._now();
    this._noise(t, 0.16, 0.45, 'bandpass', 420, 1.2);
    this._osc('sine', 120, 50, t, 0.18, 0.4);
  }
  sell(price) {
    if (!this.ok()) return;
    const now = performance.now();
    if (now - this._lastSell < 80) return;
    this._lastSell = now;
    this._sellCombo = Math.min(this._sellCombo + 1, 12);
    setTimeout(() => { this._sellCombo = Math.max(0, this._sellCombo - 1); }, 900);
    const p = 1 + this._sellCombo * 0.02;
    const t = this._now();
    this._osc('square', 740 * p, null, t, 0.06, 0.10);
    this._osc('square', 990 * p, null, t + 0.055, 0.09, 0.09);
    if (price >= 60) this._osc('triangle', 1480 * p, null, t + 0.11, 0.1, 0.08);
  }
  upgrade() {
    if (!this.ok()) return;
    const t = this._now();
    this._osc('sawtooth', 260, 920, t, 0.22, 0.14);
    this._osc('triangle', 520, 1400, t + 0.08, 0.18, 0.12);
  }
  buyLand() {
    if (!this.ok()) return;
    const t = this._now();
    [392, 494, 587, 784].forEach((f, i) => this._osc('triangle', f, null, t + i * 0.07, 0.22, 0.13));
  }
  error() {
    if (!this.ok()) return;
    const t = this._now();
    this._osc('square', 130, null, t, 0.07, 0.11);
    this._osc('square', 98, null, t + 0.08, 0.1, 0.11);
  }
  click() {
    if (!this.ok()) return;
    this._osc('triangle', 1250, 900, this._now(), 0.035, 0.07);
  }
}
export const sfx = new Sfx();
