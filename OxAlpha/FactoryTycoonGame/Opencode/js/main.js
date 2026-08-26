import * as THREE from '../lib/three.module.min.js';
import {
  CELL, ITEMS, MACHINES, MACHINE_ORDER, PLOTS, START_MONEY,
  DEMOLISH_REFUND, SOLID, UPGRADES, upgradeCost,
} from './data.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Builder } from './build.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import {
  createMachine, linkDeposits, disposeMachine, updateMachine,
  syncItemVisuals, statusOf, bufChips,
} from './machines.js';

// ---------------- renderer / scene ----------------
const $ = id => document.getElementById(id);
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 600);
camera.position.set(8, 1.66, 14.5);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

// ---------------- state ----------------
const savedData = loadGame();
const state = {
  money: savedData ? savedData.money : START_MONEY,
  totalEarned: savedData ? savedData.totalEarned : 0,
  itemsSold: savedData ? savedData.itemsSold : 0,
  playtime: savedData ? savedData.playtime : 0,
  plots: new Set(savedData ? savedData.plots : [0]),
  upgrades: savedData ? { ...savedData.upgrades } : { belt: 0, drill: 0, furn: 0, asm: 0 },
  muted: savedData ? !!savedData.muted : false,
  volume: savedData ? (savedData.volume ?? 0.8) : 0.8,
  machines: new Map(),
};
const key2 = (gx, gz) => `${gx},${gz}`;

sfx.muted = state.muted;
sfx.volume = state.volume;

const world = new World(scene, state);
const player = new Player(camera, renderer.domElement);
const ui = new UI(null); // hooks wired below
const builder = new Builder({ scene, camera, game: null });

// rebuild machines from save
if (savedData) {
  for (const rec of savedData.machines) {
    const m = createMachine(scene, rec.t, rec.gx, rec.gz, rec.r | 0);
    linkDeposits(m, world);
    state.machines.set(key2(m.gx, m.gz), m);
  }
}

// ---------------- sim context ----------------
let nowSec = 0;
const ctx = {
  time: 0,
  at: (gx, gz) => state.machines.get(key2(gx, gz)) || null,
  up: id => state.upgrades[id] || 0,
  sell: (type, wx, wz) => {
    const price = ITEMS[type].price;
    state.money += price;
    state.totalEarned += price;
    state.itemsSold++;
    ui.pushIncome(price, performance.now());
    sfx.sell(price);
    ui.floater(new THREE.Vector3(wx, 1.6, wz), '+' + ui.fmt(price), camera, renderer.domElement);
    dirtyMoney = true;
  },
};

// ---------------- game object (hooks for ui + logic) ----------------
let expectUnlock = false;
let dirtyMoney = true;
let started = false;
let camOverride = null;

const game = {
  state,
  world,
};

let _paused = false;

Object.assign(game, {
  uiSelectBuild(type) {
    sfx.click();
    builder.setType(type);
    ui.refreshToolbar(state.money, type);
    ui.setCrosshair('build');
    hideDemolishBadge();
    if (!player.locked && started && !ui.anyModalOpen()) player.requestLock();
  },
  uiToggleShop() {
    if (!isOpen('shopModal')) { openModal('shopModal'); ui.refreshShop(); }
    else closeModal('shopModal');
  },
  uiCloseShop() { closeModal('shopModal'); },
  uiToggleHelp() { isOpen('helpModal') ? closeModal('helpModal') : (openModal('helpModal')); },
  uiOpenHelp() { openModal('helpModal'); },
  uiCloseHelp() { closeModal('helpModal'); },
  uiOpenPause() { openModal('pauseModal'); $('volRange').value = Math.round(sfx.volume * 100); },
  uiClosePause() { closeModal('pauseModal'); },
  uiResume() { closeModal('pauseModal'); if (started) player.requestLock(); },
  uiToggleMute() {
    state.muted = !state.muted;
    sfx.setMute(state.muted);
    $('btnMute').innerHTML = `Sound: ${state.muted ? 'Off' : 'On'}<span class="k">M</span>`;
  },
  setVolume(v) {
    state.volume = v;
    sfx.setVolume(v);
  },

  buyUpgrade(id) {
    const lv = state.upgrades[id] || 0;
    if (lv >= UPGRADES[id].max) return;
    const cost = upgradeCost(id, lv);
    if (state.money < cost) return;
    state.money -= cost;
    state.upgrades[id] = lv + 1;
    sfx.upgrade();
    ui.toast(`${UPGRADES[id].name} → Lv.${lv + 1}`, 'good');
    dirtyMoney = true;
    ui.refreshShop();
    ui.refreshToolbar(state.money, builder.mode === 'place' ? builder.selType : null);
  },
  buyPlot(id) {
    const p = PLOTS.find(q => q.id === id);
    if (!p || state.plots.has(id)) return;
    if (!world.plotBuyable(id)) { sfx.error(); return; }
    if (state.money < p.cost) { sfx.error(); return; }
    state.money -= p.cost;
    state.plots.add(id);
    world.refreshPlots();
    // any extractor standing on a deposit that just became valid? (none possible) 
    sfx.buyLand();
    ui.toast(`Purchased ${p.name}! New deposits available.`, 'good');
    dirtyMoney = true;
    ui.refreshShop();
  },

  placeMachine(type, gx, gz, rot, opts = {}) {
    const def = MACHINES[type];
    if (!def) return false;
    if (state.money < def.cost && !opts.free) return false;
    const dep = world.depositAt(gx, gz);
    let ok;
    if (type === 'extractor') ok = !!(dep && dep.owned);
    else ok = world.ownedAt(gx, gz) && !dep;
    if (!ok) return false;
    if (state.machines.has(key2(gx, gz))) return false;
    if (!opts.free) state.money -= def.cost;
    const m = createMachine(scene, type, gx, gz, rot | 0);
    linkDeposits(m, world);
    state.machines.set(key2(gx, gz), m);
    dirtyMoney = true;
    return true;
  },
  removeMachine(gx, gz) {
    const k = key2(gx, gz);
    const m = state.machines.get(k);
    if (!m) return 0;
    const refund = Math.floor(MACHINES[m.type].cost * DEMOLISH_REFUND);
    disposeMachine(scene, m);
    state.machines.delete(k);
    state.money += refund;
    dirtyMoney = true;
    return refund;
  },

  saveNow(manual) {
    if (saveGame(state) && manual) { ui.savedFlash(); ui.toast('Progress saved', 'good'); }
    else if (!manual) ui.savedFlash();
  },
  resetGame() { clearSave(); location.reload(); },

  machineAt: ctx.at,
});

function isOpen(id) { return !$(id).classList.contains('hidden'); }
function openModal(id) {
  if (id === 'pauseModal') _paused = true;
  $(id).classList.remove('hidden');
  if (player.locked) { expectUnlock = true; player.releaseLock(); }
}
function closeModal(id) {
  $(id).classList.add('hidden');
  if (id === 'pauseModal') _paused = false;
  ui.setCrosshair(builder.mode ? (builder.mode === 'demolish' ? 'demolish' : 'build') : '');
}
function hideDemolishBadge() {
  $('demolishBadge').classList.toggle('hidden', !(builder.mode === 'demolish'));
}

ui.hooks = game;
builder.game = {
  get paused() { return _paused; },
  get money() { return state.money; },
};
game.builder = builder;
game.player = player;

// ---------------- input ----------------
document.addEventListener('pointerlockchange', () => {
  if (expectUnlock) { expectUnlock = false; return; }
  if (!player.locked && started && !ui.anyModalOpen()) {
    game.uiOpenPause();
  }
});

renderer.domElement.addEventListener('mousedown', e => {
  if (!started || e.button !== 0) return;
  if (!player.locked) return;
  if (_paused) return;
  if (builder.mode === 'demolish') {
    const hit = builder.target;
    if (hit) {
      const refund = game.removeMachine(hit.gx, hit.gz);
      sfx.demolish();
      ui.toast(`Sold ${MACHINES[hit.type].name} for ${ui.fmt(refund)}`);
      ui.hideInfo();
    }
    return;
  }
  if (builder.mode === 'place' && builder.valid) {
    if (game.placeMachine(builder.selType, builder.gx, builder.gz, builder.rot)) {
      sfx.place();
      ui.refreshToolbar(state.money, builder.selType);
    } else sfx.error();
  }
});

addEventListener('wheel', e => {
  if (!started || !player.locked || builder.mode !== 'place') return;
  builder.cycleRot(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
  if (!started) return;
  player.keys.add(e.code);

  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= MACHINE_ORDER.length) game.uiSelectBuild(MACHINE_ORDER[n - 1]);
  }
  switch (e.code) {
    case 'KeyR': if (builder.mode === 'place') builder.cycleRot(1); break;
    case 'KeyX':
      builder.setMode(builder.mode === 'demolish' ? 'place' : 'demolish');
      hideDemolishBadge();
      ui.setCrosshair(builder.mode === 'demolish' ? 'demolish' : 'build');
      break;
    case 'KeyB': game.uiToggleShop(); break;
    case 'KeyH': game.uiToggleHelp(); break;
    case 'KeyM': game.uiToggleMute(); break;
    case 'KeyF': game.saveNow(true); break;
    case 'Escape':
      if (ui.anyModalOpen()) {
        ['shopModal', 'helpModal', 'pauseModal'].forEach(id => {
          if (isOpen(id)) closeModal(id);
        });
        ui.setCrosshair('');
      } else if (builder.mode) {
        builder.setMode(null);
        ui.setCrosshair('');
        hideDemolishBadge();
      } else {
        game.uiOpenPause();
      }
      break;
  }
});
addEventListener('keyup', e => player.keys.delete(e.code));

player.onLockChange = locked => {
  if (locked) { /* resume feel */ }
};

// ---------------- start flow ----------------
const startOverlay = document.getElementById('startOverlay');
const hud = document.getElementById('hud');
startOverlay.classList.remove('hidden');
document.getElementById('startBtn').onclick = () => begin();
startOverlay.onclick = e => { if (e.target === startOverlay) begin(); };
function begin() {
  if (started) return;
  started = true;
  startOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  sfx.init();
  sfx.setMute(state.muted);
  sfx.setVolume(state.volume);
  $('btnMute').innerHTML = `Sound: ${state.muted ? 'Off' : 'On'}<span class="k">M</span>`;
  player.requestLock();
  if (!savedData) setTimeout(() => game.uiOpenHelp(), 350);
  ui.toast('Pick a machine (1–6) and build near the glowing ore!', 'good');
}

// ---------------- info raycast ----------------
let infoTimer = 0;
const infoRay = new THREE.Raycaster();
function updateInfo(dt) {
  infoTimer -= dt;
  if (infoTimer > 0) return;
  infoTimer = 0.15;
  if (!started || _paused || builder.mode || !player.locked) { ui.hideInfo(); return; }
  infoRay.setFromCamera({ x: 0, y: 0 }, camera);
  const groups = [...state.machines.values()].map(m => m.grp);
  const hits = infoRay.intersectObjects(groups, true);
  if (!hits.length) { ui.hideInfo(); return; }
  let obj = hits[0].object;
  while (obj) {
    const found = [...state.machines.values()].find(m => m.grp === obj);
    if (found) {
      ui.showInfo(MACHINES[found.type].name, statusOf(found), bufChips(found));
      return;
    }
    obj = obj.parent;
  }
  ui.hideInfo();
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let autosaveT = 12, moneyT = 0;
let booted = false;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  nowSec += dt;
  ctx.time = nowSec;

  if (started && !_paused) {
    state.playtime += dt;

    if (player.locked && !camOverride) {
      player.update(dt, solidAt);
    }

    for (const m of state.machines.values()) updateMachine(m, dt, ctx);
    syncItemVisuals(state, dt);
    world.update(dt);

    autosaveT -= dt;
    if (autosaveT <= 0) { autosaveT = 12; game.saveNow(false); }
  }

  // ghost
  const pc = [Math.round(player.pos.x / CELL), Math.round(player.pos.z / CELL)];
  builder.update(world, ctx.at, pc);
  world.setBuildGrid(builder.mode === 'place' && !_paused);

  updateInfo(dt);

  moneyT -= dt;
  const rate = ui.incomeRate(performance.now());
  if (moneyT <= 0) {
    moneyT = 0.18;
    ui.setIncome(rate);
    if (dirtyMoney) {
      dirtyMoney = false;
      ui.setMoney(state.money, state.totalEarned);
      if (builder.mode === 'place') ui.refreshToolbar(state.money, builder.selType);
    }
  }

  ui.updateFloaters(camera, renderer.domElement);
  renderer.render(scene, camera);

  if (!booted) {
    booted = true;
    document.getElementById('loadingTag').remove();
    ui.setMoney(state.money, state.totalEarned);
    ui.buildToolbar();
    ui.refreshToolbar(state.money, builder.selType);
  }
}
requestAnimationFrame(tick);

function solidAt(gx, gz) {
  const m = state.machines.get(key2(gx, gz));
  return m && SOLID.has(m.type);
}

// persistence hooks
addEventListener('beforeunload', () => { if (started) saveGame(state); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started) saveGame(state);
});

// ---------------- test / debug API ----------------
window.G = {
  game,
  state: () => ({
    money: state.money,
    totalEarned: state.totalEarned,
    itemsSold: state.itemsSold,
    playtime: Math.round(state.playtime),
    plots: [...state.plots],
    upgrades: { ...state.upgrades },
    machineCount: state.machines.size,
    machines: [...state.machines.values()].map(m => ({ t: m.type, gx: m.gx, gz: m.gz, r: m.rot })),
  }),
  place: (t, gx, gz, r = 0, free = false) => game.placeMachine(t, gx, gz, r, { free }),
  remove: (gx, gz) => game.removeMachine(gx, gz),
  give: v => { state.money += v; dirtyMoney = true; },
  buyUp: id => game.buyUpgrade(id),
  buyPlot: id => game.buyPlot(id),
  warp: (x, z) => player.teleport(x, z),
  look: (yawDeg, pitchDeg) => player.teleport(player.pos.x, player.pos.z, yawDeg, pitchDeg),
  setCam: (x, y, z, yawDeg = 0, pitchDeg = 0) => {
    camOverride = true;
    camera.position.set(x, y, z);
    camera.rotation.set(pitchDeg * Math.PI / 180, yawDeg * Math.PI / 180, 0, 'YXZ');
    camera.quaternion.setFromEuler(new THREE.Euler(pitchDeg * Math.PI / 180, yawDeg * Math.PI / 180, 0, 'YXZ'));
  },
  clearCam: () => { camOverride = false; },
  start: () => begin(),
  save: () => game.saveNow(true),
  reset: () => game.resetGame(),
  selectBuild: t => game.uiSelectBuild(t),
};
