'use strict';
/* EMBERFALL run-01 :: input (keyboard + mouse in logical coords) */
const Input = {
  keys: Object.create(null),
  pressedSet: new Set(),
  mx: CFG.W / 2, my: CFG.H * 0.4,
  mDown: false, mPressed: false,

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.pressedSet.add(e.code); }
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.mDown = false; });

    const toLogical = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      this.mx = U.clamp((cx - r.left) / r.width * CFG.W, 0, CFG.W);
      this.my = U.clamp((cy - r.top) / r.height * CFG.H, 0, CFG.H);
    };
    canvas.addEventListener('mousemove', e => toLogical(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        toLogical(e.clientX, e.clientY);
        this.mDown = true; this.pressedSet.add('Mouse0'); this.mPressed = true;
      }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mDown = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  axis() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (x && y) { const inv = 1 / Math.SQRT2; x *= inv; y *= inv; }
    return { x, y };
  },
  down(code) { return !!this.keys[code]; },
  pressed(...codes) { return codes.some(c => this.pressedSet.has(c)); },
  endFrame() { this.pressedSet.clear(); this.mPressed = false; },
};
