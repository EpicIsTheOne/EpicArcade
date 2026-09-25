import { A, MusicEngine } from "./audio.js";
import { BAR, BEAT } from "./constants.js";

const SCALE = [A.c3, A.d3, A.e3, A.g3, A.a3];
const HIGH_SCALE = [A.c5, A.d5, A.e5, A.g5, A.a5];
const PADS = {
  garden: [A.c3, A.e3, A.g3, A.a3],
  fracture: [A.d3, A.a3, A.d4, A.e4],
  drift: [A.c3, A.g3, A.c4, A.e4],
  orbit: [A.a2, A.e3, A.a3, A.c4],
  supernova: [A.c3, A.d3, A.e3, A.g3, A.a3]
};

function event(type, beat, options = {}) {
  return { type, beat, ...options };
}

function sectionForBar(bar) {
  if (bar < 6) return { phase: "intro", energy: 0.25, root: A.a2, scale: SCALE };
  if (bar < 20) return { phase: "bloom", energy: 0.52, root: A.a2, scale: SCALE };
  if (bar < 36) return { phase: "fracture", energy: 0.78, root: A.d3, scale: [A.d3, A.e3, A.g3, A.a3, A.c4] };
  if (bar < 52) return { phase: "drift", energy: 0.42, root: A.c3, scale: [A.c3, A.d3, A.e3, A.g3, A.a3] };
  if (bar < 66) return { phase: "orbit", energy: 0.9, root: A.a2, scale: [A.a2, A.c3, A.d3, A.e3, A.g3] };
  if (bar < 78) return { phase: "supernova", energy: 1, root: A.c3, scale: SCALE };
  return { phase: "outro", energy: 0.12, root: A.c3, scale: [A.c3, A.e3, A.g3, A.a3] };
}

export function buildSong() {
  const events = [];
  for (let bar = 0; bar < 80; bar += 1) {
    const section = sectionForBar(bar);
    const start = bar * 4;
    const isDrop = section.phase === "supernova";
    events.push(event("pad", start, { notes: PADS[section.phase] ?? PADS.garden, length: BAR, level: section.energy }));
    if (section.phase === "outro") {
      events.push(event("stinger", start, { notes: PADS.outro, length: BAR * 0.95 }));
      continue;
    }

    for (let beat = 0; beat < 4; beat += 1) {
      const at = start + beat;
      const downbeat = beat === 0;
      events.push(event("kick", at));
      if (downbeat || isDrop || section.phase === "fracture") events.push(event("snare", at));
      if (section.phase === "orbit") events.push(event("clap", at + 0.5));
      for (let step = 0; step < 2; step += 1) {
        if (section.energy < 0.2) continue;
        const hatAt = at + step * 0.5;
        events.push(event("hat", hatAt, { level: 0.045 + section.energy * 0.055, accent: downbeat && isDrop }));
      }

      const bassPattern = section.phase === "drift"
        ? [0, 0.5, 1.5, 2.5, 3]
        : section.phase === "orbit" || isDrop
          ? [0, 0.5, 1, 1.5, 2, 3, 3.5]
          : [0, 1, 2, 3];
      for (const offset of bassPattern) {
        if (section.energy < 0.4 && offset % 1 !== 0) continue;
        const note = section.root * (offset % 2 === 0 ? 1 : 1.12246);
        events.push(event("bass", at + offset, { note, length: BEAT * (offset % 1 ? 0.35 : 0.48), accent: downbeat ? 0.35 : 0 }));
      }

      if (section.energy > 0.45) {
        const steps = section.phase === "orbit" || isDrop ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 1, 2, 3];
        steps.forEach((offset, index) => {
          const degree = section.scale[(bar * 2 + beat + index) % section.scale.length];
          events.push(event("pluck", at + offset, { note: degree * 2, length: BEAT * 0.22, level: 0.035 + section.energy * 0.075 }));
        });
      }

      if (beat === 3 && section.phase !== "intro") {
        const lead = section.scale[(bar + 1) % section.scale.length] * (isDrop ? 2 : 1);
        events.push(event("pluck", at + 0.5, { note: lead, length: BEAT * 0.4, level: 0.1 }));
      }
    }
    if (bar % 4 === 0 && section.energy > 0.35) events.push(event("clap", start + 2.5, { level: 0.15 }));
  }
  events.push(event("sweep", 0, { length: BAR * 1.5, upward: true }));
  events.push(event("sweep", 64, { length: BAR * 2, upward: true }));
  events.push(event("sweep", 100, { length: BAR * 2, upward: true }));
  events.push(event("sweep", 136, { length: BAR * 2, upward: true }));
  events.push(event("sweep", 176, { length: BAR * 2, upward: true }));
  events.push(event("stinger", 64, { notes: PADS.fracture, length: BAR * 1.5 }));
  events.push(event("stinger", 100, { notes: PADS.drift, length: BAR * 1.5 }));
  events.push(event("stinger", 136, { notes: PADS.orbit, length: BAR * 1.5 }));
  events.sort((a, b) => a.beat - b.beat || a.type.localeCompare(b.type));
  return events;
}

export const SONG_EVENTS = buildSong();

export function createMusicEngine() {
  const engine = new MusicEngine();
  engine.registerEvents(SONG_EVENTS);
  return engine;
}
