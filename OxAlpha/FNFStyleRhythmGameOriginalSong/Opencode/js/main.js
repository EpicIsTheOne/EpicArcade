/* App shell: state machine, screens, input, render loop. */
(function () {
  "use strict";
  const { Battle, initSprites } = window.BattleGame;
  const { Char } = window.GameChars;
  const { Stage } = window.GameStage;
  const A = window.AudioEngine;
  const DATA = window.SONG_DATA;

  const cv = document.getElementById("cv");
  const c = cv.getContext("2d");
  const W = 1280, H = 720;

  const $ = id => document.getElementById(id);
  const screens = {
    title: $("screen-title"), select: $("screen-select"), pause: $("screen-pause"),
    results: $("screen-results"), fail: $("screen-fail"),
  };
  function show(name) {
    for (const k in screens) screens[k].classList.toggle("on", k === name);
  }

  // URL flags for testing
  const q = new URLSearchParams(location.search);
  const FLAG = {
    autoplay: q.get("autoplay") === "1",
    seek: q.get("seek") ? parseFloat(q.get("seek")) : null,
    hp: q.get("hp") ? parseFloat(q.get("hp")) : null,
  };

  initSprites();

  const State = { TITLE: "title", SELECT: "select", PLAY: "play", PAUSE: "pause", RESULTS: "results", FAIL: "fail" };
  const app = {
    state: State.TITLE,
    battle: null,
    kaz: new Char("kaz", -1),
    vexx: new Char("vexx", 1),
    cam: { x: 0, y: 0, zoom: 1, shake: 0 },
    beatIndex: -1,
    beatPulse: 0,
    countdown: null,
    menuT: 0,
    pausedAt: 0,
    lastTs: 0,
  };

  // ---------------- best score ----------------
  function loadBest() {
    try { return JSON.parse(localStorage.getItem("nv_best") || "null"); } catch (e) { return null; }
  }
  function saveBest(b) { try { localStorage.setItem("nv_best", JSON.stringify(b)); } catch (e) { /* private mode */ } }
  function refreshBestLabel() {
    const b = loadBest();
    $("song-best").textContent = b
      ? `BEST — ${b.rank} · ${b.score} pts · ${b.acc}% acc`
      : "NO RECORD YET — set one.";
  }

  // ---------------- flow ----------------
  async function boot() {
    $("tag-bpm").textContent = `${Math.round(DATA.bpm)} BPM`;
    const secs = Math.round(DATA.lengthMs / 1000);
    $("tag-len").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    refreshBestLabel();
    // preload audio in background (needs no gesture for fetch+decode in Chrome? decode needs ctx)
    try {
      await A.load("assets/audio/song.mp3");
      window.__audioReady = true;
    } catch (err) {
      $("press-start").textContent = "AUDIO FAILED TO LOAD — " + err.message;
    }
  }

  function startSong() {
    if (!A.ready) { $("press-start").textContent = "STILL LOADING… one sec, hit PLAY again."; return; }
    A.ensureCtx();
    A.sfxConfirm();
    app.battle = new Battle(DATA, { autoplay: FLAG.autoplay, health: FLAG.hp });
    app.beatIndex = -1;
    app.lastSingAt = null;
    app.state = State.PLAY;
    show(null);
    const lead = 8 * DATA.spbMs / 1000;
    const seek = FLAG.seek || 0;
    A.play(-lead + seek);
    app.countdown = seek > 0 ? null : { total: lead, lastIdx: 0 };
  }

  function endSong(result) {
    if (result === "fail") {
      A.fadeOutStop(0.3);
      app.state = State.FAIL;
      A.sfxLose();
      show("fail");
      return;
    }
    A.stop();
    const b = app.battle;
    const acc = b.accuracy() * 100;
    let rank = "D";
    if (acc >= 95) rank = "S"; else if (acc >= 90) rank = "A";
    else if (acc >= 80) rank = "B"; else if (acc >= 70) rank = "C";
    const fc = b.judge.miss === 0 && b.judge.bad === 0;
    $("results-head").textContent = fc ? "TRACK CLEARED — FULL COMBO!" : "TRACK CLEARED!";
    $("results-rank").textContent = rank;
    $("results-grid").innerHTML = [
      ["SCORE", b.score], ["ACCURACY", acc.toFixed(2) + "%"], ["MAX COMBO", b.maxCombo],
      ["SICK", b.judge.sick], ["GOOD", b.judge.good], ["BAD", b.judge.bad],
      ["MISS", b.judge.miss], ["RANK", rank], ["HEALTH LEFT", Math.max(0, Math.round(b.health)) + "%"],
    ].map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join("");
    const prev = loadBest();
    let recMsg = "";
    if (!prev || b.score > prev.score) {
      saveBest({ score: b.score, acc: acc.toFixed(2), rank });
      recMsg = prev ? "★ NEW RECORD ★" : "★ FIRST RECORD SET ★";
      refreshBestLabel();
    }
    $("results-record").textContent = recMsg;
    app.state = State.RESULTS;
    A.sfxWin();
    show("results");
  }

  function pauseGame() {
    if (app.state !== State.PLAY) return;
    app.pausedAt = A.pos();
    A.stop();
    app.state = State.PAUSE;
    const b = app.battle;
    $("pause-stats").textContent = `score ${b.score} · combo ${b.combo} · ${Math.max(0, app.pausedAt).toFixed(1)}s`;
    show("pause");
    A.sfxBack();
  }
  function resumeGame() {
    A.play(app.pausedAt);
    app.state = State.PLAY;
    show(null);
    A.sfxConfirm();
  }
  function quitToMenu(toSelect) {
    A.stop();
    app.state = toSelect ? State.SELECT : State.TITLE;
    app.battle = null;
    show(toSelect ? "select" : "title");
    A.sfxBack();
  }

  // ---------------- input ----------------
  const KEYMAP = {
    ArrowLeft: 0, KeyA: 0, KeyD: 0,        // D = left (DFJK)
    ArrowDown: 1, KeyS: 1, KeyF: 1,
    ArrowUp: 2, KeyW: 2, KeyJ: 2,
    ArrowRight: 3, KeyK: 3, KeyL: 3,
  };
  window.addEventListener("keydown", e => {
    if (e.repeat) return;
    const lane = KEYMAP[e.code];
    if (app.state === State.PLAY) {
      if (lane != null) { e.preventDefault(); app.battle.press(lane); return; }
      if (e.code === "Escape") { pauseGame(); return; }
    } else if (app.state === State.PAUSE) {
      if (e.code === "Escape") resumeGame();
      return;
    } else if (app.state === State.TITLE) {
      if (e.code === "Enter" || e.code === "Space") { toSelect(); }
      return;
    } else if (app.state === State.SELECT) {
      if (e.code === "Enter" || e.code === "Space") startSong();
      else if (e.code === "Escape") quitToMenu(false);
      return;
    } else if (app.state === State.RESULTS || app.state === State.FAIL) {
      if (e.code === "Enter") startSong();
      else if (e.code === "Escape") quitToMenu(true);
      return;
    }
  });
  window.addEventListener("keyup", e => {
    const lane = KEYMAP[e.code];
    if (lane != null && app.state === State.PLAY && app.battle) app.battle.release(lane);
  });

  function toSelect() {
    A.ensureCtx();
    A.sfxSelect();
    app.state = State.SELECT;
    show("select");
  }

  $("press-start").parentElement.addEventListener("click", () => { if (app.state === State.TITLE) toSelect(); });
  $("song-card").addEventListener("click", () => { if (app.state === State.SELECT) startSong(); });
  $("btn-resume").addEventListener("click", resumeGame);
  $("btn-restart").addEventListener("click", () => { show(null); startSong(); });
  $("btn-quit").addEventListener("click", () => quitToMenu(true));
  $("btn-retry").addEventListener("click", () => { show(null); startSong(); });
  $("btn-menu").addEventListener("click", () => quitToMenu(true));
  $("btn-fail-retry").addEventListener("click", () => { show(null); startSong(); });
  $("btn-fail-menu").addEventListener("click", () => quitToMenu(true));
  $("volume").addEventListener("input", e => { A.ensureCtx(); A.setVolume(e.target.value / 100); });

  // ---------------- char sing hook ----------------
  function onCharSing(side, lane, isMiss) {
    const ch = side === 0 ? app.vexx : app.kaz;
    if (isMiss) ch.trigger("miss");
    else ch.trigger(["left", "down", "up", "right"][lane]);
  }

  // ---------------- main loop ----------------
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - app.lastTs) / 1000 || 0.016);
    app.lastTs = ts;
    app.menuT += dt;

    const playing = app.state === State.PLAY && app.battle;
    const posSec = playing ? A.pos() : 0;
    const posMs = posSec * 1000;

    // beat tracking
    const spb = DATA.spbMs / 1000;
    let beat = Math.floor(posSec / spb);
    let beatPulse = 0;
    if (playing) {
      if (beat !== app.beatIndex && posSec >= 0) {
        app.beatIndex = beat;
        app.cam.zoom = 1.022;
      }
      const frac = ((posSec % spb) + spb) % spb / spb;
      beatPulse = Math.max(0, 1 - frac * 3.2);
    }
    app.beatPulse = beatPulse;
    app.cam.zoom += (1 - app.cam.zoom) * Math.min(1, dt * 6);

    // countdown
    let countText = null;
    if (playing && app.countdown) {
      app.countdown.total -= dt;
      const remain = app.countdown.total;
      if (remain <= 0) app.countdown = null;
      else {
        const beatsLeft = remain / spb;
        if (beatsLeft > 4) countText = { txt: "READY", sub: "get moving…" };
        else if (beatsLeft > 3) countText = { txt: "3" };
        else if (beatsLeft > 2) countText = { txt: "2" };
        else if (beatsLeft > 1) countText = { txt: "1" };
        else countText = { txt: "GO!!" };
        const idx = Math.ceil(beatsLeft);
        if (idx !== app.countdown.lastIdx) {
          app.countdown.lastIdx = idx;
          A.sfxCount(beatsLeft <= 1);
        }
      }
    }

    // update battle
    let result = null;
    if (playing && !app.countdown) {
      result = app.battle.update(dt, posMs, onCharSing);
      if (result === "fail") { endSong("fail"); }
      else if (result === "done") { endSong("win"); }
    }

    // manual-input sing trigger (non-autoplay): sing on most recent hit
    if (playing && !FLAG.autoplay && app.battle.lastHit) {
      const lh = app.battle.lastHit;
      if (!app.lastSingAt || lh.t !== app.lastSingAt) {
        app.lastSingAt = lh.t;
        onCharSing(1, lh.lane, false);
      }
    }

    // camera pan toward active singer
    let panT = 0;
    if (playing && app.battle.lastTurnSide >= 0) panT = app.battle.lastTurnSide === 0 ? -1 : 1;
    app.cam.x += (panT * 26 - app.cam.x) * Math.min(1, dt * 2.2);
    app.cam.y = 0;

    // ---------------- draw ----------------
    c.clearRect(0, 0, W, H);
    const inGame = playing || app.state === State.PAUSE || app.state === State.FAIL;
    const camZoom = inGame ? app.cam.zoom : 1.04 + Math.sin(app.menuT * 0.13) * 0.012;
    const camX = inGame ? app.cam.x : Math.sin(app.menuT * 0.07) * 30;
    const energy = playing ? Math.min(1, 0.3 + posMs / 60000) : 0.4;
    Stage.draw(c, W, H, { x: camX, y: 0, zoom: camZoom }, inGame ? beatPulse : 0.3 + 0.2 * Math.sin(app.menuT * 2), playing ? app.beatIndex : Math.floor(app.menuT * 2.5), energy);

    if (inGame || app.state === State.RESULTS) {
      // characters
      const shx = (Math.random() * 2 - 1) * 8 * (app.battle ? app.battle.shake : 0);
      c.save();
      c.translate(shx, 0);
      app.vexx.update(dt, beatPulse);
      app.kaz.update(dt, beatPulse);
      app.vexx.draw(c, 250, 560, 1.06);
      app.kaz.draw(c, 1030, 560, 1.06);
      c.restore();
    }

    if (playing) {
      const b = app.battle;
      b.drawField(c, 0, posMs, true);   // opponent (dimmed)
      b.drawField(c, 1, posMs, false);  // player
      b.particles.draw(c);
      b.drawHUD(c, W, posMs);
    }

    if (playing && app.battle.failed) {
      // brief red slam before fail screen shows
      c.fillStyle = `rgba(120,0,20,${Math.min(0.5, -app.battle.health / 40)})`;
      c.fillRect(0, 0, W, H);
    }

    if (countText) {
      c.save();
      c.textAlign = "center";
      const big = countText.txt === "GO!!";
      c.font = `italic 900 ${big ? 96 : 84}px 'Arial Black', sans-serif`;
      c.fillStyle = big ? "#5cff7a" : "#fff";
      c.shadowColor = big ? "#5cff7a" : "#25d0ff";
      c.shadowBlur = 30;
      const pulse = 1 + (app.countdown ? Math.max(0, (app.countdown.total % spb) / spb) : 0) * 0.12;
      c.translate(W / 2, 330);
      c.scale(pulse, pulse);
      c.fillText(countText.txt, 0, 0);
      if (countText.sub) {
        c.shadowBlur = 0;
        c.font = "700 20px 'Segoe UI', sans-serif";
        c.fillStyle = "rgba(255,255,255,.75)";
        c.fillText(countText.sub, 0, 40);
      }
      c.restore();
    }

    if (app.state === State.TITLE || app.state === State.SELECT) {
      // dim stage for menu readability
      c.fillStyle = "rgba(5,3,15,.45)";
      c.fillRect(0, 0, W, H);
    }
  }

  // ---------------- debug handle ----------------
  window.__game = {
    get state() { return app.state; },
    get score() { return app.battle ? app.battle.score : -1; },
    get combo() { return app.battle ? app.battle.combo : -1; },
    get health() { return app.battle ? app.battle.health : -1; },
    get judgments() { return app.battle ? app.battle.judge : null; },
    get accuracy() { return app.battle ? app.battle.accuracy() : -1; },
    get posMs() { return A.pos() * 1000; },
    get audioReady() { return !!window.__audioReady; },
    start: startSong, toSelect,
  };

  show("title");
  boot();
  requestAnimationFrame(frame);
})();
