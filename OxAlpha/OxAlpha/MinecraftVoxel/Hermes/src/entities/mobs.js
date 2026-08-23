// Mobs: pigs, sheep (passive), zombies, skeletons (hostile). Box models,
// gravity+AABB physics, wander/chase AI, attacks, drops, light-based despawn.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { B } = __RQ('../shared/blocks.js');

const MOB_TYPES = {
  pig: { hp: 10, speed: 1.7, w: 0.42, h: 0.85, hostile: false, drops: [{ id: 272, min: 1, max: 2 }] },
  sheep: { hp: 8, speed: 1.6, w: 0.42, h: 1.0, hostile: false, drops: [{ id: 53, min: 1, max: 2 }] },
  zombie: { hp: 20, speed: 2.35, w: 0.32, h: 1.85, hostile: true, dmg: 3, range: 18, drops: [] },
  skeleton: { hp: 16, speed: 2.5, w: 0.3, h: 1.8, hostile: true, dmg: 2, range: 20, drops: [{ id: 266, min: 0, max: 2 }] },
};

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  return m;
}

class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = MOB_TYPES[type];
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = this.def.hp;
    this.onGround = false;
    this.wanderT = 0;
    this.attackCd = 0;
    this.hurtT = 0;
    this.dead = false;
    this.animT = 0;
    this.buildBody();
    this.group.position.set(x, y, z);
  }

  buildBody() {
    const g = new THREE.Group();
    const t = this.type;
    if (t === 'pig') {
      const body = box(0.9, 0.55, 0.62, 0xe89aa4); body.position.y = 0.45;
      const head = box(0.44, 0.44, 0.4, 0xf0aab2); head.position.set(0.62, 0.58, 0);
      const snout = box(0.14, 0.18, 0.22, 0xd88a92); snout.position.set(0.86, 0.52, 0);
      this.legs = [];
      for (const [lx, lz] of [[0.28, 0.18], [0.28, -0.18], [-0.28, 0.18], [-0.28, -0.18]]) {
        const leg = box(0.16, 0.3, 0.16, 0xd88a92);
        leg.position.set(lx, 0.15, lz);
        this.legs.push(leg); g.add(leg);
      }
      g.add(body, head, snout);
    } else if (t === 'sheep') {
      const body = box(0.85, 0.65, 0.66, 0xe8e8e8); body.position.y = 0.68;
      const head = box(0.36, 0.36, 0.34, 0xd8c8b8); head.position.set(0.56, 0.95, 0);
      this.legs = [];
      for (const [lx, lz] of [[0.25, 0.2], [0.25, -0.2], [-0.25, 0.2], [-0.25, -0.2]]) {
        const leg = box(0.15, 0.4, 0.15, 0xcabbab);
        leg.position.set(lx, 0.2, lz);
        this.legs.push(leg); g.add(leg);
      }
      g.add(body, head);
    } else if (t === 'zombie') {
      const body = box(0.52, 0.72, 0.3, 0x3f7a4f); body.position.y = 1.06;
      const head = box(0.46, 0.46, 0.46, 0x57a05f); head.position.y = 1.68;
      const armL = box(0.2, 0.66, 0.2, 0x3f7a4f); armL.position.set(0, 1.2, 0.36); armL.rotation.x = -1.35;
      const armR = box(0.2, 0.66, 0.2, 0x3f7a4f); armR.position.set(0, 1.2, -0.36); armR.rotation.x = -1.35;
      this.arms = [armL, armR];
      this.legs = [];
      for (const lz of [0.13, -0.13]) {
        const leg = box(0.2, 0.72, 0.2, 0x2f5068);
        leg.position.set(0, 0.36, lz);
        this.legs.push(leg); g.add(leg);
      }
      g.add(body, head, armL, armR);
    } else { // skeleton
      const body = box(0.44, 0.7, 0.24, 0xc8c8c8); body.position.y = 1.04;
      const head = box(0.44, 0.44, 0.44, 0xdedede); head.position.y = 1.64;
      const armL = box(0.14, 0.6, 0.14, 0xc8c8c8); armL.position.set(0, 1.2, 0.32); armL.rotation.x = -1.3;
      const armR = box(0.14, 0.6, 0.14, 0xc8c8c8); armR.position.set(0, 1.2, -0.32); armR.rotation.x = -1.3;
      this.arms = [armL, armR];
      this.legs = [];
      for (const lz of [0.11, -0.11]) {
        const leg = box(0.14, 0.7, 0.14, 0xbcbcbc);
        leg.position.set(0, 0.35, lz);
        this.legs.push(leg); g.add(leg);
      }
      g.add(body, head, armL, armR);
    }
    // eyes
    this.group = g;
    this.bodyMeshes = [];
    g.traverse((o) => { if (o.isMesh) { o.material.userData.baseColor = o.material.color.clone(); this.bodyMeshes.push(o.material); } });
  }

  collidesAt(world, x, y, z) {
    const w = this.def.w;
    const minX = Math.floor(x - w), maxX = Math.floor(x + w);
    const minY = Math.floor(y), maxY = Math.floor(y + this.def.h);
    const minZ = Math.floor(z - w), maxZ = Math.floor(z + w);
    for (let by = minY; by <= maxY; by++)
      for (let bz = minZ; bz <= maxZ; bz++)
        for (let bx = minX; bx <= maxX; bx++) {
          const d = __RQ('../shared/blocks.js').BLOCKS[world.getBlock(bx, by, bz)];
          if (d && d.solid) return true;
        }
    return false;
  }

  update(dt, world, player, opts) {
    opts = opts || {};
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;

    const distToPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    let moving = false;

    if (this.def.hostile && !player.dead && distToPlayer < this.def.range) {
      // chase
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      this.yaw = Math.atan2(-dz, -dx) + Math.PI; // face player
      if (distToPlayer > 1.35) {
        this.moveWithCollision(world, (dx / dl) * this.def.speed * dt, (dz / dl) * this.def.speed * dt);
        moving = true;
      } else if (this.attackCd <= 0 && Math.abs(player.pos.y - this.pos.y) < 2) {
        this.attackCd = 1.1;
        if (opts.onAttackPlayer) opts.onAttackPlayer(this.def.dmg, this);
      }
    } else {
      // wander
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4;
        this.wanderDir = Math.random() < 0.6 ? Math.random() * Math.PI * 2 : null;
      }
      if (this.wanderDir !== null && this.wanderDir !== undefined) {
        this.yaw = this.wanderDir;
        this.moveWithCollision(world, Math.cos(this.wanderDir) * this.def.speed * 0.55 * dt, Math.sin(this.wanderDir) * this.def.speed * 0.55 * dt);
        moving = true;
      }
    }

    // gravity
    const inWater = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z)) === B.WATER;
    if (inWater) {
      this.vel.y += 18 * dt;
      this.vel.y = Math.min(this.vel.y, 2.2);
    } else {
      this.vel.y -= 26 * dt;
    }
    // vertical integrate + ground check
    let ny = this.pos.y + this.vel.y * dt;
    if (this.collidesAt(world, this.pos.x, ny, this.pos.z)) {
      if (this.vel.y < 0) {
        this.onGround = true;
        ny = Math.floor(this.pos.y) ; // snap approx
        while (!this.collidesAt(world, this.pos.x, ny, this.pos.z) && ny < this.pos.y + 1) ny += 0.05;
        if (this.collidesAt(world, this.pos.x, ny, this.pos.z)) ny -= 0.05;
        // auto-jump when blocked horizontally and moving
        if (moving && !this.collidesAt(world, this.pos.x, ny + 1.05, this.pos.z)) this.vel.y = 7.4;
      }
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
    this.pos.y = ny;

    // burn hostiles in daylight (surface, day)
    if (this.def.hostile && opts.dayLightFactor > 0.8 && world.getSky(Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z)) >= 14) {
      this.sunBurnT = (this.sunBurnT || 0) + dt;
      if (this.sunBurnT > 2.2) { this.sunBurnT = 0; this.damage(2, null, opts); if (opts.onBurnFx) opts.onBurnFx(this); }
    }

    // visuals
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    if (moving) {
      this.animT += dt * 9;
      const sw = Math.sin(this.animT) * 0.6;
      if (this.legs) { this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw; if (this.legs[2]) { this.legs[2].rotation.x = -sw; this.legs[3].rotation.x = sw; } }
    }
    // hurt flash / light tint
    const wx = Math.floor(this.pos.x), wy = Math.floor(this.pos.y + 1), wz = Math.floor(this.pos.z);
    const sky = world.getSky(wx, wy, wz) / 15, blk = world.getBlockLight(wx, wy, wz) / 15;
    let lum = Math.max(sky * (opts.dayLightFactor || 1), blk);
    lum = 0.22 + 0.78 * lum;
    for (const m of this.bodyMeshes) {
      const bc = m.userData.baseColor;
      if (this.hurtT > 0) m.color.setRGB(1, 0.35, 0.35).multiplyScalar(lum);
      else m.color.copy(bc).multiplyScalar(lum);
    }
  }

  moveWithCollision(world, dx, dz) {
    const tryMove = (nx, nz) => !this.collidesAt(world, nx, this.pos.y + 0.02, nz);
    if (tryMove(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    else if (this.onGround && tryMove(this.pos.x + dx, this.pos.z) === false) {
      // step assist handled via jump in caller
    }
    if (tryMove(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
  }

  damage(amount, knockDir, opts) {
    this.hp -= amount;
    this.hurtT = 0.28;
    if (knockDir) {
      this.pos.x += knockDir.x * 0.28;
      this.pos.z += knockDir.z * 0.28;
      this.vel.y = Math.max(this.vel.y, 4.2);
    }
    if (this.hp <= 0) {
      this.dead = true;
      if (opts && opts.onDeath) opts.onDeath(this);
    }
  }
}

class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.spawnTimer = 2;
  }

  update(dt, player, opts) {
    opts = opts || {};
    // cull dead & far
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dist = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
      if (m.dead || dist > 90) {
        this.scene.remove(m.group);
        this.mobs.splice(i, 1);
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.mobs.length < 14 && !opts.peaceful) {
      this.spawnTimer = 3 + Math.random() * 4;
      this.trySpawn(player, opts);
    }
    for (const m of this.mobs) m.update(dt, this.world, player, opts);
  }

  trySpawn(player, opts) {
    const w = this.world;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 22 + Math.random() * 26;
      const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
      const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
      const y = w.surfaceY(x, z);
      if (y < 2 || w.getBlock(x, y, z) === 0 || w.getBlock(x, y + 1, z) !== 0) continue;
      const groundId = w.getBlock(x, y, z);
      const isNight = opts.isNight;
      const sky = w.getSky(x, y + 1, z);
      let type = null;
      const darkEnough = isNight || sky < 6 || w.getBlockLight(x, y + 1, z) > 7 ? false : false;
      void darkEnough;
      if ((isNight || sky <= 4) && Math.random() < 0.75) {
        type = Math.random() < 0.6 ? 'zombie' : 'skeleton';
      } else if (!isNight && (groundId === 2 || groundId === 17) && sky >= 12) {
        type = Math.random() < 0.5 ? 'pig' : 'sheep';
      }
      if (!type) continue;
      const mob = new Mob(type, x + 0.5, y + 1.01, z + 0.5);
      this.scene.add(mob.group);
      this.mobs.push(mob);
      if (opts.onSpawnFx) opts.onSpawnFx(mob);
      return mob;
    }
    return null;
  }

  /** Ray-pick nearest mob along camera forward within reach. */
  pick(player, maxDist) {
    const o = player.camera.position;
    const d = player.forward();
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      const cx = m.pos.x - o.x, cy = (m.pos.y + m.def.h * 0.5) - o.y, cz = m.pos.z - o.z;
      const t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > bestT) continue;
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
      const dd = Math.hypot(px - m.pos.x, py - (m.pos.y + m.def.h * 0.5), pz - m.pos.z);
      if (dd < Math.max(m.def.w + 0.28, 0.55)) { best = m; bestT = t; }
    }
    return best;
  }

  destroy() { for (const m of this.mobs) this.scene.remove(m.group); this.mobs = []; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { MobManager, Mob, MOB_TYPES };
if (typeof self !== 'undefined') self.MOBS_MOD = { MobManager, MOB_TYPES };
})();
