import fs from "node:fs";
const d = "D:/Ox model test/Conveyor Tycoon [model-openrouter-stealth-ox-alpha] [opencode] [run-02]";
const idx = fs.readFileSync(d + "/index.html", "utf8");
const links = [...idx.matchAll(/<link[^>]*>/g)].map(m => m[0]);
console.log("link tags:", JSON.stringify(links));
