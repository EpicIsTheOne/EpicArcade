import * as THREE from 'three';
import { CFG } from './config.js';
import { S } from './state.js';
import { mulberry32, rand, clamp, lerp } from './utils.js';
import { heightAt } from './terrain.js';
import { setWindIntensity } from './audio.js';
import { down, pressed } from './input.js';

let rng = mulberry32(CFG.SEED + 77);
let busMesh = null;
let sceneRef = null;
export const busPath = {
  from: null,
  to: null,
  duration: 44,
  progress: 0,
  pointAt(t) {
    if (!this.from) return new THREE.Vector3();
    return new THREE.Vector3().lerpVectors(this.from, this.to, clamp(t, 0, 1));
  },
};
let autoEjected = false;

export function startBusDrop(scene, playerLandingHint) {
  sceneRef = scene;
  rng = mulberry32((Math.random() * 1e9) | 0);
  busPath.progress = 0;
  autoEjected = false;

  const ang = rng() * Math.PI * 2;
  const off = CFG.ISLAND_R * 1.35;
  const px = Math.cos(ang) * off, pz = Math.sin(ang) * off;
  const perp = ang + Math.PI / 2 + rand(rng, -0.5, 0.5);
  busPath.from = new THREE.Vector3(px, 165, pz);
  busPath.to = new THREE.Vector3(Math.cos(perp) * off * -1, 160, Math.sin(perp) * off * -1);

  if (!busMesh) buildBusMesh();

  S.match.state = 'bus';
  S.emit('busStarted');

  import('./bots.js').then(b => b.spawnBots(busPath, playerLandingHint));

  player.pos.copy(busPath.from).add(new THREE.Vector3(0, -4, 0));
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(
    -(busPath.to.x - busPath.from.x),
    -(busPath.to.z - busPath.from.z)
  );
  player.pitch = -0.15;

  return busPath;
}

let player = null;
export function setPlayerRef(p) { player = p; }

function buildBusMesh() {
  const g = new THREE.Group();
  const balloonMat = new THREE.MeshStandardMaterial({ color: 0x7a4fd0, roughness: 0.6 });
  const gondolaMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x555c66, roughness: 0.5, metalness: 0.6 });

  const balloonGeo = new THREE.SphereGeometry(9, 18, 12);
  balloonGeo.scale(1.25, 0.85, 1);
  const balloon = new THREE.Mesh(balloonGeo, balloonMat);
  balloon.position.y = 6;
  balloon.castShadow = true;

  const finGeo = new THREE.BoxGeometry(2.2, 4.5, 0.4);
  const fin1 = new THREE.Mesh(finGeo, balloonMat);
  fin1.position.set(-10.5, 6.5, 0);
  fin1.rotation.x = Math.PI / 2;
  const fin2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.5, 2.2), balloonMat);
  fin2.position.set(0, 6.5, -10.5);

  const gondola = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 4), gondolaMat);
  gondola.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 5), gondolaMat);
  roof.position.y = 1.8;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6), metal);
      strut.position.set(sx * 5, 3, sz * 1.4);
      strut.rotation.z = sx * 0.35;
      g.add(strut);
    }
  }

  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.7), metal);
  prop.position.set(7.6, 0, 0);
  prop.name = 'prop';

  g.add(balloon, fin1, fin2, gondola, roof, prop);
  g.visible = false;
  sceneRef.add(g);
  busMesh = g;
}

export function updateBus(dt) {
  if (!busMesh || !busPath.from) return;
  const st = S.match.state;
  if (st !== 'bus') {
    if (st === 'freefall' || st === 'glide') {
      updateFreefall(dt);
    }
    return;
  }

  busPath.progress += dt / busPath.duration;
  const t = clamp(busPath.progress, 0, 1);
  const pos = busPath.pointAt(t);
  pos.y += Math.sin(t * Math.PI) * 8;
  busMesh.visible = true;
  busMesh.position.copy(pos);
  const dir = new THREE.Vector3().subVectors(busPath.to, busPath.from).normalize();
  busMesh.rotation.y = Math.atan2(dir.x, dir.z);
  const prop = busMesh.getObjectByName('prop');
  if (prop) prop.rotation.x += dt * 22;

  player.pos.set(pos.x, pos.y - 5, pos.z);
  player.vel.set(0, 0, 0);
  player.grounded = false;

  if (t >= 1 && !autoEjected) {
    autoEjected = true;
    ejectFromBus();
  } else if (pressed('Space') && t > 0.03) {
    ejectFromBus();
  }

  S.emit('busTick', { t });
}

function ejectFromBus() {
  S.match.state = 'freefall';
  player.freefallT = 0;
  player.chuteDeployed = false;
  busMesh.visible = false;
  import('./audio.js').then(a => a.sfx.jump());
  S.emit('announce', { text: 'GOOD LUCK OUT THERE', sub: 'Dive with W · Glide auto-deploys', time: 2.5 });
}

export function updateFreefall(dt) {
  player.freefallT += dt;
  const groundY = Math.max(heightAt(player.pos.x, player.pos.z), CFG.WATER_Y);

  let dx = 0, dz = 0;
  {
    const f = player.flatForward(new THREE.Vector3());
    const r = new THREE.Vector3().copy(f).cross(new THREE.Vector3(0, 1, 0)).normalize();
    if (down('KeyW')) { dx += f.x; dz += f.z; }
    if (down('KeyS')) { dx -= f.x * 0.4; dz -= f.z * 0.4; }
    if (down('KeyA')) { dx -= r.x; dz -= r.z; }
    if (down('KeyD')) { dx += r.x; dz += r.z; }
  }

  if (!player.chuteDeployed) {
    const dive = down('KeyW') ? 1 : 0;
    const targetVy = lerp(-16, -42, dive);
    player.vel.y += (targetVy - player.vel.y) * (1 - Math.exp(-2.5 * dt));
    const hs = dive ? 26 : 13;
    const dl = Math.hypot(dx, dz) || 1;
    player.pos.x += (dx / dl) * hs * dt;
    player.pos.z += (dz / dl) * hs * dt;
    player.pos.y += player.vel.y * dt;
    setWindIntensity(clamp((-player.vel.y - 14) / 30, 0, 0.5));

    const altAboveGround = player.pos.y - groundY;
    if (altAboveGround < 46 || (player.freefallT > 2.5 && down('Space'))) {
      deployChute();
    }
  } else {
    glideUpdate(dt, dx, dz, groundY);
  }
}

function deployChute() {
  player.chuteDeployed = true;
  player.vel.y = -5;
  import('./audio.js').then(a => a.sfx.glideOpen());
}

function glideUpdate(dt, dx, dz, groundY) {
  player.vel.y += (-4.4 - player.vel.y) * (1 - Math.exp(-3 * dt));
  const dl = Math.hypot(dx, dz);
  const fwd = 11 + (dl > 0 ? 3 : 0);
  if (dl > 0) {
    player.pos.x += (dx / dl) * fwd * dt;
    player.pos.z += (dz / dl) * fwd * dt;
  }
  player.pos.y += player.vel.y * dt;
  setWindIntensity(0.12);

  if (player.pos.y <= groundY + 0.05) {
    landPlayer(groundY);
  }
}

function landPlayer(gy) {
  player.pos.y = gy;
  player.vel.set(0, 0, 0);
  player.grounded = true;
  player.chuteDeployed = false;
  player.freefallT = 0;
  player.fallPeak = gy;
  setWindIntensity(0);
  import('./audio.js').then(a => a.sfx.land());
  if (S.match.state === 'freefall' || S.match.state === 'glide') {
    S.match.state = 'playing';
    S.match.startTime = performance.now();
    S.emit('landed');
  }
}

export function getBusInfo() {
  return {
    active: S.match.state === 'bus',
    t: busPath.progress,
    pos: busMesh ? busMesh.position : null,
    path: busPath,
  };
}

export function hideBus() {
  if (busMesh) busMesh.visible = false;
}
