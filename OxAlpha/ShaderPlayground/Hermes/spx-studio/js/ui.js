/* SPX-RUN02-9F2 :: ui.js — builds the control panel from the schema and wires every
 * slider / chip / button / select. Pure DOM glue; state + actions live in main.js (App). */
(function () {
  'use strict';

  var S = window.SPX_SCHEMA;
  var refs = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function init(App) {
    buildControls(App);
    buildProcChips(App);
    bindTopbar(App);
    bindSourceButtons(App);
    bindDialogs(App);
    return refs;
  }

  /* ---------- left panel ---------- */
  function buildControls(App) {
    var host = document.getElementById('controls');
    host.innerHTML = '';

    S.GROUPS.forEach(function (gName) {
      var box = el('section', 'grp');
      box.appendChild(el('h3', null, gName));

      if (gName === 'Switches') {
        var chips = el('div', 'chips');
        S.PARAMS.filter(function (p) { return p.toggle; }).forEach(function (p) {
          var b = el('button', 'chip', p.label);
          b.dataset.id = p.id;
          b.addEventListener('click', function () {
            App.setParam(p.id, App.state.params[p.id] > 0.5 ? 0 : 1);
          });
          chips.appendChild(b);
          refs['chip_' + p.id] = b;
        });
        box.appendChild(chips);
      } else {
        S.PARAMS.filter(function (p) { return !p.toggle && p.group === gName; }).forEach(function (p) {
          var row = el('div', 'row');
          row.dataset.id = p.id;
          var lab = el('label');
          var lbl = el('span', 'lbl', p.label);
          var val = el('span', 'val', p.fmt(p.def));
          lab.appendChild(lbl); lab.appendChild(val);
          // double-click label resets this param
          lab.title = 'Double-click to reset';
          lab.addEventListener('dblclick', function () { App.setParam(p.id, p.def); });
          var input = document.createElement('input');
          input.type = 'range';
          input.min = p.min; input.max = p.max; input.step = p.step; input.value = p.def;
          input.dataset.id = p.id;
          input.addEventListener('input', function () {
            App.setParam(p.id, parseFloat(input.value));
          });
          row.appendChild(lab); row.appendChild(input);
          box.appendChild(row);
          refs['row_' + p.id] = row;
          refs['val_' + p.id] = val;
          refs['rng_' + p.id] = input;
        });
      }
      host.appendChild(box);
    });
  }

  function buildProcChips(App) {
    var host = document.getElementById('procChips');
    host.innerHTML = '';
    S.PROCEDURALS.forEach(function (pr) {
      var b = el('button', 'chip proc', pr.name);
      b.dataset.idx = pr.idx;
      b.title = 'Animated procedural scene — needs no media';
      b.addEventListener('click', function () { App.setProcedural(pr.idx); });
      host.appendChild(b);
      refs['proc_' + pr.idx] = b;
    });
  }

  /* ---------- topbar ---------- */
  function bindTopbar(App) {
    refs.presetSel = document.getElementById('presetSel');
    rebuildPresetList(App);

    refs.presetSel.addEventListener('change', function () {
      App.applyPresetByKey(refs.presetSel.value);
    });

    document.getElementById('btnSave').addEventListener('click', App.openSaveDialog);
    document.getElementById('btnDelete').addEventListener('click', App.deleteSelectedPreset);
    document.getElementById('btnReset').addEventListener('click', App.resetAll);
    document.getElementById('btnRand').addEventListener('click', App.randomize);
    document.getElementById('btnSnap').addEventListener('click', App.snapshot);
    document.getElementById('btnFull').addEventListener('click', App.toggleFullscreen);
    document.getElementById('btnHelp').addEventListener('click', App.toggleHelp);

    refs.fps = document.getElementById('fps');
  }

  function rebuildPresetList(App) {
    var sel = refs.presetSel;
    sel.innerHTML = '';
    var custom = el('option', null, '— Custom —');
    custom.value = '__custom';
    sel.appendChild(custom);
    var g1 = document.createElement('optgroup'); g1.label = 'Built-in';
    S.PRESETS.forEach(function (p, i) {
      var o = el('option', null, p.name);
      o.value = 'b:' + i;
      g1.appendChild(o);
    });
    sel.appendChild(g1);
    var saved = App.listSavedPresets();
    if (saved.length) {
      var g2 = document.createElement('optgroup'); g2.label = 'Saved (this browser)';
      saved.forEach(function (p) {
        var o = el('option', null, p.name);
        o.value = 's:' + encodeURIComponent(p.name);
        g2.appendChild(o);
      });
      sel.appendChild(g2);
    }
    sel.value = '__custom';
  }

  /* ---------- source section ---------- */
  function bindSourceButtons(App) {
    refs.btnDemo = document.getElementById('btnDemo');
    refs.btnImage = document.getElementById('btnImage');
    refs.srcHint = document.getElementById('srcHint');

    refs.btnDemo.addEventListener('click', function () { App.setDemoArt(); });
    refs.btnImage.addEventListener('click', function () { document.getElementById('fileInput').click(); });
    document.getElementById('fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) App.loadImageFile(e.target.files[0]);
      e.target.value = '';
    });
  }

  /* ---------- dialogs ---------- */
  function bindDialogs(App) {
    var dlg = document.getElementById('saveDialog');
    var name = document.getElementById('presetName');
    document.getElementById('sdCancel').addEventListener('click', function () { dlg.hidden = true; });
    document.getElementById('sdOk').addEventListener('click', function () {
      App.savePreset(name.value);
    });
    name.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') App.savePreset(name.value);
      if (e.key === 'Escape') dlg.hidden = true;
    });
    refs.saveDialog = dlg;
    refs.presetName = name;

    var help = document.getElementById('helpOverlay');
    document.getElementById('helpClose').addEventListener('click', function () { help.hidden = true; });
    help.addEventListener('click', function (e) { if (e.target === help) help.hidden = true; });
    refs.helpOverlay = help;

    refs.dropOverlay = document.getElementById('dropOverlay');
  }

  /* ---------- sync helpers (called by main after state changes) ---------- */
  function syncParams(App) {
    S.PARAMS.forEach(function (p) {
      var v = App.state.params[p.id];
      if (p.toggle) {
        refs['chip_' + p.id].classList.toggle('on', v > 0.5);
      } else {
        refs['rng_' + p.id].value = v;
        refs['val_' + p.id].textContent = p.fmt(v);
      }
    });
  }

  function syncSource(App) {
    var st = App.state;
    refs.btnDemo.classList.toggle('on', st.source === 'demo' || st.source === 'image');
    refs.btnImage.classList.toggle('on', st.source === 'image');
    S.PROCEDURALS.forEach(function (pr) {
      refs['proc_' + pr.idx].classList.toggle('on', st.source === 'proc' && st.procType === pr.idx);
    });
    if (st.source === 'proc') {
      var name = (S.PROCEDURALS.filter(function (x) { return x.idx === st.procType; })[0] || {}).name || '?';
      refs.srcHint.textContent = 'Procedural scene: ' + name + ' — no media needed. Drop or paste an image any time.';
    } else if (st.source === 'image') {
      refs.srcHint.textContent = 'Your image: ' + (st.imageName || 'untitled') + ' (drop / paste to replace)';
    } else {
      refs.srcHint.textContent = 'Built-in demo artwork. Drop or paste an image any time.';
    }
  }

  function setPresetSelection(key) {
    refs.presetSel.value = key || '__custom';
    if (refs.presetSel.selectedIndex < 0) refs.presetSel.value = '__custom';
  }

  function toast(msg, kind) {
    var host = document.getElementById('toasts');
    while (host.children.length >= 4) host.removeChild(host.firstChild);
    var t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2300);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2700);
  }

  function setStatus(left) {
    document.getElementById('stLeft').textContent = left;
  }

  function fps(v) { refs.fps.textContent = v.toFixed(0) + ' fps'; }

  window.SPUI = {
    init: init,
    syncParams: syncParams,
    syncSource: syncSource,
    rebuildPresetList: rebuildPresetList,
    setPresetSelection: setPresetSelection,
    toast: toast,
    setStatus: setStatus,
    fps: fps,
    refs: refs
  };
})();
