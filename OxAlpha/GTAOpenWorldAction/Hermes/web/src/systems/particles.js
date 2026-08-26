// CHROME HARBOR — pooled particles (sparks/smoke/dust), tracers, explosion FX.
import * as THREE from 'three';
import { glowTexture, smokeTexture } from '../gfx/textures.js';
import { RNG, clamp } from '../core/util.js';

const TYPES = {
  spark: { grav: -22, drag: 2.2, additive: true },
  ember: { grav: -6, drag: 1.4, additive: true },
  smoke: { grav: 1.6, drag: 1.1, additive: false, grow: 3.4 },
  dust:  { grav: 0.4, drag: 2.0, additive: false, grow: 2.2 },
  splash:{ grav: -26, drag: 1.0, additive: true },
};

class PointCloudPool {
  constructor(scene, max, texture, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.data = []; // per-particle sim state
    for (let i = 0; i < max; i++) {
      this.pos[i * 3 + 1] = -999;
      this.data.push({ alive: false });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: /* glsl */`
        attribute float size;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.a, t.a);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    this.cursor = 0;
    this.geo = geo;
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, type) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const d = this.data[i];
    d.alive = true; d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz;
    d.life = life; d.maxLife = life; d.size = size; d.grow = TYPES[type].grow || 0;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this._type = this._type || []; this._type[i] = type;
  }
  update(dt) {
    const T = TYPES;
    for (let i = 0; i < this.max; i++) {
      const d = this.data[i];
      if (!d.alive) continue;
      d.life -= dt;
      if (d.life <= 0) { d.alive = false; this.pos[i * 3 + 1] = -999; this.size[i] = 0; continue; }
      const t = T[this._type[i]];
      d.vy += t.grav * dt;
      const dr = Math.exp(-t.drag * dt);
      d.vx *= dr; d.vz *= dr; d.vy *= Math.exp(-(t.drag ?? 0) * 0.4 * dt);
      if (t.grav < 0 && d.y < 0.05 && this._type[i] !== 'smoke' && this._type[i] !== 'dust') { d.y = 0.05; d.vy *= -0.35; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const k = d.life / d.maxLife;
      this.pos[i * 3] = d.x; this.pos[i * 3 + 1] = d.y; this.pos[i * 3 + 2] = d.z;
      this.size[i] = d.size * (1 + d.grow * (1 - k)) * (this._type[i] === 'spark' ? k : Math.min(1, k * 2.2));
      // fade via darkening for normal-blend smoke
      if (!T[this._type[i]].additive) {
        const f = Math.min(1, k * 2);
        this.col[i * 3] *= 1; // keep hue; alpha handled by size+softness
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

export class ParticleSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.glow = new PointCloudPool(ctx.scene, 900, glowTexture(), true);   // sparks/embers/splash
    this.smokeP = new PointCloudPool(ctx.scene, 700, smokeTexture(), false); // smoke/dust
    this.rng = new RNG('parts');
    this.tracers = this.makeTracers(48);
    this.rings = [];
    this.flashLight = new THREE.PointLight('#ffb46a', 0, 60, 1.7);
    this.flashLight.visible = false;
    ctx.scene.add(this.flashLight);
    this._flashT = 0;
  }

  makeTracers(n) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.9 });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    this.ctx.scene.add(mesh);
    const items = [];
    for (let i = 0; i < n; i++) items.push({ t: 0, i });
    return { mesh, items, cursor: 0, geo };
  }

  tracer(x0, y0, z0, x1, y1, z1) {
    const T = this.tracers;
    const it = T.items[T.cursor]; T.cursor = (T.cursor + 1) % T.items.length;
    it.t = 0.075;
    const arr = T.geo.attributes.position.array;
    const j = it.i * 6;
    arr[j] = x0; arr[j + 1] = y0; arr[j + 2] = z0;
    arr[j + 3] = x1; arr[j + 4] = y1; arr[j + 5] = z1;
    T.geo.attributes.position.needsUpdate = true;
  }

  updateTracers(dt) {
    const T = this.tracers;
    let any = false;
    for (const it of T.items) {
      if (it.t > 0) {
        it.t -= dt;
        any = true;
        if (it.t <= 0) {
          const j = it.i * 6;
          const arr = T.geo.attributes.position.array;
          arr[j + 1] = arr[j + 4] = -999;
          T.geo.attributes.position.needsUpdate = true;
        }
      }
    }
    T.mesh.visible = any;
  }

  burst(pool, type, x, y, z, n, opts = {}) {
    const speed = opts.speed ?? 6, spread = opts.spread ?? 1, life = opts.life ?? 0.5;
    const size = opts.size ?? 0.35, dir = opts.dir, cone = opts.cone ?? 1;
    const c = new THREE.Color(opts.color ?? '#ffcf7a');
    for (let i = 0; i < n; i++) {
      let vx = (this.rng.next() * 2 - 1) * spread * speed;
      let vy = (this.rng.next() * 2 - 1) * spread * speed * 0.7 + speed * 0.35;
      let vz = (this.rng.next() * 2 - 1) * spread * speed;
      if (dir) {
        vx = dir.x * speed * (0.4 + this.rng.next() * 0.6) + vx * cone;
        vy = dir.y * speed * (0.4 + this.rng.next() * 0.6) + vy * cone;
        vz = dir.z * speed * (0.4 + this.rng.next() * 0.6) + vz * cone;
      }
      pool.spawn(x, y, z, vx, vy, vz, life * (0.6 + this.rng.next() * 0.8), size * (0.7 + this.rng.next() * 0.6),
        c.clone().offsetHSL(0, 0, (this.rng.next() - 0.5) * 0.16), type);
    }
  }

  sparks(x, y, z, n = 10, color = '#ffcf7a', dir) { this.burst(this.glow, 'spark', x, y, z, n, { speed: 9, spread: 1, life: 0.45, size: 0.28, color, dir }); }
  bloodPuff(x, y, z) { this.burst(this.smokeP, 'dust', x, y, z, 6, { speed: 2.6, life: 0.5, size: 0.5, color: '#a33b30' }); }
  dust(x, y, z, n = 6) { this.burst(this.smokeP, 'dust', x, y, z, n, { speed: 2, life: 0.7, size: 0.7, color: '#9c9484' }); }
  smoke(x, y, z, n = 3, color = '#555a60', size = 1.4) { this.burst(this.smokeP, 'smoke', x, y, z, n, { speed: 1.1, life: 1.6, size, color }); }
  splash(x, y, z, n = 12) { this.burst(this.glow, 'splash', x, y, z, n, { speed: 5, life: 0.5, size: 0.3, color: '#bfe4f5' }); }
  muzzle(x, y, z, dir) {
    this.burst(this.glow, 'ember', x, y, z, 3, { speed: 14, spread: .3, life: .09, size: .5, color: '#ffe9b0', dir, cone: .25 });
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 260;
    this.flashLight.distance = 26;
    this.flashLight.visible = true;
    this._flashT = 0.05;
  }

  explosion(x, y, z, power = 1) {
    this.ctx.audio?.explosion(Math.min(power, 1.6));
    this.burst(this.glow, 'spark', x, y + 0.5, z, Math.floor(34 * power), { speed: 15 * power, life: 0.85, size: 0.42, color: '#ffc36a' });
    this.burst(this.glow, 'ember', x, y + 0.6, z, Math.floor(18 * power), { speed: 6 * power, life: 1.4, size: 0.7, color: '#ff7433' });
    this.smoke(x, y + 1, z, Math.floor(13 * power), '#33363b', 2.6 * power);
    this.dust(x, 0.4, z, 10);
    this.flashLight.position.set(x, y + 2, z);
    this.flashLight.intensity = 1400 * power;
    this.flashLight.distance = 70 * power;
    this.flashLight.visible = true;
    this._flashT = 0.24;
    // shockwave ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffb46a', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.position.set(x, 0.25, z);
    ring.userData = { t: 0, maxR: 9 * power };
    this.ctx.scene.add(ring);
    this.rings.push(ring);
    // camera shake
    this.ctx.camShake?.(0.7 * power);
    this.ctx.events.emit('explosion', { x, y, z, power });
  }

  update(dt) {
    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0) this.flashLight.visible = false;
      else this.flashLight.intensity *= Math.exp(-dt * 22);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.userData.t += dt;
      const k = r.userData.t / 0.55;
      if (k >= 1) { this.ctx.scene.remove(r); r.geometry.dispose(); r.material.dispose(); this.rings.splice(i, 1); continue; }
      const s = 0.4 + k * r.userData.maxR;
      r.scale.set(s, 1, s);
      r.material.opacity = 0.85 * (1 - k);
    }
    this.updateTracers(dt);
    this.glow.update(dt);
    this.smokeP.update(dt);
  }
}
