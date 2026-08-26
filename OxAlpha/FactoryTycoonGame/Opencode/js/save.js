// ---------- localStorage save / load ----------
const KEY = 'ftc_save_v1';

export function saveGame(state) {
  const data = {
    v: 1,
    money: Math.round(state.money),
    totalEarned: Math.round(state.totalEarned),
    itemsSold: state.itemsSold,
    playtime: Math.round(state.playtime),
    plots: [...state.plots],
    upgrades: { ...state.upgrades },
    muted: state.muted,
    volume: state.volume,
    machines: [...state.machines.values()].map(m => ({
      t: m.type, gx: m.gx, gz: m.gz, r: m.rot,
    })),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !Array.isArray(d.machines)) return null;
    return d;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch {}
}
