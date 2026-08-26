// VOLT RUNNER — main bootstrap, wiring, game loop, QA test hooks.
import * as THREE from 'three';
import { Renderer3D } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { AudioEngine } from './engine/audio.js';
import { Director } from './game/director.js';
import { UI, setLevelCount } from './ui/ui.js';
import { LEVEL_METAS } from './levels/index.js';

const canvas = document.getElementById('gl');
setLevelCount(LEVEL_METAS.length);

// URL params (QA/headless): ?gfx=low&level=1
const QP = new URLSearchParams(location.search);
const qpGfx = QP.get('gfx');

const opts = JSON.parse(localStorage.getItem('voltrunner_opts') || '{}');
const startQual = ['ultra', 'high', 'medium', 'low'].includes(qpGfx) ? qpGfx : (opts.quality ?? 'ultra');
const r3 = new Renderer3D(canvas, startQual);
const input = new Input(canvas);
const audio = new AudioEngine();
audio.setVolumes((opts.music ?? 55) / 100, (opts.sfx ?? 80) / 100);

const hooks = {
  audio,
  state: () => director.state,
  play: (i) => startLevel(i),
  resume: () => { director.resume(); canvas.requestPointerLock?.(); },
  restart: () => startLevel(director.levelIndex),
  quit: () => { director.setState('title'); },
  next: () => startLevel(Math.min(LEVEL_METAS.length - 1, director.levelIndex + 1)),
  applyOptions: (o) => {
    if (o.quality !== r3.qualityName && QUALS.includes(o.quality)) r3.setQuality(o.quality);
    input.invertX = !!o.invx; input.invertY = !!o.invy;
    if (window.__rig) { window.__rig.invertX = !!o.invx; window.__rig.invertY = !!o.invy; }
    audio.setVolumes((o.music ?? 55) / 100, (o.sfx ?? 80) / 100);
  },
};
const QUALS = ['ultra', 'high', 'medium', 'low'];

const ui = new UI(hooks);
const director = new Director({ renderer3d: r3, input, audio, ui });
ui.buildLevelCards(LEVEL_METAS, director.save, (i) => startLevel(i));
hooks.ui = ui;
director.setState('title');

// ---------- wiring ----------
input.onQuickStep = (side) => {
  if (director.state === 'playing') director.player.quickStep(side, director.cameraRig.yaw);
};
input.onLockChange = (locked) => {
  if (!locked && director.state === 'playing') director.pause();
  document.getElementById('lock-hint').classList.toggle('hidden', locked || director.state !== 'playing');
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && director.state === 'paused') { /* browser already released lock */ }
});
canvas.addEventListener('mousedown', () => {
  if (director.state === 'playing') audio.init();
});

// player events
function wirePlayer() {
  const p = director.player;
  if (p._wired) return;               // player persists across levels — never double-wire
  p._wired = true;
  p.on('volt', () => { director.voltsGot++; audio.collect(director.voltsGot % 12); });
  p.on('gem', (e) => {
    director.gemsGot++;
    const idx = director.level.gems.findIndex(g => g.pos.equals(e.pos));
    ui.gemGot(idx < 0 ? director.gemsGot - 1 : idx);
    ui.toast('◆ GEM FOUND!');
    director.shake(.15);
  });
  p.on('enemy', (e) => { ui.combo(e.combo); director.comboBest = Math.max(director.comboBest, e.combo); director.shake(.08); });
  p.on('hurt', () => { director.damageTaken++; director.shake(.4); ui.toast('OUCH!'); });
  p.on('checkpoint', (e) => { ui.toast(`CHECKPOINT ${e.idx}`); });
  p.on('spring', () => { director.shake(.06); });
  p.on('dash', () => { director.shake(.1); });
  p.on('goal', () => director.onGoal());
  p.on('die', () => {
    director.deaths++;
    ui.toast('RESPAWNING…', 2.5);
    setTimeout(() => { if (director.state === 'playing') director.player.respawn(); }, 900);
  });
}

async function startLevel(i) {
  audio.init();
  wirePlayer();
  await director.loadLevel(i);
  // don't force pointer lock without gesture; show hint
}

// ---------- loop ----------
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);

  if (director.state === 'playing' && input.hit('respawn')) {
    director.player.respawn(); ui.toast('RESPAWN');
  }
  director.update(dt);
  r3.render();
  input.endFrame();
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  r3.camera.aspect = innerWidth / innerHeight;
  r3.camera.updateProjectionMatrix();
  r3.renderer.setSize(innerWidth, innerHeight);
  r3.composer?.setSize(innerWidth, innerHeight);
});

// QA: optional deep-link straight into a zone
if (QP.has('level')) {
  const li = Math.max(0, Math.min(LEVEL_METAS.length - 1, parseInt(QP.get('level'), 10) || 0));
  setTimeout(() => { startLevel(li); }, 60);
}

// ---------- QA test hooks ----------
window.__volt = {
  ready: true,
  version: '1.0',
  state: () => director.state,
  levels: LEVEL_METAS.map(m => ({ name: m.name })),
  startLevel: (i) => startLevel(i),
  player: director.player,
  director: () => director,
  stats: () => {
    const p = director.player;
    return {
      state: director.state,
      pos: p.pos.toArray().map(x => +x.toFixed(2)),
      vel: p.vel.toArray().map(x => +x.toFixed(2)),
      speed: +p.vel.length().toFixed(2),
      hspeed: +Math.hypot(p.vel.x, p.vel.z).toFixed(2),
      grounded: p.grounded, grinding: !!p.grind, wallrun: p.state === 'wallrun',
      hp: p.hp, boost: +p.boost.toFixed(1), dead: p.dead, attacking: p.attacking,
      volts: director.voltsGot, totalVolts: director.level?.volts.length ?? 0,
      gems: director.gemsGot, time: +director.time.toFixed(2),
      maxSpeed: +p.maxSpeedSeen.toFixed(2),
      levelIndex: director.levelIndex, level: director.level?.name,
      enemiesDestroyed: director.enemies.destroyedCount(),
    };
  },
  input,
  camYaw: () => director.cameraRig.yaw,
  warpTo: (x, y, z) => { director.player.pos.set(x, y, z); director.player.vel.set(0, 0, 0); },
  press: (code, ms = 120) => {
    input.keys[code] = true;
    input.pressed[code] = true;   // register as a this-frame press (jump/attack/stomp)
    setTimeout(() => { input.keys[code] = false; }, ms);
  },
  holdKey: (code, down) => { input.keys[code] = !!down; },
  lookYaw: (y) => { director.cameraRig.yaw = y; director.cameraRig.mouseIdle = 0; },
  finish: () => { if (director.state === 'playing') director.onGoal(); },
  results: () => director.lastResults,
};
window.__gameReady = true;

// expose rig for options
window.__rig = director.cameraRig;
