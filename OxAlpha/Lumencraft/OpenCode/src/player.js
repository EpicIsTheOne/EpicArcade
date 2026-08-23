// Player: camera control (verified semantics), swept AABB voxel physics,
// swimming, ladders, fly mode, survival stats.
import * as THREE from 'three';
import { GRAVITY } from './config.js';
import { B, BLOCKS, isSolid, isLiquid } from './blocks.js';

const HALF_W = 0.3;
const HEIGHT_ = 1.8;
const EYE = 1.62;

export class Player {
  constructor(world, input) {
    this.world = world;
    this.input = input;

    this.pos = new THREE.Vector3(0.5, 90, 0.5); // feet center
    this.vel = new THREE.Vector3();
    this.yaw = 0;    // radians; 0 faces -Z
    this.pitch = 0;

    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.inLava = false;
    this.onLadder = false;
    this.flying = false;
    this.sprinting = false;

    this.hp = 20;
    this.hunger = 20;
    this.exhaustion = 0;
    this.breath = 12;
    this.invulnT = 0;
    this.dead = false;
    this.fallPeakY = null;
    this.spawnPoint = { x: 0.5, y: 90, z: 0.5 };

    this.regenT = 0;
    this.starveT = 0;
    this.stepAccum = 0;

    // feedback hooks (set by game)
    this.onDamage = null;
    this.onDeath = null;
    this.onFootstep = null;
    this.onSplash = null;
    this.onExhaust = null;

    this.bobPhase = 0;
    this.bobAmt = 0;
  }

  get eyeY() { return this.pos.y + EYE; }

  applyLook(dx, dy) {
    // Mouse right (+dx) must rotate view RIGHT => yaw decreases (three.js +Y rotation is CCW/left).
    this.yaw -= dx;
    // Mouse up (dy negative) must look UP => pitch increases with negative dy.
    this.pitch -= dy;
    const lim = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  forwardVec(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  rightVec(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  blockAt(x, y, z) { return this.world.getBlockRaw(Math.floor(x), Math.floor(y), Math.floor(z)); }

  collides(px, py, pz) {
    const x0 = Math.floor(px - HALF_W), x1 = Math.floor(px + HALF_W);
    const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT_);
    const z0 = Math.floor(pz - HALF_W), z1 = Math.floor(pz + HALF_W);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (y < 0 || y >= 128) continue;
      const b = this.world.getBlockRaw(x, y, z);
      if (isSolid(b)) return true;
    }
    return false;
  }

  update(dt) {
    if (this.dead) return;
    const inp = this.input;
    const [dx, dy] = inp.consumeLook();
    this.applyLook(dx, dy);

    // ---- environment probes ----
    const fx = Math.floor(this.pos.x), fz = Math.floor(this.pos.z);
    const bodyB = this.blockAt(this.pos.x, this.pos.y + 0.9, this.pos.z);
    const headB = this.blockAt(this.pos.x, this.eyeY, this.pos.z);
    const feetB = this.blockAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    this.inWater = isLiquid(bodyB) && !BLOCKS[bodyB].lava || isLiquid(feetB) && !BLOCKS[feetB].lava;
    this.headInWater = isLiquid(headB) && !BLOCKS[headB].lava;
    this.inLava = (isLiquid(bodyB) && BLOCKS[bodyB].lava) || (isLiquid(feetB) && BLOCKS[feetB].lava);
    this.onLadder = bodyB === B.LADDER || headB === B.LADDER || feetB === B.LADDER;
    const onIce = this.onGround && (this.blockAt(this.pos.x, this.pos.y - 0.05, this.pos.z) === B.ICE);

    // ---- wish direction ----
    let wx = 0, wz = 0;
    const fwd = this.forwardVec(), rgt = this.rightVec();
    if (inp.down('KeyW')) { wx += fwd.x; wz += fwd.z; }
    if (inp.down('KeyS')) { wx -= fwd.x; wz -= fwd.z; }
    if (inp.down('KeyA')) { wx -= rgt.x; wz -= rgt.z; }
    if (inp.down('KeyD')) { wx += rgt.x; wz += rgt.z; }
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    this.sprinting = inp.down('ShiftLeft') && inp.down('KeyW') && !this.headInWater &&
      (this.hunger > 6 || this.flying);

    // ---- speeds ----
    let speed = 4.32;
    if (this.sprinting) speed = 5.85;
    if (this.inWater) speed *= 0.62;
    else if (this.onLadder) speed *= 0.55;
    if (this.flying) speed = this.sprinting ? 21 : 10.5;

    // ---- horizontal accel ----
    const accel = this.flying ? 30 : this.onGround ? (onIce ? 4 : 26) : this.inWater ? 14 : 9;
    const tx = wx * speed, tz = wz * speed;
    const a = Math.min(1, accel * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    // ---- vertical ----
    if (this.flying) {
      let vy = 0;
      if (inp.down('Space')) vy = speed;
      if (inp.down('KeyC')) vy = -speed;
      this.vel.y += (vy - this.vel.y) * Math.min(1, 20 * dt);
      this.fallPeakY = null;
    } else if (this.inWater) {
      this.vel.y += GRAVITY * 0.28 * dt;
      this.vel.y *= Math.pow(0.35, dt * 3);
      if (inp.down('Space')) this.vel.y += 26 * dt;
      this.vel.y = Math.max(-3.2, Math.min(3.6, this.vel.y));
      this.fallPeakY = null;
    } else if (this.onLadder && (wl > 0 || inp.down('Space'))) {
      this.vel.y = inp.down('ShiftLeft') ? 0 : 3.4;
      this.fallPeakY = null;
    } else {
      this.vel.y += GRAVITY * dt;
      if (this.onGround && inp.down('Space')) {
        this.vel.y = 8.42;
        this.addExhaustion(this.sprinting ? 0.2 : 0.08);
      }
    }

    // fall peak tracking (for fall damage)
    if (!this.flying && !this.inWater) {
      if (this.vel.y <= 0) {
        if (this.fallPeakY === null) this.fallPeakY = this.pos.y;
        else if (this.pos.y > this.fallPeakY) this.fallPeakY = this.pos.y;
      } else if (this.vel.y > 0.5) this.fallPeakY = null;
    }

    // ---- integrate + collide axis-separated ----
    const wasOnGround = this.onGround;
    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(1, this.vel.y * dt);
    this.moveAxis(2, this.vel.z * dt);

    // landed?
    if (this.onGround && !wasOnGround) {
      if (this.fallPeakY !== null) {
        const dist = this.fallPeakY - this.pos.y;
        this.fallPeakY = null;
        if (dist > 3.4 && !this.flying) {
          this.damage(Math.floor(dist - 3), 'fall');
        }
      } else if (this.vel.y < -9) {
        // safety net
      }
      if (Math.abs(this.vel.y) > 2) this._landedHard = true;
    }

    // footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hSpeed > 0.5) {
      this.stepAccum += hSpeed * dt;
      this.bobPhase += hSpeed * dt * 1.7;
      this.bobAmt = Math.min(1, this.bobAmt + dt * 6);
      if (this.stepAccum > 2.1) {
        this.stepAccum = 0;
        const ground = this.blockAt(this.pos.x, this.pos.y - 0.15, this.pos.z);
        if (this.onFootstep && ground !== B.AIR) this.onFootstep(ground, this.sprinting);
      }
    } else {
      this.bobAmt = Math.max(0, this.bobAmt - dt * 5);
    }

    // ---- hazards ----
    if (this.inLava) this.damage(4 * dt * 2, 'lava');
    if (feetB === B.CACTUS || this.blockAt(this.pos.x, this.pos.y + 1.2, this.pos.z) === B.CACTUS) {
      this.damage(dt * 1.5, 'cactus');
    }
    if (this.headInWater && !this.flying) {
      this.breath -= dt;
      if (this.breath < 0) { this.damage(dt * 2.2, 'drown'); }
    } else {
      this.breath = Math.min(12, this.breath + dt * 6);
    }

    // void
    if (this.pos.y < -12) this.damage(dt * 20, 'void');

    // ---- survival ticks ----
    this.invulnT = Math.max(0, this.invulnT - dt);
    if (this.exhaustion >= 4) { this.exhaustion -= 4; this.hunger = Math.max(0, this.hunger - 1); }
    if (this.hunger >= 16 && this.hp < 20) {
      this.regenT += dt;
      if (this.regenT >= 2.2) {
        this.regenT = 0; this.hp = Math.min(20, this.hp + 1);
        this.addExhaustion(1.4);
      }
    } else this.regenT = 0;
    if (this.hunger <= 0) {
      this.starveT += dt;
      if (this.starveT > 3.5) { this.starveT = 0; if (this.hp > 2) this.damage(1, 'starve'); }
    }

    // sprint exhaustion
    if (this.sprinting && hSpeed > 1) this.addExhaustion(dt * 0.09);
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.pos;
    const old = p.getComponent(axis);
    p.setComponent(axis, old + amount);
    if (!this.collides(p.x, p.y, p.z)) {
      if (axis === 1) this.onGround = false;
      return;
    }
    // resolve by stepping back in small increments
    const step = amount / 24;
    p.setComponent(axis, old);
    for (let i = 0; i < 24; i++) {
      const next = p.getComponent(axis) + step;
      p.setComponent(axis, next);
      if (this.collides(p.x, p.y, p.z)) {
        p.setComponent(axis, next - step);
        break;
      }
    }
    if (axis === 1) {
      if (amount < 0) { this.onGround = true; }
      this.vel.y = 0;
    } else {
      this.vel.setComponent(axis, 0);
    }
  }

  addExhaustion(v) { this.exhaustion += v; }

  eat(foodHunger) {
    this.hunger = Math.min(20, this.hunger + foodHunger);
  }

  damage(amount, cause) {
    if (this.dead) return;
    if (cause !== 'void' && cause !== 'starve' && this.invulnT > 0) return;
    if (cause !== 'void') this.invulnT = cause === 'lava' || cause === 'drown' ? 0.45 : 0.55;
    const before = this.hp;
    this.hp -= amount;
    if (this.onDamage) this.onDamage(amount, cause);
    if (before > 0 && this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this.onDeath) this.onDeath(cause);
    }
  }

  respawn() {
    this.dead = false;
    this.hp = 20;
    this.hunger = Math.max(this.hunger, 12);
    this.breath = 12;
    this.vel.set(0, 0, 0);
    this.pos.set(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    this.fallPeakY = null;
  }
}
