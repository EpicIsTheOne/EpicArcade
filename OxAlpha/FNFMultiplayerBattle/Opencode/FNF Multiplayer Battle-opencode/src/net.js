const SLUG = "fnf-multiplayer-battle";

export class Net {
  constructor(handlers = {}) {
    this.h = handlers;
    this.ws = null;
    this.stopped = true;
    this.backoff = 800;
    this.hello = null;
    this.status = "off";
    this._pingTimer = null;
  }
  url() {
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    return proto + location.host + "/ws/" + SLUG;
  }
  connect(hello) {
    this.hello = hello;
    this.stopped = false;
    this._open();
  }
  _open() {
    if (this.stopped) return;
    clearTimeout(this._rt);
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this._fail();
      return;
    }
    this.ws = ws;
    this.status = "connecting";
    this.h.onStatus && this.h.onStatus(this.status);
    ws.onopen = () => {
      this.status = "online";
      this.backoff = 800;
      this.h.onStatus && this.h.onStatus(this.status);
      if (this.hello) ws.send(JSON.stringify({ t: "hello", ...this.hello }));
      this._pingTimer = setInterval(() => {
        if (this.ws === ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ t: "ping", ts: Date.now() })); } catch {}
        }
      }, 5000);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "pong") { this.rtt = Date.now() - m.ts; return; }
      this.h.onMessage && this.h.onMessage(m);
    };
    ws.onclose = () => {
      clearInterval(this._pingTimer);
      if (this.ws !== ws) return;
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      this._fail();
    };
    ws.onerror = () => {};
  }
  _fail() {
    this.ws = null;
    if (this.stopped) {
      this.status = "off";
      this.h.onStatus && this.h.onStatus(this.status);
      return;
    }
    this.status = "reconnecting";
    this.h.onStatus && this.h.onStatus(this.status);
    this.backoff = Math.min(this.backoff * 1.7, 8000);
    this._rt = setTimeout(() => this._open(), this.backoff);
  }
  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(typeof obj === "string" ? obj : JSON.stringify(obj)); } catch {}
    }
  }
  disconnect() {
    this.stopped = true;
    clearTimeout(this._rt);
    clearInterval(this._pingTimer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.status = "off";
    this.h.onStatus && this.h.onStatus(this.status);
  }
}
