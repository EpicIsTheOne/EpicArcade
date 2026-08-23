"use strict";
// Ox Live — one shared realtime host for every EpicArcade game that ships a
// server.mjs backend. Serves wss://<host>/ws/<project> and hot-loads modules
// from the synced arcade repo. Zero dependencies; in-process isolation with
// per-game circuit breakers (heavy games should graduate to their own
// container — see README).
//
// Module contract (ox-live/server.mjs):
//   export default {
//     maxSockets: 64,               // optional per-game cap (default 64)
//     tickMs: 1000,                 // optional interval for handler.tick()
//     create(ctx) {                 // ctx: { log }
//       return {
//         open(ws) {},              // ws = { id, route, query, ip, send(), close() }
//         message(ws, msg) {},      // msg = parsed JSON object, else raw string
//         close(ws) {},
//         tick() {},                // optional, fired every tickMs while sockets exist
//         stop() {},                // optional, called on unload/shutdown
//       };
//     },
//   }

const http = require("node:http");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { handshake } = require("./lib/ws");
const { scanGames } = require("./lib/loader");

const HEALTH_ROUTE = "/ws/_health";

function start(opts = {}) {
  const PORT = Number(opts.port ?? process.env.LIVE_PORT ?? 8090);
  const DIR = opts.dir || process.env.LIVE_DIR || "/data/arcade-repo";
  const POLL_MS = Math.max(10, Number(opts.pollSec ?? process.env.LIVE_POLL_SEC ?? 30)) * 1000;
  const GLOBAL_CAP = Number(process.env.LIVE_MAX_SOCKETS || 512);

  const games = new Map(); // route -> record
  const live = new Set(); // active WsConn objects (for heartbeat sweeping)
  let seq = 0;
  let scanTimer = null;
  let sweepTimer = null;
  let closing = false;

  function log(...a) { console.log("[oxlive]", ...a); }

  async function loadGame(entry) {
    const g = {
      ...entry,
      healthy: false,
      error: null,
      mod: null,
      handler: null,
      sockets: new Set(),
      errTimes: [],
      tickTimer: null,
      loadedAt: null,
    };
    games.set(g.route, g);
    try {
      await activate(g);
      log("loaded", g.route, `(${g.sockets.size} sockets)`, g.file);
    } catch (e) {
      g.error = String(e && e.message || e);
      log("FAILED", g.route, "-", g.error);
    }
    return g;
  }

  async function activate(g) {
    const mod = await import(pathToFileURL(g.file).href + "?t=" + Date.now());
    const def = mod.default;
    if (!def || typeof def.create !== "function") throw new Error("server.mjs must default-export create()");
    const ctx = { log: (...a) => console.log(`[${g.route}]`, ...a) };
    const handler = await def.create(ctx);
    if (!handler || typeof handler !== "object") throw new Error("create() must return a handler object");
    g.mod = def;
    g.handler = handler;
    g.error = null;
    g.healthy = true;
    g.errTimes = [];
    g.loadedAt = Date.now();
    if (typeof handler.tick === "function") {
      const ms = Math.max(50, Number(def.tickMs) || 1000);
      g.tickTimer = setInterval(() => {
        if (!g.sockets.size) return;
        safe(g, () => handler.tick());
      }, ms);
    }
  }

  // Circuit breaker: >=10 handler errors within 60s unloads the game.
  function safe(g, fn) {
    try {
      return fn();
    } catch (e) {
      const now = Date.now();
      g.errTimes = g.errTimes.filter((t) => now - t < 60000);
      g.errTimes.push(now);
      console.error(`[${g.route}] handler error:`, e && e.message);
      if (g.errTimes.length >= 10) {
        g.healthy = false;
        g.error = "circuit breaker: repeated handler errors";
        for (const ws of [...g.sockets]) { ws.close(1011); g.sockets.delete(ws); }
        stopTick(g);
        log("UNLOADED after repeated errors:", g.route);
      }
      return undefined;
    }
  }

  function stopTick(g) {
    if (g.tickTimer) { clearInterval(g.tickTimer); g.tickTimer = null; }
  }

  async function unloadGame(g, reason) {
    stopTick(g);
    try { g.handler && g.handler.stop && g.handler.stop(); } catch {}
    for (const ws of [...g.sockets]) { ws.close(1001); g.sockets.delete(ws); }
    games.delete(g.route);
    if (reason) log("unloaded", g.route, "-", reason);
  }

  async function rescan() {
    if (closing) return;
    let found;
    try { found = await scanGames(DIR); } catch (e) { log("scan failed:", e.message); return; }
    const seen = new Map(found.map((f) => [f.route, f]));
    for (const entry of found) {
      const cur = games.get(entry.route);
      if (!cur) await loadGame(entry);
      else if (cur.mtimeMs !== entry.mtimeMs) {
        cur.mtimeMs = entry.mtimeMs;
        stopTick(cur);
        try { cur.handler && cur.handler.stop && cur.handler.stop(); } catch {}
        for (const ws of [...cur.sockets]) cur.sockets.delete(ws); // sockets stay open; reattach below
        try {
          await activate(cur);
          log("reloaded", cur.route);
        } catch (e) {
          cur.healthy = false;
          cur.error = String(e && e.message || e);
          log("reload FAILED", cur.route, "-", cur.error);
        }
      }
    }
    for (const [route, g] of [...games]) {
      if (!seen.has(route)) await unloadGame(g, "no longer declared in repo");
    }
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (u.pathname === HEALTH_ROUTE) {
      json(res, 200, {
        ok: true,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        games: [...games.values()].map((g) => ({
          route: g.route, title: g.title, model: g.model,
          project: g.project, harness: g.harness,
          healthy: g.healthy, sockets: g.sockets.size,
          error: g.error || undefined,
        })),
      });
      return;
    }
    const g = games.get(u.pathname.replace(/\/+$/, ""));
    if (g) {
      json(res, 200, { route: g.route, title: g.title, healthy: g.healthy, sockets: g.sockets.size, websocket: true });
      return;
    }
    if (u.pathname.startsWith("/ws/")) json(res, 404, { error: "no live backend on this route" });
    else json(res, 404, { error: "not found", hint: HEALTH_ROUTE });
  });

  server.on("upgrade", (req, sock, head) => {
    const u = new URL(req.url, "http://x");
    const route = u.pathname.replace(/\/+$/, "");
    if (closing) { sock.destroy(); return; }
    const g = games.get(route);
    if (!g || !g.healthy || !g.handler) {
      sock.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      sock.destroy();
      return;
    }
    if (g.sockets.size >= (Number(g.mod.maxSockets) || 64)) {
      sock.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      sock.destroy();
      return;
    }
    if ([...games.values()].reduce((n, x) => n + x.sockets.size, 0) >= GLOBAL_CAP) {
      sock.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      sock.destroy();
      return;
    }
    const conn = handshake(req, sock, head);
    if (!conn) return;
    live.add(conn);

    const ws = {
      id: ++seq,
      route: g.route,
      query: u.searchParams,
      ip: req.socket.remoteAddress,
      send: (data) => { if (process.env.LIVE_DEBUG) console.error(`[dbg] ->#${ws.id}`, JSON.stringify(data).slice(0, 80)); return conn.send(data); },
      close: (code) => conn.close(code),
    };
    g.sockets.add(ws);

    conn.onmessage = (data, kind) => {
      if (process.env.LIVE_DEBUG) console.error(`[dbg] <-#${ws.id} kind=${kind}`, String(data).slice(0, 80));
      // Normalize: JSON objects when parseable; strings otherwise. Buffers are
      // decoded as UTF-8 first so a mis-classified frame still delivers JSON.
      let msg = data;
      const s = typeof data === "string" ? data
        : (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) ? Buffer.from(data).toString("utf8")
        : null;
      if (s != null) {
        try { msg = JSON.parse(s); } catch { msg = s; }
      }
      safe(g, () => g.handler.message && g.handler.message(ws, msg));
    };
    const handlerClose = () => {
      live.delete(conn);
      if (!g.sockets.has(ws)) return;
      g.sockets.delete(ws);
      safe(g, () => g.handler.close && g.handler.close(ws));
    };
    conn.onclose = handlerClose;
    safe(g, () => g.handler.open && g.handler.open(ws));
  });

  function json(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  }

  const startedAt = Date.now();

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      const port = server.address().port;
      scanTimer = setInterval(rescan, POLL_MS);
      scanTimer.unref?.();
      sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const conn of [...live]) {
          if (now - conn.lastSeen > 90000) { conn.close(1001); continue; }
          if (now - conn.lastSeen > 25000) conn.ping();
        }
      }, 15000);
      sweepTimer.unref?.();
      rescan().then(() => {
        log(`ox-live running on :${port} (dir: ${DIR}, ${games.size} game(s))`);
        resolve({
          port,
          games,
          async close() {
            closing = true;
            clearInterval(scanTimer); clearInterval(sweepTimer);
            for (const g of [...games.values()]) await unloadGame(g, "shutdown");
            await new Promise((r) => server.close(r));
          },
        });
      });
    });
  });
}

if (require.main === module) start({}).catch((e) => {
  console.error("[oxlive] fatal:", e);
  process.exit(1);
});

module.exports = { start };
