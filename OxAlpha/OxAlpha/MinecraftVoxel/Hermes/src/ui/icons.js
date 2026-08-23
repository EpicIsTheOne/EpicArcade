// Item icons: draw block previews (fake-iso cube) or item sprites into canvases.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { BLOCKS, ITEMS, TOOL_MATS, TOOL_KINDS } = (() => { const m = __RQ('../shared/blocks.js'); return m; })();
const { TILE_INDEX, TILE_NAMES } = __RQ('../shared/atlas_meta.js');
const ATLAS_COLS = 8;

/** Draw an item icon at 32x32 logical px onto ctx (already sized). */
function drawItemIcon(ctx, id, sizePx) {
  const S = sizePx || 32;
  ctx.clearRect(0, 0, S, S);
  ctx.imageSmoothingEnabled = false;
  const it = ITEMS[id];
  if (!it) return;
  if (it.block !== undefined && BLOCKS[it.block]) {
    const def = BLOCKS[it.block];
    if (def.cross) { drawFlatTile(ctx, def.tex.all || 'tallgrass', S); return; }
    drawIsoCube(ctx, def, S);
    return;
  }
  // non-block items
  if (it.tool) { drawTool(ctx, it, S); return; }
  drawItemSprite(ctx, id, S);
}

function tileCanvas(tileName) {
  const idx = TILE_INDEX[tileName] || 0;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const atlas = window.__atlasCanvas;
  if (atlas) g.drawImage(atlas, (idx % ATLAS_COLS) * 16, Math.floor(idx / ATLAS_COLS) * 16, 16, 16, 0, 0, 16, 16);
  return c;
}

function drawFlatTile(ctx, tileName, S) {
  const t = tileCanvas(tileName);
  ctx.drawImage(t, 2, 2, S - 4, S - 4);
}

function drawIsoCube(ctx, def, S) {
  const topT = tileCanvas(def.tex.top || def.tex.all || 'stone');
  const sideT = tileCanvas(def.tex.side || def.tex.all || 'stone');
  const s = S;
  const cx = s / 2;
  const w = s * 0.42;         // half-width of diamond
  const hh = w * 0.5;          // half-height of diamond
  const topY = s * 0.24;
  const sideH = s * 0.46;
  // top face
  ctx.save();
  ctx.translate(cx, topY + hh);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  ctx.drawImage(topT, -w / 1.414, -w / 1.414, (w * 1.414), (w * 1.414));
  ctx.restore();
  // left face
  ctx.save();
  ctx.translate(cx - w, topY + hh * 2);
  ctx.transform(1, 0.5, 0, 1.22, 0, 0);
  ctx.filter = 'brightness(0.72)';
  ctx.drawImage(sideT, 0, 0, w, sideH / 0.9);
  ctx.restore();
  // right face
  ctx.save();
  ctx.translate(cx, topY + hh * 2 + w * 0.5);
  ctx.transform(1, -0.5, 0, 1.22, 0, 0);
  ctx.filter = 'brightness(0.55)';
  ctx.drawImage(sideT, 0, 0, w, sideH / 0.9);
  ctx.restore();
  ctx.filter = 'none';
}

function drawTool(ctx, it, S) {
  // find material color
  let mi = 0, ki = 0;
  TOOL_MATS.forEach((m, i) => { if (it.name.startsWith(m)) mi = i; });
  TOOL_KINDS.forEach((k, i) => { if (it.name.endsWith(k)) ki = i; });
  const headCols = ['#8a6a3f', '#8a8a8a', '#d8d8e2', '#fce45c', '#5ce8ea'];
  const head = headCols[mi];
  const stick = '#6b502f';
  const u = S / 16;
  ctx.save();
  ctx.translate(u * 2, u * 1.2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = stick;
  ctx.fillRect(6.6 * u, 3 * u, 1.7 * u, 11 * u);
  ctx.fillStyle = head;
  switch (TOOL_KINDS[ki]) {
    case 'pickaxe':
      ctx.fillRect(3.4 * u, 1.4 * u, 8 * u, 1.9 * u);
      ctx.fillRect(2.6 * u, 2.6 * u, 1.6 * u, 2.4 * u);
      ctx.fillRect(10.6 * u, 2.6 * u, 1.6 * u, 2.4 * u);
      break;
    case 'axe':
      ctx.fillRect(6.6 * u, 1.2 * u, 4.6 * u, 4 * u);
      ctx.fillRect(5.4 * u, 2.2 * u, 1.6 * u, 3 * u);
      break;
    case 'shovel':
      ctx.fillRect(5.8 * u, 1 * u, 3.4 * u, 4.4 * u);
      break;
    case 'sword':
      ctx.fillStyle = stick;
      ctx.fillRect(7 * u, 8.4 * u, 1.2 * u, 3.4 * u);
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(5.4 * u, 7.6 * u, 4.6 * u, 1.3 * u);
      ctx.fillStyle = head;
      ctx.fillRect(6.8 * u, 1 * u, 1.6 * u, 7 * u);
      break;
    case 'hoe':
      ctx.fillRect(6.6 * u, 1.2 * u, 4 * u, 1.6 * u);
      break;
  }
  ctx.restore();
}

const SPRITES = {
  256: (ctx, u) => { // stick
    ctx.strokeStyle = '#6b502f'; ctx.lineWidth = 1.8 * u;
    ctx.beginPath(); ctx.moveTo(11 * u, 2 * u); ctx.lineTo(5 * u, 14 * u); ctx.stroke();
  },
  257: (ctx, u) => { // coal
    ctx.fillStyle = '#262626';
    ctx.beginPath(); ctx.arc(8 * u, 8 * u, 4.6 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#424242'; ctx.fillRect(6 * u, 6 * u, 2 * u, 2 * u);
  },
  258: (ctx, u) => { // iron ingot
    ctx.fillStyle = '#d8d8e2'; ctx.fillRect(3 * u, 6 * u, 10 * u, 5 * u);
    ctx.fillStyle = '#f2f2f8'; ctx.fillRect(3 * u, 6 * u, 10 * u, 1.6 * u);
  },
  259: (ctx, u) => {
    ctx.fillStyle = '#fce45c'; ctx.fillRect(3 * u, 6 * u, 10 * u, 5 * u);
    ctx.fillStyle = '#fff3a8'; ctx.fillRect(3 * u, 6 * u, 10 * u, 1.6 * u);
  },
  260: (ctx, u) => { // diamond
    ctx.fillStyle = '#5ce8ea';
    ctx.beginPath();
    ctx.moveTo(8 * u, 2 * u); ctx.lineTo(13.4 * u, 7 * u); ctx.lineTo(8 * u, 14 * u); ctx.lineTo(2.6 * u, 7 * u);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b0f7fa'; ctx.beginPath();
    ctx.moveTo(8 * u, 3.4 * u); ctx.lineTo(10.6 * u, 6.6 * u); ctx.lineTo(8 * u, 8 * u); ctx.lineTo(5.4 * u, 6.6 * u);
    ctx.closePath(); ctx.fill();
  },
  261: (ctx, u) => { // redstone dust pile
    ctx.fillStyle = '#c81e1e';
    ctx.beginPath(); ctx.arc(8 * u, 10 * u, 4 * u, Math.PI, 0); ctx.fill();
    ctx.fillRect(4 * u, 10 * u, 8 * u, 2 * u);
  },
  262: (ctx, u) => { // apple
    ctx.fillStyle = '#d0342c';
    ctx.beginPath(); ctx.arc(8 * u, 9.4 * u, 4.6 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(7.6 * u, 2.4 * u, 0.9 * u, 3 * u);
    ctx.fillStyle = '#57a032'; ctx.fillRect(8.4 * u, 3 * u, 2.8 * u, 1.6 * u);
    ctx.fillStyle = '#ff9a90'; ctx.fillRect(5.4 * u, 7.4 * u, 1.6 * u, 1.4 * u);
  },
  263: (ctx, u) => { // wheat
    ctx.strokeStyle = '#c9b040'; ctx.lineWidth = 1.1 * u;
    for (const x of [5, 8, 11]) {
      ctx.beginPath(); ctx.moveTo(x * u, 14 * u); ctx.lineTo(x * u, 4 * u); ctx.stroke();
      ctx.fillStyle = '#e8d860'; ctx.fillRect((x - 1) * u, 3 * u, 2 * u, 2.4 * u);
    }
  },
  264: (ctx, u) => { // seeds
    ctx.fillStyle = '#3f7a24';
    for (const [x, y] of [[6, 6], [10, 5], [8, 9], [5, 11], [11, 10]]) {
      ctx.beginPath(); ctx.ellipse(x * u, y * u, 1.4 * u, 0.9 * u, 0.6, 0, 7); ctx.fill();
    }
  },
  265: (ctx, u) => { // bread
    ctx.fillStyle = '#b8863f';
    ctx.beginPath(); ctx.ellipse(8 * u, 8 * u, 5.6 * u, 3.4 * u, -0.35, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8a95c'; ctx.fillRect(5 * u, 6 * u, 6 * u, 1.4 * u);
  },
  266: (ctx, u) => { // flint
    ctx.fillStyle = '#2a2a30';
    ctx.beginPath(); ctx.moveTo(4 * u, 12 * u); ctx.lineTo(7 * u, 4 * u); ctx.lineTo(12 * u, 6 * u); ctx.lineTo(10 * u, 12 * u);
    ctx.closePath(); ctx.fill();
  },
  267: (ctx, u) => { // clay ball
    ctx.fillStyle = '#9aa3b1';
    ctx.beginPath(); ctx.arc(8 * u, 9 * u, 4.4 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#b8c1cf'; ctx.beginPath(); ctx.arc(6.6 * u, 7.6 * u, 1.4 * u, 0, 7); ctx.fill();
  },
  268: (ctx, u) => { // brick item
    ctx.fillStyle = '#985443'; ctx.fillRect(3 * u, 7 * u, 10 * u, 5 * u);
    ctx.fillStyle = '#b06a56'; ctx.fillRect(3 * u, 7 * u, 10 * u, 1.4 * u);
  },
  270: (ctx, u) => { // raw beef
    ctx.fillStyle = '#c94f4f';
    ctx.beginPath(); ctx.ellipse(8 * u, 8 * u, 5 * u, 3.4 * u, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8a0a0'; ctx.fillRect(5.4 * u, 6.6 * u, 3 * u, 2 * u);
  },
  271: (ctx, u) => { // steak
    ctx.fillStyle = '#7a4028';
    ctx.beginPath(); ctx.ellipse(8 * u, 8 * u, 5 * u, 3.4 * u, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a5a36'; ctx.fillRect(5.4 * u, 6.6 * u, 3.4 * u, 2.2 * u);
  },
  272: (ctx, u) => { // raw pork
    ctx.fillStyle = '#e89aa0';
    ctx.beginPath(); ctx.ellipse(8 * u, 8 * u, 5 * u, 3.6 * u, -0.25, 0, 7); ctx.fill();
  },
  273: (ctx, u) => { // cooked pork
    ctx.fillStyle = '#b87f4a';
    ctx.beginPath(); ctx.ellipse(8 * u, 8 * u, 5 * u, 3.6 * u, -0.25, 0, 7); ctx.fill();
  },
};

function drawItemSprite(ctx, id, S) {
  const fn = SPRITES[id];
  const u = S / 16;
  if (fn) fn(ctx, u);
  else { ctx.fillStyle = '#f0f'; ctx.fillRect(4 * u, 4 * u, 8 * u, 8 * u); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { drawItemIcon };
if (typeof self !== 'undefined') self.ICONS_MOD = { drawItemIcon };
})();
