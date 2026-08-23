/* PULSE-9 transport: look-ahead live scheduler + offline render (export/tests)
 * The SAME event collection and voice builders drive live playback and offline rendering.
 */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  /* ---------- per-note parameter automation mapping ----------
   * Automation data stores a normalized 0..1 (or custom min/max) value; these map it onto params.
   */
  const NOTE_AUTO_MAP = {
    cutoff(v, prm) { return clamp(60 * Math.pow(2, v * 8), 40, 18000); },
    resonance(v, prm) { return clamp(v * 20, 0.0001, 24); },
    attack(v, prm) { return clamp(0.001 + v * 0.4, 0.001, 0.5); },
    release(v, prm) { return clamp(0.02 + v * 1.2, 0.02, 1.5); },
    detune(v, prm) { return clamp((prm.detune || 0) + (v - 0.5) * 60, -100, 100); },
  };
  const CONTINUOUS_TARGETS = ['volume', 'pan'];

  function parseTarget(target) {
    // "mixer.3.volume" | "ch.ch_12.cutoff"
    const m = /^(mixer|ch)\.([A-Za-z0-9_]+)\.(volume|pan|cutoff|resonance|attack|release|detune)$/.exec(target || '');
    if (!m) return null;
    return { kind: m[1], id: m[2], param: m[3] };
  }

  /** Normalized automation value -> actual value range for continuous params. */
  function contValue(auto, v) {
    const lo = auto.min != null ? auto.min : 0, hi = auto.max != null ? auto.max : 1;
    const n = hi > lo ? (v - lo) / (hi - lo) : 0;
    return n;
  }

  /* ================= shared scheduling core ================= */

  /**
   * Schedule all events with startStep in [fromStep, toStep) into the graph.
   * timeOfStep(absStep) -> context-time seconds when that step sounds.
   */
  function scheduleWindow(graph, project, fromStep, toStep, timeOfStep) {
    const evs = P9.collectEvents(project, fromStep, toStep);
    const anySoloCh = (project.channels || []).some(c => c.solo);

    // group note-automation per channel for baking
    const noteAuto = new Map(); // chId -> {param: [{points,min,max}]}
    for (const a of project.automation || []) {
      const tgt = parseTarget(a.target);
      if (!tgt || tgt.kind !== 'ch' || !NOTE_AUTO_MAP[tgt.param]) continue;
      if (!noteAuto.has(tgt.id)) noteAuto.set(tgt.id, {});
      noteAuto.get(tgt.id)[tgt.param] = a;
    }

    let count = 0;
    for (const ev of evs) {
      if (ev.chIdx < 0) continue;
      const ch = project.channels[ev.chIdx];
      if (!P9.channelAudible(project.channels, ev.chIdx)) continue;
      const t = timeOfStep(ev.startStep);
      if (!(t >= 0)) continue;
      const vel = clamp(ev.vel, 0.02, 1.27) * (ev.accent ? 1.15 : 1);

      if (ch.type === 'drum') {
        const v = graph.triggerDrum(ev.chIdx, ev.pitch, Math.min(1.2, vel), t);
        registerVoice(graph, v, t);
      } else {
        // bake per-note automation overrides
        const prm = Object.assign({}, P9.defaultParams(ch.type), ch.params || {});
        const autos = noteAuto.get(ch.id);
        if (autos) {
          for (const param of Object.keys(autos)) {
            const a = autos[param];
            const norm = contValue(a, P9.automationValueAt(a, ev.startStep));
            prm[param] = NOTE_AUTO_MAP[param](norm, prm);
          }
        }
        const chClone = Object.assign({}, ch, { params: prm });
        const durSec = P9.secPerStep(project.bpm) * ev.durSteps;
        const voice = P9.buildMelodicVoice(graph.ctx, chClone, ev.pitch, clamp(vel, 0, 1.2), t, durSec, graph.chanNodes[ev.chIdx].gain);
        // schedule note-off
        const offT = t + Math.max(0.03, durSec);
        voice.stop(offT);
        registerVoice(graph, voice, t, offT + ((prm.release || 0.2)) + 0.15);
      }
      count++;
    }
    return count;
  }

  /* ---- voice/source registry for panic/stop ---- */
  function registerVoice(graph, voice, tStart, hardEnd) {
    const end = hardEnd || voice.stopAt || (tStart + 2);
    graph._voices.push({ voice, end });
    if (graph._voices.length > 600) pruneVoices(graph);
  }
  function pruneVoices(graph) {
    const now = graph.ctx.currentTime;
    graph._voices = graph._voices.filter(v => v.end > now - 0.5);
  }
  function panic(graph) {
    const now = graph.ctx.currentTime;
    pruneVoices(graph);
    for (const v of graph._voices) {
      try {
        if (v.voice && typeof v.voice.stop === 'function') v.voice.stop(now);
        if (v.voice && Array.isArray(v.voice.oscs)) for (const o of v.voice.oscs) { try { o.stop(now + 0.05); } catch (e) {} }
      } catch (e) {}
    }
    graph._voices.length = 0;
  }

  /* ================= continuous automation scheduling ================= */

  function resolveParam(graph, project, tgt) {
    if (tgt.kind === 'mixer') {
      const idx = parseInt(tgt.id, 10);
      const st = graph.strips.find(s => s.idx === idx);
      if (!st) return null;
      if (tgt.param === 'volume') return st.gainNode ? st.gainNode.gain : null;
      if (tgt.param === 'pan' && st.panner) return st.panner.pan;
      return null;
    } else {
      const idx = (project.channels || []).findIndex(c => c.id === tgt.id);
      if (idx < 0) return null;
      const node = graph.chanNodes[idx];
      if (!node) return null;
      if (tgt.param === 'volume') return node.gain.gain;
      if (tgt.param === 'pan' && node.pan) return node.pan.pan;
      return null;
    }
  }

  /**
   * Schedule continuous automation points inside [fromStep,toStep).
   * boundary=true writes the interpolated value at fromStep first (used at start/wrap).
   */
  function scheduleAutomationWindow(graph, project, fromStep, toStep, timeOfStep, boundary) {
    for (const a of project.automation || []) {
      const tgt = parseTarget(a.target);
      if (!tgt || !CONTINUOUS_TARGETS.includes(tgt.param)) continue;
      const param = resolveParam(graph, project, tgt);
      if (!param) continue;
      const pts = a.points || [];
      if (!pts.length) continue;

      if (boundary) {
        const v0 = P9.automationValueAt(a, fromStep);
        try { param.setTargetAtTime(v0, timeOfStep(fromStep), 0.01); } catch (e) {}
      }
      for (const pt of pts) {
        if (pt.t < fromStep || pt.t >= toStep) continue;
        const val = contValue(a, pt.v);
        try { param.linearRampToValueAtTime(val, timeOfStep(pt.t)); } catch (e) {}
      }
    }
  }

  /* ================= Live transport ================= */

  class Transport {
    /**
     * @param ctx an AudioContext (running)
     * @param getProject() -> live project reference
     * @param hooks {onState(state), onPosition(stepFloat), onVoices(n)}
     */
    constructor(ctx, getProject, hooks) {
      this.ctx = ctx;
     this.getProject = getProject;
      this.hooks = hooks || {};
      this.graph = null;
      this.state = 'stopped'; // stopped | playing | paused
      this.lookahead = 0.14;   // sec scheduled ahead
      this.intervalMs = 25;
      this._timer = null;
      this._anchorStep = 0;    // song step corresponding to _anchorTime
      this._anchorTime = 0;    // ctx time
      this._nextStep = 0;      // next unscheduled step (absolute song coords)
      this._startPos = 0;
      this._posB = 0;          // beat display cache
    }

    _ensureGraph() {
      if (!this.graph) {
        this.graph = P9.buildGraph(this.ctx, this.getProject());
        this.graph._voices = [];
      }
      return this.graph;
    }

    rebuildGraph() {
      if (this.graph) { panic(this.graph); }
      this.graph = null;
      if (this.state === 'playing') { const p = this._nextStep; this._ensureGraph(); this._rebase(p, this.ctx.currentTime + 0.06, true); }
    }

    play(fromStep) {
      if (this.state === 'playing') return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._ensureGraph();
      const proj = this.getProject();
      let start = fromStep != null ? fromStep : (this.state === 'paused' ? this._pausedAt || 0 : this._startPos);
      if (this.state !== 'paused') start = fromStep != null ? fromStep : this._resolveStart(proj);
      this.state = 'playing';
      this._rebase(start, this.ctx.currentTime + 0.08, true);
      this._timer = setInterval(() => this._tick(), this.intervalMs);
      this._tick();
      // If the context can't leave 'suspended' (headless / blocked autoplay),
      // musical time cannot advance — surface that honestly instead of a fake cursor.
      setTimeout(() => {
        if (this.state === 'playing' && this.ctx.state !== 'running') {
          this.hooks.onAudioBlocked && this.hooks.onAudioBlocked();
        }
      }, 600);
      this.hooks.onState && this.hooks.onState(this.state);
    }

    _resolveStart(proj) {
      if (proj.playMode === 'song') return proj.loop.on ? proj.loop.startStep : 0;
      return 0;
    }

    pause() {
      if (this.state !== 'playing') return;
      this._pausedAt = this.positionStep();
      this.state = 'paused';
      clearInterval(this._timer); this._timer = null;
      if (this.graph) panic(this.graph);
      this.hooks.onState && this.hooks.onState(this.state);
    }

    stop() {
      clearInterval(this._timer); this._timer = null;
      const wasPlaying = this.state !== 'stopped';
      this.state = 'stopped';
      if (this.graph) panic(this.graph);
      const proj = this.getProject();
      this._nextStep = this._resolveStart(proj);
      this._startPos = this._nextStep;
      this.hooks.onState && this.hooks.onState(this.state);
      this.hooks.onPosition && this.hooks.onPosition(this._displayPos());
    }

    toggle() { this.state === 'playing' ? this.pause() : this.play(); }

    seek(step) {
      const proj = this.getProject();
      const maxStep = proj.playMode === 'song' ? Math.max(P9.songLengthSteps(proj), proj.loop.endStep) : 1e9;
      const s = clamp(step, 0, maxStep);
      if (this.state === 'playing') {
        this._rebase(s, this.ctx.currentTime + 0.05, true);
      } else {
        this._pausedAt = s; this._startPos = s; this._nextStep = s;
        this.hooks.onPosition && this.hooks.onPosition(s);
      }
    }

    _rebase(step, when, boundary) {
      this._anchorStep = step;
      this._anchorTime = when;
      this._nextStep = step;
      const g = this._ensureGraph();
      const proj = this.getProject();
      scheduleAutomationWindow(g, proj, step, step + this.lookaheadSteps(), this._t.bind(this), true);
    }

    lookaheadSteps() {
      const proj = this.getProject();
      return Math.ceil(this.lookahead / P9.secPerStep(proj.bpm)) + 1;
    }

    _t(absStep) {
      return this._anchorTime + P9.stepToTime(absStep - this._anchorStep, this.getProject().bpm, this.getProject().swing || 0);
    }

    _tick() {
      if (this.state !== 'playing') return;
      const proj = this.getProject();
      const g = this.graph; if (!g) return;
      const aheadSteps = this.lookaheadSteps();
      void aheadSteps;

      // loop wrap handling
      const loopEnd = proj.playMode === 'song'
        ? (proj.loop.on ? proj.loop.endStep : Infinity)
        : (proj.patterns[proj.currentPattern] ? proj.patterns[proj.currentPattern].length : 16);
      const loopStart = proj.playMode === 'song' ? (proj.loop.on ? proj.loop.startStep : 0)
        : 0;

      let guard = 0;
      while (this._t(this._nextStep) < this.ctx.currentTime + this.lookahead) {
        if (++guard > 512) break; // safety against zero-length loops
        const winEnd = Math.min(this._nextStep + 1, loopEnd);
        if (winEnd <= this._nextStep) { // at loop edge
          this._rebase(loopStart, this._t(this._nextStep), true);
          continue;
        }
        scheduleWindow(g, proj, this._nextStep, winEnd, this._t.bind(this));
        scheduleAutomationWindow(g, proj, this._nextStep, winEnd, this._t.bind(this), false);
        const reached = winEnd;
        if (proj.playMode === 'song' && !proj.loop.on && reached >= P9.songLengthSteps(proj)) {
          // natural end
          setTimeout(() => this.stop(), (this._t(reached) - this.ctx.currentTime) * 1000);
          break;
        }
        if (reached >= loopEnd) {
          // wrap now
          this._rebase(loopStart, this._t(reached), true);
        } else {
          this._nextStep = reached;
        }
        if (guard > 500) break;
      }
      pruneVoices(g);
      this.hooks.onVoices && this.hooks.onVoices(g._voices.length);
    }

    /** Current musical position in steps (float). */
    positionStep() {
      if (this.state === 'stopped') return this._startPos || 0;
      if (this.state === 'paused') return this._pausedAt || 0;
      const proj = this.getProject();
      const elapsed = this.ctx.currentTime - this._anchorTime;
      const spb = P9.secPerStep(proj.bpm);
      let pos = this._anchorStep + elapsed / spb;
      const loopEnd = proj.playMode === 'song' ? (proj.loop.on ? proj.loop.endStep : Infinity) : (proj.patterns[proj.currentPattern] ? proj.patterns[proj.currentPattern].length : 16);
      const loopStart = proj.playMode === 'song' ? (proj.loop.on ? proj.loop.startStep : 0) : 0;
      if (loopEnd !== Infinity && pos >= loopEnd && proj.loop.on || (proj.playMode === 'pattern' && pos >= loopEnd)) {
        const span = loopEnd - loopStart;
        pos = loopStart + ((pos - loopStart) % span);
      }
      return Math.max(loopStart, pos);
    }

    _displayPos() { return this.positionStep(); }
  }

  /* ================= Offline rendering (export + tests) ================= */

  /**
   * Render the project (SONG mode semantics: clips arranged; falls back to current pattern
   * if no clips) to an AudioBuffer via OfflineAudioContext.
   */
  async function renderOffline(project, opts) {
    opts = opts || {};
    const sr = opts.sampleRate || 44100;
    const proj = JSON.parse(JSON.stringify(project)); // snapshot: rendering must not mutate
    const wasMode = proj.playMode;
    if (opts.mode) proj.playMode = opts.mode;
    if (opts.currentPattern != null) proj.currentPattern = opts.currentPattern;

    let lenSteps;
    if (proj.playMode === 'pattern') {
      const pat = proj.patterns[proj.currentPattern];
      const reps = opts.repeats != null ? opts.repeats : 1;
      lenSteps = (pat ? pat.length : 16) * reps;
    } else {
      lenSteps = P9.songLengthSteps(proj);
      if (proj.loop.on && opts.loopRegion) {
        lenSteps = Math.max(lenSteps, proj.loop.endStep);
      }
    }
    lenSteps = clamp(Math.ceil(lenSteps), 1, 8192);
    const tailSec = opts.tailSec != null ? opts.tailSec : 1.6;
    const durSec = P9.stepToTime(lenSteps, proj.bpm, proj.swing || 0) + tailSec;
    const frames = Math.max(256, Math.ceil(durSec * sr));

    const OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext
      : (typeof webkitOfflineAudioContext !== 'undefined' ? webkitOfflineAudioContext : null);
    if (!OAC) throw new Error('OfflineAudioContext unavailable in this environment');

    const octx = new OAC(2, frames, sr);
    const graph = P9.buildGraph(octx, proj);
    graph._voices = [];

    // pattern mode repeats: collectEvents wraps the pattern, so one window covers all reps
    const timeOf = (absStep) => P9.stepToTime(absStep, proj.bpm, proj.swing || 0);
    scheduleWindow(graph, proj, 0, lenSteps, timeOf);
    // continuous automation across the whole render
    scheduleAutomationWindow(graph, proj, 0, lenSteps, timeOf, false);

    const buffer = await octx.startRendering();
    return { buffer, lengthSteps: lenSteps, durationSec: buffer.duration };
  }

  /** Render to 16-bit WAV ArrayBuffer. */
  async function renderToWav(project, opts) {
    const { buffer } = await renderOffline(project, opts);
    const L = buffer.getChannelData(0);
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const wav = P9.encodeWav([new Float32Array(L), new Float32Array(R)], buffer.sampleRate);
    return { wav, buffer };
  }

  return {
    Transport, renderOffline, renderToWav,
    scheduleWindow, scheduleAutomationWindow, panic,
    parseTarget, NOTE_AUTO_MAP, CONTINUOUS_TARGETS,
  };
});
