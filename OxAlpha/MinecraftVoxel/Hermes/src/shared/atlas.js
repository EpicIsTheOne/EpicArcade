// Atlas assembler: paints every tile onto one canvas, exports UV metadata.
// Browser: builds real canvas. Node (tests): works with a ctx factory.
'use strict';
(function () {
const rngFromSeedB = (typeof require !== 'undefined') ? require('./util.js').rngFromSeed : window.__req('./util.js').rngFromSeed;
const TILE_INDEX_B = (typeof require !== 'undefined') ? require('./atlas_meta.js').TILE_INDEX : window.__req('./atlas_meta.js').TILE_INDEX;
const P1 = (typeof require !== 'undefined') ? require('./tiles1.js').P1 : window.__req('./tiles1.js').P1;
const P2 = (typeof require !== 'undefined') ? require('./tiles2.js').P2 : window.__req('./tiles2.js').P2;

const PAINTERS = Object.assign({}, P1, P2);
const ATLAS_COLS = 8;
const TILE_PX = 16;

function buildAtlasCanvas(makeCtx) {
  const rows = Math.ceil(Object.keys(TILE_INDEX_B).length / ATLAS_COLS);
  const W = ATLAS_COLS * TILE_PX, H = rows * TILE_PX;
  const { ctx, canvas } = makeCtx(W, H);
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  let painted = 0;
  for (const name of Object.keys(TILE_INDEX_B)) {
    const idx = TILE_INDEX_B[name];
    const tx = (idx % ATLAS_COLS) * TILE_PX, ty = Math.floor(idx / ATLAS_COLS) * TILE_PX;
    ctx.save();
    ctx.translate(tx, ty);
    const painter = PAINTERS[name];
    if (!painter) throw new Error('no painter for tile ' + name);
    painter(ctx, rngFromSeedB('tile:' + name));
    ctx.restore();
    painted++;
  }
  return { canvas, width: W, height: H, painted };
}

/** Face -> tile name mapping per block (uses registry tex spec). face: 0=+x..3=-y */
function faceTile(blockDef, face) {
  const t = blockDef.tex || {};
  if (t.all) return t.all;
  if (face === 2 && t.top) return t.top;
  if (face === 3 && t.bottom) return t.bottom;
  return t.side || t.all || 'stone';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildAtlasCanvas, faceTile, ATLAS_COLS, TILE_PX };
}
if (typeof self !== 'undefined') { self.ATLAS_MOD = { buildAtlasCanvas, faceTile }; }
})();
