'use strict';
/* RETRO-HUB-RUN02 audio: tiny WebAudio SFX synth, unlocked on first user gesture */
RH.audio = (function () {
  let ctx = null, master = null, muted = false, noiseBuf = null;

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);
      } else if (ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch (e) { /* audio unavailable */ }
  }

  function tone(type, f0, f1, dur, vol, delay) {
    if (!ctx || muted) return;
    vol = vol == null ? 0.25 : vol; delay = delay || 0;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(f0, 1), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    gn.gain.setValueAtTime(vol, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  function noise(dur, vol, fFrom, fTo, delay) {
    if (!ctx || muted) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5 | 0, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    delay = delay || 0;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.max(fFrom, 1), t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(fTo, 1), t0 + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  const SFX = {
    shoot()   { tone('square', 880, 240, 0.09, 0.10); },
    spread()  { tone('square', 660, 180, 0.08, 0.08); },
    boom()    { noise(0.28, 0.45, 900, 90); tone('triangle', 160, 40, 0.24, 0.28); },
    bigboom() { noise(0.5, 0.6, 1400, 60); tone('sawtooth', 220, 35, 0.4, 0.3); },
    hit()     { noise(0.32, 0.55, 1200, 100); tone('sawtooth', 220, 45, 0.3, 0.3); },
    bounce()  { tone('square', 520, 430, 0.05, 0.13); },
    brick()   { tone('square', 640 + Math.random() * 320, 980, 0.06, 0.16); },
    coin()    { tone('square', 988, 988, 0.07, 0.18); tone('square', 1319, 1319, 0.2, 0.18, 0.07); },
    move()    { tone('square', 340, 340, 0.04, 0.1); },
    select()  { tone('square', 660, 990, 0.09, 0.16); },
    lane()    { noise(0.09, 0.16, 2400, 500); },
    power()   { tone('square', 523, 784, 0.09, 0.18); tone('square', 784, 1047, 0.13, 0.18, 0.09); },
    near()    { tone('square', 1300, 1900, 0.07, 0.11); },
    wave()    { [440, 554, 659].forEach((f, i) => tone('square', f, f, 0.09, 0.15, i * 0.08)); },
    over()    { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.96, 0.17, 0.22, i * 0.16)); },
    unlock()  { [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.12, 0.16, i * 0.09)); },
  };

  function play(name) {
    if (muted || !ctx) return;
    try { if (SFX[name]) SFX[name](); } catch (e) { /* never break gameplay on audio */ }
  }
  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  return { unlock, play, setMuted, get muted() { return muted; } };
})();
