// STARWOVEN — deterministic RNG + gacha math (pure, node-testable)
"use strict";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RATES = {
  costSingle: 10,      // Starpieces per weave
  costMulti: 90,       // 10-weave discount
  baseSSR: 0.02,
  baseSR: 0.12,
  softPityStart: 46,   // pull index (1-based) where ramp begins
  hardPity: 50,
  softPityStep: 0.06,
  featuredChance: 0.5, // event SSR is featured 50% of the time
};

export function ssrChance(pityCount) {
  if (pityCount >= RATES.hardPity - 1) return 1;
  if (pityCount >= RATES.softPityStart - 1) {
    return Math.min(1, RATES.baseSSR + (pityCount - (RATES.softPityStart - 1)) * RATES.softPityStep);
  }
  return RATES.baseSSR;
}

/** Pure gacha roll. `rng` is a () => float function. Mutates nothing. */
export function rollOnce(rng, pity, banner, pools) {
  // pity: {count, guaranteedFeatured}
  const pSSR = ssrChance(pity.count);
  const r = rng();
  let rarity;
  if (r < pSSR) rarity = 'SSR';
  else if (r < pSSR + RATES.baseSR) rarity = 'SR';
  else rarity = 'R';

  let charId;
  if (rarity === 'SSR') {
    if (banner.featured && (pity.guaranteedFeatured || rng() < RATES.featuredChance)) {
      charId = banner.featured;
    } else {
      const pool = banner.featured ? pools.ssr.filter(c => c !== banner.featured)
                                   : pools.ssr.slice();
      charId = pool[Math.floor(rng() * pool.length)];
    }
  } else if (rarity === 'SR') {
    charId = pools.sr[Math.floor(rng() * pools.sr.length)];
  } else {
    charId = pools.r[Math.floor(rng() * pools.r.length)];
  }

  const newPity = {
    count: rarity === 'SSR' ? 0 : pity.count + 1,
    guaranteedFeatured: rarity === 'SSR'
      ? (banner.featured && charId !== banner.featured) // lost 50/50 -> next SSR guaranteed featured
      : pity.guaranteedFeatured,
  };
  return { rarity, charId, pity: newPity };
}

export function rollMulti(rng, pity, banner, pools, n = 10) {
  const out = [];
  let p = { ...pity };
  for (let i = 0; i < n; i++) {
    const res = rollOnce(rng, p, banner, pools);
    out.push(res);
    p = res.pity;
  }
  // SR floor guarantee within a 10-pull (industry standard, disclosed in UI)
  if (!out.some(o => o.rarity !== 'R')) {
    const last = out[out.length - 1];
    last.rarity = 'SR';
    last.charId = pools.sr[Math.floor(rng() * pools.sr.length)];
    last.pity = { count: p.count, guaranteedFeatured: p.guaranteedFeatured };
  }
  return { results: out, pity: p };
}

export const DUPE_SHARDS = { R: 1, SR: 5, SSR: 25 };
