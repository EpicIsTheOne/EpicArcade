/* NEON DRIFTER — main controller
   Syncs scenes to the timeline clock, handles interaction, UI, fullscreen,
   seek, visual-mode forcing, performance guard. */
(function () {
"use strict";

const TL = window.TIMELINE;
const BPM = TL.bpm;
const SECS = TL.sections;
const FADE = 1.6;

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");

const ui = {
  landing: $("landing"), btnPlay: $("btn-play"),
  endcard: $("endcard"), btnReplay: $("btn-replay"),
  controls: $("controls"), cPlay: $("c-play"), cRestart: $("c-restart"),
  cFull: $("c-full"), seekwrap: $("seekwrap"), seekbar: $("seekbar"),
  seekFill: $("seek-fill"), seekKnob: $("seek-knob"), seekSects: $("seek-sects"),
  seekTip: $("seek-tip"), tCur: $("t-cur"), tTot: $("t-tot"),
  modeLabel: $("mode-label"), toast: $("toast"),
  titlecard: $("titlecard"), tcNum: $("tc-num"), tcName: $("tc-name"),
};

// ---------- state ----------
let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 1.75);
const engine = new window.AudioEngine(TL);

let curW = {};                 // per-scene displayed weights
SECS.forEach((s) => { curW[s.id] = 0; });
let palRGB = window.Scenes.initPalette("dawn");
let forcedScene = null;        // null = auto

const mouse = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0 };
const cam = { x: 0, y: 0 };
let shakeBump = 0, punch = 0;
let intensity = 1.0;
let lastBeatIdx = -1, lastBarIdx = -1;
let curSecIdx = -1;
let cardTimer = null, toastTimer = null, hideTimer = null;
let uiHidden = false;
let started = false;           // real playback begun at least once
let degraded = false;
let frameEMA = 16, slowFrames = 0;

// ---------- helpers ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fmt(t) {
  t = Math.max(0, t | 0);
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, "0")}`;
}
function sectionIndexAt(t) {
  for (let i = 0; i < SECS.length; i++) {
    if (t >= SECS[i].start && t < SECS[i].end) return i;
  }
  return t <= 0 ? 0 : SECS.length - 1;
}

function toast(msg, ms) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), ms || 1500);
}

function showTitleCard(idx) {
  const s = SECS[idx];
  const parts = s.name.split("·");
  ui.tcNum.textContent = parts[0] ? parts[0].trim() : "";
  ui.tcName.textContent = parts[1] ? parts[1].trim() : s.name;
  ui.titlecard.classList.add("show");
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => ui.titlecard.classList.remove("show"), 2700);
}

// ---------- controls visibility ----------
function wakeUI() {
  if (uiHidden) {
    uiHidden = false;
    ui.controls.classList.remove("hidden");
    document.body.style.cursor = "";
  }
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (engine.playing && started) {
      uiHidden = true;
      ui.controls.classList.add("hidden");
      document.body.style.cursor = "none";
    }
  }, 3200);
}

// ---------- resize ----------
function resize() {
  W = innerWidth; H = innerHeight;
  DPR = degraded ? Math.min(DPR, 1.15) : Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  window.Scenes.reset(W, H);
}
window.addEventListener("resize", resize);

// ---------- seekbar ----------
function buildSeekMarks() {
  ui.seekSects.innerHTML = "";
  const tot = TL.duration;
  SECS.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "sect-mark";
    d.style.left = `${(s.start / tot) * 100}%`;
    d.style.width = `${((s.end - s.start) / tot) * 100}%`;
    d.style.background = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)";
    d.style.borderLeft = "1px solid rgba(255,255,255,0.22)";
    ui.seekSects.appendChild(d);
  });
  ui.tTot.textContent = fmt(tot);
}
function seekFromEvent(e) {
  const r = ui.seekbar.getBoundingClientRect();
  const u = clamp((e.clientX - r.left) / r.width, 0, 1);
  const t = u * TL.duration;
  const wasEnded = engine._endedFired;
  hideEndcard();
  engine.seek(t);
  if (wasEnded) engine.play();
  updatePlayIcon();
  wakeUI();
}
let seeking = false;
ui.seekwrap.addEventListener("pointerdown", (e) => {
  seeking = true;
  try { ui.seekwrap.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or stale pointer */ }
  seekFromEvent(e);
});
ui.seekwrap.addEventListener("pointermove", (e) => {
  const r = ui.seekbar.getBoundingClientRect();
  const u = clamp((e.clientX - r.left) / r.width, 0, 1);
  const t = u * TL.duration;
  const idx = sectionIndexAt(t);
  ui.seekTip.hidden = false;
  ui.seekTip.style.left = `${clamp(u * ui.seekwrap.clientWidth, 40, ui.seekwrap.clientWidth - 40)}px`;
  ui.seekTip.textContent = `${SECS[idx].name} · ${fmt(t)}`;
  if (seeking) seekFromEvent(e);
});
ui.seekwrap.addEventListener("pointerup", () => { seeking = false; });
ui.seekwrap.addEventListener("pointerleave", () => {
  ui.seekTip.hidden = true;
  seeking = false;
});

// ---------- transport ----------
function updatePlayIcon() {
  ui.cPlay.textContent = engine.playing ? "⏸" : "▶";
}
async function startPlayback() {
  if (started) { engine.play(); return; }
  started = true;
  try {
    const mode = await engine.startReal(0);
    if (mode === "virtual") {
      toast("AUDIO UNAVAILABLE — VISUAL MODE", 2600);
    }
  } catch (e) {
    engine.mode = "virtual";
    engine.audioAvailable = false;
    engine.vtime = 0;
    engine.vplaying = true;
    toast("AUDIO UNAVAILABLE — VISUAL MODE", 2600);
  }
  ui.landing.classList.add("gone");
  curSecIdx = -1;               // force title card for section I
  updatePlayIcon();
  wakeUI();
}
function hideEndcard() {
  ui.endcard.classList.remove("show");
  setTimeout(() => { if (!ui.endcard.classList.contains("show")) ui.endcard.hidden = true; }, 1150);
}
function restart() {
  hideEndcard();
  engine.restart();
  curSecIdx = -1;
  updatePlayIcon();
  wakeUI();
}

ui.btnPlay.addEventListener("click", startPlayback);
ui.btnReplay.addEventListener("click", restart);
ui.cPlay.addEventListener("click", () => {
  if (!started) startPlayback();
  else if (engine._endedFired) restart();
  else engine.toggle();
  updatePlayIcon();
});
ui.cRestart.addEventListener("click", restart);
ui.cFull.addEventListener("click", toggleFullscreen);
engine.onEnded = () => {
  ui.endcard.hidden = false;
  requestAnimationFrame(() => ui.endcard.classList.add("show"));
  updatePlayIcon();
};

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
document.addEventListener("fullscreenchange", () => {
  ui.cFull.textContent = document.fullscreenElement ? "⤡" : "⛶";
});

// ---------- input ----------
window.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.nx = (e.clientX / W) * 2 - 1;
  mouse.ny = (e.clientY / H) * 2 - 1;
  wakeUI();
});
canvas.addEventListener("pointerdown", (e) => {
  const x = e.clientX, y = e.clientY;
  window.Scenes.spawnRipple(x, y, true);
  window.Scenes.spawnSparks(x, y, 26, Math.random() > 0.5
    ? window.Scenes.glowSprite.pink : window.Scenes.glowSprite.cyan, 320, 1.2);
  punch = Math.min(1, punch + 0.42);
  shakeBump = Math.min(1, shakeBump + 0.3);
  wakeUI();
});
window.addEventListener("wheel", (e) => {
  intensity = clamp(intensity * (e.deltaY < 0 ? 1.07 : 0.93), 0.45, 2.2);
  toast(`INTENSITY ${Math.round(intensity * 100)}%`, 900);
}, { passive: true });

const SCENE_KEYS = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6 };
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (!started && (k === " " || k === "enter")) { e.preventDefault(); startPlayback(); return; }
  switch (k) {
    case " ": e.preventDefault(); if (engine._endedFired) restart(); else engine.toggle(); updatePlayIcon(); wakeUI(); break;
    case "f": toggleFullscreen(); break;
    case "r": restart(); break;
    case "arrowright": { const w = engine._endedFired; hideEndcard(); engine.seek(engine.time + 5); if (w) engine.play(); updatePlayIcon(); wakeUI(); break; }
    case "arrowleft": { const w = engine._endedFired; hideEndcard(); engine.seek(engine.time - 5); if (w) engine.play(); updatePlayIcon(); wakeUI(); break; }
    case "m": engine.muted = !engine.muted; toast(engine.muted ? "MUTED" : "SOUND ON"); break;
    case "h":
      uiHidden = !uiHidden;
      ui.controls.classList.toggle("hidden", uiHidden);
      break;
    case "a":
      forcedScene = null;
      ui.modeLabel.textContent = "AUTO";
      toast("AUTO VISUALS");
      break;
    default:
      if (SCENE_KEYS[k] !== undefined) {
        const name = window.Scenes.NAMES[SCENE_KEYS[k]];
        if (name) {
          forcedScene = name;
          ui.modeLabel.textContent = name.toUpperCase();
          toast(`VISUAL · ${name.toUpperCase()}`);
        }
      }
  }
});

// ---------- main loop ----------
let prevTs = performance.now();

function frame(ts) {
  requestAnimationFrame(frame);
  let dt = (ts - prevTs) / 1000;
  prevTs = ts;
  dt = clamp(dt, 0.0001, 0.05);

  // perf guard: sustained slow frames -> drop resolution once
  frameEMA = frameEMA * 0.95 + dt * 1000 * 0.05;
  if (frameEMA > 34) {
    slowFrames++;
    if (slowFrames > 120 && !degraded) {
      degraded = true;
      resize();
      toast("PERFORMANCE MODE", 1800);
    }
  } else slowFrames = Math.max(0, slowFrames - 2);

  const t = engine.time;
  const secIdx = sectionIndexAt(t);
  const sec = SECS[secIdx];
  engine.update(dt, sec.id);

  // --- beat math ---
  const beatF = t * BPM / 60;
  const phase = beatF - Math.floor(beatF);
  const beatIdx = Math.floor(beatF);
  const barIdx = Math.floor(beatF / 4);
  const KICKY = {
    dawn: 0.18, ignition: 0.55, drive: 0.85, starlight: 0.10,
    convergence: 0.9, hyperdrive: 1.0, afterglow: 0.28,
  };
  const ky = KICKY[sec.id] !== undefined ? KICKY[sec.id] : 0.6;
  const beatPulse = Math.exp(-phase * 5.2) * ky;
  const kickFlash = Math.exp(-phase * 7.5) * ky;
  if (beatIdx !== lastBeatIdx) {
    lastBeatIdx = beatIdx;
    if (barIdx !== lastBarIdx) {
      lastBarIdx = barIdx;
      if (sec.id === "hyperdrive" || sec.id === "convergence") punch = Math.min(1, punch + 0.30);
      else if (sec.id === "drive") punch = Math.min(1, punch + 0.14);
    }
  }

  // --- section tracking / title cards ---
  if (secIdx !== curSecIdx) {
    const first = curSecIdx === -1;
    curSecIdx = secIdx;
    if (!first || started) showTitleCard(secIdx);
  }

  // --- scene weights ---
  const targetW = {};
  SECS.forEach((s) => { targetW[s.id] = 0; });
  if (forcedScene) {
    targetW[forcedScene] = 1;
  } else {
    for (let i = 0; i < SECS.length; i++) {
      const s = SECS[i];
      const dStart = t - s.start;
      const dEnd = s.end - t;
      targetW[s.id] = clamp(0.5 + Math.min(dStart, dEnd) / FADE, 0, 1);
    }
  }
  const wk = 1 - Math.exp(-dt * 2.4);
  for (const id in targetW) curW[id] += (targetW[id] - curW[id]) * wk;

  // --- palette ---
  const palTarget = forcedScene || sec.id;
  const S = {
    t, mt: t, dt,
    secT: t - sec.start,
    sceneId: sec.id,
    weights: curW,
    pal: window.Scenes.stepPalette(palRGB, palTarget, 1 - Math.exp(-dt * 1.8)),
    en: engine.en,
    beatPulse: beatPulse * intensity,
    kickFlash: kickFlash * intensity,
    energy: clamp(engine.en.bass * 0.55 + engine.en.mid * 0.35 + engine.en.high * 0.30, 0, 1),
    camX: cam.x, camY: cam.y,
    parX: cam.x,
    shake: 0, zoom: punch, dpr: DPR, intensity,
  };

  // camera drift
  const ck = 1 - Math.exp(-dt * 3.2);
  cam.x += (mouse.nx * 1.0 - cam.x) * ck;
  cam.y += (mouse.ny * 0.7 - cam.y) * ck;

  // shake
  const SHAKE_BASE = {
    dawn: 0.02, ignition: 0.06, drive: 0.10, starlight: 0.03,
    convergence: 0.22, hyperdrive: 0.42, afterglow: 0.04,
  };
  shakeBump *= Math.exp(-dt * 3.4);
  S.shake = ((SHAKE_BASE[sec.id] || 0.1) * (0.55 + kickFlash) + shakeBump * 0.8) * intensity;
  punch *= Math.exp(-dt * 3.6);

  window.Scenes.draw(ctx, S);

  // --- UI refresh ---
  const u = t / TL.duration;
  ui.seekFill.style.width = `${u * 100}%`;
  ui.seekKnob.style.left = `${u * 100}%`;
  ui.tCur.textContent = fmt(t);
}

// ---------- boot ----------
resize();
buildSeekMarks();
engine.vplaying = true;          // attract loop behind the landing screen
updatePlayIcon();
requestAnimationFrame(frame);

// debug/test hook
window.__ND = { engine, seek: (t) => { hideEndcard(); engine.seek(t); }, startPlayback, restart };

})();
