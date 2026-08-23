// Seeded noise utilities — shared between main thread and workers (no DOM).
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const L = (a, b, t) => a + t * (b - a);

export class Noise {
  constructor(seed) {
    const rand = mulberry32(seed);
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  grad2(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x;
      case 6: return y; default: return -y;
    }
  }

  grad3(h, x, y, z) {
    const u = (h & 15) < 8 ? x : y;
    const v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14 ? x : z);
    return (((h & 1) === 0) ? u : -u) + (((h & 2) === 0) ? v : -v);
  }

  n2(x, y) {
    const p = this.p;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = F(x), v = F(y);
    const a = p[p[X] + Y], b = p[p[X + 1] + Y], c = p[p[X] + Y + 1], d = p[p[X + 1] + Y + 1];
    return L(
      L(this.grad2(a, x, y), this.grad2(b, x - 1, y), u),
      L(this.grad2(c, x, y - 1), this.grad2(d, x - 1, y - 1), u), v);
  }

  n3(x, y, z) {
    const p = this.p;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = F(x), v = F(y), w = F(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return L(
      L(L(this.grad3(p[AA], x, y, z), this.grad3(p[BA], x - 1, y, z), u),
        L(this.grad3(p[AB], x, y - 1, z), this.grad3(p[BB], x - 1, y - 1, z), u), v),
      L(L(this.grad3(p[AA + 1], x, y, z - 1), this.grad3(p[BA + 1], x - 1, y, z - 1), u),
        L(this.grad3(p[AB + 1], x, y - 1, z - 1), this.grad3(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }

  fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * this.n2(x * f, y * f); norm += a; a *= gain; f *= lac; }
    return sum / norm;
  }

  fbm3(x, y, z, oct = 3, lac = 2, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * this.n3(x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
    return sum / norm;
  }
}
