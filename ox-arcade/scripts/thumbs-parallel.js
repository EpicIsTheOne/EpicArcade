"use strict";
// Parallel bulk thumbnail generator.
// Usage: node scripts/thumbs-parallel.js [--force] [--concurrency=N] [buildId ...]
const path = require("path");
const fsp = require("node:fs/promises");
const { captureThumb } = require("../lib/thumbs");
const { scanBuilds } = require("../lib/scan");

const archiveRoot = path.resolve(__dirname, "..");
const root = path.resolve(archiveRoot, "..");

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const concurrency = Math.max(1, Number((args.find((a) => a.startsWith("--concurrency=")) || "").split("=")[1]) || 5);
  const ids = args.filter((a) => !a.startsWith("--"));

  const srv = await require("../server").start({ port: 0 });
  const httpBase = `http://127.0.0.1:${srv.port}`;

  const builds = await scanBuilds(root);
  const thumbsDir = path.join(archiveRoot, ".archive", "thumbs");
  await fsp.mkdir(thumbsDir, { recursive: true });

  let targets = builds.filter((b) => b.status === "playable");
  if (ids.length) targets = targets.filter((b) => ids.includes(b.id));

  const jobs = [];
  for (const b of targets) {
    if (!force) {
      try {
        const png = await fsp.stat(path.join(thumbsDir, `${b.id}.png`));
        if (png.size > 5120) continue; // already has a thumb
      } catch { /* missing -> capture */ }
    }
    jobs.push(b);
  }

  console.log(`capturing ${jobs.length} thumbnail(s), concurrency ${concurrency}, via ${httpBase}`);
  let done = 0, okCount = 0, failCount = 0;
  const failures = [];
  let cursor = 0;

  async function worker(wid) {
    while (true) {
      const i = cursor++;
      if (i >= jobs.length) return;
      const b = jobs[i];
      const res = await captureThumb(archiveRoot, root, b.id, { httpBase, builds }).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
      done++;
      if (res.ok) { okCount++; process.stdout.write(`[w${wid}] ok   ${b.id} (${done}/${jobs.length})\n`); }
      else { failCount++; failures.push(b.id); process.stdout.write(`[w${wid}] FAIL ${b.id}: ${res.error} (${done}/${jobs.length})\n`); }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
  console.log(`done: ${okCount} ok, ${failCount} failed`);
  if (failures.length) console.log("failed ids:\n" + failures.join("\n"));
  await srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
