// HYPERLINE obstacles — builders + fair archetype sections
import * as THREE from 'three';
import CFG from './config.js';
import { M, GEO, geo, signTexture, hazardTexture, stationSign, STATION_NAMES } from './materials.js';
import { randRange, choice, clamp } from './utils.js';

const L = CFG.WORLD.CHUNK_LEN;

export class Obstacles {
  constructor() {
    this.stationIdx = 0;
  }

  init(scene, quality) {
    this.scene = scene;
    this.quality = quality;
  }

  reset() { this.stationIdx = 0; }

  // ================= individual builders =================
  addLowBarrier(chunk, lane, z) {
    const x = CFG.LANES[lane];
    const g = new THREE.Group();
    // striped hurdle: two feet + board
    const board = new THREE.Mesh(geo('lowBoard', () => new THREE.BoxGeometry(1.9, 0.42, 0.16)), M('barrierLow'));
    board.position.y = 0.78;
    g.add(board);
    const footGeo = geo('lowFoot', () => new THREE.BoxGeometry(0.14, 1.0, 0.5));
    for (const sx of [-0.85, 0.85]) {
      const f = new THREE.Mesh(footGeo, M('darkMetal'));
      f.position.set(sx, 0.5, 0);
      g.add(f);
    }
    g.position.set(x, 0, z);
    chunk.group.add(g);
    chunk.colliders.push({
      type: 'jump', x, z, hw: 0.95, hh: 0.5, hd: 0.12, y: 0.5,
      severity: 'stumble', passed: false, need: 'jump',
    });
  }

  addRollGantry(chunk, lane, z, signText) {
    const x = CFG.LANES[lane];
    const g = new THREE.Group();
    // overhead bar you must roll under; legs outside lane
    const bar = new THREE.Mesh(geo('gantryBar', () => new THREE.BoxGeometry(2.3, 1.5, 0.22)), M('gantry'));
    bar.position.y = 1.15 + 1.5 / 2;
    g.add(bar);
    const legGeo = geo('gantryLeg', () => new THREE.BoxGeometry(0.14, 2.7, 0.2));
    for (const sx of [-1.18, 1.18]) {
      const leg = new THREE.Mesh(legGeo, M('darkMetal'));
      leg.position.set(sx, 1.35, 0);
      g.add(leg);
    }
    if (signText !== null) {
      const tex = signTexture(signText || choice(['DUCK!', 'LOW BAR', 'CAREFUL']));
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.62), new THREE.MeshBasicMaterial({ map: tex }));
      s.position.set(0, 1.62, -0.13);
      s.rotation.y = Math.PI;
      g.add(s);
      const s2 = s.clone(); s2.rotation.y = 0; s2.position.z = 0.13; g.add(s2);
    }
    g.position.set(x, 0, z);
    chunk.group.add(g);
    chunk.colliders.push({
      type: 'roll', x, z, hw: 1.02, hh: 0.75, hd: 0.12, y: 1.9,
      severity: 'stumble', passed: false, need: 'roll',
    });
  }

  addBlocker(chunk, lane, z) {
    const x = CFG.LANES[lane];
    const g = new THREE.Group();
    const wall = new THREE.Mesh(geo('blockWall', () => new THREE.BoxGeometry(2.0, 2.6, 0.5)), M('deckEdge'));
    wall.position.y = 1.3;
    wall.castShadow = true;
    g.add(wall);
    const stripe = new THREE.Mesh(geo('blockStripe', () => new THREE.PlaneGeometry(1.9, 0.5)),
      new THREE.MeshBasicMaterial({ map: hazardTexture() }));
    stripe.position.set(0, 2.1, 0.26);
    g.add(stripe);
    const stripe2 = stripe.clone(); stripe2.rotation.y = Math.PI; stripe2.position.z = -0.26; g.add(stripe2);
    g.position.set(x, 0, z);
    chunk.group.add(g);
    chunk.colliders.push({
      type: 'blocker', x, z, hw: 1.0, hh: 1.3, hd: 0.28, y: 1.3,
      severity: 'wipeout', passed: false, need: 'dodge',
    });
  }

  addCones(chunk, lane, z, n) {
    const x = CFG.LANES[lane];
    const coneGeo = geo('cone', () => {
      const c = new THREE.ConeGeometry(0.26, 0.72, 8);
      return c;
    });
    for (let i = 0; i < n; i++) {
      const cz = z - i * 1.4;
      const cone = new THREE.Mesh(coneGeo, M('cone'));
      cone.position.set(x + randRange(-0.35, 0.35), 0.36, cz);
      cone.castShadow = true;
      chunk.group.add(cone);
      chunk.colliders.push({
        type: 'jump', x: cone.position.x, z: cz, hw: 0.34, hh: 0.36, hd: 0.34, y: 0.36,
        severity: 'stumble', passed: false, need: 'jump',
      });
    }
  }

  addTrackEquip(chunk, lane, z) {
    const x = CFG.LANES[lane];
    const g = new THREE.Group();
    const box = new THREE.Mesh(geo('equipBox', () => new THREE.BoxGeometry(1.3, 0.95, 0.9)), M('rust'));
    box.position.y = 0.48;
    box.castShadow = true;
    g.add(box);
    const lampDot = new THREE.Mesh(geo('equipLamp', () => new THREE.SphereGeometry(0.09, 8, 6)),
      Math.random() < 0.5 ? M('neonTeal') : M('neonPink'));
    lampDot.position.set(0.45, 1.02, 0);
    g.add(lampDot);
    g.position.set(x, 0, z);
    chunk.group.add(g);
    chunk.colliders.push({
      type: 'jump', x, z, hw: 0.68, hh: 0.48, hd: 0.46, y: 0.48,
      severity: 'stumble', passed: false, need: 'jump',
    });
  }

  addHole(chunk, lane, zCenter, len) {
    const x = CFG.LANES[lane];
    chunk.holes.push({ x, z: zCenter, hw: 1.05, hd: len / 2 });
    // visual pit
    const pit = new THREE.Mesh(geo('pitHole', () => new THREE.BoxGeometry(2.24, 0.1, len)),
      new THREE.MeshStandardMaterial({ color: 0x0c0912, roughness: 1 }));
    pit.position.set(x, 0.01, zCenter);
    chunk.group.add(pit);
    // broken edges
    const edgeMat = M('rust');
    const edgeGeo = geo('holeEdge', () => new THREE.BoxGeometry(0.22, 0.3, 0.3));
    for (const ez of [-len / 2, len / 2]) {
      for (let k = 0; k < 3; k++) {
        const e = new THREE.Mesh(edgeGeo, edgeMat);
        e.position.set(x - 0.9 + k * 0.9, 0.06, zCenter + ez * 0.94);
        e.rotation.z = randRange(-0.25, 0.25);
        chunk.group.add(e);
      }
    }
    // warning stripes on deck before hole
    const warnTex = hazardTexture();
    for (const wz of [zCenter + len / 2 + 1.2, zCenter - len / 2 - 1.2]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.55), new THREE.MeshBasicMaterial({ map: warnTex, transparent: true }));
      w.rotation.x = -Math.PI / 2;
      w.position.set(x, 0.021, wz);
      chunk.group.add(w);
    }
    // red beacon posts at both far corners
    for (const bz of [zCenter + len / 2 + 0.4, zCenter - len / 2 - 0.4]) {
      const post = new THREE.Mesh(geo('beaconPost', () => new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5)), M('darkMetal'));
      post.position.set(x + 1.0, 0.75, bz);
      chunk.group.add(post);
      const dot = new THREE.Mesh(geo('beaconDot', () => new THREE.SphereGeometry(0.11, 8, 6)), M('taillight'));
      dot.position.set(x + 1.0, 1.55, bz);
      chunk.group.add(dot);
    }
  }

  // ================= archetype sections (one chunk each call) =================
  buildOpen(chunk, sec, world) {
    const rng = Math.random;
    const tier = sec.tier;
    const D = this;
    const nObs = tier === 0 ? 2 : tier === 1 ? 3 : 4;
    let usedLanes = [];
    for (let i = 0; i < nObs; i++) {
      const z = chunk.z1 - randRange(6 + i * (L / nObs), 10 + i * (L / nObs));
      const lane = (rng() * 3) | 0;
      const r = rng();
      if (r < 0.38) D.addLowBarrier(chunk, lane, z);
      else if (r < 0.62) D.addRollGantry(chunk, lane, z);
      else if (r < 0.82) D.addCones(chunk, lane, z, 2 + ((rng() * 2) | 0));
      else D.addTrackEquip(chunk, lane, z);
      usedLanes.push(lane);
    }
    // rare full blocker in higher tiers — never all three lanes
    if (tier >= 1 && rng() < 0.35) {
      const lane = (rng() * 3) | 0;
      D.addBlocker(chunk, lane, chunk.z1 - randRange(L * 0.55, L * 0.9));
    }
  }

  buildConstruction(chunk, sec, world) {
    const rng = Math.random;
    const zBase = chunk.z1 - 4;
    const lanes = [0, 1, 2].sort(() => rng() - 0.5);
    // two lanes get construction, one stays open-ish with coins
    this.addLowBarrier(chunk, lanes[0], zBase - 6);
    this.addCones(chunk, lanes[0], zBase - 9, 3);
    if (sec.tier >= 1 && rng() < 0.6) this.addRollGantry(chunk, lanes[1], zBase - 16);
    else this.addTrackEquip(chunk, lanes[1], zBase - 17);
    if (sec.tier >= 2) this.addBlocker(chunk, lanes[1], zBase - 27);
    // scaffolding decor on the side
    const side = rng() < 0.5 ? -1 : 1;
    const sc = new THREE.Group();
    const poleG = geo('scafPole', () => new THREE.CylinderGeometry(0.07, 0.07, 5.2, 6));
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(poleG, M('rust'));
      p.position.set((i % 2) * 1.6 - 0.8, 2.6, Math.floor(i / 2) * 2.4 - 1.2);
      sc.add(p);
    }
    const plankG = geo('scafPlank', () => new THREE.BoxGeometry(2.0, 0.08, 3.4));
    for (const py of [1.4, 3.0]) {
      const pl = new THREE.Mesh(plankG, M('wood'));
      pl.position.y = py;
      sc.add(pl);
    }
    sc.position.set(side * 6.6, 0, chunk.z1 - L * 0.4);
    chunk.group.add(sc);
  }

  buildMaintenance(chunk, sec, world) {
    const rng = Math.random;
    const zBase = chunk.z1 - 4;
    const lanes = [0, 1, 2].sort(() => rng() - 0.5);
    this.addTrackEquip(chunk, lanes[0], zBase - 8);
    this.addTrackEquip(chunk, lanes[1], zBase - 20);
    if (sec.tier >= 1) this.addLowBarrier(chunk, lanes[2], zBase - 14);
    // tool shelves + cable spools on sides
    for (const side of [-1, 1]) {
      if (rng() < 0.7) {
        const spool = new THREE.Mesh(geo('spool', () => new THREE.CylinderGeometry(0.8, 0.8, 0.9, 10)), M('wood'));
        spool.rotation.x = Math.PI / 2;
        spool.position.set(side * randRange(6.2, 7.4), 0.8, chunk.z1 - L * rng());
        chunk.group.add(spool);
      }
    }
    // short parked train without ramp sometimes (roof reachable via jump chains only)
    world.deps.trains.spawnParked(world, chunk, choice(lanes.slice(0, 2)), zBase - 20, 1, false);
  }

  buildStation(chunk, sec, world) {
    const g = chunk.group;
    const nameSign = STATION_NAMES[this.stationIdx++ % STATION_NAMES.length];
    // platforms both sides (raised, non-playable)
    for (const side of [-1, 1]) {
      const plat = new THREE.Mesh(geo('platformSlab', () => new THREE.BoxGeometry(2.6, 1.05, L * 3)),
        new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 0.9 }));
      plat.position.set(side * 6.65, 0.52, chunk.z1 - L * 1.5);
      plat.receiveShadow = true;
      g.add(plat);
      // yellow safety line
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, L * 3), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(side * 5.55, 1.051, chunk.z1 - L * 1.5);
      g.add(line);
      // pillars
      const pilG = geo('statPillar', () => new THREE.CylinderGeometry(0.28, 0.32, 4.6, 8));
      for (let i = 0; i < 4; i++) {
        const pil = new THREE.Mesh(pilG, M('pillar'));
        pil.position.set(side * 7.4, 1.05 + 2.3, chunk.z1 - 4 - i * (L * 3 / 4));
        pil.castShadow = true;
        g.add(pil);
      }
      // roof over platform
      const roofP = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, L * 3),
        new THREE.MeshStandardMaterial({ color: 0x37405a, roughness: 0.7, metalness: 0.3 }));
      roofP.position.set(side * 6.9, 5.6, chunk.z1 - L * 1.5);
      g.add(roofP);
      // benches + vending machine
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 2.2), M('wood'));
      seat.position.y = 1.55;
      bench.add(seat);
      for (const bz of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.12), M('darkMetal'));
        leg.position.set(0, 1.25, bz);
        bench.add(leg);
      }
      bench.position.set(side * 6.9, 0, chunk.z1 - L * randRange(0.8, 2.2));
      g.add(bench);
      if (Math.random() < 0.7) {
        const vend = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.7),
          new THREE.MeshStandardMaterial({
            color: choice([0xd8534f, 0x3f7fb8]), roughness: 0.4,
            emissive: 0x224466, emissiveIntensity: 0.4,
          }));
        vend.position.set(side * 7.3, 1.05 + 0.95, chunk.z1 - L * randRange(0.6, 2.4));
        g.add(vend);
      }
    }
    // big station name board across the track
    const tex = stationSign(nameSign);
    const board = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.5, 0.18),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35 }));
    board.position.set(0, 3.6, chunk.z1 - 8);
    g.add(board);
    for (const sx of [-3.7, 3.7]) {
      const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), M('darkMetal'));
      hang.position.set(sx, 4.9, chunk.z1 - 8);
      g.add(hang);
    }
    // gameplay: roll-under gantries mid-track
    this.addRollGantry(chunk, 0, chunk.z1 - 18, nameSign);
    this.addRollGantry(chunk, 2, chunk.z1 - 30, nameSign);
    this.addLowBarrier(chunk, 1, chunk.z1 - 24);
  }

  buildTunnel(chunk, sec, world) {
    const g = chunk.group;
    const isStart = sec.state.tunnelStarted !== true;
    sec.state.tunnelStarted = true;
    // arch shell
    const arch = new THREE.Mesh(
      geo('tunnelArch', () => {
        const gg = new THREE.CylinderGeometry(7.4, 7.4, L, 18, 1, true, 0, Math.PI);
        gg.rotateZ(Math.PI / 2);
        gg.rotateY(Math.PI / 2);
        return gg;
      }),
      new THREE.MeshStandardMaterial({
        color: 0x4a4552, roughness: 0.95, side: THREE.BackSide,
      }));
    arch.position.set(0, 0.4, chunk.z1 - L / 2);
    g.add(arch);
    // string lights along tunnel crown
    const dotG = geo('tunnelDot', () => new THREE.SphereGeometry(0.09, 6, 5));
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(dotG, M('lamp'));
      d.position.set(randRange(-2.5, 2.5), 5.4, chunk.z1 - 3 - i * 6);
      g.add(d);
    }
    // entrance portal frame on first chunk
    if (isStart) {
      const portal = new THREE.Mesh(geo('tunnelPortal', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-6.4, -0.4); shape.lineTo(-6.4, 5.2);
        shape.absarc(0, 5.2, 6.4, Math.PI, 0, true);
        shape.lineTo(6.4, -0.4); shape.lineTo(-6.4, -0.4);
        const hole = new THREE.Path();
        hole.moveTo(-5.6, -0.4); hole.lineTo(-5.6, 4.9);
        hole.absarc(0, 4.9, 5.6, Math.PI, 0, true);
        hole.lineTo(5.6, -0.4); hole.lineTo(-5.6, -0.4);
        shape.holes.push(hole);
        const gg = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false });
        return gg;
      }), new THREE.MeshStandardMaterial({ color: 0x5a5568, roughness: 0.9 }));
      portal.position.set(0, 0, chunk.z1 + 0.4);
      g.add(portal);
      const tex = signTexture('TUNNEL', '#20283e');
      const st = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
      st.position.set(0, 6.6, chunk.z1 - 0.1);
      g.add(st);
    }
    // denser low obstacles inside
    const zB = chunk.z1 - 6;
    this.addCones(chunk, 0, zB - 6, 3);
    this.addLowBarrier(chunk, 1, zB - 14);
    if (sec.tier >= 2) this.addRollGantry(chunk, 2, zB - 22);
    this.addTrackEquip(chunk, choice([0, 2]), zB - 28);
  }

  buildHoles(chunk, sec, world) {
    const rng = Math.random;
    const zBase = chunk.z1 - 6;
    const safeLane = (rng() * 3) | 0;
    const others = [0, 1, 2].filter(l => l !== safeLane);
    const l1 = others[0];
    const l2 = sec.tier >= 2 ? others[1] : -1;
    this.addHole(chunk, l1, zBase - 10, 7);
    if (l2 >= 0 && rng() < 0.6) this.addHole(chunk, l2, zBase - 26, 6);
    // coins arc over one hole
    world.deps.collectibles.coinArcOverLong(chunk, l1, zBase - 10, 7);
    // small obstacle on safe lane to keep it interesting but passable
    if (rng() < 0.5) this.addLowBarrier(chunk, safeLane, zBase - 30);
  }
}
