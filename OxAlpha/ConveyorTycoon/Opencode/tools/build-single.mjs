import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

const css = read(".src/style.css");
const scripts = [".src/defs.js", ".src/audio.js", ".src/sim.js", ".src/render.js", ".src/ui.js", ".src/main.js"]
  .map(f => "<script>\n" + read(f).replace(/<\/script>/g, "<\\/script>") + "\n</script>")
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conveyor Tycoon</title>
<link rel="icon" href="data:,">
<style>
${css}
</style>
</head>
<body>
<div id="app">
  <header id="hud">
    <div class="hud-left">
      <div id="money" class="stat-big">$0</div>
      <div id="income" class="stat-sub">+$0/min</div>
    </div>
    <div class="hud-title"><span class="logo-dot"></span><span>CONVEYOR<b>TYCOON</b></span></div>
    <div class="hud-right">
      <button id="btn-stats" class="hbtn">Stats <kbd>Tab</kbd></button>
      <button id="btn-help" class="hbtn">Help <kbd>H</kbd></button>
      <button id="btn-mute" class="hbtn">Sound: On</button>
      <button id="btn-reset" class="hbtn danger">Reset</button>
    </div>
  </header>
  <main id="stage">
    <canvas id="game"></canvas>
    <div id="paused-badge" hidden>PAUSED &mdash; press Space to resume</div>
    <div id="tooltip" hidden></div>
  </main>
  <footer id="toolbar"></footer>
</div>

<div id="stats-panel" class="panel" hidden>
  <div class="panel-head"><h2>Factory Stats</h2><button class="xclose" data-close="stats-panel">&#10005;</button></div>
  <div class="panel-body">
    <section>
      <h3>Income <span class="muted">(last 60s)</span></h3>
      <canvas id="sparkline" width="300" height="64"></canvas>
      <div id="stat-money-rows"></div>
    </section>
    <section>
      <h3>Production (lifetime)</h3>
      <div id="stat-prod-rows"></div>
    </section>
    <section>
      <h3>Upgrades</h3>
      <div id="stat-upgrade-rows"></div>
    </section>
    <section>
      <h3>Objectives</h3>
      <div id="stat-objective-rows"></div>
    </section>
  </div>
</div>

<div id="help-panel" class="panel" hidden>
  <div class="panel-head"><h2>How to Play</h2><button class="xclose" data-close="help-panel">&#10005;</button></div>
  <div class="panel-body help-body">
    <p><b>Goal:</b> mine ore, refine it into valuable goods, and sell them. Reinvest profits into a bigger factory.</p>
    <table class="keys">
      <tr><td><kbd>1</kbd>&ndash;<kbd>8</kbd></td><td>Select build tool</td></tr>
      <tr><td><kbd>R</kbd> / wheel</td><td>Rotate ghost (or hovered building)</td></tr>
      <tr><td><kbd>X</kbd></td><td>Demolish tool (70% refund)</td></tr>
      <tr><td>Right-click</td><td>Quick-demolish hovered building</td></tr>
      <tr><td>Drag</td><td>Paint conveyor lines (auto-turns)</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Pause simulation</td></tr>
      <tr><td><kbd>Tab</kbd></td><td>Stats &amp; upgrades</td></tr>
      <tr><td><kbd>H</kbd></td><td>This panel</td></tr>
    </table>
    <p><b>Tips:</b> Extractors must sit on an ore deposit and eject forward. Machines accept items from any side and eject out their arrow side. Belts carry ~2 items per tile &mdash; parallel lines beat one giant snake. Markets sell anything; raw ore sells cheap, refined goods sell big.</p>
  </div>
</div>

<div id="modal" hidden>
  <div class="modal-card">
    <h3 id="modal-title">Reset factory?</h3>
    <p id="modal-text">This wipes your save and starts over with $650. There is no undo.</p>
    <div class="modal-actions">
      <button id="modal-cancel" class="btn">Cancel</button>
      <button id="modal-ok" class="btn danger">Reset everything</button>
    </div>
  </div>
</div>

<div id="intro" hidden>
  <div class="intro-card">
    <div class="intro-logo">CONVEYOR<span>TYCOON</span></div>
    <p class="tagline">Build it. Feed it. Automate everything.</p>
    <ul>
      <li>Drop <b>extractors</b> on ore deposits</li>
      <li>Connect <b>conveyors</b> into smelters, assemblers and fabricators</li>
      <li>Sell ingots, gears, circuits and robots at the <b>market</b></li>
      <li>Upgrade belts &amp; machines, expand, optimize</li>
    </ul>
    <p class="hint">Drag to paint belts &middot; R rotates &middot; right-click demolishes &middot; H for help</p>
    <button id="intro-start" class="btn primary big">Start Building</button>
    <div id="intro-save-note" class="save-note" hidden>Save detected &mdash; your factory has been restored.</div>
  </div>
</div>

<div id="toasts"></div>

${scripts}
</body>
</html>
`;

fs.writeFileSync(path.join(root, "tools", "ct-canonical.html"), html);
fs.writeFileSync(path.join(root, "index.html"), html);
const h = crypto.createHash("sha256").update(html).digest("hex").slice(0, 12);
console.log("BUILD_OK bytes=" + html.length + " sha=" + h);
