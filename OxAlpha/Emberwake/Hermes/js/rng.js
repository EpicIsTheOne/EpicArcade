/* Emberwake — rng.js
 * Deterministic RNG + value noise + fBm. No dependencies.
 * Dual-export: browser global `window.EmberRNG`, Node `module.exports`.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EmberRNG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // xmur3 string hash -> seed
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  // mulberry32 PRNG — returns function() -> [0,1)
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const s = typeof seed === 'string' ? hashSeed(seed) : (seed >>> 0 || 1);
    const f = mulberry32(s);
    f.range = (a, b) => a + f() * (b - a);
    f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  }

  // ---- value noise (2D), smooth-interpolated from hashed lattice ----
  function makeNoise2D(seed) {
    const perm = new Uint8Array(512);
    const rng = mulberry32(typeof seed === 'string' ? hashSeed(seed) : (seed >>> 0 || 1));
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    function grad(hash, x, y) {
      switch (hash & 7) {
        case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
        case 4: return x; case 5: return -x; case 6: return y; default: return -y;
      }
    }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    return function noise2D(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
      const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
      const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
      return (x1 + v * (x2 - x1)) * 0.5; // roughly [-1,1]
    };
  }

  function makeFbm(seed, octaves) {
    const n = makeNoise2D(seed);
    octaves = octaves || 4;
    return function fbm(x, y) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += n(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5; freq *= 2.03;
      }
      return sum / norm;
    };
  }

  return { hashSeed, mulberry32, makeRng, makeNoise2D, makeFbm };
});
