import * as THREE from 'three';
import { clamp, lerp, fbm2, makeRng } from '../mathutil.js';
import { texGrass, texSand, texRock, texWood, texMetal, texAsphalt, texNeonGrid } from '../../engine/textures.js';

const UP = new THREE.Vector3(0, 1, 0);

// Sky dome shader
const SKY_VERT = /* glsl */`
varying vec3 vWorld;
void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uMid, uBot, uSunDir, uSunCol;
uniform float uStars;
varying vec3 vWorld;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
void main(){
  vec3 d = normalize(vWorld);
  float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
  vec3 col = mix(uBot, uMid, smoothstep(0.42, 0.55, h));
  col = mix(col, uTop, smoothstep(0.55, 0.95, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(sd, 600.0)*1.4 + pow(sd, 24.0)*0.28 + pow(sd, 5.0)*0.10);
  if(uStars > 0.01 && d.y > 0.02){
    vec3 cell = floor(d*220.0);
    float s = step(0.9985 - uStars*0.001, hash(cell));
    col += vec3(s) * uStars * (0.5+0.5*sin(hash(cell.zyx)*60.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const THEMES = {
  coast: {
    sky: { top: 0x1f6fd0, mid: 0x7fd0f0, bot: 0xffe9c4, sun: 0xfff2d8, stars: 0 },
    sunDir: new THREE.Vector3(-0.45, -0.75, -0.35),
    sunIntensity: 3.4,
    hemi: [0xbfe4ff, 0x5f7d64, 0.9],
    fog: { color: 0xaedcee, density: 0.0013 },
    exposure: 1.05,
  },
  city: {
    sky: { top: 0x070418, mid: 0x271257, bot: 0x58217e, sun: 0x9fb8ff, stars: 1 },
    sunDir: new THREE.Vector3(0.4, -0.65, 0.45),
    sunIntensity: 0.85,
    hemi: [0x4a3f8f, 0x1a1030, 0.75],
    fog: { color: 0x160b31, density: 0.0032 },
    exposure: 1.15,
  },
  foundry: {
    sky: { top: 0x1c0806, mid: 0x591a0c, bot: 0xd4581c, sun: 0xffb060, stars: 0.25 },
    sunDir: new THREE.Vector3(0.3, -0.7, -0.4),
    sunIntensity: 1.5,
    hemi: [0x66402a, 0x2a1008, 0.7],
    fog: { color: 0x36140a, density: 0.0038 },
    exposure: 1.12,
  },
};

export class LevelKit {
  constructor(scene, world, game, themeName, seed = 1234) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.themeName = themeName;
    this.th = THEMES[themeName];
    this.rng = makeRng(seed);
    this._matCache = new Map();
    this.applyTheme();
  }

  applyTheme() {
    const th = this.th;
    // sky
    if (!this.game.skyDome) {
      const geo = new THREE.SphereGeometry(1900, 32, 18);
      const mat = new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        uniforms: {
          uTop: { value: new THREE.Color(th.sky.top) }, uMid: { value: new THREE.Color(th.sky.mid) },
          uBot: { value: new THREE.Color(th.sky.bot) }, uSunDir: { value: th.sunDir.clone().negate() },
          uSunCol: { value: new THREE.Color(th.sky.sun) }, uStars: { value: th.sky.stars },
        },
        side: THREE.BackSide, depthWrite: false, fog: false,
      });
      this.game.skyDome = new THREE.Mesh(geo, mat);
      this.game.skyDome.frustumCulled = false;
      this.scene.add(this.game.skyDome);
    }
    const g = this.game;
    g.sunDir.copy(this.th.sunDir).negate();
    g.gfx.sun.intensity = th.sunIntensity;
    g.gfx.sun.color.set(this.themeName === 'coast' ? 0xfff4dd : this.themeName === 'city' ? 0xcdd8ff : 0xffb37a);
    g.gfx.hemi.color.set(th.hemi[0]); g.gfx.hemi.groundColor.set(th.hemi[1]); g.gfx.hemi.intensity = th.hemi[2];
    g.gfx.renderer.toneMappingExposure = th.exposure;
    g.fogColor = th.fog.color;
    g.scene.fog = new THREE.FogExp2(th.fog.color, th.fog.density);
    g.gfx.speedFx.uniforms.uIntensity.value = 0;
  }

  // ---------- materials ----------
  stdMat({ color = 0xffffff, tex = null, repeat = 1, rough = 0.8, metal = 0.0, emissive = 0, ei = 1, vertexColors = false }) {
    let map = null;
    if (tex) {
      map = tex.clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeat, repeat);
    }
    return new THREE.MeshStandardMaterial({
      color, map, roughness: rough, metalness: metal,
      emissive: emissive, emissiveIntensity: ei, vertexColors,
    });
  }

  mats() {
    if (this._mats) return this._mats;
    switch (this.themeName) {
      case 'coast':
        this._mats = {
          ground: this.stdMat({ tex: texGrass(), repeat: 90, vertexColors: true, rough: 0.9 }),
          sand: this.stdMat({ tex: texSand(), repeat: 40, rough: 0.95 }),
          rock: this.stdMat({ tex: texRock(), repeat: 22, rough: 0.95 }),
          wood: this.stdMat({ tex: texWood(), repeat: 2, rough: 0.85 }),
          stone: this.stdMat({ color: 0xcfc3a8, tex: texRock(), repeat: 8, rough: 0.9 }),
          accent: this.stdMat({ color: 0x19e6ff, emissive: 0x19b8ff, ei: 0.9, rough: 0.3 }),
        };
        break;
      case 'city':
        this._mats = {
          ground: this.stdMat({ tex: texAsphalt(), repeat: 60, rough: 0.85, vertexColors: true }),
          rock: this.stdMat({ color: 0x232a44, tex: texAsphalt(), repeat: 20, rough: 0.8 }),
          wood: this.stdMat({ tex: texMetal([110, 118, 138]), repeat: 2, rough: 0.5, metal: 0.6 }),
          stone: this.stdMat({ color: 0x39435e, tex: texMetal([96, 104, 126]), repeat: 6, rough: 0.5, metal: 0.5 }),
          accent: this.stdMat({ color: 0xff2fb4, emissive: 0xff2fb4, ei: 1.4, rough: 0.3 }),
          accent2: this.stdMat({ color: 0x19e6ff, emissive: 0x19e6ff, ei: 1.4, rough: 0.3 }),
          building: this.makeBuildingMat(),
        };
        break;
      default:
        this._mats = {
          ground: this.stdMat({ tex: texRock(), repeat: 50, rough: 0.9, vertexColors: true }),
          sand: this.stdMat({ tex: texMetal([120, 84, 60]), repeat: 30, rough: 0.7, metal: 0.4 }),
          rock: this.stdMat({ tex: texRock(), repeat: 20, rough: 0.95 }),
          wood: this.stdMat({ tex: texMetal([130, 96, 62]), repeat: 2, rough: 0.55, metal: 0.5 }),
          stone: this.stdMat({ color: 0x5a4638, tex: texMetal([120, 88, 64]), repeat: 6, rough: 0.6, metal: 0.4 }),
          accent: this.stdMat({ color: 0xff8a1a, emissive: 0xff6a00, ei: 1.2, rough: 0.4 }),
        };
    }
    return this._mats;
  }

  makeBuildingMat() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#141a2e'; g.fillRect(0, 0, 128, 128);
    const cols = ['#ffd94a', '#19e6ff', '#ff2fb4', '#8affc1', '#ffffff'];
    for (let y = 4; y < 124; y += 10) {
      for (let x = 4; x < 124; x += 10) {
        if (Math.random() < 0.55) continue;
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.globalAlpha = 0.35 + Math.random() * 0.65;
        g.fillRect(x, y, 6, 7);
      }
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.6 });
    return m;
  }

  // ---------- terrain ----------
  // heightFn(x,z) -> y ; colorFn(y, slope01) -> THREE.Color | null
  terrain(sizeW, sizeD, resX, resZ, heightFn, mat, colorFn = null) {
    const geo = new THREE.PlaneGeometry(sizeW, sizeD, resX, resZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = colorFn ? new Float32Array(pos.count * 3) : null;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightFn(x, z);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    if (colorFn) {
      const nrm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const slope = 1 - clamp(nrm.getY(i), 0, 1);
        const c = colorFn(pos.getY(i), slope, pos.getX(i), pos.getZ(i)) || new THREE.Color(1, 1, 1);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.world.addStatic(mesh);
    return mesh;
  }

  // ---------- primitives ----------
  box(w, h, d, pos, rotY = 0, mat = null, { collide = true, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || this.mats().stone);
    m.position.set(pos.x, pos.y + h / 2, pos.z);
    m.rotation.y = rotY;
    m.castShadow = shadow; m.receiveShadow = true;
    this.scene.add(m);
    if (collide) this.world.addStatic(m);
    return m;
  }
  cyl(rTop, rBot, h, pos, mat = null, seg = 18, collide = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat || this.mats().rock);
    m.position.set(pos.x, pos.y + h / 2, pos.z);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    if (collide) this.world.addStatic(m);
    return m;
  }
  platform(w, d, pos, { h = 1, mat = null, rotY = 0 } = {}) {
    return this.box(w, h, d, { x: pos.x, y: pos.y - h / 2, z: pos.z }, rotY, mat);
  }

  // Half-pipe channel swept along points. crossR radius, arc from a0..a1 (rad, 0=up)
  channel(points, crossR = 3, width = 6, mat = null, a0 = Math.PI * 0.15, a1 = Math.PI * 0.85, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.3);
    const N = Math.max(16, Math.floor(curve.getLength() / 1.2));
    const S = 10; // cross-section resolution
    const positions = [], normals = [], indices = [], uvs = [];
    const up = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      let refUp = up.set(0, 1, 0);
      // frame
      const side = new THREE.Vector3().crossVectors(refUp, tan).normalize();
      const realUp = new THREE.Vector3().crossVectors(tan, side).normalize();
      for (let j = 0; j <= S; j++) {
        const a = lerp(a0, a1, j / S);
        // local offset: angle measured from vertical
        const off = new THREE.Vector3()
          .addScaledVector(side, Math.sin(a) * crossR)
          .addScaledVector(realUp, Math.cos(a) * crossR);
        positions.push(p.x + off.x, p.y + off.y, p.z + off.z);
        normals.push(off.x, off.y, off.z);
        uvs.push(t * curve.getLength() / 4, j / S * 2);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < S; j++) {
        const a = i * (S + 1) + j, b = a + S + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat || this.mats().rock);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.world.addStatic(mesh);
    return mesh;
  }

  // Vertical loop-the-loop. `entry` is the bottom point, heading direction yaw.
  // Returns the center point.
  loop(entry, yaw, radius = 8, width = 5, mat = null) {
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(dir.z, 0, -dir.x); // right of travel
    const center = new THREE.Vector3(entry.x, entry.y + radius, entry.z);
    const pts = [];
    const SEG = 44;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // offset = dir*sin(a)*R + up*(-cos(a)*R) : starts at bottom, tangent = +dir
      // (no duplicate endpoint — curve is closed)
      pts.push(
        center.clone()
          .addScaledVector(dir, Math.sin(a) * radius)
          .addScaledVector(UP, -Math.cos(a) * radius)
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const N = 72, S = 8;
    const positions = [], normals = [], indices = [], uvs = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t % 1);
      const tan = curve.getTangentAt(t % 1).normalize();
      // width axis is `side` throughout (loop plane = dir/up)
      const sideO = side;
      const realUp = new THREE.Vector3().crossVectors(tan, sideO).normalize();
      for (let j = 0; j <= S; j++) {
        const w = lerp(-width / 2, width / 2, j / S);
        const off = sideO.clone().multiplyScalar(w);
        positions.push(p.x + off.x, p.y + off.y, p.z + off.z);
        normals.push(realUp.x, realUp.y, realUp.z);
        uvs.push(t * 30, j);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < S; j++) {
        const a = i * (S + 1) + j, b = a + S + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat || this.mats().stone);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.world.addStatic(mesh);
    // decorative ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.7, 0.35, 10, 60), this.mats().accent);
    ring.position.copy(center);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    this.scene.add(ring);
    return center;
  }

  // ---------- decor ----------
  scatterTrees(region, count, scaleRange = [0.8, 1.6]) {
    // stylized low-poly trees, instanced
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 7);
    const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3fae5c, roughness: 0.85, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    trunks.castShadow = leaves.castShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 8) {
      const x = region.x + (this.rng() - 0.5) * region.w;
      const z = region.z + (this.rng() - 0.5) * region.d;
      const y = region.hFn ? region.hFn(x, z) : region.y ?? 0;
      if (region.valid && !region.valid(x, y, z)) continue;
      const s = lerp(scaleRange[0], scaleRange[1], this.rng());
      dummy.position.set(x, y + 1.2 * s, z);
      dummy.scale.setScalar(s);
      dummy.rotation.y = this.rng() * 6.28;
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      dummy.position.y = y + (2.4 + 0.8) * s;
      dummy.updateMatrix();
      leaves.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    trunks.count = leaves.count = placed;
    this.scene.add(trunks, leaves);
  }

  scatterBuildings(region, count, opts = {}) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = this.mats().building;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = opts.shadow !== false;
    const dummy = new THREE.Object3D();
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 6) {
      const x = region.x + (this.rng() - 0.5) * region.w;
      const z = region.z + (this.rng() - 0.5) * region.d;
      if (region.avoid && region.avoid(x, z)) continue;
      const w = lerp(8, 22, this.rng());
      const d = lerp(8, 22, this.rng());
      const h = lerp(opts.minH ?? 18, opts.maxH ?? 70, this.rng() ** 1.6);
      dummy.position.set(x, h / 2 - 2, z);
      dummy.scale.set(w, h, d);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      inst.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    inst.count = placed;
    this.scene.add(inst);
    return inst;
  }

  scatterRocks(region, count, scaleRange = [0.6, 2.4]) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: this.themeName === 'foundry' ? 0x4a3428 : 0x8d8677, roughness: 0.95, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const x = region.x + (this.rng() - 0.5) * region.w;
      const z = region.z + (this.rng() - 0.5) * region.d;
      const y = region.hFn ? region.hFn(x, z) : region.y ?? 0;
      const s = lerp(scaleRange[0], scaleRange[1], this.rng());
      dummy.position.set(x, y + s * 0.4, z);
      dummy.scale.setScalar(s);
      dummy.rotation.set(this.rng() * 3, this.rng() * 6.28, this.rng() * 3);
      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
    }
    inst.count = placed;
    this.scene.add(inst);
  }

  clouds(count = 10, y = 90, spread = 700, tint = 0xffffff) {
    const geo = new THREE.PlaneGeometry(120, 46);
    const mat = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.55, depthWrite: false,
      map: window.__krBlob || (window.__krBlob = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
        gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        const t = new THREE.CanvasTexture(c); return t;
      })()),
    });
    const grp = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((this.rng() - 0.5) * spread, y + (this.rng() - 0.5) * 30, (this.rng() - 0.5) * spread);
      m.rotation.x = -Math.PI / 2 + 1.2; // face roughly toward camera band
      grp.add(m);
    }
    this.scene.add(grp);
    return grp;
  }

  water(y, size = 2400, colorA = 0x0e5e78, colorB = 0x39c8f0) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uA: { value: new THREE.Color(colorA) },
        uB: { value: new THREE.Color(colorB) },
        uFogColor: { value: new THREE.Color(this.th.fog.color) },
        uFogDensity: { value: this.th.fog.density },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld;
        uniform float uTime;
        void main(){
          vUv = uv * 400.0;
          vec3 p = position;
          p.z += sin(p.x*0.02 + uTime*1.2)*0.6 + cos(p.y*0.03 + uTime*0.8)*0.5;
          vec4 wp = modelMatrix * vec4(p,1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld;
        uniform float uTime; uniform vec3 uA, uB, uFogColor; uniform float uFogDensity;
        void main(){
          float w1 = sin(vUv.x*0.5 + uTime*2.0) * 0.5 + 0.5;
          float w2 = sin(vUv.y*0.7 - uTime*1.4 + sin(vUv.x*0.3)*2.0) * 0.5 + 0.5;
          float spark = pow(max(0.0, sin(vUv.x*2.0+uTime*3.0)*sin(vUv.y*1.7-uTime*2.2)), 8.0);
          vec3 col = mix(uA, uB, w1*0.5 + w2*0.5);
          col += spark * 0.6;
          float dist = length(vWorld - cameraPosition);
          float f = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist);
          col = mix(col, uFogColor, clamp(f,0.0,1.0));
          gl_FragColor = vec4(col, 0.93);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 48, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    this.scene.add(mesh);
    this.waterMat = mat;
    return mesh;
  }

  lavaSea(y, size = 2600) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(this.th.fog.color) },
        uFogDensity: { value: this.th.fog.density },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv*300.0; vec4 wp = modelMatrix*vec4(position,1.0); vWorld=wp.xyz;
          gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vWorld;
        uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
        float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float v = n(vUv*0.08 + uTime*0.06) * 0.6 + n(vUv*0.2 - uTime*0.1)*0.4;
          float crack = smoothstep(0.52,0.56,v);
          vec3 crust = vec3(0.13,0.05,0.04);
          vec3 hot = vec3(1.0,0.35+0.4*sin(uTime+vUv.x*0.1),0.05);
          vec3 col = mix(crust, hot, crack);
          float dist = length(vWorld - cameraPosition);
          float f = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist);
          col = mix(col, uFogColor, clamp(f,0.,1.));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 8, 8), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    this.scene.add(mesh);
    this.lavaMat = mat;
    return mesh;
  }

  tickEnv(dt) {
    if (this.waterMat) this.waterMat.uniforms.uTime.value += dt;
    if (this.lavaMat) this.lavaMat.uniforms.uTime.value += dt;
  }
}
