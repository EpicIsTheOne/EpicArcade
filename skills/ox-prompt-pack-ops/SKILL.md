---
name: ox-prompt-pack-ops
description: >
  MUST USE when editing, extending, validating, or deploying the OX Alpha
  benchmark prompt pack (46 prompts behind techexplore.us/OxAlphaTracker,
  local http://127.0.0.1:8932) — e.g. "add a skill/capability to the benchmark
  prompts", "edit prompts.json", "update the tracker", "deploy the prompt
  pack", "add a placeholder". Encodes the capability-integration contract
  (placeholders over paths, task-text immutability, required-vs-optional),
  the exact file locations on this machine, the deployment pipeline to GitHub
  + kvm2, and the post-edit validation checklist.
---

# Ox Alpha Prompt Pack — edit & deploy ops

## Where everything lives

| Piece | Path |
|---|---|
| Dev copy of pack (source of truth for edits) | `C:\Users\Epic\Documents\ChatGPT\Ox model test\prompts.json` |
| Served copy (repo) | `EpicArcade\OxAlphaTracker\prompts.json` inside `C:\Users\Epic\Documents\ChatGPT\Ox model test\EpicArcade` |
| API server | project root `api_server.py` ↔ repo `OxAlphaTracker\api_server.py` |
| Placeholder contract | `OxAlphaTracker\PLACEHOLDER_CONTRACT.md` |
| Prod server | kvm2 (`ssh kvm2`), `/opt/ox-arcade`, container `oxalphatracker`, https://techexplore.us/OxAlphaTracker/ |
| Local dev server | `http://127.0.0.1:8932`, PID tracked in `.api-server.pid` |

Prompt record shape: `{id, title, difficulty, harness, filename, text}` — exactly **46** records.

## Editing protocol (capability-integration contract, condensed)

1. Classify the capability: **A** file-backed skill → `{{NAME_SKILL_PATH}}`
   placeholder; **B** MCP/harness → availability detection placeholder like
   `{{X_MCP_AVAILABLE}}`; **C** external service → wrap in a skill, keys never
   in prompts.
2. Setup/install happens BEFORE benchmark timing — prompts only reference
   prepared capabilities.
3. Never hardcode machine paths (`C:\Users\Epic\...`) in prompt text — use
   placeholders the supervisor/server resolves.
4. Task text is immutable: insert capability blocks only as separate sections.
   Standard insertion point: directly AFTER each prompt's
   `Optional capabilities` bullet line (all 46 have one).
5. Required only when the spec cannot be satisfied without the capability;
   otherwise optional with graceful degradation wording.
6. Add only to relevant prompts; keep blocks compact; point at the skill's
   own docs instead of duplicating them.
7. New placeholder ⇒ update `PLACEHOLDER_CONTRACT.md` (injected value,
   fallback literal `UNAVAILABLE` semantics, validation) AND, if resolved
   server-side, add a resolver in `api_server.py` (`PLACEHOLDER_RESOLVERS`)
   plus document it in `/api/placeholders`.

## Validation before any deploy

```python
# per edit script: backup first, then assert
len(data) == 46                                  # count unchanged
text.replace(INSERT, "", 1) == original_text     # zero task mutation
placeholder_total == number_of_edited_prompts    # no stray/unresolved extras
old blocks still present                         # IMAGE GENERATION / FISH AUDIO /
                                                 # MULTIPLAYER CONTRACT / prior {{...}}
"C:\\Users\\Epic" not in inserted_block          # no hardcoded paths added
```

Keep a timestamped backup of `prompts.json` next to it before writing.

## Deploy pipeline (repo → prod)

```powershell
# 1. sync edited files into the repo clone
Copy-Item ..\prompts.json            EpicArcade\OxAlphaTracker\
Copy-Item ..\api_server.py           EpicArcade\OxAlphaTracker\
cd EpicArcade
git add OxAlphaTracker/ ; git commit -m "..."; git push origin main

# 2. prod: pull + restart (container serves from bind-mounted checkout)
ssh kvm2 "cd /opt/ox-arcade && git pull --ff-only origin main && docker restart oxalphatracker"

# 3. verify prod
curl.exe -s https://techexplore.us/OxAlphaTracker/api/meta          # total: 46
curl.exe -s https://techexplore.us/OxAlphaTracker/api/placeholders # resolution status
curl.exe -s "https://techexplore.us/OxAlphaTracker/api/prompts/1/text"   # spot-check
```

Local dev server restart (PID-file discipline — kill ONLY the recorded PID):

```powershell
$pid8932 = Get-Content .api-server.pid
Get-CimInstance Win32_Process -Filter "ProcessId=$pid8932" |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -WindowStyle Hidden python -ArgumentList 'api_server.py','8932'
$newPid = (Get-NetTCPConnection -LocalPort 8932 -State Listen | Select-Object -First 1).OwningProcess
Set-Content .api-server.pid $newPid
```

## Final checklist

- [ ] meta reports total 46 (prod AND local if touched)
- [ ] served texts contain zero raw `{{` unless intentionally UNAVAILABLE-resolved
- [ ] every edited prompt still contains its older capability blocks
- [ ] no secrets, no absolute machine paths added by the edit
- [ ] `PLACEHOLDER_CONTRACT.md` updated for any new placeholder
- [ ] report: prompts changed, identifiers added, required/optional behavior,
      supervisor impact, verification results

## Hard limits

- Never touch `OxAlphaTracker/.env` (API key) or `runs.json` state in commits.
- Never force-push or rebase shared history; fast-forward only.
- Never restart/kvm2-touch anything besides `oxalphatracker` for prompt work.
- This skill is tooling documentation — do NOT add it as a capability block
  inside the benchmark prompts themselves.
