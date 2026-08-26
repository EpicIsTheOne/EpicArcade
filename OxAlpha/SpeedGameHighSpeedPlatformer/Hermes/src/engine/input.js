// Keyboard + mouse input. Camera defaults are NOT inverted:
//   mouse right -> camera right, mouse up -> look up.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.pressed = Object.create(null);   // edge-triggered this frame
    this.released = Object.create(null);
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.pointerLocked = false;
    this.sens = 1.0;
    this.invertX = false;
    this.invertY = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { return; }
      const k = e.code;
      this.keys[k] = true;
      this.pressed[k] = true;
      // keep browser shortcuts from hijacking gameplay keys
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      this.onFirstGesture && this.onFirstGesture(e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.released[e.code] = true;
    });
    window.addEventListener('blur', () => { this.clearAll(); });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked && this.enabled) {
        let dx = e.movementX || 0, dy = e.movementY || 0;
        if (this.invertX) dx = -dx;
        if (this.invertY) dy = -dy;
        this.mouseDX += dx; this.mouseDY += dy;
      }
    });
    document.addEventListener('wheel', (e) => { if (this.pointerLocked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('mousedown', () => {
      this.onFirstGesture && this.onFirstGesture();
      this.requestLock();
    });
  }
  requestLock() {
    if (!this.pointerLocked && this.enabled) {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.enabled && !!this.keys[code]; }
  hit(code) { return this.enabled && !!this.pressed[code]; }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  endFrame() {
    for (const k in this.pressed) delete this.pressed[k];
    for (const k in this.released) delete this.released[k];
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
  clearAll() { this.keys = Object.create(null); this.endFrame(); }

  // Semantic helpers -------------------------------------------------------
  get moveX() { return this.axis('KeyA', 'KeyD'); }       // A = left, D = right
  get moveZ() { return this.axis('KeyS', 'KeyW'); }       // W = forward
  get jump() { return this.down('Space'); }
  get jumpHit() { return this.hit('Space'); }
  get boost() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  get drift() { return this.down('KeyC'); }
  get driftHit() { return this.hit('KeyC'); }
  get spinHit() { return this.hit('KeyF'); }
  get stepLeft() { return this.hit('KeyQ'); }
  get stepRight() { return this.hit('KeyE'); }
  get brakeHard() { return this.down('KeyX'); }
  get respawnHit() { return this.hit('KeyR'); }
  get pauseHit() { return this.hit('Escape') || this.hit('KeyP'); }
  get helpHit() { return this.hit('KeyH'); }
}
