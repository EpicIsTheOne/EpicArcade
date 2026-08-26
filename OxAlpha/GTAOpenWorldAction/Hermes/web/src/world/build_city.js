// CHROME HARBOR — city mesh builder: ground, roads, buildings, props, landmarks, water.
// Consumes plan from layout.js. Registers static colliders into ctx.colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, clamp } from '../core/util.js';
import { WORLD } from './layout.js';
import {
  facadeTexture, signTexture, billboardTexture, groundCanvas,
  noiseTexture, glowTexture,
} from '../gfx/textures.js';

const UP = new THREE.Vector3(0, 1, 0);

export function buildCity(ctx) {
  const plan = ctx.plan;
  const rng = new RNG('citybuild' + plan.seed);
  const scene = ctx.scene;
  const colliders = ctx.colliders;
  const R = { facadeMats: [], signMats: [], lampHeads: null, signals: null, water: null, markers: [] };

  // ================= GROUND =================
  const gc = groundCanvas(plan);
  const groundMat = new THREE.MeshStandardMaterial({
    map: gc.texture, roughness: 0.94, metalness: 0.02,
    bumpMap: noiseTexture(256), bumpScale: 0.6,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  R.groundMat = groundMat;

  // ================= ROAD MARKINGS =================
  {
    const geos = [];
    const quad = (x, z, w, l, ang, color) => {
      const g = new THREE.PlaneGeometry(w, l);
      g.rotateX(-Math.PI / 2);
      if (ang) g.rotateY(ang);
      g.translate(x, 0.045, z);
      const cnt = g.attributes.position.count;
      const cols = new Float32Array(cnt * 3);
      const c3 = new THREE.Color(color);
      for (let i = 0; i < cnt; i++) { cols[i * 3] = c3.r; cols[i * 3 + 1] = c3.g; cols[i * 3 + 2] = c3.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g);
    };
    const YELLOW = '#d9a53c', WHITE = '#cfd4da';
    for (const r of plan.roadsV) addRoadMarkings(quad, r, true, YELLOW, WHITE, rng);
    for (const r of plan.roadsH) addRoadMarkings(quad, r, false, YELLOW, WHITE, rng);
    // crosswalks at signalized nodes
    for (const n of plan.nodes) {
      if (!n.signal) continue;
      const wV = n.rv.w, wH = n.rh.w;
      // crossing over the vertical road (pedestrians walk E-W): stripes along x
      for (let i = -2; i <= 2; i++) {
        quad(n.x + i * 1.05, n.z - wH / 2 - 1.6, 0.55, 3.0, 0, WHITE);
        quad(n.x + i * 1.05, n.z + wH / 2 + 1.6, 0.55, 3.0, 0, WHITE);
      }
      for (let i = -2; i <= 2; i++) {
        quad(n.x - wV / 2 - 1.6, n.z + i * 1.05, 3.0, 0.55, 0, WHITE);
        quad(n.x + wV / 2 + 1.6, n.z + i * 1.05, 3.0, 0.55, 0, WHITE);
      }
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    const mmat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const markings = new THREE.Mesh(merged, mmat);
    markings.renderOrder = 1;
    scene.add(markings);
  }

  function addRoadMarkings(quad, r, vert, YELLOW, WHITE, rng2) {
    const a = r.a + 10, b = r.b - 10;
    if (b - a < 30) return;
    const put = (off, t, w, l, col) => {
      if (vert) quad(r.c + off, t, w, l, 0, col);
      else quad(t, r.c + off, l, w, 0, col); // plane rotated: w=x,l=z handled by caller
    };
    if (r.ave) {
      // double yellow center
      for (let t = a; t < b; t += 8) {
        put(-0.28, t + 2, 0.14, 5, YELLOW); put(0.28, t + 2, 0.14, 5, YELLOW);
        // white lane dashes at ±5.4
        put(-5.4, t + 2, 0.15, 3.4, WHITE); put(5.4, t + 2, 0.15, 3.4, WHITE);
        put(-1.85, t + 6.5, 0.13, 3.4, WHITE); put(1.85, t + 6.5, 0.13, 3.4, WHITE);
      }
    } else {
      for (let t = a; t < b; t += 7) put(0, t, 0.14, 3.2, YELLOW);
    }
  }

  // ================= BUILDINGS =================
  // size-bucketed instanced meshes so window texture density stays correct
  const buckets = {}; // key -> {geoms:{side,top}, mats, list:[{m,c}]}
  const roofPropsList = [];
  const contactShadows = []; // quads under buildings

  function bucketFor(style, w, h, d) {
    const HBUCK = [6, 9, 13, 18, 26, 38, 54, 76, 105, 145, 200, 270];
    const WBUCK = [12, 16, 21, 27, 34];
    const hh = HBUCK.reduce((p, c) => Math.abs(c - h) < Math.abs(p - h) ? c : p);
    const ww = WBUCK.reduce((p, c) => Math.abs(c - w) < Math.abs(p - w) ? c : p);
    const dd = WBUCK.reduce((p, c) => Math.abs(c - d) < Math.abs(p - d) ? c : p);
    const key = style + '_' + ww + 'x' + hh + 'x' + dd;
    if (!buckets[key]) {
      const geoSide = new THREE.BoxGeometry(ww, hh, dd, 1, 1, 1);
      fixBoxUVs(geoSide, ww, hh, dd, style);
      buckets[key] = { side: geoSide, list: [] };
    }
    return { key, w: ww, h: hh, d: dd };
  }

  function fixBoxUVs(geo, w, h, d, style) {
    const uv = geo.attributes.uv;
    // BoxGeometry face order: px, nx, py, ny, pz, nz — scale side faces so windows keep real-world density
    const uW = w / 30, vH = h / 56; // texture spans ~30m horizontally, ~56m vertically
    const spans = [
      [d / 30, h / 56], [d / 30, h / 56],   // px, nx
      [w / 30, d / 30], [w / 30, d / 30],   // py(top), ny
      [w / 30, h / 56], [w / 30, h / 56],   // pz, nz
    ];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        uv.setXY(idx, uv.getX(idx) * spans[f][0], uv.getY(idx) * spans[f][1]);
      }
    }
    uv.needsUpdate = true;
  }

  const facadeCache = {};
  function facade(style, variant) {
    const k = style + variant;
    if (!facadeCache[k]) facadeCache[k] = facadeTexture(style, 1000 + variant * 77);
    return facadeCache[k];
  }
  const STYLE_VARIANTS = { glass: 3, office: 3, brick: 2, house: 2, ware: 2, hotel: 2 };

  function getFacadeMaterial(style, variant) {
    const t = facade(style, variant);
    const mat = new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color('#ffdca8'),
      emissiveIntensity: 0, roughness: style === 'glass' ? 0.32 : 0.82,
      metalness: style === 'glass' ? 0.25 : 0.04,
    });
    R.facadeMats.push(mat);
    return mat;
  }

  function addBuilding(x, z, w, d, h, style, tint, opts = {}) {
    const b = bucketFor(style, w, h, d);
    const variant = rng.int(0, STYLE_VARIANTS[style] - 1);
    buckets[b.key].list.push({
      x, z, w: b.w, h: b.h, d: b.d, style, variant, tint,
      rotY: opts.rotY || 0,
    });
    if (!opts.noCollider) colliders.insert({ x0: x - b.w / 2, x1: x + b.w / 2, z0: z - b.d / 2, z1: z + b.d / 2, h: b.h, kind: 'building' });
    if (!opts.noShadowQuad) contactShadows.push({ x, z, w: b.w + 3, d: b.d + 3 });
    if (b.h > 20 && rng.chance(0.5)) roofPropsList.push({ x, z, y: b.h, w: b.w, d: b.d, kind: rng.pick(['ac', 'ac', 'antenna', 'tank']) });
    return b;
  }

  // ---- lot subdivision & zone population ----
  for (const blk of plan.blocks) populateBlock(blk);

  function populateBlock(blk) {
    const bw = blk.x1 - blk.x0, bd = blk.z1 - blk.z0;
    const cx = blk.cx, cz = blk.cz;
    const zone = blk.zone;
    const inset = 1.2;

    if (zone === 'park') { parkify(blk); return; }
    if (zone === 'plaza') { plazaize(blk); return; }
    if (zone === 'stadium') { /* landmark pass builds it */ return; }
    if (zone === 'residential') { residential(blk); return; }
    if (zone === 'industrial') { industrial(blk); return; }

    // urban grid: perimeter-facing lots
    const cols = clamp(Math.round(bw / 42), 2, 4), rows = clamp(Math.round(bd / 42), 2, 4);
    const lw = bw / cols, ld = bd / rows;
    const heightBase = {
      downtown: 120, midtown: 46, oldtown: 22, marina: 40,
      hospital: 40, police: 34, safehouse: 16, spray: 12, stores: 24,
    }[zone] ?? 44;

    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const lx0 = blk.x0 + i * lw, lz0 = blk.z0 + j * ld;
      const lcx = lx0 + lw / 2, lcz = lz0 + ld / 2;
      if (zone === 'stores' && j === rows - 1) continue; // south strip reserved for storefront shell
      if (rng.chance(zone === 'oldtown' ? 0.06 : 0.16)) continue; // courtyard gaps/parking
      let style, hMul = 1;
      switch (zone) {
        case 'downtown':
          style = rng.chance(0.62) ? 'glass' : (rng.chance() ? 'office' : 'hotel');
          hMul = 0.35 + 0.95 * Math.exp(-dist(cx, cz, 16, -4) / 420) + rng.range(-0.08, 0.22);
          break;
        case 'midtown': style = rng.chance() ? 'office' : 'brick'; hMul = rng.range(0.6, 1.25); break;
        case 'oldtown': style = rng.chance(0.72) ? 'brick' : 'office'; hMul = rng.range(0.75, 1.3); break;
        case 'marina': style = rng.chance(0.5) ? 'hotel' : 'office'; hMul = rng.range(0.7, 1.5); break;
        case 'stores': style = rng.chance() ? 'brick' : 'office'; hMul = rng.range(0.55, 0.9); break;
        default: style = 'office'; hMul = 0.7;
      }
      const padX = rng.range(1.5, 3.5), padZ = rng.range(1.5, 3.5);
      const w = lw - padX * 2, d = ld - padZ * 2;
      let h = clamp(heightBase * hMul, 9, 268);
      if (zone === 'spray') h = 9;
      const tint = new THREE.Color().setHSL(rng.next(), rng.range(0.03, 0.12), rng.range(0.62, 0.98));
      addBuilding(lcx, lcz, w, d, h, style, tint);
      if (h < 30 && rng.chance(0.35)) { // rooftop parapet props on low buildings
        roofPropsList.push({ x: lcx, z: lcz, y: h, w: w * 0.7, d: d * 0.7, kind: rng.pick(['ac', 'vent']) });
      }
    }
  }

  function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

  function parkify(blk) {
    const n = Math.floor((blk.x1 - blk.x0) * (blk.z1 - blk.z0) / 340);
    for (let i = 0; i < n; i++) {
      treeSpots.push({
        x: rng.range(blk.x0 + 5, blk.x1 - 5), z: rng.range(blk.z0 + 5, blk.z1 - 5),
        s: rng.range(0.9, 1.7), kind: 0,
      });
    }
    for (let i = 0; i < 6; i++) propSpots.bench.push({
      x: rng.range(blk.x0 + 6, blk.x1 - 6), z: rng.range(blk.z0 + 6, blk.z1 - 6), ang: rng.range(0, 6.28),
    });
    for (let i = 0; i < 4; i++) propSpots.lampPark.push({
      x: rng.range(blk.x0 + 6, blk.x1 - 6), z: rng.range(blk.z0 + 6, blk.z1 - 6),
    });
    // pond in big park
    if ((blk.x1 - blk.x0) > 80 && dist(blk.cx, blk.cz, 330, -96) < 60) R.pond = { x: blk.cx, z: blk.cz + 8, r: Math.min(blk.x1 - blk.x0, blk.z1 - blk.z0) * 0.26 };
  }

  function plazaize(blk) {
    const n = Math.floor((blk.x1 - blk.x0) * (blk.z1 - blk.z0) / 500) + 3;
    for (let i = 0; i < n; i++) treeSpots.push({ x: rng.range(blk.x0 + 4, blk.x1 - 4), z: rng.range(blk.z0 + 4, blk.z1 - 4), s: rng.range(0.7, 1.1), kind: 1 });
    for (let i = 0; i < 5; i++) propSpots.bench.push({ x: rng.range(blk.x0 + 5, blk.x1 - 5), z: rng.range(blk.z0 + 5, blk.z1 - 5), ang: rng.range(0, 6.28) });
    propSpots.planter.push({ x: blk.cx, z: blk.cz });
  }

  function residential(blk) {
    const cols = 3, rows = 3;
    const lw = (blk.x1 - blk.x0) / cols, ld = (blk.z1 - blk.z0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (rng.chance(0.14)) continue;
      const lcx = blk.x0 + (i + 0.5) * lw + rng.range(-2, 2);
      const lcz = blk.z0 + (j + 0.5) * ld + rng.range(-2, 2);
      const w = rng.range(9, 13), d = rng.range(8, 12);
      const h = rng.chance(0.3) ? 11 : 7;
      const tint = new THREE.Color().setHSL(rng.range(0.05, 0.12), rng.range(0.25, 0.45), rng.range(0.66, 0.86));
      addBuilding(lcx, lcz, w, d, h, 'house', tint);
      // yard tree
      if (rng.chance(0.75)) treeSpots.push({ x: lcx + rng.range(-lw / 3, lw / 3), z: lcz + rng.range(-ld / 3, ld / 3), s: rng.range(0.7, 1.2), kind: rng.chance() ? 0 : 1 });
    }
  }

  function industrial(blk) {
    const n = rng.int(2, 3);
    const bw = blk.x1 - blk.x0, bd = blk.z1 - blk.z0;
    for (let i = 0; i < n; i++) {
      const w = rng.range(bw * 0.3, bw * 0.52), d = rng.range(bd * 0.3, bd * 0.5);
      const x = rng.range(blk.x0 + w / 2 + 3, blk.x1 - w / 2 - 3);
      const z = rng.range(blk.z0 + d / 2 + 3, blk.z1 - d / 2 - 3);
      addBuilding(x, z, w, d, rng.range(10, 17), 'ware',
        new THREE.Color().setHSL(rng.range(0.5, 0.62), rng.range(0.05, 0.2), rng.range(0.7, 1)));
    }
    if (rng.chance(0.5)) tankSpots.push({ x: blk.cx + rng.range(-10, 10), z: blk.cz + rng.range(-10, 10), r: rng.range(5, 8), h: rng.range(8, 13) });
    if (rng.chance(0.4)) chimneySpots.push({ x: blk.cx + rng.range(-bw * 0.3, bw * 0.3), z: blk.cz + rng.range(-bd * 0.3, bd * 0.3), h: rng.range(26, 44) });
    for (let i = 0; i < 4; i++) if (rng.chance(0.6)) treeSpots.push({ x: rng.range(blk.x0 + 3, blk.x1 - 3), z: rng.range(blk.z0 + 3, blk.z1 - 3), s: rng.range(0.6, 1), kind: 1 });
  }

  // flush buckets into InstancedMeshes
  const instancedInfo = [];
  for (const key of Object.keys(buckets)) {
    const bk = buckets[key];
    if (!bk.list.length) continue;
    const style = bk.list[0].style;
    const mat = getFacadeMaterial(style, 0); // one material per style keeps draw calls low; variety via instanceColor
    const mesh = new THREE.InstancedMesh(bk.side, mat, bk.list.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    bk.list.forEach((bld, i) => {
      Q.setFromAxisAngle(UP, bld.rotY);
      S.set(1, 1, 1); P.set(bld.x, bld.h / 2, bld.z);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
      mesh.setColorAt(i, bld.tint);
    });
    scene.add(mesh);
    instancedInfo.push(mesh);
  }

  // contact shadows (fake AO)
  {
    const gs = contactShadows.map(cs => {
      const g = new THREE.PlaneGeometry(cs.w, cs.d).rotateX(-Math.PI / 2);
      g.translate(cs.x, 0.06, cs.z);
      return g;
    });
    if (gs.length) {
      const m = new THREE.Mesh(mergeGeometries(gs, false), new THREE.MeshBasicMaterial({
        color: '#000000', transparent: true, opacity: 0.22, depthWrite: false,
      }));
      m.renderOrder = 2;
      scene.add(m);
      gs.forEach(g => g.dispose());
    }
  }

  // roof props
  buildRoofProps();
  function buildRoofProps() {
    const acG = new THREE.BoxGeometry(3, 1.6, 2.4).translate(0, 0.8, 0);
    const antG = new THREE.CylinderGeometry(0.09, 0.14, 7, 5).translate(0, 3.5, 0);
    const tankG = new THREE.CylinderGeometry(1.8, 2.1, 3.4, 8).translate(0, 1.7, 0);
    const ventG = new THREE.BoxGeometry(1.6, 0.8, 1.6).translate(0, 0.4, 0);
    const mk = (geo, kind) => {
      const list = roofPropsList.filter(p => p.kind === kind);
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#9aa1ac', roughness: .8 }), list.length);
      const M = new THREE.Matrix4();
      list.forEach((p, i) => {
        M.makeTranslation(p.x + rng.range(-p.w / 4, p.w / 4), p.y, p.z + rng.range(-p.d / 4, p.d / 4));
        mesh.setMatrixAt(i, M);
      });
      mesh.castShadow = true;
      scene.add(mesh);
    };
    mk(acG, 'ac'); mk(antG, 'antenna'); mk(tankG, 'tank'); mk(ventG, 'vent');
  }

  // tanks & chimneys
  {
    if (tankSpots.length) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
      const m = new THREE.MeshStandardMaterial({ color: '#b8bcc4', roughness: .5, metalness: .4 });
      const im = new THREE.InstancedMesh(g, m, tankSpots.length);
      const M = new THREE.Matrix4(), S = new THREE.Vector3();
      tankSpots.forEach((t, i) => {
        M.compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), S.set(t.r, t.h, t.r));
        im.setMatrixAt(i, M);
      });
      im.castShadow = true; scene.add(im);
      tankSpots.forEach(t => colliders.insert({ x0: t.x - t.r, x1: t.x + t.r, z0: t.z - t.r, z1: t.z + t.r, h: t.h, kind: 'tank' }));
    }
    if (chimneySpots.length) {
      const g = new THREE.CylinderGeometry(1, 1.6, 1, 8).translate(0, 0.5, 0);
      const m = new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: .9 });
      const im = new THREE.InstancedMesh(g, m, chimneySpots.length);
      const M = new THREE.Matrix4(), S = new THREE.Vector3();
      chimneySpots.forEach((t, i) => {
        M.compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), S.set(1.6, t.h, 1.6));
        im.setMatrixAt(i, M);
      });
      im.castShadow = true; scene.add(im);
    }
  }

  // ================= TREES & PALMS =================
  buildTrees();
  function buildTrees() {
    // beach & marina palms (north sidewalk side of Ocean Drive + scattered on sand)
    for (let x = -800; x < 800; x += rng.range(24, 60)) {
      const pz = 585 + rng.range(-3, 4);
      if (plan.roadAt(x, pz)) continue;
      treeSpots.push({ x, z: pz, s: rng.range(0.9, 1.3), kind: 2 });
      if (rng.chance(0.45)) {
        const sz = 618 + rng.range(0, 14);
        if (!plan.roadAt(x + rng.range(-6, 6), sz)) treeSpots.push({ x: x + rng.range(-6, 6), z: sz, s: rng.range(0.9, 1.3), kind: 2 });
      }
    }
    for (const b of plan.blocks) {
      if (b.zone !== 'marina') continue;
      for (let i = 0; i < 5; i++) treeSpots.push({ x: rng.range(b.x0 + 3, b.x1 - 3), z: rng.range(b.z0 + 3, b.z1 - 3), s: rng.range(0.9, 1.4), kind: 2 });
    }
    // umbrellas on sand
    for (let i = 0; i < 46; i++) {
      const x = rng.range(-760, 780), z = rng.range(616, 642);
      if (plan.roadAt(x, z)) continue;
      propSpots.umbrella.push({ x, z, ang: rng.range(0, 6.28) });
      if (rng.chance(0.8)) propSpots.towel.push({ x: x + rng.range(-3, 3), z: z + rng.range(-3, 3), ang: rng.range(0, 6.28) });
    }
    // rocks at waterline
    const rockG = new THREE.DodecahedronGeometry(1, 0);
    const rocks = [];
    for (let x = -850; x < 850; x += rng.range(9, 22)) rocks.push({ x, z: 649 + rng.range(-2, 3), s: rng.range(0.7, 2.2) });
    const rm = new THREE.InstancedMesh(rockG, new THREE.MeshStandardMaterial({ color: '#8a8d92', roughness: .95 }), rocks.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    rocks.forEach((r, i) => {
      Q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3)));
      M.compose(new THREE.Vector3(r.x, r.s * 0.3, r.z), Q, S.set(r.s, r.s * 0.7, r.s));
      rm.setMatrixAt(i, M);
    });
    rm.castShadow = true; rm.receiveShadow = true; scene.add(rm);

    // oak-ish trees (kind 0/1) and palms (kind 2)
    const trunkG = new THREE.CylinderGeometry(0.22, 0.34, 1, 6).translate(0, 0.5, 0);
    const canG0 = new THREE.IcosahedronGeometry(1.9, 1).translate(0, 3.6, 0);
    const canG1 = new THREE.IcosahedronGeometry(1.3, 1).translate(0, 2.7, 0);
    const palmTrunkParts = [];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.CylinderGeometry(0.16 - i * 0.015, 0.2 - i * 0.015, 1.15, 5);
      seg.translate(0, 0.57, 0);
      seg.rotateZ(i * 0.075);
      seg.translate(0, i * 1.05, 0);
      palmTrunkParts.push(seg);
    }
    const palmTrunkG = mergeGeometries(palmTrunkParts, false);
    palmTrunkParts.forEach(g => g.dispose());
    const fronds = [];
    for (let i = 0; i < 7; i++) {
      const fr = new THREE.ConeGeometry(0.5, 3.4, 4);
      fr.scale(1, 1, 0.28);
      fr.rotateX(Math.PI / 2.35);
      fr.rotateY(i * (Math.PI * 2 / 7));
      fr.translate(0, 5.6, 0);
      fronds.push(fr);
    }
    const palmFrondG = mergeGeometries(fronds, false);
    fronds.forEach(f => f.dispose());

    const groups = [[], [], []];
    treeSpots.forEach(t => groups[t.kind].push(t));
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: .95 });
    const canMat0 = new THREE.MeshStandardMaterial({ color: '#4d7a37', roughness: .95 });
    const canMat1 = new THREE.MeshStandardMaterial({ color: '#5d8a41', roughness: .95 });
    const frondMat = new THREE.MeshStandardMaterial({ color: '#4f8a3f', roughness: .9 });

    const inst = (geo, mat, list, fn) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
      list.forEach((t, i) => { fn(t, M, Q, S); im.setMatrixAt(i, M); });
      im.castShadow = true; im.receiveShadow = true;
      scene.add(im);
      return im;
    };
    inst(trunkG, trunkMat, groups[0], (t, M, Q, S) => { M.compose(new THREE.Vector3(t.x, 0, t.z), Q.identity(), S.set(t.s, 3.2 * t.s, t.s)); });
    inst(canG0, canMat0, groups[0], (t, M, Q, S) => { Q.setFromAxisAngle(UP, rng.range(0, 6)); M.compose(new THREE.Vector3(t.x, 0, t.z), Q, S.set(t.s, t.s * rng.range(.9, 1.2), t.s)); });
    inst(trunkG, trunkMat, groups[1], (t, M, Q, S) => { M.compose(new THREE.Vector3(t.x, 0, t.z), Q.identity(), S.set(t.s * .8, 2.4 * t.s, t.s * .8)); });
    inst(canG1, canMat1, groups[1], (t, M, Q, S) => { Q.setFromAxisAngle(UP, rng.range(0, 6)); M.compose(new THREE.Vector3(t.x, 0, t.z), Q, S.set(t.s, t.s, t.s)); });
    inst(palmTrunkG, trunkMat, groups[2], (t, M, Q, S) => {
      Q.setFromAxisAngle(UP, rng.range(0, 6.28));
      M.compose(new THREE.Vector3(t.x, 0, t.z), Q, S.set(t.s, t.s, t.s));
    });
    inst(palmFrondG, frondMat, groups[2], (t, M, Q, S) => {
      Q.setFromAxisAngle(UP, rng.range(0, 6.28));
      S.set(t.s, t.s, t.s);
      M.compose(new THREE.Vector3(t.x, 0, t.z), Q, S);
    });
    // tree colliders (trunk only)
    for (const t of treeSpots) {
      const r = 0.5 * t.s;
      colliders.insert({ x0: t.x - r, x1: t.x + r, z0: t.z - r, z1: t.z + r, h: 4, kind: 'tree' });
    }
  }

  // ================= STREET FURNITURE =================
  seedPropSpots();      // fills propSpots lists first
  buildStreetStuff();   // then builds instanced props from them
  function buildStreetStuff() {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();

    // street lamps along every road, both sides
    const lampPoleParts = [
      new THREE.CylinderGeometry(0.09, 0.13, 7.2, 6).translate(0, 3.6, 0),
      new THREE.BoxGeometry(1.7, 0.12, 0.14).translate(0.8, 7.15, 0),
    ];
    const lampPoleG = mergeGeometries(lampPoleParts, false);
    lampPoleParts.forEach(g => g.dispose());
    const lampHeadG = new THREE.SphereGeometry(0.3, 8, 6);
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#fff2cf', emissive: '#ffdf9e', emissiveIntensity: 0 });
    R.lampHeadMat = lampHeadMat;
    const glowGeo = new THREE.PlaneGeometry(7, 7);
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a0' });
    R.lampGlowMat = glowMat;

    const polePos = [], headPos = [], glowPos = [];
    for (const r of [...plan.roadsV, ...plan.roadsH]) {
      const vert = r.axis === 'v';
      for (let t = r.a + 14; t < r.b - 10; t += 31) {
        for (const side of [-1, 1]) {
          if (!rng.chance(0.86)) continue;
          const off = side * (r.w / 2 + 2.9);
          const x = vert ? r.c + off : t + rng.range(-3, 3);
          const z = vert ? t + rng.range(-3, 3) : r.c + off;
          if (z > WORLD_LIMIT_Z) continue;
          const rot = vert ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          polePos.push({ x, z, rot });
          // arm tip: rotated arm points inward toward the road
          headPos.push({
            x: x + (vert ? -side * 1.5 : 0),
            z: z + (vert ? 0 : side * 1.5),
          });
        }
      }
    }
    const inst2 = (geo, mat, list, fn) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => { fn(p, i); im.setMatrixAt(i, M); });
      scene.add(im);
      return im;
    };
    inst2(lampPoleG, new THREE.MeshStandardMaterial({ color: '#3c4149', roughness: .6, metalness: .6 }), polePos,
      (p) => { Q.setFromAxisAngle(UP, p.rot); S.set(1, 1, 1); M.compose(new THREE.Vector3(p.x, 0, p.z), Q, S); });
    R.lampHeads = inst2(lampHeadG, lampHeadMat, headPos, (p) => { M.makeTranslation(p.x, 6.95, p.z); });
    // warm light pools on the ground under each lamp (night beauty on a budget)
    const glowIM = inst2(glowGeo, glowMat, glowPos, (p) => {
      Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      S.set(2.4, 2.4, 1);
      M.compose(new THREE.Vector3(p.x, 0.07, p.z), Q, S);
      S.set(1, 1, 1);
    });
    if (glowIM) glowIM.renderOrder = 5;

    // hydrants / bins / benches / planters
    const hydG = mergeGeometries([
      new THREE.CylinderGeometry(0.22, 0.26, 0.75, 6).translate(0, 0.37, 0),
      new THREE.SphereGeometry(0.2, 6, 5).translate(0, 0.78, 0),
    ], false);
    const binG = new THREE.CylinderGeometry(0.34, 0.3, 0.95, 8).translate(0, 0.47, 0);
    const benchParts = [
      new THREE.BoxGeometry(2.2, 0.09, 0.55).translate(0, 0.5, 0),
      new THREE.BoxGeometry(2.2, 0.5, 0.08).translate(0, 0.78, -0.26),
      new THREE.BoxGeometry(0.09, 0.5, 0.5).translate(-0.95, 0.25, 0),
      new THREE.BoxGeometry(0.09, 0.5, 0.5).translate(0.95, 0.25, 0),
    ];
    const benchG = mergeGeometries(benchParts, false);
    benchParts.forEach(g => g.dispose());
    const woodMat = new THREE.MeshStandardMaterial({ color: '#7a5b39', roughness: .9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: .5, metalness: .5 });

    // simple direct builders:
    const buildInst = (geo, mat, list, shadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        Q.setFromAxisAngle(UP, p.ang || 0);
        M.compose(new THREE.Vector3(p.x, 0, p.z), Q, S.set(1, 1, 1));
        im.setMatrixAt(i, M);
      });
      im.castShadow = shadow;
      scene.add(im);
      return im;
    };
    buildInst(hydG, new THREE.MeshStandardMaterial({ color: '#c23b2e', roughness: .6 }), propSpots.hydrant);
    buildInst(binG, ironMat, propSpots.bin);
    buildInst(benchG, woodMat, propSpots.bench);
    buildInst(new THREE.CylinderGeometry(0.9, 1.0, 0.6, 8).translate(0, 0.3, 0),
      new THREE.MeshStandardMaterial({ color: '#8f8878', roughness: .9 }), propSpots.planter);

    // bus stops near avenues
    const stopParts = [
      new THREE.BoxGeometry(4.4, 0.12, 1.7).translate(0, 2.6, 0),
      new THREE.BoxGeometry(0.12, 2.6, 1.7).translate(-2.1, 1.3, 0),
      new THREE.BoxGeometry(0.12, 2.6, 1.7).translate(2.1, 1.3, 0),
      new THREE.BoxGeometry(4.4, 2.6, 0.1).translate(0, 1.3, -0.8),
      new THREE.BoxGeometry(4.2, 0.08, 0.6).translate(0, 0.55, 0.3),
    ];
    const stopG = mergeGeometries(stopParts, false);
    buildInst(stopG, new THREE.MeshStandardMaterial({ color: '#5b6672', roughness: .5, metalness: .4 }), propSpots.busstop);
  }

  // sidewalk prop scatter points (filled during road loops above via propSpots)
  function seedPropSpots() {
    const rr = new RNG('props' + plan.seed);
    for (const r of [...plan.roadsV, ...plan.roadsH]) {
      const vert = r.axis === 'v';
      for (let t = r.a + 20; t < r.b - 20; t += 47) {
        for (const side of [-1, 1]) {
          if (!rr.chance(0.5)) continue;
          const off = side * (r.w / 2 + 3.6);
          const x = vert ? r.c + off : t;
          const z = vert ? t : r.c + off;
          if (z > WORLD_LIMIT_Z || plan.roadAt(x, z)) continue;
          const roll = rr.next();
          const spot = { x, z, ang: vert ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI) };
          if (roll < 0.3) propSpots.hydrant.push(spot);
          else if (roll < 0.62) propSpots.bin.push(spot);
          else if (roll < 0.68 && r.ave) propSpots.busstop.push(spot);
        }
      }
    }
  }

  // ================= TRAFFIC SIGNALS =================
  {
    const sigNodes = plan.nodes.filter(n => n.signal);
    const poleParts = [
      new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6).translate(0, 2.8, 0),
      new THREE.BoxGeometry(0.12, 0.1, 2.2).translate(0, 5.5, 1.1),
    ];
    const poleG = mergeGeometries(poleParts, false);
    const poles = [], heads = [];
    for (const n of sigNodes) {
      // two corners diagonal
      const corners = [
        { dx: -(n.rv.w / 2 + 2.2), dz: -(n.rh.w / 2 + 2.2), axis: 'v' },
        { dx: (n.rv.w / 2 + 2.2), dz: (n.rh.w / 2 + 2.2), axis: 'v' },
        { dx: (n.rv.w / 2 + 2.2), dz: -(n.rh.w / 2 + 2.2), axis: 'h' },
        { dx: -(n.rv.w / 2 + 2.2), dz: (n.rh.w / 2 + 2.2), axis: 'h' },
      ];
      for (const c of corners) {
        poles.push({ x: n.x + c.dx, z: n.z + c.dz, rot: c.axis === 'v' ? 0 : Math.PI / 2 });
        heads.push({
          x: n.x + c.dx,
          z: n.z + c.dz + (c.axis === 'v' ? 2.1 : 0),
          axis: c.axis, node: n, idx: -1,
        });
      }
      heads.forEach((h, i) => { h.idx = i; });
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1);
    if (poles.length) {
      const pm = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: '#33373d', roughness: .6, metalness: .5 }), poles.length);
      poles.forEach((p, i) => {
        Q.setFromAxisAngle(UP, p.rot);
        M.compose(new THREE.Vector3(p.x, 0, p.z), Q, S);
        pm.setMatrixAt(i, M);
      });
      pm.castShadow = true; scene.add(pm);
    }
    const headG = new THREE.BoxGeometry(0.5, 1.2, 0.4).translate(0, 4.9, 0);
    const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.4, toneMapped: true });
    const hm = new THREE.InstancedMesh(headG, headMat, heads.length);
    heads.forEach((h, i) => {
      Q.setFromAxisAngle(UP, h.axis === 'v' ? 0 : Math.PI / 2);
      S.set(1, 1, 1);
      M.compose(new THREE.Vector3(h.x, 0, h.z), Q, S);
      hm.setMatrixAt(i, M);
      hm.setColorAt(i, RED_C);
    });
    scene.add(hm);
    R.signals = { mesh: hm, heads };

    // phase model shared with traffic AI:
    const CYCLE = 13, GREEN = 5.3, YELLOW = 2.4;
    R.updateSignals = (elapsed) => {
      let dirty = false;
      for (const h of heads) {
        const ph = (elapsed + h.node.phase) % CYCLE;
        const mineGreen = ph < GREEN && h.axis === 'v';
        const mineYellow = ph >= GREEN - YELLOW && ph < GREEN && h.axis === 'v';
        const crossGreen = ph >= GREEN && ph < GREEN * 2 && h.axis !== 'v';
        const crossYellow = ph >= GREEN * 2 - YELLOW && ph < GREEN * 2 && h.axis !== 'v';
        let col;
        if (mineGreen || crossGreen) col = mineYellow || crossYellow ? AMBER_C : GREEN_C;
        else col = RED_C;
        const prev = R.signals.heads[h.idx].col;
        if (prev !== col.getHex()) {
          hm.setColorAt(h.idx, col);
          R.signals.heads[h.idx].col = col.getHex();
          dirty = true;
        }
      }
      if (dirty) hm.instanceColor.needsUpdate = true;
    };
    // query helper used by traffic AI: returns 'green'|'yellow'|'red' for an axis at time t
    R.signalPhaseFor = (node, axisV, elapsed) => {
      const ph = (elapsed + node.phase) % CYCLE;
      if (ph < GREEN) {
        if (!axisV) return 'red';
        return ph > GREEN - YELLOW ? 'yellow' : 'green';
      }
      if (ph < GREEN * 2) {
        if (axisV) return 'red';
        return ph > GREEN * 2 - YELLOW ? 'yellow' : 'green';
      }
      return 'red'; // all-red clearance window
    };
  }

  // ================= STOREFRONTS (robable) =================
  buildStores();
  function buildStores() {
    const rr = new RNG('stores');
    for (const st of plan.landmarks.stores) {
      const b = st.b;
      const fw = Math.min(16, (b.x1 - b.x0) * 0.5), fd = 10;
      const fx = b.cx, fz = b.z1 - fd / 2 - 0.5; // front on south edge
      // shell: back wall, two sides, ceiling
      const wallMat = new THREE.MeshStandardMaterial({ color: '#4c423a', roughness: .85 });
      const parts = [
        new THREE.BoxGeometry(fw, 4.2, 0.4).translate(0, 2.1, -fd / 2),
        new THREE.BoxGeometry(0.4, 4.2, fd).translate(-fw / 2, 2.1, 0),
        new THREE.BoxGeometry(0.4, 4.2, fd).translate(fw / 2, 2.1, 0),
        new THREE.BoxGeometry(fw, 0.4, fd).translate(0, 4.2, 0),
      ];
      const shellG = mergeGeometries(parts, false);
      parts.forEach(p => p.dispose());
      const shell = new THREE.Mesh(shellG, wallMat);
      shell.position.set(fx, 0.02, fz);
      shell.castShadow = true; shell.receiveShadow = true;
      ctx.scene.add(shell);
      colliders.insert({ x0: fx - fw / 2, x1: fx + fw / 2, z0: fz - fd / 2 - 0.2, z1: fz - fd / 2 + 0.25, h: 4.2, kind: 'wall' });
      colliders.insert({ x0: fx - fw / 2 - 0.2, x1: fx - fw / 2 + 0.2, z0: fz - fd / 2, z1: fz + fd / 2, h: 4.2, kind: 'wall' });
      colliders.insert({ x0: fx + fw / 2 - 0.2, x1: fx + fw / 2 + 0.2, z0: fz - fd / 2, z1: fz + fd / 2, h: 4.2, kind: 'wall' });
      // counter + shelves
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.1, 1), new THREE.MeshStandardMaterial({ color: '#6b5a48' }));
      counter.position.set(fx, 0.55, fz - fd / 2 + 1.4);
      ctx.scene.add(counter);
      colliders.insert({ x0: fx - 2.3, x1: fx + 2.3, z0: fz - fd / 2 + 0.9, z1: fz - fd / 2 + 1.9, h: 1.1, kind: 'prop' });
      st.counter = { x: counter.position.x, z: counter.position.z };
      st.door = { x: fx, z: fz + fd / 2 };
      // neon sign above door
      const smat = new THREE.MeshBasicMaterial({ map: signTexture(rr.int(0, 13)), transparent: false });
      R.signMats.push(smat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.9), smat);
      sign.position.set(fx, 5.4, fz + fd / 2 - 0.05);
      sign.rotation.y = 0;
      ctx.scene.add(sign);
    }
  }

  // ================= LANDMARKS =================
  buildLandmarks();

  function buildLandmarks() {
    const LM = plan.landmarks;

    // --- The Spire ---
    {
      const g = new THREE.Group();
      const podium = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 44),
        new THREE.MeshStandardMaterial({ color: '#7d8794', roughness: .5, metalness: .3 }));
      podium.position.y = 7; podium.castShadow = true; podium.receiveShadow = true;
      g.add(podium);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: '#5d7285', roughness: .25, metalness: .65,
        emissive: '#ffd9a0', emissiveIntensity: 0, emissiveMap: facade('glass', 0).emissive,
      });
      R.facadeMats.push(shaftMat);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 216, 8), shaftMat);
      shaft.position.y = 14 + 108; shaft.castShadow = true;
      g.add(shaft);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(9.4, 26, 8),
        new THREE.MeshStandardMaterial({ color: '#cfd6de', roughness: .3, metalness: .7 }));
      crown.position.y = 230 + 13; crown.castShadow = true;
      g.add(crown);
      const obsRing = new THREE.Mesh(new THREE.TorusGeometry(11.5, 1.2, 8, 24).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#222', emissive: '#4fd8e0', emissiveIntensity: 2 }));
      obsRing.position.y = 212;
      g.add(obsRing);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 34, 6),
        new THREE.MeshStandardMaterial({ color: '#aab2bb', metalness: .8, roughness: .3 }));
      mast.position.y = 256 + 17;
      g.add(mast);
      const beacon = new THREE.PointLight('#ff3b47', 0, 260, 1.6);
      beacon.position.set(0, 292, 0);
      g.add(beacon);
      R.spireBeacon = beacon;
      const spireLight = new THREE.PointLight('#4fd8e0', 30, 130, 1.8);
      spireLight.position.set(0, 212, 0);
      g.add(spireLight);
      g.position.set(LM.spire.x, 0, LM.spire.z);
      ctx.scene.add(g);
      colliders.insert({ x0: LM.spire.x - 22, x1: LM.spire.x + 22, z0: LM.spire.z - 22, z1: LM.spire.z + 22, h: 14, kind: 'podium' });
      colliders.insert({ x0: LM.spire.x - 13, x1: LM.spire.x + 13, z0: LM.spire.z - 13, z1: LM.spire.z + 13, h: 240, kind: 'tower' });
    }

    // --- Stadium ---
    if (LM.stadium) {
      const { x, z } = LM.stadium;
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 22, 36, 1, true),
        new THREE.MeshStandardMaterial({ color: '#b9bfc7', roughness: .8, side: THREE.DoubleSide }));
      bowl.position.y = 11; bowl.castShadow = true;
      g.add(bowl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(55, 2.4, 8, 36).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#8f97a1', roughness: .6 }));
      rim.position.y = 22; g.add(rim);
      const field = new THREE.Mesh(new THREE.CircleGeometry(46, 30).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#3f7d33', roughness: 1 }));
      field.position.y = 0.15; field.receiveShadow = true;
      g.add(field);
      for (let i = 0; i < 4; i++) {
        const pyl = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2),
          new THREE.MeshStandardMaterial({ color: '#6b7178' }));
        const a = i * Math.PI / 2 + Math.PI / 4;
        pyl.position.set(Math.cos(a) * 62, 17, Math.sin(a) * 62);
        g.add(pyl);
        const lampHead = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 1.2),
          new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffeecb', emissiveIntensity: 0 }));
        lampHead.position.set(Math.cos(a) * 59, 33, Math.sin(a) * 59);
        lampHead.lookAt(0, 10, 0);
        g.add(lampHead);
        (R.stadiumLamps ??= []).push(lampHead.material);
      }
      g.position.set(x, 0, z);
      ctx.scene.add(g);
      colliders.insert({ x0: x - 58, x1: x + 58, z0: z - 58, z1: z + 58, h: 22, kind: 'stadium' });
    }

    // --- Radio tower ---
    {
      const { x, z } = LM.radioTower;
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: '#b23545', roughness: .6, metalness: .4 });
      for (const [r0, r1, h] of [[3, 2.4, 30], [2.4, 1.7, 30], [1.7, 1.1, 30], [1.1, 0.5, 30]]) {}
      let y = 0, rad = 3.4;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.78, rad, 24, 6, 1, true), mat);
        seg.position.y = y + 12;
        g.add(seg);
        y += 24; rad *= 0.74;
      }
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 18, 5), mat);
      tip.position.y = y + 9; g.add(tip);
      const bl = new THREE.PointLight('#ff4450', 20, 160, 1.7);
      bl.position.y = y + 16; g.add(bl);
      R.radioBeacon = bl;
      g.position.set(x, 0, z);
      ctx.scene.add(g);
      colliders.insert({ x0: x - 4, x1: x + 4, z0: z - 4, z1: z + 4, h: 120, kind: 'tower' });
    }

    // --- Ferris wheel pier ---
    {
      const P = LM.ferrisPier;
      const deckMat = new THREE.MeshStandardMaterial({ color: '#8f7a5c', roughness: .9 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 150), deckMat);
      deck.position.set(P.x, 1.4, P.z - 20);
      deck.receiveShadow = true;
      ctx.scene.add(deck);
      // legs into water
      for (let i = 0; i < 6; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 8, 6), deckMat);
        leg.position.set(P.x + (i % 2 ? 10 : -10), -1.5, P.z - 70 + i * 24);
        ctx.scene.add(leg);
      }
      colliders.insert({ x0: P.x - 13, x1: P.x + 13, z0: P.z - 96, z1: P.z + 56, h: 2, kind: 'pier' });
      // railings visual only
      // wheel
      const wg = new THREE.Group();
      const rimMat = new THREE.MeshStandardMaterial({ color: '#d8dde4', roughness: .4, metalness: .6, emissive: '#ff5f8f', emissiveIntensity: .35 });
      const wheel = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(19, 0.8, 8, 40), rimMat);
      wheel.add(rim);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(13, 0.5, 8, 32), rimMat);
      wheel.add(rim2);
      for (let i = 0; i < 12; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.35, 38, 0.35), rimMat);
        spoke.rotation.z = i * Math.PI / 12;
        wheel.add(spoke);
      }
      for (let i = 0; i < 10; i++) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2.4),
          new THREE.MeshStandardMaterial({ color: ['#ff5f8f', '#4fd8e0', '#ffb43a'][i % 3], roughness: .5 }));
        const a = i * Math.PI * 2 / 10;
        cab.position.set(Math.cos(a) * 19, Math.sin(a) * 19, 0);
        wheel.add(cab);
      }
      wheel.position.y = 24;
      wg.add(wheel);
      const A1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, 1.4), rimMat);
      A1.position.set(-3.5, 12, 0); A1.rotation.z = 0.22;
      const A2 = A1.clone(); A2.position.x = 3.5; A2.rotation.z = -0.22;
      wg.add(A1, A2);
      wg.position.set(P.x, 2, P.z - 92);
      ctx.scene.add(wg);
      R.ferrisWheel = wheel;
      colliders.insert({ x0: P.x - 6, x1: P.x + 6, z0: P.z - 116, z1: P.z - 70, h: 50, kind: 'wheel' });
    }

    // --- Harbor cranes + ship + containers ---
    {
      const craneMat = new THREE.MeshStandardMaterial({ color: '#c7b25a', roughness: .6, metalness: .35 });
      for (const c of LM.cranes) {
        const g = new THREE.Group();
        const legG = new THREE.BoxGeometry(1.6, 30, 1.6);
        for (const [lx, lz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
          const leg = new THREE.Mesh(legG, craneMat);
          leg.position.set(lx, 15, lz);
          g.add(leg);
        }
        const boom = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 52), craneMat);
        boom.position.set(0, 31, -8);
        g.add(boom);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 4),
          new THREE.MeshStandardMaterial({ color: '#5b6672' }));
        cab.position.set(0, 26, 6); g.add(cab);
        g.position.set(c.x, 0, c.z);
        g.rotation.y = rng.range(-0.4, 0.4);
        ctx.scene.add(g);
        colliders.insert({ x0: c.x - 8, x1: c.x + 8, z0: c.z - 8, z1: c.z + 8, h: 32, kind: 'crane' });
      }
      // container stacks scattered in industrial blocks near water
      const contGeo = new THREE.BoxGeometry(6.1, 2.6, 2.5);
      const contMats = ['#b3443c', '#3c6ab3', '#3ca35a', '#b3863c'].map(c =>
        new THREE.MeshStandardMaterial({ color: c, roughness: .7, metalness: .2 }));
      const stacks = [];
      for (const b of plan.blocks) {
        if (b.zone !== 'industrial' || b.cz < 300) continue;
        for (let i = 0; i < 8; i++) {
          stacks.push({ x: rng.range(b.x0 + 5, b.x1 - 5), z: rng.range(b.z0 + 5, b.z1 - 5), h: rng.int(1, 3), m: rng.int(0, 3) });
        }
      }
      for (const mi of [0, 1, 2, 3]) {
        const list = stacks.filter(s => s.m === mi);
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(contGeo, contMats[mi], list.reduce((a, s) => a + s.h, 0));
        const M = new THREE.Matrix4(); let k = 0;
        list.forEach(s => {
          for (let yy = 0; yy < s.h; yy++) {
            M.makeRotationY(rng.range(-0.06, 0.06));
            M.setPosition(s.x, 1.3 + yy * 2.65, s.z);
            im.setMatrixAt(k++, M);
          }
        });
        im.count = k;
        im.castShadow = true; im.receiveShadow = true;
        ctx.scene.add(im);
      }
      for (const s of stacks) colliders.insert({ x0: s.x - 3, x1: s.x + 3, z0: s.z - 1.3, z1: s.z + 1.3, h: s.h * 2.65, kind: 'container' });
      // cargo ship
      const sg = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(46, 10, 150),
        new THREE.MeshStandardMaterial({ color: '#37404d', roughness: .6, metalness: .3 }));
      hull.position.y = 3; sg.add(hull);
      const sup = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 20),
        new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: .5 }));
      sup.position.set(0, 15, 58); sg.add(sup);
      sg.position.set(LM.ship.x, -2.2, LM.ship.z);
      ctx.scene.add(sg);
    }

    // --- Arch gate straddling Ocean Drive (road runs E-W; gate spans across it N-S) ---
    {
      const A = LM.archGate;
      const roadHalf = 8;
      const mat = new THREE.MeshStandardMaterial({ color: '#cdd3da', roughness: .5 });
      const g = new THREE.Group();
      for (const sz of [-(roadHalf + 3.5), (roadHalf + 3.5)]) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(5, 26, 4), mat);
        pylon.position.set(A.x, 13, A.z + sz);
        pylon.castShadow = true;
        g.add(pylon);
      }
      const span = (roadHalf + 3.5) * 2;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 2.4, 8, 24, Math.PI), mat);
      arch.position.set(A.x, 26, A.z);
      arch.rotation.y = Math.PI / 2; // stand in the YZ plane so it bridges the E-W road
      arch.scale.set(1, 1, 1);
      g.add(arch);
      ctx.scene.add(g);
      colliders.insert({ x0: A.x - 2.5, x1: A.x + 2.5, z0: A.z - roadHalf - 5.5, z1: A.z - roadHalf - 1.5, h: 26, kind: 'pylon' });
      colliders.insert({ x0: A.x - 2.5, x1: A.x + 2.5, z0: A.z + roadHalf + 1.5, z1: A.z + roadHalf + 5.5, h: 26, kind: 'pylon' });
    }

    // --- Hospital & Police HQ & Safehouse & Spray signage ---
    const signPlane = (txt, bg, fg, w = 10, h = 2.6) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const x2 = c.getContext('2d');
      x2.fillStyle = bg; x2.fillRect(0, 0, 512, 128);
      x2.fillStyle = fg; x2.font = '900 64px Arial Black, Arial';
      x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillText(txt, 256, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    };
    if (LM.hospital) {
      const s = signPlane('PORT VELA MEDICAL', '#f4f6f8', '#c23b2e', 16, 4);
      s.position.set(LM.hospital.x, 12, LM.hospital.spawn.z + 14);
      ctx.scene.add(s);
    }
    if (LM.policeHQ) {
      const s = signPlane('PVPD CENTRAL', '#1d3a6b', '#ffffff', 14, 3.4);
      s.position.set(LM.policeHQ.x, 10, LM.policeHQ.spawn.z + 14);
      ctx.scene.add(s);
    }
    for (const sp of LM.sprayShops) {
      const s = signPlane("SPRAY 'N' GO", '#20242c', '#4fd8e0', 11, 2.6);
      s.position.set(sp.x, 7.5, sp.z + 8);
      ctx.scene.add(s);
      // garage shell with open front
      const shellMat = new THREE.MeshStandardMaterial({ color: '#4c5158', roughness: .8 });
      const parts = [
        new THREE.BoxGeometry(16, 6, 0.5).translate(0, 3, -6),
        new THREE.BoxGeometry(0.5, 6, 12).translate(-8, 3, 0),
        new THREE.BoxGeometry(0.5, 6, 12).translate(8, 3, 0),
        new THREE.BoxGeometry(16, 0.5, 12).translate(0, 6, 0),
      ];
      const g2 = mergeGeometries(parts, false);
      parts.forEach(p => p.dispose());
      const m = new THREE.Mesh(g2, shellMat);
      m.position.set(sp.x, 0, sp.z - 2);
      m.castShadow = true; m.receiveShadow = true;
      ctx.scene.add(m);
      colliders.insert({ x0: sp.x - 8, x1: sp.x + 8, z0: sp.z - 8.2, z1: sp.z - 7.8, h: 6, kind: 'wall' });
      colliders.insert({ x0: sp.x - 8.2, x1: sp.x - 7.8, z0: sp.z - 8, z1: sp.z + 4, h: 6, kind: 'wall' });
      colliders.insert({ x0: sp.x + 7.8, x1: sp.x + 8.2, z0: sp.z - 8, z1: sp.z + 4, h: 6, kind: 'wall' });
      sp.inside = { x: sp.x, z: sp.z - 2 };
    }
    if (LM.safehouse) {
      const s = signPlane('YOUR LOFT', '#2c2338', '#ffb43a', 9, 2.2);
      s.position.set(LM.safehouse.x, 8, LM.safehouse.z + 20);
      ctx.scene.add(s);
    }
  }

  // ================= BILLBOARDS =================
  {
    const rr = new RNG('boards');
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: .6 });
    const spots = [
      { x: -250, z: -380, y: 34 }, { x: 320, z: -140, y: 40 }, { x: -520, z: 210, y: 26 },
      { x: 480, z: 330, y: 30 }, { x: -60, z: 520, y: 24 },
    ];
    spots.forEach((sp, i) => {
      const tex = billboardTexture(i);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      R.signMats.push(mat);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), mat);
      board.position.set(sp.x, sp.y, sp.z);
      board.rotation.y = rr.range(0, 6.28);
      const back = new THREE.Mesh(new THREE.BoxGeometry(19, 10, 0.7), frameMat);
      back.position.copy(board.position); back.rotation.copy(board.rotation);
      back.translateZ(-0.4);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(1, sp.y, 1), frameMat);
      legs.position.set(sp.x, sp.y / 2, sp.z);
      ctx.scene.add(back, legs, board);
    });
  }

  // ================= WATER =================
  {
    const waterGeo = new THREE.PlaneGeometry(2600, 800, 48, 24).rotateX(-Math.PI / 2);
    const nm = makeWaterNormals();
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#155a70', roughness: 0.12, metalness: 0.55,
      normalMap: nm, envMapIntensity: 1.4,
      transparent: true, opacity: 0.94,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -0.35, WORLD.waterZ + 380);
    water.receiveShadow = false;
    ctx.scene.add(water);
    R.water = { mesh: water, mat: waterMat, normals: nm, offset: 0 };
  }

  // pond in Meridian Green
  if (R.pond) {
    const pm = new THREE.Mesh(new THREE.CircleGeometry(R.pond.r, 26).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1d5a6e', roughness: 0.15, metalness: .5 }));
    pm.position.set(R.pond.x, 0.08, R.pond.z);
    ctx.scene.add(pm);
  }

  buildBeach(ctx);

  return R;
  function makeWaterNormals() {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x2 = c.getContext('2d');
    const img = x2.createImageData(S, S);
    const rr = new RNG('waterN');
    // simple value-noise-ish normal map
    const h = new Float32Array(S * S);
    for (let i = 0; i < h.length; i++) h[i] = rr.next();
    for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
      const v =
        h[y * S + xx] * 0.4 +
        h[((y + 7) % S) * S + ((xx + 13) % S)] * 0.3 +
        h[((y + 31) % S) * S + ((xx + 57) % S)] * 0.3;
      const dx = (h[y * S + ((xx + 1) % S)] - h[y * S + xx]);
      const dy = (h[((y + 1) % S) * S + xx] - h[y * S + xx]);
      const i = (y * S + xx) * 4;
      img.data[i] = 128 + dx * 260; img.data[i + 1] = 128 + dy * 260; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    x2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 12);
    return t;
  }
}

// accumulators used by block population before final instancing
const treeSpots = [], tankSpots = [], chimneySpots = [];
const propSpots = { hydrant: [], bin: [], bench: [], planter: [], busstop: [], umbrella: [], towel: [], lampPark: [] };
const WORLD_LIMIT_Z = 600;
const RED_C = new THREE.Color('#ff2e3e'), AMBER_C = new THREE.Color('#ffb43a'), GREEN_C = new THREE.Color('#2eff6a');

// beach umbrellas + towels (reads propSpots filled by buildTrees)
function buildBeach(ctx) {
  if (!propSpots.umbrella.length && !propSpots.towel.length) return;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const umbParts = [
    new THREE.ConeGeometry(1.9, 0.9, 8).translate(0, 2.35, 0),
    new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).translate(0, 1.2, 0),
  ];
  const umbG = mergeGeometries(umbParts, false);
  umbParts.forEach(p => p.dispose());
  const colors = ['#ff5f5f', '#4fd8e0', '#ffb43a', '#ff5f8f', '#8f7bff'];
  const list = propSpots.umbrella;
  for (let ci = 0; ci < colors.length; ci++) {
    const li = list.filter((_, i) => i % colors.length === ci);
    if (!li.length) continue;
    const im = new THREE.InstancedMesh(umbG, new THREE.MeshStandardMaterial({ color: colors[ci], roughness: .7 }), li.length);
    li.forEach((p, i) => {
      Q.setFromAxisAngle(UP, p.ang);
      S.set(1, 1, 1);
      M.compose(new THREE.Vector3(p.x, 0, p.z), Q, S);
      im.setMatrixAt(i, M);
    });
    im.castShadow = true;
    ctx.scene.add(im);
  }
  if (propSpots.towel.length) {
    const towelG = new THREE.BoxGeometry(1.6, 0.04, 2.6).translate(0, 0.02, 0);
    const tm = new THREE.InstancedMesh(towelG, new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 1 }), propSpots.towel.length);
    propSpots.towel.forEach((p, i) => {
      Q.setFromAxisAngle(UP, p.ang);
      S.set(1, 1, 1);
      M.compose(new THREE.Vector3(p.x, 0, p.z), Q, S);
      tm.setMatrixAt(i, M);
    });
    ctx.scene.add(tm);
  }
}
