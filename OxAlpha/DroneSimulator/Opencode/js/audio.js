(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const Audio = {
    ctx: null,
    master: null,
    enabled: true,
    _started: false,

    init() {
      if (this._started) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) { return; }
      this._started = true;
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = DS.settings ? DS.settings.volume : 0.7;
      this.master.connect(ctx.destination);

      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
      this.motorFilter = ctx.createBiquadFilter(); this.motorFilter.type = "lowpass";
      this.motorFilter.frequency.value = 900; this.motorFilter.Q.value = 2;
      this.oscA = ctx.createOscillator(); this.oscA.type = "sawtooth"; this.oscA.frequency.value = 80;
      this.oscB = ctx.createOscillator(); this.oscB.type = "square"; this.oscB.frequency.value = 41;
      const gB = ctx.createGain(); gB.gain.value = 0.55;
      this.oscA.connect(this.motorFilter);
      this.oscB.connect(gB); gB.connect(this.motorFilter);
      this.motorFilter.connect(this.motorGain); this.motorGain.connect(this.master);
      this.oscA.start(); this.oscB.start();

      this.windSrc = ctx.createBufferSource(); this.windSrc.buffer = this.noiseBuf; this.windSrc.loop = true;
      this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = "bandpass";
      this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      this.windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      this.windSrc.start();
    },

    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    suspend() { if (this.ctx && this.ctx.state === "running") this.ctx.suspend(); },
    setEnabled(on) {
      this.enabled = on;
      if (!on) { if (this.master) this.master.gain.value = 0; }
    },
    setVolume(v) { if (this.master && this.enabled) this.master.gain.value = v; },

    update(throttleEff, speed) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const f = 62 + throttleEff * 175 + speed * 0.5;
      this.oscA.frequency.setTargetAtTime(f, t, 0.06);
      this.oscB.frequency.setTargetAtTime(f * 0.51, t, 0.06);
      this.motorFilter.frequency.setTargetAtTime(500 + throttleEff * 1400, t, 0.08);
      this.motorGain.gain.setTargetAtTime(0.028 + throttleEff * 0.11, t, 0.07);
      const w = clamp((speed / 30) * (speed / 30), 0, 1);
      this.windGain.gain.setTargetAtTime(w * 0.16, t, 0.12);
      this.windFilter.frequency.setTargetAtTime(380 + w * 900, t, 0.15);
    },

    idleDown() {
      if (!this.ctx || !this.enabled || !this.master) return;
      const t = this.ctx.currentTime;
      this.motorGain.gain.setTargetAtTime(0, t, 0.25);
      this.windGain.gain.setTargetAtTime(0, t, 0.25);
    },

    blip(freq, dur, type, vol, slideTo) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    },

    gate() { this.blip(880, 0.12, "square", 0.14, 1420); },
    countdownTick() { this.blip(620, 0.1, "square", 0.16); },
    countdownGo() { this.blip(990, 0.3, "square", 0.2); },
    lowBat() { this.blip(1180, 0.09, "sine", 0.2); setTimeout(() => this.blip(940, 0.12, "sine", 0.2), 130); },
    record() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, "triangle", 0.22), i * 110));
    },

    crash() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = "lowpass";
      f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(90, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.6);
      this.blip(190, 0.4, "sawtooth", 0.3, 42);
    }
  };

  DS.Audio = Audio;
})();
