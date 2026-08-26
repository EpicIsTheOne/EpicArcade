// input.js — keyboard + mouse with pointer lock, QA injection hooks
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = Object.create(null);      // code -> bool
    this.pressed = Object.create(null);   // code -> true on the frame it went down
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;                  // gameplay consumes when playing
    this.invertX = false; this.invertY = false;
    this.sensitivity = 0.0026;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      // Don't fight browser shortcuts in dev; still record most keys.
      if (!this.locked && !document.hasFocus()) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (['Space', 'Tab'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      if (this.invertX) dx = -dx;
      if (this.invertY) dy = -dy;
      this.mouseDX += dx; this.mouseDY += dy;
    };
    this._onWheel = (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); };
    this._onLockChange = () => { this.locked = document.pointerLockElement === this.dom; };
    this._onBlur = () => { for (const k in this.keys) this.keys[k] = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
    this.dom.addEventListener('click', () => { if (!this.locked) this.requestLock(); });
  }

  requestLock() {
    const p = this.dom.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { this.dom.requestPointerLock(); } catch { /* headless */ } });
  }
  releaseLock() { if (this.locked) document.exitPointerLock(); }

  down(code) { return !!this.keys[code]; }
  justPressed(code) { return !!this.pressed[code]; }

  // Call at end of each rendered frame.
  endFrame() {
    this.pressed = Object.create(null);
    this.consumedDX = this.mouseDX; this.consumedDY = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('blur', this._onBlur);
  }
}
