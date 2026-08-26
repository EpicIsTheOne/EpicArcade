// STARWOVEN — all DOM UI: HUD, panels, summon cinematics, dialogue
"use strict";
import { CHARACTERS, CHAR_BY_ID, ELEMENTS, RARITY_COLOR, BANNERS, STORY, DIALOGUE, NPC_BARKS } from './data.js';
import { RATES } from './rng.js';
import { drawPortrait, NPC_ART, sigil, glow } from './art.js';

const $ = (sel, el = document) => el.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n));

const portraitCache = new Map();
export function portraitURL(id) {
  if (portraitCache.has(id)) return portraitCache.get(id);
  const c = document.createElement('canvas'); c.width = 480; c.height = 600;
  const ch = CHAR_BY_ID[id] || { art: NPC_ART[id], element: 'Radiant', id: id || 'x' };
  if (!ch.art) { ch.art = NPC_ART.selene; }
  drawPortrait(c, ch);
  const url = c.toDataURL('image/png');
  portraitCache.set(id, url);
  return url;
}

export class UI {
  constructor({ game, save, gacha, hooks }) {
    this.game = game; this.save = save; this.gacha = gacha; this.hooks = hooks;
    this.root = $('#ui');
    this.panelOpen = null;
    this._buildHUD(); this._buildPanels(); this._buildDialogue(); this._buildToasts();
    this.summonBusy = false;
  }

  // ================================================================== HUD
  _buildHUD() {
    this.hud = el('div', 'hud hidden');
    // currencies + menu buttons
    const tr = el('div', 'hud-tr');
    this.starChip = el('div', 'chip star', `<span class="ic">✦</span><b>0</b>`);
    this.moteChip = el('div', 'chip mote', `<span class="ic">✧</span><b>0</b>`);
    const btns = el('div', 'hud-btns');
    const mkBtn = (label, fn, hotkey) => {
      const b = el('button', 'hbtn', `${label}<span class="hk">${hotkey}</span>`);
      b.onclick = () => { this.hooks.onSfx('uiClick'); fn(); };
      return b;
    };
    btns.append(
      mkBtn('Weave', () => this.openSummon(), 'V'),
      mkBtn('Roster', () => this.openRoster(), 'C'),
      mkBtn('Team', () => this.openTeam(), 'T'),
      mkBtn('Journal', () => this.openJournal(), 'J'),
      mkBtn('Menu', () => this.openPause(), 'Esc'),
    );
    tr.append(this.starChip, this.moteChip, btns);
    // quest tracker
    this.questBox = el('div', 'quest-box');
    // party frames
    this.partyBar = el('div', 'party-bar');
    // abilities
    this.abilityBar = el('div', 'ability-bar');
    // boss bar
    this.bossBarWrap = el('div', 'boss-bar-wrap hidden',
      `<div class="boss-name"></div><div class="boss-bar"><div class="boss-fill"></div></div>`);
    // zone banner
    this.zoneBanner = el('div', 'zone-banner hidden');
    this.hud.append(tr, this.questBox, this.partyBar, this.abilityBar, this.bossBarWrap, this.zoneBanner);
    this.root.append(this.hud);
  }

  refreshCurrency() {
    this.starChip.querySelector('b').textContent = fmt(this.save.currencies.star);
    this.moteChip.querySelector('b').textContent = fmt(this.save.currencies.mote);
  }
  setQuest(html) { this.questBox.innerHTML = html; this.questBox.classList.toggle('hidden', !html); }
  showZoneBanner(name, sub) {
    this.zoneBanner.innerHTML = `<div class="zb-name">${name}</div><div class="zb-sub">${sub}</div>`;
    this.zoneBanner.classList.remove('hidden');
    clearTimeout(this._zbt);
    this._zbt = setTimeout(() => this.zoneBanner.classList.add('hidden'), 3200);
  }
  setBossBar(boss) {
    if (!boss) { this.bossBarWrap.classList.add('hidden'); return; }
    this.bossBarWrap.classList.remove('hidden');
    $('.boss-name', this.bossBarWrap).textContent = boss.def.name;
    this._updateBoss(boss);
  }
  _updateBoss(boss) {
    if (!boss) return;
    $('.boss-fill', this.bossBarWrap).style.width = Math.max(0, boss.hp / boss.maxhp * 100) + '%';
  }
  tickHUD() {
    this.refreshCurrency();
    const g = this.game;
    if (g.boss) this._updateBoss(g.boss);
    // party
    if (this._partySig !== g.party.map(u => u.charId + u.lvl).join()) {
      this._partySig = g.party.map(u => u.charId + u.lvl).join();
      this.partyBar.innerHTML = '';
      g.party.forEach((u, i) => {
        const c = CHAR_BY_ID[u.charId];
        const f = el('div', 'pframe' + (i === g.activeIdx ? ' active' : ''));
        f.innerHTML = `<img src="${portraitURL(u.charId)}"><div class="pf-bars">
          <div class="pf-hp"><i></i></div><div class="pf-en"><i></i></div>
          <span class="pf-lv">Lv ${this.save.roster[u.charId].lvl}</span>
          <kbd>${i + 1}</kbd></div>`;
        f.title = `${c.name} — ${c.role}`;
        f.onclick = () => this.hooks.onSwitchTo(i);
        this.partyBar.append(f);
      });
    } else {
      [...this.partyBar.children].forEach((f, i) => {
        f.classList.toggle('active', i === g.activeIdx);
        const u = g.party[i];
        $('.pf-hp i', f).style.width = Math.max(0, u.hp / u.maxhp * 100) + '%';
        $('.pf-en i', f).style.width = u.energy + '%';
        $('.pf-hp i', f).style.background = u.hp < u.maxhp * .3 ? '#ff6a6a' : '#7ce08a';
      });
    }
    // abilities of active
    const u = g.active;
    if (u && this._abSig !== u.charId) {
      this._abSig = u.charId;
      const c = CHAR_BY_ID[u.charId];
      this.abilityBar.innerHTML = `
        <div class="ab" id="ab-basic"><span class="ab-k">LMB</span><span class="ab-n" style="color:${ELEMENTS[c.element].color}">${c.basic.name}</span></div>
        <div class="ab cd" id="ab-skill"><svg viewBox="0 0 1 1" preserveAspectRatio="none"><rect class="cdmask" x="0" y="0" width="1" height="1"/></svg><span class="ab-k">E</span><span class="ab-n">${c.skill.name}</span></div>
        <div class="ab ult" id="ab-ult"><span class="ab-k">Q</span><span class="ab-n">${c.ult.name}</span></div>
        <div class="ab" id="ab-dodge"><span class="ab-k">SPC</span><span class="ab-n">Dodge</span></div>`;
    }
    if (u) {
      const sk = $('#ab-skill'), ul = $('#ab-ult');
      const c = CHAR_BY_ID[u.charId];
      if (sk) {
        const k = Math.max(0, u.skillCd / c.skill.cd);
        sk.classList.toggle('cooling', k > 0);
        $('.cdmask', sk).setAttribute('height', k);
      }
      if (ul) {
        ul.classList.toggle('ready', u.energy >= 100);
        ul.style.setProperty('--fill', u.energy + '%');
      }
    }
  }

  // =============================================================== panels
  _buildPanels() {
    this.panelRoot = el('div', 'panel-root hidden');
    this.root.append(this.panelRoot);
  }
  _openPanel(title, buildContent, cls = '') {
    this.closePanel(true);
    this.panelOpen = true;
    this.panelRoot.classList.remove('hidden');
    const p = el('div', 'panel ' + cls);
    const head = el('div', 'panel-head',
      `<span class="ph-title">${title}</span><button class="ph-close">✕</button>`);
    head.querySelector('.ph-close').onclick = () => { this.hooks.onSfx('uiCancel'); this.closePanel(); };
    const body = el('div', 'panel-body');
    buildContent(body, p);
    p.append(head, body);
    this.panelRoot.append(p);
    requestAnimationFrame(() => p.classList.add('shown'));
    return body;
  }
  closePanel(silent = false) {
    if (!this.panelOpen) return;
    this.panelOpen = null;
    this.panelRoot.classList.add('hidden');
    this.panelRoot.innerHTML = '';
    if (!silent) this.hooks.onPanelClosed();
  }

  // ---- roster ----
  openRoster() {
    this.hooks.onPauseGame(true);
    const body = this._openPanel('Roster — The Woven', (body) => {
      const tabs = el('div', 'roster-tabs');
      const grid = el('div', 'roster-grid');
      let mode = 'owned';
      const render = () => {
        grid.innerHTML = '';
        const list = CHARACTERS.filter(c => mode === 'owned' ? !!this.save.roster[c.id] : !this.save.roster[c.id]);
        for (const c of list.sort((a, b) => b.rarity.localeCompare(a.rarity))) {
          const owned = !!this.save.roster[c.id];
          const re = this.save.roster[c.id];
          const card = el('button', `rcard r-${c.rarity}` + (owned ? '' : ' locked'));
          card.innerHTML = `
            <img draggable="false" src="${owned ? portraitURL(c.id) : ''}">
            ${owned ? '' : '<div class="rc-unknown">?</div>'}
            <div class="rc-el" style="color:${ELEMENTS[c.element].color}">${ELEMENTS[c.element].icon}</div>
            <div class="rc-name">${owned ? c.name : 'Unwoven'}</div>
            <div class="rc-sub">${c.rarity}${owned ? ` · Lv${re.lvl}${re.asc ? ' · A' + re.asc : ''}` : ''}</div>`;
          if (owned) card.onclick = () => { this.hooks.onSfx('uiClick'); this.openDetail(c.id); };
          else card.disabled = true;
          grid.append(card);
        }
        if (!list.length) grid.append(el('div', 'roster-empty', mode === 'owned'
          ? 'No Stellars woven yet — visit the Astral Loom!'
          : 'Every fallen star has answered the call. Remarkable.'));
      };
      const tOwned = el('button', 'rtab active', `Owned (${Object.keys(this.save.roster).length})`);
      const tArc = el('button', 'rtab', 'Archive');
      tOwned.onclick = () => { mode = 'owned'; tOwned.classList.add('active'); tArc.classList.remove('active'); render(); };
      tArc.onclick = () => { mode = 'arc'; tArc.classList.add('active'); tOwned.classList.remove('active'); render(); };
      tabs.append(tOwned, tArc);
      body.append(tabs, grid);
      render();
    }, 'wide');
    void body;
  }

  // ---- character detail ----
  openDetail(charId, fromTeam = false) {
    const c = CHAR_BY_ID[charId];
    const re = this.save.roster[charId];
    const E = ELEMENTS[c.element];
    this._openPanel(`${c.name} — ${c.title}`, (body) => {
      const wrap = el('div', 'detail-wrap');
      const left = el('div', 'detail-left');
      const img = el('img', 'detail-portrait');
      img.src = portraitURL(charId); img.draggable = false;
      const rar = el('div', `detail-rar r-${c.rarity}`, '★'.repeat({ R: 1, SR: 2, SSR: 3 }[c.rarity]));
      left.append(img, rar);
      const right = el('div', 'detail-right');
      right.innerHTML = `
        <div class="dt-head">
          <span class="dt-name" style="text-shadow:0 0 18px ${RARITY_COLOR[c.rarity]}66">${c.name}</span>
          <span class="dt-title">${c.title}</span>
          <span class="dt-tags"><b style="color:${E.color}">${E.icon} ${c.element}</b><b>${c.role}</b><b class="rar-tag r-${c.rarity}">${c.rarity}</b></span>
        </div>
        <div class="dt-stats"></div>
        <p class="dt-desc">${c.desc}</p>
        <div class="dt-kit">
          <div class="kit-row"><span class="kit-k">BASIC</span><b>${c.basic.name}</b><p>${basicDesc(c)}</p></div>
          <div class="kit-row"><span class="kit-k">SKILL · E</span><b>${c.skill.name}</b><p>${c.skill.desc} <i>(CD ${c.skill.cd}s)</i></p></div>
          <div class="kit-row"><span class="kit-k">ULT · Q</span><b>${c.ult.name}</b><p>${c.ult.desc}</p></div>
          <div class="kit-row passive"><span class="kit-k">PASSIVE</span><b>${c.passive.split(':')[0]}</b><p>${c.passive.split(': ')[1] || ''}</p></div>
        </div>
        <blockquote class="dt-line">“${c.lines.reveal.replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/^"|"$/g, '')}”</blockquote>`;
      // stats live block
      const statsEl = right.querySelector('.dt-stats');
      const renderStats = () => {
        import('./game.js').then(({ unitStats }) => {
          const st = unitStats(charId, re);
          statsEl.innerHTML = `
            <div><label>Level</label><b>${re.lvl}</b></div>
            <div><label>Ascension</label><b>A${re.asc}</b></div>
            <div><label>HP</label><b>${st.maxhp}</b></div>
            <div><label>ATK</label><b>${st.atk}</b></div>
            <div><label>DEF</label><b>${st.def}</b></div>
            <div><label>Dupes</label><b>${re.dupes}</b></div>`;
        });
      };
      renderStats();
      const actions = el('div', 'dt-actions');
      const teamLabel = () => this.save.team.includes(c.id) ? 'On Team ✓' : 'Add to Team';
      if (!fromTeam) {
        const lvlBtn = el('button', 'btn gold', `Attune (+1 Level)`);
        lvlBtn.title = 'Spend Motes to raise level';
        lvlBtn.onclick = () => {
          const cost = levelCost(re.lvl);
          if (re.lvl >= 30) { this.toast('Already at max attunement.'); return; }
          if (this.save.currencies.mote < cost) { this.toast(`Need ${cost} Motes.`); this.hooks.onSfx('uiCancel'); return; }
          this.save.currencies.mote -= cost; re.lvl++;
          this.hooks.onSfx('levelup');
          this.toast(`${c.name} attuned to Lv ${re.lvl}!`);
          this.hooks.onPartyChanged();
          this.closePanel(true); this.openDetail(charId, fromTeam);
        };
        actions.append(lvlBtn);
      }
      const teamBtn = el('button', 'btn ghost', teamLabel());
      teamBtn.onclick = () => {
        const t = this.save.team, idx = t.indexOf(c.id);
        if (idx >= 0) { if (t.filter(Boolean).length <= 1) { this.toast('Team needs at least one member.'); return; } t[idx] = null; }
        else { const empty = t.indexOf(null); if (empty < 0) { this.toast('Team full — swap from Team screen.'); return; } t[empty] = c.id; }
        this.hooks.onSfx('uiConfirm'); this.hooks.onTeamChanged();
        teamBtn.textContent = teamLabel();
      };
      actions.append(teamBtn);
      right.append(actions);
      wrap.append(left, right);
      body.append(wrap);
    }, 'tall wide');
  }

  // ---- team ----
  openTeam() {
    this.hooks.onPauseGame(true);
    this._openPanel('Expedition Team', (body) => {
      const slots = el('div', 'team-slots');
      const picker = el('div', 'team-picker');
      const renderSlots = () => {
        slots.innerHTML = '';
        this.save.team.forEach((cid, i) => {
          const s = el('div', 'tslot' + (cid ? '' : ' empty'));
          if (cid) {
            const c = CHAR_BY_ID[cid];
            s.innerHTML = `<img src="${portraitURL(cid)}"><span class="ts-name">${c.name}</span>`;
            s.onclick = () => {
              if (this.save.team.filter(Boolean).length <= 1) { this.toast('Team needs at least one member.'); return; }
              this.save.team[i] = null; this.hooks.onSfx('uiCancel'); this.hooks.onTeamChanged(); renderSlots(); renderPicker();
            };
          } else {
            s.textContent = 'Empty'; s.onclick = () => { this.pickingSlot = i; renderPicker(); };
          }
          slots.append(s);
        });
      };
      const renderPicker = () => {
        picker.innerHTML = '<div class="tp-hint">' + (this.pickingSlot != null ? `Choose a Stellar for slot ${this.pickingSlot + 1}:` : 'Select an empty slot, then pick a Stellar.') + '</div>';
        const row = el('div', 'team-row');
        Object.keys(this.save.roster).filter(id => CHAR_BY_ID[id]).sort((a, b) => RARITY_ORDER_LOCAL(CHAR_BY_ID[b]) - RARITY_ORDER_LOCAL(CHAR_BY_ID[a])).forEach(id => {
          const c = CHAR_BY_ID[id];
          const b = el('button', `tslot mini r-${c.rarity}`);
          b.innerHTML = `<img src="${portraitURL(id)}"><span class="ts-name">${c.name}</span>`;
          b.onclick = () => {
            if (this.pickingSlot == null) { this.toast('Pick a slot first.'); return; }
            const existing = this.save.team.indexOf(id);
            if (existing >= 0) this.save.team[existing] = null;
            this.save.team[this.pickingSlot] = id; this.pickingSlot = null;
            this.hooks.onSfx('uiConfirm'); this.hooks.onTeamChanged();
            renderSlots(); renderPicker();
          };
          row.append(b);
        });
        picker.append(row);
      };
      body.append(slots, picker);
      renderSlots(); renderPicker();
    }, 'wide');
  }

  // ---- journal ----
  openJournal() {
    this.hooks.onPauseGame(true);
    this._openPanel("Weaver's Journal", (body) => {
      const st = this.save.story.step;
      const list = el('div', 'journal-list');
      STORY.forEach((s, i) => {
        const done = i < st, cur = i === st;
        const row = el('div', `jrow ${done ? 'done' : cur ? 'cur' : 'locked'}`);
        row.innerHTML = `<span class="j-ic">${done ? '✔' : cur ? '➤' : '🔒'}</span>
          <div><b>${s.name}</b><p>${done ? 'Woven.' : cur ? s.obj.text : 'The thread is not yet visible.'}</p></div>`;
        list.append(row);
      });
      const bounty = this.hooks.getBountyInfo();
      const bq = el('div', 'jrow cur');
      bq.innerHTML = `<span class="j-ic">◈</span><div><b>Marshal's Bounty (repeatable)</b>
        <p>Defeat ${bounty.need} Hollow foes in the field — ${bounty.have}/${bounty.need}. Reward: ${bounty.reward} ✦ + ${60} ✧.</p></div>`;
      list.append(bq);
      body.append(el('p', 'journal-note', '“Every thread pulled tight is one less silence.” — Selene'), list);
    }, 'mid');
  }

  // ---- summon ----
  openSummon(bannerIdx = 0) {
    if (this.summonBusy) return;
    this.hooks.onPauseGame(true);
    const body = this._openPanel('The Astral Loom', (body, panel) => {
      panel.classList.add('loom-panel');
      const tabs = el('div', 'banner-tabs');
      const featArea = el('div', 'banner-feat');
      const pityRow = el('div', 'pity-row');
      const btnRow = el('div', 'summon-btns');
      let cur = bannerIdx;
      const render = () => {
        const b = BANNERS[cur];
        tabs.innerHTML = '';
        BANNERS.forEach((bb, i) => {
          const t = el('button', 'btab' + (i === cur ? ' active' : ''), bb.name.split('—')[0].trim());
          t.onclick = () => { cur = i; this.hooks.onSfx('uiClick'); render(); };
          tabs.append(t);
        });
        const featChar = b.featured ? CHAR_BY_ID[b.featured] : null;
        featArea.innerHTML = `
          <div class="feat-art"><img src="${featChar ? portraitURL(featChar.id) : portraitURL('lyra')}"></div>
          <div class="feat-info">
            <div class="feat-bname">${b.name}</div>
            ${featChar ? `<div class="feat-char r-${featChar.rarity}">✦ Rate-Up: ${featChar.name} — ${featChar.title}
              <p class="feat-desc">${featChar.desc}</p></div>` : `<p class="feat-desc">All Firstfall constellations await with equal chance.</p>`}
            <div class="rates-line">
              SSR <b>2%</b> · SR <b>12%</b> · R <b>86%</b>
              <button class="linkbtn" id="rates-btn">full details</button>
              <button class="linkbtn" id="hist-btn">history</button>
            </div>
            <div class="feat-blurb">${b.blurb}</div>
          </div>`;
        featArea.querySelector('#rates-btn').onclick = () => this._showRates(b);
        featArea.querySelector('#hist-btn').onclick = () => this._showHistory();
        const pity = this.gacha.pityOf(b.id);
        pityRow.innerHTML = `<span>Weaves since SSR: <b>${pity.count}</b> / ${RATES.hardPity} guaranteed</span>
          ${pity.guaranteedFeatured ? '<span class="guarantee">Next SSR: FEATURED GUARANTEED ✦</span>' : ''}
          <span class="cost-line">Cost: 10 ✦ per weave · 90 ✦ for ten</span>`;
        btnRow.innerHTML = '';
        const mk = (n, label) => {
          const btn = el('button', 'btn weave' + (n === 10 ? ' x10' : ''), `${label}`);
          const cost = n === 10 ? RATES.costMulti : RATES.costSingle;
          btn.innerHTML += `<span class="cost">${cost} ✦</span>`;
          btn.disabled = this.save.currencies.star < cost;
          btn.onclick = () => this._doPull(b.id, n);
          return btn;
        };
        btnRow.append(mk(1, 'WEAVE ×1'), mk(10, 'WEAVE ×10'));
        this.refreshCurrency();
      };
      body.append(tabs, featArea, pityRow, btnRow);
      render();
    }, 'tall wide loom-panel');
    void body;
  }
  _showRates(b) {
    this._openPanel('Published Rates & Guarantees', (body) => {
      body.innerHTML = `
        <table class="rates-table">
          <tr><th>Rarity</th><th>Base rate</th><th>Cumulative by pull 50</th></tr>
          <tr><td class="r-SSR">SSR</td><td>2% (+6%/pull from #46)</td><td>100% (hard pity)</td></tr>
          <tr><td class="r-SR">SR</td><td>12%</td><td>—</td></tr>
          <tr><td class="r-R">R</td><td>86%</td><td>—</td></tr>
        </table>
        <ul class="rates-notes">
          <li>Hard pity: an SSR is guaranteed within ${RATES.hardPity} weaves since your last SSR (per banner).</li>
          <li>Soft pity begins at weave ${RATES.softPityStart}: +6% SSR chance per weave.</li>
          <li>${b.featured ? 'Featured rate-up: 50% of SSR pulls are ' + CHAR_BY_ID[b.featured].name + '. If a non-featured SSR appears, the NEXT SSR is guaranteed featured.' : 'Standard banner: every SSR equally likely.'}</li>
          <li>Ten-weave guarantee: at least one SR or better.</li>
          <li>Duplicates convert to Ascension; beyond A3 they refund Starpieces.</li>
          <li>No real money exists anywhere in STARWOVEN. Starpieces are earned only through play.</li>
        </ul>`;
    }, 'mid');
  }
  _showHistory() {
    this._openPanel('Weave History', (body) => {
      const list = el('div', 'hist-list');
      if (!this.save.history.length) list.append(el('p', 'roster-empty', 'No threads woven yet.'));
      for (const h of this.save.history.slice(0, 60)) {
        const c = CHAR_BY_ID[h.charId];
        const row = el('div', `hist-row r-${h.rarity}`);
        row.innerHTML = `<img src="${portraitURL(h.charId)}"><b>${c.name}</b><span>${c.rarity}</span>
          <time>${new Date(h.t).toLocaleTimeString()}</time>`;
        list.append(row);
      }
      body.append(list);
    }, 'mid');
  }

  async _doPull(bannerId, n) {
    if (this.summonBusy) return;
    const results = this.gacha.pull(bannerId, n);
    if (!results) { this.toast('Not enough Starpieces.'); this.hooks.onSfx('uiCancel'); return; }
    this.hooks.onSfx('summonWhoosh');
    this.summonBusy = true;
    this.closePanel(true);
    await this.summonSequence(results);
    this.summonBusy = false;
    this.hooks.onGachaDone(results);
  }

  // ---- THE pull cinematic ---------------------------------------------
  summonSequence(results) {
    return new Promise(resolve => {
      this.hooks.onPauseGame(true);
      const ov = el('div', 'summon-overlay');
      const cv = el('canvas', 'summon-cv'); cv.width = innerWidth; cv.height = innerHeight;
      const skipHint = el('div', 'skip-hint', 'click to continue ▸');
      const skip = el('button', 'btn ghost skip-all', 'SKIP ▸▸');
      ov.append(cv, skipHint, skip);
      this.root.append(ov);
      const ctx = cv.getContext('2d');
      const RC = { R: '#8fa3c7', SR: '#b48cff', SSR: '#ffd76b' };
      const bestR = results.reduce((b, r) => r.rarity === 'SSR' ? 'SSR' : (r.rarity === 'SR' && b !== 'SSR') ? 'SR' : b, 'R');

      let done = false, flashColor = '#ffd76b', stingPlayed = false;
      const revealedCards = [];
      const REVEAL_T0 = 1.45, GAP = .38;
      const holdEnd = REVEAL_T0 + results.length * GAP + 1.15;

      const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); ov.remove(); resolve(); };
      skip.onclick = () => { this.hooks.onSfx('uiCancel'); finish(); };
      ov.onclick = () => {
        if ((now() ) >= holdEnd) { this.hooks.onSfx('uiConfirm'); finish(); }
      };
      const now = () => performance.now();

      const revealCard = (res, i) => {
        const c = CHAR_BY_ID[res.charId];
        const E = ELEMENTS[c.element];
        const card = el('div', `scard r-${res.rarity} pos-${Math.min(i, 9)} ${res.duped ? 'duped' : ''}`);
        card.innerHTML = `
          <div class="scard-inner">
            <img src="${portraitURL(res.charId)}">
            <div class="scard-glow" style="--glow:${RC[res.rarity]}"></div>
            <div class="scard-label">
              <span class="sc-el" style="color:${E.color}">${E.icon}</span>
              <b>${c.name}</b>
              <span class="sc-rar r-${res.rarity}">${'★'.repeat({ R: 1, SR: 2, SSR: 3 }[res.rarity])}</span>
              <span class="sc-new">${res.duped ? (res.ascended ? 'ASCENDED!' : res.refund ? `DUPE → +${res.shards}✦` : 'DUPE') : res.rarity === 'SSR' ? 'FIRSTFALL SSR' : 'NEW'}</span>
            </div>
          </div>`;
        ov.append(card);
        requestAnimationFrame(() => card.classList.add('in'));
      };

      const startTs = now();
      const loop = () => {
        if (done) return;
        const t = (now() - startTs) / 1000;   // wall-clock timeline
        const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
        ctx.fillStyle = 'rgba(8,6,22,.86)'; ctx.fillRect(0, 0, W, H);

        // ambient threads always
        for (let i = 0; i < 26; i++) {
          const a = i / 26 * Math.PI * 2 + t * .12;
          ctx.strokeStyle = 'rgba(255,215,107,.08)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(cx + Math.cos(a) * W * .4, cy + Math.sin(a) * W * .25, cx + Math.cos(a + .7) * W * .55, cy + Math.sin(a + .7) * W * .45);
          ctx.stroke();
        }

        if (t < 1.05) { // PHASE 0: gather threads
          const k = Math.min(1, t / 1.05);
          for (let i = 0; i < 34; i++) {
            const a = i * 2.399 + t * 2.4;
            const rr = (1 - k) * (W * .42) + 30;
            ctx.strokeStyle = `rgba(${200 - i}, ${170}, 255, ${.14 + .2 * k})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr * 1.2);
            ctx.lineTo(cx + Math.cos(a + .12) * rr, cy + Math.sin(a + .12) * rr);
            ctx.stroke();
          }
          glow(ctx, cx, cy, 120 * k + 20, 'rgba(255,215,107,' + (.25 + k * .35) + ')', 1);
          sigil(ctx, cx, cy, 24 * k + 4, '#ffe9ad', 2, k);
          if (!this._lastTick || t - this._lastTick > .14) { this._lastTick = t; this.hooks.onSfx('weaveTick'); }
        } else { // PHASE 1/2: rarity burst + reveals
          if (!stingPlayed) { stingPlayed = true; this.hooks.onSfx(bestR === 'SSR' ? 'stingSSR' : bestR === 'SR' ? 'stingSR' : 'stingR'); flashColor = RC[bestR]; }
          const col = flashColor;
          const k = Math.min(1, (t - 1.05) / .5);
          glow(ctx, cx, cy, 90 + k * 260, col, .8 * (1 - k * .55));
          ctx.save(); ctx.translate(cx, cy);
          for (let i = 0; i < 12; i++) {
            ctx.rotate(Math.PI * 2 / 12);
            const len = (150 + Math.sin(t * 9 + i) * 40) * (bestR === 'SSR' ? 1.5 : 1);
            const grd = ctx.createLinearGradient(0, 0, len, 0);
            grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.strokeStyle = grd; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
          }
          ctx.restore();
          while (revealedCards.length < results.length && t > REVEAL_T0 + revealedCards.length * GAP) {
            const i = revealedCards.length;
            revealedCards.push(revealCard(results[i], i));
            const rr = results[i].rarity;
            this.hooks.onSfx(rr === 'SSR' ? 'stingSSR' : rr === 'SR' ? 'stingSR' : 'pickup');
          }
          skipHint.textContent = t >= holdEnd ? 'click anywhere to return ▸' : 'weaving… ▸';
        }
        raf = requestAnimationFrame(loop);
      };
      let raf = requestAnimationFrame(loop);
    });
  }

  // ---- pause / settings / help ----
  openPause() {
    if (this.panelOpen || this.summonBusy) return;
    this.hooks.onPauseGame(true);
    this._openPanel('Paused', (body) => {
      const col = el('div', 'pause-col');
      const mk = (label, fn, cls = 'btn ghost') => { const b = el('button', cls, label); b.onclick = () => { this.hooks.onSfx('uiClick'); fn(); }; return b; };
      col.append(
        mk('Resume', () => this.closePanel(), 'btn gold'),
        mk('Controls & Help', () => this.openHelp()),
        mk('Settings', () => this.openSettings()),
        mk('Return to Title', () => this.hooks.onQuitToTitle()),
      );
      col.append(el('p', 'pause-note', 'STARWOVEN — a prototype woven with love.<br>No real money. Only starlight.'));
      body.append(col);
    }, 'small');
  }
  openSettings() {
    this._openPanel('Settings', (body) => {
      const s = this.save.settings;
      const row1 = el('div', 'set-row', `<label>Music</label><input type="range" min="0" max="1" step=".05" value="${s.music}" id="set-music">`);
      const row2 = el('div', 'set-row', `<label>Sound FX</label><input type="range" min="0" max="1" step=".05" value="${s.sfx}" id="set-sfx">`);
      const row3 = el('div', 'set-row', `<label>Graphics</label><select id="set-q">
        <option value="high"${s.quality === 'high' ? ' selected' : ''}>High</option>
        <option value="low"${s.quality === 'low' ? ' selected' : ''}>Low (headless saver)</option></select>`);
      const danger = el('button', 'btn danger', 'Unravel Save (delete all progress)');
      danger.onclick = () => {
        if (danger.dataset.arm) { this.hooks.onWipeSave(); }
        else { danger.dataset.arm = '1'; danger.textContent = 'Are you sure? Click again to erase.'; }
      };
      body.append(row1, row2, row3, danger);
      $('#set-music', body).oninput = e => { s.music = +e.target.value; this.hooks.onVolumes(); };
      $('#set-sfx', body).oninput = e => { s.sfx = +e.target.value; this.hooks.onVolumes(); this.hooks.onSfx('uiClick'); };
      $('#set-q', body).onchange = e => { s.quality = e.target.value; this.game.quality = s.quality; };
    }, 'small');
  }
  openHelp() {
    this._openPanel('Controls', (body) => {
      body.innerHTML = `
      <table class="help-table">
        <tr><td><kbd>W A S D</kbd></td><td>Move</td></tr>
        <tr><td><kbd>Mouse</kbd></td><td>Aim</td></tr>
        <tr><td><kbd>LMB</kbd></td><td>Basic attack</td></tr>
        <tr><td><kbd>E</kbd></td><td>Skill</td></tr>
        <tr><td><kbd>Q</kbd></td><td>Ultimate (needs 100 energy — build it by hitting foes)</td></tr>
        <tr><td><kbd>Space</kbd></td><td>Dodge (brief invulnerability)</td></tr>
        <tr><td><kbd>F</kbd></td><td>Interact / talk / loot / travel</td></tr>
        <tr><td><kbd>1 2 3</kbd></td><td>Switch active Stellar</td></tr>
        <tr><td><kbd>C / T / J / V</kbd></td><td>Roster / Team / Journal / Loom</td></tr>
        <tr><td><kbd>H</kbd> <kbd>Esc</kbd></td><td>Help / Pause</td></tr>
      </table>
      <p class="journal-note">Element wheel: Ember ➜ Gale ➜ Verdant ➜ Tide ➜ Ember (×1.25). Radiant ⇄ Umbra strike each other for ×1.25.</p>`;
    }, 'mid');
  }

  // ============================================================ dialogue
  _buildDialogue() {
    this.dlg = el('div', 'dialogue hidden');
    this.dlg.innerHTML = `
      <img class="dlg-img" draggable="false">
      <div class="dlg-body"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-more">▼</div></div>`;
    this.dlg.onclick = () => this._advanceDlg();
    this.root.append(this.dlg);
  }
  say(lines, onDone) {
    this.hooks.onPauseGame(true);
    this._dlgLines = lines; this._dlgIdx = 0; this._dlgDone = onDone;
    this.dlg.classList.remove('hidden');
    this._renderLine();
  }
  _renderLine() {
    const line = this._dlgLines[this._dlgIdx];
    const img = $('.dlg-img', this.dlg);
    img.src = portraitURL(line.portrait || 'selene');
    img.style.visibility = line.portrait === null ? 'hidden' : 'visible';
    $('.dlg-name', this.dlg).textContent = line.who;
    const tx = $('.dlg-text', this.dlg);
    tx.textContent = '';
    clearInterval(this._tw);
    let i = 0;
    const full = line.text;
    this._tw = setInterval(() => {
      i += 2; tx.textContent = full.slice(0, i);
      if (i >= full.length) clearInterval(this._tw);
    }, 12);
  }
  _advanceDlg() {
    const line = this._dlgLines[this._dlgIdx];
    const tx = $('.dlg-text', this.dlg);
    if (tx.textContent.length < line.text.length) { // fast-forward typewriter
      clearInterval(this._tw); tx.textContent = line.text; return;
    }
    this._dlgIdx++;
    if (this._dlgIdx >= this._dlgLines.length) {
      this.dlg.classList.add('hidden');
      const cb = this._dlgDone; this._dlgDone = null;
      if (cb) cb();
      this.hooks.onPanelClosed(); // unfreeze world
    } else this._renderLine();
    this.hooks.onSfx('uiClick');
  }

  // ============================================================== toasts
  _buildToasts() {
    this.toasts = el('div', 'toasts');
    this.root.append(this.toasts);
  }
  toast(msg) {
    const t = el('div', 'toast', msg);
    this.toasts.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 2600);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }

  showHUD(v) { this.hud.classList.toggle('hidden', !v); }
}

function basicDesc(c) {
  switch (c.basic.kind) {
    case 'bolt': return `Fires piercing bolts of ${c.element.toLowerCase()} light.`;
    case 'arc': return 'A sweeping melee arc in front.';
    case 'chain': return 'A lash that strikes up to 3 nearby foes.';
    case 'lob': return 'Lobs an explosive charge that burns on impact.';
    case 'wave': return 'A crushing tide-wave with knockback.';
  }
  return '';
}
function levelCost(lvl) { return Math.round(40 * Math.pow(lvl, 1.25)); }
function RARITY_ORDER_LOCAL(c) { return { SSR: 2, SR: 1, R: 0 }[c.rarity]; }
