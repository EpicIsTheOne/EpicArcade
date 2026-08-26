// PRISM PULSE — audio playback engine. AudioContext clock is the master clock.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.src = null;
    this.playing = false;
    this.startCtxTime = 0;   // ctx.currentTime when playback (re)started
    this.startSongTime = 0;  // song position at that moment
    this.offsetMs = 0;       // user calibration offset
    this.onEnd = null;
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  setBuffer(buf) { this.stop(); this.buffer = buf; }

  get duration() { return this.buffer ? this.buffer.duration : 0; }

  position() {
    // current song time in seconds (audio-clock derived, offset applied by caller for judging)
    if (!this.playing) return this.startSongTime;
    let t = this.startSongTime + (this.ctx.currentTime - this.startCtxTime);
    return Math.min(t, this.duration);
  }

  play(fromSec = null) {
    if (!this.buffer) return;
    this.stop();
    const start = fromSec ?? this.startSongTime;
    if (start >= this.duration - 0.05) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.ctx.destination);
    src.start(0, Math.max(0, start));
    src.onended = () => {
      if (this.src === src && this.playing) {
        this.playing = false; this.startSongTime = this.duration;
        if (this.onEnd) this.onEnd();
      }
    };
    this.src = src;
    this.startCtxTime = this.ctx.currentTime;
    this.startSongTime = Math.max(0, start);
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    const pos = this.position();
    this.stop();
    this.startSongTime = pos;
  }

  stop() {
    if (this.src) {
      this.src.onended = null;
      try { this.src.stop(); } catch (_) {}
      this.src.disconnect();
      this.src = null;
    }
    this.playing = false;
  }

  seek(sec) {
    sec = Math.max(0, Math.min(sec, this.duration));
    if (this.playing) this.play(sec);
    else this.startSongTime = sec;
  }
}
