import { GAME, zoneForX, zoneLabel } from "../level.js";

const COLORS = Object.freeze({
  ink: "#080a20",
  night: "#121735",
  violet: "#3c2c72",
  ember: "#ff9f43",
  gold: "#ffe7a3",
  cyan: "#64e6ff",
  bone: "#f4ead5",
  red: "#ff4f6d"
});

function visible(left, width = 0) {
  return left < GAME.width + 80 && left + width > -80;
}

function polygon(ctx, points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawSky(ctx, world, camera) {
  const zone = zoneForX(camera.x + GAME.width * 0.5);
  const palettes = {
    platform: ["#0b102b", "#202051", "#4b366f"],
    forest: ["#09182a", "#143749", "#3f5970"],
    tower: ["#080d27", "#24224f", "#5b3568"],
    locomotive: ["#101431", "#30254c", "#714052"],
    deck: ["#150c28", "#3a153d", "#9a344b"]
  };
  const palette = palettes[zone];
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME.height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.58, palette[1]);
  gradient.addColorStop(1, palette[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME.width, GAME.height);

  const moonX = 710 - camera.x * 0.05;
  const moonY = zone === "forest" ? 96 : 82;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 105);
  moonGlow.addColorStop(0, zone === "forest" ? "rgba(210,245,235,.36)" : "rgba(255,231,163,.25)");
  moonGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = moonGlow;
  ctx.fillRect(moonX - 110, moonY - 110, 220, 220);
  ctx.fillStyle = zone === "forest" ? "#d8eee2" : COLORS.gold;
  ctx.beginPath();
  ctx.arc(moonX, moonY, zone === "forest" ? 24 : 31, 0, Math.PI * 2);
  ctx.fill();

  drawCloudBank(ctx, camera, 70, "#2f315b", 0.55);
  drawCloudBank(ctx, camera, 155, "#191d43", 0.8);
  if (zone === "platform" || zone === "locomotive") drawRain(ctx, world.time, camera, 0.8);
  if (zone === "deck") drawLightningGlow(ctx, world.time, zone);
}

function drawCloudBank(ctx, camera, y, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const shift = (camera.x * 0.16) % 420;
  for (let index = -1; index < 4; index += 1) {
    const x = index * 420 - shift;
    ctx.beginPath();
    ctx.ellipse(x + 80, y, 190, 58, -0.08, 0, Math.PI * 2);
    ctx.ellipse(x + 230, y + 8, 130, 43, 0.05, 0, Math.PI * 2);
    ctx.ellipse(x + 330, y - 8, 180, 48, 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRain(ctx, time, camera, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(202,232,255,.48)";
  ctx.lineWidth = 1;
  for (let index = 0; index < 64; index += 1) {
    const x = (index * 97 + time * 180 - camera.x * 0.75) % (GAME.width + 80) - 40;
    const y = (index * 61 + time * 390) % (GAME.height + 80) - 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7, y + 22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLightningGlow(ctx, time, zone) {
  const pulse = Math.sin(time * 2.2) > 0.985 ? 1 : 0;
  if (!pulse) return;
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, "rgba(255,224,255,.6)");
  gradient.addColorStop(1, "rgba(255,79,109,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME.width, 300);
  polygon(ctx, [[620, 0], [575, 118], [612, 111], [548, 250], [624, 126], [585, 132]], "rgba(255,240,255,.88)");
}

export function drawFarParallax(ctx, world, camera) {
  const zone = zoneForX(camera.x + GAME.width / 2);
  ctx.save();
  if (zone === "platform" || zone === "locomotive") drawStationParallax(ctx, camera);
  else if (zone === "forest") drawForestParallax(ctx, world, camera);
  else if (zone === "tower") drawTowerParallax(ctx, camera);
  else drawLocomotiveParallax(ctx, camera);
  ctx.restore();
}

function drawStationParallax(ctx, camera) {
  const shift = camera.x * 0.28;
  ctx.fillStyle = "rgba(10,13,38,.88)";
  for (let index = -1; index < 7; index += 1) {
    const x = index * 220 - shift % 220;
    ctx.fillRect(x, 184, 150, 270);
    polygon(ctx, [[x - 10, 184], [x + 75, 142], [x + 160, 184]], "#151735");
    ctx.fillStyle = "rgba(255,184,99,.24)";
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        ctx.fillRect(x + 18 + column * 31, 220 + row * 58, 12, 22);
      }
    }
    ctx.fillStyle = "rgba(10,13,38,.88)";
  }
  const signX = 940 - camera.x * 0.18;
  ctx.fillStyle = "#0b0d25";
  ctx.fillRect(signX, 154, 150, 54);
  ctx.fillStyle = COLORS.ember;
  ctx.font = "800 18px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText("NIGHTMAIL 07", signX + 75, 186);
}

function drawForestParallax(ctx, world, camera) {
  const shift = camera.x * 0.3;
  for (let layer = 0; layer < 3; layer += 1) {
    const base = 300 + layer * 38;
    ctx.fillStyle = ["#0a1a2c", "#102b3c", "#163a45"][layer];
    for (let index = -1; index < 10; index += 1) {
      const x = index * 155 - shift * (0.6 + layer * 0.16);
      const height = 190 + ((index + 4) % 5) * 25;
      polygon(ctx, [[x, base], [x + 48, base - height], [x + 95, base]], ctx.fillStyle);
      polygon(ctx, [[x + 38, base - 70], [x + 76, base - height - 38], [x + 115, base - 64]], ctx.fillStyle);
    }
  }
  ctx.fillStyle = "rgba(124,226,255,.25)";
  for (let index = 0; index < 18; index += 1) {
    const x = ((index * 137 - camera.x * 0.42) % 1100 + 1100) % 1100 - 70;
    const y = 195 + (index * 53) % 190;
    ctx.beginPath();
    ctx.arc(x, y + Math.sin(world.time * 1.4 + index) * 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTowerParallax(ctx, camera) {
  const shift = camera.x * 0.32;
  ctx.fillStyle = "rgba(8,10,31,.9)";
  for (let index = -1; index < 7; index += 1) {
    const x = index * 245 - shift % 245;
    polygon(ctx, [[x, 468], [x + 44, 140], [x + 88, 140], [x + 132, 468]], "#11132d");
    ctx.strokeStyle = "rgba(100,230,255,.25)";
    for (let rung = 0; rung < 7; rung += 1) {
      const y = 178 + rung * 39;
      ctx.beginPath();
      ctx.moveTo(x + 46, y);
      ctx.lineTo(x + 130, y + 30);
      ctx.moveTo(x + 128, y);
      ctx.lineTo(x + 46, y + 30);
      ctx.stroke();
    }
  }
}

function drawLocomotiveParallax(ctx, camera) {
  const shift = camera.x * 0.3;
  ctx.fillStyle = "rgba(12,12,36,.9)";
  for (let index = -1; index < 6; index += 1) {
    const x = index * 310 - shift % 310;
    ctx.beginPath();
    ctx.ellipse(x + 80, 450, 210, 120, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 34, 118, 95, 300);
    ctx.fillStyle = "rgba(255,159,67,.18)";
    for (let row = 0; row < 4; row += 1) {
      ctx.fillRect(x + 55, 160 + row * 58, 52, 22);
      ctx.fillRect(x + 150, 160 + row * 58, 52, 22);
    }
    ctx.fillStyle = "rgba(12,12,36,.9)";
  }
}

export function drawWorldGeometry(ctx, world) {
  const { level } = world;
  for (const platform of level.platforms) {
    if (!visible(platform.x, platform.width)) continue;
    drawPlatform(ctx, platform, world.time, zoneForX(platform.x + platform.width / 2));
  }
  for (const vent of level.vents) {
    if (visible(vent.x, 70)) drawVent(ctx, vent, world.time);
  }
  if (!level.shrine.collected && visible(level.shrine.x, 80)) drawShrine(ctx, level.shrine, world.time);
  for (const gate of level.gates) {
    if (visible(gate.x, gate.width)) drawGate(ctx, gate, world.time);
  }
  if (level.gate && !level.gate.opened && visible(level.gate.x, level.gate.width)) drawGate(ctx, { ...level.gate, locked: true }, world.time);
  for (const pickup of level.pickups) {
    if (!pickup.collected && visible(pickup.x - 30, 60)) drawPickup(ctx, pickup, world.time);
  }
}

function drawPlatform(ctx, platform, time, zone) {
  const fill = platform.style === "wood" ? "#593847" : platform.style === "forest" ? "#183746" : platform.style === "locomotive" ? "#4b263c" : "#25294d";
  ctx.fillStyle = fill;
  ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(platform.x, platform.y, platform.width, 3);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  for (let x = platform.x + 16; x < platform.x + platform.width; x += 42) {
    ctx.fillRect(x, platform.y + 9, 2, platform.height - 9);
  }
  if (platform.style === "rails" || platform.style === "locomotive") {
    ctx.fillStyle = "rgba(212,226,222,.36)";
    ctx.fillRect(platform.x, platform.y + 26, platform.width, 4);
    ctx.fillStyle = "rgba(212,226,222,.2)";
    ctx.fillRect(platform.x, platform.y + 51, platform.width, 4);
  }
  if (platform.style === "wood") {
    ctx.strokeStyle = "rgba(255,194,122,.18)";
    ctx.beginPath();
    ctx.moveTo(platform.x, platform.y + 6);
    ctx.lineTo(platform.x + platform.width, platform.y + 6 + Math.sin(time * 2 + platform.x) * 0.5);
    ctx.stroke();
  }
  if (zone === "tower" && platform.y < 400) {
    ctx.fillStyle = "rgba(100,230,255,.26)";
    ctx.beginPath();
    ctx.arc(platform.x + platform.width - 6, platform.y + 2, 3 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGate(ctx, gate, time) {
  const x = gate.x;
  const y = GAME.floor - gate.height;
  const active = gate.locked || (!gate.opened && !gate.defeated);
  const color = active ? COLORS.red : COLORS.cyan;
  ctx.save();
  ctx.globalAlpha = active ? 0.9 : 0.4;
  roundRect(ctx, x, y, gate.width, gate.height, 8, "rgba(8,10,32,.76)", color);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let index = 0; index < 5; index += 1) {
    const offset = ((time * 90 + index * 34) % 90) - 10;
    ctx.beginPath();
    ctx.moveTo(x, y + offset);
    ctx.lineTo(x + gate.width, y + offset);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickup(ctx, pickup, time) {
  const x = pickup.x;
  const y = pickup.y + Math.sin(time * 2.4 + pickup.x) * 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * (pickup.type === "core" ? 0.8 : 1.3));
  if (pickup.type === "core") {
    ctx.shadowColor = COLORS.ember;
    ctx.shadowBlur = 22;
    polygon(ctx, [[0, -18], [14, 0], [0, 18], [-14, 0]], COLORS.ember, COLORS.gold, 2);
    polygon(ctx, [[0, -8], [6, 0], [0, 8], [-6, 0]], COLORS.gold);
  } else {
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 18;
    polygon(ctx, [[0, -14], [12, 0], [0, 14], [-12, 0]], COLORS.cyan, "#d9fbff", 1.5);
  }
  ctx.restore();
}

function drawShrine(ctx, shrine, time) {
  const { x, y } = shrine;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#101a36";
  ctx.fillRect(-34, -28, 68, 28);
  polygon(ctx, [[-42, -28], [0, -70], [42, -28]], "#1c2850", "rgba(100,230,255,.5)");
  const pulse = 0.6 + Math.sin(time * 3) * 0.2;
  ctx.globalAlpha = pulse;
  polygon(ctx, [[0, -52], [11, -34], [0, -18], [-11, -34]], COLORS.cyan, COLORS.gold, 2);
  ctx.restore();
}

function drawVent(ctx, vent, time) {
  ctx.save();
  ctx.translate(vent.x, GAME.floor);
  ctx.fillStyle = "#12152e";
  ctx.fillRect(-26, -12, 52, 12);
  ctx.strokeStyle = vent.active ? "#d4f7ff" : "#41476b";
  ctx.lineWidth = 2;
  for (let index = -1; index <= 1; index += 1) {
    ctx.beginPath();
    ctx.moveTo(index * 13, -7);
    ctx.lineTo(index * 13, 0);
    ctx.stroke();
  }
  if (vent.active) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#d4f7ff";
    ctx.beginPath();
    ctx.moveTo(-24, -10);
    ctx.quadraticCurveTo(-14 + Math.sin(time * 10) * 5, -62, 0, -92);
    ctx.quadraticCurveTo(14 + Math.cos(time * 9) * 5, -62, 24, -10);
    ctx.fill();
  }
  ctx.restore();
}

export function drawForeground(ctx, world) {
  const level = world.level;
  ctx.fillStyle = "rgba(3,4,13,.7)";
  for (let index = 0; index < 26; index += 1) {
    const x = ((index * 241 - world.camera.x * 0.88) % (GAME.width + 80) + GAME.width + 80) % (GAME.width + 80) - 40;
    const height = 50 + (index * 37) % 100;
    polygon(ctx, [[x, GAME.height + 10], [x + 8, GAME.height - height], [x + 17, GAME.height - height + 20], [x + 23, GAME.height + 10]], "rgba(3,4,13,.7)");
  }
}

export function drawZoneTitle(ctx, world) {
  const zone = zoneForX(world.camera.x + GAME.width * 0.5);
  const title = zoneLabel(zone);
  ctx.save();
  ctx.globalAlpha = 0.64;
  ctx.fillStyle = COLORS.bone;
  ctx.font = "900 12px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.fillText(title, 28, 30);
  ctx.fillStyle = COLORS.ember;
  ctx.fillRect(28, 38, 108, 2);
  ctx.restore();
}

export { COLORS, polygon, roundRect, visible };
