// ============================================================
// NEON MERIDIAN — core/state.js
// Persistent game state + save/load (localStorage slot "nm_save_1")
// ============================================================
'use strict';

const GameState = (() => {
  const SAVE_KEY = 'neon_meridian_save_v1';
  const SETTINGS_KEY = 'neon_meridian_settings_v1';

  function freshState() {
    return {
      version: 1,
      money: 350,
      hp: 100, armor: 0,
      pos: null,                    // [x,y,z] saved on demand
      wanted: 0,
      timeHours: 9.0,               // world clock
      day: 1,
      weapons: { fist: true },      // owned
      ammo: {},                     // id -> rounds
      curWeapon: 'fist',
      missionsDone: [],
      missionStage: {},             // mid-mission progress (simple: restart missions on load)
      packagesFound: [],
      stats: { kills: 0, vehiclesJacked: 0, distanceDriven: 0, busts: 0, deaths: 0, topSpeed: 0, longestJump: 0 },
      bestRaceMs: {},
    };
  }

  function freshSettings() {
    return {
      quality: 'high',            // ultra | high | medium | low | qa
      masterVol: 0.8, musicVol: 0.55, sfxVol: 0.9,
      sens: 1.0,
      invertX: false,             // default OFF
      invertY: false,             // default OFF
      showFps: false,
      minimapZoom: 1.0,
      subtitles: true,
    };
  }

  let current = freshState();
  let settings = freshSettings();

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = Object.assign(freshSettings(), JSON.parse(raw));
    } catch (e) { /* keep defaults */ }
    return settings;
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function save(extra) {
    try {
      const payload = Object.assign({}, current, extra || {});
      payload.savedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) { return false; }
  }
  function loadInto() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return false;
      current = Object.assign(freshState(), data);
      return true;
    } catch (e) { return false; }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  return {
    get state() { return current; },
    get settings() { return settings; },
    freshState, freshSettings,
    loadSettings, saveSettings,
    hasSave, save, loadInto, clearSave,
  };
})();

if (typeof module !== 'undefined') module.exports = { GameState };
