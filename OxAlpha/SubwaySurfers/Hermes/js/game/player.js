// Player: articulated original character "Nova" + procedural animation state machine.
(function (root) {
  var P = {};

  P.build = function (mats, palette) {
    palette = palette || {};
    var skin = mats.skin, jacket = palette.jacket || mats.jacket,
        pants = palette.pants || mats.pants, hair = palette.hair || mats.hair,
        shoe = mats.shoe;
    var g = new THREE.Group();
    var parts = {};

    // torso: tapered chest
    var torso = new THREE.Group();
    var chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.3), jacket);
    chest.position.y = 1.32; torso.add(chest);
    var belly = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.26), jacket);
    belly.position.y = 1.02; torso.add(belly);
    // backpack
    var pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.16), palette.pack || mats.pants);
    pack.position.set(0, 1.22, -0.22); torso.add(pack);
    g.add(torso); parts.torso = torso;

    // head + hair + visor
    var head = new THREE.Group();
    head.position.y = 1.62;
    var skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), skin);
    skull.position.y = 0.15; head.add(skull);
    var hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.32), hair);
    hairTop.position.y = 0.31; head.add(hairTop);
    var hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.1), hair);
    hairBack.position.set(0, 0.08, -0.15); head.add(hairBack);
    // ponytail
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), hair);
    tail.position.set(0, -0.05, -0.2); tail.rotation.x = 0.25;
    var tailPivot = new THREE.Group(); tailPivot.position.set(0, 0.25, -0.18);
    tailPivot.add(tail); head.add(tailPivot);
    parts.tailPivot = tailPivot;
    // visor glow strip
    var visorMat = new THREE.MeshStandardMaterial({ color: 0x66eaff, emissive: 0x2fd4ff, emissiveIntensity: 1.6, roughness: 0.2 });
    var visor = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.07, 0.06), visorMat);
    visor.position.set(0, 0.17, 0.15); head.add(visor);
    g.add(head); parts.head = head; parts.visorMat = visorMat;

    // arms with shoulder pivots
    function arm(side) {
      var shoulder = new THREE.Group();
      shoulder.position.set(side * 0.33, 1.44, 0);
      var upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.15), jacket);
      upper.position.y = -0.18; shoulder.add(upper);
      var fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.32, 0.12), skin);
      fore.position.y = -0.5; shoulder.add(fore);
      var hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.11), skin);
      hand.position.y = -0.71; shoulder.add(hand);
      return shoulder;
    }
    var armL = arm(-1), armR = arm(1);
    g.add(armL); g.add(armR); parts.armL = armL; parts.armR = armR;

    // legs with hip pivots
    function leg(side) {
      var hip = new THREE.Group();
      hip.position.set(side * 0.14, 0.88, 0);
      var thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.42, 0.19), pants);
      thigh.position.y = -0.21; hip.add(thigh);
      var shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.16), pants);
      shin.position.y = -0.62; hip.add(shin);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), shoe);
      foot.position.set(0, -0.86, 0.05); hip.add(foot);
      return hip;
    }
    var legL = leg(-1), legR = leg(1);
    g.add(legL); g.add(legR); parts.legL = legL; parts.legR = legR;

    parts.root = g;
    return parts;
  };

  // Animation driver: pose from state each frame. t = anim time.
  P.animate = function (p, st) {
    // st: {state, t, speedNorm(0..1), lean, rollT, vy, board}
    var run = st.speedNorm * 1.6 + 9.5;   // stride frequency rad/s
    if (st.state === 'run') {
      var s = Math.sin(st.t * run), c = Math.cos(st.t * run);
      p.legL.rotation.x = s * 0.95; p.legR.rotation.x = -s * 0.95;
      p.armL.rotation.x = -s * 0.85; p.armR.rotation.x = s * 0.85;
      p.armL.rotation.z = 0.12; p.armR.rotation.z = -0.12;
      p.torso.rotation.x = 0.16 + Math.abs(s) * 0.04;
      p.torso.rotation.y = s * 0.09;
      p.head.rotation.x = -0.1;
      p.tailPivot.rotation.x = 0.35 + s * 0.12;
      p.root.position.y = Math.abs(c) * 0.05;
      p.root.rotation.z = -st.lean * 0.45;
    } else if (st.state === 'jump' || st.state === 'fall') {
      var rising = st.vy > 0;
      p.legL.rotation.x = rising ? -0.9 : -0.35; p.legR.rotation.x = rising ? 0.55 : 0.2;
      p.armL.rotation.x = rising ? -2.6 : -0.8; p.armR.rotation.x = rising ? -2.6 : -0.8;
      p.torso.rotation.x = rising ? 0.1 : 0.24;
      p.tailPivot.rotation.x = rising ? 0.7 : 0.3;
      p.root.rotation.z = -st.lean * 0.5;
      p.root.position.y = 0;
    } else if (st.state === 'roll') {
      var rt = Math.min(1, st.rollT / 0.62);
      p.torso.rotation.x = 1.15;
      p.head.rotation.x = 0.5;
      p.legL.rotation.x = -1.5; p.legR.rotation.x = -1.3;
      p.armL.rotation.x = 0.6; p.armR.rotation.x = 0.6;
      p.root.position.y = -0.55 + rt * 0.0;
      p.root.rotation.z = -st.lean * 0.3;
    } else if (st.state === 'stumble') {
      var w = Math.sin(st.t * 30) * 0.25 * (1 - Math.min(1, st.stumbleT));
      p.torso.rotation.x = 0.5 + w; p.torso.rotation.y = w;
      p.armL.rotation.x = -1.2; p.armR.rotation.x = 0.9;
      p.legL.rotation.x = -0.5; p.legR.rotation.x = 0.6;
      p.root.rotation.z = w * 0.6;
    } else if (st.state === 'crash') {
      p.torso.rotation.x = -0.6; p.head.rotation.x = -0.4;
      p.armL.rotation.x = -2.8; p.armR.rotation.x = -2.8;
      p.legL.rotation.x = -0.4; p.legR.rotation.x = 0.9;
    } else if (st.state === 'idle') {
      var b = Math.sin(st.t * 2.2) * 0.03;
      p.torso.rotation.x = 0.04 + b; p.armL.rotation.x = b; p.armR.rotation.x = -b;
      p.legL.rotation.x = 0; p.legR.rotation.x = 0;
      p.root.rotation.z = 0; p.root.position.y = 0;
    }
    // hoverboard stance overrides legs when boarding
    if (st.board && st.state !== 'crash') {
      p.legL.rotation.x = -0.5; p.legR.rotation.x = 0.35;
      p.legL.rotation.z = 0.18; p.legR.rotation.z = -0.1;
      p.torso.rotation.x = 0.22;
      p.armL.rotation.x = -0.4; p.armR.rotation.x = -0.7;
    } else {
      p.legL.rotation.z = 0; p.legR.rotation.z = 0;
    }
  };

  // Runner palettes / outfits
  P.RUNNERS = {
    nova: { name: 'Nova', desc: 'Courier of the Upper Lines. Balanced, fearless.', jacket: null, price: 0 },
    ember: { name: 'Ember', desc: 'Sunset district parkour legend.', jacket: 0xff7043, price: 900, pack: 0xbf360c },
    volt: { name: 'Volt', desc: 'Grid-runner with static in her step.', jacket: 0xd4ff3f, price: 1800, pack: 0x76a300 },
    frost: { name: 'Frost', desc: 'Came down from the North Line.', jacket: 0xb3e5fc, price: 3200, pack: 0x4a90a4, hair: 0xeaf6ff },
    onyx: { name: 'Onyx', desc: 'Night-shift courier. Nobody sees her pass.', jacket: 0x37474f, price: 5200, pack: 0x11141a, hair: 0x0d0d12 }
  };
  root.PlayerLib = P;
})(typeof window !== 'undefined' ? window : globalThis);
