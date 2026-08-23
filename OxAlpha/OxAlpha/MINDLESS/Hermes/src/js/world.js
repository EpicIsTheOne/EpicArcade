// MINDLESS-Hermes :: world.js — level runtime: camera, checkpoints, parallax, particles
"use strict";

class World {
  constructor(stageDef, game) {
    this.def = stageDef;
    this.game = game;
    this.player = new Player({ x: stageDef.spawn, y: GROUND_Y });
    this.enemies = [];
    this.projectiles = [];      // NoteProjectile + Shockwave + EnemyNote
    this.particles = [];
    this.slots = new EnemySlotSystem();
    this.camX = 0;
    this.length = stageDef.length + 240;   // stage + boss arena tail
    this.checkpoints = stageDef.checkpoints.map((c, i) => ({
      idx: i, x: c.x, cap: c.cap, spec: c,
      activated: false, cleared: false,
      pending: c.enemies.map(e => e.slice()), liveCount: 0,
      wallsActive: false,
    }));
    this.activeCheckpoint = null;
    this.bossSpawned = false;
    this.wallsL = 0; this.wallsR = null;     // dynamic arena bounds
    this.time = 0;
    this.shakeT = 0; this.shakeMag = 0;
    this.rescueDrone = null;
  }

  shake(mag, dur) { if (mag > this.shakeMag) { this.shakeMag = mag; } this.shakeT = Math.max(this.shakeT, dur); }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + U.rand(-4, 4), y: y - U.rand(0, 3), vx: U.rand(-14, 14), vy: U.rand(-26, -8),
        life: U.rand(0.25, 0.5), t: 0, col: "#9a92a8", size: U.rand(1, 2.4), grav: 60,
      });
    }
  }

  sparkBurst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, Math.PI * 2), sp = U.rand(20, 90);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: U.rand(0.2, 0.45), t: 0, col, size: U.rand(1, 2.6), grav: 160,
      });
    }
  }

  hitSpark(x, y, dirX, heavy) {
    const n = heavy ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const a = U.rand(-1, 1) * (Math.PI / 3) + (dirX === 1 ? 0 : Math.PI);
      const sp = U.rand(40, heavy ? 170 : 110);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp * (dirX || 1) * 0.6, vy: Math.sin(a) * sp - 40,
        life: U.rand(0.15, 0.4), t: 0, col: heavy ? "#ffd24a" : "#ffffff", size: U.rand(1, 2.2), grav: 220,
      });
    }
    // impact star
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.12, t: 0, col: "#fff", size: heavy ? 7 : 4.5, grav: 0, star: true });
  }

  clampToWalls(ent, isFly) {
    let hitWall = false;
    const minX = this.wallsL + 6;
    const maxX = (this.wallsR !== null ? this.wallsR : this.length) - 6;
    if (ent.x < minX) { ent.x = minX; hitWall = true; }
    if (ent.x > maxX) { ent.x = maxX; hitWall = true; }
    return isFly && hitWall;
  }

  randomEnemyPreferFacing(player) {
    const candidates = this.enemies.filter(e => !e.dead);
    if (!candidates.length) return null;
    const preferred = candidates.filter(e => (e.x - player.x) * player.heading >= 0);
    const pool = preferred.length ? preferred : candidates;
    // prefer the closest target in the pool
    let best = null, bestD = Infinity;
    for (const e of pool) { const d = Math.abs(e.x - player.x); if (d < bestD) { bestD = d; best = e; } }
    return best;
  }

  spawnEnemy(typeKey, x) {
    const p = this.game.world ? this.game.world.player : null;
    let e;
    switch (typeKey) {
      case "basic": e = new BasicEnemy({ x }); break;
      case "dasher": e = new DashEnemy({ x }); break;
      case "elite": e = new EliteDasher({ x }); break;
      case "shooter": e = new ShooterEnemy({ x }); break;
    }
    e.y = GROUND_Y;
    // spawn-in grace: brief untargetable flicker so waves don't clump on the player instantly
    e.spawnGrace = 0.6;
    this.enemies.push(e);
    return e;
  }

  spawnBoss(kind) {
    let b;
    const arenaX = this.camX + Game.W * 0.72;
    switch (kind) {
      case "evangeline": b = new Evangeline({ x: arenaX }); break;
      case "eden": b = new EdenBoss({ x: arenaX }); break;
      case "angelica": b = new Angelica({ x: arenaX }); break;
    }
    this.enemies.push(b);
    this.bossSpawned = true;
    return b;
  }

  update(dt) {
    this.time += dt;
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }

    const p = this.player;
    p.update(dt, this);

    // forward-only camera lock during checkpoints (faithful)
    const cp = this.activeCheckpoint;
    if (cp && cp.wallsActive) {
      this.wallsL = Math.max(this.wallsL, cp.x - 130);
      this.wallsR = cp.triggerRight ?? this.wallsR;
    }
    if (!cp || !cp.wallsActive) {
      if (!this.game.cameraLocked && p.x > this.camX + Game.W * 0.55) {
        this.camX = U.clamp(p.x - Game.W * 0.55, 0, this.length - Game.W);
      }
    }

    // checkpoint triggers (sequential: never skip an uncleared earlier one)
    let blocking = false;
    for (const c of this.checkpoints) {
      if (blocking && !c.cleared) continue;
      if (!c.activated && p.x >= c.x && !p.dead) this.activateCheckpoint(c);
      if (c.activated && !c.cleared) { this.tickCheckpoint(c, dt); if (!c.cleared) blocking = true; }
    }

    // enemies
    for (const e of this.enemies) e.update(dt, this);
    this.enemies = this.enemies.filter(e => !e.dead || e.state === State.DEATH && e.deadTimer < 1.6);

    // projectiles
    for (const pr of this.projectiles) pr.update(dt, this);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);

    // particles
    for (const pa of this.particles) {
      pa.t += dt;
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      pa.vy += (pa.grav || 0) * dt;
    }
    this.particles = this.particles.filter(pa => pa.t < pa.life);

    // rescue drone sequence
    if (this.rescueDrone) this.updateRescue(dt);

    // death -> rescue
    if (p.currentHealth <= 0 && !p.dead && !this.rescueDrone && this.game.state === "play") {
      this.startRescue();
    }
  }

  activateCheckpoint(c) {
    c.activated = true;
    this.activeCheckpoint = c;
    this.game.onCheckpointStart(c);
    // arena walls
    this.wallsL = Math.max(this.wallsL, c.x - 120);
    this.wallsR = Math.min(this.length - 4, c.x + 236);
    c.wallsActive = true;
    // spawn up to cap immediately
    while (c.pending.length && c.liveCount < c.cap) {
      const [type, off] = c.pending.shift();
      const sx = U.clamp((this.wallsR) + off, this.wallsL + 12, this.wallsR - 12);
      const e = this.spawnEnemy(type, sx);
      e.x = U.clamp(sx, this.wallsL + 12, this.wallsR - 12);
      c.liveCount++;
    }
    if (c.spec.boss && !this.bossSpawned) {
      this.game.startBossEncounter(c);
    }
    if (c.pending.length === 0 && c.liveCount === 0 && !c.spec.boss) {
      // empty checkpoint — complete instantly
      this.completeCheckpoint(c);
    }
  }

  tickCheckpoint(c, dt) {
    // trickle-spawn remaining
    if (c.pending.length && c.liveCount < c.cap) {
      const [type, off] = c.pending.shift();
      const sx = U.clamp(c.x + 250 + off, this.wallsL + 12, this.wallsR - 12);
      const e = this.spawnEnemy(type, sx);
      c.liveCount++;
    }
    // count alive
    const alive = this.enemies.filter(e => !e.dead && !(e.isBoss && e.bossDone)).length;
    const relevantAlive = this.enemies.filter(e => !e.dead).length;
    if (relevantAlive === 0 && c.pending.length === 0) {
      this.completeCheckpoint(c);
    }
  }

  onEnemyRemovedFromPlay() {
    // handled via tickCheckpoint counting; hook kept for parity
  }

  completeCheckpoint(c) {
    c.cleared = true;
    if (this.activeCheckpoint === c) this.activeCheckpoint = null;
    c.wallsActive = false;
    // release the arena: walls recede to the cleared checkpoint's left edge
    this.wallsR = null;
    this.wallsL = Math.max(0, c.x - 60);
    this.game.onCheckpointComplete(c);
  }

  startRescue() {
    const p = this.player;
    p.state = State.GROUNDED;
    p.playAnim("grounded", true);
    this.rescueDrone = { t: 0, phase: "descend", x: p.x, y: -20 };
    this.game.audio.stopSongs(false);
    this.game.onPlayerDown();
  }

  updateRescue(dt) {
    const d = this.rescueDrone, p = this.player;
    d.t += dt;
    if (d.phase === "descend") {
      d.y = U.lerp(d.y, p.y - p.height - 34, dt * 3);
      if (d.t > 1.1) { d.phase = "lift"; d.t = 0; this.game.audio.play("fwehh", { pitch: 0.8 }); }
    } else if (d.phase === "lift") {
      p.height += 60 * dt;
      d.y = p.y - p.height - 34;
      if (d.t > 1.4) { d.phase = "away"; d.t = 0; }
    } else if (d.phase === "away") {
      d.y -= 90 * dt;
      p.height += 90 * dt;
      if (d.t > 0.9) { this.rescueDrone = null; this.game.onRescueComplete(); }
    }
  }

  drawBackground(ctx, t) {
    const env = this.def.env;
    const W = Game.W, H = Game.H;
    // sky / backdrop gradient per environment
    let skyTop, skyBot, cityKey;
    if (env === "street") { skyTop = "#14101f"; skyBot = "#2a1832"; }
    else if (env === "bar") { skyTop = "#0d1220"; skyBot = "#1a2438"; }
    else { skyTop = "#05070d"; skyBot = "#101828"; }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, skyTop); g.addColorStop(1, skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    if (env === "facility") {
      // MIND facility: dark hall, giant EDEN sigil, red strips
      ctx.fillStyle = "#070a12"; ctx.fillRect(0, 0, W, H);
      const sig = Assets.images.sigil;
      ctx.globalAlpha = 0.05 + 0.02 * Math.sin(t * 2);
      ctx.drawImage(sig, 60 - this.camX * 0.05 % 200, -30, 180, 180);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        const bx = ((i * 97 - this.camX * 0.2) % (W + 100)) - 50;
        ctx.fillStyle = "#13203a";
        ctx.fillRect(bx, 18, 34, 86);
        ctx.fillStyle = `rgba(255,40,80,${0.25 + 0.15 * Math.sin(t * 3 + i)})`;
        ctx.fillRect(bx + 4, 24, 26, 3);
        ctx.fillRect(bx + 4, 32, 26, 2);
      }
      // floor grid glow
      ctx.strokeStyle = "rgba(80,140,255,0.08)";
      ctx.lineWidth = 1;
      for (let gx = -(this.camX * 0.85 % 24); gx < W; gx += 24) {
        ctx.beginPath(); ctx.moveTo(gx, GROUND_Y - 14); ctx.lineTo(gx - 10, H); ctx.stroke();
      }
      return;
    }

    // city parallax (authentic cyberpunk-street layers)
    if (Game.graphicsLevel !== "low") {
      const back = Assets.images.city_back;
      const mid = Assets.images.city_middle;
      const bw = back.width * (H * 0.62 / back.height);
      const mw = mid.width * (H * 0.68 / mid.height);
      const off1 = -(this.camX * 0.12) % bw;
      const off2 = -(this.camX * 0.3) % mw;
      ctx.globalAlpha = 0.75;
      for (let x = off1 - bw; x < W + bw; x += bw) ctx.drawImage(back, x, H - bw * (back.height / back.width) - 6, bw, bw * (back.height / back.width));
      ctx.globalAlpha = 0.9;
      for (let x = off2 - mw; x < W + mw; x += mw) ctx.drawImage(mid, x, H - mw * (mid.height / mid.width) - 2, mw, mw * (mid.height / mid.width));
      ctx.globalAlpha = 1;
    }

    // main wall band (authentic street/bar backgrounds tiled)
    const img = env === "street" ? Assets.images.street_bg : Assets.images.bar_bg;
    const scale = 1;                       // native 1x like the original
    const tw = img.width * scale, th = img.height * scale;
    const y0 = GROUND_Y - th + 8;
    let off = -(this.camX * 0.85 % tw);
    for (let x = off - tw; x < W + tw; x += tw) {
      ctx.drawImage(img, x, y0, tw, th);
    }
    // dark vignette over band bottom
    const gg = ctx.createLinearGradient(0, GROUND_Y - 16, 0, GROUND_Y);
    gg.addColorStop(0, "rgba(0,0,0,0)");
    gg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = gg; ctx.fillRect(0, GROUND_Y - 16, W, 16);

    // props every ~180px (sewer holes, barrels, windows)
    const propPeriod = 176;
    const firstIdx = Math.floor(this.camX / propPeriod);
    for (let i = firstIdx; i < firstIdx + 4; i++) {
      const px = i * propPeriod + 40 - this.camX;
      if (px < -40 || px > W + 40) continue;
      const kind = ((i % 3) + 3) % 3;
      if (kind === 0) {
        ctx.drawImage(Assets.images.sewer_hole, px - 8, GROUND_Y - 5, 16, 16 * (16 / 32));
      } else if (kind === 1) {
        ctx.drawImage(Assets.images.barrel, px - 16, GROUND_Y - 13, 32, 16);
      } else {
        ctx.drawImage(Assets.images.window_prop, px - 4, y0 + 10, 8, 8);
        ctx.drawImage(Assets.images.window_prop, px - 4, y0 + 24, 8, 8);
      }
    }

    // ground line
    ctx.fillStyle = "#151320";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#211e2b";
    ctx.fillRect(0, GROUND_Y, W, 2);
  }

  draw(ctx, t) {
    const shx = this.shakeMag > 0 ? U.rand(-this.shakeMag, this.shakeMag) : 0;
    const shy = this.shakeMag > 0 ? U.rand(-this.shakeMag, this.shakeMag) * 0.6 : 0;
    ctx.save();
    ctx.translate(Math.round(shx), Math.round(shy));
    this.drawBackground(ctx, t);

    // depth sort by ground y then draw shadows+entities
    const drawables = [...this.enemies];
    drawables.sort((a, b) => a.y - b.y || a.id - b.id);
    for (const e of drawables) {
      if (e.dead && e.deadTimer > 1.4) continue;
      e.draw(ctx, this.camX, t);
    }
    this.player.draw(ctx, this.camX, t);
    for (const pr of this.projectiles) pr.draw(ctx, this.camX, t);
    for (const pa of this.particles) {
      const a = 1 - pa.t / pa.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = pa.col;
      if (pa.star) {
        const s = pa.size * (pa.t / pa.life);
        ctx.save();
        ctx.translate(pa.x - this.camX, pa.y);
        ctx.rotate(pa.t * 20);
        ctx.fillRect(-s, -s / 3, s * 2, s / 1.5);
        ctx.fillRect(-s / 3, -s, s / 1.5, s * 2);
        ctx.restore();
      } else {
        ctx.fillRect(pa.x - this.camX - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
      }
    }
    ctx.globalAlpha = 1;

    // rescue drone
    if (this.rescueDrone) {
      const d = this.rescueDrone;
      ctx.fillStyle = "#39404f";
      ctx.fillRect(d.x - this.camX - 8, d.y, 16, 8);
      ctx.fillStyle = "#ff3048";
      ctx.fillRect(d.x - this.camX - 3, d.y + 2, 6, 3);
      ctx.strokeStyle = "rgba(120,220,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(d.x - this.camX, d.y + 8);
      ctx.lineTo(d.x - this.camX, this.player.y - this.player.height - 10);
      ctx.stroke();
    }

    // checkpoint trigger shimmer
    for (const c of this.checkpoints) {
      if (c.cleared || c.activated) continue;
      const sx = c.x - this.camX;
      if (sx > -10 && sx < Game.W + 10) {
        ctx.strokeStyle = `rgba(120,220,255,${0.25 + 0.15 * Math.sin(t * 5)})`;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(sx, GROUND_Y - 44); ctx.lineTo(sx, GROUND_Y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // arena walls when locked
    if (this.wallsR !== null && this.activeCheckpoint) {
      const wx = this.wallsR - this.camX;
      if (wx < Game.W + 8) {
        const g2 = ctx.createLinearGradient(wx - 8, 0, wx, 0);
        g2.addColorStop(0, "rgba(255,48,72,0)");
        g2.addColorStop(1, `rgba(255,48,72,${0.25 + 0.1 * Math.sin(t * 6)})`);
        ctx.fillStyle = g2;
        ctx.fillRect(wx - 8, 0, 8, Game.H);
      }
      const lx = this.wallsL - this.camX;
      if (lx > -8) {
        const g3 = ctx.createLinearGradient(lx, 0, lx + 8, 0);
        g3.addColorStop(0, `rgba(255,48,72,${0.25 + 0.1 * Math.sin(t * 6)})`);
        g3.addColorStop(1, "rgba(255,48,72,0)");
        ctx.fillStyle = g3;
        ctx.fillRect(lx, 0, 8, Game.H);
      }
    }
    ctx.restore();
  }
}
