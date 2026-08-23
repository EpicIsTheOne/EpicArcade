/* PULSE-9 UI: Channel Rack / step sequencer */
'use strict';
(function () {
  const U = window.P9UI;
  const R = window.P9Rack = {};
  let app = null; // set via init(app)

  R.init = function (a) { app = a; };

  /** Full rebuild of rack rows. Called on structural changes. */
  R.render = function () {
    const body = document.getElementById('rack-body');
    const proj = app.project;
    body.innerHTML = '';
    if (!proj.channels.length) {
      body.append(U.el('div', { class: 'rack-empty' },
        'No channels yet.', U.el('br'), 'Use + ADD to create an instrument.'));
      return;
    }
    const pat = proj.patterns[proj.currentPattern];
    for (let i = 0; i < proj.channels.length; i++) {
      const ch = proj.channels[i];
      body.append(buildRow(ch, i, pat));
    }
  };

  /** Update just step LEDs without rebuilding everything. */
  R.updateSteps = function () {
    const pat = app.project.patterns[app.project.currentPattern];
    document.querySelectorAll('.rack-row').forEach(row => {
      const chId = row.dataset.ch;
      const arr = (pat && pat.steps[chId]) || [];
      row.querySelectorAll('.step').forEach((st, idx) => {
        st.classList.toggle('on', !!arr[idx]);
      });
    });
  };

  R.updatePlayheadCol = function (stepFloat) {
    const col = Math.floor(stepFloat);
    document.querySelectorAll('.rack-row').forEach(row => {
      row.querySelectorAll('.step').forEach((st, idx) => {
        st.classList.toggle('playhead', idx === col);
      });
    });
  };

  function buildRow(ch, idx, pat) {
    const sel = app.selectedChannelId === ch.id;
    const row = U.el('div', { class: 'rack-row' + (sel ? ' sel' : ''), dataset: { ch: ch.id } });

    // mute / solo LEDs
    const muteBtn = U.el('button', { class: 'led-btn' + (ch.muted ? ' mute-on' : ''), title: ch.muted ? 'Unmute' : 'Mute' });
    muteBtn.addEventListener('click', e => {
      e.stopPropagation();
      app.commit('mute channel');
      ch.muted = !ch.muted;
      app.applyChannelAudio(idx);
      R.render();
    });
    const soloBtn = U.el('button', { class: 'led-btn' + (ch.solo ? ' solo-on' : ''), title: ch.solo ? 'Un-solo' : 'Solo' });
    soloBtn.addEventListener('click', e => {
      e.stopPropagation();
      app.commit('solo channel');
      ch.solo = !ch.solo;
      app.applyChannelAudio();
      R.render();
    });

    // name
    const nameWrap = U.el('div', {},
      U.el('span', { class: 'ch-name', style: 'color:' + (sel ? 'var(--txt)' : ch.color) }, ch.name),
      U.el('span', { class: 'ch-type' }, ch.type.toUpperCase() + (ch.type === 'drum' ? ' · ' + P9.drumLaneOfChannel(ch) : '')));
    nameWrap.style.minWidth = '0';

    // pan knob (mini)
    const panK = U.knob({
      value: ch.pan, min: -1, max: 1, size: 30,
      label: 'PAN', defValue: 0,
      fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100),
      onInput: v => { ch.pan = v; app.applyChannelAudio(idx); },
      title: 'Pan',
    });
    panK.el.classList.add('pan-knob');
    panK.el.querySelector('.k-lbl').style.display = 'none';
    panK.el.querySelector('.k-val').style.display = 'none';

    // volume slider
    const vol = U.slider({ value: ch.volume, min: 0, max: 1.4, title: 'Volume', onInput: v => { ch.volume = v; app.applyChannelAudio(idx); } });
    const volWrap = U.el('div', { class: 'vol-wrap' }, vol);

    // step grid
    const len = pat ? pat.length : 16;
    const grid = U.el('div', { class: 'step-grid' });
    const arr = (pat && pat.steps[ch.id]) || [];
    for (let s = 0; s < len && s < 64; s++) {
      const st = U.el('button', { class: 'step' + (Math.floor(s / 4) % 2 === 1 ? ' b4' : '') + (arr[s] ? ' on' : '') });
      st.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if (!pat.steps[ch.id]) pat.steps[ch.id] = new Array(pat.length).fill(0);
        const a = pat.steps[ch.id];
        app.commit('toggle step');
        if (e.button === 2 || (e.shiftKey && a[s])) {
          a[s] = 0; // right-click or shift removes
        } else if (e.shiftKey) {
          a[s] = a[s] ? (a[s] > 1 ? 1 : 1.27) : 1; // cycle accent
        } else {
          a[s] = a[s] ? 0 : 1;
        }
        st.classList.toggle('on', !!a[s]);
        app.previewStep(ch, a[s]);
      });
      st.addEventListener('contextmenu', e => e.preventDefault());
      grid.append(st);
    }

    // delete channel
    const del = U.el('button', { class: 'step-del', title: 'Delete channel' }, '✕');
    del.addEventListener('click', e => {
      e.stopPropagation();
      app.deleteChannel(ch.id);
    });

    row.append(muteBtn, soloBtn, nameWrap, panK.el, volWrap, grid, del);

    // selection
    row.addEventListener('click', e => {
      if (e.target.closest('.step') || e.target.closest('.step-del') ||
          e.target.closest('.knob') || e.target.closest('input')) return;
      app.selectChannel(ch.id);
    });
    row.addEventListener('dblclick', e => {
      if (e.target.closest('.step') || e.target.closest('input')) return;
      U.promptModal({ title: 'Rename channel', label: 'Name:', value: ch.name })
        .then(v => { if (v) { app.commit('rename'); ch.name = v.slice(0, 40); app.refreshAll(); } });
    });
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      const items = [
        { label: 'Rename…', action: () => U.promptModal({ title: 'Rename channel', label: 'Name:', value: ch.name }).then(v => { if (v) { app.commit('rename'); ch.name = v.slice(0, 40); app.refreshAll(); } }) },
        '-',
        { label: 'Clone channel', action: () => app.cloneChannel(ch.id) },
        { label: 'Clear this pattern\'s steps', action: () => { app.commit('clear steps'); if (pat) pat.steps[ch.id] = new Array(pat.length).fill(0); R.render(); } },
        '-',
        { label: 'Delete channel', action: () => app.deleteChannel(ch.id) },
      ];
      if (ch.type === 'drum') {
        items.unshift({
          label: 'Drum sound: ' + P9.drumLaneOfChannel(ch),
          action: () => showLanePicker(current => { app.commit('drum lane'); ch.params.lane = current; app.refreshAll(); }),
        });
      }
      U.menu(items, e.clientX, e.clientY);
    });
    return row;
  }

  function showLanePicker(cb) {
    const items = P9.DRUM_LANE_KEYS.map(k => ({ label: P9.DRUM_LABELS[k], action: () => cb(k) }));
    U.menu(items, 200, 200);
  }

  /** The "+ ADD" menu. */
  R.addMenu = function (x, y) {
    const mk = (type, name) => () => app.addChannel(type, name);
    U.menu([
      { label: 'Synth (lead)', action: mk('synth', 'Lead Synth') },
      { label: 'Bass (mono)', action: mk('bass', 'Bass') },
      { label: 'Keys (poly)', action: mk('keys', 'Keys') },
      '-', {
        label: 'Drums ▸',
        action: () => {
          U.menu(P9.DRUM_LANE_KEYS.map(k => ({
            label: P9.DRUM_LABELS[k],
            action: () => app.addChannel('drum', P9.DRUM_LABELS[k], { lane: k }),
          })), x + 40, y + 10);
        },
      },
      { label: 'Sampler', action: mk('sampler', 'Sampler') },
    ], x, y);
  };
})();
