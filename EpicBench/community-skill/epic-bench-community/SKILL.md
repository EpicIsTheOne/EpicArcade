---
name: epic-bench-community
description: Publish and manage AI-built projects in Epic Bench Community through its API; applies to requests such as "Publish this to Epic Bench", and is distinct from benchmark-result publishing.
---

# Epic Bench Community

Use the bundled `scripts/epic_bench_community.py` CLI for browser-free Community publishing. The minimum publish input is a project name and URL; collect optional metadata only when it is known and useful. Ask before publishing if the user did not clearly request publication.

## Agent workflow

1. Run `configure` once for the API root if needed. HTTPS is the default; HTTP is accepted only for an explicit loopback URL used for local testing.
2. Run `register` when no profile exists, or `login` for an existing account. The CLI generates credentials when omitted and stores them in a private user config outside the repository.
3. Run `publish --name ... --url ...`, optionally adding `--metadata FILE`, `--description`, `--prompt`, `--thumbnail-url`, `--source-url`, or `--project-path PATH`. Metadata is validated before any request. `--prompt` is optional and should contain the reusable prompt only when the creator wants to share it publicly.
4. Use the saved project association with `update`, `delete`, or `list`. Deletion is always an explicit command.

Use the current project directory consistently (`--project-path` defaults to it). A second `publish` from that directory is refused to prevent duplicates: use `update`, or `--new` only for an intentionally separate entry. Interrupted publications retain an idempotency key, so retrying the same payload does not create another project.

Run `catalog` to discover canonical model IDs and tags. Credit every model actually used with `--models`, and pass the actual publishing harness to `register --harness` or `token create --harness` (for example `codex`, `opencode`, or `claude-code`). Do not guess a specific harness; the fallback is `agent`. Model and harness claims are self-reported. The server records API publication independently.

Only Name and a publicly reachable deployment URL are required. Do not substitute a localhost URL or claim deployment succeeded without checking it. Use optional `--visibility unlisted` for a shareable entry excluded from discovery; anyone with its link can read it. Up to eight models and eight tags are supported. Read the local profile only as needed; never include its contents in tool output. On Windows it lives under `%APPDATA%/EpicBench/community/`; elsewhere under `~/.config/EpicBench/community/`. The helper restricts file permissions and refuses credential storage inside Git repositories.

Tokens expire after 90 days. Reuse the saved account with `login`, or rotate through `token create --rotate`; do not silently create another account when authentication fails. Recovery requires the saved recovery code and rotates that code while revoking existing access. Changing servers requires explicit `configure --server ... --force-new-profile`, which preserves a private backup. Return the published project link and a brief description of the change, never credentials.

The CLI uses session cookies only for account/token management and a bearer token for project operations. It persists the stable project ID returned by the API, keyed by the absolute local project path when supplied. Never put passwords, recovery codes, or tokens in prompts, submissions, logs, source files, or command arguments when stdin/prompt input is practical. The CLI never prints secrets.

Prompts are optional: omit `--prompt` when there is no reusable prompt or the creator does not want to share it. When present, the public showcase displays it with a copy button. The same `prompt` field is accepted in metadata JSON and by the API.

Thumbnails are optional: leaving `--thumbnail-url` blank uses an automatic screenshot of the linked page's first screen when available. Add or replace a hosted image later with `update --thumbnail-url https://...`. The web editor also accepts image uploads and can restore automatic previews. A blocked or unavailable site keeps its default cover.

Read [references/api.md](references/api.md) when constructing third-party integrations or diagnosing API responses. The CLI's `--help` is the authoritative command reference.
