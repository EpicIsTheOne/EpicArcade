import { SETTINGS_KEY, STORAGE_KEY } from "./constants.js";

const defaultProgress = {
  bestProgress: 0,
  bestProgressBeat: 0,
  bestTimeMs: null,
  attempts: 0,
  deaths: 0,
  completes: 0,
  practiceBest: {},
  collectibles: [],
  updatedAt: null
};

const defaultSettings = {
  volume: 0.78,
  muted: false,
  reducedMotion: false,
  highContrast: false,
  showTouchControls: false
};

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function loadProgress() {
  return readJson(STORAGE_KEY, defaultProgress);
}

export function saveProgress(progress) {
  const merged = { ...loadProgress(), ...progress, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    return merged;
  }
  return merged;
}

export function loadSettings() {
  return readJson(SETTINGS_KEY, defaultSettings);
}

export function saveSettings(settings) {
  const merged = { ...loadSettings(), ...settings };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    return merged;
  }
  return merged;
}

export function resetProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  return loadProgress();
}
