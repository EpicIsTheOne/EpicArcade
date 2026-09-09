# Benchmark Placeholder Contract

Runtime placeholders that may appear in benchmark prompt texts (`prompts.json`).
The dispatching environment / Benchmark Supervisor MUST resolve them before the
prompt reaches a model. An unresolved placeholder must never silently reach a
model as literal text.

## `{{E2E_ISOLATION_SKILL_PATH}}`

| Field | Value |
|---|---|
| Capability | isolated-e2e-testing (contested-machine browser/E2E protocol) |
| Type | file-backed skill |
| Required/optional | **Optional** — degrades gracefully |
| Injected value | Absolute path to the installed skill's `SKILL.md` file on the executing machine |
| Fallback | Literal string `UNAVAILABLE` when the skill is not installed for this machine/harness |
| Behavior if UNAVAILABLE | Agent proceeds using the isolation rules already inline in every prompt ("Browser-only + parallel testing" section) |
| Setup timing | Skill installation happens BEFORE benchmark timing; never during it |
| Safety notes | The skill governs browser/process hygiene only; it grants no deployment or production-access permissions. Artifacts produced under its guidance belong in the run's project folder |

### Resolution (server-side)

`api_server.py` resolves placeholders at **serve time** — raw `prompts.json`
stays portable and path-free:

- Resolution order for `{{E2E_ISOLATION_SKILL_PATH}}`: env override
  `E2E_ISOLATION_SKILL_PATH`, then `<home>/.agents/skills/isolated-e2e-testing/SKILL.md`,
  then `<home>/.claude/skills/...`; first existing file wins, else `UNAVAILABLE`.
- Applies to `GET /api/prompts`, `GET /api/prompts/{id}`, `GET /api/prompts/{id}/text`.
- `GET /api/placeholders` shows current resolution status (supervisor/debug aid).
- Note: resolution reflects the **API server's** machine. A local tracker
  resolves real paths for local agents; the kvm2 production instance serves
  `UNAVAILABLE` unless the skill is installed there — correct by contract,
  since the server cannot know the client machine's skills.

Legacy note: the current Astra-native pack contains no runtime placeholders;
this resolver remains for older or externally supplied prompt packs. The
previous 46-source pack inserted "OPTIONAL CAPABILITY — ISOLATED E2E TESTING"
directly after the "Optional capabilities" section.

## Legacy hardcoded capability references (pending migration)

The previous pack's image-generation block hardcoded
`C:\Users\Epic\.agents\skills\gpt-image-2\scripts\gpt_image.mjs`. The current
Astra-native text is intentionally shorter and does not carry that block.
Fish Audio and multiplayer blocks likewise belong to the legacy pack.

## {{SYNTH_SONG_ENGINE_SKILL_PATH}}

| Field | Value |
|---|---|
| Capability | synth-song-engine (offline numpy song synthesis: 84 genre playbooks, 29 voices, deterministic WAV/MP3 render, multi-agent lease) |
| Type | file-backed skill |
| Required/optional | **Optional** — degrades gracefully |
| Injected value | Absolute path to the installed skill's SKILL.md on the executing machine |
| Fallback | Literal string UNAVAILABLE when the skill is not installed for this machine/harness |
| Behavior if UNAVAILABLE | Agent proceeds without it (WebAudio synthesis or other original methods remain fine) |
| Setup timing | Skill installation happens BEFORE benchmark timing; never during it |
| Safety notes | Renders audio offline into the run's project folder; grants no deployment or production-access permissions. FL/DAW contact requires the skill's fl_lease protocol |

### Resolution (server-side)

Same mechanism as {{E2E_ISOLATION_SKILL_PATH}}: env override
SYNTH_SONG_ENGINE_SKILL_PATH, then repo-relative
<repo-root>/skills/synth-song-engine/SKILL.md (ships inside EpicArcade, so
the kvm2 production instance resolves it), then
<home>/.agents/skills/..., then <home>/.claude/skills/...; first existing
file wins, else UNAVAILABLE. Visible via GET /api/placeholders.

Legacy note: the resolver remains available for older prompt packs; the
current Astra-native pack does not carry this capability block.
