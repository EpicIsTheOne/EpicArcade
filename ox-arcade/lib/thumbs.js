"use strict";
// Thumbnail generation via headless Edge/Chrome. Shared by server.js
// (POST /api/thumb/:id) and scripts/thumbs.js (bulk CLI).
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("path");
const { spawn } = require("node:child_process");

const BROWSER_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];

function findBrowser() {
  if (process.env.ARCHIVE_BROWSER && fs.existsSync(process.env.ARCHIVE_BROWSER)) {
    return process.env.ARCHIVE_BROWSER;
  }
  return BROWSER_CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

function captureOnce(browser, targetUrl, outPng, waitMs, profileDir) {
  return new Promise((resolve) => {
    const args = [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--window-size=1280,720", `--user-data-dir=${profileDir}`,
      `--virtual-time-budget=${waitMs}`, "--timeout=30000",
      `--screenshot=${outPng}`, targetUrl,
    ];
    const proc = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errTail = "";
    proc.stderr.on("data", (d) => { errTail = (errTail + d.toString()).slice(-400); });
    const killTimer = setTimeout(() => {
      // kill the whole tree — proc.kill() alone spares Edge's render children
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        try { proc.kill("SIGKILL"); } catch {}
      }
    }, 75000);
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      resolve({ code, errTail });
    });
  });
}

// Edge's launcher can exit before its render child flushes the PNG.
// Poll until the file exists and its size stabilizes (or give up).
async function waitForSettled(p, maxMs = 15000) {
  const t0 = Date.now();
  let lastSize = -1;
  while (Date.now() - t0 < maxMs) {
    try {
      const st = await fsp.stat(p);
      if (st.size > 0 && st.size === lastSize) return true;
      lastSize = st.size;
    } catch { lastSize = -1; }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function looksLikePng(p) {
  try {
    const st = await fsp.stat(p);
    if (st.size <= 5120) return false;
    const fd = await fsp.open(p, "r");
    const buf = Buffer.alloc(8);
    await fd.read(buf, 0, 8, 0);
    await fd.close();
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  } catch { return false; }
}

// Resolve /play/<slug> id -> build dir (same slug rule as scan.js).
async function resolveBuildDir(root, id) {
  const children = await fsp.readdir(root, { withFileTypes: true });
  for (const c of children) {
    if (!c.isDirectory()) continue;
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug === id) return path.join(root, c.name);
  }
  return null;
}

/**
 * Capture one build thumbnail.
 * @returns {Promise<{ok:boolean, meta?:object, error?:string}>}
 */
function thumbsDirFor(archiveRoot) {
  return process.env.ARCHIVE_THUMBS_DIR || path.join(archiveRoot, ".archive", "thumbs");
}

async function captureThumb(archiveRoot, root, id, opts = {}) {
  const thumbsDir = thumbsDirFor(archiveRoot);
  await fsp.mkdir(thumbsDir, { recursive: true });
  const failedMarker = path.join(thumbsDir, `${id}.failed`);
  try { await fsp.rm(failedMarker, { force: true }); } catch {}

  const { scanBuilds } = require("./scan");
  const builds = opts.builds || await scanBuilds(root);
  const b = builds.find((x) => x.id === id);
  if (!b) return { ok: false, error: "build not found" };
  if (!b.entry) return { ok: false, error: "build has no entry point" };

  const browser = findBrowser();
  if (!browser) {
    await fsp.writeFile(failedMarker, "no Edge/Chrome found");
    return { ok: false, error: "no browser found" };
  }

  const dir = await resolveBuildDir(root, id);
  const fileUrl = "file:///" + encodeURI(path.join(dir, b.entry).replace(/\\/g, "/"));
  const targets = [];
  if (opts.httpBase) targets.push(`${opts.httpBase}/play/${id}/${encodeURI(b.entry)}`);
  targets.push(fileUrl); // always fall back to file://

  // Unique profile per attempt: a leftover Edge instance holding a reused
  // profile dir makes new launches delegate to it and exit without shooting.
  const profBase = path.join(archiveRoot, ".archive", "_prof");
  await fsp.mkdir(profBase, { recursive: true });
  const outPng = path.join(thumbsDir, `${id}.png`);
  let lastErr = "capture produced no usable png";
  let errTail = "none";
  const usedProfiles = [];

  try {
    for (const target of targets) {
      const profileDir = path.join(profBase, `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      usedProfiles.push(profileDir);
      try { await fsp.rm(outPng, { force: true }); } catch {} // no stale file may pass the check
      const { code, errTail: tail } = await captureOnce(browser, target, outPng, b.thumbWaitMs || 9000, profileDir);
      errTail = tail || "none";
      await waitForSettled(outPng); // Edge writes the PNG after its launcher exits
      if (await looksLikePng(outPng)) {
        const meta = {
          capturedAt: new Date().toISOString(),
          w: 1280, h: 720,
          source: target.startsWith("http") ? "headless-http" : "headless-file",
          entry: b.entry,
        };
        await fsp.writeFile(path.join(thumbsDir, `${id}.json`), JSON.stringify(meta));
        return { ok: true, meta };
      }
      lastErr = `exit=${code} err=${errTail ? "…" : "none"}`;
    }
  } finally {
    // parallel-safe: only clean up THIS capture's profiles, never the shared root
    for (const p of usedProfiles) {
      try { await fsp.rm(p, { recursive: true, force: true }); } catch {}
    }
  }
  try { await fsp.rm(outPng, { force: true }); } catch {}
  await fsp.writeFile(failedMarker, lastErr);
  return { ok: false, error: lastErr };
}

module.exports = { captureThumb, findBrowser, resolveBuildDir, captureOnce, waitForSettled, thumbsDirFor, startThumbSweep };

// Background thumbnail sweeper: after each scan, capture a few missing
// thumbnails per hour (never touches builds with a .failed marker — those
// failed headless capture before and would just burn browser launches).
function startThumbSweep(archiveRoot, getBuilds, opts = {}) {
  const PER_RUN = opts.perRun || 3;
  const INTERVAL = opts.intervalMs || 30 * 60 * 1000;
  let running = false;
  async function sweep() {
    if (running) return;
    running = true;
    try {
      const builds = (getBuilds() || []).filter((b) => b.status === "playable" && b.entry);
      const thumbsDir = thumbsDirFor(archiveRoot);
      const missing = [];
      for (const b of builds) {
        try {
          await fsp.access(path.join(thumbsDir, `${b.id}.png`));
          continue; // has thumb
        } catch { /* missing */ }
        try {
          await fsp.access(path.join(thumbsDir, `${b.id}.failed`));
          continue; // known-unrollable, don't retry
        } catch { /* retryable */ }
        missing.push(b);
        if (missing.length >= PER_RUN) break;
      }
      if (!missing.length) return;
      const browser = findBrowser();
      if (!browser) return;
      const root = opts.root;
      for (const b of missing) {
        const res = await captureThumb(archiveRoot, root, b.id, { builds }).catch(() => ({ ok: false }));
        console.log(`[thumb-sweep] ${b.id}: ${res.ok ? "ok" : "failed"}`);
      }
    } catch (e) {
      console.log(`[thumb-sweep] error: ${e && e.message || e}`);
    } finally {
      running = false;
    }
  }
  const timer = setInterval(sweep, INTERVAL);
  if (timer.unref) timer.unref();
  setTimeout(sweep, 20_000).unref?.();
  return sweep;
}
