// Procedural WebAudio sound kit — no audio assets, everything synthesized.
window.SB = window.SB || {};
SB.Audio = (function () {
  let ctx = null, master = null, noiseBuf = null;
  const state = { volume: 0.8, enabled: true };
  const MAX_VOICES = 14;
  const voices = []; // {gainNode, until}
  const cooldowns = new Map(); // key -> time (performance.now ms)

  function init() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 7;
      master = ctx.createGain();
      master.gain.value = state.volume;
      master.connect(comp); comp.connect(ctx.destination);
      // shared white-noise buffer
      const len = Math.floor(ctx.sampleRate * 1.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return !!ctx;
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  function ok() {
    if (!state.enabled) return false;
    if (!init()) return false;
    if (ctx.state === 'suspended') { resume(); }
    if (ctx.state !== 'running') return false;
    return true;
  }

  // voice limiting: steal the quietest/oldest when saturated
  function claim(dur) {
    const now = performance.now();
    while (voices.length && voices[0].until < now) voices.shift();
    if (voices.length >= MAX_VOICES) {
      let idx = 0;
      for (let i = 1; i < voices.length; i++) if (voices[i].until <= voices[idx].until) idx = i;
      try { voices[idx].gainNode.gain.cancelScheduledValues(0); voices[idx].gainNode.gain.value = 0; } catch (e) {}
      voices.splice(idx, 1);
    }
    const g = ctx.createGain();
    g.connect(master);
    const v = { gainNode: g, until: now + dur * 1000 + 60 };
    voices.push(v);
    return g;
  }

  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 0.85 + Math.random() * 0.3; return s; }

  function cooldown(key, ms) {
    const t = performance.now();
    const last = cooldowns.get(key) || 0;
    if (t - last < ms) return false;
    cooldowns.set(key, t);
    if (cooldowns.size > 400) { // prune
      for (const [k, v] of cooldowns) if (t - v > 2000) cooldowns.delete(k);
    }
    return true;
  }

  /* ---------- one-shot sounds ---------- */

  // generic impact thud (wood / stone / general)
  function thud(intensity, tone) {
    if (!ok()) return;
    intensity = Math.min(1, Math.max(0.05, intensity));
    const t = ctx.currentTime;
    const dur = 0.09 + intensity * 0.12;
    const g = claim(dur);
    const src = noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = (tone || 420) * (0.6 + intensity * 0.9);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9 * intensity, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(env); env.connect(g);
    src.start(t); src.stop(t + dur + 0.02);
    // low knock body
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime((tone || 300) * 0.55 + 40, t);
    o.frequency.exponentialRampToValueAtTime(60, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5 * intensity, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.1);
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + dur * 1.2);
  }

  // metallic clang (barrels, steel)
  function metal(intensity, basePitch) {
    if (!ok()) return;
    intensity = Math.min(1, Math.max(0.08, intensity));
    const t = ctx.currentTime;
    const dur = 0.25 + intensity * 0.5;
    const g = claim(dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    bp.frequency.value = basePitch || (520 + Math.random() * 260);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.65 * intensity, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const src = noiseSrc(); src.playbackRate.value = 1.4;
    src.connect(bp); bp.connect(env); env.connect(g);
    src.start(t); src.stop(t + dur);
    [1, 1.51, 2.26].forEach((mul, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = (basePitch || 480) * mul * (0.98 + Math.random() * 0.04);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.28 * intensity / (i + 1), t);
      og.gain.exponentialRampToValueAtTime(0.001, t + dur * (1 - i * 0.22));
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur);
    });
  }

  // rubber boing
  function boing(intensity) {
    if (!ok()) return;
    intensity = Math.min(1, Math.max(0.15, intensity));
    const t = ctx.currentTime;
    const dur = 0.16;
    const g = claim(dur);
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 260 + Math.random() * 120;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5 * intensity, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // spawn swish
  function swish() {
    if (!ok()) return;
    const t = ctx.currentTime, dur = 0.18;
    const g = claim(dur);
    const src = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(env); env.connect(g);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // delete poof
  function poof() {
    if (!ok()) return;
    const t = ctx.currentTime, dur = 0.22;
    const g = claim(dur);
    const src = noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.4, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(env); env.connect(g);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // impulse punch
  function pop() {
    if (!ok()) return;
    const t = ctx.currentTime, dur = 0.12;
    const g = claim(dur);
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(70, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    o.connect(lp); lp.connect(og); og.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // explosion: layered boom
  function boom(distFactor) {
    if (!ok()) return;
    const vol = Math.min(1, Math.max(0.25, distFactor == null ? 1 : distFactor));
    const t = ctx.currentTime;
    // body
    const g = claim(1.1);
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(34, t + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(1.0 * vol, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    sub.connect(sg); sg.connect(g);
    sub.start(t); sub.stop(t + 0.8);
    // crack + rumble
    const src = noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9 * vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.05);
    src.connect(lp); lp.connect(env); env.connect(g);
    src.start(t); src.stop(t + 1.1);
  }

  // fuse beep
  function beep(high) {
    if (!ok()) return;
    const t = ctx.currentTime, dur = 0.07;
    const g = claim(dur);
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.value = high ? 1500 : 1100;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.16, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + dur);
  }

  // glassy shatter for frozen objects
  function shatter() {
    if (!ok()) return;
    const t = ctx.currentTime, dur = 0.4;
    const g = claim(dur);
    const src = noiseSrc(); src.playbackRate.value = 1.8;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp); hp.connect(env); env.connect(g);
    src.start(t); src.stop(t + dur);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = 1400 + Math.random() * 1800;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.1, t + i * 0.03);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + i * 0.05);
      o.connect(og); og.connect(g);
      o.start(t + i * 0.03); o.stop(t + 0.4);
    }
  }

  // material-keyed collision entry point (called from entity collide handlers)
  function collide(soundType, relVel, keyA, keyB) {
    const v = Math.abs(relVel);
    if (v < 0.9) return;
    const inten = Math.min(1, (v - 0.8) / 11);
    const key = keyA < keyB ? keyA + '|' + keyB : keyB + '|' + keyA;
    if (!cooldown(key, 95)) return;
    switch (soundType) {
      case 'metal': metal(inten, null); break;
      case 'rubber': boing(inten); break;
      case 'stone': thud(inten, 240); break;
      case 'cloth': thud(inten * 0.6, 190); break;
      default: thud(inten, 380); break; // wood & friends
    }
  }

  function setVolume(v) { state.volume = v; if (master) master.gain.value = v; }
  function setEnabled(b) { state.enabled = b; }

  return { init, resume, ok, collide, thud, metal, boing, swish, poof, pop, boom, beep, shatter, setVolume, setEnabled, state };
})();
