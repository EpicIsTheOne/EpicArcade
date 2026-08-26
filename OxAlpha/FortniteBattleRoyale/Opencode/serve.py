import http.server, socketserver, os, socket, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

PREFERRED = [8873, 8846, 8912, 8937, 8855]

def free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False

port = None
for p in PREFERRED:
    if free(p):
        port = p
        break
if port is None:
    for p in range(8900, 9400):
        if free(p):
            port = p
            break
if port is None:
    print("no free port found", file=sys.stderr)
    sys.exit(1)

with open(os.path.join(ROOT, "PORT.txt"), "w") as f:
    f.write(str(port))

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
    }
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, format, *args):
        pass

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

print(f"SKYFALL ROYALE serving on http://127.0.0.1:{port}", flush=True)
with Server(("127.0.0.1", port), H) as httpd:
    httpd.serve_forever()
