/* NEON DRIFTER — audio engine
   Primary path: fetch + decodeAudioData into an AudioBuffer, played through
   BufferSource -> gain -> analyser -> destination. Sample-accurate seeking,
   independent of HTTP Range support, so scrubbing works on any dumb static
   server. Fallback chain: <audio> element (file://, where fetch() is blocked
   but media elements seek locally) -> virtual clock (visual-only mode) so the
   video always runs even with no audio device or autoplay block. */
(function () {
"use strict";

const SYNTH = {
  dawn: [0.16, 0.10, 0.04], ignition: [0.34, 0.20, 0.10],
  drive: [0.52, 0.36, 0.22], starlight: [0.18, 0.24, 0.12],
  convergence: [0.55, 0.42, 0.28], hyperdrive: [0.78, 0.55, 0.40],
  afterglow: [0.26, 0.20, 0.08],
};

const VOL = 0.9;

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

class AudioEngine {
  constructor(timeline) {
    this.tl = timeline;
    this.duration = timeline.duration;

    this.mode = "virtual";     // 'virtual' | 'real'
    this.vtime = 0;            // virtual clock (s)
    this.vplaying = false;
    this.attract = true;       // landing-screen preview loop
    this.audioAvailable = null; // null unknown, true/false after first attempt

    this.ctx = null; this.analyser = null; this.freq = null; this.gain = null;
    this.buffer = null;        // decoded AudioBuffer
    this.srcNode = null;       // live BufferSource (null = not playing)
    this.elFallback = null;    // <audio> element (file:// path only)
    this._offset = 0;          // playback offset at source start / while paused
    this._startedAt = 0;       // ctx.currentTime at source start
    this._stopToken = 0;       // guards onended against programmatic stops
    this._muted = false;

    this.en = { bass: 0, mid: 0, high: 0 };
    this.alive = false;        // analyser producing real data
    this._deadFor = 0;
    this._endedFired = false;
    this.onEnded = null;
  }

  _fireEnded() {
    if (this._endedFired) return;
    this._endedFired = true;
    if (this.onEnded) this.onEnded();
  }
  _clearEnded() { this._endedFired = false; }

  ensureGraph() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this._muted ? 0 : VOL;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.5;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  async _loadBuffer() {
    const res = await fetch(this.tl.audio);
    if (!res.ok) throw new Error("http " + res.status);
    const ab = await res.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(ab);
  }

  /* Call from a user gesture. Returns 'real' | 'virtual'. */
  async startReal(fromT) {
    this.attract = false;
    this._clearEnded();
    let ok = false;
    if (this.ensureGraph()) {
      try { if (this.ctx.state === "suspended") await withTimeout(this.ctx.resume(), 1200); } catch (e) { /* noop */ }

      // Path A: decoded buffer (best — accurate seek on any server)
      try {
        if (!this.buffer) await withTimeout(this._loadBuffer(), 9000);
        this.mode = "real";
        this.audioAvailable = true;
        this.vplaying = false;
        this.alive = false; this._deadFor = 0;
        this._playFrom(fromT || 0);
        ok = true;
      } catch (e) { ok = false; }

      // Path B: <audio> element (file:// — fetch is blocked there, but the
      // element streams local files and seeks them natively)
      if (!ok) {
        try {
          if (!this.elFallback) {
            const el = new Audio();
            el.src = this.tl.audio;
            el.preload = "auto";
            el.volume = VOL;
            el.addEventListener("ended", () => this._fireEnded());
            this.elFallback = el;
          }
          try { this.elFallback.currentTime = fromT || 0; } catch (e) { /* noop */ }
          await withTimeout(this.elFallback.play(), 2500);
          this.mode = "real";
          this.audioAvailable = true;
          this.vplaying = false;
          ok = true;
        } catch (e) { ok = false; }
      }
    }
    if (!ok) {
      this.mode = "virtual";
      this.audioAvailable = false;
      this.vtime = fromT || 0;
      this.vplaying = true;
    }
    return this.mode;
  }

  _playFrom(off) {
    this._stopSource();
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.connect(this.gain);
    const token = ++this._stopToken;
    s.onended = () => {
      if (token !== this._stopToken) return;   // superseded programmatically
      this.srcNode = null;
      this._offset = this.duration;
      this._fireEnded();
    };
    s.start(0, Math.max(0, Math.min(off, this.duration - 0.05)));
    this.srcNode = s;
    this._offset = off;
    this._startedAt = this.ctx.currentTime;
  }

  _stopSource() {
    this._stopToken++;                          // invalidate pending onended
    if (this.srcNode) {
      try { this.srcNode.onended = null; } catch (e) { /* noop */ }
      try { this.srcNode.stop(); } catch (e) { /* noop */ }
      try { this.srcNode.disconnect(); } catch (e) { /* noop */ }
      this.srcNode = null;
    }
  }

  play() {
    this._clearEnded();
    if (this.mode !== "real") { this.vplaying = true; return; }
    if (this.elFallback) {
      this.elFallback.play().catch(() => {});
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    if (!this.srcNode) this._playFrom(this._offset % Math.max(this.duration, 0.1));
  }

  pause() {
    if (this.mode !== "real") { this.vplaying = false; return; }
    if (this.elFallback) { this.elFallback.pause(); return; }
    if (this.srcNode) {
      this._offset = Math.min(this.time, this.duration - 0.05);
      this._stopSource();
    }
  }

  toggle() { (this.playing ? this.pause() : this.play()); }

  seek(t) {
    this._clearEnded();
    t = Math.max(0, Math.min(this.duration - 0.05, t));
    if (this.mode !== "real") { this.vtime = t; return t; }
    if (this.elFallback) { try { this.elFallback.currentTime = t; } catch (e) { /* noop */ } return t; }
    if (this.srcNode) this._playFrom(t);        // keep playing through the scrub
    else this._offset = t;
    return t;
  }

  restart() { this.seek(0); this.play(); }

  get playing() {
    if (this.mode !== "real") return this.vplaying;
    if (this.elFallback) return !this.elFallback.paused && !this.elFallback.ended;
    return !!this.srcNode;
  }

  get time() {
    if (this.mode !== "real") return this.vtime;
    if (this.elFallback) return this.elFallback.currentTime;
    if (!this.srcNode) return this._offset;
    return Math.min(this._offset + (this.ctx.currentTime - this._startedAt), this.duration);
  }

  get muted() { return this._muted; }
  set muted(m) {
    this._muted = m;
    if (this.gain) this.gain.gain.value = m ? 0 : VOL;
    if (this.elFallback) this.elFallback.muted = m;
  }

  /* per-frame */
  update(dt, sectionId) {
    if (this.mode === "real" && !this.elFallback && this.srcNode
        && this.time >= this.duration - 0.03) {
      // Timeline ends before the file's silent tail — cut over cleanly.
      this._stopSource();
      this._offset = this.duration;
      this._fireEnded();
    }
    if (this.mode === "virtual") {
      if (this.vplaying && !this.attract) {
        this.vtime += dt;
        if (this.vtime >= this.duration) { this.vtime = this.duration; this._fireEnded(); }
      } else if (this.vplaying && this.attract) {
        this.vtime = 2 + ((this.vtime + dt) % 30);   // loop dawn→ignition teaser
      }
    }
    this.updateEnergies(dt, sectionId);
  }

  updateEnergies(dt, sectionId) {
    let tb = 0, tm = 0, th = 0;
    let haveData = false;
    if (this.analyser && this.mode === "real" && this.playing) {
      this.analyser.getByteFrequencyData(this.freq);
      const f = this.freq;
      let sum = 0;
      for (let i = 1; i <= 3; i++) sum += f[i];
      tb = sum / (3 * 255);
      sum = 0;
      for (let i = 4; i <= 43; i++) sum += f[i];
      tm = sum / (40 * 255);
      sum = 0;
      for (let i = 44; i <= 191; i++) sum += f[i];
      th = sum / (148 * 255);
      haveData = true;
    }
    if (haveData) {
      const tot = tb + tm + th;
      if (tot < 0.003) {
        this._deadFor += dt;
        if (this._deadFor > 2.5) this.alive = false;
      } else {
        this._deadFor = 0;
        this.alive = true;
      }
    }
    if (!this.alive || !haveData) {
      const base = SYNTH[sectionId] || SYNTH.drive;
      const wob = 0.9 + 0.1 * Math.sin(performance.now() / 700);
      tb = base[0] * wob; tm = base[1] * wob; th = base[2] * wob;
    }
    const k = 1 - Math.exp(-dt * 10);
    this.en.bass += (tb - this.en.bass) * k;
    this.en.mid += (tm - this.en.mid) * k;
    this.en.high += (th - this.en.high) * k;
  }
}

window.AudioEngine = AudioEngine;
})();
