export const COMBO = Object.freeze({
  WINDUP: [0.075, 0.065, 0.095],
  ACTIVE: [0.105, 0.105, 0.155],
  RECOVERY: [0.12, 0.14, 0.225],
  DAMAGE: [10, 12, 22],
  RANGE: [74, 82, 104],
  KNOCKBACK: [205, 235, 390],
  LIFT: [0, 0, -250]
});

export function comboStep(state, pressed, directional = false) {
  if (!pressed) return state;
  if (state.comboWindow <= 0) return 1;
  if (state.comboIndex >= 2) return 3;
  return state.comboIndex + (directional ? 2 : 1);
}

export function comboTiming(comboIndex, actionTime) {
  const index = Math.max(0, Math.min(2, comboIndex - 1));
  const windup = COMBO.WINDUP[index];
  const active = COMBO.ACTIVE[index];
  const recovery = COMBO.RECOVERY[index];
  const localTime = Math.max(0, actionTime);
  if (localTime < windup) return "windup";
  if (localTime < windup + active) return "active";
  if (localTime < windup + active + recovery) return "recovery";
  return "complete";
}

export function attackFrame(comboIndex, actionTime) {
  const phase = comboTiming(comboIndex, actionTime);
  if (phase === "windup") return 0.25;
  if (phase === "active") return 1;
  if (phase === "recovery") return 0.55;
  return 0;
}

export function takeDamage(target, rawDamage, options = {}) {
  if (!target || !Number.isFinite(target.hp)) {
    return { dealt: 0, blocked: false, staggered: false, dead: false };
  }
  if (target.invulnerable > 0) {
    return { dealt: 0, blocked: false, staggered: false, dead: false };
  }

  const damageType = options.damageType || "physical";
  const directional = Boolean(options.directional);
  const heavy = Boolean(options.heavy);
  const armorBreak = Boolean(options.armorBreak);
  const guarded = target.guard > 0 && !armorBreak && damageType !== "storm" && !directional;
  const damageMultiplier = guarded ? 0.2 : 1;
  const dealt = Math.max(0, Math.round(rawDamage * damageMultiplier));
  target.hp = Math.max(0, target.hp - dealt);

  const armorDamage = damageType === "storm" || heavy || armorBreak || directional ? 2 : 1;
  target.guard = Math.max(0, target.guard - armorDamage);
  const staggered = !guarded && (heavy || damageType === "storm" || target.guard <= 0);
  if (staggered) target.stagger = Math.max(target.stagger || 0, heavy ? 0.72 : 0.42);

  const knockback = guarded
    ? dealt * 8
    : (options.knockback || 0) + (heavy ? 75 : 0) + (damageType === "storm" ? 160 : 0);
  if (knockback) target.vx = (options.direction || 0) * knockback;
  if (options.lift) target.vy = options.lift;
  target.hurtFlash = 0.12;
  target.knockdown = dealt >= 24 || Boolean(options.knockdown);
  if (target.hp <= 0) target.dead = true;

  return { dealt, blocked: guarded, staggered, dead: target.hp <= 0 };
}

export function applyProgression(stats, level) {
  const safeLevel = Math.max(0, Math.floor(level));
  return {
    ...stats,
    maxHp: stats.baseHp + safeLevel * 18,
    lightDamage: stats.baseLight + safeLevel * 2,
    stormDamage: stats.baseStorm + safeLevel * 4
  };
}

export function gainExperience(current, amount) {
  const next = Math.max(0, current + amount);
  return { experience: next, levelsGained: Math.floor(next / 100) };
}

export function effectiveLevel(level, cores) {
  return level + Math.min(3, Math.max(0, cores));
}
