(function () {
  class BeatDetector {
    constructor() {
      this.hist = [];
      this.lastT = -9;
      this.pulse = 0;
      this.flash = 0;
      this.count = 0;
    }
    update(energy, now, dt) {
      this.hist.push(energy);
      if (this.hist.length > 48) this.hist.shift();
      let sum = 0;
      for (const v of this.hist) sum += v;
      const avg = sum / this.hist.length;
      let beat = false;
      if (this.hist.length >= 12 && energy > avg * 1.34 + 0.012 && now - this.lastT > 0.24) {
        beat = true;
        this.lastT = now;
        this.count++;
        this.pulse = 1;
        this.flash = 1;
      }
      const decay = Math.exp(-dt * 4.2);
      this.pulse *= decay;
      this.flash *= Math.exp(-dt * 6.5);
      return beat;
    }
  }

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.analyser = null;
      this.volGain = null;
      this.buffer = null;
      this.source = null;
      this._token = 0;
      this._startCtx = 0;
      this.playing = false;
      this.offset = 0;
      this.duration = 0;
      this.volume = 0.9;
      this.muted = false;
      this.trackName = '';
      this.isDemo = false;
      this.onTrackEnd = null;
      this.onStateChange = null;
      this.fftSize = 4096;
      this.freq = new Uint8Array(1024);
      this.time = new Uint8Array(2048);
      this.beat = new BeatDetector();
      this._bands = { bass: 0, mid: 0, treble: 0, level: 0 };
    }
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = 0.82;
        this.volGain = this.ctx.createGain();
        this.volGain.gain.value = this.muted ? 0 : this.volume * this.volume;
        this.analyser.connect(this.volGain);
        this.volGain.connect(this.ctx.destination);
        this.freq = new Uint8Array(this.analyser.frequencyBinCount);
        this.time = new Uint8Array(this.analyser.fftSize);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    decode(arrayBuffer) {
      this.ensure();
      const ctx = this.ctx;
      return new Promise((res, rej) => {
        const p = ctx.decodeAudioData(arrayBuffer, res, rej);
        if (p && p.then) p.then(res, rej);
      });
    }
    loadBuffer(buf, name) {
      this.stop();
      this.buffer = buf;
      this.duration = buf.duration;
      this.offset = 0;
      this.trackName = name || 'Untitled';
      this.isDemo = false;
    }
    _spawnSource(startOff) {
      const tok = ++this._token;
      const s = this.ctx.createBufferSource();
      s.buffer = this.buffer;
      s.connect(this.analyser);
      s.onended = () => {
        if (tok !== this._token) return;
        this.playing = false;
        this.source = null;
        this.offset = this.duration;
        this._emit();
        if (this.onTrackEnd) this.onTrackEnd();
      };
      s.start(0, startOff);
      this.source = s;
      this._startCtx = this.ctx.currentTime;
      this.playing = true;
      this.offset = startOff;
      this._emit();
    }
    play() {
      if (!this.buffer || this.playing) return;
      this.ensure();
      if (this.offset >= this.duration - 0.02) this.offset = 0;
      this._spawnSource(this.offset);
    }
    pause() {
      if (!this.playing) return;
      this.offset = this.position;
      this._stopSource();
      this.playing = false;
      this._emit();
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    _stopSource() {
      this._token++;
      if (this.source) {
        try { this.source.stop(); } catch (e) {}
        try { this.source.disconnect(); } catch (e) {}
        this.source = null;
      }
    }
    stop() {
      this._stopSource();
      this.playing = false;
      this.offset = 0;
      this._emit();
    }
    seek(t) {
      if (!this.buffer) return;
      t = U.clamp(t, 0, Math.max(0, this.duration - 0.01));
      const wasPlaying = this.playing;
      this._stopSource();
      this.playing = false;
      this.offset = t;
      if (wasPlaying) this._spawnSource(t);
      else this._emit();
    }
    get position() {
      if (this.playing && this.ctx) return Math.min(this.duration, this.offset + (this.ctx.currentTime - this._startCtx));
      return this.offset;
    }
    setVolume(v) {
      this.volume = U.clamp(v, 0, 1);
      this._applyVol();
    }
    setMuted(m) {
      this.muted = !!m;
      this._applyVol();
    }
    _applyVol() {
      if (this.volGain && this.ctx) this.volGain.gain.setTargetAtTime(this.muted ? 0 : this.volume * this.volume, this.ctx.currentTime, 0.03);
    }
    setSmoothing(v) {
      if (this.analyser) this.analyser.smoothingTimeConstant = U.clamp(v, 0, 1);
    }
    read() {
      if (!this.analyser) return false;
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.time);
      return true;
    }
    computeBands(out) {
      out = out || this._bands;
      if (!this.ctx) return out;
      const nyq = this.ctx.sampleRate / 2;
      const bins = this.analyser.frequencyBinCount;
      const hz = nyq / bins;
      const avg = (f1, f2) => {
        let i0 = U.clamp(Math.floor(f1 / hz), 0, bins - 1);
        let i1 = U.clamp(Math.ceil(f2 / hz), i0 + 1, bins);
        let s = 0;
        for (let i = i0; i < i1; i++) s += this.freq[i];
        return s / ((i1 - i0) * 255);
      };
      out.bass = avg(30, 150);
      out.mid = avg(150, 2200);
      out.treble = avg(2200, 11000);
      let s = 0;
      for (let i = 0; i < this.time.length; i += 2) {
        const v = (this.time[i] - 128) / 128;
        s += v * v;
      }
      out.level = Math.sqrt(s / (this.time.length / 2));
      return out;
    }
    _emit() { if (this.onStateChange) this.onStateChange(); }
  }
  window.AudioEngine = AudioEngine;
})();
