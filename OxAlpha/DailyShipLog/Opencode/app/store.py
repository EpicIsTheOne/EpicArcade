"""Durable local datastore for the journal (separate SQLite file we own)."""

import os
import sqlite3
import threading

from . import config

_SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  name TEXT,
  is_git INTEGER DEFAULT 0,
  first_seen INTEGER,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  directory TEXT,
  title TEXT,
  agent TEXT,
  parent_id TEXT,
  started_at INTEGER,
  updated_at INTEGER,
  archived_at INTEGER,
  is_primary INTEGER DEFAULT 1,
  prompt_count INTEGER DEFAULT 0,
  last_status TEXT,
  last_phase TEXT,
  last_confidence TEXT,
  last_activity_at INTEGER,
  msg_watermark INTEGER DEFAULT 0,
  part_watermark INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_dir_idx ON sessions(directory);
CREATE INDEX IF NOT EXISTS sessions_upd_idx ON sessions(updated_at);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  seq INTEGER,
  ts INTEGER,
  text TEXT,
  chars INTEGER,
  redacted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS prompts_ts_idx ON prompts(ts);
CREATE INDEX IF NOT EXISTS prompts_sess_idx ON prompts(session_id);

CREATE TABLE IF NOT EXISTS status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  ts INTEGER,
  status TEXT,
  phase TEXT,
  detail TEXT,
  confidence TEXT,
  UNIQUE(session_id, ts, status, phase)
);
CREATE INDEX IF NOT EXISTS status_ts_idx ON status_events(ts);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT,
  ts INTEGER,
  project_path TEXT,
  kind TEXT,
  detail TEXT,
  n_items INTEGER DEFAULT 0,
  evidence_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS activities_day_idx ON activities(day);

CREATE TABLE IF NOT EXISTS git_events (
  hash TEXT PRIMARY KEY,
  repo_path TEXT,
  ts INTEGER,
  author TEXT,
  subject TEXT,
  files_changed INTEGER DEFAULT 0,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS git_ts_idx ON git_events(ts);
"""

_lock = threading.RLock()


def connect(path=None):
    os.makedirs(os.path.dirname(path or config.DB_PATH), exist_ok=True)
    con = sqlite3.connect(path or config.DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init(path=None):
    with _lock:
        con = connect(path)
        try:
            con.executescript(_SCHEMA)
            con.execute(
                "INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version',?)",
                (str(config.SCHEMA_VERSION),),
            )
            con.commit()
        finally:
            con.close()


def meta_get(con, key, default=None):
    r = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return r["value"] if r else default


def meta_set(con, key, value):
    con.execute(
        "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, str(value)),
    )
