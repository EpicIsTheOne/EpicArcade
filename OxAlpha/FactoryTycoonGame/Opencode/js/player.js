import * as THREE from '../lib/three.module.min.js';

const EYE = 1.66, RADIUS = 0.38;

export class Player {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(8, EYE, 14.5);
    this.yaw = 0;            // look toward -Z (deposits)
    this.pitch = -0.08;
    this.velY = 0;
    this.grounded = true;
    this.locked = false;
    this.keys = new Set();
    this.onLockChange = null;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    dom.addEventListener('click', () => {
      if (!this.locked) this.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch -= e.movementY * 0.0023;
      const L = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-L, Math.min(L, this.pitch));
    });
  }
  requestLock() {
    const p = this.dom.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }
  releaseLock() { if (this.locked) document.exitPointerLock(); }

  // solids: iterable of {x,z} world-space cell centers that block
  update(dt, solidAt) {
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW')) fz -= 1;
    if (k.has('KeyS')) fz += 1;
    if (k.has('KeyA')) fx -= 1;
    if (k.has('KeyD')) fx += 1;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? 7.4 : 4.3;

    let mx = 0, mz = 0;
    if (fx || fz) {
      const len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      const fwd = -fz; // 1 when W
      // forward = (-sinY, -cosY), right = (cosY, -sinY)
      mx = (-sinY * fwd + cosY * fx) * speed;
      mz = (-cosY * fwd - sinY * fx) * speed;
    }

    this.pos.x += mx * dt;
    this._collide(solidAt, 'x');
    this.pos.z += mz * dt;
    this._collide(solidAt, 'z');

    // jump/gravity
    if (k.has('Space') && this.grounded) { this.velY = 5.0; this.grounded = false; }
    this.velY -= 13.5 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= EYE) { this.pos.y = EYE; this.velY = 0; this.grounded = true; }

    this.cam.position.copy(this.pos);
    this._euler.set(this.pitch, this.yaw, 0);
    this.cam.quaternion.setFromEuler(this._euler);
  }
  _collide(solidAt, axis) {
    const px = this.pos.x, pz = this.pos.z;
    const gx = Math.round(px / 2), gz = Math.round(pz / 2); // CELL=2
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const cx = gx + ox, cz = gz + oz;
      if (!solidAt(cx, cz)) continue;
      const wx = cx * 2, wz = cz * 2;
      const half = 1.0 + RADIUS; // cell half + player radius (approx AABB vs point w/ radius)
      const dx = px - wx, dz = pz - wz;
      if (Math.abs(dx) < half && Math.abs(dz) < half) {
        const pushX = half - Math.abs(dx), pushZ = half - Math.abs(dz);
        if (pushX < pushZ) this.pos.x += Math.sign(dx || 1) * pushX;
        else this.pos.z += Math.sign(dz || 1) * pushZ;
      }
    }
  }
  teleport(x, z, yawDeg, pitchDeg) {
    this.pos.set(x, EYE, z);
    if (yawDeg != null) this.yaw = yawDeg * Math.PI / 180;
    if (pitchDeg != null) this.pitch = pitchDeg * Math.PI / 180;
  }
}
