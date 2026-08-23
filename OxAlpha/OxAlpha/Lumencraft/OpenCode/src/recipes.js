import { B } from './blocks.js';
import { ITEMS } from './items.js';

// Shaped recipes: pattern rows use single-char keys mapped to item ids
// (numbers = block ids, strings = item ids). 3x3 grid; smaller patterns fit anywhere.
function shaped(out, count, pattern, key) {
  return { out, count, pattern, key };
}

const M = { wooden: B.PLANKS, stone: B.COBBLE, iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };

export const RECIPES = [
  // basics
  shaped(B.PLANKS, 4, ['L'], { L: B.LOG_OAK }),
  { ...shaped(B.PLANKS, 4, ['L'], { L: B.LOG_BIRCH }) },
  { ...shaped(B.PLANKS, 4, ['L'], { L: B.PINE_LOG }) },
  shaped('stick', 4, ['P', 'P'], { P: B.PLANKS }),
  shaped(B.CRAFT_TABLE, 1, ['PP', 'PP'], { P: B.PLANKS }),
  shaped(B.TORCH, 4, ['C', 'S'], { C: 'coal', S: 'stick' }),
  { ...shaped(B.TORCH, 4, ['C', 'S'], { C: 'charcoal', S: 'stick' }) },
  shaped(B.FURNACE, 1, ['CCC', 'C C', 'CCC'], { C: B.COBBLE }),
  shaped(B.CHEST, 1, ['PPP', 'P P', 'PPP'], { P: B.PLANKS }),
  shaped(B.LADDER, 3, ['S S', 'SSS', 'S S'], { S: 'stick' }),
  shaped(B.BED, 1, ['WWW', 'PPP'], { W: 'wool', P: B.PLANKS }),
  shaped(B.BOOKSHELF, 1, ['PPP', 'WWW', 'PPP'], { P: B.PLANKS, W: 'wool' }),
  shaped(B.GLOWSTONE, 1, ['CC', 'CC'], { C: 'coal' }),
  // circuits
  shaped(B.LEVER_OFF, 1, ['S', 'C'], { S: 'stick', C: B.COBBLE }),
  shaped(B.LAMP_OFF, 1, [' D ', 'DGD', ' D '], { D: 'spark_dust', G: B.GLASS }),
  // farming / food
  shaped('bread', 1, ['WWW'], { W: 'wheat' }),
];

for (const tier of ['wooden', 'stone', 'iron', 'golden', 'diamond']) {
  RECIPES.push(shaped(`${tier}_pickaxe`, 1, ['MMM', ' S ', ' S '], { M: M[tier], S: 'stick' }));
  RECIPES.push(shaped(`${tier}_axe`, 1, ['MM', 'MS', ' S'], { M: M[tier], S: 'stick' }));
  RECIPES.push(shaped(`${tier}_shovel`, 1, ['M', 'S', 'S'], { M: M[tier], S: 'stick' }));
  RECIPES.push(shaped(`${tier}_sword`, 1, ['M', 'M', 'S'], { M: M[tier], S: 'stick' }));
}
RECIPES.push(shaped('wooden_hoe', 1, ['PP', ' S', ' S'], { P: B.PLANKS, S: 'stick' }));
RECIPES.push(shaped('stone_hoe', 1, ['CC', ' S', ' S'], { C: B.COBBLE, S: 'stick' }));
RECIPES.push(shaped('iron_hoe', 1, ['II', ' S', ' S'], { I: 'iron_ingot', S: 'stick' }));

// Smelting: input id -> [outputId, seconds]
export const SMELTING = {
  [B.IRON_ORE]: ['iron_ingot', 10],
  [B.GOLD_ORE]: ['gold_ingot', 12],
  [B.SAND]: [B.GLASS, 5],
  [B.COBBLE]: [B.STONE, 7],
  pork_raw: ['pork_cooked', 8],
  mutton_raw: ['mutton_cooked', 8],
  chicken_raw: ['chicken_cooked', 8],
  [B.LOG_OAK]: ['charcoal', 15],
  [B.LOG_BIRCH]: ['charcoal', 15],
  [B.PINE_LOG]: ['charcoal', 15],
};

// Fuel seconds per single item
export function fuelSeconds(id) {
  if (typeof id === 'number') return BLOCK_FUEL[id] || 0;
  return (ITEMS[id] && ITEMS[id].fuel) || 0;
}

import { BLOCKS } from './blocks.js';
const BLOCK_FUEL = {};
for (let i = 1; i < BLOCKS.length; i++) {
  const b = BLOCKS[i];
  if (b && b.fuel) BLOCK_FUEL[i] = b.fuel;
}

// Match a crafting grid (array of 9 or 4 slots, each null | {id,count}) against recipes.
// Returns {recipe, pos} where pos = offset of the pattern in the grid, or null.
export function matchRecipe(grid, size) {
  const ids = grid.map(s => (s ? s.id : null));
  for (const r of RECIPES) {
    const ph = r.pattern.length, pw = Math.max(...r.pattern.map(row => row.length));
    if (ph > size || pw > size) continue;
    for (let oy = 0; oy <= size - ph; oy++) {
      for (let ox = 0; ox <= size - pw; ox++) {
        if (matchAt(r, ids, size, ox, oy, pw, ph)) return r;
      }
    }
  }
  return null;
}

function matchAt(r, ids, size, ox, oy, pw, ph) {
  let used = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = ids[y * size + x];
      const py = y - oy, px = x - ox;
      let want = null;
      if (py >= 0 && py < ph && px >= 0 && px < pw && py < r.pattern.length && px < r.pattern[py].length) {
        want = r.key[r.pattern[py][px]] ?? null;
      }
      if (want === null && cell !== null) return false;
      if (want !== null && cell !== want) return false;
      if (cell !== null) used++;
    }
  }
  return used > 0;
}
