// Island population: vegetation, POI structures, props, collision, raycasts, harvesting.
import * as THREE from 'three';
import { CFG } from './config.js';
import { S } from './state.js';
import { SpatialHash, mulberry32, rayAABB, rayCylinderXZ, clamp, makeNoise2D, makeFbm } from './utils.js';
import { heightAt, POIS } from './terrain.js';

let sceneRef = null;

export const colliders = new SpatialHash();
let botsModule = null;
export function registerBotsModule(m) { botsModule = m; }

// ---------- data ----------
const HARV_CELL = 26;
const harvGrid = new Map();      // "cx,cz" -> [records]
const harvEntries = [];          // all records

function harvKey(x, z) { return `${Math.floor(x / HARV_CELL)},${Math.floor(z / HARV_CELL)}`; }
function harvAdd(rec) {
  harvEntries.push(rec);
  const k = harvKey(rec.x, rec.z);
  let arr = harvGrid.get(k);
  if (!arr) { arr = []; harvGrid.set(k, arr); }
  arr.push(rec);
}

const _qtmp = [];
function harvQuery(x, z, r, out) {
  out.length = 0;
  const c0x = Math.floor((x - r) / HARV_CELL), c1x = Math.floor((x + r) / HARV_CELL);
  const c0z = Math.floor((z - r) / HARV_CELL), c1z = Math.floor((z + r) / HARV_CELL);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      const arr = harvGrid.get(`${cx},${cz}`);
      if (!arr) continue;
      for (const rec of arr) if (!rec._q) { rec._q = true; out.push(rec); }
    }
  }
  for (const rec of out) rec._q = false;
  return out;
}

// ---------- helpers ----------
const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
const matCache = new Map();
function stdMat(color, rough = 0.85, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); matCache.set(k, m); }
  return m;
}

function addPanel(w, h, d, x, y, z, matType, ry = 0, hpOverride = null) {
  // snap rotations to 90deg increments so AABBs match visuals
  ry = Math.round(ry / (Math.PI / 2)) * (Math.PI / 2);
  const HP = { wood: 220, brick: 320, metal: 420 };
  const COLORS = { wood: 0xa97b50, brick: 0xa8998a, metal: 0x93a1ad };
  const tint = { wood: [0xb98a5e, 0x9a6f44, 0xc09a68], brick: [0xb0a294, 0x98897c, 0xc2b4a6], metal: [0x93a1ad, 0x7e8c98, 0xa8b6c2] };
  const list = tint[matType];
  const color = list[Math.floor(Math.random() * list.length)];
  // snap rotation to 90° steps so AABBs stay tight
  ry = Math.round(ry / (Math.PI / 2)) * (Math.PI / 2);
  const mesh = new THREE.Mesh(boxGeo(w, h, d), stdMat(color));
  mesh.position.set(x, y + h / 2, z);
  if (ry) mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  sceneRef.add(mesh);
  const swap = Math.round(Math.abs(ry) / (Math.PI / 2)) % 2 === 1;
  const hw = swap ? d / 2 : w / 2;
  const hd = swap ? w / 2 : d / 2;
  const panel = {
    type: 'panel', matType,
    mesh,
    aabb: {
      min: new THREE.Vector3(x - hw, y, z - hd),
      max: new THREE.Vector3(x + hw, y + h, z + hd),
    },
    hp: hpOverride ?? HP[matType],
    maxHp: hpOverride ?? HP[matType],
    dead: false,
  };
  mesh.userData.panel = panel;
  colliders.add(panel, x, z, Math.max(hw, hd) + 0.6);
  return panel;
}

function addDecor(mesh, x, z, solidR = 0) {
  mesh.castShadow = false; mesh.receiveShadow = true;
  sceneRef.add(mesh);
  if (solidR > 0) {
    const bb = new THREE.Box3().setFromObject(mesh);
    const rec = { type: 'decor', dead: false, aabb: { min: bb.min, max: bb.max }, mesh };
    colliders.add(rec, x, z, solidR);
    mesh.userData.panel = rec;
  }
  return mesh;
}

// ---------- vegetation ----------
function buildVegetation(rng, fbm) {
  const leafTrunkGeo = new THREE.CylinderGeometry(0.32, 0.48, 5, 6);
  leafTrunkGeo.translate(0, 2.5, 0);
  const pineTrunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 6.5, 6);
  pineTrunkGeo.translate(0, 3.25, 0);
  const leafCanopyGeo = new THREE.IcosahedronGeometry(2.7, 0);
  leafCanopyGeo.translate(0, 6.3, 0);
  const pineCanopyGeo = new THREE.ConeGeometry(2.3, 7.5, 7);
  pineCanopyGeo.translate(0, 7.4, 0);

  const MAXT = 700;
  const trunkMatL = stdMat(0x6e4a2c, 0.95);
  const trunkMatP = stdMat(0x5a3d26, 0.95);
  const canL = stdMat(0x3f8f3a, 1);
  const canP = stdMat(0x2e7040, 1);

  const trunksL = [], trunksP = [];
  const recs = [];

  let tries = 0;
  while (recs.length < MAXT && tries < MAXT * 14) {
    tries++;
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * CFG.ISLAND_R * 0.99;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const h = heightAt(x, z);
    if (h < 2.4 || h > 78) continue;
    let tooClose = false;
    for (const p of POIS) {
      if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r * 0.72) ** 2) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const dens = fbm(x * 0.008 + 40, z * 0.008 - 20, 3);
    if (dens < 0.42) continue;
    if (Math.abs(heightAt(x + 2, z) - h) > 1.6) continue;
    const pine = h > 30 || rng() < 0.28;
    recs.push({
      kind: 'tree', x, z, y: h - 0.15, alive: true,
      hp: 90, matType: 'wood',
      pine, scale: 0.8 + rng() * 0.9,
      idxL: -1, idxP: -1,
    });
  }

  const leavesL = recs.filter(r => !r.pine), leavesP = recs.filter(r => r.pine);
  const trunkIL = new THREE.InstancedMesh(leafTrunkGeo, trunkMatL, Math.max(1, leavesL.length));
  const trunkIP = new THREE.InstancedMesh(pineTrunkGeo, trunkMatP, Math.max(1, leavesP.length));
  const canopyIL = new THREE.InstancedMesh(leafCanopyGeo, canL, Math.max(1, leavesL.length));
  const canopyIP = new THREE.InstancedMesh(pineCanopyGeo, canP, Math.max(1, leavesP.length));
  for (const im of [trunkIL, trunkIP, canopyIL, canopyIP]) { im.castShadow = true; im.receiveShadow = true; }

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  leavesL.forEach((r, i) => {
    r.idxL = i;
    Q.setFromAxisAngle(UP, rng() * Math.PI * 2);
    V.set(r.x, r.y, r.z); SC.setScalar(r.scale);
    M.compose(V, Q, SC);
    trunkIL.setMatrixAt(i, M); canopyIL.setMatrixAt(i, M);
    r.trunkIM = trunkIL; r.canopyIM = canopyIL;
    harvAdd(r);
    const tRec = {
      type: 'tree', dead: false, harv: r,
      aabb: { min: new THREE.Vector3(r.x - 0.5 * r.scale, r.y, r.z - 0.5 * r.scale), max: new THREE.Vector3(r.x + 0.5 * r.scale, r.y + 5 * r.scale, r.z + 0.5 * r.scale) },
    };
    r.colRec = tRec;
    colliders.add(tRec, r.x, r.z, 0.9);
  });
  leavesP.forEach((r, i) => {
    r.idxP = i;
    Q.setFromAxisAngle(UP, rng() * Math.PI * 2);
    V.set(r.x, r.y, r.z); SC.setScalar(r.scale);
    M.compose(V, Q, SC);
    trunkIP.setMatrixAt(i, M); canopyIP.setMatrixAt(i, M);
    r.trunkIM = trunkIP; r.canopyIM = canopyIP;
    harvAdd(r);
    const tRec = {
      type: 'tree', dead: false, harv: r,
      aabb: { min: new THREE.Vector3(r.x - 0.45 * r.scale, r.y, r.z - 0.45 * r.scale), max: new THREE.Vector3(r.x + 0.45 * r.scale, r.y + 6 * r.scale, r.z + 0.45 * r.scale) },
    };
    r.colRec = tRec;
    colliders.add(tRec, r.x, r.z, 0.9);
  });
  sceneRef.add(trunkIL, trunkIP, canopyIL, canopyIP);

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1.6, 0);
  const rockMat = stdMat(0x8f959e, 1);
  const NR = 130;
  const rockIM = new THREE.InstancedMesh(rockGeo, rockMat, NR);
  rockIM.castShadow = true; rockIM.receiveShadow = true;
  let ri = 0; tries = 0;
  while (ri < NR && tries < NR * 20) {
    tries++;
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * CFG.ISLAND_R * 0.96;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const h = heightAt(x, z);
    if (h < 2 || h > 90) continue;
    let bad = false;
    for (const p of POIS) if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r * 0.8) ** 2) { bad = true; break; }
    if (bad) continue;
    const sc = 0.7 + rng() * 1.7;
    Q.setFromAxisAngle(UP, rng() * Math.PI * 2);
    V.set(x, h + sc * 0.3, z); SC.set(sc, sc * 0.8, sc);
    M.compose(V, Q, SC);
    rockIM.setMatrixAt(ri, M);
    const rec = {
      kind: 'rock', x, z, y: h, alive: true, hp: 170, matType: 'brick', scale: sc, idx: ri, rockIM,
    };
    harvAdd(rec);
    const cRec = {
      type: 'rock', dead: false, harv: rec,
      aabb: { min: new THREE.Vector3(x - sc * 1.3, h, z - sc * 1.3), max: new THREE.Vector3(x + sc * 1.3, h + sc * 1.5, z + sc * 1.3) },
    };
    rec.colRec = cRec;
    colliders.add(cRec, x, z, sc * 1.4);
    ri++;
  }
  rockIM.count = ri;
  sceneRef.add(rockIM);
}

// ---------- structures ----------
const PALETTES = {
  dock: { wall: 'metal', roofC: 0x4a565f, wallC: [0x5d7d8f, 0x52707f, 0x66889a] },
  village: { wall: 'wood', roofC: 0x7a5230, wallC: [0xcfc4ae, 0xc2b6a0, 0xd8cdb8] },
  forest: { wall: 'wood', roofC: 0x584430, wallC: [0x7a5c3a, 0x6e5234, 0x846640] },
  manor: { wall: 'brick', roofC: 0x4a4038, wallC: [0xb8b2a6, 0xaaa498, 0xc4beb2] },
  industrial: { wall: 'metal', roofC: 0x5a646e, wallC: [0x93a1ad, 0x84929e, 0xa2b0bc] },
  ruins: { wall: 'brick', roofC: 0x6a645c, wallC: [0xb0aa9e, 0xa29c90, 0xbcb6aa] },
  creek: { wall: 'wood', roofC: 0x4a5850, wallC: [0x9fb3a8, 0x92a69b, 0xacbfB4] },
  crater: { wall: 'wood', roofC: 0x5a5048, wallC: [0x8a8078, 0x7e746c, 0x968c84] },
};

function house(cx, cz, ryRaw, pal, rng, twoStory = false) {
  const ry = Math.round(ryRaw / (Math.PI / 2)) * (Math.PI / 2);
  const w = 7 + rng() * 5, d = 7 + rng() * 5, WH = 3.6;
  const gy = heightAt(cx, cz);
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const loc = (lx, lz) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos];
  const cols = pal.wallC;

  // foundation
  let [fx, fz] = loc(0, 0);
  addPanel(w + 1.4, 0.55, d + 1.4, fx, gy - 0.2, fz, 'brick');

  const stories = twoStory ? 2 : 1;
  for (let s = 0; s < stories; s++) {
    const y0 = gy + 0.35 + s * (WH + 0.35);
    const doorSide = s === 0 ? Math.floor(rng() * 4) : -1;
    for (let side = 0; side < 4; side++) {
      const horiz = side === 0 || side === 2;
      const len = horiz ? w : d;
      const off = horiz ? (side === 0 ? d / 2 : -d / 2) : (side === 3 ? w / 2 : -w / 2);
      const col = cols[(side + Math.floor(rng() * 3)) % cols.length];
      if (side === doorSide) {
        const segW = (len - 1.8) / 2;
        for (const t of [-(len / 2 - segW / 2), (len / 2 - segW / 2)]) {
          const [px, pz] = horiz ? loc(t, off) : loc(off, t);
          addPanel(horiz ? segW : 0.35, WH, horiz ? 0.35 : segW, px, y0, pz, pal.wall, horiz ? ry : ry + Math.PI / 2);
        }
        // header above door
        const [hx, hz] = horiz ? loc(0, off) : loc(off, 0);
        addPanel(horiz ? 1.8 : 0.35, WH - 2.4, horiz ? 0.35 : 1.8, hx, y0 + 2.4, hz, pal.wall, horiz ? ry : ry + Math.PI / 2);
      } else {
        const [px, pz] = horiz ? loc(0, off) : loc(off, 0);
        addPanel(horiz ? w : 0.35, WH, horiz ? 0.35 : d, px, y0, pz, pal.wall, horiz ? ry : ry + Math.PI / 2);
      }
    }
    if (s === 0 && stories === 2) {
      const [sx, sz] = loc(0, 0);
      addPanel(w - 0.6, 0.4, d - 0.6, sx, y0 + WH, sz, 'wood');
      // exterior steps to level 2
      const [stx, stz] = loc(w / 2 + 1.6, d / 4);
      for (let i = 0; i < 6; i++) {
        addPanel(1.6, 0.55, 0.9, stx + Math.sin(ry + Math.PI / 2) * i * 0.92, gy + 0.3 + i * 0.62, stz + Math.cos(ry + Math.PI / 2) * i * 0.92, 'wood', ry);
      }
    }
  }
  const topY = gy + 0.35 + stories * (WH + 0.35) - 0.35;
  const [rx, rz] = loc(0, 0);
  addPanel(w + 1.6, 0.45, d + 1.6, rx, topY, rz, 'wood');
  const roof = new THREE.Mesh(boxGeo(w + 2, 0.3, d + 2), stdMat(pal.roofC));
  const [r2x, r2z] = loc(0, 0);
  roof.position.set(r2x, topY + 0.62, r2z);
  roof.rotation.y = ry;
  roof.castShadow = true;
  sceneRef.add(roof);
}

function watchtower(cx, cz, rng) {
  const gy = heightAt(cx, cz);
  for (const [ox, oz] of [[-1.5, -1.5], [-1.5, 1.5], [1.5, -1.5], [1.5, 1.5]]) {
    addPanel(0.42, 5.2, 0.42, cx + ox, gy, cz + oz, 'wood');
  }
  addPanel(3.8, 0.4, 3.8, cx, gy + 5.2, cz, 'wood');
  addPanel(3.8, 0.9, 0.25, cx, gy + 5.6, cz - 1.78, 'wood');
  addPanel(3.8, 0.9, 0.25, cx, gy + 5.6, cz + 1.78, 'wood');
  // access steps
  for (let i = 0; i < 8; i++) {
    addPanel(1.4, 0.5, 1.0, cx + 2.6, gy + 0.25 + i * 0.66, cz + 2.2 - i * 0.85, 'wood');
  }
}

function landmark(poi, rng) {
  const gy = heightAt(poi.x, poi.z);
  switch (poi.palette) {
    case 'dock': {
      addPanel(3, 20, 3, poi.x + 20, gy, poi.z - 14, 'brick');
      const lamp = new THREE.PointLight(0xffd28a, 40, 60);
      lamp.position.set(poi.x + 20, gy + 21, poi.z - 14);
      sceneRef.add(lamp);
      for (let i = 0; i < 5; i++) {
        addPanel(2.2, 2.2, 2.2, poi.x + Math.cos(i * 2.2) * 22, gy, poi.z + Math.sin(i * 2.2) * 20, 'wood', 0, 140);
      }
      break;
    }
    case 'industrial': {
      for (const ox of [-14, 14]) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 11, 10), stdMat(0x9aa8b4, 0.5, 0.55));
        cyl.position.set(poi.x + ox, gy + 5.5, poi.z + 10);
        cyl.castShadow = true;
        sceneRef.add(cyl);
      }
      for (let i = 0; i < 4; i++) {
        addPanel(6.2, 2.5, 2.4, poi.x - 20 + (i % 2) * 7, gy + Math.floor(i / 2) * 2.55, poi.z - 18, 'metal', 0, 520);
      }
      break;
    }
    case 'ruins': {
      addPanel(2.2, 13, 2.2, poi.x, gy, poi.z, 'brick', 0, 800);
      const disk = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.45, 8, 24), stdMat(0xd8a83c, 0.35, 0.8));
      disk.position.set(poi.x, gy + 15.5, poi.z);
      sceneRef.add(disk);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        addPanel(1.4, 3 + rng() * 5, 1.4, poi.x + Math.cos(a) * 12, heightAt(poi.x + Math.cos(a) * 12, poi.z + Math.sin(a) * 12), poi.z + Math.sin(a) * 12, 'brick');
      }
      break;
    }
    case 'crater': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const tent = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.6, 5), stdMat(0xc8b89a, 0.9));
        tent.position.set(poi.x + Math.cos(a) * 10, heightAt(poi.x + Math.cos(a) * 10, poi.z + Math.sin(a) * 10) + 1.3, poi.z + Math.sin(a) * 10);
        addDecor(tent, tent.position.x, tent.position.z, 2);
      }
      const fire = new THREE.PointLight(0xff9a3c, 30, 36);
      fire.position.set(poi.x, gy + 1.5, poi.z);
      sceneRef.add(fire);
      break;
    }
    case 'manor': {
      house(poi.x, poi.z, rng() * Math.PI, PALETTES.manor, rng, true);
      break;
    }
    case 'forest': {
      watchtower(poi.x + 8, poi.z + 6, rng);
      break;
    }
    case 'creek': {
      // pier into water
      for (let i = 0; i < 6; i++) {
        addPanel(2.4, 0.3, 6, poi.x + 10, 1.1, poi.z - 6 - i * 6.2, 'wood', 0, 400);
      }
      break;
    }
  }
}

function buildStructures(rng) {
  for (const poi of POIS) {
    const pal = PALETTES[poi.palette];
    const n = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.7;
      const rr = poi.r * (0.3 + rng() * 0.42);
      const bx = poi.x + Math.cos(a) * rr, bz = poi.z + Math.sin(a) * rr;
      if (heightAt(bx, bz) < 2) continue;
      house(bx, bz, -a + Math.PI / 2 + rng() * 0.4, pal, rng, rng() < 0.22);
    }
    if (poi.palette !== 'manor') landmark(poi, rng);
    // crates around
    const nc = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < nc; i++) {
      const a = rng() * Math.PI * 2, rr = poi.r * (0.2 + rng() * 0.6);
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (h < 2) continue;
      addPanel(1.3, 1.3, 1.3, x, h, z, 'wood', rng() * Math.PI, 130);
    }
  }
  // wilderness cabins + towers + cars
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * CFG.ISLAND_R * 0.8;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (heightAt(x, z) < 2.5) continue;
    let near = false;
    for (const p of POIS) if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 30) ** 2) { near = true; break; }
    if (near) continue;
    if (i % 3 === 2) watchtower(x, z, rng);
    else house(x, z, rng() * Math.PI, PALETTES.forest, rng);
  }
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * CFG.ISLAND_R * 0.85;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = heightAt(x, z);
    if (h < 1.6) continue;
    const ry = rng() * Math.PI;
    const carBody = addPanel(4.3, 1.15, 1.9, x, h + 0.25, z, 'metal', ry, 240);
    const cab = addPanel(2.1, 0.85, 1.7, x - Math.cos(ry) * 0.3, h + 1.38, z - Math.sin(ry) * 0.3, 'metal', ry, 180);
    carBody.sibling = cab;
  }
}

export function generate(scene, seed) {
  sceneRef = scene;
  const rng = mulberry32(seed ^ 0x51ab);
  const fbm = makeFbm(makeNoise2D(seed + 555));
  buildVegetation(rng, fbm);
  buildStructures(rng);
}

// ---------- queries ----------
export function groundAt(x, z, y) {
  let g = heightAt(x, z);
  if (y === undefined) return g;
  const lim = y + 0.68;
  const objs = colliders.query(x, z, 1.2, _qtmp);
  for (const o of objs) {
    if (o.dead) continue;
    const bb = o.aabb;
    if (o.type === 'build' && o.gkind === 'ramp') {
      if (Math.abs(x - o.cx) > 2.05 || Math.abs(z - o.cz) > 2.05) continue;
      const s = rampSurfaceY(o, x, z);
      if (s <= y + 1.05 && s > g) g = s;
      continue;
    }
    if (x < bb.min.x - 0.42 || x > bb.max.x + 0.42 || z < bb.min.z - 0.42 || z > bb.max.z + 0.42) continue;
    if (bb.max.y <= lim && bb.max.y > g) g = bb.max.y;
  }
  return Math.max(g, CFG.WATER_Y - 0.3);
}

export function nearestHarvest(x, z, r = 150) {
  let best = null, bestD = r;
  for (const rec of harvEntries) {
    if (!rec.alive) continue;
    const d = Math.hypot(rec.x - x, rec.z - z);
    if (d < bestD) { bestD = d; best = rec; }
  }
  return best;
}

export function rampSurfaceY(piece, x, z) {
  const a = piece.rot * Math.PI / 2;
  const dx = x - piece.cx, dz = z - piece.cz;
  const zl = dx * Math.sin(a) + dz * Math.cos(a);
  const f = clamp((2 - zl) / 4, 0, 1);
  return piece.baseY + 0.17 + f * 3.66;
}

// ---------- raycast ----------
const _cellTmp = [];
function forEachCellAlongRay(o, d, maxDist, fn) {
  const step = 15;
  const seen = new Set();
  for (let t = 0; t <= maxDist + step; t += step) {
    const tt = Math.min(t, maxDist);
    const cx = Math.floor((o.x + d.x * tt) / 18);
    const cz = Math.floor((o.z + d.z * tt) / 18);
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        const k = `${cx + ix},${cz + iz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        fn(k);
      }
    }
    if (tt >= maxDist) break;
  }
}

export function rayCast(origin, dir, maxDist, opts = {}) {
  let best = null;
  let bestT = maxDist;

  // water plane
  if (dir.y < -0.001 && origin.y > CFG.WATER_Y) {
    const tw = (CFG.WATER_Y - origin.y) / dir.y;
    if (tw > 0 && tw < bestT) {
      bestT = tw;
      best = {
        kind: 'water', dist: tw, obj: null,
        point: new THREE.Vector3(origin.x + dir.x * tw, CFG.WATER_Y, origin.z + dir.z * tw),
      };
    }
  }

  // terrain march
  const step = 1.4;
  for (let t = 0.6; t < bestT; t += step) {
    const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
    if (py <= heightAt(px, pz)) {
      let lo = Math.max(0, t - step), hi = t;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + dir.x * mid, my = origin.y + dir.y * mid, mz = origin.z + dir.z * mid;
        if (my <= heightAt(mx, mz)) hi = mid; else lo = mid;
      }
      if (hi < bestT) {
        bestT = hi;
        best = {
          kind: 'terrain', dist: hi, obj: null,
          point: new THREE.Vector3(origin.x + dir.x * hi, origin.y + dir.y * hi, origin.z + dir.z * hi),
        };
      }
      break;
    }
  }

  // colliders (panels + builds)
  const tested = new Set();
  {
    const seenCells = new Set();
    for (let t = 0; t <= bestT + 18; t += 15) {
      const tt = Math.min(t, bestT);
      const ccx = Math.floor((origin.x + dir.x * tt) / 18);
      const ccz = Math.floor((origin.z + dir.z * tt) / 18);
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          const key = `${ccx + ix},${ccz + iz}`;
          if (seenCells.has(key)) continue;
          seenCells.add(key);
        }
      }
      if (tt >= bestT) break;
    }
    for (const key of seenCells) {
      const arr = colliders.map.get(key);
      if (!arr) continue;
      for (const e of arr) {
        if (tested.has(e) || e.dead) continue;
        tested.add(e);
        const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, e.aabb.min, e.aabb.max);
        if (t !== null && t > 0.04 && t < bestT) {
          bestT = t;
          best = {
            kind: e.type === 'build' ? 'build' : 'panel',
            obj: e, dist: t,
            point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
          };
        }
      }
    }
  }

  // harvestables
  {
    const seenH = new Set();
    const visit = (k) => {
      const arr = harvGrid.get(k);
      if (!arr) return;
      for (const rec of arr) {
        if (seenH.has(rec) || !rec.alive) continue;
        seenH.add(rec);
        let t = null;
        if (rec.kind === 'tree') {
          t = rayCylinderXZ(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, rec.x, rec.z, 0.55 * rec.scale, rec.y, rec.y + 5.5 * rec.scale);
        } else {
          t = rayCylinderXZ(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, rec.x, rec.z, rec.scale * 1.5, rec.y, rec.y + rec.scale * 1.7);
        }
        if (t !== null && t > 0.05 && t < bestT) {
          bestT = t;
          best = {
            kind: 'harvest', obj: rec, dist: t,
            point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
          };
        }
      }
    };
    for (let t = 0; t <= bestT + 26; t += 24) {
      const tt = Math.min(t, bestT);
      const ccx = Math.floor((origin.x + dir.x * tt) / HARV_CELL);
      const ccz = Math.floor((origin.z + dir.z * tt) / HARV_CELL);
      visit(`${ccx},${ccz}`);
      if (tt >= bestT) break;
    }
  }

  // bots
  if (opts.bots !== false && botsModule?.botsHitTest) {
    const bh = botsModule.botsHitTest(origin, dir, bestT);
    if (bh && bh.dist < bestT) {
      best = { kind: 'bot', obj: bh.bot, part: bh.part, dist: bh.dist, point: bh.point };
    }
  }

  return best;
}

// ---------- damage ----------
export function damageHarvest(rec, amt, point) {
  if (!rec || !rec.alive) return { matType: rec?.matType || 'wood', mats: 0 };
  rec.hp -= amt;
  const mats = rec.kind === 'tree' ? 12 : rec.kind === 'rock' ? 10 : 12;
  if (rec.hp <= 0) killHarvest(rec, point);
  else if (rec.canopyIM) {
    // shake hint: briefly darken canopy via scale pulse
    rec.hitPulse = 0.12;
  }
  return { matType: rec.matType, mats };
}

function killHarvest(rec, point) {
  rec.alive = false;
  const zero = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  if (rec.kind === 'tree') {
    rec.trunkIM.setMatrixAt(rec.idxL >= 0 ? rec.idxL : rec.idxP, zero);
    rec.trunkIM.instanceMatrix.needsUpdate = true;
    rec.canopyIM.setMatrixAt(rec.idxL >= 0 ? rec.idxL : rec.idxP, zero);
    rec.canopyIM.instanceMatrix.needsUpdate = true;
  } else {
    rec.rockIM.setMatrixAt(rec.idx, zero);
    rec.rockIM.instanceMatrix.needsUpdate = true;
  }
  if (rec.colRec) {
    rec.colRec.dead = true;
    colliders.remove(rec.colRec);
  }
  Promise.all([import('./fx.js'), import('./audio.js')]).then(([fx, a]) => {
    fx.debris(point || new THREE.Vector3(rec.x, rec.y + 1, rec.z), rec.matType === 'wood' ? 0x8a6a3c : 0x9aa0aa);
    a.sfx.destroy(rec.pos ? rec.pos.distanceTo(S.camera.position) : undefined);
  }).catch(() => { });
}

export function panelDamage(panel, dmg, point) {
  if (!panel || panel.dead) return;
  panel.hp -= dmg;
  if (panel.hp <= 0) {
    panel.dead = true;
    if (panel.sibling && !panel.sibling.dead) setTimeout(() => panelDamage(panel.sibling, 9999, point), 30);
    sceneRef.remove(panel.mesh);
    colliders.remove(panel);
    Promise.all([import('./fx.js'), import('./audio.js')]).then(([fx, a]) => {
      fx.debris(point || new THREE.Vector3((panel.aabb.min.x + panel.aabb.max.x) / 2, (panel.aabb.min.y + panel.aabb.max.y) / 2, (panel.aabb.min.z + panel.aabb.max.z) / 2),
        panel.matType === 'wood' ? 0xa97b50 : panel.matType === 'brick' ? 0xa8998a : 0x93a1ad);
      const camD = S.camera ? Math.hypot(point.x - S.camera.position.x, point.y - S.camera.position.y, point.z - S.camera.position.z) : undefined;
      a.sfx.destroy(camD);
    }).catch(() => { });
  } else if (panel.hp / panel.maxHp < 0.5 && !panel.tinted) {
    panel.tinted = true;
    panel.mesh.material = panel.mesh.material.clone();
    panel.mesh.material.color.multiplyScalar(0.7);
  }
}

export function explosionDamage(pos, radius, dmg, ownerPlayer) {
  const results = { pieces: [], playerDmg: 0 };
  const objs = colliders.query(pos.x, pos.z, radius + 4, _qtmp);
  const seen = new Set();
  for (const o of objs) {
    if (o.dead || seen.has(o)) continue;
    seen.add(o);
    const cx = clamp(pos.x, o.aabb.min.x, o.aabb.max.x);
    const cy = clamp(pos.y, o.aabb.min.y, o.aabb.max.y);
    const cz = clamp(pos.z, o.aabb.min.z, o.aabb.max.z);
    const d = Math.hypot(pos.x - cx, pos.y - cy, pos.z - cz);
    if (d > radius) continue;
    const df = dmg * (1 - d / radius);
    if (o.type === 'build') results.pieces.push({ piece: o, dmg: df });
    else if (o.type === 'panel') panelDamage(o, df, new THREE.Vector3(cx, cy, cz));
  }
  // harvestables in blast
  const hv = harvQuery(pos.x, pos.z, radius, []);
  for (const rec of hv) {
    if (!rec.alive) continue;
    const d = Math.hypot(pos.x - rec.x, pos.y - (rec.y + 1), pos.z - rec.z);
    if (d < radius) damageHarvest(rec, dmg * (1 - d / radius), new THREE.Vector3(rec.x, rec.y + 1, rec.z));
  }
  if (botsModule?.explosionDamageBots) {
    botsModule.explosionDamageBots(pos, radius, dmg, ownerPlayer === S.player ? ownerPlayer : null);
  }
  if (S.player && !S.player.dead) {
    const pd = S.player.pos.distanceTo(pos);
    if (pd < radius) results.playerDmg = dmg * (1 - pd / radius) * 0.75;
  }
  return results;
}

export function applyExplosionResults(results) {
  if (!results) return;
  if (results.pieces.length) {
    import('./building.js').then(b => {
      for (const { piece, dmg } of results.pieces) b.damagePiece(piece, dmg, piece.pos);
    }).catch(() => { });
  }
  if (results.playerDmg > 1 && S.player && !S.player.dead) {
    S.player.damage(results.playerDmg, 'an Explosion');
  }
}
