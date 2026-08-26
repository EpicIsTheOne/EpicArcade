// PRISM PULSE — app shell: menu, settings/calibration, game/editor wiring, results.
import { DEFAULT_CHART } from './default-chart.js';
import { validateChart, normalizeChart, beatsToSec, LANE_KEYS, LANE_COLORS } from './chart.js';
import { renderSong, computePeaks } from './composer.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import { Editor } from './editor.js';

const $ = (s, el = document) => el.querySelector(s);

const els = {
  screens: {
    menu: $('#screen-menu'), loading: $('#screen-loading'),
    game: $('#screen-game'), editor: $('#screen-editor'),
  },
  loadBar: '#load-bar-fill',
  btnPlay: $('#btn-play'), btnCustom: $('#btn-custom'),
  gameCanvas: $('#game-canvas'), hud: $('#hud'),
  pauseOverlay: $('#pause-overlay'),
  btnResume: $('#btn-resume'), btnRestart: $('#btn-restart'),
  btnPauseMenu: $('#btn-tomenu'), btnPauseEditor: $('#btn-toeditor'),
  results: $('#results'),
  resGrade: '#res-grade', resScore: '#res-score', resAcc: '#res-acc',
  resCombo: '#res-combo', resCounts: '#res-counts', resTitle: '#res-title',
  resFc: '#res-fc', resAuto: '#res-auto',
  btnRetry: $('#btn-retry'), btnResEditor: $('#btn-res-editor'), btnResMenu: $('#btn-res-menu'),
  edCanvas: $('#editor-canvas'), waveCanvas: $('#wave-canvas'),
  edPlay: $('#ed-play'), edStop: $('#ed-stop'), edSnap: $('#ed-snap'), edZoom: $('#ed-zoom'),
  edBpm: $('#ed-bpm'), edOffset: $('#ed-offset'), edTitle: $('#ed-title'),
  edTest: $('#ed-test'), edSave: $('#ed-save'), edExport: $('#ed-export'),
  edImportInput: $('#ed-import-input'),
  edRevert: $('#ed-revert'), edBack: $('#ed-back'),
  edStatTotal: $('#ed-stat-total'), edStatHolds: $('#ed-stat-holds'), edDirtyDot: $('#ed-dirty-dot'),
  edStatus: '#ed-status', edTime: '#ed-time',
  settingsModal: '#settings', howModal: '#how',
  speedRange: '#set-speed', speedVal: '#set-speed-val',
  offsetRange: '#set-offset', offsetVal: '#set-offset-val',
  btnCalibrate: '#btn-calibrate', btnCloseSettings: '#btn-close-settings',
  calBox: '#cal-box', calHint: '#cal-hint',
};

const state = {
  buffer: null,
  peaks: null,
  markersSec: null,
  includedChart: DEFAULT_CHART,
  game: null,
  editor: null,
  returnTo: null,
  playtestStart: 0,
  lastEditorChart: null,
};

const audio = new AudioEngine();
const settings = loadSettings();
const qs = new URLSearchParams(location.search);

function loadSettings() {
  let s = { speed: 1, offsetMs: 0 };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('prism.settings') || '{}') }; } catch (_) {}
  return s;
}
function saveSettings() { try { localStorage.setItem('prism.settings', JSON.stringify(settings)); } catch (_) {} }

const $id = (id) => document.getElementById(id);
function showScreen(name) {
  for (const [k, el] of Object.entries(els.screens)) el.classList.toggle('active', k === name);
}

function currentChart() {
  try {
    if (localStorage.getItem('prism.chart.custom.on') === '1') {
      const c = JSON.parse(localStorage.getItem('prism.chart.custom'));
      const err = c ? validateChart(c) : 'empty';
      if (!err) { normalizeChart(c); return c; }
    }
  } catch (_) {}
  return state.includedChart;
}
const isCustom = () => localStorage.getItem('prism.chart.custom.on') === '1';

// ---------------- boot ----------------
function refreshCustomBtn() {
  els.btnCustom.style.display = isCustom() ? '' : 'none';
}
refreshCustomBtn();
bindStaticUi();

async function ensureAudioRendered() {
  if (state.buffer) return;
  const bar = $id('load-bar-fill');
  showScreen('loading');
  const { buffer, markersSec } = await renderSong((f) => { bar.style.width = Math.round(f * 100) + '%'; });
  state.buffer = buffer;
  state.markersSec = markersSec;
  state.peaks = computePeaks(buffer);
  audio.setBuffer(buffer);
}

// ---------------- game flow ----------------
async function launchGame({ chart, startPosSec = 0, from }) {
  await ensureAudioRendered();
  if (state.game) { state.game.destroy(); state.game = null; }
  if (state.editor) { state.lastEditorChart = state.editor.chart; }
  state.returnTo = from;
  state.playtestStart = startPosSec;
  showScreen('game');
  $id('results').classList.remove('show');
  els.pauseOverlay.classList.remove('show');

  const gameOpts = {
    auto: qs.get('auto') === '1' || undefined,
    startPosSec: qs.get('t') ? Math.max(0, parseFloat(qs.get('t')) || 0) : startPosSec,
    offsetMs: settings.offsetMs,
    scrollSpeed: settings.speed,
    onExit: onGameExit,
  };
  state.game = new Game(els.gameCanvas, els.hud, chart, audio, gameOpts);
  window.__game = state.game;
  setupHudMeta(chart, gameOpts.auto);
  state.game.start();
}

function setupHudMeta(chart, auto) {
  $id('hud-title').textContent = `${chart.meta.title} — ${chart.meta.artist}`;
  $id('hud-diff').textContent = `${chart.meta.difficulty || ''} · ${chart.meta.bpm} BPM`;
  $id('hud-keys').innerHTML =
    LANE_KEYS.map((k, i) => `<span style="color:${LANE_COLORS[i]}">${k.label}</span>`).join(' · ') +
    '<span class="dim"> · Esc pause</span>';
  $id('hud-auto').style.display = auto ? '' : 'none';
}

function onGameExit(result) {
  els.pauseOverlay.classList.remove('show');
  if (result.quit) {
    state.game.destroy(); state.game = null;
    if (state.returnTo === 'editor') reopenEditor({ startSec: state.playtestStart, keepEdits: true });
    else showMenu();
    return;
  }
  showResults(result);
}

function showResults(r) {
  $id('res-title').textContent = $id('hud-title').textContent;
  const gradeEl = $id('res-grade');
  gradeEl.textContent = r.auto ? 'AUTO' : r.grade;
  gradeEl.style.color = r.fullCombo && !r.auto ? '#ffd166' : '#e9d5ff';
  $id('res-score').textContent = String(r.score).padStart(7, '0');
  $id('res-acc').textContent = (r.accuracy * 100).toFixed(2) + '%';
  $id('res-combo').textContent = r.maxCombo;
  $id('res-counts').innerHTML =
    `<span class="mv">Marvelous ${r.counts.Marvelous}</span><span class="pf">Perfect ${r.counts.Perfect}</span>` +
    `<span class="gr">Great ${r.counts.Great}</span><span class="gd">Good ${r.counts.Good}</span>` +
    `<span class="ms">Miss ${r.counts.Miss}</span>`;
  $id('res-fc').textContent = r.fullCombo && !r.auto ? '★ FULL COMBO ★' : '';
  $id('res-auto').textContent = r.auto ? 'autoplay verification run — not scored' : '';
  $id('btn-res-editor').style.display = state.returnTo === 'editor' ? '' : 'none';
  $id('results').classList.add('show');
}

function showMenu() {
  if (state.game) { state.game.destroy(); state.game = null; }
  if (state.editor) { state.editor.destroy(); state.editor = null; window.__editor = null; }
  refreshCustomBtn();
  showScreen('menu');
}

// ---------------- static UI wiring ----------------
function bindStaticUi() {
  els.btnPlay.onclick = () => launchGame({ chart: currentChart(), from: 'menu' });
  els.btnCustom.onclick = () => launchGame({ chart: currentChart(), from: 'menu' });
  $id('btn-how').onclick = () => $id('how').classList.add('show');
  $id('btn-how-close').onclick = () => $id('how').classList.remove('show');
  $id('btn-settings').onclick = () => { syncSettingsUi(); $id('settings').classList.add('show'); };

  els.btnResume.onclick = () => state.game && state.game.setPaused(false);
  els.btnRestart.onclick = () => { els.pauseOverlay.classList.remove('show'); state.game && state.game.restart(); };
  els.btnPauseMenu.onclick = () => state.game && state.game.quit();
  els.btnPauseEditor.onclick = () => state.game && state.game.quit();

  els.btnRetry.onclick = () => {
    const prev = state.game;
    if (!prev) return;
    launchGame({ chart: prev.chart, startPosSec: state.playtestStart, from: state.returnTo });
  };
  els.btnResMenu.onclick = () => showMenu();
  els.btnResEditor.onclick = () => {
    $id('results').classList.remove('show');
    if (state.game) { state.game.destroy(); state.game = null; }
    reopenEditor({ startSec: state.playtestStart, keepEdits: true });
  };

  // settings
  const speedRange = $id('set-speed'), speedVal = $id('set-speed-val');
  const offRange = $id('set-offset'), offVal = $id('set-offset-val');
  function syncSettingsUi() {
    speedRange.value = settings.speed;
    speedVal.textContent = settings.speed.toFixed(2) + '×';
    offRange.value = settings.offsetMs;
    offVal.textContent = settings.offsetMs + ' ms';
  }
  speedRange.oninput = () => {
    settings.speed = parseFloat(speedRange.value);
    speedVal.textContent = settings.speed.toFixed(2) + '×';
    saveSettings();
  };
  offRange.oninput = () => {
    settings.offsetMs = parseInt(offRange.value, 10);
    offVal.textContent = settings.offsetMs + ' ms';
    saveSettings();
  };
  $id('btn-close-settings').onclick = () => { stopCalibration(); $id('settings').classList.remove('show'); };
  $id('btn-calibrate').onclick = async () => {
    await ensureAudioRendered();
    await audio.ensureCtx();
    startCalibration();
  };

  // editor buttons
  $id('btn-editor').onclick = async () => {
    await ensureAudioRendered();
    reopenEditor({});
  };

  // pause overlay follows game pause state (Esc, blur)
  els.hud.addEventListener('pausechange', (e) => {
    $id('pause-overlay').classList.toggle('show', !!(e.detail && state.game && !state.game.finished));
  });
}
let syncSettingsUiRef = () => {};
{ // expose for calibration completion
  syncSettingsUiRef = () => {
    $id('set-speed-val').textContent = settings.speed.toFixed(2) + '×';
    $id('set-offset-val').textContent = settings.offsetMs + ' ms';
  };
}

// ---------------- calibration ----------------
let cal = null;
function startCalibration() {
  stopCalibration();
  $id('cal-box').classList.add('show');
  $id('cal-hint').textContent = 'Tap any lane key (D F J K or Space) exactly on each click…';
  cal = { taps: [], tickTimes: [], n: 24, spb: 60 / 128 };
  const t0 = audio.ctx.currentTime + 0.6;
  for (let i = 0; i < cal.n; i++) {
    const tt = t0 + i * cal.spb;
    cal.tickTimes.push(tt);
    scheduleClick(tt);
  }
  cal._kd = (e) => {
    if (!['KeyD', 'KeyF', 'KeyJ', 'KeyK', 'Space'].includes(e.code) || e.repeat) return;
    e.preventDefault();
    const nowT = audio.ctx.currentTime;
    let best = null, bd = 1e9;
    for (const tt of cal.tickTimes) {
      const d = Math.abs(nowT - tt);
      if (d < bd) { bd = d; best = tt; }
    }
    if (bd < 0.25) cal.taps.push(nowT - best);
    $id('cal-hint').textContent = `Keep tapping on the clicks… ${cal.taps.length} samples`;
  };
  window.addEventListener('keydown', cal._kd);
  cal._doneTimer = setTimeout(finishCalibration, (cal.n * cal.spb + 1.2) * 1000);
}
function scheduleClick(tt) {
  const ctx = audio.ctx;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = 1200; o.type = 'square';
  g.gain.setValueAtTime(0.25, tt);
  g.gain.exponentialRampToValueAtTime(1e-4, tt + 0.06);
  o.connect(g); g.connect(ctx.destination);
  o.start(tt); o.stop(tt + 0.08);
}
function stopCalibration() {
  if (cal) {
    clearTimeout(cal._doneTimer);
    window.removeEventListener('keydown', cal._kd);
    cal = null;
  }
  $id('cal-box').classList.remove('show');
}
function finishCalibration() {
  if (!cal) return;
  const taps = [...cal.taps].sort((a, b) => a - b);
  const med = taps.length ? taps[Math.floor(taps.length / 2)] * 1000 : 0;
  stopCalibration();
  settings.offsetMs = Math.max(-150, Math.min(150, Math.round(med)));
  saveSettings();
  syncSettingsUiRef();
  $id('cal-hint').textContent = `Calibration complete: offset ${settings.offsetMs} ms (${taps.length} samples).`;
}

// ---------------- editor ----------------
function reopenEditor({ startSec = 0, keepEdits = false } = {}) {
  showScreen('editor');
  if (state.editor) { state.editor.destroy(); state.editor = null; }
  const base = (keepEdits && state.lastEditorChart) ? state.lastEditorChart : currentChart();
  const rootEl = $id('screen-editor');
  state.editor = new Editor(els.edCanvas, els.waveCanvas, {
    root: rootEl,
    status: $id('ed-status'),
    bpmInput: els.edBpm, offsetInput: els.edOffset, titleInput: els.edTitle,
    playBtn: els.edPlay, stopBtn: els.edStop, snapBtn: els.edSnap, zoomBtn: els.edZoom,
    testBtn: els.edTest, saveBtn: els.edSave, exportBtn: els.edExport,
    importInput: els.edImportInput, revertBtn: els.edRevert, backBtn: els.edBack,
    statTotal: els.edStatTotal, statHolds: els.edStatHolds, dirtyDot: els.edDirtyDot,
    timeLabel: els.edTime,
  }, base, audio, {
    peaks: state.peaks,
    markers: state.markersSec,
    startSec,
    getIncludedChart: () => state.includedChart,
    onExit: () => showMenu(),
    onPlaytest: () => {
      const ed = state.editor;
      state.lastEditorChart = ed.chart;
      launchGame({
        chart: ed.chart,
        startPosSec: beatsToSec(ed.curBeat, ed.chart.meta.bpm, ed.chart.meta.offset || 0),
        from: 'editor',
      });
    },
  });
  window.__editor = state.editor;
}

// ---------------- debug hooks for automated testing ----------------
window.__pp = {
  ready: () => !!state.buffer,
  screen: () => Object.entries(els.screens).filter(([, e]) => e.classList.contains('active')).map(([k]) => k)[0],
  launchGame,
  openEditor: reopenEditor,
  state, audio, settings,
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && els.screens.menu.classList.contains('active')) els.btnPlay.click();
});
