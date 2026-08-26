// Collision world: static triangle soup + uniform XZ hash grid.
// Fast raycasts for the character controller; supports arbitrary geometry
// including loops, half-pipes and ramps. Dynamic platforms handled separately.
import * as THREE from 'three';

const CELL = 12;
const key = (ix, iz) => ix * 73856093 ^ iz * 19349663; // int hash

export class CollisionWorld {
  constructor() {
    this.tris = [];          // {ax,ay,az,bx,by,bz,cx,cy,cz,nx,ny,nz, mat}  mat: 0 solid 1 no-land(decor) 
    this.grid = new Map();   // hash -> array of tri indices
    this.rails = [];         // {pts:[Vector3...], cum:[len], total, closed}
    this.dynamics = [];      // kinematic boxes {mesh, size, prevPos, vel, quat?}
  }
  addTriangle(a, b, c, mat = 0) {
    const t = {
      ax: a.x, ay: a.y, az: a.z,
      bx: b.x, by: b.y, bz: b.z,
      cx: c.x, cy: c.y, cz: c.z,
      nx: 0, ny: 1, nz: 0, mat
    };
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
    const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    t.nx = nx / l; t.ny = ny / l; t.nz = nz / l;
    const idx = this.tris.length;
    this.tris.push(t);
    // insert into grid cells overlapped by AABB (xz)
    const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x);
    const minz = Math.min(a.z, b.z, c.z), maxz = Math.max(a.z, b.z, c.z);
    if (maxx - minx > CELL * 24) return; // huge tri (safety): skip grid, rarely queried via cells
    const i0 = Math.floor(minx / CELL), i1 = Math.floor(maxx / CELL);
    const j0 = Math.floor(minz / CELL), j1 = Math.floor(maxz / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(idx);
    }
  }
  addRail(pts, closed = false) {
    const cum = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { total += pts[i].distanceTo(pts[i - 1]); cum.push(total); }
    this.rails.push({ pts, cum, total, closed });
  }

  _cellsForAABB(minx, minz, maxx, maxz, out) {
    out.length = 0;
    const i0 = Math.floor(minx / CELL), i1 = Math.floor(maxx / CELL);
    const j0 = Math.floor(minz / CELL), j1 = Math.floor(maxz / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.grid.get(key(i, j));
      if (arr) out.push(arr);
    }
  }
  _scratch = [];
  _scratchSeen = new Set();

  // Segment raycast. Returns closest hit {t, x,y,z, nx,ny,nz, tri} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const ex = ox + dx * maxDist, ey = oy + dy * maxDist, ez = oz + dz * maxDist;
    const minx = Math.min(ox, ex) - 0.5, maxx = Math.max(ox, ex) + 0.5;
    const minz = Math.min(oz, ez) - 0.5, maxz = Math.max(oz, ez) + 0.5;
    const cellArrs = this._scratch;
    this._cellsForAABB(minx, minz, maxx, maxz, cellArrs);
    const seen = this._scratchSeen; seen.clear();
    let bestT = Infinity, best = null;
    for (const arr of cellArrs) {
      for (let ii = 0; ii < arr.length; ii++) {
        const idx = arr[ii];
        if (seen.has(idx)) continue;
        seen.add(idx);
        const t = this.tris[idx];
        const h = rayTri(ox, oy, oz, dx, dy, dz, t, bestT);
        if (h && h.t < bestT) { bestT = h.t; best = h; best.tri = t; }
      }
    }
    return best;
  }

  // Closest surface point within radius around p (for ground snap when between tris).
  // Uses downward-ish raycasts; kept simple: controller uses rays only.

  // Nearest rail point within radius of p. Returns {rail, s, point, tangent, dist} or null.
  nearestRail(p, radius) {
    let best = null;
    for (const r of this.rails) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
        const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
        const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
        let u = (apx * abx + apy * aby + apz * abz) / len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const qx = a.x + abx * u, qy = a.y + aby * u, qz = a.z + abz * u;
        const d = Math.hypot(p.x - qx, p.y - qy, p.z - qz);
        if (d < radius && (!best || d < best.dist)) {
          const invL = 1 / Math.sqrt(len2);
          best = {
            rail: r, seg: i, u, dist: d,
            point: new THREE.Vector3(qx, qy, qz),
            tangent: new THREE.Vector3(abx * invL, aby * invL, abz * invL)
          };
        }
      }
    }
    return best;
  }
}

const _e1 = { x: 0, y: 0, z: 0 }, _e2 = { x: 0, y: 0, z: 0 }, _pv = { x: 0, y: 0, z: 0 }, _qv = { x: 0, y: 0, z: 0 };
function rayTri(ox, oy, oz, dx, dy, dz, t, maxT) {
  // Möller–Trumbore
  _e1.x = t.bx - t.ax; _e1.y = t.by - t.ay; _e1.z = t.bz - t.az;
  _e2.x = t.cx - t.ax; _e2.y = t.cy - t.ay; _e2.z = t.cz - t.az;
  _pv.x = dy * _e2.z - dz * _e2.y; _pv.y = dz * _e2.x - dx * _e2.z; _pv.z = dx * _e2.y - dy * _e2.x;
  const det = _e1.x * _pv.x + _e1.y * _pv.y + _e1.z * _pv.z;
  if (det > -1e-9 && det < 1e-9) return null;
  const invDet = 1 / det;
  _qv.x = ox - t.ax; _qv.y = oy - t.ay; _qv.z = oz - t.az;
  const u = (_qv.x * _pv.x + _qv.y * _pv.y + _qv.z * _pv.z) * invDet;
  if (u < -1e-6 || u > 1.000001) return null;
  const tvx = _qv.y * _e1.z - _qv.z * _e1.y, tvy = _qv.z * _e1.x - _qv.x * _e1.z, tvz = _qv.x * _e1.y - _qv.y * _e1.x;
  const v = (dx * tvx + dy * tvy + dz * tvz) * invDet;
  if (v < -1e-6 || u + v > 1.000001) return null;
  const tt = (_e2.x * tvx + _e2.y * tvy + _e2.z * tvz) * invDet;
  if (tt < 1e-6 || tt > maxT) return null;
  return { t: tt, x: ox + dx * tt, y: oy + dy * tt, z: oz + dz * tt, nx: t.nx, ny: t.ny, nz: t.nz };
}

export { key };
