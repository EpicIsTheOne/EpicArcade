(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const U = DS.util;

  const DEFAULTS = {
    sensPitchRoll: 1.0, sensYaw: 1.0, sensClimb: 1.0,
    fovFpv: 95, assistAngle: true, hoverAssist: true,
    sound: true, minimap: true, volume: 0.7
  };

  function loadSettings() {
    const s = Object.assign({}, DEFAULTS);
    try {
      const raw = localStorage.getItem("droneSimSettings");
      if (raw) Object.assign(s, JSON.parse(raw));
    } catch (e) {}
    DS.settings = s;
    return s;
  }
  function saveSettings() {
    try { localStorage.setItem("droneSimSettings", JSON.stringify(DS.settings)); } catch (e) {}
  }

  const SPAWN = new THREE.Vector3(0, 1.2, -11.5);

  function makeSky() {
    const geo = new THREE.SphereGeometry(720, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2e6fc2) },
        mid: { value: new THREE.Color(0x8fbce0) },
        bot: { value: new THREE.Color(0xd7e6ef) },
        sunDir: { value: new THREE.Vector3(0.42, 0.55, 0.32).normalize() },
        sunCol: { value: new THREE.Color(0xfff2cf) }
      },
      vertexShader: [
        "varying vec3 vP;",
        "void main(){",
        " vP=(modelMatrix*vec4(position,1.0)).xyz;",
        " gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 top; uniform vec3 mid; uniform vec3 bot;",
        "uniform vec3 sunDir; uniform vec3 sunCol;",
        "varying vec3 vP;",
        "void main(){",
        " vec3 d=normalize(vP);",
        " float h=d.y;",
        " vec3 c=mix(bot,mid,smoothstep(-0.05,0.14,h));",
        " c=mix(c,top,smoothstep(0.12,0.55,h));",
        " float s=max(dot(d,sunDir),0.0);",
        " c+=sunCol*(pow(s,600.0)*1.4+pow(s,14.0)*0.16);",
        " gl_FragColor=vec4(c,1.0);",
        "}"
      ].join("\n")
    });
    return new THREE.Mesh(geo, mat);
  }

  function Explosion(scene) {
    const tex = U.radialGlowTexture(0, 60, [
      [0, "rgba(255,240,190,1)"], [0.3, "rgba(255,150,40,0.9)"],
      [0.65, "rgba(180,60,20,0.45)"], [1, "rgba(60,30,20,0)"]
    ]);
    this.parts = [];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: i % 3 === 0 ? THREE.NormalBlending : THREE.AdditiveBlending,
        color: i % 3 === 0 ? 0x777777 : 0xffffff
      });
      const sp = new THREE.Sprite(m);
      sp.visible = false;
      scene.add(sp);
      this.parts.push({ sp, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, smoke: false });
    }
    this.cursor = 0;
  }
  Explosion.prototype.burst = function (pos) {
    let fired = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      p.sp.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI - Math.PI / 2;
      const spd = 3 + Math.random() * 8;
      p.vel.set(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.8 + 0.5, Math.sin(a) * Math.cos(el)).multiplyScalar(spd);
      p.smoke = fired % 4 === 3;
      p.maxLife = p.smoke ? 1.3 : 0.55 + Math.random() * 0.3;
      p.life = p.maxLife;
      p.size = p.smoke ? 1.4 : 0.7 + Math.random() * 1.3;
      p.sp.material.rotation = Math.random() * Math.PI;
      p.sp.visible = true;
      if (++fired >= 22) break;
    }
  };
  Explosion.prototype.update = function (dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      const f = p.life / p.maxLife;
      p.vel.y -= (p.smoke ? -1.5 : 7) * dt;
      p.vel.multiplyScalar(1 - 2.4 * dt);
      p.sp.position.addScaledVector(p.vel, dt);
      p.size += (p.smoke ? 2.6 : 1.6) * dt;
      p.sp.scale.setScalar(p.size);
      p.sp.material.opacity = f * (p.smoke ? 0.5 : 0.95);
    }
  };

  function Game() {
    this.settings = loadSettings();
    this.canvas = document.getElementById("scene");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (THREE.SRGBColorSpace !== undefined) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfe0ec, 150, 640);
    this.scene.add(makeSky());

    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x54683f, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.25);
    sun.position.set(130, 170, 95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
    sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
    sun.shadow.camera.near = 20; sun.shadow.camera.far = 520;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.06, 900);
    this.camModeIdx = 0;
    this.CAM_MODES = ["FPV", "CHASE", "ORBIT"];
    this.orbitAngle = 0;
    this.chasePos = new THREE.Vector3(0, 6, -2);
    this.shake = 0;

    DS.World.build(this.scene);
    this.world = DS.World;
    this.explosion = new Explosion(this.scene);

    const self = this;
    this.race = new DS.Race(this.scene, this.world, {
      onCountdown(n) { DS.Audio.countdownTick(); DS.HUD.centerMsg(String(n)); },
      onCountdownGo() { DS.Audio.countdownGo(); DS.HUD.centerMsg("GO!"); },
      onGate(i, total) {
        DS.Audio.gate();
        DS.HUD.warn("gate", "GATE " + i + "/" + total + " \u2713", "info", 1000);
      },
      onArchMiss() {
        DS.HUD.warn("archmiss", "FLY THROUGH THE START ARCH", null, 1800);
      },
      onFinish(time, best, record) {
        if (record) DS.Audio.record();
        self.openFinish(time, best, record);
      },
      onArmed() {}
    });

    this.drone = new DS.Drone(this.world, {
      onCrash(pos) { self.handleCrash(pos); },
      onLowBattery() {
        DS.Audio.lowBat();
        DS.HUD.warn("lowbat", "LOW BATTERY", null, 2600);
      }
    });
    this.drone.reset(SPAWN.clone(), 0);
    this.drone.refillBattery();
    this.scene.add(this.drone.group);

    DS.HUD.init();
    DS.Input.init((code) => self.onAction(code));
    DS.Input.toast = (msg) => DS.HUD.warn("toast", msg, "info", 2200);

    this.respawnTimer = 0;
    this.started = false;
    this.menuOpen = false;
    this.finishOpen = false;
    this.clock = new THREE.Clock();
    this.fpsEma = 60;

    this.bindUI();
    window.addEventListener("resize", () => this.onResize());
    document.getElementById("loading").style.display = "none";
    requestAnimationFrame(() => this.loop());
  }

  Game.prototype.bindUI = function () {
    const s = this.settings;
    const $ = (id) => document.getElementById(id);
    const bindRange = (id, key, fmt, onChange) => {
      const el = $(id);
      el.value = s[key];
      const lab = el.parentElement.querySelector("span");
      const upd = () => {
        s[key] = parseFloat(el.value);
        if (lab) lab.textContent = fmt ? fmt(s[key]) : "";
        saveSettings();
        if (onChange) onChange();
      };
      upd();
      el.addEventListener("input", upd);
    };
    bindRange("setPR", "sensPitchRoll");
    bindRange("setYaw", "sensYaw");
    bindRange("setClimb", "sensClimb");
    bindRange("setFov", "fovFpv", null, () => this.applyCamera());
    const bindChk = (id, key, onChange) => {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener("change", () => {
        s[key] = el.checked;
        saveSettings();
        if (onChange) onChange(el.checked);
      });
      if (onChange) onChange(s[key]);
    };
    bindChk("setAssist", "assistAngle");
    bindChk("setHover", "hoverAssist");
    bindChk("setSound", "sound", (v) => { DS.Audio.setEnabled(v); if (v) DS.Audio.setVolume(s.volume); });
    bindChk("setMap", "minimap", (v) => { $("minimap").style.display = v ? "" : "none"; });

    $("btnFlyFree").addEventListener("click", () => this.begin(false));
    $("btnStartRace").addEventListener("click", () => this.begin(true));
    $("btnResume").addEventListener("click", () => this.closeMenu());
    $("btnRestartFlight").addEventListener("click", () => { this.restartFlight(); this.closeMenu(); });
    $("btnRaceFromMenu").addEventListener("click", () => { this.armTeleport(); this.closeMenu(); });
    $("btnResetBest").addEventListener("click", () => {
      this.race.resetBest();
      DS.HUD.setIntroBest(this.race.formatBest());
      DS.HUD.warn("bestreset", "BEST TIME CLEARED", "info", 1600);
    });
    $("btnRetry").addEventListener("click", () => { this.closeFinish(); this.armTeleport(); });
    $("btnFreeFly").addEventListener("click", () => { this.closeFinish(); this.race.toIdle(); });
    DS.HUD.setIntroBest(this.race.formatBest());
    DS.Audio.setEnabled(s.sound);
  };

  Game.prototype.begin = function (wantRace) {
    DS.Audio.init();
    DS.Audio.setEnabled(this.settings.sound);
    DS.Audio.setVolume(this.settings.volume);
    document.getElementById("introOverlay").classList.add("hidden");
    DS.HUD.show(true);
    this.started = true;
    if (wantRace) this.armTeleport();
  };

  Game.prototype.anyOverlay = function () {
    return !this.started || this.menuOpen || this.finishOpen;
  };

  Game.prototype.onAction = function (code) {
    if (!this.started && code !== "__pad_menu") {
      this.begin(code === "Enter" || code === "__pad_race");
      return;
    }
    switch (code) {
      case "KeyC": case "__pad_camera": this.cycleCamera(); break;
      case "KeyR": case "__pad_restart":
        if (!this.finishOpen) this.restartFlight();
        break;
      case "Enter": case "__pad_race":
        if (!this.menuOpen && !this.finishOpen) this.enterRaceAction();
        else if (this.finishOpen) { this.closeFinish(); this.armTeleport(); }
        break;
      case "Escape": case "__pad_menu":
        if (this.finishOpen) { this.closeFinish(); }
        else if (this.started) this.toggleMenu();
        break;
      case "KeyM":
        this.settings.sound = !this.settings.sound;
        document.getElementById("setSound").checked = this.settings.sound;
        DS.Audio.setEnabled(this.settings.sound);
        if (this.settings.sound) { DS.Audio.init(); DS.Audio.setVolume(this.settings.volume); }
        saveSettings();
        DS.HUD.warn("mute", this.settings.sound ? "SOUND ON" : "SOUND OFF", "info", 1100);
        break;
      case "KeyH":
        document.getElementById("helpCard").classList.toggle("hidden");
        break;
    }
  };

  Game.prototype.cycleCamera = function () {
    this.camModeIdx = (this.camModeIdx + 1) % this.CAM_MODES.length;
    this.applyCamera();
  };

  Game.prototype.applyCamera = function () {
    const mode = this.CAM_MODES[this.camModeIdx];
    if (mode === "FPV") this.camera.fov = this.settings.fovFpv;
    else if (mode === "CHASE") this.camera.fov = 64;
    else this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  };

  Game.prototype.restartFlight = function () {
    this.drone.reset(SPAWN.clone(), 0);
    this.drone.refillBattery();
    if (this.race.state === "running" || this.race.state === "countdown" || this.race.state === "finished") {
      this.race.retry();
    } else {
      this.race.toIdle();
    }
    DS.HUD.clearWarn("oob");
    DS.HUD.clearWarn("depleted");
  };

  Game.prototype.armTeleport = function () {
    this.drone.reset(SPAWN.clone(), 0);
    this.drone.refillBattery();
    this.race.arm();
  };

  Game.prototype.enterRaceAction = function () {
    if (this.race.state === "running") {
      this.armTeleport();
      DS.HUD.warn("retry", "RESTARTED — CROSS START", "info", 1500);
    } else {
      this.armTeleport();
    }
  };

  Game.prototype.handleCrash = function (pos) {
    DS.Audio.crash();
    DS.HUD.flashRed();
    this.explosion.burst(pos);
    this.shake = 0.75;
    this.respawnTimer = 1.15;
  };

  Game.prototype.doRespawn = function () {
    let pos = SPAWN.clone(), yawDeg = 0;
    if (this.race.state === "running" || this.race.state === "countdown") {
      const rp = this.race.getRespawn();
      pos = rp.pos.clone();
      yawDeg = rp.yawDeg;
    }
    this.drone.reset(pos, yawDeg);
    this.drone.battery = Math.max(this.drone.battery, 45);
    DS.HUD.warn("respawn", "RESPAWNED", "info", 900);
  };

  Game.prototype.toggleMenu = function () {
    this.menuOpen ? this.closeMenu() : this.openMenu();
  };
  Game.prototype.openMenu = function () {
    this.menuOpen = true;
    document.getElementById("menuOverlay").classList.remove("hidden");
    DS.Audio.idleDown();
  };
  Game.prototype.closeMenu = function () {
    this.menuOpen = false;
    document.getElementById("menuOverlay").classList.add("hidden");
  };
  Game.prototype.openFinish = function (time, best, record) {
    this.finishOpen = true;
    document.getElementById("finishTime").textContent = U.fmtTime(time);
    document.getElementById("finishBest").textContent = U.fmtTime(best);
    const delta = best != null ? time - best : null;
    document.getElementById("finishDelta").textContent = record || delta == null || delta <= 0 ? "--" : "+" + (delta / 1000).toFixed(2) + "s";
    document.getElementById("newRecord").classList.toggle("hidden", !record);
    document.getElementById("finishOverlay").classList.remove("hidden");
  };
  Game.prototype.closeFinish = function () {
    this.finishOpen = false;
    document.getElementById("finishOverlay").classList.add("hidden");
  };

  Game.prototype.onResize = function () {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  };

  Game.prototype.updateCamera = function (dt, t) {
    const d = this.drone;
    const mode = this.CAM_MODES[this.camModeIdx];
    if (mode === "FPV") {
      this.camera.quaternion.copy(d.quat);
      this.camera.position.copy(d.pos).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(d.quat), 0.52);
      this.camera.position.y += 0.05;
    } else if (mode === "CHASE") {
      const back = new THREE.Vector3(Math.sin(d.yaw), 0, Math.cos(d.yaw));
      const want = d.pos.clone().addScaledVector(back, 4.6).add(new THREE.Vector3(0, 1.7, 0));
      const gh = this.world.groundAt(want.x, want.z) + 0.5;
      if (want.y < gh) want.y = gh;
      const k = 1 - Math.exp(-dt * 6.0);
      this.chasePos.lerp(want, k);
      this.camera.position.copy(this.chasePos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(d.pos.clone().addScaledVector(d.vel, 0.05));
    } else {
      this.orbitAngle += dt * 0.28;
      const r = 10.5;
      this.camera.position.set(
        d.pos.x + Math.cos(this.orbitAngle) * r,
        d.pos.y + 4.2,
        d.pos.z + Math.sin(this.orbitAngle) * r
      );
      const gh = this.world.groundAt(this.camera.position.x, this.camera.position.z) + 0.8;
      if (this.camera.position.y < gh) this.camera.position.y = gh;
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(d.pos);
    }
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-3.2 * dt);
      const amp = this.shake * 0.35;
      this.camera.position.x += Math.sin(t * 67) * amp;
      this.camera.position.y += Math.cos(t * 81) * amp;
      this.camera.rotateZ(Math.sin(t * 73) * this.shake * 0.06);
    }
    if (mode === "FPV") {
      const vib = d.thrEff * 0.0035 + (d.speed / 40) * 0.004;
      this.camera.rotateX(Math.sin(t * 93) * vib);
      this.camera.rotateZ(Math.sin(t * 71) * vib * 1.4);
    }
  };

  Game.prototype.loop = function () {
    requestAnimationFrame(() => this.loop());
    const dtRaw = this.clock.getDelta();
    const dt = Math.min(dtRaw, 1 / 30);
    const t = this.clock.elapsedTime;
    this.fpsEma += ((dt > 0 ? 1 / dt : 60) - this.fpsEma) * 0.04;

    const simActive = this.started && !this.menuOpen && !this.finishOpen;

    DS.World.update(t, dt);
    this.explosion.update(dt);

    if (simActive) {
      DS.Input.poll(dt);
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.doRespawn();
      }
      if (!this.drone.crashed) {
        const N = 2;
        for (let i = 0; i < N; i++) {
          const h = dt / N;
          this.drone.update(h, DS.Input.cmd, this.settings);
          if (this.drone.checkColliders(this.world.colliders)) {
            this.drone.crash();
            break;
          }
          this.race.update(h, this.drone, t);
        }
        this.applyBoundary(dt);
        if (this.drone.charging && this.drone.battery < 100) {
          this.drone.charge(13 * dt);
          DS.HUD.warn("chg", "CHARGING ON PAD", "info", 400);
        }
        if (this.drone.battery <= 0.5) DS.HUD.warn("depleted", "BATTERY DEPLETED", null, 1200);
        const rr = Math.hypot(this.drone.pos.x, this.drone.pos.z);
        if (rr > 245) DS.HUD.warn("oob", "OUT OF RANGE — TURN BACK", null, 500);
        else DS.HUD.clearWarn("oob");
      }
      DS.Audio.update(
        this.drone.grounded && this.drone.speed < 0.5 ? this.drone.thrEff * 0.6 : this.drone.thrEff,
        this.drone.speed
      );
    } else {
      DS.Audio.idleDown();
    }

    this.updateCamera(simActive ? dt : dt * 0.35, t);

    const d = this.drone;
    const ngi = this.race.nextGateInfo();
    const drainRate = 0.32 + d.thrEff * 1.55;
    const snap = {
      thr: d.thrEff,
      bat: d.battery,
      batEst: d.battery / Math.max(0.42, drainRate),
      charging: d.charging,
      speed: d.speed * 3.6,
      alt: d.altitude,
      vsi: d.vsi,
      hdg: d.headingDeg,
      pitchDeg: THREE.MathUtils.radToDeg(d.euler.x),
      rollDeg: THREE.MathUtils.radToDeg(d.euler.z),
      camFpv: this.CAM_MODES[this.camModeIdx] === "FPV",
      modeLabel: (this.settings.assistAngle ? "ANGLE" : "ACRO") + (this.settings.hoverAssist ? " · HOVER" : ""),
      camLabel: this.CAM_MODES[this.camModeIdx],
      raceStateLabel: {
        idle: "FREE FLIGHT", armed: "CROSS START ARCH", countdown: "GET READY",
        running: "RACE!", finished: "FINISHED"
      }[this.race.state],
      raceTime: this.race.timeMs,
      best: this.race.best,
      gateIdx: this.race.state === "idle" ? 0 : this.race.nextIdx,
      gateTotal: this.race.gates.length,
      showGates: this.race.state === "running" || this.race.state === "finished",
      mapData: this.race.mapData(),
      droneMap: { x: d.pos.x, z: d.pos.z },
      landmarks: [{ x: 86, z: 58, color: "#c8433a" }, { x: -92, z: 78, color: "#dfe4e8" }, { x: -116, z: 46, color: "#dfe4e8" }],
      arrowTarget: ngi ? ngi.pos : null,
      camera: this.camera
    };
    DS.HUD.update(Math.max(dt, 1 / 120), snap);

    this.renderer.render(this.scene, this.camera);
  };

  Game.prototype.applyBoundary = function (dt) {
    const d = this.drone;
    const r = Math.hypot(d.pos.x, d.pos.z);
    if (r > 255) {
      const over = r - 255;
      const nx = -d.pos.x / r, nz = -d.pos.z / r;
      const acc = Math.min(over * 0.15, 12);
      d.vel.x += nx * acc * dt;
      d.vel.z += nz * acc * dt;
    }
  };

  window.addEventListener("DOMContentLoaded", () => {
    try {
      DS.game = new Game();
    } catch (err) {
      const l = document.getElementById("loading");
      l.textContent = "WEBGL ERROR: " + err.message;
      throw err;
    }
  });
})();
