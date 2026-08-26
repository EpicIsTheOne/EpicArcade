import { compose, buildCharts, Engine, BEAT } from "./music.js";
import { Renderer } from "./render.js";
import { Match } from "./game.js";
import { Net } from "./net.js";

const $ = id => document.getElementById(id);
const screens = ["scr-menu", "scr-room", "scr-results", "scr-left"];
function show(id) {
  for (const s of screens) $(s).classList.toggle("on", s === id);
}
function hideAll() {
  for (const s of screens) $(s).classList.remove("on");
}
let toastT = null;
function toast(msg, ms = 2600) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), ms);
}

const song = compose();
const charts = buildCharts(song);
const engine = new Engine();
const renderer = new Renderer();
renderer.resize();
window.addEventListener("resize", () => renderer.resize());

let match = null;
let mode = "menu";
let myName = localStorage.getItem("fnf_name") || "";
let roomCode = null;
let mySeat = 0;
let opReadyFlag = false;
let iAmReady = false;
let awaitingResult = false;
let resultTimer = null;
let paused = false;

$("name-in").value = myName;
$("name-in").addEventListener("input", e => {
  myName = e.target.value.slice(0, 12);
  localStorage.setItem("fnf_name", myName || "");
});
if (!myName) $("name-in").value = ["NEON", "BLAZE", "PIXEL", "ECHO", "VOLT", "REMI"][Math.floor(Math.random() * 6)];

const net = new Net({
  onStatus(s) {
    const dot = $("net-dot");
    dot.classList.toggle("ok", s === "online");
    dot.querySelector("span").textContent =
      s === "online" ? "ONLINE" : s === "reconnecting" ? "RECONNECT…" : s === "connecting" ? "CONNECT…" : "OFFLINE";
  },
  onMessage: onMsg,
});

function onMsg(m) {
  switch (m.t) {
    case "queued":
      $("menu-status").textContent = m.pos > 1 ? `In queue… (${m.pos} waiting)` : "Searching for a rival…";
      break;
    case "matched":
      roomCode = m.room;
      mySeat = m.seat;
      $("room-code").textContent = m.room;
      $("me-nm").textContent = myName || "YOU";
      $("op-nm").textContent = m.opp || "???";
      setChip("chip-me", iAmReady = false);
      setChip("chip-op", false);
      $("btn-ready").disabled = false;
      $("btn-ready").textContent = "READY UP";
      $("room-status").textContent = "Both players ready to start!";
      show("scr-room");
      break;
    case "room_full":
      toast("That room is full!");
      break;
    case "opp_ready":
      opReadyFlag = m.v;
      setChip("chip-op", m.v);
      if (!iAmReady) $("room-status").textContent = m.v ? "Rival is ready! Hit READY UP!" : "Rival un-ready…";
      break;
    case "start":
      startMatch({ online: true });
      break;
    case "opp_state":
      if (match && match.running) match.applyOpponent(m.u);
      break;
    case "result":
      clearTimeout(resultTimer);
      awaitingResult = false;
      endMatch({
        winner: m.winner,
        reason: m.reason,
        me: m.me || summarizeLocal(),
        op: m.op || { ...match.opState },
      });
      break;
    case "rematch_req":
      $("res-status").textContent = "Rival wants a rematch! Accept below.";
      $("btn-rematch").textContent = "ACCEPT REMATCH";
      toast("Rival wants a rematch!");
      break;
    case "opp_left":
      handleOppLeft();
      break;
  }
}

function setChip(id, ready) {
  const el = $(id);
  el.classList.toggle("ready", !!ready);
  el.querySelector(".st").textContent = ready ? "READY!" : "waiting…";
}

function ensureAudio() {
  engine.init();
}

$("btn-quick").addEventListener("click", () => {
  ensureAudio();
  net.disconnect();
  iAmReady = false;
  net.connect({ name: $("name-in").value.trim() || myName });
  $("menu-status").textContent = "Connecting…";
});
$("btn-practice").addEventListener("click", () => {
  ensureAudio();
  startMatch({ online: false });
});
let privRow = null;
$("btn-private").addEventListener("click", () => {
  if (privRow) return;
  privRow = document.createElement("div");
  privRow.innerHTML = `
    <input class="txt" id="priv-code" maxlength="4" placeholder="ROOM CODE (blank = create)" style="text-transform:uppercase">
    <button class="btn small" id="priv-go">GO</button>`;
  $("btn-private").after(privRow);
  $("priv-go").addEventListener("click", () => {
    let code = $("priv-code").value.trim().toUpperCase();
    if (!code) code = Array.from({ length: 4 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    ensureAudio();
    net.disconnect();
    iAmReady = false;
    net.connect({ name: $("name-in").value.trim() || myName, room: code });
    $("menu-status").textContent = `Joining room ${code}…`;
  });
});
$("btn-ready").addEventListener("click", () => {
  iAmReady = !iAmReady;
  setChip("chip-me", iAmReady);
  net.send({ t: "ready", v: iAmReady });
  $("btn-ready").textContent = iAmReady ? "UN-READY" : "READY UP";
  if (iAmReady && !opReadyFlag) $("room-status").textContent = "Waiting for rival…";
});
$("btn-room-back").addEventListener("click", () => {
  net.disconnect();
  show("scr-menu");
  $("menu-status").textContent = "";
});
$("btn-menu-back").addEventListener("click", () => {
  net.send({ t: "ready", v: false });
  show("scr-menu");
});
$("btn-left-menu").addEventListener("click", () => {
  show("scr-menu");
});
$("btn-rematch").addEventListener("click", () => {
  if (mode === "practice" || mode === "results") {
    if (!net.status || net.status === "off" || net.status === "reconnecting") {
      startMatch({ online: false });
      return;
    }
  }
  net.send({ t: "rematch" });
  $("res-status").textContent = "Waiting for rival to accept…";
});

function startMatch(opts) {
  hideAll();
  renderer.reset();
  paused = false;
  mode = opts.online ? "online" : "practice";
  const opName = opts.online ? ($("op-nm").textContent || "RIVAL") : "BOT EMBER";
  match = new Match({
    charts,
    songLen: song.length,
    sections: song.sections,
    engine,
    renderer,
    online: opts.online,
    meName: (opts.online ? myName : "YOU") || "YOU",
    opName,
    bot: !opts.online,
    botSkill: 0.97,
    onSendState(u) {
      if (opts.online) net.send({ t: "state", u });
    },
    onFinish(sum) {
      if (opts.online) {
        net.send({ t: "finish", s: sum });
        awaitingResult = true;
        clearTimeout(resultTimer);
        resultTimer = setTimeout(() => {
          if (awaitingResult) {
            awaitingResult = false;
            decideLocal(sum, { ...match.opState }, "timeout");
          }
        }, 8000);
      } else {
        setTimeout(() => decideLocal(sum, { ...match.opState }, "finish"), 900);
      }
    },
    onKo(won) {
      if (opts.online) net.send({ t: "ko", won });
      engine.stop();
      match.running = false;
      setTimeout(() => {
        if (opts.online) {
          awaitingResult = true;
          clearTimeout(resultTimer);
          resultTimer = setTimeout(() => {
            if (awaitingResult) {
              awaitingResult = false;
              decideLocal(summarizeLocal(), { ...match.opState }, "ko-timeout");
            }
          }, 6000);
        } else {
          endMatch({ winner: won ? "you" : "opp", reason: "ko", me: summarizeLocal(), op: { ...match.opState } });
        }
      }, 1100);
    },
  });
  match.beginBot();
  match.setEvents(song.events);
  match.start();
}

function summarizeLocal() {
  const s = match.meState;
  return {
    score: s.score,
    acc: Math.round(s.acc * 10) / 10,
    maxCombo: s.maxCombo,
    sicks: s.sicks,
    goods: s.goods,
    bads: s.bads,
    misses: s.misses,
  };
}

function decideLocal(meSum, opSum, reason) {
  const w = meSum.acc > opSum.acc ? "you" : opSum.acc > meSum.acc ? "opp" : meSum.score >= opSum.score ? "you" : "opp";
  endMatch({ winner: w, reason, me: meSum, op: opSum });
}

function endMatch(r) {
  if (mode !== "results" && mode !== "online") return;
  mode = "results";
  engine.stop();
  const title = $("res-title");
  title.className = "big-msg " + (r.winner === "you" ? "win-you" : r.winner === "opp" ? "win-opp" : "win-draw");
  title.textContent = r.winner === "you" ? "VICTORY!" : r.winner === "opp" ? "DEFEAT…" : "DRAW";
  const koLike = r.reason === "ko" || r.reason === "ko-timeout";
  const authoritative = r.reason !== "timeout" && r.reason !== "ko-timeout";
  $("res-sub").textContent = koLike ? "pressure meter drained!" : authoritative ? "song cleared" : "connection hiccup — judged locally";
  const grid = $("res-stats");
  const rows = [
    ["SCORE", o => Math.round(o?.score ?? 0).toLocaleString()],
    ["ACCURACY", o => (o?.acc ?? 0).toFixed(1) + "%"],
    ["MAX COMBO", o => "x" + (o?.maxCombo ?? 0)],
    ["SICK / GOOD / BAD", o => `${o?.sicks ?? 0} / ${o?.goods ?? 0} / ${o?.bads ?? 0}`],
    ["MISSES", o => String(o?.misses ?? 0)],
  ];
  grid.innerHTML = "";
  for (const [k, fmt] of rows) {
    for (const [cls, val] of [["me", r.me], ["op", r.op]]) {
      const d = document.createElement("div");
      d.className = "stat " + cls;
      d.innerHTML = `<div class="v">${fmt(val)}</div><div class="k">${k}${cls === "me" ? " · YOU" : " · OPP"}</div>`;
      grid.appendChild(d);
    }
  }
  $("btn-rematch").textContent = "REMATCH";
  $("res-status").textContent = "";
  show("scr-results");
}

function handleOppLeft() {
  clearTimeout(resultTimer);
  awaitingResult = false;
  if (match && match.running) {
    match.running = false;
    engine.stop();
    mode = "left";
    $("left-sub").textContent = "your rival bailed mid-battle";
    show("scr-left");
  } else {
    show("scr-menu");
    $("menu-status").textContent = "Rival left the room.";
  }
}

const KEYMAP = {
  ArrowLeft: 0, KeyD: 0,
  ArrowDown: 1, KeyF: 1,
  ArrowUp: 2, KeyJ: 2,
  ArrowRight: 3, KeyK: 3,
};
window.addEventListener("keydown", e => {
  if (e.code === "Escape") { togglePause(); return; }
  const lane = KEYMAP[e.code];
  if (lane === undefined) return;
  e.preventDefault();
  if (e.repeat) return;
  if (paused || !match || !match.running) return;
  match.press(lane);
});
window.addEventListener("keyup", e => {
  const lane = KEYMAP[e.code];
  if (lane === undefined) return;
  if (match) match.release(lane);
});

const canvasEl = renderer.canvas;
canvasEl.addEventListener("pointerdown", e => {
  if (!match || !match.running || paused) return;
  const rect = canvasEl.getBoundingClientRect();
  const L = renderer.layout();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (y < L.plRecY - renderer.h * 0.35) return;
  const rel = (x - L.plX) / L.laneGap + 1.5;
  const lane = Math.round(rel);
  if (lane >= 0 && lane < 4) {
    canvasEl.setPointerCapture(e.pointerId);
    match.press(lane);
  }
});
canvasEl.addEventListener("pointerup", () => {
  if (match) for (let l = 0; l < 4; l++) match.release(l);
});

function togglePause() {
  if (mode === "online") {
    if (!paused) toast("No pausing mid-battle — your rival keeps playing!");
    return;
  }
  if (mode !== "practice") return;
  paused = !paused;
  let pauseOverlay = document.getElementById("pause-overlay");
  if (paused) {
    engine.suspend();
    pauseOverlay = document.createElement("div");
    pauseOverlay.className = "screen on";
    pauseOverlay.id = "pause-overlay";
    pauseOverlay.style.zIndex = 30;
    pauseOverlay.innerHTML = `<div class="panel"><div class="big-msg">PAUSED</div>
      <button class="btn" id="p-resume">RESUME</button>
      <button class="btn ghost" id="p-quit">QUIT TO MENU</button></div>`;
    document.body.appendChild(pauseOverlay);
    $("p-resume").addEventListener("click", togglePause);
    $("p-quit").addEventListener("click", () => {
      quitToMenu();
    });
  } else {
    engine.resume();
    if (pauseOverlay) pauseOverlay.remove();
  }
}
function quitToMenu() {
  if (match) { match.running = false; engine.stop(); }
  match = null;
  paused = false;
  mode = "menu";
  renderer.reset();
  const po = document.getElementById("pause-overlay");
  if (po) po.remove();
  show("scr-menu");
}

const hudProgress = { el: null };
(function makeProgressBar() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6);width:0%;z-index:20";
  document.body.appendChild(el);
  hudProgress.el = el;
})();

const BEATLEAD = BEAT * 4 + 0.5;
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const playingMatch = match && (match.running || mode === "results" || mode === "left");
  if (playingMatch && !paused) {
    if (match.running) match.tick(dt);
    renderer.update(dt, match.engine.pos(), true);
    const snap = match.snapshot();
    const pos = snap.pos;
    if (pos < 0 && pos > -BEATLEAD && match.running) {
      if (-pos > BEAT * 3.02) { snap.countdownText = "READY?"; snap.countdownColor = "#8f89bd"; }
      else {
        snap.countdownText = String(Math.ceil(-pos / BEAT));
        snap.countdownColor = "#ffd166";
      }
    } else if (pos >= 0 && pos < 0.45 && match.running) {
      snap.countdownText = "GO!!";
      snap.countdownColor = "#6ee7a0";
    }
    if (snap.songLen > 0) hudProgress.el.style.width = Math.max(0, Math.min(100, (pos / snap.songLen) * 100)) + "%";
    renderer.draw(snap);
  } else {
    renderer.update(dt, -99, false);
    renderer.draw({
      mode: "menu",
      pos: -99,
      particles: [],
      hp: 0.5,
      meName: (myName || "YOU"),
      opName: "EMBER",
      chartMe: null,
      chartOp: null,
      meState: null,
      opState: null,
      sections: song.sections,
    });
    hudProgress.el.style.width = "0%";
  }
}
requestAnimationFrame(frame);

window.__fnf = {
  get match() { return match; },
  get song() { return song; },
  get charts() { return charts; },
  get engine() { return engine; },
  get net() { return net; },
  get mode() { return mode; },
  press: l => match && match.press(l),
};
