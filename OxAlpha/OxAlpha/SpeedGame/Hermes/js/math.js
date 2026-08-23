/* ============================================================
   VOLT RUSH — math.js
   Spline & vector utilities (no deps; dual-export for Node QA)
   ============================================================ */
  (function (root, factory) {
    const api = factory();
    root.VoltMath = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
  })(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

  // Shortest signed angular difference a->b in radians
  function angDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  const angLerp = (a, b, t) => a + angDiff(a, b) * clamp(t, 0, 1);

  /* ---------- Catmull-Rom spline through Vector3-like points ----------
     Works on plain {x,y,z} or THREE.Vector3. getPointAt uses arc-length
     reparameterization so constant-u motion = constant speed along rail. */
  class CatmullRom3 {
    constructor(pts, closed = false, tension = 0.5) {
      this.p = pts.map(p => ({ x: p.x, y: p.y, z: p.z }));
      this.closed = !!closed;
      this.tension = tension;
      this._cacheLen = null;
      this._cachePts = null;
      this._ensureTable();   // eager: totalLength must exist immediately (rails sample it in ctors)
    }

    _pt(i) {
      const n = this.p.length;
      if (this.closed) return this.p[((i % n) + n) % n];
      return this.p[clamp(i, 0, n - 1)];
    }

    // raw curve position, u in [0,1] across whole spline (non-uniform)
    getPointRaw(u) {
      u = clamp(u, 0, 1);
      const n = this.p.length;
      const segCount = this.closed ? n : n - 1;
      let f = u * segCount;
      let i = Math.min(Math.floor(f), segCount - 1);
      let t = f - i;

      const p0 = this._pt(i - 1), p1 = this._pt(i), p2 = this._pt(i + 1), p3 = this._pt(i + 2);
      const s = this.tension;
      // Centripetal-ish standard CR with uniform knots
      const t2 = t * t, t3 = t2 * t;
      const out = { x: 0, y: 0, z: 0 };
      for (const k of ['x', 'y', 'z']) {
        const m1 = s * (p2[k] - p0[k]);
        const m2 = s * (p3[k] - p1[k]);
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t,
              h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        out[k] = h00 * p1[k] + h10 * m1 + h01 * p2[k] + h11 * m2;
      }
      return out;
    }

    // Build arc-length table once
    _ensureTable() {
      if (this._cachePts) return;
      const N = 400; // samples
      const pts = new Float64Array((N + 1) * 4); // x,y,z,cumlen
      let cum = 0;
      let prev = this.getPointRaw(0);
      pts[0] = prev.x; pts[1] = prev.y; pts[2] = prev.z; pts[3] = 0;
      for (let i = 1; i <= N; i++) {
        const q = this.getPointRaw(i / N);
        cum += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
        pts[i * 4] = q.x; pts[i * 4 + 1] = q.y; pts[i * 4 + 2] = q.z; pts[i * 4 + 3] = cum;
        prev = q;
      }
      this.totalLength = cum;
      this._cachePts = pts;
      this._cacheN = N;
    }

    // arc-length parameterized point; s in [0,totalLength]
    getPointAt(s, out) {
      this._ensureTable();
      s = clamp(s, 0, this.totalLength - 1e-6);
      const pts = this._cachePts, N = this._cacheN;
      // binary search cumulative length
      let lo = 0, hi = N;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid * 4 + 3] < s) lo = mid + 1; else hi = mid;
      }
      const i = Math.max(1, lo);
      const l0 = pts[(i - 1) * 4 + 3], l1 = pts[i * 4 + 3];
      const t = (l1 - l0) > 1e-9 ? (s - l0) / (l1 - l0) : 0;
      const o = out || {};
      o.x = pts[(i - 1) * 4] * (1 - t) + pts[i * 4] * t;
      o.y = pts[(i - 1) * 4 + 1] * (1 - t) + pts[i * 4 + 1] * t;
      o.z = pts[(i - 1) * 4 + 2] * (1 - t) + pts[i * 4 + 2] * t;
      return o;
    }

    getTangentAt(s, out) {
      const e = 0.8; // meters ahead
      const a = this.getPointAt(Math.max(0, s - e));
      const b = this.getPointAt(Math.min(this.totalLength - 1e-6, s + e));
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const L = Math.hypot(dx, dy, dz) || 1;
      const o = out || {};
      o.x = dx / L; o.y = dy / L; o.z = dz / L;
      return o;
    }
  }

  /* ---------- Simple deterministic PRNG (mulberry32) ---------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 2D value noise + fbm (terrain scatter etc.) ---------- */
  function makeNoise2D(seed) {
    const rng = makeRng(seed);
    const perm = new Uint8Array(512);
    const base = [];
    for (let i = 0; i < 256; i++) base.push(i);
    for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = base[i]; base[i] = base[j]; base[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    function g(ix, iy, x, y) {
      const idx = perm[(ix + perm[iy & 255]) & 255] & 7;
      const gx = grad[idx][0], gy = grad[idx][1];
      return gx * x + gy * y;
    }
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const u = fade(fx), v = fade(fy);
      const n00 = g(ix, iy, fx, fy), n10 = g(ix + 1, iy, fx - 1, fy);
      const n01 = g(ix, iy + 1, fx, fy - 1), n11 = g(ix + 1, iy + 1, fx - 1, fy - 1);
      const nx0 = lerp(n00, n10, u), nx1 = lerp(n01, n11, u);
      return lerp(nx0, nx1, v); // ~[-1,1]
    };
  }
  function fbm(noiseFn, x, y, octaves = 4, lac = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noiseFn(x * freq, y * freq) * amp;
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  }

  return { clamp, lerp, smoothstep, damp, angDiff, angLerp, CatmullRom3, makeRng, makeNoise2D, fbm };
});
