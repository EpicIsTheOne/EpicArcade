/* ============================================================
   VOLT RUSH — audio.js
   Fully procedural WebAudio: SFX synth + original music sequencer.
   No external assets. Starts only after user gesture (autoplay-safe).
   ============================================================ */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.VoltAudio = { unlock(){}, setMusicOn(){}, setSfxOn(){}, update(){}, play(){}, duck(){}, unduck(){}, setWind(){}, setIntensity(){} }; return; }

  let ctx = null, master = null, sfxBus = null, musBus = null, musDuck = null;
  let musicOn = true, sfxOn = true, started = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.24;
    comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
    musDuck = ctx.createGain(); musDuck.gain.value = 1.0;
    musBus = ctx.createGain(); musBus.gain.value = 0.42; musBus.connect(musDuck); musDuck.connect(comp);
    // shared noise buffer (2s white)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
    return true;
  }

  function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }

  /* ---------------- SFX primitives ---------------- */
  function env(g, t0, a, peak, d, sustain = 0.0001, rel = 0.05, dur = 0.3) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 1e-4), t0 + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + rel);
    return t0 + a + d + rel;
  }

  function tone(type, f0, f1, dur, peak = 0.3, dest = null, detune = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    env(g, t, 0.005, peak, dur * 0.7, 0.0001, dur * 0.3, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.15);
  }

  function noise(dur, peak, fType, f0, f1, q = 0.8, dest = null) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = ctx.createBiquadFilter(); flt.type = fType; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
    const g = ctx.createGain();
    env(g, t, 0.004, peak, dur * 0.8, 0.0001, dur * 0.2, dur);
    src.connect(flt); flt.connect(g); g.connect(dest || sfxBus);
    src.start(t); src.stop(t + dur + 0.1);
  }

  const SFX = {
    jump()      { tone('triangle', 320, 660, 0.16, 0.22); noise(0.08, 0.05, 'highpass', 900, 2400); },
    doubleJump(){ tone('triangle', 420, 880, 0.14, 0.22); tone('sine', 840, 1200, 0.12, 0.12); },
    land(hard)  { noise(hard ? 0.16 : 0.08, hard ? 0.22 : 0.09, 'lowpass', hard ? 700 : 420, 120); if (hard) tone('sine', 130, 60, 0.14, 0.24); },
    dash()      { noise(0.34, 0.30, 'bandpass', 500, 3200, 1.2); tone('sawtooth', 180, 560, 0.3, 0.10); },
    boostTick() { tone('square', 1400 + Math.random() * 300, 900, 0.05, 0.05); },
    spring()    { tone('sine', 300, 1100, 0.22, 0.3); tone('triangle', 600, 1800, 0.18, 0.14); },
    panel()     { tone('sawtooth', 240, 720, 0.2, 0.16); noise(0.18, 0.12, 'bandpass', 800, 2600); },
    ring(pitch) { const p = pitch || 0; tone('sine', 1318 * Math.pow(1.0595, p), 1318 * Math.pow(1.0595, p), 0.09, 0.16); tone('sine', 1976 * Math.pow(1.0595, p), 1976 * Math.pow(1.0595, p), 0.14, 0.10); },
    gem()       { [880, 1108, 1318, 1760].forEach((f, i) => setTimeout(() => tone('sine', f, f, 0.3, 0.14), i * 70)); },
    attack()    { noise(0.12, 0.24, 'bandpass', 1400, 400, 1.5); tone('square', 520, 160, 0.1, 0.12); },
    explode()   { noise(0.5, 0.4, 'lowpass', 1800, 90); tone('sine', 160, 40, 0.4, 0.3); },
    hurt()      { tone('sawtooth', 300, 90, 0.3, 0.26); noise(0.2, 0.14, 'lowpass', 900, 200); },
    rail()      { noise(0.09, 0.05, 'highpass', 2600, 3400, 3); },
    railStart() { tone('square', 700, 900, 0.08, 0.1); noise(0.14, 0.1, 'highpass', 1800, 3200); },
    wallrun()   { noise(0.12, 0.07, 'bandpass', 900, 1600, 2); },
    drift()     { noise(0.14, 0.1, 'bandpass', 500, 900, 1.4); },
    charge()    { tone('sine', 220, 880, 0.5, 0.12); },
    homing()    { tone('square', 900, 1500, 0.1, 0.14); noise(0.1, 0.08, 'highpass', 2000, 4000); },
    checkpoint(){ [523, 659, 784].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.22, 0.16), i * 90)); },
    finish()    { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => { tone('triangle', f, f, 0.4, 0.2); tone('sine', f * 2, f * 2, 0.3, 0.08); }, i * 110)); },
    rank()      { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone('sine', f, f, 0.5, 0.16), i * 160)); },
    ui()        { tone('sine', 700, 900, 0.07, 0.1); },
    death()     { tone('sawtooth', 440, 60, 0.6, 0.3); noise(0.5, 0.2, 'lowpass', 1200, 100); },
    respawn()   { tone('sine', 200, 800, 0.3, 0.2); },
    wind(v)     {}, // handled by continuous node
  };

  /* ---------------- continuous wind loop ---------------- */
  let windGain = null, windFlt = null;
  function ensureWind() {
    if (windGain || !ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    windFlt = ctx.createBiquadFilter(); windFlt.type = 'bandpass'; windFlt.frequency.value = 500; windFlt.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windFlt); windFlt.connect(windGain); windGain.connect(sfxBus);
    src.start();
  }
  function setWind(speed01, dt) {
    if (!ctx || !windGain) return;
    const target = speed01 * speed01 * 0.34;
    windGain.gain.value += (target - windGain.gain.value) * Math.min(1, dt * 6);
    windFlt.frequency.value += (400 + speed01 * 1900 - windFlt.frequency.value) * Math.min(1, dt * 4);
  }

  /* ---------------- MUSIC: original electro-synth sequencer ----------------
     4-bar loop, 132 BPM, driving bass + arp + kick/snare/hat, lead stabs.
     All synthesized live; pattern arrays are original compositions.        */
  const BPM = 132, SPB = 60 / BPM, STEP = SPB / 4; // 16th notes
  const N = n => 440 * Math.pow(2, (n - 69) / 12); // midi->freq
  // A minor-ish progression: Am F C G (roots at midi 45,41,36,43)
  const CHORDS = [
    { root: 45, ch: [57, 60, 64] },
    { root: 41, ch: [57, 60, 65] },
    { root: 36, ch: [55, 60, 64] },
    { root: 43, ch: [55, 59, 62] },
  ];
  const BASS_PAT  = [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 0, 7, 0, 12, 0]; // semitone offsets, -1=rest
  const LEAD_PAT  = [12, -1, 15, 19, -1, 15, -1, 12, -1, 19, -1, 15, 22, -1, 19, -1];
  const ARP_PAT   = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 2, 0];
  const HAT_PAT   = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0];
  const KICK_PAT  = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  const SNARE_PAT = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  let step = 0, nextTime = 0, timer = null, intensity = 0.5;

  function schedStep(t, s, bar) {
    const chord = CHORDS[bar % CHORDS.length];
    // kick
    if (KICK_PAT[s]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      g.gain.setValueAtTime(0.5 * (0.6 + intensity * 0.4), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(musBus); o.start(t); o.stop(t + 0.2);
    }
    // snare
    if (SNARE_PAT[s]) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 * (0.6 + intensity * 0.4), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(f); f.connect(g); g.connect(musBus); src.start(t); src.stop(t + 0.15);
    }
    // hat
    if (HAT_PAT[s]) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f); f.connect(g); g.connect(musBus); src.start(t); src.stop(t + 0.06);
    }
    // bass
    const bo = BASS_PAT[s];
    if (bo >= 0) {
      const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = N(chord.root + bo - 12);
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(700 + intensity * 900, t); fl.Q.value = 6;
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.9);
      o.connect(fl); fl.connect(g); g.connect(musBus); o.start(t); o.stop(t + STEP);
    }
    // arp (16ths, quiet, shimmering)
    const ai = ARP_PAT[s];
    if (ai >= 0 && intensity > 0.25) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = N(chord.ch[ai % 3] + 12);
      g.gain.setValueAtTime(0.045 * intensity, t); g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.8);
      o.connect(g); g.connect(musBus); o.start(t); o.stop(t + STEP);
    }
    // lead stabs (every other 16th where pattern says)
    const lo = LEAD_PAT[s];
    if (lo >= 0 && intensity > 0.45) {
      const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = N(chord.root + lo + 12);
      fl.type = 'lowpass'; fl.frequency.value = 2600; fl.Q.value = 2;
      g.gain.setValueAtTime(0.075 * intensity, t); g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.6);
      o.connect(fl); fl.connect(g); g.connect(musBus); o.start(t); o.stop(t + STEP * 2);
    }
  }

  function startMusic() {
    if (timer) return;
    nextTime = ctx.currentTime + 0.1; step = 0;
    timer = setInterval(() => {
      if (!musicOn) { nextTime = Math.max(nextTime, ctx.currentTime + 0.05); return; }
      while (nextTime < ctx.currentTime + 0.25) {
        schedStep(nextTime, step % 16, Math.floor(step / 16));
        nextTime += STEP; step++;
      }
    }, 60);
  }

  function setIntensity(v) { intensity = Math.max(0.2, Math.min(1, v)); }
  function duck()   { if (musDuck) musDuck.gain.setTargetAtTime(0.25, ctx.currentTime, 0.08); }
  function unduck() { if (musDuck) musDuck.gain.setTargetAtTime(1.0, ctx.currentTime, 0.2); }

  window.VoltAudio = {
    unlock,
    play(name, arg) { if (!ctx || !sfxOn) return; const f = SFX[name]; if (f) try { f(arg); } catch (e) {} },
    setWind, setIntensity, duck, unduck,
    setMusicOn(v) { musicOn = !!v; },
    setSfxOn(v)   { sfxOn = !!v; },
    get ready() { return !!ctx; },
  };
})();
