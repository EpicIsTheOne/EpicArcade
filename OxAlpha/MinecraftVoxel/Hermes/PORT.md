# Port assignment (project-owned)

This project claims **127.0.0.1:8477** for its local server.

- Verified free at project creation (2026-08-21) via netstat scan.
- Start: `node server.js` (binds 127.0.0.1:8477)
- If 8477 is ever occupied by another process, DO NOT kill it.
  Run `node server.js --port <free-port>` instead and update this file.
- No other project or harness shares this port.

URL: http://127.0.0.1:8477/
