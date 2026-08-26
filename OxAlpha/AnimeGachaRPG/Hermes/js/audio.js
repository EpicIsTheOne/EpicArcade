// STARWEAVE — audio: generative WebAudio music + SFX + voice lines
// All sound is local/procedural; voices are pre-rendered mp3s in assets/audio.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi->hz

const MOODS = {
  title: { bpm: 62, root: 57, scale: [0, 2, 4, 7, 9, 11], wave: 'sine', padLevel: 0.05, arpOct: 12, perc: false },
  hub:   { bpm: 74, root: 60, scale: [0, 2, 4, 7, 9],     wave: 'triangle', padLevel: 0.045, arpOct: 12, perc: false },
  combat:{ bpm: 104, root: 55, scale: [0, 2, 3, 5, 7, 10],wave: 'sawtooth', padLevel: 0.03, arpOct: 12, perc: true },
  gacha: { bpm: 66, root: 58, scale: [0, 3, 5, 7, 10],    wave: 'sine', padLevel: 0.06, arpOct: 24, perc: false },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.mood = null;
    this.nextNoteTime = 0;
    this.step = 0;
    this.timer = null;
    this.settings = { music: 0.7, sfx: 0.9 };
    this.voices = {};
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      this.musicGain.connect(comp);
      this.sfxGain.connect(comp);
      comp.connect(this.ctx.destination);
      this.applySettings(this.settings);
      return true;
    } catch (e) { return false; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    if (this.musicGain) this.musicGain.gain.value = this.settings.music * 0.9;
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfx;
  }

  // ---------------- music ----------------
  setMood(name) {
    if (!this.ensure()) return;
    if (this.mood === name) return;
    this.mood = name;
    if (this.timer) clearInterval(this.timer);
    if (!name || !MOODS[name]) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }
  stopMusic() { this.setMood(null); }

  schedule() {
    const m = MOODS[this.mood];
    if (!m) return;
    const spb = 60 / m.bpm / 2; // 8th notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.30) {
      this.playStep(m, this.step, this.nextNoteTime);
      this.step++;
      this.nextNoteTime += spb;
    }
  }
  playStep(m, step, when) {
    const bar = Math.floor(step / 16) % 4;
    const chordRoots = [0, -3, -5, 2]; // i - vi - iv - v flavor offsets
    const rootMidi = m.root + chordRoots[bar];
    const pos = step % 16;

    // bass every 4 steps
    if (pos % 4 === 0) this.tone(NOTE(rootMidi - 24), when, 0.6, m.wave === 'sawtooth' ? 'triangle' : 'sine', 0.075);

    // pad on bar start
    if (pos === 0) {
      [0, 2, 4].forEach((iv) => {
        const deg = m.scale[iv % m.scale.length] + (iv >= m.scale.length ? 12 : 0);
        this.pad(NOTE(rootMidi + deg), when, (60 / m.bpm) * 8, m.padLevel);
      });
    }
    // arpeggio
    if (pos % 2 === 0 || m.perc) {
      const seqIdx = (step * 3) % m.scale.length;
      const oct = (Math.floor(step / m.scale.length) % 2) * m.arpOct;
      const vel = m.perc ? 0.035 : 0.03;
      this.pluck(NOTE(rootMidi + m.scale[seqIdx] + oct + 12), when, m.wave, vel);
    }
    // percussion for combat
    if (m.perc) {
      if (pos % 8 === 0) this.noiseHit(when, 90, 0.20, 0.09);   // kick-ish
      if (pos % 8 === 4) this.noiseHit(when, 2400, 0.05, 0.045); // hat
      if (pos === 12) this.noiseHit(when, 700, 0.08, 0.05);      // snare-ish
    }
  }

  tone(freq, when, dur, wave, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(when); o.stop(when + dur + 0.1);
  }
  pad(freq, when, dur, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    o.type = 'sine'; o.frequency.value = freq;
    o.detune.value = Math.sin(freq) * 6;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(when); o.stop(when + dur + 0.1);
  }
  pluck(freq, when, wave, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    o.connect(g); g.connect(this.musicGain);
    o.start(when); o.stop(when + 0.4);
  }
  noiseHit(when, freq, dur, vol) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = freq < 200 ? 'lowpass' : 'highpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(when);
  }

  // ---------------- SFX ----------------
  sfx(name, opt = {}) {
    if (!this.ensure()) return;
    this.resume();
    const t = this.ctx.currentTime;
    switch (name) {
      case 'hover': this.blip(t, 880, 0.04, 0.02, 'sine'); break;
      case 'click': this.blip(t, 660, 0.06, 0.05, 'triangle'); this.blip(t + 0.05, 990, 0.05, 0.04, 'sine'); break;
      case 'error': this.blip(t, 180, 0.15, 0.06, 'square'); break;
      case 'slash': this.swoosh(t, 1800, 0.09, 0.10); break;
      case 'hit': this.blip(t, 140, 0.08, 0.09, 'square'); this.noiseSfx(t, 3000, 0.05, 0.05); break;
      case 'dash': this.swoosh(t, 900, 0.14, 0.08); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.blip(t + i * 0.07, f, 0.18, 0.045, 'sine')); break;
      case 'shield': this.blip(t, 220, 0.25, 0.06, 'triangle'); break;
      case 'skill': this.swoosh(t, 1400, 0.18, 0.09); this.blip(t + 0.05, 520, 0.15, 0.05, 'triangle'); break;
      case 'burst': this.blip(t, 110, 0.5, 0.10, 'sawtooth'); this.swoosh(t + 0.1, 2000, 0.4, 0.10); break;
      case 'levelup': [392, 494, 587, 784].forEach((f, i) => this.blip(t + i * 0.09, f, 0.22, 0.05, 'triangle')); break;
      case 'quest': [659, 784, 988, 1319].forEach((f, i) => this.blip(t + i * 0.10, f, 0.25, 0.05, 'sine')); break;
      case 'shard': [880, 1320].forEach((f, i) => this.blip(t + i * 0.06, f, 0.2, 0.05, 'sine')); break;
      case 'stardust': this.blip(t, 1200, 0.08, 0.04, 'sine'); this.blip(t + 0.06, 1600, 0.1, 0.03, 'sine'); break;
      case 'swap': this.swoosh(t, 700, 0.10, 0.06); break;
      case 'riser': this.riser(t, opt.dur || 2.2); break;
      case 'reveal3': this.chord(t, [523, 659], 'sine', 0.05); break;
      case 'reveal4': this.chord(t, [523, 659, 784], 'triangle', 0.06); this.sparkle(t + 0.15); break;
      case 'reveal5': this.fanfare(t); break;
      case 'bossroar': this.blip(t, 70, 0.9, 0.14, 'sawtooth'); this.noiseSfx(t, 400, 0.7, 0.08); break;
    }
  }
  blip(t, freq, dur, vol, wave) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  swoosh(t, freq, dur, vol) {
    const buf = this._noise(dur);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(freq * 0.4, t);
    f.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }
  noiseSfx(t, freq, dur, vol) {
    const src = this.ctx.createBufferSource(); src.buffer = this._noise(dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }
  _noise(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  riser(t, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(640, t + dur);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.055, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.1);
  }
  chord(t, freqs, wave, vol) {
    freqs.forEach((f) => {
      this.blip(t, f, 0.7, vol, wave);
      this.blip(t, f * 2, 0.4, vol * 0.4, 'sine');
    });
  }
  sparkle(t) {
    for (let i = 0; i < 6; i++) this.blip(t + i * 0.05, 1400 + Math.random() * 1200, 0.12, 0.028, 'sine');
  }
  fanfare(t) {
    const seq = [523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => {
      this.blip(t + i * 0.11, f, 0.5, 0.065, 'triangle');
      this.blip(t + i * 0.11, f * 1.5, 0.3, 0.03, 'sine');
    });
    this.sparkle(t + 0.5);
    this.chord(t + 0.62, [523, 659, 784, 1047], 'triangle', 0.05);
  }

  // ---------------- voices ----------------
  registerVoice(id, url) { this.voices[id] = url; }
  playVoice(id) {
    const url = this.voices[id];
    if (!url) return Promise.resolve(false);
    return new Promise((res) => {
      const a = new Audio(url);
      a.volume = this.settings.sfx;
      a.onended = () => res(true);
      a.onerror = () => res(false);
      a.play().catch(() => res(false));
      this._curVoice = a;
    });
  }
  stopVoice() { if (this._curVoice) { try { this._curVoice.pause(); } catch (e) {} this._curVoice = null; } }
}

export const AudioSys = new AudioEngine();
