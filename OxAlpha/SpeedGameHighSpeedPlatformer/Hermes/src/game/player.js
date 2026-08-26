import * as THREE from 'three';
import { TUNE } from './gamedata.js';
import { Character } from './character.js';
import { clamp, lerp, damp } from './mathutil.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();

// Momentum-based high-speed character controller (sphere collider).
// States: ground | air | rail | wall | chain | stomp | dead
export class Player {
  constructor(world, hooks = {}) {
    this.world = world;
    this.hooks = hooks;             // {fx, audio, findChainTarget, onEvent}
    this.r = TUNE.playerR;

    this.pos = new THREE.Vector3(0, 5, 0);
    this.vel = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.heading = new THREE.Vector3(0, 0, 1);
    this.state = 'air';
    this.stateTime = 0;
    this.grounded = false;

    // input basis (camera-relative)
    this.camFwd = new THREE.Vector3(0, 0, 1);
    this.camRight = new THREE.Vector3(1, 0, 0);

    // meters
    this.speed = 0;
    this.boostMeter = 50;
    this.boosting = false;
    this.panelTimer = 0;
    this.panelPower = 0;
    this.driftCharge = 0;
    this.driftSpillT = 0;

    // timers
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpHoldT = 99;
    this.airJumps = 1;
    this.invuln = 0;
    this.stepCoolL = 0; this.stepCoolR = 0;
    this.stepVel = new THREE.Vector3();

    // wall
    this.wallN = new THREE.Vector3();

    // rail
    this.rail = null;
    this.railDist = 0;
    this.railSpeed = 0;

    // chain
    this.chainTarget = null;

    // mover riding
    this.rideMover = null;

    // visual
    this.char = new Character();
    this.facingYaw = 0;
    this.trailPts = [];
    this.deadTimer = 0;
    this.spawnPoint = new THREE.Vector3(0, 5, 0);
    this.spawnYaw = 0;
    this.lastLandImpact = 0;

    this.input = null;              // assigned by game
    this.enabled = true;
  }

  addTo(scene) { scene.add(this.char.root); scene.add(this.char.disc); }

  removeFrom(scene) { scene.remove(this.char.root); scene.remove(this.char.disc); }

  get horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  spawn(pos, yaw = 0) {
    this.pos.copy(pos); this.pos.y += this.r + 0.05;
    this.spawnPoint.copy(pos); this.spawnPoint.y += this.r + 0.05;
    this.spawnYaw = yaw;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.up.set(0, 1, 0);
    this.heading.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.state = 'air';
    this.grounded = false;
    this.boostMeter = Math.max(this.boostMeter, 50);
    this.rail = null; this.chainTarget = null; this.rideMover = null;
    this.facingYaw = yaw;
    this.invuln = 1;
  }

  respawn() {
    this.spawn(this._tmpSpawn || this.spawnPoint, this.spawnYaw);
    this.state = 'air';
    this.deadTimer = 0;
  }

  // ---------------- main physics step (fixed h) ----------------
  step(h, wishWorld) {
    const t = this;
    t.stateTime += h;
    t.invuln = Math.max(0, t.invuln - h);
    t.jumpBuf = Math.max(0, t.jumpBuf - h);
    t.coyote = Math.max(0, t.coyote - h);
    t.stepCoolL = Math.max(0, t.stepCoolL - h);
    t.stepCoolR = Math.max(0, t.stepCoolR - h);
    t.panelTimer = Math.max(0, t.panelTimer - h);

    // ride platform delta
    if (t.rideMover && t.grounded) {
      t.pos.add(t.rideMover.delta);
    }
    t.rideMover = null;

    switch (t.state) {
      case 'ground': this._groundStep(h, wishWorld); break;
      case 'air': this._airStep(h, wishWorld); break;
      case 'rail': this._railStep(h); break;
      case 'wall': this._wallStep(h, wishWorld); break;
      case 'chain': this._chainStep(h); break;
      case 'stomp': this._stompStep(h); break;
      case 'dead': this.deadTimer -= h; return;
    }

    // integrate + collide
    t.pos.addScaledVector(t.vel, h);
    t.pos.addScaledVector(t.stepVel, h);
    t.stepVel.multiplyScalar(Math.exp(-9 * h));

    const contacts = [];
    t.world.resolveSphere(t.pos, t.r, contacts);

    let landed = false;
    for (const c of contacts) {
      const ndotup = c.normal.dot(t.up);
      const vn = t.vel.dot(c.normal);
      if (ndotup > 0.62) {
        // floor-ish contact
        if (!t.grounded && t.state !== 'rail' && t.state !== 'dead' && vn < -1.5) landed = true;
        if (vn < 0) t.vel.addScaledVector(c.normal, -vn);
        t.grounded = true;
        if (t.state === 'air') this._land(c.normal);
      } else if (ndotup < -0.45) {
        if (vn > 0) t.vel.addScaledVector(c.normal, -vn); // ceiling
      } else {
        // wall contact: slide
        if (vn < 0) t.vel.addScaledVector(c.normal, -vn);
        if (t.state === 'chain') { this._chainImpact(null, c.normal); }
      }
    }
    if (landed) { /* already handled in loop */ }
  }

  _enterGround(normal) {
    this.state = 'ground';
    this.grounded = true;
    this.up.copy(normal);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.heading.set(this.vel.x, 0, this.vel.z);
    if (this.heading.lengthSq() < 0.01) this.heading.set(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw));
    this.heading.projectOnPlane(this.up).normalize();
    this.vel.copy(this.heading).multiplyScalar(this.speed);
    this.airJumps = 1;
    this.driftCharge = 0;
  }

  _land(normal) {
    const impact = Math.max(0, -this.vel.dot(normal));
    this.lastLandImpact = impact;
    this._enterGround(normal);
    this.hooks.onEvent && this.hooks.onEvent('land', { impact });
  }

  // ---------------- GROUND ----------------
  _groundStep(h, wish) {
    const t = this;

    // stick probe
    _v1.copy(t.pos).addScaledVector(t.up, 0.25);
    _v2.copy(t.up).negate();
    const stickLen = t.r + 0.55 + Math.abs(t.speed) * h * 2.4;
    const hit = t.world.groundProbe(_v1, _v2, stickLen);
    if (!hit || hit.normal.dot(t.up) < 0.32) {
      // left the ground (crest / edge / loop flip w/o speed)
      if (hit && hit.normal.dot(t.up) < 0.32 && t.speed < 24 && hit.normal.dot(UP) < -0.15) {
        t._toAir(); return;
      }
      t._toAir(); return;
    }
    const n = hit.normal;
    // reorient up smoothly (loops!)
    t.up.lerp(n, 1 - Math.exp(-20 * h)).normalize();
    // snap to surface
    t.pos.copy(hit.point).addScaledVector(t.up, t.r * 1.001);

    // slope acceleration (gravity projected on plane)
    _v3.set(0, -TUNE.gravity * TUNE.slopeAccel, 0);
    _v3.addScaledVector(t.up, -_v3.dot(t.up));
    // heading on current plane
    t.heading.projectOnPlane(t.up).normalize();
    t.vel.copy(t.heading).multiplyScalar(t.speed);

    const drifting = t.input && t.input.drift && t.speed > 8;
    // steering
    if (wish.lengthSq() > 0.01) {
      _v4.copy(wish).projectOnPlane(t.up).normalize();
      if (_v4.lengthSq() > 0.01) {
        const ang = Math.atan2(
          _v1.crossVectors(t.heading, _v4).dot(t.up),
          t.heading.dot(_v4)
        );
        const turnRate = lerp(TUNE.turnRateLow, TUNE.turnRateHigh, clamp(t.speed / TUNE.boostMax, 0, 1))
          * (drifting ? TUNE.driftTurnMul : 1);
        const dAng = clamp(ang, -turnRate * h, turnRate * h);
        t.heading.applyAxisAngle(t.up, dAng).normalize();
        const align = Math.cos(dAng);
        if (ang > 2.2) {
          // hard reverse input -> brake
          t.speed = Math.max(0, t.speed - TUNE.brake * 0.7 * h);
        } else if (align > 0.55) {
          t.speed += TUNE.runAccel * align * h;
        } else {
          t.speed += TUNE.runAccel * 0.35 * h;
        }
        t.driftSpillT = drifting ? 0.12 : Math.max(0, t.driftSpillT - h);
      }
    } else {
      t.speed -= (Math.abs(t.speed) * 0.06 + (t.input && t.input.brakeHard ? TUNE.brake : TUNE.friction)) * h;
      if (t.speed < 0) t.speed = 0;
      t.driftSpillT = 0;
    }

    // drift mechanics
    if (drifting && wish.lengthSq() > 0.01) {
      t.speed -= TUNE.driftDecel * h * (t.speed > 30 ? 0.4 : 1);
      t.driftCharge += h * clamp(t.speed / 30, 0, 1.4);
    } else if (t.driftCharge > 0) {
      const miniBoost = clamp(t.driftCharge * 14, 0, 14);
      if (miniBoost > 3 && t.speed > 10) {
        t.speed += miniBoost;
        t.hooks.onEvent && t.hooks.onEvent('driftBoost', { power: miniBoost });
      }
      t.driftCharge = 0;
    }

    // boost
    t.boosting = t.input && t.input.boost && t.boostMeter > 0 && wish.lengthSq() > 0.01;
    if (t.boosting) {
      t.boostMeter = Math.max(0, t.boostMeter - TUNE.boostDrain * h);
      t.speed += (TUNE.boostMax + 4 - t.speed) * clamp(TUNE.boostAccel * h / TUNE.boostMax, 0, 1);
    }

    // dash panel floor speed
    if (t.panelTimer > 0 && t.speed < t.panelPower) {
      t.speed += 90 * h;
      if (t.speed > t.panelPower) t.speed = t.panelPower;
    }

    // overspeed decay toward allowed cap
    const cap = t.boosting ? TUNE.boostMax + 4 : (t.panelTimer > 0 ? Math.max(TUNE.runMax, t.panelPower) : TUNE.runMax);
    if (t.speed > cap && !(drifting && t.speed < cap + 16)) {
      t.speed = Math.max(cap, t.speed - (t.speed - cap) * 1.4 * h - 6 * h);
    }

    t.vel.copy(t.heading).multiplyScalar(t.speed).addScaledVector(_v3, 0);

    // jumping
    if (t.input) {
      if (t.input.jumpHit) t.jumpBuf = TUNE.jumpBuffer;
      if (t.jumpBuf > 0 && (t.grounded || t.coyote > 0)) {
        this._doJump();
        return;
      }
      // quick-steps
      if (t.input.stepLeft && t.stepCoolL <= 0) { this._quickStep(-1); t.stepCoolL = TUNE.quickStepCooldown; }
      if (t.input.stepRight && t.stepCoolR <= 0) { this._quickStep(1); t.stepCoolR = TUNE.quickStepCooldown; }
      if (t.input.spinHit) this._spinAttack();
    }
    // remember mover under feet
    if (hit.mover) t.rideMover = hit.mover;
  }

  _doJump() {
    const t = this;
    t.jumpBuf = 0; t.coyote = 0;
    t.vel.addScaledVector(t.up, TUNE.jumpVel);
    t.jumpHoldT = 0;
    t.airJumps = 1;
    t.grounded = false;
    t.state = 'air';
    t.stateTime = 0;
    t.char.squash(1.22);
    t.hooks.onEvent && t.hooks.onEvent('jump', {});
  }

  _quickStep(sideSign) {
    const t = this;
    _v1.crossVectors(t.up, t.heading).normalize().multiplyScalar(sideSign * TUNE.quickStepSpeed);
    t.stepVel.add(_v1);
    t.hooks.onEvent && t.hooks.onEvent('quickstep', { side: sideSign });
  }

  _spinAttack() {
    const t = this;
    t.vel.addScaledVector(t.up, TUNE.spinHop * 0.4);
    t.speed += 4;
    t.hooks.onEvent && t.hooks.onEvent('spin', {});
  }

  _toAir() {
    this.state = 'air';
    this.grounded = false;
    this.stateTime = 0;
    this.coyote = TUNE.coyote;
    // preserve momentum as free velocity
    if (this.speed > 0) this.vel.copy(this.heading).multiplyScalar(this.speed);
  }

  // ---------------- AIR ----------------
  _airStep(h, wish) {
    const t = this;
    t.grounded = false;
    const rising = t.vel.dot(UP) > 0;
    let g = TUNE.gravity;
    if (rising && t.input && t.input.jump && t.jumpHoldT < TUNE.jumpHoldTime) g *= TUNE.jumpHoldGravMul;
    t.jumpHoldT += h;
    if (t.input && t.input.moveZ < 0 && t.vel.y < 0) g += TUNE.fastFall;
    t.vel.y -= g * h;

    // air control (cannot exceed existing momentum or airMaxGain)
    if (wish.lengthSq() > 0.01) {
      _v1.copy(wish); _v1.y = 0; _v1.normalize();
      const hs0 = Math.hypot(t.vel.x, t.vel.z);
      t.vel.x += _v1.x * TUNE.airAccel * h;
      t.vel.z += _v1.z * TUNE.airAccel * h;
      const hs1 = Math.hypot(t.vel.x, t.vel.z);
      const hsCap = Math.max(hs0, TUNE.airMaxGain);
      if (hs1 > hsCap) { const f = hsCap / hs1; t.vel.x *= f; t.vel.z *= f; }
    }

    // actions
    if (t.input) {
      if (t.input.jumpHit) {
        const target = t.hooks.findChainTarget && t.hooks.findChainTarget(t.pos, t.vel, TUNE.chainDashRadius);
        if (target) this._startChain(target);
        else if (t.airJumps > 0) {
          t.airJumps--;
          t.vel.y = TUNE.jumpVel * 0.92;
          t.jumpHoldT = 0;
          t.char.squash(1.18);
          t.hooks.onEvent && t.hooks.onEvent('doubleJump', {});
        }
      }
      if (t.input.driftHit) this._startStomp();
      if (t.input.stepLeft && t.stepCoolL <= 0) { this._quickStep(-1); t.stepCoolL = TUNE.quickStepCooldown; }
      if (t.input.stepRight && t.stepCoolR <= 0) { this._quickStep(1); t.stepCoolR = TUNE.quickStepCooldown; }
    }

    // wall-run detection
    if (this._tryWallAttach(wish)) return;

    // landing probe
    const vy = t.vel.y;
    if (vy <= 0.01) {
      _v1.copy(t.pos);
      _v2.set(0, -1, 0);
      const len = t.r + Math.max(0.14, -vy * h * 2.2);
      const hit = t.world.groundProbe(_v1, _v2, len);
      if (hit && hit.normal.dot(UP) > 0.5) {
        t.pos.copy(hit.point).addScaledVector(hit.normal, t.r * 1.002);
        if (hit.mover) t.rideMover = hit.mover;
        this._land(hit.normal);
      }
    }
  }

  // ---------------- WALL RUN ----------------
  _tryWallAttach(wish) {
    const t = this;
    if (!(t.input && t.input.moveZ > 0)) return false;
    const hs = Math.hypot(t.vel.x, t.vel.z);
    if (hs < TUNE.wallRunMinSpeed) return false;
    if (t.vel.y < -22) return false;
    _v1.set(t.vel.x, 0, t.vel.z).normalize();
    _v2.crossVectors(UP, _v1).normalize(); // right side
    for (const side of [1, -1]) {
      _v3.copy(_v2).multiplyScalar(side);
      const hit = t.world.raycast(t.pos, _v3, t.r + 0.72, true);
      if (hit && Math.abs(hit.normal.y) < 0.42 && hit.normal.dot(_v3) < -0.4) {
        // attach
        t.state = 'wall'; t.stateTime = 0;
        t.wallN.copy(hit.normal);
        t.pos.copy(hit.point).addScaledVector(hit.normal, t.r * 1.02);
        // velocity along wall
        t.vel.projectOnPlane(hit.normal);
        const along = _v4.copy(t.vel).setY(0);
        if (along.lengthSq() < 4) along.copy(_v1);
        along.normalize();
        t.vel.copy(along).multiplyScalar(hs);
        t.vel.y = Math.max(t.vel.y, hs * 0.12);
        t.airJumps = 1;
        t.wallSide = side;
        t.hooks.onEvent && t.hooks.onEvent('wallrun', { side });
        return true;
      }
    }
    return false;
  }

  _wallStep(h, wish) {
    const t = this;
    t.stateTime += 0; // handled below
    // check wall still there
    _v1.copy(t.wallN).negate();
    const hit = t.world.raycast(t.pos, _v1, t.r + 0.65, true);
    const hs = t.vel.length();
    const expired = t.stateTime > TUNE.wallRunTime;
    if (!hit || expired || hs < 8 || (t.input && t.input.moveZ < 0)) {
      t._toAir(); t.coyote = 0.08; return;
    }
    // slight climb assist
    t.vel.y += 3.5 * h;
    t.vel.y -= 6.5 * h; // mild gravity so arcs droop
    // stick to wall
    t.pos.copy(hit.point).addScaledVector(hit.normal, t.r * 1.02);
    t.wallN.lerp(hit.normal, 0.4).normalize();
    // steer along wall with A/D
    if (wish.lengthSq() > 0.01) {
      _v2.crossVectors(t.wallN, UP).normalize();
      const sideDot = wish.dot(_v2);
      t.vel.addScaledVector(_v2, sideDot * 26 * h);
      const sp = t.vel.length(); const maxs = Math.max(hs, TUNE.runMax);
      if (sp > maxs) t.vel.multiplyScalar(maxs / sp);
    }
    if (t.input) {
      if (t.input.jumpHit) {
        // wall jump
        _v2.copy(t.vel); _v2.y = 0;
        const along = _v2.length() > 0.5 ? _v2.normalize() : _v3.set(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw));
        t.vel.copy(along).multiplyScalar(Math.max(hs * 0.75, 12))
          .addScaledVector(t.wallN, TUNE.wallJumpOut)
          .addScaledVector(UP, TUNE.wallJumpUp);
        t.state = 'air'; t.stateTime = 0; t.airJumps = 1;
        t.hooks.onEvent && t.hooks.onEvent('walljump', {});
        return;
      }
    }
  }

  // ---------------- CHAIN DASH ----------------
  _startChain(target) {
    const t = this;
    t.state = 'chain'; t.stateTime = 0;
    t.chainTarget = target;
    t.hooks.onEvent && t.hooks.onEvent('chainStart', { target });
  }

  _chainStep(h) {
    const t = this;
    const tgt = t.chainTarget;
    if (!tgt || !tgt.alive) { t._toAir(); t.vel.multiplyScalar(0.5); return; }
    _v1.copy(tgt.pos).sub(t.pos);
    const dist = _v1.length();
    if (dist < 1.8 || t.stateTime > 0.9) {
      this._chainImpact(tgt.alive ? tgt : null);
      return;
    }
    _v1.divideScalar(dist);
    t.vel.copy(_v1).multiplyScalar(TUNE.chainDashSpeed);
  }

  _chainImpact(target, wallNormal = null) {
    const t = this;
    t.state = 'air'; t.stateTime = 0;
    t.airJumps = 1;
    if (target) {
      t.vel.multiplyScalar(0.25);
      t.vel.y = Math.abs(t.vel.y) + 17;
      t.hooks.onEvent && t.hooks.onEvent('chainHit', { target });
      t.char.squash(0.78);
    } else {
      if (wallNormal) {
        t.vel.reflect(wallNormal).multiplyScalar(0.4);
        t.vel.y = Math.max(t.vel.y, 6);
      } else {
        t.vel.multiplyScalar(0.55);
      }
      t.hooks.onEvent && t.hooks.onEvent('chainMiss', {});
    }
    t.chainTarget = null;
  }

  // ---------------- STOMP ----------------
  _startStomp() {
    const t = this;
    t.state = 'stomp'; t.stateTime = 0;
    t.vel.x *= 0.2; t.vel.z *= 0.2;
    t.vel.y = -TUNE.stompSpeed;
    t.hooks.onEvent && t.hooks.onEvent('stompStart', {});
  }

  _stompStep(h) {
    const t = this;
    t.vel.y = -TUNE.stompSpeed;
    t.vel.x *= Math.exp(-2 * h); t.vel.z *= Math.exp(-2 * h);
  }

  // ---------------- RAIL ----------------
  tryRail(rail) {
    const t = this;
    if (t.state !== 'air' || t.vel.y > 3) return false;
    const s = rail.nearestSample(t.pos, 2.4);
    if (!s) return false;
    // must be roughly above the rail
    _v1.copy(s.pos).sub(t.pos);
    if (_v1.y > 0.4) return false;
    t.rail = rail;
    t.railDist = s.dist;
    t.railSpeed = Math.max(t.horizSpeed, 10);
    t.state = 'rail'; t.stateTime = 0;
    const fr = rail.frameAt(t.railDist);
    t.pos.copy(fr.pos).addScaledVector(fr.up, t.r * 1.05);
    t.up.copy(fr.up);
    t.hooks.onEvent && t.hooks.onEvent('rail', {});
    return true;
  }

  _railStep(h) {
    const t = this;
    const rail = t.rail;
    if (!rail) { t._toAir(); return; }
    const fr = rail.frameAt(t.railDist);
    // slope gravity along tangent
    t.railSpeed += -fr.tan.y * TUNE.gravity * TUNE.railSlope * h;
    if (t.input && t.input.drift) t.railSpeed = Math.min(TUNE.railCrouchMax, t.railSpeed + TUNE.railCrouchAccel * h);
    t.railSpeed = Math.max(6, t.railSpeed - t.railSpeed * 0.02 * h);
    t.railDist += t.railSpeed * h;

    if (t.railDist >= rail.length) {
      // launch off end
      const endFr = rail.frameAt(rail.length - 0.01);
      t.vel.copy(endFr.tan).multiplyScalar(t.railSpeed).addScaledVector(endFr.up, 3.2);
      t.rail = null;
      t._toAir();
      t.hooks.onEvent && t.hooks.onEvent('railLaunch', {});
      return;
    }
    const f2 = rail.frameAt(t.railDist);
    t.pos.copy(f2.pos).addScaledVector(f2.up, t.r * 1.05);
    t.up.lerp(f2.up, 1 - Math.exp(-18 * h)).normalize();
    t.heading.copy(f2.tan);
    t.vel.copy(f2.tan).multiplyScalar(t.railSpeed);
    t.speed = t.railSpeed;
    t.grounded = true;

    if (t.input) {
      if (t.input.jumpHit) {
        t.vel.copy(f2.tan).multiplyScalar(t.railSpeed * 0.98).addScaledVector(f2.up, TUNE.jumpVel * 1.02);
        t.rail = null;
        t.state = 'air'; t.stateTime = 0; t.airJumps = 1;
        t.hooks.onEvent && t.hooks.onEvent('jump', {});
        return;
      }
    }
  }

  // ---------------- external gadgets ----------------
  applySpring(dir, power) {
    const t = this;
    t.vel.copy(dir).multiplyScalar(power);
    if (dir.y < 0.5) { /* sideways spring keeps some forward */ }
    t.state = 'air'; t.stateTime = 0; t.grounded = false;
    t.rail = null;
    t.jumpHoldT = 99;
    t.airJumps = 1;
    t.char.squash(0.7);
    t.hooks.onEvent && t.hooks.onEvent('spring', {});
  }

  applyPanel(dir, power) {
    const t = this;
    if (t.state === 'rail' || t.state === 'dead') return;
    t.panelPower = power;
    t.panelTimer = TUNE.panelMinTime;
    if (t.state === 'ground') {
      t.heading.copy(dir).projectOnPlane(t.up).normalize();
      t.speed = Math.max(t.speed, power);
      t.vel.copy(t.heading).multiplyScalar(t.speed);
    } else if (t.state === 'air') {
      t.vel.y = Math.max(t.vel.y, 0);
      _v1.copy(dir); _v1.y = 0;
      if (_v1.lengthSq() > 0.1) { _v1.normalize(); t.vel.x = _v1.x * power; t.vel.z = _v1.z * power; }
    }
    t.hooks.onEvent && t.hooks.onEvent('panel', {});
  }

  addBoost(v) { this.boostMeter = clamp(this.boostMeter + v, 0, 100); }

  hurt(fromPos) {
    const t = this;
    if (t.invuln > 0 || t.state === 'dead') return false;
    if ((t.orbs || 0) > 0) {
      t.hooks.onEvent && t.hooks.onEvent('hurt', { fromPos, scatter: Math.min(t.orbs, 24) });
    } else {
      this.die();
    }
    return true;
  }

  die() {
    const t = this;
    if (t.state === 'dead') return;
    t.state = 'dead';
    t.deadTimer = 1.1;
    t.vel.set(0, 0, 0);
    t.rail = null;
    t.hooks.onEvent && t.hooks.onEvent('death', {});
  }

  // ---------------- visuals (per render frame) ----------------
  frameUpdate(dt, animExtra = {}) {
    const t = this;
    const c = t.char;
    // orientation
    if (t.state === 'rail' && t.rail) {
      const fr = t.rail.frameAt(t.railDist);
      _v1.copy(fr.tan);
      _m1.lookAt(_v1, _v2.set(0, 0, 0), fr.up);
      _q1.setFromRotationMatrix(_m1);
      c.root.quaternion.slerp(_q1, 1 - Math.exp(-16 * dt));
    } else if (t.state === 'wall') {
      _v1.copy(t.vel); _v1.y = 0;
      if (_v1.lengthSq() > 0.5) _v1.normalize();
      _v2.copy(t.up).lerp(t.wallN, 0.35).normalize();
      _m1.lookAt(_v1, _v3.set(0, 0, 0), _v2);
      _q1.setFromRotationMatrix(_m1);
      c.root.quaternion.slerp(_q1, 1 - Math.exp(-12 * dt));
    } else {
      // yaw facing heading, tilt to up
      const hd = t.heading.lengthSq() > 0.01 ? t.heading : _v1.set(Math.sin(t.facingYaw), 0, Math.cos(t.facingYaw));
      _v1.copy(hd).projectOnPlane(t.up).normalize();
      _m1.lookAt(_v1, _v2.set(0, 0, 0), t.up);
      _q1.setFromRotationMatrix(_m1);
      c.root.quaternion.slerp(_q1, 1 - Math.exp(-14 * dt));
      t.facingYaw = Math.atan2(_v1.x, _v1.z);
    }
    c.root.position.copy(t.pos).addScaledVector(t.up, -(t.r + 0.08));

    // invuln blink
    c.root.visible = !(t.invuln > 0 && Math.floor(performance.now() / 60) % 2 === 0) && t.state !== 'dead';

    const speed01 = clamp((t.state === 'rail' ? t.railSpeed : t.horizSpeed) / TUNE.boostMax, 0, 1.3);
    let turning = 0;
    if (t.state === 'ground' && t.speed > 4) {
      _v1.copy(t.vel); _v1.y = 0; _v1.normalize();
      turning = _v2.crossVectors(_v1, t.heading).y / Math.max(dt, 1e-4) * 0.0001;
      turning = clamp(turning * 60, -1, 1);
    }
    c.update({
      dt,
      speed01,
      grounded: t.grounded,
      state: t.state,
      drifting: t.input ? (t.input.drift && t.state === 'ground' && t.speed > 8) : false,
      grinding: t.state === 'rail',
      vy: t.vel.y,
      turning,
      boost: t.boosting || t.panelTimer > 0,
      ...animExtra,
    });

    // trail ribbon points
    t.trailPts.push({ p: c.root.position.clone(), t: performance.now() / 1000 });
    const cutoff = performance.now() / 1000 - 0.45;
    while (t.trailPts.length && t.trailPts[0].t < cutoff) t.trailPts.shift();
    if (t.trailPts.length > 60) t.trailPts.shift();
  }

  get displaySpeed() { return this.state === 'rail' ? this.railSpeed : this.vel.length(); }
}
