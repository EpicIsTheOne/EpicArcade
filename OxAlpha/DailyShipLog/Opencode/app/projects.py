"""Independent VERIFICATION of activity: git history + filesystem changes.

Everything here is evidence gathered outside the agent's own claims.
"""

import os
import subprocess

from . import config, store


def _run_git(repo, args, timeout=20):
    try:
        p = subprocess.run(
            ["git", "-C", repo] + args,
            capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )
        return p if p.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def is_git_repo(path):
    return os.path.isdir(os.path.join(path, ".git")) or bool(
        path and _run_git(path, ["rev-parse", "--is-inside-work-tree"])
    )


def git_commits_since(repo, since_epoch_s, max_count=400):
    """Return list of commit dicts since a time (epoch seconds)."""
    args = ["log", "--all"]
    if since_epoch_s and int(since_epoch_s) > 0:
        import datetime
        iso = datetime.datetime.fromtimestamp(int(since_epoch_s)).strftime("%Y-%m-%d %H:%M:%S")
        args.append(f"--since={iso}")
    args += [
        "--max-count=%d" % max_count,
        "--pretty=format:%H%x1f%at%x1f%an%x1f%s%x1f%b%n",
        "--shortstat",
    ]
    r = _run_git(repo, args)
    if not r:
        return []
    commits = []
    lines = r.stdout.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        parts = line.split("\x1f")
        if len(parts) >= 4:
            h, at, author, subject = parts[0], int(float(parts[1] or 0)), parts[2], parts[3]
            stats = {"files": 0, "ins": 0, "del": 0}
            if i + 1 < len(lines) and " file" in lines[i + 1]:
                stline = lines[i + 1]
                for token in stline.split(","):
                    token = token.strip()
                    bit = token.split(" ", 1)
                    if len(bit) == 2:
                        try:
                            n = int(bit[0])
                        except ValueError:
                            continue
                        key = ("files" if "changed" in bit[1]
                               else "ins" if "insertion" in bit[1] else "del")
                        stats[key] += n
                i += 1
            commits.append({
                "hash": h, "ts": at * 1000, "author": author, "subject": subject.strip(),
                **stats,
            })
        i += 1
    return [c for c in commits if not _is_noise(c["subject"])]


def _is_noise(subject):
    s = subject.strip().lower()
    return (s.startswith("t3 checkpoint")
            or s.startswith("checkpoint ref=")
            or s.startswith("wip on ")
            or s.startswith("temp commit"))


SKIP_DIRS = {".git", "node_modules", ".next", "dist", "build", ".venv", "__pycache__",
             "state", ".benchmark-claim.json"}


def fs_changes_since(root, since_ms, max_files=500, max_depth=3):
    """Count/sample files modified under root since a time. Bounded walk."""
    changed = []
    count = 0
    root = os.path.abspath(root)
    since_s = since_ms / 1000.0
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if depth >= max_depth:
            dirnames[:] = []
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for f in filenames:
            if f in SKIP_DIRS:
                continue
            fp = os.path.join(dirpath, f)
            try:
                st = os.stat(fp)
            except OSError:
                continue
            if st.st_mtime >= since_s:
                count += 1
                if len(changed) < 40:
                    try:
                        changed.append(os.path.relpath(fp, root))
                    except ValueError:
                        changed.append(f)
                if count >= max_files:
                    return count, changed
    return count, changed


def record_git_activity(con, repo_root, since_ms, now):
    """Pull new commits for one resolved repo root into git_events; idempotent."""
    added = 0
    for c in git_commits_since(repo_root, since_ms / 1000.0):
        cur = con.execute(
            "INSERT OR IGNORE INTO git_events(hash,repo_path,ts,author,subject,files_changed,additions,deletions) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (c["hash"], repo_root.replace("\\", "/"), c["ts"], c["author"], c["subject"],
             c["files"], c["ins"], c["del"]),
        )
        added += cur.rowcount
    return added


def record_fs_activity(con, project_path, day_of_ts, since_ms, now):
    n, sample = fs_changes_since(project_path, since_ms)
    if n == 0:
        return 0
    ev_hash = config.sha16("fs", project_path, since_ms, n)
    detail = "; ".join(sample[:12])
    con.execute(
        "INSERT OR IGNORE INTO activities(day,ts,project_path,kind,detail,n_items,evidence_hash) VALUES(?,?,?,?,?,?,?)",
        (_day_str(day_of_ts), day_of_ts, project_path.replace("\\", "/"), "files", detail, n, ev_hash),
    )
    return 1


def _day_str(ms):
    import datetime
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d")


def _repo_root(path):
    r = _run_git(path, ["rev-parse", "--show-toplevel"])
    if not r:
        return None
    return os.path.normpath((r.stdout or "").strip().replace("/", os.sep) or path)


def verify_projects(con, since_ms, now):
    """Heavy-pass verification over all known projects (deduped per repo root)."""
    out = {"commits": 0, "fs_marks": 0}
    rows = con.execute(
        "SELECT path FROM projects WHERE path != '/' AND length(path) > 4"
    ).fetchall()
    paths = [r["path"].replace("\\", "/") for r in rows if os.path.isdir(r["path"])]
    paths.sort(key=lambda p: p.count("/"), reverse=True)  # deepest first: nested repos claim their commits
    seen_roots = set()
    for p in paths:
        root = _repo_root(p)
        if root:
            key = os.path.normcase(root)
            if key not in seen_roots:
                seen_roots.add(key)
                out["commits"] += record_git_activity(con, root, since_ms, now)
        out["fs_marks"] += record_fs_activity(con, p, now, since_ms, now)
    return out
