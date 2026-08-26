"""Read-model queries backing the API."""

import datetime
import json

from . import config

LOCAL_TZ = datetime.datetime.now().astimezone().tzinfo


def day_str_from_ms(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, LOCAL_TZ).strftime("%Y-%m-%d")


def today_str():
    return datetime.datetime.now(LOCAL_TZ).strftime("%Y-%m-%d")


def _fmt_time(ms):
    if not ms:
        return None
    return datetime.datetime.fromtimestamp(ms / 1000, LOCAL_TZ).strftime("%H:%M")


def _fmt_dt(ms):
    if not ms:
        return None
    return datetime.datetime.fromtimestamp(ms / 1000, LOCAL_TZ).strftime("%Y-%m-%d %H:%M")


def _day_bounds(date_str):
    d = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    start = int(d.replace(tzinfo=LOCAL_TZ).timestamp() * 1000)
    end = int((d + datetime.timedelta(days=1)).replace(tzinfo=LOCAL_TZ).timestamp() * 1000)
    return start, end


def calendar_month(con, month):
    """month='YYYY-MM' -> per-day activity counts."""
    y, m = (int(x) for x in month.split("-"))
    start = int(datetime.datetime(y, m, 1, tzinfo=LOCAL_TZ).timestamp() * 1000)
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    end = int(datetime.datetime(ny, nm, 1, tzinfo=LOCAL_TZ).timestamp() * 1000)

    prompts = con.execute(
        "SELECT ts, session_id FROM prompts WHERE ts>=? AND ts<?", (start, end)
    ).fetchall()
    commits = con.execute(
        "SELECT ts FROM git_events WHERE ts>=? AND ts<?", (start, end)
    ).fetchall()
    acts = con.execute(
        "SELECT day, SUM(n_items) n FROM activities GROUP BY day"
    ).fetchall()
    sess = con.execute(
        "SELECT started_at, last_status FROM sessions WHERE is_primary=1 AND started_at>=? AND started_at<?",
        (start, end),
    ).fetchall()

    by_day = {}
    for r in prompts:
        d = day_str_from_ms(r["ts"])
        e = by_day.setdefault(d, {"date": d, "prompts": 0, "commits": 0, "sessions": 0, "fs": 0})
        e["prompts"] += 1
    for r in commits:
        d = day_str_from_ms(r["ts"])
        e = by_day.setdefault(d, {"date": d, "prompts": 0, "commits": 0, "sessions": 0, "fs": 0})
        e["commits"] += 1
    for r in sess:
        d = day_str_from_ms(r["started_at"])
        e = by_day.setdefault(d, {"date": d, "prompts": 0, "commits": 0, "sessions": 0, "fs": 0})
        e["sessions"] += 1
    for a in acts:
        if not a["day"]:
            continue
        if not a["day"].startswith(month):
            continue
        e = by_day.setdefault(a["day"], {"date": a["day"], "prompts": 0, "commits": 0, "sessions": 0, "fs": 0})
        e["fs"] = a["n"] or 0
    for e in by_day.values():
        e["score"] = e["prompts"] * 2 + min(e["commits"], 20) + min(e["fs"] // 10, 10) \
            + (3 if e["sessions"] else 0)
    days = sorted(by_day.values(), key=lambda x: x["date"])
    return {"month": month, "days": days}


def _session_brief(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "project_path": row["directory"],
        "status": row["last_status"],
        "phase": row["last_phase"],
        "confidence": row["last_confidence"],
        "prompts": row["prompt_count"],
        "started": _fmt_dt(row["started_at"]),
        "started_ts": row["started_at"],
        "updated_ts": row["updated_at"],
        "agent": row["agent"],
    }


def day_view(con, date_str):
    s, e = _day_bounds(date_str)
    prompts = con.execute(
        """SELECT p.*, s.title AS session_title, s.directory AS project_path
           FROM prompts p LEFT JOIN sessions s ON s.id=p.session_id
           WHERE p.ts>=? AND p.ts<? ORDER BY p.ts ASC""", (s, e)).fetchall()

    sessions = con.execute(
        """SELECT * FROM sessions WHERE is_primary=1 AND (
             (started_at>=? AND started_at<?) OR (last_activity_at>=? AND last_activity_at<?))
           ORDER BY started_at ASC""", (s, e, s, e)).fetchall()

    commits = con.execute(
        "SELECT * FROM git_events WHERE ts>=? AND ts<? ORDER BY ts ASC", (s, e)).fetchall()
    acts = con.execute(
        "SELECT * FROM activities WHERE day=? ORDER BY ts ASC", (date_str,)).fetchall()
    status_ev = con.execute(
        """SELECT se.* FROM status_events se WHERE se.ts>=? AND se.ts<? ORDER BY se.ts ASC""",
        (s, e)).fetchall()

    # project roll-up for the day
    proj = {}
    for p in prompts:
        key = p["project_path"] or "(unknown)"
        pr = proj.setdefault(key, {
            "path": key, "name": (key.rstrip("/").split("/")[-1] or key),
            "prompts": 0, "commits": 0, "fs_changes": 0,
        })
        pr["prompts"] += 1
    for c in commits:
        key = c["repo_path"]
        pr = proj.setdefault(key, {
            "path": key, "name": (key.rstrip("/").split("/")[-1] or key),
            "prompts": 0, "commits": 0, "fs_changes": 0,
        })
        pr["commits"] += 1
    for a in acts:
        key = a["project_path"]
        pr = proj.setdefault(key, {
            "path": key, "name": (key.rstrip("/").split("/")[-1] or key),
            "prompts": 0, "commits": 0, "fs_changes": 0,
        })
        pr["fs_changes"] = max(pr["fs_changes"], a["n_items"] or 0)
    projects_list = sorted(proj.values(), key=lambda x: -(x["prompts"] + x["commits"]))
    for pr in projects_list:
        base = pr["path"].rstrip("/").split("/")[-1]
        pr["display_name"] = _pretty_project(base)

    timeline = []
    for p in prompts:
        timeline.append({
            "ts": p["ts"], "kind": "prompt",
            "label": f"Prompt sent — {p['session_title'] or 'session'}",
            "detail": (p["text"][:180] + ("\u2026" if len(p["text"]) > 180 else "")),
            "session_id": p["session_id"],
        })
    for ss in sessions:
        timeline.append({
            "ts": ss["started_at"], "kind": "session",
            "label": f"Session started — {ss['title']}",
            "detail": ss["directory"],
            "session_id": ss["id"],
        })
    for ev in status_ev:
        timeline.append({
            "ts": ev["ts"], "kind": "status",
            "label": f"{ev['status']} — {ev['phase'] or ''}".strip(),
            "detail": ev["detail"] or "",
            "confidence": ev["confidence"],
            "session_id": ev["session_id"],
        })
    for c in commits:
        timeline.append({
            "ts": c["ts"], "kind": "git",
            "label": f"Commit {c['hash'][:7]} — {c['subject']}",
            "detail": f"{c['files_changed']} files \u00b7 +{c['additions']}/-{c['deletions']} \u00b7 {c['author']}",
        })
    for a in acts:
        timeline.append({
            "ts": a["ts"], "kind": "files",
            "label": f"{a['n_items']} files changed — {a['project_path'].rstrip('/').split('/')[-1]}",
            "detail": a["detail"] or "",
        })
    timeline.sort(key=lambda x: x["ts"])

    summary_bits = []
    if prompts:
        summary_bits.append(f"{len(prompts)} prompt{'s' if len(prompts)!=1 else ''} sent")
    if sessions:
        summary_bits.append(f"{len(sessions)} primary session{'s' if len(sessions)!=1 else ''} worked on")
    if commits:
        summary_bits.append(f"{len(commits)} verified commit{'s' if len(commits)!=1 else ''}")
    if acts:
        summary_bits.append("filesystem changes verified")

    return {
        "date": date_str,
        "summary": {
            "headline": (" \u00b7 ".join(summary_bits)) if summary_bits else "No recorded activity.",
            "prompts": len(prompts), "sessions": len(sessions),
            "commits": len(commits), "projects": projects_list,
        },
        "prompts": [
            {
                "id": p["id"], "ts": p["ts"], "time": _fmt_time(p["ts"]),
                "text": p["text"], "chars": p["chars"], "redacted": bool(p["redacted"]),
                "session_id": p["session_id"], "session_title": p["session_title"],
                "project_path": p["project_path"], "seq": p["seq"],
            } for p in prompts
        ],
        "sessions": [_session_brief(ss) for ss in sessions],
        "timeline": timeline,
        "git": [dict(c) for c in commits],
        "verified_fs": [dict(a) for a in acts],
    }


def _pretty_project(folder):
    name = folder
    for token in ("[model-openrouter-stealth-ox-alpha]", "[opencode]"):
        name = name.replace(token, "")
    import re as _re
    name = _re.sub(r"\[run[:-]\d+\]", "", name).strip()
    return name or folder


def search(con, q, limit=60):
    like = f"%{q}%"
    hits = []
    for r in con.execute(
        "SELECT p.id,p.ts,p.text,p.session_id,s.title,s.directory FROM prompts p "
        "LEFT JOIN sessions s ON s.id=p.session_id "
        "WHERE p.text LIKE ? ORDER BY p.ts DESC LIMIT ?", (like, limit)):
        pos = (r["text"] or "").lower().find(q.lower())
        frag = (r["text"] or "")[max(0, pos - 60): pos + 140]
        hits.append({
            "type": "prompt", "ts": r["ts"], "date": day_str_from_ms(r["ts"]),
            "session_id": r["session_id"], "session_title": r["title"],
            "fragment": "\u2026" + frag.replace("\n", " ") + "\u2026",
            "project_path": r["directory"],
        })
    for r in con.execute(
        "SELECT id,title,directory,started_at,last_status FROM sessions "
        "WHERE title LIKE ? AND is_primary=1 ORDER BY updated_at DESC LIMIT 20", (like,)):
        hits.append({
            "type": "session", "ts": r["started_at"], "date": day_str_from_ms(r["started_at"]),
            "session_id": r["id"], "session_title": r["title"],
            "fragment": r["directory"], "project_path": r["directory"],
            "status": r["last_status"],
        })
    return hits[:limit]


def project_history(con, path, limit_days=90):
    rows_p = con.execute(
        "SELECT COUNT(*) n FROM prompts p JOIN sessions s ON s.id=p.session_id WHERE s.directory=?", (path,)
    ).fetchone()
    since = config.now_ms() - limit_days * 86400_000
    prompts = con.execute(
        """SELECT p.*, s.title session_title FROM prompts p JOIN sessions s ON s.id=p.session_id
           WHERE s.directory=? AND p.ts>? ORDER BY p.ts DESC LIMIT 200""", (path, since)).fetchall()
    commits = con.execute(
        "SELECT * FROM git_events WHERE repo_path=? AND ts>? ORDER BY ts DESC LIMIT 200",
        (path.replace("\\", "/"), since)).fetchall()
    by_date = {}
    for p in prompts:
        d = day_str_from_ms(p["ts"])
        e = by_date.setdefault(d, {"date": d, "prompts": 0, "commits": 0, "notes": []})
        e["prompts"] += 1
        if len(e["notes"]) < 3:
            first_line = (p["text"] or "").strip().splitlines()[0][:120]
            e["notes"].append(first_line)
    for c in commits:
        d = day_str_from_ms(c["ts"])
        e = by_date.setdefault(d, {"date": d, "prompts": 0, "commits": 0, "notes": []})
        e["commits"] += 1
        if len(e["notes"]) < 4:
            e["notes"].append(f"commit: {c['subject']}")
    return {
        "path": path,
        "name": _pretty_project(path.rstrip("/").split("/")[-1]),
        "total_prompts": rows_p["n"] if rows_p else 0,
        "days": sorted(by_date.values(), key=lambda x: x["date"], reverse=True),
    }


def projects_overview(con):
    out = []
    for r in con.execute(
        """SELECT directory, COUNT(*) n_sessions, MAX(last_activity_at) la
           FROM sessions WHERE is_primary=1 AND directory IS NOT NULL
           GROUP BY directory ORDER BY la DESC LIMIT 200"""):
        pc = con.execute(
            "SELECT COUNT(*) n FROM prompts p JOIN sessions s ON s.id=p.session_id WHERE s.directory=?",
            (r["directory"],)).fetchone()["n"]
        cc = con.execute(
            "SELECT COUNT(*) n FROM git_events WHERE repo_path=?",
            (r["directory"].replace("\\", "/"),)).fetchone()["n"]
        out.append({
            "path": r["directory"],
            "name": _pretty_project(r["directory"].rstrip("/").split("/")[-1]),
            "sessions": r["n_sessions"], "prompts": pc, "commits": cc,
            "last_activity": _fmt_dt(r["la"]), "last_activity_ts": r["la"],
        })
    return out


def meta_counts(con):
    return {
        "prompts": con.execute("SELECT COUNT(*) n FROM prompts").fetchone()["n"],
        "sessions": con.execute("SELECT COUNT(*) n FROM sessions WHERE is_primary=1").fetchone()["n"],
        "excluded_sessions": con.execute(
            "SELECT COUNT(*) n FROM sessions WHERE is_primary=0").fetchone()["n"]
        if _has_col(con, "sessions", "is_primary") else 0,
        "commits": con.execute("SELECT COUNT(*) n FROM git_events").fetchone()["n"],
        "first_prompt": con.execute("SELECT MIN(ts) m FROM prompts").fetchone()["m"],
    }


def _has_col(con, table, col):
    return col in {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
