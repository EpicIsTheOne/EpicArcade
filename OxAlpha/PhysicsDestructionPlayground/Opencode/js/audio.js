import { G, clamp } from './state.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let voices = 0;
let hum = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    master.connect(comp);
    comp.connect(ctx.destination);
    const len = (ctx.sampleRate * 1.2) | 0;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
    return false;
  }
  return true;
}

function pitchMul() {
  return Math.pow(Math.max(G.timeScale, 0.12), 0.55);
}

function ok() {
  return ctx && !G.muted && voices < 10;
}

function env(gainNode, t0, peak, dur) {
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function playNoise(dur, fType, f0, f1, q, vol) {
  if (!ok()) return;
  voices++;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = pitchMul();
  const flt = ctx.createBiquadFilter();
  flt.type = fType;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0 * pitchMul(), t0);
  flt.frequency.exponentialRampToValueAtTime(Math.max(f1 * pitchMul(), 20), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, vol, dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(master);
  src.onended = () => voices--;
  src.start(t0, Math.random() * 0.4);
  src.stop(t0 + dur + 0.05);
}

function playTone(type, f0, f1, dur, vol) {
  if (!ok()) return;
  voices++;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0 * pitchMul(), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1 * pitchMul(), 15), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, vol, dur);
  osc.connect(g);
  g.connect(master);
  osc.onended = () => voices--;
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function thud(vol, size) {
  if (!ok()) return;
  vol = clamp(vol, 0.04, 1) * 0.85;
  const freq = clamp(650 / Math.max(size, 0.18), 100, 720);
  playNoise(0.08 + vol * 0.14, 'lowpass', freq * 3.2, freq * 0.55, 0.8, vol * 0.75);
  playTone('sine', freq * 0.4, freq * 0.18, 0.1 + vol * 0.14, vol * 0.65);
}

export function boom() {
  playNoise(0.6, 'lowpass', 2200, 70, 0.5, 0.95);
  playTone('sine', 66, 27, 0.62, 0.9);
  setTimeout(() => playNoise(1.1, 'lowpass', 160, 45, 0.4, 0.3), 60);
}

export function crack() {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => playNoise(0.05, 'highpass', 1400, 900, 1.2, 0.4), i * 34);
  }
}

export function whoosh() {
  playNoise(0.16, 'bandpass', 480, 1700, 1.0, 0.26);
}

export function pop() {
  playTone('sine', 330, 90, 0.09, 0.32);
  playNoise(0.05, 'bandpass', 900, 500, 1.5, 0.12);
}

export function chime(up) {
  const base = up ? [660, 990] : [520, 390];
  playTone('sine', base[0], base[0], 0.14, 0.2);
  setTimeout(() => playTone('sine', base[1], base[1], 0.18, 0.16), 70);
}

export function startHum(kind) {
  stopHum();
  if (!ctx || G.muted) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = kind === 'push' ? 62 : 46;
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 260;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(kind === 'push' ? 0.075 : 0.06, t0 + 0.12);
  osc.connect(flt);
  flt.connect(g);
  g.connect(master);
  osc.start();
  hum = { osc, g };
}

export function stopHum() {
  if (!hum || !ctx) return;
  const t0 = ctx.currentTime;
  hum.g.gain.cancelScheduledValues(t0);
  hum.g.gain.setValueAtTime(hum.g.gain.value, t0);
  hum.g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  hum.osc.stop(t0 + 0.15);
  hum = null;
}
