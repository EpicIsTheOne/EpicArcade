window.buildDemoTrack = function (engine) {
  const ctx = engine.ensure();
  const sr = ctx.sampleRate;
  const bpm = 118, spb = 60 / bpm, barLen = spb * 4, bars = 16;
  const dur = bars * barLen;
  const off = new OfflineAudioContext(2, Math.ceil(sr * (dur + 0.6)), sr);

  const master = off.createGain();
  master.gain.value = 0.86;
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.16;
  master.connect(comp); comp.connect(off.destination);

  const dly = off.createDelay(1);
  dly.delayTime.value = spb * 0.75;
  const fb = off.createGain(); fb.gain.value = 0.34;
  const wet = off.createGain(); wet.gain.value = 0.20;
  dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(master);

  const nb = off.createBuffer(1, sr, sr);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const CH = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  const ROOT = [110, 87.31, 130.81, 98];

  function noiseSrc() {
    const s = off.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    return s;
  }
  function kick(t, v) {
    const o = off.createOscillator(), g = off.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0.95 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.32);
  }
  function snare(t, v) {
    const s = noiseSrc(), bp = off.createBiquadFilter(), g = off.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(t); s.stop(t + 0.2);
    const o = off.createOscillator(), g2 = off.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    g2.gain.setValueAtTime(0.28 * v, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.11);
  }
  function hat(t, v, open) {
    const s = noiseSrc(), hp = off.createBiquadFilter(), g = off.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7800;
    g.gain.setValueAtTime((open ? 0.20 : 0.14) * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.26 : 0.05));
    s.connect(hp); hp.connect(g); g.connect(master);
    s.start(t); s.stop(t + (open ? 0.28 : 0.06));
  }
  function bass(f, t, len, v) {
    const o = off.createOscillator(), lp = off.createBiquadFilter(), g = off.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.Q.value = 7;
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.exponentialRampToValueAtTime(760, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(170, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.30 * v, t + 0.01);
    g.gain.setValueAtTime(0.30 * v, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.02);
  }
  function pad(fs, t, len, v) {
    const lp = off.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(650, t);
    lp.frequency.linearRampToValueAtTime(1650, t + len * 0.5);
    lp.frequency.linearRampToValueAtTime(650, t + len);
    const pg = off.createGain(); pg.gain.value = 1;
    const sd = off.createGain(); sd.gain.value = 0.15;
    lp.connect(pg); pg.connect(master);
    pg.connect(sd); sd.connect(dly);
    fs.forEach(f => {
      [-7, 7].forEach(dt => {
        const o = off.createOscillator(), g = off.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.042 * v, t + len * 0.35);
        g.gain.setValueAtTime(0.042 * v, t + len * 0.75);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(lp);
        o.start(t); o.stop(t + len + 0.05);
      });
    });
  }
  function lead(f, t, len, v) {
    const g = off.createGain(), lp = off.createBiquadFilter(), send = off.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    send.gain.value = 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * v, t + 0.008);
    g.gain.setValueAtTime(0.16 * v, t + Math.max(0.02, len * 0.7));
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    [['triangle', 1], ['square', 0.38]].forEach(pr => {
      const o = off.createOscillator(), ga = off.createGain();
      o.type = pr[0]; o.frequency.value = f; ga.gain.value = pr[1];
      o.connect(ga); ga.connect(lp);
      o.start(t); o.stop(t + len + 0.02);
    });
    lp.connect(g); g.connect(master); g.connect(send); send.connect(dly);
  }

  for (let b = 0; b < bars; b++) {
    const ci = b % 4, ch = CH[ci], t0 = b * barLen;
    pad(ch, t0, barLen * 1.02, b < 4 ? 0.7 : (b < 8 ? 0.85 : 1));
    if (b >= 2) {
      for (let e = 0; e < 8; e++) {
        const oct = (e === 3 || e === 7) ? 2 : 1;
        bass(ROOT[ci] * oct, t0 + e * spb / 2, spb * 0.46, b < 8 ? 0.8 : 1);
      }
    }
    if (b >= 4) {
      for (let q = 0; q < 4; q++) kick(t0 + q * spb, q === 0 ? 1 : 0.92);
      for (let e = 0; e < 8; e++) hat(t0 + e * spb / 2, e % 2 ? 0.9 : 0.55, false);
      hat(t0 + 3.5 * spb, 1, true);
    }
    if (b >= 8) {
      snare(t0 + spb, 1);
      snare(t0 + 3 * spb, 1);
    }
  }
  const MEL = [
    [659.26, 0, .5], [783.99, .5, .5], [659.26, 1, .9], [587.33, 2, .5], [523.25, 2.5, .5], [587.33, 3, .9],
    [659.26, 0, .5], [880, .5, .5], [783.99, 1, .7], [659.26, 1.75, .25], [587.33, 2, .9], [523.25, 3, .5], [587.33, 3.5, .5]
  ];
  for (let b = 8; b < bars; b += 2) {
    const t0 = b * barLen;
    MEL.forEach(m => lead(m[0], t0 + m[1] * spb, m[2] * spb * 0.92, 1));
  }
  for (let q = 0; q < 4; q++) kick(bars * barLen - spb + q * spb / 4, 0.85 - q * 0.12);
  master.gain.setValueAtTime(0.86, dur - 0.35);
  master.gain.linearRampToValueAtTime(0.0001, dur);

  return off.startRendering();
};
