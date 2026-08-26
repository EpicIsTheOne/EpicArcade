// CHROME HARBOR — shared math / rng / misc helpers
export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smooth(t) { return t * t * (3 - 2 * t); }
export function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); } // framerate-independent lerp
export function moveTowards(a, b, maxDelta) {
  const d = b - a;
  return Math.abs(d) <= maxDelta ? b : a + Math.sign(d) * maxDelta;
}
export function wrapAngle(a) { // wrap to [-PI, PI]
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function angleDamp(cur, target, k, dt) {
  return cur + wrapAngle(target - cur) * (1 - Math.exp(-k * dt));
}
export function dist2d(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.hypot(dx, dz); }

// ---- seeded RNG (mulberry32) ----
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class RNG {
  constructor(seed) { this.f = mulberry32(typeof seed === 'string' ? hashStr(seed) : seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); } // inclusive
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
}

// tiny event bus
export class Emitter {
  constructor() { this.m = new Map(); }
  on(ev, fn) { (this.m.get(ev) || this.m.set(ev, []).get(ev)).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this.m.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, ...args) { const a = this.m.get(ev); if (a) for (const fn of a.slice()) fn(...args); }
}

// spatial hash grid for static AABB colliders (xz plane)
export class ColliderGrid {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); this.all = []; }
  key(cx, cz) { return cx * 100000 + cz; }
  insert(box) { // box: {x0,z0,x1,z1,h, kind}
    this.all.push(box);
    const c = this.cell;
    for (let cx = Math.floor(box.x0 / c); cx <= Math.floor(box.x1 / c); cx++)
      for (let cz = Math.floor(box.z0 / c); cz <= Math.floor(box.z1 / c); cz++) {
        const k = this.key(cx, cz);
        let a = this.map.get(k); if (!a) this.map.set(k, a = []);
        a.push(box);
      }
  }
  query(x, z, r, out) { // boxes overlapping square [x-r,x+r]
    out.length = 0;
    const c = this.cell;
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++)
      for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) {
        const a = this.map.get(this.key(cx, cz));
        if (a) for (const b of a) if (!out.includes(b)) out.push(b);
      }
    return out;
  }
}

// circle vs AABB push-out in xz. Returns true if collided. mutates p{x,z}
export function resolveCircleAABB(p, r, box) {
  const cx = clamp(p.x, box.x0, box.x1), cz = clamp(p.z, box.z0, box.z1);
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2), push = (r - d) / d;
    p.x += dx * push; p.z += dz * push;
  } else { // center inside: push out along min axis
    const l = p.x - box.x0, rr = box.x1 - p.x, t = p.z - box.z0, bb = box.z1 - p.z;
    const m = Math.min(l, rr, t, bb);
    if (m === l) p.x = box.x0 - r; else if (m === rr) p.x = box.x1 + r;
    else if (m === t) p.z = box.z0 - r; else p.z = box.z1 + r;
  }
  return true;
}

// ray vs AABB in 3D-ish (y checked against height). returns hit distance or Infinity
export function raySlab2D(ox, oz, dx, dz, box, oy, h) {
  if (oy !== undefined && h !== undefined && oy > h) return Infinity; // flies over
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < box.x0 || ox > box.x1) return Infinity; }
  else {
    let t1 = (box.x0 - ox) / dx, t2 = (box.x1 - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-9) { if (oz < box.z0 || oz > box.z1) return Infinity; }
  else {
    let t1 = (box.z0 - oz) / dz, t2 = (box.z1 - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (tmax < Math.max(tmin, 0)) return Infinity;
  return Math.max(tmin, 0);
}

export function fmtMoney(n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  return (neg ? '-$' : '$') + n.toLocaleString('en-US');
}

export function el(id) { return document.getElementById(id); }
