// player.js — Kaze's momentum-based character controller.
// Fixed 240 Hz substeps => max ~0.4 u movement per step at 95 u/s, far below the
// 0.85 collider radius: no tunneling. Loops & wall-runs emerge from surface
// adhesion gated by speed (v^2 >= g*r physically decides loop completion).
import * as THREE from 'three';
import { makeContacts } from '../engine/physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const G = 30;

const P = {
  radius: 0.85,
  accel: 42,
  boostAccel: 92,
  airAccel: 19,
  softCap: 41,
  boostCap: 80,
  jumpV: 15.6,
  jumpHold: 0.24,
  jumpHoldAccel: 34,
  frictionIdle: 7,
  frictionBrake: 60,
  stickWallMinSpeed: 14.5,
  wallRunMax: 3.2,
  turnLow: 15, turnHigh: 2.6,
  diveSpeed: 52,
};

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = P.radius;
    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpHeld = 0;
    this.airTime = 0;
    this.wallTime = 0;
    this.yaw = 0;
    this.turnLean = 0;
    this.landT = 0;
    this.boosting = false;
    this.boostMeter = 50;
    this.drifting = false; this.driftDir = 0;
    this.hearts = 3; this.invulnT = 0;
    this.rail = null; this.railCooldown = 0;
    this.dive = { active: false, t: 0, target: null };
    this.diveCd = 0;
    this.stepCd = 0;
    this.checkpoint = new THREE.Vector3();
    this.cpYaw = 0;
    this.platform = null;

    // QA / scoring telemetry
    this.stats = { maxSpeed: 0, grindTime: 0, jumps: 0, springsHit: 0, panelsHit: 0, dives: 0, divesHit: 0, falls: 0, hitsTaken: 0 };
    this.combo = 0; this.comboT = 0;

    this._contacts = makeContacts(20);
    this._tmp1 = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._tmp3 = new THREE.Vector3();
    this._qaFlag = {};
  }

  spawnAt(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.grounded = false; this.rail = null;
    this.dive.active = false; this.checkpoint.copy(p); this.cpYaw = yaw;
    this.landT = 0;
  }

  get speed() { return this.vel.length(); }
  get horizSpeed() { const v = this.vel; return Math.hypot(v.x, v.z); }
  isAttacking() {
    return this.boosting || this.dive.active || (!this.grounded && this.vel.y < -3.5);
  }

  /* ============================ main sim ============================ */
  step(dt, input, camYaw) {
    const world = this.game.world;
    const lvl = this.game.level;

    // ride moving platforms
    if (this.platform && this.grounded) this.pos.add(this.platform.frameDelta);

    // wind gust zones
    for (const gz of lvl.gusts) {
      if (this.pos.x > gz.min.x && this.pos.x < gz.max.x &&
        this.pos.y > gz.min.y && this.pos.y < gz.max.y &&
        this.pos.z > gz.min.z && this.pos.z < gz.max.z) {
        this.vel.x += gz.f.x * dt; this.vel.y += gz.f.y * dt; this.vel.z += gz.f.z * dt;
        if (Math.random() < dt * 20) {
          this.game.fx.emit(this.pos.x, this.pos.y, this.pos.z,
            gz.f.x * .3, gz.f.y * .3 + 1, gz.f.z * .3,
            { color: '#bfe8ff', life: .4, size: .5, gravity: 0 });
        }
      }
    }

    // ---------- timers ----------
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.stepCd = Math.max(0, this.stepCd - dt);
    this.diveCd = Math.max(0, this.diveCd - dt);
    this.railCooldown = Math.max(0, this.railCooldown - dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (this.jumpHeld > 0) this.jumpHeld -= dt;

    // ---------- input ----------
    const inY = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const inX = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const hasInput = inX !== 0 || inY !== 0;
    // camera-relative basis (horizontal)
    const cf = this._tmp1.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    const cr = this._tmp2.set(-cf.z, 0, cf.x);   // screen-right (non-inverted: D -> right)
    const wish = this._tmp3.set(0, 0, 0).addScaledVector(cf, inY).addScaledVector(cr, inX);
    if (wish.lengthSq() > 1) wish.normalize();

    if (input.justPressed('Space')) this.jumpBuf = 0.13;

    // ---------- rail grinding ----------
    if (this.rail) {
      this._railStep(dt, input);
      this.stats.maxSpeed = Math.max(this.stats.maxSpeed, this.speed);
      return;
    }

    // ---------- Zephyr Strike ----------
    if ((input.justPressed('KeyF') || input.justPressed('MouseLeft')) && !this.grounded && this.diveCd <= 0) {
      const target = this.game.findDiveTarget(this.pos, camYaw);
      this.dive.active = true; this.dive.t = 1.25; this.dive.target = target;
      this.diveCd = 0.9; this.stats.dives++;
      this.game.audio.dive();
    }
    if (this.dive.active) {
      this.dive.t -= dt;
      if (this.dive.target && this.dive.target.alive) {
        const to = this._tmp1.copy(this.dive.target.pos).sub(this.pos);
        const d = to.length();
        if (d < 1.9) {
          this.game.killEnemy(this.dive.target, 'dive');
          this.stats.divesHit++;
          this.bounce(13.5);
          this.dive.active = false;
        } else {
          to.normalize().multiplyScalar(P.diveSpeed);
          this.vel.copy(to);
          if (d > 26) this.dive.active = false;
        }
      } else {
        // free-dive lunge along view (slight downward bias)
        const pitch = 0.25;
        const vf = this._tmp2.set(
          Math.sin(camYaw) * Math.cos(pitch),
          -Math.sin(pitch),
          Math.cos(camYaw) * Math.cos(pitch));
        if (this.dive.t > 0.9 && this.speed < 56) this.vel.addScaledVector(vf.normalize(), 190 * dt);
      }
      if (this.dive.t <= 0) this.dive.active = false;
    }

    // ---------- boost ----------
    const wantBoost = input.down('ShiftLeft') || input.down('ShiftRight');
    this.boosting = wantBoost && this.boostMeter > 0 && (hasInput || this.horizSpeed > 12);
    if (this.boosting) {
      this.boostMeter = Math.max(0, this.boostMeter - 27 * dt);
      this.game.audio.boostLoop(THREE.MathUtils.clamp(this.speed / 80, 0, 1));
    }

    // ---------- quick-step dodge ----------
    if ((input.justPressed('KeyQ') || input.justPressed('KeyE')) && this.stepCd <= 0) {
      const side = input.justPressed('KeyQ') ? -1 : 1;
      const lat = this._tmp1.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).multiplyScalar(side * 17);
      this.vel.addScaledVector(lat, 1);
      this.stepCd = 0.38;
      this.game.fx.burst(this.pos, 6, { color: '#9ff3ea', speed: 4, life: .35, size: .4 });
    }

    // ---------- drift ----------
    const canDrift = this.grounded && (input.down('KeyC')) && this.horizSpeed > 11 && inX !== 0;
    if (canDrift) {
      if (!this.drifting) { this.drifting = true; this.driftDir = inX; }
      this.driftDir = inX || this.driftDir;
      this.boostMeter = Math.min(100, this.boostMeter + 17 * dt);
    } else this.drifting = false;

    // ---------------- acceleration phase ----------------
    if (this.grounded) {
      const n = this.groundNormal;
      // project wish onto surface
      const wT = this._tmp1.copy(wish).addScaledVector(n, -wish.dot(n));
      const vT = this._tmp2.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
      const sp = vT.length();

      // steering: rotate velocity toward wish
      if (hasInput && wT.lengthSq() > 0.01) {
        const des = wT.clone().normalize();
        if (sp > 0.6) {
          const cur = vT.clone().normalize();
          const turnRate = THREE.MathUtils.lerp(P.turnLow, P.turnHigh, THREE.MathUtils.clamp(sp / 46, 0, 1))
            * (this.drifting ? 2.15 : 1);
          const ang = this._signedAngle(cur, des, n);
          const maxA = turnRate * dt;
          const applied = THREE.MathUtils.clamp(ang, -maxA, maxA);
          vT.applyAxisAngle(n, applied); // rotate velocity toward desired dir
          this.turnLean = THREE.MathUtils.clamp(ang * 2.2, -1, 1);
        } else {
          vT.copy(des).multiplyScalar(sp);
          this.turnLean = 0;
        }
        // traction accel
        const acc = this.boosting ? P.boostAccel : P.accel;
        vT.addScaledVector(des, acc * dt);
      } else {
        // friction
        const fr = (inY < 0 ? P.frictionBrake : P.frictionIdle) * dt * (this.drifting ? 0.4 : 1);
        const ns = Math.max(0, sp - fr * (inY < 0 ? 3 : 1));
        if (sp > 0.001) vT.multiplyScalar(ns / sp);
        this.turnLean *= Math.max(0, 1 - dt * 6);
      }

      // slope force (downhill accel / uphill brake emerges naturally)
      const gSlope = this._tmp3.copy(UP).multiplyScalar(-G).addScaledVector(n, G * n.dot(UP));
      vT.addScaledVector(gSlope, dt);

      // rebuild velocity
      this.vel.copy(vT).addScaledVector(n, this.vel.dot(n));

      // soft speed cap w/ quadratic-feel drag
      const cap = this.boosting ? P.boostCap : P.softCap;
      const s2 = this.vel.length();
      if (s2 > cap) this.vel.multiplyScalar(1 - Math.min(1, ((s2 - cap) / s2) * 3.2 * dt));

      // jump
      if (this.jumpBuf > 0) {
        this.jumpBuf = 0;
        this.vel.addScaledVector(UP, P.jumpV);
        this.vel.addScaledVector(this._tmp1.copy(this.vel).setY(0).normalize(), 1.6);
        this.grounded = false;
        this.coyote = 0;
        this.jumpHeld = P.jumpHold;
        this.stats.jumps++;
        this.game.onJump(this.pos);
      }
    } else {
      // ---------------- air control ----------------
      this.airTime += dt;
      if (this.jumpHeld > 0 && input.down('Space') && this.vel.y > 0) this.vel.y += P.jumpHoldAccel * dt;
      if (hasInput) {
        const before = Math.hypot(this.vel.x, this.vel.z);
        this.vel.addScaledVector(wish, P.airAccel * dt * (this.dive.active ? 0 : 1));
        const after = Math.hypot(this.vel.x, this.vel.z);
        const lim = Math.max(before, 32);
        if (after > lim) { const k = lim / after; this.vel.x *= k; this.vel.z *= k; }
      }
      this.vel.y -= G * dt;
    }

    // adhesion while grounded (holds through loops/walls; physical gate via speed)
    if (this.grounded) {
      const sp = this.speed;
      const stick = THREE.MathUtils.clamp(sp * sp * 0.10, 18, 62);
      this.vel.addScaledVector(this.groundNormal, -stick * dt);
    }

    // ---------- integrate ----------
    this.pos.addScaledVector(this.vel, dt);

    // ---------- collide static world ----------
    const wasGrounded = this.grounded;
    let floorN = null, floorDot = -2, steepN = null, steepSpeedOK = false;
    const n = world.collideSphere(this.pos, this.radius, this._contacts);
    for (let i = 0; i < n; i++) {
      const c = this._contacts[i];
      this.pos.x += c.nx * c.depth; this.pos.y += c.ny * c.depth; this.pos.z += c.nz * c.depth;
      const vn = this.vel.x * c.nx + this.vel.y * c.ny + this.vel.z * c.nz;
      if (vn < 0) {
        const dUp = c.ny;
        if (dUp > 0.52) {
          this.vel.x -= c.nx * vn; this.vel.y -= c.ny * vn; this.vel.z -= c.nz * vn;
        } else if (dUp > -0.35) {
          // wall: slide + hard-hit feedback
          const impact = -vn;
          this.vel.x -= c.nx * vn * 1.06; this.vel.y -= c.ny * vn * 1.06; this.vel.z -= c.nz * vn * 1.06;
          if (impact > 30) {
            this.game.onHardImpact(this.pos, impact);
            this.vel.multiplyScalar(0.72);
          }
        } else {
          this.vel.x -= c.nx * vn; this.vel.y -= c.ny * vn; this.vel.z -= c.nz * vn;
        }
      }
      if (c.ny > floorDot) { floorDot = c.ny; if (c.ny > 0.52) floorN = c; }
      if (c.ny <= 0.52 && c.ny > -0.35) { steepN = c; steepSpeedOK = this.speed > P.stickWallMinSpeed; }
    }

    // ---------- moving platforms ----------
    this.platform = null;
    for (const mp of lvl.movingPlatforms) {
      if (mp.sphereCollide(this.pos, this.radius, this._contacts, 4)) {
        // resolve like floor contacts
        for (let i = 0; i < 4; i++) {
          const c = this._contacts[i];
          if (c.depth <= 0) continue;
          this.pos.x += c.nx * c.depth; this.pos.y += c.ny * c.depth; this.pos.z += c.nz * c.depth;
          const vn = this.vel.dot(this._tmp1.set(c.nx, c.ny, c.nz)) - mp.vel.dot(this._tmp1);
          if (vn < 0) { this.vel.addScaledVector(this._tmp1.set(c.nx, c.ny, c.nz), -vn); }
          if (c.ny > 0.52) { floorN = { nx: c.nx, ny: c.ny, nz: c.nz }; floorDot = c.ny; this.platform = mp; }
        }
      }
    }

    // ---------- step-up assist ----------
    // If a hard impact just killed horizontal speed but walkable ground sits a
    // small step above/ahead (seams, lips, curbs), pop up onto it seamlessly.
    if (!floorN && steepN && this._preSpeed - this.speed > 18 && this.groundNormal.dot(UP) > 0.4) {
      const fwd = this._tmp1.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const probe = this._tmp2.copy(this.pos).addScaledVector(fwd, this.radius * 1.4).addScaledVector(UP, 0.6);
      const hit = world.raycast(probe, this._tmp3.set(0, -1, 0), 2.2);
      if (hit && hit.normal.dot(UP) > 0.5 && hit.point.y > this.pos.y - this.radius + 0.05 && hit.point.y < this.pos.y + 1.1) {
        this.pos.set(hit.point.x, hit.point.y + this.radius * 1.01, hit.point.z);
        this.vel.addScaledVector(fwd, 4);
        this.grounded = true;
        this.groundNormal.copy(hit.normal);
        floorN = { nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z };
      }
    }

    // ---------- ground state ----------
    if (floorN) {
      if (!wasGrounded && this.airTime > 0.08) { this.landT = 0.16; this.game.onLand(this.pos, this.speed); }
      this.grounded = true;
      this.groundNormal.set(floorN.nx, floorN.ny, floorN.nz);
      this.airTime = 0; this.wallTime = 0; this.coyote = 0.13;
    } else if (steepN && (wasGrounded || this.airTime === 0) && steepSpeedOK && this.wallTime < P.wallRunMax
      && (inY > 0 || this.drifting || this.rail !== null)) {
      // stay attached: loops + deliberate wall-running
      this.grounded = true;
      this.groundNormal.set(steepN.nx, steepN.ny, steepN.nz);
      this.wallTime += dt;
      this.coyote = 0.1;
    } else if (wasGrounded && !floorN) {
      // try snapping down slopes/crests
      const down = this._tmp1.copy(this.groundNormal).multiplyScalar(-1);
      const hit = world.raycast(this.pos, down, this.radius + 0.55);
      if (hit && this.vel.dot(hit.normal) <= 2) {
        this.pos.copy(hit.point).addScaledVector(hit.normal, this.radius * 0.99);
        this.groundNormal.copy(hit.normal);
        this.coyote = 0.13;
      } else {
        this.grounded = false;
      }
    } else {
      this.grounded = false;
    }

    // ---------- rail attach ----------
    if (!this.rail && this.railCooldown <= 0) {
      lvl.tryAttachRail(this);
    }

    // ---------- kill plane ----------
    if (this.pos.y < lvl.killY) {
      this.stats.falls++;
      this.game.respawnPlayer(false);
    }

    // ---------- visual facing follows travel ----------
    {
      let fy;
      if (this.rail) {
        const t = this.rail.data.tangentAt(this.rail.s, this._tmp1);
        fy = Math.atan2(t.x * this.rail.dir, t.z * this.rail.dir);
      } else if (this.horizSpeed > 3) {
        fy = Math.atan2(this.vel.x, this.vel.z);
      } else if (hasInput && wish.lengthSq() > 0.01) {
        fy = Math.atan2(wish.x, wish.z);
      } else fy = this.yaw;
      let dyaw = fy - this.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const rate = (this.drifting ? 6.5 : 13) * dt;
      this.yaw += THREE.MathUtils.clamp(dyaw, -rate, rate);
    }

    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, this.speed);
  }

  _signedAngle(a, b, axis) {
    const cross = this._tmp3.crossVectors(a, b);
    const sin = cross.dot(axis);
    const cos = a.dot(b);
    return Math.atan2(sin, cos);
  }

  pitchAssist() { return 0; }

  bounce(vy) {
    this.vel.y = Math.max(this.vel.y * 0.2, 0) + vy;
    this.grounded = false;
    this.dive.active = false;
  }

  hurt(sourcePos) {
    if (this.invulnT > 0) return false;
    this.hearts--;
    this.stats.hitsTaken++;
    this.invulnT = 1.7;
    const away = this._tmp1.copy(this.pos).sub(sourcePos).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();
    this.vel.copy(away).multiplyScalar(14); this.vel.y = 9;
    this.grounded = false;
    this.boosting = false;
    this.combo = 0;
    if (this.hearts <= 0) { this.game.respawnPlayer(true); }
    return true;
  }

  grantBoost(v) { this.boostMeter = Math.min(100, this.boostMeter + v); }
  bumpCombo() { this.combo++; this.comboT = 2.2; }

  /* ============================ rails ============================ */
  _railStep(dt, input) {
    const r = this.rail;
    const data = r.data;
    this.stats.grindTime += dt;
    // tangent along travel
    const tan = data.tangentAt(r.s, this._tmp1).multiplyScalar(r.dir);
    // gravity along rail + friction
    r.speed += (-tan.y * G) * dt * 0.92;
    r.speed -= r.speed * 0.045 * dt;
    r.speed = Math.max(r.speed, 8);
    r.s += r.speed * dt * r.dir;
    if (r.s <= 0.01 || r.s >= data.length - 0.01) {
      // fly off the end
      this.detachRail(true);
      return;
    }
    data.pointAt(r.s, this.pos);
    this.pos.y += this.radius * 0.95;
    this.vel.copy(tan).multiplyScalar(r.speed);
    this.grounded = true;
    this.groundNormal.set(0, 1, 0);

    if (input.justPressed('Space')) {
      this.detachRail(false);
      this.vel.y = Math.max(this.vel.y, 0) + P.jumpV * 0.88;
      this.stats.jumps++;
      this.grantBoost(6);
      this.game.onTrick('RAIL JUMP');
      this.game.audio.jump();
    }
    // occasional grind spark fx
    if (Math.random() < dt * 30) {
      this.game.fx.emit(this.pos.x, this.pos.y - this.radius * 0.8, this.pos.z,
        (Math.random() - .5) * 3, Math.random() * 2, (Math.random() - .5) * 3,
        { color: '#ffd166', life: .4, size: .45, gravity: 10 });
      this.game.audio.grindTick();
    }
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, this.speed);
  }

  attachRail(data, s, dir) {
    this.rail = { data, s, dir, speed: Math.max(this.horizSpeed * 0.9 + 6, 20) };
    this.dive.active = false;
    this.game.audio.railStart();
    this.game.onTrick('GRIND');
    this.stats.grindStarts = (this.stats.grindStarts || 0) + 1;
  }
  detachRail(flyOff) {
    const r = this.rail;
    this.rail = null;
    this.railCooldown = 0.45;
    this.grounded = false;
    if (flyOff) this.game.onTrick('LAUNCH');
    void r;
  }
}
