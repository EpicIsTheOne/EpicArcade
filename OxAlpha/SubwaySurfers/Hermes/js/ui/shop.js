// Shop UI: powerup upgrades, boards, runners, trails. Reads/writes Save.
(function (root) {
  var BOARDS = {
    glide: { name: 'Glide', desc: 'Standard hoverboard. 20s of crash insurance.', price: 0, dur: 20, color: 0x2fd4ff },
    bolt: { name: 'Bolt', desc: 'Racing board: +8% speed while riding.', price: 1200, dur: 22, color: 0xffd54f, speed: 1.08 },
    titan: { name: 'Titan', desc: 'Heavy plating: 26s duration.', price: 2400, dur: 26, color: 0xff7043 },
    wraith: { name: 'Wraith', desc: 'Phase hull + magnet field while riding.', price: 4200, dur: 24, color: 0xb388ff, magnet: true }
  };
  var TRAILS = {
    none: { name: 'None', desc: 'No trail. Clean running.', price: 0, color: null },
    spark: { name: 'Sparkline', desc: 'Cyan energy sparks behind you.', price: 500, color: 0x2fd4ff },
    ember: { name: 'Emberwake', desc: 'Orange embers and heat shimmer.', price: 900, color: 0xff7043 },
    neon: { name: 'Neon Ribbon', desc: 'Magenta-violet light ribbon.', price: 1500, color: 0xe040fb }
  };
  function $(id) { return document.getElementById(id); }
  var S = {};
  S.BOARDS = BOARDS; S.TRAILS = TRAILS;
  S.init = function () {
    document.querySelectorAll('#shop .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#shop .tab').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        S.render(t.dataset.tab);
      });
    });
    $('btnShopClose').addEventListener('click', function () { if (S.onClose) S.onClose(); });
  };
  S.open = function () { $('shopWrap').classList.remove('hidden'); S.render('powerups'); S.syncCoins(); };
  S.close = function () { $('shopWrap').classList.add('hidden'); };
  S.syncCoins = function () { $('shopCoins').textContent = root.Save.data.coins.toLocaleString('en-US'); };
  S.render = function (tab) {
    var box = $('shopCards'); box.innerHTML = '';
    var save = root.Save.data;
    function card(title, ds, ownTxt, btnTxt, btnDisabled, onBtn, sel, extra) {
      var d = document.createElement('div');
      d.className = 'card' + (sel ? ' sel' : '') + (ownTxt && !btnTxt ? '' : '');
      d.innerHTML = '<div class="nm">' + title + '</div><div class="ds">' + ds + '</div>' +
        (extra || '') +
        (ownTxt ? '<div class="own">' + ownTxt + '</div>' : '');
      if (btnTxt !== null) {
        var b = document.createElement('button');
        b.className = 'btn'; b.style.fontSize = '15px'; b.style.padding = '10px 18px';
        b.textContent = btnTxt; b.disabled = !!btnDisabled;
        b.addEventListener('click', onBtn);
        d.appendChild(b);
      }
      box.appendChild(d);
      return d;
    }
    if (tab === 'powerups') {
      root.PW.TYPES.forEach(function (type) {
        var def = root.PW.DEFS[type];
        var lvl = save.upgrades[type] || 0;
        var cost = root.PW.upgradeCost(type, lvl);
        var maxed = lvl >= def.dur.length - 1;
        var pips = '<div class="lvl">' + def.dur.map(function (_, i) {
          return '<i class="' + (i <= lvl ? 'on' : '') + '"></i>';
        }).join('') + '</div>';
        card(def.icon + ' ' + def.name,
          'Durations: ' + def.dur.join('s / ') + 's. Next: <b>' + (maxed ? 'MAX' : def.dur[lvl] + 's → ' + def.dur[lvl + 1] + 's') + '</b>',
          null, maxed ? 'MAXED' : cost + ' ◉', maxed || save.coins < cost,
          function () {
            if (!maxed && root.Save.spend(cost)) {
              save.upgrades[type] = lvl + 1; root.Save.persist();
              root.AudioSys.sfx.buy(); S.render(tab); S.syncCoins();
              if (S.onChange) S.onChange();
            } else root.AudioSys.sfx.deny();
          }, false, pips);
      });
    } else if (tab === 'boards') {
      Object.keys(BOARDS).forEach(function (k) {
        var b = BOARDS[k];
        var owned = save.ownedBoards.indexOf(k) >= 0;
        var equipped = save.board === k;
        card(b.name, b.desc + ' · ' + b.dur + 's', owned ? (equipped ? 'EQUIPPED' : 'OWNED') : null,
          owned ? (equipped ? 'EQUIPPED ✓' : 'EQUIP') : b.price + ' ◉',
          owned ? equipped : save.coins < b.price,
          function () {
            if (owned) { save.board = k; root.Save.persist(); root.AudioSys.sfx.ui(); }
            else if (root.Save.spend(b.price)) {
              save.ownedBoards.push(k); save.board = k; root.Save.persist();
              root.AudioSys.sfx.buy(); S.syncCoins();
            } else { root.AudioSys.sfx.deny(); return; }
            S.render(tab); if (S.onChange) S.onChange();
          }, equipped);
      });
    } else if (tab === 'runners') {
      Object.keys(root.PlayerLib.RUNNERS).forEach(function (k) {
        var r = root.PlayerLib.RUNNERS[k];
        var owned = save.ownedRunners.indexOf(k) >= 0 || r.price === 0;
        var equipped = save.runner === k;
        card(r.name, r.desc, r.price === 0 ? 'STARTER' : (owned ? (equipped ? 'SELECTED' : 'OWNED') : null),
          owned ? (equipped ? 'SELECTED ✓' : 'SELECT') : r.price + ' ◉',
          owned ? equipped : save.coins < r.price,
          function () {
            if (owned) { save.runner = k; root.Save.persist(); root.AudioSys.sfx.ui(); }
            else if (root.Save.spend(r.price)) {
              save.ownedRunners.push(k); save.runner = k; root.Save.persist();
              root.AudioSys.sfx.buy(); S.syncCoins();
            } else { root.AudioSys.sfx.deny(); return; }
            S.render(tab); if (S.onChange) S.onChange();
          }, equipped);
      });
    } else if (tab === 'trails') {
      Object.keys(TRAILS).forEach(function (k) {
        var tr = TRAILS[k];
        var owned = save.ownedTrails.indexOf(k) >= 0;
        var equipped = save.trail === k;
        card(tr.name, tr.desc, owned ? (equipped ? 'EQUIPPED' : 'OWNED') : null,
          owned ? (equipped ? 'EQUIPPED ✓' : 'EQUIP') : tr.price + ' ◉',
          owned ? equipped : save.coins < tr.price,
          function () {
            if (owned) { save.trail = k; root.Save.persist(); root.AudioSys.sfx.ui(); }
            else if (root.Save.spend(tr.price)) {
              save.ownedTrails.push(k); save.trail = k; root.Save.persist();
              root.AudioSys.sfx.buy(); S.syncCoins();
            } else { root.AudioSys.sfx.deny(); return; }
            S.render(tab); if (S.onChange) S.onChange();
          }, equipped);
      });
    }
  };
  root.Shop = S;
})(typeof window !== 'undefined' ? window : globalThis);
