// levels/coast.js — L1 "SUNSPIRE COAST": sunny beach cliffs, coastal loop,
// arch rail, tide-pool hops, bandit-bot plaza, mega downhill finish.
import * as THREE from 'three';

export const COAST = {
  id: 'coast',
  name: 'SUNSPIRE COAST',
  themeKey: 'coast',
  par: 85,
  music: { bpm: 126, key: 57, bright: true },   // A minor-ish, bright arp
  spawn: new THREE.Vector3(0, 4, -6),
  spawnYaw: 0,
  killY: -30,
  gusts: [],
  build(L) {
    const M = L.mats;

    // ---------- terrain: beach + cliffs (visual mass + collision) ----------
    // main beach slab
    L.box(0, 0, 30, 70, 4, 130, M.ground);
    L.box(-40, -1, 60, 60, 6, 120, M.ground);
    // sea
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2ba7c9, roughness: .15, metalness: .3, transparent: true, opacity: .92 }));
    water.rotation.x = -Math.PI / 2; water.position.set(-120, 1.2, 60);
    L.group.add(water);
    // cliffs flanking east route
    L.box(120, 6, 120, 90, 16, 90, M.cliff);
    L.box(230, 8, 20, 70, 20, 70, M.cliff);
    L.box(255, 9, -40, 80, 22, 80, M.cliff);

    // palm trees + rocks decor
    const cone = new THREE.ConeGeometry(2.2, 3.2, 7);
    const trunkG = new THREE.CylinderGeometry(.3, .45, 5, 6);
    const rockG = new THREE.DodecahedronGeometry(1);
    const rng = mulberry(7);
    for (let i = 0; i < 34; i++) {
      const x = -60 + rng() * 100, z = -20 + rng() * 110;
      if (Math.abs(x) < 16 && z > -10 && z < 60) continue;
      if (rng() < .6) {
        const t = new THREE.Mesh(trunkG, M.trunk); t.position.set(x, 6, z); t.rotation.z = (rng() - .5) * .3;
        const c1 = new THREE.Mesh(cone, M.leaf); c1.position.set(x + (rng() - .5), 8.6, z + (rng() - .5));
        const c2 = new THREE.Mesh(cone, M.leaf); c2.position.set(x + (rng() - .5) * 2, 8.2, z + (rng() - .5) * 2);
        L.group.add(t, c1, c2);
      } else {
        const r = new THREE.Mesh(rockG, M.rock);
        r.position.set(x, 4.4, z); r.scale.setScalar(.7 + rng() * 1.8);
        r.castShadow = true; L.group.add(r);
      }
    }

    // ---------- ROUTE ----------
    // 1+2+3) ONE continuous spline: beach straight -> flowing S curves -> cliff
    //        climb -> loop approach (merged so junctions are smooth, not seams)
    L.road([[0, 2.2, -8], [0, 2.2, 30], [2, 2.4, 58], [14, 3.4, 84], [-6, 5, 112], [10, 6.5, 138], [34, 9.5, 152], [56, 12.5, 150], [68, 13.5, 150]], 10, M.road);
    L.sparkLine([0, 3.4, -4], [0, 3.4, 50], 8);
    L.sparkArc([[6, 3.8, 74], [4, 5.2, 104], [9, 6.6, 132]], 10);
    L.panel(9.4, 6.4, 133, 20, 66);
    L.sparkLine([40, 10.8, 151], [64, 13.6, 150], 6);

    // THE LOOP (spectacle #1)
    L.loop(82, 23.5, 150, Math.PI / 2, 9.5, 8, M.road);
    L.sparkRing(82, 23.5, 150, 7.6, 14, 'x');
    L.road([[96, 13.9, 150], [116, 14.5, 144]], 10, M.road);

    // CP1 after loop
    L.checkpoint(106, 14.4, 147, 90);

    // 4) coastal arch rail (long grind)
    L.rail([[118, 16.5, 142], [130, 12.5, 129], [141, 9.5, 113], [151, 6.8, 97], [159, 5.2, 85]], M.metal);
    L.sparkArc([[121, 17.8, 139], [136, 11, 117], [153, 7.2, 94], [160, 6, 83]], 16);

    // secret bolt under the arch (dive/rail-jump reward)
    L.bolt(136, 5.6, 116, 0);

    // landing
    L.road([[161, 4.6, 79], [168, 4.8, 70]], 9, M.road);
    L.checkpoint(165, 4.7, 74, 40);

    // 5) tide-pool platforming
    L.box(176, 4.4, 62, 7, 1.2, 7, M.rock);
    L.mover(188, 5.4, 54, 199, 6.4, 48, 4.6, 6, 1.2, 6);
    L.box(209, 7.2, 43, 7, 1.2, 7, M.rock);
    L.sparkLine([177, 6, 62], [208, 8.6, 44], 6);
    // offshore bolt island (long jump reward)
    L.cyl(192, 1.4, 22, 6, 7, 3, 8, M.rock);
    L.bolt(192, 3.6, 22, 1);
    L.spring(213, 7.6, 41, 35, 55, 27);   // launches NE up to plaza

    // 6) plaza (bandit camp)
    L.box(240, 15.4, 26, 46, 2.4, 40, M.ground);
    // ramp onto plaza as alternate to spring
    L.wedge(218.5, 14.2, 33, 10, 14, 2.6, M.rock, { ry: THREE.MathUtils.degToRad(-35) });
    L.enemy('scrapper', 232, 16, 30, { range: 6 });
    L.enemy('scrapper', 248, 16, 20, { range: 7, axis: 'z' });
    L.enemy('turret', 252, 16.6, 36, {});
    L.enemy('zinger', 240, 21, 14, { radius: 8 });
    L.sparkRing(240, 18, 26, 6, 10);
    // secret cave alcove in north cliff wall
    L.box(240, 17.5, 6.5, 8, 5, 6, M.cliff, { collide: false });   // visual lintel
    L.bolt(240, 17.2, 9, 2);
    L.sparkLine([236, 17.4, 10], [244, 17.4, 10], 3);

    // CP2 on plaza
    L.checkpoint(226, 16.8, 34, -60);

    // 7) mega downhill to finish
    L.road([[252, 16.6, 8], [258, 11, -34], [256, 6, -72], [252, 3.6, -98]], 12, M.road);
    L.panel(254, 16.5, 2, 175, 72);
    L.panel(257.4, 10.8, -36, 175, 72);
    L.sparkLine([256, 12, -20], [253, 5, -88], 12);
    L.goal(252, 4.2, -102, 180);
  },
  waypoints: [
    [0, 3.4, 10], [0, 3.4, 40], [8, 3.6, 70], [4, 5.2, 100], [10, 6.8, 130],
    [30, 9.8, 150], [56, 13, 150], [70, 14.2, 150], [82, 14.6, 149], [94, 14.2, 150],
    [108, 14.6, 146], [119, 16.8, 140], [132, 12, 126], [143, 9, 111], [153, 6.6, 95],
    [161, 5, 81], [166, 5, 73], [176, 5.6, 62], [192, 6.8, 51], [209, 8.4, 44],
    [216, 9, 42], [224, 16.6, 36], [238, 16.8, 28], [250, 16.6, 14],
    [256, 14, -8], [257, 8.6, -48], [253, 4.6, -92], [252, 5, -101]
  ]
};

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
