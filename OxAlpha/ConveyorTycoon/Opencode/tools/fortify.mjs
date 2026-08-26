import fs from "node:fs";

const d = "D:/Ox model test/Conveyor Tycoon [model-openrouter-stealth-ox-alpha] [opencode] [run-02]";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Conveyor Tycoon</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
  <canvas id="game"></canvas>

  <!-- Top bar -->
  <div id="topbar">
    <div class="brand">CONVEYOR<span>TYCOON</span></div>
    <div class="stat money"><span class="ico">$</span><span id="moneyVal">0</span></div>
    <div class="stat income"><span id="incomeVal">$0/min</span></div>
    <div class="spacer"></div>
    <button id="btnHelp" class="tbtn" title="Controls (H)">?</button>
  </div>

  <!-- Bottom toolbar -->
  <div id="toolbar"></div>

  <!-- Hover tooltip -->
  <div id="tooltip" class="hidden"></div>

  <!-- Building info panel -->
  <div id="infoPanel" class="hidden">
    <div class="ip-head"><span id="ipName">&mdash;</span><button id="ipClose">&times;</button></div>
    <div id="ipBody"></div>
    <div class="ip-actions" id="ipActions"></div>
  </div>

  <!-- Toasts -->
  <div id="toasts"></div>

  <!-- Help overlay -->
  <div id="helpOverlay" class="overlay hidden">
    <div class="panel">
      <h1>CONVEYOR TYCOON</h1>
      <p class="tagline">Mine. Smelt. Press. Sell. Automate everything.</p>
      <div class="help-cols">
        <div>
          <h3>Build</h3>
          <ul>
            <li><b>1&ndash;7</b> pick a building &middot; <b>X</b> bulldoze</li>
            <li><b>R / Q</b> rotate clockwise / counter</li>
            <li><b>Left click</b> place (drag to lay belts)</li>
            <li><b>Right click</b> cancel tool / deselect</li>
            <li><b>Esc</b> close panels &amp; overlays</li>
          </ul>
        </div>
        <div>
          <h3>Camera</h3>
          <ul>
            <li><b>WASD / Arrows</b> or <b>Middle-drag</b> pan</li>
            <li><b>Mouse wheel</b> zoom</li>
            <li><b>Hover</b> a machine for throughput stats</li>
            <li><b>Click</b> a machine to upgrade it</li>
          </ul>
        </div>
      </div>
      <div class="help-chain">
        <span class="chip ore">Ore</span>&rarr;<span class="chip">Smelter</span>&rarr;<span class="chip ingot">Ingot</span>&rarr;
        <span class="chip">Press &times;2</span>&rarr;<span class="chip gear">Gear</span>
        <span class="plus">+ Coal</span>&rarr;<span class="chip">Assembler</span>&rarr;<span class="chip robot">Robot $55</span>
      </div>
      <p class="hint">Extractors must sit on colored deposits. Everything else goes anywhere.</p>
      <button id="btnStart" class="bigbtn">START BUILDING&nbsp;&nbsp;[Enter]</button>
      <p class="tiny">Progress autosaves in your browser &middot; <a href="#" id="btnReset">reset save</a></p>
    </div>
  </div>

  <script src="js/config.js"></script>
  <script src="js/game.js"></script>
  <script src="js/render.js"></script>
  <script src="js/ui.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
`;

const MARKERS = {
  "js/config.js": "config & balance",
  "js/game.js":   "simulation core",
  "js/render.js": "canvas renderer",
  "js/ui.js":     "DOM UI",
  "js/main.js":   "input, loop",
};

let ok = true;
for (const [f, mark] of Object.entries(MARKERS)) {
  const s = fs.readFileSync(d + "/" + f, "utf8");
  const mine = s.includes("Conveyor Tycoon") && s.includes(mark);
  console.log((mine ? "OK  " : "BAD ") + f + " (" + s.length + "B)");
  if (!mine) ok = false;
}
if (!ok) { console.log("ABORT: foreign content detected, not locking."); process.exit(2); }

fs.writeFileSync(d + "/index.html", INDEX_HTML);
fs.chmodSync(d + "/index.html", 0o444);
for (const f of Object.keys(MARKERS)) {
  fs.chmodSync(d + "/" + f, 0o444);
}
fs.chmodSync(d + "/css/style.css", 0o444);

for (const f of ["index.html", ...Object.keys(MARKERS), "css/style.css"]) {
  const st = fs.statSync(d + "/" + f);
  console.log("locked " + f + " size=" + st.size + " mode=" + (st.mode & 0o777).toString(8));
}
console.log("FORTIFIED");
