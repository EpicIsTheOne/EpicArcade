// ZONE 3 — FOUNDRY CORE. Molten industrial complex: conveyor dash chains, piston
// timing floors, magnet rails over lava, vertical spring shaft, core chamber finale.
import * as THREE from 'three';

const METAL = 0x3a4152, DARKMETAL = 0x262c3a, RUST = 0x5c3a28, LAVA = 0xff7a1a;
const HOT = 0xffb35c, MAG = 0xff9a3d;

export function foundryCore(b) {
  b.name = 'FOUNDRY CORE';
  b.parTime = 115;
  b.killZ = -24;
  b.spawnPoint.set(0, 1.2, -4);

  // ---------- ENTRY CONVEYOR ----------
  b.box(0, -1.2, -30, 18, 2.4, 60, METAL);
  lavaStrip(b, -11.5, -6, -55, .8, 50); // glow channels beside
  lavaStrip(b, 11.5, -6, -55, .8, 50);
  b.dashPanel(v(0, 0, -14), 180, 40, LAVA, 7, 6);
  b.dashPanel(v(0, 0, -34), 180, 44, LAVA, 7, 6);
  b.voltLine(v(0, 1, -10), v(0, 1, -56), 8);
  b.checkpoint(v(0, 0, -52), 0);
  b.enemy('drone', v(6, 4, -40), {});

  // ---------- PISTON TIMING FLOOR ----------
  b.box(0, -1.2, -92, 20, 2.4, 46, DARKMETAL);
  for (let i = 0; i < 4; i++) {
    const z = -74 - i * 11;
    const phase = i * Math.PI / 2;
    b.movingPlatform((t, out) => out.set(0, 1.2 + Math.max(0, Math.sin(t + phase)) * 3.2, z),
      { x: 16, y: 1.2, z: 5 }, i % 2 ? RUST : METAL);
    b.voltAt(v(-7, 2.6, z)); b.voltAt(v(7, 2.6, z));
  }
  b.enemy('walker', v(0, 1, -100), { b: v(0, 1, -86), speed: 2 });

  // ---------- MAGNET RAILS OVER LAVA ----------
  b.box(0, -1.2, -128, 14, 2.4, 18, METAL); // launch deck (top y=0)
  b.spring(v(0, 0, -134), v(0, 1, -.55).normalize(), 26, 2.6, MAG); // fling onto rail
  const rail1 = [v(0, 4.5, -138), v(0, 3, -170), v(3, 1.5, -205), v(0, 0, -236)];
  b.rail(rail1, MAG);
  for (const t of [.25, .5, .75]) b.voltAt(sampleRail(rail1, t).add(v(0, 1, 0)));
  // lava lake below
  b.box(0, -12, -190, 60, 2, 120, 0x140b06, { deco: true });
  lavaStrip(b, 0, -10.8, -190, 40, 90);

  // gem tucked under rail mid-point deck
  b.box(10, -2.6, -200, 6, 1.2, 6, DARKMETAL);
  b.gem(v(10, -1.4, -200));

  // ---------- VERTICAL SHAFT CLIMB ----------
  b.box(0, -1.2, -250, 22, 2.4, 22, METAL);
  b.checkpoint(v(0, 0, -252), 1);
  shaftWalls(b, 0, -258, 42);
  const pads = [[-7, 4], [7, 10], [-7, 16], [7, 22], [0, 28]];
  for (const [x, y] of pads) {
    b.box(x, y - .5, -258, 6, 1, 6, RUST);
    if (y < 28) b.spring(v(x, y, -258), v(0, 1, 0), y < 16 ? 21 : 24, 2, MAG);
    b.voltAt(v(x, y + 1.4, -258));
  }
  b.enemy('drone', v(0, 18, -258), {});
  b.updraft(v(-10, 0, -262), v(-4, 30, -254), 36); // alt geyser route

  // ---------- UPPER FOUNDRY WALKWAYS ----------
  b.box(0, 27.4, -290, 16, 1.6, 40, METAL);           // top y=28.2
  b.checkpoint(v(0, 28.2, -276), 2);
  b.enemy('walker', v(0, 29, -292), { b: v(5, 29, -304) });
  b.enemy('spike', v(0, 31, -300), { len: 4.2, axis: 'z', speed: 1.8 });
  b.enemy('spike', v(0, 31, -320), { len: 4.2, axis: 'x', speed: -1.6 });
  b.box(0, 27.4, -330, 16, 1.6, 30, DARKMETAL);
  b.dashPanel(v(0, 28.2, -338), 180, 46, LAVA, 6, 5);
  b.voltLine(v(0, 29, -280), v(0, 29, -340), 8);
  b.gem(v(-6.5, 29.6, -322)); // under walkway lip

  // ---------- SPIRAL MAGNET RAIL DESCENT INTO CORE ----------
  b.ramp(0, -372, -352, 24, 28.2, 14, METAL);         // drop ramp to lower ring
  const spiral = [];
  for (let i = 0; i <= 30; i++) {
    const a = Math.PI / 2 + (i / 30) * Math.PI * 2.6;
    const r = 17 - i * .18;
    spiral.push(v(Math.cos(a) * r, 24 - i * .78, -430 + Math.sin(a) * r));
  }
  b.rail(spiral, MAG);
  for (let i = 2; i < spiral.length; i += 4) b.voltAt(spiral[i].clone().add(v(0, 1.2, 0)));

  // ---------- CORE CHAMBER ----------
  b.box(0, -2, -430, 64, 2.4, 64, DARKMETAL);          // chamber floor top ~-0.8
  ringWall(b, v(0, -1, -430), 30);
  const core = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0x2a1608, emissive: LAVA, emissiveIntensity: 2.2, roughness: .3 }));
  core.position.set(0, 5.2, -430);
  b.group.add(core);
  const coreLight = new THREE.PointLight(LAVA, 220, 90); coreLight.position.copy(core.position);
  b.group.add(coreLight);
  b.goal(v(0, 2.4, -414));   // jump through the goal ring in front of the core
  b.voltRing(v(0, 2.4, -420), 6, 10, 'y');
  b.gem(v(0, 10.4, -447));   // atop the core itself
}

function v(x, y, z) { return new THREE.Vector3(x, y, z); }
function sampleRail(pts, t) {
  let total = 0; const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push(l); total += l; }
  let d = t * total;
  for (let i = 1; i < pts.length; i++) {
    if (d <= segs[i - 1]) return pts[i - 1].clone().lerp(pts[i], d / segs[i - 1]);
    d -= segs[i - 1];
  }
  return pts[pts.length - 1].clone();
}
function lavaStrip(b, x, y, z, w, len) {
  b.box(x, y, z, w, .3, len, LAVA, { bucket: 'glow', noShadow: true });
}
function shaftWalls(b, x, zBase, h) {
  for (const dx of [-13, 13]) {
    b.box(x + dx, h / 2 - 1.2, zBase, 1.4, h, 24, DARKMETAL, { deco: false });
  }
}
function ringWall(b, c, r) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = c.x + Math.cos(a) * r, pz = c.z + Math.sin(a) * r;
    b.box(px, 5, pz, 4, 14, 4, i % 2 ? METAL : DARKMETAL, { deco: true });
    b.box(px, 11.4, pz, 4.4, .6, 4.4, i % 3 ? LAVA : HOT, { bucket: 'glow', noShadow: true });
  }
}
