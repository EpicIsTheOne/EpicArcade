import fs from "node:fs";

const d = "D:/Ox model test/Conveyor Tycoon [model-openrouter-stealth-ox-alpha] [opencode] [run-02]";
const paths = [
  "index.html", "css/style.css",
  "js/config.js", "js/game.js", "js/render.js", "js/ui.js", "js/main.js",
  "js/audio.js", "js/defs.js", "js/sim.js",
  ".run/devserver.json", ".run/devserver-mine.json",
];

function snap() {
  const out = [];
  for (const p of paths) {
    try {
      const s = fs.statSync(d + "/" + p);
      out.push(p + "=" + s.size + "@" + Math.floor(s.mtimeMs / 1000));
    } catch { out.push(p + "=ABSENT"); }
  }
  return out;
}

const rounds = Number(process.argv[2] || 6);
const gapMs = Number(process.argv[3] || 60000);
let prev = null;
for (let i = 0; i < rounds; i++) {
  const cur = snap();
  const changed = prev ? cur.filter((l, j) => prev[j] !== l) : [];
  console.log(`[t+${i * Math.round(gapMs / 1000)}s] ` + (changed.length ? "CHANGED:\n    " + changed.join("\n    ") : "no change"));
  prev = cur;
  if (i < rounds - 1) await new Promise(r => setTimeout(r, gapMs));
}
const idx = fs.readFileSync(d + "/index.html", "utf8");
console.log("index.html bytes=" + idx.length +
  " externalScripts=" + ([...idx.matchAll(/src="([^"]+)"/g)].map(m => m[1]).join(",") || "none") +
  " hasHelpOverlay=" + idx.includes("helpOverlay") +
  " hasIntroStart=" + idx.includes("intro-start"));
for (const f of ["RESULT.md", "README.md"]) {
  console.log(f + ": " + (fs.existsSync(d + "/" + f) ? "EXISTS" : "absent"));
}
