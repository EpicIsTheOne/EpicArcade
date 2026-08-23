// ============================================================
// NEON MERIDIAN — systems/audio.js
// WebAudio synth SFX + ambient pad + simple music loop.
// No external assets. Volumes from GameState.settings.
// ============================================================
'use strict';

const AudioSys = (() => {

  class AudioSysClass {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.ready = false;
      this.musicTimer = null;
    }

    init() {
      if (this.ready) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.applyVolumes();
      this.ready = true;
      this.startAmbient();
    }

    applyVolumes() {
      if (!this.ready) return;
      const s = GameState.settings;
      this.master.gain.value = s.masterVol;
      this.sfxGain.gain.value = s.sfxVol;
      this.musicGain.gain.value = s.musicVol * 0.5;
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

    // ---- one-shots ----
    env(gainNode, t0, a, d, peak) {
      const g = gainNode.gain;
      g.setValueAtTime(0, t0);
      g.linearRampToValueAtTime(peak, t0 + a);
      g.exponentialRampToValueAtTime(0.001, t0 + a + d);
    }

    tone(type, f0, f1, dur, vol, dest) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      this.env(g, t, 0.005, dur, vol);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.05);
    }

    noise(dur, vol, filterFreq, dest) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const len = Math.max(1, this.ctx.sampleRate * dur) | 0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain();
      this.env(g, t, 0.003, dur, vol);
      src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
      src.start(t);
    }

    play(name) {
      if (!this.ready) return;
      switch (name) {
        case 'pistol': this.noise(0.14, 0.5, 2600); this.tone('square', 220, 60, 0.09, 0.22); break;
        case 'smg':    this.noise(0.09, 0.34, 2200); this.tone('square', 260, 90, 0.06, 0.14); break;
        case 'rifle':  this.noise(0.17, 0.55, 3000); this.tone('square', 180, 50, 0.12, 0.26); break;
        case 'empty':  this.tone('square', 900, 700, 0.05, 0.12); break;
        case 'swing':  this.noise(0.12, 0.2, 900); break;
        case 'hit':    this.noise(0.1, 0.4, 700); this.tone('sine', 140, 60, 0.1, 0.3); break;
        case 'hurt':   this.tone('sawtooth', 200, 90, 0.18, 0.3); break;
        case 'jump':   this.tone('sine', 300, 520, 0.12, 0.14); break;
        case 'horn':   this.tone('triangle', 392, 392, 0.28, 0.24); break;
        case 'siren':  break; // handled continuously by police cars (skipped for perf)
        case 'cash':   this.tone('sine', 880, 1320, 0.12, 0.3); this.tone('sine', 1320, 1760, 0.18, 0.2); break;
        case 'stage':  this.tone('sine', 660, 990, 0.1, 0.25); break;
        case 'mission': this.tone('sine', 523, 523, 0.15, 0.3); setTimeout(() => this.tone('sine', 659, 659, 0.15, 0.3), 130); setTimeout(() => this.tone('sine', 784, 1040, 0.3, 0.3), 260); break;
        case 'fail':   this.tone('sawtooth', 220, 110, 0.5, 0.3); break;
        case 'door':   this.noise(0.08, 0.25, 500); break;
        case 'crash':  this.noise(0.3, 0.6, 1400); this.tone('sine', 90, 40, 0.25, 0.4); break;
        case 'spawn':  this.tone('sine', 440, 660, 0.2, 0.2); break;
        case 'ui':     this.tone('sine', 740, 740, 0.05, 0.12); break;
        case 'engine': break; // continuous, see engine loop
      }
    }

    // ---- continuous engine hum tied to player vehicle ----
    startEngine() {
      if (!this.ready || this.engine) return;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 55;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.sfxGain);
      o.start();
      this.engine = { o, g, f };
    }
    stopEngine() {
      if (this.engine) { try { this.engine.o.stop(); } catch (e) {} this.engine = null; }
    }
    updateEngine(speed, throttle, cls) {
      if (!this.engine) return;
      const rpm = 50 + Math.abs(speed) * 4.2;
      this.engine.o.frequency.value = rpm;
      this.engine.g.gain.value = 0.05 + throttle * 0.06 + clamp(Math.abs(speed) / 40, 0, 0.05);
      this.engine.f.frequency.value = 260 + Math.abs(speed) * 14;
    }

    // ---- ambient city pad + night crickets-ish ----
    startAmbient() {
      if (!this.ready || this.ambient) return;
      const t = this.ctx.currentTime;
      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.035;
      padGain.connect(this.musicGain);
      const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 110;
      const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 165.2;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.06;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.02;
      lfo.connect(lfoG); lfoG.connect(padGain.gain);
      o1.connect(padGain); o2.connect(padGain);
      o1.start(t); o2.start(t); lfo.start(t);
      this.ambient = { padGain, o1, o2, lfo };
    }

    setNight(nightAmt) {
      if (this.ambient) this.ambient.padGain.gain.value = 0.03 + (1 - nightAmt) * 0.02;
    }
  }

  return { AudioSysClass };
})();

if (typeof module !== 'undefined') module.exports = { AudioSys: null };
