import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = parseInt(process.argv[2] || "8321", 10);
const ROOT = process.argv[3]
  ? resolve(process.argv[3])
  : join(import.meta.dirname, "FNF Multiplayer Battle-opencode");
const WSPATH = "/ws/fnf-multiplayer-battle";
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(fp);
    res.writeHead(200, { "content-type": MIME[extname(fp)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

const backendMod = await import(pathToFileURL(resolve(join(ROOT, "server.mjs"))).href);
const backend = backendMod.default.create({ log: console.log });
setInterval(() => backend.tick && backend.tick(), backendMod.default.tickMs || 2000);

function encodeFrame(str) {
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

const clients = new Set();
let nextId = 1;

server.on("upgrade", (req, socket) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname !== WSPATH) { socket.destroy(); return; }
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  const ws = makeClient(socket, u);
  ws.opened();
  clients.add(ws);
});

function makeClient(socket, url) {
  let buf = Buffer.alloc(0);
  let closed = false;
  let msgCb = null, closeCb = null;
  const id = String(nextId++);
  const api = {
    id,
    ip: socket.remoteAddress,
    query: url.searchParams,
    send(obj) {
      if (closed) return;
      try { socket.write(encodeFrame(typeof obj === "string" ? obj : JSON.stringify(obj))); } catch {}
    },
    close(code = 1000) {
      if (closed) return;
      const b = Buffer.alloc(4);
      b[0] = 0x88; b[1] = 2;
      b.writeUInt16BE(code, 2);
      try { socket.write(b); } catch {}
      cleanup();
    },
  };
  function cleanup() {
    if (closed) return;
    closed = true;
    try { socket.destroy(); } catch {}
    clients.delete(api);
    if (closeCb) closeCb();
  }
  socket.on("data", chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      let payload = buf.subarray(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.subarray(off, off + 4);
        const un = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i % 4];
        payload = un;
      }
      buf = buf.subarray(off + maskLen + len);
      if (!fin) continue;
      if (opcode === 0x1) {
        const str = payload.toString("utf8");
        if (msgCb) msgCb(str);
      } else if (opcode === 0x8) {
        api.close(1000);
        return;
      } else if (opcode === 0x9) {
        const pong = Buffer.from([0x8a, payload.length]);
        try { socket.write(Buffer.concat([pong, payload])); } catch {}
      }
    }
  });
  socket.on("error", cleanup);
  socket.on("close", cleanup);
  api.onMessage = cb => { msgCb = cb; };
  api.onClose = cb => { closeCb = cb; };
  api.opened = () => {
    api.onMessage(str => backend.message(api, str));
    backend.open(api);
    closeCb = () => backend.close(api);
  };
  return api;
}

server.listen(PORT, () => {
  console.log(`dev harness: http://localhost:${PORT}/  (ws route ${WSPATH})`);
});
