import { BAR, BEAT, CEILING_Y, FINISH_BEAT, FLOOR_Y, LOWER_LANE_Y, UPPER_LANE_Y, WORLD_SPEED } from "./constants.js";

const beatToX = (beat) => beat * BEAT * WORLD_SPEED;

export const SECTIONS = [
  { id: "intro", title: "The Waking Garden", subtitle: "Follow the first pulse", startBeat: 0, endBeat: 24, mode: "intro", checkpoint: 0 },
  { id: "bloom", title: "Bloomstep", subtitle: "Tap on the luminous beat", startBeat: 24, endBeat: 80, mode: "bloom", checkpoint: 24 },
  { id: "fracture", title: "Fracture Choir", subtitle: "Invert the falling note", startBeat: 80, endBeat: 144, mode: "fracture", checkpoint: 80 },
  { id: "drift", title: "Starlift", subtitle: "Hold to rise, release to fall", startBeat: 144, endBeat: 208, mode: "drift", checkpoint: 144 },
  { id: "orbit", title: "Sieve of Stars", subtitle: "Switch rails on the pulse", startBeat: 208, endBeat: 264, mode: "orbit", checkpoint: 208 },
  { id: "supernova", title: "Supernova Loom", subtitle: "Carry every movement through the drop", startBeat: 264, endBeat: 312, mode: "finale", checkpoint: 264 },
  { id: "outro", title: "Aster Relay", subtitle: "The threshold remembers you", startBeat: 312, endBeat: 320, mode: "outro", checkpoint: 312 }
];

export const CHECKPOINTS = SECTIONS.filter((section) => section.id !== "outro").map((section) => ({
  beat: section.checkpoint,
  sectionId: section.id,
  title: section.title
}));

function addSurface(surfaces, startBeat, endBeat, y, options = {}) {
  surfaces.push({
    id: `surface-${surfaces.length}`,
    startX: beatToX(startBeat),
    endX: beatToX(endBeat),
    y,
    height: options.height ?? 110,
    ceiling: Boolean(options.ceiling),
    oneWay: options.oneWay ?? true,
    theme: options.theme ?? "garden",
    decorativeOnly: options.decorativeOnly ?? false
  });
}

function addHazard(hazards, beat, type, lane, options = {}) {
  const laneY = lane === "upper" ? UPPER_LANE_Y : lane === "ceiling" ? CEILING_Y : FLOOR_Y;
  hazards.push({
    id: `hazard-${hazards.length}`,
    beat,
    x: beatToX(beat),
    y: options.y ?? laneY,
    radius: options.radius ?? (type === "spike" ? 19 : 22),
    type,
    lane,
    color: options.color,
    phase: options.phase ?? 0,
    damage: true
  });
}

function addCollectible(collectibles, beat, y, kind = "memory") {
  collectibles.push({ id: `mote-${collectibles.length}`, beat, x: beatToX(beat), y, radius: 12, kind, collected: false });
}

function addMemory(decor, beat, options = {}) {
  decor.push({
    x: beatToX(beat),
    beat,
    kind: options.kind ?? "petal",
    y: options.y ?? 300 + (beat % 7) * 32,
    scale: options.scale ?? 1,
    phase: options.phase ?? 0
  });
}

function buildAuthoredContent() {
  const surfaces = [];
  const hazards = [];
  const collectibles = [];
  const decor = [];
  const autopilot = [];

  addSurface(surfaces, 0, 79.5, FLOOR_Y, { theme: "garden" });
  addSurface(surfaces, 31, 34.2, 472, { theme: "canopy", height: 34 });
  addSurface(surfaces, 45.5, 48.5, 438, { theme: "canopy", height: 34 });
  addSurface(surfaces, 58, 61, 455, { theme: "canopy", height: 34 });

  const bloomHazards = [27, 31, 40, 76, 78];
  bloomHazards.forEach((beat, index) => {
    addHazard(hazards, beat, index % 4 === 3 ? "chime" : "spike", "ground");
    autopilot.push({ beat: beat - 0.50, action: "press", reason: "bloom" });
    if (index % 3 === 0) addCollectible(collectibles, beat + 0.9, FLOOR_Y - 175);
  });
  [27, 33, 41, 49, 57, 65, 73].forEach((beat, index) => {
    addMemory(decor, beat, { kind: index % 2 ? "bell" : "petal", y: 280 + (index % 3) * 80 });
  });

  addSurface(surfaces, 79.5, 144.5, FLOOR_Y, { theme: "fracture" });
  addSurface(surfaces, 79.5, 144.5, CEILING_Y, { ceiling: true, theme: "fracture" });
  const fractureGround = [];
  const fractureCeiling = [];
  fractureGround.forEach((beat, index) => {
    addHazard(hazards, beat, index % 3 === 0 ? "chime" : "spike", "ground", { color: "coral" });
    autopilot.push({ beat: beat, action: "press", reason: "fracture-ground" });
    if (index % 2 === 0) addCollectible(collectibles, beat + 1, CEILING_Y + 175, "echo");
  });
  fractureCeiling.forEach((beat, index) => {
    addHazard(hazards, beat, index % 3 === 1 ? "chime" : "spike", "ceiling", { color: "coral" });
    autopilot.push({ beat: beat, action: "press", reason: "fracture-ceiling" });
  });

  addSurface(surfaces, 144, 208, FLOOR_Y, { theme: "drift" });
  addSurface(surfaces, 150, 153.4, 405, { theme: "cloud", height: 28 });
  addSurface(surfaces, 160, 164.2, 335, { theme: "cloud", height: 28 });
  addSurface(surfaces, 171, 175.1, 430, { theme: "cloud", height: 28 });
  addSurface(surfaces, 184, 188, 280, { theme: "cloud", height: 28 });
  addSurface(surfaces, 197, 208, 365, { theme: "cloud", height: 28 });
  const driftHolds = [[145, 149.6], [153.5, 157.2], [165, 168.2], [176, 179.4], [188.5, 192.2], [200, 203.4]];
  driftHolds.forEach(([startBeat, endBeat], index) => {
    autopilot.push({ beat: startBeat, endBeat, action: "hold", reason: "drift" });
    addCollectible(collectibles, (startBeat + endBeat) / 2, index % 2 ? 330 : 430, "star");
  });
  [
    [149.2, 300], [155.8, 245], [161.5, 410], [170.1, 250], [176.8, 330],
    [183.2, 220], [190.1, 360], [195.6, 285], [203.8, 400]
  ].forEach(([beat, y], index) => addHazard(hazards, beat, index % 2 ? "mote" : "chime", "air", { y, radius: 23, color: "saffron" }));
  for (let beat = 146; beat < 207; beat += 4.7) {
    addMemory(decor, beat, { kind: "ribbon", y: 190 + (beat % 3) * 60, scale: 1.4 });
  }

  const orbitHazards = [];
  for (let beat = 210; beat < 264; beat += 2) {
    const lane = orbitHazards.length % 2 === 0 ? "lower" : "upper";
    orbitHazards.push({ beat, lane });
    addHazard(hazards, beat, orbitHazards.length % 3 === 0 ? "chime" : "mote", lane, { radius: 22, color: "violet" });
    autopilot.push({ beat: beat - 0.42, action: "press", reason: "orbit" });
    if (orbitHazards.length % 2 === 0) addCollectible(collectibles, beat + 0.8, UPPER_LANE_Y - 90, "resonance");
  }
  addSurface(surfaces, 208, 264, LOWER_LANE_Y, { theme: "orbit", height: 26 });
  addSurface(surfaces, 208, 264, UPPER_LANE_Y, { theme: "orbit", height: 26 });
  for (let beat = 209; beat < 264; beat += 3.5) {
    addMemory(decor, beat, { kind: "orbit", y: 390, scale: 1.8 });
  }

  addSurface(surfaces, 264, 312, FLOOR_Y, { theme: "supernova" });
  addSurface(surfaces, 264, 312, CEILING_Y, { ceiling: true, theme: "supernova" });
  [267, 270, 273].forEach((beat) => {
    addHazard(hazards, beat, "spike", "ground", { color: "amber" });
    autopilot.push({ beat: beat - 0.78, action: "press", reason: "final-bloom" });
  });
  [267, 270, 273].forEach((beat, index) => {
    addHazard(hazards, beat, "chime", index % 2 ? "ceiling" : "ground", { color: "coral" });
    autopilot.push({ beat: beat, action: "press", reason: "final-fracture" });
  });
  autopilot.push({ beat: 289, endBeat: 292, action: "hold", reason: "final-drift" });
  autopilot.push({ beat: 294, endBeat: 297, action: "hold", reason: "final-drift" });
  addHazard(hazards, 291, "mote", "air", { y: 310, color: "saffron" });
  addHazard(hazards, 296, "chime", "air", { y: 390, color: "saffron" });
  for (let beat = 0; beat < 0; beat += 2) {
    const lane = (beat - 302) % 4 === 0 ? "lower" : "upper";
    addHazard(hazards, beat, "mote", lane, { color: "violet" });
    autopilot.push({ beat: beat - 0.42, action: "press", reason: "final-orbit" });
  }
  for (let beat = 265; beat < 312; beat += 2.3) {
    addMemory(decor, beat, { kind: "supernova", y: 250 + (beat % 4) * 65, scale: 1.8 });
  }
  [269, 283, 295, 307].forEach((beat, index) => addCollectible(collectibles, beat, index % 2 ? 300 : 420, "ember"));

  addSurface(surfaces, 312, 320, FLOOR_Y, { theme: "dawn" });
  addSurface(surfaces, 312, 320, CEILING_Y, { ceiling: true, theme: "dawn" });
  [313, 314, 315, 316].forEach((beat) => addMemory(decor, beat, { kind: "dawn", y: 330, scale: 2.2 }));

  hazards.sort((a, b) => a.x - b.x);
  collectibles.sort((a, b) => a.x - b.x);
  decor.sort((a, b) => a.x - b.x);
  autopilot.sort((a, b) => a.beat - b.beat);
  return { surfaces, hazards, collectibles, decor, autopilot, finishBeat: FINISH_BEAT, sections: SECTIONS, checkpoints: CHECKPOINTS };
}

export const LEVEL = buildAuthoredContent();

export function getSectionAtBeat(beat) {
  return SECTIONS.find((section) => beat >= section.startBeat && beat < section.endBeat) ?? SECTIONS.at(-1);
}

export function getModeAtBeat(beat) {
  if (beat < 24) return "intro";
  if (beat < 80) return "bloom";
  if (beat < 144) return "fracture";
  if (beat < 208) return "drift";
  if (beat < 264) return "orbit";
  if (beat < 312) return ["bloom", "fracture", "drift", "orbit"][Math.floor((beat - 264) / 12)] ?? "bloom";
  return "outro";
}

export function getModeWindow(beat) {
  if (beat < 24) return { mode: "intro", startBeat: 0, endBeat: 24 };
  if (beat < 80) return { mode: "bloom", startBeat: 24, endBeat: 80 };
  if (beat < 144) return { mode: "fracture", startBeat: 80, endBeat: 144 };
  if (beat < 208) return { mode: "drift", startBeat: 144, endBeat: 208 };
  if (beat < 264) return { mode: "orbit", startBeat: 208, endBeat: 264 };
  if (beat < 312) {
    const phase = Math.floor((beat - 264) / 12);
    const mode = ["bloom", "fracture", "drift", "orbit"][phase] ?? "bloom";
    return { mode, startBeat: 264 + phase * 12, endBeat: 276 + phase * 12 };
  }
  return { mode: "outro", startBeat: 312, endBeat: 320 };
}

export function formatTimelineTime(beat) {
  const totalSeconds = beat * BEAT;
  return `${Math.floor(totalSeconds / 60)}:${Math.floor(totalSeconds % 60).toString().padStart(2, "0")}`;
}

export const LEVEL_METRICS = { bars: 80, durationBeats: 320, durationSeconds: 320 * BEAT, barSeconds: BAR, majorSections: SECTIONS.length };
