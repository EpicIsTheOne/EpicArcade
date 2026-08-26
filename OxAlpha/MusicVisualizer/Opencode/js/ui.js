window.UI = (function () {
  const $ = id => document.getElementById(id);
  let engine = null, R = null, App = null;
  let els = {};
  let drawerOpen = false, helpOpen = false, scrubbing = false;
  let idleTimer = null;

  const ICON_PLAY = '<svg class="ic" viewBox="0 0 24 24"><path class="f" d="M8 5v14l12-7z"/></svg>';
  const ICON_PAUSE = '<svg class="ic" viewBox="0 0 24 24"><path class="f" d="M7 5h3.4v14H7zM13.6 5H17v14h-3.6z"/></svg>';
  const ICON_VOL = '<svg class="ic" viewBox="0 0 24 24"><path class="f" d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M15 9a4 4 0 010 6M17.5 6.8a7.2 7.2 0 010 10.4" stroke-width="1.8"/></svg>';
  const ICON_MUTE = '<svg class="ic" viewBox="0 0 24 24"><path class="f" d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M15.5 9.5l5 5m0-5l-5 5" stroke-width="1.8"/></svg>';
  const ICON_FS_ON = '<svg class="ic" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
  const ICON_FS_OFF = '<svg class="ic" viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';

  const MODE_ICONS = [
    '<svg class="ic" viewBox="0 0 24 24"><path stroke-width="2" d="M4 19v-8M8 19V6M12 19v-9M16 19V4M20 19v-7"/></svg>',
    '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
    '<svg class="ic" viewBox="0 0 24 24"><path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6"/></svg>',
    '<svg class="ic" viewBox="0 0 24 24"><circle class="f" cx="6" cy="8" r="1.7"/><circle class="f" cx="15" cy="5" r="1.2"/><circle class="f" cx="19" cy="12" r="1.9"/><circle class="f" cx="9" cy="16" r="1.4"/><circle class="f" cx="16" cy="18" r="1.6"/><circle class="f" cx="4" cy="14" r="1.1"/></svg>',
    '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4.5"/><rect x="7" y="7" width="10" height="10" rx="2.5"/><rect x="10.2" y="10.2" width="3.6" height="3.6" rx="1"/></svg>',
    '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5"/></svg>'
  ];

  function init(eng, renderer, app) {
    engine = eng; R = renderer; App = app;
    ['stage', 'ui', 'trackInfo', 'statusDot', 'trackTitle', 'trackSub', 'emptyState', 'drawer',
      'modeTiles', 'themeGrid', 'btnDrawerDemo', 'btnPlay', 'curTime', 'durTime', 'timeline',
      'tlFill', 'tlHandle', 'tlTip', 'volSlider', 'btnPrevMode', 'modeLabel', 'btnNextMode',
      'themeSwatch', 'dropOverlay', 'helpModal', 'toast', 'fileInput', 'rngIntensity', 'outIntensity',
      'rngSmoothing', 'outSmoothing', 'rngSensitivity', 'outSensitivity', 'tglGlow', 'tglTrails',
      'tglFlash', 'tglCycle', 'selCycle', 'btnHelp', 'btnSettings', 'btnFull', 'btnMute',
      'btnTheme', 'btnOpen', 'btnOpenHero', 'btnDemoHero', 'drawerClose', 'helpClose'
    ].forEach(id => els[id] = $(id));

    buildModeTiles();
    buildThemeGrid();

    els.btnFull.innerHTML = ICON_FS_ON;
    els.btnMute.innerHTML = ICON_VOL;
    setPlayIcon(false);

    bindButtons();
    bindSliders();
    bindTimeline();
    bindKeyboard();
    bindAutoHide();
    bindDragDrop();
    bindFileInput();

    setInterval(tickTime, 200);
    syncTransport();
    syncMode(R.modeIndex);
  }

  function buildModeTiles() {
    const names = R.instanceNames;
    names.forEach((name, i) => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.dataset.idx = i;
      b.innerHTML = MODE_ICONS[i] + '<span>' + name + '</span>';
      b.addEventListener('click', () => { R.setMode(i); poke(); });
      els.modeTiles.appendChild(b);
    });
  }
  function buildThemeGrid() {
    window.Themes.forEach((th, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = 'linear-gradient(135deg,' + th.colors[0] + ',' + th.colors[2] + ')';
      b.title = th.name;
      b.innerHTML = '<span>' + th.name + '</span>';
      b.addEventListener('click', () => { App.setTheme(i); poke(); });
      els.themeGrid.appendChild(b);
    });
  }

  function setPlayIcon(playing) {
    els.btnPlay.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    els.btnPlay.dataset.state = playing ? 'playing' : 'paused';
  }

  function bindButtons() {
    document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur()));
    els.btnPlay.addEventListener('click', () => engine.toggle());
    els.btnOpen.addEventListener('click', () => els.fileInput.click());
    els.btnOpenHero.addEventListener('click', () => els.fileInput.click());
    els.btnDemoHero.addEventListener('click', () => App.loadDemo());
    els.btnDrawerDemo.addEventListener('click', () => App.loadDemo());
    els.btnPrevMode.addEventListener('click', () => R.prevMode());
    els.btnNextMode.addEventListener('click', () => R.next());
    els.modeLabel.addEventListener('click', () => R.next());
    els.btnTheme.addEventListener('click', () => App.cycleTheme());
    els.btnSettings.addEventListener('click', () => toggleDrawer());
    els.drawerClose.addEventListener('click', () => toggleDrawer(false));
    els.btnHelp.addEventListener('click', () => toggleHelp(true));
    els.helpClose.addEventListener('click', () => toggleHelp(false));
    els.btnMute.addEventListener('click', () => App.toggleMute());
    els.btnFull.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      els.btnFull.innerHTML = document.fullscreenElement ? ICON_FS_OFF : ICON_FS_ON;
    });
    els.helpModal.addEventListener('click', e => { if (e.target === els.helpModal) toggleHelp(false); });
  }

  function toggleDrawer(force) {
    drawerOpen = force !== undefined ? force : !drawerOpen;
    els.drawer.classList.toggle('open', drawerOpen);
    if (drawerOpen) poke();
  }
  function toggleHelp(force) {
    helpOpen = force !== undefined ? force : !helpOpen;
    els.helpModal.classList.toggle('open', helpOpen);
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => showToast('Fullscreen was blocked by the browser', 'error'));
    } else document.exitFullscreen();
  }

  function bindSliders() {
    const bindRange = (input, out, fmt, cb) => {
      input.addEventListener('input', () => {
        out.textContent = fmt(parseFloat(input.value));
        cb(parseFloat(input.value));
        App.persistSettings();
        poke();
      });
    };
    bindRange(els.rngIntensity, els.outIntensity, v => v.toFixed(2) + '\u00d7', v => { R.settings.intensity = v; });
    bindRange(els.rngSmoothing, els.outSmoothing, v => Math.round(v * 100) + '%', v => { R.settings.smoothing = v; engine.setSmoothing(v); });
    bindRange(els.rngSensitivity, els.outSensitivity, v => v.toFixed(2) + '\u00d7', v => { R.settings.sensitivity = v; });
    els.volSlider.addEventListener('input', () => {
      App.setVolume(parseInt(els.volSlider.value) / 100);
      poke();
    });
    els.tglGlow.addEventListener('change', () => { R.settings.glow = els.tglGlow.checked; App.persistSettings(); });
    els.tglTrails.addEventListener('change', () => { R.settings.trails = els.tglTrails.checked; App.persistSettings(); });
    els.tglFlash.addEventListener('change', () => { R.settings.flashOn = els.tglFlash.checked; App.persistSettings(); });
    els.tglCycle.addEventListener('change', () => { R.settings.autoCycle = els.tglCycle.checked; App.persistSettings(); });
    els.selCycle.addEventListener('change', () => { R.settings.cycleSecs = parseInt(els.selCycle.value); App.persistSettings(); });
  }

  function applySettingsToControls(s, volume) {
    els.rngIntensity.value = s.intensity;
    els.outIntensity.textContent = s.intensity.toFixed(2) + '\u00d7';
    els.rngSmoothing.value = s.smoothing;
    els.outSmoothing.textContent = Math.round(s.smoothing * 100) + '%';
    els.rngSensitivity.value = s.sensitivity;
    els.outSensitivity.textContent = s.sensitivity.toFixed(2) + '\u00d7';
    els.tglGlow.checked = s.glow;
    els.tglTrails.checked = s.trails;
    els.tglFlash.checked = s.flashOn;
    els.tglCycle.checked = s.autoCycle;
    els.selCycle.value = String(s.cycleSecs);
    els.volSlider.value = Math.round(volume * 100);
  }

  function tlRatio(e) {
    const r = els.timeline.getBoundingClientRect();
    return U.clamp((e.clientX - r.left) / r.width, 0, 1);
  }
  function renderScrub(ratio) {
    els.tlFill.style.width = (ratio * 100).toFixed(2) + '%';
    els.tlHandle.style.left = (ratio * 100).toFixed(2) + '%';
    els.curTime.textContent = U.formatTime(ratio * (engine.duration || 0));
  }
  function bindTimeline() {
    els.timeline.addEventListener('pointerdown', e => {
      if (!engine.buffer || engine.duration <= 0) return;
      scrubbing = true;
      els.timeline.classList.add('scrubbing');
      els.timeline.setPointerCapture(e.pointerId);
      renderScrub(tlRatio(e));
    });
    els.timeline.addEventListener('pointermove', e => {
      const ratio = tlRatio(e);
      els.tlTip.style.left = (ratio * 100).toFixed(2) + '%';
      els.tlTip.textContent = U.formatTime(ratio * (engine.duration || 0));
      if (scrubbing) renderScrub(ratio);
    });
    const end = e => {
      if (!scrubbing) return;
      scrubbing = false;
      els.timeline.classList.remove('scrubbing');
      engine.seek(tlRatio(e) * engine.duration);
      tickTime();
    };
    els.timeline.addEventListener('pointerup', end);
    els.timeline.addEventListener('pointercancel', () => {
      scrubbing = false;
      els.timeline.classList.remove('scrubbing');
    });
  }

  function tickTime() {
    if (scrubbing) return;
    const p = engine.position || 0, d = engine.duration || 0;
    els.curTime.textContent = U.formatTime(p);
    els.durTime.textContent = U.formatTime(d);
    const pct = d ? (p / d * 100) : 0;
    els.tlFill.style.width = pct.toFixed(2) + '%';
    els.tlHandle.style.left = pct.toFixed(2) + '%';
  }

  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      const tag = document.activeElement && document.activeElement.tagName;
      const isControl = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON';
      switch (e.key) {
        case ' ': e.preventDefault(); engine.toggle(); break;
        case 'ArrowLeft': if (isControl && tag === 'INPUT') break; e.preventDefault(); engine.seek(engine.position - 5); break;
        case 'ArrowRight': if (isControl && tag === 'INPUT') break; e.preventDefault(); engine.seek(engine.position + 5); break;
        case 'ArrowUp': if (tag === 'INPUT') break; e.preventDefault(); nudgeVolume(0.05); break;
        case 'ArrowDown': if (tag === 'INPUT') break; e.preventDefault(); nudgeVolume(-0.05); break;
        case 'j': case 'J': engine.seek(engine.position - 10); break;
        case 'l': case 'L': engine.seek(engine.position + 10); break;
        case 'm': case 'M': App.toggleMute(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 't': case 'T': App.cycleTheme(); break;
        case 'o': case 'O': els.fileInput.click(); break;
        case 'd': case 'D': App.loadDemo(); break;
        case 's': case 'S': toggleDrawer(); break;
        case 'h': case 'H':
          document.body.classList.add('ui-hidden');
          clearTimeout(idleTimer);
          idleTimer = null;
          break;
        case '?': toggleHelp(); break;
        case 'Escape':
          if (helpOpen) toggleHelp(false);
          else if (drawerOpen) toggleDrawer(false);
          break;
        default:
          if (e.key >= '1' && e.key <= '6') {
            R.setMode(parseInt(e.key) - 1);
          }
      }
      poke();
    });
  }
  function nudgeVolume(d) {
    App.setVolume(U.clamp(engine.volume + d, 0, 1));
  }

  function canHide() {
    return engine.playing && !drawerOpen && !helpOpen && !scrubbing;
  }
  function poke() {
    document.body.classList.remove('ui-hidden');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (canHide()) document.body.classList.add('ui-hidden');
    }, 3000);
  }
  function bindAutoHide() {
    ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, poke, { passive: true }));
    poke();
  }

  function bindDragDrop() {
    let depth = 0;
    window.addEventListener('dragenter', e => { e.preventDefault(); depth++; els.dropOverlay.classList.add('show'); });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; els.dropOverlay.classList.remove('show'); } });
    window.addEventListener('drop', e => {
      e.preventDefault();
      depth = 0;
      els.dropOverlay.classList.remove('show');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) App.loadFile(f);
    });
  }
  function bindFileInput() {
    els.fileInput.addEventListener('change', () => {
      const f = els.fileInput.files && els.fileInput.files[0];
      if (f) App.loadFile(f);
      els.fileInput.value = '';
    });
  }

  function showToast(msg, type, ms) {
    const el = els.toast;
    el.textContent = msg;
    el.className = type === 'error' ? 'error show' : 'show';
    clearTimeout(el._t);
    if (ms !== 0) el._t = setTimeout(() => el.classList.remove('show'), ms || 2600);
  }

  function onTrackLoaded() {
    els.trackTitle.textContent = engine.trackName;
    const sr = engine.ctx ? engine.ctx.sampleRate / 1000 : 44.1;
    els.trackSub.textContent =
      U.formatTime(engine.duration) + ' \u2022 ' + sr.toFixed(1) + ' kHz \u2022 ' +
      (engine.buffer.numberOfChannels === 1 ? 'mono' : 'stereo') +
      (engine.isDemo ? ' \u2022 generated demo' : '');
    els.trackInfo.classList.remove('is-hidden');
    els.emptyState.classList.add('gone');
    els.btnPlay.disabled = false;
    document.title = engine.trackName + ' — SPECTRA';
    syncTransport();
  }

  function syncTransport() {
    setPlayIcon(engine.playing);
    els.statusDot.classList.toggle('on', engine.playing);
    if (engine.playing) document.title = '\u25b6 ' + engine.trackName + ' — SPECTRA';
    else if (engine.buffer) document.title = engine.trackName + ' — SPECTRA';
  }
  function syncMute(muted, vol) {
    els.btnMute.innerHTML = muted || vol === 0 ? ICON_MUTE : ICON_VOL;
    els.volSlider.value = Math.round(vol * 100);
  }
  function syncMode(idx) {
    els.modeLabel.textContent = R.instanceNames[idx];
    const tiles = els.modeTiles.children;
    for (let i = 0; i < tiles.length; i++) tiles[i].classList.toggle('active', i === idx);
  }
  function syncTheme(idx) {
    const th = window.Themes[idx];
    els.themeSwatch.style.background = 'linear-gradient(135deg,' + th.colors[0] + ',' + th.colors[2] + ')';
    const sw = els.themeGrid.children;
    for (let i = 0; i < sw.length; i++) sw[i].classList.toggle('active', i === idx);
  }
  function showLoading(msg) {
    if (msg) showToast(msg, 'info', 0);
    else els.toast.classList.remove('show');
  }

  return {
    init, applySettingsToControls, showToast, onTrackLoaded,
    syncTransport, syncMute, syncMode, syncTheme, showLoading
  };
})();
