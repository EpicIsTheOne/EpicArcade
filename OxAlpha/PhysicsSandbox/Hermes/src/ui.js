// DOM UI: HUD, spawn palette, tool dock, settings, hover badge, toasts, help.
window.SB = window.SB || {};
SB.UI = (function () {
  const T = () => window.THREE;

  const I = {
    box: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
    barrel: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><ellipse cx="12" cy="6" rx="6" ry="2.4"/><path d="M6 6v12M18 6v12"/><path d="M6 10c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4M6 15c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4"/></svg>',
    ball: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M5 9c3 2 11 2 14 0M5 15c3-2 11-2 14 0"/></svg>',
    plank: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="2.5" y="9.5" width="19" height="5" rx="1"/><path d="M7 9.5v5M17 9.5v5"/></svg>',
    boulder: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M7 4l7-1 6 5 1 7-6 6H8l-4-5z"/><path d="M7 4l4 6-3 10M11 10h10"/></svg>',
    heavy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="1.5"/><rect x="8" y="8" width="8" height="8"/></svg>',
    foam: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="4" y="6" width="16" height="13" rx="2.5"/><path d="M8 10.5c1-.8 2-.8 3 0s2 .8 3 0 2-.8 3 0" opacity=".7"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="5.5" r="2.6"/><path d="M9.8 7.8c-1 2.2-2.6 4-2.6 6.6C7.2 18 9.4 21 12 21s4.8-3 4.8-6.6c0-2.6-1.6-4.4-2.6-6.6"/></svg>',
    bomb: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="11" cy="14" r="6.5"/><path d="M15 9.5L17.5 7M17.5 7l1.5-1.5M20 9l-2.5-2"/><path d="M17.5 7c.8-.8 2-.8 2.5 0"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M3 13h14l3-5"/><rect x="3" y="13" width="15" height="4" rx="1"/><circle cx="7" cy="19" r="1.8"/><circle cx="14" cy="19" r="1.8"/></svg>',
    dummy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="4.6" r="2.4"/><path d="M12 7v7M12 9.5l-4 2.5M12 9.5l4 2.5M12 14l-3 6M12 14l3 6"/></svg>',
    grab: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M8 12V5.6a1.4 1.4 0 012.8 0V11m0-3.4a1.4 1.4 0 012.8 0V11m0-2a1.4 1.4 0 012.8 0v5.4c0 3.6-2.4 6-5.9 6-2.7 0-4-1-5.3-3.2L4 14.4c-.7-1.2.8-2.5 1.9-1.6L8 14.6"/></svg>',
    impulse: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M13 3L5 13h5l-1.5 8L19 10h-5.5z"/></svg>',
    blast: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.2 2.2M16.5 16.5l2.3 2.2M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M9 15l6-6"/><path d="M11.5 6.5l1.6-1.6a3.5 3.5 0 015 5L16.5 11.5"/><path d="M12.5 17.5l-1.6 1.6a3.5 3.5 0 01-5-5L7.5 12.5"/></svg>',
    freeze: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 3v18M12 12l-6-3.5M12 12l6-3.5M12 12l-6 3.5M12 12l6 3.5M12 6l-2.5-1.7M12 6l2.5-1.7M12 18l-2.5 1.7M12 18l2.5 1.7"/></svg>',
    dup: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 4H5.5A1.5 1.5 0 004 5.5V16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.2 2.7 2.9-.6 1 2.8 2.9.6-.6 2.9 2 2.1-2 2.1.6 2.9-2.9.6-1 2.8-2.9-.6L12 21.2l-1.2-2.7-2.9.6-1-2.8-2.9-.6.6-2.9-2-2.1 2-2.1-.6-2.9 2.9-.6 1-2.8 2.9.6z" opacity=".85"/></svg>',
    pyramid: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 4l4.5 7h-9zM12 11l5.5 8h-11z"/></svg>',
    domino: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="4" y="8" width="4.5" height="12" rx="1" transform="rotate(-12 6 14)"/><rect x="10" y="6" width="4.5" height="12" rx="1" transform="rotate(-6 12 12)"/><rect x="16" y="5" width="4.5" height="12" rx="1"/></svg>',
    broom: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M14 3l7 7-5 1-3-3zM12.5 8.5L6 15c-1.8 1.8-2 4.5-2 6 1.5 0 4.2-.2 6-2l6.5-6.5"/></svg>',
    question: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.2A2.5 2.5 0 0114.5 10c0 1.7-2.5 2-2.5 3.6"/><circle cx="12" cy="17" r=".4" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M8 5v14M16 5v14"/></svg>',
  };
  function svg(name) { return I[name] || I.box; }

  /* ---------- helpers ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const root = () => document.getElementById('ui-root');

  let hovered = null;

  const SPAWN_ITEMS = [
    { kind: 'crate', name: 'Crate', key: '1', icon: 'box' },
    { kind: 'barrel', name: 'Barrel', key: '2', icon: 'barrel' },
    { kind: 'ball', name: 'Ball', key: '3', icon: 'ball' },
    { kind: 'plank', name: 'Plank', key: '4', icon: 'plank' },
    { kind: 'boulder', name: 'Boulder', key: '5', icon: 'boulder' },
    { kind: 'heavy', name: 'Steel', key: '6', icon: 'heavy' },
    { kind: 'foam', name: 'Foam', key: '7', icon: 'foam' },
    { kind: 'pin', name: 'Pin', key: '8', icon: 'pin' },
    { kind: 'bomb', name: 'Bomb', key: '9', icon: 'bomb' },
    { kind: 'cart', name: 'Cart', key: '0', icon: 'cart' },
    { kind: 'dummy', name: 'Dummy', key: 'T', icon: 'dummy' },
  ];

  const TOOLS_UI = [
    { id: 'grab', name: 'Grab', key: 'G', tip: 'Grab / drag / throw' },
    { id: 'impulse', name: 'Impulse', key: 'I', tip: 'Punch object away' },
    { id: 'blast', name: 'Blast', key: 'E', tip: 'Explosion at cursor' },
    { id: 'link', name: 'Link', key: 'R', tip: 'Tie two objects together' },
    { sep: true },
    { id: 'freeze', name: 'Freeze', key: 'F', tip: 'Freeze / unfreeze' },
    { id: 'dup', name: 'Clone', key: 'C', tip: 'Duplicate object' },
    { id: 'delete', name: 'Delete', key: 'X', tip: 'Remove object' },
  ];

  function build() {
    const r = root();

    /* HUD */
    const hud = el('div', 'panel', `
      <div class="logo">Physics Sandbox</div>
      <div class="sub" id="stats-line">— fps · — objects</div>`);
    hud.id = 'hud';
    r.appendChild(hud);

    /* Palette */
    const pal = el('div', 'panel');
    pal.id = 'palette';
    const head = el('div', 'pal-head');
    head.innerHTML = '<span class="pal-title">SPAWN</span>';
    const grid = el('div', 'pal-grid');
    SPAWN_ITEMS.forEach((it) => {
      const b = el('button', 'spawn-btn', `${svg(it.icon)}<span>${it.name}</span>`);
      b.title = `Spawn ${it.name} (${it.key})`;
      b.addEventListener('click', () => SB.Spawner.ui(it.kind));
      grid.appendChild(b);
    });
    const presets = el('div', 'presets');
    [
      { n: 'Pyramid of crates', i: 'pyramid', f: () => SB.WorldBuild.pyramid(0, 7, 5) },
      { n: 'Domino run + boom', i: 'domino', f: () => SB.WorldBuild.dominoRun() },
      { n: 'Bowling pins', i: 'pin', f: () => SB.WorldBuild.bowling() },
      { n: 'Brick wall', i: 'box', f: () => SB.WorldBuild.brickWall() },
      { n: 'Reset world', i: 'broom', f: () => { SB.resetWorld(true); } },
      { n: 'Clear toys', i: 'trash', f: () => SB.clearToys() },
    ].forEach((p) => {
      const b = el('button', 'preset-btn', `${svg(p.i)}<span>${p.n}</span>`);
      b.addEventListener('click', () => {
        p.f();
        SB.UI.toast(p.n);
      });
      presets.appendChild(b);
    });
    head.addEventListener('click', () => pal.classList.toggle('collapsed'));
    pal.appendChild(head); pal.appendChild(grid); pal.appendChild(presets);
    r.appendChild(pal);

    /* Tool dock */
    const dock = el('div', 'panel');
    dock.id = 'dock';
    TOOLS_UI.forEach((t) => {
      if (t.sep) { dock.appendChild(el('div', 'dock-sep')); return; }
      const b = el('button', 'tool-btn',
        `<span class="kbd">${t.key}</span>${svg(t.id)}<span>${t.name}</span>`);
      b.title = t.tip;
      b.dataset.tool = t.id;
      b.addEventListener('click', () => SB.Tools.setTool(t.id));
      dock.appendChild(b);
    });
    r.appendChild(dock);

    /* Settings */
    const st = el('div');
    st.innerHTML = `<div class="panel" id="settings-toggle" title="Settings">${svg('gear')}</div>`;
    r.appendChild(st.firstChild);
    const panel = el('div', 'panel');
    panel.id = 'settings';

    const gravRow = sliderRow('Gravity', '-30', '+5', -30, 5, 0.5, -9.8, (v) => {
      SB.setGravity(v);
    }, (v) => v === 0 ? 'zero-g' : v.toFixed(1));
    const timeRow = sliderRow('Time scale', 'slow', 'fast', 0.05, 1, 0.05, 1, (v) => {
      SB.setTimeScale(v);
    }, (v) => v.toFixed(2) + '×');
    const volRow = sliderRow('Volume', '', '', 0, 1, 0.05, 0.8, (v) => {
      SB.Audio.setVolume(v);
      try { localStorage.setItem('sb-vol', String(v)); } catch (e) {}
    }, (v) => Math.round(v * 100) + '%');

    const toggles = el('div', 'toggles');
    const shadowsChip = chip('Shadows', true, (on) => { SB.setShadows(on); });
    const soundChip = chip('Sound', true, (on) => { SB.Audio.setEnabled(on); });
    toggles.appendChild(shadowsChip); toggles.appendChild(soundChip);

    const acts = el('div', 'big-actions');
    const pauseBtn = el('button', 'act-btn', 'Pause');
    pauseBtn.addEventListener('click', () => { SB.togglePause(); });
    const resetBtn = el('button', 'act-btn warn', 'Reset world');
    resetBtn.addEventListener('click', () => { SB.resetWorld(true); SB.UI.toast('World reset'); });
    const helpBtn = el('button', 'act-btn', '? Help');
    helpBtn.addEventListener('click', () => openHelp());
    acts.appendChild(pauseBtn); acts.appendChild(resetBtn); acts.appendChild(helpBtn);

    panel.appendChild(gravRow.el); panel.appendChild(timeRow.el);
    panel.appendChild(volRow.el); panel.appendChild(toggles); panel.appendChild(acts);
    r.appendChild(panel);

    document.getElementById('settings-toggle').addEventListener('click', () => {
      panel.classList.toggle('open');
    });

    /* Badge */
    const badge = el('div', 'panel');
    badge.id = 'badge';
    r.appendChild(badge);

    /* Toasts */
    const toasts = el('div');
    toasts.id = 'toasts';
    r.appendChild(toasts);

    /* Hint */
    const hint = el('div', 'panel');
    hint.id = 'hint';
    hint.innerHTML = '<b>Left-click</b> uses your tool &nbsp;·&nbsp; <b>Right-drag</b> orbit &nbsp;·&nbsp; <b>Scroll</b> zoom &nbsp;·&nbsp; flick while holding to <b>throw</b> &nbsp;·&nbsp; <b>H</b> help';
    hint.addEventListener('click', dismissHint);
    r.appendChild(hint);
    try { if (localStorage.getItem('sb-hint-done')) hint.style.display = 'none'; } catch (e) {}

    /* Paused tag */
    const pt = el('div');
    pt.id = 'paused-tag';
    pt.textContent = 'PAUSED';
    r.appendChild(pt);

    /* slow-mo vignette */
    const vig = el('div');
    vig.id = 'slowmo-vignette';
    r.appendChild(vig);

    /* Help modal */
    const ov = el('div');
    ov.id = 'help-overlay';
    ov.innerHTML = helpHTML();
    ov.addEventListener('click', (e) => { if (e.target === ov) closeHelp(); });
    r.appendChild(ov);
    ov.querySelector('#help-close').addEventListener('click', closeHelp);

    this._els = { stats: hud.querySelector('#stats-line'), badge, pausedTag: pt, vig, pauseBtn, timeRow, gravRow };
  }

  function sliderRow(name, minLabel, maxLabel, min, max, step, val, onChange, fmt) {
    const row = el('div', 'set-row');
    const lab = el('label', 'main', `<span>${name}</span><b></b>`);
    const input = el('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = val;
    const bv = lab.querySelector('b');
    const show = () => { bv.textContent = fmt(parseFloat(input.value)); };
    input.addEventListener('input', () => { show(); onChange(parseFloat(input.value)); });
    show();
    row.appendChild(lab); row.appendChild(input);
    return { el: row, input, set(v) { input.value = v; show(); } };
  }

  function chip(name, initial, onChange) {
    const c = el('div', 'chip' + (initial ? ' on' : ''), name);
    let on = !!initial;
    c.addEventListener('click', () => {
      on = !on;
      c.classList.toggle('on', on);
      onChange(on);
    });
    return c;
  }

  function helpHTML() {
    const rows = [
      ['<span class="kbd">G</span>', 'Grab tool — hold an object, move to drag, scroll to pull closer/push away, release mid-swing to throw'],
      ['<span class="kbd">I</span>', 'Impulse — punch the object under your cursor along your view'],
      ['<span class="kbd">E</span>', 'Blast — explosion wherever you click'],
      ['<span class="kbd">R</span>', 'Link — click two objects (or the ground first) to tie them together'],
      ['<span class="kbd">F</span>', 'Freeze / unfreeze the picked object'],
      ['<span class="kbd">C</span>', 'Clone the picked object'],
      ['<span class="kbd">X</span>', 'Delete the picked object'],
      ['<span class="kbd">+</span><span class="kbd">−</span>', 'Heavier / lighter for the hovered object (or use its badge)'],
    ];
    const keys2 = [
      ['<span class="kbd">1</span>–<span class="kbd">0</span><span class="kbd">T</span>', 'Spawn crate, barrel, ball, plank, boulder, steel, foam, pin, bomb, cart, dummy'],
      ['<span class="kbd">Space</span>', 'Toggle slow motion'],
      ['<span class="kbd">P</span>', 'Pause / resume simulation'],
      ['<span class="kbd">Esc</span>', 'Cancel pending link / close windows'],
      ['<span class="kbd">Right-drag</span>', 'Orbit camera · <b>Middle-drag</b> pan · <b>Scroll</b> zoom'],
      ['<span class="kbd">H</span>', 'This help'],
    ];
    return `
      <div class="panel" id="help">
        <button class="act-btn" id="help-close" style="width:auto;padding:6px 12px;">Close</button>
        <h1>PHYSICS SANDBOX</h1>
        <div class="h-sub">Spawn things. Blow things up. Ask questions later.</div>
        <h2>Tools</h2>
        <div class="help-grid">${rows.map(r => `<span>${r[0]}</span><span class="desc">${r[1]}</span>`).join('')}</div>
        <h2>Spawning &amp; misc</h2>
        <div class="help-grid">${keys2.map(r => `<span>${r[0]}</span><span class="desc">${r[1]}</span>`).join('')}</div>
        <h2>Tips</h2>
        <div class="help-grid">
          <span>💣</span><span class="desc">Red barrels and bombs detonate from hard impacts — chain them.</span>
          <span>🧊</span><span class="desc">Frozen objects are brittle: blast them to shatter them.</span>
          <span>⚖️</span><span class="desc">Steel is ~100× heavier than foam. Stack accordingly.</span>
          <span>🛒</span><span class="desc">The cart rolls anywhere — load it, launch it, regret it.</span>
        </div>
      </div>`;
  }

  function openHelp() { document.getElementById('help-overlay').classList.add('open'); }
  function closeHelp() { document.getElementById('help-overlay').classList.remove('open'); }
  function helpOpen() { return document.getElementById('help-overlay').classList.contains('open'); }

  function dismissHint() {
    const h = document.getElementById('hint');
    if (h) h.style.display = 'none';
    try { localStorage.setItem('sb-hint-done', '1'); } catch (e) {}
  }

  /* ---------- toasts ---------- */
  const toastQ = [];
  function toast(msg) {
    const holder = document.getElementById('toasts');
    while (toastQ.length >= 3) {
      const old = toastQ.shift();
      old.remove();
    }
    const t = el('div', 'toast', msg);
    holder.appendChild(t);
    toastQ.push(t);
    setTimeout(() => t.classList.add('fade'), 1500);
    setTimeout(() => {
      t.remove();
      const i = toastQ.indexOf(t);
      if (i >= 0) toastQ.splice(i, 1);
    }, 2100);
  }

  /* ---------- badge ---------- */
  function onHover(ent) {
    hovered = ent;
    refreshBadge();
  }

  function refreshBadge() {
    const b = document.getElementById('badge');
    if (!b) return;
    if (!hovered || hovered.disposed || SB.Tools.current === 'grab' && SB.Tools.grabbedEnt === hovered && false) {
      b.classList.remove('show');
      return;
    }
    const ent = hovered;
    const frozenTag = ent.frozen ? ' · frozen' : '';
    b.innerHTML = `
      <div class="b-name">${ent.label}</div>
      <div class="b-mass">mass <b data-m>${Math.round((ent.mass || 0) * 10) / 10}</b> kg${frozenTag}</div>
      <div class="b-actions">
        <button class="b-btn" data-a="minus" title="Lighter">−</button>
        <button class="b-btn" data-a="plus" title="Heavier">+</button>
        <button class="b-btn" data-a="freeze" title="Freeze/unfreeze">${svg('freeze')}</button>
        <button class="b-btn" data-a="dup" title="Duplicate">${svg('dup')}</button>
        <button class="b-btn danger" data-a="del" title="Delete">${svg('trash')}</button>
      </div>`;
    b.classList.add('show');
    b.querySelectorAll('.b-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ent2 = SB.Entities.get(ent.id);
        if (!ent2 || ent2.disposed) return;
        const a = btn.dataset.a;
        if (ent2.pinned && (a === 'freeze')) { toast(`${ent2.label} is part of the playground`); return; }
        switch (a) {
          case 'minus': case 'plus': {
            const cur = ent2.mass || 1;
            const next = a === 'plus' ? Math.min(400, cur * 1.7) : Math.max(0.1, cur / 1.7);
            ent2.setMass(next);
            b.querySelector('[data-m]').textContent = Math.round(next * 10) / 10;
            SB.Audio.thud(0.25, 600);
            break;
          }
          case 'freeze': {
            const nowF = SB.Entities.toggleFreeze(ent2);
            SB.Audio.thud(0.4, 900);
            toast(nowF ? 'Frozen' : 'Unfrozen');
            refreshBadge();
            break;
          }
          case 'dup': {
            if (ent2.def) { SB.Entities.cloneEntity(ent2); toast('Duplicated'); }
            break;
          }
          case 'del': {
            if (!ent2.pinned) { ent2.dispose(true); toast('Removed'); }
            else toast(`${ent2.label} is part of the playground`);
            break;
          }
        }
      });
    });
  }

  function positionBadge(x, y) {
    const b = document.getElementById('badge');
    if (!b || !b.classList.contains('show')) return;
    const w = window.innerWidth, hgt = window.innerHeight;
    b.style.left = Math.min(x + 16, w - 170) + 'px';
    b.style.top = Math.min(y + 18, hgt - 120) + 'px';
  }

  /* ---------- dock ---------- */
  function syncDock(toolId) {
    document.querySelectorAll('.tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === toolId);
    });
  }

  /* ---------- per-frame ---------- */
  let fpsAcc = 0, fpsN = 0, lastHud = 0;
  function tick(dt) {
    const els = this._els || {};
    fpsAcc += dt; fpsN++;
    const now = performance.now();
    if (now - lastHud > 500) {
      lastHud = now;
      const fps = Math.round(fpsN / Math.max(0.001, fpsAcc));
      fpsAcc = 0; fpsN = 0;
      if (els.stats) {
        const objs = SB.Entities.countDynamicBodies();
        const links = SB.Links.count();
        els.stats.textContent = `${fps} fps · ${objs} bodies${links ? ` · ${links} links` : ''}`;
      }
    }
  }

  function setPausedUI(paused) {
    const els = this._els;
    els.pausedTag.style.display = paused ? 'block' : 'none';
    els.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  }

  function setSlowmoUI(active) {
    this._els.vig.style.opacity = active ? 1 : 0;
  }

  return {
    build, toast, onHover, refreshBadge, positionBadge, syncDock,
    tick, openHelp, closeHelp, helpOpen, dismissHint, setPausedUI, setSlowmoUI,
  };
})();
