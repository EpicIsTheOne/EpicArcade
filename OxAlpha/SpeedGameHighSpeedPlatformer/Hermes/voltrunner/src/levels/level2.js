// ZONE 2 — VERDANT RUSH. Sunlit meadowlands, carving river, canyon half-pipe,
// ancient ruins, vine rails and a long spiral descent to the waterfall goal.
import * as THREE from 'three';

const GRASS = [0x4e8f3a, 0x5da344, 0x468236], ROCK = 0x7d8471, SAND = 0xc9b87a, PATHC = 0x8b7748;
const WOOD = 0x6b4a2b, STONE = 0x9aa08c, VINE = 0x59d97e;

export function verdantRush(b) {
  b.name = 'VERDANT RUSH';
  b.parTime = 105;
  b.killZ = -38;
  b.spawnPoint.set(0, 4.5, 14);

  // ---------- TERRAIN (rolling hills + carved river along x≈0) ----------
  const riverDepth = (x, z) => {
    const d = Math.abs(x);
    if (d > 10) return 0;
    const t = 1 - d / 10;
    return -(t * t) * 7;
  };
  const hFn = (x, z) => {
    let y = Math.sin(x * .045) * Math.cos(z * .038) * 2.4
      + Math.sin(x * .11 + z * .05) * .9
      + Math.cos(z * .02 - x * .02) * 1.6
      + Math.max(0, (z + 60) * -.012);           // gentle overall descent toward goal
    y += riverDepth(x, z);
    // canyon zone: raise walls beside the half-pipe corridor
    if (z < -150 && z > -290 && Math.abs(x) > 13 && Math.abs(x) < 40) {
      y += (1 - Math.abs(Math.abs(x) - 26) / 14) * 16;
    }
    return y;
  };
  const colFn = (y, x, z) => {
    const c = new THREE.Color();
    if (y < -3.4) c.set(SAND);
    else if (y > 9) c.set(ROCK);
    else {
      c.set(GRASS[(Math.floor(x * .21 + z * .17) % GRASS.length + GRASS.length) % GRASS.length]);
      if (Math.abs(x) < 3.4 && z < -20 && z > -140) c.set(PATHC).lerp(c, .35); // worn path
    }
    return c;
  };
  b.terrain(0, -240, 150, 560, 60, 224, hFn, colFn);

  // water plane
  const wg = new THREE.Mesh(new THREE.PlaneGeometry(19, 560),
    new THREE.MeshStandardMaterial({ color: 0x2e8fb8, transparent: true, opacity: .72, roughness: .1, metalness: .3 }));
  wg.rotation.x = -Math.PI / 2; wg.position.set(0, -4.4, -240);
  b.group.add(wg);

  // ---------- START MEADOW ----------
  b.voltLine(v(0, 4, 8), v(0, 3.4, -30), 7);
  archRock(b, v(0, 3, -44), 7);
  b.enemy('drone', v(8, 8, -60), {});
  b.checkpoint(v(0, 2.4, -70), 0);

  // ---------- RIVER CROSSING (stepping logs, one moving) ----------
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 4 : -4, z = -96 - i * 7;
    b.box(x, -3.6, z, 4.4, 1.2, 3, WOOD, { deco: false });
    b.voltAt(v(x, -2.4, z));
  }
  b.movingPlatform((t, out) => out.set(0, -3.4, -128 - 10 * Math.sin(t * .5)), { x: 5, y: 1, z: 3 }, WOOD);
  b.gem(v(13, -2.6, -118)); // under natural bridge
  archRock(b, v(0, 0, -120), 9);

  // ---------- CANYON HALF-PIPE SPRINT ----------
  b.halfPipe(v(0, -2.2, -170), Math.PI, 110, 10, 150, 0x6f7a62);
  b.dashPanel(v(0, -1.8, -180), 180, 48, 0x7ef29a, 7, 6);
  b.voltLine(v(0, -1.2, -176), v(0, -1.2, -270), 12);
  b.enemy('walker', v(-6, -1, -220), { b: v(6, -1, -250), speed: 3 });
  b.rail([v(9, 4, -168), v(-6, 5.5, -210), v(8, 6.5, -252), v(-4, 7.5, -282)], VINE); // upper vine rail (wallrun/hop to reach)
  b.voltLine(v(9, 4.8, -172), v(-4, 7, -280), 8);

  // updraft geyser onto floating island gem route
  b.updraft(v(22, -6, -300), v(30, 18, -308), 42);
  b.box(26, 15.4, -304, 8, 1.4, 8, 0x568247, { deco: false }); // floating island top
  b.gem(v(26, 17, -304));
  b.voltRing(v(26, 4, -304), 2.4, 6, 'y');

  // ---------- ANCIENT RUINS (platforming + enemies) ----------
  const steps = [
    [-8, 0.5, -320], [0, 1.6, -338], [8, 2.8, -356], [0, 4, -374],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [x, y, z] = steps[i];
    b.box(x, y - 2, z, 13, 4, 12, STONE);
    // pillar decor
    b.box(x - 5, y + .8, z - 5, 1.2, 5.6, 1.2, STONE, { deco: true });
    b.box(x + 5, y + .8, z - 5, 1.2, 5.6, 1.2, STONE, { deco: true });
    b.voltAt(v(x, y + 1.4, z));
    if (i === 1 || i === 3) b.enemy('walker', v(x, y + .8, z), { speed: 1.8 });
  }
  b.checkpoint(v(0, 5.4, -380), 1);
  b.enemy('drone', v(-10, 9, -360), {});
  b.spring(v(0, 4.8, -374), v(.3, 1, -.2).normalize(), 30, 2.4, 0xff8c3d);

  // ---------- SPIRAL DESCENT around mountain ----------
  const spiral = [];
  for (let i = 0; i <= 26; i++) {
    const a = -Math.PI / 2 + (i / 26) * Math.PI * 2.4;
    const r = 26 + i * .55;
    spiral.push(v(Math.cos(a) * r, 6 - i * .52, -420 + Math.sin(a) * r));
  }
  b.ribbon(spiral, 9, 0x77806a, { bank: () => THREE.MathUtils.degToRad(-30), lip: .45 });
  b.voltLine(spiral[3].clone().add(v(0, 1, 0)), spiral[22].clone().add(v(0, 1, 0)), 10);
  b.enemy('drone', v(0, 14, -420), {});

  // ---------- WATERFALL GOAL ----------
  b.box(0, -9.5, -500, 26, 2, 24, STONE);
  // waterfall cliff behind goal
  b.box(0, 4, -520, 40, 34, 8, 0x6f7a62, { deco: true });
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(14, 26),
    new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: .55, emissive: 0x9fd8ff, emissiveIntensity: .4 }));
  wf.position.set(0, 8, -515.8);
  b.group.add(wf);
  b.gem(v(0, -8.4, -517)); // behind waterfall
  b.goal(v(0, -6.6, -504));
  b.voltRing(v(0, -6.6, -498), 5, 8, 'y');
}

function v(x, y, z) { return new THREE.Vector3(x, y, z); }
function archRock(b, pos, s) {
  // decorative stone arch (also solid)
  b.box(pos.x, pos.y + s * .9, pos.z, s * 2.4, s * .5, s * .5, ROCK, { deco: true });
  b.box(pos.x - s, pos.y + s * .45, pos.z, s * .5, s, s * .5, ROCK, { deco: true });
  b.box(pos.x + s, pos.y + s * .45, pos.z, s * .5, s, s * .5, ROCK, { deco: true });
}
