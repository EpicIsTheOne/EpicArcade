// Tile painters, part 2: ores, functional blocks, plants, liquids.
'use strict';
(function () {
const { shade, px, noiseFill, speckle, TILE_PX } = (typeof require !== 'undefined') ? require('./tiles1.js') : window.__req('./tiles1.js');

function clear(ctx) { ctx.clearRect(0, 0, TILE_PX, TILE_PX); }

function oreTile(oreColor, blobs, rng, ctx) {
  noiseFill(ctx, 0x8a8a8a, rng, 0.12);
  for (let i = 0; i < blobs; i++) {
    const cx = 2 + Math.floor(rng() * 12), cy = 2 + Math.floor(rng() * 12);
    const n = 3 + Math.floor(rng() * 5);
    for (let j = 0; j < n; j++) {
      const ox = cx + Math.floor(rng() * 3) - 1, oy = cy + Math.floor(rng() * 3) - 1;
      if (ox >= 0 && ox < TILE_PX && oy >= 0 && oy < TILE_PX)
        px(ctx, ox, oy, shade(oreColor, 0.75 + rng() * 0.5));
    }
  }
}

const P2 = {
  coal_ore(ctx, rng) { oreTile(0x2e2e2e, 5, rng, ctx); },
  iron_ore(ctx, rng) { oreTile(0xd8af93, 5, rng, ctx); },
  gold_ore(ctx, rng) { oreTile(0xfcee4b, 4, rng, ctx); },
  diamond_ore(ctx, rng) { oreTile(0x5decf5, 4, rng, ctx); },
  redstone_ore(ctx, rng) { oreTile(0xff2b2b, 5, rng, ctx); },
  mossy_cobble(ctx, rng) {
    // cobble base then moss
    noiseFill(ctx, 0x767676, rng, 0.08);
    const st = [[0, 0, 7, 6], [8, 0, 8, 4], [0, 7, 5, 5], [6, 5, 5, 6], [12, 5, 4, 7], [0, 13, 8, 3], [9, 12, 7, 4], [6, 12, 3, 4]];
    for (const [sx, sy, sw, sh] of st) {
      ctx.fillStyle = shade(0x8d8d8d, 0.75 + rng() * 0.45);
      ctx.fillRect(sx, sy, sw - 1, sh - 1);
      ctx.fillStyle = shade(0x555555, 1);
      ctx.fillRect(sx + sw - 1, sy, 1, sh);
      ctx.fillRect(sx, sy + sh - 1, sw, 1);
    }
    for (let i = 0; i < 42; i++) px(ctx, Math.floor(rng() * 16), Math.floor(rng() * 16), shade(0x4f7a33, 0.7 + rng() * 0.5));
  },
  stone_bricks(ctx, rng) {
    noiseFill(ctx, 0x8a8a8a, rng, 0.08);
    ctx.fillStyle = shade(0x565656, 1);
    ctx.fillRect(0, 7, 16, 1); ctx.fillRect(7, 0, 1, 8); ctx.fillRect(3, 8, 1, 8); ctx.fillRect(12, 8, 1, 8);
    ctx.fillStyle = shade(0xa0a0a0, 1);
    ctx.fillRect(0, 0, 16, 1); ctx.fillRect(8, 0, 1, 7); ctx.fillRect(4, 8, 1, 8); ctx.fillRect(13, 8, 1, 8);
  },
  bricks(ctx, rng) {
    noiseFill(ctx, 0x985443, rng, 0.10);
    ctx.fillStyle = shade(0xc9beb2, 1);
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) ? 0 : 4;
      for (let x = off; x < 16; x += 8) ctx.fillRect(x, row * 4, 1, 4);
    }
  },
  glass(ctx, rng) {
    clear(ctx);
    ctx.strokeStyle = shade(0xdcf3ff, 1);
    ctx.strokeRect(0.5, 0.5, 15, 15);
    ctx.fillStyle = 'rgba(220,240,255,0.28)';
    ctx.fillRect(2, 2, 12, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(3, 3, 4, 1); ctx.fillRect(3, 4, 1, 3);
  },
  glowstone(ctx, rng) {
    noiseFill(ctx, 0xd9a34a, rng, 0.12);
    speckle(ctx, 0xffe9a8, 22, rng, 2, 0.3);
    speckle(ctx, 0xfff6d8, 10, rng, 2, 0.05);
  },
  lantern(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x4a4a52, 1); ctx.fillRect(3, 0, 10, 2);
    ctx.fillStyle = shade(0x33333a, 1); ctx.fillRect(4, 2, 8, 1);
    ctx.fillStyle = shade(0xffc95e, 1); ctx.fillRect(4, 3, 8, 9);
    ctx.fillStyle = shade(0xfff0bd, 1); ctx.fillRect(6, 5, 4, 5);
    ctx.fillStyle = shade(0x33333a, 1); ctx.fillRect(3, 12, 10, 2);
    ctx.fillStyle = shade(0x232329, 1); ctx.fillRect(5, 14, 6, 2);
  },
  torch(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x6b502f, 1); ctx.fillRect(7, 6, 2, 9);
    ctx.fillStyle = shade(0x503a20, 1); ctx.fillRect(7, 13, 2, 2);
    ctx.fillStyle = shade(0xffd970, 1); ctx.fillRect(6, 3, 4, 4);
    ctx.fillStyle = shade(0xfff3c2, 1); ctx.fillRect(7, 4, 2, 2);
    ctx.fillStyle = shade(0xff9433, 1); ctx.fillRect(6, 2, 4, 1);
  },
  wool(ctx, rng) { noiseFill(ctx, 0xe8e8e8, rng, 0.06); speckle(ctx, 0xd8d8d8, 12, rng); },
  bookshelf(ctx, rng) {
    // planks frame + books
    noiseFill(ctx, 0xa8834f, rng, 0.10);
    ctx.fillStyle = shade(0x6e5127, 1);
    ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
    const bookCols = [0x8a3030, 0x30568a, 0x3f8a30, 0x8a7a30, 0x6a308a, 0x308a7a];
    for (const rowTop of [2, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(rng() * 2);
        const c = bookCols[Math.floor(rng() * bookCols.length)];
        ctx.fillStyle = shade(c, 0.85 + rng() * 0.3);
        ctx.fillRect(x, rowTop, w, 5);
        x += w + (rng() < 0.25 ? 1 : 0);
      }
    }
  },
  chest(ctx, rng) {
    noiseFill(ctx, 0x9a7134, rng, 0.08);
    ctx.fillStyle = shade(0x5e4420, 1);
    ctx.strokeRect(0.5, 0.5, 15, 15);
    ctx.fillRect(0, 5, 16, 1);
    ctx.fillStyle = shade(0x8a8a8a, 1); ctx.fillRect(7, 4, 2, 3);
    ctx.fillStyle = shade(0x5a5a5a, 1); ctx.fillRect(7, 6, 2, 1);
  },
  furnace(ctx, rng) {
    noiseFill(ctx, 0x7a7a7a, rng, 0.10);
    ctx.fillStyle = shade(0x4a4a4a, 1);
    ctx.fillRect(3, 8, 10, 6);
    ctx.fillStyle = shade(0x2a2a2a, 1);
    ctx.fillRect(4, 9, 8, 4);
    ctx.fillStyle = shade(0x9a9a9a, 1);
    ctx.fillRect(3, 3, 10, 1); ctx.fillRect(3, 6, 10, 1);
  },
  furnace_lit(ctx, rng) {
    noiseFill(ctx, 0x7a7a7a, rng, 0.10);
    ctx.fillStyle = shade(0x4a4a4a, 1);
    ctx.fillRect(3, 8, 10, 6);
    ctx.fillStyle = shade(0xff8c1a, 1); ctx.fillRect(4, 9, 8, 4);
    ctx.fillStyle = shade(0xffd070, 1); ctx.fillRect(5, 10, 6, 2);
    ctx.fillStyle = shade(0xfff0b0, 1); ctx.fillRect(6, 11, 4, 1);
    ctx.fillStyle = shade(0x9a9a9a, 1);
    ctx.fillRect(3, 3, 10, 1); ctx.fillRect(3, 6, 10, 1);
  },
  crafting_top(ctx, rng) {
    noiseFill(ctx, 0xa8834f, rng, 0.10);
    ctx.fillStyle = shade(0x5e4420, 1);
    ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(0, 15, 16, 1); ctx.fillRect(15, 0, 1, 16);
    ctx.fillRect(5, 1, 1, 14); ctx.fillRect(10, 1, 1, 14);
    ctx.fillRect(1, 5, 14, 1); ctx.fillRect(1, 10, 14, 1);
  },
  crafting_side(ctx, rng) {
    noiseFill(ctx, 0x9a7134, rng, 0.10);
    ctx.fillStyle = shade(0x6e5127, 1);
    ctx.fillRect(0, 4, 16, 1);
    ctx.fillStyle = shade(0x7a5a30, 1);
    ctx.fillRect(2, 6, 5, 6); ctx.fillRect(9, 6, 5, 6);
    ctx.fillStyle = shade(0x5e4420, 1);
    ctx.fillRect(2, 6, 5, 1); ctx.fillRect(9, 6, 5, 1);
  },
  spruce_log_side(ctx, rng) {
    noiseFill(ctx, 0x4a3620, rng, 0.12);
    for (let x = 0; x < TILE_PX; x += 3) {
      ctx.fillStyle = shade(0x352614, 1);
      ctx.fillRect(x + Math.floor(rng() * 2), 0, 1, TILE_PX);
    }
  },
  spruce_log_top(ctx, rng) {
    noiseFill(ctx, 0x8a6f45, rng, 0.10);
    ctx.strokeStyle = shade(0x4a3620, 1); ctx.lineWidth = 1;
    for (let r = 2; r <= 7; r += 2) { ctx.beginPath(); ctx.arc(8, 8, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeRect(0.5, 0.5, 15, 15);
  },
  spruce_leaves(ctx, rng) {
    clear(ctx);
    for (let i = 0; i < 160; i++)
      px(ctx, Math.floor(rng() * TILE_PX), Math.floor(rng() * TILE_PX), shade(0x2c5a24, 0.6 + rng() * 0.6));
  },
  birch_log_side(ctx, rng) {
    noiseFill(ctx, 0xd8d3c0, rng, 0.06);
    for (let i = 0; i < 5; i++) {
      const y = Math.floor(rng() * 16);
      ctx.fillStyle = shade(0x2a2a28, 1);
      ctx.fillRect(Math.floor(rng() * 10), y, 3 + Math.floor(rng() * 4), 1);
    }
  },
  birch_log_top(ctx, rng) {
    noiseFill(ctx, 0xc9bfa8, rng, 0.08);
    ctx.strokeStyle = shade(0x9a9078, 1);
    for (let r = 3; r <= 7; r += 2) { ctx.beginPath(); ctx.arc(8, 8, r, 0, Math.PI * 2); ctx.stroke(); }
  },
  birch_leaves(ctx, rng) {
    clear(ctx);
    for (let i = 0; i < 160; i++)
      px(ctx, Math.floor(rng() * TILE_PX), Math.floor(rng() * TILE_PX), shade(0x5f9a3a, 0.6 + rng() * 0.6));
  },
  tallgrass(ctx, rng) {
    clear(ctx);
    for (let i = 0; i < 9; i++) {
      const x = 2 + Math.floor(rng() * 12);
      const h = 5 + Math.floor(rng() * 9);
      const c = shade(0x4f9a2c, 0.8 + rng() * 0.4);
      for (let y = 15; y > 15 - h; y--) px(ctx, x + ((y % 3 === 0) ? 1 : 0), y, c);
    }
  },
  flower_red(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x3f7a24, 1); ctx.fillRect(7, 8, 1, 8);
    ctx.fillStyle = shade(0x57a032, 1); ctx.fillRect(5, 11, 2, 1); ctx.fillRect(8, 13, 2, 1);
    ctx.fillStyle = shade(0xd8302a, 1);
    ctx.fillRect(6, 4, 3, 3); ctx.fillRect(5, 5, 5, 1); ctx.fillRect(7, 3, 1, 5);
    ctx.fillStyle = shade(0xffd050, 1); ctx.fillRect(7, 5, 1, 1);
  },
  flower_yellow(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x3f7a24, 1); ctx.fillRect(8, 8, 1, 8);
    ctx.fillStyle = shade(0x57a032, 1); ctx.fillRect(6, 12, 2, 1);
    ctx.fillStyle = shade(0xf7d028, 1);
    ctx.fillRect(7, 4, 3, 3); ctx.fillRect(6, 5, 5, 1); ctx.fillRect(8, 3, 1, 5);
    ctx.fillStyle = shade(0xb08010, 1); ctx.fillRect(8, 5, 1, 1);
  },
  sapling(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x5e4420, 1); ctx.fillRect(7, 9, 1, 7);
    ctx.fillStyle = shade(0x3f8a2c, 1);
    ctx.fillRect(5, 5, 5, 4); ctx.fillRect(6, 3, 3, 2); ctx.fillRect(4, 7, 7, 2);
    ctx.fillStyle = shade(0x57c23a, 1); ctx.fillRect(6, 5, 2, 2);
  },
  farmland(ctx, rng) {
    noiseFill(ctx, 0x5e4029, rng, 0.16);
    ctx.fillStyle = shade(0x3f2b1a, 1);
    ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 11, 16, 1); ctx.fillRect(0, 15, 16, 1);
  },
  wheat0(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x4f9a2c, 1);
    for (const x of [3, 7, 11]) ctx.fillRect(x, 12, 1, 4);
  },
  wheat1(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x5faa34, 1);
    for (const x of [3, 7, 11]) ctx.fillRect(x, 8, 1, 8);
    ctx.fillStyle = shade(0x74c93f, 1);
    ctx.fillRect(2, 10, 1, 2); ctx.fillRect(8, 9, 1, 2); ctx.fillRect(12, 11, 1, 2);
  },
  wheat2(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x9ab040, 1);
    for (const x of [2, 6, 10, 14]) ctx.fillRect(x, 5, 1, 11);
    ctx.fillStyle = shade(0xc9d060, 1);
    for (const x of [2, 6, 10, 14]) ctx.fillRect(x, 4, 1, 3);
  },
  wheat3(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0xc9b040, 1);
    for (const x of [2, 6, 10, 14]) ctx.fillRect(x, 3, 1, 13);
    ctx.fillStyle = shade(0xe8d860, 1);
    for (const x of [2, 6, 10, 14]) { ctx.fillRect(x - 1, 1, 3, 4); ctx.fillRect(x, 0, 1, 1); }
  },
  wire_off(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x8a1010, 1);
    ctx.fillRect(0, 7, 16, 2);
    ctx.fillRect(7, 0, 2, 16);
  },
  wire_on(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0xff2020, 1);
    ctx.fillRect(0, 7, 16, 2);
    ctx.fillRect(7, 0, 2, 16);
    ctx.fillStyle = shade(0xff9060, 1);
    ctx.fillRect(0, 7, 16, 1);
  },
  lever(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x767676, 1); ctx.fillRect(5, 12, 6, 4);
    ctx.fillStyle = shade(0x6b502f, 1);
    ctx.save();
    ctx.translate(8, 13); ctx.rotate(-0.5);
    ctx.fillRect(-1, -9, 2, 9);
    ctx.restore();
  },
  lever_on(ctx, rng) {
    clear(ctx);
    ctx.fillStyle = shade(0x767676, 1); ctx.fillRect(5, 12, 6, 4);
    ctx.fillStyle = shade(0x8a6a3f, 1);
    ctx.save();
    ctx.translate(8, 13); ctx.rotate(0.5);
    ctx.fillRect(-1, -9, 2, 9);
    ctx.restore();
  },
  lamp_off(ctx, rng) {
    noiseFill(ctx, 0x6a4a2a, rng, 0.10);
    ctx.fillStyle = shade(0x3f2b16, 1);
    ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
    ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
    ctx.fillRect(4, 4, 8, 8);
  },
  lamp_on(ctx, rng) {
    noiseFill(ctx, 0xd9a34a, rng, 0.12);
    speckle(ctx, 0xffe9a8, 16, rng, 2, 0.3);
    ctx.fillStyle = shade(0x8a5f28, 1);
    ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
    ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
  },
  cactus_side(ctx, rng) {
    noiseFill(ctx, 0x3f7a2c, rng, 0.10);
    ctx.fillStyle = shade(0x2a5a1c, 1);
    ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
    ctx.fillStyle = shade(0x57a03a, 1);
    ctx.fillRect(2, 0, 1, 16);
    for (let i = 0; i < 4; i++) px(ctx, 8, 2 + i * 4, shade(0xdfe8d0, 1));
  },
  cactus_top(ctx, rng) {
    noiseFill(ctx, 0x4a8a34, rng, 0.10);
    ctx.strokeStyle = shade(0x2a5a1c, 1); ctx.strokeRect(0.5, 0.5, 15, 15);
  },
  water_still(ctx, rng) {
    noiseFill(ctx, 0x3f76e8, rng, 0.06);
    ctx.fillStyle = shade(0x5f8ff5, 1);
    for (let i = 0; i < 5; i++) ctx.fillRect(0, Math.floor(rng() * 16), 16, 1);
  },
  lava_still(ctx, rng) {
    noiseFill(ctx, 0xd85a18, rng, 0.15);
    speckle(ctx, 0xffc030, 14, rng, 3, 0.2);
    speckle(ctx, 0x9a2a08, 10, rng, 3, 0.2);
  },
  bed_top(ctx, rng) {
    clear(ctx);
    // pillow + red blanket (top view)
    ctx.fillStyle = shade(0xf2f2f2, 1); ctx.fillRect(1, 1, 14, 5);
    ctx.fillStyle = shade(0xd8d8d8, 1); ctx.fillRect(1, 5, 14, 1);
    ctx.fillStyle = shade(0xa02a3a, 1); ctx.fillRect(0, 6, 16, 9);
    ctx.fillStyle = shade(0xc03848, 1); ctx.fillRect(1, 7, 14, 2);
    ctx.fillStyle = shade(0x6b502f, 1);
    ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
  },
  bed_side(ctx, rng) {
    noiseFill(ctx, 0xa8834f, rng, 0.08);
    ctx.fillStyle = shade(0x5e4420, 1); ctx.fillRect(0, 12, 16, 1);
    for (let x = 2; x < 16; x += 5) { ctx.fillStyle = shade(0x503a20, 1); ctx.fillRect(x, 13, 2, 3); }
    ctx.fillStyle = shade(0xa02a3a, 1); ctx.fillRect(0, 3, 16, 9);
    ctx.fillStyle = shade(0xc03848, 1); ctx.fillRect(0, 3, 16, 2);
    ctx.fillStyle = shade(0xf2f2f2, 1); ctx.fillRect(0, 0, 16, 3);
    ctx.fillStyle = shade(0xd8d8d8, 1); ctx.fillRect(0, 2, 16, 1);
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = { P2 };
if (typeof self !== 'undefined') self.TILES2_MOD = { P2 };
})();
