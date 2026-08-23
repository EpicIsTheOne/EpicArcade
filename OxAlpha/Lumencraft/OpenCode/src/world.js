// Chunk store + worker pool + flood-fill lighting + world simulation.
// Rendering-agnostic: renderer subscribes via callbacks.
import { CHUNK, HEIGHT, SEA } from './config.js';
import { B, BLOCKS, isOpaque, isLiquid, isSolid, lightOf } from './blocks.js';
import { plantTree } from './worldgen.js';
import { hashSeed, mulberry32 } from './noise.js';
import { SMELTING, fuelSeconds } from './recipes.js';

const WORKER_URL = '/src/workers/gen.worker.js';

export class LightQueue {
  constructor(cap = 1 << 16) {
    this.data = new Int32Array(cap * 4);
    this.head = 0; this.tail = 0; this.cap = cap;
  }
  get length() { return (this.tail - this.head) >> 2; }
  push(x, y, z, v) {
    if (((this.tail >> 2) + 1) * 4 > this.cap * 4 - 4) this._grow();
    const i = this.tail;
    this.data[i] = x; this.data[i + 1] = y; this.data[i + 2] = z; this.data[i + 3] = v;
    this.tail += 4;
  }
  pop(out) {
    const i = this.head;
    out[0] = this.data[i]; out[1] = this.data[i + 1]; out[2] = this.data[i + 2]; out[3] = this.data[i + 3];
    this.head += 4;
    if (this.head === this.tail) { this.head = this.tail = 0; }
    return out;
  }
  _grow() {
    const live = (this.tail - this.head) >> 2; // entries
    let cap = this.cap;
    while (cap < live + 256) cap *= 2;
    const nd = new Int32Array(cap * 4);
    nd.set(this.data.subarray(this.head, this.tail));
    this.data = nd;
    this.tail = live << 2; this.head = 0; this.cap = cap;
  }
  clear() { this.head = this.tail = 0; }
}

const _q = [0, 0, 0, 0];

export class World {
  constructor(seedStr) {
    this.seedStr = String(seedStr);
    this.seedNum = hashSeed(this.seedStr);
    this.chunks = new Map();
    this.edits = new Map();          // 'cx,cz' -> Map(idx -> id)
    this.containers = new Map();     // 'x,y,z' -> {type, slots?, fuelSec?, burnMax?, progress?, lootTable?}
    this.dirtyChunks = new Set();
    this.onChunkReady = null;        // (chunk)
    this.onChunkUnload = null;       // (chunk)
    this.onBlockChanged = null;      // (x,y,z,id)
    this.onDrops = null;             // (x,y,z,itemId,count)
    this.skyQ = new LightQueue();
    this.blkQ = new LightQueue();
    this.pendingWater = new Set();
    this._waterScheduled = false;
    this.scheduled = [];             // {t, fn} world-tick tasks (water/sand)
    this.now = 0;
    this.viewCenter = { cx: 0, cz: 0 };
    this.viewRadius = 10;

    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    this.jobsPending = 0;
    this.requestQueue = [];
    this.inflight = new Set();       // 'cx,cz'
    for (let i = 0; i < n; i++) {
      const w = new Worker(WORKER_URL, { type: 'module' });
      w.postMessage({ type: 'init', seed: this.seedStr, id: i });
      w.onmessage = (e) => this._onWorkerMsg(e.data);
      this.workers.push(w);
    }
  }

  destroy() { for (const w of this.workers) w.terminate(); }

  // ---------- chunk lifecycle ----------
  key(cx, cz) { return cx + ',' + cz; }

  requestArea(cx, cz, r) {
    this.viewCenter.cx = cx; this.viewCenter.cz = cz; this.viewRadius = r;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const k = this.key(cx + dx, cz + dz);
      if (!this.chunks.has(k) && !this.inflight.has(k)) {
        this.requestQueue.push({ cx: cx + dx, cz: cz + dz });
        this.inflight.add(k);
      }
    }
    // unload distant
    const limit = r + 3;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - cx) > limit || Math.abs(c.cz - cz) > limit) {
        if (this.onChunkUnload) this.onChunkUnload(c);
        this.dirtyChunks.delete(k);
        this.chunks.delete(k);
      }
    }
  }

  pumpRequests() {
    if (!this.requestQueue.length) return;
    this.requestQueue.sort((a, b) => {
      const da = (a.cx - this.viewCenter.cx) ** 2 + (a.cz - this.viewCenter.cz) ** 2;
      const db = (b.cx - this.viewCenter.cx) ** 2 + (b.cz - this.viewCenter.cz) ** 2;
      return da - db;
    });
    const maxInflightPerWorker = 2;
    for (const w of this.workers) {
      while ((w._inflight || 0) < maxInflightPerWorker && this.requestQueue.length) {
        const job = this.requestQueue.shift();
        w._inflight = (w._inflight || 0) + 1;
        w.postMessage({ type: 'gen', cx: job.cx, cz: job.cz });
        this.jobsPending++;
      }
    }
  }

  _onWorkerMsg(d) {
    if (d.type !== 'chunk') return;
    const k = this.key(d.cx, d.cz);
    const w = this.workers.find(w => w._inflight > 0);
    if (w) w._inflight--;
    this.jobsPending--;
    if (!this.inflight.has(k)) return; // stale (unloaded meanwhile)
    this.inflight.delete(k);

    const chunk = {
      cx: d.cx, cz: d.cz,
      blocks: new Uint8Array(d.blocks),
      heights: new Int16Array(d.heights),
      biomes: new Uint8Array(d.biomes),
      skyL: new Uint8Array(CHUNK * CHUNK * HEIGHT),
      blkL: new Uint8Array(CHUNK * CHUNK * HEIGHT),
      meshes: null, dirty: true,
    };
    // apply saved edits
    const em = this.edits.get(k);
    if (em) {
      const metas = [];
      for (const [i, v] of em) {
        chunk.blocks[i] = v & 255;
        const m = v >> 8;
        if (m) metas.push([i, m]);
      }
      if (metas.length) {
        chunk.meta = new Uint8Array(CHUNK * CHUNK * HEIGHT);
        for (const [i, m] of metas) chunk.meta[i] = m;
      }
    }
    this.chunks.set(k, chunk);
    this.initChunkLight(chunk);
    this.seedBorders(chunk);
    this.dirtyChunks.add(k);
    if (this.onChunkReady) this.onChunkReady(chunk);
  }

  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)); }
  chunkAt(x, z) { return this.getChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK)); }

  pendingCount() { return this.requestQueue.length + this.jobsPending; }

  // ---------- block access ----------
  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c) return B.AIR;
    return c.blocks[((y << 8) | ((z - cz * CHUNK) << 4) | (x - cx * CHUNK))];
  }

  getBlockRaw(x, y, z) { // assumes int coords
    if (y < 0 || y >= HEIGHT) return B.AIR;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get((cx + ',' + cz));
    if (!c) return B.AIR;
    return c.blocks[(y << 8) | ((z - (cz << 4)) << 4) | (x - (cx << 4))];
  }

  _chunkOf(x, z) { return this.chunks.get((x >> 4) + ',' + (z >> 4)); }

  getSky(x, y, z) {
    if (y < 0) return 0; if (y >= HEIGHT) return 15;
    const c = this._chunkOf(x, z); if (!c) return 15;
    return c.skyL[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  getBlk(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this._chunkOf(x, z); if (!c) return 0;
    return c.blkL[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  setSky(x, y, z, v) {
    if (y < 0 || y >= HEIGHT) return;
    const c = this._chunkOf(x, z); if (!c) return;
    c.skyL[(y << 8) | ((z & 15) << 4) | (x & 15)] = v;
  }
  setBlk(x, y, z, v) {
    if (y < 0 || y >= HEIGHT) return;
    const c = this._chunkOf(x, z); if (!c) return;
    c.blkL[(y << 8) | ((z & 15) << 4) | (x & 15)] = v;
  }

  markDirty(x, z) {
    const cx = x >> 4, cz = z >> 4;
    this.dirtyChunks.add(cx + ',' + cz);
    const lx = x & 15, lz = z & 15;
    if (lx === 0) this.dirtyChunks.add((cx - 1) + ',' + cz);
    if (lx === 15) this.dirtyChunks.add((cx + 1) + ',' + cz);
    if (lz === 0) this.dirtyChunks.add(cx + ',' + (cz - 1));
    if (lz === 15) this.dirtyChunks.add(cx + ',' + (cz + 1));
  }

  getMeta(x, y, z) {
    const c = this._chunkOf(x, z); if (!c || !c.meta) return undefined;
    return c.meta[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  setMeta(x, y, z, v) {
    const c = this._chunkOf(x, z); if (!c) return;
    if (!c.meta) c.meta = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    c.meta[(y << 8) | ((z & 15) << 4) | (x & 15)] = v;
  }

  // ---------- lighting ----------
  initChunkLight(chunk) {
    const { blocks, heights, skyL } = chunk;
    skyL.fill(0);
    const ox = chunk.cx * CHUNK, oz = chunk.cz * CHUNK;
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      let v = 15;
      const h = heights[z * 16 + x];
      for (let y = HEIGHT - 1; y >= 0; y--) {
        const b = blocks[(y << 8) | (z << 4) | x];
        if (isOpaque(b)) break;
        if (b !== B.AIR) {
          if (isLiquid(b)) v = Math.max(0, v - 3);
          else if (BLOCKS[b] && BLOCKS[b].cutout) v = Math.max(0, v - 2);
        }
        skyL[(y << 8) | (z << 4) | x] = v;
        if (v === 0) break;
      }
      // seed cells whose horizontal neighbors could be darker
      const colH = Math.max(
        z > 0 ? heights[(z - 1) * 16 + x] : h,
        z < 15 ? heights[(z + 1) * 16 + x] : h,
        x > 0 ? heights[z * 16 + x - 1] : h,
        x < 15 ? heights[z * 16 + x + 1] : h);
      for (let y = Math.min(HEIGHT - 1, colH); y > h - 20 && y >= 0; y--) {
        const v2 = skyL[(y << 8) | (z << 4) | x];
        if (v2 > 1) this.skyQ.push(ox + x, y, oz + z, v2);
      }
    }
    // block light sources
    for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const b = blocks[(y << 8) | (z << 4) | x];
      const e = lightOf(b);
      if (e > 0) {
        chunk.blkL[(y << 8) | (z << 4) | x] = e;
        this.blkQ.push(ox + x, y, oz + z, e);
      }
    }
  }

  seedBorders(chunk) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const ox = chunk.cx * CHUNK, oz = chunk.cz * CHUNK;
    for (const [dx, dz] of dirs) {
      const n = this.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!n) continue;
      const nox = n.cx * CHUNK, noz = n.cz * CHUNK;
      for (let y = 0; y < HEIGHT; y++) {
        for (let t = 0; t < CHUNK; t++) {
          // my edge cell
          const ex = dx === 1 ? 15 : dx === -1 ? 0 : t;
          const ez = dz === 1 ? 15 : dz === -1 ? 0 : t;
          // neighbor's facing cell
          const nx2 = dx === 1 ? 0 : dx === -1 ? 15 : t;
          const nz2 = dz === 1 ? 0 : dz === -1 ? 15 : t;
          const mi = (y << 8) | (ez << 4) | ex;
          const ni = (y << 8) | (nz2 << 4) | nx2;
          if (!isOpaque(chunk.blocks[mi])) {
            if (n.skyL[ni] > chunk.skyL[mi]) this.skyQ.push(ox + ex, y, oz + ez, n.skyL[ni]);
            if (n.blkL[ni] > chunk.blkL[mi]) this.blkQ.push(ox + ex, y, oz + ez, n.blkL[ni]);
          }
          if (!isOpaque(n.blocks[ni])) {
            if (chunk.skyL[mi] > n.skyL[ni]) this.skyQ.push(nox + nx2, y, noz + nz2, chunk.skyL[mi]);
            if (chunk.blkL[mi] > n.blkL[ni]) this.blkQ.push(nox + nx2, y, noz + nz2, chunk.blkL[mi]);
          }
        }
      }
    }
  }

  processLight(budgetNodes = 20000) {
    let ops = 0;
    ops += this._propagate(this.skyQ, true, budgetNodes - ops);
    ops += this._propagate(this.blkQ, false, budgetNodes - ops);
    return ops;
  }

  _propagate(q, isSky, budget) {
    let ops = 0;
    while (q.length && ops < budget) {
      q.pop(_q);
      ops++;
      const [x, y, z, v] = _q;
      if (v <= 0) continue;
      const cur = isSky ? this.getSky(x, y, z) : this.getBlk(x, y, z);
      if (cur > v) continue; // superseded
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (ny < 0 || ny >= HEIGHT) continue;
        const nb = this.getBlockRaw(nx, ny, nz);
        if (isOpaque(nb)) continue;
        const c = this._chunkOf(nx, nz);
        if (!c) continue;
        let nv = v - 1;
        if (isSky && d === 3 && v === 15 && !isLiquid(nb)) nv = 15; // straight down through air
        if (isLiquid(nb)) nv = Math.max(0, nv - 2);
        else if (nb !== B.AIR && BLOCKS[nb] && BLOCKS[nb].cutout) nv = Math.max(0, nv - 2);
        const curN = isSky ? this.getSky(nx, ny, nz) : this.getBlk(nx, ny, nz);
        if (curN >= nv) continue;
        if (isSky) this.setSky(nx, ny, nz, nv); else this.setBlk(nx, ny, nz, nv);
        q.push(nx, ny, nz, nv);
        this.markDirty(nx, nz);
      }
    }
    return ops;
  }

  removeLightAt(x, y, z, isSky) {
    const startV = isSky ? this.getSky(x, y, z) : this.getBlk(x, y, z);
    if (startV === 0) return;
    if (isSky) this.setSky(x, y, z, 0); else this.setBlk(x, y, z, 0);
    const rq = new LightQueue(4096);
    rq.push(x, y, z, startV);
    while (rq.length) {
      rq.pop(_q);
      const [px, py, pz, pv] = _q;
      for (let d = 0; d < 6; d++) {
        const nx = px + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = py + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = pz + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (ny < 0 || ny >= HEIGHT) continue;
        const nv = isSky ? this.getSky(nx, ny, nz) : this.getBlk(nx, ny, nz);
        if (nv === 0) continue;
        if (nv < pv || (isSky && d === 2 && pv === 15 && nv === 15)) {
          if (isSky) this.setSky(nx, ny, nz, 0); else this.setBlk(nx, ny, nz, 0);
          rq.push(nx, ny, nz, nv);
          this.markDirty(nx, nz);
        } else {
          // brighter cell: re-add as source
          if (isSky) this.skyQ.push(nx, ny, nz, nv); else this.blkQ.push(nx, ny, nz, nv);
        }
      }
    }
  }

  relightColumn(x, z) {
    // recompute the skylight column after an edit (cheap local fix)
    const c = this._chunkOf(x, z);
    if (!c) return;
    const lx = x & 15, lz = z & 15;
    let v = 15;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const b = c.blocks[(y << 8) | (lz << 4) | lx];
      if (isOpaque(b)) break;
      if (isLiquid(b)) v = Math.max(0, v - 3);
      else if (b !== B.AIR && BLOCKS[b] && BLOCKS[b].cutout) v = Math.max(0, v - 2);
      const old = c.skyL[(y << 8) | (lz << 4) | lx];
      c.skyL[(y << 8) | (lz << 4) | lx] = v;
      if (v !== old) this.markDirty(x, z);
      if (v === 0) break;
    }
    // reseed this cell for horizontal spread
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (this.getSky(x, y, z) > 1) this.skyQ.push(x, y, z, this.getSky(x, y, z));
      else break;
    }
  }

  // ---------- editing ----------
  setBlock(x, y, z, id, opts = {}) {
    if (y < 0 || y >= HEIGHT) return false;
    const c = this._chunkOf(x, z);
    if (!c) return false;
    const lx = x & 15, lz = z & 15;
    const i = (y << 8) | (lz << 4) | lx;
    const old = c.blocks[i];
    if (old === id) return false;
    c.blocks[i] = id;

    // record edit for persistence (id | meta<<8)
    const k = this.key(c.cx, c.cz);
    let em = this.edits.get(k);
    if (!em) { em = new Map(); this.edits.set(k, em); }
    const faceDir = opts.face !== undefined ? (opts.face & 3) : (this.getMeta(x, y, z) ?? 0);
    em.set(i, id + (faceDir << 8));
    if (opts.face !== undefined && BLOCKS[id] && (BLOCKS[id].tileFront || BLOCKS[id].interact)) {
      this.setMeta(x, y, z, opts.face & 3);
    }

    // heightmap maintenance
    const hcol = lz * 16 + lx;
    if (id !== B.AIR && y > c.heights[hcol]) c.heights[hcol] = y;
    else if (y === c.heights[hcol]) {
      let yy = y;
      while (yy > 0 && c.blocks[(yy << 8) | (lz << 4) | lx] === B.AIR) yy--;
      c.heights[hcol] = yy;
    }

    // ---- lighting updates ----
    const oldEmit = lightOf(old), newEmit = lightOf(id);
    if (oldEmit > 0) this.removeLightAt(x, y, z, false);
    if (newEmit > 0) {
      c.blkL[i] = newEmit;
      this.blkQ.push(x, y, z, newEmit);
    }
    if (isOpaque(id) && !isOpaque(old)) {
      this.removeLightAt(x, y, z, true);
      this.removeLightAt(x, y, z, false);
    } else if (!isOpaque(id) && isOpaque(old)) {
      this.relightColumn(x, z);
      // pull block light from neighbors
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        const bv = this.getBlk(nx, ny, nz);
        if (bv > 1) this.blkQ.push(nx, ny, nz, bv);
      }
      // sky from above
      const sv = this.getSky(x, y + 1, z);
      if (sv > 0) this.skyQ.push(x, y + 1, z, sv);
    }

    this.markDirty(x, z);
    if (this.onBlockChanged) this.onBlockChanged(x, y, z, id);

    // neighbor reactions
    if (!opts.noNeighbors) {
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        this.neighborChanged(nx, ny, nz);
      }
      this.neighborChanged(x, y, z); // self (support checks etc.)
      if (lightOf(old) > 0 || lightOf(id) > 0 || isOpaque(id) !== isOpaque(old)) {
        this.updateCircuitsNear(x, y, z);
      }
    }
    return true;
  }

  neighborChanged(x, y, z) {
    const b = this.getBlockRaw(x, y, z);
    if (b === B.AIR) {
      // nothing
    }
    const bd = BLOCKS[b];
    if (!bd) return;
    // support pops
    if (bd.attach === 'ground') {
      const below = this.getBlockRaw(x, y - 1, z);
      if (!isOpaque(below) && !(bd.liquid)) {
        this.popBlock(x, y, z);
        return;
      }
    } else if (bd.attach === 'wall') {
      const supported = isOpaque(this.getBlockRaw(x + 1, y, z)) || isOpaque(this.getBlockRaw(x - 1, y, z)) ||
        isOpaque(this.getBlockRaw(x, y, z + 1)) || isOpaque(this.getBlockRaw(x, y, z - 1));
      if (!supported) { this.popBlock(x, y, z); return; }
    }
    if (bd.render === 'carpet') { // wire sits directly on ground
      const below = this.getBlockRaw(x, y - 1, z);
      if (!isSolid(below)) { this.popBlock(x, y, z); return; }
    }
    // crops need farmland
    if (bd.cropStage !== undefined && this.getBlockRaw(x, y - 1, z) !== B.FARMLAND) {
      this.popBlock(x, y, z); return;
    }
    // gravity blocks
    if (bd.gravity && !this.scheduled.some(s => s.tag === 'grav' && s.x === x && s.y === y && s.z === z)) {
      this.schedule(0.12, () => this.fallColumn(x, y, z), 'grav', x, y, z);
    }
    // water dynamics
    if (bd.liquid && !bd.lava) {
      this.queueWater(x, y, z);
      this.queueWater(x, y - 1, z);
    } else if (b === B.AIR) {
      const up = this.getBlockRaw(x, y + 1, z);
      const anyWater = (isLiquid(up) && !BLOCKS[up].lava) ||
        isLiquid(this.getBlockRaw(x + 1, y, z)) || isLiquid(this.getBlockRaw(x - 1, y, z)) ||
        isLiquid(this.getBlockRaw(x, y, z + 1)) || isLiquid(this.getBlockRaw(x, y, z - 1));
      if (anyWater) this.queueWater(x, y, z);
    }
    if (b === B.SAPLING) this.schedule(1 + Math.random() * 4, () => this.tryGrowTree(x, y, z), 'tree');
  }

  popBlock(x, y, z) {
    const id = this.getBlockRaw(x, y, z);
    const bd = BLOCKS[id];
    if (!bd || id === B.AIR) return;
    this.setBlock(x, y, z, B.AIR);
    let dropId = id, count = 1;
    if (bd.dropFn === 'oakLeaves') dropId = Math.random() < 0.08 ? 'apple' : (Math.random() < 0.25 ? B.SAPLING : null);
    if (Array.isArray(bd.drop)) { [[dropId, count]] = bd.drop.length ? bd.drop : [[null, 0]]; }
    if (dropId != null && this.onDrops) this.onDrops(x + 0.5, y + 0.3, z + 0.5, dropId, count);
  }

  fallColumn(x, y, z) {
    const b = this.getBlockRaw(x, y, z);
    if (!(BLOCKS[b] && BLOCKS[b].gravity)) return;
    let ny = y;
    while (ny > 0) {
      const below = this.getBlockRaw(x, ny - 1, z);
      if (below === B.AIR || (isLiquid(below) && !BLOCKS[below].lava)) ny--;
      else break;
    }
    if (ny === y) return;
    this.setBlock(x, y, z, B.AIR);
    this.setBlock(x, ny, z, b);
  }

  // ---------- water cellular automaton (pending-set driven) ----------
  queueWater(x, y, z) {
    this.pendingWater.add(x + '|' + y + '|' + z);
    if (!this._waterScheduled) {
      this._waterScheduled = true;
      this.schedule(0.22, () => { this._waterScheduled = false; this.waterStep(); }, 'water');
    }
  }

  waterStep() {
    if (!this.pendingWater.size) return;
    const items = [...this.pendingWater];
    this.pendingWater.clear();
    let changed = 0;
    for (const key of items) {
      const [x, y, z] = key.split('|').map(Number);
      const b = this.getBlockRaw(x, y, z);
      // water above air: fall
      if (isLiquid(b) && !BLOCKS[b].lava && y > 0) {
        const below = this.getBlockRaw(x, y - 1, z);
        if (below === B.AIR || BLOCKS[below]?.replaceable) {
          this.setBlock(x, y - 1, z, b === B.WATER ? B.WATER : B.WATER_F4);
          changed++;
          continue;
        }
        if (b === B.WATER || (BLOCKS[b].flowLevel || 9) < 4) {
          const level = b === B.WATER ? 0 : BLOCKS[b].flowLevel;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nb = this.getBlockRaw(x + dx, y, z + dz);
            if ((nb === B.AIR || BLOCKS[nb]?.replaceable)) {
              this.setBlock(x + dx, y, z + dz, B.WATER_F1 + level);
              changed++;
            } else if (nb === b && b !== B.WATER) {
              // check feeding for existing flows
            }
          }
        }
      } else if (b === B.AIR) {
        // maybe water wants to flow in from neighbors
        let best = null;
        const up = this.getBlockRaw(x, y + 1, z);
        if (up === B.WATER || (isLiquid(up) && !BLOCKS[up].lava)) best = B.WATER_F4;
        else {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nb = this.getBlockRaw(x + dx, y, z + dz);
            if (nb === B.WATER) { best = B.WATER_F1; break; }
            if (isLiquid(nb) && !BLOCKS[nb].lava) {
              const lvl = BLOCKS[nb].flowLevel;
              if (lvl < 4 && (!best || lvl < BLOCKS[best].flowLevel - 1)) best = B.WATER_F1 + lvl;
            }
          }
        }
        if (best) { this.setBlock(x, y, z, best); changed++; }
      }
    }
    if (changed > 0) {
      this.schedule(0.24, () => this.waterStep(), 'water');
    }
  }

  _waterFedUnused() { return false; }

  // ---------- circuits ----------
  updateCircuitsNear(x, y, z) {
    // Flood outward from the seed through ALL cells (walls included) but only
    // record circuit components; bounded exploration.
    const seen = new Set();
    const queue = [[x, y, z]];
    let qi = 0;
    const nodes = [];
    let iter = 0;
    const R = 26;
    while (qi < queue.length && iter++ < 80000 && nodes.length < 4000) {
      const [px, py, pz] = queue[qi++];
      if (Math.abs(px - x) > R || Math.abs(py - y) > R || Math.abs(pz - z) > R) continue;
      const kk = px + '|' + py + '|' + pz;
      if (seen.has(kk)) continue;
      seen.add(kk);
      const b = this.getBlockRaw(px, py, pz);
      const bd = BLOCKS[b];
      const relevant = bd && (bd.conducts || bd.conductTarget || bd.powerSrc);
      if (relevant) nodes.push([px, py, pz, b]);
      // expand through anything except opaque solids — but circuit components
      // are always enterable/expandable so networks stay connected.
      if (!bd || !bd.opaque || relevant) {
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          queue.push([px + dx, py + dy, pz + dz]);
        }
      }
    }
    if (!nodes.length) return;
    // multi-source BFS from power sources through wires
    const dist = new Map();
    const q = [];
    for (const [px, py, pz, b] of nodes) if (b === B.LEVER_ON) { dist.set(px + '|' + py + '|' + pz, 15); q.push([px, py, pz]); }
    while (q.length) {
      const [px, py, pz] = q.shift();
      const d = dist.get(px + '|' + py + '|' + pz);
      if (d <= 0) continue;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nk = (px + dx) + '|' + (py + dy) + '|' + (pz + dz);
        const nb = this.getBlockRaw(px + dx, py + dy, pz + dz);
        const nd = BLOCKS[nb];
        if (nd && nd.conducts && !dist.has(nk)) {
          dist.set(nk, d - 1);
          q.push([px + dx, py + dy, pz + dz]);
        }
      }
    }
    for (const [px, py, pz, b] of nodes) {
      const bd = BLOCKS[b];
      const kk = px + '|' + py + '|' + pz;
      const powered = dist.has(kk) || (bd.conductTarget &&
        [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) =>
          dist.has((px + dx) + '|' + (py + dy) + '|' + (pz + dz))));
      if (b === B.WIRE_OFF && powered) this.setBlock(px, py, pz, B.WIRE_ON, { noNeighbors: true });
      else if (b === B.WIRE_ON && !powered) this.setBlock(px, py, pz, B.WIRE_OFF, { noNeighbors: true });
      else if (b === B.LAMP_OFF && powered) this.setBlock(px, py, pz, B.LAMP_ON);
      else if (b === B.LAMP_ON && !powered) this.setBlock(px, py, pz, B.LAMP_OFF);
    }
  }

  toggleLever(x, y, z) {
    const b = this.getBlockRaw(x, y, z);
    if (b === B.LEVER_OFF) this.setBlock(x, y, z, B.LEVER_ON);
    else if (b === B.LEVER_ON) this.setBlock(x, y, z, B.LEVER_OFF);
    this.updateCircuitsNear(x, y, z);
  }

  // ---------- random ticks ----------
  randomTicks(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
    for (let i = 0; i < 24; i++) {
      const cx = pcx + ((Math.random() * 9) | 0) - 4;
      const cz = pcz + ((Math.random() * 9) | 0) - 4;
      const c = this.getChunk(cx, cz);
      if (!c) continue;
      const x = (Math.random() * 16) | 0, z = (Math.random() * 16) | 0, y = (Math.random() * HEIGHT) | 0;
      const b = c.blocks[(y << 8) | (z << 4) | x];
      const bd = BLOCKS[b];
      if (!bd) continue;
      const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
      if (bd.cropStage !== undefined && bd.cropStage < 3) {
        const light = Math.max(this.getSky(wx, y, wz), this.getBlk(wx, y, wz));
        const wet = this._nearWater(wx, y - 1, wz);
        const chance = (light >= 8 ? (wet ? 0.35 : 0.14) : 0);
        if (Math.random() < chance) this.setBlock(wx, y, wz, B.WHEAT0 + bd.cropStage + 1);
      } else if (b === B.SAPLING) {
        const light = Math.max(this.getSky(wx, y, wz), this.getBlk(wx, y, wz));
        if (light >= 8 && Math.random() < 0.25) {
          this.setBlock(wx, y, wz, B.AIR);
          const rng = mulberry32((hashSeed(wx + '|' + y + '|' + wz + '|' + this.seedStr)));
          const ok = plantTree(c.blocks, x, y, z, rng, Math.random() < 0.25 ? 'birch' : 'oak');
          if (!ok) this.setBlock(wx, y, wz, B.SAPLING);
          else {
            this.markDirty(wx, wz); this.markDirty(wx + 3, wz); this.markDirty(wx - 3, wz);
            this.markDirty(wx, wz + 3); this.markDirty(wx, wz - 3);
            this.relightColumn(wx, wz);
          }
        }
      } else if (b === B.DIRT && this.getBlockRaw(wx, y + 1, wz) === B.AIR) {
        // grass creep
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.getBlockRaw(wx + dx, y, wz + dz) === B.GRASS && Math.max(this.getSky(wx, y, wz), this.getBlk(wx, y, wz)) >= 9) {
            this.setBlock(wx, y, wz, B.GRASS); break;
          }
        }
      }
    }
  }

  _nearWater(x, y, z) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (isLiquid(this.getBlockRaw(x + dx, y, z + dz))) return true;
    }
    return false;
  }

  tryGrowTree(x, y, z) {
    if (this.getBlockRaw(x, y, z) !== B.SAPLING) return;
  }

  // ---------- scheduled tasks ----------
  schedule(delay, fn, tag, x = 0, y = 0, z = 0) {
    this.scheduled.push({ t: this.now + delay, fn, tag, x, y, z });
  }

  tick(dt) {
    this.now += dt;
    if (this.scheduled.length) {
      const due = [];
      for (let i = this.scheduled.length - 1; i >= 0; i--) {
        if (this.scheduled[i].t <= this.now) { due.push(this.scheduled[i]); this.scheduled.splice(i, 1); }
      }
      for (const s of due) s.fn();
    }
  }

  // ---------- containers ----------
  containerKey(x, y, z) { return x + ',' + y + ',' + z; }

  getContainer(x, y, z, type) {
    const k = this.containerKey(x, y, z);
    let c = this.containers.get(k);
    if (!c) {
      c = { type };
      if (type === 'chest') {
        c.slots = new Array(27).fill(null);
        // dungeon chests (deep) get treasure
        if (y < 36 && mulberry32(hashSeed('loot' + k))() < 0.85) this._fillLoot(c, y);
      } else if (type === 'furnace') {
        c.slots = new Array(3).fill(null);
        c.burnLeft = 0; c.burnMax = 1; c.progress = 0;
      }
      this.containers.set(k, c);
    }
    return c;
  }

  _fillLoot(c, y) {
    const rng = mulberry32(hashSeed('treasure' + c.type + y));
    const table = [
      ['iron_ingot', 1, 4, 0.7], ['gold_ingot', 1, 3, 0.45], ['diamond', 1, 2, 0.28],
      ['coal', 2, 6, 0.7], ['bread', 1, 3, 0.6], ['apple', 1, 3, 0.5],
      ['spark_dust', 2, 5, 0.5], ['stick', 2, 5, 0.5], ['golden_pickaxe', 1, 1, 0.08],
    ];
    let slot = 0;
    for (const [item, mn, mx, p] of table) {
      if (rng() < p && slot < c.slots.length) {
        c.slots[slot++] = { id: item, count: mn + ((rng() * (mx - mn + 1)) | 0), dur: Infinity };
      }
    }
  }

  tickFurnaces(dt) {
    for (const [k, c] of this.containers) {
      if (c.type !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      const input = c.slots[0], fuel = c.slots[1], out = c.slots[2];
      const rec = input ? SMELTING[input.id] : null;
      const canOut = rec && (!out || (out.id === rec[0] && out.count < 64));
      if (c.burnLeft <= 0 && rec && canOut && fuel) {
        const fs = fuelSeconds(fuel.id);
        if (fs > 0) {
          c.burnLeft = fs; c.burnMax = fs;
          fuel.count--; if (fuel.count <= 0) c.slots[1] = null;
        }
      }
      const wasBurning = c.burnLeft > 0;
      if (c.burnLeft > 0) {
        c.burnLeft -= dt;
        if (rec && canOut) {
          c.progress += dt;
          if (c.progress >= rec[1]) {
            c.progress = 0;
            input.count--; if (input.count <= 0) c.slots[0] = null;
            if (out) out.count++; else c.slots[2] = { id: rec[0], count: 1, dur: Infinity };
            this.markDirty(x, z);
            if (this.onFurnaceSmelt) this.onFurnaceSmelt(x, y, z);
          }
        } else c.progress = 0;
      } else c.progress = Math.max(0, c.progress - dt * 2);
      const burning = c.burnLeft > 0;
      if (burning !== wasBurning || (burning && this.getBlockRaw(x, y, z) === B.FURNACE)) {
        const cur = this.getBlockRaw(x, y, z);
        if (cur === B.FURNACE && burning) this.setBlock(x, y, z, B.FURNACE_LIT);
        else if (cur === B.FURNACE_LIT && !burning) this.setBlock(x, y, z, B.FURNACE);
      }
    }
  }

  // ---------- helpers ----------
  surfaceY(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return SEA + 2;
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, lz = ((z % CHUNK) + CHUNK) % CHUNK;
    return c.heights[lz * 16 + lx];
  }

  biomeAt(x, z) {
    const c = this.chunkAt(x, z);
    if (!c) return 2;
    const lx = ((x % CHUNK) + CHUNK) % CHUNK, lz = ((z % CHUNK) + CHUNK) % CHUNK;
    return c.biomes[lz * 16 + lx];
  }

  findSpawn() {
    for (let r = 0; r < 48; r++) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r * 8), z = Math.round(Math.sin(ang) * r * 8);
        const c = this.chunkAt(x, z);
        if (!c) continue;
        const bio = this.biomeAt(x, z);
        const h = this.surfaceY(x, z);
        if (h > SEA && bio !== 0 && bio !== 5) return { x: x + 0.5, y: h + 2.5, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: SEA + 30, z: 0.5 };
  }
}
