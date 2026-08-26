// save.js — tiny localStorage persistence (bests + settings)
const KEY = 'velocity-rush-save-v1';

export class Save {
  constructor() {
    this.data = {
      bests: {},
      settings: { invertX: false, invertY: false, quality: 'auto', music: true, sfx: true }
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...this.data, ...d, settings: { ...this.data.settings, ...(d.settings || {}) } };
      }
    } catch { /* private mode etc */ }
  }
  record(levelId, entry) {
    const prev = this.data.bests[levelId];
    if (!prev || entry.score > prev.score) {
      this.data.bests[levelId] = entry;
      this.flush();
      return true;
    }
    return false;
  }
  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { }
  }
}
