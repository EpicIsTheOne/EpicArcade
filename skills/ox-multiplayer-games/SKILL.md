---
name: ox-multiplayer-games
description: >
  MUST USE when creating, building, modifying, or deploying multiplayer /
  online / networked games for the Ox Arcade (techexplore.us/OxArcade) or any
  OX Alpha stack game — e.g. "make a multiplayer game", "add netcode", "tag
  this game as online", "why is my game not showing the MP badge". Encodes the
  expected layout, arcade.json manifest format, netcode requirements that the
  scanner detects, deployment targets on kvm2, and verification steps. Also
  applies when a game should be tagged online-capable without shipping netcode.
---

# Multiplayer / online games in the Ox Arcade

How games get the "⇄ MP" badge and appear under the **Online** filter at
https://techexplore.us/OxArcade/, and how to build games that legitimately
earn it.

## The three ways a game becomes "multiplayer" (precedence order)

1. `.archive-overrides.json` (repo/games-root root) — ops-level force on/off. Wins over everything.
2. **Per-game `arcade.json` declaration** — the normal, explicit way (see format below).
3. Netcode scan — automatic fallback: the scanner flags a game when its OWN
   source uses realtime-network APIs.

## Required: per-game `arcade.json`

Every game folder should contain an `arcade.json` next to its `index.html`.
Minimal single-player:

```json
{ "title": "My Game", "description": "One-liner shown on the card." }
```

Multiplayer-declaring forms (pick one):

```json
{ "title": "My Game", "multiplayer": true }
```

```json
{ "title": "My Game", "multiplayer": { "endpoint": "/ws/my-game" } }
```

- Object form declares multiplayer AND names the socket endpoint (shows in the
  badge tooltip). `"multiplayerEndpoint"` also works as a flat key.
- Only set `"multiplayer"` on games that actually implement netcode. Never
  declare it for AI-bot-only games — bots are not multiplayer.

## If you implement netcode, make it detectable

The scanner (`ox-arcade/lib/scan.js`) flags these APIs in the game's own files:

| Signal     | Detected patterns |
|------------|-------------------|
| websocket  | `new WebSocket`, `require/import of 'ws' or 'socket.io*'`, `io("ws://…")` |
| webrtc     | `RTCPeerConnection`, `RTCDataChannel` |
| sse        | `new EventSource` |

Scanner constraints your code must respect:
- Real netcode calls must be in the game's **own** `.js/.html/.mjs` files.
- Files > 600 KB are skipped (bundled engines), scan budget 3 MB total.
- These directories are NEVER scanned: `test(s)`, `scripts`, `tools`, `qa`,
  `e2e`, `screenshots`, `shots`, `reference`, `docs`, `saves`, `node_modules`,
  dot-dirs. Don't hide netcode there.
- Emscripten/WASM vendor shims contain `WebSocketConstructor` noise — netcode
  that lives ONLY in `vendor/` does not count. Declare via arcade.json instead.

## Layout & deploy targets

- Local repo: `github.com/EpicIsTheOne/EpicArcade` → `OxAlpha/<Model>/<Project>/<Harness>/`.
- kvm2 runtime: `/var/www/OxArcade/games-root/<GameName>/` (flat, one folder per
  build, entry `index.html`). Served by container `oxarcade`, bind-mounted from
  `/opt/ox-arcade/ox-arcade`.
- Shared backends: container `oxlive` (ox-live runtime, port 8090 on kvm2) hosts
  multiplayer server code so multiple games can share one process.
- Code changes inside `ox-arcade/` itself need `docker restart oxarcade`;
  game content + arcade.json changes do not.

## Going live + verification

arcade.json / content changes are picked up by the ~60s scan TTL — no restart.

```bash
# after deploying the game folder + arcade.json:
curl -s https://techexplore.us/OxArcade/api/builds \
  | python3 -c 'import json,sys; [print(b["id"], b["title"], b.get("multiplayer"))
                for b in json.load(sys.stdin)["builds"]]'
```

Expect `"supported": true` (and `"source": "override"` if declared, `"scan"`
if auto-detected). Then eyeball the site: card shows **⇄ MP**, tooltip shows
the endpoint, and the **Online** filter lists the game.

## Hygiene

- Test entries/declarations are temporary — revert demo tags before finishing.
- A game that fails its netcode in QA should ship `"multiplayer": false`, not
  a hopeful `true`.
- Don't commit secrets or endpoints pointing at unauthenticated write APIs.
