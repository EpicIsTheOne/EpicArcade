// Voxel lighting: per-chunk sky+block light (worker path) and incremental
// add/remove BFS (main-thread edit path). Channels are 0..15 nibble arrays.
'use strict';
(function () {
if (typeof importScripts === 'function') importScripts('http://127.0.0.1:8477/src/shared/blocks.js');
const REQ = (p) => {
  const G = (typeof self !== 'undefined') ? self : globalThis;
  if (typeof require !== 'undefined') { try { return require(p); } catch (e) { void e; } }
  if (p.endsWith('blocks.js')) return G.BLOCKS_MOD;
  throw new Error('module not available: ' + p);
};
const { BLOCKS, B } = REQ('../shared/blocks.js');

const CS = 16, WH = 128;
const idxOf = (x, y, z) => x + z * CS + y * CS * CS;

const opacityOf = (id) => {
  const d = BLOCKS[id];
  return d ? d.opacity : 15;
};
const emitOf = (id) => {
  const d = BLOCKS[id];
  return d ? d.emit : 0;
};

// Reusable queue (Int32Array packs idx<<4 | level)
function makeQueue(cap) { return { buf: new Int32Array(cap), head: 0, tail: 0 }; }
function qPush(q, v) {
  if (q.tail >= q.buf.length) {
    if (q.head > q.buf.length / 2) { // compact
      q.buf.copyWithin(0, q.head, q.tail);
      q.tail -= q.head; q.head = 0;
    } else { // grow
      const nb = new Int32Array(q.buf.length * 2);
      nb.set(q.buf); q.buf = nb;
    }
  }
  q.buf[q.tail++] = v;
}
const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

/** Full chunk light computation (worker path). Returns {sky, block} Uint8Arrays. */
function computeChunkLight(blocks) {
  const sky = new Uint8Array(CS * CS * WH);
  const blk = new Uint8Array(CS * CS * WH);
  const q = makeQueue(1 << 14);

  // 1) vertical sky scan
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    let cur = 15;
    for (let y = WH - 1; y >= 0; y--) {
      const i = idxOf(x, y, z);
      const o = opacityOf(blocks[i]);
      if (o > 0) cur = Math.max(0, cur - Math.max(o, y === WH - 1 ? 0 : 1));
      if (cur <= 0) { // rest is dark unless BFS feeds it
        sky[i] = 0;
      } else {
        sky[i] = cur;
        if (cur > 1) qPush(q, (i << 4) | cur);
      }
    }
  }
  propagate(q, sky, blocks, true);

  // 2) block emitters
  q.head = q.tail = 0;
  for (let i = 0; i < blocks.length; i++) {
    const e = emitOf(blocks[i]);
    if (e > 0) { blk[i] = e; qPush(q, (i << 4) | e); }
  }
  propagate(q, blk, blocks, false);

  return { sky, block: blk };
}

/** BFS spread over an existing light array (in place). */
function propagate(q, light, blocks, isSky) {
  while (q.head < q.tail) {
    const v = q.buf[q.head++];
    const i = v >> 4, lv = v & 15;
    if (lv <= 1 || light[i] > lv) continue; // stale entry
    const y = (i / (CS * CS)) | 0;
    const z = ((i >> 8) & 15), x = (i & 15);
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0 || ny >= WH) continue;
      const ni = idxOf(nx, ny, nz);
      const o = opacityOf(blocks[ni]);
      if (o >= 15) continue;
      let cost = o > 0 ? o : 1;
      if (isSky && d === 3 && o === 0 && lv === 15) cost = 0; // straight down through air keeps 15
      const nl = lv - cost;
      if (nl > light[ni]) {
        light[ni] = nl;
        if (nl > 1) qPush(q, (ni << 4) | nl);
      }
    }
  }
}

// ---- Incremental editing (main thread) ----
// Accessor interface: { get(x,y,z)->id, inBounds(x,y,z)->bool, getLight(ch,x,y,z), setLight(ch,x,y,z,v) }
// Coordinates are WORLD coords; accessor handles chunk lookups.

/** After placing block id at (x,y,z): update both channels correctly. */
function onPlace(acc, x, y, z, id) {
  const o = opacityOf(id);
  const e = emitOf(id);
  // --- remove old light through this cell ---
  removal(acc, 0, x, y, z);
  removal(acc, 1, x, y, z);
  // --- add emission ---
  if (e > 0) {
    acc.setLight(1, x, y, z, e);
    const q = makeQueue(4096);
    qPush(q, (packW(x, y, z) << 4) | e);
    propagateWorld(q, acc, 1);
  }
  // --- re-seed from neighbors (light flowing INTO this area) ---
  reseed(acc, x, y, z);
}

/** After breaking block at (x,y,z): pull light in from neighbors.
 * Also purges stale light the broken cell itself was holding (e.g. it was
 * an emitter whose light had no other escape route). */
function onBreak(acc, x, y, z) {
  // purge stale light stored in this cell before re-seeding from neighbors
  const curB = acc.getLight(1, x, y, z);
  if (curB > 0) removal(acc, 1, x, y, z);
  const curS = acc.getLight(0, x, y, z);
  if (curS > 0 && curS < 15) removal(acc, 0, x, y, z);
  reseed(acc, x, y, z);
  // if any neighbor is an emitter, its light now spreads into the hole
  for (let d = 0; d < 6; d++) {
    const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
    if (!acc.inBounds(nx, ny, nz)) continue;
    const e = emitOf(acc.get(nx, ny, nz));
    if (e > 0) {
      const q = makeQueue(4096);
      qPush(q, (packW(nx, ny, nz) << 4) | acc.getLight(1, nx, ny, nz));
      propagateWorld(q, acc, 1);
    }
  }
}

function reseed(acc, x, y, z) {
  const qSky = makeQueue(8192);
  const qBlk = makeQueue(8192);
  for (let d = 0; d < 6; d++) {
    const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
    if (!acc.inBounds(nx, ny, nz)) continue;
    const lvS = acc.getLight(0, nx, ny, nz);
    if (lvS > 1) qPush(qSky, (packW(nx, ny, nz) << 4) | lvS);
    const lvB = acc.getLight(1, nx, ny, nz);
    if (lvB > 1) qPush(qBlk, (packW(nx, ny, nz) << 4) | lvB);
    // sky column: if cell above is full sky and this cell is transparent, continue downward
    if (d === 2) {
      const above = acc.get(x, y + 1, z);
      if (acc.getLight(0, x, y + 1, z) === 15 && opacityOf(above) === 0) {
        let yy = y;
        while (yy >= 0 && opacityOf(acc.get(x, yy, z)) === 0) {
          acc.setLight(0, x, yy, z, 15);
          qPush(qSky, (packW(x, yy, z) << 4) | 15);
          yy--;
        }
      }
    }
  }
  propagateWorld(qSky, acc, 0);
  propagateWorld(qBlk, acc, 1);
}

/** Standard light-removal BFS for channel ch at cell. */
function removal(acc, ch, x, y, z) {
  const old0 = acc.getLight(ch, x, y, z);
  if (old0 === 0) return;
  acc.setLight(ch, x, y, z, 0);
  const q = makeQueue(8192);       // removal queue: (pos<<4)|oldLevel
  const addQ = makeQueue(8192);    // re-add queue
  qPush(q, (packW(x, y, z) << 4) | old0);
  while (q.head < q.tail) {
    const v = q.buf[q.head++];
    const p = v >> 4, lv = v & 15;
    const P = unpackW(p);
    for (let d = 0; d < 6; d++) {
      const nx = P.x + DX[d], ny = P.y + DY[d], nz = P.z + DZ[d];
      if (!acc.inBounds(nx, ny, nz)) continue;
      const nl = acc.getLight(ch, nx, ny, nz);
      if (nl === 0) continue;
      const isDownSky = (ch === 0 && d === 3);
      if (nl < lv || (isDownSky && nl === 15 && lv === 15)) {
        acc.setLight(ch, nx, ny, nz, 0);
        qPush(q, (packW(nx, ny, nz) << 4) | (isDownSky ? 15 : nl));
      } else if (nl >= lv) {
        qPush(addQ, (packW(nx, ny, nz) << 4) | nl);
      }
    }
  }
  // repropagate borders
  propagateWorld(addQ, acc, ch);
}

// World position packing for BFS (fits 32-bit when shifted <<4? no).
// Use 64-bit safe: pack into two numbers? Simpler: encode as string key? Too slow.
// Layout: we only need +-512 range around player: x:10b, z:10b, y:7b => 27 bits <<4 fits 31.
function packW(x, y, z) {
  return ((x + 512) & 0x3FF) | (((z + 512) & 0x3FF) << 10) | ((y & 0x7F) << 20);
}
function unpackW(p) {
  return { x: (p & 0x3FF) - 512, z: ((p >> 10) & 0x3FF) - 512, y: (p >> 20) & 0x7F };
}

/** BFS spread in world coords via accessor. */
function propagateWorld(q, acc, ch) {
  while (q.head < q.tail) {
    const v = q.buf[q.head++];
    const p = v >> 4, lv = v & 15;
    const P = unpackW(p);
    if (acc.getLight(ch, P.x, P.y, P.z) > lv) continue;
    for (let d = 0; d < 6; d++) {
      const nx = P.x + DX[d], ny = P.y + DY[d], nz = P.z + DZ[d];
      if (ny < 0 || ny >= WH) continue;
      if (!acc.inBounds(nx, ny, nz)) continue;
      const id = acc.get(nx, ny, nz);
      const o = opacityOf(id);
      if (o >= 15) continue;
      let cost = o > 0 ? o : 1;
      if (ch === 0 && d === 3 && o === 0 && lv === 15) cost = 0;
      const nl = lv - cost;
      if (nl > acc.getLight(ch, nx, ny, nz)) {
        acc.setLight(ch, nx, ny, nz, nl);
        if (nl > 1) qPush(q, (packW(nx, ny, nz) << 4) | nl);
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { computeChunkLight, onPlace, onBreak, propagateWorld, removal, packW, unpackW, CS, WH };
if (typeof self !== 'undefined') self.LIGHT_MOD = { computeChunkLight, onPlace, onBreak };
})();
