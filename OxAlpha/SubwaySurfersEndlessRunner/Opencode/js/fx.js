// particles, screen effects, floating text
import * as THREE from 'three';
import { randRange } from './utils.js';

class FX {
  constructor() {
    this.scene = null;
    this.shakeT = 0; this.shakeAmp = 0;
    this.slowmo = 0;
    this.pools = {};
  }

  init(scene, qualityScale = 1) {
    this.scene = scene;
    this.qualityScale = qualityScale;
    const N = Math.floor(900 * qualityScale);
    // one Points system for all spark-ish particles
    this.N = N;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.life = new Float32Array(N);      // remaining
    this.maxLife = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.grav = new Float32Array(N);
    this.size = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.pos[i * 3 + 1] = -9999; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('sizeAttr', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float sizeAttr;
        varying vec3 vColor;
        void main(){
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = sizeAttr * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          vec2 d = gl_PointCoord - vec2(0.5);
          float a = smoothstep(0.5, 0.12, length(d));
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;

    // speed streaks: stretched additive quads near camera edges
    this.streaks = [];
    if (qualityScale > 0.3) {
      const sgeo = new THREE.PlaneGeometry(0.05, 3.2);
      const smat = new THREE.MeshBasicMaterial({
        color: 0xffe8c8, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      for (let i = 0; i < Math.floor(26 * qualityScale); i++) {
        const m = new THREE.Mesh(sgeo, smat.clone());
        m.visible = false; m.frustumCulled = false;
        scene.add(m);
        this.streaks.push({ mesh: m, t: 0 });
      }
    }
  }

  emit(x, y, z, count, color, opts = {}) {
    if (!this.points) return;
    const spd = opts.spread ?? 2.6, up = opts.up ?? 2.2, g = opts.gravity ?? -7;
    const lifeD = opts.life ?? 0.55;
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      this.pos[i * 3] = x + randRange(-0.14, 0.14);
      this.pos[i * 3 + 1] = y + randRange(-0.1, 0.1);
      this.pos[i * 3 + 2] = z + randRange(-0.14, 0.14);
      this.vel[i * 3] = randRange(-spd, spd);
      this.vel[i * 3 + 1] = randRange(up * 0.3, up) * (opts.burst ? 1 : 1);
      this.vel[i * 3 + 2] = randRange(-spd, spd);
      const vr = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = c.r * vr; this.col[i * 3 + 1] = c.g * vr; this.col[i * 3 + 2] = c.b * vr;
      this.life[i] = this.maxLife[i] = lifeD * randRange(0.7, 1.25);
      this.grav[i] = g;
      this.size[i] = (opts.size ?? 0.16) * randRange(0.7, 1.4);
    }
  }

  burstCoin(x, y, z) { this.emit(x, y, z, 10, 0xffd36b, { spread: 2, up: 2.6, life: 0.45, size: 0.13 }); }
  burstGem(x, y, z) {
    this.emit(x, y, z, 22, 0x54e8c8, { spread: 3.4, up: 3.4, life: 0.7, size: 0.17 });
  }
  dust(x, y, z, n = 6) { this.emit(x, y, z, n, 0x9a8f80, { spread: 1.4, up: 1.1, gravity: -2, life: 0.5, size: 0.2 }); }
  sparks(x, y, z, n = 14) { this.emit(x, y, z, n, 0xffc36b, { spread: 3.6, up: 3.2, gravity: -12, life: 0.5 }); }
  boardTrail(x, y, z) { this.emit(x, y, z, 2, 0x35e0d2, { spread: 0.4, up: 0.4, gravity: 0.4, life: 0.4, size: 0.18 }); }
  jetFlame(x, y, z) {
    this.emit(x, y, z, 3, 0xffa03c, { spread: 0.5, up: -2.5, gravity: -1, life: 0.35, size: 0.24 });
    if (Math.random() < 0.4) this.emit(x, y, z, 1, 0x777777, { spread: 0.4, up: 0.6, gravity: 0.6, life: 0.9, size: 0.34 });
  }
  confetti(x, y, z) {
    for (const col of [0xff4f81, 0x35e0d2, 0xffc93c, 0x8a5cff]) this.emit(x, y, z, 10, col, { spread: 4.5, up: 6, life: 1.4, size: 0.2 });
  }

  update(dt, camZ) {
    if (!this.points) return;
    const p = this.pos, v = this.vel, l = this.life;
    for (let i = 0; i < this.N; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      if (l[i] <= 0) { p[i * 3 + 1] = -9999; continue; }
      v[i * 3 + 1] += this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.sizeAttr.needsUpdate = true;

    // streaks
    if (this.streaks.length && window.__speedNorm > 0.45) {
      for (const s of this.streaks) {
        s.t -= dt;
        if (s.t <= 0) {
          s.t = randRange(0.02, 0.14);
          const side = Math.random() < 0.5 ? -1 : 1;
          s.mesh.position.set(side * randRange(2.4, 4.6), randRange(0.6, 4.2), camZ - randRange(4, 16));
          s.mesh.rotation.z = Math.PI / 2;
          s.mesh.visible = true;
          s.mesh.material.opacity = randRange(0.2, 0.5) * (window.__speedNorm - 0.4);
          s.life = 0.16;
        } else {
          s.mesh.position.z -= window.__speedNorm * 60 * dt;
          s.life -= dt;
          if (s.life <= 0) s.mesh.visible = false;
        }
      }
    }
  }

  shake(amp, time = 0.3) {
    if (!window.__allowShake) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, time);
  }
  getShake() {
    if (this.shakeT <= 0) return [0, 0];
    this.shakeT -= 1 / 60;
    const a = this.shakeAmp * (this.shakeT / 0.3);
    return [randRange(-a, a), randRange(-a, a)];
  }
}

export const fx = new FX();

// DOM floating popups
let popupLayer, popupPool = [];
export function initPopups() {
  popupLayer = document.getElementById('popups');
}
export function popup(text, color = '#ffd36b', xPct = 50, yPct = 42, big = false) {
  let el = popupPool.pop();
  if (!el) {
    el = document.createElement('div');
    popupLayer.appendChild(el);
  }
  el.className = 'pop';
  el.textContent = text;
  el.style.left = `${xPct}%`;
  el.style.top = `${yPct}%`;
  el.style.color = color;
  el.style.fontSize = big ? '30px' : '19px';
  el.style.transform = 'translateX(-50%)';
  // restart animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(el._t);
  el._t = setTimeout(() => { popupPool.push(el); el.style.display = 'none'; }, 850);
  el.style.display = '';
}
