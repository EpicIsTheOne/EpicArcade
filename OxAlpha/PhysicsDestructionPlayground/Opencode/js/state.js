import * as THREE from '../lib/three.module.js';

export const CFG = {
  gravity: -16,
  maxDynamic: 470,
  blastRadius: 6.5,
  blastPower: 11.5,
  projectileCap: 28,
};

export const G = {
  RAPIER: null,
  world: null,
  eventQueue: null,
  scene: null,
  camera: null,
  renderer: null,
  entities: new Map(),
  byCollider: new Map(),
  rayMeshes: [],
  meshesDirty: true,
  nextId: 1,
  dynamicCount: 0,
  fragmentQueue: [],
  rigQueue: [],
  projQueue: [],
  timeScale: 1,
  targetTimeScale: 1,
  acc: 0,
  tool: 'grab',
  spawnKind: 'crate',
  grabbed: null,
  hovered: null,
  holdAction: null,
  muted: false,
  shake: 0,
  camYaw: -1.08,
  camPitch: 0.54,
  camDist: 37,
  camTarget: new THREE.Vector3(-1, 3, 0),
  curYaw: -1.08,
  curPitch: 0.54,
  curDist: 37,
  stats: { fps: 0, frames: 0, acc: 0 },
  rngSeed: 1337,
};

export function rng() {
  G.rngSeed = (G.rngSeed * 1664525 + 1013904223) >>> 0;
  return G.rngSeed / 4294967296;
}

export const tmpV1 = new THREE.Vector3();
export const tmpV2 = new THREE.Vector3();
export const tmpQ = new THREE.Quaternion();

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
