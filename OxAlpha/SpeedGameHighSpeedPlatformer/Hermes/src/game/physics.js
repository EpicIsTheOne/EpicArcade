import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Sphere-based collision world. Static meshes are queried through a MeshBVH in
// LOCAL space (rays are transformed per-collider), so any transform works and
// geometries are never cloned. Dynamic platforms are analytic OBBs.
const _ray = new THREE.Ray();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _tri = new THREE.Triangle();

function triNormalWorld(geom, face, matWorld, out) {
  const p = geom.attributes.position;
  _v2.fromBufferAttribute(p, face.a);
  _v3.fromBufferAttribute(p, face.b);
  _v1.fromBufferAttribute(p, face.c);
  _tri.set(_v2, _v3, _v1);
  _tri.getNormal(out);
  _nm.getNormalMatrix(matWorld);
  return out.applyMatrix3(_nm).normalize();
}

export class PhysicsWorld {
  constructor() {
    this.statics = [];      // { mesh, geom, bvh, inv }
    this.movers = [];       // { obj, half, inv } (inv refreshed per query)
    this._sphere = new THREE.Sphere();
    this._segA = new THREE.Vector3();
    this._cpTri = new THREE.Vector3();
  }

  addStatic(mesh) {
    mesh.updateMatrixWorld(true);
    const geom = mesh.geometry;
    if (!geom.boundsTree) geom.boundsTree = new MeshBVH(geom);
    this.statics.push({ mesh, geom, bvh: geom.boundsTree, inv: mesh.matrixWorld.clone().invert() });
  }

  clear() {
    this.statics.length = 0;
    this.movers.length = 0;
  }

  addMover(obj, halfExtents) {
    obj.updateMatrixWorld(true);
    this.movers.push({ obj, half: halfExtents.clone(), inv: obj.matrixWorld.clone().invert() });
  }

  refreshMover(mv) {
    mv.obj.updateMatrixWorld(true);
    mv.inv.copy(mv.obj.matrixWorld).invert();
  }

  // Nearest hit against statics (+ optional mover boxes).
  raycast(origin, dir, maxDist = Infinity, includeMovers = true) {
    let best = null;
    for (const st of this.statics) {
      _ray.origin.copy(origin).applyMatrix4(st.inv);
      _ray.direction.copy(dir).transformDirection(st.inv);
      const hit = st.bvh.raycastFirst(_ray, 2 /* DoubleSide */);
      if (hit && hit.distance <= maxDist && (!best || hit.distance < best.dist)) {
        best = {
          dist: hit.distance,
          point: hit.point.clone().applyMatrix4(st.mesh.matrixWorld),
          normal: triNormalWorld(st.geom, hit.face, st.mesh.matrixWorld, new THREE.Vector3()),
          staticRef: st,
        };
      }
    }
    if (includeMovers) {
      for (const mv of this.movers) {
        this.refreshMover(mv);
        const hit = rayOBB(origin, dir, mv.obj, mv.half, mv.inv, maxDist);
        if (hit && (!best || hit.dist < best.dist)) best = hit;
      }
    }
    return best;
  }

  // Push a sphere out of all solid geometry. Contacts appended as {normal, depth}.
  // Returns true when any penetration was resolved.
  resolveSphere(center, r, contacts = null, skin = 0.001) {
    let any = false;
    for (let iter = 0; iter < 3; iter++) {
      let deepest = 0, pushN = null;
      this._sphere.set(center, r);
      // --- statics ---
      for (const st of this.statics) {
        const worldInv = st.inv;
        const localCenter = _v1.copy(center).applyMatrix4(worldInv);
        // scale-aware radius (colliders assumed uniformly scaled or unscaled)
        const scale = st.mesh.matrixWorld.getMaxScaleOnAxis();
        const lr = r / scale;
        this._sphere.set(localCenter, lr + skin * scale);
        st.bvh.shapecast({
          intersectsBounds: (box) => box.intersectsSphere(this._sphere),
          intersectsTriangle: (tri) => {
            tri.closestPointToPoint(localCenter, this._cpTri);
            const d2 = this._cpTri.distanceToSquared(localCenter);
            if (d2 < (lr + skin) * (lr + skin)) {
              const d = Math.sqrt(Math.max(d2, 1e-9));
              const depth = (lr + skin) - d;
              if (depth > deepest) {
                deepest = depth;
                _v2.copy(localCenter).sub(this._cpTri);
                if (_v2.lengthSq() < 1e-10) tri.getNormal(pushN || (pushN = new THREE.Vector3()));
                else pushN = _v2.divideScalar(d).clone();
                pushN.transformDirection(st.mesh.matrixWorld); // to world
              }
            }
            return false;
          },
        });
      }
      // --- movers ---
      for (const mv of this.movers) {
        this.refreshMover(mv);
        const c = closestPointOBB(center, mv.obj, mv.half, mv.inv, _v3);
        const d = c.distanceTo(center);
        if (d < r + skin) {
          const depth = (r + skin) - d;
          if (depth > deepest) {
            deepest = depth;
            _v2.copy(center).sub(c);
            if (_v2.lengthSq() < 1e-10) _v2.set(0, 1, 0);
            pushN = _v2.normalize().clone();
          }
        }
      }
      if (deepest > 0 && pushN) {
        center.addScaledVector(pushN, deepest + 0.0005);
        contacts && contacts.push({ normal: pushN.clone(), depth: deepest });
        any = true;
      } else break;
    }
    return any;
  }

  // Cheapest "what is under me" probe used for ground sticking.
  groundProbe(origin, downDir, maxDist) {
    return this.raycast(origin, downDir, maxDist);
  }
}

function rayOBB(origin, dir, obj, half, invMat, maxDist) {
  _v1.copy(origin).applyMatrix4(invMat);
  _v2.copy(dir).transformDirection(invMat);
  // slab test against [-h,h]^3
  let tmin = 0, tmax = maxDist;
  for (let i = 0; i < 3; i++) {
    const o = _v1.getComponent(i), d = _v2.getComponent(i), h = half.getComponent(i);
    if (Math.abs(d) < 1e-9) { if (o < -h || o > h) return null; continue; }
    let t1 = (-h - o) / d, t2 = (h - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const dist = tmin;
  const localHit = _v1.clone().addScaledVector(_v2, dist);
  // local normal: component with |hit| ≈ h
  const nLocal = new THREE.Vector3();
  let bestAxis = 0, bestD = Infinity;
  for (let i = 0; i < 3; i++) {
    const dd = Math.abs(Math.abs(localHit.getComponent(i)) - half.getComponent(i));
    if (dd < bestD) { bestD = dd; bestAxis = i; }
  }
  nLocal.setComponent(bestAxis, Math.sign(localHit.getComponent(bestAxis)) || 1);
  return {
    dist,
    point: localHit.applyMatrix4(obj.matrixWorld),
    normal: nLocal.transformDirection(obj.matrixWorld),
    mover: obj,
  };
}

function closestPointOBB(point, obj, half, invMat, out) {
  _v1.copy(point).applyMatrix4(invMat);
  _v1.x = Math.max(-half.x, Math.min(half.x, _v1.x));
  _v1.y = Math.max(-half.y, Math.min(half.y, _v1.y));
  _v1.z = Math.max(-half.z, Math.min(half.z, _v1.z));
  return out.copy(_v1).applyMatrix4(obj.matrixWorld);
}
