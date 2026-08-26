// Zone registry. Each meta: name, desc, swatch, theme, parTime, music, build(builder).
import { neonSkyline } from './level1.js';
import { verdantRush } from './level2.js';
import { foundryCore } from './level3.js';
import * as THREE from 'three';
const V3 = (x,y,z) => new THREE.Vector3(x,y,z);

export const LEVEL_METAS = [
  {
    id: 'neon', name: 'NEON SKYLINE',
    desc: 'Sprint the midnight expressway, punch through the mega-loop and grind the skyline rails.',
    swatch: 'linear-gradient(135deg,#0b1030,#29f5ff 55%,#ff3d81)',
    theme: {
      solid: { roughness: .68, metalness: .28 },
      fog: { color: 0x0a0e24, density: 0.0055 },
      sun: { color: 0x88aaff, intensity: 1.1, dir: V3(-.4,.7,.35) },
      hemi: { sky: 0x33447f, ground: 0x0c1020, intensity: .85 },
      sky: { top: 0x05070f, mid: 0x101a3c, bottom: 0x2b1440, stars: 1 },
    },
    parTime: 95,
    music: { bpm: 134, root: 45, scale: [0, 3, 5, 7, 10], bassPattern: [0, -1, 0, 0, 7, -1, 0, -1, 5, -1, 0, 0, 3, -1, 7, -1] },
    build: neonSkyline,
  },
  {
    id: 'verdant', name: 'VERDANT RUSH',
    desc: 'Rolling meadows, a carving river and canyon walls made for wall-running.',
    swatch: 'linear-gradient(135deg,#1d4d2b,#7ec850 55%,#2ea3b8)',
    theme: {
      solid: { roughness: .9, metalness: .02 },
      fog: { color: 0xbfe3ef, density: 0.0038 },
      sun: { color: 0xfff2cf, intensity: 2.6, dir: V3(.5,.8,.3) },
      hemi: { sky: 0x9fd8ff, ground: 0x3d6b35, intensity: .9 },
      sky: { top: 0x3f8fd6, mid: 0x9fd4f2, bottom: 0xdff3ea, stars: 0 },
    },
    parTime: 105,
    music: { bpm: 124, root: 48, scale: [0, 2, 4, 7, 9], bassPattern: [0, -1, 7, -1, 0, -1, 9, -1, 5, -1, 7, -1, 4, -1, 2, -1] },
    build: verdantRush,
  },
  {
    id: 'foundry', name: 'FOUNDRY CORE',
    desc: 'Molten depths, piston timing floors and magnet rails spiralling into the Core.',
    swatch: 'linear-gradient(135deg,#1a0d08,#ff7a1a 55%,#ffd23d)',
    theme: {
      solid: { roughness: .55, metalness: .55 },
      fog: { color: 0x1c0d06, density: 0.007 },
      sun: { color: 0xffb27a, intensity: 1.3, dir: V3(.3,.75,.4) },
      hemi: { sky: 0x66351c, ground: 0x1c0f08, intensity: .8 },
      sky: { top: 0x120604, mid: 0x3a1408, bottom: 0x712c0e, stars: 0 },
    },
    parTime: 115,
    music: { bpm: 142, root: 41, scale: [0, 3, 5, 6, 7, 10], bassPattern: [0, 0, -1, 0, 3, -1, 0, -1, 5, -1, 3, 0, 1, -1, 7, 6] },
    build: foundryCore,
  },
];
