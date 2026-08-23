/* PULSE-9 core: project model + serialization
 * Plain data (JSON-safe). No DOM, no audio — pure logic so Node tests can run it.
 */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  const FORMAT = 'pulse9.project';
  const VERSION = 3;

  // ---------- id helpers ----------
  let _idCounter = 1;
  function uid(prefix) { return (prefix || 'x') + '_' + (_idCounter++) + '_' + Math.random().toString(36).slice(2, 8); }
  function resetIds(n) { _idCounter = n | 0; }

  const INSTRUMENT_TYPES = ['synth', 'bass', 'keys', 'drum', 'sampler'];

  // ---------- factories ----------
  function newChannel(type, name) {
    type = INSTRUMENT_TYPES.includes(type) ? type : 'synth';
    const ch = {
      id: uid('ch'),
      type,
      name: name || defaultName(type),
      color: pickColor(),
      volume: 0.8,          // 0..1.4
      pan: 0,               // -1..1
      muted: false,
      solo: false,
      mixer: 1,             // mixer strip index (0=master)
      params: defaultParams(type),
    };
    return ch;
  }

  function defaultName(type) {
    return { synth: 'Lead Synth', bass: 'Bass', keys: 'Keys', drum: 'Drums', sampler: 'Sampler' }[type] || 'Channel';
  }

  function pickColor() {
    const palette = ['#33e0c8', '#7aa2ff', '#ffb454', '#ff6e91', '#a78bfa', '#59d97a', '#f47067', '#5ad0f0'];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  function defaultParams(type) {
    switch (type) {
      case 'synth': return {
        waveA: 'sawtooth', waveB: 'square', detune: 12, mix: 0.4,
        attack: 0.005, decay: 0.18, sustain: 0.55, release: 0.22,
        cutoff: 3200, resonance: 6, filterEnv: 2600, glide: 0,
        unison: 2, spread: 0.35,
      };
      case 'bass': return {
        waveA: 'sawtooth', waveB: 'sine', detune: 4, mix: 0.5,
        attack: 0.003, decay: 0.22, sustain: 0.45, release: 0.10,
        cutoff: 700, resonance: 8, filterEnv: 1800, glide: 0.04,
        unison: 1, spread: 0,
      };
      case 'keys': return {
        waveA: 'triangle', waveB: 'sine', detune: 7, mix: 0.25,
        attack: 0.004, decay: 0.9, sustain: 0.28, release: 0.45,
        cutoff: 5200, resonance: 2, filterEnv: 1200, glide: 0,
        unison: 2, spread: 0.5,
      };
      case 'drum': return {
        tune: 0, decayScale: 1, snap: 0.5, tone: 0.5, noise: 0.5, drive: 0.15,
      };
      case 'sampler': return {
        attack: 0.002, release: 0.08, gain: 1.0, start: 0,
        loopMode: 'off', loopStart: 0, loopEnd: 0.5,
      };
    }
    return {};
  }

  function newPattern(name) {
    return {
      id: uid('pat'),
      name: name || 'Pattern',
      length: 16,             // steps (16ths)
      notes: [],              // {id,ch,start,dur,pitch,vel}  start/dur in steps (float)
      steps: {},              // chId -> array of 0/1/vel(>1 means accent-ish vel encoded later); drum step grid
    };
  }

  function newClip(patternId, start, track, lengthSteps) {
    return {
      id: uid('clip'),
      patternId,
      start,                 // in steps from song start (float)
      track: track | 0,      // playlist lane index
      length: lengthSteps != null ? lengthSteps : 16,
    };
  }

  function newAutomation(target) {
    return {
      id: uid('auto'),
      target,                // e.g. "mixer.1.volume" | "ch.<id>.cutoff"
      points: [{ t: 0, v: 0.5 }],
      min: 0, max: 1,
      track: null,           // playlist lane if arranged; null => global over song
    };
  }

  function newProject() {
    return {
      format: FORMAT,
      version: VERSION,
      name: 'Untitled',
      bpm: 128,
      swing: 0,
      masterVolume: 0.85,
      patterns: [],
      channels: [],
      clips: [],
      automation: [],
      tracks: 8,
      loop: { on: true, startStep: 0, endStep: 64 },
      playMode: 'pattern',   // 'pattern' | 'song'
      currentPattern: 0,
    };
  }

  // ---------- validation & migration ----------
  class ProjectError extends Error {}

  function validateProject(data) {
    if (!data || typeof data !== 'object') throw new ProjectError('Not an object');
    if (data.format !== FORMAT) throw new ProjectError('Unknown format "' + data.format + '" — expected ' + FORMAT);
    const v = typeof data.version === 'number' ? Math.floor(data.version) : NaN;
    if (!(v >= 1 && v <= VERSION)) throw new ProjectError('Unsupported version ' + data.version);
    return v;
  }

  /** Deep-normalize untrusted JSON into a valid project. Throws ProjectError on hopeless input. */
  function loadProject(data) {
    const v = validateProject(data);
    const p = newProject();
    p.name = sanitizeStr(data.name, 80) || 'Untitled';
    p.bpm = clampNum(data.bpm, 20, 999, 128);
    p.swing = clampNum(data.swing, 0, 100, 0);
    p.masterVolume = clampNum(data.masterVolume, 0, 1.5, 0.85);
    p.playMode = data.playMode === 'song' ? 'song' : 'pattern';
    p.tracks = clampInt(data.tracks, 1, 32, 8);

    if (data.loop && typeof data.loop === 'object') {
      p.loop.on = !!data.loop.on;
      p.loop.startStep = Math.max(0, Number(data.loop.startStep) || 0);
      p.loop.endStep = Math.max(p.loop.startStep + 1, Number(data.loop.endStep) || 64);
    }

    // channels
    const chanIds = new Set();
    if (Array.isArray(data.channels)) {
      for (const c of data.channels.slice(0, 64)) {
        if (!c || typeof c !== 'object') continue;
        const ch = newChannel(INSTRUMENT_TYPES.includes(c.type) ? c.type : 'synth');
        ch.name = sanitizeStr(c.name, 40) || ch.name;
        if (typeof c.id === 'string' && c.id && !chanIds.has(c.id)) { ch.id = c.id; }
        chanIds.add(ch.id);
        ch.color = /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : ch.color;
        ch.volume = clampNum(c.volume, 0, 1.4, 0.8);
        ch.pan = clampNum(c.pan, -1, 1, 0);
        ch.muted = !!c.muted;
        ch.solo = !!c.solo;
        ch.mixer = clampInt(c.mixer, 0, 31, 1);
        ch.params = Object.assign(ch.params, isObj(c.params) ? c.params : {});
        p.channels.push(ch);
      }
    }

    // patterns
    const patIds = new Set();
    if (Array.isArray(data.patterns)) {
      for (const q of data.patterns.slice(0, 256)) {
        if (!q || typeof q !== 'object') continue;
        const pat = newPattern();
        if (typeof q.id === 'string' && q.id && !patIds.has(q.id)) pat.id = q.id;
        patIds.add(pat.id);
        pat.name = sanitizeStr(q.name, 40) || pat.name;
        pat.length = clampInt(q.length, 1, 512, 16);
        pat.notes = [];
        if (Array.isArray(q.notes)) {
          for (const n of q.notes.slice(0, 4096)) {
            if (!n || typeof n !== 'object') continue;
            if (!chanIds.has(n.ch)) continue;
            pat.notes.push({
              id: typeof n.id === 'string' && n.id ? n.id : uid('n'),
              ch: n.ch,
              start: clampNum(n.start, 0, 4096, 0),
              dur: clampNum(n.dur, 0.05, 1024, 1),
              pitch: clampInt(n.pitch, 0, 127, 60),
              vel: clampNum(n.vel, 0.01, 1.27, 0.78),
            });
          }
        }
        pat.steps = {};
        if (isObj(q.steps)) {
          for (const k of Object.keys(q.steps)) {
            if (!chanIds.has(k)) continue;
            const arr = q.steps[k];
            if (!Array.isArray(arr)) continue;
            pat.steps[k] = arr.slice(0, pat.length).map(x => clampNum(x, 0, 1.27, 0));
            while (pat.steps[k].length < pat.length) pat.steps[k].push(0);
          }
        }
        p.patterns.push(pat);
      }
    }

    // clips
    if (Array.isArray(data.clips)) {
      for (const c of data.clips.slice(0, 2048)) {
        if (!c || typeof c !== 'object') continue;
        if (!patIds.has(c.patternId)) continue;
        p.clips.push({
          id: typeof c.id === 'string' && c.id ? c.id : uid('clip'),
          patternId: c.patternId,
          start: clampNum(c.start, 0, 65536, 0),
          track: clampInt(c.track, 0, p.tracks - 1, 0),
          length: clampNum(c.length, 1, 4096, 16),
        });
      }
    }

    // automation
    if (Array.isArray(data.automation)) {
      for (const a of data.automation.slice(0, 64)) {
        if (!a || !isObj(a)) continue;
        const target = sanitizeAutomationTarget(a.target, p);
        if (!target) continue;
        const auto = {
          id: typeof a.id === 'string' && a.id ? a.id : uid('auto'),
          target,
          min: clampNum(a.min, -2, 2, 0),
          max: clampNum(a.max, -2, 2, 1),
          track: a.track == null ? null : clampInt(a.track, 0, p.tracks - 1, 0),
          points: [],
        };
        if (Array.isArray(a.points)) {
          for (const pt of a.points.slice(0, 512)) {
            if (!pt || !isObj(pt)) continue;
            auto.points.push({ t: clampNum(pt.t, 0, 65536, 0), v: clampNum(pt.v, 0, 2, 0.5) });
          }
        }
        auto.points.sort((x, y) => x.t - y.t);
        if (!auto.points.length) auto.points.push({ t: 0, v: auto.min });
        p.automation.push(auto);
      }
    }

    p.currentPattern = clampInt(data.currentPattern, 0, Math.max(0, p.patterns.length - 1), 0);
    resetIds(Math.floor(Math.random() * 100000) + 1);
    return p;
  }

  function sanitizeAutomationTarget(t, p) {
    if (typeof t !== 'string') return null;
    const parts = t.split('.');
    if (parts.length < 3) return null;
    if (parts[0] === 'mixer') {
      const idx = parseInt(parts[1], 10);
      if (!(idx >= 0 && idx <= 31)) return null;
      if (!['volume', 'pan'].includes(parts[2])) return null;
      return `mixer.${idx}.${parts[2]}`;
    }
    if (parts[0] === 'ch') {
      if (!p.channels.some(c => c.id === parts[1])) return null;
      const allowed = ['volume', 'pan', 'cutoff', 'resonance', 'attack', 'release', 'detune'];
      if (!allowed.includes(parts[2])) return null;
      return `ch.${parts[1]}.${parts[2]}`;
    }
    return null;
  }

  function serialize(project) {
    return JSON.parse(JSON.stringify({
      format: project.format, version: VERSION, name: project.name,
      bpm: project.bpm, swing: project.swing, masterVolume: project.masterVolume,
      patterns: project.patterns, channels: project.channels, clips: project.clips,
      automation: project.automation, tracks: project.tracks,
      loop: project.loop, playMode: project.playMode, currentPattern: project.currentPattern,
    }));
  }

  // ---------- utils ----------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function clampNum(x, lo, hi, dflt) { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }
  function clampInt(x, lo, hi, dflt) { const n = parseInt(x, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }
  function sanitizeStr(s, max) { return typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, max) : ''; }

  /* ---- note helpers ---- */
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiToName(m) { return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function isBlackKey(m) { return [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12); }

  /* ---- undo/redo history ---- */
  function createHistory(limit) {
    limit = limit || 100;
    let undoStack = [], redoStack = [];
    return {
      push(snapshot) {
        undoStack.push(JSON.stringify(snapshot));
        if (undoStack.length > limit) undoStack.shift();
        redoStack.length = 0;
      },
      undo(current) {
        if (!undoStack.length) return null;
        redoStack.push(JSON.stringify(current));
        return JSON.parse(undoStack.pop());
      },
      redo(current) {
        if (!redoStack.length) return null;
        undoStack.push(JSON.stringify(current));
        return JSON.parse(redoStack.pop());
      },
      get canUndo() { return undoStack.length > 0; },
      get canRedo() { return redoStack.length > 0; },
      clear() { undoStack.length = 0; redoStack.length = 0; },
      get depth() { return undoStack.length; },
    };
  }

  /* ---- autosave (localStorage guarded) ---- */
  const AUTOSAVE_KEY = 'pulse9.autosave.v1';
  function autosaveSave(project) {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialize(project))); return true; }
    catch (e) { return false; }
  }
  function autosaveLoadRaw() {
    try { const s = localStorage.getItem(AUTOSAVE_KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  function autosaveClear() { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {} }

  return {
    FORMAT, VERSION, INSTRUMENT_TYPES,
    uid, newProject, newChannel, newPattern, newClip, newAutomation, defaultParams,
    validateProject, loadProject, serialize, ProjectError,
    midiToFreq, midiToName, isBlackKey, NOTE_NAMES,
    createHistory,
    autosaveSave, autosaveLoadRaw, autosaveClear, AUTOSAVE_KEY,
    _clampNum: clampNum, _clampInt: clampInt, _sanitizeStr: sanitizeStr, _resetIdsForTest: resetIds,
  };
});
