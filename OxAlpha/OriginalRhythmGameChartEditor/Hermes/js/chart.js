// PRISM PULSE — shared chart format, timing windows, scoring.
// Chart format (prism-pulse-chart-v1): note times are BEATS.
//   seconds = meta.offset + beats * 60 / meta.bpm
//   notes: {t: beats, lane: 0..3, type: 'tap'|'hold', dur?: hold length in beats}

export const LANES = 4;
export const LANE_KEYS = [
  { code: 'KeyD', label: 'D' }, { code: 'KeyF', label: 'F' },
  { code: 'KeyJ', label: 'J' }, { code: 'KeyK', label: 'K' },
];
export const LANE_COLORS = ['#22d3ee', '#f472b6', '#fbbf24', '#a3e635'];

// Judgment windows in ms (absolute delta from note time)
export const WINDOWS = [
  { name: 'Marvelous', ms: 30,  weight: 1.00, color: '#7dd3fc' },
  { name: 'Perfect',   ms: 65,  weight: 0.95, color: '#facc15' },
  { name: 'Great',     ms: 105, weight: 0.72, color: '#4ade80' },
  { name: 'Good',      ms: 145, weight: 0.40, color: '#fb923c' },
];
export const MISS_WINDOW = 150; // beyond worst Good -> miss once passed

export function beatsToSec(beats, bpm, offset = 0) { return offset + (beats * 60) / bpm; }
export function secToBeats(sec, bpm, offset = 0) { return ((sec - offset) * bpm) / 60; }

export function validateChart(c) {
  if (!c || typeof c !== 'object') return 'Not an object';
  if (!c.meta || !c.meta.bpm || !Array.isArray(c.notes)) return 'Missing meta.bpm or notes[]';
  for (const n of c.notes) {
    if (typeof n.t !== 'number' || !(n.lane >= 0 && n.lane < LANES)) return `Bad note ${JSON.stringify(n)}`;
    if (n.type !== 'tap' && n.type !== 'hold') return `Unknown type on note @${n.t}`;
    if (n.type === 'hold' && !(n.dur > 0)) return `Hold @${n.t} needs dur>0`;
  }
  c.notes.sort((a, b) => a.t - b.t);
  return null;
}

// Sort + dedupe exact overlaps per lane (editor safety)
export function normalizeChart(c) {
  const seen = new Set();
  c.notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  c.notes = c.notes.filter(n => {
    const k = n.lane + '@' + n.t.toFixed(3);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return c;
}

export function gradeFor(acc) {
  if (acc >= 0.995) return 'SS';
  if (acc >= 0.95) return 'S';
  if (acc >= 0.90) return 'A';
  if (acc >= 0.80) return 'B';
  if (acc >= 0.70) return 'C';
  return 'D';
}
