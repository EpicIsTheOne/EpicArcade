'use strict';
/* EMBERFALL run-01 :: boss — MALGORYN, THE CINDER SOVEREIGN  [isolated build in /emberfall] */

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = U.clamp(t, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

const BOSS_NAME = 'MALGORYN';
const BOSS_TITLE = 'the Cinder Sovereign';

class Boss {
  constructor() {
    const A = CFG.ARENA;
    this.x = A.x + A.w / 2; this.y = A.y + A.h * 0.34;
    this.r = CFG.BOSS.r;
    this.hpMax = CFG.BOSS.hpMax; this.hp = this.hpMax; this.ghostHp = this.hpMax;
    this.phase = 0;
    this.state = 'sleep'; // sleep | intro | active | transition | dying | dead
    this.atk = null; this.cd = 1.4; this.lastAtk = ''; this.pendingForce = '';
    this.vx = 0; this.vy = 0; this.bob = U.rand(TAU);
    this.hurtFlash = 0; this.eyeHeat = 0; this.crownA = 0; this.crownRot = 0;
    this.invuln = false; this.transT = 0; this.deathT = 0; this.hidden = false;
    this.orbitDir = 1; this.retargetT = 0; this.tx = this.x; this.ty = this.y;
    this.introT = 0; this.introAlpha = 0; this.holdT = 0;
  }

  vulnerable() { return this.state === 'active' && !this.invuln; }
  vulnerableOrCharging() { return this.state === 'active'; }
  get M() { return [1, 1.18, 1.42][this.phase]; }
  get TEL() { return [1, 0.86, 0.72][this.phase]; }
  baseCd() { return [1.35, 1.02, 0.78][this.phase]; }
  accent() { return ACCENT[this.phase]; }

  /* ---------- damage & phases ---------- */
  takeDamage(dmg, g) {
    if (!this.vulnerable()) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtFlash = 0.14; this.eyeHeat = 1;
    if (this.hp <= 0) { g.onBossDead(); return true; }
    const th = CFG.BOSS.thresholds;
    if (this.phase < th.length && this.hp <= this.hpMax * th[this.phase]) {
      this.enterPhase(this.phase + 1, g);
    }
    return true;
  }
  applyExternalHp(hp, g) { // test hook — routes through normal threshold logic
    if (!this.vulnerable()) return false;
    this.hp = Math.max(0, hp);
    const th = CFG.BOSS.thresholds;
    if (this.hp <= 0) { g.onBossDead(); return true; }
    if (this.phase < th.length && this.hp <= this.hpMax * th[this.phase]) this.enterPhase(this.phase + 1, g);
    return true;
  }
  enterPhase(p, g) {
    this.phase = p;
    this.state = 'transition'; this.transT = 2.3; this.invuln = true;
    this.atk = null; this.pendingForce = '';
    g.clearHazards(true);
    g.player.heal(30);
    FX.msg(p === 1 ? 'THE CROWN IGNITES' : 'SOVEREIGN\u2019S WRATH', p === 1 ? 'Phase II' : 'Final Phase — Phase III');
    AU.roar(); AU.setIntensity(Math.min(3, p + 1));
    FX.addShake(0.65); FX.stop(0.12); FX.flash('#ffd9a0', 0.22);
    FX.ring(this.x, this.y, this.accent(), 260, 0.8, 6);
    FX.ring(this.x, this.y, '#ffffff', 170, 0.55, 3);
    FX.burst(this.x, this.y, 60, { col: [ACCENT[p], '#ffd9a0'], spMin: 100, spMax: 420, lifeMax: 1.2, size: 5 });
    g.arenaPulse = 1;
  }

  beginIntro() { this.state = 'intro'; this.introT = 0; }
  startFight() { this.state = 'active'; this.invuln = false; this.cd = 1.5; }

  /* ---------- attack selection ---------- */
  pick(g) {
    const pools = {
      0: ['ring', 'beam', 'charge'],
      1: ['ring', 'beam', 'charge', 'meteors', 'blades'],
      2: ['ring', 'beam', 'charge', 'meteors', 'spiral'],
    };
    let pool = pools[this.phase].filter(a => a !== this.lastAtk || pools[this.phase].length === 1);
    if (this.pendingForce) { pool = [this.pendingForce]; }
    this.pendingForce = '';
    const name = U.pick(pool);
    this.lastAtk = name;
    this.atk = { name, t: 0, d: {} };
    AU.chargeUp(name === 'beam' ? 0.8 * this.TEL : 0.55 * this.TEL);
  }
  force(name) { // debug/test hook — interrupts softer states deterministically
    this.pendingForce = '';
    const busyCharge = this.atk && this.atk.name === 'charge' && this.atk.d.st === 'go';
    if (!busyCharge) { this.atk = null; }
    this.cd = 0;
    this.pendingForce = name;
  }

  /* ---------- per-frame ---------- */
  update(dt, g) {
    this.bob += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 5);
    this.eyeHeat = Math.max(0, this.eyeHeat - dt * 1.8);
    this.crownRot += dt * (1.1 + this.crownA * 7);
    this.ghostHp = U.damp(this.ghostHp, this.hp, 3.5, dt);
    const crownTgt = this.atk ? 1 : 0;
    this.crownA = U.damp(this.crownA, crownTgt, 6, dt);

    switch (this.state) {
      case 'transition': {
        this.transT -= dt;
        if (U.rand() < dt * 26) FX.spawn({ x: this.x + U.rand(-50, 50), y: this.y + U.rand(-30, 40), vy: U.rand(-140, -60), vx: U.rand(-30, 30), life: U.rand(.5, 1), size: U.rand(2, 4.5), col: this.accent(), dragK: 0.6 });
        if (this.transT <= 0) { this.state = 'active'; this.invuln = false; this.cd = this.phase === 2 ? 0.55 : 0.95; }
        break;
      }
      case 'active': {
        if (!this.atk) {
          this.drift(dt, g);
          this.cd -= dt;
          if (this.cd <= 0) this.pick(g);
        } else {
          this.atk.t += dt;
          const done = this['atk_' + this.atk.name](dt, g);
          if (done) { this.atk = null; this.cd = this.baseCd() * U.rand(0.85, 1.25); }
        }
        break;
      }
      case 'dying': this.deathT += dt; break;
    }
    // clamp inside arena (except during charge which manages itself)
    if (!(this.atk && this.atk.name === 'charge' && this.atk.d.st === 'go')) {
      const m = 56;
      this.x = U.clamp(this.x, CFG.ARENA.x + m, CFG.ARENA.x + CFG.ARENA.w - m);
      this.y = U.clamp(this.y, CFG.ARENA.y + m, CFG.ARENA.y + CFG.ARENA.h - m);
    }
  }

  drift(dt, g) {
    if (this.holdT > 0) { this.holdT -= dt; return; }
    this.retargetT -= dt;
    const p = g.player;
    if (this.retargetT <= 0 && !p.dead) {
      this.retargetT = U.rand(1.1, 2.0);
      if (U.rand() < 0.25) this.orbitDir *= -1;
      const a = U.angTo(p.x, p.y, this.x, this.y) + this.orbitDir * U.rand(0.5, 1.1);
      const R = U.rand(185, 265);
      this.tx = p.x + Math.cos(a) * R; this.ty = p.y + Math.sin(a) * R;
    }
    this.x = U.damp(this.x, this.tx, 1.5, dt);
    this.y = U.damp(this.y, this.ty, 1.5, dt);
  }

  /* ================= ATTACKS ================= */
  // Ember Ring — radial bullet waves after a wind-up
  atk_ring(dt, g) {
    const a = this.atk, d = a.d;
    const tele = 0.58 * this.TEL, gap = 0.52 / this.M;
    const waves = [2, 2, 3][this.phase];
    const count = [18, 22, 26][this.phase];
    const speed = (172 + this.phase * 24) * this.M;
    while ((d.emitted || 0) < waves && a.t >= tele + (d.emitted || 0) * gap) {
      const off = (d.emitted || 0) * (Math.PI / count) + U.rand(0.3);
      for (let i = 0; i < count; i++) {
        const ang = off + i / count * TAU;
        g.spawnBullet(this.x, this.y, Math.cos(ang) * speed, Math.sin(ang) * speed, { r: 8, dmg: 10, col: this.accent() });
      }
      d.emitted = (d.emitted || 0) + 1;
      AU.shoot(); FX.addShake(0.08);
      FX.ring(this.x, this.y, this.accent(), 90, 0.35, 2.5);
    }
    return a.t > tele + (waves - 1) * gap + 0.5;
  }

  // Cinder Beam — tracking telegraph, then sweeping beam
  atk_beam(dt, g) {
    const a = this.atk, d = a.d;
    const tele = 0.82 * this.TEL, dur = 1.5 / this.M, sweep = 2.3;
    const p = g.player;
    if (!d.locked) {
      d.trackAng = p.dead ? this.crownRot : U.angTo(this.x, this.y, p.x, p.y);
      if (a.t >= tele - 0.12) {
        d.locked = true;
        d.dir = U.rand() < 0.5 ? 1 : -1;
        d.a0 = d.trackAng - d.dir * sweep / 2;
        AU.beamFire();
      }
    }
    if (a.t > tele + dur + 0.25) return true;
    if (d.locked && !p.dead) {
      const tf = U.clamp((a.t - tele) / dur, 0, 1);
      const ang = d.a0 + d.dir * sweep * tf;
      d.beamAng = ang; d.beamOn = tf < 1;
      const ex = this.x + Math.cos(ang) * 1600, ey = this.y + Math.sin(ang) * 1600;
      if (segDist(p.x, p.y, this.x, this.y, ex, ey) < 13 + p.r) p.takeDamage(14, this.x, this.y, g);
      if (U.rand() < dt * 40) {
        const dd = U.rand(60, 700);
        FX.spawn({ x: this.x + Math.cos(ang) * dd, y: this.y + Math.sin(ang) * dd, shape: 'spark', vx: U.rand(-60, 60), vy: U.rand(-60, 60), life: 0.3, col: this.accent(), size: 3 });
      }
    }
    return a.t > tele + dur + 0.25;
  }

  // Ruinous Charge — telegraphed dash across the arena (double leg in P2+)
  atk_charge(dt, g) {
    const a = this.atk, d = a.d, p = g.player, A = CFG.ARENA;
    const legs = this.phase >= 1 ? 2 : 1;
    if (!d.st) { d.st = 'tele'; d.t = 0; d.leg = 0; AU.chargeUp(0.55 * this.TEL); }
    d.t += dt;
    if (d.st === 'tele') {
      const tele = 0.55 * this.TEL;
      // Always resolve an aim: if the player dies mid-telegraph, charge toward
      // the arena center. Leaving d.dir undefined used to NaN-poison this.x/this.y
      // in the 'go' leg (Math.cos(undefined)) and crash createRadialGradient in render.
      const ax = p.dead ? A.x + A.w / 2 : p.x;
      const ay = p.dead ? A.y + A.h / 2 : p.y;
      d.dir = U.angTo(this.x, this.y, ax, ay);
      {
        let lo = 0, hi = 1600;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2;
          const x = this.x + Math.cos(d.dir) * mid, y = this.y + Math.sin(d.dir) * mid;
          if (x < A.x + 26 || x > A.x + A.w - 26 || y < A.y + 26 || y > A.y + A.h - 26) hi = mid; else lo = mid;
        }
        d.destX = this.x + Math.cos(d.dir) * lo; d.destY = this.y + Math.sin(d.dir) * lo;
        d.dist = lo;
      }
      if (d.t >= tele) { d.st = 'go'; d.t = 0; d.traveled = 0; }
    } else if (d.st === 'go') {
      const sp = 1280 * this.M;
      const step = sp * dt;
      this.x += Math.cos(d.dir) * step; this.y += Math.sin(d.dir) * step;
      if (U.rand() < dt * 70) FX.spawn({ x: this.x + U.rand(-24, 24), y: this.y + U.rand(-24, 24), vx: -Math.cos(d.dir) * 90, vy: -Math.sin(d.dir) * 90, life: 0.5, size: U.rand(2.5, 5), col: this.accent(), dragK: 1.5 });
      if (!p.dead && U.dist(this.x, this.y, p.x, p.y) < this.r + p.r + 4) p.takeDamage(18, this.x, this.y, g);
      d.traveled += step;
      if (d.traveled >= (d.dist || 600)) {
        d.traveled = 0;
        FX.addShake(0.5); AU.boom(0.75);
        FX.ring(this.x, this.y, this.accent(), 130, 0.5, 5);
        FX.burst(this.x, this.y, 26, { col: [this.accent(), '#ffd9a0'], spMin: 90, spMax: 340, lifeMax: 0.7, size: 4 });
        FX.scorch(this.x, this.y, 46);
        d.leg++;
        if (d.leg >= legs) return true;
        d.st = 'tele'; d.t = 0;
      }
    }
    return false;
  }

  // Skyfall Cinders — telegraphed ground impacts
  atk_meteors(dt, g) {
    const a = this.atk, d = a.d, p = g.player, A = CFG.ARENA;
    if (!d.mts) {
      const n = [5, 7, 9][this.phase];
      d.mts = [];
      for (let i = 0; i < n; i++) {
        let x = A.x + A.w / 2, y = A.y + A.h / 2, ok = false, tries = 0;
        while (!ok && tries++ < 24) {
          if (i === 0 && !p.dead) { x = p.x + U.rand(-70, 70); y = p.y + U.rand(-70, 70); }
          else { x = U.rand(A.x + 60, A.x + A.w - 60); y = U.rand(A.y + 60, A.y + A.h - 60); }
          ok = d.mts.every(m => U.dist(x, y, m.x, m.y) > 96);
        }
        d.mts.push({ x: U.clamp(x, A.x + 46, A.x + A.w - 46), y: U.clamp(y, A.y + 46, A.y + A.h - 46), stagger: i * 0.14, done: false, whistled: false });
      }
      d.total = (n - 1) * 0.14 + 0.88 * this.TEL;
    }
    for (const m of d.mts) {
      const impactAt = m.stagger + 0.88 * this.TEL;
      if (!m.whistled && a.t > impactAt - 0.17) { m.whistled = true; AU.whistle(); }
      if (!m.done && a.t >= impactAt) {
        m.done = true;
        AU.boom(0.5); FX.addShake(0.2);
        FX.ring(m.x, m.y, '#ffb066', 84, 0.42, 3.5);
        FX.scorch(m.x, m.y, 44);
        FX.burst(m.x, m.y, 20, { col: ['#ffb066', '#ff6b3d', '#ffe9bd'], ang: -Math.PI / 2, spread: 1.1, spMin: 80, spMax: 330, lifeMax: 0.8, size: 4, grav: 300 });
        if (!p.dead && U.dist(p.x, p.y, m.x, m.y) < 62 + p.r) p.takeDamage(16, m.x, m.y, g);
      }
    }
    return a.t > d.total + 0.4;
  }

  // Crown of Blades — orbiting swords launched one by one (world objects)
  atk_blades(dt, g) {
    const a = this.atk, d = a.d;
    if (!d.spawned) {
      d.spawned = true;
      for (let i = 0; i < 3; i++) {
        g.blades.push({ mode: 'orbit', angOff: i / 3 * TAU, delay: 1.15 + i * 0.48, age: 0, x: 0, y: 0, ang: 0, spd: 560 * this.M, dmg: 14 });
      }
    }
    return a.t > 1.15 + 2 * 0.48 + 0.6;
  }

  // Spiral of the Sovereign — rotating twin streams (P3 only)
  atk_spiral(dt, g) {
    const a = this.atk, d = a.d;
    const dur = 2.7 / this.M;
    if (d.a === undefined) { d.a = U.rand(TAU); d.emit = 0; }
    const p = g.player;
    if (!p.dead) {
      const pa = U.angTo(p.x, p.y, this.x, this.y) + Math.PI / 2;
      this.x += Math.cos(pa) * Math.sin(a.t * 2.4) * 74 * dt;
      this.y += Math.sin(pa) * Math.sin(a.t * 2.4) * 74 * dt;
    }
    while (d.emit < a.t / 0.075 && a.t < dur) {
      const speed = 205 * this.M;
      g.spawnBullet(this.x, this.y, Math.cos(d.a) * speed, Math.sin(d.a) * speed, { r: 7, dmg: 9, col: ACCENT[2] });
      g.spawnBullet(this.x, this.y, Math.cos(d.a + Math.PI) * speed, Math.sin(d.a + Math.PI) * speed, { r: 7, dmg: 9, col: ACCENT[2] });
      d.a += 0.385; d.emit++;
      if (d.emit % 6 === 0) AU.shoot();
    }
    return a.t > dur + 0.25;
  }

  /* ================= RENDER ================= */
  drawGround(ctx, g) {
    const a = this.atk;
    if (!a || this.state !== 'active') return;
    const d = a.d;
    if (a.name === 'ring') {
      const tele = 0.58 * this.TEL;
      if (a.t < tele) {
        const k = a.t / tele, bl = 0.55 + 0.45 * Math.sin(a.t * 22);
        ctx.strokeStyle = `rgba(255,90,60,${0.75 * k})`; ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(this.x, this.y, 30 + k * 110, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        Glow.draw(ctx, '#ff5030', this.x, this.y, 90, 0.28 * bl * k);
      }
    } else if (a.name === 'charge') {
      if (d.st === 'tele' && d.dir !== undefined) {
        const k = Math.min(1, d.t / (0.55 * this.TEL));
        ctx.save();
        ctx.globalAlpha = 0.65 * k;
        ctx.strokeStyle = '#ff5040'; ctx.lineWidth = 4; ctx.setLineDash([16, 12]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(d.dir) * (d.dist || 400), this.y + Math.sin(d.dir) * (d.dist || 400));
        ctx.stroke();
        ctx.setLineDash([]);
        if (d.destX !== undefined) {
          ctx.beginPath(); ctx.arc(d.destX, d.destY, 30 + 8 * Math.sin(d.t * 18), 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (a.name === 'meteors') {
      if (d.mts) for (const m of d.mts) {
        if (m.done) continue;
        const impactAt = m.stagger + 0.88 * this.TEL;
        if (a.t < m.stagger) continue;
        const k = U.clamp((a.t - m.stagger) / (impactAt - m.stagger), 0, 1);
        const R = 62;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ffb054'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(m.x, m.y, R, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,110,50,.28)';
        ctx.beginPath(); ctx.arc(m.x, m.y, R * k, 0, TAU); ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const aa = i * Math.PI / 2 + Math.PI / 4;
          ctx.moveTo(m.x + Math.cos(aa) * (R + 4), m.y + Math.sin(aa) * (R + 4));
          ctx.lineTo(m.x + Math.cos(aa) * (R + 13), m.y + Math.sin(aa) * (R + 13));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (k > 0.82) {
          const fy = m.y - (1 - (k - 0.82) / 0.18) * 520;
          ctx.strokeStyle = 'rgba(255,200,120,.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(m.x + 14, fy - 90); ctx.lineTo(m.x, fy); ctx.stroke();
          Glow.draw(ctx, '#ffc86e', m.x, fy, 22, 0.8);
        }
      }
    } else if (a.name === 'beam') {
      const tele = 0.82 * this.TEL;
      if (a.t < tele && d.trackAng !== undefined) {
        const bl = 0.4 + 0.6 * Math.abs(Math.sin(a.t * 16));
        ctx.save();
        ctx.globalAlpha = bl;
        ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2.5;
        ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(d.trackAng) * 1600, this.y + Math.sin(d.trackAng) * 1600);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  render(ctx, g) {
    if (this.hidden || this.state === 'dead') return;
    let alpha = 1;
    if (this.state === 'intro') alpha = this.introAlpha;
    if (this.state === 'dying') alpha = Math.max(0, 1 - this.deathT / 1.6);
    if (alpha <= 0) return;
    const acc = this.accent();
    const bobY = Math.sin(this.bob * 1.7) * 6;
    const bx = this.x, by = this.y + bobY;

    ctx.save();
    ctx.globalAlpha = alpha;

    // shadow
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + this.r + 16, this.r * 1.25, this.r * 0.4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;

    // outer aura
    const pul = 0.8 + 0.2 * Math.sin(this.bob * 3.1);
    Glow.draw(ctx, acc, bx, by, this.r * (3.1 + this.crownA * 0.5), (0.22 + this.hurtFlash * 2) * pul * alpha);

    // cape — swaying tattered polygon
    ctx.save();
    ctx.translate(bx, by);
    const sway = Math.sin(this.bob * 2.3) * 0.09;
    ctx.rotate(sway);
    ctx.fillStyle = '#200f1c';
    ctx.strokeStyle = 'rgba(255,110,60,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-this.r * 0.85, -this.r * 0.5);
    ctx.quadraticCurveTo(-this.r * 1.7, this.r * 0.4 + Math.sin(this.bob * 3) * 7, -this.r * 1.15, this.r * 1.55 + Math.sin(this.bob * 4) * 5);
    ctx.lineTo(-this.r * 0.5, this.r * 1.1);
    ctx.lineTo(0, this.r * 1.6 + Math.cos(this.bob * 3.4) * 6);
    ctx.lineTo(this.r * 0.5, this.r * 1.1);
    ctx.lineTo(this.r * 1.15, this.r * 1.55 + Math.sin(this.bob * 4.4) * 5);
    ctx.quadraticCurveTo(this.r * 1.7, this.r * 0.4 + Math.cos(this.bob * 3) * 7, this.r * 0.85, -this.r * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // body core
    const grd = ctx.createRadialGradient(bx - 8, by - 12, 4, bx, by, this.r);
    grd.addColorStop(0, '#3d2030');
    grd.addColorStop(0.55, '#241019');
    grd.addColorStop(0.92, acc);
    grd.addColorStop(1, '#fff');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(bx, by, this.r, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = acc; ctx.stroke();

    // hurt flash
    if (this.hurtFlash > 0) {
      ctx.globalAlpha = alpha * this.hurtFlash * 5.2;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx, by, this.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // eyes — angry slits, hotter with phase/hits
    const heat = U.clamp(0.45 + this.phase * 0.22 + this.eyeHeat * 0.6, 0, 1.4);
    const eyeCol = this.phase === 2 ? '#e6c8ff' : '#ffe9b0';
    ctx.save();
    ctx.translate(bx, by);
    const px2 = g.player ? U.angTo(bx, by, g.player.x, g.player.y) : 0;
    ctx.rotate(U.clamp(U.angDiff(-Math.PI / 2, px2), -0.5, 0.5) * 0.5);
    for (const s of [-1, 1]) {
      Glow.draw(ctx, eyeCol, s * 15, -10, 15, 0.75 * heat * alpha);
      ctx.fillStyle = eyeCol;
      ctx.beginPath();
      ctx.moveTo(s * 7, -14); ctx.lineTo(s * 23, -8 + (s > 0 ? -4 : 4)); ctx.lineTo(s * 21, -3); ctx.lineTo(s * 9, -6);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // orbiting hand-wisps
    for (const s of [-1, 1]) {
      const wa = this.crownRot * 1.4 + s * Math.PI;
      const wx = bx + Math.cos(wa) * 64, wy = by + Math.sin(wa) * 40 - 6;
      Glow.draw(ctx, acc, wx, wy, 16, 0.5 * alpha);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath(); ctx.arc(wx, wy, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = alpha;
    }

    // crown shards
    const cr = U.lerp(76, 54, this.crownA);
    for (let i = 0; i < 5; i++) {
      const wa = this.crownRot + i / 5 * TAU;
      const sx = bx + Math.cos(wa) * cr, sy = by + Math.sin(wa) * cr * 0.72 - 8;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(wa + Math.PI / 2 + this.crownA * 2.2);
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(5.5, 4); ctx.lineTo(0, 11); ctx.lineTo(-5.5, 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      Glow.draw(ctx, acc, sx, sy, 17, (0.4 + this.crownA * 0.4) * alpha);
    }

    // active beam
    const a = this.atk;
    if (a && a.name === 'beam' && a.d.beamOn && a.d.locked) {
      const ang2 = a.d.beamAng;
      const ex2 = bx + Math.cos(ang2) * 1600, ey2 = by + Math.sin(ang2) * 1600;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = acc; ctx.globalAlpha = alpha * 0.4; ctx.lineWidth = 38;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex2, ey2); ctx.stroke();
      ctx.strokeStyle = '#ffb090'; ctx.globalAlpha = alpha * 0.75; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex2, ey2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.globalAlpha = alpha; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex2, ey2); ctx.stroke();
      ctx.restore();
      Glow.draw(ctx, acc, bx, by, 70, 0.6);
    }

    // transition state flourish
    if (this.state === 'transition') {
      const k = 1 - this.transT / 2.3;
      ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.abs(Math.sin(this.transT * 13)));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(bx, by, this.r + 14 + k * 26, 0, TAU); ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    ctx.restore();
  }
}
