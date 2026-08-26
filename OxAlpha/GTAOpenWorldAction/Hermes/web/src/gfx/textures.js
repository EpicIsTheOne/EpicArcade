// CHROME HARBOR — procedural canvas textures (all assets generated locally)
import * as THREE from 'three';
import { RNG } from '../core/util.js';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// ---------- building facades ----------
// style: 'glass' | 'office' | 'brick' | 'house' | 'ware' | 'hotel'
export function facadeTexture(style, seed) {
  const rng = new RNG(seed);
  const W = 256, H = 512;
  const [cA, x] = canvas(W, H);   // albedo
  const [cE, e] = canvas(W, H);   // emissive (lit windows)
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);

  const palettes = {
    glass:  ['#3d5266', '#48607a', '#35506b'],
    office: ['#8f8577', '#9a9184', '#7e766a'],
    brick:  ['#7a4a38', '#6e4030', '#84513c'],
    house:  ['#cfc3ac', '#c2b49a', '#b9a88e'],
    ware:   ['#8b9099', '#79808a', '#969ba3'],
    hotel:  ['#d8cdb8', '#cbc0aa', '#e0d6c2'],
  };
  const base = rng.pick(palettes[style]);
  x.fillStyle = base; x.fillRect(0, 0, W, H);

  // subtle grime bands
  for (let i = 0; i < 14; i++) {
    x.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.06)})`;
    x.fillRect(0, rng.range(0, H), W, rng.range(4, 30));
  }

  let litChance = 0.34;
  if (style === 'glass') {
    // curtain-wall grid
    const cols = 8, rows = 20;
    const cw = W / cols, chh = H / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const px = i * cw + 1.5, py = j * chh + 1.5, pw = cw - 3, ph = chh - 3;
      const lit = rng.chance(litChance);
      x.fillStyle = lit ? warm(rng) : coolGlass(rng);
      x.fillRect(px, py, pw, ph);
      if (lit) { e.fillStyle = warm(rng, 1); e.fillRect(px, py, pw, ph); }
    }
  } else if (style === 'house') {
    // windows sparse
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
      const px = 28 + i * 72, py = 60 + j * 110;
      const lit = rng.chance(0.3);
      x.fillStyle = '#2a3138'; x.fillRect(px, py, 44, 54);
      x.strokeStyle = '#fff3'; x.lineWidth = 3; x.strokeRect(px, py, 44, 54);
      x.fillStyle = '#fff'; x.fillRect(px + 20, py, 3, 54); x.fillRect(px, py + 25, 44, 3);
      if (lit) { e.fillStyle = warm(rng, 1); e.fillRect(px + 2, py + 2, 40, 50); }
      else { x.fillStyle = coolGlass(rng, 0.7); x.fillRect(px + 2, py + 2, 40, 50); }
    }
  } else {
    // punched windows
    const cols = style === 'brick' ? 5 : 6;
    const rows = style === 'ware' ? 5 : 12;
    const litBase = style === 'ware' ? 0.15 : 0.3;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cw = W / cols, chh = H / rows;
      const px = i * cw + cw * 0.22, py = j * chh + chh * 0.24, pw = cw * 0.56, ph = chh * 0.52;
      const lit = rng.chance(litBase);
      x.fillStyle = '#232a33'; x.fillRect(px - 2, py - 2, pw + 4, ph + 4);
      x.fillStyle = lit ? warm(rng) : coolGlass(rng);
      x.fillRect(px, py, pw, ph);
      if (lit) { e.fillStyle = warm(rng, 1); e.fillRect(px, py, pw, ph); }
    }
  }
  // ground floor: darker storefront band
  x.fillStyle = 'rgba(10,12,16,.55)';
  if (style !== 'house') x.fillRect(0, H - 46, W, 46);
  return { map: tex(cA), emissive: tex(cE) };
}
function warm(rng, a = 1) { const p = rng.pick(['#ffd9a0', '#ffe9c4', '#ffc97e', '#cfe6ff']); return withA(p, a); }
function coolGlass(rng, a = 1) { const p = rng.pick(['#6f87a0', '#59718c', '#8098ae', '#4c6478']); return withA(p, a); }
function withA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- neon signs ----------
const SIGN_WORDS = ['DINER', 'LIQUOR', 'PAWN', 'CLUB NOVA', 'MOTEL', 'NOODLE BAR', 'TATTOO', 'ARCADE', 'LAUNDRY', 'ROXY', 'EL FARO', 'GARAGE', 'HOTEL VELA', 'KARAOKE'];
export function signTexture(seed) {
  const rng = new RNG('sign' + seed);
  const W = 512, H = 128;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#07080c'; x.fillRect(0, 0, W, H);
  const word = SIGN_WORDS[seed % SIGN_WORDS.length];
  const colors = [['#ff5f8f', '#ffd1e0'], ['#4fd8e0', '#d9feff'], ['#ffb43a', '#ffe9c4'], ['#8f7bff', '#e2dbff']];
  const [main, glowCol] = rng.pick(colors);
  x.font = `900 ${word.length > 8 ? 52 : 68}px Arial Black, Arial`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = main; x.shadowBlur = 22;
  x.fillStyle = glowCol; x.fillText(word, W / 2, H / 2);
  x.fillText(word, W / 2, H / 2);
  x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = .85; x.fillText(word, W / 2, H / 2);
  x.globalAlpha = 1;
  // border tube
  x.strokeStyle = main; x.lineWidth = 5; x.shadowColor = main; x.shadowBlur = 16;
  x.strokeRect(10, 10, W - 20, H - 20);
  return tex(c);
}

// ---------- billboards ----------
export function billboardTexture(seed) {
  const rng = new RNG('bill' + seed);
  const W = 512, H = 256;
  const [c, x] = canvas(W, H);
  const schemes = [
    ['#123049', '#4fd8e0', 'VELA COLA', 'TASTE THE SHORE'],
    ['#2a1030', '#ff5f8f', 'NOVA CLUB', 'OPEN TIL DAWN'],
    ['#20301a', '#a8e063', 'GET FIT GYM', 'NO EXCUSES'],
    ['#301a10', '#ffb43a', 'PORT VELA', 'IT\'S ALL DOWNHILL'],
    ['#101828', '#ffffff', 'CHROME', 'DRIVE ANGRY'],
  ];
  const [bg, fg, t1, t2] = rng.pick(schemes);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = fg; x.globalAlpha = .16;
  for (let i = 0; i < 6; i++) x.fillRect(rng.range(0, W), 0, rng.range(20, 80), H);
  x.globalAlpha = 1;
  x.font = '900 64px Arial Black, Arial'; x.textAlign = 'center';
  x.fillStyle = fg; x.fillText(t1, W / 2, H / 2 - 8);
  x.font = '600 26px Arial'; x.fillStyle = '#ffffffcc';
  x.fillText(t2, W / 2, H / 2 + 42);
  return tex(c);
}

// ---------- particles ----------
export function glowTexture() {
  const S = 64; const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return tex(c);
}
export function smokeTexture() {
  const S = 64; const [c, x] = canvas(S, S);
  const rng = new RNG(7);
  for (let i = 0; i < 26; i++) {
    const r = rng.range(6, 18), px = S / 2 + rng.range(-14, 14), py = S / 2 + rng.range(-14, 14);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,.20)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  return tex(c);
}
export function streakTexture() {
  const W = 8, H = 64; const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(210,230,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,.05)');
  x.fillStyle = g; x.fillRect(2, 0, W - 4, H);
  return tex(c);
}

// ---------- ground zone canvas ----------
// paints district base colors: asphalt roads, sidewalk rings, block interiors, sand, park grass
export function groundCanvas(plan) {
  const SIZE = 2048;
  const [c, x] = canvas(SIZE, SIZE);
  const s = SIZE / (WORLD_SPAN * 2); // px per meter
  const toPx = (m) => (m + WORLD_SPAN) * s;
  const SPAN = 900;
  function worldSpan(v) { return v; }

  // base: concrete-ish midtown fill
  x.fillStyle = '#565a60'; x.fillRect(0, 0, SIZE, SIZE);

  // blocks by zone
  for (const b of plan.blocks) {
    const px = toPx(b.x0), pz = toPx(b.z0), pw = (b.x1 - b.x0) * s, ph = (b.z1 - b.z0) * s;
    const zoneFill = {
      downtown: '#585d66', midtown: '#5c5e63', oldtown: '#66584c', residential: '#57683f',
      industrial: '#565b62', marina: '#5f6468', beach: '#d9c489', park: '#4d7a41',
      plaza: '#63666e', stadium: '#4f545c', hospital: '#5c5e63', police: '#5c5e63',
      safehouse: '#66584c', spray: '#565b62', stores: '#5c5e63',
    }[b.zone] || '#5a5d64';
    x.fillStyle = zoneFill;
    x.fillRect(px, pz, pw, ph);
    if (b.zone === 'residential') { // yard speckle
      for (let i = 0; i < 40; i++) {
        x.fillStyle = `rgba(${40 + Math.random() * 30 | 0},${90 + Math.random() * 40 | 0},40,.25)`;
        x.fillRect(px + Math.random() * pw, pz + Math.random() * ph, 8, 8);
      }
    }
  }
  // roads (draw over everything)
  for (const r of [...plan.roadsV, ...plan.roadsH]) {
    x.fillStyle = '#33363b';
    if (r.axis === 'v') x.fillRect(toPx(r.c - r.w / 2), toPx(r.a), r.w * s, (r.b - r.a) * s);
    else x.fillRect(toPx(r.a), toPx(r.c - r.w / 2), (r.b - r.a) * s, r.w * s);
  }
  // sidewalks: light ring around each block edge
  x.fillStyle = '#77787c';
  const sw = plan.SIDEWALK * s;
  for (const b of plan.blocks) {
    const px = toPx(b.x0), pz = toPx(b.z0), pw = (b.x1 - b.x0) * s, ph = (b.z1 - b.z0) * s;
    x.fillRect(px - sw, pz - sw, pw + sw * 2, sw);            // top strip (into road side)
    x.fillRect(px - sw, pz + ph, pw + sw * 2, sw);
    x.fillRect(px - sw, pz, sw, ph);
    x.fillRect(px + pw, pz, sw, ph);
  }
  // beach sand
  x.fillStyle = '#dcc98e';
  x.fillRect(toPx(-SPAN), toPx(606), 2 * SPAN * s, (650 - 606) * s);
  // water tint hint beyond (actual water is a mesh)
  x.fillStyle = '#1d4e63';
  x.fillRect(toPx(-SPAN), toPx(650), 2 * SPAN * s, (SPAN - 650 + 200) * s);
  return { texture: tex(c, { repeat: null }), span: SPAN };
}
const WORLD_SPAN = 900;

// noise overlay for road detail
export function noiseTexture(size = 256, alpha = 0.09) {
  const [c, x] = canvas(size, size);
  const img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.random() * 20;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255 * alpha + Math.random() * 30;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
