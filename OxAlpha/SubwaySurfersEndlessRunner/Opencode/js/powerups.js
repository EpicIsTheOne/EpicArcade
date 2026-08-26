// HYPERLINE powerup effect runtime
import CFG from './config.js';
import { G } from './state.js';

export class Powerups {
  constructor() {
    this.hud = null;      // injected by ui
  }

  reset() {
    if (!G.fx) return;
    G.fx.magnet = 0;
    G.fx.jetpack = 0;
    G.fx.x2 = 0;
    G.fx.sneakers = 0;
    G.fx.shield = false;
  }

  lvl(id) { return window.__save.data.upg[id] || 0; }

  durMult() {
    // Echo perk: +10% durations
    const perkDur = window.__save.data.char === 'echo' ? 1.1 : 1;
    return perkDur;
  }

  activate(kind) {
    const fx = G.fx;
    switch (kind) {
      case 'magnet': {
        const l = this.lvl('magnet');
        fx.magnet = CFG.POWERUPS.MAGNET.DUR[l] * this.durMult();
        break;
      }
      case 'jetpack': {
        const l = this.lvl('jetpack');
        fx.jetpack = CFG.POWERUPS.JETPACK.DUR[l] * this.durMult();
        break;
      }
      case 'x2': {
        const l = this.lvl('x2');
        fx.x2 = CFG.POWERUPS.X2.DUR[l] * this.durMult();
        break;
      }
      case 'sneakers': {
        const l = this.lvl('sneakers');
        fx.sneakers = CFG.POWERUPS.SNEAKERS.DUR[l] * this.durMult();
        break;
      }
      case 'shield':
        fx.shield = true;
        break;
    }
    if (this.hud) this.hud.syncPowerups();
  }

  magnetRadius() {
    if (!G.fx || G.fx.magnet <= 0) return 0;
    return CFG.POWERUPS.MAGNET.RADIUS[this.lvl('magnet')];
  }

  update(dt) {
    const fx = G.fx;
    let ended = false;
    for (const k of ['magnet', 'jetpack', 'x2', 'sneakers']) {
      if (fx[k] > 0) {
        fx[k] -= dt;
        if (fx[k] <= 0) { fx[k] = 0; ended = true; }
      }
    }
    if (ended && this.hud) this.hud.syncPowerups();
    if (this.hud) this.hud.updatePowerupBars(dt);
  }
}
