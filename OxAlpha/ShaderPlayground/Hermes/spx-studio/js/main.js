/* SPX-RUN02-9F2 :: main.js — application state, storage, randomizer, snapshot/export,
 * image loading (file / drop / paste), keyboard shortcuts and the render loop. */
(function () {
  'use strict';

  var S = window.SPX_SCHEMA;
  var PRESET_STORE = 'spx.presets.v1';
  var SESSION_KEY = 'spx.session.v1';

  var App = {
    state: {
      source: 'proc',          // 'proc' | 'demo' | 'image'
      procType: 2,             // nebula
      imageName: null,
      params: Object.assign({}, S.DEFAULTS),
      presetKey: 'b:0'
    },
    ready: false
  };
  window.App = App;

  /* =================== boot =================== */
  var renderer = null;
  var demoCanvas = null;

  function boot() {
    try {
      renderer = window.SPGL.create(document.getElementById('view'));
    } catch (e) {
      console.error(e);
      renderer = null;
    }
    if (!renderer) {
      document.getElementById('glFail').hidden = false;
      document.getElementById('view').style.display = 'none';
      return;
    }

    demoCanvas = makeDemoArt(1280, 720);
    renderer.uploadImage(demoCanvas);

    restoreSession();
    SPUI.init(App);
    applyAllToGL();
    SPUI.syncParams(App);
    SPUI.syncSource(App);
    SPUI.setPresetSelection(App.state.presetKey);
    updateStatus();

    setupResize();
    setupDnD();
    setupPaste();
    setupKeyboard();

    startLoop();
    App.ready = true;
    SPUI.toast('Shader Playground ready — press H for help');
  }

  function applyAllToGL() {
    var st = App.state;
    if (st.source === 'proc') {
      renderer.setSource(st.procType);
    } else if (st.source === 'demo') {
      renderer.uploadImage(demoCanvas);   // also restores aspect
      renderer.setSource(0);
    } else {
      renderer.setSource(0);
    }
    renderer.setParams(st.params);
  }

  /* =================== param mutations =================== */
  function findParam(id) {
    for (var i = 0; i < S.PARAMS.length; i++) if (S.PARAMS[i].id === id) return S.PARAMS[i];
    return null;
  }

  App.setParam = function (id, v) {
    var p = findParam(id);
    v = Math.min(p.max, Math.max(p.min, v));
    App.state.params[id] = v;
    markCustom();
    renderer.setParams(App.state.params);
    SPUI.syncParams(App);
    persistSessionSoon();
  };

  App.setProcedural = function (idx) {
    App.state.source = 'proc';
    App.state.procType = idx | 0;
    renderer.setSource(App.state.procType);
    SPUI.syncSource(App);
    updateStatus();
    persistSessionSoon();
  };

  App.setDemoArt = function () {
    App.state.source = 'demo';
    App.state.imageName = null;
    applyAllToGL();
    SPUI.syncSource(App);
    updateStatus();
    persistSessionSoon();
  };

  App.loadImageFile = function (file) {
    if (!file || !/^image\//.test(file.type)) { SPUI.toast('Not an image file', 'warn'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var cv = fitCanvas(img, 2048);
      App.state.source = 'image';
      App.state.imageName = file.name || 'pasted image';
      renderer.uploadImage(cv);
      renderer.setSource(0);
      SPUI.syncSource(App);
      updateStatus();
      persistSessionSoon();
      SPUI.toast('Loaded image — ' + img.width + '×' + img.height);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      SPUI.toast('Could not decode that image', 'warn');
    };
    img.src = url;
  };

  function fitCanvas(img, maxSide) {
    var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    var w = Math.max(2, Math.round(img.width * scale));
    var h = Math.max(2, Math.round(img.height * scale));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv;
  }

  /* =================== presets =================== */
  App.listSavedPresets = function () {
    try { return JSON.parse(localStorage.getItem(PRESET_STORE) || '[]'); }
    catch (e) { return []; }
  };

  function writeSavedPresets(list) {
    localStorage.setItem(PRESET_STORE, JSON.stringify(list.slice(0, 60)));
  }

  App.openSaveDialog = function () {
    SPUI.refs.saveDialog.hidden = false;
    SPUI.refs.presetName.value = '';
    setTimeout(function () { SPUI.refs.presetName.focus(); }, 30);
  };

  App.savePreset = function (rawName) {
    var name = (rawName || '').trim();
    if (!name) { SPUI.toast('Give the preset a name first', 'warn'); return; }
    var list = App.listSavedPresets();
    var finalName = name, n = 2;
    while (list.some(function (p) { return p.name === finalName; })) finalName = name + ' (' + (n++) + ')';
    var thumb = makeThumb();
    list.push({ name: finalName, ts: Date.now(), thumb: thumb, params: copyParams() });
    writeSavedPresets(list);
    SPUI.rebuildPresetList(App);
    var key = 's:' + encodeURIComponent(finalName);
    App.state.presetKey = key;
    SPUI.rebuildPresetList(App);
    SPUI.setPresetSelection(key);
    SPUI.refs.saveDialog.hidden = true;
    persistSessionSoon();
    SPUI.toast('Preset saved: ' + finalName);
  };

  App.deleteSelectedPreset = function () {
    var key = App.state.presetKey || SPUI.refs.presetSel.value;
    if (!key || key.indexOf('s:') !== 0) { SPUI.toast('Select a saved preset to delete', 'warn'); return; }
    var name = decodeURIComponent(key.slice(2));
    var list = App.listSavedPresets().filter(function (p) { return p.name !== name; });
    writeSavedPresets(list);
    App.state.presetKey = '__custom';
    SPUI.rebuildPresetList(App);
    SPUI.setPresetSelection('__custom');
    persistSessionSoon();
    SPUI.toast('Deleted preset: ' + name);
  };

  App.applyPresetByKey = function (key) {
    if (!key || key === '__custom') { App.state.presetKey = '__custom'; return; }
    var params = null;
    if (key.indexOf('b:') === 0) {
      var bp = S.PRESETS[parseInt(key.slice(2), 10)];
      if (bp) params = Object.assign({}, S.DEFAULTS, bp.params);
    } else if (key.indexOf('s:') === 0) {
      var name = decodeURIComponent(key.slice(2));
      var sp = App.listSavedPresets().filter(function (x) { return x.name === name; })[0];
      if (sp) params = Object.assign({}, S.DEFAULTS, sp.params);
    }
    if (!params) return;
    App.state.params = params;
    App.state.presetKey = key;
    renderer.setParams(App.state.params);
    SPUI.syncParams(App);
    persistSessionSoon();
  };

  App.resetAll = function () {
    App.state.params = Object.assign({}, S.DEFAULTS);
    App.state.presetKey = 'b:0';
    renderer.setParams(App.state.params);
    SPUI.syncParams(App);
    SPUI.setPresetSelection('b:0');
    persistSessionSoon();
    SPUI.toast('Reset to defaults');
  };

  function copyParams() {
    return JSON.parse(JSON.stringify(App.state.params));
  }

  function markCustom() {
    if (App.state.presetKey !== '__custom') {
      App.state.presetKey = '__custom';
      SPUI.setPresetSelection('__custom');
    }
  }

  function makeThumb() {
    renderer.render(timeAcc);
    var cv = document.createElement('canvas');
    cv.width = 120; cv.height = 68;
    var ctx = cv.getContext('2d');
    ctx.drawImage(renderer.canvas, 0, 0, 120, 68);
    try { return cv.toDataURL('image/jpeg', 0.72); } catch (e) { return null; }
  }

  /* =================== randomize =================== */
  function randParamValue(p) {
    if (p.toggle) return Math.random() < (p.randOn || 0.3) ? 1 : 0;
    var r = Math.random();
    if (p.rand === 'bias') {
      return p.min + (p.max - p.min) * Math.pow(r, 1.7);
    }
    if (p.rand === 'biasS') { // signed bias (swirl): often strong
      var mag = p.max * Math.pow(r, 0.75);
      return (Math.random() < 0.5 ? -1 : 1) * mag;
    }
    // center: gaussian-ish around default
    var g = (Math.random() + Math.random() + Math.random()) / 3; // 0..1, bell-ish
    var span = (p.max - p.min) * 0.36;
    var v = p.def + (g - 0.5) * 2 * span;
    return Math.min(p.max, Math.max(p.min, v));
  }

  App.randomize = function () {
    var next = {};
    S.PARAMS.forEach(function (p) { next[p.id] = randParamValue(p); });
    // guarantee at least one hero distortion so results never look "off"
    if (Math.abs(next.swirl) < 40 && next.waveAmt < 0.02 && next.split < 8 && next.pixel < 6 && next.waveAmt < 0.02) {
      next.swirl = (60 + Math.random() * 280) * (Math.random() < 0.5 ? -1 : 1);
    }
    // avoid unreadable combos
    if (next.bright < 0.45) next.bright = 0.45 + Math.random() * 0.4;
    App.state.params = next;
    markCustom();
    renderer.setParams(App.state.params);
    SPUI.syncParams(App);
    persistSessionSoon();
    SPUI.toast('🎲 Randomized — hit R again for another');
  };

  /* =================== snapshot =================== */
  App.snapshot = function () {
    renderer.render(timeAcc);
    renderer.canvas.toBlob(function (blob) {
      if (!blob) { SPUI.toast('Snapshot failed', 'warn'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'shader-playground-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      SPUI.toast('📷 Snapshot saved (' + Math.round(blob.size / 1024) + ' KB)');
    }, 'image/png');
  };

  App.toggleFullscreen = function () {
    var wrap = document.getElementById('wrap');
    if (!document.fullscreenElement) {
      (wrap.requestFullscreen || wrap.webkitRequestFullscreen || function () {}).call(wrap);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  };

  App.toggleHelp = function () {
    var h = SPUI.refs.helpOverlay;
    h.hidden = !h.hidden;
  };

  /* =================== drag & drop / paste =================== */
  function setupDnD() {
    var stage = document.getElementById('stage');
    var ov = SPUI.refs.dropOverlay;
    var depth = 0;
    stage.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; ov.classList.add('show'); });
    stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    stage.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; ov.classList.remove('show'); } });
    stage.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; ov.classList.remove('show');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) App.loadImageFile(f);
    });
  }

  function setupPaste() {
    window.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          App.loadImageFile(items[i].getAsFile());
          e.preventDefault();
          return;
        }
      }
    });
  }

  /* =================== keyboard =================== */
  function setupKeyboard() {
    window.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' && t.type !== 'range' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if (typing) {
        if (e.key === 'Escape') {
          SPUI.refs.saveDialog.hidden = true;
          SPUI.refs.helpOverlay.hidden = true;
          t.blur();
        }
        return;
      }
      switch (e.key) {
        case 'r': case 'R': App.randomize(); break;
        case 's': case 'S': App.snapshot(); break;
        case 'f': case 'F': e.preventDefault(); App.toggleFullscreen(); break;
        case 'h': case 'H': case '?': App.toggleHelp(); break;
        case ' ': e.preventDefault(); App.setParam('freeze', App.state.params.freeze > 0.5 ? 0 : 1); break;
        case 'Escape':
          if (!SPUI.refs.saveDialog.hidden) SPUI.refs.saveDialog.hidden = true;
          else if (!SPUI.refs.helpOverlay.hidden) SPUI.refs.helpOverlay.hidden = true;
          break;
      }
    });
  }

  /* =================== session persistence =================== */
  var persistTimer = null;
  function persistSessionSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistSession, 350);
  }
  function persistSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        source: App.state.source,
        procType: App.state.procType,
        imageName: App.state.imageName,
        params: App.state.params,
        presetKey: App.state.presetKey,
        v: 1
      }));
    } catch (e) { /* private mode etc. */ }
  }
  function restoreSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !s.params) return;
      App.state.params = Object.assign({}, S.DEFAULTS, s.params);
      App.state.procType = s.procType || 2;
      App.state.presetKey = s.presetKey || '__custom';
      // note: image data can't survive reloads — fall back gracefully
      if (s.source === 'image') {
        App.state.source = 'proc';
        wasImageBeforeReload = true;
      } else {
        App.state.source = s.source === 'demo' ? 'demo' : 'proc';
      }
    } catch (e) { /* corrupt state: keep defaults */ }
  }
  var wasImageBeforeReload = false;

  /* =================== resize / status / loop =================== */
  function setupResize() {
    var wrap = document.getElementById('wrap');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function onResize() {
      renderer.resize(wrap.clientWidth, wrap.clientHeight, dpr);
      updateStatus();
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(wrap);
    window.addEventListener('resize', onResize);
    onResize();
  }

  function sourceLabel() {
    var st = App.state;
    if (st.source === 'proc') {
      var pr = S.PROCEDURALS.filter(function (x) { return x.idx === st.procType; })[0];
      return 'Procedural · ' + (pr ? pr.name : '?');
    }
    if (st.source === 'image') return 'Image · ' + (st.imageName || 'untitled');
    return 'Demo art · synthwave';
  }

  function updateStatus() {
    var c = renderer.canvas;
    SPUI.setStatus(sourceLabel() + '  ·  ' + c.width + '×' + c.height + '  ·  WebGL');
  }

  var timeAcc = 0, lastT = 0, rafId = 0;
  var fpsAvg = 0, fpsTick = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    if (!(App.state.params.freeze > 0.5)) timeAcc += dt;
    renderer.setParams(App.state.params); // cheap; keeps slider drags instant even mid-frame
    renderer.render(timeAcc);

    fpsAvg = fpsAvg ? fpsAvg * 0.92 + dt * 0.08 : dt;
    fpsTick += dt;
    if (fpsTick > 0.4) {
      fpsTick = 0;
      SPUI.fps(1 / fpsAvg);
    }
  }

  function startLoop() {
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        lastT = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    });
  }

  /* =================== demo artwork (synthwave landscape, seeded) =================== */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDemoArt(W, H) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var horizon = H * 0.62;
    var rnd = mulberry32(0xC0FFEE);

    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#12002e');
    sky.addColorStop(0.55, '#3d0f52');
    sky.addColorStop(0.85, '#a12a63');
    sky.addColorStop(1, '#ff7a3c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);

    // stars
    for (var i = 0; i < 220; i++) {
      var sx = rnd() * W, sy = rnd() * horizon * 0.75;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.65).toFixed(2) + ')';
      ctx.fillRect(sx, sy, rnd() < 0.12 ? 2 : 1, rnd() < 0.12 ? 2 : 1);
    }

    // sun with bands
    var sunR = H * 0.23, sunX = W * 0.5, sunY = horizon - sunR * 0.18;
    var sun = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sun.addColorStop(0, '#ffe95c');
    sun.addColorStop(0.5, '#ff9d3c');
    sun.addColorStop(1, '#ff3d81');
    ctx.save();
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = sun; ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
    ctx.globalCompositeOperation = 'destination-out';
    for (var b = 0; b < 7; b++) {
      var by = sunY + sunR * (0.05 + b * 0.14);
      ctx.fillRect(sunX - sunR, by, sunR * 2, 2 + b * 1.9);
    }
    ctx.restore();

    // mountains (two layers)
    function ridge(baseY, amp, color, step) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      var y = baseY;
      for (var x = 0; x <= W; x += step) {
        y += (rnd() - 0.5) * amp;
        y = Math.max(baseY - amp * 2.2, Math.min(baseY + amp * 0.8, y));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath(); ctx.fill();
    }
    ridge(horizon - H * 0.10, H * 0.035, '#26073f', 26);
    ridge(horizon - H * 0.045, H * 0.028, '#170430', 34);

    // floor
    var fl = ctx.createLinearGradient(0, horizon, 0, H);
    fl.addColorStop(0, '#20043c');
    fl.addColorStop(1, '#05010d');
    ctx.fillStyle = fl;
    ctx.fillRect(0, horizon, W, H - horizon);

    // neon perspective grid
    ctx.save();
    ctx.strokeStyle = '#22e6ff';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 7;
    var vp = { x: W * 0.5, y: horizon };
    for (var k = -14; k <= 14; k++) {
      ctx.beginPath();
      ctx.moveTo(vp.x + k * 14, horizon);
      ctx.lineTo(vp.x + k * W * 0.16, H);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ff4fd8';
    ctx.shadowColor = '#ff4fd8';
    for (var row = 0; row < 16; row++) {
      var tt = row / 16;
      var yy = horizon + Math.pow(tt, 2.4) * (H - horizon);
      ctx.globalAlpha = 0.25 + tt * 0.75;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }
    ctx.restore();

    // horizon glow line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,120,190,0.9)';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();
    ctx.restore();

    // caption
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText('DEMO ART — SYNTHWAVE VALLEY', 24, H - 28);
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('built-in media for trying effects without your own images', 24, H - 10);

    return cv;
  }

  /* =================== debug/test API =================== */
  window.__SP = {
    id: S.ID,
    isReady: function () { return App.ready; },
    state: function () { return JSON.parse(JSON.stringify(App.state)); },
    setParam: function (id, v) { App.setParam(id, v); },
    applyPresetByKey: function (k) { App.applyPresetByKey(k); SPUI.setPresetSelection(k); },
    frameInfo: function () { return renderer.frameInfo(); },
    fpsNow: function () { return fpsAvg ? 1 / fpsAvg : 0; },
    canvasSize: function () { var c = renderer.canvas; return [c.width, c.height]; },
    wasImageRestored: function () { return wasImageBeforeReload; }
  };

  boot();
})();
