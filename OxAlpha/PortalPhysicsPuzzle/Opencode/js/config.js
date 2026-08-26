export const CFG = {
  GRAVITY: 20,
  JUMP_VEL: 7.0,
  MAX_FALL: -34,

  PLAYER_HALF: { x: 0.32, y: 0.85, z: 0.32 },
  EYE_HEIGHT: 1.52,
  WALK_SPEED: 5.3,
  GROUND_ACCEL: 11,
  AIR_ACCEL: 2.4,
  GROUND_FRICTION: 8.5,
  STEP_HEIGHT: 0.32,

  GRAB_DIST: 2.6,
  HOLD_DIST: 1.75,

  CUBE_SIZE: 0.52,

  PORTAL_REACH: 42,
  PORTAL_W: 1.15,
  PORTAL_H: 1.95,
  RT_SCALE: { ultra: 0.85, high: 0.7, medium: 0.55 },
  MAX_RECURSION_FEEDBACK: true,

  FIXED_DT: 1 / 90,
  MAX_STEPS: 5,
};

export const SETTINGS_KEY = 'threshold.settings.v1';
export const PROGRESS_KEY = 'threshold.progress.v1';

export const settings = {
  invX: false, invY: false, sens: 1.0, fov: 90,
  quality: 'ultra', vol: 0.8,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* fresh */ }
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { unlocked: 0, deaths: 0 };
}
export function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
}

export const QUALITY = {
  ultra: { pixelRatioCap: 2.0, shadows: true, shadowSize: 2048, bloom: true, smaa: true, portalRTScale: 0.85, fogDensityMul: 1 },
  high:  { pixelRatioCap: 1.5, shadows: true, shadowSize: 1536, bloom: true, smaa: false, portalRTScale: 0.7,  fogDensityMul: 1 },
  medium:{ pixelRatioCap: 1.0, shadows: false, shadowSize: 1024, bloom: true, smaa: false, portalRTScale: 0.55, fogDensityMul: 0.8 },
};
