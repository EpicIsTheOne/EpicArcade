// shared materials + generated canvas textures
import * as THREE from 'three';
import { mulberry32 } from './utils.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(canvas, repX = 1, repY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- facade textures (color + matching emissive for lit windows) ----
const FACADE_STYLES = [
  { wall: '#3d4668', win: '#ffd9a0', litP: 0.5 },   // glass office
  { wall: '#7a4a3a', win: '#ffe9c9', litP: 0.35 },  // brick old town
  { wall: '#4a5568', win: '#bfe9ff', litP: 0.4 },
  { wall: '#5c6e58', win: '#fff3c4', litP: 0.3 },
];

export function facadeTextures(styleIdx, seed) {
  const s = FACADE_STYLES[styleIdx % FACADE_STYLES.length];
  const rng = mulberry32(seed);
  const W = 128, H = 256;
  const [c1, x1] = cv(W, H), [c2, x2] = cv(W, H);
  x1.fillStyle = s.wall; x1.fillRect(0, 0, W, H);
  // subtle panel lines
  x1.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 16) x1.fillRect(0, y, W, 1);
  x2.fillStyle = '#000'; x2.fillRect(0, 0, W, H);
  const cols = 4, rows = 10;
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const wx = col * cw + cw * 0.22, wy = r * ch + ch * 0.25;
      const ww = cw * 0.56, wh = ch * 0.42;
      x1.fillStyle = 'rgba(10,14,26,0.85)';
      x1.fillRect(wx, wy, ww, wh);
      if (rng() < s.litP) {
        const warm = rng();
        x2.fillStyle = warm > 0.75 ? '#bfe9ff' : s.win;
        x2.globalAlpha = 0.65 + rng() * 0.35;
        x2.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        x2.globalAlpha = 1;
      }
    }
  }
  return { map: tex(c1), emissive: tex(c2) };
}

// ---- billboards / murals ----
const ADS = [
  ['#ff4f81', '#2b1030', 'SUNSET', 'COLA'],
  ['#35e0d2', '#082a33', 'HYPER', 'LINE ⚡'],
  ['#ffc93c', '#33200a', 'NOODLE', '24 HOURS'],
  ['#8a5cff', '#160a33', 'VOLT', 'ENERGY'],
  ['#7dffa8', '#0a2a18', 'RAIL', 'RUNNERS'],
];

export function billboardTexture(i) {
  const [c, x] = cv(256, 128);
  const ad = ADS[i % ADS.length];
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, ad[1]); g.addColorStop(1, '#0d0620');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = ad[0]; x.lineWidth = 8; x.strokeRect(6, 6, 244, 116);
  x.fillStyle = ad[0];
  x.font = '900 44px "Segoe UI", sans-serif'; x.textAlign = 'center';
  x.fillText(ad[2], 128, 58);
  x.font = '800 30px "Segoe UI", sans-serif';
  x.fillText(ad[3], 128, 98);
  return tex(c);
}

export function muralTexture(seed) {
  const rng = mulberry32(seed);
  const [c, x] = cv(256, 128);
  x.fillStyle = '#4a3a55'; x.fillRect(0, 0, 256, 128);
  const hues = [340, 170, 45, 265];
  for (let i = 0; i < 7; i++) {
    x.fillStyle = `hsl(${hues[(rng() * 4) | 0]} ${60 + rng() * 25}% ${45 + rng() * 20}%)`;
    x.beginPath();
    x.ellipse(rng() * 256, rng() * 128, 12 + rng() * 46, 10 + rng() * 34, rng() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#f5efe6';
  x.font = `italic 900 ${20 + rng() * 14}px "Segoe UI"`;
  x.save(); x.translate(40 + rng() * 100, 70); x.rotate((rng() - 0.5) * 0.3);
  x.fillText(['ZIP!', 'GO!', 'FLOW', 'WILD'][i0(rng)], 0, 0); x.restore();
  function i0(r) { return (r() * 4) | 0; }
  return tex(c);
}

// ---- signs / hazard ----
export function hazardTexture() {
  const [c, x] = cv(128, 64);
  x.fillStyle = '#e8b23a'; x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#222';
  for (let i = -64; i < 128; i += 32) {
    x.beginPath();
    x.moveTo(i, 64); x.lineTo(i + 16, 64); x.lineTo(i + 80, 0); x.lineTo(i + 64, 0);
    x.closePath(); x.fill();
  }
  return tex(c, 2, 1);
}

export function signTexture(text, bg = '#123', fg = '#ffd36b') {
  const [c, x] = cv(256, 96);
  x.fillStyle = bg; x.beginPath(); x.roundRect ? x.roundRect(0, 0, 256, 96, 14) : x.rect(0, 0, 256, 96); x.fill();
  x.strokeStyle = fg; x.lineWidth = 5;
  x.beginPath(); x.roundRect ? x.roundRect(6, 6, 244, 84, 11) : x.strokeRect(6, 6, 244, 84); x.stroke();
  x.fillStyle = fg; x.font = '900 44px "Segoe UI"'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 52);
  return tex(c);
}

// station name boards
export function stationSign(name) {
  const [c, x] = cv(512, 128);
  x.fillStyle = '#10182e'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#35e0d2'; x.fillRect(0, 0, 512, 10); x.fillRect(0, 118, 512, 10);
  x.font = '900 64px "Segoe UI"'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#f5efe6'; x.fillText(name, 256, 68);
  return tex(c);
}
export const STATION_NAMES = ['SUNSET PK', 'OLD DOCKS', 'IRONYARD', 'GARDEN GATE'];

// ---- shared geometry/material cache ----
const mats = {};
export function M(key) {
  if (mats[key]) return mats[key];
  const P = 0x000000;
  let m;
  switch (key) {
    case 'deck': m = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 0.94 }); break;
    case 'deckEdge': m = new THREE.MeshStandardMaterial({ color: 0x56505c, roughness: 0.9 }); break;
    case 'gravel': m = new THREE.MeshStandardMaterial({ color: 0x6f665a, roughness: 1 }); break;
    case 'rail': m = new THREE.MeshStandardMaterial({ color: 0xcfd6e2, roughness: 0.28, metalness: 0.85 }); break;
    case 'sleeper': m = new THREE.MeshStandardMaterial({ color: 0x5d4a38, roughness: 0.95 }); break;
    case 'pillar': m = new THREE.MeshStandardMaterial({ color: 0x6a6474, roughness: 0.85 }); break;
    case 'steel': m = new THREE.MeshStandardMaterial({ color: 0x8b93a5, roughness: 0.45, metalness: 0.7 }); break;
    case 'rust': m = new THREE.MeshStandardMaterial({ color: 0x9a5a3a, roughness: 0.9, metalness: 0.2 }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }); break;
    case 'barrierLow': m = new THREE.MeshStandardMaterial({
      map: hazardTexture(), roughness: 0.7,
      emissive: 0xffaa33, emissiveIntensity: 0.06,
    }); break;
    case 'gantry': m = new THREE.MeshStandardMaterial({ color: 0xd8b13c, roughness: 0.55, metalness: 0.5 }); break;
    case 'darkMetal': m = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.6, metalness: 0.55 }); break;
    case 'cone': m = new THREE.MeshStandardMaterial({ color: 0xff5a26, roughness: 0.7 }); break;
    case 'leaf': m = new THREE.MeshStandardMaterial({ color: 0x4d9e4f, roughness: 0.9 }); break;
    case 'trunk': m = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 1 }); break;
    case 'coin': m = new THREE.MeshStandardMaterial({
      color: 0xffc93c, roughness: 0.25, metalness: 0.8,
      emissive: 0xcf8a00, emissiveIntensity: 0.55,
    }); break;
    case 'gem': m = new THREE.MeshStandardMaterial({
      color: 0x54e8c8, roughness: 0.1, metalness: 0.4,
      emissive: 0x18b09a, emissiveIntensity: 0.9,
    }); break;
    case 'box': m = new THREE.MeshStandardMaterial({
      color: 0xb07ae0, roughness: 0.4, metalness: 0.3,
      emissive: 0x6a2fb0, emissiveIntensity: 0.35,
    }); break;
    case 'lamp': m = new THREE.MeshBasicMaterial({ color: 0xffd9a0 }); break;
    case 'neonTeal': m = new THREE.MeshBasicMaterial({ color: 0x35e0d2 }); break;
    case 'neonPink': m = new THREE.MeshBasicMaterial({ color: 0xff4f81 }); break;
    case 'headlight': m = new THREE.MeshBasicMaterial({ color: 0xfff2c4 }); break;
    case 'taillight': m = new THREE.MeshBasicMaterial({ color: 0xff3838 }); break;
    case 'streetDark': m = new THREE.MeshStandardMaterial({ color: 0x23202b, roughness: 1 }); break;
    case 'windowBox': m = new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.4, metalness: 0.6 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  }
  mats[key] = m;
  return m;
}

export const GEO = {};
export function geo(key, maker) {
  if (!GEO[key]) GEO[key] = maker();
  return GEO[key];
}
