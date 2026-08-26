// levels/skyforge.js — L3 "SKYFORGE ISLES": floating temple islands over the
// void. Rails between islands, launch-blossom springs, drifting stones, wind
// gust corridors, and a giant spiral rail descent to the goal portal.
import * as THREE from 'three';

export const SKYFORGE = {
  id: 'skyforge',
  name: 'SKYFORGE ISLES',
  themeKey: 'skyforge',
  par: 115,
  music: { bpm: 132, key: 50, bright: true },   // D minor epic
  spawn: new THREE.Vector3(0, 21.5, -8),
  spawnYaw: 0,
  killY: -55,
  gusts: [
    { min: [40, 8, 95], max: [75, 40, 125], f: [0, 0, 14] },
    { min: [85, 10, 150], max: [115, 40, 175], f: [-16, 0, 0] }
  ],
  build(L) {
    const M = L.mats;

    const island = (x, y, z, r, mat) => {
      L.cyl(x, y, z, r * 0.72, r, r * 0.55, 9, mat || M.ground);
      L.cyl(x, y - r * 0.55, z, r * 0.4, r * 0.72, r * 0.5, 8, M.rock, { collide: false });
      const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, r * 0.9, 7), M.rock, {});
      tip.rotation.x = Math.PI; tip.position.set(x, y - r * 1.05, z);
      L.group.add(tip);
    };

    // ---------- islands ----------
    island(0, 20, 0, 20);            // A spawn
    island(34, 13.4, 64, 15);        // B
    island(66, 21, 92, 8);           // C mid-air stepping stone
    island(96, 29, 112, 9);          // D high bonus isle
    island(118, 15.4, 146, 18);      // E road hub
    island(150, 8, 182, 22);         // F spire/goal island
    island(178, 4.6, 208, 10);       // G goal portal isle

    // spire on F
    L.cyl(150, 22, 182, 3, 5, 30, 8, M.rock);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(4),
      new THREE.MeshStandardMaterial({ color: 0xb89aec, emissive: 0x8f6fe0, emissiveIntensity: 1.6, roughness: .2 }));
    crystal.position.set(150, 40, 182); L.group.add(crystal);

    // temple decor on A
    L.box(0, 22.4, 2, 10, 2, 8, M.rock);
    for (const dx of [-4, 4]) L.cyl(dx, 24.4, 4, 0.6, 0.7, 6, 6, M.wood);
    L.box(0, 28, 4, 11, 1.2, 9, M.roof || M.wood);

    // ---------- ROUTE ----------
    L.sparkLine([0, 22.6, 8], [0, 22.6, 16], 4);
    // 1) rail A->B
    L.rail([[6, 21.4, 14], [16, 18.4, 34], [25, 15.6, 50], [32, 14.6, 60]], M.accent);
    L.sparkArc([[8, 23, 16], [20, 19.4, 40], [30, 16, 57]], 10);

    // 2) island B: enemies + blossom chain upward
    L.enemy('scrapper', 34, 14.4, 64, { range: 5 });
    L.enemy('zinger', 40, 19, 70, { radius: 6 });
    L.checkpoint(36, 14.6, 68, 40);
    L.spring(30, 14, 58, -40, 62, 26);         // blossom to C
    L.sparkArc([[32, 17, 62], [48, 20, 76], [62, 21.6, 88]], 8);

    // C stepping stone w/ bolt detour
    L.bolt(66, 24, 92, 0);
    L.spring(68, 21.6, 94, 55, 66, 27);        // C -> D high bonus
    L.sparkRing(96, 31.5, 112, 5.5, 8);
    L.bolt(96, 31.6, 112, 1);                   // bonus bolt on D
    L.spring(99, 29.6, 115, 35, 58, 30);       // D -> long glide toward E

    // main lower route from B: road bridge to E
    L.road([[42, 13.8, 72], [70, 14.4, 104], [98, 15, 128], [114, 15.4, 142]], 9, M.road);
    L.sparkArc([[48, 15, 78], [80, 15.6, 110], [110, 15.8, 138]], 12);

    // gust corridor crossing (E->F bridge exposed to wind)
    L.checkpoint(118, 16.6, 148, 30);
    L.enemy('turret', 122, 16.2, 152, {});
    L.enemy('scrapper', 132, 16.2, 158, { range: 6 });

    // 3) THE SPIRAL: giant rail descending around spire F
    const spiralPts = [];
    for (let i = 0; i <= 12; i++) {
      const a = THREE.MathUtils.degToRad(-90 + i * 55);
      const r = 26 - i * 0.9;
      const y = 26 - i * 1.55;
      spiralPts.push([150 + Math.cos(a) * r, Math.max(y, 9.4), 182 + Math.sin(a) * r]);
    }
    L.rail(spiralPts, M.accent);
    L.sparkArc(spiralPts.filter((_, i) => i % 2 === 0).map(p => [p[0], p[1] + 1.4, p[2]]), 12);
    L.bolt(150 + Math.cos(THREE.MathUtils.degToRad(120)) * 24, 15, 182 + Math.sin(THREE.MathUtils.degToRad(120)) * 24, 2);

    // bridge E -> F entry (choose rail or road)
    L.road([[126, 15.6, 156], [136, 14, 168], [143, 12, 174]], 8, M.road);

    // 4) final stretch across F to portal G
    L.road([[152, 9, 188], [164, 7.4, 198], [174, 6, 204]], 8, M.road);
    L.panel(154, 9.1, 190, 40, 66);
    L.enemy('zinger', 162, 14, 200, { radius: 7 });
    L.goal(181, 5.6, 211, 225);
  },
  waypoints: [
    [0, 22.4, 6], [4, 22.4, 13], [8, 22, 16], [18, 19.4, 36], [27, 16, 52],
    [33, 15.4, 62], [37, 15, 69], [32, 15, 59], [44, 15.2, 76], [66, 15.6, 100],
    [92, 16.2, 124], [112, 16.6, 142], [120, 17, 150], [128, 16.6, 156],
    [137, 15, 168], [144, 13, 175], [149, 11, 180], [151, 10, 186],
    [158, 8.6, 194], [170, 6.8, 203], [179, 6, 209]
  ]
};
