// STARWOVEN — procedural WebAudio engine: music sequencer + SFX synth
"use strict";

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// --- Track definitions -------------------------------------------------------
// voice types: box (music box), pluck, pad, bass, hat, kick, choir
const TRACKS = {
  haven: { bpm: 72, bars: 4, stepsPerBar: 8,
    voices: [
      { type: 'box', vol: .5, notes: [ // gentle arpeggio, Am - F - C - G (add9 colors)
        69,null,76,72, 79,null,76,72,  65,null,72,69, 77,null,72,69,
        60,null,67,64, 72,null,79,76,  55,null,67,74, 71,null,74,79 ] },
      { type: 'bass', vol: .34, notes: [
        45,null,null,null,45,null,null,null, 41,null,null,null,41,null,null,null,
        36,null,null,null,36,null,null,null, 43,null,null,null,43,null,47,null ] },
      { type: 'pad', vol: .16, chords: [[57,60,64,71],[53,57,60,65],[48,52,55,64],[55,59,62,67]], chordPerBar: true },
    ] },
  field: { bpm: 98, bars: 4, stepsPerBar: 8,
    voices: [
      { type: 'pluck', vol: .42, notes: [
        76,null,74,76, 79,null,76,null, 81,null,79,76, 74,null,76,null,
        72,null,74,76, 74,null,72,69,  71,null,72,74, 76,null,null,null ] },
      { type: 'bass', vol: .38, notes: [
        45,45,null,45, null,45,null,null, 41,41,null,41, null,41,null,null,
        48,48,null,48, null,48,null,null, 43,43,null,40, null,43,null,null ] },
      { type: 'hat', vol: .10, notes: [ null,null,1,null, null,null,1,null, null,null,1,null, null,1,null,null ] },
    ] },
  battle: { bpm: 132, bars: 2, stepsPerBar: 8,
    voices: [
      { type: 'pluck', vol: .40, notes: [
        69,69,76,69, 72,69,77,76, 68,68,75,68, 71,75,80,77 ] },
      { type: 'bass', vol: .46, notes: [
        45,45,45,45, 45,45,48,45, 44,44,44,44, 44,44,47,44 ] },
      { type: 'kick', vol: .5, notes: [ 1,null,null,1, null,null,1,null ] },
      { type: 'hat', vol: .13, notes: [ null,1,null,1, null,1,null,1 ] },
      { type: 'pad', vol: .12, chords: [[57,60,64],[56,59,62]], chordPerBar: true },
    ] },
  boss: { bpm: 140, bars: 2, stepsPerBar: 8,
    voices: [
      { type: 'choir', vol: .22, notes: [
        57,null,58,null, 57,null,56,null, 57,null,53,null, 56,null,null,null ] },
      { type: 'bass', vol: .5, notes: [
        33,33,33,33, 33,33,33,33, 32,32,32,32, 32,32,31,31 ] },
      { type: 'kick', vol: .55, notes: [ 1,null,null,1, null,1,null,null ] },
      { type: 'hat', vol: .15, notes: [ null,1,1,null, null,1,1,1 ] },
      { type: 'pad', vol: .14, chords: [[45,48,52],[44,47,51]], chordPerBar: true },
    ] },
};

export class AudioEngine {
  constructor() {
    this.ctx = null; this.track = null; this.step = 0; this.nextT = 0;
    this.musicVol = .65; this.sfxVol = .85; this._timer = null;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = .9;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicVol;
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxVol;
    // gentle master warmth
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.musicBus.disconnect(); this.sfxBus.disconnect();
    this.musicBus.connect(comp); this.sfxBus.connect(comp);
    comp.connect(this.master);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(m, this.ctx.currentTime, .1);
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(s, this.ctx.currentTime, .1);
  }

  // ---- music ----
  playMusic(name) {
    this.init(); this.resume();
    if (this.track === name) return;
    this.track = name;
    this.step = 0;
    if (this.nextT < this.ctx.currentTime) this.nextT = this.ctx.currentTime + .05;
    if (!this._timer) this._timer = setInterval(() => this._schedule(), 90);
  }
  stopMusic() { this.track = null; }
  _schedule() {
    if (!this.track || !this.ctx) return;
    const t = TRACKS[this.track]; if (!t) return;
    const spb = 60 / t.bpm / 2; // eighth-note steps
    while (this.nextT < this.ctx.currentTime + .30) {
      const s = this.step % (t.bars * t.stepsPerBar);
      for (const v of t.voices) {
        if (v.chords && v.chordPerBar) {
          if (s % t.stepsPerBar === 0) {
            const chord = v.chords[Math.floor(s / t.stepsPerBar) % v.chords.length];
            this._voice(v.type, chord.map(mtof), this.nextT, spb * t.stepsPerBar * .95, v.vol, this.musicBus);
          }
        } else {
          const n = v.notes[s % v.notes.length];
          if (n) this._voice(v.type, [mtof(n)], this.nextT, spb * 1.8, v.vol, this.musicBus);
        }
      }
      this.step++; this.nextT += spb;
    }
  }
  _voice(type, freqs, t, dur, vol, bus) {
    const ctx = this.ctx;
    for (const f of freqs) {
      let o, g = ctx.createGain(), flt;
      g.gain.setValueAtTime(0, t);
      switch (type) {
        case 'box': case 'pluck':
          o = ctx.createOscillator(); o.type = 'sine';
          if (type === 'pluck') { o.type = 'triangle'; }
          o.frequency.value = f * (type === 'box' ? 2 : 1);
          g.gain.linearRampToValueAtTime(vol, t + .008);
          g.gain.exponentialRampToValueAtTime(.0001, t + dur);
          o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .05);
          break;
        case 'bass':
          o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f / 2;
          g.gain.linearRampToValueAtTime(vol, t + .01);
          g.gain.exponentialRampToValueAtTime(.0001, t + dur * .8);
          o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur);
          break;
        case 'pad': case 'choir': {
          const d = dur * (type === 'choir' ? .6 : 1);
          o = ctx.createOscillator(); o.type = type === 'choir' ? 'sawtooth' : 'sawtooth';
          o.frequency.value = f; o.detune.value = (Math.random() * 10 - 5);
          flt = ctx.createBiquadFilter(); flt.type = 'lowpass';
          flt.frequency.setValueAtTime(type === 'choir' ? 700 : 1100, t);
          g.gain.linearRampToValueAtTime(vol / freqs.length, t + d * .25);
          g.gain.linearRampToValueAtTime(.0001, t + d);
          o.connect(flt); flt.connect(g); g.connect(bus); o.start(t); o.stop(t + d + .05);
          break; }
        case 'kick': {
          o = ctx.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + .11);
          g.gain.linearRampToValueAtTime(vol, t + .004);
          g.gain.exponentialRampToValueAtTime(.0001, t + .16);
          o.connect(g); g.connect(bus); o.start(t); o.stop(t + .2);
          break; }
        case 'hat': {
          const buf = this._noise(); const src = ctx.createBufferSource(); src.buffer = buf;
          flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 6500;
          g.gain.linearRampToValueAtTime(vol, t + .002);
          g.gain.exponentialRampToValueAtTime(.0001, t + .05);
          src.connect(flt); flt.connect(g); g.connect(bus); src.start(t); src.stop(t + .08);
          break; }
      }
    }
  }
  _noise() {
    if (!this._nbuf) {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate * .5, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._nbuf = b;
    }
    return this._nbuf;
  }

  // ---- SFX ----
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, bus = this.sfxBus;
    const tone = (f0, f1, dur, vol, type = 'sine', delay = 0) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t + delay);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(vol, t + delay + .006);
      g.gain.exponentialRampToValueAtTime(.0001, t + delay + dur);
      o.connect(g); g.connect(bus); o.start(t + delay); o.stop(t + delay + dur + .05);
    };
    const noiseHit = (dur, vol, fc = 1800, hp = false, delay = 0) => {
      const src = this.ctx.createBufferSource(); src.buffer = this._noise();
      const flt = this.ctx.createBiquadFilter(); flt.type = hp ? 'highpass' : 'bandpass';
      flt.frequency.value = fc; flt.Q.value = .8;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(.0001, t + delay + dur);
      src.connect(flt); flt.connect(g); g.connect(bus);
      src.start(t + delay); src.stop(t + delay + dur + .05);
    };
    switch (name) {
      case 'uiHover': tone(720, 720, .04, .05, 'sine'); break;
      case 'uiClick': tone(520, 780, .07, .12, 'sine'); break;
      case 'uiConfirm': tone(523, 523, .09, .12, 'sine'); tone(784, 784, .14, .12, 'sine', .07); break;
      case 'uiCancel': tone(420, 240, .12, .12, 'sine'); break;
      case 'uiOpen': tone(392, 588, .1, .1, 'triangle'); break;
      case 'hit': noiseHit(.09, .3, 900); tone(160, 70, .09, .22, 'triangle'); break;
      case 'crit': noiseHit(.12, .34, 1400); tone(320, 90, .13, .26, 'square'); tone(1200, 600, .1, .08, 'sine'); break;
      case 'hurt': noiseHit(.14, .28, 500); tone(220, 90, .18, .24, 'sawtooth'); break;
      case 'dodge': noiseHit(.16, .2, 2400, true); break;
      case 'pickup': tone(880, 1320, .08, .1, 'sine'); tone(1320, 1760, .1, .08, 'sine', .06); break;
      case 'chest': tone(392, 392, .1, .12); tone(494, 494, .1, .12, 'sine', .09); tone(587, 587, .16, .13, 'sine', .18); tone(784, 784, .3, .12, 'sine', .27); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone(f, f, .22, .13, 'triangle', i * .1)); break;
      case 'heal': tone(660, 990, .25, .1, 'sine'); tone(990, 1320, .3, .07, 'sine', .12); break;
      case 'ultReady': tone(1046, 1046, .12, .1, 'sine'); tone(1568, 1568, .2, .1, 'sine', .1); break;
      case 'ultCast': tone(200, 800, .35, .18, 'sawtooth'); noiseHit(.3, .2, 3000, true); break;
      case 'summonWhoosh':
        noiseHit(1.1, .16, 400, false); 
        { const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(110, t);
          o.frequency.exponentialRampToValueAtTime(880, t + 1.2);
          g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.14, t + 1.0);
          g.gain.exponentialRampToValueAtTime(.0001, t + 1.35);
          o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1.4); }
        break;
      case 'weaveTick': tone(1400 + Math.random() * 600, 900, .05, .06, 'sine'); break;
      case 'stingR': tone(523, 523, .3, .1, 'sine'); tone(659, 659, .35, .08, 'sine', .05); break;
      case 'stingSR': [523, 659, 784].forEach((f, i) => tone(f, f, .4, .11, 'triangle', i * .06)); break;
      case 'stingSSR':
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, .8, .12, 'sine', i * .05));
        tone(130, 65, .9, .22, 'sine');
        noiseHit(.7, .1, 5000, true, .1);
        break;
      case 'questDone': [659, 784, 988, 1318].forEach((f, i) => tone(f, f, .25, .12, 'triangle', i * .09)); break;
      case 'switchChar': tone(600, 900, .08, .1, 'triangle'); break;
      case 'portal': tone(300, 1200, .4, .12, 'sine'); break;
      case 'bossRoar': tone(90, 45, .8, .3, 'sawtooth'); noiseHit(.6, .22, 300); break;
    }
  }
}

export const audio = new AudioEngine();
