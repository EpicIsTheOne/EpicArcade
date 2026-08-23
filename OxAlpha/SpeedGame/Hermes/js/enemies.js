/* ============================================================
   VOLT RUSH — enemies.js
   Original enemy roster built for FLOW combat:
   - Sparkdrone : hovering patrol drone (Surge target)
   - Strutsentinel : ground patroller (Surge target)
   - Voltsphere mine : static rolling hazard (explodes)
   - Prismturret : fires slow plasma orbs
   All procedural meshes; simple, readable, chainable.
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);

  function stdMat(color, rough = 0.5, metal = 0.4) {
    return new (T().MeshStandardMaterial)({ color, roughness: rough, metalness: metal });
  }
  function emat(color, ei = 1.8) {
    return new (T().MeshStandardMaterial)({ color, emissive: color, emissiveIntensity: ei, roughness: 0.4, metalness: 0.1 });
  }

  const COL = {
    droneHull: 0x2a2f45, droneEye: 0xffb02e,
    sentHull: 0x3a2f55, sentEye: 0xff4fd8,
    mine: 0x402028, mineCore: 0xff3b30,
    turret: 0x24304d, turretEye: 0x7cff4f,
    orb: 0x7cff4f,
  };

  let ENEMY_ID = 0;

  class EnemyBase {
    constructor(scene, x, y, z) {
      this.id = ++ENEMY_ID;
      this.scene = scene;
      this.pos = { x, y, z };
      this.spawn = { x, y, z };
      this.alive = true;
      this.hitY = 0.6;
      this.radius = 0.75;
      this.kind = 'enemy';
      this.group = new (T().Group)();
      this.group.position.set(x, y, z);
      scene.add(this.group);
      this.t = Math.random() * 10;
    }
    update(dt, player, game) { this.t += dt; }
    die(game) {
      if (!this.alive) return;
      this.alive = false;
      this.group.visible = false;
      if (game && game.onEnemyKilled) game.onEnemyKilled(this);
    }
    respawn() {
      this.alive = true;
      this.pos.x = this.spawn.x; this.pos.y = this.spawn.y; this.pos.z = this.spawn.z;
      this.group.visible = true;
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    }
    dispose() { this.scene.remove(this.group); }
  }

  /* ---------------- SPARKDRONE ---------------- */
  class Sparkdrone extends EnemyBase {
    constructor(scene, x, y, z, patrolR = 4) {
      super(scene, x, y, z);
      this.patrolR = patrolR;
      this.phase = Math.random() * Math.PI * 2;
      this.kind = 'drone';

      const hull = new (T().Mesh)(new (T().OctahedronGeometry)(0.52, 0), stdMat(COL.droneHull, 0.35, 0.7));
      hull.castShadow = true;
      this.group.add(hull);
      const band = new (T().Mesh)(new (T().TorusGeometry)(0.55, 0.05, 6, 20), emat(COL.droneEye, 1.4));
      band.rotation.x = Math.PI / 2;
      this.group.add(band);
      const eye = new (T().Mesh)(new (T().SphereGeometry)(0.14, 8, 8), emat(COL.droneEye, 2.2));
      eye.position.z = 0.42;
      this.group.add(eye);
      this.band = band; this.eye = eye;
      this.hitY = 0.2;
    }
    update(dt, player, game) {
      super.update(dt, player, game);
      const a = this.t * 0.7 + this.phase;
      this.pos.x = this.spawn.x + Math.cos(a) * this.patrolR;
      this.pos.z = this.spawn.z + Math.sin(a) * this.patrolR;
      this.pos.y = this.spawn.y + Math.sin(this.t * 1.7) * 0.35;
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      // face player-ish (menacing)
      if (player) {
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        this.group.rotation.y = Math.atan2(dx, dz);
      }
      this.band.rotation.z = this.t * 3;
    }
  }

  /* ---------------- STRUTSENTINEL ---------------- */
  class Strutsentinel extends EnemyBase {
    constructor(scene, x, y, z, dirX = 1, dirZ = 0, range = 8) {
      super(scene, x, y + 0.55, z);
      this.dir = { x: dirX, z: dirZ };
      const L = Math.hypot(dirX, dirZ) || 1;
      this.dir.x /= L; this.dir.z /= L;
      this.range = range;
      this.sign = 1;
      this.kind = 'sentinel';

      const body = new (T().Mesh)(new (T().ConeGeometry)(0.5, 1.1, 6), stdMat(COL.sentHull, 0.4, 0.55));
      body.castShadow = true;
      body.position.y = 0.55;
      this.group.add(body);
      const visor = new (T().Mesh)(new (T().BoxGeometry)(0.42, 0.1, 0.1), emat(COL.sentEye, 2.0));
      visor.position.set(0, 0.75, 0.32);
      this.group.add(visor);
      const base = new (T().Mesh)(new (T().CylinderGeometry)(0.42, 0.5, 0.18, 6), stdMat(0x1c1830, 0.5, 0.4));
      base.position.y = 0.09;
      this.group.add(base);
      this.visor = visor;
      this.hitY = 0.55;
    }
    update(dt, player, game) {
      super.update(dt, player, game);
      this.pos.x += this.dir.x * 3.2 * dt * this.sign;
      this.pos.z += this.dir.z * 3.2 * dt * this.sign;
      const dx = this.pos.x - this.spawn.x, dz = this.pos.z - this.spawn.z;
      if (dx * this.dir.x + dz * this.dir.z > this.range) this.sign = -1;
      if (dx * this.dir.x + dz * this.dir.z < -this.range) this.sign = 1;
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.group.rotation.y = Math.atan2(this.dir.x * this.sign, this.dir.z * this.sign);
      this.group.rotation.z = Math.sin(this.t * 9) * 0.06; // waddle
    }
  }

  /* ---------------- VOLTSPHERE MINE ---------------- */
  class Voltsphere extends EnemyBase {
    constructor(scene, x, y, z) {
      super(scene, x, y + 0.5, z);
      this.kind = 'mine';
      this.hitY = 0;
      const shell = new (T().Mesh)(new (T().IcosahedronGeometry)(0.55, 0), stdMat(COL.mine, 0.45, 0.5));
      shell.castShadow = true;
      this.group.add(shell);
      const core = new (T().Mesh)(new (T().IcosahedronGeometry)(0.3, 1), emat(COL.mineCore, 2.4));
      this.group.add(core);
      for (let i = 0; i < 6; i++) {
        const spike = new (T().Mesh)(new (T().ConeGeometry)(0.09, 0.3, 4), stdMat(0x151018, 0.4, 0.7));
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
        spike.rotation.z = -Math.PI / 2;
        spike.rotation.y = -a;
        this.group.add(spike);
      }
      this.core = core;
      this.exploded = false;
    }
    update(dt, player, game) {
      super.update(dt, player, game);
      this.group.rotation.y += dt * 1.4;
      this.core.material.emissiveIntensity = 2 + Math.sin(this.t * 6) * 1.2;
      // proximity detonation
      if (player && player.invuln <= 0 && player.state !== 'dead') {
        const dx = player.pos.x - this.pos.x, dy = (player.pos.y + 0.8) - this.pos.y, dz = player.pos.z - this.pos.z;
        if (dx * dx + dy * dy + dz * dz < 2.6) {
          this.explode(game, player);
        }
      }
    }
    explode(game, player) {
      if (this.exploded) return;
      this.exploded = true;
      this.die(game);
      if (game && game.fx) game.fx.explosionBurst(this.pos.x, this.pos.y, this.pos.z);
      if (game && game.shake) game.shake(0.5);
      if (player && game && game.audio) game.audio.play('explode');
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 4.5) player.hurt(game, { x: dx / d, z: dz / d });
    }
  }

  /* ---------------- PRISMTURRET ---------------- */
  class Prismturret extends EnemyBase {
    constructor(scene, x, y, z, dirX = 0, dirZ = 1) {
      super(scene, x, y, z);
      this.kind = 'turret';
      this.fireCd = 1 + Math.random();
      const L = Math.hypot(dirX, dirZ) || 1;
      this.face = { x: dirX / L, z: dirZ / L };

      const base = new (T().Mesh)(new (T().CylinderGeometry)(0.5, 0.62, 0.35, 8), stdMat(COL.turret, 0.45, 0.5));
      base.position.y = 0.17; base.castShadow = true;
      this.group.add(base);
      const dome = new (T().Group)();
      dome.position.y = 0.5;
      this.group.add(dome);
      const head = new (T().Mesh)(new (T().SphereGeometry)(0.4, 10, 8), stdMat(COL.turret, 0.35, 0.6));
      dome.add(head);
      const barrel = new (T().Mesh)(new (T().CylinderGeometry)(0.09, 0.12, 0.55, 8), stdMat(0x101623, 0.4, 0.7));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.4;
      dome.add(barrel);
      const lens = new (T().Mesh)(new (T().SphereGeometry)(0.12, 8, 8), emat(COL.turretEye, 2.2));
      lens.position.z = 0.62;
      dome.add(lens);
      this.dome = dome;
      this.orbs = [];
      this.hitY = 0.5;
    }
    update(dt, player, game) {
      super.update(dt, player, game);
      // aim at player when near
      let aiming = false;
      if (player) {
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 40 * 40) {
          aiming = true;
          const want = Math.atan2(dx, dz);
          let diff = want - this.dome.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.dome.rotation.y += diff * Math.min(1, dt * 4);
          this.fireCd -= dt;
          if (this.fireCd <= 0 && d2 < 30 * 30 && player.state !== 'dead') {
            this.fireCd = 1.6;
            this._fire(game);
          }
        }
      }
      if (!aiming) this.dome.rotation.y += dt * 0.4;
      // move orbs
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        o.life -= dt;
        o.mesh.position.x += o.vx * dt;
        o.mesh.position.y += o.vy * dt;
        o.mesh.position.z += o.vz * dt;
        if (o.life <= 0) {
          this.group.parent.remove(o.mesh);
          this.orbs.splice(i, 1);
          continue;
        }
        // orb hit player?
        if (player && player.invuln <= 0 && player.state !== 'dead') {
          const dx = player.pos.x - o.mesh.position.x;
          const dy = (player.pos.y + 0.8) - o.mesh.position.y;
          const dz = player.pos.z - o.mesh.position.z;
          if (dx * dx + dy * dy + dz * dz < 1.1) {
            player.hurt(game, { x: dx, z: dz });
            this.group.parent.remove(o.mesh);
            this.orbs.splice(i, 1);
          }
        }
      }
    }
    _fire(game) {
      const dirX = Math.sin(this.dome.rotation.y), dirZ = Math.cos(this.dome.rotation.y);
      const mesh = new (T().Mesh)(new (T().SphereGeometry)(0.16, 6, 6),
        new (T().MeshBasicMaterial)({ color: COL.orb }));
      mesh.position.set(this.pos.x + dirX * 0.6, this.pos.y + 0.5, this.pos.z + dirZ * 0.6);
      if (this.group.parent) this.group.parent.add(mesh);
      this.orbs.push({ mesh, vx: dirX * 14, vy: 0, vz: dirZ * 14, life: 3.2 });
      if (game && game.audio) game.audio.play('attack');
    }
    die(game) {
      // orbs die with turret
      for (const o of this.orbs) if (this.group.parent) this.group.parent.remove(o.mesh);
      this.orbs.length = 0;
      super.die(game);
    }
  }

  /* ---------------- HAZARD: pulsing saw zone (static, damages) ---------------- */
  class HazardZone {
    constructor(scene, world, x, y, z, sx, sz) {
      this.kind = 'hazard';
      this.alive = true;
      const geo = new (T().BoxGeometry)(sx, 0.22, sz);
      const mat = new (T().MeshStandardMaterial)({
        color: 0x30151c, emissive: 0xff2244, emissiveIntensity: 0.9,
        roughness: 0.4, metalness: 0.3,
      });
      this.mesh = new (T().Mesh)(geo, mat);
      this.mesh.position.set(x, y + 0.11, z);
      scene.add(this.mesh);
      world.addCollider({
        kind: 'box', type: 'hazard',
        min: { x: x - sx / 2, y: y, z: z - sz / 2 },
        max: { x: x + sx / 2, y: y + 0.3, z: z + sz / 2 },
        tag: 'hazard',
      });
    }
  }

  window.VoltEnemies = { Sparkdrone, Strutsentinel, Voltsphere, Prismturret, HazardZone };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltEnemies;
})();
