"use strict";
// EpicArcade sync core: clone/pull github.com/EpicIsTheOne/EpicArcade, parse
// its <Model>/<Project>/<Harness>/ layout (the layout IS the URL), read the
// repo-root deployed.json registry. No domain is ever hardcoded here.
const fsp = require("node:fs/promises");
const path = require("path");
const { spawn } = require("node:child_process");
const { findEntry, deriveHarness, multiplayerFor } = require("./scan");

const DEFAULT_REPO = "https://github.com/EpicIsTheOne/EpicArcade";

function slugOk(s) {
  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(s);
}

function git(args, cwd, timeoutMs = 480000) {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    proc.stdout.on("data", (d) => { out += d; });
    proc.stderr.on("data", (d) => { err += d; });
    // Missing binary / spawn failure must degrade gracefully, never crash.
    proc.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -1, out: "", err: `spawn failed: ${e.message}` });
    });
    const t = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
}

// Clone if missing, else fast-forward pull. Never throws.
async function ensureRepo(dir, repoUrl) {
  const url = repoUrl || process.env.ARCHIVE_ARCADE_REPO || DEFAULT_REPO;
  try { await fsp.mkdir(path.dirname(dir), { recursive: true }); } catch {}
  let st;
  try { st = await fsp.stat(path.join(dir, ".git")); } catch { st = null; }
  if (!st) {
    const r = await git(["clone", "--depth", "1", url, dir]);
    if (r.code !== 0) return { ok: false, error: `clone failed: ${r.err.slice(-200)}` };
  } else {
    const r = await git(["pull", "--ff-only"], dir);
    if (r.code !== 0 && !/up.to date/i.test(r.out + r.err)) {
      return { ok: false, error: `pull failed: ${(r.err || r.out).slice(-200)}` };
    }
  }
  const head = await git(["rev-parse", "--short", "HEAD"], dir);
  return { ok: true, head: head.out || "?" };
}

// Walk <Model>/<Project>/<Harness>/ game dirs. Exactly three levels.
async function parseArcadeLayout(repoDir) {
  const games = [];
  let models;
  try { models = await fsp.readdir(repoDir, { withFileTypes: true }); }
  catch { return games; }
  for (const m of models) {
    if (!m.isDirectory() || m.name.startsWith(".") || m.name === "node_modules") continue;
    const modelDir = path.join(repoDir, m.name);
    let projects;
    try { projects = await fsp.readdir(modelDir, { withFileTypes: true }); } catch { continue; }
    for (const p of projects) {
      if (!p.isDirectory() || p.name.startsWith(".")) continue;
      const projDir = path.join(modelDir, p.name);
      let harnesses;
      try { harnesses = await fsp.readdir(projDir, { withFileTypes: true }); } catch { continue; }
      for (const h of harnesses) {
        if (!h.isDirectory() || h.name.startsWith(".")) continue;
        const gameDir = path.join(projDir, h.name);
        const route = `${m.name}/${p.name}/${h.name}`;
        if (!slugOk(m.name) || !slugOk(p.name) || !slugOk(h.name)) continue;

        const entry = await findEntry(gameDir);
        if (!entry) continue; // no playable html -> not an exhibit

        let meta = {};
        try { meta = JSON.parse(await fsp.readFile(path.join(gameDir, "arcade.json"), "utf8")) || {}; }
        catch {}

        let mtime = null;
        try { mtime = (await fsp.stat(path.join(gameDir, entry))).mtime.toISOString(); }
        catch {}

        // bracket tags may appear in the harness folder name too
        const bracketModel = (() => {
          const kv = h.name.match(/\[\s*model\s*[:=]\s*([^\]]+)\]/i);
          return kv ? kv[1].trim() : null;
        })();

        // arcade.json "multiplayer": true / false / {"endpoint": "/ws/..."}
        // (the object form declares multiplayer AND names its endpoint)
        const mpMeta = meta.multiplayer;
        const declared = typeof mpMeta === "object" && mpMeta !== null ? true : mpMeta;
        const endpoint = typeof mpMeta === "object" && mpMeta !== null ? mpMeta.endpoint : meta.multiplayerEndpoint;

        games.push({
          source: "remote",
          route,
          model: bracketModel || null,
          project: p.name,
          harness: deriveHarness(h.name),
          title: meta.title || p.name,
          description: meta.description || "",
          entry,
          url: `/${route}/${entry.split(/[\\/]+/).map(encodeURIComponent).join("/")}`,
          thumb: meta.thumb || null,       // remote absolute or repo-relative
          deployed: null,                  // filled by applyDeployments()
          mtime,
          multiplayer: await multiplayerFor(gameDir, { multiplayer: declared, endpoint }),
        });
      }
    }
  }
  games.sort((a, b) => a.route.localeCompare(b.route));
  return games;
}

// Read repo-root deployed.json -> { "<M>/<P>/<H>": "https://..." }. Absent => {}.
async function readDeployed(repoDir) {
  try {
    return JSON.parse(await fsp.readFile(path.join(repoDir, "deployed.json"), "utf8")) || {};
  } catch { return {}; }
}

// Pure merge used by the kvm2-side agent tooling and publish helper tests.
function mergeDeployed(current, additions) {
  return Object.assign({}, current, additions);
}

// Attach deployment URLs to parsed games.
function applyDeployments(games, deployedMap) {
  for (const g of games) g.deployed = deployedMap[g.route] || null;
  return games;
}

// One full sync pass. Safe to call repeatedly. A failed pull degrades to
// serving the last-known repo contents instead of nothing.
// Concurrent callers (tick + POST /api/sync) share one in-flight pass:
// interleaved git pull/checkout with parse could store a transient empty
// games list.
let _syncInFlight = null;
function sync(arcadeDir, opts = {}) {
  if (_syncInFlight) return _syncInFlight;
  _syncInFlight = (async () => {
    const ensured = await ensureRepo(arcadeDir, opts.repoUrl);
    const games = await parseArcadeLayout(arcadeDir);
    applyDeployments(games, await readDeployed(arcadeDir));
    const usable = ensured.ok || games.length > 0;
    return {
      ok: usable,
      head: ensured.head || null,
      error: usable ? undefined : ensured.error,
      games,
      syncedAt: new Date().toISOString(),
    };
  })();
  return _syncInFlight.finally(() => { _syncInFlight = null; });
}

module.exports = { slugOk, ensureRepo, parseArcadeLayout, readDeployed, mergeDeployed, applyDeployments, sync, DEFAULT_REPO };
