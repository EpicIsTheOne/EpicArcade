// Input: keyboard + touch swipe -> discrete action events.
// Direction law (never inverted): LEFT keys move left, RIGHT keys move right,
// UP keys jump, DOWN keys roll. Events are gated on gameplay being active so
// menus can never trigger movement. Node-safe stub for headless QA.
(function (root) {
  var KEYMAP = {
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    KeyW: 'jump', ArrowUp: 'jump', Space: 'jump',
    KeyS: 'roll', ArrowDown: 'roll'
  };
  var listeners = [];
  var enabled = false;
  var log = [];            // ring buffer of dispatched actions (QA evidence)
  function pushLog(a, src) {
    log.push({ action: a, src: src, t: performance.now() });
    if (log.length > 64) log.shift();
  }
  function fire(action, src) {
    if (!enabled) return;
    pushLog(action, src);
    for (var i = 0; i < listeners.length; i++) listeners[i](action, src);
  }

  // --- keyboard ---
  root.addEventListener('keydown', function (e) {
    var act = KEYMAP[e.code];
    if (act) {
      e.preventDefault();
      fire(act, 'key:' + e.code);
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      for (var i = 0; i < listeners.length; i++) listeners[i]('pause', 'key:' + e.code);
    }
    if (e.code === 'Enter') {
      for (var i = 0; i < listeners.length; i++) listeners[i]('confirm', 'key:' + e.code);
    }
  }, { passive: false });

  // --- touch / mouse swipe (swipe LEFT = left, RIGHT = right, UP = jump, DOWN = roll) ---
  var SWIPE_MIN = 26;
  var sx = 0, sy = 0, tracking = false;
  function pointerDown(x, y) { sx = x; sy = y; tracking = true; }
  function pointerUp(x, y) {
    if (!tracking) return;
    tracking = false;
    var dx = x - sx, dy = y - sy;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return; // tap: ignore
    if (Math.abs(dx) > Math.abs(dy)) fire(dx > 0 ? 'right' : 'left', 'swipe');
    else fire(dy > 0 ? 'roll' : 'jump', 'swipe');
  }
  root.addEventListener('touchstart', function (e) {
    if (e.touches.length) pointerDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  root.addEventListener('touchend', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (t) pointerUp(t.clientX, t.clientY);
  }, { passive: true });
  // mouse drag acts like swipe (only during gameplay; harmless otherwise)
  root.addEventListener('mousedown', function (e) { pointerDown(e.clientX, e.clientY); });
  root.addEventListener('mouseup', function (e) { pointerUp(e.clientX, e.clientY); });
  root.addEventListener('contextmenu', function (e) { if (enabled) e.preventDefault(); });

  // --- focus loss safety: never leave stuck state; host pauses instead ---
  root.addEventListener('blur', function () { tracking = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) tracking = false; });

  root.Input = {
    enable: function () { enabled = true; },
    disable: function () { enabled = false; tracking = false; },
    isEnabled: function () { return enabled; },
    onAction: function (fn) { listeners.push(fn); },
    log: log
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Input;
})(typeof window !== 'undefined' ? window : globalThis);
