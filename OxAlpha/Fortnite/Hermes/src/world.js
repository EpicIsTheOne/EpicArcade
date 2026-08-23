// Original ISLEBREAK island: "Kestrel Isle". Deterministic from seed.
import { makeFbm2D } from './rng.js';

export const WORLD = {
  size: 2000,          // meters square
  half: 1000,
  waterLevel: 0,
  maxH: 90,
};

// Named locations (original identity)
export const POIS = [
  { key: 'harbor',      name: 'Rust Harbor',      x: -620, z: -520, r: 150, kind: 'town' },
  { key: 'spire',       name: 'Spire Point',      x:  480, z: -600, r: 120, kind: 'landmark' },
  { key: 'crossroads',  name: 'Amber Crossroads', x:  -80, z:  -80, r: 190, kind: 'town' },
  { key: 'camp',        name: 'Pinecrest Camp',   x:  620, z:  240, r: 130, kind: 'camp' },
  { key: 'quarry',      name: 'Grey Quarry',      x: -640, z:  420, r: 120, kind: 'industrial' },
  { key: 'observatory', name: 'Halo Observatory', x:  700, z:  700, r: 110, kind: 'landmark' },
  { key: 'airstrip',    name: 'Vane Airstrip',    x:  -60, z:  640, r: 170, kind: 'military' },
  { key: 'lighthouse',  name: 'Ember Light',      x:  840, z: -140, r:  90, kind: 'landmark' },
];

function falloff(t, a, b) {
  if (t <= a) return 1;
  if (t >= b) return 0;
  const u = (t - a) / (b - a);
  return 1 - u * u * (3 - 2 * u);
}

export class Island {
  constructor(seed = 1337) {
    this.seed = seed;
    this.base = makeFbm2D(seed, 5);
    this.detail = makeFbm2D(seed + 77, 4);
    this.ridge = makeFbm2D(seed + 911, 4);
    this.forestNoise = makeFbm2D(seed + 424, 3);
    // flatten pads under POIs so buildings sit naturally
    this.pads = POIS.map(p => ({ x: p.x, z: p.z, r: p.r * 0.9, h: this._raw(p.x, p.z) }));
  }

  _raw(x, z) {
    const nx = x * 0.0016, nz = z * 0.0016;
    let h = this.base(nx, nz) * 34 + this.detail(nx * 4.1, nz * 4.1) * 7;
    // central ridge spine (NE-SW)
    const ridge = 1 - Math.abs(this.ridge(nx * 0.8 + 3.7, nz * 0.8 - 1.2));
    h += Math.pow(Math.max(0, ridge), 2.2) * 52;
    const d = Math.hypot(x, z) / WORLD.half;
    const edge = falloff(d, 0.62, 1.0);
    h = h * edge - (1 - edge) * 26;
    return h;
  }

  height(x, z) {
    let h = this._raw(x, z);
    for (const pad of this.pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d < pad.r) {
        const t = falloff(d / pad.r, 0, 1);
        h = h * (1 - t) + pad.h * t;
      }
    }
    return h;
  }

  // forest density mask ~[-1, 1]
  forest(x, z) {
    return this.forestNoise(x * 0.006, z * 0.006);
  }
}
