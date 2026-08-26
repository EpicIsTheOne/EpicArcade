import hashlib
import json
import os

from . import RUN_DIR

PRODUCT_ID = "daily-ship-log"
PRODUCT_NAME = "Daily Ship Log"

STATE_DIR = os.path.join(RUN_DIR, "state")
WEB_DIR = os.path.join(RUN_DIR, "web")
DB_PATH = os.path.join(STATE_DIR, "shiplog.db")
RUNTIME_PATH = os.path.join(STATE_DIR, "runtime.json")
LOG_PATH = os.path.join(STATE_DIR, "shiplog.log")

# Source store (the current runner: opencode). Env override exists for tests.
OC_DB_DEFAULT = os.path.join(
    os.environ.get("USERPROFILE", os.path.expanduser("~")), ".local", "share", "opencode", "opencode.db"
)
OC_DB = os.environ.get("SHIPLOG_OC_DB") or OC_DB_DEFAULT

PORT_RANGE = list(range(9420, 9461))
BIND_HOST = "127.0.0.1"

# Scheduling
LIGHT_INTERVAL_S = 45          # live status + incremental prompt capture
HEAVY_INTERVAL_S = 5 * 3600    # historical reconciliation pass

# Status derivation windows (seconds)
ACTIVE_STREAM_S = 90           # part writes fresher than this => RUNNING
WAITING_AFTER_S = 150          # quiet but < QUIET_STOP_S => WAITING
QUIET_STOP_S = 20 * 60         # quiet longer than this => STOPPED
COMPLETE_QUIET_S = 25 * 60     # quiet + completion markers => COMPLETED
FAILED_QUIET_S = 10 * 60       # quiet + blocker markers => FAILED

# Bounded recent-state reading
RECENT_MSG_LIMIT = 14          # newest messages inspected for status
RECENT_TEXT_BUDGET = 20000     # max chars of assistant text considered per tick

PRIMARY_AGENTS = {"build", "plan"}   # None (legacy) also allowed
INTERNAL_AGENT_PREFIXES = ("opencode-",)

SCHEMA_VERSION = 1


def now_ms():
    import time
    return int(time.time() * 1000)


def runtime_load():
    import json
    try:
        with open(RUNTIME_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def runtime_save(data):
    import json
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = RUNTIME_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, RUNTIME_PATH)


def sha16(*parts):
    h = hashlib.sha256()
    for p in parts:
        h.update(str(p).encode("utf-8", "replace"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


def jload(s, default=None):
    try:
        return json.loads(s)
    except Exception:
        return default if default is not None else {}
