// input.js — keyboard + mouse with pointer lock, QA injection hooks.
// Gameplay reads SEMANTIC actions via down('fwd')/hit('jump'); raw e.code always works too.
export const ACTION_MAP = {
  fwd: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  attack: ['KeyF', 'Mouse0'],
  stomp: ['KeyC'],
  respawn: ['KeyR'],
};

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

    this._lastTap = Object.create(null);   // for A/D double-tap quick-step
    this._onKeyDown = (e) => {
      if (!this.locked && !document.hasFocus()) return;
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (['Space', 'Tab'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      // double-tap dodge (A/D twice quickly)
      if (e.code === 'KeyA' || e.code === 'KeyD') {
        const now = performance.now();
        if (now - (this._lastTap[e.code] || -1e9) < 270) {
          this._lastTap[e.code] = -1e9;
          this.onQuickStep?.(e.code === 'KeyA' ? 'left' : 'right');
        } else this._lastTap[e.code] = now;
      }
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseDown = (e) => {
      if (!this.locked) return;                       // the capturing click is not an attack
      const code = 'Mouse' + e.button;
      this.keys[code] = true; this.pressed[code] = true;
    };
    this._onMouseUp = (e) => { this.keys['Mouse' + e.button] = false; };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      if (this.invertX) dx = -dx;
      if (this.invertY) dy = -dy;
      this.mouseDX += dx; this.mouseDY += dy;
    };
    this._onWheel = (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange?.(this.locked);
    };
    this._onBlur = () => { for (const k in this.keys) this.keys[k] = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
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

  down(action) {
    const codes = ACTION_MAP[action];
    if (!codes) return !!this.keys[action];            // unknown action → treat as raw code
    for (const c of codes) if (this.keys[c]) return true;
    return false;
  }
  hit(action) {
    const codes = ACTION_MAP[action];
    if (!codes) return !!this.pressed[action];
    for (const c of codes) if (this.pressed[c]) return true;
    return false;
  }
  justPressed(code) { return !!this.pressed[code]; }

  // Camera consumes accumulated mouse delta (clears it so endFrame won't re-see it).
  consumeLook() {
    const out = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0; this.mouseDY = 0;
    return out;
  }

  // Call at end of each rendered frame.
  endFrame() {
    this.pressed = Object.create(null);
    this.consumedDX = this.mouseDX; this.consumedDY = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('blur', this._onBlur);
  }
}
