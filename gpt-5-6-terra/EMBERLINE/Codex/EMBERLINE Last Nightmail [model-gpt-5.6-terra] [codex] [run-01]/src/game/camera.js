import { GAME } from "./level.js";

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.zoom = 1;
    this.pulseAmount = 0;
    this.pulseTime = 0;
    this.pulseDuration = 0;
  }

  update(dt, player, level) {
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.shake = Math.max(0, this.shake - dt * 35);
      return;
    }
    const targetX = Math.max(0, Math.min(level.width - GAME.width, player.centerX - GAME.width * 0.43));
    const targetY = Math.max(0, Math.min(80, (GAME.floor - player.y - 38) * 0.12));
    this.x += (targetX - this.x) * Math.min(1, dt * 5.2);
    this.y += (targetY - this.y) * Math.min(1, dt * 3.8);
    this.shake = Math.max(0, this.shake - dt * 28);
    this.pulseTime = Math.max(0, this.pulseTime - dt);
    if (this.pulseTime <= 0) this.pulseAmount = 0;
  }

  pulse(amount, duration) {
    this.pulseAmount = Math.max(this.pulseAmount, amount);
    this.pulseDuration = duration;
    this.pulseTime = duration;
  }

  offset() {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shake,
      y: (Math.random() - 0.5) * this.shake * 0.6
    };
  }

  zoomValue() {
    if (this.pulseTime <= 0) return 1;
    const ratio = this.pulseTime / this.pulseDuration;
    return 1 + Math.sin(ratio * Math.PI) * this.pulseAmount;
  }
}
