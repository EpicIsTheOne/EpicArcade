import * as THREE from '../lib/three.module.js';
import { G, clamp } from './state.js';
import { ensureAudio, startHum, stopHum } from './audio.js';
import * as factory from './factory.js';
import * as effects from './effects.js';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HOVER_TOOLS = new Set(['grab', 'freeze', 'clone', 'del']);

let canvas = null;
let orbitActive = false;
let panActive = false;
let lastX = 0;
let lastY = 0;
let primaryDown = false;
let hoverHelper = null;
let grabLine = null;
let grabDot = null;
let ringTimer = 0;
const tmpQuat = new THREE.Quaternion();

function updateNdc(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function raycastMeshes() {
  raycaster.setFromCamera(ndc, G.camera);
  const hits = raycaster.intersectObjects(factory.ensureMeshList(), false);
  return hits.length ? hits[0] : null;
}

const aimHit = { point: new THREE.Vector3(), entity: null };

function aimPoint() {
  const hit = raycastMeshes();
  if (hit) {
    aimHit.point.copy(hit.point);
    aimHit.entity = hit.object.userData.entity || null;
    return aimHit;
  }
  raycaster.ray.intersectPlane(groundPlane, aimHit.point);
  if (!aimHit.point) {
    G.camera.getWorldDirection(aimHit.point);
    aimHit.point.multiplyScalar(30).add(G.camera.position);
  } else if (aimHit.point.distanceTo(G.camera.position) > 50) {
    G.camera.getWorldDirection(aimHit.point);
    aimHit.point.multiplyScalar(30).add(G.camera.position);
  }
  aimHit.entity = null;
  return aimHit;
}

function initHelpers(scene) {
  hoverHelper = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85 })
  );
  hoverHelper.visible = false;
  scene.add(hoverHelper);
  grabDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb347, wireframe: true })
  );
  grabDot.visible = false;
  scene.add(grabDot);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  grabLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.5 }));
  grabLine.visible = false;
  grabLine.frustumCulled = false;
  scene.add(grabLine);
}

export function cancelTransient() {
  if (G.grabbed) G.grabbed = null;
  if (G.holdAction) {
    stopHum();
    G.holdAction = null;
  }
  primaryDown = false;
}

function primaryDownAction() {
  const tool = G.tool;
  if (tool === 'grab') {
    const hit = raycastMeshes();
    if (!hit) return;
    const e = hit.object.userData.entity;
    if (!e || !e.body.isDynamic() || e.frozen) return;
    const b = e.body;
    const t = b.translation();
    const r = b.rotation();
    tmpQuat.set(r.x, r.y, r.z, r.w).invert();
    const localOff = new THREE.Vector3(hit.point.x - t.x, hit.point.y - t.y, hit.point.z - t.z).applyQuaternion(tmpQuat);
    G.grabbed = { e, dist: hit.distance, localOff, target: hit.point.clone() };
    b.wakeUp();
  } else if (tool === 'launch') {
    const dir = G.camera.getWorldDirection(new THREE.Vector3());
    const mp = G.camera.position.clone().add(dir.clone().multiplyScalar(1.1));
    effects.muzzleFX(mp, dir);
    factory.projectileSpawn(G.camera.position, dir);
  } else if (tool === 'blast') {
    const ap = aimPoint();
    factory.applyBlast(ap.point.clone());
  } else if (tool === 'pull' || tool === 'push') {
    const ap = aimPoint();
    G.holdAction = { type: tool, point: ap.point.clone() };
    startHum(tool);
  } else if (tool === 'freeze') {
    const hit = raycastMeshes();
    if (hit) factory.toggleFreeze(hit.object.userData.entity);
  } else if (tool === 'spawn') {
    const ap = aimPoint();
    factory.spawnProp(G.spawnKind, ap.point.clone(), G.camera.getWorldDirection(new THREE.Vector3()));
  } else if (tool === 'clone') {
    const hit = raycastMeshes();
    if (hit) factory.duplicateEntity(hit.object.userData.entity);
  } else if (tool === 'del') {
    const hit = raycastMeshes();
    if (hit) factory.removeEntity(hit.object.userData.entity, false);
  } else if (tool === 'ball') {
    const ap = aimPoint();
    factory.wreckingRig(ap.point.clone());
  }
}

export function initTools(domElement) {
  canvas = domElement;
  initHelpers(G.scene);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.button === 2) {
      orbitActive = true;
      lastX = e.clientX; lastY = e.clientY;
    } else if (e.button === 1) {
      panActive = true;
      lastX = e.clientX; lastY = e.clientY;
      e.preventDefault();
    } else if (e.button === 0) {
      primaryDown = true;
      updateNdc(e);
      primaryDownAction();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    updateNdc(e);
    if (orbitActive) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      G.camYaw -= dx * 0.0052;
      G.camPitch = clamp(G.camPitch + dy * 0.0042, 0.06, 1.32);
    } else if (panActive) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const right = new THREE.Vector3().setFromMatrixColumn(G.camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(G.camera.matrix, 1);
      const k = G.camDist * 0.0012;
      G.camTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      G.camTarget.x = clamp(G.camTarget.x, -55, 55);
      G.camTarget.z = clamp(G.camTarget.z, -55, 55);
      G.camTarget.y = clamp(G.camTarget.y, 0, 30);
    } else if (primaryDown && G.grabbed) {
      const dir = G.camera.getWorldDirection(new THREE.Vector3());
      G.grabbed.target.copy(G.camera.position).addScaledVector(dir, G.grabbed.dist);
      G.grabbed.target.y = Math.max(G.grabbed.target.y, 0.15);
    } else if (primaryDown && G.holdAction) {
      G.holdAction.point.copy(aimPoint().point);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    if (e.button === 2) orbitActive = false;
    else if (e.button === 1) panActive = false;
    else if (e.button === 0) {
      primaryDown = false;
      if (G.grabbed) G.grabbed = null;
      if (G.holdAction) {
        stopHum();
        G.holdAction = null;
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.0012);
    if (G.grabbed) {
      G.grabbed.dist = clamp(G.grabbed.dist * f, 3, 60);
    } else {
      G.camDist = clamp(G.camDist * f, 7, 80);
    }
  }, { passive: false });
}

export function screenProject(v) {
  const p = v.clone().project(G.camera);
  return [
    (p.x * 0.5 + 0.5) * window.innerWidth,
    (-p.y * 0.5 + 0.5) * window.innerHeight,
  ];
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export function updateTools(dt, sdt) {
  if (HOVER_TOOLS.has(G.tool)) {
    const hit = raycastMeshes();
    G.hovered = hit ? hit.object.userData.entity || null : null;
  } else {
    G.hovered = null;
  }

  if (G.grabbed) {
    const gr = G.grabbed;
    if (!G.entities.has(gr.e.id)) {
      G.grabbed = null;
      grabDot.visible = false;
      grabLine.visible = false;
    } else {
      const b = gr.e.body;
      raycaster.setFromCamera(ndc, G.camera);
      gr.target.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, gr.dist);
      gr.target.y = Math.max(gr.target.y, 0.15);
      const t = b.translation();
      const r = b.rotation();
      tmpQuat.set(r.x, r.y, r.z, r.w);
      tmpA.copy(gr.localOff).applyQuaternion(tmpQuat);
      tmpB.set(gr.target.x - t.x - tmpA.x, gr.target.y - t.y - tmpA.y, gr.target.z - t.z - tmpA.z);
      tmpB.multiplyScalar(14);
      const vl = tmpB.length();
      if (vl > 26) tmpB.multiplyScalar(26 / vl);
      b.setLinvel({ x: tmpB.x, y: tmpB.y, z: tmpB.z }, true);
      const av = b.angvel();
      b.setAngvel({ x: av.x * 0.9, y: av.y * 0.9, z: av.z * 0.9 }, true);
      grabDot.visible = true;
      grabDot.position.copy(gr.target);
      const lp = grabLine.geometry.attributes.position.array;
      lp[0] = gr.target.x; lp[1] = gr.target.y; lp[2] = gr.target.z;
      lp[3] = t.x + tmpA.x; lp[4] = t.y + tmpA.y; lp[5] = t.z + tmpA.z;
      grabLine.geometry.attributes.position.needsUpdate = true;
      grabLine.visible = true;
    }
  } else {
    grabDot.visible = false;
    grabLine.visible = false;
  }

  if (G.holdAction) {
    const ha = G.holdAction;
    const pull = ha.type === 'pull';
    const R = 7;
    const K = pull ? 30 : 42;
    for (const e of G.entities.values()) {
      if (!e.body.isDynamic() || e.frozen) continue;
      if (G.grabbed && G.grabbed.e === e) continue;
      const bp = e.body.translation();
      const dx = ha.point.x - bp.x;
      const dy = ha.point.y - bp.y;
      const dz = ha.point.z - bp.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= R || d < 0.001) continue;
      const m = e.body.mass();
      const fall = (1 - d / R) * K * sdt * m;
      const sgn = pull ? 1 : -1;
      e.body.applyImpulse({
        x: (dx / d) * fall * sgn,
        y: (dy / d) * fall * sgn + (pull ? fall * 0.22 : 0),
        z: (dz / d) * fall * sgn,
      }, true);
    }
    ringTimer += dt;
    if (ringTimer > 0.13) {
      ringTimer = 0;
      effects.ringPulse(ha.point, pull ? 5.5 : 6.5, 0.45, pull ? 0x7fd4ff : 0xffb347);
    }
  }

  if (G.hovered && G.hovered.mesh) {
    const e = G.hovered;
    hoverHelper.visible = true;
    hoverHelper.position.copy(e.mesh.position);
    hoverHelper.quaternion.copy(e.mesh.quaternion);
    const d = e.def.size;
    if (e.def.shape === 'sphere') hoverHelper.scale.setScalar(d.r * 2.08);
    else if (e.def.shape === 'cyl') hoverHelper.scale.set(d.r * 2.08, d.h * 1.05, d.r * 2.08);
    else hoverHelper.scale.set(d.sx * 1.05, d.sy * 1.05, d.sz * 1.05);
  } else {
    hoverHelper.visible = false;
  }
}
