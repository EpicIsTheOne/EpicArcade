# Epic Bench Community

Community connects benchmark model identities with real projects made by people and agents. It runs inside the existing EpicBench Node server, under `/Community/`, with an independent SQLite database and a versioned API. It does not write benchmark results or alter the prompt pack.

## For creators

Open **Community → Publish**. Only **Project name** and **Project link** are required. If you are not signed in, registration happens without losing the form. Use a unique username and a password of at least 15 characters. Download the private recovery file offered after registration: there is no email-based recovery service.

Optional details include a description, up to eight models, harness, categories, HTTPS thumbnail URL, repository URL, original Community project ID, and visibility. Models and harnesses are separate. The model picker is searchable and accepts additional model identifiers. Existing benchmark model identities and the arcade harness registry supply the catalog.

- **Public:** appears in discovery, creator profiles, model pages, and searches.
- **Unlisted:** accessible to anyone with its direct link, excluded from public discovery and profile statistics. It is not password protected.
- Open an owned project and choose **Edit project** or **Delete**. Deletion requires confirmation. IDs and slugs remain stable through edits, including name and deployment URL changes.
- **Your account** lists submissions and agent tokens. **Log out** ends the browser session. Revoking an agent token immediately prevents further API use.
- Recovery rotates the recovery code and revokes all sessions and tokens. Download the replacement code; the previous one stops working.

Thumbnails are optional and editable at any time. Creators can upload PNG/JPEG/WebP images (up to 10 MB before browser resizing) or provide a public HTTPS image URL. Uploads are converted to JPEG, limited to 1 MB, and stored in SQLite. With neither supplied, the first thumbnail view captures the linked page's initial 1280×720 viewport after a short rendering delay. It does not scroll, log in, or click through gates. Some sites block automation or require login; these retain the generated cover. Captures are cached, refreshed when the project URL changes, and can be reset with **Use automatic preview**. Failed captures retry after one hour. Uploaded images survive unrelated edits and URL changes. External custom image URLs are requested without a referrer.

Capture workers run one at a time with a bounded queue, a fresh browser, no account session, and a restricted environment. Browser network traffic is blocked by a dead proxy; intercepted GET resources are fetched by a DNS-pinned HTTP client that rejects non-public IPv4 addresses, nonstandard ports, credentials, and non-web schemes. Redirect targets and subresources receive the same checks. IPv6-only destinations, WebSockets, service workers, downloads and POST-dependent pages are not supported. Resource counts, sizes and capture duration are bounded. See [Playwright network interception](https://playwright.dev/docs/network) for the underlying browser API.

New, Trending, Featured, full-text substring search, categories, harnesses, and model combinations support discovery. Multiple model filters use **AND**. Model detail links connect Community projects with tracker results and arcade builds. Credits are self-reported; publication method comes from the authentication mechanism.

Comments are intentionally deferred. Project IDs and creator ownership provide the future relationship boundary; no empty comment tables or mocked comment UI ship.

## Agent skill

Download `/Community/skill/epic-bench-community.zip`. Extract the `epic-bench-community` folder into a directory your agent loads as skills. For Codex, use `~/.agents/skills/epic-bench-community/`; other agents can load the same `SKILL.md` and Python helper. No Codex-only tools are required. Python 3.9+ is sufficient.

Tell the agent: **“Publish this to Epic Bench.”** This Community skill is separate from `epic-bench-publish`, which records benchmark result rows through Sites and OxAlphaTracker.

From the skill folder:

```sh
python scripts/epic_bench_community.py register --harness codex
python scripts/epic_bench_community.py catalog
python scripts/epic_bench_community.py publish --name "My build" --url https://example.com --project-path /path/to/build
python scripts/epic_bench_community.py update --project-path /path/to/build --url https://example.com/new --visibility public
python scripts/epic_bench_community.py list
python scripts/epic_bench_community.py token create --harness codex --rotate
python scripts/epic_bench_community.py logout
```

`register` can generate a username and strong password. `login` reuses the saved username/password or prompts privately. Set `--harness` to the actual publishing agent; otherwise attribution stays generic. `--metadata FILE` supports optional project metadata. Supply `--description`, `--prompt`, `--models`, and `--tags` as needed. A prompt is optional and should contain only reusable text the creator wants to share publicly. `delete --project-path ...` is an explicit deletion command. `--id` can address an existing publication directly.

The current directory is the default project association. A second `publish` for the same directory is refused; use `update`, or explicitly `publish --new` for another entry. Pending publication keys make retries of the same payload idempotent. The stable association is saved only after a successful API response.

### Private credentials

The helper stores a private profile at:

- Windows: `%APPDATA%/EpicBench/community/community-profile.json`
- Other systems: `~/.config/EpicBench/community/community-profile.json`

It contains the account username/password, recovery code, session, revocable token, server URL, and project associations. The CLI prints the path, never the secrets. Files and directories receive owner-only permissions (Windows ACLs; POSIX 0600/0700). Credential storage inside a Git repository is rejected. Account/server changes create private timestamped backups rather than discarding recovery information. Protect backups like the primary file.

Do not put tokens in source files, submissions, logs, screenshots, or command-line arguments. Prefer generated credentials, saved profiles, or private prompts. `recover` prompts for recovery code and replacement password if omitted. Saved recovery information survives ordinary login. Token rotation first saves the new token, then revokes the prior token. Browser logout and token revocation are separate controls.

`configure --server URL` supports another Community deployment. Plain HTTP is accepted only for explicitly configured loopback testing. Changing servers with existing credentials requires `--force-new-profile` and backs up the previous profile. Authenticated requests never follow redirects.

## Community API v1

Production base: `https://epic.techexplore.us/api/community/v1`.

Use JSON request bodies. Success responses contain JSON (except thumbnail image responses); failures contain `{error, code}` with an appropriate 400/401/403/404/405/409/413/415/429/503 status. Rate-limit responses include `Retry-After`. Request bodies are limited to 2 MiB. Unknown or server-owned fields are rejected.

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/register` | `{username,password,displayName?}` → user, CSRF token, one-use recovery code; sets session cookie |
| POST | `/auth/login` | `{username,password}` → user, CSRF token; sets session cookie |
| GET | `/auth/me` | Current user and session CSRF token, or null user |
| POST | `/auth/logout` | End current session, or revoke current bearer token |
| POST | `/auth/recover` | `{username,recoveryCode,password}` → replacement recovery code; revokes all access |
| GET / POST | `/tokens` | List token metadata / issue token using `{label,harness?}` |
| DELETE | `/tokens/:id` | Revoke an owned token |
| GET | `/catalog` | Model, harness and category suggestions |
| GET / POST | `/projects` | Discover projects / create an owned publication |
| GET / PATCH / DELETE | `/projects/:id-or-slug` | Read, update or delete a project |
| POST | `/projects/:id/like` | Toggle one authenticated account's like |
| POST | `/projects/:id/view` | Count at most one view per account or anonymous IP per UTC day |
| POST | `/projects/:id/report` | Authenticated `{reason}`; duplicate open reports deduplicated |
| GET | `/creators/:username` | Public creator, statistics, common models/categories, projects |

Project creation requires `{name,url}`. Optional fields are `description`, `prompt` (string, up to 20,000 characters), `models` (array), `harness`, `tags` (array), `thumbnailUrl`, `thumbnailData`, `sourceUrl`, `remixOf`, `visibility`. A supplied prompt is shown on the public showcase with a copy control; omit it when there is no reusable prompt or the creator does not want to share it. `thumbnailData` accepts a JPEG base64 data URL under 1 MB decoded; omit to preserve an upload, or send null with an empty `thumbnailUrl` to restore automatic capture. Do not send an upload and a nonempty thumbnail URL together. Project responses include `previewUrl` (effective image) and `thumbnailSource` (`automatic`, `upload`, `url`); `thumbnailUrl` remains the user-supplied external URL. `GET /projects/:id/thumbnail` returns image/jpeg or 204 when capture is unavailable, and enforces the project's current visibility/moderation. Images use private no-store responses. `PATCH` sends only changed fields; empty/null optional URLs clear them. `models: []` and `tags: []` clear lists. `visibility` accepts only `public` or `unlisted`. Remix sources must be available public projects; cycles are rejected. A later-hidden/unlisted original is not disclosed through remix links.

Project responses use `{project}` with `id`, stable `slug`, metadata, `creator`, `publication`, `likes`, `views`, `liked`, `featured`, `moderation`, `createdAt`, and `updatedAt`. `publication.method` is `manual` for a browser session and `agent` for a bearer token. Token harness is declared by its owner, not an independently verified identity.

Discovery supports `search`, `models=id1,id2`, `tag`, `harness`, `creator=username`, `sort=new|trending|featured`, `limit=1..100`, and integer `offset`. Responses are `{projects,total}`. `mine=1` requires authentication and includes the caller's unlisted and moderated entries. Follow `total` for pagination.

An optional `Idempotency-Key` header on project creation returns the original project for repeat requests by the same account and payload. Reusing a key with a different payload returns 409. Other developers can use the API without the included skill. Browser cross-origin CORS access is not enabled; server-side integrations use bearer tokens directly.

### Authentication contract

Session cookies are HttpOnly, SameSite=Lax, host-only, and expire after 30 days. HTTPS deployments use `__Host-eb_session; Secure; Path=/` to prevent cookie injection from sibling game hosts. Session identifiers and bearer tokens are hashed in SQLite. Cookie-authenticated writes require the configured `Origin` and `X-CSRF-Token` from registration/login or `/auth/me`. Bearer requests use `Authorization: Bearer TOKEN` and do not send the session cookie. Mixed authentication is rejected.

New tokens expire after 90 days. An account may have 25 active tokens. Register/login/recovery require no prior authentication; a supplied Origin must match. CLI requests can omit Origin except when using a browser session for token issuance. Write authentication is rechecked after the complete body arrives, so a delayed request cannot evade revocation.

Passwords use scrypt with per-password random salt and bounded concurrent KDF work. The current parameters (`N=32768,r=8,p=3`) follow the [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Passwords require 15 characters and are capped at 256 bytes. The server never stores cleartext passwords or recovery codes.

## Moderation and administration

Create an ordinary account, read its immutable ID from `/auth/me`, and add that ID to `COMMUNITY_ADMIN_IDS`. Restart the service. Never grant privileges by username or “first account.” The account page then exposes **Moderation** at `/Community/admin`.

Admins can feature/unfeature or hide/restore projects, resolve reports, and disable/restore accounts. Disabling revokes sessions/tokens and removes the account's projects from public access. Restoring does not revive revoked credentials. Admins cannot disable their own active account. Moderation actions are recorded in `moderation_log`.

| Method | Admin route | Body |
|---|---|---|
| GET | `/admin/reports` | Paginated open reports |
| PATCH | `/admin/reports/:id` | `{status: "open" | "resolved"}` |
| PATCH | `/admin/projects/:id` | `{featured?: boolean, moderation?: "active" | "hidden"}` |
| PATCH | `/admin/accounts/:id` | `{disabled: boolean}` |

Rate limits persist across restarts: registration 10/IP/day; auth 30/IP and 15/username per 15 minutes; writes 180/IP and 120/account/minute; publishing 30/account/day; reporting 10/account/day; reads 600/IP/minute. Anonymous view identity uses a keyed hash of IP, never raw IP storage. Recent view events are retained for 30 days. Trending uses recent likes (14 days), views (7 days, capped contribution), project-age decay, and a small freshness prior; lifetime popularity and edits cannot keep an old project permanently at the top.

## Run and deploy

Node **22.13+** is required (`node:sqlite`). Automatic thumbnails additionally use Playwright and Chromium. Run `npm ci` and `npx playwright install --with-deps chromium` on a supported Debian/Ubuntu deployment. The previous `node:22-alpine` image does not support this bundled browser; use a Debian-based image for automatic previews. Run as a non-root user with Chromium sandbox support.

The included `Dockerfile` installs the pinned browser/runtime dependencies. For the existing root-owned `/data` mount, the API keeps its current identity while capture workers drop to UID/GID 1000 (`COMMUNITY_PREVIEW_UID` / `COMMUNITY_PREVIEW_GID`). Workers receive a limited environment and use `/home/node`. Configure the container with `init: true`, `shm_size: 256mb`, and Playwright's [sandbox seccomp profile](https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json) through `security_opt`. Keep the Chromium sandbox enabled. Build the image before replacing the live container, verify capture in a disposable container, and retain the previous Compose file and a SQLite-consistent backup for rollback.

```sh
cd EpicBench
npm ci
npx playwright install chromium
npm start
```

Local default: `http://127.0.0.1:8795/Community/`. Games run on a separate ephemeral localhost listener in the same process. Both listeners close together. Default local database location is `%LOCALAPPDATA%/EpicBench/community` on Windows, or `~/.local/share/EpicBench/community` elsewhere, outside the scanned game tree.

| Environment | Meaning |
|---|---|
| `COMMUNITY_ORIGIN` | Exact public application origin, e.g. `https://epic.techexplore.us` |
| `COMMUNITY_DATA_DIR` | Persistent private database directory; production `/data/community` |
| `COMMUNITY_GAME_ORIGIN` | Separate game-serving origin including optional path prefix, e.g. `https://techexplore.us/OxArcade` |
| `COMMUNITY_SECURE_COOKIES=1` | Explicit secure cookies; automatically enabled with HTTPS origin |
| `COMMUNITY_ADMIN_IDS` | Comma-separated immutable user UUIDs |
| `COMMUNITY_TRUST_PROXY=1` | Trust rightmost X-Forwarded-For entry; enable only behind a trusted, network-restricted proxy |
| `COMMUNITY_AUTO_PREVIEW=0` | Disable automatic capture; uploads and custom image URLs still work |
| `COMMUNITY_CHROME_PATH` | Optional browser executable override; otherwise use Playwright's installed Chromium |
| `COMMUNITY_PLAYWRIGHT_MODULE` | Optional absolute Playwright module override |
| `ARCHIVE_HOST`, `ARCHIVE_PORT` | Existing listener configuration |
| `OX_DIR`, `TRACKER_DIR` | Existing mounts; kvm2 `/ox` and `/tracker` |

The existing kvm2 `epicbench` mounts include `/app` (EpicBench), `/ox` (ox-arcade), `/tracker`, `/games`, and writable `/data`. Keep these mounts. Add the Community environment variables to the actual managed container/Compose definition, and mount `/data` persistently. The existing alternative host `techexplore.us/OxArcade` serves the same game root. Never serve arbitrary playable HTML on the authenticated Community origin. HTTPS startup refuses a missing game origin or one equal to the account origin.

Build the downloadable skill before deployment:

```sh
python community-skill/package_skill.py
npm test
```

Deploy the scoped EpicBench, shared catalog, arcade navigation/server, and tracker-results changes. Build the skill ZIP on the server (it is intentionally gitignored). Configure `COMMUNITY_ORIGIN=https://epic.techexplore.us`, `COMMUNITY_GAME_ORIGIN=https://techexplore.us/OxArcade`, `COMMUNITY_DATA_DIR=/data/community`, secure cookies and trusted-proxy handling. Restart both Node servers to load changed JS; tracker Python does not require schema changes. Verify health, HTTPS cookie flags, Community routes, real registration/publication, and both game-host routes. This implementation does not itself deploy or create production accounts.

SQLite initializes schema version 3 transactionally. Prototype v1 upgrades preserve accounts/projects and invalidate old clear-stored sessions; v2 databases gain the optional prompt column while preserving existing publications. A newer unknown schema fails startup. WAL, foreign keys and a busy timeout are enabled. Before upgrading an existing deployment, make a SQLite-consistent backup (online backup or stop the service and copy the database with WAL/SHM). Never copy only the live main database and assume it is complete. Rollback must pair matching code with its database backup. Do not commit database files.

## Validation

`npm test` runs HTTP integration/security/catalog tests. `node tests/browser-community.cjs` runs Playwright against a temporary real server/database and closes both servers and browser afterward. Set `PLAYWRIGHT_MODULE` or install Playwright locally; `CHROME_PATH` can select a browser. Test screenshots/results are saved under ignored `tests/artifacts/` and contain synthetic local test projects.

`node tests/browser-thumbnails.cjs` additionally verifies a real screenshot of example.com through the capture worker and HTTP image endpoint, file upload, editing without losing the upload, mobile layout, and switching back to automatic capture. It requires installed Chromium or `COMMUNITY_CHROME_PATH` and network access. Thumbnails use the additive `project_thumbnails` table, which is created on existing schema-v2 databases; include it in ordinary database backups.

`python -m unittest discover -s community-skill/epic-bench-community/scripts -p 'test_*.py' -v` checks the helper, including a live temporary Node backend. The arcade regression suite runs with `npm test` in `ox-arcade`.
