// PRISM PULSE — gameplay engine: judging, scoring, effects, highway rendering.
import { LANES, LANE_KEYS, LANE_COLORS, WINDOWS, MISS_WINDOW,
         beatsToSec, secToBeats, gradeFor } from './chart.js';

const APPROACH_DEFAULT = 0.85;   // seconds a note is visible before hitting the line
const ARROW_MAP = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };

export class Game {
  constructor(canvas, hud, chart, audio, opts = {}) {
    this.canvas = canvas;
    this.hud = hud;
    this.chart = chart;
    this.audio = audio;
    this.auto = !!opts.auto;
    this.onExit = opts.onExit || (() => {});
    this.scrollSpeed = opts.scrollSpeed || 1;   // multiplier
    this.offsetSec = (opts.offsetMs || 0) / 1000;

    const bpm = chart.meta.bpm;
    this.spb = 60 / bpm;
    this.notes = chart.notes.map((n, i) => ({
      id: i,
      tBeat: n.t,
      t: beatsToSec(n.t, bpm, chart.meta.offset || 0),
      endT: n.type === 'hold' ? beatsToSec(n.t + n.dur, bpm, chart.meta.offset || 0) : null,
      lane: n.lane,
      type: n.type,
      dur: n.dur || 0,
      state: 0,        // 0 pending, 1 head-hit/active, 2 done, 3 missed
      weight: 0,
    }));
    // skip notes before start
    this.startPos = Math.max(0, opts.startPosSec ?? 0);
    for (const n of this.notes) {
      if (n.endT !== null && n.endT < this.startPos) n.state = 4;   // skipped
      else if (n.state === 0 && n.t < this.startPos - MISS_WINDOW / 1000) n.state = 4;
    }
    this.playable = this.notes.filter(n => n.state !== 4);
    this.totalUnits = this.playable.length; // each note = one judged unit

    this.cursor = 0;          // index of first possibly-unjudged note
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { Marvelous: 0, Perfect: 0, Great: 0, Good: 0, Miss: 0 };
    this.accSum = 0; this.judged = 0;
    this.heldKeys = new Set();
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.laneFlash = [0, 0, 0, 0];
    this.beatPulse = 0;
    this.missFlash = 0;
    this.paused = false;
    this.finished = false;
    this.stars = [];
    this.running = false;

    this._onKeyDown = (e) => this.keyDown(e);
    this._onKeyUp = (e) => this.keyUp(e);
    this._onBlur = () => { if (this.running && !this.finished) this.setPaused(true); };
    this._resize = () => this.resize();
  }

  // ---- lifecycle ------------------------------------------------------------
  start() {
    this.audio.ensureCtx().then(() => {
      this.audio.seek(this.startPos);
      this.audio.onEnd = () => this.finish();
      this.audio.play(this.startPos);
    });
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('resize', this._resize);
    this.resize();
    this.buildStars();
    this.lastFrame = performance.now();
    this.running = true;
    this.loop();
  }

  destroy() {
    this.running = false;
    this.audio.stop();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('resize', this._resize);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, r.width * dpr);
    this.canvas.height = Math.max(1, r.height * dpr);
    this.dpr = dpr;
  }

  buildStars() {
    this.stars = [];
    for (let i = 0; i < 46; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 1.8, v: 0.25 + Math.random() });
    }
  }

  // ---- timing ---------------------------------------------------------------
  now() {
    // audio-clock position minus user offset -> judging timeline
    return this.audio.position() - this.offsetSec;
  }

  setPaused(p) {
    if (this.finished) return;
    if (p === this.paused) return;
    this.paused = p;
    if (p) { this.audio.pause(); }
    else { this.audio.ensureCtx().then(() => this.audio.play()); }
    this.hud.dispatchEvent(new CustomEvent('pausechange', { detail: this.paused }));
  }

  togglePause() { this.setPaused(!this.paused); }

  restart() {
    for (const n of this.notes) {
      if (n.state === 4 && !(n.endT !== null && n.endT >= this.startPos)) continue;
      n.state = 0; n.weight = 0;
    }
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.counts = { Marvelous: 0, Perfect: 0, Great: 0, Good: 0, Miss: 0 };
    this.accSum = 0; this.judged = 0;
    this.particles.length = 0; this.rings.length = 0; this.popups.length = 0;
    this.missFlash = 0; this.finished = false;
    this.setPaused(false);
    this.audio.seek(this.startPos);
    this.audio.play(this.startPos);
  }

  quit() { this.destroy(); this.onExit({ quit: true }); }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.destroy();
    const acc = this.totalUnits ? this.accSum / this.totalUnits : 0;
    this.onExit({
      quit: false,
      score: this.score,
      accuracy: acc,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      grade: gradeFor(acc),
      totalNotes: this.totalUnits,
      fullCombo: this.counts.Miss === 0,
      auto: this.auto,
    });
  }

  // ---- input ----------------------------------------------------------------
  keyDown(e) {
    if (e.code === 'Escape') { e.preventDefault(); this.togglePause(); return; }
    if (this.paused || this.finished) return;
    let lane = LANE_KEYS.findIndex(k => k.code === e.code);
    if (lane < 0) lane = ARROW_MAP[e.code] ?? -1;
    if (lane < 0 || e.repeat || this.heldKeys.has(lane)) return;
    this.heldKeys.add(lane);
    this.hitLane(lane);
  }

  keyUp(e) {
    let lane = LANE_KEYS.findIndex(k => k.code === e.code);
    if (lane < 0) lane = ARROW_MAP[e.code] ?? -1;
    if (lane < 0) return;
    this.heldKeys.delete(lane);
    // releasing an active hold before its end breaks it
    const t = this.now();
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t) break;
      if (n.lane === lane && n.type === 'hold' && n.state === 1 && n.endT - t > 0.12) {
        n.state = 3;                       // broken
        this.registerMiss(n, 'hold');
      }
    }
  }

  hitLane(lane) {
    this.laneFlash[lane] = 1;
    if (this.auto) return;                 // autoplay feeds its own hits
    const t = this.now();
    let best = null, bestD = 1e9;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > MISS_WINDOW / 1000) break;
      if (n.state !== 0 || n.lane !== lane) continue;
      const d = Math.abs(n.t - t) * 1000;
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best || bestD > MISS_WINDOW) return;   // ghost tap: flash only
    this.applyHit(best, bestD, t);
  }

  applyHit(n, deltaMs, t) {
    let j = WINDOWS[WINDOWS.length - 1];
    for (const w of WINDOWS) { if (deltaMs <= w.ms) { j = w; break; } }
    n.state = n.type === 'hold' ? 1 : 2;
    n.weight = j.weight;
    this.registerHit(n, j);
    this.spawnHitFx(n.lane, j.color, n.type);
  }

  registerHit(n, j) {
    this.counts[j.name]++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.accSum += j.weight; this.judged++;
    const base = n.type === 'hold' ? 600 : 1000;
    this.score += Math.round(base * j.weight + Math.min(this.combo, 80) * 2);
    this.popups.push({ text: j.name, color: j.color, born: performance.now(), x: this.laneX(n.lane) });
    if (this.popups.length > 10) this.popups.shift();
  }

  registerMiss(n, why) {
    this.counts.Miss++;
    this.judged++;
    this.combo = 0;
    this.missFlash = 1;
    if (n.weight) { this.accSum -= n.weight; } // broken hold loses its head credit
    n.weight = 0;
    this.popups.push({ text: 'MISS', color: '#f87171', born: performance.now(), x: this.laneX(n.lane) });
    if (this.popups.length > 10) this.popups.shift();
  }

  spawnHitFx(lane, color, type) {
    const x = this.laneX(lane), y = this.judgeY();
    const count = type === 'hold' ? 14 : 9;
    if (this.particles.length < 260) {
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = 90 + Math.random() * 240;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.45 + Math.random() * 0.25, age: 0, color, size: 2 + Math.random() * 3 });
      }
    }
    this.rings.push({ x, y, age: 0, life: 0.32, color });
    if (this.rings.length > 18) this.rings.shift();
  }

  autoplayTick(t) {
    while (this.cursor < this.notes.length) {
      const n = this.notes[this.cursor];
      if (n.state === 4) { this.cursor++; continue; }
      if (n.t > t) break;
      if (n.state === 0) {
        n.state = n.type === 'hold' ? 1 : 2;
        n.weight = 1;
        this.registerHit(n, WINDOWS[0]);
        this.spawnHitFx(n.lane, WINDOWS[0].color, n.type);
      }
      this.cursor++;
    }
    // complete holds automatically
    for (let i = Math.max(0, this.cursor - 30); i < this.notes.length && this.notes[i].t <= t; i++) {
      const n = this.notes[i];
      if (n.type === 'hold' && n.state === 1 && n.endT <= t) { n.state = 2; this.score += 400; }
    }
  }

  advance(t) {
    if (this.auto) this.autoplayTick(t);
    // misses
    while (this.cursor < this.notes.length) {
      const n = this.notes[this.cursor];
      if (n.state === 4) { this.cursor++; continue; }
      if (n.state === 0 && t - n.t > MISS_WINDOW / 1000) {
        n.state = 3;
        this.registerMiss(n);
        this.cursor++;
        continue;
      }
      break;
    }
    // hold completions
    for (let i = Math.max(0, this.cursor - 40); i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t) break;
      if (n.type === 'hold' && n.state === 1 && n.endT <= t) {
        n.state = 2;
        this.accSum += (1 - n.weight);       // bring hold unit to full
        this.score += 400;
      }
    }
    if (!this.audio.playing && !this.paused) {
      // buffer finished (onended path calls finish); fallback if slightly out of sync
      if (this.audio.position() >= this.audio.duration - 0.02) this.finish();
    }
    const lastN = this.notes[this.notes.length - 1];
    const lastT = lastN ? (lastN.endT ?? lastN.t) : 0;
    if (!this.finished && this.judged >= this.totalUnits && this.totalUnits > 0 &&
        t > lastT + 0.6 && this.audio.position() > lastT + 0.6) {
      this.finish();
    }
  }

  // ---- rendering --------------------------------------------------------------
  laneX(lane) { return this.geom.lanesX + this.geom.laneW * (lane + 0.5); }
  judgeY() { return this.geom.top + this.geom.highH - 74; }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - this.lastFrame) / 1000);
    this.lastFrame = nowMs;
    const t = this.now();

    if (!this.paused && !this.finished) {
      this.advance(t);
      // decay fx
      for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt; }
      this.particles = this.particles.filter(p => p.age < p.life);
      for (const r of this.rings) r.age += dt;
      this.rings = this.rings.filter(r => r.age < r.life);
      this.laneFlash = this.laneFlash.map(f => Math.max(0, f - dt * 5));
      this.missFlash = Math.max(0, this.missFlash - dt * 2.4);
      // beat pulse
      const songT = this.audio.position();
      const phase = ((songT % this.spb) + this.spb) % this.spb;
      this.beatPulse = Math.max(0, 1 - phase / (this.spb * 0.35));
    }

    this.draw(t, dt);
    this.updateHud(t);
  }

  draw(t, dt) {
    const c = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    const dpr = this.dpr;
    c.clearRect(0, 0, W, H);

    // geometry
    const hwW = Math.min(W * 0.62, 620 * dpr);
    const lanesX = (W - hwW) / 2;
    const laneW = hwW / LANES;
    const highH = H * 0.94;
    const top = H * 0.03;
    this.geom = { lanesX, laneW, highH, top };

    // ---- background ----
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c0718'); g.addColorStop(0.55, '#120a26'); g.addColorStop(1, '#0a0514');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // prism beams (slow drift)
    const beamT = performance.now() / 1000;
    for (let i = 0; i < 5; i++) {
      const bx = ((beamT * (10 + i * 7)) % (W + 400)) - 200;
      const bg2 = c.createLinearGradient(bx - 130, 0, bx + 130, H);
      const col = LANE_COLORS[i % 4];
      bg2.addColorStop(0, col + '00'); bg2.addColorStop(0.5, col + '14'); bg2.addColorStop(1, col + '00');
      c.save(); c.translate(W / 2, H / 2); c.rotate(-0.35 + i * 0.06); c.translate(-W / 2, -H / 2);
      c.fillStyle = bg2; c.fillRect(-200, -H, W + 400, H * 3); c.restore();
    }

    // stars drifting down at scroll speed (reactive depth cue)
    const sp = 60 * this.scrollSpeed * dpr;
    c.fillStyle = '#ffffff';
    for (const st of this.stars) {
      st.y += (st.v * sp) / H * dt * 60;
      if (st.y > 1) { st.y -= 1; st.x = Math.random(); }
      c.globalAlpha = 0.10 + st.v * 0.08;
      c.fillRect(st.x * W, st.y * H, st.s * dpr, st.s * dpr);
    }
    c.globalAlpha = 1;

    // beat pulse vignette
    if (this.beatPulse > 0.01) {
      const rg = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      rg.addColorStop(0, `rgba(124,58,237,${0.10 * this.beatPulse})`);
      rg.addColorStop(1, 'rgba(124,58,237,0)');
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    }

    // miss flash
    if (this.missFlash > 0.01) {
      c.fillStyle = `rgba(248,113,113,${0.13 * this.missFlash})`;
      c.fillRect(0, 0, W, H);
    }

    // ---- highway ----
    const jy = this.judgeY();
    c.save();
    beginHighwayPath(c, lanesX, top, hwW, highH);
    c.clip();

    // lane floor gradient
    const lg = c.createLinearGradient(0, top, 0, top + highH);
    lg.addColorStop(0, 'rgba(255,255,255,0.015)');
    lg.addColorStop(1, 'rgba(148,103,255,0.06)');
    c.fillStyle = lg; c.fillRect(lanesX, top, hwW, highH);

    // separators
    c.strokeStyle = 'rgba(167,139,250,0.16)';
    c.lineWidth = Math.max(1, dpr);
    for (let i = 0; i <= LANES; i++) {
      c.beginPath(); c.moveTo(lanesX + laneW * i, top); c.lineTo(lanesX + laneW * i, top + highH); c.stroke();
    }

    // lane press feedback
    for (let l = 0; l < LANES; l++) {
      const f = this.auto ? this.beatPulse * 0.3 : this.laneFlash[l];
      if (f <= 0.01) continue;
      const fg = c.createLinearGradient(0, jy - 260 * dpr, 0, jy + 20);
      fg.addColorStop(0, LANE_COLORS[l] + '00');
      fg.addColorStop(1, LANE_COLORS[l] + Math.round(f * 88).toString(16).padStart(2, '0'));
      c.fillStyle = fg;
      c.fillRect(lanesX + laneW * l, jy - 260 * dpr, laneW, 280 * dpr);
    }

    // measure lines (bar grid scrolling past) for musical context
    const bpm = this.chart.meta.bpm, off = this.chart.meta.offset || 0;
    const approach = APPROACH_DEFAULT / this.scrollSpeed;
    const travel = jy - top;
    const firstBar = Math.floor(secToBeats(Math.max(0, t - 0.5), bpm, off) / 4) * 4;
    const lastBar = secToBeats(t, bpm, off) + approach * (bpm / 60) * 4 + 4;
    c.strokeStyle = 'rgba(196,181,253,0.09)'; c.lineWidth = dpr;
    for (let b = firstBar; b <= lastBar; b += 4) {
      const ts = beatsToSec(b, bpm, off);
      const y = jy - ((ts - t) / approach) * travel;
      if (y < top || y > top + highH) continue;
      c.beginPath(); c.moveTo(lanesX, y); c.lineTo(lanesX + hwW, y); c.stroke();
    }

    // judgment line
    const jl = c.createLinearGradient(lanesX, 0, lanesX + hwW, 0);
    jl.addColorStop(0, '#7dd3fc'); jl.addColorStop(0.5, '#e9d5ff'); jl.addColorStop(1, '#f0abfc');
    c.fillStyle = jl;
    c.fillRect(lanesX, jy - 2 * dpr, hwW, 4 * dpr);
    c.fillStyle = `rgba(233,213,255,${0.25 + this.beatPulse * 0.5})`;
    c.fillRect(lanesX, jy - 5 * dpr, hwW, 10 * dpr);

    // notes
    const noteH = Math.max(18 * dpr, laneW * 0.30);
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.state === 3) continue;
      const yHead = jy - ((n.t - t) / approach) * travel;
      if (yHead < top - 80 * dpr) break;               // sorted: nothing further up matters
      if (yHead > top + highH + 60 * dpr) continue;
      drawNote(c, this, n, yHead, t, approach, travel, noteH, dpr);
    }

    // particles
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      c.globalAlpha = a;
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size * dpr * a + 0.5, 0, 7); c.fill();
    }
    c.globalAlpha = 1;

    // rings
    for (const r of this.rings) {
      const pr = r.age / r.life;
      c.globalAlpha = 1 - pr;
      c.strokeStyle = r.color; c.lineWidth = 3 * dpr * (1 - pr) + 1;
      c.beginPath(); c.arc(r.x, r.y, (10 + 70 * pr) * dpr, 0, 7); c.stroke();
    }
    c.globalAlpha = 1;

    // judgment popups (rise + fade near line)
    const nowMs = performance.now();
    c.textAlign = 'center';
    for (const pu of this.popups) {
      const age = (nowMs - pu.born) / 520;
      if (age > 1) continue;
      c.globalAlpha = 1 - age;
      c.font = `700 ${22 * dpr}px Consolas, monospace`;
      c.fillStyle = pu.color;
      c.fillText(pu.text, pu.x, jy - 70 * dpr - age * 34 * dpr);
    }
    c.globalAlpha = 1;
    c.restore();

    // highway frame glow
    c.strokeStyle = 'rgba(167,139,250,0.35)';
    c.lineWidth = 2 * dpr;
    beginHighwayPath(c, lanesX, top, hwW, highH);
    c.stroke();

    // receptor key labels
    c.font = `600 ${13 * dpr}px Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let l = 0; l < LANES; l++) {
      const x = this.laneX(l);
      c.fillStyle = 'rgba(233,213,255,0.75)';
      c.fillText(LANE_KEYS[l].label, x, top + highH - 34 * dpr);
      c.fillStyle = LANE_COLORS[l] + 'aa';
      c.fillRect(x - laneW * 0.28, top + highH - 24 * dpr, laneW * 0.56, 3 * dpr);
    }
  }

  updateHud(t) {
    const acc = this.totalUnits ? this.accSum / this.totalUnits : 1;
    const el = this.hud;
    el.querySelector('[data-hud="score"]').textContent = String(this.score).padStart(7, '0');
    el.querySelector('[data-hud="acc"]').textContent = (acc * 100).toFixed(2) + '%';
    const comboEl = el.querySelector('[data-hud="combo"]');
    comboEl.textContent = this.combo;
    comboEl.classList.toggle('hot', this.combo >= 25);
    const prog = this.audio.duration ? Math.min(1, this.audio.position() / this.audio.duration) : 0;
    el.querySelector('[data-hud="prog"]').style.width = (prog * 100).toFixed(2) + '%';
    el.querySelector('[data-hud="judge"]').textContent =
      `${this.counts.Perfect + this.counts.Marvelous}/${this.counts.Great}/${this.counts.Good}/${this.counts.Miss}`;
  }
}

function beginHighwayPath(c, x, y, w, h) {
  const r = 14;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawNote(c, game, n, yHead, t, approach, travel, noteH, dpr) {
  const x = game.geom.lanesX + game.geom.laneW * n.lane;
  const w = game.geom.laneW * 0.78;
  const col = LANE_COLORS[n.lane];
  const jy = game.judgeY();

  if (n.type === 'hold') {
    const yTail = jy - ((n.endT - t) / approach) * travel;
    const bodyTop = Math.max(yHead, game.geom.top);
    const bodyBot = Math.min(yTail, jy + 40 * dpr);
    if (bodyBot > bodyTop) {
      const held = n.state === 1;
      const bg = c.createLinearGradient(x, bodyTop, x, bodyBot);
      bg.addColorStop(0, col + (held ? 'dd' : '66'));
      bg.addColorStop(1, col + (held ? '77' : '33'));
      c.fillStyle = bg;
      roundRect(c, x - w * 0.28, bodyTop, w * 0.56, Math.max(bodyBot - bodyTop, 4), w * 0.14);
      c.fill();
      // tail cap
      c.fillStyle = col + (held ? 'ff' : '99');
      roundRect(c, x - w * 0.36, yTail - noteH * 0.32, w * 0.72, noteH * 0.42, 5 * dpr);
      c.fill();
    }
  }
  if (n.state === 1 && n.type === 'hold') return; // head consumed, body shows progress

  // head
  const pressedNear = Math.abs(yHead - jy) < 6 * dpr;
  c.save();
  c.shadowColor = col; c.shadowBlur = pressedNear ? 22 * dpr : 10 * dpr;
  const hg = c.createLinearGradient(x, yHead - noteH / 2, x, yHead + noteH / 2);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.28, col); hg.addColorStop(1, shade(col, -28));
  c.fillStyle = hg;
  roundRect(c, x - w / 2, yHead - noteH / 2, w, noteH, noteH * 0.38);
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.65)';
  c.lineWidth = 1.2 * dpr;
  roundRect(c, x - w / 2, yHead - noteH / 2, w, noteH, noteH * 0.38);
  c.stroke();
  // inner glyph: holds get a ring, taps a bar
  c.strokeStyle = 'rgba(10,5,25,0.55)'; c.lineWidth = 2 * dpr;
  if (n.type === 'hold') {
    c.beginPath(); c.arc(x, yHead, noteH * 0.22, 0, 7); c.stroke();
  } else {
    c.beginPath(); c.moveTo(x - w * 0.18, yHead); c.lineTo(x + w * 0.18, yHead); c.stroke();
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (v >> 16) + amt));
  const gg = Math.max(0, Math.min(255, ((v >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (v & 255) + amt));
  return '#' + ((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0');
}
