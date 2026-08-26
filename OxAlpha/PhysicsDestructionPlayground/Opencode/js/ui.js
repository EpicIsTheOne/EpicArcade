import { G } from './state.js';

const TOOLS = [
  ['grab', 'GRAB', '1', 'Grab / throw'],
  ['launch', 'FIRE', '2', 'Projectile launcher'],
  ['blast', 'BLAST', '3', 'Explosive impulse'],
  ['pull', 'PULL', '4', 'Gravity pull'],
  ['push', 'PUSH', '5', 'Force push'],
  ['freeze', 'FREEZE', '6', 'Freeze / unfreeze'],
  ['spawn', 'SPAWN', '7', 'Spawn prop'],
  ['clone', 'CLONE', '8', 'Duplicate object'],
  ['del', 'DELETE', '9', 'Delete object'],
  ['ball', 'BALL', '0', 'Wrecking ball rig'],
];

const SPAWNS = ['crate', 'plank', 'ball', 'barrel', 'anvil'];

const el = {};
let helpOpen = false;
let toastTimer = null;

function buildToolbar(cb) {
  const bar = el.toolbar;
  for (const [id, label, key, title] of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = id;
    b.title = `${title} (${key})`;
    b.innerHTML = `<span class="k">${key}</span>${label}`;
    b.addEventListener('click', () => cb.selectTool(id));
    bar.appendChild(b);
  }
}

function buildSpawnMenu(cb) {
  const menu = el.spawnmenu;
  menu.classList.add('panel');
  for (const kind of SPAWNS) {
    const b = document.createElement('button');
    b.dataset.kind = kind;
    b.textContent = kind.toUpperCase();
    b.title = `Spawn ${kind}`;
    b.addEventListener('click', () => {
      G.spawnKind = kind;
      refreshSpawnMenu();
      cb.selectTool('spawn');
    });
    menu.appendChild(b);
  }
}

function refreshSpawnMenu() {
  for (const b of el.spawnmenu.children) {
    b.style.background = b.dataset.kind === G.spawnKind ? '#ffb347' : '';
    b.style.color = b.dataset.kind === G.spawnKind ? '#1a130a' : '';
    b.style.fontWeight = b.dataset.kind === G.spawnKind ? '700' : '';
  }
}

export function initUI(cb) {
  el.toolbar = document.getElementById('toolbar');
  el.spawnmenu = document.getElementById('spawnmenu');
  el.fps = document.getElementById('stat-fps');
  el.bodies = document.getElementById('stat-bodies');
  el.toolStat = document.getElementById('stat-tool');
  el.toast = document.getElementById('toast');
  el.help = document.getElementById('help');
  el.slowBtn = document.getElementById('btn-slow');
  el.soundBtn = document.getElementById('btn-sound');

  buildToolbar(cb);
  buildSpawnMenu(cb);

  el.slowBtn.addEventListener('click', () => cb.toggleSlow());
  document.getElementById('btn-reset').addEventListener('click', () => cb.reset());
  el.soundBtn.addEventListener('click', () => cb.toggleSound());
  document.getElementById('btn-help').addEventListener('click', () => toggleHelp());
  document.getElementById('btn-closehelp').addEventListener('click', () => toggleHelp(false));

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (helpOpen) {
      if (e.code === 'Escape' || e.code === 'KeyH') toggleHelp(false);
      return;
    }
    const digitMap = {
      Digit1: 'grab', Digit2: 'launch', Digit3: 'blast', Digit4: 'pull',
      Digit5: 'push', Digit6: 'freeze', Digit7: 'spawn', Digit8: 'clone',
      Digit9: 'del', Digit0: 'ball',
    };
    if (digitMap[e.code]) {
      cb.selectTool(digitMap[e.code]);
    } else if (e.code === 'Space') {
      e.preventDefault();
      cb.toggleSlow();
    } else if (e.code === 'KeyR') {
      cb.reset();
    } else if (e.code === 'KeyH') {
      toggleHelp(true);
    } else if (e.code === 'KeyM') {
      cb.toggleSound();
    }
  });

  setTool(G.tool);
  refreshSpawnMenu();
}

export function setTool(id) {
  G.tool = id;
  for (const b of el.toolbar.children) {
    b.classList.toggle('active', b.dataset.tool === id);
  }
  el.toolStat.textContent = id.toUpperCase();
  el.spawnmenu.classList.toggle('hidden', id !== 'spawn');
  refreshSpawnMenu();
}

export function setSlow(on) {
  el.slowBtn.classList.toggle('on', on);
  el.slowBtn.textContent = on ? 'SLOW-MO ON' : 'SLOW-MO';
}

export function setSound(on) {
  el.soundBtn.textContent = on ? 'SOUND ON' : 'MUTED';
}

export function toggleHelp(force) {
  helpOpen = force !== undefined ? force : !helpOpen;
  el.help.classList.toggle('hidden', !helpOpen);
}

export function toast(msg, dur = 3200) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  el.toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.style.opacity = '0';
    setTimeout(() => el.toast.classList.add('hidden'), 550);
  }, dur);
}

export function updateStats(fps, bodies) {
  el.fps.textContent = `${fps.toFixed(0)} FPS`;
  el.bodies.textContent = `${bodies} BODIES`;
}
