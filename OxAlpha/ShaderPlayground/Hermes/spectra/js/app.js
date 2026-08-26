/* SPECTRA-SPRUN02 — app.js : UI wiring, render loop, interactions */
(function () {
  'use strict';

  const S = window.SPStore;
  const $ = (sel) => document.querySelector(sel);

  // ---- element handles ---------------------------------------------------------
  const canvas = $('#glc');
  const badge = $('#badge');
  const pausedPill = $('#paused-pill');
  const fpsChip = $('#fps-chip');
  const statusLeft = $('#status-left');
  const dropOverlay = $('#drop-overlay');
  const fileInput = $('#file-input');

  let renderer = null;
  let timeSec = 0;            // effect clock (seconds, speed-scaled)
  let lastFrameTs = null;
  let quality = parseFloat($('#quality').value) || 1;
  let currentImageLabel = ''; // for badge when src === image
  const userImage = { el: null, aspect: 1 };
  const demoCache = {};       // id -> canvas

  // ================= renderer boot =================
  function bootGL() {
    renderer = window.createRenderer(canvas);
    if (!renderer.ok) {
      $('#glfail').classList.remove('hidden');
      canvas.style.display = 'none';
      return false;
    }
    const ro = new ResizeObserver(() => syncSize());
    ro.observe($('#stage'));
    window.addEventListener('resize', syncSize);
    syncSize();
    return true;
  }
  function syncSize() {
    const stage = $('#stage');
    const r = stage.getBoundingClientRect();
    renderer.resize(r.width, r.height, quality);
    updateStatus();
  }

  // ================= source handling =================
  function ensureDemo(id) {
    if (!demoCache[id]) demoCache[id] = window.SPDemos.get(id);
    return demoCache[id];
  }
  function useImageElement(el, aspect, label) {
    userImage.el = el;
    userImage.aspect = aspect;
    renderer.setTexture(el, aspect);
    currentImageLabel = label;
    S.state.src = 'image';
    S.emit();
    updateBadge();
  }
  function loadDemo(id) {
    const c = ensureDemo(id);
    useImageElement(c, c.width / c.height, window.SPDemos.labels[id]);
    toast(`Demo media: ${window.SPDemos.labels[id]}`);
  }
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { toast('Not an image file'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      useImageElement(img, img.naturalWidth / img.naturalHeight, 'Your Image');
      toast('Image loaded — stays local in your browser');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { toast('Could not decode that image'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function updateBadge() {
    let name;
    if (S.state.src === 'image') {
      if (!userImage.el) loadDemo('aurora'); // never show blank image mode
      name = currentImageLabel || 'IMAGE';
    } else {
      name = (S.SRC_MODES.find(m => m.id === S.state.src) || {}).label || '';
    }
    badge.textContent = `${String(name).toUpperCase()} · ${canvas.width}×${canvas.height}`;
    updateStatus();
  }

  function updateStatus() {
    const srcName = S.state.src === 'image' ? (currentImageLabel || 'Image') : (S.SRC_MODES.find(m => m.id === S.state.src) || {}).label;
    statusLeft.textContent = `Source: ${srcName} · ${canvas.width}×${canvas.height} · WebGL`;
  }

  // ================= control panel build =================
  const valueEls = {};   // id -> value span
  const inputEls = {};   // id -> range/checkbox

  function fmtVal(def, v) {
    if (def.fmt) return def.fmt(v);
    return Number(v).toFixed(2).replace(/\.00$/, '.0');
  }

  function buildPanel() {
    // segmented source buttons
    const seg = $('#src-seg');
    S.SRC_MODES.forEach(m => {
      const b = document.createElement('button');
      b.textContent = m.label;
      b.dataset.mode = m.id;
      b.addEventListener('click', () => {
        S.state.src = m.id;
        if (m.id === 'image' && !userImage.el) loadDemo('aurora');
        S.emit();
      });
      seg.appendChild(b);
    });

    // sliders per group
    document.querySelectorAll('.sec[data-group]').forEach(secEl => {
      const group = secEl.dataset.group;
      const rows = secEl.querySelector('.rows');
      S.DEFS.filter(d => d.group === group).forEach(def => {
        if (def.type === 'toggle') {
          const row = document.createElement('div');
          row.className = 'switch-row';
          row.innerHTML = `<span class="row-label">${def.label}</span>
            <label class="switch"><input type="checkbox" data-param="${def.id}"><span class="knob"></span></label>`;
          rows.appendChild(row);
          const cb = row.querySelector('input');
          inputEls[def.id] = cb;
          cb.addEventListener('change', () => { S.state.params[def.id] = cb.checked; S.emit(); saveSessionSoon(); });
        } else {
          const row = document.createElement('div');
          row.className = 'row';
          row.innerHTML = `<div class="row-head"><span class="row-label">${def.label}</span><span class="row-val mono"></span></div>`;
          const range = document.createElement('input');
          range.type = 'range';
          range.min = def.min; range.max = def.max; range.step = def.step;
          range.dataset.param = def.id;
          row.appendChild(range);
          rows.appendChild(row);
          valueEls[def.id] = row.querySelector('.row-val');
          inputEls[def.id] = range;
          range.addEventListener('input', () => {
            S.state.params[def.id] = parseFloat(range.value);
            refreshValue(def.id);
            S.emit();
            saveSessionSoon();
          });
        }
      });
    });

    // presets section lives in HTML; wire below
  }

  function refreshValue(id) {
    const def = S.DEFS.find(d => d.id === id);
    if (!def) return;
    if (valueEls[id]) valueEls[id].textContent = fmtVal(def, S.state.params[id]);
    if (inputEls[id] && inputEls[id].type !== 'checkbox' && document.activeElement !== inputEls[id]) {
      inputEls[id].value = S.state.params[id];
    } else if (inputEls[id] && inputEls[id].type !== 'checkbox') {
      inputEls[id].value = S.state.params[id];
    }
  }

  function syncControlsFromState() {
    S.DEFS.forEach(def => {
      if (def.type === 'toggle') {
        if (inputEls[def.id]) inputEls[def.id].checked = !!S.state.params[def.id];
      } else {
        refreshValue(def.id);
      }
    });
    // segmented
    document.querySelectorAll('#src-seg button').forEach(b =>
      b.classList.toggle('on', b.dataset.mode === S.state.src));
    $('#image-row').classList.toggle('hidden', S.state.src !== 'image');
    updateBadge();
    syncPlayIcon();
  }

  // ================= presets UI =================
  function fillPresetSelect() {
    const sel = $('#preset-sel');
    sel.innerHTML = '';
    const og1 = document.createElement('optgroup');
    og1.label = 'Built-in';
    S.BUILTINS.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = 'b:' + i; o.textContent = p.name;
      og1.appendChild(o);
    });
    sel.appendChild(og1);
    const users = S.loadUserPresets();
    if (users.length) {
      const og2 = document.createElement('optgroup');
      og2.label = 'My presets';
      users.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = 'u:' + i; o.textContent = p.name;
        og2.appendChild(o);
      });
      sel.appendChild(og2);
    }
    sel.value = 'b:0';
    $('#btn-del-preset').disabled = !sel.value.startsWith('u:');
  }

  function applySelectedPreset() {
    const sel = $('#preset-sel');
    const v = sel.value || 'b:0';
    $('#btn-del-preset').disabled = !v.startsWith('u:');
    if (v.startsWith('b:')) {
      const p = S.BUILTINS[parseInt(v.slice(2), 10)];
      if (p) S.applyPresetData({ src: p.src || S.state.src, params: p.p ? { ...S.defaults().params, ...p.p } : S.defaults().params });
    } else {
      const users = S.loadUserPresets();
      const p = users[parseInt(v.slice(2), 10)];
      if (p) S.applyPresetData(p.data);
    }
  }

  function openSaveDialog() {
    const back = $('#dlg-backdrop');
    const input = $('#dlg-name');
    back.classList.remove('hidden');
    input.value = '';
    setTimeout(() => input.focus(), 30);
  }
  function commitSaveDialog() {
    const name = $('#dlg-name').value.trim();
    if (!name) { toast('Give the preset a name'); return; }
    const users = S.loadUserPresets();
    const existing = users.findIndex(u => u.name.toLowerCase() === name.toLowerCase());
    const entry = { name, data: S.serialize(), at: Date.now() };
    if (existing >= 0) users[existing] = entry; else users.push(entry);
    if (users.length > 30) users.shift(); // bound storage
    S.saveUserPresets(users);
    $('#dlg-backdrop').classList.add('hidden');
    fillPresetSelect();
    const idx = S.loadUserPresets().findIndex(u => u.name === name);
    $('#preset-sel').value = 'u:' + idx;
    $('#btn-del-preset').disabled = false;
    toast(`Preset saved — “${name}”`);
  }

  function deleteSelectedPreset() {
    const sel = $('#preset-sel');
    if (!sel.value.startsWith('u:')) return;
    const idx = parseInt(sel.value.slice(2), 10);
    const users = S.loadUserPresets();
    if (!users[idx]) return;
    const [gone] = users.splice(idx, 1);
    S.saveUserPresets(users);
    fillPresetSelect();
    toast(`Deleted “${gone.name}”`);
  }

  // ================= session persistence =================
  let sessionTimer = null;
  function saveSessionSoon() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(S.saveSession, 400);
  }

  // ================= toasts / dialogs =================
  function toast(msg) {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.remove(), 2600);
  }

  // ================= play state =================
  function setPlaying(v) {
    S.state.playing = v;
    pausedPill.classList.toggle('hidden', v);
    syncPlayIcon();
    if (!v) S.saveSession();
  }
  function syncPlayIcon() {
    $('#ic-pause').style.display = S.state.playing ? '' : 'none';
    $('#ic-play').style.display = S.state.playing ? 'none' : '';
  }

  // ================= snapshot =================
  function snapshot() {
    drawFrame(performance.now());           // guarantee fresh buffer
    canvas.toBlob(blob => {
      if (!blob) { toast('Snapshot failed'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `spectra-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`PNG saved (${(blob.size / 1024).toFixed(0)} KB)`);
    }, 'image/png');
  }

  // ================= render loop =================
  let frames = 0, fpsLast = performance.now(), fpsVal = 0;
  function drawFrame(ts) {
    if (lastFrameTs != null && S.state.playing) {
      const dt = Math.min((ts - lastFrameTs) / 1000, 0.05);
      timeSec += dt * S.state.params.speed;
    }
    lastFrameTs = ts;
    renderer.render(S.state.params, S.state.src, timeSec);
    frames++;
    if (ts - fpsLast >= 500) {
      fpsVal = Math.round(frames * 1000 / (ts - fpsLast));
      frames = 0; fpsLast = ts;
      fpsChip.textContent = `${fpsVal} fps`;
    }
  }
  function loop(ts) {
    drawFrame(ts);
    requestAnimationFrame(loop);
  }

  // ================= global events =================
  function wireUI() {
    $('#btn-play').addEventListener('click', () => setPlaying(!S.state.playing));
    $('#btn-shot').addEventListener('click', snapshot);
    $('#btn-help').addEventListener('click', () => $('#help-backdrop').classList.toggle('hidden'));
    $('#help-close').addEventListener('click', () => $('#help-backdrop').classList.add('hidden'));
    $('#btn-full').addEventListener('click', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      } catch (e) { /* ignore */ }
    });
    $('#btn-panel').addEventListener('click', () => document.body.classList.toggle('panel-open'));

    $('#quality').addEventListener('change', e => {
      quality = parseFloat(e.target.value) || 1;
      syncSize();
      toast(`Render scale ${Math.round(quality * 100)}%`);
    });

    $('#preset-sel').addEventListener('change', applySelectedPreset);
    $('#btn-save-preset').addEventListener('click', openSaveDialog);
    $('#btn-del-preset').addEventListener('click', deleteSelectedPreset);
    $('#btn-randomize').addEventListener('click', () => { S.randomize(); toast('Randomized 🎲'); });
    $('#btn-reset').addEventListener('click', () => {
      S.applyPresetData(S.defaults());
      $('#preset-sel').value = 'b:0';
      toast('Reset to Signature Drift');
    });

    // dialog
    $('#dlg-ok').addEventListener('click', commitSaveDialog);
    $('#dlg-cancel').addEventListener('click', () => $('#dlg-backdrop').classList.add('hidden'));
    $('#dlg-name').addEventListener('keydown', e => { if (e.key === 'Enter') commitSaveDialog(); });

    // upload
    $('#btn-upload').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });

    // demo buttons
    document.querySelectorAll('.demo-btns .demo').forEach(b =>
      b.addEventListener('click', () => loadDemo(b.dataset.demo)));

    // drag & drop onto stage
    let dragDepth = 0;
    ['dragenter', 'dragover'].forEach(ev =>
      $('#stage').addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'dragenter') dragDepth++;
        dropOverlay.classList.remove('hidden');
      }));
    $('#stage').addEventListener('dragleave', () => {
      if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.add('hidden'); }
    });
    $('#stage').addEventListener('drop', e => {
      e.preventDefault();
      dragDepth = 0;
      dropOverlay.classList.add('hidden');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });

    // keyboard shortcuts
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); setPlaying(!S.state.playing); break;
        case 'r': S.randomize(); break;
        case 'h': $('#help-backdrop').classList.toggle('hidden'); break;
        case 'f': $('#btn-full').click(); break;
        case 's': e.preventDefault(); snapshot(); break;
        case 'escape':
          $('#help-backdrop').classList.add('hidden');
          $('#dlg-backdrop').classList.add('hidden');
          break;
      }
    });

    // overlay click-to-dismiss
    $('#help-backdrop').addEventListener('click', e => { if (e.target.id === 'help-backdrop') e.target.classList.add('hidden'); });

    // state → UI sync
    S.subscribe(syncControlsFromState);
  }

  // ================= debug/test API =================
  window.__SP = {
    MARK: S.MARK,
    version: 'run02',
    getState: () => JSON.parse(JSON.stringify({
      src: S.state.src, params: S.state.params, playing: S.state.playing,
    })),
    setState(patch) {
      const s = { ...S.state.params, ...(patch.params || {}) };
      if (patch.src) S.state.src = patch.src;
      S.applyPresetData({ src: S.state.src, params: s });
    },
    applyBuiltin(i) {
      const p = S.BUILTINS[i];
      if (!p) return false;
      S.applyPresetData({ src: p.src || S.state.src, params: { ...S.defaults().params, ...p.p } });
      const sel = document.getElementById('preset-sel');
      if (sel) { sel.value = 'b:' + i; sel.dispatchEvent(new Event('change')); }
      return true;
    },
    randomize: () => S.randomize(),
    setTime(t) { timeSec = +t || 0; },
    getTime: () => timeSec,
    loadDemo,
    hasTexture: () => !!(renderer && renderer.ok) && (S.state.src === 'image'),
    stats: () => ({ fps: fpsVal, w: canvas.width, h: canvas.height, glOk: !!(renderer && renderer.ok) }),
    snapshotDataUrl(cb) {
      drawFrame(performance.now());
      canvas.toBlob(b => {
        const rd = new FileReader();
        rd.onload = () => cb(rd.result, b ? b.size : 0);
        if (b) rd.readAsDataURL(b); else cb(null, 0);
      }, 'image/png');
    },
  };

  // ================= boot =================
  document.addEventListener('DOMContentLoaded', () => {
    buildPanel();
    fillPresetSelect();
    wireUI();
    if (!bootGL()) return;

    // restore previous session, else default preset look
    const hadSession = !!localStorage.getItem('spectra-sprun02-session-v1');
    if (hadSession) {
      S.restoreSession();
      // restore play flag default true
    }
    syncControlsFromState();
    if (!hadSession) {
      applySelectedPreset(); // Signature Drift
      setTimeout(() => toast('Tip — drop any image onto the canvas'), 1200);
    }
    requestAnimationFrame(loop);
    updateBadge();
  });
})();
