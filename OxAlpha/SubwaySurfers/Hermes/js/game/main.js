// SKYLINE RUSH - main game orchestrator.
// World moves toward +Z; the player stays near z=0. Chunk k occupies world z
// [-(k+1)*L, -k*L). Player forward = -Z direction of travel, rendered with
// camera looking down -Z at the runner from behind.
(function (root) {
  function $(id) { return document.getElementById(id); }
  var G = { state: 'boot' };   // boot|menu|running|paused|over
  root.Game = G;

  // ---------- logging (QA evidence) ----------
  var LOGN = 400;
  G.logRing = [];
  function logEv(kind, data) {
    G.logRing.push({ t: performance.now(), kind: kind, d: data || null });
    if (G.logRing.length > LOGN) G.logRing.shift();
    if (root.SRLog) root.SRLog('[ev] ' + kind);
  }

  G.crashQA = function () { G.invuln = 0; crash(); };
  G.stumbleQA = function () { stumble(); };
  G.boardQA = function () { activateBoard(); };
  G.powerupQA = function (type) { G.powerups.grantDirect(type, 8); };
  // Teleport QA: jump the run forward N meters instantly (regenerates chunks).
  G.teleportQA = function (meters) {
    if (G.state !== 'running') return 'not running';
    Object.keys(G.chunkMap).forEach(function (k) { despawnChunk(parseInt(k, 10)); });
    for (var i = G.movingTrains.length - 1; i >= 0; i--) { disposeMoving(G.movingTrains[i]); G.movingTrains.splice(i, 1); }
    G.collectibles.clear(); G.powerups.clearAll();
    G.curChunk = Math.max(0, Math.floor(meters / root.CFG.CHUNK_LEN));
    G.nextChunk = G.curChunk;
    G.travel = G.curChunk * root.CFG.CHUNK_LEN;
    G.dist = Math.max(G.dist, G.travel);
    G.invuln = Math.max(G.invuln, 1.6); // spawn safety after teleport
    G.y = 0; G.vy = 0; G.onGround = true;
    ensureChunks(true);
    updateChunksPos(G.travel);
    loadChunkEntities();
    return 'ok@' + Math.floor(G.travel);
  };
  // ---------- QA hooks ----------
  G.QA = {
    pressKey: function (code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true }));
      setTimeout(function () {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: code, bubbles: true }));
      }, 60);
    },
    state: function () { return G.state; }
  };

  G.startup = function () {
    // renderer
    root.HUD.init();
    var canvas = document.createElement('canvas');
    document.getElementById('wrap').prepend(canvas);
    var isQA = /qa=1/.test(location.search) || (root.SR_QA === true);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isQA, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isQA ? 1 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    G.renderer = renderer;
    root.__SR_CANVAS = canvas;

    G.scene = new THREE.Scene();
    G.scene.fog = new THREE.Fog(0x9db8dd, 75, 250);
    G.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 500);
    G.camera.position.set(0, 5.4, 8.6);

    // textures/materials/env
    root.Tex.build();
    root.BuildEnv(G.scene, renderer, null);
    root.Mats.build(root.THREE_envMap || G.scene.environment);
    G.fx = new root.FX(G.scene);

    // player rig
    G.playerRoot = new THREE.Group();
    G.scene.add(G.playerRoot);
    G.parts = root.PlayerLib.build(root.Mats, {});
    G.playerRoot.add(G.parts.root);
    G.parts.root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });

    // hoverboard mesh
    G.boardMesh = new THREE.Group();
    var bDef = root.Shop.BOARDS[root.Save.data.board] || root.Shop.BOARDS.glide;
    var deck = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 1.9),
      new THREE.MeshStandardMaterial({ color: bDef.color, metalness: 0.6, roughness: 0.25, emissive: bDef.color, emissiveIntensity: 0.35 }));
    deck.position.y = 0.09;
    var under = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x223, emissive: bDef.color, emissiveIntensity: 0.9 }));
    under.position.y = 0.02;
    G.boardMesh.add(deck); G.boardMesh.add(under);
    G.boardMesh.visible = false;
    G.playerRoot.add(G.boardMesh);

    // chaser rig
    G.chaserDrone = root.ChaserLib.build(root.Mats);
    G.chaserHandler = root.ChaserLib.buildHandler(root.Mats);
    G.chaserDrone.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    G.chaserHandler.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    G.scene.add(G.chaserDrone); G.scene.add(G.chaserHandler);

    // systems
    G.collectibles = new root.CollectibleSys(G.scene, root.Mats);
    G.powerups = new root.PowerupSys(G.scene);
    G.movingTrains = [];

    // postfx
    try { G.postfx = new root.PostFX(renderer, G.scene, G.camera); } catch (e) { G.postfx = null; }

    // trail
    G.trailPts = [];
    G.trailLine = null;

    // input
    root.Input.onAction(onAction);
    bindUI();

    // menu idle scene: generate a few chunks so the backdrop looks alive
    G.seed = (Date.now() & 0x7fffffff) >>> 0;
    G.chunkMap = {};
    G.nextChunk = 0;
    G.curChunk = 0;
    G.travel = 0;
    ensureChunks(true);
    updateChunksPos(0);

    // UI wiring done; show menu
    setState('menu');
    refreshMenuStats();
    root.Missions.ensure();
    renderMissionHud();
    document.getElementById('loadNote').textContent =
      'READY · ' + (renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL') +
      ' · ' + (G.postfx && G.postfx.enabled ? 'POST ON' : 'POST OFF');
    root.SR_READY = true;
    root.SRReady && root.SRReady();

    animate(performance.now());
  };

  // ---------- chunk streaming ----------
  function chunkStart(k) { return -(k * root.CFG.CHUNK_LEN); }   // near edge z of chunk k
  function difficulty01() {
    return Math.min(1, G.dist / 2600);
  }
  function ensureChunks(initial) {
    var ahead = root.CFG.AHEAD_CHUNKS, behind = root.CFG.BEHIND_CHUNKS;
    while (G.nextChunk < G.curChunk + ahead) {
      spawnChunk(G.nextChunk);
      G.nextChunk++;
    }
    for (var k in G.chunkMap) {
      var kk = parseInt(k, 10);
      var farBehind = kk < G.curChunk - behind - 1;
      var tooFarAhead = kk > G.curChunk + ahead + 1;
      if (farBehind || tooFarAhead) despawnChunk(kk);
    }
  }
  function spawnChunk(k) {
    if (G.chunkMap[k]) return;
    var c = root.Chunks.generate(k, G.seed, root.Mats, G.scene, difficulty01());
    c.startZ = chunkStart(k);          // near edge (less negative = closer)
    c.group.position.z = c.startZ;     // children use negative local z
    G.scene.add(c.group);
    // dynamic moving trains from this chunk's reservation
    for (var i = 0; i < c.movingTrains.length; i++) {
      var mt = c.movingTrains[i];
      spawnMovingTrain(mt.lane, mt.dir, c.startZ + mt.atZ, k);
    }
    G.chunkMap[k] = c;
  }
  function despawnChunk(k) {
    var c = G.chunkMap[k];
    if (!c) return;
    G.scene.remove(c.group);
    c.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
    delete G.chunkMap[k];
    // remove its reserved moving trains not yet spawned
    for (var i = G.movingTrains.length - 1; i >= 0; i--) {
      var t = G.movingTrains[i];
      if (t.chunk === k && !t.spawned) G.movingTrains.splice(i, 1);
    }
  }

  // ---------- moving trains ----------
  function spawnMovingTrain(lane, dir, zAt, chunkK) {
    var rng = new root.RngLib.RNG((G.seed ^ (chunkK * 99991)) >>> 0);
    var g = root.TrainLib.buildTrain(rng, root.Mats, 3, false);
    g.position.set(root.CFG.LANES[lane], 0, zAt);
    G.scene.add(g);
    var len = g.userData.length;
    G.movingTrains.push({
      chunk: chunkK, lane: lane, dir: dir, speed: dir > 0 ? 11 : 13,
      mesh: g, len: len, zFront: zAt, spawned: true,
      hw: 1.25
    });
  }
  function updateMovingTrains(dt) {
    for (var i = G.movingTrains.length - 1; i >= 0; i--) {
      var t = G.movingTrains[i];
      t.zFront += t.dir * t.speed * dt;   // dir>0 approaches player (toward +z)
      t.mesh.position.z = t.zFront - t.len / 2;
      // recycle once fully past the camera
      if (t.dir > 0 && t.zFront - t.len > 30) { disposeMoving(t); G.movingTrains.splice(i, 1); }
      else if (t.dir < 0 && t.zFront < G.travel - root.CFG.CHUNK_LEN * (root.CFG.AHEAD_CHUNKS + 3)) { disposeMoving(t); G.movingTrains.splice(i, 1); }
    }
  }
  function disposeMoving(t) { G.scene.remove(t.mesh); t.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }

  // ---------- run lifecycle ----------
  G.newRun = function () {
    // clear chunks & entities
    Object.keys(G.chunkMap).forEach(function (k) { despawnChunk(parseInt(k, 10)); });
    for (var i = G.movingTrains.length - 1; i >= 0; i--) { disposeMoving(G.movingTrains[i]); G.movingTrains.splice(i, 1); }
    G.collectibles.clear(); G.powerups.clearAll(); G.fx.clear();
    G.nextChunk = 0; G.curChunk = 0;
    G.seed = (Date.now() & 0x7fffffff) >>> 0;

    // player state
    G.lane = 1; G.x = 0; G.targetLaneX = 0;
    G.y = 0; G.vy = 0; G.onGround = true;
    G.rollT = 0; G.stumbleT = 0; G.invuln = 0;
    G.animState = 'run'; G.animT = 0;
    G.speed = root.CFG.BASE_SPEED;
    G.dist = 0; G.score = 0; G.coinCount = 0; G.runCoins = 0;
    G.comboCount = 0; G.comboT = 0;
    G.multiplier = 1;
    G.boardActive = false; G.boardT = 0;
    G.jumpCount = 0; G.rollCount = 0; G.laneChanges = 0;
    G.trainTopDist = 0; G.nearMisses = 0; G.pwCollected = 0; G.magnetCoins = 0;
    G.onTrainRoofY = null;
    G.crashed = false; G.overHandled = false;
    G.travel = 0;
    G.boardCooldown = 0;
    G.xLean = 0; G.trainTopAcc = 0; G.jetpackDescend = false;
    G.chaserGap = root.CFG.CHASER_START;
    G.chaserMode = 'chase';
    G.runMissionsStart();
    ensureChunks(true);
    updateChunksPos(0);
    setState('running');
    root.Input.enable();
    root.AudioSys.startMusic();
    HUD.show(true);
    logEv('run_start', { seed: G.seed });
  };
  G.endRun = function () {
    if (G.state !== 'running' && G.state !== 'paused') return;
    var newBest = root.Save.recordRun(Math.floor(G.score), Math.floor(G.dist));
    var completed = G.runMissionsEnd();
    setState('over');
    root.Input.disable();
    root.AudioSys.stopMusic();
    root.AudioSys.sfx.crash();
    $('oScore').textContent = Math.floor(G.score).toLocaleString('en-US');
    $('oCoins').textContent = G.runCoins.toLocaleString('en-US');
    $('oDist').textContent = Math.floor(G.dist) + ' m';
    $('oBest').textContent = root.Save.data.best.toLocaleString('en-US');
    $('oNew').classList.toggle('hidden', !newBest);
    var om = '';
    completed.forEach(function (m) { om += '<div class="missionDone">✔ MISSION COMPLETE — ' + m.text + '</div>'; });
    $('oMissions').innerHTML = om;
    refreshMenuStats();
    logEv('run_end', { score: Math.floor(G.score), dist: Math.floor(G.dist), coins: G.runCoins });
  };
  G.pause = function () {
    if (G.state !== 'running') return;
    setState('paused');
    root.Input.disable();
    root.AudioSys.stopMusic();
  };
  G.resume = function () {
    if (G.state !== 'paused') return;
    setState('running');
    root.Input.enable();
    root.AudioSys.resume(); root.AudioSys.startMusic();
    G.lastT = performance.now();
  };

  // ---------- missions per-run helpers ----------
  G.runMissionsStart = function () {
    root.Missions.progress('dist', 0, true);
    root.Missions.progress('score', 0, true);
  };
  G.runMissionsEnd = function () {
    var done1 = root.Missions.progress('dist', Math.floor(G.dist));
    var done2 = root.Missions.progress('score', Math.floor(G.score));
    root.Save.persist();
    var out = done1.concat(done2);
    if (out.length) { root.Missions.refresh(); }
    return out;
  };
  G.missionProgress = function (ev, amt) {
    var done = root.Missions.progress(ev, amt);
    if (done.length) {
      done.forEach(function (m) {
        HUD.toast('MISSION ✔ ' + m.text, '#7bffe0');
        root.AudioSys.sfx.mission();
        logEv('mission_done', { id: m.id });
      });
      renderMissionHud();
    }
  };
  function renderMissionList() {
    var list = root.Missions.list();
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var pct = Math.min(100, Math.round(m.prog / m.goal * 100));
      html += '<div class="mrow' + (m.done ? ' done' : '') + '">' +
        '<div class="st">' + (m.done ? '✔' : '○') + '</div>' +
        '<div style="flex:1">' + m.text +
        '<div class="pr" style="margin-top:6px"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="cnt">' + Math.floor(m.prog).toLocaleString('en-US') + ' / ' + m.goal.toLocaleString('en-US') + '</div>' +
        '</div>';
    }
    $('missionList').innerHTML = html;
  }
  function renderMissionHud() {
    var list = root.Missions.list();
    var m = list[0]; // show first uncompleted
    for (var i = 0; i < list.length; i++) if (!list[i].done) { m = list[i]; break; }
    if (!m) { HUD.setMission(''); return; }
    HUD.setMission('<b>' + m.text + '</b> · ' + Math.floor(m.prog) + '/' + m.goal);
  }

  // ---------- actions ----------
  function onAction(a) {
    if (a === 'pause') {
      if (G.state === 'running') G.pause();
      else if (G.state === 'paused') G.resume();
      return;
    }
    if (G.state !== 'running') return;
    if (a === 'left') move(-1);
    else if (a === 'right') move(1);
    else if (a === 'jump') doJump();
    else if (a === 'roll') doRoll();
  }
  function move(dir) {
    var nl = G.lane + dir;
    if (nl < 0 || nl > 2) { // wall bump feedback
      G.xLean = dir * 0.12;
      root.AudioSys.sfx.deny();
      return;
    }
    G.lane = nl;
    G.targetLaneX = root.CFG.LANES[nl];
    G.laneChanges++;
    root.AudioSys.sfx.lane();
    G.missionProgress('lane', 1);
    logEv('move', { dir: dir, lane: G.lane, x: +G.x.toFixed(2) });
  }
  function doJump() {
    if (!G.onGround && !G.boardActive) return;
    if (G.boardActive) { // board hop
      G.vy = root.CFG.JUMP_V * 0.9; G.onGround = false; G.animState = 'jump';
    } else {
      G.vy = root.CFG.JUMP_V; G.onGround = false; G.animState = 'jump'; G.rollT = 0;
    }
    G.jumpCount++;
    root.AudioSys.sfx.jump();
    G.missionProgress('jump', 1);
    logEv('jump', { y: +G.y.toFixed(2) });
  }
  function doRoll() {
    if (G.rollT <= 0) {
      G.rollT = root.CFG.ROLL_TIME;
      G.rollCount++;
      if (!G.onGround) G.vy = Math.min(G.vy, -14); // fast-fall into roll
      root.AudioSys.sfx.roll();
      G.missionProgress('roll', 1);
      logEv('roll', {});
    }
  }

  // ---------- collision ----------
  function playerBox() {
    var rolling = G.rollT > 0;
    var h = rolling ? root.CFG.PLAYER_ROLL_H : root.CFG.PLAYER_H;
    return {
      x: G.x, z: 0,
      hw: root.CFG.PLAYER_HALF_W, hz: 0.32,
      yMin: G.y, yMax: G.y + h
    };
  }
  function checkCollisions(dt) {
    var pb = playerBox();
    // static colliders from nearby chunks
    var hitSomething = null;
    for (var k = G.curChunk - 1; k <= G.curChunk + 2; k++) {
      var c = G.chunkMap[k];
      if (!c) continue;
      for (var i = 0; i < c.colliders.length; i++) {
        var col = c.colliders[i];
        var wz = col.z + c.startZ;
        var dz = pb.z - wz;
        if (Math.abs(dz) > col.hz + pb.hz) continue;
        var dx = pb.x - col.x;
        if (Math.abs(dx) > col.hw + pb.hw) continue;
        // vertical overlap test
        if (pb.yMin < col.yMax && pb.yMax > col.yMin) {
          hitSomething = { col: col, dx: dx };
          break;
        } else if (col.action === 'train') {
          // landing on roof support
          if (pb.yMin >= col.yMax - 0.45 && G.vy <= 0) {
            G.supportY = col.roofY; G.supportZ0 = wz - col.hz; G.supportZ1 = wz + col.hz;
            G.supportX0 = col.x - col.hw; G.supportX1 = col.x + col.hw;
          }
        }
      }
      if (hitSomething) break;
    }
    // train roof walking: find highest roof support under feet
    var bestSupport = 0; // ground default
    G.roofSupport = null;
    for (var k2 = G.curChunk - 1; k2 <= G.curChunk + 2; k2++) {
      var c2 = G.chunkMap[k2];
      if (!c2) continue;
      for (i = 0; i < c2.colliders.length; i++) {
        var cl = c2.colliders[i];
        if (cl.action !== 'train') continue;
        var wz2 = cl.z + c2.startZ;
        if (pb.x > cl.x - cl.hw - pb.hw && pb.x < cl.x + cl.hw + pb.hw &&
            pb.z > wz2 - cl.hz - 0.5 && pb.z < wz2 + cl.hz + 0.5) {
          if (cl.roofY > bestSupport && Math.abs(pb.yMin - cl.roofY) < 1.4) {
            bestSupport = cl.roofY;
            G.roofSupport = cl;
          }
        }
      }
    }
    return hitSomething;
  }
  // ---------- moving-train collision ----------
  function checkMovingTrains() {
    var pb = playerBox();
    for (var i = 0; i < G.movingTrains.length; i++) {
      var t = G.movingTrains[i];
      var x = root.CFG.LANES[t.lane];
      var zFront = t.zFront, zBack = t.zFront - t.len;
      var dzNear = pb.z - zFront;         // player z(0) vs front
      if (dzNear > pb.hz + 0.3 || (0 - zBack) > t.len + pb.hz + 0.4) continue;
      if (Math.abs(pb.x - x) > t.hw + pb.hw) continue;
      // vertical: below roof = hit; on/above roof = ride
      if (pb.yMax > 3.05 && pb.yMin < 3.05) {
        return { col: { action: 'train', x: x, hw: t.hw }, dx: pb.x - x };
      }
    }
    return null;
  }
  function handleHit(hit) {
    if (hit.col.action === 'train') {
      // side/bonk on train body: shallow graze = stumble; deep hit = crash
      if (G.boardActive) { crashBoard(); return; }
      if (G.invuln > 0) return;
      var overlapX = Math.abs(hit.dx) - (hit.col.hw + root.CFG.PLAYER_HALF_W);
      if (overlapX > -0.22) stumble(hit.col);
      else crash();
    } else if (hit.col.action === 'lane') {
      if (G.invuln > 0 || G.boardActive) {
        if (G.boardActive) { crashBoard(); return; }
        return;
      }
      crash();
    } else { // jump/roll obstacles: stumble (they're passable next time)
      if (G.invuln > 0) return;
      if (G.boardActive) { crashBoard(); return; }
      stumble();
    }
  }
  function nearestChunkStart() {
    var c = G.chunkMap[G.curChunk];
    return c ? c.startZ : 0;
  }
  // Is any static train body occupying this lane around the player z?
  function laneOccupiedByTrain(lane) {
    var lx = root.CFG.LANES[lane];
    for (var k = G.curChunk; k <= G.curChunk + 2; k++) {
      var c = G.chunkMap[k];
      if (!c) continue;
      for (var i = 0; i < c.colliders.length; i++) {
        var col = c.colliders[i];
        if (col.action !== 'train') continue;
        var wz = col.z + c.startZ;
        if (Math.abs(col.x - lx) < 0.5 && wz - col.hz < 6 && wz + col.hz > -6) return true;
      }
    }
    return false;
  }
  function stumble(hitCol) {
    G.stumbleT = 1; G.invuln = root.CFG.STUMBLE_GRACE;
    G.animState = 'stumble';
    G.chaserGap -= 9;
    G.speed *= 0.82;
    G.comboCount = 0;
    // train side-contact: bounce the player off toward the freer side
    if (hitCol && hitCol.action === 'train') {
      var cand = [];
      if (G.lane > 0 && !laneOccupiedByTrain(G.lane - 1)) cand.push(G.lane - 1);
      if (G.lane < 2 && !laneOccupiedByTrain(G.lane + 1)) cand.push(G.lane + 1);
      if (!cand.length) { // both neighbors occupied: push forward past the train front instead
        G.chaserGap = Math.max(G.chaserGap, root.CFG.CHASER_START * 0.8); // mercy: don't let the chaser chain-catch here
      } else {
        var nl = cand[Math.floor(Math.random() * cand.length)];
        G.lane = nl;
        G.targetLaneX = root.CFG.LANES[nl];
      }
    }
    root.AudioSys.sfx.whistle();
    root.AudioSys.sfx.stumble();
    HUD.toast('STUMBLE!', '#ff5470');
    G.fx.burst('dust', G.x, 0.4, 0, 10, 0.8, 2);
    G.fx.shake(0.35, 0.3);
    logEv('stumble', { gap: G.chaserGap });
  }
  function crash() {
    if (G.crashed) return;
    // shield absorbs one fatal hit
    if (G.powerups.isActive('shield')) {
      G.powerups.endNow('shield');
      G.invuln = 1.6;
      HUD.toast('SHIELD SAVED YOU!', '#63e0ff');
      root.AudioSys.sfx.powerEnd();
      G.fx.burst('power', G.x, 1, 0, 18, 0.9, 2.6);
      logEv('shield_absorb', {});
      return;
    }
    G.crashed = true; G.animState = 'crash';
    G.fx.burst('crash', G.x, 1, 0, 26, 1.2, 3);
    G.fx.shake(0.8, 0.55);
    HUD.flash(0.5);
    G.endRun();
  }
  function crashBoard() {
    // board absorbs one crash
    G.boardActive = false; G.boardMesh.visible = false;
    G.invuln = 1.4;
    G.chaserGap = Math.max(root.CFG.CHASER_MAX, G.chaserGap);
    root.AudioSys.sfx.powerEnd();
    HUD.toast('BOARD BROKE!', '#ffb547');
    G.fx.burst('spark', G.x, 0.5, 0, 20, 1, 3);
    logEv('board_break', {});
  }

  // ---------- scoring ----------
  function addScore(n) { G.score += n * G.multiplier; }
  function collect(type, x, y, z) {
    if (type === 'coin') {
      G.coinCount++; G.runCoins++;
      G.comboCount++; G.comboT = 1.4;
      addScore(10);
      root.Save.addCoins(1);
      root.AudioSys.sfx.coin(G.comboCount % 13);
      G.fx.burst('coin', x, y, z, 6, 0.4, 2.4);
      HUD.setCoins(root.Save.data.coins);
      G.missionProgress('coin', 1);
      if (G.powerups.isActive('magnet')) G.magnetCoins++, G.missionProgress('magnetcoin', 1);
      HUD.combo(G.comboCount);
    } else if (type === 'gem') {
      G.runCoins += 10;
      addScore(250);
      root.Save.addCoins(10);
      root.AudioSys.sfx.gem();
      G.fx.burst('gem', x, y, z, 16, 0.6, 3);
      HUD.toast('+10 ◉ GEM!', '#38f8c8');
      HUD.setCoins(root.Save.data.coins);
      G.missionProgress('gem', 1);
    } else if (type === 'star') {
      addScore(600);
      root.AudioSys.sfx.gem();
      G.fx.burst('star', x, y, z, 20, 0.7, 3.4);
      HUD.toast('STAR +600', '#9fd0ff');
    }
  }

  // ---------- powerup wiring ----------
  function wirePowerups() {
    G.powerups.onStart = function (type) {
      G.pwCollected++;
      root.AudioSys.sfx.power();
      HUD.toast(root.PW.DEFS[type].name + '!', '#' + root.PW.DEFS[type].color.toString(16).padStart(6, '0'));
      G.missionProgress('powerup', 1);
      if (type === 'boost') { G.boostT = 1; G.invuln = Math.max(G.invuln, 1.0); }
      logEv('powerup', { type: type });
    };
    G.powerups.onEnd = function (type) {
      root.AudioSys.sfx.powerEnd();
      if (type === 'jetpack') { G.jetpackDescend = true; }
    };
    G.collectibles.onCollect = collect;
  }

  // ---------- hoverboard ----------
  function activateBoard() {
    if (G.boardActive || G.boardCooldown > 0) return;
    var def = root.Shop.BOARDS[root.Save.data.board] || root.Shop.BOARDS.glide;
    G.boardActive = true;
    G.boardT = def.dur;
    G.boardDef = def;
    G.boardMesh.visible = true;
    G.boardMesh.children[0].material.color.setHex(def.color);
    G.boardMesh.children[1].material.emissive.setHex(def.color);
    root.AudioSys.sfx.power();
    HUD.toast(def.name.toUpperCase() + ' BOARD!', '#' + def.color.toString(16).padStart(6, '0'));
    logEv('board_on', { board: root.Save.data.board });
  }

  // ---------- per-frame ----------
  function setState(s) {
    G.state = s;
    ['menu', 'pause', 'over'].forEach(function (id) {
      document.getElementById(id).classList.toggle('hidden', s !== id);
    });
    if (s !== 'running') HUD.show(s === 'over');
  }

  function refreshMenuStats() {
    $('mBest').textContent = root.Save.data.best.toLocaleString('en-US');
    $('mCoins').textContent = root.Save.data.coins.toLocaleString('en-US');
    $('mDist').textContent = Math.floor(root.Save.data.bestDist) + ' m';
    $('mRuns').textContent = root.Save.data.runs;
    HUD.setCoins(root.Save.data.coins);
  }

  function bindUI() {
    $('btnPlay').addEventListener('click', function () { root.AudioSys.sfx.ui(); G.newRun(); });
    $('btnAgain').addEventListener('click', function () { root.AudioSys.sfx.ui(); G.newRun(); });
    $('btnMenu').addEventListener('click', function () { setState('menu'); refreshMenuStats(); });
    $('btnResume').addEventListener('click', function () { G.resume(); });
    $('btnQuit').addEventListener('click', function () { G.endRun(); });
    $('pauseBtn').addEventListener('click', function () { G.pause(); });
    $('btnShop').addEventListener('click', function () { root.AudioSys.sfx.ui(); root.Shop.open(); });
    $('btnMissions').addEventListener('click', function () {
      root.AudioSys.sfx.ui();
      renderMissionList();
      document.getElementById('missionsWrap').classList.remove('hidden');
    });
    $('btnMissionsClose').addEventListener('click', function () {
      document.getElementById('missionsWrap').classList.add('hidden');
    });
    root.Shop.init();
    root.Shop.onChange = function () {
      rebuildPlayerPalette();
    };
    // focus loss auto-pause (controls recovery requirement)
    window.addEventListener('blur', function () { if (G.state === 'running') G.pause(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.state === 'running') G.pause();
    });
    // double-tap space or H to use board
    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyH' && G.state === 'running') activateBoard();
    });
    wirePowerups();
    G.boardCooldown = 0;
  }

  function rebuildPlayerPalette() {
    // swap outfit materials live
    var r = root.PlayerLib.RUNNERS[root.Save.data.runner] || root.PlayerLib.RUNNERS.nova;
    var mk = function (hex) { return hex ? new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 }) : root.Mats.jacket; };
    var jm = r.jacket ? new THREE.MeshStandardMaterial({ color: r.jacket, metalness: 0.25, roughness: 0.5 }) : root.Mats.jacket;
    var pm = r.pack ? new THREE.MeshStandardMaterial({ color: r.pack, roughness: 0.8 }) : root.Mats.pants;
    var hm = r.hair ? new THREE.MeshStandardMaterial({ color: r.hair, roughness: 0.55 }) : root.Mats.hair;
    G.parts.root.traverse(function () {});
    // reassign by part names stored at build time
    G.parts.jacketMatRef = jm; G.parts.packMatRef = pm; G.parts.hairMatRef = hm;
    applyMats(G.parts.torso, [jm]);
    applyMats(G.parts.head, [hm, skinKeep()]);
    function skinKeep() { return root.Mats.skin; }
    function applyMats(group, matsList) {
      var mi = 0;
      group.traverse(function (o) {
        if (o.isMesh && o.material !== root.Mats.skin && o.material !== G.parts.visorMat) {
          o.material = matsList[mi % matsList.length]; mi++;
        }
      });
    }
  }

  // ---------- main loop ----------
  var lastLoggedCombo = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, (now - (G.lastT || now)) / 1000);
    G.lastT = now;
    G.animT += dt;
    if (G.state === 'running') stepGame(dt);
    else if (G.state === 'menu' || G.state === 'over') {
      // slow ambient drift for menu backdrop
      G.travel += dt * 2.2;
      updateChunksPos(G.travel);
      G.parts && root.PlayerLib.animate(G.parts, { state: 'idle', t: G.animT, lean: 0, vy: 0 });
      G.playerRoot.position.set(0, 0, 0);
      G.camera.position.lerp(V3(0, 4.6, 9.4), 0.04);
      G.camera.lookAt(0, 1.6, -6);
      G.chaserDrone.position.set(3.4, 1.2, 4.5);
      G.chaserDrone.rotation.y = -0.4;
      G.chaserDrone.userData.light.material.emissiveIntensity = 1.5 + Math.sin(G.animT * 4) * 0.8;
      G.chaserHandler.position.set(-3.2, 0, 5.2);
      G.chaserHandler.rotation.y = 0.35;
    }
    G.fx.update(dt);
    envFollow(dt);
    renderFrame();
  }
  function renderFrame() {
    if (G.postfx && G.postfx.enabled) G.postfx.render();
    else G.renderer.render(G.scene, G.camera);
  }
  function V3(x, y, z) { return new THREE.Vector3(x, y, z); }

  function stepGame(dt) {
    // --- speed & distance ---
    var targetSpeed = Math.min(root.CFG.MAX_SPEED, root.CFG.BASE_SPEED + G.dist * root.CFG.SPEED_RAMP);
    if (G.powerups.isActive('boost')) targetSpeed *= 1.45;
    if (G.boardActive && G.boardDef && G.boardDef.speed) targetSpeed *= G.boardDef.speed;
    G.speed += (targetSpeed - G.speed) * Math.min(1, dt * 1.6);
    var dz = G.speed * dt;
    G.dist += dz;
    G.travel += dz;
    addScore(dz * 1.1);

    // --- lateral ---
    var lx = G.targetLaneX - G.x;
    var lstep = root.CFG.LANE_SPEED * dt * (1 + G.speed / root.CFG.MAX_SPEED * 0.6);
    if (Math.abs(lx) <= lstep) G.x = G.targetLaneX;
    else G.x += Math.sign(lx) * lstep;
    G.xLean = (G.xLean || 0) * (1 - dt * 8);

    // --- vertical ---
    G.supportY = 0;
    var wasGround = G.onGround;
    if (G.powerups.isActive('jetpack')) {
      G.jetTargetY = 7.2;
      G.y += (G.jetTargetY - G.y) * Math.min(1, dt * 3);
      G.vy = 0; G.onGround = false;
      if (Math.random() < dt * 40) G.fx.burst('spark', G.x, G.y + 0.4, 0.3, 1, 0.3, -2);
    } else {
      G.vy += root.CFG.GRAVITY * dt;
      G.y += G.vy * dt;
    }
    // collisions & supports (after integration)
    var hit = checkCollisions(dt);
    var mhit = checkMovingTrains();
    if (mhit && !hit) hit = mhit;
    // land on roof?
    if (G.roofSupport && G.vy <= 0 && G.y <= G.roofSupport.roofY && G.y > G.roofSupport.roofY - 1.2 && !wasGround) {
      G.y = G.roofSupport.roofY; G.vy = 0; G.onGround = true;
    }
    // ground plane at 0
    if (!G.powerups.isActive('jetpack') && G.y <= 0) {
      if (!wasGround && G.vy < -6) {
        root.AudioSys.sfx.land();
        G.fx.burst('dust', G.x, 0.15, 0.3, 5, 0.5, 1.2);
      }
      G.y = 0; G.vy = 0; G.onGround = true;
    } else if (G.y > 0.05) {
      G.onGround = false;
    }
    if (G.onGround && G.animState === 'jump') { G.animState = 'run'; }
    if (!G.onGround && (G.animState === 'run')) G.animState = G.vy < -2 ? 'fall' : 'jump';

    // --- roll timer ---
    if (G.rollT > 0) { G.rollT -= dt; if (G.rollT <= 0 && G.onGround) G.animState = 'run'; }
    if (G.rollT > 0) G.animState = 'roll';

    // --- stumble timer ---
    if (G.stumbleT > 0) { G.stumbleT -= dt; if (G.stumbleT <= 0 && G.animState === 'stumble') G.animState = 'run'; }
    if (G.invuln > 0) G.invuln -= dt;

    // --- hit resolution ---
    if (hit) handleHit(hit);

    // --- near misses ---
    nearMissCheck();

    // --- combo decay ---
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.comboCount = 0; HUD.combo(0); } }

    // --- multiplier from missions ---
    var mult = 1 + Math.floor((G.dist / 500)) * 0.1 + root.Missions.setBonus() * 0.2;
    if (G.powerups.isActive('multiplier')) mult *= 2;
    G.multiplier = Math.max(1, Math.round(mult * 10) / 10);

    // --- board timer ---
    if (G.boardActive) {
      G.boardT -= dt;
      G.missionProgress('boardtime', dt);
      if (G.boardT <= 0) {
        G.boardActive = false; G.boardMesh.visible = false;
        root.AudioSys.sfx.powerEnd();
        logEv('board_off', {});
      }
      if (Math.random() < dt * 50) G.fx.burst('power', G.x, 0.15, 0.8, 1, 0.3, 0.8);
    }

    // --- chunks stream ---
    G.curChunk = Math.max(0, Math.ceil(G.travel / root.CFG.CHUNK_LEN));
    updateChunksPos(G.travel);
    ensureChunks();

    // --- collectibles & powerups & trains ---
    G.collectibles.update(dt, { x: G.x, y: G.y, z: 0 }, G.powerups.isActive('magnet') ? root.CFG.MAGNET_R : 0, G.speed / root.CFG.MAX_SPEED, G.travel);
    G.powerups.update(dt, G.animT, { x: G.x, y: G.y, z: 0 }, G.parts, G.travel);
    loadChunkEntities();
    updateMovingTrains(dt);

    // --- chaser logic ---
    updateChaser(dt);

    // --- score for train-top running ---
    if (G.roofSupport && G.onGround && Math.abs(G.y - (G.roofSupport.roofY || 0)) < 0.3) {
      G.trainTopAcc = (G.trainTopAcc || 0) + dz;
      if (G.trainTopAcc > 8) { G.missionProgress('traintop', Math.floor(G.trainTopAcc)); G.trainTopAcc = 0; addScore(dz * 0.8); }
    }

    // --- player transform & animation ---
    G.playerRoot.position.set(G.x, G.y, 0);
    var speedNorm = (G.speed - root.CFG.BASE_SPEED) / (root.CFG.MAX_SPEED - root.CFG.BASE_SPEED);
    root.PlayerLib.animate(G.parts, {
      state: G.animState, t: G.animT, speedNorm: speedNorm,
      lean: ((G.targetLaneX - G.x) / 3.2 + (G.xLean || 0)), rollT: G.rollT, vy: G.vy,
      stumbleT: 1 - Math.min(1, G.stumbleT), board: G.boardActive
    });
    G.boardMesh.position.set(G.x * 0, -0.02, 0.1);
    G.boardMesh.rotation.z = -((G.targetLaneX - G.x) / 3.2) * 0.4;

    // --- camera ---
    var camShakeX = 0, camShakeY = 0;
    if (G.fx.shakeT > 0) {
      camShakeX = (Math.random() - 0.5) * G.fx.shakeAmp;
      camShakeY = (Math.random() - 0.5) * G.fx.shakeAmp;
    }
    var jetLift = G.powerups.isActive('jetpack') ? Math.max(0, G.y - 1.5) * 0.55 : 0;
    var targetFov = 66 + speedNorm * 16 + (G.powerups.isActive('boost') ? 8 : 0);
    G.camera.fov += (targetFov - G.camera.fov) * Math.min(1, dt * 4);
    G.camera.updateProjectionMatrix();
    G.camera.position.x += ((G.x * 0.62) - G.camera.position.x) * Math.min(1, dt * 6);
    G.camera.position.y += ((4.9 + jetLift + G.y * 0.35) - G.camera.position.y) * Math.min(1, dt * 5);
    G.camera.position.z = 8.4 - speedNorm * 1.4;
    G.camera.position.x += camShakeX; G.camera.position.y += camShakeY;
    G.camera.lookAt(G.x * 0.8 + camShakeX, 1.7 + G.y * 0.5 + camShakeY, -14);

    // --- HUD ---
    HUD.setScore(G.score);
    HUD.setMulti(G.multiplier);
    HUD.setDist(G.dist);
    HUD.speedFx(speedNorm);
    var pwBars = [];
    for (var type in G.powerups.active) {
      if (G.powerups.remaining(type) > 0) {
        var def = root.PW.DEFS[type];
        pwBars.push({ name: def.name, color: def.color, frac: G.powerups.frac(type), icon: def.icon });
      }
    }
    HUD.powers(pwBars);
    if (G.boardActive) HUD.setBoard(G.boardDef.name.toUpperCase() + ' BOARD · ' + Math.ceil(G.boardT) + 's' + (root.Input.isEnabled() ? '' : ''));
    else HUD.setBoard('');
    renderMissionHudThrottled();

    // fog tint by current biome
    var cc = G.chunkMap[G.curChunk];
    if (cc && cc.biome) {
      G.scene.fog.color.setHex(cc.biome.fog);
      G.renderer.setClearColor(cc.biome.fog);
    }
  }

  var missionHudTick = 0;
  function renderMissionHudThrottled() {
    missionHudTick++;
    if (missionHudTick % 20 === 0) renderMissionHud();
  }

  function nearMissCheck() {
    // credit near miss when passing close to a block/low collider at speed
    for (var k = G.curChunk; k <= G.curChunk + 1; k++) {
      var c = G.chunkMap[k];
      if (!c) continue;
      for (var i = 0; i < c.colliders.length; i++) {
        var col = c.colliders[i];
        var wz = col.z + c.startZ;
        if (wz > 1 || wz < -2) continue; // just passed the player plane
        var dx = Math.abs(G.x - col.x);
        if (dx < root.CFG.NEAR_MISS_DIST && dx > root.CFG.PLAYER_HALF_W + col.hw - 0.05) {
          if (!col.__nm) {
            col.__nm = true;
            G.nearMisses++;
            addScore(25);
            root.AudioSys.sfx.nearMiss();
            G.missionProgress('nearmiss', 1);
          }
        } else if (wz > 1.5 || wz < -2.5) col.__nm = false;
      }
    }
  }

  function updateChaser(dt) {
    // recover gap slowly; catch when gap <= threshold
    G.chaserGap = Math.min(root.CFG.CHASER_MAX, G.chaserGap + dt * 1.15);
    var drone = G.chaserDrone;
    var gz = -Math.max(2.5, G.chaserGap);
    drone.position.x += (G.x - drone.position.x) * Math.min(1, dt * 3);
    drone.position.z += (gz - drone.position.z) * Math.min(1, dt * 1.2);
    drone.position.y = 0.9 + Math.sin(G.animT * 5) * 0.12;
    drone.rotation.z = Math.sin(G.animT * 3) * 0.08;
    drone.userData.light.material.emissiveIntensity = 1.6 + Math.sin(G.animT * 7) * 0.9;
    // handler runs behind drone
    var hd = G.chaserHandler;
    hd.position.z = drone.position.z - 2.6;
    hd.position.x = drone.position.x * 0.8;
    var stride = Math.sin(G.animT * 12);
    hd.userData.legL.rotation.x = stride * 0.9;
    hd.userData.legR.rotation.x = -stride * 0.9;
    hd.userData.armL.rotation.x = -stride * 0.8;
    hd.userData.armR.rotation.x = stride * 0.8;
    if (G.chaserGap <= root.CFG.CHASER_CATCH_DIST && !G.crashed) {
      logEv('caught', { dist: G.dist });
      crash();
    }
  }

  function loadChunkEntities() {
    for (var k = G.curChunk; k <= G.curChunk + 2; k++) {
      var c = G.chunkMap[k];
      if (c && !c.entitiesLoaded) {
        c.entitiesLoaded = true;
        G.collectibles.loadChunk(c);
        G.powerups.loadChunk(c);
      }
    }
  }

  function updateChunksPos(travel) {
    for (var k in G.chunkMap) {
      var c = G.chunkMap[k];
      c.group.position.z = -(parseInt(k, 10) * root.CFG.CHUNK_LEN) + travel;
      c.startZ = c.group.position.z;
    }
  }

  function envFollow() {
    if (root.BuildEnv && G.env == null) { /* captured below */ }
    if (G._env) G._env.follow({ x: G.camera.position.x, z: G.camera.position.z }, performance.now() / 1000);
  }

  // capture env handle after startup builds it
  var _origStartup = G.startup;
  G.startup = function () {
    _origStartup();
    G._env = G.scene.children.find(function (o) { return o.type === 'Group' && o.children.length > 10; }) || null;
    // more reliable: BuildEnv stores itself
    if (root.EnvHandle) G._env = root.EnvHandle;
  };
})(typeof window !== 'undefined' ? window : globalThis);
