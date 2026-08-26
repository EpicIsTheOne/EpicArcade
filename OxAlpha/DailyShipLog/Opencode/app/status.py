"""Derive live session status from a bounded window of recent state.

Statuses: RUNNING | WAITING | COMPLETED | FAILED | STOPPED | UNKNOWN
Confidence: DIRECTLY OBSERVED (we watched the event stream move / fresh writes)
or INFERRED (derived from content heuristics after quietness).
"""

import re
from typing import Optional

from . import config

_PHASE_RULES = [
    ("testing", re.compile(r"\b(test|spec|pytest|unittest|headless|e2e)\w*", re.I)),
    ("debugging", re.compile(r"\b(debug|fix\w*|bug|regression|root cause)\b", re.I)),
    ("building", re.compile(r"\b(build|compile|bundle|transpil\w*)\b", re.I)),
    ("implementing", re.compile(r"\b(implement\w*|adding|creating|writing|refactor\w*)\b", re.I)),
    ("researching", re.compile(r"\b(inspect\w*|read\w*|search\w*|explor\w*|investigat\w*|research\w*)\b", re.I)),
    ("planning", re.compile(r"\b(plan\w*|design\w*|architect\w*|scaffold\w*)\b", re.I)),
    ("deploying", re.compile(r"\b(deploy\w*|publish\w*|push\w*|ship\w*)\b", re.I)),
]

_BLOCKER_RX = re.compile(
    r"\b(blocked|blocker|cannot proceed|stuck|fatal|permission denied|access denied"
    r"|out of memory|crash\w*|unrecoverable)\b",
    re.I,
)
_ERROR_RX = re.compile(r"\b(error|failed|failure|exception|traceback)\b", re.I)

_DONE_MARKERS = [
    "definition of done", "all tests pass", "tests pass", "complete.", "completed",
    "finished", "shipped", "done —", "done -", "handoff", "final report",
    "verification complete", "ready for", "is complete",
]


class SessionState:
    def __init__(self, sid):
        self.sid = sid
        self.status = "UNKNOWN"
        self.phase = None            # type: Optional[str]
        self.confidence = "INFERRED"
        self.activity = None         # type: Optional[str]
        self.progress = []           # list[str] recent checkable progress notes
        self.blocker = None          # type: Optional[str]
        self.last_activity_at = 0
        self.tool_counts = {}


def _clip(s, n=140):
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[: n - 1] + "\u2026"


def derive(now_ms, session_row, recent_msgs):
    """recent_msgs: oldest->newest list of {role, texts:[...], tools:[{name,status,error}], ts}.

    Only a bounded tail is ever passed in by the caller.
    """
    st = SessionState(session_row["id"])
    st.last_activity_at = (
        session_row.get("time_updated") or session_row.get("updated_at")
        or session_row.get("time_created") or 0
    )

    asst_texts = []
    last_tool_error = None
    tool_running_recent = False
    budget = config.RECENT_TEXT_BUDGET

    for m in recent_msgs[-config.RECENT_MSG_LIMIT:]:
        if m["role"] == "assistant":
            for t in reversed(m.get("texts") or []):
                if budget <= 0:
                    break
                asst_texts.append(t[:budget])
                budget -= len(t)
            for tl in m.get("tools") or []:
                st.tool_counts[tl.get("name", "?")] = st.tool_counts.get(tl.get("name", "?"), 0) + 1
                if tl.get("status") == "error":
                    last_tool_error = tl.get("error") or "tool error"
        elif m["role"] == "user" and m.get("ts"):
            pass  # user prompts are archived elsewhere; not needed for state

    quiet_s = max(0.0, (now_ms - st.last_activity_at) / 1000.0)

    # --- current activity + phase from newest text first ---
    newest_first = list(reversed(asst_texts))
    joined_tail = " \n ".join(newest_first[:6])[:4000]

    st.activity = _clip(newest_first[0]) if newest_first else None
    phase = None
    for name, rx in _PHASE_RULES:
        if rx.search(joined_tail):
            phase = name
            break
    st.phase = phase

    # --- blockers ---
    blocker_hit = None
    if last_tool_error:
        blocker_hit = f"tool error: {_clip(str(last_tool_error), 120)}"
    elif _BLOCKER_RX.search(joined_tail):
        mm = _BLOCKER_RX.search(joined_tail)
        if mm is not None:
            blocker_hit = _clip(joined_tail[max(0, mm.start() - 40): mm.end() + 60])
    elif _ERROR_RX.search(joined_tail):
        blocker_hit = "errors mentioned in recent activity"
    st.blocker = blocker_hit

    # --- progress checklist: short imperative-ish lines from recent texts ---
    prog = []
    for t in newest_first:
        for line in t.splitlines():
            line = line.strip(" -*`\u2022")
            if 12 <= len(line) <= 110 and not line.startswith(("#", "<", "|")):
                low = line.lower()
                if any(w in low for w in ("implement", "fixed", "added", "created", "built",
                                          "tested", "verified", "generated", "wrote",
                                          "passing", "pass", "deployed", "rendered")):
                    prog.append(_clip(line, 110))
        if len(prog) >= 5:
            break
    st.progress = prog[:5]

    # --- final status decision ---
    if quiet_s <= config.ACTIVE_STREAM_S:
        st.status = "RUNNING"
        st.confidence = "DIRECTLY OBSERVED"
    else:
        done = any(marker in joined_tail.lower() for marker in _DONE_MARKERS)
        if blocker_hit and quiet_s >= config.FAILED_QUIET_S and not done:
            st.status = "FAILED"
            st.confidence = "INFERRED"
        elif done and quiet_s >= config.COMPLETE_QUIET_S:
            st.status = "COMPLETED"
            st.confidence = "INFERRED"
        elif quiet_s < config.QUIET_STOP_S:
            st.status = "WAITING"
            st.confidence = "INFERRED"
        else:
            st.status = "STOPPED"
            st.confidence = "INFERRED"

    if tool_running_recent:
        st.status = "RUNNING"
    return st


def summarize_progress(st, limit=3):
    marks = []
    for i, p in enumerate(st.progress):
        mark = "\u25cf" if i == len(st.progress) - 1 and st.status == "RUNNING" else "\u2713"
        marks.append(f"{mark} {p}")
    return marks[:limit]
