/* ORION RUN — canvas UI toolkit (immediate-mode widgets over one canvas) */
'use strict';
(function () {
  const { clamp } = OR.util;

  const C = {
    bg: '#05070d',
    panel: 'rgba(9,14,26,0.92)',
    panelLine: 'rgba(90,140,190,0.35)',
    cyan: '#59d6ff',
    blue: '#4fc3ff',
    amber: '#ffb454',
    red: '#ff5f56',
    green: '#7dffa8',
    purple: '#c792ea',
    text: '#cfe3f5',
    dim: '#7f93a8',
  };
  OR.C = C;
  OR.FONT = "'Consolas','Lucida Console','Courier New',monospace";

  /* ---------------- immediate-mode GUI ---------------- */
  class Gui {
    constructor() {
      this.hotspots = [];   // rebuilt every frame during draw
      this.mx = -999, this.my = -999;
      this.focus = null;    // focused InputField
    }
    beginFrame() { this.hotspots.length = 0; }
    hit(x, y, w, h, id, cb) { this.hotspots.push({ x, y, w, h, id, cb }); }
    hovered(x, y, w, h) { return this.mx >= x && this.mx <= x + w && this.my >= y && this.my <= y + h; }
    click(mx, my) {
      this.mx = mx; this.my = my;
      for (let i = this.hotspots.length - 1; i >= 0; i--) {
        const r = this.hotspots[i];
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          if (r.cb) { r.cb(); return true; }
          return false;
        }
      }
      return false;
    }
  }

  /* widget helpers (ctx, g, view) */
  function panel(ctx, x, y, w, h, opts = {}) {
    ctx.save();
    ctx.fillStyle = opts.fill || C.panel;
    ctx.strokeStyle = opts.line || C.panelLine;
    ctx.lineWidth = 1;
    const r = opts.r ?? 10;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill(); ctx.stroke();
    if (opts.title) {
      ctx.fillStyle = opts.titleColor || C.cyan;
      ctx.font = `bold ${opts.fs || 13}px ${OR.FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(opts.title.toUpperCase(), x + 14, y + 22);
      ctx.strokeStyle = 'rgba(90,140,190,0.25)';
      ctx.beginPath(); ctx.moveTo(x + 12, y + 30); ctx.lineTo(x + w - 12, y + 30); ctx.stroke();
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function label(ctx, txt, x, y, opts = {}) {
    ctx.font = `${opts.bold ? 'bold ' : ''}${opts.fs || 14}px ${OR.FONT}`;
    ctx.fillStyle = opts.color || C.text;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillText(txt, x, y);
  }
  function btn(ctx, g, x, y, w, h, txt, opts = {}) {
    const hov = !opts.disabled && g.hovered(x, y, w, h);
    const accent = opts.accent || C.cyan;
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = opts.disabled ? 'rgba(30,38,52,0.7)' : hov ? 'rgba(40,64,96,0.95)' : 'rgba(18,30,48,0.92)';
    ctx.fill();
    ctx.strokeStyle = opts.disabled ? 'rgba(80,92,110,0.4)' : accent;
    ctx.lineWidth = hov ? 2 : 1.2;
    ctx.stroke();
    if (!opts.disabled) { ctx.shadowColor = accent; ctx.shadowBlur = hov ? 10 : 0; ctx.stroke(); }
    ctx.font = `bold ${opts.fs || 15}px ${OR.FONT}`;
    ctx.fillStyle = opts.disabled ? C.dim : (opts.color || C.text);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    if (!opts.disabled) g.hit(x, y, w, h, opts.id || txt, opts.cb);
    else if (opts.cbNoop !== false) g.hit(x, y, w, h, null, null);
    return hov;
  }
  function bar(ctx, x, y, w, h, frac, col, opts = {}) {
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = opts.back || 'rgba(255,255,255,0.08)';
    ctx.fill();
    const f = clamp(frac, 0, 1);
    if (f > 0.01) {
      roundRect(ctx, x + 1, y + 1, Math.max(3, (w - 2) * f), h - 2, (h - 2) / 2);
      ctx.fillStyle = col;
      if (opts.glow) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
      ctx.fill();
    }
    ctx.restore();
    if (opts.label) label(ctx, opts.label + ' ' + Math.round(f * 100) + '%', x + 2, y + h / 2, { fs: h - 6 < 11 ? 11 : h - 6, color: '#0b1220', align: 'left', baseline: 'middle', bold: false });
    if (opts.tag) label(ctx, opts.tag, x - 8, y + h / 2, { fs: 12, color: C.dim, align: 'right', baseline: 'middle' });
  }
  function pips(ctx, x, y, n, maxN, col, size = 12, gap = 4) {
    for (let i = 0; i < maxN; i++) {
      const px = x + i * (size + gap);
      ctx.beginPath();
      roundRect(ctx, px, y, size, size, 3);
      if (i < n) { ctx.fillStyle = col; ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
  function keycap(ctx, x, y, k, fs = 12) {
    ctx.save();
    roundRect(ctx, x, y, fs * 1.6, fs * 1.55, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,240,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `bold ${fs}px ${OR.FONT}`;
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(k, x + fs * 0.8, y + fs * 0.82);
    ctx.restore();
    return fs * 1.6;
  }

  /* retained text field */
  class InputField {
    constructor(opts = {}) {
      this.value = opts.value || '';
      this.placeholder = opts.placeholder || '';
      this.maxLen = opts.maxLen || 14;
      this.w = opts.w || 220;
      this.upper = !!opts.upper;
      this.onChange = opts.onChange || null;
      this.filter = opts.filter || null;
    }
    key(e) {
      if (e.key === 'Backspace') {
        this.value = this.value.slice(0, -1);
      } else if (e.key.length === 1) {
        let ch = e.key;
        if (this.upper) ch = ch.toUpperCase();
        if (this.filter && !this.filter(ch)) return;
        if (this.value.length < this.maxLen) this.value += ch;
      } else return;
      if (this.onChange) this.onChange(this.value);
      e.preventDefault();
    }
    draw(ctx, g, x, y, opts = {}) {
      const w = opts.w || this.w, h = opts.h || 40;
      const foc = g.focus === this;
      ctx.save();
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = 'rgba(4,8,16,0.9)';
      ctx.fill();
      ctx.strokeStyle = foc ? C.amber : 'rgba(120,160,200,0.5)';
      ctx.lineWidth = foc ? 2 : 1;
      ctx.stroke();
      ctx.font = `${opts.fs || 17}px ${OR.FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const showCaret = foc && (Math.floor(performance.now() / 500) % 2 === 0);
      let txt = this.value || '';
      ctx.fillStyle = txt ? C.text : C.dim;
      ctx.clip();
      ctx.fillText(txt + (showCaret ? '|' : ''), x + 12, y + h / 2 + 1);
      if (!txt) { ctx.fillStyle = 'rgba(127,147,168,0.55)'; ctx.fillText(this.placeholder + (showCaret ? '|' : ''), x + 12, y + h / 2 + 1); }
      ctx.restore();
      g.hit(x, y, w, h, 'input' + x + '_' + y, () => { g.focus = this; });
    }
  }

  OR.Gui = Gui;
  OR.ui = {
    panel, label, btn, bar, pips, keycap, roundRect, InputField,
    fitText(ctx, txt, maxW, baseFs) {
      let fs = baseFs;
      ctx.font = `bold ${fs}px ${OR.FONT}`;
      while (fs > 9 && ctx.measureText(txt).width > maxW) { fs -= 1; ctx.font = `bold ${fs}px ${OR.FONT}`; }
      return fs;
    },
  };
})();
