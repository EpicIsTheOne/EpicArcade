// MINDLESS-Hermes :: entities.js — characters, twins, MIND units, bosses, projectiles
"use strict";

const GRAVITY = 600;           // original constant
const GROUND_Y = 120;          // world ground line (feet)
const State = {
  IDLE: 0, WALK: 1, ATTACK: 2, TAKEOFF: 3, JUMP: 4, LAND: 5, JUMPKICK: 6,
  HURT: 7, FALL: 8, GROUNDED: 9, DEATH: 10, FLY: 11, PREP_ATTACK: 12, SWAP: 13,
};
const HitType = { NORMAL: 0, POWER: 1, KNOCKDOWN: 2 };
const Type = {
  PLAYER: 0, BASIC_ENEMY: 1, DASH_ENEMY: 2, ELITE_DASHER_ENEMY: 3,
  EVANGELINE: 4, EDEN: 5, ANGELICA: 6,
};

let ENT_ID = 1;

// =====================================================================
// Character — faithful port of the original base class
// =====================================================================
class Character {
  constructor(cfg = {}) {
    this.id = ENT_ID++;
    this.type = cfg.type ?? Type.BASIC_ENEMY;
    this.x = cfg.x ?? 0;
    this.y = cfg.y ?? GROUND_Y;      // ground line anchor
    this.height = 0;                  // pseudo-z
    this.heightSpeed = 0;
    this.vx = 0; this.vy = 0;         // ground-plane velocity
    this.speed = cfg.speed ?? 60;
    this.heading = 1;                 // 1 = right (Vector2.RIGHT), -1 = left
    this.state = State.IDLE;
    this.maxHealth = cfg.maxHealth ?? 10;
    this.currentHealth = this.maxHealth;
    this.damage = cfg.damage ?? 2;
    this.damagePower = cfg.damagePower ?? this.damage * 2;
    this.knockbackIntensity = cfg.knockbackIntensity ?? 100;
    this.knockbackResistance = cfg.knockbackResistance ?? 1.0;
    this.flightSpeed = cfg.flightSpeed ?? 160;
    this.knockdownIntensity = cfg.knockdownIntensity ?? 180;
    this.jumpIntensity = cfg.jumpIntensity ?? 190;
    this.flyDuration = cfg.flyDuration ?? 0.25;
    this.durationGrounded = cfg.durationGrounded ?? 900; // ms lying down
    this.canRespawn = false;
    this.comboNum = cfg.comboNum ?? 0;
    this.canCombo = cfg.canCombo ?? false;
    this.dead = false;
    this.deadTimer = 0;
    this.flyEndTime = 0;
    this.timeSinceGrounded = 0;
    this.animTime = 0;
    this.animName = "idle";
    this.animDone = false;
    this.animSpeed = 1;
    this.hitFlash = 0;
    this.weakenedTimer = 0;           // Nova Disruptor debuff
    this.statuses = new Set();
    this.facingLocked = false;
    this.shadowW = cfg.shadowW ?? 14;
    this.sheet = null;                // {img, fw, fh}
    this.animMap = Character.baseAnimMap();
    this.onDeathCb = null;
    this.onHitLandedCb = null;
    this.isBoss = false;
    this.invulnerable = false;
    this.zLayer = 0;
  }

  static baseAnimMap() {
    return {
      idle: { frames: [2], fps: 2, loop: true },
      walk: { frames: [2, 3], fps: 7.5, loop: true },   // original: [2,3] over 0.8s? original alternates each 0.1s => 10fps pair
      attack: { frames: [1, 3, 2, 0], fps: 26, loop: false },   // punch 0.15s
      punch_alt: { frames: [3, 0, 3, 2], fps: 26, loop: false },
      roundkick: { frames: [2, 0, 1, 2], fps: 24, loop: false },
      takeoff: { frames: [1], fps: 10, loop: false },
      jump: { frames: [3], fps: 10, loop: true },
      jumpkick: { frames: [0], fps: 10, loop: true },
      land: { frames: [0], fps: 10, loop: false },
      fall: { frames: [3], fps: 10, loop: false },
      grounded: { frames: [2], fps: 2, loop: true },
      hurt: { frames: [3, 1, 2], fps: 10, loop: false },
      fly: { frames: [1], fps: 10, loop: true },
      prep: { frames: [1], fps: 6, loop: true },
      death: { frames: [2], fps: 2, loop: true },
    };
  }

  playAnim(name, restart = false) {
    if (this.animName !== name || restart) {
      this.animName = name;
      this.animTime = 0;
      this.animDone = false;
    }
  }

  get animFrame() {
    const a = this.animMap[this.animName] || this.animMap.idle;
    const idx = Math.floor(this.animTime * a.fps * this.animSpeed);
    if (a.loop) return a.frames[idx % a.frames.length];
    return a.frames[Math.min(idx, a.frames.length - 1)];
  }

  get animFinished() {
    const a = this.animMap[this.animName] || this.animMap.idle;
    if (a.loop) return false;
    return this.animTime >= a.frames.length / a.fps / this.animSpeed;
  }

  canMove() { return this.state === State.IDLE || this.state === State.WALK; }
  canAttack() { return this.state === State.IDLE || this.state === State.WALK; }
  canGetHurt() {
    // faithful to original: grounded/flying/hurt bodies cannot be re-hit (no infinite juggle)
    return [State.IDLE, State.WALK, State.TAKEOFF, State.JUMP, State.LAND, State.PREP_ATTACK].includes(this.state);
  }
  isCollisionDisabled() { return [State.GROUNDED, State.DEATH].includes(this.state); }

  setHealth(hp) { this.currentHealth = U.clamp(hp, 0, this.maxHealth); }

  receiveDamage(amount, dirX, hitType, knockback, source) {
    if (this.invulnerable || this.dead) return false;
    if (!this.canGetHurt()) return false;
    let dmg = amount;
    if (this.weakenedTimer > 0 && source === "melee") dmg = Math.round(dmg * 1.5);
    this.setHealth(this.currentHealth - dmg);
    this.hitFlash = 0.12;
    const kb = knockback * this.knockbackResistance;
    if (this.currentHealth <= 0 || hitType === HitType.KNOCKDOWN) {
      this.state = State.FALL;
      this.heightSpeed = this.knockdownIntensity;
      this.vx = dirX * kb;
      this.playAnim("fall", true);
      Game.game && Game.game.onHeavyBlow(this);
    } else if (hitType === HitType.POWER) {
      this.state = State.FLY;
      this.vx = dirX * this.flightSpeed;
      this.flyEndTime = performance.now() + this.flyDuration * 1000;
      this.playAnim("fly", true);
      Game.game && Game.game.onHeavyBlow(this);
    } else {
      this.state = State.HURT;
      this.vx = dirX * kb;
      this.playAnim("hurt", true);
    }
    if (this.currentHealth <= 0 && this.onDeathCb) this.onDeathCb(this);
    if (this.onHitLandedCb && source) this.onHitLandedCb(this, source, dmg, hitType);
    return true;
  }

  update(dt, world) {
    this.animTime += dt * this.animSpeed;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.weakenedTimer > 0) this.weakenedTimer -= dt;

    // DEATH LOCKOUT: zero-health characters may never act — funnel to the dying pipeline.
    if (this.currentHealth <= 0 && ![State.FALL, State.GROUNDED, State.DEATH].includes(this.state)) {
      this.state = State.FALL;
      this.heightSpeed = Math.max(this.heightSpeed, this.knockdownIntensity * 0.5);
      this.playAnim("fall", true);
    }
    if (this.currentHealth <= 0 && this.state !== State.DEATH) this.invulnerable = true;

    // pseudo-z physics (faithful handle_air_time) — DEATH is terminal, never lands back into the cycle
    if (this.state !== State.DEATH && (this.height > 0 || [State.JUMP, State.JUMPKICK, State.FALL].includes(this.state))) {
      this.height += this.heightSpeed * dt;
      if (this.height <= 0) {
        this.height = 0;
        if (this.state === State.FALL) {
          this.state = State.GROUNDED;
          this.timeSinceGrounded = 0;
          world && world.dust(this.x, this.y, 4);
        } else if (this.state !== State.DEATH) {
          this.state = State.LAND;
          this.playAnim("land", true);
        }
        this.heightSpeed = 0;
        this.vx = 0;
      } else {
        this.heightSpeed -= GRAVITY * dt;
      }
    }

    // FLY: slide until timer or wall (faithful)
    if (this.state === State.FLY) {
      this.x += this.vx * dt;
      if (world && world.clampToWalls(this, true)) {
        this.state = State.FALL;
        this.heightSpeed = this.knockdownIntensity;
        this.vx = -this.vx * 0.5;
        world.shake(2, 0.12);
      } else if (performance.now() >= this.flyEndTime) {
        this.state = State.HURT;
        this.vx = 0;
      }
    } else {
      this.x += this.vx * dt;
      if (this.state !== State.GROUNDED && this.state !== State.DEATH) {
        this.vx = U.moveToward(this.vx, 0, 260 * dt); // friction
      }
    }

    // grounded lying -> get up or die
    if (this.state === State.GROUNDED) {
      this.timeSinceGrounded += dt * 1000;
      if (this.timeSinceGrounded > this.durationGrounded) {
        if (this.currentHealth <= 0) this.state = State.DEATH;
        else { this.state = State.LAND; this.playAnim("land", true); }
      }
    }

    if (this.state === State.DEATH) {
      this.deadTimer += dt;
      if (this.deadTimer > 1.2 && !this.dead) {
        this.dead = true;
        if (this.onDeathCb) this.onDeathCb(this);
      }
    }

    if (world && this.state !== State.FLY) world.clampToWalls(this, false);

    // HURT recovery for all characters (enemy AI only handles its own ATTACK)
    if (this.state === State.HURT && this.animFinished) this.state = State.IDLE;

    // animation state mapping (faithful anim_map)
    if (this.state === State.IDLE) this.playAnim("idle");
    else if (this.state === State.WALK) this.playAnim("walk");
    else if (this.state === State.ATTACK) { /* attack anim set by attack starter */ }
    else if (this.state === State.HURT) this.playAnim("hurt");
    else if (this.state === State.GROUNDED || this.state === State.DEATH) this.playAnim("grounded");
  }

  draw(ctx, camX, t) {
    if (this.dead) return;
    const sx = Math.round(this.x - camX);
    const sy = Math.round(this.y - this.height);
    // shadow (original prop-shadow)
    const shW = this.shadowW * U.clamp(1 - this.height / 140, 0.35, 1);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(sx, this.y + 1, shW, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!this.sheet) return;
    const { img, fw, fh } = this.sheet;
    const frame = this.animFrame;
    const fx = (frame % (img.width / fw)) * fw;
    const fy = Math.floor(frame / (img.width / fw)) * fh;
    ctx.save();
    ctx.translate(sx, sy);
    if (this.heading === -1) ctx.scale(-1, 1);
    if (this.hitFlash > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = Game.qaMode ? "none" : "brightness(2.2) saturate(0.3)";
    }
    if (this.state === State.GROUNDED || this.state === State.DEATH) {
      ctx.rotate(this.heading === 1 ? -Math.PI / 2 * 0.9 : Math.PI / 2 * 0.9);
      ctx.translate(0, -6);
    }
    // draw centered horizontally, feet at y=0
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, fx, fy, fw, fh, Math.round(-fw / 2), -fh + 2, fw, fh);
    ctx.filter = "none";
    // weaken tint (Disruptor debuff)
    if (this.weakenedTimer > 0) {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 10);
      ctx.fillStyle = "#7dffcf";
      ctx.fillRect(-fw / 2, -fh + 2, fw, fh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

// =====================================================================
// Player — the twins
// =====================================================================
class Player extends Character {
  constructor(cfg = {}) {
    super(Object.assign({
      type: Type.PLAYER, maxHealth: 20, speed: 78, damage: 3, damagePower: 7,
      knockbackIntensity: 120, comboNum: 2, canCombo: true, shadowW: 13,
    }, cfg));
    this.twin = "ecliptio";                    // ecliptio | nova
    this.swapCooldownMs = 500;
    this.lastSwapTime = -99999;
    this.novaCooldownMs = 200;
    this.lastNovaTime = -99999;
    this.attackComboIndex = 0;
    this.lastHitSuccessful = false;
    this.attackHitDone = false;                // one damage window per swing
    this.attackHitLanded = false;
    // Ecliptio Rage (Nationals spec)
    this.rage = 0; this.rageMax = 100;
    this.rageState = "none";                   // none | active | exhausted
    this.rageTimer = 0;
    this.rageConfig = { duration: 5, exhaustDuration: 6, dmgMult: 2.0, atkSpeedMult: 1.25, exhaustDmgTaken: 1.5, exhaustAtkSpeed: 0.65 };
    // Nova modes (Nationals spec)
    this.novaMode = 0;                         // 0 PULSE, 1 DISRUPTOR, 2 OVERCLOCK
    this.novaModeNames = ["PULSE", "DISRUPTOR", "OVERCLOCK"];
    this.overclockStreak = 0;
    this.jumpHeldUsed = false;
    this.sheetE = { img: Assets.images.ecliptio, fw: 64, fh: 64 };
    this.sheetN = { img: Assets.images.nova, fw: 64, fh: 64 };
    this.sheet = this.sheetE;
    this.swapFlash = 0;
  }

  swapTwin(now) {
    if (now - this.lastSwapTime < this.swapCooldownMs) return false;
    if (![State.IDLE, State.WALK].includes(this.state)) return false;
    this.twin = this.twin === "ecliptio" ? "nova" : "ecliptio";
    this.sheet = this.twin === "ecliptio" ? this.sheetE : this.sheetN;
    this.lastSwapTime = now;
    this.swapFlash = 0.25;
    this.endRage(true);
    // original: swapping to Nova unmutes the metronome layer
    Game.game && Game.game.onTwinSwapped(this.twin);
    return true;
  }

  cycleNovaMode() {
    if (this.twin !== "nova") return false;
    if (![State.IDLE, State.WALK].includes(this.state)) return false;
    this.novaMode = (this.novaMode + 1) % 3;
    Game.game && Game.game.ui.toastNovaMode(this.novaModeNames[this.novaMode]);
    return true;
  }

  addRage(amount) {
    if (this.rageState !== "none" || this.twin !== "ecliptio") return;
    this.rage = U.clamp(this.rage + amount, 0, this.rageMax);
  }

  activateRage(now) {
    if (this.twin !== "ecliptio" || this.rage < this.rageMax || this.rageState !== "none") return false;
    this.rageState = "active";
    this.rageTimer = this.rageConfig.duration;
    this.invulnerable = true;
    Game.game && Game.game.ui.toast("RAGE");
    Game.game && Game.game.audio.play("powermove", { pitch: 0.8 });
    return true;
  }

  endRage(silent = false) {
    if (this.rageState === "active") {
      this.rageState = silent ? "none" : "exhausted";
      this.rageTimer = silent ? 0 : this.rageConfig.exhaustDuration;
      if (!silent) this.rage = 0;
    } else if (this.rageState === "exhausted") {
      this.rageState = "none"; this.rageTimer = 0;
    }
    this.invulnerable = false;
  }

  updateRage(dt) {
    if (this.rageState === "active") {
      this.rageTimer -= dt;
      if (this.rageTimer <= 0) { this.rageState = "exhausted"; this.rageTimer = this.rageConfig.exhaustDuration; this.invulnerable = false; this.rage = 0; }
    } else if (this.rageState === "exhausted") {
      this.rageTimer -= dt;
      if (this.rageTimer <= 0) this.rageState = "none";
    }
    this.animSpeed = this.rageState === "active" ? this.rageConfig.atkSpeedMult
      : this.rageState === "exhausted" ? this.rageConfig.exhaustAtkSpeed : 1;
  }

  handleInput(now, world) {
    const mv = Input.moveVector();
    if (this.canMove()) {
      this.vx = mv.x * this.speed * (this.rageState === "exhausted" ? 0.85 : 1);
      this.vy = mv.y * this.speed * 0.4;   // slight depth movement for feel (visual only)
      this.heading = mv.x !== 0 ? (mv.x > 0 ? 1 : -1) : this.heading;
    } else if (![State.FLY, State.FALL, State.GROUNDED, State.HURT].includes(this.state)) {
      // keep momentum during attacks (original keeps velocity from before)
    }

    const canAttack = this.canAttack();
    if (canAttack && this.twin === "ecliptio" && Input.attackPressed()) {
      this.startMeleeAttack(now);
    }
    if (canAttack && this.twin === "nova" && now - this.lastNovaTime >= this.novaCooldownMs && Input.attackPressed()) {
      const enemy = world.randomEnemyPreferFacing(this);
      if (enemy) {
        this.state = State.ATTACK;
        this.playAnim(this.attackAnimForNova(), true);
        this.fireNovaShot(enemy, now, world);
        this.lastNovaTime = now;
      } else {
        // dry fire feedback (original only fires with target; give whiff anim)
        this.state = State.ATTACK;
        this.playAnim(this.attackAnimForNova(), true);
        Game.game && Game.game.audio.play("miss", { volume: 0.5 });
        this.lastNovaTime = now;
      }
    }
    if (this.canJump() && this.twin === "ecliptio" && Input.jumpPressed()) {
      this.state = State.TAKEOFF;
      this.playAnim("takeoff", true);
      Game.game && Game.game.audio.play("fwehh");
      Game.game && Game.game.world && Game.game.world.dust(this.x, this.y, 3);
    }
    if ((this.state === State.JUMP || this.state === State.LAND) && Input.attackPressed()) {
      this.state = State.JUMPKICK;
      this.playAnim("jumpkick", true);
      this.attackHitDone = false;
      Game.game && Game.game.audio.play("powermove");
    }
    if (Input.swapPressed()) this.swapTwin(now);
    if (Input.justPressed("KeyQ") || Input.justPressed("Tab")) this.cycleNovaMode();
    if (Input.justPressed("KeyV")) this.activateRage(now);
  }

  canJump() { return this.state === State.IDLE || this.state === State.WALK; }

  attackAnimForNova() { return "punch_alt"; }

  startMeleeAttack(now) {
    this.state = State.ATTACK;
    this.attackHitDone = false;
    this.attackHitLanded = false;
    const chain = ["attack", "punch_alt", "roundkick"];   // punch, alt, roundkick finisher
    const idx = this.lastHitSuccessful ? (this.attackComboIndex + 1) % 3 : 0;
    this.attackComboIndex = idx;
    this.playAnim(chain[idx], true);
    const sfx = ["atk1", "atk2", "atk3"][idx];
    Game.game && Game.game.audio.play(sfx, { pitch: U.rand(0.95, 1.06) });
    if (this.rageState === "active") Game.game && Game.game.audio.play("atk3", { pitch: 1.3, volume: 0.4 });
  }

  // melee hit window: middle of the swing
  tryMeleeHit(world) {
    if (this.attackHitDone) return;
    if (![State.ATTACK, State.JUMPKICK].includes(this.state)) return;
    const a = this.animMap[this.animName];
    const prog = this.animTime * a.fps * this.animSpeed;
    if (prog < 0.6) return;                       // hit lands just past windup
    this.attackHitDone = true;
    const reach = this.state === State.JUMPKICK ? 15 : 17;
    const isFinisher = this.state === State.JUMPKICK || (this.twin === "ecliptio" && this.attackComboIndex === 2);
    let dmg = this.state === State.JUMPKICK ? 4 : this.damage;
    if (this.rageState === "active") dmg = Math.round(dmg * this.rageConfig.dmgMult);
    const hitType = isFinisher ? HitType.POWER : HitType.NORMAL;
    const kb = isFinisher ? this.knockbackIntensity * 1.6 : this.knockbackIntensity;
    let hitAny = false;
    for (const e of world.enemies) {
      if (e.dead || (e.isBoss && e.invulnerable)) continue;
      const dx = e.x - this.x;
      const inFront = this.heading === 1 ? dx >= -8 && dx <= reach + e.shadowW * 0.5 + 4 : dx <= 8 && dx >= -(reach + e.shadowW * 0.5 + 4);
      const dyOk = Math.abs((e.y) - (this.y)) < 22;
      const heightOk = Math.abs(e.height - this.height) < 26;
      if (inFront && dyOk && heightOk && !e.dead) {
        const landed = e.receiveDamage(dmg, this.heading, hitType, kb, "melee");
        if (landed) {
          hitAny = true;
          Game.game.onMeleeHit(this, e, dmg, hitType, isFinisher);
        }
      }
    }
    if (hitAny) {
      this.lastHitSuccessful = true;
      this.attackHitLanded = true;
    }
  }

  fireNovaShot(enemy, now, world) {
    const beat = Game.game.beat.gradePlayerAction();
    const grade = beat.grade;
    const mode = this.novaMode;
    // authentic scaling tables
    const dmgTable = [2.0, 1.3, 1.0, 0.6];
    const spdTable = [1.6, 1.3, 1.0, 0.8];
    const kbTable = [3.5, 1.5, 1.0, 0.6];
    let baseDamage = 2;
    if (mode === 1) baseDamage = 1.4;            // Disruptor lower direct dmg
    if (this.rageState === "active") { /* rage is ecliptio-only; noop */ }
    const dmg = Math.max(1, Math.round(baseDamage * dmgTable[grade]));
    const speed = 130 * spdTable[grade];
    const kb = 100 * kbTable[grade];

    const note = new NoteProjectile({
      x: this.x + this.heading * 6, y: this.y - 12 - this.height,
      dirX: this.heading, target: enemy, damage: dmg, speed, knockback: kb,
      grade, mode, ownerId: this.id,
    });
    // Overclock: 3-streak on-beat -> piercing triple spread
    if (mode === 2) {
      if (grade <= BeatGrade.OKAY) this.overclockStreak++;
      else this.overclockStreak = 0;
      if (this.overclockStreak >= 3) {
        this.overclockStreak = 0;
        note.piercing = true;
        for (const spread of [-0.35, 0.35]) {
          const n2 = new NoteProjectile({
            x: note.x, y: note.y, dirX: this.heading, target: enemy, damage: Math.max(1, dmg - 1),
            speed: speed * 1.1, knockback: kb * 0.6, grade, mode, ownerId: this.id,
          });
          n2.vx = Math.cos(spread) * speed * this.heading * 1.1;
          n2.vy = Math.sin(spread) * speed;
          n2.homing = false; n2.piercing = true; n2.green = false;
          world.projectiles.push(n2);
        }
        Game.game.ui.toast("OVERCLOCK BURST");
      }
    }
    world.projectiles.push(note);
    Game.game.onNovaShot(grade);
  }

  update(dt, world) {
    this.updateRage(dt);
    if (this.swapFlash > 0) this.swapFlash -= dt;
    this.handleInput(performance.now(), world);
    super.update(dt, world);
    if (this.state === State.ATTACK || this.state === State.JUMPKICK) this.tryMeleeHit(world);
    if ((this.state === State.ATTACK) && this.animFinished) { this.state = State.IDLE; }
    if (this.state === State.TAKEOFF && this.animFinished) {
      this.state = State.JUMP;
      this.heightSpeed = this.jumpIntensity;
      this.playAnim("jump", true);
    }
    if (this.state === State.JUMP && this.height <= 0 && this.heightSpeed <= 0 && this.animName === "jump") {
      // handled by base (LAND)
    }
    if (this.state === State.LAND && this.animFinished) this.state = State.IDLE;
    if (this.state === State.HURT && this.animFinished) this.state = State.IDLE;
    // clamp inside stage
    this.y = GROUND_Y;
  }

  receiveDamage(amount, dirX, hitType, knockback, source) {
    if (this.rageState === "active") {         // Rage: invulnerable (original spec)
      Game.game && Game.game.world && Game.game.world.sparkBurst(this.x, this.y - this.height - 12, "#ff5060", 4);
      return false;
    }
    if (this.rageState === "exhausted") amount = Math.round(amount * this.rageConfig.exhaustDmgTaken);
    const ok = super.receiveDamage(amount, dirX, hitType, knockback, source);
    if (ok) {
      this.addRage(4);
      Game.game.audio.play("hurt", { pitch: U.rand(0.9, 1.15) });
      Game.game.ui.flashHealth();
    }
    return ok;
  }

  draw(ctx, camX, t) {
    super.draw(ctx, camX, t);
    // twin aura
    if (Game.graphicsLevel !== "low") {
      const sx = Math.round(this.x - camX), sy = Math.round(this.y - this.height - 14);
      const col = this.twin === "ecliptio" ? "255,60,70" : "70,255,140";
      if (this.rageState === "active") {
        const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 22);
        g.addColorStop(0, "rgba(255,255,255,0.5)");
        g.addColorStop(0.4, "rgba(255,60,60,0.35)");
        g.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - 24, sy - 24, 48, 48);
      } else if (this.swapFlash > 0) {
        ctx.strokeStyle = `rgba(${col},${this.swapFlash * 3})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, 14 + (0.25 - this.swapFlash) * 60, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
}

// =====================================================================
// Note projectile — Nova's music note (authentic behavior)
// =====================================================================
class NoteProjectile {
  constructor(cfg) {
    this.id = ENT_ID++;
    this.x = cfg.x; this.y = cfg.y;
    this.dirX = cfg.dirX || 1;
    this.target = cfg.target;
    this.damage = cfg.damage;
    this.speed = cfg.speed;
    this.knockback = cfg.knockback;
    this.grade = cfg.grade;
    this.mode = cfg.mode ?? 0;
    this.ownerId = cfg.ownerId;
    this.vx = this.dirX * this.speed;
    this.vy = 0;
    this.homing = true;
    this.piercing = false;
    this.life = 2.2;
    this.dead = false;
    this.green = this.mode === 1;              // Disruptor = green notes
    this.trail = [];
    this.hitSet = new Set();
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.homing && this.target && !this.target.dead) {
      const tx = this.target.x, ty = this.target.y - this.target.height - 12;
      const ang = Math.atan2(ty - this.y, tx - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      let d = ang - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = U.clamp(d, -6 * dt, 6 * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(cur + turn) * sp;
      this.vy = Math.sin(cur + turn) * sp;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (Game.graphicsLevel !== "low" && Math.random() < 0.6) {
      this.trail.push({ x: this.x, y: this.y, a: 1 });
      if (this.trail.length > 6) this.trail.shift();
    }
    for (const tr of this.trail) tr.a -= dt * 3;
    // hit detection vs enemies
    for (const e of world.enemies) {
      if (e.dead || this.hitSet.has(e.id)) continue;
      if (e.isBoss && e.invulnerable) continue;
      const dx = e.x - this.x, dy = (e.y - e.height - 12) - this.y;
      if (Math.abs(dx) < 10 + e.shadowW * 0.4 && Math.abs(dy) < 14) {
        this.hitSet.add(e.id);
        const src = this.mode === 1 ? "nova_disruptor" : "nova";
        const landed = e.receiveDamage(this.damage, U.sign(this.vx) || 1, HitType.NORMAL, this.knockback, src);
        if (landed) {
          if (this.mode === 1 && this.grade <= BeatGrade.OKAY) {
            e.weakenedTimer = 3 + (2 - this.grade) * 1.5;   // better grade = longer debuff
            Game.game.ui.spawnGradePop(this.x, this.y - 20, "WEAKEN", "#7dffcf");
          }
          if (!this.piercing) this.dead = true;
          Game.game.onNovaHit(this, e, landed);
        }
      }
    }
    if (this.x < world.camX - 30 || this.x > world.camX + Game.W + 30) this.dead = true;
  }
  draw(ctx, camX, t) {
    const img = Assets.images[this.green ? "note_green" : "note_orange"];
    if (!img) return;
    // trail
    for (const tr of this.trail) {
      if (tr.a <= 0) continue;
      ctx.globalAlpha = tr.a * 0.5;
      ctx.drawImage(img, Math.round(tr.x - camX) - 4, Math.round(tr.y) - 4, 8, 8);
    }
    ctx.globalAlpha = 1;
    const bob = Math.sin(t * 14 + this.id) * 1.5;
    const pulse = this.grade === BeatGrade.PERFECT ? 1.35 : 1;
    const s = 8 * pulse;
    ctx.drawImage(img, Math.round(this.x - camX) - s / 2, Math.round(this.y + bob) - s / 2, s, s);
    if (this.grade === BeatGrade.PERFECT && Game.graphicsLevel !== "low") {
      ctx.strokeStyle = "rgba(255,220,90,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(Math.round(this.x - camX), Math.round(this.y + bob), s, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// Enemy shockwave — Evangeline/Angelica red arc (authentic)
class Shockwave {
  constructor(cfg) {
    this.x = cfg.x; this.y = cfg.y ?? GROUND_Y - 8;
    this.dirX = cfg.dirX || -1;
    this.speed = cfg.speed ?? 150;
    this.damage = cfg.damage ?? 3;
    this.knockback = cfg.knockback ?? 250;
    this.dead = false;
    this.life = 4;
    this.t = 0;
  }
  update(dt, world) {
    this.t += dt;
    this.life -= dt;
    this.x += this.dirX * this.speed * dt;
    const p = world.player;
    if (p && !p.dead && p.canGetHurt()) {
      const dx = p.x - this.x;
      const dy = (p.y - p.height - 8) - this.y;
      if (Math.abs(dx) < 9 && Math.abs(dy) < 14 && p.height < 18) {
        if (p.receiveDamage(this.damage, this.dirX, HitType.KNOCKDOWN, this.knockback, "shockwave")) {
          this.dead = true;
        }
      }
    }
    if (this.life <= 0 || this.x < world.camX - 40 || this.x > world.camX + Game.W + 40) this.dead = true;
  }
  draw(ctx, camX, t) {
    const img = Assets.images.shockwave;
    if (!img) return;
    const sx = Math.round(this.x - camX), sy = Math.round(this.y);
    ctx.save();
    ctx.translate(sx, sy);
    if (this.dirX === 1) ctx.scale(-1, 1);
    if (Game.graphicsLevel !== "low") {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(img, -20, -20, 40, 40);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, -12, -12, 24, 24);
    ctx.restore();
  }
}

// Enemy music note (EDEN / shooter units) — orange/green alternating
class EnemyNote {
  constructor(cfg) {
    this.x = cfg.x; this.y = cfg.y;
    this.vx = cfg.vx; this.vy = cfg.vy ?? 0;
    this.damage = cfg.damage ?? 2;
    this.knockback = cfg.knockback ?? 110;
    this.green = !!cfg.green;
    this.life = cfg.life ?? 3.5;
    this.dead = false;
  }
  update(dt, world) {
    this.life -= dt; if (this.life <= 0) this.dead = true;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const p = world.player;
    if (p && !p.dead && p.canGetHurt()) {
      const dx = p.x - this.x, dy = (p.y - p.height - 12) - this.y;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 13) {
        if (p.receiveDamage(this.damage, U.sign(this.vx) || -1, HitType.NORMAL, this.knockback, "enemy_note")) this.dead = true;
      }
    }
  }
  draw(ctx, camX, t) {
    const img = Assets.images[this.green ? "note_green" : "note_orange"];
    if (!img) return;
    const bob = Math.sin(t * 12 + this.x) * 1.2;
    ctx.drawImage(img, Math.round(this.x - camX) - 4, Math.round(this.y + bob) - 4, 8, 8);
    if (Game.graphicsLevel !== "low") {
      ctx.globalAlpha = 0.25;
      ctx.drawImage(img, Math.round(this.x - camX) - 6, Math.round(this.y + bob) - 6, 12, 12);
      ctx.globalAlpha = 1;
    }
  }
}
