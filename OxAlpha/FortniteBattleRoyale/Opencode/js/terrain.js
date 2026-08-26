import * as THREE from 'three';
import { CFG } from './config.js';
import { makeNoise2D, makeFbm, mulberry32, clamp, lerp, smoothstep } from './utils.js';

export const POIS = [
  { name: 'Driftwood Docks', x: -250, z: 210, r: 62, h: 2.2, palette: 'dock' },
  { name: 'Emberfall', x: 20, z: 30, r: 78, h: 14, palette: 'village' },
  { name: 'Rustyard', x: 235, z: -180, r: 70, h: 18, palette: 'industrial' },
  { name: 'Thornwick Hollow', x: -230, z: -140, r: 58, h: 22, palette: 'forest' },
  { name: 'Sundisk Ruins', x: 250, z: 170, r: 55, h: 34, palette: 'ruins' },
  { name: 'Larkspur Heights', x: -60, z: -260, r: 62, h: 46, palette: 'manor' },
  { name: 'Meltwater Creek', x: 150, z: 265, r: 52, h: 8, palette: 'creek' },
  { name: 'Crater Camps', x: -95, z: 130, r: 48, h: 11, palette: 'crater' },
];

const LINKS = [[0, 1], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [2, 5], [3, 5], [6, 4]];

const noise = makeNoise2D(CFG.SEED);
const fbm = makeFbm(noise);
const ridgeNoise = makeNoise2D(CFG.SEED + 777);
const roadNoise = new Set();

function poiInfluence(x, z) {
  let best = null;
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 26) {
      const w = 1 - smoothstep(p.r * 0.45, p.r + 26, d);
      if (!best || w > best.w) best = { w, h: p.h };
    }
  }
  return best;
}

function nearRoad(x, z) {
  for (const [a, b] of LINKS) {
    const pa = POIS[a], pb = POIS[b];
    const dx = pb.x - pa.x, dz = pb.z - pa.z;
    const len2 = dx * dx + dz * dz;
    let t = ((x - pa.x) * dx + (z - pa.z) * dz) / len2;
    t = clamp(t, 0.06, 0.94);
    const px = pa.x + dx * t, pz = pa.z + dz * t;
    const wob = Math.sin(t * 9 + pa.x) * 12;
    const perpX = -dz / Math.sqrt(len2), perpZ = dx / Math.sqrt(len2);
    const qx = px + perpX * wob, qz = pz + perpZ * wob;
    const d = Math.hypot(x - qx, z - qz);
    if (d < 5.5) return 1 - smoothstep(3.2, 5.5, d);
  }
  return 0;
}

export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const falloff = 1 - smoothstep(CFG.ISLAND_R * 0.72, CFG.ISLAND_R * 1.06, d);
  let h = fbm(x * 0.004 + 100, z * 0.004 - 60, 5) * 2;
  const base = h;
  const ridged = 1 - Math.abs(ridgeNoise(x * 0.006, z * 0.006));
  let mount = Math.pow(clamp(ridged, 0, 1), 2.2) * 74 * smoothstep(0.25, 0.75, base * 0.5 + 0.5);
  mount *= smoothstep(120, 330, d) * 0.85 + 0.15;
  h = base * 16 + mount;
  h += fbm(x * 0.02, z * 0.02, 3) * 4.5;
  const pi = poiInfluence(x, z);
  if (pi) h = lerp(h, pi.h, Math.min(pi.w * 1.35, 1));
  h = h * falloff - (1 - falloff) * 14;
  return h;
}

export function slopeAt(x, z) {
  const e = 1.2;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

export function colorForHeight(h, slope, x, z) {
  let c;
  if (h < -1.5) c = [0.42, 0.44, 0.38];
  else if (h < 1.6) c = [0.83, 0.76, 0.55];
  else if (h < 3.2) c = [0.88, 0.81, 0.6];
  else {
    const g = clamp((h - 3.2) / 10, 0, 1);
    c = [lerp(0.62, 0.36, g), lerp(0.74, 0.56, g), lerp(0.38, 0.28, g)];
    const v = fbm(x * 0.03, z * 0.03, 2) * 0.08;
    c[0] += v; c[1] += v; c[2] += v;
  }
  if (slope > 0.65 && h > 3) {
    const t = smoothstep(0.65, 1.1, slope);
    c = [lerp(c[0], 0.48, t), lerp(c[1], 0.44, t), lerp(c[2], 0.42, t)];
  }
  if (h > 58) {
    const t = smoothstep(58, 68, h);
    c = [lerp(c[0], 0.92, t), lerp(c[1], 0.93, t), lerp(c[2], 0.96, t)];
  }
  const rd = nearRoad(x, z);
  if (rd > 0 && h > 1.8) {
    c = [lerp(c[0], 0.45, rd * 0.85), lerp(c[1], 0.39, rd * 0.85), lerp(c[2], 0.31, rd * 0.85)];
  }
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 0.8) {
      const w = (1 - smoothstep(p.r * 0.35, p.r * 0.8, d)) * 0.5;
      c = [lerp(c[0], 0.55, w), lerp(c[1], 0.47, w), lerp(c[2], 0.36, w)];
    }
  }
  return c;
}

let mapCanvas = null;

export function buildTerrain(scene) {
  const size = CFG.WORLD_SIZE;
  const segs = 200;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - nrm.getY(i);
    const c = colorForHeight(h, slope * 2.4, x, z);
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);

  const waterGeo = new THREE.PlaneGeometry(size * 1.6, size * 1.6, 64, 64);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x1a5e93) }, uShallow: { value: new THREE.Color(0x49b8d8) } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying float vWave;
      void main(){
        vec3 p = position;
        float w = sin(p.x*0.08 + uTime*1.4)*0.22 + cos(p.y*0.07 - uTime*1.1)*0.18;
        p.z += w;
        vWave = w;
        vec4 wp = modelMatrix * vec4(p,1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uDeep; uniform vec3 uShallow;
      varying vec3 vPos; varying float vWave;
      void main(){
        float m = clamp(vPos.z*0.0016+0.5, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, m);
        col += vWave*0.14;
        float dist = length(vPos - cameraPosition);
        float fogF = 1.0 - exp(-dist*0.0016);
        col = mix(col, vec3(0.81,0.89,0.96), fogF);
        gl_FragColor = vec4(col, 0.86);
      }`,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = CFG.WATER_Y;
  water.renderOrder = 2;
  scene.add(water);

  buildSky(scene);
  bakeMinimap();
  return { mesh, water };
}

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(1600, 24, 16);
  const sunDir = new THREE.Vector3(0.45, 0.62, 0.34).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(CFG.COLORS.sky_top) },
      uHorizon: { value: new THREE.Color(CFG.COLORS.sky_horizon) },
      uSunDir: { value: sunDir },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir;
      varying vec3 vDir;
      void main(){
        float t = clamp(vDir.y*1.4+0.12, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(t,0.8));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += vec3(1.0,0.92,0.72) * pow(s, 320.0) * 1.4;
        col += vec3(1.0,0.85,0.6) * pow(s, 8.0) * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const sun = new THREE.DirectionalLight(CFG.COLORS.sun, 2.6);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  scene.userData.sun = sun;

  const hemi = new THREE.HemisphereLight(0xbdd8f0, 0x5e6a4f, 0.85);
  scene.add(hemi);

  const rng = mulberry32(CFG.SEED + 5);
  const cloudTex = makeCloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const m = cloudTex.clone();
    m.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: m, transparent: true, opacity: 0.55 + rng() * 0.3, depthWrite: false });
    const s = 90 + rng() * 190;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.5), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(rand(rng, -900, 900), 165 + rng() * 90, rand(rng, -900, 900));
    mesh.renderOrder = 5;
    mesh.userData.speed = 1.5 + rng() * 2;
    clouds.add(mesh);
  }
  scene.add(clouds);
  scene.userData.clouds = clouds;
  scene.userData.sunDir = sunDir;
}

function rand(rng, a, b) { return a + rng() * (b - a); }

function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const x = 24 + Math.random() * 80;
    const y = 44 + Math.random() * 40;
    const r = 12 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function updateEnvironment(scene, dt, playerPos) {
  const sun = scene.userData.sun;
  if (sun) {
    sun.target.position.set(playerPos.x, 0, playerPos.z);
    sun.position.set(playerPos.x, 0, playerPos.z).add(scene.userData.sunDir.clone().multiplyScalar(320));
  }
  const clouds = scene.userData.clouds;
  if (clouds) {
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 950) c.position.x = -950;
    }
  }
  const water = scene.children.find(o => o.material && o.material.uniforms?.uTime);
  if (water) water.material.uniforms.uTime.value += dt;
}

export function getMapCanvas() {
  if (!mapCanvas) bakeMinimap();
  return mapCanvas;
}

function bakeMinimap() {
  const N = 256;
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = N;
  const ctx = mapCanvas.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px / N - 0.5) * CFG.WORLD_SIZE;
      const z = (py / N - 0.5) * CFG.WORLD_SIZE;
      const h = heightAt(x, z);
      let r, g, b;
      if (h < 0.05) { r = 32; g = 84; b = 128; }
      else {
        const slope = slopeAt(x, z);
        const c = colorForHeight(h, slope * 2.4, x, z);
        r = c[0] * 255; g = c[1] * 255; b = c[2] * 255;
      }
      const idx = (py * N + px) * 4;
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
