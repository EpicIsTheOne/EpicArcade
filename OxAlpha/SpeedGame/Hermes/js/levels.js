/* ============================================================
   VOLT RUSH — levels.js
   4 substantial original levels. Each: distinct biome, main route
   + alternates, secrets, spectacle, enemies, traversal.
   L1 NEON DISTRICT   — night city (tutorial-ish, fast)
   L2 SKYSHARD ISLES  — floating islands, sky rails, verticality
   L3 FOUNDRY DEPTHS  — industrial hazard gauntlet
   L4 AURORA SUMMIT  — mountain finale: speed + vertical + storm
   ============================================================ */
(function () {
  'use strict';
  const T = () => window.THREE;
  const VM = () => window.VoltMath;

  /* ---------- shared builder helpers (bound per level) ---------- */
  class LevelBuilder {
    constructor(THREE_, world, theme) {
      this.T = typeof THREE_ === 'function' ? THREE_ : () => THREE_;
      this.world = world;
      this.theme = theme;
      this.rings = [];
      this.shards = [];
      this.enemies = [];
      this.springs = [];
      this.panels = [];
      this.platforms = [];
      this.loops = [];
      this.checkpoints = [];
      this.finish = null;
      this.updrafts = [];
      this.walls = [];
      this.rails = [];
      this.spawn = { x: 0, y: 3, z: 0 };
    }
    box(x, y, z, sx, sy, sz, opts = {}) {
      this.world.addCollider(VoltWorld.makeBox(x, y, z, sx, sy, sz, { type: opts.type || 'solid', tag: opts.tag }));
      if (!opts.noMesh) {
        const m = new (this.T().Mesh)(
          new (this.T().BoxGeometry)(sx, sy, sz),
          opts.mat || this.theme.groundMat);
        m.position.set(x, y, z);
        m.castShadow = opts.shadow !== false;
        m.receiveShadow = true;
        this.world.scene.add(m);
        return m;
      }
      return null;
    }
    ramp(x, y, z, sx, sy, sz, dir) {
      this.world.addCollider(VoltWorld.makeRamp(x, y, z, sx, sy, sz, dir));
      // visual: rotated box approximating the incline
      const len = dir === 0 || dir === 1 ? sz : sx;
      const ang = Math.atan2(sz, sy * 0 + Math.max(sy, 0.001));
      const g = new (this.T().BoxGeometry)(
        dir === 0 || dir === 1 ? sx : Math.hypot(sx, sy),
        0.6,
        dir === 0 || dir === 1 ? Math.hypot(sz, sy) : sz);
      const m = new (this.T().Mesh)(g, this.theme.groundMat);
      m.position.set(x, y, z);
      const a = Math.atan2(sy, dir === 0 || dir === 1 ? sz : sx);
      if (dir === 0) m.rotation.x = -a;
      else if (dir === 1) m.rotation.x = a;
      else if (dir === 2) m.rotation.z = a;
      else m.rotation.z = -a;
      this.world.scene.add(m);
      return m;
    }
    ringLine(from, to, n, axis) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        this.rings.push({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          z: from.z + (to.z - from.z) * t,
          axis: axis || null,
        });
      }
    }
    ringArc(cx, cy, cz, r, a0, a1, n, plane) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const a = a0 + (a1 - a0) * t;
        if (plane === 'xz') this.rings.push({ x: cx + Math.cos(a) * r, y: cy, z: cz + Math.sin(a) * r });
        else this.rings.push({ x: cx, y: cy + Math.sin(a) * r, z: cz + Math.cos(a) * r });
      }
    }
    shard(x, y, z, name) { this.shards.push({ x, y, z, name }); }
    rail(pts, opts) { const r = new VoltTraverse.Rail(this.world.scene, pts, opts); this.rails.push(r); return r; }
    spring(x, y, z, opts) { const s = new VoltTraverse.Spring(this.world.scene, x, y, z, opts); this.springs.push(s); return s; }
    panel(x, y, z, dx, dz, opts) { const p = new VoltTraverse.DashPanel(this.world.scene, x, y, z, dx, dz, opts); this.panels.push(p); return p; }
    platform(wps, opts) { const p = new VoltTraverse.MovingPlatform(this.world.scene, this.world, wps, opts); this.platforms.push(p); return p; }
    loop(cx, cy, cz, r, rotY, opts) { const l = new VoltTraverse.LoopTrack(this.world.scene, cx, cy, cz, r, rotY, opts); this.loops.push(l); return l; }
    checkpoint(x, y, z, yaw) {
      const c = new VoltTraverse.Checkpoint(this.world.scene, this.world, x, y, z, yaw || 0, this.checkpoints.length);
      c.setLit(false); this.checkpoints.push(c); return c;
    }
    finishGate(x, y, z, yaw) {
      this.finish = new VoltTraverse.FinishGate(this.world.scene, this.world, x, y, z, yaw || 0);
      this.finishPos = { x, y, z, yaw: yaw || 0 };
    }
    updraft(x, y, z, h, r, s) { const u = new VoltTraverse.Updraft(this.world.scene, this.world, x, y, z, h, r, s); this.updrafts.push(u); return u; }
    wall(x, y, z, sx, sy, sz, yaw) { const w = new VoltTraverse.RunWall(this.world.scene, this.world, x, y, z, sx, sy, sz, yaw); this.walls.push(w); return w; }
    enemy(type, ...args) {
      let e;
      if (type === 'drone') e = new VoltEnemies.Sparkdrone(this.world.scene, ...args);
      else if (type === 'sentinel') e = new VoltEnemies.Strutsentinel(this.world.scene, ...args);
      else if (type === 'mine') e = new VoltEnemies.Voltsphere(this.world.scene, ...args);
      else if (type === 'turret') e = new VoltEnemies.Prismturret(this.world.scene, ...args);
      this.enemies.push(e);
      return e;
    }
    hazard(x, y, z, sx, sz) { new VoltEnemies.HazardZone(this.world.scene, this.world, x, y, z, sx, sz); }

    /* scatter decorative trees/crystals/buildings — visual only */
    scatter(n, areaFn, meshFactory) {
      const rng = VM().makeRng(this.seed || 7);
      for (let i = 0; i < n; i++) {
        const p = areaFn(rng, i);
        if (!p) continue;
        const m = meshFactory(rng, i);
        m.position.set(p.x, p.y, p.z);
        this.world.scene.add(m);
      }
    }
  }

  /* ================= THEME FACTORIES ================= */
  function makeTheme(T, kind) {
    const M = typeof T === 'function' ? T() : T;
    const groundMat = new (M.MeshStandardMaterial)({ color: 0x39435f, roughness: 0.75, metalness: 0.2 });
    const neonMat = (c, ei = 1.5) => new (M.MeshStandardMaterial)({ color: c, emissive: c, emissiveIntensity: ei, roughness: 0.4 });
    const t = { groundMat, neonMat, kind };
    if (kind === 'city') {
      groundMat.color.setHex(0x2a3149);
      t.accent = 0x37f0ff; t.sky = 0x0b1026; t.fog = 0x101736; t.fogNear = 60; t.fogFar = 420;
      t.sunColor = 0x8fb4ff; t.sunInt = 0.55; t.amb = 0x33406b; t.ambInt = 0.85; t.hemi = true;
      t.buildingMatA = new (M.MeshStandardMaterial)({ color: 0x2e3866, roughness: 0.78, metalness: 0.12, emissive: 0x232c52, emissiveIntensity: 0.5 });
      t.buildingMatB = new (M.MeshStandardMaterial)({ color: 0x3a4680, roughness: 0.72, metalness: 0.15, emissive: 0x2b3560, emissiveIntensity: 0.5 });
      t.windowMats = [neonMat(0x37f0ff, 1.2), neonMat(0xff4fd8, 1.0), neonMat(0xffc93c, 1.0)];
    } else if (kind === 'sky') {
      groundMat.color.setHex(0x4c7a52);
      t.accent = 0x51ffb0; t.sky = 0x4f9fd8; t.fog = 0xa8cfe8; t.fogNear = 90; t.fogFar = 700;
      t.sunColor = 0xfff2d8; t.sunInt = 1.25; t.amb = 0x88aac4; t.ambInt = 0.7; t.hemi = true;
      t.rockMat = new (M.MeshStandardMaterial)({ color: 0x7a8ba3, roughness: 0.85, metalness: 0.05 });
      t.grassMat = new (M.MeshStandardMaterial)({ color: 0x58b368, roughness: 0.8 });
    } else if (kind === 'foundry') {
      groundMat.color.setHex(0x3a3f4a);
      t.accent = 0xff7a2f; t.sky = 0x14100e; t.fog = 0x241a14; t.fogNear = 40; t.fogFar = 300;
      t.sunColor = 0xffb37a; t.sunInt = 0.5; t.amb = 0x54382a; t.ambInt = 0.8;
      t.metalMat = new (M.MeshStandardMaterial)({ color: 0x5a6577, roughness: 0.62, metalness: 0.25, emissive: 0x2a3040, emissiveIntensity: 0.4 });
      t.lavaGlow = new (M.MeshStandardMaterial)({ color: 0xff5a1f, emissive: 0xff5a1f, emissiveIntensity: 2.2, roughness: 0.5 });
    } else { // aurora
      groundMat.color.setHex(0x8ea6c4);
      t.accent = 0x7cf7d4; t.sky = 0x0d1b2e; t.fog = 0x14283f; t.fogNear = 80; t.fogFar = 650;
      t.sunColor = 0xa9c8ff; t.sunInt = 0.7; t.amb = 0x2e5f6e; t.ambInt = 0.9; t.hemi = true;
      t.snowMat = new (M.MeshStandardMaterial)({ color: 0xe8f2ff, roughness: 0.95 });
      t.iceMat = new (M.MeshStandardMaterial)({ color: 0x9fd8e8, roughness: 0.15, metalness: 0.3 });
      t.auroraMats = [];
      for (const c of [0x51ffb0, 0x37f0ff, 0xb44dff]) {
        t.auroraMats.push(new (M.MeshBasicMaterial)({
          color: c, transparent: true, opacity: 0.12, side: M.DoubleSide, depthWrite: false,
        }));
      }
    }
    return t;
  }

  /* ============================================================
     LEVEL 1 — NEON DISTRICT
     ============================================================ */
  function buildLevel1(b, T) {
    b.seed = 11;
    const W = b.world;

    // ---- MAIN ROAD: long speed straight with gentle S-curves ----
    b.box(0, -1, 40, 16, 2, 120);                    // start plaza+road
    b.box(-10, -1, 130, 44, 2, 70);                  // wide junction
    b.box(20, -1, 200, 16, 2, 110);                  // road east leg
    b.box(20, -1, 280, 30, 2, 50);                   // approach plaza

    // ---- CITY BLOCKS (visual towers, some climbable/wallrunnable) ----
    const towerSpots = [
      [-38, 60], [-42, 105], [-30, 150], [-46, 190],
      [34, 55], [40, 100], [30, 145], [45, 185], [38, 235],
      [-12, 250], [12, 265], [60, 210],
    ];
    const rng = VM().makeRng(77);
    for (const [tx, tz] of towerSpots) {
      const h = 18 + rng() * 42;
      const w = 10 + rng() * 8;
      const d = 10 + rng() * 8;
      const mat = rng() > 0.5 ? b.theme.buildingMatA : b.theme.buildingMatB;
      const tw = new (T().Mesh)(new (T().BoxGeometry)(w, h, d), mat);
      tw.position.set(tx, h / 2 - 2, tz);
      tw.castShadow = true; tw.receiveShadow = true;
      W.scene.add(tw);
      W.addCollider(VoltWorld.makeBox(tx, h / 2 - 2, tz, w, h, d, { type: 'wallrun', tag: 'wall' }));
      // window strips (emissive)
      const strips = 2 + ((rng() * 3) | 0);
      for (let s = 0; s < strips; s++) {
        const wm = b.theme.windowMats[(rng() * b.theme.windowMats.length) | 0];
        const strip = new (T().Mesh)(new (T().BoxGeometry)(w * 0.92, 0.35, 0.2), wm);
        strip.position.set(0, (rng() - 0.5) * h * 0.7, d / 2 + 0.05);
        tw.add(strip);
        const strip2 = strip.clone();
        strip2.position.z = -d / 2 - 0.05;
        strip2.rotation.y = Math.PI;
        tw.add(strip2);
      }
      // rooftop beacon
      const bc = new (T().Mesh)(new (T().SphereGeometry)(0.5, 8, 8), b.theme.neonMat(0xff4477, 2));
      bc.position.set(0, h / 2 - 2 + h / 2 + 1.2, 0);
      tw.add(bc);
    }

    // ---- START: dash panel onto the road ----
    b.panel(0, 0, 22, 0, 1, { speed: 38, boostTime: 1.4 });

    // ---- LOOP #1 on the road (spectacle moment one) ----
    b.loop(0, 0, 78, 7, 0);

    // ---- RAIL A: high line over the junction ----
    b.rail([
      { x: -28, y: 10, z: 96 },
      { x: -20, y: 12, z: 118 },
      { x: -8, y: 13, z: 136 },
      { x: 8, y: 12, z: 148 },
      { x: 24, y: 10, z: 158 },
      { x: 34, y: 9, z: 176 },
      { x: 32, y: 10, z: 198 },
      { x: 20, y: 11, z: 214 },
    ], { color: 0x37f0ff });

    // ramp to reach Rail A entry
    b.ramp(-34, 5, 86, 8, 6, 16, 0);   // rises toward +z
    b.box(-34, 9.5, 97, 8, 1.2, 6);    // launch ledge

    // rings along rail A
    b.ringLine({ x: -28, y: 12, z: 98 }, { x: 20, y: 13, z: 212 }, 10);

    // ---- ALTERNATE: ground route with springs & panels ----
    b.panel(-10, 0, 118, 1, 0, { speed: 36 });       // east panel at junction
    b.spring(-24, 0, 132, { power: 24 });            // bounce up to rail line
    b.ringArc(-24, 8, 140, 6, -0.4, 0.9, 5, 'y');

    // ---- PLATFORMING HUB: rooftops east ----
    b.box(48, 8, 160, 12, 1, 12);
    b.box(62, 11, 172, 10, 1, 10);
    b.box(76, 14, 184, 10, 1, 10);
    b.spring(48, 8.5, 160, { power: 22 });
    b.ringLine({ x: 54, y: 10, z: 165 }, { x: 72, y: 13, z: 181 }, 5);

    // ---- DOWNHILL RUN into second loop ----
    b.ramp(20, -0.5, 236, 16, 4, 26, 0);
    b.panel(20, 0, 262, 0, 1, { speed: 40 });
    b.loop(20, 0, 292, 7.5, 0);

    // ---- SIDE STREET WEST (shortcut w/ mines) ----
    b.box(-40, -1, 230, 12, 2, 80);
    b.enemy('mine', -40, 0, 215);
    b.enemy('mine', -40, 0, 240);
    b.enemy('mine', -40, 0, 260);
    b.ringLine({ x: -40, y: 1, z: 205 }, { x: -40, y: 1, z: 268 }, 6);

    // ---- ELEVATED FREEWAY WEST (high route with dash panels) ----
    b.ramp(-64, 4, 176, 10, 8, 18, 0);            // climb up east->west? rises toward +z
    b.box(-64, 8, 210, 12, 1, 50);                // deck
    b.panel(-64, 8, 196, 0, 1, { speed: 42 });
    b.box(-64, 3, 190, 2.5, 8, 2.5);              // pillars
    b.box(-64, 3, 230, 2.5, 8, 2.5);
    b.ramp(-64, 8.5, 240, 12, 7, 16, 0);          // exit ramp down (+z rise => ride -z)
    void 0;
    b.box(-64, 8.5, 258, 12, 1, 30);              // high continuation toward plaza
    b.spring(-64, 9, 272, { power: 26 });         // launch to finish plaza shortcut
    b.ringLine({ x: -64, y: 11, z: 200 }, { x: -64, y: 11, z: 268 }, 7);

    // ---- PLAZA DRESSING: pillars & planter boxes ----
    b.box(4, 1.5, 318, 2.5, 5, 2.5);
    b.box(36, 1.5, 318, 2.5, 5, 2.5);
    b.box(4, 1.5, 344, 2.5, 5, 2.5);
    b.box(36, 1.5, 344, 2.5, 5, 2.5);
    b.box(12, 0.75, 330, 6, 1.5, 6);
    b.box(28, 0.75, 338, 6, 1.5, 6);

    // ---- FINAL PLAZA: enemies arena-lite + finish ----
    b.box(20, -1, 330, 40, 2, 40);
    b.enemy('drone', 8, 3, 320, 3);
    b.enemy('drone', 30, 3, 322, 3);
    b.enemy('sentinel', 20, 0, 340, 1, 0, 6);
    b.checkpoint(20, 0, 305, 0);
    b.finishGate(20, 0, 352, 0);

    // ---- scattered rings guiding flow ----
    b.ringLine({ x: 0, y: 1, z: 30 }, { x: 0, y: 1, z: 66 }, 6);
    b.ringLine({ x: -6, y: 1, z: 128 }, { x: 16, y: 1, z: 196 }, 8);
    b.ringLine({ x: 20, y: 1, z: 245 }, { x: 20, y: 1, z: 285 }, 6);
    b.ringArc(20, 1, 292, 8, 0, Math.PI * 2, 10, 'xz');

    // shards: 3 total
    b.shard(0, 10.5, 78, 'district-loop');            // inside loop 1 top area
    b.shard(-40, 2, 268, 'district-alley');           // end of west alley
    b.shard(76, 17.5, 184, 'district-rooftop');       // hub platforming reward

    // updraft near hub back down shortcut
    b.updraft(48, 8, 168, 20, 3);

    b.spawn = { x: 0, y: 2, z: 8 };
  }

  /* ============================================================
     LEVEL 2 — SKYSHARD ISLES
     ============================================================ */
  function buildLevel2(b, T) {
    b.seed = 22;
    const W = b.world;

    // ---- ISLAND 1: spawn plateau ----
    b.box(0, -1, 0, 26, 2, 26);
    b.scatter(6, r => ({ x: (r() - 0.5) * 20, y: 0, z: 10 + r() * 10 }), r => {
      const h = 3 + r() * 4;
      const tree = new (T().Group)();
      const trunk = new (T().Mesh)(new (T().CylinderGeometry)(0.25, 0.4, h, 6), b.theme.rockMat);
      trunk.position.y = h / 2; tree.add(trunk);
      const crown = new (T().Mesh)(new (T().IcosahedronGeometry)(1.6 + r(), 0), b.theme.grassMat);
      crown.position.y = h + 0.8; tree.add(crown);
      return tree;
    });

    // ---- SPEED BRIDGE 1 with gap jumps (short first gap: learnable) ----
    b.box(0, -1, 30, 10, 2, 18);
    b.box(0, -1, 62, 10, 2, 22);
    b.box(0, -1, 88, 10, 2, 20);
    b.panel(0, 0, 16, 0, 1, { speed: 34, boostTime: 1.0 });
    b.ringLine({ x: 0, y: 2.5, z: 42 }, { x: 0, y: 2.5, z: 58 }, 3);   // arc guides over gap

    // ---- ISLAND 2 + SPRING VERTICALITY ----
    b.box(0, -1, 108, 30, 2, 30);
    b.spring(0, 0, 108, { power: 27 });
    b.ringArc(0, 14, 116, 7, -0.5, 0.8, 5, 'y');
    // rock arch gateway + flank rocks (structure + readability)
    b.box(-12, 6, 96, 4, 14, 4, { mat: b.theme.rockMat });
    b.box(12, 6, 96, 4, 14, 4, { mat: b.theme.rockMat });
    b.box(0, 14, 96, 28, 3, 4, { mat: b.theme.rockMat });
    b.enemy('sentinel', 0, 0, 104, 1, 0, 6);
    b.shard(0, 17.5, 96, 'isles-arch');
    b.ringLine({ x: 0, y: 2, z: 90 }, { x: 0, y: 16, z: 96 }, 4);

    // ---- HIGH SHELF route ----
    b.box(-14, 8, 122, 14, 1.5, 22);
    b.box(-30, 11, 134, 12, 1.5, 16);
    b.shard(-30, 14.5, 134, 'isles-shelf');
    b.ringLine({ x: -8, y: 11, z: 124 }, { x: -26, y: 12.5, z: 133 }, 4);

    // ---- SKY RAILS: two crossing lines over the void ----
    b.rail([
      { x: -30, y: 13, z: 146 },
      { x: -18, y: 15, z: 162 },
      { x: -2, y: 16, z: 174 },
      { x: 16, y: 15, z: 186 },
      { x: 30, y: 13, z: 202 },
      { x: 34, y: 11, z: 222 },
    ], { color: 0x51ffb0 });
    b.rail([
      { x: 26, y: 6, z: 140 },
      { x: 20, y: 8, z: 160 },
      { x: 12, y: 9, z: 180 },
      { x: 4, y: 8, z: 200 },
      { x: 0, y: 7, z: 218 },
    ], { color: 0x51ffb0 });

    // ---- ISLAND 3 (mid) + drones ----
    b.box(0, -1, 152, 24, 2, 24);
    b.enemy('drone', -6, 3, 148, 3);
    b.enemy('drone', 8, 4, 156, 3);
    b.hazard(6, 0, 144, 3, 3);

    // ---- FLOATING STEPPING STONES (technical section) + VERTICAL TOWER ----
    b.box(0, 2, 182, 6, 1, 6);
    b.box(10, 3.5, 194, 6, 1, 6);
    b.box(2, 5, 208, 6, 1, 6);
    b.box(-8, 6.5, 220, 6, 1, 6);
    b.shard(2, 8.5, 208, 'isles-stones');
    b.ringLine({ x: 0, y: 4, z: 184 }, { x: -6, y: 8, z: 218 }, 4);
    // vertical tower: springs spiral up floating rocks (exploration route)
    b.box(20, 1, 176, 7, 1, 7);
    b.spring(20, 1.5, 176, { power: 22 });
    b.box(26, 7, 186, 6, 1, 6);
    b.spring(26, 7.5, 186, { power: 22 });
    b.box(20, 13, 196, 6, 1, 6);
    b.spring(20, 13.5, 196, { power: 24 });
    b.box(12, 19, 204, 7, 1, 7);
    b.shard(12, 22.5, 204, 'isles-tower');
    b.enemy('drone', 22, 10, 190, 4);
    b.ringLine({ x: 20, y: 4, z: 178 }, { x: 12, y: 21, z: 204 }, 8);
    // wallrun chimney shortcut from tower top back down to island 4 approach
    b.wall(4, 12, 214, 1.4, 14, 18, 0);
    b.ringLine({ x: 6, y: 16, z: 216 }, { x: 0, y: 8, z: 228 }, 4);

    // ---- ISLAND 4: big landing with loop ----
    b.box(-6, -1, 244, 34, 2, 30);
    b.loop(-6, 0, 244, 7, 0);
    b.enemy('sentinel', -6, 0, 232, 0, 1, 5);

    // ---- UPDRAFT ASCENT to final island ----
    b.updraft(-6, 0, 258, 34, 3.6);
    b.box(-6, 26, 286, 26, 2, 24);              // high final island
    b.ringLine({ x: -6, y: 8, z: 262 }, { x: -6, y: 24, z: 280 }, 8);

    // ---- FINAL: crystal garden + finish ----
    b.scatter(8, () => ({ x: -6 + (Math.random() - 0.5) * 20, y: 27, z: 286 + (Math.random() - 0.5) * 18 }), r => {
      const h = 2 + r() * 5;
      const c = new (T().Mesh)(new (T().OctahedronGeometry)(h * 0.4, 0), b.theme.neonMat(0x51ffb0, 1.2));
      c.position.y = h / 2;
      const g = new (T().Group)(); g.add(c); return g;
    });
    b.checkpoint(-6, 0, 236, 0);
    b.checkpoint(-6, 26, 276, 0);
    b.finishGate(-6, 26, 296, 0);

    b.spawn = { x: 0, y: 2, z: -6 };
  }

  /* ============================================================
     LEVEL 3 — FOUNDRY DEPTHS
     ============================================================ */
  function buildLevel3(b, T) {
    b.seed = 33;
    const W = b.world;
    const metalMat = b.theme.metalMat;

    // ---- ENTRY BAY (extends to meet the canyon — no spawn-trap gap) ----
    b.box(0, -1, 6, 24, 2, 32, { mat: metalMat });
    b.panel(0, 0, -2, 0, 1, { speed: 36 });

    // ---- CONVEYOR CANYON (long floor + hazards + walls) ----
    b.box(0, -1, 60, 18, 2, 84, { mat: metalMat });
    // lava strips flanking
    const lav1 = new (T().Mesh)(new (T().BoxGeometry)(6, 0.4, 80), b.theme.lavaGlow);
    lav1.position.set(-12.5, -0.6, 60); W.scene.add(lav1);
    const lav2 = lav1.clone(); lav2.position.x = 12.5; W.scene.add(lav2);
    // hazard pads
    b.hazard(-4, 0, 40, 3, 4);
    b.hazard(4, 0, 56, 3, 4);
    b.hazard(-4, 0, 72, 3, 4);
    // mines between pads
    b.enemy('mine', 0, 0, 48);
    b.enemy('mine', -3, 0, 64);
    b.enemy('turret', 7.5, 0, 68, -1, 0);
    b.ringLine({ x: 0, y: 1, z: 26 }, { x: 0, y: 1, z: 96 }, 10);

    // ---- PISTON PLATFORMS (moving) over lava gap ----
    b.box(0, -1, 112, 16, 2, 16, { mat: metalMat });
    b.platform([
      { x: 0, y: 1, z: 126 }, { x: 0, y: 1, z: 142 },
      { x: 0, y: 4, z: 156 }, { x: 0, y: 4, z: 170 },
    ], { size: { x: 6, y: 0.7, z: 6 }, speed: 5, color: 0x4a5468, accent: 0xff7a2f });
    // lower catwalk alternate
    b.box(-14, 0, 150, 6, 1, 44, { mat: metalMat });
    b.enemy('sentinel', -14, 0, 140, 0, 1, 6);
    b.shard(-14, 3, 168, 'foundry-catwalk');
    b.ringLine({ x: -14, y: 2.5, z: 134 }, { x: -14, y: 2.5, z: 166 }, 5);

    // ---- MELT SHAFT: vertical room with updrafts + wallruns ----
    b.box(0, -1, 188, 30, 2, 24, { mat: metalMat });
    b.wall(-12, 0, 196, 1.2, 12, 18, 0);         // west wall run
    b.updraft(0, 0, 196, 30, 4, 1.2);
    b.spring(10, 0, 188, { power: 26 });
    b.enemy('drone', -8, 6, 192, 3);
    b.enemy('drone', 8, 8, 200, 3);
    // shaft crossbeams + hazard vents (structure)
    b.box(-8, 6, 188, 6, 0.8, 3, { mat: metalMat });
    b.box(8, 9, 200, 6, 0.8, 3, { mat: metalMat });
    b.hazard(0, 0, 178, 6, 3);
    b.enemy('mine', 6, 0, 182);

    // ---- UPPER GANTRY LEVEL (y=12) ----
    b.box(0, 12, 214, 14, 1.2, 40, { mat: metalMat });
    b.rail([
      { x: -5, y: 14, z: 200 },
      { x: -5, y: 15, z: 224 },
      { x: 0, y: 16, z: 240 },
      { x: 8, y: 14, z: 256 },
      { x: 8, y: 12, z: 272 },
    ], { color: 0xff7a2f });
    b.shard(0, 18.5, 240, 'foundry-gantry');
    b.ringLine({ x: -5, y: 16, z: 204 }, { x: 8, y: 14, z: 268 }, 7);

    // ---- COOLING HALL: finale speed run ----
    b.box(0, -1, 290, 22, 2, 90, { mat: metalMat });
    b.panel(0, 0, 262, 0, 1, { speed: 40 });
    b.loop(0, 0, 306, 7, 0);
    b.hazard(5, 0, 322, 3, 5);
    b.enemy('mine', -4, 0, 316);
    b.enemy('drone', 0, 3, 336, 3);
    b.ringLine({ x: 0, y: 1, z: 286 }, { x: 0, y: 1, z: 328 }, 7);

    // ---- COOLANT TANKS: side platforms + turret nest ----
    b.box(18, 3, 292, 8, 6, 8, { mat: metalMat });
    b.box(-18, 5, 306, 8, 10, 8, { mat: metalMat });
    b.enemy('turret', -18, 10, 306, 1, 0);
    b.shard(18, 9.5, 292, 'foundry-tank');
    b.spring(0, 0, 282, { power: 24 });            // reach the tank route
    b.ringLine({ x: 9, y: 4, z: 290 }, { x: 16, y: 7, z: 292 }, 4);
    // wallrun channel between tanks
    b.wall(9, 0, 300, 1.2, 10, 22, 0);
    b.wall(-9, 0, 300, 1.2, 10, 22, 0);

    // checkpoints & finish
    b.checkpoint(0, 0, 104, 0);
    b.checkpoint(0, 0, 180, 0);
    b.checkpoint(0, 12, 232, 0);
    b.finishGate(0, 0, 330, 0);

    b.spawn = { x: 0, y: 2, z: -4 };
  }

  /* ============================================================
     LEVEL 4 — AURORA SUMMIT
     ============================================================ */
  function buildLevel4(b, T) {
    b.seed = 44;
    const W = b.world;

    // ---- BASE CAMP ----
    b.box(0, -1, 0, 24, 2, 24, { mat: b.theme.snowMat });
    b.panel(0, 0, 4, 0, 1, { speed: 36 });

    // ---- SWITCHBACKS: big downhill-to-uphill slopes ----
    b.ramp(0, 0.5, 26, 12, 3, 20, 0);            // up
    b.box(0, 2, 44, 16, 2, 16, { mat: b.theme.snowMat });
    b.ramp(0, 3.5, 60, 12, 4, 20, 0);            // up again
    b.box(0, 5.5, 78, 16, 2, 16, { mat: b.theme.snowMat });
    b.enemy('sentinel', 0, 5.5, 78, 1, 0, 5);
    b.ringLine({ x: 0, y: 2, z: 20 }, { x: 0, y: 7, z: 74 }, 8);

    // ---- ICE LAKE (low friction feel via panels + rails) ----
    b.box(0, 5.5, 116, 30, 2, 50, { mat: b.theme.iceMat });
    b.panel(0, 6, 100, 0, 1, { speed: 42, boostTime: 1.6 });
    b.enemy('drone', -8, 9, 112, 4);
    b.enemy('drone', 8, 9, 120, 4);
    b.ringLine({ x: 0, y: 8, z: 98 }, { x: 0, y: 8, z: 136 }, 8);

    // ---- THE CREVASSE: rail bridge across the gap ----
    b.rail([
      { x: 0, y: 8, z: 144 },
      { x: -4, y: 9, z: 164 },
      { x: 0, y: 11, z: 184 },
      { x: 6, y: 12, z: 204 },
      { x: 2, y: 12.5, z: 224 },
    ], { color: 0x7cf7d4 });
    b.ringLine({ x: 0, y: 10, z: 148 }, { x: 2, y: 12, z: 220 }, 8);
    // lower ledge alternate (wall-run canyon)
    b.wall(-14, 2, 160, 1.5, 14, 40, 0);
    b.wall(14, 2, 160, 1.5, 14, 40, 0);
    b.box(0, 1, 178, 10, 1, 26);                  // crevasse floor
    b.shard(0, 4, 186, 'summit-crevasse');
    b.spring(0, 1.5, 190, { power: 30 });          // escape the crevasse
    b.enemy('mine', -4, 1, 170);

    // ---- STORM RIDGE: wind + platforms + turrets ----
    b.box(2, 12, 244, 18, 2, 18, { mat: b.theme.snowMat });
    b.enemy('turret', 8, 12, 244, -1, 0);
    b.platform([
      { x: -6, y: 13, z: 262 }, { x: -6, y: 13, z: 276 },
    ], { size: { x: 5, y: 0.7, z: 5 }, speed: 4, accent: 0x7cf7d4 });
    b.box(-6, 13, 290, 12, 2, 14, { mat: b.theme.snowMat });
    b.checkpoint(2, 12, 238, 0);
    // ridge rock fins + wind-swept crystals (structure)
    b.box(14, 16, 252, 4, 10, 4, { mat: b.theme.rockMat });
    b.box(-14, 15, 268, 3, 8, 3, { mat: b.theme.rockMat });
    b.enemy('drone', 2, 16, 258, 4);
    b.ringLine({ x: 2, y: 14, z: 250 }, { x: -6, y: 14, z: 286 }, 5);

    // ---- SUMMIT ASCENT: spiraling updraft + ice steps ----
    b.updraft(-6, 13, 296, 30, 3.4, 1.3);
    b.box(-16, 20, 304, 8, 1, 8, { mat: b.theme.iceMat });
    b.box(-22, 24, 316, 8, 1, 8, { mat: b.theme.iceMat });
    b.box(-16, 28, 328, 8, 1, 8, { mat: b.theme.iceMat });
    b.shard(-22, 27.5, 316, 'summit-steps');
    b.ringLine({ x: -6, y: 18, z: 300 }, { x: -16, y: 30, z: 328 }, 7);

    // ---- AURORA CROWN: final loop + finish under the lights ----
    b.box(0, 28, 352, 30, 2, 34, { mat: b.theme.snowMat });
    b.loop(0, 28, 346, 7, 0);
    b.enemy('drone', -8, 31, 358, 3);
    b.enemy('drone', 8, 31, 360, 3);
    b.finishGate(0, 28, 364, 0);

    // ---- GLACIER DESCENT: long downhill speed spectacle (alternate finale) ----
    b.ramp(-34, 26, 352, 14, 22, 90, 1);          // big slope dropping toward -z... rises -z
    b.box(-34, 4.5, 396, 16, 2, 16, { mat: b.theme.snowMat });
    b.spring(-34, 5, 396, { power: 30 });
    b.box(-52, 12, 384, 10, 1, 10, { mat: b.theme.snowMat });
    b.shard(-52, 15.5, 384, 'summit-glacier');
    b.ringLine({ x: -34, y: 24, z: 330 }, { x: -34, y: 6, z: 392 }, 9);
    // glacier pillars (slalom at speed)
    b.box(-40, 14, 350, 3, 20, 3, { mat: b.theme.iceMat });
    b.box(-28, 10, 368, 3, 16, 3, { mat: b.theme.iceMat });
    b.box(-40, 7, 386, 3, 12, 3, { mat: b.theme.iceMat });
    b.enemy('drone', -34, 18, 360, 5);

    // ---- WEST CLIFF WALLRUN TRAVERSE (route back to the crown) ----
    b.wall(-18, 6, 340, 1.5, 16, 44, 0);           // tall cliff wall
    b.box(-30, 20, 322, 10, 1, 10, { mat: b.theme.iceMat });
    b.shard(-30, 23.5, 322, 'summit-cliff');
    b.updraft(-30, 20, 328, 16, 3);
    b.ringLine({ x: -20, y: 10, z: 332 }, { x: -28, y: 20, z: 324 }, 5);

    // ---- SUMMIT SPIRE RAIL: high line over everything ----
    b.rail([
      { x: 14, y: 32, z: 330 },
      { x: 6, y: 33, z: 350 },
      { x: 0, y: 34, z: 368 },
      { x: -8, y: 33, z: 386 },
      { x: -20, y: 30, z: 400 },
    ], { color: 0x7cf7d4 });
    b.ringLine({ x: 14, y: 34, z: 334 }, { x: -18, y: 31, z: 396 }, 7);
    b.shard(0, 36.5, 368, 'summit-spire');       // grab mid-rail (skill)
    b.enemy('drone', -2, 30, 376, 6);

    b.spawn = { x: 0, y: 2, z: -6 };
  }

  /* ================= LEVEL REGISTRY ================= */
  const LEVELS = [
    { id: 'neon-district', name: 'NEON DISTRICT', env: 'city', par: [55, 75, 100], targetShards: 3, build: buildLevel1 },
    { id: 'skyshard-isles', name: 'SKYSHARD ISLES', env: 'sky', par: [75, 100, 135], targetShards: 3, build: buildLevel2 },
    { id: 'foundry-depths', name: 'FOUNDRY DEPTHS', env: 'foundry', par: [85, 115, 155], targetShards: 3, build: buildLevel3 },
    { id: 'aurora-summit', name: 'AURORA SUMMIT', env: 'aurora', par: [95, 130, 175], targetShards: 4, build: buildLevel4 },
  ];

  window.VoltLevels = { LEVELS, LevelBuilder, makeTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltLevels;
})();
