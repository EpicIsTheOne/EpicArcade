// keyboard + touch input → semantic actions
import { bus } from './state.js';

const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'jump', ArrowUp: 'jump', Space: 'jump',
  KeyS: 'roll', ArrowDown: 'roll',
  ShiftLeft: 'board', ShiftRight: 'board', KeyH: 'board',
};

class Input {
  constructor() {
    this.buffered = null;     // {action,t}
    this.swipeStart = null;
    this.enabled = false;
    this.onAction = null;     // fn(action)
    window.addEventListener('keydown', e => {
      if (e.repeat) {
        if (KEYMAP[e.code]) e.preventDefault();
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') { this.emit('_pause'); e.preventDefault(); return; }
      if (e.code === 'KeyM') { this.emit('_mute'); return; }
      if (e.code === 'Enter') { this.emit('_enter'); return; }
      if (e.code === 'KeyR') { this.emit('_restart'); return; }
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (this.enabled) this.push(a);
      }
    }, { passive: false });

    const el = document.getElementById('app');
    el.addEventListener('pointerdown', e => {
      this.swipeStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', e => {
      if (!this.swipeStart) return;
      const dx = e.clientX - this.swipeStart.x, dy = e.clientY - this.swipeStart.y;
      this.swipeStart = null;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      let action;
      if (Math.abs(dx) > Math.abs(dy)) action = dx > 0 ? 'right' : 'left';
      else action = dy > 0 ? 'roll' : 'jump';
      if (this.enabled) this.push(action);
    });
    // prevent page scroll gestures
    el.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  emit(a) { if (this.onAction) this.onAction(a); }

  push(a) {
    this.buffered = { action: a, t: performance.now() };
    this.emit(a);
  }

  consume(maxAgeMs = 150) {
    if (this.buffered && performance.now() - this.buffered.t <= maxAgeMs) {
      const b = this.buffered; this.buffered = null; return b.action;
    }
    if (this.buffered && performance.now() - this.buffered.t > maxAgeMs) this.buffered = null;
    return null;
  }
}

export const input = new Input();
