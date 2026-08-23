"use strict";
// Unit tests for lib/arcade.js — layout parsing + deployed.json (no network).
const { test } = require("node:test");
const assert = require("node:assert");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("path");

const { parseArcadeLayout, readDeployed, slugOk, mergeDeployed } = require("../lib/arcade");

async function put(p, content) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content);
}

test("parses Model/Project/Harness layout", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ga-arc-"));
  try {
    await put(path.join(root, "OxAlpha", "FNAF", "Hermes", "index.html"), "x");
    await put(path.join(root, "OxAlpha", "FNAF", "Hermes", "arcade.json"),
      JSON.stringify({ title: "Wonderdrome" }));
    await put(path.join(root, "Luna", "SpeedGame", "Server", "dist", "index.html"), "x");
    await put(path.join(root, "stray-file.txt"), "x");                       // ignored
    await put(path.join(root, ".git", "config"), "x");                       // ignored
    await put(path.join(root, "OxAlpha", "OnlyTwo", "index.html"), "x");     // wrong depth: ignored
    const games = await parseArcadeLayout(root);
    assert.equal(games.length, 2);

    const g = games.find(x => x.route === "OxAlpha/FNAF/Hermes");
    assert.ok(g);
    assert.equal(g.title, "Wonderdrome");        // arcade.json wins
    assert.equal(g.entry, "index.html");
    assert.equal(g.harness, "hermes");           // Hermes harness now tagged
    assert.equal(g.model, null);                 // no bracket tags in repo names
    assert.ok(g.mtime);

    const g2 = games.find(x => x.route === "Luna/SpeedGame/Server");
    assert.ok(g2);
    assert.equal(g2.entry, "dist/index.html");
    assert.equal(g2.harness, "server");
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});

test("deployed.json read/merge + slug rules", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ga-dep-"));
  try {
    await put(path.join(root, "deployed.json"),
      JSON.stringify({ "OxAlpha/FNAF/Hermes": "https://techexplore.us/OxAlpha/FNAF/Hermes/" }));
    const d = await readDeployed(root);
    assert.equal(d["OxAlpha/FNAF/Hermes"], "https://techexplore.us/OxAlpha/FNAF/Hermes/");
    // absent file -> {}
    assert.deepEqual(await readDeployed(path.join(root, "nowhere")), {});

    assert.equal(slugOk("OxAlpha"), true);
    assert.equal(slugOk("k2-9"), true);
    assert.equal(slugOk("bad/slug"), false);
    assert.equal(slugOk("bad slug"), false);
    assert.equal(slugOk("-lead"), false);

    // merge keeps unknown keys and overrides given ones
    const merged = mergeDeployed(d, { "Luna/SpeedGame/Server": "https://x/y/" });
    assert.equal(merged["OxAlpha/FNAF/Hermes"], "https://techexplore.us/OxAlpha/FNAF/Hermes/");
    assert.equal(merged["Luna/SpeedGame/Server"], "https://x/y/");
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});

test("arcade.json multiplayer declaration reaches game records", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ga-mp-"));
  try {
    // object form: declares multiplayer AND names its endpoint
    await put(path.join(root, "OxAlpha", "NetGame", "Hermes", "index.html"), "x");
    await put(path.join(root, "OxAlpha", "NetGame", "Hermes", "arcade.json"),
      JSON.stringify({ title: "NetGame", multiplayer: { endpoint: "/ws/net" } }));
    // boolean false: explicit single-player even if code would match
    await put(path.join(root, "OxAlpha", "SoloGame", "Hermes", "index.html"),
      "<script>new WebSocket('ws://x')</script>");
    await put(path.join(root, "OxAlpha", "SoloGame", "Hermes", "arcade.json"),
      JSON.stringify({ title: "SoloGame", multiplayer: false }));

    const games = await parseArcadeLayout(root);
    const net = games.find((g) => g.route === "OxAlpha/NetGame/Hermes");
    assert.ok(net, "netgame parsed");
    assert.equal(net.multiplayer.supported, true);
    assert.equal(net.multiplayer.endpoint, "/ws/net");

    const solo = games.find((g) => g.route === "OxAlpha/SoloGame/Hermes");
    assert.ok(solo, "sologame parsed");
    assert.equal(solo.multiplayer.supported, false);
    assert.equal(solo.multiplayer.source, "override");
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});
