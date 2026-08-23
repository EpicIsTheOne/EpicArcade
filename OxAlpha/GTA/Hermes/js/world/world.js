// ============================================================
// NEON MERIDIAN — world/world.js  (browser only)
// Builds renderable city from CityGen layout: merged meshes,
// materials, colliders, water, beach, distant terrain.
// ============================================================
'use strict';

const World = (() => {

  function build(layout, quality) {
    const B = CONFIG.BLOCK, RW = CONFIG.ROAD_W, SW = CONFIG.SIDEWALK_W;
    const size = layout.size;
    const group = new THREE.Group();
    const colliders = [];
    const mats = {};
    const dynamic = { lampMats: [], trafficLights: [], waterMat: null };

    // ---------- shared materials ----------
    const facades = TexLib.facades();
    mats.facade = facades.map(f => new THREE.MeshStandardMaterial({
      map: f.map, emissiveMap: f.emissive, emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.0, roughness: 0.85, metalness: 0.05,
    }));
    const facadeMats = mats.facade;
    mats.roof = new THREE.MeshStandardMaterial({ color: 0x565a60, roughness: 0.95 });
    mats.concrete = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.92 });
    mats.asphalt = new THREE.MeshStandardMaterial({ map: TexLib.asphalt(), roughness: 0.94, metalness: 0.0 });
    mats.sidewalk = new THREE.MeshStandardMaterial({ map: TexLib.sidewalk(), roughness: 0.9 });
    mats.marking = new THREE.MeshStandardMaterial({ color: 0xd8d8ce, roughness: 0.6 });
    mats.bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
    mats.leaves = new THREE.MeshStandardMaterial({ color: 0x3f6d33, roughness: 1 });
    mats.metal = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.55, metalness: 0.6 });
    mats.lamp = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0 });
    mats.sand = new THREE.MeshStandardMaterial({ map: TexLib.sand(), roughness: 1 });
    mats.grass = new THREE.MeshStandardMaterial({ map: TexLib.grass(), roughness: 1 });
    mats.container = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15 });
    const containerHues = [0xa8452e, 0x2e6da8, 0x3f8f4f, 0xb08a2e, 0x777d85];

    // ---------- ground ----------
    {
      const g = new THREE.PlaneGeometry(size * 3, size * 3);
      const m = new THREE.Mesh(g, mats.grass);
      m.rotation.x = -Math.PI / 2;
      m.position.set(size / 2, -0.05, size / 2 - size);
      m.receiveShadow = true;
      group.add(m);
    }

    // ---------- roads ----------
    {
      const geomsH = [], geomsV = [];
      const tex = mats.asphalt.map; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      for (let j = 0; j <= CONFIG.GRID; j++) {
        const g = new THREE.PlaneGeometry(size + RW, RW);
        // uv: along length repeat every 12m
        const uvs = g.attributes.uv;
        for (let k = 0; k < uvs.count; k++) uvs.setX(k, uvs.getX(k) * (size + RW) / 12);
        g.rotateX(-Math.PI / 2);
        g.translate(size / 2, 0.02, j * B);
        geomsH.push(g);
      }
      for (let i = 0; i <= CONFIG.GRID; i++) {
        const g = new THREE.PlaneGeometry(RW, size + RW);
        const uvs = g.attributes.uv;
        for (let k = 0; k < uvs.count; k++) uvs.setY(k, uvs.getY(k) * (size + RW) / 12);
        g.rotateX(-Math.PI / 2);
        g.translate(i * B, 0.035, size / 2);
        geomsV.push(g);
      }
      const mh = new THREE.Mesh(mergeGeometries(geomsH), mats.asphalt);
      const mv = new THREE.Mesh(mergeGeometries(geomsV), mats.asphalt);
      mh.receiveShadow = mv.receiveShadow = true;
      group.add(mh, mv);
    }

    // ---------- lane markings + crosswalks ----------
    {
      const geoms = [];
      const dash = (x, z, alongX, w, l) => {
        const g = new THREE.PlaneGeometry(alongX ? l : w, alongX ? w : l);
        g.rotateX(-Math.PI / 2); g.translate(x, 0.05, z); geoms.push(g);
      };
      for (let j = 1; j < CONFIG.GRID; j++) {
        for (let i = 0; i < CONFIG.GRID; i++) {
          for (let s = 10; s < B - 10; s += 8) dash(i * B + s, j * B, true, 0.3, 4);
        }
      }
      for (let i = 1; i < CONFIG.GRID; i++) {
        for (let j = 0; j < CONFIG.GRID; j++) {
          for (let s = 10; s < B - 10; s += 8) dash(i * B, j * B + s, false, 0.3, 4);
        }
      }
      // crosswalk stripes at signalized intersections
      for (const nd of layout.graph.nodes) {
        if (!nd.light) continue;
        for (let k = -3; k <= 3; k++) {
          dash(nd.x + k * 1.6, nd.z + RW / 2 + 1.2, false, 0.9, 2.4);
          dash(nd.x + k * 1.6, nd.z - RW / 2 - 1.2, false, 0.9, 2.4);
          dash(nd.x + RW / 2 + 1.2, nd.z + k * 1.6, true, 0.9, 2.4);
          dash(nd.x - RW / 2 - 1.2, nd.z + k * 1.6, true, 0.9, 2.4);
        }
      }
      const m = new THREE.Mesh(mergeGeometries(geoms), mats.marking);
      group.add(m);
    }

    // ---------- sidewalks (block borders, raised) ----------
    {
      const geoms = [];
      for (const blk of layout.blocks.flat()) {
        const x0 = blk.x0 + RW / 2, z0 = blk.z0 + RW / 2;
        const x1 = blk.x1 - RW / 2, z1 = blk.z1 - RW / 2;
        const w = x1 - x0, d = z1 - z0, y = 0.14;
        const g = new THREE.PlaneGeometry(w, d);
        const uvs = g.attributes.uv;
        for (let k = 0; k < uvs.count; k++) { uvs.setX(k, uvs.getX(k) * w / 4); uvs.setY(k, uvs.getY(k) * d / 4); }
        g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
        geoms.push(g);
      }
      const m = new THREE.Mesh(mergeGeometries(geoms), mats.sidewalk);
      m.receiveShadow = true;
      group.add(m);
    }

    // ---------- buildings ----------
    {
      const wallGeoms = facades.map(() => []);
      const roofGeoms = [];
      const uvS = 26, uvV = 32;   // meters per texture tile
      function addBoxWalls(x0, z0, x1, z1, y0, h, style) {
        const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const sides = [
          { w, px: cx, pz: z0, ry: 0 },            // south face (-z)
          { w, px: cx, pz: z1, ry: Math.PI },      // north
          { w: d, px: x0, pz: cz, ry: Math.PI / 2 },  // west... orientation for uv width
          { w: d, px: x1, pz: cz, ry: -Math.PI / 2 },
        ];
        for (const s of sides) {
          const g = new THREE.PlaneGeometry(s.w, h);
          const uvs = g.attributes.uv;
          for (let k = 0; k < uvs.count; k++) { uvs.setX(k, uvs.getX(k) * s.w / uvS); uvs.setY(k, uvs.getY(k) * h / uvV); }
          g.rotateY(s.ry);
          g.translate(s.px, y0 + h / 2, s.pz);
          wallGeoms[style].push(g);
        }
        const roof = new THREE.PlaneGeometry(w, d);
        roof.rotateX(-Math.PI / 2); roof.translate(cx, y0 + h + 0.01, cz);
        roofGeoms.push(roof);
      }
      for (const b of layout.buildings) {
        const y0 = 0.14;
        addBoxWalls(b.x0, b.z0, b.x1, b.z1, y0, b.h, b.style);
        if (b.roof === 'setback') {
          const inset = 3, h2 = Math.min(10, b.h * 0.16);
          addBoxWalls(b.x0 + inset, b.z0 + inset, b.x1 - inset, b.z1 - inset, y0 + b.h, h2, b.style);
        }
      }
      for (let s = 0; s < wallGeoms.length; s++) {
        if (!wallGeoms[s].length) continue;
        const mesh = new THREE.Mesh(mergeGeometries(wallGeoms[s]), mats.facade[s]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
      }
      const roofs = new THREE.Mesh(mergeGeometries(roofGeoms), mats.roof);
      roofs.castShadow = true; roofs.receiveShadow = true;
      group.add(roofs);
    }

    dynamic.facadeMats = facadeMats;

    // ---------- colliders from buildings + containers ----------
    for (const b of layout.buildings) {
      colliders.push(new Collider(b.x0, b.z0, b.x1, b.z1, { h: b.h, kind: 'building' }));
    }

    // ---------- props ----------
    const poleGeoms = [], lampGeoms = [], trunkGeoms = [], leafGeoms = [], benchGeoms = [];
    const containerByHue = containerHues.map(() => []);
    const cyl = new THREE.CylinderGeometry(0.09, 0.12, 6.2, 6);
    for (const p of layout.props) {
      if (p.type === 'streetlight') {
        const g = cyl.clone(); g.translate(p.x, 3.1, p.z); poleGeoms.push(g);
        const arm = new THREE.BoxGeometry(2.2, 0.12, 0.12);
        arm.translate(p.x + (p.rot === 0 ? 0.9 : 0), 6.1, p.z + (p.rot === 0 ? 0 : 0.9));
        if (p.rot !== 0) { arm.rotateY(Math.PI / 2); arm.translate(0, 0, -0.9); arm.translate(0.9, 0, 0); }
        poleGeoms.push(arm);
        const lamp = new THREE.BoxGeometry(0.9, 0.18, 0.35);
        if (p.rot === 0) lamp.translate(p.x + 1.8, 6.0, p.z);
        else lamp.translate(p.x, 6.0, p.z + 1.8);
        lampGeoms.push(lamp);
      } else if (p.type === 'tree') {
        const t = new THREE.CylinderGeometry(0.22 * p.s, 0.3 * p.s, 2.6 * p.s, 5);
        t.translate(p.x, 1.3 * p.s, p.z); trunkGeoms.push(t);
        const c1 = new THREE.IcosahedronGeometry(1.7 * p.s, 0);
        c1.translate(p.x, 3.4 * p.s, p.z); leafGeoms.push(c1);
        const c2 = new THREE.IcosahedronGeometry(1.2 * p.s, 0);
        c2.translate(p.x + 0.5, 4.4 * p.s, p.z - 0.3); leafGeoms.push(c2);
      } else if (p.type === 'bench') {
        const seat = new THREE.BoxGeometry(2.2, 0.12, 0.6);
        seat.rotateY(p.rot); seat.translate(p.x, 0.55, p.z); benchGeoms.push(seat);
      } else if (p.type === 'container') {
        const g = new THREE.BoxGeometry(6.1, 2.6, 2.44);
        g.rotateY(p.rot); g.translate(p.x, 1.3 + 0.14, p.z);
        containerByHue[p.hue].push(g);
        colliders.push(new Collider(p.x - 3.1, p.z - 1.3, p.x + 3.1, p.z + 1.3, { h: 2.7, kind: 'container' }));
      }
    }
    if (poleGeoms.length) group.add(new THREE.Mesh(mergeGeometries(poleGeoms), mats.metal));
    if (lampGeoms.length) {
      const lm = new THREE.Mesh(mergeGeometries(lampGeoms), mats.lamp);
      group.add(lm); dynamic.lampMats.push(mats.lamp);
    }
    if (trunkGeoms.length) { const t = new THREE.Mesh(mergeGeometries(trunkGeoms), mats.bark); t.castShadow = true; group.add(t); }
    if (leafGeoms.length) { const l = new THREE.Mesh(mergeGeometries(leafGeoms), mats.leaves); l.castShadow = true; group.add(l); }
    if (benchGeoms.length) group.add(new THREE.Mesh(mergeGeometries(benchGeoms), mats.bark));
    for (let h = 0; h < containerByHue.length; h++) {
      if (!containerByHue[h].length) continue;
      const mm = mats.container.clone(); mm.color = new THREE.Color(containerHues[h]);
      group.add(new THREE.Mesh(mergeGeometries(containerByHue[h]), mm));
    }

    // ---------- traffic lights ----------
    {
      const poleG = [], headG = [];
      const redMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 1.6 });
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x2aff5a, emissiveIntensity: 1.6 });
      for (const nd of layout.graph.nodes) {
        if (!nd.light) continue;
        const px = nd.x + RW / 2 + 1.6, pz = nd.z + RW / 2 + 1.6;
        const pg = new THREE.CylinderGeometry(0.08, 0.1, 5.4, 5);
        pg.translate(px, 2.7, pz); poleG.push(pg);
        const hg = new THREE.BoxGeometry(0.34, 0.9, 0.3);
        hg.translate(px, 5.2, pz); headG.push(hg);
        // lamp sphere as separate small mesh (state-swapped material)
        const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), greenMat);
        lampMesh.position.set(px, 5.2, pz + 0.18);
        group.add(lampMesh);
        dynamic.trafficLights.push({ node: nd, mesh: lampMesh, redMat, greenMat });
      }
      if (poleG.length) group.add(new THREE.Mesh(mergeGeometries(poleG), mats.metal));
      if (headG.length) group.add(new THREE.Mesh(mergeGeometries(headG), mats.metal));
    }

    // ---------- parking lots ----------
    {
      const lotGeoms = [], lineGeoms = [];
      for (const lot of layout.parkingLots) {
        const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
        const g = new THREE.PlaneGeometry(w, d);
        g.rotateX(-Math.PI / 2); g.translate((lot.x0 + lot.x1) / 2, 0.03, (lot.z0 + lot.z1) / 2);
        lotGeoms.push(g);
        for (let x = lot.x0 + 3; x < lot.x1 - 2; x += 3) {
          const l = new THREE.PlaneGeometry(0.2, 5);
          l.rotateX(-Math.PI / 2); l.translate(x, 0.045, (lot.z0 + lot.z1) / 2);
          lineGeoms.push(l);
        }
      }
      if (lotGeoms.length) group.add(new THREE.Mesh(mergeGeometries(lotGeoms), mats.asphalt));
      if (lineGeoms.length) group.add(new THREE.Mesh(mergeGeometries(lineGeoms), mats.marking));
    }

    // ---------- beach & water ----------
    {
      const shore = layout.shorelineZ;
      const sand = new THREE.Mesh(new THREE.PlaneGeometry(size + RW * 2, 150), mats.sand);
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(size / 2, 0.02, shore + 30);
      sand.receiveShadow = true;
      group.add(sand);

      const waterGeo = new THREE.PlaneGeometry(size * 4, size * 3.2, 48, 48);
      const waterMat = new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.water, roughness: 0.12, metalness: 0.55,
        transparent: true, opacity: 0.92,
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(size / 2, -1.35, shore + 60 + size * 1.2);
      group.add(water);
      dynamic.waterMat = waterMat;
      // gentle wave animation via vertex displacement in onTick (cheap sine)
      dynamic.waterGeo = waterGeo;
      const base = Float32Array.from(waterGeo.attributes.position.array);
      dynamic.waterBase = base;
    }

    // ---------- distant hills ----------
    {
      const geoms = [];
      const rng = mulberry32(99);
      for (let k = 0; k < 26; k++) {
        const ang = rng() * Math.PI * 2;
        const dist = size * (1.15 + rng() * 0.5);
        const r = 60 + rng() * 160;
        const h = 40 + rng() * 110;
        const g = new THREE.ConeGeometry(r, h, 5 + Math.floor(rng() * 3));
        g.translate(size / 2 + Math.cos(ang) * dist, h / 2 - 12, size / 2 + Math.sin(ang) * dist);
        geoms.push(g);
      }
      const hills = new THREE.Mesh(mergeGeometries(geoms),
        new THREE.MeshStandardMaterial({ color: 0x2e4436, roughness: 1 }));
      group.add(hills);
    }

    // ---------- world boundary ----------
    const PAD = 26;
    colliders.push(new Collider(-PAD, -PAD, size + PAD, -PAD + 2, { h: 4, kind: 'boundary' }));
    colliders.push(new Collider(-PAD, size + PAD - 2, size + PAD, size + PAD, { h: 4, kind: 'boundary' }));
    colliders.push(new Collider(-PAD, -PAD, -PAD + 2, size + PAD, { h: 4, kind: 'boundary' }));
    colliders.push(new Collider(size + PAD - 2, -PAD, size + PAD, size + PAD, { h: 4, kind: 'boundary' }));

    return { group, colliders, mats, dynamic };
  }

  /** Per-frame world animation (water, lamp flicker). dt seconds. */
  function onTick(world, t, dt) {
    const dg = world.dynamic;
    if (dg.waterGeo) {
      const pos = dg.waterGeo.attributes.position;
      const base = dg.waterBase;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        pos.array[i * 3 + 1] = Math.sin(x * 0.05 + t * 1.1) * 0.5 + Math.cos(z * 0.06 + t * 0.7) * 0.4;
      }
      pos.needsUpdate = true;
      if (dg.waterGeo.computeVertexNormals) dg.waterGeo.computeVertexNormals();
    }
  }

  return { build, onTick };
})();

if (typeof module !== 'undefined') module.exports = { World: null };
