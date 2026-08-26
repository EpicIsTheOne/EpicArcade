import CFG from './config.js';

const DEF = () => ({
  v: 1,
  coins: 0,
  gems: 0,
  best: 0,
  bestDist: 0,
  totals: { runs: 0, distance: 0, coins: 0, jumps: 0 },
  rank: 1,
  upg: { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, luck: 0, board: 0, turbo: 0 },
  ownedChars: ['zip'],
  ownedBoards: ['classic'],
  char: 'zip',
  board: 'classic',
  boards: 1,
  missions: null,          // active mission slots [{id,tier,goal,prog}] — managed by missions.js
  seenHelp: false,
  settings: { quality: 'auto', music: 70, sfx: 85, shake: true, flash: true },
});

let data = DEF();

export const Save = {
  get data() { return data; },
  load() {
    try {
      const raw = localStorage.getItem(CFG.SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // shallow-merge over defaults so new fields survive version bumps
        data = { ...DEF(), ...parsed };
        data.totals = { ...DEF().totals, ...(parsed.totals || {}) };
        data.upg = { ...DEF().upg, ...(parsed.upg || {}) };
        data.settings = { ...DEF().settings, ...(parsed.settings || {}) };
      }
    } catch (e) { console.warn('save load failed', e); }
    return data;
  },
  commit() {
    try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data)); } catch (e) {}
  },
  wipe() {
    data = DEF();
    try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) {}
    this.commit();
  },
};
