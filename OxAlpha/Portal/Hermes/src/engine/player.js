// LIMINAL DYNAMICS — first-person controller with portal traversal
import * as THREE from 'three';

const EYE = 1.62;          // eye height above feet
const RADIUS = 0.36;
const HEIGHT = 1.8;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(0, 2, 0);       // center of AABB
    this.vel = new THREE.Vector3();
    this.half = new THREE.Vector3(RADIUS, HEIGHT / 2, RADIUS);
    this.isPlayer = true;
    this.yaw = 0;                                 // radians; yaw=0 looks toward -Z
    this.pitch = 0;
    this.onGround = false;
    this.groundSolid = null;
    this.lastSide = {};
    this.justPortaled = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airControl = 0.4;
    this.speed = 6.2;
    this.dead = false;
    this.spawn = { pos: new THREE.Vector3(), yaw: 0 };
    this.traversalCount = 0;
    this.events = {};
  }

  spawnAt(p, yaw = 0) {
    this.spawn.pos.copy(p);
    this.spawn.yaw = yaw;
    this.respawn(true);
  }

  respawn(hard = false) {
    this.pos.copy(this.spawn.pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.spawn.yaw;
    this.pitch = 0;
    this.dead = false;
    if (hard) this.lastSide = {};
    for (const id of ['blue', 'amber']) {
      const p = this.world.portals[id];
      this.lastSide[id] = p && p.active ? this.pos.clone().sub(p.pos).dot(p.n) : undefined;
    }
  }

  // Standard non-inverted mouse-look:
  //   mouse right (dx>0) -> turn right ; mouse up (dy<0 in browser movementY) -> look up.
  look(dx, dy) {
    const s = this.lookScale || 1;
    this.yaw -= dx * 0.0022 * s * (this.invertX ? -1 : 1);
    this.pitch -= dy * 0.0022 * s * (this.invertY ? -1 : 1);
    const LIM = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-LIM, Math.min(LIM, this.pitch));
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  rightVec() {
    const f = this.forward();
    return new THREE.Vector3(-f.z, 0, f.x);   // f x up => strafe RIGHT
  }

  update(dt, input) {
    if (this.dead) return {};
    const w = this.world;

    const f = this.forward(), r = this.rightVec();
    const ix = (input.d ? 1 : 0) - (input.a ? 1 : 0);
    const iz = (input.w ? 1 : 0) - (input.s ? 1 : 0);
    const wish = new THREE.Vector3().addScaledVector(f, iz).addScaledVector(r, ix);
    if (wish.lengthSq() > 0) wish.normalize();

    const targetSpeed = this.speed * (input.sprint ? 1.55 : 1);
    const accel = (this.onGround ? 60 : 60 * this.airControl);
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const cur = hv.dot(wish);
    const add = Math.min(Math.max(targetSpeed - cur, 0), accel * dt);
    hv.addScaledVector(wish, add);
    if (this.onGround && wish.lengthSq() === 0) hv.multiplyScalar(Math.max(0, 1 - 11 * dt));
    else if (!this.onGround) hv.multiplyScalar(1 - 0.055 * dt);
    this.vel.x = hv.x; this.vel.z = hv.z;

    if (input.jumpQueued) { this.jumpBuffer = 0.14; input.jumpQueued = false; }
    this.jumpBuffer -= dt;
    this.coyote = this.onGround ? 0.12 : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = 8.4;
      this.onGround = false; this.coyote = 0; this.jumpBuffer = 0;
      this.events.onJump?.();
    }

    this.vel.y += w.gravity * dt;
    this.vel.y = Math.max(this.vel.y, -60);

    // integrate & collide (portal-aware); player can step up 0.55 m ledges
    const flags = w.moveBody(this, dt, { stepHeight: 0.55 });
    this.onGround = flags.onGround;
    this.groundSolid = flags.groundSolid;

    w.checkTraversal(this, () => {
      this.traversalCount++;
      this.justPortaled = performance.now();
      this.events.onPortal?.();
    });

    return flags;
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + (EYE - HEIGHT / 2), this.pos.z);
  }
}
