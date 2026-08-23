// ============================================================
// NEON MERIDIAN — core/game.js
// The Game: scene, renderer, composer, world, player, NPCs,
// vehicles, police, missions, UI, input, save, main loop.
// ============================================================
'use strict';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.started = false;
    this.timeNow = 0;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;
    this.paused = false;

    // renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.3, 2600);

    // input
    this.input = new Input(canvas);

    // audio
    this.audio = new AudioSys.AudioSysClass();
    const kick = () => { this.audio.init(); this.audio.resume(); };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    // systems (built in init())
    this.world = null; this.sky = null; this.npc = null;
    this.player = null; this.fx = null; this.wanted = null;
    this.missions = null; this.hud = null; this.menus = null;

    // runtime
    this.vehicles = [];            // player-usable world vehicles (incl. parked)
    this.missionVehicles = [];
    this.gangMembers = [];
    this.danger = new THREE.Vector3(1e9, 0, 1e9);
    this.wantedSys = new Wanted.WantedSystem();
    this.spawnFootCopT = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  // ================= boot =================
  init(qualityId) {
    const q = CONFIG.QUALITY_PRESETS[qualityId] || CONFIG.QUALITY_PRESETS.high;
    this.quality = q;
    this.qualityId = qualityId;

    const layout = CityGen.computeLayout(CONFIG);
    this.layout = layout;

    // world
    const built = World.build(layout, q);
    this.world = built;
    this.scene.add(built.group);
    this.sky = Sky.create(this.scene, q);
    this.sky.registerWorldDynamics(built.dynamic);
    this.sky.setTime(9.0);

    // entities
    this.player = new Player.PlayerController(this.scene, layout.locations.spawn);
    this.npc = new NPC.NPCManager(this.scene, layout, q);
    this.fx = new Combat.FXPool(this.scene);

    // parked vehicles
    for (const s of layout.parkedSpots) {
      const clsIds = ['compact', 'sedan', 'sedan', 'taxi', 'pickup', 'van', 'sports'];
      const cls = clsIds[Math.floor(Math.random() * clsIds.length)];
      const v = new Vehicle(cls, s.x, s.z, s.h);
      this.scene.add(v.mesh.group);
      this.vehicles.push(v);
    }
    // a guaranteed sports car near spawn
    const sp = layout.locations.spawn;
    const gift = new Vehicle('sports', sp.x + 6, sp.z + 3, Math.PI / 2);
    this.scene.add(gift.mesh.group);
    this.vehicles.push(gift);

    // missions + hud
    this.missions = new Missions.MissionMgr(this.scene, layout);
    this.hud = new HUD.Hud();
    this.hud.prerenderCity(layout);

    // wanted
    this.wanted = this.wantedSys;

    // composer (bloom) — built per quality in applyQuality
    this.buildComposer(q);

    this.onResize();
    this._lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  buildComposer(q) {
    if (this.composer) { this.composer.passes.length = 0; }
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new THREE.EffectComposer(this.renderer);
    const rp = new THREE.RenderPass(this.scene, this.cam);
    this.composer.addPass(rp);
    if (q.bloom) {
      this.bloomPass = new THREE.UnrealBloomPass(size, 0.55, 0.65, 0.82);
      this.composer.addPass(this.bloomPass);
    }
    this.gradePass = new THREE.ShaderPass(GradeShader);
    this.gradePass.uniforms.nightAmt.value = 0;
    this.composer.addPass(this.gradePass);
    this.composer.setSize(size.x, size.y);
  }

  applyQuality(id) {
    const q = CONFIG.QUALITY_PRESETS[id];
    this.quality = q; this.qualityId = id;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.sky) {
      this.scene.remove(this.sky); // sky api holds refs; rebuild scene lighting cheaply:
    }
    // rebuild composer + shadow flags without rebuilding world
    this.buildComposer(q);
    if (this.sunLightRef) this.sunLightRef.castShadow = q.shadows;
    this.onResize();
    if (this.hud) this.hud.toast(`Graphics: ${id.toUpperCase()}`);
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  // ================= play flow =================
  beginPlay(fromSave) {
    const st = GameState.state;
    this.started = true;
    if (!this.hud || !this.missions || !this.menus) return;  // init not finished yet
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.classList.remove('hidden');
    if (fromSave) {
      // restore player position & time
      if (st.pos) this.player.pos.set(st.pos[0], st.pos[1], st.pos[2]);
      this.sky.setTime(st.timeHours);
    }
    this.audio.init(); this.audio.resume();
    this.audio.startEngine();
    this.hud.objective('');
  }

  autosave() {
    const st = GameState.state;
    const p = this.player;
    st.pos = p.inVehicle ? [p.inVehicle.pos.x, 0, p.inVehicle.z] : [p.pos.x, p.pos.y, p.pos.z];
    st.timeHours = this.sky.timeHours;
    st.wanted = this.wanted.stars;
    GameState.save();
  }

  onPlayerDeath() {
    const fee = Math.min(GameState.state.money, 300);
    GameState.state.money -= fee;
    this.menus.showDeath(this.deathCause || 'Wasted', fee);
    this.audio.play('fail');
  }

  respawnPlayer() {
    const st = GameState.state;
    st.wanted = 0; this.wantedSys.heat = 0; this.wantedSys.level = 0;
    // clear pursuit
    for (const u of this.npc.police) { u.v.sirenOn = false; u.v.dispose(this.scene); }
    this.npc.police.length = 0;
    for (const f of this.npc.footCops) this.scene.remove(f.root);
    this.npc.footCops.length = 0;
    this.player.respawn(this.layout.locations.spawn);
    this.menus.hideDeath();
  }

  // ================= crimes =================
  crimeReported(kind, pos) {
    const witnessed = this.npc.nearbyWitness(pos, 34);
    this.wantedSys.crime(kind, pos, witnessed);
    if (witnessed) this.npc.panicAt(pos, 26);
    this.deathCause = null;
  }

  onKill(kind) {
    const st = GameState.state;
    if (kind === 'ped') {
      st.stats.kills++;
      this.crimeReported('pedKilled', this.player.pos);
      st.money += 0; // no reward for crime
    } else if (kind === 'cop') {
      st.stats.kills++;
      this.crimeReported('copKilled', this.player.pos);
    }
  }

  pedCtx() {
    return {
      colliders: this.world.colliders,
      vehicles: this.allVehicles(),
      player: this.player,
      onPedKilled: (p, byPlayer) => {
        if (byPlayer) this.onKill('ped');
        this.npc.panicAt(p.pos, 30);
      },
      danger: this.danger,
    };
  }

  allVehicles() {
    return this.vehicles.concat(this.npc.traffic.map(t => t.v), this.npc.police.map(u => u.v), this.missionVehicles);
  }

  cleanupMissionEntities() {
    for (const v of this.missionVehicles) if (!v.disposed) v.dispose(this.scene);
    this.missionVehicles.length = 0;
    for (const g of this.gangMembers) if (!g.dead) this.scene.remove(g.root);
    this.gangMembers.length = 0;
    if (this.missions.active && this.missions.active.data.chaseVehicle) {
      // keep vehicle if stage completed with capture; handled by stage
    }
  }

  // ================= vehicles & player interaction =================
  tryEnterVehicle() {
    const p = this.player;
    if (p.inVehicle) { this.exitVehicle(); return; }
    let best = null, bd = CONFIG.VEHICLE_ENTER_DIST;
    for (const v of this.allVehicles()) {
      if (v.disposed || v.hp <= 0) continue;
      const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return;
    const wasTraffic = best.driver === 'traffic';
    const wasPolice = best.isPolice;
    // remove from npc lists if jacked from traffic
    if (wasTraffic) {
      const i = this.npc.traffic.findIndex(t => t.v === best);
      if (i >= 0) this.npc.traffic.splice(i, 1);
      this.crimeReported('carjack', best.pos);
      this.npc.panicAt(best.pos, 20);
      GameState.state.stats.vehiclesJacked++;
      this.hud.toast('Vehicle jacked');
    } else if (best.driver === 'police') {
      return; // can't yank an active cop
    } else {
      this.crimeReported('carjack', best.pos);   // stealing parked car (minor, usually unwitnessed)
    }
    best.driver = 'player';
    best.sirenOn = wasPolice ? false : best.sirenOn;
    p.inVehicle = best;
    p.setVisible(false);
    this.audio.play('door');
    this.audio.startEngine();
  }

  exitVehicle() {
    const p = this.player;
    const v = p.inVehicle;
    if (!v) return;
    // place player at left side of car
    const right = ControlsMath.basis(v.heading).right;
    p.pos.set(v.pos.x - right.x * (v.halfWid + 0.7), 0.14, v.pos.z - right.z * (v.halfWid + 0.7));
    p.inVehicle = null;
    p.setVisible(true);
    v.driver = null;
    v.throttle = 0; v.brake = 0; v.steerInput = 0;
    this.audio.play('door');
  }

  // ================= police spawn =================
  policeSpawnRequest(req) {
    const pp = this.player.pos;
    for (let k = 0; k < req.spawnCars; k++) {
      // spawn on road ring around player
      const ang = Math.random() * Math.PI * 2;
      const dist = 130 + Math.random() * 60;
      let x = pp.x + Math.cos(ang) * dist, z = pp.z + Math.sin(ang) * dist;
      x = clamp(x, 20, this.layout.size - 20); z = clamp(z, 20, this.layout.size - 20);
      // snap to nearest node
      const gi = clamp(Math.round(x / CONFIG.BLOCK), 0, CONFIG.GRID);
      const gj = clamp(Math.round(z / CONFIG.BLOCK), 0, CONFIG.GRID);
      const nIdx = this.layout.graph.nodeIdx[gi + ',' + gj];
      if (nIdx === undefined) continue;
      const node = this.layout.graph.nodes[nIdx];
      const v = new Vehicle('police', node.x, node.z, 0);
      v.heading = Math.atan2(pp.x - node.x, -(pp.z - node.z));
      v.speed = 12;
      v.sirenOn = true;
      this.scene.add(v.mesh.group);
      this.npc.police.push(new NPC.PoliceUnit(v));
      this.audio.play('spawn');
    }
  }

  spawnFootOfficer(x, z) {
    const cop = new NPC.FootCop(this.scene, x + 2, z + 2);
    this.npc.footCops.push(cop);
    return cop;
  }

  onCopShoot(cop) {
    // cop fires: tracer + chance to damage player
    const from = new THREE.Vector3(cop.pos.x, 1.35, cop.pos.z);
    const to = new THREE.Vector3(this.player.pos.x, this.player.pos.y + 1.1, this.player.pos.z);
    this.fx.tracer(from, to);
    this.audio.play('pistol');
    const d = Math.hypot(this.player.pos.x - cop.pos.x, this.player.pos.z - cop.pos.z);
    const hitChance = clamp(0.62 - d / 70, 0.08, 0.6);
    if (Math.random() < hitChance) {
      if (this.player.inVehicle) {
        this.player.inVehicle.registerImpact(7);
      } else {
        this.player.damage(9 + Math.random() * 6, this);
      }
    }
  }

  // ================= shops =================
  updateShopInteractions() {
    const p = this.player;
    const pp = p.pos;
    this.nearShop = null;
    for (const m of this.missions.markers) {
      if (m.kind === 'giver' || m.kind === 'race') continue;
      const d = Math.hypot(pp.x - m.marker.pos.x, pp.z - m.marker.pos.z);
      if (d < 3.4) { this.nearShop = m; break; }
    }
    if (this.nearShop) {
      const kind = this.nearShop.kind;
      const label = kind === 'paynpray' ? 'Respray ($200) — clears wanted level'
        : kind === 'gunshop' ? 'Ammunition ($150)'
        : 'Eat ($25) — restore health';
      this.hud.hint(label);
      if (this.input.wasPressed('KeyE')) {
        const st = GameState.state;
        if (kind === 'paynpray') {
          if (st.money >= 200) {
            st.money -= 200;
            this.wantedSys.heat = 0; this.wantedSys.level = 0; this.wantedSys.cleanT = 0;
            for (const u of this.npc.police) { u.mode = 'retreat'; u.v.sirenOn = false; }
            // recolor car as disguise
            if (p.inVehicle) p.inVehicle.mesh.bodyMat.color.setHex(VehiclePalette[Math.floor(Math.random() * VehiclePalette.length)]);
            this.hud.toast('Resprayed — heat cleared');
            this.audio.play('cash');
          } else this.hud.toast('Not enough cash');
        } else if (kind === 'gunshop') {
          if (st.money >= 150) {
            st.money -= 150;
            const ownable = ['pistol', 'smg', 'rifle'].filter(w => st.weapons[w]);
            const target = ownable.length ? ownable[ownable.length - 1] : 'pistol';
            st.weapons[target] = true;
            st.ammo[target] = (st.ammo[target] || 0) + 45;
            this.hud.toast(`Ammo +45 (${CONFIG.WEAPONS.find(w => w.id === target).name})`);
            this.audio.play('cash');
          } else this.hud.toast('Not enough cash');
        } else if (kind === 'food') {
          if (st.money >= 25) {
            st.money -= 25;
            GameState.state.hp = Math.min(100, GameState.state.hp + 40);
            this.hud.toast('Tasty. Health restored');
            this.audio.play('cash');
          } else this.hud.toast('Not enough cash');
        }
      }
    }
  }

  // ================= packages =================
  updatePackages() {
    const pp = this.player.pos;
    for (const pk of this.layout.packages) {
      if (GameState.state.packagesFound.includes(pk.idx)) continue;
      if (Math.hypot(pp.x - pk.x, pp.z - pk.z) < 2.4) {
        GameState.state.packagesFound.push(pk.idx);
        GameState.state.money += 150;
        this.hud.toast(`Hidden package ${GameState.state.packagesFound.length}/10 — +$150`);
        this.audio.play('cash');
        if (GameState.state.packagesFound.length === 10) {
          this.hud.missionBanner('COLLECTOR', 'All 10 packages found! +$1000');
          GameState.state.money += 1000;
        }
      }
    }
  }

  // ================= main loop =================
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dtRaw = (t - this._lastT) / 1000;
    this._lastT = t;
    const dt = clamp(dtRaw, 0, 0.05);   // clamp big hitches
    this._lastDt = dt;                  // exposed for QA harness timing
    this._frameN = (this._frameN || 0) + 1;

    this._fpsAcc += dtRaw; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }

    if (this.menus.mode === 'playing' && !this.paused) {
      // QA hold registry: re-assert held synthetic inputs every sim frame
      if (window.__QA && window.__QA.holds) {
        for (const code of window.__QA.holds.keys) this.input.keys[code] = true;
        this.input.mouseDX += window.__QA.holds.dx;
        this.input.mouseDY += window.__QA.holds.dy;
      }
      this.update(dt);
    } else {
      // still render (menus over live scene), but don't simulate
      this.sky.update(0, this.player ? this.player.pos : new THREE.Vector3());
    }
    this.render();
    this.input.endFrame();
    // keep QA-held keys alive across endFrame()'s edge-trigger clear
    if (window.__QA && window.__QA.holds && window.__QA.holds.keys.size) {
      for (const code of window.__QA.holds.keys) this.input.keys[code] = true;
    }
  }

  update(dt) {
    this.timeNow += dt;
    const p = this.player;

    // ---- QA hold registry: re-assert held synthetic inputs every sim frame ----
    if (window.__QA && window.__QA.holds) {
      for (const code of window.__QA.holds.keys) this.input.keys[code] = true;
      this.input.mouseDX += window.__QA.holds.dx;
      this.input.mouseDY += window.__QA.holds.dy;
    }

    // ---- player control ----
    if (!p.inVehicle) {
      p.aiming = this._mouseR === true;
      p.update(dt, this.input, this.world, this);
      // melee / shoot
      if (this._mouseL) {
        const wid = GameState.state.curWeapon;
        const w = CONFIG.WEAPONS.find(x => x.id === wid);
        if (w && w.auto) Combat.fire(this, dt);
        else if (!this._mouseLPrev) Combat.fire(this, dt);
      }
      this._mouseLPrev = this._mouseL;
      // weapon switch
      for (let k = 1; k <= 5; k++) {
        if (this.input.wasPressed('Digit' + k)) {
          const w = CONFIG.WEAPONS[k - 1];
          if (w && GameState.state.weapons[w.id]) {
            GameState.state.curWeapon = w.id;
            this.player.rig.gun.visible = w.id !== 'fist' && w.id !== 'bat';
            this.audio.play('ui');
          }
        }
      }
      // wheel switch
      if (this.input.wasPressed('KeyQ')) this.cycleWeapon(-1);
      if (this.input.wasPressed('KeyE') && !this.nearShop && !this.missionPrompt) this.tryEnterVehicle();
    } else {
      const v = p.inVehicle;
      v.throttle = this.input.down('KeyW') ? 1 : 0;
      v.brake = this.input.down('KeyS') ? 1 : 0;
      v.steerInput = ControlsMath.steerInput(this.input.down('KeyA'), this.input.down('KeyD'));
      v.handbrake = this.input.down('Space');
      v.headlightsOn = this.sky.isNight || v.hp < v.cls.hp * 0.5;
      if (this.input.wasPressed('KeyE')) this.exitVehicle();
      GameState.state.stats.distanceDriven += Math.abs(v.speed) * dt;
      GameState.state.stats.topSpeed = Math.max(GameState.state.stats.topSpeed, Math.abs(v.speed));
      this.audio.updateEngine(v.speed, v.throttle, v.cls);
    }

    // ---- world sim ----
    this.sky.update(dt, p.pos);
    this.danger.set(1e9, 0, 1e9);
    const ctx = {
      layout: this.layout, world: this.world, player: p,
      vehicles: this.allVehicles(), peds: this.npc.peds,
      audio: this.audio, night: this.sky.isNight, lightPhase: (this.timeNow * 1) % 28,
      colliders: this.world.colliders, onPedKilled: null, danger: this.danger,
      lastKnown: this.wantedSys.lastKnown,
      spawnFootOfficer: (x, z) => this.spawnFootOfficer(x, z),
      despawnFootOfficer: (f) => { const i = this.npc.footCops.indexOf(f); if (i >= 0) { this.scene.remove(f.root); this.npc.footCops.splice(i, 1); } },
      onCopShoot: (cop) => this.onCopShoot(cop),
      playerDead: p.dead,
    };
    // ped kill callback wiring
    ctx.onPedKilled = (ped, byPlayer) => { if (byPlayer) this.onKill('ped'); this.npc.panicAt(ped.pos, 30); };

    this.npc.update(dt, ctx);
    World.onTick(this.world, this.timeNow, dt);

    // vehicles the player drives or bumps: step non-AI ones here
    for (const v of this.vehicles) {
      if (v.driver === null || v.driver === 'player') v.step(dt, this.world, this.allVehicles());
    }
    for (const v of this.missionVehicles) {
      if (v.driver === 'mission' && this.missions.active && this.missions.active.data.chase && this.missions.active.data.chase.v === v) {
        // stepped by chase AI
      } else if (v.driver === null) v.step(dt, this.world, this.allVehicles());
    }

    // ---- combat fx ----
    this.fx.update(dt);

    // ---- wanted / police ----
    const req = this.wantedSys.update(dt, {
      playerPos: p.pos, policeUnits: this.npc.police, footCops: this.npc.footCops,
      playerDead: p.dead,
    });
    if (req) this.policeSpawnRequest(req);

    // ---- missions / activities ----
    this.missions.update(dt, this);
    this.missions.updateRace(dt, this);
    this.updatePackages();
    this.updateShopInteractions();

    // ---- giver / mission prompt ----
    this.missionPrompt = null;
    if (!p.inVehicle) {
      const offer = this.missions.updateGiverInteraction(this);
      if (offer) {
        this.missionPrompt = offer;
        if (offer.kind === 'mission') {
          this.hud.hint(`Start mission: ${offer.def.name}`);
          if (this.input.wasPressed('KeyE')) {
            this.missions.start(offer.def.id, this);
            this.hud.missionBanner(offer.def.name, offer.def.brief);
          }
        } else {
          this.hud.hint('All missions done for this contact');
        }
      }
    }

    // ---- camera ----
    Player.updateCamera(this.cam, p, dt, this.input, this.world, {});

    // ---- hud ----
    this.hud.update(this, dt);

    // ---- day counter ----
    if (this.sky.timeHours < this._prevHour) GameState.state.day++;
    this._prevHour = this.sky.timeHours;

    // ---- autosave cadence ----
    this._saveT = (this._saveT || 0) + dt;
    if (this._saveT > 45) { this._saveT = 0; this.autosave(); }
  }

  cycleWeapon(dir) {
    const st = GameState.state;
    const owned = CONFIG.WEAPONS.filter(w => st.weapons[w.id]);
    if (owned.length < 2) return;
    let idx = owned.findIndex(w => w.id === st.curWeapon);
    idx = (idx + dir + owned.length) % owned.length;
    st.curWeapon = owned[idx].id;
    this.player.rig.gun.visible = owned[idx].id !== 'fist' && owned[idx].id !== 'bat';
    this.audio.play('ui');
  }

  render() {
    // qa preset: skip post pipeline entirely (software-renderer CI mode)
    if (this.qualityId === 'qa' || !this.composer) {
      this.renderer.render(this.scene, this.cam);
      return;
    }
    if (this.gradePass) {
      this.gradePass.uniforms.nightAmt.value = this.sky.nightAmt;
      this.gradePass.uniforms.duskAmt.value = this.sky.duskAmt || 0;
    }
    this.composer.render();
  }
}

// mouse buttons tracked via input (pointer lock)
window.addEventListener('mousedown', (e) => {
  if (!window.__game) return;
  const g = window.__game;
  if (!g.input.locked) return;
  if (e.button === 0) g._mouseL = true;
  if (e.button === 2) g._mouseR = true;
});
window.addEventListener('mouseup', (e) => {
  if (!window.__game) return;
  const g = window.__game;
  if (e.button === 0) g._mouseL = false;
  if (e.button === 2) g._mouseR = false;
});
