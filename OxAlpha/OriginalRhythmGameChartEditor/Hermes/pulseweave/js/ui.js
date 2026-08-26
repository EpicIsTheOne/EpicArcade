/* ============================================================
   PULSEWEAVE · ui.js — screens, menu, modals, calibration,
   results, game session orchestration
   ============================================================ */
window.PW = window.PW || {};
PW.ui = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const GRADE_COLORS = { SSS: '#ffd75e', SS: '#ffd75e', S: '#35e6ff', A: '#b6ff3c', B: '#ffb347', C: '#ff8f6b', D: '#ff5470' };
  let selectedDiffId = null;
  let currentGame = null;
  let lastSession = null;   // {chart} for retry
  let menuRaf = null;

  // ---------------- screens ----------------
  function show(id) {
    ['bootScreen', 'menuScreen', 'gameScreen', 'resultsScreen'].forEach(s => {
      $(s).classList.toggle('hidden', s !== id);
    });
    if (id !== 'editorScreen') {
      const ed = $('editorScreen');
      if (!ed.classList.contains('hidden')) ed.classList.add('hidden');
    }
  }

  function showMenu() {
    if (currentGame) { currentGame.destroy(); currentGame = null; PW._game = null; }
    if (PW.editor) PW.editor.close();
    stopMenuAnim();
    show('menuScreen');
    buildDiffCards();
    startMenuAnim();
  }

  // ---------------- menu ----------------
  function buildDiffCards() {
    const row = $('diffRow');
    row.innerHTML = '';
    const s = PW.Store.settings();
    PW.charts.forEach(c => {
      const el = document.createElement('div');
      el.className = 'diff-card' + (c.id === selectedDiffId ? ' sel' : '');
      el.style.setProperty('--dc', c.meta.color || '#fff');
      const best = PW.Store.best(c.id);
      const edited = PW.Store.hasOverride(c.id);
      el.innerHTML = `
        <div class="diff-name"><span>${c.meta.difficulty}</span><span class="diff-lvl">LV ${c.meta.level}</span></div>
        <div class="diff-meta">${c.notes.length} notes · ${c.meta.bpm} BPM${edited ? ' · <b style="color:var(--c3)">edited</b>' : ''}</div>
        <div class="diff-note-count">${best ? `best ${String(Math.round(best.score)).padStart(6, '0')} · ${(best.acc * 100).toFixed(2)}% · ${best.grade}` : 'not played yet'}</div>`;
      el.onclick = () => {
        selectedDiffId = c.id;
        PW.Music.ensureCtx(); PW.Music.uiClick();
        row.querySelectorAll('.diff-card').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
      };
      row.appendChild(el);
    });
    $('songLen').textContent = formatLen(PW.Assets.duration);
  }
  function formatLen(sec) {
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  }

  function startMenuAnim() {
    const cv = $('menuCanvas'), g = cv.getContext('2d');
    let t0 = performance.now();
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: .5 + Math.random() * 1.8, v: .2 + Math.random() * .8 }));
    const loop = (t) => {
      if ($('#menuScreen').classList.contains('hidden')) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = innerWidth, H = innerHeight;
      const tt = (t - t0) / 1000;
      g.clearRect(0, 0, W, H);
      // glow orbs
      [['#35e6ff', .10], ['#ff4fd8', .08], ['#7a5cff', .09]].forEach(([col, a], i) => {
        const x = W * (.5 + .38 * Math.sin(tt * (.11 + i * .05) + i * 2));
        const y = H * (.4 + .3 * Math.cos(tt * (.13 + i * .04) + i));
        const rad = Math.min(W, H) * (.34 + i * .1);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, col + '22'); gr.addColorStop(1, col + '00');
        g.globalAlpha = a * 3;
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      });
      g.globalAlpha = 1;
      // drifting weave lines
      g.strokeStyle = 'rgba(90,130,255,.07)'; g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        for (let x = 0; x <= W; x += 24) {
          const y = H * .55 + Math.sin(x / 160 + tt * .7 + i * 1.3) * 46 * (i % 2 ? 1 : -1) + i * 18 - 40;
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
      // stars
      g.fillStyle = 'rgba(200,220,255,.5)';
      for (const st of stars) {
        st.y -= st.v * .0012; if (st.y < -.02) st.y = 1.02;
        g.fillRect(st.x * W, st.y * H, st.s, st.s);
      }
      menuRaf = requestAnimationFrame(loop);
    };
    menuRaf = requestAnimationFrame(loop);
  }
  function stopMenuAnim() { cancelAnimationFrame(menuRaf); }

  // ---------------- game session ----------------
  function startGame(opts) {
    // opts: {chart, startBeat?, autopilot?, returnTo?}
    stopMenuAnim();
    PW.Music.ensureCtx();
    if (currentGame) { currentGame.destroy(); currentGame = null; }
    lastSession = { chart: PW.Charts.clone(opts.chart) };
    show('gameScreen');
    $('pauseOverlay').classList.add('hidden');
    $('hudSong').textContent = `${opts.chart.meta.title} · ${opts.chart.meta.difficulty}`;
    selectedDiffId = opts.chart.id;

    currentGame = new PW.Engine.Game({
      canvas: $('gameCanvas'),
      chart: opts.chart,
      buffer: PW.Assets.buffer,
      startBeat: opts.startBeat || 0,
      returnTo: opts.returnTo || 'menu',
      autopilot: !!opts.autopilot,
      onExit: (results, why) => {
        const ret = opts.returnTo || 'menu';
        currentGame.destroy(); currentGame = null; PW._game = null;
        if (why === 'quit') {
          if (ret === 'editor') { show('editorScreen'); PW.editor.open(PW.editor.chart); }
          else showMenu();
          return;
        }
        showResults(results);
      }
    });
    currentGame.begin();
    PW._game = currentGame;
  }

  function quitToMenu() {
    if (currentGame) {
      const g = currentGame; currentGame = null; PW._game = null;
      g.destroy();
    }
    showMenu();
  }

  // ---------------- results ----------------
  function showResults(results) {
    show('resultsScreen');
    $('resSong').textContent = `${results.chart.meta.title} — ${results.chart.meta.difficulty}`;
    $('resScore').textContent = String(Math.round(results.score)).padStart(6, '0');
    $('resPerfect').textContent = results.counts.perfect;
    $('resGreat').textContent = results.counts.great;
    $('resGood').textContent = results.counts.good;
    $('resMiss').textContent = results.counts.miss;
    $('resCombo').textContent = results.maxCombo;
    $('resAcc').textContent = results.acc.toFixed(2) + '%';

    const letter = results.grade;
    const gl = $('gradeLetter');
    gl.textContent = letter;
    gl.style.fill = GRADE_COLORS[letter] || '#fff';
    const arc = $('gradeArc');
    arc.style.stroke = GRADE_COLORS[letter] || '#fff';
    arc.style.transition = 'none';
    arc.style.strokeDashoffset = 339.3;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      arc.style.transition = 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)';
      arc.style.strokeDashoffset = String(339.3 * (1 - Math.min(1, results.acc / 100)));
    }));

    const rec = PW.Store.best(results.chart.id);
    const isRecord = PW.Store.setBest(results.chart.id, {
      score: Math.round(results.score), acc: results.acc / 100, grade: letter
    });
    $('newRecord').classList.toggle('hidden', !(isRecord && rec));

    // animate score count-up
    const el = $('resScore');
    const target = Math.round(results.score); const t0 = performance.now();
    const anim = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3)))).padStart(6, '0');
      if (k < 1 && !$('resultsScreen').classList.contains('hidden')) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  // ---------------- settings + calibration ----------------
  function bindSettings() {
    const s = PW.Store.settings();
    const sp = $('setSpeed'), vo = $('setVol'), of = $('setOff');
    sp.value = s.speed; vo.value = s.volume; of.value = s.offsetMs;
    const refresh = () => {
      $('speedVal').textContent = sp.value + ' px/s';
      $('volVal').textContent = vo.value + '%';
      $('offVal').textContent = (of.value > 0 ? '+' : '') + of.value + ' ms';
    };
    refresh();
    sp.oninput = () => { PW.Store.saveSettings({ speed: +sp.value }); refresh(); };
    vo.oninput = () => { PW.Store.saveSettings({ volume: +vo.value }); PW.Music.ensureCtx(); PW.Music.setVolume(vo.value / 100); refresh(); };
    of.oninput = () => { PW.Store.saveSettings({ offsetMs: +of.value }); refresh(); };

    $('btnSettings').onclick = () => showModal('settingsModal');
    $('btnCloseSettings').onclick = () => hideModal('settingsModal');
    $('btnHelp').onclick = () => showModal('helpModal');
    $('btnCloseHelp').onclick = () => hideModal('helpModal');

    // calibration
    let calib = null;
    $('btnCalibrate').onclick = () => {
      hideModal('settingsModal');
      showModal('calibModal');
      $('calibResult').textContent = '';
      $('calibHint').textContent = 'click to begin';
      $('btnApplyCalib').disabled = true;
      calib = { running: false, deltas: [], tickIdx: 0 };
    };
    $('btnCloseCalib').onclick = () => { stopCalib(); hideModal('calibModal'); };
    $('btnApplyCalib').onclick = () => {
      if (calib && calib.deltas.length >= 6) {
        const avg = calib.deltas.reduce((a, b) => a + b, 0) / calib.deltas.length;
        const ms = Math.max(-150, Math.min(150, Math.round(avg * 1000)));
        PW.Store.saveSettings({ offsetMs: ms });
        of.value = ms; refresh();
        toast(`Offset applied: ${ms > 0 ? '+' : ''}${ms} ms`);
      }
      stopCalib(); hideModal('calibModal');
    };
    $('calibStage').onclick = () => { if (calib && !calib.running) runCalib(); };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyK' && calib && calib.running) recordCalibTap();
    });

    const TICKS = 16, GAP = .5;
    let timers = [];
    function runCalib() {
      stopCalib();
      calib.running = true; calib.tickIdx = 0; calib.deltas = [];
      calib.t0 = PW.Music.ensureCtx().currentTime + .8;
      $('calibHint').textContent = 'tap K on each flash!';
      for (let i = 0; i < TICKS; i++) {
        const at = calib.t0 + i * GAP;
        timers.push(setTimeout(() => {
          PW.Music.tick(i % 4 === 0);
          const ring = $('calibRing');
          ring.classList.add('on');
          setTimeout(() => ring.classList.remove('on'), 110);
          if (++calib.tickIdx === TICKS) {
            calib.running = false;
            finishCalibMsg();
          }
        }, (at - PW.Music.ensureCtx().currentTime) * 1000));
      }
    }
    function recordCalibTap() {
      const t = PW.Music.ensureCtx().currentTime;
      if (t < calib.t0) return;
      const k = Math.round((t - calib.t0) / GAP);
      const tickT = calib.t0 + k * GAP;
      const d = t - tickT;
      if (Math.abs(d) < .25) {
        calib.deltas.push(d);
        $('calibResult').textContent = `taps ${calib.deltas.length} · avg ${(calib.deltas.reduce((a, b) => a + b, 0) / calib.deltas.length * 1000).toFixed(0)} ms`;
      }
    }
    function finishCalibMsg() {
      if (calib.deltas.length >= 6) {
        $('btnApplyCalib').disabled = false;
        $('calibResult').textContent += ' — ready to apply';
      } else {
        $('calibResult').textContent = 'not enough taps captured — try again';
      }
    }
    function stopCalib() { timers.forEach(clearTimeout); timers = []; if (calib) calib.running = false; }
  }

  // ---------------- modals/toasts ----------------
  function showModal(id) { $(id).classList.remove('hidden'); }
  function hideModal(id) { $(id).classList.add('hidden'); }
  function toast(msg, warn) {
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2400);
    setTimeout(() => el.remove(), 2800);
  }

  // ---------------- editor bridge ----------------
  function openEditor(chartId) {
    stopMenuAnim();
    const chart = PW.charts.find(c => c.id === chartId) || PW.charts.find(c => c.id === selectedDiffId) || PW.charts[1];
    show('editorScreen');
    PW.editor.open(chart);
  }
  function playtestFromEditor() {
    const ed = PW.editor;
    ed.stopPreview();
    startGame({
      chart: PW.Charts.clone(ed.chart),
      startBeat: Math.max(0, ed.beat()),
      returnTo: 'editor'
    });
  }

  // ---------------- global wiring ----------------
  function init() {
    $('btnPlay').onclick = () => {
      const c = PW.charts.find(x => x.id === selectedDiffId) || PW.charts[1];
      startGame({ chart: PW.Charts.clone(c) });
    };
    $('btnEditor').onclick = () => openEditor(selectedDiffId);
    $('btnResume').onclick = () => currentGame && currentGame.togglePause();
    $('btnRestart').onclick = () => { if (lastSession) startGame({ ...lastSession, returnTo: currentGame?.returnTo }); };
    $('btnQuit').onclick = () => { if (currentGame) { const g = currentGame; g.destroy(); currentGame = null; if (g.returnTo === 'editor') { show('editorScreen'); PW.editor.open(PW.editor.chart); } else showMenu(); } };
    $('btnPauseGame').onclick = () => currentGame && currentGame.togglePause();

    $('btnRetry').onclick = () => { if (lastSession) startGame({ ...lastSession }); };
    $('btnResMenu').onclick = () => showMenu();
    $('btnResEditor').onclick = () => openEditor(lastSession?.chart?.id);

    bindSettings();
  }

  return { init, show, showMenu, startGame, showResults, openEditor, playtestFromEditor, showModal, hideModal, toast };
})();
