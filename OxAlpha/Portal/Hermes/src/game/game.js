// LIMINAL DYNAMICS — game core: state machine, input, player systems
import * as THREE from 'three';
import { PhysicsWorld } from '../engine/physics.js';
import { PortalRenderer } from '../engine/portal.js';
import { Player } from '../engine/player.js';
import { SoundKit } from '../engine/audio.js';
import { Composer } from '../engine/fx.js';
import { makeTextures } from './textures.js';
import { Chamber } from './builder.js';
import { CHAMBERS, PROGRESSION } from './chambers.js';
import { attachTestAPI } from './test-api.js';
import { raycastWorld, portalXform } from '../engine/physics.js';
import { makePortalInnerMaterial } from '../engine/portal.js';

export class Game {
  constructor() {
    this.canvasHost = document.getElementById('app');
    this.state = 'boot';
    this.settings = {
      quality: 'ultra', scale: 1.0, fov: 80, sens: 1.0,
      invertX: false, invertY: false, audio: true,
    };
    this.keys = {};
    this.input = { w: false, a: false, s: false, d: false, sprint: false, jumpQueued: false };
    this.held = null;            // WeightedCube being carried
    this.throwCharge = 0;
    this.chamberIndex = 0;
    this.deaths = 0;
    this.startTime = 0;
    this.perfSamples = [];
    this._lastT = performance.now();
  }

  // =====================================================================
  async init() {
    const setLoad = (t, p) => {
      const lt = document.getElementById('load-text');
      const lb = document.getElementById('load-bar');
      if (lt) lt.textContent = t;
      if (lb) lb.style.width = `${p}%`;
    };
    setLoad('CREATING RENDERER', 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.scale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // custom tonemap in composer
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvasHost.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.FogExp2(0x0a1018, 0.012);

    setLoad('BENDING SPACE', 30);
    this.world = new PhysicsWorld();
    this.portalFX = new PortalRenderer(this.renderer, this.scene, this.world, 4);
    this.portalFX.init();
    for (const id of ['blue', 'amber']) {
      this.portalFX.portals[id].ensureMesh(this.scene, null, (portal) =>
        makePortalInnerMaterial(portal));
    }
    this.player = new Player(this.world);
    this.player.events.onPortal = () => this.sfx?.teleport();

    setLoad('CALIBRATING OPTICS', 55);
    this.composer = new Composer(this.renderer);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 300);
    this.camera.rotation.order = 'YXZ';

    setLoad('GROWING FACILITY', 75);
    this.textures = makeTextures();
    this.sfx = new SoundKit(this.settings.audio);
    this.buildLightingRig();

    setLoad('WAKING V.E.G.A', 90);
    this.wireUI();
    this.wireInput();
    attachTestAPI(this);
    this.loadChamber(0, true);

    window.addEventListener('resize', () => this.onResize());
    setLoad('READY', 100);

    this.state = 'menu';
    this._menuShowT = setTimeout(() => {
      this._menuShowT = null;
      const el = document.getElementById('loading');
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 700); }
      document.getElementById('menu-screen').classList.remove('hidden');
    }, 350);

    requestAnimationFrame((t) => this.frame(t));
    return this;
  }

  // =====================================================================
  buildLightingRig() {
    this.rig = {};
    this.rig.hemi = new THREE.HemisphereLight(0x8fb5dd, 0x1a2029, 0.85);
    this.scene.add(this.rig.hemi);
    this.rig.key = new THREE.DirectionalLight(0xcfe6ff, 1.1);
    this.rig.key.position.set(12, 24, 10);
    this.rig.key.castShadow = true;
    this.rig.key.shadow.mapSize.set(2048, 2048);
    this.rig.key.shadow.camera.near = 1;
    this.rig.key.shadow.camera.far = 90;
    const S = 26;
    Object.assign(this.rig.key.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
    this.rig.key.shadow.bias = -0.0004;
    this.scene.add(this.rig.key, this.rig.key.target);
    this.rig.fill = new THREE.DirectionalLight(0x3a5f8f, 0.35);
    this.rig.fill.position.set(-10, 14, -12);
    this.scene.add(this.rig.fill);
  }

  fitLightsToChamber(ch) {
    // move key light + shadow frustum over the active chamber bounds
    const b = ch.bounds || { x: 0, z: 0, w: 20, d: 20, h: 9 };
    const cx = b.x ?? 0, cz = b.z ?? 0;
    this.rig.key.position.set(cx + 14, Math.max(b.h ?? 9, 10) + 12, cz + 11);
    this.rig.key.target.position.set(cx, 0, cz);
    const S = Math.max(b.w ?? 20, b.d ?? 20) * 0.75;
    const cam = this.rig.key.shadow.camera;
    cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S;
    cam.near = 1; cam.far = 120;
    cam.updateProjectionMatrix();
  }

  // =====================================================================
  loadChamber(i, instant = false) {
    this.chamberIndex = i;
    if (this.chamber) { this.chamber.dispose(); }
    // clear portals on chamber change
    for (const id of ['blue', 'amber']) this.world.portals[id]?.deactivate?.();
    this.held = null;

    const def = CHAMBERS[i];
    const ch = new Chamber(def);
    this.chamber = ch;
    ch.attach(this.world, this.scene, this);
    // remove any solids orphaned by the previous chamber (built after new chamber
    // so the new chamber's own solids are already registered and kept)
    Chamber.purgeUnowned(this.world, ch);
    ch.onSolved = () => this.onChamberSolved();
    this.fitLightsToChamber({ x: 0, z: (def.boundsZ ?? 0), w: def.boundsW ?? 20, d: def.boundsD ?? 20, h: def.boundsH ?? 9 });

    // spawn player
    this.player.spawnAt(new THREE.Vector3(...def.spawn), def.yaw || 0);
    this.player.respawn(true);

    // HUD
    document.getElementById('chamber-label').childNodes[0].textContent = `CHAMBER ${String(i + 1).padStart(2, '0')}`;
    document.getElementById('chamber-sub').textContent = def.sub || '';
    this.setHint(def.hint || '');
    if (!instant) this.showToast(`CHAMBER ${String(i + 1).padStart(2, '0')} — ${def.name}`);

    // story beats
    const beats = PROGRESSION[def.id] || [];
    this.beatQueue = beats.slice();
    this.beatTimer = 1.2;
  }

  restartChamber() {
    this.clearPortals();
    this.chamber.reset();
    this.player.respawn(true);
    this.showToast('CHAMBER RESET — THE ANNEX PRETENDS NOT TO JUDGE');
  }

  clearPortals() {
    for (const id of ['blue', 'amber']) {
      this.world.portals[id].deactivate();
    }
  }

  clearPlayerPortals(dropsPortals = true) {
    if (!dropsPortals) return;
    this.clearPortals();
    this.sfx.fizzler();
    this.showToast('RESISTANCE SURGE — RIFTS COLLAPSED');
  }

  onCubeFizzled(cube) {
    this.sfx.fizzler();
    if (this.held === cube) this.dropHeld(false);
    this.showToast('MASS CELL RELOCATED BY THE RESONANCE SIEVE');
  }

  killPlayer(cause = 'impact') {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    this.deaths++;
    this.sfx.thud(1);
    const dmg = document.getElementById('damage');
    dmg.style.opacity = '1';
    setTimeout(() => {
      dmg.style.opacity = '0';
      p.respawn();
      this.showToast(cause === 'acid' ? 'ACID: 1 — CANDIDATE: 0 · TRY AGAIN'
        : cause === 'coolant' ? 'COOLANT IS FOR MACHINES · TRY AGAIN' : 'IMPACT DETECTED · TRY AGAIN');
    }, 550);
  }

  onChamberSolved() {
    this.sfx.chime();
    this.showToast(`EXIT AUTHORIZED — ${this.chamber.def.name} COMPLETE`);
    const next = this.chamberIndex + 1;
    if (next >= CHAMBERS.length) {
      this.finale();
    } else {
      setTimeout(() => this.loadChamber(next), 1400);
    }
  }

  finale() {
    this.state = 'credits';
    document.exitPointerLock?.();
    const scr = document.getElementById('pause-screen');
    scr.querySelector('h1').textContent = 'ANNEX COMPLETE';
    scr.querySelector('h2').textContent = 'CANDIDATE RELEASED';
    document.getElementById('btn-resume').textContent = 'REPLAY FROM FIRST LIGHT';
    document.getElementById('btn-resume').onclick = () => location.reload();
    document.getElementById('btn-restart-chamber').classList.add('hidden');
    scr.classList.remove('hidden');
    const beats = PROGRESSION.finale || [];
    let i = 0;
    const iv = setInterval(() => {
      if (i >= beats.length) { clearInterval(iv); return; }
      this.subtitle(beats[i][0], beats[i][1]);
      i++;
    }, 4200);
  }

  // =====================================================================
  // INPUT
  wireInput() {
    const dom = this.renderer.domElement;
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys[k] = true;
      if (this.state !== 'playing') {
        if (k === 'Escape' && this.state === 'paused') this.resume();
        return;
      }
      if (k === 'KeyW') this.input.w = true;
      if (k === 'KeyA') this.input.a = true;
      if (k === 'KeyS') this.input.s = true;
      if (k === 'KeyD') this.input.d = true;
      if (k === 'Space') { this.input.jumpQueued = true; e.preventDefault(); }
      if (k === 'ShiftLeft') this.input.sprint = true;
      if (k === 'KeyE') this.interact();
      if (k === 'KeyR') this.restartChamber();
      if (k === 'Escape') this.pause();
    });
    document.addEventListener('keyup', (e) => {
      const k = e.code;
      this.keys[k] = false;
      if (k === 'KeyW') this.input.w = false;
      if (k === 'KeyA') this.input.a = false;
      if (k === 'KeyS') this.input.s = false;
      if (k === 'KeyD') this.input.d = false;
      if (k === 'ShiftLeft') this.input.sprint = false;
    });

    dom.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      e.preventDefault();
      if (e.button === 0) this.shootPortal('blue');
      if (e.button === 2) this.shootPortal('amber');
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || document.pointerLockElement !== dom) return;
      this.player.look(e.movementX, e.movementY);
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== dom && this.state === 'playing') {
        this.pause(true);
      }
    });
    // recover after focus loss
    window.addEventListener('blur', () => {
      this.input.w = this.input.a = this.input.s = this.input.d = false;
      this.input.sprint = false;
      if (this.state === 'playing') this.pause(true);
    });
    // player look settings
    this.player.invertX = this.settings.invertX;
    this.player.invertY = this.settings.invertY;
    this.player.lookScale = this.settings.sens;
  }

  shootPortal(color) {
    const eye = this.player.eyePos();
    const dir = this.camDir();
    const hit = raycastWorld(this.world, eye, dir, 60);
    if (!hit || !hit.solid.portalable) {
      this.sfx.denied();
      return;
    }
    const n = hit.normal.clone().normalize();
    // reject near-horizontal surfaces for placement simplicity? allow floors/ceilings/walls:
    const p = this.portalFX.portals[color];
    const other = this.portalFX.portals[color === 'blue' ? 'amber' : 'blue'];
    const upHint = Math.abs(n.y) > 0.9
      ? new THREE.Vector3(0, 0, -1).multiplyScalar(n.y > 0 ? 1 : -1)
      : new THREE.Vector3(0, 1, 0);
    // avoid overlapping the other portal
    if (other.active && other.host === hit.solid &&
        hit.point.distanceTo(other.pos) < 1.9) {
      this.sfx.denied();
      return;
    }
    p.place(hit.point, n, hit.solid, upHint);
    this.syncPortalSolids();
    this.sfx.portalShoot(color);
    this.sfx.portalOpen(color);
    // crosshair feedback
    const cr = document.getElementById('crosshair');
    cr.classList.remove('blue', 'orange');
    void cr.offsetWidth;
    cr.classList.add(color === 'blue' ? 'blue' : 'orange');
    setTimeout(() => cr.classList.remove('blue', 'orange'), 240);
  }

  syncPortalSolids() {
    for (const id of ['blue', 'amber']) {
      const p = this.world.portals[id];
      if (!p.active) continue;
      // find host solid and tag it so traversal can exclude it
      const host = p.host;
      if (!host) continue;
      // remove old marker
      if (p._solidMarker) { p._solidMarker.host = null; }
      host.host = id;
      p._solidMarker = host;
      // store half extents for zone checks (fixed size)
      host.prx = 0.62; host.pry = 1.05;
    }
  }

  camDir(out = new THREE.Vector3()) {
    // forward from yaw/pitch
    const cp = Math.cos(this.player.pitch);
    return out.set(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp).normalize();
  }

  // ---- interact: pick up / drop cubes ----
  interact() {
    if (this.held) { this.dropHeld(); return; }
    const eye = this.player.eyePos();
    const dir = this.camDir();
    let best = null, bestDist = 3.0;
    for (const c of this.chamber.cubes) {
      const to = c.body.pos.clone().sub(eye);
      const along = to.dot(dir);
      if (along < 0 || along > bestDist) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 0.75) { best = c; bestDist = along; }
    }
    if (best) {
      this.held = best;
      best.body.held = true;
      best.body.vel.set(0, 0, 0);
      this.sfx.pickup();
      document.getElementById('held').style.display = 'block';
    }
  }

  dropHeld(throwIt = false) {
    const c = this.held;
    if (!c) return;
    c.body.held = false;
    if (throwIt) {
      c.body.vel.copy(this.camDir().multiplyScalar(9)).addScaledVector(this.player.vel, 0.5);
    }
    this.held = null;
    this.sfx.drop();
    document.getElementById('held').style.display = 'none';
  }

  updateHeld(dt) {
    const c = this.held;
    if (!c) return;
    const eye = this.player.eyePos();
    const target = eye.clone().addScaledVector(this.camDir(), 1.7);
    target.y -= 0.25;
    // spring toward hold point
    const k = Math.min(1, dt * 14);
    const before = c.body.pos.clone();
    c.body.pos.lerp(target, k);
    c.body.vel.copy(c.body.pos.clone().sub(before).divideScalar(Math.max(dt, 1e-4)));
    // fizzler check happens in cube update; also drop if too far (stuck behind wall)
    if (c.body.pos.distanceTo(eye) > 3.4) this.dropHeld(false);
  }

  // =====================================================================
  pause(silent = false) {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.exitPointerLock?.();
    document.getElementById('pause-screen').classList.remove('hidden');
    if (!silent) this.sfx?.denied?.();
  }
  resume() {
    if (this.state !== 'paused') return;
    document.getElementById('pause-screen').classList.add('hidden');
    this.state = 'playing';
    this.renderer.domElement.requestPointerLock?.();
  }
  startGame() {
    this.sfx.ensure(); this.sfx.resume();
    if (this._menuShowT) { clearTimeout(this._menuShowT); this._menuShowT = null; }
    const loading = document.getElementById('loading');
    if (loading) { loading.style.opacity = '0'; setTimeout(() => loading.remove(), 700); }
    document.getElementById('menu-screen').classList.add('hidden');
    this.state = 'playing';
    this.startTime = performance.now();
    this.renderer.domElement.requestPointerLock?.();
    this.subtitle('V.E.G.A', PROGRESSION.ch00?.[0]?.[1] || 'Welcome to the Annex.');
  }

  // =====================================================================
  // HUD helpers
  subtitle(who, text) {
    const el = document.getElementById('subtitle');
    el.innerHTML = `<span class="who">— ${who} —</span>${text}`;
    el.classList.add('show');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => el.classList.remove('show'), 6000);
  }
  showToast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.style.opacity = '0', 2600);
  }
  setHint(html) { document.getElementById('hint').innerHTML = html; }
}
