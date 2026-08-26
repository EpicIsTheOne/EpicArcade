/* SKYRUSH — keyboard / mouse / pointer-lock input with virtual (bot) override */
"use strict";
const Input = {
  keys: {},
  virtual: null, // when set: {mx,mz} world-space move dir, jump/dash/slide edges consumed by player
  vjump: false, vdash: false, vslide: false,
  mouseDX: 0, mouseDY: 0, wheel: 0,
  locked: false,
  onKeyEdge: null, // (code, down)

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) { return; }
      this.keys[e.code] = true;
      if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
      if (this.onKeyEdge) this.onKeyEdge(e.code, true);
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (this.onKeyEdge) this.onKeyEdge(e.code, false);
    });
    window.addEventListener("blur", () => { this.keys = {}; });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && Game.state === "playing") Game.pause();
    });
    document.addEventListener("pointerlockerror", () => {});
    document.addEventListener("mousemove", (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    window.addEventListener("wheel", (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  },

  lock(canvas) {
    const p = canvas.requestPointerLock && canvas.requestPointerLock({ unadjustedMovement: false });
    // Some browsers return a promise; swallow rejection quietly.
    if (p && p.catch) p.catch(() => {});
  },
  unlock() { try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {} },

  consumeMouse() { const r = [this.mouseDX, this.mouseDY]; this.mouseDX = 0; this.mouseDY = 0; return r; },
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; },

  // --- human-facing state ---
  moveAxis() { // camera-relative: x = right(+)/left(-), z = forward(-)/back(+)  (three.js convention)
    let x = 0, z = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) z -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) z += 1;
    if (this.keys.KeyA) x -= 1;
    if (this.keys.KeyD) x += 1;
    const l = Math.hypot(x, z);
    return l > 0 ? [x / l, z / l] : [0, 0];
  },
  jumpHeld() { return !!(this.keys.Space || this.vjump); },
  jumpPressed() {
    if (this.virtual) { const v = this.vjump && !this._pJv; this._pJv = this.vjump; return v; }
    const v = !!this.keys.Space;
    const was = this._pJ; this._pJ = v;
    return v && !was ? 1 : 0;
  },
  _pJ: false, _pJv: false,
  dashPressed() {
    if (this.virtual) { const v = this.vdash; this.vdash = false; return v; }
    const v = !!(this.keys.ShiftLeft || this.keys.ShiftRight);
    const was = this._pD; this._pD = v;
    return v && !was;
  },
  _pD: false,
  slideHeld() {
    if (this.virtual) return this.vslide;
    return !!(this.keys.KeyC || this.keys.ControlLeft || this.keys.ControlRight);
  },
};
