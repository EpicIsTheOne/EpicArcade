// Missions: 3 active tiers, persistent progress, +multiplier on set completion.
(function (root) {
  var MS = {};
  var POOL = [
    { id: 'coins', text: 'Collect {g} coins', tiers: [150, 400, 900, 1600], ev: 'coin' },
    { id: 'dist', text: 'Run {g} m in one run', tiers: [600, 1200, 2200, 3500], ev: 'dist', perRun: true },
    { id: 'jumps', text: 'Jump {g} times', tiers: [30, 70, 140, 220], ev: 'jump' },
    { id: 'rolls', text: 'Roll {g} times', tiers: [20, 50, 100, 160], ev: 'roll' },
    { id: 'lanes', text: 'Change lanes {g} times', tiers: [40, 100, 200, 320], ev: 'lane' },
    { id: 'powerups', text: 'Grab {g} power-ups', tiers: [4, 9, 16, 26], ev: 'powerup' },
    { id: 'gems', text: 'Collect {g} gems', tiers: [3, 7, 14, 24], ev: 'gem' },
    { id: 'nearmiss', text: 'Get {g} near misses', tiers: [10, 25, 50, 80], ev: 'nearmiss' },
    { id: 'score1run', text: 'Score {g} in one run', tiers: [8000, 20000, 45000, 90000], ev: 'score', perRun: true },
    { id: 'traintop', text: 'Run {g} m on train roofs', tiers: [100, 250, 500, 900], ev: 'traintop' },
    { id: 'boards', text: 'Ride the board {g} s', tiers: [20, 45, 80, 130], ev: 'boardtime' },
    { id: 'magnet', text: 'Magnet {g} coins total', tiers: [60, 150, 300, 500], ev: 'magnetcoin' }
  ];
  function makeMission(def, tier) {
    return { id: def.id, text: def.text.replace('{g}', def.tiers[tier]), goal: def.tiers[tier], prog: 0, done: false, perRun: !!def.perRun, ev: def.ev };
  }
  MS.ensure = function () {
    var s = root.Save.data;
    if (!s.missions || !s.missions.list || s.missions.list.length !== 3) {
      var rng = new root.RngLib.RNG((Date.now() & 0xffffff) >>> 0);
      var tier = s.missions ? (s.missions.tier || 0) : 0;
      var pool = POOL.slice();
      var list = [];
      for (var i = 0; i < 3 && pool.length; i++) {
        var d = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
        list.push(makeMission(d, Math.min(tier, 3)));
      }
      s.missions = { list: list, tier: tier };
      root.Save.persist();
    }
    return s.missions;
  };
  MS.progress = function (ev, amount, isPerRunStart) {
    var m = root.Save.data.missions;
    if (!m) return [];
    var completed = [];
    for (var i = 0; i < m.list.length; i++) {
      var mi = m.list[i];
      if (mi.done || mi.ev !== ev) continue;
      if (isPerRunStart && mi.perRun) mi.prog = 0;
      mi.prog += amount;
      if (mi.prog >= mi.goal) { mi.prog = mi.goal; mi.done = true; completed.push(mi); }
    }
    if (completed.length) root.Save.persist();
    return completed;
  };
  // Called at run end: replace completed missions with new ones from the pool.
  MS.refresh = function () {
    var s = root.Save.data;
    var m = s.missions; if (!m) return;
    var replaced = false;
    for (var i = 0; i < m.list.length; i++) {
      if (m.list[i].done) {
        m.tier = Math.min(3, m.tier + 1); // full-set progression
        var tier = Math.min(3, m.tier);
        var used = {};
        m.list.forEach(function (x) { used[x.id] = true; });
        var cands = POOL.filter(function (d) { return !used[d.id]; });
        if (cands.length) {
          var d = cands[Math.floor(Math.random() * cands.length)];
          m.list[i] = makeMission(d, tier);
          replaced = true;
        }
      }
    }
    if (replaced) {
      root.Save.persist();
    }
    return replaced;
  };
  MS.setBonus = function () {
    var m = root.Save.data.missions;
    if (!m) return 0;
    return m.list.filter(function (x) { return x.done; }).length; // each done mission = +1 base multiplier
  };
  MS.list = function () { return MS.ensure().list; };
  root.Missions = MS;
})(typeof window !== 'undefined' ? window : globalThis);
