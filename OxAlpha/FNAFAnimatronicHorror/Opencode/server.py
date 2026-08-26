import http.server, socketserver, os
os.chdir(r"C:\Users\Epic\Documents\ChatGPT\Ox model test\FNAF Animatronic Horror [model-openrouter-stealth-ox-alpha] [opencode] [run-01]")
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control","no-store, must-revalidate")
        super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8737), H) as s:
    print("serving", flush=True)
    s.serve_forever()
