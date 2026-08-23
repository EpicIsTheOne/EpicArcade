// ============================================================
// NEON MERIDIAN — entities/player.js
// Original character "Nova" + third-person controller.
// Movement/camera use the verified ControlsMath (non-inverted).
// ============================================================
'use strict';

const Player = (() => {
  const P = CONFIG.PLAYER;

  // ---------- procedural character ----------
  function buildRig() {
    const g = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a886, roughness: 0.7 });
    const coatMat = new THREE.MeshStandardMaterial({ color:0x1c2026, roughness: 0.55, metalness: 0.15 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x101418, emissive: 0x35d5ff, emissiveIntensity: 1.2, roughness: 0.4,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.45, metalness: 0.3 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x272c34, roughness: 0.8 });

    const H = P.HEIGHT;
    const legH = H * 0.47, torsoH = H * 0.34, headR = H * 0.085;

    // legs (pivot at hip)
    const legGeo = new THREE.BoxGeometry(0.16, legH, 0.19);
    legGeo.translate(0, -legH / 2, 0);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    const legR = new THREE.Mesh(legGeo.clone(), pantsMat);
    legL.position.set(-0.11, legH, 0);
    legR.position.set(0.11, legH, 0);
    legL.castShadow = legR.castShadow = true;

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, torsoH, 0.24), coatMat);
    torso.position.y = legH + torsoH / 2;
    torso.castShadow = true;
    // chest stripe (accent)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.25), accentMat);
    stripe.position.y = torsoH * 0.22;
    torso.add(stripe);

    // head + hair
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 12), skinMat);
    skull.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.13, 14, 12), hairMat);
    hair.scale.set(1, 0.92, 1.05); hair.position.y = headR * 0.22;
    const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.5, 6), hairMat);
    ponytail.position.set(0, -headR * 0.2, -headR * 1.1);
    ponytail.rotation.x = 0.5;
    head.add(skull, hair, ponytail);
    head.position.y = legH + torsoH + headR * 1.1;

    // arms (pivot at shoulder)
    const armGeo = new THREE.BoxGeometry(0.12, H * 0.36, 0.14);
    armGeo.translate(0, -H * 0.18, 0);
    const armL = new THREE.Mesh(armGeo, coatMat);
    const armR = new THREE.Mesh(armGeo.clone(), coatMat);
    armL.position.set(-0.28, legH + torsoH * 0.92, 0);
    armR.position.set(0.28, legH + torsoH * 0.92, 0);
    armL.castShadow = armR.castShadow = true;

    // gun holder on right hand
    const gunAnchor = new THREE.Group();
    gunAnchor.position.set(0, -H * 0.36, 0.06);
    armR.add(gunAnchor);

    g.add(legL, legR, torso, head, armL, armR);

    return { root: g, legL, legR, armL, armR, head, torso, gunAnchor,
             mats: { accentMat } };
  }

  function buildGun() {
    const m = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.4, metalness: 0.7 });
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.3), m);
    barrel.position.z = 0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), m);
    grip.position.set(0, -0.09, -0.03);
    gun.add(barrel, grip);
    return gun;
  }

  class PlayerController {
    constructor(scene, spawn) {
      this.rig = buildRig();
      scene.add(this.rig.root);
      this.gun = buildGun();
      this.rig.gunAnchor.add(this.gun);
      this.gun.visible = false;

      this.pos = new THREE.Vector3(spawn.x, 0.14, spawn.z);
      this.velY = 0;
      this.heading = Math.PI;          // facing model direction (game convention)
      this.camYaw = Math.PI * 0.85;    // camera orbit
      this.camPitch = 0.12;
      this.speedH = 0;
      this.hp = P.MAX_HP; this.armor = 0;
      this.dead = false;
      this.onGround = true;
      this.animPhase = 0;
      this.meleeT = 0;
      this.fireT = 0;
      this.inVehicle = null;
      this.aiming = false;
      this.radius = P.RADIUS;
      this.regenT = 0;
      this._v = new THREE.Vector3();
    }

    get eyePos() {
      return this._v.set(this.pos.x, this.pos.y + P.EYE, this.pos.z);
    }

    /** Movement + gravity + collisions. cam-relative WASD via ControlsMath. */
    update(dt, input, world, game) {
      if (this.inVehicle) return;
      if (this.dead) { this.animate(dt); return; }

      // --- intent from camera yaw (verified math) ---
      const w = input.down('KeyW'), s = input.down('KeyS');
      const a = input.down('KeyA'), d = input.down('KeyD');
      const intent = ControlsMath.moveIntent(w, s, a, d, this.camYaw);
      const moving = (w || s || a || d);
      const sprinting = moving && input.down('ShiftLeft') && !this.aiming;
      const targetSpeed = !moving ? 0 : sprinting ? P.SPRINT : (this.aiming ? P.WALK * 0.75 : P.RUN);
      this.speedH = damp(this.speedH, targetSpeed, 10, dt);

      // face movement direction when not aiming; face camera when aiming
      if (moving) {
        const moveHeading = Math.atan2(intent.x, -intent.z);
        if (!this.aiming) this.heading += angleDelta(this.heading, moveHeading) * clamp(dt * 12, 0, 1);
        else this.heading += angleDelta(this.heading, this.camYaw) * clamp(dt * 16, 0, 1);
      } else if (this.aiming) {
        this.heading += angleDelta(this.heading, this.camYaw) * clamp(dt * 16, 0, 1);
      }

      // --- integrate horizontal ---
      const f = ControlsMath.basis(this.heading).fwd;
      const nx = this.pos.x + intent.x * this.speedH * dt;
      const nz = this.pos.z + intent.z * this.speedH * dt;

      // --- collide (circle vs AABBs, axis-separated) ---
      let px = this.pos.x, pz = this.pos.z;
      // X axis
      let tx = nx, tz = pz;
      for (const c of world.colliders) {
        if (c.h < 0.5) continue;
        if (tx > c.x0 - this.radius && tx < c.x1 + this.radius &&
            tz > c.z0 - this.radius && tz < c.z1 + this.radius) {
          tx = px; break;
        }
      }
      // Z axis
      px = tx; tz = nz;
      for (const c of world.colliders) {
        if (c.h < 0.5) continue;
        if (px > c.x0 - this.radius && px < c.x1 + this.radius &&
            tz > c.z0 - this.radius && tz < c.z1 + this.radius) {
          tz = pz; break;
        }
      }
      this.pos.x = tx; this.pos.z = tz;

      // --- ground / gravity ---
      const groundY = 0.14;
      if (input.wasPressed('Space') && this.onGround) {
        this.velY = P.JUMP_V; this.onGround = false;
        game.audio.play('jump');
      }
      this.velY -= P.GRAVITY * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= groundY) { this.pos.y = groundY; this.velY = 0; this.onGround = true; }
      else this.onGround = false;

      // --- timers ---
      if (this.meleeT > 0) this.meleeT -= dt;
      if (this.fireT > 0) this.fireT -= dt;
      // slow health regen out of combat
      this.regenT += dt;
      if (this.regenT > 8 && this.hp < P.MAX_HP) this.hp = Math.min(P.MAX_HP, this.hp + dt * 2.5);

      this.animate(dt, sprinting);
      this.syncMesh();
    }

    animate(dt, sprinting) {
      const rate = this.speedH * 1.35 + 2;
      if (this.speedH > 0.3) this.animPhase += dt * rate;
      const sw = Math.sin(this.animPhase) * clamp(this.speedH / P.RUN, 0.14, 1) * 0.85;
      const r = this.rig;
      r.legL.rotation.x = sw;
      r.legR.rotation.x = -sw;
      if (this.meleeT > 0) {
        r.armR.rotation.x = -2.2 + (0.45 - this.meleeT) * 6;
        r.armL.rotation.x = sw * 0.5;
      } else if (this.aiming) {
        r.armR.rotation.x = -Math.PI / 2 + this.camPitch;
        r.armL.rotation.x = -Math.PI / 2 + this.camPitch + 0.25;
      } else {
        r.armR.rotation.x = -sw * 0.8;
        r.armL.rotation.x = sw * 0.8;
      }
      if (!this.onGround) { r.legL.rotation.x = 0.5; r.legR.rotation.x = -0.3; }
      // subtle idle breathing
      r.torso.position.y += 0; // keep pivot stable
      r.head.rotation.y = Math.sin(performance.now() / 900) * 0.06 * (this.speedH < 0.3 ? 1 : 0);
    }

    syncMesh() {
      this.rig.root.position.copy(this.pos);
      this.rig.root.rotation.y = -this.heading;   // three mapping
    }

    meleeAttack() {
      if (this.meleeT > 0 || this.dead) return false;
      this.meleeT = 0.45;
      return true;
    }

    damage(amount, game) {
      if (this.dead) return;
      this.regenT = 0;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, amount * 0.6);
        this.armor -= absorbed; amount -= absorbed;
      }
      this.hp -= amount;
      game.hud.flashDamage();
      game.audio.play('hurt');
      if (this.hp <= 0) { this.hp = 0; this.dead = true; game.onPlayerDeath(); }
    }

    respawn(spawn) {
      this.hp = P.MAX_HP;
      this.dead = false;
      this.pos.set(spawn.x, 0.14, spawn.z);
      this.velY = 0;
      this.inVehicle = null;
      this.syncMesh();
    }

    setVisible(v) { this.rig.root.visible = v; }
  }

  /**
   * Third-person camera. NON-INVERTED look (verified math),
   * collision-aware boom, shoulder offset while aiming.
   */
  function updateCamera(cam, pl, dt, input, world, opts) {
    const C = CONFIG.CAMERA;
    const look = ControlsMath.applyLook(
      pl.camYaw, pl.camPitch, input.mouseDX, input.mouseDY,
      C.SENS * (GameState.settings.sens || 1),
      !!GameState.settings.invertX, !!GameState.settings.invertY,
      C.MIN_PITCH, C.MAX_PITCH);
    pl.camYaw = look.yaw; pl.camPitch = look.pitch;

    const inCar = !!pl.inVehicle;
    const dist = inCar
      ? lerp(C.CAR_DIST, C.TRUCK_DIST, clamp((pl.inVehicle.cls.l - 4.3) / 1.2, 0, 1))
      : (pl.aiming ? C.FOOT_DIST * 0.72 : C.FOOT_DIST);
    const height = inCar ? 2.6 : 1.9;

    // boom vector behind camera yaw
    const back = { x: -Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    let cx = pl.pos.x + back.x * dist * Math.cos(pl.camPitch);
    let cz = pl.pos.z + back.z * dist * Math.cos(pl.camPitch);
    let cy = pl.pos.y + height + Math.sin(pl.camPitch) * dist;

    // aim-mode shoulder offset (camera-relative RIGHT)
    if (pl.aiming && !inCar) {
      const r = ControlsMath.basis(pl.camYaw).right;
      cx += r.x * C.SHOULDER; cz += r.z * C.SHOULDER;
    }

    // camera collision: pull boom in if blocked
    const steps = 6;
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      const sx = pl.pos.x + (cx - pl.pos.x) * t;
      const sz = pl.pos.z + (cz - pl.pos.z) * t;
      let blocked = false;
      for (const c of world.colliders) {
        if (c.kind === 'boundary' || c.h < 1.2) continue;
        if (sx > c.x0 - C.COLLIDE_PAD && sx < c.x1 + C.COLLIDE_PAD &&
            sz > c.z0 - C.COLLIDE_PAD && sz < c.z1 + C.COLLIDE_PAD) { blocked = true; break; }
      }
      if (!blocked) {
        cx = sx; cz = sz;
        cy = pl.pos.y + height + Math.sin(pl.camPitch) * dist * t;
        break;
      }
      if (i === 1) { cx = pl.pos.x; cz = pl.pos.z; cy = pl.pos.y + height + 0.6; }
    }

    cam.position.set(cx, Math.max(cy, 0.6), cz);
    // look-at target slightly above subject, along view dir
    const fwd = ControlsMath.forward3(pl.camYaw, pl.camPitch);
    const tx = pl.pos.x + fwd.x * 8, ty = pl.pos.y + height - 0.4 + fwd.y * 8, tz = pl.pos.z + fwd.z * 8;
    cam.lookAt(tx, ty, tz);
  }

  return { PlayerController, updateCamera, buildRig };
})();

if (typeof module !== 'undefined') module.exports = { Player: null };
