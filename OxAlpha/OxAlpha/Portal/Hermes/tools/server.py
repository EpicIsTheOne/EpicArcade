#!/usr/bin/env python3
"""LIMINAL DYNAMICS static server — binds 127.0.0.1, port from PORT.txt."""
import http.server
import os
import socket
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def pick_port():
    with open(os.path.join(HERE, "..", "PORT.txt")) as f:
        preferred = int(f.read().strip())
    if is_free(preferred):
        return preferred
    for p in range(8614, 8699):
        if is_free(p):
            return p
    raise RuntimeError("no free port in 8613-8698")


def is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def log_message(self, fmt, *args):
        sys.stderr.write("[liminal] " + fmt % args + "\n")


if __name__ == "__main__":
    os.chdir(os.path.join(HERE, ".."))
    port = pick_port()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"LIMINAL DYNAMICS serving http://127.0.0.1:{port}", flush=True)
    srv.serve_forever()
