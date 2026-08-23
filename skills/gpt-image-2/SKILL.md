---
name: gpt-image-2
description: Generate or edit images with GPT Image (gpt-image-2) through ChatGPT/Codex OAuth WITHOUT an OpenAI API key. Use when the user asks to generate, create, draw, render, or edit an image, picture, art, illustration, logo, icon, mockup, sprite, texture, or diagram — including batch jobs (up to N images) and background queues. Reads locally signed-in Codex CLI credentials (~/.codex/auth.json) and calls the ChatGPT backend image_generation tool. Safe for multiple agents running concurrently. Works in any harness that can run shell commands.
---

# GPT Image 2 via ChatGPT (no API key)

Generate images with `gpt-image-2` using the user's existing ChatGPT/Codex sign-in.
No OpenAI API key, no browser automation — one HTTPS call per image returns base64
PNG over SSE. Includes a crash-safe job queue with file locking, PID-liveness claim
semantics, stale-runner requeue, and cross-process pacing, so multiple agents can
hammer it at once without double-generating or colliding files.

## Quick start

```bash
S="<skill_dir>/scripts/gpt_image.mjs"

# status check (no quota consumed)
node "$S" --status --json

# single image -> stdout prints exactly one line: absolute path of the PNG
node "$S" -o out.png "A lighthouse in a storm, oil painting"

# batch: 10 images, sequential + globally paced, continues past failures,
# writes sheet-1.png ... sheet-10.png, prints one path line each
node "$S" --n 10 --quality low -o sheet.png "sprite variants of a slime"

# edit with reference image(s), up to 4 via repeated --ref
node "$S" --ref input.png -o edited.png "Make it nighttime"
```

## Queue (recommended for >3 images or multi-agent work)

Persistent queue stored at `~/.local/share/gpt-image-skill/queue.json`.

```bash
node "$S" queue add [--ref r.png] [-o out.png] [--quality low] "prompt words"   # prints job id
node "$S" queue add --n 5 "same prompt, five takes"                             # enqueue 5 clones
node "$S" queue list [--json]
node "$S" queue status [--json]          # counts + live runner info; safe to poll anytime
node "$S" queue run --detach             # start background runner, returns immediately with pid
node "$S" queue stop                     # kill background runner(s)
node "$S" queue remove --id <jobId>
node "$S" queue clear                    # drop finished jobs (--all wipes pending too)
node "$S" queue run --parallel 2 --retry-failed   # foreground drain; retries failed/cancelled
```

**Recommended agent workflow for many images:** `queue add` all prompts ->
`queue run --detach` -> poll `queue status --json` every ~20s until
`counts.pending == 0 && counts.running == 0` -> read `path` fields from
`queue list --json`. Failed jobs keep their `error`; re-run with
`queue run --retry-failed`.

## Multi-agent safety guarantees

- **No lost updates:** every queue mutation happens under an atomic lockfile
  (create-exclusive + stale-lock takeover after 20s).
- **No duplicate generation:** runners claim one job at a time inside the lock;
  a claim stamps `runnerPid`, and other runners skip claimed jobs.
- **Crash recovery:** if a runner dies mid-job, its PID goes dead and the next
  claimer requeues the orphaned job automatically.
- **No filename collisions:** default outputs embed timestamp+pid+random;
  batch outputs get `-1`, `-2` ... suffixes.
- **Shared pacing:** all processes honor one global min-spacing between upstream
  requests (`--delay-ms`, default 1500ms) so concurrent agents cannot burst past
  ChatGPT's rolling window (~50 gens / 3h on Plus).

## Contract for harnesses

- Success (single): stdout has exactly ONE line — the absolute PNG path, or a
  JSON object with `--json`.
- Batch (`--n`): stdout has one path line per success (or one JSON object with
  `results[]`). Exit codes: `0` all ok, `2` partial, `1` total failure.
- Progress/logs go to stderr. Errors print `error: <message>` to stderr and exit nonzero.

## Requirements

- Node.js >= 18. No npm install needed.
- User signed in to Codex CLI once (`~/.codex/auth.json` exists). On 401, user
  must re-run `codex login` (the Codex CLI refreshes that token).
- ChatGPT plan with image-generation entitlement (Plus works: ~50 gens / rolling 3h).

## Options

| Option | Default | Purpose |
|---|---|---|
| `-o, --out <path>` | unique `generated-<ts>-<pid>-<rand>.png` | Output PNG path |
| `--out-dir <dir>` | cwd | Folder when `-o` omitted |
| `-n, --count <num>` | 1 | Batch size (sequential, paced, continues past failures) |
| `--ref <path>` | none | Reference image, repeatable up to 4 |
| `--model <name>` | `gpt-image-2` | Image model |
| `--chat-model <name>` | `gpt-5.5` | Chat model that drives the tool |
| `--size <WxH>` | `1024x1024` | e.g. 1024x1024, 1024x1536, 1536x1024 |
| `--quality <q>` | `high` | low / medium / high |
| `--delay-ms <ms>` | 1500 | Global min spacing between upstream requests |
| `--timeout <seconds>` | 300 | Per-request abort threshold |
| `--fail-fast` | off | Stop a batch on first failure |
| `--api-key <key>` | env OPENAI_API_KEY | Force official-API path instead |
| `--json` / `--status` / `-h` | | See contract above |

Env equivalents: `GPT_IMAGE_MODEL`, `GPT_IMAGE_CHAT_MODEL`, `GPT_IMAGE_SIZE`,
`GPT_IMAGE_QUALITY`, `GPT_IMAGE_BASE_URL`, `CODEX_AUTH_PATH`, `GPT_IMAGE_DATA_DIR`
(relocates queue/pace state).

## How it works (for reimplementing in other runtimes)

1. Read `~/.codex/auth.json`; use `tokens.access_token` (a ChatGPT OAuth JWT).
   If the file contains an `OPENAI_API_KEY`, fall back to the official API.
2. Base64url-decode the JWT payload, read claim
   `["https://api.openai.com/auth"].chatgpt_account_id`.
3. `POST https://chatgpt.com/backend-api/codex/responses` with headers:
   - `Authorization: Bearer <access_token>`
   - `originator: codex_cli_rs`, `User-Agent: codex_cli_rs/0.0.0`
   - `ChatGPT-Account-ID: <account_id>`
   - `Accept: text/event-stream`, `Content-Type: application/json`
4. Body:
```json
{
  "model": "gpt-5.5",
  "store": false,
  "instructions": "You are an assistant that must fulfill image generation requests by using the image_generation tool when provided.",
  "input": [{ "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "<prompt>" }] }],
  "tools": [{ "type": "image_generation", "model": "gpt-image-2", "size": "1024x1024", "quality": "high", "output_format": "png", "background": "opaque", "partial_images": 1 }],
  "tool_choice": { "type": "allowed_tools", "mode": "required", "tools": [{ "type": "image_generation" }] },
  "stream": true
}
```
   Reference images become extra content items:
   `{ "type": "input_image", "image_url": "data:image/png;base64,<b64>" }`.
5. Buffer the whole SSE response, parse `event:`/`data:` JSON records, recursively
   keep the LAST match of `type === "image_generation_call"` with string `result`,
   or any `partial_image_b64`. That string is base64 PNG — decode and write.

Derived from the proven implementation in Project Reika
(`server/src/modules/art/imageGeneration.ts`). Verified working August 2026,
including 2-up batches and detached queue runs on a Plus plan.

## Troubleshooting

- **401/403** → expired token: re-run `codex login`.
- **No auth.json** → run `codex login` once, or pass `--api-key`/`OPENAI_API_KEY`
  (then official `/v1/images/*` endpoints are used; edits retry `image[]`→`image` on 400).
- **Stream had no result** → plan entitlement or content refusal; rephrase or check plan.
- **Job stuck in running** → its runner PID died; start any `queue run` and the claim
  sweep will requeue it automatically.
- **Timeouts** → raise `--timeout`; high-quality large images can take minutes.
- **Limit messages in errors** → hit the ~50/3h rolling window; wait, or lower
  `--n`/batch sizes.
