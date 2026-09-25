import { CEILING_Y, FLOOR_Y, LOWER_LANE_Y, PLAYER_RADIUS, UPPER_LANE_Y, WORLD_SPEED } from "./constants.js";
import { LEVEL, getModeAtBeat, getModeWindow } from "./level.js";

const GRAVITY = 2300;
const JUMP_VELOCITY = -720;
const DRIFT_RISE = -355;
const DRIFT_FALL = 355;
const GROUND_CEILING = 176;
const RAIL_TRANSITION_TIME = 0.21;

function circleIntersectsSurface(circle, surface) {
  if (circle.x + circle.radius <= surface.startX || circle.x - circle.radius >= surface.endX) return false;
  const top = surface.ceiling ? surface.y : surface.y;
  const bottom = surface.ceiling ? surface.y + 620 : surface.y;
  const nearestY = Math.max(top, Math.min(circle.y, bottom));
  const nearestX = Math.max(surface.startX, Math.min(circle.x, surface.endX));
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function hazardDistance(hazard, player) {
  const dx = player.x - hazard.x;
  const dy = player.y - hazard.y;
  const limit = player.radius + hazard.radius;
  return dx * dx + dy * dy <= limit * limit;
}

export class Physics {
  constructor() {
    this.player = null;
    this.mode = "intro";
    this.modeWindow = { mode: "intro", startBeat: 0, endBeat: 24 };
    this.surfaceLock = "floor";
    this.lastBeat = 0;
    this.holdWasActive = false;
    this.autopilotCursor = 0;
    this.collectibles = [];
  }

  reset(startBeat, options = {}) {
    const startX = startBeat * (60 / 126) * WORLD_SPEED;
    this.lastBeat = startBeat;
    this.player = {
      x: startX,
      y: FLOOR_Y - PLAYER_RADIUS - 1,
      vy: 0,
      radius: PLAYER_RADIUS,
      grounded: true,
      groundSurface: null,
      ceilCollision: false,
      lane: "lower",
      laneFrom: "lower",
      laneTo: "lower",
      laneT: 1,
      laneFromY: FLOOR_Y - PLAYER_RADIUS - 1,
      laneToY: FLOOR_Y - PLAYER_RADIUS - 1,
      lastSafeBeat: startBeat,
      lastActionBeat: -1,
      action: "idle",
      actionFlash: 0,
      invulnerable: startBeat,
      age: 0,
      traversalCeiling: false,
      surfaceFromY: FLOOR_Y - PLAYER_RADIUS - 1,
      surfaceToY: FLOOR_Y - PLAYER_RADIUS - 1,
      surfaceT: 1
    };
    this.surfaceLock = "floor";
    this.mode = getModeAtBeat(startBeat);
    this.modeWindow = getModeWindow(startBeat);
    this.autopilotCursor = 0;
    this.collectibles = LEVEL.collectibles.map((mote) => ({ ...mote, collected: options.restoreCollected?.has(mote.id) ?? false }));
  }

  restart(startBeat, collected = null) {
    const saved = new Set(collected ?? this.collectibles.filter((mote) => mote.collected).map((mote) => mote.id));
    this.reset(startBeat, { restoreCollected: saved });
  }

  press(beat, autopilot = false) {
    if (!this.player || this.player.action === "dead") return false;
    this.player.lastActionBeat = beat;
    this.player.action = "press";
    this.player.actionFlash = 1;
    if (this.mode === "bloom") {
      this.player.vy = JUMP_VELOCITY;
      this.player.grounded = false;
      this.player.groundSurface = null;
      return true;
    }
    if (this.mode === "fracture") {
      this.player.surfaceFromY = this.player.y;
      this.player.surfaceToY = this.surfaceLock === "ceiling" ? CEILING_Y + PLAYER_RADIUS + 1 : FLOOR_Y - PLAYER_RADIUS - 1;
      this.player.surfaceT = 0;
      this.surfaceLock = this.surfaceLock === "ceiling" ? "floor" : "ceiling";
      this.player.vy = 0;
      return true;
    }
    if (this.mode === "orbit") {
      this.player.laneFrom = this.player.lane;
      this.player.laneTo = this.player.lane === "lower" ? "upper" : "lower";
      this.player.laneFromY = this.player.y;
      this.player.laneToY = this.player.laneTo === "upper" ? UPPER_LANE_Y - PLAYER_RADIUS - 1 : LOWER_LANE_Y - PLAYER_RADIUS - 1;
      this.player.laneT = 0;
      return true;
    }
    if (this.mode === "intro" || this.mode === "outro") {
      this.player.action = "pause";
      return false;
    }
    if (this.mode === "drift") this.player.vy = DRIFT_RISE;
    if (autopilot) this.player.lastActionBeat = beat;
    return true;
  }

  setHold(pressed) {
    if (!this.player) return;
    if (this.mode === "drift") this.player.vy = pressed ? DRIFT_RISE : DRIFT_FALL;
    this.holdWasActive = pressed;
  }

  update(dt, startBeat = this.lastBeat) {
    if (!this.player || this.player.action === "dead") return;
    const beat = startBeat + dt / (60 / 126);
    this.lastBeat = beat;
    this.player.age += dt;
    this.player.actionFlash = Math.max(0, this.player.actionFlash - dt * 5.5);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    const previousMode = this.mode;
    const previousWindow = this.modeWindow.endBeat;
    this.mode = getModeAtBeat(beat);
    this.modeWindow = getModeWindow(beat);
    if (this.modeWindow.endBeat !== previousWindow) {
      this.lastActionBeat = -1;
      if (this.mode === "fracture" && previousMode !== "fracture") {
        this.surfaceLock = "floor";
        this.player.y = FLOOR_Y - this.player.radius - 1;
        this.player.vy = 0;
      } else if (this.mode !== "fracture" && previousMode === "fracture") {
        this.surfaceLock = "floor";
        this.player.y = FLOOR_Y - this.player.radius - 1;
        this.player.vy = 0;
      }
    }
    if (this.mode === "drift" && this.holdWasActive) this.player.vy = DRIFT_RISE;
    if (this.mode === "fracture" && this.player.surfaceT < 1) {
      this.player.surfaceT = Math.min(1, this.player.surfaceT + dt / 0.12);
      const eased = 1 - (1 - this.player.surfaceT) ** 3;
      this.player.y = this.player.surfaceFromY + (this.player.surfaceToY - this.player.surfaceFromY) * eased;
    }

    if (this.mode === "orbit" && this.player.laneT < 1) {
      this.player.laneT = Math.min(1, this.player.laneT + dt / RAIL_TRANSITION_TIME);
      const eased = 1 - (1 - this.player.laneT) ** 3;
      this.player.y = this.player.laneFromY + (this.player.laneToY - this.player.laneFromY) * eased;
    }
    if (this.mode === "drift" && this.modeWindow.startBeat === this.lastBeat - dt / (60 / 126)) {
      this.player.vy = this.holdWasActive ? DRIFT_RISE : DRIFT_FALL;
    }
    if (this.mode !== "drift" && this.mode !== "fracture") this.player.vy += GRAVITY * dt;
    if (this.mode === "bloom") this.player.vy += GRAVITY * dt;
    if (this.mode === "orbit" || this.mode === "intro" || this.mode === "outro") this.player.vy = 0;

    const deltaX = WORLD_SPEED * dt;
    this.player.x += deltaX;
    if (this.mode !== "orbit" && this.mode !== "fracture") this.player.y += this.player.vy * dt;
    this.player.lane = this.player.laneT < 1 ? this.player.laneFrom : this.player.laneTo;
    this.player.grounded = false;
    this.player.groundSurface = null;
    this.player.ceilCollision = false;

    const playerCircle = { x: this.player.x, y: this.player.y, radius: this.player.radius };
    for (const surface of LEVEL.surfaces) {
      if (this.mode === "fracture") continue;
      if (this.mode === "orbit" && (surface.theme === "orbit" || surface.y === UPPER_LANE_Y || surface.y === LOWER_LANE_Y)) continue;
      if (surface.endX < this.player.x - 500 || surface.startX > this.player.x + 500) continue;
      if (circleIntersectsSurface(playerCircle, surface)) {
        if (surface.ceiling && this.surfaceLock === "floor") {
          this.player.y = surface.y + this.player.radius + 2;
          this.player.vy = Math.max(60, this.player.vy);
          this.player.ceilCollision = true;
        } else if (surface.ceiling && this.surfaceLock === "ceiling") {
          if (this.player.y < surface.y + this.player.radius + 1) {
            this.player.y = surface.y + this.player.radius + 1;
            this.player.vy = Math.max(60, this.player.vy);
            this.player.ceilCollision = true;
          }
        } else if (surface.y < GROUND_CEILING) {
          continue;
        } else if (this.mode === "orbit" && surface.y !== LOWER_LANE_Y) {
          continue;
        } else if (this.player.vy >= 0) {
          this.player.y = surface.y - this.player.radius - 1;
          this.player.vy = 0;
          this.player.grounded = true;
          this.player.groundSurface = surface;
        }
      }
    }
    if (this.mode !== "fracture") this.player.y = Math.max(CEILING_Y + this.player.radius + 3, Math.min(FLOOR_Y - this.player.radius - 1, this.player.y));
    this.collectibles.forEach((mote) => {
      if (mote.collected) return;
      const dx = mote.x - this.player.x;
      const dy = mote.y - this.player.y;
      if (dx * dx + dy * dy <= (mote.radius + this.player.radius + 4) ** 2) mote.collected = true;
    });
    const nearestHazard = LEVEL.hazards.find((hazard) => hazard.x > this.player.x - 30 && hazard.x < this.player.x + 44);
    if (nearestHazard && hazardDistance(nearestHazard, playerCircle) && beat > this.player.invulnerable) {
      this.kill(nearestHazard);
    }
    if (this.player.grounded || this.player.ceilCollision || this.mode === "orbit" || this.mode === "intro" || this.mode === "outro") {
      this.player.lastSafeBeat = beat;
    }
  }

  kill(hazard) {
    if (!this.player || this.player.invulnerable > 0) return;
    this.player.action = "dead";
    this.player.deathReason = hazard?.id ?? "edge";
    this.player.deathX = hazard?.x ?? this.player.x;
    this.player.vy = -260;
  }

  progress() {
    return Math.max(0, Math.min(1, this.player.x / (316 * (60 / 126) * WORLD_SPEED)));
  }

  beat() {
    return this.lastBeat;
  }

  modeLabel() {
    const labels = { intro: "Awaken", bloom: "Bloom", fracture: "Fracture", drift: "Drift", orbit: "Orbit", outro: "Relay" };
    return labels[this.mode] ?? "Awaken";
  }
}
