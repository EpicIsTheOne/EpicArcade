// Central tuning constants & game data.
export const TUNE = {
  gravity: 32,
  runMax: 27,
  runAccel: 40,
  friction: 5.5,
  brake: 55,
  turnRateLow: 3.6,     // rad/s at standstill
  turnRateHigh: 1.05,   // rad/s at top speed
  driftTurnMul: 2.7,
  driftDecel: 9,
  slopeAccel: 0.85,      // fraction of gravity projected along slope
  boostMax: 48,
  boostAccel: 70,
  boostDrain: 26,        // per second
  jumpVel: 13.4,
  jumpHoldTime: 0.22,
  jumpHoldGravMul: 0.42,
  coyote: 0.10,
  jumpBuffer: 0.14,
  airAccel: 22,
  airMaxGain: 27,        // air control cannot exceed this unless already faster
  fastFall: 34,
  chainDashSpeed: 58,
  chainDashRadius: 30,
  stompSpeed: 78,
  quickStepSpeed: 17,
  quickStepCooldown: 0.28,
  wallRunMinSpeed: 12,
  wallRunTime: 1.5,
  wallJumpUp: 15.5,
  wallJumpOut: 11.5,
  railSlope: 0.8,
  railCrouchAccel: 30,
  railCrouchMax: 62,
  springDefault: 36,
  panelPower: 44,
  panelMinTime: 1.25,
  spinRadius: 3.4,
  spinHop: 7.5,
  playerR: 0.55,
  physicsHz: 240,
};

export const LEVELS = [
  {
    id: 'coast', name: 'Sunspire Coast', sub: 'Emerald shoals & ancient arcs',
    theme: 'coast', par: 115, unlockAt: null,
    swatch: 'linear-gradient(180deg,#39c8f0 0%,#7fe3d2 45%,#e8cf8a 100%)',
  },
  {
    id: 'city', name: 'Neon Vortex', sub: 'Midnight skyline run',
    theme: 'city', par: 150, unlockAt: 'coast',
    swatch: 'linear-gradient(180deg,#120b2e 0%,#3c1470 55%,#ff2fb4 130%)',
  },
  {
    id: 'foundry', name: 'Ember Foundry', sub: 'Molten works below',
    theme: 'foundry', par: 165, unlockAt: 'city',
    swatch: 'linear-gradient(180deg,#2a0f14 0%,#7a2410 60%,#ff7a1a 125%)',
  },
];

// Rank thresholds on final score.
export function rankFor(score) {
  if (score >= 5200) return 'S';
  if (score >= 4200) return 'A';
  if (score >= 3300) return 'B';
  if (score >= 2300) return 'C';
  return 'D';
}
