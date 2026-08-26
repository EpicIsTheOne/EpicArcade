import * as THREE from '../lib/three.module.js';

let smoke = null;
let glow = null;
const rings = [];
const lights = [];
const sprites = [];

class PSys {
  constructor(n, additive) {
    this.n = n;
    this.i = 0;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.sizeA = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.baseA = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSize;
        varying vec3 vC;
        varying float vA;
        void main() {
          vC = aColor;
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float a = smoothstep(0.5, 0.12, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
  }

  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, drag, grav) {
    const i = this.i;
    this.i = (this.i + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.sizeA[i] = size; this.grow[i] = grow;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.baseA[i] = alpha; this.alpha[i] = alpha;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr + this.grav[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.04) {
        this.pos[i3 + 1] = 0.04;
        this.vel[i3 + 1] *= -0.25;
        this.vel[i3] *= 0.8;
        this.vel[i3 + 2] *= 0.8;
      }
      this.sizeA[i] += this.grow[i] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = this.baseA[i] * k * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

function makeGlowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,230,170,0.7)');
  gr.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initEffects(scene) {
  smoke = new PSys(2200, false);
  glow = new PSys(1400, true);
  scene.add(smoke.points);
  scene.add(glow.points);
  const glowTex = makeGlowTex();
  const ringGeo = new THREE.RingGeometry(0.92, 1, 56);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffc27a, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    rings.push({ mesh: m, t: 99, dur: 1, maxR: 6 });
  }
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffa550, 0, 24, 2);
    scene.add(l);
    lights.push({ light: l, t: 99, dur: 1, base: 0 });
  }
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.visible = false;
    scene.add(s);
    sprites.push({ sp: s, t: 99, dur: 1, from: 1, to: 4, a0: 1 });
  }
}

function nextRing() {
  let best = rings[0];
  for (const r of rings) if (r.t > best.t) best = r;
  return best;
}

function nextLight() {
  let best = lights[0];
  for (const l of lights) if (l.t > best.t) best = l;
  return best;
}

function nextSprite() {
  let best = sprites[0];
  for (const s of sprites) if (s.t > best.t) best = s;
  return best;
}

export function ringPulse(pos, maxR, dur, color) {
  const r = nextRing();
  r.mesh.position.copy(pos);
  r.mesh.position.y = Math.max(0.06, pos.y * 0.2);
  r.mesh.visible = true;
  r.mesh.material.color.set(color);
  r.t = 0; r.dur = dur; r.maxR = maxR;
}

export function flashLight(pos, intensity, dur, color) {
  const l = nextLight();
  l.light.position.copy(pos);
  l.light.color.set(color);
  l.light.intensity = intensity;
  l.base = intensity;
  l.t = 0; l.dur = dur;
}

function spritePulse(pos, from, to, dur, color, alpha) {
  const s = nextSprite();
  s.sp.position.copy(pos);
  s.sp.material.color.set(color);
  s.sp.visible = true;
  s.t = 0; s.dur = dur; s.from = from; s.to = to; s.a0 = alpha;
}

export function impactDust(p, pow, scale) {
  scale = scale || 1;
  const n = Math.min(16, (3 + pow * 4) | 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.6 + Math.random() * 1.8) * (0.5 + pow * 0.35);
    smoke.spawn(
      p.x + (Math.random() - 0.5) * 0.4 * scale,
      p.y + Math.random() * 0.15,
      p.z + (Math.random() - 0.5) * 0.4 * scale,
      Math.cos(a) * sp, sp * (0.6 + Math.random()), Math.sin(a) * sp,
      0.45 + Math.random() * 0.55 * (0.6 + pow * 0.3),
      (0.45 + Math.random() * 0.5) * scale, 1.3 * scale,
      0.62, 0.58, 0.5, 0.3, 2.2, -0.6
    );
  }
}

export function puffDelete(p, color) {
  color = color || [0.85, 0.83, 0.78];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.8 + Math.random() * 1.4;
    smoke.spawn(p.x, p.y, p.z, Math.cos(a) * sp, 1 + Math.random() * 1.5, Math.sin(a) * sp,
      0.4 + Math.random() * 0.3, 0.4, 1.1, color[0], color[1], color[2], 0.42, 2.6, -1);
  }
}

export function explosionFX(p) {
  flashLight(p, 260, 0.34, 0xffb060);
  spritePulse(p, 2.5, 8.5, 0.3, 0xffdca0, 0.95);
  ringPulse(p, 10, 0.55, 0xffc27a);
  for (let i = 0; i < 26; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const sp = 3.5 + Math.random() * 9;
    const hot = Math.random();
    glow.spawn(p.x, p.y, p.z,
      Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp * 0.8 + 2, Math.sin(ph) * Math.sin(th) * sp,
      0.35 + Math.random() * 0.4, 1.6 + Math.random() * 1.8, 2.2,
      1.0, 0.45 + hot * 0.4, 0.12 + hot * 0.25, 0.85, 2.4, -3);
  }
  for (let i = 0; i < 38; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const sp = 8 + Math.random() * 17;
    glow.spawn(p.x, p.y, p.z,
      Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp, Math.sin(ph) * Math.sin(th) * sp,
      0.4 + Math.random() * 0.45, 0.5 + Math.random() * 0.4, 0,
      1.0, 0.85, 0.45, 0.9, 1.4, -26);
  }
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3.5;
    smoke.spawn(p.x + (Math.random() - 0.5), p.y + Math.random(), p.z + (Math.random() - 0.5),
      Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp,
      1.2 + Math.random() * 0.8, 2 + Math.random() * 2.2, 2.6,
      0.32, 0.3, 0.28, 0.4, 1.6, -0.8);
  }
}

export function muzzleFX(p, dir) {
  flashLight(p, 40, 0.09, 0xfff0c0);
  spritePulse(p, 0.5, 1.4, 0.12, 0xfff2cc, 0.8);
  for (let i = 0; i < 5; i++) {
    glow.spawn(p.x, p.y, p.z,
      dir.x * 14 + (Math.random() - 0.5) * 4, dir.y * 14 + (Math.random() - 0.5) * 4, dir.z * 14 + (Math.random() - 0.5) * 4,
      0.18, 0.4, 0, 1.0, 0.8, 0.4, 0.9, 1.6, -10);
  }
}

export function spawnPuff(p, color) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.6 + Math.random();
    smoke.spawn(p.x, p.y, p.z, Math.cos(a) * sp, 0.8 + Math.random(), Math.sin(a) * sp,
      0.35, 0.35, 1.0, color[0], color[1], color[2], 0.4, 2.4, -0.5);
  }
}

export function updateEffects(dt) {
  smoke.update(dt);
  glow.update(dt);
  for (const r of rings) {
    if (r.t >= r.dur) { r.mesh.visible = false; continue; }
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    const e = 1 - Math.pow(1 - k, 3);
    const sc = 0.5 + e * r.maxR;
    r.mesh.scale.set(sc, sc, sc);
    r.mesh.material.opacity = (1 - k) * 0.65;
  }
  for (const l of lights) {
    if (l.t >= l.dur) { l.light.intensity = 0; continue; }
    l.t += dt;
    const k = Math.min(1, l.t / l.dur);
    l.light.intensity = l.base * (1 - k) * (1 - k);
  }
  for (const s of sprites) {
    if (s.t >= s.dur) { s.sp.visible = false; continue; }
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    const e = 1 - Math.pow(1 - k, 2);
    const sc = s.from + e * (s.to - s.from);
    s.sp.scale.set(sc, sc, sc);
    s.sp.material.opacity = s.a0 * (1 - k);
  }
}
