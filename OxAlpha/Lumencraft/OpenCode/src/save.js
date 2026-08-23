// Save/load: localStorage worlds keyed by stable id, storing seed + block edits
// + containers + player + display metadata (name, thumbnail) for the world browser.
import { CHUNK, HEIGHT } from './config.js';

const KEY_PREFIX = 'lumencraft_world_v1_';

function keyOf(id) { return KEY_PREFIX + id; }

export function newWorldId() {
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function displayName(id, meta) {
  if (meta?.name) return meta.name;
  if (/^[0-2]$/.test(id)) return 'World ' + (+id + 1);
  return meta?.seed ? `World (${meta.seed})` : 'Unnamed World';
}

export function listWorlds() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const id = k.slice(KEY_PREFIX.length);
      let d = null;
      try { d = JSON.parse(localStorage.getItem(k)); } catch {}
      if (!d?.meta) continue;
      out.push({
        id,
        name: displayName(id, d.meta),
        seed: d.meta.seed,
        savedAt: d.meta.savedAt,
        time: d.meta.time,
        playTime: d.meta.playTime || 0,
        size: localStorage.getItem(k).length,
        pos: d.player ? [d.player.x | 0, d.player.y | 0, d.player.z | 0] : null,
        thumb: d.meta.thumb || null,
      });
    }
  } catch {}
  out.sort((a, b) => b.savedAt - a.savedAt);
  return out;
}

export function hasAnySave() { return listWorlds().length > 0; }

export function saveWorld(id, game, thumbDataUrl) {
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

  // keep prior name/thumb unless fresh ones are supplied
  let prevMeta = null;
  try {
    const raw = localStorage.getItem(keyOf(id));
    if (raw) prevMeta = JSON.parse(raw).meta;
  } catch {}

  const data = {
    meta: {
      seed: w.seedStr,
      name: game.worldName ?? prevMeta?.name ?? undefined,
      savedAt: Date.now(),
      thumb: thumbDataUrl ?? prevMeta?.thumb ?? undefined,
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
  if (data.meta.name === undefined) delete data.meta.name;
  if (data.meta.thumb === undefined) delete data.meta.thumb;

  try {
    localStorage.setItem(keyOf(id), JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export function loadWorld(id) {
  try {
    const raw = localStorage.getItem(keyOf(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function deleteWorld(id) {
  try { localStorage.removeItem(keyOf(id)); } catch {}
}
