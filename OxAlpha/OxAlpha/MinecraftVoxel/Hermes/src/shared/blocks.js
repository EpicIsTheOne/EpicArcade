// Block & item registry — single source of truth for gameplay + rendering.
// Dual-export (workers import via require-style shim below; browser via global).
'use strict';
// ---- Block IDs (stable across saves) ----
(function () {
const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLESTONE: 4, PLANKS: 5, LOG: 6, LEAVES: 7,
  SAND: 8, WATER: 9, BEDROCK: 10, COAL_ORE: 11, IRON_ORE: 12, GOLD_ORE: 13,
  DIAMOND_ORE: 14, REDSTONE_ORE: 15, GRAVEL: 16, SNOW_GRASS: 17, ICE: 18, CACTUS: 19,
  SANDSTONE: 20, GLOWSTONE: 21, TORCH: 22, TALLGRASS: 23, FLOWER_RED: 24,
  FLOWER_YELLOW: 25, SAPLING: 26, FARMLAND: 27, WHEAT0: 28, WHEAT1: 29, WHEAT2: 30,
  WHEAT3: 31, CHEST: 32, FURNACE: 33, FURNACE_LIT: 34, GLASS: 35, STONE_BRICKS: 36,
  MOSSY_COBBLE: 37, OBSIDIAN: 38, SPRUCE_LOG: 39, SPRUCE_LEAVES: 40, BIRCH_LOG: 41,
  BIRCH_LEAVES: 42, CLAY: 43, BRICKS: 44, LANTERN: 45, REDSTONE_WIRE: 46,
  LEVER: 47, LEVER_ON: 48, REDSTONE_LAMP: 49, REDSTONE_LAMP_ON: 50, LAVA: 51,
  SNOW_BLOCK: 52, WOOL: 53, CRAFTING_TABLE: 54, BOOKSHELF: 55, BED: 56,
};

// ---- Item IDs (>=256, non-block items) ----
const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260,
  REDSTONE_DUST: 261, APPLE: 262, WHEAT_ITEM: 263, SEEDS: 264, BREAD: 265,
  FLINT: 266, CLAY_BALL: 267, BRICK_ITEM: 268, RAW_BEEF: 270, STEAK: 271,
  RAW_PORK: 272, COOKED_PORK: 273,
};
const TOOL_BASE = 280; // + matIdx*5 + toolIdx ; mats: wood stone iron gold diamond
const TOOL_MATS = ['wooden', 'stone', 'iron', 'golden', 'diamond'];
const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
function toolId(matIdx, kindIdx) { return TOOL_BASE + matIdx * 5 + kindIdx; }

// Tool material stats: [speedMult, durability, damageBonus(sword base), tier]
const TOOL_MAT_STATS = [
  { speed: 2, dur: 60, dmg: 4, tier: 1 },   // wooden
  { speed: 4, dur: 132, dmg: 5, tier: 2 },  // stone
  { speed: 6, dur: 251, dmg: 6, tier: 3 },  // iron
  { speed: 12, dur: 33, dmg: 4, tier: 3 },  // golden
  { speed: 8, dur: 1562, dmg: 7, tier: 4 }, // diamond
];
const SWORD_DMG = [4, 5, 6, 4, 7];

// ---- Block definitions ----
// opacity: light attenuation (opaque=15). emit: light emission 0-15.
// tex: tile names resolved by the atlas builder.
function def(id, name, o) {
  return Object.assign({
    id, name, solid: true, opaque: true, cross: false, liquid: false,
    hardness: 1, tool: null, minTier: 0, emit: 0, opacity: 15,
    drop: null, // null => drop itself; [] => nothing; [{item,count,chance}]
    tex: {}, gravity: false, replaceable: false,
  }, o);
}

const BLOCKS = [];
BLOCKS[B.AIR] = def(B.AIR, 'air', { solid: false, opaque: false, opacity: 0, replaceable: true });
BLOCKS[B.STONE] = def(B.STONE, 'stone', { hardness: 1.5, tool: 'pickaxe', minTier: 1, drop: [{ item: B.COBBLESTONE }], tex: { all: 'stone' } });
BLOCKS[B.GRASS] = def(B.GRASS, 'grass_block', { hardness: 0.6, tool: 'shovel', drop: [{ item: B.DIRT }], tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } });
BLOCKS[B.DIRT] = def(B.DIRT, 'dirt', { hardness: 0.5, tool: 'shovel', tex: { all: 'dirt' } });
BLOCKS[B.COBBLESTONE] = def(B.COBBLESTONE, 'cobblestone', { hardness: 2, tool: 'pickaxe', minTier: 1, tex: { all: 'cobblestone' } });
BLOCKS[B.PLANKS] = def(B.PLANKS, 'planks', { hardness: 2, tool: 'axe', tex: { all: 'planks' } });
BLOCKS[B.LOG] = def(B.LOG, 'oak_log', { hardness: 2, tool: 'axe', tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' } });
BLOCKS[B.LEAVES] = def(B.LEAVES, 'oak_leaves', {
  hardness: 0.2, opaque: false, opacity: 1,
  drop: [{ item: I.APPLE, count: 1, chance: 0.06 }, { item: I.STICK, count: [1, 2], chance: 0.1 }],
  tex: { all: 'leaves' },
});
BLOCKS[B.SAND] = def(B.SAND, 'sand', { hardness: 0.5, tool: 'shovel', gravity: true, tex: { all: 'sand' } });
BLOCKS[B.WATER] = def(B.WATER, 'water', { solid: false, opaque: false, liquid: true, opacity: 2, hardness: -1, replaceable: true });
BLOCKS[B.BEDROCK] = def(B.BEDROCK, 'bedrock', { hardness: -1, tex: { all: 'bedrock' } });
BLOCKS[B.COAL_ORE] = def(B.COAL_ORE, 'coal_ore', { hardness: 3, tool: 'pickaxe', minTier: 1, drop: [{ item: I.COAL }], tex: { all: 'coal_ore' } });
BLOCKS[B.IRON_ORE] = def(B.IRON_ORE, 'iron_ore', { hardness: 3, tool: 'pickaxe', minTier: 2, tex: { all: 'iron_ore' } });
BLOCKS[B.GOLD_ORE] = def(B.GOLD_ORE, 'gold_ore', { hardness: 3, tool: 'pickaxe', minTier: 3, tex: { all: 'gold_ore' } });
BLOCKS[B.DIAMOND_ORE] = def(B.DIAMOND_ORE, 'diamond_ore', { hardness: 3, tool: 'pickaxe', minTier: 3, drop: [{ item: I.DIAMOND }], tex: { all: 'diamond_ore' } });
BLOCKS[B.REDSTONE_ORE] = def(B.REDSTONE_ORE, 'redstone_ore', { hardness: 3, tool: 'pickaxe', minTier: 3, emit: 7, drop: [{ item: I.REDSTONE_DUST, count: [4, 5] }], tex: { all: 'redstone_ore' } });
BLOCKS[B.GRAVEL] = def(B.GRAVEL, 'gravel', {
  hardness: 0.6, tool: 'shovel', gravity: true,
  drop: [{ item: B.GRAVEL, chance: 0.85 }, { item: I.FLINT, chance: 0.15 }],
  tex: { all: 'gravel' },
});
BLOCKS[B.SNOW_GRASS] = def(B.SNOW_GRASS, 'snowy_grass', { hardness: 0.6, tool: 'shovel', drop: [{ item: B.DIRT }], tex: { top: 'snow', side: 'snow_side', bottom: 'dirt' } });
BLOCKS[B.ICE] = def(B.ICE, 'ice', { hardness: 0.5, tool: 'pickaxe', opaque: false, opacity: 3, drop: [], slip: true, tex: { all: 'ice' } });
BLOCKS[B.CACTUS] = def(B.CACTUS, 'cactus', { hardness: 0.4, opaque: false, opacity: 15, damageTouch: 1, drop: [{ item: B.CACTUS }], tex: { all: 'cactus' } });
BLOCKS[B.SANDSTONE] = def(B.SANDSTONE, 'sandstone', { hardness: 0.8, tool: 'pickaxe', minTier: 1, tex: { all: 'sandstone' } });
BLOCKS[B.GLOWSTONE] = def(B.GLOWSTONE, 'glowstone', { hardness: 0.3, emit: 15, drop: [{ item: B.GLOWSTONE }], tex: { all: 'glowstone' } });
BLOCKS[B.TORCH] = def(B.TORCH, 'torch', { solid: false, opaque: false, cross: true, hardness: 0, emit: 14, opacity: 0, tex: { all: 'torch' } });
BLOCKS[B.TALLGRASS] = def(B.TALLGRASS, 'tall_grass', { solid: false, opaque: false, cross: true, hardness: 0, opacity: 0, drop: [{ item: I.SEEDS, count: 1, chance: 0.4 }], tex: { all: 'tallgrass' } });
BLOCKS[B.FLOWER_RED] = def(B.FLOWER_RED, 'rose', { solid: false, opaque: false, cross: true, hardness: 0, opacity: 0, tex: { all: 'flower_red' } });
BLOCKS[B.FLOWER_YELLOW] = def(B.FLOWER_YELLOW, 'dandelion', { solid: false, opaque: false, cross: true, hardness: 0, opacity: 0, tex: { all: 'flower_yellow' } });
BLOCKS[B.SAPLING] = def(B.SAPLING, 'sapling', { solid: false, opaque: false, cross: true, hardness: 0, opacity: 0, ticks: true, tex: { all: 'sapling' } });
BLOCKS[B.FARMLAND] = def(B.FARMLAND, 'farmland', { hardness: 0.6, tool: 'shovel', drop: [{ item: B.DIRT }], tex: { top: 'farmland', side: 'dirt', bottom: 'dirt' } });
for (let s = 0; s < 4; s++) {
  const mature = s === 3;
  BLOCKS[B.WHEAT0 + s] = def(B.WHEAT0 + s, 'wheat_' + s, {
    solid: false, opaque: false, cross: true, hardness: 0, opacity: 0, ticks: !mature,
    drop: mature ? [{ item: I.WHEAT_ITEM }, { item: I.SEEDS, count: [1, 2] }] : [{ item: I.SEEDS }],
    tex: { all: 'wheat' + s },
  });
}
BLOCKS[B.CHEST] = def(B.CHEST, 'chest', { hardness: 2.5, tool: 'axe', station: 'chest', tex: { all: 'chest' } });
BLOCKS[B.FURNACE] = def(B.FURNACE, 'furnace', { hardness: 3.5, tool: 'pickaxe', minTier: 1, station: 'furnace', tex: { all: 'furnace' } });
BLOCKS[B.FURNACE_LIT] = def(B.FURNACE_LIT, 'furnace_lit', { hardness: 3.5, tool: 'pickaxe', minTier: 1, emit: 13, station: 'furnace', drop: [{ item: B.FURNACE }], tex: { all: 'furnace_lit' } });
BLOCKS[B.GLASS] = def(B.GLASS, 'glass', { hardness: 0.3, opaque: false, opacity: 0, drop: [], tex: { all: 'glass' } });
BLOCKS[B.STONE_BRICKS] = def(B.STONE_BRICKS, 'stone_bricks', { hardness: 2, tool: 'pickaxe', minTier: 1, tex: { all: 'stone_bricks' } });
BLOCKS[B.MOSSY_COBBLE] = def(B.MOSSY_COBBLE, 'mossy_cobblestone', { hardness: 2, tool: 'pickaxe', minTier: 1, tex: { all: 'mossy_cobble' } });
BLOCKS[B.OBSIDIAN] = def(B.OBSIDIAN, 'obsidian', { hardness: 9, tool: 'pickaxe', minTier: 4, tex: { all: 'obsidian' } });
BLOCKS[B.SPRUCE_LOG] = def(B.SPRUCE_LOG, 'spruce_log', { hardness: 2, tool: 'axe', tex: { top: 'spruce_log_top', side: 'spruce_log_side', bottom: 'spruce_log_top' } });
BLOCKS[B.SPRUCE_LEAVES] = def(B.SPRUCE_LEAVES, 'spruce_leaves', { hardness: 0.2, opaque: false, opacity: 1, drop: [{ item: I.STICK, count: [1, 2], chance: 0.08 }], tex: { all: 'spruce_leaves' } });
BLOCKS[B.BIRCH_LOG] = def(B.BIRCH_LOG, 'birch_log', { hardness: 2, tool: 'axe', tex: { top: 'birch_log_top', side: 'birch_log_side', bottom: 'birch_log_top' } });
BLOCKS[B.BIRCH_LEAVES] = def(B.BIRCH_LEAVES, 'birch_leaves', {
  hardness: 0.2, opaque: false, opacity: 1,
  drop: [{ item: I.STICK, count: [1, 2], chance: 0.08 }], tex: { all: 'birch_leaves' },
});
BLOCKS[B.CLAY] = def(B.CLAY, 'clay', { hardness: 0.6, tool: 'shovel', drop: [{ item: I.CLAY_BALL, count: 4 }], tex: { all: 'clay' } });
BLOCKS[B.BRICKS] = def(B.BRICKS, 'bricks', { hardness: 2, tool: 'pickaxe', minTier: 1, tex: { all: 'bricks' } });
BLOCKS[B.LANTERN] = def(B.LANTERN, 'lantern', { hardness: 1, opaque: false, opacity: 0, emit: 15, tex: { all: 'lantern' } });
BLOCKS[B.REDSTONE_WIRE] = def(B.REDSTONE_WIRE, 'redstone_wire', { solid: false, opaque: false, cross: true, hardness: 0, opacity: 0, drop: [{ item: I.REDSTONE_DUST }], tex: { all: 'wire_off' } });
BLOCKS[B.LEVER] = def(B.LEVER, 'lever', { solid: false, opaque: false, hardness: 0.5, opacity: 0, drop: [{ item: B.LEVER }], tex: { all: 'lever' } });
BLOCKS[B.LEVER_ON] = def(B.LEVER_ON, 'lever_on', { solid: false, opaque: false, hardness: 0.5, opacity: 0, power: 15, drop: [{ item: B.LEVER }], tex: { all: 'lever_on' } });
BLOCKS[B.REDSTONE_LAMP] = def(B.REDSTONE_LAMP, 'redstone_lamp', { hardness: 0.3, tex: { all: 'lamp_off' } });
BLOCKS[B.REDSTONE_LAMP_ON] = def(B.REDSTONE_LAMP_ON, 'redstone_lamp_on', { hardness: 0.3, emit: 15, drop: [{ item: B.REDSTONE_LAMP }], tex: { all: 'lamp_on' } });
BLOCKS[B.LAVA] = def(B.LAVA, 'lava', { solid: false, opaque: false, liquid: true, opacity: 0, hardness: -1, emit: 15, damageTouch: 4, replaceable: true });
BLOCKS[B.SNOW_BLOCK] = def(B.SNOW_BLOCK, 'snow_block', { hardness: 0.2, tool: 'shovel', tex: { all: 'snow' } });
BLOCKS[B.WOOL] = def(B.WOOL, 'wool', { hardness: 0.8, tex: { all: 'wool' } });
BLOCKS[B.CRAFTING_TABLE] = def(B.CRAFTING_TABLE, 'crafting_table', { hardness: 2.5, tool: 'axe', station: 'crafting', tex: { top: 'crafting_top', side: 'crafting_side', bottom: 'planks' } });
BLOCKS[B.BOOKSHELF] = def(B.BOOKSHELF, 'bookshelf', { hardness: 1.5, tool: 'axe', tex: { all: 'bookshelf' } });
BLOCKS[B.BED] = def(B.BED, 'bed', { hardness: 0.4, station: 'bed', tex: { top: 'bed_top', side: 'bed_side', bottom: 'planks' } });

const isSolid = (id) => BLOCKS[id] ? BLOCKS[id].solid : false;
const isOpaque = (id) => BLOCKS[id] ? BLOCKS[id].opaque : false;
const isCross = (id) => BLOCKS[id] ? BLOCKS[id].cross : false;
const isLiquid = (id) => BLOCKS[id] ? BLOCKS[id].liquid : false;

// ---- Item registry (unified: block items share block id; others >= 256) ----
const ITEMS = {};
for (const blk of BLOCKS) {
  if (blk && blk.id !== 0) ITEMS[blk.id] = { id: blk.id, name: blk.name, block: blk.id };
}
Object.assign(ITEMS, {
  [I.STICK]: { id: I.STICK, name: 'stick' },
  [I.COAL]: { id: I.COAL, name: 'coal', fuel: 1600 },
  [I.IRON_INGOT]: { id: I.IRON_INGOT, name: 'iron_ingot' },
  [I.GOLD_INGOT]: { id: I.GOLD_INGOT, name: 'gold_ingot' },
  [I.DIAMOND]: { id: I.DIAMOND, name: 'diamond' },
  [I.REDSTONE_DUST]: { id: I.REDSTONE_DUST, name: 'redstone_dust', place: B.REDSTONE_WIRE },
  [I.APPLE]: { id: I.APPLE, name: 'apple', food: { hunger: 4, heal: 0 } },
  [I.WHEAT_ITEM]: { id: I.WHEAT_ITEM, name: 'wheat' },
  [I.SEEDS]: { id: I.SEEDS, name: 'seeds', plantOn: B.FARMLAND, place: B.WHEAT0 },
  [I.BREAD]: { id: I.BREAD, name: 'bread', food: { hunger: 5, heal: 0 } },
  [I.FLINT]: { id: I.FLINT, name: 'flint' },
  [I.CLAY_BALL]: { id: I.CLAY_BALL, name: 'clay_ball' },
  [I.BRICK_ITEM]: { id: I.BRICK_ITEM, name: 'brick' },
  [I.RAW_BEEF]: { id: I.RAW_BEEF, name: 'raw_beef', food: { hunger: 3, heal: 0 } },
  [I.STEAK]: { id: I.STEAK, name: 'steak', food: { hunger: 8, heal: 0 } },
  [I.RAW_PORK]: { id: I.RAW_PORK, name: 'raw_porkchop', food: { hunger: 3, heal: 0 } },
  [I.COOKED_PORK]: { id: I.COOKED_PORK, name: 'cooked_porkchop', food: { hunger: 8, heal: 0 } },
});
TOOL_MATS.forEach((mat, mi) => {
  TOOL_KINDS.forEach((kind, ki) => {
    const st = TOOL_MAT_STATS[mi];
    const id = toolId(mi, ki);
    ITEMS[id] = {
      id, name: `${mat}_${kind}`, tool: kind, tier: st.tier,
      speed: st.speed, dur: st.dur,
      dmg: kind === 'sword' ? SWORD_DMG[mi] : 1 + Math.floor(st.speed / 3),
    };
  });
});

const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : 'unknown');
const maxStack = (id) => (ITEMS[id] && ITEMS[id].dur ? 1 : 64);

// ---- Smelting ----
const SMELTING = {
  [B.IRON_ORE]: { out: I.IRON_INGOT, count: 1 },
  [B.GOLD_ORE]: { out: I.GOLD_INGOT, count: 1 },
  [B.SAND]: { out: B.GLASS, count: 1 },
  [B.COBBLESTONE]: { out: B.STONE, count: 1 },
  [B.CLAY_BALL]: { out: I.BRICK_ITEM, count: 1 },
  [B.LOG]: { out: I.COAL, count: 1 },
  [I.RAW_BEEF]: { out: I.STEAK, count: 1 },
  [I.RAW_PORK]: { out: I.COOKED_PORK, count: 1 },
};

// ---- Crafting recipes ----
// shaped: rows of item ids (null = empty), mirrored allowed. shapeless: array.
// grid sizes 2 or 3. Result {item,count}
const P = B.PLANKS, S = I.STICK, C = B.COBBLESTONE;
const RECIPES = [
  { name: 'Oak Planks ×4', shapeless: [B.LOG], size: 1, out: { item: P, count: 4 } },
  { name: 'Spruce Planks ×4', shapeless: [B.SPRUCE_LOG], size: 1, out: { item: P, count: 4 } },
  { name: 'Birch Planks ×4', shapeless: [B.BIRCH_LOG], size: 1, out: { item: P, count: 4 } },
  { name: 'Sticks ×4', shapeless: [P, P], size: 1, out: { item: S, count: 4 } },
  { name: 'Crafting Table', shaped: [[P, P], [P, P]], size: 2, out: { item: B.CRAFTING_TABLE, count: 1 } },
  { name: 'Furnace', shaped: [[C, C, C], [C, null, C], [C, C, C]], size: 3, out: { item: B.FURNACE, count: 1 } },
  { name: 'Chest', shaped: [[P, P, P], [P, null, P], [P, P, P]], size: 3, out: { item: B.CHEST, count: 1 } },
  { name: 'Torch ×4', shaped: [[I.COAL], [S]], size: 2, out: { item: B.TORCH, count: 4 } },
  { name: 'Lantern', shaped: [[I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT], [I.IRON_INGOT, B.TORCH, I.IRON_INGOT], [I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT]], size: 3, out: { item: B.LANTERN, count: 1 } },
  { name: 'Glass? no — Stone Bricks', hidden: true },
  { name: 'Stone Bricks', shaped: [[B.STONE, B.STONE], [B.STONE, B.STONE]], size: 2, out: { item: B.STONE_BRICKS, count: 4 } },
  { name: 'Sandstone', shaped: [[B.SAND, B.SAND], [B.SAND, B.SAND]], size: 2, out: { item: B.SANDSTONE, count: 1 } },
  { name: 'Bricks', shaped: [[I.BRICK_ITEM, I.BRICK_ITEM], [I.BRICK_ITEM, I.BRICK_ITEM]], size: 2, out: { item: B.BRICKS, count: 1 } },
  { name: 'Redstone Lamp', shaped: [[null, I.REDSTONE_DUST, null], [I.REDSTONE_DUST, B.GLOWSTONE, I.REDSTONE_DUST], [null, I.REDSTONE_DUST, null]], size: 3, out: { item: B.REDSTONE_LAMP, count: 1 } },
  { name: 'Lever', shaped: [[S], [C]], size: 2, out: { item: B.LEVER, count: 1 } },
  { name: 'Wooden Pickaxe', shaped: [[P, P, P], [null, S, null], [null, S, null]], size: 3, out: { item: toolId(0, 0), count: 1 } },
  { name: 'Stone Pickaxe', shaped: [[C, C, C], [null, S, null], [null, S, null]], size: 3, out: { item: toolId(1, 0), count: 1 } },
  { name: 'Iron Pickaxe', shaped: [[I.IRON_INGOT, I.IRON_INGOT, I.IRON_INGOT], [null, S, null], [null, S, null]], size: 3, out: { item: toolId(2, 0), count: 1 } },
  { name: 'Golden Pickaxe', shaped: [[I.GOLD_INGOT, I.GOLD_INGOT, I.GOLD_INGOT], [null, S, null], [null, S, null]], size: 3, out: { item: toolId(3, 0), count: 1 } },
  { name: 'Diamond Pickaxe', shaped: [[I.DIAMOND, I.DIAMOND, I.DIAMOND], [null, S, null], [null, S, null]], size: 3, out: { item: toolId(4, 0), count: 1 } },
  { name: 'Wooden Axe', shaped: [[P, P], [P, S], [null, S]], size: 3, mirror: true, out: { item: toolId(0, 1), count: 1 } },
  { name: 'Stone Axe', shaped: [[C, C], [C, S], [null, S]], size: 3, mirror: true, out: { item: toolId(1, 1), count: 1 } },
  { name: 'Iron Axe', shaped: [[I.IRON_INGOT, I.IRON_INGOT], [I.IRON_INGOT, S], [null, S]], size: 3, mirror: true, out: { item: toolId(2, 1), count: 1 } },
  { name: 'Diamond Axe', shaped: [[I.DIAMOND, I.DIAMOND], [I.DIAMOND, S], [null, S]], size: 3, mirror: true, out: { item: toolId(4, 1), count: 1 } },
  { name: 'Wooden Shovel', shaped: [[P], [S], [S]], size: 3, out: { item: toolId(0, 2), count: 1 } },
  { name: 'Stone Shovel', shaped: [[C], [S], [S]], size: 3, out: { item: toolId(1, 2), count: 1 } },
  { name: 'Iron Shovel', shaped: [[I.IRON_INGOT], [S], [S]], size: 3, out: { item: toolId(2, 2), count: 1 } },
  { name: 'Diamond Shovel', shaped: [[I.DIAMOND], [S], [S]], size: 3, out: { item: toolId(4, 2), count: 1 } },
  { name: 'Wooden Sword', shaped: [[P], [P], [S]], size: 3, out: { item: toolId(0, 3), count: 1 } },
  { name: 'Stone Sword', shaped: [[C], [C], [S]], size: 3, out: { item: toolId(1, 3), count: 1 } },
  { name: 'Iron Sword', shaped: [[I.IRON_INGOT], [I.IRON_INGOT], [S]], size: 3, out: { item: toolId(2, 3), count: 1 } },
  { name: 'Diamond Sword', shaped: [[I.DIAMOND], [I.DIAMOND], [S]], size: 3, out: { item: toolId(4, 3), count: 1 } },
  { name: 'Golden Sword', shaped: [[I.GOLD_INGOT], [I.GOLD_INGOT], [S]], size: 3, out: { item: toolId(3, 3), count: 1 } },
  { name: 'Wooden Hoe', shaped: [[P, P], [null, S], [null, S]], size: 3, mirror: true, out: { item: toolId(0, 4), count: 1 } },
  { name: 'Stone Hoe', shaped: [[C, C], [null, S], [null, S]], size: 3, mirror: true, out: { item: toolId(1, 4), count: 1 } },
  { name: 'Iron Hoe', shaped: [[I.IRON_INGOT, I.IRON_INGOT], [null, S], [null, S]], size: 3, mirror: true, out: { item: toolId(2, 4), count: 1 } },
  { name: 'Diamond Hoe', shaped: [[I.DIAMOND, I.DIAMOND], [null, S], [null, S]], size: 3, mirror: true, out: { item: toolId(4, 4), count: 1 } },
  { name: 'Bread', shaped: [[I.WHEAT_ITEM, I.WHEAT_ITEM, I.WHEAT_ITEM]], size: 3, out: { item: I.BREAD, count: 1 } },
  { name: 'Bookshelf', shaped: [[P, P, P], [I.WHEAT_ITEM, I.WHEAT_ITEM, I.WHEAT_ITEM], [P, P, P]], size: 3, out: { item: B.BOOKSHELF, count: 1 } },
  { name: 'Bed', shaped: [[B.WOOL, B.WOOL, B.WOOL], [P, P, P]], size: 3, out: { item: B.BED, count: 1 } },
];
RECIPES.splice(RECIPES.findIndex(r => r.hidden), 1); // remove placeholder

/** Try match a crafting grid (array of item ids length size*size) against RECIPES */
function matchRecipe(gridIds, gridSize) {
  const present = gridIds.filter(x => x);
  for (const r of RECIPES) {
    if (r.size !== gridSize && !(r.shapeless && gridSize >= 1)) continue;
    if (r.shapeless) {
      if (present.length !== r.shapeless.length) continue;
      const pool = r.shapeless.slice();
      let ok = true;
      for (const p of present) {
        const idx = pool.indexOf(p);
        if (idx === -1) { ok = false; break; }
        pool.splice(idx, 1);
      }
      if (ok) return r;
    } else {
      if (!r.shaped || r.size !== gridSize) continue;
      const tryMirror = (pat) => {
        // find bounding box of pattern
        let minX = 99, maxX = -1, minY = 99, maxY = -1;
        for (let y = 0; y < pat.length; y++) for (let x = 0; x < pat[y].length; x++)
          if (pat[y][x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        if (maxX < 0) return false;
        const w = maxX - minX + 1, h = maxY - minY + 1;
        // bounding box of grid contents must equal pattern bbox dims
        let gMinX = 99, gMaxX = -1, gMinY = 99, gMaxY = -1;
        for (let y = 0; y < gridSize; y++) for (let x = 0; x < gridSize; x++)
          if (gridIds[y * gridSize + x]) { gMinX = Math.min(gMinX, x); gMaxX = Math.max(gMaxX, x); gMinY = Math.min(gMinY, y); gMaxY = Math.max(gMaxY, y); }
        if (gMaxX < 0) return false;
        if ((gMaxX - gMinX + 1) !== w || (gMaxY - gMinY + 1) !== h) return false;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const cell = pat[minY + y][minX + x];
          const gid = gridIds[(gMinY + y) * gridSize + (gMinX + x)];
          if ((cell || null) !== (gid || null)) return false;
        }
        return true;
      };
      if (tryMirror(r.shaped)) return r;
      if (r.mirror) {
        const mirrored = r.shaped.map(row => row.slice().reverse());
        if (tryMirror(mirrored)) return r;
      }
    }
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { B, I, BLOCKS, ITEMS, RECIPES, SMELTING, TOOL_MATS, TOOL_KINDS, TOOL_MAT_STATS, toolId, itemName, maxStack, isSolid, isOpaque, isCross, isLiquid, matchRecipe };
}
if (typeof self !== 'undefined') { self.BLOCKS_MOD = { B, I, BLOCKS, ITEMS, RECIPES, SMELTING, TOOL_MATS, TOOL_KINDS, TOOL_MAT_STATS, toolId, itemName, maxStack, isSolid, isOpaque, isCross, isLiquid, matchRecipe }; }
})();
