// math + misc helpers
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
// framerate-independent exponential damping
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(randRange(a, b + 1));
export const choice = arr => arr[(Math.random() * arr.length) | 0];
export const pick = (arr, weights) => {
  let sum = 0; for (const w of weights) sum += w;
  let r = Math.random() * sum;
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInCubic = t => t * t * t;
export const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function fmt(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function fmtDist(m) {
  return m >= 1000 ? (m / 1000).toFixed(2) + 'km' : Math.floor(m) + 'm';
}

// AABB overlap: boxes as {x,y,z,hw,hh,hd} center-half sizes
export function overlap(a, b) {
  return Math.abs(a.x - b.x) < a.hw + b.hw &&
         Math.abs(a.y - b.y) < a.hh + b.hh &&
         Math.abs(a.z - b.z) < a.hd + b.hd;
}

export function now() { return performance.now() / 1000; }
