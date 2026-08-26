/* SKYRUSH — player movement: momentum run / coyote jump / dash / slide / wall-jump
   Collision = sphere vs oriented boxes (iterative push-out). Movers carry the player. */
"use strict";

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

const Player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  radius: 0.45,
  grounded: false, groundCol: null, groundVel: new THREE.Vector3(),
  wallNormal: new THREE.Vector3(), wallTimer: 0, wallSliding: false,
  sliding: false, slideDir: new THREE.Vector3(), wishDir: new THREE.Vector3(),
  dashCd: 0, dashCdMax: 1.15, dashFxTime: 0,
  coyote: 0, jumpBuf: 0,
  hazardCd: 0,
  spawnPoint: new THREE.Vector3(),
  lastLandVy: 0,
  stepPhase: 0,

  // tuning
  G: 30, maxRun: 11, accelGround: 85, accelAir: 32, frictionGround: 9,
  jumpVel: 11.6, coyoteMax: 0.12, bufferMax: 0.13,
  dashSpeed: 17.5, dashKeepAir: true,
  slideBoost: 2.6, slideFriction: 1.6, slideMinSpeed: 3.5,
  wallJumpUp: 10.8, wallJumpOut: 8.5, wallSlideMaxFall: -3.2,

  group: null,

  buildMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.35, metalness: 0.15 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x16204a, roughness: 0.5 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 1.2 });

    // body (capsule from cylinder + spheres)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.42, 14), bodyMat);
    torso.position.y = 0.52;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.285, 14, 10), bodyMat);
    belly.position.y = 0.34; belly.scale.y = 0.82;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), darkMat);
    head.position.y = 0.92;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), glowMat);
    visor.position.set(0, 0.94, -0.12); visor.scale.set(1.25, 0.62, 0.7);
    // limbs
    this.footL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), darkMat);
    this.footR = this.footL.clone();
    this.footL.position.set(-0.16, 0.11, 0); this.footR.position.set(0.16, 0.11, 0);
    // backpack fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.55 }));
    fin.position.set(0, 0.66, 0.27);

    g.add(torso, belly, head, visor, this.footL, this.footR, fin);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    Game.scene.add(g);
    this.group = g;
    this.visor = visor;
  },

  reset(toSpawn = true) {
    if (toSpawn) this.pos.copy(this.spawnPoint);
    this.vel.set(0, 0, 0);
    this.grounded = false; this.groundCol = null;
    this.sliding = false; this.dashCd = 0; this.coyote = 0; this.jumpBuf = 0;
    this.wallTimer = 0; this.wallSliding = false; this.hazardCd = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.PI; // face down-course (+z)
  },

  /* ---------- collision ---------- */
  collide(dt) {
    const r = this.radius;
    let bestGround = null, bestGroundVy = 0;
    this.wallSliding = false;

    for (let iter = 0; iter < 3; iter++) {
      for (const col of Level.colliders) {
        // sphere center -> box local space
        _v1.copy(this.pos).applyMatrix4(col.inv);
        const h = col.half;
        const cx = U.clamp(_v1.x, -h.x, h.x),
              cy = U.clamp(_v1.y, -h.y, h.y),
              cz = U.clamp(_v1.z, -h.z, h.z);
        let dx = _v1.x - cx, dy = _v1.y - cy, dz = _v1.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (d2 > r * r) continue;
        let nx, ny, nz, pen;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nx = dx / d; ny = dy / d; nz = dz / d; pen = r - d;
        } else {
          // center inside box: push along min penetration axis
          const px = h.x - Math.abs(_v1.x), py = h.y - Math.abs(_v1.y), pz = h.z - Math.abs(_v1.z);
          if (py <= px && py <= pz) { nx = 0; ny = Math.sign(_v1.y) || 1; nz = 0; pen = py + r; }
          else if (px <= pz) { nx = Math.sign(_v1.x) || 1; ny = 0; nz = 0; pen = px + r; }
          else { nx = 0; ny = 0; nz = Math.sign(_v1.z) || 1; pen = pz + r; }
        }
        // normal back to world space (rotation part only)
        _m3.setFromMatrix4(col.inv).transpose(); // inverse rotation = transpose of rotation in inv
        _v2.set(nx, ny, nz).applyMatrix3(_m3).normalize();

        // positional correction
        this.pos.addScaledVector(_v2, pen);

        if (_v2.y > 0.55) {
          // ground contact
          if (!bestGround || pen > 0) {
            bestGround = col;
            // kill velocity into ground
            const into = this.vel.dot(_v2);
            if (into < 0) this.vel.addScaledVector(_v2, -into);
            if (col.mover) { bestGround = col; }
          }
        } else if (Math.abs(_v2.y) < 0.45) {
          // wall
          this.wallNormal.copy(_v2);
          this.wallTimer = 0.16;
          const intoW = this.vel.dot(_v2);
          if (intoW < 0) this.vel.addScaledVector(_v2, -intoW);
        }
      }
    }

    // grounded state & platform carry
    const wasGrounded = this.grounded;
    this.grounded = !!bestGround;
    this.groundCol = bestGround;
    if (this.grounded) {
      this.coyote = this.coyoteMax;
      this.dashCd = 0; // refill dash on any ground touch
      if (!wasGrounded) {
        this.lastLandVy = this._prevVy || 0;
        this._landSquash = U.clamp(0.35 + (-this.lastLandVy) * 0.028, 0.35, 1);
        Game.onLand(this.lastLandVy);
      }
    }
    this._prevVy = this.vel.y;
  },

  virtualTowardWall() {
    if (!Input.virtual) return false;
    return Input.vslide === true && this.wallTimer > 0;
  },

  /* ---------- per-frame ---------- */
  update(dt, camYaw) {
    // timers
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.wallTimer = Math.max(0, this.wallTimer - dt);
    this.hazardCd = Math.max(0, this.hazardCd - dt);
    this.dashFxTime = Math.max(0, this.dashFxTime - dt);

    // --- wish direction ---
    let wx = 0, wz = 0;
    if (Input.virtual) {
      wx = Input.virtual.mx; wz = Input.virtual.mz;
    } else {
      const [ax, az] = Input.moveAxis();
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      // camera-relative: forward = (-sin(yaw)*? ) — three.js yaw: dir = (-sin, 0, -cos)
      wx = ax * c - az * s;
      wz = -ax * s - az * c;
    }
    const wLen = Math.hypot(wx, wz);
    if (wLen > 1) { wx /= wLen; wz /= wLen; }
    const hasWish = wLen > 0.01;

    // --- jump buffering ---
    if (Input.jumpPressed()) this.jumpBuf = this.bufferMax;

    // --- slide state ---
    const wantSlide = Input.slideHeld() && this.grounded && this.vel.length() > this.slideMinSpeed;
    if (wantSlide && !this.sliding) {
      this.sliding = true;
      this.slideDir.set(wx || Math.sin(this.group.rotation.y), 0, wz || -Math.cos(this.group.rotation.y));
      if (this.slideDir.lengthSq() < 0.01) this.slideDir.set(0, 0, -1);
      this.slideDir.normalize();
      // one-time boost along current horizontal velocity direction
      const hv = _v1.set(this.vel.x, 0, this.vel.z);
      const sp = hv.length();
      if (sp > 0.5) hv.divideScalar(sp);
      else hv.copy(this.slideDir);
      const boosted = Math.min(sp + this.slideBoost, 24);
      this.vel.x = hv.x * boosted; this.vel.z = hv.z * boosted;
      AudioSys.slide();
      Effects.burst(this.pos, 6, 0xcfe8ff, 2.4);
    }
    if (!wantSlide) this.sliding = false;
    this.wishDir.set(wx, 0, wz); // remembered for wall-slide check

    // --- dash ---
    if (Input.dashPressed() && this.dashCd <= 0 && !Game.timerDone) {
      let dx = wx, dz = wz;
      if (!hasWish) { dx = -Math.sin(this.group.rotation.y); dz = -Math.cos(this.group.rotation.y); }
      const curH = Math.hypot(this.vel.x, this.vel.z);
      const sp = Math.max(curH + 5.5, this.dashSpeed);
      this.vel.x = dx * sp; this.vel.z = dz * sp;
      if (this.vel.y < 1.5) this.vel.y = Math.max(this.vel.y * 0.25, 1.2); // slight lift, keeps arcs snappy
      this.dashCd = this.dashCdMax;
      this.dashFxTime = 0.28;
      AudioSys.dash();
      Effects.dashStreak(this.pos, dx, dz);
      Effects.shake(0.12);
      Game.onDash();
    }

    // --- jumping (ground/coyote/wall) ---
    if (this.jumpBuf > 0) {
      if (this.grounded || this.coyote > 0) {
        // slide-jump preserves speed naturally (no friction applied in air)
        this.vel.y = this.jumpVel;
        this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        AudioSys.jump();
        Effects.burst(this.pos, 5, 0xffffff, 1.8);
      } else if (this.wallTimer > 0) {
        // wall jump
        const n = this.wallNormal;
        this.vel.x = n.x * this.wallJumpOut;
        this.vel.z = n.z * this.wallJumpOut;
        this.vel.y = this.wallJumpUp;
        // keep some forward input influence
        if (hasWish) { this.vel.x += wx * 2.2; this.vel.z += wz * 2.2; }
        this.wallTimer = 0; this.jumpBuf = 0;
        this.dashCd = 0; // reward: refresh dash
        AudioSys.walljump();
        Effects.burst(_v1.copy(this.pos).addScaledVector(n, -0.4), 8, 0xbfe3ff, 2.2);
      }
    }

    // --- acceleration / friction ---
    const target = this.maxRun;
    if (this.sliding) {
      // low friction; steer slightly
      if (hasWish) {
        this.vel.x += wx * 6 * dt; this.vel.z += wz * 6 * dt;
      }
      const f = Math.exp(-this.slideFriction * dt);
      this.vel.x *= f; this.vel.z *= f;
    } else if (this.grounded) {
      if (hasWish) {
        this.vel.x += wx * this.accelGround * dt;
        this.vel.z += wz * this.accelGround * dt;
        // soft cap: only damp the component beyond maxRun
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > target) {
          const k = Math.exp(-2.2 * dt); // gently bleed overspeed (momentum!)
          const over = (hs - target) / hs;
          this.vel.x -= this.vel.x * over * (1 - k);
          this.vel.z -= this.vel.z * over * (1 - k);
        }
      } else {
        const f = Math.exp(-this.frictionGround * dt);
        this.vel.x *= f; this.vel.z *= f;
      }
    } else {
      // air control
      if (hasWish) {
        this.vel.x += wx * this.accelAir * dt;
        this.vel.z += wz * this.accelAir * dt;
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > Math.max(target * 1.65, this.dashSpeed)) {
          const k = Math.exp(-1.4 * dt);
          const over = (hs - Math.max(target * 1.65, this.dashSpeed)) / hs;
          this.vel.x -= this.vel.x * over * (1 - k);
          this.vel.z -= this.vel.z * over * (1 - k);
        }
      }
    }

    // --- gravity ---
    this.vel.y -= this.G * dt;
    if (this.vel.y < -38) this.vel.y = -38;

    // mover carry before collision
    if (this.grounded && this.groundCol && this.groundCol.mover) {
      const mv = this.groundCol.mover;
      this.pos.addScaledVector(mv.vel, dt);
    }

    // integrate + resolve
    this.pos.addScaledVector(this.vel, dt);
    this.collide(dt);

    // wall slide (airborne, falling, pushing into the wall)
    if (!this.grounded && this.wallTimer > 0 && this.vel.y < this.wallSlideMaxFall) {
      const push = -this.wishDir.x * this.wallNormal.x - this.wishDir.z * this.wallNormal.z;
      if (push > 0.25) {
        this.vel.y = U.damp(this.vel.y, this.wallSlideMaxFall, 14, dt);
        this.wallSliding = true;
      }
    }

    // boost pads
    for (const bp of Level.boostPads) {
      const dx = this.pos.x - bp.pos.x, dy = this.pos.y - bp.pos.y, dz = this.pos.z - bp.pos.z;
      if (dx * dx + dz * dz < bp.r * bp.r && Math.abs(dy) < 2.2 && this.grounded) {
        const curH = Math.hypot(this.vel.x, this.vel.z);
        const sp = Math.max(curH + 4.5, bp.speed);
        this.vel.x = bp.dir.x * sp; this.vel.z = bp.dir.z * sp;
        this.vel.y = Math.min(this.vel.y, -1);
        if (!this._boostCd || this._boostCd <= 0) { AudioSys.boost(); this._boostCd = 0.5; Effects.burst(this.pos, 8, 0x18e0c8, 2.6); }
      }
    }
    this._boostCd = Math.max(0, (this._boostCd || 0) - dt);

    // hazards
    if (this.hazardCd <= 0) {
      for (const hz of Level.hazards) {
        _v1.copy(this.pos).applyMatrix4(hz.inv);
        const h = hz.half, rr = this.radius + 0.12;
        const qx = Math.abs(_v1.x) - h.x, qy = Math.abs(_v1.y) - h.y, qz = Math.abs(_v1.z) - h.z;
        if (qx < rr && qy < rr && qz < rr) {
          // knock away from hazard center (world)
          _v2.copy(hz.mesh.getWorldPosition(_v3)).sub(this.pos).normalize().negate();
          _v2.y = Math.max(_v2.y, 0.35);
          this.vel.copy(_v2.multiplyScalar(11));
          this.vel.y = Math.max(this.vel.y, 6.5);
          this.hazardCd = 0.9;
          AudioSys.hazard();
          Effects.shake(0.35);
          Effects.burst(this.pos, 12, 0xff6b6b, 3.2);
          Game.onHazard();
          break;
        }
      }
    }

    // fell off world
    if (this.pos.y < Level.killY) Game.onFall();

    /* ---------- visuals ---------- */
    this.group.position.copy(this.pos);
    const hv2 = Math.hypot(this.vel.x, this.vel.z);
    if (hv2 > 1.2 && !this.sliding) {
      const targetRot = Math.atan2(-this.vel.x, -this.vel.z);
      let d = targetRot - this.group.rotation.y;
      while (d > Math.PI) d -= U.TAU; while (d < -Math.PI) d += U.TAU;
      this.group.rotation.y += d * Math.min(1, 14 * dt);
    }
    // squash/stretch + run bob
    let sx = 1, sy = 1;
    if (!this.grounded) sy = U.clamp(1 + this.vel.y * 0.012, 0.86, 1.18), sx = 2 - sy;
    else if (this._landSquash > 0) { this._landSquash -= dt * 5; sy = U.lerp(sy, 0.78, this._landSquash); sx = 2 - sy; }
    this.group.scale.set(sx, sy, sx);
    if (this.grounded && hv2 > 2) {
      this.stepPhase += dt * hv2 * 1.35;
      this.footL.position.y = 0.11 + Math.max(0, Math.sin(this.stepPhase)) * 0.16;
      this.footR.position.y = 0.11 + Math.max(0, Math.sin(this.stepPhase + Math.PI)) * 0.16;
      if (Math.sin(this.stepPhase) > 0.96 && !this._stepped) { AudioSys.step(); this._stepped = true; }
      if (Math.sin(this.stepPhase) < 0.5) this._stepped = false;
    } else {
      this.footL.position.y = U.damp(this.footL.position.y, 0.11, 10, dt);
      this.footR.position.y = U.damp(this.footR.position.y, 0.11, 10, dt);
    }
    // slide pose: lean back + lower
    const targetScaleYGroup = this.sliding ? 0.62 : 1;
    this._slidePose = U.damp(this._slidePose == null ? 1 : this._slidePose, targetScaleYGroup, 14, dt);
    // crouch the whole body visual while sliding
    this.group.scale.y *= this._slidePose;
  },
};
