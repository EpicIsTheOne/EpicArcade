// Procedural world generation. DOM-free: runs inside workers AND on the main
// thread (sapling growth). Deterministic for a given seed.
import { CHUNK, HEIGHT, SEA, idx } from './config.js';
import { B } from './blocks.js';
import { Noise, hashSeed, mulberry32 } from './noise.js';

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6 };
export const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Peaks', 'Mountains'];

export const GRASS_TINT = [
  [0.45, 0.72, 0.55], // ocean (unused on grass)
  [0.62, 0.78, 0.45], // beach
  [0.55, 0.76, 0.34], // plains — warm green
  [0.42, 0.68, 0.32], // forest
  [0.73, 0.71, 0.40], // desert scrub
  [0.60, 0.74, 0.66], // snowy
  [0.52, 0.70, 0.48], // mountain
];
export const FOLIAGE_TINT = [
  [0.36, 0.62, 0.38], [0.50, 0.70, 0.36], [0.46, 0.70, 0.28],
  [0.34, 0.60, 0.26], [0.66, 0.64, 0.34], [0.48, 0.66, 0.58], [0.44, 0.63, 0.38],
];

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + t * (b - a);

export class Generator {
  constructor(seedStr) {
    this.seedStr = String(seedStr);
    const s = hashSeed(this.seedStr);
    this.seedNum = s;
    this.nCont = new Noise(s); this.nEros = new Noise(s ^ 0x9e3779b9);
    this.nPeaks = new Noise(s ^ 0x85ebca6b); this.nDetail = new Noise(s ^ 0xc2b2ae35);
    this.nTemp = new Noise(s ^ 0x27d4eb2f); this.nMoist = new Noise(s ^ 0x165667b1);
    this.nCaveA = new Noise(s ^ 0x9fd9a25e); this.nCaveB = new Noise(s ^ 0xd3a2646b);
    this.nCaveC = new Noise(s ^ 0x2545f491);
  }

  columnInfo(wx, wz) {
    const cont = this.nCont.fbm2(wx * 0.0016, wz * 0.0016, 4);
    const ero = this.nEros.fbm2(wx * 0.0042, wz * 0.0042, 3);
    let ridge = 1 - Math.abs(this.nPeaks.fbm2(wx * 0.0068, wz * 0.0068, 4));
    ridge *= ridge;
    let detail = this.nDetail.fbm2(wx * 0.02, wz * 0.02, 2);

    const mMask = smoothstep(0.14, 0.55, cont);
    let h = SEA + 8 + cont * 24 + mMask * Math.pow(ridge, 1.4) * 46 * (0.65 + 0.35 * ero) + ero * 7;

    // ocean deepening / shoreline blend
    const oceanT = smoothstep(-0.10, -0.42, cont);
    if (oceanT > 0) h = lerp(h, SEA - 8 - oceanT * 16, oceanT);
    h += detail * (h > SEA ? 2.6 : 1.2);
    h = Math.max(12, Math.min(HEIGHT - 14, h));

    let temp = this.nTemp.fbm2(wx * 0.0011, wz * 0.0011, 3) - Math.max(0, h - SEA - 20) * 0.008;
    const moist = this.nMoist.fbm2(wx * 0.0013 + 77, wz * 0.0013 - 31, 3);

    let biome;
    if (h < SEA - 2) biome = BIOME.OCEAN;
    else if (temp < -0.32) biome = BIOME.SNOWY;
    else if (temp > 0.30 && moist < 0.02 && h < SEA + 30) biome = BIOME.DESERT;
    else if (h <= SEA + 1) biome = BIOME.BEACH;
    else if (h > SEA + 32) biome = BIOME.MOUNTAIN;
    else if (moist > 0.08) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;

    return { h: Math.round(h), temp, moist, biome };
  }

  genChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const heights = new Int16Array(CHUNK * CHUNK);
    const biomes = new Uint8Array(CHUNK * CHUNK);
    const rng = mulberry32((this.seedNum ^ Math.imul(cx, 341873128) ^ Math.imul(cz, 132897987)) >>> 0);

    const infos = new Array(CHUNK * CHUNK);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
      const info = this.columnInfo(wx, wz);
      infos[z * 16 + x] = info;
      biomes[z * 16 + x] = info.biome;
      const h = info.h; heights[z * 16 + x] = h;

      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0 || (y === 1 && rng() < 0.6)) id = B.BEDROCK;
        else if (y < h - 3) id = B.STONE;
        else {
          switch (info.biome) {
            case BIOME.DESERT: id = y >= h ? B.SAND : (y >= h - 3 ? B.SAND : B.SANDSTONE); break;
            case BIOME.BEACH: id = y >= h - 3 ? B.SAND : B.STONE; break;
            case BIOME.OCEAN:
              id = y >= h ? (this.nDetail.n2(wx * 0.05, wz * 0.05) > 0.25 ? B.GRAVEL : B.SAND)
                : (y >= h - 2 ? B.SAND : B.STONE); break;
            case BIOME.SNOWY: id = y >= h ? B.SNOW_GRASS : B.DIRT; break;
            case BIOME.MOUNTAIN:
              if (y >= h) id = h >= SEA + 46 ? B.SNOW_BLOCK : (h >= SEA + 40 ? B.STONE : B.GRASS);
              else if (h >= SEA + 42) id = y >= h - 2 ? B.STONE : B.STONE;
              else id = y >= h - 1 ? B.DIRT : B.STONE;
              break;
            default: id = y >= h ? B.GRASS : B.DIRT;
          }
        }
        blocks[idx(x, y, z)] = id;
      }
      if (h < SEA) for (let y = h + 1; y <= SEA; y++) blocks[idx(x, y, z)] = B.WATER;
      // frozen ocean surface
      if (info.temp < -0.42 && h < SEA - 2) blocks[idx(x, SEA, z)] = B.ICE;
    }

    // ---- caves ----
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
      const h = heights[z * 16 + x];
      const underwater = h <= SEA + 1;
      const top = underwater ? h - 9 : h - 2;
      for (let y = 6; y <= top; y++) {
        const a = this.nCaveA.n3(wx * 0.021, y * 0.042, wz * 0.021);
        const bb = this.nCaveB.n3(wx * 0.021 + 91, y * 0.042, wz * 0.021 - 47);
        let carve = (a * a + bb * bb) < 0.0075;
        if (!carve && y < h - 14) {
          carve = this.nCaveC.fbm3(wx * 0.014, y * 0.024, wz * 0.014, 2) > 0.58;
        }
        if (carve) {
          const i = idx(x, y, z);
          if (blocks[i] !== B.BEDROCK && blocks[i] !== B.WATER) blocks[i] = y <= 9 ? B.LAVA : B.AIR;
        }
      }
    }

    // ---- ores ----
    const vein = (id, tries, minY, maxY, size) => {
      for (let t = 0; t < tries; t++) {
        let x = (rng() * 16) | 0, z = (rng() * 16) | 0, y = minY + ((rng() * (maxY - minY)) | 0);
        const n = 3 + (rng() * size) | 0;
        for (let i = 0; i < n; i++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 1 && y < HEIGHT) {
            const ii = idx(x, y, z);
            if (blocks[ii] === B.STONE) blocks[ii] = id;
          }
          x += (rng() * 3 | 0) - 1; y += (rng() * 3 | 0) - 1; z += (rng() * 3 | 0) - 1;
        }
      }
    };
    vein(B.COAL_ORE, 13, 10, 96, 8);
    vein(B.IRON_ORE, 8, 6, 62, 6);
    vein(B.GOLD_ORE, 3, 6, 38, 5);
    vein(B.EMBER_ORE, 4, 6, 26, 5);
    vein(B.DIAMOND_ORE, 2, 4, 15, 4);

    // ---- vegetation & scatter ----
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const i16 = z * 16 + x;
      const h = heights[i16], bio = biomes[i16];
      if (h <= SEA || h >= HEIGHT - 10) continue;
      const ground = blocks[idx(x, h, z)];
      const above = blocks[idx(x, h + 1, z)];
      if (above !== B.AIR) continue;
      const r = rng();
      if ((ground === B.GRASS)) {
        if (bio === BIOME.FOREST && r < 0.055) plantTree(blocks, x, h + 1, z, rng, rng() < 0.22 ? 'birch' : 'oak');
        else if (bio === BIOME.PLAINS && r < 0.004) plantTree(blocks, x, h + 1, z, rng, 'oak');
        else if (bio === BIOME.FOREST && r < 0.22) blocks[idx(x, h + 1, z)] = B.TALLGRASS;
        else if (bio === BIOME.PLAINS && r < 0.10) blocks[idx(x, h + 1, z)] = r < 0.085 ? B.TALLGRASS : (rng() < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW);
        else if (r < 0.0025) blocks[idx(x, h + 1, z)] = B.PUMPKIN;
      } else if (ground === B.SAND && bio === BIOME.DESERT) {
        if (r < 0.010) { const ch = 2 + (rng() * 2 | 0); for (let c = 1; c <= ch; c++) blocks[idx(x, h + c, z)] = B.CACTUS; }
        else if (r < 0.022) blocks[idx(x, h + 1, z)] = B.DEADBUSH;
      } else if ((ground === B.SNOW_GRASS) && bio === BIOME.SNOWY && r < 0.03) {
        plantTree(blocks, x, h + 1, z, rng, 'pine');
      } else if (ground === B.GRASS && bio === BIOME.MOUNTAIN && r < 0.012) {
        plantTree(blocks, x, h + 1, z, rng, 'pine');
      } else if (ground === B.SAND && bio === BIOME.BEACH && r < 0.006) {
        plantTree(blocks, x, h + 1, z, rng, 'palmish');
      }
    }

    // ---- structures ----
    if (rng() < 0.02) this.buildRuin(blocks, heights, rng);
    if (rng() < 0.035) this.buildDungeon(blocks, heights, rng);

    // recompute true top height after carving/trees
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      for (let y = HEIGHT - 1; y > 0; y--) {
        const b = blocks[idx(x, y, z)];
        if (b !== B.AIR && b !== B.WATER && !BLOCKS_LIGHT_PASS(b)) { heights[z * 16 + x] = y; break; }
      }
    }
    return { blocks, heights, biomes };
  }

  buildRuin(blocks, heights, rng) {
    const cx = 3 + (rng() * 8) | 0, cz = 3 + (rng() * 8) | 0;
    let hSum = 0, ok = true;
    for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const hh = heights[(cz + dz) * 16 + (cx + dx)];
      if (hh === undefined || hh <= SEA) ok = false;
      hSum += hh || 0;
    }
    if (!ok) return;
    const base = Math.round(hSum / 4);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const x = cx + dx, z = cz + dz;
      if (x < 1 || x > 14 || z < 1 || z > 14) continue;
      // clear area & floor
      for (let y = base + 1; y <= base + 6; y++) blocks[idx(x, y, z)] = B.AIR;
      blocks[idx(x, base, z)] = rng() < 0.5 ? B.MOSSY : B.COBBLE;
      for (let y = base - 1; y > base - 4; y--) if (blocks[idx(x, y, z)] === B.AIR || isLeafLike(blocks[idx(x, y, z)])) blocks[idx(x, y, z)] = B.COBBLE;
      // broken walls
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (edge) {
        const wh = 1 + (rng() * 3) | 0;
        for (let wy = 1; wy <= wh; wy++) if (rng() < 0.75) blocks[idx(x, base + wy, z)] = rng() < 0.35 ? B.MOSSY : B.COBBLE;
      }
    }
    if (cx > 0 && cx < 15 && cz > 0 && cz < 15) blocks[idx(cx, base + 1, cz)] = B.CHEST;
    blocks[idx(cx + 2 > 14 ? cx - 2 : cx + 2, base + 3, cz)] = B.TORCH;
  }

  buildDungeon(blocks, heights, rng) {
    const cy = 12 + (rng() * 20) | 0;
    if (cy >= 34) return;
    const rx = 4 + (rng() * 6) | 0, rz = 4 + (rng() * 6) | 0;
    const w = 5, hh = 4;
    if (rx + w > 15 || rz + w > 15) return;
    for (let dx = -1; dx <= w; dx++) for (let dz = -1; dz <= w; dz++) for (let dy = -1; dy <= hh; dy++) {
      const x = rx + dx, y = cy + dy, z = rz + dz;
      if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2 || y > HEIGHT - 2) continue;
      const shell = dx === -1 || dx === w || dz === -1 || dz === w || dy === -1 || dy === hh;
      blocks[idx(x, y, z)] = shell ? (rng() < 0.4 ? B.MOSSY : B.COBBLE) : B.AIR;
    }
    blocks[idx(rx + (w >> 1), cy, rz + (w >> 1))] = B.CHEST;
    blocks[idx(rx + 1, cy + hh - 1, rz + 1)] = B.TORCH;
    blocks[idx(rx + w - 1, cy + hh - 1, rz + w - 1)] = B.GLOWSTONE;
  }
}

function BLOCKS_LIGHT_PASS(b) { return b === B.LEAVES_OAK || b === B.LEAVES_BIRCH || b === B.PINE_LEAVES; }
function isLeafLike(b) { return b === B.LEAVES_OAK || b === B.LEAVES_BIRCH || b === B.PINE_LEAVES || b === B.TALLGRASS || b === B.LOG_OAK || b === B.LOG_BIRCH || b === B.PINE_LOG || b === B.SNOW_BLOCK; }

export function plantTree(blocks, lx, y, lz, rng, type) {
  const put = (x, yy, z, id, soft) => {
    if (x < 0 || x > 15 || z < 0 || z > 15 || yy < 1 || yy >= HEIGHT) return false;
    const i = idx(x, yy, z);
    if (soft && blocks[i] !== B.AIR) return false;
    blocks[i] = id;
    return true;
  };
  if (type === 'pine') {
    const th = 6 + (rng() * 3) | 0;
    for (let i = 0; i < th; i++) put(lx, y + i, lz, B.PINE_LOG);
    let radius = 2;
    for (let ly = y + 2; ly <= y + th; ly += 1) {
      const layerT = (ly - y);
      radius = Math.max(0, Math.round((th - layerT) * 0.45));
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= radius + (layerT % 2)) {
          if (!(dx === 0 && dz === 0 && ly < y + th)) put(lx + dx, ly, lz + dz, B.PINE_LEAVES, true);
        }
      }
    }
    put(lx, y + th, lz, B.PINE_LEAVES, true);
    return true;
  }
  const birch = type === 'birch';
  const logId = birch ? B.LOG_BIRCH : B.LOG_OAK;
  const leafId = birch ? B.LEAVES_BIRCH : B.LEAVES_OAK;
  const th = (birch ? 5 : 4) + (rng() * 3) | 0;
  for (let i = 0; i < th; i++) put(lx, y + i, lz, logId);
  const topY = y + th;
  for (let ly = topY - 2; ly <= topY + 1; ly++) {
    const rad = ly >= topY ? 1 : 2;
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      if (Math.abs(dx) === rad && Math.abs(dz) === rad && (rng() < 0.5 || rad === 1)) continue;
      if (dx === 0 && dz === 0 && ly < topY) continue;
      put(lx + dx, ly, lz + dz, leafId, true);
    }
  }
  return true;
}
