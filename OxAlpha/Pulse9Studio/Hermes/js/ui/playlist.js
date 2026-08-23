/* ============================================================
   Nyx DAW — playlist / arrangement (canvas)
   Clips: place (from pattern palette), drag (time+track), duplicate
   (alt-drag), resize right edge, delete. Playhead + loop region.
   ============================================================ */
(function () {
  'use strict';
  const UI = window.NyxUI;
  const el = UI.el;

  const HEAD_W = 110;
  const TRACK_H = 30;
  const PALETTE_W = 128;

  let cv, ctx;
  let pxPerStep = 7;              // zoomable
  let scrollX = 0, scrollY = 0;
  let dragMode = null, dragData = null;
  let hoverClipId = null;

  function curPat() { return UI.currentPattern(); }

  function ensureCanvas() {
    if (cv) return;
    cv = document.getElementById('plCanvas');
    ctx = cv.getContext('2d');
    bindEvents();
    resize();
    window.addEventListener('resize', resize);
  }

  function visibleTracks() {
    return UI.project.tracks;
  }

  function contentHeight() { return Math.max(4, visibleTracks().length) * TRACK_H; }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const host = cv.parentElement;
    const w = host.clientWidth - HEAD_W - 2;
    const h = host.clientHeight - 26;
    if (w <= 0 || h <= 0) return;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
    }
  }

  function stepToX(s) { return Math.round(s * pxPerStep - scrollX); }
  function xToStep(x) { return (x + scrollX) / pxPerStep; }
  function trackToY(t) { return t * TRACK_H - scrollY; }
  function yToTrack(y) { return Math.floor((y + scrollY) / TRACK_H); }

  function clipsOf(track) { return track.clips; }

  function clipAt(mx, my) {
    const t = yToTrack(my);
    const tracks = visibleTracks();
    if (t < 0 || t >= tracks.length) return null;
    const tr = tracks[t];
    for (let i = tr.clips.length - 1; i >= 0; i--) {
      const c = tr.clips[i];
      const x = stepToX(c.start), w = Math.max(8, c.length * pxPerStep);
      if (mx >= x && mx <= x + w && my >= trackToY(t) && my <= trackToY(t) + TRACK_H - 2) {
        return { clip: c, track: tr, edge: mx > x + w - Math.min(9, w * 0.2), idx: i };
      }
    }
    return null;
  }

  /* ---------------- render ---------------- */

  function draw() {
    ensureCanvas();
    resize();
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const proj = UI.project;
    const totalW = proj.songLength * pxPerStep;
    // clamp scroll
    scrollX = UI.clamp(scrollX, 0, Math.max(0, totalW - w + 40));
    scrollY = UI.clamp(scrollY, 0, Math.max(0, contentHeight() - h + 40));

    // track rows
    const tracks = visibleTracks();
    for (let t = 0; t < tracks.length; t++) {
      const y = trackToY(t);
      if (y > h || y + TRACK_H < 0) continue;
      ctx.fillStyle = t % 2 ? 'rgba(255,255,255,0.02)' : 'transparent';
      ctx.fillRect(0, y, w, TRACK_H);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y + TRACK_H - 1, w, 1);
    }

    // bar grid
    const firstStep = Math.floor(scrollX / pxPerStep / 4) * 4;
    const lastStep = Math.ceil((scrollX + w) / pxPerStep);
    for (let s = firstStep; s <= lastStep; s += 4) {
      const x = stepToX(s);
      if (x < -1) continue;
      const isBar = s % 16 === 0;
      ctx.fillStyle = isBar ? 'rgba(150,170,210,0.22)' : 'rgba(150,170,210,0.07)';
      ctx.fillRect(x, 0, 1, h);
      if (isBar && pxPerStep > 3.5) {
        ctx.fillStyle = '#6b7690';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(String(Math.floor(s / 16) + 1), x + 3, 10);
      }
    }

    // clips
    for (const tr of tracks) {
      const t = tracks.indexOf(tr);
      for (const c of tr.clips) {
        const pat = proj.patterns.find(p => p.id === c.patternId);
        if (!pat) continue;
        const x = stepToX(c.start), cw = Math.max(8, c.length * pxPerStep);
        const y = trackToY(t);
        if (x > w || x + cw < 0 || y > h || y + TRACK_H < 0) continue;
        const sel = UI.sel.clips.has(c.id);

        ctx.fillStyle = pat.color;
        ctx.globalAlpha = sel ? 1 : 0.82;
        ctx.fillRect(x + 1, y + 1, cw - 2, TRACK_H - 4);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.55)';
        ctx.lineWidth = sel ? 1.6 : 1;
        ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, TRACK_H - 5);

        // mini note preview inside clip
        if (cw > 26) {
          const notes = [];
          for (const k in pat.notes) notes.push(...pat.notes[k]);
          if (notes.length) {
            let lo = 127, hi = 0, maxS = 1;
            for (const n of notes) { if (n.key < lo) lo = n.key; if (n.key > hi) hi = n.key; if (n.step + n.len > maxS) maxS = n.step + n.len; }
            const range = Math.max(12, hi - lo);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            for (const n of notes.slice(0, 400)) {
              const nx = x + 2 + (n.step / Math.max(maxS, c.length)) * (cw - 5);
              const nw = Math.max(1.5, (n.len / Math.max(maxS, c.length)) * (cw - 5));
              const ny = y + 3 + (1 - (n.key - lo) / range) * (TRACK_H - 10);
              ctx.fillRect(nx, ny, nw, 1.6);
            }
          }
        }
        if (cw > 40) {
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.font = '9px system-ui';
          ctx.fillText(pat.name, x + 4, y + TRACK_H - 5);
        }
      }
    }

    // hover outline
    if (hoverClipId && !dragMode) {
      for (const tr of tracks) {
        const c = tr.clips.find(cc => cc.id === hoverClipId);
        if (c) {
          const t = tracks.indexOf(tr);
          const x = stepToX(c.start), cw = Math.max(8, c.length * pxPerStep), y = trackToY(t);
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.strokeRect(x + 0.5, y + 0.5, cw, TRACK_H - 3);
        }
      }
    }

    // loop region
    if (UI.engine.loop) {
      const lx1 = stepToX(UI.engine.loopStart), lx2 = stepToX(UI.engine.loopEnd);
      ctx.fillStyle = 'rgba(90,140,255,0.06)';
      ctx.fillRect(lx1, 0, lx2 - lx1, h);
      ctx.fillStyle = 'rgba(90,140,255,0.55)';
      ctx.fillRect(lx1, 0, 2, h); ctx.fillRect(lx2 - 2, 0, 2, h);
    }

    drawPlayhead(ctx, w, h);
    drawHScroll(w, h);
  }
  UI.drawPlaylist = draw;
  UI.drawPlaylistPlayheadOnly = function () { draw(); };

  function drawPlayhead(ctx, w, h) {
    if (!UI.playing) return;
    const pos = Math.max(0, UI.engine.currentPosition());
    const local = pos % Math.max(1, UI.project.songLength);
    const x = stepToX(local);
    if (x < -2 || x > w + 2) return;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x, 0, 1.5, h);
  }

  function drawHScroll(w, h) {
    const totalW = UI.project.songLength * pxPerStep;
    if (totalW <= w) return;
    const barY = h - 8;
    ctx.fillStyle = '#12151d';
    ctx.fillRect(0, barY, w, 8);
    ctx.fillStyle = '#39415a';
    const bx = (-scrollX / totalW) * w, bw = (w / totalW) * w;
    ctx.fillRect(Math.max(0, bx), barY, Math.min(bw, w), 8);
  }

  /* ---------------- track headers ---------------- */

  function drawHeaders() {
    const host = document.getElementById('plHeads');
    if (!host) return;
    const dpr = window.devicePixelRatio || 1;
    const w = HEAD_W, h = host.clientHeight;
    if (host.width !== w * dpr || host.height !== h * dpr) { host.width = w * dpr; host.height = h * dpr; }
    const hc = host.getContext('2d');
    hc.setTransform(dpr, 0, 0, dpr, 0, 0);
    hc.clearRect(0, 0, w, h);
    UI.project.tracks.forEach(function (tr, t) {
      const y = t * TRACK_H - scrollY;
      if (y > h || y + TRACK_H < 0) return;
      hc.fillStyle = '#171b26';
      hc.fillRect(0, y + 1, w - 4, TRACK_H - 3);
      hc.fillStyle = tr.color;
      hc.fillRect(0, y + 1, 3, TRACK_H - 3);
      hc.fillStyle = '#cdd5e5';
      hc.font = '11px system-ui';
      hc.fillText(tr.name, 8, y + TRACK_H / 2 + 4);
    });
  }

  /* ---------------- events ---------------- */

  function bindEvents() {
    cv.addEventListener('contextmenu', ev => ev.preventDefault());

    cv.addEventListener('pointerdown', function (ev) {
      const r = cv.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const hit = clipAt(mx, my);

      if (ev.button === 2) {
        if (hit) {
          hit.track.clips.splice(hit.idx, 1);
          UI.sel.clips.delete(hit.clip.id);
          UI.commit('delete clip');
        }
        return;
      }

      if (hit) {
        if (!UI.sel.clips.has(hit.clip.id)) {
          if (!ev.shiftKey) UI.sel.clips.clear();
          UI.sel.clips.add(hit.clip.id);
        } else if (ev.shiftKey) {
          UI.sel.clips.delete(hit.clip.id); UI.mark('playlist'); return;
        }
        if (ev.altKey) {
          // duplicate on drag
          const dup = { id: genId(), patternId: hit.clip.patternId, start: hit.clip.start, length: hit.clip.length };
          hit.track.clips.push(dup);
          UI.sel.clips.clear(); UI.sel.clips.add(dup.id);
          dragMode = 'move';
          dragData = { clip: dup, grabOff: xToStep(mx) - hit.clip.start, moved: false, startX: ev.clientX };
        } else {
          dragMode = hit.edge ? 'resize' : 'move';
          dragData = { clip: hit.clip, startLen: hit.clip.length, startStart: hit.clip.start, grabOff: xToStep(mx) - hit.clip.start, moved: false, startX: ev.clientX };
        }
      } else {
        // click empty: seek (song mode) or clear selection
        const stepPos = Math.max(0, snapRound(xToStep(mx)));
        if (UI.engine.mode === 'song') UI.engine.seek(stepPos);
        UI.sel.clips.clear();
        UI.mark('playlist');
        UI.mark('piano');
        return;
      }
      cv.setPointerCapture(ev.pointerId);
      UI.mark('playlist');
      ev.preventDefault();
    });

    cv.addEventListener('pointermove', function (ev) {
      const r = cv.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;

      if (!dragMode) {
        const hit = clipAt(mx, my);
        hoverClipId = hit ? hit.clip.id : null;
        cv.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'grab') : 'default';
        if (hit) UI.mark('playlist');
        return;
      }

      if (dragMode === 'move') {
        const ns = Math.max(0, snapRound(xToStep(mx) - dragData.grabOff));
        const nt = UI.clamp(yToTrack(my), 0, visibleTracks().length - 1);
        const oldTrack = visibleTracks().find(t => t.clips.includes(dragData.clip));
        if (oldTrack && oldTrack !== visibleTracks()[nt]) {
          oldTrack.clips.splice(oldTrack.clips.indexOf(dragData.clip), 1);
          visibleTracks()[nt].clips.push(dragData.clip);
        }
        if (ns !== dragData.clip.start) dragData.moved = true;
        dragData.clip.start = ns;
        UI.mark('playlist');
      } else if (dragMode === 'resize') {
        const nl = Math.max(4, snapRound(xToStep(mx)) - dragData.clip.start);
        if (nl !== dragData.clip.length) dragData.moved = true;
        dragData.clip.length = nl;
        UI.mark('playlist');
      }
      ev.preventDefault();
    });

    cv.addEventListener('pointerup', function () {
      if (dragMode === 'move' && dragData && dragData.moved) UI.commit('move clip');
      else if (dragMode === 'resize' && dragData && dragData.moved) UI.commit('resize clip');
      else if (dragMode === 'move') UI.commit('duplicate clip'); // alt-drag always creates
      dragMode = null; dragData = null;
      autosaveSoon();
    });

    // wheel: vertical scroll tracks; shift horizontal; ctrl zoom time
    cv.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        const anchor = xToStep(ev.clientX - cv.getBoundingClientRect().left);
        pxPerStep = UI.clamp(pxPerStep * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), 1.5, 28);
        scrollX = Math.max(0, anchor * pxPerStep - (ev.clientX - cv.getBoundingClientRect().left));
      } else if (ev.shiftKey) {
        scrollX += ev.deltaY;
      } else {
        scrollY += ev.deltaY;
        scrollX += ev.deltaX;
      }
      UI.mark('playlist');
    }, { passive: false });

    // header canvas: rename via dblclick
    const heads = document.getElementById('plHeads');
    heads.addEventListener('dblclick', function (ev) {
      const rect = heads.getBoundingClientRect();
      const t = Math.floor((ev.clientY - rect.top + scrollY) / TRACK_H);
      const tr = UI.project.tracks[t];
      if (tr) {
        const n = prompt('Track name:', tr.name);
        if (n != null && n.trim()) { tr.name = n.trim().slice(0, 24); UI.commit('rename track'); }
      }
    });
  }

  function snapRound(v) { return Math.round(v / 4) * 4; }   // quarter-beat resolution in playlist

  function genId() { return 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  UI.deleteSelectedClips = function () {
    if (!UI.sel.clips.size) return;
    for (const tr of UI.project.tracks) {
      tr.clips = tr.clips.filter(c => !UI.sel.clips.has(c.id));
    }
    UI.sel.clips.clear();
    UI.commit('delete clips');
    UI.toast('Deleted clip(s)');
  };

  UI.addPlaylistTrack = function () {
    UI.project.tracks.push({ id: window.NyxProject.uid('tk'), name: 'Track ' + (UI.project.tracks.length + 1), color: '#3d4657', clips: [] });
    UI.commit('add track');
  };

  /* palette: click a pattern to arm placement; then click empty area places clip.
     Simplification: clicking a palette item immediately drops the clip at the
     first free slot on the first track with space at playhead position. */
  function buildPalette() {
    const host = document.getElementById('plPalette');
    if (!host || !UI.project) return;   // boot order: project may not exist yet; interval rebuilds
    host.innerHTML = '';
    UI.project.patterns.forEach(function (p) {
      const it = el('div', 'pal-item', host);
      it.draggable = false;
      const dot = el('span', 'pal-dot', it);
      dot.style.background = p.color;
      const nm = el('span', 'pal-name', it);
      nm.textContent = p.name;
      it.title = 'Click to place "' + p.name + '" at playhead on selected track';
      it.addEventListener('click', function () { placePatternAtPlayhead(p.id); });
    });
  }
  UI.buildPalette = buildPalette;
  UI.placePatternAtPlayhead = placePatternAtPlayhead;

  function placePatternAtPlayhead(patternId) {
    const pat = UI.project.patterns.find(p => p.id === patternId);
    if (!pat) return;
    const pos = Math.max(0, UI.playing ? UI.engine.currentPosition() : UI.engine.position);
    const start = snapRound(pos);
    // find track with room (prefer last)
    let target = null;
    for (let i = UI.project.tracks.length - 1; i >= 0; i--) {
      const tr = UI.project.tracks[i];
      const clash = tr.clips.some(c => start < c.start + c.length && start + pat.length > c.start);
      if (!clash) { target = tr; break; }
    }
    if (!target) { UI.addPlaylistTrack(); target = UI.project.tracks[UI.project.tracks.length - 1]; }
    target.clips.push({ id: genId(), patternId, start, length: pat.length });
    UI.sel.clips.clear();
    UI.commit('place clip');
    UI.toast('Placed "' + pat.name + '" @ bar ' + (Math.floor(start / 16) + 1));
  }

  let _asT2 = null;
  function autosaveSoon() { clearTimeout(_asT2); _asT2 = setTimeout(function () { try { localStorage.setItem('nyx.autosave.v1', JSON.stringify(UI.project)); } catch (e) {} }, 300); }

  /* ---------------- toolbar ---------------- */

  function wireToolbar() {
    document.getElementById('plAddTrack').addEventListener('click', UI.addPlaylistTrack);
    document.getElementById('zoomInPl').addEventListener('click', function () { pxPerStep = UI.clamp(pxPerStep * 1.25, 1.5, 28); UI.mark('playlist'); });
    document.getElementById('zoomOutPl').addEventListener('click', function () { pxPerStep = UI.clamp(pxPerStep / 1.25, 1.5, 28); UI.mark('playlist'); });
    document.getElementById('btnSongLen').addEventListener('click', function () {
      const v = prompt('Song length in bars (1-256):', String(Math.round(UI.project.songLength / 16)));
      if (v != null) {
        const bars = UI.clamp(parseInt(v, 10) || 16, 1, 256);
        UI.project.songLength = bars * 16;
        UI.commit('song length');
        UI.mark('playlist');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireToolbar();
    buildPalette();
    // rebuild palette if pattern list signature changes
    setInterval(function () {
      const host = document.getElementById('plPalette');
      if (!host || !UI.project) return;
      const sig = UI.project.patterns.map(p => p.id).join(',');
      if (host.dataset.sig !== sig) { host.dataset.sig = sig; buildPalette(); }
    }, 500);
    setInterval(drawHeaders, 250);
  });

  // test/debug hooks
  UI._plState = function () { return { pxPerStep, scrollX, scrollY, HEAD_W, TRACK_H }; };
    UI._plCanvasRect = function () { if (!cv) return null; const r = cv.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };

})();
