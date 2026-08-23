// Tile painters, part 1: terrain materials. Each paints a 16x16 tile.
'use strict';
(function () {
const TILE_PX = 16;
function shade(hex, f) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function px(ctx, x, y, c, s) { ctx.fillStyle = c; ctx.fillRect(x, y, s || 1, s || 1); }
function noiseFill(ctx, base, rng, variation) {
  const v = variation === undefined ? 0.12 : variation;
  for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++)
    px(ctx, x, y, shade(base, 1 - v / 2 + rng() * v));
}
function speckle(ctx, color, count, rng, sMax, brightVar) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * TILE_PX), y = Math.floor(rng() * TILE_PX);
    const s = 1 + Math.floor(rng() * (sMax || 2));
    ctx.fillStyle = shade(color, 0.8 + rng() * (brightVar === undefined ? 0.25 : brightVar));
    ctx.fillRect(x, y, s, s);
  }
}

const P1 = {
  stone(ctx, rng) { noiseFill(ctx, 0x8a8a8a, rng, 0.14); speckle(ctx, 0x6f6f6f, 14, rng); },
  dirt(ctx, rng) { noiseFill(ctx, 0x79553a, rng, 0.18); speckle(ctx, 0x5e4029, 12, rng); speckle(ctx, 0x8f6b48, 8, rng); },
  grass_top(ctx, rng) { noiseFill(ctx, 0x59a52c, rng, 0.20); speckle(ctx, 0x74c93f, 16, rng); speckle(ctx, 0x46821f, 12, rng); },
  grass_side(ctx, rng) {
    noiseFill(ctx, 0x79553a, rng, 0.18);
    for (let x = 0; x < TILE_PX; x++) {
      const d = 3 + Math.floor(rng() * 3);
      for (let y = 0; y < d; y++) px(ctx, x, y, shade(0x59a52c, 0.85 + rng() * 0.35));
    }
  },
  cobblestone(ctx, rng) {
    noiseFill(ctx, 0x767676, rng, 0.08);
    const st = [[0, 0, 7, 6], [8, 0, 8, 4], [0, 7, 5, 5], [6, 5, 5, 6], [12, 5, 4, 7], [0, 13, 8, 3], [9, 12, 7, 4], [6, 12, 3, 4]];
    for (const [sx, sy, sw, sh] of st) {
      ctx.fillStyle = shade(0x8d8d8d, 0.75 + rng() * 0.45);
      ctx.fillRect(sx, sy, sw - 1, sh - 1);
      ctx.fillStyle = shade(0x555555, 1);
      ctx.fillRect(sx + sw - 1, sy, 1, sh);
      ctx.fillRect(sx, sy + sh - 1, sw, 1);
    }
  },
  planks(ctx, rng) {
    noiseFill(ctx, 0xa8834f, rng, 0.10);
    for (let y = 0; y < TILE_PX; y += 4) {
      ctx.fillStyle = shade(0x6e5127, 1);
      ctx.fillRect(0, y, TILE_PX, 1);
      for (let x = 0; x < TILE_PX; x++) if (rng() < 0.18) px(ctx, x, y + 1 + Math.floor(rng() * 3), shade(0x8f6b3d, 1));
    }
    px(ctx, 5, 1, shade(0x6e5127, 1)); px(ctx, 11, 5, shade(0x6e5127, 1));
    px(ctx, 3, 9, shade(0x6e5127, 1)); px(ctx, 9, 13, shade(0x6e5127, 1));
  },
  log_side(ctx, rng) {
    noiseFill(ctx, 0x6b502f, rng, 0.10);
    for (let x = 0; x < TILE_PX; x += 3) {
      ctx.fillStyle = shade(0x503a20, 1);
      ctx.fillRect(x + Math.floor(rng() * 2), 0, 1, TILE_PX);
    }
    speckle(ctx, 0x7d6238, 10, rng);
  },
  log_top(ctx, rng) {
    noiseFill(ctx, 0xb08d55, rng, 0.10);
    ctx.strokeStyle = shade(0x6b502f, 1); ctx.lineWidth = 1;
    for (let r = 2; r <= 7; r += 2) { ctx.beginPath(); ctx.arc(8, 8, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = shade(0x503a20, 1);
    ctx.strokeRect(0.5, 0.5, 15, 15);
  },
  leaves(ctx, rng) {
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    for (let i = 0; i < 150; i++)
      px(ctx, Math.floor(rng() * TILE_PX), Math.floor(rng() * TILE_PX), shade(0x3d7a1e, 0.65 + rng() * 0.6));
    for (let i = 0; i < 26; i++)
      px(ctx, Math.floor(rng() * TILE_PX), Math.floor(rng() * TILE_PX), shade(0x294d13, 0.9 + rng() * 0.4));
  },
  sand(ctx, rng) { noiseFill(ctx, 0xdcd0a2, rng, 0.09); speckle(ctx, 0xc9ba85, 10, rng); },
  bedrock(ctx, rng) {
    noiseFill(ctx, 0x454545, rng, 0.25);
    speckle(ctx, 0x222222, 22, rng, 3); speckle(ctx, 0x666666, 14, rng, 3);
  },
  gravel(ctx, rng) {
    noiseFill(ctx, 0x807b77, rng, 0.14);
    speckle(ctx, 0x9a948e, 18, rng, 3); speckle(ctx, 0x5d5854, 16, rng, 3);
  },
  snow(ctx, rng) { noiseFill(ctx, 0xf2f6fa, rng, 0.05); },
  snow_side(ctx, rng) {
    noiseFill(ctx, 0x79553a, rng, 0.18);
    for (let x = 0; x < TILE_PX; x++) {
      const d = 3 + Math.floor(rng() * 3);
      for (let y = 0; y < d; y++) px(ctx, x, y, shade(0xf2f6fa, 0.94 + rng() * 0.08));
    }
  },
  ice(ctx, rng) {
    noiseFill(ctx, 0x9fc8ee, rng, 0.08);
    ctx.strokeStyle = shade(0xcde6fa, 1);
    for (let i = 0; i < 4; i++) {
      const x = rng() * 16, y = rng() * 16;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 10 - 5, y + rng() * 10 - 5); ctx.stroke();
    }
  },
  sandstone(ctx, rng) {
    noiseFill(ctx, 0xd8cc96, rng, 0.07);
    ctx.fillStyle = shade(0xbfb17a, 1);
    ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1);
    speckle(ctx, 0xe6dcab, 8, rng);
  },
  clay(ctx, rng) { noiseFill(ctx, 0x9aa3b1, rng, 0.09); speckle(ctx, 0x7f8795, 10, rng); },
  obsidian(ctx, rng) {
    noiseFill(ctx, 0x17121f, rng, 0.35);
    speckle(ctx, 0x3a2b55, 12, rng, 2, 0.6);
    speckle(ctx, 0x0a0710, 10, rng, 2);
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = { P1, shade, px, noiseFill, speckle, TILE_PX };
if (typeof self !== 'undefined') self.TILES1_MOD = { P1, shade, px, noiseFill, speckle, TILE_PX };
})();
