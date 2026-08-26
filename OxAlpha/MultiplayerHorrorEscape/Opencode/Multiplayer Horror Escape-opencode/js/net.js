/* net.js — transport layer: online WebSocket with auto-reconnect, or local
   in-process instance of server.mjs for solo mode. Same message surface either way. */
"use strict";

const NET = {
  mode: null,            // 'net' | 'local'
  ws: null,
  serverMod: null,       // imported server.mjs (map constants + solo)
  handlers: null,        // solo game handlers
  localWs: null,
  tickTimer: null,
  connected: false,
  queued: false,
  clientId: null,
  name: "",
  attempts: 0,
  wantClose: false,
  onStatus: null,        // fn(state:'connecting'|'open'|'lost'|'queued'|'local', info)
  onMessage: null,       // fn(obj)
  backoffMs: 500,

  // resolved from this classic <script> tag; keeps ./server.mjs subpath-relative
  _scriptSrc: (document.currentScript && document.currentScript.src) ||
    (function () {
      const tags = document.getElementsByTagName("script");
      for (let i = 0; i < tags.length; i++) if (/net\.js/.test(tags[i].src || "")) return tags[i].src;
      return location.href;
    })(),

  endpoint() {
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    return proto + location.host + "/ws/the-chorus-below";
  },

  ensureClientId() {
    // URL ?c= wins (multi-tab testing / rejoin links), else persisted id
    try {
      const u = new URL(location.href);
      const forced = u.searchParams.get("c");
      if (forced) return forced.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    } catch (e) {}
    let c = null;
    try { c = localStorage.getItem("tcb_client_id"); } catch (e) {}
    if (!c) {
      c = "op-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem("tcb_client_id", c); } catch (e) {}
    }
    return c;
  },

  async loadServerModule() {
    if (this.serverMod) return this.serverMod;
    this.serverMod = await import(new URL("../server.mjs", this._scriptSrc).href);
    return this.serverMod;
  },

  connect(name) {
    this.name = name || "";
    this.clientId = this.ensureClientId();
    this.wantClose = false;
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
    this._open();
  },

  _open() {
    const url = this.endpoint() + "?c=" + encodeURIComponent(this.clientId) + "&n=" + encodeURIComponent(this.name);
    if (this.onStatus) this.onStatus("connecting", {});
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { this._scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.queued = false;
      this.attempts = 0;
      this.backoffMs = 500;
      ws.send(JSON.stringify({ t: "hello", c: this.clientId, n: this.name }));
      if (this.onStatus) this.onStatus("open", {});
    };
    ws.onmessage = ev => {
      let m = null;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "full") {
        this.queued = true;
        if (this.onStatus) this.onStatus("queued", { pos: m.pos });
        return;
      }
      if (this.onMessage) this.onMessage(m);
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.wantClose) return;
      if (this.onStatus) this.onStatus("lost", {});
      this._scheduleReconnect();
    };
    ws.onerror = () => { /* close follows */ };
  },

  _scheduleReconnect() {
    const delay = Math.min(8000, this.backoffMs * (1 + Math.random() * 0.4));
    this.backoffMs = Math.min(8000, this.backoffMs * 1.7);
    this.attempts++;
    setTimeout(() => { if (!this.wantClose && !this.connected) this._open(); }, delay);
  },

  send(obj) {
    if (this.mode === "local") {
      if (this.localWs && this.handlers) {
        const s = JSON.stringify(obj);
        setTimeout(() => { try { this.handlers.message(this.localWs, s); } catch (e) { console.error(e); } }, 0);
      }
      return;
    }
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch (e) {}
    }
  },

  disconnect() {
    this.wantClose = true;
    this.connected = false;
    if (this.mode === "local") this.stopLocal();
    else if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
  },

  /* ---- SOLO MODE: run the real server sim in-page ---- */
  async startLocal(name) {
    const mod = await this.loadServerModule();
    this.mode = "local";
    const game = mod.createGame((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    this.handlers = game.create({ debug: false });
    const self = this;
    this.localWs = {
      id: "solo",
      query: new URLSearchParams(),
      send(s) { const o = typeof s === "string" ? JSON.parse(s) : s; setTimeout(() => { if (self.onMessage) self.onMessage(o); }, 0); },
      close() {},
    };
    this.handlers.open(this.localWs);
    this.tickTimer = setInterval(() => {
      try { this.handlers.tick(0.05); } catch (e) { console.error(e); }
    }, 50);
    this.connected = true;
    if (this.onStatus) this.onStatus("local", {});
    // hello + auto-ready + start
    setTimeout(() => {
      this.send({ t: "hello", c: this.clientId, n: name });
      setTimeout(() => {
        this.send({ t: "ready", v: true });
        this.send({ t: "start" });
      }, 120);
    }, 30);
  },

  stopLocal() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.handlers) { try { this.handlers.stop(); } catch (e) {} this.handlers = null; }
    this.localWs = null;
  },
};
