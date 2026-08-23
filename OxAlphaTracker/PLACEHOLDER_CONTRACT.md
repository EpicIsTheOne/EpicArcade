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

Introduced: 2026-08-23 — added to all 46 prompts, inserted as
"OPTIONAL CAPABILITY — ISOLATED E2E TESTING" directly after the
"Optional capabilities" section.

## Legacy hardcoded capability references (pending migration)

The image-generation block in every prompt currently hardcodes
`C:\Users\Epic\.agents\skills\gpt-image-2\scripts\gpt_image.mjs`. Per contract
rule 3 this should eventually become a placeholder
(`{{IMAGE_GEN_SCRIPT_PATH}}`); left untouched for now to keep task content
immutable. Fish Audio and multiplayer blocks likewise predate this contract.
