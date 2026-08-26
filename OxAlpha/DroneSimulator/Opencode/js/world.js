(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const U = DS.util;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  const HILLS = [
    { x: 0, z: 34, s: 20, a: 6.5 },
    { x: 74, z: -64, s: 26, a: 9 },
    { x: -64, z: -52, s: 22, a: 6 },
    { x: -108, z: 14, s: 30, a: 13 },
    { x: 44, z: 96, s: 24, a: 8 },
    { x: 118, z: 36, s: 34, a: 16 },
    { x: -150, z: -160, s: 60, a: 30 },
    { x: 170, z: 150, s: 70, a: 36 },
    { x: 210, z: -140, s: 65, a: 40 },
    { x: -230, z: 120, s: 70, a: 42 },
    { x: 0, z: -240, s: 80, a: 34 },
    { x: -190, z: -40, s: 55, a: 26 },
    { x: 250, z: 60, s: 75, a: 44 }
  ];
  const LAKE = { x: -135, z: -125, r: 46 };
  const PAD_R = 15;
  const COURSE = [
    [0, -16], [0, -40], [26, -62], [52, -52], [66, -26], [56, 4],
    [30, 26], [0, 38], [-30, 24], [-52, -2], [-36, -28], [-18, -56]
  ];

  function terrainH(x, z) {
    let h = 0;
    for (let i = 0; i < HILLS.length; i++) {
      const g = HILLS[i];
      const dx = x - g.x, dz = z - g.z;
      h += g.a * Math.exp(-(dx * dx + dz * dz) / (2 * g.s * g.s));
    }
    const pd = Math.hypot(x, z);
    if (pd < PAD_R + 6) h *= U.smoothstep(pd, PAD_R, PAD_R + 6);
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r + 14) h = U.lerp(-1.1, h, U.smoothstep(ld, LAKE.r - 8, LAKE.r + 14));
    return h;
  }

  const World = {
    colliders: [],
    _anim: [],
    boundaryR: 260,

    addSphereCollider(x, y, z, r) { this.colliders.push({ type: "s", c: V3(x, y, z), r }); },
    addBoxCollider(cx, cy, cz, sx, sy, sz) {
      this.colliders.push({
        type: "b",
        min: V3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
        max: V3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
      });
    },

    build(scene) {
      this.rng = U.mulberry32(20260826);
      this._ground(scene);
      this._water(scene);
      this._helipad(scene);
      this._trees(scene);
      this._rocks(scene);
      this._buildings(scene);
      this._tower(scene);
      this._windmills(scene);
      this._balloon(scene);
      this._clouds(scene);
      this._rangeRing(scene);
    },

    _ground(scene) {
      const SIZE = 900, SEG = 150;
      const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const cA = new THREE.Color(0x57813f), cB = new THREE.Color(0x47703a), cDry = new THREE.Color(0x7d8a4c), cRock = new THREE.Color(0x7d7f72);
      const tmp = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = terrainH(x, z);
        pos.setY(i, h);
        const n = Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.13 - x * 0.05);
        tmp.copy(cA).lerp(cB, (n + 1) / 2);
        tmp.lerp(cDry, U.smoothstep(n, 0.55, 0.95) * 0.55);
        if (h > 9) tmp.lerp(cRock, U.smoothstep(h, 9, 26) * 0.85);
        const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
        if (ld < LAKE.r + 10) tmp.lerp(new THREE.Color(0x9a8a63), U.smoothstep(ld, LAKE.r - 4, LAKE.r + 10) === 0 ? 0 : 0);
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);
    },

    _water(scene) {
      const geo = new THREE.CircleGeometry(LAKE.r - 1, 48);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshPhongMaterial({
        color: 0x1f6f9e, specular: 0xbfe8ff, shininess: 110, transparent: true, opacity: 0.92
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(LAKE.x, -0.35, LAKE.z);
      scene.add(m);
    },

    _helipad(scene) {
      const tex = U.helipadTexture();
      const geo = new THREE.CircleGeometry(PAD_R - 1.2, 40);
      geo.rotateX(-Math.PI / 2);
      const pad = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
      pad.position.y = 0.04;
      pad.receiveShadow = true;
      scene.add(pad);

      const ringGeo = new THREE.RingGeometry(PAD_R + 0.4, PAD_R + 0.85, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const lightsMat = new THREE.MeshBasicMaterial({ color: 0x59e0ff });
      scene.add(new THREE.Mesh(ringGeo, lightsMat));

      const dotGeo = new THREE.SphereGeometry(0.18, 8, 8);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const d = new THREE.Mesh(dotGeo, lightsMat);
        d.position.set(Math.cos(a) * (PAD_R + 0.6), 0.25, Math.sin(a) * (PAD_R + 0.6));
        scene.add(d);
      }

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8),
        new THREE.MeshLambertMaterial({ color: 0x9aa3ab })
      );
      pole.position.set(PAD_R - 2.5, 2.2, PAD_R - 4);
      pole.castShadow = true;
      scene.add(pole);
      const sock = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 1.5, 8),
        new THREE.MeshLambertMaterial({ color: 0xff7b2e })
      );
      sock.rotation.z = Math.PI / 2;
      sock.position.set(pole.position.x + 0.8, 4.1, pole.position.z);
      sock.castShadow = true;
      scene.add(sock);
      this._anim.push((t, dt) => {
        sock.rotation.y = Math.sin(t * 0.7) * 0.35 + 0.4;
        sock.rotation.x = 0.12 + Math.sin(t * 2.1) * 0.06;
      });
    },

    _courseClear(px, pz) {
      if (Math.hypot(px, pz) < PAD_R + 4) return false;
      const ld = Math.hypot(px - LAKE.x, pz - LAKE.z);
      if (ld < LAKE.r + 6) return false;
      for (let i = 0; i < COURSE.length - 1; i++) {
        const a = COURSE[i], b = COURSE[i + 1];
        if (U.segDist(px, pz, a[0], a[1], b[0], b[1]) < 13) return false;
      }
      return true;
    },

    _trees(scene) {
      const N = 170;
      const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 1.5, 6);
      trunkGeo.translate(0, 0.75, 0);
      const foliGeo = new THREE.ConeGeometry(1.35, 3.4, 7);
      foliGeo.translate(0, 3.0, 0);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
      const foliMat = new THREE.MeshLambertMaterial({ color: 0x2f6b33 });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
      const folis = new THREE.InstancedMesh(foliGeo, foliMat, N);
      trunks.castShadow = folis.castShadow = true;
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
      let placed = 0, tries = 0;
      while (placed < N && tries < 2200) {
        tries++;
        const a = this.rng() * Math.PI * 2;
        const r = 20 + Math.pow(this.rng(), 0.7) * 230;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        if (!this._courseClear(px, pz)) continue;
        const h = terrainH(px, pz);
        if (h < -0.5) continue;
        const s = 0.8 + this.rng() * 1.1;
        Q.setFromAxisAngle(V3(0, 1, 0), this.rng() * Math.PI * 2);
        S.set(s, s, s); P.set(px, h, pz);
        M.compose(P, Q, S);
        trunks.setMatrixAt(placed, M);
        folis.setMatrixAt(placed, M);
        this.addSphereCollider(px, h + 0.8 * s, pz, 0.45 * s);
        placed++;
      }
      trunks.count = folis.count = placed;
      scene.add(trunks); scene.add(folis);
    },

    _rocks(scene) {
      const spots = [[36, -30, 2.2], [-14, 46, 1.8], [58, 18, 2.6], [-44, 14, 2.0], [16, 54, 1.6], [-24, -44, 2.4], [82, 8, 3.1], [-70, -28, 2.7]];
      const geo = new THREE.DodecahedronGeometry(1, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0x83857c, flatShading: true });
      for (const [x, z, r] of spots) {
        const h = terrainH(x, z);
        const m = new THREE.Mesh(geo, mat);
        m.scale.setScalar(r);
        m.position.set(x, h + r * 0.45, z);
        m.rotation.set(this.rng() * 3, this.rng() * 6, this.rng() * 3);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
        this.addSphereCollider(x, h + r * 0.5, z, r * 0.92);
      }
    },

    _buildings(scene) {
      const rng = this.rng;
      const defs = [
        [30, 62, 10, 9, 10], [44, 64, 12, 16, 12], [58, 60, 9, 22, 9],
        [33, 76, 13, 12, 11], [49, 79, 11, 19, 11], [63, 74, 10, 14, 10],
        [22, 50, 8, 7, 8], [72, 86, 14, 11, 12]
      ];
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a6570 });
      for (const [bx, bz, sw, sh, sd] of defs) {
        const winTex = U.windowsTexture(rng);
        winTex.repeat.set(Math.max(1, Math.round(sw / 4)), Math.max(1, Math.round(sh / 3)));
        const wallMat = new THREE.MeshLambertMaterial({ map: winTex });
        const mats = [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat];
        const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mats);
        const gy = terrainH(bx, bz);
        m.position.set(bx, gy + sh / 2 - 0.3, bz);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
        this.addBoxCollider(bx, gy + sh / 2, bz, sw, sh, sd);
      }
    },

    _tower(scene) {
      const g = new THREE.Group();
      const bandTex = U.towerBandTexture();
      const s1 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 22, 10), new THREE.MeshLambertMaterial({ map: bandTex }));
      s1.position.y = 11;
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 20, 10), new THREE.MeshLambertMaterial({ map: bandTex.clone() }));
      s2.material.map.repeat.set(1, 1); s2.material.map.needsUpdate = true;
      s2.position.y = 31;
      const s3 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 16, 8), new THREE.MeshLambertMaterial({ color: 0xd8d2c8 }));
      s3.position.y = 48;
      [s1, s2, s3].forEach(m => { m.castShadow = true; g.add(m); });
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 12), beaconMat);
      beacon.position.y = 56.6;
      g.add(beacon);
      const light = new THREE.PointLight(0xff3333, 0, 90, 2);
      light.position.y = 56.6;
      g.add(light);
      const gy = terrainH(86, 58);
      g.position.set(86, gy, 58);
      scene.add(g);
      this.addSphereCollider(86, gy + 11, 58, 2.4);
      this.addSphereCollider(86, gy + 31, 58, 1.6);
      this._anim.push((t) => {
        const k = (Math.sin(t * 3.2) + 1) / 2;
        beaconMat.color.setRGB(0.35 + k * 0.65, 0.05, 0.05);
        light.intensity = k > 0.7 ? 2.2 : 0;
      });
    },

    _windmills(scene) {
      for (const [wx, wz] of [[-92, 78], [-116, 46]]) {
        const g = new THREE.Group();
        const gy = terrainH(wx, wz);
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 1.0, 27, 10),
          new THREE.MeshLambertMaterial({ color: 0xe9edf0 })
        );
        pole.position.y = 13.5; pole.castShadow = true;
        g.add(pole);
        const nac = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 1.4, 3.0),
          new THREE.MeshLambertMaterial({ color: 0xdfe4e8 })
        );
        nac.position.set(0, 27, 0.4); nac.castShadow = true;
        g.add(nac);
        const hub = new THREE.Group();
        hub.position.set(0, 27, 2.1);
        const bladeGeo = new THREE.BoxGeometry(0.5, 10.5, 0.16);
        bladeGeo.translate(0, 5.25, 0);
        const bladeMat = new THREE.MeshLambertMaterial({ color: 0xf4f7f9 });
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(bladeGeo, bladeMat);
          b.rotation.z = (i / 3) * Math.PI * 2;
          b.castShadow = true;
          hub.add(b);
        }
        g.add(hub);
        g.position.set(wx, gy, wz);
        g.rotation.y = 2.4;
        scene.add(g);
        this.addSphereCollider(wx, gy + 13, wz, 1.2);
        this._anim.push((t, dt) => { hub.rotation.z += dt * 1.35; });
      }
    },

    _balloon(scene) {
      const g = new THREE.Group();
      const envTex = U.balloonStripeTexture();
      const env = new THREE.Mesh(
        new THREE.SphereGeometry(5.6, 20, 16),
        new THREE.MeshLambertMaterial({ map: envTex })
      );
      env.scale.set(1, 1.12, 1);
      env.castShadow = true;
      g.add(env);
      const basket = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 1.6),
        new THREE.MeshLambertMaterial({ color: 0x7a5230 })
      );
      basket.position.y = -7.4;
      g.add(basket);
      g.position.set(58, 40, -88);
      scene.add(g);
      this._anim.push((t) => {
        g.position.y = 40 + Math.sin(t * 0.4) * 1.8;
        g.rotation.y = t * 0.05;
      });
    },

    _clouds(scene) {
      const tex = U.cloudTexture(this.rng);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.82, depthWrite: false });
      this._cloudSprites = [];
      for (let i = 0; i < 12; i++) {
        const s = new THREE.Sprite(mat);
        const sc = 60 + this.rng() * 90;
        s.scale.set(sc, sc * 0.42, 1);
        s.position.set((this.rng() - 0.5) * 560, 72 + this.rng() * 55, (this.rng() - 0.5) * 560);
        scene.add(s);
        this._cloudSprites.push(s);
      }
      this._anim.push((t, dt) => {
        for (const s of this._cloudSprites) {
          s.position.x += dt * 1.6;
          if (s.position.x > 300) s.position.x = -300;
        }
      });
    },

    _rangeRing(scene) {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(V3(Math.cos(a) * this.boundaryR, 0.3, Math.sin(a) * this.boundaryR));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.35 }));
      scene.add(line);
    },

    groundAt(x, z) { return terrainH(x, z); },
    onPad(x, z) { return Math.hypot(x, z) < PAD_R + 1; },

    update(t, dt) {
      for (const fn of this._anim) fn(t, dt);
    }
  };

  DS.World = World;
})();
