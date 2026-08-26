import * as THREE from 'three';
import { CFG } from './config.js';
import { S } from './state.js';
import { mulberry32, rand, clamp } from './utils.js';

const PHASES = [
  { wait: 46, shrink: 62, rFrac: 0.60, dps: 1 },
  { wait: 38, shrink: 52, rFrac: 0.42, dps: 2 },
  { wait: 32, shrink: 44, rFrac: 0.28, dps: 4 },
  { wait: 28, shrink: 38, rFrac: 0.17, dps: 6 },
  { wait: 22, shrink: 32, rFrac: 0.09, dps: 8 },
  { wait: 18, shrink: 26, rFrac: 0.035, dps: 10 },
  { wait: 14, shrink: 24, rFrac: 0.002, dps: 12 },
];

let rng = mulberry32(CFG.SEED + 31);
let wallMesh = null;
let sceneRef = null;

export function initStorm(scene) {
  sceneRef = scene;
  const geo = new THREE.CylinderGeometry(1, 1, 320, 64, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: CFG.COLORS.storm,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  wallMesh = new THREE.Mesh(geo, mat);
  wallMesh.position.y = 140;
  wallMesh.renderOrder = 4;
  scene.add(wallMesh);

  const c = pickStartCircle();
  S.storm = {
    phase: -1,
    mode: 'wait',
    timer: PHASES[0].wait,
    cur: { cx: c.x, cz: c.z, r: CFG.ISLAND_R * 1.08 },
    target: null,
    nextPreview: null,
    dps: 1,
    shrinkFrom: null,
    totalPhases: PHASES.length,
  };
  computeNextTarget();
  updateWallVisual(0);
}

function pickStartCircle() {
  const ang = rng() * Math.PI * 2;
  const d = rng() * 110;
  return { x: Math.cos(ang) * d, z: Math.sin(ang) * d };
}

function computeNextTarget() {
  const st = S.storm;
  const nextPhase = PHASES[Math.min(st.phase + 1, PHASES.length - 1)];
  if (st.phase + 1 >= PHASES.length) {
    st.nextPreview = { cx: st.cur.cx, cz: st.cur.cz, r: Math.max(0.5, st.cur.r * 0.35) };
    return;
  }
  const maxShift = Math.max(0, st.cur.r - st.cur.r * nextPhase.rFrac);
  const ang = rng() * Math.PI * 2;
  const shift = rng() * maxShift * 0.72;
  st.nextPreview = {
    cx: clamp(st.cur.cx + Math.cos(ang) * shift, -CFG.ISLAND_R * 0.7, CFG.ISLAND_R * 0.7),
    cz: clamp(st.cur.cz + Math.sin(ang) * shift, -CFG.ISLAND_R * 0.7, CFG.ISLAND_R * 0.7),
    r: st.cur.r * nextPhase.rFrac,
  };
}

export function stormSkip() {
  const st = S.storm;
  if (st.mode === 'wait') {
    st.timer = 0.01;
  } else {
    st.timer = 0.01;
  }
}

export function updateStorm(dt) {
  const st = S.storm;
  if (!st || S.match.state === 'lobby') return;

  st.timer -= dt;

  if (st.mode === 'wait') {
    if (st.timer <= 3.2 && !st._warned) {
      st._warned = true;
      sfxWarn();
      S.emit('announce', { text: 'THE STORM IS SHRINKING', sub: 'Get to the safe zone', time: 3 });
    }
    if (st.timer <= 0) {
      st.mode = 'shrink';
      st.phase++;
      const ph = PHASES[Math.min(st.phase, PHASES.length - 1)];
      st.timer = ph.shrink;
      st.dps = ph.dps;
      st.shrinkFrom = { cx: st.cur.cx, cz: st.cur.cz, r: st.cur.r };
      st.target = { ...st.nextPreview };
      st._warned = false;
      S.emit('stormChanged');
    }
  } else {
    const ph = PHASES[Math.min(st.phase, PHASES.length - 1)];
    const k = 1 - clamp(st.timer / ph.shrink, 0, 1);
    const f = st.shrinkFrom, t = st.target;
    st.cur.cx = f.cx + (t.cx - f.cx) * k;
    st.cur.cz = f.cz + (t.cz - f.cz) * k;
    st.cur.r = f.r + (t.r - f.r) * k;
    if (st.timer <= 0) {
      st.cur = { ...t };
      if (st.phase >= PHASES.length - 1) {
        st.mode = 'final';
        st.timer = 99999;
      } else {
        st.mode = 'wait';
        const np = PHASES[st.phase + 1];
        st.timer = np.wait;
        computeNextTarget();
      }
      S.emit('stormChanged');
    }
  }

  updateWallVisual(dt);

  const playerInStorm = S.player && !S.player.dead && isOutside(S.player.pos, st.cur);
  if (playerInStorm) {
    S.player.damage(st.dps * dt, 'the Storm');
  }
  S.emit('stormTick');
}

function sfxWarn() {
  import('./audio.js').then(a => { a.sfx.stormWarn(); a.ensureStormRumble(); });
}

function isOutside(pos, circle) {
  const dx = pos.x - circle.cx, dz = pos.z - circle.cz;
  return dx * dx + dz * dz > circle.r * circle.r;
}

function updateWallVisual(dt) {
  const st = S.storm;
  wallMesh.scale.set(st.cur.r, 1, st.cur.r);
  wallMesh.position.x = st.cur.cx;
  wallMesh.position.z = st.cur.cz;
  // fade by player proximity to the wall so the whole sky isn't tinted
  let prox = 0.12;
  if (S.player) {
    const d = Math.hypot(S.player.pos.x - st.cur.cx, S.player.pos.z - st.cur.cz);
    prox = clamp(1 - Math.abs(st.cur.r - d) / 150, 0, 1);
  }
  wallMesh.material.opacity = 0.04 + prox * 0.30 + Math.sin(performance.now() * 0.002) * 0.03;
  void dt;
}

export function playerStormInfo(pos) {
  const st = S.storm;
  if (!st) return { inside: true, distToEdge: 9999 };
  const dx = pos.x - st.cur.cx, dz = pos.z - st.cur.cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  return { inside: d <= st.cur.r, distToEdge: st.cur.r - d };
}
