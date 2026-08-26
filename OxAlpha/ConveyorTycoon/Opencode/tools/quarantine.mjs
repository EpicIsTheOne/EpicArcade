import fs from "node:fs";

const d = "D:/Ox model test/Conveyor Tycoon [model-openrouter-stealth-ox-alpha] [opencode] [run-02]";
const qz = d + "/.run/foreign-zombie";
fs.mkdirSync(qz, { recursive: true });

for (const f of ["audio.js", "defs.js", "sim.js"]) {
  const src = d + "/js/" + f;
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, qz + "/" + f);
    fs.unlinkSync(src);
    console.log("quarantined " + f);
  }
}
console.log("js/ now: " + fs.readdirSync(d + "/js").join(", "));

const idx = fs.readFileSync(d + "/index.html", "utf8");
const srcs = [...idx.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
console.log("index.html size: " + idx.length + " | external scripts: " + srcs.join(", "));
