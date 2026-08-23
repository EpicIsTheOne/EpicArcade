// World generation worker: biomes, terrain, caves, ores, trees, structures.
// Runs in a Worker (browser) or via require (headless Node tests).
'use strict';
(function () {
if (typeof importScripts === 'function') {
  // Browser worker path (classic worker has no require)
  importScripts(
    'http://127.0.0.1:8477/src/shared/util.js', 'http://127.0.0.1:8477/src/shared/noise.js',
    'http://127.0.0.1:8477/src/shared/blocks.js', 'http://127.0.0.1:8477/src/shared/atlas_meta.js'
  );
}
const G = (typeof self !== 'undefined') ? self : globalThis;
const REQ = (p) => {
  const map = {
    '../shared/util.js': G.UTIL_MOD, './util.js': G.UTIL_MOD,
    '../shared/noise.js': G.NOISE_MOD, './noise.js': G.NOISE_MOD,
    '../shared/blocks.js': G.BLOCKS_MOD, './blocks.js': G.BLOCKS_MOD,
    '../shared/atlas_meta.js': G.TILE_META,
  };
  if (typeof require !== 'undefined') { try { return require(p); } catch (e) { void e; } }
  if (map[p]) return map[p];
  throw new Error('module not available in this context: ' + p);
};
const { rngFromSeed } = REQ('../shared/util.js');
const N = REQ('../shared/noise.js');
const { B } = REQ('../shared/blocks.js');

const CS = 16;          // chunk size (x,z)
const WH = 128;         // world height
const SEA = 45;

// ---- biome table ----
// temp/humid in 0..1. id order must match BIOMES array index.
const BIOMES = [
  { id: 0, name: 'plains',   top: B.GRASS, fill: B.DIRT, trees: 0.003, grass: 0.06, flowers: 0.008 },
  { id: 1, name: 'forest',   top: B.GRASS, fill: B.DIRT, trees: 0.028, grass: 0.10, flowers: 0.006 },
  { id: 2, name: 'desert',   top: B.SAND,  fill: B.SAND, trees: 0.0008, grass: 0, flowers: 0 },
  { id: 3, name: 'windswept_hills', top: B.GRASS, fill: B.DIRT, trees: 0.004, grass: 0.03, flowers: 0.002 },
  { id: 4, name: 'snowy_peaks', top: B.SNOW_GRASS, fill: B.DIRT, trees: 0.001, grass: 0, flowers: 0 },
  { id: 5, name: 'taiga',    top: B.GRASS, fill: B.DIRT, trees: 0.02, grass: 0.05, flowers: 0.002 },
  { id: 6, name: 'beach',    top: B.SAND,  fill: B.SAND, trees: 0, grass: 0, flowers: 0 },
];

function biomeFor(t, h) {
  // t: temperature, h: humidity
  if (t < 0.30) return 4;            // snowy peaks (cold)
  if (t < 0.42) return h > 0.35 ? 5 : 3; // taiga or hills
  if (t > 0.76 && h < 0.40) return 2;    // desert
  if (h > 0.55) return 1;            // forest
  return 0;                          // plains
}

// ---- generation context per seed ----
function makeGen(seedStr) {
  const seedNum = (() => { let h = 2166136261; for (const c of String(seedStr)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; })();
  const S = seedNum & 0x7fffffff;
  const gen = {
    seedStr: String(seedStr),
    heightCache: new Map(),
    biomeCache: new Map(),
  };
  const cachePut = (map, k, v) => { if (map.size > 40000) map.clear(); map.set(k, v); return v; };

  function columnInfo(wx, wz) {
    const key = wx + ',' + wz;
    const hitC = gen.biomeCache.get(key);
    if (hitC !== undefined) {
      const hitH = gen.heightCache.get(key);
      if (hitH !== undefined) return hitH;
    }
    const cont = N.fbm2(wx * 0.0022, wz * 0.0022, S + 11, 4, 2.0, 0.5);          // continents
    const ero = N.fbm2(wx * 0.0011, wz * 0.0011, S + 23, 3, 2.0, 0.5);           // erosion / mountain mask
    const hillN = N.fbm2(wx * 0.010, wz * 0.010, S + 37, 4, 2.1, 0.5);           // hills
    const detail = N.fbm2(wx * 0.05, wz * 0.05, S + 53, 2, 2.0, 0.5);            // roughness
    const temp = clamp01(N.fbm2(wx * 0.0024, wz * 0.0024, S + 71, 3, 2.0, 0.5) * 1.25 - 0.12);
    const humid = clamp01(N.fbm2((wx + 900) * 0.0028, (wz - 700) * 0.0028, S + 89, 3, 2.0, 0.5) * 1.2 - 0.1);

    let height;
    const mountainMask = smooth01((ero - 0.52) * 3.2);
    const ridge = N.ridged2(wx * 0.004, wz * 0.004, S + 97, 4);
    const base = 34 + cont * 26;                       // ~34..60
    height = base + hillN * 14 + detail * 4;
    height += mountainMask * ridge * 62;               // mountains up to ~120
    // ocean carving
    const oceanN = N.fbm2(wx * 0.003, wz * 0.003, S + 131, 3, 2.0, 0.5);
    const ocean = smooth01((0.34 - cont) * 4);
    height = height * (1 - ocean) + lerpN(20, 38, oceanN) * ocean;
    height |= 0;

    const riverN = N.fbm2(wx * 0.0035, wz * 0.0035, S + 151, 2, 2.0, 0.5);
    const rDist = Math.abs(riverN - 0.5);
    const riverW = 0.012 + mountainMask * 0.004;
    let riverCarve = 0;
    if (rDist < riverW && height > SEA - 8) {
      const t2 = rDist / riverW;
      const depth = (1 - t2 * t2);
      riverCarve = Math.round(depth * 10);
      height -= riverCarve;
      if (height < SEA - 1) height = SEA - 1 - Math.floor(depth * 2);
    }

    const bId = biomeFor(temp, humid);
    const info = { wx, wz, height, biome: bId, temp, humid, river: rDist < riverW * 2 };
    cachePut(gen.heightCache, key, info);
    cachePut(gen.biomeCache, key, info);
    return info;
  }

  function caveAt(x, y, z) {
    if (y < 5 || y > 100) return false;
    const w1 = N.valueNoise3(x * 0.02, y * 0.04, z * 0.02, S + 211);
    const w2 = N.valueNoise3(x * 0.02, y * 0.04, z * 0.02, S + 223);
    const a = Math.abs(w1 - 0.5), b2 = Math.abs(w2 - 0.0);
    const tunnel = a < 0.045 && b2 < 0.16;
    const cheese = N.fbm3(x * 0.015, y * 0.03, z * 0.015, S + 241, 2, 2.2, 0.5) > 0.74 && y < 50;
    return tunnel || cheese;
  }

  function oreAt(x, y, z, r) {
    const rnd = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (S * 2654435761)) >>> 0;
    const v = rnd / 4294967296;
    if (y < 16 && v < 0.0011) return B.DIAMOND_ORE;
    if (y < 24 && v >= 0.0011 && v < 0.0042) return B.REDSTONE_ORE;
    if (y < 34 && v >= 0.0042 && v < 0.010) return B.GOLD_ORE;
    if (y < 56 && v >= 0.010 && v < 0.026) return B.IRON_ORE;
    if (v >= 0.026 && v < 0.055) return B.COAL_ORE;
    return 0;
  }

  gen.columnInfo = columnInfo;
  gen.caveAt = caveAt;
  gen.oreAt = oreAt;
  gen.S = S;
  return gen;
}

function lerpN(a, b, t) { return a + (b - a) * t; }
function smooth01(t) { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

/** Generate one chunk into out (Uint8Array CS*CS*WH). */
function generateChunk(seedStr, cx, cz, out) {
  const gen = makeGen(seedStr);
  const idxOf = (x, y, z) => x + z * CS + y * CS * CS;
  for (let lz = 0; lz < CS; lz++) {
    for (let lx = 0; lx < CS; lx++) {
      const wx = cx * CS + lx, wz = cz * CS + lz;
      const col = gen.columnInfo(wx, wz);
      const H = col.height;
      const bio = BIOMES[col.biome];
      const beach = H <= SEA + 2 && H >= SEA - 2 && col.biome !== 4;
      for (let y = 0; y <= Math.max(H, SEA); y++) {
        let block = B.AIR;
        if (y === 0) block = B.BEDROCK;
        else if (y < 3 && ((wx & 1) ^ (wz & 1) ^ y) === 0) block = B.BEDROCK;
        else if (y <= H) {
          const depth = H - y;
          const underWater = H < SEA;
          if (depth === 0) {
            if (underWater) block = (col.temp > 0.5 ? B.SAND : B.GRAVEL);
            else if (beach || col.biome === 2) block = B.SAND;
            else if (col.biome === 4) block = B.SNOW_GRASS;
            else block = bio.top;
          } else if (depth < 4) {
            block = (col.biome === 2 || beach || underWater) ? (col.biome === 2 ? B.SAND : (underWater && col.temp > 0.5 ? B.SAND : B.DIRT)) : bio.fill;
          } else {
            block = B.STONE;
          }
          if (block === B.STONE) {
            const ore = gen.oreAt(wx, y, wz, col);
            if (ore) block = ore;
          }
          // caves carve after solid assignment
          if (block !== B.BEDROCK && gen.caveAt(wx, y, wz)) {
            block = (y < 11 ? B.LAVA : B.AIR);
          }
        } else if (y <= SEA) {
          block = (col.biome === 4 && y === SEA && H < SEA) ? B.ICE : B.WATER;
        }
        if (block !== B.AIR) out[idxOf(lx, y, lz)] = block;
      }
      // surface decoration below tree line
      if (H > SEA && !gen.caveAt(wx, H, wz)) {
        const surf = out[idxOf(lx, H, lz)];
        const r = rngFromSeed('dec:' + gen.seedStr + ':' + wx + ':' + wz);
        if (surf === bio.top || surf === B.SAND) {
          if (bio.grass && surf === B.GRASS && r() < bio.grass) out[idxOf(lx, H + 1, lz)] = B.TALLGRASS;
          else if (bio.flowers && surf === B.GRASS && r() < bio.flowers) out[idxOf(lx, H + 1, lz)] = r() < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW;
        }
        // cactus in desert
        if (col.biome === 2 && r() < 0.004 && out[idxOf(lx, H, lz)] === B.SAND && H > SEA + 1) {
          const ch = 1 + Math.floor(r() * 3);
          for (let i = 1; i <= ch; i++) out[idxOf(lx, H + i, lz)] = B.CACTUS;
        }
      }
    }
  }
  decorateStructures(seedStr, cx, cz, out);
  return out;
}

/** Trees + rare structures. Writes into this chunk only; samples neighbor columns. */
function decorateStructures(seedStr, cx, cz, out) {
  const gen = makeGen(seedStr);
  const idxOf = (x, y, z) => x + z * CS + y * CS * CS;
  const setLocal = (lx, y, lz, id, force) => {
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= WH) return;
    const i = idxOf(lx, y, lz);
    if (force || out[i] === B.AIR || out[i] === B.TALLGRASS || out[i] === B.FLOWER_RED || out[i] === B.FLOWER_YELLOW || out[i] === B.LEAVES) out[i] = id;
  };

  for (let dz = -3; dz <= 18; dz++) {
    for (let dx = -3; dx <= 18; dx++) {
      const wx = cx * CS + dx, wz = cz * CS + dz;
      const col = gen.columnInfo(wx, wz);
      if (col.height <= SEA || col.height > 108 || col.river) continue;
      const bio = BIOMES[col.biome];
      const r = rngFromSeed('tree:' + gen.seedStr + ':' + wx + ':' + wz);
      if (r() >= bio.trees) continue;
      // avoid caves cutting the trunk base
      if (gen.caveAt(wx, col.height, wz)) continue;
      const groundY = col.height + 1;
      const isSpruce = col.biome === 5 || (col.biome === 3 && col.temp < 0.45);
      const isBirch = col.biome === 1 && r() < 0.25;
      const logB = isSpruce ? B.SPRUCE_LOG : (isBirch ? B.BIRCH_LOG : B.LOG);
      const leafB = isSpruce ? B.SPRUCE_LEAVES : (isBirch ? B.BIRCH_LEAVES : B.LEAVES);

      if (!isSpruce) {
        // oak / birch blob tree
        const th = 4 + Math.floor(r() * 3);
        for (let i = 0; i < th; i++) setLocal(dx, groundY + i, dz, logB, true);
        const cy = groundY + th - 1;
        for (let oy = -2; oy <= 1; oy++) {
          const rad = oy <= -1 ? 2 : 1;
          for (let ox = -rad; ox <= rad; ox++) for (let oz = -rad; oz <= rad; oz++) {
            if (Math.abs(ox) === rad && Math.abs(oz) === rad && (oy > -1 || r() < 0.5)) continue;
            setLocal(dx + ox, cy + oy + 1, dz + oz, leafB, false);
          }
        }
      } else {
        // spruce cone
        const th = 6 + Math.floor(r() * 4);
        for (let i = 0; i < th; i++) setLocal(dx, groundY + i, dz, logB, true);
        let rad = 2;
        for (let oy = th - 1; oy >= 2; oy--) {
          for (let ox = -rad; ox <= rad; ox++) for (let oz = -rad; oz <= rad; oz++) {
            if (ox === 0 && oz === 0) continue;
            if (Math.abs(ox) + Math.abs(oz) > rad + 1) continue;
            setLocal(dx + ox, groundY + oy, dz + oz, leafB, false);
          }
          rad = rad === 2 ? 1 : 2;
        }
        setLocal(dx, groundY + th, dz, leafB, false);
      }
    }
  }
  buildRuin(seedStr, cx, cz, out, gen, setLocal);
}

/** Rare small mossy ruin with a chest + lantern. Deterministic per chunk. */
function buildRuin(seedStr, cx, cz, out, gen, setLocal) {
  const r = rngFromSeed('ruin:' + seedStr + ':' + cx + ':' + cz);
  if (r() > 0.004) return; // ~1 in 250 chunks
  // pick an anchor column near chunk center
  const ax = cx * CS + 6 + Math.floor(r() * 4);
  const az = cz * CS + 6 + Math.floor(r() * 4);
  const col = gen.columnInfo(ax, az);
  if (col.height <= SEA + 1 || col.height > 96 || col.river || gen.caveAt(ax, col.height, az)) return;
  const base = col.height + 1;
  const wallB = r() < 0.5 ? B.MOSSY_COBBLE : B.COBBLESTONE;
  // 5x5 broken walls (corner posts full height, walls partial)
  for (let ox = -2; ox <= 2; ox++) {
    for (let oz = -2; oz <= 2; oz++) {
      if (Math.abs(ox) !== 2 && Math.abs(oz) !== 2) continue; // walls only
      const cInfo = gen.columnInfo(ax + ox, az + oz);
      let gy = cInfo.height + 1;
      const hMax = 3 - Math.floor(r() * 2.2); // ragged tops
      for (let h = 0; h <= hMax; h++) {
        setLocal(ox + (ax - cx * CS), gy + h, oz + (az - cz * CS), wallB, true);
      }
    }
  }
  // clear interior floor to ground
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    const iInfo = gen.columnInfo(ax + ox, az + oz);
    for (let yy = iInfo.height + 1; yy <= base + 2; yy++) setLocal(ox + (ax - cx * CS), yy, oz + (az - cz * CS), B.AIR, true);
  }
  // chest at center, lantern opposite corner
  setLocal(ax - cx * CS, base, az - cz * CS, B.CHEST, true);
  setLocal((ax - cx * CS) + 1, base, (az - cz * CS) + 1, B.LANTERN, true);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateChunk, makeGen, BIOMES, CS, WH, SEA };
}
if (typeof self !== 'undefined') { self.WORLDGEN_MOD = { generateChunk, makeGen, BIOMES, CS, WH, SEA }; }
})();
