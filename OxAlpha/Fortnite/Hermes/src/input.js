// Input system: pointer lock, keyboard state, mouse deltas.
// CONTROL SEMANTICS CONTRACT (verified in test/math.test.js):
//   mouse RIGHT (+movementX) -> yaw DECREASES -> camera turns RIGHT
//   mouse UP (-movementY)    -> pitch INCREASES -> camera looks UP
//   invertX / invertY default FALSE.
export class Input {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.keys = new Set();          // e.code set of held keys
    this.pressed = new Set();       // edge-triggered this frame
    this.mouseDX = 0;               // accumulated since last consume()
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.buttons = [false, false, false]; // L M R held
    this.buttonPressed = [false, false, false];
    this.invertX = false;           // MUST default false
    this.invertY = false;           // MUST default false
    this.sensitivity = opts.sensitivity || 1.0;
    this.enabled = true;
    this._lockCb = null;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Space', 'Tab', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) e.preventDefault();
      if (this.onKey && this.enabled) this.onKey(e.code);
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      // movementX>0 means user moved mouse right. We store RAW; consumer applies sign convention.
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.locked && !e.isTrusted === false) {}
      this.buttons[e.button] = true;
      this.buttonPressed[e.button] = true;
    };
    this._onMouseUp = (e) => { this.buttons[e.button] = false; };
    this._onWheel = (e) => { this.wheelDelta += Math.sign(e.deltaY); e.preventDefault(); };
    this._onContext = (e) => { e.preventDefault(); };
    this._onBlur = () => this.releaseAll();
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('contextmenu', this._onContext);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseAll();
      if (this._lockCb) this._lockCb(this.locked);
    });
    this.locked = false;
  }
  requestLock() { if (!this.locked) this.canvas.requestPointerLock?.(); }
  exitLock() { if (this.locked) document.exitPointerLock?.(); }
  releaseAll() {
    this.keys.clear(); this.pressed.clear();
    this.buttons = [false, false, false];
    this.mouseDX = 0; this.mouseDY = 0; this.wheelDelta = 0;
  }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  // Consume accumulated look delta -> yaw/pitch changes (radians).
  // Contract: dx>0 (mouse right) must turn RIGHT. With yaw defined as CCW-around-+Y,
  // turning right = decreasing yaw. So: dyaw = -dx * sens (unless invertX).
  // Contract: dy<0 (mouse up) must look UP. Pitch positive = up. So: dpitch = -dy * sens.
  consumeLook(sensScale = 1) {
    const sx = (this.invertX ? 1 : -1);
    const sy = (this.invertY ? 1 : -1);
    const dyaw = this.mouseDX * 0.0023 * this.sensitivity * sensScale * sx;
    const dpitch = this.mouseDY * 0.0023 * this.sensitivity * sensScale * sy;
    this.mouseDX = 0; this.mouseDY = 0;
    return [dyaw, dpitch];
  }
  endFrame() { this.pressed.clear(); this.buttonPressed = [false, false, false]; this.wheelDelta = 0; }
}
