// Party Blitz — canvas setup, letterbox, particles, draw helpers.
(function () {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');

  const R = {
    W: 1280, H: 720,      // virtual resolution
    vw: 0, vh: 0, ox: 0, oy: 0, scale: 1,
    shake: 0, shakeX: 0, shakeY: 0,
    particles: [],
    time: 0,
    COLORS: ['#ff5c7a', '#ffc93c', '#3ddcff', '#8b5cff', '#4ade80', '#ff9f43', '#f472b6', '#60a5fa'],
  };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(innerWidth * dpr);
    cv.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.vw = innerWidth; R.vh = innerHeight;
    R.scale = Math.min(R.vw / R.W, R.vh / R.H);
    R.ox = (R.vw - R.W * R.scale) / 2;
    R.oy = (R.vh - R.H * R.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // screen coords (css px) -> virtual coords
  R.toVirtual = (sx, sy) => ({
    x: (sx - R.ox) / R.scale,
    y: (sy - R.oy) / R.scale,
  });

  R.beginFrame = (dt) => {
    R.time += dt;
    if (R.shake > 0) {
      R.shake = Math.max(0, R.shake - dt * 3.2);
      const s = R.shake * R.shake * 26;
      R.shakeX = (Math.random() * 2 - 1) * s;
      R.shakeY = (Math.random() * 2 - 1) * s;
    } else { R.shakeX = R.shakeY = 0; }

    // background: deep space + drifting blobs
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, R.vw, R.vh);
    drawBgBlobs();

    ctx.save();
    ctx.translate(R.ox + R.shakeX, R.oy + R.shakeY);
    ctx.scale(R.scale, R.scale);

    stepParticles(dt, true);
  };

  R.endFrame = () => {
    ctx.restore();
  };

  let blobs = [];
  for (let i = 0; i < 5; i++) {
    blobs.push({
      x: Math.random(), y: Math.random(), r: 180 + Math.random() * 260,
      c: ['rgba(139,92,255,.07)', 'rgba(61,220,255,.06)', 'rgba(255,92,122,.06)', 'rgba(74,222,128,.05)', 'rgba(255,201,60,.05)'][i],
      sx: (Math.random() * 2 - 1) * .02, sy: (Math.random() * 2 - 1) * .015,
    });
  }
  function drawBgBlobs() {
    for (const b of blobs) {
      b.x += b.sx / 60; b.y += b.sy / 60;
      if (b.x < -.2 || b.x > 1.2) b.sx *= -1;
      if (b.y < -.2 || b.y > 1.2) b.sy *= -1;
      const g = ctx.createRadialGradient(b.x * R.vw, b.y * R.vh, 0, b.x * R.vw, b.y * R.vh, b.r);
      g.addColorStop(0, b.c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, R.vw, R.vh);
    }
  }

  // ---------- particles ----------
  R.burst = (x, y, color, n = 14, spd = 260, life = 0.7, size = 5) => {
    for (let i = 0; i < n; i++) {
      if (R.particles.length > 320) break;
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.35 + Math.random() * 0.75);
      R.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        life: life * (0.6 + Math.random() * 0.7), t: 0,
        c: color, s: size * (0.6 + Math.random() * 0.8),
        g: 420 + Math.random() * 300,
      });
    }
  };
  R.rise = (x, y, color, n = 10) => {
    for (let i = 0; i < n; i++) {
      if (R.particles.length > 320) break;
      R.particles.push({
        x: x + (Math.random() * 30 - 15), y,
        vx: (Math.random() * 2 - 1) * 40, vy: -(80 + Math.random() * 140),
        life: 0.9 + Math.random() * .5, t: 0, c: color, s: 3 + Math.random() * 3, g: -60,
      });
    }
  };
  function stepParticles(dt) {
    for (let i = R.particles.length - 1; i >= 0; i--) {
      const p = R.particles[i];
      p.t += dt;
      if (p.t >= p.life) { R.particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * a + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  R.clearParticles = () => { R.particles.length = 0; };

  // ---------- helpers ----------
  R.roundRect = (x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  R.text = (str, x, y, size, color, align = 'center', weight = 900, glow = 0) => {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  };

  R.playerColor = (i) => R.COLORS[i % R.COLORS.length];

  window.PBR = R;
})();
