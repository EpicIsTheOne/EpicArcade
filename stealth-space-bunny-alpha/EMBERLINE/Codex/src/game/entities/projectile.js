export class Projectile {
  constructor(options) {
    this.uid = `projectile-${options.id || Math.random().toString(36).slice(2)}`;
    this.id = options.id;
    this.kind = options.kind || "bolt";
    this.x = options.x;
    this.y = options.y;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.width = options.width || 18;
    this.height = options.height || 18;
    this.damage = options.damage || 10;
    this.life = options.life || 3;
    this.color = options.color || "#7cecff";
    this.hit = false;
    this.dead = false;
    this.knockback = options.knockback || 180;
    this.gravity = options.gravity || 0;
    this.spin = options.spin || 0;
    this.rotation = 0;
  }

  update(dt, player, world) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.spin * dt;
    if (this.kind === "rail") {
      this.y = 440;
    }
    if (this.kind === "lane-bolt" && this.life < 0.85) {
      this.vx *= Math.pow(0.3, dt);
    }
    if (!player.dead && !this.hit && world.physics.overlaps(this.bounds(), player.bounds())) {
      if (player.takeHit(this.damage, Math.sign(this.vx) || Math.sign(player.centerX - this.centerX) || 1, this.knockback)) {
        this.hit = true;
        world.particles.burst(this.centerX, this.centerY, { count: 8, color: this.color, speed: 120, life: 0.3 });
      }
    }
    if (this.x < -100 || this.x > world.level.width + 100 || this.y < -160 || this.y > 620) this.dead = true;
  }

  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }
  bounds() { return { left: this.x, right: this.x + this.width, top: this.y, bottom: this.y + this.height }; }
}
