import { BAR, BEAT } from "./constants.js";

export const A = Object.freeze({
  a2: 110,
  c3: 130.8128,
  d3: 146.8324,
  e3: 164.8138,
  g3: 195.9977,
  a3: 220,
  c4: 261.6256,
  d4: 293.6648,
  e4: 329.6276,
  g4: 391.9954,
  a4: 440,
  c5: 523.2511,
  d5: 587.3295,
  e5: 659.2551,
  g5: 783.9909,
  a5: 880,
  c6: 1046.502
});

export class MusicEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.effectsBus = null;
    this.compressor = null;
    this.settings = { volume: 0.78, muted: false };
    this.events = new Map();
    this.sourceEvents = new Map();
    this.generation = 0;
    this.scheduleTimers = {};
    this.pendingBeatCallbacks = [];
    this.noiseBuffer = null;
  }

  async ensure() {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.effectsBus = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -13;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.musicBus.connect(this.master);
    this.effectsBus.connect(this.master);
    this.master.connect(this.compressor).connect(this.context.destination);
    this.applySettings(this.settings);
  }

  applySettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.context) return;
    const now = this.context.currentTime;
    const volume = this.settings.muted ? 0 : this.settings.volume;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(volume, now, 0.025);
    this.musicBus.gain.setTargetAtTime(0.76, now, 0.025);
    this.effectsBus.gain.setTargetAtTime(0.88, now, 0.025);
  }

  midi(note) {
    return 440 * 2 ** ((note - 69) / 12);
  }

  registerEvents(events) {
    this.sourceEvents = events;
    this.events = new Map();
    for (const event of events) {
      const bucket = this.events.get(event.beat) ?? [];
      bucket.push(event);
      this.events.set(event.beat, bucket);
    }
  }

  addTimeAnchor(beat, startTime) {
    this.timeAnchor = { beat, startTime, generation: ++this.generation };
  }

  stopMusic() {
    for (const timer of Object.values(this.scheduleTimers)) clearTimeout(timer);
    for (const pending of this.pendingBeatCallbacks) clearTimeout(pending.timer);
    this.scheduleTimers = {};
    this.pendingBeatCallbacks = [];
    if (this.timeAnchor) this.timeAnchor.generation = -1;
  }

  async startMusic(startBeat = 0, seekBeat = startBeat) {
    await this.ensure();
    if (!this.context) return;
    this.stopMusic();
    this.addTimeAnchor(seekBeat, this.context.currentTime + 0.05);
    for (const event of this.sourceEvents) {
      if (event.beat < startBeat || event.beat > startBeat + 15) continue;
      this.scheduleEvent(event, this.timeAnchor.startTime + (event.beat - seekBeat) * BEAT);
    }
    this.scheduleWindow(startBeat + 15, startBeat);
  }

  scheduleEvent(event, time) {
    if (time < this.context.currentTime - 0.03) return;
    const tickOffset = Math.max(0, time - this.context.currentTime);
    switch (event.type) {
      case "kick": this.kick(time); break;
      case "snare": this.snare(time); break;
      case "hat": this.noise(time, 0.035, 0.08, 7800, 0.11); break;
      case "clap": this.clap(time); break;
      case "bass": this.bass(time, event.note, event.length ?? BEAT * 0.42, event.accent); break;
      case "pluck": this.pluck(time, event.note, event.length ?? BEAT * 0.24, event.level); break;
      case "pad": this.pad(time, event.notes, event.length ?? BAR); break;
      case "sweep": this.sweep(time, event.length ?? BAR * 2, event.upward); break;
      case "stinger": this.stinger(time, event.notes, event.length ?? BAR); break;
      default: break;
    }
    if (tickOffset > 0) this.pendingBeatCallbacks.push({ beat: event.beat, timer: setTimeout(() => this.onBeat?.(event.beat, event), tickOffset) });
  }

  scheduleWindow(endBeat) {
    const generation = this.timeAnchor?.generation;
    if (generation == null || !this.context) return;
    const delay = Math.max(30, (endBeat - this.timeAnchor.beat) * BEAT * 1000);
    this.scheduleTimers.window = setTimeout(() => {
      if (this.timeAnchor?.generation !== generation) return;
      const currentBeat = this.getCurrentBeat();
      this.scheduleWindow(endBeat + 15);
      for (const event of this.sourceEvents) {
        if (event.beat >= endBeat - 15 && event.beat < endBeat) {
          this.scheduleEvent(event, this.timeAnchor.startTime + (event.beat - this.timeAnchor.beat) * BEAT);
        }
      }
      if (currentBeat >= endBeat - 0.25) this.onWindow?.(currentBeat);
    }, delay);
  }

  getCurrentBeat() {
    if (!this.context || !this.timeAnchor || this.timeAnchor.generation < 0) return this.timeAnchor?.beat ?? 0;
    return this.timeAnchor.beat + Math.max(0, this.context.currentTime - this.timeAnchor.startTime) / BEAT;
  }

  triggerBeatFeedback(beat) {
    const pulse = Math.max(0, 1 - Math.abs(beat - Math.round(beat)) * 1.4);
    this.blip(145 + pulse * 85, 0.045, 0.08, "sine");
  }

  onBeat = (beat, event) => {
    this.onGameBeat?.(beat, event);
  };

  blip(frequency, duration = 0.08, level = 0.14, type = "triangle") {
    if (!this.context || this.settings.muted) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, frequency), now);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.effectsBus);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  impact(frequency = 92, level = 0.24) {
    if (!this.context || !this.effectsBus) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(this.effectsBus);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  chime(level = 0.18) {
    this.blip(880, 0.24, level, "sine");
    this.blip(1320, 0.18, level * 0.55, "sine");
  }

  kick(time = this.context.currentTime) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(43, time + 0.13);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.23);
    osc.connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  snare(time = this.context.currentTime) {
    this.noise(time, 0.11, 0.24, 1800, 0.16);
    this.body(time, 185, 0.09, 0.12, "triangle");
  }

  clap(time = this.context.currentTime) {
    for (let index = 0; index < 3; index += 1) {
      const offset = index * 0.012;
      this.noise(time + offset, 0.075, 0.12, 2300, 0.11);
    }
  }

  noise(time, duration, level, cutoff, decay) {
    if (!this.noiseBuffer) this.noiseBuffer = this.createNoiseBuffer();
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    source.connect(filter).connect(gain).connect(this.musicBus);
    source.start(time, Math.random() * 0.2);
    source.stop(time + duration + 0.02);
  }

  body(time, frequency, duration, level, type = "sine") {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  bass(time, note, length, accent = 0) {
    const osc = this.context.createOscillator();
    const sub = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = "sawtooth";
    sub.type = "sine";
    osc.frequency.value = note;
    sub.frequency.value = note / 2;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420 + accent * 900, time);
    filter.frequency.exponentialRampToValueAtTime(210, time + length);
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.22 + accent * 0.08, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.musicBus);
    osc.start(time);
    sub.start(time);
    osc.stop(time + length + 0.03);
    sub.stop(time + length + 0.03);
  }

  pluck(time, note, length, level = 0.14) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.value = note;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3200, time);
    filter.frequency.exponentialRampToValueAtTime(600, time + length);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + length + 0.02);
  }

  pad(time, notes, length) {
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.035, time + 0.22);
    gain.gain.setValueAtTime(0.035, time + length - 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    filter.connect(gain).connect(this.musicBus);
    for (const note of notes) {
      const osc = this.context.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = note;
      osc.detune.value = (note % 7) * 3 - 9;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + length + 0.04);
    }
  }

  sweep(time, length, upward = true) {
    const source = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.type = "sawtooth";
    const from = upward ? 55 : 440;
    const to = upward ? 440 : 55;
    source.frequency.setValueAtTime(from, time);
    source.frequency.exponentialRampToValueAtTime(to, time + length);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(upward ? 160 : 900, time);
    filter.frequency.exponentialRampToValueAtTime(upward ? 900 : 160, time + length);
    filter.Q.value = 2.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.12, time + length * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    source.connect(filter).connect(gain).connect(this.musicBus);
    source.start(time);
    source.stop(time + length + 0.03);
  }

  stinger(time, notes, length) {
    this.pad(time, notes, length);
    for (let index = 0; index < notes.length; index += 1) {
      this.pluck(time + index * BEAT * 0.25, notes[index] * 2, BEAT * 0.32, 0.09);
    }
  }

  createNoiseBuffer() {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.5, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }
}
