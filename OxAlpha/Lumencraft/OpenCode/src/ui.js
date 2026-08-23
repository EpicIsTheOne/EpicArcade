// UI: HUD (hotbar/stats/toasts/debug), inventory model, drag-drop windows
// (inventory/crafting/furnace/chest), tooltips.
import * as THREE from 'three';
import { getItemIcon } from './icons.js';
import { ITEMS, itemName, isBlockItem } from './items.js';
import { B, BLOCKS } from './blocks.js';
import { RECIPES, matchRecipe, SMELTING } from './recipes.js';

// ---------------- inventory ----------------
export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // 0-8 hotbar
    this.selected = 0;
    this.onChange = null;
  }
  held() { return this.slots[this.selected]; }
  _changed() { if (this.onChange) this.onChange(); }

  give(id, count = 1, dur) {
    const max = isBlockItem(id) ? 64 : (ITEMS[id]?.stack ?? 64);
    let left = count;
    for (let pass = 0; pass < 2 && left > 0; pass++) {
      for (let i = 0; i < 36 && left > 0; i++) {
        const s = this.slots[i];
        if (pass === 0) {
          if (s && s.id === id && s.count < max) {
            const add = Math.min(max - s.count, left);
            s.count += add; left -= add;
          }
        } else if (!s) {
          const add = Math.min(max, left);
          this.slots[i] = { id, count: add, dur: dur !== undefined ? dur : (ITEMS[id]?.durability ? ITEMS[id].durability : undefined) };
          left -= add;
        }
      }
    }
    this._changed();
    return left;
  }

  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  removeCount(id, count) {
    let need = count;
    for (let i = 35; i >= 0 && need > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, need);
        s.count -= take; need -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this._changed();
    return need === 0;
  }

  serialize() { return this.slots.map(s => s ? [s.id, s.count, s.dur ?? -1] : null); }
  deserialize(arr) {
    this.slots = arr.map(v => v ? { id: v[0], count: v[1], dur: v[2] === -1 ? undefined : v[2] } : null);
    this._changed();
  }
}

// ---------------- pip icons ----------------
function makePip(drawFn, size = 18) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 9;
  const c = cv.getContext('2d');
  drawFn(c);
  cv.style.width = cv.style.height = size + 'px';
  cv.style.imageRendering = 'pixelated';
  return cv;
}

const PIP_ART = {
  heartFull: (c) => {
    c.fillStyle = '#e8323c';
    c.fillRect(1, 1, 3, 2); c.fillRect(5, 1, 3, 2);
    c.fillRect(0, 2, 9, 3); c.fillRect(1, 5, 7, 1); c.fillRect(2, 6, 5, 1); c.fillRect(3, 7, 3, 1); c.fillRect(4, 8, 1, 0);
    c.fillStyle = '#ff8a90'; c.fillRect(2, 2, 1, 1);
  },
  heartEmpty: (c) => {
    c.fillStyle = '#2a1218';
    c.fillRect(1, 1, 3, 2); c.fillRect(5, 1, 3, 2);
    c.fillRect(0, 2, 9, 3); c.fillRect(1, 5, 7, 1); c.fillRect(2, 6, 5, 1); c.fillRect(3, 7, 3, 1);
  },
  foodFull: (c) => {
    c.fillStyle = '#b5713a';
    c.fillRect(4, 1, 3, 4); c.fillRect(3, 4, 5, 3);
    c.fillStyle = '#e0e4d8'; c.fillRect(1, 6, 3, 2);
    c.fillStyle = '#8a5228'; c.fillRect(5, 2, 1, 2);
  },
  foodEmpty: (c) => {
    c.fillStyle = '#241a10';
    c.fillRect(4, 1, 3, 4); c.fillRect(3, 4, 5, 3); c.fillRect(1, 6, 3, 2);
  },
  bubble: (c) => {
    c.fillStyle = '#7ac0ff';
    c.fillRect(2, 1, 5, 1); c.fillRect(1, 2, 7, 5); c.fillRect(2, 7, 5, 1);
    c.fillStyle = '#d8ecff'; c.fillRect(2, 2, 2, 2);
  },
};

// ---------------- UI ----------------
export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      hotbar: document.getElementById('hotbar'),
      hearts: document.getElementById('hearts'),
      hunger: document.getElementById('hunger'),
      breathRow: document.getElementById('breathRow'),
      toasts: document.getElementById('toasts'),
      debug: document.getElementById('debug'),
      tooltip: document.getElementById('tooltip'),
      dmgVignette: document.getElementById('vignette-damage'),
      underwaterTint: document.getElementById('underwater-tint'),
      sleepFade: document.getElementById('sleep-fade'),
      flash: document.getElementById('flash'),
      cursorItem: document.getElementById('cursorItem'),
    };

    this.inv = new Inventory();
    this.windows = ['inventory', 'crafting', 'furnace', 'chest'].map(n => document.getElementById('win-' + n));
    this.openWindow = null;
    this.cursorStack = null;
    this.craftGrid = [];
    this.craftSize = 2;
    this.currentContainerKey = null;

    this.pips = {};
    for (const k of Object.keys(PIP_ART)) this.pips[k] = makePip(PIP_ART[k]);

    this._buildHotbar();
    this._wireCursor();

    this.inv.onChange = () => { this.refreshHotbar(); this.refreshOpenWindow(); };
    this._lastHud = '';
    this.debugVisible = false;
  }

  // ---------- helpers ----------
  hotbarSelected() { return this.inv.held(); }
  replaceHotbarSlot(stack) {
    this.inv.slots[this.inv.selected] = stack;
    this.inv._changed();
  }

  toast(msg, ms = 2600) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; }, ms - 500);
    setTimeout(() => d.remove(), ms);
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('open'));
    if (id) document.getElementById(id)?.classList.add('open');
  }
  anyScreenOpen() { return [...document.querySelectorAll('.screen')].some(s => s.classList.contains('open')); }
  uiOpen() { return !!this.openWindow || this.anyScreenOpen(); }

  // ---------- hotbar ----------
  _buildHotbar() {
    this.hotbarEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === 0 ? ' sel' : '');
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      slot.appendChild(cv);
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      slot.appendChild(cnt);
      const dur = document.createElement('div');
      dur.className = 'dur';
      dur.innerHTML = '<i></i>';
      slot.appendChild(dur);
      this.el.hotbar.appendChild(slot);
      this.hotbarEls.push({ slot, cv, ctx: cv.getContext('2d'), cnt, dur });
    }
  }

  _drawStack(ctxEl, stack) {
    const { cv, ctx, cnt, dur } = ctxEl;
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);
    cnt.textContent = '';
    if (dur) dur.style.display = 'none';
    if (!stack) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(getItemIcon(stack.id), 0, 0);
    if (stack.count > 1) cnt.textContent = stack.count;
    const def = !isBlockItem(stack.id) ? ITEMS[stack.id] : null;
    if (def?.durability && dur) {
      const frac = Math.max(0, Math.min(1, (stack.dur ?? def.durability) / def.durability));
      dur.style.display = 'block';
      const bar = dur.firstElementChild;
      bar.style.width = (frac * 100) + '%';
      bar.style.background = frac > 0.5 ? '#5ae05a' : frac > 0.25 ? '#e0c05a' : '#e05a5a';
    }
  }

  refreshHotbar() {
    for (let i = 0; i < 9; i++) {
      const el = this.hotbarEls[i];
      el.slot.classList.toggle('sel', i === this.inv.selected);
      this._drawStack(el, this.inv.slots[i]);
    }
  }

  selectSlot(i) {
    this.inv.selected = ((i % 9) + 9) % 9;
    this.refreshHotbar();
    this.refreshOpenWindow(); // highlight sync
  }

  // ---------- HUD stats ----------
  updateHUD(player) {
    const hp = Math.ceil(player.hp);
    const hu = Math.ceil(player.hunger);
    const br = Math.ceil(Math.max(0, player.breath));
    const key = `${hp}|${hu}|${br}|${player.headInWater}`;
    if (key === this._lastHud) return;
    this._lastHud = key;

    const buildRow = (el, value, artFull, artEmpty, maxPips) => {
      el.innerHTML = '';
      for (let i = 0; i < maxPips; i++) {
        el.appendChild(makePip(value >= i * 2 + 1 ? PIP_ART[artFull] : PIP_ART[artEmpty]));
      }
    };
    buildRow(this.el.hearts, hp, 'heartFull', 'heartEmpty', 10);
    buildRow(this.el.hunger, hu, 'foodFull', 'foodEmpty', 10);

    this.el.breathRow.style.display = player.headInWater ? 'flex' : 'none';
    if (player.headInWater) {
      this.el.breathRow.innerHTML = '';
      for (let i = 0; i < Math.ceil(br / 2); i++) this.el.breathRow.appendChild(this.pip(PIP_ART.bubble));
    }
  }

  pip(art) { return makePip(art); }

  setDamageFlash(v) { this.el.dmgVignette.style.opacity = String(Math.min(1, v)); }
  setUnderwaterTint(on) { this.el.underwaterTint.style.opacity = on ? '1' : '0'; }
  setSleepFade(v) { this.el.sleepFade.style.opacity = String(v); }
  setFlash(v) { this.el.flash.style.opacity = String(v); }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.el.debug.style.display = this.debugVisible ? 'block' : 'none';
  }
  setDebugText(t) { if (this.debugVisible) this.el.debug.textContent = t; }

  // ---------- tooltips ----------
  _tooltipFor(stack) {
    if (!stack) return '';
    const def = !isBlockItem(stack.id) ? ITEMS[stack.id] : BLOCKS[stack.id];
    let html = `<b>${def?.name ?? itemName(stack.id)}</b>`;
    if (def?.food) html += `<br><span style="color:#8fd48f">Restores ${def.food.hunger} hunger</span>`;
    if (def?.toolClass) html += `<br><span style="color:#aaa">${def.toolClass} · tier ${def.tier}</span>`;
    if (def?.durability) html += `<br><span style="color:#e0a85a">Durability ${stack.dur ?? def.durability}/${def.durability}</span>`;
    if (isBlockItem(stack.id)) html += `<br><span style="color:#889">Placeable block</span>`;
    return html;
  }

  _showTooltip(evt, stack) {
    const t = this.el.tooltip;
    const html = this._tooltipFor(stack);
    if (!html) { t.style.display = 'none'; return; }
    t.innerHTML = html;
    t.style.display = 'block';
    const x = Math.min(window.innerWidth - 280, evt.clientX + 14);
    const y = Math.min(window.innerHeight - 80, evt.clientY + 10);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  _hideTooltip() { this.el.tooltip.style.display = 'none'; }

  // ---------- cursor stack ----------
  _wireCursor() {
    const cur = this.el.cursorItem;
    document.addEventListener('mousemove', (e) => {
      if (!this.cursorStack) { cur.style.display = 'none'; return; }
      cur.style.display = 'block';
      cur.style.left = (e.clientX - 20) + 'px';
      cur.style.top = (e.clientY - 20) + 'px';
      this._showTooltip(e, this.cursorStack);
    });
  }

  _updateCursorVisual() {
    const cur = this.el.cursorItem;
    const cv = cur.querySelector('canvas');
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, 64, 64);
    const cnt = cur.querySelector('.cnt');
    cnt.textContent = '';
    if (this.cursorStack) {
      cx.drawImage(getItemIcon(this.cursorStack.id), 0, 0);
      if (this.cursorStack.count > 1) cnt.textContent = this.cursorStack.count;
    }
  }

  // ---------- generic slot element ----------
  _makeSlot(getter, setter, opts = {}) {
    const slot = document.createElement('div');
    slot.className = 'gslot' + (opts.cls ? ' ' + opts.cls : '');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    slot.appendChild(cv);
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    slot.appendChild(cnt);
    const durEl = document.createElement('div');
    durEl.className = 'dur';
    durEl.innerHTML = '<i></i>';
    slot.appendChild(durEl);
    const entry = { cv, ctx: cv.getContext('2d'), cnt, dur: durEl };
    const redraw = () => this._drawStack(entry, getter());

    slot.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = this.cursorStack;
      const st = getter();
      if (opts.outputOnly) {
        // take-only (craft result)
        if (st && (!cur || (cur.id === st.id && cur.count + st.count <= 64))) {
          opts.onTake?.(e.shiftKey);
        }
        return;
      }
      if (!opts.container && e.button === 0 && e.shiftKey && st) {
        opts.quickMove?.(entry, st);
        return;
      }
      if (e.button === 0) {
        if (cur && st && cur.id === st.id && st.count < 64) {
          const add = Math.min(64 - st.count, cur.count);
          setter({ ...st, count: st.count + add });
          cur.count -= add;
          if (cur.count <= 0) this.cursorStack = null;
        } else {
          setter(cur);
          this.cursorStack = st;
        }
      } else if (e.button === 2) {
        if (cur) {
          if (!st) { setter({ ...cur, count: 1 }); cur.count--; }
          else if (st.id === cur.id && st.count < 64) { setter({ ...st, count: st.count + 1 }); cur.count--; }
          if (cur.count <= 0) this.cursorStack = null;
        } else if (st) {
          const half = Math.ceil(st.count / 2);
          this.cursorStack = { ...st, count: half };
          const rest = st.count - half;
          setter(rest > 0 ? { ...st, count: rest } : null);
        }
      }
      this._updateCursorVisual();
      this.refreshOpenWindow();
      this.refreshHotbar();
      this.game.audio?.click();
    });

    slot.addEventListener('contextmenu', e => e.preventDefault());
    slot.addEventListener('mouseenter', (e) => this._showTooltip(e, getter()));
    slot.addEventListener('mouseleave', () => this._hideTooltip());

    const entryRef = { slot, redraw };
    slot._entryRef = entryRef;
    return entryRef;
  }

  _grid(container, n, cols, getters, setters, optsEach) {
    container.style.gridTemplateColumns = `repeat(${cols}, 46px)`;
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = this._makeSlot(getters[i], setters[i], optsEach ? optsEach(i) : {});
      container.appendChild(s.slot);
      out.push(s);
    }
    return out;
  }

  // ---------- windows ----------
  closeWindows(returnItems = true) {
    if (!this.openWindow) return false;
    // return crafting grid contents
    if (returnItems) {
      for (const s of this.craftGrid) {
        if (s) {
          const left = this.inv.give(s.id, s.count, s.dur);
          if (left > 0 && this.game.spawnDrop) this.game.spawnDrop(this.game.player.pos.x, this.game.player.pos.y + 1, this.game.player.pos.z, s.id, left);
        }
      }
      if (this.cursorStack) {
        const left = this.inv.give(this.cursorStack.id, this.cursorStack.count, this.cursorStack.dur);
        if (left > 0 && this.game.spawnDrop) this.game.spawnDrop(this.game.player.pos.x, this.game.player.pos.y + 1, this.game.player.pos.z, this.cursorStack.id, left);
        this.cursorStack = null;
        this._updateCursorVisual();
      }
    }
    this.craftGrid = [];
    this.openWindow.classList.remove('open');
    this.openWindow = null;
    this.currentContainerKey = null;
    this._hideTooltip();
    return true;
  }

  _invRegion(win, quickTarget) {
    // returns {elements, quickMoveInto}
    const wrap = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = 'Inventory';
    wrap.appendChild(h);
    const gridMain = document.createElement('div');
    gridMain.className = 'grid';
    gridMain.style.gridTemplateColumns = 'repeat(9, 46px)';
    win.appendChild(wrap);
    wrap.appendChild(gridMain);

    const elsMain = [];
    const mkInvSlot = (idx, parent, arr) => {
      const s = this._makeSlot(
        () => this.inv.slots[idx],
        (v) => { this.inv.slots[idx] = v; },
        { quickMove: () => { if (quickTarget) quickTarget(idx); } });
      parent.appendChild(s.slot);
      arr.push(s);
      return s;
    };
    for (let i = 9; i < 36; i++) mkInvSlot(i, gridMain, elsMain);

    const gridHot = document.createElement('div');
    gridHot.className = 'grid';
    gridHot.style.gridTemplateColumns = 'repeat(9, 46px)';
    gridHot.style.marginTop = '10px';
    wrap.appendChild(gridHot);
    const elsHot = [];
    for (let i = 0; i < 9; i++) mkInvSlot(i, gridHot, elsHot);

    return { elsMain, elsHot };
  }

  _quickMoveToInventory(stackRef, idx) {
    // move from container/craft into inventory
    const left = this.inv.give(stackRef.id, stackRef.count, stackRef.dur);
    if (left === 0) this._setExternalSlot(idx, null);
    else this._setExternalSlot(idx, { ...stackRef, count: left });
  }

  _setExternalSlot(idx, v) {
    if (this.externalSlots) this.externalSlots[idx] = v;
  }

  openInventory() {
    if (this.openWindow) this.closeWindows();
    const win = this.windows[0];
    win.innerHTML = '<h3>Inventory</h3>';
    this.craftSize = 2;
    this.craftGrid = new Array(4).fill(null);
    this.craftEls = [];

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;gap:16px;margin-bottom:12px;align-items:center;';
    win.appendChild(top);

    const cg = document.createElement('div');
    cg.className = 'grid';
    cg.style.gridTemplateColumns = 'repeat(2, 46px)';
    top.appendChild(cg);
    for (let i = 0; i < 4; i++) {
      const s = this._makeSlot(
        () => this.craftGrid[i],
        (v) => { this.craftGrid[i] = v; this._refreshCraftResult(); },
        { quickMove: () => {} });
      cg.appendChild(s.slot);
      this.craftEls.push(s);
    }

    const arrow = document.createElement('div');
    arrow.className = 'arrow-ico';
    arrow.textContent = '→';
    top.appendChild(arrow);

    const resEl = this._makeSlot(() => this.craftResult(), () => {}, {
      outputOnly: true,
      cls: 'result',
      onTake: (shift) => this._takeCraftResult(shift),
    });
    top.appendChild(resEl.slot);
    this.resultEl = resEl;

    this._invRegion(win, null);
    this._finalizeOpen(win, 'inventory');
    this._refreshCraftResult();
  }

  openCraftingTable() {
    if (this.openWindow) this.closeWindows();
    const win = this.windows[1];
    win.innerHTML = '<h3>Crafting Table</h3>';
    this.craftSize = 3;
    this.craftGrid = new Array(9).fill(null);

    const layout = document.createElement('div');
    layout.style.cssText = 'display:flex;gap:18px;';
    win.appendChild(layout);

    const leftCol = document.createElement('div');
    layout.appendChild(leftCol);

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;gap:12px;margin-bottom:12px;';
    leftCol.appendChild(top);

    const cg = document.createElement('div');
    cg.className = 'grid';
    cg.style.gridTemplateColumns = 'repeat(3, 46px)';
    top.appendChild(cg);
    const craftEls = [];
    for (let i = 0; i < 9; i++) {
      const s = this._makeSlot(
        () => this.craftGrid[i],
        (v) => { this.craftGrid[i] = v; this._refreshCraftResult(); },
        { quickMove: () => {} });
      cg.appendChild(s.slot);
      craftEls.push(s);
    }

    const arrow = document.createElement('div');
    arrow.className = 'arrow-ico';
    arrow.textContent = '→';
    top.appendChild(arrow);

    const resEl = this._makeSlot(() => this.craftResult(), () => {}, {
      outputOnly: true, cls: 'result',
      onTake: (shift) => this._takeCraftResult(shift),
    });
    top.appendChild(resEl.slot);
    this.resultEl = resEl;

    // recipe book
    const book = document.createElement('div');
    book.style.cssText = 'width:236px;max-height:330px;overflow-y:auto;padding:8px;background:#14182499;border-radius:8px;';
    book.innerHTML = '<h3 style="margin-bottom:6px">Recipes</h3>';
    for (const r of RECIPES) {
      const item = document.createElement('span');
      item.className = 'recipe-item';
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      cv.getContext('2d').drawImage(getItemIcon(r.out), 0, 0);
      item.appendChild(cv);
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:11px;color:#ccd;margin-left:4px';
      lbl.textContent = `${itemName(r.out)}${r.count > 1 ? ' ×' + r.count : ''}`;
      item.appendChild(lbl);
      item.title = 'Click to auto-fill if you have materials';
      item.addEventListener('click', () => this._autoFill(r));
      book.appendChild(item);
    }
    layout.appendChild(book);

    this._invRegion(leftCol, null);
    this._finalizeOpen(win, 'crafting');
    this.craftEls = craftEls;
    this._refreshCraftResult();
  }

  _autoFill(recipe) {
    // clear grid back to inventory
    for (let i = 0; i < this.craftGrid.length; i++) {
      const s = this.craftGrid[i];
      if (s) { this.inv.give(s.id, s.count, s.dur); this.craftGrid[i] = null; }
    }
    // gather needed ingredients
    const need = {};
    for (const row of recipe.pattern) for (const ch of row) {
      const id = recipe.key[ch];
      need[id] = (need[id] || 0) + 1;
    }
    for (const [id, n] of Object.entries(need)) {
      const have = this.inv.countOf(isNaN(+id) ? id : +id);
      if (have < n) { this.toast(`Missing ${itemName(isNaN(+id) ? id : +id)}`); return; }
    }
    // place into grid
    const idOf = (ch) => recipe.key[ch];
    for (let y = 0; y < recipe.pattern.length; y++) {
      for (let x = 0; x < recipe.pattern[y].length; x++) {
        const ch = recipe.pattern[y][x];
        const gi = y * this.craftSize + x;
        if (this.craftSize === 2 && (y > 1 || x > 1)) continue;
        if (!ch) continue;
        const id = idOf(ch);
        if (this.inv.removeCount(id, 1)) this.craftGrid[gi] = { id, count: 1 };
      }
    }
    this.inv._changed();
    this.refreshOpenWindow();
    this._refreshCraftResult();
    this.game.audio?.click();
  }

  craftResult() {
    if (!this.craftGrid.length) return null;
    const r = matchRecipe(this.craftGrid, this.craftSize);
    if (!r) return null;
    return { id: r.out, count: r.count, _recipe: r };
  }

  _refreshCraftResult() {
    if (this.resultEl) this._drawStack(this.resultEl, this.craftResult());
  }

  _takeCraftResult(shift) {
    let made = 0;
    do {
      const res = this.craftResult();
      if (!res) break;
      const r = res._recipe;
      // consume
      for (let i = 0; i < this.craftGrid.length; i++) {
        const s = this.craftGrid[i];
        if (s) { s.count--; if (s.count <= 0) this.craftGrid[i] = null; }
      }
      if (shift) {
        const left = this.inv.give(res.id, res.count);
        if (left > 0) { /* inventory full */ }
      } else {
        const cur = this.cursorStack;
        if (cur && cur.id === res.id) cur.count += res.count;
        else if (!cur) this.cursorStack = { id: res.id, count: res.count };
        else break;
      }
      made++;
    } while (shift && made < 64);
    if (made > 0) {
      this.game.audio?.craft();
      this._updateCursorVisual();
      this.refreshOpenWindow();
      this.refreshHotbar();
      this._refreshCraftResult();
    }
  }

  openFurnace(x, y, z) {
    if (this.openWindow) this.closeWindows();
    const win = this.windows[2];
    win.innerHTML = '<h3>Furnace</h3>';
    const cont = this.game.world.getContainer(x, y, z, 'furnace');
    this.currentContainerKey = x + ',' + y + ',' + z;
    this.extType = 'furnace';

    const row = document.createElement('div');
    row.className = 'furn-grid';
    win.appendChild(row);

    const colL = document.createElement('div');
    colL.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
    row.appendChild(colL);

    const inSlot = this._extSlot(cont, 0, true);
    colL.appendChild(inSlot.slot);

    const flame = document.createElement('div');
    flame.className = 'flame';
    flame.textContent = '🔥';
    colL.appendChild(flame);
    this.furnFlame = flame;

    const fuelSlot = this._extSlot(cont, 1, true);
    colL.appendChild(fuelSlot.slot);

    const mid = document.createElement('div');
    mid.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';
    row.appendChild(mid);
    const prog = document.createElement('div');
    prog.className = 'progress';
    prog.innerHTML = '<i></i>';
    mid.appendChild(prog);
    this.furnProg = prog.firstElementChild;
    const arrow = document.createElement('div');
    arrow.className = 'arrow-ico';
    arrow.textContent = '→';
    mid.appendChild(arrow);

    const outSlot = this._extSlot(cont, 2, true, { outputOnly: true });
    row.appendChild(outSlot.slot);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Smelt ores, sand, cobblestone and raw food. Fuel: coal, charcoal, planks, sticks…';
    win.appendChild(hint);

    this._invRegion(win, null);
    this._finalizeOpen(win, 'furnace');
    this.furnacePos = [x, y, z];
  }

  openChest(x, y, z) {
    if (this.openWindow) this.closeWindows();
    const win = this.windows[3];
    win.innerHTML = '<h3>Chest</h3>';
    const cont = this.game.world.getContainer(x, y, z, 'chest');
    this.currentContainerKey = x + ',' + y + ',' + z;
    this.extType = 'chest';

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.gridTemplateColumns = 'repeat(9, 46px)';
    win.appendChild(grid);
    for (let i = 0; i < 27; i++) grid.appendChild(this._extSlot(cont, i).slot);

    this._invRegion(win, null);
    this._finalizeOpen(win, 'chest');
  }

  _extSlot(cont, idx, allowQuick, opts = {}) {
    return this._makeSlot(
      () => cont.slots[idx],
      (v) => { cont.slots[idx] = v; },
      {
        ...opts,
        container: true,
        outputOnly: opts.outputOnly || false,
        quickMove: allowQuick === false ? undefined : () => {
          const st = cont.slots[idx];
          if (!st) return;
          const left = this.inv.give(st.id, st.count, st.dur);
          cont.slots[idx] = left > 0 ? { ...st, count: left } : null;
        },
      });
  }

  _finalizeOpen(win, name) {
    this.openWindow = win;
    win.classList.add('open');
    this.game.releasePointer();
    this.refreshOpenWindow();
  }

  refreshOpenWindow() {
    if (!this.openWindow) return;
    if (this.craftEls) for (const s of this.craftEls) s.redraw();
    if (this.resultEl) this._drawStack(this.resultEl, this.craftResult());
    this.openWindow.querySelectorAll('.gslot').forEach(el => {
      if (el._entryRef) el._entryRef.redraw();
    });
  }

  tickFurnaceWindow() {
    if (!this.openWindow || this.extType !== 'furnace' || !this.currentContainerKey) return;
    const c = this.game.world.containers.get(this.currentContainerKey);
    if (!c) return;
    const input = c.slots[0];
    const rec = input ? SMELTING[input.id] : null;
    const total = rec ? rec[1] : 10;
    this.furnProg.style.width = `${Math.min(100, (c.progress / total) * 100)}%`;
    this.furnFlame.style.setProperty('--g', c.burnLeft > 0 ? '0' : '1');
    // refresh slots as furnace mutates them
    this.refreshOpenWindow();
  }
}
