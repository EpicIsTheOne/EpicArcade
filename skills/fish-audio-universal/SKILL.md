---
name: fish-audio-universal
description: Universal Fish Audio TTS for ANY harness/agent — zero dependencies, one Python script (stdlib only). Auto-tag text with emotion tags, search voices with toolkit-identical ranking, synthesize speech on the FREE model (s2.1-pro-free, $0), check wallet credit, probe free-tier health. Reads the machine's Fish Audio key automatically from ~/fish-audio-tts-toolkit/.env (same key Hermes and the toolkit helper use). Never prints or copies the key. Works wherever shell + Python 3.8+ exist.
---

# Fish Audio TTS (universal, keyless setup)

One script, `scripts/fish_audio.py`, no `npm install`, no pip install — Python
3.8+ stdlib only. Ported from Epic's fish-audio-tts-toolkit
(`src/tagging.js`, `src/search.js`, `src/fish.js`) so results match the local
helper exactly: same auto-tagger, same voice-search ranking, same direct API
call shape (`POST /v1/tts` with a `model:` header).

## Key handling (read this first)

The script resolves the API key in this order — **it never prints the key**:

1. `--api-key` flag (only if a harness has no filesystem access)
2. `FISH_AUDIO_API_KEY` environment variable
3. `~/fish-audio-tts-toolkit/.env` → `FISH_AUDIO_API_KEY` (Epic's machine:
   already set — nothing to configure)
4. `~/.fish-audio/.env` as an alternate location

On Epic's machine steps 1–2 can stay empty; step 3 just works. On any other
machine, ask the user to put their key in `~/.fish-audio/.env` as
`FISH_AUDIO_API_KEY=...` themselves — never ask them to paste it into chat.

Default backend is **`s2.1-pro-free` ($0.00)**, sent as the `model` header.
Wallet is pay-as-you-go; paid models cost $15 per M UTF-8 bytes.

## Commands

```bash
S="<skill_dir>/scripts/fish_audio.py"

# tag only — no network call, instant
python "$S" tag --text '*she laughs softly* "You made that?"'

# search voices — ranked exactly like the toolkit helper
python "$S" search "egirl" --limit 5

# synthesize -> prints one JSON line with "path" to the audio file
python "$S" say --voice-id <model _id> --text "Hey. I was waiting for you." --out out.mp3

# no voice-id? uses DEFAULT_FISH_REFERENCE_ID from the .env automatically
python "$S" say --text "Line two." --out line2.mp3

# spend check
python "$S" wallet

# free tier health: ONE tiny request, prints FREE-UP or FREE-DOWN ($0 either way)
python "$S" probe
```

Output contract: every command prints ONE JSON object to stdout.
Success → `"ok": true` (+ `path` for `say`, `items`/`bestMatch` for `search`,
`taggedText`/`tags` for `tag`, `credit` for `wallet`). Failure →
`{"ok": false, "error": "..."}` and exit code 1. Progress notes go to stderr.

Options for `say`: `--format mp3|wav|opus|pcm` (default mp3),
`--latency low|normal|balanced` (default low), `--timeout <seconds>` (default
180), `--backend s2.1-pro-free|s2-pro` (default free).

## Behavior rules baked into `say`

1. **Free first, always**: up to 3 tries against `s2.1-pro-free` with 2/4s
   backoff, then — only if free keeps failing with rate-limit-type errors —
   one attempt against the configured `--backend` fallback (default stays
   free unless explicitly passed `--backend s2-pro`).
2. **Fatal errors never fall back**: HTTP 400/401/402 stop immediately.
3. **Response sanity check**: output must look like real audio bytes
   (MPEG frame header / ID3 / RIFF); otherwise it retries, so a JSON error
   page never gets saved as an mp3.
4. After success it reads wallet credit once and includes it in the JSON so
   agents can prove nothing was charged.

## Agent etiquette (Epic's rules)

- NEVER test by exhausting the free rate limit. Use `probe` or `say --dry-run`
  (dry-run resolves key + voice and prints what it would call — no network).
- If a paid fallback ever fires, report the exact wallet delta in the final answer.
- Deliver generated audio to the user via the harness's file/media mechanism;
  the JSON `path` field holds the absolute location.

## Known tags

whisper · quiet voice · soft gentle tone · sigh · soft laugh · chuckle ·
laughing · soft gasp · gasp · whimper · loud moan · soft moan · breathless ·
shaky voice · sad soft voice · crying · nervous hesitant voice · shy soft
voice · sharp irritated tone · stern serious tone · deadpan · teasing amused
tone · sarcastic · excited bright voice · surprised · calm steady tone ·
commanding voice · loud · screaming (+ basic emotions: happy/sad/angry/fearful/
disgusted/calm/serious/excited/nervous/shout)

Inline `[whisper]`-style tags in input are preserved exactly; unknown bracketed
phrases stay spoken. `*roleplay actions*` are stripped (or spoken with
`--include-narration`). Emoji removed, moan-like tokens normalized
(`Ahhhhh` → `Ahh`, `Ahhhn!` → `Aaaahn!`). Text cap 2500 chars.

## Pitfalls

- Free tier can be slow/cold: first synthesis may take >60s. Retry once before
  suspecting breakage — second try is typically ~5s.
- 401 → key invalid/expired: fatal, do not retry.
- 429 → rate limit; the script backs off automatically, don't hammer it.
- Very long text truncates at Fish: split into sentences over ~2000 chars.
- Windows: use forward-slash paths in `--out` when a native tool must read it.
- The old local helper ports: **3027 = paid config (avoid), 3028 = free**.
  This script bypasses both and talks to api.fish.audio directly with the free
  model header — port confusion doesn't apply.

## Provenance & verification

Ported verbatim-in-behavior from `C:/Users/Epic/fish-audio-tts-toolkit`
(MIT) in August 2026; verified live on Epic's machine against
api.fish.audio with `backend: s2.1-pro-free` and wallet unchanged.
