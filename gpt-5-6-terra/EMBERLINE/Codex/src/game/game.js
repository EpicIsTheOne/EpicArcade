import { AudioSystem } from "./audio.js";
import { Camera } from "./camera.js";
import { Player } from "./entities/player.js";
import { Projectile } from "./entities/projectile.js";
import { spawnEnemy } from "./entities/enemy.js";
import { InputManager } from "./input.js";
import { CHECKPOINTS, GAME, createLevel, gateCrossed, zoneForX } from "./level.js";
import { ParticleSystem } from "./particles.js";
import { PhysicsSystem } from "./physics.js";
import { BotController, createQaState } from "./qa.js";
import { createRenderer } from "./render/index.js";

const FIXED_STEP = 1 / 120;
const MAX_ACCUMULATOR = FIXED_STEP * 8;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new InputManager(canvas);
    this.audio = new AudioSystem();
    this.physics = new PhysicsSystem();
    this.particles = new ParticleSystem();
    this.camera = new Camera();
    this.renderer = createRenderer(canvas);
    this.hooks = { toast: () => {}, death: () => {}, victory: () => {}, title: () => {} };
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.paused = false;
    this.bot = null;
    this.qa = createQaState();
    this.qa.enabled = new URLSearchParams(location.search).get("qa") === "1";
    this.reset();
  }

  setHooks(hooks) {
    this.hooks = { ...this.hooks, ...hooks };
  }

  reset() {
    this.level = createLevel();
    this.player = new Player(this.physics, this.particles, this.audio, () => this.simulationTime);
    this.enemies = [];
    this.projectiles = [];
    this.particles.clear();
    this.camera = new Camera();
    this.activeBoss = null;
    this.time = 0;
    this.simulationTime = 0;
    this.bannerData = null;
    this.bannerTime = 0;
    this.endingText = null;
    this.routeComplete = false;
    this.interactPrompt = null;
    this.currentCheckpoint = "platform";
    this.deathShown = false;
    this.victoryShown = false;
    this.qa = createQaState();
    this.qa.enabled = this.qaEnabled ?? this.qa.enabled;
    this.bot = null;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.hooks.title("I. Rain Platform", "A, D to move · J to combo · W to jump");
  }

  start() {
    this.audio.unlock();
    this.input.enabled = true;
    this.lastTime = performance.now();
  }

  setPaused(paused) {
    this.paused = paused;
    this.input.clear();
    this.lastTime = performance.now();
  }

  frame(deltaSeconds, botController = null) {
    const delta = Math.min(0.1, Math.max(0, deltaSeconds));
    this.lastTime = performance.now();
    if (this.started === false) return;
    if (!this.paused) {
      this.accumulator = Math.min(MAX_ACCUMULATOR, this.accumulator + delta);
      let iterations = 0;
      while (this.accumulator >= FIXED_STEP && iterations < 8) {
        if (botController) botController.update(this, FIXED_STEP, this.input);
        this.step(FIXED_STEP);
        this.input.endFrame();
        this.accumulator -= FIXED_STEP;
        iterations += 1;
      }
    }
    this.renderer.render(this);
  }

  step(dt) {
    this.time += dt;
    this.simulationTime += dt;
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    if (this.qa.enabled) this.qa.elapsed += dt;

    this.physics.applyGravity(this.player, dt);
    this.player.update(dt, this.input, this.level, this.enemies, this.camera);
    this.updateTriggeredEncounters();
    this.updateBossSequence();
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickupsAndInteraction();
    this.updateGates();
    this.particles.update(dt);
    this.camera.update(dt, this.player, this.level);
    this.updateCheckpoints();
    this.updateOutcome();
    this.updateQa();
  }

  runQaSteps(count) {
    this.started = true;
    const safeCount = Math.max(0, Math.min(500000, Math.floor(count)));
    let executed = 0;
    for (let index = 0; index < safeCount; index += 1) {
      if (this.qa.complete) break;
      this.bot?.update(this, FIXED_STEP, this.input);
      this.step(FIXED_STEP);
      this.input.endFrame();
      executed += 1;
    }
    this.renderer.render(this);
    return {
      steps: executed,
      state: this.player.won ? "complete" : this.player.dead ? "death" : "running",
      player: {
        x: this.player.x,
        y: this.player.y,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        cores: this.player.cores,
        fragments: this.player.fragments,
        bossesDefeated: this.player.bossesDefeated
      },
      qa: {
        elapsed: this.qa.elapsed,
        checkpoint: this.qa.checkpoint,
        encounter: this.qa.encounter,
        bossPhase: this.qa.bossPhase,
        deathVerified: this.qa.deathVerified,
        complete: Boolean(this.qa.complete),
        completion: this.qa.completion || null,
        errors: [...new Set(this.qa.errors)]
      }
    };
  }

  begin() {
    this.started = true;
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (enemy.dead && !enemy.rewarded) {
        enemy.rewarded = true;
        if (enemy.boss) this.onBossDefeated(enemy);
      }
      enemy.update(dt, this);
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.dead || enemy.deathTimer < 1.1);
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) projectile.update(dt, this.player, this);
    this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
  }

  updateTriggeredEncounters() {
    for (const trigger of this.level.triggers) {
      if (trigger.fired || this.player.centerX < trigger.x) continue;
      trigger.fired = true;
      this.spawnEncounter(trigger.spawn);
    }
  }

  spawnEncounter(kind) {
    const player = this.player;
    if (kind === "skaters") {
      this.spawnEnemy("skater", player.x + 430, 400, { uid: "skater-a" });
      this.spawnEnemy("skater", player.x + 610, 390, { uid: "skater-b" });
      this.banner("STATIC CHOIR", "Two skaters close the line. Chain J, then finish with K.");
    } else if (kind === "forest") {
      this.spawnEnemy("chorister", player.x + 430, 402, { uid: "chorister-a" });
      this.spawnEnemy("skater", player.x + 560, 410, { uid: "skater-forest" });
      this.spawnEnemy("skater", player.x - 290, 410, { uid: "skater-rear" });
      this.banner("TIN LITURGY", "Armor turns light attacks aside. Use K, Storm, or a dash strike.");
    } else if (kind === "bellwether") {
      this.spawnEnemy("bellwether", player.x + 540, 386, { uid: "bellwether" });
      this.banner("THE BELLWETHER", "Do not stand on the rail when the shockwave lands.");
    } else if (kind === "tower-mixed") {
      this.spawnEnemy("spark", player.x + 390, 215, { uid: "spark-a" });
      this.spawnEnemy("spark", player.x + 560, 155, { uid: "spark-b" });
      this.spawnEnemy("chorister", player.x + 690, 402, { uid: "chorister-tower" });
      this.banner("COURIER SWARM", "Air attacks break shields. Control the high signal lane.");
    } else if (kind === "deck-guard") {
      this.spawnEnemy("skater", player.x + 420, 410, { uid: "deck-skater-a" });
      this.spawnEnemy("chorister", player.x + 610, 402, { uid: "deck-chorister" });
      this.banner("THE GREATCOAT OPENS", "Clear the escort. The Conductor is waiting beyond the red signal.");
    }
  }

  updateBossSequence() {
    const bossConfig = this.level.boss;
    if (!bossConfig.started && this.player.centerX > bossConfig.triggerX && !this.activeBoss) {
      bossConfig.started = true;
      this.activeBoss = this.spawnEnemy("conductor", 8440, 346, { uid: "the-conductor", hp: 620 });
      this.audio.sfx("boss");
      this.camera.shake = 12;
      this.banner("THE CONDUCTOR", "Break the black greatcoat. Survive the red overture.");
    }
    if (this.activeBoss?.dead) this.activeBoss = null;
    if (this.level.warden.started && !this.level.warden.defeated && !this.activeBoss) {
      this.activeBoss = this.enemies.find((enemy) => enemy.kind === "warden" && !enemy.dead) || null;
    }
  }

  updateGates() {
    for (const gate of this.level.gates) {
      if (!gate.locked) continue;
      if (gate.id === "forest" && this.level.triggers.find((trigger) => trigger.id === "enc-1")?.fired && this.encounterClear("enc-1")) {
        gate.locked = false;
        this.player.energy = Math.min(this.player.energyMax, this.player.energy + 1);
        this.banner("PLATFORM CLEAR", "Signal seal released. A charge returns to the lantern.");
      }
      if (gate.id === "tower" && this.level.triggers.find((trigger) => trigger.id === "enc-2")?.fired && this.encounterClear("enc-2")) {
        gate.locked = false;
        this.banner("FOREST CLEAR", "The signal tower route is open.");
      }
      if (gate.id === "warden" && this.player.cores >= 3 && this.level.warden?.defeated) {
        gate.locked = false;
      }
    }
    const routeReady = this.routeComplete && this.player.cores >= 3 && this.player.fragments >= 4;
    const vaultReached = this.player.x + this.player.width >= this.level.gate.x;
    if (!this.player.won && routeReady && (gateCrossed(this.level, this.player.x, this.player.x + this.player.vx / 120) || vaultReached)) {
      this.level.gate.opened = true;
      this.player.won = true;
      this.player.winTimer = 0;
      this.endingText = true;
      this.audio.sfx("victory");
      this.hooks.victory(this.player);
    }
  }

  encounterClear(triggerId) {
    if (!triggerId) return this.enemies.every((enemy) => enemy.dead);
    const encounterX = this.level.triggers.find((trigger) => trigger.id === triggerId)?.x || 0;
    return this.enemies.every((enemy) => enemy.dead || Math.abs(enemy.centerX - encounterX) > 1600);
  }

  updatePickupsAndInteraction() {
    for (const pickup of this.level.pickups) {
      const horizontalDistance = Math.abs(pickup.x - this.player.centerX);
      const verticalDistance = Math.abs(pickup.y + 18 - this.player.centerY);
      if (pickup.collected || horizontalDistance > 52 || verticalDistance > 300) continue;
      pickup.collected = true;
      this.player.collect(pickup.type);
      this.particles.ring(pickup.x, pickup.y + 18, { radius: 8, speed: 180, color: pickup.type === "core" ? "#ff9f43" : "#64e6ff", count: 20 });
      this.banner(pickup.type === "core" ? "EMBER CORE RECOVERED" : "SIGIL FRAGMENT RECOVERED", pickup.type === "core" ? "Resolve maximum increased. Storm charges restored." : "A signal charge returns with the memory.");
    }

    const shrine = this.level.shrine;
    if (!shrine.collected && Math.abs(shrine.x - this.player.centerX) < 95 && Math.abs(shrine.y - this.player.y) < 150) {
      this.interactPrompt = { x: shrine.x, y: shrine.y - 94, text: "E · TAKE SIGIL" };
      if (this.input.wasPressed("interact")) {
        shrine.collected = true;
        this.player.collect("sigil");
        this.particles.ring(shrine.x, shrine.y - 26, { radius: 10, speed: 230, color: "#64e6ff", count: 26 });
        this.banner("SIGIL RESTORED", "The Ember Track answers your signal.");
      }
    } else {
      this.interactPrompt = null;
    }
  }

  updateCheckpoints() {
    let latest = "platform";
    for (const [id, checkpoint] of Object.entries(CHECKPOINTS)) {
      if (this.player.x >= checkpoint.x) latest = id;
    }
    this.currentCheckpoint = latest;
  }

  onBossDefeated(enemy) {
    if (enemy.kind === "conductor") {
      this.level.boss.defeated = true;
      this.player.bossesDefeated += 1;
      this.player.heal(70);
      this.player.energy = this.player.energyMax;
      this.camera.shake = 20;
      this.audio.sfx("victory");
      this.banner("THE CONDUCTOR FALLS", "The Steam Warden answers from the last gate.");
      if (!this.level.warden.started) {
        this.level.warden.started = true;
        this.spawnEnemy("warden", 8620, 380, { uid: "steam-warden", hp: 280 });
      }
    } else if (enemy.kind === "warden") {
      this.level.warden.defeated = true;
      this.player.bossesDefeated += 1;
      this.player.heal(90);
      this.player.energy = this.player.energyMax;
      this.camera.shake = 18;
      this.audio.sfx("victory");
      this.banner("THE STEAM WARDEN SILENCED", "Both Warden stars burn. The memory vault is open.");
      this.routeComplete = this.level.boss.defeated && this.level.warden.defeated;
    }
  }

  updateOutcome() {
    if (this.player.dead && this.player.deathTimer > 1.4) {
      this.qa.deathVerified = true;
      this.hooks.death(this.player);
      if (this.qa.enabled && this.bot) {
        this.player.dead = false;
        this.player.hp = Math.max(1, Math.round(this.player.maxHp * 0.35));
        this.player.x = this.player.lastSafeX;
        this.player.y = 280;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.invulnerableUntil = this.simulationTime + 1200;
        this.deathShown = false;
      }
    }
    if (this.qa.enabled && this.bot && this.player.y > GAME.height + 120) {
      this.player.dead = false;
      this.player.hp = Math.max(1, Math.round(this.player.maxHp * 0.35));
      this.player.x = this.player.lastSafeX;
      this.player.y = 280;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.invulnerableUntil = this.simulationTime + 1200;
    }
  }

  updateQa() {
    if (!this.qa.enabled) return;
    this.qa.state = this.player.dead ? "death" : this.player.won ? "victory" : this.qa.state;
    this.qa.checkpoint = this.currentCheckpoint;
    this.qa.encounter = this.enemies.some((enemy) => !enemy.dead) ? "active" : "clear";
    this.qa.bossPhase = this.activeBoss?.phase || 0;
    const hazards = this.level.vents.filter((vent) => vent.active).length;
    this.qa.hazards = hazards;
    this.qa.projectiles = this.projectiles.length;
    if (this.player.hp > this.player.maxHp || this.player.hp < 0) this.qa.errors.push("health bounds");
    if (!Number.isFinite(this.player.x) || !Number.isFinite(this.player.y)) this.qa.errors.push("player position");
    if (!this.qa.complete && !this.player.won && this.qa.elapsed > 360) this.qa.errors.push("route timeout");
    if (this.player.won && this.routeComplete) {
      this.qa.state = "complete";
      this.qa.complete = true;
      this.qa.completion = {
        elapsed: Number(this.qa.elapsed.toFixed(2)),
        deathsVerified: this.qa.deathVerified,
        bossesDefeated: this.player.bossesDefeated,
        cores: this.player.cores,
        fragments: this.player.fragments,
        errors: [...new Set(this.qa.errors)]
      };
    }
  }

  enableBot() {
    this.qa.enabled = true;
    this.qa.autoStart = true;
    this.bot = new BotController();
    if (!this.player.won && !this.player.dead) this.qa.state = "running";
  }

  spawnEnemy(kind, x, y, options) {
    return spawnEnemy(kind, x, y, options, this);
  }

  spawnProjectile(options) {
    this.projectiles.push(new Projectile(options));
  }

  damagePlayer(damage, direction, knockback) {
    return this.player.takeHit(damage, direction, knockback);
  }

  banner(title, subtitle = "") {
    this.bannerData = { title, subtitle };
    this.bannerTime = 2.6;
  }

  destroy() {
    this.audio.stop();
  }
}
