/* PULSE-9 audio: shared DSP helpers (filters, noise, envelopes, drum synthesis math)
 * Works with any AudioContext-like object (live or OfflineAudioContext).
 */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const db2gain = db => Math.pow(10, db / 20);
  const gain2db = g => 20 * Math.log10(Math.max(1e-6, g));

  /** Deterministic noise buffer factory (per-context, cached by key). */
  function makeNoiseBuffer(ctx, seconds, key, cache) {
    const k = (key || 'n') + '@' + seconds;
    if (cache && cache[k]) return cache[k];
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // xorshift PRNG for determinism across offline/live
    let s = 0x9e3779b9 | 0;
    for (let i = 0; i < len; i++) {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5; s |= 0;
      d[i] = (s / 0x7fffffff) % 1 - 0.5; // -0.5..0.5
    }
    if (cache) cache[k] = buf;
    return buf;
  }

  /** One-pole smoothing coefficient from time constant. */
  function smoothCoef(tcSec, sampleRate) {
    return Math.exp(-1 / (Math.max(1e-4, tcSec) * sampleRate));
  }

  /* ---------------- drum synthesis ----------------
   * Each returns {nodes:[...], out: AudioNode} — caller connects .out and starts/stops.
   * All are pure Web Audio constructions (osc + noise + filters + env).
   */
  function buildKick(ctx, dest, t0, { freq = 120, decay = 0.45, drive = 0, vel = 1 } = {}) {
    const out = ctx.createGain(); out.gain.value = 1;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2.4, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.42), t0 + decay * 0.85);
    const click = ctx.createOscillator(); click.type = 'square'; click.frequency.value = 900;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(vel * 0.35, t0);
    clickG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.012);
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    osc.connect(env); click.connect(clickG).connect(env); env.connect(out);
    let tail = out;
    if (drive > 0.01) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(drive);
      out.connect(ws); tail = ws;
    }
    tail.connect(dest);
    osc.start(t0); osc.stop(t0 + decay + 0.05);
    click.start(t0); click.stop(t0 + 0.03);
    return { out: tail, stopAt: t0 + decay + 0.06 };
  }

  function buildSnare(ctx, dest, t0, { decay = 0.22, tone = 0.5, noise = 0.6, vel = 1, noiseBuf } = {}) {
    const out = ctx.createGain(); out.gain.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    // two tonal parts
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 185 + tone * 60;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 330 + tone * 80;
    const oG = ctx.createGain(); oG.gain.value = 0.5;
    o1.connect(oG); o2.connect(oG); oG.connect(env);
    // noise through bandpass
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass';
    nf.frequency.value = 1800 + tone * 1200; nf.Q.value = 0.8;
    const nG = ctx.createGain(); nG.gain.value = noise;
    n.connect(nf).connect(nG).connect(env);
    env.connect(out); out.connect(dest);
    o1.start(t0); o2.start(t0); n.start(t0);
    o1.stop(t0 + decay + 0.02); o2.stop(t0 + decay + 0.02); n.stop(t0 + decay + 0.02);
    return { out, stopAt: t0 + decay + 0.04 };
  }

  function buildHat(ctx, dest, t0, { open = false, decay = 0.05, hpFreq = 7500, vel = 1, noiseBuf, metallic = 0.5 } = {}) {
    const dur = open ? Math.max(0.18, decay * 6) : decay;
    const out = ctx.createGain(); out.gain.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.7, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    // metallic character: ring-mod the noise with a high square
    const ring = ctx.createGain(); ring.gain.value = 0;
    const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = 6300 + metallic * 2400;
    const sqG = ctx.createGain(); sqG.gain.value = metallic * 0.6;
    sq.connect(sqG).connect(ring.gain);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 9000; bp.Q.value = 0.7;
    const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hpFreq;
    n.connect(bp).connect(hpf).connect(ring).connect(env).connect(out);
    out.connect(dest);
    n.start(t0); sq.start(t0);
    n.stop(t0 + dur + 0.02); sq.stop(t0 + dur + 0.02);
    return { out, stopAt: t0 + dur + 0.04 };
  }

  function buildClap(ctx, dest, t0, { decay = 0.18, vel = 1, noiseBuf } = {}) {
    const out = ctx.createGain(); out.gain.value = 1;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.6;
    bp.connect(out); out.connect(dest);
    const stops = [];
    // 3 quick bursts + tail
    const bursts = [0, 0.012, 0.024];
    for (const b of bursts) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.8, t0 + b);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + b + 0.02);
      n.connect(g).connect(bp);
      n.start(t0 + b); n.stop(t0 + b + 0.03);
      stops.push(n);
    }
    const tail = ctx.createBufferSource(); tail.buffer = noiseBuf; tail.loop = true;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(vel * 0.5, t0 + 0.03);
    tg.gain.exponentialRampToValueAtTime(0.001, t0 + decay + 0.05);
    tail.connect(tg).connect(bp);
    tail.start(t0 + 0.03); tail.stop(t0 + decay + 0.08);
    return { out, stopAt: t0 + decay + 0.1 };
  }

  function buildTom(ctx, dest, t0, { freq = 160, decay = 0.3, vel = 1 } = {}) {
    const out = ctx.createGain(); out.gain.value = 1;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.9, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    osc.connect(env); env.connect(out); out.connect(dest);
    osc.start(t0); osc.stop(t0 + decay + 0.02);
    return { out, stopAt: t0 + decay + 0.04 };
  }

  function buildRim(ctx, dest, t0, { vel = 1 } = {}) {
    const out = ctx.createGain(); out.gain.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.6, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1700;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 4;
    o.connect(bp).connect(env).connect(out); out.connect(dest);
    o.start(t0); o.stop(t0 + 0.07);
    return { out, stopAt: t0 + 0.09 };
  }

  function buildCrash(ctx, dest, t0, { decay = 1.2, vel = 1, noiseBuf } = {}) {
    const out = ctx.createGain(); out.gain.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.5, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 9000; pk.gain.value = 6;
    n.connect(hp).connect(pk).connect(env).connect(out); out.connect(dest);
    n.start(t0); n.stop(t0 + decay + 0.05);
    return { out, stopAt: t0 + decay + 0.07 };
  }

  /* ---------------- waveshaping ---------------- */
  function driveCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = 1 + amount * 40;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  /** Gentle mastering limiter: linear up to knee, then soft-knee compression.
   * Preserves dynamics below the threshold (unlike a tanh curve). */
  function softClipCurve(threshold) {
    const n = 2048;
    const curve = new Float32Array(n);
    const T = threshold == null ? 0.92 : clamp(threshold, 0.5, 1.2);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      let y;
      if (a <= T) y = x;                                    // untouched
      else y = Math.sign(x) * (T + (1 - T) * Math.tanh((a - T) / (1 - T)));
      curve[i] = y;
    }
    return curve;
  }

  /* ---------------- analyser helpers ---------------- */
  function makeMeterData(analyser) {
    const d = new Float32Array(analyser.fftSize);
    return d;
  }

  return {
    clamp, lerp, db2gain, gain2db,
    makeNoiseBuffer, smoothCoef, driveCurve, softClipCurve, makeMeterData,
    buildKick, buildSnare, buildHat, buildClap, buildTom, buildRim, buildCrash,
  };
});
