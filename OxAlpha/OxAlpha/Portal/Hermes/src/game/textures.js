// LIMINAL DYNAMICS — procedural texture factory (no external assets)
import * as THREE from 'three';

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function tex(canvas, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, alpha, n = 2200, light = true) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const v = Math.random() * 255;
    ctx.fillStyle = light
      ? `rgba(${v},${v},${v},${Math.random() * alpha})`
      : `rgba(0,0,0,${Math.random() * alpha})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

export function makeTextures() {
  const T = {};

  // --- clean white portal-panel ---
  T.panel = tex(makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c9cfd4'; ctx.fillRect(0, 0, w, h);
    // subtle vertical gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.05);
    // panel seams
    ctx.strokeStyle = 'rgba(40,52,64,0.55)'; ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    // corner screws
    ctx.fillStyle = 'rgba(60,74,88,0.8)';
    for (const [x, y] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]]) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    }
  }));

  // --- dark structural metal ---
  T.metal = tex(makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2b323b'; ctx.fillRect(0, 0, w, h);
    // brushed streaks
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * h;
      ctx.fillStyle = `rgba(${140 + Math.random() * 60},${150 + Math.random() * 60},${165 + Math.random() * 60},${Math.random() * 0.06})`;
      ctx.fillRect(0, y, w, 1 + Math.random() * 2);
    }
    noise(ctx, w, h, 0.06);
    ctx.strokeStyle = 'rgba(12,16,20,0.9)'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    // rivets
    ctx.fillStyle = 'rgba(150,160,175,0.5)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.beginPath(); ctx.arc(40 + i * 144, 40 + j * 144, 4, 0, 7); ctx.fill();
    }
  }));

  // --- floor tile ---
  T.floor = tex(makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3a4149'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.07);
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 360);
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(15,18,22,0.9)'; ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    // tread dots
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      ctx.beginPath(); ctx.arc(60 + i * 78, 60 + j * 78, 3, 0, 7); ctx.fill();
    }
  }));

  // --- hazard stripes ---
  T.hazard = tex(makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#171a1e'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c8a23a'; ctx.lineWidth = 26;
    for (let i = -h; i < w + h; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    }
    noise(ctx, w, h, 0.12, 900);
  }));

  // --- maintenance concrete ---
  T.concrete = tex(makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a4f55'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.1, 4200);
    noise(ctx, w, h, 0.1, 2200, false);
    // stains
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 90;
      const g = ctx.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, 'rgba(20,24,28,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }));

  // --- ceiling tech ---
  T.ceiling = tex(makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#23282f'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.05);
    ctx.strokeStyle = 'rgba(8,10,14,0.9)'; ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    // vent slats
    ctx.fillStyle = 'rgba(10,12,16,0.8)';
    for (let i = 0; i < 7; i++) ctx.fillRect(60, 100 + i * 44, w - 120, 16);
  }));

  // --- glass tint (used as color) ---
  T.glass = tex(makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9fd4e8'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.04, 300);
  }));

  return T;
}

// ---- sign generator: chamber placards ----
export function makeSignTexture(num, name, glyphs = []) {
  const c = makeCanvas(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d3d9de'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#39434e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#222b34';
    ctx.font = '700 92px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(String(num).padStart(2, '0'), 30, 26);
    ctx.font = '600 34px "Segoe UI", sans-serif';
    ctx.fillStyle = '#4a5766';
    ctx.fillText(name.toUpperCase(), 30, 140);
    // glyph row
    let x = 340;
    for (const g of glyphs) {
      drawGlyph(ctx, x, 60, g);
      x += 62;
    }
    ctx.fillStyle = '#8b98a6';
    ctx.font = '500 18px "Segoe UI", sans-serif';
    ctx.fillText('LIMINAL DYNAMICS · THRESHOLD ANNEX', 30, h - 44);
  });
  return tex(c);
}

function drawGlyph(ctx, x, y, kind) {
  ctx.save();
  ctx.strokeStyle = '#39434e'; ctx.fillStyle = '#39434e'; ctx.lineWidth = 7;
  if (kind === 'portal') {
    ctx.beginPath(); ctx.ellipse(x + 20, y + 26, 17, 24, 0, 0, 7); ctx.stroke();
  } else if (kind === 'cube') {
    ctx.strokeRect(x + 6, y + 10, 30, 30);
  } else if (kind === 'button') {
    ctx.beginPath(); ctx.arc(x + 20, y + 26, 15, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 20, y + 26, 5, 0, 7); ctx.fill();
  } else if (kind === 'fling') {
    ctx.beginPath(); ctx.moveTo(x + 4, y + 40); ctx.quadraticCurveTo(x + 20, y - 8, x + 38, y + 34); ctx.stroke();
  } else if (kind === 'hazard') {
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 4); ctx.lineTo(x + 38, y + 42); ctx.lineTo(x + 2, y + 42); ctx.closePath(); ctx.stroke();
    ctx.fillRect(x + 18, y + 16, 5, 14); ctx.fillRect(x + 18, y + 33, 5, 5);
  } else if (kind === 'clock') {
    ctx.beginPath(); ctx.arc(x + 20, y + 26, 16, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 20, y + 26); ctx.lineTo(x + 20, y + 14); ctx.moveTo(x + 20, y + 26); ctx.lineTo(x + 30, y + 30); ctx.stroke();
  } else if (kind === 'drop') {
    ctx.beginPath(); ctx.moveTo(x + 20, y + 6); ctx.lineTo(x + 20, y + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 12, y + 24); ctx.lineTo(x + 20, y + 36); ctx.lineTo(x + 28, y + 24); ctx.stroke();
    ctx.strokeRect(x + 6, y + 40, 30, 4);
  }
  ctx.restore();
}
