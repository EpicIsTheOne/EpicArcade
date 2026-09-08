'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createCommunity } = require('../community');

async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'epic-security-'));
  let app = createCommunity({ dataDir: dir, origin: 'http://localhost', ...options });
  const server = http.createServer((req, res) => app.handle(req, res, new URL(req.url, 'http://localhost')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.close();
    assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(dir, { recursive: true, force: true }); });
  const call = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/community/v1${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const register = async username => {
    const result = await call('/auth/register', 'POST', { username, password: 'a-private-testing-password' });
    assert.equal(result.status, 200);
    return { ...result.body, headers: { Cookie: result.headers.get('set-cookie').split(';')[0], Origin: 'http://localhost', 'X-CSRF-Token': result.body.csrfToken } };
  };
  return { call, register, port: server.address().port, get db() { return app.db; }, restart: adminIds => {
    app.close(); app = createCommunity({ dataDir: dir, origin: 'http://localhost', ...options, adminIds });
  } };
}

test('revocation during a paused request prevents token replacement', async t => {
  const f = await fixture(t), user = await f.register('pausedtoken');
  const token = (await f.call('/tokens', 'POST', { label: 'old' }, user.headers)).body;
  let request;
  const response = new Promise((resolve, reject) => {
    request = http.request({ host: '127.0.0.1', port: f.port, path: '/api/community/v1/tokens', method: 'POST',
      headers: { Authorization: 'Bearer ' + token.token, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    request.on('error', reject); request.write('{"label":');
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await f.call('/tokens/' + token.id, 'DELETE', undefined, user.headers)).status, 200);
  request.end('"replacement"}');
  assert.equal(await response, 401);
  assert.equal((await f.call('/tokens', 'GET', undefined, user.headers)).body.tokens.length, 0);
});

test('publication retry keys reuse a stable project and reject changed payloads', async t => {
  const f = await fixture(t), user = await f.register('retryowner');
  const headers = { ...user.headers, 'Idempotency-Key': 'same-publication' };
  const body = { name: 'Retry-safe', url: 'https://example.com/retry' };
  const first = await f.call('/projects', 'POST', body, headers);
  const retry = await f.call('/projects', 'POST', body, headers);
  assert.equal(first.status, 201); assert.equal(retry.status, 200);
  assert.equal(first.body.project.id, retry.body.project.id);
  assert.equal((await f.call('/projects', 'POST', { ...body, name: 'Changed' }, headers)).status, 409);
  assert.equal((await f.call('/projects')).body.total, 1);
});

test('invalid input fails closed, including visibility, JSON shape, URLs and pagination', async t => {
  const f = await fixture(t), user = await f.register('validation');
  const good = { name: 'Build', url: 'https://example.com' };
  for (const body of [null, [], { ...good, visibility: 'private' }, { ...good, featured: true },
    { ...good, publication: { method: 'manual' } }, { ...good, models: ['x'.repeat(121)] },
    { ...good, tags: Array(9).fill('x') }, { ...good, thumbnailUrl: 'http://example.com/x.png' },
    { ...good, sourceUrl: 'https://user:password@example.com' }, { ...good, remixOf: 'missing-id' },
    { ...good, url: 'http://[::1]/' }, { ...good, url: 'http://2130706433/' }, { ...good, url: 'http://foo.local/' },
    { ...good, url: 'javascript:alert(1)' }]) {
    assert.equal((await f.call('/projects', 'POST', body, user.headers)).status, 400, JSON.stringify(body));
  }
  for (const query of ['offset=1.5', 'limit=NaN', 'limit=0', 'offset=-1', 'limit=101', 'sort=unknown'])
    assert.equal((await f.call('/projects?' + query)).status, 400, query);
  assert.equal((await f.call('/auth/login', 'POST', null)).status, 400);
  assert.equal((await f.call('/projects', 'POST', { ...good, description: 'x'.repeat(2100000) }, user.headers)).status, 413);
  assert.equal((await f.call('/projects')).body.total, 0);
});

test('unlisted relationships stay undiscoverable and deletion handles reports and remixes atomically', async t => {
  const f = await fixture(t), owner = await f.register('originals'), other = await f.register('reporter');
  const original = (await f.call('/projects', 'POST', { name: 'Original', url: 'https://example.com/original', models: ['private-model'] }, owner.headers)).body.project;
  const remix = (await f.call('/projects', 'POST', { name: 'Remix', url: 'https://example.com/remix', remixOf: original.id }, other.headers)).body.project;
  assert.equal((await f.call('/projects/' + original.id, 'PATCH', { remixOf: remix.id }, owner.headers)).status, 400);
  await f.call('/projects/' + original.id, 'PATCH', { visibility: 'unlisted' }, owner.headers);
  assert.equal((await f.call('/projects/' + remix.id)).body.project.remixOf, null);
  assert.equal((await f.call('/projects?models=private-model')).body.total, 0);
  assert.equal((await f.call('/creators/originals')).body.stats.projects, 0);
  assert.equal((await f.call('/projects', 'POST', { name: 'Leaker', url: 'https://example.com', remixOf: original.id }, other.headers)).status, 400);
  const report = await f.call(`/projects/${original.id}/report`, 'POST', { reason: 'Review this' }, other.headers);
  assert.equal(report.status, 201);
  assert.equal((await f.call('/projects/' + original.id, 'DELETE', undefined, owner.headers)).status, 200);
  assert.equal((await f.call('/projects/' + remix.id)).body.project.remixOf, null);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM reports').get().n, 0);
});

test('moderators feature, hide, resolve reports and disable or restore accounts', async t => {
  const f = await fixture(t), admin = await f.register('moderator'), creator = await f.register('builder');
  f.restart([admin.user.id]);
  const project = (await f.call('/projects', 'POST', { name: 'Moderated', url: 'https://example.com' }, creator.headers)).body.project;
  assert.equal((await f.call('/admin/projects/' + project.id, 'PATCH', { featured: true }, creator.headers)).status, 403);
  await f.call('/admin/projects/' + project.id, 'PATCH', { featured: true }, admin.headers);
  assert.equal((await f.call('/projects?sort=featured')).body.total, 1);
  const report = (await f.call(`/projects/${project.id}/report`, 'POST', { reason: 'Please inspect' }, creator.headers)).body;
  await f.call('/admin/reports/' + report.id, 'PATCH', { status: 'resolved' }, admin.headers);
  assert.equal((await f.call('/admin/reports', 'GET', undefined, admin.headers)).body.reports.length, 0);
  await f.call('/admin/projects/' + project.id, 'PATCH', { moderation: 'hidden' }, admin.headers);
  assert.equal((await f.call('/projects')).body.total, 0);
  assert.equal((await f.call('/projects?mine=1', 'GET', undefined, creator.headers)).body.projects[0].moderation, 'hidden');
  await f.call('/admin/projects/' + project.id, 'PATCH', { moderation: 'active' }, admin.headers);
  const token = (await f.call('/tokens', 'POST', { label: 'agent' }, creator.headers)).body;
  await f.call('/admin/accounts/' + creator.user.id, 'PATCH', { disabled: true }, admin.headers);
  assert.equal((await f.call('/projects')).body.total, 0);
  assert.equal((await f.call('/projects/' + project.id)).status, 404);
  assert.equal((await f.call('/projects?mine=1', 'GET', undefined, { Authorization: 'Bearer ' + token.token })).status, 401);
  assert.equal((await f.call('/admin/accounts/' + creator.user.id, 'PATCH', { disabled: false }, admin.headers)).status, 200);
  assert.equal((await f.call('/projects')).body.total, 1);
  assert.equal((await f.call('/auth/me', 'GET', undefined, creator.headers)).body.user, null);
  assert(f.db.prepare('SELECT COUNT(*) n FROM moderation_log').get().n >= 5);
});

test('secure session cookies reject ambiguity and expire/revoke correctly', async t => {
  const f = await fixture(t, { secureCookies: true }), user = await f.register('sessions');
  assert(user.headers.Cookie.startsWith('__Host-eb_session='));
  assert.equal((await f.call('/auth/me', 'GET', undefined, { Cookie: user.headers.Cookie + '; ' + user.headers.Cookie })).status, 401);
  const token = (await f.call('/tokens', 'POST', { label: 'session-test' }, user.headers)).body;
  assert.equal((await f.call('/auth/me', 'GET', undefined, { ...user.headers, Authorization: 'Bearer ' + token.token })).status, 401);
  f.db.prepare('UPDATE tokens SET expires_at=0 WHERE id=?').run(token.id);
  assert.equal((await f.call('/auth/me', 'GET', undefined, { Authorization: 'Bearer ' + token.token })).status, 401);
  assert(!f.db.prepare('SELECT id FROM sessions').get().id.includes(user.headers.Cookie.split('=')[1]));
  const badOrigin = { ...user.headers, Origin: 'http://game-origin.example.com' };
  assert.equal((await f.call('/projects', 'POST', { name: 'Attack', url: 'https://example.com' }, badOrigin)).status, 403);
});

test('rate buckets persist, cover all paths and use forwarded IP only when explicitly trusted', async t => {
  const f = await fixture(t, { trustProxy: true });
  for (let i = 0; i < 180; i++) await f.call('/not-a-route-' + i, 'POST', {}, { 'X-Forwarded-For': '198.51.100.1' });
  const limited = await f.call('/another-route', 'POST', {}, { 'X-Forwarded-For': '198.51.100.1' });
  assert.equal(limited.status, 429); assert(Number(limited.headers.get('retry-after')) > 0);
  f.restart([]);
  assert.equal((await f.call('/another-route', 'POST', {}, { 'X-Forwarded-For': '198.51.100.1' })).status, 429);
  assert.equal((await f.call('/another-route', 'POST', {}, { 'X-Forwarded-For': '198.51.100.2' })).status, 401);
  assert.equal((await f.call('/another-route', 'POST', {}, { 'X-Forwarded-For': '198.51.100.2, 198.51.100.1' })).status, 429);
  const untrusted = await fixture(t, { trustProxy: false });
  for (let i = 0; i < 180; i++) await untrusted.call('/unknown', 'POST', {}, { 'X-Forwarded-For': '198.51.100.' + (i % 200) });
  assert.equal((await untrusted.call('/unknown', 'POST', {}, { 'X-Forwarded-For': '203.0.113.1' })).status, 429);
});

test('trending ignores old lifetime totals and gives new zero-engagement projects exposure', async t => {
  const f = await fixture(t), owner = await f.register('ranker');
  const old = (await f.call('/projects', 'POST', { name: 'Old hit', url: 'https://example.com/old' }, owner.headers)).body.project;
  const fresh = (await f.call('/projects', 'POST', { name: 'Fresh build', url: 'https://example.com/new' }, owner.headers)).body.project;
  f.db.prepare("UPDATE projects SET likes=100000,views=1000000,created_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(old.id);
  const ranked = (await f.call('/projects?sort=trending')).body.projects;
  assert.equal(ranked[0].id, fresh.id);
});
