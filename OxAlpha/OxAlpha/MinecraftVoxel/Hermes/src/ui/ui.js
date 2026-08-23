// UI controller: hotbar rendering, inventory/crafting/station screens with
// drag-style cursor stack, pause/options/death screens, toasts, debug HUD.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { ITEMS, RECIPES, matchRecipe, itemName } = __RQ('../shared/blocks.js');
const { drawItemIcon } = __RQ('./icons.js');

class UI {
  constructor(game) {
    this.game = game;
    this.$ = (s) => document.querySelector(s);
    this.hotbarSlots = [];
    this.cursorStack = null;
    this.openScreen = null;   // null | 'inventory' | 'chest' | 'furnace'
    this.stationPos = null;
    this.tab = 'grid';
    this.buildHotbar();
    this.buildInvGrid();
    this.bindMenus();
    window.__ui = this;
  }

  toast(msg) {
    const w = this.$('#toastwrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    w.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // ---------- HUD ----------
  buildHotbar() {
    const hb = this.$('#hotbar');
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      const c = document.createElement('canvas'); c.width = c.height = 36;
      d.appendChild(c);
      const cnt = document.createElement('span'); cnt.className = 'cnt'; d.appendChild(cnt);
      const dur = document.createElement('div'); dur.className = 'dur'; dur.innerHTML = '<i></i>'; d.appendChild(dur);
      const key = document.createElement('span'); key.className = 'key'; key.textContent = i + 1; d.appendChild(key);
      hb.appendChild(d);
      this.hotbarSlots.push({ root: d, canvas: c, cnt, dur });
    }
  }

  renderHotbar(inv) {
    for (let i = 0; i < 9; i++) {
      const s = inv.slots[i];
      const ui = this.hotbarSlots[i];
      ui.root.classList.toggle('sel', i === inv.hotbar);
      const g = ui.canvas.getContext('2d');
      g.clearRect(0, 0, 36, 36);
      if (s) {
        drawItemIcon(g, s.id, 36);
        ui.cnt.textContent = s.count > 1 ? s.count : '';
        if (s.dur !== undefined && ITEMS[s.id] && ITEMS[s.id].dur) {
          const f = s.dur / ITEMS[s.id].dur;
          ui.dur.style.display = f < 1 ? 'block' : 'none';
          const bar = ui.dur.firstElementChild;
          bar.style.width = (f * 100) + '%';
          bar.style.background = f > 0.5 ? '#6fdc6f' : f > 0.25 ? '#e8c04a' : '#e05545';
        } else ui.dur.style.display = 'none';
      } else { ui.cnt.textContent = ''; ui.dur.style.display = 'none'; }
    }
    // stats
    const pips = (el, val) => {
      let html = '';
      for (let i = 0; i < 10; i++) html += `<div class="pip ${i * 2 + 2 <= val ? 'on' : (i * 2 < val ? 'half on' : 'off')}"></div>`;
      el.innerHTML = html;
    };
    pips(this.$('#health'), this.game.player.health);
    pips(this.$('#hunger'), Math.round(this.game.player.hunger));
  }

  hudInfo(fps, chunks, draws, tris, biomeName, pos, dayStr) {
    this.$('#fps').textContent = fps;
    this.$('#chunks').textContent = chunks;
    this.$('#drawcalls').textContent = draws;
    this.$('#tris').textContent = tris.toLocaleString();
    this.$('#biomename').textContent = biomeName || '';
    this.$('#coords').textContent = `x ${pos.x.toFixed(1)} y ${pos.y.toFixed(1)} z ${pos.z.toFixed(1)}`;
    this.$('#daytime').textContent = dayStr || '';
  }

  setWaterOverlay(on) { this.$('#wateroverlay').style.opacity = on ? '1' : '0'; }
  flashDamage() {
    const el = this.$('#damageflash');
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 130);
  }

  // ---------- Inventory screen ----------
  buildInvGrid() {
    const grid = this.$('#invGrid');
    this.invSlotEls = [];
    for (let i = 0; i < 36; i++) {
      const d = document.createElement('div');
      d.className = 'islot'; d.dataset.idx = i;
      d.addEventListener('mousedown', (ev) => { ev.preventDefault(); this.slotClick(i, ev.button); });
      const c = document.createElement('canvas'); c.width = c.height = 38; d.appendChild(c);
      const cnt = document.createElement('span'); cnt.className = 'cnt'; d.appendChild(cnt);
      const dur = document.createElement('div'); dur.className = 'dur'; dur.innerHTML = '<i></i>'; d.appendChild(dur);
      grid.appendChild(d);
      this.invSlotEls.push({ root: d, canvas: c, cnt });
    }
    // crafting grid 3x3
    const cg = this.$('#craftGrid');
    this.craftSlotEls = [];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'islot';
      d.addEventListener('mousedown', (ev) => { ev.preventDefault(); this.craftClick(i, ev.button); });
      const c = document.createElement('canvas'); c.width = c.height = 38; d.appendChild(c);
      const cnt = document.createElement('span'); cnt.className = 'cnt'; d.appendChild(cnt);
      cg.appendChild(d);
      this.craftSlotEls.push({ root: d, canvas: c, cnt });
    }
    this.$('#craftResultSlot').addEventListener('mousedown', (ev) => { ev.preventDefault(); this.takeCraftResult(ev.button === 2); });
    document.querySelectorAll('.itab').forEach(t => t.addEventListener('click', () => {
      document.querySelectorAll('.itab').forEach(x => x.classList.remove('act'));
      t.classList.add('act');
      this.tab = t.dataset.tab;
      this.$('#invGrid').style.display = this.tab === 'grid' ? 'grid' : 'none';
      this.$('#craftPane').style.display = this.tab === 'craft' ? 'block' : 'none';
      if (this.tab === 'craft') this.renderRecipeList();
    }));
    this.$('#invGrid').style.display = 'grid';
    this.$('#craftPane').style.display = 'none';
    // station grids
    this.stationSlotEls = [];
    this.$('#stationGrid').addEventListener('mousedown', (ev) => {
      const slotEl = ev.target.closest('.islot');
      if (slotEl && slotEl.dataset.sidx !== undefined) this.stationClick(parseInt(slotEl.dataset.sidx), ev.button);
    });
    document.addEventListener('mousemove', (e) => {
      const ci = this.$('#cursorItem');
      if (this.cursorStack) { ci.style.left = e.clientX - 20 + 'px'; ci.style.top = e.clientY - 20 + 'px'; }
    });
  }

  openInventory() {
    if (this.openScreen) return;
    this.openScreen = 'inventory';
    this.game.releaseControls();
    this.$('#invScreen').classList.add('on');
    this.$('#stationUI').style.display = 'none';
    this.$('#invTitle').textContent = 'Inventory';
    this.renderInventory();
  }

  openStation(kind, x, y, z) {
    if (this.openScreen) return false;
    this.openScreen = kind;
    this.stationPos = { kind, x, y, z };
    this.game.releaseControls();
    this.$('#invScreen').classList.add('on');
    this.$('#stationUI').style.display = 'grid';
    this.$('#stationTitle').textContent = kind === 'chest' ? 'Chest' : 'Furnace';
    const sg = this.$('#stationGrid');
    sg.innerHTML = '';
    this.stationSlotEls = [];
    const n = kind === 'chest' ? 27 : 3;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'islot'; d.dataset.sidx = i;
      const c = document.createElement('canvas'); c.width = c.height = 38; d.appendChild(c);
      const cnt = document.createElement('span'); cnt.className = 'cnt'; d.appendChild(cnt);
      sg.appendChild(d);
      this.stationSlotEls.push({ root: d, canvas: c, cnt });
    }
    this.$('#invTitle').textContent = '';
    this.renderInventory();
    return true;
  }

  closeScreens(relock) {
    if (!this.openScreen) return;
    // return crafting-grid items & cursor stack to inventory
    for (let i = 0; i < 9; i++) {
      const s = this.game.inventory.craftGrid[i];
      if (s) { this.game.inventory.add(s.id, s.count); this.game.inventory.craftGrid[i] = null; }
    }
    if (this.cursorStack) { this.game.inventory.add(this.cursorStack.id, this.cursorStack.count); this.cursorStack = null; }
    this.hideCursor();
    this.openScreen = null;
    this.stationPos = null;
    this.$('#invScreen').classList.remove('on');
    if (relock) this.game.grabControls();
  }

  renderInventory() {
    const inv = this.game.inventory;
    for (let i = 0; i < 36; i++) this.paintSlot(this.invSlotEls[i], inv.slots[i]);
    for (let i = 0; i < 9; i++) this.paintSlot(this.craftSlotEls[i], inv.craftGrid[i]);
    // result
    const ids = inv.craftGrid.map(s => s ? s.id : null);
    const r = matchRecipe(ids, 3);
    this.craftResult = r;
    this.paintSlot({ root: this.$('#craftResultSlot') }, r ? { id: r.out.item, count: r.out.count } : null, true);
    if (this.stationPos) {
      const { kind, x, y, z } = this.stationPos;
      const st = kind === 'chest' ? this.game.stations.getChest(x, y, z, true)
        : (() => { const f = this.game.stations.getFurnace(x, y, z, true); return [f.in, f.fuel, f.out]; })();
      for (let i = 0; i < this.stationSlotEls.length; i++) this.paintSlot(this.stationSlotEls[i], st[i] || null);
    }
    this.renderCursor();
    this.renderHotbar(inv);
  }

  paintSlot(el, stack, isResult) {
    const g = el.canvas ? el.canvas.getContext('2d') : null;
    if (g) {
      g.clearRect(0, 0, 38, 38);
      if (stack) drawItemIcon(g, stack.id, 38);
    }
    const cnt = el.root.querySelector('.cnt');
    if (cnt) cnt.textContent = stack && stack.count > 1 ? stack.count : '';
    if (isResult) el.root.style.borderColor = stack ? '#ffd76a' : '#5a86c4';
  }

  renderCursor() {
    const ci = this.$('#cursorItem');
    if (this.cursorStack) {
      ci.style.display = 'block';
      const g = ci.getContext('2d');
      g.clearRect(0, 0, 40, 40);
      drawItemIcon(g, this.cursorStack.id, 40);
    } else ci.style.display = 'none';
  }
  hideCursor() { this.$('#cursorItem').style.display = 'none'; }

  /** generic slot click handler over a container array */
  slotClick(i, button) {
    const inv = this.game.inventory;
    const arr = inv.slots;
    this.handleStackClick(arr, i, button);
    this.game.audio.click();
    this.renderInventory();
  }
  craftClick(i, button) {
    const inv = this.game.inventory;
    this.handleStackClick(inv.craftGrid, i, button);
    this.game.audio.click();
    this.renderInventory();
  }

  handleStackClick(arr, i, button) {
    const cur = this.cursorStack;
    const slot = arr[i];
    if (button === 0) {
      if (cur && slot && cur.id === slot.id && !ITEMS[slot.id].dur) {
        // merge
        const max = 64;
        const take = Math.min(max - slot.count, cur.count);
        slot.count += take; cur.count -= take;
        if (cur.count <= 0) this.cursorStack = null;
      } else {
        arr[i] = cur;
        this.cursorStack = slot || null;
      }
    } else if (button === 2) {
      if (cur) {
        // place one
        if (!slot) { arr[i] = { id: cur.id, count: 1, ...(ITEMS[cur.id].dur ? { dur: ITEMS[cur.id].dur } : {}) }; cur.count--; }
        else if (slot.id === cur.id && slot.count < 64) { slot.count++; cur.count--; }
        if (cur.count <= 0) this.cursorStack = null;
      } else if (slot) {
        // take half
        const half = Math.ceil(slot.count / 2);
        this.cursorStack = { id: slot.id, count: half };
        slot.count -= half;
        if (slot.count <= 0) arr[i] = null;
      }
    }
  }

  takeCraftResult(all) {
    const r = this.craftResult;
    if (!r) return;
    const inv = this.game.inventory;
    const doOnce = () => {
      // verify recipe still matches and consume ingredients
      const ids = inv.craftGrid.map(s => s ? s.id : null);
      const rr = matchRecipe(ids, 3);
      if (!rr) return false;
      for (let i = 0; i < 9; i++) {
        const s = inv.craftGrid[i];
        if (s) { s.count--; if (s.count <= 0) inv.craftGrid[i] = null; }
      }
      const left = inv.add(rr.out.item, rr.out.count);
      if (left > 0) this.game.spawnDropAtPlayer(rr.out.item, left);
      return true;
    };
    const times = all ? 64 : 1;
    let done = 0;
    for (let t = 0; t < times; t++) { if (!doOnce()) break; done++; }
    if (done) { this.game.audio.craft(); this.toast(`Crafted ${itemName(r.out.item)} ×${r.out.count * done}`); }
    this.renderInventory();
  }

  renderRecipeList() {
    const list = this.$('#recipeList');
    list.innerHTML = '';
    const inv = this.game.inventory;
    for (const r of RECIPES) {
      if (!r.out) continue;
      const row = document.createElement('div');
      row.className = 'recipeRow';
      const need = {};
      if (r.shapeless) for (const id of r.shapeless) need[id] = (need[id] || 0) + 1;
      else for (const rowA of r.shaped) for (const id of rowA) if (id) need[id] = (need[id] || 0) + 1;
      let have = true;
      for (const id in need) if (inv.countOf(Number(id)) < need[id]) have = false;
      if (!have) row.classList.add('no');
      const c = document.createElement('canvas'); c.width = c.height = 34;
      drawItemIcon(c.getContext('2d'), r.out.item, 34);
      row.appendChild(c);
      const nm = document.createElement('span');
      nm.className = 'rname';
      nm.textContent = `${r.name}${have ? '' : ' — missing materials'}`;
      row.appendChild(nm);
      row.addEventListener('click', () => {
        if (!have) return;
        // fill craft grid from inventory
        for (let i = 0; i < 9; i++) {
          const s = this.game.inventory.craftGrid[i];
          if (s) { this.game.inventory.add(s.id, s.count); this.game.inventory.craftGrid[i] = null; }
        }
        const place = (id, gi) => {
          if (id === null || id === undefined) return;
          if (this.game.inventory.remove(id, 1) > 0) {
            const st = { id, count: 1 };
            if (ITEMS[id].dur) st.dur = ITEMS[id].dur;
            this.game.inventory.craftGrid[gi] = st;
          }
        };
        if (r.shapeless) r.shapeless.forEach((id, k) => place(id, k));
        else for (let y = 0; y < r.shaped.length; y++) for (let x = 0; x < r.shaped[y].length; x++) place(r.shaped[y][x], y * 3 + x);
        this.game.audio.click();
        this.renderInventory();
      });
      list.appendChild(row);
    }
  }

  // ---------- station interactions ----------
  stationClick(i, button) {
    const { kind, x, y, z } = this.stationPos;
    const game = this.game;
    if (kind === 'chest') {
      const chest = game.stations.getChest(x, y, z, true);
      this.handleStackClick(chest, i, button);
    } else {
      const f = game.stations.getFurnace(x, y, z, true);
      const fields = ['in', 'fuel', 'out'];
      const field = fields[i];
      if (field === 'out') {
        if (!this.cursorStack && f.out) { this.cursorStack = f.out; f.out = null; }
        else if (this.cursorStack && f.out && this.cursorStack.id === f.out.id) { this.cursorStack.count += f.out.count; f.out = null; }
      } else {
        const tmp = f[field];
        if (this.cursorStack && tmp && this.cursorStack.id === tmp.id && !ITEMS[tmp.id].dur) {
          tmp.count += this.cursorStack.count; this.cursorStack = null;
        } else { f[field] = this.cursorStack; this.cursorStack = tmp || null; }
      }
    }
    game.audio.click();
    this.renderInventory();
  }

  // ---------- menus ----------
  bindMenus() {
    void 0;
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    if (id) this.$(id).classList.add('on');
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { UI };
if (typeof self !== 'undefined') self.UIMOD = { UI };
})();
