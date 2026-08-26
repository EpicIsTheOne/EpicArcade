// Entities: item drops (magnet pickup) + mobs with AI (wander/chase/flee),
// spawning manager, combat helpers.
import * as THREE from 'three';
import { B, BLOCKS, isSolid, isLiquid } from './blocks.js';
import { ITEMS } from './items.js';
import { getItemIcon } from './icons.js';
import { uvRect } from './atlas.js';
import { globalUniforms } from './materials.js';

// ---------- drop meshes ----------
function blockDropGeometry(bd) {
  const g = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  const sideT = bd.tileSide ?? bd.tile;
  const tiles = [sideT, sideT, bd.tileTop ?? bd.tile ?? sideT, bd.tileBottom ?? bd.tile ?? sideT,
    bd.tileFront ?? sideT, sideT];
  const uvAttr = g.attributes.uv;
  const pattern = [[0, 1], [1, 1], [0, 0], [1, 0]];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = uvRect(tiles[f]);
    for (let i = 0; i < 4; i++) {
      const [pu, pv] = pattern[i];
      uvAttr.setXY(f * 4 + i, u0 + (u1 - u0) * pu, v0 + (v1 - v0) * pv);
    }
  }
  return g;
}

const iconTexCache = new Map();
function iconTexture(id) {
  if (!iconTexCache.has(id)) {
    const t = new THREE.CanvasTexture(getItemIcon(id));
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    iconTexCache.set(id, t);
  }
  return iconTexCache.get(id);
}

/** build the visual for a ground item: block-textured cube or icon sprite */
export function createDropMesh(game, id) {
  const isBlock = typeof id === 'number' && BLOCKS[id];
  let mesh;
  if (isBlock) {
    const mat = new THREE.MeshBasicMaterial({ map: game.atlasTexture });
    mesh = new THREE.Mesh(blockDropGeometry(BLOCKS[id]), mat);
  } else {
    const mat = new THREE.MeshBasicMaterial({ map: iconTexture(id), transparent: true, alphaTest: 0.12, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
  }
  mesh.frustumCulled = true;
  return mesh;
}

class Drop {
  constructor(game, x, y, z, id, count) {
    this.game = game;
    this.id = id;
    this.count = count;
    this.did = null;              // shared-loot id once synced
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 2.2, 3.4 + Math.random() * 1.5, (Math.random() - 0.5) * 2.2);
    this.age = 0;
    this.dead = false;

    this.mesh = createDropMesh(game, id);
    game.graphics.scene.add(this.mesh);
  }

  update(dt) {
    this.age += dt;
    if (this.age > 300) { this.destroy(); return; }

    const p = this.game.player;
    const dx = p.pos.x - this.pos.x, dy = (p.pos.y + 0.9) - this.pos.y, dz = p.pos.z - this.pos.z;
    const hdSq = dx * dx + dz * dz;

    // magnet + pickup (generous vertical window so items in shallow holes vacuum up)
    if (this.age > 0.45 && !p.dead) {
      if (hdSq < 7.0 && Math.abs(dy) < 2.8) {
        const d = Math.sqrt(hdSq) || 1;
        this.vel.x += (dx / d) * 30 * dt;
        this.vel.y += (dy / d) * 24 * dt;
        this.vel.z += (dz / d) * 30 * dt;
      }
      if (hdSq < 0.85 && Math.abs(dy) < 2.0) {
        const leftover = this.game.giveItem(this.id, this.count, this.dur);
        if (leftover === 0) {
          if (this.game.audio) this.game.audio.pop();
          this.destroy();
          return;
        }
        this.count = leftover;
      }
    }

    // physics
    this.vel.y -= 18 * dt;
    const nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt, nz = this.pos.z + this.vel.z * dt;
    const solidAt = (x, y, z) => isSolid(this.game.world.getBlockRaw(Math.floor(x), Math.floor(y), Math.floor(z)));
    if (!solidAt(nx, this.pos.y, nz)) this.pos.x = nx; else this.vel.x *= -0.3;
    if (!solidAt(nx, ny, nz)) this.pos.y = ny;
    else { this.pos.y = Math.floor(ny) + (this.vel.y < 0 ? 1.001 : 0); this.vel.y = this.vel.y > 0 ? 0 : 0; this.vel.x *= 0.7; this.vel.z *= 0.7; }
    if (!solidAt(nx, ny, nz)) this.pos.z = nz; else this.vel.z *= -0.3;
    if (isLiquid(this.game.world.getBlockRaw(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z)))) {
      this.vel.y += 30 * dt; // float up
    }
    this.vel.x *= Math.pow(0.02, dt); this.vel.z *= Math.pow(0.02, dt);

    // visuals
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += 0.22 + Math.sin(this.age * 2.4) * 0.05;
    this.mesh.rotation.y += dt * 1.8;

    // merge nearby identical
    for (const other of this.game.entities.drops) {
      if (other === this || other.dead) continue;
      if (other.id === this.id && this.count + other.count <= 64 &&
          other.pos.distanceToSquared(this.pos) < 1.2) {
        this.count += other.count;
        other.destroy();
      }
    }
  }

  destroy() {
    this.dead = true;
    this.game.graphics.scene.remove(this.mesh);
    if (this.mesh.material.map && typeof this.id !== 'number') { /* shared icon tex — keep */ }
  }
}

// ---------- mob models ----------
function partGeo(w, h, d, colorHex) {
  const g = new THREE.BoxGeometry(w, h, d);
  const shades = [0.84, 0.74, 1.0, 0.55, 0.92, 0.70];
  const c = new THREE.Color(colorHex);
  const cols = [];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) cols.push(c.r * shades[f], c.g * shades[f], c.b * shades[f]);
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

function box(parent, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(partGeo(w, h, d, color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export const MOB_TYPES = {  gloom: {
    label: 'Gloom', hp: 12, speed: 2.75, w: 0.62, h: 1.85, hostile: true, dmg: 3, aggro: 22,
    burnsInSun: true, drops: [['coal', 1, 0.35], ['spark_dust', 1, 0.14]],
    build(g, P) {
      P.legL = box(g, 0.24, 0.72, 0.24, 0x2c3a52, -0.14, 0.36, 0);
      P.legR = box(g, 0.24, 0.72, 0.24, 0x2c3a52, 0.14, 0.36, 0);
      P.body = box(g, 0.56, 0.66, 0.32, 0x2f6b58, 0, 1.06, 0);
      P.armL = box(g, 0.2, 0.62, 0.2, 0x4d7a38, -0.38, 1.28, -0.16);
      P.armR = box(g, 0.2, 0.62, 0.2, 0x4d7a38, 0.38, 1.28, -0.16);
      P.armL.rotation.x = -1.35; P.armR.rotation.x = -1.35;
      P.head = box(g, 0.46, 0.46, 0.46, 0x55803c, 0, 1.62, 0);
      box(P.head, 0.08, 0.08, 0.02, 0x101010, -0.11, 0.04, 0.235);
      box(P.head, 0.08, 0.08, 0.02, 0x101010, 0.11, 0.04, 0.235);
    },
  },
  skitter: {
    label: 'Skitter', hp: 7, speed: 3.9, w: 0.95, h: 0.62, hostile: true, dmg: 2, aggro: 15,
    burnsInSun: true, drops: [['spark_dust', 1, 0.5]],
    build(g, P) {
      P.body = box(g, 0.86, 0.4, 1.06, 0x23202a, 0, 0.34, 0);
      P.head = box(g, 0.44, 0.36, 0.4, 0x2c2834, 0, 0.38, -0.68);
      box(P.head, 0.07, 0.07, 0.02, 0xff3030, -0.1, 0.05, -0.205);
      box(P.head, 0.07, 0.07, 0.02, 0xff3030, 0.1, 0.05, -0.205);
      P.legs = [];
      for (const [lx, lz] of [[-0.48, -0.4], [0.48, -0.4], [-0.48, 0.4], [0.48, 0.4]]) {
        const leg = box(g, 0.1, 0.34, 0.1, 0x171420, lx, 0.17, lz);
        P.legs.push(leg);
      }
    },
  },
  sheep: {
    label: 'Sheep', hp: 8, speed: 1.65, w: 0.85, h: 1.25, hostile: false,
    drops: [['wool', 2, 1], ['mutton_raw', 1, 0.85]],
    build(g, P) {
      P.legL = box(g, 0.18, 0.5, 0.18, 0xd8ccd0, -0.2, 0.25, -0.24);
      P.legR = box(g, 0.18, 0.5, 0.18, 0xd8ccd0, 0.2, 0.25, -0.24);
      P.legL2 = box(g, 0.18, 0.5, 0.18, 0xc8bcbe, -0.2, 0.25, 0.24);
      P.legR2 = box(g, 0.18, 0.5, 0.18, 0xc8bcbe, 0.2, 0.25, 0.24);
      P.body = box(g, 0.78, 0.66, 1.1, 0xeceff2, 0, 0.82, 0);
      P.head = box(g, 0.4, 0.42, 0.38, 0xe8c8be, 0, 1.16, -0.66);
      box(P.head, 0.07, 0.07, 0.02, 0x14100e, -0.1, 0.03, 0.195);
      box(P.head, 0.07, 0.07, 0.02, 0x14100e, 0.1, 0.03, 0.195);
      P.legs = [P.legL, P.legR, P.legL2, P.legR2];
    },
  },
  pig: {
    label: 'Pig', hp: 10, speed: 1.6, w: 0.82, h: 0.95, hostile: false,
    drops: [['pork_raw', 2, 1]],
    build(g, P) {
      P.legL = box(g, 0.2, 0.34, 0.2, 0xd88a90, -0.22, 0.17, -0.26);
      P.legR = box(g, 0.2, 0.34, 0.2, 0xd88a90, 0.22, 0.17, -0.26);
      P.legL2 = box(g, 0.2, 0.34, 0.2, 0xc87a80, -0.22, 0.17, 0.26);
      P.legR2 = box(g, 0.2, 0.34, 0.2, 0xc87a80, 0.22, 0.17, 0.26);
      P.body = box(g, 0.74, 0.56, 1.06, 0xefa0a8, 0, 0.62, 0);
      P.head = box(g, 0.52, 0.5, 0.42, 0xf0aab0, 0, 0.76, -0.68);
      box(P.head, 0.2, 0.14, 0.06, 0xd8848c, 0, -0.04, 0.23);
      box(P.head, 0.06, 0.07, 0.02, 0x181010, -0.13, 0.1, 0.215);
      box(P.head, 0.06, 0.07, 0.02, 0x181010, 0.13, 0.1, 0.215);
      P.legs = [P.legL, P.legR, P.legL2, P.legR2];
    },
  },
  chicken: {
    label: 'Cluck', hp: 4, speed: 1.5, w: 0.45, h: 0.8, hostile: false,
    drops: [['chicken_raw', 1, 1]],
    build(g, P) {
      P.legL = box(g, 0.07, 0.28, 0.07, 0xd8a83a, -0.1, 0.14, 0);
      P.legR = box(g, 0.07, 0.28, 0.07, 0xd8a83a, 0.1, 0.14, 0);
      P.body = box(g, 0.4, 0.42, 0.54, 0xf2f2ee, 0, 0.5, 0);
      P.head = box(g, 0.26, 0.34, 0.24, 0xf6f6f2, 0, 0.86, -0.2);
      box(P.head, 0.12, 0.08, 0.1, 0xe8a83a, 0, -0.03, 0.16);
      box(P.head, 0.08, 0.1, 0.04, 0xc83a3a, 0, -0.14, 0.14);
      box(P.head, 0.05, 0.05, 0.02, 0x14100e, -0.07, 0.06, 0.125);
      box(P.head, 0.05, 0.05, 0.02, 0x14100e, 0.07, 0.06, 0.125);
      P.wingL = box(g, 0.06, 0.3, 0.36, 0xe4e4de, -0.23, 0.54, 0);
      P.wingR = box(g, 0.06, 0.3, 0.36, 0xe4e4de, 0.23, 0.54, 0);
      P.legs = [P.legL, P.legR];
    },
  },
};

// ---------- shared model/drop helpers (used by Mob and the net mirror) ----------
let _nextEid = 1;

/** claim a unique mob id; keeps future auto-ids above it (host migration) */
export function reserveMobEid(eid) {
  if (eid >= _nextEid) _nextEid = eid + 1;
  return eid;
}

/** build the blocky model for a mob type: {group, P, mat} */
export function buildMobModel(typeName) {
  const type = MOB_TYPES[typeName];
  const group = new THREE.Group();
  const P = {};
  type.build(group, P);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  group.traverse((o) => { if (o.isMesh) o.material = mat; });
  return { group, P, mat };
}

/** roll a mob's loot table → spawn drops via game.spawnDrop */
export function rollDrops(game, typeName, x, y, z) {
  const type = MOB_TYPES[typeName];
  if (!type) return;
  for (const [id, count, chance] of type.drops) {
    if (Math.random() < chance) game.spawnDrop(x, y + 0.5, z, id, count);
  }
}

export class Mob {
  constructor(game, typeName, x, y, z, eid) {
    this.game = game;
    this.type = MOB_TYPES[typeName];
    this.typeName = typeName;
    this.eid = eid == null ? _nextEid++ : reserveMobEid(eid);
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.hp = this.type.hp;
    this.onGround = false;
    this.state = 'idle';
    this.stateT = Math.random() * 2;
    this.moveYaw = Math.random() * Math.PI * 2;
    this.walkPhase = 0;
    this.hurtT = 0;
    this.attackCd = 0;
    this.burnAcc = 0;
    this.fleeT = 0;
    this.groanT = 3 + Math.random() * 8;
    this.lightT = 0;
    this.lightMul = 1;
    this.dying = false;
    this.deathT = 0;
    this.stuckT = 0;
    this.skipDrops = false;      // set when the killer will drop loot on their client
    this.lastX = x; this.lastZ = z;

    const model = buildMobModel(typeName);
    this.group = model.group;
    this.P = model.P;
    this.mat = model.mat;
    this.group.position.copy(this.pos);
    game.graphics.scene.add(this.group);
  }

  collides(px, py, pz) {
    const hw = this.type.w / 2;
    const world = this.game.world;
    const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw);
    const y0 = Math.floor(py), y1 = Math.floor(py + this.type.h);
    const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (y < 0 || y >= 128) continue;
      if (isSolid(world.getBlockRaw(x, y, z))) return true;
    }
    return false;
  }

  moveAxis(axis, amount) {
    if (!amount) return;
    const p = this.pos;
    const old = p.getComponent(axis);
    p.setComponent(axis, old + amount);
    if (!this.collides(p.x, p.y, p.z)) return;
    const step = amount / 20;
    p.setComponent(axis, old);
    for (let i = 0; i < 20; i++) {
      const next = p.getComponent(axis) + step;
      p.setComponent(axis, next);
      if (this.collides(p.x, p.y, p.z)) { p.setComponent(axis, next - step); break; }
    }
    if (axis === 1) { if (amount < 0) this.onGround = true; this.vel.y = 0; }
    else this.vel.setComponent(axis, 0);
  }

  hurt(dmg, knockDir) {
    if (this.dying) return;
    this.hp -= dmg;
    this.hurtT = 0.4;
    if (knockDir) {
      this.vel.x += knockDir.x * 6.5;
      this.vel.z += knockDir.z * 6.5;
      this.vel.y = Math.max(this.vel.y, 4.2);
    }
    if (!this.type.hostile) { this.fleeT = 3.5; }
    else if (this.state !== 'chase') { this.state = 'chase'; }
    if (this.game.audio) this.game.audio.mobHurt(this.typeName);
    if (this.hp <= 0) this.startDeath();
  }

  startDeath() {
    this.dying = true;
    this.deathT = 0;
    if (this.game.audio) this.game.audio.mobDie(this.typeName);
    this.game.onMobDeath?.(this);   // shared mobs: broadcast death + drop routing
  }

  finishDeath() {
    if (!this.skipDrops) {
      rollDrops(this.game, this.typeName, this.pos.x, this.pos.y, this.pos.z);
    }
    if (this.game.particles) {
      this.game.particles.burst(this.pos.x, this.pos.y + 0.6, this.pos.z, [0.7, 0.1, 0.1], 10, 2.2);
    }
    this.remove();
  }

  remove() {
    this.dead = true;
    this.game.graphics.scene.remove(this.group);
  }

  effectiveLight(x, y, z) {
    const sky = this.game.world.getSky(Math.floor(x), Math.floor(y), Math.floor(z)) / 15;
    const blk = this.game.world.getBlk(Math.floor(x), Math.floor(y), Math.floor(z)) / 15;
    const dayF = globalUniforms.uSkyLight.value;
    return Math.max(sky * dayF, blk * 0.95);
  }

  update(dt) {
    if (this.dying) {
      this.deathT += dt;
      this.group.rotation.z = Math.min(1, this.deathT / 0.3) * (Math.PI / 2);
      this.mat.color.setRGB(0.8, 0.3, 0.3);
      if (this.deathT > 0.55) this.finishDeath();
      return;
    }

    const p = this.game.player;
    const dxp = p.pos.x - this.pos.x, dzp = p.pos.z - this.pos.z;
    const distP = Math.hypot(dxp, dzp);

    // ---- AI ----
    let wantSpeed = 0;
    this.attackCd -= dt;

    if (this.fleeT > 0) {
      this.fleeT -= dt;
      this.moveYaw = Math.atan2(-dxp, -dzp);
      wantSpeed = this.type.speed * 1.55;
    } else if (this.type.hostile && !p.dead && distP < this.type.aggro) {
      this.state = 'chase';
      this.moveYaw = Math.atan2(dxp, dzp);
      wantSpeed = this.type.speed;
      if (distP < 1.45 && Math.abs(p.pos.y - this.pos.y) < 2 && this.attackCd <= 0) {
        this.attackCd = 1.15;
        p.damage(this.type.dmg, 'mob');
        const kb = new THREE.Vector3(dxp / (distP || 1), 0, dzp / (distP || 1));
        p.vel.x += kb.x * 6.5; p.vel.z += kb.z * 6.5; p.vel.y += 3.4;
        if (this.game.audio) this.game.audio.mobAttack(this.typeName);
      }
      this.groanT -= dt;
      if (this.groanT <= 0 && this.game.audio) {
        this.groanT = 4 + Math.random() * 7;
        this.game.audio.mobIdle(this.typeName);
      }
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        if (this.state === 'walk') { this.state = 'idle'; this.stateT = 1.2 + Math.random() * 2.6; }
        else { this.state = 'walk'; this.stateT = 1.6 + Math.random() * 3.4; this.moveYaw = Math.random() * Math.PI * 2; }
      }
      wantSpeed = this.state === 'walk' ? this.type.speed * 0.55 : 0;
    }

    // sun burning
    if (this.type.burnsInSun && globalUniforms.uSkyLight.value > 0.62) {
      const headSky = this.game.world.getSky(Math.floor(this.pos.x), Math.floor(this.pos.y + this.type.h * 0.8), Math.floor(this.pos.z));
      if (headSky >= 14) {
        this.burnAcc += dt;
        if (this.burnAcc > 1.1) {
          this.burnAcc = 0;
          this.hurt(2, null);
          if (this.game.particles) this.game.particles.burst(this.pos.x, this.pos.y + 1.2, this.pos.z, [1, 0.5, 0.1], 5, 1.2);
        }
      }
    }

    // ---- physics ----
    const inWater = isLiquid(this.game.world.getBlockRaw(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z)));
    if (inWater) {
      this.vel.y += 26 * dt;
      this.vel.y = Math.min(this.vel.y, 2.4);
      wantSpeed *= 0.6;
    } else {
      this.vel.y -= 22 * dt;
      this.vel.y = Math.max(this.vel.y, -42);
    }

    const tx = Math.sin(this.moveYaw) * wantSpeed;
    const tz = Math.cos(this.moveYaw) * wantSpeed;
    const acc = Math.min(1, (this.onGround ? 12 : 4) * dt);
    this.vel.x += (tx - this.vel.x) * acc;
    this.vel.z += (tz - this.vel.z) * acc;

    const wasGround = this.onGround;
    this.onGround = false;
    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(1, this.vel.y * dt);
    this.moveAxis(2, this.vel.z * dt);

    // jump when blocked
    const moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ);
    if (wantSpeed > 0.5 && wasGround && moved < wantSpeed * dt * 0.35) {
      this.stuckT += dt;
      if (this.stuckT > 0.25) { this.vel.y = 7.6; this.stuckT = 0; }
    } else this.stuckT = 0;
    this.lastX = this.pos.x; this.lastZ = this.pos.z;

    if (this.pos.y < -10) this.remove();

    // ---- visuals ----
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.22;
      const L = this.effectiveLight(this.pos.x, this.pos.y + 0.8, this.pos.z);
      this.lightMul = 0.16 + 0.9 * Math.pow(L, 1.1);
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    const flash = this.hurtT > 0 ? this.hurtT / 0.4 : 0;
    const t = this.lightMul;
    this.mat.color.setRGB(t * (1 + flash * 1.4), t * (1 - flash * 0.65), t * (1 - flash * 0.75));

    this.walkPhase += Math.hypot(this.vel.x, this.vel.z) * dt * 3.4;
    const swing = Math.sin(this.walkPhase) * 0.7 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 1.5);
    const legs = this.P.legs || (this.P.legL ? [this.P.legL, this.P.legR] : []);
    legs.forEach((l, i) => { l.rotation.x = swing * (i % 2 ? -1 : 1); });

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.moveYaw + Math.PI;
  }
}

// ---------- manager ----------
export class EntityManager {
  constructor(game) {
    this.game = game;
    this.mobs = [];
    this.drops = [];
    this.spawnT = 2.5;
    this.spawnEnabled = true;   // false while mirroring another peer's mobs
  }

  spawnDrop(x, y, z, id, count) {
    if (count <= 0) return;
    const d = new Drop(this.game, x, y, z, id, count);
    this.drops.push(d);
    return d;
  }

  seedPassives(px, pz, n) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 30;
      const x = Math.floor(px + Math.cos(ang) * r), z = Math.floor(pz + Math.sin(ang) * r);
      this._tryPassiveAt(x, z, true);
    }
  }

  _groundOk(x, z) {
    const w = this.game.world;
    const y = w.surfaceY(x, z);
    if (y <= 1) return null;
    const ground = w.getBlockRaw(x, y, z);
    if (!isSolid(ground)) return null;
    if (w.getBlockRaw(x, y + 1, z) !== B.AIR || w.getBlockRaw(x, y + 2, z) !== B.AIR) return null;
    return y + 1;
  }

  _tryHostileAt(x, z, force) {
    const w = this.game.world;
    const y = this._groundOk(x, z);
    if (y == null) return false;
    const sky = w.getSky(x, y, z);
    const blk = w.getBlk(x, y, z);
    const dayF = globalUniforms.uSkyLight.value;
    const eff = Math.max(blk, sky * (dayF > 0.5 ? 1 : 0.24));
    if (!force && eff >= 5.2) return false;
    const type = Math.random() < 0.72 ? 'gloom' : 'skitter';
    this.mobs.push(new Mob(this.game, type, x + 0.5, y, z + 0.5));
    return true;
  }

  _tryPassiveAt(x, z, force) {
    const w = this.game.world;
    const y = this._groundOk(x, z);
    if (y == null) return false;
    const ground = w.getBlockRaw(x, y - 1, z);
    if (!force && ground !== B.GRASS) return false;
    const r = Math.random();
    const type = r < 0.4 ? 'sheep' : r < 0.72 ? 'pig' : 'chicken';
    this.mobs.push(new Mob(this.game, type, x + 0.5, y, z + 0.5));
    return true;
  }

  trySpawn() {
    const p = this.game.player;
    const hostiles = this.mobs.filter(m => m.type.hostile).length;
    const passives = this.mobs.length - hostiles;
    const px = Math.floor(p.pos.x), pz = Math.floor(p.pos.z);

    if (hostiles < 12) {
      for (let a = 0; a < 6; a++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 24 + Math.random() * 22;
        if (this._tryHostileAt(Math.floor(px + Math.cos(ang) * r), Math.floor(pz + Math.sin(ang) * r))) break;
      }
    }
    if (passives < 9 && globalUniforms.uSkyLight.value > 0.55) {
      for (let a = 0; a < 4; a++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 16 + Math.random() * 26;
        this._tryPassiveAt(Math.floor(px + Math.cos(ang) * r), Math.floor(pz + Math.sin(ang) * r), false);
      }
    }
    // despawn far
    for (const m of this.mobs) {
      if (m.pos.distanceToSquared(p.pos) > 72 * 72) m.remove();
    }
  }

  /** ray-pick a mob; `extra` merges mirrored (remote) mobs into the search */
  pickMob(ox, oy, oz, dx, dy, dz, maxDist, extra) {
    let best = null, bestT = maxDist;
    const pool = extra && extra.length ? this.mobs.concat(extra) : this.mobs;
    for (const m of pool) {
      if (m.dead || m.dying) continue;
      const hw = m.type.w / 2 + 0.08;
      const min = [m.pos.x - hw, m.pos.y - 0.06, m.pos.z - hw];
      const max = [m.pos.x + hw, m.pos.y + m.type.h, m.pos.z + hw];
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let t0 = 0, t1 = bestT, ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-8) {
          if (o[i] < min[i] || o[i] > max[i]) { ok = false; break; }
        } else {
          let ta = (min[i] - o[i]) / d[i], tb = (max[i] - o[i]) / d[i];
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t0 < bestT) { bestT = t0; best = m; }
    }
    return best;
  }

  update(dt) {
    this.spawnT -= dt;
    if (this.spawnEnabled && this.spawnT <= 0) {
      this.spawnT = 2.4;
      this.trySpawn();
    }

    for (const d of this.drops) if (!d.dead) d.update(dt);
    this.drops = this.drops.filter(d => !d.dead);

    for (const m of this.mobs) if (!m.dead) m.update(dt);
    this.mobs = this.mobs.filter(m => !m.dead);
  }
}
