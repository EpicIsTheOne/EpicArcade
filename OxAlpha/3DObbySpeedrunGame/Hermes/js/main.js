/* SKYRUSH — game state machine, camera, bot autopilot, main loop */
"use strict";

const Game = {
  scene: null, camera: null, renderer: null,
  state: "menu", // menu | playing | paused | finished
  raceTime: 0, timerStarted: false,
  splits: [],
  cpHit: 0,
  MEDALS: { gold: 62, silver: 95, bronze: 150 },
  camYaw: Math.PI, camPitch: 0.32, camDist: 7.2,
  camPos: new THREE.Vector3(), camTarget: new THREE.Vector3(),
  fovKick: 0,
  sun: null,

  /* ================= boot ================= */
  init() {
    const canvas = document.getElementById("gl");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.06;
    }
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x33395f, 0.0046);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
    window.addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // lights
    const hemi = new THREE.HemisphereLight(0xbdd2ff, 0x3a3050, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1da, 1.25);
    sun.position.set(60, 90, -40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 260;
    const S = 58;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;

    Level.build();
    Player.buildMesh();
    Effects.init();
    Ghost.init();
    Input.init(canvas);

    Player.spawnPoint.copy(Level.spawn);
    Player.reset();

    UI.init();
    UI.setBest(U.store.get("pb", null)?.time ?? null);

    // keys
    Input.onKeyEdge = (code, down) => {
      if (!down) return;
      if (code === "KeyR") { if (this.state === "playing" || this.state === "finished" || this.state === "paused") this.restart(); }
      else if (code === "Escape") { if (this.state === "playing") this.pause(); }
      else if (code === "KeyG") { Ghost.enabled = !Ghost.enabled; UI.popup(Ghost.enabled ? "GHOST ON" : "GHOST OFF", "#9ff3ff"); }
      else if (code === "KeyM") { const on = AudioSys.toggleMusic(); UI.popup(on ? "MUSIC ON" : "MUSIC OFF", "#ffd166"); }
      else if (code === "KeyH") { this.helpShown = !this.helpShown; UI.el.hintBar.style.display = this.helpShown ? "none" : ""; }
    };

    // menu idle camera orbit
    this.menuAngle = 0;

    this.clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      this.tick();
    };
    loop();

    // expose for automated tests
    window.__game = this;
    window.__P = Player;
    window.__L = Level;

    // automated-verification autopilot (?bot=1)
    if (location.search.indexOf("bot=1") >= 0) {
      setTimeout(() => { this.startRun(); this.Bot.enable(); }, 400);
    }
  },

  /* ================= flow ================= */
  startRun() {
    AudioSys.init(); AudioSys.resume();
    this.resetRunState();
    this.state = "playing";
    UI.hide("startOverlay"); UI.hide("resultsOverlay"); UI.hide("pauseOverlay");
    UI.setHUDVisible(true);
    UI.resetSplits();
    Input.lock(document.getElementById("gl"));
    UI.popup("GO!", "#7be495");
  },

  resetRunState() {
    Player.spawnPoint.copy(Level.spawn);
    Player.reset();
    this.raceTime = 0; this.timerStarted = false;
    this.cpHit = 0; this.splits = [];
    Level.checkpoints.forEach(cp => cp.hit = false);
    this.timerDone = false;
    Ghost.startRecording();
    this.camYaw = Math.PI; this.camPitch = 0.3;
    this._lastCpIdx = -1;
  },

  restart() {
    if (this.state === "menu") return;
    UI.hide("resultsOverlay"); UI.hide("pauseOverlay");
    this.resetRunState();
    this.state = "playing";
    UI.setHUDVisible(true);
    UI.popup("RESTART", "#4cc9f0");
  },

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    Input.unlock();
    UI.showPause(this.displayTime(), this.cpHit, Level.cpTotal);
  },

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    UI.hide("pauseOverlay");
    AudioSys.resume();
    Input.lock(document.getElementById("gl"));
  },

  toMenu() {
    this.state = "menu";
    UI.hide("resultsOverlay"); UI.hide("pauseOverlay");
    UI.setHUDVisible(false);
    UI.show("startOverlay");
    UI.refreshPBNote();
  },

  displayTime() {
    return this.timerStarted && !this.timerDone ? this.raceTime :
      (this.finishTime != null && this.state === "finished" ? this.finishTime : this.raceTime);
  },

  /* ================= events from player ================= */
  onLand(vy) {
    const impact = U.clamp((-vy) / 22, 0, 1);
    if (impact > 0.12) {
      AudioSys.land(impact);
      Effects.burst(Player.pos, 4 + Math.floor(impact * 8), 0xdfe8ff, 1.5 + impact * 2);
      Effects.shake(impact * 0.16);
    }
  },
  onDash() { this.fovKick = Math.min(this.fovKick + 9, 14); },
  onHazard() { UI.popup("OUCH!", "#ff6b6b"); },
  onFall() {
    if (this.state !== "playing") return;
    UI.popup("RESPAWN", "#ff9a62");
    AudioSys.hazard();
    Player.pos.copy(Player.spawnPoint);
    Player.vel.set(0, 0, 0);
    Player.sliding = false;
  },

  /* ================= triggers ================= */
  checkTriggers() {
    // checkpoints
    for (const cp of Level.checkpoints) {
      if (cp.hit) continue;
      const dx = Player.pos.x - cp.pos.x, dy = Player.pos.y - cp.pos.y, dz = Player.pos.z - cp.pos.z;
      if (dx * dx + dz * dz < 2.7 * 2.7 && dy > -1.5 && dy < 3.2) {
        cp.hit = true;
        Player.spawnPoint.copy(cp.spawn);
        this.cpHit++;
        AudioSys.checkpoint();
        Effects.confetti(cp.pos);
        Effects.burst(cp.pos, 14, 0x4cc9f0, 3.4);
        UI.cpFlash();
        UI.popup("CHECKPOINT " + this.cpHit + " / " + Level.cpTotal, "#4cc9f0");
        const pb = U.store.get("pb", null);
        const delta = pb && pb.splits && pb.splits[cp.idx] != null ? this.raceTime - pb.splits[cp.idx] : null;
        this.splits[cp.idx] = { name: cp.name, time: this.raceTime };
        UI.hitSplit(cp.idx, this.raceTime, delta);
        if (delta != null) UI.popup(delta <= 0 ? "AHEAD OF PB!" : "behind PB", delta <= 0 ? "#7be495" : "#ff9a62");
        break;
      }
    }
    // finish
    const f = Level.finishBox;
    if (f && !this.timerDone &&
        Player.pos.x > f.min.x && Player.pos.x < f.max.x &&
        Player.pos.y > f.min.y && Player.pos.y < f.max.y &&
        Player.pos.z > f.min.z && Player.pos.z < f.max.z) {
      this.finish();
    }
  },

  finish() {
    this.timerDone = true;
    this.finishTime = this.raceTime;
    this.state = "finished";
    Input.unlock();
    const medal = UI.medalFor(this.finishTime);
    AudioSys.finish(medal);
    Effects.confetti(Level.checkpoints[Level.cpTotal - 1].pos);
    Effects.shake(0.25);
    // PB bookkeeping
    const pb = U.store.get("pb", null);
    let isNewBest = false;
    if (!pb || this.finishTime < pb.time) {
      isNewBest = true;
      const rec = { time: this.finishTime, splits: this.splits.map(s => s.time), date: Date.now() };
      U.store.set("pb", rec);
      Ghost.saveIfBest();
      UI.setBest(rec.time);
    }
    setTimeout(() => {
      UI.showResults(this.finishTime, this.splits, pb, isNewBest);
    }, 650);
  },

  /* ================= bot autopilot (verification) ================= */
  Bot: {
    active: false, step: 0, usedActs: null, slideHold: 0, stuckT: 0, lastPos: new THREE.Vector3(),
    enable() {
      this.active = true;
      Input.virtual = { mx: 0, mz: 0 };
      this.step = 0; this.usedActs = new Set(); this.slideHold = 0;
      this.lastPos.copy(Player.pos);
    },
    disable() { this.active = false; Input.virtual = null; },

    update(dt) {
      if (!this.active || Game.state !== "playing") { if (Input.virtual) { Input.virtual.mx = 0; Input.virtual.mz = 0; } return; }
      const R = Level.botRoute;
      if (this.step >= R.length) { Input.virtual.mx = 0; Input.virtual.mz = 0; return; }
      const st = R[this.step];
      const p = Player.pos;
      const tx = st.p[0], ty = st.p[1], tz = st.p[2];
      let dx = tx - p.x, dz = tz - p.z;
      const hd = Math.hypot(dx, dz);
      const tol = st.tol || 1.5;

      // stuck watchdog
      if (p.distanceToSquared(this.lastPos) < 0.02 * dt) this.stuckT += dt; else this.stuckT = 0;
      this.lastPos.copy(p);
      let jumpNudge = false;
      if (this.stuckT > 1.6 && Player.grounded) { jumpNudge = true; }

      if (hd < tol && Math.abs(ty - p.y) < 2.6) {
        this.step++;
        return;
      }
      // checkpoint fallback sync
      for (const cp of Level.checkpoints) {
        if (cp.hit && cp.idx > -1) {
          const rs = cp.routeStep;
          if (rs > this.step && Math.abs(p.z - R[Math.max(rs - 1, 0)].p[2]) < 30) this.step = rs;
        }
      }

      dx /= (hd || 1); dz /= (hd || 1);
      Input.virtual.mx = dx; Input.virtual.mz = dz;

      // heuristic auto-jump: target above, or gap ahead while running fast
      if ((Player.grounded || Player.coyote > 0)) {
        const needUp = ty > p.y + 0.55;
        const gapAhead = hd > 4.5 && Player.grounded &&
          !Level.supportAt(p.x + dx * 1.35, p.y - 0.55, p.z + dz * 1.35) &&
          Math.hypot(Player.vel.x, Player.vel.z) > 4.5;
        if ((needUp && hd < 3.4) || gapAhead || jumpNudge) Input.vjump = true;
      }
      // explicit actions
      const key = this.step;
      if (st.j && !this.usedActs.has(key) && hd < 3.2 && Math.abs(ty - p.y) < 3) {
        this.usedActs.add(key);
        Input.vjump = true;
      }
      if (st.d && !this.usedActs.has(key) && hd < 5 && hd > 1.2 && !Player.grounded && Player.dashCd <= 0) {
        this.usedActs.add(key);
        Input.vdash = true;
      } else if (st.d && !Player.grounded && Player.dashCd <= 0 && hd > 6 && hd < 13 &&
                 !Level.supportAt(p.x + dx * 2.0, p.y - 0.55, p.z + dz * 2.0) &&
                 Math.hypot(Player.vel.x, Player.vel.z) > 7) {
        Input.vdash = true; // airborne over a gap → dash
      }
      // slide hold
      Input.vslide = !!st.s;
    },
  },

  /* ================= camera ================= */
  supportProbe: new THREE.Vector3(),

  updateCamera(dt) {
    const [mdx, mdy] = Input.consumeMouse();
    const sens = 0.0026;
    this.camYaw -= mdx * sens;
    this.camPitch += mdy * sens;
    this.camPitch = U.clamp(this.camPitch, -0.9, 1.15);
    // keyboard camera
    if (Input.keys.ArrowLeft) this.camYaw += 2.6 * dt;
    if (Input.keys.ArrowRight) this.camYaw -= 2.6 * dt;
    if (Input.keys.ArrowUp) this.camPitch = U.clamp(this.camPitch + 1.8 * dt, -0.9, 1.15);
    if (Input.keys.ArrowDown) this.camPitch = U.clamp(this.camPitch - 1.8 * dt, -0.9, 1.15);
    const w = Input.consumeWheel();
    if (w) this.camDist = U.clamp(this.camDist + w * 0.8, 3.5, 12);

    const target = _v1.set(Player.pos.x, Player.pos.y + 1.35, Player.pos.z);
    this.camTarget.lerp(target, 1 - Math.exp(-18 * dt));

    if (this.state === "menu") {
      this.menuAngle += dt * 0.12;
      const r = 17;
      this.camPos.set(
        this.camTarget.x + Math.cos(this.menuAngle) * r,
        this.camTarget.y + 6.5,
        this.camTarget.z + Math.sin(this.menuAngle) * r);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camTarget.x, this.camTarget.y + 1, this.camTarget.z);
      this.camera.fov = U.damp(this.camera.fov, 66, 4, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dirX = Math.sin(this.camYaw) * cp, dirY = sp, dirZ = Math.cos(this.camYaw) * cp;
    let dist = this.camDist;

    // occlusion: march from head outward
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = (dist * i) / steps;
      const px = this.camTarget.x + dirX * t,
            py = this.camTarget.y + dirY * t,
            pz = this.camTarget.z + dirZ * t;
      if (Level.supportAt(px, py, pz, 0.28)) { dist = Math.max(1.4, dist * (i - 1) / steps); break; }
    }

    const desired = _v2.set(
      this.camTarget.x + dirX * dist,
      this.camTarget.y + dirY * dist + 0.35,
      this.camTarget.z + dirZ * dist);
    this.camPos.lerp(desired, 1 - Math.exp(-22 * dt));

    // shake
    const sh = Effects.shakeAmt;
    this.camera.position.set(
      this.camPos.x + U.rand(-sh, sh) * 0.35,
      this.camPos.y + U.rand(-sh, sh) * 0.35,
      this.camPos.z + U.rand(-sh, sh) * 0.35);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.25, this.camTarget.z);

    // FOV response to speed
    const speed = Math.hypot(Player.vel.x, Player.vel.z);
    const speedFov = U.clamp((speed - 8) / 16, 0, 1) * 13;
    this.fovKick = Math.max(0, this.fovKick - dt * 26);
    const wantFov = 70 + speedFov + this.fovKick;
    this.camera.fov = U.damp(this.camera.fov, wantFov, 7, dt);
    this.camera.updateProjectionMatrix();
  },

  /* ================= main tick ================= */
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.033);

    Level.update(dt);
    this.Bot.update(dt);

    if (this.state === "playing") {
      if (!this.timerStarted) {
        const hv = Math.hypot(Player.vel.x, Player.vel.z);
        if (hv > 1.5 || Player.pos.z > 2.5) { this.timerStarted = true; }
      }
      if (this.timerStarted && !this.timerDone) {
        this.raceTime += dt;
        Ghost.record(dt);
      }
      Player.update(dt, this.camYaw);
      this.checkTriggers();
    } else if (this.state === "finished") {
      Player.update(dt, this.camYaw);
    }

    Ghost.update(this.raceTime);
    this.updateCamera(dt);
    Effects.update(dt, Math.hypot(Player.vel.x, Player.vel.z), this.camera.position);

    // sun follows player for tight shadows
    this.sun.position.set(Player.pos.x + 55, Player.pos.y + 80, Player.pos.z - 45);
    this.sun.target.position.copy(Player.pos);
    this.sun.target.updateMatrixWorld();

    // HUD
    if (this.state === "playing" || this.state === "finished") {
      UI.setTimer(this.timerDone ? this.finishTime : this.raceTime, this.timerStarted && !this.timerDone);
      UI.setProgress((this.cpHit + (this.timerDone ? 1 : 0)) / (Level.cpTotal + 1));
      UI.setDash(Player.dashCd <= 0, Player.dashCd / Player.dashCdMax);
      const spd = Math.hypot(Player.vel.x, Player.vel.z);
      UI.setSpeed(spd / 24);
    }

    this.renderer.render(this.scene, this.camera);
  },
};

/* support probe: is there solid ground/geometry near a world point? */
Level.supportAt = function (x, y, z, margin = 0.42) {
  for (const col of Level.colliders) {
    _v3.set(x, y, z).applyMatrix4(col.inv);
    const h = col.half;
    if (Math.abs(_v3.x) <= h.x + margin && Math.abs(_v3.y) <= h.y + margin && Math.abs(_v3.z) <= h.z + margin)
      return true;
  }
  return false;
};

window.addEventListener("load", () => Game.init());
