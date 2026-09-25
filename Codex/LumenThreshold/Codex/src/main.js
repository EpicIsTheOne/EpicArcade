import { BEAT, FINISH_X, FIXED_STEP, PALETTE, WORLD_SPEED } from "./constants.js";
import { LEVEL, SECTIONS, formatTimelineTime, getSectionAtBeat } from "./level.js";
import { Physics } from "./physics.js";
import { Renderer } from "./renderer.js";
import { createMusicEngine } from "./song.js";
import { loadProgress, loadSettings, resetProgress, saveProgress, saveSettings } from "./storage.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const overlay = $("overlay");
const pauseCard = $("pause-card");
const completionCard = $("completion-card");
const practiceDrawer = $("practice-drawer");
const settingsDrawer = $("settings-drawer");
const touchControls = $("touch-controls");
const liveRegion = $("live-region");

const physics = new Physics();
const renderer = new Renderer(canvas);
const music = createMusicEngine();
let settings = loadSettings();
let progress = loadProgress();
let state = "title";
let checkpoint = 0;
let startBeat = 0;
let startWallTime = 0;
let accumulator = 0;
let lastFrameTime = performance.now();
let frameCount = 0;
let lastFpsSample = performance.now();
let fps = 60;
let lastDeathBeat = -1;
let lastCheckpointBeat = 0;
let completedThisRun = false;
let autopilot = false;
let autopilotIndex = 0;
let attemptCounted = false;
let held = false;
let toastTimer = 0;
let lastPersistTime = 0;
let uiState = {};

function setOverlay(element, visible) {
  if (element) element.hidden = !visible;
}

function announce(message) {
  liveRegion.textContent = "";
  requestAnimationFrame(() => { liveRegion.textContent = message; });
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function applySettings(next = {}) {
  settings = saveSettings({ ...settings, ...next });
  music.applySettings(settings);
  renderer.setSettings(settings);
  $("volume-slider").value = settings.volume;
  $("motion-toggle").checked = settings.reducedMotion;
  $("contrast-toggle").checked = settings.highContrast;
  $("touch-toggle").checked = settings.showTouchControls;
  $("audio-status").textContent = settings.muted ? "OFF" : "ON";
  touchControls.hidden = !settings.showTouchControls || state === "title";
}

function updateProgressUi() {
  $("run-status").textContent = state === "title" ? "READY" : state === "dead" ? "RETRY" : state === "complete" ? "CLEAR" : "LIVE";
  if (physics.player) uiState = { ...uiState, attempts: progress.attempts, deaths: progress.deaths, practice: state === "practice" };
}

function buildPracticeList() {
  const list = $("checkpoint-list");
  list.replaceChildren();
  SECTIONS.forEach((section) => {
    const button = document.createElement("button");
    button.className = "checkpoint-button";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = section.title;
    const subtitle = document.createElement("small");
    subtitle.textContent = `${formatTimelineTime(section.startBeat)} · ${section.subtitle}`;
    const status = document.createElement("em");
    status.textContent = progress.practiceBest[section.id] == null ? "NEW" : `${Math.round(progress.practiceBest[section.id])}%`;
    copy.append(title, subtitle);
    button.append(copy, status);
    button.addEventListener("click", () => {
      practiceDrawer.hidden = true;
      startRun(section.startBeat, true);
    });
    list.append(button);
  });
}

function setState(next) {
  state = next;
  setOverlay(overlay, next === "title");
  setOverlay(pauseCard, next === "paused");
  setOverlay(completionCard, next === "complete");
  touchControls.hidden = !settings.showTouchControls || next === "title" || next === "complete";
  updateProgressUi();
}

function currentCollectedIds() {
  return physics.collectibles.filter((mote) => mote.collected).map((mote) => mote.id);
}

function persistRunProgress(extra = {}) {
  const now = performance.now();
  if (!Object.keys(extra).length && now - lastPersistTime < 180) return;
  lastPersistTime = now;
  const fraction = physics.progress();
  const bestProgress = Math.max(progress.bestProgress ?? 0, fraction);
  const bestProgressBeat = Math.max(progress.bestProgressBeat ?? 0, physics.beat());
  const practiceBest = { ...(progress.practiceBest ?? {}) };
  if (state === "practice") practiceBest[getSectionAtBeat(physics.beat()).id] = Math.max(practiceBest[getSectionAtBeat(physics.beat()).id] ?? 0, fraction);
  const countAttempt = extra.countAttempt && !attemptCounted;
  if (countAttempt) attemptCounted = true;
  progress = saveProgress({
    bestProgress,
    bestProgressBeat,
    attempts: progress.attempts + (countAttempt ? 1 : 0),
    deaths: progress.deaths + (extra.countDeath ? 1 : 0),
    completes: progress.completes + (extra.complete ? 1 : 0),
    collectibles: Array.from(new Set([...(progress.collectibles ?? []), ...currentCollectedIds()])),
    practiceBest
  });
  updateProgressUi();
}

async function startRun(beat = 0, practice = false) {
  startBeat = beat;
  checkpoint = beat;
  lastCheckpointBeat = beat;
  state = practice ? "practice" : "full";
  completedThisRun = false;
  autopilot = false;
  autopilotIndex = 0;
  held = false;
  lastDeathBeat = -1;
  attemptCounted = false;
  lastPersistTime = 0;
  accumulator = 0;
  physics.reset(beat, { restoreCollected: new Set(progress.collectibles ?? []) });
  await music.startMusic(beat, beat);
  startWallTime = performance.now();
  setState(state);
  if (!practice) {
    progress = saveProgress({ attempts: progress.attempts + 1 });
    attemptCounted = true;
    updateProgressUi();
  }
  announce(`${practice ? "Practice" : "Relay"} started at ${getSectionAtBeat(beat).title}.`);
}

async function restartRun() {
  await startRun(startBeat, state === "practice");
}

async function enterFullRun() {
  await startRun(0, false);
}

function setAutopilot(next) {
  autopilot = next;
  autopilotIndex = 0;
  if (next) announce("Autopilot rehearsal enabled.");
}

function handlePress() {
  if (state === "title") { enterFullRun(); return; }
  if (state === "paused") { setState(startBeat ? "practice" : "full"); music.ensure(); return; }
  if (state !== "full" && state !== "practice") return;
  const beat = physics.beat();
  const accepted = physics.press(beat, autopilot);
  if (accepted) {
    music.triggerBeatFeedback(beat);
    renderer.burst(physics.player.x, physics.player.y, PALETTE.cream, 5, 110);
  }
}

function handleRelease() {
  held = false;
  physics.setHold(false);
}

function handleKeyDown(event) {
  if (["Space", "ArrowUp", "KeyW", "KeyX"].includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    held = true;
    if (state === "full" || state === "practice") physics.setHold(true);
    handlePress();
  }
  if (event.code === "KeyP" && ["full", "practice", "paused"].includes(state)) {
    event.preventDefault();
    if (state === "paused") { setState(startBeat ? "practice" : "full"); music.ensure(); }
    else { setState("paused"); music.stopMusic(); }
  }
  if (event.code === "KeyR" && ["full", "practice", "dead", "paused"].includes(state)) restartRun();
  if (event.code === "Escape" && !["title", "complete"].includes(state)) {
    if (state === "paused") { setState(startBeat ? "practice" : "full"); music.ensure(); }
    else { setState("paused"); music.stopMusic(); }
  }
}

function handleKeyUp(event) {
  if (["Space", "ArrowUp", "KeyW", "KeyX"].includes(event.code)) {
    event.preventDefault();
    handleRelease();
  }
}

function bindUi() {
  $("play-button").addEventListener("click", enterFullRun);
  $("practice-button").addEventListener("click", () => { buildPracticeList(); practiceDrawer.hidden = false; });
  $("practice-close").addEventListener("click", () => { practiceDrawer.hidden = true; });
  $("settings-button").addEventListener("click", () => { settingsDrawer.hidden = false; });
  $("settings-close").addEventListener("click", () => { settingsDrawer.hidden = true; });
  $("pause-button").addEventListener("click", () => {
    if (state === "paused") { setState(startBeat ? "practice" : "full"); music.ensure(); }
    else if (state === "full" || state === "practice") { setState("paused"); music.stopMusic(); }
  });
  $("audio-button").addEventListener("click", () => applySettings({ muted: !settings.muted }));
  $("resume-button").addEventListener("click", () => { setState(startBeat ? "practice" : "full"); music.ensure(); });
  $("restart-button").addEventListener("click", restartRun);
  $("quit-button").addEventListener("click", () => { music.stopMusic(); setState("title"); });
  $("again-button").addEventListener("click", enterFullRun);
  $("title-button").addEventListener("click", () => { music.stopMusic(); setState("title"); });
  $("volume-slider").addEventListener("input", (event) => applySettings({ volume: Number(event.target.value) }));
  $("motion-toggle").addEventListener("change", (event) => applySettings({ reducedMotion: event.target.checked }));
  $("contrast-toggle").addEventListener("change", (event) => applySettings({ highContrast: event.target.checked }));
  $("touch-toggle").addEventListener("change", (event) => applySettings({ showTouchControls: event.target.checked }));
  $("reset-progress").addEventListener("click", () => { progress = resetProgress(); buildPracticeList(); announce("Local progress reset."); });
  touchControls.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); if (action === "hold") { held = true; physics.setHold(true); } else handlePress(); });
    button.addEventListener("pointerup", (event) => { event.preventDefault(); if (action === "hold") handleRelease(); });
    button.addEventListener("pointercancel", handleRelease);
  });
  canvas.addEventListener("pointerdown", (event) => { if (event.pointerType === "mouse") handlePress(); });
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp, { passive: false });
  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("blur", () => { if (state === "full" || state === "practice") { setState("paused"); music.stopMusic(); } });
}

function updateAutopilot() {
  if (!autopilot || state !== "full") return;
  while (autopilotIndex < LEVEL.autopilot.length) {
    const action = LEVEL.autopilot[autopilotIndex];
    if (action.action === "press" && physics.beat() >= action.beat) {
      physics.press(action.beat, true);
      autopilotIndex += 1;
      continue;
    }
    if (action.action === "hold") {
      if (physics.beat() >= action.endBeat) { physics.setHold(false); autopilotIndex += 1; }
      else if (physics.beat() >= action.beat) { physics.setHold(true); return; }
    }
    break;
  }
}

function showToast(message) {
  const toast = $("checkpoint-toast");
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove("show"); setTimeout(() => { toast.hidden = true; }, 250); }, 1200);
}

function updateCheckpoints() {
  const beat = physics.beat();
  for (const checkpointData of LEVEL.checkpoints) {
    if (checkpointData.beat > startBeat && beat >= checkpointData.beat && lastCheckpointBeat < checkpointData.beat) {
      lastCheckpointBeat = checkpointData.beat;
      checkpoint = checkpointData.beat;
      showToast(`CHECKPOINT // ${checkpointData.title.toUpperCase()}`);
      music.chime(0.12);
    }
  }
}

function die() {
  if (state !== "full" && state !== "practice") return;
  const fraction = physics.progress();
  const currentSection = getSectionAtBeat(physics.beat());
  state = "dead";
  music.stopMusic();
  music.impact();
  renderer.shake = 9;
  renderer.burst(physics.player.x, physics.player.y, PALETTE.coral, 28, 230);
  persistRunProgress({ countDeath: true });
  showToast(`${currentSection.title.toUpperCase()} // ${Math.round(fraction * 100)}%`);
  announce(`Attempt failed in ${currentSection.title}. Retry is ready.`);
  setState("dead");
  setTimeout(() => { if (state === "dead") restartRun(); }, 300);
}

function complete() {
  if (completedThisRun || state === "complete") return;
  completedThisRun = true;
  music.stopMusic();
  const elapsed = (performance.now() - startWallTime) / 1000;
  const countAttempt = !attemptCounted;
  if (countAttempt) attemptCounted = true;
  progress = saveProgress({ attempts: progress.attempts + (countAttempt ? 1 : 0), bestTimeMs: progress.bestTimeMs == null ? Math.round(elapsed * 1000) : Math.min(progress.bestTimeMs, Math.round(elapsed * 1000)), completes: progress.completes + 1, bestProgress: 1, bestProgressBeat: 316, collectibles: Array.from(new Set([...(progress.collectibles ?? []), ...currentCollectedIds()])) });
  $("completion-time").textContent = formatClock(elapsed);
  $("completion-attempts").textContent = String(Math.max(1, progress.attempts)).padStart(2, "0");
  $("completion-motes").textContent = `${currentCollectedIds().length}/${LEVEL.collectibles.length}`;
  const displayAttempts = Math.max(1, progress.attempts);
  $("completion-copy").textContent = displayAttempts === 1 ? "A first-contact clean line through the living score." : `${displayAttempts} attempts shaped the path. The spark is still bright.`;
  setState("complete");
  announce("Relay complete. You carried Astra through the threshold.");
}

function stepFrame(dt) {
  if (state !== "full" && state !== "practice") return;
  const beforeBeat = physics.beat();
  const beforeX = physics.player.x;
  physics.update(dt, beforeBeat);
  if (autopilot) updateAutopilot();
  if (physics.player.action === "dead") { die(); return; }
  const maxThisStep = WORLD_SPEED * dt;
  if (physics.player.x - beforeX > maxThisStep * 1.25) {
    die();
    return;
  }
  updateCheckpoints();
  persistRunProgress();
  if (physics.player.x >= FINISH_X) complete();
}

function loop(now) {
  const frameDelta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  frameCount += 1;
  if (now - lastFpsSample > 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastFpsSample));
    frameCount = 0;
    lastFpsSample = now;
  }
  if (state === "full" || state === "practice") {
    accumulator += frameDelta;
    while (accumulator >= FIXED_STEP) {
      stepFrame(FIXED_STEP);
      accumulator -= FIXED_STEP;
      if (state !== "full" && state !== "practice") break;
    }
  } else {
    physics.lastBeat = physics.lastBeat || 0;
  }
  if (physics.player) {
    uiState = { ...uiState, attempts: progress.attempts, deaths: progress.deaths, practice: state === "practice", showTouchControls: settings.showTouchControls };
    renderer.render(physics, uiState, now);
  }
  requestAnimationFrame(loop);
}

music.onGameBeat = () => {};

window.__LUMEN_DEBUG__ = {
  get state() { return state; },
  get progress() { return progress; },
  get beat() { return physics.beat(); },
  get player() { return physics.player; },
  get fps() { return fps; },
  get audioContext() { return music.context?.state ?? "uninitialized"; },
  get audioEvents() { return music.sourceEvents?.length ?? 0; },
  setAutopilot,
  startRun,
  restartRun,
  enterFullRun,
  press: handlePress,
  hold: (value) => { held = value; physics.setHold(value); },
  step: (steps = 1) => { for (let index = 0; index < steps; index += 1) stepFrame(FIXED_STEP); },
  die,
  complete,
  resetProgress: () => { progress = resetProgress(); },
  snapshot: () => JSON.parse(JSON.stringify({ state, progress, beat: physics.beat(), player: physics.player, mode: physics.mode })),
  levels: LEVEL
};

applySettings();
physics.reset(0);
setState("title");
bindUi();
requestAnimationFrame(loop);
