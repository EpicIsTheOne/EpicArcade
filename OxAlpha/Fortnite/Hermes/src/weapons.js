// Weapons: original ISLEBREAK arsenal. Damage in HP (player 100hp + 100shield).
export const WEAPONS = {
  'raptor-ar': {
    name: 'Raptor AR', cls: 'AR', rarity: 3,
    dmg: 26, headMult: 1.5, rpm: 330, mag: 30, reload: 2.2,
    spread: 0.011, recoil: 0.011, adsZoom: 1.35,
    ammo: 'medium', auto: true, tracer: 0x8fd0ff,
  },
  'stinger-smg': {
    name: 'Stinger SMG', cls: 'SMG', rarity: 2,
    dmg: 15, headMult: 1.35, rpm: 720, mag: 35, reload: 2.0,
    spread: 0.03, recoil: 0.006, adsZoom: 1.2,
    ammo: 'light', auto: true, tracer: 0xa0ffd8,
  },
  'breaker-pump': {
    name: 'Breaker Pump', cls: 'SHOTGUN', rarity: 3,
    pellets: 9, dmg: 9, headMult: 1.6, rpm: 70, mag: 5, reload: 3.6,
    spread: 0.065, recoil: 0.05, adsZoom: 1.15,
    ammo: 'shells', auto: false, tracer: 0xffc07a,
  },
  'longshot-dmr': {
    name: 'Longshot DMR', cls: 'DMR', rarity: 4,
    dmg: 58, headMult: 2.0, rpm: 150, mag: 10, reload: 2.6,
    spread: 0.004, recoil: 0.02, adsZoom: 2.6,
    ammo: 'light', auto: false, scope: true, tracer: 0xffe08a,
  },
  'skycracker': {
    name: 'Skycracker Sniper', cls: 'SNIPER', rarity: 5,
    dmg: 105, headMult: 2.2, rpm: 33, mag: 1, reload: 2.9,
    spread: 0.001, recoil: 0.09, adsZoom: 4.0,
    ammo: 'heavy', auto: false, scope: true, tracer: 0xbfd4ff,
  },
  'boomer-bomb': {
    name: 'Boomer Bomb', cls: 'LAUNCHER', rarity: 4,
    dmg: 84, splash: 42, splashRadius: 3.6, rpm: 45, mag: 1, reload: 3.2,
    spread: 0.008, recoil: 0.08, adsZoom: 1.2,
    ammo: 'rockets', auto: false, projectileSpeed: 34,
  },
};

export const AMMO_NAMES = {
  medium: 'Medium Ammo', light: 'Light Ammo',
  shells: 'Shells', heavy: 'Heavy Ammo', rockets: 'Rockets',
};

export const HEALS = {
  bandage:    { name: 'Bandage',     time: 2.0, hp: 15, cap: 75, stack: 15 },
  medkit:     { name: 'Medkit',      time: 7.0, hp: 100, full: true, stack: 3 },
  shieldcell: { name: 'Shield Cell', time: 2.5, sh: 25, stack: 6 },
  shieldpack: { name: 'Big Shield',  time: 5.0, sh: 50, stack: 3 },
};

export const RARITY_COLORS = [null, '#b8c4cc', '#59d86a', '#4aa3ff', '#c06bff', '#ffb23a'];
export const RARITY_NAMES = [null, 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
