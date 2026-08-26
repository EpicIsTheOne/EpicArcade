// Visual effects: particle pools (additive + smoke), debris chunks, shockwave rings,
// explosion flash and camera shake. All pooled — nothing allocated per frame.
window.SB = window.SB || {};
SB.FX = (function () {
  const VERT = `
    attribute float size;
    attribute vec4 col;
    varying vec4 vCol;
    void main() {
      vCol = col;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (240.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    uniform sampler2D map;
    varying vec4 vCol;
    void main() { gl_FragColor = vCol * texture2D(map, gl_PointCoord); }`;

  function softDot() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  class ParticlePool {
    constructor(scene, count, blending) {
      this.count = count; this.head = 0; this.alive = 0;
      this.pos = new Float32Array(count * 3);
      this.vel = new Float32Array(count * 3);
      this.col = new Float32Array(count * 4); // rgba
      this.size = new Float32Array(count);
      this.life = new Float32Array(count);   // remaining
      this.ttl = new Float32Array(count);    // total
      this.grav = new Float32Array(count);
      this.drag = new Float32Array(count);
      this.grow = new Float32Array(count);
      this.a0 = new Float32Array(count);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('col', new THREE.BufferAttribute(this.col, 4));
      geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: softDot() } },
        vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, blending,
      });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      scene.add(this.points);
    }
    spawn(x, y, z, vx, vy, vz, ttl, size, r, g, b, a, grav, drag, grow) {
      const i = this.head; this.head = (this.head + 1) % this.count;
      const i3 = i * 3, i4 = i * 4;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.ttl[i] = ttl; this.life[i] = ttl;
      this.size[i] = size; this.a0[i] = a;
      this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
      this.grav[i] = grav == null ? -9 : grav;
      this.drag[i] = drag == null ? 1.5 : drag;
      this.grow[i] = grow == null ? 0 : grow;
    }
    update(dt) {
      const n = this.count;
      let alive = 0;
      for (let i = 0; i < n; i++) {
        if (this.life[i] <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; } continue; }
        alive++;
        this.life[i] -= dt;
        const k = Math.max(0, this.life[i] / this.ttl[i]);
        const i3 = i * 3, i4 = i * 4;
        const dmp = Math.exp(-this.drag[i] * dt);
        this.vel[i3] *= dmp; this.vel[i3 + 2] *= dmp;
        this.vel[i3 + 1] = this.vel[i3 + 1] * dmp + this.grav[i] * dt;
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (this.pos[i3 + 1] < 0.03 && this.grav[i] < 0) { this.pos[i3 + 1] = 0.03; this.vel[i3 + 1] *= -0.25; }
        this.size[i] += this.grow[i] * dt;
        this.col[i4 + 3] = this.a0[i] * k;
      }
      this.alive = alive;
      const geo = this.points.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.col.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    }
  }

  // ---------- debris chunks ----------
  const DEBRIS_MAX = 90;
  class DebrisPool {
    constructor(scene) {
      const geo = new THREE.TetrahedronGeometry(0.15);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xa08a68, roughness: .85, flatShading: true,
        transparent: true, opacity: 1,
      });
      this.mesh = new THREE.InstancedMesh(geo, mat, DEBRIS_MAX);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.castShadow = false; this.mesh.frustumCulled = false;
      scene.add(this.mesh);
      this.px = new Float32Array(DEBRIS_MAX); this.py = new Float32Array(DEBRIS_MAX); this.pz = new Float32Array(DEBRIS_MAX);
      this.vx = new Float32Array(DEBRIS_MAX); this.vy = new Float32Array(DEBRIS_MAX); this.vz = new Float32Array(DEBRIS_MAX);
      this.rx = new Float32Array(DEBRIS_MAX); this.ry = new Float32Array(DEBRIS_MAX); this.rz = new Float32Array(DEBRIS_MAX);
      this.wx = new Float32Array(DEBRIS_MAX); this.wy = new Float32Array(DEBRIS_MAX); this.wz = new Float32Array(DEBRIS_MAX);
      this.s = new Float32Array(DEBRIS_MAX); this.life = new Float32Array(DEBRIS_MAX); this.ttl = new Float32Array(DEBRIS_MAX);
      this.head = 0;
      this.dummy = new THREE.Object3D();
      for (let i = 0; i < DEBRIS_MAX; i++) this.hide(i);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    hide(i) {
      this.dummy.position.set(0, -999, 0); this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    burst(p, n, style) {
      // style tweaks size/energy only — one pooled mesh keeps it cheap
      for (let k = 0; k < n; k++) {
        const i = this.head; this.head = (this.head + 1) % DEBRIS_MAX;
        const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 6.5, sp = 2.5 + Math.random() * 6;
        this.px[i] = p.x + (Math.random() - .5) * .5;
        this.py[i] = p.y + Math.random() * .4;
        this.pz[i] = p.z + (Math.random() - .5) * .5;
        this.vx[i] = Math.cos(a) * sp; this.vy[i] = up; this.vz[i] = Math.sin(a) * sp;
        this.rx[i] = Math.random() * 6; this.ry[i] = Math.random() * 6; this.rz[i] = Math.random() * 6;
        this.wx[i] = (Math.random() - .5) * 14; this.wy[i] = (Math.random() - .5) * 14; this.wz[i] = (Math.random() - .5) * 14;
        this.ttl[i] = 1.6 + Math.random() * 1.2; this.life[i] = this.ttl[i];
        this.s[i] = (style === 'ice' ? 0.55 : 0.8) + Math.random();
      }
    }
    update(dt) {
      let any = false;
      for (let i = 0; i < DEBRIS_MAX; i++) {
        if (this.life[i] <= 0) continue;
        any = true;
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.hide(i); continue; }
        this.vy[i] -= 22 * dt;
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        if (this.py[i] < 0.07) { this.py[i] = 0.07; this.vy[i] *= -0.38; this.vx[i] *= 0.72; this.vz[i] *= 0.72; this.wx[i] *= 0.7; this.wz[i] *= 0.7; }
        this.rx[i] += this.wx[i] * dt; this.ry[i] += this.wy[i] * dt; this.rz[i] += this.wz[i] * dt;
        const fade = Math.min(1, this.life[i] / (this.ttl[i] * 0.3));
        this.dummy.position.set(this.px[i], this.py[i], this.pz[i]);
        this.dummy.rotation.set(this.rx[i], this.ry[i], this.rz[i]);
        this.dummy.scale.setScalar(this.s[i] * fade);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      if (any || this._dirty) { this.mesh.instanceMatrix.needsUpdate = true; }
      this._dirty = any;
    }
  }

  // ---------- shockwave rings ----------
  class Rings {
    constructor(scene) {
      this.pool = [];
      const geo = new THREE.RingGeometry(0.86, 1, 48);
      for (let i = 0; i < 5; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2; m.visible = false; m.frustumCulled = false;
        scene.add(m);
        this.pool.push({ mesh: m, t: 0, dur: 0, radius: 1 });
      }
    }
    fire(pos, radius, color) {
      const r = this.pool.find(x => x.t >= x.dur) || this.pool[0];
      r.t = 0; r.dur = 0.55; r.radius = radius;
      r.mesh.position.copy(pos); r.mesh.position.y = Math.max(0.06, pos.y * 0.2 + 0.06);
      r.mesh.visible = true;
      if (color != null) r.mesh.material.color.setHex(color);
    }
    update(dt) {
      for (const r of this.pool) {
        if (r.t >= r.dur) { if (r.mesh.visible) r.mesh.visible = false; continue; }
        r.t += dt;
        const k = Math.min(1, r.t / r.dur);
        const e = 1 - Math.pow(1 - k, 3);
        r.mesh.scale.setScalar(Math.max(0.01, e * r.radius));
        r.mesh.material.opacity = 0.85 * (1 - k);
      }
    }
  }

  // ---------- manager ----------
  const fx = {
    init(scene, camera) {
      this.scene = scene; this.camera = camera;
      this.add = new ParticlePool(scene, 1500, THREE.AdditiveBlending);
      this.smoke = new ParticlePool(scene, 450, THREE.NormalBlending);
      this.debris = new DebrisPool(scene);
      this.rings = new Rings(scene);
      this.flash = new THREE.PointLight(0xffc27d, 0, 60, 2);
      scene.add(this.flash);
      this.trauma = 0;
      this.shakeOff = new THREE.Vector3();
    },
    spark(p, n, speed, spread, r, g, b, grav) {
      for (let i = 0; i < n; i++) {
        const th = Math.random() * Math.PI * 2, ph = (Math.random() - .5) * Math.PI * (spread == null ? 1 : spread);
        const s = (speed || 6) * (0.35 + Math.random());
        this.add.spawn(
          p.x, p.y, p.z,
          Math.cos(th) * Math.cos(ph) * s, Math.sin(ph) * s + (speed || 6) * 0.28, Math.sin(th) * Math.cos(ph) * s,
          0.35 + Math.random() * 0.5, 0.16 + Math.random() * 0.22,
          r, g, b, 1, grav == null ? -10 : grav, 2.2, -0.12
        );
      }
    },
    dust(p, n, scale, tint) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random()) * (scale || 1);
        this.smoke.spawn(
          p.x + (Math.random() - .5) * .6, p.y + Math.random() * .3, p.z + (Math.random() - .5) * .6,
          Math.cos(a) * s, 0.7 + Math.random() * 1.4, Math.sin(a) * s,
          0.9 + Math.random() * 1.1, 0.85 + Math.random() * 0.9,
          tint ? tint[0] : 0.62, tint ? tint[1] : 0.56, tint ? tint[2] : 0.44,
          0.34, -0.6, 1.8, 1.15
        );
      }
    },
    impact(p, strength, soundType) {
      // small dust/spark puff on hard impacts
      if (strength > 0.45) this.spark(p, Math.floor(3 + strength * 6), 4 + strength * 5, null, 1, 0.82, 0.5);
      this.dust(p, Math.floor(strength * 5), 0.8);
    },
    explosion(p, power) {
      // fireball
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, ph = Math.acos(u);
        const s = (4 + Math.random() * 13) * (power / 26);
        this.add.spawn(
          p.x, p.y + 0.2, p.z,
          Math.sin(ph) * Math.cos(a) * s, Math.cos(ph) * s * 0.8 + 3, Math.sin(ph) * Math.sin(a) * s,
          0.3 + Math.random() * 0.55, 0.9 + Math.random() * 1.6,
          1, 0.55 + Math.random() * 0.35, 0.12, 0.95, -2, 2.6, 0.6
        );
      }
      // sparks streaks
      this.spark(p, 46, 17, null, 1, 0.88, 0.45, -14);
      // smoke column
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3.4;
        this.smoke.spawn(
          p.x + (Math.random() - .5), p.y + 0.3 + Math.random(), p.z + (Math.random() - .5),
          Math.cos(a) * s, 2.2 + Math.random() * 3.6, Math.sin(a) * s,
          1.6 + Math.random() * 1.8, 1.3 + Math.random() * 1.7,
          0.16, 0.15, 0.15, 0.42, -0.4, 1.2, 1.7
        );
      }
      this.debris.burst(p, 12, 'wood');
      this.rings.fire(p, (power / 26) * 8.5, 0xffcf8f);
      this.flash.position.copy(p); this.flash.position.y += 1.2;
      this.flash.intensity = 9 * (power / 26);
      const camDist = this.camera ? this.camera.position.distanceTo(p) : 20;
      SB.Audio.boom(Math.min(1, 16 / Math.max(6, camDist)));
      this.shake(Math.min(1, (power / 26) * 14 / Math.max(6, camDist)));
    },
    shatterFX(p) {
      this.spark(p, 24, 8, null, 0.75, 0.92, 1, -12);
      this.debris.burst(p, 9, 'ice');
      SB.Audio.shatter();
    },
    shake(amount) { this.trauma = Math.min(1, this.trauma + amount); },
    update(dt) {
      this.add.update(dt);
      this.smoke.update(dt);
      this.debris.update(dt);
      this.rings.update(dt);
      this.flash.intensity *= Math.exp(-9 * dt);
      if (this.flash.intensity < 0.02) this.flash.intensity = 0;
      this.trauma = Math.max(0, this.trauma - 1.7 * dt);
      const t2 = this.trauma * this.trauma;
      const time = performance.now() * 0.001;
      this.shakeOff.set(
        t2 * 0.42 * Math.sin(time * 47.3 + 1.7),
        t2 * 0.36 * Math.sin(time * 39.7),
        t2 * 0.42 * Math.cos(time * 43.1)
      );
    },
  };
  return fx;
})();
