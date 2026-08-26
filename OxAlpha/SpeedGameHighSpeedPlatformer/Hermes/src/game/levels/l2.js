import * as THREE from 'three';
const UP = new THREE.Vector3(0, 1, 0);
import { clamp, lerp } from '../mathutil.js';
import { texNeonGrid } from '../../engine/textures.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// NEON VORTEX — midnight rooftop run. Street far below is lethal (security field).
export function buildL2(g) {
  const kit = g.kit;
  const M = kit.mats();
  const ROOFTOP = M.stone;
  kit.clouds(8, 130, 900, 0x8f7fd0);

  // street (visual only, way below)
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ map: texNeonGrid('#ff2fb4', [8, 6, 18]), emissiveMap: texNeonGrid('#19e6ff', [8, 6, 18]), emissive: 0x2266aa, emissiveIntensity: 0.5, roughness: 0.9 })
  );
  street.rotation.x = -Math.PI / 2;
  street.position.y = 0;
  g.scene.add(street);

  // background skyline (non-collide decor)
  kit.scatterBuildings({ x: 0, z: 480, w: 1100, d: 1300 }, 90, {
    avoid: (x, z) => Math.abs(x) < 34 && z > -40 && z < 1060,
    minH: 14, maxH: 52, shadow: false,
  });

  // helper: solid tower with lit rim
  function tower(x, z, w, d, topY, mat = ROOFTOP) {
    const m = kit.box(w, topY, d, { x, y: 0, z }, 0, mat);
    // neon rim
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), M.accent2);
    rim.position.set(x, topY + 0.05, z);
    g.scene.add(rim);
    return m;
  }

  // ================= START ROOFTOP =================
  tower(0, 0, 34, 34, 60);
  g.sign('NEON VORTEX\nMind the gap. The street bites.', V3(5, 60, -8), 0.2);
  g.chip(V3(-13, 61.4, -13));
  g.panel(V3(0, 60.1, 10), 0, 46);
  g.orbLine(V3(0, 62, 18), V3(0, 63.5, 44), 6);

  // Billboard hop towers
  tower(0, 56, 20, 20, 56);
  g.prism(V3(0, 62.5, 39));                       // caught mid-gap
  tower(8, 98, 22, 18, 64);
  // big holo billboard decor on tower 2
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), M.accent);
  bb.position.set(8, 72, 98); bb.rotation.y = 0;
  g.scene.add(bb);
  g.enemy('gnat', V3(14, 68, 92));

  // ================= TRAFFIC CANYON =================
  // walls
  kit.box(6, 46, 116, { x: -18, y: 28, z: 208 }, 0, M.building);
  kit.box(6, 52, 116, { x: 22, y: 25, z: 208 }, 0, M.building);
  // bridge floor
  kit.box(14, 2, 110, { x: 2, y: 49, z: 208 }, 0, ROOFTOP);
  tower(-2, 138, 18, 16, 52);   // canyon entry pad
  tower(-2, 278, 26, 26, 52);   // junction plaza
  g.panel(V3(2, 51.1, 156), 0, 46);
  g.checkpoint(V3(-2, 52.1, 146), 0);
  g.enemy('gnat', V3(-4, 55, 180));
  g.enemy('gnat', V3(8, 57, 214), { patrol: V3(4, 0, 6) });
  g.enemy('gnat', V3(-6, 54, 240));
  g.orbLine(V3(2, 53.4, 170), V3(2, 53.4, 250), 12);
  g.chip(V3(-14, 51.4, 232));     // tucked against west wall
  g.enemy('turret', V3(16, 52.2, 264));

  // ================= MAGLEV JUNCTION =================
  g.rail([V3(-6, 54, 290), V3(-8, 52, 320), V3(-6, 51.5, 348)], { color: 0x37e0ff });
  g.rail([V3(8, 56, 290), V3(12, 60, 318), V3(8, 58, 344), V3(2, 56.5, 356)], { color: 0xffd94a });
  g.orbArc([V3(9, 59, 300), V3(13, 63, 322), V3(8, 60, 348)], 8);
  g.sign('Rails magnetize you.\nC = crouch-boost', V3(10, 57, 286), 1.4);

  // ================= ANTIGRAV PLAZA =================
  tower(0, 388, 36, 36, 52);
  g.checkpoint(V3(0, 52.1, 372), 0);
  g.fan(V3(-8, 62, 392), new THREE.Vector3(3, 8, 3), 50);
  g.fan(V3(9, 62, 384), new THREE.Vector3(3, 8, 3), 50);
  const ringY = 70;
  // open frame (corner pillars only, glassless)
  for (const [px, pz] of [[-10, 378], [10, 378], [-10, 398], [10, 398]]) {
    kit.box(1, 18, 1, { x: px, y: ringY - 9, z: pz }, 0, M.stone);
  }
  const rimMat = M.accent2;
  const rimN = new THREE.Mesh(new THREE.BoxGeometry(21, 0.35, 0.35), rimMat);
  rimN.position.set(0, ringY, 378);
  const rimS = rimN.clone(); rimS.position.z = 398;
  const rimE = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 21), rimMat);
  rimE.position.set(10.5, ringY, 388);
  const rimW = rimE.clone(); rimW.position.x = -10.5;
  g.scene.add(rimN, rimS, rimE, rimW);
  g.prism(V3(0, ringY + 1.6, 388));
  g.enemy('turret', V3(-14, 52.2, 400));
  g.enemy('roller', V3(-12, 52.2, 376), { to: V3(12, 52.2, 376), speed: 12 });
  g.crate(V3(6, 52.8, 396)); g.crate(V3(7.4, 52.8, 396)); g.crate(V3(6.7, 54.0, 396));

  // ================= TOWER CLIMB =================
  kit.cyl(5, 8, 60, { x: 0, y: 30, z: 452 }, M.building, 14);   // core column
  const balc = [
    V3(9, 56, 444), V3(-8, 62, 450), V3(9, 68, 458), V3(-8, 74, 464), V3(8, 80, 452),
  ];
  balc.forEach((p, i) => {
    kit.platform(7, 7, p, { mat: ROOFTOP });
    if (i < balc.length - 1) g.spring(p.clone().add(V3(0, 0.2, 0)), V3(Math.sin(i * 1.9) * 0.5, 1, Math.cos(i * 1.9) * 0.5).normalize(), 21, 0xff3355);
    g.orbCircle(p.clone().add(V3(0, 1.2, 0)), 2.4, 4, UP, i);
  });
  // wall-run slot near the top
  kit.box(1.2, 18, 22, { x: 8, y: 76, z: 476 }, 0.3, M.building);
  kit.box(1.2, 18, 22, { x: -6, y: 76, z: 476 }, -0.3, M.building);
  const hwY = 86;
  tower(0, 512, 30, 26, hwY);
  g.checkpoint(V3(0, hwY + 0.1, 504), 0);
  g.sign('Jump between walls = WALL RUN\nSPACE kicks off', V3(6, 82, 470), 2.6);
  g.enemy('stomper', V3(-8, hwY + 0.2, 512), { to: V3(8, hwY, 516) });

  // ================= SKY HIGHWAY double loop =================
  const HW = (z0, z1, y) => kit.box(11, 2, z1 - z0, { x: 0, y: y - 2, z: (z0 + z1) / 2 }, 0, ROOFTOP);
  HW(524, 560, hwY);
  g.panel(V3(0, hwY + 0.1, 532), 0, 46);
  const l1entry = V3(0, hwY + 0.1, 566);
  g.loop(l1entry, 0, 9, 5, M.stone);
  g.prism(V3(0, hwY + 12.5, 570));            // floats past the loop face
  HW(576, 618, hwY);
  g.orbLine(V3(0, hwY + 1.6, 580), V3(0, hwY + 1.6, 614), 7);
  g.panel(V3(0, hwY + 0.1, 620), 0, 46);
  const l2entry = V3(0, hwY + 0.1, 628);
  g.loop(l2entry, 0, 9, 5, M.accent2);
  HW(638, 668, hwY - 2);
  g.orbArc([V3(0, hwY, 640), V3(0, hwY - 4, 654), V3(0, hwY - 9, 672)], 7);

  // ================= CONSTRUCTION ZONE =================
  tower(0, 692, 24, 22, hwY - 12);
  g.checkpoint(V3(0, hwY - 12 + 0.1, 686), 0);
  g.mover(new THREE.Vector3(4.4, 1, 4.4), (t) => V3(lerp(0, 14, t), hwY - 11 + Math.sin(t * 3.14) * 2, lerp(706, 726, t)), 5.5);
  g.mover(new THREE.Vector3(4.4, 1, 4.4), (t) => V3(lerp(0, -12, t), hwY - 10, lerp(720, 742, t)), 6.2, 0.5);
  kit.box(5, 1.4, 30, { x: 8, y: hwY - 13, z: 750 }, 0, M.wood);       // static girder w/ roller
  g.enemy('roller', V3(8, hwY - 12.6, 740), { to: V3(8, hwY - 12.6, 760), speed: 14 });
  g.chip(V3(15, hwY - 11.6, 752));
  tower(0, 776, 22, 20, hwY - 12);
  g.enemy('gnat', V3(10, hwY - 8, 730));

  // ================= CORKSCREW DESCENT =================
  tower(-17, 820, 22, 18, hwY - 10);
  g.panel(V3(-17, hwY - 10 + 0.1, 826), 0, 46);
  // helix around the spire: entry west of core heading +Z, two full turns down
  const cx = 0, cz = 886, R = 17, turns = 2, yTop = hwY - 10, yBot = 12;
  const pts = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = 1.5 * Math.PI + u * turns * 2 * Math.PI;
    pts.push(V3(cx + Math.sin(a) * R, lerp(yTop, yBot, u), cz + Math.cos(a) * R));
  }
  g.channel(pts, 3.4, 7.5, M.stone, Math.PI * 0.06, Math.PI * 0.94);
  kit.cyl(6, 10, 84, { x: cx, y: 0, z: cz }, M.building, 16);   // spire core
  g.prism(V3(cx - R - 4, (yTop + yBot) / 2 + 4, cz));           // beside the spiral, mid-descent
  g.orbLine(V3(cx - R, yBot + 9, cz), V3(cx - R, yBot + 1.5, cz + 16), 7);

  // ================= GOAL PAD =================
  const padY = 6;
  tower(-10, 985, 30, 26, padY);
  g.checkpoint(V3(-10, padY + 0.1, 974), 0);
  g.orbCircle(V3(-10, padY + 1.5, 985), 8, 12, UP, 0);
  g.goal(V3(-10, padY + 0.2, 987), 0);

  return {
    name: 'Neon Vortex',
    par: 150,
    music: 'city',
    spawn: { pos: V3(0, 60.5, -8), yaw: 0 },
    killY: 4,
    prismTotal: 5,
    intro: 'Rooftop courier run!\nDo not touch the street.',
  };
}
