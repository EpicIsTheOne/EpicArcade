// Environment: sky dome, sun, hemisphere fill, PMREM reflections, skyline ring, clouds.
(function (root) {
  function buildEnv(scene, renderer, mats) {
    var E = {};
    // sky dome
    var skyGeo = new THREE.SphereGeometry(400, 24, 16);
    var skyMat = new THREE.MeshBasicMaterial({ map: root.Tex.sky, side: THREE.BackSide, depthWrite: false, fog: false });
    E.sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(E.sky);
    // sun glow sprite
    var sc = document.createElement('canvas'); sc.width = 128; sc.height = 128;
    var sg = sc.getContext('2d');
    var grd = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,244,214,1)');
    grd.addColorStop(0.25, 'rgba(255,214,140,.85)');
    grd.addColorStop(1, 'rgba(255,190,110,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
    var sunMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, fog: false });
    E.sunSprite = new THREE.Sprite(sunMat);
    E.sunSprite.scale.set(120, 120, 1);
    scene.add(E.sunSprite);
    // lights (tuned to avoid overexposure with ACES + bloom)
    E.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x545266, 0.55);
    scene.add(E.hemi);
    E.sun = new THREE.DirectionalLight(0xffe2b0, 1.2);
    E.sun.position.set(-38, 58, 30);
    E.sun.castShadow = true;
    E.sun.shadow.mapSize.set(2048, 2048);
    E.sun.shadow.camera.left = -34; E.sun.shadow.camera.right = 34;
    E.sun.shadow.camera.top = 42; E.sun.shadow.camera.bottom = -30;
    E.sun.shadow.camera.near = 8; E.sun.shadow.camera.far = 170;
    E.sun.shadow.bias = -0.0006;
    scene.add(E.sun);
    scene.add(E.sun.target);
    E.amb = new THREE.AmbientLight(0x36404f, 0.32);
    scene.add(E.amb);
    // environment map for PBR reflections: tiny gradient room
    try {
      var pm = new THREE.PMREMGenerator(renderer);
      pm.compileEquirectangularShader();
      var es = new THREE.Scene();
      var room = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12),
        new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
      // paint via vertex colors: sky above, warm ground below
      var cols = [], posA = room.geometry.attributes.position;
      var top = new THREE.Color(0x9fc4ff), mid = new THREE.Color(0xe8d8b8), bot = new THREE.Color(0x5a5648);
      for (var i = 0; i < posA.count; i++) {
        var y = posA.getY(i) / 20;
        var c = y > 0.1 ? top.clone().lerp(mid, Math.max(0, 1 - y)) : mid.clone().lerp(bot, Math.min(1, -y * 2));
        cols.push(c.r, c.g, c.b);
      }
      room.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      room.material.vertexColors = true;
      es.add(room);
      // bright panels = fake windows/sun
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
        new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
      panel.position.set(-8, 8, 6); panel.lookAt(0, 0, 0); es.add(panel);
      var panel2 = panel.clone(); panel2.position.set(9, 3, -7); panel2.material = new THREE.MeshBasicMaterial({ color: 0xbfdcff });
      es.add(panel2);
      E.envRT = pm.fromScene(es, 0.04);
      scene.environment = E.envRT.texture;
      pm.dispose();
    } catch (e) { root.SRLog('envmap skip: ' + e.message); }
    // distant skyline ring + clouds follow the player (parallax backdrop)
    E.backdrop = new THREE.Group();
    var rng = new root.RngLib.RNG(424242);
    for (var b = 0; b < 26; b++) {
      var ang = (b / 26) * Math.PI * 2;
      var dist = rng.range(130, 210);
      var h = rng.range(30, 110);
      var bw = rng.range(14, 30);
      var sil = new THREE.Mesh(
        new THREE.BoxGeometry(bw, h, bw),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.6 + rng.range(-0.04, 0.04), 0.32, rng.range(0.38, 0.55)),
          emissive: 0x1a2440, emissiveIntensity: 0.35, roughness: 0.9
        }));
      sil.position.set(Math.cos(ang) * dist, h / 2 - 8, Math.sin(ang) * dist);
      E.backdrop.add(sil);
    }
    // clouds
    var cc = document.createElement('canvas'); cc.width = 256; cc.height = 128;
    var cg = cc.getContext('2d');
    for (var p = 0; p < 26; p++) {
      var cx = 30 + Math.random() * 196, cy = 44 + Math.random() * 44, r = 12 + Math.random() * 26;
      var cgd = cg.createRadialGradient(cx, cy, 2, cx, cy, r);
      cgd.addColorStop(0, 'rgba(255,255,255,.85)');
      cgd.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = cgd;
      cg.beginPath(); cg.arc(cx, cy, r, 0, 7); cg.fill();
    }
    var cloudTex = new THREE.CanvasTexture(cc);
    E.clouds = [];
    for (var cl = 0; cl < 8; cl++) {
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
      var a2 = rng.range(0, Math.PI * 2), d2 = rng.range(150, 260);
      spr.position.set(Math.cos(a2) * d2, rng.range(48, 96), Math.sin(a2) * d2);
      spr.scale.set(rng.range(70, 130), rng.range(24, 44), 1);
      E.clouds.push(spr); E.backdrop.add(spr);
    }
    scene.add(E.backdrop);
    // per-frame follow
    E.follow = function (playerPos, t) {
      E.sky.position.set(playerPos.x, 0, playerPos.z);
      E.backdrop.position.z = playerPos.z;
      E.backdrop.position.x = playerPos.x * 0.2;
      E.sunSprite.position.set(playerPos.x - 160, 105, playerPos.z - 210);
      E.sun.target.position.set(playerPos.x, 0, playerPos.z - 12);
      E.sun.position.set(playerPos.x - 38, 58, playerPos.z + 30);
      for (var i = 0; i < E.clouds.length; i++) {
        E.clouds[i].position.x += Math.sin(t * 0.02 + i) * 0.01;
      }
    };
    root.EnvHandle = E;
    return E;
  }
  root.BuildEnv = buildEnv;
})(typeof window !== 'undefined' ? window : globalThis);
