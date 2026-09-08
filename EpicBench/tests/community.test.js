"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCommunity } = require("../community");

async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epicbench-community-test-"));
  const adminIds = options.adminIds || [];
  let community = createCommunity({ dataDir: dir, origin: "http://localhost", adminIds, ...options });
  let server = http.createServer((req, res) => Promise.resolve(community.handle(req, res, new URL(req.url, "http://localhost"))).then(ok => { if (!ok && !res.writableEnded) res.end(); }).catch(() => { if (!res.writableEnded) res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { if (server.listening) await new Promise(resolve => server.close(resolve)); community.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  async function restart(nextAdminIds) { await new Promise(resolve => server.close(resolve)); community.close(); community = createCommunity({ dataDir: dir, origin: "http://localhost", adminIds: nextAdminIds, ...options }); server = http.createServer((req, res) => Promise.resolve(community.handle(req, res, new URL(req.url, "http://localhost"))).then(ok => { if (!ok && !res.writableEnded) res.end(); }).catch(() => { if (!res.writableEnded) res.end(); })); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); }
  async function request(route, method = "GET", payload, state = {}, extra = {}) {
    return new Promise((resolve, reject) => {
      const headers = { ...(payload === undefined ? {} : { "content-type": "application/json" }), ...extra.headers };
      if (state.cookie) headers.cookie = state.cookie;
      if (state.token) headers.authorization = `Bearer ${state.token}`;
      if (state.origin !== undefined) headers.origin = state.origin;
      if (state.csrf) headers["x-csrf-token"] = state.csrf;
      const req = http.request({ host: "127.0.0.1", port: server.address().port, path: route, method, headers }, res => { let text = ""; res.on("data", x => { text += x; }); res.on("end", () => { let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; } resolve({ status: res.statusCode, headers: res.headers, body }); }); });
      req.on("error", reject); if (payload !== undefined) req.end(JSON.stringify(payload)); else req.end();
    });
  }
  async function register(username, password = "a-long-secure-password") { const response = await request("/api/community/v1/auth/register", "POST", { username, password }); const cookie = response.headers["set-cookie"]?.[0]?.split(";", 1)[0]; return { ...response, state: { cookie, csrf: response.body.csrfToken, origin: "http://localhost" } }; }
  return { request, register, restart, community, adminIds, dir };
}

test("register, login, logout, recovery, cookie flags, and token revocation", async t => {
  const f = await fixture(t, { secureCookies: true }); const made = await f.register("alice");
  assert.equal(made.status, 200); assert.ok(made.body.user.id && made.body.csrfToken && made.body.recoveryCode); assert.match(made.headers["set-cookie"][0], /(?:__Host-)?eb_session=.*HttpOnly/); assert.match(made.headers["set-cookie"][0], /Secure/);
  assert.equal((await f.request("/api/community/v1/auth/login", "POST", { username: "alice", password: "a-long-secure-password" })).status, 200);
  const token = await f.request("/api/community/v1/tokens", "POST", { label: "build-agent", harness: "Codex" }, made.state); assert.equal(token.status, 201);
  const reset = await f.request("/api/community/v1/auth/recover", "POST", { username: "alice", recoveryCode: made.body.recoveryCode, password: "a-new-secure-password" }); assert.equal(reset.status, 200); assert.ok(reset.body.recoveryCode);
  assert.equal((await f.request("/api/community/v1/auth/login", "POST", { username: "alice", password: "a-long-secure-password" })).status, 401);
  assert.equal((await f.request("/api/community/v1/projects", "POST", { name: "revoked", url: "https://example.com" }, { token: token.body.token })).status, 401);
  const logged = await f.request("/api/community/v1/auth/login", "POST", { username: "alice", password: "a-new-secure-password" }); const cookie = logged.headers["set-cookie"][0].split(";", 1)[0];
  assert.ok((await f.request("/api/community/v1/auth/me", "GET", undefined, { cookie })).body.user); assert.equal((await f.request("/api/community/v1/auth/logout", "POST", undefined, { cookie, origin: "http://localhost", csrf: logged.body.csrfToken })).status, 200);
});

test('thumbnail upload ownership, invalid data, persistence and automatic reset use the real API', async t => {
  const f = await fixture(t, { autoPreview: false });
  const alice = (await f.register('thumbnailalice')).state, bob = (await f.register('thumbnailbob')).state;
  const created = await f.request('/api/community/v1/projects', 'POST', { name: 'Cover', url: 'https://example.com', thumbnailData: 'data:image/jpeg;base64,/9j/2Q==' }, alice);
  assert.equal(created.status, 201); const p = created.body.project;
  assert.equal(p.thumbnailSource, 'upload');
  const route = '/api/community/v1/projects/' + p.id;
  assert.equal((await f.request(route + '/thumbnail')).headers['content-type'], 'image/jpeg');
  assert.equal((await f.request(route, 'PATCH', { thumbnailData: null }, bob)).status, 403);
  assert.equal((await f.request(route, 'PATCH', { thumbnailData: 'data:text/html;base64,WA==' }, alice)).status, 400);
  assert.equal((await f.request(route, 'PATCH', { name: 'Renamed' }, alice)).body.project.thumbnailSource, 'upload');
  assert.equal((await f.request(route, 'PATCH', { thumbnailData: null, thumbnailUrl: '' }, alice)).body.project.thumbnailSource, 'automatic');
  assert.equal((await f.request(route + '/thumbnail')).status, 204);
  assert.equal((await f.request(route, 'PATCH', { thumbnailUrl: 'https://example.com/cover.jpg' }, alice)).body.project.thumbnailSource, 'url');
  await f.request(route, 'DELETE', undefined, alice);
  assert.equal((await f.request(route + '/thumbnail')).status, 404);
});

test("ownership, CSRF, validation, CRUD, stable slug, and optional clearing", async t => {
  const f = await fixture(t); const alice = (await f.register("alice")).state; const bob = (await f.register("bob")).state;
  const created = await f.request("/api/community/v1/projects", "POST", { name: "Safe Project", url: "https://example.com/app", description: "hello", models: ["gpt-6-astra"], tags: ["game"], thumbnailUrl: "", sourceUrl: "", visibility: "unlisted" }, alice); assert.equal(created.status, 201); const p = created.body.project;
  assert.equal((await f.request(`/api/community/v1/projects/${p.id}`, "PATCH", { name: "stolen" }, bob)).status, 403); assert.equal((await f.request(`/api/community/v1/projects/${p.id}`, "DELETE", undefined, { ...alice, csrf: "wrong" })).status, 403);
  assert.equal((await f.request("/api/community/v1/projects", "POST", { name: "bad", url: "http://127.0.0.1" }, alice)).status, 400); assert.equal((await f.request("/api/community/v1/projects", "POST", { name: "bad", url: "https://example.com", models: null }, alice)).status, 400);
  const updated = await f.request(`/api/community/v1/projects/${p.slug}`, "PATCH", { description: "", thumbnailUrl: null, sourceUrl: null, remixOf: null }, alice); assert.equal(updated.status, 200); assert.equal(updated.body.project.slug, p.slug); assert.equal(updated.body.project.description, ""); assert.equal((await f.request(`/api/community/v1/projects/${p.id}`, "DELETE", undefined, alice)).status, 200);
});

test("discovery filters, visibility, creator query, pagination, and async catalog", async t => {
  const f = await fixture(t, { getCatalog: async () => ({ models: [{ id: "custom-model", label: "Custom Model" }, { id: "second-model", label: "Second Model" }], harnesses: [{ id: "custom-agent", label: "Custom Agent" }] }) }); const owner = (await f.register("maker")).state;
  const publish = (name, extra) => f.request("/api/community/v1/projects", "POST", { name, url: `https://example.com/${name.toLowerCase()}`, ...extra }, owner);
  await publish("PublicGame", { models: ["custom-model", "second-model"], tags: ["game"], harness: "custom-agent" }); await publish("PublicTool", { models: ["custom-model"], tags: ["tool"], harness: "custom-agent" }); const hidden = await publish("PrivateDraft", { visibility: "unlisted", models: ["custom-model"], tags: ["game"] });
  assert.equal((await f.request("/api/community/v1/projects", "GET")).body.projects.length, 2); assert.equal((await f.request("/api/community/v1/projects?models=custom-model,second-model&tag=game&harness=custom-agent", "GET")).body.projects.length, 1);
  const mine = await f.request("/api/community/v1/projects?creator=maker&limit=1&offset=0", "GET"); assert.ok(mine.body.total >= 2); assert.equal(mine.body.projects.length, 1); assert.equal((await f.request(`/api/community/v1/projects/${hidden.body.project.id}`, "GET")).status, 200); assert.equal((await f.request("/api/community/v1/creators/maker", "GET")).body.projects.length, 2);
  const catalog = await f.request("/api/community/v1/catalog", "GET"); assert.equal(catalog.body.models[0].id, "custom-model"); assert.equal(catalog.body.harnesses[0].id, "custom-agent");
});

test("anonymous views dedupe, likes are unique, and GET never mutates actions", async t => {
  const f = await fixture(t); const state = (await f.register("signals")).state; const created = await f.request("/api/community/v1/projects", "POST", { name: "Signals", url: "https://example.com/signals" }, state); const id = created.body.project.id;
  assert.equal((await f.request(`/api/community/v1/projects/${id}/like`, "GET")).status, 405); assert.equal((await f.request(`/api/community/v1/projects/${id}/view`, "POST")).status, 200); assert.equal((await f.request(`/api/community/v1/projects/${id}/view`, "POST")).status, 200); assert.equal((await f.request(`/api/community/v1/projects/${id}/like`, "POST", undefined, state)).body.likes, 1); assert.equal((await f.request(`/api/community/v1/projects/${id}/like`, "POST", undefined, state)).body.likes, 0); assert.equal((await f.request(`/api/community/v1/projects/${id}`, "GET")).body.project.views, 1);
});

test("agent attribution, token listing/revocation, reporting, and admin moderation", async t => {
  const f = await fixture(t); const adminResponse = await f.register("admin"); const admin = adminResponse.state; const adminId = adminResponse.body.user.id; await f.restart([adminId]); const creator = (await f.register("creator")).state;
  const token = await f.request("/api/community/v1/tokens", "POST", { label: "agent", harness: "Codex" }, creator); const created = await f.request("/api/community/v1/projects", "POST", { name: "Reported", url: "https://example.com/reported" }, { token: token.body.token }); const id = created.body.project.id; assert.equal(created.body.project.publication.method, "agent"); assert.equal(created.body.project.publication.harness, "Codex");
  assert.equal((await f.request(`/api/community/v1/projects/${id}/report`, "POST", { reason: "spam" }, creator)).status, 201); assert.equal((await f.request("/api/community/v1/admin/reports", "GET", undefined, admin)).status, 200); assert.equal((await f.request(`/api/community/v1/admin/projects/${id}`, "PATCH", { featured: true, moderation: "hidden" }, admin)).status, 200); assert.equal((await f.request(`/api/community/v1/projects/${id}`, "GET")).status, 404); assert.equal((await f.request(`/api/community/v1/tokens/${token.body.id}`, "DELETE", undefined, creator)).status, 200); assert.equal((await f.request("/api/community/v1/projects", "POST", { name: "revoked", url: "https://example.com" }, { token: token.body.token })).status, 401);
});
