import * as THREE from 'three';
import { S } from './state.js';
import { clamp } from './utils.js';

const MAX_P = 2200;
let particles = null;
let pPos, pCol, pSize, pVel, pLife, pMaxLife, pGrav, pCount;
let tracers = [];
let rings = [];
let shakeAmt = 0;
let sceneRef = null;

export function initFX(scene) {
  sceneRef = scene;
  const geo = new THREE.BufferGeometry();
  pPos = new Float32Array(MAX_P * 3);
  pCol = new Float32Array(MAX_P * 3);
  pSize = new Float32Array(MAX_P);
  pVel = new Float32Array(MAX_P * 3);
  pLife = new Float32Array(MAX_P);
  pMaxLife = new Float32Array(MAX_P);
  pGrav = new Float32Array(MAX_P);
  for (let i = 0; i < MAX_P; i++) pPos[i * 3 + 1] = -9999;
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * (240.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if(d > 0.5) discard;
        float a = smoothstep(0.5, 0.12, d);
        gl_FragColor = vec4(vColor, a);
      }`,
    vertexColors: true,
  });
  particles = new THREE.Points(geo, mat);
  particles.frustumCulled = false;
  scene.add(particles);
  pCount = 0;

  const trGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
  trGeo.translate(0, 0, -0.5);
  const trMat = new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(trGeo, trMat.clone());
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }

  const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    rings.push({ mesh: m, life: 0, speed: 1 });
  }
}

export function spawnParticles(pos, opts) {
  if (!particles) return;
  const count = opts.count || 10;
  const col = new THREE.Color(opts.color || 0xffffff);
  for (let n = 0; n < count; n++) {
    let idx = -1;
    if (pCount < MAX_P) idx = pCount++;
    else idx = Math.floor(Math.random() * MAX_P);
    const spread = opts.spread ?? 1;
    const speed = (opts.speed ?? 4) * (0.5 + Math.random());
    pVel[idx * 3] = (Math.random() - 0.5) * spread * speed;
    pVel[idx * 3 + 1] = (Math.random() * 0.7 + 0.15) * speed * (opts.upBias ?? 1);
    pVel[idx * 3 + 2] = (Math.random() - 0.5) * spread * speed;
    pPos[idx * 3] = pos.x + (Math.random() - 0.5) * (opts.radius ?? 0.2);
    pPos[idx * 3 + 1] = pos.y + (Math.random() - 0.5) * (opts.radius ?? 0.2);
    pPos[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * (opts.radius ?? 0.2);
    const cvar = opts.colorVar ?? 0.15;
    pCol[idx * 3] = clamp(col.r + (Math.random() - 0.5) * cvar, 0, 1);
    pCol[idx * 3 + 1] = clamp(col.g + (Math.random() - 0.5) * cvar, 0, 1);
    pCol[idx * 3 + 2] = clamp(col.b + (Math.random() - 0.5) * cvar, 0, 1);
    pSize[idx] = (opts.size ?? 0.5) * (0.6 + Math.random() * 0.8);
    pMaxLife[idx] = (opts.life ?? 0.7) * (0.7 + Math.random() * 0.6);
    pLife[idx] = pMaxLife[idx];
    pGrav[idx] = opts.gravity ?? 8;
  }
}

export function tracer(from, to, color = 0xffe9a3) {
  let best = null;
  for (const t of tracers) if (t.life <= 0) { best = t; break; }
  if (!best) best = tracers[0];
  const m = best.mesh;
  m.material.color.setHex(color);
  const len = from.distanceTo(to);
  m.position.copy(from);
  m.lookAt(to);
  m.scale.set(1, 1, len);
  m.visible = true;
  best.life = 0.09;
}

export function explosion(pos, radius) {
  spawnParticles(pos, { count: 42, color: 0xffa63f, speed: 16, spread: 1.6, life: 0.8, size: 1.4, gravity: 6, radius: radius * 0.25 });
  spawnParticles(pos, { count: 26, color: 0x555555, speed: 8, spread: 1.4, life: 1.4, size: 2.2, gravity: 2 });
  spawnParticles(pos, { count: 14, color: 0xfff3c0, speed: 22, spread: 1.2, life: 0.35, size: 1.1, gravity: 0 });
  let ring = null;
  for (const r of rings) if (r.life <= 0) { ring = r; break; }
  if (ring) {
    ring.mesh.position.set(pos.x, pos.y + 0.3, pos.z);
    ring.mesh.scale.setScalar(1);
    ring.mesh.visible = true;
    ring.life = 0.45;
    ring.speed = radius / 0.45;
  }
  shake(Math.max(0.15, 0.5 - cameraDist(pos) / 120));
}

function cameraDist(pos) {
  return pos.distanceTo(S.camera ? S.camera.position : pos);
}

export function muzzle(pos) {
  spawnParticles(pos, { count: 5, color: 0xffd76a, speed: 7, spread: 0.7, life: 0.08, size: 0.7, gravity: 0 });
}
export function impact(pos, color = 0xd8c9a8) {
  spawnParticles(pos, { count: 7, color, speed: 5, spread: 1.2, life: 0.4, size: 0.35 });
}
export function debris(pos, color = 0xa97b50) {
  spawnParticles(pos, { count: 18, color, speed: 7, spread: 1.4, life: 0.9, size: 0.7, upBias: 1.4 });
}
export function bloodPuff(pos) {
  spawnParticles(pos, { count: 8, color: 0x7fd4ff, speed: 4, spread: 1.2, life: 0.35, size: 0.4 });
}

export function shake(amount) {
  shakeAmt = Math.min(shakeAmt + amount, 0.9);
}

const _dir = new THREE.Vector3();
export function updateFX(dt) {
  if (!particles) return;
  for (let i = 0; i < pCount; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) {
      pPos[i * 3 + 1] = -9999;
      continue;
    }
    pVel[i * 3 + 1] -= pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    const t = pLife[i] / pMaxLife[i];
    pSize[i] = Math.max(0.02, pSize[i] * (t > 0.5 ? 1 : 0.94));
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.size.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;

  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }
  for (const r of rings) {
    if (r.life > 0) {
      r.life -= dt;
      r.mesh.scale.addScalar(r.speed * dt);
      r.mesh.material.opacity = Math.max(0, r.life / 0.45) * 0.7;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
  if (shakeAmt > 0 && S.camera) {
    shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
    _dir.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(shakeAmt * 0.25);
    S.camera.position.add(_dir);
  }
}
