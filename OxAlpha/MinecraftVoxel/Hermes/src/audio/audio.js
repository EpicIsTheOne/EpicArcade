// Procedural audio: WebAudio synth for steps, dig, place, hurt, eat, ambient
// wind, rain, cave drips, mob sounds, UI. No external assets.
'use strict';
(function () {
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // gentle compressor to avoid clipping
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.compOut = comp;
      this.master.disconnect();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      return true;
    } catch (e) { this.enabled = false; return false; }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  /** short noise burst through filter */
  noiseBurst(dur, freq, q, gain, type) {
    if (!this.ensure() || !this.enabled) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  tone(freq, dur, type, gain, slideTo) {
    if (!this.ensure() || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = gain || 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  step(blockId) {
    const soft = [2, 3, 8, 17].includes(blockId) || blockId === 23;
    if (soft) this.noiseBurst(0.09, 400 + Math.random() * 200, 0.8, 0.10, 'lowpass');
    else this.noiseBurst(0.07, 900 + Math.random() * 500, 1.4, 0.075);
  }
  digTick() { this.noiseBurst(0.05, 700 + Math.random() * 300, 1.2, 0.05); }
  breakBlock(id) {
    const stoneLike = id === 1 || id === 4 || id >= 11 && id <= 15;
    if (stoneLike) { this.noiseBurst(0.16, 500, 1, 0.16, 'lowpass'); this.tone(90, 0.1, 'triangle', 0.05, 50); }
    else this.noiseBurst(0.14, 320, 0.8, 0.14, 'lowpass');
  }
  place() { this.noiseBurst(0.06, 600, 1, 0.1); this.tone(160, 0.05, 'sine', 0.04, 120); }
  hurt() { this.tone(220, 0.18, 'sawtooth', 0.12, 110); }
  mobHurt() { this.tone(160, 0.15, 'square', 0.09, 90); }
  zombie() { this.tone(110, 0.5, 'sawtooth', 0.05, 70); }
  eat() { this.noiseBurst(0.09, 500, 0.7, 0.08, 'lowpass'); }
  splash() { this.noiseBurst(0.3, 800, 0.6, 0.14, 'lowpass'); }
  craft() { this.tone(520, 0.08, 'square', 0.06); setTimeout(() => this.tone(700, 0.08, 'square', 0.06), 70); }
  click() { this.tone(880, 0.03, 'square', 0.04); }
  levelUp() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', 0.07), i * 90)); }

  startAmbience() {
    if (!this.ensure() || !this.enabled || this.windGain) return;
    const ctx = this.ctx;
    // looping filtered noise wind
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const dd = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; dd[i] = last * 3; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 380;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.035;
    src.connect(f); f.connect(this.windGain); this.windGain.connect(this.master);
    src.start();
    // rain layer (silent until weather)
    const rlen = ctx.sampleRate;
    const rbuf = ctx.createBuffer(1, rlen, ctx.sampleRate);
    const rd = rbuf.getChannelData(0);
    for (let i = 0; i < rlen; i++) rd[i] = Math.random() * 2 - 1;
    const rsrc = ctx.createBufferSource();
    rsrc.buffer = rbuf; rsrc.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass'; rf.frequency.value = 2600;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rsrc.connect(rf); rf.connect(this.rainGain); this.rainGain.connect(this.master);
    rsrc.start();
  }

  setRain(v) { if (this.rainGain) this.rainGain.gain.linearRampToValueAtTime(v * 0.11, this.ctx.currentTime + 1.2); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { AudioEngine };
if (typeof self !== 'undefined') self.AUDIO_MOD = { AudioEngine };
})();
