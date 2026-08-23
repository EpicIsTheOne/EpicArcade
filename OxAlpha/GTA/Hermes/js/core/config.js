// ============================================================
// NEON MERIDIAN — core/config.js
// Tuning constants, quality presets, vehicle catalog.
// ============================================================
'use strict';

const CONFIG = {
  WORLD_SEED: 20260821,

  // Blocks: city spans x,z in [0, GRID*BLOCK]. Roads run along grid lines.
  GRID: 14,                 // 14x14 blocks
  BLOCK: 64,                // block size (m)
  ROAD_W: 12,               // road width (m)
  SIDEWALK_W: 4,
  WATER_Z: -6,              // sea level

  PLAYER: {
    WALK: 4.2, RUN: 6.6, SPRINT: 9.2,
    ACCEL: 40, JUMP_V: 8.4, GRAVITY: 24,
    EYE: 1.62, HEIGHT: 1.78, RADIUS: 0.38,
    MAX_HP: 100, ARMOR_MAX: 100,
    MELEE_RANGE: 2.2, MELEE_DMG: 24, MELEE_CD: 0.45,
  },

  CAMERA: {
    FOOT_DIST: 5.2, CAR_DIST: 8.6, TRUCK_DIST: 10.5,
    MIN_PITCH: -1.25, MAX_PITCH: 1.15,   // radians; positive = looking UP
    SENS: 0.0023,                        // rad per px @100%
    SHOULDER: 0.55,                      // aim-mode lateral offset
    COLLIDE_PAD: 0.35,
  },

  VEHICLE_ENTER_DIST: 4.4,
  NPC_COUNT_TARGET: { ultra: 150, high: 130, medium: 90, low: 55 },
  TRAFFIC_TARGET: { ultra: 34, high: 28, medium: 20, low: 12 },
  POLICE_MAX_ACTIVE: 8,

  WEAPONS: [
    { id: 'fist',   name: 'Fists',       dmg: 24, rate: 2.2, range: 2.2, auto: false, spread: 0, ammoUse: 0, kick: 0 },
    { id: 'bat',    name: 'Baseball Bat',dmg: 42, rate: 1.5, range: 2.6, auto: false, spread: 0, ammoUse: 0, kick: 0 },
    { id: 'pistol', name: 'K-9 Pistol',  dmg: 26, rate: 3.5, range: 90,  auto: false, spread: 0.010, ammoUse: 1, clip: 15, kick: 0.9 },
    { id: 'smg',    name: 'Viper SMG',   dmg: 17, rate: 10.5,range: 70,  auto: true,  spread: 0.032, ammoUse: 1, clip: 30, kick: 0.55 },
    { id: 'rifle',  name: 'Longhorn AR', dmg: 30, rate: 7.0, range: 140, auto: true,  spread: 0.018, ammoUse: 1, clip: 30, kick: 0.8 },
  ],

  WANTED: {
    DECAY_S: [0, 22, 30, 38, 46],        // seconds of clean escape to drop a star
    SPAWN_INTERVAL: [[999,999],[16,22],[11,16],[8,12],[5.5,8.5]], // [min,max] s between spawns per level
    PURSUIT_GIVEUP_M: [0, 260, 320, 380, 460],  // straight-line distance before search mode
  },

  QUALITY_PRESETS: {
    ultra:  { pixelRatio: 1.0, shadows: true, shadowSize: 2048, bloom: true, rain: 9000, drawDist: 900, reflections: 'planar-lite', ao: true, npcDensity: 'ultra', traffic: 'ultra' },
    high:   { pixelRatio: 1.0, shadows: true, shadowSize: 1536, bloom: true, rain: 6000, drawDist: 750, reflections: 'env', ao: false, npcDensity: 'high', traffic: 'high' },
    medium: { pixelRatio: 0.85, shadows: true, shadowSize: 1024, bloom: true, rain: 3500, drawDist: 550, reflections: 'env', ao: false, npcDensity: 'medium', traffic: 'medium' },
    low:    { pixelRatio: 0.75, shadows: false, shadowSize: 512, bloom: false, rain: 1600, drawDist: 420, reflections: 'none', ao: false, npcDensity: 'low', traffic: 'low' },
    qa:     { pixelRatio: 0.66, shadows: false, shadowSize: 512, bloom: false, rain: 500, drawDist: 380, reflections: 'none', ao: false, npcDensity: 'low', traffic: 'low', headlessHint: true },
  },

  DISTRICTS: {
    downtown:  { name: 'Meridian Core',  base: 0x8f97a8, accent: 0x63c7ff, heightMin: 34, heightMax: 118, density: 0.92 },
    oldtown:   { name: 'Old Harbor',     base: 0xa08b72, accent: 0xffb35c, heightMin: 10, heightMax: 30,  density: 0.65 },
    residential:{name: 'Ashford Heights',base: 0x9aa48e, accent: 0xa8e063, heightMin: 8,  heightMax: 22,  density: 0.55 },
    industrial:{ name: 'Rustyard Docks', base: 0x7d7f88, accent: 0xff8a3c, heightMin: 8,  heightMax: 20,  density: 0.45 },
    park:      { name: 'Halcyon Park',   base: 0x4e7a44, accent: 0x9fe07a, heightMin: 0,  heightMax: 0,   density: 0 },
    beach:     { name: 'Sable Strand',   base: 0xcbb98a, accent: 0xffd98c, heightMin: 4,  heightMax: 10,  density: 0.2 },
  },

  COLORS: {
    skyDayTop: 0x2f6fd0, skyDayHorizon: 0xbcd8ee,
    skyDuskTop: 0x2a2450, skyDuskHorizon: 0xff9d5c,
    skyNightTop: 0x05070f, skyNightHorizon: 0x101a2e,
    sunDay: 0xfff2dd, sunDusk: 0xffa04d, sunNight: 0x8fa8ff,
    fogDay: 0xbcd2e8, fogDusk: 0xe8a06a, fogNight: 0x0a1220,
    water: 0x0e3f52,
  },
};

if (typeof module !== 'undefined') module.exports = { CONFIG };
