(() => {
"use strict";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function mulberry(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const fmtTime = ms => {
  if (ms == null || !isFinite(ms)) return "--:--.--";
  const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
  return m + ":" + String(s).padStart(2, "0") + "." + String(cs).padStart(2, "0");
};
const fmtDelta = ms => (ms >= 0 ? "+" : "\u2212") + Math.abs(ms / 1000).toFixed(2);

const AUTO_DRIVE = new URLSearchParams(location.search).get("autodrive") === "1";

const CFG = {
  laps: 3,
  cpCount: 10,
  phys: {
    accel: 640, brake: 1500, revAccel: 340, revMax: 280,
    maxSpeed: 1060, boostMaxSpeed: 1330, boostAccel: 580,
    dragLin: 0.18, dragQuad: 0.0000047,
    steerBase: 3.7, steerTop: 1.5,
    gripRoad: 9.5, gripDrift: 2.05, gripOff: 4.6,
    slipMin: 95, slipSpeed: 150,
    boostGainRate: 0.12, boostDrain: 36, boostMinUse: 20,
    offCap: 520
  },
  kmh: 0.222,
  medals: { gold: 56000, silver: 63000, bronze: 75000 },
  aiAlat: 1150
};

const CP_SCALE = 2.2;
const CP_XY = [
  [-1350, 900], [-500, 950], [450, 900], [1150, 650], [1450, 200], [1350, -250],
  [950, -450], [550, -280], [250, -480], [-250, -650], [-750, -550], [-1250, -350],
  [-1550, 100]
].map(p => [p[0] * CP_SCALE, p[1] * CP_SCALE]);

const track = (() => {
  const SEG = 24, n = CP_XY.length, raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = CP_XY[(i - 1 + n) % n], p1 = CP_XY[i], p2 = CP_XY[(i + 1) % n], p3 = CP_XY[(i + 2) % n];
    for (let j = 0; j < SEG; j++) {
      const t = j / SEG, t2 = t * t, t3 = t2 * t;
      raw.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
  }
  const N = raw.length;
  const px = new Float64Array(N), py = new Float64Array(N);
  for (let i = 0; i < N; i++) { px[i] = raw[i][0]; py[i] = raw[i][1]; }
  let total = 0;
  const tx = new Float64Array(N), ty = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = i, b = (i + 1) % N;
    total += Math.hypot(px[b] - px[a], py[b] - py[a]);
  }
  const segLen = total / N;
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = px[b] - px[a], dy = py[b] - py[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
  }
  let curvRaw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 3 + N) % N, b = (i + 3) % N;
    curvRaw[i] = Math.abs(angDiff(Math.atan2(ty[b], tx[b]), Math.atan2(ty[a], tx[a]))) / (6 * segLen);
  }
  const curv = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -4; j <= 4; j++) s += curvRaw[(i + j + N) % N];
    curv[i] = s / 9;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
    if (py[i] < minY) minY = py[i]; if (py[i] > maxY) maxY = py[i];
  }
  function nearest(x, y, hint) {
    let bi = 0, bd = Infinity;
    if (hint >= 0) {
      for (let o = -36; o <= 36; o++) {
        const i = (hint + o + N) % N, dx = x - px[i], dy = y - py[i], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    }
    for (let i = 0; i < N; i += 3) {
      const dx = x - px[i], dy = y - py[i], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    for (let o = -3; o <= 3; o++) {
      const i = (bi + o + N) % N, dx = x - px[i], dy = y - py[i], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }
  const MARGIN = 720;
  return {
    px, py, tx, ty, curv, N, segLen, totalLen: total, HALF: 140,
    bounds: { minX: minX - MARGIN, minY: minY - MARGIN, maxX: maxX + MARGIN, maxY: maxY + MARGIN },
    nearest
  };
})();

const curbFlags = (() => {
  const f = new Uint8Array(track.N);
  for (let i = 0; i < track.N; i++) if (track.curv[i] > 0.00175) f[i] = 1;
  for (let pass = 0; pass < 4; pass++) {
    const cp = Uint8Array.from(f);
    for (let i = 0; i < track.N; i++) if (cp[i]) { f[(i + 1) % track.N] = 1; f[(i - 1 + track.N) % track.N] = 1; }
  }
  return f;
})();

class InputState {
  constructor() { this.throttle = 0; this.brake = 0; this.steer = 0; this.hand = false; this.boost = false; }
}

class Car {
  constructor() {
    this.x = 0; this.y = 0; this.h = 0; this.vx = 0; this.vy = 0;
    this.steerVis = 0; this.trackIdx = -1; this.lat = 0; this.s = 0; this.onRoad = true;
    this.slip = 0; this.speed = 0; this.vf = 0; this.boostMeter = 30; this.boosting = false;
    this.drifting = false; this.wasSlipping = false; this.shake = 0; this.brakeOn = false;
  }
  placeAt(idx, back = 0) {
    const i = (idx - back + track.N) % track.N;
    this.x = track.px[i]; this.y = track.py[i];
    this.h = Math.atan2(track.ty[i], track.tx[i]);
    this.vx = 0; this.vy = 0; this.trackIdx = i; this.slip = 0; this.vf = 0;
    this.boosting = false; this.wasSlipping = false; this.shake = 0;
    this.s = i / track.N;
  }
  step(dt, c) {
    const P = CFG.phys;
    const fx = Math.cos(this.h), fy = Math.sin(this.h);
    let vf = this.vx * fx + this.vy * fy;
    let vl = -this.vx * fy + this.vy * fx;

    this.trackIdx = track.nearest(this.x, this.y, this.trackIdx);
    const ti = this.trackIdx;
    this.lat = -(this.x - track.px[ti]) * track.ty[ti] + (this.y - track.py[ti]) * track.tx[ti];
    this.onRoad = Math.abs(this.lat) < track.HALF;
    this.s = ti / track.N;

    const boosting = c.boost && this.boostMeter >= P.boostMinUse && vf > -10;
    if (boosting && !this.boosting) sfx.boost();
    this.boosting = boosting;
    if (boosting) this.boostMeter = Math.max(0, this.boostMeter - P.boostDrain * dt);

    const cap = this.onRoad ? (boosting ? P.boostMaxSpeed : P.maxSpeed) : P.offCap;
    if (c.throttle > 0) {
      const a = P.accel * c.throttle + (boosting ? P.boostAccel : 0);
      vf += a * dt * clamp(1 - Math.max(vf, 0) / (cap * 1.12), 0.08, 1);
    }
    this.brakeOn = false;
    if (c.brake > 0) {
      if (vf > 15) { vf -= P.brake * c.brake * dt; this.brakeOn = true; }
      else vf -= P.revAccel * c.brake * dt;
      if (vf < -P.revMax) vf = -P.revMax;
    }

    vf -= vf * (P.dragLin + (this.onRoad ? 0 : 1.55)) * dt;
    vf -= vf * Math.abs(vf) * P.dragQuad * dt;
    if (vf > cap) vf = cap + (vf - cap) * Math.exp(-3.5 * dt);

    const sr = lerp(P.steerBase, P.steerTop, clamp(Math.abs(vf) / P.maxSpeed, 0, 1)) * (c.hand ? 1.28 : 1);
    this.steerVis = lerp(this.steerVis, c.steer, 1 - Math.exp(-9 * dt));
    const spdFac = Math.pow(clamp(Math.abs(vf) / 130, 0, 1), 0.85);
    if (Math.abs(vf) > 4) this.h += this.steerVis * sr * spdFac * dt * (vf >= 0 ? 1 : -1);

    const grip = c.hand ? P.gripDrift : (this.onRoad ? P.gripRoad : P.gripOff);
    this.slip = Math.abs(vl);
    vl *= Math.exp(-grip * dt);

    const preSlipDrift = this.slip;
    this.drifting = preSlipDrift > P.slipMin && this.speed > P.slipSpeed && this.onRoad;
    if (!c.hand && this.wasSlipping && preSlipDrift < P.slipMin && vf > 150 && this.onRoad) {
      vf += 52;
      particles.burst(this.x - fx * 24, this.y - fy * 24, 9, "spark");
      sfx.ding(520, 0.09, 0.22);
    }
    this.wasSlipping = c.hand && preSlipDrift > P.slipMin;
    if (this.drifting && !boosting) this.boostMeter = Math.min(100, this.boostMeter + Math.min(preSlipDrift, 430) * P.boostGainRate * dt);

    const nfx = Math.cos(this.h), nfy = Math.sin(this.h);
    this.vx = nfx * vf - nfy * vl;
    this.vy = nfy * vf + nfx * vl;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const b = track.bounds;
    if (this.x < b.minX) { this.x = b.minX; this.vx *= -0.4; }
    if (this.x > b.maxX) { this.x = b.maxX; this.vx *= -0.4; }
    if (this.y < b.minY) { this.y = b.minY; this.vy *= -0.4; }
    if (this.y > b.maxY) { this.y = b.maxY; this.vy *= -0.4; }

    this.vf = vf;
    this.speed = Math.hypot(this.vx, this.vy);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (!this.onRoad && this.speed > 140) this.shake = Math.min(1, this.shake + dt * 2.6);
  }
}

const keys = {};
window.addEventListener("keydown", e => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) e.preventDefault();
  if (!keys[e.code]) onKeyPress(e.code);
  keys[e.code] = true;
});
window.addEventListener("keyup", e => { keys[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

function readControls(c) {
  c.throttle = (keys.ArrowUp || keys.KeyW) ? 1 : 0;
  c.brake = (keys.ArrowDown || keys.KeyS) ? 1 : 0;
  let st = 0;
  if (keys.ArrowLeft || keys.KeyA) st -= 1;
  if (keys.ArrowRight || keys.KeyD) st += 1;
  c.steer = st;
  c.hand = !!keys.Space;
  c.boost = !!(keys.ShiftLeft || keys.ShiftRight);
  return c;
}

const aiCtl = new InputState();
let aiStuck = 0, aiRecover = 0, aiRecSteer = 0;
function aiDrive(car, out) {
  const idx = car.trackIdx;
  if (aiRecover > 0) {
    aiRecover--;
    out.throttle = 0; out.brake = 1; out.steer = aiRecSteer;
    out.hand = false; out.boost = false;
    return out;
  }
  const spd = car.speed;
  const lookDist = 175 + spd * 0.45;
  const li = (idx + Math.max(3, Math.round(lookDist / track.segLen))) % track.N;
  const desired = Math.atan2(track.py[li] - car.y, track.px[li] - car.x);
  if (!car.onRoad) {
    const back = Math.atan2(track.py[idx] - car.y, track.px[idx] - car.x);
    out.steer = clamp(angDiff(back, car.h) * 2.6, -1, 1);
    out.throttle = 1; out.brake = 0; out.hand = false; out.boost = false;
    return out;
  }
  const err = angDiff(desired, car.h);
  out.steer = clamp(err * 2.3, -1, 1);
  let vt = CFG.phys.maxSpeed;
  for (let j = 4; j <= 64; j += 4) {
    const k = (idx + j) % track.N;
    const allowed = Math.sqrt(CFG.aiAlat / Math.max(track.curv[k], 1e-5)) + j * track.segLen * 0.32;
    if (allowed < vt) vt = allowed;
  }
  out.throttle = car.vf < vt ? 1 : 0;
  out.brake = (car.vf > vt * 1.03 || Math.abs(err) > 0.6) ? 1 : 0;
  out.hand = false;
  out.boost = car.boostMeter > 58 && vt > CFG.phys.maxSpeed * 0.94 && car.onRoad;
  if (Math.abs(err) > 1.25 && spd < 140) aiStuck++; else aiStuck = 0;
  if (aiStuck > 40) {
    aiStuck = 0;
    aiRecover = 75;
    aiRecSteer = -Math.sign(err) || 1;
  }
  return out;
}

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mmCanvas = document.getElementById("minimap");
const mmCtx = mmCanvas.getContext("2d");
let W = 1280, H = 720, DPR = 1;
function resize() {
  DPR = clamp(window.devicePixelRatio || 1, 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}
window.addEventListener("resize", resize);
resize();

const cam = { x: 0, y: 0, zoom: 1 };

const staticC = (() => {
  const b = track.bounds, SC = 0.36;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil((b.maxX - b.minX) * SC);
  cv.height = Math.ceil((b.maxY - b.minY) * SC);
  const g = cv.getContext("2d");
  g.scale(SC, SC);
  g.translate(-b.minX, -b.minY);
  const rng = mulberry(1337);
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;

  g.fillStyle = "#3f7a35";
  g.fillRect(b.minX, b.minY, bw, bh);
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let x = b.minX - bh; x < b.maxX + bh; x += 240) {
    g.beginPath();
    g.moveTo(x, b.minY); g.lineTo(x + 120, b.minY);
    g.lineTo(x + 120 - bh, b.maxY); g.lineTo(x - bh, b.maxY);
    g.closePath(); g.fill();
  }
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 2400; i++) {
    g.fillRect(b.minX + rng() * bw, b.minY + rng() * bh, 3 + rng() * 5, 2 + rng() * 3);
  }

  const road = new Path2D();
  road.moveTo(track.px[0], track.py[0]);
  for (let i = 1; i < track.N; i++) road.lineTo(track.px[i], track.py[i]);
  road.closePath();

  g.lineJoin = "round"; g.lineCap = "round";
  g.strokeStyle = "rgba(0,0,0,0.28)";
  g.lineWidth = track.HALF * 2 + 26;
  g.stroke(road);
  g.strokeStyle = "#33353c";
  g.lineWidth = track.HALF * 2;
  g.stroke(road);

  g.save();
  g.clip(road);
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 3000; i++) {
    const k = (rng() * track.N) | 0, nx = -track.ty[k], ny = track.tx[k];
    const off = (rng() * 2 - 1) * (track.HALF - 12);
    g.fillRect(track.px[k] + nx * off, track.py[k] + ny * off, 2.6, 2.6);
  }
  g.fillStyle = "rgba(0,0,0,0.07)";
  for (let i = 0; i < 2000; i++) {
    const k = (rng() * track.N) | 0, nx = -track.ty[k], ny = track.tx[k];
    const off = (rng() * 2 - 1) * (track.HALF - 8);
    g.fillRect(track.px[k] + nx * off, track.py[k] + ny * off, 3.2, 3.2);
  }
  g.restore();

  for (const side of [1, -1]) {
    const off = track.HALF * 0.88 * side;
    g.beginPath();
    for (let i = 0; i <= track.N; i++) {
      const k = i % track.N, nx = -track.ty[k], ny = track.tx[k];
      const x = track.px[k] + nx * off, y = track.py[k] + ny * off;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = "rgba(236,240,245,0.85)";
    g.lineWidth = 5;
    g.stroke();
  }

  for (let i = 0; i < track.N; i += 2) {
    if (!curbFlags[i]) continue;
    const k = (i + 1) % track.N;
    const nx0 = -track.ty[i], ny0 = track.tx[i], nx1 = -track.ty[k], ny1 = track.tx[k];
    for (const side of [1, -1]) {
      const o0 = track.HALF * side, o1 = (track.HALF + 17) * side;
      g.fillStyle = (i >> 1) % 2 === 0 ? "#d5372f" : "#eceff3";
      g.beginPath();
      g.moveTo(track.px[i] + nx0 * o0, track.py[i] + ny0 * o0);
      g.lineTo(track.px[i] + nx0 * o1, track.py[i] + ny0 * o1);
      g.lineTo(track.px[k] + nx1 * o1, track.py[k] + ny1 * o1);
      g.lineTo(track.px[k] + nx1 * o0, track.py[k] + ny1 * o0);
      g.closePath();
      g.fill();
    }
  }

  {
    const sx = track.px[0], sy = track.py[0];
    const nx0 = -track.ty[0], ny0 = track.tx[0];
    const cells = 14, cellW = (track.HALF * 2) / cells, cellH = 13;
    for (let r = 0; r < 2; r++) {
      for (let ci = 0; ci < cells; ci++) {
        g.fillStyle = (r + ci) % 2 === 0 ? "#16181d" : "#eef1f5";
        const latA = -track.HALF + ci * cellW, latB = latA + cellW;
        const aA = 6 + r * cellH, aB = aA + cellH;
        const x1 = sx + nx0 * latA + track.tx[0] * aA, y1 = sy + ny0 * latA + track.ty[0] * aA;
        const x2 = sx + nx0 * latB + track.tx[0] * aA, y2 = sy + ny0 * latB + track.ty[0] * aA;
        const x3 = sx + nx0 * latB + track.tx[0] * aB, y3 = sy + ny0 * latB + track.ty[0] * aB;
        const x4 = sx + nx0 * latA + track.tx[0] * aB, y4 = sy + ny0 * latA + track.ty[0] * aB;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.closePath(); g.fill();
      }
    }
    g.fillStyle = "#20242b";
    const pOff = track.HALF + 30;
    g.fillRect(sx + nx0 * -pOff - 10, sy + ny0 * -pOff - 10, 20, 20);
    g.fillRect(sx + nx0 * pOff - 10, sy + ny0 * pOff - 10, 20, 20);
  }

  {
    const gx = CP_XY[1][0], gy = CP_XY[1][1] + 340;
    g.save();
    g.translate(gx, gy);
    g.fillStyle = "#23262d";
    g.fillRect(-370, -70, 740, 155);
    g.fillStyle = "#303441";
    g.fillRect(-390, -94, 780, 28);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = ["#e2574c", "#f0c94a", "#5ab0e2", "#71c789", "#d8d8d8", "#b08ad6", "#eb8c3f"][(rng() * 7) | 0];
      g.fillRect(-355 + rng() * 710, -55 + rng() * 122, 7, 7);
    }
    g.restore();
  }

  for (let tries = 0, placed = 0; placed < 150 && tries < 7000; tries++) {
    const x = b.minX + 80 + rng() * (bw - 160), y = b.minY + 80 + rng() * (bh - 160);
    const idx = track.nearest(x, y, -1);
    const d = Math.hypot(x - track.px[idx], y - track.py[idx]);
    if (d < track.HALF + 150 || d > track.HALF + 1500) continue;
    placed++;
    const r0 = 26 + rng() * 26;
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.beginPath(); g.ellipse(x + 10, y + 12, r0 * 1.15, r0 * 0.85, 0, 0, TAU); g.fill();
    g.fillStyle = rng() < 0.5 ? "#2e5c28" : "#35682c";
    g.beginPath(); g.arc(x, y, r0, 0, TAU); g.fill();
    g.fillStyle = rng() < 0.5 ? "#3f7d33" : "#498a39";
    g.beginPath(); g.arc(x - r0 * 0.3, y - r0 * 0.32, r0 * 0.62, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.beginPath(); g.arc(x - r0 * 0.42, y - r0 * 0.45, r0 * 0.27, 0, TAU); g.fill();
  }

  return { canvas: cv, minX: b.minX, minY: b.minY, scale: SC };
})();

const mini = (() => {
  const pad = 10, b = track.bounds;
  const s = Math.min((mmCanvas.width - pad * 2) / (b.maxX - b.minX), (mmCanvas.height - pad * 2) / (b.maxY - b.minY));
  const ox = pad + ((mmCanvas.width - pad * 2) - (b.maxX - b.minX) * s) / 2;
  const oy = pad + ((mmCanvas.height - pad * 2) - (b.maxY - b.minY) * s) / 2;
  const bg = document.createElement("canvas");
  bg.width = mmCanvas.width; bg.height = mmCanvas.height;
  const g = bg.getContext("2d");
  g.beginPath();
  for (let i = 0; i <= track.N; i++) {
    const k = i % track.N;
    const x = ox + (track.px[k] - b.minX) * s, y = oy + (track.py[k] - b.minY) * s;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.strokeStyle = "rgba(235,240,246,0.72)";
  g.lineWidth = 4; g.lineJoin = "round";
  g.stroke();
  g.fillStyle = "#ff7a29";
  const mx = ox + (track.px[0] - b.minX) * s, my = oy + (track.py[0] - b.minY) * s;
  g.beginPath(); g.arc(mx, my, 3.4, 0, TAU); g.fill();
  return {
    draw(cx, cy, ch, gx, gy, hasGhost) {
      mmCtx.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
      mmCtx.drawImage(bg, 0, 0);
      if (hasGhost) {
        mmCtx.fillStyle = "rgba(255,255,255,0.75)";
        mmCtx.beginPath(); mmCtx.arc(ox + (gx - b.minX) * s, oy + (gy - b.minY) * s, 3, 0, TAU); mmCtx.fill();
      }
      const px2 = ox + (cx - b.minX) * s, py2 = oy + (cy - b.minY) * s;
      mmCtx.fillStyle = "#ffb02e";
      mmCtx.beginPath(); mmCtx.arc(px2, py2, 4.2, 0, TAU); mmCtx.fill();
      mmCtx.strokeStyle = "#ffb02e";
      mmCtx.lineWidth = 1.6;
      mmCtx.beginPath();
      mmCtx.moveTo(px2, py2);
      mmCtx.lineTo(px2 + Math.cos(ch) * 10, py2 + Math.sin(ch) * 10);
      mmCtx.stroke();
    }
  };
})();

const particles = (() => {
  const POOL = 320, list = [];
  for (let i = 0; i < POOL; i++) list.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, type: 0 });
  let cursor = 0;
  return {
    burst(x, y, n, spark) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 70 + Math.random() * 190;
        const p = list[cursor++ % POOL];
        p.on = true; p.type = spark ? 1 : 0;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.life = p.max = spark ? 0.3 + Math.random() * 0.25 : 0.5 + Math.random() * 0.3;
        p.size = spark ? 3.4 : 7;
      }
    },
    update(dt, car) {
      const fx = Math.cos(car.h), fy = Math.sin(car.h);
      const rx = -fy, ry = fx;
      if (car.drifting && car.onRoad && Math.random() < 0.85) {
        for (const sd of [1, -1]) {
          const p = list[cursor++ % POOL];
          p.on = true; p.type = 0;
          p.x = car.x - fx * 22 + rx * 11 * sd + (Math.random() - 0.5) * 8;
          p.y = car.y - fy * 22 + ry * 11 * sd + (Math.random() - 0.5) * 8;
          p.vx = -fx * 46 + (Math.random() - 0.5) * 74;
          p.vy = -fy * 46 + (Math.random() - 0.5) * 74;
          p.life = p.max = 0.5 + Math.random() * 0.32;
          p.size = 7;
        }
      }
      if (car.boosting && Math.random() < 0.92) {
        const p = list[cursor++ % POOL];
        p.on = true; p.type = 1;
        p.x = car.x - fx * 27 + (Math.random() - 0.5) * 10;
        p.y = car.y - fy * 27 + (Math.random() - 0.5) * 10;
        p.vx = -fx * (250 + Math.random() * 160);
        p.vy = -fy * (250 + Math.random() * 160);
        p.life = p.max = 0.2 + Math.random() * 0.13;
        p.size = 3.6;
      }
      if (!car.onRoad && car.speed > 110 && Math.random() < 0.8) {
        const p = list[cursor++ % POOL];
        p.on = true; p.type = 2;
        p.x = car.x - fx * 20; p.y = car.y - fy * 20;
        p.vx = (Math.random() - 0.5) * 96; p.vy = (Math.random() - 0.5) * 96;
        p.life = p.max = 0.5 + Math.random() * 0.34;
        p.size = 8;
      }
      for (const p of list) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt;
        if (p.type === 0) p.size += 15 * dt;
      }
    },
    draw(g) {
      for (const p of list) {
        if (!p.on) continue;
        const t = p.life / p.max;
        if (p.type === 0) {
          g.fillStyle = `rgba(206,209,215,${0.32 * t})`;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
        } else if (p.type === 1) {
          g.globalCompositeOperation = "lighter";
          g.fillStyle = `rgba(255,${(160 + Math.random() * 70) | 0},60,${0.85 * t})`;
          g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          g.globalCompositeOperation = "source-over";
        } else {
          g.fillStyle = `rgba(142,118,86,${0.38 * t})`;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
        }
      }
    }
  };
})();

const skids = (() => {
  const MAX = 1300, segs = new Float32Array(MAX * 5);
  let head = 0, count = 0;
  return {
    add(x, y, px, py) {
      const o = head * 5;
      segs[o] = px; segs[o + 1] = py; segs[o + 2] = x; segs[o + 3] = y;
      head = (head + 1) % MAX; count = Math.min(count + 1, MAX);
    },
    draw(g, L, T, R, B) {
      if (!count) return;
      g.lineWidth = 7; g.lineCap = "round";
      g.strokeStyle = "rgba(18,19,24,0.42)";
      g.beginPath();
      for (let i = 0; i < count; i++) {
        const o = ((head - 1 - i + MAX) % MAX) * 5;
        const x0 = segs[o], y0 = segs[o + 1];
        if (x0 < L - 60 || x0 > R + 60 || y0 < T - 60 || y0 > B + 60) continue;
        g.moveTo(x0, y0); g.lineTo(segs[o + 2], segs[o + 3]);
      }
      g.stroke();
    },
    clear() { head = 0; count = 0; }
  };
})();

class Sfx {
  constructor() { this.ok = false; this.muted = store.get("rtt_mute", false); }
  init() {
    if (this.ok) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ac = this.ac = new AC();
      this.master = ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ac.destination);
      const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      this.eng1 = ac.createOscillator(); this.eng1.type = "sawtooth"; this.eng1.frequency.value = 70;
      this.eng2 = ac.createOscillator(); this.eng2.type = "square"; this.eng2.frequency.value = 35;
      const flt = ac.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 520;
      this.engGain = ac.createGain(); this.engGain.gain.value = 0;
      this.eng1.connect(flt); this.eng2.connect(flt); flt.connect(this.engGain); this.engGain.connect(this.master);
      this.eng1.start(); this.eng2.start();

      const mk = (type, freq, q) => {
        const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const gn = ac.createGain(); gn.gain.value = 0;
        src.connect(f); f.connect(gn); gn.connect(this.master);
        src.start();
        return gn;
      };
      this.skidGain = mk("bandpass", 880, 1.1);
      this.windGain = mk("lowpass", 850, 0.6);
      this.ok = true;
    } catch (e) {}
  }
  resume() { if (this.ok && this.ac.state === "suspended") this.ac.resume(); }
  engine(speedN, throttle, drifting) {
    if (!this.ok) return;
    const t = this.ac.currentTime;
    this.eng1.frequency.setTargetAtTime(62 + speedN * 168 + throttle * 12, t, 0.05);
    this.eng2.frequency.setTargetAtTime(31 + speedN * 84, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.045 + speedN * 0.07 + throttle * 0.02, t, 0.08);
    this.skidGain.gain.setTargetAtTime(drifting ? 0.11 : 0, t, 0.06);
    this.windGain.gain.setTargetAtTime(speedN * speedN * 0.14, t, 0.12);
  }
  quiet() {
    if (!this.ok) return;
    const t = this.ac.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.1);
    this.skidGain.gain.setTargetAtTime(0, t, 0.04);
    this.windGain.gain.setTargetAtTime(0, t, 0.1);
  }
  tone(freq, dur, type, vol, when = 0) {
    if (!this.ok || this.muted) return;
    const t0 = this.ac.currentTime + when;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  ding(freq, dur, vol) { this.tone(freq, dur, "triangle", vol); }
  beep(final) { this.tone(final ? 880 : 440, final ? 0.42 : 0.13, "square", 0.28); }
  checkpoint() { this.tone(660, 0.08, "square", 0.2); this.tone(990, 0.11, "square", 0.18, 0.06); }
  lapJingle(final) {
    const notes = final ? [523, 659, 784, 1046] : [659, 784, 1046];
    notes.forEach((f, i) => this.tone(f, 0.14, "triangle", 0.28, i * 0.1));
  }
  fanfare() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.3, i * 0.12)); }
  boost() {
    if (!this.ok || this.muted) return;
    const t0 = this.ac.currentTime;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t0);
    o.frequency.exponentialRampToValueAtTime(760, t0 + 0.32);
    g.gain.setValueAtTime(0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.36);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.4);
  }
  click() { this.tone(700, 0.05, "sine", 0.18); }
  setMuted(m) {
    this.muted = m;
    store.set("rtt_mute", m);
    if (this.ok) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ac.currentTime, 0.04);
  }
}
const sfx = new Sfx();

function drawCar(g, car, ghostMode) {
  g.save();
  g.translate(car.x, car.y);
  if (!ghostMode) {
    g.save();
    g.rotate(car.h);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(2, 4, 30, 17, 0, 0, TAU); g.fill();
    g.restore();
  }
  g.rotate(car.h);
  if (ghostMode) g.globalAlpha = 0.42;
  g.fillStyle = ghostMode ? "#15181d" : "#15181d";
  g.globalAlpha *= ghostMode ? 1 : 1;
  const wheelPos = [[-13, -16], [13, -16], [-14, 16], [14, 16]];
  for (const wp of wheelPos) {
    g.save();
    g.translate(wp[0], wp[1]);
    if (wp[1] < 0) g.rotate((car.steerVis || 0) * 0.42);
    g.fillRect(-4.6, -8, 9.2, 16);
    g.restore();
  }
  g.globalAlpha = ghostMode ? 0.42 : 1;
  g.fillStyle = ghostMode ? "#bcd6ea" : "#e8452f";
  g.beginPath();
  g.moveTo(0, -31);
  g.quadraticCurveTo(15, -28, 15, -12);
  g.lineTo(16, 14);
  g.quadraticCurveTo(15, 26, 8, 28);
  g.lineTo(-8, 28);
  g.quadraticCurveTo(-15, 26, -16, 14);
  g.lineTo(-15, -12);
  g.quadraticCurveTo(-15, -28, 0, -31);
  g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.beginPath();
  g.moveTo(0, -29); g.quadraticCurveTo(12, -26, 12, -13);
  g.lineTo(0, -11);
  g.closePath(); g.fill();
  g.fillStyle = ghostMode ? "#9fb4c6" : "#22262d";
  g.beginPath();
  g.moveTo(-9, -4); g.quadraticCurveTo(0, -9, 9, -4);
  g.lineTo(8, 8); g.quadraticCurveTo(0, 12, -8, 8);
  g.closePath(); g.fill();
  g.fillStyle = ghostMode ? "#eaf4fb" : "#f4f6f8";
  g.beginPath(); g.arc(0, 2, 4.6, 0, TAU); g.fill();
  g.fillStyle = ghostMode ? "#bcd6ea" : "#e8452f";
  g.fillRect(-17, 19, 34, 5);
  g.fillRect(-19, 24, 4, 7);
  g.fillRect(15, 24, 4, 7);
  if (car.boosting && !ghostMode) {
    g.globalCompositeOperation = "lighter";
    const fl = 14 + Math.random() * 16;
    g.fillStyle = "rgba(255,190,70,0.9)";
    g.beginPath();
    g.moveTo(-6, 27); g.lineTo(6, 27); g.lineTo(0, 27 + fl);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(110,180,255,0.8)";
    g.beginPath();
    g.moveTo(-3, 27); g.lineTo(3, 27); g.lineTo(0, 27 + fl * 0.55);
    g.closePath(); g.fill();
    g.globalCompositeOperation = "source-over";
  }
  if (car.brakeOn && !ghostMode) {
    g.fillStyle = "rgba(255,60,50,0.95)";
    g.fillRect(-13, 26.5, 9, 3.4);
    g.fillRect(4, 26.5, 9, 3.4);
  }
  g.globalAlpha = 1;
  g.restore();
}

const el = id => document.getElementById(id);
const ui = {
  hud: el("hud"), lap: el("hudLap"), time: el("hudTime"), best: el("hudBest"), speed: el("hudSpeed"),
  boostFill: el("boostFill"), boostWrap: el("boostWrap"),
  menu: el("menuOverlay"), countOv: el("countOverlay"), countNum: el("countNum"),
  pause: el("pauseOverlay"), results: el("resultsOverlay"),
  msg: el("msgCenter"), wrong: el("wrongWay"), freeTag: el("freeTag"), deltas: el("deltas"),
  medalTable: el("medalTable"), resMedal: el("resMedal"), resTotal: el("resTotal"),
  resLap: el("resLap"), resPB: el("resPB"), resRecord: el("resRecord"), resTitle: el("resTitle")
};

const ST = { MENU: 0, COUNTDOWN: 1, RACING: 2, PAUSED: 3, FINISHED: 4, FREE: 5 };
let state = ST.MENU;
let prevState = ST.MENU;

const car = new Car();
const ghostCar = new Car();
const ctl = new InputState();
const holdCtl = new InputState();

let raceTime = 0, lapStartTime = 0, lapCount = 1, sessionBestMs = null;
let nextCp = 1, prevS = 0, splits = [], wrongWayTimer = 0;
let countdownT = 0, countdownShown = -1;
let pb = store.get("rtt_pb", null), lastRun = store.get("rtt_last", null);
let ghostFrames = null, ghostIdx = 0, recFrames = [], recAcc = 0;
let msgTimer = 0;

function refreshMedalTable() {
  const defs = [["gold", "GOLD"], ["silver", "SILVER"], ["bronze", "BRONZE"]];
  ui.medalTable.innerHTML = "";
  for (const [k, label] of defs) {
    const div = document.createElement("div");
    div.className = "medalCell " + k;
    const earned = pb && pb.total != null && pb.total <= CFG.medals[k];
    div.innerHTML = `<div class="mName">${label}</div><div class="mTime">${fmtTime(CFG.medals[k])}</div><span class="pbNote">${earned ? "EARNED" : ""}</span>`;
    ui.medalTable.appendChild(div);
  }
}

function crossedForward(a, b, f) {
  const d = (b - a + 1) % 1;
  if (d <= 1e-9 || d >= 0.5) return false;
  const off = (f - a + 1) % 1;
  return off > 1e-9 && off <= d;
}

function show(node, on) { node.classList.toggle("hidden", !on); }

function flashMsg(text, ms) {
  ui.msg.textContent = text;
  ui.msg.classList.add("show");
  msgTimer = ms / 1000;
}

function deltaPop(ms) {
  const div = document.createElement("div");
  div.className = "deltaPop " + (ms <= 0 ? "good" : "bad");
  div.textContent = fmtDelta(ms);
  ui.deltas.appendChild(div);
  setTimeout(() => div.remove(), 1600);
}

function updateBestHud() {
  const ref = sessionBestMs != null ? sessionBestMs : (pb ? pb.bestLap : null);
  ui.best.textContent = ref != null ? fmtTime(ref) : "--:--.--";
}

function startRace() {
  car.placeAt(0, 8);
  skids.clear();
  raceTime = 0; lapStartTime = 0; lapCount = 1; sessionBestMs = null;
  nextCp = 1; prevS = car.s; splits = []; recFrames = []; recAcc = 0; wrongWayTimer = 0;
  ghostIdx = 0;
  const src = (pb && pb.ghost) || (lastRun && lastRun.ghost);
  ghostFrames = (src && src.frames && src.frames.length > 2) ? src.frames : null;
  state = ST.COUNTDOWN;
  countdownT = 0; countdownShown = -1;
  show(ui.countOv, true); show(ui.results, false); show(ui.pause, false); show(ui.menu, false);
  show(ui.hud, true);
  ui.freeTag.style.display = "none";
  ui.wrong.style.display = "none";
  ui.lap.textContent = "1/" + CFG.laps;
  updateBestHud();
}

function startFree() {
  car.placeAt(0, 8);
  skids.clear();
  raceTime = 0; lapStartTime = 0; lapCount = 1; sessionBestMs = null;
  nextCp = 1; prevS = car.s; splits = []; recFrames = []; recAcc = 0; wrongWayTimer = 0;
  ghostFrames = null; ghostIdx = 0;
  state = ST.FREE;
  show(ui.menu, false); show(ui.results, false); show(ui.pause, false); show(ui.countOv, false);
  show(ui.hud, true);
  ui.freeTag.style.display = "block";
  ui.wrong.style.display = "none";
  ui.lap.textContent = "-";
  updateBestHud();
}

function toMenu() {
  state = ST.MENU;
  car.placeAt(0, track.N >> 1);
  car.boostMeter = 70;
  skids.clear();
  ghostFrames = null;
  show(ui.menu, true); show(ui.results, false); show(ui.pause, false);
  show(ui.countOv, false); show(ui.hud, false);
  refreshMedalTable();
}

function respawnAtCheckpoint() {
  const target = Math.round(((nextCp - 1) / CFG.cpCount) * track.N) % track.N;
  car.placeAt(target, 0);
  prevS = car.s;
  wrongWayTimer = 0;
  particles.burst(car.x, car.y, 8, false);
}

function restartRace() {
  sfx.resume();
  if (world_free()) startFree(); else startRace();
}
function world_free() { return stateWasFree; }
let stateWasFree = false;

function togglePause() {
  if (state === ST.RACING || state === ST.COUNTDOWN || state === ST.FREE) {
    stateWasFree = state === ST.FREE;
    prevState = state;
    state = ST.PAUSED;
    show(ui.pause, true);
    sfx.quiet();
  } else if (state === ST.PAUSED) {
    state = prevState;
    show(ui.pause, false);
  }
}

function saveRecFrame() {
  recFrames.push([+(raceTime - lapStartTime).toFixed(2), +car.x.toFixed(1), +car.y.toFixed(1), +car.h.toFixed(3)]);
}

function completeLap(lapMs) {
  const refSplits = pb && pb.ghost && pb.ghost.splits ? pb.ghost.splits : null;
  sessionBestMs = sessionBestMs == null ? lapMs : Math.min(sessionBestMs, lapMs);
  const entry = { lapMs, splits: splits.slice(), frames: recFrames.slice() };
  lastRun = entry;
  store.set("rtt_last", entry);
  recFrames = [];
  recAcc = 0;
  let isRecord = false;
  if (!pb || pb.bestLap == null || lapMs < pb.bestLap) {
    isRecord = true;
    const totalVal = pb && pb.total != null ? pb.total : null;
    pb = { bestLap: lapMs, total: totalVal, ghost: { lapMs, splits: splits.slice(), frames: entry.frames } };
    store.set("rtt_pb", pb);
    flashMsg("BEST LAP  " + fmtTime(lapMs), 1500);
  }
  updateBestHud();
  if (refSplits && refSplits.length) {
    deltaPop(lapMs - refSplits[Math.min(refSplits.length - 1, refSplits.length - 1)]);
  }
  if (window.RTT_DEBUG) window.RTT_DEBUG.lapTimes.push(lapMs);
  lapCount++;
  if (lapCount > CFG.laps) {
    finishRace();
    return;
  }
  splits = [];
  lapStartTime = raceTime;
  nextCp = 1;
  ghostIdx = 0;
  ui.lap.textContent = lapCount + "/" + CFG.laps;
  if (!isRecord) flashMsg(lapCount === CFG.laps ? "FINAL LAP" : "LAP " + lapCount, 1300);
  sfx.lapJingle(lapCount === CFG.laps);
}

function medalFor(totalMs) {
  if (totalMs <= CFG.medals.gold) return ["GOLD", "#ffd75e"];
  if (totalMs <= CFG.medals.silver) return ["SILVER", "#cfd9e4"];
  if (totalMs <= CFG.medals.bronze) return ["BRONZE", "#e39a5f"];
  return ["NO MEDAL", "#8fa3b5"];
}

function finishRace() {
  state = ST.FINISHED;
  const totalMs = raceTime * 1000;
  let record = false;
  if (!pb || pb.total == null || totalMs < pb.total) {
    record = true;
    if (pb) pb.total = totalMs;
    else pb = { bestLap: sessionBestMs, total: totalMs, ghost: lastRun ? lastRun.ghost : null };
    store.set("rtt_pb", pb);
  }
  const [mname, mcolor] = medalFor(totalMs);
  ui.resTitle.textContent = "RACE COMPLETE";
  ui.resMedal.textContent = mname;
  ui.resMedal.style.color = mcolor;
  ui.resTotal.textContent = fmtTime(totalMs);
  ui.resLap.textContent = fmtTime(sessionBestMs);
  ui.resPB.textContent = pb && pb.total != null ? fmtTime(pb.total) : "-";
  show(ui.resRecord, record);
  sfx.fanfare();
  setTimeout(() => { if (state === ST.FINISHED) show(ui.results, true); }, 900);
}

function onKeyPress(code) {
  sfx.init();
  if (code === "KeyM") { sfx.setMuted(!sfx.muted); return; }
  if (state === ST.MENU) {
    if (code === "Enter") { sfx.click(); startRace(); }
    else if (code === "KeyF") { sfx.click(); startFree(); }
    return;
  }
  if (code === "Escape") {
    if (state === ST.RACING || state === ST.COUNTDOWN || state === ST.PAUSED || state === ST.FREE) togglePause();
    else if (state === ST.FINISHED) toMenu();
    return;
  }
  if (code === "KeyR") {
    if (state === ST.FINISHED) { show(ui.results, false); startRace(); }
    else if (state === ST.PAUSED) { show(ui.pause, false); state = prevState; restartRace(); }
    else if (state === ST.RACING || state === ST.COUNTDOWN) startRace();
    else if (state === ST.FREE) startFree();
    return;
  }
  if (code === "KeyQ") {
    if (state === ST.PAUSED || state === ST.FINISHED) toMenu();
    return;
  }
  if (code === "KeyT" && (state === ST.RACING || state === ST.FREE)) respawnAtCheckpoint();
}

el("btnRace").addEventListener("click", () => { sfx.init(); sfx.resume(); sfx.click(); startRace(); });
el("btnFree").addEventListener("click", () => { sfx.init(); sfx.resume(); sfx.click(); startFree(); });
el("btnResume").addEventListener("click", () => { sfx.click(); togglePause(); });
el("btnRestartP").addEventListener("click", () => { sfx.click(); show(ui.pause, false); state = prevState; restartRace(); });
el("btnQuitP").addEventListener("click", () => { sfx.click(); toMenu(); });
el("btnRetry").addEventListener("click", () => { sfx.click(); show(ui.results, false); startRace(); });
el("btnMenu").addEventListener("click", () => { sfx.click(); toMenu(); });
document.addEventListener("pointerdown", () => { sfx.init(); sfx.resume(); }, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === ST.RACING || state === ST.COUNTDOWN || state === ST.FREE)) togglePause();
});

function physicsTick(dt, control) {
  car.step(dt, control);

  if (car.drifting && car.onRoad) {
    const fx = Math.cos(car.h), fy = Math.sin(car.h);
    const rx = -fy, ry = fx;
    const bx = car.x - fx * 22, by = car.y - fy * 22;
    skids.add(bx + rx * 11, by + ry * 11, bx + rx * 11 - car.vx * dt, by + ry * 11 - car.vy * dt);
    skids.add(bx - rx * 11, by - ry * 11, bx - rx * 11 - car.vx * dt, by - ry * 11 - car.vy * dt);
  }

  if (state !== ST.RACING && state !== ST.FREE) return;

  if (state === ST.RACING) {
    const fwdDelta = (car.s - prevS + 1) % 1;
    if (fwdDelta > 1e-9 && fwdDelta < 0.5) wrongWayTimer = Math.max(0, wrongWayTimer - dt * 2.5);
    else if (fwdDelta >= 0.5 && car.speed > 90) wrongWayTimer += dt;
    else wrongWayTimer = Math.max(0, wrongWayTimer - dt * 0.6);

    const f = nextCp / CFG.cpCount;
    if (Math.abs(car.lat) < track.HALF * 2.2 && crossedForward(prevS, car.s, f)) {
      if (nextCp >= CFG.cpCount) {
        const lapMs = (raceTime - lapStartTime) * 1000;
        splits.push(lapMs);
        completeLap(lapMs);
        prevS = car.s;
        return;
      }
      nextCp++;
      sfx.checkpoint();
    }
    recAcc += dt;
    if (recAcc >= 0.05) { recAcc = 0; saveRecFrame(); }
  }
  prevS = car.s;
}

function updateGhostPlayback() {
  if (!ghostFrames || ghostFrames.length < 2 || state !== ST.RACING) return;
  const t = raceTime - lapStartTime;
  const fr = ghostFrames;
  if (t < fr[0][0] - 0.01) { ghostCar.x = fr[0][1]; ghostCar.y = fr[0][2]; ghostCar.h = fr[0][3]; return; }
  while (ghostIdx < fr.length - 2 && fr[ghostIdx + 1][0] < t) ghostIdx++;
  while (ghostIdx > 0 && fr[ghostIdx][0] > t) ghostIdx--;
  const a = fr[ghostIdx], b = fr[Math.min(ghostIdx + 1, fr.length - 1)];
  const span = Math.max(b[0] - a[0], 1e-4);
  const f = clamp((t - a[0]) / span, 0, 1);
  ghostCar.x = lerp(a[1], b[1], f);
  ghostCar.y = lerp(a[2], b[2], f);
  ghostCar.h = a[3] + angDiff(b[3], a[3]) * f;
}

let hudAcc = 0;
function updateHud(dt) {
  ui.speed.textContent = Math.round(car.speed * CFG.kmh);
  ui.boostFill.style.width = car.boostMeter.toFixed(1) + "%";
  ui.boostWrap.classList.toggle("ready", car.boostMeter >= CFG.phys.boostMinUse);
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) ui.msg.classList.remove("show"); }
  hudAcc += dt;
  if (hudAcc < 0.05) return;
  hudAcc = 0;
  if (state === ST.RACING) {
    ui.time.textContent = fmtTime(raceTime * 1000);
    ui.wrong.style.display = wrongWayTimer > 0.65 ? "block" : "none";
  } else {
    ui.wrong.style.display = "none";
    if (state === ST.FREE) ui.time.textContent = "FREE";
  }
}

const STEP = 1 / 120;
let acc = 0, lastT = performance.now(), frameCount = 0;

toMenu();

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;

  readControls(ctl);
  const control = AUTO_DRIVE ? aiDrive(car, aiCtl) : ctl;

  if (state === ST.COUNTDOWN) {
    countdownT += dt;
    const beat = Math.floor(countdownT / 0.72);
    if (beat !== countdownShown && beat <= 3) {
      countdownShown = beat;
      if (beat < 3) {
        ui.countNum.textContent = String(3 - beat);
        sfx.beep(false);
      } else {
        ui.countNum.textContent = "GO!";
        sfx.beep(true);
      }
      ui.countNum.classList.remove("pop");
      void ui.countNum.offsetWidth;
      ui.countNum.classList.add("pop");
    }
    if (beat >= 3) {
      show(ui.countOv, false);
      state = ST.RACING;
      raceTime = 0; lapStartTime = 0; prevS = car.s;
    }
    holdCtl.throttle = 0; holdCtl.brake = 0; holdCtl.steer = 0; holdCtl.hand = false; holdCtl.boost = false;
    physicsTick(STEP, holdCtl);
  } else if (state === ST.RACING || state === ST.FREE) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 8) {
      if (state === ST.RACING) raceTime += STEP;
      physicsTick(STEP, control);
      acc -= STEP; steps++;
      if (state === ST.FINISHED || state === ST.PAUSED) break;
    }
    if (steps >= 8) acc = 0;
  } else if (state === ST.MENU) {
    acc += dt;
    car.boostMeter = Math.min(100, car.boostMeter + dt * 7);
    while (acc >= STEP) { physicsTick(STEP, aiDrive(car, aiCtl)); acc -= STEP; }
  } else if (state === ST.FINISHED) {
    acc += dt;
    const coolCtl = aiDrive(car, aiCtl);
    coolCtl.throttle = Math.min(coolCtl.throttle, 0.55);
    while (acc >= STEP) { physicsTick(STEP, coolCtl); acc -= STEP; }
  }

  if (AUTO_DRIVE && (state === ST.RACING || state === ST.MENU)) {
    car.boostMeter = Math.min(100, car.boostMeter + dt * 8);
  }

  particles.update(dt, car);
  updateGhostPlayback();

  const targetZoom = clamp(1.04 - car.speed * 0.00022, 0.72, 1.04);
  cam.zoom = lerp(cam.zoom, targetZoom, 1 - Math.exp(-2.5 * dt));
  const kpos = 1 - Math.exp(-5 * dt);
  cam.x = lerp(cam.x, car.x + car.vx * 0.33, kpos);
  cam.y = lerp(cam.y, car.y + car.vy * 0.33, kpos);

  render();
  updateHud(dt);
  frameCount++;

  if (state === ST.RACING || state === ST.COUNTDOWN || state === ST.FREE) {
    const sn = clamp(car.speed / CFG.phys.maxSpeed, 0, 1.15);
    const thr = state === ST.COUNTDOWN ? 0.45 + 0.3 * Math.sin(now * 0.008) : (AUTO_DRIVE ? aiCtl.throttle : ctl.throttle);
    sfx.engine(sn, thr, car.drifting);
  } else sfx.quiet();

  mini.draw(car.x, car.y, car.h, ghostCar.x, ghostCar.y, !!(ghostFrames && state === ST.RACING));

  if (AUTO_DRIVE && state === ST.FINISHED && !window.__autoReported) {
    window.__autoReported = true;
  }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#3f7a35";
  ctx.fillRect(0, 0, W, H);

  let shx = 0, shy = 0;
  if (car.shake > 0.01) {
    shx = (Math.random() - 0.5) * car.shake * 7;
    shy = (Math.random() - 0.5) * car.shake * 7;
  }

  ctx.save();
  ctx.translate(W / 2 + shx, H / 2 + shy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  ctx.drawImage(staticC.canvas, staticC.minX, staticC.minY, staticC.canvas.width / staticC.scale, staticC.canvas.height / staticC.scale);

  const hw = W / 2 / cam.zoom + 80, hh = H / 2 / cam.zoom + 80;
  skids.draw(ctx, cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh);

  if (ghostFrames && state === ST.RACING) drawCar(ctx, ghostCar, true);
  particles.draw(ctx);
  drawCar(ctx, car, false);

  ctx.restore();

  const speedN = clamp(car.speed / CFG.phys.maxSpeed, 0, 1.3);
  if (speedN > 0.66 && (state === ST.RACING || state === ST.FREE)) {
    const inten = (speedN - 0.66) / 0.62;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.15 * inten})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + frameCount * 0.02;
      const r0 = Math.min(W, H) * 0.42;
      const r1 = r0 + 40 + ((i * 37 + frameCount * 3) % 90) * inten;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
      ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  const vig = 0.22 + speedN * 0.18;
  const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.74);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(6,10,16,${vig})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

requestAnimationFrame(loop);

window.RTT_DEBUG = { active: AUTO_DRIVE, lapTimes: [] };
window.__RTT = {
  get info() {
    return {
      state, stateName: ["MENU", "COUNTDOWN", "RACING", "PAUSED", "FINISHED", "FREE"][state],
      lap: lapCount, laps: CFG.laps, raceMs: raceTime * 1000,
      curLapMs: (raceTime - lapStartTime) * 1000,
      speedKmh: Math.round(car.speed * CFG.kmh), onRoad: car.onRoad,
      boost: Math.round(car.boostMeter), nextCp,
      sessionBestMs, lastLapMs: lastRun ? lastRun.lapMs : null,
      pbBestLap: pb ? pb.bestLap : null, pbTotal: pb ? pb.total : null,
      autoDrive: AUTO_DRIVE,
      ghostActive: !!(ghostFrames && state === ST.RACING),
      ghostN: ghostFrames ? ghostFrames.length : 0,
      ghostXY: ghostFrames ? [Math.round(ghostCar.x), Math.round(ghostCar.y)] : null,
      carXY: [Math.round(car.x), Math.round(car.y)]
    };
  },
  medals: CFG.medals,
  startRace, toMenu
};
})();
