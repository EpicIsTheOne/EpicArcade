/* SKYLINE DASH — main: renderer, loop, camera, game flow, debug API */
(function () {
  const MARKER = 'SKYLINE-DASH r01 · sweep-9f1928d5 prompt-31 run-01';
  const MEDAL_TIMES = { gold: 50000, silver: 80000, bronze: 130000 };

  /* ---------- renderer / scene ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'game';
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 1200);
  camera.rotation.order = 'YXZ';

  PKW.build(scene);
  PKFX.init(scene);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  /* ---------- game state ---------- */
  const player = new PKPlayer(PKW);
  const G = {
    runState: 'ready',            // ready | running | finished
    startMs: 0, elapsedMs: 0,
    cpIndex: 0, deaths: 0,
    pb: (() => { const v = localStorage.getItem('skyline_pb_ms'); return v ? +v : null; })(),
    shortcutsSeen: {},
    paused: false, started: false,
    fovKick: 0, roll: 0, bobPhase: 0, dip: 0, dipVel: 0
  };

  player.events = {
    jump() { PKAudio.jump(); },
    walljump(strong) { PKAudio.walljump(); PKFX.dashSparks(player.pos, -player.vel.x, -player.vel.z); },
    dash(dx, dz) { PKAudio.dash(); PKFX.dashSparks(player.pos, dx, dz); G.fovKick = Math.min(G.fovKick + 10, 16); },
    land(impact) { PKAudio.land(impact); PKFX.landBurst({ x: player.pos.x, y: player.pos.y - player.hy, z: player.pos.z }, impact); G.dipVel -= Math.min(impact * 0.045, 0.5); },
    slideStart() { PKAudio.slideStart(); },
    slideEnd() {},
    slideDust() {
      if (Math.random() < 0.6) PKFX.slideDust({ x: player.pos.x, y: player.pos.y - player.hy, z: player.pos.z },
        player.vel.x / (player.vel.length() || 1), player.vel.z / (player.vel.length() || 1));
    },
    wallrunStart(side) { PKAudio.step(); },
    wallrunEnd(jumped) {},
    step() { PKAudio.step(); },
    die() { onDeath(); }
  };

  function currentCpSpawn() {
    if (G.cpIndex === 0) return { pos: PKW.spawn.pos, yaw: PKW.spawn.yaw };
    const cp = PKW.cps[G.cpIndex - 1];
    return { pos: cp.spawnPos, yaw: cp.yaw };
  }

  function onDeath() {
    G.deaths++;
    PKAudio.die();
    PKFX.deathPoof(player.pos);
    PKUI.flash('#ff3355');
    PKUI.toast('RESPAWNING…', 'cyan', 900);
    setTimeout(() => {
      const s = currentCpSpawn();
      player.respawn(s.pos, s.yaw);
      G.roll = 0;
    }, 420);
  }

  function resetRun(fullRoam) {
    G.runState = 'ready'; G.elapsedMs = 0; G.cpIndex = 0; G.deaths = 0;
    G.shortcutsSeen = {};
    player.respawn(PKW.spawn.pos, PKW.spawn.yaw);
    PKUI.setRunning(false); PKUI.setTimer(0);
    PKUI.setCp(0, PKW.cpTotal);
  }

  function beginRun() {
    G.runState = 'running';
    G.startMs = performance.now();
    PKUI.setRunning(true);
    PKUI.toast('GO!', 'gold', 900);
  }

  function finishRun() {
    if (G.runState !== 'running') return;
    G.runState = 'finished';
    G.elapsedMs = performance.now() - G.startMs;
    PKUI.setRunning(false);
    const ms = G.elapsedMs;
    let medal = 'none';
    if (ms <= MEDAL_TIMES.gold) medal = 'gold';
    else if (ms <= MEDAL_TIMES.silver) medal = 'silver';
    else if (ms <= MEDAL_TIMES.bronze) medal = 'bronze';
    const newPB = G.pb == null || ms < G.pb;
    if (newPB) { G.pb = Math.round(ms); localStorage.setItem('skyline_pb_ms', G.pb); }
    PKUI.setPB(G.pb);
    PKUI.showFinish({ ms, medal, newPB, pb: G.pb, deaths: G.deaths, cps: G.cpIndex, cpTotal: PKW.cpTotal });
    PKAudio.finish();
    PKFX.finishFireworks(new THREE.Vector3(player.pos.x, player.pos.y + 3, player.pos.z));
    PKInput.releaseLock();
  }

  /* ---------- triggers ---------- */
  function inside(t) {
    return player.pos.x > t.min.x && player.pos.x < t.max.x &&
           player.pos.y > t.min.y && player.pos.y < t.max.y &&
           player.pos.z > t.min.z && player.pos.z < t.max.z;
  }

  function checkTriggers() {
    if (G.runState === 'ready' && player.pos.z < PKW.startLineZ && !player.deathGuard) beginRun();
    for (const cp of PKW.cps) {
      if (cp.id > G.cpIndex && inside(cp)) {
        G.cpIndex = cp.id;
        player.refillDash();
        PKAudio.checkpoint();
        PKFX.checkpointBurst(cp.pos);
        PKUI.toast(cp.id >= PKW.cpTotal ? 'FINAL CHECKPOINT' : 'CHECKPOINT ' + cp.id, 'cyan');
        PKUI.setCp(G.cpIndex, PKW.cpTotal);
      }
    }
    if (G.runState === 'running' && PKW.finish && inside(PKW.finish)) finishRun();
  }

  // shortcut toasts — check nearby shortcut-marked meshes occasionally
  let scTimer = 0;
  function checkShortcuts(dt) {
    scTimer -= dt;
    if (scTimer > 0) return;
    scTimer = 0.5;
    const list = PKW.shortcutMeshes || [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.userData.shortcutMsg || G.shortcutsSeen[m.uuid]) continue;
      const p = m.position;
      if (Math.abs(p.x - player.pos.x) < 6 && Math.abs(p.y - player.pos.y) < 4 && Math.abs(p.z - player.pos.z) < 7) {
        G.shortcutsSeen[m.uuid] = 1;
        PKAudio.shortcut();
        PKUI.toast('⚡ ' + m.userData.shortcutMsg, 'gold');
      }
    }
  }

  /* ---------- input & flow keys ---------- */
  const canvas = renderer.domElement;
  let playing = false;
  const $id = id => document.getElementById(id);

  function enterPlay() {
    playing = true;
    PKUI.hide('intro'); PKUI.hide('pause'); PKUI.hide('finishO');
    PKAudio.init();
    PKInput.requestLock(canvas);
  }

  $id('btnPlay').addEventListener('click', enterPlay);
  $id('btnResume').addEventListener('click', enterPlay);
  $id('btnRestartP').addEventListener('click', () => { resetRun(); enterPlay(); });
  $id('btnAgain').addEventListener('click', () => { resetRun(); enterPlay(); });
  $id('btnRoam').addEventListener('click', () => { PKUI.hide('finishO'); PKInput.requestLock(canvas); });

  canvas.addEventListener('click', () => {
    if (!playing) { enterPlay(); return; }
    const anyOverlay = !$id('intro').classList.contains('hidden') ||
      !$id('pause').classList.contains('hidden') ||
      !$id('finishO').classList.contains('hidden');
    if (!anyOverlay && !PKInput.state.locked) PKInput.requestLock(canvas);
  });

  document.addEventListener('pointerlockchange', () => {
    if (!PKInput.state.locked && playing && G.runState !== 'finished') {
      const helpOpen = PKUI.helpVisible();
      if (!helpOpen) PKUI.show('pause');
    } else {
      PKUI.hide('pause');
    }
  });

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyR' && playing) {
      resetRun();
      PKUI.hide('finishO'); PKUI.hide('pause');
      if (!PKInput.state.locked && !PKUI.helpVisible()) PKInput.requestLock(canvas);
    }
    if (e.code === 'KeyH') { PKUI.toggleHelp(); }
    if (e.code === 'KeyM') { const m = PKAudio.toggleMute(); PKUI.toast(m ? 'MUTED' : 'SOUND ON', '', 900); }
    if (e.code === 'Enter' && G.runState === 'finished') { resetRun(); enterPlay(); }
  });

  PKUI.setPB(G.pb);
  PKUI.setCp(0, PKW.cpTotal);

  /* ---------- camera ---------- */
  const camPos = new THREE.Vector3();
  let introAngle = 0;

  function updateCamera(dt, t) {
    if (!playing) {
      // gentle intro orbit around spawn
      introAngle += dt * 0.11;
      const cx = Math.sin(introAngle) * 14, cz = 6 + Math.cos(introAngle) * 12;
      camPos.set(cx, 5.5 + Math.sin(t * 0.3) * 0.6, cz);
      camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
      camera.lookAt(0, 2, -26);
      camera.rotation.z = 0;
      return;
    }
    // look
    const d = PKInput.consumeLook();
    player.yaw += d.yaw; player.pitch += d.pitch;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));

    // eye position with landing dip + head bob
    G.dip += G.dipVel * dt * 60 * 0.016;
    G.dipVel += (-G.dip * 90 - G.dipVel * 9) * dt;
    const speedH = Math.hypot(player.vel.x, player.vel.z);
    if (player.grounded && speedH > 1 && player.mode !== 'slide') {
      G.bobPhase += dt * (6 + speedH * 0.75);
    } else G.bobPhase *= 1 - Math.min(1, dt * 6);
    const bobY = Math.sin(G.bobPhase * 2) * 0.028 * Math.min(speedH / 9, 1);
    const bobX = Math.cos(G.bobPhase) * 0.02 * Math.min(speedH / 9, 1);

    const eye = player.snapshot().eyeY;
    camera.position.set(
      player.pos.x + bobX * Math.cos(player.yaw),
      eye + G.dip + bobY,
      player.pos.z - bobX * Math.sin(player.yaw)
    );
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // roll: wallrun tilt + slide tilt
    let rollT = 0;
    if (player.mode === 'wallrun') rollT = -player.wallSide * 0.15;
    else if (player.mode === 'slide') rollT = 0.06;
    G.roll += (rollT - G.roll) * Math.min(1, dt * 8);
    camera.rotation.z = G.roll;

    // FOV response
    let fovT = 78;
    const axes = PKInput.axes();
    if (axes.sprint && player.grounded && speedH > 6.5) fovT += 6;
    if (player.mode === 'slide') fovT += 8;
    fovT += Math.min(Math.max((speedH - 9) / 12, 0), 6);
    G.fovKick *= 1 - Math.min(1, dt * 5);
    fovT += G.fovKick;
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 7);
    camera.updateProjectionMatrix();
  }

  /* ---------- loop ---------- */
  const STEP = 1 / 120;
  let acc = 0, lastT = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.06) dt = 0.06;
    const t = now / 1000;

    PKW.update(dt, t);

    if (playing) {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) {
        player.tick(STEP, PKInput.axes());
        acc -= STEP;
      }
      if (guard >= 8) acc = 0;   // dropped frames: don't spiral
      checkTriggers();
      checkShortcuts(dt);

      const snap = player.snapshot();
      PKUI.setSpeed(snap.speedH);
      PKUI.setDash(snap.charges, 2);
      PKUI.setState(
        snap.mode === 'wallrun' ? 'WALL RUN' :
        snap.mode === 'slide' ? 'SLIDE' : '');
      PKAudio.update(dt, snap.speedH, snap.mode === 'slide');
      if (G.runState === 'running') PKUI.setTimer(performance.now() - G.startMs);
    }

    PKFX.update(dt, camera, player.vel, Math.hypot(player.vel.x, player.vel.z));
    updateCamera(dt, t);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  /* ---------- debug/test API ---------- */
  window.PK = {
    marker: MARKER,
    version: 'r01',
    player, world: PKW, ui: PKUI, audio: PKAudio, input: PKInput, fx: PKFX,
    state: G,
    snapshot: () => player.snapshot(),
    teleport(x, y, z, yaw) {
      player.deathGuard = false;
      player.respawn(new THREE.Vector3(x, y, z), yaw != null ? yaw : player.yaw);
      G.roll = 0;
    },
    look(yaw, pitch) { player.yaw = yaw; player.pitch = pitch || 0; },
    resetRun,
    forceStart: beginRun,
    forceFinish: finishRun,
    medals: MEDAL_TIMES,
    playing: () => playing,
    setPlaying(v) { playing = !!v; if (v) PKUI.hide('intro'); },
    renderer
  };
})();
