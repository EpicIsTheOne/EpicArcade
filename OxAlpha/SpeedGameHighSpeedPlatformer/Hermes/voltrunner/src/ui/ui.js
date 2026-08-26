// DOM UI: HUD refresh, menus, level select, options, results. All wiring via hooks.
const $ = id => document.getElementById(id);

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    this.screens = ['boot', 'title', 'levelselect', 'controls-panel', 'options-panel', 'pause', 'results'];
    this._comboT = 0; this._toastT = 0;
    // buttons
    $('btn-play').onclick = () => { hooks.audio.uiClick(); hooks.play(0); };
    $('btn-levels').onclick = () => { hooks.audio.uiClick(); this.show('levelselect'); };
    $('btn-levels-back').onclick = () => { hooks.audio.uiBack(); this.show('title'); };
    $('btn-controls').onclick = () => { hooks.audio.uiClick(); this.show('controls-panel'); };
    $('btn-controls-back').onclick = () => { hooks.audio.uiBack(); this.show('title'); };
    $('btn-options').onclick = () => { hooks.audio.uiClick(); this.show('options-panel'); };
    $('btn-options-back').onclick = () => { hooks.audio.uiBack(); this.show('title'); };
    $('btn-resume').onclick = () => { hooks.resume(); };
    $('btn-restart').onclick = () => { hooks.audio.uiClick(); hooks.restart(); };
    $('btn-quit').onclick = () => { hooks.audio.uiBack(); hooks.quit(); };
    $('btn-retry').onclick = () => { hooks.audio.uiClick(); hooks.restart(); };
    $('btn-next').onclick = () => { hooks.audio.uiClick(); hooks.next(); };
    $('btn-res-menu').onclick = () => { hooks.audio.uiBack(); hooks.quit(); };
    this.bindOptions();
  }
  bindOptions() {
    const opts = JSON.parse(localStorage.getItem('voltrunner_opts') || '{}');
    const q = opts.quality ?? 'ultra';
    $('opt-quality').value = q;
    $('opt-invx').checked = !!opts.invx;
    $('opt-invy').checked = !!opts.invy;
    $('opt-music').value = opts.music ?? 55;
    $('opt-sfx').value = opts.sfx ?? 80;
    const apply = () => {
      const o = {
        quality: $('opt-quality').value,
        invx: $('opt-invx').checked, invy: $('opt-invy').checked,
        music: +$('opt-music').value, sfx: +$('opt-sfx').value,
      };
      localStorage.setItem('voltrunner_opts', JSON.stringify(o));
      this.hooks.applyOptions(o);
    };
    for (const id of ['opt-quality', 'opt-invx', 'opt-invy', 'opt-music', 'opt-sfx'])
      $(id).onchange = apply;
    apply();
  }
  show(name) {
    for (const s of this.screens) $(s).classList.add('hidden');
    if (name) $(name).classList.remove('hidden');
  }
  setState(state, d) {
    switch (state) {
      case 'boot': this.show('boot'); break;
      case 'title': this.show('title'); $('hud').classList.add('hidden'); break;
      case 'levelselect': this.show('levelselect'); break;
      case 'controls-panel': this.show('controls-panel'); break;
      case 'options-panel': this.show('options-panel'); break;
      case 'loading': this.show('boot'); break;
      case 'playing': this.show(null); $('hud').classList.remove('hidden'); $('lock-hint').classList.remove('hidden'); break;
      case 'paused': this.show('pause'); break;
      case 'results': this.fillResults(d); this.show('results'); $('lock-hint').classList.add('hidden'); break;
    }
  }
  showBoot(v, msg) {
    if (v) { this.show('boot'); if (msg) $('bootmsg').textContent = msg; }
    else if ($('boot').classList.contains('hidden') === false && this.hooks.state() === 'loading') { /* replaced by setState */ }
  }
  buildLevelCards(metas, save, onPick) {
    const wrap = $('level-cards'); wrap.innerHTML = '';
    metas.forEach((m, i) => {
      const rec = save.levels[i];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="swatch" style="background:${m.swatch}"></div>
        <h3>${m.name}</h3>
        <div class="desc">${m.desc}</div>
        <div class="best">${rec ? `BEST ${fmtTime(rec.bestTime)} · ${rec.bestRank}` : 'NOT CLEARED'}</div>
        ${rec && rec.bestRank !== '-' ? `<div class="rankbadge">${rec.bestRank}</div>` : ''}
      `;
      card.onclick = () => { this.hooks.audio.uiClick(); onPick(i); };
      wrap.appendChild(card);
    });
  }
  hudInit(d) {
    $('hud-gems').innerHTML = d.level.gems.map(() => '<span class="dim">◆</span>').join('');
    this._heartsPrev = -1;
    this.hudUpdate(d, 0);
  }
  hudUpdate(d, dt) {
    $('hud-time').textContent = fmtTime(d.time);
    $('hud-volts').textContent = d.voltsGot;
    const sp = d.player.vel.length() * 3.6;
    const el = $('hud-speed');
    el.textContent = Math.round(sp);
    el.classList.toggle('hot', sp > 500);
    $('hud-boost-fill').style.width = d.player.boost + '%';
    if (d.player.hp !== this._heartsPrev) {
      this._heartsPrev = d.player.hp;
      let s = '';
      for (let i = 0; i < d.player.maxHp; i++) s += i < d.player.hp ? '<span style="color:#ff3d81">◈</span>' : '<span style="opacity:.25">◇</span>';
      $('hud-hearts').innerHTML = s;
    }
    // combo popup
    this._comboT -= dt;
    if (this._comboT <= 0) $('hud-combo').style.opacity = 0;
    this._toastT -= dt;
    if (this._toastT <= 0) $('hud-toast').style.opacity = 0;
  }
  combo(n) {
    const el = $('hud-combo');
    el.textContent = n > 1 ? `×${n} CHAIN!` : 'STRIKE!';
    el.style.opacity = 1;
    this._comboT = 1.1;
  }
  gemGot(idx, total) {
    const spans = $('hud-gems').children;
    if (spans[idx]) spans[idx].classList.remove('dim');
  }
  toast(msg, dur = 1.6) {
    const el = $('hud-toast');
    el.textContent = msg;
    el.style.opacity = 1;
    this._toastT = dur;
  }
  fillResults(d) {
    const r = d.lastResults;
    $('res-rank').textContent = r.rank;
    $('res-stats').innerHTML = [
      ['TIME', fmtTime(r.time)],
      ['SCORE', String(r.score)],
      ['VOLTS', `${r.voltsGot}/${r.totalVolts}`],
      ['GEMS', `${r.gemsGot}/${r.totalGems}`],
      ['ENEMIES', String(r.enemies)],
      ['BEST CHAIN', `×${r.combo}`],
      ['DEATHS', String(r.deaths)],
      ['TOP SPEED', `${Math.round(r.maxSpeed * 3.6)} KM/H`],
    ].map(([k, v]) => `<div class="row"><span>${k}</span><span class="val">${v}</span></div>`).join('');
    $('btn-next').style.display = d.levelIndex < LEVEL_COUNT - 1 ? '' : 'none';
  }
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
let LEVEL_COUNT = 0;
export function setLevelCount(n) { LEVEL_COUNT = n; }
