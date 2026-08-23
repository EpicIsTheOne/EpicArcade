// MINDLESS-Hermes :: audio.js — audio-clock-derived BeatManager + SFX (authentic design)
"use strict";

// SoundManager: one pool per sound, pitch tweak like the original
class SoundManager {
  constructor(audio) {
    this.audio = audio;
    this.ctx = null;
    this.pools = new Map();
    this.sfxGain = null;
  }
  init(ctx, sfxGain) {
    this.ctx = ctx;
    this.sfxGain = sfxGain;
  }
  _pool(key) {
    if (!this.pools.has(key)) {
      const g = this.ctx.createGain();
      g.gain.value = 1;
      g.connect(this.sfxGain);
      const voices = [];
      for (let i = 0; i < 4; i++) {
        const src = this.ctx.createBufferSource();
        src.buffer = Assets.audio[key];
        src.connect(g);
        voices.push(src);
      }
      this.pools.set(key, { gain: g, voices, next: 0 });
    }
    return this.pools.get(key);
  }
  play(key, { volume = 1, pitch = 1 } = {}) {
    if (!Assets.audio[key]) return;
    const p = this._pool(key);
    const v = p.voices[p.next];
    p.next = (p.next + 1) % p.voices.length;
    try { v.stop(); v.disconnect(); } catch (e) {}
    const src = this.ctx.createBufferSource();
    src.buffer = Assets.audio[key];
    src.playbackRate.value = U.clamp(pitch, 0.25, 4);
    src.connect(p.gain);
    p.gain.gain.value = volume;
    src.start();
  }
}

// =====================================================================
// BeatManager — faithful port of the original Godot autoload.
// All timing is derived from the AUDIO CLOCK (AudioContext.currentTime
// anchored at song start), never frame counts. The metronome layer is a
// second synchronized buffer started in the same event loop tick.
// =====================================================================
const BeatGrade = { PERFECT: 0, GOOD: 1, OKAY: 2, BAD: 3 };

class BeatManager {
  constructor(audioEngine) {
    this.ae = audioEngine;
    this.bpm = 118;                 // original default
    this.secPerBeat = 60 / this.bpm;
    this.hitWindowSec = 0.09;
    this.inputOffsetSec = 0.05;
    this.perfectWinSec = 0.09;      // original windows
    this.goodWinSec = 0.17;
    this.okayWinSec = 0.24;
    this.loopSongs = true;

    this.master = null;             // AudioBufferSourceNode (main track)
    this.metronome = null;          // second synchronized source
    this.metronomeGain = null;
    this.metronomeVol = 0.5;        // unmuted level while Nova active

    this.startAeTime = 0;           // ctx.currentTime at start()
    this.startOffsetSec = 0;        // offset into the track (restart mid-track)
    this.running = false;
    this.pausedAt = null;           // {aeTime, pos}
    this.lastBeatIndex = -1;
    this.beatCallbacks = [];
    this.gradeCallbacks = [];
    this.songEndedCb = null;
    this._raf = null;
    this._loopTimer = null;
  }

  setBpm(bpm) { this.bpm = Math.max(1, bpm); this.secPerBeat = 60 / this.bpm; }

  // Start main track + metronome together, aligned to ONE AudioContext timestamp.
  startSongs(trackBuf, metBuf = null, startOffset = 0) {
    this.stopSongs(false);
    const ctx = this.ae.ctx;
    const t0 = ctx.currentTime + 0.06; // small scheduling horizon
    this.startAeTime = t0;
    this.startOffsetSec = startOffset;

    this.master = ctx.createBufferSource();
    this.master.buffer = trackBuf;
    this.master.loop = false;
    this.master.connect(this.ae.musicGain);
    this.master.start(t0, startOffset);

    this.metronome = null;
    if (metBuf) {
      // metronome loops over its own length, phase-locked to the same clock
      this.metronome = ctx.createBufferSource();
      this.metronome.buffer = metBuf;
      this.metronome.loop = true;
      this.metronomeGain = this.metronomeGain || this.ae.ctx.createGain();
      this.metronomeGain.gain.value = -90; // muted by default (original behavior)
      this.metronome.connect(this.metronomeGain);
      this.metronomeGain.connect(this.ae.musicGain);
      this.metronome.start(t0, startOffset % metBuf.duration);
    }

    this.lastBeatIndex = -1;
    this.running = true;
    this._tick();
    return this.startAeTime;
  }

  setMetronomeMuted(muted) {
    if (!this.metronomeGain) return;
    // original: swap to Nova unmutes metronome, Ecliptio silences it
    this.metronomeGain.gain.setTargetAtTime(muted ? -90 : this.metronomeVol * this.ae.musicGain.gain.value, this.ae.ctx.currentTime, 0.03);
  }

  stopSongs(stopAudio = true) {
    this.running = false;
    if (this._loopTimer) { clearTimeout(this._loopTimer); this._loopTimer = null; }
    for (const s of [this.master, this.metronome]) {
      if (s && stopAudio) { try { s.stop(); } catch (e) {} }
    }
    if (stopAudio) { this.master = null; this.metronome = null; }
  }

  pause() {
    if (!this.running || this.pausedAt) return;
    const pos = this.getSongPositionSec();
    this.pausedAt = { aeTime: this.ae.ctx.currentTime, pos };
    try { this.master.stop(); } catch (e) {}
    if (this.metronome) { try { this.metronome.stop(); } catch (e) {} }
    if (this._loopTimer) { clearTimeout(this._loopTimer); this._loopTimer = null; }
  }

  resume() {
    if (!this.pausedAt) return;
    const { pos } = this.pausedAt;
    this.pausedAt = null;
    this.startSongs(this.master ? this.master.buffer : Assets.audio.mus_slums,
      this.metronome ? this.metronome.buffer : null, pos);
  }

  // seconds since song start as the player HEARS it (audio clock derived)
  getHeardSongPositionSec() {
    if (!this.running || !this.master) return 0;
    let pos = (this.ae.ctx.currentTime - this.startAeTime) + this.startOffsetSec;
    if (this.pausedAt) pos = this.pausedAt.pos;
    return pos;
  }

  getInputSongPositionSec() { return this.getHeardSongPositionSec() + this.inputOffsetSec; }

  getSongPositionSec() { return this.getInputSongPositionSec(); }

  getBeatResult() {
    const pos = this.getInputSongPositionSec();
    if (pos < 0) return { onBeat: false, delta: Infinity, beatIndex: -1, grade: BeatGrade.BAD };
    const beatFloat = pos / this.secPerBeat;
    const nearestBeat = Math.round(beatFloat);
    const nearestBeatTime = nearestBeat * this.secPerBeat;
    const delta = Math.abs(pos - nearestBeatTime);
    let grade = BeatGrade.BAD;
    if (delta <= this.perfectWinSec) grade = BeatGrade.PERFECT;
    else if (delta <= this.goodWinSec) grade = BeatGrade.GOOD;
    else if (delta <= this.okayWinSec) grade = BeatGrade.OKAY;
    return { onBeat: grade !== BeatGrade.BAD, delta, beatIndex: nearestBeat, grade };
  }

  gradePlayerAction() {
    const result = this.getBeatResult();
    for (const cb of this.gradeCallbacks) cb(result.grade, result.delta, result.beatIndex);
    return result;
  }

  onBeat(cb) { this.beatCallbacks.push(cb); }
  onGrade(cb) { this.gradeCallbacks.push(cb); }

  _tick() {
    this._raf = requestAnimationFrame(() => this._tick());
    if (!this.running || !this.master) return;
    const pos = this.getHeardSongPositionSec();
    if (pos < 0) return;
    const idx = Math.floor(pos / this.secPerBeat);
    if (idx !== this.lastBeatIndex) {
      this.lastBeatIndex = idx;
      for (const cb of [...this.beatCallbacks]) cb(idx);
    }
    // master track ended -> loop or stop (faithful)
    if (!this._loopTimer && pos >= this.master.buffer.duration - 0.05) {
      if (this.loopSongs) {
        this._loopTimer = setTimeout(() => {
          this._loopTimer = null;
          if (this.running) this.startSongs(this.master.buffer, this.metronome ? this.metronome.buffer : null, 0);
        }, 80);
      } else {
        this.running = false;
        if (this.songEndedCb) this.songEndedCb();
      }
    }
  }
}
