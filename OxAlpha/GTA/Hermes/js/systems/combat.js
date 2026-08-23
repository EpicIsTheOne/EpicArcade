// ============================================================
// NEON MERIDIAN — systems/combat.js
// Weapons, hitscan with spread, melee, tracer/blood FX pool,
// damage application to peds / cops / vehicles.
// ============================================================
'use strict';

const Combat = (() => {

  class FXPool {
    constructor(scene) {
      this.scene = scene;
      this.tracers = [];
      this.impacts = [];
      this.muzzle = null;
      this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a1020, transparent: true, opacity: 0.9 });
      this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true });
      this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.85 });

      // muzzle flash: small billboard sprite on gun
      const flashGeo = new THREE.PlaneGeometry(0.5, 0.5);
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.muzzle = new THREE.Mesh(flashGeo, flashMat);
    }

    tracer(from, to) {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length(); if (len < 0.01) return;
      const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 3, 1, true);
      geo.translate(0, len / 2, 0);
      const mesh = new THREE.Mesh(geo, this.tracerMat.clone());
      mesh.position.copy(from);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.scene.add(mesh);
      this.tracers.push({ mesh, t: 0.07 });
    }

    impact(pos, blood) {
      const n = blood ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const s = blood ? 0.07 : 0.05;
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), blood ? this.bloodMat : this.sparkMat);
        m.position.copy(pos);
        this.scene.add(m);
        this.impacts.push({
          mesh: m,
          vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6),
          t: 0.55 + Math.random() * 0.3,
        });
      }
    }

    update(dt) {
      for (let i = this.tracers.length - 1; i >= 0; i--) {
        const t = this.tracers[i]; t.t -= dt;
        t.mesh.material.opacity = Math.max(0, t.t / 0.07) * 0.85;
        if (t.t <= 0) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); this.tracers.splice(i, 1); }
      }
      for (let i = this.impacts.length - 1; i >= 0; i--) {
        const p = this.impacts[i]; p.t -= dt;
        p.vel.y -= 14 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.t <= 0) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); this.impacts.splice(i, 1); }
      }
      // muzzle fade
      if (this.muzzle.material.opacity > 0) {
        this.muzzle.material.opacity -= dt * 14;
      }
    }

    flashAt(pos, yaw, pitch) {
      this.muzzle.position.copy(pos);
      this.muzzle.rotation.set(0, -yaw, 0);
      this.muzzle.material.opacity = 1;
      if (!this.muzzle.parent) this.scene.add(this.muzzle);
    }
  }

  /**
   * Fire current weapon. Returns true if a shot happened.
   * game must expose: player, npc (manager), vehicles[], fx, wanted, audio, cam.
   */
  function fire(game, dt) {
    const pl = game.player;
    const wid = GameState.state.curWeapon;
    const w = CONFIG.WEAPONS.find(x => x.id === wid);
    if (!w || pl.dead || pl.inVehicle && wid !== 'pistol' && wid !== 'smg') return false;

    const isMelee = w.id === 'fist' || w.id === 'bat';
    if (!isMelee) {
      // ammo gate
      const ammo = GameState.state.ammo[w.id] || 0;
      if (ammo < w.ammoUse) { game.audio.play('empty'); return false; }
    }
    const cooldown = 1 / w.rate;
    if (pl.fireT > 0) return false;

    // origin & direction from camera/aim (verified math)
    const origin = new THREE.Vector3(pl.pos.x, pl.pos.y + CONFIG.PLAYER.EYE + 0.12, pl.pos.z);
    const fwd = ControlsMath.forward3(pl.camYaw, pl.camPitch);

    if (isMelee) {
      if (!pl.meleeAttack()) return false;
      game.audio.play('swing');
      // hit check after short delay handled immediately (arcade)
      let hitSomething = false;
      const reach = w.range;
      for (const ped of game.npc.peds) {
        if (ped.state === 'dead') continue;
        const dx = ped.pos.x - pl.pos.x, dz = ped.pos.z - pl.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > reach) continue;
        const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
        if (dot > 0.45) {
          ped.damage(w.dmg, game.pedCtx(), true);
          game.fx.impact(new THREE.Vector3(ped.pos.x, 1.3, ped.pos.z), true);
          hitSomething = true;
        }
      }
      for (const cop of game.npc.footCops) {
        if (cop.dead) continue;
        const dx = cop.pos.x - pl.pos.x, dz = cop.pos.z - pl.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < reach + 0.4) {
          cop.hp -= w.dmg;
          game.fx.impact(new THREE.Vector3(cop.pos.x, 1.3, cop.pos.z), true);
          if (cop.hp <= 0 && !cop.dead) { cop.dead = true; game.onKill('cop'); }
          hitSomething = true;
        }
      }
      // punch cars for alarm
      for (const v of game.allVehicles()) {
        const d = Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z);
        if (d < reach + 1.2 && v.hp > 0) {
          v.registerImpact(w.dmg * 0.25);
          game.fx.impact(new THREE.Vector3(v.pos.x, 0.9, v.pos.z), false);
          game.crimeReported('assault', pl.pos);
          hitSomething = true;
        }
      }
      if (hitSomething) game.audio.play('hit');
      pl.fireT = cooldown;
      return true;
    }

    // --- hitscan ---
    GameState.state.ammo[w.id] = ammo - w.ammoUse;
    pl.fireT = cooldown;
    game.audio.play(w.id === 'rifle' ? 'rifle' : w.id === 'smg' ? 'smg' : 'pistol');

    const spread = w.spread * (pl.aiming ? 0.45 : 1);
    const dir = new THREE.Vector3(
      fwd.x + (Math.random() - 0.5) * spread * 2,
      fwd.y + (Math.random() - 0.5) * spread * 2,
      fwd.z + (Math.random() - 0.5) * spread * 2,
    ).normalize();

    // ray vs entities: gather candidates with sphere radii
    let best = null, bestT = Infinity;
    const consider = (pos, radius, obj, kind) => {
      const ox = pos.x - origin.x, oy = pos.y - origin.y, oz = pos.z - origin.z;
      const tCa = ox * dir.x + oy * dir.y + oz * dir.z;
      if (tCa < 0 || tCa > w.range || tCa > bestT) return;
      const d2 = (ox * ox + oy * oy + oz * oz) - tCa * tCa;
      if (d2 > radius * radius) return;
      best = { obj, kind, point: new THREE.Vector3(origin.x + dir.x * tCa, origin.y + dir.y * tCa, origin.z + dir.z * tCa), t: tCa };
      bestT = tCa;
    };

    for (const ped of game.npc.peds) {
      if (ped.state === 'dead') continue;
      consider({ x: ped.pos.x, y: 1.0, z: ped.pos.z }, 0.62, ped, 'ped');
    }
    for (const cop of game.npc.footCops) {
      if (cop.dead) continue;
      consider({ x: cop.pos.x, y: 1.0, z: cop.pos.z }, 0.62, cop, 'cop');
    }
    for (const v of game.allVehicles()) {
      consider({ x: v.pos.x, y: 0.7, z: v.pos.z }, v.halfLen * 0.82, v, 'vehicle');
    }
    // world geometry: step ray through colliders (cheap march)
    let wallT = Infinity;
    for (let t = 2; t < w.range; t += 1.5) {
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      if (py < 0.1) { wallT = t; break; }
      let hitWall = false;
      for (const c of game.world.colliders) {
        if (px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1 && py < c.h) { hitWall = true; break; }
      }
      if (hitWall) { wallT = t; break; }
    }
    if (best && best.t < wallT) {
      game.fx.tracer(origin, best.point);
      game.fx.impact(best.point, best.kind !== 'vehicle');
      if (best.kind === 'ped') {
        best.obj.damage(w.dmg, game.pedCtx(), true);
        game.onKill('ped');
      } else if (best.kind === 'cop') {
        best.obj.hp -= w.dmg;
        if (best.obj.hp <= 0 && !best.obj.dead) { best.obj.dead = true; game.onKill('cop'); }
      } else if (best.kind === 'vehicle') {
        best.obj.registerImpact(w.dmg * 0.6);
        if (best.obj.driver === 'traffic') game.npc.panicAt(best.obj.pos, 18);
      }
    } else {
      const end = new THREE.Vector3(
        origin.x + dir.x * (wallT === Infinity ? w.range : wallT),
        origin.y + dir.y * (wallT === Infinity ? w.range : wallT),
        origin.z + dir.z * (wallT === Infinity ? w.range : wallT));
      game.fx.tracer(origin, end);
      if (wallT !== Infinity) game.fx.impact(end, false);
    }
    game.fx.flashAt(origin.clone().addScaledVector(dir, 0.6), pl.camYaw, pl.camPitch);

    // recoil kick to camera pitch (small)
    pl.camPitch += w.kick * 0.006;
    return true;
  }

  return { FXPool, fire };
})();

if (typeof module !== 'undefined') module.exports = { Combat: null };
