// STARWOVEN — zone construction + environment painting (deterministic per seed)
"use strict";

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildZone(def, save) {
  const rnd = mulberry(hashStr(def.id));
  const z = {
    def, w: def.w, h: def.h,
    obstacles: def.obstacles.map(o => ({ ...o })),
    decor: [], stars: [],
  };
  // decorative scatter (deterministic)
  const density = Math.floor((def.w * def.h) / 42000);
  for (let i = 0; i < density; i++) {
    const x = 60 + rnd() * (def.w - 120), y = 60 + rnd() * (def.h - 120);
    if (z.obstacles.some(o => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + 40) ** 2)) continue;
    z.decor.push({
      x, y,
      kind: Math.floor(rnd() * 3),
      rot: rnd() * Math.PI * 2,
      s: .6 + rnd() * .9,
      phase: rnd() * 7,
    });
  }
  for (let i = 0; i < 90; i++) z.stars.push({ x: rnd() * def.w, y: rnd() * def.h, r: .5 + rnd() * 1.4, ph: rnd() * 7 });
  return z;
}

export function pointBlocked(z, x, y, pad = 0) {
  if (x < 30 || y < 30 || x > z.w - 30 || y > z.h - 30) return true;
  for (const o of z.obstacles) {
    if ((o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + pad) ** 2) return true;
  }
  return false;
}

// ------------------------------------------------------------------ painting
export function drawGround(ctx, z, cam, vw, vh, quality) {
  const P = z.def.palette;
  ctx.fillStyle = P.ground;
  ctx.fillRect(0, 0, vw, vh);

  const step = 130;
  const x0 = Math.floor(cam.x / step) * step, y0 = Math.floor(cam.y / step) * step;
  ctx.fillStyle = P.ground2;
  for (let gx = x0; gx < cam.x + vw + step; gx += step) {
    for (let gy = y0; gy < cam.y + vh + step; gy += step) {
      const n = ((gx * 31 + gy * 17) % 97) / 97;
      if (n > .52) {
        ctx.beginPath();
        ctx.ellipse(gx % 1e7, gy % 1e7, 46 + n * 40, 34 + n * 30, n * 3, 0, 7);
        ctx.fill();
      }
    }
  }
  // woven thread lines across ground (IP signature)
  ctx.strokeStyle = P.detail; ctx.globalAlpha = .5; ctx.lineWidth = 2;
  for (let gx = x0; gx < cam.x + vw + step * 2; gx += step * 2) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx + 80, vh); ctx.stroke();
  }
  for (let gy = y0; gy < cam.y + vh + step * 2; gy += step * 2) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(vw, gy - 60); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // world-space translate handled by caller; decor drawn in world coords:
  void quality;
}
export function drawDecor(ctx, z, time, quality) {
  const P = z.def.palette;
  for (const d of z.decor) {
    switch (d.kind) {
      case 0: // glowing crack / thread
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.strokeStyle = P.glow; ctx.globalAlpha = quality === 'low' ? .12 : .22 + Math.sin(time * 1.3 + d.phase) * .08;
        ctx.lineWidth = 1.6 * d.s;
        ctx.beginPath(); ctx.moveTo(-26 * d.s, 0);
        ctx.quadraticCurveTo(0, 6 * d.s * Math.sin(d.phase), 26 * d.s, 2 * d.s);
        ctx.stroke(); ctx.restore();
        break;
      case 1: // tuft / shards
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        ctx.strokeStyle = P.detail; ctx.lineWidth = 2 * d.s;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * 5 * d.s, 0); ctx.quadraticCurveTo(i * 7 * d.s, -8 * d.s, i * 9 * d.s, -13 * d.s); ctx.stroke();
        }
        ctx.restore();
        break;
      case 2: // rune pebble
        ctx.save(); ctx.translate(d.x, d.y);
        ctx.fillStyle = P.detail;
        ctx.beginPath(); ctx.ellipse(0, 0, 7 * d.s, 5 * d.s, d.rot, 0, 7); ctx.fill();
        ctx.strokeStyle = P.glow; ctx.globalAlpha = .35; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, 3.4 * d.s, 0, 5); ctx.stroke();
        ctx.restore();
        break;
    }
  }
  // ambient star motes (world-fixed twinkle)
  if (quality !== 'low') {
    for (const st of z.stars) {
      const a = .25 + Math.sin(time * 2 + st.ph) * .22;
      if (a <= 0.05) continue;
      ctx.globalAlpha = a; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawObstacle(ctx, o, z) {
  const P = z.def.palette;
  ctx.fillStyle = shade(P.ground2, -.25);
  ctx.beginPath(); ctx.ellipse(o.x + 4, o.y + 6, o.r, o.r * .82, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(o.x - o.r * .3, o.y - o.r * .4, o.r * .2, o.x, o.y, o.r);
  g.addColorStop(0, shade(P.detail, .1)); g.addColorStop(1, shade(P.ground2, -.1));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r, o.r * .8, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = P.glow; ctx.globalAlpha = .28; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * .72, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawVignette(ctx, vw, vh, P) {
  const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * .38, vw / 2, vh / 2, vh * .85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, P.fog || 'rgba(10,8,24,.4)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
