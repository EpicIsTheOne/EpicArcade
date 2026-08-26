/* Audio engine: decode song, sample-accurate position, SFX synth, volume. */
(function () {
  "use strict";

  const Audio = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    buffer: null,
    source: null,
    anchorCtx: 0,     // ctx.currentTime when playback (re)started
    anchorPos: 0,     // song position at that moment (seconds, can be negative)
    playing: false,
    volume: 0.8,
    ready: false,

    ensureCtx() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 1.0;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.master);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },

    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    },

    async load(url) {
      const ctx = this.ensureCtx();
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("song fetch failed: " + resp.status);
      const arr = await resp.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(arr);
      this.ready = true;
      return this.buffer;
    },

    // Start playback at song position `pos` seconds (may be negative => delayed start).
    play(pos) {
      this.stop();
      const ctx = this.ensureCtx();
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.musicGain);
      const lat = Math.min(Math.max(ctx.outputLatency || 0, 0), 0.15);
      if (pos < 0) {
        src.start(ctx.currentTime + (-pos) + lat, 0);
      } else {
        src.start(ctx.currentTime, Math.min(pos, this.buffer.duration - 0.01));
      }
      this.source = src;
      // anchor maps ctx.currentTime -> song position the listener hears
      this.anchorCtx = ctx.currentTime + lat;
      this.anchorPos = pos;
      this.playing = true;
      return src;
    },

    stop() {
      if (this.source) {
        try { this.source.stop(); } catch (e) { /* already stopped */ }
        try { this.source.disconnect(); } catch (e) { /* noop */ }
        this.source = null;
      }
      this.playing = false;
    },

    // quick fade then stop (used on fail)
    fadeOutStop(dur) {
      if (!this.ctx || !this.source) { this.stop(); return; }
      const g = this.musicGain.gain;
      g.setTargetAtTime(0.0001, this.ctx.currentTime, (dur || 0.25) / 3);
      const src = this.source;
      setTimeout(() => {
        try { src.stop(); src.disconnect(); } catch (e) { /* noop */ }
        g.setValueAtTime(1, this.ctx.currentTime + 0.05);
      }, (dur || 0.25) * 1000 + 60);
      this.source = null;
      this.playing = false;
    },

    // Current song position in seconds (negative during countdown).
    pos() {
      if (!this.ctx || !this.playing) return this.anchorPos;
      return this.anchorPos + (this.ctx.currentTime - this.anchorCtx);
    },

    seek(pos) { this.play(pos); },

    // ---------------- SFX (procedural) ----------------
    blip(freq, dur, type, vol, slide) {
      if (!this.ctx) return;
      const ctx = this.ensureCtx();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },

    noiseHit(dur, vol, hp) {
      if (!this.ctx) return;
      const ctx = this.ensureCtx();
      const t = ctx.currentTime;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 3000;
      const g = ctx.createGain(); g.gain.value = vol || 0.15;
      s.connect(f); f.connect(g); g.connect(this.sfxGain);
      s.start(t);
    },

    // judgment ticks
    sfxSick()  { this.blip(1250, 0.07, "triangle", 0.12, 1.4); },
    sfxGood()  { this.blip(880, 0.06, "triangle", 0.09); },
    sfxBad()   { this.blip(300, 0.09, "sawtooth", 0.07, 0.7); },
    sfxMiss()  { this.blip(160, 0.18, "sawtooth", 0.12, 0.5); this.noiseHit(0.1, 0.06, 900); },
    sfxCount(finalBeat) {
      if (finalBeat) { this.blip(1320, 0.16, "square", 0.16, 1.5); this.blip(1980, 0.16, "square", 0.08); }
      else this.blip(660, 0.09, "square", 0.12);
    },
    sfxSelect()  { this.blip(740, 0.07, "square", 0.12, 1.6); },
    sfxConfirm() { this.blip(520, 0.09, "square", 0.14, 2.1); this.blip(1040, 0.14, "triangle", 0.1, 1.5); },
    sfxBack()    { this.blip(420, 0.09, "square", 0.1, 0.6); },
    sfxWin() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, "triangle", 0.14, 1.2), i * 110));
    },
    sfxLose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.3, "sawtooth", 0.12, 0.85), i * 140));
    },
  };

  window.AudioEngine = Audio;
})();
