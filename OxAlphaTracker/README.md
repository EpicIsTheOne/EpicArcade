# OxAlphaTracker

Prompt-pack tracker + benchmark status API for the OX ALPHA stack.
Serves the tracker site AND the prompts/status API from one process.

## Run

```bash
python3 api_server.py [port] [host]        # defaults: 8123 / 127.0.0.1
OXALPHA_API_KEY=<secret> python3 api_server.py 8932 0.0.0.0   # production mode
```

- `OXALPHA_API_KEY` env var sets the write key. Unset => `Epic` (local dev only).

## API

Reads are open (no auth):

| Endpoint | Description |
|---|---|
| `GET /api` | help / endpoint list |
| `GET /api/meta` | counts + difficulty breakdown |
| `GET /api/prompts?difficulty=&search=&ids=&fields=` | filtered prompt list |
| `GET /api/prompts/{id}` | single prompt |
| `GET /api/prompts/{id}/text` | raw prompt text |
| `GET /api/status?run=&model=&status=&promptId=` | reported benchmark statuses |

Writes require the API key (`Authorization: Bearer <key>`, `X-API-Key`, or `?key=`):

| Endpoint | Description |
|---|---|
| `POST /api/status` | upsert `{run, model, promptId?, status, score?, durationMs?, notes?}` |
| `DELETE /api/status?run=<id>` | clear all entries of one run |

## Production (kvm2)

Docker container `oxalphatracker` (python:3-alpine) mounts this folder at `/app`
and serves port 8932 behind Traefik at `https://techexplore.us/OxAlphaTracker/`.
The real API key lives in `.env` next to `api_server.py` on the server (chmod 600,
gitignored — never commit it).
