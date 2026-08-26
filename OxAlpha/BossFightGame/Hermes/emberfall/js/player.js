'use strict';
/* EMBERFALL run-01 :: player — the Ashblade  [isolated build in /emberfall] */
class Player {
  constructor() {
    const A = CFG.ARENA;
    this.x = A.x + A.w / 2; this.y = A.y + A.h * 0.72;
    this.vx = 0; this.vy = 0;
    this.r = CFG.PLAYER.r;
    this.hp = CFG.PLAYER.maxHp;
    this.face = -Math.PI / 2;
    this.dashT = 0; this.dashCd = 0; this.dashAng = 0;
    this.iT = 0;                 // invulnerability timer
    this.atkCdT = 0; this.comboStep = 0; this.comboResetT = 0;
    this.slash = null;           // {ang,t,dur,range,arc,dmg,hit}
    this.trail = [];
    this.dead = false; this.deadT = 0;
    this.hurtFlash = 0; this.touchCd = 0;
    this.bob = U.rand(TAU);
  }

  get dashing() { return this.dashT > 0; }

  update(dt, g) {
    this.bob += dt * 5.4;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);
    this.touchCd -= dt; this.iT -= dt; this.dashCd -= dt; this.atkCdT -= dt;
    this.comboResetT -= dt; if (this.comboResetT <= 0) this.comboStep = 0;
    if (this.dead) { this.deadT += dt; return; }
    const P = CFG.PLAYER;

    // aim (mouse), fall back to facing
    let aim = this.face;
    if (g.boss && !g.boss.hidden) aim = U.angTo(this.x, this.y, Input.mx, Input.my);

    // dash
    if ((Input.pressed('Space', 'ShiftLeft', 'ShiftRight')) && this.dashCd <= 0) {
      const axv = Input.axis();
      this.dashAng = (axv.x || axv.y) ? Math.atan2(axv.y, axv.x) : aim;
      this.dashT = P.dashDur; this.dashCd = P.dashCd;
      this.iT = Math.max(this.iT, P.dashDur + 0.07);
      g.stats.dashes++;
      AU.dash();
      FX.burst(this.x, this.y, 10, { col: ['#8fd8ff', '#cfeaff'], spMin: 30, spMax: 130, lifeMax: 0.45, size: 3 });
    }

    // movement
    if (this.dashing) {
      this.dashT -= dt;
      const sp = P.dashSpeed * (0.55 + 0.45 * (this.dashT / P.dashDur));
      this.vx = Math.cos(this.dashAng) * sp; this.vy = Math.sin(this.dashAng) * sp;
      this.trail.push({ x: this.x, y: this.y, a: 1, ang: this.dashAng });
    } else {
      const axv = Input.axis();
      this.vx = U.damp(this.vx, axv.x * P.speed, P.accel, dt);
      this.vy = U.damp(this.vy, axv.y * P.speed, P.accel, dt);
    }
    this.x = U.clamp(this.x + this.vx * dt, CFG.ARENA.x + this.r, CFG.ARENA.x + CFG.ARENA.w - this.r);
    this.y = U.clamp(this.y + this.vy * dt, CFG.ARENA.y + this.r, CFG.ARENA.y + CFG.ARENA.h - this.r);

    // trail decay
    for (let i = this.trail.length - 1; i >= 0; i--) { this.trail[i].a -= dt * 4.5; if (this.trail[i].a <= 0) this.trail.splice(i, 1); }
    if (this.trail.length > 12) this.trail.splice(0, this.trail.length - 12);

    // attack
    if (Input.pressed('KeyJ') || Input.mPressed) this.trySlash(g, null);
    if (this.slash) {
      this.slash.t += dt;
      // hit check during active window
      if (!this.slash.hit && this.slash.t > 0.02 && g.boss && !g.boss.hidden && g.boss.vulnerable()) {
        const b = g.boss;
        const d = U.dist(this.x, this.y, b.x, b.y);
        if (d < this.slash.range + b.r && Math.abs(U.angDiff(this.slash.ang, U.angTo(this.x, this.y, b.x, b.y))) < this.slash.arc / 2) {
          this.slash.hit = true;
          const dmg = this.slash.dmg;
          const dealt = b.takeDamage(dmg, g);
          const hx = this.x + Math.cos(this.slash.ang) * (d - b.r * 0.4);
          const hy = this.y + Math.sin(this.slash.ang) * (d - b.r * 0.4);
          if (dealt) {
            g.stats.hits++;
            AU.hit(this.slash.dmg >= 12);
            FX.stop(this.slash.dmg >= 12 ? 0.07 : 0.04);
            FX.addShake(this.slash.dmg >= 12 ? 0.24 : 0.13);
            FX.float(String(dmg), hx, hy - 14, this.slash.dmg >= 12 ? '#ffd257' : '#ffe9c9', this.slash.dmg >= 12 ? 22 : 16);
            FX.burst(hx, hy, this.slash.dmg >= 12 ? 16 : 9, { col: [ACCENT[b.phase], '#ffd9a0', '#fff'], spMin: 80, spMax: 300, shape: 'spark', lifeMax: 0.4, size: 3.4 });
          } else {
            FX.float('IMMUNE', hx, hy - 14, '#8d8698', 13);
            FX.burst(hx, hy, 4, { col: '#777', spMin: 40, spMax: 120, lifeMax: 0.3, size: 2 });
          }
        }
      }
      if (this.slash.t >= this.slash.dur) this.slash = null;
    }

    // face follows movement, eases toward aim when standing
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 30 && !this.slash) this.face = U.angLerp(this.face, Math.atan2(this.vy, this.vx), 1 - Math.exp(-14 * dt));
    else if (!this.slash) this.face = U.angLerp(this.face, aim, 1 - Math.exp(-8 * dt));
  }

  trySlash(g, forceAng) {
    if (this.dead) return;
    if (!forceAng && (this.atkCdT > 0 || this.slash)) return;
    const step = forceAng !== null && forceAng !== undefined ? 2 : this.comboStep;
    const dmg = CFG.PLAYER.atkDmg[step];
    const dur = step === 2 ? 0.26 : 0.18;
    let ang = forceAng;
    if (ang === null || ang === undefined) ang = U.angTo(this.x, this.y, Input.mx, Input.my);
    this.slash = { ang, t: 0, dur, range: CFG.PLAYER.atkRange, arc: CFG.PLAYER.atkArc, dmg, hit: false };
    this.atkCdT = forceAng != null ? 0.05 : CFG.PLAYER.atkCd[step];
    this.comboStep = (step + 1) % 3;
    this.comboResetT = 1.0;
    if (!this.dashing) { // small lunge
      this.vx += Math.cos(ang) * CFG.PLAYER.lunge;
      this.vy += Math.sin(ang) * CFG.PLAYER.lunge;
    }
    AU.swing();
  }

  takeDamage(n, sx, sy, g, opts = {}) {
    if (this.dead) return false;
    if (this.iT > 0 && !opts.pierce) return false;
    this.hp = Math.max(0, this.hp - n);
    this.iT = opts.pierce ? this.iT : 0.95;
    this.hurtFlash = 0.4;
    g.stats.dmgTaken += n;
    const a = U.angTo(sx, sy, this.x, this.y);
    this.vx += Math.cos(a) * 260; this.vy += Math.sin(a) * 260;
    FX.addShake(0.42); FX.flash('#ff2020', 0.20); FX.stop(0.05);
    FX.float('-' + n, this.x, this.y - 26, '#ff6b6b', 19);
    FX.burst(this.x, this.y, 14, { col: ['#ff5050', '#ffb0a0'], spMin: 60, spMax: 240, shape: 'spark', lifeMax: 0.5, size: 3 });
    AU.hurt();
    if (this.hp <= 0) this.die(g);
    return true;
  }

  die(g) {
    this.dead = true; this.deadT = 0;
    FX.addShake(0.7); FX.flash('#ffffff', 0.35);
    FX.burst(this.x, this.y, 46, { col: ['#9fb6d8', '#5f7898', '#e8f2ff'], spMin: 60, spMax: 320, lifeMax: 1.3, size: 4, grav: 160 });
    AU.boom(0.7);
    g.onPlayerDead();
  }
  heal(n) { this.hp = Math.min(CFG.PLAYER.maxHp, this.hp + n); FX.float('+' + n, this.x, this.y - 30, '#7dff9e', 19); }

  render(ctx, g) {
    if (this.dead && this.deadT > 0.4) return;
    const blink = this.iT > 0 && !this.dashing && (Math.floor(performance.now() / 90) % 2 === 0);

    // shadow
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + this.r + 4, this.r * 1.15, this.r * 0.45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    // dash afterimages
    for (const t of this.trail) {
      ctx.globalAlpha = t.a * 0.28;
      ctx.fillStyle = '#7fc4ef';
      ctx.beginPath(); ctx.arc(t.x, t.y, this.r * 0.85, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (blink) return;

    const bobY = Math.sin(this.bob) * 1.6;
    const px = this.x, py = this.y + bobY;
    const f = this.face;

    // cloak (teardrop opposite of facing)
    ctx.save();
    ctx.translate(px, py); ctx.rotate(f);
    ctx.fillStyle = '#33507a';
    ctx.strokeStyle = '#6f95c9'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.r * 0.2, -this.r * 0.75);
    ctx.quadraticCurveTo(-this.r * 1.9, -this.r * 0.9, -this.r * 2.15, 0);
    ctx.quadraticCurveTo(-this.r * 1.9, this.r * 0.9, this.r * 0.2, this.r * 0.75);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // body
    ctx.fillStyle = this.hurtFlash > 0 ? '#ffb0a8' : '#dfe9f4';
    ctx.beginPath(); ctx.arc(px, py, this.r, 0, TAU); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#8fa8c8'; ctx.stroke();

    // visor slit
    ctx.save();
    ctx.translate(px, py); ctx.rotate(f);
    ctx.fillStyle = '#39d8ff';
    ctx.fillRect(this.r * 0.15, -3.4, this.r * 0.72, 6.8);
    ctx.restore();

    // idle sword
    if (!this.slash) {
      ctx.save();
      ctx.translate(px, py); ctx.rotate(f + 0.85);
      ctx.strokeStyle = '#cfd8e6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.r * 0.7, 0); ctx.lineTo(this.r * 1.75, 0); ctx.stroke();
      ctx.strokeStyle = '#e8b54f'; ctx.lineWidth = 4.4;
      ctx.beginPath(); ctx.moveTo(this.r * 0.62, 0); ctx.lineTo(this.r * 0.82, 0); ctx.stroke();
      ctx.restore();
    }

    // slash wedge
    if (this.slash) {
      const s = this.slash;
      const k = s.t / s.dur;
      const a0 = s.ang - s.arc / 2 + s.arc * k * 1.06 - s.arc * 0.03;
      const sweep = s.arc * 0.62;
      const grad = ctx.createRadialGradient(px, py, s.range * 0.3, px, py, s.range);
      const hot = s.dmg >= 12;
      grad.addColorStop(0, 'rgba(255,240,200,0)');
      grad.addColorStop(0.65, hot ? 'rgba(255,205,110,' + (0.5 * (1 - k)) + ')' : 'rgba(230,240,255,' + (0.44 * (1 - k)) + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, s.range, a0, a0 + sweep);
      ctx.closePath(); ctx.fill();
      // leading edge line
      ctx.strokeStyle = hot ? 'rgba(255,220,140,' + (0.9 * (1 - k)) + ')' : 'rgba(255,255,255,' + (0.85 * (1 - k)) + ')';
      ctx.lineWidth = 3.4 * (1 - k) + 0.6;
      ctx.beginPath();
      ctx.arc(px, py, s.range * 0.94, a0 + sweep * 0.72, a0 + sweep);
      ctx.stroke();
    }

    // hurt overlay ring
    if (this.hurtFlash > 0) {
      Glow.draw(ctx, '#ff4848', px, py, this.r * 2.6, this.hurtFlash);
    }
  }
}
