// Chunk system: procedural course generation, biome theming, obstacle placement.
// Fairness: per-chunk solvability check - every chunk must leave at least one
// survivable path (open lane, jumpable, or rollable) through every z-slice.
(function (root) {
  var CH = {};
  var LANES = null;
  function lanesArr() { if (!LANES) LANES = root.CFG.LANES; return LANES; }

  // Biome themes: ground dressing, side content density, sky/fog tint
  var BIOMES = [
    { id: 'city', fog: 0x9db8dd, fogD: 0.0075, hemi: 0xbfd4ff, sun: 0xffe2b0, ground: 'ballast', sides: 'city' },
    { id: 'station', fog: 0xaec3de, fogD: 0.006, hemi: 0xcfe0ff, sun: 0xffe8c0, ground: 'concrete', sides: 'station', platforms: true },
    { id: 'maintenance', fog: 0x9fb4c4, fogD: 0.009, hemi: 0xa8bccc, sun: 0xf3d9a8, ground: 'metal', sides: 'yard', fence: true },
    { id: 'bridge', fog: 0x86b7d8, fogD: 0.004, hemi: 0xcfe6ff, sun: 0xfff0cc, ground: 'steelDeck', sides: 'valley', bridge: true },
    { id: 'greenbelt', fog: 0xaad4c0, fogD: 0.0065, hemi: 0xd8f0d0, sun: 0xfff4d0, ground: 'grass', sides: 'park', trees: true }
  ];

  // Obstacle kinds with required response (used by generator + collision)
  // low -> jump over; overhead -> roll under; block -> change lane
  var OBS = ['low', 'overhead', 'block'];

  function pickBiome(chunkIndex, rng) {
    if (chunkIndex < 2) return BIOMES[1]; // start at a station for readability
    var r = root.RngLib.hash2(chunkIndex >> 2, 77, 12345);
    var idx = Math.floor(r * BIOMES.length);
    return BIOMES[idx];
  }

  // ---- obstacle layout generator for one chunk ----
  // Returns evs[{z,lane,kind}] + safeLane. Guarantees a survivable line.
  function genObstacles(chunkIndex, rng, diff) {
    if (chunkIndex < 2) return { evs: [], safeLane: 1 }; // start-of-run grace zone
    var evs = [];
    var n = Math.min(6, 2 + Math.floor(diff * 3 + rng.next() * 2));
    var z = 6 + rng.next() * 8;
    var safeLane = rng.int(0, 2); // lane guaranteed clear of 'block' this chunk
    for (var i = 0; i < n; i++) {
      var kind = OBS[rng.int(0, 2)];
      var lane = rng.int(0, 2);
      if (kind === 'block') {
        var blocked = evs.filter(function (e) { return e.kind === 'block' && Math.abs(e.z - z) < 10; }).length;
        if (blocked >= 2 || lane === safeLane) { kind = rng.chance(0.5) ? 'low' : 'overhead'; }
      }
      evs.push({ z: z, lane: lane, kind: kind });
      z += 60 / n * rng.range(0.75, 1.25);
      if (z > 54) break;
    }
    return { evs: evs, safeLane: safeLane };
  }

  CH.generate = function (chunkIndex, seed, mats, scene, difficulty01, forceTunnel) {
    var rng = new root.RngLib.RNG((seed ^ (chunkIndex * 2654435761)) >>> 0);
    var biome = pickBiome(chunkIndex, rng);
    var group = new THREE.Group();
    var L = root.CFG.CHUNK_LEN;
    var colliders = [];   // {x,z,hw,hz,yMin,yMax,action}
    var coins = [];
    var powerups = [];
    var trains = [];

    // --- track bed ---
    var bedW = 11.4;
    var bedMat = biome.ground === 'grass' ? mats.grass : (biome.ground === 'concrete' ? mats.concrete : mats.ballast);
    var bed = new THREE.Mesh(new THREE.BoxGeometry(bedW, 0.3, L), bedMat);
    bed.position.set(0, -0.15, -L / 2);
    group.add(bed);

    // rails per lane
    for (var li = 0; li < 3; li++) {
      var lx = lanesArr()[li];
      var rp = root.Builders.railPair(mats.rail, L);
      rp.position.set(lx, 0, -L / 2);
      group.add(rp);
      for (var sz = 2; sz < L; sz += 3.2) {
        var sl = root.Builders.sleeper(mats.sleeper);
        sl.position.set(lx, 0.05, -sz);
        group.add(sl);
      }
    }

    // --- biome dressing ---
    var side;
    if (biome.platforms) {
      for (side = -1; side <= 1; side += 2) {
        if (!rng.chance(0.85)) continue;
        var pf = root.Builders.platform(side * 5.6, L, mats.concrete, mats.tactile);
        pf.position.z = -L / 2;
        pf.scale.x = side;
        group.add(pf);
        for (var lz = 8; lz < L - 4; lz += 22) {
          if (!rng.chance(0.7)) continue;
          var lp = root.Builders.lampPost();
          lp.position.set(side * 8.6, 1.1, -lz);
          lp.rotation.y = side > 0 ? Math.PI : 0;
          group.add(lp);
        }
      }
    } else if (biome.sides === 'city') {
      for (side = -1; side <= 1; side += 2) {
        for (var bz = 6; bz < L; bz += 17) {
          var w = rng.range(8, 14), d = rng.range(8, 14);
          var h = rng.range(10, 46) * (rng.chance(0.15) ? 1.5 : 1);
          var bd = root.Builders.building(rng, w, d, h, mats);
          bd.position.set(side * rng.range(12.5, 19), 0, -bz);
          bd.rotation.y = rng.range(-0.08, 0.08);
          group.add(bd);
          if (bd.userData.beacon) group.userData.beacons = (group.userData.beacons || []).concat([bd.userData.beacon]);
        }
      }
      if (rng.chance(0.55)) {
        var bb = root.Builders.billboard(rng.chance(0.5) ? mats.billboardA : mats.billboardB);
        bb.position.set(rng.pick([-1, 1]) * 9.5, 0, -rng.range(10, 50));
        bb.rotation.y = rng.pick([-0.35, 0.35]);
        group.add(bb);
      }
      if (rng.chance(0.5)) {
        var car = root.Builders.car(rng, mats);
        car.position.set(rng.pick([-1, 1]) * rng.range(13, 16), 0.02, -rng.range(8, 52));
        car.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
        group.add(car);
      }
    } else if (biome.sides === 'yard') {
      // gravel shoulder so props never float over void
      var shoulderL = new THREE.Mesh(new THREE.BoxGeometry(16, 0.24, L), mats.ballast);
      shoulderL.position.set(-(bedW / 2 + 8), -0.12, -L / 2);
      group.add(shoulderL);
      var shoulderR = new THREE.Mesh(new THREE.BoxGeometry(16, 0.24, L), mats.ballast);
      shoulderR.position.set(bedW / 2 + 8, -0.12, -L / 2);
      group.add(shoulderR);
      for (side = -1; side <= 1; side += 2) {
        if (biome.fence) { var fseg = root.Builders.fenceSeg(L, mats.fenceMat); fseg.position.set(side * 8.8, 0, -L / 2); group.add(fseg); }
        for (var cz = 5; cz < L - 3; cz += rng.range(7, 13)) {
          if (rng.chance(0.75)) {
            var cont = boxMesh(rng.range(2.2, 2.8), 2.6, rng.range(6, 9), [mats.trainBodyB, mats.trainBodyC, mats.metalWall][rng.int(0, 2)]);
            cont.position.set(side * rng.range(9.5, 12), 1.3, -cz);
            cont.rotation.y = rng.chance(0.85) ? 0 : rng.range(-0.2, 0.2);
            group.add(cont);
          }
          if (rng.chance(0.6)) {
            var crate = boxMesh(1.1, 1.1, 1.1, mats.crate);
            crate.position.set(side * rng.range(7.5, 9), 0.55, -cz - 3);
            group.add(crate);
          }
        }
      }
      if (rng.chance(0.6)) {
        var sig = root.Builders.signalLight(rng.pick(['red', 'green', 'amber']));
        sig.position.set(rng.pick([-1, 1]) * 6.4, 0, -rng.range(6, 54));
        group.add(sig);
      }
    } else if (biome.sides === 'valley') {
      for (var tz = 0; tz <= L; tz += 15) {
        var arch = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.45, 8, 20, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0xc2483f, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide }));
        arch.position.set(0, -2.5, -tz); // XY-plane half-torus already arcs over the track; no rotation
        group.add(arch);
      }
      var deck = new THREE.Mesh(new THREE.BoxGeometry(bedW + 2, 0.5, L), mats.steelDark);
      deck.position.set(0, -0.42, -L / 2);
      group.add(deck);
      for (side = -1; side <= 1; side += 2) {
        var rail = root.Builders.fenceSeg(L, mats.fenceMat);
        rail.position.set(side * (bedW / 2 + 0.4), 0.4, -L / 2);
        group.add(rail);
      }
      var floor = new THREE.Mesh(new THREE.BoxGeometry(240, 0.5, L), mats.grass);
      floor.position.set(0, -26, -L / 2); group.add(floor);
      var river = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, L),
        new THREE.MeshStandardMaterial({ color: 0x3f7fc4, metalness: 0.7, roughness: 0.15 }));
      river.position.set(0, -25.6, -L / 2); group.add(river);
    } else if (biome.sides === 'park') {
      var grassPadL = new THREE.Mesh(new THREE.BoxGeometry(18, 0.22, L), mats.grass);
      grassPadL.position.set(-(bedW / 2 + 9), -0.11, -L / 2);
      group.add(grassPadL);
      var grassPadR = new THREE.Mesh(new THREE.BoxGeometry(18, 0.22, L), mats.grass);
      grassPadR.position.set(bedW / 2 + 9, -0.11, -L / 2);
      group.add(grassPadR);
      for (side = -1; side <= 1; side += 2) {
        for (var pz = 4; pz < L; pz += 6) {
          if (rng.chance(0.8)) {
            var tr = root.Builders.tree(rng);
            tr.position.set(side * rng.range(8, 18), 0, -pz + rng.range(-2, 2));
            tr.rotation.y = rng.range(0, 6.28);
            group.add(tr);
          }
        }
      }
      if (rng.chance(0.4)) {
        var pav = boxMesh(4, 0.3, 4, mats.concrete);
        pav.position.set(rng.pick([-1, 1]) * 11, 2.6, -rng.range(10, 40));
        group.add(pav);
        for (var px = -1.6; px <= 1.6; px += 3.2) {
          var colm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), mats.steelLight);
          colm.position.set(pav.position.x + px, 1.3, pav.position.z);
          group.add(colm);
        }
      }
    }

    // --- tunnels ---
    var tunnelHere = forceTunnel === true || (chunkIndex >= 3 && rng.chance(0.16));
    if (tunnelHere) {
      var tun = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, L, 18, 1, true), mats.tunnel);
      tun.rotation.x = Math.PI / 2; tun.position.set(0, 3.4, -L / 2);
      group.add(tun);
      var port1 = tunnelPortal(mats); port1.position.z = 0.2; group.add(port1);
      var port2 = tunnelPortal(mats); port2.position.z = -L + 0.2; group.add(port2);
    }

    // --- obstacles ---
    var layout = genObstacles(chunkIndex, rng, difficulty01);
    for (var i = 0; i < layout.evs.length; i++) {
      var e = layout.evs[i];
      var m = null, hitMinY = 0, action = 'jump';
      if (e.kind === 'low') {
        m = root.Builders.barrier('low');
        hitMinY = 0.95; action = 'jump';
      } else if (e.kind === 'overhead') {
        m = root.Builders.barrier('roll');
        hitMinY = 1.35; action = 'roll';
      } else {
        m = root.Builders.barrier('block');
        hitMinY = 0; action = 'lane';
      }
      m.position.set(lanesArr()[e.lane], 0, -e.z);
      group.add(m);
      colliders.push({ x: lanesArr()[e.lane], z: -e.z, hw: 1.15, hz: 0.35, yMin: hitMinY, yMax: 99, action: action });
    }

    // --- parked trains (climbable) ---
    var trainChance = 0.34 + difficulty01 * 0.2;
    if (chunkIndex >= 2 && rng.chance(trainChance)) {
      var tlane = rng.int(0, 2);
      while (tlane === layout.safeLane && rng.chance(0.65)) tlane = rng.int(0, 2);
      var nCars = rng.int(2, 4);
      var tLen = nCars * (root.TrainLib.CAR_LEN + 0.6);
      var trainZ = -(rng.range(4, L - tLen - 6));
      var train = root.TrainLib.buildTrain(rng, mats, nCars, false);
      train.position.set(lanesArr()[tlane], 0, trainZ);
      group.add(train);
      colliders.push({
        x: lanesArr()[tlane], z: trainZ - tLen / 2, hw: 1.25, hz: tLen / 2,
        yMin: 0, yMax: 3.05, action: 'train', roofY: 3.62
      });
      if (rng.chance(0.75)) {
        for (var czi = 2; czi < tLen - 2; czi += 2.4) {
          coins.push({ x: lanesArr()[tlane], z: trainZ - czi, y: 4.6, type: 'coin' });
        }
      }
    }

    // --- moving train reservations (spawned & simulated by main) ---
    var movingReserve = chunkIndex >= 4 && rng.chance(0.22 + difficulty01 * 0.18);
    if (movingReserve) {
      trains.push({ lane: rng.int(0, 2), dir: rng.chance(0.5) ? 1 : -1, atZ: -rng.range(10, 40) });
    }

    // --- coins & collectibles ---
    var coinRows = 1 + (rng.next() * 2 | 0);
    for (i = 0; i < coinRows; i++) {
      var clane = rng.int(0, 2);
      var pattern = rng.next();
      if (pattern < 0.3) { // arc (encourages jumping)
        var zBase = rng.range(10, 44);
        for (var ai = 0; ai < 6; ai++) {
          coins.push({ x: lanesArr()[clane], z: -(zBase + ai * 2.2), y: 1.1 + Math.sin(ai / 5 * Math.PI) * 2.1, type: 'coin' });
        }
      } else {
        var zs = rng.range(8, 44);
        for (var ci = 0; ci < 7; ci++) coins.push({ x: lanesArr()[clane], z: -(zs + ci * 2.2), y: 1.1, type: 'coin' });
      }
    }
    if (rng.chance(0.18)) coins.push({ x: lanesArr()[rng.int(0, 2)], z: -rng.range(10, 50), y: 1.35, type: 'gem' });
    if (rng.chance(0.1)) coins.push({ x: lanesArr()[rng.int(0, 2)], z: -rng.range(10, 50), y: 2.2, type: 'star' });

    // --- powerup slots ---
    if (rng.chance(0.34)) powerups.push({ x: lanesArr()[rng.int(0, 2)], z: -rng.range(12, 48) });

    return {
      index: chunkIndex, group: group, biome: biome,
      colliders: colliders, coins: coins, powerups: powerups,
      movingTrains: trains, tunnel: tunnelHere
    };
  };

  function boxMesh(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
  function tunnelPortal(mats) {
    var g = new THREE.Group();
    var ring = new THREE.Mesh(new THREE.TorusGeometry(7.4, 1.1, 10, 22), mats.concrete);
    ring.position.y = 3.4; ring.rotation.y = Math.PI / 2;
    g.add(ring);
    var face = new THREE.Mesh(new THREE.CircleGeometry(7.4, 22), mats.concrete);
    face.position.set(0, 3.4, 0.02); face.rotation.y = Math.PI / 2;
    var hole = new THREE.Mesh(new THREE.CircleGeometry(6.6, 22), new THREE.MeshBasicMaterial({ color: 0x05070c }));
    hole.position.set(0, 3.4, 0.06); hole.rotation.y = Math.PI / 2;
    g.add(face); g.add(hole);
    return g;
  }
  CH.BIOMES = BIOMES;
  CH._genObstacles = genObstacles; // QA export: pure layout logic, no meshes
  root.Chunks = CH;
})(typeof window !== 'undefined' ? window : globalThis);
