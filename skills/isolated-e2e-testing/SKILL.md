---
name: isolated-e2e-testing
description: >
  MUST USE whenever running browser automation, Playwright steps, E2E tests,
  screenshots, or multi-client/websocket testing of a web app on this machine —
  e.g. "test the game in the browser", "take a screenshot of the page",
  "E2E verify the flow", "two-client multiplayer test", or ANY use of
  playwright_* tools. Parallel opencode agents on this machine actively share
  and steal browser tabs; this encodes the isolation protocol that prevents
  hijacked tabs, contaminated screenshots, cross-agent process kills, and
  false bug hunts. Born from real incidents (2026-08-23).
---

# Isolated E2E Testing (contested-machine protocol)

This machine runs **multiple opencode agents concurrently**, often all doing
browser automation through the same shared Playwright MCP browser. Tabs get
navigated out from under you **mid-step**. Treat every shared browser as
hostile territory and every tab as revocable at any instant.

## Incident record (why these rules exist)

Session ses_fcfcb16f6ffeQx3jU7bMwI1J8h (2026-08-23, Lumencraft MP):

- Tab hijacked mid-click by a parallel agent; screenshot captured a
  completely different app ("PathAI") bleeding in from another session.
- Tab indices shifted between calls under other agents' activity.
- Multi-tab chat checks kept arriving after an 8s UI fade window →
  ~45 min false bug hunt chasing a nonexistent server bug.
- Overly broad node process filter killed 2 foreign processes
  (another agent's server + an unrelated orphan).

## Rules (non-negotiable)

### R1 — Zero-browser first
Default to deterministic non-browser tests: `node --test`, plain node scripts,
raw WebSocket/fetch clients against HTTP/WS endpoints. They cannot be hijacked,
are faster, and give pass/fail evidence. Use the browser ONLY for what genuinely
needs it: rendering, DOM, visuals, screenshots.

### R2 — One tab maximum
NEVER run two browser clients via two tabs. That flow is what caused both the
hijack chaos and the timing bug hunt. For a second client use:
- a **raw WebSocket inside the same page** (`playwright_browser_evaluate`
  with `new WebSocket(...)`), or
- a **node script client** running alongside the browser.

### R3 — Stamp, then re-verify EVERY step
After navigating a tab, immediately stamp it. Before EVERY subsequent tool call
on that tab (click, fill, evaluate, screenshot), assert identity:

```js
// STAMP (right after navigate):
() => { window.__TID = 'run-a1b2c3'; return 'stamped'; }

// ASSERT (before every other call on that tab):
() => (window.__TID === 'run-a1b2c3'
  && location.href.includes('YOUR-PATH-MARKER')) ? 'MINE' : 'HIJACKED'
```

If not `'MINE'`: **stop touching that tab**. Do not navigate it back (that
fights the other agent), do not close it. Open/select your own tab, restamp,
continue there.

### R4 — Never trust tab indices
`playwright_browser_tabs list` output is a snapshot; ordering changes under
other agents. Always locate YOUR tab by asserting the stamp/URL, never by
remembering "tab 0 was mine".

### R5 — Atomic time-sensitive assertions
If the UI under test fades/expires state (chat logs fading after 8s, toasts,
transient banners), the trigger-and-check MUST happen fast:
- prefer ONE `evaluate` call that sends then polls in-page, or
- check within the immediately-next tool call — never a leisurely
  multi-call tour in between.
A slow check is indistinguishable from a broken feature.

### R6 — Own servers: probe ports, record PIDs
- Bind test servers to probed-free ports, never assumed fixed ones.
- Record the exact PID of every process you spawn (echo `$PID`/child pid).
- Cleanup = kill ONLY those recorded PIDs. **Never** filter-by-name sweeps
  (`Get-Process node | Stop-Process`, `taskkill /IM node.exe`) — that is how
  foreign agents' servers die. If a stray must die, verify its command line
  first (`Get-CimInstance Win32_Process -Filter "ProcessId=$pid" |
  Select CommandLine`) and only touch provably-yours processes.

### R7 — Artifacts stay in your lane
Screenshots/traces/downloads go to your own run/temp dir. Never redirect MCP
artifacts to shared paths; never write into another agent's working dirs.

### R8 — Shared infra is read-only unless you built it
Do not stop/remove docker containers, services, or system servers you didn't
start (they may be another LIVE agent's rig right now). If shared infra
vanishes mid-run, note it, restore per documented config if you own that
config, and continue with local/deterministic tests instead.

## Copy-paste: single-tab two-client MP check

```js
// In YOUR stamped tab (game already joined as player A):
async () => {
  const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')
    + location.host + '/ws/YOURGAME');
  await new Promise(r => ws.onopen = r);
  const msgs = [];
  ws.onmessage = e => msgs.push(e.data);
  ws.send(JSON.stringify({type:'join', room:'probe', name:'RawPeer'}));
  await new Promise(r => setTimeout(r, 1200));   // stay under fade windows
  ws.close();
  return msgs.length;                            // >0 ⇒ relay works
}
```

## Copy-paste: free-port probe (PowerShell)

```powershell
$l = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$l.Start(); $port = ($l.LocalEndpoint).Port; $l.Stop(); $port
```

## Decision tree

```
Need to verify web behavior?
├─ Logic/protocol/network?  → node script / raw WS client (R1) — done
└─ Visual/DOM?
   └─ Stamp tab (R3) → verify before EACH call → hijacked?
      ├─ yes → abandon tab silently, open fresh, restamp
      └─ no  → proceed; keep trigger→assert atomic (R5)
Second client needed? → NEVER a second tab (R2): raw WS in-page or node.
```
