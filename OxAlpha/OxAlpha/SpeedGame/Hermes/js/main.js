/* ============================================================
   VOLT RUSH — main.js
   Game orchestrator: boot, input, level lifecycle, FX wiring,
   render loop, graphics quality tiers.
   UI screens live in ui.js (window.VoltUI).
   ============================================================ */
(function () {
  'use strict';
  const T = () => window.THREE;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  const Game = {
    renderer: null, scene: null, camera: null, composer: null, bloom: null,
    world: null, player: null, chase: null, character: null,
    hud: null, audio: null,
    levelIndex: 0, levelDef: null, builder: null,
    rings: null, shards: null,
    state: 'boot',            // boot | title | playing | paused | results
    time: 0, levelTime: 0,
    stats: null,
    quality: localStorage.getItem('voltrush.quality') || 'high',
    keys: {}, mouseDown: false,
    _raf: null, _lastT: 0, _acc: 0,
    _fpsSamples: [],
  };

  window.VoltGame = Game;

  /* radial-gradient sprite texture for soft round particles */
function makeSoftSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx2 = c.getContext('2d');
  const g = ctx2.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx2.fillStyle = g;
  ctx2.fillRect(0, 0, 64, 64);
  const tex = new (T().CanvasTexture)(c);
  return tex;
}

/* ================= BOOT ================= */
  function boot() {
    const canvas = document.getElementById('game-canvas');
    const status = document.getElementById('load-status');

    status.textContent = 'Igniting renderer…';
    Game.renderer = new (T().WebGLRenderer)({
      canvas, antialias: Game.quality !== 'low', powerPreference: 'high-performance', stencil: false,
    });
    Game.renderer.setSize(window.innerWidth, window.innerHeight);
    Game.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Game.quality === 'ultra' ? 2 : 1.5));
    Game.renderer.shadowMap.enabled = Game.quality !== 'low';
    Game.renderer.shadowMap.type = T().PCFSoftShadowMap;
    Game.renderer.outputEncoding = T().sRGBEncoding;
    Game.renderer.toneMapping = T().ACESFilmicToneMapping;
    Game.renderer.toneMappingExposure = 1.05;

    Game.scene = new (T().Scene)();
    Game.camera = new (T().PerspectiveCamera)(74, window.innerWidth / window.innerHeight, 0.1, 1600);
    Game.camera.position.set(0, 8, 14);

    status.textContent = 'Weaving post-processing…';
    const Composer = T().EffectComposer;
    if (Composer) {
      Game.composer = new Composer(Game.renderer);
      Game.composer.addPass(new (T().RenderPass)(Game.scene, Game.camera));
      if (T().UnrealBloomPass) {
        Game.bloom = new (T().UnrealBloomPass)(
          new (T().Vector2)(window.innerWidth, window.innerHeight), 0.45, 0.6, 0.92);
        Game.composer.addPass(Game.bloom);
      }
    }

    status.textContent = 'Charging physics core…';
    Game.world = new VoltWorld.World(Game.scene);
    Game.player = new VoltPlayer.Player(Game.scene, Game.world);
    Game.chase = new VoltCamera.ChaseCamera(Game.camera, Game.world);

    // rail/loop registries for the player
    VoltPlayer.registerRailsFn(() => Game.builder ? Game.builder.rails : []);
    VoltPlayer.registerLoopsFn(() => Game.builder ? Game.builder.loops : []);

    // character model
    Game.character = VoltCharacter.createCharacter();
    Game.scene.add(Game.character.group);

    // fx pools — soft circular sprite so particles never render as squares
    const softTex = makeSoftSprite();
    Game.fx = {
      speed: new VoltWorld.ParticlePool(Game.scene, 260, 0x9fdcff, 0.14, true, softTex),
      impact: new VoltWorld.ParticlePool(Game.scene, 160, 0xffd08a, 0.18, true, softTex),
      collect: new VoltWorld.ParticlePool(Game.scene, 140, 0xffe27a, 0.16, true, softTex),
      explosion: new VoltWorld.ParticlePool(Game.scene, 200, 0xff9a5c, 0.2, true, softTex),
    };
    Game.fx.explosionBurst = (x, y, z) => Game.fx.explosion.burst(x, y, z, 26, 9, 0.8, 3);
    Game.fx.collectBurst = (x, y, z) => Game.fx.collect.burst(x, y, z, 8, 4, 0.5, 2);
    Game.fx.impactBurst = (x, y, z, n) => Game.fx.impact.burst(x, y, z, n || 10, 5, 0.5, 2);

    Game.hud = new VoltCollect.HUD();
    Game.audio = window.VoltAudio;

    wirePlayerEvents();
    wireInput();
    window.addEventListener('resize', onResize);
    applyQuality(Game.quality);

    status.textContent = 'Mapping the sectors…';
    VoltUI.init(Game);

    // start render loop even on title (menu backdrop = live level preview later)
    Game.state = 'title';
    buildLevel(0, true);
    Game._lastT = performance.now();
    Game._raf = requestAnimationFrame(loop);

    setTimeout(() => {
      document.getElementById('loading-screen').classList.add('fade');
      VoltUI.showTitle();
    }, 500);
  }

  /* ================= LEVEL LIFECYCLE ================= */
  function buildLevel(idx, previewMode) {
    // teardown previous
    if (Game.builder) {
      for (const e of Game.builder.enemies) e.dispose();
      for (const r of Game.builder.rails) r.dispose(Game.world.scene);
      Game.world.clear();
      // remove leftover level children — PRESERVE lights, sky, aurora, character & fx
      const keep = new Set([Game.character.group]);
      if (Game.sunLight) { keep.add(Game.sunLight); keep.add(Game.sunLight.target); }
      for (const fx of Object.values(Game.fx)) if (fx.points) keep.add(fx.points);
      for (let i = Game.scene.children.length - 1; i >= 0; i--) {
        const c = Game.scene.children[i];
        const isLight = c.isDirectionalLight || c.isHemisphereLight || c.isAmbientLight ||
          (c.type && c.type.includes('Light'));
        const isSky = c.geometry && c.geometry.type === 'SphereGeometry';
        const isAurora = c === Game.auroraRibbons;
        if (!keep.has(c) && !isLight && !isSky && !isAurora) { Game.scene.remove(c); }
      }
    }
    Game.levelIndex = idx;
    Game.levelDef = VoltLevels.LEVELS[idx];
    const theme = VoltLevels.makeTheme(T(), Game.levelDef.env);
    Game.theme = theme;
    applyEnvironment(theme);

    const b = new VoltLevels.LevelBuilder(T(), Game.world, theme);
    Game.levelDef.build(b, T);
    Game.builder = b;

    // collectibles
    Game.rings = new VoltCollect.RingField(Game.scene, b.rings);
    Game.shards = new VoltCollect.ShardSet(Game.scene, b.shards);

    // player spawn
    Game.player.spawn = { ...b.spawn };
    Game.player.checkpoint = { ...b.spawn, yaw: Math.PI };
    Game.player.respawn(false);
    Game.player.rings = 0;
    // face INTO the level: levels extend toward +Z, camera-forward must match
    Game.chase.yaw = Math.PI; Game.chase.pitch = 0.18;
    Game.chase.pos.set(b.spawn.x, b.spawn.y + 6, b.spawn.z - 12);
    Game.chase.upSm.set(0, 1, 0);            // re-level camera after any loop/respawn

    // checkpoint triggers
    for (const cp of b.checkpoints) {
      const t = Game.world.triggers.find(tr => tr.ref === cp);
      if (t) t.onEnter = () => {
        if (Game.player.checkpoint.idx !== cp.idx) {
          Game.player.checkpoint = { x: cp.pos.x, y: cp.pos.y, z: cp.pos.z, yaw: 0, idx: cp.idx };
          cp.setLit(true);
          Game.audio.play('checkpoint');
          Game.hud.centerMsg('CHECKPOINT', 1200);
        }
      };
    }
    // finish trigger
    if (b.finish) {
      const t = Game.world.triggers.find(tr => tr.ref === b.finish);
      if (t) t.onEnter = () => finishLevel();
    }

    Game.stats = {
      time: 0, rings: 0, ringTotal: b.rings.length,
      shards: 0, shardTotal: b.shards.length,
      kills: 0, damage: 0, deaths: 0,
      maxSpeed: 0, airTime: 0, grindTime: 0,
    };
    Game.levelTime = 0;
    Game.hud.setRings(0);
    Game.hud.setShards(0, b.shards.length);
    Game.hud.setTime(0);
    Game.hud.centerMsg(Game.levelDef.name, 2000);
  }

  function startLevel(idx) {
    buildLevel(idx, false);
    Game.state = 'playing';
    Game.audio.unlock();
    document.getElementById('hud').classList.remove('hidden');
    Game.hud.centerMsg('GO!', 900);
  }

  function finishLevel() {
    if (Game.state !== 'playing') return;
    Game.state = 'results';
    Game.audio.play('finish');
    document.exitPointerLock && document.exitPointerLock();
    VoltUI.showResults(Game);
  }

  function computeRank(s, levelDef) {
    let score = 100;
    const par = levelDef.par;
    if (s.time < par[0]) score += 20;
    else if (s.time < par[1]) score += 10;
    else if (s.time > par[2]) score -= 15;
    const ringPct = s.ringTotal ? s.rings / s.ringTotal : 1;
    score += ringPct * 15 - 5;
    const shardPct = s.shardTotal ? s.shards / s.shardTotal : 1;
    score += shardPct * 10;
    score += Math.min(10, s.kills * 2);
    score -= s.damage * 6 + s.deaths * 8;
    if (s.deaths === 0 && s.damage === 0) score += 5;
    score = clamp(score, 0, 135);
    if (score >= 115) return 'S';
    if (score >= 100) return 'A';
    if (score >= 82) return 'B';
    if (score >= 62) return 'C';
    return 'D';
  }

  /* ================= ENVIRONMENT / SKY ================= */
  let sunLight = null, hemiLight = null, ambLight = null, skyMesh = null;
  function applyEnvironment(theme) {
    // lights
    if (!sunLight) {
      sunLight = new (T().DirectionalLight)(0xffffff, 1);
      sunLight.castShadow = true;
      const S = 90;
      sunLight.shadow.camera.left = -S; sunLight.shadow.camera.right = S;
      sunLight.shadow.camera.top = S; sunLight.shadow.camera.bottom = -S;
      sunLight.shadow.camera.far = 400;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.bias = -0.0004;
      Game.scene.add(sunLight);
      Game.sunLight = sunLight;
      hemiLight = new (T().HemisphereLight)(0x8899cc, 0x223344, 0.6);
      Game.scene.add(hemiLight);
      ambLight = new (T().AmbientLight)(0xffffff, 0.25);
      Game.scene.add(ambLight);
    }
    sunLight.color.setHex(theme.sunColor);
    sunLight.intensity = theme.sunInt;
    hemiLight.intensity = theme.hemi ? 0.55 : 0.2;
    ambLight.color.setHex(theme.amb);
    ambLight.intensity = Math.max(0.55, theme.ambInt);   // floor: keep silhouettes readable

    // sky dome
    if (skyMesh) { Game.scene.remove(skyMesh); skyMesh.geometry.dispose(); skyMesh = undefined; }
    const skyGeo = new (T().SphereGeometry)(1200, 24, 16);
    const skyMat = new (T().ShaderMaterial)({
      side: T().BackSide, depthWrite: false,
      uniforms: {
        top: { value: new (T().Color)(theme.sky) },
        bottom: { value: new (T().Color)(theme.fog) },
        accent: { value: new (T().Color)(theme.accent) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; uniform vec3 accent;',
        'void main(){',
        '  float h = normalize(vP).y * 0.5 + 0.5;',
        '  vec3 c = mix(bottom, top, smoothstep(0.0, 0.6, h));',
        '  float glow = pow(max(0.0, 1.0 - abs(normalize(vP).y) * 3.0), 2.0);',
        '  c += accent * glow * 0.12;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'),
    });
    skyMesh = new (T().Mesh)(skyGeo, skyMat);
    Game.scene.add(skyMesh);

    Game.scene.fog = new (T().Fog)(theme.fog, theme.fogNear, theme.fogFar);

    // aurora ribbons for summit
    Game.auroraRibbons = null;
    if (theme.auroraMats) {
      const grp = new (T().Group)();
      for (let i = 0; i < 5; i++) {
        const g = new (T().PlaneGeometry)(300, 60, 24, 4);
        const m = theme.auroraMats[i % theme.auroraMats.length];
        const mesh = new (T().Mesh)(g, m);
        mesh.position.set((i - 2) * 120 + Math.random() * 40, 90 + Math.random() * 50, -200 - Math.random() * 150);
        mesh.rotation.z = (Math.random() - 0.5) * 0.3;
        grp.add(mesh);
      }
      Game.scene.add(grp);
      Game.auroraRibbons = grp;
    }
  }

  /* ================= QUALITY ================= */
  function applyQuality(q) {
    Game.quality = q;
    localStorage.setItem('voltrush.quality', q);
    const r = Game.renderer;
    r.shadowMap.enabled = q !== 'low';
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'ultra' ? 2 : (q === 'high' ? 1.5 : 1)));
    if (Game.bloom) Game.bloom.enabled = q !== 'low';
    if (Game.sunLight) {
      const S = q === 'ultra' ? 110 : 90;
      Game.sunLight.shadow.camera.left = -S; Game.sunLight.shadow.camera.right = S;
      Game.sunLight.shadow.camera.top = S; Game.sunLight.shadow.camera.bottom = -S;
      Game.sunLight.shadow.mapSize.set(q === 'ultra' ? 4096 : 2048, q === 'ultra' ? 4096 : 2048);
      Game.sunLight.shadow.map && Game.sunLight.shadow.map.dispose();
      Game.sunLight.shadow.map = null;
    }
    VoltUI.syncQualityButtons(q);
  }
  Game.applyQuality = applyQuality;

  /* ================= INPUT ================= */
  function wireInput() {
    const canvas = document.getElementById('game-canvas');

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      Game.keys[e.code] = true;
      // UI never triggers gameplay: gameplay reads Game.keys only while playing
      if (e.code === 'Escape' && Game.state === 'playing') VoltUI.pauseGame();
      else if (e.code === 'Escape' && Game.state === 'paused') VoltUI.resumeGame();
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { Game.keys[e.code] = false; });

    window.addEventListener('blur', () => {
      Game.keys = {};                    // recover controls after focus loss
      if (Game.state === 'playing') VoltUI.pauseGame();
    });

    canvas.addEventListener('click', () => {
      if (Game.state === 'playing' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (Game.state === 'playing' && document.pointerLockElement !== canvas) {
        VoltUI.pauseGame();
      }
    });
    document.addEventListener('mousemove', e => {
      if (Game.state === 'playing' && document.pointerLockElement === canvas) {
        Game.chase.applyMouse(e.movementX || 0, e.movementY || 0);
      }
    });
    window.addEventListener('contextmenu', e => { if (Game.state === 'playing') e.preventDefault(); });
  }

  function readInput() {
    const k = Game.keys;
    return {
      up: !!(k['KeyW'] || k['ArrowUp']),
      down: !!(k['KeyS'] || k['ArrowDown']),
      left: !!(k['KeyA'] || k['ArrowLeft']),
      right: !!(k['KeyD'] || k['ArrowRight']),
      jump: !!k['Space'],
      jumpPressed: !!Game._jumpEdge,
      drift: !!k['ShiftLeft'] || !!k['ShiftRight'],
      dash: !!k['ShiftLeft'] || !!k['ShiftRight'],
      qsL: !!Game._qsLEdge,
      qsR: !!Game._qsREdge,
    };
  }

  // edge-trigger tracking (jump/quickstep fire once per press)
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat) Game._jumpEdge = true;
    if (e.code === 'KeyQ' && !e.repeat) Game._qsLEdge = true;
    if (e.code === 'KeyE' && !e.repeat) Game._qsREdge = true;
  });

  /* ================= PLAYER EVENT WIRING ================= */
  function wirePlayerEvents() {
    const P = Game.player, A = Game.audio, H = Game.hud, fx = Game.fx;
    P.on('jump', () => { A.play('jump'); fx.impactBurst(P.pos.x, P.pos.y, P.pos.z, 6); });
    P.on('doublejump', () => { A.play('doubleJump'); fx.speed.burst(P.pos.x, P.pos.y + 0.4, P.pos.z, 8, 3, 0.4); });
    P.on('land', h => {
      A.play('land', h > 0.5);
      Game.character.triggerLand(h);
      fx.impactBurst(P.pos.x, P.pos.y, P.pos.z, Math.round(6 + h * 12));
      if (h > 0.6) Game.chase.addShake(0.25);
    });
    P.on('dash', () => { A.play('dash'); Game.chase.addFovKick(10); });
    P.on('boost', () => { A.play('dash'); Game.chase.addFovKick(8); });
    P.on('driftdash', tier => {
      A.play('dash'); Game.chase.addFovKick(12);
      H.combo(['', 'DRIFT BOOST!', 'SUPER DRIFT!', 'ULTRA DRIFT!'][tier] || 'DRIFT BOOST!');
      fx.speed.burst(P.pos.x, P.pos.y, P.pos.z, 14, 5, 0.5);
    });
    P.on('railenter', () => { A.play('railStart'); H.combo('GRIND!'); });
    P.on('railjump', () => A.play('jump'));
    P.on('wallrun', () => { A.play('wallrun'); H.combo('WALL RUN!'); });
    P.on('walljump', () => A.play('jump'));
    P.on('surge', () => { A.play('homing'); Game.character.setState('surge'); });
    P.on('quickstep', () => A.play('ui'));
    P.on('ringslost', n => {
      A.play('hurt'); H.damageFlash(); Game.chase.addShake(0.5);
      H.combo(`-${n} RINGS`);
    });
    P.on('death', () => {
      Game.stats && Game.stats.deaths++;
      A.play('death');
      document.getElementById('death-overlay').classList.remove('hidden');
      setTimeout(() => document.getElementById('death-overlay').classList.add('hidden'), 1300);
    });
    P.on('respawned', () => { A.play('respawn'); Game.chase.addShake(0.3); });
  }

  /* ================= GAME HELPERS USED BY PLAYER ================= */
  Game.nearestTarget = function (pos, range, vel) {
    if (!Game.builder) return null;
    let best = null, bestD = range * range;
    for (const e of Game.builder.enemies) {
      if (!e.alive || e.kind === 'mine') continue;
      const dx = e.pos.x - pos.x, dy = (e.pos.y + e.hitY) - (pos.y + 0.8), dz = e.pos.z - pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  };
  Game.hitTarget = function (tgt, player) {
    if (!tgt.alive) return;
    tgt.die(Game);
    Game.stats && Game.stats.kills++;
    Game.audio.play('explode');
    Game.fx.explosionBurst(tgt.pos.x, tgt.pos.y, tgt.pos.z);
    Game.chase.addShake(0.3);
    Game.chase.addFovKick(6);
    const combo = ++Game._killCombo && (Game._killComboT = 2.0);
    Game.hud.combo(['', 'SURGE!', 'DOUBLE SURGE!', 'TRIPLE SURGE!', 'SURGE STORM!'][Math.min(4, Game._killCombo)] || 'SURGE STORM!');
  };
  Game.onEnemyKilled = function (e) { /* reserved for drops */ };
  Game.shake = a => Game.chase.addShake(a);

  /* ================= MAIN LOOP ================= */
  function loop(now) {
    Game._raf = requestAnimationFrame(loop);
    let dt = (now - Game._lastT) / 1000;
    Game._lastT = now;
    if (dt > 0.1) dt = 0.1;             // clamp huge frames (tab switch)
    Game.time += dt;

    const playing = Game.state === 'playing';

    if (playing) {
      Game.levelTime += dt;
      Game.stats.time = Game.levelTime;

      // kill-combo decay
      if (Game._killComboT > 0) { Game._killComboT -= dt; if (Game._killComboT <= 0) Game._killCombo = 0; }

      // traversal object updates
      const b = Game.builder;
      for (const s of b.springs) s.update(dt);
      for (const p of b.panels) p.update(dt, Game.time);
      for (const pl of b.platforms) pl.update(dt);
      for (const u of b.updrafts) u.update(dt, Game.time);
      for (const e of b.enemies) if (e.alive) e.update(dt, Game.player, Game);

      // player grabs & sim
      const input = readInput();
      Game.player.tryGrabs(Game);
      Game.player.tickBoost(dt);
      Game.player.update(dt, input, Game.chase.yaw, Game);

      // loop orientation info for camera/character
      const P = Game.player;
      if (P.state === 'loop' && P.loop) {
        const tan = P.loop.spline.getTangentAt(clamp(P.loopS, 0, P.loop.spline.totalLength), {});
        P.loopUp = { x: -tan.z * P.loopDir, y: tan.x * 0 + (1 - Math.abs(tan.y)) * 0.0, z: tan.x * P.loopDir };
        // proper up: radial from loop center
        const c = P.loop.center;
        const rx = P.pos.x - c.x, ry = P.pos.y - c.y, rz = P.pos.z - c.z;
        const rl = Math.hypot(rx, ry, rz) || 1;
        P.loopUp = { x: rx / rl, y: ry / rl, z: rz / rl };
      } else if (P.state === 'rail' && P.rail) {
        const tan = P.rail.spline.getTangentAt(clamp(P.railS, 0, P.rail.spline.totalLength), {});
        const L = Math.hypot(tan.x, tan.z) || 1;
        P.railUp = { x: -tan.z / L, y: 0, z: tan.x / L };
      }

      // character animation state
      const st = {
        speed: P.speed(), maxSpeed: 30, grounded: P.state === 'ground',
        grinding: P.state === 'rail', wallrun: P.state === 'wall',
        surging: P.state === 'surge', boosting: P.boostTimer > 0,
        driftDir: P.drift, vy: P.vel.y,
        state: P.state === 'rail' ? 'run' : (P.state === 'surge' ? 'surge'
          : (P.state === 'ground' ? (P.speed() > 20 ? 'sprint' : 'run')
            : (P.vel.y > 1 ? 'jump' : 'fall'))),
      };
      Game.character.group.position.set(P.pos.x, P.pos.y, P.pos.z);
      Game.character.group.rotation.y = P.heading;
      // loop/wall tilt: roll the body around its forward axis
      if (P.state === 'loop' && P.loopUp) {
        Game.character.group.up.set(P.loopUp.x, P.loopUp.y, P.loopUp.z);
      } else if (P.state === 'rail' && P.railUp) {
        Game.character.group.up.set(P.railUp.x, 1, P.railUp.z);
      } else {
        Game.character.group.up.set(0, 1, 0);
      }
      Game.character.update(dt, st);
      if (P.state !== 'surge') Game.character.setState(st.state);

      // speed FX
      const sp01 = clamp(P.speed() / 60, 0, 1);
      if (sp01 > 0.45) {
        // wind streaks behind player
        const n = Math.floor((sp01 - 0.45) * 14);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.4;
          const bx = P.pos.x + Math.cos(a) * r, bz = P.pos.z + Math.sin(a) * r;
          Game.fx.speed.spawn(bx, P.pos.y + 0.2 + Math.random() * 1.2, bz,
            -P.vel.x * 0.4, 1 + Math.random(), -P.vel.z * 0.4, 0.35);
        }
      }
      if (P.state === 'ground' && sp01 > 0.3) {
        // ground dust
        if (Math.random() < sp01 * 0.8) {
          Game.fx.speed.spawn(P.pos.x - P.vel.x * 0.05, P.pos.y + 0.1, P.pos.z - P.vel.z * 0.05,
            (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.4);
        }
      }

      // collectibles
      const got = Game.rings.update(P, dt, Game.time, (d, i) => {
        Game.stats.rings++;
        P.rings++;
        Game.audio.play('ring', Math.min(12, Game._ringPitch = (Game._ringPitch || 0) + 1));
        Game.fx.collectBurst(d.x, d.y, d.z);
      });
      if (!got) Game._ringPitch = 0;
      Game.shards.update(P, dt, Game.time, (d, i) => {
        Game.stats.shards++;
        Game.audio.play('gem');
        Game.fx.collectBurst(d.x, d.y, d.z);
        Game.hud.combo(`DATA SHARD  ${Game.stats.shards}/${Game.stats.shardTotal}`);
        Game.chase.addFovKick(6);
      });

      // hazards contact (mines handled in enemy update)
      // camera
      Game.chase.update(dt, P, Game);

      // streaming
      Game.world.updateStreaming(P.pos.x, P.pos.z, P.vel.x, P.vel.z);

      // sun follows player (shadow camera)
      Game.sunLight.position.set(P.pos.x + 60, P.pos.y + 90, P.pos.z + 40);
      Game.sunLight.target.position.set(P.pos.x, P.pos.y, P.pos.z);
      Game.sunLight.target.updateMatrixWorld();
      Game.scene.add && Game.sunLight.target.parent !== Game.scene && Game.scene.add(Game.sunLight.target);

      // audio dynamics
      Game.audio.setWind(sp01, dt);
      Game.audio.setIntensity(0.35 + sp01 * 0.65 + (P.boostTimer > 0 ? 0.15 : 0));

      // HUD
      Game.hud.setRings(P.rings);
      Game.hud.setShards(Game.stats.shards, Game.stats.shardTotal);
      Game.hud.setTime(Game.levelTime);
      Game.hud.setSpeed(sp01, P.speed() * 3.6);
      Game.hud.boostPips(P.boostTimer > 0 ? 3 : (P.driftTier >= 2 ? 2 : (P.driftTier >= 1 ? 1 : 0)));
      Game.hud.setState(P.state.toUpperCase());

      // fps sample
      Game._fpsSamples.push(dt); if (Game._fpsSamples.length > 60) Game._fpsSamples.shift();
    } else {
      // title/results idle: slow orbit around level
      const b = Game.builder;
      if (b) {
        const a = Game.time * 0.1;
        const cx = b.spawn.x, cz = b.spawn.z;
        Game.camera.position.set(cx + Math.cos(a) * 26, b.spawn.y + 12, cz + Math.sin(a) * 26);
        Game.camera.up.set(0, 1, 0);
        Game.camera.lookAt(cx, b.spawn.y + 2, cz);
        for (const e of b.enemies) if (e.alive) e.update(dt, null, Game);
        for (const pl of b.platforms) pl.update(dt);
        for (const p of b.panels) p.update(dt, Game.time);
      }
    }

    // fx always update
    for (const fx of Object.values(Game.fx)) {
      if (fx instanceof VoltWorld.ParticlePool) fx.update(dt);
    }

    // render
    if (Game.composer && Game.quality !== 'low') Game.composer.render();
    else Game.renderer.render(Game.scene, Game.camera);

    // clear one-shot edges
    Game._jumpEdge = false; Game._qsLEdge = false; Game._qsREdge = false;
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    Game.camera.aspect = w / h;
    Game.camera.updateProjectionMatrix();
    Game.renderer.setSize(w, h);
    if (Game.composer) Game.composer.setSize(w, h);
  }

  Game.buildLevel = buildLevel;
  Game.startLevel = startLevel;
  Game.computeRank = computeRank;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})();
