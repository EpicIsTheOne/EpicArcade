// Verify the actual GPU output: sample the rendered frame's pixels for a
// ground-facing quad. Also dump one chunk's vertex data from the mesher.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { meshChunk } = require(path.join(ROOT, 'src/mesh/mesher.js'));
const { generateChunk, CS, WH } = require(path.join(ROOT, 'src/gen/worldgen.js'));
const { computeChunkLight } = require(path.join(ROOT, 'src/world/light.js'));

const blocks = new Uint8Array(CS * CS * WH);
generateChunk('zz-trace-99', 0, 0, blocks);
const nb = (x, y, z) => {
  const cx2 = x >> 4, cz2 = z >> 4;
  const b = new Uint8Array(CS * CS * WH);
  if (cx2 === 0 && cz2 === 0) { void b; return blocks[(x & 15) + (z & 15) * CS + y * CS * CS]; }
  generateChunk('zz-trace-99', cx2, cz2, b);
  return b[(x & 15) + (z & 15) * CS + y * CS * CS];
};
const L = computeChunkLight(blocks);
const M = meshChunk(0, 0, blocks, nb, () => [15, 0], { ao: true });

if (!M.solid) { console.log('NO SOLID MESH'); process.exit(1); }
const pos = M.solid.pos, uv = M.solid.uv, light = M.solid.light;
console.log('solid verts:', pos.length / 3, 'tris:', M.solid.count / 3);

// find a TOP face: normal index 2, check its uv range and light values
let found = 0;
for (let v = 0; v < pos.length / 3 && found < 3; v++) {
  const nIdx = M.solid.norm[v];
  if (nIdx === 2) {
    const u = uv[v * 2], w = uv[v * 2 + 1];
    const s = light[v * 3], bl = light[v * 3 + 1], ao = light[v * 3 + 2];
    console.log(`top-face vert: uv=(${u.toFixed(4)},${w.toFixed(4)}) sky=${s} blk=${bl} ao=${ao}`);
    found++;
  }
}
if (found === 0) console.log('no top faces with norm idx 2?! norms are:', Array.from(new Set(M.solid.norm)).join(','));
