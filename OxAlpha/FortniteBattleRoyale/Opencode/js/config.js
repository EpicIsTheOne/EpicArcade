export const CFG = {
  TITLE: 'SKYFALL ROYALE',
  ISLAND: 'AURUM ISLE',
  WORLD_SIZE: 1000,
  ISLAND_R: 380,
  WATER_Y: 0,
  SEED: 20260825,

  GRAVITY: 22,
  WALK: 5.4,
  SPRINT: 8.6,
  CROUCH_SPEED: 2.9,
  SWIM_SPEED: 3.2,
  JUMP_V: 7.8,
  PLAYER_R: 0.45,
  EYE_H: 1.62,
  CROUCH_EYE: 1.05,

  CELL: 4,
  BUILD_COST: 10,
  MAT_CAP: 500,
  START_WOOD: 40,

  MAX_HP: 100,
  MAX_SHIELD: 100,
  STORM_DPS_BASE: 1,

  TOTAL_PLAYERS: 40,

  COLORS: {
    sky_top: 0x2f66c4,
    sky_horizon: 0xbfdcf0,
    sun: 0xfff2d8,
    fog: 0xcfe3f5,
    storm: 0xb44df0,
    water: 0x2a7fb8,
    wood: 0xa97b50,
    brick: 0x9a6a5a,
    metal: 0x8e99a6,
  },
};

export const RARITY = [
  { id: 'common', name: 'Common', color: '#b8bcc4', mult: 1.0 },
  { id: 'uncommon', name: 'Uncommon', color: '#57c94f', mult: 1.06 },
  { id: 'rare', name: 'Rare', color: '#3fa9ff', mult: 1.12 },
  { id: 'epic', name: 'Epic', color: '#b05cff', mult: 1.19 },
  { id: 'legendary', name: 'Legendary', color: '#ffa63f', mult: 1.27 },
];

export const AMMO_TYPES = ['light', 'medium', 'heavy', 'shells', 'rockets'];

export const CONSUMABLES = {
  bandage: { name: 'Bandage', time: 3.0, hp: 15, cap: 75, stack: 15, color: '#f26d6d' },
  medkit: { name: 'Medkit', time: 7.0, hp: 100, cap: 100, stack: 3, color: '#ff4d4d' },
  smallShield: { name: 'Shield Potion', time: 2.0, shield: 25, cap: 50, stack: 6, color: '#57c9ff' },
  bigShield: { name: 'Big Shield Potion', time: 4.0, shield: 50, cap: 100, stack: 2, color: '#3f6dff' },
};
