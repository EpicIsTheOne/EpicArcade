// STARWOVEN — save system (localStorage) with autosave + migration hook
"use strict";

const KEY = 'starwoven_save_v1';

export function freshSave() {
  return {
    ver: 1,
    created: Date.now(),
    seed: (Math.random() * 0xffffffff) >>> 0,
    currencies: { star: 20, mote: 0 },   // star=Starpieces(gacha), mote=upgrade dust
    pity: {},                             // per banner id: {count, guaranteedFeatured}
    history: [],                          // {t, charId, rarity, banner}
    roster: {},                           // id -> {lvl, xp, asc, dupes}
    team: ['orion', null, null],
    owned: ['orion'],                     // starter
    story: { step: 0, flags: {} },
    quests: { active: [], done: [] },
    zones: {},                            // zoneId -> {cleared, chests:{}, beacons:{}}
    settings: { music: 0.65, sfx: 0.85, quality: 'high' },
    seenIntro: false, playMs: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.ver !== 1) return null;
    return s;
  } catch { return null; }
}

let _dirty = false;
export function markDirty() { _dirty = true; }
export function persist(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); _dirty = false; return true; }
  catch { return false; }
}
export function wipeSave() { try { localStorage.removeItem(KEY); } catch {} }
