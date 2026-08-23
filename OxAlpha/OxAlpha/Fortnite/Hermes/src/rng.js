// Deterministic PRNG (mulberry32) + value noise + fbm. No deps.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  fork() { return new Rng((this.next() * 4294967296) >>> 0); }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 0.999999)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// --- Value noise with smooth interpolation ---
export function makeNoise2D(seed) {
  const perm = new Uint8Array(512);
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grads = new Float32Array(256 * 2);
  for (let i = 0; i < 256; i++) {
    const ang = r() * Math.PI * 2;
    grads[i * 2] = Math.cos(ang); grads[i * 2 + 1] = Math.sin(ang);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const g = (ix, iy, fx, fy) => {
    const h = perm[(perm[ix & 255] + (iy & 255)) & 255] * 2;
    return grads[h] * fx + grads[h + 1] * fy;
  };
  return function noise2D(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fade(fx), v = fade(fy);
    const n00 = g(ix, iy, fx, fy);
    const n10 = g(ix + 1, iy, fx - 1, fy);
    const n01 = g(ix, iy + 1, fx, fy - 1);
    const n11 = g(ix + 1, iy + 1, fx - 1, fy - 1);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v; // ~[-1,1]
  };
}

export function makeFbm2D(seed, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  const n2d = makeNoise2D(seed);
  return function fbm(x, y) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += n2d(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
