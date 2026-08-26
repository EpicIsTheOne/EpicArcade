/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — shared arcade-game framework */
(() => {
  const U = ARC.util;

  class BaseGame {
    constructor(app, meta) {
      this.app = app;
      this.meta = meta;
      this.id = meta.id;
      this.W = 480; this.H = 640;
      this.ctx = app.gameCtx;
      this.parts = new ARC.fx.Particles();
      this.floats = new ARC.fx.Floaters();
      this.shake = new ARC.fx.Shaker();
      this.banners = [];
      this.state = 'ready';
      this.score = 0;
      this.lives = null;           // games set (number) to display lives
      this.hudExtra = null;        // fn(ctx) drawn in top bar right zone
      this.timescale = 1;
      this.lastResult = null;
      this.reset();
    }

    get accent() { return this.meta.color; }
    get best() { return ARC.store.best(this.id); }

    addScore(n) { this.score = Math.max(0, Math.floor(this.score + n)); }

    say(txt, color) { this.banners.push({ txt, color: color || this.accent, t: 0 }); }

    // ---- lifecycle ----
    reset() {
      this.score = 0;
      this.parts.clear(); this.floats.clear(); this.banners.length = 0;
      this.timescale = 1;
      this.lastResult = null;
      this.onReset();
    }
    startRun() {
      this.reset();
      this.state = 'playing';
      ARC.audio.sfx.coin();
      this.onStart && this.onStart();
    }
    endRun() {
      if (this.state === 'over') return;
      const res = ARC.store.recordScore(this.id, this.score);
      res.plays = ARC.store.plays()[this.id] || 0;
      this.lastResult = res;
      this.state = 'over';
      ARC.audio.sfx.over();
      if (res.fresh.length) this.app.notifyUnlocks(res.fresh);
      this.onEnd && this.onEnd();
    }

    debug(action) {}   // test hook, overridden per game

    // ---- per-frame ----
    frame(rawDt) {
      const inp = ARC.input;
      // global keys
      if (inp.pressed('Escape')) { this.app.quitToLobby(); return; }
      if (inp.pressed('KeyM')) this.app.toggleMute();

      if (this.state === 'playing' || this.state === 'paused') {
        if (inp.pressed('KeyP')) {
          this.state = this.state === 'playing' ? 'paused' : 'playing';
          ARC.audio.sfx.uiOk();
        }
      }
      if (this.state === 'ready' && (inp.anyPressed('Enter', 'Space') || inp.fire())) this.startRun();
      else if (this.state === 'over' && inp.pressed('Enter')) this.startRun();

      const dt = rawDt * this.timescale;
      if (this.state === 'playing') this.update(dt);

      // fx always tick (so death bursts animate on the over screen)
      this.parts.update(dt);
      this.floats.update(dt);
      this.shake.update(rawDt);
      for (let i = this.banners.length - 1; i >= 0; i--) {
        this.banners[i].t += rawDt;
        if (this.banners[i].t > 1.7) this.banners.splice(i, 1);
      }

      this.render();
    }

    render() {
      const ctx = this.ctx, off = this.shake.offset();
      ctx.save();
      ctx.translate(off.x | 0, off.y | 0);
      this.draw(ctx);
      this.parts.draw(ctx);
      this.floats.draw(ctx);
      ctx.restore();

      this.drawBanner(ctx);
      this.drawTopBar(ctx);

      if (this.state === 'ready') this.drawReady(ctx);
      else if (this.state === 'paused') this.drawPaused(ctx);
      else if (this.state === 'over') this.drawOver(ctx);
    }

    // ---- shared UI pieces ----
    drawTopBar(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 36);
      g.addColorStop(0, 'rgba(5,5,14,.92)'); g.addColorStop(1, 'rgba(5,5,14,.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, 36);
      ctx.fillStyle = '#0008'; ctx.fillRect(0, 36, this.W, 1);
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(U.pad7(this.score), 12, 19);
      ctx.fillStyle = '#ffd23e';
      ctx.textAlign = 'center'; ctx.fillText('HI ' + U.pad7(Math.max(this.best, this.score)), this.W / 2, 19);
      if (this.hudExtra) { ctx.textAlign = 'right'; this.hudExtra(ctx); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    drawBanner(ctx) {
      if (!this.banners.length) return;
      const b = this.banners[this.banners.length - 1];
      const k = b.t < .18 ? b.t / .18 : (b.t > 1.3 ? Math.max(0, 1 - (b.t - 1.3) / .4) : 1);
      const pop = b.t < .18 ? 1.6 - .6 * (b.t / .18) : 1;
      ctx.save();
      ctx.translate(this.W / 2, this.H * .32);
      ctx.scale(pop, pop);
      ctx.globalAlpha = k;
      ctx.font = 'bold 30px Consolas, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillText(b.txt, 2, 2);
      ctx.fillStyle = b.color; ctx.fillText(b.txt, 0, 0);
      ctx.restore();
    }

    _panel(ctx, w, h) {
      const x = (this.W - w) / 2, y = (this.H - h) / 2;
      ctx.fillStyle = 'rgba(4,4,12,.86)';
      ctx.strokeStyle = this.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
      return { x, y };
    }
    _blink(t, rate = 2) { return Math.floor(t * rate) % 2 === 0; }

    drawReady(ctx) {
      const p = this._panel(ctx, 400, 300);
      ctx.textAlign = 'center';
      ctx.fillStyle = this.accent;
      ctx.font = 'bold 34px Consolas, monospace';
      ctx.fillText(this.meta.name, this.W / 2, p.y + 64);
      ctx.fillStyle = '#9aa2cc';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText(this.meta.tagline, this.W / 2, p.y + 92);
      ctx.fillStyle = '#cdd3f5';
      ctx.font = '13px Consolas, monospace';
      const lines = this.meta.controls;
      lines.forEach((l, i) => ctx.fillText(l, this.W / 2, p.y + 136 + i * 22));
      if (this._blink(performance.now() / 1000)) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 17px Consolas, monospace';
        ctx.fillText('PRESS SPACE / ENTER', this.W / 2, p.y + 258);
      }
      ctx.textAlign = 'left';
    }

    drawPaused(ctx) {
      ctx.fillStyle = 'rgba(3,3,10,.62)'; ctx.fillRect(0, 0, this.W, this.H);
      const p = this._panel(ctx, 320, 150);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Consolas, monospace';
      ctx.fillText('PAUSED', this.W / 2, p.y + 60);
      ctx.fillStyle = '#9aa2cc'; ctx.font = '14px Consolas, monospace';
      ctx.fillText('[P] RESUME   [ESC] LOBBY', this.W / 2, p.y + 102);
      ctx.textAlign = 'left';
    }

    drawOver(ctx) {
      const r = this.lastResult || {};
      ctx.fillStyle = 'rgba(3,3,10,.66)'; ctx.fillRect(0, 0, this.W, this.H);
      const p = this._panel(ctx, 380, r.isNew ? 330 : 300);
      ctx.textAlign = 'center';
      ctx.fillStyle = this.accent; ctx.font = 'bold 36px Consolas, monospace';
      ctx.fillText('GAME OVER', this.W / 2, p.y + 62);
      ctx.fillStyle = '#cdd3f5'; ctx.font = '16px Consolas, monospace';
      ctx.fillText('SCORE', this.W / 2, p.y + 106);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Consolas, monospace';
      ctx.fillText(U.pad7(r.score ?? this.score), this.W / 2, p.y + 140);
      ctx.fillStyle = '#ffd23e'; ctx.font = '14px Consolas, monospace';
      ctx.fillText(`BEST ${U.pad7(r.best ?? this.best)}   RUNS ${r.plays ?? 1}`, this.W / 2, p.y + 172);
      if (r.isNew && this._blink(performance.now() / 1000, 3)) {
        ctx.fillStyle = '#ff2e88'; ctx.font = 'bold 20px Consolas, monospace';
        ctx.fillText('★ NEW RECORD! ★', this.W / 2, p.y + 208);
      }
      if (this._blink(performance.now() / 1000)) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Consolas, monospace';
        ctx.fillText('[ENTER] RETRY    [ESC] LOBBY', this.W / 2, p.y + (r.isNew ? 262 : 240));
      }
      ctx.textAlign = 'left';
    }

    // hooks for subclasses
    onReset() {}
    update(dt) {}
    draw(ctx) {}

    // small helpers used by several games
    gridBg(ctx, color, scroll, gap = 40) {
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = -gap + (scroll % gap); y < this.H; y += gap) { ctx.moveTo(0, y); ctx.lineTo(this.W, y); }
      for (let x = 0; x <= this.W; x += gap * 2) { ctx.moveTo(x, 0); ctx.lineTo(x, this.H); }
      ctx.stroke();
    }
  }

  ARC.BaseGame = BaseGame;
})();
