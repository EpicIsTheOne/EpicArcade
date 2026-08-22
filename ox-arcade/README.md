# Ox Arcade

A local museum for everything built in this folder by /goal loops — one page,
every exhibit, playable in place. Syncs with the EpicArcade repo so the same
collection can live on a server.

## Start

Double-click `start.cmd` (or run `npm start`), then open
<http://127.0.0.1:8795>.

## What it does

- **Auto-discovers builds** — scans the parent folder live; deep-walks to
  depth 3 for HTML entries (`index.html`, `public/`, `src/`, `dist/`,
  `app/`, any `.html`). No entry point => marked `INCOMPLETE`.
- **Thumbnails** — headless Edge/Chrome screenshots over an ephemeral local
  HTTP server (ES-module games need http, not file://), cached per build and
  regenerated when a build changes.
- **Play in place** — each build is served sandboxed at `/play/<id>/…`. The
  overlay probes files before mounting; if they don't load it says so
  honestly instead of claiming a missing entry point.
- **Live hover previews** — resting on a card swaps the screenshot for a
  muted, real running instance of the game after a moment.
- **Harness badges** — data-driven from `HARNESS_META` in `lib/scan.js`;
  foreign harnesses and Hermes get a colored badge. There is no ox-alpha tag
  (the model is metadata, not a tag).
- **Naming** — folders may carry bracket tags:
  `<Project> [model=<id>] [<harness-key>] [run=<NN>]`. Windows forbids `:` in
  dir names, so use `=` on disk; `:` is also accepted (Linux-side names).
  Legacy folders keep working untouched. Models not named in the folder come
  from `.archive-overrides.json` (`"model": "..."`) in the games root.

## EpicArcade sync (github.com/EpicIsTheOne/EpicArcade)

Off by default locally; on the server set `ARCHIVE_SYNC=1`.

- Repo layout IS the URL: `<Model>/<Project>/<Harness>/` inside the repo.
  Optional per-game `arcade.json`: `{ "title", "description", "thumb" }`.
- The repo root may contain `deployed.json`:
  `{ "<Model>/<Project>/<Harness>": "https://host/<same>/path/" }` — your
  server agent records live URLs there; both machines learn them via git.
  This app never hardcodes a domain.
- When sync is on: synced games appear as cards (UNDEPLOYED ribbon until a
  deployed link exists), are served same-origin at
  `/<Model>/<Project>/<Harness>/…`, and `POST /api/sync` forces a pull.
  Polling: every `ARCHIVE_POLL_MIN` minutes (default 15).
- Publish a local build into the repo:

  ```
  npm run publish -- <buildId> --model OxAlpha [--project FNAF] [--harness Hermes] [--dry-run] [--force]
  ```

  Refuses to overwrite an existing route without `--force`; never touches
  `deployed.json`.

## API

| Route | What |
|---|---|
| `GET /api/builds` | scan JSON (+ `harnessMeta`, + `arcade` block when syncing) |
| `POST /api/thumb/:id` | regenerate one thumbnail |
| `POST /api/reveal/:id` | open build folder in Explorer |
| `POST /api/sync` | force an EpicArcade pull (403 unless sync enabled) |
| `GET /play/:id/…` | build files (path-traversal guarded) |
| `GET /<M>/<P>/<H>/…` | synced repo game files (sync mode only) |
| `GET /thumbs/:id.png` | generated thumbnails |

## Config

- `ARCHIVE_SYNC=1` — enable EpicArcade sync (server deployments).
- `ARCHIVE_ARCADE_DIR` — where the EpicArcade clone lives
  (default `<app>/.archive/arcade-repo`).
- `ARCHIVE_ARCADE_REPO` — alternate repo URL.
- `ARCHIVE_POLL_MIN` — sync poll interval in minutes (default 15).
- `ARCHIVE_ROOT` — point the scanner at a different folder.
- `ARCHIVE_PORT` — port (default 8795, falls back to 8796 if busy).
- `ARCHIVE_BROWSER` — force a specific browser executable for thumbnails.
- `.archive-overrides.json` (in the games root) — optional per-build
  `{ "title", "description", "tags", "model", ... }` overrides.

### Deploying behind a reverse proxy (kvm2 example)

Run with `ARCHIVE_SYNC=1`, then proxy your domain to the app's port. A
request to `https://your.domain/OxAlpha/FNAF/Hermes/` maps straight onto the
repo route — no per-game configuration needed. Put the domain in the proxy
config, never in this codebase.

## Tests

```
npm test        # 16 tests: scanner, server, arcade sync core
```

Zero runtime dependencies. Node 18+.

## Gotchas (learned the hard way)

- Headless Edge writes the PNG long after its launcher exits — always wait
  for the file to settle (`waitForSettled`), and use a fresh profile dir per
  attempt or zombie processes hijack the launch.
- Kill headless Edge by command line (`--headless` match), never by name —
  normal browser windows must survive.
- If an orphaned node process holds 8795, kill that PID specifically before
  restarting.
