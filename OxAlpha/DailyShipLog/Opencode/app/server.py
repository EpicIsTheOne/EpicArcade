"""Localhost HTTP server: JSON API + static web UI. Binds 127.0.0.1 only."""

import datetime
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from app import config, engine, store, views  # noqa: E402
else:
    from . import config, engine, store, views

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
}

_started_at = time.time()
_engine = None  # type: Optional[engine.Engine]
_proc_cache = {"ts": 0.0, "alive": False, "count": 0}
_proc_lock = threading.Lock()


def runner_process_probe(max_age_s=90):
    """Detect opencode runner processes via command-line (read-only query)."""
    now = time.time()
    with _proc_lock:
        if now - _proc_cache["ts"] < max_age_s:
            return _proc_cache["alive"], _proc_cache["count"]
    count = 0
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_Process -Filter \"Name like '%opencode%'\" | "
             "Measure-Object).Count"],
            capture_output=True, text=True, timeout=20,
        )
        txt = (out.stdout or "").strip().splitlines()
        if txt and txt[-1].strip().isdigit():
            count = int(txt[-1].strip())
    except Exception:
        count = 0
    alive = count > 0
    _proc_cache.update({"ts": now, "alive": alive, "count": count})
    return alive, count


def live_sessions(src_path=None):
    """Derive current status for warm primary sessions straight from source."""
    from .observer import Observer, is_primary
    from .source import Source
    obs = Observer(src_path=src_path) if src_path else getattr(_engine, "observer", None) or Observer()
    now = config.now_ms()
    out = []
    runner_alive, proc_count = runner_process_probe()
    with Source(obs.src_path) as src:
        window = now - (config.QUIET_STOP_S + 1800) * 1000
        rows = src.query(
            "SELECT * FROM session WHERE parent_id IS NULL AND time_updated>? "
            "ORDER BY time_updated DESC LIMIT 40", (window,))
        con = store.connect()
        try:
            for srow in rows:
                if not is_primary(srow):
                    continue
                st = obs.refresh_status(src, con, srow, now)
                if st.status in ("STOPPED", "UNKNOWN"):
                    continue
                out.append({
                    "id": srow["id"],
                    "title": srow["title"],
                    "project_path": srow["directory"],
                    "project_name": views._pretty_project(
                        (srow["directory"] or "?").rstrip("/").split("/")[-1]),
                    "status": st.status,
                    "phase": st.phase,
                    "confidence": ("DIRECTLY OBSERVED" if st.status == "RUNNING"
                                   else st.confidence),
                    "activity": st.activity,
                    "progress": st.progress,
                    "blocker": st.blocker,
                    "last_activity_ts": st.last_activity_at,
                    "started_ts": srow["time_created"],
                    "agent": srow.get("agent"),
                })
        finally:
            con.close()
    out.sort(key=lambda x: x["last_activity_ts"], reverse=True)
    return {"runner_processes": proc_count, "sessions": out}


class Handler(BaseHTTPRequestHandler):
    server_version = "DailyShipLog/1.0"

    def log_message(self, format, *args):  # noqa: A002 - stdlib signature
        pass

    # ------------------------------------------------------------ helpers

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path):
        webroot = os.path.abspath(config.WEB_DIR)
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        full = os.path.abspath(os.path.join(webroot, rel))
        if not full.startswith(webroot) or not os.path.isfile(full):
            self.send_error(404)
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # -------------------------------------------------------------- verbs

    def do_GET(self):
        try:
            path, _, qs = self.path.partition("?")
            params = dict(p.split("=", 1) for p in qs.split("&") if "=" in p)
            from urllib.parse import unquote
            params = {k: unquote(v) for k, v in params.items()}
            if path == "/api/meta":
                self._api_meta()
            elif path == "/api/live":
                self._json(live_sessions())
            elif path == "/api/calendar":
                month = params.get("month") or datetime.datetime.now().strftime("%Y-%m")
                con = store.connect()
                try:
                    self._json(views.calendar_month(con, month))
                finally:
                    con.close()
            elif path == "/api/day":
                date = params.get("date") or views.today_str()
                con = store.connect()
                try:
                    self._json(views.day_view(con, date))
                finally:
                    con.close()
            elif path == "/api/search":
                q = params.get("q", "").strip()
                if not q:
                    self._json({"hits": []})
                    return
                con = store.connect()
                try:
                    self._json({"q": q, "hits": views.search(con, q)})
                finally:
                    con.close()
            elif path == "/api/project":
                p = params.get("path", "")
                if not p:
                    self._json({"error": "path required"}, 400)
                    return
                con = store.connect()
                try:
                    self._json(views.project_history(con, p))
                finally:
                    con.close()
            elif path == "/api/projects":
                con = store.connect()
                try:
                    self._json({"projects": views.projects_overview(con)})
                finally:
                    con.close()
            elif path.startswith("/api/"):
                self._json({"error": "unknown endpoint"}, 404)
            else:
                self._static(path)
        except BrokenPipeError:
            pass
        except Exception as e:
            try:
                self._json({"error": str(e)}, 500)
            except Exception:
                pass

    def do_POST(self):
        try:
            path = self.path.partition("?")[0]
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except Exception:
                payload = {}
            if path == "/api/refresh":
                kind = payload.get("kind", "light")
                if kind == "heavy":
                    eng = _engine
                    res = eng.run_heavy(force=bool(payload.get("force"))) if eng else {"error": "no engine"}
                else:
                    eng = _engine
                    res = eng.run_light() if eng else {"error": "no engine"}
                self._json({"ok": True, "result": res})
            else:
                self._json({"error": "unknown endpoint"}, 404)
        except Exception as e:
            try:
                self._json({"error": str(e)}, 500)
            except Exception:
                pass

    # ------------------------------------------------------------- api fns

    def _api_meta(self):
        con = store.connect()
        try:
            counts = views.meta_counts(con)
            last_heavy_iso = store.meta_get(con, "last_heavy_iso")
            ckpt = store.meta_get(con, "heavy_checkpoint_ms")
        finally:
            con.close()
        nxt = None
        if _engine and _engine.next_heavy:
            nxt = datetime.datetime.fromtimestamp(
                _engine.next_heavy / 1000).strftime("%Y-%m-%d %H:%M:%S")
        runner_alive, proc_count = runner_process_probe()
        self._json({
            "product": config.PRODUCT_ID,
            "name": config.PRODUCT_NAME,
            "port": int(getattr(self.server, "server_address", ("127.0.0.1", 0))[1]),
            "pid": os.getpid(),
            "uptime_s": int(time.time() - _started_at),
            "last_light_ts": _engine.last_light if _engine else None,
            "last_heavy_iso": last_heavy_iso,
            "heavy_checkpoint_ms": ckpt,
            "next_heavy_iso": nxt,
            "counts": counts,
            "observer": {
                "source": config.OC_DB,
                "verified": _engine.observer._verification["verified"] if _engine else None,
                "reasons": _engine.observer._verification["reasons"] if _engine else [],
                "write_access": "none (query_only read-only connections)",
            },
            "runner_processes": proc_count,
        })


def pick_port(preferred=None):
    import socket
    candidates = ([preferred] if preferred else []) + config.PORT_RANGE
    for port in candidates:
        if not port:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((config.BIND_HOST, port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port in range")


def _log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    try:
        os.makedirs(config.STATE_DIR, exist_ok=True)
        with open(config.LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    print(line, flush=True)


def main():
    preferred = None
    if "--port" in sys.argv:
        preferred = int(sys.argv[sys.argv.index("--port") + 1])
    port = pick_port(preferred)

    store.init()

    global _engine
    _engine = engine.Engine()
    startup_res = {}
    try:
        startup_res = _engine.startup()
    except Exception as e:
        _log(f"startup pass failed: {e}")
    _engine.start_background()

    httpd = ThreadingHTTPServer((config.BIND_HOST, port), Handler)
    httpd.daemon_threads = True

    config.runtime_save({
        "product": config.PRODUCT_ID,
        "pid": os.getpid(),
        "port": port,
        "url": f"http://127.0.0.1:{port}",
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    _log(f"serving on http://127.0.0.1:{port} pid={os.getpid()} "
         f"startup={startup_res.get('mode')}")

    def shutdown(signum, frame):
        _log("shutting down")
        config.runtime_save({})
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    try:
        import signal
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)
    except Exception:
        pass

    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        _engine.stop(timeout=3)
        httpd.server_close()


if __name__ == "__main__":
    main()
