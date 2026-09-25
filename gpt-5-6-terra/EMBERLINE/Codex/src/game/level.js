export const GAME = Object.freeze({
  width: 960,
  height: 540,
  floor: 468,
  gravity: 1760
});

export const CHECKPOINTS = Object.freeze({
  platform: { name: "Rain Platform", x: 170, floor: 468, title: "I. Rain Platform" },
  forest: { name: "Moonlit Forest", x: 2420, floor: 468, title: "II. Moonlit Forest" },
  tower: { name: "Signal Tower", x: 4930, floor: 468, title: "III. Signal Tower" },
  locomotive: { name: "Locomotive Deck", x: 7450, floor: 468, title: "IV. Locomotive Deck" }
});

const solid = (x, y, width, height, style = "iron", oneWay = false) => ({
  x, y, width, height, right: x + width, bottom: y + height, style, oneWay
});

export function createLevel() {
  return {
    width: 9150,
    groundStyle: "rails",
    platforms: [
      solid(0, 468, 1220, 72, "stone"),
      solid(1220, 468, 100, 72, "rails", true),
      solid(1040, 394, 130, 18, "wood"),
      solid(1310, 468, 1140, 72, "forest"),
      solid(1830, 382, 150, 18, "wood"),
      solid(2070, 306, 150, 18, "wood"),
      solid(2420, 468, 1320, 72, "forest"),
      solid(2810, 390, 145, 18, "wood"),
      solid(3090, 318, 150, 18, "wood"),
      solid(3420, 250, 160, 18, "wood"),
      solid(3710, 468, 1250, 72, "tower"),
      solid(4050, 386, 140, 18, "iron"),
      solid(4350, 302, 145, 18, "iron"),
      solid(4660, 220, 150, 18, "iron"),
      solid(4920, 468, 1300, 72, "tower"),
      solid(5260, 382, 150, 18, "iron"),
      solid(5580, 298, 150, 18, "iron"),
      solid(5890, 214, 150, 18, "iron"),
      solid(6210, 468, 900, 72, "rails"),
      solid(7080, 468, 2070, 72, "locomotive")
    ],
    gates: [
      { id: "forest", x: 2380, width: 36, height: 154, locked: true, label: "SIGNAL SEAL" },
      { id: "tower", x: 4890, width: 36, height: 154, locked: true, label: "TOWER SEAL" },
      { id: "warden", x: 7050, width: 36, height: 154, locked: true, label: "WARDEN'S STAR" }
    ],
    pickups: [
      { id: "core-platform", type: "core", x: 1090, y: 342, collected: false },
      { id: "sigil-forest", type: "sigil", x: 2880, y: 338, collected: false },
      { id: "core-forest", type: "core", x: 3465, y: 198, collected: false },
      { id: "sigil-tower", type: "sigil", x: 5940, y: 162, collected: false },
      { id: "core-tower", type: "core", x: 6800, y: 400, collected: false },
      { id: "sigil-deck", type: "sigil", x: 7720, y: 400, collected: false }
    ],
    shrine: { id: "sigil-shrine", x: 6525, y: 438, collected: false },
    vents: [
      { id: "vent-1", x: 5000, y: 468, active: false, period: 3.8, offset: 0, triggered: false },
      { id: "vent-2", x: 5740, y: 468, active: false, period: 3.3, offset: 1.1, triggered: false },
      { id: "vent-3", x: 6390, y: 468, active: false, period: 3.0, offset: 2.0, triggered: false },
      { id: "deck-vent", x: 7440, y: 468, active: false, period: 2.7, offset: 0.4, triggered: false }
    ],
    triggers: [
      { id: "enc-1", x: 760, width: 170, fired: false, spawn: "skaters" },
      { id: "enc-2", x: 1710, width: 170, fired: false, spawn: "forest" },
      { id: "enc-3", x: 3230, width: 180, fired: false, spawn: "bellwether" },
      { id: "enc-4", x: 5700, width: 180, fired: false, spawn: "tower-mixed" },
      { id: "enc-5", x: 7980, width: 200, fired: false, spawn: "deck-guard" }
    ],
    boss: { id: "conductor", x: 8330, y: 332, started: false, defeated: false, triggerX: 7920 },
    warden: { id: "steam-warden", x: 8460, y: 300, started: false, defeated: false, triggerX: 8050 },
    gate: { id: "ending", x: 9000, width: 44, height: 190, opened: false, label: "MEMORY VAULT" }
  };
}

export function zoneForX(x) {
  if (x < 1260) return "platform";
  if (x < 2480) return "forest";
  if (x < 3760) return "forest";
  if (x < 4970) return "tower";
  if (x < 6240) return "tower";
  if (x < 7130) return "locomotive";
  return "deck";
}

export function zoneLabel(zone) {
  return {
    platform: "RAIN PLATFORM",
    forest: "MOONLIT FOREST",
    tower: "SIGNAL TOWER",
    locomotive: "NIGHTMAIL APPROACH",
    deck: "LOCOMOTIVE DECK"
  }[zone] || "NIGHTMAIL";
}

export function gateCrossed(level, oldX, newX) {
  return level.gates.some((gate) => oldX <= gate.x && newX >= gate.x + gate.width);
}

export function currentBoss(level) {
  if (!level.boss.defeated) return level.boss;
  if (level.gate.opened || level.wardenDefeated) return null;
  return level.warden;
}
