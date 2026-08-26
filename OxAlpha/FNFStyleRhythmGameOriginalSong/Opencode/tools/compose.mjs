// ============================================================
//  STATIC ALLEY - original song composer / renderer
//  Renders: data/instrumental.wav (+ .m4a via ffmpeg later)
//           data/playervox.wav
//  Writes:  data/chart.json   (chart derived from same note data)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

// ---------------- timing ----------------
const SR = 44100;
const BPM = 152;
const SPB = 60 / BPM;          // seconds per beat
const BAR = SPB * 4;
const TOTAL_BARS = 68;
const SONG_END = TOTAL_BARS * BAR;
const TAIL = 2.6;
const N = Math.ceil((SONG_END + TAIL) * SR);
const TAU = Math.PI * 2;
const barSec = b => b * BAR;

const sec = (bar, beat = 0) => bar * BAR + beat * SPB;

// ---------------- music theory ----------------
const EMINOR = [0, 2, 3, 5, 7, 8, 10];            // E natural minor
const degMidi = (base, i) => {
  const oct = Math.floor(i / 7), idx = ((i % 7) + 7) % 7;
  return base + oct * 12 + EMINOR[idx];
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// chord = array of midi triads (voiced mid register for comping)
const CHORDS = {
  Em: [52, 55, 59],   // E3 G3 B3
  C:  [48, 52, 55],   // C3 E3 G3
  G:  [43, 47, 50],   // G2 B2 D3 -> voice up: [50,55,59]? keep close voicing below
  D:  [50, 54, 57],   // D3 F#3 A3
  B7: [47, 51, 54],   // B2 D#3 F#3
};
CHORDS.G = [50, 55, 59]; // G3 B3 D4 brighter
const ROOT_BASS = { Em: 40, C: 36, G: 43, D: 38, B7: 35 }; // E2 C2 G2 D2 B1
function chordAtBar(bar) {
  if (bar < 8)  return ['Em','Em','C','C','G','G','D','D'][bar];
  if (bar < 40 || bar >= 48) {
    if (bar >= 64) return ['B7','Em','Em','Em'][bar - 64];
    return ['Em','C','G','D'][bar % 4];
  }
  return ['Em','C','G','D'][bar % 4];
}

// ---------------- buses ----------------
const mk = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const gInstr = mk();      // everything except player vox
const gVoxP  = mk();      // player vox stem
const sInstr = new Float32Array(N); // reverb send mono (instr)
const sVoxP  = new Float32Array(N); // reverb send mono (player vox)
const duckEnv = new Float32Array(N).fill(1);   // sidechain multiplier
const kickTimes = [];

function addMono(bus, buf, tSec, { gain = 1, pan = 0, duck = 0, send = null, sendGain = 0 } = {}) {
  const i0 = Math.round(tSec * SR);
  if (i0 >= N || i0 + buf.length <= 0) return;
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4);
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  const nUse = Math.min(buf.length, N - i0);
  const start = i0 < 0 ? -i0 : 0;
  const cnt = Math.min(nUse - start, buf.length - start);
  for (let i = 0; i < cnt; i++) {
    let s = buf[start + i];
    if (!isFinite(s)) continue;
    if (duck > 0) {
      const di = i0 + start + i;
      if (di >= 0 && di < N) s *= 1 - duck * (1 - duckEnv[di]);
    }
    bus.L[i0 + start + i] += s * gl;
    bus.R[i0 + start + i] += s * gr;
    if (send) send[i0 + start + i] += s * sendGain * 0.7071;
  }
}

// ---------------- dsp helpers ----------------
function envExp(t, tau) { return t <= 0 ? 0 : Math.exp(-t / tau); }
// RBJ biquad bandpass
function biquadBP(fs, f0, Q) {
  const w0 = TAU * f0 / fs, cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Q);
  const b0 = alpha, b1 = 0, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
class BP {
  constructor(f0, Q) { this.c = biquadBP(SR, f0, Q); this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  proc(x) {
    const c = this.c;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
class OnePoleLP {
  constructor(fc) { this.a = 1 - Math.exp(-TAU * fc / SR); this.z = 0; }
  proc(x) { this.z += this.a * (x - this.z); return this.z; }
}
class OnePoleHP {
  constructor(fc) { this.lp = new OnePoleLP(fc); }
  proc(x) { return x - this.lp.proc(x); }
}

// ---------------- drums ----------------
function kickBuf({ punch = 1, deep = false } = {}) {
  const dur = deep ? 0.55 : 0.32, len = Math.floor(dur * SR), out = new Float32Array(len);
  let ph = 0;
  const f0 = deep ? 95 : 165, f1 = deep ? 33 : 46, ft = deep ? 0.16 : 0.075;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / ft);
    ph += TAU * f / SR;
    const envA = envExp(t, deep ? 0.30 : 0.155);
    let s = Math.sin(ph) * envA * 1.15;
    if (i < 0.004 * SR) s += (Math.random() * 2 - 1) * (1 - i / (0.004 * SR)) * 0.5;
    out[i] = Math.tanh(s * 1.9 * punch);
  }
  return out;
}
function snareBuf() {
  const dur = 0.24, len = Math.floor(dur * SR), out = new Float32Array(len);
  const hp = new OnePoleHP(1300);
  let tph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    tph += TAU * 186 / SR;
    const tone = Math.sin(tph) * envExp(t, 0.055) * 0.55;
    const nz = hp.proc(Math.random() * 2 - 1) * envExp(t, 0.105) * 1.5;
    out[i] = Math.tanh((tone + nz) * 1.25);
  }
  return out;
}
function hatBuf(open) {
  const dur = open ? 0.22 : 0.05, len = Math.floor(dur * SR), out = new Float32Array(len);
  const hp = new OnePoleHP(6800);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = hp.proc(Math.random() * 2 - 1) * envExp(t, open ? 0.075 : 0.014) * (open ? 0.85 : 1);
  }
  return out;
}
const HAT_C = hatBuf(false), HAT_O = hatBuf(true);
function clapBuf() {
  const dur = 0.26, len = Math.floor(dur * SR), out = new Float32Array(len);
  const bp = new BP(1250, 0.9);
  const bursts = [0, 0.010, 0.021];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = 0;
    for (const b of bursts) if (t >= b) s += (Math.random() * 2 - 1) * envExp(t - b, 0.012);
    s += (Math.random() * 2 - 1) * envExp(t, 0.075) * 0.7;
    out[i] = bp.proc(s) * 2.2;
  }
  return out;
}
const CLAP = clapBuf();
function crashBuf() {
  const dur = 1.7, len = Math.floor(dur * SR), out = new Float32Array(len);
  const hp = new OnePoleHP(4200);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = hp.proc(Math.random() * 2 - 1) * envExp(t, 0.42) * (1 + 0.3 * Math.sin(TAU * 6.5 * t));
  }
  return out;
}
const CRASH = crashBuf();
function shakerBuf() {
  const dur = 0.06, len = Math.floor(dur * SR), out = new Float32Array(len);
  const bp = new BP(7200, 0.7);
  for (let i = 0; i < len; i++) out[i] = bp.proc(Math.random() * 2 - 1) * envExp(i / SR, 0.018);
  return out;
}
const SHAK = shakerBuf();
function riserBuf(dur, down = false) {
  const len = Math.floor(dur * SR), out = new Float32Array(len);
  const bp = new BP(300, 1.1);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const t = i / SR;
    const fc = 280 + (down ? (1 - p) : p) * 3600;
    bp.c = biquadBP(SR, fc, 1.1);
    let s = bp.proc(Math.random() * 2 - 1) * (down ? (1 - p) : (p * p)) * 1.6;
    const fs = down ? 700 - 550 * p : 180 + 620 * p;
    ph += TAU * fs / SR;
    s += Math.sin(ph) * (down ? (1 - p) : p) * 0.25;
    out[i] = s;
  }
  return out;
}
function impact(t) {
  addMono(gInstr, kickBuf({ deep: true }), t, { gain: 1.5 });
  addMono(gInstr, CRASH, t, { gain: 0.55, send: sInstr, sendGain: 0.5 });
  addMono(gInstr, new Float32Array(0), t, {});
}

// ---------------- tonal instruments ----------------
function bassNote(t, midi, dur, { drive = 0, cut0 = 900, cut1 = 190 } = {}) {
  const len = Math.floor((dur + 0.08) * SR), out = new Float32Array(len);
  const lp = new OnePoleLP(cut0), lp2 = new OnePoleLP(cut0);
  let ps = 0, pp = 0;
  const f = mtof(midi);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    if (tt > dur) break;
    const cut = cut1 + (cut0 - cut1) * Math.exp(-tt / 0.09);
    lp.a = 1 - Math.exp(-TAU * cut / SR);
    const fr = f * (1 + 0.0015 * Math.sin(TAU * 0.7 * tt));
    ps += TAU * fr / SR; pp += TAU * fr * 1.003 / SR;
    const saw = 1 - 2 * (ps / TAU % 1);
    const sq = ((pp / TAU % 1) < 0.5 ? 1 : -1) * 0.5;
    let s = (saw * 0.6 + sq * 0.4 + Math.sin(ps) * 0.5) ;
    s = lp.proc(s);
    const env = Math.min(1, tt / 0.006) * (tt > dur - 0.05 ? Math.max(0, (dur - tt) / 0.05) : 1);
    out[i] = Math.tanh((s * 1.4 + drive * Math.tanh(s * 3)) * env * 0.85);
  }
  return out;
}
function stabBuf(midis, dur, bright) {
  const len = Math.floor((dur + 0.15) * SR), out = new Float32Array(len);
  for (const m of midis) {
    const f = mtof(m);
    const det = [0, 7, -7];
    const phases = [0, 0, 0];
    const lp = new OnePoleLP(1);
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      if (tt > dur) break;
      const cut = 700 + bright * 2400 * Math.exp(-tt / (dur * 0.8 + 0.05));
      lp.a = 1 - Math.exp(-TAU * cut / SR);
      let s = 0;
      for (let v = 0; v < 3; v++) {
        phases[v] += TAU * f * Math.pow(2, det[v] / 1200) / SR;
        s += 1 - 2 * (phases[v] / TAU % 1);
      }
      s /= 3;
      const env = Math.min(1, tt / 0.008) * (tt > dur - 0.09 ? Math.max(0, (dur - tt) / 0.09) : 1);
      out[i] += lp.proc(s) * env * 0.34;
    }
  }
  return out;
}
function padBuf(midis, dur) {
  const len = Math.floor((dur + 0.9) * SR), out = new Float32Array(len);
  for (const m of midis) {
    const f = mtof(m);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      p1 += TAU * f / SR; p2 += TAU * f * 1.004 / SR;
      const s = (Math.sin(p1) + (1 - 2 * (p2 / TAU % 1)) * 0.35) * 0.5;
      const at = Math.min(1, tt / 0.5);
      const rel = tt > dur ? Math.max(0, 1 - (tt - dur) / 0.8) : 1;
      out[i] += s * at * rel * 0.22;
    }
  }
  return out;
}
function arpBuf(midi) {
  const dur = 0.12, len = Math.floor(dur * SR), out = new Float32Array(len);
  let p = 0;
  const lp = new OnePoleLP(2600);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    p += TAU * mtof(midi) / SR;
    const sq = (p / TAU % 1) < 0.5 ? 1 : -1;
    out[i] = lp.proc(sq) * envExp(tt, 0.045) * 0.5;
  }
  return out;
}

// ---------------- VOX (formant vocal synth) ----------------
// vowels: formant triplets
const VOWELS = {
  ah: [800, 1150, 2500], eh: [530, 1840, 2480], ee: [300, 2300, 3000],
  oh: [450, 800, 2830], oo: [325, 700, 2530], ih: [400, 1900, 2550],
};
function voxTimbre(kind) {
  if (kind === 'opp') return { oct: 0, formScale: 0.92, vibRate: 5.0, vibDepth: 0.007, drive: 1.9, breath: 0.02, amp: 0.40 };
  return { oct: 0, formScale: 1.07, vibRate: 5.6, vibDepth: 0.009, drive: 1.15, breath: 0.055, amp: 0.40 };
}
function voxNote(buf, send, t, midi, dur, kind, { accent = 1, glideFrom = null, vowels = ['ah', 'oh'] } = {}) {
  const tb = voxTimbre(kind);
  const fTarget = mtof(midi + tb.oct * 12);
  const fStart = glideFrom != null ? mtof(glideFrom) : fTarget;
  const len = Math.floor((dur + 0.12) * SR);
  const out = new Float32Array(len);
  // vowel keyframes across note
  const vk = vowels.length === 1 ? [[0, vowels[0]], [1, vowels[0]]]
    : vowels.length === 2 ? [[0, vowels[0]], [0.55, vowels[1]], [1, vowels[1]]]
    : [[0, vowels[0]], [0.4, vowels[1]], [0.75, vowels[2]], [1, vowels[2]]];
  const bands = [new BP(700, 9), new BP(1100, 11), new BP(2400, 13)];
  const body = new OnePoleLP(1900);
  const cons = new BP(2100, 1.2);
  const brHP = new OnePoleHP(5200);
  let ps = 0, pq = 0, driftPh = Math.random() * TAU;
  const drA = 0.002 + Math.random() * 0.002, drF = 0.6 + Math.random() * 0.5;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const p = Math.min(1, tt / dur);
    // pitch: glide + vibrato + drift
    const glide = fStart === fTarget ? 1 : (fStart / fTarget) + (1 - fStart / fTarget) * Math.min(1, tt / 0.07);
    const vibRamp = Math.min(1, Math.max(0, (tt - 0.14) / Math.min(0.4, dur * 0.5)));
    const vib = 1 + tb.vibDepth * vibRamp * Math.sin(TAU * tb.vibRate * tt);
    const drift = 1 + drA * Math.sin(TAU * drF * tt + driftPh);
    const f = fTarget * glide * vib * drift;
    ps += TAU * f / SR;
    pq += TAU * f * 1.0045 / SR;
    const saw = 1 - 2 * (ps / TAU % 1);
    const sq = ((pq / TAU % 1) < 0.4 ? 1 : -1) * 0.5;
    let src = (saw * 0.72 + sq * 0.28) * 0.9;
    src = Math.tanh(src * tb.drive);
    src = body.proc(src) * 0.8 + src * 0.2;
    // vowel morph
    let fk = 1;
    for (let k = 0; k < vk.length - 1; k++) {
      if (p >= vk[k][0] && p <= vk[k + 1][0]) {
        const q = (p - vk[k][0]) / (vk[k + 1][0] - vk[k][0] || 1);
        fk = k + q; break;
      }
    }
    const seg = Math.min(vk.length - 2, Math.floor(fk));
    const q = fk - seg;
    const v0 = VOWELS[vk[seg][1]], v1 = VOWELS[vk[seg + 1][1]];
    for (let b = 0; b < 3; b++) {
      const fc = (v0[b] + (v1[b] - v0[b]) * q) * tb.formScale;
      bands[b].c = biquadBP(SR, fc, b === 0 ? 9 : 12);
    }
    let s = bands[0].proc(src) * 1.0 + bands[1].proc(src) * 0.62 + bands[2].proc(src) * 0.4;
    s += src * 0.16; // body
    // breath
    s += brHP.proc(Math.random() * 2 - 1) * envExp(tt, 0.09) * tb.breath;
    // consonant tick
    if (tt < 0.012) s += cons.proc(Math.random() * 2 - 1) * (1 - tt / 0.012) * 0.5 * accent;
    // envelope
    const atk = Math.min(1, tt / (glideFrom != null ? 0.018 : 0.032));
    const rel = tt > dur ? Math.max(0, 1 - (tt - dur) / 0.09) : 1;
    s *= atk * rel * tb.amp * (0.8 + 0.25 * accent);
    out[i] = Math.tanh(s * 1.25);
  }
  // normalize note roughly
  let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0.01) { const g = 0.82 / pk; for (let i = 0; i < len; i++) out[i] *= g; }
  addMono(buf, out, t, { gain: 1, pan: kind === 'opp' ? -0.22 : 0.22, send, sendGain: 0.34 });
}

// ================= ARRANGEMENT DATA =================
// vox phrase: list of [barInSection, beatOffset, degreeIndex(relative scale, may exceed 7), durBeats, opts]
function buildPhrase(base, rows, defOpts = {}) {
  const notes = [];
  for (const r of rows) {
    const [bar, beat, di, dur, opts] = r;
    notes.push({
      midi: degMidi(base, di),
      t: sec(bar, beat),
      dur: dur * SPB,
      ...defOpts, ...(opts || {}),
    });
  }
  return notes;
}

// ---- OPPONENT phrase A (bars 8-15) base E3=52 ----
const oppA = buildPhrase(52, [
  [0, 0.0, 0, 1.0, { vowels: ['oh', 'ah'] }],
  [0, 1.5, 2, 0.5],
  [0, 2.0, 3, 0.75],
  [0, 2.75, 4, 1.25, { vowels: ['ah'] }],
  [1, 0.0, 4, 0.5],
  [1, 0.5, 3, 0.5],
  [1, 1.0, 2, 0.5],
  [1, 1.5, 0, 1.5, { vowels: ['oh', 'oo'] }],
  [1, 3.5, 2, 0.5],
  [2, 0.0, 3, 1.0],
  [2, 1.5, 4, 0.5],
  [2, 2.0, 5, 1.0, { vowels: ['ee', 'ih'] }],
  [2, 3.0, 4, 1.0],
  [3, 0.0, 2, 0.5],
  [3, 0.5, 3, 0.5],
  [3, 1.0, 4, 1.5],
  [3, 3.0, 1, 1.0, { vowels: ['ih', 'ah'] }],
  [4, 0.0, 0, 0.75, { vowels: ['oh'] }],
  [4, 0.75, 2, 0.75],
  [4, 1.5, 4, 0.75],
  [4, 2.25, 7, 1.75, { vowels: ['ah', 'oh'] }],
  [5, 0.0, 6, 0.5],
  [5, 0.5, 5, 0.5],
  [5, 1.0, 4, 1.0],
  [5, 2.25, 2, 0.75],
  [5, 3.0, 3, 1.0],
  [6, 0.0, 4, 1.5],
  [6, 2.0, 3, 0.5],
  [6, 2.5, 2, 0.5],
  [6, 3.0, 3, 1.0],
  [7, 0.0, 1, 1.0],
  [7, 1.5, 3, 0.5],
  [7, 2.0, 4, 2.0, { vowels: ['ah'] }],
]);

// ---- PLAYER answer A' (bars 16-23) base E4=64 ----
const plrA = buildPhrase(64, [
  [0, 0.5, 4, 0.5, { vowels: ['ee'] }],
  [0, 1.0, 7, 0.75],
  [0, 2.0, 6, 0.5],
  [0, 2.5, 4, 1.5, { vowels: ['ah', 'oh'] }],
  [1, 0.0, 2, 0.75],
  [1, 1.0, 3, 0.75],
  [1, 2.0, 4, 1.0],
  [1, 3.0, 5, 1.0],
  [2, 0.0, 4, 0.5],
  [2, 0.5, 5, 0.5],
  [2, 1.0, 6, 1.5, { vowels: ['ih', 'ah'] }],
  [2, 3.0, 4, 1.0],
  [3, 0.0, 2, 1.0],
  [3, 1.5, 3, 0.5],
  [3, 2.0, 1, 2.0, { vowels: ['ee', 'ih'] }],
  [4, 0.5, 2, 0.5],
  [4, 1.0, 3, 0.5],
  [4, 1.5, 4, 0.5],
  [4, 2.0, 7, 2.0, { vowels: ['ah'] }],
  [5, 0.0, 6, 1.0],
  [5, 1.5, 4, 0.5],
  [5, 2.0, 2, 1.0],
  [5, 3.0, 4, 1.0],
  [6, 0.0, 7, 1.5, { vowels: ['oo', 'oh'] }],
  [6, 2.0, 6, 0.5],
  [6, 2.5, 4, 0.5],
  [6, 3.0, 3, 1.0],
  [7, 0.0, 2, 1.0],
  [7, 1.5, 1, 0.5],
  [7, 2.0, 0, 2.0, { vowels: ['ah', 'oh'] }],
]);

// ---- OPPONENT phrase B (bars 24-31) ----
const oppB = buildPhrase(52, [
  [0, 0.0, 7, 0.5, { vowels: ['ee'] }],
  [0, 1.0, 7, 0.5],
  [0, 1.5, 6, 0.5],
  [0, 2.0, 4, 1.5],
  [0, 3.5, 2, 0.5],
  [1, 0.0, 3, 0.5],
  [1, 0.5, 2, 0.5],
  [1, 1.0, 3, 1.0],
  [1, 2.0, 5, 0.5],
  [1, 2.5, 4, 0.5],
  [1, 3.0, 3, 1.0],
  [2, 0.0, 2, 0.5],
  [2, 1.0, 2, 0.5],
  [2, 1.5, 3, 0.5],
  [2, 2.0, 4, 2.0, { vowels: ['ah'] }],
  [3, 0.0, 3, 0.75],
  [3, 1.0, 1, 0.75],
  [3, 2.0, 3, 0.75],
  [3, 2.75, 4, 0.75],
  [3, 3.5, 6, 0.5],
  [4, 0.0, 7, 0.5],
  [4, 0.5, 6, 0.5],
  [4, 1.0, 4, 0.5],
  [4, 1.5, 5, 0.5],
  [4, 2.0, 4, 1.0],
  [4, 3.0, 2, 1.0],
  [5, 0.0, 3, 0.5],
  [5, 1.0, 3, 0.5],
  [5, 1.5, 4, 0.5],
  [5, 2.0, 5, 1.5],
  [5, 3.5, 4, 0.5],
  [6, 0.0, 6, 0.5],
  [6, 0.5, 5, 0.5],
  [6, 1.0, 4, 0.5],
  [6, 1.5, 3, 0.5],
  [6, 2.0, 2, 2.0, { vowels: ['oh'] }],
  [7, 0.0, 1, 1.0],
  [7, 1.0, 3, 1.0],
  [7, 2.0, 4, 2.0],
]);

// ---- PLAYER phrase B' (bars 32-39) ----
const plrB = buildPhrase(64, [
  [0, 0.0, 7, 0.5, { vowels: ['ee'] }],
  [0, 0.5, 7, 0.5],
  [0, 1.0, 9, 0.5],
  [0, 2.0, 7, 1.0],
  [0, 3.0, 6, 0.5],
  [0, 3.5, 4, 0.5],
  [1, 0.0, 5, 0.75],
  [1, 1.0, 4, 0.75],
  [1, 2.0, 3, 1.0],
  [1, 3.0, 5, 1.0],
  [2, 0.0, 4, 0.5],
  [2, 0.5, 5, 0.5],
  [2, 1.0, 6, 0.5],
  [2, 2.0, 4, 1.5, { vowels: ['ah'] }],
  [2, 3.5, 3, 0.5],
  [3, 0.0, 4, 0.75],
  [3, 1.0, 3, 0.75],
  [3, 2.0, 2, 1.0],
  [3, 3.0, 3, 0.5],
  [3, 3.5, 4, 0.5],
  [4, 0.0, 7, 0.5],
  [4, 0.5, 9, 0.5],
  [4, 1.0, 7, 0.5],
  [4, 2.0, 6, 1.0],
  [4, 3.0, 4, 1.0],
  [5, 0.0, 5, 0.5],
  [5, 0.5, 6, 0.5],
  [5, 1.0, 7, 0.5],
  [5, 2.0, 9, 1.5, { vowels: ['ih'] }],
  [5, 3.5, 7, 0.5],
  [6, 0.0, 10, 0.5],
  [6, 0.5, 9, 0.5],
  [6, 1.0, 7, 0.5],
  [6, 1.5, 6, 0.5],
  [6, 2.0, 4, 2.0, { vowels: ['ah', 'oh'] }],
  [7, 0.0, 3, 0.5],
  [7, 0.5, 4, 0.5],
  [7, 1.0, 5, 0.5],
  [7, 2.0, 7, 2.0],
]);

// ---- BREAK (bars 40-47) sparse call/response ----
const oppBrk = [
  { midi: 52, t: sec(40, 0), dur: 3.4 * SPB, vowels: ['oh', 'oo'] },
  { midi: 55, t: sec(42, 0), dur: 3.4 * SPB, vowels: ['ah'] },
  { midi: 59, t: sec(44, 0), dur: 2.0 * SPB, vowels: ['oh'] },
  { midi: 60, t: sec(44, 2.5), dur: 1.4 * SPB, vowels: ['ee'] },
  { midi: 60, t: sec(46, 0), dur: 1.5 * SPB },
  { midi: 59, t: sec(46, 1.5), dur: 1.5 * SPB },
  { midi: 55, t: sec(46, 3.0), dur: 1.0 * SPB },
];
const plrBrk = [
  { midi: 71, t: sec(41, 0), dur: 3.4 * SPB, vowels: ['ee', 'ih'] },
  { midi: 69, t: sec(43, 0), dur: 3.4 * SPB, vowels: ['ah'] },
  { midi: 74, t: sec(45, 0), dur: 2.0 * SPB, vowels: ['oh'] },
  { midi: 71, t: sec(45, 2.5), dur: 1.4 * SPB },
  { midi: 71, t: sec(47, 0), dur: 1.0 * SPB },
  { midi: 73, t: sec(47, 1.5), dur: 2.5 * SPB, vowels: ['ah'] },
];

// ---- CLIMAX trade licks (each 2 bars) ----
const lickO1 = [ // bars Em|C
  [0, 0.0, 7, 0.5], [0, 0.5, 9, 0.5], [0, 1.0, 11, 0.75], [0, 1.75, 10, 0.25],
  [0, 2.0, 9, 0.5], [0, 2.5, 7, 0.5], [0, 3.0, 9, 1.0],
  [1, 0.0, 9, 0.5], [1, 0.5, 7, 0.5], [1, 1.0, 10, 0.5], [1, 1.5, 9, 0.5], [1, 2.0, 7, 2.0],
];
const lickO2 = [ // bars G|D
  [0, 0.0, 6, 0.5], [0, 1.0, 6, 0.5], [0, 1.5, 4, 0.5], [0, 2.0, 2, 0.5], [0, 2.5, 3, 0.5], [0, 3.0, 4, 1.0],
  [1, 0.0, 5, 0.5], [1, 0.5, 3, 0.5], [1, 1.0, 1, 0.5], [1, 1.5, 3, 0.5], [1, 2.0, 6, 2.0],
];
const lickP1 = [ // player answer, brighter
  [0, 0.0, 9, 0.5], [0, 0.5, 11, 0.5], [0, 1.0, 13, 0.5], [0, 1.5, 12, 0.5],
  [0, 2.0, 11, 0.5], [0, 2.5, 9, 0.5], [0, 3.0, 11, 1.0],
  [1, 0.0, 9, 0.5], [1, 0.5, 11, 0.5], [1, 1.0, 10, 0.5], [1, 1.5, 9, 0.5],
  [1, 2.0, 7, 0.5], [1, 2.5, 9, 0.5], [1, 3.0, 11, 1.0],
];
const lickP2 = [
  [0, 0.0, 8, 0.5], [0, 0.5, 9, 0.5], [0, 1.0, 11, 0.5], [0, 2.0, 9, 0.5], [0, 2.5, 8, 0.5],
  [0, 3.0, 9, 1.0],
  [1, 0.0, 10, 0.5], [1, 0.5, 8, 0.5], [1, 1.0, 6, 0.5], [1, 1.5, 8, 0.5],
  [1, 2.0, 10, 0.5], [1, 2.5, 11, 0.5], [1, 3.0, 13, 1.0],
];
function buildLick(base, rows, startBar) {
  return rows.map(([bar, beat, di, dur]) => ({
    midi: degMidi(base, di), t: sec(startBar + bar, beat), dur: dur * SPB,
  }));
}
const oppClimax = [
  ...buildLick(52, lickO1, 48), ...buildLick(52, lickO2, 52), ...buildLick(52, lickO1, 56),
];
const plrClimaxTrades = [
  ...buildLick(64, lickP1, 50), ...buildLick(64, lickP2, 54), ...buildLick(64, lickP1, 58),
];
// final both (60-63)
const oppFin = [
  { midi: 64, t: sec(60, 0), dur: 2 * SPB }, { midi: 67, t: sec(60, 2), dur: 1 * SPB }, { midi: 66, t: sec(60, 3), dur: 1 * SPB },
  { midi: 67, t: sec(61, 0), dur: 2 * SPB }, { midi: 69, t: sec(61, 2), dur: 1 * SPB }, { midi: 67, t: sec(61, 3), dur: 1 * SPB },
  { midi: 66, t: sec(62, 0), dur: 2 * SPB }, { midi: 67, t: sec(62, 2), dur: 1 * SPB }, { midi: 69, t: sec(62, 3), dur: 1 * SPB },
  { midi: 71, t: sec(63, 0), dur: 3.8 * SPB, vowels: ['ah', 'oh'] },
];
const plrFin = [
  { midi: 76, t: sec(60, 0), dur: 0.5 * SPB }, { midi: 78, t: sec(60, 0.5), dur: 0.5 * SPB },
  { midi: 79, t: sec(60, 1), dur: 0.5 * SPB }, { midi: 78, t: sec(60, 1.5), dur: 0.5 * SPB },
  { midi: 76, t: sec(60, 2), dur: 1 * SPB }, { midi: 74, t: sec(60, 3), dur: 1 * SPB },
  { midi: 76, t: sec(61, 0), dur: 0.5 * SPB }, { midi: 78, t: sec(61, 0.5), dur: 0.5 * SPB },
  { midi: 79, t: sec(61, 1), dur: 1 * SPB }, { midi: 78, t: sec(61, 2), dur: 0.5 * SPB },
  { midi: 76, t: sec(61, 2.5), dur: 0.5 * SPB }, { midi: 74, t: sec(61, 3), dur: 1 * SPB },
  { midi: 76, t: sec(62, 0), dur: 0.5 * SPB }, { midi: 78, t: sec(62, 0.5), dur: 0.5 * SPB },
  { midi: 79, t: sec(62, 1), dur: 0.5 * SPB }, { midi: 78, t: sec(62, 1.5), dur: 0.5 * SPB },
  { midi: 76, t: sec(62, 2), dur: 0.5 * SPB }, { midi: 74, t: sec(62, 2.5), dur: 0.5 * SPB },
  { midi: 76, t: sec(62, 3), dur: 0.5 * SPB }, { midi: 78, t: sec(62, 3.5), dur: 0.5 * SPB },
  { midi: 79, t: sec(63, 0), dur: 3.8 * SPB, vowels: ['ah'] },
];
// outro cadence (64=B7, 65+=Em)
const oppOutro = [
  { midi: 59, t: sec(64, 0), dur: 1.8 * SPB, vowels: ['oh'] },
  { midi: 58, t: sec(64, 2), dur: 1.8 * SPB, vowels: ['oo'] },
  { midi: 52, t: sec(65, 0), dur: 3.5 * SPB, vowels: ['ah', 'oh'] },
];
const plrOutro = [
  { midi: 71, t: sec(64, 0), dur: 1.8 * SPB, vowels: ['ih'] },
  { midi: 70, t: sec(64, 2), dur: 1.8 * SPB, vowels: ['oo'] },
  { midi: 76, t: sec(65, 0), dur: 3.5 * SPB, vowels: ['ah'] },
];

// assemble vox timelines (absolute seconds)
const shift = (list, bars) => list.map(n => ({ ...n, t: n.t + sec(bars) }));
const OPP_VOX = [...shift(oppA, 8), ...shift(oppB, 24), ...shift(oppBrk, 0), ...oppClimax, ...oppFin, ...oppOutro];
const PLR_VOX = [...shift(plrA, 16), ...shift(plrB, 32), ...shift(plrBrk, 0), ...plrClimaxTrades, ...plrFin, ...plrOutro];

// ================= RENDER: vox =================
for (const n of OPP_VOX) voxNote(gInstr, sInstr, n.t, n.midi, n.dur, 'opp', n);
for (const n of PLR_VOX) voxNote(gVoxP, sVoxP, n.t, n.midi, n.dur, 'plr', n);

// ================= DRUMS =================
const KICK = kickBuf(), SNARE = snareBuf();
function drumKick(t, o) {
  addMono(gInstr, KICK, t, { gain: o?.g ?? 0.95 });
  kickTimes.push(t);
}
function drumSnare(t, g = 0.8, clapToo = false) {
  addMono(gInstr, SNARE, t, { gain: g, send: sInstr, sendGain: 0.30 });
  if (clapToo) addMono(gInstr, CLAP, t, { gain: g * 0.55, send: sInstr, sendGain: 0.25 });
}
function drumHat(t, open = false, g = 0.5, pan = 0.15) {
  addMono(gInstr, open ? HAT_O : HAT_C, t, { gain: g, pan });
}

const STEPS = 16, stepT = SPB / 4;
function stepsOf(bar, arr) { return arr.map(s => sec(bar, s * stepT / SPB)); }

for (let bar = 0; bar < TOTAL_BARS; bar++) {
  const t0 = barSec(bar);
  const inIntro = bar < 8, inVerse = bar >= 8 && bar < 40, inBreak = bar >= 40 && bar < 48,
    inClimax = bar >= 48 && bar < 64, inOutro = bar >= 64;
  const verse2 = bar >= 24 && bar < 40;

  if (inIntro) {
    // pads handled below; groove grows
    if (bar >= 4) { drumKick(t0, {}); drumKick(sec(bar, 2), { g: 0.8 }); }
    if (bar >= 6) for (let e = 1; e < 8; e++) drumHat(sec(bar, e * 0.5), false, 0.35, e % 2 ? 0.2 : -0.1);
    if (bar === 7) { drumSnare(sec(7, 2), 0.6); drumSnare(sec(7, 2.5), 0.7); drumSnare(sec(7, 3), 0.8); drumSnare(sec(7, 3.5), 0.9); }
  }
  if (inVerse) {
    const kp = [0, 6, 10];
    for (const s of kp) drumKick(sec(bar, s * stepT / SPB), { g: 0.95 });
    if (bar % 2 === 1) drumKick(sec(bar, 3.25), { g: 0.55 });
    drumSnare(sec(bar, 1), 0.85, verse2); drumSnare(sec(bar, 3), 0.85, verse2);
    for (let e = 0; e < 8; e++) drumHat(sec(bar, e * 0.5), false, e % 2 ? 0.28 : 0.5, e % 2 ? 0.22 : -0.15);
    if (bar % 2 === 1) drumHat(sec(bar, 3.5), true, 0.4);
    if (verse2) for (let s16 = 0; s16 < 16; s16++)
      addMono(gInstr, SHAK, sec(bar, s16 * stepT / SPB), { gain: s16 % 4 === 2 ? 0.30 : 0.14, pan: -0.25 });
  }
  if (inBreak) {
    if (bar >= 43) { drumKick(t0, {}); drumKick(sec(bar, 2), { g: 0.75 }); }
    if (bar === 46) for (let s16 = 0; s16 < 16; s16++) drumSnare(sec(bar, s16 * stepT / SPB), 0.25 + 0.055 * s16);
    if (bar === 47) { const f = [0, 4, 8, 10, 12, 13, 14, 15]; for (const s of f) drumSnare(sec(bar, s * stepT / SPB), 0.8); }
  }
  if (inClimax) {
    for (const b of [0, 1, 2, 3]) drumKick(sec(bar, b), { g: 1.15 });
    drumSnare(sec(bar, 1), 1.0, true); drumSnare(sec(bar, 3), 1.0, true);
    for (let e = 0; e < 8; e++) drumHat(sec(bar, e * 0.5 + 0.25), true, 0.26, e % 2 ? 0.25 : -0.2);
    for (let s16 = 0; s16 < 16; s16++) if (s16 % 4 !== 2) drumHat(sec(bar, s16 * stepT / SPB), false, 0.13);
  }
  if (inOutro) {
    if (bar === 64) { drumKick(t0, { g: 1.05 }); drumSnare(sec(bar, 2), 0.9, true); }
    if (bar === 65) { drumKick(t0, { g: 1.0 }); addMono(gInstr, CRASH, t0, { gain: 0.45, send: sInstr, sendGain: 0.4 }); }
  }
  // section impacts / crashes
  if ([8, 24, 48, 64].includes(bar)) impact(t0);
  if ([16, 32, 56].includes(bar)) addMono(gInstr, CRASH, t0, { gain: 0.4, send: sInstr, sendGain: 0.4 });
  if (bar === 40) { // downlifter into break
    addMono(gInstr, riserBuf(0.9, true), t0, { gain: 0.5 });
    addMono(gInstr, CRASH, t0, { gain: 0.3, send: sInstr, sendGain: 0.4 });
  }
  if (bar === 6 || bar === 46) addMono(gInstr, riserBuf(2 * BAR), t0, { gain: 0.42 });
  if (bar === 62) addMono(gInstr, riserBuf(BAR), t0, { gain: 0.3 });
}

// sidechain duck envelope from kicks
{
  const depth = 0.55, tau = 0.085 * SR, aLen = Math.floor(0.004 * SR);
  for (const kt of kickTimes) {
    const i0 = Math.round(kt * SR);
    for (let i = 0; i < aLen && i0 + i < N; i++) {
      const v = 1 - depth * (i / aLen);
      if (duckEnv[i0 + i] > v) duckEnv[i0 + i] = v;
    }
    for (let i = aLen; i < 0.30 * SR && i0 + i < N; i++) {
      const v = 1 - depth * Math.exp(-(i - aLen) / tau);
      if (duckEnv[i0 + i] > v) duckEnv[i0 + i] = v;
    }
  }
}

// ================= BACKING TRACKS =================
for (let bar = 0; bar < TOTAL_BARS; bar++) {
  const t0 = barSec(bar);
  const chName = chordAtBar(bar), ch = CHORDS[chName], root = ROOT_BASS[chName];
  const inIntro = bar < 8, inVerse = bar >= 8 && bar < 40, inBreak = bar >= 40 && bar < 48,
    inClimax = bar >= 48 && bar < 64, inOutro = bar >= 64;
  const verse2 = bar >= 24 && bar < 40;

  // ---- bass ----
  if (inIntro && bar >= 6) {
    addMono(gInstr, bassNote(t0, root, 2 * SPB, {}), t0, { gain: 0.9, duck: 1 });
    addMono(gInstr, bassNote(sec(bar, 2), root, 2 * SPB, {}), sec(bar, 2), { gain: 0.9, duck: 1 });
  }
  if (inVerse) {
    const pat = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    for (let i = 0; i < pat.length; i++) {
      const bt = pat[i];
      let m = root;
      if (i === 3 || i === 7) m = root + 12;              // octave pops
      if (i === 7 && bar % 4 === 3) m = ROOT_BASS[chordAtBar(bar + 1)] + 2; // chromatic approach
      addMono(gInstr, bassNote(sec(bar, bt), m, SPB * 0.46,
        { drive: 0.25, cut0: 950, cut1: 200 }), sec(bar, bt), { gain: 0.88, duck: 1 });
    }
  }
  if (inBreak) {
    for (const b of [0, 1.5, 2.5]) {
      const bn = bassNote(sec(bar, b), bar >= 43 ? root : Math.max(33, root), b === 0 ? SPB * 1.4 : SPB * 0.9, { cut0: 620, cut1: 160 });
      addMono(gInstr, bn, sec(bar, b), { gain: 0.92, duck: bar >= 43 ? 1 : 0 });
    }
  }
  if (inClimax) {
    for (let i = 0; i < 8; i++) {
      const m = i % 2 ? root + 12 : root;
      addMono(gInstr, bassNote(sec(bar, i * 0.5), m, SPB * 0.44,
        { drive: 0.45, cut0: 1500, cut1: 260 }), sec(bar, i * 0.5), { gain: 1.05, duck: 1 });
    }
  }
  if (inOutro) {
    if (bar <= 65) {
      const bn = bassNote(t0, root, bar === 65 ? 3.5 * SPB : 1.6 * SPB, { drive: 0.3, cut0: 800, cut1: 150 });
      addMono(gInstr, bn, t0, { gain: 1.0, duck: bar === 64 ? 1 : 0 });
    }
  }

  // ---- chords: pads / stabs ----
  if (inIntro || (inBreak && bar < 44)) {
    addMono(gInstr, padBuf(ch, 4 * SPB), t0, { gain: inIntro ? 0.9 : 0.75, pan: -0.1, duck: 0.35, send: sInstr, sendGain: 0.22 });
  }
  if (inBreak && bar >= 44) { // swelling stabs
    const sb = stabBuf(ch, 3.6 * SPB, 0.25 + 0.2 * (bar - 44) / 3);
    addMono(gInstr, sb, t0, { gain: 0.5, duck: 0.4, send: sInstr, sendGain: 0.25 });
  }
  if (inVerse) {
    const rhythm = [0.5, 1.5, 2.75];
    for (const bt of rhythm) {
      const sb = stabBuf(ch, 0.42 * SPB, verse2 ? 0.85 : 0.6);
      addMono(gInstr, sb, sec(bar, bt), { gain: verse2 ? 0.62 : 0.5, pan: 0.12, duck: 1, send: sInstr, sendGain: 0.18 });
    }
  }
  if (inClimax) {
    addMono(gInstr, stabBuf(ch, 0.9 * SPB, 0.9), t0, { gain: 0.8, duck: 1, send: sInstr, sendGain: 0.22 });
    for (const bt of [1.5, 2.5, 3.5]) {
      addMono(gInstr, stabBuf(ch, 0.4 * SPB, 0.8), sec(bar, bt), { gain: 0.58, pan: -0.15, duck: 1 });
    }
    // arp 16ths
    const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12];
    for (let s16 = 0; s16 < 16; s16++) {
      const m = tones[s16 % 4];
      addMono(gInstr, arpBuf(m), sec(bar, s16 * stepT / SPB),
        { gain: 0.34, pan: (s16 % 2 ? 0.55 : -0.55), duck: 1 });
    }
  }
  if (inOutro) {
    if (bar === 64) addMono(gInstr, stabBuf(ch, 1.6 * SPB, 1.0), t0, { gain: 0.85, send: sInstr, sendGain: 0.3 });
    if (bar === 65) {
      addMono(gInstr, stabBuf(ch, 3.6 * SPB, 0.8), t0, { gain: 0.9, send: sInstr, sendGain: 0.35 });
      addMono(gInstr, padBuf(ch, 3.5 * SPB), t0, { gain: 0.8, send: sInstr, sendGain: 0.3 });
    }
  }
}

// ================= REVERB (Schroeder) =================
function reverbProcess(send, wetL, wetR, level) {
  const combMs = [29.7, 37.1, 41.1, 43.7], fb = 0.80, damp = 0.28;
  const apMs = [5.0, 1.7], apG = 0.5;
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const mkCombs = (jitter) => combMs.map(ms => {
    const d = Math.floor((ms + jitter) / 1000 * SR);
    return { buf: new Float32Array(d), idx: 0, filt: 0 };
  });
  const combsL = mkCombs(0), combsR = mkCombs(1.7);
  const mkAp = () => apMs.map(ms => ({ buf: new Float32Array(Math.floor(ms / 1000 * SR)), idx: 0 }));
  const apsL = mkAp(), apsR = mkAp();
  const allpass = (aps, x) => {
    let v = x;
    for (const ap of aps) {
      const d = ap.buf[ap.idx];
      const y = -v + d;
      ap.buf[ap.idx] = v + d * apG;
      v = y;
      ap.idx = (ap.idx + 1) % ap.buf.length;
    }
    return v;
  };
  for (let i = 0; i < N; i++) {
    const x = send[i];
    let accL = 0, accR = 0;
    for (let c = 0; c < 4; c++) {
      const cb = combsL[c], rb = combsR[c];
      const yl = cb.buf[cb.idx], yr = rb.buf[rb.idx];
      cb.filt = yl * (1 - damp) + cb.filt * damp;
      rb.filt = yr * (1 - damp) + rb.filt * damp;
      cb.buf[cb.idx] = x + cb.filt * fb;
      rb.buf[rb.idx] = x + rb.filt * fb;
      cb.idx = (cb.idx + 1) % cb.buf.length;
      rb.idx = (rb.idx + 1) % rb.buf.length;
      accL += yl; accR += yr;
    }
    outL[i] = allpass(apsL, accL / 4);
    outR[i] = allpass(apsR, accR / 4);
  }
  for (let i = 0; i < N; i++) {
    wetL[i] += outL[i] * level; wetR[i] += outR[i] * level;
  }
}

// ================= FINAL MIX =================
const mixL = new Float32Array(N), mixR = new Float32Array(N);       // instrumental
const voxL = new Float32Array(N), voxR = new Float32Array(N);       // player vox

reverbProcess(sInstr, mixL, mixR, 0.85);
reverbProcess(sVoxP, voxL, voxR, 1.0);
for (let i = 0; i < N; i++) {
  mixL[i] += gInstr.L[i]; mixR[i] += gInstr.R[i];
  voxL[i] += gVoxP.L[i]; voxR[i] += gVoxP.R[i];
}

// normalize jointly so summed peak ~= target
let pk = 0;
for (let i = 0; i < N; i++) {
  pk = Math.max(pk, Math.abs(mixL[i] + voxL[i]), Math.abs(mixR[i] + voxR[i]));
}
const target = 0.90, norm = target / (pk || 1);
console.log(`pre-norm peak=${pk.toFixed(3)} -> norm=${norm.toFixed(4)}`);
for (let i = 0; i < N; i++) { mixL[i] *= norm; mixR[i] *= norm; voxL[i] *= norm; voxR[i] *= norm; }

// gentle glue saturation on instrumental only (keep vox clean)
for (let i = 0; i < N; i++) { mixL[i] = Math.tanh(mixL[i] * 1.06) / 1.043; mixR[i] = Math.tanh(mixR[i] * 1.06) / 1.043; }

// stats
function rms(l, r, a, b) {
  let s = 0, c = 0;
  for (let i = a; i < b; i++) { const v = (l[i] + r[i]) * 0.5; s += v * v; c++; }
  return Math.sqrt(s / c);
}
const db = v => (20 * Math.log10(v + 1e-12)).toFixed(1);
console.log(`duration=${(N / SR).toFixed(1)}s`);
const secs = [['intro', 0, 8], ['v1a-opp', 8, 16], ['v1b-plr', 16, 24], ['v2a-opp', 24, 32], ['v2b-plr', 32, 40], ['break', 40, 48], ['climax', 48, 64], ['outro', 64, 68]];
for (const [nm, b0, b1] of secs) console.log(`  ${nm.padEnd(8)} rms=${db(rms(mixL, mixR, barSec(b0) * SR | 0, barSec(b1) * SR | 0))}dB`);
let clip = 0;
for (let i = 0; i < N; i++) if (Math.abs(mixL[i]) > 0.998 || Math.abs(mixR[i]) > 0.998) clip++;
console.log(`clipped samples: ${clip}`);

// ================= WAV EXPORT =================
function writeWav(file, L, R) {
  const stereo = R !== null;
  const ch = stereo ? 2 : 1, len = L.length;
  const dataBytes = len * ch * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < len; i++) {
    const chans = stereo ? [L[i], R[i]] : [L[i]];
    for (const v of chans) {
      let s = Math.max(-1, Math.min(1, v));
      s += (Math.random() - 0.5) / 32768; // TPDF-ish dither
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), o); o += 2;
    }
  }
  fs.writeFileSync(file, buf);
  console.log(`wrote ${path.basename(file)} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
writeWav(path.join(DATA, 'instrumental.wav'), mixL, mixR);
writeWav(path.join(DATA, 'playervox.wav'), voxL, voxR);

// ================= CHART EXPORT =================
// lane mapping: pitch quartile + contour fixes
function mapLanes(list) {
  const notes = [...list].sort((a, b) => a.t - b.t);
  const lo = Math.min(...notes.map(n => n.midi)), hi = Math.max(...notes.map(n => n.midi));
  const span = hi - lo || 1;
  let prev = null, prevLane = -1;
  for (const n of notes) {
    let lane = Math.min(3, Math.floor((n.midi - lo) / span * 4));
    // contour nudge for big leaps
    if (prev && n.midi - prev.midi >= 4) lane = Math.min(3, lane + 1);
    else if (prev && prev.midi - n.midi >= 4) lane = Math.max(0, lane - 1);
    // anti-jack: same lane too fast -> move aside
    if (prevLane === lane && prev && n.t - prev.t < 0.30) {
      lane = n.midi >= prev.midi ? Math.min(3, lane + 1) : Math.max(0, lane - 1);
      if (lane === prevLane) lane = (lane + 2) % 4;
    }
    // anti-trill-spam
    if (notes.length > 4) {
      const idx = notes.indexOf(n);
      if (idx >= 3) {
        const a = notes[idx - 3].lane ?? notes[idx - 3]._lane, b = notes[idx - 2]._lane, c = notes[idx - 1]._lane;
        if (a === lane && b !== a && c === b && n.t - notes[idx - 1].t < 0.35) lane = (lane + 1) % 4;
      }
    }
    n._lane = lane;
    prev = n; prevLane = lane;
  }
  return notes.map(n => ({ t: +n.t.toFixed(4), midi: n.midi, lane: n._lane, dur: +n.dur.toFixed(4) }));
}
const oppMapped = mapLanes(OPP_VOX), plrMapped = mapLanes(PLR_VOX);

// expand long notes (>=1.6 beats) into tap bursts on same lane
function burstify(list) {
  const out = [];
  for (const n of list) {
    out.push({ t: n.t, lane: n.lane });
    if (n.dur >= 1.6 * SPB) {
      const beatsLong = n.dur / SPB;
      if (beatsLong >= 3.4) {
        out.push({ t: +(n.t + SPB).toFixed(4), lane: n.lane });
        out.push({ t: +(n.t + 2 * SPB).toFixed(4), lane: n.lane });
      } else if (beatsLong >= 1.6) {
        out.push({ t: +(n.t + SPB).toFixed(4), lane: n.lane });
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
const oppNotes = burstify(oppMapped), plrNotes = burstify(plrMapped);

const SECTIONS = [
  { name: 'WARM-UP', start: 0, end: 8, focus: 'none' },
  { name: 'VERSE 1 · VEX', start: 8, end: 16, focus: 'opp' },
  { name: 'VERSE 1 · YOU', start: 16, end: 24, focus: 'plr' },
  { name: 'VERSE 2 · VEX', start: 24, end: 32, focus: 'opp' },
  { name: 'VERSE 2 · YOU', start: 32, end: 40, focus: 'plr' },
  { name: 'THE DROP', start: 40, end: 48, focus: 'both' },
  { name: 'CLIMAX', start: 48, end: 64, focus: 'both' },
  { name: 'FINAL CALL', start: 64, end: 68, focus: 'both' },
];

const chart = {
  song: {
    title: 'STATIC ALLEY',
    artist: 'Kip vs Vex',
    bpm: BPM,
    length: +(N / SR).toFixed(2),
    lastNote: Math.max(...plrNotes.map(n => n.t)),
  },
  sections: SECTIONS,
  opponent: oppNotes,
  player: plrNotes,
};
fs.writeFileSync(path.join(DATA, 'chart.json'), JSON.stringify(chart));
console.log(`chart: opp=${oppNotes.length} plr=${plrNotes.length} notes; song ${(N / SR).toFixed(1)}s`);
