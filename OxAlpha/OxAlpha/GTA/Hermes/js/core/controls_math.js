// ============================================================
// NEON MERIDIAN — core/controls_math.js
// Pure control math shared by the game AND the node tests, so
// the verified math IS the shipped math. No THREE dependency.
//
// SINGLE CONVENTION (used everywhere in this project):
//   heading/yaw = 0            -> facing -Z
//   heading/yaw INCREASING     -> turning RIGHT (clockwise from above)
//   forward(heading)           -> ( sin h, -cos h )   on ground plane
//   right(heading)             -> ( cos h,  sin h )
//   pitch > 0                  -> looking UP
//   three.js mapping           -> obj.rotation.y = -heading (order 'YXZ',
//                                 camera.rotation.x = pitch)
// Mouse: dx>0 = moved RIGHT, dy>0 = moved DOWN (raw movementX/Y).
// Non-inverted defaults: dx>0 turns view RIGHT; dy>0 looks DOWN.
// ============================================================
'use strict';

// Self-contained so node tests can require() it without utils.js.
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

const ControlsMath = {
  /** Apply mouse look. Returns {yaw,pitch}. */
  applyLook(yaw, pitch, dx, dy, sens, invertX, invertY, minPitch, maxPitch) {
    const sx = invertX ? -1 : 1;
    const sy = invertY ? -1 : 1;
    // dx>0 (mouse right) must INCREASE yaw (turn right). dy>0 (mouse down)
    // must DECREASE pitch (look down). Inversion flags flip their axis only.
    return {
      yaw: yaw + dx * sens * sx,
      pitch: clamp(pitch - dy * sens * sy, minPitch, maxPitch),
    };
  },

  /** Ground basis vectors for a heading. */
  basis(heading) {
    const s = Math.sin(heading), c = Math.cos(heading);
    return { fwd: { x: s, z: -c }, right: { x: c, z: s } };
  },

  /** WASD -> normalized world-space XZ intent vector. */
  moveIntent(w, s, a, d, heading) {
    let x = 0, z = 0;
    if (w) { x += Math.sin(heading);  z += -Math.cos(heading); }
    if (s) { x -= Math.sin(heading);  z -= -Math.cos(heading); }
    if (a) { x -= Math.cos(heading);  z -= Math.sin(heading); }
    if (d) { x += Math.cos(heading);  z += Math.sin(heading); }
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z };
  },

  /** Full 3D aim direction from heading+pitch. */
  forward3(heading, pitch) {
    const cp = Math.cos(pitch);
    return { x: Math.sin(heading) * cp, y: Math.sin(pitch), z: -Math.cos(heading) * cp };
  },

  /** A => -1 (left), D => +1 (right), neutral 0. */
  steerInput(a, d) { return (d ? 1 : 0) - (a ? 1 : 0); },

  /**
   * Heading rate for bicycle-style steering, GAME convention:
   * positive return = heading increases = nose turns RIGHT.
   * speed < 0 (reversing) naturally swings the nose the opposite way.
   */
  vehicleYawRate(speed, steer, wheelbase) {
    return (speed / wheelbase) * Math.tan(steer * 0.5);
  },

  /** Max |steer| (normalized 0..1 scale) allowed at a given speed. */
  steerLimit(vAbs) { return clamp(1.05 - vAbs / 62, 0.18, 1.05); },
};

if (typeof module !== 'undefined') module.exports = { ControlsMath };
