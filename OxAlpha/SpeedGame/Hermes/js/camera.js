/* ============================================================
   VOLT RUSH — camera.js
   High-speed chase camera:
   - pointer-lock orbit yaw/pitch (non-inverted by default)
   - velocity anticipation, adaptive FOV, boost kick
   - obstacle probe (pull-in, no clipping), decaying shake
   - loop/wall orientation via smoothed up-vector
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  class ChaseCamera {
    constructor(camera3, world) {
      this.cam = camera3;
      this.world = world;
      this.yaw = 0;            // orbit yaw (rad)
      this.pitch = 0.18;       // orbit pitch (rad), positive = above
      this.sensX = 0.0026;
      this.sensY = 0.0022;
      this.invertX = false;
      this.invertY = false;

      this.dist = 6.6;
      this.baseFov = 74;
      this.maxFovKick = 26;

      this.pos = new (T().Vector3)(0, 6, 10);
      this.look = new (T().Vector3)();
      this.upSm = new (T().Vector3)(0, 1, 0);

      this.shake = 0;
      this.fovKick = 0;
      this._tmpV = new (T().Vector3)();
      this._tmpV2 = new (T().Vector3)();
      this.freeLook = 0;       // time since user moved mouse; auto-recenter behind motion
      this.autoCenterDelay = 2.2;
    }

    applyMouse(dx, dy) {
      const sx = this.invertX ? -dx : dx;
      const sy = this.invertY ? -dy : dy;
      // Mouse RIGHT (dx>0) => yaw decreases => view turns RIGHT (three.js -Y rotation)
      this.yaw -= sx * this.sensX;
      // Mouse UP (dy<0) => pitch increases => look UP
      this.pitch -= sy * this.sensY;
      this.pitch = clamp(this.pitch, -0.55, 1.15);
      if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
      if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
      this.freeLook = 0;
    }

    addShake(a) { this.shake = Math.min(1.4, this.shake + a); }
    addFovKick(a) { this.fovKick = Math.min(this.maxFovKick, this.fovKick + a); }

    update(dt, player, game) {
      const V = T().Vector3;
      const p = player.pos;
      const speed = player.speed();
      const sp01 = clamp(speed / CFG_REF().hardMax, 0, 1);

      // ---- auto-recenter softly behind movement when user idle ----
      this.freeLook += dt;
      const hSpeed = Math.hypot(player.vel.x, player.vel.z);
      if (this.freeLook > this.autoCenterDelay && hSpeed > 8 && player.state !== 'wall') {
        const moveYaw = Math.atan2(-player.vel.x, -player.vel.z); // yaw that puts camera behind motion
        let d = moveYaw - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const strength = clamp((this.freeLook - this.autoCenterDelay) / 1.2, 0, 1) * clamp(hSpeed / 20, 0, 1);
        this.yaw += d * Math.min(1, dt * 2.2 * strength);
      }

      // ---- orientation mode ----
      const inLoop = player.state === 'loop' && player.loop;
      const onRail = player.state === 'rail';
      let upTarget = this._tmpV2.set(0, 1, 0);
      let anchor = null, tanRef = null;

      if (inLoop) {
        anchor = player.loop.spline.getPointAt(clamp(player.loopS, 0, player.loop.spline.totalLength), {});
        tanRef = player.loop.spline.getTangentAt(clamp(player.loopS, 0, player.loop.spline.totalLength), {});
        if (player.loopUp) upTarget.set(player.loopUp.x, player.loopUp.y, player.loopUp.z);
      } else {
        if (player.state === 'ground') {
          const n = player.groundNormal;
          if (n && n.y > 0.25) upTarget.set(n.x, n.y, n.z);
        } else if (onRail && player.railUp) {
          upTarget.set(player.railUp.x, player.railUp.y, player.railUp.z);
        }
      }
      // smooth the up vector (avoid pops when entering/exiting loops)
      const upK = Math.min(1, dt * (inLoop ? 10 : 5));
      this.upSm.lerp(upTarget, upK).normalize();

      // ---- build desired position & look target ----
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const cp = Math.cos(this.pitch), spp = Math.sin(this.pitch);

      // forward dir from yaw/pitch (yaw=0 -> looking -Z)
      let fwd;
      if (inLoop && tanRef) {
        // ride the loop: camera behind along tangent, using smoothed up
        fwd = this._tmpV.set(-tanRef.x * player.loopDir, -tanRef.y * player.loopDir, -tanRef.z * player.loopDir);
      } else {
        fwd = this._tmpV.set(s * cp, -spp, c * cp); // note: pitch>0 looks down at player
        fwd.normalize();
      }

      const lookPt = this._tmpV2.set(
        p.x + player.vel.x * 0.10,
        p.y + 1.05 + player.vel.y * 0.03,
        p.z + player.vel.z * 0.10
      );
      this.look.lerp(lookPt, Math.min(1, dt * 14));

      // desired camera distance: wider at speed
      const wantDist = this.dist * (1 + sp01 * 0.35) + (onRail ? 0.6 : 0);
      let desired;
      if (inLoop) {
        const u = this.upSm;
        desired = new V(
          this.look.x + fwd.x * wantDist + u.x * 2.1,
          this.look.y + fwd.y * wantDist + u.y * 2.1,
          this.look.z + fwd.z * wantDist + u.z * 2.1
        );
      } else {
        desired = new V(
          this.look.x + fwd.x * wantDist,
          this.look.y + fwd.y * wantDist + 0.55,
          this.look.z + fwd.z * wantDist
        );
      }

      // ---- obstacle probe: pull in instead of clipping ----
      let finalD = 1;
      const steps = 7;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const sxp = this.look.x + (desired.x - this.look.x) * t;
        const syp = this.look.y + (desired.y - this.look.y) * t;
        const szp = this.look.z + (desired.z - this.look.z) * t;
        const blocker = this.world.sphereHit(sxp, syp, szp, 0.45);
        if (blocker) { finalD = Math.max(0.35, t - 0.09); break; }
        finalD = t;
      }
      const targetPos = new V(
        this.look.x + (desired.x - this.look.x) * finalD,
        this.look.y + (desired.y - this.look.y) * finalD,
        this.look.z + (desired.z - this.look.z) * finalD
      );

      // ---- smoothing: fast catch-up at speed, snappy recovery after hits ----
      const lambda = 7 + sp01 * 7 + (this.shake > 0.4 ? 6 : 0);
      const k = 1 - Math.exp(-lambda * dt);
      this.pos.lerp(targetPos, k);

      // ---- shake decay & offset ----
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const sh = this.shake * this.shake;
      const shx = (Math.random() - 0.5) * sh * 0.5;
      const shy = (Math.random() - 0.5) * sh * 0.5;

      this.cam.position.set(this.pos.x + shx, this.pos.y + shy, this.pos.z);
      this.cam.up.copy(this.upSm);
      this.cam.lookAt(this.look.x + shx * 0.5, this.look.y + shy * 0.5, this.look.z);

      // ---- FOV: speed + kicks ----
      this.fovKick = Math.max(0, this.fovKick - dt * 30);
      const targetFov = this.baseFov + sp01 * this.maxFovKick + this.fovKick;
      if (Math.abs(this.cam.fov - targetFov) > 0.05) {
        this.cam.fov = lerp(this.cam.fov, targetFov, Math.min(1, dt * 6));
        this.cam.updateProjectionMatrix();
      }
    }
  }

  // late-bound config ref (avoids load-order dependency)
  let _cfg = null;
  function CFG_REF() {
    if (_cfg) return _cfg;
    _cfg = (window.VoltPlayer && window.VoltPlayer.CFG) || { hardMax: 60 };
    return _cfg;
  }

  window.VoltCamera = { ChaseCamera };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltCamera;
})();
