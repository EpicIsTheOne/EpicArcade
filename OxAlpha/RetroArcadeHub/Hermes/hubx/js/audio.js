/* @oxalpha-retrohub-run02 — audio module */
/* RETRO ARCADE HUB — WebAudio synth SFX (unlocked on first user gesture) */
ARC.audio = (() => {
  let ctx = null, master = null, muted = false;

  function unlock() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);
      } catch (e) { /* no audio */ }
    } else if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  }
  const isMuted = () => muted;

  // schedule one oscillator blip
  function tone({ type = 'square', f = 440, f2 = null, dur = .1, vol = .18, delay = 0, attack = .002 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .05);
  }

  // noise burst through a filter
  function noise({ dur = .2, vol = .2, f = 1200, f2 = null, type = 'lowpass', delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = type;
    flt.frequency.setValueAtTime(f, t0);
    if (f2 !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + .05);
  }

  const S = {
    uiMove()   { tone({ type: 'square', f: 520, f2: 640, dur: .06, vol: .08 }); },
    uiOk()     { tone({ type: 'square', f: 660, dur: .07, vol: .12 }); tone({ type: 'square', f: 990, dur: .09, vol: .12, delay: .07 }); },
    coin()     { tone({ type: 'square', f: 988, dur: .08, vol: .16 }); tone({ type: 'square', f: 1319, dur: .22, vol: .16, delay: .08 }); },
    back()     { tone({ type: 'square', f: 440, f2: 220, dur: .12, vol: .1 }); },
    shoot()    { tone({ type: 'square', f: 880, f2: 320, dur: .08, vol: .06 }); },
    zap()      { tone({ type: 'sawtooth', f: 200, f2: 90, dur: .12, vol: .09 }); },
    hit()      { noise({ dur: .08, vol: .14, f: 2400, f2: 400 }); },
    boom(big)  { noise({ dur: big ? .5 : .28, vol: big ? .3 : .2, f: 900, f2: 80 }); tone({ type: 'triangle', f: 110, f2: 40, dur: big ? .4 : .22, vol: .16 }); },
    bounce(p)  { tone({ type: 'square', f: 300 * p, dur: .05, vol: .11 }); },
    pick()     { tone({ type: 'square', f: 784, dur: .06, vol: .12 }); tone({ type: 'square', f: 1175, dur: .1, vol: .12, delay: .06 }); },
    power()    { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f, dur: .09, vol: .13, delay: i * .06 })); },
    crash()    { noise({ dur: .6, vol: .32, f: 1500, f2: 60 }); tone({ type: 'sawtooth', f: 160, f2: 30, dur: .55, vol: .2 }); },
    skid()     { noise({ dur: .1, vol: .06, f: 3500, f2: 1800, type: 'bandpass' }); },
    levelup()  { [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, dur: .12, vol: .15, delay: i * .09 })); },
    over()     { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f, dur: .22, vol: .17, delay: i * .16 })); },
    nearmiss() { tone({ type: 'sine', f: 1400, f2: 1900, dur: .07, vol: .07 }); },
    unlock()   { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', f, dur: .14, vol: .14, delay: i * .1 })); },
  };

  return { unlock, setMuted, isMuted, sfx: S };
})();
