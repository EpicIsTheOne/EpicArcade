// Persistence: world saves via local HTTP API (server writes saves/*.json),
// settings in localStorage. Deterministic seeds make chunk data rebuildable;
// we persist edits, player, inventory, stations, time.
'use strict';
(function () {
const SAVE_API = '/api/save/';
const SETTINGS_KEY = 'voxelhelm_settings_v1';

const DEFAULT_SETTINGS = {
  renderDistance: 10,
  fov: 75,
  sens: 10,
  invX: false,
  invY: false,
  shadows: 'high',
  post: 'on',
  clouds: 'on',
  fog: 50,
  volume: 60,
  preset: 'ultra',
};

function loadSettings() {
  try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { void e; }
}

async function saveWorld(name, payload) {
  const res = await fetch(SAVE_API + encodeURIComponent(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('save failed ' + res.status);
  return res.json();
}

async function loadWorld(name) {
  const res = await fetch(SAVE_API + encodeURIComponent(name));
  if (!res.ok) return null;
  return res.json();
}

if (typeof module !== 'undefined' && module.exports) module.exports = { saveWorld, loadWorld, loadSettings, saveSettings, SETTINGS_KEY, DEFAULT_SETTINGS };
if (typeof self !== 'undefined') self.PERSIST_MOD = { saveWorld, loadWorld, loadSettings, saveSettings, DEFAULT_SETTINGS };
})();
