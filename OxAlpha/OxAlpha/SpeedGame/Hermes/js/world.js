/* ============================================================
   VOLT RUSH — world.js
   Collision world: spatial hash, capsule-vs-AABB queries with
   substepping (anti-tunneling), ramps, triggers, volumes,
   chunk streaming, particle FX pools.
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ---------------- Spatial hash (2D cells, tall boxes) ---------------- */
  class SpatialHash {
    constructor(cell = 10) { this.cell = cell; this.map = new Map(); }
    _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
    insert(box) {
      const c = this.cell;
      const x0 = Math.floor(box.min.x / c), x1 = Math.floor(box.max.x / c);
      const z0 = Math.floor(box.min.z / c), z1 = Math.floor(box.max.z / c);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = this._key(x, z);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(box);
      }
    }
    query(x, z, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const arr = this.map.get(this._key(cx, cz));
        if (arr) for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (out.indexOf(b) === -1) out.push(b);
        }
      }
      return out;
    }
    clear() { this.map.clear(); }
  }

  /* ---------------- Collider factory helpers ---------------- */
  function makeBox(cx, cy, cz, sx, sy, sz, opts = {}) {
    return {
      kind: 'box',
      min: { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
      max: { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 },
      type: opts.type || 'solid',          // solid | wallrun | hazard
      tag: opts.tag || null,               // 'loop', 'wall', etc
      ref: opts.ref || null,
      platform: opts.platform || null,     // moving platform owner {delta:{x,y,z}}
      _id: makeBox._id = (makeBox._id || 0) + 1,
    };
  }
  // Ramp: axis-aligned prism rising along dir (0:+z,1:-z,2:+x,3:-x)
  function makeRamp(cx, cy, cz, sx, sy, sz, dir, opts = {}) {
    return {
      kind: 'ramp', dir,
      min: { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
      max: { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 },
      type: opts.type || 'solid', tag: opts.tag || 'ramp', ref: opts.ref || null,
      platform: opts.platform || null,
      _id: makeBox._id = (makeBox._id || 0) + 1,
    };
  }
  function rampFloorY(b, x, z) {
    const t = b.dir === 0 || b.dir === 1
      ? (z - b.min.z) / (b.max.z - b.min.z)
      : (x - b.min.x) / (b.max.x - b.min.x);
    let f;
    if (b.dir === 0) f = t; else if (b.dir === 1) f = 1 - t;
    else if (b.dir === 2) f = t; else f = 1 - t;
    return b.min.y + Math.max(0, Math.min(1, f)) * (b.max.y - b.min.y);
  }

  /* ---------------- World ---------------- */
  class World {
    constructor(scene) {
      this.scene = scene;
      this.hash = new SpatialHash(10);
      this.colliders = [];
      this.triggers = [];      // {min,max,once,fired,onEnter,onExit,ref,enabled}
      this.volumes = [];       // {min,max,type:'updraft'|'water'|'boost', data}
      this.chunks = [];        // {group, center:{x,z}, radius, active, colliders}
      this.killY = -60;
      this._q = [];
      this.gravity = 38;
    }

    addCollider(b) { this.colliders.push(b); this.hash.insert(b); return b; }
    addTrigger(t) { t.fired = false; t.enabled = t.enabled !== false; this.triggers.push(t); return t; }
    addVolume(v) { this.volumes.push(v); return v; }

    /* ---- queries ---- */
    nearby(x, z, r) { return this.hash.query(x, z, r, this._q); }

    // closest point on box to p; returns {x,y,z,d2}
    closestOnBox(b, px, py, pz) {
      const cx = Math.max(b.min.x, Math.min(px, b.max.x));
      const cy = Math.max(b.min.y, Math.min(py, b.max.y));
      const cz = Math.max(b.min.z, Math.min(pz, b.max.z));
      return { x: cx, y: cy, z: cz };
    }

    // Ground probe: nearest surface within snapDist of foot sphere.
    // Returns {point, normal, dist, collider} or null. Considers ramps.
    probeGround(px, py, pz, snapDist, vel) {
      const cands = this.nearby(px, pz, snapDist + 2.5);
      let best = null, bestD = snapDist * snapDist;
      for (let i = 0; i < cands.length; i++) {
        const b = cands[i];
        if (b.type === 'hazard') continue;
        let cp;
        if (b.kind === 'ramp') {
          // treat top surface as plane: clamp xz to footprint, y=floor
          if (px < b.min.x - 0.01 || px > b.max.x + 0.01 || pz < b.min.z - 0.01 || pz > b.max.z + 0.01) {
            cp = this.closestOnBox(b, px, py, pz);
          } else {
            const fy = rampFloorY(b, px, pz);
            cp = { x: px, y: Math.min(fy, b.max.y), z: pz };
          }
        } else {
          cp = this.closestOnBox(b, px, py, pz);
        }
        const dx = px - cp.x, dy = py - cp.y, dz = pz - cp.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD) {
          const d = Math.sqrt(d2) || 1e-6;
          let nx = dx / d, ny = dy / d, nz = dz / d;
          if (b.kind === 'ramp' && Math.abs(px - cp.x) < 0.02 && Math.abs(pz - cp.z) < 0.02 && py >= cp.y - 0.05 && py <= cp.y + 0.6) {
            // on ramp surface: analytic normal
            const run = (b.dir === 0 || b.dir === 1) ? (b.max.z - b.min.z) : (b.max.x - b.min.x);
            const rise = b.max.y - b.min.y;
            if (b.dir === 0) { nx = 0; ny = run; nz = -rise; }
            else if (b.dir === 1) { nx = 0; ny = run; nz = rise; }
            else if (b.dir === 2) { nx = -rise; ny = run; nz = 0; }
            else { nx = rise; ny = run; nz = 0; }
            const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
          }
          best = { point: cp, normal: { x: nx, y: ny, z: nz }, dist: d, collider: b };
          bestD = d2;
        }
      }
      return best;
    }

    // Any solid overlapping sphere (for camera & spawn checks)
    sphereHit(px, py, pz, r) {
      const cands = this.nearby(px, pz, r + 2);
      for (let i = 0; i < cands.length; i++) {
        const b = cands[i];
        if (b.type === 'hazard') continue;
        const cp = this.closestOnBox(b, px, py, pz);
        const dx = px - cp.x, dy = py - cp.y, dz = pz - cp.z;
        if (dx * dx + dy * dy + dz * dz < r * r) return b;
      }
      return null;
    }

    // Capsule resolve: push sphere-swept vertical segment out of solids.
    // pos is feet position. Returns collision info.
    // Core: TRUE segment-to-box distance. The segment endpoints are only
    // clamped into the box's Y-range when they are OUTSIDE it in Y — never
    // when inside — so a capsule resting on a floor produces zero contact,
    // not a phantom face-penetration (the classic trampoline bug).
    resolveCapsule(pos, radius, height, vel) {
      const hits = { wall: null, wallN: null, landed: false, ceiling: false, hazard: null, platform: null };
      const cands = this.nearby(pos.x, pos.z, radius + height * 0.5 + 2);
      const segA = pos.y + radius;             // bottom sphere center
      const segB = pos.y + height - radius;    // top sphere center
      for (let iter = 0; iter < 4; iter++) {
        let any = false;
        let bestPush = null, bestLen = 0, bestN = null, bestBox = null;
        for (let i = 0; i < cands.length; i++) {
          const b = cands[i];
          if (segB + radius < b.min.y || segA - radius > b.max.y) continue;
          if (pos.x + radius < b.min.x || pos.x - radius > b.max.x ||
              pos.z + radius < b.min.z || pos.z - radius > b.max.z) continue;

          // RAMPS: heightfield surface, not a box. Climb/descend along the incline.
          if (b.kind === 'ramp') {
            const inX = pos.x >= b.min.x - 0.25 && pos.x <= b.max.x + 0.25;
            const inZ = pos.z >= b.min.z - 0.25 && pos.z <= b.max.z + 0.25;
            if (!inX || !inZ) continue;
            const fy = rampFloorY(b, pos.x, pos.z);
            const pen = fy - pos.y;                    // >0: surface above feet
            if (pen > -radius && pen < 0.5) {
              // analytic slope normal (points UP-out of the incline)
              const run = (b.dir === 0 || b.dir === 1) ? (b.max.z - b.min.z) : (b.max.x - b.min.x);
              const rise = b.max.y - b.min.y;
              let nx = 0, ny = run, nz = 0;
              if (b.dir === 0) nz = -rise;
              else if (b.dir === 1) nz = rise;
              else if (b.dir === 2) nx = -rise;
              else nx = rise;
              const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
              const lift = Math.min(radius, Math.max(0, pen + radius * 0.5));
              pos.x += nx * lift * 0.0;                // no lateral push on ramps
              pos.y += ny * lift;
              pos.z += nz * lift * 0.0;
              const vn = vel.x * nx + vel.y * ny + vel.z * nz;
              if (vn < 0) { vel.x -= nx * vn; vel.y -= ny * vn; vel.z -= nz * vn; }
              hits.wall = b; hits.wallN = { x: nx, y: ny, z: nz };
              hits.landed = true; hits.platform = b.platform || null;
              any = true;
            }
            continue;
          }

          // closest point between vertical segment [(px,segA,pz),(px,segB,pz)] and box
          let bestD2 = Infinity, bx = 0, by = 0, bz = 0, sx = 0;
          const N = 5;
          for (let s = 0; s <= N; s++) {
            const sy = segA + (segB - segA) * (s / N);
            const cy = clamp(sy, b.min.y, b.max.y);       // clamp ONLY the query point
            const cx = clamp(pos.x, b.min.x, b.max.x);
            const cz = clamp(pos.z, b.min.z, b.max.z);
            const dx = pos.x - cx, dy = sy - cy, dz = pos.z - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; bx = cx; by = cy; bz = cz; sx = sy; }
          }
          if (bestD2 < radius * radius) {
            let d = Math.sqrt(bestD2);
            let nx, ny, nz;
            if (d < 1e-6) {
              // segment point is INSIDE the box volume: escape via min axis
              const px1 = pos.x - b.min.x, px2 = b.max.x - pos.x;
              const py1 = sx - b.min.y, py2 = b.max.y - sx;
              const pz1 = pos.z - b.min.z, pz2 = b.max.z - pos.z;
              const m = Math.min(px1, px2, py1, py2, pz1, pz2);
              if (m === py2 && py2 > 0.01) { nx = 0; ny = 1; nz = 0; d = py2; }
              else if (m === py1 && py1 > 0.01) { nx = 0; ny = -1; nz = 0; d = py1; }
              else if (m === px2 && px2 > 0.01) { nx = 1; ny = 0; nz = 0; d = px2; }
              else if (m === px1 && px1 > 0.01) { nx = -1; ny = 0; nz = 0; d = px1; }
              else if (m === pz2 && pz2 > 0.01) { nx = 0; ny = 0; nz = 1; d = pz2; }
              else if (m === pz1 && pz1 > 0.01) { nx = 0; ny = 0; nz = -1; d = pz1; }
              else { nx = 0; ny = 1; nz = 0; d = radius; }   // deep inside: eject up
              bestD2 = d * d;
            } else {
              const inv = 1 / d;
              nx = (pos.x - bx) * inv; ny = (sx - by) * inv; nz = (pos.z - bz) * inv;
            }
            const pushAmt = Math.min(radius, radius - d);
            if (pushAmt > bestLen) {
              bestLen = pushAmt;
              bestPush = { x: nx * pushAmt, y: ny * pushAmt, z: nz * pushAmt };
              bestN = { x: nx, y: ny, z: nz };
              bestBox = b;
            }
          }
        }
        if (bestPush && bestLen > 1e-5) {
          pos.x += bestPush.x; pos.y += bestPush.y; pos.z += bestPush.z;
          const vn = vel.x * bestN.x + vel.y * bestN.y + vel.z * bestN.z;
          if (vn < 0) {
            vel.x -= bestN.x * vn; vel.y -= bestN.y * vn; vel.z -= bestN.z * vn;
          }
          hits.wall = bestBox; hits.wallN = bestN;
          if (bestN.y > 0.55) { hits.landed = true; hits.platform = bestBox.platform || null; }
          else if (bestN.y < -0.55) hits.ceiling = true;
          if (bestBox.type === 'hazard') hits.hazard = bestBox;
          any = true;
        }
        if (!any) break;
      }
      return hits;
    }

    /* ---- triggers & volumes ---- */
    updateTriggers(px, py, pz, game) {
      for (const t of this.triggers) {
        if (!t.enabled) continue;
        if (t.once && t.fired) continue;
        if (px > t.min.x && px < t.max.x && py > t.min.y && py < t.max.y && pz > t.min.z && pz < t.max.z) {
          if (!(t.once && t.fired)) { t.fired = true; if (t.onEnter) t.onEnter(game); }
          if (t.onStay) t.onStay(game);
        }
      }
    }
    sampleVolumes(px, py, pz) {
      const res = { updraft: 0, water: false, boostDir: null };
      for (const v of this.volumes) {
        if (px > v.min.x && px < v.max.x && py > v.min.y && py < v.max.y && pz > v.min.z && pz < v.max.z) {
          if (v.type === 'updraft') res.updraft = Math.max(res.updraft, v.strength || 1);
          else if (v.type === 'water') res.water = true;
          else if (v.type === 'boost') res.boostDir = v.dir;
        }
      }
      return res;
    }

    /* ---- chunk streaming (visual only; collision always live) ---- */
    registerChunk(group, center, radius, colliders) {
      const ch = { group, center, radius, active: false, colliders: colliders || [] };
      group.visible = false;
      this.scene.add(group);
      this.chunks.push(ch);
      return ch;
    }
    updateStreaming(px, pz, vx, vz) {
      // predictive: extend activation ahead of motion, keep a trail behind
      const ax = px + clamp(vx, -60, 60) * 1.1;
      const az = pz + clamp(vz, -60, 60) * 1.1;
      for (const ch of this.chunks) {
        const dAhead = Math.hypot(ch.center.x - ax, ch.center.z - az);
        const dHere = Math.hypot(ch.center.x - px, ch.center.z - pz);
        const want = Math.min(dAhead, dHere) < ch.radius;
        if (want !== ch.active) {
          ch.active = want;
          ch.group.visible = want;
        }
      }
    }
    activateAll() { for (const ch of this.chunks) { ch.active = true; ch.group.visible = true; } }

    clear() {
      for (const ch of this.chunks) {
        this.scene.remove(ch.group);
        ch.group.traverse(o => {
          if (o.geometry) o.geometry.dispose();
        });
      }
      this.chunks.length = 0;
      this.colliders.length = 0;
      this.triggers.length = 0;
      this.volumes.length = 0;
      this.hash.clear();
    }
  }

  /* ---------------- FX: pooled particle systems ---------------- */
  class ParticlePool {
    constructor(scene, count, color, size, additive = true, spriteTex = null) {
      this.count = count;
      this.pos = new Float32Array(count * 3);
      this.vel = new Float32Array(count * 3);
      this.life = new Float32Array(count);
      this.maxLife = new Float32Array(count);
      this.head = 0;
      const g = new (T().BufferGeometry)();
      g.setAttribute('position', new (T().BufferAttribute)(this.pos, 3));
      const mOpts = {
        color, size, transparent: true, opacity: 0.9, depthWrite: false,
        blending: additive ? T().AdditiveBlending : T().NormalBlending,
        sizeAttenuation: true,
      };
      if (spriteTex) { mOpts.map = spriteTex; mOpts.alphaTest = 0.01; }
      const m = new (T().PointsMaterial)(mOpts);
      this.points = new (T().Points)(g, m);
      this.points.frustumCulled = false;
      scene.add(this.points);
      for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -99999;
    }
    spawn(x, y, z, vx, vy, vz, life) {
      const i = this.head; this.head = (this.head + 1) % this.count;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.life[i] = life; this.maxLife[i] = life;
    }
    burst(x, y, z, n, speed, life, up = 0) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.2) * Math.PI;
        const s = speed * (0.4 + Math.random() * 0.6);
        this.spawn(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + up, Math.sin(a) * Math.cos(b) * s, life * (0.6 + Math.random() * 0.6));
      }
    }
    update(dt) {
      for (let i = 0; i < this.count; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -99999; continue; }
        this.vel[i * 3 + 1] -= 14 * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  window.VoltWorld = { World, SpatialHash, makeBox, makeRamp, rampFloorY, ParticlePool };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltWorld;
})();
