// STARWOVEN — gacha orchestration service (persistence-aware, testable)
"use strict";
import { mulberry32, rollOnce, rollMulti, RATES, DUPE_SHARDS } from './rng.js';
import { CHAR_BY_ID, POOLS, BANNERS } from './data.js';

export class GachaService {
  constructor(save) {
    this.save = save;
    this.rng = mulberry32(save.seed ^ 0x5f3759df);
    if (!save.pity['eternal-sky']) save.pity['eternal-sky'] = { count: 0, guaranteedFeatured: false };
    if (!save.pity['debut-lyra']) save.pity['debut-lyra'] = { count: 0, guaranteedFeatured: false };
  }

  canAfford(n) {
    const cost = n === 10 ? RATES.costMulti : RATES.costSingle * n;
    return this.save.currencies.star >= cost;
  }

  /** Pull n times on a banner. Returns array of results or null if unaffordable. */
  pull(bannerId, n) {
    const banner = BANNERS.find(b => b.id === bannerId) || { id: bannerId, featured: null };
    const cost = n === 10 ? RATES.costMulti : RATES.costSingle * n;
    if (this.save.currencies.star < cost) return null;
    this.save.currencies.star -= cost;

    const pools = POOLS;
    let pityState = this.save.pity[bannerId] || { count: 0, guaranteedFeatured: false };
    const out = [];
    if (n === 10) {
      const r = rollMulti(this.rng, pityState, banner, pools, 10);
      for (const res of r.results) out.push(res);
      pityState = r.pity;
    } else {
      for (let i = 0; i < n; i++) {
        const res = rollOnce(this.rng, pityState, banner, pools);
        out.push(res); pityState = res.pity;
      }
    }
    this.save.pity[bannerId] = pityState;

    // apply ownership / dupes / history
    for (const res of out) {
      res.duped = false; res.shards = 0;
      if (!this.save.roster[res.charId]) {
        this.save.roster[res.charId] = { lvl: 1, xp: 0, asc: 0, dupes: 0 };
      } else {
        const re = this.save.roster[res.charId];
        re.dupes++;
        res.duped = true;
        const shards = DUPE_SHARDS[res.rarity];
        res.shards = shards;
        // ascension at dupes thresholds 1/3/6 (max A3), overflow -> Starpieces x2
        const thresholds = [1, 3, 6];
        const newAsc = Math.min(3, thresholds.filter(t => re.dupes >= t).length);
        if (newAsc > re.asc) { re.asc = newAsc; res.ascended = true; }
        else if (re.asc >= 3 && re.dupes > 6) { this.save.currencies.star += shards; res.refund = shards; }
      }
      this.save.history.unshift({ t: Date.now(), charId: res.charId, rarity: res.rarity, banner: bannerId });
      if (this.save.history.length > 150) this.save.history.length = 150;
    }
    return out;
  }

  pityOf(bannerId) { return this.save.pity[bannerId]; }
}

export function ownedList(save) {
  return Object.keys(save.roster).filter(id => CHAR_BY_ID[id]);
}
