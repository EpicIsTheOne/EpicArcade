// First-person player: input, camera (non-inverted), AABB collision, swim,
// DDA block targeting, break/place with progress, hunger drain hooks.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { BLOCKS, B } = __RQ('../shared/blocks.js');

const PW = 0.3;   // half width
const PH = 1.8;   // height
const EYE = 1.62;
const GRAV = 28;

class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = { x: 8.5, y: 80, z: 8.5 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;   // rad, 0 = -z facing
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.sprint = false;
    this.creative = false;
    this.flying = false;
    this.keys = {};
    this.mouse = { left: false, right: false };
    this.breaking = null; // {x,y,z,progress,total}
    this.placeCooldown = 0;
    this.jumpBuffer = 0;
    this.lastJumpTime = 0;
    this.stepTimer = 0;
    this.target = null; // raycast target
    this.hunger = 20; this.saturation = 5;
    this.health = 20;
    this.dead = false;
    this.fallStartY = null;
    this.spawnPoint = { x: 8.5, y: 80, z: 8.5 };
    this.invulnT = 0;
  }

  look(dx, dy, sens, invX, invY) {
    const s = sens * 0.0016;
    this.yaw -= dx * s * (invX ? -1 : 1);
    this.pitch -= dy * s * (invY ? -1 : 1);
    if (this.pitch > Math.PI / 2 - 0.01) this.pitch = Math.PI / 2 - 0.01;
    if (this.pitch < -Math.PI / 2 + 0.01) this.pitch = -Math.PI / 2 + 0.01;
  }

  forward() {
    return { x: -Math.sin(this.yaw) * Math.cos(this.pitch), y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * Math.cos(this.pitch) };
  }
  flatForward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }
  flatRight() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  update(dt, input, opts) {
    opts = opts || {};
    const k = input.keys;
    // sprint = Shift held while moving forward
    this.sprint = !!(k['ShiftLeft'] || k['ShiftRight']);

    // desired horizontal move in world space from WASD
    let mx = 0, mz = 0;
    if (k['KeyW']) mz += 1;
    if (k['KeyS']) mz -= 1;
    if (k['KeyA']) mx -= 1;
    if (k['KeyD']) mx += 1;
    const len = Math.hypot(mx, mz);
    let wishX = 0, wishZ = 0;
    if (len > 0) {
      mx /= len; mz /= len;
      const f = this.flatForward(), r = this.flatRight();
      wishX = f.x * mz + r.x * mx;
      wishZ = f.z * mz + r.z * mx;
    }

    const inWater = this.inWater;
    const flying = this.flying && this.creative;
    let speed = 4.3;
    if (this.sprint) speed *= 1.55;
    if (inWater) speed *= 0.62;
    if (flying) speed = this.sprint ? 22 : 11;
    if (opts.speedMult) speed *= opts.speedMult;

    // horizontal accel toward wish velocity
    const accel = this.onGround ? 46 : (flying ? 30 : 14);
    const wx = wishX * speed, wz = wishZ * speed;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);

    // gravity / swim / fly
    if (flying) {
      this.vel.y *= 0.82;
      if (k['Space']) this.vel.y += 60 * dt;
      if (k['ShiftLeft'] && !this.sprintMoving()) this.vel.y -= 60 * dt;
    } else if (inWater) {
      this.vel.y -= GRAV * 0.32 * dt;
      this.vel.y = Math.max(this.vel.y, -3.2);
      if (k['Space']) this.vel.y += 26 * dt, this.vel.y = Math.min(this.vel.y, 3.6);
    } else {
      this.vel.y -= GRAV * dt;
      if (k['Space'] && this.onGround) {
        this.vel.y = 8.7;
        this.onGround = false;
        if (opts.onJump) opts.onJump();
      }
    }

    // integrate with collision per axis
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);

    // fall damage tracking
    if (!this.onGround && !inWater && !flying) {
      if (this.vel.y < -0.1 && this.fallStartY === null) this.fallStartY = this.pos.y;
    } else if (this.fallStartY !== null) {
      if (!inWater) {
        const drop = this.fallStartY - this.pos.y;
        if (drop > 3.5 && opts.onFallDamage) opts.onFallDamage(Math.floor(drop - 3));
      }
      this.fallStartY = null;
    }

    // water state sampling at eye & feet+0.4
    const eyeB = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    const bodyB = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
    this.headInWater = eyeB === B.WATER;
    this.inWater = bodyB === B.WATER || this.headInWater;

    // step sounds hook
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hv > 2) {
      this.stepTimer += hv * dt;
      if (this.stepTimer > 2.2) { this.stepTimer = 0; if (opts.onStep) opts.onStep(); }
    }

    this.updateCamera();
    void PH;
  }

  sprintMoving() { return Math.hypot(this.vel.x, this.vel.z) > 1; }

  collidesAt(x, y, z) {
    const w = this.world;
    const minX = Math.floor(x - PW), maxX = Math.floor(x + PW);
    const minY = Math.floor(y), maxY = Math.floor(y + PH);
    const minZ = Math.floor(z - PW), maxZ = Math.floor(z + PW);
    for (let by = minY; by <= maxY; by++)
      for (let bz = minZ; bz <= maxZ; bz++)
        for (let bx = minX; bx <= maxX; bx++) {
          const d = BLOCKS[w.getBlock(bx, by, bz)];
          if (d && d.solid) return true;
        }
    return false;
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
    const d = delta / steps;
    for (let i = 0; i < steps; i++) {
      const nx = axis === 'x' ? this.pos.x + d : this.pos.x;
      const ny = axis === 'y' ? this.pos.y + d : this.pos.y;
      const nz = axis === 'z' ? this.pos.z + d : this.pos.z;
      if (!this.collidesAt(nx, ny, nz)) {
        this.pos.x = nx; this.pos.y = ny; this.pos.z = nz;
      } else {
        if (axis === 'y') {
          if (delta < 0) {
            this.onGround = true;
            // snap to top of block
            this.pos.y = Math.floor(this.pos.y + d) + 1;
          }
          this.vel.y = 0;
        } else {
          // auto-step-up small ledges when grounded
          if (this.onGround && !this.collidesAt(axis === 'x' ? nx : nx, ny + 0.55, nz)) {
            this.pos.x = axis === 'x' ? nx : this.pos.x;
            this.pos.z = axis === 'z' ? nz : this.pos.z;
            this.pos.y += 0.55;
          }
          if (axis === 'x') this.vel.x = 0; else this.vel.z = 0;
        }
        return;
      }
    }
    if (axis === 'y' && delta < 0) this.onGround = false;
    if (axis !== 'y') return;
  }

  updateCamera() {
    const c = this.camera;
    c.rotation.order = 'YXZ';
    c.rotation.y = this.yaw;
    c.rotation.x = this.pitch;
    c.position.set(this.pos.x, this.pos.y + EYE - (this.headInWater ? 0.12 : 0), this.pos.z);
    c.fov = this.baseFov || 75;
  }

  /** Amanatides-Woo voxel traversal. Returns {x,y,z,face:{x,y,z},dist} or null. */
  raycast(maxDist) {
    const o = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const dir = this.forward();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9)), tDeltaY = Math.abs(1 / (dir.y || 1e-9)), tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    let tMaxX = tDeltaX * ((dir.x > 0 ? (x + 1 - o.x) : (o.x - x)));
    let tMaxY = tDeltaY * ((dir.y > 0 ? (y + 1 - o.y) : (o.y - y)));
    let tMaxZ = tDeltaZ * ((dir.z > 0 ? (z + 1 - o.z) : (o.z - z)));
    let face = [0, 0, 0];
    for (let i = 0; i < 256; i++) {
      const id = this.world.getBlock(x, y, z);
      const def = BLOCKS[id];
      if (id && def && !def.liquid) {
        return { x, y, z, id, face: { x: face[0], y: face[1], z: face[2] }, dist: Math.min(tMaxX, tMaxY, tMaxZ) };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY; tMaxY += tDeltaY; face = [0, -stepY, 0];
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
    }
    return null;
  }

  /** Can a placement at (x,y,z) happen without intersecting player? */
  canPlaceAt(x, y, z) {
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const overlap = (x + 1 > px - PW - 0.02) && (x < px + PW + 0.02) &&
      (y + 1 > py) && (y < py + PH) &&
      (z + 1 > pz - PW - 0.02) && (z < pz + PW + 0.02);
    return !overlap;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Player, EYE, PH, PW };
if (typeof self !== 'undefined') self.PLAYER_MOD = { Player, EYE, PH, PW };
})();
