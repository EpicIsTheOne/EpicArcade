// HYPERLINE main — boot, loop, game state machine, UI wiring, collisions, missions
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import CFG from './config.js';
import { G, resetRunState, bus, baseMult, totalMult } from './state.js';
import { Save } from './save.js';
import { Player } from './player.js';
import { World } from './world.js';
import { Trains } from './trains.js';
import { Obstacles } from './obstacles.js';
import { Collectibles } from './collectibles.js';
import { Powerups } from './powerups.js';
import { fx, initPopups, popup } from './fx.js';
import { input } from './input.js';
import { AudioSysInstance as AU } from './audio.js';
import { Sky } from './sky.js';
import { clamp, damp, lerp, randRange, choice, fmt, fmtDist } from './utils.js';

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

window.addEventListener('error', e => {
  const el = $('errOverlay');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = '⚠ ' + (e.message || 'script error');
});
window.addEventListener('unhandledrejection', e => {
  const el = $('errOverlay');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = '⚠ ' + ((e.reason && e.reason.message) || 'async error');
});

function detectQuality() {
  const touchNav = navigator.maxTouchPoints > 2 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  if (touchNav) return cores >= 6 ? 'medium' : 'low';
  if (cores >= 8) return 'high';
  return 'medium';
}

let flashesAllowed = true;

function flash(color, alpha, dur = 0.45) {
  if (!flashesAllowed) return;
  const el = $('flashLayer');
  el.style.transition = 'none';
  el.style.background = color;
  el.style.opacity = String(alpha);
  void el.offsetWidth;
  el.style.transition = `opacity ${dur}s ease-out`;
  el.style.opacity = '0';
}

// ---------------------------------------------------------------- quality / renderer
const savedQ = () => (Save.data.settings.quality === 'auto' ? detectQuality() : Save.data.settings.quality);
let quality = { ...CFG.QUALITY[savedQ()] };

const renderer = new THREE.WebGLRenderer({
  antialias: quality.msaa > 0, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = quality.shadows > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(CFG.PALETTE.fogBase, 60, quality.drawAhead + 90);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(0, 5, 10);

const hemi = new THREE.HemisphereLight(CFG.PALETTE.skyTop, 0x5a4640, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(CFG.PALETTE.sunColor, 2.8);
sun.position.set(18, 26, -14);
if (quality.shadows > 0) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadows, quality.shadows);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 40; sc.bottom = -30;
  sc.near = 2; sc.far = 130;
  sun.shadow.bias = -0.0012;
}
scene.add(sun);
scene.add(sun.target);

let composer = null, bloomPass = null;
if (quality.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.55, 0.82);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------- systems
window.__save = Save;
window.__allowShake = Save.data.settings.shake;
flashesAllowed = Save.data.settings.flash;

const player = new Player();
const world = new World();
const trains = new Trains();
const obstacles = new Obstacles();
const collectibles = new Collectibles();
const powerups = new Powerups();

world.init(scene, quality, {
  trains, obstacles, collectibles,
  save: Save,
  playerSpeedEstimate: () => G.speed,
});
obstacles.init(scene, quality);
trains.init(scene, quality);
collectibles.init(scene, quality);
fx.init(scene, quality.particles);
initPopups();

const sky = new Sky(scene, quality);
player.build(charDef(), quality);
scene.add(player.root);

function charDef() {
  const id = Save.data.char;
  return CFG.SHOP.chars.find(c => c.id === id) || CFG.SHOP.chars[0];
}
function boardDef() {
  const id = Save.data.board;
  return CFG.SHOP.boards.find(b => b.id === id) || CFG.SHOP.boards[0];
}
function rebuildPlayer() {
  scene.remove(player.root);
  const fresh = new Player();
  fresh.build(charDef(), quality);
  Object.assign(player, fresh);
  player.setBoardColor(boardDef().color);
  scene.add(player.root);
}
player.setBoardColor(boardDef().color);

// warden (chaser)
const warden = buildWarden();
scene.add(warden.g);

function buildWarden() {
  const g = new THREE.Group();
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x1d2233, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a68a, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.44), coatMat);
  torso.position.y = 1.32; g.add(torso);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xffc93c }));
  badge.position.set(-0.16, 1.5, -0.24); g.add(badge);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skinMat);
  head.position.y = 2.02; g.add(head);
  const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.44), coatMat);
  capTop.position.y = 2.24; g.add(capTop);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.24), coatMat);
  brim.position.set(0, 2.17, -0.3); g.add(brim);
  const eyeG = new THREE.SphereGeometry(0.045, 8, 6);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  for (const ex of [-0.1, 0.1]) {
    const e = new THREE.Mesh(eyeG, eyeM);
    e.position.set(ex, 2.04, -0.21); g.add(e);
  }
  const limbs = {};
  function limb(x, y, len, w, mat) {
    const piv = new THREE.Group();
    piv.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2;
    piv.add(m); g.add(piv);
    return piv;
  }
  limbs.armL = limb(-0.46, 1.7, 0.78, 0.15, coatMat);
  limbs.armR = limb(0.46, 1.7, 0.78, 0.15, coatMat);
  limbs.legL = limb(-0.19, 0.86, 0.84, 0.18, coatMat);
  limbs.legR = limb(0.19, 0.86, 0.84, 0.18, coatMat);
  g.visible = false;
  g.userData.limbs = limbs;
  return { g, limbs };
}

// ---------------------------------------------------------------- run state extras
let turboT = 0, turboLvl = 0;
let chaserDist = CFG.CHASER.INTRO;
let wardenGrab = false;
let deadT = 0, overShown = false;
let cdT = 0, cdShown = -1, goT = 0;
let idleT = 0;
let hudT = 0, biomeT = 0, nearMissCd = 0;
let lastCoinT = -9;
let dynColliders = [];

Object.assign(G, { boardsLeft: 0 });

// ---------------------------------------------------------------- missions
const MISSION_LABELS = {
  coins_run: 'Collect coins in one run',
  coins_total: 'Collect coins (total)',
  jumps: 'Jump obstacles',
  rolls: 'Roll under barriers',
  powerups: 'Grab powerups',
  nearmiss: 'Near-miss dodges',
  dist_run: 'Run distance in one go',
  score_run: 'Score points in one run',
  roof_meters: 'Surf train roofs',
  boxes: 'Open mystery boxes',
  gems: 'Grab gems',
  trains_dodged: 'Dodge oncoming trains',
};
const PER_RUN_IDS = new Set(['coins_run', 'dist_run', 'score_run']);
const MISSION_IDS = Object.keys(CFG.MISSION_TIERS);

function genMissions() {
  const tier = Math.min(2, Math.max(0, Save.data.rank - 1));
  const pool = [...MISSION_IDS];
  const slots = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = (Math.random() * pool.length) | 0;
    const id = pool.splice(idx, 1)[0];
    slots.push({ id, tier, goal: CFG.MISSION_TIERS[id][tier], prog: 0, done: false });
  }
  Save.data.missions = slots;
  Save.commit();
}
if (!Array.isArray(Save.data.missions) || Save.data.missions.length !== 3) genMissions();

function progressMission(id, amount) {
  const slots = Save.data.missions;
  if (!slots) return;
  let anyDone = false;
  for (const s of slots) {
    if (s.id !== id || s.done) continue;
    s.prog += amount;
    if (s.prog >= s.goal) {
      s.done = true; s.prog = s.goal;
      anyDone = true;
      popup('MISSION DONE!', '#7dffa8', 50, 36);
      AU.gem();
    }
  }
  if (anyDone && slots.every(s => s.done)) rankUp();
  renderMissionsHUD(false);
}

function rankUp() {
  Save.data.rank = Math.min(CFG.MISSION_RANK_MAX, Save.data.rank + 1);
  G.multRank = Save.data.rank;
  popup(`MULTIPLIER x${Save.data.rank}!`, '#ffd36b', 50, 30, true);
  fx.confetti(player.pos.x, player.pos.y + 2, player.pos.z);
  AU.powerup(1);
  flash('#ffd36b', 0.22, 0.7);
  genMissions();
  renderMissionsHUD(true);
  refreshTitleStats();
}

// ---------------------------------------------------------------- HUD
const HUD = {
  missionEls: [],
  puEls: {},
  syncPowerups() {
    const box = $('hudPowerups');
    box.innerHTML = '';
    this.puEls = {};
    const defs = [
      ['magnet', 'MAG', 'ico-magnet', '#ff6b5c'],
      ['jetpack', 'JET', 'ico-jet', '#ffa03c'],
      ['x2', '×2', 'ico-x2', '#ffd36b'],
      ['sneakers', 'SHOE', 'ico-shoe', '#b38bff'],
      ['shield', 'SHLD', 'ico-shield', '#7fc4ff'],
    ];
    for (const [k, label, ico, col] of defs) {
      const active = k === 'shield' ? G.fx.shield : G.fx[k] > 0;
      if (!active) continue;
      const chip = document.createElement('div');
      chip.className = 'puChip';
      chip.innerHTML = `<span class="ico ${ico}"></span><b>${label}</b><div class="tbar"><i style="background:${col}"></i></div>`;
      box.appendChild(chip);
      this.puEls[k] = { fill: chip.querySelector('.tbar i'), max: k === 'shield' ? 1 : durFor(k) };
    }
  },
  updatePowerupBars(dt) {
    for (const k in this.puEls) {
      const ref = this.puEls[k];
      const cur = k === 'shield' ? 1 : G.fx[k];
      ref.fill.style.width = `${clamp(cur / ref.max, 0, 1) * 100}%`;
    }
  },
};

function durFor(kind) {
  const l = Save.data.upg[kind] || 0;
  const table = CFG.POWERUPS[kind.toUpperCase()];
  return (table && table.DUR ? table.DUR[Math.min(l, table.DUR.length - 1)] : 8) * powerups.durMult();
}

function missionChipHTML(s) {
  const label = MISSION_LABELS[s.id] || s.id;
  return `<div class="missionChip${s.done ? ' done' : ''}">
    <span>${label} <b style="float:right">${Math.floor(s.prog)|0}/${s.goal}</b></span>
    <div class="bar"><i style="width:${clamp(s.prog / s.goal, 0, 1) * 100}%"></i></div>
  </div>`;
}

function renderMissionsHUD(rebuild) {
  const slots = Save.data.missions || [];
  const box = $('hudMissions');
  if (rebuild || !HUD.missionEls.length) {
    box.innerHTML = '';
    HUD.missionEls = [];
    for (const s of slots) {
      const wrap = document.createElement('div');
      wrap.innerHTML = missionChipHTML(s);
      const el = wrap.firstElementChild;
      box.appendChild(el);
      HUD.missionEls.push({ el, slot: s });
    }
  } else {
    for (const ref of HUD.missionEls) {
      const s = ref.slot;
      ref.el.className = 'missionChip' + (s.done ? ' done' : '');
      ref.el.querySelector('b').textContent = `${Math.floor(s.prog)|0}/${s.goal}`;
      ref.el.querySelector('.bar i').style.width = `${clamp(s.prog / s.goal, 0, 1) * 100}%`;
    }
  }
}

function syncCoinsUI() {
  const c = fmt(Save.data.coins | 0);
  $('hudCoins').textContent = fmt(G.runCoins | 0);
  $('shopCoins').textContent = c;
  $('tCoins').textContent = c;
  $('boardCount').textContent = String(G.boardsLeft);
}

function refreshTitleStats() {
  $('tBest').textContent = fmt(Save.data.best | 0);
  $('rankTag').textContent = `RANK ${Save.data.rank} · x${baseMult()} SCORE`;
}

// ---------------------------------------------------------------- screens
const SCREENS = ['scr-loading', 'scr-title', 'scr-pause', 'scr-over', 'scr-shop', 'scr-settings', 'scr-help'];
function showScreen(...ids) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', !ids.includes(s));
}

// ---------------------------------------------------------------- shop
let curTab = 'upg';

function upgradeCost(u) {
  const lvl = Save.data.upg[u.id] || 0;
  return Math.floor(u.base * Math.pow(u.scale, lvl));
}

function renderShop() {
  const list = $('shopList');
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('on', t.dataset.tab === curTab));
  syncCoinsUI();
  list.innerHTML = '';

  if (curTab === 'upg') {
    for (const u of CFG.SHOP.upgrades) {
      const lvl = Save.data.upg[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = upgradeCost(u);
      const row = document.createElement('div');
      row.className = 'shopItem';
      row.innerHTML = `
        <div class="swatch" style="background:linear-gradient(135deg,#35e0d2,#8a5cff)"></div>
        <div class="info"><b>${u.name}</b><small>${u.desc}</small>
          <div class="lvlDots">${Array.from({ length: u.max }, (_, i) =>
            `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <button class="btn ${maxed ? 'owned' : ''}" data-buy="${u.id}" ${maxed ? 'disabled' : ''}>
          ${maxed ? 'MAX' : fmt(cost)}</button>`;
      list.appendChild(row);
    }
  } else if (curTab === 'boards') {
    for (const b of CFG.SHOP.boards) {
      const owned = Save.data.ownedBoards.includes(b.id);
      const equipped = Save.data.board === b.id;
      const row = document.createElement('div');
      row.className = 'shopItem';
      row.innerHTML = `
        <div class="swatch" style="background:#${b.color.toString(16).padStart(6, '0')}"></div>
        <div class="info"><b>${b.name}</b><small>${b.desc}</small></div>
        <button class="btn ${equipped ? 'selected' : owned ? 'owned' : ''}"
          data-board="${b.id}" ${equipped ? 'disabled' : ''}>
          ${equipped ? 'RIDING' : owned ? 'SELECT' : fmt(b.cost)}</button>`;
      list.appendChild(row);
    }
    const refill = document.createElement('div');
    refill.className = 'shopItem';
    refill.innerHTML = `
      <div class="swatch" style="background:linear-gradient(135deg,#2b8cff,#35e0d2)"></div>
      <div class="info"><b>+1 Hoverboard</b><small>Carry one more board into your next run</small></div>
      <button class="btn" data-refill="1">${fmt(CFG.SHOP.boardRefillCost)}</button>`;
    list.appendChild(refill);
  } else {
    for (const cdef of CFG.SHOP.chars) {
      const owned = Save.data.ownedChars.includes(cdef.id);
      const selected = Save.data.char === cdef.id;
      const row = document.createElement('div');
      row.className = 'shopItem';
      row.innerHTML = `
        <div class="swatch" style="background:linear-gradient(135deg,#${cdef.colors.hood.toString(16).padStart(6, '0')},#${cdef.colors.cap.toString(16).padStart(6, '0')})"></div>
        <div class="info"><b>${cdef.name}</b><small>${cdef.desc}</small></div>
        <button class="btn ${selected ? 'selected' : owned ? 'owned' : ''}"
          data-char="${cdef.id}" ${selected ? 'disabled' : ''}>
          ${selected ? 'PLAYING' : owned ? 'SELECT' : fmt(cdef.cost)}</button>`;
      list.appendChild(row);
    }
  }
}

on($('shopList'), 'click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  AU.ui();
  if (btn.dataset.buy) {
    const u = CFG.SHOP.upgrades.find(x => x.id === btn.dataset.buy);
    const cost = upgradeCost(u);
    if (Save.data.coins >= cost) {
      Save.data.coins -= cost;
      Save.data.upg[u.id]++;
      AU.powerup(0);
      popup(`${u.name} LV${Save.data.upg[u.id]}!`, '#35e0d2');
    } else return brokeFlash(btn);
  } else if (btn.dataset.board) {
    const b = CFG.SHOP.boards.find(x => x.id === btn.dataset.board);
    if (Save.data.ownedBoards.includes(b.id)) {
      Save.data.board = b.id;
      player.setBoardColor(b.color);
    } else if (Save.data.coins >= b.cost) {
      Save.data.coins -= b.cost;
      Save.data.ownedBoards.push(b.id);
      Save.data.board = b.id;
      player.setBoardColor(b.color);
      AU.powerup(0);
    } else return brokeFlash(btn);
  } else if (btn.dataset.char) {
    const cd2 = CFG.SHOP.chars.find(x => x.id === btn.dataset.char);
    if (Save.data.ownedChars.includes(cd2.id)) {
      Save.data.char = cd2.id;
      rebuildPlayer();
    } else if (Save.data.coins >= cd2.cost) {
      Save.data.coins -= cd2.cost;
      Save.data.ownedChars.push(cd2.id);
      Save.data.char = cd2.id;
      rebuildPlayer();
      AU.powerup(0);
    } else return brokeFlash(btn);
  } else if (btn.dataset.refill) {
    if (Save.data.coins >= CFG.SHOP.boardRefillCost) {
      Save.data.coins -= CFG.SHOP.boardRefillCost;
      Save.data.boards++;
      AU.coin(3);
    } else return brokeFlash(btn);
  }
  Save.commit();
  renderShop();
});

function brokeFlash(btn) {
  btn.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
    { duration: 240 });
  popup('NOT ENOUGH COINS', '#ff5252', 50, 60);
}

// ---------------------------------------------------------------- settings
function bindSlider(id, valId, key) {
  const el = $(id), lab = valId ? $(valId) : null;
  const set = v => {
    el.value = v;
    if (lab) lab.textContent = v + '%';
    Save.data.settings[key] = v | 0;
  };
  set(Save.data.settings[key]);
  on(el, 'input', () => {
    set(el.value | 0);
    if (key === 'music') { AU.musicVol = Save.data.settings.music / 100; AU.setVolumes(); }
    else { AU.sfxVol = Save.data.settings.sfx / 100; AU.setVolumes(); }
    Save.commit();
  });
  return set;
}
const setMusicUI = bindSlider('sMusic', 'sMusicV', 'music');
const setSfxUI = bindSlider('sSfx', 'sSfxV', 'sfx');

on($('pMusic'), 'input', () => { Save.data.settings.music = $('pMusic').value | 0; AU.musicVol = Save.data.settings.music / 100; AU.setVolumes(); setMusicUI(Save.data.settings.music); Save.commit(); });
on($('pSfx'), 'input', () => { Save.data.settings.sfx = $('pSfx').value | 0; AU.sfxVol = Save.data.settings.sfx / 100; AU.setVolumes(); setSfxUI(Save.data.settings.sfx); Save.commit(); });

$('chkShake').checked = Save.data.settings.shake;
$('chkFlash').checked = Save.data.settings.flash;
on($('chkShake'), 'change', () => { Save.data.settings.shake = $('chkShake').checked; window.__allowShake = Save.data.settings.shake; Save.commit(); });
on($('chkFlash'), 'change', () => { Save.data.settings.flash = $('chkFlash').checked; flashesAllowed = Save.data.settings.flash; Save.commit(); });

function applyQuality(name) {
  const effective = name === 'auto' ? detectQuality() : name;
  const q = CFG.QUALITY[effective];
  if (!q) return;
  Object.assign(quality, q);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioCap));
  renderer.shadowMap.enabled = q.shadows > 0;
  sun.castShadow = q.shadows > 0;
  if (q.shadows > 0) {
    sun.shadow.mapSize.set(q.shadows, q.shadows);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  scene.fog.far = q.drawAhead + 90;
  sky.clouds.forEach(c => { c.visible = q.clouds; });
  if (bloomPass) bloomPass.enabled = q.bloom;
  Save.data.settings.quality = name;
  Save.commit();
}

$('selQuality').value = Save.data.settings.quality;
on($('selQuality'), 'change', () => applyQuality($('selQuality').value));

let wipeArmed = false, wipeTimer = 0;
on($('btnWipe'), 'click', () => {
  if (!wipeArmed) {
    wipeArmed = true;
    $('wipeConfirm').style.display = '';
    wipeTimer = setTimeout(() => { wipeArmed = false; $('wipeConfirm').style.display = 'none'; }, 3000);
  } else {
    clearTimeout(wipeTimer);
    wipeArmed = false;
    $('wipeConfirm').style.display = 'none';
    Save.wipe();
    window.__save = Save;
    genMissions();
    rebuildPlayer();
    player.setBoardColor(boardDef().color);
    setMusicUI(Save.data.settings.music);
    setSfxUI(Save.data.settings.sfx);
    $('chkShake').checked = Save.data.settings.shake;
    $('chkFlash').checked = Save.data.settings.flash;
    $('selQuality').value = Save.data.settings.quality;
    refreshTitleStats();
    syncCoinsUI();
    renderShop();
    popup('PROGRESS RESET', '#ff5252', 50, 50, true);
  }
});

// ---------------------------------------------------------------- nav wiring
on($('btnPlay'), 'click', () => { ensureAudio(); startRun(); });
on($('btnShop'), 'click', () => { AU.ui(); curTab = 'upg'; renderShop(); showScreen('scr-shop'); });
on($('btnHelp'), 'click', () => { AU.ui(); showScreen('scr-help'); Save.data.seenHelp = true; Save.commit(); });
on($('btnSettings'), 'click', () => { AU.ui(); showScreen('scr-settings'); });
on($('btnShopBack'), 'click', () => { AU.ui(); backToTitle(); });
on($('btnSetBack'), 'click', () => { AU.ui(); backToTitle(); });
on($('btnHelpBack'), 'click', () => { AU.ui(); backToTitle(); });

document.querySelectorAll('.tab').forEach(t => on(t, 'click', () => { AU.ui(); curTab = t.dataset.tab; renderShop(); }));

on($('btnResume'), 'click', () => resumeGame());
on($('btnRestartP'), 'click', () => startRun());
on($('btnQuitP'), 'click', () => { bankRun(false); gotoTitle(); });
on($('btnRetry'), 'click', () => startRun());
on($('btnShopO'), 'click', () => { curTab = 'upg'; renderShop(); showScreen('scr-shop'); });
on($('btnMenuO'), 'click', () => gotoTitle());
on($('btnBoard'), 'click', e => { deployBoard(); e.currentTarget.blur(); });
on($('btnPause'), 'click', e => { togglePause(); e.currentTarget.blur(); });

function backToTitle() {
  showScreen('scr-title');
  G.phase = 'title';
  idleT = 0;
  input.enabled = false;
  refreshTitleStats();
  syncCoinsUI();
}

// ---------------------------------------------------------------- audio gate
let audioReady = false;
function ensureAudio() {
  if (audioReady) return;
  AU.musicVol = Save.data.settings.music / 100;
  AU.sfxVol = Save.data.settings.sfx / 100;
  AU.init();
  audioReady = true;
}
on(document, 'pointerdown', ensureAudio);
on(document, 'keydown', ensureAudio);

// ---------------------------------------------------------------- input actions
input.onAction = a => {
  switch (a) {
    case '_pause': togglePause(); return;
    case '_mute': toggleMute(); return;
    case '_enter':
      if (G.phase === 'title') { ensureAudio(); startRun(); }
      else if (G.phase === 'dead' && overShown) startRun();
      return;
    case '_restart':
      if (G.phase === 'run' || G.phase === 'dead' || G.phase === 'paused') startRun();
      return;
  }
  if (G.phase !== 'run') return;
  act(a);
};

function act(a) {
  switch (a) {
    case 'left': if (player.moveLane(-1)) AU.swipe(); break;
    case 'right': if (player.moveLane(1)) AU.swipe(); break;
    case 'jump': if (player.jump()) AU.jump(); break;
    case 'roll': if (player.roll()) AU.slide(); break;
    case 'board': deployBoard(); break;
  }
}

function deployBoard() {
  if (G.phase !== 'run' || G.boardActive > 0 || G.boardsLeft <= 0 || player.flying) return;
  G.boardsLeft--;
  Save.data.boards = Math.max(0, Save.data.boards - 1);
  Save.commit();
  const b = boardDef();
  const dur = b.dur + (Save.data.upg.board || 0) * 1.8;
  G.boardActive = dur;
  player.setBoardColor(b.color);
  AU.boardOn();
  $('btnBoard').classList.add('onboard');
  popup('HOVERBOARD!', '#35e0d2');
  fx.dust(player.pos.x, player.pos.y + 0.1, player.pos.z, 12);
  syncCoinsUI();
}
function endBoard(shattered) {
  if (G.boardActive <= 0) return;
  G.boardActive = 0;
  $('btnBoard').classList.remove('onboard');
  if (!shattered) AU.powerEnd();
}

function toggleMute() {
  G.muted = !G.muted;
  if (AU.master) AU.master.gain.value = G.muted ? 0 : 1;
  popup(G.muted ? 'MUTED' : 'SOUND ON', '#cdbfe8', 50, 64);
}

function togglePause() {
  if (G.phase === 'run') pauseGame();
  else if (G.phase === 'paused') resumeGame();
}
function pauseGame() {
  if (G.phase !== 'run') return;
  G.phase = 'paused';
  AU.suspend();
  pauseMusicSet(Save.data.settings.music);
  pauseSfxSet(Save.data.settings.sfx);
  showScreen('scr-pause');
}
function resumeGame() {
  if (G.phase !== 'paused') return;
  G.phase = 'run';
  AU.resume();
  showScreen();
  clock.getDelta();
}
const pauseMusicSet = v => { $('pMusic').value = v; };
const pauseSfxSet = v => { $('pSfx').value = v; };

// ---------------------------------------------------------------- run lifecycle
function softResetWorld() {
  world.reset();
  trains.reset();
  obstacles.reset();
  collectibles.clearRunItems();
  player.reset();
  powerups.reset();
  endBoard(false);
  wardenGrab = false;
  deadT = 0; overShown = false;
  turboT = 0; turboLvl = 0;
  nearMissCd = 0;
  lastCoinT = -9;
  dynColliders = [];
  $('errOverlay').classList.add('hidden');
}

function startRun() {
  ensureAudio();
  softResetWorld();
  resetRunState(Save.data);
  G.multRank = Save.data.rank;
  G.boardsLeft = Save.data.boards;
  turboLvl = Save.data.upg.turbo || 0;
  turboT = turboLvl > 0 ? 2.4 : 0;
  chaserDist = CFG.CHASER.INTRO;
  for (const s of Save.data.missions) {
    if (PER_RUN_IDS.has(s.id)) { s.prog = 0; s.done = false; }
  }
  world.ensureAhead(0);
  renderMissionsHUD(true);
  HUD.syncPowerups();
  syncCoinsUI();
  refreshTitleStats();
  cameraSnapBehindPlayer();
  showScreen();
  $('hud').classList.remove('hidden');
  $('countdown').classList.remove('hidden');
  G.phase = 'countdown';
  cdT = 3.4; cdShown = -1;
  input.enabled = false;
  if ('ontouchstart' in window) $('hintTouch').classList.remove('hidden');
  else $('hintTouch').classList.add('hidden');
}

function cameraSnapBehindPlayer() {
  camera.position.set(player.pos.x * 0.55, player.pos.y * 0.5 + 4.7, player.pos.z + 9.2);
  camera.lookAt(player.pos.x * 0.8, player.pos.y * 0.62 + 1.5, player.pos.z - 11);
  camLook.set(player.pos.x * 0.8, player.pos.y * 0.62 + 1.5, player.pos.z - 11);
}

bus.on('death', cause => {
  if (G.phase !== 'run') return;
  G.phase = 'dead';
  deadT = 0;
  overShown = false;
  input.enabled = false;
  endBoard(true);
  if (cause === 'fall') { AU.slide(); AU.crash(false); }
  else AU.crash(cause !== 'warden');
  if (cause === 'warden') { wardenGrab = true; AU.whistle(); }
  fx.shake(cause === 'fall' ? 0.25 : 0.8, 0.5);
  flash(cause === 'fall' ? '#203050' : '#ff3040', cause === 'fall' ? 0.3 : 0.5, 0.7);
  fx.sparks(player.pos.x, player.pos.y + 1, player.pos.z, 22);
});

bus.on('stumble', () => {
  AU.stumble();
  fx.dust(player.pos.x, player.pos.y + 0.4, player.pos.z, 14);
  fx.shake(0.4, 0.32);
  flash('#ffb020', 0.18, 0.4);
  popup('!', '#ffb020', 50, 52, true);
});
bus.on('shieldBreak', () => {
  AU.shatter();
  fx.emit(player.pos.x, player.pos.y + 1, player.pos.z, 26, 0x63b8ff, { spread: 5, up: 3, life: 0.7 });
  flash('#63b8ff', 0.25, 0.5);
  HUD.syncPowerups();
});
bus.on('boardShatter', () => {
  AU.shatter();
  fx.sparks(player.pos.x, player.pos.y + 0.3, player.pos.z, 20);
  fx.shake(0.5, 0.4);
  $('btnBoard').classList.remove('onboard');
});
bus.on('land', ({ hard }) => AU.land(hard));

function bankRun(showOver) {
  const d = Save.data;
  d.coins += G.runCoins | 0;
  d.gems += G.runGems | 0;
  d.totals.runs++;
  d.totals.distance += Math.floor(G.dist);
  d.totals.coins += G.runCoins | 0;
  d.totals.jumps += G.stats.jumps;
  const score = Math.floor(G.score);
  if (score > d.best) d.best = score;
  if (Math.floor(G.dist) > d.bestDist) d.bestDist = Math.floor(G.dist);
  Save.commit();
  syncCoinsUI();
  return score;
}

function showGameOver() {
  overShown = true;
  const score = bankRun(true);
  $('overCause').textContent =
    player.deathCause === 'warden' ? 'BUSTED!' :
    player.deathCause === 'fall' ? 'GONE!' : 'WIPEOUT!';
  $('overNewBest').classList.toggle('hidden', !(score === Save.data.best && score > 0));
  $('overScore').textContent = fmt(score);
  $('ovDist').textContent = fmtDist(Math.floor(G.dist));
  $('ovCoins').textContent = fmt(G.runCoins | 0);
  $('ovBest').textContent = fmt(Save.data.best | 0);
  const box = $('ovMissions');
  box.innerHTML = '';
  for (const s of Save.data.missions) {
    const wrap = document.createElement('div');
    wrap.innerHTML = missionChipHTML(s);
    box.appendChild(wrap.firstElementChild);
  }
  showScreen('scr-over');
}

function gotoTitle() {
  softResetWorld();
  G.phase = 'title';
  idleT = 0;
  input.enabled = false;
  $('hud').classList.add('hidden');
  $('countdown').classList.add('hidden');
  $('hintTouch').classList.add('hidden');
  showScreen('scr-title');
  refreshTitleStats();
  syncCoinsUI();
  AU.resume();
}

// ---------------------------------------------------------------- collect hooks
const collectHooks = {
  magnetRadius: () => powerups.magnetRadius(),
  onCollect(it) {
    const mult = totalMult();
    if (it.kind === 'coin') {
      let v = CFG.SCORE.COIN;
      if (G.boardActive > 0 && boardDef().perk === 'coins') v *= 1.1;
      if (charDef().perk === 'coins') v *= 1.05;
      G.runCoins++;
      G.score += v * mult;
      progressMission('coins_run', 1);
      progressMission('coins_total', 1);
      AU.coin(0);
      fx.burstCoin(it.x, it.y, it.z);
      chainCombo();
    } else if (it.kind === 'gem') {
      G.runGems++;
      G.score += CFG.SCORE.GEM * mult;
      progressMission('gems', 1);
      AU.gem();
      fx.burstGem(it.x, it.y, it.z);
      popup(`+${fmt((CFG.SCORE.GEM * mult) | 0)} GEM!`, '#54e8c8', 50, 38);
    } else if (it.kind === 'box') {
      openMysteryBox(it);
    } else if (it.kind === 'pu') {
      grabPowerup(it);
    }
  },
};

function chainCombo() {
  const t = performance.now() / 1000;
  G.combo.n = (t - lastCoinT <= 0.95) ? G.combo.n + 1 : 1;
  lastCoinT = t;
  G.combo.t = 1.1;
  if (G.combo.n > G.stats.maxCombo) G.stats.maxCombo = G.combo.n;
  if (G.combo.n >= 8) {
    const el = $('hudCombo');
    el.classList.remove('hidden');
    el.textContent = `COMBO ×${G.combo.n}`;
  }
  if (G.combo.n % CFG.SCORE.COMBO_STEP === 0) {
    const bonus = 300 * totalMult();
    G.score += bonus;
    popup(`COMBO ×${G.combo.n}  +${fmt(bonus)}`, '#ffd36b', 50, 34, true);
    fx.confetti(player.pos.x, player.pos.y + 1.6, player.pos.z);
  }
}

function openMysteryBox(it) {
  G.stats.boxes++;
  progressMission('boxes', 1);
  AU.powerup((Math.random() * 2) | 0);
  fx.confetti(it.x, it.y, it.z);
  const r = Math.random();
  if (r < 0.58) {
    const amt = Math.floor(randRange(80, 220) * baseMult());
    G.runCoins += amt;
    G.score += amt * CFG.SCORE.COIN * 0.4;
    popup(`+${amt} COINS!`, '#ffd36b', 50, 40, true);
  } else if (r < 0.88) {
    activatePU(choice(['magnet', 'jetpack', 'x2', 'sneakers', 'shield']), null);
  } else {
    G.runGems++;
    G.score += CFG.SCORE.GEM * totalMult();
    progressMission('gems', 1);
    popup('GEM PRIZE!', '#54e8c8', 50, 40, true);
  }
}

function grabPowerup(it) {
  G.stats.powerups++;
  progressMission('powerups', 1);
  activatePU(it.data.kind, it);
}

function activatePU(kind, it) {
  powerups.activate(kind);
  AU.powerup(kind === 'jetpack' ? 1 : 0);
  const names = {
    magnet: 'COIN MAGNET!', jetpack: 'JETPACK!', x2: 'SCORE ×2!',
    sneakers: 'SUPER SNEAKERS!', shield: 'SHIELD UP!',
  };
  popup(names[kind] || kind.toUpperCase(), '#35e0d2', 50, 40, true);
  flash('#35e0d2', 0.16, 0.5);
  HUD.syncPowerups();
  if (it) fx.emit(it.x, it.y, it.z, 16, 0x35e0d2, { spread: 3, up: 2.4, life: 0.6 });
}

// ---------------------------------------------------------------- collisions
function gatherColliders(pz) {
  const out = [];
  for (const c of world.chunksInRange(pz + 9, pz - 9)) {
    for (const col of c.colliders) out.push(col);
  }
  for (const col of trains.dynColliders) out.push(col);
  return out;
}

function checkCollisions(dt, eff) {
  const p = player;
  if (G.invuln > 0 || G.godMode || p.state === 'dead' || G.phase !== 'run') return;
  const px = p.pos.x, py = p.pos.y, pz = p.pos.z;
  const pHalfW = CFG.PHYS.PLAYER_W / 2;
  // swept-Z: widen the window to cover ground travelled this frame (low-FPS tunneling guard)
  const zPad = Math.max(0.38, eff * dt * 0.75);
  const descendingFromSky = p.vy < 0 && py > 3.0 && !p.flying;
  for (const col of gatherColliders(pz)) {
    if (col.passed) continue;
    if (Math.abs(pz - col.z) > col.hd + zPad) continue;
    const cBot = col.y - col.hh, cTop = col.y + col.hh;
    const tol = (col.type === 'train' || col.type === 'moving') ? 0.34
      : col.type === 'jump' ? 0.24 : 0.06;
    if (py >= cTop - tol) continue;
    if (py + p.height <= cBot + 0.02) continue;
    if (descendingFromSky && (col.type === 'train' || col.type === 'moving')) continue;
    if (p.flying) continue;

    col.passed = true;
    if (col.severity === 'stumble') {
      const res = p.stumble();
      if (res === 'caught') p.die('warden');
      // 'stumble' | 'shield' | board-break surface via bus events
    } else {
      if (col.ref) col.ref.hitPlayer = true;
      p.die('hit');
    }
    if (p.state === 'dead' || G.phase !== 'run') return;
  }
}

function sweepNearMisses(pz) {
  const px = player.pos.x, py = player.pos.y;
  const pHalfW = CFG.PHYS.PLAYER_W / 2;
  for (const col of gatherColliders(pz)) {
    if (col.passed) continue;
    if (col.type === 'moving') continue;   // dynamic colliders own their lifecycle
    if (pz - col.z <= col.hd + 0.6) continue;          // not fully passed yet
    if (pz - col.z > 40) { col.passed = true; continue; }  // long gone: retire silently
    col.passed = true;
    const big = col.type === 'blocker' ||
      (col.type === 'train' && py < col.y + col.hh - 1);
    if (!big || G.invuln > 0 || player.state === 'dead') continue;
    const gap = Math.abs(px - col.x) - (col.hw + pHalfW);
    if (gap >= -0.05 && gap < 0.65) awardNearMiss(col);
  }
}

function awardNearMiss(col) {
  if (nearMissCd > 0) return;
  nearMissCd = 0.4;
  G.stats.nearMiss++;
  progressMission('nearmiss', 1);
  let pts = CFG.SCORE.NEAR_MISS * totalMult();
  if (charDef().perk === 'nearmiss') pts *= 1.15;
  G.score += pts;
  popup('NEAR MISS', '#7dffa8', 50, 47);
  AU.swipe();
  fx.emit(col.x, player.pos.y + 1, col.z + col.hd, 6, 0x7dffa8, { spread: 1.5, up: 1.5, life: 0.35, size: 0.12 });
}

// ---------------------------------------------------------------- per-frame systems
function updateChaser(dt) {
  const heat = G.stumbleHeat > 0;
  const target = heat ? CFG.CHASER.THREAT : CFG.CHASER.LURK;
  let lambda = heat ? 2.4 : 0.55;
  if (!heat && G.tRun < CFG.CHASER.EASE_BACK_T) lambda = 0.9;
  if (wardenGrab) { chaserDist = damp(chaserDist, 1.15, 6, dt); }
  else chaserDist = damp(chaserDist, target, lambda, dt);
  window.__chaserDist = chaserDist;

  const w = warden.g;
  const show = (G.phase === 'run' || (G.phase === 'dead' && wardenGrab)) && chaserDist < 32;
  w.visible = show;
  if (!show) return;
  w.position.x = damp(w.position.x, player.pos.x * 0.92, 3.2, dt);
  w.position.z = player.pos.z + chaserDist;
  w.position.y = 0;
  const t = performance.now() * 0.001;
  const swing = Math.sin(t * 13) * 0.85;
  warden.limbs.legL.rotation.x = swing;
  warden.limbs.legR.rotation.x = -swing;
  if (wardenGrab) {
    w.rotation.x = damp(w.rotation.x, 0.42, 8, dt);
    warden.limbs.armL.rotation.x = damp(warden.limbs.armL.rotation.x, -2.4, 10, dt);
    warden.limbs.armR.rotation.x = damp(warden.limbs.armR.rotation.x, -2.4, 10, dt);
  } else {
    w.rotation.x = damp(w.rotation.x, 0.12, 6, dt);
    warden.limbs.armL.rotation.x = -swing * 0.8;
    warden.limbs.armR.rotation.x = swing * 0.8;
  }
}

const _v1 = new THREE.Vector3();
const camLook = new THREE.Vector3(0, 2, -10);

function updateCamera(dt) {
  const p = player;
  const speedNorm = clamp((G.speed - CFG.SPEED.START) / CFG.SPEED.RAMP_SPAN, 0, 1);

  if (G.phase === 'title') {
    idleT += dt;
    const a = idleT * 0.11;
    const cx = Math.sin(a) * 24, cz = Math.cos(a) * 24 + 4;
    camera.position.x = damp(camera.position.x, cx, 2, dt);
    camera.position.y = damp(camera.position.y, 7.5 + Math.sin(a * 0.7) * 1.6, 2, dt);
    camera.position.z = damp(camera.position.z, cz, 2, dt);
    camera.lookAt(0, 2.2, -8);
    camera.fov = damp(camera.fov, 58, 2, dt);
    camera.updateProjectionMatrix();
    return;
  }

  let tx = p.pos.x * 0.55, ty = p.pos.y * 0.5 + 4.7, tz = p.pos.z + 9.2;
  let lx = p.pos.x * 0.8, ly = p.pos.y * 0.62 + 1.5, lz = p.pos.z - 11;
  if (G.fx.jetpack > 0) { ty += 1.1; ly += 1.2; }
  if (G.phase === 'dead') {
    ty += 1.6; tz += 2.2;
    lx = p.pos.x; ly = p.pos.y + 1; lz = p.pos.z;
  }

  const zLambda = G.phase === 'dead' ? 2.2 : 11;
  camera.position.x = damp(camera.position.x, tx, 7, dt);
  camera.position.y = damp(camera.position.y, ty, 6, dt);
  camera.position.z = damp(camera.position.z, tz, zLambda, dt);

  const [shx, shy] = fx.getShake();
  camera.position.x += shx;
  camera.position.y += shy;

  camLook.lerp(_v1.set(lx, ly, lz), 1 - Math.exp(-(G.phase === 'dead' ? 3 : 9) * dt));
  camera.lookAt(camLook);

  const fovT = 62 + speedNorm * 13 + (turboT > 0 ? 3 : 0);
  if (Math.abs(camera.fov - fovT) > 0.05) {
    camera.fov = damp(camera.fov, fovT, 4, dt);
    camera.updateProjectionMatrix();
  }
}

function updateSun() {
  const px = player.pos.x, pz = player.pos.z;
  sun.position.set(px + 20, 30, pz - 18);
  sun.target.position.set(px, 0, pz - 24);
  sun.target.updateMatrixWorld();
}

const BIOME_TINT = {
  downtown: 0xe98a63, oldtown: 0xd97a6e, industrial: 0xc06a52, greenway: 0x8fae72,
};
const _c1 = new THREE.Color();
function updateBiome(dt) {
  biomeT -= dt;
  if (biomeT > 0) return;
  biomeT = 0.5;
  const b = world.biomeAt(player.pos.z);
  const target = BIOME_TINT[b] || CFG.PALETTE.fogBase;
  scene.fog.color.lerp(_c1.setHex(target), 0.08);
  sky.setBiomeTint(target);
}

function updateSpeedAndScore(dt) {
  const ramp = Math.pow(clamp(G.dist / CFG.SPEED.RAMP_DIST, 0, 1), CFG.SPEED.RAMP_POW);
  G.speed = Math.min(CFG.SPEED.MAX, CFG.SPEED.START + CFG.SPEED.RAMP_SPAN * ramp);
  let eff = G.speed;
  if (player.stumbleT > 0) eff *= CFG.PHYS.STUMBLE_SLOW;
  if (turboT > 0) {
    eff += turboLvl * 4 * (turboT / 2.4);
    turboT -= dt;
  }
  player.pos.z -= eff * dt;
  G.tRun += dt;
  G.dist = -player.pos.z;
  G.score += eff * dt * baseMult() * (G.fx.x2 > 0 ? 2 : 1);
  G.displayScore = damp(G.displayScore, G.score, 8, dt);
  return eff;
}

function checkContinuous(slot) {
  if (slot.prog >= slot.goal) {
    slot.done = true; slot.prog = slot.goal;
    popup('MISSION DONE!', '#7dffa8', 50, 36);
    AU.gem();
    if (Save.data.missions.every(s => s.done)) rankUp();
    renderMissionsHUD(true);
  }
}

function updateTimers(dt, eff) {
  if (G.invuln > 0) G.invuln -= dt;
  if (G.stumbleHeat > 0) G.stumbleHeat -= dt;
  if (nearMissCd > 0) nearMissCd -= dt;
  if (G.combo.t > 0) {
    G.combo.t -= dt;
    if (G.combo.t <= 0) {
      G.combo.n = 0;
      $('hudCombo').classList.add('hidden');
    }
  }
  if (G.boardActive > 0) {
    G.boardActive -= dt;
    if (Math.random() < 0.75) fx.boardTrail(player.pos.x, player.pos.y + 0.15, player.pos.z + 0.3);
    if (G.boardActive <= 0) endBoard(false);
  }
  if (player.grounded && player.pos.y > 2.6) {
    const dm = eff * dt;
    G.stats.roofMeters += dm;
    progressMission('roof_meters', dm);
  }
  for (const s of Save.data.missions) {
    if (s.done) continue;
    if (s.id === 'dist_run') { s.prog = G.dist; checkContinuous(s); }
    else if (s.id === 'score_run') { s.prog = G.score; checkContinuous(s); }
  }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();

function step(dt) {
  const phase = G.phase;

  if (phase === 'title') {
    world.update(dt, 0);
    sky.update(dt, camera.position);
    fx.update(dt, camera.position.z);
    updateCamera(dt);
    updateSun();
    return;
  }

  if (phase === 'countdown') {
    cdT -= dt;
    const n = Math.min(3, Math.ceil(cdT));
    if (n !== cdShown && n > 0) {
      cdShown = n;
      $('countdown').innerHTML = `<span>${n}</span>`;
      AU.countGo(false);
    }
    if (cdT <= 0) {
      $('countdown').innerHTML = `<span style="color:#35e0d2">GO!</span>`;
      if (cdShown !== 0) AU.countGo(true);
      cdShown = 0;
      G.phase = 'run';
      input.enabled = true;
      AU.startAmbience();
      goT = 0.6;
      clock.getDelta();
    }
    world.update(dt, player.pos.z);
    player.update(dt, 0, world, fx, AU);
    updateCamera(dt);
    updateSun();
    sky.update(dt, camera.position);
    fx.update(dt, camera.position.z);
    updateChaser(dt);
    return;
  }

  if (phase === 'paused') return;

  if (phase === 'dead') {
    deadT += dt;
    player.update(dt, 0, world, fx, AU);
    trains.update(dt, player.pos.z, null);
    world.update(dt, player.pos.z);
    sky.update(dt, camera.position);
    fx.update(dt, camera.position.z);
    updateChaser(dt);
    updateCamera(dt);
    updateSun();
    if (deadT > 1.45 && !overShown) showGameOver();
    return;
  }

  // ---------------- running ----------------
  if (goT > 0) {
    goT -= dt;
    if (goT <= 0) $('countdown').classList.add('hidden');
  }
  const eff = updateSpeedAndScore(dt);
  world.ensureAhead(player.pos.z);
  world.recycleBehind(player.pos.z);

  trains.update(dt, player.pos.z, {
    onTrainHorn: () => { AU.horn(); popup('TRAIN!', '#ff5252', 50, 26, true); },
    onTrainDodged: () => {
      G.stats.trainsDodged++;
      progressMission('trains_dodged', 1);
    },
  });

  player.update(dt, eff, world, fx, AU);

  checkCollisions(dt, eff);
  if (G.phase === 'run') sweepNearMisses(player.pos.z);

  if (G.phase === 'run') collectibles.update(dt, player, collectHooks);
  powerups.update(dt);
  updateTimers(dt, eff);

  updateBiome(dt);
  world.update(dt, player.pos.z);
  sky.update(dt, camera.position);
  fx.update(dt, camera.position.z);
  updateChaser(dt);
  updateCamera(dt);
  updateSun();

  const speedNorm = clamp((G.speed - CFG.SPEED.START) / CFG.SPEED.RAMP_SPAN, 0, 1);
  window.__speedNorm = speedNorm;
  AU.setMusicIntensity(speedNorm);
  AU.setRumble(speedNorm * 0.09 + (world.tunnelActive ? 0.06 : 0));
  $('vignette').classList.toggle('speed', speedNorm > 0.5);

  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.12;
    $('hudScore').textContent = fmt(Math.floor(G.displayScore));
    const tm = totalMult();
    const badge = $('hudMult');
    badge.classList.toggle('hidden', tm <= 1);
    badge.textContent = `x${tm}`;
    syncCoinsUI();
    renderMissionsHUD(false);
  }
}

function render() {
  if (composer && quality.bloom && bloomPass.enabled) composer.render();
  else renderer.render(scene, camera);
}

function loopFrame() {
  requestAnimationFrame(loopFrame);
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  render();
}

// ---------------------------------------------------------------- resize / lifecycle
on(window, 'resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
});

on(document, 'visibilitychange', () => {
  if (document.hidden && G.phase === 'run') pauseGame();
  if (document.hidden) Save.commit();
});
on(window, 'beforeunload', () => Save.commit());

// ---------------------------------------------------------------- boot
async function boot() {
  $('verTag').textContent = `HYPERLINE v${CFG.VERSION}`;
  const tips = ['Warming up the rails…', 'Painting the sunset…', 'Polishing coins…',
    'Releasing the wardens…', 'Greasing the ramps…'];
  let tipI = 0;
  const tipTimer = setInterval(() => {
    $('loadTip').textContent = tips[++tipI % tips.length];
  }, 700);

  const steps = [
    () => world.ensureAhead(0),
    () => collectibles.prewarm(60),
    () => world.ensureAhead(0),
  ];
  for (let i = 0; i < steps.length; i++) {
    steps[i]();
    $('loadFill').style.width = `${((i + 1) / steps.length) * 100}%`;
    await new Promise(r => setTimeout(r, 60));
  }
  clearInterval(tipTimer);

  refreshTitleStats();
  syncCoinsUI();
  renderMissionsHUD(true);
  showScreen('scr-title');
  G.phase = 'title';
  cameraSnapBehindPlayer();
  clock.getDelta();
  loopFrame();
}

boot();

// E2E / debugging surface
window.__game = {
  G, player, world, trains, obstacles, collectibles, powerups,
  startRun, gotoTitle, deployBoard, version: CFG.VERSION,
};
