// Input: keyboard + mouse + pointer lock. Directional semantics are handled
// in player.js; this module just reports raw state.
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.buttons = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheelDelta = 0;
    this.locked = false;

    this.onKeyDown = null;   // (code, event)
    this.onKeyUp = null;
    this.onMouseDown = null; // (button)
    this.onMouseUp = null;
    this.onWheel = null;     // (deltaY)
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        // still preventDefault for gameplay keys
        if (this._isGameKey(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (this._isGameKey(e.code)) e.preventDefault();
      if (this.onKeyDown) this.onKeyDown(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.onKeyUp) this.onKeyUp(e.code, e);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = (this.settings.sensitivity ?? 100) / 100 * 0.0024;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      dx *= s; dy *= s;
      if (this.settings.invertX) dx = -dx;
      if (this.settings.invertY) dy = -dy;
      this.lookDX += dx;
      this.lookDY += dy;
    });

    canvas.addEventListener('mousedown', (e) => {
      this.buttons.add(e.button);
      if (this.onMouseDown) this.onMouseDown(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons.delete(e.button);
      if (this.onMouseUp) this.onMouseUp(e.button);
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) e.preventDefault();
      if (this.onWheel) this.onWheel(Math.sign(e.deltaY));
      this.wheelDelta += Math.sign(e.deltaY);
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.releaseAll();
      if (wasLocked !== this.locked && this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });

    window.addEventListener('blur', () => this.releaseAll());
  }

  _isGameKey(code) {
    return code === 'Space' || code === 'Tab' ||
      code.startsWith('Digit') || code.startsWith('Arrow') ||
      code === 'KeyE' || code === 'KeyQ' || code === 'F3' ||
      code === 'Slash' || code === 'Quote';
  }

  releaseAll() {
    this.keys.clear();
    this.buttons.clear();
    this.lookDX = 0;
    this.lookDY = 0;
  }

  requestLock() {
    const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeLook() {
    const r = [this.lookDX, this.lookDY];
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }

  consumeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  down(code) { return this.keys.has(code); }
}
