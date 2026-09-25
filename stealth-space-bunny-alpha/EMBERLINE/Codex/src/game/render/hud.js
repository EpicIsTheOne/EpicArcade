import { GAME, zoneForX, zoneLabel } from "../level.js";
import { COLORS, roundRect } from "./world-art.js";

function bar(ctx, x, y, width, height, ratio, fill, background = "rgba(4,5,16,.78)", stroke = "rgba(255,255,255,.18)") {
  roundRect(ctx, x, y, width, height, height / 2, background, stroke);
  const safe = Math.max(0, Math.min(1, ratio));
  if (safe > 0) roundRect(ctx, x + 2, y + 2, Math.max(height - 4, (width - 4) * safe), height - 4, (height - 4) / 2, fill);
}

function text(ctx, value, x, y, size = 12, color = COLORS.bone, weight = 800, align = "left") {
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

export function drawHud(ctx, world) {
  const player = world.player;
  drawPlayerVitals(ctx, player);
  drawProgress(ctx, player);
  drawQuestCard(ctx, world);
  drawPrompt(ctx, world);
  drawRouteState(ctx, world);
  if (world.qa) drawQaPanel(ctx, world);
}

function drawPlayerVitals(ctx, player) {
  const x = 26;
  const y = 50;
  text(ctx, "MIRA", x, y - 9, 11, COLORS.gold, 900);
  text(ctx, "LANTERN WARDEN", x + 48, y - 9, 9, "rgba(244,234,213,.58)", 800);
  bar(ctx, x, y, 236, 20, player.hp / player.maxHp, player.hp / player.maxHp < 0.3 ? COLORS.red : COLORS.ember);
  text(ctx, `${Math.ceil(player.hp)} / ${player.maxHp}`, x + 118, y + 14, 10, COLORS.bone, 900, "center");

  for (let index = 0; index < Math.max(player.energyMax + 1, 3); index += 1) {
    const chargeX = x + index * 21;
    const active = index < player.energy;
    ctx.save();
    ctx.translate(chargeX + 8, y + 37);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = active ? COLORS.cyan : "rgba(100,230,255,.13)";
    ctx.shadowColor = active ? COLORS.cyan : "transparent";
    ctx.shadowBlur = active ? 10 : 0;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }
  text(ctx, "SIGNAL", x + 70, y + 41, 8, "rgba(100,230,255,.72)", 900);
  text(ctx, `LV ${player.level}`, x + 250, y + 41, 10, COLORS.cyan, 900, "right");
}

function drawProgress(ctx, player) {
  const x = GAME.width - 242;
  const y = 23;
  roundRect(ctx, x - 8, y - 12, 234, 68, 7, "rgba(6,8,24,.54)", "rgba(255,255,255,.08)");
  text(ctx, "EMBER TRACK", x, y + 2, 9, COLORS.gold, 900);
  text(ctx, `${player.fragments}/4 FRAGMENTS`, x + 212, y + 2, 8, "rgba(244,234,213,.62)", 800, "right");
  bar(ctx, x, y + 11, 212, 9, player.fragments / 4, COLORS.cyan);
  for (let index = 0; index < 4; index += 1) {
    ctx.fillStyle = index < player.fragments ? COLORS.gold : "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.arc(x + index * 70.6 + 3, y + 35, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  text(ctx, `STARS ${player.bossesDefeated}/2`, x, y + 39, 9, COLORS.ember, 900);
  text(ctx, `CORES ${player.cores}/3`, x + 212, y + 39, 9, COLORS.ember, 900, "right");
}

function drawQuestCard(ctx, world) {
  const player = world.player;
  const boss = world.activeBoss;
  const x = 28;
  const y = GAME.height - 72;
  if (player.won) {
    text(ctx, "ROUTE COMPLETE", x, y - 1, 8, COLORS.ember, 900);
    text(ctx, "The Memory Vault is safe.", x, y + 17, 12, COLORS.bone, 850);
    text(ctx, `STARS ${player.bossesDefeated}/2   CORES ${player.cores}/3`, x, y + 33, 8, "rgba(244,234,213,.48)", 800);
    return;
  }
  roundRect(ctx, x - 10, y - 16, 260, 57, 5, "rgba(6,8,24,.56)", "rgba(255,255,255,.08)");
  text(ctx, zoneLabel(zoneForX(player.x)), x, y - 1, 8, COLORS.ember, 900);
  let objective = "Follow the Nightmail east";
  if (player.cores === 0) objective = "Rekindle the first Ember Core";
  else if (player.fragments === 0) objective = "Recover the forest sigil";
  else if (player.cores === 1) objective = "Climb the signal tower";
  else if (player.cores === 2) objective = "Charge the next Ember Core";
  else if (player.cores < 3) objective = "Recover the approach Ember Core";
  else if (!boss) objective = "Defeat the Conductor and Steam Warden";
  else if (boss.kind === "conductor") objective = `Break The Conductor · PHASE ${boss.phase}`;
  else objective = `Silence The Steam Warden · PHASE ${boss.phase}`;
  text(ctx, objective, x, y + 17, 12, COLORS.bone, 850);
  text(ctx, `XP ${String(player.experience).padStart(3, "0")}`, x, y + 33, 8, "rgba(244,234,213,.48)", 800);
}

function drawPrompt(ctx, world) {
  if (!world.interactPrompt) return;
  const { x, y, text: label } = world.interactPrompt;
  const width = 160;
  roundRect(ctx, x - width / 2, y - 18, width, 30, 5, "rgba(5,7,22,.84)", COLORS.cyan);
  text(ctx, label, x, y + 2, 10, COLORS.bone, 900, "center");
}

function drawRouteState(ctx, world) {
  if (world.bannerData && world.bannerTime > 0) {
    const alpha = Math.min(1, world.bannerTime * 1.7, (2.6 - world.bannerTime) * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const y = 130;
    ctx.fillStyle = "rgba(5,6,20,.72)";
    ctx.fillRect(0, y - 30, GAME.width, 60);
    text(ctx, world.bannerData.title, GAME.width / 2, y, 18, COLORS.gold, 950, "center");
    text(ctx, world.bannerData.subtitle, GAME.width / 2, y + 20, 10, "rgba(244,234,213,.68)", 700, "center");
    ctx.restore();
  }
  if (world.endingText) {
    ctx.save();
    ctx.fillStyle = `rgba(3,4,13,${Math.min(0.8, world.player.winTimer * 0.4)})`;
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    text(ctx, "THE EMBERLINE HOLDS", GAME.width / 2, 210, 34, COLORS.gold, 950, "center");
    text(ctx, "Every lost memory finds a way home.", GAME.width / 2, 240, 13, COLORS.bone, 700, "center");
    text(ctx, "WARDEN'S STAR  ★  ★", GAME.width / 2, 278, 16, COLORS.ember, 900, "center");
    text(ctx, "Press R to ride the route again", GAME.width / 2, 312, 10, "rgba(244,234,213,.62)", 800, "center");
    ctx.restore();
  }
}

function drawQaPanel(ctx, world) {
  const x = GAME.width - 250;
  const y = 108;
  roundRect(ctx, x, y, 224, 92, 5, "rgba(3,5,18,.78)", "rgba(100,230,255,.4)");
  text(ctx, "DETERMINISTIC QA", x + 12, y + 17, 9, COLORS.cyan, 900);
  text(ctx, `STATE ${world.qa.state}`, x + 12, y + 36, 9, COLORS.bone, 800);
  text(ctx, `CHECKPOINT ${world.qa.checkpoint}`, x + 12, y + 51, 9, COLORS.bone, 800);
  text(ctx, `ENCOUNTER ${world.qa.encounter}`, x + 12, y + 66, 9, COLORS.bone, 800);
  text(ctx, `BOSS ${world.qa.bossPhase}  ERR ${world.qa.errors.length}`, x + 12, y + 81, 9, world.qa.errors.length ? COLORS.red : COLORS.gold, 800);
}
