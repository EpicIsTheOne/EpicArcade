// main.js — game bootstrap + orchestrator (the only ES module).
'use strict';
const __R = (p) => window.__req(p);
const { World } = __R('./world.js');
const { Player } = __R('../entities/player.js');
const { Input } = __R('./input.js');
const { UI } = __R('./ui.js');
const { Inventory } = __R('./inventory.js');
const { MobManager } = __R('../entities/mobs.js');
const { DropManager } = __R('../entities/drops.js');
const { Stations } = __R('../world/stations.js');
const { AudioEngine } = __R('../audio/audio.js');
const { SkyDome } = __R('./sky.js');
const { CloudDome } = __R('./clouds.js');
const { PostChain } = __R('./post.js');
const { ParticleSystem } = __R('./particles.js');
const { Weather } = __R('./weather.js');
const { buildAtlasBrowser, makeChunkMaterials } = __R('./materials.js');
const { saveWorld, loadWorld, loadSettings, saveSettings } = __R('./persist.js');
const REG = __R('../shared/blocks.js');
const { B, I } = REG;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 1400);
    this.settings = loadSettings();
    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume / 100);
    this.inventory = new Inventory();
    this.state = 'title';
    this.dayLength = 600;
    this.timeOfDay = 0.30;
    this.elapsed = 0;
    this.saveName = 'world';
    this.seedStr = 'hermes';
    this.autosaveT = 0;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsShown = 60;
    this.xp = 0; this.level = 0;
    this.spawned = false;
    this.bindResize();
  }

  bindResize() {
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.post) this.post.setSize(innerWidth, innerHeight);
    });
  }

  applyGraphicsPreset(preset) {
    const s = this.settings;
    s.preset = preset;
    if (preset === 'ultra') Object.assign(s, { shadows: 'high', post: 'on', clouds: 'on' });
    else if (preset === 'high') Object.assign(s, { shadows: 'high', post: 'on', clouds: 'on' });
    else if (preset === 'medium') Object.assign(s, { shadows: 'off', post: 'on', clouds: 'on' });
    else Object.assign(s, { shadows: 'off', post: 'off', clouds: 'off' });
    this.applySettings(s);
  }

  applySettings(s) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.baseFov = s.fov;
    this.camera.updateProjectionMatrix();
    if (this.input) { this.input.sens = s.sens; this.input.invX = s.invX; this.input.invY = s.invY; }
    if (this.world) this.world.renderDistance = s.renderDistance;
    if (this.materials) {
      const far = s.renderDistance * 16 * (s.fog / 100 * 0.5 + 0.5);
      for (const k of ['solid', 'cutout', 'trans']) {
        this.materials[k].uniforms.uFogFar.value = far;
        this.materials[k].uniforms.uFogNear.value = far * 0.55;
      }
    }
    if (this.clouds) this.clouds.mesh.visible = s.clouds === 'on';
    if (this.post) this.post.enabled = s.post === 'on' && s.preset !== 'low';
    if (this.audio) this.audio.setVolume(s.volume / 100);
    saveSettings(s);
  }

  async boot() {
    const atlas = buildAtlasBrowser();
    window.__atlasCanvas = atlas.canvas;
    this.tileAvg = atlas.avg;
    const far = this.settings.renderDistance * 16;
    this.materials = makeChunkMaterials(atlas.canvas, { fogNear: far * 0.55, fogFar: far * 0.98 });
    window.__dropMaterialFor = () => null;
    window.__dropColorFor = (id) => {
      const it = REG.ITEMS[id];
      if (it && it.block !== undefined && REG.BLOCKS[it.block]) {
        const def = REG.BLOCKS[it.block];
        const t = def.tex.all || def.tex.side || def.tex.top || 'stone';
        const a = this.tileAvg[t] || [0.9, 0.2, 0.9];
        return new THREE.Color(a[0], a[1], a[2]).getHex();
      }
      return 0xd8c8a8;
    };
    this.skyDome = new SkyDome(this.scene);
    this.clouds = new CloudDome(this.scene);
    this.particles = new ParticleSystem(this.scene, 1200);
    this.weather = new Weather(this.scene);
    this.post = new PostChain(this.renderer, {
      width: innerWidth, height: innerHeight,
      enabled: this.settings.post === 'on',
      lowMode: this.settings.preset === 'low',
    });
    this.ui = new UI(this);
    this.wireMenus();
    this.syncOptionsUI();
    // does a save exist?
    try {
      const sv = await loadWorld('world');
      if (sv && sv.version) document.getElementById('loadWorldRow').style.display = 'block';
      else document.getElementById('titleHint').textContent = 'No saved world yet — create one!';
    } catch (e) { void e; }
    this.lastT = performance.now();
    this.titleLoop();
  }

  // ------- menus -------
  syncOptionsUI() {
    const $ = (id) => document.getElementById(id);
    const s = this.settings;
    $('optRD').value = s.renderDistance; $('optRDVal').textContent = s.renderDistance;
    $('optFOV').value = s.fov; $('optFOVVal').textContent = s.fov;
    $('optSens').value = s.sens; $('optSensVal').textContent = s.sens;
    $('optInvX').checked = !!s.invX; $('optInvY').checked = !!s.invY;
    $('optShadow').value = s.shadows; $('optPost').value = s.post;
    $('optClouds').value = s.clouds;
    $('optFog').value = s.fog; $('optFogVal').textContent = s.fog + '%';
    $('optVol').value = s.volume; $('optVolVal').textContent = s.volume + '%';
    $('optPreset').value = s.preset;
  }

  wireMenus() {
    const $ = (id) => document.getElementById(id);
    const optChange = () => {
      this.applySettings({
        renderDistance: parseInt($('optRD').value),
        fov: parseInt($('optFOV').value),
        sens: parseInt($('optSens').value),
        invX: $('optInvX').checked,
        invY: $('optInvY').checked,
        shadows: $('optShadow').value,
        post: $('optPost').value,
        clouds: $('optClouds').value,
        fog: parseInt($('optFog').value),
        volume: parseInt($('optVol').value),
        preset: $('optPreset').value,
      });
      this.syncOptionsUI();
    };
    for (const id of ['optRD', 'optFOV', 'optSens', 'optInvX', 'optInvY', 'optShadow', 'optPost', 'optClouds', 'optFog', 'optVol', 'optPreset'])
      $(id).addEventListener('input', optChange);

    $('rdInput').addEventListener('input', () => $('rdVal').textContent = $('rdInput').value);
    let optionsReturn = 'titleScreen';
    $('btnPlay').onclick = () => { this.audio.resume(); this.ui.showScreen('#newWorldScreen'); };
    $('btnBackTitle').onclick = () => this.ui.showScreen('#titleScreen');
    $('btnOptions').onclick = () => { optionsReturn = '#titleScreen'; this.ui.showScreen('#optionsScreen'); };
    $('btnOptDone').onclick = () => this.ui.showScreen(optionsReturn);
    $('btnContinue').onclick = async () => {
      const sv = await loadWorld('world');
      if (sv) this.startWorld({ load: sv });
    };
    $('btnCreate').onclick = () => {
      const seedStr = $('seedInput').value.trim() || String((Math.random() * 1e9) | 0);
      const rd = parseInt($('rdInput').value);
      this.applyGraphicsPreset($('gfxPreset').value);
      this.startWorld({ seed: seedStr, mode: $('modeSel').value, renderDistance: rd });
    };
    $('btnResume').onclick = () => this.togglePause(false);
    $('btnOptionsPause').onclick = () => { optionsReturn = '#pauseScreen'; this.ui.showScreen('#optionsScreen'); };
    $('btnSaveNow').onclick = async () => { await this.save(); this.ui.toast('World saved'); };
    $('btnQuitTitle').onclick = async () => { await this.save(); location.reload(); };
    $('btnDeathQuit').onclick = async () => { await this.save(); location.reload(); };
    $('btnRespawn').onclick = () => this.respawn();
    // dev/QA helpers in pause screen
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = label; b.onclick = fn;
      $('btnQuitTitle').parentNode.insertBefore(b, $('btnQuitTitle'));
    };
    mkBtn('Time: Noon', () => { this.timeOfDay = 0.5; this.ui.toast('Time set to noon'); });
    mkBtn('Time: Midnight', () => { this.timeOfDay = 0.0; this.ui.toast('Time set to midnight'); });
    mkBtn('Weather: Cycle', () => {
      this.weather.state = this.weather.state === 'clear' ? 'rain' : 'clear';
      this.weather.timer = 90;
      this.ui.toast('Weather: ' + this.weather.state);
    });
  }
}
window.__GameClass = Game;

// ---------------- Part 2: world lifecycle + input ----------------
Object.assign(Game.prototype, {
  async startWorld(opts) {
    const load = opts.load;
    this.seedStr = load ? load.seed : (opts.seed || 'hermes');
    this.saveName = load ? (load.saveName || 'world') : 'world';
    const mode = load ? load.mode : opts.mode;
    const rd = load ? load.renderDistance : opts.renderDistance;

    this.ui.showScreen(null);
    document.getElementById('hud').classList.add('on');

    this.world = new World({
      scene: this.scene,
      seed: this.seedStr,
      materials: this.materials,
      renderDistance: rd || this.settings.renderDistance,
      edits: (load && load.edits) || {},
    });
    this.stations = Stations.fromJSON(load && load.stations, this.world);
    this.player = new Player(this.world, this.camera);
    this.player.creative = mode === 'creative';
    if (this.player.creative) { this.player.flying = true; this.player.health = 20; }
    this.mobs = new MobManager(this.scene, this.world);
    this.drops = new DropManager(this.scene);

    if (load && load.player) {
      const p = load.player;
      this.player.pos = { x: p.x, y: p.y, z: p.z };
      this.player.yaw = p.yaw; this.player.pitch = p.pitch;
      this.player.health = p.health; this.player.hunger = p.hunger;
      this.player.spawnPoint = p.spawnPoint || this.player.spawnPoint;
      this.timeOfDay = p.timeOfDay !== undefined ? p.timeOfDay : 0.3;
      this.xp = p.xp || 0; this.level = p.level || 0;
    }
    if (load && load.inventory) this.inventory = Inventory.fromJSON(load.inventory);
    if (load && load.dayLength) this.dayLength = load.dayLength;

    this.input = new Input(this.canvas, {
      onLockChange: (locked) => {
        if (!locked && this.state === 'playing' && !this.ui.openScreen) this.togglePause(true);
      },
      onLook: (dx, dy) => this.player.look(dx, dy, this.input.sens, this.input.invX, this.input.invY),
      onMouse: (btn, down) => this.onMouse(btn, down),
      onKey: (code, down) => this.onKey(code, down),
      onWheel: (dir) => {
        const inv = this.inventory;
        inv.hotbar = (inv.hotbar + dir + 9) % 9;
        this.ui.renderHotbar(inv);
      },
    });
    this.input.sens = this.settings.sens;
    this.input.invX = this.settings.invX;
    this.input.invY = this.settings.invY;

    // block highlight wireframe
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(hlGeo, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // spawn placement: find safe surface near origin
    if (!load || !load.player) await this.placeAtSpawn();

    this.grabControls();
    this.state = 'playing';
    this.audio.startAmbience();
    this.ui.toast(this.player.creative ? 'Creative mode — F toggles flight' : 'Survival — punch trees to begin!');
    this.ui.renderHotbar(this.inventory);
    this.checkLevel();
    this.loop();
  },

  async placeAtSpawn() {
    // wait until center chunk exists, then stand on its surface
    for (let i = 0; i < 240; i++) {
      this.world.update(0, 0);
      const y = this.world.surfaceY(8, 8);
      if (y > 0) {
        let sy = y;
        let guard = 0;
        while (sy > 1 && !(REG.BLOCKS[this.world.getBlock(8, sy, 8)] || {}).solid) sy--;
        while ((sy < 5 || this.world.getBlock(8, sy + 1, 8) !== 0 || this.world.getBlock(8, sy + 2, 8) !== 0) && guard++ < WH_LIMIT) sy++;
        this.player.pos = { x: 8.5, y: sy + 1.05, z: 8.5 };
        this.player.spawnPoint = { x: 8.5, y: sy + 1.05, z: 8.5 };
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    this.player.pos = { x: 8.5, y: 90, z: 8.5 };
  },

  async save() {
    if (!this.player) return;
    const payload = {
      version: 3,
      seed: this.seedStr,
      saveName: this.saveName,
      mode: this.player.creative ? 'creative' : 'survival',
      renderDistance: this.settings.renderDistance,
      dayLength: this.dayLength,
      timeOfDay: this.timeOfDay,
      edits: this.world.edits,
      player: {
        x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z,
        yaw: this.player.yaw, pitch: this.player.pitch,
        health: this.player.health, hunger: this.player.hunger,
        spawnPoint: this.player.spawnPoint,
        xp: this.xp, level: this.level,
      },
      inventory: this.inventory.toJSON(),
      stations: this.stations.toJSON(),
      savedAt: Date.now(),
    };
    try { await saveWorld(this.saveName, payload); this.lastSavedAt = Date.now(); }
    catch (e) { this.ui.toast('Save failed: ' + e.message); }
  },

  grabControls() { if (this.input && !this.ui.openScreen) this.input.requestLock(); },
  releaseControls() { if (this.input) this.input.releaseLock(); },

  togglePause(on) {
    if (this.state === 'dead') return;
    const pause = (on === undefined) ? (this.state === 'playing') : on;
    if (pause && this.state === 'playing') {
      this.state = 'paused';
      this.releaseControls();
      this.input && this.input.releaseAll();
      this.mouseLeft = this.mouseRight = false;
      this.ui.showScreen('#pauseScreen');
    } else if (!pause && this.state === 'paused') {
      this.state = 'playing';
      this.ui.showScreen(null);
      this.grabControls();
    }
  },

  onKey(code, down) {
    if (code === 'Escape' && down) {
      if (this.ui.openScreen) { this.ui.closeScreens(true); }
      else if (this.state === 'playing') this.togglePause(true);
      return;
    }
    if (this.state !== 'playing') return;
    const inv = this.inventory;
    if (down) {
      if (code.startsWith('Digit')) {
        const n = parseInt(code.slice(5));
        if (n >= 1 && n <= 9) { inv.hotbar = n - 1; this.ui.renderHotbar(inv); }
      } else if (code === 'KeyE') {
        if (this.ui.openScreen) this.ui.closeScreens(true);
        else this.ui.openInventory();
      } else if (code === 'KeyQ') {
        this.dropHeld();
      } else if (code === 'KeyF' && this.player.creative) {
        this.player.flying = !this.player.flying;
        this.ui.toast('Flight ' + (this.player.flying ? 'enabled' : 'disabled'));
      } else if (code === 'KeyN') {
        this.timeOfDay = (this.timeOfDay + 0.5) % 1;
        this.ui.toast('Time skipped');
      }
    }
  },

  onMouse(btn, down) {
    if (this.state !== 'playing') return;
    if (btn === 0) this.mouseLeft = down;
    if (btn === 2) { this.mouseRight = down; if (down) this.useItem(); }
  },
});
const WH_LIMIT = 120;

// ---------------- Part 3: interactions, survival, main loop ----------------
Object.assign(Game.prototype, {
  spawnDropAtPlayer(id, count) {
    if (this.drops) this.drops.spawn(id, count, this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z, { x: 0, y: 1, z: 0 });
  },

  dropHeld() {
    const s = this.inventory.held();
    if (!s) return;
    const f = this.player.flatForward();
    this.drops.spawn(s.id, 1, this.player.pos.x + f.x * 0.6, this.player.pos.y + 1.3, this.player.pos.z + f.z * 0.6, { x: f.x * 4, y: 2, z: f.z * 4 });
    this.inventory.consumeHeld();
    this.ui.renderHotbar(this.inventory);
  },

  updateInteraction(dt) {
    const p = this.player;
    p.target = p.raycast(5.5);
    if (this.highlight) {
      if (p.target) {
        this.highlight.visible = true;
        this.highlight.position.set(p.target.x + 0.5, p.target.y + 0.5, p.target.z + 0.5);
      } else this.highlight.visible = false;
    }
    if (this.mouseLeft && p.target && this.state === 'playing') {
      const t = p.target;
      if (!p.breaking || p.breaking.x !== t.x || p.breaking.y !== t.y || p.breaking.z !== t.z) {
        const def = REG.BLOCKS[t.id];
        const held = this.inventory.held();
        let speed = 1;
        if (held && REG.ITEMS[held.id] && REG.ITEMS[held.id].tool === def.tool) speed = REG.ITEMS[held.id].speed;
        if (p.creative) speed = 10;
        const total = Math.max(0.04, (def.hardness < 0 ? Infinity : def.hardness * 1.5 / speed));
        if (!isFinite(total)) { p.breaking = null; return; }
        p.breaking = { x: t.x, y: t.y, z: t.z, progress: 0, total };
      }
      const brk = p.breaking;
      brk.progress += dt;
      this._digTickT = (this._digTickT || 0) + dt;
      if (this._digTickT > 0.22) { this._digTickT = 0; this.audio.digTick(); }
      if (brk.progress >= brk.total) {
        this.breakBlock(brk.x, brk.y, brk.z);
        p.breaking = null;
      }
    } else p.breaking = null;
    if (this.mouseRight && p.placeCooldown <= 0 && !this.ui.openScreen) this.useItem();
    if (p.placeCooldown > 0) p.placeCooldown -= dt;
  },

  breakBlock(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    const def = REG.BLOCKS[id];
    if (!id || def.hardness < 0) return;
    this.world.setBlock(x, y, z, 0);
    this.audio.breakBlock(id);
    const avg = this.tileAvg[def.tex.all || def.tex.side || def.tex.top || 'stone'] || [0.5, 0.5, 0.5];
    this.particles.burstBlock(x + 0.5, y + 0.5, z + 0.5, avg);
    if (!this.player.creative) {
      const drops = def.drop === null ? [{ item: id, count: 1 }] : (def.drop || []);
      for (const d of drops) {
        if (d.chance !== undefined && Math.random() > d.chance) continue;
        const count = Array.isArray(d.count) ? d.count[0] + Math.floor(Math.random() * (d.count[1] - d.count[0] + 1)) : (d.count || 1);
        this.drops.spawn(d.item, count, x + 0.5, y + 0.4, z + 0.5);
      }
    }
    const k = x + ',' + y + ',' + z;
    if (id === B.CHEST) {
      const c = this.stations.getChest(x, y, z, false);
      if (c) for (const s of c) if (s) this.drops.spawn(s.id, s.count, x + 0.5, y + 0.5, z + 0.5);
      this.stations.chests.delete(k);
    }
    if (id === B.FURNACE || id === B.FURNACE_LIT) this.stations.furnaces.delete(k);
    const above = this.world.getBlock(x, y + 1, z);
    if (above && REG.BLOCKS[above].cross && !REG.BLOCKS[above].liquid) this.breakBlock(x, y + 1, z);
    if (id >= B.COAL_ORE && id <= B.REDSTONE_ORE) { this.xp += 3; this.checkLevel(); }
    // sapling growth tick chance
    if (above === B.SAPLING && Math.random() < 0.3) this.growTree(x, y + 1, z);
  },

  growTree(x, y, z) {
    const th = 4 + ((Math.random() * 2) | 0);
    for (let i = 0; i < th; i++) this.world.setBlock(x, y + i, z, B.LOG);
    for (let oy = -2; oy <= 1; oy++) {
      const rad = oy <= -1 ? 2 : 1;
      for (let ox = -rad; ox <= rad; ox++) for (let oz = -rad; oz <= rad; oz++) {
        if (Math.abs(ox) === rad && Math.abs(oz) === rad && r01() < 0.5) continue;
        const tx = x + ox, ty = y + th - 1 + oy, tz = z + oz;
        if (tx === x && oz === 0 && oy < 1 && ty < y + th) continue;
        if (this.world.getBlock(tx, ty, tz) === 0) this.world.setBlock(tx, ty, tz, B.LEAVES);
      }
    }
    this.world.setBlock(x, y + th, z, B.LEAVES);
    function r01() { return Math.random(); }
  },

  useItem() {
    const p = this.player;
    if (p.placeCooldown > 0 || this.ui.openScreen) return;
    p.placeCooldown = 0.22;
    const held = this.inventory.held();
    const t = p.target;
    if (t) {
      const tid = this.world.getBlock(t.x, t.y, t.z);
      const tdef = REG.BLOCKS[tid];
      if (tdef.station && !this.input.keys['ShiftLeft']) {
        if (tdef.station === 'crafting') { this.ui.openInventory(); return; }
        if (tdef.station === 'bed') { this.trySleep(t.x, t.y, t.z); return; }
        if (this.ui.openStation(tdef.station, t.x, t.y, t.z)) return;
      }
      // toggle levers in world
      if (tid === B.LEVER) { this.world.setBlock(t.x, t.y, t.z, B.LEVER_ON); this.stations.redstoneDirty = true; this.audio.click(); return; }
      if (tid === B.LEVER_ON) { this.world.setBlock(t.x, t.y, t.z, B.LEVER); this.stations.redstoneDirty = true; this.audio.click(); return; }
    }
    if (!held) return;
    const item = REG.ITEMS[held.id];
    if (!item) return;
    if (item.food) {
      if (p.hunger >= 20) return;
      p.hunger = Math.min(20, p.hunger + item.food.hunger);
      this.inventory.consumeHeld();
      this.audio.eat();
      this.ui.renderHotbar(this.inventory);
      return;
    }
    if (item.tool === 'hoe' && t) {
      const gid = this.world.getBlock(t.x, t.y, t.z);
      if ((gid === B.GRASS || gid === B.DIRT) && this.world.getBlock(t.x, t.y + 1, t.z) === 0) {
        this.world.setBlock(t.x, t.y, t.z, B.FARMLAND);
        this.inventory.damageHeld(1);
        this.audio.digTick();
        return;
      }
    }
    if (item.place === B.WHEAT0 && t) {
      if (this.world.getBlock(t.x, t.y, t.z) === B.FARMLAND && this.world.getBlock(t.x, t.y + 1, t.z) === 0) {
        this.world.setBlock(t.x, t.y + 1, t.z, B.WHEAT0);
        this.stations.scheduleGrowth(t.x, t.y + 1, t.z, 25 + Math.random() * 20);
        this.inventory.consumeHeld();
        this.ui.renderHotbar(this.inventory);
      }
      return;
    }
    if (item.place === B.REDSTONE_WIRE && t) {
      if (REG.BLOCKS[this.world.getBlock(t.x, t.y, t.z)].opaque && this.world.getBlock(t.x, t.y + 1, t.z) === 0) {
        this.world.setBlock(t.x, t.y + 1, t.z, B.REDSTONE_WIRE);
        this.stations.redstoneDirty = true;
        this.inventory.consumeHeld();
        this.ui.renderHotbar(this.inventory);
      }
      return;
    }
    if (item.block !== undefined && item.place === undefined && t) {
      const nx = t.x + t.face.x, ny = t.y + t.face.y, nz = t.z + t.face.z;
      const cur = this.world.getBlock(nx, ny, nz);
      const curDef = REG.BLOCKS[cur];
      const replaceable = cur === 0 || (curDef && curDef.replaceable);
      if (replaceable && p.canPlaceAt(nx, ny, nz)) {
        this.world.setBlock(nx, ny, nz, held.id);
        this.audio.place();
        if (!p.creative) { this.inventory.consumeHeld(); this.ui.renderHotbar(this.inventory); }
      }
    }
  },

  attackMob(mob) {
    const held = this.inventory.held();
    let dmg = 1;
    if (held && REG.ITEMS[held.id] && REG.ITEMS[held.id].dmg) dmg = REG.ITEMS[held.id].dmg;
    mob.damage(dmg, { x: this.player.flatForward().x, z: this.player.flatForward().z }, {
      onDeath: (m) => {
        for (const d of m.def.drops) {
          const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
          if (n > 0) this.drops.spawn(d.id, n, m.pos.x, m.pos.y + 0.5, m.pos.z);
        }
        this.xp += 2; this.checkLevel();
      },
    });
    this.audio.mobHurt();
    this.particles.burstBlock(mob.pos.x, mob.pos.y + 0.8, mob.pos.z, [0.75, 0.15, 0.15]);
    if (held && REG.ITEMS[held.id] && REG.ITEMS[held.id].tool) this.inventory.damageHeld(1);
    this.ui.renderHotbar(this.inventory);
  },

  checkLevel() {
    const need = 7 + this.level * 4;
    document.querySelector('#xpbar i').style.width = Math.min(100, (this.xp / need) * 100) + '%';
    document.getElementById('xplevel').textContent = this.level;
  },

  /** Sleep in a bed: sets respawn, skips night if it's night and no hostiles near. */
  trySleep(x, y, z) {
    const p = this.player;
    p.spawnPoint = { x: x + 0.5, y: y + 1.05, z: z + 0.5 };
    if (!this.isNight) { this.ui.toast('Respawn point set'); return; }
    // hostile proximity check (10 blocks)
    for (const m of this.mobs.mobs) {
      if (m.dead || !m.def.hostile) continue;
      const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
      if (d < 10) { this.ui.toast('You may not rest now; there are monsters nearby'); return; }
    }
    this.timeOfDay = 0.27; // morning
    this.ui.toast('You slept through the night — respawn point set');
  },

  damagePlayer(amount, cause) {
    const p = this.player;
    if (p.dead || p.invulnT > 0 || p.creative) return;
    p.health -= amount;
    p.invulnT = 0.5;
    this.audio.hurt();
    this.ui.flashDamage();
    this.ui.renderHotbar(this.inventory);
    if (p.health <= 0) {
      p.dead = true;
      this.state = 'dead';
      this.releaseControls();
      document.getElementById('deathCause').textContent = cause || 'You died';
      this.ui.showScreen('#deathScreen');
    }
  },

  respawn() {
    const p = this.player;
    p.health = 20; p.hunger = 20; p.dead = false;
    p.pos = { ...p.spawnPoint };
    p.vel = { x: 0, y: 0, z: 0 };
    p.fallStartY = null;
    this.state = 'playing';
    this.ui.showScreen(null);
    this.grabControls();
  },

  updateSurvival(dt) {
    const p = this.player;
    if (p.invulnT > 0) p.invulnT -= dt;
    if (p.creative || p.dead) return;
    // hunger drain
    const moving = Math.hypot(p.vel.x, p.vel.z) > 0.5;
    p.hunger -= dt * (moving ? 0.030 : 0.012) * (p.sprint ? 1.7 : 1);
    if (p.hunger <= 0) {
      p.hunger = 0;
      p.starveT = (p.starveT || 0) + dt;
      if (p.starveT > 3.5) { p.starveT = 0; this.damagePlayer(1, 'You starved to death'); }
    } else if (p.hunger > 17 && p.health < 20) {
      p.regenT = (p.regenT || 0) + dt;
      if (p.regenT > 3.2) { p.regenT = 0; p.health = Math.min(20, p.health + 1); }
    }
    // drowning
    if (p.headInWater) {
      p.air = (p.air === undefined ? 10 : p.air) - dt;
      const airEl = document.getElementById('airrow');
      airEl.style.display = 'flex';
      if (p.air <= 0) {
        p.air = 1;
        this.damagePlayer(2, 'You drowned');
      }
      const bubbles = Math.ceil(Math.max(0, p.air / 10 * 10));
      let html = '';
      for (let i = 0; i < bubbles; i++) html += '<div class="bub"></div>';
      airEl.innerHTML = html;
    } else if (p.air !== undefined && p.air < 10) {
      p.air = Math.min(10, p.air + dt * 4);
      if (p.air >= 10) document.getElementById('airrow').style.display = 'none';
    }
    // lava & cactus contact
    const feetId = this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z));
    if (feetId === B.LAVA) this.damagePlayer(4 * Math.max(1, Math.round(dt * 8)), 'You tried to swim in lava');
    // void
    if (p.pos.y < -12) this.damagePlayer(100, 'You fell out of the world');
  },

  envUpdate(dt) {
    // day cycle
    this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;
    const env = this.skyDome.update(this.timeOfDay, this.camera.position, this.elapsed);
    this.clouds.update(this.timeOfDay, this.camera.position, this.elapsed, { cloudBoost: this.weather.intensity * 0.35 });
    // weather needs player pos
    this.weather.update(dt, this.player, {
      snowBiome: false,
      onThunder: () => { this.audio.noiseBurst(0.7, 120, 0.4, 0.3, 'lowpass'); },
    });
    // materials uniforms
    const far = this.settings.renderDistance * 16;
    const fogCol = new THREE.Color(env.fogColor[0], env.fogColor[1], env.fogColor[2]);
    const lightning = this.weather.lightningEnv();
    if (lightning > 0) fogCol.lerp(new THREE.Color(1, 1, 1), lightning * 0.6);
    const under = !!this.player.headInWater;
    if (under) { fogCol.setRGB(0.09, 0.22, 0.42); }
    for (const k of ['solid', 'cutout', 'trans']) {
      const u = this.materials[k].uniforms;
      u.uDayLight.value = env.dayLight + lightning;
      u.uFogColor.value.copy(fogCol);
      u.uSunTint.value.setRGB(env.sunTint[0], env.sunTint[1], env.sunTint[2]);
      u.uNightBlue.value = env.nightBlue;
      u.uTime.value = this.elapsed;
      let fFar = far * (this.settings.fog / 100 * 0.5 + 0.5) * (this.weather.intensity > 0.3 ? 0.72 : 1);
      if (under) fFar = Math.min(fFar, 26); // dense blue murk
      u.uFogFar.value = fFar;
      u.uFogNear.value = under ? 2 : Math.min(fFar * 0.55, far * 0.55);
    }
    this.scene.fogColor = fogCol;
    this.isNight = this.timeOfDay < 0.24 || this.timeOfDay > 0.78;
    // underwater tint
    this.ui.setWaterOverlay(under);
    // post env
    this.postEnv = {
      exposure: 1.12,
      waterFx: under ? 1 : 0,
      time: this.elapsed,
      bloom: 0.5 + 0.25 * (1 - Math.min(1, Math.abs(env.dayLight - 0.5) * 2)),
      tintShadows: new THREE.Color().setRGB(
        0.92 + env.nightBlue * 0.05, 0.96, 1.06 + env.nightBlue * 0.08),
      tintHighs: new THREE.Color().setRGB(1.07, 1.02, 0.93),
    };
    // audio ambience
    this.audio.setRain(this.weather.intensity * (under ? 0.2 : 1));
    void dt;
  },

  loop: function () {
    requestAnimationFrame(() => this.loop());
    if (!this.lastT) this.lastT = performance.now();
    let dt = (performance.now() - this.lastT) / 1000;
    this.lastT = performance.now();
    if (dt > 0.1) dt = 0.1;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fpsShown = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }

    const playing = this.state === 'playing' || this.state === 'dead';
    if (playing) {
      this.elapsed += dt;
      if (this.state === 'playing' && !this.ui.openScreen) {
        this.player.update(dt, this.input, {
          speedMult: 1,
          onJump: () => {},
          onStep: () => {
            const under = this.world.getBlock(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y - 0.5), Math.floor(this.player.pos.z));
            this.audio.step(under);
          },
          onFallDamage: (n) => this.damagePlayer(n, 'You fell from a high place'),
        });
      }
      if (this.state === 'playing') this.updateInteraction(dt);
      this.world.update(this.player.pos.x, this.player.pos.z);
      this.envUpdate(dt);
      this.particles.update(dt);
      if (!this.player.creative) this.updateSurvival(dt);
      this.stations.tick(dt);
      this.mobs.update(dt, this.player, {
        isNight: this.isNight,
        dayLightFactor: Math.max(0.15, this.skyDome ? (1 - (this.envNight || 0)) : 1),
        peaceful: this.player.creative,
        onAttackPlayer: (dmg, mob) => {
          this.damagePlayer(dmg, 'Slain by a ' + mob.type);
        },
        onDeath: () => {},
        onBurnFx: (m) => this.particles.burstBlock(m.pos.x, m.pos.y + 1.2, m.pos.z, [1, 0.55, 0.15]),
      });
      this.drops.update(dt, this.world, this.player, {
        onCollect: (id, count) => {
          const left = this.inventory.add(id, count);
          if (left < count) { this.audio.tone(660, 0.05, 'sine', 0.05); this.ui.renderHotbar(this.inventory); }
          return left;
        },
      });
      // attack mobs with left click
      if (this.mouseLeft && this.player.target) {
        const m = this.mobs.pick(this.player, 4.2);
        if (m && (!this._swingCd || this.elapsed - this._swingCd > 0.42)) {
          this._swingCd = this.elapsed;
          this.attackMob(m);
        }
      }
      // autosave every 20s
      this.autosaveT += dt;
      if (this.autosaveT > 20) { this.autosaveT = 0; this.save(); }
    }

    // render
    this.post.render(this.scene, this.camera, this.postEnv);
    // HUD text
    if (this.frameCount % 12 === 0) {
      const col = this.world.chunks.size;
      const st = (this.post && this.post.sceneStats) ? this.post.sceneStats : { calls: 0, tris: 0 };
      const draws = st.calls;
      const tris = st.tris;
      const bio = this.currentBiomeName();
      const dayStr = 'day ' + (Math.floor(this.timeOfDay * 24)).toString().padStart(2, '0') + ':00' + (this.isNight ? ' · night' : '');
      this.ui.hudInfo(this.fpsShown, col, draws, tris, bio, this.player.pos, dayStr);
      this.ui.renderHotbar(this.inventory);
      this.checkLevel();
    }
    this.frameCount = (this.frameCount || 0) + 1;
  },

  currentBiomeName() {
    try {
      const genMod = window.__req('./worldgen.js');
      const info = genMod.makeGen(this.seedStr).columnInfo(Math.floor(this.player.pos.x), Math.floor(this.player.pos.z));
      return ['plains', 'forest', 'desert', 'windswept hills', 'snowy peaks', 'taiga', 'beach'][info.biome] || '';
    } catch (e) { return ''; }
  },

  titleLoop: function () {
    if (this.state !== 'title') return;
    requestAnimationFrame(() => this.titleLoop());
    this.timeOfDay = (this.timeOfDay + 0.0004) % 1;
    const env = this.skyDome.update(this.timeOfDay, this.camera.position, performance.now() / 1000);
    this.clouds.mesh.visible = this.settings.clouds === 'on';
    this.clouds.update(this.timeOfDay, this.camera.position, performance.now() / 1000, null);
    this.renderer.setClearColor(new THREE.Color(env.fogColor[0], env.fogColor[1], env.fogColor[2]));
    this.renderer.render(this.scene, this.camera);
  },

  bootAndRun: async function () {
    await this.boot();
  },
});

// boot
window.game = null;
addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
  window.game.bootAndRun();
});
