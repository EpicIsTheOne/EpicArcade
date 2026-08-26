// STARWEAVE — UI director: title, HUD, dialogue, roster, gacha, summon cinematic
import { CHARACTERS, ELEMENTS, RARITY, BANNERS, SUMMON_COST, TIPS, QUESTS, xpNeeded, levelCap, MAX_ASCENSION, ASCENSION_COST, statAt } from './data.js';
import { paintPortrait } from './portraits.js';
import { Banner, bannerCost, ratesSummary } from './gacha.js';
import { RNG } from './rng.js';
import { AudioSys } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const V3DIST_SQ = () => {};

export class UI {
  constructor(game, hooks) {
    this.game = game;
    this.hooks = hooks;
    this.portraitCache = new Map();
    this.floaters = []; // damage numbers/pickup texts
    this.toastQueue = [];
    this.summoning = false;
    this.buildRoot();
  }

  // ------------------------------------------------ portraits
  getPortrait(charId, opts = {}) {
    const key = charId + (opts.splash ? '_s' : '');
    if (this.portraitCache.has(key)) return this.portraitCache.get(key);
    const c = document.createElement('canvas');
    c.width = opts.splash ? 480 : 300;
    c.height = opts.splash ? 640 : 400;
    const def = CHARACTERS[charId];
    paintPortrait(c, def, { ...opts, elementColor: ELEMENTS[def.element].color });
    this.portraitCache.set(key, c);
    return c;
  }

  buildRoot() {
    const root = $('#ui-root');
    // HUD
    this.hud = el('div', 'hidden');
    this.hud.id = 'hud';
    this.hud.innerHTML = `
      <div id="crosshair"></div>
      <div id="topbar">
        <div id="currency-chip" title="Stardust">✦ <span id="stardust-amt">0</span></div>
        <div id="sigil-chip" title="Ascension Sigils">◈ <span id="sigil-amt">0</span></div>
        <button id="btn-roster" class="chip-btn">Roster</button>
        <button id="btn-gacha-hud" class="chip-btn">Loom</button>
        <button id="btn-pause" class="chip-btn">☰</button>
      </div>
      <div id="quest-tracker"></div>
      <div id="bossbar" class="hidden"><div id="bossname">Umbral Colossus</div><div id="bosshpwrap"><div id="bosshp"></div></div></div>
      <div id="bottombar">
        <div id="team-slots"></div>
        <div id="abilitybar">
          <div class="ab" id="ab-skill"><div class="ab-key">F</div><div class="ab-cd"></div><div class="ab-name">Skill</div></div>
          <div class="ab burst" id="ab-burst"><div class="ab-key">Q</div><div class="ab-fill"></div><div class="ab-name">Burst</div></div>
        </div>
      </div>
      <div id="playerbars">
        <div id="hpbar"><div id="hpfill"></div><span id="hptext"></span></div>
        <div id="energybar"><div id="energyfill"></div></div>
      </div>
      <div id="prompt"></div>
      <div id="floaters"></div>
      <div id="toasts"></div>
    `;
    root.appendChild(this.hud);

    // Dialogue
    this.dialog = el('div', 'overlay hidden');
    this.dialog.id = 'dialog-overlay';
    this.dialog.innerHTML = `
      <div id="dialog-box">
        <div id="dialog-portrait"></div>
        <div id="dialog-main">
          <div id="dialog-name"></div>
          <div id="dialog-text"></div>
          <div id="dialog-next">▾ continue</div>
        </div>
      </div>`;
    root.appendChild(this.dialog);
    this._dialogLines = null; this._dialogIdx = 0; this._dialogDone = null;

    // generic modal host
    this.modalHost = el('div', 'overlay hidden');
    this.modalHost.id = 'modal-host';
    root.appendChild(this.modalHost);

    // summon cinematic
    this.cine = el('div', 'overlay hidden');
    this.cine.id = 'summon-cine';
    root.appendChild(this.cine);

    // bind hud buttons
    $('#btn-pause').onclick = () => { AudioSys.sfx('click'); this.hooks.openPause(); };
    $('#btn-roster').onclick = () => { AudioSys.sfx('click'); this.openRoster(); };
    $('#btn-gacha-hud').onclick = () => { AudioSys.sfx('click'); this.openGacha(); };
    this.dialog.addEventListener('click', () => this.advanceDialog());
  }

  showHUD(v) { this.hud.classList.toggle('hidden', !v); }

  // ------------------------------------------------ HUD updates
  refreshCurrency() {
    $('#stardust-amt').textContent = Math.floor(this.game.save.stardust);
    $('#sigil-amt').textContent = this.game.save.sigils;
  }
  refreshQuestTracker() {
    const t = $('#quest-tracker');
    const txt = this.game.questProgressText();
    if (!txt) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden');
    t.textContent = txt;
  }
  refreshPlayerStats() {
    const p = this.game.player;
    $('#hpfill').style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    $('#hptext').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`;
    $('#energyfill').style.width = `${p.energy}%`;
    const u = this.game.activeUnit();
    const def = this.game.activeDef();
    if (u && def) {
      $('#ab-skill .ab-name').textContent = def.kit.skill.name;
      $('#ab-burst .ab-name').textContent = def.kit.burst.name;
      $('#ab-burst').classList.toggle('ready', u.energy >= 100);
    }
  }
  refreshTeamSlots() {
    const host = $('#team-slots');
    host.innerHTML = '';
    this.game.save.team.forEach((id, i) => {
      const slot = el('div', 'team-slot' + (id ? '' : ' empty') + (i === this.game.activeIdx ? ' active' : ''));
      if (id) {
        const def = CHARACTERS[id];
        slot.appendChild(this.clonePortrait(id));
        const badge = el('div', 'slot-el', ELEMENTS[def.element].glyph);
        badge.style.background = ELEMENTS[def.element].color;
        slot.appendChild(badge);
        const num = el('div', 'slot-num', String(i + 1));
        slot.appendChild(num);
        const inst = this.game.teamInstances.find(t => t.id === id);
        if (inst) {
          const hpb = el('div', 'slot-hp');
          const hpf = el('div', 'slot-hp-fill');
          hpf.style.width = `${(inst.hp / inst.maxHp) * 100}%`;
          hpb.appendChild(hpf);
          slot.appendChild(hpb);
        }
        slot.title = `${def.name} · Lv ${this.game.save.roster[id].level}`;
      } else {
        slot.textContent = '?';
      }
      host.appendChild(slot);
    });
  }
  clonePortrait(charId) {
    const src = this.getPortrait(charId);
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  setBossHp(frac) {
    const bb = $('#bossbar');
    if (frac === null || frac === undefined || frac <= 0 || frac >= 1 && frac !== 0) { bb.classList.add('hidden'); return; }
    bb.classList.remove('hidden');
    $('#bosshp').style.width = `${Math.max(0, frac * 100)}%`;
  }
  prompt(text) {
    const p = $('#prompt');
    p.textContent = text || '';
    p.style.opacity = text ? 1 : 0;
  }
  toast(text, color) {
    const host = $('#toasts');
    const t = el('div', 'toast', text);
    if (color) t.style.borderColor = color, t.style.color = color;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 3400);
  }
  spawnFloater(worldPos, text, color, crit, isPlayerDmg) {
    const cam = this.game.camera;
    const v = worldPos.clone().project(cam);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * innerWidth;
    const y = (-v.y * 0.5 + 0.5) * innerHeight;
    const f = el('div', 'floater' + (crit ? ' crit' : '') + (isPlayerDmg ? ' pdmg' : ''), text);
    f.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    f.style.top = `${y}px`;
    if (color) f.style.color = color;
    $('#floaters').appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  // ------------------------------------------------ dialogue
  showDialog(lines, done) {
    this._dialogLines = lines; this._dialogIdx = -1; this._dialogDone = done;
    this.dialog.classList.remove('hidden');
    this.advanceDialog();
  }
  advanceDialog() {
    if (!this._dialogLines) return;
    this._dialogIdx++;
    AudioSys.sfx('click');
    if (this._dialogIdx >= this._dialogLines.length) {
      this.dialog.classList.add('hidden');
      const d = this._dialogDone;
      this._dialogLines = null; this._dialogDone = null;
      d && d();
      return;
    }
    const line = this._dialogLines[this._dialogIdx];
    const speakers = {
      maren: { name: 'Elder Maren', color: '#c9c2e8' },
      tobi: { name: 'Tobi', color: '#8fd4ff' },
      loom: { name: '✦ THE LOOM ✦', color: '#7fe8dd' },
      aster: { name: 'Aster', color: '#ffd76e' },
      vesperine: { name: 'Vesperine', color: '#b06cff' },
      colossus: { name: '???', color: '#ff5a6e' },
      ondotext: { name: 'Merchant Ondo', color: '#ffd76e' },
    };
    const sp = speakers[line.who] || { name: line.who, color: '#fff' };
    $('#dialog-name').textContent = sp.name;
    $('#dialog-name').style.color = sp.color;
    if (line.who === 'vesperine' || CHARACTERS[line.who]) {
      const dp = $('#dialog-portrait');
      dp.innerHTML = '';
      dp.appendChild(this.clonePortrait(line.who));
      dp.style.display = 'block';
    } else {
      $('#dialog-portrait').style.display = 'none';
    }
    // typewriter
    const tex = $('#dialog-text');
    tex.textContent = '';
    let i = 0;
    clearInterval(this._tw);
    this._tw = setInterval(() => {
      i += 2;
      tex.textContent = line.text.slice(0, i);
      if (i >= line.text.length) clearInterval(this._tw);
    }, 16);
  }

  // ------------------------------------------------ roster
  openRoster() {
    const m = this.makeModal('roster-modal', 'Starweave Roster');
    const grid = el('div', 'roster-grid');
    const ids = Object.keys(CHARACTERS).filter(id => id !== 'aster' || true);
    ids.sort((a, b) => {
      const A = this.game.save.roster[a], B = this.game.save.roster[b];
      if (!!A !== !!B) return A ? -1 : 1;
      return CHARACTERS[b].rarity - CHARACTERS[a].rarity;
    });
    for (const id of ids) {
      const owned = !!this.game.save.roster[id];
      const def = CHARACTERS[id];
      const card = el('div', `char-card r${def.rarity}` + (owned ? '' : ' locked'));
      const wrap = el('div', 'card-portrait');
      const pc = this.clonePortrait(id);
      pc.className = 'card-img';
      wrap.appendChild(pc);
      if (!owned) wrap.appendChild(el('div', 'locked-veil', 'Not yet woven'));
      card.appendChild(wrap);
      card.appendChild(el('div', 'card-el', ELEMENTS[def.element].glyph)).style.background = ELEMENTS[def.element].color;
      card.appendChild(el('div', 'card-name', owned ? def.name : '???'));
      card.appendChild(el('div', 'card-sub', `${'★'.repeat(def.rarity)} ${owned ? 'Lv ' + this.game.save.roster[id].level : def.role}`));
      card.onclick = () => { AudioSys.sfx('click'); this.openCharDetail(id); };
      grid.appendChild(card);
    }
    m.body.appendChild(grid);
    this.showModal(m);
  }
  openCharDetail(id) {
    const def = CHARACTERS[id];
    const unit = this.game.save.roster[id];
    const owned = !!unit;
    const m = this.makeModal('detail-modal', owned ? `${def.name} — ${def.title}` : '???');
    m.body.classList.add('detail-body');
    const stats = owned ? statAt(def, unit.level) : statAt(def, 1);
    m.body.innerHTML = `
      <div class="detail-left">
        <div class="detail-portrait-frame r${def.rarity}"></div>
      </div>
      <div class="detail-right">
        <div class="detail-rarity">${'★'.repeat(def.rarity)} <span class="rare-name">${RARITY[def.rarity].name}</span></div>
        <div class="detail-tags"><span class="tag" style="border-color:${ELEMENTS[def.element].color};color:${ELEMENTS[def.element].color}">${ELEMENTS[def.element].glyph} ${ELEMENTS[def.element].name}</span><span class="tag">${def.weapon}</span><span class="tag">${def.role}</span>${owned ? `<span class="tag">Resonance R${unit.resonance}</span>` : ''}</div>
        <p class="detail-bio">${def.bio}</p>
        ${owned ? `
        <div class="detail-stats">
          <div>Level <b id="d-lvl">${unit.level}</b> / ${levelCap(unit.ascension)}</div>
          <div>HP <b>${stats.hp * 2.2 | 0}</b></div><div>ATK <b>${stats.atk}</b></div><div>DEF <b>${stats.def}</b></div>
          <div>XP <b>${unit.xp}</b>/${xpNeeded(unit.level)}</div><div>Sigils <b>${this.game.save.sigils}</b> ◈</div>
        </div>
        <div class="kit-box"><b>${def.kit.skill.name}</b> <span class="cd-tag">CD ${def.kit.skill.cd}s</span><br>${def.kit.skill.desc}</div>
        <div class="kit-box burst"><b>${def.kit.burst.name}</b> <span class="cd-tag">Burst</span><br>${def.kit.burst.desc}</div>
        <div class="detail-actions">
          <button class="btn gold" id="btn-ascend" ${unit.ascension >= MAX_ASCENSION || unit.level < ASCENSION_COST[unit.ascension + 1]?.level ? 'disabled' : ''}>
            ${unit.ascension >= MAX_ASCENSION ? 'Fully Ascended' : `Ascend (${ASCENSION_COST[unit.ascension + 1].sigils} ◈, Lv${ASCENSION_COST[unit.ascension + 1].level}+)`}
          </button>
          <div class="team-set">Add to team:
            ${[0, 1, 2].map(i => `<button class="btn tiny team-slot-btn" data-slot="${i}">${this.game.save.team[i] === id ? '●' : i + 1}</button>`).join('')}
          </div>
        </div>` : `<div class="locked-note">This companion awaits within the starlight… weave them at the Loom.</div>`}
      </div>`;
    // inject portrait after layout nodes exist
    const frame = m.body.querySelector('.detail-portrait-frame');
    const pc = this.clonePortrait(id, true);
    pc.className = 'detail-img';
    frame.appendChild(pc);
    if (owned) {
      m.body.querySelector('#btn-ascend')?.addEventListener('click', () => {
        const next = ASCENSION_COST[unit.ascension + 1];
        if (!next || this.game.save.sigils < next.sigils || unit.level < next.level) { AudioSys.sfx('error'); return; }
        this.game.save.sigils -= next.sigils;
        unit.ascension++;
        AudioSys.sfx('levelup');
        this.toast(`${def.name} ascended! ★${unit.ascension}`, '#b07aff');
        this.refreshCurrency();
        this.game.buildTeam();
        this.closeModal();
        this.openCharDetail(id);
      });
      m.body.querySelectorAll('.team-slot-btn').forEach(b => {
        b.onclick = () => {
          const slot = parseInt(b.dataset.slot);
          const cur = this.game.save.team.indexOf(id);
          if (cur >= 0) this.game.save.team[cur] = null;
          const prev = this.game.save.team[slot];
          if (prev && cur >= 0) this.game.save.team[cur] = prev;
          this.game.save.team[slot] = id;
          this.game.buildTeam();
          this.refreshTeamSlots();
          AudioSys.sfx('click');
          this.closeModal();
        };
      });
    }
    this.showModal(m);
  }

  // ------------------------------------------------ gacha
  openGacha() {
    const m = this.makeModal('gacha-modal', '✦ The Astral Loom ✦');
    m.body.innerHTML = `<div id="loom-flavor">Threads of fallen stars drift through the great ring. Weave them into companions.</div>`;
    const bannerWrap = el('div', 'banner-wrap');
    for (const bd of BANNERS) {
      const st = this.game.save.banners[bd.id] || { pulls: 0, pity4: 0, guaranteeFeatured: false };
      const b = el('div', `banner-card ${bd.featured ? 'featured' : 'beginner'}`);
      const featDef = bd.featured ? CHARACTERS[bd.featured] : null;
      b.innerHTML = `
        <div class="banner-art"></div>
        <div class="banner-info">
          <div class="banner-name">${bd.name}</div>
          <div class="banner-sub">${bd.subtitle}</div>
          <div class="banner-pity">5★ pity: ${st.pulls}/80 · guaranteed featured: ${st.guaranteeFeatured ? 'YES' : 'no'}</div>
          <button class="link rates-link">Rates & rules</button>
        </div>
        <div class="banner-btns">
          <button class="btn pull single">Weave ×1<br><small>✦160</small></button>
          <button class="btn gold pull multi">Weave ×10<br><small>✦${bd.beginner ? 1280 : 1600}${bd.beginner ? ' (20% off)' : ''}</small></button>
        </div>`;
      const artHost = b.querySelector('.banner-art');
      if (featDef) artHost.appendChild(this.clonePortrait(bd.featured, true));
      else artHost.appendChild(this.clonePortrait(this.game.save.team[0] || 'aster'));
      b.querySelector('.rates-link').onclick = (e) => { e.stopPropagation(); this.showRates(bd); };
      b.querySelectorAll('.pull').forEach(btn => {
        btn.onclick = () => {
          const multi = btn.classList.contains('multi');
          if (bd.beginner && multi && (st.beginnerUses || 0) >= bd.maxMultUses) { AudioSys.sfx('error'); this.toast('Beginner weave limit reached.', '#8fa8c9'); return; }
          const cost = bannerCost(bd, multi);
          if (this.game.save.stardust < cost) { AudioSys.sfx('error'); this.toast(`Need ✦${cost} Stardust. Battle and explore to earn more!`, '#ff9a3c'); return; }
          this.doSummon(bd, multi);
        };
      });
      bannerWrap.appendChild(b);
    }
    m.body.appendChild(bannerWrap);
    // history link
    const histBtn = el('button', 'btn tiny', 'Summon history');
    histBtn.onclick = () => this.showHistory();
    m.body.appendChild(histBtn);
    this.showModal(m);
  }
  showRates(bd) {
    const mm = this.makeModal('rates-modal', `Rates — ${bd.name}`);
    const rows = ratesSummary(bd);
    mm.body.innerHTML = rows.map(r => `<div class="rate-row"><b>${r.label}</b><span>${r.chance}</span></div>`).join('');
    mm.body.innerHTML += `<p class="fine">All summons are local, deterministic-seeded, and logged. No purchases exist in this prototype — Stardust is earned by playing.</p>`;
    this.showModal(mm, true);
  }
  showHistory() {
    const mm = this.makeModal('hist-modal', 'Summon History (newest first)');
    const h = this.game.save.history.slice(0, 60);
    mm.body.innerHTML = h.length ? h.map(x => `
      <div class="hist-row r${x.rarity}">
        <span class="hist-star">${'★'.repeat(x.rarity)}</span>
        <span>${CHARACTERS[x.charId].name}</span>
        <span class="hist-meta">${x.banner} · pull #${x.pullIndex}${x.dupe ? ' · dupe→R' + x.resonanceAfter : ''}</span>
      </div>`).join('') : '<p>No summons yet.</p>';
    this.showModal(mm, true);
  }

  doSummon(bd, multi) {
    if (this.summoning) return;
    const cost = bannerCost(bd, multi);
    this.game.save.stardust -= cost;
    this.refreshCurrency();
    let bs = this.game.save.banners[bd.id];
    if (!bs) bs = this.game.save.banners[bd.id] = { pulls: 0, pity4: 0, guaranteeFeatured: false, beginnerUses: 0 };
    if (bd.beginner && multi) bs.beginnerUses = (bs.beginnerUses || 0) + 1;
    const banner = new Banner(bd, bs);
    const rng = new RNG((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    const results = multi ? banner.rollMulti(rng, new Set(Object.keys(this.game.save.roster))) : [banner.rollOne(rng, new Set(Object.keys(this.game.save.roster)))];
    // apply
    let totalPullsBefore = this.game.save.stats.summons;
    for (const r of results) {
      this.game.save.stats.summons++;
      const unit = this.game.save.roster[r.charId];
      if (!unit) {
        this.game.save.roster[r.charId] = { level: 1, xp: 0, ascension: 0, resonance: 0 };
        r.isNew = true;
      } else if (unit.resonance < 5) {
        unit.resonance++;
        r.dupe = true;
      } else {
        this.game.save.stardust += 120;
        r.dupe = true; r.refund = 120;
      }
      this.game.save.history.unshift({
        charId: r.charId, rarity: r.rarity, banner: bd.name,
        pullIndex: this.game.save.stats.summons, dupe: !!r.dupe,
        resonanceAfter: this.game.save.roster[r.charId].resonance,
      });
    }
    this.game.save.history = this.game.save.history.slice(0, 200);
    this.game.buildTeam();
    this.hooks.persist();
    this.closeModal();
    this.playSummonCinematic(results, multi);
  }

  playSummonCinematic(results, multi) {
    this.summoning = true;
    this.game.paused = true;
    document.exitPointerLock && document.exitPointerLock();
    const cine = this.cine;
    cine.innerHTML = '';
    cine.classList.remove('hidden');
    AudioSys.setMood('gacha');
    AudioSys.sfx('riser', { dur: multi ? 2.4 : 1.8 });

    // loom animation stage
    const stage = el('div', 'cine-stage');
    const ringEl = el('div', 'cine-ring');
    const threadCnv = el('canvas', 'cine-threads');
    threadCnv.width = innerWidth; threadCnv.height = innerHeight;
    stage.appendChild(threadCnv);
    stage.appendChild(ringEl);
    cine.appendChild(stage);
    const skipHint = el('div', 'skip-hint', multi ? 'weaving ten threads…' : 'a single thread takes shape…');
    cine.appendChild(skipHint);

    const tctx = threadCnv.getContext('2d');
    let t0 = performance.now();
    const dur = multi ? 2600 : 1900;
    const bestRarity = Math.max(...results.map(r => r.rarity));

    const drawThreads = (now) => {
      const t = (now - t0) / dur;
      tctx.clearRect(0, 0, threadCnv.width, threadCnv.height);
      const cx = threadCnv.width / 2, cy = threadCnv.height / 2;
      const n = 26;
      for (let i = 0; i < n; i++) {
        const ph = i * 0.618;
        tctx.strokeStyle = `rgba(${180 + Math.sin(ph * 7) * 60},${150 + Math.sin(ph * 3) * 40},255,${0.25 + 0.4 * Math.abs(Math.sin(t * 6 + ph))})`;
        tctx.lineWidth = 1.4;
        tctx.beginPath();
        for (let x = 0; x <= 60; x++) {
          const k = x / 60;
          const y = cy + Math.sin(k * 10 + t * 8 + ph) * (140 - t * 90) * Math.sin(k * Math.PI);
          tctx[x ? 'lineTo' : 'moveTo'](cx + (k - 0.5) * threadCnv.width * 0.9, y);
        }
        tctx.stroke();
      }
      ringEl.style.transform = `translate(-50%,-50%) scale(${0.6 + Math.min(t, 1) * 0.55 + Math.sin(t * 20) * 0.02}) rotate(${t * 220}deg)`;
      ringEl.style.boxShadow = `0 0 ${60 + t * 140}px rgba(255,215,110,${0.35 + t * 0.4}), inset 0 0 80px rgba(176,108,255,${0.3 + t * 0.3})`;
      if (now - t0 < dur && !this._skipCine) requestAnimationFrame(drawThreads);
      else revealCards();
    };
    requestAnimationFrame(drawThreads);

    const revealCards = () => {
      stage.remove(); skipHint.remove();
      this._skipCine = false;
      const seq = el('div', 'reveal-seq');
      cine.appendChild(seq);
      let idx = 0;
      const revealNext = () => {
        if (idx >= results.length) { finishSummary(); return; }
        const r = results[idx++];
        seq.innerHTML = '';
        const cardWrap = el('div', `reveal-card r${r.rarity}`);
        const pc = this.clonePortrait(r.charId, r.rarity >= 4);
        pc.className = 'reveal-img';
        const def = CHARACTERS[r.charId];
        cardWrap.appendChild(pc);
        cardWrap.appendChild(el('div', 'reveal-stars', '★'.repeat(r.rarity)));
        cardWrap.appendChild(el('div', 'reveal-name', def.name));
        cardWrap.appendChild(el('div', 'reveal-title', def.title));
        if (r.isNew) cardWrap.appendChild(el('div', 'reveal-new', 'NEW!'));
        if (r.refund) cardWrap.appendChild(el('div', 'reveal-new refund', `dupe → ✦${r.refund}`));
        else if (r.dupe) cardWrap.appendChild(el('div', 'reveal-new reso', `Resonance R${this.game.save.roster[r.charId].resonance}`));
        seq.appendChild(cardWrap);
        requestAnimationFrame(() => cardWrap.classList.add('in'));
        AudioSys.sfx(r.rarity === 5 ? 'reveal5' : r.rarity === 4 ? 'reveal4' : 'reveal3');
        if (r.rarity === 5) {
          cine.classList.add('gold-flash');
          setTimeout(() => cine.classList.remove('gold-flash'), 900);
          AudioSys.playVoice(`summon_${r.charId}`);
        } else if (r.rarity === 4) {
          cine.classList.add('violet-flash');
          setTimeout(() => cine.classList.remove('violet-flash'), 600);
        }
        const waitMs = r.rarity === 5 ? 2100 : 900;
        this._cineTimer = setTimeout(() => { if (!this._skipCine) revealNext(); }, waitMs);
      };
      cine.onclick = () => {
        if (idx < results.length) { clearTimeout(this._cineTimer); revealNext(); }
      };
      const finishSummary = () => {
        cine.onclick = null;
        seq.innerHTML = '';
        const grid = el('div', 'reveal-grid');
        for (const r of results) {
          const mini = el('div', `mini-card r${r.rarity}`);
          mini.appendChild(this.clonePortrait(r.charId));
          mini.appendChild(el('div', 'mini-name', CHARACTERS[r.charId].name));
          mini.appendChild(el('div', 'mini-stars', '★'.repeat(r.rarity)));
          if (r.isNew) mini.appendChild(el('div', 'mini-badge new', 'NEW'));
          else if (r.refund) mini.appendChild(el('div', 'mini-badge', `✦+${r.refund}`));
          else if (r.dupe) mini.appendChild(el('div', 'mini-badge reso', `R${this.game.save.roster[r.charId].resonance}`));
          grid.appendChild(mini);
        }
        seq.appendChild(grid);
        seq.appendChild(el('div', 'summary-tip', bestRarity === 5 ? 'A Celestial answers the Loom!' : 'The weave holds. Keep exploring to earn more ✦'));
        const done = el('button', 'btn gold done-btn', 'Continue');
        done.onclick = (e) => {
          e.stopPropagation();
          this.endSummon();
        };
        seq.appendChild(done);
        AudioSys.sfx(bestRarity === 5 ? 'fanfare2' : 'quest');
        this.refreshCurrency();
      };
      revealNext();
    };
  }
  endSummon() {
    clearTimeout(this._cineTimer);
    this._skipCine = true;
    this.cine.classList.add('hidden');
    this.cine.innerHTML = '';
    this.summoning = false;
    this.game.paused = false;
    AudioSys.setMood('hub');
    this.refreshCurrency();
    this.refreshTeamSlots();
  }

  // ------------------------------------------------ pause/settings/help
  openPause() {
    this.game.paused = true;
    document.exitPointerLock && document.exitPointerLock();
    const m = this.makeModal('pause-modal', 'Paused — Starweave');
    const s = this.game.save.settings;
    m.body.innerHTML = `
      <div class="pause-cols">
        <div>
          <h3>Settings</h3>
          <label class="set-row">Music <input type="range" id="set-music" min="0" max="1" step="0.05" value="${s.music}"></label>
          <label class="set-row">SFX <input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${s.sfx}"></label>
          <label class="set-row">Graphics
            <select id="set-quality"><option value="high"${s.quality === 'high' ? ' selected' : ''}>High (bloom)</option><option value="low"${s.quality === 'low' ? ' selected' : ''}>Performance</option></select>
          </label>
          <h3>Data</h3>
          <button class="btn tiny" id="btn-export">Copy save code</button>
          <button class="btn tiny danger" id="btn-wipe">Erase save</button>
        </div>
        <div>
          <h3>Controls</h3>
          <div class="controls-list">
            <div><b>W A S D</b> move (camera-relative)</div>
            <div><b>Mouse</b> look (click scene to capture)</div>
            <div><b>Left click</b> attack combo / shoot</div>
            <div><b>F</b> elemental skill</div>
            <div><b>Q</b> burst (needs 100 energy)</div>
            <div><b>Shift</b> dash (invulnerable)</div>
            <div><b>Space</b> jump</div>
            <div><b>E</b> interact / advance dialogue</div>
            <div><b>1 2 3</b> swap hero</div>
            <div><b>Esc</b> pause</div>
          </div>
          <h3>Tip</h3>
          <div class="tip-box">${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>
        </div>
      </div>`;
    const actions = el('div', 'modal-actions');
    const resume = el('button', 'btn gold', 'Resume');
    resume.onclick = () => { this.closeModal(); };
    actions.appendChild(resume);
    m.footer.appendChild(actions);
    this.showModal(m);
    m.body.querySelector('#set-music').oninput = (e) => { s.music = parseFloat(e.target.value); AudioSys.applySettings(s); this.hooks.persistSoon(); };
    m.body.querySelector('#set-sfx').oninput = (e) => { s.sfx = parseFloat(e.target.value); AudioSys.applySettings(s); this.hooks.persistSoon(); };
    m.body.querySelector('#set-quality').onchange = (e) => { s.quality = e.target.value; this.game.applyQuality(s.quality); this.hooks.persistSoon(); };
    m.body.querySelector('#btn-wipe').onclick = () => {
      if (confirm('Erase your Starweave save? This cannot be undone.')) {
        this.hooks.wipeAndReload();
      }
    };
    m.body.querySelector('#btn-export').onclick = (e) => {
      try {
        navigator.clipboard.writeText(btoa(JSON.stringify(this.game.save)));
        e.target.textContent = 'Copied!';
      } catch (err) { e.target.textContent = 'Clipboard blocked'; }
    };
  }

  // ------------------------------------------------ modal plumbing
  makeModal(id, title) {
    const ov = el('div', 'overlay hidden');
    ov.id = id;
    const box = el('div', 'modal-box');
    const head = el('div', 'modal-head');
    head.appendChild(el('div', 'modal-title', title));
    const close = el('button', 'modal-close', '✕');
    close.onclick = () => this.closeModal();
    head.appendChild(close);
    box.appendChild(head);
    const body = el('div', 'modal-body');
    box.appendChild(body);
    const footer = el('div', 'modal-foot');
    box.appendChild(footer);
    ov.appendChild(box);
    this._modalStack = this._modalStack || [];
    this._modalStack.push(ov);
    return { ov, body, footer };
  }
  showModal(m, stacked) {
    if (!stacked) this.closeAllModals(true);
    $('#modal-host').appendChild(m.ov);
    requestAnimationFrame(() => m.ov.classList.remove('hidden'));
    this.game.paused = true;
    document.exitPointerLock && document.exitPointerLock();
    AudioSys.sfx('click');
  }
  closeModal() {
    const stack = this._modalStack || [];
    const top = stack.pop();
    if (top) top.remove();
    if (stack.length === 0) {
      this.game.paused = false;
      if (!$('#dialog-overlay')?.classList.contains('hidden') === false) {}
    }
  }
  closeAllModals(keepPaused) {
    const host = $('#modal-host');
    host.innerHTML = '';
    this._modalStack = [];
    if (!keepPaused) this.game.paused = false;
  }
  anyModalOpen() { return ($('#modal-host').children.length > 0); }

  onFrame(dt) {
    // nothing per-frame heavy; floaters are DOM-animated via CSS
  }
}
