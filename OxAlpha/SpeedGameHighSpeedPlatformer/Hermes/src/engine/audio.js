// Procedural WebAudio engine: synthesized SFX + an original sequenced soundtrack.
// Everything is generated live — no audio assets, no CDN.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const TRACKS = {
  coast: {
    bpm: 126, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    bassRoots: [33, 29, 24, 31],
    arp: [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2],
    lead: [12, null, 15, 17, null, 12, null, 10, 12, null, 15, null, 19, 17, 15, 12],
  },
  city: {
    bpm: 141, chords: [[52, 55, 59], [48, 52, 55], [43, 47, 50], [47, 51, 54]],
    bassRoots: [28, 24, 19, 23],
    arp: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 2, 1, 0, 2],
    lead: [12, 12, null, 15, 17, null, 15, 12, 10, null, 12, null, 15, 17, 19, null],
  },
  foundry: {
    bpm: 152, chords: [[40, 43, 47], [41, 45, 48], [38, 42, 45], [40, 43, 47]],
    bassRoots: [28, 29, 26, 28],
    arp: [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 2, 0, 2, 1, 0],
    lead: [12, null, 13, 12, 15, null, 13, 12, 10, 12, null, 8, 10, null, 12, 13],
  },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volMaster = 0.8; this.volMusic = 0.65; this.volSfx = 0.9;
    this.trackName = 'coast';
    this.intensity = 0;      // 0 menu .. 1 gameplay .. 1.6 boost
    this._step = 0;
    this._nextT = 0;
  }

  init() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 22; this.comp.ratio.value = 8;
      this.master = c.createGain(); this.master.gain.value = this.volMaster;
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.volMusic;
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.volSfx;
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.28;
      const fb = c.createGain(); fb.gain.value = 0.34;
      const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
      this.delay.connect(fb); fb.connect(dlp); dlp.connect(this.delay);
      const dgain = c.createGain(); dgain.gain.value = 0.35;
      this.delay.connect(dgain); dgain.connect(this.musicBus);
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.comp); this.comp.connect(c.destination);

      // shared noise buffer
      const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;

      // locomotion loops
      this.wind = this._loop('bandpass', 500, 0.6);
      this.railL = this._loop('bandpass', 2600, 4);
      this.wallL = this._loop('bandpass', 1200, 2);
      this.boostL = this._loop('highpass', 1400, 0.8);

      this.ready = true;
      this._nextT = c.currentTime + 0.05;
      setInterval(() => this._scheduler(), 30);
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  _loop(type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start();
    return { src, f, g };
  }

  setVolumes(m, mu, s) {
    this.volMaster = m; this.volMusic = mu; this.volSfx = s;
    if (!this.ready) return;
    this.master.gain.value = m; this.musicBus.gain.value = mu; this.sfxBus.gain.value = s;
  }

  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); }

  // Per-frame locomotion ambience --------------------------------------------------
  setMotion(speed01, opts = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const wind = Math.max(0, speed01 - 0.12) * 0.55;
    this.wind.g.gain.setTargetAtTime(wind, t, 0.08);
    this.wind.f.frequency.setTargetAtTime(380 + speed01 * 1500, t, 0.1);
    this.railL.g.gain.setTargetAtTime(opts.grinding ? 0.34 : 0, t, 0.05);
    this.wallL.g.gain.setTargetAtTime(opts.wall ? 0.28 : 0, t, 0.05);
    this.boostL.g.gain.setTargetAtTime(opts.boost ? 0.3 : 0, t, 0.07);
  }

  // ---------------- SFX synth helpers ----------------
  _env(g, t, a, peak, dec, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + dec);
  }
  _tone({ type = 'sine', f0 = 440, f1, t, dur = 0.15, peak = 0.3, attack = 0.004, dest, detune = 0 }) {
    const c = this.ctx; dest = dest || this.sfxBus;
    const o = c.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain();
    this._env(g, t, attack, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }
  _noise({ t, dur = 0.15, peak = 0.3, type = 'lowpass', freq = 1000, q = 1, f1, dest }) {
    const c = this.ctx; dest = dest || this.sfxBus;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
    const g = c.createGain();
    this._env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur + 0.1);
  }

  // ---------------- named SFX ----------------
  now() { return this.ready ? this.ctx.currentTime : 0; }
  jump() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'square', f0: 320, f1: 640, t, dur: 0.13, peak: 0.16 }); }
  doubleJump() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'square', f0: 520, f1: 1040, t, dur: 0.12, peak: 0.15 }); this._tone({ type: 'sine', f0: 780, f1: 1560, t, dur: 0.1, peak: 0.1 }); }
  chainDash() { if (!this.ready) return; const t = this.now(); this._noise({ t, dur: 0.28, peak: 0.3, type: 'bandpass', freq: 2600, q: 1.4, f1: 500 }); this._tone({ type: 'sawtooth', f0: 900, f1: 180, t, dur: 0.24, peak: 0.16 }); }
  chainHit() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'sine', f0: 130, f1: 46, t, dur: 0.2, peak: 0.5 }); this._noise({ t, dur: 0.18, peak: 0.3, type: 'lowpass', freq: 900 }); [880, 1100, 1320].forEach((f, i) => this._tone({ type: 'sine', f0: f, t: t + i * 0.03, dur: 0.1, peak: 0.1 })); }
  spring() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'sine', f0: 190, f1: 720, t, dur: 0.22, peak: 0.34 }); this._tone({ type: 'triangle', f0: 380, f1: 1440, t: t + 0.02, dur: 0.18, peak: 0.14 }); }
  panel() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'sawtooth', f0: 1400, f1: 2200, t, dur: 0.07, peak: 0.12 }); this._tone({ type: 'sawtooth', f0: 1400, f1: 2800, t: t + 0.06, dur: 0.09, peak: 0.12 }); }
  orb(comboN = 0) { if (!this.ready) return; const t = this.now(); const p = Math.pow(1.0595, Math.min(comboN, 12)); this._tone({ type: 'sine', f0: 1180 * p, t, dur: 0.09, peak: 0.2 }); this._tone({ type: 'sine', f0: 1760 * p, t, dur: 0.06, peak: 0.08 }); }
  prism() { if (!this.ready) return; const t = this.now(); [660, 880, 1320, 1760].forEach((f, i) => this._tone({ type: 'triangle', f0: f, t: t + i * 0.07, dur: 0.3, peak: 0.16 })); }
  chip() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'square', f0: 740, t, dur: 0.1, peak: 0.14 }); this._tone({ type: 'square', f0: 1110, t: t + 0.09, dur: 0.22, peak: 0.14 }); }
  checkpoint() { if (!this.ready) return; const t = this.now(); [523, 659, 784].forEach((f, i) => this._tone({ type: 'triangle', f0: f, t: t + i * 0.06, dur: 0.25, peak: 0.16 })); }
  hurt() { if (!this.ready) return; const t = this.now(); this._noise({ t, dur: 0.25, peak: 0.42, type: 'lowpass', freq: 700 }); this._tone({ type: 'sawtooth', f0: 340, f1: 90, t, dur: 0.28, peak: 0.24 }); }
  death() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'sine', f0: 600, f1: 80, t, dur: 0.6, peak: 0.3 }); this._noise({ t, dur: 0.4, peak: 0.2, type: 'lowpass', freq: 500, f1: 100 }); }
  explode() { if (!this.ready) return; const t = this.now(); this._noise({ t, dur: 0.45, peak: 0.5, type: 'lowpass', freq: 1400, f1: 120 }); this._tone({ type: 'sine', f0: 120, f1: 36, t, dur: 0.4, peak: 0.5 }); }
  crate() { if (!this.ready) return; const t = this.now(); this._noise({ t, dur: 0.16, peak: 0.4, type: 'bandpass', freq: 850, q: 1.2 }); this._tone({ type: 'triangle', f0: 220, f1: 90, t, dur: 0.12, peak: 0.2 }); }
  stomp() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'sine', f0: 95, f1: 38, t, dur: 0.3, peak: 0.55 }); this._noise({ t, dur: 0.2, peak: 0.3, type: 'lowpass', freq: 500 }); }
  wallrun() { if (!this.ready) return; const t = this.now(); this._tone({ type: 'sine', f0: 420, f1: 640, t, dur: 0.1, peak: 0.14 }); }
  goal() {
    if (!this.ready) return; const t = this.now();
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this._tone({ type: 'triangle', f0: f, t: t + i * 0.11, dur: 0.4, peak: 0.2 });
      this._tone({ type: 'square', f0: f / 2, t: t + i * 0.11, dur: 0.35, peak: 0.07 });
    });
  }
  rank(r) {
    if (!this.ready) return; const t = this.now();
    const seqs = { S: [784, 988, 1175, 1568], A: [659, 784, 988], B: [587, 740], C: [523, 587], D: [392, 330] };
    (seqs[r] || seqs.C).forEach((f, i) => this._tone({ type: 'triangle', f0: f, t: t + i * 0.13, dur: 0.35, peak: 0.2 }));
  }
  ui(kind = 'move') {
    if (!this.ready) return; const t = this.now();
    if (kind === 'move') this._tone({ type: 'square', f0: 620, t, dur: 0.05, peak: 0.07 });
    else this._tone({ type: 'square', f0: 880, f1: 1240, t, dur: 0.09, peak: 0.11 });
  }
  land(hard = false) {
    if (!this.ready) return; const t = this.now();
    this._noise({ t, dur: hard ? 0.2 : 0.09, peak: hard ? 0.34 : 0.16, type: 'lowpass', freq: hard ? 480 : 700 });
    if (hard) this._tone({ type: 'sine', f0: 90, f1: 40, t, dur: 0.16, peak: 0.3 });
  }

  // ---------------- Music sequencer ----------------
  setTrack(name) { if (TRACKS[name]) this.trackName = name; }
  setIntensity(v) { this.intensity = v; }

  _scheduler() {
    if (!this.ready) return;
    const tr = TRACKS[this.trackName];
    const beat = 60 / tr.bpm, stepDur = beat / 4;
    while (this._nextT < this.ctx.currentTime + 0.14) {
      this._playStep(tr, this._step, this._nextT, stepDur);
      this._step = (this._step + 1) % 64;
      this._nextT += stepDur;
    }
  }

  _playStep(tr, step, t, sd) {
    const c = this.ctx, bar = Math.floor(step / 16) % 4, s16 = step % 16;
    const chord = tr.chords[bar], root = tr.bassRoots[bar];
    const inten = this.intensity;

    // pads every half-bar (always on)
    if (s16 === 0 || s16 === 8) {
      chord.forEach((m) => this._tone({ type: 'sawtooth', f0: mtof(m - 12), t: t + (Math.random() * 0.02), dur: sd * 9, peak: 0.028, attack: 0.5, dest: this.musicBus }));
      this._tone({ type: 'sawtooth', f0: mtof(chord[0] - 24), t, dur: sd * 9, peak: 0.03, attack: 0.4, dest: this.musicBus });
    }
    // hats (gameplay+)
    if (inten >= 1) {
      if (s16 % 2 === 0) this._hat(t, 0.05, 0.045);
      if (inten > 1.2 && s16 % 4 === 2) this._hat(t, 0.16, 0.05);
    }
    // kick
    if (inten >= 1 && (s16 === 0 || s16 === 6 || s16 === 8 || (inten > 1.2 && s16 === 11))) this._kick(t);
    // snare
    if (inten >= 1 && (s16 === 4 || s16 === 12)) this._snare(t);
    // bass
    if (inten >= 1) {
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
      if (pat[s16]) this._bass(t, mtof(root), sd * 0.85);
    }
    // arp
    const ai = tr.arp[s16];
    if (ai != null && (inten >= 1 || s16 % 2 === 0)) {
      const note = chord[ai % chord.length] + 12 * (1 + (ai > 2 ? 1 : 0));
      this._arpNote(t, mtof(note));
    }
    // lead on boost
    if (inten > 1.2) {
      const li = tr.lead[s16];
      if (li != null) this._lead(t, mtof(chord[0] + li), sd * 1.4);
    }
  }
  _kick(t) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.2);
  }
  _snare(t) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    s.connect(f); f.connect(g); g.connect(this.musicBus); s.start(t); s.stop(t + 0.2);
    this._tone({ type: 'triangle', f0: 210, f1: 150, t, dur: 0.06, peak: 0.1, dest: this.musicBus });
  }
  _hat(t, dur, peak) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 1.6;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicBus); s.start(t); s.stop(t + dur + 0.05);
  }
  _bass(t, f, dur) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 6;
    flt.frequency.setValueAtTime(180, t); flt.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.setValueAtTime(0.16, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(flt); flt.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  _arpNote(t, f) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = f; o2.detune.value = 9;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2600;
    const g = c.createGain(); g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    o.connect(flt); o2.connect(flt); flt.connect(g);
    g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + 0.2); o2.start(t); o2.stop(t + 0.2);
  }
  _lead(t, f, dur) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lfo = c.createOscillator(); lfo.frequency.value = 5.6;
    const lg = c.createGain(); lg.gain.value = 7;
    lfo.connect(lg); lg.connect(o.detune);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
  }
}

export const audio = new AudioSys();
