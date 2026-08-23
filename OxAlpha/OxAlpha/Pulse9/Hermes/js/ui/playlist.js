/* PULSE-9 UI: Playlist / arrangement view
 * DOM clips over a canvas backdrop. Click empty = paint clip (selected pattern).
 * Drag clip = move in time (right) and lane (down). Right-click = delete.
 * Edge-drag = resize. Ctrl+drag = duplicate.
 */
'use strict';
(function () {
  const U = window.P9UI;
  const PL = window.P9Playlist = {};
  let app = null;

  const LANE_H = 30;
  let pxPerStep = 12;

  PL.init = function (a) { app = a; };
  let paintInstalled = false;

  /** Create ruler+lanes structure inside the panel body once. */
  PL.ensureSkeleton = function () {
    const body = document.getElementById('playlist-body');
    if (!document.getElementById('pl-lanes')) {
      body.innerHTML = '';
      body.append(
        U.el('div', { id: 'pl-ruler' }),
        U.el('div', { id: 'pl-lanes' }));
    }
  };

  PL.pxPerStep = () => pxPerStep;
  PL.setZoom = function (factor) {
    pxPerStep = U.clamp(pxPerStep * factor, 3, 60);
    PL.render();
  };

  PL.render = function () {
    const proj = app.project;
    PL.ensureSkeleton();
    const lanesHost = document.getElementById('pl-lanes');
    lanesHost.innerHTML = '';

    const songEnd = Math.max(P9.songLengthSteps(proj), proj.loop.endStep, 64);
    const W = songEnd * pxPerStep + 40;
    const H = proj.tracks * LANE_H;

    // backdrop canvas: lane stripes, bar lines, loop region
    const cv = U.el('canvas', { class: 'pl-canvas' });
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);

    for (let t = 0; t < proj.tracks; t++) {
      g.fillStyle = t % 2 ? '#10141c' : '#121722';
      g.fillRect(0, t * LANE_H, W, LANE_H);
    }
    const bars = Math.ceil(songEnd / 16) + 1;
    for (let b = 0; b <= bars; b++) {
      const x = b * 16 * pxPerStep;
      g.strokeStyle = b % 4 === 0 ? '#2c3550' : '#1d2436';
      g.lineWidth = b % 4 === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      // (bar numbers live in the ruler canvas only)
    }
    // loop region tint
    if (proj.loop.on) {
      g.fillStyle = 'rgba(51,224,200,0.05)';
      g.fillRect(proj.loop.startStep * pxPerStep, 0, (proj.loop.endStep - proj.loop.startStep) * pxPerStep, H);
    }

    const inner = U.el('div', { class: 'pl-inner', style: `width:${W}px;height:${H}px` }, cv);
    lanesHost.append(inner);

    // clips
    const patById = new Map(proj.patterns.map(p => [p.id, p]));
    for (const clip of proj.clips) {
      inner.append(buildClip(clip, patById.get(clip.patternId)));
    }

    PL.renderRuler();
    PL.updatePlayhead(app.playheadStep != null ? app.playheadStep : 0);
    PL.syncPaintSelect();
  };

  PL.renderRuler = function () {
    const ruler = document.getElementById('pl-ruler');
    ruler.innerHTML = '';
    const proj = app.project;
    const songEnd = Math.max(P9.songLengthSteps(proj), proj.loop.endStep, 64);
    const W = songEnd * pxPerStep + 40;
    const cv = U.el('canvas', { style: 'display:block' });
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = 22 * dpr;
    cv.style.width = W + 'px'; cv.style.height = '22px';
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#0e1119'; g.fillRect(0, 0, W, 22);
    // loop bracket
    g.fillStyle = 'rgba(51,224,200,0.18)';
    g.fillRect(proj.loop.startStep * pxPerStep, 13, (proj.loop.endStep - proj.loop.startStep) * pxPerStep, 9);
    g.fillStyle = 'var(--acc)';
    g.fillStyle = '#33e0c8';
    g.fillRect(proj.loop.startStep * pxPerStep, 13, 2, 9);
    g.fillRect(proj.loop.endStep * pxPerStep - 2, 13, 2, 9);
    const bars = Math.ceil(songEnd / 16) + 1;
    g.font = '9px monospace';
    for (let b = 0; b < bars; b++) {
      const x = b * 16 * pxPerStep;
      g.strokeStyle = b % 4 === 0 ? '#3a4666' : '#232b40';
      g.beginPath(); g.moveTo(x, b % 4 === 0 ? 4 : 10); g.lineTo(x, 13); g.stroke();
      if (pxPerStep >= 6 || b % 4 === 0) { g.fillStyle = '#55627f'; g.fillText(String(b + 1), x + 3, 9); }
    }
    ruler.append(cv);

    // ruler interaction: click = seek, drag = move loop, shift+drag = resize loop end
    let mode = null, startX = 0, origStart = 0;
    cv.addEventListener('pointerdown', e => {
      const rect = cv.getBoundingClientRect();
      const step = (e.clientX - rect.left) / pxPerStep;
      startX = e.clientX; origStart = proj.loop.startStep;
      mode = e.shiftKey ? 'end' : 'move';
      if (!e.shiftKey && !e.altKey && Math.abs(step - proj.loop.startStep) > 2) {
        app.transportSeek(step);
      }
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!mode) return;
      const dSteps = Math.round((e.clientX - startX) / pxPerStep);
      if (mode === 'move') {
        proj.loop.startStep = Math.max(0, origStart + dSteps);
        proj.loop.endStep = Math.max(proj.loop.startStep + 4, proj.loop.endStep);
      } else {
        proj.loop.endStep = Math.max(proj.loop.startStep + 4, origStart + dSteps);
      }
      PL.renderRuler(); PL.render();
    });
    cv.addEventListener('pointerup', () => { mode = null; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  };

  function buildClip(clip, pat) {
    const el = U.el('div', { class: 'clip', dataset: { clip: clip.id } });
    const color = pat ? pat.color || '#33e0c8' : '#888';
    el.style.left = (clip.start * pxPerStep) + 'px';
    el.style.top = (clip.track * LANE_H + 2) + 'px';
    el.style.width = Math.max(10, clip.length * pxPerStep - 2) + 'px';
    el.style.height = (LANE_H - 4) + 'px';
    el.style.background = color + '26';
    el.style.borderColor = color + '88';
    el.append(U.el('div', { class: 'clip-name', style: 'background:' + color + 'cc;color:#06110e' }, pat ? pat.name : '?'));
    const mini = U.el('canvas', { class: 'clip-mini' });
    const w = Math.max(10, clip.length * pxPerStep - 2), h = LANE_H - 4 - 12;
    const dpr = window.devicePixelRatio || 1;
    mini.width = w * dpr; mini.height = h * dpr;
    mini.style.width = w + 'px'; mini.style.height = h + 'px';
    const mg = mini.getContext('2d');
    mg.scale(dpr, dpr);
    if (pat) {
      const srcLen = Math.min(pat.length, clip.length);
      mg.fillStyle = color;
      for (const n of pat.notes) {
        if (n.start >= srcLen) continue;
        const x = (n.start / srcLen) * w;
        const y = h - ((n.pitch - 36) / 48) * h;
        mg.fillRect(x, U.clamp(y, 0, h - 2), Math.max(2, (n.dur / srcLen) * w - 1), 2);
      }
      const steps = pat.steps || {};
      for (const k of Object.keys(steps)) {
        const arr = steps[k];
        for (let s = 0; s < Math.min(arr.length, srcLen); s++) {
          if (!arr[s]) continue;
          const x = (s / srcLen) * w;
          mg.fillRect(x, h - 3, Math.max(2, w / srcLen - 1), 2.5);
        }
      }
    }
    el.append(mini);
    if (app.project._selectedClip === clip.id) el.classList.add('sel');

    /* --- interactions ---
     * gesture state lives on this element; move/up attach to DOCUMENT so the
     * drag survives PL.render() replacing the element mid-gesture.
     */
    let gesture = null;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      app.commit('move clip');
      app.project._selectedClip = clip.id;
      const rect = el.getBoundingClientRect();
      const edgeZone = e.clientX > rect.right - 8;
      gesture = {
        mode: edgeZone ? 'resize' : (e.ctrlKey || e.altKey ? 'dup' : 'move'),
        startX: e.clientX, startY: e.clientY,
        origStart: clip.start, origTrack: clip.track, origLen: clip.length,
        liveEl: el,
      };
      if (gesture.mode === 'dup') {
        // duplicate immediately, then drag the copy
        const copy = JSON.parse(JSON.stringify(clip));
        copy.id = P9.uid('clip');
        app.project.clips.push(copy);
        gesture.target = copy;
      } else {
        gesture.target = clip;
      }
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    document.addEventListener('pointermove', e => {
      if (!gesture) return;
      const t = gesture.target;
      const dSteps = (e.clientX - gesture.startX) / pxPerStep;
      if (gesture.mode === 'resize') {
        t.length = U.clamp(Math.round((gesture.origLen + dSteps) / 4) * 4, 4, 1024);
      } else {
        t.start = Math.max(0, gesture.origStart + dSteps);
        const dLanes = Math.round((e.clientY - gesture.startY) / LANE_H);
        t.track = U.clamp(gesture.origTrack + dLanes, 0, app.project.tracks - 1);
      }
      // update whichever element is currently in the DOM for this clip id
      const live = document.querySelector('[data-clip="' + t.id + '"]') || gesture.liveEl;
      if (live) {
        live.style.left = (t.start * pxPerStep) + 'px';
        live.style.top = (t.track * LANE_H + 2) + 'px';
        live.style.width = Math.max(10, t.length * pxPerStep - 2) + 'px';
      }
    });
    document.addEventListener('pointerup', () => {
      if (!gesture) return;
      const t = gesture.target;
      if (gesture.mode !== 'resize') t.start = Math.max(0, Math.round(t.start / 4) * 4);
      gesture = null;
      app.autosave();
      PL.render();
    });
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      app.commit('delete clip');
      app.project.clips = app.project.clips.filter(c => c.id !== clip.id);
      PL.render();
    });
    return el;
  }

  /** Click empty lane space = paint a clip of the selected pattern. */
  PL.installPaintHandler = function () {
    if (paintInstalled) return;
    paintInstalled = true;
    PL.ensureSkeleton();
    const host = document.getElementById('pl-lanes');
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('.clip')) return;
      if (e.button !== 0) return;
      const innerRect = host.getBoundingClientRect();
      const scrollX = host.scrollLeft, scrollY = host.scrollTop;
      const x = e.clientX - innerRect.left + scrollX;
      const y = e.clientY - innerRect.top + scrollY;
      const step = Math.floor(x / pxPerStep / 4) * 4;   // snap to bar-beat (4 steps)
      const track = U.clamp(Math.floor(y / LANE_H), 0, app.project.tracks - 1);
      const patSel = document.getElementById('pl-clip-pat').value;
      if (!patSel) { U.toast('Select a pattern to paint first', 'err'); return; }
      const pat = app.project.patterns.find(p => p.id === patSel);
      if (!pat) return;
      app.commit('paint clip');
      const clip = P9.newClip(pat.id, step, track, pat.length);
      app.project.clips.push(clip);
      app.project._selectedClip = clip.id;
      app.autosave();
      PL.render();
    });
    host.addEventListener('contextmenu', e => {
      if (e.target.closest('.clip')) return;
      e.preventDefault();
    });
  };

  PL.syncPaintSelect = function () {
    const sel = document.getElementById('pl-clip-pat');
    sel.innerHTML = '';
    for (const p of app.project.patterns) {
      const o = U.el('option', { value: p.id }, p.name);
      if (p.id === app.project.currentPatternId || p.id === app.paintPatternId) o.selected = true;
      sel.append(o);
    }
    if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
  };

  /* ---- playhead overlay ---- */
  let phEl = null;
  PL.ensurePlayhead = function () {
    if (phEl) return phEl;
    phEl = U.el('div', {
      style: 'position:absolute;top:0;bottom:0;width:2px;background:#ffd76a;z-index:20;pointer-events:none;box-shadow:0 0 6px #ffd76a88;left:-999px',
    });
    document.getElementById('pl-lanes').append(phEl);
    return phEl;
  };
  PL.updatePlayhead = function (stepFloat) {
    app.playheadStep = stepFloat;
    const host = document.getElementById('pl-lanes');
    if (!host.firstChild) return;
    const ph = PL.ensurePlayhead();
    ph.style.left = (stepFloat * pxPerStep) + 'px';
  };

  PL.clearAll = function () {
    app.commit('clear playlist');
    app.project.clips.length = 0;
    app.project._selectedClip = null;
    PL.render();
  };
})();
