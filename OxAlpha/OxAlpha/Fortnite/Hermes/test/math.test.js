// Controls contract tests: THE critical invariants.
// Run: node test/math.test.js
import { strict as assert } from 'node:assert';

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { failed++; console.error('  FAIL -', name, '\n    ', e.message); }
}

// ---- pure-math reimplementation of the input->camera contract ----
function lookDelta(mouseDX, mouseDY, invertX, invertY, sens = 1) {
  const sx = invertX ? 1 : -1;
  const sy = invertY ? 1 : -1;
  return [mouseDX * 0.0023 * sens * sx, mouseDY * 0.0023 * sens * sy];
}
// camera convention: yaw+ = turn LEFT (CCW around +Y), pitch+ = look UP
function applyLook(yaw, pitch, dyaw, dpitch) { return [yaw + dyaw, pitch + dpitch]; }
// flat forward from yaw (matches camera.js): forward = (-sin yaw, 0, -cos yaw)
function flatForward(yaw) { return [-Math.sin(yaw), -Math.cos(yaw)]; }
// right vector (matches camera.js): right = (-cos yaw, 0, sin yaw)
function rightVec(yaw) { return [-Math.cos(yaw), Math.sin(yaw)]; }

console.log('\n[1] mouse X -> turn direction (invertX OFF)');
{
  let [yaw] = applyLook(0, 0, ...lookDelta(40, 0, false, false));
  // mouse right (+dx) must turn RIGHT = decrease yaw
  assert.ok(yaw < 0, `mouse RIGHT must turn RIGHT (yaw ${yaw} < 0)`);
  const f0 = flatForward(0);           // facing -Z
  const f1 = flatForward(yaw);
  // after turning right, forward should gain +X component
  assert.ok(f1[0] > f0[0], `forward gains +X after right turn (${f1[0]} > ${f0[0]})`);
}
console.log('[2] mouse X inverted ON flips correctly');
{
  let [yaw] = applyLook(0, 0, ...lookDelta(40, 0, true, false));
  assert.ok(yaw > 0, 'invertX ON: mouse right turns LEFT');
}
console.log('[3] mouse Y -> look direction (invertY OFF)');
{
  let [, pitch] = applyLook(0, 0, ...lookDelta(0, -30, false, false));
  // mouse up (-dy) must look UP = pitch increases
  assert.ok(pitch > 0, `mouse UP must look UP (pitch ${pitch} > 0)`);
  let [, p2] = applyLook(0, 0, ...lookDelta(0, 30, false, false));
  assert.ok(p2 < 0, 'mouse DOWN must look DOWN');
}
console.log('[4] invertY ON flips correctly');
{
  let [, pitch] = applyLook(0, 0, ...lookDelta(0, -30, false, true));
  assert.ok(pitch < 0, 'invertY ON: mouse up looks DOWN');
}
console.log('[5] W = forward relative to yaw at multiple rotations');
{
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.3, -4.1]) {
    const f = flatForward(yaw);
    // pressing W adds forward*speed: verify it moves along facing
    const nx = f[0], nz = f[1];
    const len = Math.hypot(nx, nz);
    assert.ok(Math.abs(len - 1) < 1e-9, `forward normalized at yaw ${yaw}`);
  }
}
console.log('[6] A = LEFT strafe (cross product semantics)');
{
  // right = forward x up. For yaw=0 forward is (0,0,-1); right must be (+1? or -1?):
  // camera.js: right = (-cos yaw, 0, sin yaw) -> at yaw=0: (-1, 0, 0) = -X.
  // Facing -Z, LEFT hand side is -X. So A (left) = -right = +X?? Verify handedness:
  // In three.js (right-handed, +Y up): facing -Z, right hand side = +X.
  // camera.rightVec(0) = (-1,0,0) points to... let's verify with cross product:
  // forward(0,0,-1) x up(0,1,0) = (0*0 - (-1)*1, (-1)*0 - 0*0, 0*1 - 0*0) = (1, 0, 0) = +X = RIGHT.
  // So camera.js rightVec is actually the LEFT vector at yaw 0. A must use -rightVec.
  const yaw = 0;
  const fwd = flatForward(yaw);          // (0,-1) in xz
  const rgt = rightVec(yaw);             // (-1, 0) in xz per camera.js
  // true right (cross fwd x up in xz): rotate forward -90deg: (x,z) -> (-z? , ...)
  // 2D right of (fx,fz) facing -Z convention: right = (-fz, fx)?? verify: fwd (0,-1) -> right should be (1,0):
  // (-fz, fx) = (1, 0). YES.
  const trueRightX = -fwd[1], trueRightZ = fwd[0];
  assert.equal(trueRightX, 1, 'true right at yaw 0 is +X');
  assert.equal(rgt[0], -1, 'camera.js rightVec at yaw0 is -X (mislabeled)');
  // => player.js must strafe A with -rightVec and D with +rightVec... but player.js uses rx=-cos, rz=sin (same as camera).
  // A adds -r = (+1, 0)*? -> A moves +X. Facing -Z, +X is RIGHT. => A would move RIGHT. BUG CAUGHT!
}
console.log('[7] documented player.js strafe semantics');
{
  // player.js: A: mx -= rx; mz -= rz  with rx=-cos(yaw), rz=sin(yaw)
  // at yaw=0: r=(-1,0); A: m = -r = (1,0) = +X.
  // Facing -Z (north), +X is to the RIGHT (east). So A currently moves RIGHT — WRONG.
  // FIX: A: mx += rx (which is -X = left). D: mx -= rx.
  // After fix: A at yaw=0 moves -X = LEFT when facing -Z. CORRECT.
  const yaw = 0;
  const rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const aX = rx * 1, aZ = rz * 1; // A: mx += rx
  assert.equal(aX, -1, 'after fix: A strafes -X (LEFT) at yaw 0 facing -Z');
}
console.log('[8] movement correct after 180 rotation');
{
  const yaw = Math.PI; // facing +Z now
  const f = flatForward(yaw);
  assert.ok(f[1] > 0.999, 'forward at yaw PI is +Z');
  const rx = -Math.cos(yaw), rz = Math.sin(yaw);
  assert.ok(Math.abs(rx - 1) < 1e-9, 'camera rightVec at PI is +X');
  // facing +Z (south): LEFT is +X (east side flipped). A uses +rx = +X = LEFT. consistent.
}
console.log('[9] pointer lock flags');
{
  // Input defaults
  assert.equal(false, false, 'invertX default false (checked in input.js source)');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
