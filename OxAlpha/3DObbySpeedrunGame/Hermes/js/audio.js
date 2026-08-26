/* SKYRUSH — procedural WebAudio SFX + ambient music (created on first user gesture) */
"use strict";
const AudioSys = {
  ctx: null, master: null, musicGain: null, musicOn: true, started: false,

  init() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      this.started = true;
      this._startMusic();
    } catch (e) { /* audio unavailable — game still works */ }
  },
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

  _env(gainNode, t0, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(sustain, t0 + a + d);
  },

  _tone({ type = "square", f0 = 440, f1 = null, dur = 0.15, vol = 0.2, delay = 0, slideT = null }) {
    if (!this.started) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + (slideT || dur));
    this._env(g, t0, 0.008, vol, dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  },

  _noise({ dur = 0.2, vol = 0.2, f0 = 800, f1 = null, q = 1, type = "bandpass", delay = 0 }) {
    if (!this.started) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    if (f1 != null) flt.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, 0.01, vol, dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },

  jump()   { this._tone({ type: "square", f0: 300, f1: 620, dur: 0.13, vol: 0.14 }); },
  land(p)  { this._noise({ dur: 0.11, vol: Math.min(0.3, 0.08 + p * 0.25), f0: 220, f1: 90, type: "lowpass" }); },
  dash()   { this._noise({ dur: 0.28, vol: 0.22, f0: 500, f1: 3200, q: 2 });
             this._tone({ type: "sawtooth", f0: 180, f1: 520, dur: 0.18, vol: 0.07 }); },
  slide()  { this._noise({ dur: 0.3, vol: 0.12, f0: 900, f1: 300, q: 0.8 }); },
  walljump(){ this._tone({ type: "triangle", f0: 240, f1: 480, dur: 0.12, vol: 0.15 }); this._noise({dur:.09,vol:.09,f0:1200,f1:400}); },
  checkpoint() { this._tone({ type:"sine", f0:660, dur:.16, vol:.2 });
                 this._tone({ type:"sine", f0:990, dur:.24, vol:.2, delay:.09 }); },
  hazard() { this._tone({ type:"sawtooth", f0:160, f1:70, dur:.22, vol:.2 });
             this._noise({ dur:.18, vol:.15, f0:300, f1:100, type:"lowpass" }); },
  boost()  { this._tone({ type:"sawtooth", f0:200, f1:700, dur:.2, vol:.12 }); },
  step()   { this._noise({ dur:.05, vol:.05, f0:500+Math.random()*250, f1:150, type:"lowpass" }); },
  finish(medal) {
    const notes = medal === "gold" ? [523,659,784,1047,1319] : [523,659,784,1047];
    notes.forEach((f, i) => this._tone({ type:"triangle", f0:f, dur:.34, vol:.18, delay:i*.11 }));
    this._noise({ dur:.6, vol:.12, f0:4000, f1:6000, q:.5, delay:.45 });
  },

  /* soft ambient pad + slow arp */
  _startMusic() {
    if (!this.started) return;
    const ctx = this.ctx;
    const chords = [[110,164.8,196], [98,146.8,174.6], [87.3,130.8,155.6], [103.8,155.6,185]];
    let bar = 0;
    const pad = () => {
      if (!this.musicOn) { setTimeout(pad, 4000); return; }
      const t0 = ctx.currentTime + 0.05, ch = chords[bar % chords.length]; bar++;
      ch.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 0 ? "sine" : "triangle"; o.frequency.value = f;
        o.detune.value = U.rand(-6, 6);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 1.6);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 4.4);
        o.connect(g); g.connect(this.musicGain);
        o.start(t0); o.stop(t0 + 4.6);
      });
      // sparse arp plink
      for (let k = 0; k < 3; k++) {
        const f = ch[k % ch.length] * (k === 2 ? 4 : 2);
        const t = t0 + 0.9 + k * 1.15;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 1.1);
      }
      setTimeout(pad, 4200);
    };
    pad();
  },
  toggleMusic() { this.musicOn = !this.musicOn; return this.musicOn; },
};
