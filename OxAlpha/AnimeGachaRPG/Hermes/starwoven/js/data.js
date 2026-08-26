// STARWOVEN — content bible as code: characters, elements, enemies, zones, story
// Every character's look is defined ONCE here (art params) and consumed by both
// the portrait painter and the field sprites -> zero design drift.
"use strict";

export const ELEMENTS = {
  Radiant: { color: '#ffd76b', soft: '#fff2c4', icon: '✦' },
  Ember:   { color: '#ff6b57', soft: '#ffc3b0', icon: '🔥' },
  Tide:    { color: '#4fc3dd', soft: '#c3ecf7', icon: '≈' },
  Gale:    { color: '#7be3b0', soft: '#d2f7e3', icon: '❯' },
  Umbra:   { color: '#b48cff', soft: '#e3d2ff', icon: '☾' },
  Verdant: { color: '#79d97c', soft: '#d2f7d3', icon: '❦' },
};
// attacker beats defender for x1.25
const BEATS = { Ember: 'Gale', Gale: 'Verdant', Verdant: 'Tide', Tide: 'Ember', Radiant: 'Umbra', Umbra: 'Radiant' };
export function elemMult(a, d) { return BEATS[a] === d ? 1.25 : 1; }
export const RARITY_COLOR = { R: '#8fa3c7', SR: '#b48cff', SSR: '#ffd76b' };
export const RARITY_ORDER = { R: 0, SR: 1, SSR: 2 };

// ---------------------------------------------------------------- characters
// art.hairStyle: long-flow | ponytail | twin | bob | spiky | braid | side-tail
// art.eyeStyle: star | sharp | calm | fierce | gentle | sly
// art.accessories rendered by art.js
export const CHARACTERS = [
  {
    id: 'lyra', name: 'Lyra', title: 'The Harp of Dawn', rarity: 'SSR', element: 'Radiant',
    role: 'Bard · Healer', weapon: 'Harpstrings', faction: 'Concord of Dawn',
    desc: 'The Harp Star reborn. Her music mends what the Nightshatter tore — and burns the Hollow that made her listen.',
    stats: { hp: 950, atk: 122, def: 48, spd: 158 },
    art: {
      skin: '#ffe6d2', blush: '#ffb7a6', hair: '#f7ecc4', hair2: '#e6cf96', hairStyle: 'long-flow',
      eyes: '#ffd76b', eyeStyle: 'star', mouth: 'smile',
      outfit: '#fdf6e4', outfit2: '#e2bd6a', accent: '#ffd76b',
      accessories: ['harp-halo', 'choker'],
    },
    basic: { kind: 'bolt', name: 'Starcord', dmg: 1.0, cd: .40, range: 520, pierce: 2 },
    skill: { name: 'Carol of Dawn', cd: 11, desc: 'Weave a hymn: heal allies nearby and grant regeneration.', cdSelf: true,
      fx: [ { kind: 'heal', pct: .22 }, { kind: 'regen', pct: .04, dur: 6 } ], radius: 260 },
    ult: { name: 'Aria Finale', cost: 100, desc: 'A radiant aria erupts, damaging all enemies around and blessing the party.',
      fx: [ { kind: 'nova', r: 320, dmg: 3.6 }, { kind: 'partyBuff', atkPct: .25, dur: 8 }, { kind: 'heal', pct: .25 } ] },
    passive: 'Encore: heals also grant allies +10% speed for 3s.',
    lines: { reveal: '*strums a bright chord* "You wove me back! Okay — request away. Lyra plays EVERYTHING."' },
  },
  {
    id: 'orion', name: 'Orion', title: 'The Hunter Eternal', rarity: 'SSR', element: 'Ember',
    role: 'Vanguard · DPS', weapon: 'Greatsword', faction: 'Unaligned',
    desc: 'He hunted beasts beneath the old sky; now he hunts the thing that broke it. Laughs loudest, hits hardest.',
    stats: { hp: 1280, atk: 138, def: 66, spd: 152 },
    art: {
      skin: '#a86a42', blush: '#8a4f30', hair: '#ff8a4a', hair2: '#d95f2b', hairStyle: 'spiky',
      eyes: '#ffb35c', eyeStyle: 'fierce', mouth: 'grin',
      outfit: '#57302a', outfit2: '#c2452f', accent: '#ff6b57',
      accessories: ['scarf', 'belt-stars', 'brand'],
    },
    basic: { kind: 'arc', name: 'Belt Cleaver', dmg: 1.15, cd: .55, range: 130, spread: 1.5 },
    skill: { name: 'Belt Slash', cd: 9, desc: 'Dash through enemies in a burning crescent.',
      fx: [ { kind: 'dash', len: 300, dmg: 2.2, width: 90 }, { kind: 'burn', dur: 4, dps: .25 } ], dashInvuln: true },
    ult: { name: 'Hunter\'s Constellation', cost: 100, desc: 'Call his belt-stars home: meteors hammer the ground around Orion.',
      fx: [ { kind: 'meteors', n: 7, r: 340, dmg: 1.6, delay: .28 }, { kind: 'burnField', r: 240, dur: 5, dps: .35 } ] },
    passive: 'Stargrazed: +20% damage while below half HP.',
    lines: { reveal: '"Ha! Took you long enough, Weaver. Point me at the biggest thing out there."' },
  },
  {
    id: 'cassia', name: 'Cassia', title: 'The Chained Queen', rarity: 'SSR', element: 'Umbra',
    role: 'Sovereign · Burst', weapon: 'Chain Scepter', faction: 'Umbral Court (defected)',
    desc: 'She wore the chain-crown of the Court — until they asked her to feed her people to the Hollow.',
    stats: { hp: 1010, atk: 146, def: 52, spd: 156 },
    art: {
      skin: '#f3e4ea', blush: '#e8aab8', hair: '#cabdf2', hair2: '#9d8ad8', hairStyle: 'long-flow',
      eyes: '#b48cff', eyeStyle: 'sharp', mouth: 'smirk',
      outfit: '#3a2b58', outfit2: '#241a38', accent: '#b48cff',
      accessories: ['chain-crown', 'veil', 'orbit-chains'],
    },
    basic: { kind: 'chain', name: 'Regal Lash', dmg: 1.05, cd: .46, range: 330 },
    skill: { name: 'Throne of Chains', cd: 12, desc: 'Chains erupt and root all enemies in a wide seal.',
      fx: [ { kind: 'root', r: 280, dur: 2.6, dmg: 1.4 } ] },
    ult: { name: 'Midnight Decree', cost: 100, desc: 'Execute the wounded: massive damage, doubled against foes under 45% HP.',
      fx: [ { kind: 'nova', r: 380, dmg: 3.2, executeBonus: .45, bonusMult: 2.0 }, { kind: 'pull', r: 420, force: 220 } ] },
    passive: 'Court\'s Price: +30% crit damage against rooted enemies.',
    lines: { reveal: '*chains settle* "So. The Loomkeeper finally calls. Do try to be worth my thread, darling."' },
  },
  {
    id: 'draco', name: 'Draco', title: 'The Garden Shield', rarity: 'SSR', element: 'Verdant',
    role: 'Guardian · Tank', weapon: 'Tower Shield', faction: 'Concord of Dawn',
    desc: 'A knight who plants flowers where he stands guard. Haven sleeps because he does not.',
    stats: { hp: 1650, atk: 96, def: 92, spd: 142 },
    art: {
      skin: '#caa27a', blush: '#a97e56', hair: '#7fae74', hair2: '#55875a', hairStyle: 'bob',
      eyes: '#79d97c', eyeStyle: 'calm', mouth: 'stoic',
      outfit: '#3f5a44', outfit2: '#2c4232', accent: '#79d97c',
      accessories: ['scale-mantle', 'vine-greaves', 'crest'],
    },
    basic: { kind: 'arc', name: 'Bulwark Bash', dmg: .95, cd: .6, range: 120, spread: 1.3 },
    skill: { name: 'Garden Wall', cd: 12, desc: 'Taunt nearby foes and raise a living barrier on himself.',
      fx: [ { kind: 'taunt', r: 300, dur: 3.5 }, { kind: 'barrier', pct: .28, dur: 6 } ] },
    ult: { name: 'Garden of Scales', cost: 100, desc: 'A blooming sanctum: heals allies inside, thorns punish attackers.',
      fx: [ { kind: 'field', r: 300, dur: 8, healTick: .03, thorns: 1.2 } ] },
    passive: 'Rooted Bloom: takes 15% less damage below 50% HP.',
    lines: { reveal: '*shield plants like a tree* "Then I hold the line. Grow well, little Weaver."' },
  },
  {
    id: 'nix', name: 'Nix', title: 'The First Rain', rarity: 'SR', element: 'Tide',
    role: 'Aquarius · Healer', weapon: 'Amphora Jet', faction: 'Drifters',
    desc: 'Carries the amphora holding the first rain after the Shatter. Speaks softly. Heals fiercely.',
    stats: { hp: 980, atk: 104, def: 54, spd: 154 },
    art: {
      skin: '#ffe9dc', blush: '#ffc2ae', hair: '#9fd8e8', hair2: '#63aec9', hairStyle: 'braid',
      eyes: '#4fc3dd', eyeStyle: 'gentle', mouth: 'soft',
      outfit: '#dff2f7', outfit2: '#8fc6d8', accent: '#4fc3dd',
      accessories: ['amphora', 'water-orbit'],
    },
    basic: { kind: 'bolt', name: 'Rainjet', dmg: .85, cd: .38, range: 480, slow: .25, slowDur: 1.5 },
    skill: { name: 'Pouring Grace', cd: 10, desc: 'Tide-wash over allies: heal and cleanse slows.',
      fx: [ { kind: 'heal', pct: .18 }, { kind: 'cleanse' } ], radius: 240 },
    ult: { name: 'Tidepool Sanctuary', cost: 100, desc: 'A sanctuary pool heals allies standing within it.',
      fx: [ { kind: 'field', r: 280, dur: 10, healTick: .025 } ] },
    passive: 'Deep Calm: healing given is increased by 20% on allies below 50% HP.',
    lines: { reveal: '*small bow* "Oh! You called me right when it started to rain. That\'s lucky. I\'m Nix."' },
  },
  {
    id: 'aquila', name: 'Aquila', title: 'The Storm Courier', rarity: 'SR', element: 'Gale',
    role: 'Ranger · DPS', weapon: 'Stormbow', faction: 'Drifters',
    desc: 'Winged boots, storm arrows, never lost a letter — or a race. Delivers verdicts at terminal velocity.',
    stats: { hp: 900, atk: 126, def: 44, spd: 176 },
    art: {
      skin: '#f0d3b8', blush: '#e0a98a', hair: '#67d0b4', hair2: '#3fa88e', hairStyle: 'side-tail',
      eyes: '#7be3b0', eyeStyle: 'sharp', mouth: 'grin',
      outfit: '#2e4a41', outfit2: '#4d7a68', accent: '#7be3b0',
      accessories: ['goggles', 'wing-boots', 'feather-charm'],
    },
    basic: { kind: 'bolt', name: 'Thunderline', dmg: 1.0, cd: .34, range: 560, pierce: 3 },
    skill: { name: 'Updraft', cd: 8, desc: 'Ride the gale: dash and reset your dodge.',
      fx: [ { kind: 'dash', len: 340, dmg: 1.1, width: 60 }, { kind: 'resetDodge' } ], dashInvuln: true },
    ult: { name: 'Stormdive', cost: 100, desc: 'Chain-lightning strikes leap between all nearby foes.',
      fx: [ { kind: 'chainLightning', targets: 6, dmg: 2.4 } ] },
    passive: 'Slipstream: +12% speed for 4s after dodging.',
    lines: { reveal: '*lands in a skid* "Special delivery — one Storm Courier, ready for duty!"' },
  },
  {
    id: 'corvus', name: 'Corvus', title: 'The Omen Broker', rarity: 'SR', element: 'Umbra',
    role: 'Trickster · Debuffer', weapon: 'Hex Feathers', faction: 'Umbral Court (freelance)',
    desc: 'A raven-masked broker who trades in secrets. Knows exactly what the Hollow wants to hear.',
    stats: { hp: 960, atk: 118, def: 50, spd: 162 },
    art: {
      skin: '#e8d5c4', blush: '#cfa88e', hair: '#4a3d63', hair2: '#2e2647', hairStyle: 'ponytail',
      eyes: '#e8a84c', eyeStyle: 'sly', mouth: 'smirk',
      outfit: '#33294d', outfit2: '#20183a', accent: '#b48cff',
      accessories: ['raven-mask', 'feather-clasp'],
    },
    basic: { kind: 'bolt', name: 'Omen Peck', dmg: .9, cd: .36, range: 500, hex: .18, hexDur: 5 },
    skill: { name: 'Feathered Snare', cd: 11, desc: 'A ring of feathers hexes foes: they take extra damage from everyone.',
      fx: [ { kind: 'hex', r: 300, amp: .25, dur: 6, dmg: .8 } ] },
    ult: { name: 'Crowning Omen', cost: 100, desc: 'Fear unravels the crowd: foes flee and are marked for ruin.',
      fx: [ { kind: 'fear', r: 360, dur: 2.2 }, { kind: 'hexAll', r: 420, amp: .35, dur: 8 } ] },
    passive: 'Flock Ledger: enemies defeated while hexed refund 3 energy to Corvus.',
    lines: { reveal: '*feathers settle over one amber eye* "A new patron? Delightful. My rates are reasonable. Mostly."' },
  },
  {
    id: 'pyra', name: 'Pyra', title: 'The Little Furnace', rarity: 'R', element: 'Ember',
    role: 'Phoenix · Artillery', weapon: 'Firebomb', faction: 'Unaligned',
    desc: 'A shy spark of the fallen Phoenix. Timid until something catches fire. Then she giggles.',
    stats: { hp: 850, atk: 112, def: 42, spd: 148 },
    art: {
      skin: '#ffe4d6', blush: '#ffab98', hair: '#ff9d76', hair2: '#e06a48', hairStyle: 'bob',
      eyes: '#ff6b57', eyeStyle: 'gentle', mouth: 'soft',
      outfit: '#fbe3d2', outfit2: '#f0a37c', accent: '#ff6b57',
      accessories: ['phoenix-pin', 'mittens', 'furnace-pendant'],
    },
    basic: { kind: 'lob', name: 'Cinder Toss', dmg: 1.2, cd: .8, range: 430, blast: 90, burn: 3, burnDps: .2 },
    skill: { name: 'Kindling Line', cd: 10, desc: 'Trail a line of fire behind you while moving.',
      fx: [ { kind: 'burnTrail', dur: 6, dps: .5 } ], self: true },
    ult: { name: 'Phoenix Flare', cost: 100, desc: 'Everything under the flare goes up. Everything.',
      fx: [ { kind: 'nova', r: 400, dmg: 3.4 }, { kind: 'burn', dur: 5, dps: .3 }, { kind: 'burnField', r: 300, dur: 4, dps: .4 } ] },
    passive: 'Warm Heart: gains 20% extra energy when hurt.',
    lines: { reveal: '*tiny furnace glow* "I-I\'m Pyra! Please don\'t stand too close. Um. To the explosions."' },
  },
  {
    id: 'vela', name: 'Vela', title: 'The Sailblade', rarity: 'R', element: 'Gale',
    role: 'Navigator · Skirmisher', weapon: 'Twin Sail-Blades', faction: 'Drifters',
    desc: 'Youngest navigator ever to crew a grass-sea drifter. Eager, loud, faster than her excuses.',
    stats: { hp: 880, atk: 108, def: 46, spd: 170 },
    art: {
      skin: '#f5d6bb', blush: '#e3ab89', hair: '#7fc4e8', hair2: '#4e97c9', hairStyle: 'ponytail',
      eyes: '#8fe8c9', eyeStyle: 'star', mouth: 'grin',
      outfit: '#e9f2ef', outfit2: '#5f8fa3', accent: '#7be3b0',
      accessories: ['sail-pin', 'rope-belt'],
    },
    basic: { kind: 'arc', name: 'Swift Sail', dmg: .8, cd: .32, range: 110, spread: 1.6 },
    skill: { name: 'Tailwind', cd: 10, desc: 'Catch the wind: party moves faster for a while.',
      fx: [ { kind: 'partyHaste', pct: .3, dur: 6 } ], self: true },
    ult: { name: 'Squall Line', cost: 100, desc: 'Spin through the fray, cutting everything around you.',
      fx: [ { kind: 'spinDash', dur: 1.6, r: 120, dmg: 1.1, tick: .16 } ], invuln: true },
    passive: 'Fair Winds: +8% speed permanently while first in the party.',
    lines: { reveal: '*salutes with a sail-blade* "Vela, navigator! New course: ADVENTURE. Right behind you, Captain Weaver!"' },
  },
  {
    id: 'keto', name: 'Keto', title: 'The Whale Shepherd', rarity: 'R', element: 'Tide',
    role: 'Guardian · Warden', weapon: 'Anchor Gauntlets', faction: 'Drifters',
    desc: 'Shepherds star-whales along the shore. Few words, huge hands, endless patience — and a devastating tide-slam.',
    stats: { hp: 1450, atk: 92, def: 78, spd: 138 },
    art: {
      skin: '#b98d68', blush: '#97704f', hair: '#8ba7bd', hair2: '#5f7f99', hairStyle: 'long-flow',
      eyes: '#2f8ba3', eyeStyle: 'calm', mouth: 'stoic',
      outfit: '#4a6577', outfit2: '#33495c', accent: '#4fc3dd',
      accessories: ['whale-tooth', 'net-sash'],
    },
    basic: { kind: 'wave', name: 'Tide Slam', dmg: 1.05, cd: .62, range: 190, width: 150 },
    skill: { name: 'Undertow', cd: 11, desc: 'Yank foes toward you with a grasping current.',
      fx: [ { kind: 'pull', r: 320, force: 260 }, { kind: 'nova', r: 220, dmg: 1.3 } ] },
    ult: { name: 'Leviathan\'s Embrace', cost: 100, desc: 'A great wave hurls foes away and shields the whole party.',
      fx: [ { kind: 'knockback', r: 340, force: 520, dmg: 2.0 }, { kind: 'partyBarrier', pct: .22, dur: 6 } ] },
    passive: 'Deep Hold: +20% max HP while another Guardian is on the team.',
    lines: { reveal: '*slow nod* "Mm. Keto swims with you now. Show Keto where the hurt lives."' },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
export const POOLS = {
  ssr: CHARACTERS.filter(c => c.rarity === 'SSR').map(c => c.id),
  sr: CHARACTERS.filter(c => c.rarity === 'SR').map(c => c.id),
  r: CHARACTERS.filter(c => c.rarity === 'R').map(c => c.id),
};

// ------------------------------------------------------------------- banners
export const BANNERS = [
  { id: 'debut-lyra', name: 'Celestial Debut — Harp of Dawn', featured: 'lyra', blurb: 'Lyra\'s rate-up weaves. Firstfall SSRs share the remainder.' },
  { id: 'eternal-sky', name: 'The Eternal Sky — Standard', featured: null, blurb: 'Every fallen Firstfall constellation waits here equally.' },
];

// ------------------------------------------------------------------- enemies
export const ENEMIES = {
  wisp:     { name: 'Hollow Wisp', hp: 36, atk: 9, def: 0, spd: 96, r: 14, element: 'Umbra', xp: 8, mote: [2, 4], ai: 'chase', color: '#b48cff' },
  riftling: { name: 'Riftling', hp: 20, atk: 6, def: 0, spd: 155, r: 10, element: 'Umbra', xp: 5, mote: [1, 3], ai: 'chase', color: '#8f6fd8' },
  spitter:  { name: 'Void Spitter', hp: 32, atk: 10, def: 0, spd: 70, r: 13, element: 'Umbra', xp: 10, mote: [2, 5], ai: 'ranged', range: 380, color: '#6fd8c9' },
  hulk:     { name: 'Silence Hulk', hp: 150, atk: 20, def: 4, spd: 62, r: 26, element: 'Umbra', xp: 26, mote: [6, 10], ai: 'slam', color: '#5e4a8f' },
  cindermaw:{ name: 'Cindermaw, Forge-Hunger', hp: 700, atk: 24, def: 6, spd: 88, r: 40, element: 'Ember', xp: 120, mote: [30, 40], ai: 'boss_slam_charge', color: '#ff6b57', boss: true },
  herald:   { name: 'Drowned Herald', hp: 900, atk: 28, def: 8, spd: 76, r: 42, element: 'Tide', xp: 180, mote: [40, 55], ai: 'boss_waves_summon', color: '#4fc3dd', boss: true },
  regent:   { name: 'The Hollow Regent', hp: 1700, atk: 34, def: 10, spd: 82, r: 52, element: 'Umbra', xp: 400, mote: [80, 110], ai: 'boss_regent', color: '#b48cff', boss: true },
};

// --------------------------------------------------------------------- zones
// obstacles: circles {x,y,r}; interactables handled by world/game
export const ZONES = {
  haven: {
    id: 'haven', name: 'Lumen Haven', sub: 'Sanctuary of the Loomkeepers', music: 'haven',
    w: 1900, h: 1400, safe: true, level: 1,
    palette: { ground: '#191539', ground2: '#211c4a', detail: '#2c2660', glow: '#ffd76b', fog: 'rgba(20,16,48,0.35)' },
    portals: [
      { id: 'gate-ember', x: 300, y: 250, to: 'emberwild', label: 'Emberwild Ruins', unlocked: () => true },
      { id: 'gate-tide', x: 1600, y: 250, to: 'tidecall', label: 'Tidecall Shore', unlocked: s => s.story.step >= 3 },
      { id: 'gate-hollow', x: 950, y: 1250, to: 'umbrahollow', label: 'Umbra Hollow', unlocked: s => s.story.step >= 5 },
    ],
    pois: [
      { id: 'loom', x: 950, y: 620, kind: 'loom', label: 'The Astral Loom' },
      { id: 'selene', x: 780, y: 720, kind: 'npc', npc: 'selene', label: 'Selene' },
      { id: 'toma', x: 1130, y: 700, kind: 'npc', npc: 'toma', label: 'Marshal Toma' },
      { id: 'maro', x: 620, y: 520, kind: 'npc', npc: 'maro', label: 'Maro the Tinkerer' },
      { id: 'dummy', x: 1290, y: 520, kind: 'dummy', label: 'Training Dummy' },
      { id: 'campfire', x: 950, y: 850, kind: 'campfire', label: 'Haven Hearth' },
    ],
    obstacles: [
      { x: 950, y: 620, r: 90 }, // loom plinth base
      { x: 350, y: 900, r: 70 }, { x: 1550, y: 950, r: 80 },
      { x: 200, y: 500, r: 55 }, { x: 1750, y: 450, r: 60 },
      { x: 700, y: 1150, r: 65 }, { x: 1250, y: 1100, r: 70 },
    ],
  },
  emberwild: {
    id: 'emberwild', name: 'Emberwild Ruins', sub: 'Forge-temples of the fallen', music: 'field',
    w: 2300, h: 1700, safe: false, level: 2,
    palette: { ground: '#241318', ground2: '#33191c', detail: '#4a2020', glow: '#ff6b57', fog: 'rgba(40,14,18,0.30)' },
    entry: { x: 1150, y: 1500 },
    camps: [
      { x: 900, y: 1150, type: 'wisp', n: 4, r: 220 },
      { x: 1500, y: 1050, type: 'riftling', n: 5, r: 240 },
      { x: 650, y: 750, type: 'wisp', n: 4, r: 200 },
      { x: 1350, y: 640, type: 'spitter', n: 3, r: 200 },
      { x: 1850, y: 700, type: 'hulk', n: 1, r: 160 },
      { x: 1750, y: 1250, type: 'spitter', n: 2, r: 180 },
      { x: 500, y: 1250, type: 'riftling', n: 4, r: 200 },
    ],
    boss: { id: 'cindermaw', x: 1150, y: 480, triggerR: 300 },
    chests: [
      { id: 'em1', x: 2150, y: 1550, star: 6, mote: 40 },
      { id: 'em2', x: 180, y: 300, star: 6, mote: 40 },
      { id: 'aria-shard', x: 1150, y: 380, star: 15, mote: 120, quest: 'aria' },
    ],
    obstacles: [
      { x: 700, y: 950, r: 85 }, { x: 1600, y: 900, r: 95 }, { x: 1150, y: 800, r: 60 },
      { x: 400, y: 550, r: 70 }, { x: 1950, y: 1000, r: 75 }, { x: 900, y: 400, r: 55 },
      { x: 1500, y: 1400, r: 80 }, { x: 600, y: 1450, r: 60 }, { x: 2050, y: 400, r: 65 },
      { x: 300, y: 900, r: 50 }, { x: 1750, y: 550, r: 45 },
    ],
  },
  tidecall: {
    id: 'tidecall', name: 'Tidecall Shore', sub: 'Where starlight pools like water', music: 'field',
    w: 2300, h: 1700, safe: false, level: 4,
    palette: { ground: '#10222e', ground2: '#16303f', detail: '#1e4557', glow: '#4fc3dd', fog: 'rgba(10,28,40,0.32)' },
    entry: { x: 1150, y: 1520 },
    camps: [
      { x: 800, y: 1200, type: 'wisp', n: 4, r: 210 },
      { x: 1550, y: 1150, type: 'spitter', n: 3, r: 210 },
      { x: 600, y: 800, type: 'riftling', n: 5, r: 220 },
      { x: 1250, y: 700, type: 'hulk', n: 1, r: 170 },
      { x: 1850, y: 650, type: 'wisp', n: 4, r: 200 },
      { x: 1900, y: 1300, type: 'spitter', n: 3, r: 190 },
    ],
    beacons: [ { id: 'tb1', x: 520, y: 420 }, { id: 'tb2', x: 1780, y: 420 } ],
    boss: { id: 'herald', x: 1150, y: 450, triggerR: 320 },
    chests: [
      { id: 'tc1', x: 2200, y: 900, star: 8, mote: 60 },
      { id: 'tc2', x: 150, y: 1300, star: 8, mote: 60 },
    ],
    obstacles: [
      { x: 900, y: 950, r: 80 }, { x: 1500, y: 850, r: 70 }, { x: 1150, y: 1050, r: 55 },
      { x: 450, y: 1000, r: 65 }, { x: 1900, y: 950, r: 60 }, { x: 800, y: 500, r: 50 },
      { x: 1550, y: 1400, r: 75 },
    ],
  },
  umbrahollow: {
    id: 'umbrahollow', name: 'Umbra Hollow', sub: 'The wound in the sky', music: 'battle',
    w: 2300, h: 1700, safe: false, level: 6,
    palette: { ground: '#171226', ground2: '#1f1834', detail: '#2a2148', glow: '#b48cff', fog: 'rgba(16,10,30,0.45)' },
    entry: { x: 1150, y: 1520 },
    camps: [
      { x: 850, y: 1250, type: 'hulk', n: 1, r: 180 },
      { x: 1500, y: 1200, type: 'wisp', n: 5, r: 220 },
      { x: 650, y: 900, type: 'spitter', n: 4, r: 210 },
      { x: 1650, y: 800, type: 'hulk', n: 1, r: 180 },
      { x: 1150, y: 700, type: 'riftling', n: 6, r: 230 },
      { x: 500, y: 500, type: 'spitter', n: 3, r: 190 },
      { x: 1800, y: 450, type: 'wisp', n: 4, r: 200 },
    ],
    anchors: [ { id: 'an1', x: 520, y: 1250, hp: 120 }, { id: 'an2', x: 1800, y: 1150, hp: 120 }, { id: 'an3', x: 1150, y: 950, hp: 120 } ],
    boss: { id: 'regent', x: 1150, y: 380, triggerR: 340 },
    chests: [ { id: 'uh1', x: 2250, y: 300, star: 12, mote: 90 } ],
    obstacles: [
      { x: 900, y: 1000, r: 75 }, { x: 1450, y: 950, r: 85 }, { x: 700, y: 700, r: 60 },
      { x: 1650, y: 600, r: 65 }, { x: 1150, y: 1150, r: 50 },
    ],
  },
};

// --------------------------------------------------------------------- story
export const STORY = [
  { id: 0, name: 'Thread One — Awake', give: 20,
    obj: { text: 'Speak with Selene, then touch the Astral Loom.' },
    dlgKey: 'intro' },
  { id: 1, name: 'Thread Two — Embers of Dawn', give: 15,
    obj: { text: 'Thin the Hollow in Emberwild Ruins (6 foes).', kills: { zone: 'emberwild', n: 6 } },
    dlgKey: 'step1', unlocksPortal: 'gate-tide' },
  { id: 2, name: 'Thread Three — The Aria Shard', give: 15,
    obj: { text: 'Recover the Aria Shard from the heart of the ruins.', chest: 'aria-shard' },
    dlgKey: 'step2' },
  { id: 3, name: 'Thread Four — Forge-Hunger', give: 20,
    obj: { text: 'Slay Cindermaw, the forge-beast.', boss: 'cindermaw' },
    dlgKey: 'step3', unlocksPortal: null },
  { id: 4, name: 'Thread Five — The Tide Listens', give: 15,
    obj: { text: 'Awaken both tide-watch pylons at Tidecall Shore.', beacons: 2 },
    dlgKey: 'step4', unlocksPortal: 'gate-hollow' },
  { id: 5, name: 'Thread Six — What the Water Kept', give: 20,
    obj: { text: 'Lay the Drowned Herald to rest.', boss: 'herald' },
    dlgKey: 'step5' },
  { id: 6, name: 'Thread Seven — Sever the Anchors', give: 20,
    obj: { text: 'Destroy the three Rift Anchors anchoring the Regent.', anchors: 3 },
    dlgKey: 'step6' },
  { id: 7, name: 'Final Thread — The Hollow Regent', give: 30,
    obj: { text: 'Face the Hollow Regent.', boss: 'regent' },
    dlgKey: 'step7' },
];

export const DIALOGUE = {
  intro: [
    { who: 'Selene', portrait: 'selene', text: 'Awake at last, apprentice. A century of sleep, and the sky still torn above us.' },
    { who: 'Selene', portrait: 'selene', text: 'I am Selene — archivist of Lumen Haven, keeper of what remains. The Nightshatter unraveled our night sky. Constellations FELL, child. Living stars, scattered like sparks.' },
    { who: 'Selene', portrait: 'selene', text: 'Through the tear leaks the Hollow — a silence that eats color, memory, sound. It must not reach the Haven.' },
    { who: 'Selene', portrait: 'selene', text: 'But you are a Loomkeeper\'s heir. At the Astral Loom you can WEAVE — call the fallen home, one thread at a time. They will fight for you. Trust them.' },
    { who: 'Selene', portrait: 'selene', text: 'Go on. Touch the Loom. And later — the gates east and west hide the wounds we must close. Walk gently, Weaver.' },
  ],
  step1: [
    { who: 'Selene', portrait: 'selene', text: 'The west gate opens onto Emberwild — forge-temples where the first Stellars fell. Wisps of the Hollow nest there now.' },
    { who: 'Orion', portrait: 'orion', text: 'Finally! Fresh air and something to hit. Try to keep up, Weaver!' },
  ],
  step2: [
    { who: 'Selene', portrait: 'selene', text: 'An Aria Shard — a fragment of Lyra\'s song-survived-the-fall. Bring it to me... or better, keep it close. It wants to be sung again.' },
  ],
  step3: [
    { who: 'Selene', portrait: 'selene', text: 'The forge-heart itself stirs — Cindermaw, which ate the temple fires. Free it, Weaver.' },
    { who: 'Orion', portrait: 'orion', text: 'Big. Angry. FLAMMABLE. Oh, this is the best day I\'ve had in a hundred years!' },
  ],
  step4: [
    { who: 'Selene', portrait: 'selene', text: 'East lies Tidecall Shore. Its old watch-pylons still remember their duty — wake them both, and the way to the Hollow will show itself.' },
  ],
  step5: [
    { who: 'Selene', portrait: 'selene', text: 'The Herald was once the tide-watch captain. What wears him now is not him. Be swift and be kind.' },
    { who: 'Nix', portrait: 'nix', text: 'I-I\'ll keep everyone patched up. P-promised the rain I would.' },
  ],
  step6: [
    { who: 'Selene', portrait: 'selene', text: 'Three Rift Anchors pin the sky-wound open. Break all three — then the Regent can be reached. Then ENDED.' },
    { who: 'Cassia', portrait: 'cassia', text: 'The Regent sits upon MY court\'s stolen throne. Do try to leave me something to execute, darling.' },
  ],
  step7: [
    { who: 'Selene', portrait: 'selene', text: 'It comes. The first note of unmaking. Whatever happens — weave, child. WEAVE.' },
  ],
  epilogue: [
    { who: 'Selene', portrait: 'selene', text: '...The wound closes. Listen — the Hollow\'s silence is breaking. Somewhere far off, an owl. A violin. Rain.' },
    { who: 'Selene', portrait: 'selene', text: 'But look up, apprentice. More threads fall every night. Your Loom will never be empty... and neither will your adventures. This is only the first tapestry.' },
    { who: 'Lyra', portrait: 'lyra', text: 'Encore, Maestro?' },
  ],
};

export const NPC_BARKS = {
  selene: ['The Loom hums when you approach. It likes you.', 'Stars fall quietest just before dawn.', 'Bring them home, Weaver.'],
  toma: ['Bounty board\'s open. Hollow doesn\'t trim itself.', 'Heard the shore pylons singing again. Good sign. Maybe.'],
  maro: ['Made this lamp from a fallen scale! ...It hums at night.', 'If you find old parts out there, I pay in motes!'],
};

export const BOUNTY = { base: 10, grow: 2, rewardStar: 12, rewardMote: 60, text: 'Thin the Hollow anywhere (defeat N foes in the field).' };
