/* Original characters: KAZ (player) & VEXX (opponent) — procedural vector art.
   Each has directional sing poses, idle bob synced to beat, miss reactions. */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  function limb(c, x, y, a1, l1, a2, l2, w, col, handCol, handR) {
    const ex = x + Math.cos(a1) * l1, ey = y + Math.sin(a1) * l1;
    const hx = ex + Math.cos(a1 + a2) * l2, hy = ey + Math.sin(a1 + a2) * l2;
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round";
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
    if (handCol) {
      c.fillStyle = handCol;
      c.beginPath(); c.arc(hx, hy, handR || w * 0.62, 0, TAU); c.fill();
    }
    return [hx, hy];
  }

  // pose param table: [lean, bodyY, headTilt, Ls, Le, Rs, Re, mouth]
  // angles: 0 = down(+y), positive = toward facing dir
  const POSES = {
    idle:  { lean: 0.00, bodyY: 0, head: 0.00, Ls: 2.55, Le: 0.55, Rs: 0.60, Re: -0.55, mouth: 0 },
    left:  { lean: -0.16, bodyY: 6, head: -0.18, Ls: 2.95, Le: -1.15, Rs: 0.85, Re: -0.9, mouth: 1 },
    down:  { lean: 0.05, bodyY: 16, head: 0.30, Ls: 2.2, Le: -0.35, Rs: 0.95, Re: 0.35, mouth: 1 },
    up:    { lean: -0.04, bodyY: -14, head: -0.26, Ls: 3.55, Le: -0.25, Rs: 2.75, Re: 0.25, mouth: 1 },
    right: { lean: 0.16, bodyY: 6, head: 0.18, Ls: 2.35, Le: 0.9, Rs: 0.25, Re: 1.15, mouth: 1 },
    miss:  { lean: 0.14, bodyY: 14, head: 0.34, Ls: 2.1, Le: 0.15, Rs: 1.05, Re: -0.15, mouth: 2 },
  };

  class Char {
    constructor(kind, facing) {
      this.kind = kind;           // 'kaz' | 'vexx'
      this.facing = facing;       // 1 faces right, -1 faces left
      this.pose = "idle";
      this.cur = Object.assign({}, POSES.idle);
      this.singT = 0;
      this.mouthPhase = Math.random() * 10;
      this.blinkT = 2 + Math.random() * 3;
      this.blink = 0;
      this.beatPulse = 0;
    }

    trigger(pose) {
      if (pose === "miss") { this.pose = "miss"; this.singT = 0.55; return; }
      this.pose = pose; this.singT = 0.34;
    }

    update(dt, beatPulse) {
      this.singT = Math.max(0, this.singT - dt);
      if (this.singT <= 0) this.pose = "idle";
      const tgt = POSES[this.pose] || POSES.idle;
      const k = Math.min(1, dt * 14);
      for (const key of ["lean", "bodyY", "head", "Ls", "Le", "Rs", "Re", "mouth"]) {
        let t = tgt[key];
        if (key === "mouth" && this.pose !== "miss" && this.singT > 0) {
          t = 0.55 + 0.45 * Math.sin(this.mouthPhase + performance.now() * 0.021);
        }
        this.cur[key] = lerp(this.cur[key], t, k);
      }
      this.beatPulse = beatPulse;
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = 2 + Math.random() * 3.5; }
      this.blink = Math.max(0, this.blink - dt);
    }

    draw(c, x, footY, scale) {
      c.save();
      c.translate(x, footY);
      c.scale(scale * this.facing, scale);
      const p = this.cur;
      const bob = -3 + Math.sin(this.beatPulse * Math.PI) * 3;
      const bodyY = p.bodyY + bob;
      if (this.kind === "kaz") this.drawKaz(c, p, bodyY);
      else this.drawVexx(c, p, bodyY);
      c.restore();
    }

    /* ---------------- KAZ : orange hoodie, teal beanie, yellow phones ---------------- */
    drawKaz(c, p, bodyY) {
      const SKIN = "#a86a3f", SKIN_D = "#8f5732";
      const HOOD = "#ff6b35", HOOD_D = "#d9531f";
      const PANT = "#2a2f55", SHOE_W = "#f2f2f2", SHOE_O = "#ff8c1a";
      const BEANIE = "#2ee6a8", PHONES = "#ffd23f";

      const hipY = bodyY - 108;
      // shadow
      c.fillStyle = "rgba(0,0,0,.35)";
      c.beginPath(); c.ellipse(0, 2, 52, 9, 0, 0, TAU); c.fill();

      // legs
      c.strokeStyle = PANT; c.lineWidth = 17; c.lineCap = "round";
      const stance = 14 + p.lean * 30;
      c.beginPath(); c.moveTo(-6, hipY); c.lineTo(-stance, -14); c.stroke();
      c.beginPath(); c.moveTo(6, hipY); c.lineTo(stance + 4, -14); c.stroke();
      // sneakers
      for (const s of [-1, 1]) {
        const sx = s < 0 ? -stance : stance + 4;
        c.fillStyle = SHOE_W;
        c.beginPath(); c.roundRect(sx - 14, -12, 30, 13, 6); c.fill();
        c.fillStyle = SHOE_O;
        c.beginPath(); c.roundRect(sx - 14, -5, 30, 6, 3); c.fill();
      }

      // torso (lean rotates around hips)
      c.save();
      c.translate(0, hipY);
      c.rotate(p.lean);
      const ty = -58; // torso top relative to hips
      c.fillStyle = HOOD;
      c.beginPath(); c.roundRect(-24, ty, 48, 66, 16); c.fill();
      // hood bunched + pocket
      c.fillStyle = HOOD_D;
      c.beginPath(); c.roundRect(-22, ty + 2, 44, 14, 8); c.fill();
      c.strokeStyle = HOOD_D; c.lineWidth = 3;
      c.beginPath(); c.roundRect(-14, ty + 34, 26, 16, 6); c.stroke();
      // drawstrings
      c.strokeStyle = "#ffe3b3"; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-6, ty + 14); c.lineTo(-8, ty + 30); c.stroke();
      c.beginPath(); c.moveTo(6, ty + 14); c.lineTo(8, ty + 28); c.stroke();

      // arms (shoulders at torso top sides) — drawn behind/front
      const shY = ty + 16;
      const armW = 13;
      // far arm (right side of body, drawn first)
      limb(c, 14, shY, p.Rs, 26, p.Re, 24, armW, HOOD_D, SKIN_D, 8);
      // near arm
      limb(c, -14, shY, p.Ls, 26, p.Le, 24, armW, HOOD, SKIN, 8.5);

      // head
      c.save();
      c.translate(2, ty - 26);
      c.rotate(p.head);
      // neck
      c.fillStyle = SKIN_D; c.fillRect(-7, 12, 14, 12);
      // face
      c.fillStyle = SKIN;
      c.beginPath(); c.roundRect(-20, -22, 40, 40, 14); c.fill();
      // beanie
      c.fillStyle = BEANIE;
      c.beginPath(); c.roundRect(-21, -34, 42, 24, [16, 16, 6, 6]); c.fill();
      c.fillStyle = "#24c48e";
      c.beginPath(); c.roundRect(-21, -18, 42, 8, 4); c.fill();
      // beanie pom
      c.fillStyle = BEANIE;
      c.beginPath(); c.arc(-14, -36, 6, 0, TAU); c.fill();
      // fringe spikes
      c.fillStyle = "#241a12";
      for (let i = 0; i < 4; i++) {
        const fx = -16 + i * 9;
        c.beginPath(); c.moveTo(fx, -14); c.lineTo(fx + 4, -6 - (i % 2) * 3); c.lineTo(fx + 8, -14); c.fill();
      }
      // eyes
      c.fillStyle = "#1d1206";
      if (p.mouth > 1.5) { // miss: >< eyes
        c.lineWidth = 2.6; c.strokeStyle = "#1d1206";
        for (const ex of [-9, 9]) {
          c.beginPath();
          c.moveTo(ex - 4, -2); c.lineTo(ex + 4, 4); c.moveTo(ex + 4, -2); c.lineTo(ex - 4, 4);
          c.stroke();
        }
        // sweat drop
        c.fillStyle = "#9adcff";
        c.beginPath(); c.ellipse(16, 2, 3, 5, 0.4, 0, TAU); c.fill();
      } else if (this.blink > 0) {
        c.lineWidth = 2.4; c.strokeStyle = "#1d1206";
        c.beginPath(); c.moveTo(-12, 1); c.lineTo(-6, 1); c.moveTo(6, 1); c.lineTo(12, 1); c.stroke();
      } else {
        c.beginPath(); c.ellipse(-8, 0, 2.6, 3.4, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(9, 0, 2.6, 3.4, 0, 0, TAU); c.fill();
        // brows (expressive when singing)
        c.lineWidth = 2.4; c.strokeStyle = "#241a12";
        const browLift = p.mouth > 0.3 ? -3 : 0;
        c.beginPath(); c.moveTo(-12, -7 + browLift * 0.5); c.lineTo(-4, -9 + browLift); c.stroke();
        c.beginPath(); c.moveTo(5, -9 + browLift); c.lineTo(13, -7 + browLift * 0.5); c.stroke();
      }
      // mouth
      if (p.mouth > 1.5) {
        c.strokeStyle = "#1d1206"; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-6, 11); c.quadraticCurveTo(0, 8, 6, 11); c.stroke();
      } else if (p.mouth > 0.15) {
        c.fillStyle = "#4a1f14";
        c.beginPath(); c.ellipse(1, 11, 5 + p.mouth * 3, 3 + p.mouth * 5, 0, 0, TAU); c.fill();
        c.fillStyle = "#ff8fa0";
        c.beginPath(); c.ellipse(1, 13 + p.mouth * 2, 3, 1.6, 0, 0, TAU); c.fill();
      } else {
        c.strokeStyle = "#1d1206"; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(-3, 11); c.quadraticCurveTo(2, 13.5, 7, 10.5); c.stroke();
      }
      // headphones
      c.strokeStyle = PHONES; c.lineWidth = 4.5;
      c.beginPath(); c.arc(0, -12, 23, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.fillStyle = PHONES;
      c.beginPath(); c.roundRect(-27, -12, 10, 16, 5); c.fill();
      c.fillStyle = "#e8b400";
      c.beginPath(); c.roundRect(17, -12, 10, 16, 5); c.fill();
      c.restore(); // head

      c.restore(); // torso
    }

    /* ---------------- VEXX : gunmetal robot, magenta visor, hover jets ---------------- */
    drawVexx(c, p, bodyY) {
      const BODY = "#262640", BODY_D = "#1a1a2e", PANEL = "#33335a";
      const ACC = "#7a3cff", VISOR = "#ff3ec8", CORE = "#00e5ff";
      const JET = "#8af4ff";

      const hipY = bodyY - 104;
      // ground glow + shadow
      c.fillStyle = "rgba(0,0,0,.35)";
      c.beginPath(); c.ellipse(0, 2, 48, 8, 0, 0, TAU); c.fill();
      const jetFlick = 0.6 + 0.4 * Math.sin(performance.now() * 0.03 + this.mouthPhase);
      c.fillStyle = `rgba(140,244,255,${0.25 * jetFlick})`;
      c.beginPath(); c.ellipse(0, -2, 34, 7, 0, 0, TAU); c.fill();

      // legs (slim, reverse-joint)
      const legW = 11;
      const stance = 13 + p.lean * 26;
      for (const s of [-1, 1]) {
        const sx = s * 8;
        const fx = s < 0 ? -stance : stance + 2;
        c.strokeStyle = BODY_D; c.lineWidth = legW; c.lineCap = "round";
        c.beginPath(); c.moveTo(sx, hipY); c.lineTo(sx + s * 4, hipY * 0.45); c.stroke();
        c.strokeStyle = BODY;
        c.beginPath(); c.moveTo(sx + s * 4, hipY * 0.45); c.lineTo(fx, -16); c.stroke();
        // hover foot
        c.fillStyle = PANEL;
        c.beginPath(); c.roundRect(fx - 11, -18, 24, 9, 4.5); c.fill();
        c.fillStyle = `rgba(138,244,255,${0.5 + 0.3 * jetFlick})`;
        c.beginPath(); c.ellipse(fx + 1, -14, 8 * jetFlick, 2.6, 0, 0, TAU); c.fill();
      }

      // torso
      c.save();
      c.translate(0, hipY);
      c.rotate(p.lean);
      const ty = -62;
      c.fillStyle = BODY;
      c.beginPath(); c.moveTo(-22, ty + 10); c.lineTo(22, ty + 6); c.lineTo(26, ty + 48);
      c.lineTo(14, ty + 64); c.lineTo(-18, ty + 64); c.lineTo(-26, ty + 44); c.closePath(); c.fill();
      // chest core
      const pulse = 0.7 + 0.3 * this.beatPulse;
      c.fillStyle = `rgba(0,229,255,${0.25 * pulse})`;
      c.beginPath(); c.arc(0, ty + 34, 13 + 4 * pulse, 0, TAU); c.fill();
      c.fillStyle = CORE;
      c.beginPath(); c.arc(0, ty + 34, 6.5, 0, TAU); c.fill();
      // panel lines
      c.strokeStyle = ACC; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-20, ty + 14); c.lineTo(18, ty + 11); c.stroke();
      c.beginPath(); c.moveTo(-22, ty + 52); c.lineTo(20, ty + 52); c.stroke();

      // floating shoulder pauldrons + arms
      const floatY = Math.sin(performance.now() * 0.004 + this.mouthPhase) * 2.5;
      const shY = ty + 12;
      // far arm
      c.fillStyle = BODY_D;
      c.beginPath(); c.roundRect(12, shY - 10 + floatY * 0.5, 18, 14, 6); c.fill();
      limb(c, 21, shY + floatY * 0.5, p.Rs, 25, p.Re, 22, 10, BODY_D, PANEL, 7);
      // near pauldron + arm
      c.fillStyle = ACC;
      c.beginPath(); c.roundRect(-30, shY - 12 + floatY, 20, 16, 7); c.fill();
      c.fillStyle = PANEL;
      c.beginPath(); c.roundRect(-27, shY - 9 + floatY, 13, 9, 4); c.fill();
      limb(c, -21, shY + 2 + floatY, p.Ls, 25, p.Le, 22, 11, BODY, "#3d3d6b", 7.5);

      // head
      c.save();
      c.translate(2, ty - 24);
      c.rotate(p.head);
      // neck
      c.fillStyle = BODY_D; c.fillRect(-6, 10, 12, 12);
      // helmet
      c.fillStyle = BODY;
      c.beginPath(); c.roundRect(-19, -26, 38, 38, 12); c.fill();
      c.fillStyle = PANEL;
      c.beginPath(); c.roundRect(-19, -26, 38, 10, [12, 12, 0, 0]); c.fill();
      // antenna
      c.strokeStyle = PANEL; c.lineWidth = 3;
      c.beginPath(); c.moveTo(10, -26); c.lineTo(14, -40); c.stroke();
      const tip = 0.5 + 0.5 * this.beatPulse;
      c.fillStyle = `rgba(255,62,200,${0.4 + 0.6 * tip})`;
      c.beginPath(); c.arc(14, -42, 3.4 + 1.6 * tip, 0, TAU); c.fill();
      // visor
      c.fillStyle = "#0c0c18";
      c.beginPath(); c.roundRect(-16, -14, 32, 18, 8); c.fill();
      c.fillStyle = VISOR;
      const glow = `rgba(255,62,200,${0.35 + 0.25 * Math.sin(performance.now() * 0.006)})`;
      // eyes per pose
      c.save();
      c.shadowColor = VISOR; c.shadowBlur = 8;
      if (p.mouth > 1.5) { // miss: X X
        c.strokeStyle = VISOR; c.lineWidth = 3; c.lineCap = "round";
        for (const ex of [-8, 8]) {
          c.beginPath();
          c.moveTo(ex - 4, -9); c.lineTo(ex + 4, -1); c.moveTo(ex + 4, -9); c.lineTo(ex - 4, -1);
          c.stroke();
        }
      } else if (this.pose === "left") {
        c.beginPath(); c.moveTo(-13, -5); c.lineTo(-3, -9); c.lineTo(-3, -1); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(3, -9); c.lineTo(13, -5); c.lineTo(3, -1); c.closePath(); c.fill();
      } else if (this.pose === "right") {
        c.beginPath(); c.moveTo(-3, -9); c.lineTo(-13, -5); c.lineTo(-3, -1); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(13, -9); c.lineTo(3, -5); c.lineTo(13, -1); c.closePath(); c.fill();
      } else if (this.pose === "up") {
        for (const ex of [-8, 8]) {
          c.beginPath(); c.moveTo(ex - 5, -2); c.lineTo(ex, -10); c.lineTo(ex + 5, -2); c.closePath(); c.fill();
        }
      } else if (this.pose === "down") {
        for (const ex of [-8, 8]) {
          c.beginPath(); c.moveTo(ex - 5, -9); c.lineTo(ex + 5, -9); c.lineTo(ex, -1); c.closePath(); c.fill();
        }
      } else {
        c.beginPath(); c.roundRect(-12, -7, 9, 3.4, 2); c.fill();
        c.beginPath(); c.roundRect(3, -7, 9, 3.4, 2); c.fill();
      }
      c.restore();
      // mouth: equalizer bars while singing
      if (p.mouth > 0.15 && p.mouth <= 1.5) {
        for (let i = 0; i < 4; i++) {
          const h = 2 + 5 * Math.abs(Math.sin(performance.now() * 0.012 + i * 1.7)) * p.mouth;
          c.fillStyle = i % 2 ? ACC : VISOR;
          c.fillRect(-7 + i * 4, 8 - h, 2.6, h);
        }
      } else if (p.mouth > 1.5) {
        c.strokeStyle = VISOR; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-7, 8); c.quadraticCurveTo(0, 4, 7, 8); c.stroke();
      } else {
        c.fillStyle = PANEL;
        c.beginPath(); c.roundRect(-6, 7, 12, 3, 1.5); c.fill();
      }
      c.restore(); // head
      c.restore(); // torso
    }
  }

  window.GameChars = { Char };
})();
