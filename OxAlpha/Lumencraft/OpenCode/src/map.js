// Live world map — read-only observer. Terrain is computed locally from the
// public seed (deterministic worldgen); builds/claims/players stream in via WS.
import { SEA } from './config.js';
import { Generator, BIOME } from './worldgen.js';
import { CHUNK } from './config.js';

const SEED = 'site-smp';
const DAY_MS = 600000;

function resolveWsUrl() {
  try {
    const q = new URLSearchParams(location.search).get('ws');
    if (q) return q;
  } catch {}
  const secure = location.protocol === 'https:';
  return (secure ? 'wss://' : 'ws://') + location.host + '/ws/lumencraft';
}

// ---------- block colors (top-down palette) ----------
const BLOCK_COLORS = {
  1: [125, 125, 130],   // stone
  2: [116, 168, 78],    // grass
  3: [121, 85, 58],     // dirt
  4: [100, 100, 106],   // cobble
  5: [163, 129, 78],    // planks
  6: [219, 207, 154],   // sand
  7: [213, 198, 140],   // sandstone
  8: [126, 120, 114],   // gravel
  9: [104, 82, 50],     // oak log
  10: [58, 110, 44],    // oak leaves
  12: [170, 205, 225],  // glass
  13: [90, 80, 70],     // coal ore
  14: [140, 110, 90],   // iron ore
  15: [190, 160, 100],  // gold ore
  16: [110, 220, 210],  // diamond ore
  17: [200, 120, 60],   // ember ore
  18: [40, 40, 46],     // bedrock
  19: [234, 241, 247],  // snowy grass
  20: [234, 241, 247],  // snow block
  21: [180, 210, 235],  // ice
  22: [90, 140, 60],    // cactus
  33: [100, 160, 70],   // tallgrass
  34: [250, 230, 140],  // glowstone
  35: [140, 110, 70],   // crafting table
  36: [120, 120, 128],  // furnace
  38: [160, 120, 60],   // chest
  39: [200, 70, 90],    // bed
  41: [150, 150, 158],  // lever
  45: [90, 90, 100],    // lamp off
  46: [255, 240, 170],  // lamp on
  47: [88, 128, 60],    // mossy
  48: [150, 140, 110],  // birch log
  49: [70, 120, 50],    // birch leaves
  50: [80, 95, 60],     // pine log
  51: [50, 90, 55],     // pine leaves
  52: [230, 140, 40],   // pumpkin
  53: [150, 110, 70],   // bookshelf
  54: [28, 22, 40],     // obsidian
  59: [230, 110, 30],   // lava
  60: [70, 60, 90],     // claim totem
};

function terrainColor(gen, x, z) {
  const info = gen.columnInfo(x, z);
  const h = info.h;
  if (h < SEA) {
    const depth = Math.min(1, (SEA - h) / 14);
    return [Math.round(40 - depth * 18), Math.round(95 - depth * 40), Math.round(170 - depth * 60)];
  }
  let base;
  switch (info.biome) {
    case BIOME.BEACH: base = [219, 207, 154]; break;
    case BIOME.DESERT: base = [222, 205, 140]; break;
    case BIOME.SNOWY: base = [232, 239, 245]; break;
    case BIOME.MOUNTAIN: {
      const rock = Math.max(0, Math.min(1, (h - SEA - 26) / 22));
      const g = [110, 150, 96], s = [140, 138, 134];
      base = [g[0] + (s[0] - g[0]) * rock, g[1] + (s[1] - g[1]) * rock, g[2] + (s[2] - g[2]) * rock];
      break;
    }
    case BIOME.FOREST: base = [70, 128, 52]; break;
    default: base = [112, 164, 74];
  }
  const shade = 0.72 + 0.28 * Math.min(1, (h - SEA) / 30);
  return [base[0] * shade | 0, base[1] * shade | 0, base[2] * shade | 0];
}

// ---------- state ----------
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const onlineEl = document.getElementById('online');
const coordsEl = document.getElementById('coords');

const gen = new Generator(SEED);
const edits = new Map();      // "x,z" -> {y, id}  (top edit per column)
const claims = new Map();     // "cx,cz" -> owner
const chests = [];            // [x, z]
const players = new Map();    // id -> {name, x, z}
const tiles = new Map();      // "cx,cz" -> {cv, dirty:false}

let camX = 0, camZ = 0;       // world coords at canvas center
let scale = 3;                // px per block
let dragging = false, dragMoved = false, lastMX = 0, lastMY = 0;
let ws = null, retries = 0, closedForGood = false;

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}
addEventListener('resize', resize);
resize();

// ---------- tiles ----------
function chunkTile(cx, cz) {
  const key = cx + ',' + cz;
  let t = tiles.get(key);
  if (t && !t.dirty) return t;
  const cv = t ? t.cv : document.createElement('canvas');
  cv.width = CHUNK; cv.height = CHUNK;
  const c = cv.getContext('2d');
  const img = c.createImageData(CHUNK, CHUNK);
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const wx = cx * CHUNK + lx, wz = cz * CHUNK + lz;
      let col;
      const e = edits.get(wx + ',' + wz);
      if (e && e.id !== 0 && BLOCK_COLORS[e.id]) col = BLOCK_COLORS[e.id];
      else col = terrainColor(gen, wx, wz);
      const o = (lz * CHUNK + lx) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  t = { cv, dirty: false };
  tiles.set(key, t);
  if (tiles.size > 900) { // trim far tiles
    const first = tiles.keys().next().value;
    tiles.delete(first);
  }
  return t;
}

function invalidateArea(x, z, r = 1) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const t = tiles.get((cx + dx) + ',' + (cz + dz));
    if (t) t.dirty = true;
  }
}

// ---------- ws ----------
function connect() {
  if (closedForGood) return;
  statusEl.textContent = 'connecting…';
  statusEl.classList.remove('online');
  const sock = new WebSocket(resolveWsUrl());
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ op: 'join', room: 'SMP', name: 'map', map: true }));
  sock.onclose = () => {
    if (ws !== sock || closedForGood) return;
    statusEl.textContent = 'reconnecting…';
    setTimeout(connect, Math.min(6000, 800 * Math.pow(2, retries++)));
  };
  sock.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    retries = 0;
    statusEl.textContent = 'live';
    statusEl.classList.add('online');
    switch (m.op) {
      case 'welcome':
        applyMapData({ edits: m.edits, claims: m.claims, containers: m.containers, players: m.players });
        if (m.seed && m.seed !== SEED) statusEl.textContent = 'seed mismatch?';
        sock.send(JSON.stringify({ op: 'mapdata' }));
        break;
      case 'mapdata':
        applyMapData(m);
        break;
      case 'states':
        for (const s of m.ps) {
          const p = players.get(s[0]);
          if (p) { p.x = s[1]; p.z = s[3]; }
        }
        break;
      case 'joined':
        players.set(m.id, { name: m.name, x: (m.s ? m.s[0] : 0), z: (m.s ? m.s[2] : 0) });
        break;
      case 'left':
        players.delete(m.id);
        break;
      case 'block': {
        const key = m.x + ',' + m.z;
        const cur = edits.get(key);
        if (!cur || m.y >= cur.y) edits.set(key, { y: m.y, id: m.b });
        invalidateArea(m.x, m.z);
        break;
      }
      case 'claim':
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          claims.set((m.cx + dx) + ',' + (m.cz + dz), String(m.owner));
        }
        break;
      case 'unclaim':
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          claims.delete((m.cx + dx) + ',' + (m.cz + dz));
        }
        break;
      case 'chest': {
        const i = chests.findIndex((c) => c[0] === m.x && c[1] === m.z);
        if (i >= 0) chests.splice(i, 1);
        if (m.slots.length) chests.push([m.x, m.z]);
        break;
      }
      default:
        break;
    }
  };
}

function applyMapData(m) {
  if (Array.isArray(m.edits)) {
    for (const e of m.edits) {
      if (!Array.isArray(e) || e.length < 4) continue;
      const [x, y, z, id] = e;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
      const key = x + ',' + z;
      const cur = edits.get(key);
      if (!cur || y >= cur.y) edits.set(key, { y, id: id & 255 });
    }
    for (const key of tiles.keys()) {
      const t = tiles.get(key);
      if (t) t.dirty = true;
    }
  }
  if (Array.isArray(m.claims)) {
    claims.clear();
    for (const c of m.claims) {
      if (Array.isArray(c) && c.length >= 3) claims.set(c[0] + ',' + c[1], String(c[2]));
    }
  }
  if (Array.isArray(m.containers)) {
    chests.length = 0;
    for (const c of m.containers) {
      if (Array.isArray(c) && c.length >= 3) chests.push([c[0], c[2]]);
    }
  }
  if (Array.isArray(m.players)) {
    players.clear();
    for (const p of m.players) players.set(p[0], { name: p[1], x: p[2], z: p[4] });
  }
}

// ---------- input ----------
canvas.addEventListener('mousedown', (e) => {
  dragging = true; dragMoved = false; lastMX = e.clientX; lastMY = e.clientY;
  canvas.classList.add('dragging');
});
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
  camX -= dx / scale; camZ -= dy / scale;
  lastMX = e.clientX; lastMY = e.clientY;
});
addEventListener('mouseup', () => { dragging = false; canvas.classList.remove('dragging'); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 1 / 1.25);
}, { passive: false });
document.getElementById('z-in').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 1.3));
document.getElementById('z-out').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.3));

function zoomAt(px, py, factor) {
  const wx = camX + (px - innerWidth / 2) / scale;
  const wz = camZ + (py - innerHeight / 2) / scale;
  scale = Math.max(0.25, Math.min(16, scale * factor));
  camX = wx - (px - innerWidth / 2) / scale;
  camZ = wz - (py - innerHeight / 2) / scale;
}

// ---------- render ----------
function render() {
  requestAnimationFrame(render);
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, w, h);

  const pxScale = scale * devicePixelRatio;
  const halfW = w / 2 / pxScale, halfH = h / 2 / pxScale;
  const x0 = Math.floor((camX - halfW) / CHUNK), x1 = Math.floor((camX + halfW) / CHUNK);
  const z0 = Math.floor((camZ - halfH) / CHUNK), z1 = Math.floor((camZ + halfH) / CHUNK);

  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const t = chunkTile(cx, cz);
      const sx = (cx * CHUNK - camX) * pxScale + w / 2;
      const sy = (cz * CHUNK - camZ) * pxScale + h / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t.cv, sx, sy, CHUNK * pxScale, CHUNK * pxScale);
    }
  }

  // claim borders (label once per group, at its top-left chunk)
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.font = `${12 * devicePixelRatio}px "Segoe UI", sans-serif`;
  for (const [key, owner] of claims) {
    const [cx, cz] = key.split(',').map(Number);
    const bx = ((cx - 1) * CHUNK - camX) * pxScale + w / 2;
    const by = ((cz - 1) * CHUNK - camZ) * pxScale + h / 2;
    const bw = 3 * CHUNK * pxScale, bh = 3 * CHUNK * pxScale;
    if (bx + bw < 0 || by + bh < 0 || bx > w || by > h) continue;
    ctx.strokeStyle = 'rgba(255,90,90,.75)';
    ctx.strokeRect(bx, by, bw, bh);
    const west = claims.get((cx - 1) + ',' + cz) === owner;
    const north = claims.get(cx + ',' + (cz - 1)) === owner;
    if (!west && !north) {
      ctx.fillStyle = 'rgba(255,120,120,.9)';
      ctx.fillText(`${owner} (${cx * CHUNK}, ${cz * CHUNK})`, bx + 4, by + 14 * devicePixelRatio);
    }
  }

  // chests
  ctx.fillStyle = '#7ac0ff';
  for (const [x, z] of chests) {
    const sx = (x + 0.5 - camX) * pxScale + w / 2;
    const sy = (z + 0.5 - camZ) * pxScale + h / 2;
    const s = Math.max(3, 4 * devicePixelRatio);
    ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
  }

  // players
  for (const p of players.values()) {
    if (p.z < -50) continue;
    const sx = (p.x - camX) * pxScale + w / 2;
    const sy = (p.z - camZ) * pxScale + h / 2;
    if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue;
    const r = 5 * devicePixelRatio;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd76a';
    ctx.fill();
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(p.name, sx + r + 3 * devicePixelRatio, sy + 4 * devicePixelRatio);
  }

  // coords readout
  const mx = Math.floor(camX), mz = Math.floor(camZ);
  coordsEl.textContent = `${mx}, ${mz}  ·  ${scale.toFixed(1)} px/block`;
  onlineEl.textContent = String(players.size);
}

requestAnimationFrame(render);
connect();
