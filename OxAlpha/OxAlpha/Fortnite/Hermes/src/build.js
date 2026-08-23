// ISLEBREAK build system: walls / floors / ramps / cones on a 4m grid.
// Snap preview, turbo placement, HP + damage states, destruction, editing.
// Ramps are walked via stacked step colliders (no OBB physics needed).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export const GRID = 4;
export const WALL_H = 3.4;
export const BUILD_COST = 10;
export const TIER_HP = { wood: 150, brick: 280, metal: 420 };
export const TIER_COLORS = {
  wood: [0xa87848, 0x8a5f38, 0x6e4a2c],
  brick: [0xb4b0a6, 0x9a968c, 0x807c74],
  metal: [0xb8c2cc, 0x99a4ae, 0x7d8892],
};

const WALL_T = 0.28;

export class BuildSystem {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.pieces = new Map();      // key -> piece record
    this.group = new THREE.Group();
    scene.add(this.group);
    this.onPieceDestroyed = null; // cb(piece)
    // damage-state materials per tier
    this.mats = {};
    for (const tier of ['wood', 'brick', 'metal']) {
      this.mats[tier] = TIER_COLORS[tier].map(c => new THREE.MeshStandardMaterial({
        color: c, roughness: tier === 'metal' ? 0.5 : 0.85, metalness: tier === 'metal' ? 0.6 : 0,
      }));
    }
    this.previewMatOk = new THREE.MeshBasicMaterial({ color: 0x59ff9c, transparent: true, opacity: 0.34, depthWrite: false });
    this.previewMatBad = new THREE.MeshBasicMaterial({ color: 0xff5964, transparent: true, opacity: 0.3, depthWrite: false });
    this.preview = null;
    this.previewType = null;
    this.previewDir = 0;
  }

  static key(type, gx, gy, gz) { return `${type}:${gx},${gy},${gz}`; }
  // snap world pos -> grid cell indices
  static snap(x, z) {
    return { gx: Math.round(x / GRID), gz: Math.round(z / GRID) };
  }
  static cellToWorld(gx, gy, gz) {
    return [gx * GRID, gy * WALL_H, gz * GRID];
  }

  setPreview(type, gx, gy, gz, dir, ok, islandH) {
    const key = `${type}:${gx},${gy},${gz}`;
    if (!this.preview || this.previewKey !== key || this.previewDir !== dir || this.previewOk !== ok) {
      if (this.preview) { this.scene.remove(this.preview); this.preview = null; }
      this.previewKey = key;
      this.previewDir = dir;
      this.previewOk = ok;
      this.previewType = type;
      const geo = this.pieceGeometry(type, dir);
      this.preview = new THREE.Mesh(geo, ok ? this.previewMatOk : this.previewMatBad);
      this.scene.add(this.preview);
    }
    const [wx, wy, wz] = BuildSystem.cellToWorld(gx, gy, gz);
    this.preview.position.set(wx, wy, wz);
    return this.preview;
  }

  // Transparent box outline for the preview of each piece type.
  pieceGeometry(type) {
    const G = GRID, H = WALL_H, t = 0.28;
    if (type === 'wall') {
      const g = new THREE.BoxGeometry(G, H, t);
      g.translate(0, H / 2, 0);
      return g;
    }
    if (type === 'ramp') {
      // slanted slab from low edge to high edge
      const len = Math.hypot(G, H);
      const g = new THREE.BoxGeometry(G, 0.24, len);
      g.rotateX(-Math.atan2(H, G));
      g.translate(0, H / 2, 0);
      return g;
    }
    if (type === 'cone') {
      const g = new THREE.ConeGeometry(G * 0.7, H * 0.75, 4);
      g.rotateY(Math.PI / 4);
      g.translate(0, H * 0.375, 0);
      return g;
    }
    // floor (default)
    const g = new THREE.BoxGeometry(G, 0.22, G);
    g.translate(0, -0.11, 0);
    return g;
  }
  clearPreview() {
    if (this.preview) { this.scene.remove(this.preview); this.preview = null; this.previewKey = null; }
  }

  occupied(type, gx, gy, gz) { return this.pieces.has(BuildSystem.key(type, gx, gy, gz)); }

  // Terrain intersection check: reject pieces buried below ground
  buried(islandH, type, gx, gy, gz) {
    const [wx, wy, wz] = BuildSystem.cellToWorld(gx, gy, gz);
    const h = islandH(wx, wz);
    if (type === 'floor') return wy < h - 1.2;
    if (type === 'wall') return wy + WALL_H < h - 0.4 || wy < h - WALL_H - 1.0;
    if (type === 'ramp') return wy < h - 1.2 && wy + WALL_H < h;
    return wy < h - 2.5;
  }

  place(type, tier, gx, gy, gz, dir, owner, opts = {}) {
    const key = BuildSystem.key(type, gx, gy, gz);
    if (this.pieces.has(key)) return null;
    const [wx, wy, wz] = BuildSystem.cellToWorld(gx, gy, gz);
    const hpMax = opts.hp || TIER_HP[tier];
    const piece = {
      key, type, tier, gx, gy, gz, dir: dir || 0,
      hp: opts.startHp ?? hpMax, hpMax,
      owner, editState: opts.editState || null,
      builtAt: performance.now(),
      fresh: true,
    };
    const { geoParts, colliders } = this.layoutFor(piece);
    const merged = mergeGeometries(geoParts.map(g => g.clone()), false);
    const mesh = new THREE.Mesh(merged, this.matFor(piece));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(wx, wy, wz);
    this.group.add(mesh);
    piece.mesh = mesh;
    // colliders registered in physics.builds keyed by sub-key
    piece.colliderKeys = [];
    let i = 0;
    for (const c of colliders) {
      const ck = `${key}#${i++}`;
      c.ref = { build: piece, part: true, harvest: tier, kind: 'build' };
      c.key = ck;
      this.physics.setBuild(ck, c);
      piece.colliderKeys.push(ck);
    }
    this.pieces.set(key, piece);
    return piece;
  }

  matFor(piece) {
    const frac = piece.hp / piece.hpMax;
    const states = this.mats[piece.tier];
    if (frac > 0.62) return states[0];
    if (frac > 0.28) return states[1];
    return states[2];
  }

  // geometry parts (local space) + world-space colliders for a piece
  layoutFor(piece) {
    const G = GRID, H = WALL_H, t = WALL_T;
    const parts = [];   // [{w,h,d,x,y,z,ry?}] local to piece origin
    const cols = [];    // world AABBs
    const [wx0, wy0, wz0] = BuildSystem.cellToWorld(piece.gx, piece.gy, piece.gz);
    const pushBox = (x, y, z, w, h, d, ry = 0) => {
      parts.push({ w, h, d, x, y, z, ry });
      // conservative world AABB
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const ww = w * c + d * s, dd = w * s + d * c;
      cols.push({ min: [wx0 + x - ww / 2, wy0 + y - h / 2, wz0 + z - dd / 2], max: [wx0 + x + ww / 2, wy0 + y + h / 2, wz0 + z + dd / 2], key: '' });
    };

    if (piece.type === 'wall') {
      const ry = piece.dir * Math.PI / 2;
      if (piece.editState === 'door') {
        const dw = 1.7, dh = 2.6;
        const sideW = (G - dw) / 2;
        pushBox(-(dw / 2 + sideW / 2), H / 2, 0, sideW, H, t, ry);
        pushBox(dw / 2 + sideW / 2, H / 2, 0, sideW, H, t, ry);
        pushBox(0, dh + (H - dh) / 2, 0, dw, H - dh, t, ry);
      } else if (piece.editState === 'window') {
        const ww = 1.8, wh = 1.1, sill = 1.0;
        const sideW = (G - ww) / 2;
        pushBox(-(ww / 2 + sideW / 2), H / 2, 0, sideW, H, t, ry);
        pushBox(ww / 2 + sideW / 2, H / 2, 0, sideW, H, t, ry);
        pushBox(0, sill / 2, 0, ww, sill, t, ry);
        pushBox(0, sill + wh + (H - sill - wh) / 2, 0, ww, H - sill - wh, t, ry);
      } else if (piece.editState === 'half') {
        pushBox(0, H / 4, 0, G, H / 2, t, ry);
      } else {
        pushBox(0, H / 2, 0, G, H, t, ry);
      }
    } else if (piece.type === 'floor') {
      if (piece.editState === 'corner') {
        pushBox(-G / 4, -0.11, -G / 4, G / 2, 0.22, G / 2);
        pushBox(G / 4, -0.11, G / 4, G / 2, 0.22, G / 2);
      } else {
        pushBox(0, -0.11, 0, G, 0.22, G);
      }
    } else if (piece.type === 'ramp') {
      // stacked steps along local -Z..+Z depending on dir; rise H over G
      const steps = 6;
      const stepD = G / steps, stepH = H / steps;
      const yaw = piece.dir * Math.PI / 2;
      for (let i = 0; i < steps; i++) {
        const lz = -G / 2 + stepD * (i + 0.5);
        const ly = stepH * (i + 0.5);
        parts.push({ w: G, h: stepH, d: stepD + 0.05, x: 0, y: ly, z: lz, ry: yaw });
      }
      // colliders as stepped world boxes
      for (let i = 0; i < steps; i++) {
        const lz = -G / 2 + stepD * (i + 0.5);
        const ly = stepH * (i + 0.5);
        const rx = Math.sin(yaw) * lz, rz = Math.cos(yaw) * lz;
        const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
        const ww = G * c + (stepD + 0.05) * s, dd = G * s + (stepD + 0.05) * c;
        const bx = wx0 + rx, bz = wz0 + rz;
        cols.push({
          min: [bx - ww / 2, wy0 + ly - stepH / 2, bz - dd / 2],
          max: [bx + ww / 2, wy0 + ly + stepH / 2, bz + dd / 2],
          key: '',
        });
      }
    } else if (piece.type === 'cone') {
      // pyramid-ish: two stacked shrinking boxes
      pushBox(0, 0.55, 0, G * 0.92, 1.1, G * 0.92);
      pushBox(0, 1.55, 0, G * 0.5, 0.9, G * 0.5);
    }
    return { geoParts: parts.map(p => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      if (p.ry) g.rotateY(p.ry);
      g.translate(p.x, p.y, p.z);
      return g;
    }), colliders: cols };
  }

  refreshMesh(piece) {
    const [wx, wy, wz] = BuildSystem.cellToWorld(piece.gx, piece.gy, piece.gz);
    const { geoParts, colliders } = this.layoutFor(piece);
    // replace colliders
    if (piece.colliderKeys) for (const ck of piece.colliderKeys) this.physics.removeBuild(ck);
    piece.colliderKeys = [];
    let i = 0;
    for (const c of colliders) {
      const ck = `${piece.key}#${i++}`;
      c.ref = { build: piece, part: true, harvest: piece.tier, kind: 'build' };
      c.key = ck;
      this.physics.setBuild(ck, c);
      piece.colliderKeys.push(ck);
    }
    const merged = mergeGeometries(geoParts, false);
    piece.mesh.geometry.dispose();
    piece.mesh.geometry = merged;
    piece.mesh.material = this.matFor(piece);
  }

  damage(pieceOrKey, dmg, source) {
    const piece = typeof pieceOrKey === 'string' ? this.pieces.get(pieceOrKey) : pieceOrKey;
    if (!piece) return false;
    piece.hp -= dmg;
    piece.fresh = false;
    if (piece.hp <= 0) {
      this.destroy(piece, source);
      return true;
    }
    piece.mesh.material = this.matFor(piece);
    return false;
  }

  destroy(piece, source) {
    this.pieces.delete(piece.key);
    if (piece.colliderKeys) for (const ck of piece.colliderKeys) this.physics.removeBuild(ck);
    this.group.remove(piece.mesh);
    piece.mesh.geometry.dispose();
    if (this.onPieceDestroyed) this.onPieceDestroyed(piece, source);
  }

  // Editing: cycle wall states door -> window -> half -> solid
  editWall(piece) {
    if (piece.type !== 'wall') return false;
    const cycle = [null, 'door', 'window', 'half'];
    const idx = cycle.indexOf(piece.editState);
    piece.editState = cycle[(idx + 1) % cycle.length];
    this.refreshMesh(piece);
    return true;
  }

  // ground support query used by characters: highest walkable surface from builds at (x,z)
  surfaceAt(x, z, maxY) {
    let best = -Infinity;
    for (const piece of this.pieces.values()) {
      const [wx, wy, wz] = BuildSystem.cellToWorld(piece.gx, piece.gy, piece.gz);
      if (Math.abs(x - wx) > GRID / 2 + 0.3 || Math.abs(z - wz) > GRID / 2 + 0.3) continue;
      if (wy > maxY + 0.7) continue;
      if (piece.type === 'floor') {
        if (wy > best) best = wy;
      } else if (piece.type === 'ramp') {
        // local progress along dir
        const yaw = piece.dir * Math.PI / 2;
        const dx = x - wx, dz = z - wz;
        const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        if (Math.abs(lx) <= GRID / 2 && Math.abs(lz) <= GRID / 2) {
          const prog = (lz + GRID / 2) / GRID; // 0 low edge .. 1 high edge
          const h = wy + prog * WALL_H;
          if (h > best && h <= maxY + 1.1) best = h;
        }
      } else if (piece.type === 'cone') {
        if (wy + 1.1 > best) best = wy + 1.1;
      } else if (piece.type === 'wall') {
        // narrow top walkable (edge stand)
        if (wy + WALL_H > best && wy + WALL_H <= maxY + 0.75) best = wy + WALL_H;
      }
    }
    return best;
  }

  clear() {
    for (const p of [...this.pieces.values()]) this.destroy(p, null);
    this.clearPreview();
  }
}
