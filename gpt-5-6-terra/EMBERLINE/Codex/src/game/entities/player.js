import { COMBO, applyProgression, comboStep, comboTiming, takeDamage } from "../combat.js";
import { GAME } from "../level.js";

const BASE_STATS = Object.freeze({
  baseHp: 150,
  baseLight: 11,
  baseStorm: 34,
  baseSignal: 2
});

export class Player {
  constructor(physics, particles, audio, now = () => performance.now()) {
    this.physics = physics;
    this.particles = particles;
    this.audio = audio;
    this.now = now;
    this.maxHp = BASE_STATS.baseHp;
    this.hp = this.maxHp;
    this.energy = BASE_STATS.baseSignal;
    this.energyMax = BASE_STATS.baseSignal;
    this.x = 160;
    this.y = 360;
    this.vx = 0;
    this.vy = 0;
    this.width = 34;
    this.height = 68;
    this.facing = 1;
    this.onGround = false;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.action = null;
    this.actionTime = 0;
    this.attackHitIds = new Set();
    this.comboIndex = 0;
    this.comboWindow = 0;
    this.queuedAttack = false;
    this.dashTime = 0;
    this.dashCooldown = 0;
    this.invulnerable = 0;
    this.invulnerableUntil = 0;
    this.dashCooldownUntil = 0;
    this.hurtFlash = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.won = false;
    this.winTimer = 0;
    this.spawnFlash = 0.65;
    this.experience = 0;
    this.cores = 0;
    this.fragments = 0;
    this.bossesDefeated = 0;
    this.lastSafeX = 160;
    this.stepTime = 0;
    this.airAttacks = 0;
    this.lastMove = 0;
    this.actionRealStart = 0;
    this.actionRealElapsed = 0;
  }

  reset() {
    this.maxHp = BASE_STATS.baseHp;
    this.hp = this.maxHp;
    this.energy = BASE_STATS.baseSignal;
    this.energyMax = BASE_STATS.baseSignal;
    this.x = 160;
    this.y = 360;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.dead = false;
    this.deathTimer = 0;
    this.won = false;
    this.winTimer = 0;
    this.action = null;
    this.actionTime = 0;
    this.comboIndex = 0;
    this.comboWindow = 0;
    this.dashTime = 0;
    this.invulnerable = 0;
    this.invulnerableUntil = 0;
    this.dashCooldownUntil = 0;
    this.experience = 0;
    this.cores = 0;
    this.fragments = 0;
    this.bossesDefeated = 0;
    this.lastSafeX = 160;
    this.spawnFlash = 0.65;
  }

  get level() {
    return this.cores;
  }

  get stats() {
    return applyProgression(BASE_STATS, this.level);
  }

  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }
  get busy() { return Boolean(this.action) || this.dashTime > 0; }

  update(dt, input, level, enemies, camera) {
    if (this.won) {
      this.winTimer += dt;
      return;
    }
    if (this.dead) {
      this.deathTimer += dt;
      this.vx *= Math.pow(0.08, dt);
      this.physics.moveBody(this, dt, level, { allowDrop: true, damage: false });
      return;
    }
    if (this.y > GAME.height + 120) {
      this.hp = 0;
      this.dead = true;
      this.deathTimer = 0;
      this.vy = 0;
      this.audio.sfx("hurt");
      return;
    }
    if (this.y > GAME.height + 120) {
      this.hp = 0;
      this.dead = true;
      this.deathTimer = 0;
      this.vy = 0;
      this.audio.sfx("hurt");
      return;
    }

    for (const timer of ["hurtFlash", "comboWindow", "jumpBuffer", "spawnFlash", "dashTime"]) {
      this[timer] = Math.max(0, this[timer] - dt);
    }
    this.invulnerable = Math.max(0, this.invulnerableUntil - this.now());
    this.dashCooldown = Math.max(0, this.dashCooldownUntil - this.now());
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);

    const axis = input.axis();
    this.lastMove = axis;
    if (axis && !this.busy) this.facing = axis;
    this.tryActions(input, axis);

    if (!this.busy) {
      const targetSpeed = axis * 290;
      const acceleration = this.onGround ? 18 : 10;
      this.vx = this.physics.approach(this.vx, targetSpeed, acceleration * dt * 100);
      if (input.wasPressed("jump")) this.jumpBuffer = 0.12;
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.vy = -610;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.audio.sfx("jump");
        this.particles.burst(this.centerX, this.y + this.height, {
          count: 7, color: "#a8eaff", speed: 80, gravity: 260, life: 0.32, angle: Math.PI / 2, spread: 2.2
        });
      }
    } else {
      this.vx *= Math.pow(this.action ? 0.18 : 0.04, dt);
    }

    this.updateAction(dt, input, level, enemies, camera);
    this.physics.moveBody(this, dt, level, { allowDrop: !this.action });
    if (this.onGround && this.x > 180 && this.x < level.width - 80) this.lastSafeX = this.x;
    this.checkHazards(level, enemies, dt);

    this.stepTime += Math.abs(this.vx) * dt;
    if (this.onGround && Math.abs(this.vx) > 80 && this.stepTime > 42) {
      this.stepTime = 0;
      this.particles.burst(this.centerX - this.facing * 10, this.y + this.height, {
        count: 2, color: "#8fd9e8", speed: 40, gravity: 100, life: 0.2
      });
    }
  }

  tryActions(input, axis) {
    if (this.dashCooldown <= 0 && input.wasPressed("dash") && !this.busy) {
      const direction = axis || this.facing;
      this.facing = direction;
      this.dashTime = 0.22;
      this.dashCooldownUntil = this.now() + 620;
      this.invulnerableUntil = Math.max(this.invulnerableUntil, this.now() + 200);
      this.audio.sfx("dash");
      return;
    }

    if (this.dashTime > 0) {
      this.vx = this.facing * 670;
      this.vy = Math.min(this.vy, 0);
      return;
    }
    if (input.wasPressed("storm") && this.energy > 0 && !this.busy) {
      this.startAction("storm", 0.55, false);
      this.energy -= 1;
      this.audio.sfx("storm");
      return;
    }

    if (input.wasPressed("heavy") && !this.busy) {
      this.startAction("heavy", this.onGround ? 0.72 : 0.62, this.onGround);
      this.queuedAttack = false;
      return;
    }

    if (input.wasPressed("light")) {
      if (!this.busy) {
        const directional = !this.onGround && axis !== 0;
        const next = comboStep({ comboIndex: this.comboIndex, comboWindow: this.comboWindow }, true, directional);
        this.comboIndex = next;
        this.airAttacks = directional ? this.airAttacks + 1 : 0;
        this.startAction(directional ? "air" : "light", directional ? 0.6 : 0, this.onGround);
      } else if (this.action === "light" && this.comboWindow > 0) {
        this.queuedAttack = true;
      }
    }
  }

  startAction(action, overrideDuration = 0, useComboTiming = false) {
    this.action = action;
    this.actionRealStart = this.now();
    this.actionRealElapsed = 0;
    this.actionTime = 0;
    this.attackHitIds.clear();
    this.directional = action === "air";
    if (useComboTiming) {
      const index = Math.max(0, Math.min(2, this.comboIndex - 1));
      this.actionDuration = COMBO.WINDUP[index] + COMBO.ACTIVE[index] + COMBO.RECOVERY[index];
      this.actionWindow = COMBO.WINDUP[index];
    } else {
      this.actionDuration = overrideDuration;
      this.actionWindow = action === "storm" ? 0.2 : 0.18;
    }
    this.audio.sfx(action === "heavy" ? "heavy" : "swing");
  }

  updateAction(dt, input, level, enemies, camera) {
    if (!this.action) {
      if (this.queuedAttack) {
        this.queuedAttack = false;
        this.tryActions(input, this.lastMove);
      }
      return;
    }

    const previous = this.actionTime;
    this.actionTime += dt;
    this.actionRealElapsed = (this.now() - this.actionRealStart) * 1000;
    const active = this.actionRealElapsed >= this.actionWindow * 1000
      && this.actionRealElapsed < (this.actionWindow + 0.17) * 1000;
    if (active && this.action !== "storm") this.performMelee(enemies, camera);
    if (this.action === "storm" && this.actionTime >= 0.2) {
      this.performStorm(enemies, camera);
    }

    if (this.action === "light" && this.actionTime > this.actionWindow - 0.015) {
      this.comboWindow = Math.max(this.comboWindow, 0.42);
      if (this.queuedAttack) {
        this.queuedAttack = false;
        const next = comboStep({ comboIndex: this.comboIndex, comboWindow: this.comboWindow }, true, false);
        this.comboIndex = next;
        this.startAction("light", 0, true);
      }
    }

    if (this.actionTime >= this.actionDuration) {
      this.action = null;
      this.actionTime = 0;
    }
  }

  performMelee(enemies, camera) {
    const isAir = this.action === "air";
    const heavy = this.action === "heavy";
    const index = isAir ? 2 : Math.max(0, Math.min(2, this.comboIndex - 1));
    const range = heavy ? 122 : isAir ? 108 : COMBO.RANGE[index] + this.level * 2;
    const baseDamage = heavy ? 29 : isAir ? 25 : this.stats.lightDamage + index * 3;
    const hitbox = {
      left: this.facing > 0 ? this.centerX : this.centerX - range,
      right: this.facing > 0 ? this.centerX + range : this.centerX,
      top: isAir ? this.y - 42 : this.centerY - 42,
      bottom: isAir ? this.y + this.height + 20 : this.centerY + 42
    };
    for (const enemy of enemies) {
      if (enemy.dead || this.attackHitIds.has(enemy.uid)) continue;
      if (!this.physics.overlaps(hitbox, enemy.bounds())) continue;
      this.attackHitIds.add(enemy.uid);
      const result = takeDamage(enemy, baseDamage, {
        direction: this.facing,
        knockback: heavy ? 420 : isAir ? 350 : COMBO.KNOCKBACK[index],
        lift: isAir && this.airAttacks >= 3 ? -420 : isAir ? -180 : COMBO.LIFT[index],
        heavy,
        directional: isAir,
        armorBreak: heavy,
        knockdown: heavy || isAir
      });
      this.particles.damage(enemy.centerX, enemy.y, result.dealt, result.blocked ? "#a8b0c8" : "#fff0a3");
      this.particles.burst(enemy.centerX, enemy.centerY, {
        count: heavy ? 18 : 10,
        color: result.blocked ? "#b4c3d8" : "#ffc56d",
        speed: heavy ? 250 : 180,
        life: 0.38,
        gravity: 180
      });
      this.audio.sfx(heavy ? "heavy" : "hit");
      camera.hitstop = Math.max(camera.hitstop, heavy ? 0.085 : 0.045);
      camera.shake = Math.max(camera.shake, heavy ? 10 : 4.5);
      if (result.dead) this.awardKill(enemy);
    }
  }

  performStorm(enemies, camera) {
    if (this.attackHitIds.has("storm")) return;
    this.attackHitIds.add("storm");
    const radius = 190;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = enemy.centerX - this.centerX;
      const dy = enemy.centerY - this.centerY;
      if (Math.hypot(dx, dy) > radius + enemy.width * 0.5) continue;
      const direction = Math.sign(dx) || this.facing;
      const result = takeDamage(enemy, this.stats.stormDamage, {
        direction,
        damageType: "storm",
        knockback: 260,
        armorBreak: true
      });
      this.particles.damage(enemy.centerX, enemy.y, result.dealt, "#8ceeff");
      if (result.dead) this.awardKill(enemy);
    }
    this.particles.ring(this.centerX, this.centerY, { radius: 30, speed: 330, color: "#64e6ff", count: 34 });
    this.particles.burst(this.centerX, this.centerY, { count: 28, color: "#8cecff", speed: 340, gravity: 40, life: 0.7 });
    camera.hitstop = 0.1;
    camera.shake = 14;
  }

  awardKill(enemy) {
    this.experience += enemy.xp || 12;
    this.particles.burst(enemy.centerX, enemy.centerY, { count: 20, color: enemy.coreColor || "#ffd071", speed: 220, life: 0.6 });
  }

  takeHit(damage, direction, knockback = 220) {
    if (this.dead || this.won || this.invulnerable > 0) return false;
    const result = takeDamage(this, damage, { direction, knockback, lift: -240 });
    if (result.dealt <= 0) return false;
    this.invulnerableUntil = this.now() + 620;
    this.action = null;
    this.dashTime = 0;
    this.hurtFlash = 0.2;
    this.audio.sfx("hurt");
    this.particles.damage(this.centerX, this.y, result.dealt, "#ff6c82");
    this.particles.burst(this.centerX, this.centerY, { count: 12, color: "#ff7088", speed: 180, life: 0.45 });
    if (this.hp <= 0) {
      this.dead = true;
      this.deathTimer = 0;
      this.vy = -360;
    }
    return true;
  }

  collect(type) {
    if (type === "core") {
      if (this.cores >= 3) {
        this.hp = Math.min(this.maxHp, this.hp + 48);
        this.energy = Math.min(this.energyMax, this.energy + 1);
      } else {
        this.cores += 1;
        const previousMax = this.maxHp;
        this.maxHp = this.stats.maxHp;
        this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - previousMax) + 30);
      }
    } else {
      this.fragments = Math.min(4, this.fragments + 1);
      this.energy = Math.min(this.energyMax + 1, this.energy + 1);
    }
    this.audio.sfx("pickup");
  }

  heal(amount) {
    this.hp = Math.max(0, Math.min(this.maxHp, this.hp + amount));
  }

  checkHazards(level, enemies, dt) {
    for (const vent of level.vents) {
      vent.active = ((performance.now() / 1000 + vent.offset) % vent.period) < 0.72;
      if (vent.active && vent.x > this.x - 60 && vent.x < this.x + 120 && this.onGround) {
        this.y -= 360 * dt;
        this.onGround = false;
        this.vy = Math.min(this.vy, -120);
        this.particles.burst(this.centerX, this.y + this.height, {
          count: 2, color: "#d5f6ff", speed: 110, angle: -Math.PI / 2, spread: 1.2, life: 0.3
        });
      }
    }
    for (const enemy of enemies) {
      if (enemy.dead || enemy.projectile || !this.physics.overlaps(this.bounds(), enemy.bounds())) continue;
      if (enemy.kind === "spark" || enemy.kind === "warden") continue;
      if (this.takeHit(enemy.contactDamage || 10, Math.sign(this.centerX - enemy.centerX) || 1, enemy.knockback || 190)) {
        this.vy = -260;
      }
    }
  }

  bounds() {
    return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height };
  }

  actionPhase() {
    if (this.action === "light") return comboTiming(this.comboIndex, this.actionTime);
    if (!this.action) return "idle";
    const ratio = this.actionTime / this.actionDuration;
    if (ratio < 0.35) return "windup";
    if (ratio < 0.62) return "active";
    return "recovery";
  }
}

export { BASE_STATS };
