// STARWOVEN — runtime game engine: party control, combat, AI, bosses, fx
"use strict";
import { CHAR_BY_ID, ENEMIES, ELEMENTS, ZONES, elemMult } from './data.js';
import { buildZone, pointBlocked, drawGround, drawDecor, drawObstacle, drawVignette } from './world.js';
import { drawUnitSprite, drawEnemySprite, glow, sigil } from './art.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

export function unitStats(charId, rosterEntry) {
  const c = CHAR_BY_ID[charId];
  const lvl = rosterEntry ? rosterEntry.lvl : 1;
  const asc = rosterEntry ? rosterEntry.asc : 0;
  const lm = 1 + .08 * (lvl - 1), am = 1 + .12 * asc;
  return {
    maxhp: Math.round(c.stats.hp * lm * am),
    atk: Math.round(c.stats.atk * lm * am),
    def: Math.round(c.stats.def * lm * am),
    spd: c.stats.spd,
  };
}

export class Game {
  constructor(canvas, save, hooks) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.save = save; this.hooks = hooks;
    this.state = 'explore'; // explore | wiped | frozen(dialog etc.)
    this.time = 0; this.quality = save.settings.quality || 'high';
    this.zoneId = 'haven'; this.zone = null;
    this.party = []; this.activeIdx = 0;
    this.enemies = []; this.objects = []; this.projectiles = []; this.fields = [];
    this.pickups = []; this.strikes = []; this.floaters = []; this.particles = [];
    this.cam = { x: 0, y: 0, shake: 0 };
    this.keys = {}; this.mouse = { x: 0, y: 0, down: false };
    this.switchCd = 0; this.boss = null;
    this.killCounts = {}; this.beaconChannel = null; this.anchorCount = 0;
    this._pPool = [];
    for (let i = 0; i < 420; i++) this._pPool.push({ on: false });
    this.running = false; this._last = 0; this._raf = 0;
  }

  // ------------------------------------------------------------- zone/party
  loadZone(id, entryPos) {
    const def = ZONES[id];
    this.zoneId = id; this.zone = buildZone(def, this.save);
    this.enemies.length = 0; this.projectiles.length = 0; this.fields.length = 0;
    this.pickups.length = 0; this.strikes.length = 0; this.objects.length = 0;
    this.boss = null; this.anchorCount = 0; this.killCounts = {};
    this.hooks.onBossBar(null);
    const zs = this.save.zones[id] = this.save.zones[id] || {};
    // spawn camps
    if (def.camps && !def.safe) {
      this.camps = def.camps.map(c => ({ ...c, respawnT: 0, alive: [] }));
      this._spawnCampAll();
    } else this.camps = [];
    // boss
    if (def.boss && !zs.bossDead) this._spawnBoss(def.boss);
    // chests not yet opened
    this.chests = (def.chests || []).filter(c => !(zs.chests && zs.chests[c.id]));
    // beacons / anchors
    this.beaconsLeft = 0;
    if (def.beacons) {
      for (const b of def.beacons) {
        if (!(zs.beacons && zs.beacons[b.id])) { this.objects.push({ kind: 'beacon', id: b.id, x: b.x, y: b.y, r: 26 }); this.beaconsLeft++; }
      }
    }
    if (def.anchors) {
      for (const a of def.anchors) {
        if (!(zs.anchors && zs.anchors[a.id])) this.objects.push({ kind: 'anchor', id: a.id, x: a.x, y: a.y, r: 30, hp: a.hp, maxhp: a.hp });
      }
      this.anchorCount = this.objects.filter(o => o.kind === 'anchor').length;
    }
    const e = entryPos || def.entry || { x: def.w / 2, y: def.h - 160 };
    this.party.forEach((u, i) => { u.x = e.x + (i - 1) * 46; u.y = e.y + 20; });
    this.cam.x = e.x; this.cam.y = e.y;
    this.hooks.onMusic(def.music);
  }

  buildParty() {
    this.party = [];
    this.save.team.forEach((cid, i) => {
      if (!cid || !this.save.roster[cid]) return;
      const st = unitStats(cid, this.save.roster[cid]);
      const u = {
        charId: cid, i, x: 0, y: 0, ...st, hp: st.maxhp, energy: i === 0 ? 30 : 0,
        atkCd: 0, skillCd: 0, dodgeCd: 0, dodging: 0, ddvx: 0, ddvy: 0, iframes: 0,
        regen: [], barrier: 0, barrierT: 0, hasteT: 0, atkBuffT: 0, atkBuffPct: 0,
        burnTrailT: 0, spinT: 0, ultReadyPlayed: false, facing: 1, moving: false,
        ai: i === 0 ? 'player' : 'follow',
      };
      this.party.push(u);
    });
    this.activeIdx = 0;
    this.hooks.onPartyChanged();
  }

  get active() { return this.party[this.activeIdx]; }

  // ---------------------------------------------------------------- spawning
  _spawnCampAll() {
    for (const c of this.camps) this._spawnCamp(c);
  }
  _spawnCamp(c) {
    let placed = 0, tries = 0;
    while (placed < c.n && tries < 60) {
      tries++;
      const a = Math.random() * TAU, d = Math.random() * c.r;
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (pointBlocked(this.zone, x, y, 20)) continue;
      this._spawnEnemy(c.type, x, y, c);
      placed++;
    }
  }
  _spawnEnemy(type, x, y, camp = null) {
    const base = ENEMIES[type];
    const scale = 1 + .18 * ((ZONES[this.zoneId].level || 1) - 1);
    const e = {
      type, def: base, camp, x, y, vx: 0, vy: 0,
      maxhp: Math.round(base.hp * scale), hp: Math.round(base.hp * scale),
      atkCd: 1 + Math.random(), windup: 0, windupMax: 0, telegraph: null,
      hurtFlash: 0, t: Math.random() * 9,
      burn: null, slowT: 0, rootT: 0, hexAmp: 0, hexT: 0, fearT: 0, tauntT: 0,
      isBoss: !!base.boss, phase: 0, summonT: 10, chargeT: 5,
    };
    this.enemies.push(e);
    if (camp) camp.alive.push(e);
    return e;
  }
  _spawnBoss(bd) {
    const e = this._spawnEnemy(bd.id, bd.x, bd.y);
    e.isBoss = true; this.boss = e;
    this.hooks.onBossBar(e);
  }

  // ------------------------------------------------------------------- loop
  start() {
    if (this.running) return;
    this.running = true; this._last = performance.now();
    const step = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this._last) / 1000, 0, .05);
      this._last = now;
      if (this.state === 'explore') this.update(dt);
      this.render();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  update(dt) {
    this.time += dt;
    this.switchCd = Math.max(0, this.switchCd - dt);

    // camps respawn
    for (const c of this.camps) {
      if (c.alive.length === 0 && !c.noRespawn) {
        c.respawnT += dt;
        if (c.respawnT > 28) { c.respawnT = 0; this._spawnCamp(c); }
      }
    }
    // active player
    const act = this.active;
    if (act && act.ai === 'player' && act.hp > 0) this._controlPlayer(act, dt);
    for (const u of this.party) {
      if (u !== act && u.hp > 0) this._controlFollow(u, dt);
      this._tickUnit(u, dt);
    }
    // wipe check
    if (this.party.every(u => u.hp <= 0)) {
      this.state = 'wiped';
      this.hooks.onPartyWipe();
      return;
    }
    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      this._updateEnemy(e, dt);
      if (e.hp <= 0) { this._killEnemy(e, i); }
    }
    this._updateProjectiles(dt);
    this._updateFields(dt);
    this._updateStrikes(dt);
    this._updatePickups(dt);
    this._updateParticles(dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt; f.y -= 34 * dt;
      if (f.t > f.dur) this.floaters.splice(i, 1);
    }
    // beacon channel
    if (this.beaconChannel) {
      const bc = this.beaconChannel;
      bc.t += dt;
      if (dist2(act.x, act.y, bc.obj.x, bc.obj.y) > 90 ** 2) { this.beaconChannel = null; this.hooks.onToast('Channel interrupted'); }
      else if (bc.t >= 1.4) this._completeBeacon(bc.obj);
    }
    // camera
    const tx = clamp(act.x + (this.mouse.x - innerWidth / 2) * .12, 0, this.zone.w);
    const ty = clamp(act.y + (this.mouse.y - innerHeight / 2) * .12, 0, this.zone.h);
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
  }

  _controlPlayer(u, dt) {
    let dx = 0, dy = 0;
    if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) dx += 1;
    const len = Math.hypot(dx, dy);
    u.moving = len > 0;
    if (u.dodging > 0) {
      u.dodging -= dt;
      this._moveUnit(u, u.ddvx * dt, u.ddvy * dt);
    } else if (len > 0) {
      const sp = u.spd * (u.hasteT > 0 ? 1.3 : 1) * (u.spinT > 0 ? 1.35 : 1);
      this._moveUnit(u, dx / len * sp * dt, dy / len * sp * dt);
      if (dx !== 0) u.facing = dx < 0 ? -1 : 1;
      if (u.burnTrailT > 0) {
        this.fields.push({ x: u.x, y: u.y, r: 42, t: 0, dur: 2.4, team: 'ally', dps: this._fieldDps(u, .5), color: '#ff6b57' });
      }
      if (u.spinT > 0) {
        this._aoeDamage(u.x, u.y, 120, this._outDmg(u, CHAR_BY_ID[u.charId].ult.fx[0]?.dmg || 1.1), '#7be3b0');
      }
    }
    if (this.mouse.down && u.atkCd <= 0) this.basicAttack(u, Math.atan2(this.mouse.wy - u.y, this.mouse.wx - u.x));
  }

  _controlFollow(u, dt) {
    const act = this.active;
    const ang = u.i * 2.4 + Math.PI * .8;
    const gx = act.x + Math.cos(ang) * 64, gy = act.y + Math.sin(ang) * 64;
    const d = Math.hypot(gx - u.x, gy - u.y);
    u.moving = false;
    if (d > 40) {
      const sp = u.spd * .92 * (u.hasteT > 0 ? 1.3 : 1);
      this._moveUnit(u, (gx - u.x) / d * sp * dt, (gy - u.y) / d * sp * dt);
      u.moving = true; u.facing = gx > u.x ? 1 : -1;
    }
    // auto basic at nearby enemy
    if (u.atkCd <= 0) {
      let best = null, bd = Infinity;
      const ch = CHAR_BY_ID[u.charId];
      for (const e of this.enemies) {
        const dd = dist2(u.x, u.y, e.x, e.y);
        if (dd < (ch.basic.range + 60) ** 2 && dd < bd) { best = e; bd = dd; }
      }
      if (best) {
        const a = Math.atan2(best.y - u.y, best.x - u.x);
        this.basicAttack(u, a, true);
        u.facing = Math.cos(a) >= 0 ? 1 : -1;
      }
    }
  }

  _tickUnit(u, dt) {
    u.atkCd -= dt; u.skillCd -= dt; u.dodgeCd -= dt; u.iframes -= dt;
    u.hasteT -= dt; u.atkBuffT -= dt; u.barrierT -= dt; u.burnTrailT -= dt; u.spinT -= dt;
    if (u.barrierT <= 0) u.barrier = 0;
    for (let i = u.regen.length - 1; i >= 0; i--) {
      const r = u.regen[i]; r.t -= dt;
      this._healUnit(u, u.maxhp * r.pct * dt);
      if (r.t <= 0) u.regen.splice(i, 1);
    }
    void dt;
  }

  _moveUnit(u, mx, my) {
    const nx = u.x + mx, ny = u.y + my;
    if (!pointBlocked(this.zone, nx, u.y, 14)) u.x = nx;
    if (!pointBlocked(this.zone, u.x, ny, 14)) u.y = ny;
  }

  // -------------------------------------------------------------- abilities
  _outDmg(u, mult) {
    const c = CHAR_BY_ID[u.charId];
    let d = u.atk * mult;
    if (u.atkBuffT > 0) d *= 1 + u.atkBuffPct;
    if (c.passive.startsWith('Stargrazed') && u.hp < u.maxhp * .5) d *= 1.2;
    return d;
  }
  _fieldDps(u, mult) { return this._outDmg(u, mult); }

  basicAttack(u, angle, isFollow = false) {
    const c = CHAR_BY_ID[u.charId], B = c.basic;
    u.atkCd = B.cd * (isFollow ? 1.55 : 1);
    const E = ELEMENTS[c.element];
    switch (B.kind) {
      case 'bolt': {
        this._proj(u, angle, 640, B.range, this._outDmg(u, B.dmg), E.color, {
          pierce: B.pierce || 0, slow: B.slow, slowDur: B.slowDur, hex: B.hex, hexDur: B.hexDur,
        });
        break; }
      case 'arc': {
        this._meleeArc(u, angle, B.range, B.spread || 1.5, this._outDmg(u, B.dmg), E.color);
        break; }
      case 'chain': {
        const targets = this.enemies
          .filter(e => dist2(u.x, u.y, e.x, e.y) < (B.range + e.def.r) ** 2)
          .sort((a, b) => dist2(u.x, u.y, a.x, a.y) - dist2(u.x, u.y, b.x, b.y)).slice(0, 3);
        for (const e of targets) this._damageEnemy(e, this._outDmg(u, B.dmg), u, E.color);
        this._fxArc(u, angle, B.range, E.color, .5);
        break; }
      case 'lob': {
        const d = Math.min(B.range, Math.hypot(this.mouse.wx - u.x, this.mouse.wy - u.y));
        const tx = u.x + Math.cos(angle) * d, ty = u.y + Math.sin(angle) * d;
        this.projectiles.push({
          lob: { t: 0, dur: .55, sx: u.x, sy: u.y, tx, ty }, r: 8, team: 'ally',
          owner: u, dmg: this._outDmg(u, B.dmg), color: E.color,
          blast: B.blast, burn: B.burn, burnDps: B.burnDps, life: 3,
        });
        break; }
      case 'wave': {
        this._meleeArc(u, angle, B.range, 1.1, this._outDmg(u, B.dmg), E.color, true);
        break; }
    }
    if (!isFollow) this.hooks.onSfx(u === this.active ? 'hit' : 'hit');
  }

  castSkill(u) {
    const c = CHAR_BY_ID[u.charId];
    if (u.skillCd > 0 || u.hp <= 0) return false;
    u.skillCd = c.skill.cd;
    const angle = Math.atan2(this.mouse.wy - u.y, this.mouse.wx - u.x);
    const E = ELEMENTS[c.element];
    for (const fx of c.skill.fx) this._applyFx(u, fx, angle, E, c);
    this.hooks.onSfx('ultCast'); this._burst(u.x, u.y, E.color, 16);
    return true;
  }

  castUlt(u) {
    const c = CHAR_BY_ID[u.charId];
    if (u.energy < 100 || u.hp <= 0) return false;
    u.energy = 0; u.ultReadyPlayed = false;
    const angle = Math.atan2(this.mouse.wy - u.y, this.mouse.wx - u.x);
    const E = ELEMENTS[c.element];
    this.cam.shake = 10;
    this.hooks.onSfx('ultCast');
    for (const fx of c.ult.fx) this._applyFx(u, fx, angle, E, c);
    return true;
  }

  _applyFx(u, fx, angle, E, c) {
    switch (fx.kind) {
      case 'heal': {
        const amt = u.maxhp * fx.pct;
        for (const p of this.party) if (p.hp > 0 && dist2(p.x, p.y, u.x, u.y) < (c.skill.radius || 260) ** 2)
          this._healUnit(p, c.passive.startsWith('Deep Calm') && p.hp < p.maxhp * .5 ? amt * 1.2 : amt);
        this._burst(u.x, u.y, '#aef2c3', 12);
        break; }
      case 'regen':
        u.regen.push({ pct: fx.pct, t: fx.dur });
        break;
      case 'cleanse': u.slowT = 0; break; // allies have few debuffs; symbolic
      case 'nova':
        this._aoeDamage(u.x, u.y, fx.r, this._outDmg(u, fx.dmg), E.color, fx.executeBonus, fx.bonusMult);
        this.cam.shake = 8; this._ring(u.x, u.y, fx.r, E.color);
        break;
      case 'partyBuff':
        for (const p of this.party) if (p.hp > 0) { p.atkBuffPct = fx.atkPct; p.atkBuffT = fx.dur; }
        this.hooks.onToast(`${c.name}: ${c.ult.name}!`);
        break;
      case 'partyHaste':
        for (const p of this.party) if (p.hp > 0) p.hasteT = fx.dur;
        break;
      case 'meteors':
        for (let i = 0; i < fx.n; i++) {
          const a = Math.random() * TAU, d = Math.random() * fx.r;
          this.strikes.push({ x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, delay: .25 + i * fx.delay, dmg: this._outDmg(u, fx.dmg), r: 86, color: '#ff8a4a', burn: { dur: 3, dps: .22 * u.atk } });
        }
        break;
      case 'burnField':
        this.fields.push({ x: u.x, y: u.y, r: fx.r, t: 0, dur: fx.dur, team: 'ally', dps: this._fieldDps(u, fx.dps), color: '#ff6b57' });
        break;
      case 'dash': {
        const nx = u.x + Math.cos(angle) * fx.len, ny = u.y + Math.sin(angle) * fx.len;
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const px = u.x + (nx - u.x) * i / steps, py = u.y + (ny - u.y) * i / steps;
          this._aoeDamage(px, py, fx.width / 2, this._outDmg(u, fx.dmg / 3), E.color);
        }
        if (c.basic.kind !== 'lob') { /* trail */
          for (let i = 0; i < 10; i++) this._spark(u.x + (nx - u.x) * Math.random(), u.y + (ny - u.y) * Math.random(), E.color);
        }
        if (!pointBlocked(this.zone, nx, ny, 14)) { u.x = nx; u.y = ny; }
        if (fx.kind === 'dash' && c.id === 'orion') {
          for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < 200 ** 2) e.burn = { t: fx.dur, dps: u.atk * .25 };
        }
        break; }
      case 'resetDodge': u.dodgeCd = 0; break;
      case 'root':
        for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < fx.r ** 2) {
          e.rootT = Math.max(e.rootT, fx.dur);
          this._damageEnemy(e, this._outDmg(u, fx.dmg), u, E.color);
        }
        this._ring(u.x, u.y, fx.r, E.color);
        break;
      case 'taunt':
        for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < fx.r ** 2) e.tauntT = fx.dur;
        break;
      case 'barrier': u.barrier = u.maxhp * fx.pct; u.barrierT = fx.dur; break;
      case 'partyBarrier':
        for (const p of this.party) if (p.hp > 0) { p.barrier = p.maxhp * fx.pct; p.barrierT = fx.dur; }
        break;
      case 'field':
        this.fields.push({
          x: u.x, y: u.y, r: fx.r, t: 0, dur: fx.dur, team: 'ally',
          healTick: fx.healTick ? () => u.maxhp * fx.healTick : null,
          thorns: fx.thorns ? () => u.atk * fx.thorns : null,
          color: E.color,
        });
        break;
      case 'chainLightning': {
        let src = u; const hitIds = new Set();
        let px = u.x, py = u.y;
        const cand = this.enemies.filter(e => dist2(e.x, e.y, u.x, u.y) < 520 ** 2)
          .sort((a, b) => dist2(a.x, a.y, u.x, u.y) - dist2(b.x, b.y, u.x, u.y)).slice(0, fx.targets);
        for (const e of cand) {
          this._damageEnemy(e, this._outDmg(u, fx.dmg * (1 - hitIds.size * .06)), u, '#7be3b0');
          this._boltFx(px, py, e.x, e.y);
          px = e.x; py = e.y; hitIds.add(e);
        }
        break; }
      case 'hex':
        for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < fx.r ** 2) {
          e.hexAmp = fx.amp; e.hexT = fx.dur;
          this._damageEnemy(e, this._outDmg(u, fx.dmg), u, E.color);
        }
        this._ring(u.x, u.y, fx.r, E.color);
        break;
      case 'hexAll':
        for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < fx.r ** 2) { e.hexAmp = fx.amp; e.hexT = fx.dur; }
        break;
      case 'fear':
        for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < fx.r ** 2) e.fearT = fx.dur;
        break;
      case 'pull':
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - u.x, e.y - u.y);
          if (d < fx.r && d > 1) {
            e.vx -= (e.x - u.x) / d * fx.force; e.vy -= (e.y - u.y) / d * fx.force;
            if (fx.dmg) this._damageEnemy(e, this._outDmg(u, fx.dmg), u, E.color);
          }
        }
        break;
      case 'knockback':
        this._aoeDamage(u.x, u.y, fx.r, this._outDmg(u, fx.dmg), E.color);
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - u.x, e.y - u.y);
          if (d < fx.r && d > 1) { e.vx += (e.x - u.x) / d * fx.force; e.vy += (e.y - u.y) / d * fx.force; }
        }
        this.cam.shake = 12;
        this._ring(u.x, u.y, fx.r, E.color);
        break;
      case 'burn':
        for (const e of this.enemies) if (dist2(e.x, e.y, u.x, u.y) < 300 ** 2)
          e.burn = { t: fx.dur, dps: u.atk * fx.dps };
        break;
      case 'burnTrail': u.burnTrailT = fx.dur; break;
      case 'spinDash': u.spinT = fx.dur; u.iframes = Math.max(u.iframes, fx.dur); break;
    }
  }

  dodge(u) {
    if (u.dodgeCd > 0 || u.hp <= 0) return;
    u.dodgeCd = u.charId === 'aquila' ? 1.1 : 1.4;
    let dx = 0, dy = 0;
    if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) dx += 1;
    if (!dx && !dy) { dx = Math.cos(Math.atan2(this.mouse.wy - u.y, this.mouse.wx - u.x)); dy = Math.sin(Math.atan2(this.mouse.wy - u.y, this.mouse.wx - u.x)); }
    const l = Math.hypot(dx, dy);
    u.ddvx = dx / l * 900; u.ddvy = dy / l * 900;
    u.dodging = .17; u.iframes = .32;
    if (CHAR_BY_ID[u.charId].passive.startsWith('Slipstream')) u.hasteT = 4;
    this.hooks.onSfx('dodge');
  }

  // --------------------------------------------------------------- damage
  _damageEnemy(e, raw, source, color = '#fff') {
    if (e.hp <= 0) return;
    const c = source ? CHAR_BY_ID[source.charId] : null;
    let d = raw;
    if (c) d *= elemMult(c.element, e.def.element);
    if (e.hexT > 0) d *= 1 + e.hexAmp;
    if (c && c.passive.startsWith("Court's Price") && e.rootT > 0) d *= 1.3;
    d = Math.max(1, d - e.def.def);
    const crit = Math.random() < .12;
    if (crit) d *= 1.6;
    e.hp -= d; e.hurtFlash = .09;
    this._floater(e.x, e.y - e.def.r - 8, Math.round(d), crit ? '#ffd76b' : '#fff', crit);
    this._spark(e.x, e.y, color);
    if (source) {
      source.energy = Math.min(100, source.energy + (crit ? 11 : 8));
      if (source.energy >= 100 && !source.ultReadyPlayed && source.ai === 'player') {
        source.ultReadyPlayed = true; this.hooks.onSfx('ultReady'); this.hooks.onPartyChanged();
      }
      if (c && c.passive.startsWith('Flock Ledger') && e.hexT > 0 && e.hp <= 0)
        source.energy = Math.min(100, source.energy + 3);
    }
    if (crit) this.hooks.onSfx('crit'); 
  }
  _damageObject(o, raw) {
    o.hp -= raw;
    this._floater(o.x, o.y - 30, Math.round(raw), '#fff', false);
    this._spark(o.x, o.y, '#b48cff');
    if (o.hp <= 0 && o.kind === 'anchor') {
      this._burst(o.x, o.y, '#b48cff', 24);
      this.cam.shake = 8;
      const zs = this.save.zones[this.zoneId] = this.save.zones[this.zoneId] || {};
      zs.anchors = zs.anchors || {}; zs.anchors[o.id] = true;
      this.objects.splice(this.objects.indexOf(o), 1);
      this.hooks.onEvent({ type: 'anchor', zone: this.zoneId });
    }
  }
  _damageUnit(u, raw, srcEnemy) {
    if (u.iframes > 0 || u.hp <= 0) return;
    let d = Math.max(1, raw - u.def);
    if (CHAR_BY_ID[u.charId].passive.startsWith('Rooted Bloom') && u.hp < u.maxhp * .5) d *= .85;
    if (u.barrier > 0) {
      const abs = Math.min(u.barrier, d); u.barrier -= abs; d -= abs;
    }
    if (d <= 0) return;
    u.hp -= d;
    u.iframes = .25;
    this._floater(u.x, u.y - 40, Math.round(d), '#ff8a8a', false);
    this.cam.shake = Math.max(this.cam.shake, 4);
    u.energy = Math.min(100, u.energy + (CHAR_BY_ID[u.charId].passive.startsWith('Warm Heart') ? 4 : 2));
    this.hooks.onSfx('hurt');
    if (u.hp <= 0) {
      u.hp = 0;
      this._burst(u.x, u.y, '#8fa3c7', 20);
      const nextAlive = this.party.findIndex(p => p.hp > 0);
      if (nextAlive >= 0) { this.activeIdx = nextAlive; this.hooks.onToast(`${CHAR_BY_ID[u.charId].name} falls — switching!`); this.hooks.onPartyChanged(); }
    }
  }
  _healUnit(u, amt) {
    if (u.hp <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxhp, u.hp + amt);
    if (u.hp - before > 2) this._floater(u.x, u.y - 44, '+' + Math.round(u.hp - before), '#aef2c3', false);
  }
  _aoeDamage(x, y, r, dmg, color, executeBonus, bonusMult) {
    for (const e of this.enemies) {
      const rr = r + e.def.r;
      if (dist2(e.x, e.y, x, y) < rr * rr) {
        let d = dmg;
        if (executeBonus && e.hp < e.maxhp * executeBonus) d *= bonusMult;
        this._damageEnemy(e, d, this.active, color);
      }
    }
    for (const o of this.objects) if (o.kind === 'anchor' && dist2(o.x, o.y, x, y) < (r + o.r) ** 2) this._damageObject(o, dmg);
  }
  _meleeArc(u, angle, range, spread, dmg, color, push = false) {
    const hit = [];
    for (const e of this.enemies) {
      const d = Math.sqrt(dist2(u.x, u.y, e.x, e.y));
      if (d < range + e.def.r) {
        const a = Math.atan2(e.y - u.y, e.x - u.x);
        let diff = Math.abs(((a - angle) % TAU + TAU + Math.PI) % TAU - Math.PI);
        if (diff < spread / 2) {
          this._damageEnemy(e, dmg, u, color);
          if (push) { e.vx += Math.cos(angle) * 240; e.vy += Math.sin(angle) * 240; }
          hit.push(e);
        }
      }
    }
    for (const o of this.objects) if (o.kind === 'anchor' && dist2(o.x, o.y, u.x, u.y) < (range + o.r) ** 2) this._damageObject(o, dmg);
    this._fxArc(u, angle, range, color, .35);
    void hit;
  }
  _proj(u, angle, spd, range, dmg, color, opts = {}) {
    this.projectiles.push({
      x: u.x + Math.cos(angle) * 16, y: u.y + Math.sin(angle) * 16,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      r: 6, team: 'ally', owner: u, dmg, color, pierce: opts.pierce || 0,
      life: range / spd, hits: new Set(),
      slow: opts.slow, slowDur: opts.slowDur, hex: opts.hex, hexDur: opts.hexDur,
    });
  }
  _killEnemy(e, idx) {
    this.enemies.splice(idx, 1);
    if (e.camp) { const ci = e.camp.alive.indexOf(e); if (ci >= 0) e.camp.alive.splice(ci, 1); }
    this._burst(e.x, e.y, e.def.color, e.isBoss ? 40 : 10);
    // rewards
    const moteAmt = e.def.mote[0] + Math.floor(Math.random() * (e.def.mote[1] - e.def.mote[0] + 1));
    this._dropPickups(e.x, e.y, 'mote', moteAmt);
    if (Math.random() < .03) this._dropPickups(e.x, e.y, 'star', 1);
    // xp to whole party
    const share = Math.round(e.def.xp / Math.max(1, this.party.filter(p => p.hp > 0).length));
    for (const p of this.party) if (p.hp > 0) this._giveXp(p, share);
    if (e.isBoss) {
      const zs = this.save.zones[this.zoneId] = this.save.zones[this.zoneId] || {};
      zs.bossDead = true; this.boss = null; this.hooks.onBossBar(null);
      this.cam.shake = 16;
      this.hooks.onEvent({ type: 'boss', boss: e.type, zone: this.zoneId });
    }
    this.hooks.onEvent({ type: 'kill', enemy: e.type, zone: this.zoneId });
  }
  _giveXp(u, xp) {
    const re = this.save.roster[u.charId];
    re.xp += xp;
    let leveled = false;
    while (re.xp >= this._xpNeed(re.lvl) && re.lvl < 30) {
      re.xp -= this._xpNeed(re.lvl); re.lvl++; leveled = true;
    }
    const st = unitStats(u.charId, re);
    const ratio = u.hp / u.maxhp;
    Object.assign(u, st); u.hp = Math.round(st.maxhp * (leveled ? Math.min(1, ratio + .3) : ratio));
    if (leveled) { this.hooks.onSfx('levelup'); this._floater(u.x, u.y - 56, 'LEVEL UP!', '#ffd76b', true); this.hooks.onPartyChanged(); }
  }
  _xpNeed(lvl) { return Math.round(50 * Math.pow(lvl, 1.32)); }

  // ------------------------------------------------------------ enemy AI
  _updateEnemy(e, dt) {
    e.t += dt; e.hurtFlash -= dt;
    e.slowT -= dt; e.rootT -= dt; e.hexT -= dt; e.fearT -= dt; e.tauntT -= dt;
    if (e.burn) { e.burn.t -= dt; e.hp -= e.burn.dps * dt; if (Math.random() < dt * 6) this._spark(e.x, e.y, '#ff6b57'); if (e.burn.t <= 0) e.burn = null; }
    // knockback velocity decay
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx *= Math.pow(.001, dt); e.vy *= Math.pow(.001, dt);
    if (pointBlocked(this.zone, e.x, e.y, e.def.r)) { e.x -= e.vx * dt * 2; e.y -= e.vy * dt * 2; e.vx = 0; e.vy = 0; }
    e.x = clamp(e.x, 40, this.zone.w - 40); e.y = clamp(e.y, 40, this.zone.h - 40);
    if (e.rootT > 0) return;
    const act = this.active;
    const spd = e.def.spd * (e.slowT > 0 ? .72 : 1);
    e.atkCd -= dt;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) this._enemyStrike(e);
      return;
    }
    switch (e.def.ai) {
      case 'chase': {
        const d = Math.sqrt(dist2(e.x, e.y, act.x, act.y));
        if (e.fearT > 0) { this._flee(e, act, spd, dt); break; }
        if (d > 44) this._seek(e, act.x, act.y, spd, dt);
        else if (e.atkCd <= 0) { e.windup = .42; e.windupMax = .42; }
        break; }
      case 'ranged': {
        const d = Math.sqrt(dist2(e.x, e.y, act.x, act.y));
        if (d > 340) this._seek(e, act.x, act.y, spd, dt);
        else if (d < 220) this._flee(e, act, spd, dt);
        if (e.atkCd <= 0 && d < 430) { e.windup = .4; e.windupMax = .4; }
        break; }
      case 'slam': {
        const d = Math.sqrt(dist2(e.x, e.y, act.x, act.y));
        if (d > 95) this._seek(e, act.x, act.y, spd, dt);
        else if (e.atkCd <= 0) { e.windup = .65; e.windupMax = .65; }
        break; }
      case 'boss_slam_charge': {
        const d = Math.sqrt(dist2(e.x, e.y, act.x, act.y));
        e.chargeT -= dt;
        if (e.chargeT <= 0 && d > 140) {
          e.chargeT = 6;
          const a = Math.atan2(act.y - e.y, act.x - e.x);
          e.vx = Math.cos(a) * 700; e.vy = Math.sin(a) * 700;
          this._telegraphRing(e.x, e.y, 120, .5);
        } else if (d > 110) this._seek(e, act.x, act.y, spd, dt);
        else if (e.atkCd <= 0) { e.windup = .55; e.windupMax = .55; e.telegraph = { x: e.x, y: e.y, r: 150 }; }
        break; }
      case 'boss_waves_summon': {
        const d = Math.sqrt(dist2(e.x, e.y, act.x, act.y));
        e.summonT -= dt;
        if (e.summonT <= 0 && this.enemies.length < 13) {
          e.summonT = 12;
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * TAU;
            this._spawnEnemy('wisp', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
          }
          this._ring(e.x, e.y, 90, '#4fc3dd');
        }
        if (d > 200) this._seek(e, act.x, act.y, spd, dt);
        else if (e.atkCd <= 0) { e.windup = .6; e.windupMax = .6; }
        break; }
      case 'boss_regent': {
        const d = Math.sqrt(dist2(e.x, e.y, act.x, act.y));
        const hpr = e.hp / e.maxhp;
        const newPhase = hpr < .33 ? 2 : hpr < .66 ? 1 : 0;
        if (newPhase !== e.phase) {
          e.phase = newPhase; this.cam.shake = 14;
          this.hooks.onToast('The Regent unravels further!');
          for (let i = 0; i < 3 + e.phase * 2; i++) {
            const a = Math.random() * TAU;
            this._spawnEnemy('riftling', e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
          }
          this._ring(e.x, e.y, 180, '#b48cff');
        }
        if (d > 130) this._seek(e, act.x, act.y, spd * (1 + e.phase * .18), dt);
        else if (e.atkCd <= 0) { e.windup = .5 - e.phase * .06; e.windupMax = e.windup; e.telegraph = { x: e.x, y: e.y, r: 170 + e.phase * 30 }; }
        break; }
    }
  }
  _seek(e, tx, ty, spd, dt) {
    const d = Math.hypot(tx - e.x, ty - e.y);
    if (d < 1) return;
    const nx = e.x + (tx - e.x) / d * spd * dt, ny = e.y + (ty - e.y) / d * spd * dt;
    if (!pointBlocked(this.zone, nx, e.y, e.def.r)) e.x = nx; else e.atkCd = Math.min(e.atkCd, 0);
    if (!pointBlocked(this.zone, e.x, ny, e.def.r)) e.y = ny;
  }
  _flee(e, act, spd, dt) {
    const d = Math.hypot(e.x - act.x, e.y - act.y);
    if (d > 1) this._seek(e, e.x + (e.x - act.x) / d * 100, e.y + (e.y - act.y) / d * 100, spd, dt);
  }
  _enemyStrike(e) {
    const act = this.active;
    e.telegraph = null;
    const touch = (rr) => {
      for (const u of this.party) if (u.hp > 0 && dist2(u.x, u.y, rr.x, rr.y) < (rr.r + 14) ** 2)
        this._damageUnit(u, e.def.atk * (1 + .15 * (ZONES[this.zoneId].level - 1)), e);
    };
    switch (e.def.ai) {
      case 'chase': touch({ x: e.x + Math.sign(act.x - e.x) * 20, y: e.y, r: 40 }); break;
      case 'ranged': {
        const a = Math.atan2(act.y - e.y, act.x - e.x);
        this.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, r: 7, team: 'enemy', dmg: e.def.atk, color: '#6fd8c9', life: 2 });
        break; }
      case 'slam': case 'boss_slam_charge':
        if (e.def.ai === 'slam') touch({ x: e.x, y: e.y, r: 115 });
        else touch({ x: e.x, y: e.y, r: 150 });
        this._ring(e.x, e.y, 130, '#b48cff'); this.cam.shake = 6;
        break;
      case 'boss_waves_summon': {
        const n = 8, off = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
          const a = off + i / n * TAU;
          this.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 8, team: 'enemy', dmg: e.def.atk * .7, color: '#4fc3dd', life: 1.6 });
        }
        break; }
      case 'boss_regent':
        touch({ x: e.x, y: e.y, r: 170 + e.phase * 30 });
        this._ring(e.x, e.y, 190, '#b48cff'); this.cam.shake = 8;
        if (e.phase >= 1) {
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * TAU + e.t;
            this.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 8, team: 'enemy', dmg: e.def.atk * .6, color: '#d8b4ff', life: 1.8 });
          }
        }
        break;
    }
    e.atkCd = e.def.boss ? 2.2 : 1.7;
  }

  // ---------------------------------------------------------- world systems
  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.lob) this._lobLand(p); this.projectiles.splice(i, 1); continue; }
      if (p.lob) {
        p.lob.t += dt;
        const k = Math.min(1, p.lob.t / p.lob.dur);
        p.x = p.lob.sx + (p.lob.tx - p.lob.sx) * k;
        p.y = p.lob.sy + (p.lob.ty - p.lob.sy) * k;
        p.z = Math.sin(k * Math.PI) * 70;
        if (k >= 1) { this._lobLand(p); this.projectiles.splice(i, 1); }
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (pointBlocked(this.zone, p.x, p.y, p.r)) { this.projectiles.splice(i, 1); continue; }
      if (p.team === 'ally') {
        let consumed = false;
        for (const e of this.enemies) {
          if (p.hits.has(e)) continue;
          if (dist2(e.x, e.y, p.x, p.y) < (p.r + e.def.r) ** 2) {
            this._damageEnemy(e, p.dmg, p.owner, p.color);
            if (p.burn != null) e.burn = { t: p.burn, dps: p.owner ? p.owner.atk * (p.burnDps || .2) : 8 };
            if (p.slow) { e.slowT = p.slowDur; }
            if (p.hex) { e.hexAmp = p.hex; e.hexT = p.hexDur; }
            p.hits.add(e);
            if (p.hits.size > p.pierce) { consumed = true; break; }
          }
        }
        for (const o of this.objects) {
          if (o.kind === 'anchor' && !p.hits.has(o) && dist2(o.x, o.y, p.x, p.y) < (p.r + o.r) ** 2) {
            this._damageObject(o, p.dmg); p.hits.add(o);
            if (p.hits.size > p.pierce) consumed = true;
          }
        }
        if (consumed) { this.projectiles.splice(i, 1); continue; }
      } else {
        for (const u of this.party) {
          if (u.hp > 0 && dist2(u.x, u.y, p.x, p.y) < (p.r + 14) ** 2) {
            this._damageUnit(u, p.dmg);
            this.projectiles.splice(i, 1);
            break;
          }
        }
      }
    }
  }
  _lobLand(p) {
    const u = p.owner;
    this._aoeDamage(p.x, p.y, p.blast, p.dmg, p.color);
    this._ring(p.x, p.y, p.blast, p.color);
    this._burst(p.x, p.y, p.color, 12);
    if (p.burn) this.fields.push({ x: p.x, y: p.y, r: p.blast * .8, t: 0, dur: p.burn, team: 'ally', dps: u ? u.atk * p.burnDps : 8, color: '#ff6b57' });
    this.hooks.onSfx('hit');
  }
  _updateFields(dt) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i]; f.t += dt;
      if (f.t >= f.dur) { this.fields.splice(i, 1); continue; }
      if (f.team === 'ally') {
        if (f.healTick) for (const u of this.party) if (u.hp > 0 && dist2(u.x, u.y, f.x, f.y) < f.r ** 2) this._healUnit(u, f.healTick() * dt);
        if (f.dps) for (const e of this.enemies) if (dist2(e.x, e.y, f.x, f.y) < (f.r + e.def.r) ** 2) e.hp -= f.dps * dt;
        if (f.thorns) for (const e of this.enemies) if (dist2(e.x, e.y, f.x, f.y) < (f.r + e.def.r) ** 2) e.hp -= f.thorns() * dt;
      }
    }
  }
  _updateStrikes(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]; s.delay -= dt;
      if (s.delay <= 0) {
        this._aoeDamage(s.x, s.y, s.r, s.dmg, s.color);
        this._ring(s.x, s.y, s.r, s.color); this._burst(s.x, s.y, s.color, 14);
        this.cam.shake = 6;
        for (const e of this.enemies) if (dist2(e.x, e.y, s.x, s.y) < (s.r + 40) ** 2 && s.burn) e.burn = { t: s.burn.dur, dps: s.burn.dps };
        this.strikes.splice(i, 1);
      }
    }
  }
  _dropPickups(x, y, kind, amt) {
    const n = kind === 'mote' ? Math.min(6, Math.ceil(amt / 5)) : amt;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.pickups.push({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, kind, amt: Math.ceil(amt / n), t: 0 });
    }
  }
  _updatePickups(dt) {
    const act = this.active;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]; p.t += dt;
      const d = Math.sqrt(dist2(p.x, p.y, act.x, act.y));
      if (d < 130 && p.t > .35) {
        p.vx += (act.x - p.x) / d * 900 * dt; p.vy += (act.y - p.y) / d * 900 * dt;
      } else { p.vx *= .9; p.vy *= .9; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (d < 22 && p.t > .3) {
        if (p.kind === 'mote') { this.save.currencies.mote += p.amt; }
        else { this.save.currencies.star += p.amt; this.hooks.onToast('+1 Starpiece'); }
        this.hooks.onSfx('pickup');
        this.pickups.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------- interact
  nearestInteractable() {
    const act = this.active;
    if (!act) return null;
    let best = null, bd = 85 ** 2;
    for (const poi of this.zone.def.pois || []) {
      const d = dist2(act.x, act.y, poi.x, poi.y);
      if (d < bd) { best = { kind: 'poi', ...poi }; bd = d; }
    }
    for (const o of this.objects) {
      if (o.kind !== 'beacon') continue;
      const d = dist2(act.x, act.y, o.x, o.y);
      if (d < bd) { best = { kind: 'beacon', obj: o }; bd = d; }
    }
    for (const c of this.chests) {
      const d = dist2(act.x, act.y, c.x, c.y);
      if (d < bd) { best = { kind: 'chest', chest: c }; bd = d; }
    }
    for (const pt of this.zone.def.portals || []) {
      if (!pt.unlocked(this.save)) continue;
      const d = dist2(act.x, act.y, pt.x, pt.y);
      if (d < bd) { best = { kind: 'portal', portal: pt }; bd = d; }
    }
    return best;
  }
  tryInteract() {
    const it = this.nearestInteractable();
    if (!it) return false;
    switch (it.kind) {
      case 'loom':
        this.hooks.onOpenLoom();
        return true;
      case 'npc':
        this.hooks.onNpc(it.npc);
        return true;
      case 'campfire':
        this.party.forEach(u => u.hp = u.maxhp);
        this.hooks.onSfx('heal');
        this.hooks.onToast('The hearth mends your wounds.');
        return true;
      case 'dummy':
        this.hooks.onToast('Training dummy: wail away! (resets itself)');
        return true;
      case 'chest': {
        const c = it.chest;
        const zs = this.save.zones[this.zoneId] = this.save.zones[this.zoneId] || {};
        zs.chests = zs.chests || {}; zs.chests[c.id] = true;
        this.save.currencies.star += c.star; this.save.currencies.mote += c.mote;
        this.chests.splice(this.chests.indexOf(c), 1);
        this.hooks.onSfx('chest');
        this.hooks.onToast(`Chest: +${c.star} Starpieces, +${c.mote} Motes`);
        if (c.quest) this.hooks.onEvent({ type: 'chest', chest: c.id, zone: this.zoneId });
        return true; }
      case 'portal':
        this.hooks.onPortal(it.portal.to);
        return true;
      case 'beacon':
        this.beaconChannel = { obj: it.obj, t: 0 };
        this.hooks.onSfx('uiClick');
        return true;
    }
    return false;
  }
  _completeBeacon(obj) {
    const zs = this.save.zones[this.zoneId] = this.save.zones[this.zoneId] || {};
    zs.beacons = zs.beacons || {}; zs.beacons[obj.id] = true;
    this.objects.splice(this.objects.indexOf(obj), 1);
    this.beaconChannel = null;
    this._burst(obj.x, obj.y, '#4fc3dd', 22);
    this.hooks.onSfx('questDone');
    this.hooks.onToast('Pylon awakened!');
    this.hooks.onEvent({ type: 'beacon', zone: this.zoneId });
  }

  reviveAtHaven() {
    this.state = 'explore';
    for (const u of this.party) { u.hp = Math.round(u.maxhp * .6); }
    this.loadZone('haven');
    this.hooks.onPartyChanged();
  }

  // ------------------------------------------------------------- fx helpers
  _floater(x, y, text, color, big) {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ x: x + (Math.random() * 16 - 8), y, text, color, t: 0, dur: big ? 1.1 : .75, big });
  }
  _spark(x, y, color) {
    const p = this._pPool.find(p => !p.on);
    if (!p) return;
    p.on = true; p.x = x; p.y = y;
    const a = Math.random() * TAU, s = 60 + Math.random() * 140;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
    p.life = p.maxLife = .3 + Math.random() * .25; p.color = color; p.size = 1.5 + Math.random() * 2; p.type = 'spark';
  }
  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) this._spark(x, y, color);
    this._ring(x, y, 26, color);
  }
  _ring(x, y, r, color) {
    const p = this._pPool.find(p => !p.on);
    if (!p) return;
    p.on = true; p.x = x; p.y = y; p.vx = p.vy = 0;
    p.life = p.maxLife = .4; p.color = color; p.size = r; p.type = 'ring';
  }
  _boltFx(x1, y1, x2, y2) {
    const p = this._pPool.find(p => !p.on);
    if (!p) return;
    p.on = true; p.x = x1; p.y = y1; p.tx = x2; p.ty = y2; p.vx = p.vy = 0;
    p.life = p.maxLife = .18; p.color = '#7be3b0'; p.size = 0; p.type = 'bolt';
  }
  _fxArc(u, angle, range, color, dur) {
    const p = this._pPool.find(p => !p.on);
    if (!p) return;
    p.on = true; p.x = u.x; p.y = u.y; p.vx = angle; p.vy = range;
    p.life = p.maxLife = dur; p.color = color; p.size = 0; p.type = 'arc';
  }
  _telegraphRing(x, y, r, dur) { void x; void y; void r; void dur; }
  _updateParticles(dt) {
    for (const p of this._pPool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'spark') { p.vx *= .94; p.vy *= .94; }
    }
  }

  // ------------------------------------------------------------------ render
  render() {
    const ctx = this.ctx;
    const vw = this.cv.width = Math.floor(innerWidth * devicePixelRatio);
    const vh = this.cv.height = Math.floor(innerHeight * devicePixelRatio);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const W = vw / devicePixelRatio, H = vh / devicePixelRatio;
    const P = this.zone.def.palette;
    let sx = 0, sy = 0;
    if (this.cam.shake > 0) { sx = (Math.random() - .5) * this.cam.shake; sy = (Math.random() - .5) * this.cam.shake; }
    const camX = this.cam.x - W / 2 + sx, camY = this.cam.y - H / 2 + sy;
    this.mouse.wx = this.mouse.x + camX; this.mouse.wy = this.mouse.y + camY;

    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(-camX, -camY);

    drawGround(ctx, this.zone, { x: camX, y: camY }, W + 400, H + 400, this.quality);
    // ground drawn in screen space above; redo translate trick: we drew with cam param but coordinates absolute — acceptable since fill covers viewport.
    drawDecor(ctx, this.zone, this.time, this.quality);
    // fields
    for (const f of this.fields) {
      const k = f.t / f.dur;
      ctx.globalAlpha = .16 + Math.sin(f.t * 5) * .05;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = .5; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - (k % .5) * .2), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // portals
    for (const pt of this.zone.def.portals || []) {
      if (!pt.unlocked(this.save)) continue;
      const pulse = .7 + Math.sin(this.time * 3) * .3;
      glow(ctx, pt.x, pt.y, 60, P.glow, .35 * pulse);
      sigil(ctx, pt.x, pt.y, 16, P.glow, 2.4, .9);
      ctx.strokeStyle = P.glow; ctx.globalAlpha = .8; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 30, this.time, this.time + 4.4); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // obstacles
    for (const o of this.zone.obstacles) drawObstacle(ctx, o, this.zone);
    // POIs
    for (const poi of this.zone.def.pois || []) this._drawPOI(ctx, poi);
    // chests
    for (const c of this.chests) this._drawChest(ctx, c);
    // beacons/objects
    for (const o of this.objects) this._drawObject(ctx, o);
    // telegraphs
    for (const e of this.enemies) {
      if (e.windup > 0) {
        const k = 1 - e.windup / e.windupMax;
        ctx.strokeStyle = 'rgba(255,80,80,.8)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.telegraph?.x ?? e.x, e.telegraph?.y ?? e.y, (e.telegraph?.r ?? 46) * k, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,80,80,.10)';
        ctx.beginPath(); ctx.arc(e.telegraph?.x ?? e.x, e.telegraph?.y ?? e.y, e.telegraph?.r ?? 46, 0, TAU); ctx.fill();
      }
    }
    // pickups
    for (const p of this.pickups) {
      const bobY = Math.sin(this.time * 4 + p.x) * 3;
      if (p.kind === 'mote') {
        ctx.fillStyle = '#9fd8ff'; starPath(ctx, p.x, p.y + bobY, 5, 2); ctx.fill();
      } else {
        glow(ctx, p.x, p.y + bobY, 14, '#ffd76b', .8);
        ctx.fillStyle = '#ffd76b'; starPath(ctx, p.x, p.y + bobY, 6.5, 2.6); ctx.fill();
      }
    }
    // depth sort entities by y
    const ents = [
      ...this.enemies.map(e => ({ y: e.y, draw: () => this._drawEnemy(ctx, e) })),
      ...this.party.filter(u => u.hp > 0).map(u => ({ y: u.y, draw: () => this._drawUnit(ctx, u) })),
    ].sort((a, b) => a.y - b.y);
    for (const ent of ents) ent.draw();
    // projectiles
    for (const p of this.projectiles) {
      const yy = p.y - (p.z || 0);
      glow(ctx, p.x, yy, p.r * 2.4, p.color, .5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, yy, p.r, 0, TAU); ctx.fill();
    }
    // strikes incoming markers
    for (const s of this.strikes) {
      ctx.strokeStyle = s.color; ctx.globalAlpha = .5; ctx.lineWidth = 2;
      const kk = Math.max(0, Math.min(1, 1 - s.delay));
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, s.r * kk), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // particles
    for (const p of this._pPool) {
      if (!p.on) continue;
      const k = p.life / p.maxLife;
      ctx.globalAlpha = k;
      switch (p.type) {
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill(); break;
        case 'ring':
          ctx.strokeStyle = p.color; ctx.lineWidth = 3 * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - k), 0, TAU); ctx.stroke(); break;
        case 'bolt':
          ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          ctx.lineTo((p.x + p.tx) / 2 + (Math.random() - .5) * 20, (p.y + p.ty) / 2 + (Math.random() - .5) * 20);
          ctx.lineTo(p.tx, p.ty); ctx.stroke(); break;
        case 'arc': {
          ctx.strokeStyle = p.color; ctx.lineWidth = 5 * k;
          const actC = this.active ? CHAR_BY_ID[this.active.charId] : { basic: {} };
          const spread = actC.basic.spread || 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.vy, p.vx - spread / 2, p.vx + spread / 2); ctx.stroke(); break; }
      }
      ctx.globalAlpha = 1;
    }
    // floaters
    for (const f of this.floaters) {
      const k = 1 - f.t / f.dur;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `${f.big ? 700 : 600} ${f.big ? 20 : 14}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawVignette(ctx, W, H, P);
    // interaction prompt
    const it = this.nearestInteractable();
    if (it && this.state === 'explore') {
      let px2, py2, label = '';
      if (it.kind === 'loom') { label = 'Weave the Loom'; px2 = it.x; py2 = it.y; }
      else if (it.kind === 'npc' || it.kind === 'dummy' || it.kind === 'campfire') { label = it.label || ''; px2 = it.x; py2 = it.y; }
      else if (it.kind === 'chest') { label = 'Open Cache'; px2 = it.chest.x; py2 = it.chest.y; }
      else if (it.kind === 'portal') { label = `Travel: ${it.portal.label}`; px2 = it.portal.x; py2 = it.portal.y; }
      else if (it.kind === 'beacon') { label = this.beaconChannel ? 'Awakening…' : 'Awaken Pylon'; px2 = it.obj.x; py2 = it.obj.y; }
      if (label && !this.beaconChannel) {
        ctx.font = '600 13px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
        const px = px2, py = py2 - 52;
        ctx.fillStyle = 'rgba(10,8,28,.8)';
        ctx.fillRect(px - label.length * 4.4 - 22, py - 14, label.length * 8.8 + 36, 24);
        ctx.strokeStyle = 'rgba(255,215,107,.6)'; ctx.lineWidth = 1;
        ctx.strokeRect(px - label.length * 4.4 - 22, py - 14, label.length * 8.8 + 36, 24);
        ctx.fillStyle = '#ffe9ad';
        ctx.fillText(`[F] ${label}`, px, py + 3);
      }
    }
    // beacon channel bar
    if (this.beaconChannel) {
      const k = this.beaconChannel.t / 1.4;
      ctx.fillStyle = 'rgba(10,8,28,.7)'; ctx.fillRect(W / 2 - 110, H - 170, 220, 12);
      ctx.fillStyle = '#4fc3dd'; ctx.fillRect(W / 2 - 108, H - 168, 216 * k, 8);
    }
  }
  _drawUnit(ctx, u) {
    // status ring
    const isAct = u === this.active;
    ctx.strokeStyle = isAct ? 'rgba(255,215,107,.9)' : 'rgba(120,160,255,.5)';
    ctx.lineWidth = isAct ? 2.5 : 1.5;
    ctx.beginPath(); ctx.ellipse(u.x, u.y + 4, 15, 6, 0, 0, TAU); ctx.stroke();
    if (isAct) {
      ctx.setLineDash([4, 4]); ctx.lineDashOffset = -this.time * 14;
      ctx.strokeStyle = 'rgba(255,215,107,.5)';
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 4, 19, 8, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (u.iframes > 0) ctx.globalAlpha = .6;
    drawUnitSprite(ctx, CHAR_BY_ID[u.charId], u.x, u.y, {
      t: this.time, moving: u.moving, facing: u.facing,
      attacking: u.atkCd > CHAR_BY_ID[u.charId].basic.cd - .18,
      scale: 1.15,
    });
    ctx.globalAlpha = 1;
    // hp pip
    const w = 34, hpw = w * (u.hp / u.maxhp);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(u.x - w / 2, u.y - 38, w, 4);
    ctx.fillStyle = isAct ? '#7ce08a' : '#7aa8e8'; ctx.fillRect(u.x - w / 2, u.y - 38, hpw, 4);
    if (u.barrier > 0) {
      ctx.fillStyle = 'rgba(180,220,255,.8)';
      ctx.fillRect(u.x - w / 2, u.y - 43, w * Math.min(1, u.barrier / u.maxhp), 3);
    }
  }
  _drawEnemy(ctx, e) {
    drawEnemySprite(ctx, e.type, e.def, e.x, e.y, e.t, { hurtFlash: e.hurtFlash });
    if (!e.isBoss) {
      const w = e.type === 'hulk' ? 44 : 30;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - w / 2, e.y - e.def.r - 16, w, 4);
      ctx.fillStyle = '#e86a6a'; ctx.fillRect(e.x - w / 2, e.y - e.def.r - 16, w * Math.max(0, e.hp / e.maxhp), 4);
    }
    if (e.rootT > 0) { ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.def.r + 5, 0, TAU); ctx.stroke(); }
    if (e.hexT > 0) { ctx.fillStyle = 'rgba(232,168,76,.9)'; starPath(ctx, e.x - e.def.r, e.y - e.def.r - 20, 5, 2); ctx.fill(); }
  }
  _drawPOI(ctx, poi) {
    switch (poi.id) {
      case 'loom': {
        glow(ctx, poi.x, poi.y - 20, 90, '#ffd76b', .4);
        // loom frame
        ctx.strokeStyle = '#caa85a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(poi.x - 46, poi.y + 30); ctx.lineTo(poi.x - 40, poi.y - 66); ctx.quadraticCurveTo(poi.x, poi.y - 96, poi.x + 40, poi.y - 66); ctx.lineTo(poi.x + 46, poi.y + 30); ctx.stroke();
        // threads of light
        for (let i = 0; i < 7; i++) {
          const xx = poi.x - 33 + i * 11;
          ctx.strokeStyle = i % 2 ? 'rgba(255,215,107,.85)' : 'rgba(180,140,255,.8)';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(xx, poi.y - 62);
          ctx.quadraticCurveTo(xx + Math.sin(this.time * 2 + i) * 5, poi.y - 20, xx + Math.sin(this.time + i * 1.7) * 7, poi.y + 24);
          ctx.stroke();
        }
        sigil(ctx, poi.x, poi.y - 78, 10, '#ffe9ad', 2, 1);
        break; }
      case 'campfire': {
        glow(ctx, poi.x, poi.y - 8, 46, '#ffb35c', .5 + Math.sin(this.time * 7) * .1);
        ctx.strokeStyle = '#6a4a2f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(poi.x - 10, poi.y + 4); ctx.lineTo(poi.x + 10, poi.y - 4); ctx.moveTo(poi.x + 10, poi.y + 4); ctx.lineTo(poi.x - 10, poi.y - 4); ctx.stroke();
        ctx.fillStyle = '#ff9a4a';
        ctx.beginPath();
        ctx.moveTo(poi.x - 6, poi.y - 4);
        ctx.quadraticCurveTo(poi.x - 8 + Math.sin(this.time * 9) * 3, poi.y - 18, poi.x, poi.y - 26 + Math.sin(this.time * 5) * 3);
        ctx.quadraticCurveTo(poi.x + 8 + Math.cos(this.time * 8) * 3, poi.y - 18, poi.x + 6, poi.y - 4);
        ctx.closePath(); ctx.fill();
        break; }
      default:
        if (poi.kind === 'npc') this._drawNPC(ctx, poi);
        else if (poi.id === 'dummy') {
          ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(poi.x, poi.y + 16); ctx.lineTo(poi.x, poi.y - 26); ctx.stroke();
          ctx.fillStyle = '#c9a06a';
          ctx.beginPath(); ctx.arc(poi.x, poi.y - 34, 10, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#e8cf9a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(poi.x, poi.y - 34, 13, 0, TAU); ctx.stroke();
        }
    }
  }
  _drawNPC(ctx, poi) {
    const bob = Math.sin(this.time * 2 + poi.x) * 1.5;
    ctx.save(); ctx.translate(0, bob);
    drawUnitSprite(ctx, { art: NPC_SPRITE_ART[poi.npc] || NPC_SPRITE_ART.selene, element: 'Radiant' }, poi.x, poi.y, { t: this.time, scale: 1.1, facing: 1 });
    ctx.restore();
    // name tag
    ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,233,173,.9)';
    ctx.fillText(poi.label, poi.x, poi.y - 44);
    // chat indicator
    if (Math.sin(this.time * 3) > 0) {
      ctx.fillStyle = '#ffd76b';
      ctx.font = '700 14px "Segoe UI", sans-serif';
      ctx.fillText('!', poi.x + 12, poi.y - 48);
    }
  }
  _drawChest(ctx, c) {
    const bob = Math.sin(this.time * 3 + c.x) * 2;
    glow(ctx, c.x, c.y, 30, '#ffd76b', .3);
    ctx.fillStyle = '#5a4426';
    rounded(ctx, c.x - 14, c.y - 10 + bob, 28, 18, 4); ctx.fill();
    ctx.fillStyle = '#caa85a';
    rounded(ctx, c.x - 14, c.y - 16 + bob, 28, 9, 4); ctx.fill();
    ctx.fillStyle = '#ffe9ad';
    starPath(ctx, c.x, c.y - 4 + bob, 5, 2); ctx.fill();
  }
  _drawObject(ctx, o) {
    if (o.kind === 'beacon') {
      const lit = false;
      glow(ctx, o.x, o.y - 20, 40, lit ? '#4fc3dd' : '#3a5a68', .4);
      ctx.strokeStyle = '#3f6478'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(o.x, o.y + 12); ctx.lineTo(o.x, o.y - 40); ctx.stroke();
      ctx.fillStyle = lit ? '#4fc3dd' : '#26404c';
      ctx.beginPath(); ctx.arc(o.x, o.y - 46, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(79,195,221,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(o.x, o.y - 46, 13 + Math.sin(this.time * 3) * 2, 0, TAU); ctx.stroke();
    } else if (o.kind === 'anchor') {
      glow(ctx, o.x, o.y, 50, '#b48cff', .35);
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.sin(this.time) * .06);
      ctx.fillStyle = '#241a38';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 2.5;
      ctx.stroke();
      sigil(ctx, 0, 0, 8, '#b48cff', 2, .9);
      ctx.restore();
      const w = 44;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(o.x - w / 2, o.y - 40, w, 4);
      ctx.fillStyle = '#b48cff'; ctx.fillRect(o.x - w / 2, o.y - 40, w * Math.max(0, o.hp / o.maxhp), 4);
    }
  }
}

// sprite-only art for NPCs (subset of portrait params)
const NPC_SPRITE_ART = {
  selene: { skin: '#f6e8ea', hair: '#dfe3ee', hairStyle: 'long-flow', outfit: '#e8e2f4', outfit2: '#8f86c9', accessories: ['crescent-pin'], element: 'Radiant' },
  toma: { skin: '#d9a878', hair: '#5a4632', hairStyle: 'bob', outfit: '#7a5a3a', outfit2: '#4e3a26', accessories: ['badge'], element: 'Ember' },
  maro: { skin: '#eec39a', hair: '#c98a4e', hairStyle: 'side-tail', outfit: '#6a7a52', outfit2: '#49573a', accessories: ['wrench-pin'], element: 'Verdant' },
};

function starPath(ctx, x, y, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? R : r, a = -Math.PI / 2 + i * Math.PI / 4;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
