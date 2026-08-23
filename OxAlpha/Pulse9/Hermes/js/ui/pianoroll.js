/* PULSE-9 UI: Piano roll
 * Conventional orientation: higher pitches drawn HIGHER (row 0 at top = highest pitch).
 * Left-drag empty = place note (then drag to move). Left-drag note = move.
 * Drag near right edge = resize. Right-click note = delete. Alt+vertical drag on note = velocity.
 * Wheel = vertical scroll (natural). Shift+wheel = horizontal. Ctrl+wheel = zoom time.
 */
'use strict';
(function () {
  const U = window.P9UI;
  const PR = window.P9PianoRoll = {};
  let app = null;

  const KEY_H = 14;
  const TOP_PITCH = 107; // B7
  const BOT_PITCH = 24;  // C1
  const N_PITCH = TOP_PITCH - BOT_PITCH + 1;
  let pxPerStep = 26;

  PR.init = function (a) { app = a; };
  Object.defineProperty(PR, '_pxPerStep', { get: () => pxPerStep });

  PR.setZoom = function (factor, centerStep) {
    const old = pxPerStep;
    pxPerStep = U.clamp(pxPerStep * factor, 6, 120);
    if (old !== pxPerStep) PR.render(centerStep);
  };

  PR.snapSteps = function () {
    const sel = document.getElementById('pr-snap');
    const v = parseFloat(sel.value);
    return isNaN(v) ? 0 : v;
  };

  PR.currentPattern = () => app.project.patterns[app.project.currentPattern];

  PR.render = function (keepStepAtCenter) {
    const proj = app.project;
    const pat = PR.currentPattern();
    const body = document.getElementById('piano-body');
    const scroll = document.getElementById('pr-scroll');
    const inner = document.getElementById('pr-inner');
    const keysEl = document.getElementById('pr-keys');
    const cv = document.getElementById('pr-canvas');
    if (!inner) { buildSkeleton(body); }
    document.getElementById('pr-channel-lbl').textContent =
      '· ' + (app.project.channels.find(c => c.id === app.selectedChannelId) || { name: 'none' }).name +
      ' · pat ' + ((proj.currentPattern || 0) + 1);

    const len = pat ? Math.max(pat.length, 16) : 16;
    const W = len * pxPerStep;
    const H = N_PITCH * KEY_H;
    const dpr = window.devicePixelRatio || 1;

    // preserve scroll position across rerenders
    const prevScroll = scroll ? { l: scroll.scrollLeft, t: scroll.scrollTop } : null;
    if (keepStepAtCenter != null && scroll) {
      prevScroll.l = U.clamp(keepStepAtCenter * pxPerStep - scroll.clientWidth / 2, 0, W);
    }

    inner.style.width = W + 'px';
    inner.style.height = H + 'px';
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* --- pitch rows --- */
    for (let i = 0; i < N_PITCH; i++) {
      const pitch = TOP_PITCH - i;
      const y = i * KEY_H;
      const black = P9.isBlackKey(pitch);
      g.fillStyle = black ? '#12151e' : '#181d29';
      g.fillRect(0, y, W, KEY_H);
      g.strokeStyle = '#0c0f16';
      g.beginPath(); g.moveTo(0, y + KEY_H - 0.5); g.lineTo(W, y + KEY_H - 0.5); g.stroke();
      if (pitch % 12 === 0) { // C lines
        g.strokeStyle = 'rgba(51,224,200,0.25)';
        g.beginPath(); g.moveTo(0, y + KEY_H - 0.5); g.lineTo(W, y + KEY_H - 0.5); g.stroke();
      }
    }

    /* --- time grid --- */
    const beatW = pxPerStep * 4;
    for (let s = 0; s <= len; s++) {
      const x = s * pxPerStep;
      let color = null, w = 1;
      if (s % 16 === 0) { color = '#39445f'; w = 2; }
      else if (s % 4 === 0) { color = '#27304a'; }
      else if (pxPerStep > 14) { color = '#1b2133'; }
      if (color) {
        g.strokeStyle = color; g.lineWidth = w;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
    }

    /* --- notes --- */
    if (pat) {
      const colOf = new Map(proj.channels.map(c => [c.id, c.color || '#33e0c8']));
      for (const n of pat.notes) {
        const isDrumCh = false;
        const row = TOP_PITCH - n.pitch;
        const x = n.start * pxPerStep;
        const y = row * KEY_H;
        const w = Math.max(4, n.dur * pxPerStep - 1);
        const h = KEY_H - 2;
        const base = colOf.get(n.ch) || '#33e0c8';
        const selected = app.project._selNotes && app.project._selNotes.has(n.id);
        g.globalAlpha = 0.35 + 0.65 * U.clamp(n.vel, 0, 1);
        g.fillStyle = selected ? '#ffffff' : base;
        g.fillRect(x, y + 1, w, h);
        g.globalAlpha = 1;
        g.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,0.55)';
        g.strokeRect(x + 0.5, y + 1.5, w - 1, h - 1);
        // velocity lip at left edge
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(x + 1, y + 1 + h * (1 - U.clamp(n.vel, 0, 1)), 2, h * U.clamp(n.vel, 0, 1));
      }
    }

    /* --- keyboard column --- */
    keysEl.innerHTML = '';
    keysEl.style.height = H + 'px';
    for (let i = 0; i < N_PITCH; i++) {
      const pitch = TOP_PITCH - i;
      const black = P9.isBlackKey(pitch);
      const k = U.el('div', {
        class: 'pr-key ' + (black ? 'black' : 'white') + (pitch % 12 === 0 ? ' c4line' : ''),
        dataset: { pitch: String(pitch) },
      });
      k.style.top = (i * KEY_H) + 'px';
      k.style.height = KEY_H + 'px';
      k.textContent = (pitch % 12 === 0) ? P9.midiToName(pitch) : '';
      k.addEventListener('pointerdown', e => {
        e.preventDefault();
        app.previewNote(app.selectedChannelId, pitch);
        k.classList.add('pressed');
        setTimeout(() => k.classList.remove('pressed'), 180);
      });
      keysEl.append(k);
    }

    if (prevScroll && scroll) { scroll.scrollLeft = prevScroll.l; scroll.scrollTop = prevScroll.t; }
    PR.updatePlayhead(app.playheadStep != null ? app.playheadStep : 0);
  };

  function buildSkeleton(body) {
    body.innerHTML = `
      <div class="pr-wrap">
        <div class="pr-keys" id="pr-keys"></div>
        <div class="pr-scroll" id="pr-scroll">
          <div class="pr-inner" id="pr-inner"><canvas id="pr-canvas" class="pr-canvas"></canvas></div>
        </div>
      </div>`;
    installCanvasHandlers();
  }
  PR.ensureSkeleton = function () {
    if (!document.getElementById('pr-inner')) buildSkeleton(document.getElementById('piano-body'));
  };

  /* ---------------- interaction ---------------- */
  function evtPos(e) {
    const scroll = document.getElementById('pr-scroll');
    const rect = document.getElementById('pr-canvas').getBoundingClientRect();
    return {
      step: (e.clientX - rect.left) / pxPerStep,
      rowF: (e.clientY - rect.top) / KEY_H,
      pitch: TOP_PITCH - Math.floor((e.clientY - rect.top) / KEY_H),
    };
  }

  function hitNote(pat, pos) {
    if (!pat) return null;
    // topmost (latest in array) wins
    for (let i = pat.notes.length - 1; i >= 0; i--) {
      const n = pat.notes[i];
      if (pos.pitch !== n.pitch) continue;
      if (pos.step >= n.start && pos.step <= n.start + n.dur) return n;
    }
    return null;
  }

  function installCanvasHandlers() {
    const cv = document.getElementById('pr-canvas');
    const scroll = document.getElementById('pr-scroll');

    let gest = null;
    cv.addEventListener('pointerdown', e => {
      PR.ensureSkeleton();
      const proj = app.project;
      const pat = PR.currentPattern();
      if (!pat) { U.toast('Create a pattern first', 'err'); return; }
      const pos = evtPos(e);
      const hit = hitNote(pat, pos);
      const snap = PR.snapSteps();
      const q = v => snap > 0 ? Math.round(v / snap) * snap : v;

      app.commit('edit notes');
      if (!app.project._selNotes) app.project._selNotes = new Set();

      if (e.button === 2) { // delete
        if (hit) {
          pat.notes = pat.notes.filter(n => n !== hit);
          app.project._selNotes.delete(hit.id);
          PR.render();
        }
        return;
      }
      if (e.button !== 0) return;

      if (hit) {
        const rect = cv.getBoundingClientRect();
        const nearRight = (hit.start + hit.dur) * pxPerStep - (e.clientX - rect.left) < 8 && pxPerStep > 10;
        app.selectChannelForNote(hit.ch);
        gest = {
          mode: nearRight ? 'resize' : (e.altKey ? 'vel' : 'move'),
          note: hit,
          grabOff: pos.step - hit.start,
          origStart: hit.start, origPitch: hit.pitch, origDur: hit.dur, origVel: hit.vel,
          lastPitch: hit.pitch,
        };
        if (!e.ctrlKey && !e.shiftKey) { app.project._selNotes.clear(); app.project._selNotes.add(hit.id); }
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      } else {
        // place new note on the SELECTED channel
        const chId = app.selectedChannelId || (proj.channels[0] && proj.channels[0].id);
        if (!chId) { U.toast('Add an instrument first (+ ADD)', 'err'); return; }
        const start = Math.max(0, q(pos.step));
        if (start >= pat.length) return;
        const note = { id: P9.uid('n'), ch: chId, start, dur: snap > 0 ? snap : 1, pitch: pos.pitch, vel: 0.85 };
        pat.notes.push(note);
        app.project._selNotes.clear();
        app.project._selNotes.add(note.id);
        app.previewNote(chId, pos.pitch);
        gest = { mode: e.altKey ? 'vel' : 'move', note, grabOff: pos.step - note.start, origStart: start, origPitch: pos.pitch, origDur: note.dur, origVel: note.vel, lastPitch: pos.pitch, isNew: true };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      }
      PR.render();
      e.preventDefault();
    });

    cv.addEventListener('pointermove', e => {
      // hover cursor hint
      const pat = PR.currentPattern();
      if (!gest) {
        const pos = evtPos(e);
        const hit = hitNote(pat, pos);
        const rect = cv.getBoundingClientRect();
        const nearRight = hit && (hit.start + hit.dur) * pxPerStep - (e.clientX - rect.left) < 8;
        cv.style.cursor = nearRight ? 'ew-resize' : hit ? 'grab' : 'crosshair';
        return;
      }
      const pos = evtPos(e);
      const snap = PR.snapSteps();
      const q = v => snap > 0 ? Math.round(v / snap) * snap : v;
      const n = gest.note;
      if (gest.mode === 'move') {
        let ns = Math.max(0, q(pos.step - gest.grabOff));
        if (ns !== gest.origStart && snap > 0) { /* moved */ }
        n.start = ns;
        const np = U.clamp(pos.pitch, BOT_PITCH, TOP_PITCH);
        if (np !== n.pitch) {
          n.pitch = np;
          if (np !== gest.lastPitch) { app.previewNote(n.ch, np, 0.05); gest.lastPitch = np; }
        }
      } else if (gest.mode === 'resize') {
        n.dur = Math.max(snap > 0 ? snap : 0.25, q(pos.step - n.start) || (snap || 0.25));
      } else if (gest.mode === 'vel') {
        // vertical drag adjusts velocity: UP increases
        n.vel = U.clamp(gest.origVel + (gest.origPitch === n.pitch ? (gest.lastPitch - pos.pitch) * 0 : 0) + (gest.velBase != null ? gest.velBase : (gest.velBase = gest.origVel)) + (e.movementY != null ? -(e.movementY) * 0.01 : 0), 0.05, 1);
      }
      PR.render();
    });

    const endGest = () => {
      if (gest) {
        if (gest.isNew && gest.note.dur === 0) gest.note.dur = 1;
        gest = null;
        app.autosave();
        PR.render();
      }
    };
    cv.addEventListener('pointerup', endGest);
    cv.addEventListener('pointercancel', endGest);
    cv.addEventListener('contextmenu', e => e.preventDefault());

    // wheel: vertical natural, shift horizontal, ctrl zoom
    // (explicit scrollTop/Left: synthetic WheelEvents do not trigger default scrolling)
    scroll.addEventListener('wheel', e => {
      if (e.ctrlKey) {
        e.preventDefault();
        PR.setZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      } else if (e.shiftKey) {
        e.preventDefault();
        scroll.scrollLeft += (e.deltaY !== 0 ? e.deltaY : e.deltaX);
      } else {
        scroll.scrollTop += e.deltaY;
      }
    }, { passive: false });
  }

  /* ---- playhead ---- */
  let phEl = null;
  PR.updatePlayhead = function (stepFloat) {
    app.playheadStep = stepFloat;
    const inner = document.getElementById('pr-inner');
    if (!inner) return;
    if (!phEl) {
      phEl = U.el('div', { style: 'position:absolute;top:0;bottom:0;width:2px;background:#ffd76a;z-index:20;pointer-events:none;box-shadow:0 0 6px #ffd76a88;left:-999px' });
      inner.append(phEl);
    }
    phEl.style.left = (stepFloat * pxPerStep) + 'px';
  };

  PR.clearNotes = function () {
    const pat = PR.currentPattern();
    if (!pat) return;
    app.commit('clear notes');
    pat.notes.length = 0;
    app.autosave();
    PR.render();
  };
})();
