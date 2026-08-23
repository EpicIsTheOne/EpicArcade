"use strict";
// Integration tests for server.js over a small fixture tree.
const { test } = require("node:test");
const assert = require("node:assert");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("path");

const { start } = require("../server");

async function put(p, content) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content);
}

async function makeRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "goalarchive-srv-"));
  t.after(async () => { await fsp.rm(root, { recursive: true, force: true }); });
  const game = path.join(root, "Fake Game");
  await put(path.join(game, "index.html"), "<!doctype html><h1>hi</h1>");
  await put(path.join(game, "js", "main.js"), "console.log(1)");
  await put(path.join(game, "screenshots", "shot.png"), "png");
  // secret ABOVE the build dir — must never be reachable via /play
  await put(path.join(root, "secret.txt"), "TOP SECRET");
  return root;
}

test("api/builds returns scanned builds without the archive itself", async (t) => {
  const root = await makeRoot(t);
  const srv = await start({ root, port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/builds`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
    assert.equal(body.builds[0].id, "fake-game");
    assert.ok(!body.builds.some(b => b.id === "goal-archive" || b.id === "ox-arcade"));
    // harness registry exposed; baseline model never appears as a tag
    assert.ok(body.harnessMeta && body.harnessMeta.server.label === "SERVER");
    assert.ok(["hermes", "none"].includes(body.builds[0].harness));
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("ox-alpha"), "payload must never tag the baseline model");
  } finally { await srv.close(); }
});

test("serves build files through /play with correct content", async (t) => {
  const root = await makeRoot(t);
  const srv = await start({ root, port: 0 });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const html = await (await fetch(`${base}/play/fake-game/index.html`)).text();
    assert.ok(html.includes("<h1>hi</h1>"));
    const js = await (await fetch(`${base}/play/fake-game/js/main.js`)).text();
    assert.ok(js.includes("console.log"));
    const jsRes = await fetch(`${base}/play/fake-game/js/main.js`);
    assert.match(jsRes.headers.get("content-type") || "", /javascript/);
  } finally { await srv.close(); }
});

test("blocks path traversal out of a build dir", async (t) => {
  const root = await makeRoot(t);
  const srv = await start({ root, port: 0 });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    for (const evil of [
      `/play/fake-game/../secret.txt`,
      `/play/fake-game/%2e%2e/secret.txt`,
      `/play/fake-game/..%2fsecret.txt`,
      `/media/fake-game/../../secret.txt`,
    ]) {
      const res = await fetch(base + evil);
      assert.ok([403, 404].includes(res.status), `expected 403/404 for ${evil}, got ${res.status}`);
      const text = await res.text();
      assert.ok(!text.includes("TOP SECRET"), `leak via ${evil}`);
    }
  } finally { await srv.close(); }
});

test("unknown build and unknown api route -> 404", async (t) => {
  const root = await makeRoot(t);
  const srv = await start({ root, port: 0 });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    assert.equal((await fetch(`${base}/play/nope/index.html`)).status, 404);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${base}/thumbs/nope.png`)).status, 404);
    // sync off by default: arcade endpoint forbidden, 3-segment route inert
    const syncRes = await fetch(`${base}/api/sync`, { method: "POST" });
    assert.equal(syncRes.status, 403);
    assert.equal((await fetch(`${base}/OxAlpha/FNAF/Hermes/`)).status, 404);
    const builds = await (await fetch(`${base}/api/builds`)).json();
    assert.equal(builds.arcade, undefined);
  } finally { await srv.close(); }
});

test("sync mode serves repo games at /Model/Project/Harness/", async (t) => {
  const root = await makeRoot(t);
  // fixture "repo" with the EpicArcade layout
  const fsp2 = require("node:fs/promises");
  const path2 = require("path");
  const os2 = require("node:os");
  const arcadeDir = await fsp2.mkdtemp(path2.join(os2.tmpdir(), "ga-arcfix-"));
  t.after(async () => { await fsp2.rm(arcadeDir, { recursive: true, force: true }); });
  const put = async (p, c) => { await fsp2.mkdir(path2.dirname(p), { recursive: true }); await fsp2.writeFile(p, c); };
  await put(path2.join(arcadeDir, "OxAlpha", "DemoGame", "Hermes", "index.html"), "<!doctype html><b>remote</b>");
  await put(path2.join(arcadeDir, "OxAlpha", "DemoGame", "Hermes", "js", "m.js"), "console.log(1)");
  await put(path2.join(arcadeDir, "deployed.json"), JSON.stringify({
    "OxAlpha/DemoGame/Hermes": "https://example.test/OxAlpha/DemoGame/Hermes/",
  }));
  // fake .git so ensureRepo treats it as an existing repo (no network in tests)
  await put(path2.join(arcadeDir, ".git", "HEAD"), "ref: refs/heads/main");

  const srv = await start({ root, port: 0, sync: true, arcadeDir });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const body = await (await fetch(`${base}/api/builds`)).json();
    assert.ok(body.arcade && body.arcade.enabled === true);
    const g = body.arcade.games.find(x => x.route === "OxAlpha/DemoGame/Hermes");
    assert.ok(g, "arcade game listed");
    assert.equal(g.deployed, "https://example.test/OxAlpha/DemoGame/Hermes/");

    const html = await (await fetch(`${base}/OxAlpha/DemoGame/Hermes/`)).text();
    assert.ok(html.includes("<b>remote</b>"));
    const js = await fetch(`${base}/OxAlpha/DemoGame/Hermes/js/m.js`);
    assert.match(js.headers.get("content-type") || "", /javascript/);

    // traversal guarded
    const evil = await fetch(`${base}/OxAlpha/DemoGame/Hermes/../../secret.txt`);
    assert.ok([403, 404].includes(evil.status));

    // built-ins still win over the 3-segment route
    assert.equal((await fetch(`${base}/play/fake-game/index.html`)).status, 200);

    // manual sync endpoint allowed when enabled
    const s = await fetch(`${base}/api/sync`, { method: "POST" });
    assert.equal(s.status, 200);
  } finally { await srv.close(); }
});

test("basePath: /base redirects to /base/ and shell assets are relative", async (t) => {
  const root = await makeRoot(t);
  const http = require("node:http");
  const srv = await start({ root, port: 0, basePath: "/OxArcade" });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const loc = await new Promise((resolve, reject) => {
      http.get(`${base}/OxArcade`, (r) => { r.resume(); resolve({ status: r.statusCode, location: r.headers.location }); })
        .on("error", reject);
    });
    assert.equal(loc.status, 301);
    assert.equal(loc.location, "/OxArcade/");
    const shell = await (await fetch(`${base}/OxArcade/`)).text();
    assert.ok(shell.includes('href="style.css"'), "stylesheet link relative");
    assert.ok(shell.includes('src="config.js"'), "config script relative");
    assert.ok(shell.includes('src="app.js"'), "app script relative");
    assert.ok(!shell.includes('href="/style.css"'), "no root-absolute stylesheet");
    for (const p of ["/OxArcade/style.css", "/OxArcade/config.js", "/OxArcade/app.js"]) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 200, `${p} must be served`);
    }
    // non-base paths unaffected
    const direct = await fetch(`${base}/OxArcade/api/builds`);
    assert.equal(direct.status, 200);
  } finally { await srv.close(); }
});
