(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const KEYS = {
    pitchF: "KeyW", pitchB: "KeyS",
    rollL: "KeyA", rollR: "KeyD",
    yawL: "KeyQ", yawR: "KeyE",
    up: "Space", down: "ShiftLeft", downAlt: "ShiftRight"
  };
  const BLOCK_DEFAULT = new Set([
    "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"
  ]);

  const Input = {
    raw: { pitch: 0, roll: 0, yaw: 0, climb: 0 },
    cmd: { pitch: 0, roll: 0, yaw: 0, climb: 0 },
    keysDown: Object.create(null),
    gamepadIndex: -1,
    _handlers: {},

    init(onAction) {
      this._onAction = onAction || function () {};
      window.addEventListener("keydown", (e) => {
        if (e.repeat) {
          if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
          return;
        }
        this.keysDown[e.code] = true;
        if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
        this._onAction(e.code);
      });
      window.addEventListener("keyup", (e) => {
        this.keysDown[e.code] = false;
        if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      });
      window.addEventListener("blur", () => { this.keysDown = Object.create(null); });
      window.addEventListener("gamepadconnected", (e) => {
        this.gamepadIndex = e.gamepad.index;
        if (this.toast) this.toast("GAMEPAD CONNECTED — Mode 2 sticks");
      });
      window.addEventListener("gamepaddisconnected", () => { this.gamepadIndex = -1; });
    },

    _dz(v) { return Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88; },

    poll(dt) {
      const k = this.keysDown;
      let p = (k[KEYS.pitchF] ? 1 : 0) + (k[KEYS.pitchB] ? -1 : 0);
      let r = (k[KEYS.rollR] ? 1 : 0) + (k[KEYS.rollL] ? -1 : 0);
      let y = (k[KEYS.yawR] ? 1 : 0) + (k[KEYS.yawL] ? -1 : 0);
      let c = (k[KEYS.up] ? 1 : 0) + ((k[KEYS.down] || k[KEYS.downAlt]) ? -1 : 0);

      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const g of pads) if (g && g.connected) { pad = g; break; }
      if (pad) {
        const ax = pad.axes;
        y += this._dz(ax[0] || 0);
        c += -this._dz(ax[1] || 0);
        r += this._dz(ax[2] || 0);
        p += -this._dz(ax[3] || 0);
        const prevBtns = this._prevButtons || [];
        const btnEdge = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed) && !prevBtns[i];
        if (btnEdge(0)) this._onAction("__pad_restart");
        if (btnEdge(3)) this._onAction("__pad_camera");
        if (btnEdge(9)) this._onAction("__pad_menu");
        if (btnEdge(1)) this._onAction("__pad_race");
        this._prevButtons = pad.buttons.map(b => b.pressed);
      }

      this.raw.pitch = clamp(p, -1, 1);
      this.raw.roll = clamp(r, -1, 1);
      this.raw.yaw = clamp(y, -1, 1);
      this.raw.climb = clamp(c, -1, 1);

      const kk = 11;
      this.cmd.pitch += (this.raw.pitch - this.cmd.pitch) * Math.min(1, kk * dt);
      this.cmd.roll += (this.raw.roll - this.cmd.roll) * Math.min(1, kk * dt);
      this.cmd.yaw += (this.raw.yaw - this.cmd.yaw) * Math.min(1, kk * dt);
      this.cmd.climb += (this.raw.climb - this.cmd.climb) * Math.min(1, 9 * dt);
    }
  };

  DS.Input = Input;
})();
