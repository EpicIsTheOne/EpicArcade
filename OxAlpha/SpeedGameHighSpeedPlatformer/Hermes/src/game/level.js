// level.js — level builder + runtime: spline roads w/ auto-banking, loops,
// halfpipes, rails, springs, dash panels, spikes, sparks/bolts, checkpoints,
// goal, moving platforms. Collision triangles feed the static CollisionWorld.
import * as THREE from 'three';
import { Scrapper, Turret, Zinger } from './enemies.js';

const UP = new THREE.Vector3(0, 1, 0);
const _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3();

function smoothArray(arr, passes, radius) {
  let a = arr.slice();
  for (let p = 0; p < passes; p++) {
    const b = a.slice();
    for (let i = 0; i < a.length; i++) {
      let sum = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = THREE.MathUtils.clamp(i + k, 0, a.length - 1);
        sum += b[j]; n++;
      }
      a[i] = sum / n;
    }
  }
  return a;
}

/* ================= material palettes ================= */
export function makeMats(themeKey) {
  const std = (color, roughness = .85, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const em = (color, intensity = 1.8) => new THREE.MeshStandardMaterial({
    color: 0x0a0a12, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: .5
  });
  const palettes = {
    coast: {
      ground: std(0xd9c08a), rock: std(0xa98d64), cliff: std(0x8a6f4d),
      road: std(0xcfa96e), wood: std(0x9a6b3f), leaf: std(0x59b85c), trunk: std(0x7a5230),
      accent: em(0xffb454, 1.2), water: std(0x2ba7c9, .25, .1), metal: std(0x8f9aa6, .4, .8)
    },
    foundry: {
      ground: std(0x23283c), rock: std(0x2c3248), cliff: std(0x1b2033),
      road: std(0x2e3448, .8, .25), wood: std(0x39415c), leaf: std(0x2f4a56), trunk: std(0x272d42),
      accent: em(0x22e5ff, 2.2), accent2: em(0xff3d81, 2.2), metal: std(0x565f7d, .35, .9),
      glass: new THREE.MeshStandardMaterial({ color: 0x0e1424, roughness: .1, metalness: .9 })
    },
    skyforge: {
      ground: std(0x7ec8a9), rock: std(0x9a8fc4), cliff: std(0x6f679f),
      road: std(0xb9aee0, .75, .2), wood: std(0xcbb7ef), leaf: std(0x67d6a0), trunk: std(0x8d84bb),
      accent: em(0xffd166, 1.8), metal: std(0xa9a2cf, .35, .85)
    }
  };
  return palettes[themeKey] || palettes.coast;
}

/* ================= rail data ================= */
export class RailData {
  constructor(curvePoints, scene, mat) {
    this.curve = new THREE.CatmullRomCurve3(curvePoints);
    const len = this.curve.getLength();
    this.length = len;
    const n = Math.max(8, Math.ceil(len / 1.3));
    this.pts = this.curve.getSpacedPoints(n);
    this.tans = [];
    for (let i = 0; i <= n; i++) {
      this.tans.push(this.curve.getTangent(i / n).normalize());
    }
    // spacing is uniform-ish: arc-per-sample
    this.stepLen = len / n;
    // bbox for coarse rejection
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    for (const p of this.pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
    // visual tube
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, n * 2, 0.09, 6), mat);
    scene.add(tube);
    // support posts every ~8u
    const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 1, 5);
    for (let s = 2; s < len - 1; s += 8) {
      const p = this.pointAt(s, new THREE.Vector3());
      const g = this.groundAt(p);
      const h = Math.max(0.2, p.y - g.y);
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(p.x, g.y + h / 2, p.z);
      post.scale.y = h;
      scene.add(post);
    }
  }
  pointAt(s, out) {
    const f = THREE.MathUtils.clamp(s / this.stepLen, 0, this.pts.length - 1);
    const i = Math.min(Math.floor(f), this.pts.length - 2);
    return out.lerpVectors(this.pts[i], this.pts[i + 1], f - i);
  }
  tangentAt(s, out) {
    const f = THREE.MathUtils.clamp(s / this.stepLen, 0, this.tans.length - 1);
    const i = Math.min(Math.floor(f), this.tans.length - 2);
    return out.lerpVectors(this.tans[i], this.tans[i + 1], f - i).normalize();
  }
  groundAt(p) {
    // nearest support: just drop to p.y - 4 for posts (visual only)
    return new THREE.Vector3(p.x, p.y - 4, p.z);
  }
}

/* ================= moving platform ================= */
export class MovingPlatform {
  constructor(scene, geoMat, a, b, period, size, phase = 0) {
    this.a = a.clone(); this.b = b.clone();
    this.period = period; this.phase = phase;
    this.half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    this.pos = a.clone();
    this.vel = new THREE.Vector3();
    this.frameDelta = new THREE.Vector3();
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), geoMat);
    this.mesh.position.copy(a);
    scene.add(this.mesh);
    this._t = 0;
  }
  update(dt, time) {
    this._t = time / 1 + this.phase;
    const k = (Math.sin((time / this.period) * Math.PI * 2 + this.phase) + 1) / 2;
    const np = new THREE.Vector3().lerpVectors(this.a, this.b, k);
    this.frameDelta.subVectors(np, this.pos);
    if (dt > 0) this.vel.copy(this.frameDelta).divideScalar(dt);
    this.pos.copy(np);
    this.mesh.position.copy(np);
  }
  sphereCollide(center, r, out, max) {
    let n = 0;
    const lx = center.x - this.pos.x, ly = center.y - this.pos.y, lz = center.z - this.pos.z;
    const hx = this.half.x, hy = this.half.y, hz = this.half.z;
    const cx = THREE.MathUtils.clamp(lx, -hx, hx), cy = THREE.MathUtils.clamp(ly, -hy, hy), cz = THREE.MathUtils.clamp(lz, -hz, hz);
    let dx = lx - cx, dy = ly - cy, dz = lz - cz;
    let d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) return 0;
    let nx, ny, nz, depth;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d;
    } else {
      // deep inside: push along least penetration axis
      const px = hx - Math.abs(lx), py = hy - Math.abs(ly), pz = hz - Math.abs(lz);
      if (px <= py && px <= pz) { nx = Math.sign(lx) || 1; ny = 0; nz = 0; depth = px + r; }
      else if (py <= pz) { nx = 0; ny = Math.sign(ly) || 1; nz = 0; depth = py + r; }
      else { nx = 0; ny = 0; nz = Math.sign(lz) || 1; depth = pz + r; }
    }
    if (n < max) {
      out[n].nx = nx; out[n].ny = ny; out[n].nz = nz; out[n].depth = depth;
      n++;
    }
    return n;
  }
}

/* ================= builder ================= */
export class Builder {
  constructor(scene, world, mats) {
    this.scene = scene; this.world = world; this.mats = mats;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rails = [];
    this.springs = [];
    this.panels = [];
    this.spikes = [];
    this.sparkPositions = [];
    this.bolts = [];
    this.enemyDefs = [];
    this.checkpointDefs = [];
    this.goalDef = null;
    this.movingPlatformDefs = [];
    this._m = new THREE.Matrix4();
  }

  _add(geom, material, x, y, z, rx = 0, ry = 0, rz = 0, collide = true) {
    const m = new THREE.Mesh(geom, material);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (collide) {
      m.updateWorldMatrix(true, false);
      this.world.addGeometry(geom, m.matrixWorld);
    }
    return m;
  }

  box(x, y, z, sx, sy, sz, mat, opts = {}) {
    return this._add(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z, opts.rx || 0, opts.ry || 0, opts.rz || 0, opts.collide !== false);
  }

  cyl(x, y, z, rt, rb, h, seg, mat, opts = {}) {
    return this._add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, 0, 0, 0, opts.collide !== false);
  }

  /** Triangular prism ramp rising along +Z (length l, height h, width w). */
  wedge(x, y, z, w, l, h, mat, opts = {}) {
    const g = new THREE.BufferGeometry();
    const hw = w / 2, hl = l / 2;
    const v = [
      [-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl],       // base
      [-hw, h, hl], [hw, h, hl]                                      // top edge (far)
    ];
    const faces = [
      [0, 1, 5], [0, 5, 4],   // slope
      [3, 4, 5], [3, 5, 2],   // back wall
      [0, 4, 3],              // left tri
      [1, 2, 5],              // right tri
      [0, 3, 2], [0, 2, 1]    // bottom
    ];
    const posArr = [];
    for (const f of faces) for (const vi of f) posArr.push(...v[vi]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    g.computeVertexNormals();
    return this._add(g, mat, x, y, z, opts.rx || 0, opts.ry || 0, opts.rz || 0, opts.collide !== false);
  }

  /** Full vertical loop. dir = travel direction angle (radians, atan2(x,z) style). */
  loop(cx, cy, cz, dir, R, width, mat) {
    const D = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir));
    const N = 44;
    const posArr = []; const idx = [];
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI / 2 + (i / N) * Math.PI * 2;         // start at bottom
      const radial = new THREE.Vector3().addScaledVector(UP, Math.cos(a)).addScaledVector(D, Math.sin(a));
      const c = new THREE.Vector3(cx, cy, cz).addScaledVector(radial, R);
      const side = new THREE.Vector3().crossVectors(D, radial).normalize();
      posArr.push(
        c.x - side.x * width / 2, c.y - side.y * width / 2, c.z - side.z * width / 2,
        c.x + side.x * width / 2, c.y + side.y * width / 2, c.z + side.z * width / 2
      );
    }
    for (let i = 0; i < N; i++) {
      const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: mat.color, roughness: .8, metalness: .1, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    this.world.addGeometry(g, m.matrixWorld);
    // decorative ring supports
    const sup = new THREE.Mesh(new THREE.TorusGeometry(R + 0.6, 0.28, 8, 40), this.mats.accent || mat);
    sup.position.set(cx, cy, cz);
    sup.lookAt(new THREE.Vector3(cx + D.x, cy, cz + D.z));
    this.group.add(sup);
    return m;
  }

  /**
   * Flowing road ribbon along a spline with automatic banking.
   * points: array of [x,y,z]; width in u; returns nothing (adds geometry).
   */
  road(points, width, mat, opts = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const len = curve.getLength();
    const N = Math.max(16, Math.ceil(len / 4));
    const up = UP.clone();
    const centers = [], sides = [];
    // pass 1: tangents + centers
    const tans = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      centers.push(curve.getPoint(t));
      const tan = curve.getTangent(t).normalize();
      tans.push(tan);
    }
    // pass 2: signed turn angle over neighboring samples -> smooth -> bank
    const segLen = len / N;
    const rawBank = new Array(N + 1).fill(0);
    for (let i = 1; i < N; i++) {
      const a = _tmpA.copy(tans[i - 1]).setY(0).normalize();
      const b = _tmpB.copy(tans[i + 1]).setY(0).normalize();
      if (a.lengthSq() < 0.5 || b.lengthSq() < 0.5) continue;
      const crossY = a.x * b.z - a.z * b.x;          // >0 => turning left (+yaw)
      const ang = Math.atan2(crossY, a.dot(b));      // radians over 2 segments
      const perMeter = ang / (2 * segLen);
      rawBank[i] = THREE.MathUtils.clamp(perMeter * (opts.bankScale ?? 55), -0.45, 0.45);
    }
    rawBank[0] = rawBank[1]; rawBank[N] = rawBank[N - 1];
    const bank = smoothArray(rawBank, 3, Math.max(2, Math.floor(N / 6)));
    // pass 3: sides with smoothed banking (positive bank => lower inner/left edge)
    for (let i = 0; i <= N; i++) {
      const c = centers[i];
      const tan = tans[i];
      const flatTan = _tmpA.set(tan.x, 0, tan.z);
      if (flatTan.lengthSq() < 1e-6) flatTan.set(0, 0, 1); flatTan.normalize();
      let side = new THREE.Vector3().crossVectors(flatTan, up).normalize().negate();
      side.applyAxisAngle(_tmpB.copy(tan).normalize(), -bank[i]);
      sides.push(side.multiplyScalar(width / 2));
    }
    const posArr = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const c = centers[i], s = sides[i];
      posArr.push(c.x - s.x, c.y - s.y, c.z - s.z, c.x + s.x, c.y + s.y, c.z + s.z);
    }
    for (let i = 0; i < N; i++) {
      const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const vm = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.roughness ?? .85, metalness: mat.metalness ?? 0 });
    const m = new THREE.Mesh(g, vm);
    m.receiveShadow = true; m.castShadow = false;
    this.group.add(m);
    this.world.addGeometry(g, m.matrixWorld);

    // glowing edge rails for readability
    if (opts.edges !== false) {
      const eg = [], ei = [];
      for (let i = 0; i <= N; i++) {
        const c = centers[i], s = sides[i].clone().multiplyScalar(1.04);
        eg.push(c.x + s.x, c.y + 0.09, c.z + s.z, c.x - s.x, c.y - 0.09, c.z - s.z);
      }
      for (let i = 0; i < N; i++) { const a0 = i * 2; ei.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      const ge = new THREE.BufferGeometry();
      ge.setAttribute('position', new THREE.Float32BufferAttribute(eg, 3));
      ge.setIndex(ei);
      const em = new THREE.MeshBasicMaterial({ color: opts.edgeColor || '#ffd166', transparent: true, opacity: .85 });
      const me = new THREE.Mesh(ge, em);
      this.group.add(me);
    }
    return { curve, len };
  }

  rail(points, mat, opts = {}) {
    const data = new RailData(points.map(p => new THREE.Vector3(...p)), this.scene, mat);
    this.rails.push(data);
    return data;
  }

  spring(x, y, z, yawDeg, pitchDeg, power = 30) {
    const yaw = THREE.MathUtils.degToRad(yawDeg), pitch = THREE.MathUtils.degToRad(pitchDeg || 70);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    const base = this._add(new THREE.CylinderGeometry(1.1, 1.35, 0.32, 14), this.mats.metal, x, y + 0.16, z);
    const pad = this._add(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.accent, x, y + 0.28, z);
    void base; void pad;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), new THREE.MeshBasicMaterial({ color: '#fff' }));
    arrow.position.copy(dir).multiplyScalar(1.3).add(new THREE.Vector3(x, y + 0.3, z));
    arrow.quaternion.setFromUnitVectors(UP, dir);
    this.group.add(arrow);
    this.springs.push({ pos: new THREE.Vector3(x, y + 0.6, z), dir, power, r: 1.9, cd: 0 });
  }

  panel(x, y, z, yawDeg, power = 62) {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const plate = this.box(x, y + 0.06, z, 3.4, 0.14, 5.2, this.mats.accent, { ry: yaw, collide: true });
    void plate;
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 3), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      chev.rotation.x = Math.PI / 2;
      chev.rotation.z = Math.PI;
      chev.position.set(x, y + 0.18, z).addScaledVector(dir, -1.4 + i * 1.4);
      chev.rotateY(yaw);
      chev.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0, 'YXZ'));
      this.group.add(chev);
    }
    this.panels.push({ pos: new THREE.Vector3(x, y + 0.5, z), dir, power, r: 2.6, cd: 0 });
  }

  spikesBox(x, y, z, sx, sy, sz) {
    this.spikes.push({ min: new THREE.Vector3(x - sx / 2, y - sy / 2, z - sz / 2), max: new THREE.Vector3(x + sx / 2, y + sy / 2, z + sz / 2) });
    const n = Math.max(1, Math.floor(sx / 1.1)) * Math.max(1, Math.floor(sz / 1.1));
    const g = new THREE.ConeGeometry(0.36, sy, 6);
    const mm = new THREE.MeshStandardMaterial({ color: 0x883038, roughness: .5, metalness: .6 });
    for (let i = 0; i < n; i++) {
      const ix = i % Math.max(1, Math.floor(sx / 1.1)), iz = Math.floor(i / Math.max(1, Math.floor(sx / 1.1)));
      const px = x - sx / 2 + 0.55 + ix * 1.1, pz = z - sz / 2 + 0.55 + iz * 1.1;
      this._add(g, mm, px, y + sy / 2, pz);
    }
  }

  sparkLine(a, b, n) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    for (let i = 0; i < n; i++) this.sparkPositions.push(new THREE.Vector3().lerpVectors(A, B, i / (n - 1)));
  }
  sparkArc(points, n) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    for (let i = 0; i < n; i++) this.sparkPositions.push(curve.getPoint(i / (n - 1)));
  }
  sparkRing(cx, cy, cz, r, n, axis = 'y') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (axis === 'y') this.sparkPositions.push(new THREE.Vector3(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r));
      else this.sparkPositions.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz));
    }
  }

  bolt(x, y, z, idx) { this.bolts.push({ pos: new THREE.Vector3(x, y, z), idx }); }

  enemy(type, x, y, z, opts = {}) { this.enemyDefs.push({ type, pos: new THREE.Vector3(x, y, z), opts }); }

  checkpoint(x, y, z, yawDeg) { this.checkpointDefs.push({ pos: new THREE.Vector3(x, y, z), yaw: THREE.MathUtils.degToRad(yawDeg) }); }

  goal(x, y, z, yawDeg) { this.goalDef = { pos: new THREE.Vector3(x, y, z), yaw: THREE.MathUtils.degToRad(yawDeg) }; }

  mover(ax, ay, az, bx, by, bz, period, sx, sy, sz, phase = 0) {
    this.movingPlatformDefs.push([new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz), period, { x: sx, y: sy, z: sz }, phase]);
  }
}

/* ================= runtime level ================= */
export class Level {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.killY = def.killY;
    this.par = def.par;
    this.name = def.name;
    this.gusts = (def.gusts || []).map(g => ({
      min: new THREE.Vector3(...g.min), max: new THREE.Vector3(...g.max), f: new THREE.Vector3(...g.f)
    }));
    this.movingPlatforms = [];
    this.enemies = [];
    this.time = 0;

    this.group = new THREE.Group();
    game.scene.add(this.group);

    const mats = makeMats(def.themeKey);
    this.mats = mats;
    const builder = new Builder(game.scene, game.world, mats);
    this.builder = builder;

    def.build(builder);

    // instantiate enemies
    const enemyClasses = { scrapper: Scrapper, turret: Turret, zinger: Zinger };
    for (const e of builder.enemyDefs) {
      const en = new enemyClasses[e.type](e.pos, e.opts);
      this.group.add(en.group);
      this.enemies.push(en);
    }
    // moving platforms
    const mpMat = mats.metal || mats.rock;
    for (const [a, b, period, size, phase] of builder.movingPlatformDefs) {
      this.movingPlatforms.push(new MovingPlatform(game.scene, mpMat, a, b, period, size, phase));
    }
    // sparks (instanced)
    this.sparkTotal = builder.sparkPositions.length;
    const sgeo = new THREE.OctahedronGeometry(0.34);
    const smat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb01f, emissiveIntensity: 1.6, roughness: .3 });
    this.sparkMesh = new THREE.InstancedMesh(sgeo, smat, Math.max(1, this.sparkTotal));
    this.sparkMesh.frustumCulled = false;
    this.sparkCollected = new Array(this.sparkTotal).fill(false);
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < this.sparkTotal; i++) {
      this.dummy.position.copy(builder.sparkPositions[i]);
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
    }
    game.scene.add(this.sparkMesh);
    this.sparkBase = builder.sparkPositions;

    // bolts (secrets)
    this.boltMeshes = [];
    for (const b of builder.bolts) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0xff4757, emissive: 0xff2233, emissiveIntensity: 1.4, roughness: .3 }));
      g.add(core);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 8, 20), new THREE.MeshBasicMaterial({ color: 0xff8a94 }));
      g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff4757, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 30; g.add(beam);
      g.position.copy(b.pos);
      game.scene.add(g);
      this.boltMeshes.push({ grp: g, collected: false, pos: b.pos });
    }

    // checkpoints
    this.checkpoints = [];
    for (const cp of builder.checkpointDefs) {
      const g = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 10, 28, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x10353b, emissive: 0x17c3b2, emissiveIntensity: .7, roughness: .4 }));
      g.add(arch);
      g.position.copy(cp.pos);
      g.rotation.y = cp.yaw;
      game.scene.add(g);
      this.checkpoints.push({ grp: g, pos: cp.pos, yaw: cp.yaw, active: false });
    }

    // goal gate
    this.goal = builder.goalDef;
    if (this.goal) {
      const g = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.5, 12, 30, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x1a1030, emissive: 0xff9f1c, emissiveIntensity: 1.1, roughness: .35 }));
      g.add(arch);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(4.3, 30),
        new THREE.ShaderMaterial({
          transparent: true, side: THREE.DoubleSide, depthWrite: false,
          uniforms: { uTime: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
          fragmentShader: `
            uniform float uTime; varying vec2 vUv;
            void main(){
              vec2 p = vUv-0.5; float r=length(p); float a=atan(p.y,p.x);
              float swirl = sin(a*5.0 + uTime*3.0 - r*14.0)*0.5+0.5;
              float alpha = smoothstep(0.52,0.2,r)*(0.35+swirl*0.4);
              vec3 col = mix(vec3(1.0,0.63,0.11), vec3(1.0,0.93,0.66), swirl);
              gl_FragColor = vec4(col, alpha);
            }`
        }));
      disc.position.y = 0.2;
      g.add(disc);
      this.goalDisc = disc;
      g.position.copy(this.goal.pos);
      g.rotation.y = this.goal.yaw;
      game.scene.add(g);
      this.goalGrp = g;
    }

    // finish world build
    game.world.build();
  }

  tryAttachRail(player) {
    const p = player.pos;
    for (const rail of this.builder.rails) {
      // coarse bbox reject
      if (p.x < rail.minX - 6 || p.x > rail.maxX + 6 || p.y < rail.minY - 6 ||
        p.y > rail.maxY + 6 || p.z < rail.minZ - 6 || p.z > rail.maxZ + 6) continue;
      const near = rail.pts;
      for (let i = 0; i < near.length; i += 1) {
        const p = near[i];
        const dx = p.x - player.pos.x, dy = p.y - player.pos.y, dz = p.z - player.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 2.3 * 2.3) {
          const s = i * rail.stepLen;
          const tan = rail.tangentAt(s, new THREE.Vector3());
          const along = player.vel.dot(tan);
          if (Math.abs(along) > 2 || !player.grounded) {
            player.attachRail(rail, s, along >= 0 ? 1 : -1);
            return;
          }
        }
      }
    }
  }

  sparkCount() { return this.sparkTotal; }
  boltCount() { return this.boltMeshes.length; }

  update(dt, player) {
    this.time += dt;
    for (const mp of this.movingPlatforms) mp.update(dt, this.time);

    // sparks animate + collect
    const pc = player.pos;
    for (let i = 0; i < this.sparkTotal; i++) {
      if (this.sparkCollected[i]) continue;
      const sp = this.sparkBase[i];
      const dx = sp.x - pc.x, dy = sp.y - pc.y, dz = sp.z - pc.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 30) { // magnet
        const d = Math.sqrt(d2) || 0.001;
        if (player.speed > 8) {
          sp.addScaledVector(new THREE.Vector3(-dx / d, -dy / d, -dz / d), Math.min(26 * dt, d));
        }
        if (d < 1.5) {
          this.sparkCollected[i] = true;
          this.game.onSpark(sp);
          continue;
        }
      }
      this.dummy.position.copy(sp);
      this.dummy.position.y += Math.sin(this.time * 3 + i) * 0.12;
      this.dummy.rotation.set(0, this.time * 2.4 + i, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (let i = 0; i < this.sparkTotal; i++) {
      if (this.sparkCollected[i]) {
        this.dummy.position.set(0, -9999, 0); this.dummy.scale.setScalar(0.0001);
        this.dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;

    // bolts
    for (const b of this.boltMeshes) {
      if (b.collected) continue;
      b.grp.rotation.y += dt * 2;
      if (b.pos.distanceTo(pc) < 2.2) {
        b.collected = true;
        b.grp.visible = false;
        this.game.onBolt(b.pos);
      }
    }

    // springs
    for (const s of this.builder.springs) {
      s.cd -= dt;
      if (s.cd > 0) continue;
      const d = s.pos.distanceTo(pc);
      if (d < s.r + player.radius) {
        s.cd = 1;
        player.vel.copy(s.dir).multiplyScalar(s.power);
        player.grounded = false; player.rail = null;
        player.stats.springsHit++;
        player.grantBoost(8);
        player.airTime = 0.3;
        this.game.onSpring(s.pos);
      }
    }
    // dash panels
    for (const p of this.builder.panels) {
      p.cd -= dt;
      if (p.cd > 0) continue;
      const dx = pc.x - p.pos.x, dy = pc.y - p.pos.y, dz = pc.z - p.pos.z;
      if (dx * dx + dy * dy * 4 + dz * dz < p.r * p.r) {
        const cur = player.vel.dot(p.dir);
        const boost = Math.max(cur, 0) * 0.35;
        player.vel.addScaledVector(p.dir, Math.max(0, p.power - cur));
        player.vel.addScaledVector(p.dir, boost);
        p.cd = 1.2;
        player.stats.panelsHit++;
        player.grantBoost(15);
        this.game.onPanel(p.pos);
      }
    }
    // spikes
    for (const sk of this.builder.spikes) {
      if (pc.x > sk.min.x && pc.x < sk.max.x && pc.y > sk.min.y && pc.y < sk.max.y + 0.5 && pc.z > sk.min.z && pc.z < sk.max.z) {
        if (player.hurt(sk.min)) this.game.onPlayerHit();
      }
    }
    // checkpoints
    for (const cp of this.checkpoints) {
      if (cp.active) continue;
      if (cp.pos.distanceTo(pc) < 4.2) {
        cp.active = true;
        player.checkpoint.copy(cp.pos).add(new THREE.Vector3(0, 1, 0));
        player.cpYaw = cp.yaw + Math.PI;
        player.hearts = Math.min(3, player.hearts + 1);
        cp.grp.children[0].material.emissiveIntensity = 2.2;
        this.game.onCheckpoint(cp.pos);
      }
    }
    // goal
    if (this.goal && this.goal.pos.distanceTo(pc) < 4.8 && !this.game.finished) {
      this.game.levelComplete();
    }

    // enemies
    for (const e of this.enemies) e.update(dt, player, this.game);
    // enemy orbs are managed by game

    if (this.goalDisc) this.goalDisc.material.uniforms.uTime.value = this.time;
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.game.scene.remove(this.sparkMesh);
    for (const b of this.boltMeshes) this.game.scene.remove(b.grp);
    for (const c of this.checkpoints) this.game.scene.remove(c.grp);
    if (this.goalGrp) this.game.scene.remove(this.goalGrp);
    for (const e of this.enemies) this.game.scene.remove(e.group);
    for (const mp of this.movingPlatforms) this.game.scene.remove(mp.mesh);
  }
}
