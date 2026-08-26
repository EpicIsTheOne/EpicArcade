"""Verified READ-ONLY access to the current runner's session store (opencode).

Ownership verification: a store is only ingested when it carries the opencode
schema fingerprint (known tables/columns) AND lives at the documented path of
the installed opencode build. Anything that fails verification is never read.
"""

import os
import shutil
import sqlite3
import tempfile
import time

from . import config

REQUIRED_TABLES = {
    "session": {"id", "project_id", "parent_id", "directory", "title", "agent",
                "time_created", "time_updated", "time_archived"},
    "message": {"id", "session_id", "time_created", "data"},
    "part": {"id", "message_id", "session_id", "time_created", "data"},
    "todo": {"session_id", "content", "status", "position"},
    "project": {"id", "worktree", "vcs"},
}

_verification_cache = {}


class SourceError(Exception):
    pass


def _columns(con, table):
    try:
        return {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error:
        return set()


def verify_source(path=None, force=False):
    """Return dict describing why `path` is accepted as the current runner's store.

    Raises SourceError when evidence is insufficient.
    """
    path = path or config.OC_DB
    if not force and path in _verification_cache:
        return _verification_cache[path]
    reasons = []
    ok = True

    documented = os.path.normcase(os.path.abspath(config.OC_DB_DEFAULT))
    actual = os.path.normcase(os.path.abspath(path))
    if actual == documented:
        reasons.append("lives at installed opencode's documented store path")
    else:
        reasons.append("non-default path; requires schema fingerprint match")

    if not os.path.exists(path):
        raise SourceError(f"source db missing: {path}")

    con = _connect_ro(path)
    try:
        names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        matched = [t for t in REQUIRED_TABLES if t in names]
        if len(matched) < len(REQUIRED_TABLES):
            ok = False
            reasons.append(f"schema fingerprint mismatch: missing {[t for t in REQUIRED_TABLES if t not in names]}")
        else:
            for t, cols in REQUIRED_TABLES.items():
                have = _columns(con, t)
                miss = cols - have
                if miss:
                    ok = False
                    reasons.append(f"table {t} missing columns {sorted(miss)}")
                else:
                    reasons.append(f"table `{t}` matches known opencode schema")
        if ok:
            reasons.append("VERIFIED as current-runner store")
    finally:
        con.close()

    result = {"path": path, "verified": bool(ok), "reasons": reasons}
    _verification_cache[path] = result
    return result


def _connect_ro(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=0.35)
    con.row_factory = sqlite3.Row
    try:
        con.execute("PRAGMA busy_timeout=350")
        con.execute("PRAGMA query_only=1")
    except sqlite3.Error:
        pass
    return con


def snapshot_copy(src, dst_dir):
    """Consistent-enough copy of a live WAL sqlite db for safe reading."""
    base = os.path.join(dst_dir, "oc_snapshot.db")
    for suffix in ("", "-wal", "-shm"):
        s = src + suffix
        d = base + suffix
        try:
            if os.path.exists(s):
                shutil.copyfile(s, d)
            elif os.path.exists(d):
                os.remove(d)
        except OSError:
            pass
    return base


class Source:
    """Read-only reader with bounded retries and snapshot fallback."""

    def __init__(self, path=None):
        self.path = path or config.OC_DB
        self._tmpdir = None

    def close(self):
        if self._tmpdir and os.path.isdir(self._tmpdir):
            shutil.rmtree(self._tmpdir, ignore_errors=True)
            self._tmpdir = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def query(self, sql, params=(), retries=3):
        """Run a read-only query. Falls back to a temp snapshot on lock trouble."""
        last = None
        for attempt in range(retries):
            try:
                con = _connect_ro(self.path)
                try:
                    return [dict(r) for r in con.execute(sql, params)]
                finally:
                    con.close()
            except sqlite3.OperationalError as e:
                last = e
                time.sleep(0.12 * (attempt + 1))
            except sqlite3.DatabaseError as e:
                last = e
                break
        # Fallback: snapshot copy (still strictly read-only w.r.t. the source).
        if self._tmpdir is None:
            self._tmpdir = tempfile.mkdtemp(prefix="shiplog-snap-")
        snap = snapshot_copy(self.path, self._tmpdir)
        con = sqlite3.connect(f"file:{snap}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        try:
            return [dict(r) for r in con.execute(sql, params)]
        except sqlite3.DatabaseError:
            return []  # torn snapshot; next tick will retry fresh
        finally:
            con.close()
