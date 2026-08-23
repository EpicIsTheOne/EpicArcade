#!/usr/bin/env python3
"""fish_audio.py — universal Fish Audio TTS CLI (stdlib only, Python 3.8+).

Ported from Epic's fish-audio-tts-toolkit (src/tagging.js, src/search.js, src/fish.js)
so ANY harness/agent gets identical behavior with zero dependencies:

  tag      — auto-tag text with Fish emotion tags (the "better sounding voice" pass)
  search   — voice search ranked exactly like the toolkit
  say      — synthesize speech to an audio file (free model first)
  wallet   — read API credit balance (spend check; never prints the key)
  probe    — ONE tiny free request; prints FREE-UP or FREE-DOWN

Key handling: reads FISH_AUDIO_API_KEY from --api-key / env / toolkit .env.
The key is NEVER printed. Default backend = s2.1-pro-free ($0). Never test by
exhausting the free tier — use `probe` or `--dry-run` instead.

Contract: results print to stdout as one JSON object per command.
Errors print {"ok": false, "error": ...} and exit nonzero.
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

BASE_URL_DEFAULT = "https://api.fish.audio"
FREE_BACKEND = "s2.1-pro-free"
TOOLKIT_ENV_CANDIDATES = [
    "~/fish-audio-tts-toolkit/.env",
    "~/.fish-audio/.env",
    "./.env",
]
DEFAULT_VOICE_FALLBACKS = ["~/fish-audio-tts-toolkit/.env", "~/.fish-audio/.env"]

MAX_TEXT_CHARS = 2500
HTTP_TIMEOUT_TTS = 180
HTTP_TIMEOUT_API = 30


# --------------------------------------------------------------------------
# key loading (never prints the key)
# --------------------------------------------------------------------------

def load_env_file(path):
    """Parse KEY=VALUE lines from a .env file into a dict."""
    env = {}
    try:
        with open(os.path.expanduser(path), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return env


def resolve_api_key(cli_value=None):
    """--api-key > FISH_AUDIO_API_KEY env > toolkit .env. Never prints it."""
    if cli_value:
        return cli_value.strip()
    env_val = os.environ.get("FISH_AUDIO_API_KEY", "").strip()
    if env_val:
        return env_val
    for cand in TOOLKIT_ENV_CANDIDATES:
        val = load_env_file(cand).get("FISH_AUDIO_API_KEY", "")
        if val:
            return val
    return ""


def resolve_default_voice():
    """Default reference id from DEFAULT_FISH_REFERENCE_ID in the .env files."""
    env_val = os.environ.get("DEFAULT_FISH_REFERENCE_ID", "").strip()
    if env_val:
        return env_val
    for cand in DEFAULT_VOICE_FALLBACKS:
        val = load_env_file(cand).get("DEFAULT_FISH_REFERENCE_ID", "")
        if val:
            return val
    return ""


def fail(msg, code=1):
    print(json.dumps({"ok": False, "error": str(msg)}))
    sys.exit(code)


# --------------------------------------------------------------------------
# text normalization + auto-tagger (ported from src/tagging.js)
# --------------------------------------------------------------------------

KNOWN_TAGS = {
    "whisper", "quiet voice", "soft gentle tone", "sigh", "soft laugh", "chuckle",
    "laughing", "soft gasp", "gasp", "whimper", "loud moan", "soft moan",
    "breathless", "shaky voice", "sad soft voice", "crying", "nervous hesitant voice",
    "shy soft voice", "sharp irritated tone", "stern serious tone", "deadpan",
    "teasing amused tone", "sarcastic", "excited bright voice", "surprised",
    "calm steady tone", "commanding voice", "loud", "screaming", "happy", "sad",
    "angry", "fearful", "disgusted", "calm", "serious", "excited", "nervous", "shout",
}

TTS_DELIVERY_CUES = [
    ("whisper", "volume", 5, [r"\bwhisper(?:ing|s|ed)?\b", r"\bmurmur(?:ing|s|ed)?\b", r"\bhushed(?:ly)?\b"]),
    ("quiet voice", "volume", 3, [r"\bquiet(?:ly)?\b", r"\blow voice\b", r"\bsoft voice\b"]),
    ("soft gentle tone", "delivery", 3, [r"\bsoft(?:ly)?\b", r"\bgentl(?:e|y)\b", r"\btender(?:ly)\b|\btender(?:ly)?\b"]),
    ("sigh", "nonverbal", 5, [r"\bsigh(?:ing|s|ed)?\b", r"\bexhale(?:s|d|ing)?\b"]),
    ("soft laugh", "nonverbal", 6, [r"\blaugh(?:ing|s|ed)?\s+softly\b", r"\bsoft(?:ly)?\s+laugh(?:s|ed|ing)?\b"]),
    ("chuckle", "nonverbal", 4, [r"\bchuckl(?:e|es|ed|ing)\b", r"\bgiggl(?:e|es|ed|ing)\b"]),
    ("laughing", "nonverbal", 4, [r"\blaugh(?:ing|s|ed)?\b"]),
    ("soft gasp", "nonverbal", 6, [r"\bsoft\s+gasp(?:ing|s|ed)?\b", r"\bquiet\s+gasp(?:ing|s|ed)?\b", r"\bsmall\s+gasp(?:ing|s|ed)?\b"]),
    ("gasp", "nonverbal", 4, [r"\bgasp(?:ing|s|ed)?\b", r"\bbreath catches\b", r"\bbreath hitches\b"]),
    ("whimper", "nonverbal", 7, [r"\b(soft|quiet|small)\s+whimper(?:ing|s|ed)?\b", r"\bwhimper(?:ing|s|ed)?\b"]),
    ("loud moan", "nonverbal", 8, [r"\b(loud|intense|desperate|deep)\s+moan(?:ing|s|ed)?\b"]),
    ("soft moan", "negation-check", 6, [r"\b(soft|quiet|muffled|small)\s+moan(?:ing|s|ed)?\b"]),
    ("breathless", "delivery", 4, [r"\bbreathless(?:ly)?\b", r"\bpant(?:ing|s|ed)?\b"]),
    ("shaky voice", "delivery", 5, [r"\bvoice trembl(?:es|ed|ing)\b",
                                    r"\b(?:her|his|their|my|your)\s+voice\s+(?:breaks?|broke|is\s+breaking|cracks?|cracked)\b",
                                    r"\btrembl(?:ing|es|ed)?\b", r"\bshak(?:y|ily)\b"]),
    ("sad soft voice", "emotion", 4, [r"\bsad(?:ly)?\b", r"\bmournful(?:ly)?\b", r"\bheartbroken\b", r"\btearful\b"]),
    ("crying", "nonverbal", 5, [r"\bcry(?:ing|s|ied)?\b", r"\bsob(?:bing|s|bed)?\b"]),
    ("nervous hesitant voice", "emotion", 4, [r"\bnervous(?:ly)?\b", r"\bhesitant(?:ly)?\b", r"\banxious(?:ly)?\b"]),
    ("shy soft voice", "emotion", 4, [r"\bshy(?:ly)?\b", r"\bbashful(?:ly)?\b", r"\bflustered\b"]),
    ("sharp irritated tone", "emotion", 5, [r"\bangr(?:y|ily)\b", r"\birritated(?:ly)?\b", r"\bannoyed\b", r"\bsnap(?:s|ped|ping)?\b"]),
    ("stern serious tone", "delivery", 4, [r"\bstern(?:ly)?\b", r"\bfirm(?:ly)\b|\bfirm(?:ly)?\b"]),
    ("deadpan", "delivery", 4, [r"\bdeadpan\b", r"\bflat(?:ly)?\b", r"\bmonotone\b"]),
    ("teasing amused tone", "emotion", 4, [r"\bteasing(?:ly)?\b", r"\bplayful(?:ly)?\b", r"\bamused\b", r"\bsmirk(?:ing|s|ed)?\b"]),
    ("sarcastic", "delivery", 4, [r"\bsarcastic(?:ally)?\b", r"\bdryly\b"]),
    ("excited bright voice", "emotion", 4, [r"\bexcited(?:ly)?\b", r"\beager(?:ly)?\b", r"\bthrilled\b", r"\benthusiastic(?:ally)?\b"]),
    ("surprised", "emotion", 4, [r"\bsurprised\b", r"\bstunned\b", r"\bstartled\b"]),
    ("calm steady tone", "delivery", 3, [r"\bcalm(?:ly)?\b", r"\bsteady\b"]),
    ("commanding voice", "delivery", 4, [r"\bcommand(?:s|ed|ing)?\b", r"\bauthoritative(?:ly)?\b"]),
    ("loud", "volume", 4, [r"\bshout(?:ing|s|ed)?\b", r"\byell(?:ing|s|ed)?\b", r"\bloud(?:ly)?\b"]),
    ("screaming", "volume", 5, [r"\bscream(?:ing|s|ed)?\b", r"\bshriek(?:ing|s|ed)?\b"]),
]

INLINE_TAG_RE = re.compile(r"\[([a-z][a-z\s\-]{1,40})\]", re.I)


def normalize_tag_name(value):
    return re.sub(r"[^a-z\s-]", "", value.lower()).strip()


def replace_recognized_tags(text, replacer):
    def _sub(m):
        tag = normalize_tag_name(m.group(1))
        return replacer(m.group(0), tag) if tag in KNOWN_TAGS else m.group(0)
    return INLINE_TAG_RE.sub(_sub, text)


def has_inline_tags(text):
    found = [False]

    def _probe(m, t):
        found[0] = True
        return m
    replace_recognized_tags(text, _probe)
    return found[0]


def parse_inline_tags(text):
    tags = []

    def _collect(m, t):
        tags.append(t)
        return m
    replace_recognized_tags(text, _collect)
    seen, out = {}, []
    for t in tags:
        if seen.get(t, 0) < 5:
            seen[t] = seen.get(t, 0) + 1
            out.append(t)
    return out[:24]


def strip_inline_tags(text):
    stripped = replace_recognized_tags(text, lambda m, t: " ")
    stripped = re.sub(r"\s+([,.;!?])", r"\1", stripped)
    return clean_speech(re.sub(r"\s+", " ", stripped))


def normalize_moan_token(token):
    plain = re.sub(r"[^a-z]", "", token.lower())
    if not plain:
        return token
    if re.match(r"^[aehnm]+$|^a+h+n+$|^a+h+m+$", plain) and (re.search(r"a+h+n+", plain) or re.search(r"a+h+m+", plain)):
        a_count = plain.count("a")
        n_count = plain.count("n")
        return "Aaaahn!" if (a_count >= 3 or n_count >= 3 or len(plain) >= 8) else "Ahn"
    if re.match(r"^(a+h|o+h)$", plain):
        v = len(re.findall(r"[ao]", plain))
        h = plain.count("h")
        return "Aaaah!" if (v >= 3 or h >= 4 or len(plain) >= 6) else "Ahh"
    if re.match(r"^m{2,}$", plain):
        return "Mmm"
    if re.match(r"^(m{2,}h+|mph+|um{2,}h+)$", plain):
        return "Mm"
    if re.match(r"^(ngh+|un{2,}h+)$", plain):
        return "Ngh"
    return token


VOCALIZATION_RE = re.compile(
    r"(?<![\[(])\b(?:a+h+n+|a+h+m+|a+h+|o+h+|m{2,}|m{2,}h+|m+p+h+|u+m{2,}h+|n+g+h+|u+n{2,}h+)\b[~!?,.-]*(?![\])])",
    re.I,
)


def normalize_moans(text):
    text = VOCALIZATION_RE.sub(lambda m: normalize_moan_token(m.group(0)), text)
    for word in ("Ahh", "Ahn", "Mm", "Mmm", "Ngh"):
        text = re.sub((r"\b(?:%s\s*){2,}" % word), word + " ", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def strip_emoji(text):
    # keep it conservative without the regex module's \p{} classes
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        if cat.startswith("So") or cat == "Sk":
            continue
        if 0x1F000 <= ord(ch) <= 0x1FAFF or 0x2600 <= ord(ch) <= 0x27BF:
            continue
        if ch in ("\ufe0f", "\u200d"):
            continue
        out.append(ch)
    return "".join(out)


def clean_speech(text):
    text = text.replace("#", " ")
    text = re.sub(r"^[\s:;,.;!?—-]+", "", text)
    text = re.sub(r"[\s:;—-]+$", "", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_tts_text(text):
    text = strip_emoji(normalize_moans(str(text or "")))
    text = re.sub(r"~", " ", text)
    text = re.sub(r"\*", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        raise ValueError("Text is required")
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError("Text is too long for TTS (%d > %d)" % (len(text), MAX_TEXT_CHARS))
    return text


def strip_rp_narration(raw, include_narration=False):
    raw = str(raw or "")
    if include_narration:
        return raw.replace('"', "").replace("\u201c", "").replace("\u201d", "").strip()
    raw = re.sub(r"\*\*([^*\n]{1,500})\*\*", r"\1", raw)
    raw = re.sub(r"\*([^*\n]{1,500})\*", " ", raw)
    raw = re.sub(r"__([^_\n]{1,500})__", r"\1", raw)
    raw = re.sub(r'(^|\s)_([^_\n]{1,500})_(?=\s|[.,!?;:]|$)', r"\1\2", raw)
    raw = raw.replace('"', "").replace("\u201c", "").replace("\u201d", "")
    return re.sub(r"\s+", " ", raw).strip()


def is_negated(text, index):
    prefix = text[max(0, index - 48):index]
    contrast = None
    for m in re.finditer(r"\b(?:but|however|yet|then)\b", prefix, re.I):
        contrast = m
    if contrast:
        prefix = prefix[contrast.end():]
    return bool(re.search(r"\b(?:not|never|without|no)\b[^.!?;,:]{0,24}$", prefix, re.I)
                or re.search(r"\b(?:do|does|did|is|was|were|should|would|could|can)\s+not\b[^.!?;,:]{0,24}$", prefix, re.I)
                or re.search(r"\b(?:don't|doesn't|didn't|isn't|wasn't|weren't|shouldn't|wouldn't|couldn't|can't)\b[^.!?;,:]{0,24}$", prefix, re.I))


def count_matches(text, pattern):
    return sum(1 for m in re.finditer(pattern, text, re.I) if not is_negated(text, m.start()))


STRONG_HINT_RE = re.compile(
    r"\b(?:voice|tone|shout|yell|scream|whisper|moan|gasp|sob|laugh)\b", re.I)
STRONG_SOURCE_WORDS = ("whisper", "scream", "moan", "laugh", "gasp", "cry", "sob",
                       "whimper", "break", "recover", "relief")


def cue_strong_enough(cue, text):
    tag, category, weight, patterns = cue
    if weight >= 4:
        return True
    src = "|".join(patterns).lower()
    if any(w in src for w in STRONG_SOURCE_WORDS):
        return True
    return bool(STRONG_HINT_RE.search(text))


def infer_delivery_tags_detailed(context, speech, mode="conservative", max_tags=10):
    haystack = ("%s %s" % (context or "", speech or "")).strip()
    if not haystack:
        return [], [], 0.0
    scored = []
    for cue in TTS_DELIVERY_CUES:
        tag, category, weight, patterns = cue
        matches = sum(count_matches(haystack, p) for p in patterns)
        if not matches:
            continue
        if mode == "conservative" and not cue_strong_enough(cue, haystack):
            continue
        score = weight + min(matches, 3) + (1 if context else 0)
        scored.append((score, tag, category, matches))
    scored.sort(key=lambda x: -x[0])
    picked, reasoning, categories = [], [], set()
    for score, tag, category, matches in scored:
        if tag in picked:
            continue
        if tag == "laughing" and "soft laugh" in picked:
            continue
        if tag == "gasp" and "soft gasp" in picked:
            continue
        pair = {("shaky voice", "calm steady tone"), ("calm steady tone", "shaky voice")}
        is_pair = category == "delivery" and any(
            (tag == a and b in picked) or (tag == b and a in picked) for a, b in pair)
        if category in categories and category != "nonverbal" and not is_pair:
            continue
        picked.append(tag)
        categories.add(category)
        reasoning.append({"tag": tag, "confidence": min(1.0, score / 10), "evidence": matches})
        if len(picked) >= max_tags:
            break
    conf = max((r["confidence"] for r in reasoning), default=0.0)
    return picked, reasoning, conf


def get_tag_limit(text):
    length = len(clean_speech(text or ""))
    if length >= 2200:
        return 24
    if length >= 1600:
        return 20
    if length >= 1100:
        return 16
    if length >= 700:
        return 14
    if length >= 350:
        return 12
    return 10


def split_clauses(text):
    parts = re.findall(r"[^.!?]+(?:[.!?]+|$)", text or "")
    return [p.strip() for p in parts if p.strip()]


def extract_narration(raw):
    vals = []
    for m in re.finditer(r"\*{1,2}([^*\n]{1,500})\*{1,2}|_{1,2}([^_\n]{1,500})_{1,2}", raw or ""):
        v = (m.group(1) or m.group(2) or "").strip()
        if v:
            vals.append(v)
    return " ".join(vals)


def render_directed_tts(raw, include_narration=False, mode="conservative"):
    raw = str(raw or "").strip()
    speech = clean_speech(strip_rp_narration(raw, include_narration))
    narration = "" if include_narration else extract_narration(raw)
    limit = get_tag_limit(speech or raw)
    clauses = split_clauses(speech)
    if not clauses:
        return {"text": normalize_tts_text(raw), "tags": [], "reasoning": [], "confidence": 0.0}
    all_tags, pieces, reasonings, confidences = [], [], [], []
    for clause in clauses:
        if has_inline_tags(clause):
            clause_tags = parse_inline_tags(clause)
            piece = clean_speech(clause)
            conf = 1.0
            clause_reason = []
        else:
            clause_tags, clause_reason, conf = infer_delivery_tags_detailed(
                narration, clause, mode=mode, max_tags=limit)
            tag_text = " ".join("[%s]" % t for t in clause_tags[:limit])
            piece = clean_speech(("%s %s" % (tag_text, clause)) if tag_text else clause)
        all_tags.extend(clause_tags)
        pieces.append(piece)
        reasonings.extend(clause_reason)
        confidences.append(conf)
    seen, capped = {}, []
    for t in all_tags:
        if seen.get(t, 0) < 1:
            seen[t] = 1
            capped.append(t)
        if len(capped) >= limit:
            break
    return {"text": " ".join(pieces), "tags": capped, "reasoning": reasonings,
            "confidence": max(confidences) if confidences else 0.0}


def cmd_tag(args):
    try:
        directed = render_directed_tts(args.text, args.include_narration, args.mode)
        tagged = normalize_tts_text(directed["text"])
    except ValueError as e:
        fail(e)
    inline = parse_inline_tags(tagged)
    merged = []
    seen = set()
    for t in directed["tags"] + inline:
        if t not in seen:
            seen.add(t)
            merged.append(t)
    limit = get_tag_limit(args.text)
    merged = merged[:limit]
    spoken = clean_speech(strip_inline_tags(tagged))
    print(json.dumps({
        "ok": True,
        "input": args.text,
        "taggedText": tagged,
        "tags": merged,
        "spokenText": spoken,
        "confidence": directed["confidence"],
        "mode": args.mode,
    }, ensure_ascii=False))


# --------------------------------------------------------------------------
# voice search (ported from src/search.js)
# --------------------------------------------------------------------------

def norm_text(v):
    v = unicodedata.normalize("NFKD", str(v or "")).lower()
    v = "".join(c for c in v if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", v).strip()


def tokens_of(v):
    return [t for t in norm_text(v).split() if t]


def fish_request(api_key, path, timeout=HTTP_TIMEOUT_API):
    req = urlrequest.Request(
        BASE_URL_DEFAULT.rstrip("/") + path,
        headers={"Authorization": "Bearer %s" % api_key},
    )
    with urlrequest.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_models(api_key, params, timeout=HTTP_TIMEOUT_API):
    from urllib.parse import urlencode
    qs = urlencode({k: v for k, v in params.items() if v not in (None, "")})
    return fish_request(api_key, "/model?" + qs, timeout=timeout)


def match_details(query_norm, model, hints=None):
    q = query_norm
    title_norm = norm_text(model.get("title", ""))
    qt, tt = tokens_of(q), tokens_of(title_norm)
    model_tags = tokens_of(" ".join(model.get("tags") or []))
    model_langs = tokens_of(" ".join(model.get("languages") or []))
    score, reasons = 0, []
    if title_norm == q:
        score += 1000
        reasons.append("exact name match")
    if title_norm.startswith(q):
        score += 220
        reasons.append("starts with query")
    if q in title_norm:
        score += 170
        reasons.append("contains query")
    if q.startswith(title_norm):
        score += 120
    shared = [t for t in qt if t in tt]
    score += len(shared) * 45
    if shared:
        reasons.append("shared tokens: %s" % ", ".join(shared[:3]))
    if qt and tt and tt[0] == qt[0]:
        score += 35
    score -= max(0, len(tt) - len(qt)) * 4
    score += min(float(model.get("task_count") or 0), 1000) / 50.0
    score += min(float(model.get("like_count") or 0), 500) / 80.0
    if model.get("state") == "trained":
        score += 12
    if model.get("visibility") == "public":
        score += 8
    if hints:
        hl = tokens_of(" ".join(hints.get("languages") or []))
        ht = tokens_of(" ".join(hints.get("tags") or []))
        hg = tokens_of(" ".join(hints.get("genders") or []))
        lang_hits = [t for t in hl if t in model_langs]
        tag_hits = [t for t in ht if t in model_tags]
        gender_hits = [t for t in hg if t in model_tags or t in tt]
        score += len(lang_hits) * 38 + len(tag_hits) * 18 + len(gender_hits) * 32
        if lang_hits:
            reasons.append("language fit: %s" % ", ".join(lang_hits))
        if gender_hits:
            reasons.append("gender vibe: %s" % ", ".join(gender_hits))
        if tag_hits:
            reasons.append("tag fit: %s" % ", ".join(tag_hits[:3]))
    return score, reasons


def usable_model(m):
    return (m.get("state") == "trained"
            and m.get("dmca_taken_down") is not True
            and m.get("visibility") != "private")


def rank_models(query, batches, hints, limit):
    q = norm_text(query)
    dedup, out = set(), []
    for batch in batches:
        for m in batch:
            mid = m.get("_id")
            if not mid or mid in dedup:
                continue
            dedup.add(mid)
            if not usable_model(m):
                continue
            score, reasons = match_details(q, m, hints)
            if score > -100:
                m["_matchScore"] = score
                m["matchReasons"] = reasons
                out.append(m)
    out.sort(key=lambda m: (-m["_matchScore"], -(m.get("task_count") or 0)))
    return out[:max(1, int(limit))]


def cmd_search(args):
    api_key = resolve_api_key(args.api_key)
    if not api_key:
        fail("No API key found (pass --api-key, export FISH_AUDIO_API_KEY, or keep ~/fish-audio-tts-toolkit/.env)")
    q = norm_text(args.query)
    if not q:
        fail("Empty query")
    toks = tokens_of(q)
    lookups = [{"title": q, "page_size": 12, "sort_by": "score"}]
    if len(toks) > 1:
        lookups.append({"title": toks[0], "page_size": 12, "sort_by": "score"})
        lookups.append({"title": " ".join(toks[:2]), "page_size": 12, "sort_by": "score"})
    batches, first_error = [], None
    for lookup in lookups:
        try:
            data = fetch_models(api_key, lookup, timeout=args.timeout)
            batches.append(data.get("items") or [])
        except Exception as e:
            if first_error is None:
                first_error = e
            if batches:
                break
    if not batches and first_error:
        fail("Fish model lookup failed: %s" % describe_http_error(first_error))
    items = rank_models(args.query, batches, None, args.limit)
    if not items:
        try:
            data = fetch_models(api_key, {"page_size": 12, "sort_by": "score"}, timeout=args.timeout)
            items = rank_models(args.query, [data.get("items") or []], None, args.limit)
        except Exception:
            items = []
    slim = [{
        "_id": m["_id"],
        "title": m.get("title"),
        "state": m.get("state"),
        "visibility": m.get("visibility"),
        "task_count": m.get("task_count"),
        "like_count": m.get("like_count"),
        "matchScore": round(m["_matchScore"], 1),
        "matchReasons": m["matchReasons"],
    } for m in items]
    best = slim[0] if slim else None
    print(json.dumps({"ok": True, "query": args.query, "items": slim,
                      "bestMatch": best}, ensure_ascii=False))


# --------------------------------------------------------------------------
# HTTP helpers for synthesis / wallet
# --------------------------------------------------------------------------

def describe_http_error(e):
    if isinstance(e, HTTPError):
        try:
            detail = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            detail = ""
        return "HTTP %s%s" % (e.code, (": " + detail) if detail else "")
    return str(e)


def http_post_json(url, payload, headers, timeout):
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "application/json")
    return urlrequest.urlopen(req, timeout=timeout)


def wallet_credit(api_key):
    req = urlrequest.Request(BASE_URL_DEFAULT + "/wallet/self/api-credit",
                             headers={"Authorization": "Bearer %s" % api_key})
    with urlrequest.urlopen(req, timeout=HTTP_TIMEOUT_API) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    credit = data.get("credit") if isinstance(data, dict) else None
    return credit, data


def cmd_wallet(args):
    api_key = resolve_api_key(args.api_key)
    if not api_key:
        fail("No API key found (pass --api-key, export FISH_AUDIO_API_KEY, or keep ~/fish-audio-tts-toolkit/.env)")
    try:
        credit, raw = wallet_credit(api_key)
    except Exception as e:
        fail(describe_http_error(e))
    print(json.dumps({"ok": True, "credit": credit, "raw": raw}, ensure_ascii=False))


# --------------------------------------------------------------------------
# say (synthesize)
# --------------------------------------------------------------------------

def synthesize_once(api_key, text, voice_id, fmt, latency, backend, timeout):
    payload = {
        "text": normalize_tts_text(text),
        "reference_id": (voice_id or "").strip(),
        "format": fmt,
        "latency": latency,
    }
    resp = http_post_json(
        BASE_URL_DEFAULT + "/v1/tts", payload,
        headers={"Authorization": "Bearer %s" % api_key, "model": backend},
        timeout=timeout,
    )
    buf = resp.read()
    ctype = resp.headers.get("Content-Type") or ""
    if not buf:
        raise RuntimeError("Fish Audio returned empty audio")
    return buf, ctype


def looks_like_audio(buf, fmt):
    if len(buf) < 100:
        return False
    if fmt == "wav" and buf[:4] == b"RIFF":
        return True
    if buf[:3] == b"ID3" or (buf[0] == 0xFF and (buf[1] & 0xE0) == 0xE0):
        return True
    if fmt == "opus":
        return True
    return False


def cmd_say(args):
    api_key = resolve_api_key(args.api_key)
    if not api_key:
        fail("No API key found (pass --api-key, export FISH_AUDIO_API_KEY, or keep ~/fish-audio-tts-toolkit/.env)")
    voice_id = args.voice_id or resolve_default_voice()
    if not voice_id:
        fail("No voiceId given and no DEFAULT_FISH_REFERENCE_ID set (run `search` first, then --voice-id)")
    if args.dry_run:
        print(json.dumps({
            "ok": True, "dry_run": True, "out": args.out, "format": args.format,
            "latency": args.latency, "backend": args.backend,
            "voiceId": voice_id,
            "keySource": ("cli" if args.api_key else ("env" if os.environ.get("FISH_AUDIO_API_KEY") else "toolkit .env")),
            "wouldCall": "POST https://api.fish.audio/v1/tts",
        }, ensure_ascii=False))
        return
    backends = [args.backend] if args.backend == FREE_BACKEND else [FREE_BACKEND, args.backend]
    last_err = None
    for i, backend in enumerate(backends):
        attempts = 3 if backend == FREE_BACKEND else 1
        for attempt in range(attempts):
            try:
                buf, ctype = synthesize_once(api_key, args.text, voice_id,
                                             args.format, args.latency, backend,
                                             timeout=args.timeout)
                if not looks_like_audio(buf, args.format):
                    raise RuntimeError("response did not look like %s audio (%d bytes)" % (args.format.upper(), len(buf)))
                abspath = os.path.abspath(os.path.expanduser(args.out))
                d = os.path.dirname(abspath)
                if d:
                    os.makedirs(d, exist_ok=True)
                with open(abspath, "wb") as fh:
                    fh.write(buf)
                try:
                    credit_before, _raw = wallet_credit(api_key)
                except Exception:
                    credit_before = None
                print(json.dumps({
                    "ok": True, "backend": backend, "attempt": attempt + 1,
                    "bytes": len(buf), "contentType": ctype, "path": abspath,
                    "credit": credit_before,
                }, ensure_ascii=False))
                return
            except Exception as e:
                msg = describe_http_error(e)
                if isinstance(e, HTTPError) and e.code in (400, 401, 402):
                    fail("%s (fatal on backend %s; not falling back)" % (msg, backend))
                last_err = "%s (backend=%s attempt=%d)" % (msg, backend, attempt + 1)
                if attempt < attempts - 1:
                    time.sleep([2, 4, 8][min(attempt, 2)])
        if i < len(backends) - 1:
            sys.stderr.write("[fish-audio] free backend failed (%s); trying paid fallback %s\n"
                             % (last_err, backends[i + 1]))
    fail(last_err or "synthesis failed")


def cmd_probe(args):
    """ONE tiny free request -> FREE-UP / FREE-DOWN. Never burn the rate limit."""
    api_key = resolve_api_key(args.api_key)
    if not api_key:
        fail("No API key found")
    voice_id = args.voice_id or resolve_default_voice()
    if not voice_id:
        fail("No voice available for probe (--voice-id or DEFAULT_FISH_REFERENCE_ID)")
    try:
        buf, _ = synthesize_once(api_key, "Hi.", voice_id, "mp3", "low", FREE_BACKEND,
                                 timeout=min(args.timeout, 60))
        ok = looks_like_audio(buf, "mp3")
    except Exception as e:
        print(json.dumps({"ok": False, "status": "FREE-DOWN", "error": describe_http_error(e)}))
        return
    print(json.dumps({"ok": ok, "status": "FREE-UP" if ok else "FREE-DOWN",
                      "bytes": len(buf), "note": "free model, $0 spent"}))


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def build_parser():
    ap = argparse.ArgumentParser(prog="fish_audio.py",
                                 description="Universal Fish Audio TTS CLI (no deps)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("say", help="synthesize text to an audio file")
    p.add_argument("--text", required=True)
    p.add_argument("--voice-id", default="")
    p.add_argument("--out", default="fish-tts-%d.mp3" % int(time.time()))
    p.add_argument("--format", default="mp3", choices=["mp3", "wav", "opus", "pcm"])
    p.add_argument("--latency", default="low", choices=["low", "normal", "balanced"])
    p.add_argument("--backend", default=FREE_BACKEND)
    p.add_argument("--timeout", type=int, default=HTTP_TIMEOUT_TTS)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--api-key", default="")

    p = sub.add_parser("search", help="search voices by name (toolkit ranking)")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--timeout", type=int, default=HTTP_TIMEOUT_API)
    p.add_argument("--api-key", default="")

    p = sub.add_parser("tag", help="auto-tag text with Fish emotion tags")
    p.add_argument("--text", required=True)
    p.add_argument("--mode", default="conservative", choices=["conservative", "expressive"])
    p.add_argument("--include-narration", action="store_true")

    p = sub.add_parser("wallet", help="show remaining API credit")
    p.add_argument("--api-key", default="")

    p = sub.add_parser("probe", help="one tiny request; prints FREE-UP/FREE-DOWN")
    p.add_argument("--voice-id", default="")
    p.add_argument("--timeout", type=int, default=60)
    p.add_argument("--api-key", default="")

    return ap


COMMANDS = {"say": cmd_say, "search": cmd_search, "tag": cmd_tag,
            "wallet": cmd_wallet, "probe": cmd_probe}


def main():
    args = build_parser().parse_args()
    COMMANDS[args.cmd](args)


if __name__ == "__main__":
    main()
