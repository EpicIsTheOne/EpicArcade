// LIMINAL DYNAMICS — custom AABB physics with portal-aware traversal
import * as THREE from 'three';

const EPS = 1e-5;

export class AABB {
  constructor(min, max) {
    this.min = min.clone(); this.max = max.clone();
  }
  static fromCenterHalf(c, h) {
    return new AABB(
      new THREE.Vector3(c.x - h.x, c.y - h.y, c.z - h.z),
      new THREE.Vector3(c.x + h.x, c.y + h.y, c.z + h.z));
  }
  translate(v) { this.min.add(v); this.max.add(v); return this; }
  overlaps(o) {
    return this.min.x < o.max.x - EPS && this.max.x > o.min.x + EPS &&
           this.min.y < o.max.y - EPS && this.max.y > o.min.y + EPS &&
           this.min.z < o.max.z - EPS && this.max.z > o.min.z + EPS;
  }
}

export class PhysicsWorld {
  constructor() {
    this.solids = [];        // {aabb, portalable, host (portal id), tag}
    this.dynamics = [];      // DynamicBody
    this.portals = {};       // id -> portal record {id, active, pos, n, right, up, rx, ry, host}
    this.gravity = -23;
    this.linked = () => !!(this.portals.blue?.active && this.portals.amber?.active);
  }

  addSolid(min, max, opts = {}) {
    const s = { aabb: new AABB(min, max), portalable: !!opts.portalable, host: null, tag: opts.tag || '' };
    this.solids.push(s);
    return s;
  }

  registerPortal(id, rec) { rec.id = id; this.portals[id] = rec; }

  other(id) { return id === 'blue' ? this.portals.amber : this.portals.blue; }

  // Is entity inside a portal's passage zone? Returns the SET of solids to exclude
  // (the portal's host panel AND anything else intersecting the passage volume —
  // e.g. the structural wall behind a decorative panel) so the entity can physically
  // reach and cross the portal plane.
  portalZone(pos, half) {
    if (!this.linked()) return null;
    for (const id of ['blue', 'amber']) {
      const p = this.portals[id];
      const rel = pos.clone().sub(p.pos);
      const d = rel.dot(p.n);
      if (d > 0.5 || d < -1.3) continue;
      const x = rel.dot(p.right), y = rel.dot(p.up);
      const mx = p.rx * 0.9 + half.x * 0.2, my = p.ry * 0.9 + half.y * 0.2;
      if (Math.abs(x) < mx && Math.abs(y) < my) {
        // swept passage AABB: oval extents swept along the normal (-0.35 .. +0.75)
        const min = new THREE.Vector3(1e9, 1e9, 1e9), max = new THREE.Vector3(-1e9, -1e9, -1e9);
        for (const s of [-0.35, 0.75]) {
          for (const a of [-p.rx, p.rx]) {
            for (const b of [-p.ry, p.ry]) {
              const cx = p.pos.x + p.right.x * a + p.up.x * b + p.n.x * s;
              const cy = p.pos.y + p.right.y * a + p.up.y * b + p.n.y * s;
              const cz = p.pos.z + p.right.z * a + p.up.z * b + p.n.z * s;
              min.x = Math.min(min.x, cx); max.x = Math.max(max.x, cx);
              min.y = Math.min(min.y, cy); max.y = Math.max(max.y, cy);
              min.z = Math.min(min.z, cz); max.z = Math.max(max.z, cz);
            }
          }
        }
        const box = new AABB(min, max);
        const excluded = new Set();
        for (const sol of this.solids) {
          if (box.overlaps(sol.aabb)) excluded.add(sol);
        }
        return excluded;
      }
    }
    return null;
  }

  // Transform through a->b. Returns true if teleported.
  // ent: {pos, vel, half, lastSide:{}} ; onTeleport(ent, fromId) callback
  checkTraversal(ent, onTeleport) {
    if (!this.linked()) return false;
    for (const id of ['blue', 'amber']) {
      const p = this.portals[id], q = this.other(id);
      const rel = ent.pos.clone().sub(p.pos);
      const d = rel.dot(p.n);
      const prev = ent.lastSide[id] ?? d;
      ent.lastSide[id] = d;
      if (prev > 0 && d <= 0) {
        const x = rel.dot(p.right), y = rel.dot(p.up);
        if (Math.abs(x) < p.rx * 1.05 && Math.abs(y) < p.ry * 1.05) {
          this.teleport(ent, id, q.id);
          if (onTeleport) onTeleport(ent, id, q.id);
          return true;
        }
      }
    }
    return false;
  }

  teleport(ent, fromId, toId) {
    const T = portalXform(this.portals[fromId], this.portals[toId]);
    ent.pos.applyMatrix4(T);
    const n = this.portals[toId].n;
    ent.pos.addScaledVector(n, 0.06);
    if (ent.vel) ent.vel.applyMatrix4(new THREE.Matrix4().extractRotation(T));
    // refresh side cache so we don't instantly re-trigger
    for (const pid of ['blue', 'amber']) {
      const pp = this.portals[pid];
      ent.lastSide[pid] = ent.pos.clone().sub(pp.pos).dot(pp.n) + 0.001;
    }
    ent.justPortaled = performance.now();
  }

  // Move an AABB body. mutates ent.pos/ent.vel. Returns flags.
  moveBody(ent, dt, opts = {}) {
    const half = ent.half;
    const flags = { onGround: false, groundSolid: null, hitWall: false, ceiling: false };
    const excluded = this.linked() ? this.portalZone(ent.pos, half) : null;
    const solidsToTest = () => this.solids.filter(s => !s.disabled && !(excluded && excluded.has(s)));

    const tryAxis = (axis, delta, list) => {
      if (delta === 0) return false;
      ent.pos[axis] += delta;
      const box = AABB.fromCenterHalf(ent.pos, half);
      let hit = null;
      for (const s of list) {
        if (!box.overlaps(s.aabb)) continue;
        hit = s;
        // step-up: small ledges/stairs are climbed automatically (player only)
        if (opts.stepHeight && axis !== 'y') {
          const feet = ent.pos.y - half.y;
          const rise = s.aabb.max.y - feet;
          if (rise > 0 && rise <= opts.stepHeight) {
            const lifted = AABB.fromCenterHalf(
              new THREE.Vector3(ent.pos.x, s.aabb.max.y + half.y + EPS, ent.pos.z), half);
            let blocked = false;
            for (const s2 of list) {
              if (s2 !== s && lifted.overlaps(s2.aabb)) { blocked = true; break; }
            }
            if (!blocked) {
              ent.pos.y = s.aabb.max.y + half.y + EPS;
              const nb = AABB.fromCenterHalf(ent.pos, half);
              if (!nb.overlaps(s.aabb)) { hit = null; continue; }
            }
          }
        }        // clamp back to face
        if (delta > 0) ent.pos[axis] = (axis === 'x' ? s.aabb.min.x : axis === 'y' ? s.aabb.min.y : s.aabb.min.z) - half[axis] - EPS;
        else ent.pos[axis] = (axis === 'x' ? s.aabb.max.x : axis === 'y' ? s.aabb.max.y : s.aabb.max.z) + half[axis] + EPS;
        break;
      }
      return hit;
    };

    const list = solidsToTest();

    // X
    if (tryAxis('x', ent.vel.x * dt, list)) { flags.hitWall = true; ent.vel.x = 0; }
    // Z
    if (tryAxis('z', ent.vel.z * dt, list)) { flags.hitWall = true; ent.vel.z = 0; }
    // Y
    const dy = ent.vel.y * dt;
    if (dy !== 0) {
      ent.pos.y += dy;
      const box = AABB.fromCenterHalf(ent.pos, half);
      for (const s of list) {
        if (!box.overlaps(s.aabb)) continue;
        if (dy < 0) {
          ent.pos.y = s.aabb.max.y + half.y + EPS;
          if (opts.stepHeight && !flags.onGround) { /* noop */ }
          flags.onGround = true; flags.groundSolid = s;
          ent.vel.y = 0;
        } else {
          ent.pos.y = s.aabb.min.y - half.y - EPS;
          flags.ceiling = true;
          ent.vel.y = Math.min(ent.vel.y, 0);
        }
        break;
      }
    }

    // dynamic box obstacles for the player
    if (ent.isPlayer && this.dynamics.length) {
      const pbox = AABB.fromCenterHalf(ent.pos, half);
      for (const b of this.dynamics) {
        if (b.held || b.frozen) continue;
        const bb = AABB.fromCenterHalf(b.pos, b.half);
        if (!pbox.overlaps(bb)) continue;
        // push the box away horizontally, keep player clamped this frame
        const dx = ent.pos.x - b.pos.x, dz = ent.pos.z - b.pos.z;
        if (Math.abs(dx) > Math.abs(dz)) b.vel.x += Math.sign(dx) * 3.2; else b.vel.z += Math.sign(dz) * 3.2;
        // re-clamp player against current box
        const cx = Math.max(bb.min.x, Math.min(ent.pos.x, bb.max.x));
        const cz = Math.max(bb.min.z, Math.min(ent.pos.z, bb.max.z));
        // if vertically overlapping, push player out horizontally minimal axis
        if (ent.pos.y - half.y < bb.max.y - 0.02 && ent.pos.y + half.y > bb.min.y + 0.02) {
          const px = (ent.pos.x < b.pos.x ? bb.min.x - half.x : bb.max.x + half.x);
          const pz = (ent.pos.z < b.pos.z ? bb.min.z - half.z : bb.max.z + half.z);
          if (Math.abs(px - ent.pos.x) < Math.abs(pz - ent.pos.z)) ent.pos.x = px; else ent.pos.z = pz;
        }
      }
    }

    return flags;
  }

  stepDynamics(dt, playerEnt) {
    for (const b of this.dynamics) {
      if (b.frozen) continue;
      if (b.held) continue; // held bodies are moved by carrier logic
      b.vel.y += this.gravity * dt * (b.floatsInGoo ? -0.4 : 1);
      b.vel.y = Math.max(b.vel.y, -55);
      // integrate with collision (boxes are axis aligned, spin is cosmetic)
      const excluded = this.linked() ? this.portalZone(b.pos, b.half) : null;
      const list = this.solids.filter(s => !s.noDyn && !s.disabled && !(excluded && excluded.has(s)));
      const tryAxis = (axis, delta) => {
        if (delta === 0) return false;
        b.pos[axis] += delta;
        const box = AABB.fromCenterHalf(b.pos, b.half);
        for (const s of list) {
          if (!box.overlaps(s.aabb)) continue;
          if (delta > 0) b.pos[axis] = (axis === 'x' ? s.aabb.min.x : axis === 'y' ? s.aabb.min.y : s.aabb.min.z) - b.half[axis] - EPS;
          else b.pos[axis] = (axis === 'x' ? s.aabb.max.x : axis === 'y' ? s.aabb.max.y : s.aabb.max.z) + b.half[axis] + EPS;
          return s;
        }
        return null;
      };
      if (tryAxis('x', b.vel.x * dt)) { b.vel.x *= -0.12; b.spin.x *= 0.5; }
      if (tryAxis('z', b.vel.z * dt)) { b.vel.z *= -0.12; b.spin.z *= 0.5; }
      let grounded = false;
      const sy = tryAxis('y', b.vel.y * dt);
      if (sy) {
        if (b.vel.y < 0) {
          grounded = true;
          if (b.vel.y < -9) b.impact = Math.min(1, -b.vel.y / 30);
        }
        b.vel.y = b.vel.y < 0 ? 0 : Math.min(b.vel.y, 0);
      }
      // friction
      const f = grounded ? Math.max(0, 1 - 9 * dt) : Math.max(0, 1 - 0.22 * dt);
      b.vel.x *= f; b.vel.z *= f;
      // box-box separation (simple, positional)
      for (const o of this.dynamics) {
        if (o === b || o.held || o.frozen) continue;
        const A = AABB.fromCenterHalf(b.pos, b.half), B = AABB.fromCenterHalf(o.pos, o.half);
        if (!A.overlaps(B)) continue;
        const ox = Math.min(A.max.x - B.min.x, B.max.x - A.min.x);
        const oz = Math.min(A.max.z - B.min.z, B.max.z - A.min.z);
        const oy = Math.min(A.max.y - B.min.y, B.max.y - A.min.y);
        if (oy <= ox && oy <= oz) {
          const dir = b.pos.y > o.pos.y ? 1 : -1;
          b.pos.y += dir * oy / 2; o.pos.y -= dir * oy / 2;
          const swap = Math.min(0, b.vel.y - o.vel.y);
          b.vel.y = o.vel.y; o.vel.y = b.vel.y + 0; // crude stack damping
          o.vel.y += 0; b.vel.y = Math.max(b.vel.y, 0);
        } else if (ox <= oz) {
          const dir = b.pos.x > o.pos.x ? 1 : -1;
          b.pos.x += dir * ox / 2 + dir * EPS; o.pos.x -= dir * ox / 2 - dir * EPS;
          const t = b.vel.x; b.vel.x = o.vel.x * 0.5; o.vel.x = t * 0.5;
        } else {
          const dir = b.pos.z > o.pos.z ? 1 : -1;
          b.pos.z += dir * oz / 2 + dir * EPS; o.pos.z -= dir * oz / 2 - dir * EPS;
          const t = b.vel.z; b.vel.z = o.vel.z * 0.5; o.vel.z = t * 0.5;
        }
      }
      // traversal
      this.checkTraversal(b, (ent, from, to) => {
        b.lastPortal = { from, to, t: performance.now() };
        b.spin.set((Math.random() - .5) * 4, 0, (Math.random() - .5) * 4);
      });
      // cosmetic spin decay
      b.spin.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
    }
  }
}

// Build transform matrix: exit <- rotY(pi) <- entry-inverse
const _rotYpi = new THREE.Matrix4().makeRotationY(Math.PI);
export function portalXform(a, b) {
  const ma = new THREE.Matrix4().makeBasis(a.right, a.up, a.n).setPosition(a.pos);
  const mb = new THREE.Matrix4().makeBasis(b.right, b.up, b.n).setPosition(b.pos);
  return mb.clone().multiply(_rotYpi).multiply(ma.clone().invert());
}

// Raycast a ray (origin, dir normalized, maxDist) against world solids.
// Returns {dist, point, normal, solid} or null. Slab method.
export function raycastWorld(world, origin, dir, maxDist = 100, opts = {}) {
  let best = null;
  for (const s of world.solids) {
    if (opts.ignore === s || s.disabled) continue;
    const res = raySlab(origin, dir, s.aabb, maxDist);
    if (res && (!best || res.dist < best.dist)) best = { ...res, solid: s };
  }
  return best;
}

export function raySlab(origin, dir, box, maxDist) {
  let tmin = 0, tmax = maxDist;
  const axes = ['x', 'y', 'z'];
  let nAxis = -1, nSign = 0;
  for (let i = 0; i < 3; i++) {
    const ax = axes[i];
    const o = origin[ax], d = dir[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[ax] || o > box.max[ax]) return null;
    } else {
      let t1 = (box.min[ax] - o) / d, t2 = (box.max[ax] - o) / d;
      let sign = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = ax; nSign = sign; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0 || tmin > maxDist || (tmin === 0 && nAxis === -1)) return null;
  const point = origin.clone().addScaledVector(dir, tmin);
  const normal = new THREE.Vector3();
  if (nAxis !== -1) normal[nAxis] = nSign;
  return { dist: tmin, point, normal };
}

// Segment vs portal-plane crossing within oval. Used for held-object targets.
export function segmentPortalXform(a, b, p0, p1) {
  const d0 = p0.clone().sub(a.pos).dot(a.n);
  const d1 = p1.clone().sub(a.pos).dot(a.n);
  if (d0 > 0 === d1 > 0 || d0 > 0.4 || d0 < -1.2) return null;
  const t = d0 / (d0 - d1);
  const pt = p0.clone().lerp(p1, t);
  const rel = pt.clone().sub(a.pos);
  const x = rel.dot(a.right), y = rel.dot(a.up);
  if (Math.abs(x) > a.rx || Math.abs(y) > a.ry) return null;
  const T = portalXform(a, b);
  return { point: pt.applyMatrix4(T), T };
}
