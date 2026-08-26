/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — BRICKSMASH (sunset brick-breaker) */
(() => {
  const U = ARC.util;
  const COLS = 10, GX = 16, GY = 74, GAP = 4;

  // pattern matrices: 1 = normal, 2 = silver(2hp)
  const PATTERNS = [
    { name: 'SUNSET WALL', rows: 6, gen: () => Array.from({ length: 6 }, () => Array(COLS).fill(1)) },
    { name: 'CHECKERBOARD', rows: 8, gen() {
        return Array.from({ length: 8 }, (_, r) => Array.from({ length: COLS }, (_, c) => ((r + c) % 2 === 0 ? 1 : 0)));
      } },
    { name: 'PYRAMID', rows: 8, gen() {
        return Array.from({ length: 8 }, (_, r) => Array.from({ length: COLS }, (_, c) =>
          Math.abs(c - (COLS - 1) / 2) <= r / 1.3 ? (r < 2 ? 2 : 1) : 0));
      } },
    { name: 'NEON STRIPES', rows: 7, gen() {
        return Array.from({ length: 7 }, (_, r) => Array.from({ length: COLS }, (_, c) =>
          c % 2 === 0 ? (r % 3 === 0 ? 2 : 1) : 0));
      } },
    { name: 'THE FORTRESS', rows: 7, gen() {
        const m = Array.from({ length: 7 }, () => Array(COLS).fill(0));
        for (let c = 0; c < COLS; c++) { m[0][c] = c % 2 ? 2 : 1; m[6][c] = 1; }
        for (let r = 1; r < 6; r++) { m[r][0] = 1; m[r][COLS - 1] = 1; }
        m[3][4] = 2; m[3][5] = 2;
        return m;
      } },
    { name: 'ASTEROID FIELD', rows: 7, gen() {
        return Array.from({ length: 7 }, (_, r) => Array.from({ length: COLS }, () =>
          Math.random() < .72 ? (Math.random() < .18 ? 2 : 1) : 0));
      } },
  ];

  class Bricksmash extends ARC.BaseGame {
    onReset() {
      this.level = 1;
      this.lives = 3;
      this.expandT = 0; this.slowT = 0;
      this.combo = 0;
      this.balls = []; this.pows = [];
      this.paddle = { x: this.W / 2, w: 86 };
      this.buildLevel();
      this.serve();
    }

    buildLevel() {
      const pat = PATTERNS[(this.level - 1) % PATTERNS.length];
      const m = pat.gen();
      const bw = (this.W - GX * 2 - GAP * (COLS - 1)) / COLS, bh = 20;
      this.bricks = [];
      for (let r = 0; r < pat.rows; r++)
        for (let c = 0; c < COLS; c++) {
          const v = m[r][c];
          if (!v) continue;
          this.bricks.push({
            x: GX + c * (bw + GAP), y: GY + r * (bh + GAP), w: bw, h: bh,
            hp: v === 2 ? 2 : 1, silver: v === 2,
            row: r, flash: 0,
            val: (pat.rows - r) * 10 * (v === 2 ? 2 : 1),
          });
        }
      this.patName = pat.name;
    }

    get ballSpeed() { return U.clamp(300 + this.level * 24, 300, 560) * (this.slowT > 0 ? .65 : 1); }

    serve() {
      this.balls = [{ x: this.W / 2, y: this.H - 66, r: 6, vx: 0, vy: 0, stuck: true, trail: [] }];
    }

    onStart() { this.say(this.patName, '#ffb04a'); }

    update(dt) {
      const pd = this.paddle;
      this.expandT -= dt; this.slowT -= dt;
      pd.w += ((this.expandT > 0 ? 122 : 86) - pd.w) * Math.min(1, dt * 8);
      const ax = ARC.input.axis();
      pd.x += ax.x * 430 * dt;
      pd.x = U.clamp(pd.x, pd.w / 2 + 6, this.W - pd.w / 2 - 6);

      // --- launch ---
      if (ARC.input.anyPressed('Space') || ARC.input.fire()) {
        for (const b of this.balls) if (b.stuck) {
          b.stuck = false;
          const a = U.rand(-.35, .35);
          b.vx = Math.sin(a) * this.ballSpeed; b.vy = -Math.cos(a) * this.ballSpeed;
          ARC.audio.sfx.uiOk();
        }
      }

      // --- balls ---
      const spd = this.ballSpeed;
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        if (b.stuck) { b.x = pd.x; b.y = this.H - 60; continue; }

        // normalize speed drift
        const cur = Math.hypot(b.vx, b.vy) || 1;
        b.vx *= spd / cur; b.vy *= spd / cur;

        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 7) b.trail.shift();

        b.x += b.vx * dt; b.y += b.vy * dt;

        // walls
        if (b.x < 8 + b.r) { b.x = 8 + b.r; b.vx = Math.abs(b.vx); ARC.audio.sfx.bounce(.8); }
        if (b.x > this.W - 8 - b.r) { b.x = this.W - 8 - b.r; b.vx = -Math.abs(b.vx); ARC.audio.sfx.bounce(.8); }
        if (b.y < 42 + b.r) { b.y = 42 + b.r; b.vy = Math.abs(b.vy); ARC.audio.sfx.bounce(.9); }

        // paddle
        const py = this.H - 46;
        if (b.vy > 0 && b.y + b.r >= py && b.y - b.r < py + 14 &&
            b.x > pd.x - pd.w / 2 - b.r && b.x < pd.x + pd.w / 2 + b.r) {
          const off = U.clamp((b.x - pd.x) / (pd.w / 2), -1, 1);
          const ang = off * 1.05; // max ~60°
          b.vx = Math.sin(ang) * spd;
          b.vy = -Math.abs(Math.cos(ang) * spd);
          b.y = py - b.r - .5;
          this.combo = 0;
          ARC.audio.sfx.bounce(1);
          this.parts.burst(b.x, py, 4, '#ffb04a', { spd: 70, life: .25, size: 2 });
        }

        // fell out
        if (b.y > this.H + 14) { this.balls.splice(i, 1); continue; }

        // bricks
        for (let k = this.bricks.length - 1; k >= 0; k--) {
          const br = this.bricks[k];
          if (!U.circleRect(b.x, b.y, b.r, br.x, br.y, br.w, br.h)) continue;

          // resolve by smaller penetration
          const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
          const penX = br.w / 2 + b.r - Math.abs(b.x - cx);
          const penY = br.h / 2 + b.r - Math.abs(b.y - cy);
          if (penX < penY) { b.vx = b.x < cx ? -Math.abs(b.vx) : Math.abs(b.vx); b.x += b.x < cx ? -penX : penX; }
          else { b.vy = b.y < cy ? -Math.abs(b.vy) : Math.abs(b.vy); b.y += b.y < cy ? -penY : penY; }

          br.hp--; br.flash = .12;
          this.combo++;
          const pitch = 1 + Math.min(12, this.combo) * .09;
          ARC.audio.sfx.bounce(pitch);

          if (br.hp <= 0) {
            this.bricks.splice(k, 1);
            this.addScore(br.val);
            const col = this.rowColor(br.row, br.silver);
            this.parts.burst(cx, cy, 7, col, { spd: 130, life: .5, size: 4 });
            if (U.chance(.13)) this.dropPow(cx, cy);
          } else {
            this.addScore(5);
            this.parts.burst(cx, cy, 3, '#cfd8ff', { spd: 80, life: .3, size: 3 });
          }
          break;
        }
      }

      // all balls gone?
      if (this.balls.length === 0 && this.state === 'playing') {
        this.lives--;
        if (this.lives <= 0) { this.endRun(); return; }
        ARC.audio.sfx.hit(); this.shake.kick(6);
        this.expandT = 0; this.slowT = 0; this.combo = 0;
        this.serve();
      }

      // --- powerups ---
      for (let i = this.pows.length - 1; i >= 0; i--) {
        const p = this.pows[i];
        p.t += dt; p.y += 105 * dt;
        if (p.y > this.H + 16) { this.pows.splice(i, 1); continue; }
        const py = this.H - 46;
        if (p.y + 8 >= py && p.y - 8 < py + 16 && Math.abs(p.x - pd.x) < pd.w / 2 + 8) {
          this.pows.splice(i, 1);
          this.applyPow(p.type);
        }
      }

      // brick flash decay
      for (const br of this.bricks) if (br.flash > 0) br.flash -= dt;

      // level clear?
      if (this.state === 'playing' && this.bricks.length === 0) {
        const bonus = 500 + this.level * 150;
        this.addScore(bonus);
        this.say('LEVEL CLEAR +' + bonus, '#ffe86b');
        ARC.audio.sfx.levelup();
        this.level++;
        this.buildLevel();
        this.serve();
        this.parts.clear();
      }
    }

    dropPow(x, y) {
      const roll = Math.random();
      const type = roll < .38 ? 'E' : roll < .68 ? 'M' : roll < .96 ? 'S' : '+';
      this.pows.push({ type, x, y, t: 0 });
    }

    applyPow(type) {
      if (type === 'E') { this.expandT = 12; this.floats.add('WIDE!', this.paddle.x, this.H - 70, '#28e0ff'); }
      if (type === 'M') {
        const src = this.balls[0];
        if (src && !src.stuck) {
          for (let i = 0; i < 2; i++) {
            const a = Math.atan2(src.vy, src.vx) + (i ? .6 : -.6);
            this.balls.push({ x: src.x, y: src.y, r: 6, vx: Math.cos(a) * 1e-6, vy: Math.sin(a) * 1e-6, stuck: false, trail: [] });
          }
        } else this.expandT = Math.max(this.expandT, 8);
        this.floats.add('MULTIBALL!', this.W / 2, this.H - 90, '#ff2e88', { size: 13 });
      }
      if (type === 'S') { this.slowT = 8; this.floats.add('SLOW-MO', this.paddle.x, this.H - 70, '#b06cff'); }
      if (type === '+') { this.lives++; this.floats.add('+1 LIFE', this.paddle.x, this.H - 70, '#ffe86b'); }
      ARC.audio.sfx.power();
    }

    debug(action) {
      if (action === 'hurt') { this.balls.forEach(b => { b.y = this.H + 40; }); this.balls = []; }
      if (action === 'score') this.addScore(500);
    }

    rowColor(row, silver) {
      if (silver) return '#aab4d8';
      const cols = ['#ff3d6e', '#ff5e3a', '#ff7b3e', '#ff9d3e', '#ffb04a', '#ffd23e', '#ffe86b', '#fff3a6'];
      return cols[Math.min(cols.length - 1, row)];
    }

    draw(ctx) {
      // sunset backdrop
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#17091f'); g.addColorStop(.6, '#26102c'); g.addColorStop(1, '#3a1430');
      ctx.fillStyle = g; ctx.fillRect(-12, -12, this.W + 24, this.H + 24);
      // low sun
      const sy = this.H - 118;
      const sg = ctx.createRadialGradient(this.W / 2, sy, 8, this.W / 2, sy, 190);
      sg.addColorStop(0, 'rgba(255,157,62,.34)'); sg.addColorStop(1, 'rgba(255,157,62,0)');
      ctx.fillStyle = sg; ctx.fillRect(this.W / 2 - 200, sy - 200, 400, 400);
      ctx.strokeStyle = 'rgba(255,176,74,.22)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(0, sy - 40 + i * 26); ctx.lineTo(this.W, sy - 40 + i * 26); ctx.stroke();
      }
      // arena walls
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(0, 36, 8, this.H - 36); ctx.fillRect(this.W - 8, 36, 8, this.H - 36);
      ctx.fillRect(0, 36, this.W, 6);

      // bricks
      for (const br of this.bricks) {
        const col = this.rowColor(br.row, br.silver);
        ctx.fillStyle = br.flash > 0 ? '#ffffff' : col;
        ctx.fillRect(br.x, br.y, br.w, br.h);
        // bevel
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillRect(br.x, br.y, br.w, 3);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.fillRect(br.x, br.y + br.h - 3, br.w, 3);
        if (br.silver && br.hp === 2) {
          ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
          ctx.strokeRect(br.x + 1.5, br.y + 1.5, br.w - 3, br.h - 3);
        }
      }

      // powerups
      const powCol = { E: '#28e0ff', M: '#ff2e88', S: '#b06cff', '+': '#ffe86b' };
      for (const p of this.pows) {
        const bob = Math.sin(p.t * 6) * 2;
        U.glowStroke(ctx, powCol[p.type], 2, c => c.rect(p.x - 9, p.y - 8 + bob, 18, 16));
        ctx.fillStyle = powCol[p.type]; ctx.font = 'bold 11px Consolas, monospace'; ctx.textAlign = 'center';
        ctx.fillText(p.type, p.x, p.y + 4 + bob); ctx.textAlign = 'left';
      }

      // paddle
      const pd = this.paddle, py = this.H - 46;
      U.glowStroke(ctx, '#ffb04a', 2, c => c.rect(pd.x - pd.w / 2, py, pd.w, 12));
      ctx.fillStyle = '#3a1c08';
      ctx.fillRect(pd.x - pd.w / 2 + 3, py + 3, pd.w - 6, 6);

      // balls
      for (const b of this.balls) {
        for (let i = 0; i < b.trail.length; i++) {
          const t = b.trail[i];
          ctx.globalAlpha = (i / b.trail.length) * .35;
          ctx.fillStyle = '#ffd23e';
          ctx.beginPath(); ctx.arc(t.x, t.y, b.r * (.4 + i / b.trail.length * .6), 0, U.TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,210,62,.5)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, U.TAU); ctx.fill();
      }

      // hud extras
      ctx.textAlign = 'right'; ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = '#ffb04a';
      ctx.fillText('LVL ' + this.level, this.W - 10, 52);
      let lx = this.W - 10;
      for (let i = 0; i < this.lives; i++) {
        ctx.fillStyle = '#ffe86b';
        ctx.fillRect(lx - 16, 58, 16, 4);
        lx -= 21;
      }
      if (this.combo > 3) {
        ctx.fillStyle = '#fff'; ctx.fillText('COMBO ×' + this.combo, this.W - 10, 78);
      }
      ctx.textAlign = 'left';
    }

    promo(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#17091f'); g.addColorStop(1, '#3a1430');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const cols = ['#ff3d6e', '#ff7b3e', '#ffb04a', '#ffd23e'];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 6; c++) {
          ctx.globalAlpha = .55 + .45 * Math.sin(t * 2 + r + c);
          ctx.fillStyle = cols[(r + c) % 4];
          ctx.fillRect(6 + c * 15, 14 + r * 10, 13, 7);
        }
      ctx.globalAlpha = 1;
      const px = w / 2 + Math.sin(t * 1.2) * (w * .3);
      ctx.fillStyle = '#ffb04a';
      ctx.fillRect(px - 14, h - 22, 28, 5);
      const bx = px + Math.cos(t * 3) * 18, by = h - 44 + Math.sin(t * 5) * 8;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, U.TAU); ctx.fill();
    }
  }

  ARC.games = ARC.games || [];
  ARC.games.push({
    id: 'bricks',
    name: 'BRICKSMASH',
    tagline: 'Sunset courts · smash every wall',
    color: '#ffb04a',
    gm1: '#7a3a12', gm2: '#2c1030', gmGlow: 'rgba(255,176,74,.85)',
    controls: ['ARROWS / WASD — MOVE PADDLE', 'SPACE — LAUNCH BALL', 'CATCH FALLING PODS'],
    help: 'Clear all bricks to advance the level (patterns rotate, speed rises). Silver bricks take 2 hits and score double. Pods: E=widen, M=multiball, S=slow-mo, +=life. Chain brick hits without touching the paddle to raise your combo pitch.',
    cls: Bricksmash,
  });
})();
