// ChunkManager: owns loaded chunks, drives worker pool (gen+light+mesh),
// applies edits with incremental relight+remesh, provides voxel/light accessors.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { CS, WH } = __RQ('../gen/worldgen.js');
const { BLOCKS } = __RQ('../shared/blocks.js');
const LIGHT_MOD = __RQ('../world/light.js');

const CHUNK_VOL = CS * CS * WH;
const idxOf = (x, y, z) => x + z * CS + y * CS * CS;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = null; this.hm = null;
    this.sky = null; this.blockLight = null;
    this.meshes = null;       // {solid, cutout, trans} THREE.Mesh
    this.dirtyMesh = false;   // needs remesh
    this.state = 'empty';     // empty -> gen -> lit -> ready
  }
}

class World {
  constructor(opts) {
    this.scene = opts.scene;
    this.seed = opts.seed;
    this.materials = opts.materials; // {solid, cutout, trans}
    this.workerCount = Math.min(6, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    this.pendingGen = new Map();  // "cx,cz" -> [callbacks]
    this.chunks = new Map();      // "cx,cz" -> Chunk
    this.renderDistance = opts.renderDistance || 10;
    this.genQueue = [];           // sorted each frame by distance
    this.remeshQueue = new Set();
    this.onChunkReady = opts.onChunkReady || (() => {});
    this.edits = opts.edits || {};  // "cx,cz" -> {"idx": id} for persistence overlay
    this.initWorkers();
    this.tmpLightAcc = null;
  }

  initWorkers() {
    for (let i = 0; i < this.workerCount; i++) {
      const w = new Worker('/Minecraft/src/gen/worker.js');
      w.postMessage({ type: 'init', seed: this.seed });
      w.onmessage = (ev) => this.onWorkerMsg(i, ev.data);
      w.onerror = (e) => console.error('[worker ' + i + '] error:', e.message || e, e.filename || '');
      this.workers.push({ w, busy: false });
    }
  }

  key(cx, cz) { return cx + ',' + cz; }

  onWorkerMsg(workerIdx, msg) {
    const rec = this.workers[workerIdx];
    rec.busy = false;
    if (msg.type === 'error') { console.error('[worker]', msg.msg); return; }
    if (msg.type === 'chunk') {
      const k = this.key(msg.cx, msg.cz);
      const ch = this.chunks.get(k);
      if (!ch) return; // unloaded while pending
      ch.blocks = msg.blocks; ch.hm = msg.hm;
      // apply persisted edits overlay
      const ed = this.edits[k];
      if (ed) for (const idx in ed) ch.blocks[idx] = ed[idx];
      ch.state = 'gen';
      this.queueLightMesh(msg.cx, msg.cz);
      this.pump();
    } else if (msg.type === 'lightmesh') {
      const k = this.key(msg.cx, msg.cz);
      const ch = this.chunks.get(k);
      if (!ch) return;
      ch.sky = msg.sky; ch.blockLight = msg.block;
      ch.state = 'ready';
      this.uploadMeshes(ch, msg);
      this.onChunkReady(ch);
      // neighbors that were waiting on this data can remesh once
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nch = this.chunks.get(this.key(msg.cx + dx, msg.cz + dz));
        if (nch && nch.state === 'ready' && !nch.dirtyMesh && nch.borderWasWaiting) nch.dirtyMesh = true;
      }
      this.pump();
    }
  }

  pump() {
    // assign idle workers to queued work (priority: gen first, then dirty remesh)
    for (const rec of this.workers) {
      if (rec.busy) continue;
      let task = null, kind = null;
      // find nearest ungenerated chunk
      this.sortGenQueue();
      while (this.genQueue.length) {
        const k = this.genQueue.shift();
        const ch = this.chunks.get(k);
        if (!ch) continue;
        if (ch.state !== 'empty') continue;
        task = ch; kind = 'gen';
        break;
      }
      if (!task) {
        for (const k of this.remeshQueue) {
          const ch = this.chunks.get(k);
          if (ch && ((ch.state === 'pending' && !ch.borderWasWaiting) || (ch.state === 'ready' && ch.dirtyMesh))) { task = ch; ch.state = 'meshing'; kind = 'lightmesh'; break; }
        }
      }
      if (!task) break;
      rec.busy = true;
      if (kind === 'gen') {
        task.state = 'generating';
        rec.w.postMessage({ type: 'gen', cx: task.cx, cz: task.cz });
      } else {
        this.remeshQueue.delete(this.key(task.cx, task.cz));
        task.dirtyMesh = false;
        rec.w.postMessage({ type: 'lightmesh', cx: task.cx, cz: task.cz, ao: true });
      }
    }
  }

  sortGenQueue() {
    if (!this._pqDirty) return;
    this._pqDirty = false;
    const px = this.centerCx, pz = this.centerCz;
    this.genQueue.sort((a, b) => {
      const A = this.chunks.get(a), Bc = this.chunks.get(b);
      if (!A || !Bc) return 0;
      const da = (A.cx - px) * (A.cx - px) + (A.cz - pz) * (A.cz - pz);
      const db = (Bc.cx - px) * (Bc.cx - px) + (Bc.cz - pz) * (Bc.cz - pz);
      return da - db;
    });
  }

  queueLightMesh(cx, cz) {
    const k = this.key(cx, cz);
    const ch = this.chunks.get(k);
    if (!ch || (ch.state !== 'gen' && !(ch.borderWasWaiting && ch.state === 'generating'))) return;
    // ensure the 4 neighbors are generated before final lighting/meshing
    let waiting = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = this.key(cx + dx, cz + dz);
      let nch = this.chunks.get(nk);
      if (!nch) { nch = new Chunk(cx + dx, cz + dz); this.chunks.set(nk, nch); }
      if (nch.state === 'empty') {
        if (!this.genQueue.includes(nk)) { this.genQueue.push(nk); this._pqDirty = true; }
        waiting = true;
      }
    }
    if (waiting) { ch.borderWasWaiting = true; /* retried when neighbor arrives */ }
    else {
      ch.state = 'pending';
      this.remeshQueue.add(k);
      ch.dirtyMesh = true;
    }
  }

  update(playerX, playerZ) {
    this.centerCx = Math.floor(playerX / CS);
    this.centerCz = Math.floor(playerZ / CS);
    const RD = this.renderDistance;
    // ensure chunks exist in map & queue generation
    for (let dz = -RD; dz <= RD; dz++) {
      for (let dx = -RD; dx <= RD; dx++) {
        if (dx * dx + dz * dz > RD * RD + 2) continue; // circular
        const cx = this.centerCx + dx, cz = this.centerCz + dz;
        const k = this.key(cx, cz);
        let ch = this.chunks.get(k);
        if (!ch) {
          ch = new Chunk(cx, cz);
          this.chunks.set(k, ch);
          this.genQueue.push(k);
          this._pqDirty = true;
        }
      }
    }
    // retry border-waiting chunks occasionally
    this._retryTick = (this._retryTick || 0) + 1;
    if (this._retryTick % 30 === 0) {
      for (const ch of this.chunks.values()) {
        if (ch.state === 'gen' && ch.borderWasWaiting) { ch.borderWasWaiting = false; this.queueLightMesh(ch.cx, ch.cz); }
      }
    }
    // unload far chunks
    for (const [k, ch] of this.chunks) {
      const dx = ch.cx - this.centerCx, dz = ch.cz - this.centerCz;
      if (dx * dx + dz * dz > (RD + 3) * (RD + 3)) {
        this.disposeChunk(ch);
        this.chunks.delete(k);
      }
    }
    this.pump();
  }

  disposeChunk(ch) {
    if (!this.scene) return;
    if (ch.meshes) {
      for (const k of ['solid', 'cutout', 'trans']) {
        const m = ch.meshes[k];
        if (m) { this.scene.remove(m); m.geometry.dispose(); }
      }
    }
    ch.meshes = null;
  }

  uploadMeshes(ch, msg) {
    this.disposeChunk(ch);
    ch.meshes = {};
    const mats = this.materials;
    const make = (data, matKey, order) => {
      if (!data) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uv), 2));
      g.setAttribute('light', new THREE.BufferAttribute(new Uint8Array(data.light), 3, true));
      g.setAttribute('normidx', new THREE.BufferAttribute(new Int8Array(data.norm), 1));
      g.setIndex(new THREE.BufferAttribute((data.idx instanceof Uint32Array) ? new Uint32Array(data.idx) : new Uint16Array(data.idx), 1));
      void order;
      const mesh = new THREE.Mesh(g, mats[matKey]);
      mesh.position.set(ch.cx * CS, 0, ch.cz * CS);
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      return mesh;
    };
    ch.meshes.solid = make(msg.solid, 'solid');
    ch.meshes.cutout = make(msg.cutout, 'cutout');
    ch.meshes.trans = make(msg.trans, 'trans');
  }

  // ---- voxel accessors ----
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WH) return wy < 0 ? 10 : 0;
    const cx = wx >> 4, cz = wz >> 4;
    const ch = this.chunks.get(this.key(cx, cz));
    if (!ch || !ch.blocks) return 0;
    return ch.blocks[idxOf(wx & 15, wy, wz & 15)];
  }
  getBlockOrGenerateHint(wx, wy, wz) { return this.getBlock(wx, wy, wz); }
  getSky(wx, wy, wz) {
    const cx = wx >> 4, cz = wz >> 4;
    const ch = this.chunks.get(this.key(cx, cz));
    if (!ch || !ch.sky || wy >= WH) return 15;
    if (wy < 0) return 0;
    return ch.sky[idxOf(wx & 15, wy, wz & 15)];
  }
  getBlockLight(wx, wy, wz) {
    const cx = wx >> 4, cz = wz >> 4;
    const ch = this.chunks.get(this.key(cx, cz));
    if (!ch || !ch.blockLight || wy < 0 || wy >= WH) return 0;
    return ch.blockLight[idxOf(wx & 15, wy, wz & 15)];
  }

  /** Set a block with full incremental lighting + remesh of affected chunks. Returns affected chunk keys. */
  setBlock(wx, wy, wz, id) {
    if (wy <= 0 || wy >= WH) return [];
    const cx = wx >> 4, cz = wz >> 4;
    const k = this.key(cx, cz);
    const ch = this.chunks.get(k);
    if (!ch || !ch.blocks) return [];
    const li = idxOf(wx & 15, wy, wz & 15);
    const old = ch.blocks[li];
    if (old === id) return [];
    ch.blocks[li] = id;

    // record edit for persistence + keep workers' cache in sync via edit msg
    (this.edits[k] = this.edits[k] || {})[li] = id;
    for (const rec of this.workers) rec.w.postMessage({ type: 'edit', cx, cz, idx: li, id });

    // incremental relight using accessor over loaded chunks
    const acc = this.makeAccessor();
    const def = BLOCKS[id];
    if (def && (def.opacity > 0 || def.emit > 0)) LIGHT_MOD.onPlace(acc, wx, wy, wz, id);
    else LIGHT_MOD.onBreak(acc, wx, wy, wz);

    // mark dirty: this chunk + neighbors touching chunk edges (light/AO radius)
    const dirty = new Set([k]);
    const lx = wx & 15, lz = wz & 15;
    const push = (dx, dz) => { dirty.add(this.key(cx + dx, cz + dz)); };
    if (lx === 0) push(-1, 0); if (lx === 15) push(1, 0);
    if (lz === 0) push(0, -1); if (lz === 15) push(0, 1);
    // corners for AO correctness
    if (lx === 0 && lz === 0) push(-1, -1);
    if (lx === 15 && lz === 0) push(1, -1);
    if (lx === 0 && lz === 15) push(-1, 1);
    if (lx === 15 && lz === 15) push(1, 1);

    for (const dk of dirty) {
      const dch = this.chunks.get(dk);
      if (dch && dch.state === 'ready') { dch.dirtyMesh = true; this.remeshQueue.add(dk); }
    }
    // immediate remesh synchronously for responsiveness (small cost per edit)
    this.flushRemeshSync(Array.from(dirty));
    return Array.from(dirty);
  }

  flushRemeshSync(keys) {
    for (const k of keys) {
      const ch = this.chunks.get(k);
      if (!ch || !ch.blocks || ch.state !== 'ready' || !ch.dirtyMesh) continue;
      const nb = (wx, wy, wz) => this.getBlock(wx, wy, wz);
      const nbL = (wx, wy, wz) => [this.getSky(wx, wy, wz), this.getBlockLight(wx, wy, wz)];
      const M = __RQ('../mesh/mesher.js').meshChunk(ch.cx, ch.cz, ch.blocks, nb, nbL, { ao: true });
      this.uploadMeshes(ch, M);
      ch.dirtyMesh = false;
      this.remeshQueue.delete(k);
    }
    this.pump();
  }

  makeAccessor() {
    const self = this;
    return {
      get: (x, y, z) => self.getBlock(x, y, z),
      inBounds: (x, y, z) => {
        const ch = self.chunks.get(self.key(x >> 4, z >> 4));
        return !!ch && !!ch.sky && y >= 0 && y < WH;
      },
      getLight: (ch2, x, y, z) => ch2 === 0 ? self.getSky(x, y, z) : self.getBlockLight(x, y, z),
      setLight: (ch2, x, y, z, v) => {
        const c = self.chunks.get(self.key(x >> 4, z >> 4));
        if (!c) return;
        const arr = ch2 === 0 ? c.sky : c.blockLight;
        if (arr && y >= 0 && y < WH) arr[idxOf(x & 15, y, z & 15)] = v;
      },
    };
  }

  /** Highest solid y at column (for spawn), or -1. */
  surfaceY(wx, wz) {
    const ch = this.chunks.get(this.key(wx >> 4, wz >> 4));
    if (!ch || !ch.hm) return -1;
    return ch.hm[(wx & 15) + (wz & 15) * CS];
  }

  destroy() { for (const r of this.workers) r.w.terminate(); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { World, Chunk, CS, WH };
if (typeof self !== 'undefined') self.WORLD_MOD = { World, Chunk, CS, WH };
})();

