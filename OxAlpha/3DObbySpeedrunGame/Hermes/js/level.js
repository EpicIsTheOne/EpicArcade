/* SKYRUSH — course construction, colliders, movers, hazards, checkpoints, bot route */
"use strict";

const Level = {
  colliders: [],   // { half:Vector3, inv:Matrix4, mesh, mover?:Mover }
  movers: [],      // { fn(t,pos), mesh, prev:Vector3, vel:Vector3, colliders:[...] }
  hazards: [],     // colliders flagged dangerous (knockback)
  boostPads: [],   // { pos:Vector3, r:number, dir:Vector3(horiz), speed, mesh }
  checkpoints: [], // { idx, name, pos, spawn, group, ring, hit, routeStep }
  finishBox: null, // { min, max }
  spawn: null,
  killY: -18,
  botRoute: [],
  _texCache: {},
  t: 0,

  /* ---------- helpers ---------- */
  mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!this._matCache) this._matCache = {};
    if (!this._matCache[key]) {
      this._matCache[key] = new THREE.MeshStandardMaterial(Object.assign({
        color, roughness: 0.86, metalness: 0.04,
      }, opts));
    }
    return this._matCache[key];
  },

  _addCollider(mesh, opts = {}) {
    mesh.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const half = new THREE.Vector3(opts.hx, opts.hy, opts.hz);
    const c = { half, inv, mesh, hazard: !!opts.hazard };
    this.colliders.push(c);
    return c;
  },

  // Static axis-aligned box. pos = CENTER. size = full extents.
  box(cx, cy, cz, sx, sy, sz, material, opts = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, material);
    m.position.set(cx, cy, cz);
    m.castShadow = opts.noShadow ? false : true;
    m.receiveShadow = true;
    (opts.parent || Game.scene).add(m);
    if (opts.collide !== false) this._addCollider(m, { hx: sx / 2, hy: sy / 2, hz: sz / 2, hazard: opts.hazard });
    return m;
  },

  // Rotated static box (any euler) — full OBB collider.
  obox(cx, cy, cz, sx, sy, sz, rot, material, opts = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, material);
    m.position.set(cx, cy, cz);
    if (rot) m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
    m.castShadow = true; m.receiveShadow = true;
    (opts.parent || Game.scene).add(m);
    if (opts.collide !== false) this._addCollider(m, { hx: sx / 2, hy: sy / 2, hz: sz / 2 });
    return m;
  },

  // Kinematic translating platform. fn(t, out) fills desired CENTER position.
  mover(fn, sx, sy, sz, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.castShadow = true; m.receiveShadow = true;
    Game.scene.add(m);
    const mv = {
      mesh: m, fn, prev: new THREE.Vector3(), vel: new THREE.Vector3(),
      cols: [], hx: sx / 2, hy: sy / 2, hz: sz / 2,
    };
    fn(this.t, m.position);
    mv.prev.copy(m.position);
    this.movers.push(mv);
    const col = this._addCollider(m, { hx: sx / 2, hy: sy / 2, hz: sz / 2 });
    col.mover = mv;
    mv.cols.push(col);
    return mv;
  },

  /* ---------- text sprite helper ---------- */
  _textTexture(lines, { w = 256, h = 128, bg = "#141a38", fg = "#dfe8ff", sub = false } = {}) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#4cc9f0"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lines.forEach((ln, i) => {
      const isTitle = i === 0 && !sub;
      ctx.font = (isTitle ? "900 " : "700 ") + (isTitle ? h * 0.30 : h * 0.155) + "px 'Segoe UI', sans-serif";
      ctx.fillStyle = i === 0 && !sub ? "#ffd166" : fg;
      ctx.fillText(ln, w / 2, (i + 0.5) * (h / lines.length), w * 0.9);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  },

  sign(x, y, z, ry, lines) {
    const tex = this._textTexture(lines);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
    m.position.set(x, y, z); m.rotation.y = ry;
    Game.scene.add(m);
    // post
    this.box(x, y - 1.35, z - 0.06, 0.18, 1.4, 0.18, this.mat(0x39406e));
    return m;
  },

  /* ---------- decorations ---------- */
  _buildSky() {
    const geo = new THREE.SphereGeometry(600, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(0.075,0.09,0.22);
          vec3 mid = vec3(0.24,0.24,0.47);
          vec3 hor = vec3(1.0,0.60,0.38);
          vec3 low = vec3(0.13,0.14,0.28);
          vec3 c = h > 0.28 ? mix(mid, top, smoothstep(0.28, 0.9, h))
                 : h > 0.0  ? mix(hor, mid, smoothstep(0.0, 0.28, h))
                 :            mix(hor, low, smoothstep(-0.12, 0.0, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    Game.scene.add(new THREE.Mesh(geo, mat));

    // drifting clouds well below the course
    const cmat = new THREE.MeshStandardMaterial({ color: 0xf2f4ff, roughness: 1, metalness: 0, transparent: true, opacity: 0.92 });
    this.clouds = [];
    for (let i = 0; i < 26; i++) {
      const cl = new THREE.Group();
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(U.rand(8, 20), U.rand(1.6, 2.6), U.rand(6, 14)), cmat);
        b.position.set(U.rand(-7, 7), U.rand(-0.6, 0.6), U.rand(-5, 5));
        cl.add(b);
      }
      cl.position.set(U.rand(-130, 170), U.rand(-34, -14), U.rand(-60, 240));
      Game.scene.add(cl);
      this.clouds.push({ obj: cl, spd: U.rand(0.5, 1.4) });
    }

    // floating deco rocks
    const rmats = [this.mat(0x6b5b8f), this.mat(0x7a6ba0), this.mat(0x5d4f81)];
    for (let i = 0; i < 18; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(U.rand(1.2, 3.4), 0), rmats[i % 3]);
      const ang = U.rand(0, U.TAU), rad = U.rand(26, 60);
      r.position.set(14.5 + Math.cos(ang) * rad, U.rand(-8, 30), Math.sin(ang) * rad + 110);
      r.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
      Game.scene.add(r);
    }
  },

  _checkpoint(idx, name, x, topY, z, routeStep) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.22, 24),
      new THREE.MeshStandardMaterial({ color: 0x1d2547, roughness: 0.6, emissive: 0x0c2036, emissiveIntensity: 0.6 }));
    pad.position.set(x, topY + 0.11, z);
    pad.receiveShadow = true;
    g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.09, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0x4cc9f0, emissive: 0x4cc9f0, emissiveIntensity: 1.4, roughness: 0.3 }));
    ring.position.set(x, topY + 1.9, z);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    // beacon beam
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.16, depthWrite: false }));
    beam.position.set(x, topY + 4.6, z);
    g.add(beam);
    Game.scene.add(g);
    const cp = {
      idx, name, hit: false, group: g, ring, beam,
      pos: new THREE.Vector3(x, topY, z),
      spawn: new THREE.Vector3(x, topY + 0.1, z),
      routeStep: routeStep == null ? idx : routeStep,
    };
    this.checkpoints.push(cp);
    return cp;
  },

  /* ---------- master build ---------- */
  build() {
    this.t = 0;
    this._buildSky();

    const grass = this.mat(0x69d16b, { roughness: 0.95 });
    const grassDark = this.mat(0x53b45c);
    const rock = this.mat(0x6b5b8f);
    const rockWarm = this.mat(0xa8763e);
    const wood = this.mat(0x8a5a33);
    const metal = this.mat(0x494f7a, { roughness: 0.5, metalness: 0.55 });
    const gold = this.mat(0xffc94d, { roughness: 0.35, metalness: 0.6 });
    const ice = this.mat(0x9fd8ff, { roughness: 0.25, metalness: 0.1 });

    /* ===== START PLAZA ===== */
    this.box(0, -0.5, 0, 16, 1, 16, grass);
    this.box(0, -1.6, 0, 13, 1.2, 13, rock); // rocky underside
    // banner
    this.box(-6.5, 4.2, -5, 0.5, 6.5, 0.5, wood); this.box(6.5, 4.2, -5, 0.5, 6.5, 0.5, wood);
    this.box(0, 7.6, -5, 13.6, 0.5, 0.6, wood);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4),
      new THREE.MeshBasicMaterial({ map: this._textTexture(["SKYRUSH", "reach the portal · beat your best"], { w: 512, h: 128 }) }));
    ban.position.set(0, 5.9, -4.6); Game.scene.add(ban);
    this.spawn = new THREE.Vector3(0, 0.6, -2);

    /* ===== S1 MEADOW HOPS ===== */
    for (let i = 0; i < 8; i++) {
      const z = 12 + i * 6.5;
      const x = Math.sin(i * 0.9) * 3;
      const ty = 0.5 + i * 0.85;
      this.box(x, ty - 0.6, z, 4.6, 1.2, 4.6, i % 2 ? grass : grassDark);
      this.box(x, ty - 1.5, z, 3.2, 0.8, 3.2, rock);
    }
    this.sign(Math.sin(0) * 3, 2.6, 8.6, Math.PI, ["MEADOW HOPS", "SPACE to jump"]);
    const cp1 = this._checkpoint(0, "Meadow Gate", 0, 7.2, 64.5);

    /* ===== S2 DASH GAPS ===== */
    // main route
    this.box(0, 6.6, 82, 3.4, 1.2, 3.4, rockWarm);
    this.box(0, 6.6, 96, 3.4, 1.2, 3.4, rockWarm);
    this.box(0, 7.4, 112, 9, 1.6, 9, grass);
    this.sign(0, 9.6, 68.6, Math.PI, ["DASH SPAN", "SHIFT mid-air"]);
    // high shortcut
    this.box(6, 11, 74, 2.6, 1, 2.6, gold);
    this.box(9, 12.5, 88, 2.6, 1, 2.6, gold);
    this.box(6, 13.5, 102, 2.6, 1, 2.6, gold);
    this.sign(5.4, 13.2, 70.4, Math.PI, ["GOLD ROUTE", "riskier · faster"], );
    const cp2 = this._checkpoint(1, "Canyon Rest", 0, 8, 112);

    /* ===== S3 PISTON ALLEY + HAMMER BRIDGE ===== */
    for (let i = 0; i < 4; i++) this.box(0, 6.6, 124 + i * 8, 6, 1.2, 8, rock);
    this.sign(0, 9.8, 119.6, Math.PI, ["PISTON ALLEY", "time your run"]);
    // pistons (translating hazards)
    for (let i = 0; i < 4; i++) {
      const z = 126.5 + i * 8, phase = i * 1.7;
      const mv = this.mover((t, out) => {
        out.set(Math.sin(t * (U.TAU / 2.6) + phase) * 2.1, 7.9, z);
      }, 1.3, 2.4, 1.3, this.mat(0xd9534f, { emissive: 0x550f0f, emissiveIntensity: 0.7, roughness: 0.4 }));
      mv.cols[0].hazard = true;
      this.hazards.push(mv.cols[0]);
    }
    // limbo bar — forces a slide
    this.box(-2.6, 9.0, 153.5, 0.8, 3.6, 1.0, metal);
    this.box(2.6, 9.0, 153.5, 0.8, 3.6, 1.0, metal);
    this.box(0, 9.55, 153.5, 6.0, 1.5, 1.0, metal); // bottom edge at 8.8 → slide under (slide height ~0.95)
    this.sign(0, 11.6, 150.8, Math.PI, ["LOW BAR", "hold C to slide"]);
    // bridge
    for (let i = 0; i < 6; i++) this.box(0, 6.7, 160 + i * 8, 3, 1.4, 8, wood);
    // swinging hammers (rotating hazards)
    [[166.5, 0], [186.5, Math.PI]].forEach(([hz, ph]) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 11.9, hz);
      Game.scene.add(pivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), metal);
      arm.position.y = -2.1; pivot.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5),
        this.mat(0xd9534f, { emissive: 0x550f0f, emissiveIntensity: 0.8, roughness: 0.35 }));
      head.position.y = -4.4; head.castShadow = true; pivot.add(head);
      pivot.rotation.z = ph;
      const hm = { pivot, ph, amp: 1.25, spd: U.TAU / 3.0, col: null, hx: 0.75, hy: 0.75, hz: 0.75 };
      hm.col = { half: new THREE.Vector3(0.75, 0.75, 0.75), inv: new THREE.Matrix4(), mesh: head, hazard: true, hammer: hm };
      this.hazards.push(hm.col);
      this.colliders.push(hm.col);
      this.hammerPivots = this.hammerPivots || [];
      this.hammerPivots.push(hm);
    });

    const cp3 = this._checkpoint(2, "Factory Gate", 0, 7.2, 210);
    this.box(0, 6.6, 210, 7, 1.2, 7, grass);

    /* ===== S4 WALL SHAFT ===== */
    this.box(5.5, 6.6, 210, 9, 1.2, 6, rock);           // connector x 1..10
    this.box(10.9, 6.7, 210, 2.2, 1.4, 6, ice);          // lip into shaft
    this.box(11.5, 15.6, 210.5, 1, 17, 7, ice);          // west wall  x 11..12, top y 24.1
    this.box(17.5, 15.6, 210.5, 1, 17, 7, ice);          // east wall  x 17..18
    this.box(14.5, 6.7, 210.5, 7, 1.4, 7, ice);          // shaft floor
    this.sign(8.2, 9.6, 212.6, -Math.PI / 2, ["WALL SHAFT", "jump wall-to-wall"]);
    // alt spiral route (west side)
    [[8.5, 9.8, 205], [8.5, 12.6, 201], [8.5, 15.4, 205], [8.5, 18.2, 201], [8.5, 20.8, 205], [8.5, 23, 209]]
      .forEach(p => this.box(p[0], p[1] - 0.4, p[2], 2.6, 0.8, 2.6, wood));
    // top exit ledge (north)
    this.box(14.5, 23.4, 217.5, 7, 1.2, 6, grass);
    const cp4 = this._checkpoint(3, "Summit Ledge", 14.5, 24, 218.5);

    /* ===== S5 SKY ISLES ===== */
    this.sign(14.5, 26.6, 214.4, Math.PI, ["SKY ISLES", "ride the movers"]);
    this.mover((t, out) => { out.set(14.5, 24.0, 208 - ((Math.sin(t * U.TAU / 5) + 1) / 2) * 12); },
      3.6, 0.8, 3.6, metal);                                        // M1 z shuttle 208↔196
    this.box(14.5, 24.4, 193, 5, 1.2, 5, grass);                    // island B (top 25)
    this.mover((t, out) => { const k = (Math.sin(t * U.TAU / 4.4) + 1) / 2; out.set(14.5, 24.9 + k * 5.4, 186.5); },
      3.6, 0.8, 3.6, metal);                                        // elevator top 25.3↔30.7
    this.box(14.5, 29.4, 180.5, 5, 1.2, 5, grass);                  // island C (top 30)
    // carousel
    const carHub = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 1, 16), metal);
    carHub.position.set(14.5, 29.8, 172); carHub.castShadow = true;
    Game.scene.add(carHub);
    this._addCollider(carHub, { hx: 1.3, hy: 0.5, hz: 1.3 });
    this.carousel = { grp: new THREE.Group(), arms: [] };
    this.carousel.grp.position.set(14.5, 29.75, 172);
    Game.scene.add(this.carousel.grp);
    for (let a = 0; a < 4; a++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.7, 1.6),
        a % 2 ? this.mat(0xffc94d, { roughness: 0.4 }) : this.mat(0xff9a62, { roughness: 0.4 }));
      arm.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.y = a * Math.PI / 2;
      arm.position.set(4.5, 0, 0);
      holder.add(arm);
      this.carousel.grp.add(holder);
      const col = this._addCollider(arm, { hx: 4.5, hy: 0.35, hz: 0.8 });
      this.carousel.arms.push(col);
    }
    // shrinking steps
    [[14.5, 30.6, 163.5, 2.5], [11, 31.6, 157.5, 2.3], [14.5, 32.6, 151.5, 2.1], [11.5, 33.6, 145.5, 2.0]]
      .forEach(([x, ty, z, s]) => {
        this.box(x, ty - 0.5, z, s, 1, s, gold);
        this.box(x, ty - 1.1, z, s * 0.7, 0.4, s * 0.7, rockWarm);
      });
    const cp5 = this._checkpoint(4, "Isle Finale", 14.5, 34.2, 137);
    this.box(14.5, 33.6, 137, 7, 1.2, 7, grass);

    /* ===== S6 GOLDEN DESCENT ===== */
    this.sign(14.5, 36.6, 134.4, Math.PI, ["GOLDEN DESCENT", "SLIDE the whole way!"]);
    const rx = Math.atan2(25.5, 62.5); // slope angle ≈ 22.2°
    // ramp top surface flush with CP5 island top (34.2) at z=133.5, running down to z=66
    const rampCz = (133.5 + 66) / 2;
    const rampHalfLen = ((133.5 - 66) / 2) / Math.cos(rx);
    const rampCy = 33.55 - (133.5 - rampCz) * Math.tan(rx);
    this.obox(14.5, rampCy, rampCz, 7, 1.2, rampHalfLen * 2, { x: -rx }, gold);
    // boost pads on the slope (visual strip + trigger)
    const padTex = (() => {
      const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
      const c = cv.getContext("2d");
      c.fillStyle = "#18e0c8"; c.fillRect(0, 0, 128, 128);
      c.fillStyle = "#0b6e60";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(24, 30 + i * 36); c.lineTo(104, 30 + i * 36); c.lineTo(64, 12 + i * 36);
        c.closePath(); c.fill();
      }
      const tx = new THREE.CanvasTexture(cv); return tx;
    })();
    [[122, 0], [98, 1.4], [76, 2.8]].forEach(([pz, delay]) => {
      const yy = 33.55 - (136 - pz) * Math.tan(rx) + 0.75;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.6),
        new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.95 }));
      strip.position.set(14.5, yy, pz);
      strip.rotation.x = -(Math.PI / 2 - rx);
      Game.scene.add(strip);
      this.boostPads.push({
        pos: new THREE.Vector3(14.5, yy, pz), r: 2.6,
        dir: new THREE.Vector3(0, -0.377, -0.926), speed: 21, mesh: strip, delay,
      });
    });
    // launch lip + final gap
    this.box(14.5, 6.0, 64.5, 7, 1.2, 4, gold);
    this.sign(18.4, 8.6, 64.5, -Math.PI / 2, ["LEAP!", "speed = flight"]);

    /* ===== FINISH ISLAND ===== */
    this.box(14.5, 2.0, 46.5, 17, 1.2, 17, grass);
    this.box(14.5, 0.8, 46.5, 13, 1.4, 13, rock);
    // portal arch
    const archMat = this.mat(0xb14aed, { emissive: 0x6a1fb8, emissiveIntensity: 1.1, roughness: 0.3 });
    this.box(9.2, 6.0, 42, 1, 7, 1, archMat);
    this.box(19.8, 6.0, 42, 1, 7, 1, archMat);
    this.box(14.5, 10.0, 42, 11.6, 1, 1, archMat);
    const portal = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40),
      new THREE.MeshBasicMaterial({ color: 0xd08cff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    portal.position.set(14.5, 6.0, 42); Game.scene.add(portal);
    this.portal = portal;
    const finTex = this._textTexture(["FINISH"], { w: 256, h: 96, bg: "#2a1140" });
    const finSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshBasicMaterial({ map: finTex }));
    finSign.position.set(14.5, 11.8, 41.6); Game.scene.add(finSign);
    this.finishBox = { min: new THREE.Vector3(10.5, 2.7, 40.4), max: new THREE.Vector3(18.5, 10.5, 43.6) };

    /* checkpoints list sanity order */
    this.cpTotal = this.checkpoints.length;

    /* ---------- BOT ROUTE (autopilot used for automated verification) ---------- */
    const R = [];
    const P = (x, y, z, extra) => R.push(Object.assign({ p: [x, y, z], tol: 1.5 }, extra || {}));
    // start & S1
    P(0, 1, 8); P(0, 1.5, 12.5); P(0, 2.4, 19); P(Math.sin(1.9) * 3, 3.2, 25.5, { j: 1 });
    P(Math.sin(2.7) * 3, 4.1, 32, { j: 1 }); P(Math.sin(3.6) * 3, 4.9, 38.5, { j: 1 });
    P(Math.sin(4.5) * 3, 5.8, 45, { j: 1 }); P(Math.sin(5.4) * 3, 6.6, 51.5, { j: 1 });
    P(Math.sin(6.3) * 3, 7.4, 58, { j: 1 }); P(0, 8.2, 63.5, { j: 1 }); P(0, 8.2, 65.5, { cp: 0 });
    // S2 main: dash gaps
    P(0, 8.2, 71, { d: 1 });            // dash-jump chain: bot jumps then dashes midair (auto)
    P(0, 8.2, 82.2); P(0, 8.2, 89, { d: 1 }); P(0, 8.2, 96.2);
    P(0, 9, 103, { d: 1 }); P(0, 9, 110); P(0, 9, 113, { cp: 1 });
    // S3 corridor & pistons
    P(0, 8.2, 122); P(0, 8.2, 129.5, { j: 1 }); P(0, 8.2, 133.5); P(0, 8.2, 141, { j: 1 });
    P(0, 8.2, 149.5, { j: 1 });
    P(0, 8.2, 151.6, { s: 1 });         // slide under limbo bar
    P(0, 8.2, 156);
    P(0, 8.2, 162, { j: 1 }); P(0, 8.2, 169, { j: 1 }); P(0, 8.2, 176, { j: 1 });
    P(0, 8.2, 183, { j: 1 }); P(0, 8.2, 190, { j: 1 }); P(0, 8.2, 197, { j: 1 });
    P(0, 8.2, 206); P(0, 8.2, 210.5, { cp: 2 });
    // S4 shaft (wall-jumps) + exit
    P(6, 8.2, 210.5); P(10, 8.2, 210.5);
    P(12.4, 9.4, 210.5, { j: 1 }); P(16.6, 12.2, 210.5, { j: 1 });
    P(12.4, 15, 210.5, { j: 1 }); P(16.6, 17.8, 210.5, { j: 1 });
    P(12.4, 20.6, 210.5, { j: 1 }); P(16.6, 23.4, 210.5, { j: 1 });
    P(14.5, 25.4, 213.5, { j: 1 }); P(14.5, 25.2, 217.5); P(14.5, 25.2, 218.5, { cp: 3 });
    // S5 movers & islands
    P(14.5, 25.2, 211); P(14.5, 25.4, 205, { ride: 1 }); P(14.5, 25.6, 199);
    P(14.5, 26.2, 194.5); P(14.5, 26.4, 190.5, { ride: 1 }); P(14.5, 30.6, 184.5, { j: 1 });
    P(14.5, 31, 181);                                   // island C
    P(14.5, 31.2, 175.5, { w: 1 });                     // carousel approach (slow)
    P(14.5, 31, 172, { w: 1 }); P(14.5, 31, 168.5, { w: 1 }); // cross arms
    P(14.5, 31.6, 163.5, { j: 1 }); P(11, 32.6, 157.5, { j: 1 });
    P(14.5, 33.6, 151.5, { j: 1 }); P(11.5, 34.6, 145.5, { j: 1 });
    P(14.5, 35.2, 138.5, { j: 1 }); P(14.5, 35.2, 137, { cp: 4 });
    // S6 descent slide + final leap
    P(14.5, 34.6, 131, { s: 1 }); P(14.5, 29, 118, { s: 1 }); P(14.5, 20, 102, { s: 1 });
    P(14.5, 12, 86, { s: 1 }); P(14.5, 8, 73, { s: 1 }); P(14.5, 7.2, 64);
    P(14.5, 4.4, 56, { d: 1 });                          // leap the gap (dash extends)
    P(14.5, 3.6, 50); P(14.5, 3.6, 44);                  // through portal
    this.botRoute = R;

    // route index snapshots at checkpoints
    this.checkpoints.forEach(cp => {
      const idx = R.findIndex(st => st.cp === cp.idx);
      cp.routeStep = idx >= 0 ? idx : 0;
    });
    return this;
  },

  /* ---------- per-frame ---------- */
  update(dt) {
    this.t += dt;
    // translators
    for (const mv of this.movers) {
      mv.fn(this.t, mv.mesh.position);
      mv.vel.subVectors(mv.mesh.position, mv.prev).divideScalar(dt);
      mv.prev.copy(mv.mesh.position);
      mv.mesh.updateMatrix();
      mv.mesh.updateWorldMatrix(false, false);
      mv.cols[0].inv.copy(mv.mesh.matrixWorld).invert();
    }
    // hammers
    if (this.hammerPivots) for (const h of this.hammerPivots) {
      h.pivot.rotation.z = h.ph + Math.sin(this.t * h.spd) * h.amp;
      h.pivot.updateWorldMatrix(true, true);
      h.headWorld = h.pivot.children[1].getWorldPosition(h.headWorld || new THREE.Vector3());
      h.col.inv.copy(h.pivot.children[1].matrixWorld).invert();
    }
    // carousel
    if (this.carousel) {
      this.carousel.grp.rotation.y = this.t * 0.85;
      this.carousel.grp.updateWorldMatrix(true, true);
      for (const col of this.carousel.arms) col.inv.copy(col.mesh.matrixWorld).invert();
    }
    // checkpoint rings spin/bob
    for (const cp of this.checkpoints) {
      cp.ring.rotation.z += dt * (cp.hit ? 3.4 : 1.4);
      cp.ring.position.y = cp.pos.y + 1.9 + Math.sin(this.t * 2 + cp.idx) * 0.14;
      const em = cp.hit ? 2.4 : 1.2;
      cp.ring.material.emissiveIntensity = cp.hit ? 2.4 : (1.0 + Math.sin(this.t * 3 + cp.idx) * 0.35);
    }
    // boost pad pulse
    for (const bp of this.boostPads)
      bp.mesh.material.opacity = 0.75 + Math.sin(this.t * 5 + bp.delay) * 0.25;
    // clouds drift
    for (const c of this.clouds) {
      c.obj.position.x += c.spd * dt;
      if (c.obj.position.x > 190) c.obj.position.x = -140;
    }
    if (this.portal) this.portal.material.opacity = 0.4 + Math.sin(this.t * 2.2) * 0.12;
  },
};
