// ============================================================
// NEON MERIDIAN — main.js
// Boot: quality pick, game init, menu wiring.
// ============================================================
'use strict';

(function () {
  const canvas = document.getElementById('game-canvas');

  function boot() {
    GameState.loadSettings();
    const settings = GameState.settings;

    // allow forcing a quality preset via URL (?q=ultra|high|medium|low|qa)
    try {
      const qm = new URLSearchParams(location.search).get('q');
      if (qm && CONFIG.QUALITY_PRESETS[qm]) settings.quality = qm;
    } catch (e) { /* ignore */ }

    window.__game = new Game(canvas);
    const g = window.__game;
    g.menus = new Menus.MenuMgr(g);
    // menus built before hud exists; MenuMgr only touches its own elements in ctor
    g.init(settings.quality);

    // start screen subtitle: show save presence
    const sub = document.getElementById('start-sub');
    if (GameState.hasSave()) {
      sub.textContent = 'A saved city awaits.';
      document.getElementById('btn-continue').classList.remove('dim');
    } else {
      sub.textContent = 'New city. Same night.';
      document.getElementById('btn-continue').classList.add('dim');
      document.getElementById('btn-continue').disabled = true;
    }

    // pause on Escape (pointer lock exit) — only if lock was actually
    // held before (never triggers in headless/CI where lock never grants)
    g.input.onLockChange = (locked) => {
      if (!locked && g.input.hadLock && g.menus.mode === 'playing' && !g.player.dead && g.started) {
        g.menus.pause();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})();
