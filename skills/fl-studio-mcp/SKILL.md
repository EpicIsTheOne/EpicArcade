---
name: fl-studio-mcp
description: >
  MUST USE when the user wants FL Studio automation — e.g. "make a beat in FL
  Studio", "control FL Studio", "add patterns/channels/mixer changes in FL",
  "render/export from FL Studio", "FL Studio MCP", or any task driving FL
  Studio transport, patterns, channels, mixer, plugins, piano roll, playlist,
  arrangement, or generators through MCP. Encodes this machine's installed
  fLMCP server (159 tools), the honest truth that FL has NO true headless mode
  (FL must be running with the bridge enabled), one-time FL-side activation
  steps, and version gotchas.
---

# FL Studio MCP via fLMCP (installed)

MCP server **fLMCP** (geezoria/FLStudioMCP) exposing **159 tools**: transport,
patterns, channels, mixer, plugin params, piano roll (staged via pyscript),
playlist, arrangement, automation-REC events, project save/render, plus
high-level music generators (scales/chords/progressions/arps/basslines/drums).

## Honest headless status

**FL Studio has no headless mode.** The MCP *server* runs headless as an agent
subprocess, but live tools need **FL Studio open with the bridge script
enabled**. Without it, every live tool returns
`bridge unavailable: connection refused` — graceful, never a crash. Plan work
as: ask user to launch FL once → then drive it.

## What's installed on this machine

| Piece | Location |
|---|---|
| Server clone + venv | `C:\Users\Epic\mcp-servers\FLStudioMCP` (Python 3.12 venv) |
| Server entry point | `C:\Users\Epic\mcp-servers\FLStudioMCP\.venv\Scripts\fl-studio-mcp.exe` |
| opencode registration | `~/.config/opencode/opencode.jsonc` → `mcp.fl-studio` (stdio) |
| FL bridge script | `%USERPROFILE%\Documents\Image-Line\FL Studio\Settings\Hardware\fLMCP Bridge\device_FLStudioMCP.py` |
| Piano-roll pyscript | `...\Settings\Piano roll scripts\ComposeWithLLM.pyscript` |
| FL versions present | FL Studio 20 / 21 / 2025 / 2026 — use **2025+** (TCP bridge needs its Python 3.12) |

## One-time FL-side activation (user does this in the GUI)

1. Launch **FL Studio 2025+**.
2. `Options > MIDI Settings > Input`: enable ANY input row and set
   **Controller type = `fLMCP Bridge`** (no MIDI hardware needed; loopMIDI row
   works). Script output should show `[fLMCP] TCP server listening on
   127.0.0.1:9876`.
3. Open any piano roll → scripts dropdown → pick **ComposeWithLLM** as active
   (binds Ctrl+Alt+Y used for staged note edits).
4. Allow FL64.exe through Windows Firewall for 127.0.0.1:9876 if prompted.

After that, agents just call tools. Verify with a cheap read (`ping`,
project/transport state) before mutating.

## Version gotchas (verified on this machine)

1. **Pin `mcp>=1.2,<2`** — the venv originally resolved mcp 2.0.0 where
   `mcp.server.fastmcp` no longer exists (`ModuleNotFoundError`). Fixed by
   installing `mcp==1.29.0`. If the server ever fails at import with that
   error, re-run:
   `.venv\Scripts\python.exe -m pip install "mcp>=1.2,<2"`
2. **System python is 3.9** — package requires ≥3.10. The venv uses
   `C:\Users\Epic\AppData\Local\Programs\Python\Python312\python.exe`.
   If reinstalling, DELETE the stale `.venv` first (the installer reuses it).
3. Core install skips audio extras (librosa etc.). Voice-to-MIDI / audio
   analysis tools need:
   `.venv\Scripts\python.exe -m pip install -e "C:\Users\Epic\mcp-servers\FLStudioMCP[audio,gui]"`
4. Piano-roll edits flow through staged JSON + synthesized Ctrl+Alt+Y — FL's
   window must exist (it can be minimized); keep focus-stealing in mind when
   other agents are doing GUI work.
5. Only ONE bridge client can hold TCP 9876 per FL instance; if bind errors
   appear in FL's script output, another copy is running.

## Wiring into other harnesses

```json
{
  "mcpServers": {
    "fl-studio": {
      "command": "C:\\Users\\Epic\\mcp-servers\\FLStudioMCP\\.venv\\Scripts\\fl-studio-mcp.exe"
    }
  }
}
```

Works with any stdio MCP client (Claude Desktop/Claude Code/Cursor/OpenCode/
Codex). Reinstall path: clone repo → run
`scripts\install_windows.ps1 -SkipAudio -SkipClaudeConfig -PythonExe <py310+>`
→ delete stale `.venv` first if present → apply gotcha #1 pin → register.

## Verify installation

Server alone (no FL needed):
initialize over stdio → `tools/list` must return 159 tools; any live tool call
returns a graceful `bridge unavailable` message.

Full chain (FL running + activated): call a read tool like project state /
transport state and get real values back instead of `bridge unavailable`.
