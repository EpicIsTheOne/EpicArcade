/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — persistence: bests, recent runs, career, themes, settings */
ARC.store = (() => {
  const KEY = 'retroArcadeHub.v1';
  const defaults = { bests: {}, runs: [], theme: 'midnight', seenThemes: ['midnight'], muted: false, plays: {} };

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(defaults);
      const d = JSON.parse(raw);
      return Object.assign(structuredClone(defaults), d);
    } catch (e) { return structuredClone(defaults); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  // ---- themes / progression ----
  const THEMES = [
    { id: 'midnight', name: 'MIDNIGHT',   req: 0,
      vars: { '--bg': '#07070f', '--bg2': '#0d0d1c', '--panel': '#12121f', '--panel2': '#191930',
              '--ink': '#e8ecff', '--ink-dim': '#8a90b8', '--accent': '#ff2e88', '--accent2': '#28e0ff',
              '--gold': '#ffd23e', '--line': '#26264a',
              '--glow-a': '0 0 18px rgba(255,46,136,.55)', '--glow-b': '0 0 22px rgba(40,224,255,.45)' } },
    { id: 'sunset', name: 'SUNSET GRID', req: 3000,
      vars: { '--bg': '#160a14', '--bg2': '#22101c', '--panel': '#241226', '--panel2': '#331838',
              '--ink': '#ffe9f2', '--ink-dim': '#bd8aa4', '--accent': '#ff7b3e', '--accent2': '#ffcf5c',
              '--gold': '#ffe08a', '--line': '#4a2644',
              '--glow-a': '0 0 18px rgba(255,123,62,.55)', '--glow-b': '0 0 22px rgba(255,207,92,.45)' } },
    { id: 'gameboy', name: 'POCKET GREEN', req: 8000,
      vars: { '--bg': '#0f1c11', '--bg2': '#152616', '--panel': '#182d1a', '--panel2': '#1f3a21',
              '--ink': '#d8f0c8', '--ink-dim': '#7fa06e', '--accent': '#8bdb4a', '--accent2': '#e4ffa0',
              '--gold': '#c8f078', '--line': '#2c4a2e',
              '--glow-a': '0 0 18px rgba(139,219,74,.5)', '--glow-b': '0 0 22px rgba(228,255,160,.4)' } },
    { id: 'vapor', name: 'VAPOR DRIVE', req: 15000,
      vars: { '--bg': '#12081f', '--bg2': '#1b0c30', '--panel': '#220f3a', '--panel2': '#2d154d',
              '--ink': '#f2e9ff', '--ink-dim': '#a58ac9', '--accent': '#00ffc8', '--accent2': '#ff71ce',
              '--gold': '#ffe86b', '--line': '#3c2160',
              '--glow-a': '0 0 18px rgba(0,255,200,.5)', '--glow-b': '0 0 22px rgba(255,113,206,.5)' } },
    { id: 'gold', name: 'GOLDEN AGE', req: 25000,
      vars: { '--bg': '#141005', '--bg2': '#1e1809', '--panel': '#251d0a', '--panel2': '#33280e',
              '--ink': '#fff6dd', '--ink-dim': '#c0a86e', '--accent': '#ffb52e', '--accent2': '#ff5e3a',
              '--gold': '#ffd23e', '--line': '#4d3c14',
              '--glow-a': '0 0 20px rgba(255,181,46,.6)', '--glow-b': '0 0 22px rgba(255,94,58,.5)' } },
  ];
  THEMES.forEach(t => t.nameLow = t.name.toLowerCase());

  function total() {
    let s = 0; for (const k in data.bests) s += data.bests[k];
    return s;
  }
  function unlockedThemes() { return THEMES.filter(t => total() >= t.req).map(t => t.id); }

  function checkUnlocks() {
    const fresh = [];
    for (const t of THEMES) {
      if (t.req > 0 && total() >= t.req && !data.seenThemes.includes(t.id)) {
        data.seenThemes.push(t.id);
        fresh.push(t);
      }
    }
    if (fresh.length) save();
    return fresh;
  }

  // record a finished run; returns { isNew, best, freshThemes }
  function recordScore(gameId, score) {
    score = Math.floor(score);
    data.plays[gameId] = (data.plays[gameId] || 0) + 1;
    const prev = data.bests[gameId] || 0;
    const isNew = score > prev;
    if (isNew) data.bests[gameId] = score;
    data.runs.unshift({ g: gameId, s: score, ts: Date.now(), nb: isNew });
    if (data.runs.length > 12) data.runs.length = 12;
    const fresh = checkUnlocks();
    save();
    return { isNew, best: data.bests[gameId] || 0, fresh };
  }

  const best = id => data.bests[id] || 0;
  const runs = () => data.runs;

  // ---- theme apply ----
  function applyTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    data.theme = t.id; save();
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(t.vars)) root.setProperty(k, v);
    document.body.dataset.theme = t.id;
    return t;
  }
  const currentTheme = () => data.theme;
  function cycleTheme(dir = 1) {
    const unlocked = unlockedThemes();
    let i = unlocked.indexOf(data.theme);
    i = (i + dir + unlocked.length) % unlocked.length;
    return applyTheme(unlocked[i]);
  }

  // ---- debug/testing helpers (also used by unlock grant) ----
  function grantBest(gameId, pts) {
    data.bests[gameId] = (data.bests[gameId] || 0) + pts;
    const fresh = checkUnlocks();
    save();
    return fresh;
  }
  function resetAll() { data = structuredClone(defaults); save(); applyTheme('midnight'); }

  return {
    THEMES, recordScore, best, bests: () => data.bests, runs, total,
    unlockedThemes, applyTheme, cycleTheme, currentTheme, plays: () => data.plays,
    setMuted(m) { data.muted = m; save(); }, isMuted: () => !!data.muted,
    grantBest, resetAll,
  };
})();
