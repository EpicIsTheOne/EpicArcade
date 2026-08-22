"use strict";
// Publish a local build into the EpicArcade repo and push it.
//
//   npm run publish -- <buildId> --model OxAlpha [--project FNAF] [--harness Hermes] [--dry-run] [--force]
//
// Target layout (the layout IS the route): <Model>/<Project>/<Harness>/
// Refuses to overwrite an existing route without --force. Never touches
// deployed.json — only the server-side agent records deployments.
const path = require("path");
const fsp = require("node:fs/promises");
const { scanBuilds, deriveHarness } = require("../lib/scan");
const arcade = require("../lib/arcade");

const archiveRoot = path.resolve(__dirname, "..");
const root = path.resolve(archiveRoot, "..");

function argVal(args, name) {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : undefined;
}
function hasFlag(args, name) { return args.includes("--" + name); }

async function copyBuild(srcDir, destDir) {
  const JUNK = new Set(["node_modules", ".git", ".archive"]);
  const JUNK_FILE = /^(test|qa|_baseline|_quarantine)/i;
  let files = 0;
  const walk = async (cur, rel) => {
    await fsp.mkdir(destDir && path.join(destDir, rel), { recursive: true });
    const entries = await fsp.readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (JUNK.has(e.name) || e.name.startsWith(".")) continue;
        await walk(path.join(cur, e.name), path.join(rel, e.name));
      } else if (!JUNK_FILE.test(e.name)) {
        await fsp.copyFile(path.join(cur, e.name), path.join(destDir, rel, e.name));
        files++;
      }
    }
  };
  await walk(srcDir, "");
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const buildId = args.find((a) => !a.startsWith("--"));
  const model = argVal(args, "model");
  const projectOpt = argVal(args, "project");
  const harnessOpt = argVal(args, "harness");
  const dryRun = hasFlag(args, "dry-run");
  const force = hasFlag(args, "force");

  if (!buildId) { console.error("usage: npm run publish -- <buildId> --model <Model> [--project P] [--harness H] [--dry-run] [--force]"); process.exit(1); }
  if (!model) { console.error("error: --model is required (never guess the model)"); process.exit(1); }
  if (!arcade.slugOk(model)) { console.error(`error: model slug invalid: ${model}`); process.exit(1); }

  const builds = await scanBuilds(root);
  const b = builds.find((x) => x.id === buildId);
  if (!b) { console.error(`error: no local build '${buildId}'`); process.exit(1); }
  if (!b.entry) { console.error(`error: '${buildId}' has no entry point — nothing playable to publish`); process.exit(1); }

  const project = projectOpt || b.title.replace(/[^A-Za-z0-9]+/g, "").slice(0, 40) || b.id;
  const harness = harnessOpt ||
    (b.harness !== "none" ? b.harness : "Hermes").replace(/(^|-)([a-z])/g, (_, s, c) => s + c.toUpperCase());
  for (const [k, v] of [["project", project], ["harness", harness]]) {
    if (!arcade.slugOk(v)) { console.error(`error: ${k} slug invalid: ${v}`); process.exit(1); }
  }
  const route = `${model}/${project}/${harness}`;

  const repoDir = process.env.ARCHIVE_ARCADE_DIR || path.join(archiveRoot, ".archive", "arcade-repo");
  console.log(`syncing EpicArcade repo...`);
  const ensured = await arcade.ensureRepo(repoDir, process.env.ARCHIVE_ARCADE_REPO);
  if (!ensured.ok) { console.error("error: " + ensured.error); process.exit(1); }

  const existingGames = await arcade.parseArcadeLayout(repoDir);
  if (!force && existingGames.some((g) => g.route === route)) {
    console.error(`error: route already exists in repo: ${route} (use --force to replace)`);
    process.exit(1);
  }

  const destDir = path.join(repoDir, route);
  console.log([
    `plan:`,
    `  build    : ${b.title} (${b.id})`,
    `  route    : ${route}`,
    `  entry    : ${b.entry}`,
    `  dest     : ${destDir}`,
    `  mode     : ${dryRun ? "DRY RUN" : force ? "REPLACE+PUSH" : "PUSH"}`,
  ].join("\n"));
  if (dryRun) { console.log("dry run — nothing copied, nothing pushed."); return; }

  try { await fsp.rm(destDir, { recursive: true, force: true }); } catch {}
  const n = await copyBuild(b.dir ? path.join(root, b.dir) : path.join(root, buildId), destDir);

  // write/merge arcade.json
  const arcadeJsonPath = path.join(destDir, "arcade.json");
  let meta = {};
  try { meta = JSON.parse(await fsp.readFile(arcadeJsonPath, "utf8")); } catch {}
  meta.title = meta.title || b.title;
  if (b.description) meta.description = b.description;
  await fsp.writeFile(arcadeJsonPath, JSON.stringify(meta, null, 2));

  const add = await require("../lib/arcade").git; // (not used directly; kept explicit below)
  const gitRun = (args) => new Promise((res2) => {
    const { spawn } = require("node:child_process");
    const p = spawn("git", args, { cwd: repoDir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => res2({ code, out: out.trim(), err: err.trim() }));
  });

  let r = await gitRun(["add", "-A"]);
  if (r.code !== 0) { console.error("git add failed: " + r.err); process.exit(1); }
  r = await gitRun(["commit", "-m", `publish: ${route} from ${b.id}`]);
  if (r.code !== 0 && !/nothing to commit/.test(r.out + r.err)) {
    console.error("git commit failed: " + (r.err || r.out)); process.exit(1);
  }
  r = await gitRun(["push"]);
  if (r.code !== 0) { console.error("git push failed: " + r.err); process.exit(1); }

  console.log(`published ${n} files -> ${route}`);
  console.log(`future URL path on your host: /${route}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
