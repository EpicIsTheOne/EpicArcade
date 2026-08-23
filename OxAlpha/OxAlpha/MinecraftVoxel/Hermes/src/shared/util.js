// Shared deterministic RNG + math helpers (used by main thread, workers, tests)
'use strict';
(function () {
/** xmur3 string hash -> 32-bit seed */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32 PRNG - fast, decent quality, fully deterministic */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded RNG from a string seed */
function rngFromSeed(seedStr) {
  const s = xmur3(String(seedStr));
  return mulberry32(s());
}

/** Hash arbitrary ints -> [0,1). Deterministic across sessions. */
function hash01(x, y, z, w) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647 + ((w || 0) | 0) * 1274126177;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const mod = (n, m) => ((n % m) + m) % m;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { xmur3, mulberry32, rngFromSeed, hash01, clamp, lerp, smoothstep, mod };
}
if (typeof self !== 'undefined') self.UTIL_MOD = { xmur3, mulberry32, rngFromSeed, hash01, clamp, lerp, smoothstep, mod };
})();
