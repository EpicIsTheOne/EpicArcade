'use strict';
/* RETRO-HUB-RUN02 input: keyboard state with per-frame edge presses */
RH.input = (function () {
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const down = new Set();
  const edges = new Set();

  window.addEventListener('keydown', e => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!e.repeat) { down.add(e.code); edges.add(e.code); }
  });
  window.addEventListener('keyup', e => { down.delete(e.code); });
  window.addEventListener('blur', () => { down.clear(); });

  const has = c => down.has(c);

  return {
    down: has,
    pressed: c => edges.has(c),
    axisX() { return (has('ArrowLeft') || has('KeyA') ? -1 : 0) + (has('ArrowRight') || has('KeyD') ? 1 : 0); },
    axisY() { return (has('ArrowUp') || has('KeyW') ? -1 : 0) + (has('ArrowDown') || has('KeyS') ? 1 : 0); },
    actionDown() { return has('Space'); },
    endFrame() { edges.clear(); },
  };
})();
