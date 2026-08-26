// STARWEAVE — gacha engine (pure logic, environment-agnostic; testable in Node)
// Deterministic given seeded RNG. Honest rates, real pity, no dark patterns.
import { CHARACTERS, GACHA_POOL_5, GACHA_POOL_4, GACHA_POOL_3 } from './data.js';

export function softPityRate(pullCount, base) {
  const sp = 62, hp = 80;
  if (pullCount >= hp) return 1;
  if (pullCount >= sp) return Math.min(1, base + (pullCount - sp + 1) * 0.06);
  return base;
}

export class Banner {
  constructor(def, state) {
    this.def = def; // from BANNERS
    this.state = state || { pulls: 0, pity4: 0, guaranteeFeatured: false, beginnerUses: 0 };
  }
  get id() { return this.def.id; }

  rollOne(rng, ownedSet) {
    this.state.pulls++;
    this.state.pity4++;
    const r = rng.float();
    let rarity;
    const p5 = softPityRate(this.state.pulls, this.def.rates.five);
    if (r < p5) rarity = 5;
    else if (r < p5 + this.def.rates.four || this.state.pity4 >= this.def.rates.fourPity) rarity = 4;
    else rarity = 3;

    let charId;
    if (rarity === 5) {
      this.state.pulls = 0; this.state.pity4 = 0;
      if (this.def.featured) {
        if (this.state.guaranteeFeatured) { charId = this.def.featured; this.state.guaranteeFeatured = false; }
        else if (rng.float() < 0.5) { charId = this.def.featured; }
        else { charId = rng.pick(GACHA_POOL_5.filter(id => id !== this.def.featured)); this.state.guaranteeFeatured = true; }
      } else charId = rng.pick(GACHA_POOL_5);
    } else if (rarity === 4) {
      this.state.pity4 = 0;
      if (this.def.featured && rng.float() < 0.5) {
        charId = this.def.featured; // 4★ featured not used in launch pools; fallback below keeps it safe
      }
      if (!charId || !CHARACTERS[charId] || CHARACTERS[charId].rarity !== 4) charId = rng.pick(GACHA_POOL_4);
    } else {
      charId = rng.pick(GACHA_POOL_3);
    }

    const dupe = ownedSet ? ownedSet.has(charId) : false;
    return { charId, rarity, dupe };
  }

  rollMulti(rng, ownedSet) {
    const results = [];
    for (let i = 0; i < 10; i++) results.push(this.rollOne(rng, ownedSet));
    // guarantee: at least one 4★ per multi
    if (!results.some(x => x.rarity >= 4)) {
      const idx = 9;
      const charId = rng.pick(GACHA_POOL_4);
      results[idx] = { charId, rarity: 4, dupe: ownedSet ? ownedSet.has(charId) : false };
    }
    return results;
  }
}

export function bannerCost(bannerDef, multi) {
  if (multi && bannerDef.beginner) return 1280;
  return multi ? 1600 : 160;
}

export function ratesSummary(bannerDef) {
  const r = bannerDef.rates;
  const rows = [];
  rows.push({ label: '5★ Celestial', chance: `${(r.five * 100).toFixed(1)}% base · ramps from pull ${r.softPity} · guaranteed by pull ${r.hardPity}` });
  rows.push({ label: '4★ Radiant', chance: `${(r.four * 100).toFixed(1)}% base · guaranteed within 10` });
  rows.push({ label: '3★ Glimmer', chance: `${((1 - r.five - r.four) * 100).toFixed(1)}%` });
  if (bannerDef.featured) rows.push({ label: 'Featured rule', chance: 'First 5★ is 50/50 featured; if you lose, the next 5★ is GUARANTEED featured.' });
  if (bannerDef.beginner) rows.push({ label: 'Beginner bonus', chance: '10-weave costs 1280 (20% off) and always contains a 4★+. Max 2 uses.' });
  return rows;
}
