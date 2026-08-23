// Dropped item entities: spinning mini-cubes with pickup magnetization.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { ITEMS, BLOCKS } = __RQ('../shared/blocks.js');

class DropManager {
  constructor(scene) {
    this.scene = scene;
    this.drops = [];
  }

  spawn(id, count, x, y, z, vel) {
    const it = ITEMS[id];
    if (!it) return;
    let mesh;
    if (it.block !== undefined && BLOCKS[it.block]) {
      const def = BLOCKS[it.block];
      const tileName = def.tex.all || def.tex.side || def.tex.top || 'stone';
      const mat = window.__dropMaterialFor(tileName);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mat || new THREE.MeshLambertMaterial({ color: 0xff00ff }));
    } else {
      const col = window.__dropColorFor ? window.__dropColorFor(id) : 0xff00ff;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: col }));
    }
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.drops.push({ id, count, x, y, z, vx: vel ? vel.x : (Math.random() - 0.5) * 1.6, vy: vel ? vel.y : 2.6, vz: vel ? vel.z : (Math.random() - 0.5) * 1.6, mesh, age: 0, pickupDelay: 0.45 });
  }

  update(dt, world, player, opts) {
    opts = opts || {};
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.pickupDelay > 0) d.pickupDelay -= dt;
      // physics
      d.vy -= 22 * dt;
      let nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt;
      const bid = world.getBlock(Math.floor(nx), Math.floor(ny - 0.13), Math.floor(nz));
      const bdef = BLOCKS[bid];
      if (bdef && bdef.solid && d.vy < 0) {
        ny = Math.floor(ny - 0.13) + 1.13;
        d.vy = 0; d.vx *= 0.7; d.vz *= 0.7;
      }
      d.x = nx; d.y = ny; d.z = nz;
      // magnet + pickup
      const dx = player.pos.x - d.x, dy = (player.pos.y + 0.9) - d.y, dz = player.pos.z - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.pickupDelay <= 0 && !player.dead) {
        if (dist < 2.1) {
          d.x += dx / dist * 7 * dt; d.y += dy / dist * 7 * dt; d.z += dz / dist * 7 * dt;
        }
        if (dist < 0.85) {
          const left = opts.onCollect ? opts.onCollect(d.id, d.count) : 0;
          if (left <= 0) {
            this.scene.remove(d.mesh);
            this.drops.splice(i, 1);
            continue;
          } else d.count = left;
        }
      }
      if (d.age > 240) { this.scene.remove(d.mesh); this.drops.splice(i, 1); continue; }
      d.mesh.position.set(d.x, d.y + Math.sin(d.age * 2.4) * 0.055 + 0.16, d.z);
      d.mesh.rotation.y = d.age * 1.7;
    }
  }

  clear() {
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DropManager };
if (typeof self !== 'undefined') self.DROPS_MOD = { DropManager };
})();
