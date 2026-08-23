// MINDLESS-Hermes :: enemies.js — MIND units (faithful behaviors)
"use strict";

// Enemy slots around the player (original reserve_slot / free_slot)
class EnemySlotSystem {
  constructor() {
    // offsets relative to player: two per side (original has ~4-5 slots)
    this.slots = [
      { dx: -26, occ: null }, { dx: 26, occ: null },
      { dx: -46, occ: null }, { dx: 46, occ: null },
      { dx: -64, occ: null }, { dx: 64, occ: null },
    ];
  }
  reserve(enemy) {
    const p = Game.game && Game.game.world ? Game.game.world.player : null;
    const px = p ? p.x : enemy.x;
    let best = null, bestD = Infinity;
    for (const s of this.slots) {
      if (s.occ) continue;
      const d = Math.abs((px + s.dx) - enemy.x);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) best.occ = enemy;
    return best;
  }
  free(enemy) {
    for (const s of this.slots) if (s.occ === enemy) s.occ = null;
  }
  reset() { for (const s of this.slots) s.occ = null; }
}

class BasicEnemy extends Character {
  constructor(cfg = {}) {
    super(Object.assign({
      type: Type.BASIC_ENEMY, maxHealth: 8, speed: 42, damage: 2,
      knockbackIntensity: 90, durationGrounded: 800, shadowW: 12,
    }, cfg));
    this.sheet = { img: Assets.images.enemy_basic, fw: 32, fh: 32 };
    this.slot = null;
    this.timeSinceLastHit = -99999;
    this.betweenHitsMs = cfg.betweenHitsMs ?? 1600;
    this.prepMs = cfg.prepMs ?? 420;
    this.prepTimer = 0;
    this.attackAnim = "attack";
    this.attackHitDone = false;
    this.deathReported = false;
    this.onDeathCb = (e) => {
      if (this.deathReported) return;
      this.deathReported = true;
      if (this.slot) { Game.game.world.slots.free(this); this.slot = null; }
      Game.game.onEnemyDeath(this);
    };
  }

  update(dt, world) {
    if (this.dead) { super.update(dt, world); return; }
    if (this.currentHealth <= 0) { super.update(dt, world); return; }   // dying: no AI
    const p = world.player;
    if (p && !p.dead && this.canMove()) {
      if (!this.slot) this.slot = world.slots.reserve(this);
      if (this.slot) {
        const sx = p.x + this.slot.dx;
        const dx = sx - this.x;
        const dist = Math.abs(dx);
        const dir = U.sign(dx) || 1;
        if (dist < 2.5) {
          this.vx = 0;
          if (this.canAttack() && performance.now() - this.timeSinceLastHit > this.betweenHitsMs && p.currentHealth > 0) {
            this.state = State.PREP_ATTACK;
            this.playAnim("prep", true);
            this.prepTimer = 0;
          }
        } else {
          this.vx = dir * this.speed;
          this.heading = dir;
        }
      }
    } else if (this.canMove()) {
      this.vx = 0;
    }

    // PREP -> ATTACK after windup (faithful duration_prep_hit flow)
    if (this.state === State.PREP_ATTACK) {
      this.prepTimer += dt * 1000;
      // bail out of prep when the target is gone or we can no longer attack
      const pt = world.player;
      if (!pt || pt.dead || this.currentHealth <= 0 || !this.canAttack()) {
        this.state = State.IDLE;
        this.playAnim("idle");
      }
      if (this.state === State.PREP_ATTACK && this.prepTimer >= this.prepMs) {
        this.state = State.ATTACK;
        this.playAnim("attack", true);
        this.attackHitDone = false;
        Game.game.audio.play("grunt", { pitch: U.rand(0.85, 1.15), volume: 0.55 });
      }
    }
    if (this.state === State.ATTACK) {
      const a = this.animMap.attack;
      const prog = this.animTime * a.fps;
      if (!this.attackHitDone && prog >= 1.2) {
        this.attackHitDone = true;
        const p2 = world.player;
        if (p2 && !p2.dead) {
          const dx = p2.x - this.x;
          const reach = 16;
          const inRange = this.heading === 1 ? dx >= -4 && dx <= reach : dx <= 4 && dx >= -reach;
          if (inRange && Math.abs(p2.height - this.height) < 26) {
            p2.receiveDamage(this.damage, this.heading, HitType.NORMAL, this.knockbackIntensity, "enemy");
            Game.game.onPlayerHit();
          }
        }
      }
      this.timeSinceLastHit = performance.now();
      if (this.animFinished) this.state = State.IDLE;
    }
    // face the player (faithful set_heading)
    if (p && this.state !== State.ATTACK) {
      this.heading = this.x > p.x ? -1 : 1;
    }
    super.update(dt, world);
  }
}

class DashEnemy extends BasicEnemy {
  constructor(cfg = {}) {
    super(Object.assign({
      type: Type.DASH_ENEMY, maxHealth: 10, speed: 48, damage: 3,
      betweenHitsMs: 2200, shadowW: 12,
    }, cfg));
    this.sheet = { img: Assets.images.enemy_dasher, fw: 32, fh: 32 };
    this.dashState = "chase";       // chase|retreat|windup|dash|recover
    this.tooClose = 26; this.dashStartDist = 80; this.dashTrigger = 92;
    this.windupMs = 260; this.dashMs = 200; this.recoverMs = 420;
    this.dashSpeed = 300;
    this.dashDir = 1; this.stateStart = 0;
  }
  update(dt, world) {
    if (this.dead) { super.update(dt, world); return; }
    if (this.currentHealth <= 0) { super.update(dt, world); return; }   // dying: no AI
    // resolve orphaned ATTACK state (interrupted dash) — never idle in ATTACK outside "dash"
    if (this.state === State.ATTACK && this.dashState !== "dash") {
      this.state = State.IDLE;
      this.playAnim("idle");
    }
    const p = world.player;
    const now = performance.now();
    if (p && !p.dead) {
      if (!this.slot) this.slot = world.slots.reserve(this);
      const sx = p.x + (this.slot ? this.slot.dx : 0);
      const dx = sx - this.x;
      const dist = Math.abs(dx);
      const dir = U.sign(dx) || 1;
      switch (this.dashState) {
        case "chase":
          // stalemate breaker: never loiter unresolved
          if (this.stalemateT === undefined) this.stalemateT = 0;
          this.stalemateT += dt;
          if (this.stalemateT > 2.0) {
            this.stalemateT = 0;
            this.dashState = "windup"; this.dashDir = dir; this.stateStart = now;
            this.state = State.PREP_ATTACK; this.playAnim("prep", true);
            break;
          }
          if (dist <= this.tooClose) { this.dashState = "retreat"; this.dashDir = -dir; this.stateStart = now; break; }
          if (dist > this.dashTrigger) { this.vx = dir * this.speed; this.heading = dir; this.stalemateT = 0; }
          else {
            this.vx = 0;
            if (p.currentHealth > 0 && now - this.timeSinceLastHit > this.betweenHitsMs) {
              this.dashState = "windup"; this.dashDir = dir; this.stateStart = now;
              this.state = State.PREP_ATTACK; this.playAnim("prep", true);
              this.stalemateT = 0;
            }
          }
          break;
        case "retreat":
          this.vx = this.dashDir * this.speed * 1.15;
          this.heading = -this.dashDir;
          if (dist >= this.dashStartDist) {
            this.vx = 0;
            this.dashState = "windup"; this.dashDir = dir; this.stateStart = now;
            this.state = State.PREP_ATTACK; this.playAnim("prep", true);
          }
          break;
        case "windup":
          this.vx = 0; this.heading = this.dashDir;
          if (now - this.stateStart >= this.windupMs) {
            this.dashState = "dash"; this.stateStart = now;
            this.state = State.ATTACK; this.playAnim("fly", true);
            this.attackHitDone = false;
            Game.game.audio.play("zoom", { pitch: U.rand(0.95, 1.1) });
            if (Game.graphicsLevel !== "low") Game.game.world && Game.game.world.sparkBurst(this.x, this.y - 10, "#ffdd66", 3);
          }
          break;
        case "dash":
          this.vx = this.dashDir * this.dashSpeed;
          if (!this.attackHitDone) {
            const pdx = p.x - this.x;
            if (Math.abs(pdx) < 12 && Math.abs(p.height - this.height) < 26 && !p.dead) {
              this.attackHitDone = true;
              if (p.receiveDamage(this.damage, this.dashDir, HitType.KNOCKDOWN, 140, "enemy")) Game.game.onPlayerHit();
            }
          }
          if (now - this.stateStart >= this.dashMs) {
            this.dashState = "recover"; this.stateStart = now; this.vx = 0;
            this.timeSinceLastHit = now;
          }
          break;
        case "recover":
          this.vx = 0;
          if (now - this.stateStart >= this.recoverMs) { this.dashState = "chase"; this.stalemateT = 0; }
          break;
      }
    }
    if (p && this.dashState !== "dash") this.heading = this.x > p.x ? -1 : 1;
    super.update(dt, world);
  }
}

class EliteDasher extends DashEnemy {
  constructor(cfg = {}) {
    super(Object.assign({
      type: Type.ELITE_DASHER_ENEMY, maxHealth: 14, speed: 56, damage: 4,
      dashSpeed: 340, windupMs: 200, betweenHitsMs: 1800, shadowW: 12,
    }, cfg));
    this.sheet = { img: Assets.images.enemy_elite, fw: 32, fh: 32 };
  }
}

// Shooter unit — keeps range, fires music notes (evolved music_enemy)
class ShooterEnemy extends BasicEnemy {
  constructor(cfg = {}) {
    super(Object.assign({
      type: Type.BASIC_ENEMY, maxHealth: 8, speed: 40, damage: 2,
      betweenHitsMs: 2400, shadowW: 12,
    }, cfg));
    this.sheet = { img: Assets.images.enemy_basic, fw: 32, fh: 32 };
    this.preferDist = 78;
    this.noteIndex = 0;
  }
  update(dt, world) {
    if (this.dead) { super.update(dt, world); return; }
    if (this.currentHealth <= 0) { super.update(dt, world); return; }   // dying: no AI
    const p = world.player;
    const now = performance.now();
    if (p && !p.dead && this.canMove()) {
      const dx = p.x - this.x;
      const dist = Math.abs(dx);
      const dir = U.sign(dx) || 1;
      if (dist < this.preferDist - 18) {          // too close: back away
        this.vx = -dir * this.speed;
        this.heading = dir;
      } else if (dist > this.preferDist + 14) {   // close the gap
        this.vx = dir * this.speed;
        this.heading = dir;
      } else {
        this.vx = 0; this.heading = dir;
        if (this.canAttack() && now - this.timeSinceLastHit > this.betweenHitsMs) {
          this.timeSinceLastHit = now;
          this.state = State.ATTACK;
          this.playAnim("attack", true);
          this.attackHitDone = true;              // no melee
          const speed = 120;
          world.projectiles.push(new EnemyNote({
            x: this.x + dir * 6, y: this.y - 12,
            vx: dir * speed, damage: this.damage,
            green: (this.noteIndex++ % 2) === 1,
          }));
          Game.game.audio.play("gunshot", { pitch: 1.4, volume: 0.35 });
        }
      }
    }
    if (p) this.heading = this.x > p.x ? -1 : 1;
    super.update(dt, world);
  }
}

// =====================================================================
// Boss base — faithful port (phases, invuln windows, beat gating)
// =====================================================================
class Boss extends Character {
  constructor(cfg = {}) {
    super(Object.assign({
      maxHealth: 60, damage: 3, shadowW: 18,
    }, cfg));
    this.isBoss = true;
    this.bossType = cfg.bossType;
    this.maxPhase = cfg.maxPhase ?? 2;
    this.phase = 1;
    // authentic fixed-damage model: 15 per landed hit, phase every 3 hits
    this.damagePerHit = 15;
    this.hitsPerPhase = 3;
    this.phaseHits = 0;
    this.invulnerable = true;
    this.cooldownDuration = cfg.cooldownDuration ?? 0.9;
    this.cooldownTime = 0;
    this.waitingForBeat = true;
    this.attacksBeforeVulnerable = cfg.attacksBeforeVulnerable ?? 6;
    this.vulnerableDuration = cfg.vulnerableDuration ?? 3.0;
    this.attackCount = 0;
    this.isVulnerableWindow = false;
    this.vulnerableTimeLeft = 0;
    this.normalAlpha = 1;
    this.hoverBaseY = GROUND_Y;
    this.bossState = "idle";   // idle | attack | cooldown
    this.deathReported = false;
    this.onDeathCb = (e) => {
      if (this.deathReported) return;
      this.deathReported = true;
      Game.game.onBossDeath(this);
    };
  }

  // Faithful original model: fixed damage_per_hit (15), phase every hits_per_phase (3) hits,
  // death at 0 hp (4 hits). Non-advancing hits make the boss escape (invulnerable + resume attacks).
  receiveDamage(amount, dirX, hitType, knockback, source) {
    if (this.invulnerable || this.dead) {
      // blocked pop even when the swing visually passes under a hovering boss
      Game.game.ui.spawnGradePop(this.x, this.y - this.height - 26, "BLOCKED", "#8899aa");
      return false;
    }
    if ((this.minMeleeHeight !== undefined && this.height > this.minMeleeHeight)) {
      Game.game.ui.spawnGradePop(this.x, this.y - this.height - 26, "TOO HIGH", "#8899aa");
      return false;
    }
    this.setHealth(this.currentHealth - this.damagePerHit);
    this.phaseHits++;
    this.hitFlash = 0.12;
    Game.game.onBossHit(this, this.damagePerHit);
    Game.game.world.hitSpark(this.x, this.y - this.height - 14, dirX, true);
    if (this.currentHealth <= 0) {
      this.startDeath();
      return true;
    }
    if (this.phaseHits >= this.hitsPerPhase) {
      this.advancePhase();
    } else if (!this.spawningWave) {
      // escape: invulnerable until next vulnerability window (original)
      this.invulnerable = true;
      this.bossState = "attack";
      this.waitingForBeat = true;
    }
    return true;
  }

  advancePhase() {
    // a hit-driven phase change supersedes any pending wave (Angelica: wave flag must not deadlock the fight)
    this.spawningWave = false;
    this.phaseHits = 0;
    if (this.phase >= this.maxPhase) {
      this.startDeath();
      return;
    }
    this.phase += 1;
    this.invulnerable = true;
    this.bossState = "attack";
    this.waitingForBeat = true;
    this.onPhaseChanged();
    Game.game.onBossPhase(this);
  }

  startDeath() {
    this.state = State.DEATH;
    this.playAnim("death", true);
    this.invulnerable = true;
    this.isVulnerableWindow = false;
    this.waitingForBeat = false;
    this.bossState = "dead";
    Game.game.onBossDying(this);
  }

  enterCooldown() { this.cooldownTime = this.cooldownDuration; this.bossState = "cooldown"; }

  beginVulnerableWindow() {
    this.attackCount = 0;
    this.waitingForBeat = false;
    this.isVulnerableWindow = true;
    this.vulnerableTimeLeft = this.vulnerableDuration;
    this.invulnerable = false;
    this.bossState = "idle";
    Game.game.onBossVulnerable(this);
  }

  endVulnerableWindow() {
    this.isVulnerableWindow = false;
    this.invulnerable = true;
    this.enterCooldown();
  }

  // phase-hit escape: boss becomes hittable only inside vulnerability windows
  // (original: after a non-advancing hit, invulnerable=true until the window)

  onPhaseChanged() {}   // subclass hook

  onBeatGate(idx) {}     // subclass: act on beat
  updateBossAI(dt, world) {}

  update(dt, world) {
    if (this.dead) { super.update(dt, world); return; }
    if (this.state === State.DEATH) {
      // sink to the ground, flash, then die — independent of the shared z-physics
      this.height = U.moveToward(this.height, 0, 60 * dt);
      this.deadTimer += dt;
      this.hitFlash = 0.1 + 0.1 * Math.sin(this.deadTimer * 40);
      if (this.deadTimer > 1.4 && !this.dead) { this.dead = true; if (this.onDeathCb) this.onDeathCb(this); }
      return;
    }
    if (this.isVulnerableWindow) {
      this.vulnerableTimeLeft -= dt;
      if (this.vulnerableTimeLeft <= 0) this.endVulnerableWindow();
    } else {
      this.updateBossAI(dt, world);
      this.cooldownTime -= dt;
      if (this.cooldownTime <= 0) this.waitingForBeat = true;
    }
    super.update(dt, world);
  }

  draw(ctx, camX, t) {
    if (this.dead) return;
    // vulnerability ring (EDEN-style readability)
    if (!this.invulnerable && Game.graphicsLevel !== "low") {
      const sx = Math.round(this.x - camX), sy = Math.round(this.y - this.height - 14);
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.strokeStyle = `rgba(90,255,160,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, 22 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    }
    super.draw(ctx, camX, t);
  }
}

// =====================================================================
// EVANGELINE — hovering drone, red blades, shockwaves left, hover steps
// =====================================================================
class Evangeline extends Boss {
  constructor(cfg = {}) {
    super(Object.assign({
      bossType: Type.EVANGELINE, maxHealth: 60, maxPhase: 2,
      cooldownDuration: 0.55, attacksBeforeVulnerable: 5, vulnerableDuration: 6.0,
      damage: 3, shadowW: 16,
    }, cfg));
    this.sheet = { img: Assets.images.evangeline, fw: 58, fh: 32 };
    this.hoverStep = 0; this.hoverDir = -1; this.hoverStepDist = 7;
    this.hoverFloat = 26;      // floats above ground
    this.height = this.hoverFloat;
    this.animMap = {
      fly: { frames: [0], fps: 2, loop: true },
      death: { frames: [0], fps: 2, loop: true },
    };
    this.playAnim("fly", true);
    this.bladePhase = 0;
  }

  updateBossAI(dt, world) { this.bladePhase += dt; }

  onBeatGate(idx) {
    if (!this.waitingForBeat || this.isVulnerableWindow || this.state === State.DEATH) return;
    const p = Game.game.world.player;
    // face the player
    if (p) this.heading = this.x > p.x ? -1 : 1;
    this.waitingForBeat = false;
    this.bossState = "cooldown";
    this.shockwaveAttack();
    if (this.phase === 2) {
      // double shockwave (original phase 2)
      setTimeout(() => {
        if (!this.dead && this.state !== State.DEATH && Game.game.state === "play") this.shockwaveAttack();
      }, 90);
    }
    this.moveHoverStep();
    this.finishAttack();
  }

  shockwaveAttack() {
    const w = Game.game.world;
    w.projectiles.push(new Shockwave({
      x: this.x + this.heading * 6, y: GROUND_Y - 8,
      dirX: this.heading,   // she faces the player; wave travels the way she faces
      speed: 112 + this.phase * 26, damage: this.damage, knockback: 220,
    }));
    Game.game.audio.play("gunshot", { pitch: 0.7, volume: 0.5 });
    Game.game.world && Game.game.world.shake(2, 0.1);
  }

  moveHoverStep() {
    this.hoverStep++;
    if (this.hoverStep >= 3) { this.hoverStep = 0; this.hoverDir *= -1; }
  }

  finishAttack() {
    this.attackCount++;
    if (this.attackCount >= this.attacksBeforeVulnerable) this.beginVulnerableWindow();
    else this.enterCooldown();
  }

  beginVulnerableWindow() {
    this.hoverTarget = 0;
    super.beginVulnerableWindow();
  }

  onPhaseChanged() {
    this.attacksBeforeVulnerable = 4;
    Game.game.ui.toast("EVANGELINE PHASE 2", "#ff6a72");
    Game.game.audio.play("zoom", { pitch: 0.6, volume: 0.8 });
  }

  update(dt, world) {
    // hover bob + descend when vulnerable (original alpha fade + hover)
    const targetH = this.isVulnerableWindow ? 4 : this.hoverFloat;
    this.height = U.lerp(this.height, targetH + Math.sin(performance.now() * 0.004) * 2.5, dt * (this.isVulnerableWindow ? 10 : 4));
    // vulnerable swoop: drift toward the player so melee can punish (presentation + fairness)
    if (this.isVulnerableWindow && world.player) {
      const dx = world.player.x - this.x;
      this.x += U.clamp(dx, -34 * dt, 34 * dt);
    }
    super.update(dt, world);
  }

  draw(ctx, camX, t) {
    if (this.dead) return;
    const sx = Math.round(this.x - camX), sy = Math.round(this.y - this.height);
    // rotor glow
    if (Game.graphicsLevel !== "low") {
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 20);
      ctx.fillStyle = "#ff3040";
      ctx.beginPath(); ctx.ellipse(sx, sy - 4, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(sx, sy);
    if (this.heading === -1) ctx.scale(-1, 1);
    if (this.hitFlash > 0) ctx.filter = Game.qaMode ? "none" : "brightness(2)";
    if (this.sheet.img) ctx.drawImage(this.sheet.img, -29, -16, 58, 32);
    ctx.filter = "none";
    if (this.isVulnerableWindow) {
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 12);
    }
    ctx.restore();
    if (this.isVulnerableWindow) {
      // flicker like original vulnerable_flicker
      ctx.globalAlpha = 1;
    }
  }
}

// =====================================================================
// EDEN — giant red smiley, note fans, arena steps, green vulnerable ring
// =====================================================================
class EdenBoss extends Boss {
  constructor(cfg = {}) {
    super(Object.assign({
      bossType: Type.EDEN, maxHealth: 70, maxPhase: 2,
      cooldownDuration: 0.2, attacksBeforeVulnerable: 8, vulnerableDuration: 4.0,
      damage: 3, shadowW: 20,
    }, cfg));
    this.sheet = { img: Assets.images.eden_face, fw: 64, fh: 64 };
    this.animMap = { idle: { frames: [0], fps: 2, loop: true }, death: { frames: [0], fps: 2, loop: true } };
    this.playAnim("idle", true);
    this.noteIndex = 0;
    this.baseX = cfg.x;
    this.floatH = 34;
    this.height = this.floatH;
  }

  onBeatGate(idx) {
    if (!this.waitingForBeat || this.isVulnerableWindow || this.state === State.DEATH) return;
    this.pulseCore();
    this.waitingForBeat = false;
    this.bossState = "cooldown";
    const p = Game.game.world.player;
    const toPlayer = p ? U.sign(p.x - this.x) || -1 : -1;
    this.heading = toPlayer;
    if (this.phase === 1) {
      if (idx % 4 === 0) this.fireFan(3, 0.24, toPlayer);
      else this.fireAtPlayer(toPlayer, 2.0);
    } else {
      this.fireFan(idx % 4 === 0 ? 5 : 3, 0.32, toPlayer);
      if (idx % 2 === 0) this.fireAtPlayer(toPlayer, 1.25);
    }
    if (idx % 4 === 0) this.stepAcrossArena(idx);
    this.finishAttack();
  }

  pulseCore() {
    this.pulseT = performance.now();
  }

  fireFan(count, spread, toPlayer) {
    const baseAng = 0; // horizontal toward player
    for (let i = 0; i < count; i++) {
      const centered = i - (count - 1) * 0.5;
      const ang = baseAng + centered * spread;
      this.spawnNote(toPlayer, ang, 1.75);
    }
  }

  fireAtPlayer(toPlayer, travelBeats) {
    this.spawnNote(toPlayer, 0, travelBeats);
  }

  spawnNote(toPlayer, angOffset, travelBeats) {
    const w = Game.game.world;
    const p = w.player;
    const dist = p ? Math.abs(p.x - this.x) : 100;
    const travelTime = Math.max(this.secPerBeatRef() * travelBeats, 0.25);
    const speed = U.clamp(dist / travelTime, 90, 240);
    const dirX = toPlayer;
    const green = (this.noteIndex++ % 2) === 1;
    w.projectiles.push(new EnemyNote({
      x: this.x + dirX * 10, y: this.y - this.height - 10,
      vx: Math.cos(angOffset) * speed * dirX,
      vy: Math.sin(angOffset) * speed,
      damage: this.damage, knockback: 110, green, life: travelTime + 1.6,
    }));
    Game.game.audio.play("click", { pitch: green ? 1.5 : 1.1, volume: 0.3 });
  }

  secPerBeatRef() { return Game.game.beat.secPerBeat; }

  stepAcrossArena(idx) {
    const side = (Math.floor(idx / 4) % 2 === 0) ? -1 : 1;
    const targetX = U.clamp(this.baseX + side * 45, Game.game.world.camX + 40, Game.game.world.camX + Game.W - 40);
    this.tweenX = { from: this.x, to: targetX, t: 0, dur: this.secPerBeatRef() * 0.8 };
  }

  finishAttack() {
    this.attackCount++;
    if (this.attackCount >= this.attacksBeforeVulnerable) this.beginVulnerableWindow();
    else this.enterCooldown();
  }

  onPhaseChanged() { this.attacksBeforeVulnerable = 4; }

  update(dt, world) {
    if (this.tweenX) {
      const tw = this.tweenX;
      tw.t += dt;
      const k = U.clamp(tw.t / tw.dur, 0, 1);
      this.x = U.lerp(tw.from, tw.to, k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      if (k >= 1) this.tweenX = null;
    }
    this.height = this.floatH + Math.sin(performance.now() * 0.003) * 3;
    if (this.phase === 2 && !this.phase2Announced) {
      this.phase2Announced = true;
      this.onPhaseChanged();
    }
    super.update(dt, world);
  }

  draw(ctx, camX, t) {
    if (this.dead) return;
    const sx = Math.round(this.x - camX), sy = Math.round(this.y - this.height - 26);
    // menacing aura + core pulse (authentic _draw)
    if (Game.graphicsLevel !== "low") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 40 + pulse * 6);
      g.addColorStop(0, `rgba(255,20,60,${0.10 + pulse * 0.08})`);
      g.addColorStop(1, "rgba(255,0,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(sx - 48, sy - 48, 96, 96);
      ctx.strokeStyle = `rgba(255,40,80,${0.35 + pulse * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 26 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      if (!this.invulnerable) {
        ctx.strokeStyle = "rgba(90,255,160,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 31 + pulse * 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(sx, sy);
    if (this.hitFlash > 0) ctx.filter = Game.qaMode ? "none" : "brightness(2.4)";
    if (this.sheet.img) ctx.drawImage(this.sheet.img, -32, -32, 64, 64);
    ctx.filter = "none";
    ctx.restore();
  }
}

// =====================================================================
// ANGELICA — purple oni mask; phase1 spawns waves, phase2 shockwaves down
// =====================================================================
class Angelica extends Boss {
  constructor(cfg = {}) {
    super(Object.assign({
      bossType: Type.ANGELICA, maxHealth: 80, maxPhase: 2,
      cooldownDuration: 0.5, attacksBeforeVulnerable: 5, vulnerableDuration: 12,
      damage: 3, shadowW: 16,
    }, cfg));
    this.sheet = { img: Assets.images.angelica, fw: 32, fh: 32 };
    this.minMeleeHeight = 14;   // hittable only when descended into punish window
    this.animMap = { idle: { frames: [0], fps: 2, loop: true }, death: { frames: [0], fps: 2, loop: true } };
    this.playAnim("idle", true);
    this.floatH = 30;
    this.height = this.floatH;
    this.spawningWave = false;
    this.flickerT = 0;
  }

  onBeatGate(idx) {
    if (!this.waitingForBeat || this.isVulnerableWindow || this.spawningWave || this.state === State.DEATH) return;
    const p = Game.game.world.player;
    this.waitingForBeat = false;
    this.bossState = "cooldown";
    if (p) this.heading = this.x > p.x ? -1 : 1;
    const liveMinions = Game.game.world.enemies.filter(e => !e.isBoss && !e.dead).length;
    if (this.phase === 1 && liveMinions < 8) {
      // spawn wave; vulnerable until wave cleared (original)
      this.spawningWave = true;
      Game.game.onAngelicaWave(this);
      this.beginVulnerableWindow();
    }
    else {
      this.shockwaveDown();
      // original phase 2 double-tap kept for feel but second wave is a feint (fires off-screen side)
      setTimeout(() => {
        if (!this.dead && this.state !== State.DEATH && Game.game.state === "play") {
          const w = Game.game.world;
          const away = p => p ? -(U.sign(p.x - this.x) || -1) : 1;
          w.projectiles.push(new Shockwave({
            x: this.x, y: GROUND_Y - 8, dirX: 0.0001,
            speed: 150, damage: this.damage, knockback: 240,
          }));
        }
      }, 100);
      this.finishAttack();
    }
  }

  shockwaveDown() {
    // original phase2 fires downward shockwaves that then travel toward player
    const w = Game.game.world;
    const dirX = p => p ? U.sign(this.x - p.x) || -1 : -1;
    const p = w.player;
    w.projectiles.push(new Shockwave({
      x: this.x, y: GROUND_Y - 8,
      dirX: p ? U.sign(p.x - this.x) || -1 : -1,
      speed: 150, damage: this.damage, knockback: 240,
    }));
    Game.game.audio.play("gunshot", { pitch: 0.65, volume: 0.5 });
    Game.game.world && Game.game.world.shake(2, 0.1);
  }

  finishAttack() {
    this.attackCount++;
    if (this.attackCount >= this.attacksBeforeVulnerable) this.beginVulnerableWindow();
    else this.enterCooldown();
  }

  onWaveCleared() {
    this.spawningWave = false;
    this.endVulnerableWindow();
    if (this.phase === 1) {
      this.phase = 2;
      this.onPhaseChanged();
    }
    // resume the beat-driven attack cycle (phase 2 shockwaves)
    this.bossState = "cooldown";
    this.cooldownTimer = 0.6;
    this.waitingForBeat = false;
  }

  onPhaseChanged() {
    // phase 2: shockwave cycle shortens (original attack_count reset + tighter loop)
    this.attackCount = 0;
    this.attacksBeforeVulnerable = 3;
    Game.game.ui.toast("ANGELICA PHASE 2", "#b46aff");
    Game.game.audio.play("grunt", { pitch: 0.55, volume: 0.8 });
    Game.game.world.shake(3, 0.3);
  }

  update(dt, world) {
    // hover while armoured; drop to melee height while vulnerable (punish window)
    const target = this.isVulnerableWindow ? 5 : this.floatH;
    this.height += (target - this.height) * Math.min(1, dt * 6) + Math.sin(performance.now() * 0.0035) * 0.06;
    super.update(dt, world);
  }

  draw(ctx, camX, t) {
    if (this.dead) return;
    const sx = Math.round(this.x - camX), sy = Math.round(this.y - this.height - 12);
    if (Game.graphicsLevel !== "low") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      const g = ctx.createRadialGradient(sx, sy, 3, sx, sy, 34);
      g.addColorStop(0, `rgba(150,60,255,${0.12 + pulse * 0.1})`);
      g.addColorStop(1, "rgba(120,0,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(sx - 40, sy - 40, 80, 80);
    }
    ctx.save();
    ctx.translate(sx, sy);
    if (this.heading === -1) ctx.scale(-1, 1);
    if (this.hitFlash > 0) ctx.filter = Game.qaMode ? "none" : "brightness(2)";
    if (this.sheet.img) ctx.drawImage(this.sheet.img, -16, -16, 32, 32);
    ctx.filter = "none";
    ctx.restore();
    // vulnerable flicker (authentic: lerp 0.35..1 at speed 12)
    if (this.isVulnerableWindow && Game.graphicsLevel !== "low") {
      const flick = (Math.sin(t * 12) + 1) / 2;
      ctx.globalAlpha = U.lerp(0.35, 1, flick);
      if (this.sheet.img) ctx.drawImage(this.sheet.img, sx - 16, sy - 16, 32, 32);
      ctx.globalAlpha = 1;
    }
  }
}
