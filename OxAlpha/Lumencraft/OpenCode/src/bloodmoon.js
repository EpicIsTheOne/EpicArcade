// Blood Moon: co-op siege nights.
// The schedule is a PURE function of elapsed days, so every client that shares
// the server clock agrees on when sieges happen with zero protocol messages.
// Night window: t ∈ [DUSK, DUSK+LEN) wrapping midnight; every 3rd night is red
// (nightId % 3 === 2). Deep darkness in this build runs ~t 0.523→0.978.
// PURE module: no three.js / DOM imports — node-testable.

export const BM_DUSK = 0.54;
export const BM_LEN = 0.44;          // window closes at ~0.98, right at first light
export const BM_CYCLE = 3;           // every 3rd night
export const BM_PHASE = 2;           // which remainder is blood

const DAY_MS = 600000;               // matches net.DAY_MS / config DAY_LENGTH seconds

function mod3(n) {
  const r = n % BM_CYCLE;
  return r < 0 ? r + BM_CYCLE : r;
}

/** status of a moment given total elapsed days (float) */
export function bmStatus(d) {
  const u = (((d - BM_DUSK) % 1) + 1) % 1;   // 0 at each dusk → grows through the night
  const nightId = Math.floor(d - BM_DUSK);
  return {
    inWindow: u < BM_LEN,
    nightId,
    active: u < BM_LEN && mod3(nightId) === BM_PHASE,
    u,
  };
}

/** online clients: absolute clock shared by the room */
export function bmDaysOnline(nowMs, t0, clockOffset) {
  return (nowMs + clockOffset - t0) / DAY_MS;
}

/** seconds until the next blood-moon window opens (debug/QA) */
export function bmSecondsUntilNext(d) {
  // scan forward day by day for the next dusk whose nightId % 3 === BM_PHASE
  let days = d;
  for (let i = 0; i < BM_CYCLE * 2 + 2; i++) {
    // distance from now to the next dusk boundary
    const toDusk = ((BM_DUSK - ((days % 1) + 1) % 1) % 1 + 1) % 1 || 1e-9;
    const duskAt = days + Math.max(toDusk, 1e-9);
    const st = bmStatus(duskAt + 1e-6);
    if (st.active) return Math.max(0, (duskAt - d)) * DAY_MS / 1000;
    days = duskAt + 0.01;
  }
  return Infinity;
}

/** siege wave sizing: scales with online players, hard-capped under sync limits */
export function bmTargetAlive(playersOnline) {
  return Math.min(6 + 5 * playersOnline, 28);
}
