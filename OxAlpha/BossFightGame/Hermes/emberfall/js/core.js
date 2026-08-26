'use strict';
/* EMBERFALL run-01 :: bossfight-ox-alpha :: core (constants, utils, fx) */
const CFG = {
  W: 1280, H: 720,
  ARENA: { x: 84, y: 96, w: 1112, h: 548 },
  PLAYER: {
    r: 14, maxHp: 100, speed: 274, accel: 13,
    dashSpeed: 960, dashDur: 0.21, dashCd: 1.05,
    atkCd: [0.30, 0.30, 0.47], atkArc: 100 * Math.PI / 180,
    atkRange: 86, atkDmg: [7, 7, 12], lunge: 175,
  },
  BOSS: { r: 44, hpMax: 1000, thresholds: [0.66, 0.33], touchDmg: 12 },
  MAX_BULLETS: 320, MAX_PARTICLES: 640, MAX_FLOATS: 44, MAX_DECALS: 24,
};
const ACCENT = ['#ff7a2f', '#ff4059', '#b06bff'];
const ACCENT_RGB = [[255, 122, 47], [255, 64, 89], [176, 107, 255]];
const TAU = Math.PI * 2;

const U = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, k, dt) => U.lerp(a, b, 1 - Math.exp(-k * dt)),
  rand: (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
  irand: (a, b) => Math.floor(U.rand(a, b + 1)),
  pick: arr => arr[(Math.random() * arr.length) | 0],
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  angTo: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
  angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; },
  angLerp: (a, b, t) => a + U.angDiff(a, b) * t,
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  fmt(t) { const m = (t / 60) | 0, s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); },
};

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    return this;
  };
}

/* ---------- soft radial glow sprites (cached per color) ---------- */
const Glow = {
  cache: new Map(),
  sprite(color) {
    let s = this.cache.get(color);
    if (s) return s;
    if (this.cache.size > 24) this.cache.clear();
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(0.28, color);
    gr.addColorStop(0.29, 'rgba(0,0,0,0)');
    // build faded copies via globalAlpha trick
    g.fillStyle = color;
    g.beginPath(); g.arc(64, 64, 64, 0, TAU); g.globalAlpha = 0.16; g.fill();
    g.beginPath(); g.arc(64, 64, 34, 0, TAU); g.globalAlpha = 0.30; g.fill();
    g.beginPath(); g.arc(64, 64, 18, 0, TAU); g.globalAlpha = 0.55; g.fill();
    g.globalAlpha = 1;
    this.cache.set(color, c);
    return c;
  },
  draw(ctx, color, x, y, r, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
};

/* ---------- particle / floater / decal / message / shake systems ---------- */
const FX = {
  parts: [], floats: [], decals: [],
  msgs: [], shakeT: 0, trauma: 0, hitstop: 0, timeScale: 1,
  flashA: 0, flashCol: '#fff',
  reset() {
    this.parts.length = 0; this.floats.length = 0; this.decals.length = 0; this.msgs.length = 0;
    this.trauma = 0; this.hitstop = 0; this.timeScale = 1; this.flashA = 0; this.shakeT = 0;
  },
  addShake(n) { this.trauma = Math.min(1, this.trauma + n); },
  stop(t) { this.hitstop = Math.max(this.hitstop, t); },
  flash(col, a) { this.flashCol = col; this.flashA = Math.max(this.flashA, a); },

  spawn(p) {
    if (this.parts.length >= CFG.MAX_PARTICLES) this.parts.shift();
    this.parts.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, dragK: 2.2, grav: 0, life: 0.6, age: 0,
      size: 4, sizeEnd: null, col: '#ffb066', add: true, shape: 'dot', lineW: 2, ringR1: 60,
    }, p));
  },
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.ang !== undefined ? opts.ang + U.rand(-(opts.spread || TAU / 2), opts.spread || TAU / 2) : U.rand(TAU);
      const sp = U.rand(opts.spMin || 40, opts.spMax || 220);
      this.spawn(Object.assign({
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.rand(0.3, opts.lifeMax || 0.8), size: U.rand(2, opts.size || 5),
        col: Array.isArray(opts.col) ? U.pick(opts.col) : (opts.col || '#ffb066'),
      }, opts.extra || {}));
    }
  },
  ring(x, y, col, r1 = 70, life = 0.45, lineW = 3.5) {
    this.spawn({ x, y, shape: 'ring', life, ringR1: r1, col, lineW, add: true });
  },
  float(text, x, y, col = '#ffe2a0', size = 17) {
    if (this.floats.length >= CFG.MAX_FLOATS) this.floats.shift();
    this.floats.push({ text, x: x + U.rand(-8, 8), y, vy: -55, life: 0.85, age: 0, col, size });
  },
  scorch(x, y, r) {
    if (this.decals.length >= CFG.MAX_DECALS) this.decals.shift();
    this.decals.push({ x, y, r, a: 0.5 });
  },
  msg(text, sub = '', dur = 2.1) { this.msgs.push({ text, sub, dur, age: 0 }); },

  update(dt) {
    this.shakeT += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.flashA = Math.max(0, this.flashA - dt * 2.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      const dr = Math.exp(-p.dragK * dt);
      p.vx *= dr; p.vy *= dr; p.vy += p.grav * dt;
      if (p.seek !== undefined) {
        const ddx = p.tx - p.x, ddy = p.ty - p.y, dd = Math.hypot(ddx, ddy) || 1;
        p.vx += ddx / dd * p.seek * dt; p.vy += ddy / dd * p.seek * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.age += dt;
      if (f.age >= f.life) { this.floats.splice(i, 1); continue; }
      f.y += f.vy * dt; f.vy *= Math.exp(-2.5 * dt);
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      this.decals[i].a -= dt * 0.032;
      if (this.decals[i].a <= 0) this.decals.splice(i, 1);
    }
    if (this.msgs[0]) { this.msgs[0].age += dt; if (this.msgs[0].age >= this.msgs[0].dur) this.msgs.shift(); }
  },

  drawParts(ctx) {
    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = p.age / p.life, inv = 1 - k;
      const size = p.sizeEnd !== null ? U.lerp(p.size, p.sizeEnd, k) : p.size * (p.shape === 'dot' ? (0.5 + inv * 0.5) : 1);
      const alpha = inv * inv;
      if (p.shape === 'dot') {
        Glow.draw(ctx, p.col, p.x, p.y, size * 3.2, alpha * 0.85);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, size * 0.38), 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.shape === 'spark') {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp < 4) continue;
        const nx = p.vx / sp, ny = p.vy / sp, len = Math.min(26, sp * 0.09) * (0.4 + inv);
        ctx.strokeStyle = p.col; ctx.globalAlpha = alpha; ctx.lineWidth = p.lineW * inv + 0.4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - nx * len, p.y - ny * len); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.shape === 'ring') {
        const r = U.lerp(size, p.ringR1, 1 - inv * inv);
        ctx.strokeStyle = p.col; ctx.globalAlpha = alpha * 0.9; ctx.lineWidth = p.lineW * inv + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // normal pass: floaters
    for (const f of this.floats) {
      const k = f.age / f.life, a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.55)) / 0.45;
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.font = `bold ${f.size}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,14,.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  },

  drawDecals(ctx) {
    for (const d of this.decals) {
      ctx.globalAlpha = d.a;
      ctx.fillStyle = '#08050c';
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.9, d.r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = d.a * 0.7;
      ctx.strokeStyle = '#38202c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.9, d.r * 0.62, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },

  shakeOffsets() {
    const t2 = this.trauma * this.trauma;
    return {
      ox: Math.sin(this.shakeT * 143) * t2 * 17,
      oy: Math.cos(this.shakeT * 167) * t2 * 13,
      rot: Math.sin(this.shakeT * 91) * t2 * 0.011,
    };
  },
  applyCamera(ctx) {
    const o = this.shakeOffsets();
    ctx.translate(CFG.W / 2 + o.ox, CFG.H / 2 + o.oy);
    ctx.rotate(o.rot);
    ctx.translate(-CFG.W / 2, -CFG.H / 2);
  },

  drawMsgs(ctx) {
    const m = this.msgs[0];
    if (!m) return;
    const k = m.age / m.dur;
    const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = U.clamp(a, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = '10px'; } catch (e) { }
    ctx.font = 'bold 52px Georgia, serif';
    ctx.shadowColor = 'rgba(255,140,40,.75)'; ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffe9bd';
    ctx.fillText(m.text, CFG.W / 2, CFG.H * 0.32);
    ctx.shadowBlur = 0;
    try { ctx.letterSpacing = '6px'; } catch (e) { }
    ctx.font = 'italic 20px Georgia, serif';
    ctx.fillStyle = '#c9a4e8';
    ctx.fillText(m.sub, CFG.W / 2, CFG.H * 0.32 + 46);
    try { ctx.letterSpacing = '0px'; } catch (e) { }
    ctx.restore();
  },

  drawFlash(ctx) {
    if (this.flashA <= 0.003) return;
    ctx.globalAlpha = this.flashA;
    ctx.fillStyle = this.flashCol;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    ctx.globalAlpha = 1;
  },
};
