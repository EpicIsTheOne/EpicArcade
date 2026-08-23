"use strict";
// Build discovery over the games root. Pure logic — no HTTP, no globals.
const fs = require("node:fs/promises");
const path = require("path");

// ---- harness registry -------------------------------------------------------
// THE extension point: adding a future harness = add ONE row here (plus its
// regex line in deriveHarness). Frontend renders everything from this table
// via /api/builds; zero per-harness CSS/JS exists anywhere else.
const HARNESS_META = {
  "hermes":      { label: "HERMES",      glyph: "HM",     color: "#4da3ff" },
  "opencode":    { label: "OPENCODE",    glyph: "OC",     color: "#ffb454" },
  "codex":       { label: "CODEX",       glyph: "CX",     color: "#39d0c3" },
  "claude-code": { label: "CLAUDE CODE", glyph: "CC",     color: "#ff8a70" },
  "pi":          { label: "PI",          glyph: "\u03C0", color: "#f0a35e" },
  "server":      { label: "SERVER",      glyph: "SRV",    color: "#7ee787" },
};

function deriveHarness(name, override) {
  if (override) return override;
  if (/open[\s_-]?code/i.test(name)) return "opencode";
  if (/\bcodex\b/i.test(name)) return "codex";
  if (/\bclaude\b/i.test(name)) return "claude-code";
  if (/\bpi\b/i.test(name)) return "pi";
  if (/\bserver\b/i.test(name)) return "server";
  if (/hermes/i.test(name)) return "hermes";
  // Everything else is untagged. Deliberately NO ox-alpha rule: that model is
  // the baseline being tested across all builds, so tagging it carries zero info.
  return "none";
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
// Self-exclusion is identity-based: this app's own folder never exhibits
// itself, whatever it's called (goal-archive, ox-arcade, ...). "prompt-pack"
// is Epic's prompt library, not a game.
const SELF_DIRS = new Set(["goal-archive", "ox-arcade"]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ...SELF_DIRS, "prompt-pack"]);
const ENTRY_JUNK = new Set(["node_modules", ".git", ".archive"]);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Folder-name bracket tags: "<Title> [model=<id>] [<harness-key>] [run=<NN>]".
// Windows forbids ':' in dir names, so '=' is the canonical on-disk separator;
// ':' is accepted too (Linux repo names may use it). Legacy names (no brackets)
// parse to {model:null, title:null, harness:undefined, run:null} and flow
// through the legacy suffix rules untouched — no legacy marker anywhere.
function parseFolderMeta(name) {
  const out = { model: null, title: null, harness: undefined, run: null };
  const known = new Set(Object.keys(HARNESS_META));
  const brackets = [...name.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim());

  // legacy parenthetical "(ox-alpha)" — the model written in the title
  const paren = name.match(/\((ox[\s_-]?alpha)\)/i);
  if (paren) out.model = "ox-alpha";

  if (!brackets.length && !paren) return out;

  let title = name;
  for (const m of name.matchAll(/\[([^\]]*)\]/g)) {
    const raw = m[0];                 // full "[ ... ]" incl. inner whitespace
    const tag = m[1].trim();
    title = title.replace(raw, "");
    const kv = tag.match(/^model\s*[:=]\s*(.+)$/i);
    if (kv) { out.model = kv[1].trim(); continue; }
    const rv = tag.match(/^run\s*[:=]\s*(\d{1,3})$/i);
    if (rv) { out.run = Number(rv[1]); continue; }
    const key = tag.toLowerCase().replace(/\s+/g, "-");
    if (known.has(key)) out.harness = key;   // unknown bare words ignored (forward-compat)
  }
  if (paren) title = title.replace(paren[0], "");
  out.title = title.replace(/\s+-\s*$/, "").replace(/\s{2,}/g, " ").trim() || null;
  return out;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// Deep entry-point resolution: walk to depth 3, rank candidates so root
// index.html wins, then canonical subdirs, then any */index.html, then any html.
async function findEntry(dir) {
  const found = [];
  const walk = async (cur, rel, depth) => {
    if (depth > 3 || found.length > 60) return;
    let entries;
    try { entries = await fs.readdir(cur, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (ENTRY_JUNK.has(e.name) || e.name.startsWith(".")) continue;
        await walk(path.join(cur, e.name), [...rel, e.name], depth + 1);
      } else if (/\.html?$/i.test(e.name)) {
        found.push(rel.concat(e.name).join("/"));
      }
    }
  };
  await walk(dir, [], 0);
  const rank = (p) => {
    const n = p.toLowerCase();
    const base = n === "index.html" ? 0
      : ["public/index.html", "src/index.html", "dist/index.html", "app/index.html"].includes(n) ? 1
      : n.endsWith("/index.html") ? 2 : 3;
    return base * 100 + p.split("/").length;
  };
  found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return found[0] || null;
}

// Back-compat alias (older call sites/tests).
const resolveEntry = findEntry;

async function readReadme(dir) {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    const p = path.join(dir, name);
    if (await exists(p)) {
      try { return await fs.readFile(p, "utf8"); } catch { return ""; }
    }
  }
  return "";
}

function parseReadme(text) {
  let title = null, description = "";
  const lines = text.split(/\r?\n/);
  let sawH1 = false;
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1 && !sawH1) { title = h1[1]; sawH1 = true; continue; }
    if (!description && line.trim() && !line.startsWith("#") && !line.startsWith("![")) {
      description = line.trim();
      break;
    }
  }
  if (description.length > 200) description = description.slice(0, 197) + "...";
  return { title, description };
}

// Walk dir accumulating {sizeBytes,fileCount,maxMtime}, skipping junk dirs.
// One readdir withFileTypes per directory; sizes/mtimes come from the SAME
// dirent batch via fs.stat on directories only when needed — files are
// batched through Promise.all in chunks to avoid serial await waterfalls.
async function walkStats(dir) {
  let sizeBytes = 0, fileCount = 0, maxMtime = 0;
  const absorb = (st) => {
    sizeBytes += st.size;
    fileCount += 1;
    if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
  };
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = await fs.readdir(cur, { withFileTypes: true }); }
    catch { continue; }
    const files = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        if (EXCLUDED_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        stack.push(path.join(cur, e.name));
      } else if (e.isFile()) {
        files.push(e.name);
      }
    }
    if (!files.length) continue;
    // chunked parallel stat — the win over serial awaits
    for (let i = 0; i < files.length; i += 64) {
      const slice = files.slice(i, i + 64);
      const stats = await Promise.all(slice.map((name) =>
        fs.stat(path.join(cur, name)).catch(() => null)));
      for (const st of stats) if (st) absorb(st);
    }
  }
  return { sizeBytes, fileCount, maxMtime };
}

// Collect the game's own screenshots from common folders.
async function collectShots(dir, id) {
  const out = [];
  for (const base of ["screenshots", "shots"]) {
    const abs = path.join(dir, base);
    if (!(await exists(abs))) continue;
    let entries;
    try { entries = await fs.readdir(abs, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory() || !IMAGE_RE.test(e.name)) continue;
      out.push(`/media/${id}/` + [base, e.name].map(encodeURIComponent).join("/"));
      if (out.length >= 8) return out;
    }
  }
  return out;
}

// Per-build agent status protocol (.status.json next to the entry):
// {"status":"done|inprogress","checks":"passed|failed|untested",
//  "lastChangeAt":ISO,"updatedAt":ISO}. Absent/garbage -> null.
async function readBuildStatus(dir) {
  let d;
  try { d = JSON.parse(await fs.readFile(path.join(dir, ".status.json"), "utf8")); }
  catch { return null; }
  if (!d || typeof d !== "object") return null;
  return {
    status: d.status === "done" ? "done" : "inprogress",
    checks: ["passed", "failed", "untested"].includes(d.checks) ? d.checks : "untested",
    lastChangeAt: typeof d.lastChangeAt === "string" ? d.lastChangeAt : null,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : null,
  };
}

function tagFor(dirName, hasEntry) {
  if (!hasEntry) return ["incomplete"];
  if (/fl studio/i.test(dirName)) return ["instrument"];
  return ["game"];
}

// ---- multiplayer (netcode) detection ---------------------------------------
// Static heuristic over the build's own text files: flags realtime-network
// APIs so the dashboard can badge online-capable exhibits. Declarations win:
// overrides "multiplayer": true/false (+"endpoint"), or arcade.json
// "multiplayer": true / false / {"endpoint": "/ws/..."}.
const NETCODE_PATTERNS = [
  ["websocket", /\bnew\s+WebSocket\b|\brequire\(\s*['"](?:ws|socket\.io[^'"]*)['"]\s*\)|from\s+['"](?:ws|socket\.io[^'"]*)['"]|\bio\s*\(\s*['"]?\s*(?:wss?:)?\/\//i],
  ["webrtc",    /\bRTCPeerConnection\b|\bRTCDataChannel\b/i],
  ["sse",       /\bnew\s+EventSource\b/i],
];
const MP_TEXT_RE = /\.(html?|js|mjs|cjs)$/i;
// Dev/QA dirs routinely talk raw WebSockets (CDP drivers, puppeteer, e2e
// runners) without the GAME being online-capable — never scan them.
const MP_SKIP_DIRS = new Set([
  "test", "tests", "scripts", "tools", "qa", "e2e",
  "screenshots", "shots", "reference", "docs", "saves", "test-artifacts",
]);
const MP_FILE_CAP = 600 * 1024;   // per file — skips bundled engines' fat chunks
const MP_BUDGET = 3 * 1024 * 1024;

async function detectNetcode(dir) {
  const hits = new Set();
  let budget = MP_BUDGET;
  const stack = [dir];
  while (stack.length && budget > 0) {
    const cur = stack.pop();
    let entries;
    try { entries = await fs.readdir(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (budget <= 0 || hits.size === NETCODE_PATTERNS.length) return [...hits];
      if (e.isDirectory()) {
        if (ENTRY_JUNK.has(e.name) || MP_SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        stack.push(path.join(cur, e.name));
        continue;
      }
      if (!MP_TEXT_RE.test(e.name)) continue;
      const p = path.join(cur, e.name);
      let st; try { st = await fs.stat(p); } catch { continue; }
      if (!st.isFile() || st.size > MP_FILE_CAP || st.size > budget) continue;
      budget -= st.size;
      let txt; try { txt = await fs.readFile(p, "utf8"); } catch { continue; }
      for (const [name, re] of NETCODE_PATTERNS) {
        if (!hits.has(name) && re.test(txt)) hits.add(name);
      }
    }
  }
  return [...hits];
}

function multiplayerFor(dir, ov = {}) {
  const endpoint = typeof ov.endpoint === "string" ? ov.endpoint : null;
  if (ov.multiplayer === false) {
    return Promise.resolve({ supported: false, signals: [], endpoint, source: "override" });
  }
  if (ov.multiplayer === true) {
    return detectNetcode(dir).then((signals) => ({
      supported: true,
      signals: signals.length ? signals : ["declared"],
      endpoint,
      source: "override",
    }));
  }
  return detectNetcode(dir).then((signals) => ({
    supported: signals.length > 0, signals, endpoint, source: "scan",
  }));
}

async function scanBuilds(root, opts = {}) {
  let overrides = {};
  const ovPath = opts.overridesPath || path.join(root, ".archive-overrides.json");
  try { overrides = JSON.parse(await fs.readFile(ovPath, "utf8")) || {}; }
  catch { /* none */ }

  const children = await fs.readdir(root, { withFileTypes: true });
  const dirs = children.filter((c) =>
    c.isDirectory() && !c.name.startsWith(".") && !EXCLUDED_DIRS.has(c.name));

  // All builds in parallel — each does its own IO; the slowest build sets the
  // time instead of the sum of all of them.
  const builds = await Promise.all(dirs.map(async (c) => {
    const dir = path.join(root, c.name);
    const id = slugify(c.name);
    if (!id) return null;

    const [entry, readme, stats] = await Promise.all([
      findEntry(dir),
      readReadme(dir),
      walkStats(dir),
    ]);
    const ov = overrides[id] || {};
    const meta = parseFolderMeta(c.name);
    const parsed = parseReadme(readme);

    const urlPath = entry ? entry.split(/[\\/]+/).map(encodeURIComponent).join("/") : null;

    return {
      id,
      dir: c.name,
      title: ov.title || meta.title || parsed.title || c.name,
      description: ov.description || parsed.description || "",
      model: ov.model || meta.model,
      entry,
      status: entry ? "playable" : "incomplete",
      url: urlPath ? `/play/${id}/${urlPath}` : null,
      thumb: `/thumbs/${id}.png`,
      mtime: stats.maxMtime ? new Date(stats.maxMtime).toISOString() : null,
      sizeBytes: stats.sizeBytes,
      fileCount: stats.fileCount,
      tags: ov.tags || tagFor(c.name, !!entry),
      shots: await collectShots(dir, id),
      multiplayer: await multiplayerFor(dir, ov),
      buildStatus: await readBuildStatus(dir),
      thumbWaitMs: Number(ov.thumbWaitMs) || undefined,
      harness: deriveHarness(c.name, ov.harness),
    };
  }));
  const clean = builds.filter(Boolean);
  clean.sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
  return clean;
}

module.exports = { scanBuilds, slugify, findEntry, resolveEntry, deriveHarness, parseFolderMeta, HARNESS_META, detectNetcode, multiplayerFor, readBuildStatus };
