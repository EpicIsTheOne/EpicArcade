// PRISM PULSE — integrated chart editor. Shares the exact chart format with the game.
import { LANES, LANE_KEYS, LANE_COLORS, beatsToSec, secToBeats, validateChart, normalizeChart } from './chart.js';

const SNAP_OPTIONS = [
  { label: '1/1', div: 0.25 }, { label: '1/2', div: 0.5 }, { label: '1/3', div: 1 / 3 },
  { label: '1/4', div: 1 }, { label: '1/6', div: 2 }, { label: '1/8', div: 4 },
  { label: '1/16', div: 8 },
];

export class Editor {
  constructor(canvas, waveCanvas, ui, chart, audio, opts = {}) {
    this.canvas = canvas;
    this.wave = waveCanvas;
    this.ui = ui;
    this.chart = normalizeChart(JSON.parse(JSON.stringify(chart))); // deep copy
    this.original = JSON.parse(JSON.stringify(this.chart));
    this.audio = audio;
    this.opts = opts || {};
    this.dirty = false;

    this.curBeat = secToBeats(opts.startSec || 0, this.chart.meta.bpm, this.chart.meta.offset || 0);
    this.playing = false;
    this.pxPerBeat = 110;
    this.snapIx = 3; // default 1/4
    this.cursorFrac = 0.32;   // cursor line position from top
    this.selected = null;
    this.drag = null;         // {kind:'head'|'tail'|'seek', note, grabDx}
    this.peaks = opts.peaks || null;

    this._bind();
    this.resize();
    this.syncInputs();
    this.loop();
  }

  // ---------- helpers ----------
  get spb() { return 60 / this.chart.meta.bpm; }
  get snapDiv() { return SNAP_OPTIONS[this.snapIx].div; }
  get totalBeats() {
    const last = this.chart.notes[this.chart.notes.length - 1];
    return Math.max(this.chart.meta.lengthBeats || 0, last ? last.t + (last.dur || 0) : 0);
  }
  beatToY(b) { return this.h() * this.cursorFrac + (b - this.curBeat) * this.pxPerBeat; }
  yToBeatRaw(y) { return this.curBeat + (y - this.h() * this.cursorFrac) / this.pxPerBeat; }
  h() { return this.canvas.height / (this.dpr || 1); }
  w() { return this.canvas.width / (this.dpr || 1); }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [this.canvas, this.wave]) {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, r.width * this.dpr);
      cv.height = Math.max(1, r.height * this.dpr);
    }
  }

  snap(b) { return Math.round(b / this.snapDiv) * this.snapDiv; }

  hitTest(x, y) {
    const lanes = this.laneGeom();
    const lane = lanes.findIndex(g => x >= g.x && x <= g.x + g.w);
    if (lane < 0) return null;
    let best = null;
    for (const n of this.chart.notes) {
      if (n.lane !== lane) continue;
      const hy = this.beatToY(n.t);
      const ty = n.type === 'hold' ? this.beatToY(n.t + n.dur) : hy;
      const tol = 10;
      if (Math.abs(hy - y) <= tol + 9) return { note: n, part: 'head' };
      if (n.type === 'hold' && y > hy && y < ty + 12 && (!best || best.part !== 'head')) {
        best = { note: n, part: y > ty - 12 ? 'tail' : 'body' };
      }
    }
    return best;
  }

  laneGeom() {
    const W = this.w();
    const hwW = Math.min(W * 0.55, 480);
    const x0 = (W - hwW) / 2;
    return Array.from({ length: LANES }, (_, i) => ({ x: x0 + (hwW / LANES) * i, w: hwW / LANES }));
  }

  // ---------- transport ----------
  togglePlay() {
    if (this.playing) {
      this.curBeat = secToBeats(this.audio.position(), this.chart.meta.bpm, this.chart.meta.offset || 0);
      this.audio.pause();
      this.playing = false;
    } else {
      const sec = beatsToSec(this.curBeat, this.chart.meta.bpm, this.chart.meta.offset || 0);
      if (sec >= this.audio.duration - 0.05) this.curBeat = 0;
      this.audio.ensureCtx().then(() => {
        this.audio.onEnd = () => { this.playing = false; };
        this.audio.play(beatsToSec(this.curBeat, this.chart.meta.bpm, this.chart.meta.offset || 0));
        this.playing = true;
      });
    }
    this.updateTransportUi();
  }

  stopToStart() {
    this.playing = false; this.audio.pause(); this.seekBeat(0);
  }

  seekBeat(b) {
    b = Math.max(0, Math.min(b, secToBeats(this.audio.duration, this.chart.meta.bpm)));
    this.curBeat = b;
    if (this.playing) {
      this.audio.pause();
      this.audio.ensureCtx().then(() => {
        this.audio.play(beatsToSec(b, this.chart.meta.bpm, this.chart.meta.offset || 0));
      });
    }
  }

  seekSec(s) { this.seekBeat(secToBeats(s, this.chart.meta.bpm, this.chart.meta.offset || 0)); }

  // ---------- editing ops (also used by tests) ----------
  placeNote(beat, lane, type = 'tap', dur = 1) {
    beat = +beat.toFixed(3);
    const clash = this.chart.notes.find(n => n.lane === lane &&
      (n.type === 'hold'
        ? (beat >= n.t - 1e-6 && beat <= n.t + n.dur + 1e-6)
        : Math.abs(n.t - beat) < 1e-6));
    if (clash) return false;
    this.chart.notes.push(type === 'hold' ? { t: beat, lane, type, dur } : { t: beat, lane, type });
    normalizeChart(this.chart);
    this.markDirty();
    return true;
  }

  deleteNoteAt(beat, lane, tol = 0.35) {
    let bi = -1, bd = 1e9;
    this.chart.notes.forEach((n, i) => {
      if (n.lane !== lane) return;
      const d = Math.abs(n.t - beat);
      const insideHold = n.type === 'hold' && beat > n.t && beat < n.t + n.dur;
      if ((d < bd && d <= tol) || (insideHold && d < bd)) { bd = d; bi = i; }
    });
    if (bi >= 0) { this.chart.notes.splice(bi, 1); this.markDirty(); return true; }
    return false;
  }

  setMeta(patch) { Object.assign(this.chart.meta, patch); this.markDirty(); }

  markDirty() {
    this.dirty = true;
    this.ui.root.dispatchEvent(new CustomEvent('chartchange', { detail: this.stats() }));
  }

  stats() {
    const taps = this.chart.notes.filter(n => n.type === 'tap').length;
    return { total: this.chart.notes.length, taps, holds: this.chart.notes.length - taps,
             dirty: this.dirty, bpm: this.chart.meta.bpm };
  }

  saveLocal() {
    try {
      localStorage.setItem('prism.chart.custom', JSON.stringify(this.chart));
      localStorage.setItem('prism.chart.custom.on', '1');
      this.dirty = false;
      this.flashStatus('Saved to browser storage');
      return true;
    } catch (e) { this.flashStatus('Save failed: ' + e.message); return false; }
  }

  exportFile() {
    const blob = new Blob([JSON.stringify(this.chart, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (this.chart.meta.title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.flashStatus('Exported ' + a.download);
  }

  importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const c = JSON.parse(rd.result);
        const err = validateChart(c);
        if (err) throw new Error(err);
        this.chart = normalizeChart(c);
        this.original = JSON.parse(JSON.stringify(this.chart));
        this.dirty = false;
        this.selected = null;
        this.syncInputs();
        this.flashStatus('Imported "' + this.chart.meta.title + '" (' + this.chart.notes.length + ' notes)');
        this.ui.root.dispatchEvent(new CustomEvent('chartchange', { detail: this.stats() }));
      } catch (e) { this.flashStatus('Import failed: ' + e.message); }
    };
    rd.readAsText(file);
  }

  revertIncluded() {
    if (!this.opts.getIncludedChart) return;
    this.chart = normalizeChart(JSON.parse(JSON.stringify(this.opts.getIncludedChart())));
    this.original = JSON.parse(JSON.stringify(this.chart));
    this.dirty = false; this.selected = null;
    localStorage.removeItem('prism.chart.custom.on');
    this.syncInputs();
    this.flashStatus('Restored included chart');
    this.ui.root.dispatchEvent(new CustomEvent('chartchange', { detail: this.stats() }));
  }

  flashStatus(msg) {
    const el = this.ui.status;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._stTimer);
    this._stTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  syncInputs() {
    this.ui.bpmInput.value = this.chart.meta.bpm;
    this.ui.offsetInput.value = this.chart.meta.offset ?? 0;
    this.ui.titleInput.value = this.chart.meta.title || '';
    this.updateStatsUi();
    this.updateTransportUi();
  }

  updateStatsUi() {
    const s = this.stats();
    this.ui.statTotal.textContent = s.total;
    this.ui.statHolds.textContent = s.holds;
    this.ui.dirtyDot.style.display = this.dirty ? 'inline-block' : 'none';
  }

  updateTransportUi() {
    this.ui.playBtn.textContent = this.playing ? '⏸ Pause' : '▶ Play';
    this.ui.snapBtn.textContent = 'Snap ' + SNAP_OPTIONS[this.snapIx].label;
    this.ui.zoomBtn.textContent = 'Zoom ' + Math.round(this.pxPerBeat);
  }

  destroy() {
    this.dead = true;
    this._unbind();
    this.audio.stop();
  }

  // ---------- events ----------
  _bind() {
    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); this.togglePlay(); break;
        case 'Home': this.seekBeat(0); break;
        case 'Delete': case 'Backspace':
          if (this.selected) {
            this.chart.notes.splice(this.chart.notes.indexOf(this.selected), 1);
            this.selected = null; this.markDirty();
          }
          break;
        case 'Equal': case 'NumpadAdd': this.pxPerBeat = Math.min(400, this.pxPerBeat * 1.25); this.updateTransportUi(); break;
        case 'Minus': case 'NumpadSubtract': this.pxPerBeat = Math.max(24, this.pxPerBeat / 1.25); this.updateTransportUi(); break;
        default:
          if (/^Digit[1-7]$/.test(e.code)) {
            this.snapIx = +e.code.slice(5) - 1; this.updateTransportUi();
          }
      }
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const dB = (e.deltaY / this.pxPerBeat) * (e.deltaMode === 1 ? 18 : 1);
      this.seekBeat(this.yToBeatRaw(this.h() * this.cursorFrac) + dB);
    };
    this._onDown = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (e.button === 2) { // right-click delete
        const hit = this.hitTest(x, y);
        if (hit) {
          this.chart.notes.splice(this.chart.notes.indexOf(hit.note), 1);
          if (this.selected === hit.note) this.selected = null;
          this.markDirty();
        }
        return;
      }
      if (e.button !== 0) return;
      const hit = this.hitTest(x, y);
      if (hit && hit.part === 'head') {
        this.selected = hit.note;
        this.drag = { kind: 'head', note: hit.note };
      } else if (hit && (hit.part === 'tail' || hit.part === 'body')) {
        this.selected = hit.note;
        this.drag = { kind: 'tail', note: hit.note };
      } else {
        const lanes = this.laneGeom();
        const lane = lanes.findIndex(g => x >= g.x && x <= g.x + g.w);
        if (lane >= 0) {
          const b = this.snap(Math.max(0, this.yToBeatRaw(y)));
          if (b >= 0 && !this.placeNote(b, lane, 'tap')) { /* clash: no-op */ }
          else this.flashStatus(`Tap @ ${b.toFixed(2)} beats · lane ${lane + 1}`);
        }
      }
    };
    this._onMove = (e) => {
      if (!this.drag) return;
      const rect = this.canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const raw = Math.max(0, this.yToBeatRaw(y));
      if (this.drag.kind === 'head') {
        const nb = this.snap(raw);
        const n = this.drag.note;
        if (nb !== n.t) {
          const clash = this.chart.notes.some(o => o !== n && o.lane === n.lane && Math.abs(o.t - nb) < 1e-6);
          if (!clash) { n.t = +nb.toFixed(3); this.markDirty(); }
        }
      } else if (this.drag.kind === 'tail') {
        const n = this.drag.note;
        const endB = this.snap(raw);
        const nd = +(endB - n.t).toFixed(3);
        if (nd > 0 && Math.abs((n.dur || 0) - nd) > 1e-9) { n.dur = nd; n.type = 'hold'; this.markDirty(); }
      }
    };
    this._onUp = () => { this.drag = null; };
    this._onCtx = (e) => e.preventDefault();
    this._onResize = () => this.resize();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvas.addEventListener('mousedown', this._onDown);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
    this.canvas.addEventListener('contextmenu', this._onCtx);

    this.wave.addEventListener('mousedown', (e) => {
      const rect = this.wave.getBoundingClientRect();
      this.seekSec(((e.clientX - rect.left) / rect.width) * this.audio.duration);
    });

    // toolbar
    this.ui.playBtn.onclick = () => this.togglePlay();
    this.ui.stopBtn.onclick = () => this.stopToStart();
    this.ui.snapBtn.onclick = () => { this.snapIx = (this.snapIx + 1) % SNAP_OPTIONS.length; this.updateTransportUi(); };
    this.ui.zoomBtn.onclick = () => { this.pxPerBeat = Math.min(400, Math.max(24, this.pxPerBeat * 1.25)); this.updateTransportUi(); };
    this.ui.testBtn.onclick = () => this.opts.onPlaytest && this.opts.onPlaytest();
    this.ui.saveBtn.onclick = () => this.saveLocal();
    this.ui.exportBtn.onclick = () => this.exportFile();
    this.ui.revertBtn.onclick = () => this.revertIncluded();
    this.ui.importInput.onchange = (e) => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    this.ui.backBtn.onclick = () => this.opts.onExit && this.opts.onExit();

    const commitMeta = () => {
      const bpm = Math.max(40, Math.min(300, parseFloat(this.ui.bpmInput.value) || this.chart.meta.bpm));
      const off = parseFloat(this.ui.offsetInput.value) || 0;
      this.setMeta({ bpm, offset: off });
      this.ui.titleInput.value = this.ui.titleInput.value.trim() || this.chart.meta.title;
      this.setMeta({ title: this.ui.titleInput.value.trim() || 'Untitled' });
      this.flashStatus(`Meta updated · BPM ${bpm} · offset ${off}s`);
    };
    this.ui.bpmInput.onchange = commitMeta;
    this.ui.offsetInput.onchange = commitMeta;
    this.ui.titleInput.onchange = commitMeta;
  }

  _unbind() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mouseup', this._onUp);
    this.canvas.removeEventListener('contextmenu', this._onCtx);
  }

  // ---------- main loop ----------
  loop() {
    if (this.dead) return;
    requestAnimationFrame(() => this.loop());
    if (this.playing) {
      this.curBeat = secToBeats(this.audio.position(), this.chart.meta.bpm, this.chart.meta.offset || 0);
    }
    this.draw();
    this.drawWave();
    const posEl = this.ui.timeLabel;
    const sec = beatsToSec(this.curBeat, this.chart.meta.bpm, this.chart.meta.offset || 0);
    posEl.textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}.${String(Math.floor((sec % 1) * 100)).padStart(2, '0')} · bar ${Math.floor(this.curBeat / 4) + 1}`;
  }

  draw() {
    const c = this.canvas.getContext('2d');
    const dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.w(), H = this.h();
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0819'); g.addColorStop(1, '#0a0514');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    const lanes = this.laneGeom();
    // lane backgrounds + labels
    lanes.forEach((ln, i) => {
      c.fillStyle = i % 2 ? 'rgba(148,103,255,0.05)' : 'rgba(255,255,255,0.02)';
      c.fillRect(ln.x, 0, ln.w, H);
      c.strokeStyle = 'rgba(167,139,250,0.18)';
      c.beginPath(); c.moveTo(ln.x + ln.w, 0); c.lineTo(ln.x + ln.w, H); c.stroke();
      c.fillStyle = LANE_COLORS[i] + 'cc';
      c.font = '700 13px Consolas, monospace'; c.textAlign = 'center';
      c.fillText(LANE_KEYS[i].label, ln.x + ln.w / 2, H - 10);
    });

    const bpm = this.chart.meta.bpm, off = this.chart.meta.offset || 0;
    const firstB = Math.floor(this.yToBeatRaw(0));
    const lastB = Math.ceil(this.yToBeatRaw(H));

    // grid: bars strongest, beats medium, subdivisions faint
    const startSnap = Math.ceil(firstB / this.snapDiv) * this.snapDiv;
    for (let b = startSnap; b <= lastB; b += this.snapDiv) {
      const y = this.beatToY(b);
      if (y < -4 || y > H + 4) continue;
      const isBar = Math.abs(b % 4) < 1e-6;
      const isBeat = Math.abs(b % 1) < 1e-6;
      c.strokeStyle = isBar ? 'rgba(233,213,255,0.34)' : isBeat ? 'rgba(196,181,253,0.16)' : 'rgba(196,181,253,0.07)';
      c.lineWidth = isBar ? 1.6 : 1;
      c.beginPath(); c.moveTo(lanes[0].x, y); c.lineTo(lanes[LANES - 1].x + lanes[LANES - 1].w, y); c.stroke();
      if (isBar) {
        c.fillStyle = 'rgba(233,213,255,0.55)';
        c.font = '600 11px Consolas, monospace'; c.textAlign = 'left';
        c.fillText(String(b / 4 + 1), lanes[LANES - 1].x + lanes[LANES - 1].w + 8, y + 4);
      }
    }

    // notes
    const w = lanes[0].w;
    for (const n of this.chart.notes) {
      const y = this.beatToY(n.t);
      if (y < -60 || y > H + 60) continue;
      const ln = lanes[n.lane];
      const col = LANE_COLORS[n.lane];
      const sel = this.selected === n;
      if (n.type === 'hold') {
        const yEnd = this.beatToY(n.t + n.dur);
        c.fillStyle = col + '55';
        roundRect(c, ln.x + w * 0.26, y, w * 0.48, Math.max(yEnd - y, 5), 6);
        c.fill();
        c.fillStyle = col;
        roundRect(c, ln.x + w * 0.22, yEnd - 5, w * 0.56, 10, 5);
        c.fill();
      }
      const hg = c.createLinearGradient(ln.x, y - 11, ln.x, y + 11);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.3, col);
      c.fillStyle = hg;
      roundRect(c, ln.x + w * 0.11, y - 11, w * 0.78, 22, 8);
      c.fill();
      if (sel) {
        c.strokeStyle = '#fff'; c.lineWidth = 2;
        roundRect(c, ln.x + w * 0.08, y - 14, w * 0.84, 28, 9);
        c.stroke();
      }
    }

    // playback cursor
    const cy = H * this.cursorFrac;
    const jg = c.createLinearGradient(lanes[0].x, 0, lanes[LANES - 1].x + w, 0);
    jg.addColorStop(0, '#7dd3fc'); jg.addColorStop(1, '#f0abfc');
    c.fillStyle = jg;
    c.fillRect(lanes[0].x, cy - 1.5, w * LANES, 3);
    c.fillStyle = '#e9d5ff';
    c.beginPath();
    c.moveTo(lanes[0].x - 12, cy - 7); c.lineTo(lanes[0].x - 2, cy); c.lineTo(lanes[0].x - 12, cy + 7);
    c.closePath(); c.fill();
  }

  drawWave() {
    const c = this.wave.getContext('2d');
    const dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.wave.width / dpr, H = this.wave.height / dpr;
    c.fillStyle = '#0c0718'; c.fillRect(0, 0, W, H);
    const dur = this.audio.duration || 1;
    const curSec = beatsToSec(this.curBeat, this.chart.meta.bpm, this.chart.meta.offset || 0);

    if (this.peaks) {
      const mid = H / 2;
      c.fillStyle = '#7c5cff';
      const n = this.peaks.length;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * dur;
        const x = (t / dur) * W;
        const h = Math.max(1, this.peaks[i] * H * 0.92);
        const past = t <= curSec;
        c.globalAlpha = past ? 0.95 : 0.42;
        c.fillRect(x, mid - h / 2, Math.max(W / n, 1), h);
      }
      c.globalAlpha = 1;
    } else {
      c.fillStyle = '#7c5cff44'; c.fillRect(0, H / 2 - 2, W, 4);
    }

    // section markers
    if (this.opts.markers) {
      c.font = '600 10px Consolas, monospace'; c.textAlign = 'left';
      for (const m of this.opts.markers) {
        const x = (m.sec / dur) * W;
        c.strokeStyle = 'rgba(233,213,255,0.5)';
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
        c.fillStyle = 'rgba(233,213,255,0.75)';
        c.fillText(m.name, x + 3, 9);
      }
    }
    // cursor
    const x = (curSec / dur) * W;
    c.fillStyle = '#fff'; c.fillRect(x - 1, 0, 2, H);
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
