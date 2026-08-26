/* @oxalpha-retrohub-run02 — input module */
/* RETRO ARCADE HUB — keyboard input (immediate, per-frame justPressed) */
ARC.input = (() => {
  const down = new Set(), pressed = new Set();
  const GAME_KEYS = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
    'KeyZ', 'KeyX', 'KeyC', 'Enter', 'Escape', 'KeyP', 'KeyM', 'KeyH', 'KeyT',
    'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'
  ]);

  window.addEventListener('keydown', e => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    ARC.audio.unlock();
    ARC._lastGesture = e.code;
  });
  window.addEventListener('keyup', e => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  const axis = () => {
    const l = down.has('ArrowLeft') || down.has('KeyA');
    const r = down.has('ArrowRight') || down.has('KeyD');
    const u = down.has('ArrowUp') || down.has('KeyW');
    const d = down.has('ArrowDown') || down.has('KeyS');
    return { x: (r ? 1 : 0) - (l ? 1 : 0), y: (d ? 1 : 0) - (u ? 1 : 0) };
  };

  return {
    down: c => down.has(c),
    pressed: c => pressed.has(c),
    fire: () => down.has('Space') || down.has('KeyZ') || down.has('KeyJ'),
    dash: () => down.has('ShiftLeft') || down.has('ShiftRight') || down.has('KeyX'),
    axis,
    anyPressed: (...cs) => cs.some(c => pressed.has(c)),
    endFrame() { pressed.clear(); },
  };
})();
