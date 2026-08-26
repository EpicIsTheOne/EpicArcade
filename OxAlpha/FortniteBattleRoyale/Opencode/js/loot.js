import * as THREE from 'three';
import { CFG, RARITY, CONSUMABLES, AMMO_TYPES } from './config.js';
import { S } from './state.js';
import { mulberry32, rand, randInt, pick, weightedPick, clamp } from './utils.js';
import { heightAt, POIS } from './terrain.js';
import { WEAPONS, makeWeaponInstance } from './weapons.js';
import { sfx } from './audio.js';

let sceneRef = null;
const rng = mulberry32(CFG.SEED + 999);
const chestSpots = [];
const ammoBoxSpots = [];
const floorLootSpots = [];

const geoChest = new THREE.BoxGeometry(1.5, 1.0, 1.0);
geoChest.translate(0, 0.5, 0);
const geoAmmo = new THREE.BoxGeometry(0.9, 0.6, 0.6);
geoAmmo.translate(0, 0.3, 0);
const matChest = new THREE.MeshStandardMaterial({ color: 0xe8b23f, roughness: 0.3, metalness: 0.75, emissive: 0x8a6410, emissiveIntensity: 0.5 });
const matAmmo = new THREE.MeshStandardMaterial({ color: 0x4a7d3a, roughness: 0.7 });

export function collectSpawnSpots() {
  for (const poi of POIS) {
    const n = Math.round(poi.r / 9);
    for (let i = 0; i < n; i++) {
      const x = poi.x + rand(rng, -poi.r * 0.85, poi.r * 0.85);
      const z = poi.z + rand(rng, -poi.r * 0.85, poi.r * 0.85);
      const h = heightAt(x, z);
      if (h < 2) continue;
      if (rng() < 0.62) chestSpots.push({ x, y: h, z });
      else floorLootSpots.push({ x: x + 3, y: h, z: z + 3 });
    }
    for (let i = 0; i < Math.max(2, Math.round(n / 3)); i++) {
      const x = poi.x + rand(rng, -poi.r * 0.8, poi.r * 0.8);
      const z = poi.z + rand(rng, -poi.r * 0.8, poi.r * 0.8);
      const h = heightAt(x, z);
      if (h > 2) ammoBoxSpots.push({ x, y: h, z });
    }
  }
  for (let i = 0; i < 90; i++) {
    const ang = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * CFG.ISLAND_R * 0.95;
    const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
    const h = heightAt(x, z);
    if (h > 2.2) floorLootSpots.push({ x, y: h, z });
  }
  return { chestSpots, ammoBoxSpots, floorLootSpots };
}

export function spawnAllLoot(scene) {
  sceneRef = scene;
  for (const s of chestSpots) spawnChest(s);
  for (const s of ammoBoxSpots) spawnAmmoBox(s);
  for (const s of floorLootSpots) {
    spawnFloorItem(makeRandomItem(rng), s);
  }
}

export function makeRandomItem(rnd, rarityBias = 0) {
  const roll = rnd();
  if (roll < 0.52) {
    const defId = weightedPick(rnd, [
      { v: 'ar', w: 30 }, { v: 'smg', w: 26 }, { v: 'shotgun', w: 24 }, { v: 'sniper', w: 12 }, { v: 'rocket', w: 8 },
    ]);
    const rIdx = rollRarity(rnd, rarityBias);
    return { cat: 'weapon', ...makeWeaponInstance(defId, rIdx) };
  } else if (roll < 0.72) {
    const id = pick(rnd, Object.keys(CONSUMABLES));
    return { cat: 'consumable', id, count: randInt(rnd, 1, CONSUMABLES[id].stack > 4 ? 3 : 1) };
  } else if (roll < 0.92) {
    const t = pick(rnd, ['light', 'medium', 'medium', 'heavy', 'shells']);
    return { cat: 'ammo', type: t, amount: t === 'light' ? 24 : t === 'medium' ? 20 : t === 'heavy' ? 6 : 8 };
  } else {
    return { cat: 'mats', type: pick(rnd, ['wood', 'brick', 'metal']), amount: 30 };
  }
}

function rollRarity(rnd, bias = 0) {
  const r = rnd() + bias * 0.12;
  if (r > 0.96) return 4;
  if (r > 0.86) return 3;
  if (r > 0.68) return 2;
  if (r > 0.42) return 1;
  return 0;
}

export function spawnChest(spot) {
  const mesh = new THREE.Mesh(geoChest, matChest);
  mesh.position.set(spot.x, spot.y, spot.z);
  mesh.rotation.y = rng() * Math.PI * 2;
  mesh.castShadow = true;
  sceneRef.add(mesh);
  const glow = new THREE.PointLight(0xffc84d, 6, 9);
  glow.position.set(spot.x, spot.y + 1.4, spot.z);
  sceneRef.add(glow);
  const chest = {
    kind: 'chest', mesh, glow, pos: new THREE.Vector3(spot.x, spot.y, spot.z),
    opened: false,
  };
  S.chests.push(chest);
  return chest;
}

export function openChest(chest) {
  if (chest.opened) return false;
  chest.opened = true;
  sceneRef.remove(chest.mesh);
  sceneRef.remove(chest.glow);
  const idx = S.chests.indexOf(chest);
  if (idx >= 0) S.chests.splice(idx, 1);
  sfx.chestOpen();
  const n = 3;
  for (let i = 0; i < n; i++) {
    const item = makeRandomItem(rng, 1.4);
    const ang = (i / n) * Math.PI * 2 + rng();
    spawnWorldItem(item, chest.pos.x + Math.cos(ang) * 1.3, chest.pos.y, chest.pos.z + Math.sin(ang) * 1.3);
  }
  return true;
}

export function spawnAmmoBox(spot) {
  const mesh = new THREE.Mesh(geoAmmo, matAmmo);
  mesh.position.set(spot.x, spot.y, spot.z);
  mesh.castShadow = true;
  sceneRef.add(mesh);
  const box = { kind: 'ammobox', mesh, pos: new THREE.Vector3(spot.x, spot.y, spot.z), opened: false };
  S.ammoBoxes.push(box);
}

export function openAmmoBox(box) {
  if (box.opened) return false;
  box.opened = true;
  sceneRef.remove(box.mesh);
  const idx = S.ammoBoxes.indexOf(box);
  if (idx >= 0) S.ammoBoxes.splice(idx, 1);
  sfx.pickup();
  const types = ['light', 'medium', 'heavy', 'shells'];
  for (const t of types) {
    spawnWorldItem({ cat: 'ammo', type: t, amount: t === 'light' ? 18 : t === 'medium' ? 15 : t === 'heavy' ? 5 : 6 },
      box.pos.x + rand(rng, -1, 1), box.pos.y, box.pos.z + rand(rng, -1, 1));
  }
  return true;
}

export function spawnFloorItem(item, spot) {
  spawnWorldItem(item, spot.x, spot.y, spot.z);
}

const weaponGeoCache = new Map();
function weaponMeshFor(item) {
  const colorHex = RARITY[item.rarity || 0].color;
  const key = (item.defId || item.cat) + colorHex;
  if (!weaponGeoCache.has(key)) {
    const g = new THREE.BoxGeometry(0.9, 0.22, 0.14);
    g.translate(0, 0.35, 0);
    weaponGeoCache.set(key, g);
  }
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), emissive: new THREE.Color(colorHex).multiplyScalar(0.25), roughness: 0.4 });
  return new THREE.Mesh(weaponGeoCache.get(key), mat);
}

function consumableMeshFor(item) {
  const def = CONSUMABLES[item.id];
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color), emissive: new THREE.Color(def.color).multiplyScalar(0.3), roughness: 0.4 });
  const g = item.id.includes('Shield') ? new THREE.SphereGeometry(0.22, 10, 8) : new THREE.BoxGeometry(0.32, 0.22, 0.32);
  g.translate(0, 0.35, 0);
  return new THREE.Mesh(g, mat);
}

export function spawnWorldItem(item, x, y, z) {
  let mesh;
  if (item.cat === 'weapon') mesh = weaponMeshFor(item);
  else if (item.cat === 'consumable') mesh = consumableMeshFor(item);
  else {
    const col = item.cat === 'ammo' ? 0xd8c078 : item.type === 'wood' ? 0xa97b50 : item.type === 'brick' ? 0xb06a55 : 0x93a1ad;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.2), roughness: 0.6 });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), mat);
    mesh.geometry.translate(0, 0.35, 0);
  }
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  sceneRef.add(mesh);

  const beamH = 2.6;
  const beamGeo = new THREE.CylinderGeometry(0.16, 0.16, beamH, 6, 1, true);
  beamGeo.translate(0, beamH / 2, 0);
  const beamCol = item.cat === 'weapon' ? new THREE.Color(RARITY[item.rarity || 0].color) : item.cat === 'consumable' ? new THREE.Color(CONSUMABLES[item.id].color) : new THREE.Color(0x9fd8ff);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: beamCol, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  beam.position.set(x, y, z);
  sceneRef.add(beam);

  const entry = {
    kind: 'item', item, mesh, beam,
    pos: new THREE.Vector3(x, y, z),
    bobPhase: rng() * Math.PI * 2,
    taken: false,
  };
  S.lootItems.push(entry);
  return entry;
}

export function dropWeaponFromPlayer(player, slotIdx) {
  const item = player.slots[slotIdx];
  if (!item || item.cat !== 'weapon') return;
  player.slots[slotIdx] = null;
  const behind = player.flatForward().multiplyScalar(-2);
  const x = player.pos.x + behind.x, z = player.pos.z + behind.z;
  spawnWorldItem(item, x, groundAtSafe(x, z), z);
  S.emit('inventoryChanged');
}
function groundAtSafe(x, z) {
  const h = heightAt(x, z);
  return Math.max(h, CFG.WATER_Y);
}

export function nearestInteractable(pos, maxDist = 2.6) {
  let best = null, bestD = maxDist;
  for (const c of S.chests) {
    const d = c.pos.distanceTo(pos);
    if (d < bestD) { bestD = d; best = { type: 'chest', obj: c, label: 'Open Chest' }; }
  }
  for (const b of S.ammoBoxes) {
    const d = b.pos.distanceTo(pos);
    if (d < bestD) { bestD = d; best = { type: 'ammobox', obj: b, label: 'Open Ammo Box' }; }
  }
  for (const li of S.lootItems) {
    if (li.taken) continue;
    const d = li.pos.distanceTo(pos);
    if (d < bestD && Math.abs(li.pos.y - pos.y) < 2.5) {
      bestD = d;
      best = { type: 'item', obj: li, label: itemName(li.item) };
    }
  }
  return best;
}

export function itemName(item) {
  if (item.cat === 'weapon') return WEAPONS[item.defId].name;
  if (item.cat === 'consumable') return CONSUMABLES[item.id].name + (item.count > 1 ? ` x${item.count}` : '');
  if (item.cat === 'ammo') return `${cap(item.type)} Ammo x${item.amount}`;
  if (item.cat === 'mats') return `${cap(item.type)} x${item.amount}`;
  return 'Item';
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }

export function pickupItem(player, entry) {
  const item = entry.item;
  let msg = null;
  if (item.cat === 'weapon') {
    let slot = player.slots.findIndex((s, i) => i > 0 && !s);
    if (slot === -1) slot = player.sel > 0 ? player.sel : 1;
    if (player.slots[slot]) {
      dropWeaponFromPlayer(player, slot);
    }
    player.slots[slot] = { ...item };
    msg = WEAPONS[item.defId].name;
    if (player.sel === 0 || !player.activeWeaponDef) selectSlot(player, slot);
  } else if (item.cat === 'consumable') {
    const existing = player.slots.find(s => s && s.cat === 'consumable' && s.id === item.id);
    if (existing) {
      existing.count = Math.min(existing.count + item.count, CONSUMABLES[item.id].stack);
    } else {
      let slot = player.slots.findIndex((s, i) => i > 0 && !s);
      if (slot === -1) { return { ok: false, full: true }; }
      player.slots[slot] = { ...item };
    }
    msg = CONSUMABLES[item.id].name;
  } else if (item.cat === 'ammo') {
    player.ammo[item.type] = Math.min((player.ammo[item.type] || 0) + item.amount, 400);
    msg = `${cap(item.type)} Ammo +${item.amount}`;
  } else if (item.cat === 'mats') {
    player.mats[item.type] = Math.min(player.mats[item.type] + item.amount, CFG.MAT_CAP);
    msg = `${cap(item.type)} +${item.amount}`;
    S.emit('mats');
  }
  removeWorldItem(entry);
  sfx.pickup();
  if (msg) S.emit('toast', { text: '+ ' + msg });
  S.emit('inventoryChanged');
  S.emit('ammoChanged');
  return { ok: true };
}

export function removeWorldItem(entry) {
  entry.taken = true;
  sceneRef.remove(entry.mesh);
  sceneRef.remove(entry.beam);
  const idx = S.lootItems.indexOf(entry);
  if (idx >= 0) S.lootItems.splice(idx, 1);
}

export function selectSlot(player, idx) {
  if (idx < 0 || idx > 5) return;
  player.sel = idx;
  player.reloading = false;
  player.ads = false;
  S.emit('slotChanged');
}

export function updateLoot(dt, t) {
  for (const li of S.lootItems) {
    li.mesh.position.y = li.pos.y + 0.12 + Math.sin(t * 2.2 + li.bobPhase) * 0.09;
    li.mesh.rotation.y += dt * 1.4;
  }
}

export function botDropCache(bot) {
  const x = bot.pos.x, z = bot.pos.z, y = Math.max(heightAt(x, z), 0);
  const item = makeRandomItem(rng, 0.6);
  if (item.cat === 'weapon' || item.cat === 'consumable') spawnWorldItem(item, x + rand(rng, -1, 1), y, z + rand(rng, -1, 1));
  spawnWorldItem({ cat: 'ammo', type: pick(rng, AMMO_TYPES.slice(0, 4)), amount: 14 }, x + rand(rng, -1.5, 1.5), y, z + rand(rng, -1.5, 1.5));
}
