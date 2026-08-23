// Trains: parked (ride-on-top) and moving (toward/away). Mesh factory + logic.
(function (root) {
  var T = {};
  var CAR_LEN = 16, CAR_W = 2.6, CAR_H = 3.0, GAP = 0.6;
  T.CAR_LEN = CAR_LEN;

  // One car mesh. roofWalk=true adds a low center ridge you can run on.
  T.carMesh = function (rng, mats) {
    var g = new THREE.Group();
    var bodyMat = [mats.trainBodyA, mats.trainBodyB, mats.trainBodyC][rng.int(0, 2)];
    var body = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, CAR_H * 0.72, CAR_LEN - 0.5), bodyMat);
    body.position.y = 1.05 + CAR_H * 0.36; g.add(body);
    // rounded roof cap
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(CAR_W / 2, CAR_W / 2, CAR_LEN - 0.5, 14, 1, false, 0, Math.PI), bodyMat);
    roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI / 2;
    roof.position.y = 1.05 + CAR_H * 0.72; roof.scale.y = 0.35; // wait: cylinder axis Y->rotated to Z
    g.add(roof);
    // underframe
    var under = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.4, 0.75, CAR_LEN - 1), mats.trainUnder);
    under.position.y = 0.62; g.add(under);
    // bogies + wheels
    for (var s = -1; s <= 1; s += 2) {
      for (var w = -1; w <= 1; w += 2) {
        var wx = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 10), mats.trainUnder);
        wx.rotation.z = Math.PI / 2; wx.position.set(w * 0.95, 0.42, s * (CAR_LEN / 2 - 2.4));
        g.add(wx);
      }
    }
    // window band
    var band = new THREE.Mesh(new THREE.BoxGeometry(CAR_W + 0.03, 0.85, CAR_LEN - 3.4), mats.trainGlass);
    band.position.y = 2.28; g.add(band);
    // doors
    for (var d = -1; d <= 1; d += 2) {
      var door = new THREE.Mesh(new THREE.BoxGeometry(CAR_W + 0.06, 1.7, 1.15), mats.grille);
      door.position.set(0, 1.55, d * 4.6); g.add(door);
    }
    // roof walkway ridge (visual cue for train-top running)
    var ridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, CAR_LEN - 3), mats.steelLight);
    ridge.position.y = 1.05 + CAR_H * 0.72 + 0.30; g.add(ridge);
    return g;
  };

  // Front cab with lights
  T.cabMesh = function (rng, mats, dir) {
    var g = new THREE.Group();
    var bodyMat = [mats.trainBodyA, mats.trainBodyB, mats.trainBodyC][rng.int(0, 2)];
    var body = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, CAR_H * 0.8, 3.4), bodyMat);
    body.position.set(0, 2.1, dir * 1.2); g.add(body);
    var nose = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.3, CAR_H * 0.55, 1.2), bodyMat);
    nose.position.set(0, 1.85, dir * 3.3); nose.rotation.x = dir * -0.18; g.add(nose);
    var win = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.6, 0.9, 0.2), mats.trainGlass);
    win.position.set(0, 2.75, dir * 2.92); win.rotation.x = dir * -0.18; g.add(win);
    var lm = dir > 0 ? mats.headlight : mats.taillight;
    for (var s = -1; s <= 1; s += 2) {
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), lm);
      lamp.position.set(s * 0.8, 1.5, dir * 3.85); g.add(lamp);
    }
    var skirt = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.2, 0.5, 2.6), mats.grille);
    skirt.position.set(0, 0.95, dir * 2.2); g.add(skirt);
    return g;
  };

  // Build a full train: n cars + optional cab at each end.
  T.buildTrain = function (rng, mats, nCars, cabs) {
    var g = new THREE.Group();
    for (var i = 0; i < nCars; i++) {
      var car = T.carMesh(rng, mats);
      car.position.z = -(i * (CAR_LEN + GAP));
      g.add(car);
    }
    if (cabs) {
      var front = T.cabMesh(rng, mats, 1); front.position.z = 3.2; g.add(front);
      var back = T.cabMesh(rng, mats, -1); back.position.z = -(nCars * (CAR_LEN + GAP)) + 0.4; g.add(back);
    }
    g.userData.length = nCars * (CAR_LEN + GAP) + (cabs ? 6 : 0);
    return g;
  };
  root.TrainLib = T;
})(typeof window !== 'undefined' ? window : globalThis);
