import { LEVELS } from '../game/gamedata.js';
import { saveData, persist, isUnlocked } from '../game/save.js';
import { fmtTime } from '../game/mathutil.js';

const $ = (sel) => document.querySelector(sel);

export class Ui {
  constructor(game) {
    this.game = game;
    this.screens = {};
    this.helpOpen = false;
    this.buildHud();
    this.buildScreens();
    this._lastHudStr = '';
  }

  el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  // ---------------- HUD ----------------
  buildHud() {
    const hud = $('#hud');
    hud.innerHTML = `
      <div class="vign"></div>
      <div class="dmg-vignette" id="dmgv"></div>
      <div class="hud-tl">
        <div class="cores"><span class="core-dot"></span><span id="h-cores">0</span></div>
        <div class="prism-row" id="h-prisms"></div>
        <div class="chip-row" id="h-chips"></div>
      </div>
      <div class="hud-tr">
        <div class="timer" id="h-time">0:00.000</div>
      </div>
      <div class="objective" id="h-objective"></div>
      <div class="cp-toast" id="h-cptoast"></div>
      <div class="hud-bl" id="h-hints">
        <span class="hintline">SPACE jump · SHIFT overdrive · C drift/stomp · Q/E quick-step · H help</span>
      </div>
      <div class="hud-br">
        <div class="speedo"><span class="num" id="h-speed">0</span><span class="unit">KM/H</span></div>
        <div class="boostbar-wrap">
          <span class="boostbar-label">Overdrive</span>
          <div class="boostbar"><div class="fill" id="h-boost"></div></div>
        </div>
      </div>
      <div class="reticle" id="h-reticle"></div>
      <div class="combo" id="h-combo"></div>
    `;
    this.dmgV = $('#dmgv');
  }

  hudVisible(v) { $('#hud').style.display = v ? 'block' : 'none'; }

  setObjectiveMeta(prisms, chips) {
    const p = $('#h-prisms'), c = $('#h-chips');
    if (p.childElementCount !== prisms) {
      p.innerHTML = '';
      for (let i = 0; i < prisms; i++) p.appendChild(this.el('<div class="prism"></div>'));
    }
    if (c.childElementCount !== chips) {
      c.innerHTML = '';
      for (let i = 0; i < chips; i++) c.appendChild(this.el('<div class="chipdot"></div>'));
    }
  }

  hudTick(dt) {
    const g = this.game, p = g.player;
    const spd = Math.round(p.displaySpeed * 3.6);
    const str = `${spd}|${Math.round(p.boostMeter)}|${g.cores}|${g.time}|${g.prismsGot}|${g.chipsGot}`;
    if (str === this._lastHudStr) return;
    this._lastHudStr = str;
    $('#h-speed').textContent = spd;
    $('#h-boost').style.width = `${Math.round(p.boostMeter)}%`;
    $('#h-cores').textContent = g.cores;
    $('#h-time').textContent = fmtTime(g.time);
    this.setObjectiveMeta(g.totalPrisms || 0, 3);
    [...$('#h-prisms').children].forEach((el, i) => el.classList.toggle('on', i < g.prismsGot));
    [...$('#h-chips').children].forEach((el, i) => el.classList.toggle('on', i < g.chipsGot));
    // fade hints after 12s of run time
    $('#h-hints').style.opacity = String(Math.max(0, 1 - g.time / 14));
  }

  setReticleLocked(on) {
    const r = $('#h-reticle');
    if (r.classList.contains('lock') !== !!on) r.classList.toggle('lock', !!on);
  }

  objective(text) {
    const el = $('#h-objective');
    el.textContent = text;
    el.style.transition = 'none'; el.style.opacity = '1';
    setTimeout(() => { el.style.transition = 'opacity 2s'; el.style.opacity = '0.85'; }, 60);
    setTimeout(() => { el.style.opacity = '0'; }, 6500);
  }

  cpToast(text) {
    const el = $('#h-cptoast');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  comboPop(text) {
    const el = $('#h-combo');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toastmsg';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  flash(strength = 0.5) {
    const f = $('#fx-flash');
    f.style.opacity = String(strength);
    setTimeout(() => { f.style.opacity = '0'; }, 90);
    this.dmgV.style.opacity = '1';
    setTimeout(() => { this.dmgV.style.opacity = '0'; }, 420);
  }

  // ---------------- SCREENS ----------------
  show(name) {
    for (const k in this.screens) this.screens[k].classList.add('hidden');
    if (name && this.screens[name]) this.screens[name].classList.remove('hidden');
  }
  hideAll() { this.show(null); }

  buildScreens() {
    const root = $('#screens');
    const g = this.game;

    // ---- TITLE ----
    const title = this.el(`
      <div class="screen dim" id="scr-title">
        <div id="title-logo"><span class="t1">KINETIC</span><span class="t2">RUSH</span></div>
        <div class="press-start">press any key</div>
        <button class="btn ghost small" id="t-settings">settings</button>
        <div class="title-foot">an original high-speed platformer · Jolt vs the Static</div>
      </div>`);
    root.appendChild(title);
    this.screens.title = title;
    const toSelect = () => {
      if (g.mode !== 'title') return;
      g.audioTrack('coast');
      audio.ui('select');
      g.mode = 'select';
      this.refreshSelect();
      this.show('select');
    };
    window.addEventListener('keydown', (e) => { if (g.mode === 'title' && !e.repeat) toSelect(); });
    title.addEventListener('pointerdown', toSelect);
    title.querySelector('#t-settings').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.openSettings('title'); });

    // ---- SELECT ----
    const sel = this.el(`
      <div class="screen dim" id="scr-select">
        <div class="sel-head">SELECT STAGE</div>
        <div class="lv-row" id="lv-row"></div>
        <div style="display:flex;gap:14px;">
          <button class="btn ghost small" id="s-back">back</button>
          <button class="btn ghost small" id="s-settings">settings</button>
          <button class="btn ghost small" id="s-help">controls</button>
        </div>
      </div>`);
    root.appendChild(sel);
    this.screens.select = sel;
    sel.querySelector('#s-back').onclick = () => { audio.ui(); g.mode = 'title'; this.show('title'); };
    sel.querySelector('#s-settings').onclick = () => this.openSettings('select');
    sel.querySelector('#s-help').onclick = () => this.openHelp('select');

    // ---- PAUSE ----
    const pause = this.el(`
      <div class="screen dim" id="scr-pause">
        <div class="panel">
          <h2>PAUSED</h2>
          <button class="btn" id="p-resume">resume</button>
          <button class="btn magenta" id="p-restart">restart stage</button>
          <button class="btn ghost" id="p-help">controls</button>
          <button class="btn ghost" id="p-quit">quit to menu</button>
        </div>
      </div>`);
    root.appendChild(pause);
    this.screens.pause = pause;
    pause.querySelector('#p-resume').onclick = () => g.setPause(false);
    pause.querySelector('#p-restart').onclick = () => { g.restartLevel(); };
    pause.querySelector('#p-help').onclick = () => this.openHelp('pause');
    pause.querySelector('#p-quit').onclick = () => g.quitToMenu();

    // ---- SETTINGS ----
    const settings = this.el(`
      <div class="screen dim" id="scr-settings">
        <div class="panel">
          <h2>SETTINGS</h2>
          <div class="optrow"><label>graphics</label>
            <select id="set-gfx">
              <option value="ultra">Ultra</option><option value="high">High</option>
              <option value="medium">Medium</option><option value="low">Low</option>
            </select></div>
          <div class="optrow"><label>invert camera X</label><div class="tgl" id="set-invx"></div></div>
          <div class="optrow"><label>invert camera Y</label><div class="tgl" id="set-invy"></div></div>
          <div class="optrow"><label>mouse sensitivity</label><input type="range" id="set-sens" min="0.3" max="2.5" step="0.05"></div>
          <div class="optrow"><label>master volume</label><input type="range" id="set-vm" min="0" max="1" step="0.05"></div>
          <div class="optrow"><label>music volume</label><input type="range" id="set-vu" min="0" max="1" step="0.05"></div>
          <div class="optrow"><label>sfx volume</label><input type="range" id="set-vs" min="0" max="1" step="0.05"></div>
          <button class="btn" id="set-done">done</button>
        </div>
      </div>`);
    root.appendChild(settings);
    this.screens.settings = settings;
    this.settingsReturn = null;
    settings.querySelector('#set-done').onclick = () => {
      persist();
      this.show(this.settingsReturn === 'pause' ? 'pause' : this.settingsReturn === 'select' ? 'select' : 'title');
      audio.ui();
    };

    // ---- RESULTS ----
    const res = this.el(`
      <div class="screen dim" id="scr-results">
        <div style="display:flex;gap:40px;align-items:center;flex-wrap:wrap;justify-content:center;">
          <div class="bigrank" id="r-rank">S</div>
          <div>
            <div class="sel-head" id="r-title" style="font-size:34px;">STAGE CLEAR!</div>
            <div class="newrec hidden" id="r-newrec">★ NEW RECORD ★</div>
            <div class="res-stats">
              <div class="res-row"><span>time</span><b id="r-time"></b></div>
              <div class="res-row"><span>time bonus</span><b id="r-tbonus"></b></div>
              <div class="res-row"><span>spark cores</span><b id="r-cores"></b></div>
              <div class="res-row"><span>prisms</span><b id="r-prisms"></b></div>
              <div class="res-row"><span>star chips</span><b id="r-chips"></b></div>
              <div class="res-row"><span>KOs</span><b id="r-kos"></b></div>
              <div class="res-row total"><span>score</span><b id="r-score"></b></div>
            </div>
            <div style="display:flex;gap:12px;margin-top:16px;justify-content:center;">
              <button class="btn magenta" id="r-retry">retry</button>
              <button class="btn" id="r-next">next stage</button>
              <button class="btn ghost" id="r-menu">menu</button>
            </div>
          </div>
        </div>
      </div>`);
    root.appendChild(res);
    this.screens.results = res;
    res.querySelector('#r-retry').onclick = () => { audio.ui(); g.retry(); };
    res.querySelector('#r-next').onclick = () => { audio.ui(); g.nextLevel(); };
    res.querySelector('#r-menu').onclick = () => { audio.ui(); g.quitToMenu(); };

    // ---- HELP ----
    const help = this.el(`
      <div class="screen dim" id="scr-help" style="z-index:70">
        <div class="panel">
          <h2>CONTROLS</h2>
          <div class="controls-grid">
            <span><span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span></span><span class="act">run · steer (camera-relative)</span>
            <span><span class="keycap">Space</span></span><span class="act">jump — hold for height · again mid-air = double jump</span>
            <span><span class="keycap">Space</span> near enemy</span><span class="act">CHAIN DASH (homing strike)</span>
            <span><span class="keycap">Shift</span></span><span class="act">overdrive boost (burns meter)</span>
            <span><span class="keycap">Q</span>/<span class="keycap">E</span></span><span class="act">quick-step left / right</span>
            <span><span class="keycap">C</span> while turning</span><span class="act">drift — release for mini-boost</span>
            <span><span class="keycap">C</span> mid-air</span><span class="act">stomp dive</span>
            <span><span class="keycap">F</span></span><span class="act">pulse spin (ground attack)</span>
            <span><span class="keycap">X</span></span><span class="act">hard brake</span>
            <span><span class="keycap">R</span></span><span class="act">respawn at checkpoint</span>
            <span>mouse</span><span class="act">camera (right = right, up = up · wheel zoom)</span>
            <span>rails / springs / walls</span><span class="act">just move onto them — momentum does the rest</span>
            <span><span class="keycap">Esc</span>/<span class="keycap">P</span></span><span class="act">pause</span>
          </div>
          <button class="btn" id="help-done">got it</button>
        </div>
      </div>`);
    root.appendChild(help);
    this.screens.help = help;
    this.helpReturn = null;
    help.querySelector('#help-done').onclick = () => this.closeHelp();

    this.refreshSelect();
  }

  refreshSelect() {
    const row = $('#lv-row');
    row.innerHTML = '';
    const s = saveData();
    for (const lv of LEVELS) {
      const best = s.bests[lv.id];
      const unlocked = isUnlocked(lv);
      const card = this.el(`
        <div class="lv-card ${unlocked ? '' : 'locked'}">
          <div class="swatch" style="background:${lv.swatch}"></div>
          ${unlocked ? '' : '<div class="lv-lock-tag">locked</div>'}
          <div class="nm">${lv.name}</div>
          <div class="sub">${lv.sub}</div>
          <div class="stats">
            <div class="rank-badge ${best ? best.rank : ''}">${best ? best.rank : '·'}</div>
            <div>
              <div>best ${best ? fmtTime(best.time) : '--:--'}</div>
              <div style="color:#7fa8bd;font-size:11px;">par ${fmtTime(lv.par)}</div>
            </div>
          </div>
        </div>`);
      card.onclick = () => {
        if (!unlocked) { this.toast('Finish the previous stage to unlock!'); audio.ui('move'); return; }
        audio.init(); audio.resume(); audio.ui('select');
        this.game.loadLevel(lv.id);
        this.hudVisible(true);
      };
      row.appendChild(card);
    }
  }

  openSettings(returnTo) {
    this.settingsReturn = returnTo;
    const g = this.game, s = saveData().settings;
    const gfxSel = $('#set-gfx'); gfxSel.value = g.gfx.quality;
    gfxSel.onchange = () => { s.gfx = gfxSel.value; g.gfx.setQuality(gfxSel.value); persist(); };
    const bindTgl = (id, key, apply) => {
      const el = $(id); el.classList.toggle('on', !!s[key]);
      el.onclick = () => { s[key] = !s[key]; el.classList.toggle('on', s[key]); apply && apply(s[key]); persist(); audio.ui('move'); };
    };
    bindTgl('#set-invx', 'invertX', (v) => { g.input.invertX = v; });
    bindTgl('#set-invy', 'invertY', (v) => { g.input.invertY = v; });
    const sens = $('#set-sens'); sens.value = s.sens;
    sens.oninput = () => { s.sens = parseFloat(sens.value); g.input.sens = s.sens; persist(); };
    const volBind = (id, key) => {
      const el = $(id); el.value = s[key];
      el.oninput = () => { s[key] = parseFloat(el.value); audio.setVolumes(s.volMaster, s.volMusic, s.volSfx); persist(); };
    };
    volBind('#set-vm', 'volMaster'); volBind('#set-vu', 'volMusic'); volBind('#set-vs', 'volSfx');
    this.show('settings');
    audio.ui();
  }

  openHelp(returnTo) {
    this.helpReturn = returnTo;
    this.helpOpen = true;
    this.show('help');
    audio.ui();
  }
  closeHelp() {
    this.helpOpen = false;
    this.show(this.helpReturn === 'pause' ? 'pause' : this.helpReturn === 'select' ? 'select' : this.game.mode === 'play' ? null : 'title');
    if (this.helpReturn === 'play') { /* nothing */ }
    audio.ui('move');
  }
  toggleHelp() {
    if (this.helpOpen) this.closeHelp();
    else this.openHelp('play');
  }

  showResults(r, isRecord) {
    $('#r-rank').textContent = r.rank;
    $('#r-rank').className = `bigrank ${r.rank}`;
    $('#r-time').textContent = fmtTime(r.time);
    $('#r-tbonus').textContent = `+${r.timeBonus}${r.noDeath ? '  (+400 no-death)' : ''}`;
    $('#r-cores').textContent = `${r.cores}`;
    $('#r-prisms').textContent = `${r.prisms}/${r.prismsTotal}`;
    $('#r-chips').textContent = `${r.chips}/3`;
    $('#r-score').textContent = String(r.score);
    $('#r-newrec').classList.toggle('hidden', !isRecord);
    const idx = LEVELS.findIndex((l) => l.id === this.game.levelId);
    $('#r-next').style.display = idx >= LEVELS.length - 1 ? 'none' : 'inline-block';
    this.show('results');
  }
}
