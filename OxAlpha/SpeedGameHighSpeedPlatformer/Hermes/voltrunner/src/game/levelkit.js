// LevelKit: builders that emit merged visual meshes (vertex-colored) AND collision triangles.
// One draw call per material bucket => fast. Supports boxes, ramps, ribbons (banked roads,
// wallruns, spirals, half-pipes), full loops, terrain heightfields, rails, triggers & props.
import * as THREE from 'three';
import { CollisionWorld } from './collision.js';

export class MeshBucket {
  constructor(material, castShadow = true) {
    this.material = material; this.castShadow = castShadow;
    this.pos = []; this.nor = []; this.col = [];
  }
  tri(a, b, c, col) {
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
    const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return; // degenerate
    nx /= l; ny /= l; nz /= l;
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.nor.push(nx, ny, nz);
    const r = col.r, g = col.g, bl = col.b;
    this.col.push(r, g, bl, r, g, bl, r, g, bl);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const m = new THREE.Mesh(g, this.material);
    m.castShadow = this.castShadow; m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }
}

const _c = new THREE.Color();
export class LevelBuilder {
  /**
   * theme: {
   *   solid: {roughness, metalness}, fog:{color,density}, sun:{color,intensity},
   *   hemi:{sky,ground,intensity}, palette:{a,b,c,d,e}, accent
   * }
   */
  constructor(theme) {
    this.theme = theme;
    this.group = new THREE.Group();
    this.world = new CollisionWorld();
    this.buckets = {};
    this.springs = [];      // {pos, normal, power, r}
    this.dashPanels = [];   // {pos, dir, speed, halfW, halfL}
    this.movers = [];       // {mesh, getPos(t), prev:Vector3, vel:Vector3, size:Vector3}
    this.checkpoints = [];  // {pos, radius, idx}
    this.gems = [];         // {pos, taken, mesh}
    this.volts = [];        // {pos, taken}
    this.enemySpawns = [];  // {type, pos, ...opts}
    this.updrafts = [];     // {min:Vector3, max:Vector3, accel}
    this.killZ = -60;
    this.spawnPoint = new THREE.Vector3();
    this.goalPos = null;
    this.parTime = 75;
    this.name = 'ZONE';
    this._voltGroup = null;
  }
  bucket(name, mat, castShadow = true) {
    if (!this.buckets[name]) this.buckets[name] = new MeshBucket(mat, castShadow);
    return this.buckets[name];
  }
  finish() {
    for (const k in this.buckets) {
      const m = this.buckets[k].build();
      if (m) this.group.add(m);
    }
    return this.group;
  }

  // ---------- primitives ----------
  box(cx, cy, cz, w, h, d, colorHex, opt = {}) {
    const bk = this.bucket(opt.bucket || 'solid', opt.material || MATS.solid, !opt.noShadow);
    const col = new THREE.Color(colorHex);
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    // top/bottom
    bk.quad(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), col);
    bk.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y0, z0), v(x0, y0, z0), col);
    // sides
    bk.quad(v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), v(x0, y0, z0), col);
    bk.quad(v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1), col);
    bk.quad(v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0), col);
    bk.quad(v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), v(x0, y0, z1), col);
    if (!opt.deco) this.addBoxTris(x0, y0, z0, x1, y1, z1);
    return this;
  }
  addBoxTris(x0, y0, z0, x1, y1, z1) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const W = this.world;
    W.addTriangle(V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1)); W.addTriangle(V(x0, y1, z0), V(x1, y1, z1), V(x0, y1, z1));
    W.addTriangle(V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0)); W.addTriangle(V(x0, y0, z1), V(x1, y0, z0), V(x0, y0, z0));
    W.addTriangle(V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0)); W.addTriangle(V(x0, y0, z1), V(x0, y1, z0), V(x0, y0, z0));
    W.addTriangle(V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1)); W.addTriangle(V(x1, y0, z0), V(x1, y1, z1), V(x1, y0, z1));
    W.addTriangle(V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0)); W.addTriangle(V(x0, y0, z0), V(x1, y1, z0), V(x1, y0, z0));
    W.addTriangle(V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)); W.addTriangle(V(x1, y0, z1), V(x0, y1, z1), V(x0, y0, z1));
  }

  // Wedge ramp rising along +Z: full height y0 at z0, rising to y1 at z1.
  ramp(cx, z0, z1, y0, y1, width, colorHex, opt = {}) {
    const bk = this.bucket(opt.bucket || 'solid', opt.material || MATS.solid, !opt.noShadow);
    const col = new THREE.Color(colorHex);
    const x0 = cx - width / 2, x1 = cx + width / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const A = V(x0, y0, z0), B = V(x1, y0, z0);        // front bottom corners
    const C = V(x1, y1, z1), D = V(x0, y1, z1);        // top edge at far end
    const A2 = V(x0, y0, z1), B2 = V(x1, y0, z1);      // far bottom corners
    bk.quad(D, A, B, C, col);                          // slope surface
    bk.quad(A, A2, B2, B, col);                        // vertical back face (z=z0)
    bk.tri(B2, B, C, col);                             // right wall (+x)
    bk.tri(A, A2, D, col);                             // left wall (-x)
    bk.quad(A2, D, C, B2, col);                        // bottom
    if (!opt.deco) {
      const W = this.world;
      W.addTriangle(D, A, B); W.addTriangle(D, B, C);  // slope
      W.addTriangle(A, A2, B2); W.addTriangle(A, B2, B); // back
      W.addTriangle(B2, B, C);                          // right
      W.addTriangle(A, A2, D);                          // left
      W.addTriangle(A2, D, C); W.addTriangle(A2, C, B2);// bottom
    }
    return this;
  }

  // Ribbon along polyline pts (Vector3[]). width, bank(radians at each pt or fn(i,u)),
  // thickness lip optional. Perfect for roads, wallruns, spirals, half-pipe segments.
  ribbon(pts, width, colorHex, opt = {}) {
    const bkS = this.bucket(opt.bucket || 'solid', opt.material || MATS.solid, !opt.noShadow);
    const col = new THREE.Color(colorHex);
    const up = opt.up || new THREE.Vector3(0, 1, 0);
    const bank = opt.bank || (() => 0);
    const lip = opt.lip ?? 0;
    const n = pts.length;
    const left = [], right = [], norms = [];
    const tan = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (i === 0) tan.subVectors(pts[1], pts[0]);
      else if (i === n - 1) tan.subVectors(pts[n - 1], pts[n - 2]);
      else tan.subVectors(pts[i + 1], pts[i - 1]);
      tan.normalize();
      side.crossVectors(tan, up).normalize();
      const b = typeof bank === 'function' ? bank(i, i / (n - 1)) : bank;
      q.setFromAxisAngle(tan, b);
      const sd = side.clone().applyQuaternion(q);
      const ud = up.clone().applyQuaternion(q);
      left.push(p.clone().addScaledVector(sd, -width / 2));
      right.push(p.clone().addScaledVector(sd, width / 2));
      norms.push(ud.clone());
    }
    for (let i = 0; i < n - 1; i++) {
      bkS.quad(left[i], right[i], right[i + 1], left[i + 1], col);
    }
    if (!opt.deco) {
      const W = this.world;
      for (let i = 0; i < n - 1; i++) {
        W.addTriangle(left[i], right[i], right[i + 1]);
        W.addTriangle(left[i], right[i + 1], left[i + 1]);
      }
    }
    // side lips (small walls) to prevent sliding off banked roads
    if (lip > 0 && !opt.noLip) {
      for (let i = 0; i < n - 1; i++) {
        const l0 = left[i], l1 = left[i + 1];
        const u0 = norms[i].clone().multiplyScalar(lip), u1 = norms[i + 1].clone().multiplyScalar(lip);
        bkS.quad(l0, l1, l1.clone().add(u1), l0.clone().add(u0), col);
        if (!opt.deco) {
          this.world.addTriangle(l0, l1, l1.clone().add(u1));
          this.world.addTriangle(l0, l1.clone().add(u1), l0.clone().add(u0));
        }
        const r0 = right[i], r1 = right[i + 1];
        bkS.quad(r1, r0, r0.clone().add(u0), r1.clone().add(u1), col);
        if (!opt.deco) {
          this.world.addTriangle(r1, r0, r0.clone().add(u0));
          this.world.addTriangle(r1, r0.clone().add(u0), r1.clone().add(u1));
        }
      }
    }
    return { left, right, norms };
  }

  // Full vertical loop. Entry at pos heading yaw (rad). Returns exit info.
  loop(pos, yaw, radius = 9, width = 7, colorHex = 0x224488, opt = {}) {
    const bkS = this.bucket(opt.bucket || 'solid', opt.material || MATS.solid, !opt.noShadow);
    const bkGlow = opt.glow ? this.bucket('glow', MATS.basic, false) : null;
    const col = new THREE.Color(colorHex);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(dir.z, 0, -dir.x); // dir x up
    const steps = 44;
    const C = pos.clone().addScaledVector(dir, radius).add(new THREE.Vector3(0, radius, 0));
    const ringPts = [];
    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * Math.PI * 2;
      // P(theta) = C - R*up*cos + R*dir*sin ; theta=0 at bottom
      const p = C.clone()
        .addScaledVector(new THREE.Vector3(0, 1, 0), -Math.cos(th) * radius)
        .addScaledVector(dir, Math.sin(th) * radius);
      ringPts.push(p);
    }
    const hw = width / 2;
    for (let i = 0; i < steps; i++) {
      const p0 = ringPts[i], p1 = ringPts[i + 1];
      const th = ((i + 0.5) / steps) * Math.PI * 2;
      const inward = C.clone().addScaledVector(new THREE.Vector3(0, 1, 0), -Math.cos(th) * (radius - 5))
        .addScaledVector(dir, Math.sin(th) * (radius - 5));
      const nrm = inward.clone().sub(C).normalize().negate(); // faces center
      const a = p0.clone().addScaledVector(side, -hw), b = p0.clone().addScaledVector(side, hw);
      const c = p1.clone().addScaledVector(side, hw), d = p1.clone().addScaledVector(side, -hw);
      bkS.quad(a, b, c, d, col);
      if (!opt.deco) {
        const W = this.world;
        W.addTriangle(a, b, c); W.addTriangle(a, c, d);
      }
      // glowing edge stripes
      if (bkGlow && i % 2 === 0) {
        const gcol = new THREE.Color(opt.glowColor ?? 0x29f5ff);
        bkGlow.quad(
          p0.clone().addScaledVector(side, hw - 0.5),
          p0.clone().addScaledVector(side, hw),
          p1.clone().addScaledVector(side, hw),
          p1.clone().addScaledVector(side, hw - 0.5), gcol);
        bkGlow.quad(
          p0.clone().addScaledVector(side, -hw),
          p0.clone().addScaledVector(side, -hw + 0.5),
          p1.clone().addScaledVector(side, -hw + 0.5),
          p1.clone().addScaledVector(side, -hw), gcol);
      }
    }
    return { exit: ringPts[steps].clone().addScaledVector(dir, 0), center: C };
  }

  // Half-pipe / curved wall section: arc profile extruded along dir from pos, length L.
  // arcDeg: sweep of arc (180 = U pipe), radius r. Profile lies in plane ⟂ dir starting flat.
  halfPipe(pos, yaw, length, radius, arcDeg = 150, colorHex = 0x334455, opt = {}) {
    const bkS = this.bucket(opt.bucket || 'solid', opt.material || MATS.solid, !opt.noShadow);
    const col = new THREE.Color(colorHex);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const steps = Math.max(10, Math.round(arcDeg / 7));
    const rows = [];
    for (let j = 0; j <= 1; j++) {
      const row = [];
      const base = pos.clone().addScaledVector(dir, length * j);
      for (let i = 0; i <= steps; i++) {
        const th = -arcDeg / 2 + (i / steps) * arcDeg; // -..+, 0=bottom
        const rad = THREE.MathUtils.degToRad(th);
        // profile: rotate 'down' around dir axis; point = base - up*r*cos(rad) + side*r*sin(rad)
        const p = base.clone()
          .addScaledVector(new THREE.Vector3(0, 1, 0), -Math.cos(rad) * (radius))
          .addScaledVector(side, Math.sin(rad) * radius)
          .add(new THREE.Vector3(0, 0, 0));
        row.push({ p, n: p.clone().sub(base).normalize() });
      }
      rows.push(row);
    }
    for (let i = 0; i < steps; i++) {
      const a = rows[0][i].p, b = rows[0][i + 1].p, c = rows[1][i + 1].p, d = rows[1][i].p;
      bkS.quad(a, b, c, d, col);
      if (!opt.deco) {
        const W = this.world;
        W.addTriangle(a, b, c); W.addTriangle(a, c, d);
      }
    }
    return this;
  }

  // Terrain heightfield: fn(x,z)->y over rect centered (cx,cz) size (w,d), res segments.
  terrain(cx, cz, w, d, resX, resZ, fn, colorFn, opt = {}) {
    const bkS = this.bucket(opt.bucket || 'solid', opt.material || MATS.solidGround, !opt.noShadow);
    const W = this.world;
    const ys = [];
    for (let j = 0; j <= resZ; j++) {
      const row = [];
      for (let i = 0; i <= resX; i++) {
        const x = cx - w / 2 + (i / resX) * w;
        const z = cz - d / 2 + (j / resZ) * d;
        row.push(fn(x, z));
      }
      ys.push(row);
    }
    const P = (i, j) => new THREE.Vector3(cx - w / 2 + (i / resX) * w, ys[j][i], cz - d / 2 + (j / resZ) * d);
    for (let j = 0; j < resZ; j++) for (let i = 0; i < resX; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), dd = P(i, j + 1);
      const colA = colorFn ? colorFn((a.y + c.y) / 2, (a.x + c.x) / 2, (a.z + c.z) / 2) : new THREE.Color(0x447744);
      bkS.tri(a, b, c, colA); bkS.tri(a, c, dd, colA);
      if (!opt.deco) { W.addTriangle(a, b, c); W.addTriangle(a, c, dd); }
    }
    return this;
  }

  // ---------- traversal objects ----------
  spring(pos, normal = new THREE.Vector3(0, 1, 0), power = 30, r = 2.2, colorHex = 0xff3d81) {
    const bkS = this.bucket('solid', MATS.solid);
    const bkG = this.bucket('glow', MATS.basic, false);
    const col = new THREE.Color(colorHex);
    const dark = new THREE.Color(0x222833);
    const up = normal.clone();
    const side = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(up).normalize();
    const side2 = up.clone().cross(side);
    // base cylinder-ish disc stack
    const rings = [[r, 0.25, dark], [r * 0.72, 0.22, col], [r * 0.45, 0.18, col]];
    let h = 0;
    for (const [rr, hh, cc] of rings) {
      const c0 = pos.clone().addScaledVector(up, h + hh / 2);
      disc(bkS, c0, up, side, side2, rr, hh, cc);
      h += hh;
    }
    // glow cap
    const cap = pos.clone().addScaledVector(up, h + 0.06);
    disc(bkG, cap, up, side, side2, r * 0.34, 0.12, col);
    this.springs.push({ pos: pos.clone().addScaledVector(up, h * 0.5), normal: up.clone(), power, r });
    return this;
  }

  dashPanel(pos, yawDeg, speed = 46, colorHex = 0xffd23d, len = 6, wid = 5) {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const bkG = this.bucket('glow', MATS.basic, false);
    const bkS = this.bucket('solid', MATS.solid);
    const col = new THREE.Color(colorHex);
    const base = new THREE.Color(0x10141f);
    const p0 = pos.clone().addScaledVector(dir, -len / 2).addScaledVector(side, -wid / 2);
    const p1 = pos.clone().addScaledVector(dir, len / 2).addScaledVector(side, -wid / 2);
    const p2 = pos.clone().addScaledVector(dir, len / 2).addScaledVector(side, wid / 2);
    const p3 = pos.clone().addScaledVector(dir, -len / 2).addScaledVector(side, wid / 2);
    bkG.quad(p0.clone().setY(pos.y + 0.02), p1.clone().setY(pos.y + 0.02), p2.clone().setY(pos.y + 0.02), p3.clone().setY(pos.y + 0.02), col);
    // chevrons
    for (let i = 0; i < 3; i++) {
      const t0 = -len / 2 + len * (0.18 + i * 0.28);
      const cA = pos.clone().addScaledVector(dir, t0).addScaledVector(side, -wid * 0.28);
      const cB = pos.clone().addScaledVector(dir, t0 + len * 0.16).addScaledVector(side, 0);
      const cC = pos.clone().addScaledVector(dir, t0).addScaledVector(side, wid * 0.28);
      bkS.quad(cA.setY(pos.y + 0.05), cB.setY(pos.y + 0.05), cB.clone().setY(pos.y + 0.05), cC.setY(pos.y + 0.05), base);
    }
    this.dashPanels.push({ pos: pos.clone(), dir, speed, halfW: wid / 2 + 0.6, halfL: len / 2 });
    return this;
  }

  rail(pts, colorHex = 0x29f5ff, opt = {}) {
    // visual: glowing tube via ribbon strip facing up + posts
    const curve = new THREE.CatmullRomCurve3(pts, !!opt.closed, 'catmullrom', 0.2);
    const samples = Math.max(24, Math.round(curve.getLength() / 1.5));
    const spts = curve.getSpacedPoints(samples);
    this.world.addRail(spts, !!opt.closed);
    const bkG = this.bucket('glow', MATS.basic, false);
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < spts.length - 1; i++) {
      tubeSeg(bkG, spts[i], spts[i + 1], 0.09, col);
    }
    // support posts every ~6m where rail is high above nothing — skip for perf; visual only
    return this;
  }

  checkpoint(pos, idx) {
    const bkG = this.bucket('glow', MATS.basic, false);
    const bkS = this.bucket('solid', MATS.solid);
    const col = new THREE.Color(idx === 0 ? 0x29f5ff : 0x7dff4f);
    const dark = new THREE.Color(0x1b2334);
    this.box(pos.x - 4.5, pos.y + 2.5, pos.z, 0.8, 5, 0.8, dark.getHex());
    this.box(pos.x + 4.5, pos.y + 2.5, pos.z, 0.8, 5, 0.8, dark.getHex());
    // light bar
    const w = 4.5;
    bkG.quad(
      new THREE.Vector3(pos.x - w, pos.y + 5.0, pos.z - 0.15),
      new THREE.Vector3(pos.x + w, pos.y + 5.0, pos.z - 0.15),
      new THREE.Vector3(pos.x + w, pos.y + 5.6, pos.z - 0.15),
      new THREE.Vector3(pos.x - w, pos.y + 5.6, pos.z - 0.15), col);
    bkG.quad(
      new THREE.Vector3(pos.x - w, pos.y + 5.0, pos.z + 0.15),
      new THREE.Vector3(pos.x + w, pos.y + 5.0, pos.z + 0.15),
      new THREE.Vector3(pos.x + w, pos.y + 5.6, pos.z + 0.15),
      new THREE.Vector3(pos.x - w, pos.y + 5.6, pos.z + 0.15), col);
    this.checkpoints.push({ pos: pos.clone(), radius: 5.5, idx });
    return this;
  }

  gem(pos) {
    const mesh = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({
      color: 0xffd23d, emissive: 0xcc8800, emissiveIntensity: 1.4, metalness: .9, roughness: .15
    }));
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.gems.push({ pos: pos.clone(), taken: false, mesh });
    return this;
  }

  voltLine(from, to, count = 6, arcHeight = 0) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const p = from.clone().lerp(to, t);
      p.y += Math.sin(t * Math.PI) * arcHeight;
      this.volts.push({ pos: p, taken: false });
    }
    return this;
  }
  voltAt(pos) { this.volts.push({ pos: pos.clone(), taken: false }); return this; }
  voltRing(center, radius, count, axis = 'y') {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const p = center.clone();
      if (axis === 'y') p.x += Math.cos(a) * radius, p.z += Math.sin(a) * radius;
      else if (axis === 'x') p.y += Math.cos(a) * radius, p.z += Math.sin(a) * radius;
      else p.x += Math.cos(a) * radius, p.y += Math.sin(a) * radius;
      this.volts.push({ pos: p, taken: false });
    }
    return this;
  }

  updraft(min, max, accel = 38) { this.updrafts.push({ min, max, accel }); return this; }

  enemy(type, pos, opt = {}) { this.enemySpawns.push({ type, pos: pos.clone(), ...opt }); return this; }

  movingPlatform(getPos, size, colorHex = 0x39508a, phaseOffset = 0) {
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colorHex, roughness: .55, metalness: .35, emissive: new THREE.Color(colorHex).multiplyScalar(.14) }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x9fdcff }));
    mesh.add(edges);
    this.group.add(mesh);
    const m = { mesh, getPos, size: size.clone(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), phaseOffset };
    this.movers.push(m);
    return m;
  }

  goal(pos) {
    this.goalPos = pos.clone();
    const mesh = new THREE.Mesh(goalRingGeo, new THREE.MeshStandardMaterial({
      color: 0xfff7d0, emissive: 0xffcc33, emissiveIntensity: 1.8, metalness: .7, roughness: .25, side: THREE.DoubleSide
    }));
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.goalMesh = mesh;
    const light = new THREE.PointLight(0xffcc55, 60, 40); light.position.copy(pos);
    this.group.add(light);
    return this;
  }
}

// ---------- shared geometries/materials ----------
export function makeMaterials(theme) {
  MATS.solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: theme?.solid?.roughness ?? 0.82, metalness: theme?.solid?.metalness ?? 0.12 });
  MATS.solidGround = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 });
  MATS.basic = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  return MATS;
}
export const MATS = {};

const gemGeo = new THREE.OctahedronGeometry(0.85, 0);
const goalRingGeo = new THREE.TorusGeometry(4.4, 0.55, 12, 42);

function disc(bk, center, up, side, side2, r, h, col) {
  const seg = 14;
  const top = [], bot = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const off = side.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(side2, Math.sin(a) * r);
    top.push(center.clone().addScaledVector(up, h / 2).add(off));
    bot.push(center.clone().addScaledVector(up, -h / 2).add(off));
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    bk.quad(bot[i], bot[j], top[j], top[i], col);
    bk.tri(top[i], top[j], center.clone().addScaledVector(up, h / 2), col);
    bk.tri(bot[j], bot[i], center.clone().addScaledVector(up, -h / 2), col);
  }
}
function tubeSeg(bk, a, b, r, col) {
  const dir = b.clone().sub(a);
  if (dir.lengthSq() < 1e-8) return;
  dir.normalize();
  const side = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const side2 = dir.clone().cross(side);
  const seg = 5;
  const ringA = [], ringB = [];
  for (let i = 0; i < seg; i++) {
    const ang = (i / seg) * Math.PI * 2;
    const off = side.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(side2, Math.sin(ang) * r);
    ringA.push(a.clone().add(off)); ringB.push(b.clone().add(off));
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    bk.quad(ringA[i], ringA[j], ringB[j], ringB[i], col);
  }
}

