import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function damp(cur, target, lambda, dt) {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
export function rand(rng, a, b) { return a + rng() * (b - a); }
export function randInt(rng, a, b) { return Math.floor(rand(rng, a, b + 1)); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function weightedPick(rng, entries) {
  let total = 0;
  for (const e of entries) total += e.w;
  let r = rng() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.v; }
  return entries[entries.length - 1].v;
}

export function makeNoise2D(seed) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grads = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  function g(ix, iz, x, z) {
    const gr = grads[perm[(ix + perm[iz & 255]) & 255] & 7];
    return gr[0] * x + gr[1] * z;
  }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  return function noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fade(fx), v = fade(fz);
    const n00 = g(ix, iz, fx, fz);
    const n10 = g(ix + 1, iz, fx - 1, fz);
    const n01 = g(ix, iz + 1, fx, fz - 1);
    const n11 = g(ix + 1, iz + 1, fx - 1, fz - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 0.7071;
  };
}

export function makeFbm(noise) {
  return function fbm(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, z * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  };
}

export class SpatialHash {
  constructor(cell = 8) {
    this.cell = cell;
    this.map = new Map();
  }
  key(cx, cz) { return cx + ',' + cz; }
  add(obj, x, z, r) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    const cells = [];
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this.key(cx, cz);
      let bucket = this.map.get(k);
      if (!bucket) { bucket = new Set(); this.map.set(k, bucket); }
      bucket.add(obj);
      cells.push(k);
    }
    obj._hashCells = cells;
  }
  remove(obj) {
    if (!obj._hashCells) return;
    for (const k of obj._hashCells) {
      const b = this.map.get(k);
      if (b) { b.delete(obj); if (b.size === 0) this.map.delete(k); }
    }
    obj._hashCells = null;
  }
  move(obj, x, z, r) {
    this.remove(obj);
    this.add(obj, x, z, r);
  }
  query(x, z, r, out = []) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    out.length = 0;
    const seen = new Set();
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const b = this.map.get(this.key(cx, cz));
      if (!b) continue;
      for (const o of b) {
        if (!seen.has(o)) { seen.add(o); out.push(o); }
      }
    }
    return out;
  }
}

export function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ox : i === 1 ? oy : oz;
    const d = i === 0 ? dx : i === 1 ? dy : dz;
    const lo = min.getComponent(i), hi = max.getComponent(i);
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmax < 0 ? null : Math.max(tmin, 0.0001);
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  return t < 0 ? Math.max(tca + thc, 0.0001) : Math.max(t, 0.0001);
}

export function rayCylinderXZ(ox, oy, oz, dx, dy, dz, cx, cz, r, yBase, yTop) {
  const mx = ox - cx, mz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) {
    if (mx * mx + mz * mz > r * r) return null;
    let t = -Infinity;
    if (dy < 0 && oy > yTop) t = (yTop - oy) / dy;
    else if (dy > 0 && oy < yBase) t = (yBase - oy) / dy;
    return t >= 0 ? t : 0.0001;
  }
  const b = 2 * (mx * dx + mz * dz);
  const c = mx * mx + mz * mz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  const hy = oy + dy * t;
  if (hy < yBase || hy > yTop) return null;
  return t;
}

export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
