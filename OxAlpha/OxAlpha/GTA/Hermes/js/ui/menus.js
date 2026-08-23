// ============================================================
// NEON MERIDIAN — ui/menus.js
// Start screen, pause menu, settings (with live apply),
// gun shop / pay'n'spray / food interactions, death screen.
// ============================================================
'use strict';

const Menus = (() => {

  const QUALITY_LABEL = {
    qa: 'QA (software renderer / CI)',
    low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra',
  };

  class MenuMgr {
    constructor(game) {
      this.game = game;
      this.el = {
        start: document.getElementById('screen-start'),
        pause: document.getElementById('screen-pause'),
        death: document.getElementById('screen-death'),
        settings: document.getElementById('screen-settings'),
        continueBtn: document.getElementById('btn-continue'),
        newBtn: document.getElementById('btn-new'),
        resumeBtn: document.getElementById('btn-resume'),
        saveBtn: document.getElementById('btn-save'),
        settingsBtn: document.getElementById('btn-settings'),
        quitBtn: document.getElementById('btn-quit'),
        respawnBtn: document.getElementById('btn-respawn'),
        settingsBack: document.getElementById('btn-settings-back'),
        deathSub: document.getElementById('death-sub'),
        startSub: document.getElementById('start-sub'),
      };
      this.mode = 'start';   // start | playing | paused | settings | dead
      this.bindButtons();
      this.buildSettingsUI();
    }

    bindButtons() {
      const g = this.game;
      this.el.continueBtn.addEventListener('click', () => { g.audio.play('ui'); this.startGame(true); });
      this.el.newBtn.addEventListener('click', () => { g.audio.play('ui'); this.startGame(false); });
      this.el.resumeBtn.addEventListener('click', () => { g.audio.play('ui'); this.resume(); });
      this.el.saveBtn.addEventListener('click', () => {
        g.autosave();
        g.audio.play('cash');
        this.el.saveBtn.textContent = 'Saved ✓';
        setTimeout(() => this.el.saveBtn.textContent = 'Save Game', 1200);
      });
      this.el.settingsBtn.addEventListener('click', () => { g.audio.play('ui'); this.showSettings(); });
      this.el.settingsBack.addEventListener('click', () => { g.audio.play('ui'); this.hideSettings(); });
      this.el.quitBtn.addEventListener('click', () => {
        g.autosave();
        this.el.pause.classList.add('hidden');
        this.el.start.classList.remove('hidden');
        this.mode = 'start';
        g.input.exitLock();
      });
      this.el.respawnBtn.addEventListener('click', () => { g.audio.play('ui'); g.respawnPlayer(); });
    }

    startGame(useSave) {
      const g = this.game;
      if (useSave && GameState.hasSave()) {
        GameState.loadInto();
        this.el.startSub.textContent = 'Save loaded.';
      } else {
        GameState.clearSave();
        Object.assign(GameState.state, GameState.freshState());
      }
      this.el.start.classList.add('hidden');
      this.mode = 'playing';
      g.beginPlay(useSave && GameState.hasSave());
      g.input.requestLock();
    }

    pause() {
      if (this.mode !== 'playing') return;
      this.mode = 'paused';
      this.el.pause.classList.remove('hidden');
      this.el.continueBtn.parentElement // noop keep
      this.game.input.exitLock();
    }

    resume() {
      this.mode = 'playing';
      this.el.pause.classList.add('hidden');
      this.el.settings.classList.add('hidden');
      this.game.input.requestLock();
    }

    showDeath(cause, cost) {
      this.mode = 'dead';
      this.el.deathSub.textContent = `${cause} · Hospital fee: $${cost}`;
      this.el.death.classList.remove('hidden');
    }
    hideDeath() {
      this.mode = 'playing';
      this.el.death.classList.add('hidden');
      this.game.input.requestLock();
    }

    showSettings() {
      this.el.settings.classList.remove('hidden');
      this.el.pause.classList.add('hidden');
      this.mode = 'settings';
    }
    hideSettings() {
      this.el.settings.classList.add('hidden');
      if (this.game.started) {
        this.el.pause.classList.remove('hidden');
        this.mode = 'paused';
      } else {
        this.el.start.classList.remove('hidden');
        this.mode = 'start';
      }
    }

    // ---------- settings UI ----------
    buildSettingsUI() {
      const wrap = document.getElementById('settings-controls');
      const s = GameState.settings;
      wrap.innerHTML = '';

      const row = (label, control) => {
        const d = document.createElement('div');
        d.className = 'set-row';
        const l = document.createElement('label');
        l.textContent = label;
        d.appendChild(l); d.appendChild(control);
        wrap.appendChild(d);
        return d;
      };
      const select = (opts, val, cb) => {
        const sel = document.createElement('select');
        for (const [v, lbl] of opts) {
          const o = document.createElement('option');
          o.value = v; o.textContent = lbl;
          if (v === val) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => cb(sel.value));
        return sel;
      };
      const slider = (min, max, step, val, cb) => {
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
        const out = document.createElement('span');
        out.className = 'set-val';
        out.textContent = (+val).toFixed(2);
        inp.addEventListener('input', () => { out.textContent = (+inp.value).toFixed(2); cb(+inp.value); });
        const box = document.createElement('div');
        box.className = 'set-slider';
        box.appendChild(inp); box.appendChild(out);
        return box;
      };
      const checkbox = (val, cb) => {
        const inp = document.createElement('input');
        inp.type = 'checkbox'; inp.checked = !!val;
        inp.addEventListener('change', () => cb(inp.checked));
        return inp;
      };

      row('Graphics quality', select(
        Object.entries(QUALITY_LABEL), s.quality,
        v => { GameState.settings.quality = v; GameState.saveSettings(); this.game.applyQuality(v); }));

      row('Master volume', slider(0, 1, 0.05, s.masterVol, v => { s.masterVol = v; GameState.saveSettings(); this.game.audio.applyVolumes(); }));
      row('Music volume', slider(0, 1, 0.05, s.musicVol, v => { s.musicVol = v; GameState.saveSettings(); this.game.audio.applyVolumes(); }));
      row('SFX volume', slider(0, 1, 0.05, s.sfxVol, v => { s.sfxVol = v; GameState.saveSettings(); this.game.audio.applyVolumes(); }));
      row('Mouse sensitivity', slider(0.3, 2.5, 0.05, s.sens, v => { s.sens = v; GameState.saveSettings(); }));
      row('Invert mouse X', checkbox(s.invertX, v => { s.invertX = v; GameState.saveSettings(); }));
      row('Invert mouse Y', checkbox(s.invertY, v => { s.invertY = v; GameState.saveSettings(); }));
      row('Show FPS + draws', checkbox(s.showFps, v => { s.showFps = v; GameState.saveSettings(); }));
      row('Minimap zoom', slider(0.6, 2.2, 0.1, s.minimapZoom, v => { s.minimapZoom = v; GameState.saveSettings(); }));
    }
  }

  return { MenuMgr };
})();

if (typeof module !== 'undefined') module.exports = { Menus: null };
