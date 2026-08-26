'use strict';
/* GRAYLINE — Night Shift :: bootstrap, input, main loop, test hooks */
window.G = window.G || {};
G.main = {};

(function () {
  let lastTs = 0;

  function fitStage() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.transform = 'scale(' + s.toFixed(4) + ')';
  }

  function togglePause() {
    const g = G.game;
    if (g.mode !== 'night') return;
    if (g.paused) G.ui.resume();
    else { g.paused = true; G.ui.showPause(); }
  }

  function overlayEscape() {
    const sn = G.ui.screenName;
    if (sn === 'help') G.ui.helpBack();
    else if (sn === 'settings') G.ui.showTitle();
    else if (sn === 'pause') G.ui.resume();
  }

  function overlayPrimary() {
    const b = document.querySelector('#overlay .mbtn.primary');
    if (b) b.click();
  }

  function bindKeys() {
    window.addEventListener('keydown', e => {
      const g = G.game;
      const c = e.code;
      if (c === 'Space' || c === 'ArrowLeft' || c === 'ArrowRight') e.preventDefault();

      if (c === 'KeyM') {
        G.audio.ensure();
        const m = G.audio.toggleMute();
        if (G.ui.el.bMute) G.ui.el.bMute.textContent = m ? 'UNMUTE' : 'MUTE';
        return;
      }

      if (c === 'Escape') {
        if (G.ui.screenName) overlayEscape();
        else if (g.mode === 'night') togglePause();
        return;
      }
      if (c === 'Enter') { overlayPrimary(); return; }

      if (g.mode !== 'night' || g.paused) return;

      switch (c) {
        case 'Space': g.toggleCams(); break;
        case 'KeyA': g.toggleDoor('L'); break;
        case 'KeyD': g.toggleDoor('R'); break;
        case 'KeyQ': g.toggleLight('L'); break;
        case 'KeyE': g.toggleLight('R'); break;
        case 'KeyW': g.toggleHatch(); break;
        case 'KeyB': g.setBoost(true); break;
        case 'ArrowLeft': g.cycleCam(-1); break;
        case 'ArrowRight': g.cycleCam(1); break;
        default:
          if (/^Digit[1-8]$/.test(c)) g.setCam(G.CAM_ORDER[Number(c.slice(5)) - 1]);
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'KeyB') G.game.setBoost(false);
    });
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    const rdt = Math.min(0.1, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    const g = G.game;
    g.rt += rdt;
    g.update(rdt);
    g.render(G.main.viewCtx);
    G.ui.hudTick(rdt, g);
  }

  function installTestHooks() {
    window.__TEST__ = {
      game: G.game,
      snap() {
        const g = G.game;
        return {
          mode: g.mode,
          paused: g.paused,
          clock: Math.round(g.clock * 10) / 10,
          hour: g.hour,
          power: Math.round(g.power * 10) / 10,
          camsUp: g.camsUp,
          curCam: g.curCam,
          doors: { L: g.doors.L, R: g.doors.R },
          hatch: g.hatch,
          lights: { L: g.lights.L, R: g.lights.R },
          blackout: g.blackout,
          stats: g.stats,
          threats: g.stalkers.map(s => ({ kind: s.kind, node: s.node, mode: s.mode })),
          screen: G.ui.screenName
        };
      },
      start(night) {
        G.game.night = night || 1;
        G.game.quickStart();
        return this.snap();
      },
      skipTo(sec) { G.game.clock = Math.max(G.game.clock, sec); },
      setPower(v) { G.game.power = v; },
      place(kind, node) {
        const s = G.game.stalkers.find(x => x.kind === kind);
        if (s) { s.node = node; s.mode = 'roam'; s.cool = 0; s.moveT = 99; }
        return this.snap();
      },
      forceEntry(kind) {
        const s = G.game.stalkers.find(x => x.kind === kind);
        if (s) {
          s.node = s.cfg.entry;
          s.mode = 'entry';
          s.graceT = kind === 'wick' ? 4 : 3;
          s.blockT = 0;
          G.game.stats.closeCalls++;
        }
        return this.snap();
      },
      kill(kind) { G.game.breach(kind); },
      winNow() { G.game.clock = 301; return this.snap(); },
      ts(v) { G.game.timeScale = v; },
      cam(id) { G.game.setCam(id); return this.snap(); },
      cams(up) { G.game.toggleCams(up); return this.snap(); },
      door(side) { G.game.toggleDoor(side); return this.snap(); },
      light(side) { G.game.toggleLight(side); return this.snap(); },
      hatch() { G.game.toggleHatch(); return this.snap(); }
    };
  }

  function boot() {
    const view = document.getElementById('view');
    G.main.viewCtx = view.getContext('2d');
    G.FX.init();
    G.ui.init();
    bindKeys();
    window.addEventListener('resize', fitStage);
    fitStage();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.game.mode === 'night' && !G.game.paused && G.ui.screenName !== 'pause') {
        G.game.paused = true;
        G.ui.showPause();
      }
    });
    if (/[?&]autotest/.test(location.search)) installTestHooks();
    G.ui.showTitle();
    requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
