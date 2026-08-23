// Procedural audio: all sounds synthesized with WebAudio (no assets).
export class AudioSys {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.loops = {};
    this._cricketT = 0;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.master = this.ctx.createGain();
      this.master.gain.value = ((this.settings.volume ?? 60) / 100) * 0.8;
      this.master.connect(this.ctx.destination);
      this._makeLoops();
      return true;
    } catch { return false; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { if (this.master) this.master.gain.value = (v / 100) * 0.8; }

  _noise(dur, freq, type, vol, q = 1, decay = true) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    if (decay) g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _matProfile(id) {
    if (typeof id === 'number') {
      if ([1, 4, 7, 13, 14, 15, 16, 17, 18, 47, 54].includes(id)) return { f: 260, type: 'lowpass', v: 0.5 };
      if ([9, 48, 50, 5, 35, 36, 37, 38, 40, 53].includes(id)) return { f: 620, type: 'bandpass', v: 0.45 };
      if ([6, 8, 32].includes(id)) return { f: 900, type: 'lowpass', v: 0.4 };
      if ([2, 3, 19].includes(id)) return { f: 500, type: 'lowpass', v: 0.38 };
    }
    return { f: 700, type: 'lowpass', v: 0.35 };
  }

  dig(id) {
    const p = this._matProfile(id);
    this._noise(0.12, p.f * (0.85 + Math.random() * 0.3), p.type, p.v, 1.2);
  }
  breakBlock(id) {
    const p = this._matProfile(id);
    this._noise(0.22, p.f, p.type, p.v * 1.3);
    this._noise(0.18, p.f * 0.55, 'lowpass', p.v * 0.9);
    if (typeof id === 'number' && [9, 48, 50].includes(id)) this._tone(160, 0.15, 'triangle', 0.2, 90);
  }
  place(id) {
    const p = this._matProfile(id);
    this._noise(0.09, p.f * 1.2, p.type, p.v);
    this._tone(320, 0.06, 'square', 0.08, 240);
  }
  step(id, sprinting) {
    const p = this._matProfile(id);
    this._noise(0.07, p.f * (0.9 + Math.random() * 0.25), p.type, sprinting ? 0.16 : 0.09);
  }
  pop() { this._tone(520, 0.09, 'sine', 0.25, 1040); }
  click() { this._tone(1100, 0.035, 'square', 0.12, 900); }
  swing() { this._noise(0.16, 1400, 'bandpass', 0.10, 0.8); }
  eat() {
    for (let i = 0; i < 3; i++) this._noise(0.07, 800 + i * 200, 'lowpass', 0.22);
    this._tone(300, 0.1, 'sine', 0.06, 200, 0.35);
  }
  hurt() {
    this._tone(280, 0.22, 'sawtooth', 0.28, 110);
    this._noise(0.15, 400, 'lowpass', 0.25);
  }
  splash() { this._noise(0.45, 850, 'lowpass', 0.4); this._noise(0.3, 2200, 'highpass', 0.15); }
  thunder(delaySec = 0) {
    if (!this.ensure()) return;
    setTimeout(() => {
      this._noise(2.6, 90, 'lowpass', 0.75, 0.5);
      this._noise(1.2, 240, 'lowpass', 0.4);
      this._tone(52, 2.2, 'sine', 0.3, 34);
    }, delaySec * 1000);
  }
  craft() { this._tone(660, 0.08, 'square', 0.1); this._tone(880, 0.1, 'square', 0.1, undefined, 0.07); }
  furnaceLit() { this._noise(0.6, 180, 'lowpass', 0.2); }
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.16, 'square', 0.12, undefined, i * 0.09)); }

  mobHurt(typeName) {
    if (typeName === 'gloom') this._tone(140, 0.24, 'sawtooth', 0.26, 70);
    else if (typeName === 'skitter') this._noise(0.14, 2400, 'bandpass', 0.3, 3);
    else if (typeName === 'sheep') this._tone(420, 0.2, 'square', 0.2, 260);
    else if (typeName === 'pig') this._tone(190, 0.16, 'sawtooth', 0.22, 120);
    else this._tone(980, 0.12, 'square', 0.18, 640);
  }
  mobDie(typeName) {
    this.mobHurt(typeName);
    this._tone(typeName === 'gloom' ? 100 : 300, 0.4, typeName === 'gloom' ? 'sawtooth' : 'triangle', 0.24, 40);
  }
  mobIdle(typeName) {
    if (typeName === 'gloom') this._tone(95, 0.7, 'sawtooth', 0.14, 70);
    else if (typeName === 'sheep') { this._tone(480, 0.3, 'square', 0.1, 380); this._tone(430, 0.3, 'square', 0.08, 340, 0.25); }
    else if (typeName === 'pig') this._tone(170, 0.14, 'sawtooth', 0.12, 230);
    else if (typeName === 'chicken') { this._tone(1150, 0.07, 'square', 0.1); this._tone(1250, 0.07, 'square', 0.09, undefined, 0.11); }
    else this._noise(0.1, 2000, 'bandpass', 0.1, 4);
  }
  mobAttack(typeName) { this._noise(0.12, 500, 'lowpass', 0.3); this._tone(150, 0.12, 'square', 0.14, 90); }

  // ---- ambient loops ----
  _makeLoops() {
    const mk = (freq, type) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(0, Math.random());
      return g;
    };
    this.loops.wind = mk(240, 'lowpass');
    this.loops.rain = mk(1400, 'highpass');
  }

  update(dt, opts = {}) {
    if (!this.ctx || !this.master) return;
    const windTarget = (opts.windExposure ?? 0.2) * 0.05;
    this.loops.wind.gain.value += (windTarget - this.loops.wind.gain.value) * Math.min(1, dt);
    const rainTarget = (opts.rainF ?? 0) * 0.16;
    this.loops.rain.gain.value += (rainTarget - this.loops.rain.gain.value) * Math.min(1, dt * 2);

    // night crickets
    if (opts.nightF > 0.6 && (opts.outdoors ?? true)) {
      this._cricketT -= dt;
      if (this._cricketT <= 0) {
        this._cricketT = 1.4 + Math.random() * 3.5;
        for (let i = 0; i < 3; i++) {
          this._tone(4200 + Math.random() * 600, 0.03, 'sine', 0.028, undefined, i * 0.09);
        }
      }
    }
  }
}
