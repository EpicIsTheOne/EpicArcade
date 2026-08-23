/* PULSE-9 core: pure sequencer math (no DOM, no audio) — shared by live engine, offline render & tests */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  const STEPS_PER_BEAT = 4; // 1 step = 1/16 note

  function secPerStep(bpm) { return 60 / bpm / STEPS_PER_BEAT; }

  /** Convert step position -> seconds.
   * Swing delays ODD 16th-note steps (classic shuffle): oddStepDelay = swing% of one step.
   * Fractional positions interpolate linearly within their step. */
  function stepToTime(step, bpm, swingPct) {
    const spb = secPerStep(bpm);
    if (!(spb > 0)) return 0;
    const s = Math.max(0, step);
    const whole = Math.floor(s), frac = s - whole;
    const odd = ((whole % 2) + 2) % 2 === 1;
    const sw = (swingPct > 0 && swingPct <= 100) ? (swingPct / 100) : 0;
    return (whole + frac + (odd ? sw : 0)) * spb;
  }

  /** Inverse mapping seconds -> step (linear; swing ignored for inverse). */
  function timeToStep(t, bpm) {
    const spb = secPerStep(bpm);
    return (spb > 0 && t > 0) ? t / spb : 0;
  }

  // ---- drum voice mapping: channels carry params.lane; pitch tags the voice for the engine ----
  const DRUM_LANE_KEYS = ['kick', 'snare', 'hatClosed', 'clap', 'hatOpen', 'tom', 'rim', 'crash'];
  const DRUM_VOICE_PITCHES = { kick: 36, snare: 38, hatClosed: 42, clap: 39, hatOpen: 46, tom: 45, rim: 37, crash: 49 };
  const DRUM_LABELS = { kick: 'Kick', snare: 'Snare', hatClosed: 'Hat', clap: 'Clap', hatOpen: 'Open Hat', tom: 'Tom', rim: 'Rim', crash: 'Crash' };

  function drumLaneOfChannel(channel) {
    if (!channel || !channel.params) return 'kick';
    const lane = channel.params.lane;
    return DRUM_LANE_KEYS.includes(lane) ? lane : 'kick';
  }

  function drumPitchFor(channel) {
    return DRUM_VOICE_PITCHES[drumLaneOfChannel(channel)];
  }

  /**
   * Collect note events overlapping [fromStep, toStep).
   * Returns [{chIdx, chId, pitch, vel, accent, startStep(abs), durSteps, isDrumStep}]
   * sorted by startStep. Pure function of the project data.
   */
  function collectEvents(project, fromStep, toStep) {
    const events = [];
    if (!project || !Array.isArray(project.channels) || !Array.isArray(project.patterns)) return events;
    const chIndex = new Map();
    project.channels.forEach((c, i) => chIndex.set(c.id, i));
    const patById = new Map(project.patterns.map(p => [p.id, p]));

    const pushNote = (pat, base, srcLen, n) => {
      if (n.start < 0 || n.start >= srcLen || !n.dur) return;
      const absStart = base + n.start;
      const durSteps = Math.min(n.dur, srcLen - n.start);
      if (absStart >= toStep || absStart + durSteps <= fromStep) return;
      events.push({
        chIdx: chIndex.has(n.ch) ? chIndex.get(n.ch) : -1,
        chId: n.ch,
        pitch: n.pitch | 0,
        vel: typeof n.vel === 'number' ? n.vel : 0.78,
        accent: false,
        startStep: absStart,
        durSteps,
        isDrumStep: false,
      });
    };

    const pushDrumSteps = (pat, base, srcLen, chId, arr) => {
      if (!Array.isArray(arr)) return;
      const lim = Math.min(arr.length, Math.ceil(srcLen));
      for (let s = 0; s < lim; s++) {
        const v = arr[s];
        if (!v) continue;
        const abs = base + s;
        if (abs < fromStep || abs >= toStep) continue;
        events.push({
          chIdx: chIndex.has(chId) ? chIndex.get(chId) : -1,
          chId,
          pitch: drumPitchFor(project.channels[chIndex.get(chId)]),
          vel: v > 1 ? 1 : v,
          accent: v > 1,
          startStep: abs,
          durSteps: 1,
          isDrumStep: true,
        });
      }
    };

    const pushPattern = (pat, base, srcLen) => {
      for (const n of pat.notes || []) pushNote(pat, base, srcLen, n);
      for (const chId of Object.keys(pat.steps || {})) pushDrumSteps(pat, base, srcLen, chId, pat.steps[chId]);
    };

    if (project.playMode === 'pattern') {
      const pat = project.patterns[project.currentPattern];
      if (pat) {
        const len = Math.max(1, pat.length | 0);
        // cover wraps: start one length before so notes crossing into window are caught
        const firstBase = fromStep - (fromStep % len) - len;
        for (let base = firstBase; base < toStep; base += len) {
          pushPattern(pat, base, len);
        }
      }
    } else {
      for (const clip of project.clips || []) {
        const pat = patById.get(clip.patternId);
        if (!pat) continue;
        const cs = clip.start;
        if (cs >= toStep || cs + clip.length <= fromStep) continue;
        pushPattern(pat, cs, Math.min(pat.length, clip.length));
      }
    }

    events.sort((a, b) => a.startStep - b.startStep || a.chIdx - b.chIdx);
    return events;
  }

  /** Automation value at step position: linear interp between points, clamped to ends. */
  function automationValueAt(auto, step) {
    const pts = auto && auto.points;
    if (!pts || !pts.length) return auto ? auto.min : 0;
    if (step <= pts[0].t) return pts[0].v;
    const last = pts[pts.length - 1];
    if (step >= last.t) return last.v;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (step >= a.t && step <= b.t) {
        const f = b.t === a.t ? 0 : (step - a.t) / (b.t - a.t);
        return a.v + (b.v - a.v) * f;
      }
    }
    return last.v;
  }

  /** Effective audibility given mutes/solos. */
  function channelAudible(channels, idx) {
    const ch = channels[idx];
    if (!ch || ch.muted) return false;
    if (channels.some(c => c.solo)) return !!ch.solo;
    return true;
  }

  /** Song length in steps (end of last clip / automation point / min bar). */
  function songLengthSteps(project) {
    let end = 16;
    for (const c of project.clips || []) end = Math.max(end, c.start + c.length);
    for (const a of project.automation || []) {
      for (const pt of a.points || []) end = Math.max(end, pt.t + 1);
    }
    return end;
  }

  return {
    STEPS_PER_BEAT, secPerStep, stepToTime, timeToStep,
    collectEvents, automationValueAt, channelAudible, songLengthSteps,
    DRUM_VOICE_PITCHES, DRUM_LANE_KEYS, DRUM_LABELS, drumLaneOfChannel, drumPitchFor,
  };
});
