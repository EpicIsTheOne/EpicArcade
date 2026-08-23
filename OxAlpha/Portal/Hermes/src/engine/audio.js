// LIMINAL DYNAMICS — audio: procedural WebAudio SFX + ambient hum
export class SoundKit {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.master = null;
    this.humGain = null;
  }

  ensure() {
    if (this.ctx || !this.enabled) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startHum();
    } catch (e) { this.enabled = false; }
  }

  resume() { this.ctx?.resume?.(); }

  startHum() {
    const c = this.ctx;
    this.humGain = c.createGain();
    this.humGain.gain.value = 0.035;
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 52;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 104.6;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lg = c.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(this.humGain.gain);
    o1.connect(this.humGain); o2.connect(g2); g2.connect(this.humGain);
    this.humGain.connect(this.master);
    o1.start(); o2.start(); lfo.start();
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.5 : 0;
    if (v && !this.ctx) this.ensure();
  }

  _env(dur, peak = 0.3, a = 0.004, r = null) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(peak, c.currentTime + a);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (r ?? dur));
    return g;
  }
  _osc(type, freq, dur, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.start(); o.stop(this.ctx.currentTime + dur + 0.05);
    return o;
  }

  portalShoot(color) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, dur = 0.32;
    const g = this._env(dur, 0.22);
    const o = this._osc('sawtooth', color === 'blue' ? 320 : 260, dur);
    o.frequency.exponentialRampToValueAtTime(90, c.currentTime + dur);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 2;
    o.connect(f); f.connect(g); g.connect(this.master);
  }

  portalOpen(color) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, dur = 0.7;
    const g = this._env(dur, 0.24, 0.01);
    const o = this._osc('triangle', color === 'blue' ? 180 : 150, dur);
    o.frequency.exponentialRampToValueAtTime(520, c.currentTime + dur * 0.8);
    const o2 = this._osc('sine', 90, dur);
    o.connect(g); o2.connect(g); g.connect(this.master);
  }

  teleport() {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, dur = 0.35;
    const g = this._env(dur, 0.26, 0.002);
    const o = this._osc('sine', 1400, dur);
    o.frequency.exponentialRampToValueAtTime(240, c.currentTime + dur);
    const o2 = this._osc('square', 2200, dur * .6);
    const g2 = c.createGain(); g2.gain.value = 0.12; o2.connect(g2); g2.connect(g);
    o.connect(g); g.connect(this.master);
  }

  denied() {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx;
    const g = this._env(0.18, 0.16);
    const o = this._osc('square', 130, 0.18);
    o.frequency.linearRampToValueAtTime(70, c.currentTime + 0.16);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    o.connect(f); f.connect(g); g.connect(this.master);
  }

  pickup() {
    if (!this.enabled || !this.ctx) return;
    const g = this._env(0.15, 0.14);
    const o = this._osc('triangle', 480, 0.15);
    o.frequency.exponentialRampToValueAtTime(720, this.ctx.currentTime + 0.13);
    o.connect(g); g.connect(this.master);
  }
  drop() {
    if (!this.enabled || !this.ctx) return;
    const g = this._env(0.12, 0.1);
    const o = this._osc('triangle', 300, 0.12);
    o.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.11);
    o.connect(g); g.connect(this.master);
  }

  thud(strength = 1) {
    if (!this.enabled || !this.ctx) return;
    const s = Math.min(1, strength);
    const c = this.ctx;
    const dur = 0.22;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220 + 500 * s;
    const g = this._env(dur, 0.28 * s, 0.002);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  button(on) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx;
    const g = this._env(0.25, 0.2);
    const o = this._osc('sine', on ? 340 : 250, 0.25);
    o.frequency.exponentialRampToValueAtTime(on ? 620 : 160, c.currentTime + 0.2);
    o.connect(g); g.connect(this.master);
  }

  door() {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, dur = 0.9;
    const g = this._env(dur, 0.16, 0.05);
    const o = this._osc('sawtooth', 60, dur);
    o.frequency.linearRampToValueAtTime(110, c.currentTime + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    o.connect(f); f.connect(g); g.connect(this.master);
  }

  chime() {
    if (!this.enabled || !this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const g = this._env(0.8, 0.12, 0.01);
        const o = this._osc('sine', n, 0.8);
        o.connect(g); g.connect(this.master);
      }, i * 110);
    });
  }

  fizzler() {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, dur = 0.5;
    const g = this._env(dur, 0.18);
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 6;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }
}
