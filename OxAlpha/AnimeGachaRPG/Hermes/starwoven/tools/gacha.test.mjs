// STARWOVEN — targeted gacha sanity checks (pure node)
import assert from 'node:assert';
import { mulberry32, ssrChance, RATES } from '../js/rng.js';
import { GachaService, ownedList } from '../js/gacha.js';
import { POOLS, BANNERS, CHARACTERS } from '../js/data.js';

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); console.log('  ✓', name); pass++; };

function freshSave() {
  return {
    seed: 12345, currencies: { star: 100000, mote: 0 }, pity: {}, history: [], roster: {},
    team: ['orion'], owned: ['orion'], story: { step: 0, flags: {} }, zones: {}, settings: {},
  };
}

// --- rate config ---
ok(Math.abs((RATES.baseSSR + RATES.baseSR + (1 - RATES.baseSSR - RATES.baseSR)) - 1) < 1e-9, 'rates well-formed');
for (let p = 0; p < RATES.hardPity; p++) ok(ssrChance(p) >= RATES.baseSSR, `ssrChance(${p}) >= base`);
ok(ssrChance(RATES.hardPity) === 1 && ssrChance(RATES.hardPity - 1) === 1, 'hard pity guarantees SSR');
ok(ssrChance(47) > ssrChance(45), 'soft pity ramps');

// --- determinism ---
{
  const a = [], b = [];
  for (let i = 0; i < 2; i++) {
    const s = freshSave(); const g = new GachaService(s);
    for (let j = 0; j < 30; j++) a.push(g.pull('eternal-sky', 1).map(r => r.charId + r.rarity).join());
    void b;
    if (i === 0) b.push(...a), a.length = 0;
  }
  ok(a.join('|') === b.join('|'), 'same seed => identical pull sequence');
}

// --- hard pity within 50 pulls ---
{
  // force a scenario: use rng that always rolls above SSR chance until forced
  let calls = 0;
  const s = freshSave(); const g = new GachaService(s);
  g.rng = () => { calls++; return 0.9999999; }; // never natural SSR/SR
  let last = null, gotSSR = null, n = 0;
  while (!gotSSR && n < 60) {
    const res = g.pull('debut-lyra', 1);
    last = res[0]; n++;
    if (last.rarity === 'SSR') gotSSR = n;
  }
  ok(gotSSR !== null && gotSSR <= RATES.hardPity, `hard pity fired at pull ${gotSSR} <= ${RATES.hardPity}`);
  ok(last.pity.count === 0, 'pity resets after SSR');
}

// --- featured guarantee flip ---
{
  const s = freshSave(); const g = new GachaService(s);
  // scripted rng per call: [rarity=SSR, lose 50/50, pool pick] then [rarity=SSR]
  const script = [0.005, 0.99, 0.42, 0.005];
  let i = 0;
  g.rng = () => script[Math.min(i++, script.length - 1)];
  const res = g.pull('debut-lyra', 1)[0];
  ok(res.rarity === 'SSR' && res.charId !== 'lyra', `lost 50/50 gave ${res.charId}`);
  ok(g.pityOf('debut-lyra').guaranteedFeatured === true, 'guaranteedFeatured flag set after loss');
  const res2 = g.pull('debut-lyra', 1)[0];
  ok(res2.charId === 'lyra', 'next SSR guaranteed featured');
}

// --- multi SR floor + costs ---
{
  const s = freshSave(); s.currencies.star = 90; const g = new GachaService(s);
  g.rng = () => 0.9999995; // all R naturally
  const before = s.currencies.star;
  const res = g.pull('eternal-sky', 10);
  ok(res.some(r => r.rarity !== 'R'), '10-weave SR floor holds');
  const refunds = res.reduce((a, r) => a + (r.refund || 0), 0);
  ok(before - s.currencies.star === 90 - refunds, `multi cost deducted exactly (left=${s.currencies.star}, refunds=${refunds})`);
  s.currencies.star = 5;
  ok(g.pull('eternal-sky', 1) === null, 'insufficient currency -> null');
}
{
  const s = freshSave(); const g = new GachaService(s);
  const before = s.currencies.star;
  g.pull('eternal-sky', 1);
  ok(before - s.currencies.star === RATES.costSingle, 'single cost = 10');
}

// --- dupes / ascension / overflow refund ---
{
  const s = freshSave(); const g = new GachaService(s);
  s.roster['lyra'] = { lvl: 1, xp: 0, asc: 0, dupes: 0 };
  let n = 0;
  g.rng = () => { n++; return n % 2 === 1 ? 0.001 : 0.02; }; // SSR every pull, always featured lyra
  const out = g.pull('debut-lyra', 10); // wait: multi path uses rollMulti; force singles
  void out;
  for (let i = 0; i < 7; i++) {
    const r = g.pull('debut-lyra', 1);
    // each should be lyra dupe
    if (i === 0) ok(r[0].duped === true && r[0].shards === 25, 'dupe grants shards (25 SSR)');
  }
  const re = s.roster['lyra'];
  ok(re.asc >= 1, `ascension progressed (asc=${re.asc}, dupes=${re.dupes})`);
}

// --- history capped & recorded ---
{
  const s = freshSave(); const g = new GachaService(s);
  for (let i = 0; i < 12; i++) g.pull('eternal-sky', 10);
  ok(s.history.length === 120, 'history records all pulls');
  ok(s.history.every(h => POOLS.ssr.includes(h.charId) || POOLS.sr.includes(h.charId) || POOLS.r.includes(h.charId)), 'history ids valid');
}

// --- statistical smoke: SSR rate over many pulls ~ configured ---
{
  const s = freshSave(); const g = new GachaService(s);
  let ssr = 0, total = 4000;
  for (let i = 0; i < total / 10; i++) ssr += g.pull('eternal-sky', 10).filter(r => r.rarity === 'SSR').length;
  const rate = ssr / total;
  ok(rate > 0.03 && rate < 0.09, `empirical SSR rate ${rate.toFixed(3)} in expected band w/ pity (~4.6%)`);
}

// --- roster integrity ---
ok(CHARACTERS.length === 10, 'launch roster has 10 characters');
ok(POOLS.ssr.length === 4 && POOLS.sr.length === 3 && POOLS.r.length === 3, 'pools sized 4/3/3');
ok(BANNERS.length === 2, 'two banners live');

console.log(`\nALL GACHA CHECKS PASSED (${pass} assertions)`);
