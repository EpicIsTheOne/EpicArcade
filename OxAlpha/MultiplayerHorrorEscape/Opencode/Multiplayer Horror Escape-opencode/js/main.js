/* main.js — boot, screen state machine, lobby, pause, end screens, message routing. */
"use strict";

const Main = {
  paused: false,
  objectivesOpen: false,
  isHost: false,
  myPid: null,
  ready: false,
  cdTimer: null,

  $: id => document.getElementById(id),
  screens: {},

  async boot() {
    // name persistence
    const nameIn = this.$("name-input");
    try { nameIn.value = localStorage.getItem("tcb_name") || ""; } catch (e) {}
    const vol = this.$("vol-slider");
    try { vol.value = localStorage.getItem("tcb_vol") || "80"; } catch (e) {}

    // load shared server module (map constants etc.)
    let mod;
    try {
      mod = await NET.loadServerModule();
    } catch (e) {
      this.$("title-status").textContent = "failed to load core module — serve over http(s)";
      return;
    }
    G.init(mod);
    Render.setMap(mod.MAP_ROWS, mod.MAP_W, mod.MAP_H, mod.TILE);
    AudioSys.init();
    AudioSys.setVolume(vol.value / 100);

    NET.onMessage = m => this.route(m);
    NET.onStatus = (st, info) => this.netStatus(st, info);

    // buttons
    this.$("btn-descend").onclick = () => {
      const n = (nameIn.value || "").trim().toUpperCase().slice(0, 12) || "ASH";
      try { localStorage.setItem("tcb_name", n); } catch (e) {}
      AudioSys.init(); AudioSys.resume(); AudioSys.play("ui");
      this.$("btn-descend").disabled = true;
      NET.connect(n);
    };
    this.$("btn-solo").onclick = async () => {
      const n = (nameIn.value || "").trim().toUpperCase().slice(0, 12) || "ASH";
      try { localStorage.setItem("tcb_name", n); } catch (e) {}
      AudioSys.init(); AudioSys.resume(); AudioSys.play("ui");
      this.$("title-status").textContent = "";
      this.$("btn-solo").disabled = true;
      try { await NET.startLocal(n); }
      catch (e) {
        this.$("title-status").textContent = "solo simulation unavailable: " + e.message;
        this.$("btn-solo").disabled = false;
      }
    };
    this.$("btn-help").onclick = () => { this.$("help-overlay").classList.remove("hidden"); AudioSys.play("ui"); };
    this.$("btn-close-help").onclick = () => { this.$("help-overlay").classList.add("hidden"); AudioSys.play("ui"); };
    this.$("btn-ready").onclick = () => {
      this.ready = !this.ready;
      NET.send({ t: "ready", v: this.ready });
      AudioSys.play("ui");
      this.updateReadyBtn();
    };
    this.$("btn-start").onclick = () => { NET.send({ t: "start" }); AudioSys.play("ui"); };
    this.$("btn-resume").onclick = () => this.togglePause(false);
    this.$("btn-quit").onclick = () => { this.togglePause(false); this.quitToTitle(); };
    this.$("btn-again").onclick = () => {
      if (NET.mode === "local") { NET.stopLocal(); NET.disconnect(); location.reload(); return; }
      NET.send({ t: "again" });
      this.showScreen("lobby");
    };
    vol.oninput = () => {
      AudioSys.setVolume(vol.value / 100);
      try { localStorage.setItem("tcb_vol", vol.value); } catch (e) {}
    };

    this.showScreen("title");
    requestAnimationFrame(t => this._loop(t));
  },

  _loop(t) {
    requestAnimationFrame(tt => this._loop(tt));
    if (!G.running) return;
    // pings/chat handled in game.js; nothing global here for now
  },

  route(m) {
    switch (m.t) {
      case "welcome":
        G.mePid = m.yourPid;
        this.myPid = m.yourPid;
        G.colors = m.colors;
        G.rules = m.rules;
        G.pois = m.pois;
        break;
      case "lobby": this.renderLobby(m); break;
      case "snap": G.onSnap(m); break;
      case "hi": break;
      case "full": /* handled by net */ break;
      case "click": AudioSys.play("ui"); break;
      case "host":
        this.isHost = G.mePid === m.pid;
        this.updateStartBtn();
        break;
      case "sys": G.feed(m.msg, "dim"); break;
      default:
        if (m.t === "snap") break;
        if (m.ev !== undefined) break; // snapshots carry events; standalone event msgs unused
        G.handleEvent && (m.y ? G.handleEvent(m) : null);
    }
    // snapshot-embedded events
    if (m.t === "snap" && Array.isArray(m.ev)) for (const ev of m.ev) G.handleEvent(ev);
  },

  netStatus(st, info) {
    const el = this.$("net-state");
    const banner = this.$("conn-banner");
    const txt = this.$("conn-text"), det = this.$("conn-detail");
    switch (st) {
      case "connecting":
        if (this.$("screen-title").offsetParent) this.$("title-status").textContent = "establishing uplink…";
        banner.classList.add("hidden");
        break;
      case "open":
        this.$("title-status").textContent = "";
        this.$("btn-descend").disabled = false;
        banner.classList.add("hidden");
        el.textContent = "uplink: established";
        break;
      case "local":
        el.textContent = "mode: local simulation";
        banner.classList.add("hidden");
        break;
      case "queued":
        txt.textContent = `FACILITY OCCUPIED — QUEUED #${info.pos}`;
        det.textContent = "you'll drop automatically when a slot frees";
        banner.classList.remove("hidden");
        break;
      case "lost":
        txt.textContent = "SIGNAL LOST";
        det.textContent = "re-establishing uplink…";
        banner.classList.remove("hidden");
        el.textContent = "uplink: reconnecting";
        break;
    }
  },

  showScreen(name) {
    for (const s of ["title", "lobby", "game", "end"]) {
      this.$("screen-" + s).classList.toggle("hidden", s !== name);
    }
    if (name === "game") { G.start(); }
    else { G.stop(); }
    if (name === "lobby") {
      this.ready = false;
      this.updateReadyBtn();
    }
    if (name === "title") {
      this.$("btn-descend").disabled = false;
      this.$("btn-solo").disabled = false;
      if (NET.mode === "net" && !NET.connected) NET._open();
    }
  },
  showGame() { if (this.$("screen-game").classList.contains("hidden")) this.showScreen("game"); },
  showLobby() { if (!this.$("screen-lobby").classList.contains("hidden")) return; this.showScreen("lobby"); },
  showEnd(info) {
    if (!this.$("screen-end").classList.contains("hidden")) return;
    this.showScreen("end");
    const t = this.$("end-title");
    t.textContent = info.win ? "YOU ESCAPED" : "THE STATION KEEPS YOU";
    t.className = "glitch " + (info.win ? "win" : "lose");
    t.setAttribute("data-text", t.textContent);
    this.$("end-epilogue").textContent = info.text;
    const mins = Math.floor(info.timeSec / 60), secs = info.timeSec % 60;
    const roster = (info.roster || []).map(r =>
      `<span style="color:${G.colors[r.pid - 1] || "#fff"}">${r.name}</span>${r.escaped ? " ✓" : r.dead ? " ✝" : r.downed ? " ↓" : "?"}`
    ).join(" &nbsp; ");
    this.$("end-stats").innerHTML =
      `time below <b>${mins}:${String(secs).padStart(2, "0")}</b> · knockdowns <b>${(info.stats && info.stats.downs) || 0}</b> · lifts <b>${(info.stats && info.stats.revives) || 0}</b><br>${roster}`;
  },

  showCountdown(secTotal) {
    const el = this.$("start-countdown");
    if (this.$("screen-game") && !this.$("screen-game").classList.contains("hidden")) return;
    el.classList.remove("hidden");
    const endAt = performance.now() + secTotal * 1000;
    clearInterval(this.cdTimer);
    this.cdTimer = setInterval(() => {
      const rem = (endAt - performance.now()) / 1000;
      if (rem <= 0) { clearInterval(this.cdTimer); el.classList.add("hidden"); return; }
      el.textContent = Math.ceil(rem);
    }, 100);
  },

  renderLobby(m) {
    if (m.you != null) this.myPid = m.you;
    const ul = this.$("lobby-players");
    ul.innerHTML = "";
    let anyReady = false;
    for (const p of m.players) {
      const li = document.createElement("li");
      li.className = p.rd ? "ready" : "";
      if (!p.conn) li.style.opacity = ".45";
      const col = (G.colors[p.c] || "#fff");
      li.innerHTML = `<span class="swatch" style="background:${col}"></span>
        <span class="pname">${p.n}${p.pid === m.you ? " <span class='dim'>(you)</span>" : ""}</span>
        <span class="pstat">${!p.conn ? "SIGNAL LOST" : p.rd ? "READY" : "STANDBY"}${m.host === p.pid ? " ⌂" : ""}</span>`;
      ul.appendChild(li);
      if (p.rd) anyReady = true;
    }
    const count = m.players.length;
    this.$("lobby-hint").textContent =
      count < 2 ? "waiting for crew… share this page — more operators make it out alive (recommended 2–4)"
        : `${count}/4 aboard`;
    this.isHost = m.host === G.mePid;
    this.updateStartBtn(anyReady, count);
  },

  updateStartBtn(anyReady, count) {
    const btn = this.$("btn-start");
    if (this.isHost) {
      btn.classList.remove("hidden");
      btn.textContent = count === 1 ? "BEGIN ALONE (better with friends)" : "BEGIN DESCENT";
      btn.disabled = false;
    } else btn.classList.add("hidden");
  },

  updateReadyBtn() {
    this.$("btn-ready").textContent = this.ready ? "STAND DOWN" : "READY UP";
  },

  togglePause(down) {
    if (this.$("screen-game").classList.contains("hidden")) return;
    if (!down) { this.paused = false; this.$("pause-menu").classList.add("hidden"); return; }
    if (this.paused) { this.paused = false; this.$("pause-menu").classList.add("hidden"); }
    else { this.paused = true; this.$("pause-menu").classList.remove("hidden"); }
    AudioSys.play("ui");
  },

  toggleObjectives() {
    this.objectivesOpen = !this.objectivesOpen;
    // lightweight: reuse callout for objective recap
    if (this.objectivesOpen) G.callout(G.objectiveText || "no objective");
    this.objectivesOpen = false;
  },

  quitToTitle() {
    NET.disconnect();
    G.resetLocalRun();
    this.showScreen("title");
    this.$("conn-banner").classList.add("hidden");
  },

  isTyping() {
    return document.activeElement === this.$("name-input");
  },
};

window.addEventListener("DOMContentLoaded", () => Main.boot());
