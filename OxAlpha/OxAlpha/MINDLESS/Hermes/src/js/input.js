// MINDLESS-Hermes :: input.js — keyboard state + actions (WASD/arrows/C/X/E/Space/Esc)
"use strict";
// A=LEFT, D=RIGHT, W=UP, S=DOWN — verified semantics; never inverted.

const Input = {
  down: new Set(),
  pressedThisFrame: new Set(),
  _queue: new Set(),      // taps arriving mid-frame land here for the NEXT frame
  enabled: true,

  init(canvas) {
    window.addEventListener("keydown", e => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.enabled) return;
      this.down.add(e.code);
      this._queue.add(e.code);
    });
    window.addEventListener("keyup", e => this.down.delete(e.code));
    window.addEventListener("blur", () => { this.down.clear(); this.pressedThisFrame.clear(); this._queue.clear(); });
    canvas.addEventListener("click", () => { if (!this.audioStarted) this.resumeAudio && this.resumeAudio(); });
  },

  // start-of-frame: promote queued taps so handlers see exactly-once semantics
  beginFrame() {
    if (this._queue.size) {
      for (const c of this._queue) this.pressedThisFrame.add(c);
      this._queue.clear();
    }
  },

  isDown(code) { return this.down.has(code); },
  axis(neg, pos) {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
  },
  moveVector() {
    // x from left/right, y from up/down (up = -1, matching Godot Input.get_vector)
    const y = this.axis("KeyW", "KeyS") + this.axis("ArrowUp", "ArrowDown");
    const x = this.axis("KeyA", "KeyD") + this.axis("ArrowLeft", "ArrowRight");
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  },
  justPressed(code) {
    const has = this.pressedThisFrame.has(code);
    return has;
  },
  attackPressed() { return this.justPressed("KeyC"); },
  jumpPressed() { return this.justPressed("KeyX") || this.justPressed("Space"); },
  swapPressed() { return this.justPressed("KeyE"); },
  pausePressed() { return this.justPressed("Escape") || this.justPressed("KeyP"); },
  enterPressed() { return this.justPressed("Enter"); },
  anyKeyPressed() { return this.pressedThisFrame.size > 0; },
  endFrame() { this.pressedThisFrame.clear(); },
  tap(code) { this._queue.add(code); },   // programmatic tap that survives the frame
};
