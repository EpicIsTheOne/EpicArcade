export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 52;
export const DAY_LENGTH = 600;      // seconds for full day+night cycle
export const GRAVITY = -24;

export const idx = (x, y, z) => (y << 8) | (z << 4) | x;

const SET_KEY = 'lumencraft_settings_v1';

export const defaultSettings = {
  quality: 'high',
  renderDistance: 10,
  fov: 75,
  sensitivity: 100,
  resScale: 100,
  shadows: true,
  bloom: true,
  fancyWater: true,
  clouds: true,
  invertX: false,
  invertY: false,
  volume: 60,
  music: 60,
};

const PRESETS = {
  low:    { renderDistance: 6,  shadows: false, bloom: false, fancyWater: false, clouds: true,  resScale: 75 },
  medium: { renderDistance: 8,  shadows: true,  bloom: true,  fancyWater: false, clouds: true,  resScale: 85 },
  high:   { renderDistance: 10, shadows: true,  bloom: true,  fancyWater: true,  clouds: true,  resScale: 100 },
  ultra:  { renderDistance: 14, shadows: true,  bloom: true,  fancyWater: true,  clouds: true,  resScale: 125 },
};

export function loadSettings() {
  let s = { ...defaultSettings };
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch {}
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch {}
}

export function applyPreset(s, preset) {
  return { ...s, ...PRESETS[preset], quality: preset };
}
