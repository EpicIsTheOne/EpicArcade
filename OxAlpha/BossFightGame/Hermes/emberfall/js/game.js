'use strict';
/* EMBERFALL run-01 :: game orchestrator  [isolated build in /emberfall] */
const Game = {
  state: 'boot', // boot | title | intro | fight | victorySeq | defeatSeq | postVictory | postDefeat
  paused: false,
  canvas: null, ctx: null, dpr: 1,
  player: null, boss: null,
  bullets: [], blades: [],
  t: 0, fightT: 0, introT: 0, seqT: 0,
  introFlashDone: false, exploded: false, nameplateDone: false,
  arenaPulse: 0,
  stats: { dmgTaken: 0, hits: 0, dashes: 0, time: 0 },
  fpsAvg: 60, _fpsN: 0, _fpsT: 0,
  hintT: 0,

  /* ---------------- setup ---------------- */
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init(this.canvas);
    this.wireUI();
    window.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'fight' && !this.paused) this.togglePause();
    });
    this.__installAPI();
    this.resetWorld();
    this.state = 'title';
    this.showScreen('scr-title');
    let last = performance.now();
    const loop = ts => {
      const dt = Math.min(0.05, Math.max(0.0005, (ts - last) / 1000));
      last = ts;
      try { this.frame(dt); } catch (err) { console.error(err); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CFG.W * this.dpr;
    this.canvas.height = CFG.H * this.dpr;
    const s = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
    const stage = document.getElementById('stage');
    stage.style.width = (CFG.W * s | 0) + 'px';
    stage.style.height = (CFG.H * s | 0) + 'px';
  },

  wireUI() {
    const click = fn => e => { AU.ensure(); fn(e); };
    document.getElementById('btn-start').onclick = click(() => this.startIntro());
    document.getElementById('btn-resume').onclick = click(() => this.togglePause());
    document.getElementById('btn-restart').onclick = click(() => this.restart());
    document.getElementById('btn-restart-p').onclick = click(() => { this.restart(); });
    document.getElementById('btn-title-p').onclick = click(() => this.toTitle());
    document.getElementById('btn-title').onclick = click(() => this.toTitle());
  },

  onKey(e) {
    AU.ensure();
    if (e.code === 'KeyM') { const m = AU.toggleMute(); FX.msg(m ? 'SOUND OFF' : 'SOUND ON', '', 0.9); return; }
    if ((e.code === 'Escape' || e.code === 'KeyP') && (this.state === 'fight')) { this.togglePause(); return; }
    if (this.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { this.startIntro(); return; }
    if ((this.state === 'victorySeq' && this.seqT > 2.6) || this.state === 'postVictory' ||
        (this.state === 'defeatSeq' && this.seqT > 2.1) || this.state === 'postDefeat') {
      if (e.code === 'KeyR' || e.code === 'Enter') this.restart();
    }
    if (this.state === 'intro' && this.introT > 0.5) this.introSkip = true;
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    if (id) document.getElementById(id).classList.add('show');
  },
  hideScreens() { this.showScreen(null); },

  /* ---------------- lifecycle ---------------- */
  resetWorld() {
    this.player = new Player();
    this.boss = new Boss();
    this.bullets.length = 0; this.blades.length = 0;
    FX.reset();
    this.fightT = 0; this.introT = 0; this.seqT = 0;
    this.introSkip = false; this.introFlashDone = false; this.exploded = false; this.nameplateDone = false;
    this.arenaPulse = 0; this.hintT = 0;
    this.stats = { dmgTaken: 0, hits: 0, dashes: 0, time: 0 };
    this.paused = false;
  },

  startIntro() {
    AU.ensure();
    this.resetWorld();
    this.state = 'intro';
    this.boss.beginIntro();
    AU.setIntensity(1);
    this.showScreen(null);
  },
  beginFight() {
    this.state = 'fight';
    this.boss.startFight();
    this.fightT = 0; this.hintT = 9;
    AU.setIntensity(1);
    FX.msg('FIGHT', '', 1.4);
    FX.flash('#ffd9a0', 0.18);
  },
  restart() {
    this.hideScreens();
    this.resetWorld();
    this.beginFight();
  },
  toTitle() {
    this.resetWorld();
    this.state = 'title';
    AU.setIntensity(0);
    this.showScreen('scr-title');
  },
  togglePause() {
    if (this.state !== 'fight') return;
    this.paused = !this.paused;
    this.paused ? this.showScreen('scr-pause') : this.hideScreens();
  },

  onBossDead() {
    if (this.state !== 'fight') return true;
    this.state = 'victorySeq'; this.seqT = 0; this.exploded = false;
    this.boss.state = 'dying'; this.boss.deathT = 0; this.boss.atk = null;
    this.clearHazards(true);
    FX.stop(0.32);
    this.stats.time = this.fightT;
    AU.victory(); AU.setIntensity(0);
    FX.addShake(0.5);
    return true;
  },
  onPlayerDead() {
    if (this.state !== 'fight') return;
    this.state = 'defeatSeq'; this.seqT = 0;
    this.boss.atk = null;
    this.clearHazards(true);
    this.stats.time = this.fightT;
    AU.defeat(); AU.setIntensity(0);
  },

  clearHazards(clearBullets) {
    if (clearBullets) this.bullets.length = 0;
    this.blades.length = 0;
  },

  spawnBullet(x, y, vx, vy, opts = {}) {
    if (this.bullets.length >= CFG.MAX_BULLETS) this.bullets.shift();
    this.bullets.push({ x, y, px: x, py: y, vx, vy, r: opts.r || 8, dmg: opts.dmg || 10, col: opts.col || ACCENT[0], life: 9 });
  },

  /* ---------------- per-frame ---------------- */
  frame(rawDt) {
    this.t += rawDt;
    this._fpsN++; this._fpsT += rawDt;
    if (this._fpsT >= 0.5) { this.fpsAvg = this._fpsN / this._fpsT; this._fpsN = 0; this._fpsT = 0; }

    FX.hitstop = Math.max(0, FX.hitstop - rawDt);
    let dtW = rawDt * FX.timeScale * (FX.hitstop > 0 ? 0 : 1);

    switch (this.state) {
      case 'title':
        dtW = rawDt;
        if (U.rand() < rawDt * 14) {
          FX.spawn({ x: U.rand(CFG.ARENA.x, CFG.ARENA.x + CFG.ARENA.w), y: CFG.ARENA.y + CFG.ARENA.h - U.rand(30), vy: U.rand(-46, -14), vx: U.rand(-10, 10), life: U.rand(1.6, 3.4), size: U.rand(1.6, 3.4), col: U.pick(['#ff7a2f', '#ffb066', '#c86a3a']), dragK: 0.12 });
        }
        break;
      case 'intro': this.updateIntro(rawDt); break;
      case 'fight': this.updateFight(dtW, rawDt); break;
      case 'victorySeq': this.updateVictory(rawDt); break;
      case 'defeatSeq': this.updateDefeat(rawDt); break;
    }

    if (!this.paused) FX.update(this.state === 'title' ? rawDt : dtW);
    this.arenaPulse = Math.max(0, this.arenaPulse - rawDt * 0.8);
    this.render();
    Input.endFrame();
  },

  updateIntro(dt) {
    this.introT += dt;
    const b = this.boss;
    b.update(dt, this);
    b.introAlpha = U.clamp((this.introT - 1.1) / 1.2, 0, 1);
    if (this.introT > 0.3 && this.introT < 2.6 && U.rand() < dt * 42) {
      const a = U.rand(TAU), R = U.rand(240, 430);
      FX.spawn({
        x: b.x + Math.cos(a) * R, y: b.y + Math.sin(a) * R,
        vx: 0, vy: 0, life: 0.85, size: U.rand(2, 4.5),
        col: U.pick(['#ff7a2f', '#ffb066', '#ffd9a0']), dragK: 0,
        tx: b.x, ty: b.y, seek: 780,
      });
    }
    if (this.introT >= 2.65 && !this.nameplateDone) { this.nameplateDone = true; FX.msg(BOSS_NAME, BOSS_TITLE, 1.7); }
    if (this.introT >= 2.62 && !this.introFlashDone) { this.introFlashDone = true; FX.flash('#ffb066', 0.5); FX.addShake(0.35); AU.roar(); }
    if (this.introT >= 4.4 || this.introSkip) this.beginFight();
  },

  updateFight(dtW, rawDt) {
    this.fightT += dtW;
    this.hintT -= rawDt;
    this.player.update(dtW, this);
    this.boss.update(dtW, this);
    this.updateProjectiles(dtW);

    // boss body contact damage
    const p = this.player, b = this.boss;
    if (!p.dead && b.vulnerableOrCharging() && p.touchCd <= 0 &&
      !(b.atk && b.atk.name === 'charge' && b.atk.d.st === 'go') &&
      U.dist(p.x, p.y, b.x, b.y) < b.r + p.r - 5) {
      p.touchCd = 0.85;
      p.takeDamage(CFG.BOSS.touchDmg, b.x, b.y, this);
    }
  },

  updateVictory(dt) {
    this.seqT += dt;
    const b = this.boss;
    FX.timeScale = this.seqT < 1.5 ? 0.22 : U.clamp(FX.timeScale + dt * 0.9, 0.22, 1);
    b.deathT += dt * 0.4;
    if (!this.exploded) {
      b.x += U.rand(-3, 3); b.y += U.rand(-3, 3);
      if (U.rand() < dt * 30) FX.spawn({ x: b.x + U.rand(-40, 40), y: b.y + U.rand(-40, 40), vy: U.rand(-120, -40), life: 0.7, size: U.rand(2, 5), col: ACCENT[b.phase], dragK: 1 });
    }
    if (this.seqT >= 1.55 && !this.exploded) {
      this.exploded = true;
      b.hidden = true;
      FX.timeScale = 1;
      FX.flash('#ffffff', 0.85); FX.addShake(1);
      AU.boom(1); AU.boom(0.8);
      FX.ring(b.x, b.y, '#fff', 420, 0.9, 7);
      FX.ring(b.x, b.y, ACCENT[2], 330, 0.8, 5);
      FX.ring(b.x, b.y, ACCENT[0], 240, 0.7, 4);
      for (let i = 0; i < 200; i++) {
        const a = U.rand(TAU), sp = U.rand(80, 640);
        FX.spawn({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: U.rand(0.7, 2.1), size: U.rand(2, 6), col: U.pick([ACCENT[0], ACCENT[1], ACCENT[2], '#ffd9a0', '#fff']), dragK: 1.4, grav: 90 });
      }
      for (let i = 0; i < 26; i++) {
        const a = U.rand(TAU), sp = U.rand(140, 480);
        FX.spawn({ x: b.x, y: b.y, shape: 'spark', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: U.rand(0.4, 0.9), size: 4, col: '#ffe9bd' });
      }
    }
    if (!this.player.dead) this.player.update(FX.timeScale > 0.5 ? dt : dt * 0.3, this);
    if (this.seqT >= 3.1) {
      this.state = 'postVictory';
      this.showEnd(true);
    }
  },

  updateDefeat(dt) {
    this.seqT += dt;
    this.boss.update(dt, this);
    if (this.seqT >= 2.1 && this.state === 'defeatSeq') {
      this.state = 'postDefeat';
      this.showEnd(false);
    }
  },

  showEnd(victory) {
    const word = document.getElementById('end-word');
    word.textContent = victory ? 'VICTORY' : 'YOU FELL';
    word.className = 'big-word' + (victory ? '' : ' defeat');
    document.getElementById('end-sub').textContent = victory
      ? 'the Cinder Sovereign is undone' : 'the Sovereign stands triumphant';
    const s = this.stats;
    document.getElementById('end-stats').innerHTML =
      `<div class="stat"><div class="v">${U.fmt(s.time)}</div><div class="k">time</div></div>` +
      `<div class="stat"><div class="v">${s.dmgTaken}</div><div class="k">damage taken</div></div>` +
      `<div class="stat"><div class="v">${s.hits}</div><div class="k">hits landed</div></div>` +
      `<div class="stat"><div class="v">${Math.round(this.boss.hpMax - this.boss.hp)}</div><div class="k">damage dealt</div></div>`;
    this.showScreen('scr-end');
  },

  updateProjectiles(dt) {
    const p = this.player, A = CFG.ARENA;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bl = this.bullets[i];
      bl.px = bl.x; bl.py = bl.y;
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
      if (bl.life <= 0 || bl.x < A.x - 44 || bl.x > A.x + A.w + 44 || bl.y < A.y - 44 || bl.y > A.y + A.h + 44) {
        this.bullets.splice(i, 1); continue;
      }
      if (!p.dead && p.iT <= 0 && U.dist(bl.x, bl.y, p.x, p.y) < bl.r + p.r) {
        p.takeDamage(bl.dmg, bl.px, bl.py, this);
        FX.burst(bl.x, bl.y, 6, { col: [bl.col, '#fff'], spMin: 40, spMax: 160, lifeMax: 0.35, size: 2.6 });
        this.bullets.splice(i, 1);
      }
    }
    for (let i = this.blades.length - 1; i >= 0; i--) {
      const bd = this.blades[i];
      bd.age += dt;
      const b = this.boss;
      if (bd.mode === 'orbit') {
        const wa = bd.angOff + bd.age * 3.1;
        bd.x = b.x + Math.cos(wa) * 98;
        bd.y = b.y + Math.sin(wa) * 70;
        bd.ang = wa + Math.PI / 2;
        if (bd.age >= bd.delay && !p.dead) {
          bd.mode = 'fly';
          bd.ang = U.angTo(bd.x, bd.y, p.x, p.y);
          AU.shoot();
          FX.burst(bd.x, bd.y, 6, { col: [ACCENT[1]], spMin: 30, spMax: 120, lifeMax: 0.3, size: 2.4 });
        } else if (bd.age >= bd.delay + 1.4) { this.blades.splice(i, 1); continue; }
      } else {
        bd.x += Math.cos(bd.ang) * bd.spd * dt;
        bd.y += Math.sin(bd.ang) * bd.spd * dt;
        if (bd.x < A.x - 30 || bd.x > A.x + A.w + 30 || bd.y < A.y - 30 || bd.y > A.y + A.h + 30) {
          this.blades.splice(i, 1); continue;
        }
        if (!p.dead && p.iT <= 0 && U.dist(bd.x, bd.y, p.x, p.y) < 15 + p.r) {
          p.takeDamage(bd.dmg, bd.x, bd.y, this);
          this.blades.splice(i, 1); continue;
        }
      }
    }
  },

  /* ---------------- render ---------------- */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    ctx.save();
    FX.applyCamera(ctx);

    this.drawArena(ctx);
    FX.drawDecals(ctx);
    if (this.boss) this.boss.drawGround(ctx, this);
    this.drawBlades(ctx);
    this.drawBullets(ctx);
    if (this.boss) this.boss.render(ctx, this);
    if (this.player && this.state !== 'boot') this.player.render(ctx, this);
    FX.drawParts(ctx);
    ctx.restore();

    if (['fight', 'victorySeq', 'defeatSeq'].includes(this.state)) this.drawHUD(ctx);
    FX.drawMsgs(ctx);

    if (this.state === 'intro') this.drawLetterbox(ctx, U.clamp(this.introT / 0.5, 0, 1) * (this.introT > 4.1 ? U.clamp((4.4 - this.introT) / 0.3, 0, 1) : 1));
    if (this.state === 'defeatSeq' || this.state === 'postDefeat') {
      ctx.fillStyle = `rgba(14,16,26,${U.clamp(this.seqT * 0.4, 0, 0.5)})`;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
    }

    FX.drawFlash(ctx);
    this.drawVignette(ctx);
  },

  drawArena(ctx) {
    const A = CFG.ARENA;
    const ph = this.boss ? this.boss.phase : 0;
    const acc = ACCENT[ph];

    const fl = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, 60, CFG.W / 2, CFG.H / 2, 700);
    fl.addColorStop(0, '#191320');
    fl.addColorStop(0.6, '#100c16');
    fl.addColorStop(1, '#0a0710');
    ctx.fillStyle = fl;
    ctx.fillRect(A.x - 30, A.y - 30, A.w + 60, A.h + 60);

    ctx.strokeStyle = 'rgba(255,255,255,.028)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = A.x; x <= A.x + A.w; x += 92) { ctx.moveTo(x, A.y); ctx.lineTo(x, A.y + A.h); }
    for (let y = A.y; y <= A.y + A.h; y += 92) { ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); }
    ctx.stroke();

    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    const pulse = 0.05 + this.arenaPulse * 0.5 + 0.02 * Math.sin(this.t * 1.8);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * 0.03);
    ctx.strokeStyle = acc;
    ctx.globalAlpha = U.clamp(pulse, 0, 1);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 150, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 118, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, 134, a, a + 0.28);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = '#2e2440'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.roundRect(A.x - 5, A.y - 5, A.w + 10, A.h + 10, 18); ctx.stroke();
    ctx.strokeStyle = acc; ctx.globalAlpha = 0.16 + this.arenaPulse * 0.4; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(A.x - 11, A.y - 11, A.w + 22, A.h + 22, 22); ctx.stroke();
    ctx.globalAlpha = 1;

    const spots = [[A.x + 26, A.y + 26], [A.x + A.w - 26, A.y + 26], [A.x + 26, A.y + A.h - 26], [A.x + A.w - 26, A.y + A.h - 26]];
    for (const [x, y] of spots) {
      const fl2 = 0.75 + 0.25 * Math.sin(this.t * 9 + x);
      ctx.fillStyle = '#241a30';
      ctx.beginPath(); ctx.roundRect(x - 9, y - 6, 18, 16, 3); ctx.fill();
      Glow.draw(ctx, '#ff8a3a', x, y - 10, 20 * fl2, 0.5);
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath(); ctx.ellipse(x, y - 9, 4 * fl2, 6 * fl2, 0, 0, TAU); ctx.fill();
    }
  },

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.strokeStyle = b.col; ctx.globalAlpha = 0.4; ctx.lineWidth = b.r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;
      Glow.draw(ctx, b.col, b.x, b.y, b.r * 2.6, 0.85);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
    }
  },

  drawBlades(ctx) {
    for (const bd of this.blades) {
      ctx.save();
      ctx.translate(bd.x, bd.y);
      ctx.rotate(bd.ang);
      ctx.fillStyle = '#d8dce8';
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(2, 5); ctx.lineTo(-12, 0); ctx.lineTo(2, -5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ACCENT[1]; ctx.lineWidth = 1.4; ctx.stroke();
      Glow.draw(ctx, ACCENT[1], -12, 0, 13, 0.6);
      ctx.restore();
    }
  },

  drawHUD(ctx) {
    const b = this.boss, p = this.player;
    if (!b.hidden) {
      const bw = 620, bx = (CFG.W - bw) / 2, byy = 44;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      try { ctx.letterSpacing = '5px'; } catch (e) { }
      ctx.font = 'bold 17px Georgia, serif';
      ctx.fillStyle = '#e8d9b0';
      ctx.fillText('MALGORYN \u00B7 THE CINDER SOVEREIGN', CFG.W / 2, byy - 10);
      try { ctx.letterSpacing = '0px'; } catch (e) { }
      ctx.fillStyle = 'rgba(8,6,12,.82)';
      ctx.beginPath(); ctx.roundRect(bx - 3, byy - 3, bw + 6, 21, 4); ctx.fill();
      ctx.strokeStyle = ACCENT[b.phase]; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.roundRect(bx - 3, byy - 3, bw + 6, 21, 4); ctx.stroke();
      const gf = U.clamp(b.ghostHp / b.hpMax, 0, 1);
      const f = U.clamp(b.hp / b.hpMax, 0, 1);
      if (gf > f) {
        ctx.fillStyle = 'rgba(255,235,235,.55)';
        ctx.fillRect(bx + 1, byy + 1, (bw - 2) * gf, 15);
      }
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, ACCENT[b.phase]); gr.addColorStop(1, '#ffd9a0');
      ctx.fillStyle = gr;
      ctx.fillRect(bx + 1, byy + 1, (bw - 2) * f, 15);
      ctx.fillStyle = 'rgba(10,8,14,.9)';
      for (const th of CFG.BOSS.thresholds) ctx.fillRect(bx + bw * th - 1, byy, 2, 17);
      for (let i = 0; i < 3; i++) {
        const px = bx + bw + 26 + i * 22, py = byy + 8;
        ctx.save();
        ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        if (i <= b.phase) { ctx.fillStyle = ACCENT[Math.min(i, 2)]; ctx.fillRect(-5, -5, 10, 10); }
        ctx.strokeStyle = i <= b.phase ? '#fff' : '#574a6a';
        ctx.lineWidth = 1.4; ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
      }
    }
    const pw = 250, pxx = 44, pyy = CFG.H - 48;
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillStyle = '#cfc4dd';
    ctx.fillText('ASH', pxx, pyy - 7);
    ctx.fillStyle = 'rgba(8,6,12,.82)';
    ctx.beginPath(); ctx.roundRect(pxx - 3, pyy - 3, pw + 6, 19, 4); ctx.fill();
    ctx.strokeStyle = '#5d84a8'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(pxx - 3, pyy - 3, pw + 6, 19, 4); ctx.stroke();
    const hf = U.clamp(p.hp / CFG.PLAYER.maxHp, 0, 1);
    const low = hf < 0.3 ? (0.6 + 0.4 * Math.sin(this.t * 8)) : 1;
    ctx.fillStyle = hf < 0.3 ? `rgba(255,80,70,${low})` : '#ffd257';
    ctx.fillRect(pxx + 1, pyy + 1, (pw - 2) * hf, 13);
    ctx.fillStyle = 'rgba(10,8,14,.85)';
    for (let i = 1; i < 4; i++) ctx.fillRect(pxx + pw * i / 4 - 1, pyy, 2, 15);
    const dx = pxx + pw + 28, dy = pyy + 6.5;
    const cd = U.clamp(1 - p.dashCd / CFG.PLAYER.dashCd, 0, 1);
    ctx.beginPath(); ctx.arc(dx, dy, 9, 0, TAU);
    ctx.fillStyle = cd >= 1 ? 'rgba(120,220,255,.95)' : 'rgba(120,220,255,.18)';
    ctx.fill();
    ctx.strokeStyle = '#78dcff'; ctx.lineWidth = 1.4; ctx.stroke();
    if (cd < 1) {
      ctx.beginPath(); ctx.moveTo(dx, dy);
      ctx.arc(dx, dy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * cd); ctx.closePath();
      ctx.fillStyle = 'rgba(120,220,255,.6)'; ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.font = '16px Consolas, monospace';
    ctx.fillStyle = '#9d92b5';
    ctx.fillText(U.fmt(this.fightT), CFG.W - 40, 40);
    if (this.hintT > 0) {
      const a = U.clamp(this.hintT / 2, 0, 1);
      ctx.globalAlpha = a * 0.85;
      ctx.textAlign = 'center';
      ctx.font = 'italic 16px Georgia, serif';
      ctx.fillStyle = '#a99cc0';
      ctx.fillText('LMB / J — slash     SPACE — dash (invulnerable)     ESC — pause', CFG.W / 2, CFG.H - 26);
      ctx.globalAlpha = 1;
    }
  },

  drawLetterbox(ctx, k) {
    const h = 74 * k;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CFG.W, h);
    ctx.fillRect(0, CFG.H - h, CFG.W, h);
  },

  _vig: null,
  drawVignette(ctx) {
    if (!this._vig) {
      const c = document.createElement('canvas'); c.width = CFG.W; c.height = CFG.H;
      const g2 = c.getContext('2d');
      const gr = g2.createRadialGradient(CFG.W / 2, CFG.H / 2, 340, CFG.W / 2, CFG.H / 2, 780);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(2,1,6,.66)');
      g2.fillStyle = gr; g2.fillRect(0, 0, CFG.W, CFG.H);
      this._vig = c;
    }
    ctx.drawImage(this._vig, 0, 0);
  },

  /* ---------------- test API ---------------- */
  __installAPI() {
    const G = this;
    window.__BF = {
      marker: 'emberfall-run-01 :: bossfight-ox-alpha',
      state: () => G.state,
      phase: () => G.boss.phase,
      bossState: () => G.boss.state,
      bossHp: () => G.boss.hp,
      bossHpMax: () => G.boss.hpMax,
      playerHp: () => G.player.hp,
      bullets: () => G.bullets.length,
      blades: () => G.blades.length,
      fps: () => G.fpsAvg,
      stats: () => ({ ...G.stats }),
      start: () => { if (G.state === 'title') G.startIntro(); },
      skipIntro: () => { if (G.state === 'intro') G.introSkip = true; },
      placePlayer: (x, y) => {
        G.player.x = U.clamp(x, CFG.ARENA.x + 20, CFG.ARENA.x + CFG.ARENA.w - 20);
        G.player.y = U.clamp(y, CFG.ARENA.y + 20, CFG.ARENA.y + CFG.ARENA.h - 20);
        G.player.vx = 0; G.player.vy = 0; G.player.iT = 0;
      },
      attack: ang => {
        if (ang === undefined || ang === null) return G.player.trySlash(G, null);
        const dx = G.boss.x - G.player.x, dy = G.boss.y - G.player.y;
        G.player.trySlash(G, ang === 'boss' ? Math.atan2(dy, dx) : ang);
      },
      angleToBoss: () => Math.atan2(G.boss.y - G.player.y, G.boss.x - G.player.x),
      dash: ang => {
        const p = G.player;
        if (p.dashCd <= 0 && !p.dead) {
          p.dashAng = ang !== undefined ? ang : p.face;
          p.dashT = CFG.PLAYER.dashDur; p.dashCd = CFG.PLAYER.dashCd;
          p.iT = Math.max(p.iT, CFG.PLAYER.dashDur + 0.07);
          AU.dash();
        }
      },
      setBossHp: frac => { G.boss.applyExternalHp(G.boss.hpMax * U.clamp(frac, 0, 1), G); },
      hurtPlayer: n => { G.player.iT = 0; G.player.takeDamage(n, G.player.x + 40, G.player.y, G); },
      forceAttack: name => { if (G.boss.state === 'active') G.boss.force(name); },
      holdBoss: ms => { G.boss.holdT = ms / 1000; G.boss.tx = G.boss.x; G.boss.ty = G.boss.y; },
      bossPos: () => ({ x: G.boss.x, y: G.boss.y }),
      finishBoss: () => { if (G.boss.vulnerable()) G.boss.applyExternalHp(0, G); },
    };
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
