// ISLEBREAK — original browser battle royale. Main game orchestrator.
// Lobby → skybarge → drop → loot → fight → storm → Victory/Defeat → rematch.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { Rng } from './rng.js';
import { Island, WORLD, POIS } from './world.js';
import { makeMaterials, buildTerrain, buildOcean, buildSky, buildClouds, buildPOIs, buildVegetation } from './worldmesh.js';
import { PhysicsWorld } from './physics.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { BuildSystem } from './build.js';
import { LootSystem, Inventory } from './loot.js';
import { Storm } from './storm.js';
import { BotManager } from './bots.js';
import { CombatSystem } from './combat.js';
import { HarvestSystem } from './harvest.js';
import { ProjectileSystem } from './projectiles.js';
import { FXSystem } from './fx.js';
import { AudioSys } from './audio.js';
import { HUD } from './ui.js';
import { GRID, WALL_H } from './build.js';
import { WEAPONS } from './weapons.js';

const IS_HEADLESS = navigator.webdriver === true;

export class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !IS_HEADLESS, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfd4e8, 320, 1500);
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 3000);
    this.camera.position.set(0, 120, 160);

    // lights
    const sunDir = new THREE.Vector3(0.45, 0.62, 0.3).normalize();
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.position.copy(sunDir).multiplyScalar(300);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 900;
    const sc = this.sun.shadow.camera;
    sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.sun.target = new THREE.Object3D();
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9ec3ef, 0x54604a, 0.85);
    this.scene.add(this.hemi);

    // world
    this.seed = (Date.now() % 100000) | 0;
    this.rng = new Rng(this.seed);
    this.island = new Island(1337);   // fixed seed for a handcrafted-feeling island
    this.mats = makeMaterials();
    this.physics = new PhysicsWorld();
    this.harvestables = [];
    this.terrainGroup = buildTerrain(this.island, this.scene, this.mats);
    this.ocean = buildOcean(this.scene);
    this.sky = buildSky(this.scene);
    this.clouds = buildClouds(this.scene);
    this.poiData = buildPOIs(this.scene, this.island, this.mats, this.rng, this.physics, this.harvestables);
    this.pois = POIS;
    this.vegSpots = buildVegetation(this.scene, this.island, this.mats, this.rng, this.physics);

    // terrain colliders: coarse heightfield columns near player only is complex;
    // instead use analytic terrain in moveBody via ground callbacks + slope blocks.
    this.buildTerrainColliders();

    // systems
    this.input = new Input(this.canvas);
    this.builds = new BuildSystem(this.scene, this.physics);
    this.loot = new LootSystem(this.scene, this.rng.fork());
    this.storm = new Storm(this.scene, this.island);
    this.fx = new FXSystem(this.scene);
    this.audio = new AudioSys();
    this.combat = new CombatSystem(this);
    this.harvest = new HarvestSystem(this);
    this.projectiles = new ProjectileSystem(this);
    this.hud = new HUD(this);
    this.inv = new Inventory();
    this.player = new Player(this);
    this.scene.add(this.player.mesh);

    // bots rig factory
    this.botRigs = [];
    this.makeBotRig = (i) => {
      const mod = window.__charMod;
      const g = mod.createCharacter({ suit: [0x4a3a55, 0x2a4a44, 0x553a2a, 0x33445c][i % 4] });
      this.scene.add(g);
      return { group: g, rig: g.userData.rig };
    };

    this.bots = new BotManager(this, 47);

    // drop plane (skybarge)
    this.dropPlane = {
      pos: new THREE.Vector3(-1400, 420, -200),
      vel: new THREE.Vector3(38, 0, 14),
      mesh: null,
    };
    this.makeBarge();

    // post-processing
    // QA mode: headless/software renderers get 'low' (no bloom/shadows) so
    // simulation time stays close to real time. Humans get High/Ultra untouched.
    this.quality = IS_HEADLESS ? 'low' : 'high';
    this.setupComposer();
    addEventListener('resize', () => this.onResize());

    // match state
    this.matchState = 'lobby';   // lobby | dropping | playing | over
    this.alivePlayers = [];
    this.elimFeedPending = [];

    // QA hooks
    window.__game = this;

    // UI wiring
    wireMenus(this);

    this.clock = new THREE.Clock();
    this.loop();
  }

  makeBarge() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(26, 8, 60),
      new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.6, metalness: 0.4 })
    );
    g.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(18, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0x59c8ff, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.55 })
    );
    cabin.position.set(0, 6, 14);
    g.add(cabin);
    // balloons
    for (const sx of [-1, 1]) {
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(11, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x7a3bd6, roughness: 0.5 })
      );
      balloon.scale.set(1, 0.75, 1.5);
      balloon.position.set(sx * 13, 12, -6);
      g.add(balloon);
    }
    g.position.copy(this.dropPlane.pos);
    this.scene.add(g);
    this.dropPlane.mesh = g;
  }

  buildTerrainColliders() {
    // A ring of coarse colliders is wrong for movement; we treat terrain analytically:
    // moveBody handles builds/static boxes; terrain handled by ground snap + slope walls here.
    // For steep-slope blocking we add invisible "cliff" colliders on very steep cells near spawn areas.
    // Simpler robust approach used in moveBody callers: ground = max(terrain, builds).
    void 0;
  }

  cameraCollide(from, to, radius) {
    // spherecast approximation: sample the segment; pull in at first blocked sample
    const dir = _v1.subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) return to.clone();
    dir.normalize();
    const hit = this.combat.rayWorld(from, dir, len + radius);
    if (!hit) return null;
    return from.clone().addScaledVector(dir, Math.max(0.3, hit.t - radius));
  }

  setupComposer() {
    const size = new THREE.Vector2(innerWidth, innerHeight);
    if (this.composer) { this.composer.dispose?.(); }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality !== 'low') {
      this.bloom = new UnrealBloomPass(size, this.quality === 'ultra' ? 0.42 : 0.3, 0.65, 0.86);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.composer.setSize(innerWidth, innerHeight);
  }

  setQuality(q) {
    this.quality = q;
    const pixelRatio = q === 'ultra' ? Math.min(devicePixelRatio, 2) : q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'ultra' ? 4096 : 2048, q === 'ultra' ? 4096 : 2048);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.clouds.visible = q !== 'low';
    this.scene.fog.far = q === 'low' ? 1100 : 1500;
    this.setupComposer();
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  startMatch() {
    this.matchState = 'dropping';
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.audio.resume();

    // reset dynamic state
    this.builds.clear();
    this.loot.clear();
    this.inv.slots.fill(null);
    this.inv.ammo = { medium: 0, light: 0, shells: 0, heavy: 0, rockets: 0 };
    this.player.alive = true;
    this.player.hp = 100; this.player.shield = 0;
    this.player.mode = 'bus';
    this.player.safeZoneImmune = false;
    this.player.pos.copy(this.dropPlane.pos);
    this.player.camRig.yaw = Math.PI; // look along travel

    // spawn loot: chests at POIs + scattered floor loot
    const chestSpots = [];
    const floorSpots = [];
    for (const info of this.poiData.poiInfo) {
      for (const c of info.chests) chestSpots.push(c);
      for (let i = 0; i < 10; i++) {
        const a = this.rng.next() * Math.PI * 2, rr = this.rng.range(8, info.r * 0.95);
        const x = info.x + Math.cos(a) * rr, z = info.z + Math.sin(a) * rr;
        floorSpots.push({ x, y: this.island.height(x, z) + 0.55, z });
      }
    }
    // wilderness floor loot
    for (let i = 0; i < 90; i++) {
      const x = this.rng.range(-850, 850), z = this.rng.range(-850, 850);
      const y = this.island.height(x, z);
      if (y > 2) floorSpots.push({ x, y: y + 0.55, z });
    }
    this.loot.spawnChests(chestSpots);
    this.loot.spawnFloorLoot(floorSpots);

    // bots
    this.bots.spawnAll(this.dropPlane.pos);

    // storm reset
    this.storm.center.set(0, 0);
    this.storm.radius = 1050;
    this.storm.phaseIdx = -1;
    this.storm.state = 'waiting';
    this.storm.timer = 30;
    this.storm.dps = 0;
    this.storm.targetRadius = STORM_FIRST_RADIUS;

    this.matchTime = 0;
    this.updateAliveCount();
  }

  onPlayerDeath(source) {
    this.audio.play('death');
    this.showEnd(false, source ? source.name : 'The Storm');
  }

  onElimination(killer, victim, headshot) {
    const kn = killer ? killer.name : 'Storm';
    const vn = victim.name || victim.id;
    this.hud.kill(`${kn} ${headshot ? '☠' : '⚔'} ${vn}`, !!killer?.isPlayer);
    if (killer?.isPlayer || victim.isPlayer) this.audio.play(killer?.isPlayer ? 'elim' : 'hit');
    this.updateAliveCount();
    // victory / defeat resolution
    if (this.matchState === 'playing' || this.matchState === 'dropping') {
      const alive = this.countAlive();
      if (alive <= 1 && this.player.alive) {
        this.showEnd(true, null);
      } else if (this.player.alive && alive === 2 && !this.bots.bots.some(b => b.alive && b !== victim)) {
        // edge: only bots remain besides player handled above; nothing to do
      }
    }
  }

  countAlive() {
    let n = this.player.alive ? 1 : 0;
    n += this.bots.aliveCount();
    return n;
  }
  updateAliveCount() {
    this._aliveN = this.countAlive();
  }

  showEnd(victory, killedBy) {
    this.matchState = 'over';
    const el = document.getElementById('endscreen');
    el.classList.remove('hidden');
    el.querySelector('#endTitle').textContent = victory ? 'VICTORY KESTREL' : 'ELIMINATED';
    el.querySelector('#endTitle').style.color = victory ? '#ffd76a' : '#ff6a5e';
    const stats = el.querySelector('#endStats');
    stats.innerHTML = victory
      ? `<b>#1</b> — last one standing on Kestrel Isle<br>Eliminations: <b>${this.player.eliminations || 0}</b>`
      : `Taken down by <b>${killedBy}</b><br>Placed <b>#${Math.max(2, this._aliveN)}</b> of 48<br>Eliminations: <b>${this.player.eliminations || 0}</b>`;
    this.audio.play(victory ? 'victory' : 'defeat');
    this.exitToPointer();
  }

  exitToPointer() {
    this.input.exitLock();
  }

  onLanded() {
    if (this.matchState === 'dropping') this.matchState = 'playing';
  }

  update(dt) {
    this.matchTime = (this.matchTime || 0) + dt;
    const input = this.input;

    // barge flight during drop phase
    if (this.matchState === 'dropping' || this.matchState === 'playing') {
      this.dropPlane.pos.addScaledVector(this.dropPlane.vel, dt);
      this.dropPlane.mesh.position.copy(this.dropPlane.pos);
      if (this.dropPlane.pos.x > 1500) this.dropPlane.mesh.visible = false;
    }

    // bus mode for player: ride until jump
    if (this.player.mode === 'bus') {
      this.player.pos.copy(this.dropPlane.pos);
      this.player.pos.y -= 4;
      if (input.hit('Space')) {
        this.player.mode = 'skydive';
        this.player.vel.set(this.dropPlane.vel.x * 0.4, -12, this.dropPlane.vel.z * 0.4);
      }
    }

    this.player.update(dt, input);
    this.bots.update(dt, this.storm);
    this.projectiles.update(dt);
    this.storm.update(dt, [this.player, ...this.bots.bots]);
    this.fx.tick(dt);
    this.loot.tick(this.matchTime);
    for (const t of [this.ocean, this.clouds]) t.userData.tick?.(this.matchTime);

    // camera modes
    if (this.player.mode === 'skydive' || this.player.mode === 'glide') {
      this.updateDropCam(dt);
    } else if (this.player.alive) {
      this.player.syncMesh(dt);
      this.player.camRig.update(dt, this.player.pos, { ads: this.player.ads, crouch: this.player.crouch || this.player.sliding });
    } else {
      this.spectateCam(dt);
    }
    // sun follows player for shadow coverage
    const focus = this.player.pos;
    this.sun.position.set(focus.x + 135, focus.y + 186, focus.z + 90);
    this.sun.target.position.copy(focus);

    // HUD updates
    this.hud.setHealth(this.player.hp, this.player.shield);
    const def = this.inv.weaponDef();
    const slot = this.inv.current();
    this.hud.setAmmo(def, def ? slot.ammoInMag : 0, def ? this.inv.ammo[def.ammo] : 0);
    this.hud.setSlots(this.inv.slots, this.inv.sel, this.inv.mats);
    if (!this._aliveN) this.updateAliveCount();
    this.hud.setPlayers(this._aliveN, this.player.eliminations || 0);
    this.hud.setStorm(this.storm.phaseLabel(), this.player.inStorm && this.player.alive);
    this.hud.drawMinimap(this);
    this.hud.crosshair(!IS_HEADLESS && input.locked && !this.player.ads && this.player.alive);
    this.hud.scope(this.player.ads && def?.scope);
    // interact prompt
    let promptTxt = '';
    if (this.player.alive && this.player.mode === 'ground') {
      const ch = this.loot.nearestChest(this.player.pos, 2.6);
      if (ch) promptTxt = '[E] Open Chest';
      else {
        const dr = this.loot.nearestDrop(this.player.pos, 2.2);
        if (dr) promptTxt = '[E] Pick Up';
        else if (this.player.buildMode) promptTxt = '';
      }
    }
    this.hud.prompt(promptTxt);
    this.hud.buildHint(this.player.buildMode
      ? `BUILD: ${this.player.buildMode.toUpperCase()}  [1-4] piece  [T] ${this.player.buildTier || 'auto'}  [R] rotate  [LMB] place  [RMB] exit`
      : '');
    // heal progress bar
    const hb = document.getElementById('healBar');
    if (hb) {
      if (this.player.healItem) {
        hb.style.display = '';
        const p = Math.min(1, this.player.healT / HEAL_TIME[this.player.healItem.id]);
        hb.querySelector('div').style.width = `${p * 100}%`;
      } else hb.style.display = 'none';
    }

    input.endFrame();

    this.updateDropSteering(dt);
    if (this._ap) this.updateAutopilot(dt);
  }

  // Autopilot: plays a full match via the same Input surface a human uses.
  // Phases: land -> loot -> arm -> rotate with zone -> fight when threatened.
  updateAutopilot(dt) {
    const p = this.player;
    const inp = this.input;
    if (!p.alive) { this._ap = false; return; }
    this._apT = (this._apT || 0) + dt;
    const ap = this._apS || (this._apS = {});

    const distTo = (x, z) => Math.hypot(p.pos.x - x, p.pos.z - z);

    // ---------- threat scan ----------
    let threat = null, tDist = Infinity;
    for (const b of this.bots.bots) {
      if (!b.alive || b.nearDist > 90) continue;
      if (b.nearDist < tDist) { tDist = b.nearDist; threat = b; }
    }

    // ---------- weapon management ----------
    if (ap.armed === undefined) ap.armed = false;
    const haveWeapon = !!this.inv.weaponDef();
    if (!haveWeapon && !ap.triedEquip) {
      // pick first weapon drop within reach
      let best = null, bd = 30 * 30;
      for (const d of this.loot.drops) {
        if (d.taken || d.item.kind !== 'weapon') continue;
        const dd = d.mesh.position.distanceToSquared(p.pos);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best) {
        p.tryTake(best);
        ap.triedEquip = false;
      }
      // also open chest if very close
      const ch = this.loot.nearestChest(p.pos, 2.4);
      if (ch) { this.loot.openChest(ch, this.inv); this.audio.play('chestOpen'); }
      // equip: select the slot with the weapon
      for (let i = 0; i < 5; i++) {
        if (this.inv.slots[i]?.kind === 'weapon') { this.inv.sel = i; break; }
        if (this.inv.slots[i]?.kind === 'heal') { this.inv.sel = i; break; }
      }
    }
    ap.armed = haveWeapon;

    // ---------- heal decision ----------
    if (!p.healItem) {
      const healSlot = this.inv.slots.findIndex(s => s?.kind === 'heal');
      if (healSlot >= 0 && ((p.hp < 45) || (p.hp < 80 && p.inStorm))) {
        this.inv.sel = healSlot;
        p.startHeal(this.inv.slots[healSlot]);
      }
    } else {
      // keep healing; don't move much
      ap.moveX = 0; ap.moveZ = 0;
    }

    // ---------- storm safety ----------
    const safeNow = this.storm.isSafe(p.pos.x, p.pos.z);
    const margin = 60;
    const dxs = p.pos.x - this.storm.center.x, dzs = p.pos.z - this.storm.center.y;
    const dc = Math.hypot(dxs, dzs);
    let goalX = null, goalZ = null;
    if (!safeNow || dc > this.storm.radius - margin) {
      goalX = this.storm.center.x + (dxs / (dc || 1)) * Math.max(10, this.storm.radius * 0.55);
      goalZ = this.storm.center.y + (dzs / (dc || 1)) * 55 * Math.sign(1);
      goalZ = this.storm.center.y;
    }

    // ---------- loot phase ----------
    if (p.mode === 'ground' && !ap.phase) ap.phase = 'loot';
    if (ap.phase === 'loot') {
      ap.lootT = (ap.lootT || 0) + dt;
      // seek nearest unopened chest — always, until armed
      let bestC = null, bdC = Infinity;
      for (const c of this.loot.chests) {
        if (c.opened) continue;
        const d = distTo(c.pos.x, c.pos.z);
        if (d < bdC) { bdC = d; bestC = c; }
      }
      if (bestC && (!haveWeapon || bdC < 90)) {
        goalX = bestC.pos.x; goalZ = bestC.pos.z;
        if (bdC < 2.4) { this.loot.openChest(bestC, this.inv); this.audio.play('chestOpen'); }
      }
      // grab nearby drops
      const dr = this.loot.nearestDrop(p.pos, 3.6);
      if (dr) p.tryTake(dr);
      // unarmed: head to nearest POI center for floor loot
      if (!haveWeapon && !bestC) {
        let bp = null, bpd = Infinity;
        for (const poi of this.pois) {
          const d = distTo(poi.x, poi.z);
          if (d < bpd) { bpd = d; bp = poi; }
        }
        if (bp && bpd > 8) { goalX = bp.x; goalZ = bp.z; }
      }
      if (haveWeapon && (ap.lootT > 40 || this._aliveN < 14)) ap.phase = 'survive';
    }
    if (ap.phase === 'survive') {
      // hold near zone center-ish; wander small
      if (goalX === null) {
        goalX = this.storm.center.x + Math.cos(this.matchTime * 0.13) * this.storm.radius * 0.4;
        goalZ = this.storm.center.y + Math.sin(this.matchTime * 0.17) * this.storm.radius * 0.4;
      }
      if (this.storm.state === 'done') {
        goalX = this.storm.center.x; goalZ = this.storm.center.y;
      }
    }

    // ---------- movement execution ----------
    if (goalX !== null && !p.healItem) {
      const gx = goalX - p.pos.x, gz = goalZ - p.pos.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 1.4) {
        const targetYaw = Math.atan2(-gx / gd, -gz / gd); // yaw such that forward points to goal
        // rotate camera yaw toward targetYaw (consumeLook: yaw -= mouseDX*k, so inject negative)
        let dy = targetYaw - p.camRig.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        inp.mouseDX += THREE.MathUtils.clamp(-dy / 0.0023, -900, 900) * Math.min(1, dt * 9);
        // press W
        inp.keys.add('KeyW');
        ap.moving = true;
        // slide for speed bursts
        if (p.onGround && gd > 24 && !p.sliding && this.matchTime % 4 < 1.6) inp.keys.add('ShiftLeft');
        else inp.keys.delete('ShiftLeft');
        // jump obstacles
        if (Math.abs(p.vel.x) + Math.abs(p.vel.z) < 2 && p.onGround) inp.pressed.add('Space');
      } else {
        inp.keys.delete('KeyW'); inp.keys.delete('ShiftLeft');
      }
    } else if (!p.healItem) {
      inp.keys.delete('KeyW'); inp.keys.delete('ShiftLeft');
    }
    void threat; void tDist;

    // ---------- build defense when shot ----------
    if (p.hp < 70 && p.buildCd <= 0 && this.inv.mats.wood >= 10) {
      const bx = Math.round((p.pos.x - Math.sin(p.camRig.yaw) * 3.6) / GRID);
      const bz = Math.round((p.pos.z - Math.cos(p.camRig.yaw) * 3.6) / GRID);
      const by = Math.max(0, Math.round((p.pos.y + 1) / WALL_H));
      const piece = this.builds.place('wall', 'wood', bx, by, bz, 0, p);
      if (piece) this.inv.mats.wood -= 10;
      p.buildCd = 3;
    }
    p.buildCd = (p.buildCd || 0) - dt;

    // ---------- shooting ----------
    if (haveWeapon && !p.healItem) {
      let tgt = null, td = Infinity;
      for (const b of this.bots.bots) {
        if (!b.alive || b.nearDist > (this.inv.weaponDef().cls === 'SNIPER' ? 160 : 75)) continue;
        if (b.nearDist < td) { td = b.nearDist; tgt = b; }
        void tgt;
      }
      // pick visible target with LOS via combat raycast
      if (tgt) {
        const eye = _vAP1.set(p.pos.x, p.pos.y + 1.58, p.pos.z);
        const aimP = _vAP2.set(tgt.pos.x, tgt.pos.y + 1.25, tgt.pos.z);
        const dir = _vAP3.subVectors(aimP, eye);
        const dd = dir.length();
        dir.normalize();
        const blocked = this.combat.rayWorldBlocked(eye, dir, dd - 0.8);
        if (!blocked && dd < 75) {
          // aim camera pitch toward target height (inject positive mouseDY to pitch down)
          const wantPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
          inp.mouseDY += THREE.MathUtils.clamp((p.camRig.pitch - wantPitch) / 0.0023, -800, 800) * Math.min(1, dt * 8);
          // turn toward target (override movement yaw)
          const targetYaw = Math.atan2(-(tgt.pos.x - p.pos.x) / dd, -(tgt.pos.z - p.pos.z) / dd);
          let dy = targetYaw - p.camRig.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          inp.mouseDX += THREE.MathUtils.clamp(-dy / 0.0023, -1000, 1000) * Math.min(1, dt * 10);
          if (Math.abs(dy) < 0.12) {
            inp.keys.add('KeyW');
            inp.buttons[0] = true;
            ap.firing = true;
          } else {
            inp.buttons[0] = false;
          }
        } else {
          if (!ap.moving) inp.buttons[0] = false;
        }
      } else {
        inp.buttons[0] = false;
      }
    }
    // never leave fire stuck on
    setTimeout(() => { if (this._ap) this.input.buttons[0] = false; }, 350);
  }

  updateDropCam(dt) {
    // chase cam behind & above during skydive/glide
    const p = this.player;
    const back = _v1.set(Math.sin(p.camRig.yaw), 0, Math.cos(p.camRig.yaw));
    const desired = _v2.copy(p.pos).addScaledVector(back, p.mode === 'glide' ? 7.5 : 9).add(_v3.set(0, 3.4, 0));
    this.camera.position.lerp(desired, 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
    p.mesh.visible = true;
    p.mesh.rotation.y = p.camRig.yaw;
    p.mesh.position.copy(p.pos);
  }

  spectateCam(dt) {
    // orbit above death spot
    const p = this.player.pos;
    this._specT = (this._specT || 0) + dt;
    const r = 26;
    this.camera.position.set(p.x + Math.cos(this._specT * 0.25) * r, p.y + 18, p.z + Math.sin(this._specT * 0.25) * r);
    this.camera.lookAt(p.x, p.y, p.z);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    // headless software renderers run few fps; a bigger dt clamp keeps
    // simulated time closer to wall-clock during automated matches
    const dtMax = IS_HEADLESS ? 0.14 : 0.05;
    const dt = Math.min(dtMax, this.clock.getDelta());
    this._fpsAcc = (this._fpsAcc || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc > 1) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; }
    if (this.matchState !== 'over' || true) this.update(dt);
    this.composer.render();
  }

  // ================= QA HOOKS (used by headless tests) =================
  qaJump() {
    // hold long enough to survive slow headless frames (endFrame clears per-frame)
    this.input.pressed.add('Space');
    const iv = setInterval(() => {
      if (this.player.mode !== 'bus') clearInterval(iv);
    }, 50);
    setTimeout(() => { this.input.pressed.delete('Space'); clearInterval(iv); }, 1500);
  }
  qaHoldKey(code, down) {
    if (down) { this.input.keys.add(code); this.input.pressed.add(code); }
    else this.input.keys.delete(code);
  }
  qaLook(dxPix, dyPix) {
    this.input.mouseDX += dxPix; this.input.mouseDY += dyPix;
  }
  qaFireDown(down) {
    this.input.buttons[0] = down;
    if (down) this.input.buttonPressed[0] = true;
  }
  qaShotCount() { return this.combat.shotCounter || 0; }
  qaAliveCount() { return this.countAlive(); }
  qaFps() { return this.fps || null; }
  qaPlayerSummary() {
    const p = this.player;
    return {
      hp: Math.round(p.hp), shield: Math.round(p.shield),
      weapon: this.inv.weaponDef()?.name || 'pickaxe',
      mats: { ...this.inv.mats }, elims: p.eliminations || 0,
      place: this._aliveN, x: Math.round(p.pos.x), z: Math.round(p.pos.z),
      inStorm: !!p.inStorm,
    };
  }
  qaBuildMode(t) {
    this.player.buildMode = t;
    this.inv.mats.wood = Math.max(this.inv.mats.wood, 120);
  }
  qaGiveWeapon(id = 'raptor-ar') {
    this.inv.addWeapon(id);
    this.inv.addAmmo(WEAPONS[id].ammo, 120);
    for (let i = 0; i < 5; i++) if (this.inv.slots[i]?.kind === 'weapon') this.inv.sel = i;
    this.player.equipVisual();
  }
  qaTeleport(x, z) {
    const p = this.player;
    p.pos.set(x, this.island.height(x, z) + 0.5, z);
    p.vel.set(0, 0, 0);
  }
  // Steer the drop toward a world xz target. Sets a persistent target processed
  // every frame inside update() for stable proportional control.
  qaSteerTo(tx, tz) {
    this._dropTarget = { x: tx, z: tz };
  }
  updateDropSteering(dt) {
    const p = this.player;
    const t = this._dropTarget;
    if (!t || (p.mode !== 'skydive' && p.mode !== 'glide')) {
      if (t && p.mode === 'ground') {
        this.input.keys.delete('KeyW');
        this.input.keys.delete('ShiftLeft');
        this._dropTarget = null;
      }
      return;
    }
    const inp = this.input;
    const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 4) inp.keys.add('KeyW');
    else inp.keys.delete('KeyW');
    // dive while high above terrain for speed
    const th = this.island.height(p.pos.x, p.pos.z);
    if (p.pos.y > th + 14) inp.keys.add('ShiftLeft');
    else inp.keys.delete('ShiftLeft');
    // proportional yaw control (consumeLook: yaw -= mouseDX*k)
    const targetYaw = Math.atan2(-dx, -dz);
    let dy = targetYaw - p.camRig.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    inp.mouseDX += THREE.MathUtils.clamp(-dy * 14, -46, 46);
    // gentle nose-down in glide
    if (p.mode === 'glide' && p.camRig.pitch < -0.12) inp.mouseDY += 30;
  }
  qaAutopilot(on) {
    if (!on) { this._ap = false; return; }
    this._ap = true;
    console.log('[ap] autopilot engaged');
  }
}

const STORM_FIRST_RADIUS = 620;
const HEAL_TIME = { bandage: 2, medkit: 7, shieldcell: 2.5, shieldpack: 5 };
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _vAP1 = new THREE.Vector3(), _vAP2 = new THREE.Vector3(), _vAP3 = new THREE.Vector3();

function wireMenus(game) {
  const lobby = document.getElementById('lobby');
  const pause = document.getElementById('pausemenu');
  const settings = document.getElementById('settings');

  document.getElementById('btnPlay').onclick = () => {
    game.audio.resume();
    game.startMatch();
    game.canvas.requestPointerLock?.();
  };
  document.getElementById('btnSettings').onclick = () => {
    settings.classList.toggle('hidden');
  };
  document.getElementById('quality').onchange = (e) => game.setQuality(e.target.value);
  const ix = document.getElementById('invertX'), iy = document.getElementById('invertY');
  ix.onchange = () => { game.input.invertX = ix.checked; };
  iy.onchange = () => { game.input.invertY = iy.checked; };
  // defaults OFF (explicit)
  ix.checked = false; iy.checked = false;
  document.getElementById('sens').oninput = (e) => { game.input.sensitivity = parseFloat(e.target.value); };

  // pointer lock management
  game.canvas.addEventListener('click', () => {
    if ((game.matchState === 'playing' || game.matchState === 'dropping') && !game.input.locked) {
      game.canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    const playing = (game.matchState === 'playing' || game.matchState === 'dropping');
    if (!document.pointerLockElement && playing && !game.player.deadShown) {
      pause.classList.remove('hidden');
    } else if (document.pointerLockElement) {
      pause.classList.add('hidden');
    }
  });
  document.getElementById('btnResume').onclick = () => {
    pause.classList.add('hidden');
    game.canvas.requestPointerLock?.();
  };
  document.getElementById('btnQuit').onclick = () => location.reload();
  document.getElementById('btnPlayAgain').onclick = () => {
    document.getElementById('endscreen').classList.add('hidden');
    game.startMatch();
    game.canvas.requestPointerLock?.();
  };
}
