"""FL Studio multi-agent lease manager - stdlib only, Windows-safe.

Multiple agents must NEVER touch the FL stack (relay, bus dir, MIDI ports,
loopback capture) concurrently. Acquire a lease first; hold it with
heartbeats during long work; release when done. Stale leases (dead holder
process or missed heartbeats) are taken over automatically.

Usage:
  python fl_lease.py acquire [--holder NAME] [--timeout SEC] [--stale SEC]
  python fl_lease.py heartbeat --token TOKEN
  python fl_lease.py release   --token TOKEN
  python fl_lease.py status

acquire prints JSON {ok, token, holder, waited} on success,
{ok:false, reason} otherwise. Exit code 0 = leased / released, 2 = busy."""
import argparse, json, os, sys, time, uuid, ctypes

LEASE_DIR = os.path.join(os.environ.get("LOCALAPPDATA",
                                         os.path.expanduser("~")), "flmcp-leases")
LEASE_FILE = os.path.join(LEASE_DIR, "fl-stack.lock")
DEFAULT_STALE = 120.0

def _pid_alive(pid):
    if not pid or pid <= 0:
        return False
    k32 = ctypes.windll.kernel32
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    h = k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if h:
        k32.CloseHandle(h)
        return True
    return False

def _read_lease():
    try:
        with open(LEASE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None

def _lease_is_valid(lease, stale_s):
    if not lease:
        return False
    beat = float(lease.get("beat", 0))
    if time.time() - beat > stale_s:
        return False
    return _pid_alive(int(lease.get("pid", 0)))

def _try_create(lease):
    os.makedirs(LEASE_DIR, exist_ok=True)
    tmp = LEASE_FILE + f".tmp{uuid.uuid4().hex[:8]}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(lease, f)
    try:
        os.rename(tmp, LEASE_FILE)  # fails if target appeared meanwhile? no -
    except OSError:
        os.remove(tmp)
        return False
    # rename overwrites on POSIX; on Windows it also overwrites. Enforce
    # exclusivity by re-reading and comparing tokens.
    cur = _read_lease()
    return bool(cur and cur.get("token") == lease.get("token"))

def cmd_acquire(args):
    deadline = time.time() + max(0.0, args.timeout)
    waited = 0.0
    while True:
        existing = _read_lease()
        if _lease_is_valid(existing, args.stale):
            if time.time() >= deadline:
                print(json.dumps({"ok": False, "reason": "busy",
                                  "held_by": existing.get("holder"),
                                  "beat_age": round(time.time() - existing.get("beat", 0), 1)}))
                return 2
            time.sleep(0.5)
            waited += 0.5
            continue
        if existing and not _lease_is_valid(existing, args.stale):
            try:  # stale or dead holder - take over
                os.remove(LEASE_FILE)
            except OSError:
                pass
        lease = {"holder": args.holder, "pid": os.getpid(),
                 "acquired": time.time(), "beat": time.time(),
                 "token": uuid.uuid4().hex}
        if _try_create(lease):
            print(json.dumps({"ok": True, "token": lease["token"],
                              "holder": args.holder, "waited": round(waited, 1)}))
            return 0
        time.sleep(0.25)
        waited += 0.25

def _with_lease(token):
    lease = _read_lease()
    if not lease or lease.get("token") != token:
        print(json.dumps({"ok": False, "reason": "not-holder"}))
        return None
    return lease

def cmd_heartbeat(args):
    lease = _with_lease(args.token)
    if not lease:
        return 2
    lease["beat"] = time.time()
    tmp = LEASE_FILE + ".hb"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(lease, f)
    os.replace(tmp, LEASE_FILE)
    print(json.dumps({"ok": True}))
    return 0

def cmd_release(args):
    lease = _with_lease(args.token)
    if not lease:
        return 2
    try:
        os.remove(LEASE_FILE)
    except OSError:
        pass
    print(json.dumps({"ok": True}))
    return 0

def cmd_status(_args):
    lease = _read_lease()
    if not lease:
        print(json.dumps({"locked": False}))
    else:
        print(json.dumps({"locked": True, "holder": lease.get("holder"),
                          "pid": lease.get("pid"),
                          "alive": _pid_alive(int(lease.get("pid", 0))),
                          "beat_age": round(time.time() - float(lease.get("beat", 0)), 1)}))
    return 0

def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("acquire")
    a.add_argument("--holder", default=f"agent-{os.getpid()}")
    a.add_argument("--timeout", type=float, default=60.0,
                   help="seconds to wait for a free lease (0 = fail fast)")
    a.add_argument("--stale", type=float, default=DEFAULT_STALE)
    h = sub.add_parser("heartbeat"); h.add_argument("--token", required=True)
    r = sub.add_parser("release"); r.add_argument("--token", required=True)
    s = sub.add_parser("status")
    args = p.parse_args()
    return {"acquire": cmd_acquire, "heartbeat": cmd_heartbeat,
            "release": cmd_release, "status": cmd_status}[args.cmd](args)

if __name__ == "__main__":
    sys.exit(main())
