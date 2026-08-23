// Camera rig: yaw (CCW around +Y), pitch. Third-person orbit + ADS shoulder cam.
// SEMANTIC CONTRACT (unit-tested):
//   yaw+ = turn LEFT; yaw- = turn RIGHT  =>  mouse right must DECREASE yaw.
//   pitch+ = look UP                     =>  mouse up (-dy) must INCREASE pitch.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pitch = -0.05;
    this.baseDistance = 4.6;
    this.distance = 4.6;
    this.shoulder = 0.85;       // right-side offset in camera space (+X right)
    this.height = 1.62;         // eye height above feet
    this.adsT = 0;              // 0 hip, 1 ads
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.collideFn = null;      // (from, to, radius) -> safe position or null
    this.recoilKick = 0;        // visual-only recoil
  }

  addLook(dxYaw, dyPitch) {
    this.yaw += dxYaw;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dyPitch));
  }

  forward(out) {
    out = out || new THREE.Vector3();
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }
  flatForward(out) {
    out = out || new THREE.Vector3();
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
  rightVector(out) {
    out = out || new THREE.Vector3();
    // flat right = rotate flatForward -90deg about Y: (-cos(yaw), 0, sin(yaw))
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).normalize();
  }

  update(dt, focus, opts = {}) {
    const wantAds = !!opts.ads;
    this.adsT += ((wantAds ? 1 : 0) - this.adsT) * Math.min(1, dt * 12);
    this.distance = THREE.MathUtils.lerp(this.baseDistance, 2.1, this.adsT);
    const sh = THREE.MathUtils.lerp(this.shoulder, 0.5, this.adsT);
    const f = this.forward(this._v1);
    const pc = Math.max(-0.95, Math.min(1.25, this.pitch)); // orbit clamp
    const cp = Math.cos(pc), sp = Math.sin(pc);
    const back = this._v2.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const hMul = opts.crouch ? 0.6 : 1;
    const eye = new THREE.Vector3(focus.x, focus.y + this.height * hMul, focus.z);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const desired = eye.clone()
      .addScaledVector(back, this.distance)
      .addScaledVector(new THREE.Vector3(rx, 0, rz), sh);
    if (this.collideFn) {
      const hit = this.collideFn(eye, desired, 0.3);
      if (hit) desired.copy(hit);
    }
    // never sink below the terrain
    if (this.terrainH) {
      const minY = this.terrainH(desired.x, desired.z) + 0.35;
      if (desired.y < minY) desired.y = minY;
    }
    // recoil kick: temporary extra distance + slight pitch offset
    let kick = 0;
    if (this.recoilKick > 0) { kick = this.recoilKick; desired.addScaledVector(back, kick); }
    this.cam.position.lerp(desired, 1 - Math.pow(0.00005, dt));
    this.cam.lookAt(eye.x + f.x * 10, eye.y + f.y * 10, eye.z + f.z * 10);
    // hide body when the camera is pushed right up against it
    if (this.onTooClose) this.onTooClose(this.cam.position.distanceTo(eye) < (this.tooCloseDist || 1.25));
  }
}
