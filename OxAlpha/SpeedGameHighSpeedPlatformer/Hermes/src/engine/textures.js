import * as THREE from 'three';
import { fbm2 } from '../game/mathutil.js';

// Procedural canvas textures — everything is generated locally, no external assets.
const cache = new Map();

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(canvas, repeat = 1, aniso = 4) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function px(ctx, x, y, w, h, r, g, b, a = 1) {
  ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  ctx.fillRect(x, y, w, h);
}

export function texGrass(seed = 3) {
  if (cache.has('grass')) return cache.get('grass');
  const [c, g] = makeCanvas();
  for (let y = 0; y < 256; y += 4) for (let x = 0; x < 256; x += 4) {
    const n = fbm2(x / 34, y / 34, 4, seed);
    const n2 = fbm2(x / 9, y / 9, 2, seed + 7);
    px(g, x, y, 4, 4, 40 + n * 70, 120 + n * 90 + n2 * 26, 52 + n * 44);
  }
  for (let i = 0; i < 900; i++) { // blade speckles
    const x = Math.random() * 256, y = Math.random() * 256;
    px(g, x, y, 1, 2, 120 + Math.random() * 80, 190 + Math.random() * 55, 80);
  }
  const t = finish(c, 1); cache.set('grass', t); return t;
}

export function texSand() {
  if (cache.has('sand')) return cache.get('sand');
  const [c, g] = makeCanvas();
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
    const n = fbm2(x / 22, y / 22, 3, 11);
    px(g, x, y, 2, 2, 214 + n * 30, 190 + n * 36, 132 + n * 40);
  }
  const t = finish(c, 1); cache.set('sand', t); return t;
}

export function texRock() {
  if (cache.has('rock')) return cache.get('rock');
  const [c, g] = makeCanvas(256);
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
    const strata = Math.sin(y / 14 + fbm2(x / 60, y / 60, 3, 5) * 4) * 0.5 + 0.5;
    const n = fbm2(x / 16, y / 16, 4, 21);
    const v = 88 + strata * 46 + n * 42;
    px(g, x, y, 2, 2, v * 1.02, v * 0.96, v * 1.08);
  }
  const t = finish(c, 1); cache.set('rock', t); return t;
}

export function texWood() {
  if (cache.has('wood')) return cache.get('wood');
  const [c, g] = makeCanvas();
  for (let y = 0; y < 256; y++) {
    const plank = Math.floor(y / 32);
    const shade = fbm2(y / 6, plank * 7.7, 2, 31);
    for (let x = 0; x < 256; x++) {
      const grain = fbm2(x / 3, y / 18 + plank * 13, 2, 41) * 26;
      px(g, x, y, 1, 1, 148 + grain - shade * 20, 96 + grain * .8 - shade * 14, 48 + grain * .5);
      if (y % 32 === 0) px(g, x, y, 1, 1, 70, 44, 24);
    }
  }
  const t = finish(c, 1); cache.set('wood', t); return t;
}

export function texMetal(tint = [128, 138, 152]) {
  const key = 'metal' + tint.join(',');
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas();
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
    const n = fbm2(x / 40, y / 40, 3, 51) * 20 + fbm2(x / 7, y / 7, 2, 57) * 12;
    px(g, x, y, 2, 2, tint[0] + n, tint[1] + n, tint[2] + n);
  }
  // panel seams + rivets
  g.strokeStyle = 'rgba(20,24,34,.85)'; g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  for (let yy = 32; yy < 256; yy += 64) for (let xx = 32; xx < 256; xx += 64) { px(g, xx - 1, yy - 1, 3, 3, 40, 46, 58); px(g, xx, yy, 1, 1, 190, 200, 215); }
  const t = finish(c, 1); cache.set(key, t); return t;
}

export function texAsphalt() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const [c, g] = makeCanvas();
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
    const n = fbm2(x / 11, y / 11, 3, 61);
    px(g, x, y, 2, 2, 34 + n * 26, 36 + n * 26, 44 + n * 30);
  }
  const t = finish(c, 1); cache.set('asphalt', t); return t;
}

export function texNeonGrid(lineColor = '#19e6ff', base = [8, 12, 30]) {
  const key = 'neon' + lineColor;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas();
  px(g, 0, 0, 256, 256, base[0], base[1], base[2]);
  g.strokeStyle = lineColor; g.lineWidth = 2; g.globalAlpha = 0.9;
  for (let i = 0; i <= 256; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  g.globalAlpha = 1;
  const t = finish(c, 1); t.colorSpace = THREE.SRGBColorSpace; cache.set(key, t); return t;
}

export function texLava() {
  if (cache.has('lava')) return cache.get('lava');
  const [c, g] = makeCanvas(256);
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
    const crust = fbm2(x / 26, y / 26, 4, 71);
    const hot = clamp((crust - 0.45) * 2.4, 0, 1);
    px(g, x, y, 2, 2, 30 + crust * 40, 10 + crust * 22, 8);
    if (hot > 0.25) px(g, x, y, 2, 2, 255, 90 + (1 - hot) * 100, 20, Math.min(1, hot));
  }
  const t = finish(c, 1); cache.set('lava', t); return t;
}

export function texHazardStripes() {
  if (cache.has('stripes')) return cache.get('stripes');
  const [c, g] = makeCanvas(128);
  px(g, 0, 0, 128, 128, 30, 30, 36);
  g.fillStyle = '#ffd23e';
  for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 128, 128); g.lineTo(i + 128, 128); g.fill(); }
  const t = finish(c, 1); cache.set('stripes', t); return t;
}

// Soft round blob used for clouds & particles
export function texBlob(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const key = 'blob' + inner;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = makeCanvas(64);
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); cache.set(key, t); return t;
}

// Text sign texture for tutorial boards
export function texSign(text, opts = {}) {
  const w = 512, h = 160;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || 'rgba(8,14,30,0.92)';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = opts.fg || '#19e6ff'; g.lineWidth = 6;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = opts.fg || '#19e6ff';
  g.font = `italic 900 ${opts.size || 44}px "Segoe UI", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (opts.size || 44)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
