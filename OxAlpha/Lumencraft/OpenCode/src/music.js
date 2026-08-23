// Ambient music system: original C418-inspired pieces synthesized procedurally.
// Theory notes: pieces use diatonic added-tone harmony (maj9 / m7 / sus2),
// pentatonic-leaning melodies that resolve to chord tones, rubato humanization,
// and long convolution reverb for the classic "Minecraft calm" space.
const A4 = 440;
export const hz = (m) => A4 * Math.pow(2, (m - 69) / 12);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Piece 1: "Sunfall" — F major, felt piano ballad (Sweden mood) ----------
function pieceSunfall() {
  const bpm = 68, spb = 60 / bpm, ev = [];
  // chords, one per 8 beats: [root bass, LH tone stack]
  const F  = { r: 41, t: [53, 57, 60, 64] };   // F2 | F3 A3 C4 E4 (maj7)
  const Am = { r: 45, t: [52, 55, 57, 60] };   // A2 | E3 G3 A3 C4 (m7 color)
  const Bb = { r: 46, t: [53, 58, 62, 65] };   // Bb2 | F3 Bb3 D4 F4 -> maj9 color via melody
  const C  = { r: 48, t: [50, 55, 60, 62] };   // C3 | D3 G3 C4 D4 (Csus2/add4, fully diatonic)

  const lh = (c, at) => {
    ev.push([at, c.r, 5.5, 0.34, 'b']);
    ev.push([at + 2.5, c.t[0], 3, 0.22, 'p']);
    ev.push([at + 4.5, c.t[1], 3, 0.21, 'p']);
    ev.push([at + 6.25, c.t[2], 1.75, 0.18, 'p']);
  };
  // pads swell behind each chord
  const pad = (c, at) => ev.push([at, 0, 8, 0.05, 'pad', [...c.t, c.t[0] + 12]]);

  let t = 8; // 8-beat intro (bass + pads only)
  [F, Am, Bb, C].forEach(c => { pad(c, t); lh(c, t); t += 8; });

  // melody cycle A (32 beats)
  const melA = [
    [0.5, 69, 1.5], [2, 72, 2], [4, 74, 1.5], [5.5, 72, .75], [6.25, 69, 2],
    [8.5, 76, 1.5], [10, 72, 2], [12, 69, 3.5],
    [16, 74, 1.5], [17.5, 77, 2.5], [20, 76, 1.25], [21.25, 74, .75], [22, 72, 2],
    [24, 72, 1.5], [25.5, 69, 2], [27.5, 67, 1.5], [29, 65, 3],
  ];
  // melody cycle A' — varied first half
  const melB = [
    [.5, 77, 1.5], [2, 76, 1], [3, 74, 1], [4, 72, 2.5], [6.5, 69, 1.75],
    [8.5, 72, 1.5], [10, 74, 1], [11, 76, 2], [13, 76, 3.5],
    [16, 74, 1.5], [17.5, 77, 2.5], [20, 76, 1.25], [21.25, 74, .75], [22, 72, 2],
    [24, 72, 1.5], [25.5, 69, 2], [27.5, 67, 1.5], [29, 65, 3],
  ];
  const cycle = (mel, at, vmul) => {
    [F, Am, Bb, C].forEach((c, i) => { pad(c, at + i * 8); lh(c, at + i * 8); });
    mel.forEach(([b, m, d]) => ev.push([at + b, m, d, 0.58 * vmul, 'p']));
  };
  cycle(melA, t, 1); t += 32;
  cycle(melB, t, 0.94); t += 32;
  // tag: resolve home to Fmaj(add9), let ring
  pad({ t: [53, 57, 60, 64, 67] }, t);
  ev.push([t, 41, 6, 0.3, 'b']);
  ev.push([t + 1, 65, 5, 0.42, 'p']);
  ev.push([t + 2, 72, 4.5, 0.38, 'p']);
  ev.push([t + 3.5, 69, 4, 0.34, 'p']);
  t += 10;
  return { name: 'Sunfall', bpm, events: ev, lengthBeats: t };
}

// ---- Piece 2: "Hollow" — A minor, rolling arpeggios (Wet Hands mood) --------
function pieceHollow() {
  const bpm = 58, spb = 60 / bpm, ev = [];
  const prog = [
    { r: 45, pat: [45, 52, 57, 59, 60, 64, 59, 57] },  // Am9
    { r: 41, pat: [41, 48, 52, 57, 60, 57, 52, 48] },  // Fmaj7
    { r: 48, pat: [48, 52, 55, 59, 62, 64, 62, 59] },  // Cadd9
    { r: 43, pat: [43, 50, 55, 57, 59, 62, 59, 57] },  // Gsus2
  ];
  // 4 cycles of 4 bars (16 beats each): arpeggio bed throughout
  for (let cyc = 0; cyc < 4; cyc++) {
    for (let bar = 0; bar < 4; bar++) {
      const at = cyc * 16 + bar * 4;
      const ch = prog[bar];
      ev.push([at, 0, 4, 0.045, 'pad', ch.pat.slice(1, 5)]);
      ch.pat.forEach((m, i) => ev.push(
        [at + i * 0.5, m, 0.95, 0.2 * (i === 0 ? 1.15 : 1) - i * 0.008, 'p']));
    }
  }
  // sparse high melody enters on cycles 2 & 3 (A-minor pentatonic)
  const mel = [
    [16, 76, 3], [20, 74, 1.5], [21.5, 72, 1.5], [23, 69, 2],
    [24, 72, 2.5], [26.5, 67, 1.5], [28, 64, 4],
    [32, 79, 2.5], [34.5, 76, 1.5], [36, 74, 2], [38, 72, 2],
    [40, 74, 1.5], [41.5, 72, 1.5], [43, 69, 2], [45, 64, 3],
  ];
  mel.forEach(([b, m, d]) => ev.push([b, m, d, 0.5, 'p']));
  // outro: bare fifths dying away
  ev.push([64, 45, 6, 0.26, 'b']);
  ev.push([64, 52, 6, 0.14, 'p']);
  ev.push([66, 57, 5, 0.12, 'p']);
  return { name: 'Hollow', bpm, events: ev, lengthBeats: 70 };
}

// ---- Piece 3: "Starfield" — C major pads + piano echoes (Subwoofer mood) ----
function pieceStarfield() {
  const bpm = 63, spb = 60 / bpm, ev = [];
  const prog = [
    { r: 36, pad: [48, 52, 55, 59, 62] },  // Cmaj9
    { r: 40, pad: [47, 52, 55, 59, 62] },  // Em7 (with D)
    { r: 41, pad: [53, 57, 60, 64] },      // Fmaj7 (#11 arrives as piano B natural)
    { r: 45, pad: [52, 55, 57, 60, 64] },  // Am11
    { r: 43, pad: [50, 55, 59, 62] },      // Gsus2... G B D + A
    { r: 36, pad: [48, 52, 55, 59, 62] },  // home
  ];
  const echoes = [
    [[1, 64, 2], [4, 67, 2.5]],
    [[9, 71, 2], [12, 74, 2.5]],
    [[17, 71, 2], [20, 72, 2.5]],   // B over F = lydian shimmer
    [[25, 76, 2], [28, 74, 3]],
    [[33, 74, 1.5], [34.5, 71, 1.5], [36, 67, 4]],
    [],
  ];
  let t = 0;
  prog.forEach((c, i) => {
    const at = t + i * 8;
    ev.push([at, c.r, 7, 0.22, 'b']);
    ev.push([at, 0, 8.2, 0.055, 'pad', c.pad]);
    echoes[i].forEach(([b, m, d], j) => ev.push([at + b, m, d, 0.44 - j * 0.05, 'p']));
  });
  t += 48;
  // final descent over C pedal
  ev.push([t, 36, 10, 0.22, 'b']);
  ev.push([t, 0, 12, 0.06, 'pad', [48, 52, 55, 62]]);
  [[0, 76], [1.5, 74], [3, 72], [5, 67]].forEach(([b, m]) => ev.push([t + b, m, 3, 0.4, 'p']));
  ev.push([t + 7, 64, 6, 0.36, 'p']);
  t += 14;
  return { name: 'Starfield', bpm, events: ev, lengthBeats: t };
}

const PIECE_BUILDERS = [pieceSunfall, pieceHollow, pieceStarfield];

// ---- engine -----------------------------------------------------------------
export class MusicSys {
  constructor(audio) {
    this.a = audio;
    this.bus = null; this.wet = null; this.analyser = null;
    this.playing = false;
    this.currentName = null;
    this.gapTimer = 20 + Math.random() * 25;   // first track soon after entry
    this.lastIndex = -1;
    this.volume = (audio.settings.music ?? 60) / 100;
    this._timer = null;
    this.scheduledCount = 0;
    this.lastNotes = [];
  }

  _ensureNodes() {
    if (this.bus) return true;
    if (!this.a.ctx) return false;
    const ctx = this.a.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    // dark, lush reverb tail
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 3.4, 2.6);
    const wetLP = ctx.createBiquadFilter();
    wetLP.type = 'lowpass'; wetLP.frequency.value = 4200; wetLP.Q.value = 0.4;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.55;
    this.dry = ctx.createGain(); this.dry.gain.value = 0.78;
    this.bus.connect(this.a.master);          // dry path
    this.bus.connect(wetLP); wetLP.connect(conv); conv.connect(this.wet);
    this.wet.connect(this.a.master);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.bus.connect(this.analyser);   // tap post-music-volume for tests/debug
    return true;
  }

  setVolume(v01) {
    if (!Number.isFinite(+v01)) return;
    this.volume = +v01;
    if (this.bus && this.a.ctx) this.bus.gain.setTargetAtTime(this.volume, this.a.ctx.currentTime, 0.15);
  }

  update(dt) {
    void dt;
    if (!this.a.ctx || this.a.ctx.state !== 'running') return;
    if (!this._timer) this._timer = setInterval(() => this.update(1), 500);
    if (!this._ensureNodes()) return;
    if (this.playing) {
      if (this.a.ctx.currentTime >= this._endTime) {
        this.playing = false;
        this.gapTimer = 95 + Math.random() * 150;   // minutes of quiet between tracks
      }
      return;
    }
    this.gapTimer -= 0.5;
    if (this.gapTimer <= 0) this.startRandomPiece();
  }

  startRandomPiece() {
    let i;
    do { i = Math.floor(Math.random() * PIECE_BUILDERS.length); } while (i === this.lastIndex && PIECE_BUILDERS.length > 1);
    return this.playPiece(i);
  }

  playPiece(i) {
    this.a.ensure();
    if (!this.a.ctx || this.playing || !this._ensureNodes()) return false;
    const piece = PIECE_BUILDERS[i]();
    const rng = mulberry32(0x9e37 + i * 7919);
    const spb = 60 / piece.bpm;
    const t0 = this.a.ctx.currentTime + 0.08;
    this.lastNotes = [];
    for (const e of piece.events) {
      const [beat, midi, dur, vel, voice, padTones] = e;
      const when = beat * spb;
      if (voice === 'pad') this._pad(padTones, t0 + when, dur * spb, vel, rng);
      else {
        const jitter = voice === 'p' ? (rng() - 0.5) * 0.045 : 0;
        const v = vel * (voice === 'p' ? 0.85 + rng() * 0.3 : 1);
        this.lastNotes.push({ m: midi, t: +(when).toFixed(2), d: dur, v: +v.toFixed(3) });
        if (voice === 'p') this._piano(hz(midi), t0 + when + jitter, dur * spb, v);
        else this._bass(hz(midi), t0 + when, dur * spb, v);
      }
    }
    this.scheduledCount = this.lastNotes.length;
    this.currentName = piece.name;
    this.lastIndex = i;
    this.playing = true;
    this._endTime = t0 + piece.lengthBeats * spb + 2.5;
    return true;
  }

  _env(t, attack, peak, tau) {
    const g = this.a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0.0001, t + attack, tau);
    return g;
  }

  // felt/dreamy piano: detuned triangle body + soft sine partials, lowpassed
  _piano(freq, t, dur, vel) {
    const ctx = this.a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(8500, freq * 7 + 900), t);
    lp.frequency.setTargetAtTime(Math.min(3200, freq * 3.2 + 500), t + 0.02, dur * 0.5);
    const out = this._env(t, 0.014, vel * 0.16, Math.max(0.28, dur * 0.3));
    lp.connect(out); out.connect(this.bus);
    const partials = [[1, 'triangle', 1], [2.001, 'sine', 0.34], [3.003, 'sine', 0.13], [4.99, 'sine', 0.05]];
    for (const [mult, type, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      o.detune.value = (Math.random() - 0.5) * 6;
      const pg = ctx.createGain();
      pg.gain.value = amp;
      o.connect(pg); pg.connect(lp);
      o.start(t); o.stop(t + dur + 4.5);
    }
  }

  _bass(freq, t, dur, vel) {
    const ctx = this.a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.max(300, freq * 3);
    const out = this._env(t, 0.06, vel * 0.2, dur * 0.42);
    lp.connect(out); out.connect(this.bus);
    for (const [mult, type, amp] of [[1, 'sine', 1], [2, 'triangle', 0.18]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq * mult;
      const pg = ctx.createGain(); pg.gain.value = amp;
      o.connect(pg); pg.connect(lp);
      o.start(t); o.stop(t + dur + 3);
    }
  }

  _pad(midis, t, dur, vel, rng) {
    if (!midis || !midis.length) return;
    const ctx = this.a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1050; lp.Q.value = 0.3;
    // slow swell, gentle hold, long fade
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(vel, t + Math.min(1.8, dur * 0.3));
    out.gain.setValueAtTime(vel, t + dur * 0.7);
    out.gain.setTargetAtTime(0.0001, t + dur * 0.75, 1.5);
    lp.connect(out); out.connect(this.bus);
    midis.forEach((m, i) => {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m - 12);           // pad voiced an octave down
        o.detune.value = det + (rng() - 0.5) * 4;
        const pg = ctx.createGain(); pg.gain.value = 0.5 / midis.length;
        o.connect(pg); pg.connect(lp);
        o.start(t + i * 0.03); o.stop(t + dur + 4);
      }
    });
  }
}

function makeImpulse(ctx, seconds, decayPow) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayPow);
    }
  }
  return buf;
}
