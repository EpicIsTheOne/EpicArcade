import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CFG, CONSUMABLES } from './config.js';
import { S } from './state.js';
import { clamp } from './utils.js';
import { initInput, requestLock, endFrame, down, pressed, injectMove } from './input.js';
import { buildTerrain, updateEnvironment } from './terrain.js';
import * as world from './world.js';
import { initFX, updateFX } from './fx.js';
import { initAudio, unlockAudio, setVolume, ensureStormRumble, setStormIntensity, stopLobbyPad } from './audio.js';
import { createPlayer, updatePlayer, givePlayerItem, updateHeldModel } from './player.js';
import { initWeapons, updateProjectiles, tryFire } from './weapons.js';
import { initBuilding, exitBuild, updateBuilding } from './building.js';
import * as loot from './loot.js';
import { initBots, updateBots } from './bots.js';
import { initStorm, updateStorm, stormSkip } from './storm.js';
import * as bus from './bus.js';
import * as ui from './ui.js';

const canvas = document.getElementById('game');
let renderer, composer, bloomPass;
let lastT = performance.now();
let fpsAcc = 0, fpsN = 0;
let bigMapOpen = false;

function qualitySettings(q) {
  const map = {
    low: { pr: 0.66, shadows: false, shadowSize: 512, bloom: false },
    medium: { pr: 0.85, shadows: true, shadowSize: 1024, bloom: false },
    high: { pr: Math.min(window.devicePixelRatio, 1.5), shadows: true, shadowSize: 2048, bloom: true },
    ultra: { pr: Math.min(window.devicePixelRatio, 2), shadows: true, shadowSize: 4096, bloom: true },
  };
  return map[q] || map.high;
}

export function applyQuality() {
  const q = qualitySettings(S.settings.quality);
  renderer.setPixelRatio(q.pr);
  renderer.shadowMap.enabled = q.shadows;
  const scene = S.scene;
  if (scene?.userData.sun) {
    scene.userData.sun.castShadow = q.shadows;
    const sz = q.shadowSize;
    if (scene.userData.sun.shadow.map) {
      scene.userData.sun.shadow.map.dispose();
      scene.userData.sun.shadow.map = null;
    }
    scene.userData.sun.shadow.mapSize.set(sz, sz);
  }
  if (bloomPass) bloomPass.enabled = q.bloom;
}

async function boot() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer = renderer;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CFG.COLORS.fog, 0.0016);
  S.scene = scene;

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2200);
  camera.position.set(0, 60, 100);
  S.camera = camera;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.55, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  S.composer = composer;

  initAudio();
  initInput(canvas);

  buildTerrain(scene);
  world.generate(scene, CFG.SEED);
  initFX(scene);
  initWeapons(scene);
  initBuilding(scene);
  initStorm(scene);
  initBots(scene);

  loot.collectSpawnSpots();
  loot.spawnAllLoot(scene);

  const player = createPlayer(scene, camera);
  bus.setPlayerRef(player);
  updateHeldModel(player);

  world.registerBotsModule({
    botsHitTest,
    explosionDamageBots: null,
  });
  import('./bots.js').then(bm => {
    world.registerBotsModule({
      botsHitTest,
      explosionDamageBots: bm.explosionDamageBots,
    });
  });

  ui.initUI();
  applyQuality();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  setupEvents();
  setupDebugAPI();

  if (sessionStorage.getItem('skyfall_autostart')) {
    sessionStorage.removeItem('skyfall_autostart');
    setTimeout(() => startMatch(), 500);
  }

  canvas.addEventListener('click', () => {
    if (S.match.state !== 'lobby' && !S.paused && !player.dead && !bigMapOpen && !inputLocked()) {
      requestLock(canvas);
      unlockAudio();
      stopLobbyPadSafe();
    }
  });

  requestAnimationFrame(loop);
  window.GAME_READY = true;
}

function inputLocked() {
  return document.pointerLockElement === canvas;
}

function stopLobbyPadSafe() {
  import('./audio.js').then(a => a.stopLobbyPad());
}

function botsHitTest(origin, dir, maxDist) {
  let best = null;
  let bestT = maxDist;
  for (const b of S.bots) {
    if (!b.alive || b.state === 'bus') continue;
    const dx = b.pos.x - origin.x, dz = b.pos.z - origin.z;
    if (dx * dx + dz * dz > (maxDist + 3) ** 2) continue;
    const tBody = sphereT(origin, dir, b.pos.x, b.pos.y + 0.95, b.pos.z, 0.55);
    if (tBody !== null && tBody < bestT) {
      bestT = tBody;
      best = { dist: tBody, bot: b, part: 'body', point: new THREE.Vector3().copy(dir).multiplyScalar(tBody).add(origin) };
    }
    const tHead = sphereT(origin, dir, b.pos.x, b.pos.y + 1.62, b.pos.z, 0.32);
    if (tHead !== null && tHead < bestT) {
      bestT = tHead;
      best = { dist: tHead, bot: b, part: 'head', point: new THREE.Vector3().copy(dir).multiplyScalar(tHead).add(origin) };
    }
  }
  return best;
}

const _rel = new THREE.Vector3();
function sphereT(o, d, cx, cy, cz, r) {
  _rel.set(cx - o.x, cy - o.y, cz - o.z);
  const tca = _rel.dot(d);
  if (tca < 0) return null;
  const d2 = _rel.lengthSq() - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  return Math.max(tca - Math.sqrt(r2 - d2), 0.0001);
}

function setupEvents() {
  S.events.addEventListener('playClicked', () => {
    unlockAudio();
    startMatch();
  });
  S.events.addEventListener('resumeClicked', () => {
    S.paused = false;
    ui.showPause(false);
    requestLock(canvas);
  });
  S.events.addEventListener('qualityChanged', (e) => {
    S.settings.quality = e.detail.value;
    applyQuality();
  });
  S.events.addEventListener('volumeChanged', (e) => setVolume(e.detail.value));
  S.events.addEventListener('pause', () => {
    if (S.match.state === 'lobby' || S.player?.dead || S.match.state === 'victory') return;
    S.paused = true;
    ui.showPause(true);
    exitBuild();
  });
  S.events.addEventListener('spectateClicked', () => {
    document.getElementById('deathScreen').style.display = 'none';
    S.match.state = 'spectate';
    requestLock(canvas);
    S.emit('announce', { text: 'SPECTATING', sub: '', time: 2 });
  });
  S.events.addEventListener('victory', () => {
    S.match.state = 'victory';
    document.exitPointerLock?.();
  });
  S.events.addEventListener('landed', () => {
    ui.announce('LOOT UP · LAST ONE STANDING WINS', `${CFG.TOTAL_PLAYERS} players dropped onto ${CFG.ISLAND}`, 3);
  });
  S.events.addEventListener('stormTick', () => {});
  S.events.addEventListener('slotChanged', () => updateHeldModel(S.player));
  S.events.addEventListener('inventoryChanged', () => updateHeldModel(S.player));
}

function startMatch() {
  ui.hideLobby();
  const hint = null;
  bus.startBusDrop(S.scene, hint);
  ensureStormRumble();
  ui.announce('BOARDING THE SKYSHIP', 'Press SPACE to drop', 3.5);
  requestLock(canvas);
  stopLobbyPadSafe();
}

function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) {
    S.fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
  }

  if (S.paused) {
    endFrame();
    return;
  }

  dt *= S.timeScale;
  S.match.time += dt;

  const st = S.match.state;

  if (st === 'lobby') {
    orbitLobbyCam(dt);
    updateEnvironment(S.scene, dt, new THREE.Vector3(0, 0, 0));
    updateFX(dt);
    composer.render();
    endFrame();
    return;
  }

  if (st === 'bus' || st === 'freefall') {
    bus.updateBus(dt);
  }

  updatePlayer(S.player, dt);

  if (st === 'playing' || st === 'dead' || st === 'spectate') {
    updateStorm(dt);
  }
  updateBots(dt, bus.getBusInfo().t);
  loot.updateLoot(dt, now * 0.001);
  updateProjectiles(dt);
  updateBuilding(dt);
  updateFX(dt);
  updateEnvironment(S.scene, dt, S.player.pos);

  const camFwd = new THREE.Vector3();
  S.camera.getWorldDirection(camFwd);
  const near = loot.nearestInteractable(S.player.headPos(), 2.7);
  ui.setInteract(near ? near.label : null);

  if (pressed('KeyM')) {
    bigMapOpen = !bigMapOpen;
    ui.showBigMap(bigMapOpen);
    if (bigMapOpen) {
      S.suppressPause = true;
      document.exitPointerLock?.();
      setTimeout(() => { S.suppressPause = false; }, 300);
    } else if (!S.player.dead) {
      requestLock(canvas);
    }
  }

  if (S.match.state === 'spectate') {
    const t = performance.now() * 0.0003;
    S.camera.position.set(S.player.pos.x + Math.cos(t) * 14, S.player.pos.y + 8, S.player.pos.z + Math.sin(t) * 14);
    S.camera.lookAt(S.player.pos.x, S.player.pos.y + 1, S.player.pos.z);
  }

  handleDebugKeys();

  const stormInfo = require_storm_info();
  ui.updateHUD(dt, S.camera, stormInfo);
  ui.updateStormPill(S.storm);
  window.__busInfo = bus.getBusInfo();

  if (S.storm) {
    const pdx = S.player.pos.x - S.storm.cur.cx;
    const pdz = S.player.pos.z - S.storm.cur.cz;
    const distInside = S.storm.cur.r - Math.hypot(pdx, pdz);
    setStormIntensity(clamp(1 - distInside / 60, 0, 1) * 0.45 + 0.06);
  }

  checkEndConditions();

  composer.render();
  endFrame();
}

function orbitLobbyCam(dt) {
  void dt;
  const t = performance.now() * 0.00008;
  S.camera.position.set(Math.cos(t) * 330, 120 + Math.sin(t * 2.3) * 20, Math.sin(t) * 330);
  S.camera.lookAt(0, 10, 0);
}

function require_storm_info() {
  if (!S.storm || !S.player) return null;
  const dx = S.player.pos.x - S.storm.cur.cx;
  const dz = S.player.pos.z - S.storm.cur.cz;
  const inside = dx * dx + dz * dz <= S.storm.cur.r ** 2;
  return { inside };
}

function checkEndConditions() {
  if (S.match.state !== 'playing') return;
  if (S.match.alive <= 1 && !S.player.dead) {
    S.match.state = 'victory';
    S.emit('victory');
  }
}

function handleDebugKeys() {
  if (pressed('F8')) {
    S.timeScale = S.timeScale >= 8 ? 1 : S.timeScale * 2;
    ui.announce(`TIME SCALE ×${S.timeScale}`, '', 1.2);
  }
}

function setupDebugAPI() {
  window.GAME = {
    state: () => ({ match: S.match.state, alive: S.match.alive, kills: S.match.kills, time: S.match.time }),
    tp(x, z, y = null) {
      S.player.pos.set(x, y ?? Math.max(world.groundAt(x, z), 2) + 1, z);
      S.player.vel.set(0, 0, 0);
    },
    god() { S.player.god = !S.player.god; return S.player.god; },
    give(itemId, n = 1) { givePlayerItem(S.player, itemId, n); },
    mats(n = 500) {
      S.player.mats.wood = S.player.mats.brick = S.player.mats.metal = Math.min(n, CFG.MAT_CAP);
      S.emit('mats');
    },
    heal() { S.player.hp = 100; S.player.shield = 100; S.emit('vitals'); },
    stormSkip,
    speed(x) { S.timeScale = x; },
    killAllBots() {
      import('./bots.js').then(b => b.debugKillAll());
    },
    forceKills(n) {
      import('./bots.js').then(b => b.forceEliminations(n));
    },
    bots() {
      return S.bots.filter(b => b.alive).map(b => ({ name: b.name, state: b.state, mode: b.mode, hp: Math.round(b.hp), pos: [Math.round(b.pos.x), Math.round(b.pos.z)] }));
    },
    stats() {
      return {
        fps: Math.round(S.fps),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pieces: S.build.pieces.size,
        lootItems: S.lootItems.length,
      };
    },
    fire() { tryFire(S.player, 0.016); },
    look(dx, dy) { injectMove(dx, dy); },
    pos() { const p = S.player.pos; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +S.player.yaw.toFixed(3), pitch: +S.player.pitch.toFixed(3), hp: S.player.hp, shield: S.player.shield, grounded: S.player.grounded }; },
    slot(i) {
      import('./loot.js').then(l => l.selectSlot(S.player, i));
    },
  };
}

boot().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;top:10px;left:10px;color:#f55;background:#300a;padding:12px;font-family:monospace;z-index:9999">BOOT ERROR: ${err.message}</div>`);
});
