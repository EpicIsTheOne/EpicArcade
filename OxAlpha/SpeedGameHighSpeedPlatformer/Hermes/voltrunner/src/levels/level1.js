// ZONE 1 — NEON SKYLINE. Midnight megacity: expressway, mega-loop, skyline rails,
// rooftop platforming, wallrun alley, upper banked highway, finale halfpipe drop.
import * as THREE from 'three';

const NEON = 0x29f5ff, PINK = 0xff3d81, GOLD = 0xffd23d, PURP = 0x8a4dff;
const ROAD = 0x232c44, ROADSIDE = 0x39466b, BUILD = [0x141a30, 0x1a2140, 0x10152a, 0x1e2547];

export function neonSkyline(b) {
  b.name = 'NEON SKYLINE';
  b.parTime = 95;
  b.killZ = -46;
  b.spawnPoint.set(0, 1.2, -4);

  // ---------- START PLAZA (rooftop) ----------
  b.box(0, -1.5, -12, 34, 3, 30, 0x1c2440);
  b.box(0, -0.4, -22, 34, .8, 2, 0x2ee8ff, { bucket: 'glow', deco: true }); // edge trim
  b.rail([new THREE.Vector3(-14, .6, -6), new THREE.Vector3(-14, .6, -20)], NEON);
  b.voltLine(new THREE.Vector3(0, .9, -6), new THREE.Vector3(0, .9, -20), 5);
  b.checkpoint(new THREE.Vector3(0, 0, -18), 0);

  // billboard decor + gem behind it
  b.box(15, 4, -16, .6, 10, 14, 0x11162b, { deco: true });
  b.box(15.5, 8, -16, .2, 5, 10, PINK, { bucket: 'glow', noShadow: true });
  b.gem(new THREE.Vector3(15, 1.6, -21));

  // ---------- EXPRESSWAY DOWNHILL (build speed) ----------
  b.ramp(0, -78, -27, -13, 0, 15, ROAD);           // downhill toward -Z
  b.ribbon([v(0, -13, -78), v(0, -13, -108), v(0, -13, -140)], 15, ROAD, { lip: .55 });
  b.dashPanel(v(0, -13, -88), 180, 46, GOLD, 7, 6);
  b.voltLine(v(0, -12.4, -80), v(0, -12.4, -136), 10);
  sideLights(b, 0, -13, -78, -140, 8.2);

  // ---------- MEGA LOOP ----------
  b.loop(v(0, -13, -152), Math.PI, 9, 8, 0x1d2c54, { glow: true, glowColor: NEON });
  b.ribbon([v(0, -13, -140), v(0, -13, -150)], 15, ROAD); // lead-in under loop
  b.ribbon([v(0, -13, -154), v(0, -13, -168)], 15, ROAD); // exit
  b.voltRing(v(0, -13, -152), 6.2, 10, 'z'); // ring of volts through the loop plane? lateral ring
  b.dashPanel(v(0, -13, -146), 180, 48, NEON, 6, 5);

  // ---------- SKYLINE RAIL ----------
  b.ribbon([v(0, -13, -168), v(0, -13.2, -172)], 15, ROAD); // runway to gap
  const rail1 = [v(0, -13.4, -173), v(1.5, -15, -200), v(-1, -17.4, -232), v(0, -18, -240)];
  b.rail(rail1, NEON);
  b.voltAt(v(0, -12.9, -172));
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    b.voltAt(sampleRail(rail1, t).add(v(0, 1, 0)));
  }
  // gem detour beside rail
  b.box(8, -15.8, -202, 4, 1, 4, ROADSIDE);
  b.gem(v(8, -14.6, -202));

  // ---------- LOWER PLAZA & ROOFTOP HOPPING ----------
  b.box(0, -19.4, -262, 30, 2.8, 46, 0x18203c);       // landing plaza top y=-18
  b.checkpoint(v(0, -18, -250), 1);
  b.enemy('walker', v(-6, -17.2, -258), { b: v(8, -17.2, -270) });
  b.enemy('drone', v(4, -14.5, -280), {});
  b.voltLine(v(-8, -17.2, -256), v(-8, -17.2, -282), 5);

  // stepping rooftops
  const tops = [
    [-11, -19.6, -300, 12, 1.6, 12],
    [6, -21.2, -326, 11, 1.6, 13],
    [-4, -20.2, -356, 15, 1.6, 15],
    [10, -21.6, -384, 11, 1.6, 12],
  ];
  for (const [x, y, z, w, h, d] of tops) b.box(x, y, z, w, h, d, 0x1c2646);
  b.voltLine(v(-11, -18.6, -294), v(-11, -18.6, -306), 3);
  b.voltLine(v(6, -20.2, -320), v(6, -20.2, -332), 3);
  b.voltLine(v(-4, -19.2, -350), v(-4, -19.2, -362), 3);
  b.enemy('walker', v(-4, -19.2, -356), { b: v(3, -19.2, -356), speed: 2 });
  b.enemy('drone', v(8, -17, -340), {});

  // final rooftop merges into goal street level
  b.box(0, -21.4, -410, 22, 1.6, 40, 0x1c2646);
  b.voltLine(v(10, -20.6, -380), v(4, -20.6, -400), 4);

  // spring tower shortcut to UPPER HIGHWAY (alt route)
  b.box(24, -19.6, -330, 10, 1.6, 10, ROADSIDE);
  b.spring(v(24, -18.8, -330), v(0, 1, 0), 36, 2.4, PINK);
  b.voltLine(v(24, -16, -330), v(24, -6, -330), 5);

  // gem on hidden tower top — reached via big spring on rooftop 3
  b.box(-4, -20.4, -356, 4, .8, 4, ROADSIDE); // pad
  b.spring(v(-4, -19.6, -356), v(0, 1, 0), 47, 2, GOLD);
  b.box(-4, 8, -376, 7, 32, 7, 0x151b33, { deco: false }); // tower shaft below gem platform
  b.box(-4, 24.6, -376, 9, 1.2, 9, 0x222b4d);
  b.gem(v(-4, 26.6, -376));

  // ---------- UPPER BANKED HIGHWAY ----------
  const hw = [
    v(24, -1.5, -334), v(20, -.5, -356), v(8, 1, -376), v(-8, 2.5, -394),
    v(-18, 3.5, -416), v(-14, 4.5, -438), v(0, 5, -452),
  ];
  b.ribbon(hw, 11, ROAD, {
    bank: (i, u) => {
      if (i < 2 || i > hw.length - 3) return 0;
      return THREE.MathUtils.degToRad(34);
    }, lip: .5,
  });
  b.dashPanel(hw[1].clone().setY(hw[1].y + .1), 210, 42, PINK, 6, 5);
  b.checkpoint(v(24, -1, -336), 2);
  b.enemy('drone', v(0, 6, -400), {});
  b.voltLine(hw[3].clone().add(v(0, 1, 0)), hw[5].clone().add(v(0, 1, 0)), 6);
  b.enemy('walker', v(-14, 4.6, -420), { speed: 1.6 });

  // launch ramp off highway end -> big air into finale halfpipe
  b.ramp(0, -462, -452, 6.5, 5, 11, ROADSIDE); // slight up-kick at end (rises toward -Z)
  b.halfPipe(v(0, -14, -470), Math.PI, 70, 10, 165, 0x1a2340);
  b.dashPanel(v(0, -13.6, -480), 180, 50, GOLD, 7, 6);
  b.voltLine(v(0, -13.4, -472), v(0, -13.4, -520), 9);

  // ---------- GOAL PLAZA ----------
  b.box(0, -14.6, -540, 30, 1.6, 26, 0x1c2440);
  b.goal(v(0, -11.4, -546));
  b.voltRing(v(0, -11.4, -540), 5, 8, 'y');

  // ---------- DECOR: buildings & lights ----------
  cityDecor(b);
}

function v(x, y, z) { return new THREE.Vector3(x, y, z); }
function sampleRail(pts, t) {
  // approximate point along polyline by normalized param
  let total = 0; const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push(l); total += l; }
  let d = t * total;
  for (let i = 1; i < pts.length; i++) {
    if (d <= segs[i - 1]) return pts[i - 1].clone().lerp(pts[i], d / segs[i - 1]);
    d -= segs[i - 1];
  }
  return pts[pts.length - 1].clone();
}
function sideLights(b, x, y, z0, z1, dx) {
  const n = Math.floor((z0 - z1) / 18);
  for (let i = 0; i < n; i++) {
    const z = z0 - i * 18 - 6;
    b.box(x - dx, y + 1.2, z, .3, 2.6, .3, 0x0e1322, { deco: true });
    b.box(x + dx, y + 1.2, z, .3, 2.6, .3, 0x0e1322, { deco: true });
    b.box(x - dx, y + 2.6, z, .5, .3, .5, NEON, { bucket: 'glow', noShadow: true });
    b.box(x + dx, y + 2.6, z, .5, .3, .5, PINK, { bucket: 'glow', noShadow: true });
  }
}
function cityDecor(b) {
  // scattered towers flanking the route
  const spots = [];
  for (let z = -60; z > -560; z -= 42) {
    spots.push([-34 + Math.sin(z * .05) * 10, z]);
    spots.push([36 + Math.cos(z * .04) * 10, z - 14]);
  }
  let i = 0;
  for (const [x, z] of spots) {
    const h = 18 + ((i * 37) % 46);
    const w = 10 + ((i * 13) % 10);
    const col = BUILD[i % BUILD.length];
    b.box(x, -20 + h / 2 - 4, z, w, h, w * (0.8 + (i % 3) * .3), col, { deco: true });
    // neon window strips
    for (let k = 0; k < 3; k++) {
      const yy = -20 - 4 + h * (0.25 + k * 0.25);
      b.box(x + w / 2 + .06, yy, z, .12, h * .12, w * .5, k % 2 ? NEON : PURP, { bucket: 'glow', noShadow: true });
      b.box(x - w / 2 - .06, yy, z, .12, h * .12, w * .5, k % 2 ? PURP : PINK, { bucket: 'glow', noShadow: true });
    }
    i++;
  }
}
