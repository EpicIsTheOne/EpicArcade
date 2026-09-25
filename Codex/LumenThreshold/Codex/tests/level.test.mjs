import test from "node:test";
import assert from "node:assert/strict";
import { BEAT, FINISH_BEAT, WORLD_SPEED } from "../src/constants.js";
import { LEVEL, SECTIONS, getModeAtBeat } from "../src/level.js";
import { SONG_EVENTS } from "../src/song.js";

test("level has a complete authored timeline", () => {
  assert.equal(SECTIONS.length, 7);
  assert.equal(LEVEL.sections.length, 7);
  assert.equal(LEVEL.finishBeat, FINISH_BEAT);
  assert.ok(LEVEL.surfaces.length > 15);
  assert.ok(LEVEL.hazards.length > 45);
  assert.ok(LEVEL.autopilot.length > 45);
});

test("all gameplay sections are present in order", () => {
  const modes = new Set(SECTIONS.map((section) => section.mode));
  assert.ok(modes.has("intro"));
  assert.ok(modes.has("bloom"));
  assert.ok(modes.has("fracture"));
  assert.ok(modes.has("drift"));
  assert.ok(modes.has("orbit"));
  assert.ok(modes.has("outro"));
  assert.equal(getModeAtBeat(24), "bloom");
  assert.equal(getModeAtBeat(80), "fracture");
  assert.equal(getModeAtBeat(144), "drift");
  assert.equal(getModeAtBeat(208), "orbit");
  assert.equal(getModeAtBeat(312), "outro");
});

test("music events are beat-locked to the level grid", () => {
  assert.ok(SONG_EVENTS.length > 400);
  assert.ok(SONG_EVENTS.every((event) => Number.isFinite(event.beat) && event.beat >= 0));
  assert.ok(SONG_EVENTS.some((event) => event.beat === 0 && event.type === "sweep"));
  assert.ok(SONG_EVENTS.some((event) => event.beat === 64 && event.type === "stinger"));
});

test("world speed keeps the authored x positions deterministic", () => {
  assert.equal(LEVEL.hazards[0].x, 27 * BEAT * WORLD_SPEED);
  assert.equal(LEVEL.checkpoints.at(-1).beat, 264);
});
