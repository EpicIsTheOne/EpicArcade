// Chaser: "Dawn Patrol" warden drone + handler. Gains on stumbles, catches at 0.
(function (root) {
  var C = {};
  C.build = function (mats) {
    var g = new THREE.Group();
    // hovering pursuit drone
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.3), mats.chaserBody);
    body.position.y = 1.4; g.add(body);
    var visor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2.2 }));
    visor.position.set(0, 1.5, 0.62); g.add(visor);
    for (var s = -1; s <= 1; s += 2) {
      var pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10), mats.steelDark);
      pod.rotation.z = Math.PI / 2; pod.position.set(s * 0.75, 1.45, -0.1); g.add(pod);
      var glow = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10), mats.taillight);
      glow.rotation.z = Math.PI / 2; glow.position.set(s * 0.75, 1.45, -0.6); g.add(glow);
    }
    var light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd8e8ff, emissiveIntensity: 2 }));
    light.position.set(0, 1.75, 0.3); g.add(light);
    g.userData.light = light;
    return g;
  };
  // Handler running behind the drone (visible at intro / catch)
  C.buildHandler = function (mats) {
    var g = new THREE.Group();
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.36), mats.chaserBody);
    torso.position.y = 1.25; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), mats.steelDark);
    head.position.y = 1.85; g.add(head);
    var capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.18), mats.chaserAccent);
    capBrim.position.set(0, 1.98, 0.2); g.add(capBrim);
    for (var s = -1; s <= 1; s += 2) {
      var legP = new THREE.Group(); legP.position.set(s * 0.16, 0.88, 0);
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.85, 0.2), mats.pants);
      leg.position.y = -0.43; legP.add(leg); g.add(legP);
      g.userData['leg' + (s > 0 ? 'R' : 'L')] = legP;
      var armP = new THREE.Group(); armP.position.set(s * 0.38, 1.55, 0);
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.65, 0.17), mats.chaserBody);
      arm.position.y = -0.33; armP.add(arm); g.add(armP);
      g.userData['arm' + (s > 0 ? 'R' : 'L')] = armP;
    }
    return g;
  };
  root.ChaserLib = C;
})(typeof window !== 'undefined' ? window : globalThis);
