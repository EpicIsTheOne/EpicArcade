// High-speed chase camera: mouse orbit + velocity auto-follow, adaptive FOV & distance,
// anti-clipping raycast, shake, subtle roll. Never fights the player.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.yaw = 0; this.pitch = 0.12;
    this.dist = 6.2;
    this.shake = 0;
    this.mouseIdle = 0;      // seconds since last manual look
    this.roll = 0;
    this._pos = new THREE.Vector3(0, 4, 8);
    this._look = new THREE.Vector3();
    this._init = false;
    this.invertX = false; this.invertY = false;
    this.fovBase = 74;
  }
  addShake(x) { this.shake = Math.min(1, this.shake + x); }
  snapBehind(pos, yaw) {
    this.yaw = yaw; this.pitch = .12;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this._pos.copy(pos).addScaledVector(f, -this.dist).add(new THREE.Vector3(0, 2.2, 0));
    this._look.copy(pos);
    this._init = true;
  }

  update(dt, player, input, opts = {}) {
    // --- manual look ---
    let [dx, dy] = input.consumeLook();
    if (!opts.frozen) {
      if (dx || dy) {
        this.mouseIdle = 0;
        this.yaw -= dx * 0.0026 * (this.invertX ? -1 : 1);
        this.pitch -= dy * 0.0022 * (this.invertY ? -1 : 1);
      } else this.mouseIdle += dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.55, 1.05);
    }

    const ppos = player.pos;
    const vel = player.vel;
    const sp = vel.length();
    const hv = new THREE.Vector3(vel.x, 0, vel.z);
    const hsp = hv.length();

    // --- auto-follow: ease yaw toward movement heading ---
    if (!opts.frozen && hsp > 7 && this.mouseIdle > 0.45) {
      const wantYaw = Math.atan2(-hv.x, -hv.z); // forward convention (-sin,-cos)
      let d = wantYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const strength = Math.min(1, dt * (0.9 + hsp * 0.02)) * Math.min(1, hsp / 14);
      this.yaw += d * strength;
    }
    // pitch relaxes slightly
    if (!opts.frozen && this.mouseIdle > 1.2) {
      this.pitch += (0.1 - this.pitch) * Math.min(1, dt * 0.5);
    }

    // --- distance / fov by speed ---
    const targetDist = 5.9 + Math.min(sp / 42, 1) * 2.4 + (player.grinding ? 0.8 : 0);
    this.dist += (targetDist - this.dist) * Math.min(1, dt * 3);
    const fovT = this.fovBase + Math.min(sp / 46, 1) * 22 + (player.boostingFx ? 5 : 0);
    this.cam.fov += (fovT - this.cam.fov) * Math.min(1, dt * 4);
    this.cam.updateProjectionMatrix();

    // --- position ---
    const upMix = player.up.clone(); // lean with player's surface
    const camUp = new THREE.Vector3(0, 1, 0).lerp(upMix, player.grounded ? 0.35 : 0.15).normalize();
    const fwd = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const lookTarget = ppos.clone().add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(hv.length() > 2 ? hv.clone().normalize() : fwd.clone().setY(0).normalize(), Math.min(sp * 0.06, 1.6)); // lead the look
    const desired = lookTarget.clone().addScaledVector(fwd, -this.dist);
    desired.addScaledVector(camUp, 0.4);

    // anti-clip: cast from lookTarget to desired
    const dir = desired.clone().sub(lookTarget);
    const len = dir.length();
    dir.normalize();
    const hit = this.world ? this.world.raycast(lookTarget.x, lookTarget.y, lookTarget.z, dir.x, dir.y, dir.z, len + 0.4) : null;
    let useDist = len;
    if (hit) useDist = Math.max(1.2, hit.t - 0.35);

    if (!this._init) { this._pos.copy(lookTarget).addScaledVector(dir, useDist); this._init = true; }
    const followSpeed = player.grounded ? 10 : 7;
    this._pos.lerp(lookTarget.clone().addScaledVector(dir, useDist), Math.min(1, dt * followSpeed));

    // shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const jitter = new THREE.Vector3((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(sh * 0.5);

    this.cam.position.copy(this._pos).add(jitter);
    this._look.lerp(lookTarget, Math.min(1, dt * 14));
    this.cam.up.lerp(camUp, Math.min(1, dt * 5));

    // style roll while drifting/grinding
    const rollT = (player.drifting ? -player.turnRate * 2 : 0) + (player.wallrunRoll || 0);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 4);
    this.cam.lookAt(this._look);
    this.cam.rotateZ(this.roll);
  }
}
