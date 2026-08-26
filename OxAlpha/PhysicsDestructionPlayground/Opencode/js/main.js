import * as THREE from '../lib/three.module.js';
import { G } from './state.js';
import { initPhysics, stepWorld, collectImpacts } from './physics.js';
import * as factory from './factory.js';
import * as effects from './effects.js';
import * as audio from './audio.js';
import * as tools from './tools.js';
import * as ui from './ui.js';

const canvas = document.getElementById('view');

function fatal(msg) {
  const veil = document.getElementById('veil');
  if (veil) veil.classList.add('hidden');
  const f = document.getElementById('fatal');
  document.getElementById('fatal-text').textContent = msg;
  f.classList.remove('hidden');
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5f9bd6');
  gr.addColorStop(0.45, '#9cc3e8');
  gr.addColorStop(0.62, '#cfe2f2');
  gr.addColorStop(1, '#e9eff4');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function initThree() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const sky = makeSkyTexture();
  scene.background = sky;
  scene.environment = sky;
  scene.fog = new THREE.Fog(0xcfe0ee, 85, 260);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x5c604e, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
  sun.position.set(28, 42, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

const camPos = new THREE.Vector3();
const shakeOff = new THREE.Vector3();
const STEP = 1 / 60;
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

let physFaults = 0;

function substep() {
  try {
    stepWorld();
    const impacts = collectImpacts();
    if (impacts.length) factory.handleImpacts(impacts);
  } catch (err) {
    console.error('physics fault', err);
    physFaults++;
    if (physFaults <= 2) {
      tools.cancelTransient();
      factory.resetWorld();
      ui.toast('PHYSICS FAULT - WORLD REBUILT', 2500);
    } else {
      fatal('Physics engine fault. Reload the page.');
      throw err;
    }
  }
  for (const e of G.entities.values()) {
    if (!e.cp || e.kind === 'ground') continue;
    e.pp.set(e.cp);
    e.pq.set(e.cq);
    const t = e.body.translation();
    const r = e.body.rotation();
    e.cp[0] = t.x; e.cp[1] = t.y; e.cp[2] = t.z;
    e.cq[0] = r.x; e.cq[1] = r.y; e.cq[2] = r.z; e.cq[3] = r.w;
  }
}

function cameraUpdate(dt) {
  const k = 1 - Math.exp(-10 * dt);
  G.curYaw += (G.camYaw - G.curYaw) * k;
  G.curPitch += (G.camPitch - G.curPitch) * k;
  G.curDist += (G.camDist - G.curDist) * k;
  const cp = Math.cos(G.curPitch);
  camPos.set(
    G.camTarget.x + Math.sin(G.curYaw) * cp * G.curDist,
    G.camTarget.y + Math.sin(G.curPitch) * G.curDist,
    G.camTarget.z + Math.cos(G.curYaw) * cp * G.curDist
  );
  if (G.shake > 0.002) {
    shakeOff.set(
      (Math.random() - 0.5) * G.shake * 0.35,
      (Math.random() - 0.5) * G.shake * 0.35,
      (Math.random() - 0.5) * G.shake * 0.35
    );
    camPos.add(shakeOff);
    G.shake *= Math.exp(-5 * dt);
  }
  G.camera.position.copy(camPos);
  G.camera.lookAt(G.camTarget);
}

let statTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  G.stats.acc += dt;
  G.stats.frames++;
  if (G.stats.acc > 0.5) {
    G.stats.fps = G.stats.frames / G.stats.acc;
    G.stats.frames = 0;
    G.stats.acc = 0;
  }
  G.timeScale += (G.targetTimeScale - G.timeScale) * Math.min(1, dt * 7);
  const sdt = dt * G.timeScale;
  G.acc += sdt;
  let n = 0;
  while (G.acc >= STEP && n < 4) {
    G.acc -= STEP;
    substep();
    n++;
  }
  if (n === 4) G.acc = 0;
  factory.trimFragments(now);
  const alpha = Math.min(Math.max(G.acc / STEP, 0), 1);
  for (const e of G.entities.values()) {
    if (!e.mesh || !e.cp || e.kind === 'ground') continue;
    e.mesh.position.set(
      e.pp[0] + (e.cp[0] - e.pp[0]) * alpha,
      e.pp[1] + (e.cp[1] - e.pp[1]) * alpha,
      e.pp[2] + (e.cp[2] - e.pp[2]) * alpha
    );
    qa.fromArray(e.pq);
    qb.fromArray(e.cq);
    qa.slerp(qb, alpha);
    e.mesh.quaternion.copy(qa);
  }
  tools.updateTools(dt, sdt);
  effects.updateEffects(sdt);
  cameraUpdate(dt);
  G.renderer.render(G.scene, G.camera);
  statTimer += dt;
  if (statTimer > 0.25) {
    statTimer = 0;
    ui.updateStats(G.stats.fps, G.dynamicCount);
  }
}

let lastT = performance.now();

async function boot() {
  try {
    initThree();
    effects.initEffects(G.scene);
    factory.initFactory();
    await initPhysics();
    factory.resetWorld();

    const cb = {
      selectTool: (id) => {
        tools.cancelTransient();
        ui.setTool(id);
      },
      toggleSlow: () => {
        G.targetTimeScale = G.targetTimeScale > 0.5 ? 0.18 : 1;
        ui.setSlow(G.targetTimeScale < 0.5);
        ui.toast(G.targetTimeScale < 0.5 ? 'SLOW MOTION ENGAGED' : 'NORMAL SPEED', 1400);
      },
      reset: () => {
        tools.cancelTransient();
        factory.resetWorld();
        ui.toast('WORLD RESET', 1600);
      },
      toggleSound: () => {
        G.muted = !G.muted;
        if (G.muted) audio.stopHum();
        ui.setSound(!G.muted);
      },
    };
    tools.initTools(canvas);
    ui.initUI(cb);
    document.getElementById('veil').classList.add('hidden');
    ui.toast('LMB use tool | RMB drag orbit | Wheel zoom | Space slow-mo | H help', 7000);

    window.GAME = {
      stats: () => ({
        fps: +G.stats.fps.toFixed(1),
        bodies: G.dynamicCount,
        tool: G.tool,
        timeScale: +G.timeScale.toFixed(3),
      }),
      bodies: () => G.dynamicCount,
      project: (x, y, z) => tools.screenProject(new THREE.Vector3(x, y, z)),
      blast: (x, y, z) => factory.applyBlast(new THREE.Vector3(x, y, z)),
      selectTool: cb.selectTool,
      setSlow: (v) => {
        G.targetTimeScale = v ? 0.18 : 1;
        ui.setSlow(v);
      },
      reset: cb.reset,
      debugCam: (yaw, pitch, dist, tx, tz, ty) => {
        G.camYaw = yaw; G.camPitch = pitch; G.camDist = dist;
        G.camTarget.set(tx, ty === undefined ? 3 : ty, tz);
      },
      pick: (sx, sy) => {
        const ray = new THREE.Raycaster();
        const nd = new THREE.Vector2(
          (sx / window.innerWidth) * 2 - 1,
          -(sy / window.innerHeight) * 2 + 1
        );
        ray.setFromCamera(nd, G.camera);
        const hits = ray.intersectObjects(factory.ensureMeshList(), false);
        return hits.slice(0, 3).map((h) => ({
          k: h.object.userData.entity ? h.object.userData.entity.kind : '?',
          d: +h.distance.toFixed(1),
          p: [+h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1)],
        }));
      },
      audit: () => {
        let below = 0, minY = 1e9, asleep = 0, total = 0;
        for (const e of G.entities.values()) {
          if (e.kind === 'ground') continue;
          total++;
          const t = e.body.translation();
          if (t.y < minY) minY = t.y;
          if (t.y < -3) below++;
          if (e.body.isSleeping()) asleep++;
        }
        return { total, below, minY: +minY.toFixed(1), asleep };
      },
      peek: (x, z) => {
        const out = [];
        for (const e of G.entities.values()) {
          if (!e.alive || e.kind === 'ground') continue;
          const t = e.body.translation();
          if (Math.hypot(t.x - x, t.z - z) < 4) {
            out.push({
              k: e.kind,
              p: [+t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1)],
              m: e.mesh ? { vis: e.mesh.visible, parent: !!e.mesh.parent, s: +e.mesh.scale.x.toFixed(2), mp: e.mesh.position.y.toFixed(1) } : null,
            });
          }
        }
        return out.slice(0, 14);
      },
    };

    requestAnimationFrame((t) => {
      lastT = t;
      frame(t);
    });
  } catch (err) {
    console.error(err);
    fatal(err && err.message ? err.message : String(err));
  }
}

boot();
