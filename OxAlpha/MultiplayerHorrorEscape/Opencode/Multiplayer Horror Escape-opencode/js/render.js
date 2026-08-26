/* render.js — canvas renderer: tilemap, line-of-sight lighting, entities, post fx. */
"use strict";

const Render = {
  cv: null, cx: null,
  W: 0, H: 0, DPR: 1,
  MAP_ROWS: null, MAP_W: 0, MAP_H: 0, TILE: 32,
  cam: { x: 0, y: 0 },
  scale: 34,
  fovCache: null,       // Uint8Array MAP_W*MAP_H visibility for current frame
  lightCache: null,     // Float32Array brightness
  grainCanvases: [],
  grainIdx: 0,
  doorAnim: {},         // "x,y" -> {open:bool, t:number}
  time: 0,

  init(canvas) {
    this.cv = canvas;
    this.cx = canvas.getContext("2d");
    this._resize();
    window.addEventListener("resize", () => this._resize());
    // grain tiles
    for (let i = 0; i < 4; i++) {
      const gc = document.createElement("canvas");
      gc.width = gc.height = 160;
      const gx = gc.getContext("2d");
      const img = gx.createImageData(160, 160);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = Math.random() * 255;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 26;
      }
      gx.putImageData(img, 0, 0);
      this.grainCanvases.push(gc);
    }
  },

  _resize() {
    this.DPR = Math.min(1.75, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.floor(this.W * this.DPR);
    this.cv.height = Math.floor(this.H * this.DPR);
    this.cv.style.width = this.W + "px";
    this.cv.style.height = this.H + "px";
    this.scale = Math.max(30, Math.min(46, Math.min(this.W / 24, this.H / 15)));
  },

  setMap(rows, w, h, tile) {
    this.MAP_ROWS = rows; this.MAP_W = w; this.MAP_H = h; this.TILE = tile;
    this.fovCache = new Uint8Array(w * h);
    this.lightCache = new Float32Array(w * h);
  },

  solidForLight(tx, ty, doors) {
    const ch = this.tileAt(tx, ty);
    if (ch === "#") return true;
    if (ch === "=") return true;
    if (ch === "D") {
      const st = doors.get(`${tx},${ty}`);
      return !(st && st.open && !st.locked);
    }
    return false;
  },

  tileAt(tx, ty) {
    if (ty < 0 || ty >= this.MAP_H || tx < 0 || tx >= this.MAP_W) return "#";
    return this.MAP_ROWS[ty][tx];
  },

  /* compute visibility + brightness from an eye point */
  computeFov(ex, ey, aimAng, flashOn, doors) {
    const R = 11.2;
    const { MAP_W, MAP_H } = this;
    const fov = this.fovCache, li = this.lightCache;
    fov.fill(0); li.fill(0);
    const x0 = Math.max(0, Math.floor(ex - R)), x1 = Math.min(MAP_W - 1, Math.ceil(ex + R));
    const y0 = Math.max(0, Math.floor(ey - R)), y1 = Math.min(MAP_H - 1, Math.ceil(ey + R));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const cxw = tx + 0.5, cyw = ty + 0.5;
        const d = Math.hypot(cxw - ex, cyw - ey);
        if (d > R) continue;
        // bresenham LOS
        let vis = true;
        {
          let px = ex, py = ey;
          const dx = cxw - ex, dy = cyw - ey;
          const steps = Math.ceil(d * 2.4);
          for (let s = 1; s <= steps; s++) {
            const ix = Math.floor(ex + dx * (s / steps));
            const iy = Math.floor(ey + dy * (s / steps));
            if (ix === tx && iy === ty) break;
            if (this.solidForLight(ix, iy, doors)) { vis = false; break; }
          }
        }
        if (!vis) continue;
        let lum = Math.max(0.16, 1 - d / R) ** 1.25;
        // flashlight cone boost
        if (flashOn) {
          const ang = Math.atan2(cyw - ey, cxw - ex);
          let da = Math.abs(((ang - aimAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (da < 0.55) lum += (1 - da / 0.55) * Math.max(0, 1 - d / 13) * 0.95;
          else if (da < 0.9) lum += (1 - (da - 0.55) / 0.35) * Math.max(0, 1 - d / 11) * 0.3;
        }
        fov[ty * MAP_W + tx] = 1;
        li[ty * MAP_W + tx] = Math.min(1.25, lum);
      }
    }
  },

  worldToScreen(wx, wy) {
    return [
      (wx - this.cam.x) * this.scale + this.W / 2,
      (wy - this.cam.y) * this.scale + this.H / 2,
    ];
  },
  screenToWorld(sx, sy) {
    return [(sx - this.W / 2) / this.scale + this.cam.x, (sy - this.H / 2) / this.scale + this.cam.y];
  },

  updateDoorAnims(doors, dt) {
    for (const [k, d] of doors) {
      let a = this.doorAnim[k];
      if (!a) { a = this.doorAnim[k] = { open: !!d[1], t: d[1] ? 1 : 0 }; continue; }
      const target = !!d[1];
      if (a.open !== target) { a.open = target; }
      a.t += ((target ? 1 : 0) - a.t) * Math.min(1, dt * 7);
    }
  },

  draw(v) {
    const cx = this.cx, S = this.scale;
    const dt = Math.min(0.05, (v.now - this.time) / 1000 || 0.016);
    this.time = v.now;
    this.updateDoorAnims(v.doors, dt);

    // camera follows player (+ slight aim lead)
    const me = v.me;
    this.cam.x += ((me.x + Math.cos(me.a) * 0.8) - this.cam.x) * Math.min(1, dt * 9);
    this.cam.y += ((me.y + Math.sin(me.a) * 0.8) - this.cam.y) * Math.min(1, dt * 9);

    // shake
    let shx = 0, shy = 0;
    if (v.fx.shake > 0) {
      shx = (Math.random() - 0.5) * v.fx.shake * 14;
      shy = (Math.random() - 0.5) * v.fx.shake * 14;
    }

    cx.save();
    cx.scale(this.DPR, this.DPR);
    cx.fillStyle = "#020304";
    cx.fillRect(0, 0, this.W, this.H);
    cx.translate(this.W / 2 + shx, this.H / 2 + shy);
    cx.translate(-this.cam.x * S, -this.cam.y * S);

    this.computeFov(me.x, me.y, me.a, me.fl > 0, v.doors);
    const fov = this.fovCache, li = this.lightCache;

    // escape phase tint
    const escapeTint = v.phase === "escape" ? 1 : 0;

    // --- tiles ---
    const x0 = Math.max(0, Math.floor(this.cam.x - this.W / 2 / S) - 1);
    const x1 = Math.min(this.MAP_W - 1, Math.ceil(this.cam.x + this.W / 2 / S) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y - this.H / 2 / S) - 1);
    const y1 = Math.min(this.MAP_H - 1, Math.ceil(this.cam.y + this.H / 2 / S) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const idx = ty * this.MAP_W + tx;
        if (!fov[idx]) continue;
        const L = li[idx];
        const px = tx * this.S_T(), py = ty * this.S_T();
        const ch = this.tileAt(tx, ty);
        if (ch === "#" ) {
          // wall: face shading
          const g = 0.10 + L * 0.42;
          cx.fillStyle = `rgb(${Math.round(g*255*(1+escapeTint*0.5))|0},${Math.round(g*238)|0},${Math.round(g*232)|0})`;
          cx.fillRect(px, py, this.S_T() + 1, this.S_T() + 1);
          if (ty + 1 < this.MAP_H && this.tileAt(tx, ty + 1) !== "#") {
            cx.fillStyle = `rgba(0,0,0,${0.28 * (1 - L * 0.4)})`;
            cx.fillRect(px, py + this.S_T() * 0.82, this.S_T() + 1, this.S_T() * 0.18 + 1);
          }
        } else if (ch === "=" ) {
          const openT = v.blastOpen || 0;
          const g = 0.08 + L * 0.3;
          cx.fillStyle = `rgb(${Math.round((g+0.05)*255)|0},${Math.round(g*200)|0},${Math.round(g*190)|0})`;
          cx.fillRect(px, py, this.S_T() + 1, this.S_T() + 1);
          if (openT < 1) {
            const half = (1 - openT) * this.S_T() / 2;
            cx.fillStyle = `rgba(${120+L*80|0},40,32,${0.85})`;
            cx.fillRect(px, py, half + 1, this.S_T());
            cx.fillRect(px + this.S_T() - half, py, half + 1, this.S_T());
            cx.fillStyle = `rgba(230,220,180,${0.25 + L * 0.3})`;
            cx.fillRect(px + half, py + this.S_T()*0.45, Math.max(2,(1-openT)*6), this.S_T()*0.1);
          }
        } else {
          // floor
          const grate = ch === ",";
          const base = grate ? 0.07 : 0.085;
          const g = base + L * 0.5;
          const r = g * 255 * (grate ? 0.9 : 1), gg = g * 250, b = g * 245;
          cx.fillStyle = `rgb(${r*(1+escapeTint*0.55)|0},${gg|0},${b|0})`;
          cx.fillRect(px, py, this.S_T() + 1, this.S_T() + 1);
          if (grate && L > 0.22) {
            cx.strokeStyle = `rgba(0,0,0,${0.5 * L})`;
            cx.lineWidth = 1.5;
            cx.beginPath();
            for (let k = 1; k < 4; k++) {
              cx.moveTo(px + 2, py + k * this.S_T() / 4);
              cx.lineTo(px + this.S_T() - 2, py + k * this.S_T() / 4);
            }
            cx.stroke();
          } else if (((tx * 7 + ty * 13) % 11) === 0 && L > 0.3) {
            // subtle floor plate seams
            cx.fillStyle = `rgba(0,0,0,${0.13 * L})`;
            cx.fillRect(px, py, this.S_T(), 1.5);
          }
        }
        // door
        if (ch === "D") {
          const st = v.doors.get(`${tx},${ty}`) || [`${tx},${ty}`, 0, 0];
          const anim = this.doorAnim[`${tx},${ty}`] || { t: st[1] ? 1 : 0 };
          const horiz = this.tileAt(tx - 1, ty) !== "#" ? true : false;
          const g = 0.06 + li[idx] * 0.4;
          cx.fillStyle = `rgb(${Math.round((g*255)*0.9)},${Math.round(g*230)},${Math.round(g*215)})`;
          const T = this.S_T();
          if (st[2]) { // locked — red glow seam
            cx.fillStyle = `rgba(190,60,44,0.9)`;
          }
          if (horiz) {
            const slide = anim.t * T * 0.92;
            cx.fillRect(px - slide * 0.0, py + 2, T * (1 - anim.t * 0.94) + 1, T - 4);
          } else {
            cx.fillRect(px + 2, py, T - 4, T * (1 - anim.t * 0.94) + 1);
          }
          if (st[2]) {
            cx.fillStyle = `rgba(255,90,70,${0.25 + 0.2*Math.sin(v.now/180)})`;
            if (horiz) cx.fillRect(px, py + T*0.4, T, 3);
            else cx.fillRect(px + T*0.4, py, 3, T);
          }
        }
      }
    }

    // --- extract zone (escape) ---
    if (v.phase === "escape" && v.pois.extract) {
      const e = v.pois.extract;
      const pulse = 0.16 + 0.1 * Math.sin(v.now / 240);
      cx.fillStyle = `rgba(90,220,170,${pulse})`;
      cx.fillRect(e.x * this.S_T(), e.y * this.S_T(), e.w * this.S_T(), e.h * this.S_T());
      cx.strokeStyle = `rgba(140,255,210,${pulse + 0.25})`;
      cx.lineWidth = 2;
      cx.strokeRect(e.x * this.S_T(), e.y * this.S_T(), e.w * this.S_T(), e.h * this.S_T());
      cx.font = `${Math.round(this.S_T()*0.42)}px Consolas,monospace`;
      cx.fillStyle = `rgba(160,255,215,0.8)`;
      cx.textAlign = "center";
      cx.fillText("AIRLOCK", (e.x + e.w / 2) * this.S_T(), (e.y + 0.62) * this.S_T());
    }

    // --- POI stations ---
    this._drawPois(cx, v);

    // --- notes ---
    for (const n of v.pois.notes || []) {
      const idx = Math.floor(n.y) * this.MAP_W + Math.floor(n.x);
      if (!fov[idx]) continue;
      const bob = Math.sin(v.now / 500 + n.x) * 1.5;
      cx.save();
      cx.translate(n.x * this.S_T() + this.S_T()/2, n.y * this.S_T() + this.S_T()/2 + bob);
      cx.rotate(0.15);
      cx.fillStyle = `rgba(225,220,200,${0.55 + li[idx]*0.4})`;
      cx.fillRect(-this.S_T()*0.16, -this.S_T()*0.2, this.S_T()*0.32, this.S_T()*0.4);
      cx.fillStyle = "rgba(60,60,66,0.8)";
      for (let l = 0; l < 3; l++)
        cx.fillRect(-this.S_T()*0.11, -this.S_T()*0.12 + l*this.S_T()*0.11, this.S_T()*0.22, 1.5);
      cx.restore();
    }

    // --- lockers ---
    for (let i = 0; i < (v.pois.lockers || []).length; i++) {
      const l = v.pois.lockers[i];
      const idx = Math.floor(l.y) * this.MAP_W + Math.floor(l.x);
      if (!fov[idx]) continue;
      const L = li[idx];
      const T = this.S_T();
      cx.fillStyle = `rgb(${28+L*50|0},${40+L*66|0},${44+L*70|0})`;
      cx.fillRect(l.x*T - T*0.38, l.y*T - T*0.44, T*0.76, T*0.88);
      cx.strokeStyle = `rgba(120,150,150,${0.3+L*0.4})`;
      cx.lineWidth = 1.5;
      cx.strokeRect(l.x*T - T*0.38, l.y*T - T*0.44, T*0.76, T*0.88);
      cx.beginPath();
      cx.moveTo(l.x*T, l.y*T - T*0.44); cx.lineTo(l.x*T, l.y*T + T*0.44);
      cx.stroke();
      // occupied indicator
      const occ = Object.values(v.players || {}).find(p => p.lk === i);
      if (occ) {
        cx.fillStyle = "rgba(127,212,193,0.8)";
        cx.fillRect(l.x*T - 3, l.y*T - T*0.5, 6, 3);
      }
    }

    // --- items ---
    for (const it of v.items || []) {
      const idx = Math.floor(it.y) * this.MAP_W + Math.floor(it.x);
      if (!fov[idx]) continue;
      const pulse = 0.6 + 0.4 * Math.sin(v.now / 300 + it.i);
      const T = this.S_T();
      cx.save();
      cx.translate(it.x * T, it.y * T);
      cx.shadowColor = `rgba(226,184,76,${0.7*pulse})`;
      cx.shadowBlur = 12;
      cx.fillStyle = `rgba(235,195,95,${0.65+0.3*pulse})`;
      cx.fillRect(-T*0.14, -T*0.09, T*0.28, T*0.18);
      cx.fillStyle = "rgba(120,90,30,0.9)";
      cx.fillRect(T*0.06, -T*0.05, T*0.05, T*0.1);
      cx.restore();
    }

    // --- other players ---
    for (const p of Object.values(v.players || {})) {
      if (p.pid === v.mePid) continue;
      if (p.dd) continue;                    // dead are gone
      if (p.lk >= 0) continue;               // hidden in locker
      const idx = Math.floor(p.y) * this.MAP_W + Math.floor(p.x);
      const seen = fov[idx] || (v.specMode);
      if (!seen) continue;
      const L = fov[idx] ? li[idx] : 0.75;
      this._drawPlayer(cx, p, v, L);
    }

    // --- me ---
    if (!v.me.dead && !v.specMode) this._drawPlayer(cx, { ...v.me, pid: v.mePid, c: v.meColor, n: "" }, v, 1.1, true);

    // --- monster ---
    if (v.mon && v.mon.rv) this._drawMonster(cx, v.mon, v);

    cx.restore();

    // --- post fx ---
    this._postFx(cx, v, dt);
  },

  S_T() { return this.scale; },

  _drawPlayer(cx, p, v, L, isMe) {
    const T = this.S_T();
    const x = p.x * T, y = p.y * T;
    const col = v.colors[p.c] || "#fff";
    cx.save();
    cx.translate(x, y);

    if (p.dn) {
      cx.rotate(Math.PI / 2);
      // downed body
      cx.globalAlpha = 0.9;
    }

    // shadow
    cx.fillStyle = "rgba(0,0,0,0.45)";
    cx.beginPath(); cx.ellipse(0, T*0.14, T*0.3, T*0.2, 0, 0, Math.PI*2); cx.fill();

    // flashlight cone
    if (p.fl && !p.dn) {
      const grad = cx.createRadialGradient(0, 0, T*0.1, 0, 0, T*5.2);
      grad.addColorStop(0, "rgba(255,244,200,0.30)");
      grad.addColorStop(0.5, "rgba(255,240,190,0.10)");
      grad.addColorStop(1, "rgba(255,240,190,0)");
      cx.fillStyle = grad;
      cx.beginPath();
      cx.moveTo(0, 0);
      cx.arc(0, 0, T*5.2, p.a - 0.42, p.a + 0.42);
      cx.closePath();
      cx.fill();
    }

    // body
    const r = T * 0.30;
    cx.rotate(p.a);
    cx.fillStyle = col;
    cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = "rgba(8,12,12,0.85)";
    cx.beginPath(); cx.arc(r*0.42, 0, r*0.34, 0, Math.PI * 2); cx.fill();
    cx.rotate(-p.a);

    // fuse carried
    if (p.fu) {
      cx.fillStyle = `rgba(240,200,100,${0.75+0.25*Math.sin(Date.now()/260)})`;
      cx.fillRect(-T*0.1, -T*0.52, T*0.2, T*0.12);
    }

    // crouch shrink ring
    if (p.cr && !p.dn) {
      cx.strokeStyle = "rgba(180,200,200,0.35)";
      cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(0, 0, r*1.35, 0, Math.PI*2); cx.stroke();
    }

    cx.restore();

    // name tag
    if (!isMe && p.n && L > 0.2) {
      cx.save();
      cx.font = `${Math.max(10, Math.round(T*0.3))}px Consolas,monospace`;
      cx.textAlign = "center";
      cx.fillStyle = p.conn ? `rgba(220,232,232,${Math.min(0.95, L+0.25)})` : "rgba(150,150,160,0.6)";
      cx.fillText(p.n + (p.conn ? "" : " (lost)"), x, y - T*0.72);
      cx.restore();
    }

    // downed bleed ring
    if (p.dn) {
      const frac = Math.max(0, Math.min(1, p.bo / 75));
      cx.save();
      cx.translate(x, y);
      cx.strokeStyle = "rgba(20,10,10,0.8)";
      cx.lineWidth = 4;
      cx.beginPath(); cx.arc(0, 0, T*0.52, 0, Math.PI*2); cx.stroke();
      cx.strokeStyle = "rgba(226,87,76,0.95)";
      cx.beginPath(); cx.arc(0, 0, T*0.52, -Math.PI/2, -Math.PI/2 + frac*Math.PI*2); cx.stroke();
      cx.restore();
    }
  },

  _drawMonster(cx, mon, v) {
    const T = this.S_T();
    const jit = mon.s === "hunt" ? 2.2 : 1.1;
    const x = (mon.x + (Math.random()-0.5)*jit/T*2) * T;
    const y = (mon.y + (Math.random()-0.5)*jit/T*2) * T;
    const flick = 0.55 + Math.random() * 0.45;
    cx.save();
    cx.translate(x, y);

    // static aura
    cx.globalAlpha = 0.5 * flick;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = T * (0.5 + Math.random() * 0.55);
      cx.fillStyle = Math.random() < 0.5 ? "rgba(200,220,225,0.5)" : "rgba(20,24,28,0.7)";
      cx.fillRect(Math.cos(a) * rr - 1.5, Math.sin(a) * rr * 0.9 - 1.5, 3 + Math.random()*3, 2 + Math.random()*3);
    }
    cx.globalAlpha = 1;

    // tall silhouette
    const h = T * 0.98 * (0.96 + Math.random() * 0.08);
    const w = T * 0.5;
    cx.fillStyle = `rgba(8,10,13,${0.88 * flick + 0.1})`;
    cx.beginPath();
    cx.moveTo(-w*0.5, T*0.32);
    cx.quadraticCurveTo(-w*0.62, -h*0.2, -w*0.22, -h*0.52);
    cx.quadraticCurveTo(0, -h*0.68, w*0.22, -h*0.52);
    cx.quadraticCurveTo(w*0.62, -h*0.2, w*0.5, T*0.32);
    cx.closePath();
    cx.fill();

    // mouths — a chorus of pale ovals that drift
    const t = Date.now() / 130;
    for (let i = 0; i < 5; i++) {
      const mx = Math.sin(t + i * 1.7) * w * 0.3;
      const my = -h * 0.36 + i * h * 0.09 + Math.cos(t * 0.8 + i) * 2;
      const mo = 0.35 + 0.3 * Math.abs(Math.sin(t * 1.3 + i * 2.1));
      cx.fillStyle = `rgba(216,222,214,${mo})`;
      cx.beginPath();
      cx.ellipse(mx, my, 2.6 + Math.sin(t+i)*1.2, 1.6 + Math.abs(Math.cos(t*0.7+i))*1.1, 0, 0, Math.PI*2);
      cx.fill();
    }

    // eyes
    if (Math.random() > 0.12) {
      cx.fillStyle = `rgba(235,240,235,${flick})`;
      cx.fillRect(-w*0.16, -h*0.47, 3, 3);
      cx.fillRect(w*0.10, -h*0.47, 3, 3);
    }
    cx.restore();
  },

  _drawPois(cx, v) {
    const P = v.pois, T = this.S_T(), fov = this.fovCache, li = this.lightCache;
    const icon = (o, fn) => {
      const idx = Math.floor(o.y) * this.MAP_W + Math.floor(o.x);
      if (!fov[idx]) return;
      const L = li[idx];
      if (L < 0.14) return;
      cx.save();
      cx.translate(o.x * T, o.y * T);
      fn(L);
      cx.restore();
    };
    const ring = (frac, col) => {
      cx.strokeStyle = "rgba(10,14,14,0.85)";
      cx.lineWidth = 4.5;
      cx.beginPath(); cx.arc(0, T*0.52, T*0.3, 0, Math.PI*2); cx.stroke();
      cx.strokeStyle = col;
      cx.lineWidth = 3;
      cx.beginPath(); cx.arc(0, T*0.52, T*0.3, -Math.PI/2, -Math.PI/2 + frac * Math.PI * 2); cx.stroke();
    };

    if (P.breaker) icon(P.breaker, (L) => {
      cx.fillStyle = `rgb(${50+L*70|0},${58+L*80|0},${62+L*84|0})`;
      cx.fillRect(-T*0.34, -T*0.4, T*0.68, T*0.8);
      cx.strokeStyle = `rgba(217,164,65,${0.4+L*0.5})`;
      cx.lineWidth = 2;
      cx.strokeRect(-T*0.34, -T*0.4, T*0.68, T*0.8);
      // bolt glyph
      cx.fillStyle = `rgba(217,164,65,${0.5+L*0.5})`;
      cx.beginPath();
      cx.moveTo(T*0.06, -T*0.26); cx.lineTo(-T*0.14, T*0.04); cx.lineTo(T*0.02, T*0.04); cx.lineTo(-T*0.06, T*0.28);
      cx.lineTo(T*0.16, -T*0.06); cx.lineTo(T*0.0, -T*0.06); cx.closePath();
      cx.fill();
      if (v.obj) ring(v.obj.fi / Math.max(1, v.obj.fn), "rgba(217,164,65,0.95)");
    });

    for (const sw of [["switchA", P.switchA], ["switchB", P.switchB]]) {
      if (!sw[1]) continue;
      icon(sw[1], (L) => {
        cx.fillStyle = `rgb(${44+L*60|0},${52+L*70|0},${56+L*74|0})`;
        cx.fillRect(-T*0.26, -T*0.34, T*0.52, T*0.68);
        cx.strokeStyle = "rgba(150,180,175,0.5)";
        cx.strokeRect(-T*0.26, -T*0.34, T*0.52, T*0.68);
        cx.fillStyle = "rgba(200,220,210,0.8)";
        cx.fillRect(-T*0.05, -T*0.2, T*0.1, T*0.4);
        if (v.obj && v.obj.fn > 0 && v.obj.fi >= v.obj.fn) {
          const held = v.heldSwitches && v.heldSwitches[sw[0]];
          cx.fillStyle = held ? "rgba(127,212,193,1)" : "rgba(226,120,80,0.9)";
          cx.fillRect(-T*0.05, -T*0.2, T*0.1, T*0.12);
        }
      });
    }

    (P.dishes || []).forEach((d, i) => {
      icon(d, (L) => {
        cx.rotate(-0.5);
        cx.strokeStyle = `rgba(180,210,205,${0.4+L*0.5})`;
        cx.lineWidth = 2.5;
        cx.beginPath(); cx.arc(0, -T*0.05, T*0.3, Math.PI*0.15, Math.PI*0.85, true); cx.stroke();
        cx.beginPath(); cx.moveTo(0, T*0.05); cx.lineTo(0, T*0.3); cx.stroke();
        cx.rotate(0.5);
        const prog = v.obj ? v.obj.di[i] : 0;
        if (prog > 0 && prog < 1) ring(prog, "rgba(226,184,76,0.95)");
        if (prog >= 1) {
          cx.fillStyle = "rgba(127,212,193,0.9)";
          cx.beginPath(); cx.arc(0, -T*0.05, 3.5, 0, Math.PI*2); cx.fill();
        }
      });
    });

    for (const tm of [["termA", P.termA], ["termB", P.termB]]) {
      if (!tm[1]) continue;
      icon(tm[1], (L) => {
        cx.fillStyle = `rgb(${36+L*54|0},${46+L*64|0},${50+L*68|0})`;
        cx.fillRect(-T*0.32, -T*0.38, T*0.64, T*0.76);
        cx.fillStyle = `rgba(110,190,170,${0.35+L*0.45})`;
        cx.fillRect(-T*0.22, -T*0.28, T*0.44, T*0.3);
        cx.fillStyle = "rgba(20,30,28,0.9)";
        for (let l = 0; l < 3; l++) cx.fillRect(-T*0.17, -T*0.23 + l*T*0.09, T*(0.1+((l*37)%17)/60), 2);
        if (v.obj && v.obj.dec) { cx.fillStyle = "rgba(127,212,193,1)"; cx.fillRect(-T*0.22, -T*0.28, T*0.44, T*0.3); }
      });
    }

    if (P.lever) icon(P.lever, (L) => {
      cx.fillStyle = `rgb(${48+L*56|0},${44+L*50|0},${42+L*46|0})`;
      cx.fillRect(-T*0.2, -T*0.3, T*0.4, T*0.6);
      cx.strokeStyle = "rgba(226,87,76,0.8)";
      cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(0, T*0.1); cx.lineTo(T*0.16, -T*0.22); cx.stroke();
      cx.fillStyle = "rgba(226,87,76,0.95)";
      cx.beginPath(); cx.arc(T*0.16, -T*0.22, 4, 0, Math.PI*2); cx.fill();
    });

    if (P.radio) icon(P.radio, (L) => {
      cx.fillStyle = `rgb(${40+L*50|0},${48+L*58|0},${52+L*62|0})`;
      cx.fillRect(-T*0.3, -T*0.26, T*0.6, T*0.52);
      cx.fillStyle = `rgba(217,164,65,${0.3+0.3*Math.sin(Date.now()/400)+L*0.3})`;
      cx.fillRect(-T*0.2, -T*0.16, T*0.4, T*0.08);
    });
  },

  _postFx(cx, v, dt) {
    const W = this.W, H = this.H;
    // vignette
    const vg = cx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.32, W/2, H/2, Math.max(W,H)*0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.78)");
    cx.fillStyle = vg;
    cx.fillRect(0, 0, W, H);

    // red danger vignette
    if (v.fx.red > 0.01) {
      const rg = cx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.25, W/2, H/2, Math.max(W,H)*0.7);
      rg.addColorStop(0, "rgba(120,10,6,0)");
      rg.addColorStop(1, `rgba(150,16,8,${0.5 * v.fx.red})`);
      cx.fillStyle = rg;
      cx.fillRect(0, 0, W, H);
    }

    // static interference proportional to threat proximity
    const st = v.fx.static;
    if (st > 0.01) {
      this.grainIdx = (this.grainIdx + 1) % this.grainCanvases.length;
      const gc = this.grainCanvases[this.grainIdx];
      cx.save();
      cx.globalAlpha = Math.min(0.5, st * 0.55);
      cx.globalCompositeOperation = "overlay";
      for (let y = 0; y < H; y += 160)
        for (let x = 0; x < W; x += 160)
          cx.drawImage(gc, x + (Math.random()*8-4), y + (Math.random()*8-4));
      cx.restore();
      // tear bands
      const bands = Math.round(st * 7);
      for (let i = 0; i < bands; i++) {
        if (Math.random() < 0.6) continue;
        const y = Math.random() * H;
        const hh = 1 + Math.random() * 5;
        cx.fillStyle = `rgba(190,210,205,${st * 0.16})`;
        cx.fillRect(0, y, W, hh);
      }
    } else {
      this.grainIdx = (this.grainIdx + 1) % this.grainCanvases.length;
      const gc = this.grainCanvases[this.grainIdx];
      cx.save();
      cx.globalAlpha = 0.05;
      for (let y = 0; y < H; y += 160)
        for (let x = 0; x < W; x += 160)
          cx.drawImage(gc, x, y);
      cx.restore();
    }
  },
};
