// ISLEBREAK loot: chests (glow + open animation), floor spawns, rarity rolls,
// inventory model shared by player and bots.
import * as THREE from 'three';
import { WEAPONS, HEALS, RARITY_COLORS } from './weapons.js';
import { Rng } from './rng.js';

export const AMMO_TYPES = ['medium', 'light', 'shells', 'heavy', 'rockets'];
export const AMMO_COLORS = { medium: 0xffc857, light: 0xa0e0a8, shells: 0xff9a5a, heavy: 0x8fb8ff, rockets: 0xff6a6a };

export class Inventory {
  constructor() {
    this.slots = [null, null, null, null, null]; // 5 slots: weapons/heals
    this.sel = 0;
    this.ammo = { medium: 0, light: 0, shells: 0, heavy: 0, rockets: 0 };
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.pickaxeTier = 1;
  }
  addWeapon(id, rarityBonus = 0) {
    const def = WEAPONS[id];
    const item = { kind: 'weapon', id, rarity: Math.min(5, def.rarity + rarityBonus), ammoInMag: def.mag };
    // find empty slot, prefer not overwriting
    let idx = this.slots.findIndex(s => !s);
    if (idx === -1) idx = this.sel; // replace current
    this.slots[idx] = item;
    return item;
  }
  addHeal(id, count = 1) {
    const def = HEALS[id];
    // stack into existing
    for (const s of this.slots) {
      if (s && s.kind === 'heal' && s.id === id && s.count < def.stack) {
        const take = Math.min(count, def.stack - s.count);
        s.count += take; count -= take;
        if (count <= 0) return true;
      }
    }
    while (count > 0) {
      let idx = this.slots.findIndex(s => !s);
      if (idx === -1) return false;
      const take = Math.min(count, def.stack);
      this.slots[idx] = { kind: 'heal', id, count: take };
      count -= take;
    }
    return true;
  }
  addAmmo(type, n) { this.ammo[type] = Math.min(999, (this.ammo[type] || 0) + n); }
  addMat(type, n) { this.mats[type] = Math.min(999, this.mats[type] + n); }
  current() { return this.slots[this.sel]; }
  weaponDef() {
    const s = this.current();
    if (!s || s.kind !== 'weapon') return null;
    return WEAPONS[s.id];
  }
  serialize() { return { slots: this.slots, sel: this.sel, ammo: { ...this.ammo }, mats: { ...this.mats } }; }
}

// ---------------- Loot spawner ----------------
export class LootSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.chests = [];       // {mesh, lid, pos, opened, loot}
    this.drops = [];        // floating pickups {mesh, item, pos, taken}
    this.dropGroup = new THREE.Group();
    scene.add(this.dropGroup);
  }

  static rollWeapon(rng, luckTier = 0) {
    // luckTier 0 normal, +1 = better odds (chests, supply drops)
    const ids = Object.keys(WEAPONS);
    const weights = ids.map(id => {
      const r = WEAPONS[id].rarity;
      return [1, 30, 26, 20, 12 + luckTier * 6, 4 + luckTier * 5][r];
    });
    let sum = 0; for (const w of weights) sum += w;
    let roll = rng.next() * sum;
    for (let i = 0; i < ids.length; i++) { roll -= weights[i]; if (roll <= 0) return ids[i]; }
    return ids[0];
  }

  spawnChests(chestSpots) {
    const bodyGeo = new THREE.BoxGeometry(1.1, 0.7, 0.75);
    const lidGeo = new THREE.BoxGeometry(1.14, 0.3, 0.79);
    const bandGeo = new THREE.BoxGeometry(1.16, 0.12, 0.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.8 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.3, metalness: 0.7, emissive: 0x8a6a10, emissiveIntensity: 0.4 });
    for (const spot of chestSpots) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.35; body.castShadow = true;
      const lid = new THREE.Mesh(lidGeo, bodyMat); lid.position.set(0, 0.78, 0); lid.castShadow = true;
      const band = new THREE.Mesh(bandGeo, bandMat); band.position.set(0, 0.5, 0);
      g.add(body, lid, band);
      g.position.set(spot.x, spot.y - 0.35, spot.z);
      g.rotation.y = this.rng.range(0, Math.PI * 2);
      this.scene.add(g);
      const chest = { group: g, lid, pos: new THREE.Vector3(spot.x, spot.y, spot.z), opened: false };
      this.chests.push(chest);
    }
  }

  openChest(chest, inventory) {
    if (chest.opened) return [];
    chest.opened = true;
    chest.lid.rotation.x = -1.9;
    const loot = [];
    const w = LootSystem.rollWeapon(this.rng, 1);
    loot.push({ kind: 'weapon', id: w });
    const healIds = Object.keys(HEALS);
    loot.push({ kind: 'heal', id: this.rng.pick(healIds), count: this.rng.int(2, 3) });
    loot.push({ kind: 'ammo', type: WEAPONS[w].ammo, n: this.rng.pick([20, 30, 40]) });
    loot.push({ kind: 'mat', type: this.rng.pick(['wood', 'brick', 'metal']), n: 30 });
    // spawn as floating pickups around chest
    loot.forEach((item, i) => this.spawnDrop(chest.pos.x + (i - 1.5) * 0.9, chest.pos.y + 0.5, chest.pos.z + 0.6, item));
    return loot;
  }

  spawnDrop(x, y, z, item) {
    let color, geo;
    if (item.kind === 'weapon') {
      color = new THREE.Color(RARITY_COLORS[WEAPONS[item.id].rarity]).getHex();
      geo = new THREE.BoxGeometry(0.9, 0.16, 0.14);
    } else if (item.kind === 'heal') {
      color = item.id.startsWith('shield') ? 0x59c8ff : 0x7dff9a;
      geo = new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10);
    } else if (item.kind === 'ammo') {
      color = AMMO_COLORS[item.type];
      geo = new THREE.BoxGeometry(0.3, 0.24, 0.3);
    } else {
      color = item.type === 'wood' ? 0xa87848 : item.type === 'brick' ? 0xb4b0a6 : 0xb8c2cc;
      geo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4,
    }));
    mesh.position.set(x, y, z);
    this.dropGroup.add(mesh);
    this.drops.push({ mesh, item, baseY: y, t: Math.random() * 10, taken: false });
  }

  // floor loot at world spots
  spawnFloorLoot(spots) {
    for (const s of spots) {
      const roll = this.rng.next();
      if (roll < 0.45) this.spawnDrop(s.x, s.y, s.z, { kind: 'weapon', id: LootSystem.rollWeapon(this.rng, 0) });
      else if (roll < 0.7) this.spawnDrop(s.x, s.y, s.z, { kind: 'ammo', type: this.rng.pick(AMMO_TYPES), n: this.rng.pick([12, 18, 24]) });
      else if (roll < 0.9) this.spawnDrop(s.x, s.y, s.z, { kind: 'heal', id: this.rng.pick(Object.keys(HEALS)), count: 1 });
      else this.spawnDrop(s.x, s.y, s.z, { kind: 'mat', type: this.rng.pick(['wood', 'brick', 'metal']), n: 30 });
    }
  }

  // nearest interactable within radius; used for E prompt
  nearestChest(pos, radius) {
    let best = null, bd = radius * radius;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = c.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  nearestDrop(pos, radius) {
    let best = null, bd = radius * radius;
    for (const d of this.drops) {
      if (d.taken) continue;
      const dd = d.mesh.position.distanceToSquared(pos);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  takeDrop(drop) {
    drop.taken = true;
    this.dropGroup.remove(drop.mesh);
    const i = this.drops.indexOf(drop);
    if (i >= 0) this.drops.splice(i, 1);
  }

  tick(t) {
    for (const d of this.drops) {
      d.t += 0.016;
      d.mesh.position.y = d.baseY + Math.sin(d.t * 2.2) * 0.09;
      d.mesh.rotation.y += 0.02;
    }
  }

  clear() {
    for (const c of this.chests) this.scene.remove(c.group);
    for (const d of this.drops) this.dropGroup.remove(d.mesh);
    this.chests.length = 0;
    this.drops.length = 0;
  }
}
