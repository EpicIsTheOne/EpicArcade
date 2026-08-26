// CHROME HARBOR — input: keyboard, mouse, pointer lock, (optional gamepad)
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // physical codes currently down
    this.pressed = new Set();       // consumed-once edge triggers
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, leftEdge: false };
    this.locked = false;
    this.enabled = true;
    this._virtual = { active: false }; // QA fallback when pointer lock unavailable

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // don't swallow browser combos
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
      if (e.button === 2) this.mouse.right = true;
      if (!this.locked && !this._preventLock) canvas.requestPointerLock?.();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      else if (this._virtual.active && document.hasFocus()) {
        // fallback: use raw deltas while any button held or always (QA)
        this.mouse.dx += e.movementX ?? 0; this.mouse.dy += e.movementY ?? 0;
      }
    });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
      if (wasLocked && !this.locked && this.onLockLost) this.onLockLost();
    });
  }
  requestLock() {
    try { this.canvas.requestPointerLock?.(); } catch {}
    // if lock never arrives, enable virtual mouse after a beat so the game stays playable (QA/headless)
    setTimeout(() => { if (!this.locked) this._virtual.active = true; }, 600);
  }
  releaseLock() { try { document.exitPointerLock?.(); } catch {} }
  preventLock(v) { this._preventLock = v; }
  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; this.mouse.leftEdge = false;
  }
  // combined helpers
  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
}
