'use strict';
/* EMBERFALL run-01 :: audio — procedural WebAudio music + SFX (no assets) */
const AU = {
  ctx: null, master: null, sfxBus: null, musBus: null,
  layers: {}, noiseBuf: null,
  intensity: 0, muted: false,
  step: 0, nextT: 0, tempo: 96, _timer: null,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
      comp.connect(this.master); this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(comp);
      this.musBus = this.ctx.createGain(); this.musBus.gain.value = 0.8; this.musBus.connect(comp);
      for (const name of ['pad', 'bass', 'kick', 'hat', 'arp', 'snare']) {
        const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.musBus);
        this.layers[name] = g;
      }
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._applyIntensity(0.01);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this._timer) {
      this.nextT = this.ctx.currentTime + 0.08;
      this._timer = setInterval(() => this._sched(), 42);
    }
  },
  toggleMute() {
    if (!this.ctx) { this.muted = !this.muted; return this.muted; }
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return this.muted;
  },
  setIntensity(i) { this._pendingI = U.clamp(i | 0, 0, 3); if (this.ctx) this._applyIntensity(0.6); },
  _applyIntensity(ramp) {
    const i = this._pendingI || 0;
    const t = this.ctx ? this.ctx.currentTime : 0;
    const tgt = { pad: 0.5, bass: i >= 1 ? 0.5 : 0, kick: i >= 1 ? 0.85 : 0, hat: i >= 2 ? 0.3 : (i >= 1 ? 0.14 : 0), arp: i >= 2 ? 0.4 : (i >= 1 ? 0.22 : 0), snare: i >= 3 ? 0.34 : 0 };
    for (const k in tgt) if (this.layers[k]) this.layers[k].gain.setTargetAtTime(tgt[k], t, ramp);
    this.tempo = 96 + (i >= 3 ? 26 : i >= 2 ? 8 : 0);
    this.intensity = i;
  },

  _sched() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const stepDur = 60 / this.tempo / 4;
    while (this.nextT < this.ctx.currentTime + 0.14) {
      this._step(this.step, this.nextT);
      this.step = (this.step + 1) % 32;
      this.nextT += stepDur;
    }
  },
  _step(s, t) {
    const bar = s >> 3, roots = [45, 41, 48, 43]; // A2 F2 C3 G2
    const root = roots[bar], i = this.intensity;
    if (i >= 1 && s % 4 === 0) this.kick(t);
    if (s % 2 === 1 && (i >= 2 || (i >= 1 && s % 4 === 3))) this.hat(t, s % 4 === 3 ? 0.5 : 0.28);
    if (i >= 3 && s % 16 === 8) this.snare(t);
    if (i >= 1 && s % 2 === 0) {
      const off = [0, 0, 12, 0, 7, 0, 10, 12][s % 8];
      this.bass(t, U.mtof(root - 12 + off), 0.24);
    }
    if (i >= 1) {
      const seq = [0, 3, 7, 10, 12, 15, 12, 7];
      const n = root + 12 + seq[s % 8] + (bar === 3 && s >= 28 ? 3 : 0);
      this.pluck(t, U.mtof(n), i >= 2 ? 0.5 : 0.34);
    } else if (i === 0 && s % 8 === 0) {
      this.pluck(t, U.mtof(root + 12 + [0, 3, 7, 12][bar]), 0.22); // sparse title arp
    }
    if (s % 32 === 0) this.pad(t, root, 3.6);
  },

  _env(g, t, a, peak, dec, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + dec);
  },
  _osc(type, f, t, dur, dest) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return { o, g };
  },
  _noise(t, dur, dest) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
    return { src, g };
  },

  /* --- music voices --- */
  kick(t) { const { o, g } = this._osc('sine', 150, t, 0.13, this.layers.kick); o.frequency.exponentialRampToValueAtTime(38, t + 0.11); this._env(g, t, 0.002, 0.9, 0.12); },
  hat(t, v) { const n = this._noise(t, 0.05, this.layers.hat); const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.001, v * 0.5, 0.04); },
  snare(t) { const n = this._noise(t, 0.16, this.layers.snare); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.002, 0.8, 0.15); const o = this._osc('triangle', 210, t, 0.09, this.layers.snare); this._env(o.g, t, 0.001, 0.25, 0.08); },
  bass(t, f0, dur) { const { o, g } = this._osc('sawtooth', f0, t, dur, this.layers.bass); const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(520, t); flt.frequency.exponentialRampToValueAtTime(140, t + dur); o.disconnect(); o.connect(flt); flt.connect(g); this._env(g, t, 0.008, 0.5, dur); },
  pluck(t, f0, vol) { const { o, g } = this._osc('square', f0, t, 0.22, this.layers.arp); const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f0 * 3.2, t); flt.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + 0.2); o.disconnect(); o.connect(flt); flt.connect(g); this._env(g, t, 0.004, vol * 0.32, 0.2); },
  pad(t, rootMidi, dur) {
    const notes = [rootMidi, rootMidi + 3, rootMidi + 7, rootMidi + 12];
    for (const n of notes) {
      const { o, g } = this._osc('sawtooth', U.mtof(n), t, dur, this.layers.pad);
      o.detune.value = U.rand(-9, 9);
      const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 0.4;
      o.disconnect(); o.connect(flt); flt.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 1.1);
      g.gain.setValueAtTime(0.05, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
  },

  /* --- SFX --- */
  swing() { if (!this.ctx) return; const t = this.ctx.currentTime; const n = this._noise(t, 0.14); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.1); n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.004, 0.30, 0.12); },
  hit(big) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = this._noise(t, 0.09); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = big ? 2400 : 3200; n.src.disconnect(); n.src.connect(f); f.connect(n.g);
    this._env(n.g, t, 0.001, big ? 0.65 : 0.4, 0.08);
    const { o, g } = this._osc('triangle', big ? 160 : 220, t, 0.09); o.frequency.exponentialRampToValueAtTime(50, t + 0.08); this._env(g, t, 0.001, big ? 0.7 : 0.45, 0.08);
    if (big) { const p = this._osc('square', 1180, t, 0.06); p.o.frequency.exponentialRampToValueAtTime(500, t + 0.05); this._env(p.g, t, 0.001, 0.12, 0.05); }
  },
  hurt() { if (!this.ctx) return; const t = this.ctx.currentTime; const { o, g } = this._osc('sawtooth', 300, t, 0.26); o.frequency.exponentialRampToValueAtTime(70, t + 0.24); const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1200; o.disconnect(); o.connect(flt); flt.connect(g); this._env(g, t, 0.004, 0.55, 0.25); const n = this._noise(t, 0.14); const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; n.src.disconnect(); n.src.connect(nf); nf.connect(n.g); this._env(n.g, t, 0.002, 0.3, 0.12); },
  dash() { if (!this.ctx) return; const t = this.ctx.currentTime; const n = this._noise(t, 0.17); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.14); n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.006, 0.22, 0.15); },
  boom(vol = 0.8) { if (!this.ctx) return; const t = this.ctx.currentTime; const { o, g } = this._osc('sine', 110, t, 0.5); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); this._env(g, t, 0.002, vol, 0.45); const n = this._noise(t, 0.4); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.35); n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.002, vol * 0.7, 0.35); },
  shoot() { if (!this.ctx) return; const t = this.ctx.currentTime; const { o, g } = this._osc('square', 720, t, 0.07); o.frequency.exponentialRampToValueAtTime(240, t + 0.06); this._env(g, t, 0.001, 0.07, 0.06); },
  chargeUp(dur = 0.6) { if (!this.ctx) return; const t = this.ctx.currentTime; const { o, g } = this._osc('sawtooth', 90, t, dur); o.frequency.exponentialRampToValueAtTime(440, t + dur); const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1500; o.disconnect(); o.connect(flt); flt.connect(g); this._env(g, t, 0.03, 0.16, dur); },
  beamFire() { if (!this.ctx) return; const t = this.ctx.currentTime; const n = this._noise(t, 1.4); const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(600, t + 1.2); f.Q.value = 2; n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.02, 0.4, 1.3); const { o, g } = this._osc('sawtooth', 70, t, 1.3); this._env(g, t, 0.02, 0.3, 1.25); },
  whistle(dur = 0.75) { if (!this.ctx) return; const t = this.ctx.currentTime; const { o, g } = this._osc('sine', 1500, t, dur); o.frequency.exponentialRampToValueAtTime(320, t + dur); this._env(g, t, 0.02, 0.12, dur); },
  roar() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const sh = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3.2); }
    sh.curve = curve; sh.connect(this.sfxBus);
    for (const det of [-12, 9]) {
      const { o, g } = this._osc('sawtooth', 170, t, 1.0, sh); o.detune.value = det;
      o.frequency.exponentialRampToValueAtTime(52, t + 0.85);
      this._env(g, t, 0.05, 0.5, 0.9);
    }
    const n = this._noise(t, 0.9, sh); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480; n.src.disconnect(); n.src.connect(f); f.connect(n.g); this._env(n.g, t, 0.04, 0.5, 0.8);
  },
  victory() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const notes = [69, 73, 76, 81, 85, 88];
    notes.forEach((n, idx) => {
      const tt = t + idx * 0.13;
      const { o, g } = this._osc('triangle', U.mtof(n), tt, 0.5); this._env(g, tt, 0.005, 0.28, 0.5);
      const { o: o2, g: g2 } = this._osc('square', U.mtof(n + 12), tt, 0.4); this._env(g2, tt, 0.005, 0.07, 0.4);
    });
  },
  defeat() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [57, 55, 52, 45].forEach((n, idx) => {
      const tt = t + idx * 0.4;
      const { o, g } = this._osc('sawtooth', U.mtof(n), tt, 0.8);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      o.disconnect(); o.connect(f); f.connect(g);
      this._env(g, tt, 0.03, 0.22, 0.75);
    });
  },
};
