// Verify ruins generate: scan many chunks for cobble/mossy/chest/lantern presence.
'use strict';
const { generateChunk, CS, WH } = require('../src/gen/worldgen.js');
const { B } = require('../src/shared/blocks.js');

const targets = {
  cobble: B.COBBLESTONE,
  mossy: B.MOSSY_COBBLE,
  chest: B.CHEST,
  lantern: B.LANTERN,
};
let found = 0;
let ruinChunks = 0;
const t0 = Date.now();
for (let cx = -30; cx < 30 && found < 3; cx++) {
  for (let cz = -30; cz < 30; cz++) {
    const a = new Uint8Array(CS * CS * WH);
    generateChunk('ruin-test-1', cx, cz, a);
    let hasChest = false, hasWall = false;
    for (let i = 0; i < a.length; i += 7) { // stride sample for speed
      if (a[i] === B.CHEST) hasChest = true;
      else if (a[i] === B.COBBLESTONE || a[i] === B.MOSSY_COBBLE) hasWall = true;
    }
    if (hasChest) {
      found++;
      ruinChunks++;
      console.log(`ruin at chunk (${cx},${cz})`);
      if (found >= 3) break;
    } else if (hasWall) ruinChunks++;
  }
}
console.log(`scan ${Date.now() - t0}ms: ${ruinChunks} wall chunks, ${found} chest ruins`);
process.exit(found >= 1 ? 0 : 1);
