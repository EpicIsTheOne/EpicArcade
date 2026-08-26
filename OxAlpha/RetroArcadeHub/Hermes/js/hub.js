'use strict';
/* RETRO-HUB-RUN02 hub: cabinet lobby, themes/unlocks, recent runs, help, glue
   (RH.registerGame is defined in storage.js so game files can self-register) */

(function () {
  const store = RH.store, audio = RH.audio, engine = RH.engine;

  const THEMES = [
    { id: 'neon',   name: 'NEON NIGHT',     need: null },
    { id: 'sunset', name: 'SUNSET DRIVER',  need: ['nova', 1500] },
    { id: 'slime',  name: 'SLIMEWAVE',      need: ['meteor', 600] },
    { id: 'gold',   name: 'GOLDEN AGE',     need: ['brick', 1200] },
    { id: 'tokyo',  name: 'MIDNIGHT TOKYO', need: ['turbo', 1500] },
  ];

  let sel = 0;
  const ui = {};
  const hiEls = {};

  function $(q) { return document.querySelector(q); }
  const gameById = id => RH.games.find(g => g.id === id);

  /* ---------- lobby build ---------- */
  function buildCabinets() {
    const row = $('#cab-row');
    row.innerHTML = '';
    RH.games.forEach((g, i) => {
      const d = document.createElement('div');
      d.className = 'cab' + (i === sel ? ' sel' : '');
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', 'Play ' + g.title);
      d.style.setProperty('--gc', g.color);
      d.style.setProperty('--glowc', hexA(g.color, 0.35));
      d.innerHTML =
        '<div class="cab-top">' + g.title + '</div>' +
        '<div class="cab-screen scr-' + g.id + '">' +
        '  <div class="hi">HI <span>000000</span></div>' +
        '  <div class="fx"></div>' +
        '</div>' +
        '<div class="cab-deck"><span class="stick"></span><span class="btn-d"></span><span class="btn-d"></span></div>' +
        '<div class="cab-tag">' + g.tagline.toUpperCase() + '</div>';
      d.addEventListener('mouseenter', () => select(i));
      d.addEventListener('click', () => launch(i));
      row.appendChild(d);
      hiEls[g.id] = d.querySelector('.hi span');
    });
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  function select(i) {
    if (i === sel) return;
    sel = (i + RH.games.length) % RH.games.length;
    document.querySelectorAll('.cab').forEach((c, k) => c.classList.toggle('sel', k === sel));
    audio.play('move');
  }

  /* ---------- panels ---------- */
  function refreshHiScores() {
    for (const g of RH.games) {
      if (hiEls[g.id]) hiEls[g.id].textContent = String(store.best(g.id)).padStart(6, '0');
    }
  }

  function renderThemes() {
    const row = $('#theme-row');
    row.innerHTML = '';
    const s = store.get();
    for (const t of THEMES) {
      const unlocked = s.unlocked.includes(t.id);
      const b = document.createElement('button');
      b.className = 'theme-tile' + (unlocked ? '' : ' locked') + (s.theme === t.id ? ' active' : '');
      b.dataset.theme = t.id;
      b.innerHTML =
        '<span class="sw sw-' + t.id + '"></span>' +
        '<span>' + t.name +
        (t.need
          ? (unlocked
            ? '<small>UNLOCKED</small>'
            : '<small>LOCKED — BEST ' + (store.best(t.need[0]) || 0) + '/' + t.need[1] + ' IN ' + (gameById(t.need[0]) ? gameById(t.need[0]).title : '?') + '</small>')
          : '<small>DEFAULT</small>') +
        '</span>';
      b.addEventListener('click', e => {
        e.currentTarget.blur();
        if (!s.unlocked.includes(t.id)) {
          toast('LOCKED — ' + unlockHint(t));
          audio.play('bounce');
          return;
        }
        applyTheme(t.id);
        audio.play('select');
      });
      row.appendChild(b);
    }
  }

  function unlockHint(t) {
    if (!t.need) return '';
    const gm = gameById(t.need[0]);
    return 'SCORE ' + t.need[1] + ' IN ' + (gm ? gm.title : '?');
  }

  function applyTheme(id) {
    document.body.dataset.theme = id;
    const s = store.get();
    s.theme = id;
    store.save();
    renderThemes();
  }

  function cycleTheme(dir) {
    const unlockedIds = THEMES.filter(t => store.get().unlocked.includes(t.id)).map(t => t.id);
    const cur = unlockedIds.indexOf(document.body.dataset.theme);
    const next = unlockedIds[(cur + dir + unlockedIds.length) % unlockedIds.length];
    applyTheme(next);
    audio.play('select');
    const t = THEMES.find(x => x.id === next);
    toast('THEME: ' + t.name);
  }

  function checkUnlocks() {
    const s = store.get();
    let anyNew = false;
    for (const t of THEMES) {
      if (!t.need) continue;
      if (!s.unlocked.includes(t.id) && store.best(t.need[0]) >= t.need[1]) {
        s.unlocked.push(t.id);
        toast('\u{1F513} THEME UNLOCKED — ' + t.name, true);
        audio.play('unlock');
        anyNew = true;
      }
    }
    if (anyNew) { store.save(); renderThemes(); }
  }

  function ago(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function renderRuns() {
    const list = $('#runs-list');
    const runs = store.get().runs;
    list.innerHTML = '';
    if (!runs.length) {
      list.innerHTML = '<li class="empty">NO RUNS YET — PICK A CABINET!</li>';
      return;
    }
    for (const r of runs.slice(0, 9)) {
      const g = gameById(r.g);
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="r-g">' + (g ? g.title : r.g) + '</span>' +
        '<span class="r-s">' + r.s.toLocaleString() + '</span>' +
        '<span class="r-t">' + ago(r.t) + '</span>';
      list.appendChild(li);
    }
  }

  function renderStats() {
    const s = store.get();
    let plays = 0, total = 0;
    for (const g of RH.games) { plays += s.plays[g.id] || 0; total += s.best[g.id] || 0; }
    $('#stats').innerHTML =
      '<span class="chip">TOTAL RUNS <b>' + plays + '</b></span>' +
      '<span class="chip">BEST SUM <b>' + total.toLocaleString() + '</b></span>' +
      '<span class="chip">THEMES <b>' + s.unlocked.length + '/' + THEMES.length + '</b></span>' +
      '<span class="chip">GAMES <b>' + RH.games.length + '</b></span>';
  }

  function refreshAll() { refreshHiScores(); renderThemes(); renderRuns(); renderStats(); }

  /* ---------- toasts ---------- */
  function toast(msg, gold) {
    const t = document.createElement('div');
    t.className = 'toast' + (gold ? ' gold' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  /* ---------- game layer ---------- */
  function launch(i) {
    const def = RH.games[i];
    if (!def) return;
    select(i);
    cur = def;
    $('#g-title').textContent = def.title;
    $('#g-controls-hint').textContent = def.hint;
    ui.layer.hidden = false;
    document.body.classList.add('in-game');
    engine.onEnd = onRunEnd;
    engine.onQuit = closeLayer;
    engine.start(def);
    audio.play('coin');
    refreshHiScores();
  }
  let cur = null;

  function onRunEnd(id, score, newBest) {
    const nb = store.recordRun(id, score);
    checkUnlocks();
    refreshAll();
    if (nb && score > 0) toast('\u2605 NEW RECORD: ' + score.toLocaleString() + ' \u2605', true);
  }

  function closeLayer() {
    ui.layer.hidden = true;
    document.body.classList.remove('in-game');
    cur = null;
    refreshAll();
  }

  /* ---------- help ---------- */
  function buildHelp() {
    $('#help-general').innerHTML =
      '<h4>ARCADE FLOOR</h4><table>' +
      '<tr><td><span class="kbd">\u2190 \u2192</span></td><td>select cabinet</td></tr>' +
      '<tr><td><span class="kbd">ENTER</span> / <span class="kbd">SPACE</span></td><td>play selected cabinet / start &amp; retry in-game</td></tr>' +
      '<tr><td><span class="kbd">ESC</span></td><td>back out (double-tap ESC while playing quits to lobby)</td></tr>' +
      '<tr><td><span class="kbd">P</span> · <span class="kbd">M</span> · <span class="kbd">T</span></td><td>pause · sound on/off · cycle unlocked themes</td></tr>' +
      '<tr><td colspan="2" style="color:var(--dim)">High scores and unlocked themes are saved locally in this browser.</td></tr>' +
      '</table>';
    $('#help-games').innerHTML = RH.games.map(g =>
      '<h4 style="color:' + g.color + '">' + g.title + '</h4><table>' +
      g.controls.map(c =>
        '<tr><td><span class="kbd">' + c[0] + '</span></td><td>' + c[1] + '</td></tr>'
      ).join('') + '</table>'
    ).join('');
  }
  function openHelp() { ui.help.hidden = false; }
  function closeHelp() { ui.help.hidden = true; }

  /* ---------- mute ---------- */
  function syncMuteBtn() {
    $('#btn-mute').textContent = store.get().muted ? 'SND OFF [M]' : 'SND ON [M]';
  }
  function toggleMute() {
    const v = !store.get().muted;
    store.get().muted = v;
    store.save();
    audio.setMuted(v);
    syncMuteBtn();
    if (!v) { audio.unlock(); audio.play('select'); }
  }

  /* ---------- global keys ---------- */
  window.addEventListener('keydown', e => {
    const c = e.code;

    if (c === 'KeyM') { toggleMute(); e.preventDefault(); return; }

    if (!ui.help.hidden) {
      if (c === 'Escape' || c === 'KeyH' || c === 'Enter') { closeHelp(); e.preventDefault(); }
      return;
    }

    if (!ui.layer.hidden) {
      switch (c) {
        case 'Escape': engine.escPressed(performance.now()); break;
        case 'KeyP': engine.togglePause(); break;
        case 'KeyH': if (engine.phase === 'playing') engine.togglePause(); openHelp(); break;
        case 'Space': case 'Enter':
          engine.primaryPressed(performance.now());
          e.preventDefault();
          break;
      }
      return;
    }

    // lobby
    if (c === 'ArrowLeft' || c === 'KeyA') { select(sel - 1); e.preventDefault(); }
    else if (c === 'ArrowRight' || c === 'KeyD') { select(sel + 1); e.preventDefault(); }
    else if (c === 'Enter' || c === 'Space') { launch(sel); e.preventDefault(); }
    else if (c === 'KeyT') { cycleTheme(1); }
    else if (c === 'KeyH') { openHelp(); }
  });

  // auto-pause when the tab loses focus mid-run
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine.phase === 'playing') engine.togglePause();
  });

  /* ---------- boot ---------- */
  function boot() {
    ui.layer = $('#game-layer');
    ui.help = $('#help-overlay');
    engine.attach($('#game-canvas'));

    buildCabinets();
    buildHelp();
    refreshAll();

    const s = store.get();
    if (!THEMES.some(t => t.id === s.theme && s.unlocked.includes(t.id))) s.theme = 'neon';
    document.body.dataset.theme = s.theme;
    audio.setMuted(!!s.muted);
    syncMuteBtn();

    $('#btn-help').addEventListener('click', e => { e.currentTarget.blur(); openHelp(); });
    $('#help-close').addEventListener('click', e => { e.currentTarget.blur(); closeHelp(); });
    ui.help.addEventListener('click', e => { if (e.target === ui.help) closeHelp(); });
    $('#btn-mute').addEventListener('click', e => { e.currentTarget.blur(); toggleMute(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ---------- E2E hooks (undocumented test API) ---------- */
  window.__RH_TEST = {
    start(id) { const i = RH.games.findIndex(g => g.id === id); launch(i >= 0 ? i : 0); },
    state() {
      return {
        game: engine.def ? engine.def.id : null,
        phase: engine.phase,
        score: engine.score,
        lives: engine.lives,
        theme: document.body.dataset.theme,
        muted: store.get().muted,
      };
    },
    /** Simulate a finished run through the real recording path (no field wiping). */
    award(id, score) {
      const nb = store.recordRun(id, score);
      checkUnlocks();
      refreshAll();
      return nb;
    },
    kill() { const d = engine.def; return d && d.testKill ? d.testKill(engine._api) : false; },
    setTheme(id) { applyTheme(id); },
    press(code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    },
    engine,
  };
})();
