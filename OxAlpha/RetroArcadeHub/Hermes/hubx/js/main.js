/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — app bootstrap + main loop */
(() => {
  const $ = s => document.querySelector(s);
  const U = ARC.util;

  const app = {
    mode: 'lobby',
    active: null,
    games: [],
    toastQueue: [],
    toasting: false,

    launch(i) {
      if (this.mode === 'game') return;
      this.mode = 'game';
      const meta = ARC.games[i];
      this.active = this.games[i];
      const g = this.active;
      g.reset();
      g.state = 'ready';

      $('#lobby').hidden = true;
      $('#gamewrap').hidden = false;

      // side panel identity
      const m = $('#side-name');
      m.textContent = meta.name;
      m.style.setProperty('--sm1', meta.gm1);
      m.style.setProperty('--sm2', meta.gm2);
      m.style.setProperty('--sm-glow', meta.gmGlow);
      $('#game-frame').style.setProperty('--gf-glow', `0 0 34px ${meta.gmGlow}`);
      $('#side-help').innerHTML = '<b>' + meta.controls.join('</b><br><b>') + '</b>';
      this.syncSide(true);
      ARC.audio.unlock();
      ARC.audio.sfx.coin();
    },

    quitToLobby() {
      if (this.mode !== 'game') return;
      // record an abandoned run too, so the fail loop always counts
      if (this.active && this.active.state === 'playing') this.active.endRun();
      this.mode = 'lobby';
      this.active = null;
      $('#gamewrap').hidden = true;
      $('#lobby').hidden = false;
      ARC.lobby.refresh();
      ARC.audio.sfx.back();
    },

    toggleMute() {
      const m = !ARC.audio.isMuted();
      ARC.audio.setMuted(m);
      ARC.store.setMuted(m);
      $('#snd-state').textContent = m ? 'OFF' : 'ON';
    },

    notifyUnlocks(fresh) {
      for (const t of fresh) this.toastQueue.push(t.name + ' CABINETS — PRESS T IN LOBBY');
      pumpToast();
    },

    syncSide(force) {
      const a = this.active;
      if (!a) return;
      const sc = String(a.score | 0), bs = String(Math.max(ARC.store.best(a.id), a.score));
      const elS = $('#side-score'), elB = $('#side-best'), elC = $('#side-career');
      if (force || elS.textContent !== sc) elS.textContent = sc;
      if (force || elB.textContent !== bs) elB.textContent = bs;
      const car = String(ARC.store.total());
      if (force || elC.textContent !== car) elC.textContent = car;
    },
  };

  let toastTimer = null;
  function pumpToast() {
    if (app.toasting || !app.toastQueue.length) return;
    app.toasting = true;
    const el = $('#unlock-toast');
    $('#unlock-text').textContent = app.toastQueue.shift();
    el.hidden = false;
    ARC.audio.sfx.unlock();
    setTimeout(() => { el.hidden = true; app.toasting = false; pumpToast(); }, 3200);
  }

  // ---------- boot ----------
  function boot() {
    ARC.store.applyTheme(ARC.store.currentTheme());
    ARC.audio.setMuted(ARC.store.isMuted());
    $('#snd-state').textContent = ARC.store.isMuted() ? 'OFF' : 'ON';

    app.gameCtx = $('#game').getContext('2d');
    // ARC.games entries are the game metas themselves ({id,name,...,cls})
    ARC.games.forEach(meta => app.games.push(new meta.cls(app, meta)));

    ARC.app = app;               // lobby needs it
    ARC.lobby.build();

    // unlock any themes earned in previous sessions that weren't toasted
    app.notifyUnlocks([]);

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(.033, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      try {
        if (app.mode === 'lobby') ARC.lobby.update(t, dt);
        else if (app.active) {
          app.active.frame(dt);
          app.syncSide(false);
        }
      } catch (err) {
        console.error(err);
      }
      ARC.input.endFrame();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // first-gesture audio unlock for pointer users
    window.addEventListener('pointerdown', () => ARC.audio.unlock(), { once: true });

    // test/debug API
    window.__HUB = {
      version: '1.0.0',
      store: ARC.store,
      app,
      state: () => ({
        mode: app.mode,
        game: app.active ? app.active.id : null,
        gstate: app.active ? app.active.state : null,
        score: app.active ? Math.floor(app.active.score) : 0,
        selected: ARC.lobby.selected,
      }),
      launch: i => app.launch(i),
      quit: () => app.quitToLobby(),
      debug: {
        hurt: () => app.active && app.active.debug('hurt'),
        score: n => app.active && app.active.debug('score', n),
        help: v => ARC.lobby.toggleHelp(v),
        // grant career points like a real recorded run would (fires unlock toasts)
        grant: (id, pts) => {
          const fresh = ARC.store.grantBest(id, pts);
          if (fresh.length) app.notifyUnlocks(fresh);
          ARC.lobby.refresh();
          return fresh.map(t => t.id);
        },
      },
    };
    window.__HUB_READY = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
