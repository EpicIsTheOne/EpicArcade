// Deterministic seeded RNG (mulberry32) + hash noise. Dual-export for Node QA.
(function (root) {
  function RNG(seed) {
    this.s = seed >>> 0;
  }
  RNG.prototype.next = function () {
    var t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  // stable hash for position-keyed decisions (biome layout etc.)
  function hash2(x, y, seed) {
    var h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  var api = { RNG: RNG, hash2: hash2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RngLib = api;
})(typeof window !== 'undefined' ? window : globalThis);
