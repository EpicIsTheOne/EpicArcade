// main.js — VELOCITY RUSH: original high-speed 3D action platformer.
// Boot, render loop, state machine, gameplay events, scoring, QA hooks.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

import { Input } from './engine/input.js';
import { CollisionWorld } from './engine/physics.js';
import { ParticleSystem, TrailRibbon, SpeedLines } from './engine/fx.js';
import { makeSky, makeClouds, applyThemeLights, THEMES } from './engine/sky.js';
import { AudioEngine } from './engine/audio.js';
import { Character } from './game/character.js';
import { Player } from './game/player.js';
import { ChaseCamera } from './game/camera.js';
import { Level } from './game/level.js';
import { HUD } from './game/hud.js';
import { Save } from './game/save.js';
import { Autopilot, VirtualInput } from './game/autopilot.js';
import { LEVELS, getLevelDef } from './levels/index.js';

const SIM_DT = 1 / 240;

function qaLog(...a) { console.log('[QA]', ...a); }

class Game {
  constructor() {
    this.qa = new URLSearchParams(location.search).get('qa') === '1';
    this.autopilotOn = new URLSearchParams(location.search).get('autopilot') === '1';
    const gfxParam = new URLSearchParams(location.search).get('gfx');

    // ---- renderer ----
    const canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ---- quality ----
    this.quality = gfxParam || this.detectQuality();

    // ---- scene basics ----
    this.scene = new THREE.Scene();
    this.camera3d = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 5000);
    this.chaseCam = new ChaseCamera(this.camera3d);

    // composer
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera3d);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.65, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // systems
    this.world = null;
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.save = new Save();
    this.hud = new HUD(this);
    this.fx = new ParticleSystem(this.scene);
    this.speedLines = new SpeedLines(document.getElementById('speedlines'));
    this.trailL = new TrailRibbon(this.scene, '#5ff5e0', 42, 0.26);
    this.trailR = new TrailRibbon(this.scene, '#9fe8ff', 42, 0.26);
    this.character = new Character(this.scene);
    this.player = new Player(this);
    this.autopilot = new Autopilot(this);
    this.applyQuality();

    this.state = 'TITLE';
    this.levelId = null;
    this.levelName = '';
    this.level = null;
    this.sky = null; this.clouds = null; this.lights = null;
    this.finished = false;
    this.runTime = 0; this.penalty = 0;
    this.sparkCount = 0; this.boltCount = 0;
    this.kills = 0;
    this.orbs = [];
    this._fadeEl = null;

    // apply persisted settings
    const s = this.save.data.settings;
    if (s.quality && s.quality !== 'auto' && !gfxParam) { this.quality = s.quality; this.applyQuality(); }
    this.input.invertX = s.invertX; this.input.invertY = s.invertY;
    if (s.music !== undefined) this.audio.setMusic(s.music);
    if (s.sfx !== undefined) this.audio.setSfx(s.sfx);

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'PLAY' && !this.qa) this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'PLAY') { /* lock loss handles pause */ }
      if (e.code === 'KeyM' && this.state === 'PLAY') {
        this.audio.setMusic(!this.audio.musicOn);
        this.save.data.settings.music = this.audio.musicOn; this.save.flush();
        this.hud.toast(this.audio.musicOn ? 'MUSIC ON' : 'MUSIC OFF');
      }
      if (e.code === 'KeyR' && this.state === 'PLAY' && !this.finished) this.respawnPlayer(false);
    });

    this.hud.buildTitleMenu();
    this.hud.showScreen('title-screen');
    // idle scene behind title: coast theme sky + clouds
    this.previewScene();

    // audio unlock on first gesture
    const unlock = () => {
      if (this.audio.ensure()) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // QA hooks
    window.addEventListener('error', (e) => { this.errorCount = (this.errorCount || 0) + 1; qaLog('error', e.message); });
    window.addEventListener('unhandledrejection', (e) => { this.errorCount = (this.errorCount || 0) + 1; qaLog('error', String(e.reason)); });

    this.ready = true;
    qaLog('ready', { quality: this.quality, levels: LEVELS.length });
    if (this.qa && this.autopilotOn) {
      const lvl = new URLSearchParams(location.search).get('level') || 'coast';
      setTimeout(() => this.startLevel(lvl), 300);
    }

    this.lastTime = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  detectQuality() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      if (/swiftshader|llvmpipe|software|basic render/i.test(String(r))) return 'low';
    } catch { }
    return (navigator.hardwareConcurrency || 4) >= 8 ? 'ultra' : 'high';
  }

  applyQuality() {
    const q = this.quality;
    const pr = Math.min(devicePixelRatio || 1, q === 'ultra' ? 2 : q === 'high' ? 1.6 : q === 'medium' ? 1.25 : 0.85);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.bloomPass.enabled = q === 'high' || q === 'ultra';
    this.bloomPass.strength = q === 'ultra' ? 0.62 : 0.45;
    this.fxQuality = q;
    this.resize();
  }

  applySettings() {
    const s = this.save.data.settings;
    this.input.invertX = s.invertX; this.input.invertY = s.invertY;
    this.audio.setMusic(s.music); this.audio.setSfx(s.sfx);
    if (s.quality !== 'auto') { this.quality = s.quality; }
    this.applyQuality();
    this.save.flush();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera3d.aspect = w / h;
    this.camera3d.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.speedLines.resize(w, h);
  }

  previewScene() {
    // simple animated backdrop for title
    this.clearWorldScene();
    const theme = THEMES.coast;
    this.scene.background = new THREE.Color(theme.skyTop);
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    this.sky = makeSky(theme); this.scene.add(this.sky);
    this.clouds = makeClouds(theme); this.scene.add(this.clouds);
    this.lights = applyThemeLights(this.scene, theme);
    const demoIsle = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: .9 }));
    demoIsle.position.set(0, -14, -40);
    this.lights.sun.target.position.copy(demoIsle.position);
    this.scene.add(demoIsle);
    this._titleProps = [demoIsle];
  }

  clearWorldScene() {
    for (const o of [this.sky, this.clouds]) if (o) this.scene.remove(o);
    if (this._titleProps) { for (const o of this._titleProps) this.scene.remove(o); this._titleProps = null; }
    if (this.lights) { this.scene.remove(this.lights.hemi, this.lights.sun, this.lights.sun.target); }
    if (this.level) { this.level.dispose(); this.level = null; }
    this.sky = this.clouds = this.lights = null;
    this.orbs.forEach(o => this.scene.remove(o.mesh)); this.orbs.length = 0;
  }

  /* ============================ level flow ============================ */
  startLevel(id) {
    const def = getLevelDef(id);
    this.state = 'LOADING';
    this.hud.showScreen('loading-screen');
    // async-ish build to let the loader paint
    setTimeout(() => {
      this.clearWorldScene();
      this.world = new CollisionWorld(10);
      const theme = THEMES[def.themeKey];
      this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
      this.sky = makeSky(theme); this.scene.add(this.sky);
      this.clouds = makeClouds(theme, theme.night ? 18 : 26); this.scene.add(this.clouds);
      this.lights = applyThemeLights(this.scene, theme);

      this.level = new Level(this, def);
      this.levelId = id;
      this.levelName = def.name;

      this.player.hearts = 3;
      this.player.boostMeter = 50;
      this.player.stats = { maxSpeed: 0, grindTime: 0, jumps: 0, springsHit: 0, panelsHit: 0, dives: 0, divesHit: 0, falls: 0, hitsTaken: 0 };
      this.player.spawnAt(def.spawn, def.spawnYaw || 0);
      this.chaseCam.snapBehind(this.player);
      this.trailL.clear(); this.trailR.clear();

      this.finished = false;
      this.runTime = 0; this.penalty = 0;
      this.sparkCount = 0; this.boltCount = 0; this.kills = 0;
      this.sparkTotal = this.level.sparkCount();
      this.boltTotal = this.level.boltCount();

      this.hud.showScreen(null);
      this.state = 'PLAY';
      if (!this.qa) this.input.requestLock();
      this.audio.playTrack(def.music);
      qaLog('level_started', id);
      if (this.autopilotOn) this.autopilot.reset();
    }, 60);
  }

  pause() {
    if (this.state !== 'PLAY') return;
    this.state = 'PAUSED';
    this.input.releaseLock();
    this.hud.buildPauseMenu();
    this.hud.showScreen('pause-screen');
    this.audio.stopTrack();
  }
  resume() {
    if (this.state !== 'PAUSED') return;
    this.state = 'PLAY';
    this.hud.showScreen(null);
    this.input.requestLock();
    this.audio.playTrack(getLevelDef(this.levelId).music);
  }
  quitToTitle() {
    this.state = 'TITLE';
    this.audio.stopTrack();
    this.clearWorldScene();
    this.world = null; this.level = null;
    this.previewScene();
    this.hud.buildTitleMenu();
    this.hud.showScreen('title-screen');
  }

  respawnPlayer(softReboot) {
    const p = this.player;
    p.pos.copy(p.checkpoint);
    p.vel.set(0, 0, 0);
    p.yaw = p.cpYaw;
    p.rail = null; p.dive.active = false;
    p.grounded = false;
    if (softReboot) {
      p.hearts = 2;
      this.penalty += 5;
      this.hud.toast('SYSTEM REBOOT · +5s PENALTY');
    }
    this.chaseCam.snapBehind(p);
    this.fx.burst(p.pos, 16, { color: '#7ff7e8', speed: 8, life: .5 });
    this.audio.tone('sine', 220, 440, .2, .15);
  }

  levelComplete() {
    if (this.finished) return;
    this.finished = true;
    this.audio.goalFanfare();
    const time = this.runTime, par = this.level.par;
    const maxTime = par * 1.75;
    const timeScore = Math.round(5000 * THREE.MathUtils.clamp((maxTime - time) / (maxTime - par * 0.55), 0.08, 1));
    const allSparks = this.sparkCount >= this.sparkTotal;
    const sparkScore = this.sparkCount * 80 + (allSparks ? 800 : 0);
    const boltScore = this.boltCount * 1500;
    const combatScore = this.kills * 250;
    const noHitScore = this.player.stats.hitsTaken === 0 ? 2000 : 0;
    const total = timeScore + sparkScore + boltScore + combatScore + noHitScore;
    const maxPossible = 5000 + (this.sparkTotal * 80 + 800) + this.boltTotal * 1500 + this.totalEnemies() * 250 + 2000;
    const ratio = total / maxPossible;
    const rank = ratio >= 0.86 ? 'S' : ratio >= 0.70 ? 'A' : ratio >= 0.52 ? 'B' : ratio >= 0.32 ? 'C' : 'D';

    const idx = LEVELS.findIndex(l => l.id === this.levelId);
    const next = LEVELS[idx + 1];
    const data = {
      levelName: this.levelName, time, penalty: this.penalty, timeScore,
      sparks: this.sparkCount, sparkTotal: this.sparkTotal, sparkScore,
      bolts: this.boltCount, boltTotal: this.boltTotal, boltScore,
      kills: this.kills, combatScore, hits: this.player.stats.hitsTaken, noHitScore,
      total, rank, hasNext: !!next, nextId: next ? next.id : null
    };
    const isBest = this.save.record(this.levelId, { score: total, rank, time: (time + this.penalty) * 1000 });
    if (isBest) this.hud.toast('NEW RECORD!');
    this.lastRank = rank;
    qaLog('goal', { level: this.levelId, time: +(time).toFixed(2), rank, total });
    setTimeout(() => { this.hud.showResults(data); this.state = 'RESULTS'; }, 1400);
  }

  totalEnemies() { return this.level ? this.level.enemies.length : 0; }

  /* ============================ gameplay events ============================ */
  findDiveTarget(pos, camYaw) {
    if (!this.level) return null;
    const vf = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    let best = null, bestD = 24;
    for (const e of this.level.enemies) {
      if (!e.alive) continue;
      const to = e.pos.clone().sub(pos);
      const d = to.length();
      if (d > bestD) continue;
      to.normalize();
      const flat = new THREE.Vector3(to.x, 0, to.z);
      if (flat.lengthSq() > 0.01 && flat.normalize().dot(vf) < 0.35) continue;
      best = e; bestD = d;
    }
    return best;
  }

  killEnemy(e, cause) {
    if (!e.alive) return;
    e.kill(this.fx);
    this.kills++;
    this.player.grantBoost(10);
    this.player.bumpCombo();
    this.audio.explode();
    this.chaseCam.kick(0.25);
    this.hud.toast(`${cause.toUpperCase()}! +BOOST`, '');
  }

  spawnOrb(pos, vel) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0xff66aa, emissiveIntensity: 2 }));
    m.position.copy(pos);
    this.scene.add(m);
    this.orbs.push({ mesh: m, vel: vel.clone(), t: 4.5 });
  }

  onSpark(pos) {
    this.sparkCount++;
    this.player.grantBoost(2.5);
    this.player.bumpCombo();
    this.audio.collect(this.player.combo);
    this.fx.burst(pos, 5, { color: '#ffd166', speed: 4, life: .35, size: .45 });
  }
  onBolt(pos) {
    this.boltCount++;
    this.audio.secret();
    this.fx.burst(pos, 24, { color: '#ff5964', speed: 9, life: .8, size: .6 });
    this.hud.toast(`SECRET BOLT ${this.boltCount}/${this.boltTotal}!`, 'secret');
  }
  onSpring(pos) {
    this.audio.spring();
    this.fx.burst(pos, 12, { color: '#7ff7e8', speed: 7, life: .4 });
    this.player.airTime = 0.3;
  }
  onPanel(pos) {
    this.audio.dash();
    this.fx.burst(pos, 14, { color: '#22e5ff', speed: 12, life: .35, size: .55 });
    this.chaseCam.kick(0.12);
  }
  onCheckpoint(pos) {
    this.audio.checkpointSnd();
    this.hud.message('CHECKPOINT', 1.1);
    this.fx.burst(pos, 14, { color: '#17c3b2', speed: 6, life: .5 });
  }
  onTrick(name) { this.hud.toast(name); }
  onJump(pos) {
    this.audio.jump();
    this.fx.burst(pos, 6, { color: '#cfe8e4', speed: 3, life: .3, size: .5 });
  }
  onLand(pos, speed) {
    this.audio.land();
    if (speed > 20) this.fx.burst(pos, 10, { color: '#d9cdb4', speed: 5, life: .4 });
  }
  onHardImpact(pos, impact) {
    this.chaseCam.kick(Math.min(0.7, impact / 70));
    this.audio.hit();
    this.fx.burst(pos, 14, { color: '#ffb454', speed: 8, life: .4 });
  }
  onPlayerHit() {
    this.hud.damageFlash();
    this.audio.hit();
    this.chaseCam.kick(0.6);
  }

  /* ============================ main loop ============================ */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const input = this.activeInput();

    if (this.state === 'PLAY' || this.state === 'PAUSED') {
      if (this.state === 'PLAY') {
        // camera look (once per frame)
        if (!this.autopilotOn) {
          this.chaseCam.onMouse(input.consumedDX || 0, input.consumedDY || 0,
            this.input.sensitivity, this.input.invertX, this.input.invertY);
          this.chaseCam.distMul = THREE.MathUtils.clamp(this.chaseCam.distMul + input.wheel * 0.08, 0.6, 1.7);
        }
        // autopilot drives virtual input
        if (this.autopilotOn) this.autopilot.update(dt);

        // fixed-step sim
        this.runTime += dt;
        this.acc += dt;
        let steps = 0;
        while (this.acc >= SIM_DT && steps < 12) {
          this.player.step(SIM_DT, input, this.chaseCam.yaw);
          this.acc -= SIM_DT;
          steps++;
        }
        this.level.update(dt, this.player);
        this.updateOrbs(dt);
      }
      // visuals follow sim
      this.updateCharacterVisuals(dt);
      this.chaseCam.update(dt, this.player, this.world);
      this.updateFx(dt);
      this.hud.update(dt);
      if (this.sky) this.sky.position.copy(this.camera3d.position);
      if (this.clouds) this.clouds.position.x = this.camera3d.position.x * 0.9;
      this.lights.sun.position.copy(this.player.pos).addScaledVector(THEMES[this.level.def.themeKey].sunDir, 260);
      this.lights.sun.target.position.copy(this.player.pos);
    } else if (this.state === 'TITLE') {
      // slow orbit backdrop
      const t = now * 0.00004;
      this.camera3d.position.set(Math.sin(t) * 90, 26, Math.cos(t) * 90 - 40);
      this.camera3d.up.set(0, 1, 0);
      this.camera3d.lookAt(0, -6, -40);
      if (this.clouds) this.clouds.rotation.y += dt * 0.004;
    }

    this.composer.render();
    input.endFrame && input.endFrame();
    void dt;
  }

  activeInput() {
    return this.autopilotOn ? this.autopilot.vinput : this.input;
  }

  updateOrbs(dt) {
    const p = this.player;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t -= dt;
      o.mesh.position.addScaledVector(o.vel, dt);
      if (o.mesh.position.distanceTo(p.pos) < 1.1) {
        if (p.hurt(o.mesh.position)) this.onPlayerHit();
        o.t = 0;
      }
      if (o.t <= 0) { this.scene.remove(o.mesh); this.orbs.splice(i, 1); }
    }
  }

  updateCharacterVisuals(dt) {
    const p = this.player, c = this.character;
    c.setVisible(true);
    c.animate(dt, {
      pos: p.pos, yaw: p.yaw,
      speed01: THREE.MathUtils.clamp(p.speed / 95, 0, 1),
      grounded: p.grounded && !p.rail,
      airTime: p.airTime, vy: p.vel.y,
      drifting: p.drifting, turnLean: p.turnLean,
      grinding: !!p.rail,
      dive: p.dive.active,
      boosting: p.boosting,
      landT: p.landT > 0 ? p.landT / 0.16 : 0,
      vel: p.vel
    });
  }

  updateFx(dt) {
    const p = this.player;
    this.fx.update(dt);
    // boot trails
    const sp01 = THREE.MathUtils.clamp(p.speed / 95, 0, 1);
    const trailI = (p.boosting ? 1 : 0) * 0.9 + Math.max(0, sp01 - 0.55) * 1.6 + (p.rail ? 0.5 : 0) + (p.dive.active ? 1 : 0);
    this.trailL.intensity = THREE.MathUtils.clamp(trailI, 0, 1);
    this.trailR.intensity = this.trailL.intensity;
    if (this.trailL.intensity > 0.04) {
      const right = new THREE.Vector3(-Math.cos(p.yaw), 0, Math.sin(p.yaw));
      const base = p.pos.clone().addScaledVector(right, 0.22); base.y -= 0.45;
      const base2 = p.pos.clone().addScaledVector(right, -0.22); base2.y -= 0.45;
      this.trailL.push(base, right.clone().multiplyScalar(0.4).setY(0.15));
      this.trailR.push(base2, right.clone().multiplyScalar(0.4).setY(0.15));
    }
    // wind streak particles at high speed
    if (sp01 > 0.45 && Math.random() < dt * 60 * sp01) {
      const dir = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - 0.5) * 7);
      const pt = p.pos.clone().addScaledVector(dir, 6 + Math.random() * 8).add(side);
      pt.y += (Math.random() - 0.3) * 4;
      this.fx.emit(pt.x, pt.y, pt.z, -dir.x * 30, 0, -dir.z * 30,
        { color: '#dff6ff', life: .5, size: .38, gravity: 0, drag: 0.4, alpha: .7 });
    }
    // drift sparks
    if (p.drifting && Math.random() < dt * 50) {
      this.fx.emit(p.pos.x, p.pos.y - 0.7, p.pos.z,
        (Math.random() - .5) * 4, 2 + Math.random() * 2, (Math.random() - .5) * 4,
        { color: '#ff9f1c', life: .35, size: .4, gravity: 14 });
    }
    // boost flames
    if (p.boosting && Math.random() < dt * 80) {
      this.fx.emit(p.pos.x, p.pos.y - 0.5, p.pos.z,
        -p.vel.x * .25, 1, -p.vel.z * .25,
        { color: '#66e0ff', life: .3, size: .5, gravity: 0 });
    }
    this.speedLines.update(dt, THREE.MathUtils.clamp((sp01 - 0.5) * 1.8 + (p.boosting ? 0.25 : 0), 0, 1));
    this.audio.boostLoop(p.boosting ? THREE.MathUtils.clamp(p.speed / 80, 0, 1) : 0);
  }

  /* ============================ QA ============================ */
  qaState() {
    const p = this.player;
    return {
      ready: !!this.ready,
      state: this.state,
      level: this.levelId,
      finished: this.finished,
      time: +(this.runTime + this.penalty).toFixed(2),
      rank: this.lastRank || null,
      sparks: `${this.sparkCount}/${this.sparkTotal || 0}`,
      bolts: `${this.boltCount}/${this.boltTotal || 0}`,
      kills: this.kills,
      errors: this.errorCount || 0,
      player: {
        pos: p ? p.pos.toArray().map(v => +v.toFixed(1)) : null,
        speed: p ? +p.speed.toFixed(1) : 0,
        grounded: p ? p.grounded : false,
        grinding: p ? !!p.rail : false,
        boosting: p ? p.boosting : false,
        hearts: p ? p.hearts : 0,
        yaw: p ? +p.yaw.toFixed(2) : 0
      },
      camYaw: +this.chaseCam.yaw.toFixed(2),
      stats: p ? p.stats : {},
      waypointsLeft: this.autopilot ? (this.level ? this.level.def.waypoints.length - this.autopilot.wpIndex : 0) : 0
    };
  }
}

// bootstrap
const game = new Game();
window.__VR = game;
export default game;
