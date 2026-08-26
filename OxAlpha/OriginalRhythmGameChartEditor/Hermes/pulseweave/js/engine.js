/* ============================================================
   PULSEWEAVE · engine.js — gameplay: highway, judging, fx, HUD
   ============================================================ */
window.PW = window.PW || {};
PW.Engine = (function () {
  'use strict';

  const LANE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  const LANE_LABELS = ['D', 'F', 'J', 'K'];
  const LANE_COLORS = ['#35e6ff', '#ff4fd8', '#b6ff3c', '#ffb347'];
  const ARROW_KEYS = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };

  const WIN = { perfect: .045, great: .09, good: .135, missAt: .16 };
  const COUNTDOWN = 2.4;

  class Game {
    constructor(opts) {
      this.canvas = opts.canvas;
      this.ctx2d = opts.canvas.getContext('2d');
      this.chart = opts.chart;
      this.buffer = opts.buffer;
      this.startSec = PW.Charts.beatToSec(opts.chart, opts.startBeat || 0);
      this.returnTo = opts.returnTo || 'menu';
      this.onExit = opts.onExit;
      this.autopilot = !!opts.autopilot;

      this.settings = PW.Store.settings();
      this.speed = this.settings.speed;
      this.offSec = (this.settings.offsetMs || 0) / 1000;

      // runtime notes
      this.notes = opts.chart.notes.map((n, i) => ({
        i,
        b: n.b, lane: n.lane | 0, type: n.t,
        d: n.d || 0,
        sec: PW.Charts.beatToSec(opts.chart, n.b),
        tailSec: PW.Charts.beatToSec(opts.chart, n.b + (n.t === 'hold' ? n.d : 0)),
        w: n.t === 'hold' ? 10 + Math.max(2, Math.round((n.d || 0) * 4)) : 10,
        state: 'pending',            // pending | active | done
        judge: null, dropped: false, nextTick: 0, headY: 0
      }));
      this.byLane = [[], [], [], []];
      this.notes.forEach(n => this.byLane[n.lane].push(n));
      this.totalWeight = this.notes.reduce((s, n) => s + n.w, 0);
      this.unit = 1000000 / this.totalWeight;

      this.resetStats();
      this.pressed = [false, false, false, false];
      this.laneFlash = [0, 0, 0, 0];
      this.autoHoldNote = [null, null, null, null];

      // fx pools (bounded)
      this.rings = []; this.parts = [];
      this.judgeFx = null;           // {text,color,t}
      this.comboPop = 0;
      this.bgStars = [];
      for (let i = 0; i < 90; i++) this.bgStars.push({ x: Math.random(), y: Math.random(), s: .4 + Math.random() * 1.6 });
      this.spectrum = new Uint8Array(64);

      this.state = 'countdown';
      this.countdownT = COUNTDOWN;
      this.play = null;
      this.finishedSent = false;
      this._lastFrame = performance.now();
      this._hudCache = {};
      this._raf = null;

      this._onKeyDown = (e) => {
        if (e.repeat) return;
        const lane = LANE_KEYS.indexOf(e.code);
        if (lane < 0 && !(e.code in ARROW_KEYS)) return;
        if (e.code === 'Escape') { e.preventDefault(); this.togglePause(); return; }
        if (this.state !== 'playing') return;
        e.preventDefault();
        const l = lane >= 0 ? lane : ARROW_KEYS[e.code];
        this.press(l);
      };
      this._onKeyUp = (e) => {
        const lane = LANE_KEYS.indexOf(e.code);
        if (lane < 0 && !(e.code in ARROW_KEYS)) return;
        const l = lane >= 0 ? lane : ARROW_KEYS[e.code];
        if (this.state === 'playing') this.release(l);
      };
      this._onBlur = () => { if (this.state === 'playing') this.togglePause(true); };

      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', this._onBlur);
    }

    resetStats() {
      this.score = 0; this.combo = 0; this.maxCombo = 0;
      this.accNum = 0; this.accDen = 0;
      this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
      this.cursor = 0;   // first possibly-unresolved note index (by sec)
    }

    // ---------- lifecycle ----------
    begin() {
      this.resize();
      this._raf = requestAnimationFrame(this._loop = (t) => this.frame(t));
    }

    pos() {
      if (this.play) return this.play.pos();
      return this.startSec - this.countdownT;
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
        this.canvas.width = w * dpr; this.canvas.height = h * dpr;
      }
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = w; this.H = h;
    }

    togglePause(forcePause) {
      if (this.state === 'playing' || forcePause === true) {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        PW.Music.suspend();
        document.getElementById('pauseOverlay').classList.remove('hidden');
        const st = document.getElementById('pauseStats');
        st.textContent = `score ${fmt(this.score)} · ${this.accStr()} · combo ${this.combo}`;
        setPlayBtn(false);
      } else if (this.state === 'paused') {
        this.state = 'playing';
        PW.Music.resume();
        document.getElementById('pauseOverlay').classList.add('hidden');
        this._lastFrame = performance.now();
        setPlayBtn(true);
      }
    }

    restart() {
      PW.Music.stopPlayback();
      document.getElementById('pauseOverlay').classList.add('hidden');
      this.notes.forEach(n => { n.state = 'pending'; n.judge = null; n.dropped = false; n.nextTick = 0; });
      this.resetStats();
      this.rings.length = 0; this.parts.length = 0; this.judgeFx = null;
      this.autoHoldNote = [null, null, null, null];
      this.state = 'countdown'; this.countdownT = COUNTDOWN; this.finishedSent = false;
      setPlayBtn(true);
    }

    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this._raf);
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('blur', this._onBlur);
      PW.Music.stopPlayback();
    }

    finish() {
      if (this.finishedSent) return;
      this.finishedSent = true;
      this.state = 'done';
      PW.Music.stopPlayback();
      // final accuracy over full chart weight
      const acc = this.accNum / this.totalWeight * 100;
      const results = {
        score: this.score, acc,
        counts: { ...this.counts }, maxCombo: this.maxCombo,
        grade: gradeFor(acc), chart: this.chart, returnTo: this.returnTo
      };
      PW.Music.flourish(acc >= 88);
      setTimeout(() => this.onExit(results), 650);
    }

    // ---------- input / judging ----------
    press(lane, tOverride) {
      if (this.pressed[lane]) return;
      this.pressed[lane] = true;
      this.laneFlash[lane] = 1;
      const t = tOverride !== undefined ? tOverride : this.pos();

      // continue an active hold? (re-press after brief release grace not needed)
      let best = null, bestDt = Infinity;
      for (const n of this.byLane[lane]) {
        if (n.state !== 'pending') continue;
        const dt = t - n.sec;
        if (dt > WIN.missAt + .05 || dt < -WIN.good - .02) continue;
        const ad = Math.abs(dt);
        if (ad < bestDt) { bestDt = ad; best = n; }
      }
      if (!best) return;
      const dt = t - best.sec - this.offSec;
      let judge = null;
      if (Math.abs(dt) <= WIN.perfect) judge = 'perfect';
      else if (Math.abs(dt) <= WIN.great) judge = 'great';
      else if (Math.abs(dt) <= WIN.good) judge = 'good';
      if (!judge) return;
      this.applyJudge(best, judge);
      if (best.type === 'hold') {
        best.state = 'active';
        best.nextTick = best.sec + .5 * PW.Music.SPB;
        this.spawnBurst(lane, judgeColor(judge), 10);
      } else {
        best.state = 'done';
        this.spawnBurst(lane, judgeColor(judge), 14);
      }
    }

    release(lane, tOverride) {
      this.pressed[lane] = false;
      const t = tOverride !== undefined ? tOverride : this.pos();
      const n = this.notes.find(x => x.lane === lane && x.state === 'active');
      if (!n) return;
      if (t < n.tailSec - .12) {
        // dropped the hold
        n.dropped = true; n.state = 'done'; n.judge = 'miss';
        this.counts.miss++; this.combo = 0;
        this.showJudge('DROP', '#ff5470');
        this.comboPop = 0;
      } else {
        n.state = 'done';
        this.score += Math.round(this.unit * 5);
        this.spawnBurst(lane, '#ffffff', 8);
      }
    }

    applyJudge(note, judge) {
      note.judge = judge;
      this.counts[judge]++;
      const mult = { perfect: 1, great: .7, good: .3 }[judge];
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      const cb = (1 + Math.min(this.combo, 100) / 100 * .1) / 1.1;
      this.score += Math.round(this.unit * note.w * mult * cb);
      this.accNum += note.w * mult; this.accDen += note.w;
      this.showJudge(judge.toUpperCase(), judgeColor(judge));
      this.comboPop = 1;
    }

    showJudge(text, color) { this.judgeFx = { text, color, t: 0 }; }

    spawnBurst(lane, color, count) {
      const geo = this.geo();
      const x = geo.x0 + geo.laneW * (lane + .5), y = geo.hitY;
      if (this.rings.length < 40) this.rings.push({ x, y, r: 8, v: 260, a: 1, color });
      for (let i = 0; i < count; i++) {
        if (this.parts.length >= 200) break;
        const ang = Math.PI * (1 + Math.random());
        const sp = 90 + Math.random() * 240;
        this.parts.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          life: .38 + Math.random() * .25, t: 0, color, size: 2 + Math.random() * 2.6
        });
      }
    }

    accStr() {
      const d = this.accDen || 1;
      return (this.accNum / d * 100).toFixed(2) + '%';
    }

    // ---------- update ----------
    update(dt) {
      const p = this.pos();

      if (this.state === 'countdown') {
        this.countdownT -= dt;
        const prevC = Math.ceil(this.countdownT + dt), nowC = Math.ceil(this.countdownT);
        if (nowC !== prevC && nowC > 0) PW.Music.tick(nowC === 1);
        if (this.countdownT <= 0) {
          this.state = 'playing';
          this.play = PW.Music.playBuffer(this.buffer, Math.max(0, this.startSec));
          setPlayBtn(true);
        }
      }

      if (this.state === 'playing') {
        // autopilot drives the real press/release paths
        if (this.autopilot) {
          for (const n of this.notes) {
            if (n.state !== 'pending' && n.state !== 'active') continue;
            if (n.type === 'hold' && n.state === 'active') {
              if (p >= n.tailSec - .001 && this.autoHoldNote[n.lane] === n) {
                this.release(n.lane, n.tailSec);
                this.autoHoldNote[n.lane] = null;
              }
              continue;
            }
            if (p >= n.sec) {
              this.press(n.lane, n.sec);
              if (n.type === 'hold' && n.state === 'active') this.autoHoldNote[n.lane] = n;
              else this.pressed[n.lane] = false; // tap: key lifted again
            }
          }
        }

        // hold ticks & active-hold visuals
        for (const n of this.notes) {
          if (n.state !== 'active') continue;
          while (p >= n.nextTick) {
            n.nextTick += .5 * PW.Music.SPB;
            if (n.nextTick <= n.tailSec + .01) {
              this.combo++;
              if (this.combo > this.maxCombo) this.maxCombo = this.combo;
              this.score += Math.round(this.unit * 1.2);
            }
          }
        }

        // miss sweep
        while (this.cursor < this.notes.length) {
          const n = this.notes[this.cursor];
          if (p > n.tailSec + WIN.missAt) {
            if (n.state === 'pending') {
              n.state = 'done'; n.judge = 'miss';
              this.counts.miss++; this.combo = 0;
              this.showJudge('MISS', '#8a93b8');
            }
            this.cursor++;
          } else break;
        }

        // end of song
        if (p >= this.buffer.duration - .15) this.finish();
      }

      // decay fx
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i]; r.r += r.v * dt; r.a -= dt * 3.2;
        if (r.a <= 0) this.rings.splice(i, 1);
      }
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i]; q.t += dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 420 * dt;
        if (q.t >= q.life) this.parts.splice(i, 1);
      }
      if (this.judgeFx) { this.judgeFx.t += dt; if (this.judgeFx.t > .7) this.judgeFx = null; }
      this.comboPop = Math.max(0, this.comboPop - dt * 5);
      for (let l = 0; l < 4; l++) this.laneFlash[l] = Math.max(0, this.laneFlash[l] - dt * 4);
    }

    // ---------- render ----------
    geo() {
      const hw = Math.min(this.W * .52, 560);
      return {
        hw, x0: (this.W - hw) / 2, laneW: hw / 4,
        hitY: this.H * .82, pps: this.speed
      };
    }

    beatPhase() {
      const c = this.chart;
      return ((this.pos() - c.meta.offset / 1000) / PW.Charts.secPerBeat(c) % 1 + 1) % 1;
    }

    render(dt) {
      const g = this.ctx2d, W = this.W, H = this.H, geo = this.geo();
      const pulse = Math.exp(-this.beatPhase() * 5);
      const an = PW.Music.getAnalyser();
      if (an) an.getByteFrequencyData(this.spectrum);

      // background
      const bgGrad = g.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, `rgb(${11 + pulse * 14},${14 + pulse * 10},${34 + pulse * 26})`);
      bgGrad.addColorStop(.55, '#0a0d20');
      bgGrad.addColorStop(1, '#05070f');
      g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);

      // stars
      g.fillStyle = `rgba(190,210,255,${.28 + pulse * .22})`;
      const drift = (this.pos() * 14) % H;
      for (const s of this.bgStars) {
        const y = (s.y * H + drift * s.s) % H;
        g.globalAlpha = .18 + s.s * .18;
        g.fillRect(s.x * W, y, s.s, s.s);
      }
      g.globalAlpha = 1;

      // horizon grid
      const gy = H * .42;
      g.strokeStyle = `rgba(80,110,255,${.10 + pulse * .13})`;
      g.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const y = gy + ((i * 46 + (this.pos() * this.speed * .12) % 46)) % (H - gy);
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      const cx = W / 2;
      for (let i = -7; i <= 7; i++) {
        g.beginPath(); g.moveTo(cx + i * 36, gy); g.lineTo(cx + i * 240, H); g.stroke();
      }

      // spectrum bars flanking highway
      if (an) {
        const bw = Math.min(14, (geo.x0 - 20) / this.spectrum.length);
        for (let i = 0; i < this.spectrum.length; i++) {
          const v = this.spectrum[i] / 255;
          const bh = v * H * .30 * (.55 + pulse * .45);
          const hue = 200 + i * 2;
          g.fillStyle = `hsla(${hue},90%,60%,${.10 + v * .3})`;
          g.fillRect(geo.x0 - 16 - bw * (i + 1), H - bh - 40, bw - 2, bh);
          g.fillRect(geo.x0 + geo.hw + 16 + bw * i, H - bh - 40, bw - 2, bh);
        }
      }

      // highway panel
      const hg = g.createLinearGradient(0, 0, 0, H);
      hg.addColorStop(0, 'rgba(10,13,32,.28)');
      hg.addColorStop(1, 'rgba(10,13,32,.72)');
      g.fillStyle = hg; g.fillRect(geo.x0, 0, geo.hw, H);
      g.strokeStyle = 'rgba(120,150,255,.22)';
      for (let l = 0; l <= 4; l++) {
        const x = geo.x0 + l * geo.laneW;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }

      // lane beams (press feedback)
      for (let l = 0; l < 4; l++) {
        const f = this.laneFlash[l];
        if (f <= 0) continue;
        const lg = g.createLinearGradient(0, geo.hitY, 0, 0);
        lg.addColorStop(0, hexA(LANE_COLORS[l], .30 * f));
        lg.addColorStop(1, hexA(LANE_COLORS[l], 0));
        g.fillStyle = lg;
        g.fillRect(geo.x0 + l * geo.laneW + 2, 0, geo.laneW - 4, geo.hitY);
      }

      // notes
      const yFor = (sec) => geo.hitY - (sec - this.pos()) * geo.pps;
      const drawNotes = [];
      for (const n of this.notes) {
        if (n.state === 'done' && n.type === 'tap') continue;
        const yHead = yFor(n.sec);
        if (yHead < -160 || yHead > H + 200) continue;
        drawNotes.push([n, yHead]);
      }
      // hold bodies first (under heads)
      for (const [n, yHead] of drawNotes) {
        if (n.type !== 'hold') continue;
        if (n.state === 'done' && !n.dropped) continue;
        const yTail = yFor(n.tailSec);
        const top = Math.min(yHead, yTail), hgt = Math.abs(yTail - yHead);
        if (top > H + 60 || top + hgt < -80) continue;
        const col = n.dropped ? '#5a6076' : LANE_COLORS[n.lane];
        const nx = geo.x0 + n.lane * geo.laneW;
        const bw = geo.laneW * .56;
        g.fillStyle = hexA(col, n.state === 'active' ? .85 : n.dropped ? .18 : .42);
        roundRect(g, nx + (geo.laneW - bw) / 2, top, bw, Math.max(6, hgt), bw / 2); g.fill();
        if (n.state === 'active') {
          g.fillStyle = 'rgba(255,255,255,.9)';
          g.fillRect(nx + (geo.laneW - bw) / 2, yTail - 3, bw, 3);
          if (Math.random() < .5 && this.parts.length < 200)
            this.parts.push({ x: nx + geo.laneW / 2 + (Math.random() - .5) * bw, y: yHead, vx: 0, vy: -(60 + Math.random() * 140), life: .4, t: 0, color: col, size: 2 });
        }
      }
      // heads/taps
      for (const [n, y] of drawNotes) {
        if (n.state !== 'pending' && n.state !== 'active') continue;
        const col = n.judge === 'miss' ? '#5a6076' : LANE_COLORS[n.lane];
        const nx = geo.x0 + n.lane * geo.laneW;
        const nw = geo.laneW - 12, nh = Math.max(14, Math.min(24, geo.pps * .03));
        const grad = g.createLinearGradient(nx + 6, y - nh, nx + 6 + nw, y + nh);
        grad.addColorStop(0, hexA(col, .98));
        grad.addColorStop(1, hexA(col, .62));
        g.fillStyle = grad;
        g.shadowColor = col; g.shadowBlur = 14;
        roundRect(g, nx + 6, y - nh / 2, nw, nh, nh / 2); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.92)';
        roundRect(g, nx + 6 + nw * .18, y - nh * .18, nw * .64, nh * .36, nh * .18); g.fill();
      }

      // receptors
      for (let l = 0; l < 4; l++) {
        const x = geo.x0 + l * geo.laneW + 6;
        const w = geo.laneW - 12, y = geo.hitY;
        const pressedGlow = this.pressed[l] ? 1 : 0;
        g.lineWidth = 2.5;
        g.strokeStyle = LANE_COLORS[l];
        g.shadowColor = LANE_COLORS[l];
        g.shadowBlur = 8 + pressedGlow * 18 + pulse * 6;
        roundRect(g, x, y - 13, w, 26, 13);
        g.stroke();
        g.shadowBlur = 0;
        if (pressedGlow) {
          g.fillStyle = hexA(LANE_COLORS[l], .35);
          roundRect(g, x, y - 13, w, 26, 13); g.fill();
        }
        g.fillStyle = 'rgba(220,230,255,.75)';
        g.font = '700 13px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillText(LANE_LABELS[l], x + w / 2, y + 42);
      }

      // rings
      for (const r of this.rings) {
        g.strokeStyle = hexA(r.color, Math.max(0, r.a));
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke();
      }
      // particles
      for (const q of this.parts) {
        g.globalAlpha = Math.max(0, 1 - q.t / q.life);
        g.fillStyle = q.color;
        g.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      g.globalAlpha = 1;

      // judgment popup
      if (this.judgeFx) {
        const jf = this.judgeFx;
        const pop = 1 + .4 * Math.exp(-jf.t * 9);
        const alpha = jf.t < .45 ? 1 : Math.max(0, 1 - (jf.t - .45) / .25);
        g.save();
        g.translate(cx, geo.hitY - 110);
        g.scale(pop, pop);
        g.globalAlpha = alpha;
        g.font = '900 30px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.shadowColor = jf.color; g.shadowBlur = 18;
        g.fillStyle = jf.color;
        g.fillText(jf.text, 0, 0);
        g.restore();
        g.globalAlpha = 1; g.shadowBlur = 0;
      }

      // combo
      if (this.combo >= 2) {
        const cp = 1 + this.comboPop * .18;
        g.save();
        g.translate(cx, geo.hitY - 168);
        g.scale(cp, cp);
        g.font = '900 44px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.shadowColor = '#35e6ff'; g.shadowBlur = 16;
        g.fillText(String(this.combo), 0, 0);
        g.shadowBlur = 0;
        g.font = '700 12px "Segoe UI", sans-serif';
        g.fillStyle = 'rgba(200,215,255,.85)';
        g.fillText('COMBO', 0, 18);
        g.restore();
      }

      // countdown
      if (this.state === 'countdown') {
        const n = Math.ceil(this.countdownT);
        const frac = this.countdownT - Math.floor(this.countdownT);
        g.save();
        g.translate(cx, H * .38);
        g.scale(1 + (1 - frac) * .3, 1 + (1 - frac) * .3);
        g.globalAlpha = Math.min(1, frac * 2);
        g.font = '900 110px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.shadowColor = '#35e6ff'; g.shadowBlur = 40;
        g.fillText(String(Math.max(1, n)), 0, 0);
        g.restore();
        g.globalAlpha = 1; g.shadowBlur = 0;
        g.font = '600 15px "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(200,215,255,.8)';
        g.fillText('D · F · J · K', cx, H * .38 + 60);
      }

      this.updateHud(p);
    }

    updateHud(p) {
      const s = fmt(this.score);
      if (this._hudCache.score !== s) {
        document.getElementById('hudScore').textContent = s;
        this._hudCache.score = s;
      }
      const a = this.accStr();
      if (this._hudCache.acc !== a) {
        document.getElementById('hudAcc').textContent = a;
        document.getElementById('hudMiss').textContent = 'miss ' + this.counts.miss;
        this._hudCache.acc = a;
      }
      const prog = Math.min(1, Math.max(0, p / this.buffer.duration));
      const pw = (prog * 100).toFixed(2) + '%';
      if (this._hudCache.prog !== pw) {
        document.getElementById('progressFill').style.width = pw;
        document.getElementById('progressKnob').style.left = `calc(${pw} - 4px)`;
        this._hudCache.prog = pw;
      }
    }

    frame(t) {
      const dt = Math.min(.05, (t - this._lastFrame) / 1000);
      this._lastFrame = t;
      if (this.state === 'playing' || this.state === 'countdown') this.update(dt);
      else { /* paused/done: decay fx only */
        for (let l = 0; l < 4; l++) this.laneFlash[l] = Math.max(0, this.laneFlash[l] - dt * 4);
      }
      this.render(0);
      if (!this.destroyed) this._raf = requestAnimationFrame(this._loop);
    }
  }

  // ---------- helpers ----------
  function fmt(n) { return String(Math.max(0, Math.round(n))).padStart(6, '0'); }
  function judgeColor(j) { return { perfect: '#35e6ff', great: '#b6ff3c', good: '#ffb347', miss: '#8a93b8' }[j]; }
  function gradeFor(acc) {
    if (acc >= 99) return 'SSS';
    if (acc >= 97) return 'SS';
    if (acc >= 94) return 'S';
    if (acc >= 88) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 70) return 'C';
    return 'D';
  }
  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${gg},${b},${a})`;
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function setPlayBtn(playing) {
    const el = document.getElementById('btnPauseGame');
    if (el) el.textContent = playing ? '⏸' : '▶';
  }

  return { Game, LANE_KEYS, LANE_LABELS, LANE_COLORS, gradeFor };
})();
