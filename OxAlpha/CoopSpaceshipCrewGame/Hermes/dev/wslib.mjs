/*
 * Minimal RFC6455 WebSocket server on top of node:http — dev/test rig only.
 * (The production platform supplies its own /ws/<slug> terminator; this exists
 *  so the exact same server.mjs can be exercised locally with zero npm deps.)
 */
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function attachWebSocketServer(httpServer, pathPrefix, handlers) {
  httpServer.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    if (!url.pathname.startsWith(pathPrefix)) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n'
    );
    socket.setNoDelay(true);
    const ws = new WsSock(socket, url);
    try { handlers.onOpen(ws); } catch (e) { console.error('[wslib] onOpen', e); }
    socket.on('data', d => { try { ws.feed(d); } catch (e) { console.error('[wslib] feed', e); } });
    const bye = () => { if (!ws._closedFired) { ws._closedFired = true; try { handlers.onClose(ws); } catch (e) { console.error('[wslib] onClose', e); } } };
    socket.on('close', bye);
    socket.on('error', bye);
    if (head && head.length) ws.feed(head);
  });
}

export class WsSock {
  constructor(socket, url) {
    this.socket = socket;
    this.url = url;
    this.query = url.searchParams;
    this.readyState = 1; // 1 open, 3 closed (mirrors browser constants used by server.mjs)
    this.ip = socket.remoteAddress;
    this.id = 'ws' + WsSock._n++;
    this._buf = Buffer.alloc(0);
    this._frag = null;   // {opcode, chunks:[]}
    this._dead = false;
  }
  feed(data) {
    if (this._dead) return;
    this._buf = Buffer.concat([this._buf, data]);
    while (true) {
      const frame = this._parseFrame();
      if (!frame) break;
      this._handleFrame(frame);
      if (this._dead) break;
    }
  }
  _parseFrame() {
    const buf = this._buf;
    if (buf.length < 2) return null;
    const b0 = buf[0], b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      const big = buf.readBigUInt64BE(2);
      if (big > 8n * 1024n * 1024n) { this.close(1009); return null; }
      len = Number(big); off = 10;
    }
    let maskKey = null;
    if (masked) {
      if (buf.length < off + 4) return null;
      maskKey = buf.subarray(off, off + 4); off += 4;
    }
    if (buf.length < off + len) return null;
    let payload = buf.subarray(off, off + len);
    if (maskKey) {
      const out = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
      payload = out;
    }
    this._buf = buf.subarray(off + len);
    return { fin, opcode, payload };
  }
  _handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case 0x0: { // continuation
        if (this._frag) {
          this._frag.chunks.push(payload);
          if (fin) {
            const full = Buffer.concat(this._frag.chunks);
            const op = this._frag.opcode;
            this._frag = null;
            if (op === 0x1) this._text(full);
          }
        }
        break;
      }
      case 0x1: // text
      case 0x2: // binary
        if (!fin) { this._frag = { opcode, chunks: [payload] }; break; }
        if (opcode === 0x1) this._text(payload);
        break;
      case 0x8: // close
        this._sendRaw(0x8, payload.subarray(0, 2));
        this.destroy();
        break;
      case 0x9: // ping -> pong
        this._sendRaw(0xA, payload);
        break;
      case 0xA: // pong
        break;
      default:
        this.close(1002);
    }
  }
  _text(payload) {
    try { this.onmessage && this.onmessage(payload.toString('utf8')); } catch (e) { console.error('[wslib] onmessage', e); }
  }
  _sendRaw(opcode, payload) {
    if (this._dead || this.socket.destroyed) return false;
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.from([0x80 | opcode, len]); }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([header, payload])); return true; } catch { return false; }
  }
  send(msg) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    this._sendRaw(0x1, Buffer.from(s, 'utf8'));
  }
  close(code = 1000) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code, 0);
    this._sendRaw(0x8, b);
    this.destroy();
  }
  destroy() {
    if (this._dead) return;
    this._dead = true;
    this.readyState = 3;
    try { this.socket.end(); } catch { }
    try { this.socket.destroy(); } catch { }
    if (!this._closedFired) {
      this._closedFired = true;
      try { this.onclose && this.onclose(); } catch (e) { console.error('[wslib] onclose', e); }
    }
  }
}
WsSock._n = 1;

// Convenience adapter matching the platform's handler shape {open,message,close}
export function bridgePlatformHandlers(platformHandlers) {
  return {
    onOpen(ws) {
      ws.onmessage = str => {
        let obj = str;
        try { obj = JSON.parse(str); } catch { }
        try { platformHandlers.message(ws, obj); } catch (e) { console.error('[bridge] message', e); }
      };
      ws.onclose = () => { try { platformHandlers.close(ws); } catch (e) { console.error('[bridge] close', e); } };
      try { platformHandlers.open(ws); } catch (e) { console.error('[bridge] open', e); }
    },
  };
}
