// Core constants & tunables
export const CHUNK = 16, HEIGHT = 128, SEA = 40;
export const DAY_LENGTH = 600; // seconds per full cycle
export const GRAVITY = -25, JUMP_V = 8.6;
export const REACH = 5;

export const Settings = {
  renderDist: 7,
  quality: 'high', // low | medium | high | ultra
  fov: 75,
  sens: 1.0,
  invertY: false,
  invertX: false,
  master: 0.8,
  music: 0.5,
  showFps: false,
};
try {
  const s = JSON.parse(localStorage.getItem('vx.settings'));
  if (s) Object.assign(Settings, s);
} catch(e){}
export function saveSettings(){ try{ localStorage.setItem('vx.settings', JSON.stringify(Settings)); }catch(e){} }

export function qualityFlags(){
  const q = Settings.quality;
  return {
    bloom: q !== 'low',
    pixelRatio: q === 'ultra' ? Math.min(devicePixelRatio, 2) : q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1,
    cloudDetail: q === 'ultra' ? 2 : q === 'high' ? 1 : 0,
    aa: q !== 'low' && q !== 'medium',
    fovKick: q !== 'low',
  };
}
