// HYPERLINE — central configuration
export const CFG = {
  VERSION: '1.0.0',
  SAVE_KEY: 'hyperline_save_v1',

  LANES: [-2.3, 0, 2.3],
  LANE_SNAP: 13.5,

  PHYS: {
    GRAVITY: 40,
    JUMP_V: 14.2,
    FASTFALL_V: -26,
    ROLL_TIME: 0.55,
    PLAYER_H: 1.78,
    PLAYER_W: 0.62,
    ROLL_H: 0.72,
    COYOTE: 0.09,
    BUFFER: 0.15,
    STUMBLE_INVULN: 1.05,
    STUMBLE_SLOW: 0.52,
    STUMBLE_RECOVER: 1.25,
  },

  SPEED: {
    START: 15,
    MAX: 46,
    // v(dist) curve params
    RAMP_DIST: 2600,
    RAMP_POW: 0.72,
    RAMP_SPAN: 24,   // v = START + SPAN * (dist/RAMP_DIST)^POW capped MAX
  },

  WORLD: {
    CHUNK_LEN: 36,
    DRAW_AHEAD: 340,
    CULL_BEHIND: 70,
    DECK_W: 10.4,
    RAIL_GAUGE: 0.72,
    TRAIN_ROOF_Y: 3.42,
    TRAIN_FLOOR: 0.28,
  },

  CHASER: {
    LURK: 12.5,
    THREAT: 4.2,
    INTRO: 6.5,
    EASE_BACK_T: 4.5,
    CATCH_ON_STUMBLE_IF_CLOSER_THAN: 8,
  },

  POWERUPS: {
    MAGNET: { DUR: [8, 10, 12, 14, 16, 18], RADIUS: [3.4, 4.2, 5.0, 5.8, 6.6, 7.4] },
    JETPACK: { DUR: [4.5, 5.3, 6.1, 6.9, 7.7, 8.5], Y: 7.3 },
    X2: { DUR: [7, 8.5, 10, 11.5, 13, 14.5] },
    SNEAKERS: { DUR: [6, 7.5, 9, 10.5, 12, 13.5], JUMP_MULT: 1.55 },
    SHIELD: {},
    BOARD: { BASE_DUR: 22 },
  },

  SCORE: {
    COIN: 12,
    GEM: 140,
    NEAR_MISS: 30,
    COMBO_STEP: 60,
  },

  MISSION_RANK_MAX: 5,

  QUALITY: {
    ultra: { pixelRatioCap: 2.0, shadows: 2048, bloom: true, msaa: 4, drawAhead: 360, clouds: true, particles: 1.0, cityDensity: 1.0 },
    high:  { pixelRatioCap: 1.75, shadows: 1536, bloom: true, msaa: 4, drawAhead: 330, clouds: true, particles: 0.85, cityDensity: 0.9 },
    medium:{ pixelRatioCap: 1.4, shadows: 1024, bloom: false, msaa: 0, drawAhead: 300, clouds: true, particles: 0.6, cityDensity: 0.75 },
    low:   { pixelRatioCap: 1.0, shadows: 0, bloom: false, msaa: 0, drawAhead: 250, clouds: false, particles: 0.35, cityDensity: 0.55 },
    qa:    { pixelRatioCap: 1.0, shadows: 0, bloom: false, msaa: 0, drawAhead: 210, clouds: false, particles: 0.15, cityDensity: 0.4 },
  },

  PALETTE: {
    skyTop: 0x2b1b5e, skyHorizon: 0xff9d5c, fogBase: 0xe98a63,
    sunColor: 0xffc07a, ambientDay: 0x6a5a9e,
    deckTop: 0x8d8577, gravel: 0x6f665a, railSteel: 0xb9bec9, sleeper: 0x5d4a38,
  },

  BIOMES: ['downtown', 'oldtown', 'industrial', 'greenway'],
  BIOME_LEN: 780,

  SHOP: {
    upgrades: [
      { id: 'magnet', name: 'Coin Magnet', desc: 'Longer pull + wider radius', base: 400, scale: 1.62, max: 5 },
      { id: 'jetpack', name: 'Sky Jetpack', desc: 'Fly above it all, longer burn', base: 500, scale: 1.62, max: 5 },
      { id: 'x2', name: 'Score x2', desc: 'Double points, longer', base: 450, scale: 1.6, max: 5 },
      { id: 'sneakers', name: 'Super Sneakers', desc: 'Higher jumps, longer', base: 350, scale: 1.58, max: 5 },
      { id: 'luck', name: 'Lucky Charm', desc: 'Powerups appear more often', base: 600, scale: 1.7, max: 5 },
      { id: 'board', name: 'Board Tuning', desc: 'Hoverboards last longer', base: 300, scale: 1.55, max: 5 },
      { id: 'turbo', name: 'Turbo Start', desc: 'Start each run with a boost', base: 800, scale: 2.0, max: 3 },
    ],
    boards: [
      { id: 'classic', name: 'Classic', desc: 'The trusty original.', cost: 0, dur: 22, color: 0x35e0d2, perk: null },
      { id: 'wave', name: 'Wave Rider', desc: '+10% coins while riding', cost: 2200, dur: 24, color: 0x2b8cff, perk: 'coins' },
      { id: 'comet', name: 'Comet', desc: 'Extra-long ride (34s)', cost: 5200, dur: 34, color: 0xffc93c, perk: null },
      { id: 'phantom', name: 'Phantom', desc: 'Snappier lanes + 32s', cost: 11000, dur: 32, color: 0xb38bff, perk: 'lanes' },
    ],
    chars: [
      { id: 'zip', name: 'Zip', desc: 'Courier kid. Never late.', cost: 0, perk: null,
        colors: { skin: 0xd99e77, hood: 0x27bfae, pants: 0x2c3055, cap: 0xff8c42, shoe: 0xf2f2f2 } },
      { id: 'nova', name: 'Nova', desc: '+5% coins picked up', cost: 3000, perk: 'coins',
        colors: { skin: 0xc98a6b, hood: 0xff4f81, pants: 0x301a45, cap: 0xffffff, shoe: 0xffd36b } },
      { id: 'bolt', name: 'Bolt', desc: '+15% near-miss points', cost: 7500, perk: 'nearmiss',
        colors: { skin: 0x8a5a3b, hood: 0xffd23c, pants: 0x22252e, cap: 0x22252e, shoe: 0xff8c42 } },
      { id: 'echo', name: 'Echo', desc: 'Powerups last +10%', cost: 15000, perk: 'dur',
        colors: { skin: 0xe0b08a, hood: 0x8a5cff, pants: 0x18324a, cap: 0x35e0d2, shoe: 0xf2f2f2 } },
    ],
    boardRefillCost: 450,
  },

  MISSION_TIERS: {
    coins_run: [150, 320, 550],
    coins_total: [500, 1200, 2400],
    jumps: [40, 90, 160],
    rolls: [25, 60, 110],
    powerups: [3, 6, 11],
    nearmiss: [8, 20, 36],
    dist_run: [700, 1500, 2800],
    score_run: [20000, 48000, 95000],
    roof_meters: [150, 380, 700],
    boxes: [2, 4, 7],
    gems: [1, 3, 6],
    trains_dodged: [3, 7, 12],
  },
};
export default CFG;
