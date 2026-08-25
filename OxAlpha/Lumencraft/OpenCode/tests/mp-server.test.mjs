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

// ---- shared chests ----

test('chest ops are relayed to peers and stored for late joiners', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  b.sent.length = 0;
  const slots = [[0, 4, 10], [5, 'iron_ingot', 3, 20]];
  handler.message(a, { op: 'chest', x: 12, y: 65, z: 34, slots });
  const relay = b.sent.find((m) => m.op === 'chest');
  assert.ok(relay, 'relay sent');
  assert.deepEqual(relay.slots, slots);
  assert.equal(a.sent.filter((m) => m.op === 'chest').length, 0, 'sender gets no echo');

  const c = fakeWs(3);
  handler.message(c, { op: 'join', room: 'SMP', name: 'Late' });
  const wc = c.sent[0];
  assert.ok(Array.isArray(wc.containers), 'containers in welcome');
  assert.deepEqual(wc.containers, [[12, 65, 34, slots]]);
});

test('chest contents persist across handlers (SMP)', async () => {
  freshStore();
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'SMP', name: 'A' });
  h1.message(a, { op: 'chest', x: 1, y: 60, z: 2, slots: [[3, 'diamond', 5]] });
  h1.stop?.();

  const h2 = (await makeHandler()).handler;
  const b = fakeWs(2);
  h2.message(b, { op: 'join', room: 'SMP', name: 'B' });
  assert.deepEqual(b.sent[0].containers, [[1, 60, 2, [[3, 'diamond', 5]]]]);
  h2.stop?.();
});

test('breaking a chest clears its synced contents', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'chest', x: 7, y: 60, z: 7, slots: [[0, 1, 1]] });
  handler.message(a, { op: 'block', x: 7, y: 60, z: 7, b: AIR, f: 0 });
  const c = fakeWs(3);
  handler.message(c, { op: 'join', room: 'SMP', name: 'C' });
  assert.deepEqual(c.sent[0].containers, [], 'container gone after chest break');
});

test('malformed chest ops are rejected', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  b.sent.length = 0;
  for (const bad of [
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[27, 1, 1]] },          // idx out of range
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[-1, 1, 1]] },          // negative idx
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[0, 999, 1]] },         // bad block id
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[0, 'bad id!', 1]] },   // bad item id
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[0, 1, 0]] },           // count < 1
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[0, 1, 65]] },          // count > 64
    { op: 'chest', x: 1, y: 60, z: 1, slots: [[0, 1, 1, -5]] },       // bad dur
    { op: 'chest', x: 1, y: 60, z: 1, slots: new Array(28).fill([0, 1, 1]) }, // too many
    { op: 'chest', x: 1, y: 60, z: 1 },                                // no slots
    { op: 'chest', x: 1, y: 999, z: 1, slots: [] },                    // bad y
  ]) {
    handler.message(a, bad);
  }
  assert.equal(b.sent.filter((m) => m.op === 'chest').length, 0, 'no relays for malformed ops');
});

test('container cap: new chests rejected past the limit, existing still updatable', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  for (let i = 0; i < 5; i++) {
    handler.message(a, { op: 'chest', x: 100 + i, y: 60, z: 100, slots: [[0, 1, 1]] });
  }
  // shrink the cap by flooding a tiny-room variant is not testable here; use
  // the SMP limit directly via a room with MAX_CONTAINERS — instead verify
  // updates to existing keys still work and new keys beyond cap are denied by
  // monkey-testing the documented limit through repeated ops on distinct keys.
  // (MAX_CONTAINERS is 300 in prod; here we just prove the deny path exists by
  // filling a room to its limit with distinct keys.)
  const limit = 300;
  for (let i = 5; i < limit; i++) {
    handler.message(a, { op: 'chest', x: 100 + i, y: 60, z: 100, slots: [[0, 1, 1]] });
  }
  a.sent.length = 0;
  handler.message(a, { op: 'chest', x: 999, y: 60, z: 100, slots: [[0, 1, 1]] });
  const deny = a.sent.find((m) => m.op === 'deny' && /container sync limit/.test(m.reason || ''));
  assert.ok(deny, 'deny past cap');
  a.sent.length = 0;
  handler.message(a, { op: 'chest', x: 100, y: 60, z: 100, slots: [[0, 2, 2]] }); // existing key
  assert.ok(!a.sent.some((m) => m.op === 'deny'), 'existing chest still updatable');
});

test('private rooms sync chests but do not persist them', async () => {
  freshStore();
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'PRIVC', name: 'A' });
  h1.message(a, { op: 'chest', x: 5, y: 60, z: 5, slots: [[0, 'bread', 2]] });
  const b = fakeWs(2);
  h1.message(b, { op: 'join', room: 'PRIVC', name: 'B' });
  assert.deepEqual(b.sent[0].containers, [[5, 60, 5, [[0, 'bread', 2]]]], 'synced within room');
  h1.stop?.();

  const h2 = (await makeHandler()).handler;
  const c = fakeWs(3);
  h2.message(c, { op: 'join', room: 'PRIVC', name: 'C' });
  assert.deepEqual(c.sent[0].containers, [], 'not persisted for private rooms');
  h2.stop?.();
});

// ---- map observers ----

function mapViewer(handler, id) {
  const ws = fakeWs(id);
  handler.message(ws, { op: 'join', room: 'SMP', name: 'map', map: true });
  return ws;
}

test('observer joins invisibly: no joined broadcast, not in playerList', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const player = fakeWs(1);
  handler.message(player, { op: 'join', room: 'SMP', name: 'Alice' });
  player.sent.length = 0;

  const obs = mapViewer(handler, 2);
  assert.equal(obs.sent[0].op, 'welcome');
  assert.deepEqual(obs.sent[0].players.map((p) => p[1]), ['Alice'], 'observer sees players');

  // Alice must NOT hear about the observer
  assert.equal(player.sent.filter((m) => m.op === 'joined').length, 0, 'no joined broadcast for observer');
  // a new player's welcome must not include the observer
  const c = fakeWs(3);
  handler.message(c, { op: 'join', room: 'SMP', name: 'Bob' });
  assert.ok(!c.sent[0].players.some((p) => p[1] === '[map]'), 'observer not in player lists');
});

test('observers are read-only: gameplay ops dropped, no spawn-anchor role', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a } = smpPair(handler);
  a.sent.length = 0;
  const obs = mapViewer(handler, 5);

  handler.message(obs, { op: 'state', s: [50, 70, 50, 0, 0] });
  handler.message(obs, { op: 'block', x: 50, y: 70, z: 50, b: 4, f: 0 });
  handler.message(obs, { op: 'chat', text: 'lurking' });
  assert.equal(a.sent.filter((m) => m.op === 'block' || m.op === 'chat').length, 0, 'nothing relayed');
  // no edit recorded
  const late = fakeWs(6);
  handler.message(late, { op: 'join', room: 'SMP', name: 'Late' });
  assert.deepEqual(late.sent[0].edits, [], 'observer edits not stored');
  // observer position never suggested as spawn
  const d = fakeWs(7);
  handler.message(d, { op: 'join', room: 'SMP', name: 'D' });
  assert.equal(d.sent[0].spawnNear, null, 'observer not a spawn anchor');
});

test('observers do not consume player slots', async () => {
  freshStore();
  const { handler } = await makeHandler();
  mapViewer(handler, 90);
  mapViewer(handler, 91);
  // SMP cap is 32 players; observers must not reduce that. Can't place 32
  // players cheaply — instead verify cap counts only players by joining a
  // private room (cap 15) with 15 players + observer still allowed.
  const h = handler;
  const obs = fakeWs(50);
  h.message(obs, { op: 'join', room: 'CAP', name: 'map', map: true });
  assert.equal(obs.sent[0].op, 'welcome');
  for (let i = 0; i < 15; i++) {
    const p = fakeWs(60 + i);
    h.message(p, { op: 'join', room: 'CAP', name: 'P' + i });
    assert.equal(p.sent[0].op, 'welcome', `player ${i} joins despite observer`);
  }
  const over = fakeWs(99);
  h.message(over, { op: 'join', room: 'CAP', name: 'over' });
  assert.equal(over.sent[0].op, 'denied', 'player cap still enforced');
});

test('mapdata returns edits, claims and containers', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a } = smpPair(handler);
  handler.message(a, { op: 'block', x: 33, y: 64, z: 44, b: 4, f: 0 });
  handler.message(a, { op: 'chest', x: 33, y: 65, z: 44, slots: [[0, 'bread', 1]] });
  const obs = mapViewer(handler, 9);
  obs.sent.length = 0;
  handler.message(obs, { op: 'mapdata' });
  const md = obs.sent.find((m) => m.op === 'mapdata');
  assert.ok(md, 'mapdata reply');
  assert.equal(md.seed, 'site-smp');
  assert.ok(md.edits.some((e) => e[0] === 33 && e[1] === 64 && e[2] === 44 && e[3] === 4), 'edits present');
  assert.ok(md.containers.some((c) => c[0] === 33 && c[1] === 65 && c[2] === 44), 'containers present');
  assert.ok(Array.isArray(md.claims), 'claims array present');
  assert.ok(md.players.some((p) => p[1] === 'Alice'), 'players present');
});

test('observer states are excluded from tick batches', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a } = smpPair(handler);
  const obs = mapViewer(handler, 9);
  obs.sent.length = 0;
  handler.message(a, { op: 'state', s: [1, 60, 1, 0, 0] });
  handler.tick();
  const batch = obs.sent.find((m) => m.op === 'states');
  assert.ok(batch, 'observer receives states');
  assert.ok(batch.ps.every((p) => p[1] !== -100), 'observer placeholder not in batch');
});

// ---- in-world signs ----
const SIGN_BLOCK = 61;

test('sign text is stored, relayed to all (incl. sender), and sent to late joiners', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'block', x: 20, y: 65, z: 20, b: SIGN_BLOCK, f: 0 });
  a.sent.length = 0; b.sent.length = 0;
  handler.message(a, { op: 'sign', x: 20, y: 65, z: 20, text: 'home sweet home' });
  const relay = b.sent.find((m) => m.op === 'sign');
  assert.ok(relay, 'relay to B');
  assert.equal(relay.owner, 'Alice');
  const selfEcho = a.sent.find((m) => m.op === 'sign');
  assert.ok(selfEcho, 'sender also receives (sprite dedupe)');
  const late = fakeWs(9);
  handler.message(late, { op: 'join', room: 'SMP', name: 'Late' });
  assert.ok(late.sent[0].signs.some((s) => s[4] === 'home sweet home'), 'welcome signs');
});

test('only the author (or claim owner) can edit a sign', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'block', x: 21, y: 65, z: 20, b: SIGN_BLOCK, f: 0 });
  handler.message(a, { op: 'sign', x: 21, y: 65, z: 20, text: 'alice was here' });
  handler.message(b, { op: 'sign', x: 21, y: 65, z: 20, text: 'bob was here' });
  const deny = b.sent.find((m) => m.op === 'deny' && /not your sign/.test(m.reason || ''));
  assert.ok(deny, 'non-author edit denied');
  const late = fakeWs(9);
  handler.message(late, { op: 'join', room: 'SMP', name: 'Late' });
  assert.ok(late.sent[0].signs.some((s) => s[4] === 'alice was here'), 'text unchanged');
});

test('claim owner can edit a sign inside their claim even if not the author', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  const freeX = 400, freeZ = 400;
  handler.message(b, { op: 'block', x: freeX, y: 65, z: freeZ, b: SIGN_BLOCK, f: 0 });
  handler.message(b, { op: 'sign', x: freeX, y: 65, z: freeZ, text: 'bob note' });
  handler.message(a, { op: 'block', x: freeX + 3, y: 70, z: freeZ + 3, b: TOTEM, f: 0 }); // claim (25,25) covers 400-415
  handler.message(a, { op: 'sign', x: freeX, y: 65, z: freeZ, text: 'alice edited (claim owner)' });
  const ownerEdit = b.sent.filter((m) => m.op === 'sign' && m.x === freeX).pop();
  assert.equal(ownerEdit.text, 'alice edited (claim owner)', 'claim owner edit accepted');
  assert.equal(ownerEdit.owner, 'Bob', 'original author preserved');
});

test('breaking a sign: author can, non-author denied, entry cleared', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'block', x: 22, y: 65, z: 20, b: SIGN_BLOCK, f: 0 });
  handler.message(a, { op: 'sign', x: 22, y: 65, z: 20, text: 'do not touch' });
  handler.message(b, { op: 'block', x: 22, y: 65, z: 20, b: AIR, f: 0 });
  assert.ok(b.sent.some((m) => m.op === 'deny' && /not your sign/.test(m.reason || '')), 'non-author break denied');
  handler.message(a, { op: 'block', x: 22, y: 65, z: 20, b: AIR, f: 0 });
  const late = fakeWs(9);
  handler.message(late, { op: 'join', room: 'SMP', name: 'Late' });
  assert.ok(!late.sent[0].signs.some((s) => s[0] === 22), 'sign entry cleared');
});

test('sign text is sanitized; new signs require the sign block; cap enforced', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a, b } = smpPair(handler);
  handler.message(a, { op: 'sign', x: 30, y: 65, z: 30, text: 'ghost sign' });
  assert.ok(a.sent.some((m) => m.op === 'deny' && /no sign block/.test(m.reason || '')), 'block evidence required');
  for (let i = 0; i < 3; i++) {
    handler.message(a, { op: 'block', x: 30 + i, y: 65, z: 30, b: SIGN_BLOCK, f: 0 });
  }
  handler.message(a, { op: 'sign', x: 30, y: 65, z: 30, text: '  hi   there  ' + 'x'.repeat(120) });
  const late = fakeWs(9);
  handler.message(late, { op: 'join', room: 'SMP', name: 'Late' });
  const stored = late.sent[0].signs.find((s) => s[0] === 30);
  assert.ok(stored && stored[4].startsWith('hi there'), 'sanitized');
  assert.ok(stored[4].length <= 100, 'length capped');
  // cap: fill to 200 signs — rotate peers so the 40-blocks/sec rate limiter
  // (per peer) never kicks in mid-fill
  const crew = [a, b];
  for (let i = 2; i < 8; i++) {
    const p = fakeWs(40 + i);
    handler.message(p, { op: 'join', room: 'SMP', name: 'P' + i });
    crew.push(p);
  }
  let placed = 0;
  for (const p of crew) {
    for (let j = 0; j < 40 && placed < 210; j++) {
      const x = 200 + placed, y = 65, z = 200;
      handler.message(p, { op: 'block', x, y, z, b: SIGN_BLOCK, f: 0 });
      handler.message(a, { op: 'sign', x, y, z, text: 's' + placed });
      placed++;
    }
  }
  assert.ok(placed >= 210, 'filled past cap');
  a.sent.length = 0;
  const fresh = fakeWs(99);
  handler.message(fresh, { op: 'join', room: 'SMP', name: 'Fresh' });
  handler.message(fresh, { op: 'block', x: 500, y: 65, z: 500, b: SIGN_BLOCK, f: 0 });
  handler.message(a, { op: 'sign', x: 500, y: 65, z: 500, text: 'over cap' });
  assert.ok(a.sent.some((m) => m.op === 'deny' && /sign limit/.test(m.reason || '')), 'cap enforced');
});

test('private rooms sync signs but do not persist them', async () => {
  freshStore();
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'PRIVS', name: 'A' });
  h1.message(a, { op: 'block', x: 5, y: 60, z: 5, b: SIGN_BLOCK, f: 0 });
  h1.message(a, { op: 'sign', x: 5, y: 60, z: 5, text: 'temp note' });
  const b = fakeWs(2);
  h1.message(b, { op: 'join', room: 'PRIVS', name: 'B' });
  assert.deepEqual(b.sent[0].signs, [[5, 60, 5, 'A', 'temp note']], 'synced within room');
  h1.stop?.();

  const h2 = (await makeHandler()).handler;
  const c = fakeWs(3);
  h2.message(c, { op: 'join', room: 'PRIVS', name: 'C' });
  assert.deepEqual(c.sent[0].signs, [], 'not persisted for private rooms');
  h2.stop?.();
});

test('signs persist across handlers (SMP)', async () => {
  freshStore();
  const h1 = (await makeHandler()).handler;
  const a = fakeWs(1);
  h1.message(a, { op: 'join', room: 'SMP', name: 'A' });
  h1.message(a, { op: 'block', x: 44, y: 65, z: 55, b: SIGN_BLOCK, f: 0 });
  h1.message(a, { op: 'sign', x: 44, y: 65, z: 55, text: 'permanent marker' });
  h1.stop?.();

  const h2 = (await makeHandler()).handler;
  const b = fakeWs(2);
  h2.message(b, { op: 'join', room: 'SMP', name: 'B' });
  assert.deepEqual(b.sent[0].signs, [[44, 65, 55, 'A', 'permanent marker']]);
  h2.stop?.();
});

test('signs are included in mapdata', async () => {
  freshStore();
  const { handler } = await makeHandler();
  const { a } = smpPair(handler);
  handler.message(a, { op: 'block', x: 60, y: 65, z: 60, b: SIGN_BLOCK, f: 0 });
  handler.message(a, { op: 'sign', x: 60, y: 65, z: 60, text: 'map me' });
  const obs = mapViewer(handler, 9);
  obs.sent.length = 0;
  handler.message(obs, { op: 'mapdata' });
  const md = obs.sent.find((m) => m.op === 'mapdata');
  assert.ok(md.signs.some((s) => s[0] === 60 && s[4] === 'map me'), 'signs in mapdata');
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
