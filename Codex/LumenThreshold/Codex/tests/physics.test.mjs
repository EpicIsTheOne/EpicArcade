import test from "node:test";
import assert from "node:assert/strict";
import { BEAT, FIXED_STEP, WORLD_SPEED } from "../src/constants.js";
import { LEVEL } from "../src/level.js";
import { Physics } from "../src/physics.js";

function advanceTo(physics, targetBeat, step = FIXED_STEP) {
  while (physics.beat() < targetBeat && physics.player?.action !== "dead") physics.update(step, physics.beat());
}

test("a deterministic full-run input trace completes the authored level", () => {
  const physics = new Physics();
  physics.reset(0);
  let actionIndex = 0;
  let completed = false;
  while (physics.beat() < 320 && physics.player.action !== "dead") {
    const beat = physics.beat();
    while (actionIndex < LEVEL.autopilot.length && LEVEL.autopilot[actionIndex].beat <= beat) {
      const action = LEVEL.autopilot[actionIndex++];
      if (action.action === "press") physics.press(action.beat, true);
      else physics.setHold(true);
    }
    const currentAction = LEVEL.autopilot[actionIndex - 1];
    if (currentAction?.action === "hold" && beat > (currentAction.endBeat ?? Infinity)) physics.setHold(false);
    if (currentAction?.action === "press" && beat > currentAction.beat + 0.25) physics.setHold(false);
    physics.update(FIXED_STEP, beat);
    if (physics.beat() >= 319.9) completed = true;
  }
  assert.equal(completed, true, `autopilot failed before the relay ending near beat ${physics.beat().toFixed(2)}`);
  assert.equal(physics.player.action, "press");
});

test("movement advances at a fixed authored world speed", () => {
  const physics = new Physics();
  physics.reset(0);
  const startX = physics.player.x;
  physics.update(1, 0);
  assert.ok(Math.abs(physics.player.x - startX - WORLD_SPEED) < 0.001);
  assert.ok(Math.abs(physics.beat() - 1 / BEAT) < 0.001);
});

test("drift hold creates sustained lift and release creates descent", () => {
  const physics = new Physics();
  physics.reset(146);
  physics.setHold(true);
  const startY = physics.player.y;
  advanceTo(physics, 148);
  assert.ok(physics.player.y < startY - 15);
  physics.setHold(false);
  const highY = physics.player.y;
  advanceTo(physics, 150);
  assert.ok(physics.player.y > highY);
});

test("progress is monotonic and capped at finish", () => {
  const physics = new Physics();
  physics.reset(0);
  let previous = -1;
  for (let beat = 0; beat < 316; beat += 3) {
    physics.player.x = beat * BEAT * WORLD_SPEED;
    physics.lastBeat = beat;
    const value = physics.progress();
    assert.ok(value >= previous);
    assert.ok(value <= 1);
    previous = value;
  }
});
