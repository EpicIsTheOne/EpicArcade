// LIMINAL DYNAMICS — per-frame update & render loop (mixin onto Game)
import * as THREE from 'three';

const QUALITY = {
  ultra: { recursion: 3, portalScale: 0.75, shadow: 2048 },
  high: { recursion: 2, portalScale: 0.6, shadow: 1536 },
  medium: { recursion: 1, portalScale: 0.5, shadow: 1024 },
  qa: { recursion: 0, portalScale: 0.35, shadow: 0 },
};

export function attachLoop(Game) {
  Game.prototype.frame = function (tNow) {
    requestAnimationFrame((t) => this.frame(t));
    const t = tNow * 0.001;
    let dt = Math.min(0.05, t - (this._lastT || t));
    this._lastT = t;
    if (dt <= 0) return;

    // fixed-substep physics
    const H = 1 / 120;
    let steps = Math.min(6, Math.round(dt / H));
    if (steps < 1) steps = 1;
    const h = dt / steps;

    const active = this.state === 'playing';
    if (active) {
      for (let i = 0; i < steps; i++) this.simulate(h);
      this.chamber?.update(dt);
      this.updateHeld(dt);
      this.updateBeats(dt);
    } else {
      // idle drift camera for the menu backdrop
      if (this.state === 'menu' && this.chamber) {
        this.menuCamT = (this.menuCamT || 0) + dt * 0.08;
        const c = this.chamber.playerSpawn;
        const r = 5.5;
        this.camera.position.set(
          c.x + Math.cos(this.menuCamT) * r,
          c.y + 2.2 + Math.sin(this.menuCamT * 0.6) * 0.6,
          c.z + Math.sin(this.menuCamT) * r);
        this.camera.lookAt(c.x, c.y + 0.8, c.z);
      }
      this.chamber?.update(dt);
    }

    // camera from player
    if (this.state === 'playing' || this.state === 'paused') {
      const eye = this.player.eyePos();
      this.camera.position.copy(eye);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    }

    // portal meshes + views
    const dbs = this.renderer.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2()));
    const nowS = performance.now() * 0.001;
    for (const id of ['blue', 'amber']) {
      const pp = this.portalFX.portals[id];
      pp.updateMesh(dt);
      if (pp.innerMat) {
        pp.innerMat.uniforms.uScreen.value.copy(dbs);
        pp.innerMat.uniforms.uTime.value = nowS;
      }
    }
    if (this.portalFX.bothActive()) {
      this.portalFX.renderPortalViews(this.camera, QUALITY[this.settings.quality]);
    } else {
      for (const id of ['blue', 'amber']) {
        const p = this.portalFX.portals[id];
        if (p.innerMat) p.innerMat.uniforms.uHasView.value = 0;
      }
    }

    // main render
    this.composer.render(this.scene, this.camera);

    // perf HUD
    this.perfSamples.push(dt);
    if (this.perfSamples.length > 60) this.perfSamples.shift();
    if (this._perfT === undefined || t - this._perfT > 0.5) {
      this._perfT = t;
      const el = document.getElementById('perf');
      if (el && el.style.display === 'block') {
        const avg = this.perfSamples.reduce((a, b) => a + b, 0) / Math.max(1, this.perfSamples.length);
        el.textContent = `${Math.round(1 / avg)} FPS · ${(dt * 1000).toFixed(1)} ms`;
      }
    }
  };

  Game.prototype.simulate = function (h) {
    const p = this.player;
    p.update(h, this.input);
    this.world.stepDynamics(h);
    if (this.held) {
      this.world.checkTraversal(this.held.body, () => this.sfx.teleport());
    }
    for (const hz of this.chamber.hazards) if (hz.tickHazard) hz.tickHazard(this, h);
  };

  Game.prototype.updateBeats = function (dt) {
    if (!this.beatQueue || !this.beatQueue.length) return;
    this.beatTimer -= dt;
    if (this.beatTimer <= 0) {
      const [who, line] = this.beatQueue.shift();
      this.subtitle(who, line);
      this.beatTimer = 5.2;
    }
  };

  Game.prototype.applySettings = function () {
    const s = this.settings;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * s.scale);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.player.invertX = s.invertX;
    this.player.invertY = s.invertY;
    this.player.lookScale = s.sens;
    this.sfx.setEnabled(s.audio);
    this.composer.setQuality(s.quality);
    this.portalFX.setRTScale(QUALITY[s.quality].portalScale);
    const q = QUALITY[s.quality];
    this.rig.key.castShadow = q.shadow > 0;
    if (q.shadow > 0) this.rig.key.shadow.mapSize.set(q.shadow, q.shadow);
    if (this.rig.key.shadow.map) { this.rig.key.shadow.map.dispose(); this.rig.key.shadow.map = null; }
    document.getElementById('perf').style.display =
      (s.quality === 'qa' || this._showPerf) ? 'block' : 'none';
  };

  Game.prototype.wireUI = function () {
    const $ = (id) => document.getElementById(id);
    $('btn-start').onclick = () => this.startGame();
    $('btn-resume').onclick = () => this.resume();
    $('btn-restart-chamber').onclick = () => { this.restartChamber(); this.resume(); };
    $('btn-settings').onclick = () => { $('menu-screen').classList.add('hidden'); $('settings-screen').classList.remove('hidden'); this._settingsFrom = 'menu'; };
    $('btn-settings2').onclick = () => { $('pause-screen').classList.add('hidden'); $('settings-screen').classList.remove('hidden'); this._settingsFrom = 'pause'; };
    $('btn-settings-back').onclick = () => {
      $('settings-screen').classList.add('hidden');
      $(this._settingsFrom === 'pause' ? 'pause-screen' : 'menu-screen').classList.remove('hidden');
      this.applySettings();
    };
    $('sel-quality').onchange = (e) => { this.settings.quality = e.target.value; };
    $('rng-scale').oninput = (e) => { this.settings.scale = e.target.value / 100; $('scale-val').textContent = e.target.value + '%'; };
    $('rng-fov').oninput = (e) => { this.settings.screenFov = +e.target.value; $('fov-val').textContent = e.target.value + '°'; };
    $('rng-fov').onchange = () => this.applySettings();
    $('rng-scale').onchange = () => this.applySettings();
    $('rng-sens').oninput = (e) => { this.settings.sens = e.target.value / 100; $('sens-val').textContent = (e.target.value / 100).toFixed(2); };
    $('chk-audio').onchange = (e) => { this.settings.audio = e.target.checked; };
    $('chk-invert-y').onchange = (e) => { this.settings.invertY = e.target.checked; this.applySettings(); };
    $('chk-invert-x').onchange = (e) => { this.settings.invertX = e.target.checked; this.applySettings(); };
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        this._showPerf = !this._showPerf;
        document.getElementById('perf').style.display = this._showPerf ? 'block' : 'none';
      }
    });
  };
}
