/* ============================================================
   VOLT RUSH — player.js
   Momentum-based character controller.
   Ground: slope-projected acceleration, drift, quick-step, drift-dash.
   Air: full control + air dash + Surge Attack (spin homing).
   Traversal: rails, wall-run, loops (spline-locked), springs,
   dash panels, updrafts. Substepped capsule collision (anti-tunnel).
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);
  // math helpers (VoltMath loaded globally)
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  const CFG = {
    radius: 0.38, height: 1.55,
    runMax: 17, sprintMax: 30, boostMax: 42, hardMax: 60,
    accel: 36, airAccel: 22, friction: 5, brake: 40, airDrag: 0.12,
    jumpVel: 16, jumpCut: 0.45, coyote: 0.12, buffer: 0.14,
    gravity: 38, fastFallGrav: 1.6,
    driftTurn: 1.9, turnRate: 2.6, airTurn: 2.2,
    dashSpeed: 40, dashTime: 0.28, dashCooldown: 0.9,
    quickStepSpeed: 16, quickStepTime: 0.18, qsCooldown: 0.32,
    wallRunTime: 1.5, wallRunSpeed: 16, wallRunGrav: 8, wallJumpOut: 9, wallJumpUp: 13,
    surgeRange: 16, surgeSpeed: 52, surgeLock: 0.35,
    railSnap: 3.2, railAccel: 26, railMax: 52, railJump: 14.5,
    springVel: 30, panelSpeed: 42, panelTime: 0.55,
    stepUp: 0.55, snapDist: 0.5,
    respawnInvuln: 1.5,
  };

  const ST = { GROUND: 'ground', AIR: 'air', RAIL: 'rail', WALL: 'wall', LOOP: 'loop', SURGE: 'surge', DASH: 'dash', HURT: 'hurt', DEAD: 'dead' };

  class Player {
    constructor(scene, world) {
      this.scene = scene; this.world = world;
      this.pos = { x: 0, y: 5, z: 0 };
      this.vel = { x: 0, y: 0, z: 0 };
      this.state = ST.AIR;
      this.prevState = ST.AIR;
      this.grounded = false;
      this.coyote = 0; this.jumpBuf = 0;
      this.groundNormal = { x: 0, y: 1, z: 0 };
      this.groundSpeed = 0;         // signed speed along ground plane
      this.heading = 0;             // yaw the body faces (movement dir)
      this.yawVel = 0;
      this.drift = 0;               // -1 left, +1 right, 0 none
      this.driftCharge = 0;
      this.driftTier = 0;           // 0/1/2 boost tiers
      this.boostTimer = 0; this.boostPower = 0;
      this.dashTimer = 0; this.dashDir = { x: 0, z: 1 }; this.dashCd = 0;
      this.qsTimer = 0; this.qsDir = { x: 0, z: 0 }; this.qsCd = 0;
      this.wall = null; this.wallN = null; this.wallTimer = 0; this.wallSide = 0;
      this.rail = null; this.railS = 0; this.railDir = 1; this.railCooldown = 0;
      this.loop = null; this.loopS = 0; this.loopSpeed = 0; this.loopCooldown = 0;
      this.surge = null;            // target enemy while surging
      this.surgeTimer = 0;
      this.panelTimer = 0; this.panelDir = null;
      this.springTimer = 0;
      this.hurtTimer = 0; this.invuln = 0; this.deadTimer = 0;
      this.rings = 0; this.hp = 1;
      this.airJumps = 0;
      this.spawn = { x: 0, y: 5, z: 0 };
      this.checkpoint = { x: 0, y: 5, z: 0, yaw: 0 };
      this.substepped = 0;
      this.landHard = 0;
      this.lastGroundY = 0;
      this.fallDist = 0;
      this.events = {};             // event callbacks set by game
      this._q = [];
    }

    on(ev, fn) { (this.events[ev] = this.events[ev] || []).push(fn); }
    emit(ev, a) { const l = this.events[ev]; if (l) for (const f of l) f(a); }

    setState(s) { if (this.state !== s) { this.prevState = this.state; this.state = s; } }

    respawn(atCheckpoint) {
      const p = atCheckpoint ? this.checkpoint : this.spawn;
      this.pos.x = p.x; this.pos.y = p.y + 0.5; this.pos.z = p.z;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.heading = p.yaw || 0;
      this.state = ST.AIR;
      this.rail = null; this.loop = null; this.wall = null; this.surge = null;
      this.invuln = CFG.respawnInvuln; this.hurtTimer = 0;
      this.boostTimer = 0; this.drift = 0; this.driftCharge = 0; this.driftTier = 0;
      this.emit('respawn', atCheckpoint);
    }

    /* ================= MAIN UPDATE ================= */
    update(dt, input, camYaw, game) {
      this.substepped = 0;
      // timers
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.qsCd = Math.max(0, this.qsCd - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      this.railCooldown = Math.max(0, this.railCooldown - dt);
      this.loopCooldown = Math.max(0, this.loopCooldown - dt);
      if (input.jumpPressed) this.jumpBuf = CFG.buffer;

      const speed = Math.hypot(this.vel.x, this.vel.z);
      const maxSpd = this._maxSpeed();

      // ---------- state machine ----------
      if (this.state === ST.DEAD) { this._updateDead(dt, game); return; }
      if (this.state === ST.HURT) { this._updateHurt(dt, game, camYaw); }
      else if (this.state === ST.RAIL) this._updateRail(dt, input, game);
      else if (this.state === ST.LOOP) this._updateLoop(dt, input, game);
      else if (this.state === ST.SURGE) this._updateSurge(dt, game);
      else if (this.state === ST.DASH) this._updateDash(dt, input, game);
      else if (this.state === ST.WALL) this._updateWall(dt, input, camYaw, game);
      else this._updateFree(dt, input, camYaw, game);

      // ---------- integrate with substeps (anti-tunneling) ----------
      if (this.state !== ST.LOOP && this.state !== ST.RAIL && this.state !== ST.DEAD) {
        const v = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
        const steps = clamp(Math.ceil(v * dt / 0.35), 1, 8);
        this.substepped = steps;
        const sdt = dt / steps;
        for (let i = 0; i < steps; i++) {
          this.pos.x += this.vel.x * sdt;
          this.pos.y += this.vel.y * sdt;
          this.pos.z += this.vel.z * sdt;
          this._collide(sdt, game);
          if (this.state === ST.DEAD) break;
        }
      }

      // ---------- ground snap & coyote ----------
      if (this.state === ST.GROUND) this._groundSnap(game);

      // ---------- kill floor ----------
      if (this.pos.y < this.world.killY) { this._die(game); }

      // ---------- world volumes & triggers ----------
      const vol = this.world.sampleVolumes(this.pos.x, this.pos.y + 0.8, this.pos.z);
      if (vol.updraft > 0 && this.state === ST.AIR) {
        this.vel.y += vol.updraft * 30 * dt;
        if (this.vel.y > 24) this.vel.y = 24;
      }
      this.world.updateTriggers(this.pos.x, this.pos.y + 0.8, this.pos.z, game);

      // ---------- heading follows velocity ----------
      if (this.state !== ST.LOOP && this.state !== ST.RAIL) {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > 1.2) {
          const target = Math.atan2(this.vel.x, this.vel.z);
          const VM = window.VoltMath;
          let d = VM.angDiff(this.heading, target);
          const rate = this.state === ST.GROUND ? CFG.turnRate * (this.drift ? CFG.driftTurn : 1) : CFG.airTurn;
          this.heading += clamp(d, -rate * dt, rate * dt);
        }
      }
    }

    _maxSpeed() {
      if (this.boostTimer > 0) return CFG.hardMax;
      if (this.state === ST.RAIL) return CFG.railMax;
      return CFG.sprintMax;
    }

    /* ================= FREE (ground / air) ================= */
    _updateFree(dt, input, camYaw, game) {
      const VM = window.VoltMath;
      // input intent in camera space
      let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let iz = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const mag = Math.hypot(ix, iz);
      let intentX = 0, intentZ = 0, hasIntent = mag > 0.01;
      if (hasIntent) {
        ix /= mag; iz /= mag;
        // camera-relative: forward = -Z at camYaw
        const s = Math.sin(camYaw), c = Math.cos(camYaw);
        intentX = ix * c - iz * s;
        intentZ = -ix * s - iz * c;
        // NOTE: forward key (iz=+1) maps to world (-sin(camYaw), -cos(camYaw)) = camera forward
      }

      // quick-step (Q/E): lateral dodge preserving momentum
      if (this.state === ST.GROUND && this.qsCd <= 0 && (input.qsL || input.qsR)) {
        const side = input.qsL ? -1 : 1;
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        this.qsDir = { x: fz * side, z: -fx * side };
        this.qsTimer = CFG.quickStepTime; this.qsCd = CFG.qsCooldown;
        this.emit('quickstep', side);
      }
      if (this.qsTimer > 0) {
        this.qsTimer -= dt;
        this.vel.x = this.qsDir.x * CFG.quickStepSpeed;
        this.vel.z = this.qsDir.z * CFG.quickStepSpeed;
        if (this.qsTimer <= 0 && Math.hypot(this.vel.x, this.vel.z) > CFG.sprintMax) {
          const s = CFG.sprintMax / Math.hypot(this.vel.x, this.vel.z);
          this.vel.x *= s; this.vel.z *= s;
        }
      }

      // drift (Shift while turning on ground)
      const wantDrift = input.drift && this.state === ST.GROUND && Math.hypot(this.vel.x, this.vel.z) > 8;
      if (wantDrift && this.drift === 0 && hasIntent) {
        this.drift = ix > 0.3 ? 1 : (ix < -0.3 ? -1 : (this.vel.x * Math.cos(this.heading) - this.vel.z * Math.sin(this.heading) > 0 ? 1 : -1));
      }
      if (this.drift !== 0 && (!input.drift || this.state !== ST.GROUND || Math.hypot(this.vel.x, this.vel.z) < 5)) {
        // release: drift-dash if charged
        if (this.driftCharge > CFG.driftTurn * 0.45 && this.driftTier >= 1) {
          const tierBoost = [0, 0.35, 0.55, 0.75][this.driftTier] || 0.35;
          this._applyBoost(0.8 + tierBoost, 34 + this.driftTier * 6);
          this.emit('driftdash', this.driftTier);
        }
        this.drift = 0; this.driftCharge = 0; this.driftTier = 0;
      }
      if (this.drift !== 0) {
        this.driftCharge += dt;
        this.driftTier = this.driftCharge > 1.5 ? 2 : (this.driftCharge > 0.6 ? 1 : 0);
        // extra yaw rotation while drifting
        this.heading += this.drift * 2.4 * dt;
      }

      // Shift on ground = boost (drift uses Shift only while turning)
      const wantBoost = input.dash && this.state === ST.GROUND && !this.drift && this.boostTimer <= 0;
      if (wantBoost) { this._applyBoost(0.9, CFG.boostMax); }

      // air dash / ground dash (Shift in air, or E)
      if (input.dash && this.dashCd <= 0 && this.state === ST.AIR) {
        this.dashDir = hasIntent ? { x: intentX, z: intentZ } : { x: Math.sin(this.heading), z: Math.cos(this.heading) };
        this.dashTimer = CFG.dashTime; this.dashCd = CFG.dashCooldown;
        this.setState(ST.DASH);
        this.emit('dash');
        return;
      }

      if (this.state === ST.DASH) { this._updateDash(dt, input, game); return; }

      // Surge Attack: Space on enemy in range while airborne
      if (this.state === ST.AIR && this.jumpBuf > 0 && game && game.nearestTarget) {
        const tgt = game.nearestTarget(this.pos, CFG.surgeRange, this.vel);
        if (tgt) {
          this.surge = tgt; this.surgeTimer = CFG.surgeLock;
          this.setState(ST.SURGE);
          this.jumpBuf = 0;
          this.emit('surge', tgt);
          return;
        }
      }

      const onGround = this.state === ST.GROUND;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const maxSpd = this._maxSpeed();

      // ---- jump ----
      if (this.jumpBuf > 0) {
        if (onGround || this.coyote > 0) {
          this.vel.y = CFG.jumpVel;
          this.jumpBuf = 0; this.coyote = 0;
          this.setState(ST.AIR);
          this.emit('jump');
        } else if (this.airJumps > 0 && !onGround) {
          this.airJumps--;
          this.vel.y = CFG.jumpVel * 0.92;
          // slight redirect toward intent
          if (hasIntent) {
            this.vel.x += intentX * 3; this.vel.z += intentZ * 3;
          }
          this.jumpBuf = 0;
          this.setState(ST.AIR);
          this.emit('doublejump');
        }
      }
      // variable jump: cut upward vel when released
      if (!input.jump && this.vel.y > 6 && this.state === ST.AIR && this.prevState !== ST.RAIL) {
        this.vel.y += (6 - this.vel.y) * CFG.jumpCut * dt * 30;
      }

      // ---- acceleration ----
      if (onGround) {
        const n = this.groundNormal;
        // slope-projected accel
        let ax = 0, az = 0;
        if (hasIntent) {
          const slopeDot = n.x * intentX + n.z * intentZ;
          const k = CFG.accel * (1 - Math.max(0, n.y - 0.7) * 0.5);
          ax = intentX * k - n.x * slopeDot * k * 0.6;
          az = intentZ * k - n.z * slopeDot * k * 0.6;
        }
        // slope gravity along surface: horizontal part of the normal points
        // DOWNHILL, so accelerate along +normal-horizontal (sign matters!)
        const slopeAccel = n.x * CFG.gravity * 0.9 + n.z * CFG.gravity * 0.9;
        ax += slopeAccel * (hasIntent ? 1 : 1.15);
        az += slopeAccel * (hasIntent ? 1 : 1.15);
        this.vel.x += ax * dt; this.vel.z += az * dt;

        let ns = Math.hypot(this.vel.x, this.vel.z);
        // friction / brake — scales DOWN on steep slopes so momentum survives;
        // flat ground keeps crisp stops. Skipped entirely while overspeeding
        // (the clamp below handles the bleed) so the two never double-dip.
        if (!hasIntent && this.qsTimer <= 0 && ns <= maxSpd) {
          const steep = clamp(Math.hypot(n.x, n.z) * 6, 0, 1);
          const f = CFG.friction * (1 - steep * 0.92) * dt;
          ns = Math.max(0, ns - f);
          const sc = ns / (Math.hypot(this.vel.x, this.vel.z) || 1);
          this.vel.x *= sc; this.vel.z *= sc;
        }
        // braking (S against motion) — decelerates only the component
        // OPPOSED to wish direction, so S never fights its own lateral part.
        if (hasIntent && iz < -0.5) {
          const along = this.vel.x * intentX + this.vel.z * intentZ;
          if (along < -0.5) {
            const b = CFG.brake * dt;
            const na = Math.min(0, along + b);       // pull toward 0
            const sc = (along === 0) ? 0 : (na / along);
            this.vel.x *= sc; this.vel.z *= sc;
            // lateral input while braking rotates remaining momentum (power-slide feel)
            if (Math.abs(ix) > 0.3) {
              const side = ix > 0 ? 1 : -1;
              const rot = CFG.turnRate * 0.9 * dt * side;
              const c = Math.cos(rot), s2 = Math.sin(rot);
              const vx = this.vel.x, vz = this.vel.z;
              this.vel.x = vx * c - vz * s2;
              this.vel.z = vx * s2 + vz * c;
              this.heading += rot * 0.45;
            }
          }
        }
        // clamp to max (soft): overspeed from slopes/rails/panels CARRIES for a
        // long time (that's the fun) — only a hard ceiling (>hardMax) sheds fast
        ns = Math.hypot(this.vel.x, this.vel.z);
        if (ns > maxSpd) {
          const decay = ns > CFG.hardMax ? 40 : 0.35;
          const target = Math.max(maxSpd, ns - ns * 0.25 * decay * dt);
          const sc = target / ns;
          this.vel.x *= sc; this.vel.z *= sc;
        }
      } else {
        // air control
        if (hasIntent) {
          this.vel.x += intentX * CFG.airAccel * dt;
          this.vel.z += intentZ * CFG.airAccel * dt;
        }
        // air drag
        const d = 1 - CFG.airDrag * dt;
        this.vel.x *= d; this.vel.z *= d;
        // gravity (heavier when falling)
        const g = CFG.gravity * (this.vel.y < 0 ? CFG.fastFallGrav : 1);
        this.vel.y -= g * dt;
        if (this.vel.y < -55) this.vel.y = -55;
      }

      // ---- state transitions ----
      if (onGround) {
        if (this.vel.y > 2) this.setState(ST.AIR);
      } else {
        this.setState(ST.AIR);
      }
    }

    /* ================= DASH ================= */
    _updateDash(dt, input, game) {
      this.dashTimer -= dt;
      this.vel.x = this.dashDir.x * CFG.dashSpeed;
      this.vel.z = this.dashDir.z * CFG.dashSpeed;
      this.vel.y = Math.max(this.vel.y, -2);
      this.heading = Math.atan2(this.dashDir.x, this.dashDir.z);
      if (this.dashTimer <= 0) {
        this.setState(ST.AIR);
        const s = Math.hypot(this.vel.x, this.vel.z);
        if (s > CFG.sprintMax) { const k = CFG.sprintMax / s; this.vel.x *= k; this.vel.z *= k; }
      }
    }

    /* ================= SURGE (homing spin attack) ================= */
    _updateSurge(dt, game) {
      this.surgeTimer -= dt;
      const tgt = this.surge;
      if (!tgt || this.surgeTimer <= 0 || !tgt.alive) {
        this.setState(ST.AIR); this.surge = null; return;
      }
      const tx = tgt.pos.x, ty = tgt.pos.y + (tgt.hitY || 0.5), tz = tgt.pos.z;
      const dx = tx - this.pos.x, dy = ty - (this.pos.y + 0.8), dz = tz - this.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.3) {
        // HIT
        if (game.hitTarget) game.hitTarget(tgt, this);
        this.vel.x = dx / (d || 1) * -8; this.vel.y = 13; this.vel.z = dz / (d || 1) * -8;
        this.setState(ST.AIR); this.surge = null;
        this.airJumps = Math.max(this.airJumps, 1); // rebound refresh
        return;
      }
      const sp = CFG.surgeSpeed;
      this.vel.x = dx / d * sp; this.vel.y = dy / d * sp; this.vel.z = dz / d * sp;
      this.heading = Math.atan2(this.vel.x, this.vel.z);
    }

    /* ================= RAIL GRINDING ================= */
    _updateRail(dt, input, game) {
      const rail = this.rail;
      if (!rail || !rail.alive) { this._leaveRail(); return; }
      // accelerate along rail
      this.railSpeed = (this.railSpeed || 10) + CFG.railAccel * dt;
      if (input.up) this.railSpeed += CFG.railAccel * 0.7 * dt;
      if (input.down) this.railSpeed -= CFG.brake * dt;
      this.railSpeed = clamp(this.railSpeed, 4, CFG.railMax);
      // crouch = tuck for extra speed
      if (input.drift) this.railSpeed += 8 * dt;

      this.railS += this.railDir * this.railSpeed * dt;
      if (this.railS >= rail.spline.totalLength - 0.5 || this.railS <= 0.5) {
        // reached the end: fly off with velocity
        const tan = rail.spline.getTangentAt(clamp(this.railS, 0, rail.spline.totalLength), {});
        const dir = this.railDir;
        this.vel.x = tan.x * this.railSpeed * dir;
        this.vel.y = tan.y * this.railSpeed * dir + 2.5;
        this.vel.z = tan.z * this.railSpeed * dir;
        this._leaveRail(true);
        this.emit('railexit');
        return;
      }
      const p = rail.spline.getPointAt(this.railS, {});
      this.pos.x = p.x; this.pos.y = p.y + 0.05; this.pos.z = p.z;
      const tan = rail.spline.getTangentAt(this.railS, {});
      this.vel.x = tan.x * this.railSpeed * this.railDir;
      this.vel.y = tan.y * this.railSpeed * this.railDir;
      this.vel.z = tan.z * this.railSpeed * this.railDir;
      this.heading = Math.atan2(this.vel.x, this.vel.z);
      // jump off
      if (this.jumpBuf > 0) {
        this.jumpBuf = 0;
        const n = { x: -tan.z * this.railDir, y: 1, z: tan.x * this.railDir };
        const L = Math.hypot(n.x, n.z) || 1;
        this.vel.x += n.x / L * 3;
        this.vel.z += n.z / L * 3;
        this.vel.y = CFG.railJump;
        this.airJumps = 1;
        this._leaveRail();
        this.emit('railjump');
      }
      // balance meter could go here; keep simple: no fall off
    }
    _tryGrabRail() {
      if (this.railCooldown > 0 || this.state === ST.RAIL) return false;
      const rails = game_rails(this.world);
      const vy = this.vel.y;
      if (vy > 4) return false; // must be falling or level-ish
      for (const r of rails) {
        // sample along rail for nearest point
        const step = Math.max(2, r.spline.totalLength / 40);
        for (let s = 0; s <= r.spline.totalLength; s += step) {
          const p = r.spline.getPointAt(s, {});
          const dx = p.x - this.pos.x, dy = p.y - (this.pos.y + 0.9), dz = p.z - this.pos.z;
          if (dx * dx + dy * dy + dz * dz < CFG.railSnap * CFG.railSnap) {
            // direction: prefer velocity alignment; fall back to tangent sign
            const tan = r.spline.getTangentAt(s, {});
            const along = this.vel.x * tan.x + this.vel.y * tan.y + this.vel.z * tan.z;
            const horiz = Math.hypot(this.vel.x, this.vel.z);
            if (horiz > 3 || Math.abs(along) > 2) {
              this.railDir = along >= 0 ? 1 : -1;
            } else {
              // slow drop onto rail: pick direction pointing toward rail interior
              const ahead = r.spline.getPointAt(Math.min(r.spline.totalLength, s + 6), {});
              this.railDir = (ahead.x - p.x) * 1 + (ahead.z - p.z) * 1 >= 0 ? 1 : -1;
              void ahead;
            }
            this.rail = r; this.railS = s; this.railSpeed = Math.max(10, Math.hypot(this.vel.x, this.vel.z));
            this.setState(ST.RAIL);
            this.airJumps = 1;
            this.emit('railenter');
            return true;
          }
        }
      }
      return false;
    }
    _leaveRail(exitVel) {
      this.rail = null; this.railCooldown = 0.25;
      this.setState(ST.AIR);
    }

    /* ================= LOOP (spline-locked) ================= */
    _updateLoop(dt, input, game) {
      const loop = this.loop;
      if (!loop || !loop.alive) { this._exitLoop(); return; }
      // gentle speed decay (gravity fights the climb, but never stalls a fast entry)
      this.loopSpeed -= 7 * dt;
      // player input nudges speed
      if (input.up) this.loopSpeed += 30 * dt;
      this.loopSpeed = clamp(this.loopSpeed, 8, 60);
      this.loopS += this.loopDir * this.loopSpeed * dt;
      const L = loop.spline.totalLength;
      if (this.loopS < 0) this.loopS = 0;
      if (this.loopS > L) this.loopS = L;
      const p = loop.spline.getPointAt(this.loopS, {});
      const tan = loop.spline.getTangentAt(this.loopS, {});
      this.pos.x = p.x; this.pos.y = p.y + 0.1; this.pos.z = p.z;
      // orient: heading follows tangent; body up = loop normal (handled by game orienting mesh)
      this.heading = Math.atan2(tan.x * this.loopDir, tan.z * this.loopDir);
      this.vel.x = tan.x * this.loopSpeed * this.loopDir;
      this.vel.y = tan.y * this.loopSpeed * this.loopDir;
      this.vel.z = tan.z * this.loopSpeed * this.loopDir;
      // exit conditions: reach either end with speed, or stall
      const atEnd = this.loopS >= L - 0.4;
      const atStart = this.loopS <= 0.4;
      const stalled = Math.abs(this.loopSpeed) < 6 && (this.loopS < L * 0.35 || this.loopS > L * 0.65);
      if (atEnd || atStart || stalled) {
        if (atEnd || atStart) {
          // keep momentum out the other side
          const exitTan = tan;
          this.vel.x = exitTan.x * Math.abs(this.loopSpeed) * (atEnd ? this.loopDir : -this.loopDir);
          this.vel.y = Math.max(exitTan.y * Math.abs(this.loopSpeed) * (atEnd ? this.loopDir : -this.loopDir), 2);
          this.vel.z = exitTan.z * Math.abs(this.loopSpeed) * (atEnd ? this.loopDir : -this.loopDir);
        } else {
          // stalled: drop out
          this.vel.y = -2;
        }
        this._exitLoop();
      }
    }
    _exitLoop() {
      this.loop = null; this.loopCooldown = 0.4;
      this.setState(ST.AIR);
      this.emit('loopexit');
    }
    _enterLoop(loop, dir, entrySpeed) {
      if (this.loopCooldown > 0) return false;
      this.loop = loop; this.loopDir = dir || 1;
      this.loopS = dir >= 0 ? 0.01 : loop.spline.totalLength - 0.01;
      this.loopSpeed = Math.max(18, entrySpeed || 18);
      this.setState(ST.LOOP);
      this.emit('looper');
      return true;
    }

    /* ================= WALL RUN ================= */
    _updateWall(dt, input, camYaw, game) {
      this.wallTimer -= dt;
      const n = this.wallN;
      if (!n || this.wallTimer <= 0) { this._leaveWall(false); return; }
      // stick to wall
      const toWall = { x: -n.x, y: 0, z: -n.z };
      this.vel.x += toWall.x * 30 * dt; this.vel.z += toWall.z * 30 * dt;
      // gravity reduced while wall-running
      this.vel.y -= CFG.wallRunGrav * dt;
      // run along wall: forward = cross(up, normal) * side
      const side = this.wallSide;
      const fx = -n.z * side, fz = n.x * side;
      // maintain speed along wall
      const along = this.vel.x * fx + this.vel.z * fz;
      const target = CFG.wallRunSpeed;
      if (along < target) {
        this.vel.x += (fx * target - this.vel.x) * Math.min(1, dt * 3);
        this.vel.z += (fz * target - this.vel.z) * Math.min(1, dt * 3);
      }
      this.heading = Math.atan2(fx, fz);
      // jump off
      if (this.jumpBuf > 0) {
        this.jumpBuf = 0;
        this.vel.x = n.x * CFG.wallJumpOut + fx * CFG.wallRunSpeed * 0.6;
        this.vel.z = n.z * CFG.wallJumpOut + fz * CFG.wallRunSpeed * 0.6;
        this.vel.y = CFG.wallJumpUp;
        this.airJumps = 1;
        this._leaveWall(true);
        this.emit('walljump');
        return;
      }
      // detach if input pushes away from wall
      let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let iz = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      if ((ix || iz)) {
        const s = Math.sin(camYaw), c = Math.cos(camYaw);
        const wx = ix * c - iz * s, wz = -ix * s - iz * c;
        if (wx * n.x + wz * n.z < -0.6) { this._leaveWall(false); return; }
      }
    }
    _tryWallRun(wallN, wallBox) {
      if (this.state === ST.GROUND || this.state === ST.WALL) return false;
      if (this.vel.y > 6) return false;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp < 7) return false;
      // wall must be tall & steep
      if (wallN.y < -0.2 || wallN.y > 0.25) return false;
      if (wallBox && (wallBox.max.y - wallBox.min.y) < 3) return false;
      this.wallN = { x: wallN.x, y: 0, z: wallN.z };
      const L = Math.hypot(this.wallN.x, this.wallN.z) || 1;
      this.wallN.x /= L; this.wallN.z /= L;
      // side: which way along the wall are we moving?
      const crossX = -this.wallN.z, crossZ = this.wallN.x;
      const along = this.vel.x * crossX + this.vel.z * crossZ;
      this.wallSide = along >= 0 ? 1 : -1;
      this.wallTimer = CFG.wallRunTime;
      this.wall = wallBox || null;
      this.setState(ST.WALL);
      this.airJumps = 1;
      this.emit('wallrun');
      return true;
    }
    _leaveWall(jumped) {
      this.wall = null; this.wallN = null;
      this.setState(ST.AIR);
      if (!jumped) { this.vel.y = Math.max(this.vel.y, -3); this.airJumps = 1; }
    }

    /* ================= HURT / DEATH ================= */
    _updateHurt(dt, game, camYaw) {
      this.hurtTimer -= dt;
      this.vel.y -= CFG.gravity * dt;
      if (this.hurtTimer <= 0) this.setState(ST.AIR);
    }
    hurt(game, knockDir) {
      if (this.invuln > 0 || this.state === ST.DEAD) return;
      if (this.rings > 0) {
        // scatter rings (simplified: lose some)
        const lost = Math.min(this.rings, Math.max(8, Math.floor(this.rings * 0.4)));
        this.rings -= lost;
        this.emit('ringslost', lost);
        this.invuln = 1.2;
        this.hurtTimer = 0.35;
        this.setState(ST.HURT);
        if (knockDir) {
          this.vel.x = knockDir.x * 10; this.vel.z = knockDir.z * 10; this.vel.y = 8;
        }
      } else {
        this._die(game);
      }
    }
    _die(game) {
      if (this.state === ST.DEAD) return;
      this.setState(ST.DEAD); this.deadTimer = 1.4;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.emit('death');
    }
    _updateDead(dt, game) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.rings = 0;
        this.respawn(true);
        this.emit('respawned');
      }
    }

    /* ================= COLLISION ================= */
    _collide(dt, game) {
      const r = CFG.radius, h = CFG.height;
      const hits = this.world.resolveCapsule(this.pos, r, h, this.vel);
      if (hits.hazard && this.invuln <= 0) { this.hurt(game, { x: -this.vel.x, z: -this.vel.z }); }
      if (hits.landed) {
        if (this.state === ST.AIR || this.state === ST.DASH || this.state === ST.HURT) {
          const fall = -this.vel.y;
          this.landHard = clamp(fall / 40, 0, 1);
          if (fall > 4) this.emit('land', this.landHard);
          if (this.state === ST.DASH) { this.setState(ST.GROUND); }
          else this.setState(ST.GROUND);
        }
        this.coyote = CFG.coyote;
        this.airJumps = 1;
        if (this.vel.y < 0) this.vel.y = 0;
        // platform carry
        if (hits.platform && hits.platform.delta) {
          this.pos.x += hits.platform.delta.x;
          this.pos.y += hits.platform.delta.y;
          this.pos.z += hits.platform.delta.z;
        }
        this.groundNormal = hits.wallN;
        this.lastGroundY = this.pos.y;
      } else if (this.state === ST.GROUND && hits.wallN && hits.wallN.y <= 0.55) {
        // walked off an edge
        this.coyote = Math.max(this.coyote, 0.04);
      } else if (this.state === ST.GROUND && !hits.landed && !hits.wall) {
        // no collision at all this substep: might be airborne; ground snap will verify
      }
      if (hits.ceiling && this.vel.y > 0) this.vel.y = 0;

      // wall-run opportunity
      if (hits.wall && !hits.landed && this.state === ST.AIR && this.wallTimer <= 0 && this.railCooldown <= 0) {
        if (hits.wall.type === 'wallrun' || hits.wall.tag === 'wall' || hits.wall.max.y - hits.wall.min.y > 3.5) {
          this._tryWallRun(hits.wallN, hits.wall);
        }
      }
    }

    _groundSnap(game) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const snapD = CFG.snapDist + Math.min(0.6, sp * 0.02);
      const hit = this.world.probeGround(this.pos.x, this.pos.y + 0.4, this.pos.z, snapD + 0.4, this.vel);
      if (hit && hit.point.y <= this.pos.y + 0.45 && hit.point.y >= this.pos.y - snapD) {
        // stick to slope
        this.pos.y = hit.point.y;
        this.groundNormal = hit.normal;
        if (this.vel.y < 0) this.vel.y = 0;
        this.coyote = CFG.coyote;
        this.airJumps = 1;
        // ramp platform carry
        if (hit.collider && hit.collider.platform && hit.collider.platform.delta) {
          this.pos.x += hit.collider.platform.delta.x;
          this.pos.y += hit.collider.platform.delta.y;
          this.pos.z += hit.collider.platform.delta.z;
        }
      } else if (!hit) {
        // truly airborne now
        this.setState(ST.AIR);
      }
    }

    /* ================= BOOST ================= */
    _applyBoost(time, power) {
      this.boostTimer = Math.max(this.boostTimer, time);
      this.boostPower = Math.max(this.boostPower, power);
      this.emit('boost', power);
    }
    tickBoost(dt) {
      if (this.boostTimer > 0) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp < this.boostPower) {
          const k = Math.min(this.boostPower, sp + 60 * dt) / (sp || 1);
          this.vel.x *= k; this.vel.z *= k;
        }
      } else this.boostPower = 0;
    }

    /* ---- helpers used by game ---- */
    speed() { return Math.hypot(this.vel.x, this.vel.z); }
    fullSpeed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }

    // called by game each frame BEFORE update: try rail/loop grabs
    tryGrabs(game) {
      if (this.state === ST.AIR || this.state === ST.DASH) {
        this._tryGrabRail();
      }
      if ((this.state === ST.GROUND || this.state === ST.AIR) && this.loopCooldown <= 0) {
        const loops = game_loops(this.world);
        for (const lp of loops) {
          const p = lp.spline.getPointAt(0, {});
          const dx = p.x - this.pos.x, dy = p.y - this.pos.y, dz = p.z - this.pos.z;
          if (dx * dx + dy * dy + dz * dz < 9 && this.speed() > 16) {
            const tan = lp.spline.getTangentAt(0, {});
            const along = this.vel.x * tan.x + this.vel.z * tan.z;
            this._enterLoop(lp, along >= 0 ? 1 : -1, this.speed());
            break;
          }
        }
      }
    }
  }

  /* ---- registries the player queries (set by game) ---- */
  let game_rails = () => [];
  let game_loops = () => [];
  function registerRailsFn(fn) { game_rails = fn; }
  function registerLoopsFn(fn) { game_loops = fn; }

  window.VoltPlayer = { Player, CFG, ST, registerRailsFn, registerLoopsFn };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltPlayer;
})();
