/* Dev/test runner: serves the build folder statically and bridges /ws/<slug>
   WebSocket connections into the real server.mjs via a minimal RFC6455 impl.
   Node builtins only. NOT part of the shipped build. */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "Multiplayer Horror Escape-opencode");
const SLUG = "/ws/the-chorus-below";

/* ---- find a free port ---- */
async function freePort(start) {
  const net = await import("node:net");
  for (let p = start; p < start + 40; p++) {
    const ok = await new Promise(res => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.once("listening", () => s.close(() => res(true)));
      s.listen(p, "127.0.0.1");
    });
    if (ok) return p;
  }
  throw new Error("no free port");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(BUILD, p));
  if (!file.startsWith(BUILD)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
});

/* ---- game instance ---- */
const mod = await import(url.pathToFileURL(path.join(BUILD, "server.mjs")).href);
const game = mod.createGame((Date.now() ^ 0xbeef77) >>> 0);
const handlers = game.create({ debug: true });

/** Minimal WebSocket connection wrapper */
class WSConn {
  constructor(socket, req) {
    this.socket = socket;
    this.id = "s" + Math.random().toString(36).slice(2, 9);
    this.query = new URL(req.url, "http://x").searchParams;
    this.buffer = Buffer.alloc(0);
    this.fragments = null;
    socket.on("data", d => this._onData(d));
    socket.on("close", () => this._closed());
    socket.on("error", () => this._closed());
  }
  send(obj) {
    const s = typeof obj === "string" ? obj : JSON.stringify(obj);
    this._frame(Buffer.from(s, "utf8"), 0x1);
  }
  close(code = 1000) {
    try { this._frame(Buffer.from([code >> 8, code & 255]), 0x8); } catch (e) {}
    try { this.socket.end(); } catch (e) {}
  }
  _frame(payload, opcode) {
    if (this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | opcode, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([header, payload]));
  }
  _onData(d) {
    this.buffer = Buffer.concat([this.buffer, d]);
    while (true) {
      const parsed = this._parseFrame();
      if (!parsed) break;
      this._handleFrame(parsed);
    }
  }
  _parseFrame() {
    const b = this.buffer;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
    let maskKey = null;
    if (masked) { if (b.length < off + 4) return null; maskKey = b.subarray(off, off + 4); off += 4; }
    if (b.length < off + len) return null;
    let payload = b.subarray(off, off + len);
    if (masked) {
      const un = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) un[i] = payload[i] ^ maskKey[i % 4];
      payload = un;
    }
    this.buffer = b.subarray(off + len);
    return { fin, opcode, payload };
  }
  _handleFrame(f) {
    switch (f.opcode) {
      case 0x0: // continuation
        if (this.fragments) {
          this.fragments.chunks.push(f.payload);
          if (f.fin) {
            const full = Buffer.concat(this.fragments.chunks);
            const op = this.fragments.opcode;
            this.fragments = null;
            if (op === 0x1) this._text(full);
          }
        }
        break;
      case 0x1:
      case 0x2:
        if (!f.fin) this.fragments = { opcode: f.opcode, chunks: [f.payload] };
        else if (f.opcode === 0x1) this._text(f.payload);
        break;
      case 0x8: this.close(1000); this._closed(); break;
      case 0x9: this._frame(f.payload, 0xA); break; // ping -> pong
    }
  }
  _text(buf) {
    try { handlers.message(this, buf.toString("utf8")); }
    catch (e) { console.error("[ws message error]", e.message); }
  }
  _closed() {
    if (this.dead) return;
    this.dead = true;
    try { handlers.close(this); } catch (e) {}
  }
}

server.on("upgrade", (req, socket) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname !== SLUG) { socket.destroy(); return; }
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const conn = new WSConn(socket, req);
  handlers.open(conn);
});

const port = await freePort(8737);
server.listen(port, "127.0.0.1", () => {
  console.log(`DEV SERVER http://127.0.0.1:${port}/  (ws ${SLUG}, pid ${process.pid})`);
});
// drive the simulation like the platform would
setInterval(() => { try { handlers.tick(); } catch (e) { console.error("[tick]", e.message); } }, 50);
process.on("SIGINT", () => process.exit(0));
