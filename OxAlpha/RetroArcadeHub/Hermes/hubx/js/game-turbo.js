/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — TURBO LANES (highway lane racer) */
(() => {
  const U = ARC.util;
  const LANES = 4, ROAD_L = 70, ROAD_W = 340;
  const laneX = i => ROAD_L + ROAD_W / LANES * (i + .5);

  const CAR_COLORS = ['#28c8d8', '#b06cff', '#ffd23e', '#4a7dff', '#e8ecff', '#ff7b3e'];
  const BILLS = ['NITRO COLA', 'OX OIL', 'RETRO FM 88.8', 'MOTEL ★★'];

  class TurboLanes extends ARC.BaseGame {
    onReset() {
      this.time = 0;
      this.lives = null;
      this.speed = .3;          // 0..1 throttle
      this.dist = 0;
      this.scroll = 0;
      this.combo = 0; this.comboT = 0;
      this.car = { lane: 1, x: laneX(1), tilt: 0 };
      this.traffic = [];
      this.spawnT = 1;
      this.dying = 0;
      this.billT = 0; this.bills = [];   // roadside billboards {side,y,txt}
    }

    get scrollSpd() { return this.speed * 560; }
    get kmh() { return Math.round(this.speed * 248); }

    onStart() { this.say('GREEN LIGHT!', '#ffe86b'); }

    // slow-mo crash cinematic overrides frame
    frame(rawDt) {
      if (this.dying > 0) {
        this.timescale = .18;
        const dt = rawDt * this.timescale;
        for (const c of this.traffic) c.y += c.rel * dt * .5;
        this.parts.update(dt); this.floats.update(dt); this.shake.update(rawDt);
        for (let i = this.banners.length - 1; i >= 0; i--) { this.banners[i].t += rawDt; if (this.banners[i].t > 1.7) this.banners.splice(i, 1); }
        this.render();
        this.dying -= rawDt;
        if (this.dying <= 0) { this.timescale = 1; this.endRun(); }
        return;
      }
      super.frame(rawDt);
    }

    update(dt) {
      const C = this.car;
      this.time += dt;

      // --- throttle ---
      const inp = ARC.input.axis();
      if (inp.y < 0) this.speed += dt * .34;
      else if (inp.y > 0) this.speed -= dt * .55;
      else this.speed -= dt * .07;
      const floor = U.clamp(.26 + this.time * .007, .26, .82);
      this.speed = U.clamp(this.speed, Math.min(floor, .95), .98);
      if (Math.abs(inp.x)) this.hudThrottleGlow = true;

      // --- lane change ---
      let wantChange = 0;
      if (ARC.input.pressed('ArrowLeft') || ARC.input.pressed('KeyA')) wantChange = -1;
      if (ARC.input.pressed('ArrowRight') || ARC.input.pressed('KeyD')) wantChange = 1;
      if (wantChange) {
        const nl = U.clamp(C.lane + wantChange, 0, LANES - 1);
        if (nl !== C.lane) {
          C.lane = nl;
          ARC.audio.sfx.skid();
          for (let i = 0; i < 5; i++)
            this.parts.spawn({ x: C.x + U.rand(-14, 14), y: this.H - 66, vx: -wantChange * U.rand(30, 80), vy: U.rand(20, 60), life: .5, size: 4, color: '#555a77' });
        }
      }
      const px0 = C.x;
      C.x += (laneX(C.lane) - C.x) * Math.min(1, dt * 11);
      C.tilt = U.clamp((C.x - px0) / dt * .0016, -.3, .3);

      // --- world scroll ---
      const ss = this.scrollSpd;
      this.scroll += ss * dt;
      this.dist += ss * dt;
      this.addScore(ss * dt / 9);

      // --- combo decay ---
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;

      // --- billboards ---
      this.billT -= dt;
      if (this.billT <= 0) {
        this.billT = U.rand(1.4, 2.6);
        this.bills.push({ side: U.chance(.5) ? 0 : 1, y: -40, txt: U.pick(BILLS) });
      }
      for (let i = this.bills.length - 1; i >= 0; i--) {
        this.bills[i].y += ss * dt;
        if (this.bills[i].y > this.H + 60) this.bills.splice(i, 1);
      }

      // --- traffic spawns ---
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = U.clamp(U.rand(.75, 1.25) - this.time * .008, .32, 1.25);
        // pick a lane whose approach zone is clear
        const lanesShuffled = [0, 1, 2, 3].sort(() => Math.random() - .5);
        for (const ln of lanesShuffled) {
          const blocked = this.traffic.some(c => c.lane === ln && c.y < 130 && c.y > -220);
          if (!blocked) {
            const f = U.rand(.34, .62);           // fraction of our max speed
            this.traffic.push({
              lane: ln, x: laneX(ln), y: -95, rel: ss - f * 560,
              col: U.pick(CAR_COLORS), passed: false, t: U.rand(0, 9),
            });
            break;
          }
        }
      }

      // --- traffic motion + overtake ---
      const pyTop = this.H - 148, pyBot = this.H - 76;
      for (let i = this.traffic.length - 1; i >= 0; i--) {
        const c = this.traffic[i];
        c.t += dt;
        c.y += c.rel * dt;
        // gentle drift back toward lane centre
        c.x += (laneX(c.lane) - c.x) * Math.min(1, dt * 3);

        if (!c.passed && c.y > pyBot + 40) {
          c.passed = true;
          this.combo++; this.comboT = 2.2;
          const bonus = 20 * Math.min(this.combo, 6);
          this.addScore(bonus);
          this.floats.add('PASS +' + bonus + (this.combo > 1 ? '  ×' + this.combo : ''), c.x, pyTop - 16, '#ffe86b', { size: 12 });
          ARC.audio.sfx.pick();
        }
        if (c.y > this.H + 120 || c.y < -600) { this.traffic.splice(i, 1); continue; }

        // crash?
        if (Math.abs(c.x - C.x) < 41 && c.y + 37 > pyTop && c.y - 37 < pyBot) {
          this.crash(c);
          return;
        }
      }
    }

    crash(c) {
      this.shake.kick(14);
      ARC.audio.sfx.crash();
      this.parts.burst(this.car.x, this.H - 112, 40, '#ff7b3e', { spd: 300, life: 1, size: 5 });
      this.parts.burst(this.car.x, this.H - 112, 16, '#ffe86b', { spd: 180, life: .6, size: 4 });
      this.floats.clear();
      this.say('WRECKED!', '#ff5e3a');
      this.dying = 1.15;   // real seconds of slow-mo
    }

    debug(action) {
      if (action === 'hurt' && this.dying <= 0) {
        // teleport a car onto the player
        this.traffic.push({ lane: this.car.lane, x: this.car.x, y: this.H - 112, rel: 0, col: '#fff', passed: true, t: 0 });
      }
      if (action === 'score') this.addScore(500);
    }

    // ---------- draw ----------
    draw(ctx) {
      // grass / night ground
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#0a0a18'); g.addColorStop(1, '#12122a');
      ctx.fillStyle = g; ctx.fillRect(-12, -12, this.W + 24, this.H + 24);

      const ss = this.scrollSpd;

      // roadside ground strips
      ctx.fillStyle = '#15202a';
      ctx.fillRect(ROAD_L - 46, 0, 46, this.H);
      ctx.fillRect(ROAD_L + ROAD_W, 0, 46, this.H);

      // billboards + posts
      for (const b of this.bills) {
        const bx = b.side === 0 ? ROAD_L - 58 : ROAD_L + ROAD_W + 12;
        ctx.fillStyle = '#20283c';
        ctx.fillRect(bx + 14, b.y, 8, 52);
        ctx.fillStyle = '#101826';
        ctx.fillRect(bx - 6, b.y - 34, 48, 36);
        ctx.strokeStyle = 'rgba(255,210,62,.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(bx - 6, b.y - 34, 48, 36);
        ctx.fillStyle = '#ffe86b'; ctx.font = 'bold 7px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(b.txt.slice(0, 9), bx + 18, b.y - 13);
        ctx.textAlign = 'left';
      }

      // asphalt
      const ag = ctx.createLinearGradient(ROAD_L, 0, ROAD_L + ROAD_W, 0);
      ag.addColorStop(0, '#23232f'); ag.addColorStop(.5, '#2c2c3c'); ag.addColorStop(1, '#23232f');
      ctx.fillStyle = ag;
      ctx.fillRect(ROAD_L, 0, ROAD_W, this.H);

      // edge lines
      ctx.fillStyle = '#e8ecff';
      ctx.fillRect(ROAD_L + 3, 0, 4, this.H);
      ctx.fillRect(ROAD_L + ROAD_W - 7, 0, 4, this.H);

      // lane dashes
      const dashH = 44, dashGap = 36, period = dashH + dashGap;
      ctx.fillStyle = 'rgba(255,210,62,.85)';
      const off = this.scroll % period;
      for (let l = 1; l < LANES; l++) {
        const x = ROAD_L + ROAD_W / LANES * l - 2;
        for (let y = -period + off; y < this.H; y += period)
          ctx.fillRect(x, y, 4, dashH);
      }

      // traffic
      for (const c of this.traffic) this.drawCar(ctx, c.x, c.y, c.col, 0, true, c.t);

      // player
      if (this.state !== 'over')
        this.drawPlayer(ctx, this.car.x, this.H - 112, this.car.tilt);

      // speed lines at high velocity
      if (this.speed > .72) {
        ctx.strokeStyle = `rgba(255,255,255,${(this.speed - .72) * 1.1})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const lx = 30 + ((i * 71 + this.scroll * .15) % (this.W - 60));
          const ly = (i * 137 + this.scroll * 1.4) % this.H;
          ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 26);
        }
        ctx.stroke();
      }

      // hud extras
      ctx.textAlign = 'right';
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = '#ff5e3a';
      ctx.fillText(Math.floor(this.dist / 10) + 'm', this.W - 10, 52);
      if (this.combo > 1) {
        ctx.fillStyle = '#ffe86b';
        ctx.fillText('CHAIN ×' + this.combo, this.W - 10, 70);
      }
      ctx.textAlign = 'left';

      // throttle gauge
      const gx = 12, gy = 44, gw = 96, gh = 10;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(gx, gy, gw, gh);
      const fg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      fg.addColorStop(0, '#ffe86b'); fg.addColorStop(.6, '#ff9d3e'); fg.addColorStop(1, '#ff3d3d');
      ctx.fillStyle = fg;
      ctx.fillRect(gx + 1, gy + 1, (gw - 2) * this.speed, gh - 2);
      ctx.strokeStyle = '#e8ecff'; ctx.lineWidth = 1;
      ctx.strokeRect(gx + .5, gy + .5, gw - 1, gh - 1);
      ctx.fillStyle = '#8a90b8'; ctx.font = '10px Consolas, monospace';
      ctx.fillText(this.kmh + ' KM/H', gx, gy + 24);
    }

    drawCar(ctx, x, y, col, tilt, isTraffic, t) {
      ctx.save();
      ctx.translate(x, y);
      if (tilt) ctx.rotate(tilt);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.roundRect(-21, -33, 42, 70, 9); ctx.fill();
      // body
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-20, -36, 40, 72, 8); ctx.fill();
      // cabin
      ctx.fillStyle = 'rgba(10,12,24,.85)';
      ctx.beginPath(); ctx.roundRect(-14, -18, 28, 30, 5); ctx.fill();
      // stripes
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(-3, -34, 6, 68);
      if (isTraffic) {
        // taillights (we see their rear)
        ctx.fillStyle = '#ff3d3d';
        ctx.shadowColor = '#ff3d3d'; ctx.shadowBlur = 8;
        ctx.fillRect(-17, 26, 10, 5); ctx.fillRect(7, 26, 10, 5);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#ffe9a6';
        ctx.fillRect(-17, -38, 10, 5); ctx.fillRect(7, -38, 10, 5);
      }
      ctx.restore();
    }

    drawPlayer(ctx, x, y, tilt) {
      // headlight cones
      ctx.save();
      ctx.globalAlpha = .1 + this.speed * .12;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 36); ctx.lineTo(x - 44, y - 150); ctx.lineTo(x + 44, y - 150); ctx.lineTo(x + 16, y - 36);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      this.drawCar(ctx, x, y, '#ff3d3d', tilt, false);

      // spoiler
      ctx.fillStyle = '#b31f1f';
      ctx.fillRect(x - 19, y + 30, 38, 6);

      // exhaust flame at high throttle
      if (this.speed > .8 && Math.random() < .6) {
        ctx.fillStyle = U.chance(.5) ? '#ffd23e' : '#ff7b3e';
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 38); ctx.lineTo(x, y + 38 + U.rand(8, 20)); ctx.lineTo(x + 10, y + 38);
        ctx.closePath(); ctx.fill();
      }
    }

    promo(ctx, w, h, t) {
      ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, w, h);
      // road
      ctx.fillStyle = '#23232f';
      ctx.beginPath();
      ctx.moveTo(w * .18, 0); ctx.lineTo(w * .82, 0); ctx.lineTo(w * 1.05, h); ctx.lineTo(-w * .05, h);
      ctx.closePath(); ctx.fill();
      // dashes
      ctx.fillStyle = 'rgba(255,210,62,.8)';
      for (let i = 0; i < 5; i++) {
        const yy = ((i * 34 + t * 90) % (h + 30)) - 15;
        const shrink = yy / h;
        const cx = w / 2 + Math.sin((yy / h - .5) * 2.4) * w * .06;
        ctx.fillRect(cx - 2 - shrink, yy, 4 + shrink * 2, 14);
      }
      // hero car
      ctx.fillStyle = '#ff3d3d';
      ctx.beginPath(); ctx.roundRect(w / 2 - 12, h * .72, 24, 40, 5); ctx.fill();
      ctx.fillStyle = 'rgba(10,12,24,.85)';
      ctx.beginPath(); ctx.roundRect(w / 2 - 8, h * .78, 16, 12, 3); ctx.fill();
    }
  }

  ARC.games = ARC.games || [];
  ARC.games.push({
    id: 'turbo',
    name: 'TURBO LANES',
    tagline: 'Interstate 88 · chain the overtakes',
    color: '#ff5e3a',
    gm1: '#8a1c10', gm2: '#301018', gmGlow: 'rgba(255,94,58,.85)',
    controls: ['LEFT / RIGHT — CHANGE LANE', 'UP — THROTTLE   DOWN — BRAKE', 'PASS CARS FAST TO CHAIN COMBOS'],
    help: 'Distance scores constantly; passing traffic chains a combo multiplier (×2…×6) if you keep overtaking within ~2s. Throttle builds over time — the road gets faster whether you like it or not. One wreck ends the run.',
    cls: TurboLanes,
  });
})();
