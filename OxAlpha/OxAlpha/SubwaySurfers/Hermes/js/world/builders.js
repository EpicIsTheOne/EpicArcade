// Geometry builders: rails, platforms, buildings, props. Pure functions -> BufferGeometry/Mesh.
(function (root) {
  var B = {};
  function box(w, h, d, mat) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); return m; }
  function cyl(rt, rb, h, mat, seg) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat); }

  // One rail pair segment (two I-beam-ish bars) length L along -Z
  B.railPair = function (mat, L) {
    var g = new THREE.Group();
    var r1 = box(0.14, 0.16, L, mat); r1.position.set(-0.75, 0.22, 0);
    var r2 = box(0.14, 0.16, L, mat); r2.position.set(0.75, 0.22, 0);
    g.add(r1); g.add(r2);
    return g;
  };
  // Sleeper row
  B.sleeper = function (mat) { return box(2.3, 0.1, 0.55, mat); };
  // Platform slab (station edge), width w along X, length L along Z, top at y=1.1
  B.platform = function (w, L, mat, tactileMat) {
    var g = new THREE.Group();
    var slab = box(w, 1.1, L, mat); slab.position.y = 0.55; g.add(slab);
    var strip = box(0.8, 0.04, L, tactileMat || root.Mats.tactile); strip.position.set(w / 2 > 0 ? -w / 2 + 0.5 : w / 2 - 0.5, 1.12, 0); strip.position.x = -(Math.sign(w) * (w / 2 - 0.45)); g.add(strip);
    var face = box(Math.abs(w), 1.06, L, root.Mats.concrete); face.position.set(w / 2, 0.53, 0); face.scale.x = 0.999; g.add(face);
    return g;
  };
  B.lampPost = function () {
    var g = new THREE.Group();
    var pole = cyl(0.05, 0.07, 4.4, root.Mats.steelDark, 8); pole.position.y = 2.2; g.add(pole);
    var arm = box(1.15, 0.07, 0.07, root.Mats.steelDark); arm.position.set(0.5, 4.35, 0); g.add(arm);
    var lampM = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffdf9e, emissiveIntensity: 1.6 });
    var lamp = box(0.5, 0.09, 0.22, lampM); lamp.position.set(1.0, 4.28, 0); g.add(lamp);
    return g;
  };
  B.signalLight = function (state) {
    var g = new THREE.Group();
    var pole = cyl(0.05, 0.06, 3.1, root.Mats.steelDark, 8); pole.position.y = 1.55; g.add(pole);
    var headBox = box(0.34, 1.0, 0.24, root.Mats.steelDark); headBox.position.y = 3.2; g.add(headBox);
    var mk = function (col, y, on) {
      var m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: on ? 2.6 : 0.12 });
      return new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), m);
    };
    var red = mk(0xff3040, 3.42, state === 'red'); red.position.z = 0.13;
    var grn = mk(0x30ff70, 3.18, state === 'green'); grn.position.z = 0.13;
    var amb = mk(0xffb020, 2.94, state === 'amber'); amb.position.z = 0.13;
    g.add(red); g.add(grn); g.add(amb);
    return g;
  };
  // City building with setback tiers. Returns group; footprint ~w x d.
  B.building = function (rng, w, d, h, mats) {
    var g = new THREE.Group();
    var mat = rng.chance(0.5) ? mats.facadeA : mats.facadeB;
    var tiers = 1 + ((h > 26 && rng.chance(0.7)) ? 1 : 0) + ((h > 40 && rng.chance(0.5)) ? 1 : 0);
    var tw = w, td = d, ty = 0;
    for (var i = 0; i < tiers; i++) {
      var th = h * (i === tiers - 1 ? 0.35 : (0.65 / Math.max(1, tiers - 1)));
      if (i === tiers - 1 && tiers > 1) th = h - ty;
      var b = box(tw, th, td, mat);
      b.position.y = ty + th / 2;
      g.add(b);
      // rooftop lip + AC boxes
      var lip = box(tw + 0.3, 0.35, td + 0.3, mats.steelDark); lip.position.y = ty + th + 0.17; g.add(lip);
      if (rng.chance(0.8)) {
        var ac = box(rng.range(1, 2.4), 0.9, rng.range(1, 2), mats.steelLight);
        ac.position.set(rng.range(-tw / 3, tw / 3), ty + th + 0.45, rng.range(-td / 3, td / 3));
        g.add(ac);
      }
      if (i === tiers - 1 && rng.chance(0.55) && h > 20) {
        var mast = cyl(0.05, 0.05, rng.range(2.5, 5), mats.steelDark, 6);
        mast.position.set(0, ty + th + 1.6, 0); g.add(mast);
        var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xff4060, emissive: 0xff2040, emissiveIntensity: 2.5 }));
        beacon.position.set(0, ty + th + 3.1, 0); g.add(beacon);
        g.userData.beacon = beacon;
      }
      ty += th;
      tw *= rng.range(0.62, 0.82); td *= rng.range(0.62, 0.82);
    }
    return g;
  };
  // Billboard on poles
  B.billboard = function (mat) {
    var g = new THREE.Group();
    var p1 = cyl(0.09, 0.11, 3.4, root.Mats.steelDark, 8); p1.position.set(-1.6, 1.7, 0);
    var p2 = p1.clone(); p2.position.x = 1.6;
    g.add(p1); g.add(p2);
    var panel = box(4.4, 2.2, 0.14, mat); panel.position.y = 4.2; g.add(panel);
    var rim = box(4.55, 2.35, 0.1, root.Mats.steelDark); rim.position.set(0, 4.2, -0.03); g.add(rim);
    return g;
  };
  // Tree (stylized cone/sphere mix)
  B.tree = function (rng) {
    var g = new THREE.Group();
    var trunk = cyl(0.09, 0.13, 1.3, new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }), 7);
    trunk.position.y = 0.65; g.add(trunk);
    var leafMat = new THREE.MeshStandardMaterial({ color: rng.chance(0.5) ? 0x3fae5c : 0x63c04f, roughness: 0.95 });
    var n = 2 + (rng.next() * 2 | 0);
    for (var i = 0; i < n; i++) {
      var s = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(0.5, 0.85), 0), leafMat);
      s.position.set(rng.range(-0.25, 0.25), 1.4 + i * 0.55, rng.range(-0.25, 0.25));
      g.add(s);
    }
    return g;
  };
  // Construction barrier (jump-over or full block variants)
  B.barrier = function (kind) {
    var g = new THREE.Group();
    if (kind === 'low') { // jump over: hazard board low
      var bd = box(2.5, 0.85, 0.18, root.Mats.hazard); bd.position.y = 0.48; g.add(bd);
      var f1 = box(0.12, 0.5, 0.4, root.Mats.steelDark); f1.position.set(-1.05, 0.25, 0);
      var f2 = f1.clone(); f2.position.x = 1.05; g.add(f1); g.add(f2);
    } else if (kind === 'roll') { // roll under: overhead beam with legs
      var beam = box(2.5, 0.5, 0.3, root.Mats.hazard); beam.position.y = 1.85; g.add(beam);
      var l1 = box(0.14, 1.9, 0.2, root.Mats.steelDark); l1.position.set(-1.18, 0.95, 0);
      var l2 = l1.clone(); l2.position.x = 1.18; g.add(l1); g.add(l2);
      var sign = box(1.1, 0.32, 0.06, root.Mats.metalWall); sign.position.y = 1.32; g.add(sign);
    } else if (kind === 'block') { // must change lane: tall barricade
      var wall = box(2.5, 2.3, 0.3, root.Mats.hazard); wall.position.y = 1.15; g.add(wall);
      var b1 = box(0.16, 1.1, 0.44, root.Mats.steelDark); b1.position.set(-1.1, 0.55, 0);
      var b2 = b1.clone(); b2.position.x = 1.1; g.add(b1); g.add(b2);
    } else if (kind === 'trainSide') { // small track-side bumper
      var bb = box(0.9, 0.75, 0.9, root.Mats.crate); bb.position.y = 0.38; g.add(bb);
    }
    return g;
  };
  // Fence run segment
  B.fenceSeg = function (L, mat) {
    var g = new THREE.Group();
    var panel = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.8), mat || root.Mats.fenceMat);
    panel.position.y = 0.9; g.add(panel);
    for (var x = -L / 2; x <= L / 2 + 0.01; x += 3) {
      var post = box(0.09, 1.9, 0.09, root.Mats.steelDark); post.position.set(x, 0.95, 0.02); g.add(post);
    }
    return g;
  };
  // Parked car (distant street dressing)
  B.car = function (rng, mats) {
    var g = new THREE.Group();
    var col = [0xd84a4a, 0x4a7dd8, 0xe8e8ea, 0x38b06a, 0xe8b23c][rng.int(0, 4)];
    var body = box(1.75, 0.55, 3.9, std(col)); body.position.y = 0.55;
    var cabin = box(1.55, 0.5, 1.9, mats.glass); cabin.position.set(0, 1.05, -0.15);
    g.add(body); g.add(cabin);
    [[-0.78, 1.3], [0.78, 1.3], [-0.78, -1.3], [0.78, -1.3]].forEach(function (p) {
      var wheel = cyl(0.3, 0.3, 0.22, mats.trainUnder, 10);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(p[0], 0.3, p[1]); g.add(wheel);
    });
    return g;
    function std(c) { return new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.4 }); }
  };
  root.Builders = B;
})(typeof window !== 'undefined' ? window : globalThis);
