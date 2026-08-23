// ISLEBREAK audio: fully procedural WebAudio SFX (no assets).
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // noise buffer
      const len = this.ctx.sampleRate * 1.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.enabled = false; }
  }
  resume() { this.ensure(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  _noise(dur, gain, filterFreq, type = 'lowpass', slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  _tone(freq, dur, gain, type = 'square', slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, arg) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || this.ctx.state === 'suspended') { this.ctx?.resume(); }
    switch (name) {
      case 'shoot': {
        if (arg === 'SHOTGUN') { this._noise(0.28, 0.5, 900, 'lowpass', 200); this._tone(90, 0.18, 0.35, 'sawtooth', 45); }
        else if (arg === 'SNIPER') { this._noise(0.4, 0.5, 1400, 'lowpass', 150); this._tone(140, 0.3, 0.3, 'sawtooth', 50); }
        else if (arg === 'SMG') { this._noise(0.09, 0.32, 2200, 'bandpass'); this._tone(220, 0.05, 0.18, 'square', 120); }
        else if (arg === 'LAUNCHER') { this._noise(0.5, 0.55, 500, 'lowpass', 100); this._tone(70, 0.4, 0.4, 'sawtooth', 40); }
        else { this._noise(0.12, 0.4, 1800, 'bandpass'); this._tone(180, 0.08, 0.25, 'square', 90); }
        break;
      }
      case 'reloadStart': this._tone(500, 0.08, 0.15, 'square'); this._tone(700, 0.06, 0.1, 'square'); break;
      case 'reloadDone': this._tone(800, 0.07, 0.2, 'square'); this._tone(1100, 0.09, 0.18, 'square'); break;
      case 'swing': this._noise(0.16, 0.22, 700, 'bandpass', 1600); break;
      case 'whiff': this._noise(0.2, 0.14, 500, 'bandpass', 900); break;
      case 'thock': this._tone(160, 0.09, 0.3, 'triangle', 80); this._noise(0.08, 0.2, 900); break;
      case 'build': this._tone(300, 0.1, 0.25, 'triangle', 420); this._noise(0.12, 0.18, 1200); break;
      case 'edit': this._tone(600, 0.07, 0.18, 'square', 900); break;
      case 'pickup': this._tone(700, 0.06, 0.18, 'sine', 1000); this._tone(1050, 0.08, 0.14, 'sine', 1400); break;
      case 'chestOpen': this._tone(500, 0.12, 0.2, 'sine', 750); this._tone(750, 0.16, 0.18, 'sine', 1120); this._tone(1120, 0.2, 0.15, 'sine', 1600); break;
      case 'healStart': this._tone(440, 0.2, 0.12, 'sine', 520); break;
      case 'healDone': this._tone(620, 0.14, 0.2, 'sine'); this._tone(930, 0.2, 0.16, 'sine'); break;
      case 'jump': this._noise(0.08, 0.1, 600); break;
      case 'land': this._noise(0.12, 0.22, 400); break;
      case 'glide': this._noise(0.6, 0.2, 800, 'bandpass', 400); break;
      case 'explosion': this._noise(0.9, 0.7, 700, 'lowpass', 60); this._tone(55, 0.6, 0.5, 'sawtooth', 28); break;
      case 'hit': this._tone(1200, 0.05, 0.22, 'square', 900); break;
      case 'hitHead': this._tone(1500, 0.06, 0.26, 'square', 1100); break;
      case 'elim': this._tone(300, 0.1, 0.3, 'sawtooth', 600); this._tone(600, 0.14, 0.25, 'sawtooth', 900); break;
      case 'death': this._tone(220, 0.5, 0.3, 'sawtooth', 60); break;
      case 'stormTick': this._noise(0.3, 0.12, 300, 'lowpass', 150); break;
      case 'uiClick': this._tone(900, 0.04, 0.12, 'square'); break;
      case 'victory': {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 0.25, 'triangle'), i * 140));
        break;
      }
      case 'defeat': {
        [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.4, 0.22, 'triangle'), i * 200));
        break;
      }
    }
  }
}
