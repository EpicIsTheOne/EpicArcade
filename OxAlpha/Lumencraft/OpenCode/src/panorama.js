// Panorama: live rotating title-screen backdrop — a small generated world the
// camera slowly spins over, streamed/meshed with a tiny budget so the menu
// stays at full frame rate while chunks pop in like MC's panorama.
import * as THREE from 'three';
import { World } from './world.js';
import { buildChunkGeometry } from './mesher.js';
import { createTerrainMaterial, createWaterMaterial, globalUniforms } from './materials.js';
import { Generator } from './worldgen.js';
import { SEA } from './config.js';

// probe candidate seeds for gentle plains/forest near origin — first match wins
const SEED_CANDIDATES = ['aurora vista', 'emberwood glade', 'sunfall isles', 'lumencraft', 'greenhollow', 'highmeadow', 'willowbrook', 'mossglen'];

function pickSeed() {
  for (const seed of SEED_CANDIDATES) {
    try {
      const gen = new Generator(seed);
      let good = 0;
      for (const [x, z] of [[8, 8], [0, 0], [16, 16], [24, 8], [8, 24]]) {
        const info = gen.columnInfo(x, z);
        // 2=Plains, 3=Forest — dry, walkable, tree-dotted terrain
        if (info && (info.biome === 2 || info.biome === 3) && info.h > SEA + 4 && info.h < SEA + 22) good++;
      }
      if (good >= 4) return seed;
    } catch {}
  }
  return SEED_CANDIDATES[0];
}

export class Panorama {
  constructor(scene, atlasTexture) {
    this.scene = scene;
    this.angle = Math.random() * Math.PI * 2;
    this.center = new THREE.Vector3(8.5, 84, 8.5);
    this.camY = null;
    this.meshes = new Map();
    this.terrainMat = createTerrainMaterial(atlasTexture);
    this.waterMat = createWaterMaterial(atlasTexture);
    this.radius = 6;
    this.world = new World(pickSeed());
    this.world.requestArea(0, 0, this.radius);
    window.__pano = this; // QA/debug handle
  }

  _groundReady() {
    if (this.camY !== null) return true;
    if (!this.world.getChunk(0, 0)) return false;
    const sy = this.world.surfaceY(8, 8);
    if (!sy || sy < 4) return false;
    this.camY = sy + 13;
    this.center.set(8.5, this.camY, 8.5);
    return true;
  }

  update(dt, camera) {
    const w = this.world;
    w.pumpRequests();
    w.processLight(30000);

    let built = 0;
    const t0 = performance.now();
    for (const k of [...w.dirtyChunks]) {
      if (built >= 10 || performance.now() - t0 > 14) break;
      const c = w.chunks.get(k);
      if (!c) { w.dirtyChunks.delete(k); continue; }
      if (!w.getChunk(c.cx + 1, c.cz) || !w.getChunk(c.cx - 1, c.cz) ||
          !w.getChunk(c.cx, c.cz + 1) || !w.getChunk(c.cx, c.cz - 1)) continue;

      const old = this.meshes.get(k);
      if (old) {
        for (const m of [old.opaque, old.water]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
        this.meshes.delete(k);
      }
      const geo = buildChunkGeometry(w, c);
      const entry = { opaque: null, water: null };
      if (geo.opaque) {
        const m = new THREE.Mesh(geo.opaque, this.terrainMat);
        entry.opaque = m;
        this.scene.add(m);
      }
      if (geo.water) {
        const m = new THREE.Mesh(geo.water, this.waterMat);
        m.renderOrder = 2;
        m.userData.noShadow = true;
        entry.water = m;
        this.scene.add(m);
      }
      this.meshes.set(k, entry);
      w.dirtyChunks.delete(k);
      c.dirty = false;
      built++;
    }

    this._groundReady();
    this.angle += dt * 0.021; // ~5 min per revolution
    camera.position.copy(this.center);
    camera.rotation.set(-0.2, this.angle, 0, 'YXZ');

    return this.camY !== null && w.pendingCount() === 0 && w.dirtyChunks.size === 0;
  }

  dispose() {
    for (const e of this.meshes.values()) {
      for (const m of [e.opaque, e.water]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    }
    this.meshes.clear();
    this.terrainMat.dispose();
    this.waterMat.dispose();
    this.world.destroy();
  }
}
