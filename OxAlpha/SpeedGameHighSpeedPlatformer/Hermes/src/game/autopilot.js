// autopilot.js — waypoint-driven virtual driver used by headless QA.
// Drives through the SAME input pipeline semantics as a human (virtual key
// state + camera steering), exercising the real game loop.
import * as THREE from 'three';

export class VirtualInput {
  constructor() {
    this.keys = Object.create(null);
    this.pressedNow = Object.create(null);
    this.mouseDX = 0; this.mouseDY = 0;
  }
  down(c) { return !!this.keys[c]; }
  justPressed(c) { return !!this.pressedNow[c]; }
  press(c) { this.keys[c] = true; this.pressedNow[c] = true; }
  release(c) { this.keys[c] = false; }
  endFrame() { this.pressedNow = Object.create(null); }
}

export class Autopilot {
  /** @param {import('./main.js').Game} game */
  constructor(game) {
    this.game = game;
    this.vinput = new VirtualInput();
    this.wpIndex = 1;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.jumpHoldT = 0;
    this.jumpCd = 0;
    this.log = [];
  }

  reset() {
    this.wpIndex = 1;
    this.stuckT = 0;
    this.lastPos.copy(this.game.player.pos);
  }

  update(dt) {
    const g = this.game, p = g.player, cam = g.chaseCam;
    const vi = this.vinput;
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    const wps = g.level.def.waypoints;
    if (!wps || wps.length === 0) return;

    // ---- waypoint progression ----
    let wp = new THREE.Vector3(...wps[Math.min(this.wpIndex, wps.length - 1)]);
    const dToWp = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
    if (dToWp < 9 || (Math.abs(wp.y - p.pos.y) < 4 && dToWp < 12)) {
      this.wpIndex = Math.min(this.wpIndex + 1, wps.length - 1);
      wp = new THREE.Vector3(...wps[this.wpIndex]);
    }
    // skip-ahead if we somehow passed it
    if (this.wpIndex < wps.length - 1) {
      for (let k = this.wpIndex + 1; k < Math.min(this.wpIndex + 3, wps.length); k++) {
        const nw = new THREE.Vector3(...wps[k]);
        if (nw.distanceTo(p.pos) < wp.distanceTo(p.pos) - 14) { this.wpIndex = k; wp = nw; }
      }
    }

    const to = new THREE.Vector3(wp.x - p.pos.x, 0, wp.z - p.pos.z);
    const dist = to.length(); to.normalize();

    // ---- steer camera toward travel direction (smooth) ----
    const desiredYaw = Math.atan2(to.x, to.z);
    let dyaw = desiredYaw - cam.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    cam.yaw += THREE.MathUtils.clamp(dyaw, -2.6 * dt, 2.6 * dt);
    cam.pitch = THREE.MathUtils.lerp(cam.pitch, 0.12, Math.min(1, dt * 2));

    // ---- keys from angle between camera fwd and desired dir ----
    const rel = dyaw; // negative => target is to the LEFT of view? verify: yaw increases CCW; if desiredYaw>camYaw need turn left(A)
    const wantLeft = rel > 0.06, wantRight = rel < -0.06;
    const hardTurn = Math.abs(rel) > 0.55;
    const hardCorner = Math.abs(rel) > 0.62;
    const straight = Math.abs(rel) < 0.25 && p.horizSpeed < 55 && p.boostMeter > 30;

    vi.keys['KeyW'] = dist > 4;
    vi.keys['KeyA'] = wantLeft;
    vi.keys['KeyD'] = wantRight;
    // brake for corners: big steering angle at speed => S
    vi.keys['KeyS'] = hardCorner && p.grounded && p.horizSpeed > 22;
    // don't boost into corners
    vi.keys['ShiftLeft'] = straight && !hardCorner && Math.abs(rel) < 0.35;

    // drift on hard turns at speed
    if (hardTurn && p.grounded && p.horizSpeed > 16 && Math.abs(rel) < 2.4) {
      vi.keys['KeyC'] = true;
    } else vi.keys['KeyC'] = false;

    // ---- jumping logic ----
    this.jumpHoldT -= dt;
    if (this.jumpHoldT <= 0) vi.release('Space');
    const aheadDist = 4 + p.speed * 0.42;
    const probeFrom = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z)
      .addScaledVector(new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)), aheadDist);
    const up = p.grounded;
    let gapAhead = false;
    if (up && !p.rail) {
      const hit = g.world.raycast(probeFrom, new THREE.Vector3(0, -1, 0), 9);
      if (!hit || probeFrom.y - hit.point.y > 7.5) gapAhead = true;
    }
    const wpAbove = wp.y > p.pos.y + 5;
    const wantJump = p.grounded && !p.rail && this.jumpCd <= 0 &&
      ((gapAhead) || (wpAbove && dist < 11));
    if (wantJump) {
      vi.press('Space');
      this.jumpHoldT = 0.16;
      this.jumpCd = 0.85;
      this._releaseSoon('Space', 110);
    }

    // strike dive when airborne & enemy roughly ahead
    if (!p.grounded && !p.dive.active && p.diveCd <= 0) {
      const tgt = g.findDiveTarget(p.pos, cam.yaw);
      if (tgt && tgt.pos.distanceTo(p.pos) < 20) vi.press('KeyF');
    }

    // ---- stuck / fall / teleport recovery ----
    if (p.pos.distanceTo(this.lastPos) > 25) {
      // respawned: resync waypoint index to nearest waypoint
      let bestI = this.wpIndex, bestD = Infinity;
      for (let i = 0; i < wps.length; i++) {
        const w = new THREE.Vector3(...wps[i]);
        const d = w.distanceTo(p.pos);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      this.wpIndex = Math.max(bestI, 1);
    }
    this.stuckT += dt;
    if (this.stuckT > 1.0) {
      if (p.pos.distanceTo(this.lastPos) < 2.5) {
        if (p.pos.y < g.level.killY + 5) {
          g.respawnPlayer(false);
        } else if (p.speed < 4) {
          // nudge back to previous waypoint then continue
          const back = Math.max(0, this.wpIndex - 1);
          const bw = new THREE.Vector3(...wps[back]);
          p.pos.set(bw.x, bw.y + 1.5, bw.z);
          p.vel.set(0, 0, 0);
          this.wpIndex = back + 1;
        }
      }
      this.lastPos.copy(p.pos);
      this.stuckT = 0;
    }
  }

  _releaseSoon(code, ms) {
    setTimeout(() => this.vinput.release(code), ms);
  }
}
