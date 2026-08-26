export const BPM = 152;
export const BEAT = 60 / BPM;
export const STEP = BEAT / 4;

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, Bb: 10, Eb: 3, Ab: 8, Db: 1 };
function N(name) {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  let v = PC[m[1]] + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0);
  return v + (parseInt(m[3], 10) + 1) * 12;
}

const SECTIONS = [
  ["intro", 8],
  ["verseA", 16],
  ["verseB", 16],
  ["chorus", 16],
  ["bridge", 12],
  ["chorus2", 20],
  ["outro", 6],
];

const PROGS = {
  intro: [["D", "min"], ["Bb", "maj"], ["F", "maj"], ["C", "maj"]],
  verse: [["D", "min"], ["Bb", "maj"], ["F", "maj"], ["C", "maj"]],
  chorus: [["Bb", "maj"], ["F", "maj"], ["C", "maj"], ["D", "min"]],
  bridge: [["G", "min"], ["Bb", "maj"], ["A", "min"], ["C", "maj"]],
  chorus2: [["C", "maj"], ["G", "maj"], ["D", "maj"], ["E", "min"]],
};

const VA1 = [
  [0, "D4", 2], [4, "D4", 2], [6, "F4", 2], [10, "G4", 3], [14, "A4", 2],
  [16, "Bb4", 5], [24, "A4", 2], [26, "G4", 2], [28, "F4", 3],
  [32, "F4", 2], [36, "A4", 2], [40, "C5", 3], [44, "A4", 2], [46, "G4", 2],
  [48, "G4", 5], [56, "E4", 2], [58, "F4", 2], [60, "G4", 2], [62, "F4", 2],
];
const VA1b = [
  [0, "D4", 2], [4, "D4", 2], [6, "F4", 2], [10, "G4", 3], [14, "A4", 2],
  [16, "Bb4", 5], [24, "A4", 2], [26, "G4", 2], [28, "F4", 3],
  [32, "F4", 2], [36, "A4", 2], [40, "C5", 3], [44, "A4", 2], [46, "G4", 2],
  [48, "G4", 4], [56, "E4", 4], [60, "F4", 4],
];
const VA1d = [
  [0, "D4", 2], [4, "D4", 2], [6, "F4", 2], [10, "G4", 3], [14, "A4", 2],
  [16, "Bb4", 5], [24, "A4", 2], [26, "G4", 2], [28, "F4", 3],
  [32, "F4", 2], [36, "A4", 2], [40, "C5", 2], [42, "D5", 2], [44, "C5", 2], [46, "A4", 2],
  [48, "G4", 2], [52, "A4", 2], [54, "Bb4", 2], [56, "C5", 2], [58, "D5", 6],
];
const VB1 = [
  [0, "A4", 2], [2, "A4", 2], [4, "C5", 2], [6, "A4", 2], [8, "D5", 5], [14, "C5", 2],
  [16, "D5", 5], [24, "C5", 2], [26, "Bb4", 2], [28, "A4", 3],
  [32, "C5", 2], [36, "D5", 2], [40, "F5", 4], [44, "D5", 2], [46, "C5", 2],
  [48, "C5", 4], [56, "Bb4", 2], [58, "A4", 2], [60, "G4", 3],
];
const VB1b = [
  [0, "A4", 2], [2, "A4", 2], [4, "C5", 2], [6, "A4", 2], [8, "D5", 5], [14, "C5", 2],
  [16, "D5", 5], [24, "C5", 2], [26, "Bb4", 2], [28, "A4", 3],
  [32, "C5", 2], [36, "D5", 2], [40, "F5", 4], [44, "D5", 2], [46, "C5", 2],
  [48, "C5", 4], [56, "A4", 2], [58, "G4", 2], [60, "E4", 4],
];
const VB1d = [
  [0, "A4", 2], [2, "A4", 2], [4, "C5", 2], [6, "A4", 2], [8, "D5", 5], [14, "C5", 2],
  [16, "D5", 5], [24, "C5", 2], [26, "Bb4", 2], [28, "A4", 3],
  [32, "C5", 2], [36, "D5", 2], [40, "F5", 4], [44, "D5", 2], [46, "C5", 2],
  [48, "C5", 2], [50, "D5", 2], [52, "E5", 2], [54, "F5", 2], [56, "E5", 8],
];
const HOOK = [
  [0, "F5", 3], [3, "F5", 1], [4, "G5", 4], [8, "F5", 2], [10, "D5", 2], [12, "F5", 4],
  [16, "C5", 4], [24, "A4", 2], [26, "C5", 2], [28, "F5", 3],
  [32, "G5", 3], [35, "G5", 1], [36, "A5", 4], [40, "G5", 2], [42, "E5", 2], [44, "G5", 4],
  [48, "F5", 4], [56, "D5", 2], [58, "E5", 2], [60, "D5", 3],
];
const HOOKV = [
  [0, "F5", 3], [3, "F5", 1], [4, "G5", 4], [8, "F5", 2], [10, "D5", 2], [12, "F5", 4],
  [16, "C5", 4], [24, "A4", 2], [26, "C5", 2], [28, "F5", 3],
  [32, "G5", 3], [35, "G5", 1], [36, "A5", 4], [40, "G5", 2], [42, "E5", 2], [44, "G5", 4],
  [48, "E5", 2], [50, "F5", 2], [52, "G5", 2], [54, "A5", 2], [56, "C6", 8],
];
const BRIDGE_MEL = [
  [0, "D5", 12], [24, "Bb4", 8],
  [32, "D5", 12], [56, "F5", 10],
  [64, "C5", 12], [88, "E5", 10],
  [96, "D5", 20],
  [128, "Bb4", 8], [136, "C5", 8], [144, "D5", 12],
  [160, "F5", 4], [164, "G5", 4], [168, "A5", 4], [172, "Bb5", 4], [176, "C6", 16],
];

function triad(rootPc, q, oct) {
  const r = rootPc + (oct + 1) * 12;
  return q === "min" ? [r, r + 3, r + 7] : [r, r + 4, r + 7];
}

export function compose() {
  const ev = [];
  const mel = [];
  const starts = {};
  let b = 0;
  for (const [id, bars] of SECTIONS) { starts[id] = b; b += bars; }
  const totalBars = b;
  const BT = (bar, step = 0) => (bar * 16 + step) * STEP;
  const push = (inst, t, p) => ev.push(Object.assign({ inst, t }, p));

  const chordForBar = (sec, i) => {
    const prog = PROGS[sec];
    const [pc, q] = prog[i % prog.length];
    return { pc, q };
  };

  const addPad = (bar, pc, q, dur, gain, bright) => {
    const tones = triad(PC[pc], q, 3);
    push("pad", BT(bar), { midis: tones.concat([tones[0] + 12]), dur, gain, bright });
  };

  const addBassBar = (bar, pc, style, tr = 0) => {
    const root = PC[pc] + 12 + tr;
    if (style === "funk") {
      const pat = [[0, 0, 2, 0.95], [2, 0, 1, 0.6], [4, 0, 2, 0.85], [6, 12, 1, 0.7], [8, 0, 2, 0.9], [10, 0, 1, 0.6], [12, 7, 2, 0.8], [14, 12, 1, 0.7]];
      for (const [s, off, d, v] of pat) push("bass", BT(bar, s), { midi: root + off, dur: d * STEP * 0.9, vel: v });
    } else if (style === "drive") {
      for (let s = 0; s < 16; s += 2) push("bass", BT(bar, s), { midi: root, dur: STEP * 1.7, vel: s % 4 === 0 ? 0.95 : 0.7 });
      push("bass", BT(bar, 13), { midi: root, dur: STEP * 0.8, vel: 0.65 });
    } else if (style === "half") {
      push("bass", BT(bar), { midi: root - 12, dur: BEAT * 2, vel: 0.95 });
      push("bass", BT(bar, 8), { midi: root - 12, dur: BEAT * 1.6, vel: 0.8 });
    } else if (style === "sub") {
      push("bass", BT(bar), { midi: root - 12, dur: BEAT * 3.6, vel: 0.9 });
    }
  };

  const addDrums = (bar, style, opts = {}) => {
    const fill = opts.fill;
    if (style === "pulse") {
      for (let s = 0; s < 16; s += 4) push("kick", BT(bar, s), { vel: 0.9 });
      for (let s = 0; s < 16; s += 2) push("hat", BT(bar, s), { vel: s % 4 ? 0.22 : 0.4 });
      push("clap", BT(bar, 4), { vel: 0.7 }); push("clap", BT(bar, 12), { vel: 0.7 });
    } else if (style === "funk") {
      const kicks = fill ? [0, 6, 7, 10] : [0, 7, 10];
      for (const s of kicks) push("kick", BT(bar, s), { vel: 0.95 });
      for (const s of [4, 12]) push("snare", BT(bar, s), { vel: 0.85 });
      if (fill) push("snare", BT(bar, 15), { vel: 0.35 });
      for (let s = 0; s < 16; s += 2) push("hat", BT(bar, s), { vel: s % 4 === 0 ? 0.45 : 0.25 });
      push("hat", BT(bar, 14), { open: true, vel: 0.3 });
    } else if (style === "rock") {
      for (let s = 0; s < 16; s += 4) push("kick", BT(bar, s), { vel: 1 });
      if (!fill) push("kick", BT(bar, 14), { vel: 0.8 });
      for (const s of [4, 12]) push("clap", BT(bar, s), { vel: 0.9 });
      for (let s = 0; s < 16; s += 2) push("hat", BT(bar, s), { vel: s % 4 === 0 ? 0.5 : 0.3 });
      if (opts.crash) push("crash", BT(bar), { vel: 0.9 });
    } else if (style === "rockx") {
      for (const s of [0, 4, 8, 10, 12]) push("kick", BT(bar, s), { vel: 1 });
      for (const s of [4, 12]) push("clap", BT(bar, s), { vel: 0.95 });
      for (let s = 0; s < 16; s++) push("hat", BT(bar, s), { vel: s % 2 ? 0.18 : 0.45 });
      if (opts.crash) push("crash", BT(bar), { vel: 0.9 });
    } else if (style === "half") {
      push("kick", BT(bar), { vel: 0.95 });
      push("snare", BT(bar, 8), { vel: 0.8 });
      for (let s = 0; s < 16; s += 4) push("hat", BT(bar, s), { vel: 0.3 });
    } else if (style === "soft") {
      for (let s = 0; s < 16; s += 4) push("hat", BT(bar, s), { vel: 0.18 });
    }
    if (fill) {
      for (let s = 8; s < 16; s++) push("snare", BT(bar, s), { vel: 0.3 + (s - 8) * 0.065 });
    }
  };

  const addArp = (bar, pc, q, gain) => {
    const tones = triad(PC[pc], q, 4);
    const seq = [tones[0], tones[1], tones[2], tones[1]];
    for (let i = 0; i < 16; i++) push("pluck", BT(bar, i), { midi: seq[i % 4] , vel: gain * (i % 4 === 0 ? 1 : 0.72) });
  };

  const addMel = (phraseData, startBar, pl, tr = 0, leadGain = 1) => {
    for (const [s, name, d] of phraseData) {
      const t = BT(startBar) + s * STEP;
      const midi = N(name) + tr;
      const dur = d * STEP;
      push("lead", t, { midi, dur, vel: 0.62 * leadGain });
      mel.push({ t, midi, dur, steps: d, pl });
    }
  };

  for (let k = 0; k < 8; k++) {
    const c = chordForBar("intro", k);
    addPad(k, c.pc, c.q, BEAT * 3.7, 0.16, false);
    if (k >= 4) {
      addDrums(k, "pulse");
      addBassBar(k, c.pc, "sub");
      addArp(k, c.pc, c.q, 0.3);
    } else {
      addDrums(k, "soft");
      addBassBar(k, c.pc, "sub");
    }
  }
  push("riser", BT(6), { dur: BEAT * 8 });

  for (let k = 0; k < 16; k++) {
    const ph = k % 4;
    const c = chordForBar("verse", ph);
    const fill = k % 8 === 7;
    addDrums(k + 8, "funk", { fill });
    addBassBar(k + 8, c.pc, "funk");
    addPad(k + 8, c.pc, c.q, BEAT * 3.7, 0.1, false);
    if (k % 4 === 0) {
      const which = k >= 12 ? VA1d : ((k % 8) >= 4 ? VA1b : VA1);
      addMel(which, k + 8, "p1");
    }
  }

  for (let k = 0; k < 16; k++) {
    const ph = k % 4;
    const c = chordForBar("verse", ph);
    const fill = k % 8 === 7;
    addDrums(k + 24, "funk", { fill });
    addBassBar(k + 24, c.pc, "funk");
    addPad(k + 24, c.pc, c.q, BEAT * 3.7, 0.11, false);
    if (k % 4 === 0) {
      const which = k >= 12 ? VB1d : ((k % 8) >= 4 ? VB1b : VB1);
      addMel(which, k + 24, "p2");
    }
  }

  for (let k = 0; k < 16; k++) {
    const ph = k % 4;
    const c = chordForBar("chorus", ph);
    addDrums(k + 40, "rock", { fill: k % 8 === 7, crash: k % 4 === 0 });
    addBassBar(k + 40, c.pc, "drive");
    addPad(k + 40, c.pc, c.q, BEAT * 3.7, 0.13, true);
    if (k % 4 === 0) {
      const hookIdx = k / 4;
      const which = (hookIdx === 1 || hookIdx === 3) ? HOOKV : HOOK;
      const pl = hookIdx === 0 ? "p1" : hookIdx === 1 ? "p2" : hookIdx === 2 ? "p1" : "both";
      addMel(which, k + 40, pl, 0, 1.08);
    }
    addArp(k + 40, c.pc, c.q, 0.2);
  }
  push("riser", BT(38), { dur: BEAT * 8 });

  const bridgeChunks = [["G", "min"], ["Bb", "maj"], ["A", "min"], ["C", "maj"], ["G", "min"], ["C", "maj"]];
  for (let k = 0; k < 12; k++) {
    const cc = bridgeChunks[Math.floor(k / 2)];
    addDrums(k + 56, "half", {});
    addBassBar(k + 56, cc[0], "half");
    addPad(k + 56, cc[0], cc[1], BEAT * 7.4, 0.15, false);
    if (k >= 8) addArp(k + 56, cc[0], cc[1], 0.34);
  }
  push("riser", BT(64), { dur: BEAT * 16, strong: true });
  const bridgePl = ["p1", "p2", "p1", "p2", "p1", "p2"];
  BRIDGE_MEL.forEach(([s, name, d]) => {
    const chunk = Math.min(5, Math.floor(s / 32));
    const t = BT(56) + s * STEP;
    const midi = N(name);
    const dur = d * STEP;
    push("lead", t, { midi, dur, vel: 0.6 });
    mel.push({ t, midi, dur, steps: d, pl: bridgePl[chunk] });
  });

  for (let k = 0; k < 20; k++) {
    const ph = k % 4;
    const c = chordForBar("chorus2", ph);
    addDrums(k + 68, k >= 16 ? "rockx" : "rock", { fill: k % 8 === 7, crash: k % 4 === 0 });
    addBassBar(k + 68, c.pc, k >= 16 ? "drive" : "drive", 2);
    addPad(k + 68, c.pc, c.q, BEAT * 3.7, 0.14, true, 2);
    if (k % 4 === 0) {
      const hookIdx = k / 4;
      const tr = 2;
      const which = (hookIdx === 1 || hookIdx === 3) ? HOOKV : HOOK;
      const pl = hookIdx === 0 ? "p1" : hookIdx === 1 ? "p2" : hookIdx === 2 ? "p1" : "both";
      addMel(which, k + 68, pl, tr, 1.12);
    }
    if (k >= 12) addArp(k + 68, c.pc, c.q, 0.22);
  }
  push("riser", BT(86), { dur: BEAT * 8 });

  const oc = chordForBar("chorus2", 0);
  push("crash", BT(88), { vel: 1 });
  push("impact", BT(88), { vel: 1 });
  addPad(88, "D", "min", BEAT * 14, 0.22, true);
  push("bass", BT(88), { midi: PC.D, dur: BEAT * 3.5, vel: 1 });
  push("bass", BT(92), { midi: PC.D, dur: BEAT * 3.5, vel: 0.7 });
  push("lead", BT(89, 0), { midi: N("D5"), dur: BEAT * 1.8, vel: 0.4 });
  push("lead", BT(91, 0), { midi: N("A5"), dur: BEAT * 1.4, vel: 0.32 });

  ev.sort((a, x) => a.t - x.t);
  mel.sort((a, x) => a.t - x.t);

  const sectionMeta = {};
  for (const [id] of SECTIONS) sectionMeta[id] = { bar: starts[id], t: BT(starts[id]) };
  return {
    events: ev,
    melody: mel,
    totalBars,
    length: BT(totalBars),
    bpm: BPM,
    sections: sectionMeta,
  };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCharts(song) {
  const rnd = mulberry(0x5eed1);
  const charts = { p1: [], p2: [] };
  const LANE_UP = 2, LANE_DOWN = 1, LANE_LEFT = 0, LANE_RIGHT = 3;
  for (const n of song.melody) {
    const players = n.pl === "both" ? ["p1", "p2"] : [n.pl];
    for (const who of players) {
      const ch = charts[who];
      const last = ch.length ? ch[ch.length - 1] : null;
      const prevMidi = last ? last.midi : n.midi;
      let pool;
      if (n.midi > prevMidi) pool = [LANE_UP, LANE_RIGHT];
      else if (n.midi < prevMidi) pool = [LANE_DOWN, LANE_LEFT];
      else pool = [LANE_LEFT, LANE_DOWN, LANE_UP, LANE_RIGHT];
      let lane;
      const lastLane = last ? last.lane : -1;
      const cand = pool.filter(l => l !== lastLane);
      lane = cand.length ? cand[Math.floor(rnd() * cand.length)] : pool[Math.floor(rnd() * pool.length)];
      if (rnd() < 0.12) lane = [0, 1, 2, 3].filter(l => l !== lastLane)[Math.floor(rnd() * 3)];
      const isHold = n.steps >= 6;
      ch.push({
        t: n.t,
        lane,
        midi: n.midi,
        hold: isHold ? n.dur * 0.92 : 0,
        judged: false,
        hit: false,
        missed: false,
        holdEnd: 0,
        holdDone: false,
        scoreGiven: false,
      });
    }
  }
  for (const who of ["p1", "p2"]) charts[who].sort((a, b) => a.t - b.t);
  return charts;
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.timer = null;
    this.songStart = 0;
    this.idx = 0;
    this.events = null;
    this.playing = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp.connect(this.master).connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.connect(this.comp);
    this.pump = ctx.createGain();
    this.pump.connect(this.comp);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 1;
    this.dl = ctx.createDelay(1.5);
    this.dl.delayTime.value = BEAT * 0.75;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.3;
    this.dw = ctx.createGain(); this.dw.gain.value = 0.17;
    this.delaySend.connect(this.dl);
    this.dl.connect(this.fb).connect(this.dl);
    this.dl.connect(this.dw).connect(this.comp);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 1;
    this.rvb = ctx.createConvolver();
    this.rvb.buffer = this.makeImpulse(1.7, 2.6);
    this.rw = ctx.createGain(); this.rw.gain.value = 0.16;
    this.revSend.connect(this.rvb).connect(this.rw).connect(this.comp);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
  }
  makeImpulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
  noise(when, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(when);
    src.stop(when + dur + 0.05);
    return src;
  }
  venv(when, a, peak, dur, r = 0.05) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.setValueAtTime(peak, Math.max(when + a, when + dur));
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(when + a, when + dur) + r);
    return g;
  }
  play(ev, when) {
    const c = this.ctx;
    switch (ev.inst) {
      case "kick": {
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(155, when);
        o.frequency.exponentialRampToValueAtTime(44, when + 0.09);
        const g = this.venv(when, 0.002, 1.05 * ev.vel, 0.02, 0.17);
        o.connect(g).connect(this.bus);
        o.start(when); o.stop(when + 0.25);
        const n = this.noise(when, 0.02);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
        const ng = this.venv(when, 0.001, 0.35 * ev.vel, 0.005, 0.02);
        n.connect(hp).connect(ng).connect(this.bus);
        break;
      }
      case "snare": {
        const n = this.noise(when, 0.16);
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.8;
        const ng = this.venv(when, 0.001, 0.55 * ev.vel, 0.01, 0.13);
        n.connect(bp).connect(ng).connect(this.bus);
        ng.connect(this.revSend);
        const o = c.createOscillator(); o.type = "triangle";
        o.frequency.setValueAtTime(215, when);
        o.frequency.exponentialRampToValueAtTime(165, when + 0.07);
        const og = this.venv(when, 0.001, 0.3 * ev.vel, 0.02, 0.07);
        o.connect(og).connect(this.bus);
        o.start(when); o.stop(when + 0.12);
        break;
      }
      case "clap": {
        for (let i = 0; i < 3; i++) {
          const t = when + i * 0.012;
          const n = this.noise(t, 0.1);
          const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1150; bp.Q.value = 1.4;
          const g = this.venv(t, 0.001, 0.42 * ev.vel * (i === 2 ? 1 : 0.6), 0.004, i === 2 ? 0.12 : 0.03);
          n.connect(bp).connect(g).connect(this.bus);
          if (i === 2) g.connect(this.revSend);
        }
        break;
      }
      case "hat": {
        const open = !!ev.open;
        const n = this.noise(when, open ? 0.3 : 0.05);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7600;
        const g = this.venv(when, 0.001, (open ? 0.26 : 0.3) * ev.vel, 0.002, open ? 0.24 : 0.035);
        n.connect(hp).connect(g).connect(this.bus);
        break;
      }
      case "crash": {
        const n = this.noise(when, 1.2);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200;
        const g = this.venv(when, 0.002, 0.4 * ev.vel, 0.02, 1.1);
        n.connect(hp).connect(g).connect(this.bus);
        g.connect(this.revSend);
        break;
      }
      case "bass": {
        const f = 440 * Math.pow(2, (ev.midi - 69) / 12);
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
        const s = c.createOscillator(); s.type = "sine"; s.frequency.value = f;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2;
        lp.frequency.setValueAtTime(1000, when);
        lp.frequency.exponentialRampToValueAtTime(240, when + 0.12);
        const sg = c.createGain(); sg.gain.value = 0.55;
        const g = this.venv(when, 0.004, 0.5 * ev.vel, Math.max(0.05, ev.dur), 0.05);
        o.connect(lp); s.connect(sg).connect(lp);
        lp.connect(g).connect(this.bus);
        o.start(when); s.start(when);
        o.stop(when + ev.dur + 0.2); s.stop(when + ev.dur + 0.2);
        break;
      }
      case "pluck": {
        const f = 440 * Math.pow(2, (ev.midi - 69) / 12);
        const o = c.createOscillator(); o.type = "square"; o.frequency.value = f;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2300;
        const g = this.venv(when, 0.002, 0.16 * ev.vel, 0.01, 0.16);
        o.connect(lp).connect(g);
        g.connect(this.bus); g.connect(this.delaySend);
        o.start(when); o.stop(when + 0.25);
        break;
      }
      case "lead": {
        const f = 440 * Math.pow(2, (ev.midi - 69) / 12);
        const g = this.venv(when, 0.012, 0.3 * ev.vel, Math.max(0.06, ev.dur * 0.92), 0.07);
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2700; lp.Q.value = 0.7;
        const lfo = c.createOscillator(); lfo.frequency.value = 5.6;
        const lg = c.createGain(); lg.gain.setValueAtTime(0, when);
        lg.gain.linearRampToValueAtTime(9, when + 0.12);
        lfo.connect(lg);
        for (const dt of [-6, 6]) {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = f;
          o.detune.value = dt;
          lg.connect(o.detune);
          o.connect(lp);
          o.start(when); o.stop(when + ev.dur + 0.25);
        }
        lfo.start(when); lfo.stop(when + ev.dur + 0.25);
        lp.connect(g);
        g.connect(this.bus); g.connect(this.delaySend); g.connect(this.revSend);
        break;
      }
      case "pad": {
        const bright = ev.bright ? 1400 : 850;
        for (const m of ev.midis) {
          const f = 440 * Math.pow(2, (m - 69) / 12);
          for (const dt of [-5, 5]) {
            const o = c.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = f;
            o.detune.value = dt;
            const lp = c.createBiquadFilter(); lp.type = "lowpass";
            lp.frequency.setValueAtTime(bright * 0.6, when);
            lp.frequency.linearRampToValueAtTime(bright, when + ev.dur * 0.5);
            const g = this.venv(when, 0.35, ev.gain * 0.5, ev.dur * 0.8, 0.5);
            o.connect(lp).connect(g).connect(this.pump);
            g.connect(this.revSend);
            o.start(when); o.stop(when + ev.dur + 0.7);
          }
        }
        break;
      }
      case "riser": {
        const n = this.noise(when, ev.dur);
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
        bp.frequency.setValueAtTime(280, when);
        bp.frequency.exponentialRampToValueAtTime(ev.strong ? 7000 : 5200, when + ev.dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(ev.strong ? 0.5 : 0.34, when + ev.dur * 0.92);
        g.gain.linearRampToValueAtTime(0.0001, when + ev.dur + 0.05);
        n.connect(bp).connect(g).connect(this.bus);
        break;
      }
      case "impact": {
        const n = this.noise(when, 0.5);
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
        const g = this.venv(when, 0.002, 0.7 * ev.vel, 0.02, 0.45);
        n.connect(lp).connect(g).connect(this.bus);
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(72, when);
        o.frequency.exponentialRampToValueAtTime(38, when + 0.5);
        const og = this.venv(when, 0.002, 0.9 * ev.vel, 0.03, 0.5);
        o.connect(og).connect(this.bus);
        o.start(when); o.stop(when + 0.6);
        break;
      }
      case "tick": {
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = ev.strong ? 1568 : 1046;
        const g = this.venv(when, 0.001, 0.22, 0.005, 0.045);
        o.connect(g).connect(this.bus);
        o.start(when); o.stop(when + 0.08);
        break;
      }
    }
  }
  schedulePump(startTime, beats) {
    const p = this.pump.gain;
    const t = startTime;
    p.cancelScheduledValues(0);
    p.setValueAtTime(1, 0);
    for (let i = 0; i < beats; i++) {
      const bt = t + i * BEAT;
      p.setValueAtTime(1, bt - 0.01);
      p.linearRampToValueAtTime(0.55, bt + 0.03);
      p.linearRampToValueAtTime(1, bt + BEAT * 0.7);
    }
  }
  start(events, length, onEnd) {
    this.init();
    this.stop(false);
    const ctx = this.ctx;
    const begin = () => {
      if (ctx.state === "suspended") ctx.resume();
      const lead = BEAT * 4 + 0.35;
      const t0 = ctx.currentTime + 0.12;
      this.songStart = t0 + lead;
      this.events = events;
      this.length = length;
      this.idx = 0;
      this.playing = true;
      this.onEnd = onEnd || null;
      for (let i = 4; i > 0; i--) {
        this.play({ inst: "tick", strong: i % 2 === 0 }, this.songStart - i * BEAT);
      }
      this.schedulePump(this.songStart, Math.ceil(length / BEAT) + 4);
      const tickFn = () => {
        if (!this.playing) return;
        const horizon = (document.hidden ? 2.4 : 0.28);
        const now = ctx.currentTime;
        const evs = this.events;
        while (this.idx < evs.length && this.songStart + evs[this.idx].t < now + horizon) {
          const e = evs[this.idx++];
          this.play(e, this.songStart + e.t);
        }
        const elapsed = now - this.songStart;
        if (elapsed > length + 1.2 && elapsed < length * 2 + 60) {
          this.playing = false;
          clearInterval(this.timer);
          if (this.onEnd) this.onEnd();
        }
      };
      this.timer = setInterval(tickFn, 30);
      tickFn();
      return this.songStart;
    };
    if (ctx.state === "running") return begin();
    return ctx.resume().then(begin, begin);
  }
  pos() {
    if (!this.ctx || !this.playing) return -99;
    return this.ctx.currentTime - this.songStart;
  }
  stop(clearCb = true) {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (clearCb) this.onEnd = null;
    if (this.pump && this.ctx) this.pump.gain.cancelScheduledValues(0);
  }
  async suspend() { if (this.ctx && this.ctx.state === "running") await this.ctx.suspend(); }
  async resume() { if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume(); }
}
