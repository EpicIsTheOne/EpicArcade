import * as THREE from '../lib/three.module.js';
import { G, CFG, rng, clamp } from './state.js';
import { makeBody, createWorld } from './physics.js';
import * as audio from './audio.js';
import * as effects from './effects.js';

const MATS = {};
let GEO = {};
let frozenCache = new Map();
let lastTrim = 0;

function stdMat(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.82,
    metalness: o.metal ?? 0.06,
  });
}

export function initFactory() {
  MATS.brick = ['#b3552e', '#a94f2c', '#c05f33', '#96472a'].map((c) => stdMat(c, { rough: 0.88 }));
  MATS.concrete = stdMat('#8d9094', { rough: 0.92 });
  MATS.stone = stdMat('#767c83', { rough: 0.95 });
  MATS.crate = stdMat('#c29a5b', { rough: 0.8 });
  MATS.wood = stdMat('#b5854e');
  MATS.woodDark = stdMat('#8a6236');
  MATS.metal = stdMat('#6f7d8c', { metal: 0.72, rough: 0.38 });
  MATS.roof = stdMat('#4c5560', { rough: 0.72 });
  MATS.barrel = stdMat('#a84b38', { metal: 0.35, rough: 0.5 });
  MATS.rubber = stdMat('#3c4046', { rough: 0.9 });
  MATS.dark = stdMat('#3f444c', { metal: 0.65, rough: 0.42 });
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.sphere = new THREE.SphereGeometry(1, 22, 14);
  GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#565a4e';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function minDim(e) {
  const s = e.def.size;
  if (e.def.shape === 'sphere') return s.r * 2;
  if (e.def.shape === 'cyl') return Math.min(s.h, s.r * 2);
  return Math.min(s.sx, s.sy, s.sz);
}

function register(mesh, phys, def, extra = {}) {
  const t = phys.body.translation();
  const r = phys.body.rotation();
  const e = {
    id: G.nextId++,
    kind: def.kind,
    mesh,
    body: phys.body,
    collider: phys.collider,
    def,
    fragLevel: def.frag || 0,
    frozen: false,
    isFragment: !!def.isFragment,
    baseMat: mesh.material,
    alive: true,
    counted: !phys.body.isFixed(),
    born: performance.now(),
    pp: new Float32Array([t.x, t.y, t.z]),
    pq: new Float32Array([r.x, r.y, r.z, r.w]),
    cp: new Float32Array([t.x, t.y, t.z]),
    cq: new Float32Array([r.x, r.y, r.z, r.w]),
    ...extra,
  };
  mesh.userData.entity = e;
  G.entities.set(e.id, e);
  if (phys.collider) G.byCollider.set(phys.collider.handle, e);
  if (e.counted) G.dynamicCount++;
  if (e.isFragment) G.fragmentQueue.push({ id: e.id, t: performance.now() });
  G.meshesDirty = true;
  return e;
}

function finishMesh(mesh, pos, quat) {
  mesh.position.copy(pos);
  if (quat) mesh.quaternion.copy(quat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  G.scene.add(mesh);
}

function spawnBox(o) {
  const [sx, sy, sz] = o.size;
  const mesh = new THREE.Mesh(GEO.box, o.mat);
  mesh.scale.set(sx, sy, sz);
  finishMesh(mesh, o.pos, o.quat || null);
  const phys = makeBody({
    pos: o.pos, quat: o.quat ? { x: o.quat.x, y: o.quat.y, z: o.quat.z, w: o.quat.w } : null,
    shape: 'box', size: { sx, sy, sz },
    density: o.density ?? 1, friction: o.friction ?? 0.78,
    restitution: o.restitution ?? 0.04,
    ccd: o.ccd, fixed: o.fixed, damping: o.damping,
  });
  if (o.linvel) phys.body.setLinvel(o.linvel, true);
  if (o.angvel) phys.body.setAngvel(o.angvel, true);
  return register(mesh, phys, {
    shape: 'box', size: { sx, sy, sz }, density: o.density ?? 1, frag: o.frag,
    mat: o.mat, kind: o.kind || 'block', isFragment: o.isFragment,
  });
}

function spawnSphere(o) {
  const mesh = new THREE.Mesh(GEO.sphere, o.mat);
  mesh.scale.setScalar(o.size.r);
  finishMesh(mesh, o.pos, null);
  const phys = makeBody({
    pos: o.pos, shape: 'sphere', size: { r: o.size.r },
    density: o.density ?? 1, friction: o.friction ?? 0.6,
    restitution: o.restitution ?? 0.15, ccd: o.ccd, fixed: o.fixed,
  });
  if (o.linvel) phys.body.setLinvel(o.linvel, true);
  if (o.angvel) phys.body.setAngvel(o.angvel, true);
  return register(mesh, phys, {
    shape: 'sphere', size: { r: o.size.r }, density: o.density ?? 1,
    frag: o.frag || 0, mat: o.mat, kind: o.kind || 'ball',
  });
}

function spawnCyl(o) {
  const mesh = new THREE.Mesh(GEO.cyl, o.mat);
  mesh.scale.set(o.size.r, o.size.h, o.size.r);
  finishMesh(mesh, o.pos, o.quat || null);
  const phys = makeBody({
    pos: o.pos, shape: 'cyl', size: { r: o.size.r, h: o.size.h },
    density: o.density ?? 1, friction: o.friction ?? 0.6,
    restitution: o.restitution ?? 0.1, ccd: o.ccd, fixed: o.fixed,
  });
  if (o.linvel) phys.body.setLinvel(o.linvel, true);
  return register(mesh, phys, {
    shape: 'cyl', size: { r: o.size.r, h: o.size.h }, density: o.density ?? 1,
    frag: o.frag || 0, mat: o.mat, kind: o.kind || 'barrel',
  });
}

export function removeEntity(e, silent) {
  if (!e || !e.alive || !G.entities.has(e.id)) return;
  e.alive = false;
  if (G.grabbed && G.grabbed.e === e) G.grabbed = null;
  if (G.hovered === e) G.hovered = null;
  if (!silent) {
    const p = e.body.translation();
    effects.puffDelete(new THREE.Vector3(p.x, p.y, p.z));
    audio.pop();
  }
  try {
    G.world.removeRigidBody(e.body);
    if (e.collider) G.byCollider.delete(e.collider.handle);
    if (e.counted) {
      e.counted = false;
      G.dynamicCount--;
    }
  } catch (err) {}
  if (e.mesh) G.scene.remove(e.mesh);
  G.entities.delete(e.id);
  G.meshesDirty = true;
}

export function canSplit(e) {
  return !!e && e.alive && !!e.def && e.def.shape === 'box' && e.fragLevel > 0 &&
    !e.frozen && minDim(e) >= 0.24 && G.dynamicCount < CFG.maxDynamic - 8 &&
    e.kind !== 'proj' && performance.now() - (e.born || 0) > 700;
}

export function splitEntity(e) {
  if (!canSplit(e)) return false;
  const d = e.def;
  const s = d.size;
  const bp = e.body.translation();
  const bq = e.body.rotation();
  const bv = e.body.linvel();
  const bw = e.body.angvel();
  const q = new THREE.Quaternion(bq.x, bq.y, bq.z, bq.w);
  const hs = { sx: s.sx / 2, sy: s.sy / 2, sz: s.sz / 2 };
  const off = new THREE.Vector3();
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) {
    off.set(dx * s.sx / 4, dy * s.sy / 4, dz * s.sz / 4).applyQuaternion(q);
    const vx = bv.x + off.x * (2 + rng() * 2.5);
    const vy = Math.max(bv.y + off.y * (2 + rng() * 2.5) + 0.6, 0.4);
    const vz = bv.z + off.z * (2 + rng() * 2.5);
    spawnBox({
      pos: { x: bp.x + off.x, y: Math.max(bp.y + off.y, hs.sy / 2 + 0.01), z: bp.z + off.z },
      quat: q,
      size: [hs.sx, hs.sy, hs.sz],
      mat: d.mat, density: d.density, friction: d.friction ?? 0.78,
      frag: e.fragLevel - 1, kind: 'frag', isFragment: true,
      linvel: { x: vx, y: vy, z: vz },
      angvel: { x: (rng() - 0.5) * 8, y: (rng() - 0.5) * 8, z: (rng() - 0.5) * 8 },
    });
  }
  const p = new THREE.Vector3(bp.x, bp.y, bp.z);
  effects.impactDust(p, 1.6, clamp(minDim(e), 0.4, 1.6));
  audio.crack();
  removeEntity(e, true);
  return true;
}

export function toggleFreeze(e) {
  if (!e || !e.alive || e.kind === 'ground') return false;
  if (!e.frozen) {
    e.body.setBodyType(G.RAPIER.RigidBodyType.Fixed, true);
    e.frozen = true;
    e.mesh.material = frozenMatFor(e.baseMat);
    audio.chime(true);
  } else {
    e.body.setBodyType(G.RAPIER.RigidBodyType.Dynamic, true);
    e.frozen = false;
    e.mesh.material = e.baseMat;
    audio.chime(false);
  }
  return true;
}

function frozenMatFor(mat) {
  let f = frozenCache.get(mat.uuid);
  if (!f) {
    f = mat.clone();
    f.emissive = new THREE.Color('#2fb9e8');
    f.emissiveIntensity = 0.55;
    frozenCache.set(mat.uuid, f);
  }
  return f;
}

export function applyBlast(p) {
  const R = CFG.blastRadius;
  const P = CFG.blastPower;
  let budget = 6;
  const pre = [];
  for (const e of G.entities.values()) {
    if (!e.body.isDynamic() || e.frozen) continue;
    const bp = e.body.translation();
    const d = Math.hypot(bp.x - p.x, bp.y - p.y, bp.z - p.z);
    if (d < R) pre.push([e, d]);
  }
  for (const [e, d] of pre) {
    if (budget > 0 && d < R * 0.42 && canSplit(e)) {
      if (splitEntity(e)) budget--;
    }
  }
  const tmp = new THREE.Vector3();
  for (const e of G.entities.values()) {
    if (!e.body.isDynamic() || e.frozen) continue;
    const bp = e.body.translation();
    const d = Math.hypot(bp.x - p.x, bp.y - p.y, bp.z - p.z);
    if (d >= R) continue;
    tmp.set(bp.x - p.x, bp.y - p.y, bp.z - p.z);
    if (tmp.lengthSq() < 0.09) tmp.set(rng() - 0.5, 0.8, rng() - 0.5);
    tmp.normalize();
    tmp.y += 0.32;
    tmp.normalize();
    const fall = Math.pow(1 - d / R, 1.35);
    const m = e.body.mass();
    const dv = P * fall;
    e.body.applyImpulse({ x: tmp.x * dv * m, y: tmp.y * dv * m, z: tmp.z * dv * m }, true);
    e.body.applyTorqueImpulse({
      x: (rng() - 0.5) * 0.4 * m, y: (rng() - 0.5) * 0.4 * m, z: (rng() - 0.5) * 0.4 * m,
    }, true);
  }
  effects.explosionFX(p);
  audio.boom();
  G.shake += 1.0;
}

export function handleImpacts(list) {
  let budget = 3;
  for (const im of list) {
    const dyn = im.a && im.a.alive && im.a.body.isDynamic() ? im.a
      : (im.b && im.b.alive && im.b.body.isDynamic() ? im.b : null);
    if (!dyn || !dyn.alive) continue;
    if (im.rel > 0.85) {
      const size = minDim(dyn) || 0.5;
      const tp = im.pt || dyn.body.translation();
      let vol = clamp((im.rel - 0.75) / 5, 0, 1) * 0.9;
      if (dyn.isFragment) vol *= 0.45;
      if (dyn.kind === 'proj') vol *= 0.5;
      audio.thud(vol, size);
      if (im.rel > 1.5) {
        effects.impactDust(tp, clamp((im.rel - 1.2) * 0.8, 0.2, 2.4), clamp(size, 0.4, 1.5));
      }
    }
    if (budget > 0 && im.rel > 2.7 && canSplit(dyn)) {
      if (splitEntity(dyn)) budget--;
    }
  }
}

export function trimFragments(now) {
  if (now - lastTrim < 1200) return;
  lastTrim = now;
  while (G.dynamicCount > CFG.maxDynamic && G.fragmentQueue.length) {
    const { id } = G.fragmentQueue.shift();
    const e = G.entities.get(id);
    if (e) removeEntity(e, true);
  }
}

export function projectileSpawn(origin, dir) {
  const e = spawnSphere({
    pos: { x: origin.x + dir.x * 1.2, y: origin.y + dir.y * 1.2, z: origin.z + dir.z * 1.2 },
    size: { r: 0.22 }, mat: MATS.metal, density: 6, friction: 0.5,
    restitution: 0.28, ccd: true, kind: 'proj',
    linvel: { x: dir.x * 40, y: dir.y * 40, z: dir.z * 40 },
  });
  G.projQueue.push(e.id);
  while (G.projQueue.length > CFG.projectileCap) {
    const id = G.projQueue.shift();
    const old = G.entities.get(id);
    if (old) removeEntity(old, true);
  }
  audio.whoosh();
  return e;
}

export function spawnProp(kind, pos, dir) {
  let e = null;
  const jx = (rng() - 0.5) * 0.3;
  const jz = (rng() - 0.5) * 0.3;
  if (kind === 'crate') {
    e = spawnBox({ pos: { x: pos.x + jx, y: pos.y + 0.44, z: pos.z + jz }, size: [0.78, 0.78, 0.78], mat: MATS.crate, density: 0.55, frag: 1, kind: 'crate', linvel: { x: dir.x * 2.5, y: 1.5, z: dir.z * 2.5 } });
  } else if (kind === 'plank') {
    e = spawnBox({ pos: { x: pos.x, y: Math.max(pos.y + 0.13, 0.14), z: pos.z }, size: [2.3, 0.16, 0.5], mat: MATS.woodDark, density: 0.5, frag: 1, kind: 'plank', linvel: { x: dir.x * 2, y: 1.2, z: dir.z * 2 } });
  } else if (kind === 'ball') {
    e = spawnSphere({ pos: { x: pos.x, y: Math.max(pos.y + 0.47, 0.47), z: pos.z }, size: { r: 0.42 }, mat: MATS.rubber, density: 1.2, restitution: 0.52, kind: 'ball', linvel: { x: dir.x * 2.5, y: 1.5, z: dir.z * 2.5 } });
  } else if (kind === 'barrel') {
    e = spawnCyl({ pos: { x: pos.x, y: Math.max(pos.y + 0.53, 0.53), z: pos.z }, size: { r: 0.36, h: 0.95 }, mat: MATS.barrel, density: 1.4, kind: 'barrel', linvel: { x: dir.x * 2, y: 1.2, z: dir.z * 2 } });
  } else if (kind === 'anvil') {
    e = spawnBox({ pos: { x: pos.x, y: Math.max(pos.y + 0.43, 0.43), z: pos.z }, size: [0.95, 0.75, 0.7], mat: MATS.dark, density: 6, kind: 'anvil', linvel: { x: dir.x * 1.5, y: 1, z: dir.z * 1.5 } });
  }
  if (e) {
    audio.pop();
    effects.spawnPuff(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z), [0.9, 0.85, 0.7]);
  }
  return e;
}

export function duplicateEntity(e) {
  if (!e || !e.alive || !e.def || e.kind === 'ground' || e.kind === 'proj' || e.kind === 'chain' ||
    e.kind === 'wball' || e.kind === 'anchor') return null;
  const d = e.def;
  const bp = e.body.translation();
  const yaw = rng() * Math.PI * 2;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const bv = e.body.linvel();
  const common = {
    pos: { x: bp.x + 1.3 + rng() * 0.4, y: bp.y + 1.2, z: bp.z + (rng() - 0.5) * 0.8 },
    quat: q, mat: d.mat, density: d.density, friction: d.friction ?? 0.78,
    restitution: d.restitution ?? 0.05, frag: d.frag, kind: d.kind,
    linvel: { x: bv.x * 0.4, y: bv.y * 0.4 + 1, z: bv.z * 0.4 },
  };
  let ne = null;
  if (d.shape === 'sphere') ne = spawnSphere({ ...common, size: { r: d.size.r } });
  else if (d.shape === 'cyl') ne = spawnCyl({ ...common, size: { r: d.size.r, h: d.size.h } });
  else ne = spawnBox({ ...common, size: [d.size.sx, d.size.sy, d.size.sz] });
  if (ne) audio.pop();
  return ne;
}

export function wreckingRig(p) {
  const RAPIER = G.RAPIER;
  const ax = p.x;
  const az = p.z;
  const ay = Math.max(p.y + 8.5, 9.5);
  const anchorPhys = makeBody({
    pos: { x: ax, y: ay, z: az }, shape: 'box', size: { sx: 0.2, sy: 0.2, sz: 0.2 },
    density: 1, fixed: true,
  });
  const anchorMesh = new THREE.Mesh(GEO.cyl, MATS.dark);
  anchorMesh.scale.set(0.22, 0.5, 0.22);
  finishMesh(anchorMesh, new THREE.Vector3(ax, ay, az), null);
  const anchorE = register(anchorMesh, anchorPhys, {
    shape: 'box', size: { sx: 0.2, sy: 0.2, sz: 0.2 }, density: 1, frag: 0,
    mat: MATS.dark, kind: 'anchor',
  });
  const ids = [anchorE.id];
  const len = 0.54;
  let prev = anchorPhys.body;
  let prevAnchorLocal = { x: 0, y: -0.1, z: 0 };
  for (let i = 0; i < 6; i++) {
    const ly = ay - i * len - len / 2;
    const link = spawnBox({
      pos: { x: ax, y: ly, z: az }, size: [0.16, len, 0.16],
      mat: MATS.metal, density: 8, kind: 'chain',
    });
    ids.push(link.id);
    const jd = RAPIER.JointData.spherical(prevAnchorLocal, { x: 0, y: len / 2, z: 0 });
    G.world.createImpulseJoint(jd, prev, link.body, true);
    prev = link.body;
    prevAnchorLocal = { x: 0, y: -len / 2, z: 0 };
  }
  const ball = spawnSphere({
    pos: { x: ax, y: ay - 6 * len - 0.78, z: az }, size: { r: 0.78 },
    mat: MATS.dark, density: 5, kind: 'wball', ccd: true, friction: 0.5,
  });
  ids.push(ball.id);
  const jd = RAPIER.JointData.spherical(prevAnchorLocal, { x: 0, y: 0.6, z: 0 });
  G.world.createImpulseJoint(jd, prev, ball.body, true);
  G.rigQueue.push(ids);
  while (G.rigQueue.length > 3) {
    const old = G.rigQueue.shift();
    for (const id of old) {
      const oe = G.entities.get(id);
      if (oe) removeEntity(oe, true);
    }
  }
  audio.pop();
  return ball;
}

function buildGround() {
  const geo = new THREE.PlaneGeometry(280, 280);
  const mat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  G.scene.add(mesh);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(20.6, 21.1, 72),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  G.scene.add(ring);
  const phys = makeBody({
    pos: { x: 0, y: -1, z: 0 }, shape: 'box', size: { sx: 280, sy: 2, sz: 280 },
    density: 1, fixed: true, friction: 0.95, restitution: 0.02,
  });
  register(mesh, phys, { shape: 'box', size: { sx: 280, sy: 2, sz: 280 }, density: 1, frag: 0, mat, kind: 'ground' });
  for (const [x, z, sx, sz] of [[132, 0, 2, 268], [-132, 0, 2, 268], [0, 132, 268, 2], [0, -132, 268, 2]]) {
    makeBody({ pos: { x, y: 15, z }, shape: 'box', size: { sx, sy: 30, sz }, density: 1, fixed: true, friction: 0.3 });
  }
}

const brickPick = () => MATS.brick[(rng() * MATS.brick.length) | 0];

function buildTower(cx, cz) {
  const jit = () => (rng() - 0.5) * 0.045;
  for (let lvl = 0; lvl < 8; lvl++) {
    for (const [ox, oz] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) {
      spawnBox({
        pos: { x: cx + ox + jit(), y: lvl * 1.02 + 0.51, z: cz + oz + jit() },
        size: [0.55, 1.02, 0.55], mat: MATS.concrete, density: 0.9, frag: 1, kind: 'pillar',
      });
    }
  }
  spawnBox({ pos: { x: cx, y: 8.335, z: cz }, size: [3.7, 0.35, 3.7], mat: MATS.roof, density: 2.2, frag: 1, kind: 'slab' });
  for (const [ox, oz] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]]) {
    spawnBox({ pos: { x: cx + ox, y: 8.985, z: cz + oz }, size: [0.5, 0.95, 0.5], mat: MATS.concrete, density: 0.9, frag: 1, kind: 'pillar' });
  }
  spawnBox({ pos: { x: cx, y: 9.635, z: cz }, size: [3.4, 0.35, 3.4], mat: MATS.roof, density: 2.2, frag: 1, kind: 'slab' });
  spawnBox({ pos: { x: cx - 0.55, y: 10.21, z: cz }, size: [0.8, 0.8, 0.8], mat: MATS.stone, density: 1.6, frag: 1, kind: 'block' });
  spawnBox({ pos: { x: cx + 0.55, y: 10.21, z: cz }, size: [0.8, 0.8, 0.8], mat: MATS.stone, density: 1.6, frag: 1, kind: 'block' });
  spawnBox({ pos: { x: cx, y: 11.06, z: cz }, size: [0.5, 0.9, 0.5], mat: MATS.stone, density: 1.2, frag: 1, kind: 'spire' });
}

function buildWall(cx, cz, ry) {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 12; col++) {
      const lx = (col - 5.5) * 1.03;
      if (row < 3 && Math.abs(lx) < 1.06) continue;
      spawnBox({
        pos: { x: cx + lx * cs, y: row * 0.43 + 0.215, z: cz - lx * sn },
        quat: q,
        size: [1.0, 0.42, 0.52], mat: brickPick(), density: 0.85, frag: 1, kind: 'brick',
      });
    }
  }
}

function buildPyramid(cx, cz) {
  for (let r = 0; r < 6; r++) {
    const count = 6 - r;
    const startX = cx - ((count - 1) / 2) * 0.94;
    for (let i = 0; i < count; i++) {
      spawnBox({
        pos: { x: startX + i * 0.94, y: r * 0.93 + 0.47, z: cz },
        size: [0.92, 0.92, 0.92], mat: MATS.crate, density: 0.5, frag: 1, kind: 'crate',
      });
    }
  }
}

function buildHouse(cx, cz) {
  for (const [ox, oz] of [[-2.1, -1.5], [2.1, -1.5], [-2.1, 1.5], [2.1, 1.5]]) {
    spawnBox({ pos: { x: cx + ox, y: 1.425, z: cz + oz }, size: [0.45, 2.85, 0.45], mat: MATS.concrete, density: 0.85, frag: 1, kind: 'pillar' });
  }
  spawnBox({ pos: { x: cx, y: 3.025, z: cz }, size: [5.2, 0.35, 3.9], mat: MATS.roof, density: 2.2, frag: 1, kind: 'slab' });
  for (const [ox, oz] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]]) {
    spawnBox({ pos: { x: cx + ox, y: 3.95, z: cz + oz }, size: [0.4, 1.5, 0.4], mat: MATS.concrete, density: 0.85, frag: 1, kind: 'pillar' });
  }
  spawnBox({ pos: { x: cx, y: 4.91, z: cz }, size: [5.6, 0.42, 4.3], mat: MATS.roof, density: 3.4, frag: 1, kind: 'roof' });
}

function buildDominoes() {
  const ccx = 0;
  const ccz = 11;
  const rad = 7;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = -0.95 + (i / (n - 1)) * 1.9;
    spawnBox({
      pos: { x: ccx + Math.sin(a) * rad, y: 0.71, z: ccz + Math.cos(a) * rad },
      quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
      size: [0.68, 1.42, 0.22], mat: MATS.wood, density: 0.4, frag: 1, kind: 'domino',
    });
  }
}

function buildProps() {
  spawnBox({ pos: { x: -2.5, y: 0.86, z: 7 }, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.4, 0.03)), size: [1.7, 1.7, 1.7], mat: MATS.stone, density: 4, frag: 0, kind: 'monolith' });
  for (const [bx, bz] of [[-13, -2], [-12.4, -2.6], [-12.8, -1.4]]) {
    spawnCyl({ pos: { x: bx, y: 0.48, z: bz }, size: { r: 0.36, h: 0.95 }, mat: MATS.barrel, density: 1.3, kind: 'barrel' });
  }
  spawnCyl({ pos: { x: -12.7, y: 1.44, z: -2.0 }, size: { r: 0.36, h: 0.95 }, mat: MATS.barrel, density: 1.3, kind: 'barrel' });
  for (const [px, pz] of [[4, -1], [5.2, -1.7], [-6, 6], [12, 2], [-14, 4]]) {
    spawnBox({ pos: { x: px, y: 0.4, z: pz }, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 3), size: [0.78, 0.78, 0.78], mat: MATS.crate, density: 0.55, frag: 1, kind: 'crate' });
  }
  spawnSphere({ pos: { x: -1, y: 0.62, z: 3 }, size: { r: 0.58 }, mat: MATS.rubber, density: 3, kind: 'ball', friction: 0.7 });
}

export function clearAllEntities() {
  for (const e of Array.from(G.entities.values())) {
    e.alive = false;
    if (e.mesh) G.scene.remove(e.mesh);
    try { G.world.removeRigidBody(e.body); } catch (err) {}
  }
  G.entities.clear();
  G.byCollider.clear();
  G.dynamicCount = 0;
  G.fragmentQueue.length = 0;
  G.rigQueue.length = 0;
  G.projQueue.length = 0;
  G.grabbed = null;
  G.hovered = null;
  G.holdAction = null;
  G.meshesDirty = true;
}

export function resetWorld() {
  clearAllEntities();
  createWorld();
  buildGround();
  buildTower(-6, -4);
  buildWall(8, -6, 0.18);
  buildPyramid(-11, 5);
  buildHouse(10, 8);
  buildDominoes();
  buildProps();
}

export function ensureMeshList() {
  if (!G.meshesDirty) return G.rayMeshes;
  G.rayMeshes.length = 0;
  for (const e of G.entities.values()) {
    if (e.mesh && e.kind !== 'ground') G.rayMeshes.push(e.mesh);
  }
  G.meshesDirty = false;
  return G.rayMeshes;
}
