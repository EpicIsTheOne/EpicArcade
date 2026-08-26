/* SKYLINE DASH — input (keyboard, mouse-look, pointer lock, synthetic overrides) */
window.PKInput = (function () {
  const keys = Object.create(null);
  const syn = Object.create(null);      // test/automation overrides: take precedence when defined
  const state = {
    fwd: false, back: false, left: false, right: false,
    jump: false, sprint: false, slide: false, dash: false,
    yawDelta: 0, pitchDelta: 0,
    locked: false, dragLook: false
  };

  const MAP = {
    KeyW: 'fwd', ArrowUp: 'fwd',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyC: 'slide', ControlLeft: 'slide', ControlRight: 'slide'
  };

  function get(name) { return (name in syn) ? !!syn[name] : !!keys[name]; }

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) {
      const m = MAP[e.code];
      if (m) keys[m] = true;
    }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', e => {
    const m = MAP[e.code];
    if (m) keys[m] = false;
    keys[e.code] = false;
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // Mouse look — accumulates deltas; consumed by main loop each frame.
  document.addEventListener('mousemove', e => {
    if (state.locked || (state.dragLook && buttons.left)) {
      state.yawDelta -= e.movementX * SENS;
      state.pitchDelta -= e.movementY * SENS;
    }
  });
  const buttons = { left: false, right: false };
  window.addEventListener('mousedown', e => {
    if (e.button === 0) buttons.left = true;
    if (e.button === 2) buttons.right = true;
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) buttons.left = false;
    if (e.button === 2) buttons.right = false;
  });
  window.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement != null;
  });

  const SENS = 0.0023;

  return {
    state, syn, SENS,
    get,
    /** logical axes merged with synthetic overrides */
    axes() {
      return {
        fwd: get('fwd'), back: get('back'), left: get('left'), right: get('right'),
        jump: get('jump'), sprint: get('sprint'), slide: get('slide'),
        dash: get('dash') || buttons.right
      };
    },
    consumeLook() {
      const d = { yaw: state.yawDelta, pitch: state.pitchDelta };
      state.yawDelta = 0; state.pitchDelta = 0;
      return d;
    },
    requestLock(el) {
      try {
        const p = el.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(() => { state.dragLook = true; });
      } catch (err) {
        try { el.requestPointerLock(); } catch (e2) { state.dragLook = true; }
      }
    },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    marker: 'SKYDASH-INP-r01'
  };
})();
