/* audio.js — fully synthesized horror soundscape (Web Audio, zero assets). */
"use strict";

const AudioSys = {
  ctx: null,
  master: null,
  sfxBus: null,
  ambBus: null,
  noiseBuf: null,
  started: false,
  volume: 0.8,
  listener: { x: 0, y: 0 },
  klaxonOn: false,
  klaxonNodes: null,
  droneNodes: null,
  heartNext: 0,
  heartRate: 0,     // beats/sec target, 0 = off
  _heartTimer: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 8;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.8; this.ambBus.connect(this.master);
    // shared noise buffer (2s white)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  },

  /* spatialization relative to listener */
  _spatial(x, y) {
    if (x == null) return { pan: 0, gain: 1 };
    const dx = x - this.listener.x, dy = y - this.listener.y;
    const d = Math.hypot(dx, dy);
    const gain = Math.max(0, 1 - d / 16) ** 1.4;
    const ang = Math.atan2(dy, dx) + 0; // world coords; up = forward
    const pan = Math.max(-1, Math.min(1, Math.sin(ang) * 0.85));
    return { pan, gain };
  },

  _chain(pan, gain, when, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    let node = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  },

  _osc(type, f0, f1, t0, dur, peak, dest, glideCurve) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  },

  _noise(t0, dur, peak, filterType, freq, q, dest, sweepTo) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 0.8;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.03, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
    return { src, f, g };
  },

  play(name, opts) {
    opts = opts || {};
    if (!this.ctx) return;
    this.resume();
    const c = this.ctx;
    const t0 = c.currentTime + 0.001;
    const sp = this._spatial(opts.x, opts.y);
    if (sp.gain <= 0.001 && !opts.global) return;
    const bus = this._chain(sp.pan, opts.global ? 1 : sp.gain);

    switch (name) {
      case "step": {
        const v = opts.sprint ? 0.5 : opts.crouch ? 0.08 : 0.22;
        this._noise(t0, 0.09, v * (opts.grate ? 1.6 : 1), "lowpass", opts.grate ? 2600 : 900, 1, bus);
        break;
      }
      case "monstep": {
        this._noise(t0, 0.16, 0.9, "lowpass", 220, 1, bus);
        this._osc("sine", 55, 30, t0, 0.22, 0.7, bus);
        break;
      }
      case "screech": {
        // signature sting: rising saw cluster + shrieking noise
        for (const [f0, f1] of [[180, 1400], [240, 1900], [320, 2400]]) {
          this._osc("sawtooth", f0, f1, t0, 0.85, 0.16, bus);
        }
        this._noise(t0, 1.0, 0.5, "bandpass", 1800, 2, bus, 4200);
        this._osc("square", 90, 45, t0, 0.5, 0.25, bus);
        break;
      }
      case "spotted": {
        this._osc("sawtooth", 400, 800, t0, 0.18, 0.14, bus);
        this._noise(t0, 0.25, 0.2, "highpass", 3000, 1, bus);
        break;
      }
      case "heartbeat": {
        this._osc("sine", 62, 40, t0, 0.12, 0.55, bus);
        this._osc("sine", 58, 38, t0 + 0.14, 0.10, 0.35, bus);
        break;
      }
      case "power_on": {
        this._osc("sawtooth", 40, 110, t0, 1.6, 0.22, bus);
        this._osc("sine", 55, 110, t0 + 0.1, 1.6, 0.2, bus);
        this._noise(t0, 0.5, 0.15, "bandpass", 120, 2, bus, 700);
        break;
      }
      case "hum_on": {
        this._osc("sine", 100, 100, t0, 2.2, 0.06, bus);
        this._osc("sine", 150, 150, t0, 2.2, 0.03, bus);
        break;
      }
      case "door": {
        this._noise(t0, 0.4, 0.28, "bandpass", 300, 3, bus, 160);
        this._osc("sine", 80, 50, t0, 0.35, 0.2, bus);
        break;
      }
      case "door_locked": {
        this._noise(t0, 0.12, 0.3, "bandpass", 500, 4, bus);
        this._noise(t0 + 0.08, 0.12, 0.25, "bandpass", 420, 4, bus);
        break;
      }
      case "locker": {
        this._noise(t0, 0.15, 0.4, "bandpass", 700, 5, bus);
        this._noise(t0 + 0.1, 0.2, 0.25, "bandpass", 250, 3, bus);
        break;
      }
      case "locker_rip": {
        this._noise(t0, 0.5, 0.7, "bandpass", 900, 2, bus, 200);
        this._osc("sawtooth", 200, 60, t0, 0.5, 0.4, bus);
        break;
      }
      case "pickup": {
        this._osc("triangle", 520, 700, t0, 0.09, 0.16, bus);
        break;
      }
      case "drop": {
        this._osc("triangle", 500, 260, t0, 0.12, 0.14, bus);
        break;
      }
      case "fuse_in": {
        this._osc("square", 200, 200, t0, 0.07, 0.12, bus);
        this._osc("triangle", 700, 900, t0 + 0.1, 0.12, 0.16, bus);
        this._noise(t0, 0.1, 0.2, "bandpass", 1400, 3, bus);
        break;
      }
      case "switch_clunk": {
        this._osc("square", 120, 60, t0, 0.18, 0.35, bus);
        this._noise(t0, 0.25, 0.4, "lowpass", 500, 1, bus);
        break;
      }
      case "dish_howl": {
        // antennas scream while aligning
        const base = 600 + Math.random() * 500;
        this._osc("sawtooth", base, base * 1.5, t0, 0.7, 0.07, bus);
        this._osc("sawtooth", base * 1.02, base * 0.6, t0 + 0.05, 0.65, 0.05, bus);
        break;
      }
      case "dish_done": {
        this._osc("sawtooth", 800, 200, t0, 1.1, 0.12, bus);
        this._osc("sine", 160, 80, t0, 0.9, 0.25, bus);
        break;
      }
      case "decode_beep": {
        this._osc("square", 940, 940, t0, 0.06, 0.07, bus);
        break;
      }
      case "decoded": {
        this._osc("sine", 1100, 1100, t0, 0.12, 0.12, bus);
        this._osc("sine", 1350, 1350, t0 + 0.15, 0.12, 0.12, bus);
        this._osc("sine", 1700, 1700, t0 + 0.3, 0.2, 0.12, bus);
        this._noise(t0 + 0.55, 1.4, 0.3, "bandpass", 2400, 3, bus, 300);
        break;
      }
      case "whisper": {
        // breathy formant sweeps
        for (let i = 0; i < 5; i++) {
          const st = t0 + i * 0.28 + Math.random() * 0.1;
          this._noise(st, 0.32, 0.11, "bandpass", 700 + Math.random() * 900, 8, bus, 400 + Math.random() * 600);
        }
        this._osc("sine", 66, 52, t0, 1.8, 0.12, bus);
        break;
      }
      case "blackout_thud": {
        this._osc("sine", 70, 28, t0, 1.1, 0.7, bus);
        this._noise(t0, 0.7, 0.35, "lowpass", 300, 1, bus, 80);
        break;
      }
      case "klaxon": {
        this._osc("square", 480, 480, t0, 0.42, 0.12, bus);
        this._osc("square", 360, 360, t0 + 0.46, 0.42, 0.12, bus);
        break;
      }
      case "lever": {
        this._noise(t0, 0.2, 0.4, "bandpass", 800, 3, bus, 300);
        this._osc("square", 150, 70, t0 + 0.12, 0.2, 0.3, bus);
        break;
      }
      case "creak": {
        this._osc("sawtooth", 130 + Math.random() * 80, 60 + Math.random() * 40, t0, 0.8, 0.05, bus);
        break;
      }
      case "ping": {
        this._osc("sine", 1150, 1150, t0, 0.14, 0.14, bus);
        this._osc("sine", 1550, 1550, t0 + 0.09, 0.12, 0.09, bus);
        break;
      }
      case "chat": {
        this._osc("triangle", 720, 720, t0, 0.07, 0.1, bus);
        break;
      }
      case "ui": {
        this._osc("triangle", 480, 520, t0, 0.05, 0.09, bus);
        break;
      }
      case "revived": {
        this._osc("sine", 330, 440, t0, 0.3, 0.14, bus);
        this._osc("sine", 440, 550, t0 + 0.18, 0.35, 0.12, bus);
        break;
      }
      case "win": {
        const seq = [392, 466, 587, 782];
        seq.forEach((f, i) => this._osc("sine", f, f, t0 + i * 0.22, 0.5, 0.14, bus));
        this._osc("sine", 98, 98, t0, 1.4, 0.2, bus);
        break;
      }
      case "lose": {
        this._osc("sawtooth", 160, 40, t0, 2.4, 0.24, bus);
        this._osc("sine", 82, 36, t0, 2.6, 0.3, bus);
        this._noise(t0 + 0.4, 2.0, 0.2, "lowpass", 500, 1, bus, 100);
        break;
      }
    }
  },

  startAmbient(mode) {
    if (!this.ctx) return;
    this.resume();
    this.stopAmbient();
    const c = this.ctx;
    const nodes = [];
    // deep drone
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = mode === "power" ? 240 : 140; lp.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = mode === "power" ? 0.16 : 0.11;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 0.04;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.ambBus);
    src.start(); lfo.start();
    nodes.push(src, lfo);
    // airy high shimmer (very quiet)
    const src2 = c.createBufferSource();
    src2.buffer = this.noiseBuf; src2.loop = true; src2.playbackRate.value = 0.5;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = mode === "power" ? 3200 : 2100; bp.Q.value = 14;
    const g2 = c.createGain(); g2.gain.value = 0.014;
    src2.connect(bp); bp.connect(g2); g2.connect(this.ambBus);
    src2.start();
    nodes.push(src2);
    this.droneNodes = { nodes, g };
  },

  stopAmbient() {
    if (!this.droneNodes) return;
    try {
      this.droneNodes.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
      const ns = this.droneNodes.nodes;
      setTimeout(() => ns.forEach(n => { try { n.stop(); } catch (e) {} }), 1500);
    } catch (e) {}
    this.droneNodes = null;
  },

  setKlaxon(on) {
    if (on === this.klaxonOn) return;
    this.klaxonOn = on;
    if (on && this.ctx) {
      const tickFn = () => {
        if (!this.klaxonOn) return;
        this.play("klaxon", { global: true });
        setTimeout(tickFn, 1900);
      };
      tickFn();
    }
  },

  /* proximity heartbeat — call each frame with monster distance (or Infinity) */
  updateHeartbeat(monDist) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let rate = 0;
    if (monDist < 9) rate = 0.9 + (9 - monDist) * 0.34;   // up to ~3.7/s
    this.heartRate = rate;
    if (rate > 0 && now >= this.heartNext) {
      this.play("heartbeat", {});
      this.heartNext = now + 1 / rate;
    }
  },
};
