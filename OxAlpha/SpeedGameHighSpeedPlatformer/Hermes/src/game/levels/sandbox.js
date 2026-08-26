import * as THREE from 'three';
import { lerp } from '../mathutil.js';
const UP = new THREE.Vector3(0, 1, 0);

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Sandbox — QA proving ground with every traversal gadget on flat ground.
export function buildSandbox(g) {
  const kit = g.kit;
  const M = kit.mats();
  kit.clouds(6, 60, 500);

  const ground = (x, z) => 0;
  kit.terrain(400, 900, 40, 90, () => 0, M.ground);
  kit.water(-24, 2000, 0x0c5068, 0x2a9cc8);

  // long runway
  g.panel(V3(0, 0.1, 10), 0, 46);
  g.orbLine(V3(0, 1.3, 20), V3(0, 1.3, 120), 14);
  g.sign('SANDBOX\nAll gadgets live', V3(8, 0, 4), 0);

  // wall-run pair
  kit.box(1.2, 10, 30, { x: 7, y: 0, z: 150 }, 0.15, M.stone);
  kit.box(1.2, 10, 30, { x: -5, y: 0, z: 150 }, -0.15, M.stone);
  g.sign('WALL RUN', V3(11, 2, 140), 1.57, 0.9);

  // rail
  g.rail([V3(0, 4, 190), V3(4, 5, 230), V3(-4, 6, 270), V3(0, 7, 310)], { color: 0xffd94a });
  g.spring(V3(0, 0.2, 182), V3(0, 1, 0.35).normalize(), 22, 0xff3355);

  // loop
  g.panel(V3(0, 0.1, 340), 0, 46);
  g.panel(V3(4, 0.1, 344), 0, 46);
  g.loop(V3(0, 0.15, 360), 0, 9, 5.5, M.stone);

  // movers
  g.mover(new THREE.Vector3(4, 1, 4), (t) => V3(lerp(-8, 8, t), 2 + Math.sin(t * 3.14) * 1.5, lerp(420, 450, t)), 6);
  g.fan(V3(16, 8, 470), new THREE.Vector3(3, 7, 3), 50);

  // enemies & collectibles
  g.enemy('gnat', V3(6, 2.5, 80));
  g.enemy('gnat', V3(-6, 2.5, 240));
  g.enemy('turret', V3(12, 0.2, 300));
  g.enemy('stomper', V3(12, 0.2, 380), { to: V3(18, 0, 384) });   // off the runway
  g.enemy('roller', V3(-14, 0.2, 480), { to: V3(-9, 0, 484), speed: 13 });
  g.crate(V3(3, 0.8, 130));
  g.chip(V3(-14, 1.5, 260));
  g.prism(V3(16, 17.5, 470));
  g.checkpoint(V3(0, 0.1, 330), 0);
  g.orbCircle(V3(0, 1.5, 520), 6, 10, UP, 0);
  g.goal(V3(0, 0.2, 522), 0);

  return {
    name: 'Sandbox',
    par: 90,
    music: 'coast',
    spawn: { pos: V3(0, 1.2, -4), yaw: 0 },
    killY: -18,
    prismTotal: 1,
    intro: 'QA sandbox',
    hidden: true,
  };
}
