"use strict";
// EpicBench server — zero-dependency http server.
// Routes:
//   GET  /                 -> public/index.html
//   GET  /style.css /app.js-> static
//   GET  /api/builds       -> scan JSON
//   POST /api/thumb/:id    -> regenerate one thumbnail (sync, slow)
//   POST /api/reveal/:id   -> open build folder in Explorer
//   GET  /play/:id/...     -> serve files from that build's folder (sandboxed)
//   GET  /media/:id/...    -> same sandbox, used for screenshot galleries
//   GET  /thumbs/<id>.png|json -> generated thumbnails
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("path");
const { spawn } = require("node:child_process");

const OX = process.env.OX_DIR ||
  [path.join(__dirname, "..", "ox-arcade"), path.resolve(__dirname, "..", "..", "ox-arcade")]
    .find((c) => { try { require.resolve(path.join(c, "lib", "scan.js")); return true; } catch { return false; } });
if (!OX) throw new Error("ox-arcade lib not found (set OX_DIR or place ox-arcade next to EpicBench)");
const { scanBuilds, HARNESS_META } = require(path.join(OX, "lib", "scan.js"));
const { captureThumb, resolveBuildDir, thumbsDirFor, startThumbSweep } = require(path.join(OX, "lib", "thumbs.js"));
const arcade = require(path.join(OX, "lib", "arcade.js"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".wav": "audio/wav", ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function notFound(res) { sendJson(res, 404, { error: "not found" }); }
function forbidden(res) { sendJson(res, 403, { error: "forbidden" }); }

// Serve baseDir + relParts after containment check. relParts are raw
// path segments (still percent-encoded); decoded here one by one.
async function serveFrom(baseDir, relParts, res) {
  let abs;
  try {
    abs = path.resolve(path.join(baseDir, ...relParts.map(decodeURIComponent)));
  } catch { return notFound(res); }
  const absBase = path.resolve(baseDir);
  if (abs !== absBase && !abs.startsWith(absBase + path.sep)) return forbidden(res);

  let st;
  try { st = await fsp.stat(abs); } catch { return notFound(res); }

  if (st.isDirectory()) {
    try { await fsp.access(path.join(abs, "index.html")); }
    catch { return notFound(res); }
    return serveFrom(baseDir, [...relParts, "index.html"], res);
  }

  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": st.size,
    "Cache-Control": "no-cache",
  });
  if (req_wants_head) { res.end(); return; }
  fs.createReadStream(abs).pipe(res);
}
let req_wants_head = false;

// Proxy /Tracker/api/* to the python tracker API (reads + writes alike).
function proxyTrackerApi(req, res, restWithApi, upstream, res_util) {
  const target = new URL(upstream);
  const rel = restWithApi.replace(/^\/api/, "/api");
  const preq = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: rel + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""),
      headers: { ...req.headers, host: `${target.hostname}:${target.port || 80}` },
    },
    (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    }
  );
  preq.on("error", () => {
    try { res_util(res, 502, { error: "tracker api offline (" + upstream + ")" }); } catch {}
  });
  req.pipe(preq);
}

// Scan cache: /api/builds answers instantly whenever any scan has completed
// before — a due refresh runs in the background (stale-while-revalidate) and
// the result is also persisted to disk so server restarts are instant.
const SCAN_TTL = 300_000;
const SCANNER_VERSION = 2;   // bump to invalidate every cached scan
const crypto = require("node:crypto");
function cacheFileFor(archiveRoot, root) {
  const hash = crypto.createHash("md5").update(path.resolve(root)).digest("hex").slice(0, 10);
  return path.join(archiveRoot, ".archive", `scan-cache-${hash}.json`);
}
function makeBuildsCache(root, opts = {}) {
  const c = { root, data: null, inflight: null, last: 0 };
  const cacheFile = opts.cacheFile || null;
  if (cacheFile) {
    try {
      const j = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (j && j.version === SCANNER_VERSION && Array.isArray(j.builds) && j.builds.length) {
        c.data = j.builds;
        c.last = j.savedAt || 0;
      }
    } catch { /* no cache yet */ }
  }
  c.refresh = function () {
    if (c.inflight) return c.inflight;
    c.inflight = scanBuilds(c.root)
      .then((builds) => {
        c.data = builds; c.last = Date.now();
        if (cacheFile) {
          try {
            fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify({ version: SCANNER_VERSION, savedAt: c.last, builds }));
          } catch { /* best effort */ }
        }
        return builds;
      })
      .catch(() => c.data || [])
      .finally(() => { c.inflight = null; });
    return c.inflight;
  };
  c.get = async function () {
    if (c.data && Date.now() - c.last < SCAN_TTL) return c.data;
    if (!c.data) return await c.refresh();   // cold start: must wait once
    c.refresh();                             // stale: serve now, refresh behind
    return c.data;
  };
  c.peek = () => c.data;
  return c;
}

async function handleApi(req, res, url, ctx) {
  // Prefix every URL the API returns so the frontend can use them as-is,
  // whatever subpath the app is mounted under.
  const P = (p) => p ? (ctx.basePath || "") + p : p;
  const Pthumb = (t) => t && typeof t === "string" ? P(t) : t;
  if (url.pathname === "/api/builds" && req.method === "GET") {
    const builds = await ctx.buildsCache.get();
    const prefixed = builds.map((b) => ({
      ...b,
      url: P(b.url),
      thumb: Pthumb(b.thumb),
      shots: (b.shots || []).map(P),
    }));
    return sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      count: prefixed.length,
      harnessMeta: HARNESS_META,
      builds: prefixed,
      ...ctx.buildsExtra(),
    });
  }

  let m;
  if ((m = url.pathname.match(/^\/api\/thumb\/([\w-]+)$/))) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
    const result = await captureThumb(ctx.archiveRoot, ctx.root, m[1], { httpBase: ctx.httpBase });
    if (!result.ok) return sendJson(res, 500, { error: result.error || "thumbnail capture failed" });
    return sendJson(res, 200, { ok: true, meta: result.meta });
  }

  // health: arcade scan state + tracker upstream reachability
  if (url.pathname === "/api/health" && req.method === "GET") {
    const builds = ctx.buildsCache.peek();
    let tracker = { ok: false };
    try {
      const upstream = new URL(ctx.trackerUpstream);
      const probe = await new Promise((resolve) => {
        const preq = http.request({ host: upstream.hostname, port: upstream.port || 80, path: "/api/meta", method: "GET", timeout: 4000 }, (pres) => { pres.resume(); resolve(pres.statusCode); });
        preq.on("error", () => resolve(0));
        preq.on("timeout", () => { preq.destroy(); resolve(0); });
        preq.end();
      });
      tracker = { ok: probe >= 200 && probe < 500, status: probe || null, upstream: ctx.trackerUpstream };
    } catch (e) { tracker = { ok: false, error: String(e && e.message || e) }; }
    let thumbs = null;
    try {
      thumbs = (await fsp.readdir(thumbsDirFor(ctx.archiveRoot))).filter((f) => f.endsWith(".png")).length;
    } catch { thumbs = 0; }
    return sendJson(res, 200, {
      ok: !!builds && tracker.ok,
      arcade: { builds: builds ? builds.length : 0, cacheAgeMs: ctx.buildsCache.peek() ? Date.now() - (ctx.buildsCache.last || 0) : null, thumbs },
      tracker,
      uptimeSec: Math.round(process.uptime()),
    });
  }

  if ((m = url.pathname.match(/^\/api\/reveal\/([\w-]+)$/))) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
    const dir = await resolveBuildDir(ctx.root, m[1]);
    if (!dir) return notFound(res);
    spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === "/api/sync" && req.method === "POST") {
    const st = ctx.arcadeState();
    if (!st.enabled) return sendJson(res, 403, { error: "sync disabled" });
    const result = await arcade.sync(st.dir, {});
    st.last = result;
    return sendJson(res, result.ok ? 200 : 500, {
      ok: result.ok, head: result.head, count: result.games.length,
      syncedAt: result.syncedAt, error: result.error || undefined,
    });
  }

  return notFound(res);
}

function start(opts = {}) {
  // games root defaults to the great-grandparent (local layout); deployments
  // set ARCHIVE_ROOT explicitly (e.g. the repo checkout on kvm2).
  const root = opts.root || process.env.ARCHIVE_ROOT ||
    path.resolve(__dirname, "..", "..");
  // thumbs + arcade repo live with the ox-arcade checkout (env wins)
  const archiveRoot = opts.archiveRoot || process.env.ARCHIVE_ARCHIVE_ROOT || OX;
  // The arcade app mounts under /Arcade; tracker under /Tracker; landing at /.
  const basePath = (opts.basePath != null ? opts.basePath : (process.env.ARCHIVE_BASE_PATH || "/Arcade"))
    .replace(/\/+$/, "");
  const trackerDir = opts.trackerDir || process.env.TRACKER_DIR ||
    path.resolve(__dirname, "..", "OxAlphaTracker");
  const trackerUpstream = opts.trackerUpstream || process.env.TRACKER_API_UPSTREAM ||
    `http://127.0.0.1:${process.env.TRACKER_API_PORT || 8932}`;
  const state = { server: null, port: null, close: null };

  // --- EpicArcade sync state (off unless opts.sync / ARCHIVE_SYNC=1) ---
  const syncEnabled = !!(opts.sync ?? /^(1|true|yes)$/i.test(process.env.ARCHIVE_SYNC || ""));
  const arcadeState = {
    enabled: syncEnabled,
    dir: opts.arcadeDir || process.env.ARCHIVE_ARCADE_DIR ||
      path.join(archiveRoot, ".archive", "arcade-repo"),
    last: null,
    pollMs: Number(process.env.ARCHIVE_POLL_MIN || 15) * 60000,
    timer: null,
  };
  const buildsCache = makeBuildsCache(root, {
    cacheFile: cacheFileFor(archiveRoot, root),
  });

  const server = http.createServer(async (req, res) => {
    let url = new URL(req.url, "http://x");
    // Reverse-proxy subpath support: strip BASE_PATH ("/Arcade") so the
    // app always sees root-relative paths internally.
    let strippedArcade = false;
    if (basePath && (url.pathname === basePath || url.pathname.startsWith(basePath + "/"))) {
      url = new URL(url.pathname.slice(basePath.length) || "/", url.href);
      strippedArcade = true;
    }
    req_wants_head = req.method === "HEAD";
    try {
      // Generated per request: tells the frontend its own base path.
      if (url.pathname === "/config.js") {
        const body = `window.OX_CONFIG = { basePath: ${JSON.stringify(basePath)} };`;
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(body);
        return;
      }

      // ---- Tracker mount: static files + API proxy ----
      if (url.pathname === "/Tracker" || url.pathname.startsWith("/Tracker/")) {
        const rest = url.pathname.slice("/Tracker".length) || "/";
        if (rest === "/api" || rest.startsWith("/api/")) {
          return proxyTrackerApi(req, res, rest, trackerUpstream, sendJson);
        }
        req_wants_head = false;
        const rel = rest === "/" ? ["index.html"] : rest.slice(1).split("/").filter(Boolean);
        return await serveFrom(trackerDir, rel.length ? rel : ["index.html"], res);
      }
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(req, res, url, {
          root, archiveRoot,
          httpBase: state.port ? `http://127.0.0.1:${state.port}` : null,
          buildsCache,
          basePath,
          trackerUpstream,
          arcadeState: () => arcadeState,
          buildsExtra: () => {
            if (!(arcadeState.enabled && arcadeState.last)) return {};
            const P = (p) => p ? (basePath || "") + p : p;
            const games = arcadeState.last.games.map((g) => ({
              ...g,
              url: g.url ? P(g.url) : g.url,
              thumb: g.thumb ? (g.thumb.startsWith("/") ? P(g.thumb) : g.thumb) : g.thumb,
            }));
            return { arcade: { enabled: true, syncedAt: arcadeState.last.syncedAt, head: arcadeState.last.head, games } };
          },
        });
      }

      let m;
      if ((m = url.pathname.match(/^\/play\/([\w-]+)(\/.*)?$/)) ||
          (m = url.pathname.match(/^\/media\/([\w-]+)(\/.*)?$/))) {
        const dir = await resolveBuildDir(root, m[1]);
        if (!dir) return notFound(res);
        const rel = (m[2] || "/").slice(1).split("/").filter(Boolean);
        return await serveFrom(dir, rel.length ? rel : ["index.html"], res);
      }

      // EpicArcade route: /<Model>/<Project>/<Harness>/... (sync mode only)
      const seg = url.pathname.split("/").filter(Boolean);
      if (arcadeState.enabled && seg.length >= 3 &&
          !["api", "play", "thumbs", "media"].includes(seg[0])) {
        const gameDir = path.join(arcadeState.dir, seg[0], seg[1], seg[2]);
        const rel = seg.slice(3);
        return await serveFrom(gameDir, rel.length ? rel : ["index.html"], res);
      }

      if ((m = url.pathname.match(/^\/thumbs\/([\w-]+)\.(png|json)$/))) {
        return await serveFrom(
          thumbsDirFor(archiveRoot),
          [`${m[1]}.${m[2]}`], res
        );
      }

      // landing page (true root only — the /Arcade strip owns "/")
      if (!strippedArcade && (url.pathname === "/" || url.pathname === "/index.html")) {
        req_wants_head = false;
        return await serveFrom(path.join(__dirname, "public"), ["index.html"], res);
      }
      if (!strippedArcade && (url.pathname === "/site.css" || url.pathname === "/site.js")) {
        req_wants_head = false;
        return await serveFrom(path.join(__dirname, "public"), [url.pathname.slice(1)], res);
      }

      // arcade static frontend (reached with the /Arcade prefix stripped)
      if (url.pathname === "/" || url.pathname === "/index.html") {
        req_wants_head = false;
        return await serveFrom(path.join(OX, "public"), ["index.html"], res);
      }
      if (url.pathname === "/style.css" || url.pathname === "/app.js") {
        req_wants_head = false;
        return await serveFrom(path.join(OX, "public"), [url.pathname.slice(1)], res);
      }
      return notFound(res);
    } catch (err) {
      try { sendJson(res, 500, { error: String(err && err.message || err) }); } catch {}
    }
  });

  return new Promise((resolve, reject) => {
    const wantPort = opts.port ?? Number(process.env.ARCHIVE_PORT || 8795);
    let port = wantPort;
    let fellBack = false;
    const host = process.env.ARCHIVE_HOST || "127.0.0.1";
    server.listen(port, host, async () => {
      const addr = server.address();
      state.port = typeof addr === "object" && addr ? addr.port : port;
      state.server = server;
      state.close = () => new Promise((done) => {
        if (arcadeState.timer) clearInterval(arcadeState.timer);
        server.close(done);
      });
      console.log(`epicbench running at http://127.0.0.1:${state.port}  (games root: ${root}${syncEnabled ? ", sync: on" : ""})`);
      // prime the scan cache so the first page load is already warm
      buildsCache.get().catch(() => {});
      if (syncEnabled) {
        // initial sync BEFORE the server reports ready, then poll; unref'd timer
        const tick = async () => { arcadeState.last = await arcade.sync(arcadeState.dir, {}); };
        const boot = () => { arcadeState.timer = setInterval(tick, arcadeState.pollMs); arcadeState.timer.unref?.(); };
        await tick().then(boot, boot);
      }
      resolve(state);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && wantPort === 8795 && !fellBack) {
        fellBack = true;
        port = 8796;
        server.listen(port, process.env.ARCHIVE_HOST || "127.0.0.1");
        return;
      }
      reject(err);
    });
  });
}

if (require.main === module) {
  start({});
}

module.exports = { start };
