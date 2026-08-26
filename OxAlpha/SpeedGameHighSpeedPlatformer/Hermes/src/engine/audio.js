// audio.js — 100% procedural WebAudio: original SFX + original synthwave music.
// Starts only after a user gesture (browser autoplay policy); QA mode can force it.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = true; this.sfxOn = true;
    this._musicGain = null; this._sfxGain = null;
    this._seqTimer = null;
    this.track = null;          // current track config
    this._step = 0;
    this.engineOsc = null; this.engineGain = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    const master = this.ctx.createGain(); master.gain.value = 0.9; master.connect(this.ctx.destination);
    this._musicGain = this.ctx.createGain(); this._musicGain.gain.value = this.musicOn ? 0.5 : 0; this._musicGain.connect(master);
    // gentle delay for arps
    this._delay = this.ctx.createDelay(0.6); this._delay.delayTime.value = 0.22;
    this._delayFb = this.ctx.createGain(); this._delayFb.gain.value = 0.32;
    this._delayMix = this.ctx.createGain(); this._delayMix.gain.value = 0.35;
    this._delay.connect(this._delayFb); this._delayFb.connect(this._delay);
    this._delay.connect(this._delayMix); this._delayMix.connect(this._musicGain);
    this._sfxGain = this.ctx.createGain(); this._sfxGain.gain.value = this.sfxOn ? 0.9 : 0; this._sfxGain.connect(master);
    // noise buffer shared
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  setMusic(on) { this.musicOn = on; if (this._musicGain) this._musicGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05); }
  setSfx(on) { this.sfxOn = on; if (this._sfxGain) this._sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02); }

  /* ---------------- SFX ---------------- */
  _env(node, t0, a, peak, dec, end = 0.0001) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(Math.max(end, 1e-4), t0 + a + dec);
  }
  tone(type, f0, f1, dur, peak = 0.2, when = 0, dest = null) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this._env(g, t, 0.008, peak, dur);
    o.connect(g); g.connect(dest || this._sfxGain);
    o.start(t); o.stop(t + dur + 0.08);
  }
  noise(dur, peak, filterType, f0, f1, q = 1, when = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const flt = this.ctx.createBiquadFilter(); flt.type = filterType; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
    const g = this.ctx.createGain(); this._env(g, t, 0.01, peak, dur);
    src.connect(flt); flt.connect(g); g.connect(this._sfxGain);
    src.start(t); src.stop(t + dur + 0.1);
  }
  jump() { this.tone('square', 300, 720, 0.18, 0.16); }
  land() { this.noise(0.09, 0.12, 'lowpass', 900, 300); }
  dash() { this.noise(0.32, 0.3, 'bandpass', 500, 3200, 1.4); this.tone('sawtooth', 180, 420, 0.25, 0.1); }
  spring() { this.tone('sine', 220, 880, 0.28, 0.28); this.tone('triangle', 330, 1320, 0.24, 0.14, 0.03); }
  collect(combo = 0) {
    const step = Math.min(combo % 12, 11);
    const f = 620 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.floor(step / 2)] / 12 || 0);
    this.tone('sine', f, f * 1.01, 0.14, 0.18);
    this.tone('sine', f * 2, f * 2, 0.09, 0.06, 0.02);
  }
  secret() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.2, i * 0.09)); }
  checkpointSnd() { [392, 523].forEach((f, i) => this.tone('square', f, f, 0.16, 0.13, i * 0.1)); }
  hit() {
    this.tone('sawtooth', 210, 60, 0.3, 0.34); this.noise(0.22, 0.3, 'lowpass', 2400, 200);
  }
  explode() { this.noise(0.5, 0.42, 'lowpass', 2600, 120); this.tone('sine', 130, 40, 0.4, 0.3); }
  railStart() { this.noise(0.15, 0.2, 'bandpass', 1400, 2600, 3); }
  grindTick() { this.noise(0.06, 0.07, 'bandpass', 2200 + Math.random() * 1500, undefined, 4); }
  dive() { this.tone('sawtooth', 700, 160, 0.35, 0.2); this.noise(0.3, 0.2, 'bandpass', 2500, 700, 2); }
  boostLoop(speed01) {
    if (!this.ctx || !this.sfxOn) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
      this.engineFlt = this.ctx.createBiquadFilter(); this.engineFlt.type = 'lowpass'; this.engineFlt.frequency.value = 600;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFlt); this.engineFlt.connect(this.engineGain); this.engineGain.connect(this._sfxGain);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 90, t, 0.08);
    this.engineFlt.frequency.setTargetAtTime(400 + speed01 * 2600, t, 0.08);
    const g = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0.0001;
    this.engineGain.gain.setTargetAtTime(g, t, 0.1);
  }
  goalFanfare() {
    const seq = [[523, 0], [659, .12], [784, .24], [1047, .36], [784, .55], [1047, .66], [1319, .8]];
    seq.forEach(([f, w]) => { this.tone('square', f, f, 0.26, 0.16, w); this.tone('triangle', f / 2, f / 2, 0.3, 0.1, w); });
  }
  uiClick() { this.tone('sine', 700, 500, 0.07, 0.12); }

  /* ---------------- MUSIC (original synthwave sequencer) ----------------
     16-step patterns, lookahead scheduled. Each level passes a mood config:
     { bpm, key (root midi), minor, bright } */
  playTrack(cfg) {
    this.ensure(); if (!this.ctx) return;
    this.stopTrack();
    this.track = cfg;
    this._step = 0;
    this._nextStepTime = this.ctx.currentTime + 0.1;
    this._seqTimer = setInterval(() => this._schedule(), 60);
  }
  stopTrack() { if (this._seqTimer) { clearInterval(this._seqTimer); this._seqTimer = null; } }

  _mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  _schedule() {
    if (!this.ctx || !this.track) return;
    const spb = 60 / this.track.bpm;      // seconds per beat
    const stepDur = spb / 4;              // 16th notes
    while (this._nextStepTime < this.ctx.currentTime + 0.18) {
      this._playStep(this._step, this._nextStepTime, stepDur);
      this._step = (this._step + 1) % 64;
      this._nextStepTime += stepDur;
    }
  }

  _playStep(s, t, dur) {
    const T = this.track; const bar = Math.floor(s / 16), st = s % 16;
    const root = T.key;
    // chord progression (minor): i - VI - III - VII
    const prog = [0, 8, 3, 10];
    const ch = prog[bar % 4];
    const noteN = root + ch;

    // KICK: four on the floor
    if (st % 4 === 0) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.16);
      o.connect(g); g.connect(this._musicGain); o.start(t); o.stop(t + 0.2);
    }
    // SNARE on beats 2 & 4
    if (st === 4 || st === 12) {
      const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1700;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.24, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.14);
      n.connect(f); f.connect(g); g.connect(this._musicGain); n.start(t); n.stop(t + 0.16);
    }
    // HATS 8ths (off-beats brighter)
    if (st % 2 === 0) {
      const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
      const g = this.ctx.createGain(); const v = st % 4 === 2 ? 0.1 : 0.055;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.05);
      n.connect(f); f.connect(g); g.connect(this._musicGain); n.start(t); n.stop(t + 0.07);
    }
    // BASS: driving 8ths root octave pattern
    if (st % 2 === 0) {
      const oct = (st === 6 || st === 14) ? 12 : 0;
      this._mus('sawtooth', this._mtof(noteN - 12 + oct), t, dur * 1.6, 0.17, 700);
    }
    // ARP lead: 16th melodic pattern over chord
    const arpPat = [0, 7, 12, 15, 12, 7, 12, 19, 0, 7, 12, 15, 12, 19, 24, 19];
    if (T.bright || st % 2 === 1 || st % 8 === 0) {
      const semis = arpPat[st] + (bar >= 2 && st === 15 ? 3 : 0);
      this._mus('square', this._mtof(noteN + 12 + semis), t, dur * 0.9, 0.055, 3400, true);
    }
    // PAD: whole-note detuned saws
    if (st === 0) {
      [0, 3, 7].forEach((iv, k) => {
        this._mus('sawtooth', this._mtof(noteN + iv), t, dur * 14, 0.04 + k * 0.002, 900, false, k * 3);
      });
    }
  }

  _mus(type, freq, t, dur, vol, lp, toDelay = false, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(f); f.connect(g); g.connect(this._musicGain);
    if (toDelay) g.connect(this._delay);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
