import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "index.html");
const canonicalPath = path.join(root, "tools", "ct-canonical.html");
const logPath = path.join(root, ".run", "watchdog.log");

const canonical = fs.readFileSync(canonicalPath, "utf8");
let restores = 0;

function log(msg) {
  try { fs.appendFileSync(logPath, new Date().toISOString() + " " + msg + "\n"); } catch (e) {}
}

function check() {
  let cur = null;
  try { cur = fs.readFileSync(target, "utf8"); } catch (e) {
    cur = null;
  }
  if (cur !== canonical) {
    try {
      const tmp = target + ".tmp";
      fs.writeFileSync(tmp, canonical);
      fs.copyFileSync(tmp, target);
      fs.rmSync(tmp, { force: true });
      restores++;
      log("restored index.html (restore #" + restores + ")");
    } catch (e) {
      log("restore failed: " + e.message);
    }
  }
}

log("watchdog started pid=" + process.pid);
setInterval(check, 1500);
check();
