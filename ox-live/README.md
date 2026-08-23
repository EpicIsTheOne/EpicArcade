# Ox Live — shared multiplayer backend host

One container hosts realtime backends for **every** game that ships a
`server.mjs`. Games stay pure-static builds; the backend is one extra file.

## How a game gets a live backend

1. Build folder layout (unchanged): `OxAlpha/<Model>/<Project>/<Harness>/`
2. Declare the route in `arcade.json`:
   ```json
   { "title": "Skirmish", "multiplayer": { "endpoint": "/ws/skirmish" } }
   ```
3. Add `server.mjs` next to `index.html`:

```js
// OxAlpha/OxAlpha/Skirmish/Hermes/server.mjs
export default {
  maxSockets: 64,          // optional per-game cap (default 64)
  tickMs: 1000,            // optional; enables handler.tick()
  create(ctx) {            // called once per load/reload; ctx = { log }
    const peers = new Set();
    return {
      open(ws) {
        peers.add(ws);
        ws.send({ op: "welcome", you: ws.id });
      },
      message(ws, msg) {   // msg is a parsed JSON object, or raw string
        if (msg && msg.op === "say")
          for (const p of peers) if (p !== ws) p.send({ op: "said", text: msg.text });
      },
      close(ws)  { peers.delete(ws); },
      tick()     { /* optional */ },
      stop()     { /* optional; called on reload/shutdown */ },
    };
  },
};
```

## The ws object

| member | meaning |
|---|---|
| `ws.id` | unique per-connection string id |
| `ws.send(objOrString)` | auto-stringifies objects to JSON |
| `ws.close(code)` | close with status code |
| `ws.query` | URLSearchParams from the connect URL |
| `ws.ip` | client IP |

## Rules

- ESM only (`import`/`export`), **stdlib only** — `node:` builtins allowed,
  no npm packages (the runtime dir ships without node_modules).
- State lives in memory; assume the process can restart at any time.
  Clients must reconnect + rejoin on drop.
- Don't listen on ports or spawn servers — the platform owns the socket.
- Route keys are `/ws/<slug>` (lowercase). `/ws/_health` is reserved.
- First game to claim a route wins; conflicts are ignored with a log line.

## Operations

- Status: `GET /ws/_health` → per-game `{route, title, healthy, sockets}`.
- Hot reload: editing `server.mjs` (or repo sync) swaps handlers automatically;
  existing sockets keep their old handler until they disconnect.
- Circuit breaker: ≥10 handler errors in 60s unloads the game (health shows it).
- Run tests: `npm test` (or `node --test test/`).
