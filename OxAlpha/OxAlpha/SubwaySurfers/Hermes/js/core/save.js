// Persistent save: coins, unlocks, upgrades, missions, bests. localStorage + Node-safe stub.
(function (root) {
  var KEY = (root.CFG && root.CFG.SAVE_KEY) || 'skylinerush.save.v1';
  var DEFAULTS = {
    coins: 0,
    best: 0,
    bestDist: 0,
    runs: 0,
    totalCoins: 0,
    runner: 'nova',
    board: 'glide',
    trail: 'none',
    ownedRunners: ['nova'],
    ownedBoards: ['glide'],
    ownedTrails: ['none'],
    upgrades: { magnet: 0, jetpack: 0, boost: 0, shield: 0, multiplier: 0 },
    missions: null,          // {list:[{id,goal,prog,done}], tier:0}
    missionsDone: 0,
    settings: { quality: 'ultra', audio: true }
  };
  function load() {
    var data = null;
    try {
      if (typeof localStorage !== 'undefined') data = localStorage.getItem(KEY);
    } catch (e) { /* node */ }
    if (!data && typeof process !== 'undefined' && process.env && process.env.SR_SAVE_PATH) {
      try { data = require('fs').readFileSync(process.env.SR_SAVE_PATH, 'utf8'); } catch (e) {}
    }
    var s = JSON.parse(JSON.stringify(DEFAULTS));
    if (data) {
      try {
        var p = JSON.parse(data);
        for (var k in DEFAULTS) if (p[k] !== undefined) s[k] = p[k];
      } catch (e) {}
    }
    // merge new upgrade keys
    for (var u in DEFAULTS.upgrades) if (s.upgrades[u] === undefined) s.upgrades[u] = 0;
    return s;
  }
  var save = load();
  function persist() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(save));
    } catch (e) {}
    if (typeof process !== 'undefined' && process.env && process.env.SR_SAVE_PATH) {
      try { require('fs').writeFileSync(process.env.SR_SAVE_PATH, JSON.stringify(save)); } catch (e) {}
    }
  }
  var api = {
    data: save,
    persist: persist,
    reset: function () {
      for (var k in DEFAULTS) save[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
      persist();
    },
    addCoins: function (n) { save.coins += n; save.totalCoins += n; persist(); },
    spend: function (n) { if (save.coins >= n) { save.coins -= n; persist(); return true; } return false; },
    recordRun: function (score, dist) {
      save.runs++;
      var newBest = score > save.best;
      if (newBest) save.best = score;
      if (dist > save.bestDist) save.bestDist = dist;
      persist();
      return newBest;
    }
  };
  root.Save = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
