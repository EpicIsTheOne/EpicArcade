export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.muted = false;
    this.started = false;
    this.step = 0;
    this.nextBeat = 0;
    this.timer = null;
    this.volume = 0.68;
  }

  unlock() {
    if (this.started) {
      if (this.context?.state === "suspended") this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.sfxBus = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.musicBus.gain.value = 0.34;
    this.sfxBus.gain.value = 0.72;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.context.destination);
    this.started = true;
    this.nextBeat = this.context.currentTime + 0.04;
    this.timer = window.setInterval(() => this.scheduleMusic(), 40);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.03);
    return this.muted;
  }

  tone({ frequency = 220, endFrequency = frequency, duration = 0.12, type = "sine", volume = 0.1, bus = "sfx", delay = 0 } = {}) {
    if (!this.started || this.muted) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(bus === "music" ? this.musicBus : this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  noise({ duration = 0.12, volume = 0.12, highpass = 200, lowpass = 8000, delay = 0 } = {}) {
    if (!this.started || this.muted) return;
    const sampleRate = this.context.sampleRate;
    const frameCount = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
    }
    const source = this.context.createBufferSource();
    const high = this.context.createBiquadFilter();
    const low = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    high.type = "highpass";
    high.frequency.value = highpass;
    low.type = "lowpass";
    low.frequency.value = lowpass;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(high).connect(low).connect(gain).connect(this.sfxBus);
    source.start(this.context.currentTime + delay);
  }

  sfx(name) {
    const sounds = {
      swing: () => this.noise({ duration: 0.09, volume: 0.1, highpass: 900, lowpass: 5200 }),
      hit: () => {
        this.tone({ frequency: 150, endFrequency: 64, duration: 0.12, type: "square", volume: 0.11 });
        this.noise({ duration: 0.08, volume: 0.14, highpass: 500 });
      },
      heavy: () => {
        this.tone({ frequency: 92, endFrequency: 38, duration: 0.24, type: "sawtooth", volume: 0.16 });
        this.noise({ duration: 0.2, volume: 0.15, highpass: 120 });
      },
      jump: () => this.tone({ frequency: 230, endFrequency: 430, duration: 0.12, type: "triangle", volume: 0.08 }),
      dash: () => this.noise({ duration: 0.15, volume: 0.09, highpass: 1200, lowpass: 6000 }),
      storm: () => {
        this.tone({ frequency: 720, endFrequency: 95, duration: 0.4, type: "sawtooth", volume: 0.13 });
        this.noise({ duration: 0.36, volume: 0.14, highpass: 80, lowpass: 9000 });
      },
      hurt: () => this.tone({ frequency: 180, endFrequency: 72, duration: 0.18, type: "square", volume: 0.13 }),
      pickup: () => {
        this.tone({ frequency: 420, endFrequency: 720, duration: 0.2, type: "triangle", volume: 0.11 });
        this.tone({ frequency: 630, endFrequency: 1080, duration: 0.26, type: "sine", volume: 0.08, delay: 0.08 });
      },
      ui: () => this.tone({ frequency: 310, endFrequency: 460, duration: 0.08, type: "square", volume: 0.06 }),
      boss: () => {
        this.tone({ frequency: 70, endFrequency: 42, duration: 0.7, type: "sawtooth", volume: 0.15 });
        this.tone({ frequency: 105, endFrequency: 63, duration: 0.7, type: "square", volume: 0.08, delay: 0.05 });
      },
      victory: () => [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
        this.tone({ frequency, endFrequency: frequency * 1.01, duration: 0.55, type: "triangle", volume: 0.1, delay: index * 0.11 });
      })
    };
    sounds[name]?.();
  }

  scheduleMusic() {
    if (!this.context || this.muted) return;
    while (this.nextBeat < this.context.currentTime + 0.12) {
      const time = this.nextBeat;
      const beat = this.step % 16;
      const bassNotes = [55, 55, 65.41, 49, 43.65, 43.65, 58.27, 49];
      const bass = bassNotes[Math.floor(beat / 2) % bassNotes.length];
      this.tone({ frequency: bass, endFrequency: bass, duration: 0.24, type: "triangle", volume: 0.06, bus: "music", delay: Math.max(0, time - this.context.currentTime) });
      if (beat % 4 === 0) this.tone({ frequency: 110, endFrequency: 48, duration: 0.09, type: "square", volume: 0.035, bus: "music", delay: Math.max(0, time - this.context.currentTime) });
      if ([2, 6, 10, 14, 15].includes(beat)) this.tone({ frequency: 440, endFrequency: 330, duration: 0.12, type: "sine", volume: 0.025, bus: "music", delay: Math.max(0, time - this.context.currentTime) });
      this.nextBeat += 60 / 112 / 2;
      this.step += 1;
    }
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
  }
}
