// Block registry. Tile names are resolved to atlas indices at boot by atlas.js.
export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, PLANKS: 5, SAND: 6, SANDSTONE: 7,
  GRAVEL: 8, LOG_OAK: 9, LEAVES_OAK: 10, WATER: 11, GLASS: 12,
  COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16, EMBER_ORE: 17, BEDROCK: 18,
  SNOW_GRASS: 19, SNOW_BLOCK: 20, ICE: 21, CACTUS: 22,
  TALLGRASS: 23, FLOWER_RED: 24, FLOWER_YELLOW: 25, DEADBUSH: 26, SAPLING: 27,
  WHEAT0: 28, WHEAT1: 29, WHEAT2: 30, WHEAT3: 31, FARMLAND: 32,
  TORCH: 33, GLOWSTONE: 34, CRAFT_TABLE: 35, FURNACE: 36, FURNACE_LIT: 37,
  CHEST: 38, BED: 39, LADDER: 40,
  LEVER_OFF: 41, LEVER_ON: 42, WIRE_OFF: 43, WIRE_ON: 44, LAMP_OFF: 45, LAMP_ON: 46,
  MOSSY: 47, LOG_BIRCH: 48, LEAVES_BIRCH: 49, PINE_LOG: 50, PINE_LEAVES: 51,
  PUMPKIN: 52, BOOKSHELF: 53, OBSIDIAN: 54,
  WATER_F1: 55, WATER_F2: 56, WATER_F3: 57, WATER_F4: 58,
  LAVA: 59,
};

const T = null; // tile placeholder resolved later

function cube(name, opts) {
  return { name, solid: true, opaque: true, render: 'cube', hardness: 1.5, tool: null, tier: 0,
    requireTool: false, drop: null, lightEmit: 0, glow: false, attach: 'any', gravity: false,
    replaceable: false, liquid: false, ...opts };
}
function cross(name, opts) {
  return { ...cube(name, { ...opts }), solid: false, opaque: false, render: 'cross', hardness: 0.05, attach: 'ground' };
}

export const BLOCKS = [];
export function def(id, block) { BLOCKS[id] = block; }

def(B.AIR, { name: 'Air', solid: false, opaque: false, render: 'air', replaceable: true });
def(B.STONE, cube('Stone', { tile: 'stone', hardness: 7.5, tool: 'pickaxe', requireTool: true, drop: [[B.COBBLE, 1]] }));
def(B.GRASS, cube('Grass Block', { tileTop: 'grass_top', tileSide: 'grass_side', tileBottom: 'dirt',
  hardness: 0.9, tool: 'shovel', drop: [[B.DIRT, 1]], tint: 'grass' }));
def(B.DIRT, cube('Dirt', { tile: 'dirt', hardness: 0.75, tool: 'shovel' }));
def(B.COBBLE, cube('Cobblestone', { tile: 'cobble', hardness: 10, tool: 'pickaxe', requireTool: true }));
def(B.PLANKS, cube('Planks', { tile: 'planks', hardness: 3, tool: 'axe', fuel: 15 }));
def(B.SAND, cube('Sand', { tile: 'sand', hardness: 0.75, tool: 'shovel', gravity: true }));
def(B.SANDSTONE, cube('Sandstone', { tile: 'sandstone', hardness: 4, tool: 'pickaxe', requireTool: true }));
def(B.GRAVEL, cube('Gravel', { tile: 'gravel', hardness: 0.9, tool: 'shovel', gravity: true }));
def(B.LOG_OAK, cube('Oak Log', { tileTop: 'log_oak_top', tileSide: 'log_oak', tileBottom: 'log_oak_top', hardness: 3, tool: 'axe', fuel: 15 }));
def(B.LEAVES_OAK, cube('Oak Leaves', { tile: 'leaves_oak', opaque: false, cutout: true, hardness: 0.3,
  dropFn: 'oakLeaves', tint: 'foliage' }));
def(B.WATER, { name: 'Water', solid: false, opaque: false, render: 'liquid', liquid: true, hardness: -1, replaceable: true });
def(B.GLASS, cube('Glass', { tile: 'glass', opaque: false, cutout: true, hardness: 0.4, drop: [] }));
def(B.COAL_ORE, cube('Coal Ore', { tile: 'coal_ore', hardness: 15, tool: 'pickaxe', requireTool: true, drop: [['coal', 1]] }));
def(B.IRON_ORE, cube('Iron Ore', { tile: 'iron_ore', hardness: 22.5, tool: 'pickaxe', requireTool: true, tier: 1 }));
def(B.GOLD_ORE, cube('Gold Ore', { tile: 'gold_ore', hardness: 22.5, tool: 'pickaxe', requireTool: true, tier: 2 }));
def(B.DIAMOND_ORE, cube('Diamond Ore', { tile: 'diamond_ore', hardness: 22.5, tool: 'pickaxe', requireTool: true, tier: 2, drop: [['diamond', 1]] }));
def(B.EMBER_ORE, cube('Ember Ore', { tile: 'ember_ore', hardness: 22.5, tool: 'pickaxe', requireTool: true, tier: 1,
  drop: [['spark_dust', 3]], dropMax: 5, lightEmit: 5, glow: true }));
def(B.BEDROCK, cube('Bedrock', { tile: 'bedrock', hardness: -1 }));
def(B.SNOW_GRASS, cube('Snowy Grass', { tileTop: 'snow', tileSide: 'snow_side', tileBottom: 'dirt',
  hardness: 0.9, tool: 'shovel', drop: [[B.DIRT, 1]] }));
def(B.SNOW_BLOCK, cube('Snow Block', { tile: 'snow', hardness: 0.6, tool: 'shovel' }));
def(B.ICE, cube('Ice', { tile: 'ice', opaque: false, cutout: true, hardness: 0.7, tool: 'pickaxe', drop: [], slip: true }));
def(B.CACTUS, cube('Cactus', { tileTop: 'cactus_top', tileSide: 'cactus_side', hardness: 0.6, hurt: 1 }));
def(B.TALLGRASS, cross('Tall Grass', { tile: 'tallgrass', dropFn: 'seeds', tint: 'grass', replaceable: true, fuel: 1 }));
def(B.FLOWER_RED, cross('Ember Bloom', { tile: 'flower_red' }));
def(B.FLOWER_YELLOW, cross('Sun Bloom', { tile: 'flower_yellow' }));
def(B.DEADBUSH, cross('Dead Bush', { tile: 'deadbush', drop: [['stick', 2]], replaceable: true, fuel: 1 }));
def(B.SAPLING, cross('Sapling', { tile: 'sapling', growTo: 'tree' }));
for (let i = 0; i < 4; i++) {
  def(B.WHEAT0 + i, cross(`Wheat${i}`, { tile: 'wheat' + i, cropStage: i, solid: false,
    drop: i === 3 ? [['wheat', 1], ['seeds', 2]] : [['seeds', 1]] }));
}
def(B.FARMLAND, cube('Farmland', { tileTop: 'farmland', tileSide: 'dirt', tileBottom: 'dirt', hardness: 0.75, tool: 'shovel', drop: [[B.DIRT, 1]] }));
def(B.TORCH, { name: 'Torch', solid: false, opaque: false, render: 'torch', tile: 'torch', hardness: 0.05,
  lightEmit: 14, glow: true, attach: 'ground', fuel: 2 });
def(B.GLOWSTONE, cube('Lumen Block', { tile: 'glowstone', hardness: 0.6, lightEmit: 15, glow: true }));
def(B.CRAFT_TABLE, cube('Crafting Table', { tileTop: 'craft_top', tileSide: 'craft_side', tileBottom: 'planks',
  hardness: 3, tool: 'axe', interact: 'crafting', fuel: 15 }));
def(B.FURNACE, cube('Furnace', { tileTop: 'furnace_top', tileSide: 'furnace_side', tileFront: 'furnace_front',
  hardness: 5.25, tool: 'pickaxe', requireTool: true, interact: 'furnace' }));
def(B.FURNACE_LIT, cube('Furnace', { tileTop: 'furnace_top', tileSide: 'furnace_side', tileFront: 'furnace_lit',
  hardness: 5.25, tool: 'pickaxe', requireTool: true, interact: 'furnace', lightEmit: 13, glow: true, drop: [[B.FURNACE, 1]] }));
def(B.CHEST, cube('Chest', { tileTop: 'chest_top', tileSide: 'chest_side', tileFront: 'chest_front',
  hardness: 3.75, tool: 'axe', interact: 'chest' }));
def(B.BED, cube('Bed', { tileTop: 'bed_top', tileSide: 'planks', tileBottom: 'planks', hardness: 0.4,
  solid: false, opaque: false, render: 'slab', interact: 'bed' }));
def(B.LADDER, { name: 'Ladder', solid: false, opaque: false, render: 'ladder', tile: 'ladder', hardness: 0.5,
  attach: 'wall', climb: true, fuel: 5 });
def(B.LEVER_OFF, { name: 'Lever', solid: false, opaque: false, render: 'torch', tile: 'lever', hardness: 0.5,
  attach: 'ground', interact: 'lever' });
def(B.LEVER_ON, { name: 'Lever', solid: false, opaque: false, render: 'torch', tile: 'lever_on', hardness: 0.5,
  attach: 'ground', interact: 'lever', powerSrc: true });
def(B.WIRE_OFF, { name: 'Spark Wire', solid: false, opaque: false, render: 'carpet', tile: 'wire_off',
  hardness: 0.05, attach: 'ground', conducts: true });
def(B.WIRE_ON, { name: 'Spark Wire', solid: false, opaque: false, render: 'carpet', tile: 'wire_on',
  hardness: 0.05, attach: 'ground', conducts: true, lightEmit: 4, glow: true });
def(B.LAMP_OFF, cube('Power Lamp', { tile: 'lamp_off', hardness: 1.2, conductTarget: true }));
def(B.LAMP_ON, cube('Power Lamp', { tile: 'lamp_on', hardness: 1.2, conductTarget: true, lightEmit: 15, glow: true, drop: [[B.LAMP_OFF, 1]] }));
def(B.MOSSY, cube('Mossy Cobblestone', { tile: 'mossy', hardness: 10, tool: 'pickaxe', requireTool: true }));
def(B.LOG_BIRCH, cube('Birch Log', { tileTop: 'log_oak_top', tileSide: 'birch_log', tileBottom: 'log_oak_top', hardness: 3, tool: 'axe', fuel: 15 }));
def(B.LEAVES_BIRCH, cube('Birch Leaves', { tile: 'leaves_birch', opaque: false, cutout: true, hardness: 0.3, dropFn: 'oakLeaves', tint: 'foliage' }));
def(B.PINE_LOG, cube('Pine Log', { tileTop: 'log_oak_top', tileSide: 'pine_log', tileBottom: 'log_oak_top', hardness: 3, tool: 'axe', fuel: 15 }));
def(B.PINE_LEAVES, cube('Pine Needles', { tile: 'pine_leaves', opaque: false, cutout: true, hardness: 0.3, dropFn: 'oakLeaves', tint: 'foliage_dark' }));
def(B.PUMPKIN, cube('Pumpkin', { tileTop: 'pumpkin_top', tileSide: 'pumpkin_side', hardness: 1.5, tool: 'axe' }));
def(B.BOOKSHELF, cube('Bookshelf', { tileTop: 'planks', tileSide: 'bookshelf', hardness: 3, tool: 'axe', fuel: 15 }));
def(B.OBSIDIAN, cube('Obsidian', { tile: 'obsidian', hardness: 50, tool: 'pickaxe', requireTool: true, tier: 3 }));

for (let lvl = 1; lvl <= 4; lvl++) {
  def(B.WATER_F1 + lvl - 1, { name: 'Water', solid: false, opaque: false, render: 'liquid', liquid: true,
    flowLevel: lvl, hardness: -1, replaceable: true });
}
def(B.LAVA, { name: 'Lava', solid: false, opaque: false, render: 'liquid', liquid: true, lava: true,
  hardness: -1, lightEmit: 15, glow: true, replaceable: false });

export function isSolid(id) { return !!(BLOCKS[id] && BLOCKS[id].solid); }
export function isOpaque(id) { return !!(BLOCKS[id] && BLOCKS[id].opaque); }
export function isLiquid(id) { return id === B.WATER || (id >= B.WATER_F1 && id <= B.WATER_F4); }
export function isAir(id) { return id === B.AIR; }
export function isReplaceable(id) { return !!(BLOCKS[id] && BLOCKS[id].replaceable); }
export function lightOf(id) { return (BLOCKS[id] && BLOCKS[id].lightEmit) || 0; }
