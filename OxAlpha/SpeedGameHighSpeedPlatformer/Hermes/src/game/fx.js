import * as THREE from 'three';
import { clamp } from './mathutil.js';

// Pooled GPU particles + trail ribbons + shockwave rings + floating score text.
const PVERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vA;
varying vec3 vC;
void main(){
  vA = aAlpha; vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * (240.0 / max(1.0,-mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = /* glsl */`
varying float vA; varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if(d > 0.5) discard;
  float a = smoothstep(0.5, 0.08, d) * vA;
  gl_FragColor = vec4(vC, a);
}`;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    const N = (this.N = 1600);
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.alpha = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);      // remaining
    this.life0 = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.head = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // shockwave ring pool
    this.rings = [];
    const rg = new THREE.RingGeometry(0.8, 1.0, 40);
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      r.visible = false;
      scene.add(r);
      this.rings.push({ mesh: r, t: 1, dur: 0.5, scaleTo: 8 });
    }

    this.floaters = [];
    this._tmpV = new THREE.Vector3();
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.alpha[i] = 1;
    this.life[i] = this.life0[i] = life;
    this.grav[i] = grav;
  }

  burst(p, { count = 14, speed = 6, up = 0, color = 0xffd94a, colors = null, size = 5, life = 0.7, grav = -10, spread = 1 }) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.65);
      let cr = c.r, cg = c.g, cb = c.b;
      if (colors && colors.length) { const cc = new THREE.Color(colors[(Math.random() * colors.length) | 0]); cr = cc.r; cg = cc.g; cb = cc.b; }
      this.spawn(
        p.x, p.y, p.z,
        Math.sin(ph) * Math.cos(th) * s * spread, Math.cos(ph) * s + up, Math.sin(ph) * Math.sin(th) * s * spread,
        life * (0.6 + Math.random() * 0.8), size * (0.6 + Math.random() * 0.8), cr, cg, cb, grav
      );
    }
  }

  dust(p, n = 8, color = 0xcfa96b) {
    this.burst(p, { count: n, speed: 3.5, up: 2, color, size: 7, life: 0.5, grav: -4 });
  }
  sparks(p, dir = null, n = 10, color = 0x9ff3ff) {
    const b = { count: n, speed: 12, color, size: 3.4, life: 0.35, grav: -22 };
    this.burst(p, b);
    if (dir) for (let i = 0; i < n; i++) {
      const c = new THREE.Color(color);
      this.spawn(p.x, p.y, p.z, dir.x * 14 + (Math.random() - .5) * 6, dir.y * 14 + Math.random() * 4, dir.z * 14 + (Math.random() - .5) * 6, 0.3, 3, c.r, c.g, c.b, -20);
    }
  }
  collect(p, color = 0xffe14d) { this.burst(p, { count: 8, speed: 5, up: 1.5, color, size: 4.5, life: 0.45, grav: 2 }); }
  explosion(p, color = 0xff8830) {
    this.burst(p, { count: 26, speed: 11, up: 3, colors: [color, 0xffd94a, 0xffffff], size: 8, life: 0.65, grav: -8 });
    this.ring(p, 6, color);
  }
  ring(p, scaleTo = 8, color = 0x9ff3ff, normal = null) {
    const r = this.rings.find((r) => r.t >= 1) || this.rings[0];
    r.mesh.position.copy(p);
    r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal || new THREE.Vector3(0, 1, 0));
    r.mesh.material.color.set(color);
    r.mesh.visible = true;
    r.t = 0; r.scaleTo = scaleTo;
  }

  update(dt, camera) {
    // particles
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = clamp(this.life[i] / this.life0[i], 0, 1);
      this.alpha[i] = k;
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= Math.exp(-1.6 * dt); this.vel[i * 3 + 2] *= Math.exp(-1.6 * dt);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;

    for (const r of this.rings) {
      if (r.t >= 1) { r.mesh.visible = false; continue; }
      r.t = Math.min(1, r.t + dt / r.dur);
      const e = 1 - Math.pow(1 - r.t, 3);
      r.mesh.scale.setScalar(0.4 + e * r.scaleTo);
      r.mesh.material.opacity = 0.85 * (1 - e);
    }
  }

  // world-space floating score text
  floatText(worldPos, text, cssColor = '#ffe14d') {
    let f = this.floaters.find((f) => !f.busy);
    if (!f) {
      if (this.floaters.length >= 18) return;
      const el = document.createElement('div');
      el.className = 'float-txt';
      document.getElementById('floaters').appendChild(el);
      f = { el, busy: false, t: 0, wp: new THREE.Vector3(), rise: 0 };
      this.floaters.push(f);
    }
    f.busy = true; f.t = 0;
    f.wp.copy(worldPos);
    f.rise = 1.4;
    f.el.textContent = text;
    f.el.style.color = cssColor;
    f.el.style.display = 'block';
  }

  updateFloaters(dt, camera) {
    for (const f of this.floaters) {
      if (!f.busy) continue;
      f.t += dt;
      if (f.t > 0.95) { f.busy = false; f.el.style.display = 'none'; continue; }
      this._tmpV.copy(f.wp); this._tmpV.y += f.rise * f.t;
      this._tmpV.project(camera);
      if (this._tmpV.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = 'block';
      f.el.style.left = ((this._tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
      f.el.style.top = ((-this._tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
      f.el.style.opacity = String(clamp(1.4 - f.t * 1.5, 0, 1));
      f.el.style.transform = `translate(-50%,-50%) scale(${clamp(0.7 + f.t * 0.6, 0.7, 1.25)})`;
    }
  }
}

// Ribbon trail behind the player's boots.
export class TrailRibbon {
  constructor(scene, color = 0x37d8ff, width = 0.34, maxPts = 42) {
    this.maxPts = maxPts;
    this.width = width;
    this.geo = new THREE.BufferGeometry();
    this.parr = new Float32Array(maxPts * 2 * 3);
    this.carr = new Float32Array(maxPts * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.parr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.carr, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.baseColor = new THREE.Color(color);
    this.pts = [];
    scene.add(this.mesh);
  }

  setWidth(w) { this.width = w; }
  setColor(hex) { this.baseColor.set(hex); }

  push(headPos, sideDir, intensity = 1) {
    this.pts.unshift({ h: headPos.clone(), s: sideDir.clone().normalize(), i: intensity });
    if (this.pts.length > this.maxPts) this.pts.pop();
    this._rebuild();
  }

  fade() {
    for (const p of this.pts) p.i *= 0.82;
    while (this.pts.length && this.pts[this.pts.length - 1].i < 0.03) this.pts.pop();
    this._rebuild();
  }

  _rebuild() {
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const w = this.width * (1 - i / this.maxPts);
      const o = i * 6;
      this.parr[o] = p.h.x + p.s.x * w; this.parr[o + 1] = p.h.y + p.s.y * w; this.parr[o + 2] = p.h.z + p.s.z * w;
      this.parr[o + 3] = p.h.x - p.s.x * w; this.parr[o + 4] = p.h.y - p.s.y * w; this.parr[o + 5] = p.h.z - p.s.z * w;
      const c = this.baseColor;
      const ii = p.i * (1 - i / this.maxPts);
      this.carr[o] = c.r * ii; this.carr[o + 1] = c.g * ii; this.carr[o + 2] = c.b * ii;
      this.carr[o + 3] = c.r * ii; this.carr[o + 4] = c.g * ii; this.carr[o + 5] = c.b * ii;
    }
    for (let i = n; i < this.maxPts; i++) {
      const last = n > 0 ? this.pts[n - 1] : null;
      const o = i * 6;
      const x = last ? last.h.x : 0, y = last ? last.h.y : -999, z = last ? last.h.z : 0;
      this.parr[o] = x; this.parr[o + 1] = y; this.parr[o + 2] = z;
      this.parr[o + 3] = x; this.parr[o + 4] = y; this.parr[o + 5] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  reset() { this.pts.length = 0; this._rebuild(); }
}
