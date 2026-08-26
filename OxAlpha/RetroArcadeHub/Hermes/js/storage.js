'use strict';
/* RETRO-HUB-RUN02 storage: high scores, runs, unlocks, settings (localStorage w/ memory fallback) */
window.RH = {
  games: [],
  registerGame(def) { this.games.push(def); },
};
(function () {
  const KEY = 'retro-arcade-hub-run02-v1';
  function defaults() {
    return {
      v: 1,
      best: {},            // gameId -> best score
      plays: {},           // gameId -> times played
      runs: [],            // [{g,s,t}] newest first, max 12
      unlocked: ['neon'],  // theme ids
      theme: 'neon',
      muted: false,
    };
  }
  let mem = null;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const base = defaults();
        for (const k in base) if (d[k] !== undefined) base[k] = d[k];
        if (!base.unlocked.includes('neon')) base.unlocked.unshift('neon');
        return base;
      }
    } catch (e) { /* private mode / file:// quirks */ }
    return defaults();
  }
  let s = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  /** Record a finished run. Returns true when it's a new personal best. */
  function recordRun(gameId, score) {
    score = Math.max(0, Math.round(score));
    const prev = s.best[gameId] || 0;
    const isBest = score > prev;
    s.best[gameId] = Math.max(prev, score);
    s.plays[gameId] = (s.plays[gameId] || 0) + 1;
    if (score > 0 || true) {
      s.runs.unshift({ g: gameId, s: score, t: Date.now() });
      s.runs = s.runs.slice(0, 12);
    }
    save();
    return isBest;
  }
  RH.store = {
    get: () => s,
    save,
    recordRun,
    best: id => s.best[id] || 0,
    reset() { s = defaults(); save(); },
  };
})();
