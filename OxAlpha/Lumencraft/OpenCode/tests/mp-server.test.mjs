// Unit tests for the ox-live multiplayer backend (server.mjs).
// Run: node --test tests/mp-server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import mod from '../server.mjs';

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

test('messages before join are ignored', async () => {
  const { handler } = await makeHandler();
  const a = fakeWs(1);
  handler.message(a, { op: 'state', s: [1, 2, 3, 4, 5] });
  handler.message(a, { op: 'chat', text: 'hi' });
  assert.equal(a.sent.length, 0);
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
