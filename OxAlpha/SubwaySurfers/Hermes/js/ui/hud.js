// HUD: score/coins/multiplier/powerup bars/toasts/combo + mission ticker.
(function (root) {
  function $(id) { return document.getElementById(id); }
  var H = {};
  var toastQ = [], toastBusy = false;
  H.init = function () {
    H.el = {
      hud: $('hud'), score: $('score'), multi: $('multi'), dist: $('distHud'),
      coins: $('coinCount'), mission: $('missionHud'), power: $('powerHud'),
      combo: $('comboHud'), toast: $('toast'), board: $('boardHud'),
      flash: $('flash'), speedlines: $('speedlines')
    };
  };
  H.show = function (v) { H.el.hud.classList.toggle('hidden', !v); };
  H.setScore = function (s) { H.el.score.textContent = Math.floor(s).toLocaleString('en-US'); };
  H.setMulti = function (m) { H.el.multi.textContent = '×' + m; };
  H.setCoins = function (c) { H.el.coins.textContent = c.toLocaleString('en-US'); };
  H.setDist = function (d) { H.el.dist.textContent = Math.floor(d) + ' m'; };
  H.setMission = function (html) { H.el.mission.innerHTML = html; H.el.mission.style.display = html ? '' : 'none'; };
  H.setBoard = function (txt) { H.el.board.textContent = txt || ''; };
  H.toast = function (text, color) {
    var el = H.el.toast;
    el.classList.remove('pop'); void el.offsetWidth;
    el.style.color = color || '#eaf2ff';
    el.textContent = text;
    el.classList.add('pop');
  };
  H.combo = function (n) {
    if (n >= 5) { H.el.combo.style.opacity = '1'; H.el.combo.textContent = n + ' CHAIN!'; }
    else H.el.combo.style.opacity = '0';
  };
  // powerup bars
  H.powers = function (list) { // list: [{name,color,frac,icon}]
    var h = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      h += '<div class="pw"><span style="color:#' + p.color.toString(16).padStart(6, '0') + '">' + p.icon +
        '</span><div class="bar"><i style="width:' + Math.round(p.frac * 100) + '%;background:#' +
        p.color.toString(16).padStart(6, '0') + '"></i></div></div>';
    }
    H.el.power.innerHTML = h;
  };
  H.flash = function (alpha) {
    var el = H.el.flash;
    el.style.transition = 'none'; el.style.opacity = alpha;
    requestAnimationFrame(function () { el.style.transition = 'opacity .45s'; el.style.opacity = '0'; });
  };
  H.speedFx = function (norm) {
    H.el.speedlines.style.opacity = norm > 0.55 ? ((norm - 0.55) * 1.6).toFixed(2) : '0';
  };
  root.HUD = H;
})(typeof window !== 'undefined' ? window : globalThis);
