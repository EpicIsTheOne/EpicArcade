---
name: blender-headless-mcp
description: >
  MUST USE when the user wants 3D work done via Blender without opening its UI —
  e.g. "render a 3D scene", "make a model in Blender", "export GLB/FBX/OBJ",
  "bpy script", "Blender MCP", "headless render", or any task involving Blender
  automation, scene generation, mesh editing, materials, animation, VSE video,
  or VRM avatars driven by an agent. Encodes the installed headless Blender MCP
  setup on this machine, how to call it from opencode and other harnesses, and
  the Windows/Blender-4.x gotchas that silently break naive scripts.
---

# Headless Blender MCP (installed)

Drives **real Blender** headless (`blender --background`) through an MCP server:
71 tools — scripting, mesh/material/lighting/camera ops, geonodes, sculpt,
physics, render PNG/MP4, export GLB/GLTF/FBX/OBJ/USD/VRM, VSE, batch jobs.
No GUI needed for any of it.

## What's installed on this machine

| Piece | Location |
|---|---|
| MCP server (clone) | `C:\Users\Epic\mcp-servers\blender-mcp` (uv venv, run via `uv run`) |
| Blender binary | `C:\Program Files\Blender Foundation\Blender 4.3\blender.exe` |
| opencode registration | `~/.config/opencode/opencode.jsonc` → `mcp.blender` (stdio, env preset) |

Required server env (already set in opencode config; replicate elsewhere):
`BLENDER_EXECUTABLE=<path to blender.exe>`, `PYTHONUTF8=1`, `PYTHONUNBUFFERED=1`.

## Using it from opencode

Restart opencode after config changes. Then just ask ("build a red cube and
render it") — tools appear under the `blender` MCP server. The power tool is:

- **`script_execute`** — argument `code`: arbitrary `bpy` Python run inside a
  background Blender. This is the escape hatch when a high-level tool doesn't fit.

Other useful ones: `generate_blender_script` (NL → bpy, needs LLM backend),
`blender_render`, `blender_export`, `blender_batch`, `agentic_blender_workflow`,
`blender_status`. Call `tools/list` if unsure.

## Multi-agent safety (built-in)

The server caps total running Blender subprocesses **machine-wide**, so several
agents can hammer it without nuking the PC:

- **Slot gate**: every `script_execute`/export/render must acquire one of
  `BLENDER_MCP_MAX_CONCURRENT` slots (default **2**) via OS file locks before a
  Blender process spawns; extra requests queue politely and fail with an
  explicit "all N slots busy — retry" message after
  `BLENDER_MCP_QUEUE_TIMEOUT_S` (default 240s) instead of stacking processes.
  Locks die with their process — a killed agent can never wedge the gate.
- **Below-normal child priority**: spawned Blender processes run at below-normal
  priority so renders don't starve your foreground apps
  (`BLENDER_MCP_CHILD_PRIORITY=normal` opts out).
- **Per-process temp dirs + UUID-suffixed script IDs**: no file collisions
  between concurrent servers.

Tune for weak machines: set `BLENDER_MCP_MAX_CONCURRENT=1` in the MCP env block.
When you see "All N Blender execution slot(s) busy", just retry later — another
agent's render is finishing.

## Hard-won gotchas (these WILL bite)

1. **Windows charmap crash**: without `PYTHONUTF8=1` the server dies at startup
   printing emoji logs ('charmap' codec error). Always set it.
2. **Blender 4.3 engine enum**: `'BLENDER_EEVEE'` no longer exists — use
   `'BLENDER_EEVEE_NEXT'` (or `'CYCLES'` / `'BLENDER_WORKBENCH'`).
3. **Empty scenes lose camera binding**: after
   `read_factory_settings(use_empty=True)` + `camera_add`, you MUST
   `sc.camera = bpy.context.active_object` or renders fail with
   "Cannot render, no camera" even though a camera object exists.
4. **Failure reports look empty**: the executor checks return code first, so
   script errors surface as `Blender process failed (code 1): ` with blank
   stderr — your actual traceback went to stdout markers
   (`BLENDER_SCRIPT_ERROR: ...`). Don't debug from stderr alone.
5. **User addons pollute non-factory runs**: Roblox addons on this machine spam
   tracebacks when Blender starts normally. The server uses `--factory-startup`
   so this stays clean — don't drop that flag to "fix" something.
6. **Renders are slow**: default timeout is 300s per execution; pass explicit
   low resolutions/samples while iterating, high quality only for finals.

## Copy-paste minimal render (via script_execute)

```python
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_monkey_add(location=(0,0,0))
bpy.ops.object.light_add(type='SUN', location=(4,-3,6))
bpy.ops.object.camera_add(location=(0,-5,2), rotation=(1.35,0,0))
sc = bpy.context.scene
sc.camera = bpy.context.active_object          # required (gotcha #3)
sc.render.engine = 'BLENDER_EEVEE_NEXT'        # gotcha #2
sc.render.resolution_x = sc.render.resolution_y = 480
sc.render.filepath = r'C:\path\to\out.png'
bpy.ops.render.render(write_still=True)
```

## Wiring it into other harnesses

All stdio, same command shape (swap paths):

```json
{
  "mcpServers": {
    "blender": {
      "command": "uv",
      "args": ["--directory", "C:\\Users\\Epic\\mcp-servers\\blender-mcp",
               "run", "blender-mcp", "--stdio"],
      "env": {
        "BLENDER_EXECUTABLE": "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
        "PYTHONUTF8": "1",
        "PYTHONUNBUFFERED": "1"
      }
    }
  }
}
```

Optional env knobs: `BLENDER_MCP_MAX_CONCURRENT` (default 2), `BLENDER_MCP_QUEUE_TIMEOUT_S` (default 240), `BLENDER_MCP_CHILD_PRIORITY=normal`, `BLENDER_MCP_GATE_DIR`.

- Claude Desktop: `%APPDATA%\Claude\claude_desktop_config.json` (or drag the
  release `.mcpb`)
- Cursor / VS Code / Codex-compatible clients: their MCP config files, same JSON
- Health check: `uv run blender-mcp --check-blender` from the clone dir
  (ignore its stale "not found in PATH" text if Blender exists — verify by
  running a real tool instead)

## Verify installation

```bash
cd C:\Users\Epic\mcp-servers\blender-mcp
set PYTHONUTF8=1 && uv run python -c "import blender_mcp; print('OK')"
```

Then over MCP: initialize → `script_execute` with the render snippet above →
confirm the PNG exists on disk. That proves server + headless Blender + output
capture all work end-to-end.
