// Inventory model: 36 slots (9 hotbar), crafting grid state, stack ops.
'use strict';
// dual-env loader: Node require / browser shim
(function () {
const __RQ = (p) => (typeof require !== 'undefined') ? require(p) : window.__req(p);
const { ITEMS, maxStack } = __RQ('../shared/blocks.js');

class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // {id,count,dur?}
    this.craftGrid = new Array(9).fill(null);
    this.craftSize = 3;
    this.craftResult = null;
  }

  /** add items, prefer hotbar+existing stacks; returns leftover count */
  add(id, count) {
    let left = count;
    const max = maxStack(id);
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max && !s.dur) {
        const take = Math.min(max - s.count, left);
        s.count += take; left -= take;
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, left);
        this.slots[i] = { id, count: take };
        if (ITEMS[id] && ITEMS[id].dur) this.slots[i].dur = ITEMS[id].dur;
        left -= take;
      }
    }
    return left;
  }

  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** remove count of id (for recipes), returns removed */
  remove(id, count) {
    let need = count;
    for (let i = 35; i >= 0 && need > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, need);
        s.count -= take; need -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return count - need;
  }

  hotbarSelect(i) { this.hotbar = Math.max(0, Math.min(8, i)); return this.hotbar; }
  held() { return this.slots[this.hotbar === undefined ? 0 : this.hotbar]; }
}
Object.assign(Inventory.prototype, { hotbar: 0 });

/** Consume one from held slot (for placing blocks / eating). */
Inventory.prototype.consumeHeld = function () {
  const s = this.slots[this.hotbar];
  if (!s) return;
  s.count--;
  if (s.count <= 0) this.slots[this.hotbar] = null;
};

/** Damage held tool; break it at 0. Returns true if broke. */
Inventory.prototype.damageHeld = function (amt) {
  const s = this.slots[this.hotbar];
  if (!s || s.dur === undefined) return false;
  s.dur -= amt;
  if (s.dur <= 0) { this.slots[this.hotbar] = null; return true; }
  return false;
};

/** Serialize for save */
Inventory.prototype.toJSON = function () {
  return { slots: this.slots, hotbar: this.hotbar, craftGrid: this.craftGrid };
};
Inventory.fromJSON = function (d) {
  const inv = new Inventory();
  if (!d) return inv;
  inv.slots = d.slots && d.slots.length === 36 ? d.slots : inv.slots;
  inv.hotbar = d.hotbar || 0;
  inv.craftGrid = d.craftGrid || new Array(9).fill(null);
  return inv;
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Inventory };
if (typeof self !== 'undefined') self.INVENTORY_MOD = { Inventory };
})();
