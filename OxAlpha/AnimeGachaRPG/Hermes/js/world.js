// STARWEAVE — three.js world construction (stylized lowpoly celestial islands)
import * as THREE from '../vendor/three.module.js';

export const ISLANDS = [
  { id: 'hub', cx: 0, cz: 0, r: 46, theme: 'meadow' },
  { id: 'fields', cx: 110, cz: 0, r: 38, theme: 'fields' },
  { id: 'gloamwood', cx: 118, cz: 86, r: 34, theme: 'gloom' },
];
export const BRIDGES = [
  { x1: 38, z1: -5, x2: 82, z2: 5 },   // hub -> fields
  { x1: 104, z1: 30, x2: 134, z2: 62 }, // fields -> gloamwood
];
export const SPAWN_POINT = { x: 0, z: 26 };
export const LOOM_POS = { x: 0, z: -36 };
export const STARWELL_POS = { x: -21, z: -6 };
export const GATE_POS = { x: 136, z: 88 };
export const VESPERINE_SPOT = { x: 112, cz: 96 };
export const ARENA_CENTER = { x: 300, cz: 0 };

const THEMES = {
  meadow: { grass: [0x69b45e, 0x7ec46a, 0x5aa552], cliff: 0x8f86b8, tree: 0x4e9e58, crystal: 0x7fe8dd, sky: 0x2a2456 },
  fields: { grass: [0x8fbf62, 0xa4cc72, 0x83b258], cliff: 0x9a90bd, tree: 0x6fae54, crystal: 0xffd76e, sky: 0x2a2456 },
  gloom:  { grass: [0x4a4370, 0x56497e, 0x3f3a63], cliff: 0x5e5686, tree: 0x6b5a94, crystal: 0xb06cff, sky: 0x191430 },
};

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const rand = rngFactory(20260825);

  // ---------- lighting ----------
  scene.fog = new THREE.Fog(0x1a1533, 60, 240);
  const hemi = new THREE.HemisphereLight(0xbfb2ff, 0x3a3060, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.35);
  sun.position.set(-40, 70, 30);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6ee7ff, 0.35);
  rim.position.set(50, 30, -50);
  scene.add(rim);

  // ---------- sky dome ----------
  const skyGeo = new THREE.SphereGeometry(600, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform float time;
      void main(){
        vec3 d = normalize(vP);
        float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 deep = vec3(0.05,0.04,0.13);
        vec3 mid  = vec3(0.15,0.11,0.32);
        vec3 hor  = vec3(0.42,0.26,0.48);
        vec3 col = mix(hor, mid, smoothstep(0.35,0.62,h));
        col = mix(col, deep, smoothstep(0.6,0.95,h));
        // aurora band
        float band = exp(-pow((d.y-0.18)*6.0,2.0)) * exp(-pow((d.x+0.35)*1.6,2.0));
        col += vec3(0.10,0.35,0.30)*band*(0.7+0.3*sin(time*0.3+d.x*4.0));
        float band2 = exp(-pow((d.y-0.10)*7.0,2.0)) * exp(-pow((d.x-0.5)*1.9,2.0));
        col += vec3(0.30,0.16,0.38)*band2*(0.7+0.3*sin(time*0.23+d.z*4.0));
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  // stars
  {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rand() * Math.PI * 2, ph = Math.acos(rand() * 0.85);
      const rr = 520;
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.cos(ph) + 20;
      pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 });
    group.add(new THREE.Points(g, m));
  }

  // ---------- aether sea ----------
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float time;
      void main(){
        vec2 p = vUv*40.0;
        float w = sin(p.x+time*0.7)*0.5 + sin(p.y*1.3-time*0.5)*0.5 + sin((p.x+p.y)*0.7+time)*0.5;
        float w2 = sin(p.x*0.5-time*0.3)+sin(p.y*0.4+time*0.4);
        vec3 deep = vec3(0.07,0.05,0.20);
        vec3 glowA = vec3(0.16,0.55,0.52);
        vec3 glowB = vec3(0.38,0.22,0.55);
        vec3 col = deep + glowA*smoothstep(0.4,1.4,w)*0.5 + glowB*smoothstep(0.6,1.6,w2)*0.4;
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -26;
  group.add(sea);

  // ---------- islands ----------
  const mats = {};
  for (const isl of ISLANDS) {
    const T = THEMES[isl.theme];
    const geo = new THREE.PlaneGeometry(isl.r * 2 + 8, isl.r * 2 + 8, 40, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(), cTmp = new THREE.Color(), cCliff = new THREE.Color(T.cliff);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x, z) / isl.r;
      let h = 0;
      if (d < 0.92) h = (Math.sin(x * 0.12) + Math.cos(z * 0.15)) * 0.5 * Math.min(1, d) + (rand() - 0.5) * 0.3;
      if (d >= 0.86) h -= (d - 0.86) * 46; // cliffs fall away
      pos.setY(i, h);
      const shade = 0.9 + rand() * 0.18;
      cGrass.set(T.grass[Math.floor(rand() * 3)]);
      cTmp.copy(d > 0.88 ? cCliff : cGrass).multiplyScalar(shade);
      colors[i * 3] = cTmp.r; colors[i * 3 + 1] = cTmp.g; colors[i * 3 + 2] = cTmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(isl.cx, 0, isl.cz);
    group.add(mesh);

    // rocky underside
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(isl.r * 0.96, isl.r * 0.75, 10),
      new THREE.MeshLambertMaterial({ color: T.cliff })
    );
    cone.rotation.x = Math.PI;
    cone.position.set(isl.cx, -isl.r * 0.38, isl.cz);
    group.add(cone);
    mats[isl.id] = T;

    scatterProps(group, isl, T, rand);
  }

  // ---------- bridges ----------
  for (const b of BRIDGES) {
    const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
    const ang = Math.atan2(b.z2 - b.z1, b.x2 - b.x1);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(len, 1.1, 7),
      new THREE.MeshLambertMaterial({ color: 0xcbb694 })
    );
    deck.position.set((b.x1 + b.x2) / 2, -0.3, (b.z1 + b.z2) / 2);
    deck.rotation.y = -ang;
    group.add(deck);
    // glowing rune strip
    const runes = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.94, 0.12, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x7fe8dd })
    );
    runes.position.set((b.x1 + b.x2) / 2, 0.28, (b.z1 + b.z2) / 2);
    runes.rotation.y = -ang;
    group.add(runes);
    // rail posts
    for (let t = 0; t <= 1.001; t += 0.125) {
      const px = b.x1 + (b.x2 - b.x1) * t, pz = b.z1 + (b.z2 - b.z1) * t;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.6, 0.28), new THREE.MeshLambertMaterial({ color: 0x8a7a5e }));
        post.position.set(px + Math.sin(ang) * 3.4 * side, 0.6, pz - Math.cos(ang) * 3.4 * side);
        post.rotation.y = -ang;
        group.add(post);
      }
    }
  }

  // ---------- THE LOOM (sanctum) ----------
  buildLoom(group);

  // ---------- hub structures ----------
  buildHub(group, rand);

  // ---------- fields ruins ----------
  buildRuins(group, rand);

  // ---------- gloamwood trees ----------
  buildGloamwoodExtras(group, rand);

  // ---------- fracture gate ----------
  buildGate(group);

  // ---------- arena island (spire) ----------
  buildArena(group, rand);

  // ---------- drifting stardust motes ----------
  const moteCount = 380;
  const mpos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    mpos[i * 3] = (rand() - 0.5) * 340;
    mpos[i * 3 + 1] = rand() * 24 + 1;
    mpos[i * 3 + 2] = (rand() - 0.5) * 260 + 40;
  }
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  const motes = new THREE.Points(mgeo, new THREE.PointsMaterial({
    color: 0xfff2c2, size: 0.55, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(motes);

  function update(t, dt, playerPos) {
    skyMat.uniforms.time.value = t;
    seaMat.uniforms.time.value = t;
    // drift motes upward, wrap around player
    const p = mgeo.attributes.position;
    for (let i = 0; i < moteCount; i++) {
      let y = p.getY(i) + dt * 0.55;
      if (y > 26) y = 0.5;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.6 + i) * dt * 0.25);
    }
    p.needsUpdate = true;
  }

  return { group, update, ISLANDS, BRIDGES };
}

// ---------------------------------------------------------------- builders
function scatterProps(group, isl, T, rand) {
  const count = isl.theme === 'gloom' ? 26 : 20;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * isl.r * 0.86;
    const x = isl.cx + Math.cos(a) * rr, z = isl.cz + Math.sin(a) * rr;
    if (isl.id === 'hub' && Math.hypot(x, z + 36) < 16) continue;       // keep sanctum clear
    if (isl.id === 'hub' && Math.hypot(x, z - 26) < 8) continue;        // spawn clear
    if (isl.id === 'gloom' && Math.hypot(x - GATE_POS.x, z - GATE_POS.z) < 10) continue;
    const kind = rand();
    if (kind < 0.42) tree(group, x, z, T, rand, isl.theme === 'gloom');
    else if (kind < 0.62) crystal(group, x, z, T.crystal, rand, isl.theme === 'gloom' ? 1.5 : 1);
    else if (kind < 0.82) rock(group, x, z, T.cliff, rand);
    else flower(group, x, z, rand, isl.theme === 'gloom');
  }
}
function tree(group, x, z, T, rand, gloom) {
  const g = new THREE.Group();
  const h = 2.6 + rand() * 2.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h, 6), new THREE.MeshLambertMaterial({ color: gloom ? 0x4a3a5e : 0x7a5a3e }));
  trunk.position.y = h / 2;
  g.add(trunk);
  const canopy = new THREE.Mesh(
    gloom ? new THREE.ConeGeometry(1.5 + rand(), 2.8 + rand(), 7) : new THREE.IcosahedronGeometry(1.4 + rand() * 0.9, 0),
    new THREE.MeshLambertMaterial({ color: T.tree })
  );
  canopy.position.y = h + 0.9;
  canopy.rotation.set(rand(), rand(), rand() * 0.4);
  g.add(canopy);
  if (!gloom) {
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rand() * 0.5, 0), new THREE.MeshLambertMaterial({ color: shadeCol(T.tree, 1.15) }));
    c2.position.set(0.5, h + 1.5, 0.3);
    g.add(c2);
  }
  g.position.set(x, 0.1, z);
  group.add(g);
}
function crystal(group, x, z, color, rand, scale = 1) {
  const g = new THREE.Group();
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const hgt = (1 + rand() * 1.8) * scale;
    const c = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42 * scale + rand() * 0.25, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 })
    );
    c.scale.y = hgt / (0.6 * scale);
    c.position.set((rand() - 0.5) * 1.2, hgt * 0.35, (rand() - 0.5) * 1.2);
    c.rotation.set(rand() * 0.4, rand() * 3, rand() * 0.4);
    g.add(c);
  }
  g.position.set(x, 0.05, z);
  group.add(g);
}
function rock(group, x, z, color, rand) {
  const r = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.5 + rand() * 0.8, 0),
    new THREE.MeshLambertMaterial({ color })
  );
  r.position.set(x, 0.3, z);
  r.rotation.set(rand(), rand(), rand());
  r.scale.y = 0.6 + rand() * 0.5;
  group.add(r);
}
function flower(group, x, z, rand, gloom) {
  const colors = gloom ? [0xb06cff, 0x8a63c9] : [0xffd76e, 0xff8fae, 0x8fd4ff];
  const f = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 5, 4),
    new THREE.MeshBasicMaterial({ color: colors[Math.floor(rand() * colors.length)] })
  );
  f.position.set(x, 0.35, z);
  group.add(f);
}
function shadeCol(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}

function buildLoom(group) {
  const g = new THREE.Group();
  // platform terrace
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 1.6, 24), new THREE.MeshLambertMaterial({ color: 0xb9aed8 }));
  plat.position.set(LOOM_POS.x, 0.8, LOOM_POS.z);
  g.add(plat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(14.2, 15, 32), new THREE.MeshBasicMaterial({ color: 0xffd76e, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(LOOM_POS.x, 1.65, LOOM_POS.z);
  g.add(ring);
  // great ring gate
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(6.2, 0.55, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcf9a30, emissiveIntensity: 0.85, roughness: 0.35 })
  );
  halo.position.set(LOOM_POS.x, 8.4, LOOM_POS.z - 4);
  g.add(halo);
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(5.7, 40),
    new THREE.MeshBasicMaterial({ color: 0x7fe8dd, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  veil.position.copy(halo.position);
  g.add(veil);
  // pillars
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.4 + (i % 2) * 1.2, 8), new THREE.MeshLambertMaterial({ color: 0xd8cff0 }));
    p.position.set(LOOM_POS.x + Math.cos(a) * 11.5, 3.2, LOOM_POS.z + 4 + Math.sin(a) * 9);
    g.add(p);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x7fe8dd, emissive: 0x4fc9be, emissiveIntensity: 1 }));
    tip.position.set(p.position.x, 6.4 + (i % 2) * 1.2, p.position.z);
    g.add(tip);
  }
  group.add(g);
}

function buildHub(group, rand) {
  // elder's house
  house(group, -12, -22, 0xe8e0f5, 0x8a5a8e);
  house(group, 10, -20, 0xf2e6d8, 0x9a6a4e);
  house(group, -18, 12, 0xe0dcf0, 0x7a5a6e);
  // starwell
  const wellBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 1.1, 18), new THREE.MeshLambertMaterial({ color: 0xb9aed8 }));
  wellBase.position.set(STARWELL_POS.x, 0.55, STARWELL_POS.z);
  group.add(wellBase);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.1, 20), new THREE.MeshBasicMaterial({ color: 0x7fe8dd, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(STARWELL_POS.x, 1.12, STARWELL_POS.z);
  group.add(water);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 9, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xaffff0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(STARWELL_POS.x, 5.5, STARWELL_POS.z);
  group.add(beam);
  // quest board
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 0.22), new THREE.MeshLambertMaterial({ color: 0x8a5a3e }));
  board.position.set(17, 1.5, -6);
  group.add(board);
  for (const dx of [-1.1, 1.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22), new THREE.MeshLambertMaterial({ color: 0x6a4a30 }));
    leg.position.set(17 + dx, 0.8, -6);
    group.add(leg);
  }
  const papers = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ color: 0xfff6df }));
  papers.position.set(17, 1.5, -5.87);
  group.add(papers);
  // lanterns along path
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lx = Math.cos(a) * 30, lz = Math.sin(a) * 30;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3, 6), new THREE.MeshLambertMaterial({ color: 0x5a4a6e }));
    pole.position.set(lx, 1.5, lz);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcf9a30, emissiveIntensity: 1.2 }));
    bulb.position.set(lx, 3.2, lz);
    group.add(bulb);
  }
}
function house(group, x, z, wallC, roofC) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4.4), new THREE.MeshLambertMaterial({ color: wallC }));
  base.position.y = 1.5;
  g.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.4, 4), new THREE.MeshLambertMaterial({ color: roofC }));
  roof.position.y = 4.2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.7, 0.15), new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
  door.position.set(0, 0.85, 2.24);
  g.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcf9a30, emissiveIntensity: 0.7 }));
  win.position.set(1.6, 1.9, 2.22);
  g.add(win);
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(-z, -x) + Math.PI / 2;
  group.add(g);
}

function buildRuins(group, rand) {
  const archAt = [
    [96, -16], [124, 14], [104, 18], [118, -22],
  ];
  for (const [x, z] of archAt) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xa99bc9 });
    for (const dx of [-2.2, 2.2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), mat);
      col.position.set(dx, 2.5, 0);
      g.add(col);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1, 1.2), mat);
    top.position.y = 5.4;
    g.add(top);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcf9a30, emissiveIntensity: 1 }));
    gem.position.y = 6.4;
    g.add(gem);
    g.position.set(x, 0, z);
    g.rotation.y = rand() * Math.PI;
    group.add(g);
  }
  // sunshard pedestals (visual; pickups handled by game)
  for (const [x, z] of [[-30, 18], [100, -24], [126, -6]]) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0xb9aed8 }));
    ped.position.set(x, 0.4, z);
    group.add(ped);
  }
}

function buildGloamwoodExtras(group, rand) {
  // dense dead trunks + ash motes handled elsewhere; add obelisks
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const rr = 10 + rand() * 20;
    const x = 118 + Math.cos(a) * rr, z = 86 + Math.sin(a) * rr;
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 4 + rand() * 3, 5), new THREE.MeshStandardMaterial({ color: 0x3a3154, emissive: 0x4a2a7a, emissiveIntensity: 0.35 }));
    ob.position.set(x, 2, z);
    ob.rotation.z = (rand() - 0.5) * 0.2;
    group.add(ob);
  }
  // vesperine meeting glade
  const gladeRing = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.8, 24), new THREE.MeshBasicMaterial({ color: 0xb06cff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
  gladeRing.rotation.x = -Math.PI / 2;
  gladeRing.position.set(112, 0.06, 96);
  group.add(gladeRing);
}

function buildGate(group) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.3, 10, 36),
    new THREE.MeshStandardMaterial({ color: 0xb06cff, emissive: 0x6a2ac9, emissiveIntensity: 1 })
  );
  ring.position.y = 3;
  g.add(ring);
  const film = new THREE.Mesh(new THREE.CircleGeometry(2.35, 28), new THREE.MeshBasicMaterial({ color: 0x2a1b4a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  film.position.y = 3;
  g.add(film);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x5e5686 }));
  base.position.y = 0.3;
  g.add(base);
  g.position.set(GATE_POS.x, 0, GATE_POS.z);
  group.add(g);
}

function buildArena(group, rand) {
  const cx = ARENA_CENTER.x, cz = ARENA_CENTER.cz;
  const geo = new THREE.CylinderGeometry(30, 24, 4, 20);
  const floor = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x544a78 }));
  floor.position.set(cx, -2, cz);
  group.add(floor);
  const top = new THREE.Mesh(new THREE.CircleGeometry(30, 20), new THREE.MeshLambertMaterial({ color: 0x655a90 }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, 0.02, cz);
  group.add(top);
  const ring = new THREE.Mesh(new THREE.RingGeometry(27, 29, 24), new THREE.MeshBasicMaterial({ color: 0xb06cff, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.08, cz);
  group.add(ring);
  // shattered observatory pillars around edge
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4 + rand() * 6, 6), new THREE.MeshLambertMaterial({ color: 0x7a6ea0 }));
    p.position.set(cx + Math.cos(a) * 26, 2.5, cz + Math.sin(a) * 26);
    p.rotation.z = (rand() - 0.5) * 0.25;
    group.add(p);
  }
  // fracture tear in the sky above
  const tear = new THREE.Mesh(new THREE.CircleGeometry(6, 3), new THREE.MeshBasicMaterial({ color: 0xb06cff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  tear.position.set(cx, 34, cz);
  tear.rotation.x = Math.PI / 2.4;
  group.add(tear);
}

// walkability test
export function isWalkable(x, z) {
  for (const isl of ISLANDS) {
    if (Math.hypot(x - isl.cx, z - isl.cz) < isl.r * 0.97) return true;
  }
  if (cx_arena(x, z)) return true;
  for (const b of BRIDGES) {
    const minx = Math.min(b.x1, b.x2) - 3.2, maxx = Math.max(b.x1, b.x2) + 3.2;
    const minz = Math.min(b.z1, b.z2) - 3.2, maxz = Math.max(b.z1, b.z2) + 3.2;
    if (x > minx && x < maxx && z > minz && z < maxz) return true;
  }
  return false;
}
export function cx_arena(x, z) {
  return Math.hypot(x - ARENA_CENTER.x, z - ARENA_CENTER.cz) < 29;
}
