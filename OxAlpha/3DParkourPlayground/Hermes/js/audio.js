/* SKYLINE DASH — WebAudio synth SFX (no assets, gesture-gated) */
window.PKAudio = (function () {
  let ctx = null, master = null, noiseBuf = null;
  let muted = localStorage.getItem('skyline_muted') === '1';
  // loops
  let windSrc = null, windGain = null, windFilt = null;
  let slideSrc = null, slideGain = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -16; master.knee.value = 22; master.ratio.value = 8;
    const g = ctx.createGain();
    g.gain.value = muted ? 0 : 0.85;
    master.connect(g); g.connect(ctx.destination);
    master._post = g;
    // shared noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startLoops();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function noise(dur, vol, type, freq, q, sweepTo) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain();
    const t = now();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, vol, type, glideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(); o.type = type || 'sine';
    const g = ctx.createGain();
    const t = now();
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function startLoops() {
    // wind — gain/filter driven by speed
    windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuf; windSrc.loop = true;
    windFilt = ctx.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = 400; windFilt.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windFilt); windFilt.connect(windGain); windGain.connect(master);
    windSrc.start();
    // slide scrape
    slideSrc = ctx.createBufferSource(); slideSrc.buffer = noiseBuf; slideSrc.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 900;
    slideGain = ctx.createGain(); slideGain.gain.value = 0;
    slideSrc.connect(sf); sf.connect(slideGain); slideGain.connect(master);
    slideSrc.start();
  }

  const api = {
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('skyline_muted', muted ? '1' : '0');
      if (master) master._post.gain.value = muted ? 0 : 0.85;
      return muted;
    },
    init,
    update(dt, speed, sliding) {
      if (!ctx) return;
      if (!Number.isFinite(speed)) speed = 0;
      const w = Math.min(Math.max((speed - 7) / 18, 0), 1);
      windGain.gain.setTargetAtTime(w * w * 0.34, now(), 0.12);
      windFilt.frequency.setTargetAtTime(300 + w * 900, now(), 0.15);
      slideGain.gain.setTargetAtTime(sliding ? 0.22 : 0, now(), 0.05);
    },
    step()   { noise(0.07, 0.10, 'bandpass', 700 + Math.random() * 300, 1.4); },
    jump()   { noise(0.16, 0.14, 'highpass', 500); tone(300, 0.14, 0.08, 'sine', 520); },
    walljump(){ tone(340, 0.16, 0.11, 'triangle', 640); noise(0.12, 0.10, 'highpass', 800); },
    dash()   { tone(880, 0.20, 0.16, 'sawtooth', 180); noise(0.24, 0.20, 'bandpass', 1600, 2, 300); },
    land(i)  { const v = Math.min(0.09 + i * 0.012, 0.3); noise(0.13, v, 'lowpass', 380, 0, 120); },
    slideStart(){ noise(0.28, 0.16, 'lowpass', 800, 0, 250); },
    checkpoint(){ tone(523.25, 0.14, 0.14, 'sine'); setTimeout(() => tone(784, 0.26, 0.15, 'sine'), 90); },
    shortcut() { tone(659.25, 0.12, 0.12, 'triangle'); setTimeout(() => tone(987.77, 0.2, 0.12, 'triangle'), 80); },
    finish()  {
      [523.25, 659.25, 784, 1046.5].forEach((f, i) =>
        setTimeout(() => tone(f, 0.32, 0.16, 'triangle'), i * 110));
      setTimeout(() => noise(0.5, 0.12, 'highpass', 3000), 480);
    },
    die()    { tone(220, 0.35, 0.17, 'sawtooth', 60); noise(0.3, 0.16, 'lowpass', 500, 0, 100); },
    ui()     { tone(660, 0.06, 0.07, 'square'); },
    marker: 'SKYDASH-AUD-r01'
  };
  Object.defineProperty(api, 'ready', { get: () => !!ctx });
  return api;
})();
