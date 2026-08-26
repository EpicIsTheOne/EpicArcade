/* Core battle: note fields, judgment, health/score/combo, HUD, camera, countdown. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;

  const LANE_COLORS = ["#b45cff", "#25d0ff", "#5cff7a", "#ff5c69"];
  const LANE_DARK = ["#5a2490", "#0e6a85", "#1f8f45", "#8f2430"];
  const LANE_NAMES = ["left", "down", "up", "right"];

  const OPP_X = 430, PLR_X = 850, LANE_GAP = 84, RECEPTOR_Y = 118;
  const NOTE_SPEED = 560;                 // px per second
  const WIN_SICK = 45, WIN_GOOD = 90, WIN_BAD = 135, WIN_MISS = 160;

  const SCORE = { sick: 350, good: 200, bad: 50, miss: -10, holdTick: 10, holdDone: 100 };
  const HEALTH = { start: 50, sick: +2.3, good: +1.1, bad: -1.0, miss: -6.5, holdTick: +0.35, drop: -3 };
  // sprite points UP; per-lane rotation: left=-90°, down=180°, up=0, right=+90°
  const LANE_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];

  function laneX(side, lane) { return (side === 0 ? OPP_X : PLR_X) + (lane - 1.5) * LANE_GAP; }

  // ---------- arrow sprites (pre-rendered) ----------
  function makeArrowSprite(size, color, dark, mode) {
    // mode: 'note' full, 'rec' receptor outline, 'recPress' receptor filled
    const cv = document.createElement("canvas");
    cv.width = cv.height = size * 2;
    const c = cv.getContext("2d");
    c.scale(2, 2);
    const cx = size / 2, cy = size / 2, r = size * 0.40;
    c.translate(cx, cy);
    c.beginPath();
    const a = r * 0.62, b = r * 0.34, t = r * 0.30;
    // chunky arrow pointing up; rotate per lane later
    c.moveTo(0, -a); c.lineTo(a * 0.82, b * 0.2); c.lineTo(a * 0.36, b * 0.2);
    c.lineTo(a * 0.36, a * 0.78); c.lineTo(-a * 0.36, a * 0.78);
    c.lineTo(-a * 0.36, b * 0.2); c.lineTo(-a * 0.82, b * 0.2); c.closePath();
    if (mode === "rec") {
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 4.5;
      c.stroke();
      c.fillStyle = "rgba(10,6,30,.35)"; c.fill();
    } else if (mode === "recPress") {
      c.fillStyle = color; c.fill();
      c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 3.5; c.stroke();
    } else {
      c.shadowColor = color; c.shadowBlur = 14;
      c.fillStyle = color; c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 3; c.stroke();
      // inner face
      c.fillStyle = "rgba(255,255,255,.28)";
      c.beginPath();
      c.moveTo(0, -a * 0.55); c.lineTo(a * 0.42, b * 0.12); c.lineTo(-a * 0.42, b * 0.12); c.closePath(); c.fill();
    }
    return cv;
  }

  const SPRITES = {};
  function initSprites() {
    const S = 74;
    for (let l = 0; l < 4; l++) {
      const rot = l * 90; // 0=up drawn; left=-90 etc. We'll rotate at draw time instead.
      SPRITES["note" + l] = makeArrowSprite(S, LANE_COLORS[l], LANE_DARK[l], "note");
      SPRITES["rec" + l] = makeArrowSprite(S, LANE_COLORS[l], null, "rec");
      SPRITES["recP" + l] = makeArrowSprite(S, LANE_COLORS[l], null, "recPress");
    }
  }

  // ---------- particles ----------
  class Particles {
    constructor() { this.list = []; }
    splash(x, y, color) {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * TAU, sp = 90 + Math.random() * 190;
        this.list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.34, t: 0, color, r: 2.5 + Math.random() * 3 });
      }
      this.list.push({ ring: true, x, y, life: 0.28, t: 0, color });
    }
    update(dt) {
      for (const p of this.list) {
        p.t += dt;
        if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
      }
      this.list = this.list.filter(p => p.t < p.life);
      if (this.list.length > 160) this.list.splice(0, this.list.length - 160);
    }
    draw(c) {
      for (const p of this.list) {
        const k = 1 - p.t / p.life;
        if (p.ring) {
          c.strokeStyle = p.color; c.globalAlpha = k * 0.8; c.lineWidth = 3;
          c.beginPath(); c.arc(p.x, p.y, 20 + (1 - k) * 46, 0, TAU); c.stroke();
        } else {
          c.fillStyle = p.color; c.globalAlpha = k;
          c.beginPath(); c.arc(p.x, p.y, p.r * k + 0.5, 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1;
    }
  }

  // ---------- turn segments ----------
  function computeTurns(data) {
    const evs = [];
    for (const [t] of data.opponent) evs.push({ t, side: 0 });
    for (const [t] of data.player) evs.push({ t, side: 1 });
    evs.sort((a, b) => a.t - b.t);
    const segs = [];
    let cur = null;
    for (const e of evs) {
      if (!cur || cur.side !== e.side) {
        if (cur) segs.push(cur);
        cur = { side: e.side, start: e.t };
      }
      cur.end = e.t;
    }
    if (cur) segs.push(cur);
    // merge tiny segments (<1.2s) into previous
    const out = [];
    for (const s of segs) {
      if (out.length && (s.end - s.start) < 1200) out[out.length - 1].end = s.end;
      else out.push({ side: s.side, start: s.start, end: s.end });
    }
    return out;
  }

  // ============================================================ Battle
  class Battle {
    constructor(data, opts) {
      this.data = data;
      this.opts = opts || {};
      this.autoplay = !!opts.autoplay;
      this.startHealth = opts.health != null ? opts.health : HEALTH.start;

      this.playerNotes = data.player.map((n, i) => ({
        i, t: n[0], dur: n[1], lane: n[2], hold: !!n[3], holdMs: n[4],
        state: 0, holding: false, heldOk: false, dropped: false, lastTick: 0,
      }));
      this.oppNotes = data.opponent.map(n => ({
        i: -1, t: n[0], dur: n[1], lane: n[2], hold: !!n[3], holdMs: n[4], state: 0, holding: false,
      }));
      this.turns = computeTurns(data);

      this.score = 0; this.combo = 0; this.maxCombo = 0;
      this.health = this.startHealth;
      this.judge = { sick: 0, good: 0, bad: 0, miss: 0 };
      this.accSum = 0; this.accCount = 0;
      this.particles = new Particles();
      this.keysDown = [false, false, false, false];
      this.recGlow = [0, 0, 0, 0];       // player receptor press glow
      this.recHit = [0, 0, 0, 0];        // hit flash
      this.recHitO = [0, 0, 0, 0];
      this.popup = null;                  // {text,color,t,ms}
      this.comboPop = 0;
      this.missFlash = 0;
      this.shake = 0;
      this.finished = false;
      this.failed = false;
      this.lastTurnSide = -1;
      this.banner = null;                 // {text,color,t}
      this.doneAt = data.lengthMs;
      this.holdTickAcc = 0;
    }

    accuracy() { return this.accCount ? this.accSum / this.accCount : 1; }

    // ---------------- judgment ----------------
    addPopup(text, color, msDiff) {
      this.popup = { text, color, t: 0, ms: msDiff };
    }

    hitNote(n, deltaMs) {
      const ad = Math.abs(deltaMs);
      let grade;
      if (ad <= WIN_SICK) grade = "sick";
      else if (ad <= WIN_GOOD) grade = "good";
      else grade = "bad";
      n.state = 1;
      this.judge[grade]++;
      this.accSum += grade === "sick" ? 1 : grade === "good" ? 0.8 : 0.35;
      this.accCount++;
      this.score += SCORE[grade];
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboPop = 1;
      this.health = Math.min(100, this.health + HEALTH[grade]);
      const colors = { sick: "#25d0ff", good: "#5cff7a", bad: "#ffb020" };
      this.addPopup(grade.toUpperCase(), colors[grade], Math.round(deltaMs));
      this.recHit[n.lane] = 1;
      if (grade !== "bad") this.particles.splash(laneX(1, n.lane), RECEPTOR_Y, LANE_COLORS[n.lane]);
      if (grade === "sick") window.AudioEngine.sfxSick();
      else if (grade === "good") window.AudioEngine.sfxGood();
      else window.AudioEngine.sfxBad();
      if (n.hold) { n.holding = true; n.heldOk = true; n.lastTick = n.t; }
      this.lastHit = { lane: n.lane, t: performance.now() };
      return grade;
    }

    missNote(n) {
      n.state = 2;
      this.judge.miss++;
      this.accCount++;
      this.score += SCORE.miss;
      this.combo = 0;
      this.health -= HEALTH.miss;
      this.addPopup("MISS", "#ff4d6a", 0);
      this.missFlash = 1;
      this.shake = Math.min(1, this.shake + 0.5);
      window.AudioEngine.sfxMiss();
    }

    press(lane) {
      if (this.autoplay) return;
      this.keysDown[lane] = true;
      this.recGlow[lane] = 1;
      const pos = window.AudioEngine.pos() * 1000;
      let best = null, bestAd = 1e9;
      for (const n of this.playerNotes) {
        if (n.state !== 0 || n.lane !== lane) continue;
        const ad = Math.abs(n.t - pos);
        if (ad <= WIN_BAD && ad < bestAd) { best = n; bestAd = ad; }
        if (n.t > pos + WIN_BAD) break;
      }
      if (best) this.hitNote(best, pos - best.t);
    }

    release(lane) {
      if (this.autoplay) return;
      this.keysDown[lane] = false;
      const pos = window.AudioEngine.pos() * 1000;
      for (const n of this.playerNotes) {
        if (n.holding && n.lane === lane) {
          const end = n.t + n.holdMs;
          if (pos < end - n.holdMs * 0.25) { // dropped early
            n.holding = false; n.dropped = true;
            this.combo = 0;
            this.health -= HEALTH.drop;
            this.addPopup("DROPPED", "#ff4d6a", 0);
          } else {
            this.finishHold(n);
          }
        }
      }
    }

    finishHold(n) {
      if (!n.holding) return;
      n.holding = false;
      n.heldOk = true;
      this.score += SCORE.holdDone;
      this.health = Math.min(100, this.health + 1.2);
    }

    // ---------------- per-frame ----------------
    update(dt, posMs, onCharSing) {
      const A = window.AudioEngine;

      // opponent autoplay
      for (const n of this.oppNotes) {
        if (n.state === 0 && posMs >= n.t) {
          n.state = 1;
          this.recHitO[n.lane] = 1;
          if (onCharSing) onCharSing(0, n.lane);
          if (n.hold) n.holding = true;
        }
        if (n.holding && posMs >= n.t + n.holdMs) n.holding = false;
      }

      // player autoplay
      if (this.autoplay) {
        for (const n of this.playerNotes) {
          if (n.state === 0 && posMs >= n.t) {
            this.hitNote(n, 0);
            if (onCharSing) onCharSing(1, n.lane);
          }
          if (n.holding && posMs >= n.t + n.holdMs) this.finishHold(n);
        }
      } else {
        // misses
        for (const n of this.playerNotes) {
          if (n.state === 0 && posMs > n.t + WIN_MISS) {
            this.missNote(n);
            if (onCharSing) onCharSing(1, n.lane, true);
          }
          // hold ticks
          if (n.holding && this.keysDown[n.lane]) {
            while (posMs - n.lastTick >= 120 && posMs <= n.t + n.holdMs) {
              n.lastTick += 120;
              this.score += SCORE.holdTick;
              this.health = Math.min(100, this.health + HEALTH.holdTick);
            }
            if (posMs >= n.t + n.holdMs) this.finishHold(n);
          } else if (n.holding && !this.keysDown[n.lane]) {
            // released without event (edge case) — treat as release
            this.release(n.lane);
          }
        }
        // char sing trigger on hit handled by caller via lastHit
      }

      // turn banner
      let seg = null;
      for (const s of this.turns) { if (posMs >= s.start - 400 && posMs <= s.end + 900) { seg = s; break; } }
      if (seg && seg.side !== this.lastTurnSide && posMs > 3000) {
        this.lastTurnSide = seg.side;
        this.banner = { text: seg.side === 1 ? "YOUR TURN — ECHO IT!" : "VEXX'S TURN", color: seg.side === 1 ? "#25d0ff" : "#ff3ec8", t: 0 };
      }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.2) this.banner = null; }

      // decay visuals
      for (let i = 0; i < 4; i++) {
        this.recGlow[i] = Math.max(0, this.recGlow[i] - dt * 5);
        this.recHit[i] = Math.max(0, this.recHit[i] - dt * 3.4);
        this.recHitO[i] = Math.max(0, this.recHitO[i] - dt * 3.4);
      }
      if (this.popup) { this.popup.t += dt; if (this.popup.t > 0.75) this.popup = null; }
      this.comboPop = Math.max(0, this.comboPop - dt * 3.2);
      this.missFlash = Math.max(0, this.missFlash - dt * 2.2);
      this.shake = Math.max(0, this.shake - dt * 2.6);
      this.particles.update(dt);

      if (!this.failed && this.health <= 0) { this.failed = true; return "fail"; }
      if (!this.finished && posMs >= this.doneAt) { this.finished = true; return "done"; }
      return null;
    }

    // ---------------- draw ----------------
    drawNote(c, lane, x, y) {
      const spr = SPRITES["note" + lane];
      c.save();
      c.translate(x, y);
      c.rotate(LANE_ROT[lane]);
      c.drawImage(spr, -spr.width / 4, -spr.height / 4, spr.width / 2, spr.height / 2);
      c.restore();
    }

    drawField(c, side, posMs, dimmed) {
      const notes = side === 0 ? this.oppNotes : this.playerNotes;
      const cx = side === 0 ? OPP_X : PLR_X;
      c.globalAlpha = dimmed ? 0.55 : 1;

      // receptors
      for (let l = 0; l < 4; l++) {
        const x = laneX(side, l);
        const glow = side === 1 ? Math.max(this.recGlow[l], this.recHit[l] * 0.8) : this.recHitO[l];
        const spr = glow > 0.05 ? SPRITES["recP" + l] : SPRITES["rec" + l];
        const pop = side === 1 ? this.recHit[l] * 5 : this.recHitO[l] * 5;
        c.save();
        c.translate(x, RECEPTOR_Y);
        if (glow > 0.05) { c.shadowColor = LANE_COLORS[l]; c.shadowBlur = 18 * glow; }
        c.scale(1 + pop * 0.012, 1 + pop * 0.012);
        c.rotate(LANE_ROT[l]);
        c.drawImage(spr, -spr.width / 4, -spr.height / 4, spr.width / 2, spr.height / 2);
        c.restore();
      }

      // notes (visible window)
      const top = RECEPTOR_Y, bot = 780;
      for (const n of notes) {
        const y = top + ((n.t - posMs) / 1000) * NOTE_SPEED;
        if (y < -80) continue;                    // scrolled past (off top)
        if (y > bot + 80) break;                  // rest are further in the future
        const x = laneX(side, n.lane);
        // hold trail
        if (n.hold && n.state !== 2) {
          const tailY = top + ((n.t + n.holdMs - posMs) / 1000) * NOTE_SPEED;
          const active = n.state === 1 && n.holding;
          if (n.state === 0 || active) {
            const yy0 = active ? top : y;
            const yy1 = Math.max(tailY, (active ? top : y) + 8);
            if (yy1 > top + 4) {
              c.fillStyle = LANE_COLORS[n.lane];
              c.globalAlpha = dimmed ? 0.35 : 0.6;
              c.beginPath(); c.roundRect(x - 11, yy0, 22, yy1 - yy0, 10); c.fill();
              c.globalAlpha = dimmed ? 0.55 : 1;
              c.fillStyle = "rgba(255,255,255,.35)";
              const inset = active ? 4 : 4;
              c.fillRect(x - 3, yy0 + inset, 6, Math.max(0, yy1 - yy0 - inset * 2));
              c.globalAlpha = dimmed ? 0.55 : 1;
            }
          }
        }
        if (n.state === 0) {
          this.drawNote(c, n.lane, x, y);
        }
      }

      c.globalAlpha = 1;
    }

    drawHUD(c, W, posMs) {
      const A = window.AudioEngine;
      // progress bar
      const prog = Math.max(0, Math.min(1, posMs / this.doneAt));
      c.fillStyle = "rgba(255,255,255,.12)";
      c.fillRect(W / 2 - 260, 14, 520, 5);
      c.fillStyle = "#25d0ff";
      c.fillRect(W / 2 - 260, 14, 520 * prog, 5);
      c.fillStyle = "rgba(255,255,255,.5)";
      c.beginPath(); c.arc(W / 2 - 260 + 520 * prog, 16.5, 4, 0, TAU); c.fill();

      // section name
      let secName = "";
      for (const s of this.data.sections) if (posMs >= s.ms) secName = s.name;
      c.font = "700 12px 'Segoe UI', sans-serif";
      c.fillStyle = "rgba(255,255,255,.4)";
      c.textAlign = "center";
      c.fillText(secName, W / 2, 34);

      // turn banner
      if (this.banner) {
        const bt = this.banner.t;
        const a = bt < 0.2 ? bt / 0.2 : bt > 1.7 ? Math.max(0, (2.2 - bt) / 0.5) : 1;
        c.save();
        c.globalAlpha = a;
        c.font = "italic 900 26px 'Segoe UI', sans-serif";
        c.fillStyle = this.banner.color;
        c.shadowColor = this.banner.color; c.shadowBlur = 16;
        const slide = bt < 0.2 ? (1 - bt / 0.2) * 30 : 0;
        c.fillText(this.banner.text, W / 2 + slide, 66);
        c.restore();
      }

      // health bar
      const hw = 470, hx = W / 2 - hw / 2, hy = 668;
      const pct = Math.max(0, Math.min(1, this.health / 100));
      c.fillStyle = "rgba(0,0,0,.5)";
      c.beginPath(); c.roundRect(hx - 3, hy - 3, hw + 6, 22, 11); c.fill();
      // opponent side (left, red) = 1-pct ; player (right, green)
      c.fillStyle = "#ff3b5c";
      c.beginPath(); c.roundRect(hx, hy, hw * (1 - pct), 16, 8); c.fill();
      c.fillStyle = "#3bff7c";
      c.beginPath(); c.roundRect(hx + hw * (1 - pct), hy, hw * pct, 16, 8); c.fill();
      c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 2;
      c.beginPath(); c.roundRect(hx - 3, hy - 3, hw + 6, 22, 11); c.stroke();
      // divider notch
      c.fillStyle = "#fff";
      c.fillRect(hx + hw * (1 - pct) - 1.5, hy - 5, 3, 26);
      // icons
      this.drawIcon(c, hx - 34, hy + 8, "vexx", pct < 0.5);
      this.drawIcon(c, hx + hw + 34, hy + 8, "kaz", pct >= 0.5);

      // score line
      c.font = "700 15px 'Segoe UI', sans-serif";
      c.fillStyle = "rgba(255,255,255,.85)";
      c.textAlign = "center";
      const accStr = this.accCount ? (this.accuracy() * 100).toFixed(1) + "%" : "100.0%";
      c.fillText(
        `SCORE ${this.score}   ·   ACC ${accStr}   ·   MISS ${this.judge.miss}`,
        W / 2, hy + 38
      );

      // combo
      if (this.combo >= 5) {
        c.save();
        c.translate(W / 2, 560);
        const pop = 1 + this.comboPop * 0.22;
        c.scale(pop, pop);
        c.font = "italic 900 44px 'Arial Black', sans-serif";
        c.textAlign = "center";
        c.fillStyle = this.combo >= 100 ? "#ffd23f" : "rgba(255,255,255,.9)";
        c.shadowColor = this.combo >= 100 ? "#ffb020" : "rgba(138,92,255,.8)";
        c.shadowBlur = 14;
        c.fillText(`${this.combo}`, 0, 0);
        c.font = "700 13px 'Segoe UI', sans-serif";
        c.fillStyle = "rgba(255,255,255,.6)";
        c.shadowBlur = 0;
        c.fillText("COMBO", 0, 18);
        c.restore();
      }

      // judgment popup (player side)
      if (this.popup) {
        const p = this.popup;
        const k = p.t / 0.75;
        const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6)) / 0.4;
        const rise = -k * 26;
        c.save();
        c.globalAlpha = Math.max(0, a);
        c.translate(PLR_X, 300 + rise);
        c.font = "italic 900 34px 'Arial Black', sans-serif";
        c.textAlign = "center";
        c.fillStyle = p.color;
        c.shadowColor = p.color; c.shadowBlur = 14;
        c.fillText(p.text, 0, 0);
        if (p.ms !== 0 && p.text !== "MISS" && p.text !== "DROPPED") {
          c.font = "700 12px 'Segoe UI', sans-serif";
          c.fillStyle = "rgba(255,255,255,.7)";
          c.shadowBlur = 0;
          c.fillText(p.ms > 0 ? `+${p.ms}ms late` : `${-p.ms}ms early`, 0, 18);
        }
        c.restore();
      }

      // miss vignette
      if (this.missFlash > 0) {
        const v = c.createRadialGradient(W / 2, 360, 240, W / 2, 360, 720);
        v.addColorStop(0, "rgba(255,30,60,0)");
        v.addColorStop(1, `rgba(255,30,60,${0.28 * this.missFlash})`);
        c.fillStyle = v; c.fillRect(0, 0, W, 720);
      }
    }

    drawIcon(c, x, y, who, winning) {
      c.save();
      c.translate(x, y);
      c.scale(winning ? 1.15 : 0.92, winning ? 1.15 : 0.92);
      c.fillStyle = "rgba(0,0,0,.55)";
      c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.fill();
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.stroke();
      if (who === "kaz") {
        c.fillStyle = "#2ee6a8"; c.beginPath(); c.arc(0, -7, 10, Math.PI, 0); c.fill(); // beanie
        c.fillStyle = "#a86a3f"; c.beginPath(); c.roundRect(-9, -7, 18, 16, 6); c.fill();
        c.fillStyle = "#1d1206";
        c.fillRect(-6, -1, 3, 3); c.fillRect(3, -1, 3, 3);
        c.strokeStyle = "#1d1206"; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-4, 6); c.quadraticCurveTo(0, 8, 4, 6); c.stroke();
        c.fillStyle = "#ffd23f"; c.beginPath(); c.arc(-11, 1, 4, 0, TAU); c.fill();
        c.beginPath(); c.arc(11, 1, 4, 0, TAU); c.fill();
      } else {
        c.fillStyle = "#262640"; c.beginPath(); c.roundRect(-11, -12, 22, 24, 7); c.fill();
        c.fillStyle = "#0c0c18"; c.beginPath(); c.roundRect(-9, -7, 18, 11, 4); c.fill();
        c.fillStyle = winning ? "#ff3ec8" : "#666";
        c.fillRect(-6, -4, 4, 3); c.fillRect(2, -4, 4, 3);
        c.fillStyle = "#7a3cff"; c.beginPath(); c.arc(8, -14, 2.5, 0, TAU); c.fill();
      }
      c.restore();
    }
  }

  window.BattleGame = {
    Battle, initSprites, Particles,
    consts: { LANE_COLORS, OPP_X, PLR_X, LANE_GAP, RECEPTOR_Y, NOTE_SPEED, LANE_NAMES },
  };
})();
