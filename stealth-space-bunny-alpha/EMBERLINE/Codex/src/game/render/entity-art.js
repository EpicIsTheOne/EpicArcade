import { COLORS, polygon, roundRect } from "./world-art.js";

function shadow(ctx, width, alpha = 0.3) {
  ctx.fillStyle = `rgba(3,4,13,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 4, width, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function limb(ctx, x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function damageTint(ctx, entity) {
  if (entity.hurtFlash <= 0) return null;
  return Math.min(0.8, entity.hurtFlash * 5);
}

export function drawPlayer(ctx, player, time) {
  if (player.dead && player.deathTimer > 1.8) return;
  const bob = player.onGround && Math.abs(player.vx) > 20 ? Math.sin(time * 15) * 2 : Math.sin(time * 3) * 1.2;
  ctx.save();
  ctx.translate(player.centerX, player.y + bob);
  ctx.scale(player.facing, 1);
  if (player.dead) {
    ctx.globalAlpha = Math.max(0, 1 - player.deathTimer / 1.8);
    ctx.rotate(Math.min(1.35, player.deathTimer * 3));
  }
  shadow(ctx, 25, 0.38);

  if (player.dashTime > 0) {
    for (let index = 3; index >= 1; index -= 1) {
      ctx.save();
      ctx.globalAlpha = 0.12 * index;
      ctx.translate(-player.facing * index * 12, 0);
      drawMiraBody(ctx, player, time, false);
      ctx.restore();
    }
  }

  if (player.spawnFlash > 0) {
    ctx.globalAlpha = player.spawnFlash / 0.65;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 36, 34 + (0.65 - player.spawnFlash) * 35, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawMiraBody(ctx, player, time, true);
  const tint = damageTint(ctx, player);
  if (tint) {
    ctx.globalAlpha = tint;
    ctx.fillStyle = "#ff6b7f";
    ctx.fillRect(-19, -72, 38, 78);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawMiraBody(ctx, player, time, effects) {
  const moving = player.onGround && Math.abs(player.vx) > 20;
  const run = moving ? Math.sin(time * 16) : 0;
  const action = player.action;
  const phase = player.actionPhase();
  const actionRatio = action ? player.actionTime / player.actionDuration : 0;

  polygon(ctx, [[-7, -42], [-25 - Math.abs(player.vx) * 0.018, -32], [-20, -20], [-5, -24]], "#b7375c");
  limb(ctx, -4, -27, -8 - run * 7, -7, 8, "#11132f");
  limb(ctx, 5, -27, 9 + run * 7, -7, 8, "#11132f");
  roundRect(ctx, -13 - run * 7, -10, 12, 8, 3, "#0a0c24");
  roundRect(ctx, 3 + run * 7, -10, 13, 8, 3, "#0a0c24");

  polygon(ctx, [[-15, -50], [10, -50], [18, -22], [4, -17], [-17, -25]], "#19375a", "#4ed9ed", 1);
  polygon(ctx, [[-15, -49], [-5, -55], [3, -23], [-17, -25]], "#f06b72");
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(1, -34, 3, 0, Math.PI * 2);
  ctx.fill();

  limb(ctx, -8, -45, -18, -31, 6, "#e7b38a");
  let handX = 20;
  let handY = -40;
  if (action === "light") {
    if (phase === "windup") { handX = 22 + actionRatio * 16; handY = -42; }
    else if (phase === "active") { handX = 68; handY = -38; }
    else { handX = 46; handY = -34; }
  } else if (action === "heavy") {
    if (phase === "windup") { handX = 18; handY = -24; }
    else if (phase === "active") { handX = 96; handY = -36; }
    else { handX = 58; handY = -31; }
  } else if (action === "air") {
    handX = phase === "active" ? 80 : 42;
    handY = -58;
  } else if (action === "storm") {
    handX = phase === "active" ? 52 : 25;
    handY = -48;
  }
  limb(ctx, 8, -45, handX, handY, 7, "#e7b38a");
  ctx.strokeStyle = "#ffe3a2";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(handX, handY, 7, -Math.PI * 0.9, Math.PI * 0.8);
  ctx.stroke();
  ctx.fillStyle = "#ff9f43";
  ctx.beginPath();
  ctx.arc(handX, handY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e7b38a";
  ctx.beginPath();
  ctx.arc(0, -59, 11, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, [[-13, -64], [-7, -76], [10, -72], [15, -58], [3, -64]], "#11132f", "#4ed9ed", 1);
  ctx.fillStyle = "#f6efe0";
  ctx.beginPath();
  ctx.moveTo(5, -61);
  ctx.lineTo(12, -60);
  ctx.strokeStyle = "#f6efe0";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  if (effects && action && phase === "active") {
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = action === "storm" ? COLORS.cyan : COLORS.ember;
    ctx.lineWidth = action === "heavy" ? 12 : 7;
    ctx.beginPath();
    ctx.arc(-2, -38, Math.max(30, handX * 0.62), -0.9, 0.85);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawEnemy(ctx, enemy, time) {
  if (enemy.dead && enemy.deathTimer > 1.1) return;
  ctx.save();
  ctx.translate(enemy.centerX, enemy.centerY);
  if (enemy.dead) {
    ctx.globalAlpha = Math.max(0, 1 - enemy.deathTimer / 1.1);
    ctx.rotate(Math.min(1.4, enemy.deathTimer * 5) * enemy.facing);
  }
  ctx.scale(enemy.facing, 1);
  if (enemy.stagger > 0 && !enemy.dead) ctx.rotate(Math.sin(time * 22) * 0.09);
  if (enemy.kind === "spark") drawSpark(ctx, enemy, time);
  else if (enemy.kind === "chorister") drawChorister(ctx, enemy, time);
  else if (enemy.kind === "bellwether") drawBellwether(ctx, enemy, time);
  else if (enemy.kind === "conductor") drawConductor(ctx, enemy, time);
  else if (enemy.kind === "warden") drawWarden(ctx, enemy, time);
  else drawSkater(ctx, enemy, time);
  const tint = damageTint(ctx, enemy);
  if (tint) {
    ctx.globalAlpha = tint;
    ctx.fillStyle = "#fff1d0";
    ctx.fillRect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (enemy.state === "windup" && !enemy.dead) drawTelegraph(ctx, enemy, time);
  if (enemy.boss && !enemy.dead) drawBossBar(ctx, enemy);
}

function drawSkater(ctx, enemy, time) {
  shadow(ctx, 25, 0.34);
  const bob = enemy.onGround && Math.abs(enemy.vx) > 15 ? Math.sin(time * 15) * 2 : 0;
  ctx.translate(0, bob);
  limb(ctx, -7, 8, -15, 22, 7, "#15152e");
  limb(ctx, 7, 8, 17, 20, 7, "#15152e");
  ctx.fillStyle = "#111225";
  ctx.beginPath();
  ctx.ellipse(-16, 23, 9, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(18, 22, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, [[-16, -16], [8, -19], [18, 9], [-7, 15]], enemy.color, "#ffc08a", 1);
  ctx.fillStyle = "#efd1b2";
  ctx.beginPath();
  ctx.arc(-3, -25, 10, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, [[-15, -28], [2, -39], [11, -27], [-2, -30]], "#1b1939");
  ctx.fillStyle = COLORS.ember;
  ctx.fillRect(3, -26, 5, 2);
  if (enemy.state === "windup") {
    ctx.strokeStyle = `rgba(255,159,67,${0.3 + enemy.telegraphRatio() * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.lineTo(70 + enemy.telegraphRatio() * 40, -6);
    ctx.stroke();
  }
}

function drawChorister(ctx, enemy, time) {
  shadow(ctx, 28, 0.36);
  const bob = Math.sin(time * 3 + enemy.anchorX) * 1.4;
  ctx.translate(0, bob);
  limb(ctx, -8, 12, -11, 28, 8, "#191a37");
  limb(ctx, 8, 12, 12, 28, 8, "#191a37");
  polygon(ctx, [[-18, -20], [10, -24], [21, 14], [-15, 18]], "#4c4c78", "#a9a1df", 1);
  ctx.fillStyle = "#dfc2aa";
  ctx.beginPath();
  ctx.arc(-2, -30, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#29274c";
  ctx.fillRect(-12, -37, 22, 6);
  ctx.fillStyle = enemy.guard > 0 ? "#d6d0fa" : "#555674";
  ctx.beginPath();
  ctx.ellipse(21, -2, 10, 30, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, -23);
  ctx.lineTo(27, 19);
  ctx.stroke();
  if (enemy.state === "windup") {
    ctx.globalAlpha = enemy.telegraphRatio() * 0.3 + 0.12;
    ctx.strokeStyle = "#c3b6ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -2, 80 + enemy.telegraphRatio() * 90, -0.5, 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawSpark(ctx, enemy, time) {
  ctx.rotate(time * 3.5 + enemy.anchorX);
  polygon(ctx, [[-27, 0], [-10, -7], [0, -17], [10, -7], [27, 0], [10, 7], [0, 17], [-10, 7]], "#20485f", enemy.color, 2);
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = 18;
  polygon(ctx, [[0, -8], [7, 0], [0, 8], [-7, 0]], "#d9fbff");
  ctx.shadowBlur = 0;
  if (enemy.state === "windup") {
    ctx.rotate(-time * 3.5);
    ctx.strokeStyle = COLORS.cyan;
    ctx.globalAlpha = enemy.telegraphRatio();
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 22 + enemy.telegraphRatio() * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawBellwether(ctx, enemy, time) {
  shadow(ctx, 42, 0.42);
  const breathe = Math.sin(time * 3.5) * 2;
  ctx.translate(0, breathe);
  limb(ctx, -18, 17, -24, 37, 13, "#2c203e");
  limb(ctx, 18, 17, 24, 37, 13, "#2c203e");
  polygon(ctx, [[-28, -25], [22, -30], [34, 19], [4, 28], [-30, 15]], enemy.color, "#c28bd6", 2);
  ctx.fillStyle = "#c7a6d8";
  ctx.beginPath();
  ctx.arc(-2, -40, 17, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, [[-18, -47], [-2, -64], [17, -48], [12, -40], [-8, -43]], "#332441");
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(3, -41, 8, 3);
  ctx.strokeStyle = enemy.state === "windup" ? `rgba(255,231,163,${0.4 + enemy.telegraphRatio() * 0.6})` : "#9f79a8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 6, 62 + enemy.telegraphRatio() * 18, 0, Math.PI * 2);
  ctx.stroke();
}

function drawConductor(ctx, enemy, time) {
  const bossScale = 1;
  ctx.scale(bossScale, bossScale);
  shadow(ctx, 46, 0.5);
  const step = enemy.state === "active" ? Math.sin(time * 20) * 5 : 0;
  limb(ctx, -13, 27, -18 + step, 57, 12, "#1a1c31");
  limb(ctx, 13, 27, 18 - step, 57, 12, "#1a1c31");
  polygon(ctx, [[-24, -35], [17, -40], [34, 42], [-31, 53]], enemy.phase === 2 ? "#5c203b" : "#262940", enemy.phase === 2 ? COLORS.red : "#b6b5c7", 2);
  polygon(ctx, [[-24, -35], [-5, -45], [2, 51], [-31, 53]], "#14162d");
  ctx.fillStyle = "#d5c2ac";
  ctx.beginPath();
  ctx.ellipse(-3, -52, 15, 19, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = enemy.phase === 2 ? "#ff5d6f" : "#64e6ff";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(4, -52, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  polygon(ctx, [[-20, -65], [8, -76], [21, -60], [-5, -64]], "#111329", enemy.phase === 2 ? COLORS.red : COLORS.gold, 1);
  ctx.fillStyle = "#f5dfb2";
  ctx.fillRect(-19, -65, 39, 5);
  const staffX = enemy.state === "active" ? 63 : 30;
  const staffY = enemy.state === "active" ? -5 : -18;
  limb(ctx, 15, -25, staffX, staffY, 5, "#b78a5e");
  ctx.fillStyle = enemy.phase === 2 ? COLORS.red : COLORS.cyan;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(staffX, staffY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (enemy.state === "windup") {
    ctx.globalAlpha = 0.22 + enemy.telegraphRatio() * 0.4;
    ctx.strokeStyle = enemy.phase === 2 ? COLORS.red : COLORS.cyan;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, 100 + enemy.telegraphRatio() * 120, -0.9, 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawWarden(ctx, enemy, time) {
  const hover = Math.sin(time * 3.2) * 5;
  ctx.translate(0, hover);
  ctx.rotate(Math.sin(time * 2) * 0.05);
  ctx.strokeStyle = enemy.phase === 2 ? COLORS.red : COLORS.cyan;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 8, 35, 50, 0, 0, Math.PI * 2);
  ctx.stroke();
  polygon(ctx, [[-24, -30], [18, -36], [27, 20], [0, 36], [-27, 17]], enemy.color, "#d8f7ff", 2);
  ctx.fillStyle = "#1d263b";
  ctx.beginPath();
  ctx.arc(0, -29, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = enemy.phase === 2 ? COLORS.red : COLORS.cyan;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 14;
  ctx.fillRect(-8, -31, 17, 4);
  ctx.shadowBlur = 0;
  for (let index = 0; index < 3; index += 1) {
    const angle = time * 3 + index * Math.PI * 2 / 3;
    polygon(ctx, [[Math.cos(angle) * 48, Math.sin(angle) * 58], [Math.cos(angle + 0.3) * 48, Math.sin(angle + 0.3) * 58], [Math.cos(angle + 0.15) * 61, Math.sin(angle + 0.15) * 61]], COLORS.cyan);
  }
}

function drawTelegraph(ctx, enemy, time) {
  const width = enemy.boss ? 80 : 42;
  const y = enemy.y - (enemy.boss ? 92 : 48);
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = "rgba(5,6,20,.78)";
  ctx.fillRect(enemy.centerX - width / 2, y, width, 6);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(enemy.centerX - width / 2, y, width * enemy.telegraphRatio(), 6);
  ctx.fillStyle = "#fff";
  ctx.font = "900 8px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText("!", enemy.centerX, y - 6 + Math.sin(time * 18) * 2);
  ctx.restore();
}

function drawBossBar(ctx, enemy) {
  const width = enemy.kind === "conductor" ? 330 : 230;
  const x = enemy.centerX - width / 2;
  const y = enemy.y - (enemy.kind === "conductor" ? 116 : 78);
  ctx.fillStyle = "rgba(5,6,20,.85)";
  ctx.fillRect(x - 2, y - 2, width + 4, 12);
  ctx.fillStyle = "#2a1735";
  ctx.fillRect(x, y, width, 8);
  ctx.fillStyle = enemy.phase === 2 ? COLORS.red : COLORS.ember;
  ctx.fillRect(x, y, width * Math.max(0, enemy.hp / enemy.maxHp), 8);
  if (enemy.guard > 0) {
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(x, y + 10, width * (enemy.guard / enemy.maxGuard), 3);
  }
}

export function drawProjectile(ctx, projectile, time) {
  ctx.save();
  ctx.translate(projectile.centerX, projectile.centerY);
  ctx.rotate(projectile.rotation);
  if (projectile.kind === "bolt" || projectile.kind === "pulse") {
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 16;
    polygon(ctx, [[13, 0], [0, -8], [-13, 0], [0, 8]], projectile.color, "#f4ffff", 1);
  } else if (projectile.kind === "rail") {
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 15;
    polygon(ctx, [[24, 0], [8, -11], [-24, -5], [-15, 0], [-24, 5], [8, 11]], projectile.color, "#f4ffff", 1);
  } else {
    ctx.fillStyle = `${projectile.color}33`;
    ctx.fillRect(projectile.x, 90, projectile.width, 360);
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(projectile.x, 90, projectile.width, 360);
    ctx.beginPath();
    ctx.moveTo(projectile.x, 0);
    ctx.lineTo(projectile.x + projectile.width, 0);
    ctx.stroke();
    for (let index = 0; index < 5; index += 1) {
      const y = 110 + ((time * 320 + index * 90) % 320);
      ctx.beginPath();
      ctx.moveTo(projectile.x - 8, y);
      ctx.lineTo(projectile.x + projectile.width + 8, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawParticles(ctx, particles) {
  ctx.save();
  for (const trail of particles.trails) {
    ctx.globalAlpha = trail.life / trail.maxLife;
    ctx.strokeStyle = trail.color;
    ctx.lineWidth = trail.width;
    ctx.beginPath();
    ctx.moveTo(trail.x - trail.direction * 12, trail.y);
    ctx.lineTo(trail.x, trail.y);
    ctx.stroke();
  }
  for (const particle of particles.items) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    if (particle.shape === "chip") {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.life * 9);
      ctx.fillRect(-particle.size, -particle.size, particle.size * 2, particle.size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0.5, particle.size * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawDamageNumbers(ctx, particles) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "900 18px ui-sans-serif, system-ui";
  for (const number of particles.damageNumbers) {
    ctx.globalAlpha = Math.min(1, number.life / number.maxLife * 1.8);
    ctx.fillStyle = number.color;
    ctx.strokeStyle = "rgba(5,6,20,.8)";
    ctx.lineWidth = 3;
    ctx.strokeText(String(number.value), number.x, number.y);
    ctx.fillText(String(number.value), number.x, number.y);
  }
  ctx.restore();
}
