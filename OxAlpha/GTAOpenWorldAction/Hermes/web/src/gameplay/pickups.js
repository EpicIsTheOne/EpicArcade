// CHROME HARBOR — pickups: cash drops, health/armor/ammo respots, gun stores.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const KINDS = {
  cash:   { color: '#57c46a', emissive: '#2ea84e', size: [0.55, 0.22, 0.38], label: 'Cash' },
  health: { color: '#f2f4f7', emissive: '#ff4050', size: [0.5, 0.5, 0.5],    label: 'Health' },
  armor:  { color: '#3fa9ff', emissive: '#2b7fd4', size: [0.52, 0.56, 0.3],  label: 'Armor' },
  ammo:   { color: '#3a3f47', emissive: '#d9a53c', size: [0.5, 0.34, 0.5],   label: 'Ammo' },
};

let PU_ID = 1;
export class Pickup {
  constructor(ctx, kind, x, z, amount, opts = {}) {
    this.ctx = ctx;
    this.id = PU_ID++;
    this.kind = kind;
    this.amount = amount || 0;
    this.temporary = !!opts.temporary;
    this.respawn = opts.respawn ?? 0;
    this.hiddenUntil = 0;
    const k = KINDS[kind];
    const mat = new THREE.MeshStandardMaterial({ color: k.color, emissive: k.emissive, emissiveIntensity: 0.7, roughness: .4 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(...k.size), mat);
    this.mesh.position.set(x, 0.65, z);
    ctx.scene.add(this.mesh);
    this.baseY = 0.65;
    this.dead = false;
  }
  update(dt, t, player) {
    if (this.dead) {
      if (!this.temporary && this.respawn > 0 && performance.now() > this.hiddenUntil) this.revive();
      return;
    }
    this.mesh.rotation.y += dt * 2.2;
    this.mesh.position.y = this.baseY + Math.sin(t * 3 + this.id) * 0.09;
    if (player.dead) return;
    const dx = player.pos.x - this.mesh.position.x, dz = player.pos.z - this.mesh.position.z;
    if (dx * dx + dz * dz < 1.44 && !player.vehicle) {
      this.collect(player);
    }
  }
  revive() { this.dead = false; this.mesh.visible = true; }
  collect(player) {
    switch (this.kind) {
      case 'cash': player.addMoney(this.amount); break;
      case 'health': player.health = Math.min(100, player.health + 50); break;
      case 'armor': player.armor = Math.min(100, player.armor + 50); break;
      case 'ammo': {
        const pool = player.ammoPool ?? (player.ammoPool = {});
        for (const w of ['pistol', 'smg', 'shotgun', 'rifle']) pool[w] = (pool[w] || 0) + 36;
        player.ctx.hud.toastPrompt('+ Ammo');
        break;
      }
    }
    this.ctx.audio?.pickupCoin();
    this.dead = true;
    this.mesh.visible = false;
    this.hiddenUntil = performance.now() + this.respawn * 1000;
    if (this.temporary) this.dispose();
  }
  dispose() {
    this.ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class Pickups {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    const LM = ctx.plan.landmarks;
    // fixed service points
    if (LM.hospital?.spawn) this.add('health', LM.hospital.spawn.x, LM.hospital.spawn.z + 2, 0, { respawn: 40 });
    if (LM.policeHQ?.spawn) this.add('armor', LM.policeHQ.spawn.x - 6, LM.policeHQ.spawn.z + 2, 0, { respawn: 60 });
    if (LM.safehouse) this.add('ammo', LM.safehouse.x + 4, LM.safehouse.z + 14, 0, { respawn: 45 });
    // a few street cash/health crumbs to reward exploring alleys
    const spots = [[16, -34], [-140, 210], [430, -320], [-500, 300], [300, 480], [-260, -420]];
    for (const [sx, sz] of spots) {
      const s = ctx.snapWalkable ? ctx.snapWalkable(sx, sz) : { x: sx, z: sz };
      this.add(Math.random() < 0.6 ? 'cash' : 'health', s.x, s.z, 40 + Math.floor(Math.random() * 90), { respawn: 90 });
    }
  }
  add(kind, x, z, amount, opts) {
    const p = new Pickup(this.ctx, kind, x, z, amount, opts);
    this.list.push(p);
    return p;
  }
  dropCash(x, z, amount) {
    this.list.push(new Pickup(this.ctx, 'cash', x + (Math.random() - .5), z + (Math.random() - .5), amount, { temporary: true }));
  }
  update(dt, t, player) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.update(dt, t, player);
      if (p.dead && p.temporary) {
        p.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}

// ---------------- gun store ----------------
export class GunStore {
  constructor(ctx, x, z, name) {
    this.ctx = ctx;
    this.name = name;
    ctx.interactables.push({
      x, z, r: 3.4,
      prompt: '<b>E</b> — IRON SIGHTS gun store',
      action: () => ctx.menus.openShop(name),
    });
  }
}
