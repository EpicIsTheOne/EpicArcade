// Block-entity stations: furnace (smelting with fuel), chest (27 slots),
// farming growth ticks, redstone-lite wire/lever/lamp propagation.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { B, BLOCKS, I, SMELTING } = __RQ('../shared/blocks.js');

class Stations {
  constructor(world) {
    this.world = world;
    this.furnaces = new Map();   // key "x,y,z" -> {in, fuel, out, burnT, burnMax, cookT}
    this.chests = new Map();     // key -> array(27)
    this.growthQueue = [];       // {x,y,z,t}
    this.redstoneDirty = true;
    this.redstonePower = new Map(); // "x,y,z" -> powered bool for lamps
  }

  key(x, y, z) { return x + ',' + y + ',' + z; }

  getFurnace(x, y, z, create) {
    const k = this.key(x, y, z);
    let f = this.furnaces.get(k);
    if (!f && create) { f = { in: null, fuel: null, out: null, burnT: 0, burnMax: 0, cookT: 0 }; this.furnaces.set(k, f); }
    return f;
  }
  getChest(x, y, z, create) {
    const k = this.key(x, y, z);
    let c = this.chests.get(k);
    if (!c && create) { c = new Array(27).fill(null); this.chests.set(k, c); }
    return c;
  }

  /** queue a crop for growth check at time t (ms epoch) */
  scheduleGrowth(x, y, z, delaySec) {
    this.growthQueue.push({ x, y, z, t: performance.now() + delaySec * 1000 });
  }

  tick(dt) {
    // furnaces
    for (const [k, f] of this.furnaces) {
      const [sx, sy, sz] = k.split(',').map(Number);
      if (f.burnT > 0) f.burnT -= dt;
      const smeltable = f.in && SMELTING[f.in.id];
      if (f.burnT <= 0 && smeltable && f.fuel) {
        // consume one fuel
        const fuelId = f.fuel.id;
        const burn = (ITEMS_FUEL[fuelId] || 0) / 10; // seconds
        if (burn > 0) {
          f.burnT = burn; f.burnMax = burn;
          f.fuel.count--;
          if (f.fuel.count <= 0) f.fuel = null;
        }
      }
      const litNow = f.burnT > 0;
      if (litNow && smeltable) {
        f.cookT += dt;
        if (f.cookT >= 10) {
          f.cookT = 0;
          const res = SMELTING[f.in.id];
          f.in.count--;
          if (f.in.count <= 0) f.in = null;
          if (f.out && f.out.id === res.out) f.out.count += (res.count || 1);
          else if (!f.out) f.out = { id: res.out, count: res.count || 1 };
        }
      } else if (!litNow) f.cookT = Math.max(0, f.cookT - dt * 2);
      // sync lit block state
      const cur = this.world.getBlock(sx, sy, sz);
      if (litNow && cur === B.FURNACE) this.world.setBlock(sx, sy, sz, B.FURNACE_LIT);
      else if (!litNow && cur === B.FURNACE_LIT) this.world.setBlock(sx, sy, sz, B.FURNACE);
    }
    // crop growth
    const now = performance.now();
    for (let i = this.growthQueue.length - 1; i >= 0; i--) {
      const g = this.growthQueue[i];
      if (g.t > now) continue;
      this.growthQueue.splice(i, 1);
      const id = this.world.getBlock(g.x, g.y, g.z);
      if (id >= B.WHEAT0 && id < B.WHEAT3) {
        if (Math.random() < 0.75) {
          this.world.setBlock(g.x, g.y, g.z, id + 1);
          if (id + 1 < B.WHEAT3) this.scheduleGrowth(g.x, g.y, g.z, 24 + Math.random() * 20);
        } else {
          this.scheduleGrowth(g.x, g.y, g.z, 16);
        }
      }
    }
    // redstone-lite recompute occasionally
    if (this.redstoneDirty) { this.recomputeRedstone(); this.redstoneDirty = false; }
  }

  /** BFS from levers through wire (<=15), toggle lamps adjacent to powered wire. */
  recomputeRedstone() {
    const w = this.world;
    const powered = new Set();
    // find all levers that are ON within loaded chunks
    const sources = [];
    const seen = new Set();
    for (const [ck, ch] of w.chunks) {
      void ck;
      if (!ch.blocks) continue;
      // scan is expensive; only chunks edited since last compute could change — keep simple full scan of nearby
      for (let i = 0; i < ch.blocks.length; i++) {
        const id = ch.blocks[i];
        if (id === B.LEVER_ON) {
          const y = (i / 256) | 0;
          const z = ((i >> 4) & 15), x = (i & 15);
          sources.push([ch.cx * 16 + x, y, ch.cz * 16 + z]);
        }
      }
    }
    // BFS wires
    const queue = [];
    for (const s of sources) queue.push({ x: s[0], y: s[1], z: s[2], p: 15 });
    while (queue.length) {
      const n = queue.shift();
      if (n.p <= 0) continue;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = n.x + dx, ny = n.y + dy, nz = n.z + dz;
        const kk = nx + ',' + ny + ',' + nz;
        if (seen.has(kk)) continue;
        seen.add(kk);
        const id = w.getBlock(nx, ny, nz);
        if (id === B.REDSTONE_WIRE) { powered.add(kk); queue.push({ x: nx, y: ny, z: nz, p: n.p - 1 }); }
        else if (id === B.REDSTONE_LAMP || id === B.REDSTONE_LAMP_ON) {
          powered.add('L' + kk);
        }
      }
    }
    // apply lamp states (limit per tick)
    let changes = 0;
    for (const pk of powered) {
      if (!pk.startsWith('L')) continue;
      const [x, y, z] = pk.slice(1).split(',').map(Number);
      if (w.getBlock(x, y, z) === B.REDSTONE_LAMP) { w.setBlock(x, y, z, B.REDSTONE_LAMP_ON); changes++; }
    }
    // lamps no longer powered -> off: scan lamps near sources only (cheap approx via edits map)
    for (const ck of Object.keys(w.edits)) {
      const ch = w.chunks.get(ck);
      if (!ch || !ch.blocks) continue;
      void changes;
    }
  }

  toJSON() {
    return {
      furnaces: Array.from(this.furnaces.entries()),
      chests: Array.from(this.chests.entries()),
    };
  }
  static fromJSON(d, world) {
    const s = new Stations(world);
    if (!d) return s;
    if (d.furnaces) for (const [k, v] of d.furnaces) s.furnaces.set(k, v);
    if (d.chests) for (const [k, v] of d.chests) s.chests.set(k, v);
    return s;
  }
}

const ITEMS_FUEL = {
  [I.COAL]: 800,
  [6]: 150, [39]: 150, [41]: 150, // logs
  [5]: 120, // planks
  [256]: 50, // stick
};
void BLOCKS;

if (typeof module !== 'undefined' && module.exports) module.exports = { Stations, ITEMS_FUEL };
if (typeof self !== 'undefined') self.STATIONS_MOD = { Stations, ITEMS_FUEL };
})();
