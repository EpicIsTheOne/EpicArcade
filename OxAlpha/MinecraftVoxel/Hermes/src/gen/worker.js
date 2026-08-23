// Worker entry: gen -> light -> mesh, posts typed arrays back (transferable).
'use strict';
// Load shared modules synchronously. Relative URLs are resolved against the
// worker script's own URL (importScripts in a classic worker resolves against
// the WORKER's location, which is /src/gen/ here).
(function () {
  // Absolute origin URLs: blob/classic workers cannot resolve relative paths.
  const origin = 'http://127.0.0.1:8477';
  const files = [
    '/Minecraft/src/shared/util.js', '/Minecraft/src/shared/noise.js', '/Minecraft/src/shared/blocks.js',
    '/Minecraft/src/shared/atlas_meta.js', '/Minecraft/src/gen/worldgen.js',
    '/Minecraft/src/world/light.js', '/Minecraft/src/mesh/mesher.js',
  ];
  for (const f of files) {
    try {
      if (typeof importScripts === 'function') { importScripts(origin + f); }
    } catch (e) { void e; }
  }
})();
const WREQ = (p) => {
  const G = (typeof self !== 'undefined') ? self : globalThis;
  const map = {
    './worldgen.js': G.WORLDGEN_MOD,
    '../world/light.js': G.LIGHT_MOD,
    '../mesh/mesher.js': G.MESHER_MOD,
    '../shared/blocks.js': G.BLOCKS_MOD,
  };
  if (typeof require !== 'undefined') { try { return require(p); } catch (e) { void e; } }
  if (map[p]) return map[p];
  throw new Error('worker module missing: ' + p);
};
const { generateChunk, CS, WH } = WREQ('./worldgen.js');
const { computeChunkLight } = WREQ('../world/light.js');
const { meshChunk } = WREQ('../mesh/mesher.js');
const { BLOCKS } = WREQ('../shared/blocks.js');

let SEED = 'hermes';
const cache = new Map(); // "cx,cz" -> {blocks, hm}

function getRec(cx, cz) {
  const key = cx + ',' + cz;
  let rec = cache.get(key);
  if (!rec) {
    const blocks = new Uint8Array(CS * CS * WH);
    generateChunk(SEED, cx, cz, blocks);
    const hm = new Uint8Array(CS * CS);
    for (let z = 0; z < CS; z++) for (let x = 0, o = x + z * CS; x < CS; x++, o++) {
      let y = WH - 1;
      while (y > 0 && blocks[x + z * CS + y * CS * CS] === 0) y--;
      hm[o] = y;
    }
    rec = { blocks, hm };
    if (cache.size > 320) cache.delete(cache.keys().next().value);
    cache.set(key, rec);
  }
  return rec;
}

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      SEED = String(msg.seed);
      cache.clear();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (msg.type === 'gen') {
      const rec = getRec(msg.cx, msg.cz);
      // copy out so the worker cache keeps its own copy
      const blocksCopy = rec.blocks.slice();
      const hmCopy = rec.hm.slice();
      self.postMessage({ type: 'chunk', cx: msg.cx, cz: msg.cz, id: msg.id, blocks: blocksCopy, hm: hmCopy },
        [blocksCopy.buffer, hmCopy.buffer]);
      return;
    }
    if (msg.type === 'lightmesh') {
      const rec = getRec(msg.cx, msg.cz);
      const nb = (wx, wy, wz) => {
        const r = getRec(wx >> 4, wz >> 4);
        return r.blocks[(wx & 15) + (wz & 15) * CS + wy * CS * CS];
      };
      const nbLight = (wx, wy, wz) => {
        // cross-chunk light approximation: sky-open column test
        const r = getRec(wx >> 4, wz >> 4);
        for (let yy = wy + 1; yy < WH; yy++) {
          const d = BLOCKS[r.blocks[(wx & 15) + (wz & 15) * CS + yy * CS * CS]];
          if (d && d.opacity > 0) return [0, 0];
        }
        return [15, 0];
      };
      const L = computeChunkLight(rec.blocks);
      const M = meshChunk(msg.cx, msg.cz, rec.blocks, nb, nbLight, { ao: msg.ao !== false });
      self.postMessage({
        type: 'lightmesh', cx: msg.cx, cz: msg.cz, id: msg.id,
        sky: L.sky, block: L.block, solid: M.solid, cutout: M.cutout, trans: M.trans,
      }, [L.sky.buffer, L.block.buffer, ...transferablesOf(M)]);
      return;
    }
    if (msg.type === 'edit') {
      const key = msg.cx + ',' + msg.cz;
      const rec = cache.get(key);
      if (rec && msg.idx < rec.blocks.length) rec.blocks[msg.idx] = msg.id;
      return;
    }
    self.postMessage({ type: 'error', msg: 'unknown message ' + msg.type });
  } catch (e) {
    self.postMessage({ type: 'error', msg: String(e && e.stack || e) });
  }
};

function transferablesOf(M) {
  const out = [];
  for (const k of ['solid', 'cutout', 'trans']) {
    const g = M[k];
    if (g) for (const kk of ['pos', 'uv', 'light', 'norm', 'idx']) out.push(g[kk].buffer);
  }
  return out;
}
