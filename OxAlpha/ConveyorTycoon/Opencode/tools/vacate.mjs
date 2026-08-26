import fs from "node:fs";
import path from "node:path";

const d = "D:/Ox model test/Conveyor Tycoon [model-openrouter-stealth-ox-alpha] [opencode] [run-02]";
const arc = d + "/.run/mine-archive";
fs.mkdirSync(arc + "/js", { recursive: true });
fs.mkdirSync(arc + "/css", { recursive: true });

for (const f of ["config.js", "game.js", "render.js", "ui.js", "main.js"]) {
  const src = d + "/js/" + f;
  try {
    const s = fs.readFileSync(src, "utf8");
    fs.writeFileSync(arc + "/js/" + f, s);
    fs.unlinkSync(src);
    console.log("archived+removed js/" + f + " (" + s.length + "B)");
  } catch (e) {
    console.log("skip js/" + f + ": " + e.code);
  }
}
for (const f of ["style.css"]) {
  const src = d + "/css/" + f;
  try {
    const s = fs.readFileSync(src, "utf8");
    fs.writeFileSync(arc + "/css/" + f, s);
    fs.unlinkSync(src);
    console.log("archived+removed css/" + f + " (" + s.length + "B)");
  } catch (e) { console.log("skip css/" + f + ": " + e.code); }
}

try { fs.rmSync(d + "/css", { recursive: true, force: true }); console.log("removed empty css/"); } catch {}
console.log("js/ now: " + fs.readdirSync(d + "/js").join(", "));
console.log("root now: " + fs.readdirSync(d).join(", "));
