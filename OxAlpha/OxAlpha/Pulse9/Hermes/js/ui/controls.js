/* PULSE-9 UI: shared widget kit — knobs, sliders, menus, dialogs, toasts, helpers */
'use strict';
(function () {
  const U = window.P9UI = window.P9UI || {};

  /* ---------- generic helpers ---------- */
  U.el = function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') n.className = v;
        else if (k === 'style') n.style.cssText = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  };

  U.esc = function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  U.fmtDb = g => (g <= 0.0001 ? '-inf' : (20 * Math.log10(g)).toFixed(1) + ' dB');
  U.fmtStep = s => {
    const bar = Math.floor(s / 16) + 1, beat = Math.floor((s % 16) / 4) + 1, tick = Math.floor(s % 4) + 1;
    return bar + ':' + beat + ':' + tick;
  };
  U.fmtTime = sec => {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60), d = Math.floor((sec % 1) * 10);
    return m + ':' + String(s).padStart(2, '0') + '.' + d;
  };
  U.clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  /* ---------- knob: drag UP = increase (standard convention) ---------- */
  U.knob = function knob(opts) {
    const min = opts.min != null ? opts.min : 0;
    const max = opts.max != null ? opts.max : 1;
    const step = opts.step != null ? opts.step : 0;
    const curve = opts.curve || 'lin';
    let val = U.clamp(opts.value, min, max);

    const wrap = U.el('div', { class: 'knob-item' });
    const k = U.el('div', { class: 'knob', title: opts.title || opts.label });
    const S = opts.size || 40, r = S / 2 - 4;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const [a, b] of Object.entries(attrs)) n.setAttribute(a, b);
      return n;
    };
    const track = mk('circle', { cx: S / 2, cy: S / 2, r: r, fill: '#10141d', stroke: '#232a3a', 'stroke-width': 3 });
    const prog = mk('circle', {
      cx: S / 2, cy: S / 2, r: r, fill: 'none', stroke: 'var(--acc)', 'stroke-width': 3,
      'stroke-linecap': 'round',
      'stroke-dasharray': String(2 * Math.PI * r),
      'stroke-dashoffset': String(2 * Math.PI * r),
      transform: 'rotate(135 ' + S / 2 + ' ' + S / 2 + ')',
    });
    const ind = mk('line', {
      x1: S / 2, y1: S / 2 - 4, x2: S / 2, y2: S / 2 - r + 2,
      stroke: '#cdd6e4', 'stroke-width': 2, 'stroke-linecap': 'round',
    });
    k.append(track, prog, ind);
    const lbl = U.el('div', { class: 'k-lbl' }, opts.label || '');
    const valEl = U.el('div', { class: 'k-val' });
    wrap.append(k, lbl, valEl);

    const ARC = 0.75; // fraction of full circle used (270deg)
    function frac() {
      if (curve === 'exp' && min > 0) return U.clamp(Math.log(val / min) / Math.log(max / min), 0, 1);
      return (val - min) / (max - min);
    }
    function draw() {
      const f = frac();
      prog.setAttribute('stroke-dashoffset', String(2 * Math.PI * r * (1 - f * ARC)));
      const ang = -135 + 270 * f;
      ind.setAttribute('transform', 'rotate(' + ang + ' ' + S / 2 + ' ' + S / 2 + ')');
      valEl.textContent = opts.fmt ? opts.fmt(val) : val.toFixed(2);
    }
    function setVal(v, fire) {
      val = U.clamp(v, min, max);
      if (step > 0) val = Math.round(val / step) * step;
      draw();
      if (fire !== false && opts.onInput) opts.onInput(val);
    }
    function setFromFrac(f) {
      f = U.clamp(f, 0, 1);
      let v;
      if (curve === 'exp' && min > 0) v = min * Math.pow(max / min, f);
      else v = min + f * (max - min);
      setVal(v);
    }

    let dragging = false, startY = 0, startF = 0;
    k.addEventListener('pointerdown', e => {
      dragging = true; startY = e.clientY; startF = frac();
      try { k.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    k.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dy = startY - e.clientY;           // up = more
      const fine = e.shiftKey ? 0.25 : 1;
      setFromFrac(startF + (dy / 150) * fine);
    });
    k.addEventListener('pointerup', () => { dragging = false; });
    k.addEventListener('dblclick', () => {
      window.P9UI.promptModal({
        title: opts.label || 'Value',
        label: 'New value (' + min + ' .. ' + max + '):',
        value: String(Math.round(val * 1000) / 1000),
      }).then(txt => {
        if (txt == null) return;
        const n = parseFloat(txt);
        if (Number.isFinite(n)) setVal(n);
      });
    });
    k.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (opts.defValue != null) setVal(opts.defValue);
    });

    draw();
    return { el: wrap, set: v => setVal(v, false), get: () => val };
  };

  /* ---------- vertical fader: top = louder ---------- */
  U.fader = function fader(opts) {
    const min = opts.min != null ? opts.min : 0;
    const max = opts.max != null ? opts.max : 1.25;
    let val = U.clamp(opts.value, min, max);
    const height = opts.height || 150;

    const zone = U.el('div', { class: 'fader' });
    zone.style.height = height + 'px';
    const track = U.el('div', { class: 'fader-track' });
    const cap = U.el('div', { class: 'fader-cap' });
    zone.append(track, cap);

    function draw() {
      const f = (val - min) / (max - min);          // 0 at bottom, 1 at top
      zone.dataset.value = String(Math.round(val * 1000) / 1000);
      const usable = height - 24;                    // keep cap inside
      cap.style.top = (12 + (1 - f) * usable) + 'px';// f=1 -> top
    }
    function setFromY(clientY) {
      const rect = zone.getBoundingClientRect();
      const rel = clientY - rect.top;                // 0 at top of element
      const f = 1 - U.clamp((rel - 12) / (height - 24), 0, 1); // top => 1
      val = min + f * (max - min);
      draw();
      if (opts.onInput) opts.onInput(val);
    }
    let dragging = false;
    zone.addEventListener('pointerdown', e => {
      dragging = true;
      try { zone.setPointerCapture(e.pointerId); } catch (err) {}
      setFromY(e.clientY);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', e => { if (dragging) setFromY(e.clientY); });
    zone.addEventListener('pointerup', () => {
      dragging = false;
      if (opts.onCommit) opts.onCommit(val);
    });
    zone.addEventListener('dblclick', () => {
      val = 0.85; draw();
      if (opts.onInput) opts.onInput(val);
      if (opts.onCommit) opts.onCommit(val);
    });
    draw();
    return {
      el: zone,
      set(v) { val = U.clamp(v, min, max); draw(); },
      get: () => val,
    };
  };

  /* ---------- horizontal slider ---------- */
  U.slider = function slider(opts) {
    const inp = U.el('input', { type: 'range', class: 'vol', title: opts.title || '' });
    if (opts.width) inp.style.width = opts.width;
    inp.min = opts.min != null ? opts.min : 0;
    inp.max = opts.max != null ? opts.max : 1;
    inp.step = opts.step != null ? opts.step : 0.01;
    inp.value = opts.value;
    const paint = () => {
      const f = (parseFloat(inp.value) - parseFloat(inp.min)) / (parseFloat(inp.max) - parseFloat(inp.min));
      inp.style.setProperty('--fill', (f * 100).toFixed(1) + '%');
    };
    inp.addEventListener('input', () => {
      paint();
      if (opts.onInput) opts.onInput(parseFloat(inp.value));
    });
    paint();
    return inp;
  };

  /* ---------- context menu ---------- */
  U.menu = function menu(items, x, y) {
    const layer = document.getElementById('menu-layer');
    layer.hidden = false;
    layer.innerHTML = '';
    const m = U.el('div', { class: 'ctx-menu' });
    for (const it of items) {
      if (it === '-') { m.append(U.el('div', { class: 'sep' })); continue; }
      const row = U.el('div', { class: 'mi' });
      row.append(U.el('span', {}, it.label));
      if (it.kbd) row.append(U.el('span', { class: 'kbd' }, it.kbd));
      row.addEventListener('click', () => { close(); it.action && it.action(); });
      m.append(row);
    }
    layer.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = U.clamp(x, 4, window.innerWidth - r.width - 6) + 'px';
    m.style.top = U.clamp(y, 4, window.innerHeight - r.height - 6) + 'px';
    layer.onmousedown = e => { if (e.target === layer) close(); };
    function close() { layer.hidden = true; layer.innerHTML = ''; layer.onmousedown = null; }
    return close;
  };
  U.closeMenu = function closeMenu() {
    const layer = document.getElementById('menu-layer');
    layer.hidden = true; layer.innerHTML = ''; layer.onmousedown = null;
  };

  /* ---------- modal ---------- */
  U.modal = function modal(opts) {
    const layer = document.getElementById('modal-layer');
    const box = document.getElementById('modal-box');
    layer.hidden = false;
    document.getElementById('modal-title').textContent = opts.title || '';
    const bodyEl = document.getElementById('modal-body');
    bodyEl.innerHTML = '';
    if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
    else if (opts.body) bodyEl.append(opts.body);
    const btns = document.getElementById('modal-btns');
    btns.innerHTML = '';
    const close = () => { layer.hidden = true; btns.innerHTML = ''; layer.onmousedown = null; };
    for (const b of opts.buttons || [{ label: 'OK', primary: true }]) {
      const cls = 'modal-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      const el = U.el('button', { class: cls }, b.label);
      el.addEventListener('click', () => { close(); b.action && b.action(); });
      btns.append(el);
    }
    box.style.width = opts.wide ? opts.wide + 'px' : '';
    layer.onmousedown = e => { if (e.target === layer) close(); };
    return close;
  };

  U.promptModal = function promptModal(opts) {
    return new Promise(resolve => {
      const body = U.el('div', {});
      body.append(U.el('div', { style: 'margin-bottom:8px;color:var(--txt)' }, opts.label || ''));
      const inputEl = U.el('input', { class: 'modal-input' });
      inputEl.value = opts.value != null ? String(opts.value) : '';
      body.append(inputEl);
      U.modal({
        title: opts.title,
        body,
        buttons: [
          { label: 'Cancel', action: () => resolve(null) },
          { label: opts.ok || 'OK', primary: true, action: () => resolve(inputEl.value) },
        ],
      });
      setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30);
    });
  };

  /* ---------- toast ---------- */
  U.toast = function toast(msg, kind) {
    const layer = document.getElementById('toast-layer');
    const t = U.el('div', { class: 'toast' + (kind ? ' ' + kind : '') }, msg);
    layer.append(t);
    setTimeout(() => { t.style.transition = 'opacity .35s'; t.style.opacity = '0'; }, 2400);
    setTimeout(() => t.remove(), 2850);
  };

  /* ---------- status line ---------- */
  U.status = function status(msg) {
    const el = document.getElementById('status-msg');
    if (el) el.textContent = msg;
  };

  /* ---------- drag helper with threshold (window-level move/up listeners) ---------- */
  U.dragHelper = function dragHelper(el, hooks) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY;
      let started = false;
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!started && Math.hypot(dx, dy) < (hooks.threshold || 3)) return;
        if (!started) { started = true; hooks.onStart && hooks.onStart({ x: sx, y: sy }, ev); }
        hooks.onMove && hooks.onMove({ x: ev.clientX, y: ev.clientY, dx: dx, dy: dy }, ev);
      };
      const up = ev => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (started) hooks.onEnd && hooks.onEnd({ x: ev.clientX, y: ev.clientY, dx: ev.clientX - sx, dy: ev.clientY - sy }, ev);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      e.preventDefault();
    });
  };
})();
