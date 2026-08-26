// ---------- Game data: items, machines, recipes, plots, upgrades ----------
export const CELL = 2;

export const ITEMS = {
  iron_ore:     { name: 'Iron Ore',     price: 4,  color: 0xaab2c0 },
  copper_ore:   { name: 'Copper Ore',   price: 6,  color: 0xe08a4e },
  iron_ingot:   { name: 'Iron Ingot',   price: 14, color: 0xe8edf5 },
  copper_ingot: { name: 'Copper Ingot', price: 26, color: 0xf2a25c },
  gear:         { name: 'Gear',         price: 38, color: 0xcdd5e0 },
  circuit:      { name: 'Circuit',      price: 95, color: 0x58d873 },
};

export const SMELT_MAP = { iron_ore: 'iron_ingot', copper_ore: 'copper_ingot' };
export const isOre = t => t === 'iron_ore' || t === 'copper_ore';

// Assembler tries recipes in order; crafts the first one it can afford ingredients for.
export const RECIPES = [
  { out: 'circuit', inputs: { iron_ingot: 1, copper_ingot: 1 }, time: 2.5 },
  { out: 'gear',    inputs: { iron_ingot: 2 },                  time: 2.0 },
];

// rot index -> direction the machine faces (output side). Meshes authored facing +X.
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const BASE = {
  extractorTime: 2.6,   // sec per ore
  smelterTime: 3.2,     // sec per ingot
  beltSpeed: 1.6,       // cells per second
};

export const MACHINES = {
  extractor: { name: 'Extractor', cost: 110, icon: '⛏', h: 1.25,
    desc: 'Place on an ore deposit. Mines forever.' },
  conveyor:  { name: 'Conveyor',  cost: 12,  icon: '➡', h: 0.55,
    desc: 'Moves items in its arrow direction.' },
  smelter:   { name: 'Smelter',   cost: 260, icon: '🔥', h: 1.7,
    desc: 'Ore → Ingots. Much higher value.' },
  assembler: { name: 'Assembler', cost: 580, icon: '⚙', h: 1.35,
    desc: 'Crafts Gears & Circuits from ingots.' },
  storage:   { name: 'Storage',   cost: 70,  icon: '📦', h: 1.05,
    desc: '16-slot buffer. Smooths jams.' },
  seller:    { name: 'Market',    cost: 140, icon: '💰', h: 1.75,
    desc: 'Sells any item handed to it. $$' },
};
export const MACHINE_ORDER = ['extractor', 'conveyor', 'smelter', 'assembler', 'storage', 'seller'];

// Solid = player collides. Conveyors are step-over-able.
export const SOLID = new Set(['extractor', 'smelter', 'assembler', 'storage', 'seller']);

export const PLOTS = [
  { id: 0, name: 'Home Plot',  cost: 0,    x0: 0, z0: 0, w: 8, h: 8,
    deps: [ [2, 2, 'iron_ore'], [5, 2, 'iron_ore'], [2, 5, 'iron_ore'], [6, 6, 'copper_ore'] ] },
  { id: 1, name: 'East Field', cost: 750,  x0: 8, z0: 0, w: 8, h: 8,
    deps: [ [9, 3, 'copper_ore'], [13, 2, 'copper_ore'], [12, 6, 'iron_ore'] ] },
  { id: 2, name: 'South Yard', cost: 1600, x0: 0, z0: 8, w: 8, h: 8,
    deps: [ [2, 11, 'iron_ore'], [5, 10, 'iron_ore'], [5, 12, 'copper_ore'] ] },
  { id: 3, name: 'Great Flat', cost: 3200, x0: 8, z0: 8, w: 8, h: 8,
    deps: [ [10, 12, 'copper_ore'], [13, 10, 'copper_ore'], [11, 13, 'iron_ore'], [13, 13, 'iron_ore'] ] },
];
export const START_MONEY = 480;
export const DEMOLISH_REFUND = 0.6;
export const BELT_GAP = 0.36;
export const OUT_CAP = 3;
export const STORAGE_CAP = 16;

export const UPGRADES = {
  belt:  { name: 'Conveyor Speed', base: 180, mult: 2.2, max: 4, desc: '+35% belt speed per level' },
  drill: { name: 'Extractor Rate', base: 240, mult: 2.2, max: 4, desc: '+30% mining speed per level' },
  furn:  { name: 'Smelter Speed',  base: 320, mult: 2.2, max: 4, desc: '+30% smelting speed per level' },
  asm:   { name: 'Assembler Speed',base: 420, mult: 2.2, max: 4, desc: '+30% crafting speed per level' },
};
export const upgradeCost = (id, lv) => Math.round(UPGRADES[id].base * Math.pow(UPGRADES[id].mult, lv));
