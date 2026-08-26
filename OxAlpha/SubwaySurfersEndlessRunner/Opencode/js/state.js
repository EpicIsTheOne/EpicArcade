// global run state + tiny event bus
import CFG from './config.js';
import { clamp } from './utils.js';

class Bus {
  constructor() { this.m = new Map(); }
  on(ev, fn) {
    if (!this.m.has(ev)) this.m.set(ev, []);
    this.m.get(ev).push(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) {
    const a = this.m.get(ev); if (!a) return;
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  }
  emit(ev, data) {
    const a = this.m.get(ev);
    if (a) for (let i = 0; i < a.length; i++) a[i](data);
  }
}

export const G = {
  phase: 'boot',            // boot | title | countdown | run | paused | dead
  tRun: 0,
  dist: 0,
  speed: CFG.SPEED.START,
  score: 0,
  displayScore: 0,
  runCoins: 0,
  runGems: 0,
  multRank: 1,              // from missions progression
  combo: { n: 0, t: 0 },
  stats: null,
  fx: null,                 // active powerup effect timers {magnet,jetpack,x2,sneakers} seconds remaining; shield bool
  boardsLeft: 0,
  boardActive: 0,
  invuln: 0,
  stumbleHeat: 0,           // recent-stumble window for chaser catch
  godMode: false,
  autopilot: false,
  muted: false,
};

export function resetRunState(saveData) {
  G.phase = 'countdown';
  G.tRun = 0;
  G.dist = 0;
  G.speed = CFG.SPEED.START;
  G.score = 0;
  G.displayScore = 0;
  G.runCoins = 0;
  G.runGems = 0;
  G.multRank = saveData ? saveData.rank : 1;
  G.combo.n = 0; G.combo.t = 0;
  G.stats = {
    jumps: 0, rolls: 0, powerups: 0, nearMiss: 0, roofMeters: 0,
    boxes: 0, trainsDodged: 0, magnetCoins: 0, maxCombo: 0,
  };
  G.fx = { magnet: 0, jetpack: 0, x2: 0, sneakers: 0, shield: false };
  G.boardActive = 0;
  G.invuln = 0;
  G.stumbleHeat = 0;
}

// base multiplier = rank (+ optional x2 powerup applied at scoring site)
export function baseMult() { return G.multRank; }

export function totalMult() { return baseMult() * (G.fx && G.fx.x2 > 0 ? 2 : 1); }

export const bus = new Bus();
