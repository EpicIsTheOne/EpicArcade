// ISLEBREAK world meshes: chunked terrain, ocean, sky, clouds, POI structures,
// trees, rocks, piers, roads. Deterministic from seed. Merged per material.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { Rng } from './rng.js';
import { WORLD, POIS } from './world.js';

export const CHUNK_SIZE = 62.5;
const CHUNKS = 32;
const BOX = new THREE.BoxGeometry(1, 1, 1);

// ============================================================
// MATERIALS (procedural canvas textures)
// ============================================================
function noiseTex(base, specks, size = 128, count = 2600) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    g.fillStyle = specks[Math.floor(Math.random() * specks.length)];
    g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

export function makeMaterials() {
  const grass = noiseTex('#7da05c', ['rgba(96,128,66,0.35)', 'rgba(134,160,92,0.3)', 'rgba(70,98,50,0.25)'], 256, 9000);
  const rockM = noiseTex('#8d8f93', ['rgba(255,255,255,0.06)', 'rgba(20,22,26,0.09)']);
  const woodBase = (hex) => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = hex; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(40,24,10,${0.06 + Math.random() * 0.12})`;
      g.lineWidth = 0.6 + Math.random() * 1.4;
      g.beginPath();
      g.moveTo(0, Math.random() * 64);
      g.bezierCurveTo(20, Math.random() * 64, 44, Math.random() * 64, 64, Math.random() * 64);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  };
  return {
    terrain: grass,
    rock: rockM,
    wood: woodBase('#8a5a36'),
    woodDark: woodBase('#6e452a'),
    brick: noiseTex('#b46a4a', ['rgba(70,40,25,0.14)', 'rgba(230,200,180,0.08)']),
    plaster: noiseTex('#d8cdb8', ['rgba(120,110,90,0.08)', 'rgba(255,255,250,0.07)']),
    roofRed: noiseTex('#a8503c', ['rgba(50,20,15,0.16)', 'rgba(255,180,150,0.06)']),
    roofGrey: noiseTex('#5a6068', ['rgba(20,22,26,0.18)', 'rgba(200,210,220,0.05)']),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.45, metalness: 0.75 }),
    rust: new THREE.MeshStandardMaterial({ color: 0xa8623c, roughness: 0.85, metalness: 0.35 }),
    concrete: noiseTex('#b9b4a8', ['rgba(60,60,55,0.09)', 'rgba(255,255,240,0.06)']),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.6 }),
    road: noiseTex('#9b8a72', ['rgba(60,50,35,0.12)', 'rgba(210,195,165,0.08)'], 128, 1400),
    leaf: new THREE.MeshStandardMaterial({ color: 0x4c7c46, roughness: 0.95 }),
    leafDark: new THREE.MeshStandardMaterial({ color: 0x39603a, roughness: 0.95 }),
    pine: new THREE.MeshStandardMaterial({ color: 0x2f5d3c, roughness: 0.95 }),
    trunk: woodBase('#5e4326'),
    glassBlue: new THREE.MeshPhysicalMaterial({
      color: 0xbfe8ff, roughness: 0.12, metalness: 0,
      transparent: true, opacity: 0.42, envMapIntensity: 1.2,
    }),
  };
}

// ============================================================
// MERGE HELPERS
// ============================================================
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

export function boxItem(mats, matName, x, y, z, w, h, d, ry = 0, rz = 0, rx = 0) {
  return { geo: BOX, mat: mats[matName], x, y, z, sx: w, sy: h, sz: d, ry, rz, rx };
}
function colBox(x, y, z, w, h, d, ref) {
  return { min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2], ref };
}
function rot2(lx, lz, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [lx * c + lz * s, -lx * s + lz * c];
}
// conservative world AABB for a rotated/sloped box
function rotCol(x, y, z, w, h, d, ry = 0, rz = 0, ref = null) {
  if (rz) { h = h * Math.abs(Math.cos(rz)) + w * Math.abs(Math.sin(rz)); w = w * Math.abs(Math.cos(rz)); }
  if (ry) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const nw = w * c + d * s, nd = w * s + d * c;
    w = nw; d = nd;
  }
  const b = colBox(x, y, z, w, h, d, ref);
  if (ref) b.ref = ref;
  return b;
}
function rotColBox(x, y, z, w, h, d, ry, ref) {
  return rotCol(x, y, z, w, h, d, ry, 0, ref);
}
export function mergeBoxes(items) {
  const byMat = new Map();
  for (const it of items) {
    _eul.set(it.rx || 0, it.ry || 0, it.rz || 0);
    _q.setFromEuler(_eul);
    _pos.set(it.x || 0, it.y || 0, it.z || 0);
    _scl.set(it.sx || 1, it.sy || 1, it.sz || 1);
    _m4.compose(_pos, _q, _scl);
    let g = it.geo;
    if (it.uvScale) {
      g = g.clone();
      const uv = g.attributes.uv;
      if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * it.uvScale, uv.getY(i) * it.uvScale);
    }
    g = g.clone().applyMatrix4(_m4);
    if (!byMat.has(it.mat)) byMat.set(it.mat, []);
    byMat.get(it.mat).push(g);
  }
  const out = [];
  for (const [mat, geos] of byMat) {
    const mg = mergeGeometries(geos, false);
    if (mg) out.push({ mat, geo: mg });
  }
  return out;
}
export function makeMergedMesh(items, castShadow = true, receiveShadow = true) {
  const group = new THREE.Group();
  for (const { mat, geo } of mergeBoxes(items)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }
  return group;
}

// ============================================================
// TERRAIN
// ============================================================
const _c1 = new THREE.Color();
export function buildTerrain(island, scene, mats) {
  const segs = 12;
  const mat = mats.terrain.clone();
  mat.vertexColors = true;
  const group = new THREE.Group();
  const colGrass = new THREE.Color(0x86a95e), colDry = new THREE.Color(0xa8a15e),
        colRock = new THREE.Color(0x8f9297), colSand = new THREE.Color(0xd6c692);
  let built = 0;
  const size = CHUNK_SIZE;
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const x0 = -WORLD.half + cx * size, z0 = -WORLD.half + cz * size;
      const corners = [island.height(x0, z0), island.height(x0 + size, z0),
                       island.height(x0, z0 + size), island.height(x0 + size, z0 + size)];
      if (corners.every(h => h < -4)) continue;
      const geo = new THREE.PlaneGeometry(size, size, segs, segs);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const wx = x0 + pos.getX(i), wz = z0 + pos.getZ(i);
        const h = island.height(wx, wz);
        pos.setY(i, h);
        let c;
        if (h < 1.6) c = colSand;
        else if (h > 52) c = colRock;
        else if (h > 42) c = _c1.copy(colRock).lerp(colGrass, (52 - h) / 10);
        else c = _c1.copy(colGrass).lerp(colDry,
          Math.min(1, Math.max(0, 0.5 + wx * 0.0009 + wz * 0.0007 + island.forest(wx, wz) * 0.4)));
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x0 + size / 2, 0, z0 + size / 2);
      mesh.receiveShadow = true;
      mesh.userData.isTerrain = true;
      group.add(mesh);
      built++;
    }
  }
  scene.add(group);
  return group;
}

// ============================================================
// OCEAN
// ============================================================
export function buildOcean(scene) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8080ff'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 128;
    g.moveTo(0, y);
    g.bezierCurveTo(32, y + (Math.random() * 10 - 5), 90, y + (Math.random() * 10 - 5), 128, y);
    g.stroke();
  }
  const nrm = new THREE.CanvasTexture(c);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  nrm.repeat.set(60, 60);
  const mtl = new THREE.MeshPhysicalMaterial({
    color: 0x1d6d92, roughness: 0.12, metalness: 0.05,
    transparent: true, opacity: 0.88,
    normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.4,
  });
  mtl.normalMap.colorSpace = THREE.NoColorSpace;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), mtl);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = WORLD.waterLevel;
  scene.add(ocean);
  ocean.userData.tick = (t) => { nrm.offset.set(t * 0.008, t * 0.005); };
  return ocean;
}

// ============================================================
// SKY + CLOUDS
// ============================================================
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(2400, 24, 16);
  const mtl = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6fd0) },
      mid: { value: new THREE.Color(0x9cc4ee) },
      bot: { value: new THREE.Color(0xe8dcc8) },
      sunDir: { value: new THREE.Vector3(0.45, 0.62, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff2cf) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      uniform vec3 sunDir; uniform vec3 sunColor;
      void main(){
        float h = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(bot, mid, smoothstep(0.42,0.55,h));
        col = mix(col, top, smoothstep(0.55,0.95,h));
        float s = max(dot(vDir, sunDir), 0.0);
        col += sunColor * pow(s, 350.0) * 1.2;
        col += sunColor * pow(s, 6.0) * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mtl);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

export function buildClouds(scene) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 42; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 18 + Math.random() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mtl = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), mtl);
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = 380;
  clouds.frustumCulled = false;
  scene.add(clouds);
  clouds.userData.tick = (t) => { tex.offset.set(t * 0.0022, t * 0.0009); };
  return clouds;
}

// ============================================================
// HOUSE (interior + door gap + pitched/flat roof)
// ============================================================
export function buildHouse(mats, rng, x, z, groundY, opts = {}) {
  const w = opts.w || rng.range(9, 13);
  const d = opts.d || rng.range(8, 11);
  const wallH = 3.4;
  const ry = opts.ry || 0;
  const items = [], colliders = [];
  const wallMat = opts.wallMat || (rng.chance(0.5) ? 'plaster' : 'brick');
  const roofMat = rng.chance(0.5) ? 'roofRed' : 'roofGrey';
  const floorY = groundY + 0.12;
  // floor slab
  items.push(boxItem(mats, 'woodDark', x, floorY - 0.06, z, w, 0.24, d, ry));
  colliders.push(rotCol(x, floorY, z, w, 0.24, d, ry, 0, { harvest: 'wood', hp: 220, kind: 'floor' }));
  const t = 0.34;
  // three full walls (back +Z, left -X, right +X in local space)
  const wallSegs = [
    { cx: 0, cz: d / 2, len: w, along: 'x' },
    { cx: -w / 2, cz: 0, len: d, along: 'z' },
    { cx: w / 2, cz: 0, len: d, along: 'z' },
  ];
  for (const s of wallSegs) {
    const [wx, wz] = rot2(s.cx, s.cz, ry);
    const ww = s.along === 'x' ? s.len : t;
    const dd = s.along === 'x' ? t : s.len;
    items.push(boxItem(mats, wallMat, x + wx, floorY + wallH / 2, z + wz, ww, wallH, dd, ry));
    colliders.push(rotCol(x + wx, floorY + wallH / 2, z + wz, ww, wallH, dd, ry, 0, { harvest: 'brick', hp: 260, kind: 'wall' }));
  }
  // front wall (-Z): two segments flanking door + lintel
  const doorW = 1.7, doorH = 2.5;
  const side = (w - doorW) / 2;
  for (const sgn of [-1, 1]) {
    const [wx, wz] = rot2(sgn * (doorW / 2 + side / 2), -d / 2, ry);
    items.push(boxItem(mats, wallMat, x + wx, floorY + wallH / 2, z + wz, side, wallH, t, ry));
    colliders.push(rotCol(x + wx, floorY + wallH / 2, z + wz, side, wallH, t, ry, 0, { harvest: 'brick', hp: 260, kind: 'wall' }));
  }
  {
    const lh = wallH - doorH;
    const [wx, wz] = rot2(0, -d / 2, ry);
    items.push(boxItem(mats, wallMat, x + wx, floorY + doorH + lh / 2, z + wz, doorW, lh, t, ry));
    colliders.push(rotCol(x + wx, floorY + doorH + lh / 2, z + wz, doorW, lh, t, ry, 0, { harvest: 'brick', hp: 260, kind: 'lintel' }));
  }
  // window insets (visual)
  for (const sgn of [-1, 1]) {
    const [wx, wz] = rot2(sgn * w / 2, rng.range(-d / 4, d / 4), ry);
    items.push(boxItem(mats, 'dark', x + wx, floorY + 1.7, z + wz, 0.1, 1.1, 1.4, ry));
  }
  if (opts.flat) {
    items.push(boxItem(mats, 'concrete', x, floorY + wallH + 0.15, z, w + 0.4, 0.3, d + 0.4, ry));
    colliders.push(rotCol(x, floorY + wallH + 0.15, z, w + 0.4, 0.3, d + 0.4, ry, 0, { harvest: 'brick', hp: 300, kind: 'roof' }));
  } else {
    const rise = 2.1;
    const slopeLen = Math.hypot(w / 2 + 0.5, rise);
    const ang = Math.atan2(rise, w / 2 + 0.5);
    for (const sgn of [-1, 1]) {
      const [wx, wz] = rot2(sgn * w / 4, 0, ry);
      items.push(boxItem(mats, roofMat, x + wx, floorY + wallH + rise / 2, z + wz, slopeLen, 0.22, d + 0.8, ry, sgn * ang));
      colliders.push(rotCol(x + wx, floorY + wallH + rise / 2, z + wz, slopeLen, 0.22, d + 0.8, ry, sgn * ang, { harvest: 'brick', hp: 300, kind: 'roof' }));
    }
    for (const sgn of [-1, 1]) {
      const [wx, wz] = rot2(0, sgn * d / 2, ry);
      items.push(boxItem(mats, wallMat, x + wx, floorY + wallH + rise / 2 - 0.1, z + wz, w, rise, t, ry));
      colliders.push(rotCol(x + wx, floorY + wallH + rise / 2 - 0.1, z + wz, w, rise, t, ry, 0, { harvest: 'brick', hp: 260, kind: 'gable' }));
    }
  }
  // furniture
  for (let i = 0, n = rng.int(1, 2); i < n; i++) {
    const lx = rng.range(-w / 3, w / 3), lz = rng.range(-d / 3, d / 3);
    const [wx, wz] = rot2(lx, lz, ry);
    items.push(boxItem(mats, 'wood', x + wx, floorY + 0.45, z + wz, 1.6, 0.1, 0.9, ry));
    for (const [ox, oz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
      const [wx2, wz2] = rot2(lx + ox, lz + oz, ry);
      items.push(boxItem(mats, 'woodDark', x + wx2, floorY + 0.22, z + wz2, 0.1, 0.45, 0.1, ry));
    }
    colliders.push(rotCol(x + wx, floorY + 0.45, z + wz, 1.6, 0.9, 0.9, ry, 0, { harvest: 'wood', hp: 90, kind: 'furniture' }));
  }
  return { items, colliders };
}

// ============================================================
// POIs
// ============================================================
export function buildPOIs(scene, island, mats, rng, physics, harvestables) {
  const out = { poiInfo: [] };
  const itemsAll = [];
  const H = (x, z) => island.height(x, z);

  const addStruct = (res) => {
    for (const it of res.items) itemsAll.push(it);
    for (const c of res.colliders) {
      physics.addStatic(c);
      if (c.ref && c.ref.hp && c.ref.kind !== 'monument') harvestables.push(c);
    }
  };
  const addProp = (item, collider) => {
    itemsAll.push(item);
    physics.addStatic(collider);
    if (collider.ref && collider.ref.hp) harvestables.push(collider);
  };

  for (const poi of POIS) {
    const info = { key: poi.key, name: poi.name, x: poi.x, z: poi.z, r: poi.r, kind: poi.kind, chests: [] };
    const gyC = H(poi.x, poi.z);

    if (poi.kind === 'town') {
      const n = poi.r > 160 ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), rr = rng.range(12, poi.r * 0.8);
        const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
        const gy = H(x, z);
        if (gy < 2.5) continue;
        addStruct(buildHouse(mats, rng, x, z, gy, { ry: rng.range(0, Math.PI) }));
        if (rng.chance(0.75)) info.chests.push({ x, z, y: gy + 0.4, indoor: true });
      }
      // crates & stalls
      for (let i = 0; i < 10; i++) {
        const a = rng.range(0, Math.PI * 2), rr = rng.range(6, poi.r * 0.95);
        const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
        const gy = H(x, z);
        if (gy < 2) continue;
        if (rng.chance(0.5)) {
          const ry = rng.range(0, 3);
          addProp(boxItem(mats, 'woodDark', x, gy + 0.5, z, 1.4, 1.0, 1.4, ry),
                  rotColBox(x, gy + 0.5, z, 1.4, 1.0, 1.4, ry, { harvest: 'wood', hp: 120, kind: 'crate' }));
        } else {
          for (const [dx, dz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) {
            itemsAll.push(boxItem(mats, 'woodDark', x + dx, gy + 1.05, z + dz, 0.16, 2.1, 0.16));
          }
          const ry = rng.range(0, 3);
          addProp(boxItem(mats, 'roofRed', x, gy + 2.15, z, 3.0, 0.14, 2.2, ry),
                  rotColBox(x, gy + 2.15, z, 3.0, 0.14, 2.2, ry, { harvest: 'wood', hp: 100, kind: 'canopy' }));
          addProp(boxItem(mats, 'wood', x, gy + 0.55, z, 2.6, 0.12, 1.6, ry),
                  rotColBox(x, gy + 0.55, z, 2.6, 0.12, 1.6, ry, { harvest: 'wood', hp: 110, kind: 'counter' }));
        }
      }
    }

    else if (poi.kind === 'camp') {
      for (let i = 0; i < 4; i++) {
        const a = rng.range(0, Math.PI * 2), rr = rng.range(18, poi.r * 0.7);
        const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
        const gy = H(x, z);
        if (gy < 2) continue;
        addStruct(buildHouse(mats, rng, x, z, gy, { w: 7, d: 6, wallMat: 'woodDark', flat: true, ry: rng.range(0, Math.PI) }));
        if (rng.chance(0.7)) info.chests.push({ x, z, y: gy + 0.4, indoor: true });
      }
      // A-frame tents (open front)
      for (let i = 0; i < 5; i++) {
        const a = rng.range(0, Math.PI * 2), rr = rng.range(8, poi.r * 0.85);
        const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
        const gy = H(x, z);
        if (gy < 2) continue;
        const ry = rng.range(0, Math.PI);
        for (const sgn of [-1, 1]) {
          itemsAll.push(boxItem(mats, 'leafDark', x, gy + 0.9, z, 2.6, 0.12, 3.2, ry, sgn * 0.9));
        }
        if (rng.chance(0.5)) info.chests.push({ x, z, y: gy + 0.3 });
      }
      // campfire ring
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        itemsAll.push(boxItem(mats, 'rock', poi.x + Math.cos(a) * 2.2, gyC + 0.2, poi.z + Math.sin(a) * 2.2, 0.7, 0.4, 0.7, a));
      }
      // log pile
      for (let k = 0; k < 6; k++) {
        const lx = poi.x + 5 + rng.range(-1, 1), lz = poi.z + 3 + rng.range(-1, 1);
        itemsAll.push(boxItem(mats, 'trunk', lx, H(lx, lz) + 0.3 + (k % 3) * 0.5, lz, 0.5, 0.5, 2.4, rng.range(0, 3)));
      }
      info.chests.push({ x: poi.x + 4, z: poi.z - 3, y: gyC + 0.3 });
    }

    else if (poi.kind === 'industrial') {
      const cx = poi.x, cz = poi.z, gy = H(cx, cz);
      // terraced pit rings of concrete blocks (each block sits on LOCAL terrain)
      for (let ring = 3; ring >= 0; ring--) {
        const rr = 16 + ring * 20;
        const depth = (3 - ring) * 3.0;
        const cnt = 10 + ring * 4;
        for (let k = 0; k < cnt; k++) {
          const a = (k / cnt) * Math.PI * 2;
          const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
          const localGy = H(x, z);
          addProp(boxItem(mats, 'concrete', x, localGy - depth + 1.2, z, 8, 2.4, 5, a),
                  rotColBox(x, localGy - depth + 1.2, z, 8, 2.4, 5, a, { harvest: 'brick', hp: 320, kind: 'terrace' }));
        }
      }
      // shipping containers
      for (let k = 0; k < 8; k++) {
        const a = rng.range(0, Math.PI * 2), rr2 = rng.range(10, 66);
        const x = cx + Math.cos(a) * rr2, z = cz + Math.sin(a) * rr2;
        const yy = H(x, z) + 1.3 + (rng.chance(0.3) ? 2.6 : 0);
        const m = rng.pick(['rust', 'metal', 'dark']);
        const ry = rng.range(0, Math.PI);
        addProp(boxItem(mats, m, x, yy, z, 2.5, 2.6, 6, ry),
                rotColBox(x, yy, z, 2.5, 2.6, 6, ry, { harvest: 'metal', hp: 400, kind: 'container' }));
        if (rng.chance(0.45)) info.chests.push({ x: x + 2, z, y: H(x + 2, z) + 0.4 });
      }
      // crane tower
      const tx = cx + 30, tz = cz - 20;
      addProp(boxItem(mats, 'rust', tx, H(tx, tz) + 9, tz, 2.2, 18, 2.2),
              colBox(tx, H(tx, tz) + 9, tz, 2.2, 18, 2.2, { harvest: 'metal', hp: 500, kind: 'crane' }));
      // conveyor frame to pit
      for (let k = 0; k < 5; k++) {
        const px = cx - 40 + k * 8, pz = cz + 10;
        itemsAll.push(boxItem(mats, 'dark', px, H(px, pz) + 1.4 + k * 0.5, pz, 1.4, 0.25, 1.4));
      }
      info.chests.push({ x: tx + 3, z: tz, y: H(tx + 3, tz) + 0.4 }, { x: cx, z: cz, y: H(cx, cz) + 0.4 });
    }

    else if (poi.kind === 'military') {
      const pxx = poi.x, pzz = poi.z;
      const gy = H(pxx, pzz);
      // runway slab + markings
      itemsAll.push(boxItem(mats, 'dark', pxx, gy + 0.06, pzz, 26, 0.12, 170));
      for (let i = -7; i <= 7; i++) {
        itemsAll.push(boxItem(mats, 'white', pxx, gy + 0.13, pzz + i * 11, 0.8, 0.02, 4));
      }
      // hangar (open front toward runway)
      const hx = pxx + 34, hz = pzz - 40;
      const hw = 26, hd = 24, hh2 = 9, tt = 0.5;
      for (const sgn of [-1, 1]) {
        addProp(boxItem(mats, 'metal', hx + sgn * (hw / 2), gy + hh2 / 2, hz, tt, hh2, hd),
                colBox(hx + sgn * (hw / 2), gy + hh2 / 2, hz, tt, hh2, hd, { harvest: 'metal', hp: 450, kind: 'hangarwall' }));
      }
      addProp(boxItem(mats, 'metal', hx, gy + hh2 / 2, hz + hd / 2, hw, hh2, tt),
              colBox(hx, gy + hh2 / 2, hz + hd / 2, hw, hh2, tt, { harvest: 'metal', hp: 450, kind: 'hangarwall' }));
      addProp(boxItem(mats, 'metal', hx, gy + hh2 + 0.25, hz, hw + 1, 0.5, hd + 1),
              colBox(hx, gy + hh2 + 0.25, hz, hw + 1, 0.5, hd + 1, { harvest: 'metal', hp: 450, kind: 'hangarroof' }));
      // control tower legs + glass cab
      const twx = pxx - 26, twz = pzz + 50;
      for (const [ox, oz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
        itemsAll.push(boxItem(mats, 'concrete', twx + ox, gy + 6, twz + oz, 0.7, 12, 0.7));
      }
      itemsAll.push(boxItem(mats, 'glassBlue', twx, gy + 13, twz, 7, 3, 7));
      itemsAll.push(boxItem(mats, 'dark', twx, gy + 14.8, twz, 8, 0.5, 8));
      physics.addStatic(colBox(twx, gy + 13, twz, 7, 3, 7, null));
      // crates
      for (let i = 0; i < 8; i++) {
        const x = pxx + rng.range(-10, 10), z = pzz + rng.range(-80, 80);
        const ry = rng.range(0, 3);
        addProp(boxItem(mats, 'rust', x, H(x, z) + 0.9, z, 1.8, 1.8, 1.8, ry),
                rotColBox(x, H(x, z) + 0.9, z, 1.8, 1.8, 1.8, ry, { harvest: 'metal', hp: 150, kind: 'crate' }));
      }
      // barracks
      for (let i = 0; i < 2; i++) {
        const bx = pxx - 40 - i * 16, bz = pzz - 30 + i * 60;
        addStruct(buildHouse(mats, rng, bx, bz, H(bx, bz), { w: 16, d: 8, wallMat: 'metal', flat: true, ry: 0 }));
        if (rng.chance(0.9)) info.chests.push({ x: bx, z: bz, y: H(bx, bz) + 0.4, indoor: true });
      }
      info.chests.push({ x: hx, z: hz, y: gy + 0.4 }, { x: twx, z: twz - 4, y: gy + 0.4 }, { x: pxx, z: pzz - 60, y: gy + 0.4 });
    }

    else if (poi.kind === 'landmark') {
      if (poi.key === 'spire') {
        let r = 11;
        for (let lvl = 0; lvl < 7; lvl++) {
          itemsAll.push({ geo: new THREE.CylinderGeometry(r, r + 1.6, 7, 10), mat: mats.concrete, x: poi.x, y: gyC + 3.5 + lvl * 7, z: poi.z });
          r *= 0.78;
        }
        physics.addStatic(colBox(poi.x, gyC + 20, poi.z, 19, 44, 19, { harvest: 'brick', hp: 999999, kind: 'monument' }));
        info.chests.push({ x: poi.x + 14, z: poi.z, y: gyC + 0.4 }, { x: poi.x, z: poi.z + 14, y: gyC + 0.4 });
      } else if (poi.key === 'observatory') {
        itemsAll.push({ geo: new THREE.CylinderGeometry(10, 11, 6, 14), mat: mats.white, x: poi.x, y: gyC + 3, z: poi.z });
        physics.addStatic(colBox(poi.x, gyC + 3, poi.z, 21, 6, 21, { harvest: 'brick', hp: 999999, kind: 'monument' }));
        itemsAll.push({ geo: new THREE.SphereGeometry(9.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat: mats.white, x: poi.x, y: gyC + 6, z: poi.z });
        itemsAll.push({ geo: new THREE.CylinderGeometry(1.4, 1.8, 14, 10), mat: mats.metal, x: poi.x, y: gyC + 10, z: poi.z, rx: 0.9, ry: 0.5 });
        for (let i = 0; i < 2; i++) {
          const a = rng.range(0, 6.28), rr = rng.range(16, 26);
          const bx = poi.x + Math.cos(a) * rr, bz = poi.z + Math.sin(a) * rr;
          addStruct(buildHouse(mats, rng, bx, bz, H(bx, bz), { w: 8, d: 7, ry: rng.range(0, 3) }));
        }
        info.chests.push({ x: poi.x + 12, z: poi.z + 8, y: gyC + 0.4 });
      } else if (poi.key === 'lighthouse') {
        let rr2 = 3.4;
        for (let lvl = 0; lvl < 8; lvl++) {
          itemsAll.push({ geo: new THREE.CylinderGeometry(rr2 * 0.94, rr2, 4.2, 12), mat: lvl % 2 ? mats.white : mats.roofRed, x: poi.x, y: gyC + 2.1 + lvl * 4.2, z: poi.z });
          rr2 *= 0.93;
        }
        itemsAll.push({ geo: new THREE.CylinderGeometry(2.4, 2.4, 3, 12), mat: mats.glassBlue, x: poi.x, y: gyC + 36, z: poi.z });
        itemsAll.push({ geo: new THREE.ConeGeometry(2.8, 2.6, 12), mat: mats.roofRed, x: poi.x, y: gyC + 39, z: poi.z });
        physics.addStatic(colBox(poi.x, gyC + 18, poi.z, 7.5, 38, 7.5, { harvest: 'brick', hp: 999999, kind: 'monument' }));
        addStruct(buildHouse(mats, rng, poi.x + 14, poi.z + 6, H(poi.x + 14, poi.z + 6), { w: 8, d: 7, ry: 0.7 }));
        info.chests.push({ x: poi.x + 14, z: poi.z + 6, y: H(poi.x + 14, poi.z + 6) + 0.4, indoor: true });
      }
    }

    out.poiInfo.push(info);
  }

  // roads between POIs
  const roadPairs = [
    ['harbor', 'crossroads'], ['crossroads', 'camp'], ['crossroads', 'airstrip'],
    ['harbor', 'quarry'], ['camp', 'observatory'], ['airstrip', 'lighthouse'], ['spire', 'crossroads'],
  ];
  for (const [ka, kb] of roadPairs) {
    const A = POIS.find(p => p.key === ka), B = POIS.find(p => p.key === kb);
    const steps = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 9);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      const gy = H(x, z);
      if (gy < 0.6) continue;
      itemsAll.push(boxItem(mats, 'road', x, gy + 0.08, z, 7.5, 0.16, 9.5));
    }
  }

  // piers at the coast near harbor & lighthouse (walkable over water)
  for (const [px, pz, ang] of [[-700, -600, 0.8], [900, -80, 2.4]]) {
    const gy0 = H(px, pz);
    for (let k = 0; k < 10; k++) {
      const x = px + Math.cos(ang) * k * 5, z = pz + Math.sin(ang) * k * 5;
      const deckY = gy0 + 1.2;
      addProp(boxItem(mats, 'woodDark', x, deckY, z, 4, 0.25, 5.2),
              colBox(x, deckY, z, 4, 0.25, 5.2, { harvest: 'wood', hp: 160, kind: 'pier' }));
      if (k % 3 === 0) {
        itemsAll.push(boxItem(mats, 'trunk', x, deckY - 1.2, z, 0.35, 2.4, 0.35));
      }
    }
  }

  scene.add(makeMergedMesh(itemsAll, true, true));
  return out;
}

// ============================================================
// FORESTS + ROCKS (instanced)
// ============================================================
export function buildVegetation(scene, island, mats, rng, physicsRef) {
  const N_TREES = 900, N_PINES = 700, N_ROCKS = 260;

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 4.4, 6);
  trunkGeo.translate(0, 2.2, 0);
  const blobGeo = new THREE.IcosahedronGeometry(2.6, 1);
  blobGeo.translate(0, 5.6, 0);
  const blob2Geo = new THREE.IcosahedronGeometry(1.9, 1);
  blob2Geo.translate(1.4, 4.4, 0.6);
  const coneGeo = new THREE.ConeGeometry(2.1, 5.4, 7);
  coneGeo.translate(0, 5.0, 0);
  const cone2Geo = new THREE.ConeGeometry(1.5, 4.2, 7);
  cone2Geo.translate(0, 7.4, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1.6, 0);

  const mkInst = (geo, mat, n) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    scene.add(im);
    return im;
  };
  const trunks = mkInst(trunkGeo, mats.trunk, N_TREES);
  const blobs = mkInst(blobGeo, mats.leaf, N_TREES);
  const blobs2 = mkInst(blob2Geo, mats.leafDark, N_TREES);
  const ptrunks = mkInst(trunkGeo, mats.trunk, N_PINES);
  const cones = mkInst(coneGeo, mats.pine, N_PINES);
  const cones2 = mkInst(cone2Geo, mats.pine, N_PINES);
  const rocksI = mkInst(rockGeo, mats.rock, N_ROCKS);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  const place = (im, idx, x, y, z, scale, ry) => {
    e.set(0, ry, 0); q.setFromEuler(e); s.setScalar(scale);
    m4.compose(new THREE.Vector3(x, y, z), q, s);
    im.setMatrixAt(idx, m4);
    im.count = Math.max(im.count, idx + 1);
  };

  // per-tree collider + destruction (hide instance by zero-scaling its matrix)
  const makeTreeCollider = (x, h, z, sc, imTrunk, imA, imB, idx) => {
    const box = {
      min: [x - 0.45 * sc, h - 0.2, z - 0.45 * sc],
      max: [x + 0.45 * sc, h + 4.2 * sc, z + 0.45 * sc],
      ref: { harvest: 'wood', hp: Math.round(90 * sc), kind: 'tree' },
      idx,
    };
    box.ref.onDestroyed = () => {
      for (const im of [imTrunk, imA, imB]) {
        m4.compose(new THREE.Vector3(x, -500, z), q.identity(), new THREE.Vector3(0.0001, 0.0001, 0.0001));
        im.setMatrixAt(idx, m4);
        im.instanceMatrix.needsUpdate = true;
      }
    };
    physicsRef.addStatic(box);
    return box;
  };

  const spots = { trees: [], pines: [], rocks: [] };
  let ti = 0, pi = 0, ri = 0;
  let guard = 0;
  while ((ti < N_TREES || pi < N_PINES || ri < N_ROCKS) && guard++ < 30000) {
    const x = rng.range(-WORLD.half * 0.94, WORLD.half * 0.94);
    const z = rng.range(-WORLD.half * 0.94, WORLD.half * 0.94);
    const h = island.height(x, z);
    if (h < 2.5 || h > 48) continue;
    // keep POI cores clear
    let inPoi = false;
    for (const p of POIS) {
      if (Math.hypot(x - p.x, z - p.z) < p.r * 0.62) { inPoi = true; break; }
    }
    if (inPoi) continue;
    const f = island.forest(x, z);
    if (ti < N_TREES && f > 0.02 && rng.chance(0.8)) {
      const sc = rng.range(0.8, 1.35);
      place(trunks, ti, x, h - 0.2, z, sc, rng.range(0, 6.3));
      place(blobs, ti, x, h - 0.2, z, sc, rng.range(0, 6.3));
      place(blobs2, ti, x, h - 0.2, z, sc, rng.range(0, 6.3));
      spots.trees.push([x, h, z, sc]);
      makeTreeCollider(x, h, z, sc, trunks, blobs, blobs2, ti);
      ti++;
    } else if (pi < N_PINES && f <= 0.02 && h > 8 && rng.chance(0.65)) {
      const sc = rng.range(0.8, 1.3);
      place(ptrunks, pi, x, h - 0.2, z, sc, rng.range(0, 6.3));
      place(cones, pi, x, h - 0.2, z, sc, rng.range(0, 6.3));
      place(cones2, pi, x, h - 0.2, z, sc, rng.range(0, 6.3));
      spots.pines.push([x, h, z, sc]);
      makeTreeCollider(x, h, z, sc, ptrunks, cones, cones2, pi);
      pi++;
    } else if (ri < N_ROCKS && rng.chance(0.25)) {
      const sc = rng.range(0.6, 2.2);
      place(rocksI, ri, x, h + 0.2 * sc, z, sc, rng.range(0, 6.3));
      spots.rocks.push([x, h, z, sc]);
      // rock collider + destruction
      const rbox = {
        min: [x - 1.4 * sc, h - 0.5, z - 1.4 * sc],
        max: [x + 1.4 * sc, h + 1.2 * sc, z + 1.4 * sc],
        ref: {
          harvest: 'brick', hp: Math.round(140 * sc), kind: 'rock',
          onDestroyed: () => {
            m4.compose(new THREE.Vector3(x, -500, z), q.identity(), new THREE.Vector3(0.0001, 0.0001, 0.0001));
            rocksI.setMatrixAt(ri - 1 < 0 ? 0 : ri - 1, m4); // last placed rock
            rocksI.instanceMatrix.needsUpdate = true;
          },
        },
        idx: ri,
      };
      physicsRef.addStatic(rbox);
      ri++;
    }
  }
  for (const im of [trunks, blobs, blobs2, ptrunks, cones, cones2, rocksI]) im.instanceMatrix.needsUpdate = true;
  return spots;
}
