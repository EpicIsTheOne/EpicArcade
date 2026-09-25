import { CEILING_Y, FINISH_X, FLOOR_Y, PALETTE, PLAYER_SCREEN_X, PLAYER_RADIUS, WORLD_SPEED } from "./constants.js";
import { LEVEL, SECTIONS, getSectionAtBeat } from "./level.js";
import { Physics } from "./physics.js";

const WIDTH = 1280;
const HEIGHT = 720;
const THEME_COLORS = {
  garden: ["#1b2040", "#315a5a", "#f5c35a", "#f27d68"],
  fracture: ["#27162e", "#4b1d45", "#f06478", "#ffb44f"],
  drift: ["#142c4a", "#2b6374", "#77e0cf", "#a6e8f1"],
  orbit: ["#101633", "#392968", "#9c7be7", "#67d8ce"],
  supernova: ["#351127", "#681b3b", "#ff7e5f", "#ffd166"],
  dawn: ["#37244b", "#d36a75", "#f8c56b", "#fff0c7"]
};

function color(name, alpha = 1) {
  const hex = PALETTE[name] ?? name;
  if (hex.startsWith("hsl")) return `hsla(${hex.slice(4, -1)},${alpha})`;
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function star(ctx, x, y, outer, inner, points = 4, rotation = 0) {
  ctx.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = rotation - Math.PI / 2 + (index * Math.PI) / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function worldX(playerX, value) {
  return value - playerX + PLAYER_SCREEN_X;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.resize();
    this.particles = [];
    this.trails = [];
    this.shake = 0;
    this.flash = 0;
    this.lastTime = performance.now();
    this.lastDt = 0;
    this.lastBeatIndex = -1;
    this.settings = { reducedMotion: false, highContrast: false };
  }

  resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = WIDTH * ratio;
    this.canvas.height = HEIGHT * ratio;
    this.canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  render(physics, uiState, now = performance.now()) {
    const dt = Math.min(0.034, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (!physics.player) return;
    const player = physics.player;
    const beat = physics.beat();
    const beatIndex = Math.floor(beat);
    if (beatIndex !== this.lastBeatIndex) {
      this.lastBeatIndex = beatIndex;
      this.burst(player.x, player.y, physics.mode === "fracture" ? "coral" : "saffron", 4, 80);
      this.flash = Math.max(this.flash, 0.06);
    }
    if (player.actionFlash > 0.8) this.burst(player.x, player.y, physics.mode === "drift" ? "teal" : "cream", 9, 160);
    this.updateParticles(dt, player);
    this.draw(physics, uiState, beat);
  }

  draw(physics, uiState, beat) {
    const ctx = this.ctx;
    const player = physics.player;
    const section = getSectionAtBeat(beat);
    const theme = THEME_COLORS[section.theme ?? "garden"] ?? THEME_COLORS.garden;
    const motionScale = this.settings.reducedMotion ? 0.35 : 1;
    const beatPulse = Math.pow(1 - (beat % 1), 3);
    this.shake = Math.max(0, this.shake - this.lastDt * 5);
    this.flash = Math.max(0, this.flash - this.lastDt * 4);
    ctx.save();
    if (this.shake > 0 && !this.settings.reducedMotion) ctx.translate(Math.sin(this.lastTime * 0.04) * this.shake, Math.cos(this.lastTime * 0.05) * this.shake * 0.55);
    this.drawSky(ctx, section.id, beat, theme, beatPulse, motionScale);
    this.drawFarLayer(ctx, player.x, section.id, beat, theme, motionScale);
    this.drawSurfaces(ctx, player.x, physics.mode);
    this.drawDecor(ctx, player.x, beat);
    this.drawHazards(ctx, player.x, beat);
    this.drawCollectibles(ctx, player.x, beat, physics);
    this.drawFinish(ctx, player.x, beat);
    this.drawTrail(ctx, player, physics.mode);
    this.drawPlayer(ctx, player, physics.mode, beat);
    this.drawParticles(ctx);
    this.drawVignette(ctx, theme, physics.mode, beatPulse);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 247, 214, ${this.flash * 0.24})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.restore();
    this.drawHud(ctx, physics, uiState, beat, section, theme);
  }

  drawSky(ctx, sectionId, beat, theme, pulse, motionScale) {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, theme[0]);
    gradient.addColorStop(0.52, theme[1]);
    gradient.addColorStop(1, "#11152a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const starShift = beat * (this.settings.reducedMotion ? 0 : 4) * motionScale;
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (let index = 0; index < 42; index += 1) {
      const x = (index * 151 + 40 - starShift) % (WIDTH + 80) - 40;
      const y = 45 + (index * 71) % 390;
      const size = 1 + (index % 4) * 0.55 + pulse * (index % 5 === 0 ? 1.8 : 0);
      ctx.fillStyle = index % 4 === 0 ? theme[2] : "#f7edcf";
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const moonX = 1000 + Math.sin(beat * 0.04) * 28 * motionScale;
    const moonY = 130 + Math.cos(beat * 0.026) * 12 * motionScale;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.shadowColor = theme[2];
    ctx.shadowBlur = 34;
    ctx.fillStyle = theme[2];
    star(ctx, moonX, moonY, 43 + pulse * 5, 17 + pulse * 2, 8, beat * 0.035);
    ctx.fill();
    ctx.restore();
    if (sectionId === "fracture") {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = "#f7edcf";
      ctx.lineWidth = 2;
      for (let index = -2; index < 9; index += 1) {
        const x = index * 190 - (beat * 8 * motionScale) % 190;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 360, HEIGHT);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (sectionId === "supernova") {
      const rays = 14;
      ctx.save();
      ctx.globalAlpha = 0.13 + pulse * 0.08;
      ctx.strokeStyle = "#ffb44f";
      ctx.lineWidth = 3;
      for (let index = 0; index < rays; index += 1) {
        const angle = (index / rays) * Math.PI * 2 + beat * 0.03;
        ctx.beginPath();
        ctx.moveTo(1100 + Math.cos(angle) * 70, 180 + Math.sin(angle) * 70);
        ctx.lineTo(1100 + Math.cos(angle) * (420 + pulse * 90), 180 + Math.sin(angle) * (420 + pulse * 90));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawFarLayer(ctx, playerX, sectionId, beat, theme, motionScale) {
    ctx.save();
    const parallax = this.settings.reducedMotion ? 0.16 : 0.32;
    const shift = playerX * parallax;
    if (sectionId === "intro" || sectionId === "bloom" || sectionId === "outro") {
      for (let index = -1; index < 8; index += 1) {
        const x = index * 235 - (shift % 235);
        const y = 430 + Math.sin(index * 1.7) * 34;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = theme[1];
        ctx.beginPath();
        ctx.moveTo(x, 720);
        ctx.lineTo(x + 110, y);
        ctx.lineTo(x + 220, 720);
        ctx.fill();
      }
    } else if (sectionId === "orbit") {
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = theme[2];
      ctx.lineWidth = 2;
      for (let index = 0; index < 5; index += 1) {
        ctx.beginPath();
        ctx.ellipse(640 - (shift % 180), 365, 200 + index * 85, 70 + index * 24, -0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      for (let index = -1; index < 8; index += 1) {
        const x = index * 170 - (shift % 170);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = theme[1];
        ctx.fillRect(x, 250 + (index % 3) * 45, 130, 470);
        ctx.fillStyle = theme[2];
        ctx.fillRect(x + 18, 280 + (index % 3) * 45, 8, 280);
      }
    }
    ctx.restore();
  }

  drawSurfaces(ctx, playerX, mode) {
    for (const surface of LEVEL.surfaces) {
      const x = worldX(playerX, surface.startX);
      const width = surface.endX - surface.startX;
      if (x + width < -50 || x > WIDTH + 50) continue;
      const top = surface.ceiling ? surface.y : surface.y;
      const height = surface.ceiling ? 40 : surface.height;
      ctx.save();
      ctx.fillStyle = surface.theme === "orbit" ? "#2b254e" : "#171b36";
      ctx.fillRect(x, top, width, height);
      ctx.fillStyle = surface.theme === "cloud" ? "#b8e5dc" : surface.theme === "orbit" ? "#d3b3ff" : "#6b4f63";
      ctx.fillRect(x, top, width, 7);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = surface.theme === "orbit" ? "#a6e8f1" : "#f4bd55";
      for (let marker = x + 14; marker < x + width; marker += 42) ctx.fillRect(marker, top + 15, 3, 4);
      ctx.restore();
    }
    if (mode === "drift") {
      const lower = worldX(playerX, 0);
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = "#8fe4d7";
      ctx.lineWidth = 2;
      for (let row = 0; row < 4; row += 1) {
        const y = 200 + row * 78;
        ctx.beginPath();
        ctx.moveTo(lower, y);
        ctx.bezierCurveTo(lower + 260, y - 35, lower + 520, y + 35, lower + 780, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawDecor(ctx, playerX, beat) {
    for (const item of LEVEL.decor) {
      const x = worldX(playerX, item.x);
      if (x < -100 || x > WIDTH + 100) continue;
      const bob = this.settings.reducedMotion ? 0 : Math.sin(beat * 2.2 + item.x * 0.01) * 10;
      const y = item.y + bob;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(item.scale, item.scale);
      if (item.kind === "orbit") {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#a6e8f1";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 22, beat * 0.2, beat * 0.2 + Math.PI * 1.5);
        ctx.stroke();
      } else if (item.kind === "supernova" || item.kind === "dawn") {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = item.kind === "dawn" ? "#fff4d6" : "#ffb44f";
        star(ctx, 0, 0, 10, 4, 4, beat * 0.1);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = item.kind === "ribbon" ? "#77e0cf" : item.kind === "bell" ? "#f06f68" : "#f4bd55";
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 18, beat * 0.02 + item.x * 0.001, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawHazards(ctx, playerX, beat) {
    for (const hazard of LEVEL.hazards) {
      const x = worldX(playerX, hazard.x);
      if (x < -70 || x > WIDTH + 70) continue;
      const pulse = 1 + Math.sin(beat * Math.PI * 2 + hazard.beat) * 0.05;
      const palette = THEME_COLORS[PHYSICS_SECTION_THEME(hazard.beat)] ?? THEME_COLORS.garden;
      ctx.save();
      ctx.translate(x, hazard.y);
      ctx.scale(pulse, pulse);
      if (hazard.type === "spike") {
        ctx.fillStyle = hazard.color === "coral" ? palette[2] : palette[2];
        ctx.beginPath();
        ctx.moveTo(-hazard.radius, hazard.radius * 0.8);
        ctx.lineTo(0, -hazard.radius * 1.25);
        ctx.lineTo(hazard.radius, hazard.radius * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fff4d6";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = hazard.color === "violet" ? palette[2] : hazard.color === "saffron" ? palette[2] : palette[2];
        ctx.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = index * Math.PI / 3 + beat * 0.15;
          const px = Math.cos(angle) * hazard.radius;
          const py = Math.sin(angle) * hazard.radius;
          if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fff4d6";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawCollectibles(ctx, playerX, beat, physics) {
    for (const mote of physics.collectibles) {
      if (mote.collected) continue;
      const x = worldX(playerX, mote.x);
      if (x < -50 || x > WIDTH + 50) continue;
      ctx.save();
      ctx.translate(x, mote.y + Math.sin(beat * 3 + mote.beat) * 7);
      ctx.rotate(beat * 0.9 + mote.beat);
      ctx.shadowColor = mote.kind === "ember" ? "#ffb44f" : "#77e0cf";
      ctx.shadowBlur = 18;
      ctx.fillStyle = mote.kind === "ember" ? "#ffb44f" : "#a6e8f1";
      star(ctx, 0, 0, mote.radius, mote.radius * 0.42, 4, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFinish(ctx, playerX, beat) {
    const x = worldX(playerX, FINISH_X);
    if (x > WIDTH + 120) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#fff4d6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, CEILING_Y + 20);
    ctx.lineTo(x, FLOOR_Y);
    ctx.stroke();
    ctx.fillStyle = "#f4bd55";
    ctx.font = "700 15px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RELAY", x, CEILING_Y + 6);
    ctx.restore();
  }

  drawTrail(ctx, player, mode) {
    if (mode === "orbit" || mode === "intro" || mode === "outro") return;
    ctx.save();
    const colors = mode === "drift" ? ["#77e0cf", "#a6e8f1"] : mode === "fracture" ? ["#f06f68", "#f4bd55"] : ["#f4bd55", "#fff4d6"];
    for (let index = 0; index < 7; index += 1) {
      const alpha = 0.2 - index * 0.02;
      ctx.fillStyle = index % 2 ? colors[0] : colors[1];
      ctx.globalAlpha = Math.max(0, alpha);
      star(ctx, PLAYER_SCREEN_X - 24 - index * 13, player.y + (index % 2) * 5, 13 - index, 5 - index * 0.4, 4, index * 0.2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPlayer(ctx, player, mode, beat) {
    const x = PLAYER_SCREEN_X;
    const y = player.action === "dead" ? player.y - 10 : player.y;
    const squash = 1 + player.actionFlash * 0.18;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / squash, squash);
    if (mode === "drift") ctx.rotate(Math.sin(beat * 0.4) * 0.12);
    if (mode === "orbit") ctx.rotate((player.laneFrom === "upper" && player.laneTo === "lower" ? -1 : 1) * (1 - player.laneT) * 0.7);
    if (player.action === "dead") ctx.rotate((player.age * 7) % (Math.PI * 2));
    ctx.shadowColor = mode === "fracture" ? "#f06f68" : mode === "drift" ? "#77e0cf" : mode === "orbit" ? "#a6e8f1" : "#f4bd55";
    ctx.shadowBlur = 20;
    ctx.fillStyle = player.action === "dead" ? "#f06f68" : "#fff4d6";
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.bezierCurveTo(13, -24, 21, -12, 22, 2);
    ctx.lineTo(12, 23);
    ctx.lineTo(0, 15);
    ctx.lineTo(-12, 23);
    ctx.lineTo(-22, 2);
    ctx.bezierCurveTo(-21, -12, -13, -24, 0, -25);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#15172b";
    ctx.beginPath();
    ctx.arc(-7, -6, 3.2, 0, Math.PI * 2);
    ctx.arc(7, -6, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#15172b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 1, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (mode === "drift") {
      ctx.strokeStyle = "#a6e8f1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-23, 4);
      ctx.lineTo(-42, -7);
      ctx.moveTo(23, 4);
      ctx.lineTo(42, -7);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawVignette(ctx, theme, mode, pulse) {
    const gradient = ctx.createRadialGradient(640, 330, 180, 640, 360, 700);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, mode === "supernova" ? `rgba(40,7,24,${0.6 + pulse * 0.05})` : "rgba(4,6,18,0.48)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (this.settings.highContrast) {
      ctx.fillStyle = "rgba(8,10,25,0.12)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  drawHud(ctx, physics, uiState, beat, section, theme) {
    const progress = physics.progress();
    ctx.save();
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#fff4d6";
    ctx.textAlign = "left";
    ctx.fillText("LUMEN THRESHOLD", 28, 30);
    ctx.font = "500 12px Trebuchet MS, sans-serif";
    ctx.fillStyle = "rgba(255,244,214,0.72)";
    ctx.fillText("ASTER RELAY // ASTRA'S PATH", 28, 50);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff4d6";
    ctx.fillText(`${Math.round(progress * 100)}%`, 1250, 30);
    ctx.fillStyle = "rgba(255,244,214,0.72)";
    ctx.fillText(`ATTEMPTS ${uiState.attempts}  ·  DEATHS ${uiState.deaths}`, 1250, 50);
    roundedRect(ctx, 28, 72, 1224, 7, 4);
    ctx.fillStyle = "rgba(255,244,214,0.2)";
    ctx.fill();
    roundedRect(ctx, 28, 72, 1224 * progress, 7, 4);
    ctx.fillStyle = theme[2];
    ctx.fill();
    for (const checkpoint of LEVEL.checkpoints) {
      const cpX = 28 + 1224 * (checkpoint.beat / 316);
      ctx.fillStyle = checkpoint.beat <= beat ? "#fff4d6" : "rgba(255,244,214,0.4)";
      ctx.fillRect(cpX - 2, 67, 4, 17);
    }
    ctx.textAlign = "left";
    ctx.font = "700 12px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#fff4d6";
    ctx.fillText(physics.modeLabel().toUpperCase(), 28, 108);
    ctx.font = "500 12px Trebuchet MS, sans-serif";
    ctx.fillStyle = "rgba(255,244,214,0.7)";
    ctx.fillText(section.subtitle.toUpperCase(), 110, 108);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff4d6";
    ctx.fillText(`${uiState.practice ? "PRACTICE" : "FULL RUN"}  ·  ${formatClock(beat * (60 / 126))}`, 1250, 108);
    if (uiState.showTouchControls) {
      ctx.fillStyle = "rgba(255,244,214,0.65)";
      ctx.font = "600 12px Trebuchet MS, sans-serif";
      ctx.fillText("SPACE / TAP  ·  HOLD TO DRIFT", 1250, 680);
    }
    ctx.restore();
  }

  burst(x, y, colorName, count, spread) {
    if (this.settings.reducedMotion) count = Math.ceil(count * 0.45);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = spread * (0.25 + Math.random() * 0.75);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.3 + Math.random() * 0.5, maxLife: 0.8, size: 2 + Math.random() * 4, color: colorName });
    }
  }

  updateParticles(dt, player) {
    this.lastDt = dt;
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 180 * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.trails.push({ x: player.x, y: player.y, mode: player.lane, life: 0.32 });
    this.trails = this.trails.filter((trail) => (trail.life -= dt) > 0);
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = color(particle.color);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }
}

function PHYSICS_SECTION_THEME(beat) {
  if (beat < 80) return "garden";
  if (beat < 144) return "fracture";
  if (beat < 208) return "drift";
  if (beat < 264) return "orbit";
  if (beat < 312) return "supernova";
  return "dawn";
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
