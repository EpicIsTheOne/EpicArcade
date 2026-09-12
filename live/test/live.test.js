"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("path");

const { acceptKey, encodeFrame, Parser } = require("../lib/ws");
const { normalizeRoute, scanGames } = require("../lib/loader");
const { start } = require("../server");

async function put(p, content) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content);
}

// RFC6455 test vector from the spec
test("acceptKey matches the spec example", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("encodeFrame + Parser roundtrip (masked client frame, ping, close)", () => {
  const events = [];
  const p = new Parser();
  // craft a masked "hi" text frame like a browser would send
  const mask = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const payload = Buffer.from("hi");
  for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, payload]);
  frame[1] = 0x80 | 2;
  p.push(frame, (f) => events.push(f));
  assert.deepEqual(events, [{ kind: "text", data: "hi" }]);

  events.length = 0;
  p.push(Buffer.from([0x89, 0x00]), (f) => events.push(f));                 // ping
  p.push(Buffer.from([0x88, 0x02, 0x03, 0xe8]), (f) => events.push(f));     // close 1000 (unmasked)
  assert.equal(events[0].kind, "ping");
  assert.equal(events[1].kind, "close");
  assert.equal(events[1].code, 1000);

  // server frames parse with no mask present
  events.length = 0;
  p.push(encodeFrame(0x1, Buffer.from('{"a":1}')), (f) => events.push(f));
  assert.equal(events[0].kind, "text");
  assert.equal(events[0].data, '{"a":1}');
});

test("normalizeRoute guards bad and reserved routes", () => {
  assert.equal(normalizeRoute("/ws/demo"), "/ws/demo");
  assert.equal(normalizeRoute("/WS/Demo/"), "/ws/demo");
  assert.equal(normalizeRoute("/nope/x"), null);
  assert.equal(normalizeRoute("/ws/_health"), null);
  assert.equal(normalizeRoute("/ws/"), null);
});

test("scanGames finds depth-3 server.mjs and honors arcade.json routes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "oxlive-scan-"));
  try {
    await put(path.join(root, "OxAlpha", "Skirmish", "Hermes", "server.mjs"), "export default {};");
    await put(path.join(root, "OxAlpha", "Skirmish", "Hermes", "arcade.json"),
      JSON.stringify({ multiplayer: { endpoint: "/ws/skirmish" } }));
    await put(path.join(root, "Other", "Demo", "OpenCode", "server.mjs"), "export default {};"); // falls back to /ws/demo
    const games = await scanGames(root);
    assert.deepEqual(games.map((g) => g.route).sort(), ["/ws/demo", "/ws/skirmish"]);
    const s = games.find((g) => g.route === "/ws/skirmish");
    assert.equal(s.model, "OxAlpha");
    assert.equal(s.project, "Skirmish");
    assert.equal(s.harness, "Hermes");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

// ---- integration: real sockets against a fixture game -----------------------

function onceMessage(ws, match, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for message")), timeoutMs);
    ws.addEventListener("message", (ev) => {
      let m = ev.data;
      try { m = JSON.parse(ev.data); } catch {}
      if (!match || match(m)) { clearTimeout(t); resolve(m); }
    });
  });
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error("connect failed")));
  });
}

test("live host serves a game backend end-to-end", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oxlive-run-"));
  try {
    await put(path.join(dir, "OxAlpha", "Demo", "Hermes", "index.html"), "<!doctype html>");
    await put(path.join(dir, "OxAlpha", "Demo", "Hermes", "arcade.json"),
      JSON.stringify({ title: "Demo", multiplayer: { endpoint: "/ws/demo" } }));
    await put(path.join(dir, "OxAlpha", "Demo", "Hermes", "server.mjs"), `
export default {
  maxSockets: 8,
  create(ctx) {
    const peers = new Set();
    return {
      open(ws) {
        peers.add(ws);
        ws.send({ op: "hello", you: ws.id });
        ctx.log("open", ws.id);
      },
      message(ws, msg) {
        if (!msg || typeof msg !== "object") return;
        if (msg.op === "echo") { ctx.log("echo"); ws.send({ op: "echo", got: msg }); }
        else if (msg.op === "say") { ctx.log("say"); for (const p of peers) if (p !== ws) p.send({ op: "said", text: msg.text }); }
        else if (msg.op === "count") { ctx.log("count"); ws.send({ op: "count", n: peers.size }); }
        else if (msg.op === "startTick") this.tickMs = 60;
      },
      close(ws) { peers.delete(ws); },
      tick() {},
      stop() {},
    };
  },
};`);

    const inst = await start({ port: 0, dir, pollSec: 10 });
    t.after(async () => { await inst.close(); });
    const base = `http://127.0.0.1:${inst.port}`;

    const health = await (await fetch(base + "/ws/_health")).json();
    assert.equal(health.ok, true);
    const demo = health.games.find((g) => g.route === "/ws/demo");
    assert.ok(demo, "demo registered");
    assert.equal(demo.healthy, true);
    assert.equal(demo.title, "Demo");

    const nf = await fetch(base + "/ws/nope");
    assert.equal(nf.status, 404);

    const a = await openWs(`ws://127.0.0.1:${inst.port}/ws/demo?room=r1`);
    const helloA = await onceMessage(a, (m) => m.op === "hello");
    assert.ok(helloA.you);

    const b = await openWs(`ws://127.0.0.1:${inst.port}/ws/demo?room=r1`);
    await onceMessage(b, (m) => m.op === "hello");

    a.send(JSON.stringify({ op: "echo", x: 42 }));
    const echo = await onceMessage(a, (m) => m.op === "echo");
    assert.equal(echo.got.x, 42);

    a.send(JSON.stringify({ op: "say", text: "hi b" }));
    const said = await onceMessage(b, (m) => m.op === "said");
    assert.equal(said.text, "hi b");

    a.send(JSON.stringify({ op: "count" }));
    const count = await onceMessage(a, (m) => m.op === "count");
    assert.equal(count.n, 2);

    b.close();
    // poll instead of assuming close-processing latency
    let nAfterClose = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      a.send(JSON.stringify({ op: "count" }));
      const c = await onceMessage(a, (m) => m.op === "count");
      nAfterClose = c.n;
      if (nAfterClose === 1) break;
    }
    assert.equal(nAfterClose, 1);

    a.close();

    const h2 = await (await fetch(base + "/ws/_health")).json();
    assert.equal(h2.games.find((g) => g.route === "/ws/demo").sockets, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
