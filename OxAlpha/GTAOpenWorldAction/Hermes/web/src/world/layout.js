// CHROME HARBOR — Port Vela city plan: roads, districts, blocks, landmarks.
// Pure data generation; meshes are built in build_city.js from this.
import { RNG, clamp } from '../core/util.js';

export const WORLD = {
  halfX: 900,          // hard world bounds
  beachZ: 600,         // coast road centerline
  sandZ0: 608,         // sand starts
  waterZ: 650,         // water plane edge (beyond = ocean)
  northZ: -800,
};

export const DISTRICTS = {
  downtown:    { name: 'SPIRE DISTRICT', tint: '#8ea4c8' },
  midtown:     { name: 'MERIDIAN MIDTOWN', tint: '#a89f8e' },
  oldtown:     { name: 'CANNERY ROW', tint: '#c98d5f' },
  residential: { name: 'ROSEFIELD', tint: '#8fc98d' },
  industrial:  { name: 'IRONWORKS', tint: '#7f8896' },
  marina:      { name: 'PALM SHORES', tint: '#63c6cf' },
  beach:       { name: 'VELA BEACH', tint: '#e8d49a' },
  park:        { name: 'MERIDIAN GREEN', tint: '#69b06a' },
};

export function districtIdOf(x, z) {
  if (z > 505) return 'beach';
  if (x < -420 && z > 110) return 'industrial';
  if (Math.abs(x) < 300 && Math.abs(z) < 345) return 'downtown';
  if (x > 315 && z < -255) return 'oldtown';
  if (x < -315 && z < -175) return 'residential';
  if (x > 310 && z > 195) return 'marina';
  return 'midtown';
}

export function buildCityPlan(seed = 20260825) {
  const rng = new RNG(seed);

  // ---------- road lines ----------
  // vertical (N-S) road centerlines; avenue=true => wide, signalized, higher speed
  const vx = [
    { x: -792, w: 17, ave: true },   // West Ring Blvd
    { x: -664, w: 9.5 },
    { x: -560, w: 14.5, ave: true },
    { x: -452, w: 9.5 },
    { x: -356, w: 10 },
    { x: -248, w: 14.5, ave: true },
    { x: -140, w: 9.5 },
    { x: -36,  w: 14.5, ave: true },
    { x: 68,   w: 10 },
    { x: 172,  w: 14.5, ave: true },
    { x: 272,  w: 9.5 },
    { x: 376,  w: 14.5, ave: true },
    { x: 484,  w: 10 },
    { x: 588,  w: 9.5 },
    { x: 690,  w: 10 },
    { x: 792,  w: 17, ave: true },   // East Ring Blvd
  ];
  const hz = [
    { z: -752, w: 17, ave: true },   // North Ring Blvd
    { z: -656, w: 10 },
    { z: -560, w: 14.5, ave: true },
    { z: -464, w: 9.5 },
    { z: -360, w: 14.5, ave: true },
    { z: -252, w: 10 },
    { z: -156, w: 14.5, ave: true },
    { z: -56,  w: 15.5, ave: true }, // Coronado Ave (main drag)
    { z: 44,   w: 10 },
    { z: 140,  w: 14.5, ave: true },
    { z: 236,  w: 10 },
    { z: 332,  w: 14.5, ave: true },
    { z: 432,  w: 10 },
    { z: 522,  w: 9.5 },
    { z: 600,  w: 16, ave: true },   // Ocean Drive (coast)
  ];

  // trim some interior streets to create T-junctions / superblocks (never rings/avenues/coast)
  for (const r of vx) { r.z0 = WORLD.northZ + 40; r.z1 = WORLD.beachZ; }
  for (const r of hz) { r.x0 = -WORLD.halfX + 40; r.x1 = WORLD.halfX - 40; }
  for (const r of [...vx, ...hz]) {
    if (r.ave) continue;
    if (rng.chance(0.22)) { // shorten one end -> T junction
      if (rng.chance()) r.z0 += rng.range(150, 420);
      else r.z1 -= rng.range(150, 420);
    }
  }
  // guarantee key connectivity: keep -36 and 172 verticals full length
  vx[7].z0 = WORLD.northZ + 40; vx[7].z1 = WORLD.beachZ;
  vx[9].z0 = WORLD.northZ + 40; vx[9].z1 = WORLD.beachZ;
  hz[7].x0 = -WORLD.halfX + 40; hz[7].x1 = WORLD.halfX - 40;   // Coronado
  hz[14].x0 = -WORLD.halfX + 40; hz[14].x1 = WORLD.halfX - 40; // Ocean Drive

  const roadsV = vx.map((r, i) => ({ id: 'v' + i, axis: 'v', c: r.x, w: r.w, ave: !!r.ave, a: r.z0, b: r.z1 }));
  const roadsH = hz.map((r, i) => ({ id: 'h' + i, axis: 'h', c: r.z, w: r.w, ave: !!r.ave, a: r.x0, b: r.x1 }));

  // ---------- nodes (intersections) ----------
  const nodes = [];
  for (const rv of roadsV) for (const rh of roadsH) {
    const x = rv.c, z = rh.c;
    if (x < rv.a - 1 || x > rv.b + 1 || z < rh.a - 1 || z > rh.b + 1) continue;
    // signalized when an avenue is involved (and not two rings)
    const ringish = (rv.w >= 17 && rh.w >= 17);
    const signal = !ringish && (rv.ave || rh.ave);
    nodes.push({ x, z, rv, rh, signal, phase: ((x * 13 + z * 7) % 12 + 12) % 12 });
  }

  // ---------- blocks ----------
  const blocks = [];
  const SIDEWALK = 4.6;
  const vs = [...roadsV].sort((p, q) => p.c - q.c);
  const hs = [...roadsH].sort((p, q) => p.c - q.c);
  for (let i = 0; i < vs.length - 1; i++) for (let j = 0; j < hs.length - 1; j++) {
    const va = vs[i], vb = vs[i + 1], ha = hs[j], hb = hs[j + 1];
    // block exists if bounding roads reach this cell
    const x0 = va.c + va.w / 2, x1 = vb.c - vb.w / 2;
    const z0 = ha.c + ha.w / 2, z1 = hb.c - hb.w / 2;
    if (x1 - x0 < 34 || z1 - z0 < 34) continue;
    // require the four bordering roads to actually cover the shared span
    const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
    if (!segCovers(va, czm) || !segCovers(vb, czm) || !segCovers(ha, cxm) || !segCovers(hb, cxm)) continue;
    const cx = cxm, cz = czm;
    let zone = districtIdOf(cx, cz);
    const b = { x0, z0, x1, z1, cx, cz, zone, ix: i, iz: j };
    blocks.push(b);
  }
  function segCovers(r, t) { return t >= r.a && t <= r.b; }

  // named greens & plazas override zones
  const PARK_C = { x: 330, z: -96 };
  const PLAZAS = [{ x: -186, z: 344, r: 78 }, { x: 524, z: -424, r: 74 }];
  for (const b of blocks) {
    if (dist(b.cx, b.cz, PARK_C.x, PARK_C.z) < 128) b.zone = 'park';
    for (const p of PLAZAS) if (dist(b.cx, b.cz, p.x, p.z) < p.r) b.zone = 'plaza';
    if (dist(b.cx, b.cz, -40, -560) < 60) b.zone = 'stadium';
    if (dist(b.cx, b.cz, 16, -4) < 62) b.zone = 'plaza'; // Spire Plaza
  }
  // industrial superblocks feel: widen by merging? (visual handled in build via lot sizes)

  // ---------- landmarks & special spots ----------
  const LM = {
    spire:     { x: 16, z: -4 },
    stadium:   null, // filled below
    ferrisPier:{ x: 520, z: 690 },
    cranes:    [{ x: -700, z: 636 }, { x: -580, z: 638 }, { x: -460, z: 634 }],
    ship:      { x: -580, z: 742 },
    radioTower:{ x: -618, z: 252 },
    archGate:  { x: 172, z: 600 },
    hospital:  null,
    policeHQ:  null,
    safehouse: null,
  };
  // pick real blocks for services
  const near = (x, z) => blocks.reduce((best, b) =>
    dist(b.cx, b.cz, x, z) < dist(best.cx, best.cz, x, z) ? b : best, blocks[0]);
  const bStad = near(-40, -560); bStad.zone = 'stadium'; LM.stadium = { x: bStad.cx, z: bStad.cz, b: bStad };
  const bHosp = near(-170, 250); bHosp.zone = 'hospital'; LM.hospital = { x: bHosp.cx, z: bHosp.cz - (bHosp.z1 - bHosp.z0) * 0.28, spawn: { x: bHosp.cx, z: bHosp.cz - (bHosp.z1 - bHosp.z0) / 2 - 8 } };
  const bCop = near(196, -306); bCop.zone = 'police'; LM.policeHQ = { x: bCop.cx, z: bCop.cz, spawn: { x: bCop.cx, z: bCop.cz - (bCop.z1 - bCop.z0) / 2 - 8 } };
  const bSafe = near(446, -352); bSafe.zone = 'safehouse'; LM.safehouse = { x: bSafe.cx, z: bSafe.cz };
  const bGar1 = near(-452, 64); bGar1.zone = 'spray';
  const bGar2 = near(438, 388); bGar2.zone = 'spray';
  LM.sprayShops = [
    { x: bGar1.cx, z: bGar1.cz, door: { x: bGar1.cx, z: bGar1.z1 - 2 } },
    { x: bGar2.cx, z: bGar2.cz, door: { x: bGar2.cx, z: bGar2.z1 - 2 } },
  ];
  // robable storefronts: pick 5 midtown/downtown/marina blocks, face nearest avenue
  LM.stores = [];
  const storeSeeds = [[-92, 96], [220, 190], [-296, -204], [476, 280], [64, 436]];
  for (const [sx, sz] of storeSeeds) {
    const b = near(sx, sz); if (b.zone !== 'midtown' && b.zone !== 'downtown' && b.zone !== 'marina') b.zone = 'stores';
    if (['park','plaza','stadium','hospital','police','safehouse','spray'].includes(b.zone)) continue;
    b.zone = 'stores';
    LM.stores.push({ x: b.cx, z: b.cz, b, robbed: false });
  }
  // fixers / mission givers
  LM.fixers = {
    marisol: { x: 540, z: 512, name: 'MARISOL' },   // Palm Shores boardwalk
    dario:   { x: 424, z: -300, name: 'DARIO' },    // Cannery Row
    tiny:    { x: -556, z: 420, name: 'TINY' },     // Ironworks docks
    k:       { x: -92, z: -12, name: 'K' },         // near Spire Plaza
  };

  // ---------- parked car spots ----------
  const parkedSpots = [];
  for (const r of [...roadsV, ...roadsH]) {
    const vert = r.axis === 'v';
    const len = r.b - r.a;
    const step = r.ave ? 31 : 26;
    for (let t = r.a + 16 + rng.next() * 10; t < r.b - 16; t += step) {
      if (nearNode(nodes, vert ? r.c : t, vert ? t : r.c, 15)) continue;
      if (rng.chance(0.42)) continue; // gaps
      const side = rng.chance(0.5) ? 1 : -1;
      const off = r.w / 2 - 1.9;
      const x = vert ? r.c + side * off : t;
      const z = vert ? t : r.c + side * off;
      const ang = vert ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (Math.abs(x) > WORLD.halfX - 30 || z > WORLD.sandZ0 - 6) continue;
      parkedSpots.push({ x, z, ang });
    }
  }
  function nearNode(list, x, z, rad) { for (const n of list) if (dist(n.x, n.z, x, z) < rad) return true; return false; }

  // ---------- queries ----------
  function roadAt(x, z, pad = 0.4) {
    let best = null, bd = 1e9;
    for (const r of roadsV) {
      if (z < r.a || z > r.b) continue;
      const d = Math.abs(x - r.c);
      if (d < r.w / 2 + pad && d < bd) { bd = d; best = { axis: 'v', r }; }
    }
    for (const r of roadsH) {
      if (x < r.a || x > r.b) continue;
      const d = Math.abs(z - r.c);
      if (d < r.w / 2 + pad && d < bd) { bd = d; best = { axis: 'h', r }; }
    }
    return best;
  }
  function onSidewalk(x, z) {
    for (const r of roadsV) {
      if (z < r.a || z > r.b) continue;
      const d = Math.abs(x - r.c);
      if (d > r.w / 2 && d < r.w / 2 + SIDEWALK * 2 + 1.2) return true;
    }
    for (const r of roadsH) {
      if (x < r.a || x > r.b) continue;
      const d = Math.abs(z - r.c);
      if (d > r.w / 2 && d < r.w / 2 + SIDEWALK * 2 + 1.2) return true;
    }
    return false;
  }
  function districtName(x, z) { return DISTRICTS[districtIdOf(x, z)].name; }
  function inWater(x, z) { return z > WORLD.waterZ - 4; }
  function randomRoadPoint(rng2) {
    const r = rng2.pick([...roadsV, ...roadsH]);
    const t = rng2.range(r.a + 20, r.b - 20);
    return r.axis === 'v' ? { x: r.c, z: t, r } : { x: t, z: r.c, r };
  }

  return {
    seed, roadsV, roadsH, nodes, blocks, SIDEWALK,
    landmarks: LM, parkedSpots,
    roadAt, onSidewalk, districtName, districtIdOf, inWater, randomRoadPoint, segCovers,
    bounds: { x0: -WORLD.halfX, x1: WORLD.halfX, z0: WORLD.northZ, z1: WORLD.waterZ + 40 },
  };
}

function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
