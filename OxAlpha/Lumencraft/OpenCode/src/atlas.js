// Procedural texture atlas — all block art is generated at boot (original pixel art).
// 16x16 grid of 32px cells (16px tile + 8px edge padding) => 512x512 canvas.
import * as THREE from 'three';
import { hashSeed, mulberry32 } from './noise.js';

const TILE = 16, PAD = 8, CELL = 32, GRID = 16, SIZE = GRID * CELL;

export const TILES = {};   // name -> index
const avgColors = [];      // index -> [r,g,b]

let atlasCanvas = null;

function rngFor(name) { return mulberry32(hashSeed('lumtile:' + name)); }

function mkCtx() {
  const cv = document.createElement('canvas');
  cv.width = TILE; cv.height = TILE;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return [cv, ctx];
}

const hex = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const shade = (c, d) => [Math.max(0, Math.min(255, c[0] + d)), Math.max(0, Math.min(255, c[1] + d)), Math.max(0, Math.min(255, c[2] + d))];

function base(ctx, rnd, c, v = 10) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const j = ((rnd() - 0.5) * 2 * v) | 0;
    ctx.fillStyle = hex(shade(c, j));
    ctx.fillRect(x, y, 1, 1);
  }
}
function speckle(ctx, rnd, c, n, size = 1) {
  for (let i = 0; i < n; i++) {
    const x = (rnd() * TILE) | 0, y = (rnd() * TILE) | 0;
    ctx.fillStyle = hex(c);
    if (size === 2 && rnd() < 0.6) ctx.fillRect(x, y, 2, 1); else ctx.fillRect(x, y, size, size);
  }
}
function blob(ctx, cx, cy, r, c, hi) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r + 0.4) {
      const x = (cx + dx + TILE) % TILE, y = (cy + dy + TILE) % TILE;
      ctx.fillStyle = hex(hi && Math.abs(dx) < 1 && dy === -r ? hi : c);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const defs = {};
function def(name, fn) { defs[name] = fn; }

// ---------- terrain ----------
def('stone', (c, r) => { base(c, r, [125, 125, 130], 9); speckle(c, r, [100, 100, 106], 14, 2); speckle(c, r, [145, 145, 150], 8); });
def('cobble', (c, r) => {
  base(c, r, [72, 72, 76], 5);
  const stones = [[3, 3, 3], [11, 2, 2], [4, 10, 3], [12, 11, 3], [8, 7, 2], [0, 7, 2], [15, 6, 2], [7, 14, 2]];
  for (const [x, y, rad] of stones) {
    const g = 118 + ((r() * 26) | 0);
    blob(c, x, y, rad, [g, g, g + 4]);
  }
});
def('mossy', (c, r) => { defs.cobble(c, r); speckle(c, r, [88, 128, 60], 22, 2); speckle(c, r, [70, 105, 48], 10, 1); });
def('dirt', (c, r) => { base(c, r, [121, 85, 58], 11); speckle(c, r, [92, 62, 40], 12, 2); speckle(c, r, [148, 110, 74], 6); });
def('grass_top', (c, r) => { base(c, r, [116, 168, 78], 13); speckle(c, r, [96, 148, 62], 18, 1); speckle(c, r, [140, 190, 96], 10, 1); });
def('grass_side', (c, r) => {
  defs.dirt(c, r);
  for (let x = 0; x < TILE; x++) {
    const depth = 3 + ((r() * 2.4) | 0);
    for (let y = 0; y < depth; y++) {
      const g = shade([112, 164, 74], ((r() - 0.5) * 24) | 0);
      c.fillStyle = hex(g); c.fillRect(x, y, 1, 1);
    }
  }
});
def('snow_side', (c, r) => {
  defs.dirt(c, r);
  for (let x = 0; x < TILE; x++) {
    const depth = 3 + ((r() * 2.4) | 0);
    for (let y = 0; y < depth; y++) { c.fillStyle = hex(shade([232, 240, 246], ((r() - .5) * 14) | 0)); c.fillRect(x, y, 1, 1); }
  }
});
def('snow', (c, r) => { base(c, r, [234, 241, 247], 7); speckle(c, r, [216, 226, 238], 10); });
def('sand', (c, r) => { base(c, r, [219, 207, 154], 8); speckle(c, r, [199, 186, 132], 12); speckle(c, r, [235, 224, 176], 6); });
def('sandstone', (c, r) => {
  base(c, r, [213, 198, 140], 5);
  for (let y = 0; y < TILE; y++) if (y % 5 === 4) speckleRow(c, r, y, [184, 168, 112]);
});
function speckleRow(c, r, y, col) { for (let x = 0; x < TILE; x++) if (r() < 0.55) { c.fillStyle = hex(col); c.fillRect(x, y, 1, 1); } }
def('gravel', (c, r) => {
  base(c, r, [126, 120, 114], 14);
  for (let i = 0; i < 9; i++) blob(c, (r() * 16) | 0, (r() * 16) | 0, 1 + (r() * 2 | 0), [100 + (r() * 50 | 0), 98 + (r() * 46 | 0), 94 + (r() * 40 | 0)]);
});
def('bedrock', (c, r) => { base(c, r, [52, 52, 58], 16); speckle(c, r, [24, 24, 28], 20, 2); speckle(c, r, [90, 90, 98], 8, 2); });
def('obsidian', (c, r) => { base(c, r, [28, 22, 40], 7); speckle(c, r, [46, 34, 70], 10, 2); speckle(c, r, [64, 48, 100], 4); });
def('claim_totem', (c, r) => {
  defs.obsidian(c, r);
  for (let y = 6; y <= 9; y++) for (let x = 0; x < TILE; x++) {
    c.fillStyle = hex(shade([212, 175, 55], ((r() - 0.5) * 34) | 0));
    c.fillRect(x, y, 1, 1);
  }
  c.fillStyle = hex([46, 34, 70]); c.fillRect(0, 6, 1, 4); c.fillRect(15, 6, 1, 4);
  speckle(c, r, [90, 220, 160], 6);
});
def('claim_totem_top', (c, r) => {
  defs.obsidian(c, r);
  c.fillStyle = hex([212, 175, 55]); c.fillRect(4, 4, 8, 8);
  c.fillStyle = hex([255, 215, 106]); c.fillRect(5, 5, 6, 1);
  c.fillStyle = hex([90, 220, 160]); c.fillRect(7, 7, 2, 2);
});
def('sign', (c, r) => {
  // wooden sign: plank board with darker frame + post stub
  planksBase(c, r, [176, 141, 87]);
  c.fillStyle = hex(shade([176, 141, 87], -45));
  c.fillRect(0, 0, TILE, 1); c.fillRect(0, 6, TILE, 1);
  c.fillRect(0, 0, 1, 7); c.fillRect(15, 0, 1, 7);
  for (let x = 2; x < 14; x += 3) { c.fillStyle = hex(shade([110, 85, 50], -10)); c.fillRect(x, 2, 2, 1); c.fillRect(x, 4, 3, 1); }
  c.fillStyle = hex(shade([104, 82, 50], -12));
  c.fillRect(7, 7, 2, 9);
});
def('sign', (c, r) => {
  // wooden post with a pale board
  base(c, r, [0, 0, 0], 0);
  c.clearRect(0, 0, TILE, TILE);
  c.fillStyle = hex([104, 82, 50]); c.fillRect(7, 8, 2, 8);
  c.fillStyle = hex(shade([163, 129, 78], -14)); c.fillRect(2, 2, 12, 7);
  c.fillStyle = hex([196, 160, 100]); c.fillRect(3, 3, 10, 5);
  c.fillStyle = hex(shade([120, 90, 50], 0));
  for (let i = 0; i < 3; i++) c.fillRect(4, 4 + i * 2, 8 - (i % 2) * 3, 1);
});

// ---------- wood ----------
function planksBase(c, r, tint) {
  base(c, r, tint, 7);
  for (let y = 3; y < TILE; y += 4) for (let x = 0; x < TILE; x++) { c.fillStyle = hex(shade(tint, -38)); c.fillRect(x, y, 1, 1); }
  for (let i = 0; i < 7; i++) {
    const x = (r() * 16) | 0, y = (r() * 16) & ~3;
    c.fillStyle = hex(shade(tint, -20)); c.fillRect(x, y, 1 + (r() * 4 | 0), 1);
  }
  c.fillStyle = hex(shade(tint, 22)); c.fillRect(2, 1, 1, 1); c.fillRect(12, 9, 1, 1);
}
def('planks', (c, r) => planksBase(c, r, [163, 129, 78]));
def('log_oak', (c, r) => {
  base(c, r, [104, 82, 50], 9);
  for (let x = 0; x < TILE; x += 2 + (r() * 2 | 0)) {
    const d = -18 - (r() * 16 | 0);
    for (let y = 0; y < TILE; y++) if (r() < 0.85) { c.fillStyle = hex(shade([104, 82, 50], d + ((r() - .5) * 10) | 0)); c.fillRect(x, y, 1, 1); }
  }
});
def('log_oak_top', (c, r) => {
  base(c, r, [176, 141, 87], 6);
  for (let ring = 7; ring > 0; ring -= 2) {
    c.strokeStyle = hex(ring % 4 ? [138, 107, 60] : [160, 126, 75]);
    c.strokeRect(8 - ring / 1 + 0.5, 8 - ring / 1 + 0.5, ring * 2 - 1, ring * 2 - 1);
  }
  c.fillStyle = '#6b5232'; c.fillRect(7, 7, 2, 2);
});
def('birch_log', (c, r) => {
  base(c, r, [215, 211, 197], 6);
  for (let i = 0; i < 6; i++) {
    const x = (r() * 14) | 0, y = (r() * 15) | 0;
    c.fillStyle = '#2e2a24'; c.fillRect(x, y, 2 + (r() * 2 | 0), 1);
  }
});
def('pine_log', (c, r) => {
  base(c, r, [74, 56, 38], 8);
  for (let x = 0; x < TILE; x += 2) {
    const d = -16 - (r() * 14 | 0);
    for (let y = 0; y < TILE; y++) if (r() < 0.8) { c.fillStyle = hex(shade([74, 56, 38], d)); c.fillRect(x, y, 1, 1); }
  }
});
function leafTile(colA, colB, holePct) {
  return (c, r) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (r() < holePct) continue;
      const t = r();
      c.fillStyle = hex(t < 0.5 ? shade(colA, ((r() - .5) * 26) | 0) : shade(colB, ((r() - .5) * 26) | 0));
      c.fillRect(x, y, 1, 1);
    }
  };
}
def('leaves_oak', leafTile([64, 118, 44], [86, 146, 56], 0.14));
def('leaves_birch', leafTile([104, 152, 66], [130, 174, 84], 0.16));
def('pine_leaves', leafTile([42, 88, 54], [58, 110, 66], 0.12));

// ---------- ores ----------
function oreTile(col, hi) {
  return (c, r) => {
    defs.stone(c, r);
    const clusters = 4 + (r() * 2 | 0);
    for (let i = 0; i < clusters; i++) {
      const x = 2 + (r() * 12) | 0, y = 2 + (r() * 12) | 0;
      c.fillStyle = hex(col);
      c.fillRect(x, y, 2, 2); c.fillRect(x - 1, y + 1, 1, 1); c.fillRect(x + 2, y, 1, 1);
      c.fillStyle = hex(hi); c.fillRect(x, y, 1, 1);
    }
  };
}
def('coal_ore', oreTile([38, 38, 42], [70, 70, 76]));
def('iron_ore', oreTile([216, 173, 140], [240, 205, 178]));
def('gold_ore', oreTile([247, 222, 80], [255, 245, 160]));
def('diamond_ore', oreTile([80, 230, 216], [170, 250, 244]));
def('ember_ore', oreTile([255, 122, 30], [255, 210, 120]));

// ---------- liquids / translucent ----------
def('water', (c, r) => { base(c, r, [56, 108, 212], 12); });
def('ice', (c, r) => {
  base(c, r, [160, 200, 240], 8);
  for (let i = 0; i < 4; i++) {
    let x = (r() * 16) | 0, y = (r() * 16) | 0;
    for (let s = 0; s < 6; s++) { c.fillStyle = 'rgba(230,245,255,.8)'; c.fillRect((x + 16) % 16, (y + 16) % 16, 1, 1); x += r() < .5 ? 1 : 0; y++; }
  }
});
def('glass', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.strokeStyle = 'rgba(220,240,255,.9)'; c.strokeRect(0.5, 0.5, 15, 15);
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.fillRect(3, 2, 1, 1); c.fillRect(2, 3, 1, 1); c.fillRect(4, 3, 1, 1);
  c.fillRect(11, 10, 1, 1); c.fillRect(12, 11, 1, 1); c.fillRect(10, 12, 1, 1);
});

// ---------- plants ----------
def('tallgrass', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  for (let i = 0; i < 7; i++) {
    const x = 1 + (r() * 14) | 0; let h = 5 + (r() * 9) | 0; const lean = r() < .5 ? -1 : 1;
    for (let y = 15; y > 15 - h && y >= 0; y--) {
      c.fillStyle = hex(shade([96, 158, 60], ((r() - .5) * 36) | 0));
      c.fillRect(x + (y < 15 - h / 2 ? lean : 0), y, 1, 1);
    }
  }
});
def('flower_red', (c, r) => {
  defs.tallgrass(c, r);
  c.fillStyle = '#2f7a2a'; c.fillRect(7, 8, 1, 5); c.fillRect(6, 11, 1, 1);
  c.fillStyle = '#d43b2f'; c.fillRect(6, 4, 3, 3);
  c.fillStyle = '#ffdf6b'; c.fillRect(7, 5, 1, 1);
});
def('flower_yellow', (c, r) => {
  defs.tallgrass(c, r);
  c.fillStyle = '#2f7a2a'; c.fillRect(9, 9, 1, 4);
  c.fillStyle = '#f2ce3a'; c.fillRect(8, 5, 3, 3);
  c.fillStyle = '#fff3ad'; c.fillRect(9, 6, 1, 1);
});
def('deadbush', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  for (let i = 0; i < 6; i++) {
    let x = 4 + (r() * 8) | 0, y = 15; const len = 4 + (r() * 7) | 0; let dx = r() < .5 ? -1 : 1;
    for (let s = 0; s < len; s++) { c.fillStyle = hex(shade([124, 92, 50], ((r() - .5) * 30) | 0)); c.fillRect(x, y, 1, 1); y--; if (r() < .4) x += dx; if (y < 2) break; }
  }
});
def('sapling', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#6b4a2a'; c.fillRect(7, 9, 2, 6);
  for (let i = 0; i < 14; i++) {
    const x = 4 + (r() * 8) | 0, y = 2 + (r() * 7) | 0;
    c.fillStyle = hex(shade([70, 130, 46], ((r() - .5) * 40) | 0)); c.fillRect(x, y, 2, 2);
  }
});
for (let st = 0; st < 4; st++) {
  def('wheat' + st, (c, r) => {
    c.clearRect(0, 0, 16, 16);
    const h = 4 + st * 3, gold = st === 3;
    for (let i = 0; i < 8; i++) {
      const x = 1 + i * 2;
      for (let y = 15; y > 15 - h; y--) {
        c.fillStyle = gold ? hex(shade([214, 182, 74], ((r() - .5) * 30) | 0)) : hex(shade([88, 150, 56], ((r() - .5) * 26) | 0));
        c.fillRect(x, y, 1, 1);
      }
      if (gold) { c.fillStyle = '#efe08a'; c.fillRect(x, 15 - h, 1, 2); }
    }
  });
}
def('farmland', (c, r) => { base(c, r, [96, 66, 42], 9); for (let x = 0; x < TILE; x += 4) for (let y = 0; y < TILE; y++) { c.fillStyle = hex([74, 48, 30]); c.fillRect(x, y, 1, 1); } speckle(c, r, [120, 86, 54], 8); });

// ---------- functional ----------
def('torch', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#7a5a30'; c.fillRect(7, 8, 2, 7);
  c.fillStyle = '#ffd76a'; c.fillRect(7, 5, 2, 3);
  c.fillStyle = '#ff8a2a'; c.fillRect(7, 4, 2, 2);
  c.fillStyle = '#fff3c2'; c.fillRect(7, 6, 2, 1);
});
def('glowstone', (c, r) => {
  base(c, r, [228, 188, 96], 12);
  speckle(c, r, [255, 232, 150], 22, 2);
  speckle(c, r, [196, 148, 66], 10, 2);
  speckle(c, r, [255, 250, 220], 6);
});
def('craft_top', (c, r) => {
  planksBase(c, r, [163, 129, 78]);
  c.strokeStyle = '#4a3520'; c.lineWidth = 1;
  c.strokeRect(1.5, 1.5, 13, 13);
  c.beginPath(); c.moveTo(5.5, 1); c.lineTo(5.5, 15); c.moveTo(10.5, 1); c.lineTo(10.5, 15);
  c.moveTo(1, 5.5); c.lineTo(15, 5.5); c.moveTo(1, 10.5); c.lineTo(15, 10.5); c.stroke();
});
def('craft_side', (c, r) => {
  planksBase(c, r, [143, 111, 64]);
  c.fillStyle = '#6b4e2a'; c.fillRect(2, 3, 5, 3); c.fillStyle = '#8a6a3a'; c.fillRect(9, 4, 4, 2);
  c.fillStyle = '#4a3520'; c.fillRect(2, 10, 12, 1);
});
def('furnace_side', (c, r) => {
  base(c, r, [108, 108, 114], 8);
  c.strokeStyle = '#585860'; c.strokeRect(0.5, 0.5, 15, 15);
  speckle(c, r, [88, 88, 94], 10, 2);
});
def('furnace_top', (c, r) => { defs.furnace_side(c, r); c.strokeStyle = '#484850'; c.strokeRect(3.5, 3.5, 9, 9); });
def('furnace_front', (c, r) => {
  defs.furnace_side(c, r);
  c.fillStyle = '#2a2a2e'; c.fillRect(4, 7, 8, 6);
  c.fillStyle = '#1c1c20'; c.fillRect(4, 5, 8, 2);
});
def('furnace_lit', (c, r) => {
  defs.furnace_side(c, r);
  c.fillStyle = '#1c1c20'; c.fillRect(4, 5, 8, 2);
  c.fillStyle = '#ff7a1e'; c.fillRect(4, 7, 8, 6);
  c.fillStyle = '#ffc84a'; c.fillRect(5, 9, 6, 3);
  c.fillStyle = '#fff0a8'; c.fillRect(6, 10, 4, 1);
});
def('chest_side', (c, r) => {
  base(c, r, [146, 102, 52], 8);
  c.fillStyle = '#5f4526'; c.fillRect(0, 5, 16, 1);
  c.strokeStyle = '#3f2f18'; c.strokeRect(0.5, 0.5, 15, 15);
});
def('chest_top', (c, r) => { defs.chest_side(c, r); c.fillStyle = '#8a6a3a'; c.fillRect(7, 6, 2, 4); });
def('chest_front', (c, r) => {
  defs.chest_side(c, r);
  c.fillStyle = '#c9c9cf'; c.fillRect(7, 4, 2, 4);
  c.fillStyle = '#8f8f97'; c.fillRect(7, 6, 2, 2);
});
def('bed_top', (c, r) => {
  base(c, r, [166, 48, 52], 8);
  c.fillStyle = '#e8e8ee'; c.fillRect(0, 0, 16, 5);
  c.fillStyle = '#d0d0da'; c.fillRect(0, 4, 16, 1);
  c.fillStyle = '#8e2a30'; c.fillRect(0, 10, 16, 1);
});
def('ladder', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#8a6a3a'; c.fillRect(2, 0, 2, 16); c.fillRect(12, 0, 2, 16);
  for (let y = 2; y < 16; y += 4) { c.fillStyle = '#a3824c'; c.fillRect(3, y, 10, 2); }
});
def('lever', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#6e6e74'; c.fillRect(5, 12, 6, 3);
  c.fillStyle = '#7a5a30'; c.save(); c.translate(8, 12); c.rotate(-0.5); c.fillRect(-1, -9, 2, 9); c.restore();
  c.fillStyle = '#c33'; c.fillRect(6, 3, 2, 2);
});
def('lever_on', (c, r) => {
  defs.lever(c, r);
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#6e6e74'; c.fillRect(5, 12, 6, 3);
  c.save(); c.translate(8, 12); c.rotate(0.5); c.fillStyle = '#7a5a30'; c.fillRect(-1, -9, 2, 9); c.restore();
  c.fillStyle = '#4dff6a'; c.fillRect(9, 3, 2, 2);
});
def('wire_off', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#6e1010';
  c.fillRect(0, 7, 16, 2); c.fillRect(7, 0, 2, 16);
  c.fillStyle = '#571010'; c.fillRect(6, 6, 4, 4);
});
def('wire_on', (c, r) => {
  c.clearRect(0, 0, 16, 16);
  c.fillStyle = '#ff3a2a';
  c.fillRect(0, 7, 16, 2); c.fillRect(7, 0, 2, 16);
  c.fillStyle = '#ffb03a'; c.fillRect(6, 6, 4, 4);
  c.fillStyle = '#fff0a0'; c.fillRect(7, 7, 2, 2);
});
def('lamp_off', (c, r) => {
  base(c, r, [94, 74, 48], 8);
  c.strokeStyle = '#5a452c'; c.strokeRect(0.5, 0.5, 15, 15);
  c.fillStyle = '#7a6238'; c.fillRect(3, 3, 10, 10);
  c.fillStyle = '#8f7444'; c.fillRect(4, 4, 8, 8);
});
def('lamp_on', (c, r) => {
  base(c, r, [255, 214, 120], 10);
  c.strokeStyle = '#caa050'; c.strokeRect(0.5, 0.5, 15, 15);
  c.fillStyle = '#ffe9a8'; c.fillRect(3, 3, 10, 10);
  c.fillStyle = '#fffbe0'; c.fillRect(5, 5, 6, 6);
});
def('pumpkin_side', (c, r) => {
  base(c, r, [214, 122, 32], 9);
  for (let x = 2; x < 16; x += 4) for (let y = 0; y < 16; y++) { c.fillStyle = hex(shade([190, 100, 22], ((r() - .5) * 12) | 0)); c.fillRect(x, y, 1, 1); }
});
def('pumpkin_face', (c, r) => {
  defs.pumpkin_side(c, r);
  c.fillStyle = '#3a2408';
  c.fillRect(3, 4, 3, 2); c.fillRect(10, 4, 3, 2);
  c.fillRect(5, 8, 6, 1); c.fillRect(4, 9, 2, 2); c.fillRect(10, 9, 2, 2); c.fillRect(6, 9, 4, 3);
});
def('pumpkin_top', (c, r) => {
  base(c, r, [200, 112, 28], 8);
  c.fillStyle = '#5a7a2a'; c.fillRect(6, 6, 4, 4);
  c.fillStyle = '#7a9a3a'; c.fillRect(7, 7, 2, 2);
});
def('bookshelf', (c, r) => {
  planksBase(c, r, [163, 129, 78]);
  const books = ['#a33b2e', '#2e63a3', '#3ba34a', '#b8912e', '#7a3ba3'];
  for (const rowY of [2, 9]) {
    let x = 1;
    while (x < 14) {
      const w = 1 + (r() * 2 | 0);
      c.fillStyle = books[(r() * books.length) | 0];
      c.fillRect(x, rowY, w, 5);
      x += w + (r() < .25 ? 1 : 0);
    }
  }
});
def('cactus_side', (c, r) => {
  base(c, r, [64, 128, 56], 8);
  for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) { c.fillStyle = hex(shade([48, 104, 44], ((r() - .5) * 10) | 0)); c.fillRect(x, y, 1, 1); }
  c.fillStyle = '#e8e8c8'; for (let y = 1; y < 16; y += 4) { c.fillRect(3, y, 1, 1); c.fillRect(8, y + 2, 1, 1); c.fillRect(13, y, 1, 1); }
});
def('cactus_top', (c, r) => { base(c, r, [74, 142, 62], 8); c.fillStyle = '#3f7a36'; c.strokeRect(2.5, 2.5, 11, 11); speckle(c, r, [96, 162, 80], 6); });

// crack decals
for (let s = 0; s < 10; s++) {
  def('crack' + s, (c, r) => {
    c.clearRect(0, 0, 16, 16);
    const n = 6 + s * 7;
    for (let i = 0; i < n; i++) {
      let x = 2 + (r() * 12) | 0, y = 2 + (r() * 12) | 0;
      const len = 2 + (r() * 4) | 0;
      for (let k = 0; k < len; k++) {
        c.fillStyle = 'rgba(20,14,10,0.85)';
        c.fillRect(x % 16, y % 16, 1, 1);
        x += (r() * 3 | 0) - 1; y += (r() * 3 | 0) - 1;
      }
    }
  });
}

export function buildAtlas() {
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = SIZE; atlasCanvas.height = SIZE;
  const actx = atlasCanvas.getContext('2d');
  actx.imageSmoothingEnabled = false;

  const names = Object.keys(defs);
  names.forEach((name, i) => {
    TILES[name] = i;
    const [cv, ctx] = mkCtx();
    const rnd = rngFor(name);
    defs[name](ctx, rnd);
    // compute average color of opaque pixels
    const data = ctx.getImageData(0, 0, TILE, TILE).data;
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let p = 0; p < data.length; p += 4) {
      if (data[p + 3] < 40) continue;
      rr += data[p]; gg += data[p + 1]; bb += data[p + 2]; n++;
    }
    avgColors[i] = n ? [rr / n / 255, gg / n / 255, bb / n / 255] : [1, 1, 1];
    blitPadded(actx, cv, (i % GRID) * CELL, ((i / GRID) | 0) * CELL);
  });

  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blitPadded(a, tcv, cx, cy) {
  a.drawImage(tcv, cx + PAD, cy + PAD);
  a.drawImage(tcv, 0, 0, 16, 1, cx + PAD, cy, 16, PAD);
  a.drawImage(tcv, 0, 15, 16, 1, cx + PAD, cy + PAD + 16, 16, PAD);
  a.drawImage(tcv, 0, 0, 1, 16, cx, cy + PAD, PAD, 16);
  a.drawImage(tcv, 15, 0, 1, 16, cx + PAD + 16, cy + PAD, PAD, 16);
  a.drawImage(tcv, 0, 0, 1, 1, cx, cy, PAD, PAD);
  a.drawImage(tcv, 15, 0, 1, 1, cx + PAD + 16, cy, PAD, PAD);
  a.drawImage(tcv, 0, 15, 1, 1, cx, cy + PAD + 16, PAD, PAD);
  a.drawImage(tcv, 15, 15, 1, 1, cx + PAD + 16, cy + PAD + 16, PAD, PAD);
}

export function tileIndex(name) { return TILES[name] ?? 0; }

export function uvRect(idxOrName) {
  const i = typeof idxOrName === 'number' ? idxOrName : (TILES[idxOrName] || 0);
  const cx = (i % GRID) * CELL, cy = ((i / GRID) | 0) * CELL;
  const e = 0.02;
  return [
    (cx + PAD + e) / SIZE, (cy + PAD + e) / SIZE,
    (cx + PAD + TILE - e) / SIZE, (cy + PAD + TILE - e) / SIZE,
  ];
}

export function avgColor(idxOrName) {
  const i = typeof idxOrName === 'number' ? idxOrName : (TILES[idxOrName] || 0);
  return avgColors[i] || [1, 1, 1];
}

export function atlasSource() { return atlasCanvas; }
export function atlasMetrics() { return { TILE, PAD, CELL, GRID, SIZE }; }
