import re

_PATTERNS = [
    # API-key-ish assignments: sk-..., gsk_..., AIza..., generic key=value long tokens
    (re.compile(r"\b(sk-[A-Za-z0-9_\-]{16,}|gsk_[A-Za-z0-9_\-]{20,}|AIza[0-9A-Za-z_\-]{30,})\b"),
     lambda m: m.group(1)[:6] + "\u2026REDACTED"),
    (re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._\-]{18,}"), lambda m: m.group(1) + "\u2026REDACTED"),
    (re.compile(r"""(?i)\b((?:api[_\-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?)([^\s"'`]{8,})"""),
     lambda m: m.group(1) + "\u2026REDACTED"),
    (re.compile(r"\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9\-]{10,})\b"),
     lambda m: m.group(1)[:8] + "\u2026REDACTED"),
]


def redact(text):
    """Redact obvious secrets while preserving the prompt as much as possible."""
    if not text:
        return text
    out = text
    for rx, repl in _PATTERNS:
        out = rx.sub(repl, out)
    return out


def looks_sensitive(text):
    return any(rx.search(text or "") for rx, _ in _PATTERNS)
