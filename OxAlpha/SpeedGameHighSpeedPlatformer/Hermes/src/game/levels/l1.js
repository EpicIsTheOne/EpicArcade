import * as THREE from 'three';
const UP = new THREE.Vector3(0, 1, 0);
import { clamp, lerp, fbm2 } from '../mathutil.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Terrain height for Sunspire Coast.
export function hL1(x, z) {
  let y = 3.2 + Math.sin(x * 0.017) * 1.8 + Math.sin(z * 0.012 + x * 0.006) * 2.2
    + (fbm2(x / 55, z / 55, 3, 7) - 0.5) * 4.5;
  // west dropoff into the sea
  const w = clamp((42 - x) / 42, 0, 1);
  y -= w * w * 34;
  // east cliffs
  const e = clamp((x - 95) / 55, 0, 1);
  y += e * e * 34;
  // start plaza flatten
  const d0 = Math.hypot(x, z);
  if (d0 < 36) { const k = clamp(d0 / 36, 0, 1); y = lerp(3.4, y, k * k); }
  // beach corridor gentle (route to first spring)
  if (z > 10 && z < 230 && Math.abs(x) < 60) {
    const k = 1 - clamp((Math.abs(x) - 40) / 20, 0, 1);
    y = lerp(y, 4.2 + Math.sin(z * 0.05) * 0.8, k * 0.75);
  }
  // chasm / sea inlet band
  const tz = clamp(1 - Math.abs(z - 520) / 38, 0, 1);
  y -= tz * tz * 46;
  // ridge for the final descent (runs SE)
  const rd = Math.hypot(x - 150, z - 700);
  y += Math.exp(-(rd * rd) / (130 * 130)) * 24;
  const rd2 = Math.hypot(x - 175, z - 780);
  y += Math.exp(-(rd2 * rd2) / (110 * 110)) * 16;
  return y;
}

export function buildL1(g) {
  const kit = g.kit;
  const M = kit.mats();
  kit.clouds(12, 95, 800, 0xffffff);
  kit.water(-13, 2600, 0x0c5068, 0x39c8f0);

  // ---- terrain ----
  kit.terrain(430, 1020, 96, 210, hL1, M.ground, (y, slope) => {
    if (slope > 0.45) return new THREE.Color(0.62, 0.58, 0.52);           // rocky steeps
    if (y < 1.6) return new THREE.Color(1.35, 1.22, 0.9);                 // sand
    return null; // default grass tint via texture
  });

  // distant islands
  kit.cyl(6, 26, 26, { x: -180, y: -14, z: 300 }, M.rock, 7);
  kit.cyl(4, 18, 18, { x: -220, y: -14, z: 620 }, M.rock, 6);
  kit.scatterRocks({ x: 120, z: 300, w: 200, d: 500, hFn: hL1 }, 40);
  kit.scatterTrees({ x: 120, z: 420, w: 160, d: 480, hFn: hL1, valid: (x, y) => y > 4 && x < 150 }, 90);
  kit.scatterTrees({ x: 60, z: 640, w: 140, d: 260, hFn: hL1, valid: (x, y) => y > 4 }, 70);

  // ================= ROUTE =================
  // Start plaza
  g.sign('KINETIC RUSH\nWASD move · SPACE jump · SHIFT overdrive', V3(4, hL1(4, 8), 8), 0);
  g.orbLine(V3(0, hL1(0, 14) + 1.2, 14), V3(0, hL1(0, 30) + 1.2, 30), 6);

  // Beach runway + dash panel
  g.panel(V3(0, hL1(0, 20), 20), 0, 44);
  g.orbLine(V3(0, hL1(0, 34) + 1.2, 34), V3(-6, hL1(-6, 100) + 1.2, 100), 14);
  g.enemy('gnat', V3(8, hL1(8, 64) + 2.4, 64));
  g.enemy('gnat', V3(-14, hL1(-14, 104) + 2.4, 104), { patrol: V3(6, 0, 8) });
  g.orbLine(V3(-6, hL1(-6, 120) + 1.2, 120), V3(10, hL1(10, 170) + 1.2, 170), 12);
  g.enemy('gnat', V3(16, hL1(16, 150) + 2.6, 150));

  // Curve right toward cliff base; crates & orbs reward line
  g.orbLine(V3(14, hL1(14, 185) + 1.2, 185), V3(32, hL1(32, 212) + 1.2, 212), 8);
  g.crate(V3(22, hL1(22, 196) + 0.8, 196));

  // Spring up onto cliff ledges (platforming beat)
  g.spring(V3(34, hL1(34, 218), 218), V3(0.25, 1, 0.35).normalize(), 24, 0xff3355);
  g.checkpoint(V3(30, hL1(30, 214), 214), 0.5);
  const ledgeY = hL1(34, 218) + 11;
  g.platform(9, 9, V3(46, ledgeY, 234), { mat: M.stone });
  g.orbLine(V3(46, ledgeY + 1.4, 234), V3(60, ledgeY + 1.6, 254), 5);
  g.platform(8, 8, V3(62, ledgeY + 1, 256), { mat: M.stone });
  g.platform(9, 8, V3(78, ledgeY + 0.5, 274), { mat: M.stone });
  g.enemy('gnat', V3(84, ledgeY + 3.5, 280));
  g.sign('SPACE in air near enemies\n= CHAIN DASH', V3(66, ledgeY + 2, 262), 2.4);

  // Upper rail along coast (skill route)
  const railTop = g.rail([
    V3(86, ledgeY + 1.5, 286), V3(96, ledgeY + 2.5, 320), V3(104, ledgeY - 1, 360),
    V3(108, ledgeY - 5, 400), V3(106, hL1(106, 436) + 4, 436),
  ]);
  g.orbArc([V3(88, ledgeY + 3, 292), V3(100, ledgeY + 5, 330), V3(107, ledgeY, 380)], 10);

  // Lower canyon shortcut (alternate to the cliff rail)
  const cavY = hL1(50, 300);
  g.box(1.6, 10, 80, { x: 42, y: cavY - 1.5, z: 338 }, 0.05, M.rock);   // west wall
  g.box(1.6, 12, 84, { x: 60, y: cavY - 1.5, z: 340 }, -0.04, M.rock);  // east wall
  g.panel(V3(50, cavY + 0.15, 300), 0.05, 46);
  g.chip(V3(57.6, cavY + 3.2, 336));                                    // tucked ledge by the wall
  g.box(3, 3, 6, { x: 58, y: cavY - 0.4, z: 336 }, 0, M.rock);          // chip perch block
  g.orbLine(V3(50, cavY + 1.6, 306), V3(51, cavY + 1.6, 370), 8);
  g.enemy('turret', V3(44, hL1(44, 388), 388));

  // Converge at the ancient loop
  const loopEntry = V3(100, hL1(100, 450) + 0.4, 450);
  g.checkpoint(loopEntry.clone().add(V3(-6, 0, -6)), 0.3);
  g.panel(V3(96, hL1(96, 442), 442), 0, 46);
  g.panel(V3(103, hL1(103, 446), 446), 0, 46);
  const loopC = g.loop(loopEntry, 0, 9, 5.5, M.stone);
  g.prism(V3(100, loopEntry.y + 11.5, 460));                                   // mid-air above loop exit

  // Launch ramp over the inlet (spectacle: waterfall wall on far cliff)
  const rampZ = 476;
  const ramp = g.kit.box(7, 1.2, 14, { x: 100, y: hL1(100, rampZ), z: rampZ }, 0, M.wood);
  ramp.rotation.x = -0.24;
  g.world.addStatic(ramp);
  g.orbArc([V3(100, hL1(100, 492) + 6, 492), V3(100, 14, 530), V3(100, hL1(100, 568) + 4, 568)], 9);

  // waterfall curtain on far cliff (walk-through secret behind it)
  const wfMat = new THREE.MeshBasicMaterial({
    color: 0xbfefff, transparent: true, opacity: 0.5,
    map: (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#dff4ff'; ctx.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.fillRect(Math.random() * 64, 0, 2 + Math.random() * 3, 128);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
  });
  const wfMap = wfMat.map; wfMat.map.repeat.set(2, 4);
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(16, 34), wfMat);
  wf.position.set(100, 4, 556);
  g.scene.add(wf);
  g.tickFns.push((dt) => { wfMap.offset.y -= dt * 1.4; });
  g.chip(V3(100, hL1(100, 566) + 1.6, 566));

  // Landing island
  const islandY = hL1(100, 585);
  g.checkpoint(V3(100, islandY, 585), 0);
  g.platform(16, 14, V3(100, islandY + 0.05, 588), { mat: M.stone });
  g.enemy('stomper', V3(96, islandY + 0.2, 590), { to: V3(108, islandY, 592) });
  g.crate(V3(94, islandY + 0.8, 594)); g.crate(V3(95.4, islandY + 0.8, 594)); g.crate(V3(94.7, islandY + 2.0, 594));

  // Moving platform chain toward the shaft
  g.mover(new THREE.Vector3(4, 1, 4),
    (t) => V3(lerp(100, 118, t), islandY + 2.5 + Math.sin(t * 3.14) * 1.5, lerp(600, 628, t)), 5.2);
  g.mover(new THREE.Vector3(4, 1, 4),
    (t) => V3(lerp(124, 132, t), islandY + 4 + Math.cos(t * 3.14) * 2, lerp(636, 656, t)), 6);

  // Vertical choice: fan updraft OR wall-run shaft
  const shaftX = 138, shaftZ = 664, shaftBase = hL1(shaftX, shaftZ);
  g.fan(V3(shaftX, shaftBase + 10.5, shaftZ), new THREE.Vector3(2.6, 10.5, 2.6), 52);
  // wall-run pair
  g.box(1.4, 22, 26, { x: shaftX + 6, y: shaftBase, z: shaftZ - 4 }, 0.35, M.rock);
  g.box(1.4, 22, 26, { x: shaftX - 2, y: shaftBase, z: shaftZ - 4 }, -0.25, M.rock);
  const topLedgeY = shaftBase + 21;
  g.platform(10, 8, V3(shaftX + 2, topLedgeY, shaftZ + 6), { mat: M.stone });
  g.prism(V3(shaftX + 2, topLedgeY + 1.6, shaftZ + 6));
  g.chip(V3(shaftX + 12, topLedgeY + 1.4, shaftZ - 2));
  g.checkpoint(V3(shaftX + 2, topLedgeY + 0.1, shaftZ + 6), 0.9);
  g.sign('Hold C mid-air = STOMP', V3(shaftX + 8, topLedgeY + 1.5, shaftZ + 10), 2.6);

  // Ridge mega-descent
  const descStart = V3(shaftX + 2, topLedgeY + 0.2, shaftZ + 10);
  g.panel(descStart.clone(), 1.15, 46);
  g.orbLine(V3(146, hL1(146, 690) + 1.4, 690), V3(162, hL1(162, 730) + 1.4, 730), 10);
  g.enemy('gnat', V3(158, hL1(158, 712) + 3, 712));
  g.orbLine(V3(166, hL1(166, 748) + 1.4, 748), V3(178, hL1(178, 786) + 1.4, 786), 10);
  g.prism(V3(172, hL1(172, 768) + 1.6, 768));
  kit.scatterRocks({ x: 165, z: 750, w: 60, d: 90, hFn: hL1 }, 16);

  // Final rail Y-splice
  const forkY = hL1(184, 806);
  g.rail([V3(184, forkY + 2.2, 806), V3(190, forkY + 4.5, 826), V3(193, forkY + 5.5, 846)], { color: 0xffd94a });   // high risk
  g.rail([V3(181, forkY + 0.8, 806), V3(184, forkY + 1.5, 826), V3(187, forkY + 2, 846)], { color: 0x37e0ff });      // safe
  g.orbLine(V3(189, forkY + 6.5, 812), V3(192, forkY + 7.5, 842), 7);
  g.checkpoint(V3(184, forkY, 804), 0.2);
  g.sign('Choose your rail!\nGold = faster · Blue = safer', V3(180, forkY + 2, 800), -0.4);

  // Goal temple
  const goalY = hL1(188, 866);
  kit.platform(26, 22, V3(190, goalY + 0.02, 872), { mat: M.stone });
  kit.box(2, 5, 2, { x: 182, y: goalY, z: 866 }, 0, M.stone);
  kit.box(2, 5, 2, { x: 198, y: goalY, z: 866 }, 0, M.stone);
  g.goal(V3(190, goalY + 0.2, 874), 0);
  g.orbCircle(V3(190, goalY + 1.4, 872), 7, 10, UP, 0);

  return {
    name: 'Sunspire Coast',
    par: 115,
    music: 'coast',
    spawn: { pos: V3(0, hL1(0, -6), -6), yaw: 0 },
    killY: -12.5,
    prismTotal: 3,
    intro: 'Deliver the spark to the Sky Temple!\nFollow the golden trail east.',
  };
}
