// HYPERLINE world — endless elevated-viaduct streamer with biomes
import * as THREE from 'three';
import CFG from './config.js';
import { M, GEO, geo, facadeTextures, muralTexture, billboardTexture } from './materials.js';
import { mulberry32, randRange, choice, clamp } from './utils.js';

const L = CFG.WORLD.CHUNK_LEN;

export class World {
  constructor() {
    this.chunks = [];           // [0] = newest (most forward); last = oldest (most behind)
    this.nextIdx = 0;
    this.nextGenZ1 = 40;
    this.deps = null;
    this.scene = null;
    this.quality = null;
    this.rng = mulberry32((Math.random() * 1e9) | 0);
    this.section = null;
    this.lastArch = '';
    this.tunnelActive = false;
    this.dynColliders = [];
    this._m4 = new THREE.Matrix4();
  }

  init(scene, quality, deps) {
    this.scene = scene;
    this.quality = quality;
    this.deps = deps;
    this.buildStatics();
  }

  // ============================================================
  // STATIC / CONTINUOUS ELEMENTS
  // ============================================================
  buildStatics() {
    const s = this.scene;
    const q = this.quality;

    // deck: 3 lane strips + margins, long boxes recentered on player
    const deckMat = M('deck');
    this.deckStrips = [];
    const stripGeo = new THREE.BoxGeometry(2.3, 0.5, 560);
    for (const lx of CFG.LANES) {
      const m = new THREE.Mesh(stripGeo, deckMat);
      m.position.set(lx, -0.25, 0);
      m.receiveShadow = q.shadows > 0;
      s.add(m);
      this.deckStrips.push(m);
    }
    const margGeo = new THREE.BoxGeometry(1.7, 0.5, 560);
    for (const sx of [-4.45, 4.45]) {
      const m = new THREE.Mesh(margGeo, deckMat);
      m.position.set(sx, -0.25, 0);
      m.receiveShadow = q.shadows > 0;
      s.add(m);
      this.deckStrips.push(m);
    }
    // parapets
    const parGeo = new THREE.BoxGeometry(0.35, 1.05, 560);
    for (const sx of [-5.35, 5.35]) {
      const m = new THREE.Mesh(parGeo, M('deckEdge'));
      m.position.set(sx, 0.52, 0);
      s.add(m);
      this.deckStrips.push(m);
    }

    // rails + catenary wires
    const railGeo = new THREE.BoxGeometry(0.09, 0.15, 560);
    this.followers = [];   // meshes that just recenter on player
    for (const lx of CFG.LANES) {
      for (const o of [-CFG.WORLD.RAIL_GAUGE, CFG.WORLD.RAIL_GAUGE]) {
        const r = new THREE.Mesh(railGeo, M('rail'));
        r.position.set(lx + o, 0.075, 0);
        r.receiveShadow = q.shadows > 0;
        s.add(r);
        this.followers.push(r);
      }
    }
    const wireGeo = new THREE.CylinderGeometry(0.022, 0.022, 560, 5);
    for (const lx of CFG.LANES) {
      const w = new THREE.Mesh(wireGeo, M('darkMetal'));
      w.rotation.x = Math.PI / 2;
      w.position.set(lx, 5.55, 0);
      s.add(w);
      this.followers.push(w);
    }
    // street + ground far below
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2733, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 560), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -8.6;
    s.add(ground);
    this.followers.push(ground);
    const stGeo = new THREE.PlaneGeometry(13, 560);
    for (const sx of [-13.5, 13.5]) {
      const st = new THREE.Mesh(stGeo, M('streetDark'));
      st.rotation.x = -Math.PI / 2;
      st.position.set(sx, -8.55, 0);
      s.add(st);
      this.followers.push(st);
    }

    // ---------------- instanced rings ----------------
    this.rings = [];
    this.makeRing = (inst, items, spacing, place, paired = 0) => {
      const ring = { inst, items, spacing, place, paired, dirty: true };
      this.rings.push(ring);
      return ring;
    };

    // sleepers: rows of 3 tracks
    {
      const nRows = Math.ceil(560 / 1.6);
      const inst = new THREE.InstancedMesh(geo('sleeper', () => new THREE.BoxGeometry(2.05, 0.09, 0.55)),
        M('sleeper'), nRows * 3);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.receiveShadow = q.shadows > 0;
      s.add(inst);
      const items = [];
      for (let i = 0; i < nRows; i++) {
        items.push({ z: 40 - i * 1.6, row: i % 3 });
      }
      this.sleeperRing = this.makeRing(inst, items, 1.6,
        (it, m4) => { m4.makeTranslation(CFG.LANES[it.row], 0.045, it.z); });
    }

    // light posts + lamp heads (alternating sides every 18m)
    {
      const nP = Math.ceil(560 / 18) + 2;
      const poleInst = new THREE.InstancedMesh(geo('poleCyl', () => new THREE.CylinderGeometry(0.06, 0.09, 4.4, 6)),
        M('darkMetal'), nP);
      poleInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      poleInst.castShadow = q.shadows > 0;
      s.add(poleInst);
      const lampInst = new THREE.InstancedMesh(geo('lampHead', () => new THREE.BoxGeometry(0.6, 0.12, 0.26)),
        M('lamp'), nP);
      lampInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.add(lampInst);
      const items = [];
      for (let i = 0; i < nP; i++) items.push({ z: 46 - i * 18, side: i % 2 === 0 ? -1 : 1 });
      this.poleRing = this.makeRing(poleInst, items, 18,
        (it, m4) => { m4.makeTranslation(it.side * 5.02, 2.2, it.z); });
      this.lampRing = this.makeRing(lampInst, items, 18,
        (it, m4) => { m4.makeTranslation(it.side * 4.62, 4.32, it.z); });
    }

    // catenary portals (post pair + beam every chunk length)
    {
      const nG = Math.ceil(560 / L) + 2;
      const postInst = new THREE.InstancedMesh(geo('portalPost', () => new THREE.BoxGeometry(0.24, 5.9, 0.24)),
        M('steel'), nG * 2);
      postInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      postInst.castShadow = q.shadows > 0;
      s.add(postInst);
      const beamInst = new THREE.InstancedMesh(geo('portalBeam', () => new THREE.BoxGeometry(11.2, 0.32, 0.32)),
        M('steel'), nG);
      beamInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.add(beamInst);
      const items = [];
      for (let i = 0; i < nG; i++) items.push({ z: 44 - i * L });
      this.portalRing = this.makeRing(postInst, items, L, (it, m4, k) => {
        m4.makeTranslation(k === 0 ? -5.35 : 5.35, 2.95, it.z);
      }, /*paired*/2);
      this.beamRing = this.makeRing(beamInst, items, L, (it, m4) => { m4.makeTranslation(0, 5.85, it.z); });
    }

    // support columns + caps under deck
    {
      const nC = Math.ceil(560 / 21) + 2;
      const colInst = new THREE.InstancedMesh(geo('colCyl', () => new THREE.CylinderGeometry(0.75, 1.05, 8.4, 8)),
        M('pillar'), nC * 2);
      colInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      colInst.castShadow = q.shadows > 0;
      s.add(colInst);
      const capInst = new THREE.InstancedMesh(geo('colCap', () => new THREE.BoxGeometry(2.1, 0.5, 2.6)),
        M('pillar'), nC * 2);
      capInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.add(capInst);
      const items = [];
      for (let i = 0; i < nC; i++) items.push({ z: 48 - i * 21 });
      this.colRing = this.makeRing(colInst, items, 21, (it, m4, k) => {
        m4.makeTranslation(k === 0 ? -4.6 : 4.6, -4.45, it.z);
      }, 2);
      this.capRing = this.makeRing(capInst, items, 21, (it, m4, k) => {
        m4.makeTranslation(k === 0 ? -4.6 : 4.6, -0.22, it.z);
      }, 2);
    }

    // traffic on streets below
    {
      const nT = Math.floor(52 * q.cityDensity) + 8;
      const tInst = new THREE.InstancedMesh(geo('trafficCar', () => new THREE.BoxGeometry(1.5, 0.85, 3.2)),
        new THREE.MeshStandardMaterial({ color: 0xdde3ee, roughness: 0.4, metalness: 0.6, emissive: 0x333344, emissiveIntensity: 0.6 }),
        nT);
      tInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.add(tInst);
      this.traffic = { inst: tInst, cars: [] };
      for (let i = 0; i < nT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const laneOff = Math.random() < 0.5 ? 2.8 : 5.6;
        this.traffic.cars.push({
          x: side * (9.6 + laneOff),
          z: randRange(-300, 30),
          dir: side > 0 ? -1 : 1,
          spd: randRange(9, 17),
          sX: randRange(0.85, 1.3),
          col: choice([0xdde3ee, 0xff8a5c, 0x7fd4ff, 0xffd23c, 0x999999]),
        });
      }
    }

    // buildings (instanced per facade style)
    this.buildingRings = [];
    for (let f = 0; f < 4; f++) {
      const ftex = facadeTextures(f, 1000 + f * 77);
      const mat = new THREE.MeshStandardMaterial({
        map: ftex.map, emissiveMap: ftex.emissive,
        emissive: 0xffffff, emissiveIntensity: 1.35,
        roughness: 0.88,
      });
      const perSide = Math.max(7, Math.floor(11 * q.cityDensity));
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, perSide * 2);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.add(inst);
      const span = 50;
      const items = [];
      for (let i = 0; i < perSide; i++) {
        for (const side of [-1, 1]) {
          items.push({
            side, slot: i, z: 40 - i * span,
            w: randRange(10, 17), d: randRange(10, 16),
            h: randRange(9, 36), xo: side * randRange(20, 33),
          });
        }
      }
      const ring = this.makeRing(inst, items, span * perSide, (it, m4) => {
        m4.makeScale(it.w, it.h, it.d);
        m4.setPosition(it.xo, -8.6 + it.h / 2, it.z);
      });
      ring.perItemSpan = span;
      ring.cycle = perSide * span;   // both-side items share slot z
      ring.wrapAhead = 90;
      this.buildingRings.push(ring);
    }

    this.buildLandmarks();
    this.refreshAllRings();
  }

  buildLandmarks() {
    const s = this.scene;
    const out = [];
    // Ferris wheel
    const fw = new THREE.Group();
    {
      const R = 16;
      const hub = new THREE.Group();
      hub.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.7, 8, 42),
        new THREE.MeshStandardMaterial({ color: 0xff6a88, roughness: 0.5, emissive: 0xa0203f, emissiveIntensity: 0.4 })));
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, R * 2, 5), M('steel'));
        sp.rotation.z = (i / 8) * Math.PI;
        hub.add(sp);
      }
      const cabCol = [0xffc93c, 0x35e0d2, 0xff4f81, 0xffffff];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.4, 1.7),
          new THREE.MeshStandardMaterial({ color: cabCol[i % 4], emissive: cabCol[i % 4], emissiveIntensity: 0.55 }));
        cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        hub.add(cab);
      }
      fw.add(hub);
      fw.userData.hub = hub;
      for (const dz of [-2.4, 2.4]) {
        for (const sx of [-3.2, 3.2]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, R + 10, 6), M('steel'));
          leg.position.set(sx, (R + 10) / 2 - 9, dz);
          leg.rotation.z = sx > 0 ? -0.3 : 0.3;
          fw.add(leg);
        }
      }
    }
    fw.position.set(58, 9, -700);
    s.add(fw);
    out.push({ g: fw, cycle: 1700 });

    // radio tower
    const tw = new THREE.Group();
    {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.6, 54, 6),
        new THREE.MeshStandardMaterial({ color: 0xb03a4a, roughness: 0.75 }));
      mast.position.y = 27;
      tw.add(mast);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff3030 }));
      beacon.position.y = 55.5;
      tw.add(beacon);
      tw.userData.beacon = beacon;
    }
    tw.position.set(-64, -8, -900);
    s.add(tw);
    out.push({ g: tw, cycle: 1900 });

    // stadium dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xcfd8e8, roughness: 0.7 }));
    dome.position.set(98, -8, -1150);
    s.add(dome);
    out.push({ g: dome, cycle: 2300 });
    this.landmarks = out;
  }

  _refreshRing(ring) {
    const { inst, items, place, paired } = ring;
    const m4 = this._m4;
    if (paired === 2) {
      for (let i = 0; i < items.length; i++) {
        place(items[i], m4, 0); inst.setMatrixAt(i * 2, m4);
        place(items[i], m4, 1); inst.setMatrixAt(i * 2 + 1, m4);
      }
    } else {
      for (let i = 0; i < items.length; i++) { place(items[i], m4); inst.setMatrixAt(i, m4); }
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  refreshAllRings() { for (const r of this.rings) this._refreshRing(r); }

  _updateRing(ring, playerZ) {
    const behind = playerZ + 70;
    const cycle = ring.cycle || ring.items.length * ring.spacing;
    let moved = false;
    for (const it of ring.items) {
      if (it.z > behind) { it.z -= cycle; moved = true; }
      else if (it.z < playerZ - 540) { it.z += cycle; moved = true; }
    }
    if (moved || ring.dirty) { ring.dirty = false; this._refreshRing(ring); }
  }

  // ============================================================
  // BIOMES / SECTIONS / CHUNKS
  // ============================================================
  biomeAt(z) {
    return CFG.BIOMES[Math.floor(Math.abs(z) / CFG.BIOME_LEN) % CFG.BIOMES.length];
  }

  planSection() {
    const dist = -this.nextGenZ1;
    const tier = dist < 260 ? 0 : dist < 620 ? 1 : dist < 1250 ? 2 : 3;
    const biome = this.biomeAt(this.nextGenZ1 - L);
    const pool = ['open', 'construction'];
    if (tier >= 1) pool.push('trainYard', 'station', 'open');
    if (tier >= 2) pool.push('oncoming', 'holes', 'tunnel', 'maintenance');
    if (tier >= 3) pool.push('trainYard', 'oncoming', 'construction');
    let arch, guard = 0;
    do { arch = choice(pool); } while (arch === this.lastArch && guard++ < 4);
    if (biome !== 'greenway' && arch === 'maintenance' && Math.random() < 0.5) arch = 'open';
    this.lastArch = arch;
    const lenChunks = (arch === 'tunnel' || arch === 'station') ? 3 : 2;
    this.section = {
      archetype: arch, tier, biome, chunksLeft: lenChunks, state: {},
    };
    if (arch === 'tunnel') this.tunnelActive = true;
    return this.section;
  }

  genChunk() {
    const idx = this.nextIdx++;
    const z1 = this.nextGenZ1;
    const z0 = z1 - L;
    this.nextGenZ1 = z0;

    const group = new THREE.Group();
    this.scene.add(group);
    const chunk = {
      idx, z0, z1, group,
      colliders: [], holes: [], ramps: [], roofs: [], trains: [],
      decorDone: false,
    };
    this.chunks.unshift(chunk);

    if (idx <= 1) { this.buildIntroChunk(chunk, idx); return chunk; }

    const sec = this.section && this.section.chunksLeft > 0 ? this.section : this.planSection();
    sec.biome = sec.biome || this.biomeAt(z1);

    const D = this.deps;
    switch (sec.archetype) {
      case 'trainYard': D.trains.buildParkedSection(chunk, sec, this); break;
      case 'station': D.obstacles.buildStation(chunk, sec, this); break;
      case 'tunnel': D.obstacles.buildTunnel(chunk, sec, this); break;
      case 'holes': D.obstacles.buildHoles(chunk, sec, this); break;
      case 'oncoming': D.trains.buildOncomingSchedule(chunk, sec, this); break;
      case 'construction': D.obstacles.buildConstruction(chunk, sec, this); break;
      case 'maintenance': D.obstacles.buildMaintenance(chunk, sec, this); break;
      default: D.obstacles.buildOpen(chunk, sec, this);
    }
    this.decorateSides(chunk);
    D.collectibles.decorateChunk(chunk, sec, this);

    sec.chunksLeft--;
    if (sec.chunksLeft <= 0) {
      if (sec.archetype === 'tunnel') this.tunnelActive = false;
      this.section = null;
    }
    return chunk;
  }

  buildIntroChunk(chunk, idx) {
    const D = this.deps;
    for (let i = 0; i < 8; i++) {
      D.collectibles.spawnCoin(choice(CFG.LANES), chunk.z1 - 4 - i * 3.4, 1.1);
    }
    if (idx === 1) {
      D.obstacles.addLowBarrier(chunk, 1, chunk.z1 - 24);
      D.collectibles.coinArcOver(chunk, 1, chunk.z1 - 24);
    }
    this.decorateSides(chunk);
  }

  ensureAhead(playerZ) {
    const limit = playerZ - this.quality.drawAhead;
    while (this.nextGenZ1 > limit) this.genChunk();
  }

  recycleBehind(playerZ) {
    while (this.chunks.length && this.chunks[this.chunks.length - 1].z0 > playerZ + CFG.WORLD.CULL_BEHIND) {
      const c = this.chunks.pop();
      this.deps.trains.releaseChunk(c);
      this.scene.remove(c.group);
      c.group.clear();
    }
  }

  reset() {
    for (const c of this.chunks) {
      this.deps.trains.releaseChunk(c);
      this.scene.remove(c.group);
      c.group.clear();
    }
    this.chunks.length = 0;
    this.nextIdx = 0;
    this.nextGenZ1 = 40;
    this.lastArch = '';
    this.section = null;
    this.tunnelActive = false;
    this.dynColliders.length = 0;
  }

  decorateSides(chunk) {
    const b = this.biomeAt(chunk.z1);
    const g = chunk.group;
    const rng = Math.random;
    // murals in old town
    if (b === 'oldtown' && Math.random() < 0.65) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tex = muralTexture(((chunk.idx * 31) | 0) % 97);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.6), mat);
      p.position.set(side * 5.16, 1.35, chunk.z1 - L * 0.5);
      p.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(p);
    }
    // billboards downtown
    if (b === 'downtown' && Math.random() < 0.55) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tex = billboardTexture(chunk.idx % 5);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.7), mat);
      const h = randRange(10, 19);
      p.position.set(side * randRange(14.5, 18), h, chunk.z1 - L * randRange(0.2, 0.8));
      p.rotation.y = side < 0 ? Math.PI / 2 - 0.12 : -Math.PI / 2 + 0.12;
      g.add(p);
      // support pole
      const pole = new THREE.Mesh(geo('bbPole', () => new THREE.CylinderGeometry(0.18, 0.22, 12, 6)), M('darkMetal'));
      pole.position.set(p.position.x, -8.6 + 6, p.position.z);
      g.add(pole);
    }
    // greenway trees
    if (b === 'greenway') {
      const n = 2 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const tg = new THREE.Group();
        const trunk = new THREE.Mesh(geo('treeTrunk', () => new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6)), M('trunk'));
        trunk.position.y = 0.8;
        tg.add(trunk);
        const leaf = new THREE.Mesh(geo('treeLeaf', () => new THREE.IcosahedronGeometry(1.15, 0)),
          new THREE.MeshStandardMaterial({ color: choice([0x4d9e4f, 0x63b04f, 0x3f8f5c]), roughness: 0.95 }));
        leaf.position.y = 2.1;
        leaf.scale.set(1, randRange(1.1, 1.7), 1);
        leaf.castShadow = this.quality.shadows > 0;
        tg.add(leaf);
        tg.position.set(side * randRange(6.1, 7.6), 0, chunk.z1 - L * rng());
        g.add(tg);
        // vine curtain
        if (Math.random() < 0.3) {
          const vine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, randRange(1.2, 2.4)),
            new THREE.MeshStandardMaterial({ color: 0x3f8f5c, roughness: 1, side: THREE.DoubleSide }));
          vine.position.set(side * 5.14, randRange(0.6, 1.2), chunk.z1 - L * rng());
          vine.rotation.y = side * Math.PI / 2;
          g.add(vine);
        }
      }
    }
    // industrial containers stacked on shelves
    if (b === 'industrial' && Math.random() < 0.6) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const stack = new THREE.Group();
      const cols = [0xb0483f, 0x3f6ab0, 0xc99a3a, 0x4a8a5c];
      for (let i = 0; i < randRange(1, 3) + 0.5; i++) {
        const box = new THREE.Mesh(geo('container', () => new THREE.BoxGeometry(2.6, 1.15, 6.2)),
          new THREE.MeshStandardMaterial({
            color: cols[(Math.random() * cols.length) | 0], roughness: 0.8, metalness: 0.25,
          }));
        box.position.set(randRange(-0.3, 0.3), 0.58 + i * 1.18, randRange(-0.4, 0.4));
        box.castShadow = this.quality.shadows > 0;
        stack.add(box);
      }
      stack.position.set(side * randRange(6.4, 7.4), 0, chunk.z1 - L * rng());
      g.add(stack);
    }
  }

  // ============================================================
  // QUERIES
  // ============================================================
  *chunksInRange(zNear, zFar) {
    for (const c of this.chunks) {
      if (c.z1 < zFar || c.z0 > zNear) continue;
      yield c;
    }
  }

  groundHeightAt(x, z) {
    let h = 0;
    for (const c of this.chunksInRange(z + 1.2, z - 1.2)) {
      for (const hole of c.holes) {
        if (Math.abs(x - hole.x) < hole.hw && Math.abs(z - hole.z) < hole.hd) return -Infinity;
      }
      for (const r of c.roofs) {
        if (Math.abs(x - r.x) < r.hw && z > r.z0 - 0.5 && z < r.z1 + 0.5) h = Math.max(h, r.roofY);
      }
      for (const rmp of c.ramps) {
        if (Math.abs(x - rmp.x) < rmp.hw && z <= rmp.zNear + 0.4 && z >= rmp.zFar - 0.4) {
          const t = clamp((z - rmp.zNear) / (rmp.zFar - rmp.zNear), 0, 1);
          h = Math.max(h, rmp.yNear + (rmp.yFar - rmp.yNear) * t);
        }
      }
    }
    return h;
  }

  // ============================================================
  // FRAME UPDATE
  // ============================================================
  update(dt, playerZ) {
    const snapZ = Math.round(playerZ / 8) * 8;
    for (const m of this.deckStrips) m.position.z = snapZ;
    for (const m of this.followers) m.position.z = snapZ;

    for (const r of this.rings) this._updateRing(r, playerZ);
    this.updateTraffic(dt, playerZ);
    this.updateLandmarks(dt, playerZ);
  }

  updateTraffic(dt, playerZ) {
    const m4 = this._m4;
    const { inst, cars } = this.traffic;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.z += c.dir * c.spd * dt;
      if (c.dir < 0 && c.z < playerZ - 300) c.z = playerZ + randRange(10, 80);
      if (c.dir > 0 && c.z > playerZ + 80) c.z = playerZ - randRange(220, 300);
      m4.makeScale(c.sX, 1, 1);
      m4.setPosition(c.x, -8.1, c.z);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  updateLandmarks(dt, playerZ) {
    const t = performance.now() * 0.001;
    for (const lm of this.landmarks) {
      const g = lm.g;
      if (g.position.z > playerZ + 140) g.position.z -= lm.cycle;
      if (g.userData.hub) g.userData.hub.rotation.z += dt * 0.12;
      if (g.userData.beacon) {
        const on = Math.sin(t * 3.2) > 0.35;
        g.userData.beacon.material.color.setRGB(on ? 1 : 0.08, 0.05, 0.05);
      }
    }
  }
}
