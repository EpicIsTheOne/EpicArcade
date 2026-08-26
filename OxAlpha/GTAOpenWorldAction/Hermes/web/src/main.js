// CHROME HARBOR — main: boot, system wiring, menus, save/load, game loop.
import * as THREE from 'three';
import { Input } from './core/input.js';
import {
  loadSettings, getSettings, saveSettings, presetOf, PRESETS,
  loadSave, writeSave, clearSave, applyFpsCounter,
} from './core/settings.js';
import { Emitter, ColliderGrid, clamp, el } from './core/util.js';
import { buildCityPlan } from './world/layout.js';
import { buildCity } from './world/build_city.js';
import { SkySystem, makeRain, WeatherSystem } from './gfx/sky.js';
import { createPostFX } from './gfx/postfx.js';
import { Player } from './entities/player.js';
import { vehicleCollisionPass } from './entities/vehicle.js';
import { PedManager } from './entities/npc.js';
import { TrafficManager } from './entities/traffic.js';
import { Police } from './systems/police.js';
import { WeaponsSys, WEAPONS } from './systems/weapons.js';
import { ParticleSystem } from './systems/particles.js';
import { HUD } from './ui/hud.js';
import { AudioSys } from './audio/audio.js';
import { MissionManager } from './gameplay/missions.js';
import { Pickups, GunStore } from './gameplay/pickups.js';

const canvas = el('game');
const raf = () => new Promise(res => requestAnimationFrame(res));

// surface runtime errors for QA harnesses
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => window.__errors.push('rej: ' + (e.reason?.message || e.reason)));

boot().catch(err => {
  console.error(err);
  const msg = el('load-msg');
  if (msg) msg.textContent = 'Boot failed: ' + (err.message || err);
});

async function boot() {
  // ---------------- settings & renderer ----------------
  const settings = loadSettings();
  let preset = presetOf(settings);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 2400);
  camera.layers.enable(2); // sky dome + clouds live here

  // ---------------- shared ctx ----------------
  const ctx = {
    canvas, renderer, scene, camera,
    settings, get preset() { return preset; },
    events: new Emitter(),
    colliders: new ColliderGrid(32),
    plan: null, city: null,
    vehicles: [],
    interactables: [],
    save: loadSave() || null,
    audio: null, hud: null, player: null, menus: null,
    sky: null, weather: null,
    snapWalkable: (x, z, o) => snapWalkable(ctx, x, z, o),
    camShake(a) { this.player?.camShake(a); },
  };

  const setLoad = (pct, msg) => {
    el('load-fill').style.width = pct + '%';
    if (msg) el('load-msg').textContent = msg;
  };

  setLoad(8, 'Laying out Port Vela…');
  await raf();
  ctx.plan = buildCityPlan(20260825);

  setLoad(22, 'Raising the skyline…');
  await raf();
  ctx.city = buildCity(ctx);

  // snap landmark anchors out of any building interiors (blocks are densely filled)
  const LM = ctx.plan.landmarks;
  for (const f of Object.values(LM.fixers)) Object.assign(f, snapWalkable(ctx, f.x, f.z));
  Object.assign(LM.safehouse, snapWalkable(ctx, LM.safehouse.x, LM.safehouse.z));
  Object.assign(LM.hospital.spawn, snapWalkable(ctx, LM.hospital.spawn.x, LM.hospital.spawn.z));
  Object.assign(LM.policeHQ.spawn, snapWalkable(ctx, LM.policeHQ.spawn.x, LM.policeHQ.spawn.z));

  setLoad(48, 'Waking the sky…');
  await raf();
  ctx.sky = new SkySystem(ctx);
  const rain = makeRain(ctx);
  ctx.weather = new WeatherSystem(ctx, rain);

  setLoad(58, 'Tuning the radio…');
  await raf();
  ctx.audio = new AudioSys(ctx);
  ctx.hud = new HUD(ctx);
  ctx.weapons = new WeaponsSys(ctx);
  ctx.particles = new ParticleSystem(ctx);

  setLoad(68, 'Filling the streets…');
  await raf();
  ctx.traffic = new TrafficManager(ctx);
  ctx.npcs = new PedManager(ctx);
  ctx.police = new Police(ctx);
  ctx.pickups = new Pickups(ctx);
  // two gun stores on sidewalks near main drags
  const gsA = snapWalkable(ctx, -60, 52), gsB = snapWalkable(ctx, 400, 148);
  ctx.gunStores = [
    new GunStore(ctx, gsA.x, gsA.z, 'IRON SIGHTS — Spire'),
    new GunStore(ctx, gsB.x, gsB.z, 'IRON SIGHTS — Shores'),
  ];

  setLoad(80, 'Hiring help…');
  await raf();
  const spawn = snapWalkable(ctx, 68, 24);
  console.log('[boot] spawn', JSON.stringify(spawn)); // QA
  ctx.player = new Player(ctx, spawn.x, spawn.z);
  ctx.menus = new Menus(ctx);
  ctx.missions = new MissionManager(ctx);
  ctx.saveGame = saveGame;

  applyFpsCounter(settings.showFps);

  // ---------------- restore or fresh start ----------------
  if (ctx.save) restoreGame(ctx, ctx.save);
  else {
    LM.safehouse.restSpot = { x: LM.safehouse.x + 2, z: LM.safehouse.z + 13 };
    ctx.save = { v: 1, money: ctx.player.money, weapons: {}, ammoPool: {}, done: [], x: spawn.x, z: spawn.z, hours: ctx.sky.hours, stats: {} };
  }

  setLoad(92, 'One warm-up lap…');
  await raf();
  ctx.sky.update(0.016, ctx.player.pos);
  ctx.weather.force('clear');
  renderer.compile(scene, camera); // avoid first-frame shader stall
  setLoad(100, 'Ready.');
  await raf();

  // ---------------- input & global keys ----------------
  let postfx = null;
  const input = new Input(canvas);
  ctx.input = input;
  input.onLockLost = () => { if (ctx.menus.state === 'playing') ctx.menus.pause(); };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { e.preventDefault(); ctx.menus.escape(); }
    else if ((e.code === 'KeyM') && ctx.menus.state === 'playing') ctx.hud.toggleBigMap();
    else if ((e.code === 'KeyH') && (ctx.menus.state === 'playing' || ctx.menus.state === 'paused')) ctx.hud.toggleHelp();
    else if (e.code === 'KeyP' && ctx.menus.state === 'playing') ctx.menus.pause();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    postfx.setSize(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.audio?.suspend();
    else if (ctx.menus.state === 'playing') ctx.audio?.resume();
  });

  // gameplay events that need central handling
  ctx.events.on('playerEnteredVehicle', ({ vehicle }) => {
    ctx.player.lastVehicle = vehicle;
    if (vehicle.typeName === 'taxi' && !ctx.missions.taxiState) ctx.missions.tryStartTaxi();
    ctx.hud.updateWeapon(ctx.player);
  });
  ctx.events.on('playerExitedVehicle', ({ vehicle }) => {
    ctx.player.lastVehicle = vehicle;
    ctx.audio?.engine(false, 0, 0);
  });
  ctx.save.stats = ctx.save.stats || {};

  // ---------------- menus first, then loop ----------------
  el('loading').classList.add('done');
  ctx.menus.showMain();
  window.__game = ctx; // QA hook

  let last = performance.now(), autosaveT = 45;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const st = ctx.menus.state;
    if (st === 'playing' || st === 'dead') {
      simulate(dt);
      render(dt);
    } else {
      // frozen world behind menus; keep the frame alive for resize/grade
      render(0);
    }
    input.endFrame();
  }

  postfx = createPostFX(ctx);
  ctx.rebuildPostFX = () => { postfx.setSize(1, 1); postfx = createPostFX(ctx); };
  ctx.applyGraphics = applyGraphics;
  requestAnimationFrame(frame);

  // ---------------- simulation ----------------
  function simulate(dt) {
    const p = ctx.player;

    p.update(dt, input);

    // all vehicles (traffic, parked, police, mission) share one physics pass
    const night = ctx.sky.night > 0.5;
    for (let i = ctx.vehicles.length - 1; i >= 0; i--) {
      const v = ctx.vehicles[i];
      if (!v.driver && !v.isPolice && v.ai?.mode !== 'race' && v.parkBrake && Math.abs(v.forwardSpeed) < 0.05 && v.group.position.distanceToSquared(camera.position) > 240 * 240) continue; // sleep distant parked cars
      if (v.lightsOn !== night && !v.destroyed) v.setLights(night);
      v.update(dt);
    }
    vehicleCollisions();

    ctx.npcs.update(dt, p);
    ctx.police.update(dt, p);
    ctx.traffic.update(dt, p);
    ctx.missions.update(dt, p);
    ctx.pickups.update(dt, performance.now() / 1000, p);
    ctx.particles.update(dt);

    ctx.sky.update(dt, p.pos);
    ctx.weather.update(dt, camera.position, p.pos);

    continuousAudio(dt);

    // crosshair while aiming
    ctx.hud.setCrosshair(p.aiming && !p.vehicle && !p.dead);
    ctx.hud.update(dt);

    autosaveT -= dt;
    if (autosaveT <= 0) { autosaveT = 45; saveGame(true); }
  }

  function vehicleCollisions() {
    vehicleCollisionPass(ctx);
  }

  function continuousAudio(dt) {
    void dt;
    const a = ctx.audio, p = ctx.player;
    if (!a) return;
    if (p.vehicle && !p.vehicle.destroyed) {
      const v = p.vehicle;
      const speed01 = clamp(Math.abs(v.forwardSpeed) / v.spec.top, 0, 1);
      const rpm01 = 0.18 + ((speed01 * 2.6) % 1) * 0.55 + speed01 * 0.3;
      a.engine(true, clamp(rpm01, 0.12, 1.15), Math.abs(v.input.throttle), v.typeName);
      a.screech(v.screechAmt * clamp(Math.abs(v.forwardSpeed) / 9, 0, 1));
      a.wind(speed01);
    } else {
      a.engine(false, 0, 0);
      a.screech(0);
      a.wind(p.rig.st.speed01 > 0.9 ? 0.25 : 0.05, true);
    }
    a.rainLevel(ctx.weather.rainI);
    const stars = ctx.police.stars;
    a.setMusic(stars >= 3 ? 2 : (stars > 0 || (p.vehicle && Math.abs(p.vehicle.forwardSpeed) > 16)) ? 1 : 0);
    a.musicTick();
  }

  function render(dt) {
    postfx.render(dt, { damageFx: ctx.player.damageFx });
  }

  // ---------------- graphics setting application ----------------
  function applyGraphics() {
    preset = presetOf(settings);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    renderer.shadowMap.enabled = preset.shadows;
    ctx.sky.fogBase = preset.fogFar;
    const sun = ctx.sky.sun;
    sun.shadow.mapSize.set(preset.shadowRes, preset.shadowRes);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    ctx.rebuildPostFX();
    saveSettings();
  }

  // ---------------- persistence ----------------
  function saveGame(silent) {
    const p = ctx.player;
    const weapons = {};
    for (const [k, inv] of Object.entries(p.weapons)) if (k !== 'fist') weapons[k] = inv.ammo;
    const data = {
      v: 1,
      money: p.money,
      health: Math.round(p.health),
      weapons, ammoPool: p.ammoPool || {},
      current: p.currentWeapon,
      done: Object.keys(ctx.missions.done),
      x: Math.round(p.pos.x * 10) / 10, z: Math.round(p.pos.z * 10) / 10,
      hours: Math.round(ctx.sky.hours * 100) / 100,
      stats: ctx.save.stats || {},
    };
    writeSave(data);
    ctx.save = data;
    if (!silent) ctx.hud.toastPrompt('Game saved');
  }
}

// find the nearest point not inside static geometry; prefers sidewalk/road
export function snapWalkable(ctx, x, z, opts = {}) {
  const plan = ctx.plan, B = plan.bounds;
  const q = ctx._snapQ || (ctx._snapQ = []);
  // colliders.query returns coarse cell candidates — do the precise AABB test here
  const free = (px, pz, r) => {
    ctx.colliders.query(px, pz, r, q);
    for (const b of q) if (px > b.x0 - r && px < b.x1 + r && pz > b.z0 - r && pz < b.z1 + r) return false;
    return true;
  };
  if (free(x, z, 0.9)) return { x, z };
  let best = null;
  for (let r = 4; r <= 72; r += 4) {
    const steps = Math.max(10, r);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = clamp(x + Math.cos(a) * r, B.x0 + 6, B.x1 - 6);
      const pz = clamp(z + Math.sin(a) * r, B.z0 + 6, B.z1 - 30);
      if (!free(px, pz, 1.0)) continue;
      const road = !!plan.roadAt(px, pz, 0.5);
      const walk = plan.onSidewalk(px, pz);
      const score = (opts.veh ? (road ? 0 : walk ? 1 : 2) : (walk || road ? 0 : 1)) * 10 + r * 0.05;
      if (!best || score < best.score) best = { x: px, z: pz, score };
    }
    if (best && best.score <= 0.5) break;
    if (best && r >= 28) break; // close enough; don't relocate landmarks across town
  }
  return best ? { x: best.x, z: best.z } : { x, z };
}

function restoreGame(ctx, s) {
  const p = ctx.player;
  try {
    p.money = s.money ?? 350;
    ctx.hud.moneyShown = p.money;
    p.health = clamp(s.health ?? 100, 20, 100);
    p.ammoPool = s.ammoPool || {};
    for (const [id, ammo] of Object.entries(s.weapons || {})) {
      if (WEAPONS[id]) p.giveWeapon(id, ammo | 0);
    }
    if (s.current && p.weapons[s.current]) p.selectWeapon(s.current);
    for (const id of s.done || []) ctx.missions.done[id] = true;
    if (typeof s.hours === 'number') ctx.sky.setTimeOfDay(s.hours);
    if (typeof s.x === 'number') {
      const spot = snapWalkable(ctx, s.x, s.z);
      p.pos.set(spot.x, 0, spot.z);
    }
    p.rig.group.position.copy(p.pos);
    ctx.save.stats = s.stats || {};
  } catch (e) { console.warn('save restore partial:', e); }
}

// ======================================================================
// MENUS — main menu, pause, wasted/busted, shop, settings
// ======================================================================
class Menus {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = el('menu-root');
    this.state = 'boot';     // boot | menu | playing | paused | dead | shop
    this._returnTo = 'menu'; // where settings/shop closes back to
  }

  get blocking() { return this.state !== 'playing'; }

  clear() { this.root.innerHTML = ''; }

  // ---------- main menu ----------
  showMain() {
    this.state = 'menu';
    this.clear();
    this.ctx.hud.hide();
    this.ctx.input?.preventLock(true);
    this.ctx.input?.releaseLock?.();
    this.ctx.input && (this.ctx.input.enabled = false);

    const hasSave = !!(loadSave());
    const scr = div('screen dim');
    scr.innerHTML = `
      <div class="menu-panel">
        <div class="game-logo">CHROME<em>HARBOR</em></div>
        <div class="tagline">Port Vela · open world action</div>
        <div class="menu-list"></div>
        <div class="menu-note">WASD move · Mouse camera · E interact · M map · H controls</div>
      </div>`;
    const list = scr.querySelector('.menu-list');
    if (hasSave) list.appendChild(btn('CONTINUE', 'primary', () => this.startGame(false)));
    list.appendChild(btn(hasSave ? 'NEW GAME' : 'START GAME', hasSave ? '' : 'primary', () => this.startGame(true)));
    list.appendChild(btn('SETTINGS', '', () => this.showSettings('menu')));
    list.appendChild(btn('CONTROLS', '', () => { this.clear(); this.ctx.hud.toggleHelp(true); this._helpFromMenu = true; }));
    this.root.appendChild(scr);

    // closing help from main menu returns to main menu
    this._helpWatcher = setInterval(() => {
      if (this._helpFromMenu && el('help-overlay').classList.contains('hidden')) {
        this._helpFromMenu = false;
        clearInterval(this._helpWatcher);
        this.showMain();
      }
    }, 250);
  }

  async startGame(fresh) {
    const ctx = this.ctx;
    if (fresh && loadSave()) { clearSave(); location.reload(); return; } // wipe + clean boot
    if (fresh) ctx.save = null;
    this.clear();
    this.state = 'playing';
    ctx.hud.show();
    ctx.hud.updateStars(ctx.police.stars);
    ctx.hud.updateWeapon(ctx.player);
    ctx.input.enabled = true;
    ctx.input.preventLock(false);
    ctx.input.requestLock();
    ctx.audio?.init();
    ctx.audio?.resume();
    ctx.hud.banner('CHROME HARBOR', 'Welcome to Port Vela. K is waiting downtown.');
    ctx.hud.dialog('K', 'Heard you just rolled into town. Find me by Spire Plaza — I pay cash and ask nothing twice.', 7);
  }

  // ---------- pause ----------
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ctx.input.releaseLock();
    this.ctx.input.preventLock(true);
    this.ctx.audio?.suspend();
    this.showPause();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.clear();
    this.state = 'playing';
    this.ctx.input.preventLock(false);
    this.ctx.input.requestLock();
    this.ctx.audio?.resume();
    this.ctx.hud.toggleBigMap(false);
  }
  escape() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'shop') this.closeShop();
    else if (el('help-overlay') && !el('help-overlay').classList.contains('hidden')) this.ctx.hud.toggleHelp(false);
    else if (el('bigmap-overlay') && !el('bigmap-overlay').classList.contains('hidden')) this.ctx.hud.toggleBigMap(false);
  }

  showPause() {
    this.clear();
    const scr = div('screen dim');
    scr.innerHTML = `
      <div class="menu-panel">
        <div class="game-logo" style="font-size:clamp(34px,5vw,56px)">PAUSED<em>Port Vela</em></div>
        <div class="menu-list"></div>
        <div class="menu-note">Esc resumes</div>
      </div>`;
    const list = scr.querySelector('.menu-list');
    list.appendChild(btn('RESUME', 'primary', () => this.resume()));
    list.appendChild(btn('SAVE GAME', '', () => { this.ctx.saveGame(); }));
    list.appendChild(btn('SETTINGS', '', () => this.showSettings('paused')));
    list.appendChild(btn('QUIT TO MENU', 'danger', () => { this.ctx.saveGame(true); location.reload(); }));
    this.root.appendChild(scr);
  }

  // ---------- wasted / busted ----------
  showWasted() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.bigState('WASTED', '#ff8d98', `The harbor claims another. Hospital bills: ${fmt$(deathFee(this.ctx))}`, [
      btn('RESPAWN AT MERCY GENERAL', 'primary', () => this.respawn('hospital')),
    ]);
    this.ctx.audio?.stingBad();
  }
  showBusted() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    const fine = Math.min(this.ctx.player.money, 300);
    this.bigState('BUSTED', '#9ec2ff', `Fine paid: ${fmt$(fine)}. They kept the ammo.`, [
      btn('RELEASE FROM PVPD HQ', 'primary', () => this.respawn('police', fine)),
    ], 'busted');
    this.ctx.audio?.stingBad();
  }
  bigState(title, color, sub, buttons, extraClass = '') {
    this.clear();
    const scr = div('screen dim');
    const bs = div('big-state ' + extraClass);
    bs.innerHTML = `<h1 style="-webkit-text-fill-color:transparent">${title}</h1><p>${sub}</p>`;
    color && (bs.querySelector('h1').style.filter = `drop-shadow(0 6px 30px ${color}44)`);
    const list = div('menu-list');
    buttons.forEach(b => list.appendChild(b));
    bs.appendChild(list);
    scr.appendChild(bs);
    this.root.appendChild(scr);
  }
  respawn(kind, finePaid = 0) {
    const ctx = this.ctx, p = ctx.player;
    const at = kind === 'hospital' ? ctx.plan.landmarks.hospital.spawn : ctx.plan.landmarks.policeHQ.spawn;
    if (kind === 'hospital') p.addMoney(-deathFee(ctx));
    else p.addMoney(-finePaid);
    if (kind === 'police') {
      // confiscate reserve ammo; keep the guns
      for (const k of Object.keys(p.ammoPool)) p.ammoPool[k] = Math.floor((p.ammoPool[k] || 0) / 2);
    }
    this.clear();
    this.state = 'playing';
    ctx.missions.fail && ctx.missions.active && ctx.missions.fail('You didn\'t make it.');
    p.respawn(at);
    ctx.hud.updateWeapon(p);
    ctx.input.preventLock(false);
    ctx.input.requestLock();
    ctx.audio?.resume();
    ctx.hud.banner(kind === 'hospital' ? 'DISCHARGED' : 'RELEASED',
      kind === 'hospital' ? 'Try to stay out of the ER.' : 'Next time, don\'t get caught.');
  }

  // ---------- gun shop ----------
  openShop(name) {
    if (this.state !== 'playing') return;
    this.state = 'shop';
    this.ctx.input.releaseLock();
    this.ctx.input.preventLock(true);
    this._returnTo = 'playing';
    this.renderShop(name);
  }
  renderShop(name) {
    const ctx = this.ctx, p = ctx.player;
    this.clear();
    const scr = div('screen dim');
    const panel = div('settings-panel');
    panel.innerHTML = `<h2>${name}</h2><div class="set-row"><label>Cash</label><b style="color:var(--cyan)" id="shop-cash">${fmt$(p.money)}</b></div>`;
    const AMMO_PRICE = { pistol: 60, smg: 90, shotgun: 110, rifle: 150 };
    const AMMO_AMT = { pistol: 36, smg: 60, shotgun: 24, rifle: 48 };

    const addRow = (labelTxt, sub, priceLabel, canAfford, action) => {
      const row = div('set-row');
      row.innerHTML = `<label>${labelTxt}<small>${sub}</small></label>`;
      const b = btn(priceLabel, canAfford ? '' : '', () => {
        if (!canAfford()) { ctx.hud.toastPrompt('Not enough cash'); return; }
        action();
        ctx.audio?.pickupCoin();
        this.renderShop(name);
      });
      b.style.minWidth = '150px';
      if (!canAfford()) { b.style.opacity = '.45'; b.style.pointerEvents = 'auto'; }
      row.appendChild(b);
      panel.appendChild(row);
    };

    for (const id of ['pistol', 'smg', 'shotgun', 'rifle']) {
      const def = WEAPONS[id];
      const owned = !!p.weapons[id];
      addRow(
        def.name,
        owned ? `Owned · mag ${def.mag}` : `${def.dmg} dmg · ${def.mag} rd mag`,
        owned ? `AMMO ${fmt$(AMMO_PRICE[id])}` : `BUY ${fmt$(def.buyPrice)}`,
        () => p.money >= (owned ? AMMO_PRICE[id] : def.buyPrice),
        () => {
          if (owned) { p.ammoPool[id] = (p.ammoPool[id] || 0) + AMMO_AMT[id]; p.addMoney(-AMMO_PRICE[id], true); }
          else { p.giveWeapon(id, def.mag); p.ammoPool[id] = (p.ammoPool[id] || 0) + def.mag; p.addMoney(-def.buyPrice, true); }
          ctx.hud.updateWeapon(p);
        });
    }
    addRow('BODY ARMOR', 'Absorbs most incoming damage', `BUY ${fmt$(250)}`,
      () => p.money >= 250 && p.armor < 95,
      () => { p.armor = 100; p.addMoney(-250, true); });
    addRow('FIELD MEDKIT', 'Patch up to full health', `BUY ${fmt$(120)}`,
      () => p.money >= 120 && p.health < 95,
      () => { p.health = 100; p.addMoney(-120, true); });

    panel.appendChild(btn('LEAVE', 'primary', () => this.closeShop())).style.marginTop = '18px';
    scr.appendChild(panel);
    this.root.appendChild(scr);
  }
  closeShop() {
    this.clear();
    this.state = 'playing';
    this.ctx.input.preventLock(false);
    this.ctx.input.requestLock();
  }

  // ---------- settings ----------
  showSettings(returnTo) {
    this._returnTo = returnTo;
    this.clear();
    const s = this.ctx.settings;
    const scr = div('screen dim');
    const panel = div('settings-panel');

    const row = (label, small, control) => {
      const r = div('set-row');
      r.innerHTML = `<label>${label}${small ? `<small>${small}</small>` : ''}</label>`;
      r.appendChild(control);
      panel.appendChild(r);
      return r;
    };
    const select = (opts, val, cb) => {
      const se = document.createElement('select');
      for (const [v, txt] of opts) {
        const o = document.createElement('option'); o.value = v; o.textContent = txt; se.appendChild(o);
      }
      se.value = String(val);
      se.onchange = () => cb(se.value);
      return se;
    };
    const slider = (min, max, step, val, cb) => {
      const wrap = document.createElement('span');
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '10px';
      const ra = document.createElement('input');
      ra.type = 'range'; ra.min = min; ra.max = max; ra.step = step; ra.value = val;
      const valEl = document.createElement('span'); valEl.className = 'set-val'; valEl.textContent = (+val).toFixed(step < 1 ? 2 : 0);
      ra.oninput = () => { valEl.textContent = (+ra.value).toFixed(step < 1 ? 2 : 0); cb(+ra.value); };
      wrap.append(ra, valEl);
      return wrap;
    };
    const check = (val, cb) => {
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = !!val;
      c.onchange = () => cb(c.checked);
      return c;
    };

    panel.innerHTML = '<h2>SETTINGS</h2>';
    row('Quality preset', 'Applies immediately', select(Object.entries(PRESETS).map(([k, v]) => [k, v.label]), s.preset, v => { s.preset = v; this.ctx.applyGraphics(); }));
    row('Field of view', '', slider(50, 90, 1, s.fov, v => {
      s.fov = v; const cam = this.ctx.camera; cam.fov = v; cam.updateProjectionMatrix(); saveSettings();
    }));
    row('Mouse sensitivity', '', slider(0.3, 2.5, 0.05, s.sensitivity, v => { s.sensitivity = v; saveSettings(); }));
    row('Invert Y', 'Off by default', check(s.invertY, v => { s.invertY = v; saveSettings(); }));
    row('Master volume', '', slider(0, 1, 0.05, s.volMaster, v => { s.volMaster = v; this.ctx.audio?.applyVolumes(); saveSettings(); }));
    row('Music volume', '', slider(0, 1, 0.05, s.volMusic, v => { s.volMusic = v; this.ctx.audio?.applyVolumes(); saveSettings(); }));
    row('SFX volume', '', slider(0, 1, 0.05, s.volSfx, v => { s.volSfx = v; this.ctx.audio?.applyVolumes(); saveSettings(); }));
    row('Time of day', '', select([['dynamic', 'Cycle'], ['noon', 'Noon'], ['sunset', 'Sunset'], ['night', 'Night']], s.timeMode, v => { s.timeMode = v; saveSettings(); }));
    row('Day length', 'Minutes per full day', slider(2, 30, 1, s.dayLengthMin, v => { s.dayLengthMin = v; saveSettings(); }));
    row('FPS counter', '', check(s.showFps, v => { s.showFps = v; applyFpsCounter(v); saveSettings(); }));

    panel.appendChild(btn('DONE', 'primary', () => {
      saveSettings();
      if (this._returnTo === 'paused') this.showPause();
      else if (this._returnTo === 'shop') { /* unreachable */ }
      else this.showMain();
    })).style.marginTop = '18px';

    scr.appendChild(panel);
    this.root.appendChild(scr);
  }
}

// ---------------- tiny DOM helpers ----------------
function div(cls) { const d = document.createElement('div'); d.className = cls; return d; }
function btn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'mbtn ' + (cls || '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function fmt$(n) { return '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); }
function deathFee(ctx) { return Math.max(100, Math.round(ctx.player.money * 0.1)); }
