import { GAME } from "../level.js";

let nextEnemyId = 1;

const ENEMY_SPECS = Object.freeze({
  skater: { hp: 48, width: 30, height: 58, speed: 180, contactDamage: 10, xp: 18, color: "#ff7a5f", coreColor: "#ffb15b" },
  chorister: { hp: 82, width: 38, height: 66, speed: 78, contactDamage: 12, xp: 28, color: "#8b86bf", coreColor: "#b9b2ff" },
  spark: { hp: 42, width: 28, height: 28, speed: 215, contactDamage: 9, xp: 22, color: "#6ce8ff", coreColor: "#c8f9ff" },
  bellwether: { hp: 190, width: 58, height: 82, speed: 86, contactDamage: 18, xp: 80, color: "#8c6aa9", coreColor: "#e6a4ff" },
  conductor: { hp: 620, width: 78, height: 122, speed: 62, contactDamage: 18, xp: 220, color: "#d8d5cf", coreColor: "#ff5d6f" },
  warden: { hp: 280, width: 50, height: 84, speed: 112, contactDamage: 15, xp: 130, color: "#9ca5b5", coreColor: "#64e6ff" }
});

export function spawnEnemy(kind, x, y, options = {}, world = null) {
  const spec = ENEMY_SPECS[kind];
  if (!spec) throw new Error(`Unknown enemy kind: ${kind}`);
  const maxHp = options.hp || spec.hp;
  const enemy = new Enemy({
    ...spec,
    ...options,
    kind,
    uid: options.uid || `${kind}-${nextEnemyId++}`,
    x,
    y,
    maxHp,
    hp: maxHp,
    world
  });
  if (world) world.enemies.push(enemy);
  return enemy;
}

export class Enemy {
  constructor(options) {
    Object.assign(this, options);
    this.vx = 0;
    this.vy = 0;
    this.facing = -1;
    this.onGround = false;
    this.flying = this.kind === "spark" || this.kind === "warden";
    this.groundedKind = this.kind === "warden";
    this.guard = this.kind === "chorister" || this.kind === "warden" ? 2 : 0;
    this.maxGuard = this.guard;
    this.stagger = 0;
    this.invulnerable = 0;
    this.hurtFlash = 0;
    this.knockdown = 0;
    this.deathTimer = 0;
    this.state = "idle";
    this.timer = 0;
    this.duration = 0;
    this.cooldown = 0.45 + (options.uid?.length || 0) * 0.01;
    this.attack = null;
    this.phase = 1;
    this.phaseTransition = 0;
    this.attackIndex = 0;
    this.anchorX = this.x;
    this.anchorY = this.y;
    this.hitThisAttack = false;
    this.dead = false;
  }

  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }
  get targetY() { return this.flying ? this.centerY : this.y + this.height; }
  get boss() { return this.kind === "conductor" || this.kind === "warden"; }
  bounds() { return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }; }

  update(dt, world) {
    const player = world.player;
    for (const timer of ["stagger", "invulnerable", "hurtFlash", "knockdown", "cooldown", "phaseTransition"]) {
      this[timer] = Math.max(0, this[timer] - dt);
    }
    if (this.guard < this.maxGuard && this.state !== "windup") this.guard = Math.min(this.maxGuard, this.guard + dt * 0.22);

    if (this.dead) {
      this.deathTimer += dt;
      this.vx *= Math.pow(0.05, dt);
      if (this.deathTimer < 1.1 && Math.random() < dt * 16) {
        world.particles.burst(this.centerX, this.centerY, { count: 2, color: this.coreColor, speed: 80, life: 0.4 });
      }
      this.world.physics.moveBody(this, dt, world.level, { allowDrop: true });
      return;
    }

    if (this.stagger > 0 || this.phaseTransition > 0) {
      this.vx *= Math.pow(0.05, dt);
      this.applyMotion(dt, world);
      return;
    }

    if (this.state === "windup" || this.state === "active" || this.state === "recovery") {
      this.timer -= dt;
      if (this.state === "windup" && this.timer <= 0) this.beginAttack(world);
      else if (this.state === "active" && this.timer <= 0) {
        this.state = "recovery";
        this.timer = this.boss ? 0.42 : 0.3;
      } else if (this.state === "recovery" && this.timer <= 0) {
        this.state = "idle";
        this.timer = 0;
        this.cooldown = this.boss ? (this.kind === "warden" ? 0.55 : 0.72) : 0.75 + Math.random() * 0.35;
      }
    } else {
      this.cooldown -= dt;
      this.think(dt, world, player);
    }

    this.vx = world.physics.approach(this.vx, this.vx, 0);
    this.applyMotion(dt, world);
    if ((!this.flying && this.y > GAME.height + 120) || (this.flying && (this.y < -180 || this.y > GAME.height + 120))) {
      this.hp = 0;
      this.dead = true;
    }
  }

  faceTo(targetX) {
    if (Math.abs(targetX - this.centerX) > 8) this.facing = Math.sign(targetX - this.centerX) || this.facing;
  }

  startAttack(name, duration, world) {
    this.attack = name;
    this.state = "windup";
    this.duration = duration;
    this.timer = duration;
    this.hitThisAttack = false;
    if (this.boss) world.camera.pulse(0.2, 0.06);
  }

  telegraphRatio() {
    if (this.state !== "windup") return 0;
    return 1 - Math.max(0, this.timer / this.duration);
  }

  beginAttack(world) {
    this.state = "active";
    this.timer = this.boss ? 0.26 : 0.13;
    switch (this.kind) {
      case "skater": this.performSkaterLunge(world); break;
      case "chorister": this.performChoristerBeat(world); break;
      case "spark": this.performSparkDive(world); break;
      case "bellwether": this.performBellwetherSlam(world); break;
      case "conductor": this.performBossPattern(world); break;
      case "warden": this.performWardenPattern(world); break;
    }
  }

  think(dt, world, player) {
    if (!player || player.dead || player.won) {
      this.vx *= Math.pow(0.1, dt);
      return;
    }
    this.faceTo(player.centerX);
    const distanceX = player.centerX - this.centerX;
    const distanceY = player.centerY - this.centerY;
    if (this.kind === "skater") this.thinkSkater(dt, world, player, distanceX);
    else if (this.kind === "chorister") this.thinkChorister(dt, world, player, distanceX);
    else if (this.kind === "spark") this.thinkSpark(dt, world, player, distanceX, distanceY);
    else if (this.kind === "bellwether") this.thinkBellwether(dt, world, player, distanceX);
    else if (this.kind === "conductor") this.thinkBoss(dt, world, player, distanceX);
    else if (this.kind === "warden") this.thinkWarden(dt, world, player, distanceX);
  }

  thinkSkater(dt, world, player, distanceX) {
    const speed = this.speed * (this.state === "idle" ? 1 : 0);
    this.vx = world.physics.approach(this.vx, Math.sign(distanceX) * speed, 680 * dt);
    if (this.cooldown <= 0 && Math.abs(distanceX) < 330) this.startAttack("lunge", 0.48, world);
  }

  performSkaterLunge(world) {
    this.vx = this.facing * 510;
    this.vy = -210;
    this.onGround = false;
    world.particles.burst(this.centerX, this.y + this.height, { count: 7, color: "#ff8b6f", speed: 120, life: 0.35 });
  }

  thinkChorister(dt, world, player, distanceX) {
    const ideal = 78;
    const movement = Math.abs(distanceX) > ideal ? Math.sign(distanceX) : -Math.sign(distanceX) * 0.45;
    this.vx = world.physics.approach(this.vx, movement * this.speed, 480 * dt);
    if (this.cooldown <= 0 && Math.abs(distanceX) < 260) this.startAttack("beat", 0.64, world);
  }

  performChoristerBeat(world) {
    const pulse = {
      left: this.centerX - 190,
      right: this.centerX + 190,
      top: this.centerY - 95,
      bottom: this.centerY + 95
    };
    if (!this.hitThisAttack && world.physics.overlaps(pulse, world.player.bounds())) {
      if (world.damagePlayer(10, Math.sign(world.player.centerX - this.centerX) || 1, 180)) this.hitThisAttack = true;
    }
    world.spawnProjectile({
      id: `${this.uid}-pulse`,
      kind: "pulse",
      x: this.centerX - 12,
      y: this.centerY - 12,
      vx: this.facing * 260,
      width: 24,
      height: 24,
      damage: 9,
      color: "#c3b6ff",
      life: 2.2
    });
  }

  thinkSpark(dt, world, player, distanceX, distanceY) {
    if (this.state === "idle") {
      const orbit = world.time * 1.9 + (this.anchorX % 97) * 0.2;
      this.vx = Math.cos(orbit) * 105;
      this.vy = Math.sin(orbit * 1.3) * 75 + (player.centerY - 150 - this.centerY) * 0.9;
      if (this.cooldown <= 0 && Math.hypot(distanceX, distanceY) < 460) this.startAttack("dive", 0.55, world);
    }
  }

  performSparkDive(world) {
    const player = world.player;
    const angle = Math.atan2(player.centerY - this.centerY, player.centerX - this.centerX);
    this.vx = Math.cos(angle) * 560;
    this.vy = Math.sin(angle) * 560;
    world.particles.burst(this.centerX, this.centerY, { count: 8, color: this.color, speed: 130, life: 0.35 });
  }

  thinkBellwether(dt, world, player, distanceX) {
    if (Math.abs(distanceX) > 190) {
      this.vx = world.physics.approach(this.vx, Math.sign(distanceX) * this.speed, 420 * dt);
    } else {
      this.vx *= Math.pow(0.04, dt);
      if (this.cooldown <= 0) this.startAttack("slam", 0.8, world);
    }
  }

  performBellwetherSlam(world) {
    const direction = Math.sign(world.player.centerX - this.centerX) || this.facing;
    world.spawnProjectile({
      id: `${this.uid}-shock`,
      kind: "rail",
      x: this.centerX - 8,
      y: 446,
      vx: direction * 470,
      width: 26,
      height: 18,
      damage: 15,
      color: "#d8a4ff",
      life: 2.3,
      knockback: 260
    });
    world.particles.ring(this.centerX, this.y + this.height, { radius: 12, speed: 210, color: "#c995ff", count: 18 });
    world.camera.shake = Math.max(world.camera.shake, 8);
  }

  thinkBoss(dt, world, player, distanceX) {
    const ratio = this.hp / this.maxHp;
    const nextPhase = ratio <= 0.5 ? 2 : 1;
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.phaseTransition = 1.2;
      this.stagger = 1.2;
      this.state = "idle";
      world.particles.ring(this.centerX, this.centerY, { radius: 60, speed: 360, color: "#ff5d6f", count: 42 });
      world.camera.shake = 18;
      world.audio.sfx("boss");
      world.banner("THE CONDUCTOR SHEDS HIS GREATCOAT", "Core exposed. The last overture begins.");
    }
    const preferred = Math.abs(distanceX) < 150 ? -Math.sign(distanceX) : Math.sign(distanceX) * 0.4;
    const moveSpeed = this.speed * (this.phase === 2 ? 1.35 : 1);
    this.vx = world.physics.approach(this.vx, preferred * moveSpeed, 420 * dt);
    if (this.cooldown <= 0) this.chooseBossAttack(world, distanceX);
  }

  chooseBossAttack(world, distanceX) {
    const patternIndex = this.attackIndex % (this.phase === 2 ? 4 : 3);
    this.attackIndex += 1;
    if (Math.abs(distanceX) < 165) this.startAttack("sweep", this.phase === 2 ? 0.48 : 0.62, world);
    else if (patternIndex === 0) this.startAttack("rail-wave", 0.68, world);
    else if (patternIndex === 1) this.startAttack("rail-bolt", 0.7, world);
    else if (patternIndex === 2) this.startAttack("lane-sweep", 0.76, world);
    else this.startAttack("summon", 0.82, world);
  }

  performBossPattern(world) {
    const player = world.player;
    if (this.attack === "sweep") {
      const reach = this.phase === 2 ? 260 : 220;
      const hitbox = {
        left: this.centerX - reach,
        right: this.centerX + reach,
        top: this.y - 20,
        bottom: this.y + this.height + 25
      };
      if (!this.hitThisAttack && world.physics.overlaps(hitbox, player.bounds())) {
        if (world.damagePlayer(this.phase === 2 ? 22 : 17, Math.sign(player.centerX - this.centerX) || this.facing, 350)) this.hitThisAttack = true;
      }
      this.vx = this.facing * 290;
      world.camera.shake = Math.max(world.camera.shake, 7);
    } else if (this.attack === "rail-wave") {
      for (const direction of [-1, 1]) {
        world.spawnProjectile({
          id: `${this.uid}-rail-${direction}`,
          kind: "rail",
          x: this.centerX - 10,
          y: 446,
          vx: direction * 520,
          width: 34,
          height: 22,
          damage: 16,
          color: this.phase === 2 ? "#ff5d6f" : "#64e6ff",
          life: 2.4,
          knockback: 300
        });
      }
      world.camera.shake = 10;
    } else if (this.attack === "rail-bolt") {
      const count = this.phase === 2 ? 7 : 5;
      for (let index = 0; index < count; index += 1) {
        const angle = -Math.PI / 2 + (index - (count - 1) / 2) * 0.23;
        world.spawnProjectile({
          id: `${this.uid}-bolt-${index}`,
          kind: "bolt",
          x: this.centerX - 10,
          y: this.centerY,
          vx: Math.cos(angle) * 330,
          vy: Math.sin(angle) * 330,
          width: 18,
          height: 18,
          damage: 12,
          color: this.phase === 2 ? "#ff9a74" : "#8cecff",
          life: 2.5,
          gravity: 120
        });
      }
    } else if (this.attack === "lane-sweep") {
      const laneX = Math.max(0, Math.min(world.level.width - 180, player.centerX - 90));
      world.spawnProjectile({
        id: `${this.uid}-lane`,
        kind: "lane-bolt",
        x: laneX,
        y: 90,
        vx: 0,
        width: 180,
        height: 360,
        damage: 20,
        color: "#ff4f6d",
        life: 1.05,
        knockback: 320
      });
      world.banner("RED LINE", "Leave the marked lane.");
    } else if (this.attack === "summon") {
      const positions = [this.centerX - 180, this.centerX + 180];
      positions.forEach((position, index) => world.spawnEnemy("spark", position, 220, { hp: 54, uid: `${this.uid}-add-${this.attackIndex}-${index}` }));
      world.particles.ring(this.centerX, this.centerY, { radius: 40, speed: 260, color: "#b7a4ff", count: 24 });
    }
  }

  thinkWarden(dt, world, player, distanceX) {
    if (this.hp <= this.maxHp * 0.5 && this.phase === 1) {
      this.phase = 2;
      this.stagger = 0.65;
      world.banner("STEAM WARDEN OVERPRESSURE", "Its signal lanes reverse faster.");
      world.particles.ring(this.centerX, this.centerY, { radius: 35, speed: 300, color: "#64e6ff", count: 28 });
    }
    const orbitDirection = this.attackIndex % 2 === 0 ? 1 : -1;
    const targetX = player.centerX + orbitDirection * 145;
    this.vx = world.physics.approach(this.vx, Math.sign(targetX - this.centerX) * this.speed * (this.phase === 2 ? 1.45 : 1), 500 * dt);
    this.vy = world.physics.approach(this.vy, (player.centerY - 95 - this.centerY) * (this.phase === 2 ? 2.2 : 1.5), 320 * dt);
    if (this.cooldown <= 0) {
      if (Math.abs(distanceX) < 150) this.startAttack("slam", 0.58, world);
      else this.startAttack("lane-bolt", 0.65, world);
    }
  }

  performWardenPattern(world) {
    const player = world.player;
    if (this.attack === "slam") {
      const distance = Math.abs(player.centerX - this.centerX);
      if (distance < 165) world.damagePlayer(this.phase === 2 ? 20 : 16, Math.sign(player.centerX - this.centerX) || this.facing, 340);
      for (const direction of [-1, 1]) {
        world.spawnProjectile({
          id: `${this.uid}-steam-${direction}`,
          kind: "rail",
          x: this.centerX - 8,
          y: 444,
          vx: direction * (this.phase === 2 ? 620 : 490),
          width: 24,
          height: 20,
          damage: 13,
          color: "#d4f7ff",
          life: 2.1
        });
      }
      world.camera.shake = 12;
    } else {
      const shots = this.phase === 2 ? 3 : 2;
      for (let index = 0; index < shots; index += 1) {
        world.spawnProjectile({
          id: `${this.uid}-signal-${index}`,
          kind: "lane-bolt",
          x: Math.max(0, Math.min(world.level.width - 34, player.centerX - 17 + (index - (shots - 1) / 2) * 52)),
          y: 90,
          width: 34,
          height: 360,
          damage: 14,
          color: "#64e6ff",
          life: 0.95 + index * 0.08
        });
      }
    }
  }

  applyMotion(dt, world) {
    if (!this.flying && !this.groundedKind) {
      world.physics.applyGravity(this, dt, GAME.gravity * (this.kind === "bellwether" ? 1.2 : 1));
    }
    if (!this.flying && !this.groundedKind) {
      world.physics.moveBody(this, dt, world.level, { allowDrop: this.stagger > 0 || this.knockdown > 0 });
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.onGround = false;
    }
  }
}

export { ENEMY_SPECS };
