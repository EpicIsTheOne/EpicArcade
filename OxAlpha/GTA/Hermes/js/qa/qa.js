// ============================================================
// NEON MERIDIAN — qa/qa.js
// In-browser QA harness. Loaded only by qa.html.
// Auto-boots the real game, exposes window.__QA controls,
// captures runtime errors for automated inspection.
// ============================================================
'use strict';

(function () {
  const QA = {
    errors: [],
    ready: false,
    started: false,
    log: [],
  };
  window.__QA = QA;

  window.addEventListener('error', (e) => {
    QA.errors.push(String(e.message || e) + ' @ ' + String(e.filename || '').split('/').pop() + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    QA.errors.push('rejection: ' + String(e.reason));
  });

  function note(msg) { QA.log.push(msg); }

  // ---- wait for game object ----
  const bootWait = setInterval(() => {
    // fully initialized only when hud + menus exist (init() tail)
    if (window.__game && window.__game.player && window.__game.hud && window.__game.menus) {
      clearInterval(bootWait);
      QA.ready = true;
      note('game booted');
      // CI/headless: never auto-pause on phantom pointer-lock transitions
      window.__game.input.onLockChange = () => {};
      autoStart();
    }
  }, 200);

  function autoStart() {
    const btn = document.getElementById('btn-new');
    if (!btn) { QA.errors.push('no #btn-new'); return; }
    btn.click();
    note('autoStart clicked');
    // poll until the menu actually flips to playing (bounded)
    const t0 = performance.now();
    const iv = setInterval(() => {
      const g = window.__game;
      if (g && g.menus && g.menus.mode === 'playing') {
        QA.started = true;
        clearInterval(iv);
        note('started confirmed');
      } else if (performance.now() - t0 > 6000) {
        clearInterval(iv);
        QA.started = true;   // assume click landed; let tests proceed
        g.input.onLockChange = () => {};
        note('started assumed after timeout');
      }
    }, 150);
  }

  // ---- public helpers ----
  QA.state = function () {
    const g = window.__game;
    if (!g || !g.player) return { error: 'no game' };
    const p = g.player;
    return {
      mode: g.menus.mode,
      pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) },
      camYaw: +p.camYaw.toFixed(4),
      camPitch: +p.camPitch.toFixed(4),
      heading: +p.heading.toFixed(4),
      hp: Math.round(p.hp),
      money: GameState.state.money,
      wanted: g.wanted.stars,
      heat: +g.wantedSys.heat.toFixed(1),
      inVehicle: p.inVehicle ? p.inVehicle.kind : null,
      vehicleSpeed: p.inVehicle ? +p.inVehicle.speed.toFixed(2) : null,
      vehicleHeading: p.inVehicle ? +p.inVehicle.heading.toFixed(4) : null,
      steerInput: p.inVehicle ? p.inVehicle.steerInput : null,
      timeHours: +g.sky.timeHours.toFixed(3),
      isNight: g.sky.isNight,
      raining: !!g.sky.state.raining,
      fps: Math.round(g.fps),
      drawCalls: g.renderer.info.render.calls,
      triangles: g.renderer.info.render.triangles,
      peds: g.npc.peds.length,
      traffic: g.npc.traffic.length,
      policeCars: g.npc.police.length,
      footCops: g.npc.footCops.length,
      parkedVehicles: g.vehicles.length,
      missionActive: !!(g.missions && g.missions.active),
      missionsDone: GameState.state.missionsDone.slice(),
      packagesFound: GameState.state.packagesFound.length,
      district: g.layout.districtAt(p.pos.x, p.pos.z),
      quality: g.qualityId,
      errorsSoFar: QA.errors.length,
    };
  };

  QA.key = function (code, downFlag) {
    const g = window.__game;
    g.input.keys[code] = !!downFlag;
    if (downFlag) g.input.pressed[code] = true;
    return true;
  };

  QA.tap = function (code, ms) {
    QA.key(code, true);
    setTimeout(() => QA.key(code, false), ms || 120);
    return true;
  };

  QA.look = function (dx, dy) {
    const g = window.__game;
    g.input.mouseDX += dx * 0.01;   // sens-scaled degrees-ish
    g.input.mouseDY += dy * 0.01;
    return true;
  };

  QA.mouseButton = function (btn, downFlag) {
    const g = window.__game;
    if (btn === 'left') g._mouseL = downFlag;
    if (btn === 'right') g._mouseR = downFlag;
    return true;
  };

  QA.waitReady = function () { return QA.ready && QA.started; };

  QA.teleport = function (x, z) {
    const g = window.__game;
    g.player.pos.x = x; g.player.pos.z = z; g.player.pos.y = 0.14;
    return true;
  };

  QA.setTime = function (h) { window.__game.sky.setTime(h); return true; };

  QA.setWeather = function (m) { window.__game.sky.setWeather(m); return true; };

  QA.giveCar = function (clsId) {
    const g = window.__game;
    const v = new Vehicle(clsId || 'sports', g.player.pos.x + 5, g.player.pos.z + 2, 0);
    v.driver = null;
    g.scene.add(v.mesh.group);
    g.vehicles.push(v);
    return v.id;
  };

  QA.enterNearestCar = function () {
    window.__game.tryEnterVehicle();
    return QA.state().inVehicle;
  };

  QA.wantedSet = function (heat) {
    const g = window.__game;
    g.wantedSys.heat = heat;
    g.wantedSys.recomputeLevel();
    return g.wanted.stars;
  };

  QA.crimeReport = function () {
    const g = window.__game;
    g.crimeReported('assault', g.player.pos);
    return QA.state().wanted;
  };

  QA.startMissionByName = function (defId) {
    const g = window.__game;
    return g.missions.start(defId, g);
  };

  QA.saveNow = function () { window.__game.autosave(); return GameState.hasSave(); };

  QA.wipeSave = function () { GameState.clearSave(); return true; };

  QA.screenshotNote = function (label) { note(label); return true; };

  // ---- title channel: headless runs read state from <title> ----
  setInterval(() => {
    try {
      const s = QA.state();
      document.title = 'QASTATE ' + JSON.stringify({ s, errors: QA.errors.slice(0, 4) });
    } catch (e) {
      document.title = 'QASTATE {"err":"' + e.message + '"}';
    }
  }, 700);
})();
