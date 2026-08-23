// ============================================================
// NEON MERIDIAN — systems/wanted.js
// Five-star wanted system: crimes raise heat, witnesses matter,
// police spawn per level, escape requires distance+time+line of
// sight loss — then stars decay one at a time.
// ============================================================
'use strict';

const Wanted = (() => {

  const CRIMES = {
    assault:       { heat: 22 },
    pedKilled:     { heat: 60 },
    copKilled:     { heat: 90 },
    carjack:       { heat: 26 },
    vehicleDamage: { heat: 8 },
    copHit:        { heat: 40 },
  };

  class WantedSystem {
    constructor() {
      this.level = 0;            // 0..5 (5 = military response flavor)
      this.heat = 0;             // 0..100 progress into current level
      this.seenRecently = false; // cops have LOS-ish on player
      this.cleanT = 0;           // time since last seen
      this.spawnT = 0;
      this.lastKnown = null;     // last position cops saw
      this.searchMode = false;
    }

    crime(kind, pos, witnessed) {
      const c = CRIMES[kind];
      if (!c) return;
      const mult = witnessed ? 1 : 0.35;   // unseen crime still leaks some heat
      this.heat += c.heat * mult;
      if (witnessed) this.lastKnown = { x: pos.x, z: pos.z };
      this.cleanT = 0;
      this.recomputeLevel();
    }

    recomputeLevel() {
      // thresholds: 20/45/75/115/160 cumulative-ish via rolling heat
      let lvl = 0, rem = this.heat;
      const th = [18, 42, 72, 110, 155];
      for (let i = 0; i < th.length; i++) {
        if (rem >= th[i]) { lvl++; rem -= th[i]; }
      }
      if (lvl > this.level) this.seenRecently = true;
      this.level = clamp(lvl, 0, 5);
      if (this.level === 0) { this.heat = Math.min(this.heat, 10); this.searchMode = false; }
    }

    /** Called each frame by game. Returns spawn requests. */
    update(dt, ctx) {
      if (this.level === 0) { this.heat = Math.max(0, this.heat - dt * 4); return null; }

      const pp = ctx.playerPos;
      // "seen" if any active unit within sight range of player
      let anyClose = false;
      for (const u of ctx.policeUnits) {
        const d = Math.hypot(u.v.pos.x - pp.x, u.v.pos.z - pp.z);
        if (d < 70 && !ctx.playerDead) { anyClose = true; this.lastKnown = { x: pp.x, z: pp.z }; break; }
      }
      for (const f of ctx.footCops) {
        if (f.dead) continue;
        const d = Math.hypot(f.pos.x - pp.x, f.pos.z - pp.z);
        if (d < 46) { anyClose = true; this.lastKnown = { x: pp.x, z: pp.z }; break; }
      }
      this.seenRecently = anyClose;
      this.searchMode = !anyClose;

      if (anyClose) {
        this.cleanT = 0;
      } else {
        this.cleanT += dt;
        const need = CONFIG.WANTED.DECAY_S[this.level] || 30;
        if (this.cleanT > need) {
          this.cleanT = 0;
          this.heat *= 0.45;
          this.recomputeLevel();
          if (this.level === 0) this.heat = 0;
        }
      }

      // spawn cadence
      this.spawnT -= dt;
      const [mn, mx] = CONFIG.WANTED.SPAWN_INTERVAL[Math.min(this.level, 5)] || [12, 16];
      if (this.spawnT <= 0) {
        this.spawnT = mn + Math.random() * (mx - mn);
        // cap active units
        if (ctx.policeUnits.length < CONFIG.POLICE_MAX_ACTIVE) {
          return { spawnCars: Math.min(this.level, 2), footIfClose: this.level >= 2 };
        }
      }
      return null;
    }

    get stars() { return this.level; }
  }

  return { WantedSystem, CRIMES };
})();

if (typeof module !== 'undefined') module.exports = { Wanted };
