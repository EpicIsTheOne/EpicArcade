"""Scheduling engine: lightweight live tick + ~5h historical pass.

Clock is injectable for deterministic tests. Catch-up: the heavy pass always
runs from the persisted checkpoint forward, so downtime loses nothing.
"""

import threading
import time
import traceback

from . import config, observer, projects, store


class Engine:
    def __init__(self, src_path=None, clock=None, heavy_interval=None, light_interval=None):
        self.observer = observer.Observer(src_path=src_path) if src_path else observer.Observer()
        self.clock = clock or config.now_ms
        self.heavy_interval = heavy_interval or config.HEAVY_INTERVAL_S
        self.light_interval = light_interval or config.LIGHT_INTERVAL_S
        self._stop = threading.Event()
        self._thread = None
        self.last_light = None
        self.last_heavy = None
        self.next_heavy = None
        self.last_error = None

    # ------------------------------------------------------------- passes

    def run_light(self):
        now = self.clock()
        con = store.connect()
        try:
            stats = self.observer.light_pass(con, now)
            self.last_light = now
            return stats
        finally:
            con.close()

    def run_heavy(self, force=False):
        now = self.clock()
        con = store.connect()
        try:
            ckpt_raw = store.meta_get(con, "heavy_checkpoint_ms")
            ckpt = int(ckpt_raw) if ckpt_raw else 0
            mode = "bootstrap"
            if ckpt > 0 and not force:
                mode = "catchup"
                obs_res = self.observer.heavy_pass(con, since_ms=ckpt - 3600_000, now=now)
            else:
                obs_res = self.observer.heavy_pass(con, since_ms=ckpt if force else 0, now=now)
                if force and ckpt > 0:
                    mode = "forced"
            ver_res = projects.verify_projects(con, ckpt if (ckpt and not force) else 0, now)
            res = {
                "mode": mode if not force else "forced",
                "observed": obs_res,
                "verified": ver_res,
            }
            store.meta_set(con, "heavy_checkpoint_ms", str(now))
            store.meta_set(con, "last_heavy_iso", time.strftime("%Y-%m-%d %H:%M:%S"))
            con.commit()
            self.last_heavy = now
            self.next_heavy = now + self.heavy_interval * 1000
            return res
        except Exception:
            self.last_error = traceback.format_exc()
            raise
        finally:
            con.close()

    def startup(self):
        """Load state, catch-up if stale, init live status."""
        con = store.connect()
        try:
            ckpt_raw = store.meta_get(con, "heavy_checkpoint_ms")
        finally:
            con.close()
        ckpt = int(ckpt_raw) if ckpt_raw else 0
        now = self.clock()
        stale = (now - ckpt) > self.heavy_interval * 1000
        if stale or ckpt == 0:
            return self.run_heavy(force=(ckpt == 0))
        return {"mode": "fresh", "checkpoint_age_s": (now - ckpt) // 1000}

    # -------------------------------------------------------------- loop

    def _loop(self):
        next_heavy_at = self.clock() + self.heavy_interval * 1000
        self.next_heavy = next_heavy_at
        while not self._stop.is_set():
            try:
                self.run_light()
            except Exception:
                self.last_error = traceback.format_exc()
            now = self.clock()
            if now >= next_heavy_at:
                try:
                    self.run_heavy()
                    next_heavy_at = self.clock() + self.heavy_interval * 1000
                    self.next_heavy = next_heavy_at
                except Exception:
                    # failure must NOT advance checkpoint; retry sooner
                    next_heavy_at = self.clock() + 600_000
                    self.next_heavy = next_heavy_at
            self._stop.wait(max(5, self.light_interval))

    def start_background(self):
        if self._thread and self._thread.is_alive():
            return False
        self._thread = threading.Thread(target=self._loop, name="shiplog-engine", daemon=True)
        self._thread.start()
        return True

    def stop(self, timeout=5):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)
