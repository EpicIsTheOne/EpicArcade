// Deterministic value-noise stack: 2D/3D value noise, fBm, ridged, domain warp.
// No dependencies; dual-export for workers + Node tests.
'use strict';
(function () {
const { hash01, lerp, smoothstep, clamp } = (() => {
  // inline minimal copies so this file is fully standalone in workers
  function hash01i(x, y, z, w) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647 + ((w || 0) | 0) * 1274126177;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  return { hash01: hash01i, lerp: (a, b, t) => a + (b - a) * t, smoothstep: (t) => t * t * (3 - 2 * t), clamp: (v, a, b) => v < a ? a : (v > b ? b : v) };
})();

function valueNoise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash01(xi, yi, 0, seed), b = hash01(xi + 1, yi, 0, seed);
  const c = hash01(xi, yi + 1, 0, seed), d = hash01(xi + 1, yi + 1, 0, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v); // 0..1
}

function valueNoise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smoothstep(xf), v = smoothstep(yf), w = smoothstep(zf);
  const n = (i, j, k) => hash01(xi + i, yi + j, zi + k, seed);
  return lerp(
    lerp(lerp(n(0, 0, 0), n(1, 0, 0), u), lerp(n(0, 1, 0), n(1, 1, 0), u), v),
    lerp(lerp(n(0, 0, 1), n(1, 0, 1), u), lerp(n(0, 1, 1), n(1, 1, 1), u), v), w); // 0..1
}

/** Fractal Brownian motion over value noise, output 0..1 */
function fbm2(x, y, seed, octaves, lacunarity, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + o * 101);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

function fbm3(x, y, z, seed, octaves, lacunarity, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3(x * freq, y * freq, seed + o * 101);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal 0..1 (sharp crests) */
function ridged2(x, y, seed, octaves) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(2 * valueNoise2(x * freq, y * freq, seed + o * 131) - 1);
    sum += amp * n * n; norm += amp; amp *= 0.5; freq *= 2.07;
  }
  return sum / norm;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { valueNoise2, valueNoise3, fbm2, fbm3, ridged2 };
}
if (typeof self !== 'undefined') self.NOISE_MOD = { valueNoise2, valueNoise3, fbm2, fbm3, ridged2 };
})();
