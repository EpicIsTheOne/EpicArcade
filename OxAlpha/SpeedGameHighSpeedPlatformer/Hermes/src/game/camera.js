import * as THREE from 'three';
import { TUNE } from './gamedata.js';
import { clamp, lerp, damp } from './mathutil.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

// High-speed third-person chase camera:
//  - smooth follow w/ velocity lookahead, speed FOV, manual orbit that recenters,
//  - surface-aligned up (loops/rails readable), collision pull-in, subtle bank.
export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.24;          // view elevation (rad). + looks up
    this.dist = 7.2;
    this.userDist = 7.2;
    this.mouseIdle = 99;
    this.shake = 0;
    this.pos = new THREE.Vector3(0, 6, -10);
    this.lookTarget = new THREE.Vector3();
    this.smoothVel = new THREE.Vector3();
    this.fovKick = 0;
    this.roll = 0;
    this._upSmooth = new THREE.Vector3(0, 1, 0);
  }

  snapBehind(player) {
    this.yaw = Math.atan2(player.heading.x, player.heading.z);
    this.pitch = 0.22;
    const t = this._target(player);
    this.pos.copy(t).addScaledVector(this._dirFrom(this.yaw, this.pitch).clone(), -this.dist);
    this.lookTarget.copy(t);
    this.cam.position.copy(this.pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(t);
  }

  _target(player) {
    return _v3.copy(player.pos).addScaledVector(player.up, 1.35);
  }

  _dirFrom(yaw, pitch) {
    // unit view direction for yaw/pitch (pitch + => looking up)
    return _v2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  update(dt, player, input, opts = {}) {
    const t = this._target(player);

    // ---- mouse orbit ----
    let moved = false;
    if (input && input.pointerLocked) {
      if (Math.abs(input.mouseDX) + Math.abs(input.mouseDY) > 0.5) moved = true;
      const sens = 0.0023 * (input.sens || 1);
      // mouse right -> camera right ; mouse up -> look up (non-inverted defaults)
      // dir(yaw)=(sin,·,cos): increasing yaw rotates view rightward (clockwise from above),
      // increasing pitch raises the view. Mouse-up gives negative dy => pitch up.
      this.yaw += input.mouseDX * sens;
      this.pitch -= input.mouseDY * sens;
      if (input.wheel) {
        this.userDist = clamp(this.userDist + input.wheel * 0.7, 3.6, 12);
      }
    }
    this.pitch = clamp(this.pitch, -0.55, 1.05);
    this.mouseIdle = moved ? 0 : this.mouseIdle + dt;

    // ---- auto-align yaw toward motion when idle ----
    const hvel = _v1.copy(player.vel); hvel.y = 0;
    const hs = hvel.length();
    let desiredDist = this.userDist + clamp(hs / 48, 0, 1) * 2.6;
    if (player.state === 'rail' && player.rail) {
      const fr = player.rail.frameAt(player.railDist);
      const ryaw = Math.atan2(fr.tan.x, fr.tan.z);
      this.yaw = lerpAngle(this.yaw, ryaw, 1 - Math.exp(-6 * dt));
      desiredDist += 1.2;
    } else if (!moved && hs > 4 && this.mouseIdle > 0.55 && player.state !== 'wall') {
      const hyaw = Math.atan2(hvel.x, hvel.z);
      this.yaw = lerpAngle(this.yaw, hyaw, 1 - Math.exp((-(0.9 + clamp(hs / 40, 0, 1) * 2.4)) * dt));
    }
    this.dist = damp(this.dist, desiredDist, 5, dt);

    // ---- up alignment (loops / rails) ----
    const upW = player.grounded || player.state === 'rail' ? 0.72 : 0.18;
    this._upSmooth.lerp(_v1.copy(UP).lerp(player.up, upW).normalize(), 1 - Math.exp(-6.5 * dt)).normalize();

    // ---- position ----
    const dir = this._dirFrom(this.yaw, this.pitch).clone();
    let want = t.clone().addScaledVector(dir, -this.dist).addScaledVector(this._upSmooth, 0.35);

    // collision pull-in
    _v1.copy(want).sub(t);
    const len = _v1.length();
    if (len > 0.01) {
      _v1.divideScalar(len);
      const hit = this.world.raycast(t, _v1, len + 0.4, true);
      if (hit) want = t.clone().addScaledVector(_v1, Math.max(0.7, hit.dist - 0.45));
    }

    const rate = player.state === 'chain' ? 11 : 8.5;
    this.pos.lerp(want, 1 - Math.exp(-rate * dt));

    // lookahead along velocity
    _v1.copy(player.vel).multiplyScalar(0.16);
    const ll = _v1.length();
    if (ll > 6) _v1.multiplyScalar(6 / ll);
    this.lookTarget.lerp(t.clone().add(_v1), 1 - Math.exp(-10 * dt));

    // ---- fov ----
    const spN = clamp(player.displaySpeed / 50, 0, 1.25);
    const boostK = (player.boosting || player.panelTimer > 0 || player.state === 'chain') ? 6 : 0;
    this.fovKick = damp(this.fovKick, boostK, 6, dt);
    this.cam.fov = 68 + spN * 26 + this.fovKick;
    this.cam.updateProjectionMatrix();

    // ---- shake ----
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;

    // compose orientation manually so we control roll & up
    this.cam.position.copy(this.pos)
      .addScaledVector(this._randVec(), sh * 0.35);
    _m.lookAt(this.cam.position, this.lookTarget, this._upSmooth);
    this.cam.quaternion.setFromRotationMatrix(_m);
    // bank into turns
    let latAccel = 0;
    if (hs > 6) {
      _v1.copy(player.vel).normalize();
      _v2.crossVectors(_v1, this._fwdOfCam());
      latAccel = clamp(_v2.dot(UP) * clamp(hs / 40, 0, 1) * 0.9, -0.16, 0.16);
    }
    this.roll = damp(this.roll, latAccel, 5, dt);
    this.cam.rotateZ(this.roll);

    this.playerSpeedNorm = spN;
  }

  _fwdOfCam() { return _v1.set(0, 0, -1).applyQuaternion(this.cam.quaternion).clone(); }
  _randBuf = new THREE.Vector3();
  _randVec() {
    const s = this.shake;
    return this._randBuf.set(
      (Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s
    );
  }

  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
