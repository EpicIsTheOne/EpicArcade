import hashlib
import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
PROMPTS = json.loads((ROOT / "prompts.json").read_text(encoding="utf-8"))
BY_ID = {p["id"]: p for p in PROMPTS}
FIELDS = {"id", "title", "difficulty", "harness", "filename", "text"}
RUNS_FILE = ROOT / "runs.json"
MAX_RUNS = 5000
VALID_STATUS = {"running", "pass", "fail", "error", "skipped"}
API_KEY = os.environ.get("OXALPHA_API_KEY") or "Epic"


# ---- placeholder resolution (contract: OxAlphaTracker/PLACEHOLDER_CONTRACT.md) ----

def _resolve_e2e_isolation_skill():
    override = os.environ.get("E2E_ISOLATION_SKILL_PATH")
    candidates = []
    if override:
        candidates.append(override)
    home = Path(os.path.expanduser("~"))
    for base in (".agents", ".claude"):
        candidates.append(str(home / base / "skills" / "isolated-e2e-testing" / "SKILL.md"))
    for c in candidates:
        try:
            if c and c != "UNAVAILABLE" and Path(c).is_file():
                return str(Path(c).resolve())
        except OSError:
            continue
    return "UNAVAILABLE"


PLACEHOLDER_RESOLVERS = {
    "{{E2E_ISOLATION_SKILL_PATH}}": _resolve_e2e_isolation_skill,
}


def resolve_placeholders(text):
    for ph, resolver in PLACEHOLDER_RESOLVERS.items():
        if ph in text:
            try:
                text = text.replace(ph, resolver())
            except Exception:
                pass
    return text


def resolved_prompt(p):
    q = dict(p)
    if "text" in q:
        q["text"] = resolve_placeholders(q["text"])
    return q


FEEDBACK_FILE = ROOT / "feedback.json"
REQUESTS_FILE = ROOT / "prompt_requests.json"
POLICY_FILE = ROOT / "artifact_policy.json"
_RATE = {}


def _load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save_json(path, data):
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def _rate_ok(ip, limit=6, window=3600):
    now = time.time()
    hits = [t for t in _RATE.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        return False
    _RATE.setdefault(ip, []).append(now)
    return True


def _clean(s, maxlen):
    return str(s or "").strip()[:maxlen]


def pack_hash():
    canonical = json.dumps(
        [{"id": p["id"], "title": p["title"], "difficulty": p["difficulty"],
          "filename": p["filename"], "text": p["text"]} for p in PROMPTS],
        sort_keys=True, ensure_ascii=False,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


PACK_HASH = pack_hash()


def progress_summary():
    """Live sweep status derived from tracker rows."""
    runs = load_runs()
    by_status = {}
    for r in runs:
        by_status[r.get("status") or "?"] = by_status.get(r.get("status") or "?", 0) + 1
    covered = {(r.get("promptId"), r.get("model"), r.get("harness")) for r in runs}
    completed_prompts = {r.get("promptId") for r in runs if r.get("status") == "pass"}
    last_update = max((r.get("updatedAt") or "" for r in runs), default=None)
    return {
        "packHash": PACK_HASH,
        "totalPrompts": len(PROMPTS),
        "promptsPassed": len(completed_prompts),
        "byStatus": by_status,
        "distinctResults": len(covered),
        "lastUpdate": last_update,
    }


def placeholders_status():
    out = {}
    for ph, resolver in PLACEHOLDER_RESOLVERS.items():
        try:
            value = resolver()
        except Exception:
            value = "UNAVAILABLE"
        out[ph] = {"resolved": value != "UNAVAILABLE", "value": value}
    return {"placeholders": out}


def load_runs():
    try:
        return json.loads(RUNS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_runs(runs):
    tmp = RUNS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(runs, indent=2), encoding="utf-8")
    tmp.replace(RUNS_FILE)

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _headers(self, code, ctype, length, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def _bytes(self, code, data, ctype, extra=None):
        self._headers(code, ctype, len(data), extra)
        self.wfile.write(data)

    def _json(self, obj, code=200):
        self._bytes(code, json.dumps(obj, indent=2).encode("utf-8"), "application/json; charset=utf-8")

    def _error(self, code, message):
        self._json({"error": message}, code)

    def _authorized(self, params=None):
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer ") and auth[7:].strip() == API_KEY:
            return True
        if (self.headers.get("X-API-Key") or "").strip() == API_KEY:
            return True
        if ((params or {}).get("key") or "").strip() == API_KEY:
            return True
        self._error(401, "unauthorized: writes require the API key "
                         "(Authorization: Bearer <key>, X-API-Key header, or ?key= param)")
        return False

    def do_OPTIONS(self):
        self._headers(204, "text/plain", 0)

    def do_POST(self):
        self.req_method = 'POST'
        try:
            parsed = re.split(r"\?", self.path, maxsplit=1)
            path = parsed[0].rstrip("/") or "/"
            try:
                length = min(int(self.headers.get("Content-Length") or 0), 1 << 20)
            except ValueError:
                length = 0
            raw = self.rfile.read(length) if length else b""
            self.close_connection = True
            params = {}
            for pair in filter(None, (parsed[1] if len(parsed) > 1 else "").split("&")):
                k, _, v = pair.partition("=")
                params[k.lower()] = v
            if path == "/api/status":
                if not self._authorized(params):
                    return
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    return self._error(400, f"invalid JSON body: {exc}")
                return self.update_status(body)
            # Epic Bench community endpoints accept JSON bodies.
            if path in ("/api/feedback", "/api/prompt-request", "/api/artifact-policy") or \
                    re.fullmatch(r"/api/prompt-request/\d+/status", path):
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception as exc:
                    return self._error(400, f"invalid JSON body: {exc}")
                merged = dict(body)
                merged.update(params)
                return self.route_api(path, merged, "POST")
            return self._error(404, f"unknown API route {path}")
        except BrokenPipeError:
            pass
        except Exception as exc:
            try:
                self._error(500, f"{type(exc).__name__}: {exc}")
            except Exception:
                pass

    def do_DELETE(self):
        try:
            self.close_connection = True
            parsed = re.split(r"\?", self.path, maxsplit=1)
            path = parsed[0].rstrip("/") or "/"
            params = {}
            for pair in filter(None, (parsed[1] if len(parsed) > 1 else "").split("&")):
                k, _, v = pair.partition("=")
                params[k.lower()] = v
            if path == "/api/status":
                if not self._authorized(params):
                    return
                runs = load_runs()
                run_id = params.get("run", "")
                before = len(runs)
                runs = [r for r in runs if r.get("run") != run_id] if run_id else []
                save_runs(runs)
                return self._json({"deleted": before - len(runs)})
            return self._error(404, f"unknown API route {path}")
        except BrokenPipeError:
            pass
        except Exception as exc:
            try:
                self._error(500, f"{type(exc).__name__}: {exc}")
            except Exception:
                pass

    def update_status(self, body):
        run = str(body.get("run") or "").strip()
        model = str(body.get("model") or "").strip()
        prompt_id = body.get("promptId")
        status = str(body.get("status") or "").strip().lower()
        if not run or not model:
            return self._error(400, "'run' and 'model' are required")
        if status not in VALID_STATUS:
            return self._error(400, f"'status' must be one of {sorted(VALID_STATUS)}")
        if prompt_id is not None:
            try:
                prompt_id = int(prompt_id)
            except (TypeError, ValueError):
                return self._error(400, "'promptId' must be an integer")
            if prompt_id not in BY_ID:
                return self._error(404, f"no prompt with id {prompt_id}")
        harness = str(body.get("harness") or "").strip()[:40] or None
        entry = {
            "run": run[:80],
            "model": model[:120],
            "promptId": prompt_id,
            "harness": harness,
            "status": status,
            "score": body.get("score") if isinstance(body.get("score"), (int, float)) else None,
            "durationMs": body.get("durationMs") if isinstance(body.get("durationMs"), int) else None,
            "notes": str(body.get("notes") or "")[:500],
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        runs = load_runs()
        # Uniqueness includes harness so two harnesses benchmarking the same
        # model+prompt can never overwrite each other's result.
        runs = [r for r in runs
                if not (r.get("run") == entry["run"] and r.get("model") == entry["model"]
                        and r.get("promptId") == entry["promptId"]
                        and r.get("harness") == entry["harness"])]
        runs.append(entry)
        if len(runs) > MAX_RUNS:
            runs = runs[-MAX_RUNS:]
        save_runs(runs)
        return self._json({"ok": True, "entry": entry}, 201)


    def add_feedback(self, params):
        ip = self.client_address[0] if self.client_address else "?"
        if not _rate_ok("fb:" + ip):
            return self._error(429, "too many submissions; try later")
        cat = _clean(params.get("category"), 40)
        allowed = {"Website issue", "Benchmark issue", "Result looks wrong",
                   "Prompt feedback", "Feature request", "Other"}
        if cat not in allowed:
            return self._error(400, f"category must be one of {sorted(allowed)}")
        items = _load_json(FEEDBACK_FILE, [])
        entry = {
            "id": len(items) + 1,
            "type": "feedback",
            "category": cat,
            "title": _clean(params.get("title"), 120),
            "details": _clean(params.get("details"), 4000),
            "context": {k: _clean(v, 120) for k, v in (params.get("context") or {}).items()
                        if isinstance(v, (str, int))},
            "status": "new",
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        items.append(entry)
        _save_json(FEEDBACK_FILE, items[-500:])
        return self._json({"ok": True, "id": entry["id"]}, 201)

    def add_request(self, params):
        ip = self.client_address[0] if self.client_address else "?"
        if not _rate_ok("rq:" + ip):
            return self._error(429, "too many submissions; try later")
        diffs = {"Light", "Medium", "Heavy", "Not sure"}
        diff = params.get("difficulty") if params.get("difficulty") in diffs else "Not sure"
        items = _load_json(REQUESTS_FILE, [])
        entry = {
            "id": len(items) + 1,
            "type": "prompt-request",
            "title": _clean(params.get("title"), 140),
            "idea": _clean(params.get("idea"), 6000),
            "why": _clean(params.get("why"), 2000),
            "difficulty": diff,
            "capability": _clean(params.get("capability"), 60),
            "deliverable": _clean(params.get("deliverable"), 500),
            "notes": _clean(params.get("notes"), 2000),
            "status": "new",
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        if not entry["title"] or not entry["idea"]:
            return self._error(400, "title and idea are required")
        items.append(entry)
        # Suggestions NEVER touch the canonical pack — review queue only.
        _save_json(REQUESTS_FILE, items[-500:])
        return self._json({"ok": True, "id": entry["id"], "status": "new"}, 201)

    def set_request_status(self, rid, params):
        items = _load_json(REQUESTS_FILE, [])
        allowed = {"new", "reviewing", "accepted", "rejected", "duplicate", "implemented"}
        st = params.get("status")
        if st not in allowed:
            return self._error(400, f"status must be one of {sorted(allowed)}")
        for e in items:
            if e.get("id") == rid:
                e["status"] = st
                _save_json(REQUESTS_FILE, items)
                return self._json({"ok": True, "id": rid, "status": st})
        return self._error(404, "no such request")

    def do_GET(self):
        self.req_method = 'GET'
        try:
            parsed = re.split(r"\?", self.path, maxsplit=1)
            path, query = parsed[0].rstrip("/") or "/", parsed[1] if len(parsed) > 1 else ""
            params = {}
            for pair in filter(None, query.split("&")):
                k, _, v = pair.partition("=")
                params[k.lower()] = v
            if path.startswith("/api"):
                self.route_api(path, params, getattr(self, 'req_method', 'GET'))
            else:
                self.serve_static(path)
        except BrokenPipeError:
            pass
        except Exception as exc:
            try:
                self._error(500, f"{type(exc).__name__}: {exc}")
            except Exception:
                pass

    def route_api(self, path, params, req_method='GET'):
        if path in ("/api", "/api/help"):
            return self._json(self.help_obj())
        if path == "/api/meta":
            by_diff = {}
            for p in PROMPTS:
                by_diff[p["difficulty"]] = by_diff.get(p["difficulty"], 0) + 1
            return self._json({"total": len(PROMPTS), "byDifficulty": by_diff,
                               "difficulties": ["Light", "Medium", "Hard", "Very Hard"],
                               "packHash": PACK_HASH})
        if path == "/api/prompts":
            return self.list_prompts(params)
        if path == "/api/status":
            return self.list_status(params)
        m = re.fullmatch(r"/api/prompts/(\d+)", path)
        if m:
            p = BY_ID.get(int(m.group(1)))
            return self._json(resolved_prompt(p)) if p else self._error(404, f"no prompt with id {m.group(1)}")
        m = re.fullmatch(r"/api/prompts/(\d+)/text", path)
        if m:
            p = BY_ID.get(int(m.group(1)))
            if not p:
                return self._error(404, f"no prompt with id {m.group(1)}")
            extra = {"Content-Disposition": f'attachment; filename="{p["filename"]}"'}
            return self._bytes(200, resolve_placeholders(p["text"]).encode("utf-8"), "text/plain; charset=utf-8", extra)
        if path == "/api/progress":
            return self._json(progress_summary())
        if path == "/api/feedback":
            if req_method == "POST":
                return self.add_feedback(params)
            return self._json({"items": _load_json(FEEDBACK_FILE, [])[-100:]})
        if path == "/api/prompt-request":
            if req_method == "POST":
                return self.add_request(params)
            if "key" in params and params["key"] == API_KEY:
                return self._json({"items": _load_json(REQUESTS_FILE, [])})
            return self._json({"error": "admin key required"}, 401)
        m = re.fullmatch(r"/api/prompt-request/(\d+)/status", path)
        if m and req_method == "POST":
            if params.get("key") != API_KEY:
                return self._error(401, "admin key required")
            return self.set_request_status(int(m.group(1)), params)
        if path == "/api/artifact-policy":
            if req_method == "POST":
                if params.get("key") != API_KEY:
                    return self._error(401, "admin key required")
                pol = _load_json(POLICY_FILE, {})
                for k in ("capBytes", "safetyMarginBytes", "offloadTarget"):
                    if k in params:
                        pol[k] = params[k]
                _save_json(POLICY_FILE, pol)
            pol = _load_json(POLICY_FILE, {
                "capBytes": 10 * 1024 * 1024 * 1024,
                "safetyMarginBytes": 5 * 1024 * 1024 * 1024,
                "offloadTarget": "tailscale-pc (private; never exposed)",
                "note": "applies to future benchmark artifact uploads only",
            })
            return self._json(pol)
        if path == "/api/placeholders":
            return self._json(placeholders_status())
        return self._error(404, f"unknown API route {path}")

    def list_prompts(self, params):
        rows = PROMPTS
        if "difficulty" in params:
            want = params["difficulty"].replace("+", " ").lower()
            rows = [p for p in rows if p["difficulty"].lower() == want]
        if "search" in params:
            needle = params["search"].replace("+", " ").lower()
            rows = [p for p in rows if needle in p["title"].lower() or needle in p["text"].lower()]
        if "ids" in params:
            wanted = {int(x) for x in params["ids"].split(",") if x.strip().isdigit()}
            rows = [p for p in rows if p["id"] in wanted]
        if "fields" in params:
            keep = {f.strip() for f in params["fields"].split(",")} & FIELDS
            rows = [{k: p[k] for k in p if k in keep} for p in rows]
        rows = [resolved_prompt(r) if "text" in r else r for r in rows]
        self._json({"count": len(rows), "prompts": rows})

    def list_status(self, params):
        runs = load_runs()
        if "run" in params:
            runs = [r for r in runs if r.get("run") == params["run"]]
        if "model" in params:
            want = params["model"].lower()
            runs = [r for r in runs if r.get("model", "").lower() == want]
        if "status" in params:
            runs = [r for r in runs if r.get("status") == params["status"].lower()]
        if "promptid" in params and params["promptid"].isdigit():
            runs = [r for r in runs if r.get("promptId") == int(params["promptid"])]
        runs = sorted(runs, key=lambda r: r.get("updatedAt", ""), reverse=True)
        by_status = {}
        for r in runs:
            by_status[r.get("status")] = by_status.get(r.get("status"), 0) + 1
        self._json({"count": len(runs), "byStatus": by_status, "runs": runs})

    def help_obj(self):
        return {
            "name": "Ox Alpha Prompt Pack API",
            "version": 2,
            "totalPrompts": len(PROMPTS),
            "auth": "reads are open; writes (POST/DELETE /api/status) need the API key via "
                    "Authorization: Bearer <key>, X-API-Key header, or ?key= param",
            "endpoints": {
                "GET /api": "this help",
                "GET /api/meta": "counts and difficulty breakdown",
                "GET /api/prompts": "all prompts; optional query params: difficulty=Hard|Medium|Light|'Very Hard', ids=1,2,3, search=<substring>, fields=id,title,difficulty,text,filename,harness",
                "GET /api/prompts/{id}": "single prompt object",
                "GET /api/prompts/{id}/text": "raw prompt text as plain text (copy-paste ready)",
                "GET /api/status": "benchmark run statuses; optional filters run=, model=, status=running|pass|fail|error|skipped, promptId=",
                "GET /api/placeholders": "runtime placeholder resolution status (what the supervisor would inject)",
                "POST /api/status [auth]": "upsert a benchmark status; JSON body {run, model, promptId?, status, score?, durationMs?, notes?}",
                "DELETE /api/status?run=<id> [auth]": "clear all entries of one run",
            },
            "example": "/api/prompts?difficulty=Hard&fields=id,title,text",
        }

    def serve_static(self, path):
        rel = "index.html" if path == "/" else path.lstrip("/")
        target = (ROOT / rel).resolve()
        if not str(target).startswith(str(ROOT)) or not target.is_file():
            return self._error(404, f"not found: {rel}")
        ctype = MIME.get(target.suffix.lower(), "application/octet-stream")
        self._bytes(200, target.read_bytes(), ctype)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    HOST = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    print(f"serving {ROOT} on http://{HOST}:{PORT} (api at /api)", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
