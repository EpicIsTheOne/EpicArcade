const DEFAULT_BINDINGS = Object.freeze({
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["KeyW", "ArrowUp", "Space"],
  light: ["KeyJ"],
  heavy: ["KeyK"],
  storm: ["KeyL"],
  dash: ["ShiftLeft", "ShiftRight"],
  interact: ["KeyE"]
});

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.enabled = false;
    this.bindings = { ...DEFAULT_BINDINGS };
    this.touchHeld = new Set();
    this.touchPressed = new Set();
    this.touchReleased = new Set();
    this.pressListeners = new Set();
    this.keys = new Set();
    this.bind();
  }

  bind() {
    window.addEventListener("keydown", (event) => {
      const action = this.actionForCode(event.code);
      this.keys.add(event.code);
      for (const listener of this.pressListeners) listener(event.code, event);
      if (!this.enabled || !action) return;
      event.preventDefault();
      if (!this.held.has(action)) this.pressed.add(action);
      this.held.add(action);
    }, { passive: false });

    window.addEventListener("keyup", (event) => {
      const action = this.actionForCode(event.code);
      this.keys.delete(event.code);
      if (!this.enabled || !action) return;
      event.preventDefault();
      this.held.delete(action);
      this.released.add(action);
    }, { passive: false });

    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });

    for (const control of document.querySelectorAll("[data-hold], [data-press]")) {
      const action = control.dataset.hold || control.dataset.press;
      const start = (event) => {
        event.preventDefault();
        this.enabled = true;
        if (!this.touchHeld.has(action)) this.touchPressed.add(action);
        this.touchHeld.add(action);
        control.setPointerCapture?.(event.pointerId);
      };
      const end = (event) => {
        event.preventDefault();
        this.touchHeld.delete(action);
        this.touchReleased.add(action);
      };
      control.addEventListener("pointerdown", start);
      control.addEventListener("pointerup", end);
      control.addEventListener("pointercancel", end);
      control.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    this.canvas.addEventListener("pointerdown", () => {
      this.canvas.focus();
      this.enabled = true;
    });
  }

  actionForCode(code) {
    for (const [action, codes] of Object.entries(this.bindings)) {
      if (codes.includes(code)) return action;
    }
    return null;
  }

  onPress(listener) {
    this.pressListeners.add(listener);
    return () => this.pressListeners.delete(listener);
  }

  isDown(action) {
    return this.held.has(action) || this.touchHeld.has(action);
  }

  wasPressed(action) {
    return this.pressed.has(action) || this.touchPressed.has(action);
  }

  wasReleased(action) {
    return this.released.has(action) || this.touchReleased.has(action);
  }

  axis() {
    return Number(this.isDown("right")) - Number(this.isDown("left"));
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.touchPressed.clear();
    this.touchReleased.clear();
  }

  clear() {
    this.held.clear();
    this.pressed.clear();
    this.released.clear();
    this.touchHeld.clear();
    this.touchPressed.clear();
    this.touchReleased.clear();
    this.keys.clear();
  }
}
