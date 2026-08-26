// levels/foundry.js — L2 "NEON FOUNDRY": neon night city + factory.
// Rooftop dash-chain -> wall-run canyon (with safe low route) -> crane rail
// network -> factory floor hazards -> banked corkscrew -> spring shaft ->
// sky-bridge finale.
import * as THREE from 'three';

export const FOUNDRY = {
  id: 'foundry',
  name: 'NEON FOUNDRY',
  themeKey: 'foundry',
  par: 105,
  music: { bpm: 138, key: 52, bright: false },  // E minor, darker
  spawn: new THREE.Vector3(0, 42.5, -6),
  spawnYaw: 0,
  killY: -20,
  gusts: [],
  build(L) {
    const M = L.mats;

    // ---------- skyline decor ----------
    const winMat = new THREE.MeshStandardMaterial({ color: 0x10182e, emissive: 0x2a3f77, emissiveIntensity: .8, roughness: .3 });
    const rng = mulberry(21);
    for (let i = 0; i < 46; i++) {
      const x = -160 + rng() * 340, z = -60 + rng() * 420;
      if (Math.abs(x) < 70 && z > -40 && z < 130) continue;
      const h = 14 + rng() * 44, w = 10 + rng() * 18;
      L.box(x, h / 2 - 12, z, w, h, w, rng() < .5 ? M.ground : winMat, { collide: false });
      // neon edge
      if (rng() < .5) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * .9, .5, .5),
          rng() < .5 ? M.accent : M.accent2);
        strip.position.set(x, h - 12 - 1.5, z + w / 2);
        L.group.add(strip);
      }
    }
    // street floor far below (visual)
    L.box(0, -12, 180, 400, 1, 500, M.cliff, { collide: false });

    // ---------- ROUTE ----------
    // 1) rooftop straight + panel gap jump
    L.box(0, 39.4, 25, 26, 2, 80, M.road);                    // start roof y=40.4 top
    L.panel(0, 40.5, 30, 0, 74);
    L.sparkLine([0, 41.6, -2], [0, 41.6, 56], 9);
    L.box(0, 37.4, 96, 24, 2, 36, M.road);                    // landing roof (gap z 65..78)

    // 2) wall-run canyon (z 114..168): towers both sides; catwalk below
    L.box(-13, 38, 141, 16, 22, 54, M.glass);                 // left tower face x=-5
    L.box(13, 38, 141, 16, 22, 54, M.glass);                  // right tower face x=+5
    L.box(0, 32.4, 141, 7, 1.6, 50, M.metal);                 // low catwalk alt-route
    L.enemy('turret', 0, 33.2, 152, {});
    L.sparkLine([-4.4, 41.5, 120], [-4.4, 41.5, 162], 8);     // guide sparks on left wall
    L.bolt(-13, 45.5, 141, 0);                                 // bolt atop left tower

    // CP1 before rails
    L.checkpoint(0, 38.6, 172, 15);

    // 3) crane rail network descending into street canyon
    L.rail([[-2, 40.4, 178], [4, 34, 194], [10, 29, 210], [14, 26, 226]], M.accent);
    // transfer hop to rail 2 (magnet assist makes it flow)
    L.rail([[17, 27.5, 234], [24, 24.5, 252], [31, 22, 270]], M.accent);
    L.sparkArc([[0, 42, 180], [11, 30, 212], [16, 28, 232]], 10);
    L.sparkArc([[18, 29, 236], [26, 25.6, 254], [31, 23, 268]], 10);
    // crane tower bolt (rail-jump at apex of gap)
    L.bolt(15.5, 30.5, 230, 1);

    // 4) factory floor (z 280..350)
    L.box(20, 17.4, 315, 70, 2, 76, M.ground);
    L.checkpoint(22, 18.6, 282, 10);
    // hazard conveyor crossing: spikes pits + moving platforms
    L.spikesBox(6, 17.8, 306, 14, 1.2, 10);
    L.spikesBox(34, 17.8, 306, 14, 1.2, 10);
    L.mover(20, 19, 300, 20, 19, 312, 3.6, 6, 1, 6);
    L.enemy('scrapper', 40, 19, 330, { range: 8 });
    L.enemy('scrapper', 8, 19, 338, { range: 6, axis: 'z' });
    L.enemy('zinger', 22, 24, 320, { radius: 9 });
    L.sparkRing(22, 20.4, 322, 7, 10);
    // vent alcove bolt
    L.bolt(48, 19.4, 344, 2);
    L.sparkLine([44, 19.2, 340], [47, 19.2, 344], 3);

    // panels chain out of factory
    L.panel(24, 18.5, 346, 195, 72);

    // 5) banked corksweep U-turn over the void street
    L.road([[20, 18.4, 356], [-4, 20.4, 380], [-26, 21.4, 366], [-30, 19.4, 336], [-26, 18, 310]], 11, M.metal);
    L.sparkArc([[16, 20, 360], [-8, 22.4, 378], [-27, 21, 352], [-27, 19, 318]], 16);
    L.enemy('zinger', -6, 27, 370, { radius: 10 });

    // 6) spring shaft climb
    L.spring(-26, 17.6, 300, 0, 88, 34);       // up to ledge
    L.box(-26, 30.4, 292, 10, 1.6, 10, M.metal);
    L.spring(-26, 31.2, 290, 0, 84, 34);       // up to sky-bridge level
    L.checkpoint(-26, 31.6, 288, 0);

    // 7) sky-bridge finale with zinger harassment
    L.road([[-26, 32.4, 280], [-8, 34, 220], [18, 35.4, 160], [44, 37, 100], [58, 38, 58]], 10, M.road);
    L.panel(-24, 32.5, 272, 15, 70);
    L.sparkArc([[-20, 34, 260], [10, 36, 190], [40, 38, 116]], 14);
    L.enemy('zinger', -4, 40, 240, { radius: 9 });
    L.enemy('zinger', 30, 43, 130, { radius: 10 });
    L.goal(62, 38.6, 48, 205);
  },
  waypoints: [
    [0, 41.6, 10], [0, 41.6, 45], [0, 41.6, 60], [0, 38.6, 90], [0, 38.6, 108],
    [-4.2, 41.5, 124], [-4.2, 41.5, 150], [-2, 41.5, 166], [0, 39.6, 176],
    [4, 36, 196], [11, 30.5, 214], [15, 28, 230], [19, 28.6, 238],
    [25, 25.5, 256], [31, 23, 270], [26, 20, 282], [22, 19.6, 296],
    [22, 19.6, 316], [24, 19.6, 336], [24, 19.6, 350], [12, 20, 362],
    [-8, 22, 376], [-24, 22, 362], [-29, 20, 336], [-26, 18.6, 304],
    [-26, 31.4, 291], [-26, 32.6, 276], [-14, 34, 240], [6, 36, 190],
    [30, 37.6, 140], [52, 38.6, 80], [61, 39.4, 52]
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
