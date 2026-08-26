// STARWOVEN — procedural art: portraits, field sprites, enemies, fx helpers.
// All character looks derive from js/data.js art params -> consistency by construction.
"use strict";
import { ELEMENTS } from './data.js';

// ---------- tiny helpers -----------------------------------------------------
export function glow(ctx, x, y, r, color, a = .5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
export function starPath(ctx, x, y, R, r, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? R : r, a = rot + i * Math.PI / 4;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}
export function sigil(ctx, x, y, s, color, lw = 2, alpha = .9) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
  starPath(ctx, x, y, s, s * .38);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, s * 1.5, Math.PI * .15, Math.PI * .85);
  ctx.beginPath(); ctx.arc(x, y, s * 1.5, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
}
function shade(hex, f) { // f<0 darken, f>0 lighten
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- PORTRAIT ---------------------------------------------------------
// Draws an anime bust into rect (x,y,w,h). Deterministic per character.
export function drawPortrait(canvas, char, opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const A = char.art, E = ELEMENTS[char.element];
  ctx.clearRect(0, 0, W, H);

  // backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#191236'); bg.addColorStop(1, '#0d0a20');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  glow(ctx, W / 2, H * .42, W * .55, shade(E.color, -.25), .5);
  // drifting motes
  let sr = 1234 + char.id.length * 77;
  const rnd = () => { sr = (sr * 16807) % 2147483647; return sr / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const mx = rnd() * W, my = rnd() * H, mr = rnd() * 2 + .5;
    ctx.globalAlpha = .12 + rnd() * .3;
    ctx.fillStyle = i % 3 ? '#fff' : E.color;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  sigil(ctx, W * .82, H * .16, W * .06, E.color, 2, .35);

  const cx = W / 2, headR = W * .21, hy = H * .40;

  // --- accessories behind ---
  if (A.accessories.includes('harp-halo')) {
    ctx.save();
    ctx.strokeStyle = '#e8c66a'; ctx.lineWidth = W * .012;
    ctx.beginPath(); ctx.ellipse(cx, hy - headR * .15, headR * 1.75, headR * 1.45, -.18, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * headR * .32 + headR * 1.1, hy - headR * .95);
      ctx.quadraticCurveTo(cx + i * headR * .38, hy + headR * .2, cx + i * headR * .30 + headR * .55, hy + headR * 1.05);
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, cx, hy, headR * 2.1, 'rgba(232,198,106,.35)', .5);
  }
  if (A.accessories.includes('orbit-chains')) {
    ctx.strokeStyle = 'rgba(180,140,255,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, hy + headR * .3, headR * 1.9, headR * .7, .35, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = i * 1.256 + .5; starPath(ctx, cx + Math.cos(a) * headR * 1.9, hy + headR * .3 + Math.sin(a) * headR * .7, 5, 2); ctx.fillStyle = '#cabdf2'; ctx.fill(); }
  }

  // --- BACK HAIR ---
  drawBackHair(ctx, cx, hy, headR, A);

  // --- BODY (shoulders/coat) ---
  const shY = hy + headR * 1.72;
  ctx.fillStyle = A.outfit2;
  ctx.beginPath();
  ctx.moveTo(cx - W * .34, H);
  ctx.quadraticCurveTo(cx - W * .30, shY + headR * .2, cx - headR * .78, shY - headR * .28);
  ctx.lineTo(cx + headR * .78, shY - headR * .28);
  ctx.quadraticCurveTo(cx + W * .30, shY + headR * .2, cx + W * .34, H);
  ctx.closePath(); ctx.fill();
  // coat overlay
  ctx.fillStyle = A.outfit;
  ctx.beginPath();
  ctx.moveTo(cx - W * .17, H);
  ctx.quadraticCurveTo(cx - W * .14, shY + headR * .5, cx - headR * .62, shY - headR * .22);
  ctx.lineTo(cx + headR * .62, shY - headR * .22);
  ctx.quadraticCurveTo(cx + W * .14, shY + headR * .5, cx + W * .17, H);
  ctx.closePath(); ctx.fill();
  // collar V + accent trim
  ctx.strokeStyle = A.accent; ctx.lineWidth = W * .010;
  ctx.beginPath(); ctx.moveTo(cx - headR * .5, shY - headR * .18); ctx.lineTo(cx, shY + headR * .85); ctx.lineTo(cx + headR * .5, shY - headR * .18); ctx.stroke();

  // chest accessories
  if (A.accessories.includes('belt-stars')) {
    ctx.strokeStyle = '#3a2016'; ctx.lineWidth = W * .02;
    ctx.beginPath(); ctx.moveTo(cx - W * .13, H * .88); ctx.lineTo(cx + W * .13, H * .84); ctx.stroke();
    for (let i = -1; i <= 1; i++) { starPath(ctx, cx + i * W * .075, H * .86 - i * H * .008, W * .018, W * .007); ctx.fillStyle = '#ffd76b'; ctx.fill(); }
  }
  if (A.accessories.includes('crest')) { starPath(ctx, cx + W * .10, H * .80, W * .022, W *.009); ctx.fillStyle = '#79d97c'; ctx.fill(); }
  if (A.accessories.includes('furnace-pendant')) { glow(ctx, cx, H * .84, W * .04, '#ff6b57', .8); ctx.fillStyle = '#ff8a5e'; ctx.beginPath(); ctx.arc(cx, H * .84, W*.012, 0, 7); ctx.fill(); }
  if (A.accessories.includes('whale-tooth')) { ctx.strokeStyle = '#d8cfc0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx-W*.03,H*.76); ctx.quadraticCurveTo(cx,H*.90,cx+W*.03,H*.76); ctx.stroke(); ctx.fillStyle='#efe6d2'; ctx.beginPath(); ctx.moveTo(cx, H*.87); ctx.lineTo(cx+W*.014,H*.92); ctx.lineTo(cx-W*.014,H*.92); ctx.closePath(); ctx.fill(); }
  if (A.accessories.includes('rope-belt')) { ctx.strokeStyle = '#caa46a'; ctx.lineWidth = W*.014; ctx.beginPath(); ctx.moveTo(cx-W*.15,H*.83); ctx.lineTo(cx+W*.15,H*.89); ctx.stroke(); }
  if (A.accessories.includes('net-sash')) { ctx.strokeStyle='rgba(220,235,245,.5)'; ctx.lineWidth=1.5; for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(cx-W*.24+i*W*.03,H);ctx.quadraticCurveTo(cx-W*.20,H*.86,cx-W*.08,H*.79);ctx.stroke();} }
  if (A.accessories.includes('feather-clasp')) { drawFeather(ctx, cx - W*.11, H*.80, W*.045, '#b48cff'); }
  if (A.accessories.includes('sail-pin')) { ctx.fillStyle='#dff2ef'; ctx.beginPath(); ctx.moveTo(cx+W*.09,H*.82); ctx.lineTo(cx+W*.125,H*.86); ctx.lineTo(cx+W*.09,H*.86); ctx.closePath(); ctx.fill(); }

  // --- NECK + HEAD ---
  ctx.fillStyle = shade(A.skin, -.12);
  ctx.fillRect(cx - headR * .26, hy + headR * .55, headR * .52, headR * .8);
  ctx.fillStyle = A.skin;
  facePath(ctx, cx, hy, headR); ctx.fill();

  // ears
  ctx.fillStyle = shade(A.skin, -.06);
  ctx.beginPath(); ctx.ellipse(cx - headR * .96, hy + headR * .12, headR * .14, headR * .22, .2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + headR * .96, hy + headR * .12, headR * .14, headR * .22, -.2, 0, 7); ctx.fill();

  // blush
  ctx.globalAlpha = .5; ctx.fillStyle = A.blush;
  ctx.beginPath(); ctx.ellipse(cx - headR * .52, hy + headR * .42, headR * .17, headR * .09, .15, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + headR * .52, hy + headR * .42, headR * .17, headR * .09, -.15, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  // --- FACE FEATURES ---
  drawEyes(ctx, cx, hy, headR, A, E);
  drawBrows(ctx, cx, hy, headR, A);
  // nose
  ctx.strokeStyle = shade(A.skin, -.3); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 1, hy + headR * .42); ctx.lineTo(cx + headR * .06, hy + headR * .48); ctx.stroke();
  drawMouth(ctx, cx, hy + headR * .62, headR, A.mouth);

  if (A.accessories.includes('brand')) sigil(ctx, cx + headR * .68, hy + headR * .18, headR * .10, '#ffb35c', 2, .9);

  // --- FRONT HAIR ---
  drawFrontHair(ctx, cx, hy, headR, A);

  // --- head accessories ---
  if (A.accessories.includes('chain-crown')) {
    ctx.strokeStyle = '#cabdf2'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, hy - headR * .55, headR * .82, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 1.22 + i * Math.PI * .155;
      const sx = cx + Math.cos(a) * headR * .82, sy = hy - headR * .55 + Math.sin(a) * headR * .82;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - headR * .22); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy - headR * .27, headR * .05, 0, 7); ctx.stroke();
    }
  }
  if (A.accessories.includes('goggles')) {
    ctx.fillStyle = '#20242c';
    rounded(ctx, cx - headR * .78, hy - headR * .98, headR * 1.56, headR * .42, headR * .2); ctx.fill();
    ctx.strokeStyle = '#7be3b0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx - headR * .36, hy - headR * .77, headR * .17, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + headR * .36, hy - headR * .77, headR * .17, 0, 7); ctx.stroke();
  }
  if (A.accessories.includes('phoenix-pin')) {
    ctx.fillStyle = '#ff6b57'; starPath(ctx, cx - headR * .8, hy - headR * .85, headR * .16, headR * .07, -2.2); ctx.fill();
    glow(ctx, cx - headR * .8, hy - headR * .85, headR * .3, 'rgba(255,107,87,.5)', .7);
  }
  if (A.accessories.includes('raven-mask')) {
    ctx.save(); ctx.translate(cx + headR * .74, hy - headR * .62); ctx.rotate(.5);
    ctx.fillStyle = '#171225';
    ctx.beginPath(); ctx.moveTo(-headR*.3, -headR*.18); ctx.quadraticCurveTo(headR*.45,-headR*.22, headR*.62,.02);
    ctx.quadraticCurveTo(headR*.3, headR*.16, -headR*.3, headR*.14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8a84c'; ctx.beginPath(); ctx.arc(headR*.05, -.02, headR*.06, 0, 7); ctx.fill();
    ctx.restore();
  }
  if (A.accessories.includes('amphora')) {
    ctx.fillStyle = '#b98a5e';
    ctx.beginPath(); ctx.ellipse(cx - W * .27, H * .86, W * .05, W * .07, .3, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a5f3c'; ctx.fillRect(cx - W * .30, H * .78, W * .06, W * .018);
  }
  if (A.accessories.includes('water-orbit')) {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + .8;
      ctx.fillStyle = 'rgba(120,210,235,.85)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * headR * 1.35, hy + Math.sin(a) * headR * 1.1, 4, 0, 7); ctx.fill();
    }
  }

  // rim light
  rimLight(ctx, cx, hy, headR, E.color);
}

function facePath(ctx, cx, hy, r) {
  ctx.beginPath();
  ctx.moveTo(cx - r * .98, hy - r * .1);
  ctx.bezierCurveTo(cx - r * 1.02, hy - r * .95, cx + r * 1.02, hy - r * .95, cx + r * .98, hy - r * .1);
  ctx.bezierCurveTo(cx + r * .93, hy + r * .55, cx + r * .38, hy + r * 1.02, cx, hy + r * 1.06);
  ctx.bezierCurveTo(cx - r * .38, hy + r * 1.02, cx - r * .93, hy + r * .55, cx - r * .98, hy - r * .1);
  ctx.closePath();
}
function rimLight(ctx, cx, hy, r, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = .55; ctx.lineWidth = 2.5;
  facePath(ctx, cx, hy, r); ctx.stroke();
  ctx.restore();
}
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawFeather(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(.6);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, s * .35, s, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = shade(color, -.3); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
  ctx.restore();
}

function drawEyes(ctx, cx, hy, r, A, E) {
  const ew = r * .34, eh = r * (.44), ey = hy + r * .12, dx = r * .42;
  for (const s of [-1, 1]) {
    const ex = cx + s * dx;
    ctx.save();
    // white
    ctx.fillStyle = '#fdfbff';
    ctx.beginPath(); ctx.ellipse(ex, ey, ew, eh, 0, 0, 7); ctx.fill();
    // clip iris
    ctx.beginPath(); ctx.ellipse(ex, ey, ew, eh, 0, 0, 7); ctx.clip();
    const ig = ctx.createRadialGradient(ex, ey + eh * .1, 1, ex, ey, ew * 1.3);
    ig.addColorStop(0, shade(E.color, .35)); ig.addColorStop(.55, E.color); ig.addColorStop(1, shade(E.color, -.45));
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.ellipse(ex, ey + eh * .05, ew * .78, eh * .92, 0, 0, 7); ctx.fill();
    // pupil
    ctx.fillStyle = '#14101f';
    ctx.beginPath(); ctx.ellipse(ex, ey + eh * .08, ew * .30, eh * .42, 0, 0, 7); ctx.fill();
    if (A.eyeStyle === 'star') {
      ctx.fillStyle = '#ffffff'; starPath(ctx, ex - ew * .25, ey - eh * .3, ew * .3, ew * .12); ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex - ew * .28, ey - eh * .3, ew * .2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + ew * .22, ey + eh * .25, ew * .1, 0, 7); ctx.fill();
    }
    // upper lid shadow
    ctx.fillStyle = 'rgba(20,12,30,.35)';
    ctx.beginPath(); ctx.ellipse(ex, ey - eh * 1.02, ew * 1.2, eh * .5, 0, 0, 7); ctx.fill();
    if (A.eyeStyle === 'sly') { ctx.fillStyle = A.skin; ctx.beginPath(); ctx.ellipse(ex, ey - eh * .55, ew * 1.1, eh * .62, 0, 0, 7); ctx.fill(); }
    ctx.restore();
    // lash line
    ctx.strokeStyle = '#241a2e'; ctx.lineWidth = r * .07; ctx.lineCap = 'round';
    ctx.beginPath();
    if (A.eyeStyle === 'sharp' || A.eyeStyle === 'fierce') {
      ctx.moveTo(ex - s * ew * 1.1, ey - eh * .55); ctx.quadraticCurveTo(ex, ey - eh * 1.25, ex + s * ew * 1.05, ey - eh * .75);
    } else {
      ctx.moveTo(ex - s * ew * 1.05, ey - eh * .7); ctx.quadraticCurveTo(ex, ey - eh * 1.2, ex + s * ew * 1.05, ey - eh * .65);
    }
    ctx.stroke();
    // lower accent
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(60,40,70,.4)';
    ctx.beginPath(); ctx.moveTo(ex - s * ew * .7, ey + eh * .95); ctx.quadraticCurveTo(ex, ey + eh * 1.12, ex + s * ew * .75, ey + eh * .9); ctx.stroke();
  }
}
function drawBrows(ctx, cx, hy, r, A) {
  const ey = hy - r * .28, dx = r * .44;
  ctx.strokeStyle = shade(A.hair2 || A.hair, -.35); ctx.lineWidth = r * .07; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const bx = cx + s * dx;
    ctx.beginPath();
    if (A.eyeStyle === 'fierce') { ctx.moveTo(bx - s * r * .18, ey - r * .12); ctx.quadraticCurveTo(bx, ey - r * .02, bx + s * r * .2, ey - r * .16); }
    else if (A.eyeStyle === 'calm' || A.eyeStyle === 'gentle') { ctx.moveTo(bx - s * r * .2, ey); ctx.quadraticCurveTo(bx, ey - r * .1, bx + s * r * .2, ey - r * .02); }
    else if (A.eyeStyle === 'sly') { ctx.moveTo(bx - s * r * .2, ey - r * .04); ctx.quadraticCurveTo(bx, ey - r * .12, bx + s * r * .2, ey - r * .06); }
    else { ctx.moveTo(bx - s * r * .2, ey - r * .06); ctx.quadraticCurveTo(bx, ey - r * .16, bx + s * r * .2, ey - r * .08); }
    ctx.stroke();
  }
}
function drawMouth(ctx, x, y, r, style) {
  ctx.strokeStyle = '#a35050'; ctx.lineWidth = r * .055; ctx.lineCap = 'round';
  ctx.beginPath();
  switch (style) {
    case 'grin': ctx.moveTo(x - r * .16, y); ctx.quadraticCurveTo(x, y + r * .18, x + r * .16, y); break;
    case 'smirk': ctx.moveTo(x - r * .13, y + r * .02); ctx.quadraticCurveTo(x + r * .04, y + r * .06, x + r * .16, y - r * .06); break;
    case 'soft': ctx.arc(x, y - r * .02, r * .09, .25, Math.PI - .25); break;
    case 'stoic': ctx.moveTo(x - r * .11, y); ctx.lineTo(x + r * .11, y); break;
    default: ctx.arc(x, y - r * .04, r * .11, .35, Math.PI - .35);
  }
  ctx.stroke();
}

function drawBackHair(ctx, cx, hy, r, A) {
  const h1 = A.hair, h2 = A.hair2 || shade(A.hair, -.2);
  ctx.fillStyle = h2;
  switch (A.hairStyle) {
    case 'long-flow':
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.15, hy + r * .1);
      ctx.quadraticCurveTo(cx - r * 1.5, hy + r * 2.6, cx - r * .9, hy + r * 3.6);
      ctx.lineTo(cx - r * .25, hy + r * 3.1);
      ctx.lineTo(cx + r * .25, hy + r * 3.6);
      ctx.lineTo(cx + r * .9, hy + r * 3.1);
      ctx.quadraticCurveTo(cx + r * 1.5, hy + r * 2.6, cx + r * 1.15, hy + r * .1);
      ctx.closePath(); ctx.fill();
      break;
    case 'ponytail':
      ctx.beginPath();
      ctx.moveTo(cx + r * .7, hy - r * .7);
      ctx.quadraticCurveTo(cx + r * 1.9, hy + r * .2, cx + r * 1.35, hy + r * 2.4);
      ctx.quadraticCurveTo(cx + r * 1.0, hy + r * 2.9, cx + r * .8, hy + r * 2.5);
      ctx.quadraticCurveTo(cx + r * 1.15, hy + r * .8, cx + r * .3, hy + r * .1);
      ctx.closePath(); ctx.fill();
      break;
    case 'braid':
      ctx.beginPath(); ctx.ellipse(cx - r * .95, hy + r * 1.7, r * .3, r * 1.6, .12, 0, 7); ctx.fill();
      break;
    case 'side-tail':
      ctx.beginPath(); ctx.ellipse(cx + r * 1.05, hy + r * 1.4, r * .42, r * 1.7, -.2, 0, 7); ctx.fill();
      break;
  }
}

function drawFrontHair(ctx, cx, hy, r, A) {
  const h1 = A.hair;
  ctx.fillStyle = h1;
  // base cap
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.04, hy + r * .05);
  ctx.bezierCurveTo(cx - r * 1.1, hy - r * 1.25, cx + r * 1.1, hy - r * 1.25, cx + r * 1.04, hy + r * .05);
  // bangs vary by style
  const bang = (pts) => { for (const p of pts) ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]); };
  switch (A.hairStyle) {
    case 'long-flow':
      bang([[cx - r*.7, hy - r*.25, cx - r*.55, hy + r*.5], [cx - r*.25, hy - r*.35, cx - r*.1, hy + r*.42],
            [cx + r*.2, hy - r*.3, cx + r*.4, hy + r*.48], [cx + r*.7, hy - r*.3, cx + r*1.04, hy + r*.05]]);
      break;
    case 'spiky':
      bang([[cx - r*.6, hy + r*.15, cx - r*.45, hy + r*.55], [cx - r*.2, hy + r*.1, cx - r*.05, hy + r*.5],
            [cx + r*.15, hy + r*.12, cx + r*.3, hy + r*.52], [cx + r*.6, hy + r*.1, cx + r*1.0, hy + r*.1]]);
      break;
    case 'bob':
      bang([[cx - r*.65, hy - r*.2, cx - r*.5, hy + r*.32], [cx - r*.2, hy - r*.3, cx, hy + r*.3],
            [cx + r*.3, hy - r*.28, cx + r*.5, hy + r*.3]]);
      // side curtains
      ctx.lineTo(cx + r * 1.05, hy + r * .75); ctx.lineTo(cx + r * .78, hy + r * .8); ctx.lineTo(cx - r*.78, hy + r*.8); ctx.lineTo(cx - r*1.05, hy + r*.75);
      break;
    case 'ponytail':
      bang([[cx - r*.6, hy - r*.2, cx - r*.45, hy + r*.4], [cx - r*.1, hy - r*.32, cx + r*.05, hy + r*.35],
            [cx + r*.4, hy - r*.25, cx + r*.6, hy + r*.4]]);
      break;
    case 'braid':
      bang([[cx - r*.6, hy - r*.2, cx - r*.5, hy + r*.35], [cx, hy - r*.34, cx + r*.05, hy + r*.3],
            [cx + r*.55, hy - r*.22, cx + r*.6, hy + r*.35]]);
      break;
    case 'side-tail':
      bang([[cx - r*.65, hy - r*.15, cx - r*.5, hy + r*.38], [cx - r*.15, hy - r*.3, cx, hy + r*.34],
            [cx + r*.35, hy - r*.26, cx + r*.5, hy + r*.36]]);
      break;
    default:
      bang([[cx - r*.6, hy - r*.2, cx - r*.5, hy + r*.4], [cx, hy - r*.3, cx, hy + r*.35], [cx + r*.6, hy - r*.2, cx + r*.55, hy + r*.4]]);
  }
  ctx.closePath(); ctx.fill();
  // shine band
  ctx.save(); ctx.globalAlpha = .5; ctx.fillStyle = shade(h1, .45);
  ctx.beginPath(); ctx.ellipse(cx, hy - r * .58, r * .62, r * .18, 0, 0, 7); ctx.fill();
  ctx.restore();
  // ahoge for some
  if (['long-flow','ponytail'].includes(A.hairStyle)) {
    ctx.strokeStyle = h1; ctx.lineWidth = r * .1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, hy - r * 1.02); ctx.quadraticCurveTo(cx + r * .12, hy - r * 1.4, cx + r * .4, hy - r * 1.3); ctx.stroke();
  }
}

// ---------- FIELD SPRITE (chibi) --------------------------------------------
export function drawUnitSprite(ctx, char, x, y, opt = {}) {
  const A = char.art, E = ELEMENTS[char.element];
  const s = opt.scale || 1, t = opt.t || 0, moving = !!opt.moving, facing = opt.facing ?? 1;
  const bob = moving ? Math.sin(t * 11) * 2 : Math.sin(t * 2.2) * 1;
  ctx.save(); ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, 4, 12 * s, 4.5 * s, 0, 0, 7); ctx.fill();

  ctx.translate(0, bob);
  // legs
  ctx.strokeStyle = shade(A.outfit2, -.25); ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  const lg = moving ? Math.sin(t * 11) * 4 : 0;
  ctx.beginPath(); ctx.moveTo(-4 * s, 10 * s); ctx.lineTo(-4 * s + lg * .5, 18 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4 * s, 10 * s); ctx.lineTo(4 * s - lg * .5, 18 * s); ctx.stroke();
  // body
  ctx.fillStyle = A.outfit;
  rounded(ctx, -8 * s, -6 * s, 16 * s, 18 * s, 6 * s); ctx.fill();
  ctx.fillStyle = A.outfit2;
  ctx.fillRect(-8 * s, 2 * s, 16 * s, 3 * s);
  // arms
  ctx.strokeStyle = A.outfit; ctx.lineWidth = 4.5 * s;
  const sw = moving ? Math.sin(t * 11 + 3) * 5 : (opt.attacking ? -8 : 0);
  ctx.beginPath(); ctx.moveTo(-7 * s, -2 * s); ctx.lineTo(-10 * s, 6 * s + sw * .4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7 * s, -2 * s); ctx.lineTo(10 * s + sw, 4 * s); ctx.stroke();
  // weapon hint while attacking
  if (opt.attacking) {
    ctx.strokeStyle = E.color; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(10 * s + sw, 4 * s); ctx.lineTo(22 * s, 0); ctx.stroke();
  }
  // head
  ctx.fillStyle = A.skin;
  ctx.beginPath(); ctx.arc(0, -14 * s, 9.5 * s, 0, 7); ctx.fill();
  // hair
  ctx.fillStyle = A.hair;
  ctx.beginPath(); ctx.arc(0, -15.5 * s, 9.5 * s, Math.PI * .95, Math.PI * 2.05); ctx.fill();
  if (A.hairStyle === 'spiky') {
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 3.4 * s, -23 * s); ctx.lineTo(i * 3.4 * s + 1.5 * s, -29 * s); ctx.lineTo(i * 3.4 * s + 3.2 * s, -22.5 * s); ctx.closePath(); ctx.fill();
    }
  } else if (A.hairStyle === 'long-flow') {
    ctx.beginPath(); ctx.ellipse(-7 * s, -12 * s, 3.5 * s, 9 * s, .2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7 * s, -12 * s, 3.5 * s, 9 * s, -.2, 0, 7); ctx.fill();
  } else if (A.hairStyle === 'ponytail') {
    ctx.beginPath(); ctx.ellipse(9 * s, -12 * s, 2.8 * s, 8 * s, -.5, 0, 7); ctx.fill();
  } else if (A.hairStyle === 'bob') {
    ctx.beginPath(); ctx.ellipse(-8.5 * s, -13 * s, 3 * s, 6.5 * s, .2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8.5 * s, -13 * s, 3 * s, 6.5 * s, -.2, 0, 7); ctx.fill();
  } else if (A.hairStyle === 'twin') {
    ctx.beginPath(); ctx.ellipse(-10 * s, -14 * s, 2.5 * s, 6 * s, .5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10 * s, -14 * s, 2.5 * s, 6 * s, -.5, 0, 7); ctx.fill();
  }
  // eyes
  ctx.fillStyle = E.color;
  ctx.fillRect(facingSign(2.2 * s, facing), -14.5 * s, 2.4 * s, 3 * s);
  ctx.fillRect(facingSign(6 * s, facing), -14.5 * s, 2.4 * s, 3 * s);
  // accessory accents
  if (A.accessories.includes('scarf')) { ctx.strokeStyle = '#c2452f'; ctx.lineWidth = 3.5 * s; ctx.beginPath(); ctx.arc(0, -7.5 * s, 6 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  if (A.accessories.includes('harp-halo')) { ctx.strokeStyle = '#e8c66a'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.ellipse(0, -14 * s, 13 * s, 11 * s, -.2, 0, 7); ctx.stroke(); }
  if (A.accessories.includes('chain-crown')) { ctx.strokeStyle = '#cabdf2'; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.arc(0, -20 * s, 6.5 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  if (A.accessories.includes('raven-mask')) { ctx.fillStyle = '#171225'; ctx.beginPath(); ctx.moveTo(4*s,-19*s); ctx.lineTo(12*s,-17.5*s); ctx.lineTo(4*s,-16*s); ctx.closePath(); ctx.fill(); }
  if (A.accessories.includes('goggles')) { ctx.strokeStyle = '#20242c'; ctx.lineWidth = 2.4*s; ctx.beginPath(); ctx.arc(0,-21*s,6.5*s,Math.PI*1.1,Math.PI*1.9); ctx.stroke(); }
  ctx.restore();
}
function facingSign(v, facing) { return facing < 0 ? -v - 2.4 * (v > 0 ? 1 : 0) - 2.4 : v; }

// ---------- ENEMIES ----------------------------------------------------------
export function drawEnemySprite(ctx, type, def, x, y, t, opt = {}) {
  ctx.save(); ctx.translate(x, y);
  const c = def.color, hurt = opt.hurtFlash > 0;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, def.r * .55, def.r * .9, def.r * .32, 0, 0, 7); ctx.fill();
  const bodyC = hurt ? '#ffffff' : c;
  const wob = Math.sin(t * 3 + x * .01) * 2;
  switch (type) {
    case 'wisp': {
      glow(ctx, 0, -def.r * .4, def.r * 2.2, 'rgba(150,110,220,.35)', .6);
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.moveTo(0, -def.r - wob);
      ctx.quadraticCurveTo(def.r, -def.r * .2, def.r * .55, def.r * .55);
      ctx.quadraticCurveTo(0, def.r, -def.r * .55, def.r * .55);
      ctx.quadraticCurveTo(-def.r, -def.r * .2, 0, -def.r - wob);
      ctx.fill();
      ctx.fillStyle = '#0d0a18';
      ctx.beginPath(); ctx.arc(-4, -2, 2.6, 0, 7); ctx.arc(4, -2, 2.6, 0, 7); ctx.fill();
      break; }
    case 'riftling': {
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.arc(0, 0, def.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#0d0a18';
      ctx.beginPath(); ctx.arc(-3, -1, 2, 0, 7); ctx.arc(3, -1, 2, 0, 7); ctx.fill();
      break; }
    case 'spitter': {
      glow(ctx, 0, 0, def.r * 2, 'rgba(111,216,201,.3)', .6);
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.arc(0, 0, def.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#0d0a18';
      ctx.beginPath(); ctx.ellipse(0, 2, def.r * .55, def.r * .3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c9fff5';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 6 - 3, 4); ctx.lineTo(i * 6, -2); ctx.lineTo(i * 6 + 3, 4); ctx.closePath(); ctx.fill(); }
      break; }
    case 'hulk': {
      ctx.fillStyle = hurt ? '#fff' : shade(c, -.15);
      rounded(ctx, -def.r * .8, -def.r * .9, def.r * 1.6, def.r * 1.5, 8); ctx.fill();
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.arc(0, -def.r * .8, def.r * .55, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8f6fd8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-def.r * .5, def.r * .2); ctx.lineTo(def.r * .5, def.r * .1); ctx.stroke();
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.arc(-5, -def.r * .85, 3, 0, 7); ctx.arc(6, -def.r * .85, 3, 0, 7); ctx.fill();
      break; }
    default: { // bosses
      const R = def.r;
      glow(ctx, 0, -R * .3, R * 2.4, 'rgba(160,110,240,.4)', .7);
      ctx.fillStyle = hurt ? '#fff' : shade(c, -.25);
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const rr = R * (1 + Math.sin(a * 3 + t * 2) * .12);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * .9;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.arc(0, -R * .5, R * .5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(-R * .18, -R * .55, R * .09, 0, 7); ctx.arc(R * .18, -R * .55, R * .09, 0, 7); ctx.fill();
      ctx.strokeStyle = '#0d0a18'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -R * .3, R * .22, .2, Math.PI - .2); ctx.stroke();
      break; }
  }
  ctx.restore();
}

// ---------- NPC portraits (non-playable) ------------------------------------
export const NPC_ART = {
  selene: { skin: '#f6e8ea', blush: '#eec3cd', hair: '#dfe3ee', hair2: '#aab3c9', hairStyle: 'long-flow', eyes: '#9fb4e8', eyeStyle: 'calm', mouth: 'soft', outfit: '#e8e2f4', outfit2: '#8f86c9', accent: '#cdd6f4', accessories: ['crescent-pin'] },
  toma:   { skin: '#d9a878', blush: '#b9855a', hair: '#5a4632', hair2: '#3d2f22', hairStyle: 'bob', eyes: '#8a6a3c', eyeStyle: 'sharp', mouth: 'stoic', outfit: '#7a5a3a', outfit2: '#4e3a26', accent: '#d8b56a', accessories: ['badge'] },
  maro:   { skin: '#eec39a', blush: '#d69c72', hair: '#c98a4e', hair2: '#9c6636', hairStyle: 'side-tail', eyes: '#c9803c', eyeStyle: 'star', mouth: 'grin', outfit: '#6a7a52', outfit2: '#49573a', accent: '#e8c66a', accessories: ['wrench-pin'] },
};
