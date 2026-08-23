// Particles: block-break puffs, torch embers, rain/snow, splash. Pooled points.
'use strict';
(function () {
const PART_VERT = `
attribute vec3 color;
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const PART_FRAG = `
precision highp float;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(vColor, 1.0);
}`;

class ParticleSystem {
  constructor(scene, max) {
    this.max = max || 900;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.gravity = new Float32Array(this.max);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }

  spawn(x, y, z, vx, vy, vz, r, g2, b, lifeSec, sizePx, grav) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g2; this.col[i * 3 + 2] = b;
    this.life[i] = lifeSec;
    this.size[i] = sizePx;
    this.gravity[i] = grav === undefined ? 9 : grav;
  }

  burstBlock(x, y, z, rgb) {
    for (let i = 0; i < 14; i++) {
      this.spawn(
        x + Math.random() - 0.5, y + Math.random() - 0.5, z + Math.random() - 0.5,
        (Math.random() - 0.5) * 2.4, Math.random() * 3.2, (Math.random() - 0.5) * 2.4,
        rgb[0] * (0.8 + Math.random() * 0.4), rgb[1] * (0.8 + Math.random() * 0.4), rgb[2] * (0.8 + Math.random() * 0.4),
        0.5 + Math.random() * 0.5, 5 + Math.random() * 4, 11);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { ParticleSystem };
if (typeof self !== 'undefined') self.PARTICLES_MOD = { ParticleSystem };
})();
