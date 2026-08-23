/* ============================================================
   VOLT RUSH — ui.js
   Title/level select, pause, results, options.
   ============================================================ */
(function () {
  'use strict';

  const UI = { game: null };
  window.VoltUI = UI;

  const $ = id => document.getElementById(id);
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function hideAllScreens() { ['title-screen', 'results-screen', 'pause-screen'].forEach(hide); }

  UI.init = function (game) {
    UI.game = game;

    $('btn-resume').addEventListener('click', () => UI.resumeGame());
    $('btn-restart').addEventListener('click', () => {
      hideAllScreens();
      game.startLevel(game.levelIndex);
    });
    $('btn-quit').addEventListener('click', () => {
      hideAllScreens();
      game.state = 'title';
      game.buildLevel(game.levelIndex, true);
      UI.showTitle();
    });
    $('btn-retry').addEventListener('click', () => {
      hideAllScreens();
      game.startLevel(game.levelIndex);
    });
    $('btn-next').addEventListener('click', () => {
      hideAllScreens();
      const next = Math.min(VoltLevels.LEVELS.length - 1, game.levelIndex + 1);
      game.startLevel(next);
    });
    $('btn-menu').addEventListener('click', () => {
      hideAllScreens();
      game.state = 'title';
      UI.showTitle();
    });
    $('btn-audio').addEventListener('click', () => {
      const on = $('btn-audio').textContent.includes('ON');
      game.audio.setMusicOn(!on);
      game.audio.setSfxOn(!on);
      if (!on) game.audio.unlock();
      $('btn-audio').textContent = on ? '♪ AUDIO: OFF' : '♪ AUDIO: ON';
    });

    // options
    $('opt-invert-x').addEventListener('change', e => { game.chase.invertX = e.target.checked; });
    $('opt-invert-y').addEventListener('change', e => { game.chase.invertY = e.target.checked; });
    $('opt-music').addEventListener('change', e => game.audio.setMusicOn(e.target.checked));
    $('opt-sfx').addEventListener('change', e => game.audio.setSfxOn(e.target.checked));

    const qDescs = {
      low: 'Rasterizer only · max FPS on weak GPUs (QA mode)',
      high: 'Dynamic shadows · bloom · full FX',
      ultra: '4K shadows · 2x pixel ratio · max bloom',
    };
    document.querySelectorAll('#quality-btns button').forEach(btn => {
      btn.addEventListener('click', () => {
        game.applyQuality(btn.dataset.q);
        $('q-desc').textContent = qDescs[btn.dataset.q];
      });
    });
  };

  UI.syncQualityButtons = function (q) {
    document.querySelectorAll('#quality-btns button').forEach(btn => {
      btn.classList.toggle('sel', btn.dataset.q === q);
    });
  };

  /* ---------------- TITLE / LEVEL SELECT ---------------- */
  UI.showTitle = function () {
    const game = UI.game;
    const save = VoltCollect.loadSave();
    const grid = $('level-grid');
    grid.innerHTML = '';
    let unlockedCount = 1;
    for (let i = 0; i < VoltLevels.LEVELS.length; i++) {
      const lv = save['lvl' + i];
      if (lv && lv.cleared) unlockedCount = Math.max(unlockedCount, i + 2);
    }
    VoltLevels.LEVELS.forEach((lv, i) => {
      const locked = i >= unlockedCount;
      const rec = save['lvl' + i];
      const card = document.createElement('div');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.innerHTML = `
        <div class="lv-name">${lv.name}</div>
        <div class="lv-sub">${lv.env.toUpperCase()} · PAR ${lv.par[1]}s · ${lv.targetShards} SHARDS</div>
        ${rec && rec.cleared ? `<div class="lv-best">BEST ${rec.bestTime.toFixed(2)}s · SHARDS ${rec.bestShards}/${lv.targetShards}</div>` : ''}
        ${rec && rec.rank ? `<div class="lv-rank">${rec.rank}</div>` : ''}
        ${locked ? '<div class="lv-sub" style="margin-top:6px">🔒 CLEAR PREVIOUS SECTOR</div>' : ''}`;
      if (!locked) {
        card.addEventListener('click', () => {
          game.audio.play('ui');
          hideAllScreens();
          game.startLevel(i);
        });
      }
      grid.appendChild(card);
    });
    show('title-screen');
    game.state = 'title';
  };

  /* ---------------- PAUSE ---------------- */
  UI.pauseGame = function () {
    const game = UI.game;
    if (game.state !== 'playing') return;
    game.state = 'paused';
    document.exitPointerLock && document.exitPointerLock();
    show('pause-screen');
  };
  UI.resumeGame = function () {
    const game = UI.game;
    if (game.state !== 'paused') return;
    hideAllScreens();
    game.state = 'playing';
    game._lastT = performance.now();
    const canvas = document.getElementById('game-canvas');
    canvas.requestPointerLock && canvas.requestPointerLock();
  };

  /* ---------------- RESULTS ---------------- */
  UI.showResults = function (game) {
    const s = game.stats;
    const rank = game.computeRank(s, game.levelDef);

    $('rank-badge').textContent = rank;
    $('result-level').textContent = game.levelDef.name + ' — CLEAR';
    $('res-time').textContent = s.time.toFixed(2) + 's';
    $('res-rings').textContent = `${s.rings} / ${s.ringTotal}`;
    $('res-shards').textContent = `${s.shards} / ${s.shardTotal}`;
    $('res-combo').textContent = s.kills + ' destroyed';
    $('res-damage').textContent = s.damage === 0 ? 'FLAWLESS' : s.damage + ' hits';
    $('res-deaths').textContent = String(s.deaths);
    $('btn-next').style.display = game.levelIndex < VoltLevels.LEVELS.length - 1 ? '' : 'none';

    // persist
    const save = VoltCollect.loadSave();
    const key = 'lvl' + game.levelIndex;
    const prev = save[key] || {};
    save[key] = {
      cleared: true,
      bestTime: Math.min(prev.bestTime ?? Infinity, s.time),
      bestShards: Math.max(prev.bestShards ?? 0, s.shards),
      bestRings: Math.max(prev.bestRings ?? 0, s.rings),
      bestRank: rankOrder(rank) < rankOrder(prev.bestRank) ? prev.bestRank : rank,
    };
    VoltCollect.writeSave(save);

    show('results-screen');
    game.audio.play('rank');
  };

  function rankOrder(r) { return ['D', 'C', 'B', 'A', 'S'].indexOf(r); }
})();
