import { B, BLOCKS } from './blocks.js';

// Items: string ids for non-blocks; numeric block ids are placeable items.
export const ITEMS = {
  stick:        { name: 'Stick', stack: 64, fuel: 5 },
  coal:         { name: 'Coal', stack: 64, fuel: 80 },
  charcoal:     { name: 'Charcoal', stack: 64, fuel: 80 },
  iron_ingot:   { name: 'Iron Ingot', stack: 64 },
  gold_ingot:   { name: 'Gold Ingot', stack: 64 },
  diamond:      { name: 'Diamond', stack: 64 },
  spark_dust:   { name: 'Spark Dust', stack: 64, places: B.WIRE_OFF },
  wool:         { name: 'Wool', stack: 64, places: null },
  seeds:        { name: 'Seeds', stack: 64, plants: B.WHEAT0 },
  wheat:        { name: 'Wheat', stack: 64 },
  bread:        { name: 'Bread', stack: 64, food: { hunger: 5 } },
  apple:        { name: 'Apple', stack: 64, food: { hunger: 3 } },
  pork_raw:     { name: 'Raw Porkchop', stack: 64, food: { hunger: 2 } },
  pork_cooked:  { name: 'Cooked Porkchop', stack: 64, food: { hunger: 7 } },
  mutton_raw:   { name: 'Raw Mutton', stack: 64, food: { hunger: 2 } },
  mutton_cooked:{ name: 'Cooked Mutton', stack: 64, food: { hunger: 6 } },
  chicken_raw:  { name: 'Raw Chicken', stack: 64, food: { hunger: 2 } },
  chicken_cooked:{ name: 'Cooked Chicken', stack: 64, food: { hunger: 6 } },
};

const TIER_NAMES = ['wooden', 'stone', 'iron', 'golden', 'diamond'];
const TIER_LABEL = ['Wooden', 'Stone', 'Iron', 'Golden', 'Diamond'];
export const TOOL_TIER = { wooden: 0, stone: 1, iron: 2, golden: 1, diamond: 3 };
const TIER_SPEED = [2, 4, 6, 10, 8];
const SWORD_DMG = [4, 5, 6, 4, 7];
const DURABILITY = [60, 132, 251, 33, 1562];

for (let t = 0; t < 5; t++) {
  const tn = TIER_NAMES[t], label = TIER_LABEL[t];
  ITEMS[tn + '_pickaxe'] = { name: label + ' Pickaxe', stack: 1, toolClass: 'pickaxe', tier: TOOL_TIER[tn],
    speed: TIER_SPEED[t], durability: DURABILITY[t], dmg: 2 + t * 0.5 | 0 };
  ITEMS[tn + '_axe'] = { name: label + ' Axe', stack: 1, toolClass: 'axe', tier: TOOL_TIER[tn],
    speed: TIER_SPEED[t] * 0.85, durability: DURABILITY[t], dmg: 3 + t };
  ITEMS[tn + '_shovel'] = { name: label + ' Shovel', stack: 1, toolClass: 'shovel', tier: TOOL_TIER[tn],
    speed: TIER_SPEED[t] * 0.9, durability: DURABILITY[t], dmg: 1 + t * 0.5 | 0 };
  ITEMS[tn + '_sword'] = { name: label + ' Sword', stack: 1, toolClass: 'sword', tier: TOOL_TIER[tn],
    speed: 1.2, durability: Math.round(DURABILITY[t] * 0.8), dmg: SWORD_DMG[t] };
  if (t < 2) ITEMS[tn + '_hoe'] = { name: label + ' Hoe', stack: 1, toolClass: 'hoe', tier: 0,
    speed: 1, durability: DURABILITY[t], dmg: 1 };
}
ITEMS.iron_hoe = { name: 'Iron Hoe', stack: 1, toolClass: 'hoe', tier: 0, speed: 1, durability: 251, dmg: 1 };

export function itemDef(id) {
  if (typeof id === 'number') return BLOCKS[id];
  return ITEMS[id];
}

export function itemName(id) {
  const d = itemDef(id);
  return d ? d.name : String(id);
}

export function maxStack(id) {
  if (typeof id === 'number') return 64;
  return (ITEMS[id] && ITEMS[id].stack) || 64;
}

export function isBlockItem(id) { return typeof id === 'number'; }
