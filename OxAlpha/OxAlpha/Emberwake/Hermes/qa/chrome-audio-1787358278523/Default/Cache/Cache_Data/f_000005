/* Emberwake — ui.js
 * All DOM UI: HUD (lantern gauge, caravan strip, objective, compass), screens
 * (title / pause / shrine shop / elegy / victory), settings, toasts.
 * Global `window.EWUI`.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EWUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var el = {};
  var beetleEls = [];
  var onAction = null;   // fn(action, payload) — wired by main.js
  var settingsRef = { master: 0.8, music: 0.7, sfx: 0.9, quality: 'ULTRA', shake: true, reduceFlash: false, colorSafe: false };

  function h(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---------- build the DOM ----------
  function build(callbacks) {
    onAction = callbacks.action;
    if (callbacks.settings) Object.keys(settingsRef).forEach(function (k) {
      if (callbacks.settings[k] !== undefined) settingsRef[k] = callbacks.settings[k];
    });

    el.hud = h('div', 'hud hidden', document.body);

    // top: objective ribbon + compass
    var top = h('div', 'hud-top', el.hud);
    el.objective = h('div', 'objective', top);
    el.compass = h('div', 'compass', top);
    for (var c = 0; c < 24; c++) {
      var tick = h('div', 'tick', el.compass);
      if (c % 6 === 0) tick.classList.add('major');
      tick.style.transform = 'rotate(' + (c * 15) + 'deg)';
    }
    el.compassNeedle = h('div', 'needle', el.compass);

    // bottom-left: lantern gauge
    var lanternBox = h('div', 'lantern-box', el.hud);
    var lTitle = h('div', 'panel-title', lanternBox);
    lTitle.textContent = 'MOTHER EMBER';
    el.flameWell = h('div', 'flame-well', lanternBox);
    el.flameLevel = h('div', 'flame-level', el.flameWell);
    el.flameGlow = h('div', 'flame-glow', el.flameWell);
    el.fuelNum = h('div', 'fuel-num', lanternBox);
    el.levelRow = h('div', 'level-row', lanternBox);
    ['LOW', 'MED', 'HIGH'].forEach(function (lbl, i) {
      var b = h('button', 'lvl-btn', el.levelRow);
      b.textContent = lbl;
      b.dataset.lvl = i;
      b.addEventListener('click', function () { if (onAction) onAction('level', i); });
      el['lvl' + i] = b;
    });
    el.bankBtn = h('button', 'bank-btn', lanternBox);
    el.bankBtn.textContent = 'BANK  [F]';
    el.bankBtn.addEventListener('click', function () { if (onAction) onAction('bank'); });
    el.burnRate = h('div', 'burn-rate', lanternBox);

    // bottom-right: caravan strip
    var caravanBox = h('div', 'caravan-box', el.hud);
    var cTitle = h('div', 'panel-title', caravanBox);
    cTitle.textContent = 'THE CARAVAN';
    el.caravanRow = h('div', 'caravan-row', caravanBox);
    beetleEls = [];

    // bottom-center: flare + hints
    var actionBox = h('div', 'action-box', el.hud);
    el.flareBtn = h('button', 'flare-btn', actionBox);
    el.flareBtn.innerHTML = 'FLARE <span class="key">SPACE</span>';
    el.flareBtn.addEventListener('click', function () { if (onAction) onAction('flare'); });
    el.hintLine = h('div', 'hint-line', actionBox);
    el.shardsLine = h('div', 'shards-line', actionBox);

    // vignette + danger overlay
    el.vignette = h('div', 'vignette', document.body);
    el.dangerFlash = h('div', 'danger-flash', document.body);
    el.wraithWarn = h('div', 'wraith-warn hidden', document.body);
    el.wraithWarn.textContent = 'THE NIGHT-WRAITH HAS COME';

    // boss bar
    el.bossBarWrap = h('div', 'boss-bar-wrap hidden', document.body);
    el.bossName = h('div', 'boss-name', el.bossBarWrap);
    el.bossName.textContent = 'THE NIGHT-WRAITH';
    el.bossBarOuter = h('div', 'boss-bar-outer', el.bossBarWrap);
    el.bossBarFill = h('div', 'boss-bar-fill', el.bossBarOuter);

    // toast area
    el.toasts = h('div', 'toasts', document.body);
  }

  function makeScreen(id, titleCls) {
    var s = h('div', 'screen hidden', document.body);
    s.id = id;
    var inner = h('div', 'screen-inner', s);
    return { root: s, inner: inner };
  }

  var screens = {};

  function buildScreens() {
    // ---- TITLE ----
    screens.title = makeScreen('screen-title');
    var t = screens.title.inner;
    t.innerHTML =
      '<div class="title-eyebrow">a lantern-lit pilgrimage through the endless night</div>' +
      '<h1 class="game-title">EMBER<span>WAKE</span></h1>' +
      '<p class="title-lede">You are the last Keeper. The Mother Ember rides in your lantern —<br>' +
      'the only warmth left in the world — and five lantern-beetles follow you,<br>' +
      'trusting your light to keep them alive. Every second of light burns fuel.<br>' +
      'Fuel is life. Life is light. The Dawn Gate is far.</p>' +
      '<div class="title-controls">' +
      '<span><b>WASD</b> move</span><span><b>MOUSE</b> camera</span><span><b>SPACE</b> flare</span>' +
      '<span><b>F</b> bank flame</span><span><b>1·2·3</b> lantern</span><span><b>SHIFT</b> sprint</span><span><b>E</b> interact</span></div>';
    var btns = h('div', 'title-btns', t);
    var start = h('button', 'btn-primary', btns);
    start.textContent = 'BEGIN THE PILGRIMAGE';
    start.addEventListener('click', function () { if (onAction) onAction('start'); });
    var how = h('button', 'btn-ghost', btns);
    how.textContent = 'HOW TO KEEP THEM ALIVE';
    how.addEventListener('click', function () { if (onAction) onAction('howto'); });
    var best = h('div', 'best-line', t);
    try {
      var bs = JSON.parse(localStorage.getItem('ew_best') || 'null');
      if (bs) best.textContent = 'Best dawn: ' + bs.rank + ' — ' + bs.score.toLocaleString() + ' light';
    } catch (e) { /* ignore */ }

    // ---- HOWTO ----
    screens.howto = makeScreen('screen-howto');
    screens.howto.inner.innerHTML =
      '<h2 class="screen-title">KEEPING THEM ALIVE</h2>' +
      '<div class="how-grid">' +
      '<div class="how-card"><h3>The Flame Economy</h3><p>Your lantern is health, weapon and clock at once.' +
      ' HIGH lights a wide safe circle but drinks fuel. LOW is stealthy and slow-burning. ' +
      'BANKED [F] nearly stops the burn — but your family is unprotected in the dark.</p></div>' +
      '<div class="how-card"><h3>The Caravan</h3><p>Beetles outside your light freeze. Hollows hunt them in darkness. ' +
      'Never outrun them for long — they hurry back, but cold is patient.</p></div>' +
      '<div class="how-card"><h3>Flare</h3><p>SPACE detonates stored heat in a shockwave. It annihilates hollows, ' +
      'banishes wisps, fells wardens — and wounds the Wraith hardest mid-dive. Costs 18 fuel.</p></div>' +
      '<div class="how-card"><h3>Gather</h3><p>Embermoss (green tufts) restores fuel. Kindling caches restore much more. ' +
      'Embershards are currency for Wayshrine upgrades. Lava fissures feed your lantern while you stand in them.</p></div>' +
      '<div class="how-card"><h3>Lies of Light</h3><p>In the Hushpines, wisps imitate campfires. Beetles that follow them ' +
      'stray from the road. Burn wisps before they take hold — or flare.</p></div>' +
      '<div class="how-card"><h3>Wayshrines</h3><p>Relight all eight to wake the Dawn Gate. Shrines heal the caravan ' +
      'and sell upgrades for shards. Spend them like love, not like money.</p></div>' +
      '</div>';
    var back1 = h('button', 'btn-primary', screens.howto.inner);
    back1.textContent = 'RETURN';
    back1.addEventListener('click', function () { if (onAction) onAction('backTitle'); });

    // ---- PAUSE ----
    screens.pause = makeScreen('screen-pause');
    var p = screens.pause.inner;
    p.innerHTML = '<h2 class="screen-title">THE NIGHT HOLDS ITS BREATH</h2>';
    var pres = h('div', 'settings-grid', p);
    buildSettings(pres);
    var pbtns = h('div', 'row-btns', p);
    var resume = h('button', 'btn-primary', pbtns);
    resume.textContent = 'RESUME';
    resume.addEventListener('click', function () { if (onAction) onAction('resume'); });
    var abandon = h('button', 'btn-danger', pbtns);
    abandon.textContent = 'ABANDON THE JOURNEY';
    abandon.addEventListener('click', function () { if (onAction) onAction('abandon'); });

    // ---- SHRINE SHOP ----
    screens.shrine = makeScreen('screen-shrine');
    var sh = screens.shrine.inner;
    sh.innerHTML = '<h2 class="screen-title">WAYSHRINE RELIT</h2>' +
      '<div class="shrine-lede" id="shrine-lede"></div>';
    el.shopShards = h('div', 'shop-shards', sh);
    el.shopGrid = h('div', 'shop-grid', sh);
    var carRow = h('div', 'shop-caravan', sh);
    el.shopCaravan = h('div', '', carRow);
    var leave = h('button', 'btn-primary shrine-leave', sh);
    leave.textContent = 'TAKE UP THE ROAD  [E]';
    leave.addEventListener('click', function () { if (onAction) onAction('leaveShrine'); });

    // ---- ELEGY (game over) ----
    screens.elegy = makeScreen('screen-elegy');
    var eg = screens.elegy.inner;
    eg.innerHTML = '<h2 class="screen-title elegy-title">AN ELEGY FOR THE DARK</h2>' +
      '<div class="elegy-cause" id="elegy-cause"></div>' +
      '<div class="elegy-tally" id="elegy-tally"></div>';
    var egbtns = h('div', 'row-btns', eg);
    var again = h('button', 'btn-primary', egbtns);
    again.textContent = 'RISE AGAIN';
    again.addEventListener('click', function () { if (onAction) onAction('restart'); });

    // ---- VICTORY ----
    screens.victory = makeScreen('screen-victory');
    var v = screens.victory.inner;
    v.innerHTML = '<div class="dawn-band"></div>' +
      '<h2 class="screen-title victory-title">DAWN</h2>' +
      '<div class="victory-scroll" id="victory-scroll"></div>';
    var vbtns = h('div', 'row-btns', v);
    var onceMore = h('button', 'btn-primary', vbtns);
    onceMore.textContent = 'WALK INTO THE DAY';
    onceMore.addEventListener('click', function () { if (onAction) onAction('restart'); });
  }

  function buildSettings(grid) {
    function slider(label, key, min, max, step, val, fmt) {
      var row = h('div', 'set-row', grid);
      var lb = h('label', '', row);
      lb.textContent = label;
      var inp = h('input', '', row);
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      var out = h('span', 'set-val', row);
      out.textContent = fmt(val);
      inp.addEventListener('input', function () {
        out.textContent = fmt(inp.value);
        if (onAction) onAction('setting', { key: key, value: parseFloat(inp.value) });
      });
    }
    function select(label, key, options, val) {
      var row = h('div', 'set-row', grid);
      var lb = h('label', '', row);
      lb.textContent = label;
      var sel = h('select', '', row);
      options.forEach(function (o) {
        var op = h('option', '', sel);
        op.value = o; op.textContent = o;
        if (o === val) op.selected = true;
      });
      sel.addEventListener('change', function () {
        if (onAction) onAction('setting', { key: key, value: sel.value });
      });
    }
    function check(label, key, val) {
      var row = h('div', 'set-row set-check', grid);
      var lb = h('label', '', row);
      lb.textContent = label;
      var cb = h('input', '', row);
      cb.type = 'checkbox'; cb.checked = !!val;
      cb.addEventListener('change', function () {
        if (onAction) onAction('setting', { key: key, value: cb.checked });
      });
    }
    slider('Master volume', 'master', 0, 1, 0.05, settingsRef.master, function (v) { return Math.round(v * 100) + '%'; });
    slider('Music', 'music', 0, 1, 0.05, settingsRef.music, function (v) { return Math.round(v * 100) + '%'; });
    slider('Effects', 'sfx', 0, 1, 0.05, settingsRef.sfx, function (v) { return Math.round(v * 100) + '%'; });
    select('Quality', 'quality', ['LOW', 'HIGH', 'ULTRA'], settingsRef.quality);
    check('Camera shake', 'shake', settingsRef.shake);
    check('Reduce flashing', 'reduceFlash', settingsRef.reduceFlash);
    check('Color-safe enemy marks', 'colorSafe', settingsRef.colorSafe);
  }

  // ---------- HUD updates ----------
  function showHUD(on) { el.hud.classList.toggle('hidden', !on); }

  function updateHUD(sim, yaw) {
    var k = sim.keeper;
    var pct = Math.max(0, Math.min(1, k.fuel / k.fuelMax));
    el.flameLevel.style.height = (pct * 100).toFixed(1) + '%';
    el.flameLevel.className = 'flame-level' + (k.banked ? ' banked' : pct < 0.25 ? ' critical' : pct < 0.5 ? ' low' : '');
    el.flameGlow.style.opacity = k.banked ? 0.15 : (0.35 + pct * 0.65);
    el.fuelNum.textContent = Math.ceil(k.fuel) + ' / ' + k.fuelMax;

    Object.keys(el).forEach(function (key) {
      if (/^lvl[012]$/.test(key)) el[key].classList.toggle('active', k.level === parseInt(key.slice(3)) && !k.banked);
    });
    el.bankBtn.classList.toggle('active', k.banked);
    el.bankBtn.textContent = k.banked ? 'UNBANK  [F]' : 'BANK  [F]';

    var rate = sim.helpers.burnRate();
    el.burnRate.textContent = k.banked ? 'banked — the night is listening'
      : 'burning ' + rate.toFixed(2) + '/s';

    // caravan strip
    while (el.caravanRow.children.length !== sim.beetles.length) {
      el.caravanRow.innerHTML = '';
      beetleEls = [];
      sim.beetles.forEach(function () {
        var d = h('div', 'beetle-chip', el.caravanRow);
        var shell = h('div', 'beetle-shell', d);
        var nm = h('div', 'beetle-name', d);
        var sh = h('div', 'beetle-shields', d);
        beetleEls.push({ chip: d, shell: shell, name: nm, shields: sh });
      });
    }
    sim.beetles.forEach(function (b, i) {
      var ui = beetleEls[i];
      ui.chip.classList.toggle('dead', !b.alive);
      ui.chip.classList.toggle('cold', b.alive && b.hp < 55);
      ui.chip.classList.toggle('lured', b.state === 'lured');
      ui.name.textContent = b.alive ? b.name : '✝';
      var sh = '';
      for (var s = 0; s < b.maxShields; s++) sh += '<i class="' + (s < b.shields ? 'on' : '') + '"></i>';
      ui.shields.innerHTML = sh;
    });

    // shards + flare cooldown
    el.shardsLine.textContent = '◆ ' + sim.shards + ' embershards   ·   shrines ' + sim.shrinesLit + '/8';
    var cd = k.flareRecover > 0;
    el.flareBtn.classList.toggle('cooldown', cd || k.fuel < 18 || k.banked);
    el.flareBtn.querySelector('.key').textContent = cd ? ('...' + k.flareRecover.toFixed(1)) : 'SPACE';

    // compass needle points toward the current goal, relative to camera facing
    el.compassNeedle.style.transform = 'rotate(' + (sim.helpers.compassDeg(yaw || 0) || 0) + 'deg)';
  }

  function setObjective(text) { if (el.objective) el.objective.textContent = text; }

  function toast(msg, cls) {
    if (!el.toasts) return;
    var t = h('div', 'toast ' + (cls || ''), el.toasts);
    t.textContent = msg;
    setTimeout(function () { t.classList.add('gone'); }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }

  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].root.classList.toggle('hidden', k !== name);
    });
  }
  function hideScreens() {
    Object.keys(screens).forEach(function (k) { screens[k].root.classList.add('hidden'); });
  }

  function openShop(sim, shrineIndex) {
    showScreen('shrine');
    var lede = document.getElementById('shrine-lede');
    if (lede) lede.textContent = shrineLedes(shrineIndex);
    el.shopShards.textContent = '◆ ' + sim.shards + ' embershards';
    el.shopGrid.innerHTML = '';
    sim.SHOP.forEach(function (item) {
      var lvl = sim.keeper.upgrades[item.id] || 0;
      var card = h('div', 'shop-card' + (lvl >= item.max ? ' maxed' : ''), el.shopGrid);
      var name = h('div', 'shop-name', card);
      name.textContent = item.name + (lvl > 0 ? ' ' + ['I', 'II', 'III'][Math.min(lvl, 2)] : '');
      var desc = h('div', 'shop-desc', card);
      desc.textContent = item.desc;
      var foot = h('div', 'shop-foot', card);
      if (lvl >= item.max) {
        foot.textContent = 'MASTERED';
      } else {
        var cost = item.costs[lvl];
        var buy = h('button', 'shop-buy' + (sim.shards < cost ? ' poor' : ''), foot);
        buy.textContent = '◆ ' + cost;
        buy.addEventListener('click', function () { if (onAction) onAction('buy', item.id); });
        var pips = h('div', 'shop-pips', foot);
        for (var i = 0; i < item.max; i++) h('i', 'pip' + (i < lvl ? ' on' : ''), pips);
      }
    });
    // caravan status + heal/revive button
    el.shopCaravan.innerHTML = '';
    sim.beetles.forEach(function (b) {
      var chip = h('div', 'beetle-chip' + (!b.alive ? ' dead' : b.hp < b.maxHp * 0.99 ? ' hurt' : ''), el.shopCaravan);
      chip.innerHTML = '<div class="beetle-shell"></div><div class="beetle-name">' + (b.alive ? b.name : 'lost') + '</div>';
    });
    var healBtnWrap = h('div', 'heal-row', el.shopCaravan);
    var needHeal = sim.beetles.some(function (b) { return !b.alive || b.hp < b.maxHp || b.shields < b.maxShields; });
    var healBtn = h('button', 'shop-buy big', healBtnWrap);
    healBtn.textContent = needHeal ? 'TEND CARAVAN ◆3 (revive ◆12)' : 'CARAVAN IS WELL';
    healBtn.disabled = !needHeal;
    healBtn.addEventListener('click', function () { if (onAction) onAction('heal'); });
  }

  function shrineLedes(i) {
    var led = [
      '"Rest here, Keeper. The stones remember every flame that passed."',
      '"The wind took three pilgrims the winter this stone was cut."',
      '"Someone carved a beetle into the lintel. Someone hoped."',
      '"Warmth shared is not warmth halved."',
      '"The Hushpines lean close to listen. Give them nothing to hear."',
      '"A wisp burned here once. It pretended to be this shrine."',
      '"Past this stone the ground remembers fire. So will you."',
      '"One shrine remains unlit beyond the Reach. The Gate is waiting."'
    ];
    return led[Math.min(i, led.length - 1)];
  }

  function fillElegy(sim) {
    var cause = document.getElementById('elegy-cause');
    var tally = document.getElementById('elegy-tally');
    if (cause) cause.textContent = sim.deathCause || 'The dark took what the light could not keep.';
    var alive = sim.beetles.filter(function (b) { return b.alive; }).length;
    var names = sim.beetles.filter(function (b) { return b.alive; }).map(function (b) { return b.name; });
    if (tally) tally.innerHTML =
      'Shrines relit: <b>' + sim.shrinesLit + ' / 8</b><br>' +
      'Distance walked: <b>' + Math.round(sim.distance) + ' m</b> of the pilgrim road<br>' +
      'Survivors: <b>' + alive + ' of 5</b>' + (names.length ? ' — ' + names.join(', ') : '') + '<br>' +
      'The Mother Ember endures. The road does not.';
  }

  function fillVictory(sim) {
    var scroll = document.getElementById('victory-scroll');
    if (!scroll) return;
    var st = sim.finalStats || {};
    scroll.innerHTML =
      '<p class="scroll-line">The Night-Wraith came apart like smoke remembering it was once fire.</p>' +
      '<p class="scroll-line">Light crossed the valley for the first time in an age. In Ashfall Meadow, grass remembered green.</p>' +
      '<div class="vital-stats">' +
      '<div><span>Beetles who saw the dawn</span><b>' + st.beetlesAlive + ' / ' + st.beetlesTotal + '</b></div>' +
      '<div><span>Wayshrines relit</span><b>' + st.shrines + ' / 8</b></div>' +
      '<div><span>Pilgrim road walked</span><b>' + st.distance + ' m</b></div>' +
      '<div><span>Hollows unmade</span><b>' + st.hollowsSlain + '</b></div>' +
      '<div><span>Journey</span><b>' + Math.floor(st.timeSec / 60) + 'm ' + Math.round(st.timeSec % 60) + 's</b></div>' +
      '</div>' +
      '<div class="rank-line">LIGHT CARRIED HOME</div>' +
      '<div class="rank-value">' + (st.rank || 'KEEPER') + '</div>' +
      '<div class="score-line">' + (sim.score || 0).toLocaleString() + ' light</div>' +
      (st.beetlesAlive === st.beetlesTotal
        ? '<p class="scroll-line epilogue">Every beetle crossed with her. Bramble, Cinder, Juniper, Wick and Marzen ' +
          'will tell this story until telling becomes song.</p>'
        : '<p class="scroll-line epilogue">' + (st.beetlesAlive === 0
            ? 'No beetle saw it. The dawn rose anyway, indifferent and golden, and the Keeper stood alone in it.'
            : 'Some did not cross. Their shells rest where the road turned to glass. The dawn was for them too.</p>'));
  }

  function setBossBar(frac, visible) {
    el.bossBarWrap.classList.toggle('hidden', !visible);
    el.bossBarFill.style.width = (frac * 100).toFixed(1) + '%';
  }

  function flashDanger(strength) {
    el.dangerFlash.style.opacity = strength;
  }

  function wraithBanner(visible) {
    el.wraithWarn.classList.toggle('hidden', !visible);
  }

  return {
    build: function (callbacks) {
      build(callbacks);
      buildScreens();
    },
    showHUD: showHUD,
    updateHUD: updateHUD,
    setObjective: setObjective,
    toast: toast,
    showScreen: showScreen,
    hideScreens: hideScreens,
    openShop: openShop,
    fillElegy: fillElegy,
    fillVictory: fillVictory,
    setBossBar: setBossBar,
    flashDanger: flashDanger,
    wraithBanner: wraithBanner,
    screens: screens,
    el: el
  };
});
