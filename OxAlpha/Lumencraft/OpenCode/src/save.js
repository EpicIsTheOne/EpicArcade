// Save/load: localStorage slots storing seed + block edits + containers + player.
import { CHUNK, HEIGHT } from './config.js';

const KEY_PREFIX = 'lumencraft_world_v1_';
export const SLOT_COUNT = 3;

function slotKey(slot) { return KEY_PREFIX + slot; }

export function slotInfo(slot) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      seed: d.meta.seed,
      savedAt: d.meta.savedAt,
      time: d.meta.time,
      playTime: d.meta.playTime || 0,
      pos: d.player ? [d.player.x | 0, d.player.y | 0, d.player.z | 0] : null,
    };
  } catch { return null; }
}

export function hasAnySave() {
  for (let i = 0; i < SLOT_COUNT; i++) if (slotInfo(i)) return true;
  return false;
}

export function saveWorld(slot, game) {
  const w = game.world;
  const p = game.player;
  const edits = {};
  for (const [k, m] of w.edits) {
    const arr = new Array(m.size * 2);
    let i = 0;
    for (const [idx, v] of m) { arr[i++] = idx; arr[i++] = v; }
    edits[k] = arr;
  }
  const containers = {};
  for (const [k, c] of w.containers) {
    containers[k] = { type: c.type, slots: c.slots, burnLeft: c.burnLeft, burnMax: c.burnMax, progress: c.progress };
  }

  const data = {
    meta: {
      seed: w.seedStr,
      savedAt: Date.now(),
      time: game.timeOfDay,
      playTime: game.playTime,
      weather: { rain: game.rainF, coverage: game.weatherCoverage, thunderT: game.thunderT },
    },
    player: {
      x: p.pos.x, y: p.pos.y, z: p.pos.z,
      yaw: p.yaw, pitch: p.pitch,
      hp: p.hp, hunger: p.hunger,
      spawn: p.spawnPoint,
      inv: game.inventory.slots.map(s => s ? [s.id, s.count, s.dur ?? -1] : null),
      sel: game.inventory.selected,
    },
    edits,
    containers,
  };

  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export function loadWorld(slot) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function deleteSlot(slot) {
  try { localStorage.removeItem(slotKey(slot)); } catch {}
}
