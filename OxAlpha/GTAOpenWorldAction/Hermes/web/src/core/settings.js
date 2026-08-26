// CHROME HARBOR — graphics/gameplay settings + persistence
import { el } from './util.js';

export const PRESETS = {
  qa:     { label: 'QA (software render)', pixelRatio: 0.75, shadows: false, shadowRes: 512, bloom: false, msaa: 0, rain: 0.25,
            fogFar: 620, popScale: 0.45, waterQ: 0, particles: 0.4, grade: true },
  low:    { label: 'Low',      pixelRatio: 1.0,  shadows: true, shadowRes: 1024, bloom: false, msaa: 0, rain: 0.5,
            fogFar: 750, popScale: 0.7,  waterQ: 0, particles: 0.7, grade: true },
  medium: { label: 'Medium',   pixelRatio: 1.0,  shadows: true, shadowRes: 1536, bloom: true, msaa: 0, rain: 0.8,
            fogFar: 950, popScale: 0.85, waterQ: 1, particles: 1.0, grade: true },
  high:   { label: 'High',     pixelRatio: 1.5,  shadows: true, shadowRes: 2048, bloom: true, msaa: 2, rain: 1.0,
            fogFar: 1150, popScale: 1.0, waterQ: 1, particles: 1.0, grade: true },
  ultra:  { label: 'Ultra',    pixelRatio: 2.0,  shadows: true, shadowRes: 4096, bloom: true, msaa: 4, rain: 1.0,
            fogFar: 1400, popScale: 1.15, waterQ: 2, particles: 1.3, grade: true },
};

export function detectDefaultPreset() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'qa';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    const s = String(r).toLowerCase();
    if (s.includes('swiftshader') || s.includes('llvmpipe') || s.includes('software') || s.includes('basic render')) return 'qa';
    return 'high';
  } catch { return 'medium'; }
}

const KEY = 'ch_settings_v1';

const defaults = () => ({
  preset: detectDefaultPreset(),
  invertY: false,          // OFF by default per spec
  sensitivity: 1.0,
  fov: 66,
  volMaster: 0.8, volMusic: 0.5, volSfx: 0.9,
  showFps: false,
  dayLengthMin: 10,        // real minutes per full day
  timeMode: 'dynamic',     // dynamic | noon | night | sunset
});

let state = defaults();

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...defaults(), ...JSON.parse(raw) };
    if (!PRESETS[state.preset]) state.preset = detectDefaultPreset();
  } catch { /* private mode etc */ }
  return state;
}
export function getSettings() { return state; }
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function presetOf(s = state) { return PRESETS[s.preset] || PRESETS.medium; }

// ---- savegame ----
const SKEY = 'ch_save_v1';
export function loadSave() {
  try { const raw = localStorage.getItem(SKEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
export function writeSave(data) { try { localStorage.setItem(SKEY, JSON.stringify(data)); return true; } catch { return false; } }
export function clearSave() { try { localStorage.removeItem(SKEY); } catch {} }

export function applyFpsCounter(show) {
  el('fps-counter').classList.toggle('hidden', !show);
}
