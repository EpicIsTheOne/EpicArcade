/* SKYLINE DASH — player controller: AABB physics + parkour movement */
window.PKPlayer = (function () {
  const C = {
    GRAV: 23, TERMINAL: -42,
    WALK: 6.0, SPRINT: 10.0,
    ACCEL_G: 70, FRICTION: 9, FRICTION_INPUT: 1.8,
    AIR_ACCEL: 26, SOFTCAP: 11.5,
    JUMP_V: 8.6, COYOTE: 0.12, BUFFER: 0.14,
    SLIDE_MIN_SPEED: 4.5, SLIDE_BOOST_MIN: 11, SLIDE_BOOST_MAX: 13.8,
    SLIDE_FRICTION: 1.5, SLIDE_STEER: 1.9, SLIDE_EXIT_SPEED: 3.5, SLIDE_JUMP_V: 8.8,
    DASH_V: 17, DASH_TIME: 0.16, DASH_REGEN: 2.8, DASH_MAX: 2,
    WALLRUN_MIN_SPEED: 5.5, WALLRUN_TIME: 2.4, WALLRUN_TARGET: 12.5, WALLRUN_STICK: 2.5,
    WALLJUMP_UP: 8.6, WALLJUMP_PUSH: 6.0, WALLRUN_EXIT_UP: 7.6, WALLRUN_EXIT_PUSH: 5.5,
    WALL_CD: 0.3, PROBE: 0.34
  };

  class Player {
    constructor(world) {
      this.world = world;
      this.pos = world.spawn.pos.clone();     // center of AABB
      this.vel = new THREE.Vector3();
      this.hx = 0.35;
      this.hyStand = 0.85; this.hySlide = 0.45;
      this.hy = this.hyStand;
      this.yaw = world.spawn.yaw; this.pitch = 0;

      this.grounded = false; this.wasGrounded = false;
      this.mode = 'normal';                   // normal | slide | wallrun
      this.wallSide = 0;                      // -1 left, +1 right
      this.wallNormal = new THREE.Vector3();
      this.wallT = 0;

      this.coyote = 0; this.jumpBuf = 0;
      this.prevJump = false; this.prevDash = false; this.prevSlideKey = false;
      this.dashT = 0; this.charges = C.DASH_MAX; this.airDashUsed = false;
      this.wallCd = 0; this.slideT = 0;
      this.stepDist = 0;
      this.fallingFrom = 0;

      this.events = {};                       // wired by main
      this.deathGuard = false;
    }

    /* ---------- collision helpers ---------- */
    _overlapsBox(px, py, pz, hx, hy, b) {
      return px + hx > b.min.x && px - hx < b.max.x &&
             py + hy > b.min.y && py - hy < b.max.y &&
             pz + hx > b.min.z && pz - hx < b.max.z;
    }
    _anyOverlap(px, py, pz, hx, hy) {
      const s = this.world.solids;
      for (let i = 0; i < s.length; i++)
        if (this._overlapsBox(px, py, pz, hx, hy, s[i])) return true;
      return false;
    }
    /** cast a small box offset from center; returns {nx,nz} wall normal or null */
    _castWall(dx, dz, dist) {
      const px = this.pos.x + dx * (this.hx + dist);
      const pz = this.pos.z + dz * (this.hx + dist);
      const py = this.pos.y + this.hy * 0.25;
      const hx = 0.18, hy = this.hy * 0.75;
      const s = this.world.solids;
      for (let i = 0; i < s.length; i++) {
        const b = s[i];
        if (!this._overlapsBox(px, py, pz, hx, hy, b)) continue;
        // dominant axis → wall normal pointing away from box toward player
        const ox = (this.pos.x - (b.min.x + b.max.x) / 2) / ((b.max.x - b.min.x) / 2 + hx);
        const oz = (this.pos.z - (b.min.z + b.max.z) / 2) / ((b.max.z - b.min.z) / 2 + hx);
        if (Math.abs(ox) > Math.abs(oz)) return { nx: Math.sign(ox) || 1, nz: 0 };
        return { nx: 0, nz: Math.sign(oz) || 1 };
      }
      return null;
    }
    _ceilingBlocked() {
      const feet = this.pos.y - this.hy;
      const cy = feet + this.hyStand - 0.02;
      return this._anyOverlap(this.pos.x, cy, this.pos.z, this.hx - 0.02, this.hyStand - 0.02);
    }

    /* ---------- state ops ---------- */
    refillDash() { this.charges = C.DASH_MAX; this.airDashUsed = false; }

    respawn(p, yaw) {
      this.pos.copy(p); this.vel.set(0, 0, 0);
      this.yaw = yaw != null ? yaw : this.world.spawn.yaw; this.pitch = 0;
      this.hy = this.hyStand; this.mode = 'normal';
      this.grounded = true; this.coyote = 0; this.jumpBuf = 0;
      this.dashT = 0; this.wallT = 0; this.wallCd = 0; this.slideT = 0;
      this.refillDash(); this.deathGuard = false;
    }

    startSlide() {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      let dx = this.vel.x, dz = this.vel.z;
      if (sp > 0.01) { dx /= sp; dz /= sp; }
      else { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); }
      const ns = Math.min(Math.max(sp * 1.15, C.SLIDE_BOOST_MIN), C.SLIDE_BOOST_MAX);
      this.vel.x = dx * ns; this.vel.z = dz * ns;
      this.pos.y -= (this.hyStand - this.hySlide);
      this.hy = this.hySlide;
      this.mode = 'slide'; this.slideT = 0;
      if (this.events.slideStart) this.events.slideStart();
    }
    stopSlide() {
      this.pos.y += (this.hyStand - this.hySlide);
      this.hy = this.hyStand;
      this.mode = 'normal';
      if (this.events.slideEnd) this.events.slideEnd();
      return true;
    }

    doDash(wx, wz) {
      if (this.charges < 1) return false;
      const airborne = !this.grounded && this.mode !== 'wallrun';
      if (airborne && this.airDashUsed) return false;
      let dx = wx, dz = wz;
      if (!dx && !dz) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); }
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      if (this.mode === 'wallrun') { this.mode = 'normal'; if (this.events.wallrunEnd) this.events.wallrunEnd(false); }
      if (this.mode === 'slide') {
        // only stand up out of the slide if there is headroom (e.g. not under a gate)
        if (this._ceilingBlocked()) return false;
        this.stopSlide();
      }
      this.vel.x = dx * C.DASH_V; this.vel.z = dz * C.DASH_V;
      this.vel.y *= 0.25;
      this.dashT = C.DASH_TIME;
      this.charges -= 1;
      if (airborne) this.airDashUsed = true;
      if (this.events.dash) this.events.dash(dx, dz);
      return true;
    }

    tryJump(axes) {
      // ground / coyote jump
      if (this.grounded || this.coyote > 0) {
        if (this.mode === 'slide') {
          if (this._ceilingBlocked()) return false;
          this.stopSlide();
          const sp = Math.hypot(this.vel.x, this.vel.z);
          const k = Math.min(sp * 1.03, 14) / (sp || 1);
          this.vel.x *= k; this.vel.z *= k;
        }
        this.vel.y = C.JUMP_V;
        this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        if (this.events.jump) this.events.jump();
        return true;
      }
      // wall-run exit jump
      if (this.mode === 'wallrun') {
        const n = this.wallNormal;
        this.vel.x += n.x * C.WALLRUN_EXIT_PUSH;
        this.vel.z += n.z * C.WALLRUN_EXIT_PUSH;
        this.vel.y = C.WALLRUN_EXIT_UP;
        this._endWallrun(true);
        if (this.events.walljump) this.events.walljump(true);
        return true;
      }
      // air wall-jump (touch)
      if (this.wallCd <= 0) {
        const h = this._heading();
        const L = this._castWall(h.z, -h.x, C.PROBE);
        const R = this._castWall(-h.z, h.x, C.PROBE);
        const F = this._castWall(h.x, h.z, C.PROBE);
        const w = L || R || F;
        if (w) {
          this.vel.x += w.nx * C.WALLJUMP_PUSH;
          this.vel.z += w.nz * C.WALLJUMP_PUSH;
          this.vel.y = C.WALLJUMP_UP;
          this.jumpBuf = 0; this.wallCd = C.WALL_CD;
          this.airDashUsed = false;
          if (this.events.walljump) this.events.walljump(false);
          return true;
        }
      }
      return false;
    }

    _heading() {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp < 0.01) return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      return { x: this.vel.x / sp, z: this.vel.z / sp };
    }

    _startWallrun(hit, side) {
      this.mode = 'wallrun'; this.wallSide = side;
      this.wallNormal.set(hit.nx, 0, hit.nz);
      this.wallT = 0;
      this.vel.y *= 0.35;
      this.airDashUsed = false;
      if (this.events.wallrunStart) this.events.wallrunStart(side);
    }
    _endWallrun(jumped) {
      this.mode = 'normal'; this.wallCd = C.WALL_CD;
      if (!jumped) this.vel.y = Math.max(this.vel.y, 2.5);
      if (this.events.wallrunEnd) this.events.wallrunEnd(jumped);
    }

    /* ---------- main tick (fixed dt) ---------- */
    tick(dt, axes) {
      this._stage = 'init';
      if (this.deathGuard) return;
      const ev = this.events;

      // timers
      this._lastStage = 'timers';
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.wallCd = Math.max(0, this.wallCd - dt);
      this.dashT = Math.max(0, this.dashT - dt);
      if (this.charges < C.DASH_MAX)
        this.charges = Math.min(C.DASH_MAX, this.charges + dt / C.DASH_REGEN);

      // edges
      const jumpPressed = axes.jump && !this.prevJump;
      const dashPressed = axes.dash && !this.prevDash;
      this.prevJump = axes.jump; this.prevDash = axes.dash;
      if (jumpPressed) this.jumpBuf = C.BUFFER;

      // wish direction (world space)
      this._lastStage = 'wish';
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let wx = fx * ((axes.fwd ? 1 : 0) - (axes.back ? 1 : 0)) + rx * ((axes.right ? 1 : 0) - (axes.left ? 1 : 0));
      let wz = fz * ((axes.fwd ? 1 : 0) - (axes.back ? 1 : 0)) + rz * ((axes.right ? 1 : 0) - (axes.left ? 1 : 0));
      const wl = Math.hypot(wx, wz);
      if (wl > 0.001) { wx /= wl; wz /= wl; } else { wx = 0; wz = 0; }

      // dash toward current wish direction
      if (dashPressed) this.doDash(wx, wz);

      // jump (buffered)
      if (this.jumpBuf > 0) {
        if (this.tryJump(axes)) { /* consumed */ }
      }

      // ---- state transitions ----
      this._lastStage = 'transitions';
      if (this.mode === 'normal') {
        // slide enter
        const slideEdge = axes.slide && !this.prevSlideKey;
        this.prevSlideKey = axes.slide;
        const sp0 = Math.hypot(this.vel.x, this.vel.z);
        if (slideEdge && this.grounded && sp0 >= C.SLIDE_MIN_SPEED && this.mode === 'normal') {
          this.startSlide();
        }
      } else if (this.mode === 'slide') {
        this.prevSlideKey = axes.slide;
      } else { this.prevSlideKey = axes.slide; }

      // wall-run engage
      this._lastStage = 'engage';
      if (this.mode === 'normal' && !this.grounded && this.wallCd <= 0 && this.vel.y < 7) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > C.WALLRUN_MIN_SPEED) {
          const h = this._heading();
          const L = this._castWall(h.z, -h.x, 0.45);
          if (L) this._startWallrun(L, -1);
          else {
            const R = this._castWall(-h.z, h.x, 0.45);
            if (R) this._startWallrun(R, 1);
          }
        }
      }

      // ---- horizontal control ----
      this._lastStage = 'control:' + this.mode;
      if (this.mode === 'wallrun') {
        this.wallT += dt;
        const n = this.wallNormal;
        // tangent = heading projected on wall plane
        const h = this._heading();
        let tx = h.x - n.x * (h.x * n.x + h.z * n.z);
        let tz = h.z - n.z * (h.x * n.x + h.z * n.z);
        const tl = Math.hypot(tx, tz);
        if (tl > 0.01) {
          tx /= tl; tz /= tl;
          const cur = this.vel.x * tx + this.vel.z * tz;
          const target = Math.min(Math.max(cur, 8.5), C.WALLRUN_TARGET);
          const add = Math.min(Math.max(target - cur, 0), 40 * dt);
          this.vel.x += tx * add; this.vel.z += tz * add;
        }
        // stick to wall
        this.vel.x -= n.x * C.WALLRUN_STICK * dt;
        this.vel.z -= n.z * C.WALLRUN_STICK * dt;
        // detach conditions
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const stillOn = this._castWall(-n.x, -n.z, 0.24);
        const fwdOK = axes.fwd || axes.left || axes.right || axes.back;
        if (this.wallT > C.WALLRUN_TIME || sp < 4 || !stillOn || !fwdOK) {
          this._endWallrun(false);
        }
      } else if (this.mode === 'slide') {
        this.slideT += dt;
        // low friction
        let sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 0) {
          const drop = sp * C.SLIDE_FRICTION * dt;
          const ns = Math.max(sp - drop, 0);
          const k = ns / sp; this.vel.x *= k; this.vel.z *= k; sp = ns;
        }
        // steer toward wish
        if (wl > 0 && sp > 0.5) {
          const a0 = Math.atan2(this.vel.z, this.vel.x);
          const a1 = Math.atan2(wz, wx);
          let da = a1 - a0;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          da = Math.max(-C.SLIDE_STEER * dt, Math.min(C.SLIDE_STEER * dt, da));
          const na = a0 + da;
          this.vel.x = Math.cos(na) * sp; this.vel.z = Math.sin(na) * sp;
          if (ev.slideDust) ev.slideDust();
        }
        // exit
        const wantOut = (!axes.slide && this.slideT > 0.22) || sp < C.SLIDE_EXIT_SPEED;
        if (wantOut) {
          if (!this._ceilingBlocked()) this.stopSlide();
        }
      } else {
        // normal locomotion
        if (this.dashT <= 0) {
        if (this.grounded) {
          // friction (lighter while steering so top speed can be reached)
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > 0) {
            const fr = wl > 0 ? C.FRICTION_INPUT : C.FRICTION;
            const drop = sp * fr * dt;
            const ns = Math.max(sp - drop, 0);
            const k = ns / sp; this.vel.x *= k; this.vel.z *= k;
          }
          if (wl > 0) this._accelerate(wx, wz, axes.sprint ? C.SPRINT : C.WALK, C.ACCEL_G, dt);
          // footsteps
          this.stepDist += Math.hypot(this.vel.x, this.vel.z) * dt;
          if (this.stepDist > 2.55 && this.grounded) {
            this.stepDist = 0;
            if (ev.step) ev.step();
          }
        } else if (wl > 0) {
          this._accelerate(wx, wz, C.WALK, C.AIR_ACCEL, dt);
        }
        // soft cap carried speed (post-dash bleed)
        const spc = Math.hypot(this.vel.x, this.vel.z);
        if (spc > C.SOFTCAP) {
          const ns = Math.max(C.SOFTCAP, spc - (spc - C.SOFTCAP) * 4 * dt);
          const k = ns / spc; this.vel.x *= k; this.vel.z *= k;
        }
        }
      }

      // ---- gravity ----
      this._lastStage = 'gravity';
      if (this.mode !== 'wallrun' && this.dashT <= 0) {
        this.vel.y -= C.GRAV * dt;
        if (this.vel.y < C.TERMINAL) this.vel.y = C.TERMINAL;
      } else if (this.mode === 'wallrun') {
        this.vel.y -= C.GRAV * 0.1 * dt;
      }

      // ---- integrate + collide ----
      this._lastStage = 'integrate';
      this.wasGrounded = this.grounded;
      this.grounded = false;
      this._lastStage = 'mv-x';
      this._moveAxis('x', this.vel.x * dt);
      this._lastStage = 'mv-z';
      this._moveAxis('z', this.vel.z * dt);
      this._lastStage = 'mv-y';
      this._moveAxis('y', this.vel.y * dt);
      this._lastStage = 'probe';

      // ground probe
      const feet = this.pos.y - this.hy;
      const s = this.world.solids;
      this._lastStage = 'gloop';
      for (let i = 0; i < s.length; i++) {
        const b = s[i];
        if (feet - b.max.y < 0.08 && feet - b.max.y > -0.06 &&
            this.pos.x + this.hx * 0.85 > b.min.x && this.pos.x - this.hx * 0.85 < b.max.x &&
            this.pos.z + this.hx * 0.85 > b.min.z && this.pos.z - this.hx * 0.85 < b.max.z &&
            this.vel.y <= 0.01) {
          this.grounded = true;
          break;
        }
      }

      this._lastStage = 'landed';
      if (this.grounded) {
        this.coyote = C.COYOTE;
        this.airDashUsed = false;
        if (!this.wasGrounded) {
          // landing
          const impact = Math.abs(this.landedVy || 0);
          if (impact > 5.5 && ev.land) ev.land(impact);
          if (axes.slide && Math.hypot(this.vel.x, this.vel.z) > 6 && this.mode === 'normal') {
            this.startSlide();   // slide-landing keeps flow
          }
        }
      } else if (this.wasGrounded && this.vel.y <= 0 && this.mode !== 'wallrun') {
        // walked off an edge
        this.coyote = C.COYOTE;
      }
      this.landedVy = this.vel.y;

      // kill plane
      this._lastStage = 'kill';
      if (this.pos.y < this.world.killY && !this.deathGuard) {
        this.deathGuard = true;
        if (ev.die) ev.die();
      }

      // NaN guard: parkour math must never poison the sim; recover and record where
      this._stage = 'guard';
      if (!Number.isFinite(this.vel.x + this.vel.y + this.vel.z + this.pos.x + this.pos.y + this.pos.z)) {
        if (!this._badStages) this._badStages = [];
        const bad = [
          !Number.isFinite(this.vel.x) && 'vx', !Number.isFinite(this.vel.y) && 'vy', !Number.isFinite(this.vel.z) && 'vz',
          !Number.isFinite(this.pos.x) && 'px', !Number.isFinite(this.pos.y) && 'py', !Number.isFinite(this.pos.z) && 'pz'
        ].filter(Boolean).join('+');
        this._badStages.push((this._lastStage || '?') + '[' + bad + ']');
        if (this._badStages.length > 40) this._badStages.length = 0;
        if (!Number.isFinite(this.pos.x)) this.pos.x = 0;
        if (!Number.isFinite(this.pos.y)) this.pos.y = 5;
        if (!Number.isFinite(this.pos.z)) this.pos.z = 0;
        this.vel.set(0, 0, 0);
      }
    }

    _accelerate(wx, wz, target, accel, dt) {
      const cur = this.vel.x * wx + this.vel.z * wz;
      const add = target - cur;
      if (add <= 0) return;
      const a = Math.min(accel * dt, add);
      this.vel.x += wx * a; this.vel.z += wz * a;
    }

    _moveAxis(axis, delta) {
      if (delta === 0) return;
      this.pos[axis] += delta;
      const s = this.world.solids;
      for (let i = 0; i < s.length; i++) {
        const b = s[i];
        if (!this._overlapsBox(this.pos.x, this.pos.y, this.pos.z, this.hx - 0.001, this.hy - 0.001, b)) continue;
        if (axis === 'y') {
          if (delta < 0) { this.pos.y = b.max.y + this.hy + 0.001; this.vel.y = 0; this.grounded = true; }
          else { this.pos.y = b.min.y - this.hy - 0.001; this.vel.y = Math.min(this.vel.y, 0); }
        } else {
          if (delta > 0) this.pos[axis] = b.min[axis === 'x' ? 'x' : 'z'] - this.hx - 0.001;
          else this.pos[axis] = b.max[axis === 'x' ? 'x' : 'z'] + this.hx + 0.001;
          this.vel[axis] = 0;
        }
      }
    }

    /* ---------- introspection for tests/HUD ---------- */
    snapshot() {
      return {
        pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
        vel: { x: this.vel.x, y: this.vel.y, z: this.vel.z },
        speedH: Math.hypot(this.vel.x, this.vel.z),
        vy: this.vel.y,
        grounded: this.grounded, mode: this.mode, wallSide: this.wallSide,
        halfY: this.hy, charges: this.charges,
        yaw: this.yaw, pitch: this.pitch,
        eyeY: this.pos.y + (this.hy === this.hyStand ? 0.77 : 0.3)
      };
    }
  }

  Player.CONSTANTS = C;
  return Player;
})();
