export class ParticleSystem {
  constructor() {
    this.items = [];
    this.damageNumbers = [];
    this.trails = [];
  }

  burst(x, y, options = {}, random = Math.random) {
    const count = options.count ?? 12;
    const speed = options.speed ?? 180;
    const color = options.color ?? "#ffb15b";
    const life = options.life ?? 0.55;
    const gravity = options.gravity ?? 360;
    const size = options.size ?? 4;
    const angle = options.angle;
    const spread = options.spread ?? Math.PI * 2;
    for (let index = 0; index < count; index += 1) {
      const direction = angle === undefined
        ? random() * Math.PI * 2
        : angle + (Math.random() - 0.5) * spread;
      const velocity = speed * (0.35 + random() * 0.65);
      this.items.push({
        x, y,
        vx: Math.cos(direction) * velocity,
        vy: Math.sin(direction) * velocity,
        color,
        life: life * (0.65 + random() * 0.5),
        maxLife: life,
        size: size * (0.55 + random() * 0.8),
        gravity,
        shape: options.shape ?? "spark"
      });
    }
  }

  ring(x, y, options = {}) {
    const count = options.count ?? 22;
    const radius = options.radius ?? 12;
    const color = options.color ?? "#64e6ff";
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      this.items.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        vx: Math.cos(angle) * (options.speed ?? 260),
        vy: Math.sin(angle) * (options.speed ?? 260),
        color,
        life: 0.42,
        maxLife: 0.42,
        size: 3,
        gravity: 0,
        shape: "spark"
      });
    }
  }

  damage(x, y, amount, color = "#fff2bf") {
    this.damageNumbers.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y - 18,
      vx: (Math.random() - 0.5) * 30,
      vy: -95,
      value: amount,
      color,
      life: 0.72,
      maxLife: 0.72
    });
  }

  trail(x, y, direction, color = "#ffb15b", life = 0.25) {
    this.trails.push({ x, y, direction, color, life, maxLife: life, width: 10 + Math.random() * 8 });
  }

  update(dt) {
    for (const particle of this.items) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
    }
    this.items = this.items.filter((particle) => particle.life > 0);
    for (const number of this.damageNumbers) {
      number.life -= dt;
      number.x += number.vx * dt;
      number.y += number.vy * dt;
      number.vy += 120 * dt;
    }
    this.damageNumbers = this.damageNumbers.filter((number) => number.life > 0);
    for (const trail of this.trails) trail.life -= dt;
    this.trails = this.trails.filter((trail) => trail.life > 0);
  }

  clear() {
    this.items.length = 0;
    this.damageNumbers.length = 0;
    this.trails.length = 0;
  }
}
