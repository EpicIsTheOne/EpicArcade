// Particles: pooled point-sprite system for block debris, weather, splashes.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { avgColor } from './atlas.js';

const MAX = 4000;

const VERT = /* glsl */`
attribute float size;
attribute vec4 pcolor; // rgb + alpha
varying vec4 vColor;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */`
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.28, length(d));
  if (m <= 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * m);
}
`;

export class Particles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.life = new Float32Array(MAX);   // remaining
    this.ttl = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.head = 0;

    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('pcolor', this.colAttr);
    g.setAttribute('size', this.sizeAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.userData.noShadow = true;
    scene.add(this.points);

    this.rainAccum = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g2, b, size, ttl, gravity = 22, alpha = 1) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g2; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = alpha;
    this.size[i] = size;
    this.life[i] = ttl; this.ttl[i] = ttl;
    this.grav[i] = gravity;
  }

  burst(x, y, z, rgb, count, spread = 2, speedMul = 1) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * spread * 0.6,
        y + (Math.random() - 0.5) * spread * 0.6,
        z + (Math.random() - 0.5) * spread * 0.6,
        (Math.random() - 0.5) * 3.2 * speedMul,
        Math.random() * 3.6 * speedMul,
        (Math.random() - 0.5) * 3.2 * speedMul,
        rgb[0] * (0.8 + Math.random() * 0.35),
        rgb[1] * (0.8 + Math.random() * 0.35),
        rgb[2] * (0.8 + Math.random() * 0.35),
        0.09 + Math.random() * 0.08,
        0.45 + Math.random() * 0.5);
    }
  }

  blockBreakFx(x, y, z, id) {
    const bd = BLOCKS[id];
    const tile = bd.tileSide ?? bd.tile ?? 'stone';
    const c = avgColor(tile);
    this.burst(x + 0.5, y + 0.5, z + 0.5, c, 16, 1.6);
  }

  splash(x, y, z) {
    for (let i = 0; i < 12; i++) {
      this.spawn(x + (Math.random() - .5) * 0.7, y, z + (Math.random() - .5) * 0.7,
        (Math.random() - .5) * 2, 2.5 + Math.random() * 2, (Math.random() - .5) * 2,
        0.55, 0.75, 0.95, 0.07 + Math.random() * 0.06, 0.4 + Math.random() * 0.25, 20);
    }
  }

  smokePuff(x, y, z) {
    for (let i = 0; i < 4; i++) {
      this.spawn(x + (Math.random() - .5) * 0.2, y, z + (Math.random() - .5) * 0.2,
        (Math.random() - .5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - .5) * 0.3,
        0.25, 0.25, 0.27, 0.12 + Math.random() * 0.1, 0.9 + Math.random(), -0.6, 0.42);
    }
  }

  critFx(x, y, z) {
    for (let i = 0; i < 6; i++) {
      this.spawn(x, y, z, (Math.random() - .5) * 3, Math.random() * 3, (Math.random() - .5) * 3,
        1, 0.85, 0.3, 0.08, 0.3, 14);
    }
  }

  update(dt, playerPos, rainF, snowMode) {
    // integrate
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      const k = this.grav[i];
      this.vel[i * 3 + 1] -= k * dt;
      this.vel[i * 3] *= Math.pow(0.5, dt * 1.2);
      this.vel[i * 3 + 2] *= Math.pow(0.5, dt * 1.2);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.ttl[i];
      this.col[i * 4 + 3] = Math.min(1, f * 1.6);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;

    // weather precipitation around the player
    if ((rainF > 0.05 || snowMode) && playerPos) {
      const mode = snowMode ? 'snow' : 'rain';
      const rate = mode === 'rain' ? rainF * 140 : rainF * 46;
      this.rainAccum += rate * dt;
      const n = Math.min(40, this.rainAccum | 0);
      this.rainAccum -= n;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 13;
        const x = playerPos.x + Math.cos(ang) * r;
        const z = playerPos.z + Math.sin(ang) * r;
        const topY = this.world.surfaceY(Math.floor(x), Math.floor(z)) + 9 + Math.random() * 4;
        if (mode === 'rain') {
          this.spawn(x, topY, z, 0.4, -21 - Math.random() * 4, 0.3, 0.62, 0.72, 0.92, 0.10, 1.4, 0, 0.5);
        } else {
          this.spawn(x, topY, z, (Math.random() - .5), -1.6 - Math.random(), (Math.random() - .5),
            0.95, 0.97, 1.0, 0.11 + Math.random() * 0.05, 5.5, -0.25, 0.85);
        }
      }
    }
  }
}
