// CHROME HARBOR — synthesized audio: engine, sirens, gunfire, weather, generative music.
// Everything is procedural WebAudio — zero audio files.
export class AudioSys {
  constructor(ctx) {
    this.ctx = ctx;
    this.ready = false;
    this._engineState = { rpm: 0.2, load: 0, on: false };
    this._sirenGainV = 0;
    this._musicLevel = 0;   // 0 calm, 1 cruise, 2 chase
    this._nextBar = 0;
    this._barIdx = 0;
  }

  init() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC({ latencyHint: 'interactive' });
    } catch { return; }
    const ac = this.ac;
    this.master = ac.createGain(); this.master.gain.value = 0.8 * this.ctx.settings.volMaster;
    this.sfxBus = ac.createGain(); this.sfxBus.gain.value = this.ctx.settings.volSfx;
    this.musicBus = ac.createGain(); this.musicBus.gain.value = this.ctx.settings.volMusic * 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ac.destination);
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    // shared noise buffer
    const len = ac.sampleRate * 2;
    this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // --- engine voice ---
    this.engOsc1 = ac.createOscillator(); this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ac.createOscillator(); this.engOsc2.type = 'square';
    this.engFilter = ac.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
    this.engGain = ac.createGain(); this.engGain.gain.value = 0;
    const g2 = ac.createGain(); g2.gain.value = 0.35;
    this.engOsc1.connect(this.engFilter); this.engOsc2.connect(g2); g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.sfxBus);
    this.engOsc1.start(); this.engOsc2.start();

    // tire screech
    this.screechSrc = ac.createBufferSource(); this.screechSrc.buffer = this.noiseBuf; this.screechSrc.loop = true;
    this.screechFilter = ac.createBiquadFilter(); this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1900; this.screechFilter.Q.value = 7;
    this.screechGain = ac.createGain(); this.screechGain.gain.value = 0;
    this.screechSrc.connect(this.screechFilter); this.screechFilter.connect(this.screechGain); this.screechGain.connect(this.sfxBus);
    this.screechSrc.start();

    // siren
    this.sirenOsc = ac.createOscillator(); this.sirenOsc.type = 'triangle';
    this.sirenLfo = ac.createOscillator(); this.sirenLfo.frequency.value = 0.62;
    this.sirenLfoGain = ac.createGain(); this.sirenLfoGain.gain.value = 160;
    this.sirenBase = ac.createConstantSource ? ac.createConstantSource() : null;
    this.sirenGain = ac.createGain(); this.sirenGain.gain.value = 0;
    if (this.sirenBase) {
      this.sirenBase.offset.value = 830;
      this.sirenBase.connect(this.sirenLfoGain); this.sirenLfoGain.connect(this.sirenOsc.frequency);
      this.sirenBase.start();
    }
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.sfxBus);
    this.sirenOsc.start(); this.sirenLfo.start();

    // wind/ambient bed
    this.windSrc = ac.createBufferSource(); this.windSrc.buffer = this.noiseBuf; this.windSrc.loop = true;
    this.windFilter = ac.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 320;
    this.windGain = ac.createGain(); this.windGain.gain.value = 0.05;
    this.windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.sfxBus);
    this.windSrc.start();

    // rain bed
    this.rainSrc = ac.createBufferSource(); this.rainSrc.buffer = this.noiseBuf; this.rainSrc.loop = true;
    this.rainFilter = ac.createBiquadFilter(); this.rainFilter.type = 'highpass'; this.rainFilter.frequency.value = 2600;
    this.rainGain = ac.createGain(); this.rainGain.gain.value = 0;
    this.rainSrc.connect(this.rainFilter); this.rainFilter.connect(this.rainGain); this.rainGain.connect(this.sfxBus);
    this.rainSrc.start();

    // heli chop
    this.heliPulse = ac.createGain();
    this.heliOsc = ac.createOscillator(); this.heliOsc.type = 'square'; this.heliOsc.frequency.value = 21;
    this.heliAM = ac.createGain(); this.heliAM.gain.value = 0;
    const heliNoise = ac.createBufferSource(); heliNoise.buffer = this.noiseBuf; heliNoise.loop = true;
    const heliLP = ac.createBiquadFilter(); heliLP.type = 'lowpass'; heliLP.frequency.value = 420;
    this.heliDepth = ac.createGain(); this.heliDepth.gain.value = 0;
    this.heliOsc.connect(this.heliDepth.gain); // AM: modulates gain of noise path? simpler below
    heliNoise.connect(heliLP); heliLP.connect(this.heliAM); this.heliAM.connect(this.sfxBus);
    this.heliAM.gain.value = 0;
    this.heliOsc.start(); heliNoise.start();
    this._heliOsc = this.heliOsc;

    this.ready = true;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    this.master.gain.value = 0.8 * this.ctx.settings.volMaster;
    this.sfxBus.gain.value = this.ctx.settings.volSfx;
    this.musicBus.gain.value = this.ctx.settings.volMusic * 0.5;
  }

  suspend() { if (this.ready && this.ac.state === 'running') this.ac.suspend().catch(() => {}); }
  resume() { if (this.ready && this.ac.state === 'suspended') this.ac.resume().catch(() => {}); }

  // ---------- one-shots ----------
  _noiseBurst(dur, freq, type = 'bandpass', q = 1, gain = 0.5, slideTo = null) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _thump(freq, dur, gain = 0.5, slideTo = 40) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  shot(kind = 'pistol') {
    switch (kind) {
      case 'pistol': this._noiseBurst(0.14, 2400, 'bandpass', 0.8, 0.55); this._thump(210, 0.09, 0.4); break;
      case 'smg': this._noiseBurst(0.08, 2900, 'bandpass', 0.9, 0.38); this._thump(240, 0.06, 0.26); break;
      case 'shotgun': this._noiseBurst(0.3, 1100, 'lowpass', 0.5, 0.75); this._thump(130, 0.18, 0.6); break;
      case 'rifle': this._noiseBurst(0.16, 2000, 'bandpass', 1.1, 0.6); this._thump(180, 0.12, 0.5); break;
      case 'melee': this._noiseBurst(0.07, 900, 'lowpass', 0.6, 0.35); break;
    }
  }
  ricochet() { this._noiseBurst(0.09, 3800, 'bandpass', 6, 0.14, 2400); }
  hitmark() { this._thump(1150, 0.05, 0.22, 700); }
  explosion(scale = 1) {
    this._noiseBurst(0.9 * scale, 320, 'lowpass', 0.4, 0.95, 60);
    this._thump(90, 0.7 * scale, 0.9, 28);
    setTimeout(() => this._noiseBurst(0.5, 1400, 'bandpass', 0.6, 0.3), 120);
  }
  horn(on) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    if (on && !this._hornNodes) {
      const o1 = ac.createOscillator(); o1.type = 'square'; o1.frequency.value = 392;
      const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 494;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      o1.connect(g); o2.connect(g); g.connect(this.sfxBus);
      o1.start(); o2.start();
      this._hornNodes = { o1, o2, g };
    } else if (!on && this._hornNodes) {
      const h = this._hornNodes; this._hornNodes = null;
      h.g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      h.o1.stop(t + 0.1); h.o2.stop(t + 0.1);
    }
  }
  footstep(run) { this._noiseBurst(0.05, run ? 500 : 380, 'lowpass', 0.7, run ? 0.16 : 0.09); }
  pickupCoin() { this._thump(880, 0.09, 0.22, 1320); setTimeout(() => this._thump(1320, 0.12, 0.2), 70); }
  uiClick() { this._thump(620, 0.04, 0.15, 480); }
  doorCar() { this._noiseBurst(0.12, 300, 'lowpass', 0.8, 0.4); this._thump(120, 0.08, 0.3); }
  crash(mag) {
    this._noiseBurst(0.25, 700, 'lowpass', 0.5, Math.min(0.85, mag));
    this._thump(90, 0.16, Math.min(0.7, mag * 0.8));
    this._noiseBurst(0.12, 3200, 'highpass', 0.7, mag * 0.4);
  }
  jingleWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._thump(f, 0.24, 0.2, f), i * 110));
  }
  stingBad() {
    const notes = [220, 185, 147];
    notes.forEach((f, i) => setTimeout(() => this._thump(f, 0.5, 0.3, f * 0.94), i * 180));
  }
  thunder(delayS) {
    setTimeout(() => {
      this._noiseBurst(1.8, 150, 'lowpass', 0.3, 0.8, 45);
      this._thump(55, 1.2, 0.7, 25);
    }, delayS * 1000);
  }

  // ---------- continuous states ----------
  engine(on, rpm01, load, kind = 'sedan') {
    if (!this.ready) return;
    const baseHz = { compact: 68, sedan: 62, sports: 92, muscle: 58, suv: 56, van: 52, pickup: 54, taxi: 62, police: 66, bus: 44 }[kind] ?? 62;
    const t = this.ac.currentTime;
    this.engGain.gain.setTargetAtTime(on ? 0.1 + load * 0.13 : 0, t, 0.09);
    this.engOsc1.frequency.setTargetAtTime(baseHz * (0.55 + rpm01 * 2.6), t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(baseHz * 0.5 * (0.55 + rpm01 * 2.6), t, 0.05);
    this.engFilter.frequency.setTargetAtTime(360 + rpm01 * 2300 + load * 800, t, 0.08);
  }
  screech(amount) {
    if (!this.ready) return;
    this.screechGain.gain.setTargetAtTime(Math.min(amount, 1) * 0.34, this.ac.currentTime, 0.06);
  }
  siren(distance) {
    if (!this.ready) return;
    const v = distance < 190 ? Math.max(0, 1 - distance / 190) * 0.17 : 0;
    this._sirenGainV += (v - this._sirenGainV) * 0.08;
    this.sirenGain.gain.setTargetAtTime(this._sirenGainV, this.ac.currentTime, 0.1);
  }
  wind(speedNorm, outdoor = true) {
    if (!this.ready) return;
    this.windGain.gain.setTargetAtTime(outdoor ? 0.03 + speedNorm * 0.12 : 0.015, this.ac.currentTime, 0.2);
  }
  rainLevel(i) {
    if (!this.ready) return;
    this.rainGain.gain.setTargetAtTime(i * 0.16, this.ac.currentTime, 0.4);
  }
  helicopter(distance) {
    if (!this.ready) return;
    const v = distance < 240 ? Math.max(0, 1 - distance / 240) * 0.5 : 0;
    this.heliAM.gain.setTargetAtTime(v, this.ac.currentTime, 0.2);
  }

  setMusic(level) { this._musicLevel = level; }

  // generative synthwave loop — call every frame; schedules bars ahead
  musicTick() {
    if (!this.ready || this._musicLevel < 0) return;
    const bpm = 96, barLen = (60 / bpm) * 4;
    const now = this.ac.currentTime;
    if (this._nextBar === 0) this._nextBar = now + 0.1;
    while (this._nextBar < now + 0.35) {
      this._scheduleBar(this._nextBar, this._barIdx++);
      this._nextBar += barLen;
    }
  }

  _scheduleBar(t0, idx) {
    const bpm = 96;
    const beat = 60 / bpm, bar = beat * 4;
    const lvl = this._musicLevel;
    const prog = [55, 65.4, 73.4, 49]; // A F D G roots
    const rootHz = prog[idx % prog.length];
    // bass pulse per beat
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat;
      this._musOsc('sawtooth', rootHz / 2, tb, 0.32, lvl >= 1 ? 0.11 : 0.07, 300 + lvl * 250);
      if (lvl >= 1) this._musNoise(tb, 0.03, 6000, 0.05); // hat tick
    }
    // pad chord
    [1, 1.5, 2.02].forEach((m) => {
      this._musOsc('triangle', rootHz * m, t0, bar * 0.98, 0.028 + lvl * 0.012, 900, 0.6);
    });
    // arp in chase mode
    if (lvl >= 2) {
      for (let s = 0; s < 8; s++) {
        const seq = [2, 3, 4, 3][s % 4];
        this._musOsc('square', rootHz * seq, t0 + s * (beat / 2), 0.11, 0.035, 2400);
      }
    }
  }
  _musOsc(type, freq, t, dur, gain, lpFreq = 1200, attack = 0.02) {
    const ac = this.ac;
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpFreq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _musNoise(t, dur, hpFreq, gain) {
    const ac = this.ac;
    const src = ac.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hpFreq;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
}
