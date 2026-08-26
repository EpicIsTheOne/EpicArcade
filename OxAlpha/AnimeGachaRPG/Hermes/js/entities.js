// STARWEAVE — 3D entities: heroes, Gloam enemies, particles, projectiles, effects
import * as THREE from '../vendor/three.module.js';
import { ENEMIES } from './data.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- HERO MESH
export function buildHeroMesh(unit) {
  const L = unit.look;
  const g = new THREE.Group();
  const mat = (c, e, ei) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000, emissiveIntensity: ei || 0 });

  // legs
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 6), mat(shadeHex(L.out2, -0.2)));
    leg.position.set(s * 0.11, 0.21, 0);
    g.add(leg);
  }
  // torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.55, 8), mat(L.out1));
  torso.position.y = 0.72;
  g.add(torso);
  // chest accent
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 12), mat(L.out2));
  sash.rotation.x = Math.PI / 2 - 0.4;
  sash.position.y = 0.78;
  g.add(sash);
  // arms
  g.userData.arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.44, 6), mat(L.out1));
    seg.position.y = -0.22;
    arm.add(seg);
    arm.position.set(s * 0.26, 0.95, 0);
    g.add(arm);
    g.userData.arms.push(arm);
  }
  // hands (weapon anchors)
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), mat(L.skin));
  handR.position.y = -0.45;
  g.userData.arms[1].add(handR);
  const handL = handR.clone();
  g.userData.arms[0].add(handL);

  // head
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), mat(L.skin));
  skull.scale.y = 0.94;
  head.add(skull);
  // eyes
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 5), new THREE.MeshBasicMaterial({ color: 0x201a2e }));
    eye.position.set(s * 0.1, 0.02, 0.225);
    head.add(eye);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.013, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    spark.position.set(s * 0.1 - 0.012, 0.04, 0.255);
    head.add(spark);
  }
  // hair cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.275, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(L.hair));
  cap.position.set(0, 0.05, -0.02);
  head.add(cap);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.35), mat(L.hair));
  fringe.position.set(0, 0.06, 0.01);
  head.add(fringe);
  if (L.hi && L.hi !== L.hair) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 5, 14), mat(L.hi));
    band.rotation.x = Math.PI / 2 - 0.35;
    band.position.set(0, 0.16, 0.02);
    head.add(band);
  }
  // style extras
  addHairExtra(head, L.hairStyle, L.hair);
  head.position.y = 1.32;
  g.add(head);
  g.userData.head = head;

  // weapon in right hand group
  const wp = buildWeapon(unit.weapon, unit.element);
  wp.position.y = -0.45;
  g.userData.arms[1].add(wp);
  g.userData.weapon = wp;

  // element ring
  const elc = new THREE.Color(ELEM_COLORS[unit.element] || '#ffd76e');
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 20),
    new THREE.MeshBasicMaterial({ color: elc, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  g.userData.elRing = ring;

  // accessory glows
  if (L.acc === 'sunhalo') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd76e }));
    halo.rotation.x = 0.3;
    halo.position.y = 1.72;
    g.add(halo);
  }

  g.scale.setScalar(1.35);
  return g;
}

function addHairExtra(head, style, color) {
  const m = () => new THREE.MeshLambertMaterial({ color });
  switch (style) {
    case 'ponytail': {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 6), m());
      tail.position.set(0, -0.08, -0.3);
      tail.rotation.x = 0.7;
      head.add(tail);
      break;
    }
    case 'twintails':
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), m());
        t.position.set(s * 0.26, -0.05, -0.08);
        t.rotation.z = s * 0.5;
        head.add(t);
      }
      break;
    case 'longveil':
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.75, 6), m());
        t.position.set(s * 0.16, -0.22, -0.14);
        t.rotation.x = 0.15;
        head.add(t);
      }
      break;
    case 'flowing': {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.8, 7), m());
      t.position.set(0, -0.2, -0.18);
      head.add(t);
      break;
    }
    case 'spiky':
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), m());
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14);
        sp.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        head.add(sp);
      }
      break;
    case 'pom': {
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), m());
      pom.position.y = 0.3;
      head.add(pom);
      break;
    }
    case 'undercut': {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 6), m());
      t.position.set(-0.2, -0.05, -0.12);
      t.rotation.z = 0.6;
      head.add(t);
      break;
    }
  }
}

function buildWeapon(weapon, element) {
  const g = new THREE.Group();
  const steel = () => new THREE.MeshStandardMaterial({ color: 0xdfe6ff, emissive: ELEM_COLORS[element] || 0xffd76e, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.4 });
  const gold = () => new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcf9a30, emissiveIntensity: 0.6, roughness: 0.4 });
  const wood = () => new THREE.MeshLambertMaterial({ color: 0x7a5a3e });
  switch (weapon) {
    case 'Sword': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.85, 0.02), steel());
      blade.position.y = 0.5;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), gold());
      guard.position.y = 0.08;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.18, 6), wood());
      grip.position.y = -0.03;
      g.add(blade, guard, grip);
      g.rotation.z = -0.35;
      break;
    }
    case 'Scythe': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.25, 6), wood());
      pole.position.y = 0.35;
      const bladeShape = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 5, 12, Math.PI * 0.7), steel());
      bladeShape.position.set(0.12, 1.0, 0);
      bladeShape.rotation.z = Math.PI * 0.75;
      g.add(pole, bladeShape);
      break;
    }
    case 'Gauntlets': {
      for (const s of [-1, 1]) {
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), gold());
        fist.scale.set(1, 0.9, 1.15);
        fist.position.set(0, 0, s * 0.001);
        g.add(fist);
      }
      g.visible = false; // fists shown on arms instead
      break;
    }
    case 'Bow': {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 5, 16, Math.PI * 1.05), gold());
      arc.rotation.z = Math.PI / 2 - 0.5;
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.56, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      str.rotation.z = 0.26;
      g.add(arc, str);
      g.rotation.set(0.2, 0, -0.2);
      break;
    }
    case 'Catalyst': {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshStandardMaterial({ color: 0x7fc9ff, emissive: 0x3f8fff, emissiveIntensity: 1 }));
      g.add(orb);
      g.position.set(0, 0.05, 0);
      g.userData.floatOrb = true;
      break;
    }
    case 'Greatshield': {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.07), new THREE.MeshStandardMaterial({ color: 0xb98a54, emissive: 0x6b4423, emissiveIntensity: 0.2 }));
      sh.position.y = 0.2;
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), gold());
      boss.position.set(0, 0.25, 0.06);
      g.add(sh, boss);
      g.rotation.x = 0.25;
      break;
    }
    case 'Fireworks': {
      const tube = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xc94f2a, emissive: 0xff7847, emissiveIntensity: 0.4 }));
      tube.rotation.x = Math.PI;
      tube.position.y = 0.18;
      g.add(tube);
      break;
    }
    case 'Hammer': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 6), wood());
      pole.position.y = 0.3;
      const headM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0x8f8f99, emissive: 0x3a3154, emissiveIntensity: 0.15 }));
      headM.position.y = 0.68;
      g.add(pole, headM);
      break;
    }
    case 'Lantern': {
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff0b8 }));
      flame.position.y = 0.02;
      g.add(cage, flame);
      g.position.set(0, -0.1, 0);
      break;
    }
    case 'Trident': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 6), gold());
      pole.position.y = 0.35;
      for (const dx of [-0.07, 0, 0.07]) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.18, 5), steel());
        prong.position.set(dx, 0.92, 0);
        g.add(prong);
      }
      g.add(pole);
      break;
    }
  }
  return g;
}

export const ELEM_COLORS = {
  RADIANCE: '#ffd76e', UMBRA: '#b06cff', EMBER: '#ff7847',
  GALE: '#6ee7b7', STONE: '#d9a066', TIDE: '#5aa9ff',
};

// ---------------------------------------------------------------- ENEMY MESH
export function buildEnemyMesh(type) {
  const def = ENEMIES[type];
  const g = new THREE.Group();
  const void_ = new THREE.MeshStandardMaterial({ color: 0x17122a, roughness: 0.9, metalness: 0.1 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xa8f0ff });
  const eyeMat2 = new THREE.MeshBasicMaterial({ color: 0xd9a0ff });

  const addEyes = (parent, spread, y, z, size, alt) => {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), alt && s > 0 ? eyeMat2 : eyeMat);
      e.position.set(s * spread, y, z);
      parent.add(e);
    }
  };

  if (type === 'wisp') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 10, 8), void_);
    body.position.y = def.radius + 0.5;
    g.add(body);
    addEyes(body, 0.22, 0.05, 0.62, 0.07);
    g.userData.body = body;
  } else if (type === 'stinger') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(def.radius * 0.8, def.radius * 2.4, 7), void_);
    body.rotation.x = Math.PI / 2;
    body.position.y = 1.2;
    g.add(body);
    addEyes(body, 0.16, 0.1, 0.5, 0.06);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), void_);
    tail.position.set(0, 1.2, -1.2); tail.rotation.x = -Math.PI / 2;
    g.add(tail);
    g.userData.body = body;
  } else if (type === 'brute') {
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(def.radius, 0), void_);
    body.position.y = def.radius + 0.3;
    g.add(body);
    addEyes(body, 0.4, 0.3, 1.1, 0.1);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.3, 0.9, 3, 8) : new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6), void_);
      arm.position.set(s * 1.5, 1.2, 0.2);
      arm.rotation.z = s * 0.5;
      g.add(arm);
    }
    g.userData.body = body;
  } else if (type === 'shade') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 2.2, 8), void_);
    body.position.y = 1.2;
    g.add(body);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), void_);
    hood.position.y = 2.3;
    g.add(hood);
    addEyes(g, 0.16, 2.3, 0.38, 0.06, true);
    g.userData.body = hood;
  } else if (type === 'colossus') {
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), void_);
    body.position.y = 4.4;
    g.add(body);
    const headM = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), void_);
    headM.position.y = 8.2;
    g.add(headM);
    addEyes(g, 0.5, 8.2, 1.2, 0.18, true);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.5, 1.2), void_);
      arm.position.set(s * 3.6, 4.6, 0);
      arm.rotation.z = s * 0.18;
      g.add(arm);
      g.userData['arm' + s] = arm;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 1.5), void_);
      leg.position.set(s * 1.4, 1.3, 0);
      g.add(leg);
    }
    const crown = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.14, 8, 20), new THREE.MeshBasicMaterial({ color: 0xb06cff }));
    crown.position.y = 9.4;
    crown.rotation.x = Math.PI / 2;
    g.add(crown);
    g.userData.body = body;
    g.userData.head = headM;
    g.scale.setScalar(1.15);
  }
  return g;
}

// ---------------------------------------------------------------- PARTICLES
export class ParticleSystem {
  constructor(scene, max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.28, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.tmpColor = new THREE.Color();
  }
  burst(x, y, z, colorHex, count = 14, speed = 5, up = 3) {
    this.tmpColor.set(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      this.pos[idx * 3] = x; this.pos[idx * 3 + 1] = y; this.pos[idx * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      this.vel[idx * 3] = Math.cos(a) * r;
      this.vel[idx * 3 + 1] = Math.random() * up + 1;
      this.vel[idx * 3 + 2] = Math.sin(a) * r;
      this.col[idx * 3] = this.tmpColor.r; this.col[idx * 3 + 1] = this.tmpColor.g; this.col[idx * 3 + 2] = this.tmpColor.b;
      this.life[idx] = 0.5 + Math.random() * 0.5;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 6 * dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- PROJECTILES
export class Projectiles {
  constructor(scene) {
    this.list = [];
    this.scene = scene;
    this.pool = [];
  }
  spawn(opts) {
    let mesh = this.pool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.scene.add(mesh);
    }
    mesh.material.color.set(opts.color || '#ffffff');
    mesh.visible = true;
    mesh.position.copy(opts.from);
    this.list.push({ mesh, dir: opts.dir.clone().normalize(), speed: opts.speed || 22, life: opts.range ? opts.range / (opts.speed || 22) : 1.4, dmg: opts.dmg, radius: opts.hitRadius || 1.1, onHit: opts.onHit, pierce: opts.pierce || false, hitSet: new Set(), gravity: opts.gravity || 0, vy: 0 });
  }
  update(dt, enemies) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vy -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      p.mesh.position.y += p.vy * dt;
      let done = p.life <= 0;
      if (!done) {
        for (const e of enemies) {
          if (e.dead || p.hitSet.has(e)) continue;
          const dx = e.mesh.position.x - p.mesh.position.x;
          const dz = e.mesh.position.z - p.mesh.position.z;
          const dy = (e.mesh.position.y + 1) - p.mesh.position.y;
          if (dx * dx + dz * dz < (p.radius + e.def.radius) ** 2 && Math.abs(dy) < 2.2) {
            p.onHit && p.onHit(e, p.mesh.position.clone());
            p.hitSet.add(e);
            if (!p.pierce) { done = true; break; }
          }
        }
      }
      if (done) {
        p.mesh.visible = false;
        this.pool.push(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
}

// ---------------------------------------------------------------- EFFECTS
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  add(obj, dur, onUpdate) {
    this.scene.add(obj);
    this.list.push({ obj, t: 0, dur, onUpdate });
  }
  nova(pos, colorHex, maxR = 6, dur = 0.5) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.9, 28),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.15, pos.z);
    this.add(m, dur, (e, t) => {
      const k = t / dur;
      m.scale.setScalar(1 + k * maxR);
      m.material.opacity = 1 - k;
    });
    // vertical pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(maxR * 0.5, maxR * 0.7, 5, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.set(pos.x, pos.y + 2.5, pos.z);
    this.add(pillar, dur * 0.8, (e, t) => { pillar.material.opacity = 0.3 * (1 - t / (dur * 0.8)); });
  }
  slashArc(pos, angle, colorHex) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.5, 16, 1, -0.6, 1.2),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2 + 0.35;
    m.rotation.z = -angle;
    m.position.set(pos.x, pos.y + 1, pos.z);
    this.add(m, 0.22, (e, t) => {
      const k = t / 0.22;
      m.scale.setScalar(1 + k * 1.6);
      m.material.opacity = 0.9 * (1 - k);
    });
  }
  zone(pos, colorHex, radius, dur, kind = 'fire') {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.4, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.1, pos.z);
    this.add(m, dur, (e, t) => {
      m.material.opacity = 0.25 + 0.15 * Math.sin(t * 12);
      m.scale.setScalar(1 + Math.sin(t * 9) * 0.03);
    });
  }
  beamLine(from, to, colorHex, dur = 0.25) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, len, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, depthWrite: false })
    );
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
    this.add(m, dur, (e, t) => { m.material.opacity = 0.85 * (1 - t / dur); m.scale.x = 1 + t * 6; m.scale.z = m.scale.x; });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.t += dt;
      if (fx.onUpdate) fx.onUpdate(fx.obj, fx.t);
      if (fx.t >= fx.dur) {
        this.scene.remove(fx.obj);
        fx.obj.geometry.dispose && fx.obj.geometry.dispose();
        fx.obj.material.dispose && fx.obj.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
