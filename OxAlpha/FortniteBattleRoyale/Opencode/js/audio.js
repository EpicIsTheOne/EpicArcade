import { S } from './state.js';

let ctx = null;
let master = null;
let unlocked = false;
const sfxCache = {};

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = S.settings.volume;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

export function unlockAudio() {
  initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  unlocked = true;
  startLobbyPad();
}

export function setVolume(v) {
  S.settings.volume = v;
  if (master) master.gain.value = v;
}

function noiseBuffer(dur = 1) {
  const key = 'nb' + dur;
  if (sfxCache[key]) return sfxCache[key];
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  sfxCache[key] = buf;
  return buf;
}

function env(gain, t0, a, peak, d, sustain = 0.0001) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
}

function shot(vol, freq, dur, boom = 0) {
  if (!ctx || !unlocked) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.5);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.25, 80), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, 0.002, vol, dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
  if (boom > 0) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + boom);
    const og = ctx.createGain();
    env(og, t0, 0.003, vol * 0.9, boom);
    o.connect(og); og.connect(master);
    o.start(t0); o.stop(t0 + boom + 0.05);
  }
}

function tone(freq, dur, vol, type = 'square', slideTo = null, delay = 0) {
  if (!ctx || !unlocked) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, 0.01, vol, dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  ar() { shot(0.5, 3200, 0.14, 0.4); },
  smg() { shot(0.34, 4200, 0.09, 0.12); },
  shotgun() { shot(0.72, 1900, 0.3, 0.8); },
  sniper() { shot(0.85, 2400, 0.42, 1.0); },
  rocketFire() { shot(0.6, 900, 0.5, 0.5); tone(180, 0.4, 0.2, 'sawtooth', 60); },
  explosion(dist) {
    const v = Math.max(0.08, 0.9 - dist / 90);
    shot(v, 700, 0.7, 1.2 * v);
  },
  pickHit() { shot(0.35, 1500, 0.1); tone(220, 0.07, 0.18, 'triangle', 140); },
  pickCrit() { tone(1250, 0.12, 0.3, 'sine', 1750); shot(0.3, 2600, 0.08); },
  buildPlace() { tone(340, 0.1, 0.28, 'square', 480); shot(0.22, 1200, 0.07); },
  buildDeny() { tone(160, 0.12, 0.2, 'sawtooth', 120); },
  destroy(dist) { const v = Math.max(0.05, 0.6 - (dist || 10) / 120); shot(v, 800, 0.35, v * 0.7); },
  reloadStart() { tone(500, 0.06, 0.15, 'square'); tone(360, 0.06, 0.13, 'square', null, 0.09); },
  reloadEnd() { tone(720, 0.07, 0.2, 'square', 900); },
  hitmark() { tone(1150, 0.05, 0.24, 'square', 900); },
  headshot() { tone(1500, 0.09, 0.3, 'sine', 2100); },
  hurt() { tone(200, 0.16, 0.32, 'sawtooth', 110); },
  pickup() { tone(660, 0.06, 0.2, 'sine', 880); },
  chestOpen() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 0.22, 'triangle', null, i * 0.07));
  },
  healTick() { tone(520, 0.08, 0.1, 'sine', 640); },
  shieldDrink() { tone(300, 0.25, 0.16, 'sine', 520); },
  elim() {
    [392, 494, 587].forEach((f, i) => tone(f, 0.16, 0.26, 'square', null, i * 0.08));
  },
  stormWarn() { tone(140, 0.5, 0.22, 'sawtooth', 100); },
  jump() { tone(280, 0.1, 0.12, 'sine', 380); },
  glideOpen() { shot(0.4, 900, 0.4); },
  land() { shot(0.3, 600, 0.12); },
  victory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 0.3, 'triangle', null, i * 0.12));
  },
  defeat() { [330, 262, 196].forEach((f, i) => tone(f, 0.35, 0.24, 'sine', null, i * 0.18)); },
  uiClick() { tone(700, 0.04, 0.14, 'square'); },
};

let padNodes = null;
export function startLobbyPad() {
  if (!ctx || padNodes) return;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  g.connect(master);
  padNodes = { g };
  const chords = [[130.8, 164.8, 196], [110, 138.6, 164.8], [98, 123.5, 146.8], [116.5, 146.8, 174.6]];
  let ci = 0;
  function playChord() {
    if (!padNodes) return;
    const ch = chords[ci % chords.length]; ci++;
    for (const f of ch) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain();
      const t0 = ctx.currentTime;
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.linearRampToValueAtTime(0.33, t0 + 1.2);
      og.gain.linearRampToValueAtTime(0.0001, t0 + 3.9);
      o.connect(og); og.connect(g);
      o.start(t0); o.stop(t0 + 4);
    }
  }
  playChord();
  padNodes.timer = setInterval(playChord, 4000);
}
export function stopLobbyPad() {
  if (padNodes) { clearInterval(padNodes.timer); padNodes.g.disconnect(); padNodes = null; }
}

let rumble = null;
export function ensureStormRumble() {
  if (!ctx || rumble) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(2);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 130;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
  rumble = g;
}
export function setStormIntensity(v) {
  if (rumble) rumble.gain.setTargetAtTime(Math.min(v, 0.5), ctx.currentTime, 0.4);
}

let windG = null;
export function setWindIntensity(v) {
  if (!ctx) return;
  if (!windG) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
    windG = ctx.createGain(); windG.gain.value = 0;
    src.connect(f); f.connect(windG); windG.connect(master);
    src.start();
  }
  windG.gain.setTargetAtTime(Math.min(v, 0.4), ctx.currentTime, 0.15);
}
