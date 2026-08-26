const KEY = 'kinetic-rush-save-v1';

const DEFAULTS = {
  bests: {},       // levelId -> {time, score, rank, cores}
  settings: { gfx: 'ultra', invertX: false, invertY: false, sens: 1.0, volMaster: 0.8, volMusic: 0.65, volSfx: 0.9 },
  seenHelp: false,
};

let state = null;

export function loadSave() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...structuredClone(DEFAULTS), ...JSON.parse(raw) } : structuredClone(DEFAULTS);
    state.settings = { ...DEFAULTS.settings, ...(state.settings || {}) };
  } catch {
    state = structuredClone(DEFAULTS);
  }
  return state;
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function recordResult(levelId, res) {
  const s = loadSave();
  const prev = s.bests[levelId];
  let newRecord = false;
  if (!prev || res.score > prev.score) {
    s.bests[levelId] = { time: res.time, score: res.score, rank: res.rank, cores: res.cores };
    newRecord = true;
  } else if (res.time < prev.time) {
    prev.time = res.time;
  }
  persist();
  return newRecord;
}

export function isUnlocked(levelDef) {
  if (!levelDef.unlockAt) return true;
  return !!loadSave().bests[levelDef.unlockAt];
}

export const saveData = loadSave;
