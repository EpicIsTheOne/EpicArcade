// camera.js — high-speed chase camera.
// Non-inverted mouse: RIGHT -> look right, UP -> look up (invert options default OFF).
// Smooth follow w/ velocity lookahead, speed FOV, surface-normal roll for loops,
// collision pull-in, impact shake.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(perspectiveCam) {
    this.cam = perspectiveCam;
    this.yaw = 0; this.pitch = 0.16;
    this.fovBase = 74; this.fov = this.fovBase;
    this.distMul = 1;
    this.curPos = new THREE.Vector3(0, 4, -8);
    this.lookTarget = new THREE.Vector3();
    this.upBlend = new THREE.Vector3(0, 1, 0);
    this.shake = 0;
    this._fwd = new THREE.Vector3();
    this._want = new THREE.Vector3();
  }

  onMouse(dx, dy, sens, invertX, invertY) {
    let mx = invertX ? -dx : dx;
    let my = invertY ? -dy : dy;
    this.yaw -= mx * sens;         // moving mouse right turns the view right
    this.pitch -= my * sens;       // moving mouse up looks up
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 1.42);
  }

  kick(amount) { this.shake = Math.min(1, this.shake + amount); }

  forward(out) {
    out.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    return out.normalize();
  }

  snapBehind(player) {
    this.yaw = player.yaw;
    const f = this.forward(this._fwd);
    this.curPos.copy(player.pos).addScaledVector(f, -7).addScaledVector(UP, 2.5);
    this.lookTarget.copy(player.pos);
  }

  update(dt, player, world, opts = {}) {
    const speed01 = THREE.MathUtils.clamp(player.speed / 95, 0, 1);
    const p = player.pos;

    // desired look target: ahead of the player along velocity (anticipation)
    const vh = new THREE.Vector3(player.vel.x, player.vel.y * 0.35, player.vel.z);
    const ahead = vh.clone().multiplyScalar(0.20);
    if (ahead.length() > 7) ahead.setLength(7);
    const targetPoint = new THREE.Vector3().copy(p).addScaledVector(UP, 1.35).add(ahead);

    const lerpK = 1 - Math.pow(0.00003, dt);   // fast but smoothed
    this.lookTarget.lerp(targetPoint, lerpK);

    // desired position
    const f = this.forward(this._fwd);
    const dist = (6.1 + speed01 * 2.6) * this.distMul * (opts.distMul || 1);
    this._want.copy(this.lookTarget).addScaledVector(f, -dist);

    // collision: pull camera in front of walls
    if (world) {
      const dir = new THREE.Vector3().subVectors(this._want, this.lookTarget);
      const len = dir.length();
      if (len > 0.01) {
        dir.divideScalar(len);
        const hit = world.raycast(this.lookTarget, dir, len + 0.4);
        if (hit && hit.t < len) {
          this._want.copy(this.lookTarget).addScaledVector(dir, Math.max(1.1, hit.t - 0.35));
        }
      }
    }

    // roll frame: blend world-up toward ground normal while wall-running / looping
    let upTarget = UP;
    if (player.grounded && player.groundNormal && player.groundNormal.dot(UP) < 0.82) {
      upTarget = player.groundNormal;
    }
    const upK = upTarget === UP ? 1 - Math.pow(0.002, dt) : 1 - Math.pow(0.02, dt);
    this.upBlend.lerp(upTarget, THREE.MathUtils.clamp(upK, 0, 1)).normalize();

    // position smoothing (snappy)
    const pk = 1 - Math.pow(0.000001, dt);
    this.curPos.lerp(this._want, pk);

    // shake
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const sh = this.shake * this.shake;
    const jitter = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(sh * 0.55);

    this.cam.position.copy(this.curPos).add(jitter);
    this.cam.up.copy(this.upBlend);
    this.cam.lookAt(this.lookTarget);

    // FOV widens with speed (+ boost surge)
    const fovT = this.fovBase + speed01 * 26 + (player.boosting ? 5 : 0);
    this.fov += (fovT - this.fov) * Math.min(1, dt * 5);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
