// Item/block icon rendering — shared by UI slots and drop entities.
import { B, BLOCKS } from './blocks.js';
import { atlasSource, uvRect } from './atlas.js';

const cache = new Map();

function tilePixelRect(tileName) {
  const [u0, v0, u1, v1] = uvRect(tileName);
  const S = atlasSource().width;
  return { x: u0 * S, y: (1 - v1) * S, w: (u1 - u0) * S, h: (v1 - v0) * S };
}

function drawIsoCube(ctx, bd) {
  const src = atlasSource();
  const topTile = bd.tileTop ?? bd.tile ?? bd.tileSide;
  const sideTile = bd.tileSide ?? bd.tile;
  const frontTile = bd.tileFront ?? sideTile;

  const s = 19, h = 21, cx = 32, cy = 27;
  const drawFace = (tileName, m, shade) => {
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.imageSmoothingEnabled = false;
    const r = tilePixelRect(tileName);
    ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, 16, 16);
    if (shade > 0) {
      ctx.globalAlpha = shade;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 16, 16);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // top face (diamond)
  drawFace(topTile, [(s) / 16, (-s / 2) / 16, (s) / 16, (s / 2) / 16, cx - s, cy], 0);
  // left-front face
  drawFace(sideTile, [(s) / 16, (s / 2) / 16, 0, h / 16, cx - s, cy], 0.22);
  // right-front face
  drawFace(frontTile, [(s) / 16, (-s / 2) / 16, 0, h / 16, cx, cy + s / 2], 0.38);
}

function px(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

const TIER_COL = {
  wooden: ['#6b4a26', '#a3824c'],
  stone: ['#5c5c64', '#8f8f96'],
  iron: ['#b8b8c2', '#e8e8ef'],
  golden: ['#c8960f', '#fce34b'],
  diamond: ['#1fa898', '#7ff2e6'],
};
const HANDLE = '#6b4a26', HANDLE_HI = '#8a6a3a';

function drawTool(c, kind, tier) {
  const [dark, light] = TIER_COL[tier] || TIER_COL.iron;
  if (kind === 'pickaxe') {
    for (let i = 0; i < 9; i++) { rect(c, 3 + i, 12 - i, 2, 1, HANDLE); rect(c, 3 + i, 11 - i, 1, 1, HANDLE_HI); }
    rect(c, 4, 4, 9, 2, dark);
    rect(c, 3, 5, 3, 2, dark); rect(c, 11, 5, 3, 2, dark);
    rect(c, 2, 6, 2, 2, dark); rect(c, 12, 6, 2, 2, dark);
    rect(c, 5, 4, 7, 1, light);
  } else if (kind === 'axe') {
    for (let i = 0; i < 9; i++) { rect(c, 4 + i, 13 - i, 2, 1, HANDLE); rect(c, 4 + i, 12 - i, 1, 1, HANDLE_HI); }
    rect(c, 3, 2, 6, 5, dark);
    rect(c, 2, 3, 1, 4, dark); rect(c, 9, 3, 2, 4, light);
    rect(c, 3, 2, 4, 1, light);
  } else if (kind === 'shovel') {
    for (let i = 0; i < 10; i++) { rect(c, 4 + i * 0.7 | 0, 14 - i, 2, 1, HANDLE); rect(c, 4 + i * 0.7 | 0, 13 - i, 1, 1, HANDLE_HI); }
    rect(c, 3, 2, 5, 5, dark);
    rect(c, 4, 1, 3, 1, dark);
    rect(c, 3, 2, 2, 2, light);
  } else if (kind === 'sword') {
    for (let i = 0; i < 9; i++) { rect(c, 9 - i * 0.55 | 0, 4 + i, 1, 2, light); rect(c, 10 - i * 0.55 | 0, 4 + i, 1, 1, dark); }
    rect(c, 4, 10, 5, 2, HANDLE_HI);
    rect(c, 3, 12, 3, 3, HANDLE);
    rect(c, 10, 3, 2, 2, light);
  } else if (kind === 'hoe') {
    for (let i = 0; i < 9; i++) { rect(c, 4 + i, 13 - i, 2, 1, HANDLE); rect(c, 4 + i, 12 - i, 1, 1, HANDLE_HI); }
    rect(c, 4, 2, 7, 2, dark);
    rect(c, 10, 3, 2, 3, dark);
    rect(c, 4, 2, 6, 1, light);
  }
}

const ITEM_ART = {
  stick: (c) => {
    for (let i = 0; i < 10; i++) { rect(c, 3 + i, 12 - i, 2, 1, HANDLE); rect(c, 3 + i, 11 - i, 1, 1, HANDLE_HI); }
  },
  coal: (c) => { blobAt(c, 8, 9, 4, ['#232327', '#35353c', '#101014']); },
  charcoal: (c) => { blobAt(c, 8, 9, 4, ['#3a2a20', '#4e3a2c', '#241812']); },
  iron_ingot: (c) => ingot(c, ['#b8b8c2', '#e8e8ef', '#8f8f99']),
  gold_ingot: (c) => ingot(c, ['#d8a410', '#fce34b', '#a87d08']),
  diamond: (c) => gem(c),
  spark_dust: (c) => {
    blobAt(c, 8, 11, 3, ['#ff7a1e', '#ffb03a', '#c84a0e']);
    px(c, 5, 6, '#ffd76a'); px(c, 10, 5, '#ff9d3f'); px(c, 8, 7, '#fff0a0');
  },
  wool: (c) => {
    rect(c, 3, 4, 10, 9, '#eceff2');
    rect(c, 4, 3, 8, 1, '#f6f8fa'); rect(c, 3, 12, 10, 1, '#d8dde2');
    px(c, 5, 6, '#ffffff'); px(c, 9, 8, '#ffffff');
  },
  seeds: (c) => {
    const pts = [[5, 6], [9, 5], [7, 9], [10, 10], [4, 10], [8, 12]];
    for (const [x, y] of pts) { px(c, x, y, '#3f7a2e'); px(c, x + 1, y, '#5aa03e'); }
  },
  wheat: (c) => {
    for (const bx of [5, 8, 11]) {
      rect(c, bx, 5, 1, 9, '#caa23a');
      px(c, bx - 1, 4, '#e8cc62'); px(c, bx, 3, '#efe08a'); px(c, bx + 1, 4, '#e8cc62');
      px(c, bx - 1, 6, '#dcb850'); px(c, bx + 1, 6, '#dcb850');
    }
  },
  bread: (c) => {
    rect(c, 3, 6, 10, 6, '#b8863c');
    rect(c, 4, 5, 8, 1, '#d8a852');
    rect(c, 3, 11, 10, 1, '#8f6528');
    px(c, 6, 7, '#e8c87a'); px(c, 9, 8, '#e8c87a'); px(c, 7, 9, '#d8a852');
  },
  apple: (c) => {
    rect(c, 5, 6, 7, 7, '#c83232');
    rect(c, 4, 7, 9, 5, '#c83232');
    px(c, 6, 7, '#ff7a6a'); px(c, 5, 8, '#ff7a6a');
    rect(c, 8, 3, 1, 3, '#5a4020'); px(c, 9, 4, '#4a8a2e');
  },
  pork_raw: (c) => chop(c, '#e89aa2', '#c86a72'),
  pork_cooked: (c) => chop(c, '#c88a52', '#a06a38'),
  mutton_raw: (c) => chop(c, '#e07a80', '#b85860'),
  mutton_cooked: (c) => chop(c, '#b87840', '#8f5828'),
  chicken_raw: (c) => drumstick(c, '#eec8c0', '#d8a098'),
  chicken_cooked: (c) => drumstick(c, '#d8a45a', '#b8823a'),
};

function blobAt(c, cx, cy, r, cols) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= r * r + 1 && Math.random() > 0.15) {
      px(c, cx + x, cy + y, cols[(Math.random() * cols.length) | 0]);
    }
  }
}
function ingot(c, [mid, hi, lo]) {
  rect(c, 3, 7, 10, 4, mid);
  rect(c, 4, 6, 8, 1, hi);
  rect(c, 3, 11, 10, 1, lo);
  px(c, 4, 8, hi); px(c, 5, 8, hi);
}
function gem(c) {
  const rows = [[7, 2], [5, 4], [4, 6], [5, 4]];
  let y = 5;
  for (let i = 0; i < 4; i++) { rect(c, rows[i][0], y, rows[i][1], 1, i === 0 ? '#bffcf0' : '#4aedd9'); y++; }
  for (let i = 3; i >= 0; i--) { rect(c, 8 - ((rows[i][1] / 2) | 0), y, rows[i][1], 1, '#2ec4ae'); y++; }
  px(c, 7, 6, '#e8fffb');
}
function chop(c, main, dark) {
  rect(c, 4, 5, 9, 7, main);
  rect(c, 3, 6, 1, 5, main);
  rect(c, 12, 6, 1, 4, dark);
  rect(c, 5, 11, 7, 1, dark);
  rect(c, 6, 6, 3, 2, '#f4c8ca');
  rect(c, 10, 9, 2, 2, dark);
}
function drumstick(c, main, dark) {
  rect(c, 5, 4, 6, 6, main);
  rect(c, 4, 5, 8, 4, main);
  rect(c, 6, 5, 3, 2, '#f8ded8');
  rect(c, 10, 10, 2, 2, dark);
  rect(c, 12, 12, 2, 2, '#e8e0d0');
}

export function getItemIcon(id) {
  const key = String(id);
  if (cache.has(key)) return cache.get(key);

  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (typeof id === 'number') {
    const bd = BLOCKS[id];
    if (bd && bd.render !== 'air') drawIsoCube(ctx, bd);
  } else {
    const small = document.createElement('canvas');
    small.width = 16; small.height = 16;
    const sc = small.getContext('2d');
    const m = /^(\w+)_(pickaxe|axe|shovel|sword|hoe)$/.exec(id);
    if (m) drawTool(sc, m[2], m[1]);
    else if (ITEM_ART[id]) ITEM_ART[id](sc);
    else {
      // fallback: tinted square
      sc.fillStyle = '#c46aeb'; sc.fillRect(3, 3, 10, 10);
      sc.fillStyle = '#e8a8ff'; sc.fillRect(4, 4, 4, 4);
    }
    ctx.drawImage(small, 0, 0, 16, 16, 0, 0, 64, 64);
  }

  cache.set(key, cv);
  return cv;
}
