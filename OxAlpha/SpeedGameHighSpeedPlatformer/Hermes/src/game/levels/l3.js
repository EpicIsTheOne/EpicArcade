import * as THREE from 'three';
const UP = new THREE.Vector3(0, 1, 0);
import { clamp, lerp } from '../mathutil.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SEA = -8;

// EMBER FOUNDRY — molten works. Everything below the gantries is lava.
export function buildL3(g) {
  const kit = g.kit;
  const M = kit.mats();
  kit.lavaSea(SEA, 2600);

  // background foundry silhouettes (non-collide)
  for (let i = 0; i < 14; i++) {
    const x = (kit.rng() - 0.5) * 700, z = 200 + kit.rng() * 900;
    if (Math.abs(x) < 40) continue;
    const h = 30 + kit.rng() * 70;
    const chim = kit.cyl(2 + kit.rng() * 4, 5 + kit.rng() * 6, h, { x, y: SEA, z }, M.stone, 8, false);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(4 + kit.rng() * 3, 0.4, 8, 20), M.accent);
    glowRing.position.set(x, SEA + h * 0.6, z);
    glowRing.rotation.x = Math.PI / 2;
    g.scene.add(glowRing);
  }

  const GANTRY = (x, z, w, d, topY, mat = M.stone) => kit.box(w, 2.2, d, { x, y: topY - 1.1, z }, 0, mat);

  // ================= INTAKE YARD =================
  GANTRY(0, 0, 34, 34, 10);
  // support legs
  for (const [lx, lz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
    kit.box(1.6, 9.5, 1.6, { x: lx, y: SEA, z: lz }, 0, M.stone);
  }
  g.sign('EMBER FOUNDRY\nStay off the melt.', V3(5, 10, -8), 0.15);
  g.panel(V3(0, 10.1, 12), 0, 46);

  // ================= CONVEYOR RUN =================
  const conv = (z0, z1, y = 10) => {
    GANTRY(0, (z0 + z1) / 2, 9, z1 - z0, y, M.sand);
    // side rails look
    for (const s of [-4.6, 4.6]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, z1 - z0), M.accent);
      r.position.set(s, y + 0.35, (z0 + z1) / 2);
      g.scene.add(r);
    }
  };
  conv(20, 78); conv(88, 146);
  g.panel(V3(0, 10.1, 84), 0, 44);
  g.checkpoint(V3(0, 10.1, 24), 0);
  g.crate(V3(2.5, 10.8, 40)); g.crate(V3(-2.5, 10.8, 52)); g.crate(V3(0, 12.0, 52));
  g.enemy('gnat', V3(6, 13, 64));
  g.enemy('gnat', V3(-6, 13, 110), { patrol: V3(5, 0, 6) });
  g.orbLine(V3(0, 11.6, 30), V3(0, 11.6, 140), 16);
  g.prism(V3(0, 13.5, 84));   // above the mid panel — grab with a jump-boost

  // ================= LASER HALL =================
  GANTRY(0, 210, 10, 100, 10);
  g.laserGate(V3(-5, 11, 180), V3(5, 11, 180), { period: 2.2, duty: 0.55, phase: 0 });
  g.laserGate(V3(-5, 11, 205), V3(5, 11, 205), { period: 2.2, duty: 0.55, phase: 1.1 });
  g.laserGate(V3(-5, 11, 230), V3(5, 11, 230), { period: 2.4, duty: 0.5, phase: 0.5 });
  g.sign('Time the beams!', V3(7.5, 12.4, 196), 1.5, 0.8);
  g.enemy('turret', V3(0, 11.2, 254));
  g.orbLine(V3(0, 11.6, 186), V3(0, 11.6, 250), 9);
  g.chip(V3(6.5, 11.5, 218));   // side nook past the hall edge
  kit.box(3, 1.2, 6, { x: 7.5, y: 10.6, z: 218 }, 0, M.stone);

  // ================= PIPE LOOP =================
  GANTRY(0, 292, 22, 22, 10);
  g.panel(V3(-2, 10.1, 284), 0, 46);
  g.panel(V3(3, 10.1, 287), 0, 46);
  const lEntry = V3(0, 10.15, 298);
  g.loop(lEntry, 0, 9, 5.5, M.stone);
  // big pipe shell around the loop (visual)
  const shell = new THREE.Mesh(
    new THREE.TorusGeometry(11.5, 2.2, 10, 40),
    new THREE.MeshStandardMaterial({ color: 0x6a4a30, metalness: 0.6, roughness: 0.5 })
  );
  shell.position.set(0, lEntry.y + 9, 298);
  g.scene.add(shell);

  // ================= CRANE RAILS =================
  GANTRY(0, 340, 16, 16, 12);
  g.checkpoint(V3(0, 12.1, 334), 0);
  g.spring(V3(0, 12.2, 344), V3(0, 1, 0.25).normalize(), 26, 0xff3355);
  g.rail([V3(0, 24, 350), V3(-6, 22, 380), V3(-2, 20, 420), V3(-8, 18, 452), V3(-2, 17, 486)], { color: 0xffd94a });
  g.rail([V3(4, 23, 350), V3(10, 21, 384), V3(6, 19.5, 424), V3(12, 18, 456), V3(6, 17, 486)], { color: 0x37e0ff });
  g.orbLine(V3(-5, 24.5, 366), V3(-4, 22, 440), 9);
  g.prism(V3(6, 24, 400));      // between the rails mid-air
  // crossing mover platforms (low route)
  g.mover(new THREE.Vector3(4.4, 1, 4.4), (t) => V3(lerp(-4, 6, t), 16 + Math.sin(t * 3.14) * 1.2, lerp(370, 430, t)), 7);
  g.mover(new THREE.Vector3(4.4, 1, 4.4), (t) => V3(lerp(6, -4, t), 16.5, lerp(400, 460, t)), 7.5, 0.5);
  g.enemy('stomper', V3(0, 12.2, 340), { to: V3(6, 12, 344) });

  // ================= FURNACE CORE ROOM =================
  GANTRY(0, 540, 40, 40, 14);
  kit.cyl(7, 8, 26, { x: 0, y: SEA, z: 540 }, M.stone, 14);   // furnace column through the room
  const furnaceGlow = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 3, 14),
    new THREE.MeshStandardMaterial({ color: 0xff5518, emissive: 0xff3300, emissiveIntensity: 2.2 }));
  furnaceGlow.position.set(0, 8, 540);
  g.scene.add(furnaceGlow);
  g.tickFns.push((dt, t) => { furnaceGlow.material.emissiveIntensity = 1.8 + Math.sin(t * 5) * 0.7; });
  for (const [ex, ez] of [[-16, 524], [16, 524], [-16, 556], [16, 556]]) kit.box(1.4, 12, 1.4, { x: ex, y: SEA, z: ez }, 0, M.stone);
  g.enemy('turret', V3(-14, 14.2, 528));
  g.enemy('turret', V3(14, 14.2, 552));
  g.enemy('gnat', V3(0, 18, 540), { patrol: V3(8, 0, 8) });
  g.enemy('gnat', V3(-8, 17, 550));
  g.fan(V3(12, 22, 532), new THREE.Vector3(2.4, 7, 2.4), 50);
  kit.platform(10, 10, V3(12, 27, 532), { mat: M.stone });     // upper ring perch
  g.chip(V3(12, 28.6, 532));
  g.crate(V3(-6, 14.8, 548)); g.crate(V3(-4.6, 14.8, 548)); g.crate(V3(-5.3, 16.0, 548));
  g.orbCircle(V3(0, 15.6, 540), 12, 12, UP, 0.3);
  g.checkpoint(V3(0, 14.1, 520), 0);

  // ================= ELEVATOR SHAFT =================
  kit.box(1.4, 42, 20, { x: -9, y: 8, z: 600 }, 0, M.stone);
  kit.box(1.4, 42, 20, { x: 9, y: 8, z: 600 }, 0, M.stone);
  g.mover(new THREE.Vector3(6, 1, 6), (t) => V3(0, 12 + t * (t < 0.5 ? 0 : 0) + (t <= 0.5 ? t * 56 : (1 - t) * 56), 600), 8);
  g.sign('Ride the lift\nor wall-run the shaft', V3(-6, 14, 588), 1.5, 0.85);

  // ================= MELTSTREAM SLIDE =================
  GANTRY(0, 636, 18, 18, 68);
  const slidePts = [
    V3(0, 67, 640), V3(6, 62, 664), V3(-4, 56, 692), V3(8, 49, 720),
    V3(-6, 41, 750), V3(4, 32, 778), V3(0, 24, 800),
  ];
  g.channel(slidePts, 3.4, 8, M.rock, Math.PI * 0.08, Math.PI * 0.92);
  g.orbArc(slidePts.map((p) => p.clone().add(V3(0, 2.4, 0))), 12);
  g.checkpoint(V3(0, 68.1, 632), 0);
  g.enemy('roller', V3(0, 68.4, 650), { to: V3(0, 68.4, 660), speed: 10 });

  // ================= VOLCANO LAUNCH + GOAL =================
  GANTRY(0, 816, 20, 20, 22);
  g.spring(V3(0, 22.2, 820), V3(0, 1, 0.35).normalize(), 34, 0xffd94a);
  g.orbArc([V3(0, 34, 830), V3(0, 30, 850), V3(0, 20, 866)], 8);
  const padY = 12;
  GANTRY(0, 892, 30, 26, padY);
  for (const [lx, lz] of [[-12, 882], [12, 882], [-12, 902], [12, 902]]) kit.box(1.8, padY - SEA, 1.8, { x: lx, y: SEA, z: lz }, 0, M.stone);
  // cooling tower decor
  kit.cyl(5, 7, 34, { x: -22, y: SEA, z: 900 }, M.stone, 12, false);
  kit.cyl(5, 7, 28, { x: 22, y: SEA, z: 906 }, M.stone, 12, false);
  g.checkpoint(V3(0, padY + 0.1, 880), 0);
  g.orbCircle(V3(0, padY + 1.5, 892), 8, 12, UP, 0);
  g.goal(V3(0, padY + 0.2, 894), 0);
  g.sign('ESCAPE CHUTE!\nRide it home', V3(6, 24, 806), 1.5, 0.85);

  return {
    name: 'Ember Foundry',
    par: 165,
    music: 'foundry',
    spawn: { pos: V3(0, 10.5, -6), yaw: 0 },
    killY: SEA + 3,
    prismTotal: 4,
    intro: 'The Static has taken the Foundry.\nPurge it and escape!',
  };
}
