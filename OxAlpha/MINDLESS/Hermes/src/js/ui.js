// MINDLESS-Hermes :: ui.js — HUD: health bars, avatars, beat pulse, dialogue, results
"use strict";

class UI {
  constructor(game) {
    this.game = game;
    this.ctx = null;               // set each frame
    this.t = 0;
    this.healthFlash = 0;
    this.enemyBarTimer = 0;
    this.enemyBar = { name: "", cur: 0, max: 1, type: null };
    this.beatPulse = 0;
    this.gradePops = [];           // {x,y,text,col,t} world-space
    this.toasts = [];              // {text,col,t}
    this.dialogue = null;          // {lines, idx, chars, t, speaker, done}
    this.onward = 0;               // onward arrow timer
    this.tutorialText = null;      // {text, t}
    this.banner = null;            // {title, sub, t}
    this.novaModeToastT = 0;
  }

  flashHealth() { this.healthFlash = 0.3; }

  toast(text, col = "#ffd24a") {
    this.toasts.push({ text, col, t: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  toastNovaMode(mode) { this.toast("NOVA MODE: " + mode, "#7dffcf"); this.novaModeToastT = 2; }

  spawnGradePop(x, y, text, col) {
    this.gradePops.push({ x, y, text, col, t: 0 });
    if (this.gradePops.length > 12) this.gradePops.shift();
  }

  showBanner(title, sub) { this.banner = { title, sub, t: 0 }; }

  startTutorialPrompt(i) {
    this.tutorialText = { text: TUTORIAL_PROMPTS[i], t: 0 };
  }
  clearTutorialPrompt() { this.tutorialText = null; }

  startDialogue(lines, onDone, skippable = true) {
    this.dialogue = { lines, idx: 0, chars: 0, t: 0, onDone, skippable, wait: 0 };
  }

  advanceDialogue() {
    const d = this.dialogue;
    if (!d) return;
    const full = d.lines[d.idx][1];
    if (d.chars < full.length) { d.chars = full.length; return; }
    d.idx++;
    d.chars = 0;
    this.game.audio.play("click", { volume: 0.4, pitch: 1.3 });
    if (d.idx >= d.lines.length) {
      this.dialogue = null;
      if (d.onDone) d.onDone();
    }
  }

  update(dt) {
    this.t += dt;
    if (this.healthFlash > 0) this.healthFlash -= dt;
    if (this.enemyBarTimer > 0) this.enemyBarTimer -= dt;
    if (this.beatPulse > 0) this.beatPulse -= dt * 3;
    if (this.onward > 0) this.onward -= dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    for (const g of this.gradePops) g.t += dt;
    this.gradePops = this.gradePops.filter(g => g.t < 0.9);
    for (const to of this.toasts) to.t += dt;
    this.toasts = this.toasts.filter(to => to.t < 2.4);
    if (this.dialogue) {
      const d = this.dialogue;
      const full = d.lines[d.idx][1];
      if (d.chars < full.length) {
        d.t += dt;
        const speed = 34;   // chars/sec, close to original 0.035s/char
        const target = Math.min(full.length, Math.floor(d.t * speed));
        if (target > d.chars) {
          if (d.chars === 0 || full[d.chars] === "." || full[d.chars] === ",") this.game.audio.play("click", { volume: 0.15, pitch: U.rand(1.6, 1.9) });
          d.chars = target;
        }
      } else {
        d.wait += dt;
      }
    }
    if (this.tutorialText) this.tutorialText.t += dt;
  }

  // ---------- drawing ----------
  px(n) { return Math.round(n); }

  drawPanel(ctx, x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(8,8,14,${alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(140,150,190,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  drawHealthBar(ctx, x, y, w, h, ratio, twin, flash) {
    // segmented pixel bar (original healthbar ticks)
    const segs = Math.max(10, Math.round(w / 3));
    const fillW = Math.round(w * U.clamp(ratio, 0, 1));
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(x, y, w, h);
    const base = twin === "nova" ? "#3ce088" : "#e8404c";
    for (let i = 0; i < segs; i++) {
      const sx = x + Math.round((i / segs) * w);
      const sw = Math.ceil(w / segs) - 1;
      if (sx < x + fillW) {
        ctx.fillStyle = flash > 0 ? "#ffffff" : base;
        ctx.fillRect(sx, y, sw, h);
      } else {
        ctx.fillStyle = "#2a2a34";
        ctx.fillRect(sx, y, sw, h);
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  drawHUD(ctx) {
    const g = this.game, p = g.world ? g.world.player : null;
    if (!p) return;

    // player panel (top-left): avatar + health + twin name + rage/mode
    this.drawPanel(ctx, 2, 2, 96, 26);
    const av = p.twin === "ecliptio" ? Assets.images.av_ecliptio : Assets.images.av_nova;
    if (av) ctx.drawImage(av, 0, 0, 11, 11, 5, 5, 22, 22);
    ctx.imageSmoothingEnabled = false;
    this.drawHealthBar(ctx, 30, 6, 62, 6, p.currentHealth / p.maxHealth, p.twin, this.healthFlash);
    ctx.font = "5px 'Press Start 2P', monospace";
    ctx.fillStyle = p.twin === "ecliptio" ? "#ff6a72" : "#6af0a0";
    ctx.textBaseline = "top";
    ctx.fillText(p.twin.toUpperCase(), 30, 15);

    if (p.twin === "ecliptio") {
      // rage meter
      const rw = 62, rx = 30, ry = 21;
      ctx.fillStyle = "#26262e";
      ctx.fillRect(rx, ry, rw, 3);
      const rr = p.rage / p.rageMax;
      ctx.fillStyle = p.rageState === "active" ? "#ffffff" : p.rageState === "exhausted" ? "#555a66" : rr >= 1 ? (Math.sin(this.t * 8) > 0 ? "#ffd24a" : "#ff5030") : "#c23a30";
      ctx.fillRect(rx, ry, Math.round(rw * rr), 3);
      if (p.rageState !== "none") {
        ctx.fillStyle = "#9aa2b5";
        ctx.fillText(p.rageState === "active" ? "RAGE!" : "EXHAUSTED", rx + rw + 3, ry - 1);
      } else if (rr >= 1) {
        ctx.fillStyle = "#ffd24a";
        ctx.fillText("[V] RAGE", rx + rw + 3, ry - 1);
      }
    } else {
      // nova mode + beat pulse
      const modeName = p.novaModeNames[p.novaMode];
      ctx.fillStyle = "#7dffcf";
      ctx.fillText(modeName, 30, 21);
      // beat pulse pip (original BeatPulse visible only as Nova)
      const beat = g.beat;
      const phase = (beat.getHeardSongPositionSec() % beat.secPerBeat) / beat.secPerBeat;
      ctx.fillStyle = `rgba(60,224,136,${0.9 - phase * 0.7})`;
      ctx.fillRect(88, 20, 3 + Math.round((1 - phase) * 3), 3);
      // overclock streak pips
      if (p.novaMode === 2) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < p.overclockStreak ? "#7dffcf" : "#2c3a34";
          ctx.fillRect(70 + i * 5, 21, 3, 3);
        }
      }
    }

    // timer (top center, competitive stages)
    if (g.run && g.run.competitive && g.run.running) {
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#cfd6e4";
      ctx.textAlign = "center";
      ctx.fillText(U.fmtTime(g.run.elapsedSeconds), Game.W / 2, 4);
      ctx.textAlign = "left";
    }
    if (g.run && g.run.rescueCount > 0) {
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#8f96a8";
      ctx.textAlign = "center";
      ctx.fillText("RESCUES " + g.run.rescueCount, Game.W / 2, 12);
      ctx.textAlign = "left";
    }

    // enemy/boss bar (top-right, timed visibility)
    if (this.enemyBarTimer > 0 || this.game.bossActive) {
      const eb = this.enemyBar;
      const bw = 70;
      const bx = Game.W - bw - 4, by = 6;
      const avKey = {
        [Type.BASIC_ENEMY]: "av_basic", [Type.DASH_ENEMY]: "av_dasher",
        [Type.ELITE_DASHER_ENEMY]: "av_elite", [Type.EVANGELINE]: "av_evangeline",
        [Type.EDEN]: "av_eden", [Type.ANGELICA]: "av_angelica",
      }[eb.type] || "av_basic";
      const img = Assets.images[avKey];
      if (img) ctx.drawImage(img, 0, 0, 11, 11, bx - 24, by - 3, 20, 20);
      this.drawHealthBar(ctx, bx, by, bw, 5, eb.max ? eb.cur / eb.max : 0, "enemy", 0);
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#cfd6e4";
      ctx.textAlign = "right";
      ctx.fillText(eb.name, bx + bw, by + 8);
      ctx.textAlign = "left";
    }

    // grade pops (PERFECT! etc, world-anchored)
    for (const gp of this.gradePops) {
      const sx = gp.x - (g.world ? g.world.camX : 0);
      const a = 1 - gp.t / 0.9;
      ctx.globalAlpha = a;
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = gp.col;
      ctx.textAlign = "center";
      ctx.fillText(gp.text, sx, gp.y - gp.t * 14);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    // onward arrow (checkpoint clear)
    if (this.onward > 0 && Assets.images.onward_arrow) {
      const bob = Math.sin(this.t * 6) * 2;
      ctx.globalAlpha = U.clamp(this.onward, 0, 1);
      if (Assets.images.onward_arrow) ctx.drawImage(Assets.images.onward_arrow, 0, 0, 11, 11, Game.W - 26, 40 + bob, 18, 18);
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#ffd24a";
      ctx.textAlign = "right";
      ctx.fillText("ONWARD!", Game.W - 30, 46 + bob);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }

    // tutorial prompt
    if (this.tutorialText) {
      const tt = this.tutorialText;
      ctx.font = "5px 'Press Start 2P', monospace";
      const wTxt = ctx.measureText(tt.text).width;
      this.drawPanel(ctx, Game.W / 2 - wTxt / 2 - 5, 30, wTxt + 10, 12, 0.7);
      ctx.fillStyle = "#ffe9a0";
      ctx.textAlign = "center";
      ctx.fillText(tt.text, Game.W / 2, 34);
      ctx.textAlign = "left";
    }

    // toasts
    let ty = 46;
    for (const to of this.toasts) {
      const a = to.t < 0.15 ? to.t / 0.15 : to.t > 2.0 ? (2.4 - to.t) / 0.4 : 1;
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = to.col;
      ctx.textAlign = "center";
      ctx.fillText(to.text, Game.W / 2, ty);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
      ty += 9;
    }

    // banner (stage title)
    if (this.banner) {
      const b = this.banner;
      const aIn = U.clamp(b.t / 0.4, 0, 1), aOut = U.clamp((2.6 - b.t) / 0.5, 0, 1);
      ctx.globalAlpha = Math.min(aIn, aOut);
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(b.title, Game.W / 2, 52);
      ctx.font = "5px 'Press Start 2P', monospace";
      ctx.fillStyle = "#8f96a8";
      ctx.fillText(b.sub || "", Game.W / 2, 64);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  drawDialogue(ctx) {
    const d = this.dialogue;
    if (!d) return;
    const [speaker, full] = d.lines[d.idx];
    const shown = full.slice(0, d.chars);
    const boxH = 30, boxY = Game.H - boxH - 4;
    this.drawPanel(ctx, 6, boxY, Game.W - 12, boxH, 0.82);
    // portrait chip
    const portraits = {
      ECLIPTIO: "av_ecliptio", NOVA: "av_nova", DRONE: "av_basic",
      RESISTANCE: "av_nova", EVANGELINE: "av_evangeline", EDEN: "av_eden", ANGELICA: "av_angelica",
    };
    const pimg = Assets.images[portraits[speaker]] || Assets.images.av_basic;
    if (pimg) ctx.drawImage(pimg, 0, 0, 11, 11, 10, boxY + 6, 18, 18);
    ctx.font = "5px 'Press Start 2P', monospace";
    ctx.fillStyle = speaker === "ECLIPTIO" ? "#ff6a72" : speaker === "NOVA" ? "#6af0a0" : "#8fb4ff";
    ctx.fillText(speaker, 32, boxY + 6);
    ctx.fillStyle = "#e8ecf4";
    this.wrapText(ctx, shown, 32, boxY + 15, Game.W - 46, 8);
    // prompt
    if (d.chars >= full.length) {
      ctx.fillStyle = (Math.floor(this.t * 2) % 2) ? "#ffd24a" : "#7a7f90";
      ctx.fillText("▼", Game.W - 16, Game.H - 9);
    }
    ctx.fillStyle = "#555c6b";
    ctx.font = "4px 'Press Start 2P', monospace";
    ctx.fillText("C/ENTER: NEXT   S: SKIP", 8, 2);
  }

  wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(" ");
    let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w; yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  drawBeatGradeFlash(ctx) {
    // subtle screen-edge pulse on graded actions
    const g = this.game;
    if (!g.lastGrade || performance.now() - g.lastGradeTime > 300) return;
    const a = 1 - (performance.now() - g.lastGradeTime) / 300;
    const col = { 0: "255,214,90", 1: "120,255,160", 2: "120,180,255", 3: "120,120,130" }[g.lastGrade];
    ctx.strokeStyle = `rgba(${col},${a * 0.5})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, Game.W - 2, Game.H - 2);
  }
}
