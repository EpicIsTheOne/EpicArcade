// Boot, scene, lighting, camera controls, main loop, input shortcuts, debug API.
window.SB = window.SB || {};
(function () {
  const T = () => window.THREE;
  const C = () => window.CANNON;

  const S = window.SB;
  S.Stats = { fps: 0, booms: 0 };

  let renderer, scene, camera, controls;
  let timeScale = 1, targetTimeScale = 1;
  let paused = false;
  let simTime = 0;
  let lastT = performance.now();
  let ready = false;

  /* ---------- sky ---------- */
  function skyTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, '#5d93c9');
    grd.addColorStop(0.45, '#9cc0dd');
    grd.addColorStop(0.72, '#eadfc8');
    grd.addColorStop(1, '#dfd0b0');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 256);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function initGraphics() {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'view';
    document.getElementById('app').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xcfdcd4, 75, 235);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 420);
    camera.position.set(21, 14, 25);

    // lights
    const hemi = new THREE.HemisphereLight(0xbfd8ef, 0x8a7a58, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdfae, 1.35);
    sun.position.set(34, 46, 22);
    sun.castShadow = true;
    S.sun = sun;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 8; sc.far = 130;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x8899aa, 0.18));

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.2, 1);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3.5;
    controls.maxDistance = 95;
    controls.maxPolarAngle = 1.51;
    controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.addEventListener('start', () => { S.Tools.orbiting = true; });
    controls.addEventListener('end', () => { S.Tools.orbiting = false; });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    S.renderer = renderer; S.scene = scene; S.camera = camera; S.controls = controls;
  }

  function initPhysics() {
    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 11;
    S.world = world;
  }

  /* ---------- public controls ---------- */
  S.setGravity = function (g) {
    S.world.gravity.set(0, g, 0);
    for (const b of S.world.bodies) if (b.type === CANNON.Body.DYNAMIC) b.wakeUp();
  };
  S.setTimeScale = function (v) {
    targetTimeScale = Math.max(0.05, Math.min(1, v));
    S.UI.setSlowmoUI(targetTimeScale < 0.85);
  };
  S.togglePause = function () {
    paused = !paused;
    S.UI.setPausedUI(paused);
  };
  S.setShadows = function (on) {
    if (S.sun) S.sun.castShadow = !!on;
  };
  S.resetWorld = function (full) {
    S.WorldBuild.resetSandbox(full !== false);
  };
  S.clearToys = function () {
    S.Entities.clearAll(true);
    S.UI.toast('Toys cleared');
  };

  /* ---------- spawning from UI ---------- */
  const LIFT = { crate: 1.5, barrel: 1.5, ball: 1.4, plank: 1.3, boulder: 1.2, heavy: 1.5, foam: 1.4, pin: 1.3, bomb: 1.4, cart: 0.9, dummy: 0.35 };
  S.Spawner = {
    ui(kind) {
      let base;
      if (S.Tools.pointerOnCanvas) {
        const hit = S.Tools.pick();
        if (hit && hit.point) {
          base = { x: hit.point.x, z: hit.point.z };
        }
      }
      if (!base) base = { x: S.controls.target.x, z: S.controls.target.z };
      base.x = Math.max(-28, Math.min(28, base.x));
      base.z = Math.max(-28, Math.min(28, base.z));
      const y = LIFT[kind] != null ? LIFT[kind] : 1.4;
      const ent = S.Entities.spawn(kind, { x: base.x, y, z: base.z });
      if (ent) {
        S.Audio.swish();
        S.FX.spark({ x: base.x, y: y + 0.4, z: base.z }, 8, 3.5, null, 0.95, 0.85, 0.55);
      }
      return ent;
    },
  };

  /* ---------- keyboard ---------- */
  function initKeys() {
    const toolKeys = { g: 'grab', i: 'impulse', e: 'blast', r: 'link', f: 'freeze', c: 'dup', x: 'delete' };
    const spawnKeys = { 1: 'crate', 2: 'barrel', 3: 'ball', 4: 'plank', 5: 'boulder', 6: 'heavy', 7: 'foam', 8: 'pin', 9: 'bomb', 0: 'cart', t: 'dummy' };
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      const k = ev.key.toLowerCase();
      if (k === 'escape') {
        if (S.UI.helpOpen()) { S.UI.closeHelp(); return; }
        S.Tools.cancelLink();
        document.getElementById('settings').classList.remove('open');
        return;
      }
      if (ev.target && /input|textarea|select/i.test(ev.target.tagName)) return;
      if (k === 'h' || k === '?') {
        if (S.UI.helpOpen()) S.UI.closeHelp(); else S.UI.openHelp();
        return;
      }
      if (S.UI.helpOpen()) return;
      if (k === ' ') {
        ev.preventDefault();
        S.setTimeScale(timeScale < 0.5 ? 1 : 0.16);
        S.UI.toast(timeScale < 0.5 ? 'Normal speed' : 'Slow motion');
        syncSettingsUI();
        return;
      }
      if (k === 'p') { S.togglePause(); return; }
      if (toolKeys[k]) { S.Tools.setTool(toolKeys[k]); return; }
      if (spawnKeys[k] != null && spawnKeys[k] !== undefined) { S.Spawner.ui(spawnKeys[k]); return; }
      if (k === '=' || k === '+') { adjustMass(1.7); return; }
      if (k === '-' || k === '_') { adjustMass(1 / 1.7); return; }
    });
  }

  function adjustMult(mult) {
    const ent = S.Tools.hoveredEnt || S.Tools.grabbedEnt;
    if (!ent || ent.disposed) return null;
    const next = Math.max(0.1, Math.min(400, (ent.mass || 1) * mult));
    ent.setMass(next);
    S.Audio.thud(0.25, 600);
    S.UI.refreshBadge();
    return next;
  }
  function adjustMass(mult) {
    const v = adjustMult(mult);
    if (v != null) S.UI.toast(`Mass → ${Math.round(v * 10) / 10} kg`);
  }

  function syncSettingsUI() { /* sliders reflect state lazily; fine */ }

  /* ---------- main loop ---------- */
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    let dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // smooth time-scale ramp (buttery slow-mo)
    timeScale += (targetTimeScale - timeScale) * Math.min(1, dt * 9);

    const simDt = paused ? 0 : dt * timeScale;
    simTime += simDt;

    if (!paused) {
      S.Tools.tick(dt, simDt);
      S.Entities.updateExplosives(simDt);
      try {
        S.world.step(1 / 120, simDt, 10);
      } catch (e) { /* physics blowups shouldn't kill the frame */ }
      syncEntities();
      killPlane();
      S.FX.update(Math.max(0.0005, simDt));
      budgetTick(dt);
    } else {
      S.FX.update(Math.max(0.0005, dt * 0.15)); // gentle settle of live fx while paused
    }

    controls.update();

    // camera shake (applied around render only)
    const off = S.FX.shakeOff;
    camera.position.x += off.x; camera.position.y += off.y; camera.position.z += off.z;
    renderer.render(scene, camera);
    camera.position.x -= off.x; camera.position.y -= off.y; camera.position.z -= off.z;

    S.UI.tick(dt);
  }

  function syncEntities() {
    const interpOK = true;
    for (const e of S.Entities.values()) {
      if (e.disposed) continue;
      if (e.customSync) { e.customSync(); continue; }
      const b = e.bodies[0], m = e.meshes[0];
      if (!b || !m) continue;
      if (b.type === CANNON.Body.DYNAMIC && b.interpolatedPosition && interpOK) {
        m.position.copy(b.interpolatedPosition);
        if (b.interpolatedQuaternion) m.quaternion.copy(b.interpolatedQuaternion);
      } else {
        m.position.copy(b.position);
        m.quaternion.copy(b.quaternion);
      }
    }
  }

  function killPlane() {
    const gone = [];
    for (const e of S.Entities.values()) {
      if (e.pinned || e.disposed || !e.bodies.length) continue;
      const p = e.bodies[0].position;
      if (p.y < -38 || Math.abs(p.x) > 110 || Math.abs(p.z) > 110) gone.push(e);
    }
    gone.forEach(e => e.dispose(true));
  }

  let budgetTimer = 0;
  function budgetTick(dt) {
    budgetTimer += dt;
    if (budgetTimer < 0.7) return;
    budgetTimer = 0;
    S.Entities.enforceBudget(240, 7);
  }

  /* ---------- debug / test API ---------- */
  S.debug = {
    info() {
      let dyn = 0;
      for (const b of S.world.bodies) if (b.type === CANNON.Body.DYNAMIC) dyn++;
      return {
        fps: S.Stats.fps, ents: S.Entities.size(), dynBodies: dyn,
        links: S.Links.count(), paused, timeScale: +timeScale.toFixed(3),
        booms: S.Stats.booms, gravity: +S.world.gravity.y.toFixed(2),
      };
    },
    spawnN(kind, n, cx, cz, spread) {
      cx = cx == null ? 0 : cx; cz = cz == null ? -4 : cz; spread = spread == null ? 3 : spread;
      const out = [];
      for (let i = 0; i < n; i++) {
        const x = cx + (Math.random() - .5) * spread, z = cz + (Math.random() - .5) * spread;
        out.push(S.Entities.spawn(kind, { x, y: 3 + Math.random() * 2, z }));
      }
      return out.length;
    },
    stack(n) {
      n = n || 6;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const e = S.Entities.spawn('crate', { x: -3, y: 0.47 + i * 0.87, z: -6 });
        if (!e) continue;
        e.setPosition(-3, 0.47 + i * 0.87, -6);
        count++;
      }
      return count;
    },
    boom(px, py, pz, power) {
      S.Tools.explode({ x: px == null ? 0 : px, y: py == null ? 0.8 : py, z: pz == null ? 6 : pz }, 7.2, power || 27, false);
    },
    armBombAt(x, z) {
      const b = S.Entities.spawn('bomb', { x, y: 1.2, z });
      S.Entities.ignite(b, 1.0);
      return b;
    },
    tossDummy() {
      const d = S.Entities.spawn('dummy', { x: 12, y: 5, z: 10 });
      if (!d) return false;
      d.bodies.forEach((b, i) => { b.velocity.set(-7, 2.5, -6); b.angularVelocity.set(3, 2, 4); });
      return true;
    },
    zeroG(on) {
      S.setGravity(on === false ? -9.82 : 0);
      S.UI.toast(on === false ? 'Gravity restored' : 'Zero-g!');
      if (on !== false) {
        for (let i = 0; i < 9; i++) {
          const b = S.Entities.spawn(i % 3 === 0 ? 'ball' : (i % 3 === 1 ? 'crate' : 'foam'),
            { x: (Math.random() - .5) * 12, y: 2.5 + Math.random() * 6, z: (Math.random() - .5) * 12 });
          const bb = b.bodies[0];
          bb.velocity.set((Math.random() - .5) * 6, 2 + Math.random() * 3, (Math.random() - .5) * 6);
          bb.angularVelocity.set((Math.random() - .5) * 4, (Math.random() - .5) * 4, (Math.random() - .5) * 4);
        }
      }
    },
    slowmo(v) { S.setTimeScale(v == null ? 0.15 : v); },
    async shot(name) {
      renderer.render(scene, camera);
      const data = renderer.domElement.toDataURL('image/png');
      try {
        const r = await fetch('/__shot', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, data }),
        });
        return await r.text();
      } catch (e) {
        return 'err ' + e.message;
      }
    },
  };

  /* ---------- boot ---------- */
  function boot() {
    if (!window.THREE || !window.CANNON) {
      fail('Core libraries failed to load.');
      return;
    }
    try {
      initGraphics();
      initPhysics();
      S.Mats.build();
      S.FX.init(scene, camera);
      // keep fx objects out of picking (layer 1)
      [S.FX.add.points, S.FX.smoke.points, S.FX.debris.mesh, ...S.FX.rings.pool.map(r => r.mesh)]
        .forEach(o => o.layers.set(1));

      S.WorldBuild.setupPhysics();
      S.WorldBuild.buildStatics();
      S.Tools.init();
      S.UI.build();
      S.UI.syncDock('grab');
      S.Tools.setTool('grab');
      S.WorldBuild.buildPresets({ full: true });
      initKeys();

      try {
        const v = parseFloat(localStorage.getItem('sb-vol'));
        if (!isNaN(v)) S.Audio.setVolume(v);
      } catch (e) {}

      // fps meter
      let fa = 0, fn = 0, flast = performance.now();
      setInterval(() => {
        const now = performance.now();
        S.Stats.fps = Math.round(fn / Math.max(0.001, (now - flast) / 1000));
        flast = now; fa = 0; fn = 0;
      }, 600);
      const wrapRender = () => {};
      let frames = 0;
      const countFrame = () => { frames++; fn++; requestAnimationFrame(countFrame); };
      requestAnimationFrame(countFrame);

      ready = true;
      window.__sbReady = true;
      loop();
    } catch (e) {
      console.error(e);
      fail(e.message || String(e));
    }
  }

  function fail(msg) {
    const el = document.getElementById('boot-fail');
    el.hidden = false;
    document.getElementById('fail-msg').textContent = msg || 'Unknown error';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
