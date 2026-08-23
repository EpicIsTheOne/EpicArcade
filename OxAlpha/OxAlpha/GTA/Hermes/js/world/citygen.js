// ============================================================
// NEON MERIDIAN — world/citygen.js
// Deterministic city LAYOUT (pure data, no THREE / no DOM):
// districts, lots/buildings, props, parking, traffic graph,
// traffic-light nodes, service locations, package spawns.
// Browser world.js consumes this; node tests verify it.
//
// Coordinates: city spans [0..GRID*BLOCK] on X and Z.
// Ocean lies SOUTH of the city (z > size): beach strip first.
// ============================================================
'use strict';

const CityGen = (() => {

  // ---- local helpers (self-contained for node testing) ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);

  function computeLayout(C, seedOverride) {
    const rng = mulberry32(seedOverride !== undefined ? seedOverride : C.WORLD_SEED);
    const G = C.GRID, B = C.BLOCK, RW = C.ROAD_W, SW = C.SIDEWALK_W;
    const size = G * B;

    // ---------- district assignment ----------
    // j indexes rows (z), i columns (x). South (high j) = beach/ocean.
    function districtOf(i, j) {
      if (j >= G - 2) return 'beach';                       // last 2 rows
      if (j >= 12 && i >= 1 && i <= 3) return 'beach';
      const di = i - G / 2, dj = j - 4.5;                    // downtown core
      const dPark = Math.hypot(i - 7, j - 7);
      if (dPark < 2.3) return 'park';
      if (Math.hypot(di * 0.85, dj * 1.15) < 3.4) return 'downtown';
      if (i <= 2 && j <= G - 3) return 'industrial';
      if (i >= G - 3 && j >= 3) return 'oldtown';
      return 'residential';
    }

    const blocks = [];
    for (let j = 0; j < G; j++) {
      const row = [];
      for (let i = 0; i < G; i++) {
        const x0 = i * B, z0 = j * B;
        row.push({
          i, j, district: districtOf(i, j),
          x0, z0, x1: x0 + B, z1: z0 + B,
          cx: x0 + B / 2, cz: z0 + B / 2,
        });
      }
      blocks.push(row);
    }

    // ---------- lots & buildings ----------
    const buildings = [];
    const props = [];
    const parkingLots = [];
    const parkedSpots = [];

    function addBuilding(x0, z0, x1, z1, h, district, extra) {
      const b = {
        x0: +x0.toFixed(2), z0: +z0.toFixed(2),
        x1: +x1.toFixed(2), z1: +z1.toFixed(2), h: Math.round(h),
        district,
        style: Math.floor(rng() * 5),
        roof: rng() < 0.35 ? 'setback' : (rng() < 0.5 ? 'tank' : 'flat'),
        id: buildings.length,
      };
      if (extra) Object.assign(b, extra);
      buildings.push(b);
      return b;
    }

    function fillLotBlock(blk) {
      const ix0 = blk.x0 + SW, iz0 = blk.z0 + SW, ix1 = blk.x1 - SW, iz1 = blk.z1 - SW;
      const D = C.DISTRICTS[blk.district];

      if (blk.district === 'downtown' || blk.district === 'oldtown' ||
          blk.district === 'residential' || blk.district === 'industrial') {
        // rare service parking lot instead of buildings
        if ((blk.i * 7 + blk.j * 13) % 23 === 5 &&
            (blk.district === 'residential' || blk.district === 'industrial')) {
          parkingLots.push({ x0: ix0, z0: iz0, x1: ix1, z1: iz1, district: blk.district });
          // curb-side parked cars inside lot
          const n = 4 + Math.floor(rng() * 5);
          for (let k = 0; k < n; k++) {
            const px = lerp(ix0 + 4, ix1 - 4, rng()), pz = lerp(iz0 + 4, iz1 - 4, rng());
            parkedSpots.push({ x: px, z: pz, h: rng() * Math.PI * 2, kind: 'lot' });
          }
          return;
        }
      }

      switch (blk.district) {
        case 'downtown': {
          if (rng() < 0.55) {
            // one tower + podium
            const w = randR(30, 42), d = randR(30, 42);
            const cx = lerp(ix0, ix1, 0.35 + rng() * 0.3), cz = lerp(iz0, iz1, 0.35 + rng() * 0.3);
            addBuilding(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2,
              randR(D.heightMin, D.heightMax), 'downtown', { roof: 'setback' });
            // podium slab
            addBuilding(ix0 + 2, iz0 + 2, ix1 - 2, iz1 - 2, randR(6, 10), 'downtown', { podium: true });
          } else {
            // twin towers
            for (let q = 0; q < 2; q++) {
              const w = randR(18, 25), d = randR(18, 25);
              const cx = q ? lerp(ix0, ix1, 0.68) : lerp(ix0, ix1, 0.32);
              const cz = lerp(iz0, iz1, 0.3 + rng() * 0.4);
              addBuilding(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2,
                randR(D.heightMin, D.heightMax), 'downtown', { roof: rng() < 0.5 ? 'setback' : 'flat' });
            }
          }
          break;
        }
        case 'oldtown': {
          // row buildings facing south street with alleys
          let x = ix0;
          while (x < ix1 - 8) {
            const w = randR(11, 17), d = randR(20, 34);
            if (rng() < 0.86) {
              addBuilding(x, iz1 - d, Math.min(x + w, ix1), iz1,
                randR(D.heightMin, D.heightMax), 'oldtown');
            }
            x += w + (rng() < 0.3 ? 2.2 : 0.6);   // occasional alley gap
          }
          break;
        }
        case 'residential': {
          const cols = 2 + Math.floor(rng() * 2), rows = 2;
          const cw = (ix1 - ix0) / cols, cd = (iz1 - iz0) / rows;
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (rng() < 0.82) {
              const w = randR(cw * 0.45, cw * 0.72), d = randR(cd * 0.45, cd * 0.7);
              const cx = ix0 + cw * (c + 0.5), cz = iz0 + cd * (r + 0.5);
              addBuilding(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2,
                randR(D.heightMin, D.heightMax), 'residential');
            }
          }
          break;
        }
        case 'industrial': {
          const n = 1 + Math.floor(rng() * 2);
          for (let k = 0; k < n; k++) {
            const w = randR(26, 40), d = randR(20, 34);
            const cx = lerp(ix0, ix1, rng()), cz = lerp(iz0, iz1, rng());
            addBuilding(clamp(cx - w / 2, ix0, ix1 - w), clamp(cz - d / 2, iz0, iz1 - d),
              0, 0, randR(D.heightMin, D.heightMax), 'industrial',
              { warehouse: true });
            const bb = buildings[buildings.length - 1];
            bb.x1 = bb.x0 + w; bb.z1 = bb.z0 + d;
          }
          // container stacks
          const stacks = 2 + Math.floor(rng() * 4);
          for (let k = 0; k < stacks; k++) {
            props.push({
              type: 'container',
              x: randR(ix0 + 3, ix1 - 3), z: randR(iz0 + 3, iz1 - 3),
              rot: Math.floor(rng() * 4) * Math.PI / 2,
              hue: Math.floor(rng() * 5),
            });
          }
          break;
        }
        case 'beach': {
          if (rng() < 0.28) {
            const w = randR(10, 16), d = randR(8, 12);
            const cx = lerp(ix0, ix1, rng()), cz = lerp(iz0, iz1, 0.75);
            addBuilding(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, randR(4, 8), 'beach');
          }
          break;
        }
        case 'park': {
          // trees & benches; fountain placed once at center block later
          const nT = 8 + Math.floor(rng() * 7);
          for (let k = 0; k < nT; k++) {
            props.push({ type: 'tree', x: randR(ix0 + 2, ix1 - 2), z: randR(iz0 + 2, iz1 - 2), s: randR(0.8, 1.5) });
          }
          if (rng() < 0.5) props.push({ type: 'bench', x: lerp(ix0, ix1, rng()), z: lerp(iz0, iz1, rng()), rot: rng() * Math.PI });
          break;
        }
      }
    }

    function lerp(a, b, t) { return a + (b - a) * t; }
    function randR(lo, hi) { return lo + rng() * (hi - lo); }

    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) fillLotBlock(blocks[j][i]);

    // ---------- landmark: Meridian Spire ----------
    const spireBlk = blocks[4][7];
    {
      const cx = spireBlk.cx, cz = spireBlk.cz;
      // remove any building intersecting spire plot
      for (let k = buildings.length - 1; k >= 0; k--) {
        const b = buildings[k];
        if (b.x0 < cx + 16 && b.x1 > cx - 16 && b.z0 < cz + 16 && b.z1 > cz - 16) buildings.splice(k, 1);
      }
      addBuilding(cx - 13, cz - 13, cx + 13, cz + 13, 172, 'downtown', { landmark: 'spire', roof: 'spire' });
    }

    // ---------- street lights & trees along roads ----------
    const lightSpacing = 36;
    for (let j = 0; j <= G; j++) {
      for (let i = 0; i < G; i++) {
        // horizontal road segment (along x) at z = j*B
        for (let s = lightSpacing / 2; s < B; s += lightSpacing) {
          props.push({ type: 'streetlight', x: i * B + s, z: j * B + RW / 2 + 1.0, rot: 0 });
        }
        // vertical road segment (along z) at x = i*B
        for (let s = lightSpacing / 2; s < B; s += lightSpacing) {
          props.push({ type: 'streetlight', x: i * B + RW / 2 + 1.0, z: j * B + s, rot: Math.PI / 2 });
        }
      }
    }
    // residential/beach trees in yard gaps
    for (const bl of blocks.flat()) {
      if (bl.district === 'residential' || bl.district === 'beach') {
        const n = bl.district === 'beach' ? 5 : 3;
        for (let k = 0; k < n; k++) {
          props.push({ type: 'tree', x: bl.x0 + SW + rng() * (B - 2 * SW), z: bl.z0 + SW + rng() * (B - 2 * SW), s: randR(0.8, 1.4) });
        }
      }
    }

    // ---------- traffic graph ----------
    // nodes: (i,j) -> index; edges between orthogonal neighbors
    const nodes = []; const nodeIdx = {};
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      nodeIdx[i + ',' + j] = nodes.length;
      const dist = districtOf(clamp(i, 0, G - 1), clamp(j, 0, G - 1));
      nodes.push({
        x: i * B, z: j * B, i, j,
        light: false, phase: ((i + j) % 2) * 14,
        speedLimit: (i === 0 || j === 0 || i === G || j === G) ? 26 : 14, // m/s
        highway: (i === 0 || j === 0 || i === G || j === G),
      });
    }
    const edges = [];
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      if (i < G) edges.push([nodeIdx[i + ',' + j], nodeIdx[(i + 1) + ',' + j]]);
      if (j < G) edges.push([nodeIdx[i + ',' + j], nodeIdx[i + ',' + (j + 1)]]);
    }
    // traffic lights at inner intersections in denser districts
    for (const nd of nodes) {
      if (nd.highway) continue;
      const dHere = districtOf(clamp(nd.i, 0, G - 1), clamp(nd.j, 0, G - 1));
      const dn = districtOf(clamp(nd.i - 1, 0, G - 1), clamp(nd.j - 1, 0, G - 1));
      if ((dHere === 'downtown' || dHere === 'oldtown') && (dn === 'downtown' || dn === 'oldtown')) nd.light = true;
    }
    const graph = { nodes, edges, nodeIdx };

    // ---------- curb-side parked cars ----------
    for (let k = 0; k < 70; k++) {
      const horiz = rng() < 0.5;
      const seg = 1 + Math.floor(rng() * (G - 1));
      const t = randR(0.15, 0.85) * B;
      const side = rng() < 0.5 ? 1 : -1;
      if (horiz) {
        parkedSpots.push({ x: seg * B + t, z: (1 + Math.floor(rng() * (G - 1))) * B + side * (RW / 2 - 1.4), h: horiz ? 0 : Math.PI / 2, kind: 'curb' });
      } else {
        parkedSpots.push({ x: (1 + Math.floor(rng() * (G - 1))) * B + side * (RW / 2 - 1.4), z: seg * B + t, h: Math.PI / 2, kind: 'curb' });
      }
    }

    // ---------- locations ----------
    function onSidewalk(i, j, alongT, side) {
      // point on sidewalk band of horizontal road z=j*B, x=i*B+alongT
      return { x: i * B + alongT, z: j * B + side * (RW / 2 + SW * 0.5) };
    }
    const L = {
      paynpray: [onSidewalk(9, 6, 30, 1), onSidewalk(2, 9, 40, -1)],
      gunshop: [onSidewalk(11, 8, 22, 1), onSidewalk(4, 2, 46, -1)],
      food: [onSidewalk(7, 5, 18, 1), onSidewalk(11, 11, 30, 1), onSidewalk(6, 13, 38, -1)],
      hospital: [onSidewalk(5, 8, 50, 1)],
      missions: {
        mara: onSidewalk(6, 6, 20, 1),
        dex: onSidewalk(1, 12, 30, -1),
        yun: onSidewalk(7, 9, 44, -1),
      },
      raceStart: { x: 7 * B, z: (G - 1) * B + RW / 2, h: Math.PI / 2 },
      spawn: (() => { const p = onSidewalk(6, 6, 26, -1); return { x: p.x, z: p.z }; })(),
    };

    // ---------- collectibles ----------
    const packages = [];
    const pkgDistricts = ['downtown', 'oldtown', 'industrial', 'residential', 'beach', 'park'];
    for (let k = 0; k < 10; k++) {
      const dName = pkgDistricts[k % pkgDistricts.length];
      const cand = blocks.flat().filter(b => b.district === dName);
      const blk = cand[Math.floor(rng() * cand.length)];
      packages.push({
        idx: k,
        x: +(blk.x0 + SW + rng() * (B - 2 * SW)).toFixed(1),
        z: +(Math.min(blk.z0 + SW + rng() * (B - 2 * SW), size - 2 * B - 6)).toFixed(1),
        district: dName,
      });
    }

    // ---------- beach / water line ----------
    const shorelineZ = size - 2 * B + B * 0.55;   // where sand starts sloping to water
    const waterZ = C.WATER_Z;

    // ---------- helpers exposed ----------
    function districtAt(x, z) {
      const i = clamp(Math.floor(x / B), 0, G - 1);
      const j = clamp(Math.floor(z / B), 0, G - 1);
      return districtOf(i, j);
    }
    function isOnRoad(x, z) {
      const mx = ((x % B) + B) % B, mz = ((z % B) + B) % B;
      const halfRW = RW / 2;
      return mx < halfRW || mx > B - halfRW || mz < halfRW || mz > B - halfRW;
    }

    return {
      size, blocks, buildings, props, parkingLots, parkedSpots,
      graph, locations: L, packages,
      shorelineZ, waterZ,
      districtAt, isOnRoad, districtOf,
    };
  }

  return { computeLayout };
})();

if (typeof module !== 'undefined') module.exports = { CityGen };
