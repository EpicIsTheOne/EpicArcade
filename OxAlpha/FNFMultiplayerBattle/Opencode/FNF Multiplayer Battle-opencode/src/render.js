import { BEAT } from "./music.js";

export const LANES = 4;
export const LANE_COLORS = ["#a78bfa", "#38bdf8", "#a3e635", "#fb7185"];
const LANE_ROT = [Math.PI, Math.PI / 2, -Math.PI / 2, 0];

function mkArrow(size, color, glow, filled) {
  const c = document.createElement("canvas");
  const pad = glow ? size * 0.55 : size * 0.12;
  c.width = c.height = size + pad * 2;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2);
  if (glow) {
    g.shadowColor = color;
    g.shadowBlur = size * 0.5;
  }
  g.lineWidth = Math.max(3, size * 0.11);
  g.lineJoin = "round";
  const r = size * 0.46;
  const drawArrow = () => {
    g.beginPath();
    g.moveTo(r * 0.95, 0);
    g.lineTo(r * 0.18, 0);
    g.moveTo(r * 0.5, -r * 0.34);
    g.lineTo(r * 0.95, 0);
    g.lineTo(r * 0.5, r * 0.34);
    g.strokeStyle = filled ? "#ffffff" : color;
    g.lineWidth = Math.max(3, size * 0.13);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    g.strokeStyle = color;
    g.globalAlpha = filled ? 1 : 0.85;
    g.stroke();
    g.globalAlpha = 1;
  };
  drawArrow();
  return c;
}

export class Renderer {
  constructor() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.sprites = {};
    this.sparks = [];
    this.pops = [];
    this.rings = [];
    this.chars = {
      me: { singT: 0, lane: -1, missT: 0, bounce: 0 },
      op: { singT: 0, lane: -1, missT: 0, bounce: 0 },
    };
    this.beatPulse = 0;
    this.lastBeatIdx = -1;
    this.flash = 0;
    this.time = 0;
    this.buildSprites(64);
  }
  buildSprites(size) {
    for (let i = 0; i < LANES; i++) {
      const col = LANE_COLORS[i];
      this.sprites["n" + i] = mkArrow(size, col, true, true);
      this.sprites["r" + i] = mkArrow(size, "#5b567f", false, false);
      this.sprites["rp" + i] = mkArrow(size, col, true, false);
    }
    this.spriteSize = size;
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.w = w;
    this.h = h;
  }
  layout() {
    const w = this.w, h = this.h;
    const s = Math.min(w / 1500, h / 850);
    return {
      s,
      opX: w * 0.245,
      plX: w * 0.765,
      opRecY: h * 0.27,
      plRecY: h * 0.63,
      laneGap: Math.max(46, 74 * s),
      noteR: Math.max(20, 30 * s),
      meterY: h * 0.9,
      meterW: Math.min(w * 0.4, 560),
    };
  }
  reset() {
    this.sparks.length = 0;
    this.pops.length = 0;
    this.rings.length = 0;
    for (const k of ["me", "op"]) Object.assign(this.chars[k], { singT: 0, lane: -1, missT: 0 });
    this.lastBeatIdx = -1;
  }
  charSing(who, lane, dur) {
    const c = this.chars[who];
    c.singT = Math.max(c.singT, dur);
    c.lane = lane;
    c.bounce = 1;
  }
  charMiss(who) {
    this.chars[who].missT = 0.4;
  }
  spark(x, y, color, n = 8, power = 1) {
    if (this.sparks.length > 260) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (90 + Math.random() * 240) * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.32 + Math.random() * 0.2, t: 0, color });
    }
  }
  pop(x, y, text, kind) {
    if (this.pops.length > 8) this.pops.shift();
    this.pops.push({ x, y, text, kind, t: 0 });
  }
  addRing(x, y, color) {
    if (this.rings.length > 14) this.rings.shift();
    this.rings.push({ x, y, color, t: 0 });
  }
  update(dt, pos, bpmActive) {
    this.time += dt;
    if (pos > -1 && bpmActive) {
      const bi = Math.floor(pos / BEAT);
      if (bi !== this.lastBeatIdx && bi >= 0) {
        this.lastBeatIdx = bi;
        this.beatPulse = 1;
        if (bi % 4 === 0) this.flash = Math.max(this.flash, 0.5);
      }
    }
    this.beatPulse *= Math.pow(0.0018, dt);
    this.flash *= Math.pow(0.0009, dt);
    for (const k of ["me", "op"]) {
      const c = this.chars[k];
      if (c.singT > 0) c.singT -= dt;
      if (c.missT > 0) c.missT -= dt;
      c.bounce *= Math.pow(0.004, dt);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.t += dt;
      if (p.t >= p.life) { this.sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 700 * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t > 0.6) this.pops.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t > 0.7) this.rings.splice(i, 1);
    }
  }
  draw(st) {
    const { ctx } = this;
    const L = this.layout();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawStage(st, L);
    this.drawChars(st, L);
    if (st.mode === "play") {
      this.drawStrums(L, st, true);
      this.drawStrums(L, st, false);
      this.drawMeter(L, st);
      this.drawTexts(L, st);
    }
    this.drawParticles();
    if (st.countdownText) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = `italic 900 ${Math.floor(this.h * 0.13)}px "Segoe UI",sans-serif`;
      ctx.shadowColor = "rgba(255,209,102,.8)";
      ctx.shadowBlur = 40;
      ctx.fillStyle = st.countdownColor || "#ffd166";
      ctx.fillText(st.countdownText, this.w / 2, this.h * 0.44);
      ctx.restore();
    }
    if (this.flash > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.06})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }
  sectionMood(pos, sections) {
    let mood = { hue: 250, inten: 0.35, name: "" };
    if (!sections) return mood;
    const ids = Object.keys(sections);
    let cur = null;
    for (const id of ids) {
      if (pos >= sections[id].t) cur = id;
    }
    if (cur === null) return mood;
    switch (cur) {
      case "intro": return { hue: 255, inten: 0.3, name: cur };
      case "verseA": return { hue: 195, inten: 0.55, name: cur };
      case "verseB": return { hue: 320, inten: 0.55, name: cur };
      case "chorus": return { hue: 265, inten: 0.85, name: cur };
      case "bridge": return { hue: 280, inten: 0.28, name: cur };
      case "chorus2": return { hue: 350, inten: 1, name: cur };
      case "outro": return { hue: 210, inten: 0.4, name: cur };
    }
    return mood;
  }
  drawStage(st, L) {
    const ctx = this.ctx;
    const { w, h } = this;
    const mood = this.sectionMood(st.pos, st.sections);
    const bp = this.beatPulse;
    const grad = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, Math.max(w, h) * 0.75);
    grad.addColorStop(0, `hsla(${mood.hue},70%,${16 + mood.inten * 10 + bp * 4}%,1)`);
    grad.addColorStop(0.55, `hsla(${mood.hue + 15},60%,${8 + mood.inten * 4}%,1)`);
    grad.addColorStop(1, "#050409");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.5 + bp * 0.3;
    const ringC = `hsla(${mood.hue},80%,60%,${0.10 + mood.inten * 0.12})`;
    for (let i = 0; i < 3; i++) {
      const rr = Math.max(0.1, ((this.time * 40 + i * 220) % 660) * L.s + bp * 30 * L.s);
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.52, rr, 0, Math.PI * 2);
      ctx.strokeStyle = ringC;
      ctx.lineWidth = 2 + bp * 3;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16 + bp * 0.1;
    ctx.fillStyle = `hsl(${mood.hue},80%,62%)`;
    const beamN = 5;
    for (let i = 0; i < beamN; i++) {
      const bx = w * (0.08 + i * 0.21) + Math.sin(this.time * 0.3 + i * 1.7) * 40;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 90 * L.s, 0);
      ctx.lineTo(bx + 240 * L.s, h);
      ctx.lineTo(bx + 40 * L.s, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const fy = h * 0.88;
    ctx.strokeStyle = `hsla(${mood.hue},60%,50%,${0.12 + bp * 0.08})`;
    ctx.lineWidth = 1.5;
    const vp = { x: w / 2, y: h * 0.5 };
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(vp.x + i * 130 * L.s, fy);
      ctx.lineTo(vp.x + i * 520 * L.s, h + 60);
      ctx.stroke();
    }
    for (let i = 1; i <= 5; i++) {
      const yy = fy + Math.pow(i / 5, 1.8) * (h - fy) * 1.3;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const [cx, who] of [[L.opX - 190 * L.s, "op"], [L.plX + 190 * L.s, "me"]]) {
      const sp = 1 + bp * 0.06;
      const sw = 110 * L.s * sp, sh = 140 * L.s * sp;
      const accent = who === "me" ? "#22d3ee" : "#f472b6";
      ctx.save();
      ctx.fillStyle = "#0d0a1c";
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(cx - sw / 2, fy - sh, sw, sh, 10);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.5 + bp * 0.4;
      ctx.beginPath();
      ctx.arc(cx - sw * 0.22, fy - sh * 0.55, 9 * L.s, 0, Math.PI * 2);
      ctx.arc(cx + sw * 0.22, fy - sh * 0.55, 9 * L.s, 0, Math.PI * 2);
      ctx.arc(cx, fy - sh * 0.28, 12 * L.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const parts = st.particles;
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * w, p.y * h, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }
  capsule(ctx, x, y, ang, len, wid, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-wid / 2, 0, wid, len, wid / 2);
    ctx.fill();
    ctx.restore();
  }
  drawChar(ctx, cx, feetY, sc, ch, pal, facing, beatPh, intensity) {
    const bounce = Math.max(0, ch.bounce);
    const idleBob = (Math.sin(this.time * 2.2 + (facing > 0 ? 0 : 2)) * 0.5 + 0.5);
    const sq = 1 + bounce * 0.09 + (beatPh >= 0 ? Math.max(0, 1 - (beatPh % 1) * 3.2) : 0) * 0.03;
    const crouchBase = ch.lane === 1 && ch.singT > 0 ? 14 * sc : 0;
    const shake = ch.missT > 0 ? Math.sin(ch.missT * 60) * 6 * sc : 0;
    ctx.save();
    ctx.translate(cx + shake, feetY);
    ctx.scale(facing * sc, sc);
    const bodyY = -170 + idleBob * 6 - crouchBase;
    ctx.scale(1 / sq, sq);

    const legSwing = Math.sin(this.time * 3 + (facing > 0 ? 0 : 1)) * 4;
    this.capsule(ctx, -16, bodyY + 66, 0.12 + legSwing * 0.01, 84, 26, pal.pants);
    this.capsule(ctx, 18, bodyY + 66, -0.1 - legSwing * 0.01, 88, 26, pal.pants);
    ctx.fillStyle = pal.shoe;
    ctx.beginPath();
    ctx.roundRect(-34, bodyY + 146, 40, 18, 8);
    ctx.roundRect(6, bodyY + 150, 40, 18, 8);
    ctx.fill();

    ctx.fillStyle = pal.coat;
    ctx.beginPath();
    ctx.moveTo(-34, bodyY + 74);
    ctx.quadraticCurveTo(-46, bodyY + 10, -30, bodyY - 6);
    ctx.lineTo(30, bodyY - 6);
    ctx.quadraticCurveTo(46, bodyY + 10, 34, bodyY + 74);
    ctx.quadraticCurveTo(0, bodyY + 88, -34, bodyY + 74);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-8, bodyY - 4, 7, 76);

    const laneAng = { 0: [-2.5, -2.2], 1: [-2.9, 2.9], 2: [-2.2, -2.5], 3: [-0.5, 0.35] };
    const singing = ch.singT > 0;
    let la = -0.35 + idleBob * 0.14, ra = 0.35 - idleBob * 0.14;
    let armLen = 62;
    if (singing && ch.lane in laneAng) {
      const [a, b] = laneAng[ch.lane];
      la = a; ra = b;
      armLen = ch.lane === 3 || ch.lane === 0 ? 82 : 68;
    }
    this.capsule(ctx, -30, bodyY + 8, la, armLen, 20, pal.coat);
    this.capsule(ctx, 30, bodyY + 8, ra, armLen, 20, pal.coat);
    ctx.fillStyle = pal.glove;
    const handPos = (ang, ox, ln) => [ox + Math.sin(ang + Math.PI / 2) * ln * 0 + Math.cos(ang) * 0, 0];
    for (const [ax, aa, aln] of [[-30, la, armLen], [30, ra, armLen]]) {
      const hx = ax + Math.sin(aa) * aln;
      const hy = bodyY + 8 + Math.cos(aa) * aln;
      ctx.beginPath();
      ctx.arc(hx, hy, 11, 0, Math.PI * 2);
      ctx.fill();
    }

    const headR = 40;
    const headY = bodyY - 26 + (ch.lane === 1 && singing ? 6 : ch.lane === 2 && singing ? -10 : 0);
    const headX = singing && ch.lane === 0 ? -10 : singing && ch.lane === 3 ? 8 : 0;
    ctx.fillStyle = pal.skin;
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    pal.hair(ctx, headX, headY, headR, this.time, singing);

    if (pal.visor) {
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.roundRect(headX - 26, headY - 12, 52, 15, 7);
      ctx.fill();
      ctx.fillStyle = "#04060f";
      ctx.fillRect(headX + (ch.missT > 0 ? -2 : 4), headY - 9, 8, 9);
    } else {
      ctx.fillStyle = "#101";
      if (ch.missT > 0) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#101";
        for (const ex of [-16, 14]) {
          ctx.beginPath();
          ctx.moveTo(headX + ex - 6, headY - 12);
          ctx.lineTo(headX + ex + 6, headY - 2);
          ctx.moveTo(headX + ex + 6, headY - 12);
          ctx.lineTo(headX + ex - 6, headY - 2);
          ctx.stroke();
        }
      } else {
        for (const ex of [-15, 14]) {
          ctx.beginPath();
          ctx.ellipse(headX + ex, headY - 8, 5.5, singing ? 7 : 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const mo = singing ? 12 : Math.abs(Math.sin(this.time * 1.4)) * 3 + 1;
    ctx.fillStyle = pal.mouth;
    ctx.beginPath();
    ctx.ellipse(headX + 4, headY + 14, singing ? 11 : 7, mo, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ch.missT > 0) {
      ctx.globalAlpha = ch.missT * 1.6;
      ctx.fillStyle = "#ff3b3b";
      ctx.beginPath();
      ctx.arc(headX, headY, headR + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  drawChars(st, L) {
    const ctx = this.ctx;
    const sc = L.s * 0.92;
    const fy = this.h * 0.87;
    const beatPh = st.pos > -1 && st.bpmActive ? (st.pos / BEAT) % 1 : -1;
    this.drawChar(ctx, L.opX - 40 * L.s, fy, sc, this.chars.op, PAL_EMBER, 1, beatPh, 1);
    this.drawChar(ctx, L.plX + 40 * L.s, fy, sc, this.chars.me, PAL_VOLT, -1, beatPh, 1);
    const nameTag = (x, nm, color) => {
      ctx.save();
      ctx.font = `800 italic ${Math.floor(17 * L.s + 8)}px "Segoe UI",sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.fillText(nm, x, fy + 30 * L.s);
      ctx.restore();
    };
    nameTag(L.opX, st.opName, "#f472b6");
    nameTag(L.plX, st.meName, "#22d3ee");
  }
  drawStrums(L, st, mine) {
    const ctx = this.ctx;
    const cx = mine ? L.plX : L.opX;
    const recY = mine ? L.plRecY : L.opRecY;
    const gap = L.laneGap * (mine ? 1 : 0.82);
    const sz = this.spriteSize * (mine ? L.noteR / 30 : L.noteR / 30 * 0.82);
    const chart = mine ? st.chartMe : st.chartOp;
    const pos = st.pos;
    const speed = this.h * (mine ? 0.72 : 0.5);
    const state = mine ? st.meState : st.opState;
    for (let i = 0; i < LANES; i++) {
      const lx = cx + (i - 1.5) * gap;
      const pressed = mine
        ? state && state.pressLane === i
        : state && state.opPressLane === i;
      const spr = this.sprites[(pressed ? "rp" : "r") + i];
      ctx.globalAlpha = mine ? 1 : 0.8;
      ctx.drawImage(spr, lx - sz / 2, recY - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    if (!chart) return;
    const lookBehind = 0.35;
    for (let idx = chart.firstVisible || 0; idx < chart.notes.length; idx++) {
      const n = chart.notes[idx];
      const dtms = (n.t - pos);
      if (dtms < -lookBehind - (n.hold || 0)) continue;
      if (dtms > 2.3) break;
      if (n.hit && (!n.hold || n.holdDone)) continue;
      if (n.missed && !n.hold) continue;
      const lx = cx + (n.lane - 1.5) * gap;
      const y = recY - dtms * speed;
      if (n.hold) {
        const yEnd = recY - (n.t + n.hold - pos) * speed;
        const headY = Math.min(y, recY);
        const tailY = Math.max(yEnd, -20);
        const clampedTail = Math.max(tailY, -20);
        ctx.globalAlpha = n.hit ? 0.45 : 0.85;
        ctx.fillStyle = LANE_COLORS[n.lane];
        const hw = sz * 0.19;
        if (headY > clampedTail) {
          ctx.beginPath();
          ctx.roundRect(lx - hw, clampedTail, hw * 2, headY - clampedTail, hw);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!n.hit && !n.missed) {
        ctx.drawImage(this.sprites["n" + n.lane], lx - sz / 2, y - sz / 2, sz, sz);
      }
    }
  }
  drawMeter(L, st) {
    const ctx = this.ctx;
    const { w } = this;
    const mw = L.meterW, mx = w / 2 - mw / 2, my = L.meterY;
    const hp = Math.max(0, Math.min(1, st.hp));
    ctx.save();
    ctx.fillStyle = "rgba(6,4,16,.75)";
    ctx.beginPath();
    ctx.roundRect(mx - 6, my - 6, mw + 12, 34, 17);
    ctx.fill();
    const split = mx + mw * hp;
    const grad1 = ctx.createLinearGradient(mx, 0, split, 0);
    grad1.addColorStop(0, "#be185d");
    grad1.addColorStop(1, "#f472b6");
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.roundRect(mx, my, Math.max(2, split - mx), 22, 11);
    ctx.fill();
    const grad2 = ctx.createLinearGradient(split, 0, mx + mw, 0);
    grad2.addColorStop(0, "#22d3ee");
    grad2.addColorStop(1, "#0e7490");
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.roundRect(split, my, Math.max(2, mx + mw - split), 22, 11);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(split, my - 5);
    ctx.lineTo(split, my + 27);
    ctx.stroke();
    ctx.font = `900 ${Math.floor(13 * L.s + 9)}px "Segoe UI",sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 6;
    ctx.fillText(st.opName.toUpperCase(), mx + mw * 0.25, my + 16);
    ctx.fillText(st.meName.toUpperCase(), mx + mw * 0.75, my + 16);
    ctx.restore();
  }
  drawTexts(L, st) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    const line = (x, y, me) => {
      const s = me ? st.meState : st.opState;
      if (!s) return;
      ctx.font = `800 ${Math.floor(15 * L.s + 6)}px "Segoe UI",sans-serif`;
      ctx.fillStyle = me ? "#bfeaf6" : "#f3c6de";
      ctx.fillText(`${s.score.toLocaleString()}  ·  ${s.acc.toFixed(1)}%${s.combo > 0 ? `  ·  x${s.combo}` : ""}`, x, y);
    };
    line(L.opX, L.opRecY + L.laneGap * 1.05, false);
    line(L.plX, L.plRecY + L.laneGap * 1.05, true);
    for (const p of this.pops) {
      const a = 1 - p.t / 0.6;
      ctx.globalAlpha = a;
      const size = (p.kind === "miss" ? 26 : 30) * L.s + 8;
      ctx.font = `italic 900 ${size}px "Segoe UI",sans-serif`;
      const cols = { sick: "#fef08a", good: "#6ee7a0", bad: "#fca5a5", miss: "#ef4444" };
      ctx.fillStyle = cols[p.kind] || "#fff";
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y - p.t * 90 * L.s);
      if (p.kind !== "miss") {
        ctx.font = `italic 900 ${(size * 0.8).toFixed(0)}px "Segoe UI",sans-serif`;
        ctx.fillStyle = "#fff";
        ctx.fillText(String(p.combo), p.x, p.y + size * 0.9 - p.t * 90 * L.s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.sparks) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5 + a * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const pr = r.t / 0.7;
      ctx.globalAlpha = (1 - pr) * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - pr) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 10 + pr * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export const PAL_VOLT = {
  coat: "#0e7490",
  trim: "#67e8f9",
  pants: "#155e75",
  shoe: "#e0f2fe",
  glove: "#a5f3fc",
  skin: "#ffd9b3",
  hairFn: null,
};
PAL_VOLT.hair = (ctx, hx, hy) => {
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.moveTo(hx - 40, hy - 8);
  ctx.quadraticCurveTo(hx - 44, hy - 48, hx - 6, hy - 42);
  ctx.lineTo(hx - 14, hy - 58);
  ctx.lineTo(hx + 4, hy - 44);
  ctx.lineTo(hx + 10, hy - 64);
  ctx.lineTo(hx + 22, hy - 44);
  ctx.lineTo(hx + 30, hy - 56);
  ctx.lineTo(hx + 36, hy - 30);
  ctx.quadraticCurveTo(hx + 42, hy - 4, hx + 34, hy + 2);
  ctx.closePath();
  ctx.fill();
};
PAL_VOLT.visor = true;

export const PAL_EMBER = {
  coat: "#9f1239",
  trim: "#fda4af",
  pants: "#701a37",
  shoe: "#fecdd3",
  glove: "#fb7185",
  skin: "#f7c59f",
  hairFn: null,
};
PAL_EMBER.hair = (ctx, hx, hy, hr, time) => {
  ctx.fillStyle = "#f472b6";
  ctx.beginPath();
  ctx.arc(hx, hy - 8, 41, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  const t = time * 3;
  ctx.beginPath();
  ctx.moveTo(hx - 38, hy - 18);
  for (let i = 0; i <= 5; i++) {
    const fx = hx - 38 - i * 9;
    const fh = 26 + Math.sin(t + i * 1.4) * 9 + i * 3;
    ctx.quadraticCurveTo(fx - 4, hy - 18 - fh, fx - 9, hy - 16);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 30, hy - 30);
  ctx.quadraticCurveTo(hx + 58, hy - 44 + Math.sin(t) * 6, hx + 52, hy - 8);
  ctx.quadraticCurveTo(hx + 46, hy + 6, hx + 34, hy - 4);
  ctx.closePath();
  ctx.fill();
};
