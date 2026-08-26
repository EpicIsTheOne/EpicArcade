// physics.js — static triangle-soup collision world with a uniform spatial hash.
// Built once per level from visible meshes; queried by sphere overlap & raycasts.
// Designed for high-speed continuous collision: the player sim runs fixed 240 Hz
// substeps, so max travel per substep (~0.4 u at 95 u/s) stays well under the
// player radius (0.85), preventing tunneling without needing CCD heuristics.
import * as THREE from 'three';

const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _ap = new THREE.Vector3();
const _bp = new THREE.Vector3(), _cp = new THREE.Vector3(), _nrm = new THREE.Vector3();
const _nab = new THREE.Vector3(), _nac = new THREE.Vector3();

function closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  // Real-Time Collision Detection (Ericson) closest-point-on-triangle
  _ab.set(bx - ax, by - ay, bz - az); _ac.set(cx - ax, cy - ay, cz - az);
  _ap.set(px - ax, py - ay, pz - az);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.set(ax, ay, az);
  _bp.set(px - bx, py - by, pz - bz);
  const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.set(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return out.set(ax + _ab.x * v, ay + _ab.y * v, az + _ab.z * v); }
  _cp.set(px - cx, py - cy, pz - cz);
  const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.set(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return out.set(ax + _ac.x * w, ay + _ac.y * w, az + _ac.z * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return out.set(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return out.set(ax + _ab.x * v + _ac.x * w, ay + _ab.y * v + _ac.y * w, az + _ab.z * v + _ac.z * w);
}

export class CollisionWorld {
  constructor(cellSize = 10) {
    this.cellSize = cellSize;
    this.tris = [];          // flat numbers: 9 per tri
    this.grid = new Map();   // "x,y,z" -> number[] tri indices
    this.built = false;
    this._queryStamp = 0;
    this._stamps = null;     // Int32Array per-tri stamp for dedupe
    this.rayHits = [];
  }

  addGeometry(geometry, matrixWorld) {
    if (this.built) throw new Error('CollisionWorld locked after build()');
    const geom = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = geom.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const m = matrixWorld;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(m);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
      const base = this.tris.length;
      this.tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      // grid cells covering tri AABB
      const minX = Math.floor(Math.min(a.x, b.x, c.x) / this.cellSize);
      const maxX = Math.floor(Math.max(a.x, b.x, c.x) / this.cellSize);
      const minY = Math.floor(Math.min(a.y, b.y, c.y) / this.cellSize);
      const maxY = Math.floor(Math.max(a.y, b.y, c.y) / this.cellSize);
      const minZ = Math.floor(Math.min(a.z, b.z, c.z) / this.cellSize);
      const maxZ = Math.floor(Math.max(a.z, b.z, c.z) / this.cellSize);
      for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) for (let gz = minZ; gz <= maxZ; gz++) {
        const key = gx + ',' + gy + ',' + gz;
        let cell = this.grid.get(key);
        if (!cell) { cell = []; this.grid.set(key, cell); }
        cell.push(base / 9);
      }
    }
  }

  build() {
    this.posArray = new Float32Array(this.tris);
    this.tris.length = 0;
    this.triCount = this.posArray.length / 9;
    this.normals = new Float32Array(this.triCount * 3);
    for (let t = 0; t < this.triCount; t++) {
      const o = t * 9;
      _nab.set(this.posArray[o + 3] - this.posArray[o], this.posArray[o + 4] - this.posArray[o + 1], this.posArray[o + 5] - this.posArray[o + 2]);
      _nac.set(this.posArray[o + 6] - this.posArray[o], this.posArray[o + 7] - this.posArray[o + 1], this.posArray[o + 8] - this.posArray[o + 2]);
      _nrm.crossVectors(_nab, _nac).normalize();
      this.normals[t * 3] = _nrm.x; this.normals[t * 3 + 1] = _nrm.y; this.normals[t * 3 + 2] = _nrm.z;
    }
    this._stamps = new Int32Array(this.triCount);
    this.built = true;
  }

  /** Gather candidate triangles around an AABB region. Calls cb(triIndex). */
  forEachCandidate(minX, minY, minZ, maxX, maxY, maxZ, cb) {
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), x1 = Math.floor(maxX / cs);
    const y0 = Math.floor(minY / cs), y1 = Math.floor(maxY / cs);
    const z0 = Math.floor(minZ / cs), z1 = Math.floor(maxZ / cs);
    const stamp = ++this._queryStamp;
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) for (let gz = z0; gz <= z1; gz++) {
      const cell = this.grid.get(gx + ',' + gy + ',' + gz);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const ti = cell[i];
        if (this._stamps[ti] === stamp) continue;
        this._stamps[ti] = stamp;
        cb(ti);
      }
    }
  }

  /**
   * Sphere vs world. Returns contacts into `outContacts` (array reused):
   * each entry {nx,ny,nz, depth} plus contact point. Returns count.
   */
  collideSphere(center, radius, outContacts, maxContacts = 16) {
    let n = 0;
    const r = radius;
    this.forEachCandidate(center.x - r, center.y - r, center.z - r,
      center.x + r, center.y + r, center.z + r, (ti) => {
        const o = ti * 9;
        closestPointOnTriangle(center.x, center.y, center.z,
          this.posArray[o], this.posArray[o + 1], this.posArray[o + 2],
          this.posArray[o + 3], this.posArray[o + 4], this.posArray[o + 5],
          this.posArray[o + 6], this.posArray[o + 7], this.posArray[o + 8], _v0);
        const dx = center.x - _v0.x, dy = center.y - _v0.y, dz = center.z - _v0.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq >= r * r || n >= maxContacts) return;
        let nx = this.normals[ti * 3], ny = this.normals[ti * 3 + 1], nz = this.normals[ti * 3 + 2];
        const dist = Math.sqrt(distSq);
        let depth = r - dist;
        if (dist > 1e-6) { // push away from surface along (center-closest)
          const inv = 1 / dist;
          const ux = dx * inv, uy = dy * inv, uz = dz * inv;
          if (ux * nx + uy * ny + uz * nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // inside: flip
          outContacts[n].nx = nx; outContacts[n].ny = ny; outContacts[n].nz = nz;
        } else {
          outContacts[n].nx = nx; outContacts[n].ny = ny; outContacts[n].nz = nz;
        }
        outContacts[n].depth = depth + 1e-4;
        outContacts[n].px = _v0.x; outContacts[n].py = _v0.y; outContacts[n].pz = _v0.z;
        n++;
      });
    return n;
  }

  /** Nearest-hit raycast. Hit: {t, point, normal} or null. */
  raycast(origin, dir, maxDist) {
    let bestT = Infinity, bestTi = -1;
    const cs = this.cellSize;
    const steps = Math.min(600, Math.ceil(maxDist / (cs * 0.7)) + 1);
    const stampBase = ++this._queryStamp;
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * maxDist;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const key = Math.floor(px / cs) + ',' + Math.floor(py / cs) + ',' + Math.floor(pz / cs);
      const cell = this.grid.get(key);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const ti = cell[i];
        if (this._stamps[ti] === stampBase) continue; // already tested on this ray
        this._stamps[ti] = stampBase;
        const o = ti * 9;
        const hitT = rayTriangle(origin, dir,
          this.posArray[o], this.posArray[o + 1], this.posArray[o + 2],
          this.posArray[o + 3], this.posArray[o + 4], this.posArray[o + 5],
          this.posArray[o + 6], this.posArray[o + 7], this.posArray[o + 8]);
        if (hitT !== null && hitT < bestT && hitT <= maxDist) { bestT = hitT; bestTi = ti; }
      }
      if (bestT < t) break; // nearest hit already closer than remaining march distance
    }
    if (bestTi < 0) return null;
    const res = { t: bestT, point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT), normal: new THREE.Vector3(this.normals[bestTi * 3], this.normals[bestTi * 3 + 1], this.normals[bestTi * 3 + 2]) };
    return res;
  }

  /** Ground height directly below a point (within maxDrop); returns {y, normal} or null. */
  groundBelow(x, y, z, maxDrop) {
    _v0.set(0, -1, 0);
    const hit = this.raycast(_v1.set(x, y, z), _v0, maxDrop);
    return hit ? { y: hit.point.y, normal: hit.normal } : null;
  }
}

function rayTriangle(orig, dir, ax, ay, az, bx, by, bz, cx, cy, cz) {
  // Möller–Trumbore, returns t or null (no backface cull)
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dir.y * e2z - dir.z * e2y, py = dir.z * e2x - dir.x * e2z, pz = dir.x * e2y - dir.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  const tx = orig.x - ax, ty = orig.y - ay, tz = orig.z - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < -1e-6 || u > 1.000001) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dir.x * qx + dir.y * qy + dir.z * qz) * invDet;
  if (v < -1e-6 || u + v > 1.000001) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return t >= 1e-6 ? t : null;
}

export function makeContacts(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0, depth: 0 });
  return arr;
}
