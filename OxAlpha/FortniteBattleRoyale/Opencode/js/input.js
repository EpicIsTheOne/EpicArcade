import { S } from './state.js';

export const input = {
  keys: new Set(),
  pressedSet: new Set(),
  dx: 0,
  dy: 0,
  wheel: 0,
  lmb: false,
  rmb: false,
  locked: false,
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressedSet.add(e.code);
    if (['Space', 'Tab', 'KeyQ', 'F1'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.lmb = false; input.rmb = false; });

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.dx += e.movementX || 0;
    input.dy += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) input.lmb = true;
    if (e.button === 2) input.rmb = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.lmb = false;
    if (e.button === 2) input.rmb = false;
  });
  document.addEventListener('wheel', (e) => {
    if (input.locked) input.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) {
      input.keys.clear();
      input.lmb = false;
      input.rmb = false;
      if (!S.suppressPause && S.match.state !== 'lobby' && !S.paused && isPlayingState()) {
        S.emit('pause');
      }
    }
  });
}

function isPlayingState() {
  return ['playing', 'bus', 'freefall', 'glide'].includes(S.match.state);
}

export function requestLock(canvas) {
  canvas.requestPointerLock?.();
}

export function down(code) { return input.keys.has(code); }
export function pressed(code) {
  if (input.pressedSet.has(code)) { return true; }
  return false;
}
export function endFrame() {
  input.pressedSet.clear();
  input.dx = 0;
  input.dy = 0;
  input.wheel = 0;
}
export function consumeDx() { const d = input.dx; input.dx = 0; return d; }
export function consumeDy() { const d = input.dy; input.dy = 0; return d; }
export function injectMove(dx, dy) { input.dx += dx; input.dy += dy; }
