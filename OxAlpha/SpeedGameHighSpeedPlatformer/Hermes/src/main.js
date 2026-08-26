import * as THREE from 'three';
import { Gfx } from './engine/gfx.js';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { PhysicsWorld } from './game/physics.js';
import { Player } from './game/player.js';
import { ChaseCam } from './game/camera.js';
import { Fx } from './game/fx.js';
import { Enemies } from './game/enemies.js';
import { OrbField } from './game/objects.js';
import {
  Spring, DashPanel, Mover, FanZone, Checkpoint, GoalRing,
  Prism, LavaPool, SpikeStrip, Crate, LaserGate, makeSign,
} from './game/objects.js';
import { Rail } from './game/objects.js';
import { LevelKit } from './game/levels/kit.js';
import { buildL1 } from './game/levels/l1.js';
import { buildL2 } from './game/levels/l2.js';
import { buildL3 } from './game/levels/l3.js';
import { buildSandbox } from './game/levels/sandbox.js';
import { TUNE, LEVELS, rankFor } from './game/gamedata.js';
import { saveData, recordResult, persist, isUnlocked } from './game/save.js';
import { clamp, damp, fmtTime } from './game/mathutil.js';
import { Ui } from './engine/ui.js';

const LEVEL_BUILDERS = {
  coast: buildL1, city: buildL2, foundry: buildL3, sandbox: buildSandbox,
};

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.params = params;
    this.autotest = params.has('autotest');

    this.canvas = document.getElementById('gl');
    this.gfx = new Gfx(this.canvas);
    const s = saveData();
    this.gfx.setQuality(params.get('gfx') || s.settings.gfx || 'high');

    this.input = new Input(this.canvas);
    this.input.sens = s.settings.sens;
    this.input.invertX = !!s.settings.invertX;
    this.input.invertY = !!s.settings.invertY;
    audio.volMaster = s.settings.volMaster; audio.volMusic = s.settings.volMusic; audio.volSfx = s.settings.volSfx;

    this.scene = null;
    this.world = new PhysicsWorld();
    this.fx = null;
    this.player = new Player(this.world, {
      onEvent: (n, d) => this.onPlayerEvent(n, d),
      findChainTarget: (...a) => this.findChainTarget(...a),
    });
    this.player.input = this.input;
    this.cam = new ChaseCam(this.gfx.camera, this.world);
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3);

    this.mode = 'boot';           // boot|title|select|play|pause|results
    this.levelId = null;
    this.meta = null;
    this.time = 0;
    this.elapsedAll = 0;

    // registries
    this.springs = []; this.panels = []; this.moversList = []; this.fans = [];
    this.checkpoints = []; this.hazards = []; this.crates = []; this.rails = [];
    this.specials = []; this.tickFns = [];
    this.orbs = null; this.enemies = null;
    this.goalObj = null;

    // run stats
    this.score = 0; this.deaths = 0; this.comboN = 0; this.comboT = 0;
    this.prismsGot = 0; this.chipsGot = 0; this.cores = 0; this.totalPrisms = 0;
    this.stylePts = 0;

    this.ui = new Ui(this);
    this.acc = 0;
    this.reticleTarget = null;

    window.addEventListener('resize', () => this.gfx.resize());
    this.input.onFirstGesture = () => { audio.init(); audio.resume(); };

    this.lastT = performance.now();
    requestAnimationFrame(() => this.frame());

    this.setupAutotest();
    // boot into menu backdrop
    this.loadLevel('coast', { backdrop: true });
    this.mode = 'title';
    this.ui.show('title');
  }

  // ================= LEVEL LOADING =================
  clearRegistries() {
    this.springs.length = 0; this.panels.length = 0; this.moversList.length = 0;
    this.fans.length = 0; this.checkpoints.length = 0; this.hazards.length = 0;
    this.crates.length = 0; this.rails.length = 0; this.specials.length = 0;
    this.tickFns.length = 0;
    this.goalObj = null;
  }

  loadLevel(id, { backdrop = false } = {}) {
    this.clearRegistries();
    this.scene = new THREE.Scene();
    this.gfx.scene = this.scene;
    if (this.gfx.composer) {
      for (const p of this.gfx.composer.passes) if (p.scene !== undefined) p.scene = this.scene;
    }
    this.world.clear();
    this.killY = -100;
    this.fogColor = 0x888888;

    this.orbs = new OrbField(this.scene);
    this.enemies = new Enemies(this.scene, this);
    this.fx = new Fx(this.scene);
    const themeName = id === 'sandbox' ? 'coast' : (LEVELS.find((l) => l.id === id)?.theme || id);
    this.kit = new LevelKit(this.scene, this.world, this, themeName, 12345 + id.length * 7);

    const meta = LEVEL_BUILDERS[id](this);
    this.meta = meta;
    this.levelId = id;
    this.killY = meta.killY ?? -100;
    this.orbs.build();
    this.totalPrisms = meta.prismTotal ?? 0;

    if (!this._playerInScene) { this.player.addTo(this.scene); this._playerInScene = true; }

    if (!backdrop) {
      this.player.spawn(meta.spawn.pos, meta.spawn.yaw || 0);
      this.time = 0; this.score = 0; this.deaths = 0; this.cores = 0;
      this.prismsGot = 0; this.chipsGot = 0; this.comboN = 0; this.stylePts = 0;
      this.player.boostMeter = 50;
      this.player.orbs = 0;
      this.audioTrack(meta.music);
      this.cam.snapBehind(this.player);
      this.mode = 'play';
      this.ui.show(null);
      this.ui.objective(meta.intro || '');
      this.ui.hudVisible(true);
      if (!this.autotest) this.input.requestLock();
    }
  }

  audioTrack(name) {
    audio.setTrack(name);
    audio.setIntensity(this.mode === 'play' ? 1 : 0.35);
  }

  restartLevel() { this.loadLevel(this.levelId); }
  quitToMenu() {
    this.loadLevel('coast', { backdrop: true });
    this.mode = 'select';
    this.ui.show('select');
    this.ui.hudVisible(false);
    this.input.exitLock();
    audio.setIntensity(0.35);
  }

  // ================= helpers used by level files =================
  sign(text, pos, rotY = 0, scale = 1) { makeSign(this.scene, text, pos, rotY, scale); }
  platform(w, d, pos, opts = {}) { return this.kit.platform(w, d, pos, opts); }
  box(w, h, d, pos, rotY = 0, mat = null, opts = undefined) { return this.kit.box(w, h, d, pos, rotY, mat, opts || {}); }
  channel(points, crossR, width, mat, a0, a1, closed) { return this.kit.channel(points, crossR, width, mat, a0, a1, closed); }
  loop(entry, yaw, radius, width, mat) { return this.kit.loop(entry, yaw, radius, width, mat); }
  spring(pos, dir, power, color) { this.springs.push(new Spring(this.scene, pos, dir, power, color)); }
  panel(pos, rotY, power, opts) { this.panels.push(new DashPanel(this.scene, pos, rotY, power, opts)); }
  mover(size, pathFn, dur = 6, phase = 0) { this.moversList.push(new Mover(this.scene, this.world, size, pathFn, { dur, phase })); }
  fan(center, half, force) { this.fans.push(new FanZone(this.scene, center, half, force)); }
  checkpoint(pos, yaw = 0) { this.checkpoints.push(new Checkpoint(this.scene, pos, yaw, this.checkpoints.length)); }
  goal(pos, yaw = 0) { this.goalObj = new GoalRing(this.scene, pos, yaw); }
  rail(points, opts) { const r = new Rail(this.scene, this.world, points, opts); this.rails.push(r); return r; }
  laserGate(a, b, opts) { this.hazards.push(new LaserGate(this.scene, a, b, opts)); }
  spikes(x, z, w, d, y, rotY = 0) { this.hazards.push(new SpikeStrip(this.scene, x, z, w, d, y, rotY)); }
  lavaPool(x, z, w, d, y) { this.hazards.push(new LavaPool(this.scene, x, z, w, d, y)); }
  crate(pos) { this.crates.push(new Crate(this.scene, pos)); }
  prism(pos) { this.specials.push(new Prism(this.scene, pos, 'prism')); }
  chip(pos) { this.specials.push(new Prism(this.scene, pos, 'chip')); }
  enemy(type, pos, opts = {}) { return this.enemies.add(type, pos, opts); }
  orbLine(a, b, n) { this.orbs.line(a, b, n); }
  orbArc(pts, n) { this.orbs.arcPoints(pts, n); }
  orbCircle(c, r, n, axis, rotY) { this.orbs.circle(c, r, n, axis, rotY); }

  spawnProjectile(pos, vel) { this.enemies.projectiles.spawn(pos, vel); }
  onProjectileDestroyed(pp) {
    this.fx.explosion(pp, 0xff5577);
    this.addScore(25, pp, '+25');
    audio.explode();
  }

  // ================= scoring / events =================
  addScore(n, worldPos, label = null, cssColor = '#ffe14d') {
    this.score += n;
    if (label && worldPos && !this.autotest) this.fx.floatText(worldPos, label, cssColor);
  }

  onOrb() {
    this.cores++;
    this.comboN++; this.comboT = 2.2;
    this.addScore(10);
    this.player.addBoost(6);
    audio.orb(this.comboN);
  }

  onSpecial(sp) {
    if (sp.kind === 'prism') {
      this.prismsGot++;
      this.addScore(400, sp.pos, 'PRISM! +400', '#9ff3ff');
      this.player.addBoost(100);
      audio.prism();
      this.ui.toast(`Prism ${this.prismsGot}/${this.totalPrisms}`);
    } else {
      this.chipsGot++;
      this.addScore(300, sp.pos, 'SECRET! +300', '#ff7080');
      this.player.addBoost(50);
      audio.chip();
      this.ui.toast('Star Chip found!');
    }
    this.fx.burst(sp.pos, { count: 20, speed: 8, color: sp.kind === 'prism' ? 0x19e6ff : 0xff3040, life: 0.8 });
  }

  onEnemyKilled(e, impactVel) {
    this.comboN++; this.comboT = 2.5;
    const pts = 100;
    this.addScore(pts, e.chainPos, `+${pts}`, '#ffb0c0');
    this.player.addBoost(20);
    this.fx.explosion(e.chainPos, 0xff8830);
    audio.explode();
    this.cam.addShake(0.22);
  }

  onCrateBreak(c) {
    this.addScore(25, c.pos, '+25');
    this.fx.burst(c.pos.clone().add(_v1.set(0, 0.5, 0)), { count: 16, speed: 7, colors: [0xc98a4b, 0x8a5a30], size: 7, grav: -14, life: 0.7 });
    // burst of orbs
    for (let i = 0; i < 5; i++) {
      const it = { pos: c.pos.clone().add(_v1.set((Math.random() - .5) * 1.5, 1 + Math.random(), (Math.random() - .5) * 1.5)), taken: false, phase: Math.random() * 6 };
      this.orbs.items.push(it);
    }
    // rebuild instanced mesh to fit new count
    this.scene.remove(this.orbs.inst);
    this.orbs.build();
    audio.crate();
  }

  onSpring(s) { audio.spring(); this.fx.ring(s.pos.clone().addScaledVector(s.dir, 0.8), 4, 0xff5577, s.dir); }
  onPanel(p) {
    audio.panel();
    this.fx.sparks(p.pos.clone().add(_v1.set(0, 0.5, 0)), p.dir, 12, 0x57f2ff);
    this.stylePts += 10;
  }
  onCheckpoint(cp) {
    audio.checkpoint();
    this.ui.cpToast('CHECKPOINT');
    this.fx.ring(cp.pos.clone().add(_v1.set(0, 2.9, 0)), 5, 0x37ffb0);
    this.player.addBoost(25);
  }

  onHazardTouch(kind) {
    if (kind === 'lava') { this.player.die(); }
    else this.player.hurt(this.player.pos.clone());
  }

  findChainTarget(pos, vel, maxDist) {
    // aim blend: mostly camera-forward so targets are what you SEE
    _v1.copy(this.gfx.camera.getWorldDirection(_v2));
    _v2.copy(vel); _v2.y = 0;
    const hs = _v2.length();
    _v1.multiplyScalar(Math.max(hs, 12));
    _v1.addScaledVector(_v2, 0.8);
    _v1.normalize();
    return this.enemies.findChainTarget(pos, _v1, maxDist);
  }

  onPlayerEvent(name, data) {
    const p = this.player;
    switch (name) {
      case 'jump': audio.jump(); this.fx.dust(p.pos.clone().addScaledVector(p.up, -p.r), 6); break;
      case 'doubleJump': audio.doubleJump(); this.fx.ring(p.pos.clone(), 2.5, 0x9ff3ff, p.up.clone().negate()); this.stylePts += 10; break;
      case 'land': {
        const hard = data.impact > 16;
        if (data.impact > 3) {
          audio.land(hard);
          this.fx.dust(p.pos.clone().addScaledVector(p.up, -p.r), hard ? 14 : 6);
          if (hard) this.charSquash();
        }
        break;
      }
      case 'chainStart': audio.chainDash(); this.stylePts += 15; break;
      case 'chainHit':
        audio.chainHit();
        this.cam.addShake(0.3);
        this.fx.explosion(data.target.chainPos, 0x9ff3ff);
        break;
      case 'chainMiss': break;
      case 'stompStart': audio.wallrun(); break;
      case 'wallrun': audio.wallrun(); this.stylePts += 10; break;
      case 'walljump': audio.jump(); this.fx.sparks(p.pos.clone(), p.wallN, 10); break;
      case 'rail': audio.wallrun(); this.stylePts += 15; break;
      case 'railLaunch': this.fx.ring(p.pos.clone(), 3.5, 0x37e0ff); break;
      case 'spring': break;
      case 'panel': break;
      case 'driftBoost':
        audio.boost();
        this.fx.sparks(p.pos.clone().addScaledVector(p.up, -p.r * 0.5), p.heading, 16, 0xffd94a);
        this.addScore(15);
        this.stylePts += 15;
        break;
      case 'quickstep': this.fx.sparks(p.pos.clone(), UP, 5, 0xbfefff); break;
      case 'spin': this.fx.ring(p.pos.clone(), 3, 0x9ff3ff); break;
      case 'hurt': {
        const scattered = this.orbs.scatterFrom(p.pos, data.scatter);
        p.invuln = 2;
        p.orbs = 0;
        audio.hurt();
        this.cam.addShake(0.7);
        this.ui.flash();
        this.ui.toast(`-${scattered} cores!`);
        break;
      }
      case 'death': {
        this.deaths++;
        audio.death();
        this.cam.addShake(0.8);
        this.ui.flash(0.75);
        this.ui.toast('Down! Respawning...');
        setTimeout(() => {
          if (this.mode !== 'play') return;
          p.respawn();
          p.boostMeter = Math.max(p.boostMeter, 50);
          p.orbs = 0;
          this.cam.snapBehind(p);
        }, 1050);
        break;
      }
    }
  }

  charSquash() { this.player.char.squash(0.72); }

  // ================= GOAL / RESULTS =================
  onGoal() {
    if (this.mode !== 'play') return;
    this.mode = 'results';
    audio.goal();
    this.input.exitLock();
    const t = this.time;
    const timeBonus = clamp(Math.round(1600 * (this.meta.par * 1.45 - t) / this.meta.par), 0, 1800);
    const noDeath = this.deaths === 0 ? 400 : 0;
    const finalScore = this.score + timeBonus + noDeath;
    const rank = rankFor(finalScore);
    const res = {
      time: t, score: finalScore, rank,
      cores: this.cores, coresTotal: this.orbs.items.length,
      prisms: this.prismsGot, prismsTotal: this.totalPrisms,
      chips: this.chipsGot, deaths: this.deaths,
      timeBonus, noDeath, style: this.stylePts,
    };
    const isRec = recordResult(this.levelId, res);
    audio.setIntensity(0.35);
    setTimeout(() => { audio.rank(rank); }, 700);
    this.ui.showResults(res, isRec);
    this.ui.hudVisible(false);
  }

  nextLevel() {
    const idx = LEVELS.findIndex((l) => l.id === this.levelId);
    const nxt = LEVELS[idx + 1];
    if (nxt) { this.loadLevel(nxt.id); this.ui.hudVisible(true); }
    else this.quitToMenu();
  }

  retry() { this.loadLevel(this.levelId); this.ui.hudVisible(true); }

  // ================= MAIN LOOP =================
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.elapsedAll += dt;

    const playing = this.mode === 'play';
    // pause handling
    if (playing && this.input.pauseHit) this.setPause(true);
    else if (this.mode === 'pause' && (this.input.hit('Escape') || this.input.hit('KeyP'))) this.setPause(false);
    if ((this.mode === 'play') && this.input.helpHit) this.ui.toggleHelp();
    else if (this.mode === 'help') { /* handled in ui */ }

    if (playing) {
      this.simulate(dt);
    } else if (this.mode === 'title' || this.mode === 'select' || this.mode === 'results') {
      this.menuCamera(dt);
    }

    // global updates
    this.fx.update(dt, this.gfx.camera);
    this.fx.updateFloaters(dt, this.gfx.camera);
    this.kit && this.kit.tickEnv(dt);
    for (const fn of this.tickFns) fn(dt, this.elapsedAll);
    this.gfx.updateSun(this.player.pos, this.sunDir);
    const spNorm = clamp((playing ? this.player.displaySpeed : 0) / 46, 0, 1.15);
    const boosting = playing && (this.player.boosting || this.player.panelTimer > 0);
    audio.setMotion(spNorm, {
      grinding: playing && this.player.state === 'rail',
      wall: playing && this.player.state === 'wall',
      boost: boosting,
    });
    this.gfx.render(dt, this.elapsedAll, spNorm * (boosting ? 1 : 0.72));
    this.input.endFrame();
  }

  setPause(on) {
    if (on) {
      this.mode = 'pause';
      this.ui.show('pause');
      this.input.exitLock();
      audio.setIntensity(0.3);
    } else {
      this.mode = 'play';
      this.ui.show(null);
      audio.setIntensity(1);
      this.lastT = performance.now();
      if (!this.autotest) this.input.requestLock();
    }
  }

  simulate(dt) {
    const p = this.player;
    this.time += dt;

    // music intensity follows action
    audio.setIntensity(p.boosting || p.panelTimer > 0 ? 1.45 : 1);

    // ---- wish direction (camera-relative) ----
    const camF = this.gfx.camera.getWorldDirection(_v1).clone();
    camF.y = 0;
    if (camF.lengthSq() < 0.001) camF.set(0, 0, 1);
    camF.normalize();
    const right = _v2.crossVectors(camF, UP).normalize().clone();
    p.camFwd.copy(camF); p.camRight.copy(right);
    const wish = new THREE.Vector3()
      .addScaledVector(camF, this.input.moveZ)
      .addScaledVector(right, this.input.moveX);
    if (wish.lengthSq() > 1) wish.normalize();

    // ---- movers tick once per frame ----
    for (const m of this.moversList) m.tick(dt);

    // ---- fixed-step physics ----
    const h = 1 / TUNE.physicsHz;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= h && steps < 10) {
      p.step(h, wish);
      this.acc -= h;
      steps++;
    }
    if (steps >= 10) this.acc = 0;

    // kill plane
    if (p.pos.y < this.killY && p.state !== 'dead') p.die();

    // rail magnetism while airborne
    if (p.state === 'air') {
      for (const r of this.rails) { if (p.tryRail(r)) break; }
    }

    // ---- world objects ----
    for (const o of this.springs) o.update(dt, p, this);
    for (const o of this.panels) o.update(dt, p, this);
    for (const o of this.fans) o.update(dt, p, this);
    for (const o of this.checkpoints) o.update(dt, p, this);
    for (const o of this.hazards) o.update(dt, p, this);
    for (const o of this.crates) o.update(dt, p, this);
    for (const o of this.specials) o.update(dt, p, this);
    if (this.goalObj) this.goalObj.update(dt, p, this);
    this.orbs.update(dt, p, this);
    this.enemies.update(dt, p);

    // combo decay
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.comboN = 0; }

    // chain-dash reticle target
    if (p.state === 'air') {
      this.reticleTarget = this.findChainTarget(p.pos, p.vel, TUNE.chainDashRadius);
    } else this.reticleTarget = null;

    // visuals
    p.frameUpdate(dt);
    this.cam.update(dt, p, this.input, {});
    this.updateReticleFx();
    this.ui.hudTick(dt);
  }

  updateReticleFx() {
    this.ui.setReticleLocked(!!this.reticleTarget);
  }

  menuCamera(dt) {
    // slow orbit around the level spawn for menu backdrop
    const c = this.gfx.camera;
    const t = this.elapsedAll * 0.08;
    const cx = Math.sin(t) * 26, cz = Math.cos(t) * 26;
    const focus = this.player.pos;
    c.position.lerp(_v1.set(focus.x + cx, focus.y + 11 + Math.sin(t * 0.7) * 3, focus.z + cz), 1 - Math.exp(-2 * dt));
    c.up.set(0, 1, 0);
    c.lookAt(focus.x, focus.y + 2, focus.z);
    c.fov = 62; c.updateProjectionMatrix();
    this.player.char.root.visible = true;
    this.player.frameUpdate(dt, {});
  }

  setupAutotest() {
    if (!this.autotest) return;
    const g = this;
    window.__kr = {
      v: 1,
      ready: true,
      get mode() { return g.mode; },
      get level() { return g.levelId; },
      state() {
        const p = g.player;
        return {
          mode: g.mode, level: g.levelId,
          pos: p.pos.toArray(),
          vel: p.vel.toArray(),
          speed: p.displaySpeed,
          horizSpeed: p.horizSpeed,
          state: p.state, grounded: p.grounded,
          up: p.up.toArray(),
          orbs: g.cores, boost: p.boostMeter, score: g.score,
          time: g.time, deaths: g.deaths,
          camYaw: g.cam.yaw, fov: g.gfx.camera.fov,
          prisms: g.prismsGot, chips: g.chipsGot,
          checkpointsActive: g.checkpoints.filter((c) => c.active).length,
        };
      },
      start(levelId) { g.loadLevel(levelId || 'sandbox'); },
      key(code, down) {
        g.input.keys[code] = down;
        if (down) g.input.pressed[code] = true;
        else g.input.released[code] = true;
      },
      nudgeMouse(dx, dy) { g.input.pointerLocked = true; g.input.mouseDX += dx; g.input.mouseDY += dy; },
      getInput() { return { invertX: g.input.invertX, invertY: g.input.invertY, sens: g.input.sens }; },
      tap(code) { g.input.pressed[code] = true; },
      clearKeys() { g.input.keys = Object.create(null); },
      teleport(x, y, z, yaw = 0) {
        g.player.spawn(new THREE.Vector3(x, y, z), yaw);
        g.cam.snapBehind(g.player);
      },
      give(boost) { g.player.boostMeter = boost ?? 100; },
      finish() { g.onGoal(); },
      log: [],
      events: [],
    };
    const origEvent = this.onPlayerEvent.bind(this);
    this.onPlayerEvent = (n, d) => { window.__kr.events.push(n); if (window.__kr.events.length > 200) window.__kr.events.shift(); origEvent(n, d); };
    const origToast = this.ui.toast.bind(this.ui);
    this.ui.toast = (m) => { window.__kr.log.push('toast:' + m); origToast(m); };
  }
}

// expose a couple of textures helpers needed by kit clouds
window.addEventListener('error', (e) => {
  console.error('window error:', e.message);
});

new Game();
