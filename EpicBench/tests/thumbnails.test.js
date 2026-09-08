'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createThumbnails, decodeUpload } = require('../community-thumbnails');
const { publicAddress, pinnedGet } = require('../community-preview');

test('preview transport refuses private, metadata, mixed DNS and non-web destinations before connecting', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(publicAddress(address), false, address);
  assert(publicAddress('93.184.216.34'));
  await assert.rejects(pinnedGet('https://example.com', async () => [{ address: '127.0.0.1' }]));
  await assert.rejects(pinnedGet('https://example.com', async () => [{ address: '93.184.216.34' }, { address: '10.0.0.1' }]));
  await assert.rejects(pinnedGet('file:///etc/passwd'));
  await assert.rejects(pinnedGet('http://example.com:22'));
  await assert.rejects(pinnedGet('https://user:secret@example.com'));
});
test('cached previews follow URL changes; uploads persist; late captures cannot overwrite an upload', async t => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON; CREATE TABLE projects(id TEXT PRIMARY KEY,url TEXT,thumbnail_url TEXT)');
  const p = { id: 'one', url: 'https://example.com', thumbnail_url: null, updated_at: 'now' };
  db.prepare('INSERT INTO projects VALUES(?,?,?)').run(p.id, p.url, null);
  let calls = 0, release;
  const store = createThumbnails(db, { renderer: { render: async () => { calls++; return Buffer.from('first-screen'); }, close() {} } });
  t.after(() => { store.close(); db.close(); });
  assert.equal((await store.image(p)).toString(), 'first-screen'); await store.image(p); assert.equal(calls, 1);
  p.url += '/new'; db.prepare('UPDATE projects SET url=?').run(p.url); await store.image(p); assert.equal(calls, 2);
  const upload = decodeUpload('data:image/jpeg;base64,/9j/2Q=='); store.update(p, upload);
  assert.equal(store.info(p).thumbnailSource, 'upload'); assert.deepEqual(Buffer.from(await store.image(p)), upload);
  p.url += '/again'; db.prepare('UPDATE projects SET url=?').run(p.url); await store.image(p); assert.equal(calls, 2);
  store.update(p, null);
  const delayed = createThumbnails(db, { renderer: { render: () => new Promise(resolve => { release = resolve; }), close() {} } });
  const capture = delayed.image(p); delayed.update(p, upload); release(Buffer.from('obsolete'));
  assert.equal(await capture, null); assert.deepEqual(Buffer.from(await delayed.image(p)), upload); delayed.close();
  for (const invalid of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YmFk', 4]) assert.throws(() => decodeUpload(invalid));
  db.prepare('DELETE FROM projects').run(); assert.equal(db.prepare('SELECT COUNT(*) n FROM project_thumbnails').get().n, 0);
});
