// STARWEAVE — game data: elements, roster, kits, enemies, banners, quests, dialogue
// Look params drive BOTH the 2D portrait painter and the 3D character builder:
// one parameter set => one consistent identity everywhere.

export const ELEMENTS = {
  RADIANCE: { id: 'RADIANCE', name: 'Radiance', color: '#ffd76e', dark: '#8a6a1e', glyph: '☀' },
  UMBRA:    { id: 'UMBRA',    name: 'Umbra',    color: '#b06cff', dark: '#4a2a7a', glyph: '🌙' },
  EMBER:    { id: 'EMBER',    name: 'Ember',    color: '#ff7847', dark: '#8a3214', glyph: '🔥' },
  GALE:     { id: 'GALE',     name: 'Gale',     color: '#6ee7b7', dark: '#1f6b4a', glyph: '🍃' },
  STONE:    { id: 'STONE',    name: 'Stone',    color: '#d9a066', dark: '#6b4423', glyph: '⛰' },
  TIDE:     { id: 'TIDE',     name: 'Tide',     color: '#5aa9ff', dark: '#1d4d8a', glyph: '💧' },
};

// Ember>Gale>Stone>Tide>Ember ; Radiance<->Umbra
const WHEEL = { EMBER: 'GALE', GALE: 'STONE', STONE: 'TIDE', TIDE: 'EMBER' };
export function elemMultiplier(attacker, defender) {
  if (!defender) return 1;
  if ((attacker === 'RADIANCE' && defender === 'UMBRA') || (attacker === 'UMBRA' && defender === 'RADIANCE')) return 1.25;
  if (WHEEL[attacker] === defender) return 1.35;
  if (WHEEL[defender] === attacker) return 0.75;
  return 1;
}

export const RARITY = {
  3: { name: 'Glimmer',  color: '#7fa8c9', glow: '#9cc4e0' },
  4: { name: 'Radiant',  color: '#b07aff', glow: '#c9a2ff' },
  5: { name: 'Celestial',color: '#ffcf6e', glow: '#ffe6a8' },
};

export function xpNeeded(level) { return Math.round(60 * Math.pow(level, 1.42)); }
export const MAX_ASCENSION = 3;
export function levelCap(ascension) { return 40 + ascension * 15; }
export const ASCENSION_COST = [null, { sigils: 3, level: 20 }, { sigils: 8, level: 30 }, { sigils: 15, level: 40 }];
export function statAt(unit, level) {
  const r = unit.rarity;
  const baseHp = r === 5 ? 950 : r === 4 ? 820 : 700;
  const baseAtk = r === 5 ? 115 : r === 4 ? 96 : 80;
  const baseDef = r === 5 ? 58 : r === 4 ? 48 : 40;
  const g = 1 + (level - 1) * 0.062 + (unit.resonance || 0) * 0.05 + (unit.ascension || 0) * 0.12;
  return { hp: Math.round(baseHp * g), atk: Math.round(baseAtk * g), def: Math.round(baseDef * g) };
}

// ---------------------------------------------------------------- ROSTER
// look: portrait/3D params — hair style+colors, eyes, outfit, accessory.
export const CHARACTERS = {
  aster: {
    id: 'aster', name: 'Aster', title: 'The Last Weaver', rarity: 5, element: 'RADIANCE',
    weapon: 'Sword', role: 'All-round DPS', starter: true,
    bio: 'You woke on Dawnrest Isle with no memory and a Weaver\'s mark on your hand. The Loom has been waiting a hundred years.',
    summonLine: 'My thread is yours to weave.',
    look: { hairStyle: 'bob', hair: '#e8e4ef', hi: '#fff6d8', eyes: '#ffb84d', skin: '#ffe3c8', out1: '#f4f1ff', out2: '#2c2a55', acc: 'earthread' },
    kit: {
      skill: { name: 'Dawnburst', cd: 7, mult: 1.9, type: 'nova', desc: 'Release a ring of light, damaging nearby Gloam.' },
      burst: { name: 'Daybreak Ring', mult: 4.2, type: 'nova_big', desc: 'A rising sun-ring scorches everything around you.' },
    },
  },
  solvaine: {
    id: 'solvaine', name: 'Solvaine', title: 'The Dawnblade', rarity: 5, element: 'RADIANCE',
    weapon: 'Sword', role: 'Burst DPS',
    bio: 'Last knight of the Order of the Dawn. Noble, warm, and haunted by the order she could not save.',
    summonLine: 'The dawn answers. Let us write today\'s legend together.',
    look: { hairStyle: 'ponytail', hair: '#ffd76e', hi: '#fff2c2', eyes: '#e88a2a', skin: '#ffe6cd', out1: '#fdfaf2', out2: '#c93b52', acc: 'sunhalo' },
    kit: {
      skill: { name: 'Solar Lance', cd: 8, mult: 2.6, type: 'dash_pierce', desc: 'Dash forward as a lance of dawnlight, piercing all in your path.' },
      burst: { name: 'Zenith Blade', mult: 5.0, type: 'nova_big_burn', desc: 'A colossal sun-sword falls; the ground burns with daybreak.' },
    },
  },
  vesperine: {
    id: 'vesperine', name: 'Vesperine', title: 'The Veilwalker', rarity: 5, element: 'UMBRA',
    weapon: 'Scythe', role: 'Lifesteal DPS',
    bio: 'A fate-reader of the moth-clan Veiled. She saw your thread in the weave long before you arrived… and it frightened her.',
    summonLine: 'Shh… I have seen this moment a hundred times. Stay close, little thread.',
    look: { hairStyle: 'longveil', hair: '#cbb3ea', hi: '#efe0ff', eyes: '#b06cff', skin: '#fde8da', out1: '#241b3d', out2: '#8a63c9', acc: 'mothveil' },
    kit: {
      skill: { name: 'Mothveil', cd: 8, mult: 2.2, type: 'phase_drain', desc: 'Become mist, drift through foes, and drink their light as health.' },
      burst: { name: 'Eclipse Waltz', mult: 4.4, type: 'spin_drain', desc: 'Dance the eclipse — a spinning storm that steals life from all it touches.' },
    },
  },
  kaenji: {
    id: 'kaenji', name: 'Kaenji', title: 'The Cinder Chef', rarity: 4, element: 'EMBER',
    weapon: 'Gauntlets', role: 'Bruiser',
    bio: 'Emberfall battle-chef. His wok feeds the hungry; his fists feed the floor. Usually both at once.',
    summonLine: 'Order up! Hope you brought an appetite — and a bucket of water!',
    look: { hairStyle: 'spiky', hair: '#d94f30', hi: '#ff9a62', eyes: '#c93b1e', skin: '#f2bd93', out1: '#3a3a44', out2: '#e05a2b', acc: 'headband' },
    kit: {
      skill: { name: 'Flare Rush', cd: 7, mult: 2.4, type: 'dash_pierce', desc: 'Charge fist-first through the enemy line, knocking them skyward.' },
      burst: { name: 'Wok Inferno', mult: 4.0, type: 'ground_fire', desc: 'Slam the pan: the ground erupts into a searing grill of flames.' },
    },
  },
  fujinari: {
    id: 'fujinari', name: 'Fujinari', title: 'The Windward Eye', rarity: 4, element: 'GALE',
    weapon: 'Bow', role: 'Ranged Sniper',
    bio: 'Wayfarer ranger. Speaks rarely; when the arrow lands, no words are needed.',
    summonLine: 'The wind agrees to carry you. Try to keep up.',
    look: { hairStyle: 'undercut', hair: '#2e7d64', hi: '#6ee7b7', eyes: '#3fae83', skin: '#f0d3ae', out1: '#274238', out2: '#6ee7b7', acc: 'leafpin' },
    kit: {
      skill: { name: 'Piercing Zephyr', cd: 6, mult: 2.3, type: 'line_shot', desc: 'Loose a gale-arrow that skewers every foe in a line.' },
      burst: { name: 'Tempest Volley', mult: 4.1, type: 'arrow_rain', desc: 'A storm of wind-fletched arrows rains across the field.' },
    },
  },
  nereida: {
    id: 'nereida', name: 'Nereida', title: 'Pearl of the Deep', rarity: 4, element: 'TIDE',
    weapon: 'Catalyst', role: 'AoE Mage',
    bio: 'Pearl-diver sorceress of the Sunken Terraces. Her jellyfish familiar Blub does most of the talking.',
    summonLine: 'Blub says hello. I say… let\'s make a splash, darling.',
    look: { hairStyle: 'flowing', hair: '#4f8fe0', hi: '#a8d4ff', eyes: '#2e6fd9', skin: '#ffe4cf', out1: '#eaf4ff', out2: '#4f8fe0', acc: 'pearlpin' },
    kit: {
      skill: { name: 'Tidepool Snap', cd: 6, mult: 2.0, type: 'bubble_slow', desc: 'Pop a tide-bubble; shards slow every enemy caught inside.' },
      burst: { name: 'Maelstrom', mult: 4.3, type: 'vortex', desc: 'Conjure a whirlpool that drags foes together and grinds them down.' },
    },
  },
  bastienne: {
    id: 'bastienne', name: 'Bastienne', title: 'The Little Bulwark', rarity: 4, element: 'STONE',
    weapon: 'Greatshield', role: 'Tank / Shielder',
    bio: 'Stonemason of the Underterraces. The wall she built for the village held. So will she.',
    summonLine: 'Stand behind me! Nothing gets past Bastienne — nothing ever has!',
    look: { hairStyle: 'braids', hair: '#a86e3c', hi: '#e8bc82', eyes: '#8a5a26', skin: '#f7d4ae', out1: '#8a6a48', out2: '#d9a066', acc: 'freckles' },
    kit: {
      skill: { name: 'Bulwark', cd: 12, mult: 0, type: 'shield_team', shield: 0.28, desc: 'Raise a stone ward granting the whole team a shield (28% max HP).' },
      burst: { name: 'Quake Stamp', mult: 4.5, type: 'stun_slam', desc: 'Stamp the earth — a shockwave that staggers and stuns.' },
    },
  },
  pip: {
    id: 'pip', name: 'Pip', title: 'Sparkrocket', rarity: 3, element: 'EMBER',
    weapon: 'Fireworks', role: 'Mascot Artillery',
    bio: 'Festival fireworkner, six inches tall and one hundred and ten percent volume.',
    summonLine: 'PIIIIP POW! Best. Spark. EVER! Hehehe!',
    look: { hairStyle: 'pom', hair: '#ff9a3c', hi: '#ffd76e', eyes: '#ff7847', skin: '#ffe0c0', out1: '#c94f2a', out2: '#ffd76e', acc: 'goggles' },
    kit: {
      skill: { name: 'Spark Rocket', cd: 6, mult: 1.8, type: 'rocket', desc: 'A screaming firework rocket into the nearest foe.' },
      burst: { name: 'Finale Flurry', mult: 3.6, type: 'arrow_rain', desc: 'The festival finale — rockets bloom everywhere!' },
    },
  },
  grum: {
    id: 'grum', name: 'Grum', title: 'Deepdelver', rarity: 3, element: 'STONE',
    weapon: 'Hammer', role: 'Slow Smash',
    bio: 'Old miner of the Underterraces. Grumbles constantly, would die for you by Tuesday.',
    summonLine: 'Hmph. Fine. Point Grum at the monsters.',
    look: { hairStyle: 'buzz', hair: '#8f8f99', hi: '#c9c9d4', eyes: '#6b6b75', skin: '#e0b088', out1: '#5a564f', out2: '#d9a066', acc: 'helmlamp' },
    kit: {
      skill: { name: 'Boulder Toss', cd: 8, mult: 2.2, type: 'rocket', desc: 'Hurl a chunk of the island. It\'s very effective.' },
      burst: { name: 'Anvil Drop', mult: 3.8, type: 'stun_slam', desc: 'What goes up must come down. Preferably on a Gloam.' },
    },
  },
  lumo: {
    id: 'lumo', name: 'Lumo', title: 'Lanternheart', rarity: 3, element: 'RADIANCE',
    weapon: 'Lantern', role: 'Healer',
    bio: 'A lantern spirit born from a prayer candle someone lit the night the sky broke.',
    summonLine: 'I-I\'m still small… but my light is yours. All of it.',
    look: { hairStyle: 'tuft', hair: '#fff3d6', hi: '#ffffff', eyes: '#ffd76e', skin: '#fff0dc', out1: '#fff8ea', out2: '#ffd76e', acc: 'lantern' },
    kit: {
      skill: { name: 'Glimmer Mend', cd: 9, mult: 0, type: 'heal', heal: 0.22, desc: 'Warm light restores health to the active hero (22% max HP).' },
      burst: { name: 'Sanctuary', mult: 0, type: 'hot_field', heal: 0.06, desc: 'A blessed field mends all who stand within it.' },
    },
  },
  coralie: {
    id: 'coralie', name: 'Coralie', title: 'Riptide Dancer', rarity: 3, element: 'TIDE',
    weapon: 'Trident', role: 'Skirmisher',
    bio: 'Tide-pool duelist who fights like weather: flashy, fast, and impossible to hold onto.',
    summonLine: 'First rule of the riptide — never stand still! Watch me!',
    look: { hairStyle: 'twintails', hair: '#ff8fae', hi: '#ffc9d9', eyes: '#2e9fd9', skin: '#ffdcc4', out1: '#eaf4ff', out2: '#ff8fae', acc: 'pearlpin' },
    kit: {
      skill: { name: 'Rip Current', cd: 6, mult: 2.0, type: 'dash_pierce', desc: 'Surge forward on a ribbon of water.' },
      burst: { name: 'Whirlpool Spiral', mult: 3.7, type: 'spin_drain', desc: 'Twist into a spiral tide, cutting everything around you.' },
    },
  },
};

export const ALL_IDS = Object.keys(CHARACTERS);
export const GACHA_POOL_5 = ['solvaine', 'vesperine'];
export const GACHA_POOL_4 = ['kaenji', 'fujinari', 'nereida', 'bastienne'];
export const GACHA_POOL_3 = ['pip', 'grum', 'lumo', 'coralie'];

// ---------------------------------------------------------------- BANNERS
export const BANNERS = [
  {
    id: 'beginner', name: 'First Threads', subtitle: 'Beginner Weave · 20% off multi',
    featured: null, beginner: true, maxMultUses: 2,
    rates: { five: 0.006, four: 0.051, softPity: 62, hardPity: 80, fourPity: 10 },
    blurb: 'A gentle first weave for new Weavers. Every 10-weave guarantees a 4★ or better.',
  },
  {
    id: 'dawnfire', name: 'Dawnfire Oath', subtitle: 'Featured: Solvaine · The Dawnblade',
    featured: 'solvaine',
    rates: { five: 0.006, four: 0.051, softPity: 62, hardPity: 80, fourPity: 10 },
    blurb: 'The last knight of the Order of the Dawn answers the Loom.',
  },
  {
    id: 'nightveil', name: 'Nightveil Waltz', subtitle: 'Featured: Vesperine · The Veilwalker',
    featured: 'vesperine',
    rates: { five: 0.006, four: 0.051, softPity: 62, hardPity: 80, fourPity: 10 },
    blurb: 'Something with moth wings reads your fate at the edge of the Gloamwood…',
  },
];
export const SUMMON_COST = { single: 160, multi: 1600 };

// ---------------------------------------------------------------- ENEMIES
export const ENEMIES = {
  wisp:   { id: 'wisp', name: 'Gloamwisp', hp: 240, atk: 26, speed: 4.2, radius: 0.85, xp: 16, tier: 1, element: 'UMBRA' },
  stinger:{ id: 'stinger', name: 'Gloomstinger', hp: 380, atk: 34, speed: 3.2, radius: 1.0, xp: 26, tier: 1, ranged: true, element: 'UMBRA' },
  brute:  { id: 'brute', name: 'Gloambrute', hp: 1050, atk: 52, speed: 2.6, radius: 1.6, xp: 60, tier: 2, element: 'UMBRA' },
  shade:  { id: 'shade', name: 'Duskshade', hp: 700, atk: 44, speed: 4.6, radius: 1.0, xp: 42, tier: 2, element: 'UMBRA' },
  colossus:{ id: 'colossus', name: 'Umbral Colossus', hp: 15000, atk: 90, speed: 2.2, radius: 3.4, xp: 900, tier: 3, boss: true, element: 'UMBRA' },
};

// ---------------------------------------------------------------- WORLD SPAWNS
// islands handled in world.js; here only combat spawns
export const SPAWNS = [
  { type: 'wisp', count: 4, cx: -18, cz: 14, r: 12 },
  { type: 'wisp', count: 3, cx: 20, cz: -18, r: 10 },
  { type: 'wisp', count: 4, cx: 100, cz: -12, r: 13 },
  { type: 'stinger', count: 3, cx: 122, cz: 8, r: 11 },
  { type: 'brute', count: 1, cx: 112, cz: -20, r: 6 }, { type: 'wisp', count: 3, cx: 112, cz: -20, r: 10 },
  { type: 'shade', count: 4, cx: 118, cz: 86, r: 14 },
  { type: 'stinger', count: 2, cx: 132, cz: 74, r: 10 },
  { type: 'shade', count: 3, cx: 104, cz: 96, r: 11 }, { type: 'wisp', count: 2, cx: 104, cz: 96, r: 8 },
];

// ---------------------------------------------------------------- QUESTS (main chain)
export const QUESTS = [
  {
    id: 'ch1', chapter: 1, name: 'The Weaver Wakes', giver: 'maren',
    intro: [
      { who: 'maren', text: 'So the Loom chose at last… a hundred years I kept its embers, child.' },
      { who: 'maren', text: 'I am Maren. I was a Weaver once, before the Sundering broke the sky.' },
      { who: 'loom', text: '⟡ WEAVER DETECTED. THREAD: UNWOVEN. THE GLOAM COMES AT DUSK. TAKE UP YOUR BLADE.' },
      { who: 'maren', text: 'Listen to it. Gloamwisps crawl from the fields each night. Scatter four of them and prove your thread holds.' },
    ],
    steps: [{ type: 'kill', target: 'wisp', count: 4, hint: 'Defeat Gloamwisps (follow the marker east/south meadows)' }],
    outro: [{ who: 'maren', text: 'Your thread sings true. Come — the Loom will rekindle for you.' }],
    rewards: { stardust: 160, unlock: 'loom' },
  },
  {
    id: 'ch2', chapter: 2, name: 'Light the Wayshrine', giver: 'maren',
    intro: [
      { who: 'maren', text: 'Three Sunshards fell when the sky broke. Bring them to the Wayshrine and the Loom wakes fully.' },
      { who: 'tobi', text: 'I saw one sparkle near the west hill! And two more across the bridge! Bring \'em back, Weaver!' },
    ],
    steps: [{ type: 'collect', target: 'sunshard', count: 3, hint: 'Find 3 Sunshards (west hill & Meadowal Fields)' }],
    outro: [
      { who: 'loom', text: '⟡ LOOM REKINDLED. WEAVE-FUNCTION RESTORED. FIRST THREADS AVAILABLE, WEAVER.' },
      { who: 'maren', text: 'The Loom can now bind new companions from starlight. Take young Lumo\'s lantern too — you\'ll need healing where you\'re going.' },
    ],
    rewards: { stardust: 320, grant: 'lumo', unlock: 'gacha' },
  },
  {
    id: 'ch3', chapter: 3, name: 'The Meadow Breach', giver: 'maren',
    intro: [
      { who: 'ondotext', text: 'Psst — Weaver. Ondo\'s the name. There\'s a Gloam camp squatting on my trade route across the bridge. Brute leading them. Terrible for business.' },
      { who: 'maren', text: 'Break the camp. A Gloambrute commands it — strike when its guard drops.' },
    ],
    steps: [
      { type: 'kill', target: 'brute', count: 1, hint: 'Slay the Gloambrute at the far camp in Meadowal Fields' },
      { type: 'killany', count: 6, hint: 'Thin the Gloam ranks in the Fields (defeat 6)' },
    ],
    outro: [{ who: 'maren', text: 'The route is open again. But the wisps whisper of a wood deeper in, where the dark hums a song…' }],
    rewards: { stardust: 320, sigils: 1 },
  },
  {
    id: 'ch4', chapter: 4, name: 'Whispers in Gloamwood', giver: 'maren',
    intro: [
      { who: 'maren', text: 'Gloamwood, past the Fields. Something SINGS there, child — and the dark dances to it. Find the singer.' },
      { who: 'vesperine', text: 'Well, well. The little thread walks right into my web. Tell me, Weaver — can you keep pace with fate?' },
    ],
    steps: [
      { type: 'reach', target: 'vesperine_spot', hint: 'Meet the voice deep in Gloamwood' },
      { type: 'kill', target: 'shade', count: 4, hint: 'Prove yourself: defeat Duskshades in Gloamwood (4)' },
    ],
    outro: [
      { who: 'vesperine', text: 'Mmm. Your thread glitters brighter than most. Very well — I will watch you weave from the shadows.' },
      { who: 'loom', text: '⟡ ANOMALY: THE HOLLOW CHORISTER DETECTED. SONG INTENSITY RISING. THE SPIRE HOLDS THE ANSWER.' },
    ],
    rewards: { stardust: 400, sigils: 2 },
  },
  {
    id: 'ch5', chapter: 5, name: 'The Fracture Ascent', giver: 'loomgate',
    intro: [
      { who: 'loom', text: '⟡ FRACTURE GATE OPEN. BEYOND WAITS THE COLOSSUS — A KNOT OF EVERY UNDONE THREAD.' },
      { who: 'aster', text: 'Then we cut the knot. Everyone — stay close to me.' },
    ],
    steps: [{ type: 'boss', target: 'colossus', count: 1, hint: 'Take the Fracture Gate in Gloamwood and defeat the Umbral Colossus' }],
    outro: [
      { who: 'colossus', text: '…s i n g … w i t h … u s …' },
      { who: 'vesperine', text: 'It fell silent… but listen, Weaver. Far above the fracture — another voice. Another thread, glowing. Yours is not the only loom anymore.' },
      { who: 'maren', text: 'Then our story is only beginning. Rest now, Starweave. Dawn always returns.' },
    ],
    rewards: { stardust: 800, sigils: 5 },
  },
];

// ---------------------------------------------------------------- NPCS
export const NPCS = [
  { id: 'maren', name: 'Elder Maren', pos: [-6, -30], color: '#c9c2e8', dialog: [
    'The Loom hums louder each day you grow stronger, child.',
    'The Order of the Dawn wore white and gold. Solvaine was their blade — if the Loom calls her, treat her well.',
    'Stardust falls heaviest after a battle. Gather it; the Loom eats starlight like we eat bread.',
  ]},
  { id: 'tobi', name: 'Tobi', pos: [17, -8], color: '#8fd4ff', dialog: [
    'When I grow up I\'m gonna FLY to the big fracture and see what broke the sky!',
    'Mister Ondo says he sold a star once. A SMALL one though.',
    'Have you seen Miss Vesperine? Kids say she has moth wings. I believe it!',
  ]},
  { id: 'ondo', name: 'Merchant Ondo', pos: [14, 15], color: '#ffd76e', dialog: [
    'Genuine star-junk! Barely cursed! Everything must go!',
    'Between us? The Gloam drop stardust when they pop. Battle\'s the best market there is.',
    'The Starwell west of here drips free starlight every few minutes. No refunds on time spent waiting!',
  ]},
];

export const STARWELL_INTERVAL_MS = 8 * 60 * 1000; // free 80 stardust
export const STARWELL_AMOUNT = 80;

export const TIPS = [
  'Element wheel: Ember ▶ Gale ▶ Stone ▶ Tide ▶ Ember. Radiance and Umbra shred each other.',
  'Bursts need 100 energy — land hits and make kills to charge.',
  'Swap heroes with 1 / 2 / 3. Each has own HP and energy.',
  'Shift to dash — you are invulnerable mid-dash.',
  'The Starwell on Dawnrest Isle gives free Stardust every 8 minutes.',
  'Lost a 50/50 on a banner? Your next 5★ there is guaranteed featured.',
  'Duplicates become Resonance: permanent stat boosts up to R5.',
];
