/* game.js — client orchestration: prediction, interpolation, input, actions, HUD. */
"use strict";

const CHAT_PRESETS = ["OVER HERE", "NEED HELP", "FOUND A FUSE", "IT'S COMING"];

const G = {
  MOD: null,            // imported server module (constants + collideMove)
  mePid: null,
  colors: ["#7fd4c1", "#e2b84c", "#c678dd", "#e2574c"],
  pois: null,
  rules: null,

  snaps: [],
  tOffset: 0,
  interpDelay: 130,

  players: new Map(),   // pid -> latest snapshot record (raw)
  doors: new Map(),     // "x,y" -> [key, open, locked]
  items: [],
  mon: null,
  phase: null,
  gameState: "lobby",
  objData: null,
  endInfo: null,

  me: { x: 31.5, y: 28.5, a: 0, cr: false, sp: false, fl: true },
  keys: {},
  mouse: { x: innerWidth / 2, y: innerHeight / 2 },
  stamina: 100,
  stamLockUntil: 0,
  lastPosSent: 0,
  flashOn: true,

  holdKind: null,       // currently streamed hold action
  holdKey: null,
  tapLockUntil: 0,

  objectiveText: "",
  objectiveSub: "",
  blackoutEnd: 0,
  shake: 0,
  specMode: false,
  running: false,
  lastFrame: 0,
  rafId: null,
  dom: {},              // cached DOM nodes

  init(mod) {
    this.MOD = mod;
    const $ = id => document.getElementById(id);
    this.dom = {
      canvas: $("game-canvas"),
      objectiveText: $("objective-text"),
      objectiveSub: $("objective-sub"),
      crewBox: $("crew-box"),
      feed: $("event-feed"),
      prompt: $("interact-prompt"),
      holdWrap: $("hold-bar-wrap"),
      holdBar: $("hold-bar"),
      callout: $("center-callout"),
      chatLog: $("chat-log"),
      pingLayer: $("ping-layer"),
      vignetteRed: $("vignette-red"),
      staticOverlay: $("static-overlay"),
      blackout: $("blackout"),
      deadTag: $("dead-cam-tag"),
    };
    Render.init(this.dom.canvas);
    window.addEventListener("keydown", e => this.onKey(e, true));
    window.addEventListener("keyup", e => this.onKey(e, false));
    window.addEventListener("mousemove", e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    window.addEventListener("blur", () => { this.keys = {}; this._stopHold(); });
    this.dom.canvas.addEventListener("mousedown", e => {
      if (this.gameState !== "playing") return;
      AudioSys.resume();
    });
  },

  /* ---------------- snapshot pipeline ---------------- */

  onSnap(s) {
    this.snaps.push(s);
    if (this.snaps.length > 60) this.snaps.shift();
    this.tOffset = this.tOffset * 0.9 + (s.tm - performance.now()) * 0.1;

    this.gameState = s.state;
    this.phase = s.phase;
    this.objData = s.ob;
    this.endInfo = s.end || null;
    this.doors.clear();
    for (const [k, o, l] of s.dr) this.doors.set(k, [k, !!o, !!l]);
    this.items = s.it || [];
    this.mon = s.mon;
    this.players.clear();
    for (const p of s.pl) this.players.set(p.pid, p);

    // screen transitions
    if (s.state === "playing") Main.showGame();
    else if (s.state === "lobby") Main.showLobby();
    else if (s.state === "ended" && this.endInfo) Main.showEnd(this.endInfo);
  },

  interpolated(nowMs) {
    const target = nowMs + this.tOffset - this.interpDelay;
    const arr = this.snaps;
    if (!arr.length) return null;
    let a = arr[0], b = arr[arr.length - 1];
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].tm <= target) { a = arr[i]; b = arr[Math.min(arr.length - 1, i + 1)]; break; }
    }
    const span = b.tm - a.tm;
    const f = span > 0 ? Math.max(0, Math.min(1, (target - a.tm) / span)) : 1;
    const lerpPl = rec => {
      const pa = a.pl.find(x => x.pid === rec.pid) || rec;
      const pb = b.pl.find(x => x.pid === rec.pid) || rec;
      return { ...rec, x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f };
    };
    const out = { pl: [...b.pl].map(lerpPl) };
    if (a.mon && b.mon) {
      out.mon = { ...b.mon, x: a.mon.x + (b.mon.x - a.mon.x) * f, y: a.mon.y + (b.mon.y - a.mon.y) * f };
    } else out.mon = b.mon;
    return out;
  },

  /* ---------------- input ---------------- */

  onKey(e, down) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (Main.isTyping()) return;

    // pause menu
    if (k === "escape") { Main.togglePause(down); return; }
    if (Main.paused && k !== "escape") { /* swallow while paused */ }

    if (!down) {
      if (k === "e") this._stopHold();
      if (["w", "a", "s", "d"].includes(k)) this.keys[k] = false;
      return;
    }
    this.keys[k] = true;

    if (this.gameState !== "playing" && this.gameState !== "countdown") return;
    if (Main.paused) return;

    switch (k) {
      case "f": this.flashOn = !this.flashOn; AudioSys.play("ui"); break;
      case "g": this._drop(); break;
      case "q": NET.send({ t: "ping" }); AudioSys.play("ui"); break;
      case "t": break;
      case "tab": e.preventDefault(); Main.toggleObjectives(); break;
      case "e": this._interactPress(); break;
      case "1": case "2": case "3": case "4": {
        const i = +k - 1;
        NET.send({ t: "chat", i });
        break;
      }
    }
  },

  _drop() {
    if (this.meDowned() || this.dead()) return;
    NET.send({ t: "drop" });
  },

  /* decide what E does right now */
  contextAction() {
    const me = this.me, P = this.pois || {};
    const D = (o, r) => Math.hypot(me.x - o.x, me.y - o.y) <= r;
    if (this.inLocker()) return { kind: "lockerExit", label: "<b>E</b> — slip out of the locker" };

    // revive first
    for (const p of this.players.values()) {
      if (p.pid !== this.mePid && p.dn && !p.dd && p.conn && Math.hypot(me.x - p.x, me.y - p.y) < 1.7)
        return { kind: "revive", pid: p.pid, hold: true, need: this.rules ? this.rules.revive : 4, label: `<b>E</b> — hold to lift ${p.n}` };
    }
    if (this.meDowned() || this.dead()) return null;

    if (this.phase === "power") {
      if (this.myRecord().fu && P.breaker && D(P.breaker, 1.7))
        return { kind: "insert", hold: true, need: 2, label: "<b>E</b> — seat fuse in breaker" };
      if (this.objData && this.objData.fi >= this.objData.fn) {
        if (P.switchA && D(P.switchA, 1.6)) return { kind: "switchA", hold: true, label: "<b>E</b> — hold switch A <span class='dim'>(need both)</span>" };
        if (P.switchB && D(P.switchB, 1.6)) return { kind: "switchB", hold: true, label: "<b>E</b> — hold switch B <span class='dim'>(need both)</span>" };
      }
    }
    if (this.phase === "signal") {
      if (P.dishes) for (let i = 0; i < P.dishes.length; i++) {
        if (D(P.dishes[i], 1.7) && this.objData && this.objData.di[i] < 1)
          return { kind: "dish", key: i, hold: true, need: 6, label: `<b>E</b> — align dish ${i + 1}/3 <span class='warn'>(loud!)</span>` };
      }
      if (this.objData && this.objData.di.every(v => v >= 1)) {
        if (P.termA && D(P.termA, 1.7)) return { kind: "termA", hold: true, label: "<b>E</b> — decode terminal ALPHA" };
        if (P.termB && D(P.termB, 1.7)) return { kind: "termB", hold: true, label: "<b>E</b> — decode terminal BETA" };
      }
      if (P.radio && D(P.radio, 1.6)) return { kind: "radio", hold: true, need: 1.2, label: "<b>E</b> — listen to the radio" };
    }
    if (P.lever && this.objData && this.objData.tr && !this.objData.tr.l && D(P.lever, 1.7))
      return { kind: "lever", hold: true, need: 2, label: "<b>E</b> — haul release lever" };

    // notes
    if (P.notes) for (let i = 0; i < P.notes.length; i++)
      if (D(P.notes[i], 1.5)) return { kind: "note", key: i, hold: true, need: 0.8, label: "<b>E</b> — read the page" };

    // lockers
    if (P.lockers) for (let i = 0; i < P.lockers.length; i++)
      if (D(P.lockers[i], 1.45)) return { kind: "lockerEnter", idx: i, label: "<b>E</b> — hide inside" };

    // doors
    let bestD = null, bd = 1.35;
    for (const [k, d] of this.doors) {
      const [dx, dy] = k.split(",").map(Number);
      const dd = Math.hypot(me.x - dx - 0.5, me.y - dy - 0.5);
      if (dd < bd) { bd = dd; bestD = d; }
    }
    if (bestD) return { kind: "doorTap", label: bestD[2] ? "<b>E</b> — locked tight" : bestD[1] ? "<b>E</b> — close door" : "<b>E</b> — open door" };
    return null;
  },

  _interactPress() {
    const now = performance.now();
    if (now < this.tapLockUntil) return;
    const ctxAct = this.contextAction();
    if (!ctxAct) return;
    if (ctxAct.kind === "lockerEnter") {
      NET.send({ t: "locker" });
      this.tapLockUntil = now + 350;
      AudioSys.play("locker");
    } else if (ctxAct.kind === "lockerExit") {
      NET.send({ t: "locker" });
      this.tapLockUntil = now + 350;
      AudioSys.play("locker");
    } else if (ctxAct.kind === "doorTap") {
      NET.send({ t: "door" });
      this.tapLockUntil = now + 300;
      AudioSys.play("door");
    } else if (ctxAct.hold) {
      this.holdKind = ctxAct.kind;
      this.holdKey = ctxAct.key != null ? ctxAct.key : ctxAct.pid;
      NET.send({ t: "act", k: ctxAct.kind, i: ctxAct.key != null ? ctxAct.key : ctxAct.pid, on: true });
      if (ctxAct.kind === "dish") this._dishHowlUntil = now + 999999;
    }
  },

  _stopHold() {
    if (this.holdKind) {
      NET.send({ t: "act", k: this.holdKind, on: false });
      this.holdKind = null;
      this.holdKey = null;
    }
  },

  /* ---------------- per-frame ---------------- */

  frame(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;

    const snapLive = this.snaps[this.snaps.length - 1];
    if (!snapLive) return;
    const inter = this.interpolated(now);

    // --- my record from latest snap ---
    const mineRaw = this.players.get(this.mePid);

    if (snapLive.state !== "playing" && snapLive.state !== "countdown") {
      // lobby/end: gentle idle render of spawn room
      this.specMode = false;
    }

    // --- local movement ---
    const canMove = snapLive.state === "playing" && !this.dead() && !this.inLocker();
    const downed = this.meDowned();
    let vx = 0, vy = 0;
    if (canMove && !Main.paused) {
      if (this.keys.w) vy -= 1;
      if (this.keys.s) vy += 1;
      if (this.keys.a) vx -= 1;
      if (this.keys.d) vx += 1;
    }
    const mag = Math.hypot(vx, vy);
    let sprinting = false;
    if (mag > 0 && !downed) {
      const wantSprint = (this.keys.shift || false) && !this.me.cr && performance.now() > this.stamLockUntil && this.stamina > 4;
      sprinting = wantSprint;
    }
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 24);
      if (this.stamina <= 0.5) { this.stamLockUntil = performance.now() + 900; sprinting = false; }
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 15);
    }
    let spd = downed ? 1.15 : this.me.cr ? 2.1 : sprinting ? 6.4 : 4.1;
    // spectate fly
    if (this.dead()) spd = 9;

    if ((mag > 0 || this.dead())) {
      const nx = this.me.x + (vx / (mag || 1)) * spd * dt * (this.dead() ? 1 : Math.min(1, mag));
      const ny = this.me.y + (vy / (mag || 1)) * spd * dt * (this.dead() ? 1 : Math.min(1, mag));
      if (this.dead()) {
        this.me.x = Math.max(1, Math.min(this.MOD.MAP_W - 1, nx));
        this.me.y = Math.max(1, Math.min(this.MOD.MAP_H - 1, ny));
      } else {
        const res = this.MOD.collideMove(this.me.x, this.me.y, nx, ny, 0.34, (tx, ty) => {
          const ch = this.tileSolid(tx, ty);
          return ch;
        });
        this.me.x = res.x; this.me.y = res.y;
      }
      // footstep sounds
      this._stepAcc = (this._stepAcc || 0) + spd * dt;
      const stride = sprinting ? 2.2 : this.me.cr ? 2.6 : 2.4;
      if (this._stepAcc > stride && !downed) {
        this._stepAcc = 0;
        const grate = this.MOD.MAP_ROWS[Math.floor(this.me.y)][Math.floor(this.me.x)] === ",";
        AudioSys.play("step", { sprint: sprinting, crouch: this.me.cr, grate, x: this.me.x, y: this.me.y });
      } else if (this._stepAcc > stride * 1.4 && downed) this._stepAcc = 0;
    } else this._stepAcc = 0;

    // aim
    if (!this.dead()) {
      const [wx, wy] = Render.screenToWorld(this.mouse.x, this.mouse.y);
      this.me.a = Math.atan2(wy - this.me.y, wx - this.me.x);
    }

    // soft reconcile toward authoritative position (only when idle-ish or far)
    if (mineRaw && snapLive.state === "playing" && !this.dead() && !this.inLocker()) {
      const dx = mineRaw.x - this.me.x, dy = mineRaw.y - this.me.y;
      const dd = Math.hypot(dx, dy);
      if (dd > 2.2) { this.me.x = mineRaw.x; this.me.y = mineRaw.y; }
      else if (dd > 0.05 && mag === 0) { this.me.x += dx * Math.min(1, dt * 6); this.me.y += dy * Math.min(1, dt * 6); }
    } else if (mineRaw && (snapLive.state === "lobby" || snapLive.state === "ended")) {
      this.me.x += (mineRaw.x - this.me.x) * Math.min(1, dt * 4);
      this.me.y += (mineRaw.y - this.me.y) * Math.min(1, dt * 4);
    }

    // send position @20Hz
    if (now - this.lastPosSent >= 50) {
      this.lastPosSent = now;
      if (snapLive.state === "playing" || snapLive.state === "countdown")
        NET.send({
          t: "p", x: +this.me.x.toFixed(3), y: +this.me.y.toFixed(3),
          a: +this.me.a.toFixed(2), cr: this.me.cr ? 1 : 0, sp: sprinting ? 1 : 0, fl: this.flashOn ? 1 : 0,
        });
    }

    // hold-action dish howl
    if (this.holdKind === "dish") {
      this._howlAcc = (this._howlAcc || 0) + dt;
      if (this._howlAcc > 1.1) { this._howlAcc = 0; AudioSys.play("dish_howl", { global: true }); }
    }

    // --- monster proximity fx ---
    let stLevel = 0, redLevel = 0, monDist = Infinity;
    const monI = inter && inter.mon;
    if (monI && monI.rv) {
      monDist = Math.hypot(monI.x - this.me.x, monI.y - this.me.y);
      stLevel = Math.max(0, 1 - monDist / 11) ** 1.3;
      if (monI.s === "hunt") { stLevel = Math.min(1, stLevel + 0.25); redLevel = Math.max(redLevel, Math.max(0, 1 - monDist / 13)); }
      else redLevel = Math.max(redLevel, Math.max(0, (6 - monDist) / 6) * 0.5);
      // footsteps audible
      this._monStepAcc = (this._monStepAcc || 0) + dt * (monI.s === "hunt" ? 2.4 : 1.2);
      if (this._monStepAcc > 1 && monDist < 14) {
        this._monStepAcc = 0;
        AudioSys.play("monstep", { x: monI.x, y: monI.y });
      }
    }
    if (downed) redLevel = Math.max(redLevel, 0.35);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    AudioSys.updateHeartbeat(isFinite(monDist) ? monDist : 99);

    // --- render ---
    const view = {
      now, phase: snapLive.phase,
      me: { ...this.me, fl: this.flashOn && !downed ? 1 : 0, dn: downed ? 1 : 0 },
      mePid: this.mePid, meColor: mineRaw ? mineRaw.c : 0,
      colors: this.colors,
      players: Object.fromEntries([...inter.pl].map(p => [p.pid, p])),
      mon: monI ? { x: monI.x, y: monI.y, s: monI.s, rv: monI.rv } : null,
      doors: this.doors,
      items: this.items,
      obj: this.objData,
      pois: this.pois || {},
      blastOpen: this.phase === "escape" ? Math.min(1, ((now - (this.escapeAt || now)) / 40000)) : 0,
      specMode: this.dead(),
      fx: { shake: this.shake, static: stLevel, red: redLevel },
      heldSwitches: { switchA: this.holdKind === "switchA", switchB: this.holdKind === "switchB" },
    };
    if (snapLive.phase === "escape" && !this.escapeAt) this.escapeAt = now;
    if (snapLive.phase !== "escape") this.escapeAt = null;
    Render.draw(view);

    // blackout overlay
    const boRemain = this.objData && this.objData.bo > 0 ? this.objData.bo : Math.max(0, (this.blackoutEnd - now) / 1000);
    this.dom.blackout.style.opacity = boRemain > 0 ? 1 : 0;
    this.dom.vignetteRed.style.opacity = redLevel;
    this.dom.staticOverlay.style.opacity = 0; // static drawn in-canvas

    // dead tag
    this.dom.deadTag.classList.toggle("hidden", !this.dead());

    this.updateHud(inter, snapLive, downed);
  },

  tileSolid(tx, ty) {
    const ch = this.MOD.tileAt(tx, ty);
    if (ch === "#" || ch === "=") return true;
    if (ch === "D") {
      const st = this.doors.get(`${tx},${ty}`);
      return !(st && st[1] && !st[2]);
    }
    return false;
  },

  myRecord() { return this.players.get(this.mePid) || {}; },
  dead() { const m = this.myRecord(); return !!(m && m.dd); },
  meDowned() { const m = this.myRecord(); return !!(m && m.dn); },
  inLocker() { const m = this.myRecord(); return m && m.lk >= 0; },

  /* ---------------- HUD ---------------- */

  updateHud(inter, snapLive, downed) {
    // interact prompt + hold bar
    const ctxAct = this.contextAction();
    const prompt = this.dom.prompt, hw = this.dom.holdWrap;
    if (ctxAct && !this.dead()) {
      prompt.innerHTML = ctxAct.label;
      prompt.classList.remove("hidden");
    } else prompt.classList.add("hidden");

    let holdFrac = 0, showHold = false;
    if (this.holdKind) {
      const mine = this.myRecord();
      if (mine.act === this.holdKind) {
        const need = ({ revive: this.rules.revive, insert: 2, dish: 6, termA: 5, termB: 5, lever: 2, radio: 1.2, note: 0.8 })[this.holdKind] || 1;
        holdFrac = Math.min(1, mine.actT / need);
        showHold = true;
      } else if (!mine.act) {
        // server rejected/stopped — release locally
        this._stopHold();
      }
    }
    hw.classList.toggle("hidden", !showHold);
    if (showHold) this.dom.holdBar.style.width = `${holdFrac * 100}%`;

    // crew cards
    let html = "";
    const meRec = this.myRecord();
    if (meRec.pid != null) {
      html += this._crewCard(meRec, true);
      for (const p of this.players.values())
        if (p.pid !== this.mePid) html += this._crewCard(p, false);
    }
    this.dom.crewBox.innerHTML = html;

    // objective
    this.dom.objectiveText.textContent = this.objectiveText || "…";
    this.dom.objectiveSub.textContent = this.objectiveSub;
  },

  _crewCard(p, isMe) {
    const col = this.colors[p.c] || "#fff";
    let stat, bar = "";
    if (isMe) {
      stat = this.dead() ? "FLATLINE" : p.dn ? "DOWNED" : this.inLocker() >= 0 || (p.lk >= 0) ? "HIDDEN" : "ACTIVE";
      if (!this.dead() && !p.dn) bar = `<div class="stam-bar"><div style="width:${this.stamina}%"></div></div>`;
    } else {
      stat = !p.conn ? "SIGNAL LOST" : p.dd ? "FLATLINE" : p.dn ? "DOWNED" : p.lk >= 0 ? "HIDDEN" : p.rd ? "READY" : "ACTIVE";
    }
    if (p.dn && !isMe) bar = `<div class="bleed-bar"><div style="width:${Math.max(0, p.bo / 75 * 100)}%"></div></div>`;
    if (p.dn && isMe && !this.dead()) bar = `<div class="bleed-bar"><div style="width:${Math.max(0, p.bo / 75 * 100)}%"></div></div>`;
    const cls = p.dd ? "dead" : p.dn ? "downed" : "";
    const tag = p.fu ? ` <span class="warn">◆</span>` : "";
    return `<div class="crew-card ${cls}">
      <div class="crew-name-row"><span class="crew-swatch" style="background:${col}"></span>${p.n}${tag}</div>
      <div class="crew-status">${stat}</div>${bar}</div>`;
  },

  /* ---------------- events ---------------- */

  handleEvent(evRaw) {
    const ev = { ...evRaw, data: evRaw.data || evRaw.d || {} };
    const x = ev.x, y = ev.yy;
    switch (ev.y) {
      case "joined": this.feed(`${ev.data.name} jacked in`, ""); break;
      case "rejoined": this.feed(`${ev.data.name} re-established uplink`, "good"); break;
      case "left": this.feed(`${ev.data.name} lost signal`, "dim"); break;
      case "sys": this.feed(ev.data.msg, "dim"); break;
      case "obj":
        this.objectiveText = ev.data.text;
        this.callout(ev.data.text.length < 42 ? "" : "");
        this.feed(ev.data.text, "imp");
        break;
      case "run_start":
        this.resetLocalRun();
        break;
      case "pickup": if (ev.data.pid === this.mePid) AudioSys.play("pickup"); this.feed(`${ev.data.name} grabbed a fuse`, "dim"); break;
      case "drop": if (ev.data.pid === this.mePid) AudioSys.play("drop"); break;
      case "fuse_in": AudioSys.play("fuse_in", { x, y }); this.feed(`Fuse seated (${ev.data.n}/${ev.data.need})`, "good"); break;
      case "power_on":
        AudioSys.play("power_on", { global: true });
        AudioSys.startAmbient("power");
        this.callout("POWER RESTORED\nsomething woke up");
        this.shake = 0.5;
        break;
      case "monster_spawn": AudioSys.play("screech", { global: true, }); break;
      case "spotted": AudioSys.play("spotted", { x, y }); this.shake = Math.max(this.shake, 0.35); break;
      case "lost": this.feed("It lost you.", "good"); break;
      case "screech": AudioSys.play("screech", { x, y }); this.shake = Math.max(this.shake, 0.8); break;
      case "creak": AudioSys.play("creak", { x, y }); break;
      case "pulse": AudioSys.play("creak", { global: true }); break;
      case "down":
        AudioSys.play("screech", { x, y });
        this.feed(`${ev.data.name} WAS CAUGHT`, "bad");
        if (ev.data.pid === this.mePid) this.callout("YOU ARE DOWN\nyour crew can lift you");
        this.shake = 1;
        break;
      case "died": this.feed(`${ev.data.name} flatlined`, "bad"); if (ev.data.pid === this.mePid) this.enterSpec(); break;
      case "revived":
        AudioSys.play("revived", { x, y });
        this.feed(`${ev.data.by} lifted ${ev.data.name}`, "good");
        break;
      case "door": AudioSys.play("door", { x, y }); break;
      case "door_locked": AudioSys.play("door_locked", { x, y }); break;
      case "locker_enter": if (ev.data.pid === this.mePid) this.feed("You fold yourself into the dark.", "dim"); AudioSys.play("locker", { x, y }); break;
      case "locker_exit": AudioSys.play("locker", { x, y }); break;
      case "locker_rip": AudioSys.play("locker_rip", { x, y }); this.feed("IT TORE THE DOOR OFF", "bad"); this.shake = 1; break;
      case "lever": AudioSys.play("lever", { x, y }); this.feed("Release lever pulled", "good"); break;
      case "radio_whisper": {
        if (ev.data.pid === this.mePid) {
          AudioSys.play("whisper", { global: true });
          const lines = [
            "…the array remembers your name…",
            "…we sang the dark to sleep…",
            "…do not answer the third knock…",
            "…it learned our voices by heart…",
          ];
          this.feed(lines[Math.floor(Math.random() * lines.length)], "imp");
        } else AudioSys.play("creak", { x, y });
        break;
      }
      case "note_read":
        this.feed(`“${ev.data.text}”`, "dim");
        AudioSys.play("ui");
        break;
      case "ping":
        this.addPing(ev.x, ev.yy, ev.data.name);
        if (ev.data.pid !== this.mePid) AudioSys.play("ping", { global: true });
        break;
      case "chat": {
        this.addChat(ev.data.name, CHAT_PRESETS[ev.data.i] || "…");
        AudioSys.play("chat", { global: true });
        break;
      }
      case "dish_done":
        AudioSys.play("dish_done", { x, y });
        this.feed(`Dish aligned${ev.data.left ? ` — ${ev.data.left} left` : ""}`, "good");
        break;
      case "decoded":
        AudioSys.play("decoded", { global: true });
        this.callout("THE SIGNAL IS OUT");
        break;
      case "blackout":
        this.blackoutEnd = performance.now() + (ev.data.dur || 4) * 1000;
        AudioSys.play("blackout_thud", { global: true });
        setTimeout(() => AudioSys.play("whisper", { global: true }), 700);
        break;
      case "trapped":
        this.callout(`${ev.data.name} IS SEALED IN THE CRYPT`);
        this.feed("Pull the release lever — GENERATOR ROOM", "bad");
        AudioSys.play("door_locked", { global: true });
        break;
      case "escape_start":
        this.callout("BLAST DOOR CYCLING\nRUN.");
        AudioSys.setKlaxon(true);
        this.shake = 0.7;
        break;
      case "win": AudioSys.setKlaxon(false); AudioSys.play("win", { global: true }); break;
      case "lose": AudioSys.setKlaxon(false); AudioSys.play("lose", { global: true }); break;
      case "to_lobby":
        AudioSys.setKlaxon(false);
        AudioSys.stopAmbient();
        this.resetLocalRun();
        break;
      case "countdown": Main.showCountdown(ev.data.t); break;
    }
  },

  resetLocalRun() {
    this.objectiveText = "";
    this.objectiveSub = "";
    this.snaps.length = 0;
    this.blackoutEnd = 0;
    this.escapeAt = null;
    this.specMode = false;
    this._stopHold();
    this.stamina = 100;
    this.flashOn = true;
    this.dom.feed.innerHTML = "";
    this.dom.pingLayer.innerHTML = "";
    this.dom.chatLog.innerHTML = "";
  },

  enterSpec() { this.specMode = true; },

  feed(text, cls) {
    const div = document.createElement("div");
    div.className = "ev " + (cls || "");
    div.textContent = text;
    this.dom.feed.prepend(div);
    while (this.dom.feed.children.length > 6) this.dom.feed.lastChild.remove();
    setTimeout(() => { div.style.opacity = "0"; div.style.transition = "opacity 1s"; }, 7000);
    setTimeout(() => div.remove(), 8200);
  },

  callout(text) {
    if (!text) return;
    const el = this.dom.callout;
    el.textContent = text;
    el.classList.remove("hidden");
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "callout 2.8s ease-out forwards";
    clearTimeout(this._coTimer);
    this._coTimer = setTimeout(() => el.classList.add("hidden"), 2900);
  },

  addPing(wx, wy, name) {
    const el = document.createElement("div");
    el.className = "ping-marker";
    el.title = name;
    this.dom.pingLayer.appendChild(el);
    const start = performance.now();
    const move = () => {
      const age = performance.now() - start;
      if (age > 3000) { el.remove(); return; }
      const [sx, sy] = Render.worldToScreen(wx, wy);
      el.style.left = sx + "px"; el.style.top = sy + "px";
      requestAnimationFrame(move);
    };
    move();
  },

  addChat(name, text) {
    const el = document.createElement("div");
    el.className = "chat-bubble";
    el.innerHTML = `<b>${name}:</b> ${text}`;
    this.dom.chatLog.appendChild(el);
    setTimeout(() => el.remove(), 4500);
    while (this.dom.chatLog.children.length > 4) this.dom.chatLog.firstChild.remove();
  },

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(t => this.frame(t));
  },
  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  },
};
