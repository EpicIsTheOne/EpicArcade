// Game director: state machine, level lifecycle, scoring/ranks, HUD glue, saves.
import * as THREE from 'three';
import { LevelBuilder, makeMaterials } from './levelkit.js';
import { Enemies } from './enemies.js';
import { Player } from './player.js';
import { VoltCharacter } from './character.js';
import { CameraRig } from './camera.js';
import { FX, SpeedLines, Trail } from './particles.js';
import { LEVEL_METAS } from '../levels/index.js';

const RANKS = ['D', 'C', 'B', 'A', 'S'];
export class Director {
  constructor(game) {
    this.game = game; // {renderer3d, input, audio, ui}
    this.state = 'boot';
    this.levelIndex = 0;
    this.level = null;
    this.player = new Player(null, game.audio);
    this.char = new VoltCharacter();
    this.cameraRig = new CameraRig(game.renderer3d.camera, null);
    this.enemies = new Enemies(game.renderer3d.scene);
    this.fx = new FX(game.renderer3d.scene);
    this.speedLines = new SpeedLines(game.renderer3d.camera);
    this.trail = new Trail(game.renderer3d.scene);
    this.time = 0; this.running = false;
    this.deaths = 0; this.damageTaken = 0;
    this.voltsGot = 0; this.gemsGot = 0;
    this.comboBest = 0;
    this.save = loadSave();
    this._msgT = 0;
  }

  // ---------- level lifecycle ----------
  async loadLevel(index) {
    const g = this.game;
    this.levelIndex = index;
    this.setState('loading');
    g.ui.showBoot(true, 'Assembling zone…');
    await frame(); await frame();

    // dispose previous
    if (this.level?.group) {
      g.renderer3d.scene.remove(this.level.group);
      disposeGroup(this.level.group);
    }
    for (const e of this.enemies.list) g.renderer3d.scene.remove(e.group);
    this.enemies.list.length = 0;
    this.player.world = null;

    const meta = LEVEL_METAS[index];
    makeMaterials(meta.theme);
    const b = new LevelBuilder(meta.theme);
    meta.build(b);
    const group = b.finish();
    g.renderer3d.scene.add(group);
    g.renderer3d.applyTheme(meta.theme);

    this.level = {
      ...meta, group,
      world: b.world,
      springs: b.springs, dashPanels: b.dashPanels, movers: b.movers,
      checkpoints: b.checkpoints, gems: b.gems, volts: b.volts,
      updrafts: b.updrafts, killZ: b.killZ ?? -60,
      spawnPoint: b.spawnPoint, goalPos: b.goalPos, parTime: meta.parTime,
      goalMesh: b.goalMesh, name: meta.name,
    };
    this.cameraRig.world = b.world;
    this.player.world = b.world;
    this.player.ctx = { level: this.level, enemies: this.enemies, fx: this.fx, director: this };
    this.player.spawnFallback = b.spawnPoint.clone();
    this.player.checkpointPos = b.spawnPoint.clone();

    // character mesh + shell + scarf into scene
    const shell = new THREE.Mesh(new THREE.SphereGeometry(.62, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x2ee8ff, emissive: 0x2ee8ff, emissiveIntensity: 1.6, transparent: true, opacity: .42 }));
    shell.visible = false;
    g.renderer3d.scene.add(shell);
    this.char.setShell(shell);
    g.renderer3d.scene.add(this.char.group);
    if (this.char.scarf && this.char.scarf.parent !== g.renderer3d.scene) g.renderer3d.scene.add(this.char.scarf);

    // enemies
    for (const spec of b.enemySpawns) this.enemies.spawn(spec);

    // volts instanced rendering
    this.buildVolts();

    // player reset
    this.player.respawn(b.spawnPoint);
    this.player.maxSpeedSeen = 0;
    this.time = 0; this.deaths = 0; this.damageTaken = 0;
    this.voltsGot = 0; this.gemsGot = 0; this.comboBest = 0;
    this.cameraRig.snapBehind(this.player.pos, 0);
    this.trail.reset(this.player.pos);

    g.ui.hudInit(this);
    g.audio.setTrack(meta.music);
    await frame();
    g.ui.showBoot(false);
    this.setState('playing');
  }
  buildVolts() {
    const scene = this.game.renderer3d.scene;
    if (this.voltMesh) { scene.remove(this.voltMesh); this.voltMesh.geometry.dispose(); }
    const n = Math.max(1, this.level.volts.length);
    const geo = new THREE.IcosahedronGeometry(.28, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffaa00, emissiveIntensity: 1.6, roughness: .25, metalness: .6 });
    this.voltMesh = new THREE.InstancedMesh(geo, mat, n);
    this.voltMesh.frustumCulled = false;
    const M = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      M.makeTranslation(this.level.volts[i].pos.x, this.level.volts[i].pos.y, this.level.volts[i].pos.z);
      this.voltMesh.setMatrixAt(i, M);
    }
    scene.add(this.voltMesh);
    this._voltM = new THREE.Matrix4(); this._voltQ = new THREE.Quaternion(); this._voltE = new THREE.Euler(); this._voltS = new THREE.Vector3(1,1,1);
  }
  updateVolts(dt, t) {
    if (!this.voltMesh) return;
    const p = this.player.pos;
    let dirty = false;
    for (let i = 0; i < this.level.volts.length; i++) {
      const v = this.level.volts[i];
      if (v.taken) continue;
      const dx=v.pos.x-p.x, dz=v.pos.z-p.z;
      if (dx*dx+dz*dz < 3600 || !v._init) {
        this._voltE.set(t*2+i, t*2.6+i*.7, 0);
        this._voltQ.setFromEuler(this._voltE);
        this._voltM.compose(v.pos, this._voltQ, this._voltS);
        this.voltMesh.setMatrixAt(i, this._voltM);
        v._init = true; dirty = true;
      }
    }
    if (dirty) this.voltMesh.instanceMatrix.needsUpdate = true;
    // hide collected ones lazily
    if (this._voltDirtyFull) {
      const M = new THREE.Matrix4().makeScale(0,0,0);
      for (let i=0;i<this.level.volts.length;i++) if (this.level.volts[i].taken) this.voltMesh.setMatrixAt(i, M);
      this.voltMesh.instanceMatrix.needsUpdate = true;
      this._voltDirtyFull = false;
    }
  }
  hideVoltInstance() { this._voltDirtyFull = true; }

  // ---------- state ----------
  setState(s) {
    this.state = s;
    this.game.ui.setState(s, this);
    if (s === 'playing') this.running = true;
    else if (s !== 'paused') this.running = false;
  }
  pause() { if (this.state === 'playing') { this.setState('paused'); this.game.input.releaseLock(); this.game.audio.uiBack(); } }
  resume() { if (this.state === 'paused') { this.setState('playing'); } }

  shake(x) { this.cameraRig.addShake(x); }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    const r3 = g.renderer3d;
    const playing = this.state === 'playing' && this.level;

    // movers animate even when paused? no—only while playing
    if (playing) {
      this.time += dt;
      // movers
      const t = performance.now() / 1000;
      for (const m of this.level.movers) {
        m.prev.copy(m.mesh.position);
        m.getPos(t + m.phaseOffset, m.mesh.position);
        m.vel.copy(m.mesh.position).sub(m.prev).divideScalar(Math.max(dt, 1e-4));
      }
      if (this.level.goalMesh) {
        this.level.goalMesh.rotation.y += dt * 1.5;
        this.level.goalMesh.rotation.x = Math.sin(t * .8) * .18;
      }
      for (const gm of this.level.gems) if (!gm.taken) { gm.mesh.rotation.y += dt * 2; gm.mesh.position.y = gm.pos.y + Math.sin(t * 2 + gm.pos.x) * .25; }

      // quick-step double taps
      // (input.onQuickStep wired in main)
      this.player.tick(dt, g.input, this.cameraRig.yaw);
      // grind attach check when airborne falling near rail
      if (!this.player.grounded && this.player.state === 'air' && !this.player.grind && this.player.vel.y < 3) {
        // only when close to a rail and moving toward it
        this.tryGrindAttach();
      }
      this.enemies.update(dt, this.player, this.fx, g.audio, this);
      this.fx.update(dt);
      this.updateVolts(dt, t);

      // events already wired in main via player.on(...)
    }

    // camera always updates (menu orbit etc.)
    this.cameraRig.update(dt, this.player, g.input, { frozen: !playing });
    r3.updateSunFollow(this.player.pos);
    this.speedLines.update(dt, playing ? this.player.vel.length() : 0, r3.camera);

    // trail + character visuals
    const p = this.player;
    const sp = p.vel.length();
    const showTrail = sp > 20 || !!p.grind || (p.attacking && !p.grounded) || p.boostingFx;
    if (playing) {
      if (sp > 1 || p.grind) this.trail.push(p.pos.clone().add(new THREE.Vector3(0, -0.35, 0)));
      this.char.group.position.copy(p.pos).addScaledVector(p.up, -0.12);
      this.char.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.grounded || p.grind ? p.up : new THREE.Vector3(0,1,0));
      this.char.update(dt, {
        speed: sp, grounded: p.grounded, grinding: !!p.grind, drifting: p.drifting,
        attacking: p.attacking && !p.stomping, stomping: p.stomping, vy: p.vel.dot(p.up),
        turnRate: p.turnRate, justLanded: p.justLanded, hasDir: p.hasDir,
        moveYaw: p.moveYaw ?? Math.atan2(p.vel.x, p.vel.z),
      });
      const neck = p.pos.clone().add(new THREE.Vector3(0, .55, 0));
      this.char.updateScarf(neck, p.vel, dt);
      if (p.grind && Math.random() < dt * 40) {
        this.fx.burst(p.pos.clone().add(new THREE.Vector3((Math.random()-.5)*.4, -.45, (Math.random()-.5)*.4)), 2, 0xffc24d, 2.4, .3, 14);
      }
      if (p.drifting && p.grounded && Math.random() < dt * 30) {
        this.fx.burst(p.pos.clone().add(new THREE.Vector3(0,-.4,0)), 2, 0x9fefff, 2.2, .25, 10);
      }
      p.boostingFx = p._wasBoost;
    }
    this.trail.update(dt, showTrail);

    // audio dynamics
    g.audio.loops(!!p.grind, p.vel.length(), sp, !!p._wasBoost);
    g.audio.setIntensity(THREE.MathUtils.clamp(sp / 38, .12, 1));
    g.audio.updateMusic(dt);

    // HUD
    if (this.level) g.ui.hudUpdate(this, dt);
  }

  tryGrindAttach() {
    const p = this.player;
    const nr = p.world.nearestRail(p.pos, 1.15);
    if (!nr) return;
    // must be roughly above/below the rail line and falling onto it
    if (nr.dist < 0.95 && p.vel.dot(nr.tangent) > -2) {
      p.tryGrind();
      this.toast('GRIND!');
    }
  }

  // ---------- scoring ----------
  onGoal() {
    if (this.state !== 'playing') return;
    this.game.audio.goal();
    this.finalizeResults();
  }
  finalizeResults() {
    const L = this.level;
    const timeScore = Math.max(0, L.parTime - this.time);
    const totalVolts = L.volts.length || 1;
    const voltPct = this.voltsGot / totalVolts;
    const gemPct = this.gemsGot / Math.max(1, L.gems.length);
    let score = 0;
    score += Math.round(timeScore / L.parTime * 40000);
    score += Math.round(voltPct * 30000);
    score += Math.round(gemPct * 15000);
    score += this.enemies.destroyedCount() * 300;
    score -= this.damageTaken * 800;
    score -= this.deaths * 1200;
    score = Math.max(0, score);
    // rank thresholds relative to par
    let rankIdx = 0;
    const t = this.time / L.parTime;
    if (t <= 0.8 && voltPct > 0.5) rankIdx = 4;
    else if (t <= 0.95 && voltPct > 0.35) rankIdx = 3;
    else if (t <= 1.15) rankIdx = 2;
    else if (t <= 1.5) rankIdx = 1;
    if (this.deaths > 2) rankIdx = Math.max(0, rankIdx - 1);
    const rank = RANKS[rankIdx];

    const rec = this.save.levels[this.levelIndex] ||= { bestTime: Infinity, bestRank: '-', bestScore: 0 };
    if (this.time < rec.bestTime) rec.bestTime = this.time;
    if (score > rec.bestScore) rec.bestScore = score;
    if (RANKS.indexOf(rank) > RANKS.indexOf(rec.bestRank)) rec.bestRank = rank;
    saveSave(this.save);

    this.lastResults = { score, rank, time: this.time, voltsGot: this.voltsGot, totalVolts, gemsGot: this.gemsGot, totalGems: L.gems.length, deaths: this.deaths, maxSpeed: this.player.maxSpeedSeen, enemies: this.enemies.destroyedCount(), combo: this.comboBest };
    this.setState('results');
  }
  toast(msg) { this.game.ui.toast(msg); }
}

// ---------- persistence ----------
function loadSave() {
  try { return JSON.parse(localStorage.getItem('voltrunner_save')) || { levels: {} }; }
  catch { return { levels: {} }; }
}
function saveSave(s) { try { localStorage.setItem('voltrunner_save', JSON.stringify(s)); } catch {} }
function frame() { return new Promise(r => requestAnimationFrame(r)); }
function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.dispose()); }
  });
}
