export class BotController {
  constructor() {
    this.elapsed = 0;
    this.actionTimer = 0;
    this.actionIndex = 0;
    this.stuckTime = 0;
    this.lastX = 0;
    this.jumpPulse = 0;
  }

  update(world, dt, input) {
    this.elapsed += dt;
    this.actionTimer -= dt;
    this.jumpPulse = Math.max(0, this.jumpPulse - dt);
    const player = world.player;
    const targetX = this.targetX(world);
    const direction = Math.sign(targetX - player.centerX);

    input.held.delete("left");
    input.held.delete("right");
    if (Math.abs(player.centerX - this.lastX) < 1.4) this.stuckTime += dt;
    else this.stuckTime = 0;
    this.lastX = player.centerX;

    if (direction < 0) input.held.add("left");
    if (direction > 0) input.held.add("right");
    if (player.y > 320 || player.y < 285) {
      input.pressed.add("jump");
      input.held.add("jump");
    }

    if (this.actionTimer <= 0 && !player.busy) {
      this.actionTimer = 0.12;
      const shrineNearby = levelNearShrine(world);
      const action = shrineNearby ? "interact" : ["light", "heavy", "storm", "light", "dash", "light"][this.actionIndex % 6];
      input.pressed.add(action);
      this.actionIndex += 1;
    }

    if (this.stuckTime > 0.65 || this.jumpPulse > 0 || (player.y > 315 && player.onGround)) {
      input.pressed.add("jump");
      input.held.add("jump");
    } else {
      input.held.delete("jump");
    }

    if (this.stuckTime > 1.5) {
      input.pressed.add("dash");
      this.stuckTime = 0.4;
    }
  }

  targetX(world) {
    const player = world.player;
    const level = world.level;
    const activeEnemies = world.enemies.filter((enemy) => !enemy.dead);
    if (world.activeBoss && !world.activeBoss.dead) return world.activeBoss.centerX;
    if (activeEnemies.length) {
      return activeEnemies.reduce((nearest, enemy) => Math.abs(enemy.centerX - player.centerX) < Math.abs(nearest.centerX - player.centerX) ? enemy : nearest).centerX;
    }
    const nextPickup = level.pickups.find((pickup) => !pickup.collected && pickup.x > player.x - 30);
    if (nextPickup) return nextPickup.x;
    const nextTrigger = level.triggers.find((trigger) => !trigger.fired && trigger.x > player.x - 30);
    if (nextTrigger) return nextTrigger.x + 90;
    if (level.shrine && !level.shrine.collected && level.shrine.x > player.x - 30) return level.shrine.x;
    if (level.boss && !level.boss.started && !level.warden?.defeated) return level.boss.triggerX + 120;
    if (level.warden && level.warden.started && !level.warden.defeated) return level.warden.x;
    if (world.routeComplete) return level.gate.x;
    const nextPlatform = level.platforms.find((platform) => platform.x + platform.width > player.x - 20 && platform.x > player.x + 80);
    if (nextPlatform) return nextPlatform.x + 50;
    return Math.min(level.width - 100, player.x + 180);
  }
}

function levelNearShrine(world) {
  const shrine = world.level.shrine;
  return shrine && !shrine.collected && Math.abs(shrine.x - world.player.centerX) < 52;
}

export function createQaState() {
  return {
    enabled: false,
    state: "idle",
    checkpoint: "platform",
    encounter: "none",
    bossPhase: 0,
    deathVerified: false,
    errors: [],
    elapsed: 0,
    lastX: 0,
    lastState: "platform"
  };
}
