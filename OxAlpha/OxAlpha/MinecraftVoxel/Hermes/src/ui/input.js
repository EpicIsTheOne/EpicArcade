// Input manager: pointer lock, keyboard state with focus-loss reset,
// mouse buttons, wheel hotbar, correct non-inverted camera semantics.
'use strict';
(function () {
class Input {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.keys = {};
    this.locked = false;
    this.onLook = opts.onLook || (() => {});
    this.onMouse = opts.onMouse || (() => {});
    this.onKey = opts.onKey || (() => {});
    this.onWheel = opts.onWheel || (() => {});
    this.enabled = true;
    this.sens = 10; this.invX = false; this.invY = false;

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) this.releaseAll();
      opts.onLockChange && opts.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      // movementX > 0 means mouse moved RIGHT -> yaw should turn camera RIGHT
      // movementY > 0 means mouse moved DOWN -> pitch should look DOWN
      this.onLook(e.movementX, e.movementY);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) { this.requestLock(); return; }
      e.preventDefault();
      this.onMouse(e.button, true);
    });
    document.addEventListener('mouseup', (e) => this.onMouse(e.button, false));
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code.startsWith('Key') || e.code.startsWith('Digit')) return; }
      this.keys[e.code] = true;
      this.onKey(e.code, true, e);
      if (['Space', 'Tab', 'F3'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.onKey(e.code, false, e);
    });
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.onWheel(Math.sign(e.deltaY));
    }, { passive: false });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock();
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  releaseAll() {
    for (const k in this.keys) this.keys[k] = false;
    this.onMouse(-1, false);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Input };
if (typeof self !== 'undefined') self.INPUT_MOD = { Input };
})();
