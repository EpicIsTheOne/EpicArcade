/* SKYLINE DASH — world: course geometry, colliders, triggers, sky, decor */
window.PKW = (function () {
  const solids = [];        // {min:{x,y,z}, max:{x,y,z}}
  const shortcutMeshes = [];
  const cps = [];           // {id, pos(THREE.Vector3 pillar), min, max, spawnPos, yaw, labelPos}
  let finishTrigger = null;
  const spinners = [];
  const clouds = [];
  const group = new THREE.Group();

  const MAT_CACHE = new Map();
  function faceMat(hex) {
    if (!MAT_CACHE.has(hex)) MAT_CACHE.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return MAT_CACHE.get(hex);
  }

  /** solid AABB box: center cx,cy,cz size sx,sy,sz */
  function B(cx, cy, cz, sx, sy, sz, o) {
    o = o || {};
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const side = o.side || '#39406b';
    const top = o.top || o.side || '#4a5288';
    const mats = [faceMat(side), faceMat(side), faceMat(top), faceMat(o.bottom || '#23274a'), faceMat(side), faceMat(side)];
    const m = new THREE.Mesh(geo, mats);
    m.position.set(cx, cy, cz);
    group.add(m);
    if (o.edge) {
      const e = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: o.edge, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
      );
      e.position.set(cx, cy, cz);
      group.add(e);
    }
    if (o.collide !== false) {
      solids.push({
        min: { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
        max: { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 }
      });
    }
    if (o.msg) {
      m.userData.shortcutMsg = o.msg;
      shortcutMeshes.push(m);
    }
    return m;
  }

  function textSprite(txt, scale, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '900 84px "Segoe UI", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 26;
    g.fillStyle = '#ffffff';
    g.fillText(txt, 256, 68);
    g.fillStyle = color; g.globalAlpha = 0.35; g.fillText(txt, 256, 68);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(scale * 4, scale, 1);
    return sp;
  }

  function addCP(id, x, topY, z) {
    // visual: ring + light pillar + label
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.09, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x35e0ff })
    );
    ring.position.set(x, topY + 2.1, z);
    group.add(ring); spinners.push(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 7, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2bb8dd, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.set(x, topY + 3.5, z);
    group.add(pillar);
    const lbl = textSprite('CP ' + id, 1.15, '#67e8f9');
    lbl.position.set(x, topY + 4.9, z);
    group.add(lbl);

    cps.push({
      id,
      pos: new THREE.Vector3(x, topY, z),
      min: { x: x - 6.5, y: topY - 1, z: z - 3 },
      max: { x: x + 6.5, y: topY + 7, z: z + 3 },
      spawnPos: new THREE.Vector3(x, topY + 1.0, z + 1.5),
      yaw: 0,
      labelPos: new THREE.Vector3(x, topY + 3, z)
    });
  }

  /* ---------------- COURSE ---------------- */
  function buildCourse() {
    // start pad
    B(0, -0.5, -4, 10, 1, 12, { top: '#5a4a2e', side: '#3a3654', bottom: '#22254a', edge: 0xffc94d });
    // start gate posts
    B(-4.6, 1.5, -11, 0.5, 5, 0.5, { side: '#4a3a55', collide: false });
    B(4.6, 1.5, -11, 0.5, 5, 0.5, { side: '#4a3a55', collide: false });
    B(0, 4.2, -11, 9.7, 0.5, 0.5, { side: '#ffb14d', collide: false });
    const st = textSprite('START', 1.6, '#ffc94d'); st.position.set(0, 5.6, -11); group.add(st);

    // Section A — basic gaps
    B(0, -0.5, -19, 8, 1, 8, { edge: 0x22d3ee });
    B(0, 0.5, -30, 7, 1, 7, { edge: 0x22d3ee });
    B(0, 1.5, -42, 6, 1, 6, { edge: 0x22d3ee });
    B(0, 1.5, -54, 10, 1, 10, { edge: 0xffc94d }); addCP(1, 0, 2, -54);

    // Section B — slide gates
    B(0, 1.5, -73.5, 8, 1, 29, { edge: 0x22d3ee });                 // runway z -59..-88
    B(0, 4.75, -68, 8, 3.5, 1, { side: '#43305e', top: '#54376e', bottom: '#301a45', edge: 0xf472b6 });  // gate 1 (underside y=3)
    B(0, 4.75, -78, 8, 3.5, 1, { side: '#43305e', top: '#54376e', bottom: '#301a45', edge: 0xf472b6 });  // gate 2
    B(0, 1.5, -93.5, 10, 1, 11, { edge: 0xffc94d }); addCP(2, 0, 2, -93.5);

    // Section C — dash gaps
    B(0, 1.0, -112, 6, 1, 6, { edge: 0x22d3ee });
    B(0, 1.0, -126, 6, 1, 6, { edge: 0x22d3ee });
    B(0, 1.5, -142, 12, 1, 10, { edge: 0xffc94d }); addCP(3, 0, 2, -142);

    // Shortcut S1 — high beam past the slide gates (mount near CP1)
    B(6.5, 2.25, -61, 3, 0.5, 3, { msg: 'SHORTCUT ROUTE', edge: 0xa3e635 });
    B(9, 2.75, -79, 1.6, 0.5, 38, { msg: 'SHORTCUT ROUTE', top: '#46503a', side: '#333a2c', edge: 0xa3e635 });
    B(7, 1.75, -101.5, 4, 0.5, 4, { msg: 'SHORTCUT ROUTE', edge: 0xa3e635 });

    // Section D — wall-run pit (wall on the LEFT when heading -Z)
    B(-5.5, 4, -166, 1.5, 8, 38, { side: '#3d3560', top: '#4a4276', bottom: '#2a2450', edge: 0xf0abfc });
    B(0, 2.0, -192, 10, 1, 12, { edge: 0xffc94d }); addCP(4, 0, 2.5, -192);

    // Shortcut S2 — risky mini-pad hops across the pit
    B(4, 1.75, -158, 2.5, 0.5, 2.5, { msg: 'SHORTCUT ROUTE', edge: 0xa3e635 });
    B(8, 2.25, -176, 2.5, 0.5, 2.5, { msg: 'SHORTCUT ROUTE', edge: 0xa3e635 });

    // Section E — chimney wall-jump climb (inner faces x = ∓1.5, gap 3m)
    B(-2.25, 7, -202, 1.5, 10, 12, { side: '#3d3560', top: '#4a4276', bottom: '#2a2450', edge: 0xf0abfc });
    B(2.25, 7, -202, 1.5, 10, 12, { side: '#3d3560', top: '#4a4276', bottom: '#2a2450', edge: 0xf0abfc });
    B(0, 11.5, -216, 10, 1, 8, { edge: 0xffc94d }); addCP(5, 0, 12, -216);

    // Section F — finale descent
    B(0, 8.5, -232, 7, 1, 7, { edge: 0x22d3ee });
    B(0, 5.5, -246, 7, 1, 7, { edge: 0x22d3ee });
    B(0, 2.5, -260, 14, 1, 12, { top: '#4d2f52', edge: 0xff4fd8 });

    // Finish gate
    B(-5, 5.5, -260, 0.7, 6, 0.7, { side: '#5a2f55', collide: false });
    B(5, 5.5, -260, 0.7, 6, 0.7, { side: '#5a2f55', collide: false });
    B(0, 8.8, -260, 10.7, 0.6, 0.6, { side: '#ff4fd8', collide: false });
    const fl = textSprite('FINISH', 1.7, '#ff9def'); fl.position.set(0, 7.6, -260); group.add(fl);
    const shimmer = new THREE.Mesh(
      new THREE.PlaneGeometry(9.4, 5.4),
      new THREE.MeshBasicMaterial({ color: 0xff77e0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    shimmer.position.set(0, 5.4, -260);
    group.add(shimmer); spinners.push(shimmer); shimmer.userData.pulse = true;

    finishTrigger = {
      min: { x: -5, y: 2.5, z: -261.5 }, max: { x: 5, y: 9, z: -258.5 }
    };
  }

  /* ---------------- FREE ROAM ---------------- */
  function buildFreeRoam() {
    B(0, -0.25, 5, 4, 0.5, 6, { edge: 0x34d399 });                    // bridge plank
    B(0, -0.5, 32, 44, 1, 48, { top: '#31514a', side: '#2b3a4e', bottom: '#1d2a42', edge: 0x34d399 });
    // steps
    B(-14, 0.5, 16, 4, 1, 4, {}); B(-14, 1.5, 21, 4, 3, 4, {}); B(-14, 2.5, 26, 4, 5, 4, {});
    // crate stack
    B(12, 1, 18, 2, 2, 2, { side: '#4e4433', top: '#5e5340' }); B(14.5, 1, 18.5, 2, 2, 2, { side: '#4e4433', top: '#5e5340' });
    B(13.25, 3, 18.25, 2, 2, 2, { side: '#4e4433', top: '#5e5340' });
    // solo wall-run wall
    B(-16, 3, 34, 1, 6, 26, { side: '#3d3560', top: '#4a4276', edge: 0xf0abfc });
    // practice chimney (inner gap 3m)
    B(-5, 4, 44, 1, 8, 10, { side: '#3d3560', top: '#4a4276', edge: 0xf0abfc });
    B(-1, 4, 44, 1, 8, 10, { side: '#3d3560', top: '#4a4276', edge: 0xf0abfc });
    // dash-gap pad row
    B(14, 0.75, 28, 3, 0.5, 3, { edge: 0xa3e635 }); B(14, 1.25, 37, 3, 0.5, 3, { edge: 0xa3e635 }); B(14, 1.75, 46, 3, 0.5, 3, { edge: 0xa3e635 });
    const fr = textSprite('FREE ROAM', 2.2, '#7ce8c0'); fr.position.set(0, 4.5, 30); group.add(fr);
    const co = textSprite('THE COURSE ▼', 1.6, '#8fd8ff'); co.position.set(0, 3.4, -13.5); group.add(co);
  }

  /* ---------------- DECOR ---------------- */
  function buildDecor() {
    // silhouette towers ring
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 130;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 110;
      const h = 24 + Math.random() * 66;
      B(x, h / 2 - 12, z, 7 + Math.random() * 12, h, 7 + Math.random() * 12,
        { side: '#171a33', top: '#1d2140', bottom: '#141631', collide: false });
    }
    // floating islands
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 120;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 100, y = -6 + Math.random() * 26;
      const w = 10 + Math.random() * 18;
      B(x, y, z, w, 2.2, w * (0.7 + Math.random() * 0.5), { side: '#3a3352', top: '#41604e', bottom: '#241f3d', collide: false });
      if (Math.random() < 0.6) B(x, y + 2.6, z, 2 + Math.random() * 3, 3 + Math.random() * 4, 2 + Math.random() * 3, { side: '#2c2748', collide: false });
    }
    // clouds
    const ct = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      for (let i = 0; i < 7; i++) {
        const x = 40 + Math.random() * 176, y = 45 + Math.random() * 40, r = 22 + Math.random() * 30;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,235,250,.85)'); grd.addColorStop(1, 'rgba(255,235,250,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      return new THREE.CanvasTexture(c);
    })();
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.5, depthWrite: false }));
      sp.position.set((Math.random() - 0.5) * 500, 36 + Math.random() * 70, -110 + (Math.random() - 0.5) * 480);
      const s = 60 + Math.random() * 90;
      sp.scale.set(s, s * 0.42, 1);
      sp.userData.speed = 0.6 + Math.random() * 1.2;
      group.add(sp); clouds.push(sp);
    }
  }

  /* ---------------- SKY & LIGHT ---------------- */
  function buildSky(scene) {
    const geo = new THREE.SphereGeometry(820, 28, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.25, 0.24, -0.94).normalize() } },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP; uniform vec3 sunDir;
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 zen = vec3(0.075,0.085,0.24);
          vec3 mid = vec3(0.28,0.19,0.46);
          vec3 hor = vec3(1.0,0.55,0.32);
          vec3 col = mix(hor, mid, smoothstep(0.02, 0.24, h));
          col = mix(col, zen, smoothstep(0.18, 0.62, h));
          col = mix(col, vec3(0.10,0.06,0.16), smoothstep(-0.02,-0.35,h));
          float sd = dot(d, sunDir);
          col += vec3(1.0,0.72,0.42) * pow(max(sd,0.0), 30.0) * 0.55;     // halo
          col += vec3(1.0,0.82,0.55) * smoothstep(0.9990, 0.9997, sd) * 1.6; // disc
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    const sky = new THREE.Mesh(geo, mat);
    scene.add(sky);

    scene.fog = new THREE.Fog(0x2a2450, 80, 340);
    scene.add(new THREE.HemisphereLight(0x8890d8, 0x2c2244, 0.95));
    const sun = new THREE.DirectionalLight(0xffd9b0, 0.9);
    sun.position.set(40, 55, -140);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6aa0ff, 0.25);
    fill.position.set(-50, 30, 90);
    scene.add(fill);
  }

  function build(scene) {
    buildSky(scene);
    buildCourse();
    buildFreeRoam();
    buildDecor();
    scene.add(group);
  }

  function update(dt, t) {
    for (const s of spinners) {
      if (s.userData.pulse) {
        s.material.opacity = 0.10 + Math.sin(t * 2.4) * 0.06;
      } else {
        s.rotation.z += dt * 0.9;
        s.rotation.y = Math.sin(t * 0.7) * 0.25;
      }
    }
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 280) c.position.x = -280;
    }
  }

  return {
    build, update, solids, cps, clouds, shortcutMeshes,
    get finish() { return finishTrigger; },
    spawn: { pos: new THREE.Vector3(0, 1.0, -4), yaw: 0 },
    startLineZ: -11, killY: -26, cpTotal: 5,
    marker: 'SKYDASH-WLD-r01'
  };
})();
