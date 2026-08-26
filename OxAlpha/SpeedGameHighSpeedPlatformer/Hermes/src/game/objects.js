import * as THREE from 'three';
import { clamp, lerp } from './mathutil.js';
import { texSign, texHazardStripes, texLava, texWood } from '../engine/textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// ======================= RAILS =======================
export class Rail {
  constructor(scene, world, points, { width = 0.09, color = 0x37e0ff, closed = false } = {}) {
    this.curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.2);
    const N = Math.max(8, Math.floor(this.curve.getLength() / 0.6));
    this.samples = [];
    let prevTan = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const pos = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      // stable frame: up starts world-up, orthogonalized against tangent
      let up;
      if (!prevTan) {
        up = UP.clone();
      } else {
        up = prevTan.clone(); // keep continuity, fix below
        up.copy(this.samples[this.samples.length - 1].up);
      }
      up.addScaledVector(tan, -up.dot(tan)).normalize();
      if (up.lengthSq() < 0.5) up.set(0, 1, 0);
      this.samples.push({ dist: t * this.curve.getLength(), pos, tan, up });
      prevTan = tan;
    }
    this.length = this.curve.getLength();
    // visual tube
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, Math.min(600, N * 2), width, 8, closed),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7, emissive: color, emissiveIntensity: 0.28 })
    );
    tube.castShadow = false;
    scene.add(tube);
    this.mesh = tube;
    // support posts every ~12u
    const postGeo = new THREE.CylinderGeometry(0.07, 0.11, 1, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x39465e, roughness: 0.7, metalness: 0.4 });
    for (let d = 4; d < this.length; d += 12) {
      const f = this.frameAt(d);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(f.pos).addScaledVector(f.up, -0.55);
      post.scale.y = 1.1;
      scene.add(post);
    }
  }

  frameAt(dist) {
    const s = this.samples;
    const step = this.length / (s.length - 1);
    const fi = clamp(dist / step, 0, s.length - 1.001);
    const i = Math.floor(fi), f = fi - i;
    const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
    return {
      pos: _v1.lerpVectors(a.pos, b.pos, f),
      tan: _v2.lerpVectors(a.tan, b.tan, f).normalize(),
      up: _v3.lerpVectors(a.up, b.up, f).normalize(),
    };
  }

  nearestSample(p, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const s of this.samples) {
      const d = s.pos.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
}

// ======================= SPRINGS =======================
export class Spring {
  constructor(scene, pos, dir = UP.clone(), power = 36, color = 0xff3355) {
    this.pos = pos.clone();
    this.dir = dir.clone().normalize();
    this.power = power;
    this.cool = 0;
    this.anim = 0;
    const g = new THREE.Group();
    g.position.copy(pos);
    // orient disc along dir
    g.quaternion.setFromUnitVectors(UP, this.dir);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.25, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a3244, metalness: 0.6, roughness: 0.4 }));
    base.position.y = 0.1;
    const coil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.08, 40, 8, 2, 3),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.85, roughness: 0.25 }));
    coil.position.y = 0.32;
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 20),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 }));
    this.cap.position.y = 0.5;
    this.cap.castShadow = true;
    g.add(base, coil, this.cap);
    this.coilMesh = coil;
    scene.add(g);
    this.group = g;
    this.radius = 1.15;
  }

  update(dt, player, game) {
    this.cool -= dt;
    this.anim = Math.max(0, this.anim - dt * 3);
    this.coilMesh.scale.y = 1 - this.anim * 0.5;
    this.cap.position.y = 0.5 - this.anim * 0.22;
    if (this.cool <= 0 && player.state !== 'dead') {
      _v1.copy(player.pos).sub(this.pos);
      const hDist = Math.hypot(_v1.x, _v1.z);
      const vDist = _v1.y;
      if (hDist < this.radius + 0.6 && vDist > -1.4 && vDist < 2.2) {
        player.applySpring(this.dir, this.power);
        this.anim = 1; this.cool = 0.4;
        game.onSpring(this);
      }
    }
  }
}

// ======================= DASH PANELS =======================
let panelTexCache = null;
function panelTexture() {
  if (panelTexCache) return panelTexCache;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#10141f'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 3; i++) {
    const y = 30 + i * 78;
    g.fillStyle = ['#19e6ff', '#57f2ff', '#bffcff'][i];
    g.beginPath();
    g.moveTo(14, y); g.lineTo(64, y - 44); g.lineTo(114, y);
    g.lineTo(114, y + 26); g.lineTo(64, y - 18); g.lineTo(14, y + 26);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  panelTexCache = t;
  return t;
}

export class DashPanel {
  constructor(scene, pos, rotY, power = 44, { w = 2.4, len = 5.5, color = 0x19e6ff } = {}) {
    this.power = power;
    this.dir = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    this.cool = 0;
    this.glowT = 0;
    const geo = new THREE.BoxGeometry(w, 0.12, len);
    const mat = new THREE.MeshStandardMaterial({
      map: panelTexture(), emissive: color, emissiveIntensity: 0.55, emissiveMap: panelTexture(),
      roughness: 0.4, metalness: 0.2,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(pos).y += 0.06;
    this.mesh.rotation.y = rotY;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.half = new THREE.Vector3(w / 2, 0.6, len / 2);
  }

  update(dt, player, game) {
    this.cool -= dt;
    this.glowT += dt * 8;
    this.mesh.material.emissiveIntensity = 0.45 + Math.sin(this.glowT) * 0.18;
    if (this.cool <= 0 && player.state !== 'dead') {
      _v1.copy(player.pos).sub(this.pos);
      _v2.copy(this.dir).cross(UP); // sideways axis
      const localF = _v1.dot(this.dir), localS = _v1.dot(_v2);
      if (Math.abs(localF) < this.half.z + 0.6 && Math.abs(localS) < this.half.x + 0.6 && Math.abs(_v1.y) < 1.8) {
        player.applyPanel(this.dir, this.power);
        this.cool = 0.5;
        game.onPanel(this);
      }
    }
  }
}

// ======================= MOVING PLATFORMS =======================
export class Mover {
  constructor(scene, world, size, pathFn, { dur = 6, phase = 0, mat = null } = {}) {
    this.size = size.clone();
    this.pathFn = pathFn;
    this.dur = dur;
    this.t = phase;
    this.delta = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    this.obj = new THREE.Mesh(geo, mat || new THREE.MeshStandardMaterial({
      color: 0x5d6f8f, metalness: 0.55, roughness: 0.45,
      emissive: 0x16202f, emissiveIntensity: 0.6,
    }));
    this.obj.castShadow = true; this.obj.receiveShadow = true;
    scene.add(this.obj);
    world.addMover(this.obj, size.clone().multiplyScalar(0.5));
    this.updateVisual(0);
  }

  tick(dt) {
    this.t += dt;
    this.updateVisual(this.t);
  }

  updateVisual(t) {
    const p = this.pathFn(((t % this.dur) + this.dur) % this.dur / this.dur);
    this.prev.copy(this.obj.position);
    this.obj.position.copy(p);
    this.delta.copy(p).sub(this.prev);
    this.vel = this.delta.clone().multiplyScalar(60); // approx u/s for inheritance
  }
}

// ======================= FANS / UPDRAFTS =======================
export class FanZone {
  constructor(scene, center, halfExtents, force = 46, maxVy = 22) {
    this.center = center.clone();
    const half = halfExtents;
    this.half = halfExtents.clone();
    this.force = force; this.maxVy = maxVy;
    const g = new THREE.Group();
    g.position.copy(center);
    this.rings = [];
    const rm = new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 26), rm);
      r.position.y = -half.y + (i + 0.5) * (half.y * 2 / 3);
      r.rotation.x = Math.PI / 2;
      r.scale.setScalar(half.x * 1.4);
      g.add(r);
      this.rings.push(r);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2),
      new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.05, depthWrite: false }));
    g.add(box);
    scene.add(g);
  }

  update(dt, player, game) {
    for (let i = 0; i < this.rings.length; i++) this.rings[i].rotation.z += dt * (3 + i);
    _v1.copy(player.pos).sub(this.center);
    if (Math.abs(_v1.x) < this.half.x && Math.abs(_v1.y) < this.half.y && Math.abs(_v1.z) < this.half.z) {
      if (player.state === 'air' && player.vel.y < this.maxVy) {
        player.vel.y += this.force * dt;
        if (Math.random() < dt * 30) game.fx.spawn(player.pos.x + (Math.random() - .5) * 2, player.pos.y - 1.5, player.pos.z + (Math.random() - .5) * 2, 0, 9, 0, 0.5, 4, 0.5, 0.9, 1, 0);
      }
    }
  }
}

// ======================= CHECKPOINT / GOAL =======================
export class Checkpoint {
  constructor(scene, pos, yaw = 0, idx = 0) {
    this.pos = pos.clone();
    this.idx = idx;
    this.active = false;
    this.spin = 0;
    const g = new THREE.Group();
    g.position.copy(pos); g.rotation.y = yaw;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4763, metalness: 0.5, roughness: 0.5 }));
    post.position.y = 1.7;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 12, 30),
      new THREE.MeshStandardMaterial({ color: 0x274a63, emissive: 0x183a4c, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.6 }));
    this.ring.position.y = 2.9;
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x444a58, emissive: 0x111111, emissiveIntensity: 1 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), this.lampMat);
    lamp.position.y = 3.6;
    g.add(post, this.ring, lamp);
    scene.add(g);
    this.group = g;
    this.radius = 3.2;
  }

  activate(player) {
    this.active = true;
    this.ring.material.color.set(0x37ffb0);
    this.ring.material.emissive.set(0x21d877);
    this.lampMat.emissive.set(0x37ffb0);
    player._tmpSpawn = this.pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    player.spawnYaw = this.group.rotation.y;
  }

  update(dt, player, game) {
    this.spin += dt;
    this.ring.rotation.z = this.spin * (this.active ? 2.4 : 0.6);
    if (!this.active && player.state !== 'dead' && player.pos.distanceToSquared(this.pos) < this.radius * this.radius) {
      this.activate(player);
      game.onCheckpoint(this);
    }
  }
}

export class GoalRing {
  constructor(scene, pos, rotY = 0) {
    this.pos = pos.clone();
    this.t = 0;
    this.done = false;
    const g = new THREE.Group();
    g.position.copy(pos); g.rotation.y = rotY;
    this.torus = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.38, 18, 48),
      new THREE.MeshStandardMaterial({ color: 0xffd94a, emissive: 0xffaa00, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.7 }));
    this.torus.position.y = 3.4;
    this.swirlMat = new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    this.swirl = new THREE.Mesh(new THREE.CircleGeometry(2.85, 40), this.swirlMat);
    this.swirl.position.y = 3.4;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 0.5, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a3244, metalness: 0.6, roughness: 0.4 }));
    base.receiveShadow = true;
    g.add(this.torus, this.swirl, base);
    scene.add(g);
    this.group = g;
    this.radius = 3.4;
  }

  update(dt, player, game) {
    this.t += dt;
    this.torus.rotation.z = this.t * 0.7;
    this.swirl.rotation.z = -this.t * 1.6;
    this.swirlMat.opacity = 0.26 + Math.sin(this.t * 3) * 0.1;
    if (!this.done && player.state !== 'dead' && player.pos.distanceToSquared(this.pos) < (this.radius + 1.5) ** 2) {
      this.done = true;
      game.onGoal(this);
    }
  }
}

// ======================= COLLECTIBLES =======================
const orbGeo = new THREE.OctahedronGeometry(0.34, 0);
const orbMat = new THREE.MeshStandardMaterial({ color: 0xffd94a, emissive: 0xffaa00, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.4 });

export class OrbField {
  constructor(scene) {
    this.items = [];   // {pos, taken, respawn, phase}
    this.scene = scene;
    this.inst = null;
    this.dummy = new THREE.Object3D();
  }

  add(pos) {
    this.items.push({ pos: pos.clone(), taken: false, phase: Math.random() * 6.28, scatterV: null, noPick: 0 });
  }

  line(a, b, n) {
    for (let i = 0; i < n; i++) this.add(_v1.lerpVectors(a, b, n === 1 ? 0 : i / (n - 1)));
  }
  arcPoints(pts, n) {
    const curve = new THREE.CatmullRomCurve3(pts);
    for (let i = 0; i < n; i++) this.add(curve.getPointAt(i / (n - 1)));
  }
  circle(center, radius, n, axis = UP, rotY = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().normalize());
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2 + rotY;
      _v1.set(Math.cos(th) * radius, 0, Math.sin(th) * radius).applyQuaternion(q).add(center);
      this.add(_v1);
    }
  }

  build() {
    this.inst = new THREE.InstancedMesh(orbGeo, orbMat, this.items.length);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.frustumCulled = false;
    this.scene.add(this.inst);
  }

  scatterFrom(pos, count) {
    // physical scattered orbs after taking damage
    let placed = 0;
    for (const it of this.items) {
      if (placed >= count) break;
      if (!it.taken) continue;
      it.taken = false;
      it.scatterV = new THREE.Vector3((Math.random() - .5) * 9, 6 + Math.random() * 4, (Math.random() - .5) * 9);
      it.pos.copy(pos);
      it.noPick = 0.55;
      placed++;
    }
    return placed;
  }

  update(dt, player, game) {
    const t = performance.now() / 1000;
    const magnetR = (player.boosting ? 5.2 : 3.2) + (player.state === 'rail' ? 1 : 0);
    for (const it of this.items) {
      it.noPick = Math.max(0, (it.noPick || 0) - dt);
      if (it.scatterV) {
        it.scatterV.y -= 26 * dt;
        it.pos.addScaledVector(it.scatterV, dt);
        if (it.pos.y < game.killY + 0.5) { it.scatterV = null; }
      }
      if (it.taken) continue;
      const d = it.pos.distanceToSquared(player.pos);
      if (it.noPick <= 0 && d < magnetR * magnetR && player.state !== 'dead') {
        // fly toward player
        _v1.copy(player.pos).sub(it.pos).normalize();
        it.pos.addScaledVector(_v1, Math.min(38 * dt + 6 * dt, Math.sqrt(d)));
        if (d < 1.1) {
          it.taken = true;
          game.onOrb(it);
        }
      }
    }
    // write instance matrices
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      this.dummy.position.copy(it.pos);
      this.dummy.position.y += Math.sin(t * 2.2 + it.phase) * 0.12 + 0.05;
      if (it.taken) {
        this.dummy.scale.setScalar(0.0001);
      } else {
        this.dummy.scale.setScalar(1);
      }
      this.dummy.rotation.set(t * 1.4 + it.phase, t * 1.8, 0);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(i, this.dummy.matrix);
    }
    this.inst.instanceMatrix.needsUpdate = true;
  }
}

export class Prism {
  constructor(scene, pos, kind = 'prism') {
    this.kind = kind;   // 'prism' | 'chip'
    this.pos = pos.clone();
    this.taken = false;
    this.t = Math.random() * 6;
    const geo = kind === 'prism'
      ? new THREE.OctahedronGeometry(0.62, 0)
      : new THREE.CylinderGeometry(0.5, 0.5, 0.1, 14);
    const mat = kind === 'prism'
      ? new THREE.MeshStandardMaterial({ color: 0x9ff3ff, emissive: 0x19e6ff, emissiveIntensity: 1.8, roughness: 0.15, metalness: 0.3, flatShading: true })
      : new THREE.MeshStandardMaterial({ color: 0xff5060, emissive: 0xff2030, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(pos);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.light = new THREE.PointLight(kind === 'prism' ? 0x19e6ff : 0xff3040, 2.2, 6);
    this.light.position.copy(pos);
    scene.add(this.light);
  }

  update(dt, player, game) {
    if (this.taken) return;
    this.t += dt;
    this.mesh.rotation.y = this.t * 1.6;
    this.mesh.position.y = this.pos.y + Math.sin(this.t * 1.8) * 0.16;
    this.light.intensity = 1.8 + Math.sin(this.t * 4) * 0.6;
    if (player.state !== 'dead' && player.pos.distanceToSquared(this.mesh.position) < 1.9) {
      this.taken = true;
      this.mesh.visible = false; this.light.visible = false;
      game.onSpecial(this);
    }
  }
}

// ======================= HAZARDS / CRATES / SIGNS =======================
export class LavaPool {
  constructor(scene, x, z, w, d, y = 0, dmgBounce = true) {
    this.rect = { x, z, hw: w / 2, hd: d / 2, y };
    this.dmgBounce = dmgBounce;
    const mat = new THREE.MeshStandardMaterial({ map: texLava(), emissive: 0xff4400, emissiveIntensity: 0.9, emissiveMap: texLava(), roughness: 0.6 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, y, z);
    scene.add(this.mesh);
    this.light = new THREE.PointLight(0xff5518, 2.4, Math.max(w, d));
    this.light.position.set(x, y + 2, z);
    scene.add(this.light);
  }
  update(dt, player, game) {
    this.mesh.material.map.offset.x = (performance.now() / 9000) % 1;
    this.mesh.material.map.offset.y = (performance.now() / 13000) % 1;
    if (player.state === 'dead') return;
    _v1.copy(player.pos);
    if (_v1.y < this.rect.y + 0.9 && _v1.y > this.rect.y - 2 &&
      Math.abs(_v1.x - this.rect.x) < this.rect.hw && Math.abs(_v1.z - this.rect.z) < this.rect.hd) {
      game.onHazardTouch('lava', this);
    }
  }
}

export class SpikeStrip {
  constructor(scene, x, z, w, d, y = 0, rotY = 0) {
    this.rect = { x, z, hw: w / 2, hd: d / 2, y };
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9c4d8, metalness: 0.85, roughness: 0.25 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), new THREE.MeshStandardMaterial({ map: texHazardStripes() }));
    base.position.y = y + 0.07;
    g.add(base);
    const spikeGeo = new THREE.ConeGeometry(0.22, 0.85, 6);
    for (let ix = 0; ix < Math.floor(w / 0.55); ix++) {
      for (let iz = 0; iz < Math.floor(d / 0.55); iz++) {
        const s = new THREE.Mesh(spikeGeo, mat);
        s.position.set(-w / 2 + 0.3 + ix * 0.55, y + 0.55, -d / 2 + 0.3 + iz * 0.55);
        g.add(s);
      }
    }
    g.position.set(x, 0, z); g.rotation.y = rotY;
    g.position.x = x; g.position.z = z;
    scene.add(g);
    this.group = g;
  }
  update(dt, player, game) {
    if (player.state === 'dead') return;
    _v1.copy(player.pos);
    if (_v1.y < this.rect.y + 1.1 && _v1.y > this.rect.y - 2 &&
      Math.abs(_v1.x - this.rect.x) < this.rect.hw && Math.abs(_v1.z - this.rect.z) < this.rect.hd) {
      game.onHazardTouch('spikes', this);
    }
  }
}

export class Crate {
  constructor(scene, pos, loot = 5) {
    this.pos = pos.clone();
    this.alive = true;
    this.loot = loot;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({ map: texWood(), roughness: 0.8 }));
    this.mesh.position.copy(pos);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  break(game) {
    if (!this.alive) return;
    this.alive = false;
    this.mesh.visible = false;
    game.onCrateBreak(this);
  }
  update(dt, player, game) {
    if (!this.alive || player.state === 'dead') return;
    // any solid touch breaks it when moving fast / attacking
    const d2 = player.pos.distanceToSquared(this.pos) ;
    const attacking = player.state === 'chain' || player.state === 'stomp' || player.boosting || player.panelTimer > 0 || player.speed > 17;
    if (d2 < 2.1 && attacking) this.break(game);
  }
}

export class LaserGate {
  // Beam between two points, toggling on/off. Touching while on hurts.
  constructor(scene, a, b, { period = 2.4, duty = 0.55, phase = 0 } = {}) {
    this.a = a.clone(); this.b = b.clone();
    this.period = period; this.duty = duty;
    this.t = phase;
    this.mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
    this.len = a.distanceTo(b);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.85 });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), mat);
    this.beam.quaternion.setFromUnitVectors(UP, _v2.copy(b).sub(a).normalize());
    scene.add(this.beam);
    const pyMat = new THREE.MeshStandardMaterial({ color: 0x39465e, metalness: 0.7, roughness: 0.35, emissive: 0x19e6ff, emissiveIntensity: 0.4 });
    for (const p of [a, b]) {
      const pyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.4, 10), pyMat);
      pyl.position.copy(p);
      scene.add(pyl);
    }
    this.on = true;
  }
  update(dt, player, game) {
    this.t += dt;
    const c = ((this.t % this.period) + this.period) % this.period / this.period;
    this.on = c < this.duty;
    this.beam.visible = this.on;
    this.beam.scale.x = this.beam.scale.z = this.on ? 1 : 0.01;
    this.beam.position.copy(this.mid);
    this.beam.scale.y = this.len;
    if (!this.on || player.state === 'dead') return;
    // distance player->segment
    _v1.copy(player.pos).sub(this.a);
    _v2.copy(this.b).sub(this.a);
    const L2 = _v2.lengthSq();
    const t = clamp(_v1.dot(_v2) / Math.max(L2, 1e-6), 0, 1);
    _v3.copy(this.a).addScaledVector(_v2, t);
    if (_v3.distanceToSquared(player.pos) < 1.15) game.onHazardTouch('laser', this);
  }
}

export function makeSign(scene, text, pos, rotY = 0, scale = 1) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.06),
    new THREE.MeshBasicMaterial({ map: texSign(text), transparent: false, side: THREE.DoubleSide }));
  board.position.y = 1.9;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x39465e, metalness: 0.5, roughness: 0.5 }));
  post.position.y = 0.8;
  g.add(board, post);
  g.position.copy(pos);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  scene.add(g);
  return g;
}
