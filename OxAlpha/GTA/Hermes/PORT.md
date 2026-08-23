# PORT ASSIGNMENT — GTA-Hermes (NEON MERIDIAN)

Assigned localhost port for this project: **8421**

- Bound to 127.0.0.1 only.
- Verified free on 2026-08-21 before first use (netstat + curl probe).
- If 8421 is ever occupied by a foreign process, DO NOT kill it — pick the next
  free port from: 8590, 8633, 8712, and update this file.

Serve:  python -m http.server 8421 --bind 127.0.0.1   (from this directory)
URL:    http://127.0.0.1:8421/index.html
