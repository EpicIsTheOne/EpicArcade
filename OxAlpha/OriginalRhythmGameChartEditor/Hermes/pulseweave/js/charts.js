/* ============================================================
   PULSEWEAVE · charts.js
   Chart format (shared by game + editor) and the bundled,
   intentionally-charted difficulties for "Neon Meridian".
   Charts are DERIVED from the composition's real musical events
   (lead melody phrases + drum accents) — never random.
   ============================================================ */
window.PW = window.PW || {};
PW.Charts = (function () {
  'use strict';

  const FORMAT = 'pulseweave-chart@1';
  const SONG_ID = 'neon-meridian';

  // ---------- format helpers ----------
  const secPerBeat = (c) => 60 / c.meta.bpm;
  const beatToSec = (c, b) => c.meta.offset / 1000 + b * secPerBeat(c);
  const secToBeat = (c, s) => (s - c.meta.offset / 1000) / secPerBeat(c);

  function validate(json) {
    if (!json || typeof json !== 'object') return 'not an object';
    if (typeof json.meta !== 'object' || !json.meta) return 'missing meta';
    if (!Array.isArray(json.notes)) return 'missing notes';
    if (typeof json.meta.bpm !== 'number' || json.meta.bpm < 20 || json.meta.bpm > 600) return 'bad bpm';
    if (typeof json.meta.offset !== 'number') json.meta.offset = 0;
    const clean = [];
    for (const n of json.notes) {
      if (typeof n.b !== 'number' || !isFinite(n.b)) continue;
      if (!(n.lane >= 0 && n.lane <= 3)) continue;
      if (n.t === 'hold') {
        clean.push({ b: n.b, lane: n.lane | 0, t: 'hold', d: Math.max(.25, Math.min(32, n.d || 1)) });
      } else {
        clean.push({ b: n.b, lane: n.lane | 0, t: 'tap' });
      }
    }
    clean.sort((a, b) => a.b - b.b || a.lane - b.lane);
    json.notes = clean;
    json.format = FORMAT;
    return null;
  }

  const clone = (c) => JSON.parse(JSON.stringify(c));
  const endSec = (c, n) => beatToSec(c, n.b + (n.t === 'hold' ? n.d : 0));

  // ---------- generation ----------
  // pitch → lane: higher = further right (clamped)
  const midiLane = (m) => Math.max(0, Math.min(3, Math.floor((m - 63) / 3.5)));

  /**
   * Resolve same-lane collisions by nudging notes to neighbouring lanes
   * (keeping pitch contour feel). Returns cleaned note list.
   */
  function resolveCollisions(raw, minSame, minAny) {
    raw.sort((a, b) => a.b - b.b);
    const out = [];
    for (const n of raw) {
      const taken = new Set();
      for (let i = out.length - 1; i >= 0; i--) {
        const p = out[i];
        if (n.b - p.b >= minAny) break;
        taken.add(p.lane);
        if (p.t === 'hold' && n.b < p.b + p.d - minSame * .5) taken.add(p.lane);
      }
      if (!taken.has(n.lane)) { out.push(n); continue; }
      let placed = false;
      for (const off of [1, -1, 2, -2]) {
        const l = ((n.lane + off) % 4 + 4) % 4;
        if (!taken.has(l)) { out.push({ ...n, lane: l }); placed = true; break; }
      }
      if (!placed) out.push({ ...n, lane: (n.lane + 2) % 4 }); // last resort
    }
    out.sort((a, b) => a.b - b.b || a.lane - b.lane);
    return out;
  }

  /** gap (beats) from nearest existing note at similar position */
  function nearestGap(notes, b) {
    let g = Infinity;
    for (const n of notes) g = Math.min(g, Math.abs(n.b - b));
    return g;
  }

  function generateDiff(events, diff) {
    const mel = events.melody.map(e => ({ b: e.b, midi: e.midi, dur: e.d }));
    const drums = events.drums.filter(d => d.g >= .8);
    const rolls = events.drums.filter(d => d.kind === 'snare' && d.g < .8);
    const notes = [];
    let lastKept = -99;

    if (diff === 'easy') {
      for (const m of mel) {
        const onBeat = Math.abs(m.b - Math.round(m.b)) < .01;
        if (!onBeat && m.dur < 1) continue;
        if (m.b - lastKept < 1) continue;
        lastKept = m.b;
        if (m.dur >= 2) notes.push({ b: m.b, lane: midiLane(m.midi), t: 'hold', d: Math.min(4, m.dur - .5) });
        else notes.push({ b: m.b, lane: midiLane(m.midi), t: 'tap' });
      }
      return resolveCollisions(notes, 1, 1);
    }

    if (diff === 'normal') {
      for (const m of mel) {
        lastKept = m.b;
        if (m.dur >= 1.5) notes.push({ b: m.b, lane: midiLane(m.midi), t: 'hold', d: Math.min(4, m.dur - .5) });
        else notes.push({ b: m.b, lane: midiLane(m.midi), t: 'tap' });
      }
      // drum accents fill gaps ≥ 1 beat on integer beats
      for (const d of drums) {
        if (Math.abs(d.b - Math.round(d.b)) > .01) continue;
        if (nearestGap(notes, d.b) < 1) continue;
        notes.push({ b: d.b, lane: midiLane(d.kind === 'kick' ? 52 : 76), t: 'tap' });
      }
      return resolveCollisions(notes, .9, .45);
    }

    // hard: melody + all strong drums + snare-roll bursts
    for (const m of mel) {
      if (m.dur >= 1.5) notes.push({ b: m.b, lane: midiLane(m.midi), t: 'hold', d: Math.min(4, m.dur - .5) });
      else notes.push({ b: m.b, lane: midiLane(m.midi), t: 'tap' });
    }
    for (const d of [...drums, ...rolls]) {
      if (nearestGap(notes, d.b) < .48) continue;
      const laneHint = d.kind === 'kick' ? 52 : 78;
      notes.push({ b: d.b, lane: midiLane(laneHint), t: 'tap' });
    }
    return resolveCollisions(notes, .5, .26);
  }

  // ---------- bundled charts ----------
  function buildBundled() {
    const ev = PW.Music.getChartEvents();
    const defs = [
      { id: `${SONG_ID}:easy`,   difficulty: 'EASY',   level: 3, color: '#b6ff3c', gen: 'easy' },
      { id: `${SONG_ID}:normal`, difficulty: 'NORMAL', level: 6, color: '#35e6ff', gen: 'normal' },
      { id: `${SONG_ID}:hard`,   difficulty: 'HARD',   level: 8, color: '#ff4fd8', gen: 'hard' }
    ];
    return defs.map(d => ({
      format: FORMAT,
      id: d.id,
      songId: SONG_ID,
      meta: {
        title: 'Neon Meridian',
        artist: 'PULSEWEAVE Sound Lab',
        difficulty: d.difficulty,
        level: d.level,
        color: d.color,
        bpm: ev.bpm,
        offset: 0
      },
      notes: generateDiff(ev, d.gen)
    }));
  }

  return { FORMAT, SONG_ID, beatToSec, secToBeat, secPerBeat, validate, clone, endSec, buildBundled };
})();
