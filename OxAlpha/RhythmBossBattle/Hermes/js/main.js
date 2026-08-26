/* ============================================================
 * PULSEBREAK (PBK.v1) — js/main.js
 * Bootstrap, input handling, overlay wiring, main loop,
 * debug/test hooks (window.__RB).
 * ============================================================ */
(function () {
  'use strict';

  const RB = window.RB;

  const canvas = document.getElementById('game');
  const audio = new RB.AudioEngine(RB.SONG);
  const game = new RB.Game(RB.SONG, audio);
  const renderer = new RB.Renderer(canvas, RB.SONG);

  // ---- DOM refs --------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const menuEl = $('menu'), pauseEl = $('pauseOverlay'), resultEl = $('resultOverlay');
  const resultTitle = $('resultTitle'), rankEl = $('rankLetter'), statsEl = $('resultStats');

  let lastState = null;

  function show(el, on) { el.classList.toggle('hidden', !on); }

  function syncOverlays() {
    if (game.state === lastState) return;
    lastState = game.state;
    show(menuEl, game.state === 'menu');
    show(pauseEl, game.state === 'paused');
    show(resultEl, game.state === 'won' || game.state === 'lost');
    if (game.state === 'won' || game.state === 'lost') {
      const won = game.state === 'won';
      resultTitle.textContent = won ? 'ENCORE COMPLETE' :
        (game.reason === 'hp' ? 'YOUR PULSE FADED' : 'CONSUMED BY THE ENCORE');
      resultTitle.className = 'result-title ' + (won ? 'win' : 'lose');
      const r = game.rank();
      rankEl.textContent = won && r ? r : '\u2014';
      rankEl.style.color = r === 'S' ? '#ffd97a' : r === 'A' ? '#7ce87c' : '#b48cff';
      statsEl.textContent =
        `Score ${String(game.score).padStart(7, '0')}   \u00b7   Best combo ${game.maxCombo}\n` +
        `Accuracy ${game.accuracy.toFixed(1)}%   \u00b7   PERFECT ${game.counts.P} / GOOD ${game.counts.G} / MISS ${game.counts.M}\n` +
        `Resonance blasts: ${game.specials}`;
      statsEl.classList.add('show');
    }
  }

  // ---- actions -----------------------------------------------------------
  function startGame() {
    audio.init();
    audio.sfxUi();
    game.begin();
    syncOverlays();
  }

  function restart() {
    audio.init();
    game.begin();
    syncOverlays();
  }

  function goMenu() {
    audio.finished = true;
    try { audio.stopAll(); } catch (e) { /* */ }
    game.resetRun();
    lastState = null;
    syncOverlays();
  }

  function pauseToggle() {
    if (game.state === 'playing') {
      game.state = 'paused';
      audio.suspend();
      lastState = null; syncOverlays();
    } else if (game.state === 'paused') {
      game.state = 'playing';
      audio.resume();
      lastState = null; syncOverlays();
    }
  }

  $('btnStart').addEventListener('click', startGame);
  $('btnResume').addEventListener('click', pauseToggle);
  $('btnRestartPause').addEventListener('click', () => { restart(); });
  $('btnQuit').addEventListener('click', goMenu);
  $('btnRetry').addEventListener('click', () => { restart(); });
  $('btnMenu').addEventListener('click', goMenu);

  // ---- keyboard ------------------------------------------------------------
  const KEYLANE = {
    KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3,
    ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  };
  const LANES_M1 = 3;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const lane = KEYLANE[e.code];
    if (lane !== undefined) {
      e.preventDefault();
      renderer.notePress(lane);
      game.hitLane(lane);
      return;
    }
    switch (e.code) {
      case 'Enter': case 'Space':
        if (game.state === 'menu') { e.preventDefault(); startGame(); }
        else if (game.state === 'won' || game.state === 'lost') { e.preventDefault(); restart(); }
        break;
      case 'KeyR':
        if (game.state !== 'menu') restart();
        break;
      case 'KeyQ':
        if (game.state !== 'menu') goMenu();
        break;
      case 'Escape': case 'KeyP':
        pauseToggle();
        break;
      case 'KeyM':
        audio.toggleMute();
        break;
    }
  });

  // touch/click zones across the bottom area for lane input
  canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * innerWidth;
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.55) return;
    const p = Math.min(1, Math.max(0, (y - renderer.hwTopY) / (renderer.recvY - renderer.hwTopY)));
    const half = renderer.laneX(p).half;
    const rel = (x - renderer.cx + half) / (half * 2);
    const lane = Math.min(LANES_M1, Math.max(0, Math.floor(rel * 4)));
    renderer.notePress(lane);
    game.hitLane(lane);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') pauseToggle();
  });

  window.addEventListener('resize', () => renderer.resize());

  // ---- debug / test hooks ----------------------------------------------------
  window.__RB = {
    version: 'PBK.v1',
    seek: (t) => { game.seek(t); lastState = null; syncOverlays(); },
    autopilot: (on) => { game.autopilot = !!on; },
    press: (lane) => game.hitLane(lane),
    stats: () => game.stats(),
    mute: () => audio.toggleMute(),
  };

  // ---- main loop ---------------------------------------------------------------
  let prevTs = performance.now();
  let frameAvg = 16, lowApplied = false;

  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = (ts - prevTs) / 1000;
    prevTs = ts;
    if (dt > 0.05) dt = 0.05;
    if (document.hidden) return;

    game.update(dt);
    renderer.draw(game, dt);
    syncOverlays();

    // adaptive quality
    frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
    if (!lowApplied && frameAvg > 30 && ts > 8000) {
      lowApplied = true;
      renderer.lowPerf = true;
      renderer.dpr = 1;
      renderer.resize();
    }
  }
  requestAnimationFrame(frame);

})();
