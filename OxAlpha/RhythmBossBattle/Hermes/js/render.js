/* ============================================================
 * PULSEBREAK (PBK.v1) — js/render.js
 * Canvas renderer: beat-reactive stage, THE CONDUCTOR, note
 * highway, guard shards, particles, HUD. Prerendered glows only.
 * ============================================================ */
window.RB = window.RB || {};

(function (RB) {
  'use strict';

  const APPROACH = 1.35;      // seconds a note is visible before its hit time
  const LANES = 4;
  const COL = {
    S: '#ffb84d', G: '#52e0e8', U: '#f06bff',
    perfect: '#ffd97a', good: '#7ce87c', miss: '#ff5d6d',
    bg0: '#0a0817', bg1: '#141026',
  };

  // ---- prerendered glow sprites ---------------------------------------
  function makeGlow(color, coreWhite) {
    const r = 64, c = document.createElement('canvas');
    c.width = c.height = r * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, coreWhite ? 'rgba(255,255,255,0.95)' : color);
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  }

  class Renderer {
    constructor(canvas, song) {
      this.cv = canvas;
      this.g = canvas.getContext('2d');
      this.song = song;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.lowPerf = false;

      this.glowS = makeGlow(COL.S, true);
      this.glowG = makeGlow(COL.G, false);
      this.glowU = makeGlow(COL.U, true);
      this.glowRed = makeGlow('#ff3b57', false);
      this.glowViolet = makeGlow('#8a5cff', false);
      this.glowGold = makeGlow('#ffd97a', false);
      this.spark = makeGlow('#ffffff', true);

      // particle pool
      this.parts = [];
      for (let i = 0; i < 240; i++) this.parts.push({ on: false });
      this.popups = [];
      for (let i = 0; i < 14; i++) this.popups.push({ on: false });

      this.rings = [];
      this.blockFlash = 0; this.specialFlash = 0; this.impactFlash = 0;
      this.toastText = ''; this.toastT = 0; this.lastSectionId = null;
      this.playerHPGhost = song.playerMaxHP;
      this.time = 0;
      this.resize();
    }

    resize() {
      const w = innerWidth, h = innerHeight;
      this.w = w; this.h = h;
      this.cv.width = Math.round(w * this.dpr);
      this.cv.height = Math.round(h * this.dpr);
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // layout anchors
      this.cx = w / 2;
      this.bossY = h * 0.27;
      this.scale = Math.min(w / 1100, h / 760) * 1.05 + 0.15;
      this.hwTopY = h * 0.40;
      this.recvY = h * 0.845;
      this.hwTopW = Math.min(w * 0.20, 300);
      this.hwBotW = Math.min(w * 0.56, 780);
      this.laneX = (p) => { // p in [0..1] down the highway
        const ww = this.hwTopW + (this.hwBotW - this.hwTopW) * p;
        return { cx: this.cx, half: ww / 2 };
      };
      this.laneCenter = (lane, p) => {
        const { cx, half } = this.laneX(p);
        return cx - half + half * 2 * ((lane + 0.5) / LANES);
      };
    }

    // ---- fx intake -----------------------------------------------------
    consumeFx(game) {
      for (const f of game.drainFx()) {
        if (f.kind === 'judge') {
          const j = f.a;
          this.spawnPopup(j, f.b);
          if (j !== 'M') {
            const col = j === 'P' ? COL.perfect : COL.good;
            const y = this.recvY, x = this.laneCenter(f.b, 1);
            this.burst(x, y, col, j === 'P' ? 14 : 8, j === 'P' ? 340 : 230);
            if (j === 'P') this.rings.push({ x, y, r: 10, vr: 480, life: 0.32, max: 0.32, col });
          }
        } else if (f.kind === 'block') {
          this.blockFlash = 1;
          this.burst(this.cx, this.recvY - 30 * this.scale, COL.G, 18, 380);
        } else if (f.kind === 'impact') {
          this.impactFlash = 1;
          this.burst(this.cx, this.recvY - 30 * this.scale, '#ff3b57', 22, 420);
        } else if (f.kind === 'special') {
          this.specialFlash = 1;
          this.rings.push({ x: this.cx, y: this.h * 0.72, r: 20, vr: 1500, life: 0.55, max: 0.55, col: COL.U, w: 14 });
          this.burst(this.cx, this.h * 0.72, COL.U, 46, 700);
          this.burst(this.cx, this.bossY, '#ffffff', 30, 520);
        }
      }
    }

    burst(x, y, col, n, spd) {
      const cap = this.lowPerf ? Math.ceil(n / 2) : n;
      let made = 0;
      for (const p of this.parts) {
        if (p.on) continue;
        const a = Math.random() * Math.PI * 2, v = (0.35 + Math.random() * 0.65) * spd;
        p.on = true; p.x = x; p.y = y;
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - spd * 0.28;
        p.life = 0.5 + Math.random() * 0.3; p.max = p.life;
        p.size = 5 + Math.random() * 9; p.col = col;
        if (++made >= cap) break;
      }
    }

    notePress(lane) { this.pressLane = lane; this.pressAt = this.time; }

    spawnPopup(j, lane) {
      for (const p of this.popups) {
        if (p.on) continue;
        p.on = true; p.j = j; p.x = this.laneCenter(lane, 1); p.y = this.recvY - 34;
        p.t = 0; break;
      }
    }

    // ---- main draw -------------------------------------------------------
    draw(game, dt) {
      const g = this.g;
      this.time += dt;
      this.consumeFx(game);
      this.stepPools(dt);

      const t = Math.max(0, game.now);
      const sec = game.sectionAt(Math.min(t, this.song.songDur - 0.01));
      const inten = sec.intensity;
      const spb = this.song.spb;
      const beatPhase = ((t / spb) % 1 + 1) % 1;
      const pulse = Math.pow(1 - beatPhase, 2.2) * (game.state === 'menu' ? 0.45 : 0.65 + inten * 0.5);

      // shake transform
      const shk = game.shake;
      g.save();
      if (shk > 0.01) g.translate((Math.random() - 0.5) * 26 * shk, (Math.random() - 0.5) * 26 * shk);

      this.drawBackground(inten, pulse);
      this.drawRings(dt);
      this.drawConductor(game, inten, pulse, t);
      if (game.state !== 'menu') {
        this.drawShards(game, t);
        this.drawHighway(game, t, pulse);
        this.drawHud(game, inten, dt);
      }
      g.restore();

      // full-screen flashes above everything
      if (this.specialFlash > 0.01) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(240,107,255,${this.specialFlash * 0.42})`;
        g.fillRect(0, 0, this.w, this.h);
        g.fillStyle = `rgba(255,255,255,${this.specialFlash * 0.30})`;
        g.fillRect(0, 0, this.w, this.h);
        g.globalCompositeOperation = 'source-over';
      }
      if (this.impactFlash > 0.01) {
        g.strokeStyle = `rgba(255,59,87,${this.impactFlash * 0.8})`;
        g.lineWidth = 26 * this.impactFlash;
        g.strokeRect(6, 6, this.w - 12, this.h - 12);
      }
      if (game.flashPlayerHurt > 0.01) {
        g.fillStyle = `rgba(255,40,70,${game.flashPlayerHurt * 0.16})`;
        g.fillRect(0, 0, this.w, this.h);
      }

      if (game.state === 'playing' && game.now < this.song.sections[0].dur) this.drawCountdown(game);
      this.drawToast(dt);
      if (game.state === 'lostPending' || (game.state === 'lost')) {
        g.fillStyle = `rgba(60,0,10,${Math.min(0.5, this.time % 1 * 0 + 0.35)})`;
        g.fillRect(0, 0, this.w, this.h);
      }
    }

    stepPools(dt) {
      for (const p of this.parts) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 640 * dt; p.vx *= (1 - 1.6 * dt);
      }
      for (const p of this.popups) {
        if (!p.on) continue;
        p.t += dt;
        if (p.t > 0.62) p.on = false;
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt; r.r += r.vr * dt;
        if (r.life <= 0) this.rings.splice(i, 1);
      }
      this.blockFlash = Math.max(0, this.blockFlash - dt * 3.2);
      this.specialFlash = Math.max(0, this.specialFlash - dt * 1.7);
      this.impactFlash = Math.max(0, this.impactFlash - dt * 2.6);
      this.comboPop = Math.max(0, (this.comboPop || 0) - dt);
      if (this.toastT > 0) this.toastT -= dt;
    }

    // ---- layers ------------------------------------------------------------
    drawBackground(inten, pulse) {
      const g = this.g, w = this.w, h = this.h;
      // static base gradient (two fills, no per-frame gradient objects)
      g.fillStyle = COL.bg0; g.fillRect(0, 0, w, h);
      g.fillStyle = COL.bg1;
      g.fillRect(0, 0, w, h * (0.34 + pulse * 0.03));

      // horizon glow behind boss
      const gw = 560 * this.scale * (1 + inten * 0.35 + pulse * 0.12);
      g.globalAlpha = 0.5 + inten * 0.3;
      g.drawImage(this.glowViolet, this.cx - gw / 2, this.bossY - gw / 2, gw, gw);
      g.globalAlpha = 1;

      // perspective floor grid
      const gy = h * 0.52;
      g.strokeStyle = `rgba(140,110,255,${0.10 + pulse * 0.16})`;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = -6; i <= 6; i++) {
        const xb = this.cx + i * w * 0.055;
        g.moveTo(xb, gy);
        g.lineTo(this.cx + i * w * 0.16, h + 30);
      }
      const rows = 9;
      for (let rI = 0; rI < rows; rI++) {
        const fr = ((rI / rows + (this.time * 0.09) % (1 / rows)) % 1);
        const y = gy + (h - gy) * fr * fr;
        g.moveTo(0, y); g.lineTo(w, y);
      }
      g.stroke();

      // floating dust motes (cheap, deterministic drift)
      g.fillStyle = `rgba(190,170,255,${0.12 + pulse * 0.1})`;
      for (let i = 0; i < 26; i++) {
        const sx = (i * 173.3 + this.time * (6 + (i % 5) * 4)) % (w + 40) - 20;
        const sy = (h * 0.75) - ((i * 97.7 + this.time * (10 + (i % 3) * 8)) % (h * 0.7));
        g.fillRect(sx, sy, 2.4, 2.4);
      }

      // vignette (prerendered once)
      if (!this._vig || this._vigW !== w || this._vigH !== h) {
        const c = document.createElement('canvas');
        c.width = Math.max(2, Math.round(w / 4)); c.height = Math.max(2, Math.round(h / 4));
        const vg = c.getContext('2d');
        const grad = vg.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.36,
          c.width / 2, c.height / 2, c.width * 0.72);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(2,0,8,0.78)');
        vg.fillStyle = grad; vg.fillRect(0, 0, c.width, c.height);
        this._vig = c; this._vigW = w; this._vigH = h;
      }
      g.drawImage(this._vig, 0, 0, w, h);
    }

    drawRings() {
      const g = this.g;
      g.globalCompositeOperation = 'lighter';
      for (const r of this.rings) {
        g.globalAlpha = Math.max(0, r.life / r.max) * 0.85;
        g.strokeStyle = r.col;
        g.lineWidth = r.w || 3;
        g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // THE CONDUCTOR --------------------------------------------------------
    drawConductor(game, inten, pulse, t) {
      const g = this.g, s = this.scale;
      const x = this.cx, y = this.bossY + Math.sin(this.time * 1.1) * 6 * s;
      const hurt = game.flashBossHurt;
      const dying = game.state === 'wonPending' || game.state === 'won';
      const diss = game.winDissolve;

      // aura
      const aw = (330 + inten * 130) * s * (1 + pulse * 0.08);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (0.34 + inten * 0.3 + pulse * 0.12) * (1 - diss * 0.8);
      g.drawImage(hurt > 0.4 || inten > 0.85 ? this.glowRed : this.glowViolet, x - aw / 2, y - aw / 2, aw, aw);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;

      const sway = Math.sin(this.time * 0.9) * 0.04;
      g.save();
      g.translate(x, y);
      g.rotate(sway);
      g.scale(s, s);

      // coat tails flutter
      const flut = Math.sin(this.time * 2.2) * 6;
      g.fillStyle = '#171226';
      if (game.state === 'lost' || game.state === 'lostPending') g.fillStyle = '#241019';
      g.beginPath();
      g.moveTo(-64, -40);
      g.bezierCurveTo(-92, 20, -74, 96, -96 - flut, 168);
      g.lineTo(-58, 148); g.lineTo(-30, 178); g.lineTo(0, 150);
      g.lineTo(30, 178); g.lineTo(58, 148); g.lineTo(96 + flut, 168);
      g.bezierCurveTo(74, 96, 92, 20, 64, -40);
      g.closePath();
      g.fill();
      // collar rim light
      g.strokeStyle = `rgba(${inten > 0.8 ? '255,90,120' : '170,140,255'},${0.8 - diss * 0.6})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-64, -38); g.quadraticCurveTo(-88, 40, -92 - flut, 160);
      g.moveTo(64, -38); g.quadraticCurveTo(88, 40, 92 + flut, 160);
      g.stroke();

      // arms: left raised when attacks incoming, right conducts
      const conducting = game.state !== 'menu';
      const batA = conducting
        ? (-2.1 + ((t / this.song.spb) % 1) * 1.15 + Math.sin(this.time * 3) * 0.06)
        : (-1.9 + Math.sin(this.time * 0.7) * 0.1);
      this.drawArm(g, -58, -26, Math.PI * 0.86, inten);
      this.drawArm(g, 58, -26, batA + Math.PI, inten, true);

      // mask
      g.save();
      if (diss) { g.translate(0, -diss * 260); g.globalAlpha = 1 - diss; }
      g.fillStyle = '#efeaff';
      this.maskPath(g);
      g.fill();
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 8;
      g.fill();
      g.shadowBlur = 0;
      // eyes glow with intensity
      const eCol = inten >= 0.99 ? '#ff2e4d' : inten >= 0.7 ? '#ff7a4d' : '#9a6bff';
      g.fillStyle = eCol;
      g.save(); g.globalCompositeOperation = 'lighter';
      const eg = 26 + pulse * 16;
      g.drawImage(this.spark, -30 - eg / 2, -66 - eg / 2, eg, eg);
      g.drawImage(this.spark, 30 - eg / 2, -66 - eg / 2, eg, eg);
      g.restore();
      g.fillStyle = eCol;
      g.beginPath(); g.ellipse(-30, -66, 7.5, 11, 0.12, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(30, -66, 7.5, 11, -0.12, 0, Math.PI * 2); g.fill();
      // cracks under 50% hp
      const hpFrac = game.bossHP / this.song.bossMaxHP;
      if (hpFrac < 0.5) {
        g.strokeStyle = 'rgba(20,10,30,0.85)';
        g.lineWidth = 2;
        const cr = (1 - hpFrac * 2);
        g.beginPath();
        g.moveTo(-14, -88); g.lineTo(-6 - cr * 6, -70); g.lineTo(-16 - cr * 8, -54);
        g.moveTo(22, -92); g.lineTo(12 + cr * 5, -72); g.lineTo(24 + cr * 6, -58);
        g.stroke();
      }
      g.restore(); // mask

      g.restore(); // body

      // particles drawn after boss
      this.drawParticles(g);

      // hurt silhouette flash
      if (hurt > 0.02) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = hurt * 0.5;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(x, y - 40 * s, 120 * s, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }

    drawArm(g, ax, ay, ang, inten, withBaton) {
      g.save();
      g.translate(ax, ay);
      g.rotate(Math.sin(ang) * 0.14 + (withBaton ? Math.sin(this.time * 2.4) * 0.05 : 0));
      g.strokeStyle = '#171226';
      g.lineWidth = 17; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(withBaton ? 34 : -34, -26, withBaton ? 62 : -62, -58);
      g.stroke();
      g.strokeStyle = 'rgba(190,160,255,0.5)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(withBaton ? 34 : -34, -26, withBaton ? 62 : -62, -58);
      g.stroke();
      if (withBaton) {
        // baton: bright conductor's wand
        g.save();
        g.translate(62, -58);
        g.rotate(-0.7 + Math.sin(this.time * 5.2) * 0.1);
        g.strokeStyle = '#efeaff';
        g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(74, -34); g.stroke();
        const tip = 10 + inten * 8;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(this.spark, 74 - tip / 2, -34 - tip / 2, tip, tip);
        g.restore();
      }
      g.restore();
    }

    maskPath(g) {
      g.beginPath();
      g.moveTo(0, -104);
      g.bezierCurveTo(30, -104, 44, -82, 42, -52);
      g.bezierCurveTo(40, -26, 24, -2, 0, 6);
      g.bezierCurveTo(-24, -2, -40, -26, -42, -52);
      g.bezierCurveTo(-44, -82, -30, -104, 0, -104);
      g.closePath();
    }

    drawParticles(g) {
      g.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        if (!p.on) continue;
        const a = Math.max(0, p.life / p.max);
        const sz = p.size * (0.5 + a * 0.8);
        g.globalAlpha = a * 0.9;
        g.drawImage(this.spark, p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // ---- highway & notes ----------------------------------------------------
    drawHighway(game, t, pulse) {
      const g = this.g;

      // road surface
      g.beginPath();
      g.moveTo(this.cx - this.hwTopW / 2, this.hwTopY);
      g.lineTo(this.cx + this.hwTopW / 2, this.hwTopY);
      g.lineTo(this.cx + this.hwBotW / 2, this.recvY + 46);
      g.lineTo(this.cx - this.hwBotW / 2, this.recvY + 46);
      g.closePath();
      g.fillStyle = 'rgba(16,12,32,0.72)';
      g.fill();
      g.strokeStyle = 'rgba(150,120,255,0.28)';
      g.lineWidth = 2;
      g.stroke();

      // lane dividers
      g.strokeStyle = 'rgba(150,130,230,0.16)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let lN = 1; lN < LANES; lN++) {
        g.moveTo(this.laneCenter(lN - 0.5, 0), this.hwTopY);
        g.lineTo(this.laneCenter(lN - 0.5, 1), this.recvY);
      }
      g.stroke();

      // beat pulse line sweeping down
      const spb = this.song.spb;
      const ph = ((t / spb) % 1 + 1) % 1;
      g.strokeStyle = `rgba(190,160,255,${0.30 * pulse + 0.06})`;
      g.lineWidth = 2;
      const py = this.hwTopY + (this.recvY - this.hwTopY) * ph;
      const L = this.laneX((py - this.hwTopY) / (this.recvY - this.hwTopY));
      g.beginPath();
      g.moveTo(L.cx - L.half, py); g.lineTo(L.cx + L.half, py);
      g.stroke();

      // receptors
      for (let lN = 0; lN < LANES; lN++) {
        const x = this.laneCenter(lN, 1);
        const pressed = this.pressLane === lN && this.time - this.pressAt < 0.11;
        const rr = 21 * this.scale * (pressed ? 1.22 : 1) * (1 + pulse * 0.05);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = pressed ? 0.95 : 0.5;
        const gs = rr * 3;
        g.drawImage(this.spark, x - gs / 2, this.recvY - gs / 2, gs, gs);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = pressed ? '#efeaff' : 'rgba(210,190,255,0.65)';
        g.lineWidth = pressed ? 3.5 : 2;
        g.beginPath(); g.arc(x, this.recvY, rr, 0, Math.PI * 2); g.stroke();
      }

      // shield flash across pulse line
      if (this.blockFlash > 0.02) {
        g.strokeStyle = `rgba(82,224,232,${this.blockFlash * 0.9})`;
        g.lineWidth = 6 + this.blockFlash * 8;
        g.beginPath();
        g.arc(this.cx, this.recvY, this.hwBotW * 0.56, Math.PI * 1.08, Math.PI * 1.92);
        g.stroke();
      }

      // notes
      const notes = game.notes;
      for (let i = game.nextExpire; i < notes.length; i++) {
        const n = notes[i];
        if (n.t - t > APPROACH) break;
        if (n.judged) continue;
        const p = 1 - (n.t - t) / APPROACH;
        if (p < 0) continue;
        const y = this.hwTopY + (this.recvY - this.hwTopY) * p;
        const x = this.laneCenter(n.lane, p);
        this.drawNote(n, x, y, p);
      }

      // judgement popups
      for (const pp of this.popups) {
        if (!pp.on) continue;
        const fr = pp.t / 0.62;
        const col = pp.j === 'P' ? COL.perfect : pp.j === 'G' ? COL.good : COL.miss;
        const txt = pp.j === 'P' ? 'PERFECT' : pp.j === 'G' ? 'GOOD' : 'MISS';
        const size = (pp.j === 'P' ? 30 : 24) * this.scale * (1 + (1 - Math.min(1, fr * 4)) * 0.5);
        g.font = `900 ${size}px "Segoe UI", sans-serif`;
        g.textAlign = 'center';
        g.globalAlpha = 1 - fr * fr;
        g.lineWidth = 4; g.strokeStyle = 'rgba(10,6,20,0.9)';
        const yy = pp.y - fr * 44;
        g.strokeText(txt, pp.x, yy);
        g.fillStyle = col;
        g.fillText(txt, pp.x, yy);
        g.globalAlpha = 1;
      }
    }

    drawNote(n, x, y, p) {
      const g = this.g, s = this.scale;
      const col = COL[n.kind];
      const size = (n.kind === 'U' ? 34 : 26) * s * (n.kind === 'U' ? (1 + 0.12 * Math.sin(this.time * 9)) : 1);
      // trail
      if (p > 0.08) {
        g.globalAlpha = 0.35;
        g.strokeStyle = col; g.lineWidth = size * 0.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y - size * 1.6); g.lineTo(x, y); g.stroke();
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'lighter';
      const gs = size * 3.2;
      const glow = n.kind === 'S' ? this.glowS : n.kind === 'G' ? this.glowG : this.glowU;
      g.drawImage(glow, x - gs / 2, y - gs / 2, gs, gs);
      g.globalCompositeOperation = 'source-over';
      // gem
      g.fillStyle = col;
      if (n.kind === 'U') {
        g.save(); g.translate(x, y); g.rotate(this.time * 2.4);
        g.beginPath();
        for (let kI = 0; kI < 6; kI++) {
          const a = kI / 6 * Math.PI * 2;
          const rx = Math.cos(a) * size * 0.62, ry = Math.sin(a) * size * 0.62;
          kI === 0 ? g.moveTo(rx, ry) : g.lineTo(rx, ry);
        }
        g.closePath(); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(0, 0, size * 0.22, 0, Math.PI * 2); g.fill();
        g.restore();
      } else {
        g.beginPath();
        this.roundRect(g, x - size * 0.62, y - size * 0.42, size * 1.24, size * 0.84, size * 0.3);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        this.roundRect(g, x - size * 0.4, y - size * 0.26, size * 0.8, size * 0.2, size * 0.12);
        g.fill();
      }
    }

    roundRect(g, x, y, w, h, r) {
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    // boss guard-shards flying toward the pulse line -------------------------
    drawShards(game, t) {
      const g = this.g, s = this.scale;
      const notes = game.notes;
      const startIdx = Math.max(0, game.nextExpire - 8);
      for (let i = startIdx; i < notes.length; i++) {
        const n = notes[i];
        if (n.kind !== 'G') continue;
        if (n.judged) {
          if (n.j === 'M' && t - n.t < 0.3) {
            // impact bloom at shield
            const a = 1 - (t - n.t) / 0.3;
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = a;
            const bs = 180 * s * (1.3 - a * 0.4);
            g.drawImage(this.glowRed, this.cx - bs / 2, this.recvY - 30 * s - bs / 2, bs, bs);
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
          }
          continue;
        }
        const LAND = 1.05;
        const q = (t - (n.t - LAND)) / LAND;
        if (q < 0) break;
        if (q > 1 + RB.GOOD) continue;
        const targetX = this.laneCenter(n.lane, 1), targetY = this.recvY - 30 * s;
        const startX = this.cx + (n.lane < 2 ? -46 : 46) * s, startY = this.bossY + 30 * s;
        const qq = Math.min(q, 1);
        const xx = startX + (targetX - startX) * qq;
        const yy = startY + (targetY - startY) * qq - Math.sin(Math.PI * qq) * 60 * s;
        // telegraph beam while approaching
        if (q < 1) {
          g.strokeStyle = `rgba(255,59,87,${0.10 + 0.14 * qq})`;
          g.lineWidth = 3 + qq * 3;
          g.beginPath(); g.moveTo(startX, startY); g.lineTo(xx, yy); g.stroke();
        }
        const sh = 26 * s;
        g.save();
        g.translate(xx, yy);
        g.rotate(qq * 5 + this.time * 3);
        g.globalCompositeOperation = 'lighter';
        g.drawImage(this.glowRed, -sh * 1.4, -sh * 1.4, sh * 2.8, sh * 2.8);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#ff5d7d';
        g.beginPath();
        g.moveTo(0, -sh); g.lineTo(sh * 0.4, 0); g.lineTo(0, sh); g.lineTo(-sh * 0.4, 0);
        g.closePath(); g.fill();
        g.restore();
      }
    }

    // ---- HUD -----------------------------------------------------------------
    drawHud(game, inten, dt) {
      const g = this.g, w = this.w, s = this.scale;
      const pad = 22;

      // ---- player HP (bottom-left)
      const bw = Math.min(300, w * 0.3), bh = 18, bx = pad, by = this.h - pad - bh - 26;
      this.playerHPGhost += (game.playerHP - this.playerHPGhost) * Math.min(1, dt * 2.5);
      g.font = `800 ${13 * s + 4}px "Segoe UI", sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = '#cfcae6';
      g.fillText('YOU', bx, by - 8);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      this.roundRect(g, bx, by, bw, bh, 9); g.fill();
      const ghpw = bw * Math.max(0, this.playerHPGhost) / this.song.playerMaxHP;
      g.fillStyle = 'rgba(255,80,100,0.55)';
      this.roundRect(g, bx, by, ghpw, bh, 9); g.fill();
      const phw = bw * Math.max(0, game.playerHP) / this.song.playerMaxHP;
      g.fillStyle = game.playerHP < 30 ? '#ff5d6d' : '#52e0e8';
      this.roundRect(g, bx, by, phw, bh, 9); g.fill();
      // resonance meter under HP
      const my = by + bh + 8;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      this.roundRect(g, bx, my, bw, 10, 5); g.fill();
      const mw = bw * Math.min(1, game.meter / 100);
      const hot = game.meter >= 100;
      g.fillStyle = hot ? '#ffffff' : COL.U;
      this.roundRect(g, bx, my, mw, 10, 5); g.fill();
      if (hot) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 12);
        g.drawImage(this.glowU, bx + mw - 30, my - 25, 60, 60);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      g.fillStyle = '#9d94c4'; g.font = `${11 * s + 3}px "Segoe UI"`;
      g.fillText('RESONANCE', bx, my + 24);

      // ---- boss bar (top-center)
      const bbw = Math.min(620, w * 0.56), bbx = this.cx - bbw / 2, bby = 30;
      const bfrac = Math.max(0, game.bossHP) / this.song.bossMaxHP;
      const bdfrac = Math.max(0, game.bossDisplayHP) / this.song.bossMaxHP;
      g.textAlign = 'center';
      g.font = `900 ${15 * s + 4}px "Segoe UI", sans-serif`;
      g.fillStyle = '#ffb3c2';
      g.fillText('THE CONDUCTOR', this.cx, bby - 8);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      this.roundRect(g, bbx, bby, bbw, 14, 7); g.fill();
      g.fillStyle = 'rgba(255,120,150,0.45)';
      this.roundRect(g, bbx, bby, bbw * bdfrac, 14, 7); g.fill();
      g.fillStyle = inten >= 0.99 ? '#ff2e4d' : '#c05cff';
      this.roundRect(g, bbx, bby, bbw * bfrac, 14, 7); g.fill();

      // ---- score / accuracy (top-right)
      g.textAlign = 'right';
      g.font = `800 ${20 * s + 6}px "Segoe UI", sans-serif`;
      g.fillStyle = '#efeaff';
      g.fillText(String(game.score).padStart(7, '0'), w - pad, 46);
      g.font = `${12 * s + 3}px "Segoe UI"`;
      g.fillStyle = '#9d94c4';
      g.fillText(`${game.accuracy.toFixed(1)}%   \u00d7${game.mult.toFixed(2)}`, w - pad, 68);

      // ---- combo (left of highway center)
      if (game.combo >= 4) {
        g.textAlign = 'center';
        if (game.combo > (this._lastCombo || 0)) this.comboPop = 0.16;
        this._lastCombo = game.combo;
        const pop = 1 + (this.comboPop > 0 ? this.comboPop / 0.16 : 0) * 0.3;
        const cs = (26 + Math.min(game.combo, 60) * 0.2) * s * pop;
        g.font = `900 ${cs}px "Segoe UI", sans-serif`;
        g.fillStyle = COL.perfect;
        g.globalAlpha = 0.92;
        g.fillText(String(game.combo), this.cx - this.hwBotW * 0.62, this.recvY - 60);
        g.font = `800 ${cs * 0.38}px "Segoe UI"`;
        g.fillStyle = '#cfcae6';
        g.fillText('COMBO', this.cx - this.hwBotW * 0.62, this.recvY - 60 + cs * 0.5);
        g.globalAlpha = 1;
      }

      // ---- section label (top-left)
      g.textAlign = 'left';
      const sec = game.sectionAt(Math.max(0, game.now));
      if (sec.id !== this.lastSectionId) {
        this.lastSectionId = sec.id;
        if (sec.name) { this.toastText = sec.name; this.toastT = 2.4; }
      }
      g.font = `${12 * s + 2}px "Segoe UI"`;
      g.fillStyle = '#8f86bb';
      g.fillText('\u266a OVERTURE OF RUIN \u2014 130 BPM', pad, 40);

      // hints
      g.textAlign = 'right';
      g.fillStyle = 'rgba(150,140,190,0.55)';
      g.font = `${11 * s + 2}px "Segoe UI"`;
      g.fillText('ESC pause \u00b7 R restart \u00b7 M mute', w - pad, this.h - 12);
    }

    drawToast(dt) {
      if (this.toastT <= 0 || !this.toastText) return;
      const g = this.g;
      const a = Math.min(1, this.toastT / 0.5);
      g.textAlign = 'center';
      g.font = `900 ${Math.round(24 * this.scale)}px "Segoe UI", sans-serif`;
      g.globalAlpha = a * 0.9;
      g.fillStyle = '#ffd97a';
      g.fillText(this.toastText, this.cx, this.h * 0.155);
      g.globalAlpha = 1;
    }

    drawCountdown(game) {
      const g = this.g;
      const t = game.now, spb = this.song.spb;
      const beat = Math.floor(t / spb);
      const labels = ['3', '2', '1', 'GO'];
      if (beat > 3) return;
      const frac = (t / spb) - beat;
      const pop = 1 + (1 - Math.min(1, frac * 3.2)) * 0.55;
      g.textAlign = 'center';
      g.font = `900 ${Math.round(110 * this.scale * pop)}px "Segoe UI", sans-serif`;
      g.globalAlpha = 0.95 - frac * 0.35;
      g.lineWidth = 8; g.strokeStyle = 'rgba(10,6,20,0.85)';
      g.strokeText(labels[beat], this.cx, this.h * 0.47);
      g.fillStyle = beat === 3 ? '#7ce87c' : '#ffd97a';
      g.fillText(labels[beat], this.cx, this.h * 0.47);
      g.globalAlpha = 1;
    }
  }

  RB.Renderer = Renderer;

})(window.RB);
