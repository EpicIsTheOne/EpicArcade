import { execSync } from "node:child_process";

function wmic(q) {
  return JSON.parse(execSync(
    `powershell -NoProfile -Command "${q}"`, { encoding: "utf8", timeout: 20000 }
  ).toString("utf8").trim() || "[]");
}

const procs = {};
try {
  const rows = execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 2"',
    { encoding: "utf8", timeout: 30000 }
  ).toString("utf8");
  const arr = JSON.parse(rows);
  for (const r of (Array.isArray(arr) ? arr : [arr])) procs[r.ProcessId] = r;
} catch (e) { console.log("ENUM_FAIL", e.message); }

function chain(pid) {
  const out = [];
  let cur = pid, guard = 0;
  while (cur && guard++ < 15) {
    const p = procs[cur];
    if (!p) break;
    out.push(`${p.ProcessId}:${p.Name}`);
    cur = p.ParentProcessId;
  }
  return out.join(" <- ");
}

const DEVSERVER = 39252;
if (procs[DEVSERVER]) {
  console.log("DEVSERVER 39252 chain:");
  console.log("  " + chain(DEVSERVER));
} else {
  console.log("devserver 39252 not running");
}

console.log("\nAll node.exe processes:");
for (const id of Object.keys(procs)) {
  const p = procs[id];
  if (/node/i.test(p.Name)) {
    console.log(`  ${id} (ppid ${p.ParentProcessId}) :: ${(p.CommandLine || "").slice(0, 160)}`);
  }
}
