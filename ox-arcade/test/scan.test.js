"use strict";
// Unit tests for lib/scan.js — build discovery over a fixture tree in tmpdir.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("path");

const { scanBuilds, slugify, findEntry, parseFolderMeta, detectNetcode, multiplayerFor } = require("../lib/scan");

async function makeDir(p) { await fs.mkdir(p, { recursive: true }); }
async function put(p, content) {
  await makeDir(path.dirname(p));
  await fs.writeFile(p, content);
}

// Build the fixture tree once per test file; each test gets fresh copies of
// whatever it mutates via its own subdir work. Simpler: rebuild per test.
async function buildFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "goalarchive-fix-"));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });

  // A normal static game with README title + description
  const game = path.join(root, "Fake Game");
  await put(path.join(game, "index.html"), "<!doctype html><title>fake</title>");
  await put(path.join(game, "README.md"), "# Fake Game\n\nA fake little game about nothing.\n\nMore text.");
  await put(path.join(game, "js", "main.js"), "console.log(1)");
  await put(path.join(game, "screenshots", "shot1.png"), "png");
  await put(path.join(game, "shots", "shot2.png"), "png");

  // Entry variants
  await put(path.join(root, "PubBuild", "public", "index.html"), "<!doctype html>");
  await put(path.join(root, "SrcBuild", "src", "index.html"), "<!doctype html>");

  // No entry -> incomplete
  await makeDir(path.join(root, "Stub Noentry"));

  // Deep-only html (game.html nested two levels)
  await put(path.join(root, "DeepBuild", "game", "v2", "game.html"), "<!doctype html>");

  // Instrument tag by name match (fl studio)
  await put(path.join(root, "FL Studio - Test", "index.html"), "<!doctype html>");

  // Noise that must be excluded
  await put(path.join(root, "node_modules", "somepkg", "index.html"), "x");
  await put(path.join(root, ".git", "index.html"), "x");
  await put(path.join(root, ".hidden", "index.html"), "x");
  await put(path.join(root, "prompt-pack", "prompts", "index.html"), "x");

  // The archive itself must never exhibit itself (any name it goes by)
  await put(path.join(root, "goal-archive", "public", "index.html"), "<!doctype html>");
  await put(path.join(root, "ox-arcade", "public", "index.html"), "<!doctype html>");

  return root;
}

test("slugify produces stable ids", () => {
  assert.equal(slugify("FNAF-Hermes"), "fnaf-hermes");
  assert.equal(slugify("FL Studio - Hermes (ox-alpha)"), "fl-studio-hermes-ox-alpha");
  assert.equal(slugify("Minecraft 2!!"), "minecraft-2");
});

test("parseFolderMeta: bracket tags for model + harness + run, legacy untouched", () => {
  // legacy parenthetical "(ox-alpha)" IS the model, written in the title
  const legacy = parseFolderMeta("FL Studio - Hermes (ox-alpha)");
  assert.equal(legacy.model, "ox-alpha");
  assert.equal(legacy.title, "FL Studio - Hermes");
  assert.equal(legacy.harness, undefined);          // let deriveHarness run as before

  // plain legacy name: no brackets, no parenthetical -> nothing parsed
  const plain = parseFolderMeta("FNAF-Hermes");
  assert.equal(plain.model, null);
  assert.equal(plain.title, null);

  // bracket model ('=' canonical on Windows; ':' accepted for repo-side names)
  const m1 = parseFolderMeta("Portal 2 [model=gpt-5.6-luna]");
  assert.equal(m1.model, "gpt-5.6-luna");
  assert.equal(m1.title, "Portal 2");
  assert.equal(m1.run, null);
  const m1b = parseFolderMeta("Portal 2 [model:gpt-5.6-luna]");
  assert.equal(m1b.model, "gpt-5.6-luna");

  // bracket model + bare bracket harness (known key only)
  const m2 = parseFolderMeta("TowerDefense [model=gemini-3][codex]");
  assert.equal(m2.model, "gemini-3");
  assert.equal(m2.title, "TowerDefense");
  assert.equal(m2.harness, "codex");

  // bare unknown bracket word ignored; server assignable via brackets too
  const m3 = parseFolderMeta("SpeedGame [server][weirdword]");
  assert.equal(m3.harness, "server");
  assert.equal(m3.title, "SpeedGame");

  // spaces tolerated around tag contents; run tag parsed as number
  const m4 = parseFolderMeta("Game X [ model = k2 ][run=07]");
  assert.equal(m4.model, "k2");
  assert.equal(m4.run, 7);
  assert.equal(m4.title, "Game X");
});

test("deriveHarness: hermes tagged, unknowns untagged, override wins", () => {
  const { deriveHarness } = require("../lib/scan");
  assert.equal(deriveHarness("FNAF-Hermes"), "hermes");
  assert.equal(deriveHarness("Minecraft-OpenCode"), "opencode");
  assert.equal(deriveHarness("Something Else"), "none");
  assert.equal(deriveHarness("Whatever", "server"), "server");
});

test("prompt-pack is excluded from scans", async () => {
  const root = await buildFixture({ after() {} });
  const builds = await scanBuilds(root);
  assert.equal(builds.find((b) => b.id === "prompt-pack"), undefined);
});

test("scanBuilds surfaces model + folder-title from brackets", async () => {
  const root = await buildFixture({ after() {} });
  // Windows forbids [ ] : in dir names — the fixture uses the slug form that
  // scanBuilds itself produces; parseFolderMeta handles raw bracketed names.
  await put(path.join(root, "Bracket Game model k2-9 opencode", "index.html"), "<!doctype html>");
  const builds = await scanBuilds(root);
  const b = builds.find(x => x.id === "bracket-game-model-k2-9-opencode");
  assert.ok(b, "bracketed build discovered");
  assert.equal(b.model, null);            // no brackets on disk -> no parsed model
  assert.equal(b.harness, "opencode");    // legacy suffix rules still apply
});

test("findEntry walks deep and ranks sensibly", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ga-entry2-"));
  try {
    // deep game.html only -> found
    await put(path.join(root, "A", "game", "v2", "game.html"), "x");
    assert.equal(await findEntry(path.join(root, "A")), "game/v2/game.html");
    // dist/index.html counts (bundler builds)
    await put(path.join(root, "B", "dist", "index.html"), "x");
    assert.equal(await findEntry(path.join(root, "B")), "dist/index.html");
    // root index.html outranks deeper ones
    await put(path.join(root, "C", "index.html"), "x");
    await put(path.join(root, "C", "public", "index.html"), "x");
    assert.equal(await findEntry(path.join(root, "C")), "index.html");
    // node_modules ignored; empty dir -> null
    await put(path.join(root, "D", "node_modules", "x", "index.html"), "x");
    assert.equal(await findEntry(path.join(root, "D")), null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("scan discovers builds with expected fields and excludes noise", async () => {
  const root = await buildFixture({ after() {} });
  const builds = await scanBuilds(root);
  const byId = Object.fromEntries(builds.map(b => [b.id, b]));

  // Excludes node_modules, .git, dotdirs; keeps the six real dirs (+stub)
  assert.deepEqual(Object.keys(byId).sort(), [
    "deepbuild", "fake-game", "fl-studio-test", "pubbuild", "srcbuild", "stub-noentry",
  ]);
  // the archive's own folder is never an exhibit, by either name
  assert.equal(byId["goal-archive"], undefined);
  assert.equal(byId["ox-arcade"], undefined);

  const g = byId["fake-game"];
  assert.equal(g.status, "playable");
  assert.equal(g.entry, "index.html");
  assert.equal(g.title, "Fake Game");                       // README H1 wins
  assert.ok(g.description.startsWith("A fake little game"));
  assert.deepEqual(g.tags, ["game"]);
  assert.equal(g.url, "/play/fake-game/index.html");
  assert.ok(g.fileCount >= 5);
  assert.ok(g.sizeBytes > 0);
  assert.ok(g.mtime);                                       // ISO string
  // own screenshots collected from screenshots/ AND shots/
  assert.ok(g.shots.some(s => s.endsWith("shot1.png")));
  assert.ok(g.shots.some(s => s.endsWith("shot2.png")));
  assert.equal(byId["stub-noentry"].status, "incomplete");
  assert.equal(byId["stub-noentry"].entry, null);
  assert.equal(byId["fl-studio-test"].tags.includes("instrument"), true);
  assert.equal(byId["srcbuild"].entry, "src/index.html");
  assert.equal(byId["srcbuild"].url, "/play/srcbuild/src/index.html");   // no %2F ever
  assert.equal(byId["pubbuild"].entry, "public/index.html");
  assert.equal(byId["deepbuild"].status, "playable");                    // deep walk found it
  assert.equal(byId["deepbuild"].entry, "game/v2/game.html");
});

test("overrides.json wins for title/description/tags", async () => {
  const root = await buildFixture({ after() {} });
  const ovPath = path.join(root, ".archive-overrides.json");
  await put(ovPath, JSON.stringify({
    "fake-game": { title: "Custom Title", description: "Custom desc.", tags: ["game", "favorite"] },
  }));
  const builds = await scanBuilds(root, { overridesPath: ovPath });
  const g = builds.find(b => b.id === "fake-game");
  assert.equal(g.title, "Custom Title");
  assert.equal(g.description, "Custom desc.");
  assert.deepEqual(g.tags, ["game", "favorite"]);
});

test("mtime walk skips node_modules and .git", async () => {
  const root = await buildFixture({ after() {} });
  const gameDir = path.join(root, "Fake Game");
  const nm = path.join(gameDir, "node_modules", "pkg", "f.js");
  await put(nm, "x");
  const far = new Date("2030-01-01T00:00:00Z");
  await fs.utimes(nm, far, far);
  const builds = await scanBuilds(root);
  const g = builds.find(b => b.id === "fake-game");
  const mt = new Date(g.mtime).getTime();
  assert.ok(mt < far.getTime(), "mtime must ignore node_modules");
});

// ---- multiplayer (netcode) detection ---------------------------------------

test("detectNetcode finds websocket/webrtc/sse signals", async () => {
  const root = await buildFixture({ after() {} });
  const game = path.join(root, "Fake Game");
  await put(path.join(game, "js", "net.js"),
    "const ws = new WebSocket('wss://x/y'); const pc = new RTCPeerConnection();");
  await put(path.join(game, "js", "feed.js"), "const es = new EventSource('/api/feed');");
  const hits = await detectNetcode(game);
  assert.ok(hits.includes("websocket"));
  assert.ok(hits.includes("webrtc"));
  assert.ok(hits.includes("sse"));

  const plain = path.join(root, "PubBuild");
  assert.deepEqual(await detectNetcode(plain), []);
});

test("detectNetcode ignores QA tooling (tests/scripts dirs)", async () => {
  const root = await buildFixture({ after() {} });
  const game = path.join(root, "Fake Game");
  // CDP/e2e drivers live in tests/ or scripts/ — not game netcode
  await put(path.join(game, "tests", "cdp.js"), "const ws = new WebSocket('ws://x');");
  await put(path.join(game, "scripts", "e2e.js"), "new WebSocket(url);");
  assert.deepEqual(await detectNetcode(game), []);
  // but the same code next to the game IS a signal
  await put(path.join(game, "js", "cdp.js"), "new WebSocket('ws://x');");
  assert.deepEqual(await detectNetcode(game), ["websocket"]);
});

test("scanBuilds attaches multiplayer; plain builds are single-player", async (t) => {
  const root = await buildFixture(t);
  await put(path.join(root, "Fake Game", "js", "net.js"), "new WebSocket('ws://x');");

  const builds = await scanBuilds(root);
  const mpBuild = builds.find((b) => b.id === "fake-game");
  assert.equal(mpBuild.multiplayer.supported, true);
  assert.deepEqual(mpBuild.multiplayer.signals, ["websocket"]);
  assert.equal(mpBuild.multiplayer.source, "scan");

  const plain = builds.find((b) => b.id === "pubbuild");
  assert.equal(plain.multiplayer.supported, false);
  assert.deepEqual(plain.multiplayer.signals, []);
});

test("multiplayer overrides: force-on (declared) and force-off win over scans", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ga-mp-"));
  try {
    // force-on without any signal -> "declared"
    const on = await multiplayerFor(tmp, { multiplayer: true });
    assert.equal(on.supported, true);
    assert.deepEqual(on.signals, ["declared"]);
    assert.equal(on.source, "override");

    // force-off beats a real websocket signal
    await put(path.join(tmp, "net.js"), "new WebSocket('ws://x');");
    const off = await multiplayerFor(tmp, { multiplayer: false });
    assert.equal(off.supported, false);

    // no declaration -> pure scan
    const auto = await multiplayerFor(tmp, {});
    assert.equal(auto.supported, true);
    assert.deepEqual(auto.signals, ["websocket"]);

    // endpoint passthrough
    const ep = await multiplayerFor(tmp, { multiplayer: true, endpoint: "/ws/lobby" });
    assert.equal(ep.endpoint, "/ws/lobby");
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
});
