/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — util */
window.ARC = window.ARC || {};
ARC.util = (() => {
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const chance = p => Math.random() < p;
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const pad7 = n => String(Math.max(0, Math.floor(n))).padStart(7, '0');
  const TAU = Math.PI * 2;

  // circle vs axis-aligned rect
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
    return dist2(cx, cy, nx, ny) <= r * r;
  }

  // fake glow: draw path twice (thick translucent + thin bright)
  function glowStroke(ctx, color, width, drawPath) {
    ctx.strokeStyle = color;
    ctx.globalAlpha *= .28; ctx.lineWidth = width * 3.2; ctx.lineJoin = 'round';
    ctx.beginPath(); drawPath(ctx); ctx.stroke();
    ctx.globalAlpha /= .28; ctx.lineWidth = width;
    ctx.beginPath(); drawPath(ctx); ctx.stroke();
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  return { clamp, lerp, rand, irand, chance, pick, dist2, pad7, TAU, circleRect, glowStroke, fmtTime };
})();
