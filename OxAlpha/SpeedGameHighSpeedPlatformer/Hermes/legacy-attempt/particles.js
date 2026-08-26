// Pooled particle system + speed lines + trail ribbon. Bounded memory, no allocations per frame.
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

export class FX {
  constructor(scene, max = 1600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.5, map: dotTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ring shockwaves
    this.rings = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1, .07, 6, 28),
        new THREE.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, t: 1 });
    }
    this._c = new THREE.Color();
  }

  burst(p, n, colorHex, spread = 4, life = .5, grav = 12) {
    this._c.set(colorHex);
    for (let i = 0; i < n; i++) {
      const k = this.head; this.head = (this.head + 1) % this.max;
      this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
      this.vel[k * 3] = (Math.random() - .5) * spread * 2;
      this.vel[k * 3 + 1] = Math.random() * spread * 1.4;
      this.vel[k * 3 + 2] = (Math.random() - .5) * spread * 2;
      const v = .7 + Math.random() * .3;
      this.col[k * 3] = this._c.r * v; this.col[k * 3 + 1] = this._c.g * v; this.col[k * 3 + 2] = this._c.b * v;
      this.life[k] = this.life0[k] = life * (.6 + Math.random() * .8);
      this.size[k] = .35 + Math.random() * .5;
      this.grav[k] = grav;
    }
  }
  ring(p, normal, colorHex) {
    for (const r of this.rings) {
      if (r.t >= 1) {
        r.t = 0; r.mesh.visible = true;
        r.mesh.position.copy(p);
        r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
        r.mesh.material.color.set(colorHex);
        return;
      }
    }
  }

  update(dt) {
    const P = this.pos, Vl = this.vel, L = this.life;
    let alive = false;
    for (let k = 0; k < this.max; k++) {
      if (L[k] <= 0) continue;
      alive = true;
      L[k] -= dt;
      if (L[k] <= 0) { P[k * 3 + 1] = -99999; continue; }
      Vl[k * 3 + 1] -= this.grav[k] * dt;
      P[k * 3] += Vl[k * 3] * dt; P[k * 3 + 1] += Vl[k * 3 + 1] * dt; P[k * 3 + 2] += Vl[k * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const r of this.rings) {
      if (r.t < 1) {
        r.t += dt * 2.4;
        const s = 0.5 + r.t * 7;
        r.mesh.scale.set(s, s, s);
        r.mesh.material.opacity = Math.max(0, 1 - r.t) * .9;
        if (r.t >= 1) r.mesh.visible = false;
      }
    }
    return alive;
  }
}

// Speed streaks around the camera — appear above ~24 m/s
export class SpeedLines {
  constructor(camera) {
    this.cam = camera;
    this.n = 46;
    const pos = new Float32Array(this.n * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.streaks = [];
    for (let i = 0; i < this.n; i++) this.streaks.push(this._rand());
    this.group = new THREE.Group();
    this.group.add(this.lines);
  }
  _rand() {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 4.5;
    return {
      x: Math.cos(a) * r, y: Math.sin(a) * r,
      z: -4 - Math.random() * 26,
      len: 2 + Math.random() * 5
    };
  }
  update(dt, speed, camObj) {
    const target = THREE.MathUtils.clamp((speed - 24) / 26, 0, 1) * 0.55;
    this.mat.opacity += (target - this.mat.opacity) * Math.min(1, dt * 6);
    if (this.mat.opacity < 0.02) { this.lines.visible = false; return; }
    this.lines.visible = true;
    // attach to camera
    if (this.lines.parent !== camObj) camObj.add(this.lines);
    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const s = this.streaks[i];
      s.z += (speed * 1.15) * dt;
      if (s.z > 2) Object.assign(s, this._rand(), { z: -28 - Math.random() * 8 });
      pos[i * 6] = s.x; pos[i * 6 + 1] = s.y; pos[i * 6 + 2] = s.z;
      pos[i * 6 + 3] = s.x; pos[i * 6 + 4] = s.y; pos[i * 6 + 5] = s.z + s.len;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// Trail ribbon behind the player at speed / grinding
export class Trail {
  constructor(scene, n = 22) {
    this.n = n;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3(0, -999, 0));
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: .55, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this._timer = 0;
    const col = new Float32Array(n * 2 * 3);
    const c1 = new THREE.Color(0x29f5ff), c2 = new THREE.Color(0xff3d81);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      tmp.lerpColors(c1, c2, i / n);
      for (let j = 0; j < 2; j++) { col[(i * 2 + j) * 3] = tmp.r; col[(i * 2 + j) * 3 + 1] = tmp.g; col[(i * 2 + j) * 3 + 2] = tmp.b; }
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
  }
  push(p) {
    const pts = this.pts;
    for (let i = pts.length - 1; i > 0; i--) pts[i].copy(pts[i - 1]);
    pts[0].copy(p);
  }
  reset(p) { for (const q of this.pts) q.copy(p).setY(-999); }
  update(dt, visible) {
    this.mesh.visible = visible;
    if (!visible) return;
    const arr = this.geo.attributes.position.array;
    const right = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const a = this.pts[Math.min(i, this.n - 1)], b = this.pts[Math.min(i + 1, this.n - 1)];
      right.subVectors(a, b).cross(_UPV);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
      const w = .16 * (1 - i / this.n);
      arr[i * 6] = a.x - right.x * w; arr[i * 6 + 1] = a.y - right.y * w; arr[i * 6 + 2] = a.z - right.z * w;
      arr[i * 6 + 3] = a.x + right.x * w; arr[i * 6 + 4] = a.y + right.y * w; arr[i * 6 + 5] = a.z + right.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
const _UPV = new THREE.Vector3(0, 1, 0);
