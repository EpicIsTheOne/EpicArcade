import { GAME } from "./level.js";

export function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function centerDistance(a, b) {
  return Math.hypot((a.left + a.right) / 2 - (b.left + b.right) / 2, (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
}

export class PhysicsSystem {
  overlaps(a, b) {
    return overlaps(a, b);
  }

  approach(value, target, amount) {
    if (value < target) return Math.min(value + amount, target);
    if (value > target) return Math.max(value - amount, target);
    return value;
  }

  moveBody(body, dt, level, options = {}) {
    const oldY = body.y;
    const oldRight = body.x + body.width;
    const allowDrop = Boolean(options.allowDrop);
    body.x += body.vx * dt;
    this.resolveHorizontal(body, level, oldRight, allowDrop);
    body.x = Math.max(0, Math.min(level.width - body.width, body.x));

    body.y += body.vy * dt;
    body.onGround = false;
    this.resolveVertical(body, level, oldY, allowDrop);
    return body;
  }

  resolveHorizontal(body, level, oldRight, allowDrop) {
    for (const platform of level.platforms) {
      if (platform.oneWay || (allowDrop && platform.height <= 18)) continue;
      if (!overlaps(body.bounds(), platform)) continue;
      const crossedFromLeft = oldRight <= platform.x + 5;
      if (crossedFromLeft) body.x = platform.x - body.width;
      else if (body.x + body.width >= platform.right - 5) body.x = platform.x + platform.width;
    }
    for (const gate of [...level.gates, level.gate]) {
      const locked = gate.locked || (!gate.opened && !gate.defeated);
      if (!locked || !overlaps(body.bounds(), gate)) continue;
      if (oldRight <= gate.x + 5) body.x = gate.x - body.width;
      else body.x = gate.x + gate.width;
    }
  }

  resolveVertical(body, level, oldY, allowDrop) {
    const candidates = [];
    for (const platform of level.platforms) {
      const oneWay = platform.oneWay || platform.height <= 18;
      if (oneWay && (allowDrop || body.vy < 0)) continue;
      const bodyLeft = body.x;
      const bodyRight = body.x + body.width;
      const crossesTop = body.vy >= 0 && oldY + body.height <= platform.y + 4 && body.y + body.height >= platform.y;
      const crossesBottom = body.vy < 0 && oldY >= platform.y + platform.height - 4 && body.y <= platform.y + platform.height;
      if (!crossesTop && !crossesBottom && !overlaps(body.bounds(), platform)) continue;
      const fromAbove = body.vy >= 0 && oldY + body.height <= platform.y + 8;
      const fromBelow = body.vy < 0 && oldY >= platform.y + platform.height - 8;
      const horizontal = bodyLeft < platform.right && bodyRight > platform.x;
      if (!horizontal) continue;
      if (fromAbove) candidates.push({ platform, side: "top" });
      else if (fromBelow && !oneWay) candidates.push({ platform, side: "bottom" });
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.platform.y - b.platform.y);
    const hit = candidates[0];
    if (hit.side === "top") {
      body.y = hit.platform.y - body.height;
      body.vy = 0;
      body.onGround = true;
    } else {
      body.y = hit.platform.y + hit.platform.height;
      body.vy = 0;
    }
  }

  applyGravity(body, dt, gravity = GAME.gravity) {
    body.vy = Math.min(1200, body.vy + gravity * dt);
  }
}
