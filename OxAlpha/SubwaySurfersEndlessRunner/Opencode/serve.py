import http.server
import os
import socket
import sys
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT_FILE = os.path.join(ROOT, "PORT.txt")


def read_port():
    try:
        with open(PORT_FILE) as f:
            return int(f.read().strip())
    except Exception:
        return 8942


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
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
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        if os.environ.get("HL_QUIET"):
            return
        sys.stderr.write("[http] %s\n" % (format % args))


def main():
    preferred = int(sys.argv[1]) if len(sys.argv) > 1 else read_port()
    port = None
    for p in range(preferred, preferred + 25):
        if port_free(p):
            port = p
            break
    if port is None:
        print("no free port found near", preferred)
        sys.exit(1)
    if port != read_port():
        with open(PORT_FILE, "w") as f:
            f.write(str(port))
    os.chdir(ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"HYPERLINE serving {ROOT} at http://127.0.0.1:{port}")
    with open(os.path.join(ROOT, "server.pid"), "w") as f:
        f.write(str(os.getpid()))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
