// hud.js — HUD widgets, menus, settings, results screen.
import { LEVELS } from '../levels/index.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.speedoCtx = this.$('speedo-canvas').getContext('2d');
    this.msgT = 0;
  }

  showScreen(name) {
    for (const s of ['title-screen', 'loading-screen', 'pause-screen', 'results-screen']) {
      this.$(s).classList.toggle('hidden', s !== name);
    }
    this.$('hud').classList.toggle('hidden', name !== null);
  }

  buildTitleMenu() {
    const save = this.game.save;
    const menu = this.$('title-menu');
    menu.innerHTML = '';
    menu.className = 'menu';
    for (const lv of LEVELS) {
      const best = save.data.bests[lv.id];
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.innerHTML = `${lv.name}<span class="sub">${best ? `BEST ${(best.time / 1000).toFixed(2)}s · SCORE ${best.score} · RANK ${best.rank}` : 'not yet cleared'} </span>`;
      btn.onclick = () => { this.game.audio.uiClick(); this.game.startLevel(lv.id); };
      menu.appendChild(btn);
    }
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.gap = '10px';
    row.appendChild(this._settingsBtn());
    menu.appendChild(row);
  }

  _settingsBtn() {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = 'SETTINGS';
    b.onclick = () => { this.game.audio.uiClick(); this.buildSettingsMenu(); };
    return b;
  }

  buildSettingsMenu(fromPause = false) {
    const menu = this.$(fromPause ? 'pause-menu' : 'title-menu');
    menu.innerHTML = '';
    menu.className = 'menu';
    const s = this.game.save.data.settings;
    const mk = (label, val, cb) => {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = `${label}: ${val}`;
      b.onclick = () => { this.game.audio.uiClick(); cb(); this.buildSettingsMenu(fromPause); };
      menu.appendChild(b);
      return b;
    };
    mk('INVERT X', s.invertX ? 'ON' : 'OFF', () => { s.invertX = !s.invertX; });
    mk('INVERT Y', s.invertY ? 'ON' : 'OFF', () => { s.invertY = !s.invertY; });
    mk('GRAPHICS', s.quality.toUpperCase(), () => {
      const q = ['low', 'medium', 'high', 'ultra'];
      s.quality = q[(q.indexOf(s.quality) + 1) % q.length];
    });
    mk('MUSIC', s.music ? 'ON' : 'OFF', () => { s.music = !s.music; });
    mk('SFX', s.sfx ? 'ON' : 'OFF', () => { s.sfx = !s.sfx; });
    const back = document.createElement('button');
    back.className = 'btn orange small';
    back.textContent = fromPause ? 'BACK' : 'DONE';
    back.onclick = () => {
      this.game.applySettings();
      if (fromPause) this.buildPauseMenu();
      else this.buildTitleMenu();
    };
    menu.appendChild(back);
  }

  buildPauseMenu() {
    const menu = this.$('pause-menu');
    menu.innerHTML = '';
    menu.className = 'menu';
    const add = (txt, cls, cb) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = txt;
      b.onclick = () => { this.game.audio.uiClick(); cb(); };
      menu.appendChild(b);
    };
    add('RESUME', 'primary', () => this.game.resume());
    add('RESTART LEVEL', '', () => this.game.startLevel(this.game.levelId));
    add('SETTINGS', '', () => this.buildSettingsMenu(true));
    add('QUIT TO TITLE', 'orange', () => this.game.quitToTitle());
  }

  /* ---------------- in-game HUD ---------------- */
  update(dt) {
    const g = this.game, p = g.player;
    // timer
    const t = g.runTime + g.penalty;
    this.$('hud-timer').textContent = fmt(t);
    this.$('hud-levelname').textContent = g.levelName;
    const best = g.save.data.bests[g.levelId];
    this.$('hud-best').textContent = best ? `BEST ${fmt(best.time)} · ${best.rank}` : '';
    // counters
    this.$('hud-sparks').textContent = `${g.sparkCount}/${g.sparkTotal}`;
    this.$('hud-secrets').textContent = `${g.boltCount}/${g.boltTotal}`;
    // hearts
    const hh = this.$('hud-hearts');
    if (hh.childElementCount !== 3) {
      hh.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('div');
        d.className = 'heart';
        d.style.background = 'radial-gradient(circle at 35% 35%, #ff8fa0, #ff2244 70%)';
        d.style.clipPath = 'path("M12 21 L4 13 A4.6 4.6 0 0 1 12 5 A4.6 4.6 0 0 1 20 13 Z")';
        hh.appendChild(d);
      }
    }
    [...hh.children].forEach((c, i) => c.classList.toggle('empty', i >= p.hearts));
    // boost bar
    this.$('boostbar').style.width = p.boostMeter.toFixed(0) + '%';
    // speedo
    this.drawSpeedo(p.horizSpeed, p.boosting);
    // messages fade
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.$('hud-center-msg').classList.remove('show');
    }
  }

  drawSpeedo(speed, boosting) {
    const ctx = this.speedoCtx, W = 220, H = 130;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - 18, r = 92;
    // arc background
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.stroke();
    const frac = Math.min(speed / 100, 1);
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#17c3b2'); grad.addColorStop(.6, '#ffd166'); grad.addColorStop(1, '#ff5964');
    ctx.strokeStyle = grad;
    ctx.shadowColor = boosting ? '#ff9f1c' : 'rgba(23,195,178,.7)';
    ctx.shadowBlur = boosting ? 16 : 8;
    if (frac > 0.01) {
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * frac); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // tick marks
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      const x1 = cx + Math.cos(a) * (r - 14), y1 = cy + Math.sin(a) * (r - 14);
      const x2 = cx + Math.cos(a) * (r - 20), y2 = cy + Math.sin(a) * (r - 20);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    this.$('speedo-num').textContent = Math.round(speed);
  }

  message(txt, dur = 1.6) {
    const el = this.$('hud-center-msg');
    el.textContent = txt;
    el.classList.add('show');
    this.msgT = dur;
  }
  toast(txt, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.textContent = txt;
    this.$('toast-layer').appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }
  damageFlash() {
    const el = this.$('damage-flash');
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  }

  /* ---------------- results ---------------- */
  showResults(data) {
    const rows = [
      ['TIME', fmt(data.time + data.penalty) + (data.penalty > 0 ? ` (+${data.penalty.toFixed(0)}s penalty)` : ''), `${data.timeScore}`],
      [`SPARKS`, `${data.sparks}/${data.sparkTotal}`, `${data.sparkScore}`],
      ['SECRET BOLTS', `${data.bolts}/${data.boltTotal}`, `${data.boltScore}`],
      ['ENEMIES', `${data.kills}`, `${data.combatScore}`],
      ['FLAWLESS BONUS', data.hits === 0 ? 'YES' : '—', `${data.noHitScore}`]
    ];
    this.$('results-rank').textContent = data.rank;
    this.$('results-title').textContent = data.levelName + ' CLEAR';
    const rc = this.$('results-rows');
    rc.innerHTML = '';
    for (const [a, b, c] of rows) {
      const r = document.createElement('div');
      r.className = 'rrow';
      r.innerHTML = `<span>${a}</span><span style="opacity:.85">${b}</span><b>${c}</b>`;
      rc.appendChild(r);
    }
    const tot = document.createElement('div');
    tot.className = 'rrow total';
    tot.innerHTML = `<span>TOTAL</span><span></span><b>${data.total}</b>`;
    rc.appendChild(tot);

    const bt = this.$('results-buttons');
    bt.innerHTML = '';
    const mk = (txt, cls, cb) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls; b.textContent = txt;
      b.onclick = () => { this.game.audio.uiClick(); cb(); };
      bt.appendChild(b);
    };
    mk('RETRY', 'small', () => this.game.startLevel(this.game.levelId));
    if (data.hasNext) mk('NEXT LEVEL', 'primary', () => this.game.startLevel(data.nextId));
    mk('TITLE', 'orange', () => this.game.quitToTitle());
    this.showScreen('results-screen');
  }
}

export function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
