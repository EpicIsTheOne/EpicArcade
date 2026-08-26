'use strict';
/* GRAYLINE — Night Shift :: game state machine */
window.G = window.G || {};

(function () {
  const HOURLEN = 50;
  const PWR = { base: 0.10, cam: 0.06, boost: 0.07, door: 0.09, hatch: 0.05, light: 0.045 };
  const HOUR_MULT = [1, 1.15, 1.32, 1.5, 1.68, 1.85];

  G.game = {
    mode: 'boot',
    paused: false,
    rt: 0,
    night: 1,
    bestNight: 1,
    clock: 0,
    hour: 0,
    power: 100,
    rate: PWR.base,
    camsUp: false,
    camFlipT: 0,
    curCam: 'atrium',
    doors: { L: false, R: false },
    hatch: false,
    lights: { L: false, R: false },
    boostHeld: false,
    boostEase: 0,
    sig: {},
    stalkers: [],
    wick: null,
    blackout: false,
    doomT: -1,
    hbT: 0,
    flicker: 0,
    glitch: 0,
    evT: 9,
    warn25: false,
    warn12: false,
    stats: { blocks: 0, closeCalls: 0 },
    timeScale: 1,

    loadProgress() {
      try {
        this.bestNight = Math.max(1, parseInt(localStorage.getItem('grayline_night') || '1', 10) || 1);
      } catch (e) { this.bestNight = 1; }
      return this.bestNight;
    },

    saveProgress() {
      try { localStorage.setItem('grayline_night', String(this.night + 1)); } catch (e) {}
    },

    resetProgress() {
      try { localStorage.setItem('grayline_night', '1'); } catch (e) {}
      this.bestNight = 1;
      this.night = 1;
    },

    startNight(n) {
      this.night = n;
      this.mode = 'briefing';
      G.ui.showBriefing(n);
    },

    resetRuntime() {
      this.clock = 0; this.hour = 0;
      this.power = 100; this.rate = PWR.base;
      this.camsUp = false; this.camFlipT = 0;
      this.curCam = 'atrium';
      this.doors = { L: false, R: false };
      this.hatch = false;
      this.lights = { L: false, R: false };
      this.boostHeld = false; this.boostEase = 0;
      this.blackout = false; this.doomT = -1; this.hbT = 0;
      this.flicker = 0; this.glitch = 0;
      this.evT = G.rand(8, 14);
      this.warn25 = false; this.warn12 = false;
      this.stats = { blocks: 0, closeCalls: 0 };
      this.timeScale = 1;
      const dOff = Math.min(60, (this.night - 1) * 9);
      this.stalkers = [
        new G.Stalker('foreman', Math.max(4, G.THREATS.foreman.spawnDelay - dOff)),
        new G.Stalker('mange', Math.max(22, G.THREATS.mange.spawnDelay - dOff))
      ];
      this.wick = new G.Wick(Math.max(48, G.THREATS.wick.spawnDelay - dOff));
      this.stalkers.push(this.wick);
      this.sig = {};
      for (const id of G.CAM_ORDER) {
        this.sig[id] = {
          base: G.rand(0.52, 0.72),
          sp: G.rand(0.10, 0.22),
          ph: G.rand(0, 6.28),
          ph2: G.rand(0, 6.28)
        };
      }
      if (G.audio.ctx) { G.audio.ambienceLevel(1); }
      G.ui.syncButtons(this);
    },

    begin() {
      this.mode = 'night';
      this.paused = false;
      G.audio.ensure();
      G.audio.ambienceLevel(1);
      G.ui.enterNight(this);
    },

    quickStart() {
      this.resetRuntime();
      this.begin();
    },

    hourFloat() { return Math.min(6, this.clock / HOURLEN); },

    difficulty() {
      const hm = HOUR_MULT[G.clamp(this.hour, 0, 5)];
      const nb = 1 + 0.13 * (this.night - 1);
      return Math.min(2.7, hm * nb);
    },

    barrierClosed(kind) {
      if (this.blackout) return false;
      const cfg = G.THREATS[kind];
      if (kind === 'wick') return this.hatch;
      return cfg.side === 'L' ? this.doors.L : this.doors.R;
    },

    isWatched(node) {
      return this.mode === 'night' && this.camsUp && this.curCam === node && this.effSig(node) >= 0.5;
    },

    sigVal(node) {
      const s = this.sig[node];
      if (!s) return 0.6;
      const t = this.rt;
      return G.clamp(s.base + 0.17 * Math.sin(t * s.sp + s.ph) + 0.07 * Math.sin(t * s.sp * 2.63 + s.ph2), 0.12, 0.93);
    },

    effSig(node) {
      let v = this.sigVal(node);
      if (this.camsUp && node === this.curCam) v = G.lerp(v, 1, this.boostEase);
      return v;
    },

    atDoorSide(side) {
      for (const s of this.stalkers) {
        if (s.mode === 'entry' && s.cfg.side === side) return s.kind;
      }
      return null;
    },

    toast(msg, alert) { G.ui.toast(msg, alert); },

    /* ---------- inputs ---------- */
    toggleCams(force) {
      if (this.mode !== 'night' || this.paused || this.blackout) return;
      const up = force !== undefined ? force : !this.camsUp;
      if (up === this.camsUp) return;
      this.camsUp = up;
      this.camFlipT = 0.28;
      G.audio.camFlip(up);
      G.ui.syncButtons(this);
    },
    setCam(id) {
      if (!this.camsUp) { this.toggleCams(true); }
      if (this.curCam !== id) {
        this.curCam = id;
        G.audio.staticBlip(0.05);
        G.ui.syncSidebar(this);
      }
    },
    cycleCam(dir) {
      if (!this.camsUp) return;
      const i = G.CAM_ORDER.indexOf(this.curCam);
      this.setCam(G.CAM_ORDER[(i + dir + G.CAM_ORDER.length) % G.CAM_ORDER.length]);
    },
    toggleDoor(side) {
      if (this.mode !== 'night' || this.paused || this.blackout) return;
      this.doors[side] = !this.doors[side];
      if (this.doors[side]) G.audio.doorSlam(); else G.audio.doorOpen();
      G.ui.syncButtons(this);
    },
    toggleLight(side) {
      if (this.mode !== 'night' || this.paused || this.blackout) return;
      this.lights[side] = !this.lights[side];
      if (this.lights[side]) G.audio.lightBuzzStart(side);
      else G.audio.lightBuzzStop(side);
      G.ui.syncButtons(this);
    },
    toggleHatch() {
      if (this.mode !== 'night' || this.paused || this.blackout) return;
      this.hatch = !this.hatch;
      if (this.hatch) G.audio.doorSlam(); else G.audio.doorOpen();
      G.ui.syncButtons(this);
    },
    setBoost(on) {
      this.boostHeld = !!on;
      G.ui.syncButtons(this);
    },

    /* ---------- flow ---------- */
    breach(kind) {
      if (this.mode !== 'night') return;
      this.mode = 'jumpscare';
      G.audio.lightBuzzStop('L'); G.audio.lightBuzzStop('R');
      G.audio.scream();
      G.ui.playScare(kind, () => {
        this.mode = 'lose';
        G.ui.showLose(kind, this);
      });
    },

    winNight() {
      if (this.mode !== 'night') return;
      this.mode = 'win';
      G.audio.bells();
      G.audio.chime();
      this.saveProgress();
      G.ui.showWin(this);
    },

    doBlackout() {
      this.blackout = true;
      this.doors.L = false; this.doors.R = false; this.hatch = false;
      this.lights.L = false; this.lights.R = false;
      this.camsUp = false; this.boostHeld = false;
      G.audio.lightBuzzStop('L'); G.audio.lightBuzzStop('R');
      G.audio.rumble(2.2);
      G.audio.ambienceLevel(0.15);
      this.doomT = G.rand(9, 16);
      this.hbT = 0.5;
      G.ui.syncButtons(this);
      G.ui.toast('POWER FAILURE', true);
    },

    fireEvent() {
      const r = Math.random();
      if (r < 0.38) return;
      if (r < 0.62) { this.flicker = 0.55; }
      else if (r < 0.80) { G.audio.rumble(G.rand(1.2, 2)); }
      else if (r < 0.92) { G.audio.staticBlip(0.07); this.glitch = 0.4; }
      else { G.audio.seizureBurst(); this.glitch = 0.7; }
    },

    /* ---------- update ---------- */
    update(rawDt) {
      if (this.mode !== 'night' || this.paused) return;
      const dt = Math.min(rawDt, 0.05) * this.timeScale;
      this.clock += dt;

      const newHour = Math.floor(this.clock / HOURLEN);
      if (newHour !== this.hour) {
        this.hour = newHour;
        if (newHour >= 6) { this.winNight(); return; }
        G.audio.hourBell();
        G.ui.toast((newHour === 12 ? '' : '') + ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM'][Math.min(newHour, 5)] + '');
      }

      if (this.camFlipT > 0) this.camFlipT -= rawDt;
      if (this.flicker > 0) this.flicker -= dt;
      if (this.glitch > 0) this.glitch -= dt;

      this.boostEase += ((this.boostHeld && this.camsUp ? 1 : 0) - this.boostEase) * Math.min(1, dt * 6);

      if (!this.blackout) {
        let rate = PWR.base;
        if (this.camsUp) rate += PWR.cam;
        if (this.camsUp && this.boostEase > 0.35) rate += PWR.boost;
        if (this.doors.L) rate += PWR.door;
        if (this.doors.R) rate += PWR.door;
        if (this.hatch) rate += PWR.hatch;
        if (this.lights.L) rate += PWR.light;
        if (this.lights.R) rate += PWR.light;
        this.rate = rate;
        this.power -= rate * dt * (1 + this.hour * 0.04);
        if (this.power <= 0) { this.power = 0; this.doBlackout(); }
        else {
          if (this.power < 25 && !this.warn25) { this.warn25 = true; G.ui.toast('LOW POWER', true); G.audio.beep(620, 0.09); setTimeout(() => G.audio.beep(620, 0.09), 260); }
          if (this.power < 12 && !this.warn12) { this.warn12 = true; G.ui.toast('CRITICAL POWER', true); G.audio.beep(430, 0.11); setTimeout(() => G.audio.beep(430, 0.11), 300); }
        }
      } else {
        this.hbT -= dt;
        if (this.hbT <= 0) { G.audio.heartbeat(); this.hbT = 1.05; }
        this.doomT -= dt;
        if (this.doomT <= 0) { this.breach('foreman'); return; }
      }

      for (const s of this.stalkers) s.update(dt, this);

      this.evT -= dt;
      if (this.evT <= 0) { this.fireEvent(); this.evT = G.rand(16, 34); }
    },

    /* ---------- render helpers ---------- */
    roomFigs(node) {
      const figs = [];
      let slot = 0;
      const esig = this.effSig(node);
      for (const s of this.stalkers) {
        if (s.node !== node || s.mode === 'entry' || s.mode === 'dormant') continue;
        const thresh = s.kind === 'wick' ? 0.30 : 0.42;
        if (esig >= thresh) figs.push({ kind: s.kind, slot: slot % 2, alpha: 0.94 });
        slot++;
      }
      if (esig < 0.62) {
        const bucket = Math.floor(this.rt / 3);
        if (G.hash(bucket * 3.7 + node.length * 7.7) < 0.32) {
          figs.push({ kind: G.hash(bucket + node.charCodeAt(0)) > 0.5 ? 'foreman' : 'mange', slot: (bucket % 2), alpha: 0.22, blip: true });
        }
      }
      return figs;
    },

    render(ctx) {
      const t = this.rt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 1280, 720);

      if (this.mode === 'boot' || this.mode === 'title' || this.mode === 'briefing' || this.mode === 'help' || this.mode === 'settings' || this.mode === 'win') {
        this.renderIdle(ctx, t);
        return;
      }
      if (this.mode === 'lose') {
        ctx.fillStyle = '#040405'; ctx.fillRect(0, 0, 1280, 720);
        G.FX.post(ctx, { grain: 0.16, tears: 2 });
        return;
      }
      if (this.mode === 'intro') {
        G.OFFICE.draw(ctx, { t, blackout: false, flicker: 0, lights: {}, doors: {}, atDoor: {}, power: this.power });
        G.FX.post(ctx, { grain: 0.09 });
        return;
      }

      // night / paused / jumpscare
      if (this.camsUp) {
        const room = G.ROOMS[this.curCam];
        if (room) {
          const E = { t, sig: this.effSig(this.curCam), figs: this.roomFigs(this.curCam) };
          room.draw(ctx, E);
          for (const f of E.figs) {
            const a = room.anchors[f.slot];
            const wob = f.blip ? Math.sin(t * 2.2) * 6 : 0;
            if (f.kind === 'foreman') G.FIG.foreman(ctx, a.x + wob, a.y, a.h, t, f.alpha);
            else if (f.kind === 'mange') G.FIG.mange(ctx, a.x, a.y, 150, t, f.alpha);
            else if (f.kind === 'wick') G.FIG.wick(ctx, a.x, a.y - a.h * 0.55, 9, t, f.alpha);
          }
        }
        const es = this.effSig(this.curCam);
        G.FX.post(ctx, {
          grain: 0.05 + Math.max(0, 1 - es) * 0.40,
          tears: this.glitch > 0 ? 4 : (es < 0.45 ? 2 : (Math.random() < 0.02 ? 1 : 0))
        });
      } else {
        G.OFFICE.draw(ctx, {
          t,
          blackout: this.blackout,
          flicker: this.flicker,
          lights: this.lights,
          doors: this.doors,
          hatch: this.hatch,
          atDoor: { L: this.atDoorSide('L'), R: this.atDoorSide('R'), C: this.atDoorSide('C') },
          wickAtHatch: this.atDoorSide('C') === 'wick',
          power: this.power
        });
        G.FX.post(ctx, { grain: 0.075, tears: this.glitch > 0 ? 3 : 0 });
      }
    },

    renderIdle(ctx, t) {
      ctx.save();
      const z = 1.04 + Math.sin(t * 0.05) * 0.02;
      ctx.translate(640, 360); ctx.scale(z, z); ctx.translate(-640, -360);
      const room = G.ROOMS.atrium;
      room.draw(ctx, { t, sig: 0.5, figs: [] });
      ctx.restore();
      ctx.fillStyle = 'rgba(2,2,4,0.42)';
      ctx.fillRect(0, 0, 1280, 720);
      G.FX.post(ctx, { grain: 0.14, tears: Math.random() < 0.03 ? 1 : 0 });
    }
  };

  G.game.loadProgress();
})();
