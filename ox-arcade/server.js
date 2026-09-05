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

const { scanBuilds, HARNESS_META } = require("./lib/scan");
const { captureThumb, resolveBuildDir, thumbsDirFor, startThumbSweep } = require("./lib/thumbs");
const arcade = require("./lib/arcade");

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
  // games root defaults to the parent of goal-archive/
  const root = opts.root || process.env.ARCHIVE_ROOT ||
    path.resolve(__dirname, "..");
  const archiveRoot = opts.archiveRoot || __dirname;
  // Subpath deployment prefix ("" locally, "/OxArcade" behind traefik).
  const basePath = (opts.basePath != null ? opts.basePath : (process.env.ARCHIVE_BASE_PATH || ""))
    .replace(/\/+$/, "");
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

  // background thumbnail sweep — fills in a few missing thumbs per hour
  // (skips builds with a .failed marker; headless-unrenderable games)
  if (!process.env.ARCHIVE_NO_THUMB_SWEEP) {
    startThumbSweep(archiveRoot, () => buildsCache.peek(), { root });
  }

  const server = http.createServer(async (req, res) => {
    let url = new URL(req.url, "http://x");
    // Reverse-proxy subpath support: strip BASE_PATH ("/OxArcade") so the
    // app always sees root-relative paths internally.
    if (basePath && (url.pathname === basePath || url.pathname.startsWith(basePath + "/"))) {
      url = new URL(url.pathname.slice(basePath.length) || "/", url.href);
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
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(req, res, url, {
          root, archiveRoot,
          httpBase: state.port ? `http://127.0.0.1:${state.port}` : null,
          buildsCache,
          basePath,
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

      // static frontend
      if (url.pathname === "/" || url.pathname === "/index.html") {
        req_wants_head = false;
        return await serveFrom(path.join(__dirname, "public"), ["index.html"], res);
      }
      if (url.pathname === "/style.css" || url.pathname === "/app.js") {
        req_wants_head = false;
        return await serveFrom(path.join(__dirname, "public"), [url.pathname.slice(1)], res);
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
        server.listen(port, "127.0.0.1");
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
