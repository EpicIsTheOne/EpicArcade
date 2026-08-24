// Unit tests for the ox-live multiplayer backend (server.mjs).
// Run: node --test tests/mp-server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mod from '../server.mjs';

// keep the SMP store out of the repo during tests
process.env.SMP_STORE = join(mkdtempSync(join(tmpdir(), 'lumen-mp-test-')), 'smp-world.json');

function fakeWs(id, query = {}) {
  return {
    id,
    query: new URLSearchParams(query),
    ip: '127.0.0.1',
    sent: [],
    closed: null,
    send(obj) { this.sent.push(obj); },
    close(code) { this.closed = code; },
  };
}

async function makeHandler() {
  const def = mod;
  assert.equal(typeof def.create, 'function', 'must default-export create()');
  const logs = [];
  const handler = await def.create({ log: (...a) => logs.push(a.join(' ')) });
  assert.equal(typeof handler.open, 'function');
  assert.equal(typeof handler.message, 'function');
  return { handler, logs };
}

const joinMsg = { op: 'join', room: 'TEST1', name: 'Alice' };

test('join returns welcome with seed and empty world', async () => {
  const { handler } = await makeHandler();
  const ws = fakeWs(1);
  handler.message(ws, { op: 'join', room: 'test1', name: 'Alice' });
  const w = ws.sent[0];
  assert.equal(w.op, 'welcome');
  assert.equal(w.room, 'TEST1');
  assert.equal(w.you, 1);
  assert.equal(w.players.length, 0);
  assert.deepEqual(w.edits, []);
  assert.equal(typeof w.seed, 'string');
  assert.ok(w.seed.length > 0);
});

test('second joiner sees first player and same seed', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, joinMsg);
  handler.message(b, { op: 'join', room: 'TEST1', name: 'Bob' });
  const wb = b.sent[0];
  assert.equal(wb.players.length, 1);
  assert.equal(wb.players[0][0], 1);
  assert.equal(wb.players[0][1], 'Alice');
  // a got a joined broadcast for bob
  const ja = a.sent.find((m) => m.op === 'joined');
  assert.equal(ja.id, 2);
  assert.equal(ja.name, 'Bob');
});

test('block ops are relayed to peers and recorded for late joiners', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, joinMsg);
  handler.message(b, { op: 'join', room: 'TEST1', name: 'Bob' });
  b.sent.length = 0;

  handler.message(a, { op: 'block', x: 10, y: 64, z: -3, b: 4, f: 2 });
  const blk = b.sent.find((m) => m.op === 'block');
  assert.deepEqual([blk.x, blk.y, blk.z, blk.b, blk.f], [10, 64, -3, 4, 2]);
  // sender must NOT receive its own block back
  assert.equal(a.sent.filter((m) => m.op === 'block').length, 0);

  // late joiner gets the edit log
  const c = fakeWs(3);
  handler.message(c, { op: 'join', room: 'TEST1', name: 'Cara' });
  const wc = c.sent[0];
  assert.deepEqual(wc.edits, [[10, 64, -3, 4, 2]]);
});

test('invalid block ops are rejected', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, joinMsg);
  handler.message(b, { op: 'join', room: 'TEST1', name: 'B' });
  b.sent.length = 0;
  for (const bad of [
    { op: 'block', x: 0.5, y: 64, z: 0, b: 1 },
    { op: 'block', x: 0, y: 999, z: 0, b: 1 },
    { op: 'block', x: 0, y: 64, z: 0, b: 9999 },
    { op: 'block', x: 1e9, y: 64, z: 0, b: 1 },
    { op: 'block' },
  ]) {
    handler.message(a, bad);
  }
  assert.equal(b.sent.filter((m) => m.op === 'block').length, 0);
});

test('messages before join are ignored (except the rejoin prompt)', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1);
  handler.message(a, { op: 'state', s: [1, 2, 3, 4, 5] });
  handler.message(a, { op: 'chat', text: 'hi' });
  assert.equal(a.sent.length, 1);
  assert.equal(a.sent[0].op, 'rejoin');
});

test('leave notifies peers and reclaims empty rooms', async () => {
  const { handler, logs } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, joinMsg);
  handler.message(b, { op: 'join', room: 'TEST1', name: 'Bob' });
  a.sent.length = 0;
  handler.close(b);
  const lv = a.sent.find((m) => m.op === 'left');
  assert.equal(lv.id, 2);
  handler.close(a);
  assert.ok(logs.some((l) => l.includes('reclaimed')));
  // new join after reclaim gets a fresh room (no stale edits)
  const c = fakeWs(3);
  handler.message(c, { op: 'join', room: 'TEST1', name: 'Cara' });
  assert.deepEqual(c.sent[0].edits, []);
});

test('tick batches states only to rooms with 2+ players', async () => {
  const { handler } = await makeHandler();
  const solo = fakeWs(1);
  handler.message(solo, { op: 'join', room: 'SOLO', name: 'S' });
  handler.message(solo, { op: 'state', s: [1, 60, 2, 0.5, 0.1] });
  solo.sent.length = 0;
  handler.tick();
  assert.equal(solo.sent.filter((m) => m.op === 'states').length, 0);

  const p2 = fakeWs(2);
  handler.message(p2, { op: 'join', room: 'SOLO', name: 'P2' });
  solo.sent.length = 0; p2.sent.length = 0;
  handler.tick();
  const bs = solo.sent.find((m) => m.op === 'states');
  assert.ok(bs, 'batch expected');
  assert.equal(bs.ps.length, 2);
  assert.deepEqual(p2.sent.find((m) => m.op === 'states').ps, bs.ps);
});

test('host seed is honored when creating a room', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1);
  handler.message(a, { op: 'join', room: 'SEEDY', name: 'A', seed: 'shimmering caves' });
  assert.equal(a.sent[0].seed, 'shimmering caves');
  const b = fakeWs(2);
  handler.message(b, { op: 'join', room: 'SEEDY', name: 'B', seed: 'other-seed-ignored' });
  assert.equal(b.sent[0].seed, 'shimmering caves');
});

test('names and chat text are sanitized', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, { op: 'join', room: 'CHAT1', name: '<img>x' + '\u0007bad' });
  handler.message(b, { op: 'join', room: 'CHAT1', name: 'B' });
  const wa = a.sent[0];
  assert.ok(!wa.players.some((p) => String(p[1]).includes('<')), 'angle brackets stripped');
  handler.message(b, { op: 'chat', text: '  hello   world  ' });
  const ch = a.sent.find((m) => m.op === 'chat');
  assert.equal(ch.text, 'hello world');
  // empty chat dropped, oversize chat truncated
  a.sent.length = 0;
  handler.message(b, { op: 'chat', text: '' });
  handler.message(b, { op: 'chat', text: 'x'.repeat(500) });
  const chats = a.sent.filter((m) => m.op === 'chat');
  assert.equal(chats.length, 1);
  assert.equal(chats[0].text.length, 120);
});

test('stop clears all state', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1);
  handler.message(a, joinMsg);
  handler.stop?.();
});

// ---- SMP world ----

function freshStore() {
  process.env.SMP_STORE = join(mkdtempSync(join(tmpdir(), 'lumen-mp-')), 'smp-world.json');
  return process.env.SMP_STORE;
}

test('SMP room has a fixed seed and persists edits across handlers', async () => {
  const store = freshStore();

  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'SMP', name: 'Ana' });
  const w1 = a.sent[0];
  assert.equal(w1.seed, 'site-smp');
  assert.equal(w1.smp, true);

  h1.message(a, { op: 'block', x: 100, y: 64, z: -50, b: 12, f: 0 });
  h1.stop?.(); // triggers save

  assert.ok(existsSync(store), 'store file written on stop');

  const h2 = (await makeHandler()).handler;
  const b = fakeWs(2);
  h2.message(b, { op: 'join', room: 'SMP', name: 'Ben' });
  const w2 = b.sent[0];
  assert.equal(w2.seed, 'site-smp');
  assert.deepEqual(w2.edits, [[100, 64, -50, 12, 0]]);
  h2.stop?.();
});

test('SMP join suggests spawning near an existing player', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1);
  handler.message(a, { op: 'join', room: 'SMP', name: 'Anchor' });
  handler.message(a, { op: 'state', s: [500.4, 70, -300.6, 0, 0] });
  const b = fakeWs(2);
  handler.message(b, { op: 'join', room: 'SMP', name: 'Newbie' });
  const wb = b.sent[0];
  assert.ok(Array.isArray(wb.spawnNear), 'spawnNear provided');
  assert.deepEqual(wb.spawnNear, [500, -301]); // rounded anchor x/z
  // private rooms never get spawnNear
  const c = fakeWs(3), d = fakeWs(4);
  handler.message(c, { op: 'join', room: 'PRIVY', name: 'C' });
  handler.message(d, { op: 'join', room: 'PRIVY', name: 'D' });
  assert.equal(d.sent[0].spawnNear, null);
});

test('SMP world is not reclaimed when empty; private rooms are', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const a = fakeWs(1);
  handler.message(a, { op: 'join', room: 'SMP', name: 'A' });
  handler.message(a, { op: 'block', x: 3, y: 60, z: 4, b: 1, f: 0 });
  handler.close(a);
  const b = fakeWs(2);
  handler.message(b, { op: 'join', room: 'SMP', name: 'B' });
  assert.deepEqual(b.sent[0].edits, [[3, 60, 4, 1, 0]], 'SMP edits survive empty period');
});

test('death notices are relayed as system chat', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, { op: 'join', room: 'SMP', name: 'A' });
  handler.message(b, { op: 'join', room: 'SMP', name: 'B' });
  a.sent.length = 0;
  handler.message(b, { op: 'died', c: 'lava' });
  const sys = a.sent.find((m) => m.op === 'sys');
  assert.equal(sys.text, 'B died (lava)');
});

test('unknown-socket ops trigger a rejoin prompt (hot reload recovery)', async () => {
  const { handler } = await makeHandler();
  const stale = fakeWs(7); // never joined this handler instance
  handler.message(stale, { op: 'state', s: [1, 60, 1, 0, 0] });
  const prompt = stale.sent.find((m) => m.op === 'rejoin');
  assert.ok(prompt, 'rejoin prompt sent');
  handler.message(stale, { op: 'block', x: 0, y: 60, z: 0, b: 1, f: 0 });
  assert.equal(stale.sent.filter((m) => m.op === 'rejoin').length, 1, 'prompt is rate-limited');
});

// ---- land claims (SMP only) ----
const TOTEM = 60;
const AIR = 0;

function smpPair(handler) {
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, { op: 'join', room: 'SMP', name: 'Alice' });
  handler.message(b, { op: 'join', room: 'SMP', name: 'Bob' });
  return { a, b };
}

test('placing a totem claims 3×3 chunks and broadcasts it', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  b.sent.length = 0;
  handler.message(a, { op: 'block', x: 40, y: 70, z: -8, b: TOTEM, f: 0 }); // chunk 2,-1
  const claim = b.sent.find((m) => m.op === 'claim');
  assert.ok(claim, 'claim broadcast');
  assert.equal(claim.owner, 'Alice');
  assert.equal(claim.cx, 2);
  assert.equal(claim.cz, -1);
  // totem edit itself is relayed like any block
  assert.ok(b.sent.some((m) => m.op === 'block' && m.b === TOTEM), 'totem block relayed');
});

test('non-owner edits inside a claim are denied with revert info', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'block', x: 40, y: 70, z: -8, b: TOTEM, f: 0 }); // Alice claims
  b.sent.length = 0;
  handler.message(b, { op: 'block', x: 45, y: 70, z: -10, b: 4, f: 0 });    // Bob builds nearby
  const deny = b.sent.find((m) => m.op === 'deny');
  assert.ok(deny, 'deny sent');
  assert.equal(deny.owner, 'Alice');
  assert.equal(deny.x, 45);
  // nothing relayed to Alice, nothing recorded
  assert.equal(a.sent.filter((m) => m.op === 'block' && m.x === 45).length, 0);
  // edge of the 3×3: chunks 1..3 × -2..0 are claimed; chunk 4 is free
  b.sent.length = 0; a.sent.length = 0;
  handler.message(b, { op: 'block', x: 70, y: 70, z: -8, b: 4, f: 0 });     // chunk 4,-1 → outside
  assert.ok(!b.sent.some((m) => m.op === 'deny'), 'no deny outside claim');
  assert.ok(a.sent.some((m) => m.op === 'block'), 'outside claim relays normally');
});

test('owner builds freely; totem is unbreakable by others; owner break unclaims', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'block', x: 40, y: 70, z: -8, b: TOTEM, f: 0 });

  // Bob denied on the totem itself
  handler.message(b, { op: 'block', x: 40, y: 70, z: -8, b: AIR, f: 0 });
  assert.ok(b.sent.some((m) => m.op === 'deny'), 'totem break denied for non-owner');

  // Alice builds + breaks freely
  handler.message(a, { op: 'block', x: 42, y: 71, z: -9, b: 4, f: 0 });
  assert.ok(a.sent.length === 0 || !a.sent.some((m) => m.op === 'deny'), 'owner not denied');

  // Alice breaks the totem → unclaim broadcast, Bob can now build there
  b.sent.length = 0;
  handler.message(a, { op: 'block', x: 40, y: 70, z: -8, b: AIR, f: 0 });
  const un = b.sent.find((m) => m.op === 'unclaim');
  assert.ok(un, 'unclaim broadcast');
  b.sent.length = 0; a.sent.length = 0;
  handler.message(b, { op: 'block', x: 45, y: 70, z: -10, b: 4, f: 0 });
  assert.ok(!b.sent.some((m) => m.op === 'deny'), 'no deny after unclaim');
  assert.ok(a.sent.some((m) => m.op === 'block'), 'Bob can build after unclaim');
});

test('claims reject overlap and enforce the 2-claim cap, with reasons', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'block', x: 40, y: 70, z: -8, b: TOTEM, f: 0 });   // Alice claim @ 2,-1

  // Bob's totem overlapping (chunk 3,-1 is inside Alice's 1..3 range) — totem
  // placements check overlap first and get the specific reason
  handler.message(b, { op: 'block', x: 50, y: 70, z: -8, b: TOTEM, f: 0 });
  let deny = b.sent.filter((m) => m.op === 'deny').pop();
  assert.ok(deny && deny.owner === 'Alice' && /overlap/i.test(deny.reason), 'overlap denied with reason');
  handler.message(b, { op: 'state', s: [51, 70, -8, 0, 0] }); // Bob stands just outside
  handler.message(b, { op: 'block', x: 64, y: 70, z: -8, b: TOTEM, f: 0 });   // chunk 4,-1 → adjacent, still overlaps range 3..5 × -2..0
  deny = b.sent.filter((m) => m.op === 'deny').pop();
  assert.ok(deny && /overlap/i.test(deny.reason), 'adjacent overlap denied with reason');

  // Alice claims two more spots (2nd ok, 3rd capped)
  handler.message(a, { op: 'block', x: -400, y: 70, z: 400, b: TOTEM, f: 0 }); // far away, chunk -25,25
  handler.message(a, { op: 'block', x: 800, y: 70, z: 800, b: TOTEM, f: 0 });  // chunk 50,50 → 3rd
  deny = a.sent.find((m) => m.op === 'deny' && m.reason);
  assert.ok(deny && /limit/.test(deny.reason), '3rd claim denied with reason');
});

test('claims persist across handlers', async () => {
  freshStore();
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'SMP', name: 'Alice' });
  h1.message(a, { op: 'block', x: 40, y: 70, z: -8, b: TOTEM, f: 0 });
  h1.stop?.();

  const h2 = (await makeHandler()).handler;
  const b = fakeWs(2);
  h2.message(b, { op: 'join', room: 'SMP', name: 'Bob' });
  const w = b.sent[0];
  assert.ok(w.claims.some((c) => c[0] === 2 && c[1] === -1 && c[2] === 'Alice'), 'claim in welcome');
  handler_message_block: {
    h2.message(b, { op: 'block', x: 45, y: 70, z: -10, b: 4, f: 0 });
    assert.ok(b.sent.some((m) => m.op === 'deny'), 'claim enforced after reload');
  }
  h2.stop?.();
});

test('private rooms have no claim logic', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const a = fakeWs(1), b = fakeWs(2);
  handler.message(a, { op: 'join', room: 'PRIV', name: 'A' });
  handler.message(b, { op: 'join', room: 'PRIV', name: 'B' });
  handler.message(a, { op: 'block', x: 40, y: 70, z: -8, b: TOTEM, f: 0 }); // just a block
  assert.ok(!a.sent.some((m) => m.op === 'claim'), 'no claim broadcast');
  assert.ok(b.sent.some((m) => m.op === 'block' && m.b === TOTEM), 'totem relays as a normal block');
});

// ---- name PINs ----

function freshPins() {
  process.env.PIN_STORE = join(mkdtempSync(join(tmpdir(), 'lumen-pin-')), 'pins.json');
  return process.env.PIN_STORE;
}

test('first join with a PIN registers it; the name becomes protected', async () => {
  freshStore(); freshPins();
  const store = process.env.PIN_STORE;
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter2' });
  assert.equal(a.sent[0].op, 'welcome');
  h1.stop?.();
  assert.ok(existsSync(store), 'pin store written');

  const h2 = (await makeHandler()).handler;
  const impostor = fakeWs(2);
  impostor.ip = 'evil';
  h2.message(impostor, { op: 'join', room: 'SMP', name: 'Steve' });
  assert.equal(impostor.sent[0].op, 'denied');
  assert.ok(/PIN-protected/.test(impostor.sent[0].reason));
  h2.stop?.();
});

test('correct PIN joins; wrong PIN denied; 5 failures close the socket', async () => {
  freshStore(); freshPins();
  const h = (await makeHandler()).handler;
  const a = fakeWs(1);
  h.message(a, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter2' });

  const b = fakeWs(2); b.ip = 'evil'; b.closed = null;
  for (let i = 0; i < 4; i++) {
    b.sent.length = 0;
    h.message(b, { op: 'join', room: 'SMP', name: 'Steve', pin: 'wrong' });
    assert.equal(b.sent[0].op, 'denied', `attempt ${i + 1} denied`);
    assert.equal(b.closed, null, 'not closed before 5');
  }
  h.message(b, { op: 'join', room: 'SMP', name: 'Steve', pin: 'wrong' });
  assert.equal(b.closed, 1008, 'socket closed after 5 failures');

  const c = fakeWs(3);
  h.message(c, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter2' });
  assert.equal(c.sent[0].op, 'welcome', 'correct PIN still joins');
  h.stop?.();
});

test('PINs persist across handlers and are per-name', async () => {
  freshStore(); freshPins();
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter2' });
  h1.stop?.();

  const h2 = (await makeHandler()).handler;
  const b = fakeWs(2);
  h2.message(b, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter2' });
  assert.equal(b.sent[0].op, 'welcome', 'same PIN after reload');
  const c = fakeWs(3);
  h2.message(c, { op: 'join', room: 'SMP', name: 'Alex', pin: 'hunter2' });
  assert.equal(c.sent[0].op, 'welcome', 'same PIN on a different name is fine');
  const d = fakeWs(4);
  h2.message(d, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter3' });
  assert.equal(d.sent[0].op, 'denied', 'wrong PIN on protected name');
  h2.stop?.();
});

test('unpin with correct PIN releases the name; wrong PIN is blocked', async () => {
  freshStore(); freshPins();
  const h = (await makeHandler()).handler;
  const a = fakeWs(1);
  h.message(a, { op: 'join', room: 'SMP', name: 'Steve', pin: 'hunter2' });
  h.stop?.();

  const h2 = (await makeHandler()).handler;
  // wrong PIN: denied + lockout counter shared with join failures
  const b = fakeWs(2); b.ip = 'evil'; b.closed = null;
  for (let i = 0; i < 4; i++) {
    h2.message(b, { op: 'unpin', name: 'Steve', pin: 'nope' });
    assert.equal(b.sent[i].op, 'denied');
  }
  h2.message(b, { op: 'unpin', name: 'Steve', pin: 'nope' });
  assert.equal(b.closed, 1008, '5 unpin failures close the socket');

  // correct PIN unlocks; name reverts to open
  const c = fakeWs(3);
  h2.message(c, { op: 'unpin', name: 'Steve', pin: 'hunter2' });
  assert.equal(c.sent[0].op, 'unpinned');
  assert.equal(c.sent[0].name, 'Steve');
  h2.stop?.();

  const h3 = (await makeHandler()).handler;
  const d = fakeWs(4);
  h3.message(d, { op: 'join', room: 'SMP', name: 'Steve' });
  assert.equal(d.sent[0].op, 'welcome', 'name is open again after unpin (persisted)');
  h3.stop?.();
});

test('unpin on a name without a PIN is denied; works without joining a room', async () => {
  freshStore(); freshPins();
  const h = (await makeHandler()).handler;
  const a = fakeWs(1);
  h.message(a, { op: 'unpin', name: 'Nobody', pin: 'whatever' });
  assert.equal(a.sent[0].op, 'denied');
  assert.ok(/no PIN/.test(a.sent[0].reason));
  h.stop?.();
});

test('short PINs are rejected with a reason; pinless names stay open', async () => {
  freshStore(); freshPins();
  const h = (await makeHandler()).handler;
  const a = fakeWs(1);
  h.message(a, { op: 'join', room: 'SMP', name: 'Steve', pin: 'abc' });
  assert.equal(a.sent[0].op, 'denied');
  assert.ok(/4 characters/.test(a.sent[0].reason));

  const b = fakeWs(2);
  h.message(b, { op: 'join', room: 'SMP', name: 'Pinless' });
  assert.equal(b.sent[0].op, 'welcome', 'no PIN = open name (backward compat)');

  const c = fakeWs(3);
  h.message(c, { op: 'join', room: 'SMP', name: 'Pinless', pin: 'abcd' });
  assert.equal(c.sent[0].op, 'welcome', 'can still be claimed later with a PIN');
  const d = fakeWs(4);
  h.message(d, { op: 'join', room: 'SMP', name: 'Pinless' });
  assert.equal(d.sent[0].op, 'denied', 'once claimed, PIN required');
  h.stop?.();
});
