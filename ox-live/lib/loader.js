"use strict";
// Discovers live-capable games in the EpicArcade repo layout:
//   <Model>/<Project>/<Harness>/server.mjs
// A game is registered only if its arcade.json (or its module) declares a
// route under /ws/. First game to claim a route wins.
const fsp = require("node:fs/promises");
const path = require("node:path");

const ROUTE_RE = /^\/ws\/[a-z0-9][a-z0-9._-]{0,63}$/;
const RESERVED = new Set(["/ws/_health"]);

async function readJson(file) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")) || {}; } catch { return {}; }
}

// Returns [{ route, title, model, project, harness, dir, file }] — no IO after.
async function scanGames(root) {
  const out = [];
  const claimed = new Map();
  let models;
  try { models = await fsp.readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const m of models) {
    if (!m.isDirectory() || m.name.startsWith(".") || m.name === "node_modules") continue;
    const modelDir = path.join(root, m.name);
    let projects;
    try { projects = await fsp.readdir(modelDir, { withFileTypes: true }); } catch { continue; }
    for (const p of projects) {
      if (!p.isDirectory() || p.name.startsWith(".")) continue;
      const projDir = path.join(modelDir, p.name);
      let harnesses;
      try { harnesses = await fsp.readdir(projDir, { withFileTypes: true }); } catch { continue; }
      for (const h of harnesses) {
        if (!h.isDirectory() || h.name.startsWith(".")) continue;
        const dir = path.join(projDir, h.name);
        const file = path.join(dir, "server.mjs");
        let st;
        try { st = await fsp.stat(file); } catch { continue; }
        const meta = await readJson(path.join(dir, "arcade.json"));
        const declared = meta.multiplayer && typeof meta.multiplayer.endpoint === "string"
          ? meta.multiplayer.endpoint
          : null;
        const route = normalizeRoute(declared || `/ws/${slug(p.name)}`);
        if (!route || RESERVED.has(route)) continue;
        if (claimed.has(route)) continue; // first harness to claim a route wins
        claimed.set(route, true);
        out.push({
          route,
          title: meta.title || p.name,
          model: m.name,
          project: p.name,
          harness: h.name,
          dir,
          file,
          mtimeMs: st.mtimeMs,
        });
      }
    }
  }
  out.sort((a, b) => a.route.localeCompare(b.route));
  return out;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function normalizeRoute(r) {
  if (typeof r !== "string") return null;
  r = r.trim().replace(/\/+$/, "");
  if (!ROUTE_RE.test(r.toLowerCase())) return null;
  return r.toLowerCase();
}

module.exports = { scanGames, normalizeRoute };
