// ============================================================
// NEON MERIDIAN — core/utils.js
// Seeded RNG, math helpers, geometry merge utility.
// ============================================================
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function damp(current, target, lambda, dt) { return lerp(current, target, 1 - Math.exp(-lambda * dt)); }
function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

function angleDelta(a, b) {
  // shortest signed delta from a to b, in [-PI, PI]
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Merge an array of BufferGeometries (indexed or non-indexed). */
function mergeGeometries(geoms) {
  if (!geoms.length) return null;
  let vCount = 0, iCount = 0;
  const hasColor = !!(geoms[0].attributes.color);
  const hasUV = !!geoms[0].attributes.uv;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = hasUV ? new Float32Array(vCount * 2) : null;
  const col = hasColor ? new Float32Array(vCount * 3) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (uv) uv.set(g.attributes.uv.array, vo * 2);
    if (col) col.set(g.attributes.color.array, vo * 3);
    const n = g.attributes.position.count;
    if (g.index) {
      const gi = g.index.array;
      for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      io += gi.length;
    } else {
      for (let k = 0; k < n; k++) idx[io + k] = vo + k;
      io += n;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** Axis-aligned bounding box in XZ with height. */
class Collider {
  constructor(x0, z0, x1, z1, opts) {
    this.x0 = x0; this.z0 = z0; this.x1 = x1; this.z1 = z1;
    this.h = (opts && opts.h) || 3;
    this.solid = !(opts && opts.solid === false);
    this.kind = (opts && opts.kind) || 'building';
  }
  contains(x, z, pad) {
    return x >= this.x0 - pad && x <= this.x1 + pad && z >= this.z0 - pad && z <= this.z1 + pad;
  }
}
