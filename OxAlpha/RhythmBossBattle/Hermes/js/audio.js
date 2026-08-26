/* ============================================================
 * PULSEBREAK (PBK.v1) — js/audio.js
 * Pure WebAudio synth + look-ahead scheduler. No assets, no CDN.
 * ============================================================ */
window.RB = window.RB || {};

(function (RB) {
  'use strict';

  const LOOKAHEAD = 0.16;   // seconds scheduled ahead
  const TICK_MS = 30;

  function midiF(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  class AudioEngine {
    constructor(song) {
      this.song = song;
      this.ctx = null;
      this.t0 = 0;
      this.ptr = 0;
      this.timer = null;
      this.active = new Set();
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.delaySend = null;
      this.noiseBuf = null;
      this.muted = false;
      this.finished = false;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5;
      comp.attack.value = 0.004; comp.release.value = 0.18;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(comp); comp.connect(ctx.destination);

      this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.85; this.musicGain.connect(this.master);
      this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);

      // shared echo bus
      const dl = ctx.createDelay(1); dl.delayTime.value = 0.23;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const wet = ctx.createGain(); wet.gain.value = 0.17;
      dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(this.musicGain);
      this.delaySend = dl;

      // shared noise buffer (2s)
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }

    // ---- transport ----------------------------------------------------
    start(offset = 0) {
      this.init();
      this.stopAll();
      this.ctx.resume();
      const ev = this.song.ev;
      let lo = 0, hi = ev.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ev[mid].t < offset - 0.02) lo = mid + 1; else hi = mid; }
      this.ptr = lo;
      this.t0 = this.ctx.currentTime + 0.12 - offset;
      this.finished = false;
      if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
      this.tick();
    }

    seek(offset) { this.start(offset); }

    songTime() { return this.ctx ? this.ctx.currentTime - this.t0 : 0; }

    stopAll() {
      for (const entry of this.active) {
        try { entry.src.stop(); } catch (e) { /* already stopped */ }
        try { entry.src.disconnect(); } catch (e) { /* */ }
      }
      this.active.clear();
    }

    dispose() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      this.stopAll();
      if (this.ctx) { this.ctx.close(); this.ctx = null; }
    }

    tick() {
      if (!this.ctx || this.finished) return;
      const now = this.songTime();
      const ev = this.song.ev;
      while (this.ptr < ev.length && ev[this.ptr].t < now + LOOKAHEAD) {
        const e = ev[this.ptr++];
        const when = Math.max(this.t0 + e.t, this.ctx.currentTime + 0.001);
        this.voice(e, when);
      }
      if (this.ptr >= ev.length && now > this.song.songDur + 1.5) {
        this.finished = true;
      }
    }

    track(src) {
      const entry = { src };
      this.active.add(entry);
      src.onended = () => this.active.delete(entry);
      return entry;
    }

    // ---- instruments ---------------------------------------------------
    env(gainNode, when, a, peak, dec) {
      const g = gainNode.gain;
      g.setValueAtTime(0.0001, when);
      g.linearRampToValueAtTime(peak, when + a);
      g.exponentialRampToValueAtTime(0.0001, when + a + dec);
    }

    noiseSrc(when, dur) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf; s.loop = true;
      s.start(when); s.stop(when + dur + 0.05);
      return s;
    }

    voice(e, when) {
      switch (e.k) {
        case 'kick': this.kick(when, e.v); break;
        case 'snare': this.snare(when, e.v); break;
        case 'hat': this.hat(when, e.v); break;
        case 'crash': this.crash(when, e.v); break;
        case 'bass': this.bass(when, midiF(e.m), e.d, e.v); break;
        case 'pad': this.pad(when, e.ch, e.d, e.v); break;
        case 'lead': this.lead(when, midiF(e.m), e.d, e.v); break;
        case 'stab': this.stab(when, e.ch, e.v); break;
        case 'tick': this.tickTock(when, e.hi); break;
        case 'surgeSfx': this.riser(when, 0.35, e.v); break;
      }
    }

    kick(when, v) {
      const c = this.ctx, out = c.createGain();
      out.connect(this.musicGain);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, when);
      o.frequency.exponentialRampToValueAtTime(43, when + 0.09);
      out.gain.setValueAtTime(v * 1.05, when);
      out.gain.exponentialRampToValueAtTime(0.001, when + 0.24);
      o.connect(out); o.start(when); o.stop(when + 0.26); this.track(o);
    }

    snare(when, v) {
      const c = this.ctx, out = c.createGain();
      out.connect(this.musicGain);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
      const n = this.noiseSrc(when, 0.18); n.connect(bp); bp.connect(out); this.track(n);
      this.env(out, when, 0.002, v * 0.55, 0.16);
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(196, when);
      const og = c.createGain(); og.gain.setValueAtTime(v * 0.3, when);
      og.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
      o.connect(og); og.connect(this.musicGain); o.start(when); o.stop(when + 0.1); this.track(o);
    }

    hat(when, v) {
      const c = this.ctx, out = c.createGain();
      out.connect(this.musicGain);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7800;
      const n = this.noiseSrc(when, 0.06); n.connect(hp); hp.connect(out); this.track(n);
      this.env(out, when, 0.001, v * 0.34, 0.045);
    }

    crash(when, v) {
      const c = this.ctx, out = c.createGain();
      out.connect(this.musicGain);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
      const n = this.noiseSrc(when, 1.3); n.connect(hp); hp.connect(out); this.track(n);
      this.env(out, when, 0.004, v * 0.3, 1.25);
    }

    bass(when, f, dur, v) {
      const c = this.ctx, out = c.createGain();
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 430; lp.Q.value = 0.7;
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = f / 2;
      const g2 = c.createGain(); g2.gain.value = 0.5;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(out); out.connect(this.musicGain);
      this.env(out, when, 0.006, v * 0.5, dur);
      o1.start(when); o2.start(when);
      o1.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
      this.track(o1); this.track(o2);
    }

    pad(when, ch, dur, v) {
      const c = this.ctx, out = c.createGain();
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 880;
      lp.connect(out); out.connect(this.musicGain);
      for (const m of ch) {
        for (const det of [-4, 4]) {
          const o = c.createOscillator(); o.type = 'triangle';
          o.frequency.value = midiF(m); o.detune.value = det;
          o.connect(lp); o.start(when); o.stop(when + dur + 0.7); this.track(o);
        }
      }
      const g = out.gain;
      g.setValueAtTime(0.0001, when);
      g.linearRampToValueAtTime(v * 0.16, when + 0.35);
      g.setValueAtTime(v * 0.16, when + dur * 0.7);
      g.linearRampToValueAtTime(0.0001, when + dur + 0.55);
    }

    lead(when, f, dur, v) {
      const c = this.ctx, out = c.createGain();
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      for (const det of [-7, 7]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start(when); o.stop(when + dur + 0.15); this.track(o);
      }
      lp.connect(out); out.connect(this.musicGain);
      const send = c.createGain(); send.gain.value = 0.6;
      out.connect(send); send.connect(this.delaySend);
      this.env(out, when, 0.012, v * 0.24, dur + 0.08);
    }

    stab(when, ch, v) {
      const c = this.ctx, out = c.createGain();
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
      hp.connect(out); out.connect(this.musicGain);
      for (const m of ch) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiF(m + 12);
        o.connect(hp); o.start(when); o.stop(when + 0.32); this.track(o);
      }
      this.env(out, when, 0.004, v * 0.3, 0.28);
    }

    tickTock(when, hi) {
      const c = this.ctx, out = c.createGain();
      out.connect(this.musicGain);
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = hi ? 1568 : 1046;
      o.connect(out);
      this.env(out, when, 0.001, 0.18, 0.06);
      o.start(when); o.stop(when + 0.09); this.track(o);
    }

    riser(when, dur, v) {
      const c = this.ctx, out = c.createGain();
      out.connect(this.musicGain);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, when);
      bp.frequency.exponentialRampToValueAtTime(3600, when + dur);
      const n = this.noiseSrc(when, dur); n.connect(bp); bp.connect(out); this.track(n);
      this.env(out, when, dur * 0.8, v * 0.3, dur * 0.25);
    }

    // ---- SFX (routed to sfx bus) ---------------------------------------
    sfxHit(judge) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      const out = c.createGain(); out.connect(this.sfxGain);
      o.frequency.value = judge === 'P' ? 1318 : 880;
      o.frequency.exponentialRampToValueAtTime(judge === 'P' ? 1976 : 1175, t + 0.05);
      this.env(out, t, 0.002, judge === 'P' ? 0.3 : 0.2, 0.08);
      o.connect(out); o.start(t); o.stop(t + 0.12);
    }

    sfxMiss() {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = 'square';
      const out = c.createGain(); out.connect(this.sfxGain);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
      o.connect(lp); lp.connect(out);
      this.env(out, t, 0.003, 0.32, 0.17);
      o.start(t); o.stop(t + 0.22);
    }

    sfxBlock() {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const out = c.createGain(); out.connect(this.sfxGain);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
      hp.connect(out);
      for (const f of [523, 784]) {
        const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
        o.connect(hp); o.start(t); o.stop(t + 0.13);
      }
      this.env(out, t, 0.001, 0.22, 0.11);
    }

    sfxSpecial() {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      this.riser(t, 0.28, 0.9);
      const o = c.createOscillator(); o.type = 'sine';
      const out = c.createGain(); out.connect(this.sfxGain);
      o.frequency.setValueAtTime(180, t + 0.26);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.44);
      out.gain.setValueAtTime(0.0001, t + 0.26);
      out.gain.linearRampToValueAtTime(0.85, t + 0.27);
      out.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      o.connect(out); o.start(t + 0.26); o.stop(t + 0.8);
    }

    sfxBossHurtBig() {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const out = c.createGain(); out.connect(this.sfxGain);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
      const n = this.noiseSrc(t, 0.4); n.connect(bp); bp.connect(out);
      this.env(out, t, 0.005, 0.4, 0.38);
    }

    sfxUi() {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 660;
      const out = c.createGain(); out.connect(this.sfxGain);
      this.env(out, t, 0.002, 0.18, 0.07);
      o.connect(out); o.start(t); o.stop(t + 0.1);
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
      return this.muted;
    }

    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  }

  RB.AudioEngine = AudioEngine;

})(window.RB);
