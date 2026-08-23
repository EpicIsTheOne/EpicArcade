// Tile name -> index mapping (kept tiny; imported by atlas + mesher + icons)
'use strict';
(function () {
const TILE_NAMES = [
  'stone', 'dirt', 'grass_top', 'grass_side', 'cobblestone', 'planks', 'log_side', 'log_top',
  'leaves', 'sand', 'bedrock', 'gravel', 'snow', 'snow_side', 'ice', 'sandstone',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'redstone_ore', 'clay', 'obsidian', 'mossy_cobble',
  'stone_bricks', 'bricks', 'glass', 'glowstone', 'lantern', 'torch', 'wool', 'bookshelf',
  'chest', 'furnace', 'furnace_lit', 'crafting_top', 'crafting_side', 'spruce_log_side', 'spruce_log_top', 'spruce_leaves',
  'birch_log_side', 'birch_log_top', 'birch_leaves', 'tallgrass', 'flower_red', 'flower_yellow', 'sapling', 'farmland',
  'wheat0', 'wheat1', 'wheat2', 'wheat3', 'wire_off', 'wire_on', 'lever', 'lever_on',
  'lamp_off', 'lamp_on', 'cactus_side', 'cactus_top', 'water_still', 'lava_still', 'bed_top', 'bed_side',
];
const TILE_INDEX = {};
TILE_NAMES.forEach((n, i) => { TILE_INDEX[n] = i; });
if (typeof module !== 'undefined' && module.exports) module.exports = { TILE_NAMES, TILE_INDEX };
if (typeof self !== 'undefined') { self.TILE_META = { TILE_NAMES, TILE_INDEX }; }
})();
