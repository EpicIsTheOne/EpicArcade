window.Renderer = (function () {
  let canvas, ctx;
  let DPR = 1, W = 0, H = 0, MD = 0, DIAG = 0;
  let engine = null;
  let instances = [];
  let cur = 0, prev = -1, transT = 1;
  const TRANS = 0.9;
  let theme = window.Themes[0];
  let lastCycle = 0;

  const settings = {
    intensity: 1,
    smoothing: 0.82,
    sensitivity: 1,
    trails: true,
    glow: true,
    flashOn: true,
    autoCycle: false,
    cycleSecs: 20
  };

  const freqView = new Float32Array(1024);
  const waveView = new Float32Array(1024);
  const bandsV = { bass: 0, mid: 0, treble: 0, level: 0 };
  const bandsRaw = { bass: 0, mid: 0, treble: 0, level: 0 };
  let pulse = 0, flash = 0;
  let t = 0, lastNow = 0, running = false;
  let bgGrad = null, trailGrad = null, vigGrad = null, gradKey = '';

  function init(cv, eng) {
    canvas = cv;
    ctx = cv.getContext('2d');
    engine = eng;
    instances = window.Modes.map(m => m());
    resize();
    addEventListener('resize', resize);
    lastNow = performance.now();
    running = true;
    requestAnimationFrame(frame);
  }
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    MD = Math.min(W, H); DIAG = Math.sqrt(W * W + H * H);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bgGrad = trailGrad = vigGrad = null;
  }
  function buildGrads() {
    if (bgGrad && gradKey === theme.id) return;
    gradKey = theme.id;
    bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, theme.bgTop);
    bgGrad.addColorStop(1, theme.bgBottom);
    trailGrad = ctx.createLinearGradient(0, 0, 0, H);
    trailGrad.addColorStop(0, U.hexToRgba(theme.bgTop, theme.trail));
    trailGrad.addColorStop(1, U.hexToRgba(theme.bgBottom, theme.trail));
    vigGrad = ctx.createRadialGradient(W / 2, H / 2, MD * 0.35, W / 2, H / 2, DIAG * 0.62);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteStops(vigGrad);
  }
  function vignetteStops(g) {
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
  }
  function setTheme(th) {
    theme = th;
    gradKey = '';
    document.documentElement.style.setProperty('--accent', th.accent);
    document.documentElement.style.setProperty('--accent2', th.accent2);
  }
  function setMode(i, instant) {
    i = ((i % instances.length) + instances.length) % instances.length;
    if (!instant && i === cur && transT >= 1) return;
    prev = cur;
    cur = i;
    transT = instant ? 1 : 0;
    lastCycle = t;
    if (Renderer.onModeChange) Renderer.onModeChange(cur);
  }
  function next() { setMode(cur + 1); }
  function prevMode() { setMode(cur - 1); }

  function fillIdle() {
    for (let i = 0; i < 1024; i++) {
      const x = i / 1024;
      const env = Math.exp(-x * 3.0) * 0.5 + 0.05;
      freqView[i] = U.clamp(env * (0.45 + 0.45 * Math.sin(t * 0.85 + x * 15)) * settings.sensitivity, 0, 1.4);
    }
    for (let i = 0; i < 1024; i++) {
      waveView[i] = (Math.sin(i * 0.043 + t * 1.7) * 0.34 + Math.sin(i * 0.010 - t * 0.6) * 0.22) * (0.55 + 0.35 * Math.sin(t * 0.5));
    }
    bandsV.bass = 0.15 + 0.10 * Math.pow(Math.sin(t * 1.05), 2);
    bandsV.mid = 0.10 + 0.06 * Math.pow(Math.sin(t * 0.77 + 1.3), 2);
    bandsV.treble = 0.05 + 0.045 * Math.pow(Math.sin(t * 1.6 + 2.1), 2);
    bandsV.level = 0.07 + 0.05 * Math.pow(Math.sin(t * 0.9), 2);
    pulse = 0.16 + 0.13 * Math.pow(Math.sin(t * 1.35), 2);
    flash = 0;
  }

  const st = {
    ctx: null,
    w: 0, h: 0, cx: 0, cy: 0, md: 0, t: 0, dt: 0,
    freq: freqView, wave: waveView, bands: bandsV,
    pulse: 0, flash: 0, beatHit: false,
    set: settings, pal: null
  };

  function frame(nowMs) {
    if (!running) return;
    requestAnimationFrame(frame);
    let dt = (nowMs - lastNow) / 1000;
    lastNow = nowMs;
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    t += dt;

    const hasCtx = engine && engine.ctx;
    let beatHit = false;
    if (hasCtx && engine.read()) {
      const f = engine.freq, fl = f.length;
      const sens = settings.sensitivity;
      for (let i = 0; i < 1024; i++) {
        freqView[i] = U.clamp((f[i * 2] + f[i * 2 + 1]) / 510 * sens, 0, 1.5);
      }
      const td = engine.time, tl = td.length;
      for (let i = 0; i < 1024; i++) {
        waveView[i] = U.clamp((td[i * 2] - 128) / 128 * sens, -1.5, 1.5);
      }
      engine.computeBands(bandsRaw);
      const sc = Math.min(1.5, sens);
      bandsV.bass = bandsRaw.bass * sc;
      bandsV.mid = bandsRaw.mid * sc;
      bandsV.treble = bandsRaw.treble * sc;
      bandsV.level = bandsRaw.level * sc;
      if (engine.beat.update(bandsRaw.bass, t, dt)) beatHit = true;
      pulse = engine.beat.pulse;
      flash = engine.beat.flash;
      if (!engine.playing && bandsRaw.level < 0.005) fillIdle();
    } else {
      fillIdle();
    }

    if (settings.autoCycle && engine && engine.playing) {
      if (t - lastCycle > settings.cycleSecs) setMode(cur + 1);
    }
    if (transT < 1) transT = Math.min(1, transT + dt / TRANS);

    drawFrame(dt, beatHit);
  }

  function drawInst(inst, alpha, state) {
    if (alpha <= 0.001) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;
    inst.draw(state);
    ctx.restore();
  }

  function drawFrame(dt, beatHit) {
    buildGrads();
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = settings.trails ? trailGrad : bgGrad;
    ctx.fillRect(0, 0, W, H);
    const pl = pulse * settings.intensity;
    if (pl > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, MD * 0.1, W / 2, H / 2, MD * 0.72);
      g.addColorStop(0, U.palette(theme.colors, 0.15, 0.09 * pl));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    st.ctx = ctx;
    st.w = W; st.h = H; st.cx = W / 2; st.cy = H / 2; st.md = MD;
    st.t = t; st.dt = dt;
    st.pulse = pulse;
    st.flash = settings.flashOn ? flash : 0;
    st.beatHit = beatHit;
    st.pal = (x, a) => U.palette(theme.colors, x, a);
    st.glow = settings.glow;

    if (transT < 1 && prev >= 0 && prev !== cur) {
      const k = U.easeInOut(transT);
      drawInst(instances[prev], 1 - k, st);
      drawInst(instances[cur], k, st);
    } else {
      prev = -1;
      drawInst(instances[cur], 1, st);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const Renderer = {
    init, resize,
    get settings() { return settings; },
    setTheme, setMode, next, prevMode,
    get modeIndex() { return cur; },
    get instanceNames() { return instances.map(i => i.name); },
    get theme() { return theme; },
    onModeChange: null
  };
  window.Renderer = Renderer;
  return Renderer;
})();
