/* ============================================================
   Nyx DAW — piano roll (canvas)
   Conventional orientation: higher pitches drawn HIGHER.
   Interactions: paint/move/resize/velocity/marquee/snap/zoom/scroll.
   ============================================================ */
(function () {
  'use strict';
  const UI = window.NyxUI;
  const el = UI.el;

  const KEYS_W = 64;
  const KEY_H = 14;
  const TOP_PITCH = 107, BOT_PITCH = 24;
  const N_ROWS = TOP_PITCH - BOT_PITCH + 1;
  const BLACK = [1, 3, 6, 8, 10];

  let cv, kcv, ctx, kctx;
  let pxPerStep = 26;
  let scrollX = 0, scrollY = Math.max(0, (N_ROWS * KEY_H - 420)) ; // start near middle-high
  let hover = null;          // {key, step}
  let dragMode = null;       // 'paint'|'move'|'resize'|'velocity'|'marquee'
  let dragData = null;
  let marquee = null;
  let notesVersion = 0;
  let gridCache = null;      // offscreen canvas + key

  function snapValue() {
    const s = document.getElementById('prSnap');
    return s ? parseFloat(s.value) : 1;
  }
  function snapFloor(v) { const g = snapValue(); return g > 0 ? Math.floor(v / g) * g : v; }
  function snapRound(v) { const g = snapValue(); return g > 0 ? Math.round(v / g) * g : v; }
  function snapCeil(v) { const g = snapValue(); return g > 0 ? Math.ceil(v / g) * g : v; }

  function curPat() { return UI.currentPattern(); }
  function curCh() { return UI.project.channels.find(c => c.id === UI.sel.channelId) || null; }
  function curNotes() {
    const p = curPat(), c = curCh();
    if (!p || !c) return [];
    return p.notes[c.id] || (p.notes[c.id] = []);
  }
  function ghostChannels() {
    const p = curPat(), c = curCh();
    if (!p) return [];
    return Object.keys(p.notes).filter(id => id !== UI.sel.channelId)
      .map(id => ({ ch: UI.project.channels.find(x => x.id === id), arr: p.notes[id] }))
      .filter(g => g.ch && g.ch.type === 'synth');
  }

  /* ---------------- coordinates ---------------- */
  function stepToX(s) { return Math.round(s * pxPerStep - scrollX); }
  function xToStep(x) { return (x + scrollX) / pxPerStep; }
  function pitchToY(k) { return Math.round((TOP_PITCH - k) * KEY_H - scrollY); }
  function yToPitch(y) { return TOP_PITCH - Math.floor((y + scrollY) / KEY_H); }

  function hitNote(mx, my) {
    const notes = curNotes();
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const x = stepToX(n.step), y = pitchToY(n.key);
      const w = Math.max(6, n.len * pxPerStep - 1);
      if (mx >= x && mx <= x + w && my >= y && my <= y + KEY_H - 1) return { n, idx: i, edge: mx > x + w - Math.min(7, w * 0.25) };
    }
    return null;
  }

  /* ---------------- rendering ---------------- */

  function ensureCanvas() {
    if (cv) return;
    cv = document.getElementById('prCanvas');
    kcv = document.getElementById('prKeys');
    ctx = cv.getContext('2d');
    kctx = kcv.getContext('2d');
    bindEvents();
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.parentElement.clientWidth - KEYS_W - 2;
    const h = cv.parentElement.clientHeight - 26;
    if (w <= 0 || h <= 0) return;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      kcv.width = KEYS_W * dpr; kcv.height = h * dpr;
      kcv.style.width = KEYS_W + 'px'; kcv.style.height = h + 'px';
      gridCache = null;
    }
  }

  function gridSizeKey() {
    const dpr = window.devicePixelRatio || 1;
    return [cv.width, cv.height, pxPerStep, scrollX | 0, scrollY | 0, notesVersion, dpr].join('|');
  }

  function buildGridLayer(dpr, w, h) {
    const g = document.createElement('canvas');
    g.width = cv.width; g.height = cv.height;
    const gc = g.getContext('2d');
    gc.setTransform(dpr, 0, 0, dpr, 0, 0);
    // rows
    for (let k = BOT_PITCH; k <= TOP_PITCH; k++) {
      const y = pitchToY(k);
      if (y > h || y + KEY_H < 0) continue;
      const pc = ((k % 12) + 12) % 12;
      const isBlack = BLACK.indexOf(pc) >= 0;
      gc.fillStyle = isBlack ? '#171b26' : '#1e2330';
      gc.fillRect(0, y, w, KEY_H);
      if (pc === 0) { gc.fillStyle = 'rgba(120,150,255,0.10)'; gc.fillRect(0, y, w, KEY_H); }
    }
    // vertical lines: beat + bar
    const firstStep = Math.floor(scrollX / pxPerStep);
    const lastStep = Math.ceil((scrollX + w) / pxPerStep);
    for (let s = firstStep; s <= lastStep; s++) {
      if (s % 4 !== 0 && s % 16 !== 0) continue;
      const x = stepToX(s);
      gc.fillStyle = s % 16 === 0 ? 'rgba(140,160,200,0.35)' : 'rgba(140,160,200,0.13)';
      gc.fillRect(x, 0, 1, h);
    }
    // horizontal separators subtle
    gc.fillStyle = 'rgba(0,0,0,0.18)';
    for (let k = BOT_PITCH; k <= TOP_PITCH; k++) {
      const y = pitchToY(k) + KEY_H - 1;
      if (y > 0 && y < h) gc.fillRect(0, y, w, 1);
    }
    return g;
  }

  function draw() {
    ensureCanvas();
    resize();
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    const proj = UI.project;
    // clamp scroll into valid range (viewport may differ from initial estimate)
    scrollY = UI.clamp(scrollY, 0, Math.max(0, N_ROWS * KEY_H - h));
    scrollX = Math.max(0, scrollX);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pat = curPat();
    if (!pat) {
      ctx.fillStyle = '#667'; ctx.font = '13px system-ui';
      ctx.fillText('No pattern. Create one with "+ Pattern".', 20, 40);
      drawKeys(dpr, h);
      return;
    }

    const key = gridSizeKey();
    if (!gridCache || gridCache.key !== key) gridCache = { key, img: buildGridLayer(dpr, w, h) };
    ctx.drawImage(gridCache.img, 0, 0, w, h);

    // ghosts (other synth channels, dim)
    ctx.globalAlpha = 0.22;
    for (const g of ghostChannels()) {
      for (const n of g.arr) {
        const x = stepToX(n.step), y = pitchToY(n.key);
        if (x > w || x + n.len * pxPerStep < 0 || y > h || y + KEY_H < 0) continue;
        ctx.fillStyle = g.ch.color;
        ctx.fillRect(x + 1, y + 1, Math.max(5, n.len * pxPerStep - 2), KEY_H - 2);
      }
    }
    ctx.globalAlpha = 1;

    // notes
    const ch = curCh();
    const notes = curNotes();
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const x = stepToX(n.step), y = pitchToY(n.key);
      const nw = Math.max(6, n.len * pxPerStep - 1);
      if (x > w || x + nw < 0 || y > h || y + KEY_H < 0) continue;
      const sel = UI.sel.notes.has(noteId(i));
      ctx.fillStyle = ch ? ch.color : '#5aa2ff';
      // velocity shading: darker = quieter
      ctx.globalAlpha = 0.55 + 0.45 * n.vel;
      ctx.fillRect(x + 1, y + 1, nw - 1, KEY_H - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = sel ? 1.6 : 1;
      ctx.strokeRect(x + 1.5, y + 1.5, nw - 2, KEY_H - 3);
      if (nw > 34 && KEY_H >= 12) {
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(noteName(n.key), x + 4, y + KEY_H - 4);
      }
    }

    // marquee
    if (marquee) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(122,162,255,0.08)';
      ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
    }

    // hover ghost note preview
    if (hover && !dragMode && !hitNote(hover.mx, hover.my)) {
      const s = snapFloor(hover.step);
      const x = stepToX(s), y = pitchToY(hover.key);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.strokeRect(x + 1.5, y + 1.5, UI.pr.lastLen * pxPerStep - 2, KEY_H - 3);
    }

    drawPlayhead(ctx, w, h);
    drawKeys(dpr, h);
    drawHScroll(w, h);
  }
  UI.drawPiano = draw;

  function noteName(k) {
    const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return NN[((k % 12) + 12) % 12] + (Math.floor(k / 12) - 1);
  }

  function drawKeys(dpr, h) {
    kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    kctx.clearRect(0, 0, KEYS_W, h);
    for (let k = BOT_PITCH; k <= TOP_PITCH; k++) {
      const y = pitchToY(k);
      if (y > h || y + KEY_H < 0) continue;
      const pc = ((k % 12) + 12) % 12;
      const isBlack = BLACK.indexOf(pc) >= 0;
      kctx.fillStyle = isBlack ? '#2e3648' : '#d7deeb';
      kctx.fillRect(0, y, KEYS_W - 4, KEY_H - 1);
      if (isBlack) { kctx.strokeStyle = '#4a5670'; kctx.strokeRect(0.5, y + 0.5, KEYS_W - 5, KEY_H - 2); }
      if (pc === 0) {
        kctx.fillStyle = '#20242f';
        kctx.font = '9px ui-monospace, monospace';
        kctx.fillText('C' + (Math.floor(k / 12) - 1), KEYS_W - 22, y + KEY_H - 4);
      }
    }
    kctx.fillStyle = '#0d1017';
    kctx.fillRect(KEYS_W - 3, 0, 3, h);
  }

  function drawPlayhead(ctx, w, h) {
    if (!UI.playing) return;
    const pat = curPat(); if (!pat) return;
    const pos = Math.max(0, UI.engine.currentPosition());
    const local = pos % pat.length;
    const x = stepToX(local);
    if (x < -2 || x > w + 2) return;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x, 0, 1.5, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - 14, 0, 14, h);
  }

  function drawHScroll(w, h) {
    const pat = curPat(); if (!pat) return;
    const totalW = pat.length * pxPerStep;
    if (totalW <= w) { scrollX = Math.max(0, Math.min(scrollX, 0)); return; }
    const barY = h - 8;
    ctx.fillStyle = '#12151d';
    ctx.fillRect(0, barY, w, 8);
    ctx.fillStyle = '#39415a';
    const bx = (-scrollX / totalW) * w, bw = (w / totalW) * w;
    ctx.fillRect(Math.max(0, bx), barY, Math.min(bw, w), 8);
  }

  UI.drawPianoPlayheadOnly = function () { /* full redraw is cheap enough with cached grid */ draw(); };

  /* ---------------- selection helpers ---------------- */

  function noteId(idx) { return 'n' + idx; }
  function rebuildSelectionAfterEdit(fn) {
    // run fn which mutates notes; selection uses indices so we simply clear stale entries after structural ops
    fn();
    notesVersion++;
    UI.mark('rack'); UI.mark('playlist');
  }

  UI.selectAllNotes = function () {
    UI.sel.notes.clear();
    curNotes().forEach((n, i) => UI.sel.notes.add(noteId(i)));
    UI.mark('piano');
  };

  UI.deleteSelection = function () {
    // notes take priority if any selected, else clips
    if (UI.view === 'piano' && UI.sel.notes.size) {
      const notes = curNotes();
      const keep = notes.filter((n, i) => !UI.sel.notes.has(noteId(i)));
      if (keep.length !== notes.length) {
        const p = curPat(), c = UI.sel.channelId;
        p.notes[c] = keep;
        UI.sel.notes.clear();
        rebuildSelectionAfterEdit(() => {});
        UI.commit('delete notes');
        UI.toast('Deleted notes');
      }
      return;
    }
    if (UI.sel.clips.size && UI.deleteSelectedClips) { UI.deleteSelectedClips(); }
  };

  UI.copySelection = function () {
    if (UI.view !== 'piano') return;
    const notes = curNotes().filter((n, i) => UI.sel.notes.has(noteId(i)));
    if (!notes.length) return;
    const minStep = Math.min(...notes.map(n => n.step));
    UI.clipboardNotes = notes.map(n => ({ key: n.key, step: n.step - minStep, len: n.len, vel: n.vel }));
    UI.toast('Copied ' + notes.length + ' note(s)');
  };

  UI.pasteClipboard = function () {
    if (UI.view !== 'piano' || !UI.clipboardNotes) return;
    const notes = curNotes();
    const base = snapFloor(Math.max(0, xToStep(0) + 4));
    const pasted = UI.clipboardNotes.map(cn => ({ key: cn.key, step: cn.step + base, len: cn.len, vel: cn.vel }));
    notes.push(...pasted);
    UI.sel.notes.clear();
    for (let i = notes.length - pasted.length; i < notes.length; i++) UI.sel.notes.add(noteId(i));
    rebuildSelectionAfterEdit(() => {});
    UI.commit('paste notes');
    UI.toast('Pasted ' + pasted.length + ' note(s)');
  };

  UI.nudgeSelection = function (dir) {
    const notes = curNotes();
    if (!UI.sel.notes.size) return;
    const targets = notes.filter((n, i) => UI.sel.notes.has(noteId(i)));
    if (!targets.length) return;
    for (const n of targets) {
      if (dir === 'left') n.step = Math.max(0, n.step - (snapValue() || 1));
      if (dir === 'right') n.step = n.step + (snapValue() || 1);
      if (dir === 'up') n.key = Math.min(TOP_PITCH, n.key + 1);
      if (dir === 'down') n.key = Math.max(BOT_PITCH, n.key - 1);
    }
    rebuildSelectionAfterEdit(() => {});
    UI.commit('nudge');
  };

  /* ---------------- events ---------------- */

  function bindEvents() {
    cv.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      const r = cv.getBoundingClientRect();
      const hit = hitNote(ev.clientX - r.left, ev.clientY - r.top);
      if (hit) {
        curNotes().splice(hit.idx, 1);
        UI.sel.notes.clear();
        rebuildSelectionAfterEdit(() => {});
        UI.commit('delete note');
      }
    });

    cv.addEventListener('pointerdown', function (ev) {
      const r = cv.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const stepPos = xToStep(mx), key = UI.clamp(yToPitch(my), BOT_PITCH, TOP_PITCH);
      const hit = hitNote(mx, my);

      if (ev.button === 2) return;

      if (hit && ev.altKey) {
        // velocity drag: UP increases
        dragMode = 'velocity'; dragData = { startY: ev.clientY, startVels: collectVels(hit) };
      } else if (hit && hit.edge) {
        dragMode = 'resize'; dragData = { startX: ev.clientX, startLen: hit.n.len, ids: idsFor(hit.n) };
      } else if (hit) {
        // select / move
        if (!UI.sel.notes.has(noteId(hit.idx))) {
          if (!ev.shiftKey) UI.sel.notes.clear();
          UI.sel.notes.add(noteId(hit.idx));
          UI.mark('piano');
        } else if (ev.shiftKey) {
          UI.sel.notes.delete(noteId(hit.idx)); UI.mark('piano'); return;
        }
        dragMode = 'move';
        dragData = {
          startX: ev.clientX, startY: ev.clientY,
          orig: collectSelSnapshot(),
          grabStep: snapFloor(stepPos), grabKey: key,
          moved: false
        };
      } else if (ev.shiftKey) {
        dragMode = 'marquee';
        marquee = { x: mx, y: my, w: 0, h: 0 };
      } else {
        // paint new note
        const s = Math.max(0, snapFloor(stepPos));
        const notes = curNotes();
        const n = { key, step: s, len: Math.max(UI.pr.lastLen, 1), vel: 0.85 };
        notes.push(n);
        UI.sel.notes.clear();
        UI.sel.notes.add(noteId(notes.length - 1));
        dragMode = 'resizePaint';
        dragData = { startX: ev.clientX, note: n };
        rebuildSelectionAfterEdit(() => {});
        previewKey(key);
      }
      cv.setPointerCapture(ev.pointerId);
      UI.mark('piano');
      ev.preventDefault();
    });

    cv.addEventListener('pointermove', function (ev) {
      const r = cv.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      hover = { mx, my, step: xToStep(mx), key: yToPitch(my) };
      updateHint();

      if (!dragMode) { UI.mark('piano'); return; }
      const dx = ev.clientX - (dragData.startX || 0);

      if (dragMode === 'velocity') {
        const dy = dragData.startY - ev.clientY; // up positive
        applyVels(dragData.startVels, dy / 120);
      } else if (dragMode === 'resize' || dragMode === 'resizePaint') {
        const n = dragMode === 'resizePaint' ? dragData.note : findNoteByIds(dragData.ids);
        if (!n) return;
        const raw = xToStep(mx) - n.step;
        const nl = Math.max(1, snapCeil(raw));
        const delta = nl - n.len;
        if (delta !== 0) {
          n.len = nl;
          // extend whole selection proportionally? keep simple: resize only grabbed note unless multiple selected -> same delta
          if (dragMode === 'resize') {
            const others = collectSelSnapshot();
            others.forEach(o => { if (o.ref !== n) o.ref.len = Math.max(1, o.origLen + delta); });
          }
          notesVersion++;
          UI.mark('piano');
        }
      } else if (dragMode === 'move') {
        const dStepRaw = snapRound(xToStep(mx)) - dragData.grabStep;
        const dKey = hover.key - dragData.grabKey;   // mouse UP → hover.key grows → pitch grows (NOT inverted)
        if (dStepRaw !== 0 || dKey !== 0) dragData.moved = true;
        dragData.orig.forEach(o => {
          o.ref.step = Math.max(0, o.origStep + dStepRaw);
          o.ref.key = UI.clamp(o.origKey + dKey, BOT_PITCH, TOP_PITCH);
        });
        notesVersion++;
        UI.mark('piano');
      } else if (dragMode === 'marquee') {
        marquee.w = mx - marquee.x; marquee.h = my - marquee.y;
        UI.mark('piano');
      }
      if (dragMode !== 'move') ev.preventDefault();
    });

    cv.addEventListener('pointerup', function (ev) {
      if (dragMode === 'marquee' && marquee) {
        const x1 = Math.min(marquee.x, marquee.x + marquee.w), x2 = Math.max(marquee.x, marquee.x + marquee.w);
        const y1 = Math.min(marquee.y, marquee.y + marquee.h), y2 = Math.max(marquee.y, marquee.y + marquee.h);
        if (Math.abs(marquee.w) > 4 || Math.abs(marquee.h) > 4) {
          if (!shiftHeld(ev)) UI.sel.notes.clear();
          curNotes().forEach((n, i) => {
            const nx = stepToX(n.step), ny = pitchToY(n.key);
            const nx2 = nx + n.len * pxPerStep, ny2 = ny + KEY_H;
            if (nx2 >= x1 && nx <= x2 && ny2 >= y1 && ny <= y2) UI.sel.notes.add(noteId(i));
          });
        } else if (!shiftHeld(ev)) UI.sel.notes.clear();
        marquee = null;
      }
      if (dragMode === 'resizePaint') {
        UI.pr.lastLen = Math.max(1, dragData.note.len);
        UI.commit('add note');
      } else if (dragMode === 'resize') {
        UI.pr.lastLen = Math.max(1, findNoteByIds(dragData.ids) ? findNoteByIds(dragData.ids).len : UI.pr.lastLen);
        UI.commit('resize note');
      } else if (dragMode === 'move') {
        if (dragData.moved) UI.commit('move notes');
      } else if (dragMode === 'velocity') {
        UI.commit('velocity');
      }
      dragMode = null; dragData = null;
      UI.mark('piano');
    });

    cv.addEventListener('dblclick', function (ev) {
      const r = cv.getBoundingClientRect();
      const hit = hitNote(ev.clientX - r.left, ev.clientY - r.top);
      if (hit) {
        curNotes().splice(hit.idx, 1);
        UI.sel.notes.clear();
        rebuildSelectionAfterEdit(() => {});
        UI.commit('delete note');
      }
    });

    // wheel: vertical scroll natural; shift = horizontal; ctrl/cmd = zoom centered on cursor
    cv.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        const r = cv.getBoundingClientRect();
        const anchorStep = xToStep(ev.clientX - r.left);
        const factor = ev.deltaY < 0 ? 1.18 : 1 / 1.18;   // wheel up = zoom IN
        const old = pxPerStep;
        pxPerStep = UI.clamp(pxPerStep * factor, 6, 120);
        scrollX = Math.max(0, anchorStep * pxPerStep - (ev.clientX - r.left));
        if (old !== pxPerStep) gridCache = null;
      } else if (ev.shiftKey) {
        scrollX = Math.max(0, scrollX + ev.deltaY);
      } else {
        scrollY = UI.clamp(scrollY + ev.deltaY, 0, Math.max(0, N_ROWS * KEY_H - cv.clientHeight));
        scrollX = Math.max(0, scrollX + ev.deltaX);
      }
      gridCache = null;
      UI.mark('piano');
    }, { passive: false });

    function shiftHeld(ev) { return ev && ev.shiftKey; }
  }

  function collectSelSnapshot() {
    const out = [];
    curNotes().forEach((n, i) => {
      if (UI.sel.notes.has(noteId(i))) out.push({ ref: n, origStep: n.step, origKey: n.key, origLen: n.len });
    });
    return out;
  }
  function collectVels(hit) {
    const out = [];
    curNotes().forEach((n, i) => { if (UI.sel.notes.has(noteId(i)) || i === hit.idx) out.push({ ref: n, origVel: n.vel }); });
    return out;
  }
  function applyVels(snapshot, delta) {
    snapshot.forEach(o => { o.ref.vel = UI.clamp(o.origVel + delta, 0.05, 1); });
    notesVersion++; UI.mark('piano');
  }
  function idsFor(noteRef) {
    // stable-enough handle: direct reference kept in closure via array wrapper
    return { ref: noteRef };
  }
  function findNoteByIds(ids) {
    return ids && ids.ref && curNotes().indexOf(ids.ref) >= 0 ? ids.ref : null;
  }

  function previewKey(key) {
    try {
      const ch = curCh(); const e = UI.engine;
      if (!ch || ch.type !== 'synth') return;
      e.ensureContext();
      if (e.ctx.state === 'suspended') e.ctx.resume();
      e.triggerChannel(ch, key, e.ctx.currentTime + 0.02, 0.22, 0.85);
    } catch (err) {}
  }

  function updateHint() {
    const elh = document.getElementById('prHint');
    if (!elh || !hover) return;
    const pat = curPat();
    elh.textContent = pat
      ? noteName(hover.key) + '  ·  step ' + Math.max(0, Math.floor(hover.step)) + '  ·  snap ' + (snapValue() || 'off')
      : '';
  }

  /* ---------------- pattern toolbar ---------------- */

  function refreshPatternSel() {
    const selEl = document.getElementById('prPatternSel');
    selEl.innerHTML = '';
    UI.project.patterns.forEach(function (p, i) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = (i + 1) + '. ' + p.name;
      selEl.appendChild(o);
    });
    if (UI.sel.patternId) selEl.value = UI.sel.patternId;
    const lenInput = document.getElementById('prLength');
    const pat = curPat();
    lenInput.value = pat ? pat.length : 16;
  }
  UI.refreshPatternSel = refreshPatternSel;

  function wireToolbar() {
    document.getElementById('prPatternSel').addEventListener('change', function () {
      UI.sel.patternId = this.value;
      UI.sel.notes.clear();
      scrollX = 0;
      UI.mark('piano'); UI.mark('rack');
      refreshPatternSel();
    });
    document.getElementById('prAddPattern').addEventListener('click', function () {
      const NP = window.NyxProject;
      const p = NP.makePattern('Pattern ' + (UI.project.patterns.length + 1), 16);
      UI.project.patterns.push(p);
      UI.sel.patternId = p.id;
      UI.sel.notes.clear();
      scrollX = 0;
      UI.commit('new pattern');
      refreshPatternSel();
      UI.toast('Pattern created');
    });
    document.getElementById('prLength').addEventListener('change', function () {
      const pat = curPat(); if (!pat) return;
      pat.length = UI.clamp(parseInt(this.value, 10) || 16, 1, 256);
      this.value = pat.length;
      UI.commit('pattern length');
      UI.mark('piano'); UI.mark('rack'); UI.mark('playlist');
    });
    document.getElementById('zoomIn').addEventListener('click', function () { zoomCentered(1.25); });
    document.getElementById('zoomOut').addEventListener('click', function () { zoomCentered(1 / 1.25); });
    document.getElementById('prSnap').addEventListener('change', function () { UI.mark('piano'); });
  }

  function zoomCentered(factor) {
    const old = pxPerStep;
    pxPerStep = UI.clamp(pxPerStep * factor, 6, 120);
    const centerStep = (scrollX + cv.clientWidth / 2) / old;
    scrollX = Math.max(0, centerStep * pxPerStep - cv.clientWidth / 2);
    if (old !== pxPerStep) gridCache = null;
    UI.mark('piano');
  }

  /* ---------------- boot ---------------- */

  // test/debug hooks (harmless in production use)
  UI._prState = function () { return { pxPerStep, scrollX, scrollY, KEYS_W, KEY_H, TOP_PITCH, BOT_PITCH }; };
  UI._prCellCenter = function (step, key) {
    const r = cv.getBoundingClientRect();
    return { x: r.left + stepToX(step) + Math.max(6, UI.pr.lastLen * pxPerStep / 2), y: r.top + pitchToY(key) + KEY_H / 2 };
  };
  UI._prCanvasRect = function () { const r = cv.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  // exact viewport point on a note's RIGHT RESIZE EDGE (3px inside)
  UI._prCellRightEdge = function (noteRef) {
    const r = cv.getBoundingClientRect();
    const x = stepToX(noteRef.step) + Math.max(6, noteRef.len * pxPerStep - 1) - 3;
    return { x: r.left + x, y: r.top + pitchToY(noteRef.key) + KEY_H / 2 };
  };

  document.addEventListener('DOMContentLoaded', function () {
    wireToolbar();
    // redraw pattern selector whenever project structure may have changed
    const obs = setInterval(function () {
      if (!UI.project) return;
      const selEl = document.getElementById('prPatternSel');
      const want = UI.project.patterns.map(p => p.id).join(',');
      if (selEl.dataset.sig !== want) { selEl.dataset.sig = want; refreshPatternSel(); }
    }, 500);
  });

})();
