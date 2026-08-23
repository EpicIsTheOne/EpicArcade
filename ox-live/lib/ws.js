"use strict";
// Minimal RFC6455 server-side WebSocket codec. Zero dependencies on purpose:
// ox-live must run from a read-only bind mount with no node_modules.
const crypto = require("node:crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const EMPTY = Buffer.alloc(0);

// Out-of-band tracer: sync file append (console pipes change loop timing
// enough to mask the race this exists to catch).
const HEXTRACE = process.env.LIVE_DEBUG_HEX ? "/tmp/oxlive-trace.log" : null;
function trace(line) {
  if (!HEXTRACE) return;
  try { require("node:fs").appendFileSync(HEXTRACE, line + "\n"); } catch {}
}

function acceptKey(key) {
  return crypto.createHash("sha1").update(key + GUID).digest("base64");
}

// Server->client frames are never masked.
function encodeFrame(opcode, payload = EMPTY) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// Incremental parser for client->server frames (masked per RFC6455).
// Emits: {kind:"text",data} {kind:"binary",data} {kind:"ping",payload}
//        {kind:"close",code} {kind:"toolarge"}
class Parser {
  constructor(maxPayload = 1 << 20) {
    this.buf = Buffer.alloc(0);
    this.maxPayload = maxPayload;
    this.frags = [];
    this.fragOp = 0;
  }
  push(chunk, emit) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(this.maxPayload)) { emit({ kind: "toolarge" }); return; }
        len = Number(big); off = 10;
      }
      let mask = null;
      if (masked) { if (b.length < off + 4) return; mask = b.subarray(off, off + 4); off += 4; }
      if (b.length < off + len) return;
      const raw = b.subarray(off, off + len);
      const payload = mask ? unmask(raw, mask) : Buffer.from(raw);
      this.buf = b.subarray(off + len);

      if (op === 0x8) { // close
        let code = 1005;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        emit({ kind: "close", code });
        return;
      }
      if (op === 0x9) { emit({ kind: "ping", payload }); continue; }
      if (op === 0xA) { continue; } // pong
      if (op === 0x1 || op === 0x2) {
        if (!fin) { this.fragOp = op; this.frags = [payload]; continue; }
        emit(op === 0x1 ? { kind: "text", data: payload.toString("utf8") } : { kind: "binary", data: payload });
      } else if (op === 0x0) { // continuation
        if (this.frags.length && this.frags.reduce((n, f) => n + f.length, 0) + payload.length > this.maxPayload) {
          emit({ kind: "toolarge" }); return;
        }
        this.frags.push(payload);
        if (fin && this.fragOp) {
          const whole = Buffer.concat(this.frags);
          const wasText = this.fragOp === 0x1;
          this.frags = []; this.fragOp = 0;
          emit(wasText ? { kind: "text", data: whole.toString("utf8") } : { kind: "binary", data: whole });
        }
      }
      // unknown opcode: ignore frame (spec says fail the connection; be lenient)
    }
  }
}

function unmask(payload, mask) {
  const out = Buffer.from(payload);
  for (let i = 0; i < out.length; i++) out[i] ^= mask[i & 3];
  return out;
}

// Performs the opening handshake on an upgraded socket. Returns a WsConn or
// null (after writing a 400). WsConn exposes send/close plus onmessage/onclose.
function handshake(req, sock, head) {
  const key = req.headers["sec-websocket-key"];
  const upgradeOk = /websocket/i.test(String(req.headers.upgrade || ""));
  const connOk = String(req.headers.connection || "").toLowerCase().includes("upgrade");
  const ver = String(req.headers["sec-websocket-version"] || "");
  if (req.method !== "GET" || !upgradeOk || !connOk || !key || ver !== "13") {
    sock.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    sock.destroy();
    return null;
  }
  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n");
  return new WsConn(sock, head);
}

class WsConn {
  constructor(sock, head, maxPayload = 1 << 20) {
    this.sock = sock;
    this.alive = true;
    this.lastSeen = Date.now();
    this.onmessage = null;
    this.onclose = null;
    this._closedSent = false;
    this._parser = new Parser(maxPayload);
    sock.setNoDelay(true);
    sock.setTimeout(0);
    sock.on("data", (c) => this._feed(c));
    sock.on("error", () => this._die());
    sock.on("close", () => this._die());
    if (head && head.length) this._feed(head);
  }
  _feed(chunk) {
    this.lastSeen = Date.now();
    if (HEXTRACE) trace("chunk: " + Buffer.from(chunk).toString("hex").slice(0, 160));
    try {
      this._parser.push(chunk, (f) => {
        if (HEXTRACE) trace("emit: " + f.kind + " " + (f.code ?? "") + " " + String(f.data ?? "").slice(0, 40));
        if (f.kind === "text" || f.kind === "binary") {
          if (this.onmessage) this.onmessage(f.data, f.kind);
        } else if (f.kind === "ping") {
          this.sock.write(encodeFrame(0xA, f.payload));
        } else if (f.kind === "close") {
          this._sendClose(1000);
          this._die();
        } else if (f.kind === "toolarge") {
          this._sendClose(1009);
          this._die();
        }
      });
    } catch { this._die(); }
  }
  _sendClose(code) {
    if (this._closedSent || !this.alive) return;
    this._closedSent = true;
    const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
    try { this.sock.write(encodeFrame(0x8, p)); } catch {}
  }
  _die() {
    if (!this.alive) return;
    if (process.env.LIVE_DEBUG) console.error("[dbg] conn dying");
    this.alive = false;
    try { this.sock.destroy(); } catch {}
    if (this.onclose) { const cb = this.onclose; this.onclose = null; cb(); }
  }
  ping() {
    if (!this.alive) return false;
    try { this.sock.write(encodeFrame(0x9)); this.lastSeen = Date.now(); return true; } catch { return false; }
  }
  send(data) {
    if (!this.alive) {
      if (process.env.LIVE_DEBUG) console.error("[dbg] send on DEAD conn");
      return false;
    }
    const s = typeof data === "string" ? data : JSON.stringify(data);
    try { this.sock.write(encodeFrame(0x1, Buffer.from(s))); return true; } catch (e) {
      if (process.env.LIVE_DEBUG) console.error("[dbg] send threw:", e.message);
      return false;
    }
  }
  close(code = 1000) {
    this._sendClose(code);
    setTimeout(() => this._die(), 100).unref?.();
  }
}

module.exports = { acceptKey, encodeFrame, Parser, handshake, WsConn };
