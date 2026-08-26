"""Daily Ship Log — local-first AI development journal.

Read-only observer over the local opencode runner's SQLite store.
"""

import os
import sys
import time

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
RUN_DIR = os.path.dirname(APP_ROOT)


def ensure_utf8_stdio():
    for s in (sys.stdout, sys.stderr):
        reconf = getattr(s, "reconfigure", None)
        if callable(reconf):
            reconf(encoding="utf-8", errors="replace")


def now_ms():
    return int(time.time() * 1000)
