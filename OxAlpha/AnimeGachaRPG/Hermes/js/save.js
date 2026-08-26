// STARWEAVE — save system (localStorage, versioned)
const KEY = 'starweave_save_v1';
const VERSION = 1;

export function freshSave() {
  return {
    version: VERSION,
    createdAt: Date.now(),
    stardust: 1600,           // enough for one multi immediately + more to earn
    sigils: 0,
    roster: { aster: { level: 1, xp: 0, ascension: 0, resonance: 0 } },
    team: ['aster', null, null],
    banners: {},              // bannerId -> pity state
    history: [],              // summon log (newest first), capped
    quests: { current: 0, step: 0, counters: {}, done: [] },
    shards: 0,                // sunshards collected (quest currency)
    starwellLast: 0,
    unlocked: { loom: false, gacha: false, spire: false },
    seenChapters: [],
    settings: { music: 0.7, sfx: 0.9, quality: 'high' },
    stats: { kills: 0, summons: 0, playSeconds: 0 },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return migrate(data);
    return data;
  } catch (e) { console.warn('save load failed', e); return null; }
}

function migrate(old) {
  // forward-compatible: start from fresh but keep what fits
  const fresh = freshSave();
  if (!old || typeof old !== 'object') return fresh;
  for (const k of Object.keys(fresh)) if (old[k] !== undefined) fresh[k] = old[k];
  fresh.version = VERSION;
  return fresh;
}

let _saveTimer = null;
export function persist(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
// debounced persist for frequent updates
export function persistSoon(save) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => persist(save), 400);
}
export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
