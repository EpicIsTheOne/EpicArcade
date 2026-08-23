// Physics: swept AABB collision vs static world colliders + build pieces.
// Colliders: axis-aligned boxes {min:[x,y,z], max:[x,y,z], ref?, kind?}.

export function aabbOverlap(a, b) {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
         a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
         a.min[2] < b.max[2] && a.max[2] > b.min[2];
}

// Slab-method ray vs box; dir need not be normalized (t in units of |dir|).
export function rayBox(o, d, box, maxT) {
  let tmin = 0, tmax = maxT;
  // X
  if (Math.abs(d.x) < 1e-9) { if (o.x < box.min[0] || o.x > box.max[0]) return null; }
  else {
    let t1 = (box.min[0] - o.x) / d.x, t2 = (box.max[0] - o.x) / d.x;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  // Y
  if (Math.abs(d.y) < 1e-9) { if (o.y < box.min[1] || o.y > box.max[1]) return null; }
  else {
    let t1 = (box.min[1] - o.y) / d.y, t2 = (box.max[1] - o.y) / d.y;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  // Z
  if (Math.abs(d.z) < 1e-9) { if (o.z < box.min[2] || o.z > box.max[2]) return null; }
  else {
    let t1 = (box.min[2] - o.z) / d.z, t2 = (box.max[2] - o.z) / d.z;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  const t = tmin;
  const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
  const eps = 0.002;
  let nx = 0, ny = 0, nz = 0;
  if (Math.abs(px - box.min[0]) < eps) nx = -1; else if (Math.abs(px - box.max[0]) < eps) nx = 1;
  else if (Math.abs(py - box.min[1]) < eps) ny = -1; else if (Math.abs(py - box.max[1]) < eps) ny = 1;
  else if (Math.abs(pz - box.min[2]) < eps) nz = -1; else nz = 1;
  return { t, point: [px, py, pz], normal: [nx, ny, nz] };
}

export class PhysicsWorld {
  constructor() {
    this.static = [];       // world colliders
    this.builds = new Map(); // key "cx,cy,cz" -> collider for structure pieces
    this.all = () => [...this.static, ...this.builds.values()];
  }

  addStatic(box) { this.static.push(box); return box; }
  removeStatic(box) { const i = this.static.indexOf(box); if (i >= 0) this.static.splice(i, 1); }
  clearStatic() { this.static.length = 0; }
  setBuild(key, box) { this.builds.set(key, box); }
  removeBuild(key) { this.builds.delete(key); }
  getBuild(key) { return this.builds.get(key); }

  _iter(cb) {
    for (let i = 0; i < this.static.length; i++) if (cb(this.static[i])) return;
    for (const b of this.builds.values()) if (cb(b)) return;
  }

  raycast(origin, dir, maxDist) {
    let bestT = maxDist, hit = null;
    const scan = (b) => {
      const r = rayBox(origin, dir, b, bestT);
      if (r && r.t < bestT) { bestT = r.t; hit = { t: r.t, point: r.point, normal: r.normal, box: b }; }
      return false;
    };
    this._iter(scan);
    return hit;
  }

  // Ground height under (x,z): terrain baseline, raised by collider tops within step range.
  groundAt(x, z, fromY, stepUp, terrainH) {
    let g = terrainH(x, z);
    this._iter((b) => {
      if (x >= b.min[0] - 0.25 && x <= b.max[0] + 0.25 && z >= b.min[2] - 0.25 && z <= b.max[2] + 0.25) {
        if (b.max[1] <= fromY + stepUp && b.max[1] > g) g = b.max[1];
      }
      return false;
    });
    return g;
  }

  ceilingAt(x, z, fromY) {
    let c = Infinity;
    this._iter((b) => {
      if (x >= b.min[0] - 0.25 && x <= b.max[0] + 0.25 && z >= b.min[2] - 0.25 && z <= b.max[2] + 0.25) {
        if (b.min[1] >= fromY - 1.9 && b.min[1] < c) c = b.min[1];
      }
      return false;
    });
    return c;
  }

  // Move an AABB body with substepped per-axis sweeps.
  moveBody(body, dt) {
    const res = { onGround: false, hitXZ: false, hitCeil: false };
    const speed = Math.hypot(body.vel.x, body.vel.y, body.vel.z);
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.3));
    const sdt = dt / steps;
    const R = body.radius, H = body.height;
    for (let s = 0; s < steps; s++) {
      // ---- Y ----
      body.pos.y += body.vel.y * sdt;
      let box = { min: [body.pos.x - R, body.pos.y, body.pos.z - R], max: [body.pos.x + R, body.pos.y + H, body.pos.z + R] };
      this._iter((b) => {
        if (!aabbOverlap(box, b)) return false;
        if (body.vel.y <= 0) {
          body.pos.y = b.max[1] + 0.001;
          res.onGround = true;
        } else {
          body.pos.y = b.min[1] - H - 0.001;
          res.hitCeil = true;
        }
        body.vel.y = 0;
        return false;
      });
      // ---- X ----
      if (body.vel.x !== 0) {
        body.pos.x += body.vel.x * sdt;
        box = { min: [body.pos.x - R, body.pos.y, body.pos.z - R], max: [body.pos.x + R, body.pos.y + H, body.pos.z + R] };
        this._iter((b) => {
          if (!aabbOverlap(box, b)) return false;
          if (body.vel.x > 0) body.pos.x = b.min[0] - R - 0.001;
          else body.pos.x = b.max[0] + R + 0.001;
          body.vel.x = 0; res.hitXZ = true;
          return false;
        });
      }
      // ---- Z ----
      if (body.vel.z !== 0) {
        body.pos.z += body.vel.z * sdt;
        box = { min: [body.pos.x - R, body.pos.y, body.pos.z - R], max: [body.pos.x + R, body.pos.y + H, body.pos.z + R] };
        this._iter((b) => {
          if (!aabbOverlap(box, b)) return false;
          if (body.vel.z > 0) body.pos.z = b.min[2] - R - 0.001;
          else body.pos.z = b.max[2] + R + 0.001;
          body.vel.z = 0; res.hitXZ = true;
          return false;
        });
      }
    }
    return res;
  }
}
