"""Incremental READ-ONLY sync from the runner's store into the journal DB.

Design notes:
- Primary-only filtering happens BEFORE any message is read.
- Watermarked, idempotent ingestion (INSERT OR IGNORE everywhere).
- Assistant prose is never persisted except tiny derived summaries.
"""

import json
import os

from . import config, redact, status, store
from .config import jload
from .source import Source, verify_source


def is_primary(srow):
    """Deterministic primary-user-facing-session test (schema-based)."""
    if srow.get("parent_id"):
        return False
    agent = srow.get("agent")
    if agent is None:
        return True  # legacy/default sessions are user-facing
    if agent in config.PRIMARY_AGENTS:
        return True
    return False


def project_name(directory):
    d = (directory or "").replace("/", "\\").rstrip("\\/")
    base = os.path.basename(d)
    if not base:
        return "Unknown"
    # tidy benchmark folder names: "Foo [model-x] [opencode] [run-01]" -> "Foo"
    out = []
    for part in base.split("["):
        seg = part.strip()
        if seg:
            out.append(seg)
    return (out[0] if out else base).strip() or base


# ---------------------------------------------------------------- parsing

def _user_prompt_from_parts(parts):
    """Concat non-synthetic text parts of one user message into prompt text."""
    chunks = []
    for p in parts:
        d = p.get("data_obj") or {}
        if d.get("type") != "text":
            continue
        if d.get("synthetic"):
            continue
        txt = (d.get("text") or "").strip()
        if txt:
            chunks.append(txt)
    return "\n\n".join(chunks).strip()


def _assistant_view(parts):
    """Bounded structural view of an assistant message: texts + tool states."""
    texts, tools = [], []
    for p in parts:
        d = p.get("data_obj") or {}
        t = d.get("type")
        if t == "text":
            txt = (d.get("text") or "").strip()
            if txt:
                texts.append(txt)
        elif t == "tool":
            stt = d.get("state") or {}
            tools.append({
                "name": d.get("tool") or "?",
                "status": stt.get("status"),
                "error": stt.get("error"),
            })
    return texts, tools


class Observer:
    def __init__(self, src_path=None, log=None):
        self.log = log or (lambda *a: None)
        self.src_path = src_path or config.OC_DB
        self._verification = verify_source(self.src_path)

    # ------------------------------------------------------------- helpers

    def _fetch_parts(self, src, message_ids):
        if not message_ids:
            return {}
        ids = list(message_ids)[:400]
        qmarks = ",".join("?" for _ in ids)
        rows = src.query(
            f"SELECT id, message_id, time_created, data FROM part WHERE message_id IN ({qmarks}) "
            f"ORDER BY time_created", ids,
        )
        out = {}
        for r in rows:
            r["data_obj"] = jload(r.get("data"), {})
            out.setdefault(r["message_id"], []).append(r)
        return out

    def _messages_since(self, src, sid, since_ms):
        return src.query(
            "SELECT id, time_created, data FROM message WHERE session_id=? AND time_created>? "
            "ORDER BY time_created", (sid, int(since_ms)),
        )

    def _tail_messages(self, src, sid, limit):
        rows = src.query(
            "SELECT id, time_created, data FROM message WHERE session_id=? "
            "ORDER BY time_created DESC LIMIT ?", (sid, limit),
        )
        rows.reverse()
        return rows

    # ------------------------------------------------------------ syncing

    def sync_session_incremental(self, src, con, srow, now):
        sid = srow["id"]
        prev = con.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        msg_wm = prev["msg_watermark"] if prev else 0
        part_wm = prev["part_watermark"] if prev else 0

        margin = 120_000
        msgs = self._messages_since(src, sid, max(0, msg_wm - margin))

        added = 0
        user_msgs = [m for m in msgs if jload(m.get("data"), {}).get("role") == "user"]
        parts_map = self._fetch_parts(src, [m["id"] for m in user_msgs])
        existing_seq = con.execute(
            "SELECT COALESCE(MAX(seq),0) FROM prompts WHERE session_id=?", (sid,)
        ).fetchone()[0]
        for m in user_msgs:
            parts = parts_map.get(m["id"], [])
            text = _user_prompt_from_parts(parts)
            if not text:
                continue
            ts_ = m["time_created"]
            safe = redact.redact(text)
            pid = config.sha16(sid, m["id"])
            cur = con.execute(
                "INSERT OR IGNORE INTO prompts(id,session_id,seq,ts,text,chars,redacted) VALUES(?,?,?,?,?,?,?)",
                (pid, sid, existing_seq + 1, ts_, safe, len(text),
                 1 if redact.looks_sensitive(text) else 0),
            )
            if cur.rowcount:
                added += 1
                existing_seq += 1

        new_msg_wm = max([msg_wm] + [m["time_created"] for m in msgs])
        new_part_wm = part_wm
        if parts_map:
            newest_part = max(
                (p.get("time_created") or 0) for ps in parts_map.values() for p in ps
            )
            new_part_wm = max(part_wm, newest_part)

        con.execute(
            """INSERT INTO sessions(id,directory,title,agent,parent_id,started_at,updated_at,archived_at,
                   is_primary,prompt_count,msg_watermark,part_watermark,last_activity_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 directory=excluded.directory, title=excluded.title, updated_at=excluded.updated_at,
                 archived_at=excluded.archived_at,
                 msg_watermark=max(msg_watermark, excluded.msg_watermark),
                 part_watermark=max(part_watermark, excluded.part_watermark),
                 last_activity_at=max(COALESCE(last_activity_at,0), excluded.last_activity_at)""",
            (sid, srow.get("directory"), srow.get("title"), srow.get("agent"),
             srow.get("parent_id"), srow.get("time_created"), srow.get("time_updated"),
             srow.get("time_archived"), 1 if is_primary(srow) else 0, added,
             new_msg_wm, new_part_wm, srow.get("time_updated")),
        )
        con.execute(
            "UPDATE sessions SET prompt_count=(SELECT COUNT(*) FROM prompts WHERE session_id=?) WHERE id=?",
            (sid, sid),
        )
        self._record_status_event(con, sid, now)
        return added

    def _record_status_event(self, con, sid, now):
        row = con.execute(
            "SELECT last_status,last_phase,last_confidence FROM sessions WHERE id=?", (sid,)
        ).fetchone()
        if not row:
            return
        candidate = (row["last_status"], row["last_phase"], row["last_confidence"])
        if not all(candidate):
            return
        last = con.execute(
            "SELECT status,phase,confidence FROM status_events WHERE session_id=? ORDER BY ts DESC,id DESC LIMIT 1",
            (sid,),
        ).fetchone()
        if last and (last["status"], last["phase"], last["confidence"]) == candidate:
            return  # dedupe insignificant status noise
        con.execute(
            "INSERT OR IGNORE INTO status_events(session_id,ts,status,phase,detail,confidence) VALUES(?,?,?,?,?,?)",
            (sid, now, candidate[0], candidate[1], None, candidate[2]),
        )

    # ------------------------------------------------------------- passes

    def light_pass(self, con, now=None):
        """Cheap incremental capture + status refresh. Returns dict stats."""
        now = now or config.now_ms()
        stats = {"sessions_touched": 0, "prompts_added": 0, "statuses": {}}
        with Source(self.src_path) as src:
            window = now - (config.QUIET_STOP_S + 3600) * 1000
            rows = src.query(
                "SELECT * FROM session WHERE parent_id IS NULL AND time_updated>? ORDER BY time_updated DESC",
                (window,),
            )
            primaries = [r for r in rows if is_primary(r)]
            # refresh statuses of anything still warm
            for srow in primaries:
                self.refresh_status(src, con, srow, now)
            # incremental prompt capture
            for srow in primaries:
                n = self.sync_session_incremental(src, con, srow, now)
                stats["prompts_added"] += n
                if n:
                    stats["sessions_touched"] += 1
                st = con.execute("SELECT last_status FROM sessions WHERE id=?", (srow["id"],)).fetchone()
                if st and st["last_status"]:
                    stats["statuses"][st["last_status"]] = stats["statuses"].get(st["last_status"], 0) + 1
            self._sync_projects(con)
        con.commit()
        return stats

    def refresh_status(self, src, con, srow, now):
        sid = srow["id"]
        msgs = self._tail_messages(src, sid, config.RECENT_MSG_LIMIT)
        view = []
        for m in msgs:
            role = jload(m.get("data"), {}).get("role")
            parts = self._fetch_parts(src, [m["id"]]).get(m["id"], [])
            if role == "assistant":
                texts, tools = _assistant_view(parts)
            else:
                texts, tools = [], []
            view.append({"role": role, "texts": texts, "tools": tools, "ts": m["time_created"]})
        st = status.derive(now, srow, view)
        con.execute(
            "UPDATE sessions SET last_status=?, last_phase=?, last_confidence=?, last_activity_at=? WHERE id=?",
            (st.status, st.phase, st.confidence, st.last_activity_at, sid),
        )
        return st

    def heavy_pass(self, con, since_ms=None, now=None):
        """Full historical reconciliation from checkpoint (or bootstrap)."""
        now = now or config.now_ms()
        since_ms = since_ms if since_ms is not None else 0
        result = {"mode": "bootstrap" if since_ms == 0 else "catchup", "sessions": 0, "prompts": 0}
        with Source(self.src_path) as src:
            rows = src.query("SELECT * FROM session ORDER BY time_created ASC")
            for srow in rows:
                if not is_primary(srow):
                    continue
                if since_ms and (srow.get("time_updated") or 0) < since_ms - 86400_000:
                    continue
                result["sessions"] += 1
                result["prompts"] += self.sync_session_incremental(src, con, srow, now)
            self._sync_projects(con)
        con.commit()
        return result

    def _sync_projects(self, con):
        now = config.now_ms()
        dirs = [r[0] for r in con.execute(
            "SELECT DISTINCT directory FROM sessions WHERE is_primary=1 AND directory IS NOT NULL")]
        for d in dirs:
            norm = d.replace("\\", "/")
            con.execute(
                "INSERT INTO projects(path,name,first_seen,last_seen) VALUES(?,?,?,?) "
                "ON CONFLICT(path) DO UPDATE SET last_seen=excluded.last_seen",
                (norm, project_name(norm), now, now),
            )
