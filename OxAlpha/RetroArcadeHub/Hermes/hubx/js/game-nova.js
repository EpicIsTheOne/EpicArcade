/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — NOVA STRIKE (vertical shooter) */
(() => {
  const U = ARC.util;

  class NovaStrike extends ARC.BaseGame {
    onReset() {
      this.time = 0;
      this.wave = 1;
      this.player = { x: this.W / 2, y: this.H - 80, r: 11, cool: 0, inv: 0, shield: false, twinT: 0, rapidT: 0 };
      this.bullets = []; this.ebullets = []; this.enemies = []; this.pows = [];
      this.spawnT = .8;
      if (!this.stars) {
        this.stars = ARC.fx.stars(90, this.W, this.H);
        this.starScroll = 0;
      }
    }

    onStart() { this.say('WAVE 1'); }

    // ---------- spawning ----------
    spawnEnemy() {
      const t = this.time;
      const roll = Math.random();
      const x = U.rand(34, this.W - 34);
      if (t > 28 && roll < .16) {
        this.enemies.push({ kind: 'tank', x, y: -26, r: 19, hp: 3, vy: U.rand(38, 52), fireT: 1.4, t: U.rand(0, 9) });
      } else if (t > 14 && roll < .42) {
        this.enemies.push({ kind: 'diver', x, y: -20, r: 10, hp: 1, vx: 0, vy: U.rand(190, 240) + t * 1.5, lockedX: this.player.x, t: 0 });
      } else if (roll < .74) {
        this.enemies.push({ kind: 'grunt', x, y: -18, r: 12, hp: 1, baseX: x, vy: U.rand(64, 92) + t * 1.2, fireT: U.rand(1, 2.4), t: U.rand(0, 9) });
      } else {
        this.enemies.push({ kind: 'rock', x, y: -24, r: U.rand(13, 20), hp: 2, rot: U.rand(0, 9), vr: U.rand(-2, 2), vy: U.rand(80, 130) + t, vx: U.rand(-24, 24) });
      }
    }

    spawnPow(x, y, forceType) {
      const type = forceType || U.pick(['T', 'T', 'R', 'R', 'S']);
      this.pows.push({ type, x, y, vy: 95, t: 0 });
    }

    // ---------- update ----------
    update(dt) {
      const P = this.player;
      this.time += dt;
      this.starScroll += dt * (60 + this.wave * 8);

      // wave progression
      const w = 1 + Math.floor(this.time / 22);
      if (w !== this.wave) { this.wave = w; this.say('WAVE ' + w); ARC.audio.sfx.levelup(); this.addScore(100); }

      // --- player movement ---
      const ax = ARC.input.axis();
      const spd = 280;
      P.x = U.clamp(P.x + ax.x * spd * dt, 20, this.W - 20);
      P.y = U.clamp(P.y + ax.y * spd * .72 * dt, this.H * .42, this.H - 44);
      if (P.inv > 0) P.inv -= dt;
      if (P.twinT > 0) P.twinT -= dt;
      if (P.rapidT > 0) P.rapidT -= dt;

      // --- shooting ---
      P.cool -= dt;
      if (ARC.input.fire() && P.cool <= 0) {
        P.cool = P.rapidT > 0 ? .085 : .16;
        const mk = (dx, spreadVx = 0) => this.bullets.push({ x: P.x + dx, y: P.y - 14, vx: spreadVx, vy: -540 });
        if (P.twinT > 0) { mk(-7); mk(7); } else mk(0);
        ARC.audio.sfx.shoot();
        this.parts.spawn({ x: P.x, y: P.y - 16, vx: 0, vy: -40, life: .08, size: 6, color: '#aef4ff' });
      }

      // --- player bullets ---
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < -12) this.bullets.splice(i, 1);
      }

      // --- spawns ---
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = U.clamp(1.05 - this.time * .01, .34, 1.05) * U.rand(.75, 1.25);
        this.spawnEnemy();
        if (this.wave > 3 && Math.random() < .22) this.spawnEnemy();
      }

      // --- enemies ---
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.y += e.vy * dt;
        e.t += dt;
        let dead = e.y > this.H + 40 || e.x < -60 || e.x > this.W + 60;

        if (e.kind === 'grunt') {
          e.x = e.baseX + Math.sin(e.t * 2.2) * 46;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.y > 30 && e.y < this.H * .62) {
            e.fireT = U.rand(1.8, 3);
            const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
            const s = 165 + this.time * 1.4;
            this.ebullets.push({ x: e.x, y: e.y + 8, vx: dx / d * s, vy: dy / d * s });
          }
        } else if (e.kind === 'diver') {
          e.x += (e.lockedX - e.x) * Math.min(1, dt * 2.2);
        } else if (e.kind === 'tank') {
          e.x += Math.sin(e.t * 1.1) * 26 * dt;
          e.fireT -= dt;
          if (e.fireT <= 0 && e.y > 20) {
            e.fireT = 2.5;
            const n = this.wave > 5 ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = Math.PI / 2 + (k - (n - 1) / 2) * .45;
              this.ebullets.push({ x: e.x, y: e.y + 10, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 });
            }
            ARC.audio.sfx.zap();
          }
        } else if (e.kind === 'rock') {
          e.rot += e.vr * dt;
          e.x += e.vx * dt;
        }

        // bullet hits
        for (let j = this.bullets.length - 1; j >= 0; j--) {
          const b = this.bullets[j];
          if (U.dist2(b.x, b.y, e.x, e.y) < (e.r + 4) * (e.r + 4)) {
            this.bullets.splice(j, 1);
            e.hp--;
            ARC.audio.sfx.hit();
            this.parts.burst(b.x, b.y, 3, '#aef4ff', { spd: 70, life: .3, size: 3 });
            if (e.hp <= 0) {
              dead = true;
              const val = { grunt: 50, diver: 80, tank: 150, rock: 30 }[e.kind];
              this.addScore(val);
              this.floats.add('+' + val, e.x, e.y, '#ffd23e', { size: 11 });
              this.boom(e.x, e.y, e.kind === 'tank' || e.kind === 'rock');
              if ((e.kind === 'tank' && Math.random() < .65) || (e.kind === 'diver' && Math.random() < .18)) this.spawnPow(e.x, e.y);
            }
            break;
          }
        }
        if (dead) this.enemies.splice(i, 1);
      }

      // --- enemy bullets / player collision ---
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y > this.H + 14 || b.x < -14 || b.x > this.W + 14) { this.ebullets.splice(i, 1); continue; }
        if (U.dist2(b.x, b.y, P.x, P.y) < (P.r + 3) * (P.r + 3)) {
          this.ebullets.splice(i, 1);
          this.hurt();
        }
      }

      // --- enemies crash into player ---
      for (const e of this.enemies) {
        if (!e.dead && U.dist2(e.x, e.y, P.x, P.y) < (P.r + e.r - 4) * (P.r + e.r - 4)) {
          e.dead = true; this.boom(e.x, e.y, true);
          this.hurt();
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);

      // --- powerups ---
      for (let i = this.pows.length - 1; i >= 0; i--) {
        const p = this.pows[i];
        p.t += dt; p.y += p.vy * dt;
        if (p.y > this.H + 16) { this.pows.splice(i, 1); continue; }
        if (U.dist2(p.x, p.y, P.x, P.y) < 22 * 22) {
          this.pows.splice(i, 1);
          this.addScore(10);
          if (p.type === 'T') { P.twinT = 10; this.say('TWIN CANNON', '#28e0ff'); }
          if (p.type === 'R') { P.rapidT = 8; this.say('RAPID FIRE', '#b6ff5c'); }
          if (p.type === 'S') { P.shield = true; this.say('SHIELD UP', '#ffe86b'); }
          ARC.audio.sfx.power();
        }
      }

      this.parts.update(0); this.floats.update(0); // (kept here no-op; base ticks them)
    }

    boom(x, y, big) {
      this.parts.burst(x, y, big ? 26 : 14, '#ff9d3e', { spd: big ? 220 : 160, life: .7, size: 4 });
      this.parts.burst(x, y, 8, '#fff', { spd: 120, life: .35, size: 3 });
      this.shake.kick(big ? 9 : 4);
      ARC.audio.sfx.boom(big);
    }

    hurt(force) {
      const P = this.player;
      if (!force && P.inv > 0) return;
      if (P.shield && !force) {
        P.shield = false; P.inv = 1.2;
        this.say('SHIELD DOWN', '#ffe86b');
        this.parts.burst(P.x, P.y, 16, '#ffe86b', { spd: 180, life: .5 });
        ARC.audio.sfx.hit();
        this.shake.kick(5);
        return;
      }
      this.lives--;
      this.boom(P.x, P.y, true);
      this.floats.clear();
      if (this.lives <= 0) { this.endRun(); return; }
      P.inv = 2.2; P.twinT = 0; P.rapidT = 0;
      P.x = this.W / 2; P.y = this.H - 80;
    }

    debug(action) {
      if (action === 'hurt') this.hurt(true);
      if (action === 'score') { this.addScore(500); }
    }

    // ---------- draw ----------
    draw(ctx) {
      // space bg
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#05051a'); g.addColorStop(.55, '#0b0724'); g.addColorStop(1, '#140a33');
      ctx.fillStyle = g; ctx.fillRect(-12, -12, this.W + 24, this.H + 24);

      // stars
      for (const s of this.stars) {
        s.y += (26 + s.z * 110) * (1 / 60);
        if (s.y > this.H) { s.y = -2; s.x = U.rand(0, this.W); }
        ctx.globalAlpha = .3 + s.z * .7;
        ctx.fillStyle = s.z > .8 ? '#cfe8ff' : '#5f6fae';
        ctx.fillRect(s.x, s.y, s.z > .8 ? 2 : 1, s.z > .8 ? 3 : 2);
      }
      ctx.globalAlpha = 1;

      // powerups
      for (const p of this.pows) {
        const col = { T: '#28e0ff', R: '#b6ff5c', S: '#ffe86b' }[p.type];
        const bob = Math.sin(p.t * 6) * 2;
        U.glowStroke(ctx, col, 2, c => { c.rect(p.x - 8, p.y - 8 + bob, 16, 16); });
        ctx.fillStyle = col; ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'center'; ctx.fillText(p.type, p.x, p.y + 4 + bob); ctx.textAlign = 'left';
      }

      // enemies
      for (const e of this.enemies) this.drawEnemy(ctx, e);

      // bullets
      ctx.fillStyle = '#9df6ff';
      for (const b of this.bullets) ctx.fillRect(b.x - 2, b.y - 7, 4, 10);
      ctx.fillStyle = '#ff5ea8';
      for (const b of this.ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, U.TAU); ctx.fill(); }

      // player
      const P = this.player;
      if (this.state !== 'over' && !(P.inv > 0 && Math.floor(P.inv * 12) % 2 === 0)) this.drawShip(ctx, P);

      // hud extras: lives + weapon timers
      ctx.textAlign = 'right';
      let hx = this.W - 10;
      for (let i = 0; i < this.lives; i++) {
        ctx.fillStyle = '#28e0ff';
        ctx.beginPath();
        ctx.moveTo(hx, 10); ctx.lineTo(hx - 7, 24); ctx.lineTo(hx + 7, 24); ctx.closePath(); ctx.fill();
        hx -= 17;
      }
      ctx.font = '10px Consolas, monospace'; ctx.fillStyle = '#8a90b8';
      let ty = 48;
      if (P.twinT > 0) { ctx.fillStyle = '#28e0ff'; ctx.textAlign = 'right'; ctx.fillText('TWIN ' + P.twinT.toFixed(0), this.W - 8, ty); ty += 13; }
      if (P.rapidT > 0) { ctx.fillStyle = '#b6ff5c'; ctx.textAlign = 'right'; ctx.fillText('RAPID ' + P.rapidT.toFixed(0), this.W - 8, ty); ty += 13; }
      if (P.shield) { ctx.fillStyle = '#ffe86b'; ctx.textAlign = 'right'; ctx.fillText('SHIELD', this.W - 8, ty); }
      ctx.textAlign = 'left';
    }

    drawShip(ctx, P) {
      const flame = 8 + Math.random() * 8;
      ctx.save();
      ctx.translate(P.x, P.y);
      // engine flame
      ctx.fillStyle = Math.random() < .5 ? '#ff9d3e' : '#ffd23e';
      ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(0, 12 + flame); ctx.lineTo(4, 12); ctx.closePath(); ctx.fill();
      // hull
      U.glowStroke(ctx, '#28e0ff', 2, c => {
        c.moveTo(0, -14); c.lineTo(9, 8); c.lineTo(4, 12); c.lineTo(-4, 12); c.lineTo(-9, 8); c.closePath();
      });
      ctx.fillStyle = '#0af';
      ctx.fillRect(-2, -6, 4, 10);
      if (P.shield) {
        ctx.strokeStyle = 'rgba(255,232,107,.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(performance.now() / 120) * 1.5, 0, U.TAU); ctx.stroke();
      }
      ctx.restore();
    }

    drawEnemy(ctx, e) {
      ctx.save(); ctx.translate(e.x, e.y);
      if (e.kind === 'grunt') {
        U.glowStroke(ctx, '#ff2e88', 2, c => {
          c.moveTo(-12, -4); c.lineTo(-4, -8); c.lineTo(0, -2); c.lineTo(4, -8); c.lineTo(12, -4);
          c.lineTo(8, 8); c.lineTo(0, 5); c.lineTo(-8, 8); c.closePath();
        });
        ctx.fillStyle = '#ff2e88'; ctx.fillRect(-2, -2, 4, 4);
      } else if (e.kind === 'diver') {
        ctx.rotate(Math.atan2(this.player.y - e.y, this.player.x - e.x) + Math.PI / 2);
        U.glowStroke(ctx, '#ff9d3e', 2, c => {
          c.moveTo(0, 12); c.lineTo(-8, -8); c.lineTo(0, -3); c.lineTo(8, -8); c.closePath();
        });
      } else if (e.kind === 'tank') {
        U.glowStroke(ctx, '#b06cff', 2, c => {
          for (let k = 0; k < 6; k++) { const a = k / 6 * U.TAU + Math.PI / 6; const px = Math.cos(a) * 19, py = Math.sin(a) * 19; k ? c.lineTo(px, py) : c.moveTo(px, py); }
          c.closePath();
        });
        ctx.fillStyle = '#b06cff';
        ctx.beginPath(); ctx.arc(0, 0, 6 + Math.sin(e.t * 5) * 1.5, 0, U.TAU); ctx.fill();
        for (let k = 0; k < e.hp; k++) ctx.fillRect(-8 + k * 7, 24, 5, 3);
      } else { // rock
        ctx.rotate(e.rot);
        U.glowStroke(ctx, '#8f96c9', 2, c => {
          for (let k = 0; k < 7; k++) {
            const a = k / 7 * U.TAU, rr = e.r * (.75 + ((k * 37) % 10) / 30);
            k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          c.closePath();
        });
      }
      ctx.restore();
    }

    // cabinet attract-mode art
    promo(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05051a'); g.addColorStop(1, '#140a33');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const y = (i * 53 + t * 30) % h;
        ctx.fillStyle = i % 4 ? '#5f6fae' : '#cfe8ff';
        ctx.fillRect((i * 97) % w, y, 1, 2);
      }
      // enemies
      ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const ex = w / 2 + Math.sin(t + i * 2) * (w * .3), ey = h * .2 + i * 22;
        ctx.beginPath();
        ctx.moveTo(ex - 8, ey - 3); ctx.lineTo(ex - 3, ey - 6); ctx.lineTo(ex, ey - 2); ctx.lineTo(ex + 3, ey - 6); ctx.lineTo(ex + 8, ey - 3);
        ctx.lineTo(ex + 5, ey + 6); ctx.lineTo(ex, ey + 4); ctx.lineTo(ex - 5, ey + 6); ctx.closePath(); ctx.stroke();
      }
      // hero ship
      ctx.strokeStyle = '#28e0ff'; ctx.lineWidth = 2;
      const px = w / 2 + Math.sin(t * .8) * 10, py = h * .78;
      ctx.beginPath();
      ctx.moveTo(px, py - 12); ctx.lineTo(px + 9, py + 8); ctx.lineTo(px, py + 4); ctx.lineTo(px - 9, py + 8); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#9df6ff';
      ctx.fillRect(px - 1, py - 20 - ((t * 90) % (h * .4)), 2, 6);
    }
  }

  ARC.games = ARC.games || [];
  ARC.games.push({
    id: 'nova',
    name: 'NOVA STRIKE',
    tagline: 'Deep-space interceptor · survive the swarm',
    color: '#28e0ff',
    gm1: '#123a6e', gm2: '#0a1030', gmGlow: 'rgba(40,224,255,.8)',
    controls: ['ARROWS / WASD — MOVE', 'SPACE / Z — FIRE (HOLD OK)', 'COLLECT T·R·S PODS'],
    help: 'Fly your interceptor through endless waves. Grunts zig-zag and snipe, divers lock on, tanks take 3 hits and drop pods. T=twin cannon, R=rapid fire, S=shield. Wave up every ~22s for bonus points.',
    cls: NovaStrike,
  });
})();
