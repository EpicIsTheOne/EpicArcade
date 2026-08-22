"use strict";
// Bulk thumbnail generator CLI.
// Usage: node scripts/thumbs.js [--force] [buildId ...]
// Without ids: captures every playable build missing/stale thumbnails.
const path = require("path");
const fsp = require("node:fs/promises");
const { captureThumb } = require("../lib/thumbs");
const { scanBuilds } = require("../lib/scan");

const archiveRoot = path.resolve(__dirname, "..");
// games root = parent of goal-archive/
const root = path.resolve(archiveRoot, "..");

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const ids = args.filter((a) => !a.startsWith("--"));

  // Spin up our own short-lived server so captures go over http
  // (ES-module games cannot load from file://).
  const srv = await require("../server").start({ port: 0 });
  const httpBase = `http://127.0.0.1:${srv.port}`;

  const builds = await scanBuilds(root);
  const playable = builds.filter((b) => b.status === "playable");
  let targets = playable;
  if (ids.length) targets = playable.filter((b) => ids.includes(b.id));

  if (!targets.length) {
    console.log("nothing to do (no matching playable builds)");
    return;
  }

  // stale check: skip when sidecar meta is newer than build mtime
  const thumbsDir = path.join(archiveRoot, ".archive", "thumbs");
  const jobs = [];
  for (const b of targets) {
    if (!force) {
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(thumbsDir, `${b.id}.json`), "utf8"));
        if (new Date(meta.capturedAt).getTime() > new Date(b.mtime || 0).getTime()) {
          console.log(`skip  ${b.id}  (thumb newer than build)`);
          continue;
        }
      } catch { /* no meta yet -> capture */ }
    }
    jobs.push(b);
  }

  console.log(`capturing ${jobs.length} thumbnail(s) via ${httpBase}...`);
  let okCount = 0;
  for (const b of jobs) {
    process.stdout.write(`  ${b.id} ... `);
    const res = await captureThumb(archiveRoot, root, b.id, { httpBase });
    if (res.ok) { okCount++; console.log(`ok (${res.meta.source})`); }
    else console.log(`FAILED: ${res.error}`);
  }
  console.log(`done: ${okCount}/${jobs.length} captured`);
  await srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
