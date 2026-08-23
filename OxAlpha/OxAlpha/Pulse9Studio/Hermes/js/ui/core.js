/* ============================================================
   Nyx DAW — UI core: state, transport, keyboard, autosave, files
   Requires: project.js (NyxProject), engine.js (NyxEngine), wav.js (WavEncoder)
   ============================================================ */
(function () {
  'use strict';
  const NP = window.NyxProject, NE = window.NyxEngine;

  const NyxUI = window.NyxUI = {
    project: null,
    engine: null,
    history: null,
    sel: {
      channelId: null,      // channel being edited / whose PR shows
      patternId: null,      // pattern shown in piano roll
      notes: new Set(),     // note indices "keyIdx:i" within pattern
      clips: new Set(),     // clip ids
      tool: 'paint'
    },
    clipboardNotes: null,
    clipboardClips: null,
    pr: { scrollX: 0, scrollY: 0, zoomX: 1, zoomY: 1, lastLen: 2 },
    pl: { scrollX: 0, scrollY: 0, zoomX: 1 },
    dirty: {},
    playing: false,
    cpu: 0
  };

  /* ---------------- utilities ---------------- */

  const $ = function (sel) { return document.querySelector(sel); };
  NyxUI.$ = $;
  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  NyxUI.el = el;
  NyxUI.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  NyxUI.mark = function (area) { NyxUI.dirty[area] = true; };
  NyxUI.markAll = function () { ['rack', 'piano', 'playlist', 'mixer'].forEach(function (k) { NyxUI.dirty[k] = true; }); };

  NyxUI.toast = function (msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' err' : '');
    clearTimeout(NyxUI._toastT);
    NyxUI._toastT = setTimeout(function () { t.className = ''; }, 2600);
  };

  /* ---------------- project lifecycle ---------------- */

  NyxUI.serialize = function () { return JSON.parse(JSON.stringify(NyxUI.project)); };

  NyxUI.setProject = function (proj, label) {
    NyxUI.project = proj;
    if (!NyxUI.engine) {
      NyxUI.engine = new NE.Engine(proj);
      NyxUI.engine._onState = function (s) {
        NyxUI.playing = s.playing;
        $('#btnPlay').classList.toggle('active', s.playing);
        document.body.classList.toggle('playing', s.playing);
      };
    } else {
      NyxUI.engine.project = proj;
    }
    NyxUI.engine.bpm = proj.bpm; NyxUI.engine.swing = proj.swing || 0;
    // selections
    NyxUI.sel.notes.clear(); NyxUI.sel.clips.clear();
    NyxUI.sel.channelId = proj.channels[0] ? proj.channels[0].id : null;
    NyxUI.sel.patternId = proj.patterns[0] ? proj.patterns[0].id : null;
    NyxUI.history = new NP.History(NyxUI.serialize, function (snap) { restore(snap); }, 100);
    NyxUI.syncTransport();
    NyxUI.buildRack(); NyxUI.buildBrowser(); NyxUI.buildMixer(); NyxUI.markAll();
    const sbp = document.getElementById('sbProject');
    if (sbp) sbp.textContent = '♪ ' + proj.name + ' — ' + proj.bpm + ' BPM';
    autosave();
    if (label) NyxUI.toast(label);
  };

  function restore(snap) {
    try {
      const p = NP.coerceProject(snap);
      const wasPlaying = NyxUI.playing;
      if (wasPlaying) NyxUI.engine.stop();
      NyxUI.project = p;
      NyxUI.engine.project = p;
      NyxUI.sel.notes.clear(); NyxUI.sel.clips.clear();
      if (!p.channels.find(c => c.id === NyxUI.sel.channelId)) NyxUI.sel.channelId = p.channels[0] ? p.channels[0].id : null;
      if (!p.patterns.find(x => x.id === NyxUI.sel.patternId)) NyxUI.sel.patternId = p.patterns[0] ? p.patterns[0].id : null;
      if (NyxUI.engine.ctx) NyxUI.engine.rebuildGraph();
      NyxUI.engine.bpm = p.bpm; NyxUI.engine.swing = p.swing || 0;
      NyxUI.syncTransport();
      NyxUI.buildRack(); NyxUI.buildBrowser(); NyxUI.buildMixer(); NyxUI.markAll();
      autosave();
    } catch (e) { NyxUI.toast('Restore failed: ' + e.message, true); }
  }

  NyxUI.commit = function (label) {
    if (NyxUI.history && NyxUI.history.commit(label)) autosaveDebounced();
    NyxUI.markAll();
  };

  NyxUI.newProject = function () {
    NyxUI.setProject(NP.defaultProject(), 'New project');
    NyxUI.commit('new');
  };
  NyxUI.loadDemo = function () {
    NyxUI.setProject(NP.createDemoProject(), 'Demo "Midnight Circuit" loaded');
    NyxUI.commit('demo');
  };

  /* ---------------- autosave ---------------- */

  const LS_KEY = 'nyx.autosave.v1';
  function autosave() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(NyxUI.project)); }
    catch (e) { /* storage full/unavailable — non-fatal */ }
  }
  let _asT = null;
  function autosaveDebounced() { clearTimeout(_asT); _asT = setTimeout(autosave, 400); }

  NyxUI.boot = function () {
    let saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
    if (saved) {
      try {
        NyxUI.setProject(NP.coerceProject(JSON.parse(saved)), 'Restored autosaved project');
        return;
      } catch (e) { console.warn('autosave corrupt:', e.message); }
    }
    NyxUI.setProject(NP.createDemoProject());
    // don't commit demo boot as first history entry beyond initial
  };

  /* ---------------- file IO ---------------- */

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  NyxUI.saveProjectFile = function () {
    const data = JSON.stringify(NyxUI.project, null, 1);
    download((NyxUI.project.name || 'project').replace(/[^\w\- ]+/g, '') + '.nyx.json', new Blob([data], { type: 'application/json' }));
    NyxUI.toast('Project saved to disk');
  };
  NyxUI.openProjectFile = function (file) {
    const rd = new FileReader();
    rd.onload = function () {
      try {
        const p = NP.coerceProject(JSON.parse(rd.result));
        NyxUI.setProject(p, 'Loaded "' + p.name + '"');
        NyxUI.commit('open');
      } catch (e) { NyxUI.toast('Import failed: ' + e.message, true); }
    };
    rd.onerror = function () { NyxUI.toast('Could not read file', true); };
    rd.readAsText(file);
  };

  NyxUI.exportWav = async function () {
    if (!window.OfflineAudioContext) { NyxUI.toast('OfflineAudioContext unavailable', true); return; }
    NyxUI.toast('Rendering WAV…');
    try {
      const eng = NyxUI.engine;
      let buf;
      if (eng.mode === 'song') {
        buf = await eng.renderOfflineChunked({ mode: 'song', tailSeconds: 2 });
      } else {
        buf = await eng.renderOffline({ mode: 'pattern', tailSeconds: 2 });
      }
      const wav = WavEncoder.encode(buf);
      download((NyxUI.project.name || 'export') + '.wav', new Blob([wav], { type: 'audio/wav' }));
      NyxUI.toast('Exported ' + (buf.duration.toFixed(1)) + 's WAV');
    } catch (e) {
      console.error(e);
      NyxUI.toast('Render failed: ' + e.message, true);
    }
  };

  /* ---------------- transport ---------------- */

  NyxUI.syncTransport = function () {
    const p = NyxUI.project, e = NyxUI.engine;
    $('#bpmInput').value = p.bpm;
    $('#swingInput').value = Math.round((p.swing || 0) * 100);
    const modeBtnP = $('#btnModePattern'), modeBtnS = $('#btnModeSong');
    modeBtnP.classList.toggle('active', e.mode === 'pattern');
    modeBtnS.classList.toggle('active', e.mode === 'song');
    $('#btnLoop').classList.toggle('active', e.loop);
    updatePositionDisplay();
  };

  function updatePositionDisplay() {
    const e = NyxUI.engine;
    const pos = Math.max(0, e.playing ? e.currentPosition() : e.position);
    const bar = Math.floor(pos / 16) + 1, beat = Math.floor((pos % 16) / 4) + 1, tick = Math.floor(pos % 4) + 1;
    $('#posDisplay').textContent = String(bar).padStart(3, '0') + ':' + beat + ':' + tick;
  }
  NyxUI.updatePositionDisplay = updatePositionDisplay;

  NyxUI.togglePlay = function () {
    const e = NyxUI.engine;
    if (!NyxUI.playing) {
      e.ensureContext().then ? e.ensureContext() : null;
      const p = e.play();
      if (p && p.then) p.then(function () { e.play(); });
    } else e.pause();
  };

  function setBpm(v) {
    v = NyxUI.clamp(Math.round(v), 30, 300);
    NyxUI.project.bpm = v; NyxUI.engine.bpm = v;
    $('#bpmInput').value = v;
    autosaveDebounced();
  }
  NyxUI.setBpm = setBpm;

  /* ---------------- floating windows ---------------- */

  let winZ = 100;
  NyxUI.openWindow = function (id, title, buildFn, x, y) {
    let w = document.getElementById(id);
    if (w) { w.style.display = 'block'; w.style.zIndex = ++winZ; return w; }
    const layer = document.getElementById('winLayer');
    if (!layer) throw new Error('window layer missing');
    w = el('div', 'nwindow', layer);
    w.id = id;
    w.innerHTML = '<div class="nw-head"><span class="nw-title"></span><button class="nw-close">✕</button></div><div class="nw-body"></div>';
    w.querySelector('.nw-title').textContent = title;
    w.style.left = (x || 220) + 'px'; w.style.top = (y || 90) + 'px';
    w.style.zIndex = ++winZ;
    w.querySelector('.nw-close').addEventListener('click', function () { w.style.display = 'none'; });
    w.style.display = 'block';   // fresh windows must actually be visible
    // drag by head
    const head = w.querySelector('.nw-head');
    head.addEventListener('pointerdown', function (ev) {
      if (ev.target.classList.contains('nw-close')) return;
      const sx = ev.clientX - w.offsetLeft, sy = ev.clientY - w.offsetTop;
      w.style.zIndex = ++winZ;
      function mv(e2) { w.style.left = (e2.clientX - sx) + 'px'; w.style.top = (e2.clientY - sy) + 'px'; }
      function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      ev.preventDefault();
    });
    buildFn(w.querySelector('.nw-body'), w);
    return w;
  };

  /* ---------------- knob control (drag UP = increase) ---------------- */
  // opts: {min,max,value,default,label,fmt,onInput(onChange),size,log}
  NyxUI.knob = function (opts) {
    const size = opts.size || 26;
    const k = el('div', 'knob');
    k.title = opts.label || '';
    k.tabIndex = 0;
    const ind = el('div', 'knob-ind', k);
    let val = opts.value;
    const min = opts.min, max = opts.max;
    function norm(v) {
      if (opts.log && min > 0) return Math.log(v / min) / Math.log(max / min);
      return (v - min) / (max - min);
    }
    function denorm(n) {
      if (opts.log && min > 0) return min * Math.pow(max / min, n);
      return min + n * (max - min);
    }
    function drawKnob() {
      const ang = -135 + 270 * NyxUI.clamp(norm(val), 0, 1);
      ind.style.transform = 'translateX(-50%) rotate(' + ang + 'deg)';
      k.setAttribute('data-val', opts.fmt ? opts.fmt(val) : val.toFixed(2));
    }
    drawKnob();
    k.addEventListener('pointerdown', function (ev) {
      const startY = ev.clientY, startX = ev.clientX, startVal = val;
      k.setPointerCapture(ev.pointerId);
      function mv(e2) {
        const dy = startY - e2.clientY;              // drag UP => positive => increase
        const dx = e2.clientX - startX;              // drag RIGHT also increases (pan-friendly)
        const speed = e2.shiftKey ? 800 : 160;       // fine mode
        let nv = denorm(NyxUI.clamp(norm(startVal) + (dy + dx) / speed, 0, 1));
        if (opts.step) nv = Math.round(nv / opts.step) * opts.step;
        val = NyxUI.clamp(nv, min, max);
        drawKnob();
        if (opts.onInput) opts.onInput(val);
        e2.preventDefault();
      }
      function up() {
        k.removeEventListener('pointermove', mv); k.removeEventListener('pointerup', up);
        if (opts.onChange) opts.onChange(val);
      }
      k.addEventListener('pointermove', mv); k.addEventListener('pointerup', up);
      ev.preventDefault();
    });
    k.addEventListener('dblclick', function () { val = opts.default != null ? opts.default : val; drawKnob(); if (opts.onInput) opts.onInput(val); if (opts.onChange) opts.onChange(val); });
    k.refresh = function (v) { val = v; drawKnob(); };
    k.getValue = function () { return val; };
    return k;
  };

  /* ---------------- keyboard ---------------- */

  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT');
  }

  window.addEventListener('keydown', function (ev) {
    if (isTypingTarget(ev.target)) return;
    const k = ev.key.toLowerCase();
    if (ev.code === 'Space') { ev.preventDefault(); NyxUI.togglePlay(); return; }
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && k === 'z') { ev.preventDefault(); doUndo(); return; }
    if (((ev.ctrlKey || ev.metaKey) && ev.shiftKey && k === 'z') || ((ev.ctrlKey || ev.metaKey) && k === 'y')) { ev.preventDefault(); doRedo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 's') { ev.preventDefault(); NyxUI.saveProjectFile(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'c') { NyxUI.copySelection(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'v') { NyxUI.pasteClipboard(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'a') { ev.preventDefault(); NyxUI.selectAllNotes(); return; }
    if (k === 'delete' || k === 'backspace') { ev.preventDefault(); NyxUI.deleteSelection(); return; }
    if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
      if (NyxUI.nudgeSelection) { ev.preventDefault(); NyxUI.nudgeSelection(k.replace('arrow', '')); }
      return;
    }
  });

  function doUndo() {
    if (NyxUI.history && NyxUI.history.canUndo()) { NyxUI.history.undo(); NyxUI.toast('Undo'); }
    else NyxUI.toast('Nothing to undo');
  }
  function doRedo() {
    if (NyxUI.history && NyxUI.history.canRedo()) { NyxUI.history.redo(); NyxUI.toast('Redo'); }
    else NyxUI.toast('Nothing to redo');
  }
  NyxUI.doUndo = doUndo; NyxUI.doRedo = doRedo;

  /* ---------------- main loop ---------------- */

  let _lastFrame = performance.now();
  function frame(now) {
    const dt = now - _lastFrame; _lastFrame = now;
    // CPU estimate: scheduler interval jitter proxy (rough, honest label)
    NyxUI.cpu = NyxUI.cpu * 0.95 + Math.min(50, dt / 16.7 * 6) * 0.05;
    const e = NyxUI.engine;
    const active = NyxUI.playing;
    if (NyxUI.dirty.piano && NyxUI.drawPiano) { NyxUI.drawPiano(); NyxUI.dirty.piano = false; }
    else if (active && NyxUI.drawPianoPlayheadOnly && NyxUI.view === 'piano') NyxUI.drawPianoPlayheadOnly();
    if (NyxUI.dirty.playlist && NyxUI.drawPlaylist) { NyxUI.drawPlaylist(); NyxUI.dirty.playlist = false; }
    else if (active && NyxUI.drawPlaylistPlayheadOnly && NyxUI.view !== 'piano') NyxUI.drawPlaylistPlayheadOnly();
    if ((NyxUI.dirty.rack) && NyxUI.drawRackGrid) { NyxUI.drawRackGrid(); NyxUI.dirty.rack = false; }
    if (NyxUI.drawMeters) NyxUI.drawMeters(active);
    updatePositionDisplay();
    $('#cpuDisplay').textContent = 'CPU ' + Math.min(99, Math.round(NyxUI.cpu)) + '%';
    requestAnimationFrame(frame);
  }

  /* ---------------- menus & buttons wiring ---------------- */

  function wireChrome() {
    // File menu
    const fileMenu = $('#fileMenu');
    $('#btnFile').addEventListener('click', function (ev) {
      ev.stopPropagation();
      fileMenu.classList.toggle('open');
    });
    document.addEventListener('click', function () { fileMenu.classList.remove('open'); });
    fileMenu.addEventListener('click', function (ev) { ev.stopPropagation(); });
    $('#miNew').addEventListener('click', function () { fileMenu.classList.remove('open'); NyxUI.newProject(); });
    $('#miDemo').addEventListener('click', function () { fileMenu.classList.remove('open'); NyxUI.loadDemo(); });
    $('#miSave').addEventListener('click', function () { fileMenu.classList.remove('open'); NyxUI.saveProjectFile(); });
    $('#miOpen').addEventListener('click', function () { fileMenu.classList.remove('open'); $('#fileInput').click(); });
    $('#miExportJson').addEventListener('click', function () {
      fileMenu.classList.remove('open');
      download('project-data.json', new Blob([JSON.stringify(NyxUI.project)], { type: 'application/json' }));
    });
    $('#miExportWav').addEventListener('click', function () { fileMenu.classList.remove('open'); NyxUI.exportWav(); });
    $('#fileInput').addEventListener('change', function (ev) {
      if (ev.target.files.length) NyxUI.openProjectFile(ev.target.files[0]);
      ev.target.value = '';
    });

    $('#btnPlay').addEventListener('click', NyxUI.togglePlay);
    $('#btnStop').addEventListener('click', function () { NyxUI.engine.stop(); NyxUI.mark('piano'); NyxUI.mark('playlist'); });
    $('#btnModePattern').addEventListener('click', function () { NyxUI.engine.mode = 'pattern'; NyxUI.syncTransport(); NyxUI.markAll(); });
    $('#btnModeSong').addEventListener('click', function () { NyxUI.engine.mode = 'song'; NyxUI.syncTransport(); NyxUI.markAll(); });
    $('#btnLoop').addEventListener('click', function () { NyxUI.engine.loop = !NyxUI.engine.loop; NyxUI.syncTransport(); });

    $('#bpmInput').addEventListener('change', function () { setBpm(Number(this.value)); NyxUI.commit('bpm'); });
    $('#bpmDrag').addEventListener('pointerdown', function (ev) {
      const startY = ev.clientY, start = NyxUI.project.bpm;
      function mv(e2) { setBpm(start + (startY - e2.clientY) / 3); e2.preventDefault(); }
      function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); NyxUI.commit('bpm'); }
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      ev.preventDefault();
    });
    $('#swingInput').addEventListener('change', function () {
      const v = NyxUI.clamp(Number(this.value) || 0, 0, 90) / 100;
      NyxUI.project.swing = v; NyxUI.engine.swing = v; NyxUI.commit('swing');
    });

    $('#btnUndo').addEventListener('click', doUndo);
    $('#btnRedo').addEventListener('click', doRedo);

    $('#btnMixer').addEventListener('click', function () {
      const w = NyxUI.openWindow('win-mixer', 'Mixer — inserts & FX', function (body) {
        const d = document.createElement('div');
        d.id = 'mixerStrips';
        body.appendChild(d);
        NyxUI.buildMixer();
      }, 80, 64);
      w.style.width = Math.min(900, window.innerWidth - 160) + 'px';
    });

    // center tabs
    $('#tabPiano').addEventListener('click', function () { NyxUI.setView('piano'); });
    $('#tabPlaylist').addEventListener('click', function () { NyxUI.setView('playlist'); });

    window.addEventListener('beforeunload', autosave);
  }

  NyxUI.setView = function (v) {
    NyxUI.view = v;
    $('#pianoPanel').style.display = v === 'piano' ? 'flex' : 'none';
    $('#playlistPanel').style.display = v === 'playlist' ? 'flex' : 'none';
    $('#tabPiano').classList.toggle('active', v === 'piano');
    $('#tabPlaylist').classList.toggle('active', v === 'playlist');
    NyxUI.mark('piano'); NyxUI.mark('playlist');
  };

  NyxUI.start = function () {
    wireChrome();
    NyxUI.boot();
    NyxUI.setView('playlist');
    NyxUI.buildRack(); NyxUI.buildBrowser(); NyxUI.buildMixer();
    NyxUI.markAll();
    requestAnimationFrame(frame);
  };

})();
