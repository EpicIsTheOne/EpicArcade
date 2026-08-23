/* PULSE-9 app glue: boot, transport wiring, shortcuts, undo/redo, save/load/export,
 * meters/spectrum animation, help.
 */
'use strict';
(function () {
  const U = window.P9UI;
  const MX = window.P9Mixer;   // mixer module
  const P9Rack = window.P9Rack, P9Playlist = window.P9Playlist,
    P9PianoRoll = window.P9PianoRoll, P9Instrument = window.P9Instrument, P9Fx = window.P9Fx;

  const app = {
    project: null,
    transport: null,
    ctx: null,            // live AudioContext (lazy)
    selectedChannelId: null,
    selectedStrip: 0,
    playheadStep: 0,
    _lastCommitKey: null,

    /* ---------------- undo/redo ---------------- */
    commit(label) {
      this._history.push(this.project);
      this._lastCommitKey = label || 'edit';
    },
    commitOnce(key) {
      // collapse rapid knob drags into one history entry
      if (this._lastCommitKey === key && this._history.depth > 0) return;
      this.commit(key);
    },
    undo() {
      const prev = this._history.undo(this.project);
      if (!prev) { U.toast('Nothing to undo'); return; }
      this.project = P9.loadProject(prev);
      this.afterHistorySwap();
      U.status('Undo');
    },
    redo() {
      const next = this._history.redo(this.project);
      if (!next) { U.toast('Nothing to redo'); return; }
      this.project = P9.loadProject(next);
      this.afterHistorySwap();
      U.status('Redo');
    },
    afterHistorySwap() {
      if (this.transport && this.transport.graph) {
        P9.panic(this.transport.graph);
        this.transport.graph = null;
        if (this.transport.state === 'playing') {
          const at = this.transport.positionStep();
          this.transport.play(Math.floor(at));
        }
      }
      this.selectedChannelId = this.project.channels.some(c => c.id === this.selectedChannelId)
        ? this.selectedChannelId : (this.project.channels[0] ? this.project.channels[0].id : null);
      delete this.project._selNotes;
      delete this.project._selectedClip;
      this.refreshAll();
      this.autosave();
    },

    /* ---------------- audio plumbing ---------------- */
    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.transport = new P9.Transport(this.ctx, () => this.project, {
          onState: s => updatePlayState(s),
          onPosition: p => drawPos(p),
          onAudioBlocked: () => {
            U.status('Audio output blocked — click anywhere in the app to enable sound');
            const kick = () => {
              this.ensureCtx();
              document.removeEventListener('pointerdown', kick);
            };
            document.addEventListener('pointerdown', kick);
          },
        });
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    applyChannelAudio(idx) {
      // live-update channel gain/pan without graph rebuild
      const t = this.transport;
      if (!t || !t.graph) return;
      const g = t.graph;
      this.project.channels.forEach((ch, i) => {
        const node = g.chanNodes[i];
        if (!node) return;
        const audible = P9.channelAudible(this.project.channels, i);
        node.gain.gain.setTargetAtTime(audible ? ch.volume : 0, this.ctx.currentTime, 0.02);
        if (node.pan) node.pan.pan.setTargetAtTime(ch.pan, this.ctx.currentTime, 0.02);
      });
    },
    applyMixAudio() {
      const t = this.transport;
      if (!t || !t.graph) return;
      const g = t.graph;
      for (const ms of this.project.mixerStrips) {
        const st = g.strips.find(s => s.idx === ms.index);
        if (!st) continue;
        st.volume = ms.volume; st.muted = ms.muted; st.solo = ms.solo;
        const anySolo = this.project.mixerStrips.some(s => s.solo);
        const audible = !ms.muted && (!anySolo || ms.solo);
        if (st.postGain) st.postGain.gain.setTargetAtTime(audible ? 1 : 0, this.ctx.currentTime, 0.02);
        if (st.idx === 0) {
          const volNode = t.graph.masterVolNode || st.gainNode;
          volNode.gain.setTargetAtTime(ms.volume, this.ctx.currentTime, 0.02);
          this.project.masterVolume = ms.volume;
        } else if (st.gainNode) {
          st.gainNode.gain.setTargetAtTime(ms.volume, this.ctx.currentTime, 0.02);
        }
        if (st.panner) st.panner.pan.setTargetAtTime(ms.pan, this.ctx.currentTime, 0.02);
      }
    },
    rebuildAudio() {
      // structural change (fx add/remove/route): rebuild the audio graph so
      // strips/FX always reflect project state.
      if (!this.transport) return;
      if (this.transport.state === 'playing') {
        const at = Math.floor(this.transport.positionStep());
        this.transport.rebuildGraph();
        void at;
      } else {
        // stopped/paused: swap in a fresh graph immediately (cheap, keeps UI/tests consistent)
        if (this.transport.graph) P9.panic(this.transport.graph);
        this.transport.graph = P9.buildGraph(this.ensureCtx(), this.project);
        this.transport.graph._voices = [];
      }
    },
    updateFxParam(stripIndex, slot) {
      const t = this.transport;
      const ms = this.project.mixerStrips.find(s => s.index === stripIndex);
      if (!t || !t.graph || !ms) return;
      const st = t.graph.strips.find(s => s.idx === stripIndex);
      if (!st || !st.fxChain.instances[slot]) return;
      st.fxChain.instances[slot].inst.update(Object.assign({}, P9.FX_DEFS[ms.fx[slot].type].defaults, ms.fx[slot].params));
      this.autosave();
    },

    /* ---------------- preview helpers ---------------- */
    previewStep(ch, vel) {
      if (!vel) return;
      this.ensureCtx();
      const t = this.transport;
      if (!t.graph) { t.graph = P9.buildGraph(this.ctx, this.project); t.graph._voices = []; }
      const idx = this.project.channels.indexOf(ch);
      if (idx < 0) return;
      if (P9.channelAudible(this.project.channels, idx)) {
        const v = P9.triggerDrum(this.ctx, ch, P9.drumPitchFor(ch), Math.min(1, vel), this.ctx.currentTime + 0.01,
          t.graph.chanNodes[idx].gain, t.graph.noiseBuf);
      }
    },
    previewNote(chId, pitch, durSec) {
      this.ensureCtx();
      const t = this.transport;
      if (!t.graph) { t.graph = P9.buildGraph(this.ctx, this.project); t.graph._voices = []; }
      const idx = this.project.channels.findIndex(c => c.id === chId);
      if (idx < 0) return;
      const ch = this.project.channels[idx];
      if (!P9.channelAudible(this.project.channels, idx)) return;
      const v = P9.buildMelodicVoice(this.ctx, ch, pitch, 0.7, this.ctx.currentTime + 0.01, durSec || 0.25, t.graph.chanNodes[idx].gain);
      v.stop(this.ctx.currentTime + 0.01 + (durSec || 0.25));
    },
    async loadSampleFromFile(ch, file) {
      try {
        this.ensureCtx();
        const buf = await file.arrayBuffer();
        const audioBuf = await this.ctx.decodeAudioData(buf);
        // stash in the engine's sampler cache keyed by channel id
        P9.__samplerCache = P9.__samplerCache || new Map();
        P9.__samplerCache.set(ch.id, audioBuf);
        ch.params.sampleName = file.name.slice(0, 40);
        ch.params.sampleDur = audioBuf.duration;
        U.toast('Sample loaded: ' + ch.params.sampleName, 'ok');
        P9Instrument.show(ch.id);
        this.autosave();
      } catch (err) {
        U.toast('Could not decode audio: ' + err.message, 'err');
      }
    },

    /* ---------------- channels ---------------- */
    selectChannel(id) {
      this.selectedChannelId = id;
      P9Rack.render();
      P9PianoRoll.render();
      document.getElementById('pr-channel-lbl').textContent =
        '· ' + (this.project.channels.find(c => c.id === id) || { name: 'none' }).name +
        ' · pat ' + (this.project.currentPattern + 1);
    },
    selectChannelForNote(chId) { if (chId && this.project.channels.some(c => c.id === chId)) { this.selectedChannelId = chId; } },
    addChannel(type, name, paramsOver) {
      this.ensureCtx(); // so sampler decode etc works later; harmless otherwise
      this.commit('add channel');
      const ch = P9.newChannel(type, name);
      if (paramsOver) Object.assign(ch.params, paramsOver);
      ch.mixer = Math.min(31, nextFreeStrip(this.project));
      this.project.channels.push(ch);
      // ensure a pattern step array exists
      for (const pat of this.project.patterns) {
        if (!pat.steps[ch.id]) pat.steps[ch.id] = new Array(pat.length).fill(0);
      }
      this.rebuildAudio();
      this.refreshAll();
      this.autosave();
      P9Instrument.show(ch.id);
      U.status('Added ' + ch.name);
    },
    cloneChannel(id) {
      this.commit('clone channel');
      const src = this.project.channels.find(c => c.id === id);
      if (!src) return;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = P9.uid('ch');
      copy.name = src.name + ' 2';
      this.project.channels.push(copy);
      this.rebuildAudio();
      this.refreshAll();
      this.autosave();
    },
    deleteChannel(id) {
      const ch = this.project.channels.find(c => c.id === id);
      if (!ch) return;
      this.commit('delete channel');
      this.project.channels = this.project.channels.filter(c => c.id !== id);
      for (const pat of this.project.patterns) {
        pat.notes = pat.notes.filter(n => n.ch !== id);
        delete pat.steps[id];
      }
      if (this.selectedChannelId === id) {
        this.selectedChannelId = this.project.channels[0] ? this.project.channels[0].id : null;
      }
      this.rebuildAudio();
      this.refreshAll();
      this.autosave();
    },
    openFxEditor(stripIndex, slot) {
      const ms = this.project.mixerStrips.find(s => s.index === stripIndex);
      if (!ms) return;
      if (ms.fx && ms.fx[slot]) P9Fx.show(stripIndex, slot);
      else P9Fx.showAddMenu(stripIndex, slot, 640, 200);
    },

    /* ---------------- persistence ---------------- */
    autosaveTimer: null,
    autosave() {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => {
        P9.autosaveSave(this.project);
      }, 400);
    },
    saveProject(download) {
      P9.autosaveSave(this.project);
      if (download !== false) {
        const json = JSON.stringify(P9.serialize(this.project), null, 1);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (this.project.name.replace(/[^\w\- ]+/g, '').trim() || 'project') + '.pulse9.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      U.toast('Project saved' + (download !== false ? ' (+ .json download)' : ''), 'ok');
      U.status('Saved ' + new Date().toLocaleTimeString());
    },
    loadProjectData(data) {
      try {
        const proj = P9.loadProject(data);
        this.commit('load project');
        this.project = proj;
        this._history.clear();
        this.commit('initial state'); // baseline so undo returns to loaded state
        this.selectedChannelId = proj.channels[0] ? proj.channels[0].id : null;
        this.selectedStrip = 0;
        delete this.project._selNotes; delete this.project._selectedClip;
        this.rebuildAudio();
        this.refreshAll();
        P9.autosaveSave(proj);
        U.status(proj.name + ' · loaded — press Space to play');
        U.toast('Loaded "' + proj.name + '"', 'ok');
      } catch (err) {
        U.modal({
          title: 'Could not load project',
          body: '<p>' + U.esc(String(err.message || err)) + '</p><p>The current project was left unchanged.</p>',
          buttons: [{ label: 'OK', primary: true }],
        });
      }
    },

    /* ---------------- global refresh ---------------- */
    refreshAll() {
      P9Rack.render();
      P9Playlist.render();
      P9PianoRoll.ensureSkeleton();
      P9PianoRoll.render();
      MX.render();
      syncPatternSelect();
      syncTransportUi();
      updateLcd();
    },
  };

  function nextFreeStrip(project) {
    const used = new Set(project.channels.map(c => c.mixer | 0));
    let i = 1;
    while (used.has(i) && i < 32) i++;
    return i;
  }

  /* ================= boot ================= */

  function boot() {
    // init modules
    P9Rack.init(app); P9Playlist.init(app); P9PianoRoll.init(app);
    MX.init(app); P9Instrument.init(app); P9Fx.init(app);

    // restore autosave or demo
    const raw = P9.autosaveLoadRaw();
    if (raw) {
      try {
        app.project = P9.loadProject(raw);
        app._history = P9.createHistory(120);
        app.commit('initial state');
      } catch (e) { app.project = null; }
    }
    if (!app.project) {
      app.project = P9.createDemo();
      app._history = P9.createHistory(120);
      app.commit('initial state');
    }
    app.selectedChannelId = app.project.channels[0] ? app.project.channels[0].id : null;

    installTopbar();
    P9Playlist.installPaintHandler();
    installShortcuts();
    installFloatDrag();
    app.refreshAll();

    // start rAF loop for meters/lcd
    requestAnimationFrame(frame);

    U.status(app.project.name + ' · ready — press Space to play');
  }

  /* ================= topbar wiring ================= */

  function installTopbar() {
    const $ = id => document.getElementById(id);

    $('btn-play').addEventListener('click', () => { app.ensureCtx(); app.transport.toggle(); });
    $('btn-stop').addEventListener('click', () => { app.transport && app.transport.stop(); });
    $('btn-loop').addEventListener('click', () => {
      app.project.loop.on = !app.project.loop.on;
      $('btn-loop').classList.toggle('on', app.project.loop.on);
      app.autosave();
    });
    $('mode-pat').addEventListener('click', () => setMode('pattern'));
    $('mode-song').addEventListener('click', () => setMode('song'));
    function setMode(m) {
      if (app.transport && app.transport.state === 'playing') app.transport.pause();
      app.project.playMode = m;
      $('mode-pat').classList.toggle('on', m === 'pattern');
      $('mode-song').classList.toggle('on', m === 'song');
      app.autosave();
    }
    app.setMode = setMode;

    // bpm drag / edit
    const bpmVal = $('bpm-val');
    let bpmDrag = null;
    bpmVal.addEventListener('pointerdown', e => {
      bpmDrag = { y: e.clientY, v: app.project.bpm };
      bpmVal.setPointerCapture(e.pointerId);
    });
    bpmVal.addEventListener('pointermove', e => {
      if (!bpmDrag) return;
      const d = bpmDrag.y - e.clientY;   // up = faster
      setBpm(bpmDrag.v + d * 0.5);
    });
    bpmVal.addEventListener('pointerup', () => { bpmDrag = null; app.autosave(); });
    bpmVal.addEventListener('dblclick', async () => {
      const v = await U.promptModal({ title: 'Tempo', label: 'BPM (20..999):', value: String(app.project.bpm) });
      if (v != null) { const n = parseFloat(v); if (Number.isFinite(n)) { setBpm(n); app.autosave(); } }
    });
    function setBpm(n) {
      n = U.clamp(Math.round(n), 20, 999);
      app.project.bpm = n;
      $('bpm-val').textContent = String(n);
    }
    app.setBpmDisplay = () => $('bpm-val').textContent = String(app.project.bpm);

    $('swing').addEventListener('input', () => {
      app.project.swing = parseFloat($('swing').value);
      app.autosave();
    });

    $('rack-menu').addEventListener('click', e => {
      const r = e.target.getBoundingClientRect();
      P9Rack.addMenu(r.left, r.bottom + 4);
    });

    $('pl-clip-pat').addEventListener('change', () => {
      const id = $('pl-clip-pat').value;
      const idx = app.project.patterns.findIndex(p => p.id === id);
      if (idx >= 0) { app.project.currentPattern = idx; app.refreshAll(); }
    });
    $('pl-clear').addEventListener('click', () => P9Playlist.clearAll());
    $('pr-clear').addEventListener('click', () => P9PianoRoll.clearNotes());
    $('pr-zoom-in').addEventListener('click', () => P9PianoRoll.setZoom(1.25));
    $('pr-zoom-out').addEventListener('click', () => P9PianoRoll.setZoom(1 / 1.25));

    $('btn-undo').addEventListener('click', () => app.undo());
    $('btn-redo').addEventListener('click', () => app.redo());
    $('btn-save').addEventListener('click', () => app.saveProject(true));
    $('btn-load').addEventListener('click', () => $('file-open').click());
    $('file-open').addEventListener('change', () => {
      const f = $('file-open').files && $('file-open').files[0];
      if (!f) return;
      f.text().then(txt => {
        try { app.loadProjectData(JSON.parse(txt)); }
        catch (e) { U.toast('Not valid JSON: ' + e.message, 'err'); }
      });
      $('file-open').value = '';
    });
    $('btn-export').addEventListener('click', exportWav);
    $('btn-help').addEventListener('click', showHelp);
    $('inst-close').addEventListener('click', () => P9Instrument.hide());
    $('fx-close').addEventListener('click', () => P9Fx.hide());

    // pattern selector lives in playlist header but also drives rack/piano roll:
    buildPatternMenu();
  }

  function buildPatternMenu() {
    // right-click on rack panel head = pattern ops
    const head = document.querySelector('#rack-panel .panel-head');
    head.addEventListener('contextmenu', e => {
      e.preventDefault();
      const proj = app.project;
      const items = [];
      proj.patterns.forEach((p, i) => items.push({
        label: (i === proj.currentPattern ? '▸ ' : '　 ') + (i + 1) + '. ' + p.name,
        action: () => { proj.currentPattern = i; app.refreshAll(); },
      }));
      items.push('-',
        { label: 'New pattern', action: () => { app.commit('new pattern'); proj.patterns.push(P9.newPattern('Pattern ' + (proj.patterns.length + 1))); app.refreshAll(); } },
        { label: 'Rename pattern…', action: async () => {
          const p = proj.patterns[proj.currentPattern];
          const v = await U.promptModal({ title: 'Rename pattern', label: 'Name:', value: p.name });
          if (v) { app.commit('rename pattern'); p.name = v.slice(0, 40); app.refreshAll(); }
        } },
        { label: 'Clone pattern', action: () => {
          app.commit('clone pattern');
          const src = proj.patterns[proj.currentPattern];
          const cp = JSON.parse(JSON.stringify(src));
          cp.id = P9.uid('pat'); cp.name = src.name + ' 2';
          for (const n of cp.notes) n.id = P9.uid('n');
          proj.patterns.push(cp);
          proj.currentPattern = proj.patterns.length - 1;
          app.refreshAll();
        } });
      if (proj.patterns.length > 1) {
        items.push({ label: 'Delete pattern', action: () => {
          app.commit('delete pattern');
          const dead = proj.patterns[proj.currentPattern];
          proj.patterns = proj.patterns.filter(p => p !== dead);
          proj.clips = proj.clips.filter(c => c.patternId !== dead.id);
          proj.currentPattern = 0;
          app.refreshAll();
        } });
      }
      U.menu(items, e.clientX, e.clientY);
    });
  }

  function syncPatternSelect() {
    const sel = document.getElementById('pl-clip-pat');
    sel.innerHTML = '';
    app.project.patterns.forEach((p, i) => {
      const o = U.el('option', { value: p.id }, (i + 1) + '. ' + p.name);
      if (i === app.project.currentPattern) o.selected = true;
      sel.append(o);
    });
  }

  function syncTransportUi() {
    document.getElementById('mode-pat').classList.toggle('on', app.project.playMode === 'pattern');
    document.getElementById('mode-song').classList.toggle('on', app.project.playMode === 'song');
    document.getElementById('btn-loop').classList.toggle('on', app.project.loop.on);
    app.setBpmDisplay && app.setBpmDisplay();
    document.getElementById('swing').value = String(app.project.swing || 0);
  }

  function updatePlayState(state) {
    const btn = document.getElementById('btn-play');
    btn.classList.toggle('playing', state === 'playing');
    btn.title = state === 'playing' ? 'Pause (Space)' : 'Play (Space)';
    U.status(state === 'playing' ? 'Playing · ' + app.project.playMode.toUpperCase() + ' mode'
      : state === 'paused' ? 'Paused' : 'Stopped');
  }

  /* ================= keyboard ================= */

  function installShortcuts() {
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if (typing) return;

      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        app.ensureCtx();
        app.transport.toggle();
      } else if (e.key === 'Enter') {
        app.transport && app.transport.stop();
      } else if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        e.shiftKey ? app.redo() : app.undo();
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        app.redo();
      } else if ((e.ctrlKey || e.metaKey) && k === 's') {
        e.preventDefault();
        app.saveProject(true);
      } else if ((e.ctrlKey || e.metaKey) && k === 'e') {
        e.preventDefault();
        exportWav();
      } else if (e.key === 'F1') {
        e.preventDefault();
        showHelp();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
      } else if (k === 'l') {
        app.project.loop.on = !app.project.loop.on;
        document.getElementById('btn-loop').classList.toggle('on', app.project.loop.on);
      } else if (k === 'p') {
        const m = app.project.playMode === 'song' ? 'pattern' : 'song';
        app.setMode(m);
      } else if (e.key === 'Home') {
        app.transportSeek(0);
      }
    });
  }

  function deleteSelection() {
    const proj = app.project;
    let did = false;
    if (proj._selNotes && proj._selNotes.size) {
      app.commit('delete notes');
      const pat = proj.patterns[proj.currentPattern];
      pat.notes = pat.notes.filter(n => !proj._selNotes.has(n.id));
      proj._selNotes.clear();
      did = true;
      P9PianoRoll.render();
    }
    if (proj._selectedClip) {
      app.commit('delete clip');
      proj.clips = proj.clips.filter(c => c.id !== proj._selectedClip);
      proj._selectedClip = null;
      did = true;
      P9Playlist.render();
    }
    if (!did) U.status('Nothing selected to delete');
    else app.autosave();
  }

  app.deleteSelection = deleteSelection;

  /* ================= transport position helpers ================= */

  app.transportSeek = function (step) {
    if (!app.transport) { app.playheadStep = step; drawPos(step); return; }
    app.transport.seek(step);
    drawPos(step);
  };
  function drawPos(stepFloat) {
    app.playheadStep = stepFloat;
    P9Playlist.updatePlayhead(stepFloat);
    P9PianoRoll.updatePlayhead(stepFloat);
    P9Rack.updatePlayheadCol(stepFloat);
    updateLcd();
  }

  function updateLcd() {
    const s = app.playheadStep || 0;
    const bar = Math.floor(s / 16) + 1, beat = Math.floor((s % 16) / 4) + 1, tick = Math.floor((s % 4)) + 1;
    document.getElementById('lcd-bar').textContent = String(bar);
    document.getElementById('lcd-beat').textContent = String(beat);
    document.getElementById('lcd-tick').textContent = String(tick);
    const spb = P9.secPerStep(app.project.bpm);
    const sec = s * spb;
    const m = Math.floor(sec / 60), ss = Math.floor(sec % 60), d = Math.floor((sec % 1) * 10);
    document.getElementById('lcd-time').textContent = m + ':' + String(ss).padStart(2, '0') + '.' + d;
  }

  /* ================= animation loop ================= */

  let lastFrameT = 0, cpuAvg = 0;
  const specHist = new Float32Array(24);
  function frame(t) {
    const dt = t - lastFrameT; lastFrameT = t;
    const playing = app.transport && app.transport.state === 'playing';

    if (playing) {
      const pos = app.transport.positionStep();
      drawPos(pos);
    }

    // meters from analysers (only when ctx exists)
    if (app.ctx && app.transport && app.transport.graph) {
      updateMetersFrame(dt);
      drawSpectrum();
    }

    // voices + rough CPU proxy
    const nv = app.transport && app.transport.graph ? app.transport.graph._voices.length : 0;
    document.getElementById('sb-voices').textContent = nv + ' voices';
    cpuAvg = cpuAvg * 0.95 + Math.min(100, dt / 16.7 * 100) * 0.05;
    document.getElementById('sb-cpu').textContent = 'ui ' + cpuAvg.toFixed(0) + '%';

    requestAnimationFrame(frame);
  }

  /* ---- per-strip metering via split analysers ---- */
  let analyserCache = null;
  function ensureAnalysers() {
    if (analyserCache) return analyserCache;
    const g = app.transport.graph;
    const map = {};
    for (const st of g.strips) {
      const an = app.ctx.createAnalyser();
      an.fftSize = 512;
      try { st.meterTap.connect(an); } catch (e) { continue; }
      map[st.idx] = an;
    }
    analyserCache = map;
    return map;
  }
  app.invalidateAnalysers = () => { analyserCache = null; };

  const meterBufs = new Map();
  function updateMetersFrame(dt) {
    const ans = ensureAnalysers();
    const levels = {};
    const anySoloStrip = app.project.mixerStrips.some(s => s.solo);
    for (const k of Object.keys(ans)) {
      const an = ans[k];
      let buf = meterBufs.get(an);
      if (!buf) { buf = new Float32Array(an.fftSize); meterBufs.set(an, buf); }
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 2) sum += buf[i] * buf[i];
      let rms = Math.sqrt(sum / (buf.length / 2));
      const idx = parseInt(k, 10);
      const ms = app.project.mixerStrips.find(s => s.index === idx);
      if (ms && (ms.muted || (anySoloStrip && !ms.solo))) rms = 0;
      levels[k] = rms;
    }
    MX.updateMeters(levels);
    // master peak hold indicator
    const m0 = levels['0'] || 0;
    const mm = document.getElementById('master-meter');
    drawMasterMeter(mm, m0);
  }

  let masterPeakHold = 0, masterPeakT = 0;
  function drawMasterMeter(canvas, level) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.fillStyle = '#08090d'; g.fillRect(0, 0, W, H);
    // stereo fake: two bars (same level; real split would need channel splitter)
    const now = performance.now();
    if (level >= masterPeakHold || now - masterPeakT > 800) { masterPeakHold = level; masterPeakT = now; }
    for (let c = 0; c < 2; c++) {
      const x = 8 + c * 14;
      const h = Math.min(1, Math.sqrt(level) * 1.15) * (H - 8);
      const grad = g.createLinearGradient(0, H - 4, 0, 4);
      grad.addColorStop(0, '#2fae62'); grad.addColorStop(0.7, '#ffd23f'); grad.addColorStop(1, '#ff4d4d');
      g.fillStyle = grad;
      g.fillRect(x, H - 4 - h, 10, h);
      g.strokeStyle = '#1c2733';
      g.strokeRect(x - 0.5, H - 4 - (H - 8), 11, H - 8);
    }
    // peak line
    const ph = Math.min(1, Math.sqrt(masterPeakHold) * 1.15) * (H - 8);
    g.fillStyle = masterPeakHold > 0.89 ? '#ff5d5d' : '#fff';
    g.fillRect(8, H - 4 - ph - 1, 24, 1.5);
  }

  function drawSpectrum() {
    const cv = document.getElementById('spectrum');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.fillStyle = '#08090d'; g.fillRect(0, 0, W, H);
    if (!app.transport || !app.transport.graph) return;
    if (!app._specAn) {
      app._specAn = app.ctx.createAnalyser();
      app._specAn.fftSize = 256;
      app.transport.graph.masterOut.connect(app._specAn);
    }
    const bins = new Uint8Array(app._specAn.frequencyBinCount);
    app._specAn.getByteFrequencyData(bins);
    const N = 24;
    for (let i = 0; i < N; i++) {
      const f = Math.pow(i / N, 1.6);                       // log-ish spacing
      const bi = Math.min(bins.length - 1, Math.floor(f * bins.length));
      const v = bins[bi] / 255;
      specHist[i] = Math.max(v, specHist[i] * 0.86);         // gentle decay
      const x = i * (W / N);
      const bh = specHist[i] * (H - 4);
      g.fillStyle = 'rgba(51,224,200,' + (0.35 + 0.65 * specHist[i]).toFixed(2) + ')';
      g.fillRect(x + 1, H - 2 - bh, W / N - 2, bh);
    }
  }

  /* ================= floating panel drag ================= */

  function installFloatDrag() {
    for (const [panelId, handleSel] of [['instrument-panel', '.fp-head'], ['fx-panel', '.fp-head']]) {
      const panel = document.getElementById(panelId);
      const handle = panel.querySelector(handleSel);
      U.dragHelper(handle, {
        threshold: 2,
        onStart: () => { panel.style.zIndex = '80'; },
        onMove: (_p, ev) => {
          const r = panel.getBoundingClientRect();
          panel.style.left = U.clamp(ev.clientX - r.width * 0, 0, window.innerWidth - 60) + 'px';
          panel.style.top = U.clamp(ev.clientY - 12, 0, window.innerHeight - 40) + 'px';
        },
      });
    }
  }

  /* ================= export ================= */

  async function exportWav() {
    if (app._exporting) return;
    app._exporting = true;
    const btn = document.getElementById('btn-export');
    btn.textContent = 'RENDERING…';
    U.status('Rendering song to WAV…');
    try {
      const proj = app.project;
      // Export always renders SONG arrangement (fall back to current pattern when empty)
      const hasClips = proj.clips.length > 0;
      const opts = hasClips
        ? { mode: 'song', tailSec: 2.0 }
        : { mode: 'pattern', repeats: 2, tailSec: 1.5 };
      const { wav, buffer } = await P9.renderToWav(proj, opts);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (proj.name.replace(/[^\w\- ]+/g, '').trim() || 'song') + '.wav';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 6000);
      const stats = P9.audioStats(buffer.getChannelData(0));
      U.toast('Exported ' + buffer.duration.toFixed(1) + 's WAV · peak ' + stats.peak.toFixed(2) + ' rms ' + stats.rms.toFixed(3), 'ok');
      U.status('Export complete (' + buffer.duration.toFixed(1) + 's @ ' + buffer.sampleRate + 'Hz)');
    } catch (err) {
      console.error(err);
      U.toast('Export failed: ' + (err.message || err), 'err');
      U.status('Export failed');
    } finally {
      app._exporting = false;
      btn.textContent = 'EXPORT';
    }
  }
  app.exportWav = exportWav;

  /* ================= help ================= */

  function showHelp() {
    U.modal({
      title: 'PULSE-9 — quick guide',
      wide: 560,
      body: `
<h4>Workflow</h4>
<table>
<tr><td>1</td><td>Click a channel row in the RACK, then click steps to program drums.</td></tr>
<tr><td>2</td><td>Draw melodies for synth/bass/keys in the PIANO ROLL (click = note, drag = move/resize).</td></tr>
<tr><td>3</td><td>Paint patterns into the PLAYLIST (pick pattern top-right, click lanes). Drag clips; right-click deletes; ctrl+drag duplicates.</td></tr>
<tr><td>4</td><td>MIX: click a mixer strip, drag faders/knobs; click FX slots to add effects.</td></tr>
<tr><td>5</td><td>SONG mode plays the arrangement; PAT mode loops the current pattern.</td></tr>
</table>
<h4>Keyboard</h4>
<table>
<tr><td>Space</td><td>Play / pause</td></tr>
<tr><td>Enter</td><td>Stop & rewind</td></tr>
<tr><td>L / P</td><td>Loop toggle / Pat-Song mode</td></tr>
<tr><td>Ctrl+Z / Ctrl+Y</td><td>Undo / redo</td></tr>
<tr><td>Ctrl+S</td><td>Save project (json)</td></tr>
<tr><td>Ctrl+E</td><td>Export WAV of the song</td></tr>
<tr><td>Delete</td><td>Delete selected notes / clip</td></tr>
<tr><td>F1</td><td>This help</td></tr>
</table>
<h4>Mouse</h4>
<table>
<tr><td>Piano roll</td><td>click place · drag move · edge-drag resize · alt+drag velocity · right-click delete · wheel scroll · shift+wheel horizontal · ctrl+wheel zoom</td></tr>
<tr><td>Rack steps</td><td>click toggle · shift+click accent · right-click clear</td></tr>
<tr><td>Knobs/faders</td><td>drag up = more (standard) · dbl-click type · right-click reset</td></tr>
<tr><td>Playlist ruler</td><td>click seek · drag loop region · shift+drag resize loop end</td></tr>
</table>
<p class="hint-line">Projects autosave to browser storage; SAVE also downloads a .pulse9.json you can re-open anywhere.</p>`,
      buttons: [{ label: 'Got it', primary: true }],
    });
  }

  /* ================= go ================= */
  window.P9App = app;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
