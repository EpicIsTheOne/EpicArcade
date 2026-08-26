// STARWEAVE — bootstrap: title screen, state machine, hook wiring, test hooks
import { Game } from './game.js';
import { UI } from './ui.js';
import { freshSave, loadSave, persist, persistSoon, wipeSave } from './save.js';
import { AudioSys } from './audio.js';
import { CHARACTERS, QUESTS, ELEMENTS } from './data.js';

const $ = (s) => document.querySelector(s);

class App {
  constructor() {
    this.game = null;
    this.ui = null;
    this.save = null;
    this.state = 'title';
    this.initTitle();
    this.starfield();
    // resume audio on first gesture
    const unlock = () => {
      if (AudioSys.ensure()) { AudioSys.resume(); if (this.state === 'title') AudioSys.setMood('title'); }
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    addEventListener('keydown', (e) => this.onKey(e));
  }

  initTitle() {
    const t = $('#title-screen');
    $('#btn-continue').classList.toggle('hidden', !loadSave());
    $('#btn-new').onclick = () => { this.startGame(true); };
    $('#btn-continue').onclick = () => { this.startGame(false); };
    $('#btn-wipe-title').onclick = () => {
      if (confirm('Erase your Starweave save?')) { wipeSave(); $('#btn-continue').classList.add('hidden'); }
    };
    // fan of featured portraits
    const fan = $('#title-fan');
    for (const id of ['solvaine', 'aster', 'vesperine']) {
      const c = document.createElement('canvas');
      const def = CHARACTERS[id];
      import('./portraits.js').then(({ paintPortrait }) => {
        c.width = 300; c.height = 400;
        paintPortrait(c, def, { elementColor: ELEMENTS[def.element].color });
        fan.appendChild(c);
        requestAnimationFrame(() => c.classList.add('fan-in'));
      });
    }
  }

  starfield() {
    const cnv = $('#starfield');
    const ctx = cnv.getContext('2d');
    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random() * 0.8 + 0.2,
      tw: Math.random() * Math.PI * 2,
    }));
    const resize = () => { cnv.width = innerWidth; cnv.height = innerHeight; };
    resize();
    addEventListener('resize', resize);
    let run = true;
    const draw = (t) => {
      if (!run) return;
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, cnv.width, cnv.height);
      for (const s of stars) {
        const a = 0.35 + 0.6 * Math.abs(Math.sin(t * 0.001 * s.z * 2 + s.tw));
        ctx.fillStyle = `rgba(255,244,214,${a})`;
        ctx.fillRect(s.x * cnv.width, s.y * cnv.height, s.z * 2.4, s.z * 2.4);
      }
    };
    requestAnimationFrame(draw);
    this._stopStars = () => { run = false; };
  }

  startGame(isNew) {
    AudioSys.ensure(); AudioSys.resume();
    this.save = isNew ? freshSave() : (loadSave() || freshSave());
    if (isNew) persist(this.save);
    $('#title-screen').classList.add('fade-out');
    setTimeout(() => {
      $('#title-screen').style.display = 'none';
      this._stopStars && this._stopStars();
    }, 700);
    this.state = 'game';
    AudioSys.setMood(this.save.unlocked.gacha ? 'hub' : 'title');

    this.game = new Game(this.makeHooks());
    this.ui = new UI(this.game, this.makeUIHooks());
    this.game.init($('#game-canvas'), this.save);
    this.ui.showHUD(true);
    this.ui.refreshCurrency();
    this.ui.refreshTeamSlots();
    this.ui.refreshQuestTracker();

    // opening story
    if (isNew || !this.save.seenChapters.includes('ch1')) {
      setTimeout(() => {
        const q = QUESTS[0];
        this.game.startDialog([
          { who: 'loom', text: '⟡ …THREAD SENSED. WEAVER… AWAKEN. THE SKY HAS WAITED A HUNDRED YEARS.' },
          ...q.intro,
        ], () => {
          this.save.seenChapters.push('ch1');
          this.hookPersistSoon();
          this.ui.toast('Follow the quest marker — talk to Elder Maren at the sanctum.', '#ffd76e');
        });
      }, 600);
    }
    this.exposeTestHooks();
  }

  hookPersistSoon() { persistSoon(this.save); }

  makeHooks() {
    // hooks passed INTO Game (game -> ui/app)
    return {
      onDamageNumber: (pos, txt, color, crit, isP) => this.ui.spawnFloater(pos, String(txt), color, crit, isP),
      onPickupText: (pos, txt, color) => this.ui.spawnFloater(pos, txt, color),
      onToast: (txt, color) => this.ui.toast(txt, color),
      onPrompt: (txt) => this.ui.prompt(txt),
      onDialog: (lines, done) => this.ui.showDialog(lines, done),
      openGacha: () => this.ui.openGacha(),
      onCurrencyUpdate: () => this.ui.refreshCurrency(),
      onPlayerStats: () => { this.ui.refreshPlayerStats(); },
      onTeamChange: () => this.ui.refreshTeamSlots(),
      onQuestUpdate: () => this.ui.refreshQuestTracker(),
      onBossHp: (f) => this.ui.setBossHp(f),
      onBossDefeated: () => this.ui.setBossHp(0),
      onRosterChange: () => this.ui.refreshTeamSlots(),
      onLevelUp: (id, lvl) => { this.ui.toast(`⬆ ${CHARACTERS[id].name} reached Lv ${lvl}!`, '#ffd76e'); AudioSys.sfx('levelup'); },
      onShield: () => {},
      onGachaUnlocked: () => {
        this.ui.toast('✦ The Astral Loom is rekindled! Visit it at the sanctum to weave new companions.', '#7fe8dd');
        AudioSys.sfx('quest');
      },
      onStoryComplete: () => this.ui.toast('★ Demo story arc complete — the sky is yours to explore!', '#ffd76e'),
      onRevived: () => this.ui.refreshPlayerStats(),
      persist: () => persist(this.save),
      persistSoon: () => persistSoon(this.save),
      onFrame: (dt) => this.onFrame(dt),
    };
  }
  makeUIHooks() {
    return {
      openPause: () => this.ui.openPause(),
      wipeAndReload: () => { wipeSave(); location.reload(); },
      persist: () => persist(this.save),
      persistSoon: () => persistSoon(this.save),
    };
  }

  onFrame(dt) {
    if (!this.ui) return;
    this.ui.refreshPlayerStats();
    this.ui.refreshTeamSlotsThrottled(dt);
    // periodic autosave
    this._saveAcc = (this._saveAcc || 0) + dt;
    if (this._saveAcc > 12) { this._saveAcc = 0; persist(this.save); }
    // periodic stats playtime
    this.save.stats.playSeconds += dt;
  }

  onKey(e) {
    if (this.state !== 'game') return;
    if (e.code === 'Escape') {
      if (this.ui.anyModalOpen()) this.ui.closeAllModals(false);
      else this.ui.openPause();
    }
  }

  exposeTestHooks() {
    window.__SW = {
      app: this,
      get game() { return this.app.game; },
      get save() { return this.app.save; },
      get ui() { return this.app.ui; },
      giveStardust: (n) => { this.game.save.stardust += n; persist(this.save); },
      grant: (id) => { this.game.grantUnit(id); persist(this.save); },
      warp: (x, z) => this.game.teleport(x, z),
      finishChapter: () => { this.game.completeStep(); this.game.completeQuest(); },
      setChapter: (i) => {
        const s = this.game.save.quests;
        s.current = i; s.step = 0; s.counters = {};
        this.ui.refreshQuestTracker();
        persist(this.save);
      },
      forceSkill: () => this.game.trySkill(),
      forceBurst: () => this.game.tryBurst(),
      state: () => ({
        pos: this.game.player.pos.toArray(),
        yaw: this.game.yaw,
        hp: this.game.player.hp,
        enemies: this.game.enemies.length,
      }),
    };
  }
}

// throttle helper for team slot DOM refresh
UI.prototype.refreshTeamSlotsThrottled = function (dt) {
  this._tsAcc = (this._tsAcc || 0) + dt;
  if (this._tsAcc > 0.25) { this._tsAcc = 0; this.refreshTeamSlots(); }
};

window.addEventListener('DOMContentLoaded', () => {
  window.__app = new App();
});
