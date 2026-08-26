(function () {
  const U = {
    TAU: Math.PI * 2,
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); },
    formatTime(s) {
      if (!isFinite(s) || s < 0) s = 0;
      s = Math.floor(s);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
    hexToRgb(h) {
      const n = parseInt(h.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    hexToRgba(h, a) {
      const c = U.hexToRgb(h);
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    },
    palette(colors, x, a) {
      x = U.clamp(x, 0, 1) * (colors.length - 1);
      const i = Math.min(colors.length - 2, Math.floor(x));
      const f = x - i;
      const c1 = U.hexToRgb(colors[i]), c2 = U.hexToRgb(colors[i + 1]);
      return 'rgba(' + Math.round(U.lerp(c1[0], c2[0], f)) + ',' + Math.round(U.lerp(c1[1], c2[1], f)) + ',' + Math.round(U.lerp(c1[2], c2[2], f)) + ',' + a + ')';
    },
    rr(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  };
  window.U = U;
})();
