/* ============================================================
 * PULSEBREAK (PBK.v1) — js/game.js
 * Combat logic: judging windows, HP/score/combo, boss attacks,
 * surge specials, win/lose flow, fast restart, seek support.
 * ============================================================ */
window.RB = window.RB || {};

(function (RB) {
  'use strict';

  const PERFECT = 0.070;
  const GOOD = 0.140;
  const SURGE_GAIN = 34;
  const SPECIAL_DMG = 110;
  const SPECIAL_HEAL = 12;

  function multFor(combo) { return 1 + Math.min(Math.floor(combo / 16), 8) * 0.25; }

  class Game {
    constructor(song, audio) {
      this.song = song;
      this.audio = audio;
      this.notes = song.chart.map(n => ({
        t: n.t, lane: n.lane, kind: n.kind, intensity: n.intensity, dmg: n.dmg || 0,
        judged: false, j: null,
      }));
      this.resetRun();
    }

    resetRun() {
      this.state = 'menu';
      this.bossHP = this.song.bossMaxHP;
      this.bossDisplayHP = this.song.bossMaxHP;   // lag bar
      this.playerHP = this.song.playerMaxHP;
      this.score = 0; this.combo = 0; this.maxCombo = 0;
      this.counts = { P: 0, G: 0, M: 0 };
      this.simCount = 0;
      this.meter = 0; this.specials = 0;
      this.nextExpire = 0;
      this.fx = [];                                // discrete events drained by renderer
      this.pendingEnd = null;                      // {at, type}
      this.reason = null;
      this.autopilot = false;
      this.shake = 0;
      this.flashPlayerHurt = 0;
      this.flashBossHurt = 0;
      this.flashSpecial = 0;
      this.winDissolve = 0;
      this.lastSectionIdx = -1;
      this.runToken = this.runToken || 0;
      for (const n of this.notes) { n.judged = false; n.j = null; }
    }

    begin() {
      this.resetRun();
      this.runToken++;
      this.state = 'playing';
      this.audio.start(0);
    }

    // ---- helpers --------------------------------------------------------
    get now() { return this.audio.ctx ? this.audio.songTime() : 0; }
    get songPhase() { // 'countin' | 'sections'
      return this.now < this.song.sections[0].dur ? 'countin' : 'sections';
    }
    sectionAt(t) {
      const s = this.song.sections;
      for (let i = 1; i < s.length; i++) {
        if (t >= s[i].startT && t < s[i].startT + s[i].dur) return s[i];
      }
      return s[s.length - 1];
    }
    get mult() { return multFor(this.combo); }
    get accuracy() {
      const tot = this.counts.P + this.counts.G + this.counts.M;
      return tot === 0 ? 100 : (this.counts.P + this.counts.G * 0.6) / tot * 100;
    }
    get totalNotes() { return this.notes.length; }

    pushFx(kind, a, b) { this.fx.push({ kind, a, b }); if (this.fx.length > 64) this.fx.shift(); }

    // ---- judging ---------------------------------------------------------
    hitLane(lane) {
      if (this.state !== 'playing') return false;
      const t = this.now;
      let best = null, bestDt = Infinity;
      for (let i = this.nextExpire; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.t > t + GOOD) break;
        if (n.judged || n.lane !== lane) continue;
        const dt = Math.abs(n.t - t);
        if (dt <= GOOD && dt < bestDt) { best = n; bestDt = dt; }
      }
      if (!best) return false;
      this.applyJudge(best, bestDt <= PERFECT ? 'P' : 'G');
      return true;
    }

    applyJudge(n, j, opts) {
      const silent = opts && opts.silent;
      n.judged = true; n.j = j;
      if (!silent) this.counts[j]++;
      else this.simCount++;

      switch (n.kind) {
        case 'S': {
          const dmg = j === 'P' ? 24 + Math.min(this.combo, 48) / 48 * 8 : 13;
          this.combo++;
          if (!silent) {
            this.score += Math.round((j === 'P' ? 100 : 50) * this.mult);
            this.pushFx('judge', j, n.lane);
            this.pushFx('bossHurt', dmg);
            this.flashBossHurt = 1;
            this.audio.sfxHit(j);
          } else {
            this.score += Math.round((j === 'P' ? 100 : 50) * multFor(this.combo));
          }
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.damageBoss(dmg, silent);
          break;
        }
        case 'G': {
          this.combo++;
          if (!silent) {
            this.score += Math.round(30 * this.mult);
            this.pushFx('judge', j, n.lane);
            this.pushFx('block', j);
            this.audio.sfxBlock();
          }
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          break;
        }
        case 'U': {
          this.combo++;
          this.meter += SURGE_GAIN;
          if (!silent) {
            this.score += Math.round(40 * this.mult);
            this.pushFx('judge', j, n.lane);
          }
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          break;
        }
      }
    }

    missNote(n, opts) {
      const silent = opts && opts.silent;
      n.judged = true; n.j = 'M';
      if (!silent) this.counts.M++;
      else this.simCount++;
      if (n.kind === 'G') {
        if (!silent) {
          this.hurtPlayer(n.dmg);
          this.pushFx('impact', n.dmg);
          this.shake = Math.min(1, this.shake + 0.5);
          this.audio.sfxBossHurtBig();
        } else {
          this.playerHP = Math.max(0, this.playerHP - n.dmg);
        }
      } else {
        this.combo = 0;
        if (!silent) {
          this.pushFx('judge', 'M', n.lane);
          this.audio.sfxMiss();
        }
      }
    }

    damageBoss(dmg, silent) {
      this.bossHP -= dmg;
      if (this.bossHP <= 0 && !silent) {
        this.bossHP = 0;
        this.triggerWin();
      } else if (this.bossHP <= 0) {
        this.bossHP = 0;
      }
    }

    hurtPlayer(dmg) {
      this.playerHP = Math.max(0, this.playerHP - dmg);
      this.flashPlayerHurt = 1;
      this.combo = 0;
      if (this.playerHP <= 0 && this.state === 'playing') this.triggerLose('hp');
    }

    castSpecial(silent) {
      this.meter = 0;
      this.specials++;
      this.bossHP = Math.max(0, this.bossHP - SPECIAL_DMG);
      this.playerHP = Math.min(this.song.playerMaxHP, this.playerHP + SPECIAL_HEAL);
      if (!silent) {
        this.pushFx('special');
        this.flashSpecial = 1;
        this.shake = 1;
        this.audio.sfxSpecial();
        if (this.bossHP <= 0) this.triggerWin();
      }
    }

    // ---- endings ----------------------------------------------------------
    triggerWin() {
      if (this.state !== 'playing') return;
      const tok = ++this.runToken;
      this.state = 'wonPending';
      this.pendingEnd = { at: 1.25, type: 'won' };
      this.audio.finished = true;
      this.reason = 'boss';
      setTimeout(() => {
        if (this.runToken !== tok) return;
        try { this.audio.stopAll(); this.audio.sfxSpecial(); } catch (e) {}
      }, 550);
    }

    triggerLose(reason) {
      if (this.state !== 'playing') return;
      const tok = ++this.runToken;
      this.state = 'lostPending';
      this.pendingEnd = { at: 1.0, type: 'lost' };
      this.audio.finished = true;
      this.reason = reason;
      setTimeout(() => {
        if (this.runToken !== tok) return;
        try { this.audio.stopAll(); } catch (e) {}
      }, 400);
    }

    rank() {
      if (this.state !== 'won') return null;
      const a = this.accuracy;
      if (a >= 95) return 'S';
      if (a >= 88) return 'A';
      if (a >= 78) return 'B';
      return 'C';
    }

    // ---- seek (debug/test hook; also powers instant restart) ---------------
    seek(tSec) {
      this.resetRun();
      this.state = 'playing';
      const t = Math.max(0, tSec);
      for (const n of this.notes) {
        if (n.t < t - 0.05) {
          if (n.kind === 'U' && this.meter + SURGE_GAIN >= 100) this.castSpecial(true);
          else if (n.kind !== 'U') this.applyJudge(n, 'P', { silent: true });
          else this.meter += SURGE_GAIN;
        }
      }
      this.meter = Math.min(this.meter, 99);
      this.nextExpire = 0;
      while (this.nextExpire < this.notes.length && this.notes[this.nextExpire].t < t - 0.2) this.nextExpire++;
      this.audio.seek(t);
    }

    // ---- per-frame ----------------------------------------------------------
    update(dtReal) {
      // pending win/lose transitions use real time (audio may be halted)
      if (this.pendingEnd) {
        this.pendingEnd.at -= dtReal;
        if (this.pendingEnd.type === 'won') this.winDissolve = Math.min(1, 1 - this.pendingEnd.at / 1.25);
        if (this.pendingEnd.at <= 0) {
          this.state = this.pendingEnd.type;
          this.pendingEnd = null;
        }
      }
      if (this.state !== 'playing') {
        this.shake = Math.max(0, this.shake - dtReal * 3);
        this.flashPlayerHurt = Math.max(0, this.flashPlayerHurt - dtReal * 2.4);
        this.flashBossHurt = Math.max(0, this.flashBossHurt - dtReal * 3.5);
        this.flashSpecial = Math.max(0, this.flashSpecial - dtReal * 1.6);
        return;
      }

      const t = this.now;

      // autopilot: perfect-play every note as it arrives
      if (this.autopilot) {
        for (let i = this.nextExpire; i < this.notes.length; i++) {
          const n = this.notes[i];
          if (n.t > t) break;
          if (!n.judged) this.applyJudge(n, 'P');
        }
      }

      // expire unjudged notes whose FULL late window has passed
      while (this.nextExpire < this.notes.length) {
        const n = this.notes[this.nextExpire];
        if (n.t + GOOD > t) break;
        if (!n.judged) this.missNote(n);
        this.nextExpire++;
      }

      // special auto-cast
      if (this.meter >= 100 && this.bossHP > 0) this.castSpecial(false);

      // song end without boss kill => consumed by the encore
      if (t >= this.song.songDur + 0.4 && this.bossHP > 0 && !this.pendingEnd) {
        this.triggerLose('encore');
      }

      // section change toast data (renderer polls name itself)
      const sec = this.sectionAt(t);
      this.lastSectionIdx = this.song.sections.indexOf(sec);

      this.bossDisplayHP += (Math.max(0, this.bossHP) - this.bossDisplayHP) * Math.min(1, dtReal * 4);
      this.shake = Math.max(0, this.shake - dtReal * 3);
      this.flashPlayerHurt = Math.max(0, this.flashPlayerHurt - dtReal * 2.4);
      this.flashBossHurt = Math.max(0, this.flashBossHurt - dtReal * 3.5);
      this.flashSpecial = Math.max(0, this.flashSpecial - dtReal * 1.6);
    }

    drainFx() {
      const f = this.fx;
      this.fx = [];
      return f;
    }

    stats() {
      return {
        version: 'PBK.v1',
        state: this.state,
        songTime: +this.now.toFixed(3),
        bossHP: Math.ceil(this.bossHP), bossMax: this.song.bossMaxHP,
        playerHP: Math.ceil(this.playerHP),
        score: this.score, combo: this.combo, maxCombo: this.maxCombo,
        acc: +this.accuracy.toFixed(1),
        counts: { ...this.counts },
        meter: this.meter, specials: this.specials,
        notesTotal: this.notes.length,
        section: this.sectionAt(Math.max(0, this.now)).id,
        rank: this.rank(),
        reason: this.reason,
      };
    }
  }

  RB.PERFECT = PERFECT;
  RB.GOOD = GOOD;
  RB.Game = Game;

})(window.RB);
