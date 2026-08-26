import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { S } from './state.js';
import { colliders, groundAt } from './world.js';
import { heightAt } from './terrain.js';
import { sfx } from './audio.js';

const CELL = CFG.CELL;
let sceneRef = null;
const pieceGeoCache = new Map();
const matByType = {};
let ghost = null;
let ghostMatValid, ghostMatInvalid;

export const BUILD_MATS = {
  wood: { hp: 160, color: 0xa97b50 },
  brick: { hp: 300, color: 0xb06a55 },
  metal: { hp: 480, color: 0x93a1ad },
};

export function initBuilding(scene) {
  sceneRef = scene;
  for (const [k, v] of Object.entries(BUILD_MATS)) {
    matByType[k] = new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.8, metalness: k === 'metal' ? 0.6 : 0.05 });
  }
  ghostMatValid = new THREE.MeshBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.38, depthWrite: false });
  ghostMatInvalid = new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.32, depthWrite: false });
}

function geoFor(kind, variant) {
  const key = kind + ':' + (variant || 0);
  if (pieceGeoCache.has(key)) return pieceGeoCache.get(key);
  let g;
  const box = (w, h, d, x, y, z) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    return b;
  };
  if (kind === 'wall') {
    if (variant === 1) {
      g = mergeBoxes([box(1.3, 4, 0.35, -1.35, 2, 0), box(1.3, 4, 0.35, 1.35, 2, 0), box(1.4, 1.4, 0.35, 0, 3.3, 0)]);
    } else if (variant === 2) {
      g = mergeBoxes([
        box(1.3, 4, 0.35, -1.35, 2, 0), box(1.3, 4, 0.35, 1.35, 2, 0),
        box(1.4, 1.3, 0.35, 0, 0.65, 0), box(1.4, 1.4, 0.35, 0, 3.3, 0),
      ]);
    } else {
      g = box(4, 4, 0.35, 0, 2, 0);
    }
  } else if (kind === 'floor') {
    g = box(4, 0.34, 4, 0, 0.17, 0);
  } else if (kind === 'ramp') {
    g = new THREE.BoxGeometry(4, 0.34, 5.66);
    g.rotateX(Math.PI / 4);
    g.translate(0, 2, 0);
  } else if (kind === 'cone') {
    g = new THREE.ConeGeometry(2.85, 2.6, 4);
    g.rotateY(Math.PI / 4);
    g.translate(0, 1.3, 0);
  }
  pieceGeoCache.set(key, g);
  return g;
}
function mergeBoxes(list) {
  return mergeGeometries(list);
}

export function enterBuild(mode) {
  S.build.mode = mode;
  if (!ghost) {
    ghost = new THREE.Mesh(geoFor(mode || 'wall', 0), ghostMatValid);
    ghost.visible = false;
    sceneRef.add(ghost);
  }
  ghost.geometry = geoFor(mode, 0);
  S.emit('buildChanged');
}

export function exitBuild() {
  S.build.mode = null;
  if (ghost) ghost.visible = false;
  S.emit('buildChanged');
}

export function cycleMaterial() {
  const order = ['wood', 'brick', 'metal'];
  S.build.mat = order[(order.indexOf(S.build.mat) + 1) % 3];
  S.emit('buildChanged');
  return S.build.mat;
}

function targetCell(player) {
  const fwd = player.flatForward();
  const px = player.pos.x + fwd.x * 3.4;
  const pz = player.pos.z + fwd.z * 3.4;
  const gx = Math.round(px / CELL);
  const gz = Math.round(pz / CELL);
  const gy = Math.max(Math.round((player.pos.y + 0.4) / CELL), Math.round(groundAt(gx * CELL, gz * CELL) / CELL));
  return { gx, gy, gz };
}

function cellKey(kind, gx, gy, gz, rot) {
  return `${gx},${gy},${gz},${rot % 2 === 0 ? 0 : 1}`;
}

export function updateGhost(player) {
  if (!S.build.mode || !ghost) return;
  const { gx, gy, gz } = targetCell(player);
  const cx = gx * CELL, cz = gz * CELL;
  const baseY = gy * CELL;
  const rot = yawToRot(player.yaw);
  ghost.position.set(cx, baseY, cz);
  ghost.rotation.y = rotForKind(S.build.mode, rot);
  const valid = canPlace(player, S.build.mode, gx, gy, gz, rot);
  ghost.material = valid ? ghostMatValid : ghostMatInvalid;
  ghost.visible = true;
  ghost.userData.target = { gx, gy, gz, rot, valid };
}

function yawToRot(yaw) {
  let a = ((-yaw) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / (Math.PI / 2)) % 4;
}
function rotForKind(kind, rot) {
  if (kind === 'ramp' || kind === 'wall') return rot * Math.PI / 2;
  return 0;
}

export function canPlace(player, kind, gx, gy, gz, rot) {
  if (player.mats[S.build.mat] < CFG.BUILD_COST) return false;
  const key = cellKey(kind, gx, gy, gz, rot);
  if (S.build.pieces.has(`${gx},${gy},${gz}`)) return false;
  const baseY = gy * CELL;
  const terrainH = heightAt(gx * CELL, gz * CELL);
  if (baseY - terrainH < 5.5) return true;
  const neighbors = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0, -1, -1], [0, 1, -1], [1, 0, -1], [-1, 0, -1],
  ];
  for (const [dx, dz, dy = 0] of neighbors) {
    if (S.build.pieces.has(`${gx + dx},${gy + dy},${gz + dz}`)) return true;
  }
  return false;
}

export function placePiece(player) {
  if (!S.build.mode || !ghost?.visible || !ghost.userData.target) return false;
  const t = ghost.userData.target;
  if (!t.valid) { sfx.buildDeny(); return false; }
  spawnPiece(S.build.mode, t.gx, t.gy, t.gz, t.rot, S.build.mat, true);
  player.mats[S.build.mat] -= CFG.BUILD_COST;
  S.emit('mats');
  sfx.buildPlace();
  return true;
}

export function spawnPiece(kind, gx, gy, gz, rot, matType, byPlayer, hpFrac = 1) {
  const cx = gx * CELL, cz = gz * CELL;
  const baseY = gy * CELL;
  const bm = BUILD_MATS[matType];
  const mesh = new THREE.Mesh(geoFor(kind, 0), matByType[matType]);
  mesh.position.set(cx, baseY, cz);
  mesh.rotation.y = rotForKind(kind, rot);
  mesh.castShadow = mesh.receiveShadow = true;
  sceneRef.add(mesh);

  const horiz = kind !== 'wall';
  let min, max;
  if (kind === 'floor') {
    min = new THREE.Vector3(cx - 2, baseY, cz - 2); max = new THREE.Vector3(cx + 2, baseY + 0.34, cz + 2);
  } else if (kind === 'cone') {
    min = new THREE.Vector3(cx - 2, baseY, cz - 2); max = new THREE.Vector3(cx + 2, baseY + 2.7, cz + 2);
  } else if (horiz) {
    min = new THREE.Vector3(cx - 2.1, baseY, cz - 2.1); max = new THREE.Vector3(cx + 2.1, baseY + 4.2, cz + 2.1);
  } else {
    if (rot % 2 === 0) {
      min = new THREE.Vector3(cx - 2, baseY, cz - 0.25); max = new THREE.Vector3(cx + 2, baseY + 4, cz + 0.25);
    } else {
      min = new THREE.Vector3(cx - 0.25, baseY, cz - 2); max = new THREE.Vector3(cx + 0.25, baseY + 4, cz + 2);
    }
  }

  const piece = {
    type: 'build', gkind: kind, variant: 0,
    cx, cz, baseY, gx, gy, gz, rot, matType,
    mesh, hp: bm.hp * hpFrac, maxHp: bm.hp,
    pos: new THREE.Vector3(cx, baseY + (kind === 'floor' ? 0.17 : 2), cz),
    aabb: { min, max },
    dead: false,
    buildT: 0,
  };
  mesh.scale.y = 0.12;
  S.build.pieces.set(`${gx},${gy},${gz}`, piece);
  colliders.add(piece, cx, cz, 2.9);
  return piece;
}

export function damagePiece(piece, amt, hitPos) {
  if (piece.dead) return;
  piece.hp -= amt;
  import('./fx.js').then(fx => fx.impact(hitPos || piece.pos, BUILD_MATS[piece.matType].color));
  if (piece.hp <= 0) {
    destroyPiece(piece);
  } else {
    const ratio = piece.hp / piece.maxHp;
    if (ratio < 0.55 && !piece.tinted) {
      piece.tinted = true;
      piece.mesh.material = piece.mesh.material.clone();
      piece.mesh.material.color.multiplyScalar(0.72);
    }
  }
}

export function destroyPiece(piece, silentDist = null) {
  if (piece.dead) return;
  piece.dead = true;
  sceneRef.remove(piece.mesh);
  colliders.remove(piece);
  S.build.pieces.delete(`${piece.gx},${piece.gy},${piece.gz}`);
  import('./fx.js').then(fx => fx.debris(piece.pos, BUILD_MATS[piece.matType].color));
  import('./audio.js').then(a => a.sfx.destroy(silentDist ?? piece.pos.distanceTo(S.camera.position)));
}

export function editAimedPiece(player) {
  const origin = player.headPos();
  const dir = player.lookDir();
  import('./world.js').then(wo => {
    const hit = wo.rayCast(origin, dir, 6.5, { bots: false, player: false });
    if (!hit || hit.kind !== 'build') return;
    const p = hit.obj;
    if (p.gkind === 'wall') {
      p.variant = (p.variant + 1) % 3;
      p.mesh.geometry = geoFor('wall', p.variant);
    } else if (p.gkind === 'ramp') {
      p.rot = (p.rot + 1) % 4;
      p.mesh.rotation.y = rotForKind('ramp', p.rot);
    } else {
      return;
    }
    sfx.buildPlace();
  });
}

export function updateBuilding(dt) {
  for (const piece of S.build.pieces.values()) {
    if (piece.buildT < 1) {
      piece.buildT = Math.min(1, piece.buildT + dt * 3);
      piece.mesh.scale.y = 0.12 + 0.88 * piece.buildT;
    }
  }
}
