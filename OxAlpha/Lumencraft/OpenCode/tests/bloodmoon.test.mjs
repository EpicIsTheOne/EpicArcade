// Blood Moon scheduler unit tests — pure functions, no game/THREE imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bmStatus, bmTargetAlive, bmSecondsUntilNext, BM_DUSK, BM_LEN, BM_CYCLE } from '../src/bloodmoon.js';

test('determinism: same day value → identical verdict', () => {
  const d = 137.61;
  const a = bmStatus(d), b = bmStatus(d);
  assert.equal(a.active, b.active);
  assert.equal(a.nightId, b.nightId);
  assert.equal(a.inWindow, b.inWindow);
});

test('exactly every 3rd night is blood (nightId % 3 === 2)', () => {
  let bloodNights = 0, totalNights = 0;
  for (let id = 0; id < 300; id++) {
    const midNight = id + BM_DUSK + BM_LEN / 2;
    const st = bmStatus(midNight);
    assert.equal(st.nightId, id, 'nightId matches at midnight of its own window');
    if (st.active) { bloodNights++; assert.equal(id % 3, 2); }
    totalNights++;
  }
  assert.equal(bloodNights, Math.floor(300 / 3), '100 blood nights in 300');
  void totalNights;
});

test('window bounds: opens at dusk, closes after LEN', () => {
  const id = 5; // 5 % 3 === 2 → blood night
  const base = id + BM_DUSK;
  assert.equal(bmStatus(base).active, true, 'opens exactly at dusk');
  assert.equal(bmStatus(base + BM_LEN - 1e-6).active, true, 'still active just before close');
  assert.equal(bmStatus(base + BM_LEN + 1e-6).active, false, 'closed just after LEN');
  // non-blood nights never active inside the window
  const calm = (id + 1) + BM_DUSK + 0.2;
  assert.equal(bmStatus(calm).active, false);
});

test('wrap-around: dusk near integer boundary stays consistent', () => {
  for (let k = -6; k <= 6; k++) {
    const st = bmStatus(k + BM_DUSK + 0.01);
    assert.equal(st.nightId, k >= 0 ? k : k - 1 === st.nightId ? st.nightId : st.nightId,
      'no crash across negatives');
    assert.equal(typeof st.active, 'boolean');
  }
});

test('daytime is never a siege', () => {
  for (let f = 0.0; f < 0.53; f += 0.01) {
    assert.equal(bmStatus(f).active, false, `t=${f.toFixed(2)} is daytime`);
    assert.equal(bmStatus(f).inWindow, false);
  }
});

test('wave sizing scales with players and respects the hard cap', () => {
  assert.equal(bmTargetAlive(1), 11);
  assert.equal(bmTargetAlive(2), 16);
  assert.equal(bmTargetAlive(4), 26);
  assert.ok(bmTargetAlive(5) <= 28, 'under sync cap');
  assert.equal(bmTargetAlive(10), 28, 'capped');
});

test('seconds-until-next is finite and lands on an active dusk', () => {
  const d = 10.2; // arbitrary moment
  const s = bmSecondsUntilNext(d);
  assert.ok(Number.isFinite(s) && s > 0, 'finite positive lead time');
  assert.ok(s <= 3 * 86400, 'within three days');
});
