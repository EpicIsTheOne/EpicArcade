// Headless fairness simulator (pure Node, no DOM):
// replays the real obstacle-layout generator across seeds/difficulties and
// verifies every generated stretch stays survivable under a perfect-play model.
'use strict';
global.window = global;
require('../vendor/three.min.js');
require('../js/core/config.js');
const CFG = window.CFG;
require('../js/core/rng.js');
require('../js/world/chunks.js');
const RNG = window.RngLib.RNG;

function simulate(evs, opts) {
  const minTwo = opts.minTwoLaneGap, minOne = opts.minOneLaneGap;
  let lanes = [0, 1, 2];
  let lastForced = null;
  const sorted = evs.slice().sort((a, b) => a.z - b.z);
  for (const e of sorted) {
    if (e.kind !== 'block') continue;
    const next = lanes.filter(l => l !== e.lane);
    if (lastForced && next.length > 0) {
      const dz = e.z - lastForced.z;
      const cross = Math.abs(e.lane - lastForced.lane);
      const need = cross === 0 ? 0 : (cross === 1 ? minOne : minTwo);
      if (dz < need) {
        const reachable = next.filter(l => Math.abs(l - lastForced.lane) <= 1 || lanes.some(p => Math.abs(p - l) <= 1));
        if (reachable.length === 0) return { fair: false, why: 'unreachable safe lane', at: e };
      }
    }
    if (next.length === 0) return { fair: false, why: 'all lanes blocked', at: e };
    lanes = next;
    lastForced = e;
  }
  return { fair: true };
}

function run(seeds, maxDiff, speedNorm) {
  const v = CFG.BASE_SPEED + (CFG.MAX_SPEED - CFG.BASE_SPEED) * speedNorm;
  const react = v * 0.45;
  const opts = { minOneLaneGap: react * 0.6, minTwoLaneGap: react * 1.15 };
  const fails = [];
  let total = 0;
  for (let s = 0; s < seeds; s++) {
    const seed = (0xBEEF ^ (s * 2654435761)) >>> 0;
    for (let ci = 2; ci < 400; ci++) {
      const rng = new RNG((seed ^ (ci * 2654435761)) >>> 0);
      const diff = Math.min(1, (ci * CFG.CHUNK_LEN) / 2600) * maxDiff;
      const layout = window.Chunks._genObstacles(ci, rng, diff);
      total++;
      const r = simulate(layout.evs, opts);
      if (!r.fair) fails.push({ seed: s, chunk: ci, why: r.why, z: +r.at.z.toFixed(1), kind: r.at.kind, lane: r.at.lane });
      const blks = layout.evs.filter(e => e.kind === 'block').sort((a, b) => a.z - b.z);
      for (let i = 0; i + 2 < blks.length; i++) {
        if (Math.abs(blks[i].z - blks[i + 2].z) < 4 &&
            new Set([blks[i].lane, blks[i + 1].lane, blks[i + 2].lane]).size === 3)
          fails.push({ seed: s, chunk: ci, why: 'triple wall', z: blks[i].z });
      }
      if (fails.length > 12) break;
    }
    if (fails.length > 12) break;
  }
  return { total, fails, opts, speedNorm };
}

const res = { early: run(8, 0.35, 0.1), mid: run(8, 0.7, 0.55), late: run(12, 1.0, 1.0) };
let ok = true;
for (const k of Object.keys(res)) {
  const r = res[k];
  console.log('[' + k + '] layouts=' + r.total + ' fails=' + r.fails.length +
    ' gaps(one,two)=' + r.opts.minOneLaneGap.toFixed(1) + ',' + r.opts.minTwoLaneGap.toFixed(1) +
    ' speedNorm=' + r.speedNorm);
  r.fails.slice(0, 4).forEach(f => console.log('   FAIL ' + JSON.stringify(f)));
  if (r.fails.length) ok = false;
}
console.log(ok ? 'FAIRNESS: PASS' : 'FAIRNESS: FAIL');
process.exit(ok ? 0 : 1);
