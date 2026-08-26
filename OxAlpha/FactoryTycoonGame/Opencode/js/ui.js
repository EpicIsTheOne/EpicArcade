import { ITEMS, MACHINES, MACHINE_ORDER, PLOTS, UPGRADES, upgradeCost } from './data.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(hooks) {
    this.hooks = hooks; // game
    this.floaterPool = [];
    this._incomeHist = [];
    this.tab = 'upgrades';
    this._wire();
  }

  _wire() {
    const g = () => this.hooks;
    $('btnShop').onclick = () => g().uiToggleShop();
    $('btnHelp').onclick = () => g().uiToggleHelp();
    $('btnMute').onclick = () => g().uiToggleMute();
    $('btnPause').onclick = () => g().uiOpenPause();
    $('shopClose').onclick = () => g().uiCloseShop();
    $('helpClose').onclick = () => g().uiCloseHelp();
    $('resumeBtn').onclick = () => g().uiResume();
    $('saveBtn').onclick = () => { g().saveNow(true); };
    $('helpBtn2').onclick = () => { g().uiClosePause(); g().uiOpenHelp(); };
    $('newGameBtn').onclick = () => {
      if (confirm('Erase this factory and start over?')) g().resetGame();
    };
    $('volRange').oninput = e => g().setVolume(e.target.value / 100);
    document.querySelectorAll('#shopModal .tabs button').forEach(b => {
      b.onclick = () => {
        this.tab = b.dataset.tab;
        document.querySelectorAll('#shopModal .tabs button').forEach(x => x.classList.toggle('on', x === b));
        ['upgrades', 'land', 'stats'].forEach(t =>
          $(`tab-${t}`).classList.toggle('hidden', t !== this.tab));
        this.refreshShop();
      };
    });
  }

  // ---------- build toolbar ----------
  buildToolbar() {
    const tb = $('toolbar');
    tb.innerHTML = '';
    MACHINE_ORDER.forEach((key, i) => {
      const d = MACHINES[key];
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.type = key;
      el.innerHTML = `<div class="num">${i + 1}</div><div class="ico">${d.icon}</div><div class="nm">${d.name}</div><div class="cost">$${d.cost}</div>`;
      el.title = d.desc;
      el.onclick = () => this.hooks.uiSelectBuild(key);
      tb.appendChild(el);
    });
  }
  refreshToolbar(money, selType) {
    document.querySelectorAll('.slot').forEach(el => {
      const cost = MACHINES[el.dataset.type].cost;
      el.classList.toggle('poor', money < cost);
      el.classList.toggle('sel', el.dataset.type === selType);
    });
  }

  setCrosshair(mode) {
    const c = $('crosshair');
    c.className = mode === 'demolish' ? 'demolish' : mode ? 'build' : '';
    c.id = 'crosshair';
  }

  // ---------- money ----------
  fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  setMoney(money, totalEarned) {
    $('moneyVal').textContent = this.fmt(money);
    $('totalVal').textContent = this.fmt(totalEarned);
  }
  pushIncome(amt, now) {
    this._incomeHist.push({ amt, t: now });
  }
  incomeRate(now) {
    while (this._incomeHist.length && now - this._incomeHist[0].t > 6000) this._incomeHist.shift();
    let sum = 0;
    for (const h of this._incomeHist) sum += h.amt;
    return sum / 6;
  }
  setIncome(rate) {
    $('incomeVal').textContent = '$' + rate.toFixed(1) + '/s';
  }

  // ---------- toasts & floaters ----------
  toast(msg, cls = '') {
    const box = $('toasts');
    if (box.children.length > 3) box.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2400);
    setTimeout(() => el.remove(), 2900);
  }

  floater(worldPos, text, camera, rendererEl) {
    let el = this.floaterPool.find(f => !f.busy);
    if (!el) {
      if (this.floaterPool.length > 22) return;
      el = { div: document.createElement('div'), busy: false };
      el.div.className = 'floater';
      $('floaters').appendChild(el.div);
      this.floaterPool.push(el);
    }
    const v = worldPos.clone().project(camera);
    if (v.z > 1 || v.z < -1) return;
    const x = (v.x * 0.5 + 0.5) * rendererEl.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * rendererEl.clientHeight;
    el.busy = true;
    el.div.textContent = text;
    el.div.style.opacity = '1';
    el.t0 = performance.now();
    el.x = x; el.y = y;
    el.div.style.transform = `translate(${x}px, ${y}px)`;
    el.div.style.display = 'block';
  }
  updateFloaters(camera, rendererEl) {
    const now = performance.now();
    for (const f of this.floaterPool) {
      if (!f.busy) continue;
      const k = (now - f.t0) / 1100;
      if (k >= 1) { f.busy = false; f.div.style.display = 'none'; continue; }
      f.div.style.opacity = String(1 - k * k);
      f.div.style.transform = `translate(${f.x}px, ${f.y - k * 46}px)`;
    }
  }

  savedFlash() {
    const t = $('savedTag');
    t.classList.add('show');
    clearTimeout(this._savedTo);
    this._savedTo = setTimeout(() => t.classList.remove('show'), 1400);
  }

  // ---------- info card ----------
  showInfo(name, [cls, status], chips) {
    $('infoCard').classList.remove('hidden');
    $('infoName').textContent = name;
    const st = $('infoStatus');
    st.textContent = status;
    st.className = cls;
    $('infoBuf').innerHTML = chips.length
      ? chips.map(c => `<span class="chip">${c}</span>`).join('')
      : '<span style="opacity:.5">no items buffered</span>';
  }
  hideInfo() { $('infoCard').classList.add('hidden'); }

  // ---------- shop ----------
  refreshShop() {
    const g = this.hooks;
    const st = g.state;

    // upgrades
    const up = $('tab-upgrades');
    up.innerHTML = '';
    for (const [id, u] of Object.entries(UPGRADES)) {
      const lv = st.upgrades[id] || 0;
      const maxed = lv >= u.max;
      const cost = upgradeCost(id, lv);
      const row = document.createElement('div');
      row.className = 'upRow';
      row.innerHTML = `
        <div class="grow">
          <div class="upName">${u.name}</div>
          <div class="upDesc">${u.desc} — affects all machines</div>
          <div class="pips">${Array.from({ length: u.max }, (_, i) =>
            `<div class="pip ${i < lv ? 'on' : ''}"></div>`).join('')}</div>
        </div>
        ${maxed ? `<div class="tagOwned">MAX</div>`
                : `<button class="primary" data-up="${id}" ${st.money < cost ? 'disabled' : ''}>${this.fmt(cost)}</button>`}`;
      up.appendChild(row);
    }
    up.querySelectorAll('button[data-up]').forEach(b =>
      b.onclick = () => g.buyUpgrade(b.dataset.up));

    // land
    const land = $('tab-land');
    land.innerHTML = '<div style="font-size:12.5px;color:var(--dim);margin-bottom:10px">New plots must touch land you already own.</div>';
    for (const p of PLOTS) {
      const owned = st.plots.has(p.id);
      const buyable = g.world.plotBuyable(p.id);
      const row = document.createElement('div');
      row.className = 'landRow';
      const deps = p.deps.map(([, , r]) => r.startsWith('iron') ? '⛏ Iron' : '🔶 Copper');
      row.innerHTML = `
        <div class="grow">
          <div class="upName">${p.name} <span style="font-size:11px;color:var(--dim)">(${p.w}×${p.h} cells)</span></div>
          <div class="depChips">${deps.map(d => `<span class="chipRes">${d}</span>`).join('')}</div>
        </div>
        ${owned ? '<div class="tagOwned">✓ OWNED</div>'
          : buyable
            ? `<div><div class="landPrice">${this.fmt(p.cost)}</div>
               <button class="primary" data-plot="${p.id}" ${st.money < p.cost ? 'disabled' : ''} style="margin-top:4px">Buy</button></div>`
          : `<div class="tagLocked">🔒 needs adjacent plot</div>`}`;
      land.appendChild(row);
    }
    land.querySelectorAll('button[data-plot]').forEach(b =>
      b.onclick = () => g.buyPlot(+b.dataset.plot));

    // stats
    const stats = $('tab-stats');
    stats.innerHTML = `<div class="statGrid">
      <div class="statBox"><div class="v">${this.fmt(st.totalEarned)}</div><div class="k">Lifetime earnings</div></div>
      <div class="statBox"><div class="v">${st.itemsSold.toLocaleString('en-US')}</div><div class="k">Items sold</div></div>
      <div class="statBox"><div class="v">${st.machines.size}</div><div class="k">Machines built</div></div>
      <div class="statBox"><div class="v">${Math.floor(st.playtime / 60)}m ${Math.floor(st.playtime % 60)}s</div><div class="k">Shift time</div></div>
    </div>`;
  }

  // ---------- modal visibility ----------
  show(id, on) { $(id).classList.toggle('hidden', !on); }
  anyModalOpen() {
    return ['shopModal', 'pauseModal', 'helpModal'].some(i => !$(i).classList.contains('hidden'));
  }
}
