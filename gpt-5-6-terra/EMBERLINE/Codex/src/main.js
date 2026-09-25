import { Game } from "./game/game.js";

const canvas = document.querySelector("#game");
const titleScreen = document.querySelector("#title-screen");
const pauseScreen = document.querySelector("#pause-screen");
const routeScreen = document.querySelector("#route-screen");
const startButton = document.querySelector("#start-button");
const resumeButton = document.querySelector("#resume-button");
const restartButton = document.querySelector("#restart-button");
const continueButton = document.querySelector("#continue-button");
const touchControls = document.querySelector("#touch-controls");
const toast = document.querySelector("#toast");
const screenFlash = document.querySelector("#screen-flash");

const game = new Game(canvas);
let started = false;
let toastTimer = null;

function showToast(message, duration = 1900) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), duration);
}

function flash() {
  screenFlash.classList.remove("flash");
  void screenFlash.offsetWidth;
  screenFlash.classList.add("flash");
}

function setScreen(name) {
  titleScreen.classList.toggle("active", name === "title");
  pauseScreen.classList.toggle("active", name === "pause");
  routeScreen.classList.toggle("active", name === "route");
  touchControls.classList.toggle("playing", name === "game");
}

function startGame() {
  game.begin();
  game.start();
  started = true;
  setScreen("game");
  canvas.focus();
  showToast("THE NIGHTMAIL IS MOVING", 1800);
}

function showRoute(title, copy) {
  if (!started) return;
  game.setPaused(true);
  setScreen("route");
  document.querySelector("#route-title").textContent = title;
  document.querySelector("#route-copy").textContent = copy;
  document.querySelector("#route-stars").textContent = `${game.player.bossesDefeated} / 2`;
  document.querySelector("#route-cores").textContent = `${game.player.cores} / 3`;
  document.querySelector("#route-fragments").textContent = `${game.player.fragments} / 4`;
  game.audio.sfx("ui");
}

game.setHooks({
  death: (player) => {
    if (game.qa.enabled && game.bot) return;
    showRoute("Lantern extinguished", `The Nightmail carried you back to ${game.currentCheckpoint}. Resolve returns with the flame.`);
    showToast(`${player.experience} XP remains on the Ember Track`);
  },
  victory: (player) => {
    if (game.qa.enabled && game.bot) return;
    showRoute("The route is safe", `You recovered ${player.cores} Ember Cores and ${player.fragments} Sigil Fragments. Both Warden stars are yours.`);
  },
  title: (title, subtitle) => {
    if (started) showToast(`${title} · ${subtitle}`, 2500);
  }
});

startButton.addEventListener("click", startGame);
resumeButton.addEventListener("click", () => {
  game.setPaused(false);
  setScreen("game");
  canvas.focus();
});
restartButton.addEventListener("click", () => {
  game.reset();
  game.setPaused(false);
  setScreen("game");
  showToast("ROUTE RESTARTED", 1200);
});
continueButton.addEventListener("click", () => {
  game.player.dead = false;
  game.player.deathTimer = 0;
  game.player.won = false;
  game.player.winTimer = 0;
  game.player.hp = Math.max(1, Math.round(game.player.maxHp * 0.45));
  game.player.x = game.player.lastSafeX;
  game.player.y = 260;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.invulnerableUntil = game.simulationTime + 1200;
  game.endingText = null;
  game.setPaused(false);
  setScreen("game");
  flash();
  canvas.focus();
});

game.input.onPress((code, event) => {
  if (!started) {
    if (["Enter", "Space", "KeyJ"].includes(code)) startGame();
    return;
  }
  if ((code === "Escape" || code === "KeyP") && !document.querySelector("#route-screen").classList.contains("active")) {
    if (game.paused) {
      game.setPaused(false);
      setScreen("game");
    } else if (!game.player.dead && !game.player.won) {
      game.setPaused(true);
      setScreen("pause");
    }
  }
  if (code === "KeyM") {
    showToast(game.audio.toggleMute() ? "AUDIO MUTED" : "AUDIO ONLINE", 1000);
  }
  if (code === "KeyR" && (game.player.dead || game.player.won)) {
    game.reset();
    game.setPaused(false);
    setScreen("game");
  }
  if (game.qa.enabled && code === "Digit0") {
    game.enableBot();
    showToast("DETERMINISTIC BOT CREATED · PRESS 9 TO VERIFY", 2200);
  }
  if (game.qa.enabled && code === "Digit9" && !game.bot) {
    game.enableBot();
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) event.preventDefault();
});

const query = new URLSearchParams(location.search);
if (query.get("bot") === "1") {
  window.setTimeout(() => {
    startGame();
    game.enableBot();
  }, 120);
}

function loop(now) {
  game.frame((now - game.lastTime) / 1000, game.bot);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener("beforeunload", () => game.destroy());
window.EMBERLINE = game;
