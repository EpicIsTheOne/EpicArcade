/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — HYPER DODGE (phosphor wireframe dodger) */
(() => {
  const U = ARC.util;

  class HyperDodge extends ARC.BaseGame {
    onReset() {
      this.time = 0;
      this.tier = 1;
      this.combo = 0;
      this.comboT = 0;
      this.player = { x: this.W / 2, y: this.H - 110, r: 10, dashT: 0, dashCd: 0, inv: 0 };
      this.rocks = []; this.drones = []; this.cells = [];
      this.spawnT = .5; this.droneT = 12; this.cellT = 2;
      this.gridScroll = 0;
      if (!this.stars) this.stars = ARC.fx.stars(40, this.W, this.H);
    }

    get fallSpeed() { return U.clamp(150 + this.time * 3.4, 150, 420); }

    onStart() { this.say('SURVIVE'); }

    update(dt) {
      const P = this.player;
      this.time += dt;
      this.addScore(dt * 10);

      // velocity tiers
      const tier = 1 + Math.floor(this.time / 30);
      if (tier !== this.tier) {
        this.tier = tier;
        this.say('VELOCITY ' + tier * 20 + '%', '#e4ffa0');
        ARC.audio.sfx.levelup();
      }
      this.gridScroll += this.fallSpeed * dt * .6;

      // --- movement ---
      const ax = ARC.input.axis();
      let spd = 300;
      P.dashCd -= dt; P.dashT -= dt; P.inv -= dt;
      if ((ARC.input.dash() || ARC.input.pressed('KeyX')) && P.dashCd <= 0) {
        P.dashT = .18; P.dashCd = 1.5; P.inv = Math.max(P.inv, .38);
        ARC.audio.sfx.zap();
      }
      if (P.dashT > 0) {
        spd = 660;
        this.parts.spawn({ x: P.x, y: P.y, vx: -ax.x * 60, vy: 0, life: .25, size: 8, color: '#b6ff9c', shape: 'circle' });
      }
      P.x = U.clamp(P.x + ax.x * spd * dt, 16, this.W - 16);
      P.y = U.clamp(P.y + ax.y * spd * .55 * dt, this.H * .45, this.H - 34);

      // --- spawns ---
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = U.clamp(U.rand(.55, 1.0) - this.time * .004, .22, 1);
        const r = U.rand(11, 24);
        this.rocks.push({
          x: U.rand(r, this.W - r), y: -r - 10, r,
          vy: this.fallSpeed * U.rand(.75, 1.25), vx: U.rand(-40, 40),
          rot: U.rand(0, 9), vr: U.rand(-2.4, 2.4), seed: U.irand(0, 999), py: 0,
        });
      }
      this.droneT -= dt;
      if (this.droneT <= 0 && this.time > 18) {
        this.droneT = U.clamp(U.rand(5, 9) - this.tier * .3, 2.6, 9);
        this.drones.push({ x: U.rand(24, this.W - 24), y: -14, r: 9, vy: this.fallSpeed * .95, t: 0 });
      }
      this.cellT -= dt;
      if (this.cellT <= 0) {
        this.cellT = U.rand(2.4, 4.5);
        this.cells.push({ x: U.rand(24, this.W - 24), y: -10, vy: this.fallSpeed * .8, t: 0 });
      }

      // --- rocks ---
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const k = this.rocks[i];
        k.py = k.y;
        k.y += k.vy * dt; k.x += k.vx * dt; k.rot += k.vr * dt;
        if (k.x < k.r || k.x > this.W - k.r) k.vx *= -1;
        if (k.y > this.H + k.r + 10) { this.rocks.splice(i, 1); continue; }

        // near miss?
        if (k.py < P.y && k.y >= P.y && !k.nm) {
          const d = Math.abs(k.x - P.x);
          if (d < k.r + 30 && d > k.r + P.r - 4) {
            k.nm = true;
            this.combo++; this.comboT = 2.4;
            const b = 5 * this.combo;
            this.addScore(b);
            this.floats.add('NEAR MISS +' + b, P.x, P.y - 26, '#e4ffa0', { size: 10 });
            ARC.audio.sfx.nearmiss();
          }
        }

        if (P.inv <= 0 && U.dist2(k.x, k.y, P.x, P.y) < (k.r * .82 + P.r) * (k.r * .82 + P.r)) {
          this.die(); return;
        }
      }

      // --- drones ---
      for (let i = this.drones.length - 1; i >= 0; i--) {
        const d = this.drones[i];
        d.t += dt;
        d.x += (P.x - d.x) * Math.min(1, dt * .55);
        d.x = U.clamp(d.x, 12, this.W - 12);
        d.y += d.vy * dt;
        if (d.y > this.H + 20) { this.drones.splice(i, 1); continue; }
        this.parts.spawn({ x: d.x + U.rand(-3, 3), y: d.y - 10, vx: 0, vy: -30, life: .3, size: 3, color: '#ff7b3e' });
        if (P.inv <= 0 && U.dist2(d.x, d.y, P.x, P.y) < (d.r + P.r) * (d.r + P.r)) {
          this.die(); return;
        }
      }

      // --- cells ---
      for (let i = this.cells.length - 1; i >= 0; i--) {
        const c = this.cells[i];
        c.t += dt; c.y += c.vy * dt;
        if (c.y > this.H + 12) { this.cells.splice(i, 1); continue; }
        if (U.dist2(c.x, c.y, P.x, P.y) < 20 * 20) {
          this.cells.splice(i, 1);
          this.addScore(25);
          this.floats.add('+25', c.x, c.y, '#8bdb4a', { size: 12 });
          ARC.audio.sfx.pick();
          this.parts.burst(c.x, c.y, 6, '#8bdb4a', { spd: 90, life: .4, size: 3 });
        }
      }

      // combo decay
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    die() {
      const P = this.player;
      this.parts.burst(P.x, P.y, 34, '#8bdb4a', { spd: 260, life: .9, size: 4 });
      this.parts.burst(P.x, P.y, 12, '#fff', { spd: 160, life: .5, size: 3 });
      this.shake.kick(12);
      ARC.audio.sfx.crash();
      this.endRun();
    }

    debug(action) {
      // deterministically force a hit by materializing a rock on the player
      if (action === 'hurt') {
        const P = this.player;
        this.rocks.push({ x: P.x, y: P.y, r: 16, vx: 0, vy: 0, rot: 0, vr: 0, seed: 7, py: P.y });
        P.inv = 0;
      }
      if (action === 'score') this.addScore(500);
    }

    draw(ctx) {
      // bg
      ctx.fillStyle = '#041007';
      ctx.fillRect(-12, -12, this.W + 24, this.H + 24);

      // faint stars
      for (const s of this.stars) {
        s.y += this.fallSpeed * s.z / 60;
        if (s.y > this.H) { s.y = -2; s.x = U.rand(0, this.W); }
        ctx.globalAlpha = .25 + s.z * .4;
        ctx.fillStyle = '#4f7f42';
        ctx.fillRect(s.x, s.y, 1, 2);
      }
      ctx.globalAlpha = 1;

      // scrolling grid floor
      const gap = 44;
      ctx.strokeStyle = 'rgba(139,219,74,.16)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = (this.gridScroll % gap) - gap; y < this.H; y += gap) { ctx.moveTo(0, y); ctx.lineTo(this.W, y); }
      for (let x = 0; x <= this.W; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, this.H); }
      ctx.stroke();

      // side rails
      ctx.strokeStyle = 'rgba(139,219,74,.5)';
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.gridScroll % 18;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6, this.H); ctx.moveTo(this.W - 6, 0); ctx.lineTo(this.W - 6, this.H); ctx.stroke();
      ctx.setLineDash([]);

      // cells
      for (const c of this.cells) {
        const p = 1 + Math.sin(c.t * 7) * .18;
        U.glowStroke(ctx, '#8bdb4a', 2, k => {
          k.moveTo(c.x, c.y - 7 * p); k.lineTo(c.x + 7 * p, c.y); k.lineTo(c.x, c.y + 7 * p); k.lineTo(c.x - 7 * p, c.y); k.closePath();
        });
      }

      // rocks (wireframe)
      for (const k of this.rocks) {
        ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.rot);
        U.glowStroke(ctx, '#8bdb4a', 1.6, c => {
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * U.TAU;
            const rr = k.r * (.72 + (((i * 53 + k.seed) % 13) / 13) * .45);
            i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          c.closePath();
        });
        ctx.restore();
      }

      // drones
      for (const d of this.drones) {
        ctx.save(); ctx.translate(d.x, d.y);
        U.glowStroke(ctx, '#ff7b3e', 1.8, c => {
          c.moveTo(0, -d.r); c.lineTo(d.r, 0); c.lineTo(0, d.r); c.lineTo(-d.r, 0); c.closePath();
        });
        ctx.fillStyle = '#ff7b3e';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }

      // player
      const P = this.player;
      if (this.state !== 'over') {
        const blinkOut = P.inv > 0 && P.dashT <= 0 && Math.floor(P.inv * 14) % 2 === 0;
        if (!blinkOut) {
          U.glowStroke(ctx, P.dashT > 0 ? '#e4ffa0' : '#8bdb4a', 2, c => {
            c.moveTo(P.x, P.y - 11); c.lineTo(P.x + 11, P.y); c.lineTo(P.x, P.y + 11); c.lineTo(P.x - 11, P.y); c.closePath();
          });
          ctx.fillStyle = '#d8f0c8';
          ctx.beginPath(); ctx.arc(P.x, P.y, 3, 0, U.TAU); ctx.fill();
          // dash cooldown arc
          if (P.dashCd > 0) {
            ctx.strokeStyle = 'rgba(139,219,74,.45)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(P.x, P.y, 16, -Math.PI / 2, -Math.PI / 2 + (1 - P.dashCd / 1.5) * U.TAU); ctx.stroke();
          } else {
            ctx.strokeStyle = 'rgba(228,255,160,.7)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(P.x, P.y, 15 + Math.sin(performance.now() / 200), 0, U.TAU); ctx.stroke();
          }
        }
      }

      // hud extras
      ctx.textAlign = 'right'; ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = '#8bdb4a';
      ctx.fillText('VEL ' + Math.round(this.fallSpeed), this.W - 10, 52);
      if (this.combo > 1) {
        ctx.fillStyle = '#e4ffa0'; ctx.font = 'bold 14px Consolas, monospace';
        ctx.fillText('×' + this.combo + ' NEAR', this.W - 10, 70);
      }
      ctx.textAlign = 'left';
    }

    promo(ctx, w, h, t) {
      ctx.fillStyle = '#041007'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(139,219,74,.25)'; ctx.lineWidth = 1;
      for (let y = (t * 40 % 20); y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = 0; i < 4; i++) {
        const rx = ((i * 61 + t * 26) % (w + 20)) - 10, ry = (i * 47 + t * 55) % h;
        ctx.strokeStyle = '#8bdb4a';
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * U.TAU, rr = 6 + (i * 37 + k * 13) % 5;
          const px = rx + Math.cos(a) * rr, py = ry + Math.sin(a) * rr;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
      const px = w / 2 + Math.sin(t * 1.4) * (w * .32), py = h * .78;
      ctx.strokeStyle = '#e4ffa0'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py - 9); ctx.lineTo(px + 9, py); ctx.lineTo(px, py + 9); ctx.lineTo(px - 9, py); ctx.closePath(); ctx.stroke();
    }
  }

  ARC.games = ARC.games || [];
  ARC.games.push({
    id: 'dodge',
    name: 'HYPER DODGE',
    tagline: 'Phosphor protocol · thread the debris',
    color: '#8bdb4a',
    gm1: '#1c4a20', gm2: '#0a180c', gmGlow: 'rgba(139,219,74,.8)',
    controls: ['ARROWS / WASD — MOVE', 'SHIFT / X — PHASE DASH', 'GRAZE ROCKS FOR COMBO BONUS'],
    help: 'One hit ends the run. Fall speed keeps climbing — VELOCITY tiers every 30s. Graze past rocks without touching them for stacking NEAR MISS bonuses, grab green cells (+25), phase-dash through tight spots.',
    cls: HyperDodge,
  });
})();
