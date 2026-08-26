/* ============================================================
   PULSEWEAVE · main.js — boot sequence + test hook
   ============================================================ */
window.PW = window.PW || {};

(function () {
  'use strict';

  async function boot() {
    const bar = document.getElementById('bootBar');
    const msg = document.getElementById('bootMsg');
    let fakeProgress = 0;
    const fakeTimer = setInterval(() => {
      fakeProgress = Math.min(.9, fakeProgress + .06);
      if (!bar.dataset.real) bar.style.width = (fakeProgress * 100).toFixed(0) + '%';
    }, 120);

    try {
      msg.textContent = 'composing “Neon Meridian”…';
      const rendered = await PW.Music.renderSong((p) => {
        bar.dataset.real = '1';
        bar.style.width = (p * 100).toFixed(0) + '%';
        if (p >= .92) msg.textContent = 'weaving charts…';
      });
      PW.Assets = { buffer: rendered.buffer, peaks: rendered.peaks, duration: rendered.duration };

      // bundled charts (with any previously-saved edits applied)
      PW.charts = PW.Charts.buildBundled();
      for (let i = 0; i < PW.charts.length; i++) {
        const ov = PW.Store.override(PW.charts[i].id);
        if (ov) PW.charts[i] = JSON.parse(JSON.stringify(ov));
      }

      clearInterval(fakeTimer);
      bar.style.width = '100%';

      PW.editor = new PW.Editor.Editor();
      PW.ui.init();
      await new Promise(r => setTimeout(r, 250));
      PW.hook.ready = true;
      PW.ui.showMenu();
    } catch (err) {
      clearInterval(fakeTimer);
      console.error(err);
      msg.textContent = 'audio failed to initialize: ' + err.message;
    }
  }

  // ---------- test/automation hook ----------
  PW.hook = {
    ready: false,
    charts: () => PW.charts,
    assets: () => PW.Assets,
    get editor() { return PW.editor; },
    game() { return PW._game || null; },
    startGame(diffId, opts = {}) {
      const c = PW.charts.find(x => x.id === diffId) || PW.charts[1];
      PW.ui.startGame({
        chart: PW.Charts.clone(c),
        autopilot: !!opts.autopilot,
        startBeat: opts.startBeat || 0
      });
      return true;
    },
    state() {
      const g = PW._game;
      if (!g || g.destroyed) return { active: false };
      return {
        active: true, state: g.state, pos: g.pos(),
        score: g.score, combo: g.combo, maxCombo: g.maxCombo,
        accNum: g.accNum, accDen: g.accDen, counts: { ...g.counts },
        notesTotal: g.notes.length, notesResolved: g.notes.filter(n => n.state === 'done').length
      };
    },
    autopilot(on) { const g = PW._game; if (g) g.autopilot = !!on; return !!(g && g.autopilot); },
    finishEarly() {
      const g = PW._game;
      if (!g) return false;
      // resolve everything via the real judge paths (autopilot-style)
      g.autopilot = true;
      for (const n of g.notes) {
        if (n.state !== 'pending') continue;
        if (n.type === 'hold') { g.press(n.lane, n.sec); g.release(n.lane, n.tailSec); }
        else { g.press(n.lane, n.sec); g.pressed[n.lane] = false; }
      }
      return true;
    },
    resultsVisible() { return !document.getElementById('resultsScreen').classList.contains('hidden'); },
    resultsData() {
      return {
        score: document.getElementById('resScore').textContent,
        grade: document.getElementById('gradeLetter').textContent,
        acc: document.getElementById('resAcc').textContent,
        counts: {
          perfect: document.getElementById('resPerfect').textContent,
          great: document.getElementById('resGreat').textContent,
          good: document.getElementById('resGood').textContent,
          miss: document.getElementById('resMiss').textContent
        }
      };
    },
    keyLane(lane, down) {
      const code = PW.Engine.LANE_KEYS[lane];
      const target = { KeyD: 'KeyD', KeyF: 'KeyF', KeyJ: 'KeyJ', KeyK: 'KeyK' }[code];
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: target, bubbles: true }));
    },
    openEditor(chartId) { PW.ui.openEditor(chartId); return true; }
  };

  window.addEventListener('DOMContentLoaded', boot);
})();
