---
name: fl-studio-mcp
description: >
  MUST USE when the user wants FL Studio automation — e.g. "make a beat in FL
  Studio", "control FL Studio", "add patterns/channels/mixer changes in FL",
  "render/export from FL Studio", "FL Studio MCP", "headless FL Studio", or any
  task driving FL Studio transport, patterns, channels, mixer, plugins, piano
  roll, playlist, arrangement, or generators through MCP. Encodes this
  machine's installed fLMCP server (159 tools) + threadless file-bus relay
  (works with FL minimized), one-time FL-side activation steps, and the
  FL-2025.2/2026 sub-interpreter gotchas that break the upstream bridge.
---

# FL Studio MCP via fLMCP + file-bus relay (installed)

MCP server **fLMCP** (geezoria/FLStudioMCP, 159 tools) driving FL Studio
through a **threadless file-bus bridge** custom-patched for this machine —
upstream's in-FL TCP server cannot start on FL 2025.2+/2026 (see gotchas).

## Headless reality (works!)

FL Studio has no `--background` mode, BUT the bridge works with FL **minimized**
— park it in the taskbar and agents drive it. Verified empirically.

**One constraint**: the in-FL script drains commands from `OnIdle()`, which
fires only while FL's process keeps a live window. Keep FL open (minimized is
fine); quitting FL = tools return `bridge unavailable` until relaunched.

## Architecture (this machine)

```
agent → MCP server (stdio, 159 tools) → TCP 127.0.0.1:9876 → flmcp_relay.py
      → file bus (request.json / response-<nonce>.json)
      → device script OnIdle() inside FL 2025 → FL API
```

| Piece | Location |
|---|---|
| Server + relay + patched bridge | `C:\Users\Epic\mcp-servers\FLStudioMCP` |
| Relay (owns TCP 9876) | `flmcp_relay.py` — autostarts at logon via Startup-folder `fLMCP-relay.vbs` |
| opencode registration | `~/.config/opencode/opencode.jsonc` → `mcp.fl-studio` |
| Device script (deployed) | `%USERPROFILE%\Documents\Image-Line\FL Studio\Settings\Hardware\fLMCP Bridge\device_FLStudioMCP.py` |
| FL target | **FL Studio 2025** (scripting v38). FL 2026 also bound but its sandbox blocks the old TCP path; file-bus works on both in principle |
| Bus dir | `...\Settings\Hardware\fLMCP Bridge\bus\` (relay + FL must agree; relay logs `bridge.log` there too) |

## FL-side activation (done once, survives restarts)

FL 2025: Options → MIDI Settings → Input `loopMIDI Port` → Controller type
**`fLMCP Bridge`** → **Port 3** → Enabled. (loopMIDI installed; virtual port
autocreates at logon.) Piano roll → scripts → **ComposeWithLLM** selected for
note-writing tools. FL 2026 has the same binding but prefer 2025.

**After every FL (re)start**, the script instance needs one nudge to attach
(FL 2025.2 auto-attach is racy). Run the attach script IMMEDIATELY after
launching FL, while FL still owns the foreground:

```powershell
& C:\Users\Epic\mcp-servers\FLStudioMCP\fl_attach_bridge.ps1
```

It focuses FL, sends F10, toggles the Enable switch off→on at the dialog's
fixed position, and closes the dialog. Verify with the smoke test below.
If it fails, retry once — foreground races with other apps are the usual cause.

## Gotchas — all verified the hard way on this machine

1. **Threads are banned in FL scripts**: FL 2025.2+/2026 sub-interpreters
   disable daemon threads AND `start_new_thread` fails outright
   (`SystemError: returned NULL`). Upstream fLMCP's TCP-in-FL design cannot
   work → hence the relay + file bus. Never "fix" by re-adding threads.
2. **FL's interpreter breaks `os.remove`/`os.replace`** (`error return
   without exception set`) while `open/write` works. The device script never
   deletes/renames — the relay consumes and cleans up bus files.
3. **`os.environ` inside FL scripts is unreliable** — path logic uses
   `USERPROFILE`/`Path.home()` (SCRIPT_DIR), never TEMP/LOCALAPPDATA.
4. **`ScriptFolder` registry value = the script's declared `# name=`**, not
   the folder name (FL 2026), while FL 2025 resolves by folder name — keep
   folder name AND `# name=` identical (`fLMCP Bridge`) to satisfy both.
5. **Registry-seeded MIDI rows don't instantiate scripts** — binding must
   happen through FL's MIDI dialog once. Row values must be **REG_SZ strings**
   (DWORD `ConnectionCounter` crashes FL 2025 at startup: "Invalid data for
   'ConnectionCounter'").
6. **Pin `mcp>=1.2,<2`** in the server venv (mcp 2.0 removed
   `mcp.server.fastmcp`). System python is 3.9 — the venv is Python 3.12;
   delete a stale `.venv` before reinstalling with a different interpreter.
7. **Only one bridge client** may hold TCP 9876 — if tools time out, check
   for zombie relays: `Get-CimInstance Win32_Process -Filter "Name like
   'python%'" | ? CommandLine -match flmcp_relay` → kill by PID.
8. **Multiple FL instances fight over MIDI ports** — keep exactly one FL
   running.
9. **`project_save` on an untitled project pops a MODAL dialog** (name +
   location) that blocks every subsequent API call with "Operation unsafe at
   current time". Either never save untitled projects, or use
   `project_save_as` with an explicit path, or dismiss the modal via GUI.
10. **"Operation unsafe at current time" from any tool = a modal dialog is
    open in FL** (save prompt, welcome window, etc.). Screenshot FL, dismiss
    the dialog, retry. `ui.openPianoRoll` and pitched piano-roll tools are
    also focus-gated by FL's design — keep FL foregrounded for those.
11. **Working bass without the pyscript**: step-sequence the FLEX Bass
    channel + `channels.setPitch` (constant root-pedal bassline — trap-
    appropriate). Pitched note variety requires the ComposeWithLLM pyscript
    armed (one-time per FL install: piano roll → scripts dropdown).

## Operations

- Relay status: `Test-NetConnection 127.0.0.1 -Port 9876` + check
  `...\fLMCP Bridge\bridge.log` for `[fLMCP]` lines.
- Manual relay start: `Start-Process .venv\Scripts\pythonw.exe -ArgumentList
  'flmcp_relay.py' -WorkingDirectory C:\Users\Epic\mcp-servers\FLStudioMCP`
- Smoke test: `.venv\Scripts\python.exe scripts\smoke_test.py`
- After editing the device script: copy to the Hardware folder, then **Reload
  script** in FL's Script output panel (or restart FL).
- Audio/voice extras (librosa etc.) not installed — install with
  `pip install -e ".[audio,gui]"` if a task needs voice-to-MIDI/audio analysis.
