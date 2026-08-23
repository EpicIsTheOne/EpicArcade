/* Emberwake — world.js
 * Deterministic procedural world: terrain, pilgrim road, regions, props, wayshrines.
 * Dual-export: browser global `window.EmberWorld`, Node `module.exports`.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./rng.js'));
  else root.EmberWorld = factory(root.EmberRNG);
})(typeof self !== 'undefined' ? self : this, function (RNG) {
  'use strict';

  var REGIONS = [
    {
      id: 0, key: 'ashfall', name: 'Ashfall Meadow',
      fog: 0x232c44, fogDensity: 0.0058, hemiSky: 0x3d5080, hemiGround: 0x2a2136,
      grassA: 0x66806e, grassB: 0x4c655a, dirt: 0x6a5c4c, rock: 0x767e92,
      treeKind: 'birch', treeCount: 80, rockCount: 55, moss: 72
    },
    {
      id: 1, key: 'glasswind', name: 'Glasswind Flats',
      fog: 0x27395c, fogDensity: 0.0068, hemiSky: 0x48689e, hemiGround: 0x212a3a,
      grassA: 0x7f96ac, grassB: 0x5f7590, dirt: 0x565f70, rock: 0x8b98b4,
      treeKind: 'pine', treeCount: 26, rockCount: 42, moss: 48
    },
    {
      id: 2, key: 'hushpines', name: 'The Hushpines',
      fog: 0x1b2438, fogDensity: 0.0085, hemiSky: 0x33446c, hemiGround: 0x1c1626,
      grassA: 0x43604f, grassB: 0x33483f, dirt: 0x4e443a, rock: 0x626a7c,
      treeKind: 'spruce', treeCount: 210, rockCount: 34, moss: 62
    },
    {
      id: 3, key: 'cinder', name: 'The Cinder Reach',
      fog: 0x33201f, fogDensity: 0.0078, hemiSky: 0x56303c, hemiGround: 0x261418,
      grassA: 0x68464a, grassB: 0x50343a, dirt: 0x48332a, rock: 0x443238,
      treeKind: 'dead', treeCount: 22, rockCount: 46, moss: 34
    }
  ];

  function create(opts) {
    opts = opts || {};
    var seed = opts.seed || 'EMBERWAKE-1';
    var rng = RNG.makeRng(seed + ':world');
    var fbmBase = RNG.makeFbm(seed + ':base', 4);
    var fbmDetail = RNG.makeFbm(seed + ':detail', 3);
    var fbmWander = RNG.makeFbm(seed + ':wander', 3);

    // ---- Pilgrim road: west -> east, wandering ----
    var WP_COUNT = 41, SPACING = 21;
    var wps = [];
    for (var i = 0; i < WP_COUNT; i++) {
      var wx = -400 + i * SPACING;
      var wz = fbmWander(i * 0.16, 7.3) * 90;
      if (i === 0) wz = 0;
      wps.push({ x: wx, z: wz });
    }
    wps[WP_COUNT - 1].x = 400; wps[WP_COUNT - 1].z = 0;

    // Catmull-Rom resample into dense polyline
    function crPoint(p0, p1, p2, p3, t) {
      var t2 = t * t, t3 = t2 * t;
      return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      };
    }
    var roadPts = [];
    var SAMPLES_PER_SEG = 24;
    for (var s = 0; s < WP_COUNT - 1; s++) {
      var p0 = wps[Math.max(0, s - 1)], p1 = wps[s], p2 = wps[s + 1], p3 = wps[Math.min(WP_COUNT - 1, s + 2)];
      for (var j = 0; j < SAMPLES_PER_SEG; j++) roadPts.push(crPoint(p0, p1, p2, p3, j / SAMPLES_PER_SEG));
    }
    roadPts.push({ x: wps[WP_COUNT - 1].x, z: wps[WP_COUNT - 1].z });

    // ---- Raw terrain height ----
    function rawHeight(x, z) {
      var h = fbmBase(x * 0.0085, z * 0.0085) * 16 + fbmDetail(x * 0.05, z * 0.05) * 1.6;
      h += Math.sin(x * 0.011) * 3.0;
      var r = Math.sqrt(x * x + z * z);
      h += Math.max(0, (r - 260)) * 0.06;           // valley walls rise far out
      if (x > 300) h += (x - 300) * 0.05;            // Cinder climbs toward the gate
      return h;
    }

    // Precompute road node heights (smoothed raw samples)
    var roadH = roadPts.map(function (p) { return rawHeight(p.x, p.z); });
    for (var pass = 0; pass < 6; pass++) {
      for (var k = 1; k < roadH.length - 1; k++) roadH[k] = (roadH[k - 1] + roadH[k] * 2 + roadH[k + 1]) / 4;
    }

    // Nearest-point-on-road query (coarse scan + refine)
    function roadNearest(x, z) {
      var best = -1, bd = 1e12;
      for (var i = 0; i < roadPts.length; i += 2) {
        var dx = roadPts[i].x - x, dz = roadPts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      var lo = Math.max(0, best - 3), hi = Math.min(roadPts.length - 1, best + 3);
      var bi = lo; bd = 1e12;
      for (var q = lo; q <= hi; q++) {
        var dx2 = roadPts[q].x - x, dz2 = roadPts[q].z - z, d2 = dx2 * dx2 + dz2 * dz2;
        if (d2 < bd) { bd = d2; bi = q; }
      }
      return { idx: bi, dist: Math.sqrt(bd), pt: roadPts[bi], h: roadH[bi] };
    }

    var ROAD_HALF = 5.2, ROAD_BLEND = 13.0;
    function height(x, z) {
      var h = rawHeight(x, z);
      var nr = roadNearest(x, z);
      if (nr.dist < ROAD_BLEND) {
        var t = smoothstep(ROAD_HALF, ROAD_BLEND, nr.dist);
        h = nr.h * (1 - t) + h * t;
      }
      // ponds flatten
      for (var i = 0; i < ponds.length; i++) {
        var pd = Math.hypot(x - ponds[i].x, z - ponds[i].z);
        if (pd < ponds[i].r + 8) {
          var tt = smoothstep(ponds[i].r, ponds[i].r + 8, pd);
          h = ponds[i].y * (1 - tt) + h * tt;
        }
      }
      return h;
    }
    function smoothstep(a, b, v) {
      var t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }

    // ---- Regions by x threshold ----
    function regionAtX(x) {
      if (x < -190) return REGIONS[0];
      if (x < -40) return REGIONS[1];
      if (x < 210) return REGIONS[2];
      return REGIONS[3];
    }

    // ---- Frozen ponds (Glasswind) ----
    var ponds = [];
    for (var pi = 0; pi < 7; pi++) {
      var px = -185 + rng() * 135, pz = fbmWander(px * 0.02, 3.1) * 110;
      ponds.push({ x: px, z: pz, r: 10 + rng() * 9, y: rawHeight(px, pz) - 0.4 });
    }

    // ---- Lava fissures (Cinder Reach) ----
    var fissures = [];
    // boss-arena fissures near the Dawn Gate (rich fuel trickle during the Wraith fight)
    fissures.push({ x: 372, z: 10, rx: 9, rz: 2.6, rot: 0.4, y: rawHeight(372, 10) - 0.25, rich: true });
    fissures.push({ x: 392, z: -12, rx: 8, rz: 2.4, rot: -0.5, y: rawHeight(392, -12) - 0.25, rich: true });
    fissures.push({ x: 402, z: 14, rx: 7, rz: 2.2, rot: 0.9, y: rawHeight(402, 14) - 0.25, rich: true });
    for (var fi = 0; fi < 9; fi++) {
      var fx = 235 + rng() * 150, fz = fbmWander(fx * 0.03, 9.7) * 95;
      if (Math.abs(fz) > 150) fz *= 0.5;
      fissures.push({
        x: fx, z: fz, rx: 7 + rng() * 9, rz: 2.2 + rng() * 2.2,
        rot: rng() * Math.PI, y: rawHeight(fx, fz) - 0.25
      });
    }

    // ---- Wayshrines along road ----
    var SHRINE_T = [0.085, 0.205, 0.325, 0.445, 0.565, 0.685, 0.805, 0.905];
    var shrines = SHRINE_T.map(function (t, ix) {
      var idx = Math.floor(t * (roadPts.length - 1));
      var p = roadPts[idx];
      var off = (ix % 2 === 0 ? 1 : -1) * 9.5;
      var nx = 0, nz = -(p.z - roadPts[Math.max(0, idx - 4)].z); // perpendicular-ish
      var nl = Math.hypot(nx, nz) || 1;
      return { x: p.x + (nz / nl) * off, z: p.z + (nx / nl) * off, lit: false, index: ix };
    });

    // ---- Dawn Gate ----
    var gate = { x: 396, z: 0 };

    // ---- Prop scatter ----
    var props = [];
    function tooCloseToRoad(x, z, min) { return roadNearest(x, z).dist < min; }
    function inPond(x, z, pad) {
      for (var i = 0; i < ponds.length; i++) if (Math.hypot(x - ponds[i].x, z - ponds[i].z) < ponds[i].r + pad) return true;
      return false;
    }
    function inFissure(x, z, pad) {
      for (var i = 0; i < fissures.length; i++) {
        var f = fissures[i], dx = x - f.x, dz = z - f.z, c = Math.cos(-f.rot), s = Math.sin(-f.rot);
        var lx = dx * c - dz * s, lz = dx * s + dz * c;
        if ((lx * lx) / (f.rx * f.rx) + (lz * lz) / (f.rz * f.rz) < 1 + pad) return true;
      }
      return false;
    }
    function nearShrine(x, z, pad) {
      for (var i = 0; i < shrines.length; i++) if (Math.hypot(x - shrines[i].x, z - shrines[i].z) < pad) return true;
      return false;
    }
    function scatter(count, regionFilter, minRoad, kind, scaleMin, scaleMax, extraTries) {
      var placed = 0, tries = 0;
      while (placed < count && tries < count * (extraTries || 30)) {
        tries++;
        var x = rng.range(-430, 430), z = rng.range(-230, 230);
        if (!regionFilter(regionAtX(x))) continue;
        if (tooCloseToRoad(x, z, minRoad) || inPond(x, z, 2) || inFissure(x, z, 0.4) || nearShrine(x, z, 10)) continue;
        props.push({
          kind: kind, x: x, z: z, y: height(x, z),
          s: rng.range(scaleMin, scaleMax), rot: rng() * Math.PI * 2,
          v: rng.int(0, 2)
        });
        placed++;
      }
    }
    var all = function () { return true; };
    REGIONS.forEach(function (rg) {
      var match = function (r) { return r.id === rg.id; };
      scatter(rg.treeCount, match, 7.5, 'tree_' + rg.treeKind, 0.75, 1.5);
      scatter(Math.floor(rg.rockCount * 0.55), match, 6.5, 'rock', 0.5, 1.6);
      scatter(Math.ceil(rg.rockCount * 0.45), match, 6.5, 'spire', 0.5, 1.3);
      scatter(rg.moss, match, 6.0, 'moss', 0.8, 1.35);
    });
    // embershard crystals (currency) — biased toward road
    for (var si = 0; si < 52; si++) {
      var t = rng();
      var idx = Math.floor(t * (roadPts.length - 1));
      var p = roadPts[idx];
      var ang = rng() * Math.PI * 2, dist = 9 + rng() * 26;
      var sx = p.x + Math.cos(ang) * dist, sz = p.z + Math.sin(ang) * dist;
      if (inPond(sx, sz, 1) || inFissure(sx, sz, 0.3) || nearShrine(sx, sz, 8)) continue;
      props.push({ kind: 'shard', x: sx, z: sz, y: height(sx, sz), s: rng.range(0.85, 1.3), rot: rng() * Math.PI * 2, v: 0 });
    }
    // kindling caches — guaranteed fuel bundles down the late stretch (anti-starvation)
    for (var ki = 0; ki < 14; ki++) {
      var kt = 0.62 + (ki / 14) * 0.36;
      var kidx = Math.floor(kt * (roadPts.length - 1));
      var kp = roadPts[kidx];
      var kang = rng() * Math.PI * 2, kdist = 4 + rng() * 10;
      var kx2 = kp.x + Math.cos(kang) * kdist, kz2 = kp.z + Math.sin(kang) * kdist;
      if (inPond(kx2, kz2, 1) || inFissure(kx2, kz2, 0.3)) continue;
      props.push({ kind: 'cache', x: kx2, z: kz2, y: height(kx2, kz2), s: 1.0, rot: rng() * Math.PI * 2, v: 0 });
    }

    // caravan spawn just east of start
    var spawnIdx = 6;
    var spawn = { x: roadPts[spawnIdx].x, z: roadPts[spawnIdx].z };

    return {
      seed: seed,
      REGIONS: REGIONS,
      roadPts: roadPts, roadH: roadH,
      roadNearest: roadNearest, roadLength: roadPts.length,
      rawHeight: rawHeight, height: height,
      regionAtX: regionAtX,
      ponds: ponds, fissures: fissures,
      shrines: shrines, dawnGate: gate,
      props: props, spawn: spawn,
      ROAD_HALF: ROAD_HALF
    };
  }

  return { create: create, REGIONS: REGIONS };
});
