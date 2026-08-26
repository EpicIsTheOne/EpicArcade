import * as THREE from 'three';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent exponential damping toward target.
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const dampV3 = (cur, target, rate, dt, out) =>
  out.copy(cur).lerp(target, 1 - Math.exp(-rate * dt));

const _q = new THREE.Quaternion();
const _t = new THREE.Vector3();
// Rotate vector `v` around axis by angle, writing into `out` (v may equal out).
export function rotateAxis(v, axis, angle, out) {
  _q.setFromAxisAngle(axis, angle);
  return out.copy(v).applyQuaternion(_q);
}
// Signed angle from a to b around axis (both assumed normalized & planar-ish)
export function signedAngle(a, b, axis) {
  return Math.atan2(_t.crossVectors(a, b).dot(axis), a.dot(b));
}
export function rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); }
export function randSign() { return Math.random() < 0.5 ? -1 : 1; }

// Deterministic mulberry32 RNG for level decor.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise in 2D (integer lattice hash), for procedural textures.
export function noise2(x, y, seed = 0) {
  let h = (Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(y), 668265263) ^ Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  // single-cell gradient approximation: cheap blotchy noise is fine for textures
  return r * (sx * sy) + r * 0.5 * (1 - sx * sy) + (r > 0 ? 1 : -1) * 0.0;
}
export function fbm2(x, y, oct = 4, seed = 0) {
  let v = 0, amp = 0.55, f = 1;
  for (let i = 0; i < oct; i++) { v += noise2(x * f, y * f, seed + i * 101) * amp; amp *= 0.5; f *= 2.03; }
  return clamp(v * 0.5 + 0.5, 0, 1);
}

// Format seconds as m:ss.mmm
export function fmtTime(t) {
  if (t == null || !isFinite(t)) return '--:--';
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
