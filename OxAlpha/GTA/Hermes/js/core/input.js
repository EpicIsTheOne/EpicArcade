// ============================================================
// NEON MERIDIAN — core/input.js
// Pointer-lock mouse + keyboard. NON-INVERTED BY DEFAULT.
//
// CONTRACT (verified by tests/test_controls.js):
//   movementX > 0 (mouse RIGHT)  -> yaw INCREASES toward negative-X look
//                                 (camera turns right, screen content moves left)
//   movementY > 0 (mouse DOWN)   -> pitch DECREASES (camera looks DOWN)
//   W walks toward camera-forward projected on ground.
//   A strafes LEFT relative to camera. D strafes RIGHT.
//   Vehicle: A steers LEFT, D steers RIGHT (never flipped by reverse gear).
// ============================================================
'use strict';

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.pressed = Object.create(null);   // edge-triggered, consumed each frame
    this.mouseDX = 0; this.mouseDY = 0;
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1.0;
    this.invertX = false;   // MUST default OFF
    this.invertY = false;   // MUST default OFF
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Escape') { /* browser exits pointer lock itself */ }
      if (!e.repeat && !this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.hadLock = true;
      // Release held keys only on a REAL lock loss (locked -> unlocked).
      // Spurious unlock events while never-locked (headless/CI) must not
      // wipe live input state.
      if (!this.locked && wasLocked) this.keys = Object.create(null);
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      // NON-INVERTED mapping (negation flips only if user opts into inversion)
      const sx = this.invertX ? -1 : 1;
      const sy = this.invertY ? -1 : 1;
      this.mouseDX += e.movementX * sx * this.sensitivity;
      this.mouseDY += e.movementY * sy * this.sensitivity;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const r = this.canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});   // headless/no-gesture: fail silent
      } catch (e) { /* ignore */ }
    }
  }
  exitLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }

  down(code) { return !!this.keys[code]; }
  /** Edge-trigger: true once per physical press until consumed. */
  wasPressed(code) { if (this.pressed[code]) { this.pressed[code] = false; return true; } return false; }

  /** Call at END of frame after camera read the deltas. */
  endFrame() { this.pressed = Object.create(null); this.mouseDX = 0; this.mouseDY = 0; }
}

if (typeof module !== 'undefined') module.exports = { Input };
