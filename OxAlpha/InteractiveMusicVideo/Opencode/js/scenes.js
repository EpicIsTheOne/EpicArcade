/* NEON DRIFTER — scene engine
   Seven scenes crossfaded by section weights. Canvas2D, additive glows via
   pre-rendered sprites (no shadowBlur), pooled particles, seeded RNG. */
window.Scenes = (function () {
"use strict";

// ---------- seeded rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- glow sprite ----------
function makeGlow(r, g, b) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.22, `rgba(${r},${g},${b},0.55)`);
  gr.addColorStop(0.55, `rgba(${r},${g},${b},0.16)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return c;
}
const GLOW = {
  pink: makeGlow(255, 41, 117),
  cyan: makeGlow(0, 220, 255),
  gold: makeGlow(255, 179, 107),
  white: makeGlow(235, 240, 255),
  violet: makeGlow(150, 80, 255),
  red: makeGlow(255, 60, 60),
};
function glow(ctx, spr, x, y, size, alpha) {
  if (alpha <= 0.004 || size <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
}

// ---------- palettes ----------
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const RAW_PAL = {
  dawn:        { skyT: "#070a20", skyB: "#331b3f", accA: "#ffb36b", accB: "#ff5e8a", hor: "#ff9a5c" },
  ignition:    { skyT: "#0b0724", skyB: "#47163f", accA: "#ff2975", accB: "#00c8ff", hor: "#ff4d6d" },
  drive:       { skyT: "#0d0630", skyB: "#5c1670", accA: "#ff2975", accB: "#00eaff", hor: "#ff2975" },
  starlight:   { skyT: "#030512", skyB: "#131a4a", accA: "#8f6bff", accB: "#59d8ff", hor: "#33418f" },
  convergence: { skyT: "#0a0526", skyB: "#5a1470", accA: "#00ffd0", accB: "#ff2975", hor: "#ff7a4d" },
  hyperdrive:  { skyT: "#05010f", skyB: "#40094f", accA: "#ff2975", accB: "#00eaff", hor: "#ffb36b" },
  afterglow:   { skyT: "#080618", skyB: "#3d1430", accA: "#ff8a4d", accB: "#ff4d88", hor: "#ff6a3d" },
};
const PAL_KEYS = ["skyT", "skyB", "accA", "accB", "hor"];
const PAL_RGB = {};
for (const k in RAW_PAL) {
  PAL_RGB[k] = {};
  for (const kk of PAL_KEYS) PAL_RGB[k][kk] = hexToRgb(RAW_PAL[k][kk]);
}

// ---------- persistent state ----------
const st = {
  scroll: {},           // per-scene scroll accumulators
  rot: {},              // per-scene rotations
  stars: [], dust: [], sparks: [], ripples: [], shooters: [],
  ringsZ: [], posts: [],
  mtns: null,
  grain: null,
  W: 0, H: 0,
  seedRng: null,
};

function buildStars(W, H) {
  const rng = mulberry32(1337);
  st.stars = [];
  const n = Math.min(300, Math.round((W * H) / 5200));
  for (let i = 0; i < n; i++) {
    st.stars.push({
      x: rng() * W, y: rng() * H * 0.82, r: 0.5 + rng() * 1.6,
      tw: 0.6 + rng() * 2.4, ph: rng() * 6.283, hue: rng(),
    });
  }
}
function buildDust(W, H) {
  const rng = mulberry32(777);
  st.dust = [];
  const n = Math.min(120, Math.round((W * H) / 16000));
  for (let i = 0; i < n; i++) {
    st.dust.push({
      x: rng() * W, y: rng() * H, vx: (rng() - 0.5) * 10, vy: -(3 + rng() * 14),
      r: 0.6 + rng() * 1.8, ph: rng() * 6.283,
    });
  }
}
function buildMountains(W, H) {
  const rng = mulberry32(4242);
  const mk = (segs, jag, base) => {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      pts.push(base + Math.sin(i * 0.9 + rng() * 6) * jag * 0.4 + rng() * jag);
    }
    return pts;
  };
  st.mtns = { far: mk(26, 46, 0), near: mk(18, 78, 0) };
}
function buildGrain() {
  const c = document.createElement("canvas");
  c.width = 720; c.height = 404;
  const x = c.getContext("2d");
  const img = x.createImageData(720, 404);
  const rng = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + rng() * 74;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  st.grain = c;
}
function buildRings() {
  st.ringsZ = [];
  for (let i = 0; i < 26; i++) st.ringsZ.push(i + 1);
  st.posts = [];
  for (let i = 0; i < 10; i++) st.posts.push(i * 9 + 4);
}
function reset(W, H) {
  st.W = W; st.H = H;
  buildStars(W, H);
  buildDust(W, H);
  buildMountains(W, H);
  buildGrain();
  buildRings();
  st.vg = null;
  st.sparks.length = 0;
  st.ripples.length = 0;
  st.shooters.length = 0;
  st.scroll = {}; st.rot = {};
}

// ---------- spark / ripple spawners ----------
function spawnSparks(x, y, n, colSpr, spd, sizeMul) {
  for (let i = 0; i < n; i++) {
    if (st.sparks.length > 340) break;
    const a = Math.random() * 6.283;
    const v = spd * (0.35 + Math.random() * 0.85);
    st.sparks.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.15,
      life: 0, max: 0.6 + Math.random() * 0.9, spr: colSpr,
      sz: (2.2 + Math.random() * 4.5) * (sizeMul || 1), drag: 0.985,
    });
  }
}
function spawnRipple(x, y, big) {
  st.ripples.push({ x, y, r: 6, vr: big ? 1500 : 900, life: 0, max: big ? 1.1 : 0.75 });
}

// ---------- projection helper (ground grid) ----------
function gridDraw(ctx, S, opts) {
  // opts: {speed, density, bright, horizonY, accASpr, accBSpr, roadHalf}
  const { W, H } = st;
  const hor = opts.horizonY;
  const sp = st.scroll.grid || 0;
  const K = (H - hor) * 1.05;          // depth scale
  const cx = W / 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // vertical lines
  const vcount = 24;
  for (let i = -vcount; i <= vcount; i++) {
    const xw = i * 240;
    const x0 = cx + xw * (K * 0.012);
    const x1 = cx + xw;
    const g = ctx.createLinearGradient(cx, hor, x1, H);
    g.addColorStop(0, `rgba(255,255,255,0)`);
    g.addColorStop(0.12, opts.lineColNear.replace("A", String(opts.bright * 0.16)));
    g.addColorStop(1, opts.lineColNear.replace("A", String(Math.min(1, opts.bright))));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, hor);
    ctx.lineTo(x1 + S.parX * 30, H + 2);
    ctx.stroke();
  }
  // horizontal lines scrolling
  const spacing = 1.9;
  const rows = 26;
  for (let j = 0; j < rows; j++) {
    let z = ((j + sp) % rows + rows) % rows;
    const zz = z + 0.12;
    const y = hor + K / zz * 0.62;
    if (y > H + 4) continue;
    const fade = Math.min(1, (y - hor) / (H - hor) * 1.6) * opts.bright;
    ctx.strokeStyle = opts.lineColFar.replace("A", String(fade * 0.5));
    ctx.lineWidth = z < 1.4 ? 2 : 1.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  st.scroll.grid = sp + opts.speed * S.dt;
}

// ---------- mountains ----------
function mountains(ctx, S, horY, layer, amp, colFill, par) {
  const pts = st.mtns[layer];
  const span = st.W * 2.4;
  const segW = span / (pts.length - 1);
  const ox = -((((S.camX * par) % segW) + segW) % segW);
  ctx.save();
  ctx.beginPath();
  for (let i = -1; i <= pts.length; i++) {
    const pi = ((i % pts.length) + pts.length) % pts.length;
    const x = ox + i * segW;
    const y = horY - pts[pi] * amp;
    if (i === -1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(ox + (pts.length + 1) * segW, horY + 2);
  ctx.closePath();
  ctx.fillStyle = colFill;
  ctx.fill();
  ctx.restore();
}

// ---------- sun ----------
function sun(ctx, S, x, y, R, pal, slitPhase, bright) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, GLOW.gold, x, y, R * 5.2, 0.34 * bright);
  glow(ctx, GLOW.pink, x, y, R * 3.4, 0.30 * bright);
  const grad = ctx.createLinearGradient(0, y - R, 0, y + R);
  grad.addColorStop(0, "#fff4d6");
  grad.addColorStop(0.42, pal.accA.css);
  grad.addColorStop(1, "#ff5e3a");
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 6.283);
  ctx.fillStyle = grad;
  ctx.globalAlpha = Math.min(1, bright);
  ctx.fill();
  ctx.restore();
  // scanline slits, clipped to the disc so nothing else is erased
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R + 0.5, 0, 6.283);
  ctx.clip();
  ctx.globalAlpha = 0.92 * Math.min(1, bright);
  ctx.fillStyle = pal.slitCss;
  let yy = y - R * 0.05;
  let gap = R * 0.045;
  let i = 0;
  while (yy < y + R) {
    const th = gap * (0.55 + 0.45 * Math.sin(i * 1.7 + slitPhase));
    ctx.fillRect(x - R - 2, yy, R * 2 + 4, th);
    yy += th + R * 0.055;
    gap *= 1.24;
    i++;
  }
  ctx.restore();
}

// ---------- tunnel ----------
function tunnel(ctx, S, opts) {
  const { W, H } = st;
  const cx = W / 2 + S.camX * 40;
  const cy = H * 0.48 + S.camY * 40;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sp = st.scroll.tun || 0;
  const spd = opts.speed * S.dt;
  st.scroll.tun = (sp + spd) % 1;
  const rows = st.ringsZ.length;
  for (let i = 0; i < rows; i++) {
    let z = (st.ringsZ[i] - sp) % rows;
    if (z < 0) z += rows;
    const zz = z + 0.18;
    const persp = 0.55 / zz;
    const R = Math.min(W, H) * persp * 1.65;
    if (R < 3) continue;
    const a = Math.min(0.85, persp * 2.4) * opts.bright;
    const pulse = 1 + S.beatPulse * 0.09;
    ctx.strokeStyle = opts.colA.replace("A", String(a * 0.8));
    ctx.lineWidth = Math.min(5, 1 + persp * 7);
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const ang = (k / 6) * 6.283 + (st.rot.tun || 0);
      const rr = R * pulse * (k % 2 === 0 ? 1 : 0.93);
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr * 0.92;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = opts.colB.replace("A", String(a * 0.4));
    ctx.lineWidth = 1;
    ctx.stroke();
    if (opts.spokes && z < 3) {
      ctx.strokeStyle = opts.colA.replace("A", String(a * 0.22));
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * 6.283 + (st.rot.tun || 0);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * 0.92);
        ctx.stroke();
      }
    }
  }
  st.rot.tun = (st.rot.tun || 0) + opts.spin * S.dt;
  ctx.restore();
}

// ---------- starfield ----------
function starfield(ctx, S, opts) {
  const { W, H } = st;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of st.stars) {
    const tw = 0.55 + 0.45 * Math.sin(S.mt * s.tw + s.ph);
    const px = s.x + S.camX * (14 + s.r * 8);
    const py = s.y + S.camY * (10 + s.r * 6);
    if (px < -4 || px > W + 4) continue;
    ctx.fillStyle = s.hue > 0.82 ? `rgba(160,190,255,${opts.a * tw})`
      : `rgba(235,240,255,${opts.a * tw})`;
    ctx.fillRect(px, py, s.r, s.r);
    if (s.r > 1.7 && opts.glow) glow(ctx, GLOW.white, px, py, s.r * 7, opts.a * tw * 0.4);
  }
  ctx.restore();
}
function nebula(ctx, S, opts) {
  const { W, H } = st;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const blobs = [
    [0.24, 0.30, 0.42, GLOW.violet, 0.16],
    [0.72, 0.22, 0.36, GLOW.cyan, 0.11],
    [0.52, 0.52, 0.5, GLOW.pink, 0.08],
    [0.86, 0.58, 0.3, GLOW.violet, 0.10],
  ];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const dx = Math.sin(S.mt * 0.05 + i * 2.1) * 30;
    const dy = Math.cos(S.mt * 0.04 + i * 1.3) * 20;
    glow(ctx, b[3], b[0] * W + dx, b[1] * H + dy,
      b[2] * Math.max(W, H) * (1 + 0.04 * Math.sin(S.mt * 0.11 + i)), b[4] * opts.a);
  }
  ctx.restore();
}

// ============================ SCENES =========================================

function scDawn(ctx, S, w) {
  const { W, H } = st;
  const hor = H * 0.66;
  sun(ctx, S, W * 0.5 + S.camX * 26, hor - H * 0.055 - S.energy * 8, H * 0.13,
      S.pal, S.mt * 0.4, w * 0.95);
  // haze bands
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i++) {
    const y = hor - i * H * 0.02;
    ctx.fillStyle = `rgba(255,154,92,${0.028 * w * (1 - i / 8)})`;
    ctx.fillRect(0, y - 1.2, W, 2.4);
  }
  ctx.restore();
  mountains(ctx, S, hor, "far", 0.9, "rgba(10,8,26,0.85)", 0.4);
  gridDraw(ctx, S, {
    speed: 0.16, horizonY: hor, bright: 0.16 * w,
    lineColNear: "rgba(255,140,100,A)", lineColFar: "rgba(255,120,160,A)",
  });
  dust(ctx, S, w * 0.8);
}

function scIgnition(ctx, S, w) {
  const { W, H } = st;
  const hor = H * 0.64;
  sun(ctx, S, W * 0.5 + S.camX * 26, hor - H * 0.10, H * 0.155, S.pal, S.mt * 0.5, w);
  mountains(ctx, S, hor, "far", 1.0, "rgba(14,6,30,0.9)", 0.5);
  mountains(ctx, S, hor + 4, "near", 0.62, "rgba(6,3,16,0.96)", 0.9);
  gridDraw(ctx, S, {
    speed: 0.55 + S.energy * 0.5, horizonY: hor,
    bright: (0.34 + S.beatPulse * 0.22) * w,
    lineColNear: "rgba(255,41,117,A)", lineColFar: "rgba(0,200,255,A)",
  });
  speedLines(ctx, S, w * 0.4, hor);
  dust(ctx, S, w * 0.6);
}

function scDrive(ctx, S, w) {
  const { W, H } = st;
  const hor = H * 0.62;
  const sunX = W * 0.5 + S.camX * 30;
  sun(ctx, S, sunX, hor - H * 0.135, H * 0.185, S.pal, S.mt * 0.6, w);
  // city strip silhouette
  ctx.save();
  ctx.globalAlpha = w;
  ctx.fillStyle = "rgba(8,4,20,0.94)";
  const rngSeed = 5150;
  let bx = -((S.mt * 4 + S.camX * 12) % 90);
  for (let i = 0; bx < W; i++) {
    const rh = 14 + ((Math.sin(i * 12.9898 + rngSeed) * 43758.55) % 1 + 1) % 1 * 44;
    const bw = 26 + (((Math.sin(i * 78.233 + rngSeed) * 12345.67) % 1 + 1) % 1) * 40;
    ctx.fillRect(bx, hor - rh, bw, rh);
    ctx.fillStyle = "rgba(0,225,255,0.5)";
    ctx.fillRect(bx, hor - rh - 1.4, bw, 1.4);
    ctx.fillStyle = "rgba(8,4,20,0.94)";
    bx += bw + 8 + (i % 3) * 9;
  }
  ctx.restore();
  mountains(ctx, S, hor, "far", 1.05, "rgba(16,5,36,0.92)", 0.55);
  // road posts
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const rows = st.posts.length;
  const spg = st.scroll.posts || 0;
  st.scroll.posts = (spg + (7 + S.energy * 5) * S.dt) % 1;
  for (let i = 0; i < rows; i++) {
    let z = (st.posts[i] - spg * 9) % 81;
    if (z < 0) z += 81;
    const zz = z + 0.4;
    const y = hor + ((H - hor) * 1.05) / zz * 0.62;
    const spread = (W * 0.09) / zz * 3.4 + W * 0.16;
    const hh = Math.min(H * 0.3, 900 / zz);
    const a = Math.min(0.9, 1.6 / zz) * w;
    for (const side of [-1, 1]) {
      const px = W / 2 + side * spread;
      ctx.strokeStyle = `rgba(${side < 0 ? "0,220,255" : "255,41,117"},${a})`;
      ctx.lineWidth = Math.min(4, 26 / zz);
      ctx.beginPath();
      ctx.moveTo(px, y - hh);
      ctx.lineTo(px, y);
      ctx.stroke();
      glow(ctx, side < 0 ? GLOW.cyan : GLOW.pink, px, y - hh, 60 / zz + 8, a * 0.8);
    }
  }
  ctx.restore();
  gridDraw(ctx, S, {
    speed: 1.5 + S.energy * 1.4, horizonY: hor,
    bright: (0.5 + S.beatPulse * 0.3) * w,
    lineColNear: "rgba(255,41,117,A)", lineColFar: "rgba(0,225,255,A)",
  });
  speedLines(ctx, S, w * (0.25 + S.energy * 0.75), hor);
}

function scStarlight(ctx, S, w) {
  const { W, H } = st;
  nebula(ctx, S, { a: w });
  starfield(ctx, S, { a: 0.85 * w, glow: true });
  // moon
  const mx = W * 0.76 + S.camX * 18, my = H * 0.24 + S.camY * 12;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, GLOW.cyan, mx, my, H * 0.5, 0.16 * w);
  ctx.globalAlpha = w;
  ctx.beginPath();
  ctx.arc(mx, my, H * 0.055, 0, 6.283);
  ctx.fillStyle = "#e8ecff";
  ctx.fill();
  ctx.restore();
  // floating wireframes
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const shapes = [[0.2, 0.38, 3], [0.36, 0.68, 6], [0.64, 0.30, 4]];
  shapes.forEach((sh, i) => {
    const cx = sh[0] * W + Math.sin(S.mt * 0.21 + i * 2) * 24 + S.camX * 20;
    const cy = sh[1] * H + Math.cos(S.mt * 0.17 + i * 1.6) * 18 + S.camY * 14;
    const R = H * (0.035 + i * 0.012);
    const rot = S.mt * (0.12 + i * 0.05) * (i % 2 ? -1 : 1);
    ctx.strokeStyle = `rgba(143,107,255,${0.5 * w})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let k = 0; k <= sh[2]; k++) {
      const a = (k / sh[2]) * 6.283 + rot;
      const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
  ctx.restore();
  // faint reflective sea hint at very bottom
  ctx.save();
  ctx.globalAlpha = 0.5 * w;
  const grd = ctx.createLinearGradient(0, H * 0.86, 0, H);
  grd.addColorStop(0, "rgba(20,28,80,0)");
  grd.addColorStop(1, "rgba(30,40,110,0.55)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, H * 0.86, W, H * 0.14);
  ctx.restore();
  shooters(ctx, S, w);
  dust(ctx, S, w * 0.5, true);
}

function scConvergence(ctx, S, w) {
  const { W, H } = st;
  starfield(ctx, S, { a: 0.5 * w, glow: false });
  tunnel(ctx, S, {
    speed: 2.2 + S.energy * 3.4, bright: (0.4 + S.energy * 0.5) * w,
    colA: "rgba(0,255,208,A)", colB: "rgba(255,41,117,A)",
    spokes: false, spin: 0.25,
  });
  speedLines(ctx, S, w * (0.3 + S.energy * 0.8), 0);
}

function scHyperdrive(ctx, S, w) {
  tunnel(ctx, S, {
    speed: 4.6 + S.energy * 5.5, bright: (0.62 + S.beatPulse * 0.38) * w,
    colA: "rgba(255,41,117,A)", colB: "rgba(0,234,255,A)",
    spokes: true, spin: 0.55 + S.energy * 0.5,
  });
  kaleido(ctx, S, w);
  speedLines(ctx, S, w * (0.5 + S.energy * 0.9), 0);
  burstOnBeat(ctx, S, w);
}

function scAfterglow(ctx, S, w) {
  const { W, H } = st;
  const hor = H * 0.66;
  const setT = Math.min(1, Math.max(0, (S.secT - 0) / 19));
  sun(ctx, S, W * 0.5 + S.camX * 22, hor + H * 0.02 + setT * H * 0.075, H * 0.15,
      S.pal, S.mt * 0.3, w * (1 - setT * 0.55));
  mountains(ctx, S, hor, "far", 0.95, "rgba(10,5,22,0.92)", 0.5);
  gridDraw(ctx, S, {
    speed: 0.4 * (1 - setT * 0.8), horizonY: hor, bright: 0.3 * w * (1 - setT * 0.6),
    lineColNear: "rgba(255,138,77,A)", lineColFar: "rgba(255,77,136,A)",
  });
  embers(ctx, S, w);
}

// ---------- shared small renderers ----------
function dust(ctx, S, w, calm) {
  const { W, H } = st;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const d of st.dust) {
    d.x += d.vx * S.dt * (calm ? 0.4 : 1);
    d.y += d.vy * S.dt * (calm ? 0.5 : 1);
    if (d.y < -6) { d.y = H + 6; d.x = Math.random() * W; }
    if (d.x < -6) d.x = W + 6; else if (d.x > W + 6) d.x = -6;
    const a = (0.25 + 0.3 * Math.sin(S.mt * 1.7 + d.ph)) * w;
    ctx.fillStyle = `rgba(255,210,170,${Math.max(0, a)})`;
    ctx.fillRect(d.x, d.y, d.r, d.r);
  }
  ctx.restore();
}
function embers(ctx, S, w) {
  const { W, H } = st;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const d of st.dust) {
    d.x += Math.sin(S.mt * 0.8 + d.ph) * 8 * S.dt;
    d.y -= (6 + d.r * 5) * S.dt;
    if (d.y < -6) { d.y = H + 8; d.x = Math.random() * W; }
    const a = (0.3 + 0.3 * Math.sin(S.mt * 2 + d.ph)) * w;
    glow(ctx, GLOW.gold, d.x, d.y, d.r * 9, Math.max(0, a) * 0.7);
    ctx.fillStyle = `rgba(255,180,110,${Math.max(0, a)})`;
    ctx.fillRect(d.x, d.y, d.r, d.r);
  }
  ctx.restore();
}
function speedLines(ctx, S, amt, horY) {
  if (amt < 0.03) return;
  const { W, H } = st;
  const cx = W / 2, cy = (horY || H * 0.48);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = Math.floor(amt * 26);
  for (let i = 0; i < n; i++) {
    const sd = Math.sin(i * 127.1 + Math.floor(S.mt * 2) * 311.7) * 43758.545;
    const ang = (sd % 1 + 1) % 1 * 6.283;
    const r0 = Math.max(W, H) * (0.28 + ((sd * 7) % 1 + 1) % 1 * 0.3);
    const len = (30 + ((sd * 13) % 1 + 1) % 1 * 130) * (0.4 + S.energy);
    const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0 * 0.8;
    const x1 = cx + Math.cos(ang) * (r0 + len), y1 = cy + Math.sin(ang) * (r0 + len) * 0.8;
    ctx.strokeStyle = i % 3 === 0
      ? `rgba(255,41,117,${0.16 * amt})` : `rgba(160,230,255,${0.13 * amt})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
}
function kaleido(ctx, S, w) {
  const { W, H } = st;
  const cx = W / 2, cy = H * 0.48;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const arms = 8;
  const flare = S.kickFlash * w;
  if (flare > 0.02) {
    ctx.translate(cx, cy);
    ctx.rotate(st.rot.tun || 0);
    for (let k = 0; k < arms; k++) {
      ctx.rotate(6.283 / arms);
      ctx.fillStyle = `rgba(255,${k % 2 ? "120,180,255" : "41,117"},${0.05 * flare})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.max(W, H) * 0.7, -Math.max(W, H) * 0.055);
      ctx.lineTo(Math.max(W, H) * 0.7, Math.max(W, H) * 0.055);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
function burstOnBeat(ctx, S, w) {
  const { W, H } = st;
  if (S.kickFlash > 0.55) {
    const cx = W / 2 + (Math.random() - 0.5) * W * 0.4;
    const cy = H * 0.48 + (Math.random() - 0.5) * H * 0.3;
    spawnSparks(cx, cy, 5, Math.random() > 0.5 ? GLOW.cyan : GLOW.pink,
                260 + S.energy * 380, 1.1);
  }
}
function shooters(ctx, S, w) {
  const { W, H } = st;
  if (Math.random() < 0.0035 && st.shooters.length < 2) {
    const a = Math.PI * (0.15 + Math.random() * 0.2);
    st.shooters.push({
      x: Math.random() * W * 0.8, y: Math.random() * H * 0.3,
      vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0, max: 0.9,
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = st.shooters.length - 1; i >= 0; i--) {
    const s = st.shooters[i];
    s.life += S.dt;
    s.x += s.vx * S.dt; s.y += s.vy * S.dt;
    if (s.life > s.max) { st.shooters.splice(i, 1); continue; }
    const a = Math.sin((s.life / s.max) * Math.PI) * w;
    const tl = 0.09;
    ctx.strokeStyle = `rgba(220,235,255,${0.8 * a})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * tl, s.y - s.vy * tl);
    ctx.stroke();
    glow(ctx, GLOW.white, s.x, s.y, 26, 0.7 * a);
  }
  ctx.restore();
}

// ---------- global overlays (sparks/ripples/vignette/grain) ----------
function overlays(ctx, S) {
  const { W, H } = st;
  // ripples
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = st.ripples.length - 1; i >= 0; i--) {
    const rp = st.ripples[i];
    rp.life += S.dt;
    rp.r += rp.vr * S.dt;
    if (rp.life > rp.max) { st.ripples.splice(i, 1); continue; }
    const u = rp.life / rp.max;
    const a = (1 - u) * (1 - u) * 0.75;
    ctx.strokeStyle = S.pal.accB.cssA.replace("A", String(a));
    ctx.lineWidth = 2.5 * (1 - u) + 0.5;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rp.r, 0, 6.283);
    ctx.stroke();
    ctx.strokeStyle = S.pal.accA.cssA.replace("A", String(a * 0.5));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rp.r * 0.82, 0, 6.283);
    ctx.stroke();
  }
  // sparks
  for (let i = st.sparks.length - 1; i >= 0; i--) {
    const p = st.sparks[i];
    p.life += S.dt;
    if (p.life > p.max) { st.sparks.splice(i, 1); continue; }
    p.vx *= p.drag; p.vy = p.vy * p.drag + 130 * S.dt;
    p.x += p.vx * S.dt; p.y += p.vy * S.dt;
    const u = 1 - p.life / p.max;
    glow(ctx, p.spr, p.x, p.y, p.sz * (2 + u * 5), u * 0.85);
  }
  ctx.restore();
  // vignette (cached per resize)
  if (!st.vg) {
    st.vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42,
                                     W / 2, H / 2, Math.max(W, H) * 0.78);
    st.vg.addColorStop(0, "rgba(0,0,0,0)");
    st.vg.addColorStop(1, "rgba(0,0,5,0.55)");
  }
  ctx.fillStyle = st.vg;
  ctx.fillRect(0, 0, W, H);
  // grain: one stretched draw sampling a moving sub-rect
  if (st.grain) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = "overlay";
    const rx = Math.floor(Math.random() * (720 - 360));
    const ry = Math.floor(Math.random() * (404 - 202));
    ctx.drawImage(st.grain, rx, ry, 360, 202, 0, 0, W, H);
    ctx.restore();
  }
}

// ---------- sky helper ----------
function paintSky(ctx, pal, w) {
  const { W, H } = st;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.skyT.css);
  g.addColorStop(0.72, pal.skyB.css);
  g.addColorStop(1, pal.hor.cssDark);
  ctx.globalAlpha = w;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

// ---------- palette interpolation ----------
function initPalette(name) {
  const out = {};
  for (const key of PAL_KEYS) out[key] = PAL_RGB[name][key].slice();
  return out;
}
function _rgbCss(c) { return `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`; }
function stepPalette(cur, targetName, k) {
  const tp = PAL_RGB[targetName];
  for (const key of PAL_KEYS) {
    const c = cur[key], t = tp[key];
    c[0] += (t[0] - c[0]) * k;
    c[1] += (t[1] - c[1]) * k;
    c[2] += (t[2] - c[2]) * k;
  }
  const mixA = Math.round(cur.hor[0] * 0.42 + cur.skyT[0] * 0.58);
  const mixB = Math.round(cur.hor[1] * 0.42 + cur.skyT[1] * 0.58);
  const mixC = Math.round(cur.hor[2] * 0.42 + cur.skyT[2] * 0.58);
  return {
    skyT: { css: `rgb(${_rgbCss(cur.skyT)})` },
    skyB: { css: `rgb(${_rgbCss(cur.skyB)})` },
    hor: {
      css: `rgb(${_rgbCss(cur.hor)})`,
      cssDark: `rgb(${mixA},${mixB},${mixC})`,
    },
    accA: { css: `rgb(${_rgbCss(cur.accA)})`, cssA: `rgba(${_rgbCss(cur.accA)},A)` },
    accB: { css: `rgb(${_rgbCss(cur.accB)})`, cssA: `rgba(${_rgbCss(cur.accB)},A)` },
    slitCss: `rgba(${Math.round(cur.skyT[0] * 0.7 + cur.hor[0] * 0.3)},${Math.round(cur.skyT[1] * 0.7 + cur.hor[1] * 0.3)},${Math.round(cur.skyT[2] * 0.7 + cur.hor[2] * 0.3)},0.95)`,
  };
}

// ============================ DISPATCH =======================================
const SCENE_FN = {
  dawn: scDawn, ignition: scIgnition, drive: scDrive, starlight: scStarlight,
  convergence: scConvergence, hyperdrive: scHyperdrive, afterglow: scAfterglow,
};

/* S: {t, mt, dt, secT, sceneId, weights{name:w}, pal, en:{bass,mid,high},
      beatPulse, kickFlash, energy, camX, camY, intensity} */
function draw(ctx, S) {
  const { W, H } = st;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);
  // camera shake + zoom punch around center
  const shx = (Math.random() - 0.5) * S.shake * 22;
  const shy = (Math.random() - 0.5) * S.shake * 22;
  ctx.translate(shx, shy);
  const zm = 1 + S.zoom * 0.045;
  if (zm !== 1) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(zm, zm);
    ctx.translate(-W / 2, -H / 2);
  }
  paintSky(ctx, S.pal, 1);
  for (const name in SCENE_FN) {
    const wgt = S.weights[name] || 0;
    if (wgt < 0.015) continue;
    SCENE_FN[name](ctx, S, wgt);
  }
  overlays(ctx, S);
}

return {
  reset, draw, spawnSparks, spawnRipple,
  initPalette, stepPalette,
  NAMES: Object.keys(SCENE_FN),
  glowSprite: GLOW,
};
})();
