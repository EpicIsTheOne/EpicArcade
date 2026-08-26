// fx.js — pooled particles (single THREE.Points), ribbon trails, speed-line canvas overlay.
import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, max = 2200) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor=color; vAlpha=aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d)*2.0;
          float a = smoothstep(1.0, 0.15, r);
          gl_FragColor = vec4(vColor, a*vAlpha);
        }`
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) { this.life[i] = 0; this.alpha[i] = 0; }
    this._c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, opts = {}) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const l = opts.life || 0.6;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this._c.set(opts.color || '#ffd166');
    this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    this.size[i] = opts.size || 0.5;
    this.life[i] = l; this.life0[i] = l;
    this.grav[i] = opts.gravity !== undefined ? opts.gravity : 8;
    this.drag[i] = opts.drag !== undefined ? opts.drag : 1.5;
    this.alpha[i] = opts.alpha !== undefined ? opts.alpha : 1;
  }

  burst(p, n, opts = {}) {
    const spd = opts.speed || 6;
    for (let k = 0; k < n; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const s = spd * (0.35 + Math.random() * 0.75);
      this.emit(p.x, p.y, p.z,
        Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s * (opts.upBias || 1) + (opts.up || 0), Math.sin(ph) * Math.sin(th) * s,
        opts);
    }
  }

  update(dt) {
    const { pos, vel, life, life0, alpha } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      const f = Math.max(life[i] / life0[i], 0);
      alpha[i] = f;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - this.grav[i] * dt; vel[i * 3 + 2] *= dr;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

/** Two boot trails: ring-buffer ribbons that follow the player at speed. */
export class TrailRibbon {
  constructor(scene, color, maxPoints = 40, width = 0.22) {
    this.max = maxPoints; this.width = width;
    this.pts = []; // Vector3 history
    const g = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxPoints * 2 * 3);
    this.alphas = new Float32Array(maxPoints * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    const idx = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `attribute float aAlpha; varying float vA;
        void main(){ vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ gl_FragColor=vec4(uColor, vA); }`
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.intensity = 0;
  }

  push(p, sideDir) {
    this.pts.unshift({ p: p.clone(), s: sideDir ? sideDir.clone() : null });
    if (this.pts.length > this.max) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const pt = this.pts[i];
      const w = this.width * (1 - i / this.max);
      const sd = pt.s || new THREE.Vector3(1, 0, 0);
      const o = i * 6;
      this.positions[o] = pt.p.x + sd.x * w; this.positions[o + 1] = pt.p.y + sd.y * w; this.positions[o + 2] = pt.p.z + sd.z * w;
      this.positions[o + 3] = pt.p.x - sd.x * w; this.positions[o + 4] = pt.p.y - sd.y * w; this.positions[o + 5] = pt.p.z - sd.z * w;
      const a = this.intensity * Math.pow(1 - i / this.max, 1.6) * 0.85;
      this.alphas[i * 2] = a; this.alphas[i * 2 + 1] = a;
    }
    // collapse unused tail
    for (let i = n; i < this.max; i++) {
      const o = i * 6;
      this.positions[o] = this.positions[o + 3] = this.pts[n - 1] ? this.pts[n - 1].p.x : 0;
      this.positions[o + 1] = this.positions[o + 4] = this.pts[n - 1] ? this.pts[n - 1].p.y : 0;
      this.positions[o + 2] = this.positions[o + 5] = this.pts[n - 1] ? this.pts[n - 1].p.z : 0;
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = 0;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }

  clear() { this.pts.length = 0; this.intensity = 0; }
}

/** Screen-space radial speed lines on a 2D canvas overlay. */
export class SpeedLines {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.intensity = 0; // 0..1
    this.streaks = [];
    for (let i = 0; i < 26; i++) this.streaks.push(this._newStreak(true));
  }
  _newStreak(init = false) {
    const ang = Math.random() * Math.PI * 2;
    return {
      ang,
      r: init ? 120 + Math.random() * 500 : 90 + Math.random() * 60,
      len: 60 + Math.random() * 160,
      w: 1 + Math.random() * 2.2,
      spd: 900 + Math.random() * 1600,
      a: 0.25 + Math.random() * 0.55
    };
  }
  resize(w, h) { this.canvas.width = w; this.canvas.height = h; }
  update(dt, intensity) {
    this.intensity = intensity;
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (intensity <= 0.02) return;
    const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      s.r += s.spd * dt * (0.4 + intensity);
      if (s.r > R * 1.15) Object.assign(s, this._newStreak());
      const a = s.a * intensity;
      ctx.strokeStyle = `rgba(235,250,255,${a.toFixed(3)})`;
      ctx.lineWidth = s.w;
      const cos = Math.cos(s.ang), sin = Math.sin(s.ang);
      ctx.beginPath();
      ctx.moveTo(cx + cos * s.r, cy + sin * s.r);
      ctx.lineTo(cx + cos * (s.r + s.len * intensity), cy + sin * (s.r + s.len * intensity));
      ctx.stroke();
    }
  }
}
