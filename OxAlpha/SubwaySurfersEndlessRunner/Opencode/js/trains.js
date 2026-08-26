// HYPERLINE trains — pooled cars, parked trains w/ ramps + roofs, oncoming trains
import * as THREE from 'three';
import CFG from './config.js';
import { M, GEO, geo } from './materials.js';
import { randRange, choice, clamp } from './utils.js';

const CAR_LEN = 13.5;
const CAR_W = 2.06;
const L = CFG.WORLD.CHUNK_LEN;
const ROOF_Y = CFG.WORLD.TRAIN_ROOF_Y;

const LIVERIES = [
  { body: 0xd8534f, stripe: 0xffe9c9 },   // sunset red
  { body: 0x3f7fb8, stripe: 0xd9edff },   // metro blue
  { body: 0x4fae6a, stripe: 0xeaffea },   // line green
  { body: 0xc9a23a, stripe: 0x3a3226 },   // freight ochre
];

function windowTexture(lv) {
  if (!window.__trainTex) window.__trainTex = {};
  const key = lv.body;
  if (window.__trainTex[key]) return window.__trainTex[key];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#' + lv.body.toString(16).padStart(6, '0');
  x.fillRect(0, 0, 256, 128);
  // stripe
  x.fillStyle = '#' + lv.stripe.toString(16).padStart(6, '0');
  x.fillRect(0, 84, 256, 14);
  // windows band
  x.fillStyle = '#101826';
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    if (x.roundRect) x.roundRect(12 + i * 40, 18, 30, 34, 6);
    else x.rect(12 + i * 40, 18, 30, 34);
    x.fill();
    x.fillStyle = 'rgba(190,230,255,0.25)';
    x.fillRect(12 + i * 40, 18, 30, 10);
    x.fillStyle = '#101826';
  }
  // doors
  x.fillStyle = 'rgba(0,0,0,0.28)';
  x.fillRect(118, 26, 20, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  window.__trainTex[key] = t;
  return t;
}

class Car {
  constructor(lvIdx, cabFront) {
    const lv = LIVERIES[lvIdx];
    this.group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ map: windowTexture(lv), roughness: 0.45, metalness: 0.35 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x8b909c, roughness: 0.6, metalness: 0.5 });
    // body
    this.body = new THREE.Mesh(geo('carBody' + lvIdx + (cabFront ? 'c' : ''), () =>
      new THREE.BoxGeometry(CAR_W, 2.55, CAR_LEN)), matBody);
    this.body.position.y = CFG.WORLD.TRAIN_FLOOR + 2.55 / 2 - 0.28;
    this.body.castShadow = true;
    this.group.add(this.body);
    // curved roof cap (baked rotations: axis along Z, arc upward)
    this.roof = new THREE.Mesh(geo('carRoof', () => {
      const g = new THREE.CylinderGeometry(CAR_W / 2, CAR_W / 2, CAR_LEN * 0.96, 10, 1, true, 0, Math.PI);
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.PI / 2);
      return g;
    }), matRoof);
    this.roof.position.y = CFG.WORLD.TRAIN_FLOOR + 2.55 - 0.28;
    this.roof.castShadow = true;
    this.group.add(this.roof);
    // undercarriage
    const skirt = new THREE.Mesh(geo('carSkirt', () => new THREE.BoxGeometry(CAR_W * 0.92, 0.5, CAR_LEN * 0.95)), M('darkMetal'));
    skirt.position.y = 0.16;
    this.group.add(skirt);
    // wheels
    const wg = geo('carWheel', () => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10));
    for (const zz of [-CAR_LEN / 2 + 1.8, CAR_LEN / 2 - 1.8]) {
      for (const xx of [-CAR_W / 2 - 0.05, CAR_W / 2 + 0.05]) {
        const w = new THREE.Mesh(wg, M('darkMetal'));
        w.rotation.x = Math.PI / 2;
        w.position.set(xx, 0.34, zz);
        this.group.add(w);
      }
    }
    if (cabFront) {
      // face plate + lights + destination sign
      const face = new THREE.Mesh(geo('carFace', () => new THREE.BoxGeometry(CAR_W * 0.98, 1.9, 0.16)),
        new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.3, metalness: 0.6 }));
      face.position.set(0, 1.75, -CAR_LEN / 2 - 0.05);
      this.group.add(face);
      this.headlights = [];
      for (const lx of [-0.68, 0.68]) {
        const hl = new THREE.Mesh(geo('headlightBox', () => new THREE.BoxGeometry(0.42, 0.18, 0.06)), M('headlight'));
        hl.position.set(lx, 0.85, -CAR_LEN / 2 - 0.12);
        this.group.add(hl);
        this.headlights.push(hl);
      }
      const tl = new THREE.Mesh(geo('taillightBox', () => new THREE.BoxGeometry(0.4, 0.14, 0.06)), M('taillight'));
      tl.position.set(0, 1.35, CAR_LEN / 2 + 0.08);
      this.group.add(tl);
    }
  }
}

export class Trains {
  constructor() {
    this.carPool = {};       // free cars by variant key
    this.moving = [];        // oncoming trains {cars, lane, z, speed, colliders}
    this.pending = [];       // scheduled spawns [{t, lane, z, speed}]
  }

  init(scene, quality) {
    this.scene = scene;
    this.quality = quality;
  }

  _acquireCar(lvIdx, cab) {
    const key = lvIdx + (cab ? 'c' : '');
    let pool = this.carPool[key];
    if (!pool) pool = this.carPool[key] = [];
    let car = pool.pop();
    if (!car) car = new Car(lvIdx, cab);
    car.group.visible = true;
    return car;
  }

  _releaseCarTo(car, key) {
    car.group.visible = false;
    if (car.group.parent) car.group.parent.remove(car.group);
    (this.carPool[key] || (this.carPool[key] = [])).push(car);
  }

  releaseChunk(chunk) {
    for (const pt of chunk.trains || []) {
      pt.cars.forEach((c, i) => this._releaseCarTo(c, pt.keys[i]));
    }
    chunk.trains.length = 0;
  }

  reset() {
    for (const mv of this.moving) {
      mv.cars.forEach((c, i) => this._releaseCarTo(c, mv.keys[i]));
      if (mv.cars[0] && mv.cars[0].group.parent) mv.cars.forEach(c => c.group.parent.remove(c.group));
    }
    this.moving.length = 0;
    this.pending.length = 0;
  }

  // ---------- parked trains ----------
  buildParkedSection(chunk, sec, world) {
    const rng = Math.random;
    const zBase = chunk.z1 - 2;
    const nCars = sec.tier >= 2 ? choice([3, 4, 5]) : choice([2, 3]);
    const lanes = [0, 1, 2].sort(() => rng() - 0.5);
    const trainLane = lanes[0];
    const secondTrain = sec.tier >= 1 && rng() < 0.45;

    this.spawnParked(world, chunk, trainLane, zBase - 2, nCars, true);

    if (secondTrain && nCars <= 3) {
      this.spawnParked(world, chunk, lanes[1], zBase - randRange(6, 14), choice([1, 2]), rng() < 0.5);
    } else {
      // light obstacles on remaining lanes
      const otherLanes = [0, 1, 2].filter(l => l !== trainLane);
      const l = choice(otherLanes);
      if (rng() < 0.6) world.deps.obstacles.addLowBarrier(chunk, l, zBase - randRange(10, 26));
      if (sec.tier >= 1 && rng() < 0.5) world.deps.obstacles.addRollGantry(chunk, choice(otherLanes), zBase - randRange(14, 30));
    }
  }

  spawnParked(world, chunk, lane, zHead, nCars, withRamp) {
    // zHead = nearest edge of first car (largest z); train extends toward -z
    const g = chunk.group;
    const lvIdx = (Math.random() * LIVERIES.length) | 0;
    const cars = [], keys = [];
    const x = CFG.LANES[lane];

    for (let i = 0; i < nCars; i++) {
      const isHead = i === 0;
      const car = this._acquireCar(lvIdx, isHead);
      keys.push(lvIdx + (isHead ? 'c' : ''));
      car.group.position.set(x, 0, zHead - i * CAR_LEN - CAR_LEN / 2);
      car.group.rotation.y = Math.PI;   // cab faces the player (+z)
      g.add(car.group);
      cars.push(car);
      const cz = car.group.position.z;
      chunk.colliders.push({
        type: 'train', x, z: cz, hw: CAR_W / 2, hh: ROOF_Y / 2, hd: CAR_LEN / 2,
        y: ROOF_Y / 2, severity: 'wipeout', roofY: ROOF_Y, passed: false,
      });
      chunk.roofs.push({ x, z0: cz - CAR_LEN / 2, z1: cz + CAR_LEN / 2, hw: CAR_W / 2 - 0.06, roofY: ROOF_Y });
    }
    // ramp onto the head car? side walls only — lane-center entry stays clean
    if (withRamp) {
      const rzNear = zHead + 0.15;
      const rzFar = zHead - 6.2;
      chunk.ramps.push({ x, hw: 1.0, zNear: rzNear, zFar: rzFar, yNear: 0, yFar: ROOF_Y });
      this.buildRampMesh(g, x, rzNear, rzFar);
      for (const sx of [-1.02, 1.02]) {
        chunk.colliders.push({
          type: 'blocker', x: x + sx, z: (rzNear + rzFar) / 2, hw: 0.14, hh: ROOF_Y / 2,
          hd: Math.abs(rzNear - rzFar) / 2, y: ROOF_Y / 2 - 0.4, severity: 'stumble', passed: false,
        });
      }
    }
    const rec = { cars, keys, chunk };
    chunk.trains.push(rec);

    // coins along roof reward the ramp route
    if (nCars >= 2) {
      const D = world.deps.collectibles;
      const nCoin = Math.min(nCars * 3, 9);
      for (let i = 0; i < nCoin; i++) {
        D.spawnCoin(x, zHead - 3.5 - i * 3.0, ROOF_Y + 1.05);
      }
    }
    return rec;
  }

  buildRampMesh(g, x, zNear, zFar) {
    const len = Math.abs(zNear - zFar);
    // wedge via ExtrudeGeometry-lite: use BoxGeometry rotated
    const rise = ROOF_Y;
    const ang = Math.atan2(rise, len);
    const hypot = Math.sqrt(rise * rise + len * len);
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x9aa2b2, roughness: 0.6, metalness: 0.4 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, hypot), rampMat);
    m.position.set(x, rise / 2, (zNear + zFar) / 2);
    m.rotation.x = ang;   // rises toward -z
    m.castShadow = true;
    g.add(m);
    // side rails on ramp
    for (const sx of [-0.95, 0.95]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, hypot), M('darkMetal'));
      rail.position.set(x + sx, rise / 2 + 0.3, (zNear + zFar) / 2);
      rail.rotation.x = ang;
      g.add(rail);
    }
  }

  // ---------- oncoming ----------
  buildOncomingSchedule(chunk, sec, world) {
    if (sec.state.oncomingScheduled) return;
    sec.state.oncomingScheduled = true;
    const lane = (Math.random() * 3) | 0;
    const arriveZ = chunk.z1 - randRange(L * 0.5, L * 0.95);
    const speed = randRange(13, 19);
    const dist = Math.abs(arriveZ - chunk.z1) + 250;   // spawn far ahead
    const delay = dist / (speed + world.deps.playerSpeedEstimate());
    this.pending.push({ t: delay, lane, spawnZ: arriveZ - 250, speed });
  }

  spawnMoving(world, lane, zStart, speed) {
    const g = this.scene;
    const lvIdx = (Math.random() * LIVERIES.length) | 0;
    const nCars = choice([2, 3, 4]);
    const cars = [], keys = [];
    const x = CFG.LANES[lane];
    const mv = {
      cars, keys, lane, x, z: zStart, speed,
      colliders: [], hornDone: false, dead: false,
      dodged: false,
    };
    for (let i = 0; i < nCars; i++) {
      const isHead = i === 0;
      const car = this._acquireCar(lvIdx, isHead);
      keys.push(lvIdx + (isHead ? 'c' : ''));
      car.group.position.set(x, 0, zStart - i * CAR_LEN - CAR_LEN / 2);
      car.group.rotation.y = Math.PI;   // cab faces player (+z)
      if (car.headlights) for (const h of car.headlights) h.visible = true;
      g.add(car.group);
      cars.push(car);
      mv.colliders.push({
        type: 'moving', x, z: car.group.position.z, hw: CAR_W / 2, hh: ROOF_Y / 2 + 0.2,
        hd: CAR_LEN / 2, y: ROOF_Y / 2, severity: 'wipeout', passed: false, ref: mv,
      });
    }
    this.moving.push(mv);
    return mv;
  }

  update(dt, playerZ, hooks) {
    // scheduled spawns
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) { this.spawnMoving(null, p.lane, p.spawnZ, p.speed); this.pending.splice(i, 1); }
    }
    const dyn = [];
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const mv = this.moving[i];
      if (mv.dead) continue;
      mv.z += mv.speed * dt;
      // position cars
      for (let k = 0; k < mv.cars.length; k++) {
        mv.cars[k].group.position.z = mv.z - k * CAR_LEN - CAR_LEN / 2;
        const col = mv.colliders[k];
        col.z = mv.cars[k].group.position.z;
        dyn.push(col);
      }
      // horn warning as it nears
      if (!mv.hornDone && mv.z - playerZ < 130) {
        mv.hornDone = true;
        hooks && hooks.onTrainHorn && hooks.onTrainHorn(mv);
      }
      // despawn well behind player
      if (mv.z - playerZ > 60 + mv.cars.length * CAR_LEN) {
        if (!mv.hitPlayer) hooks && hooks.onTrainDodged && hooks.onTrainDodged(mv);
        mv.cars.forEach((c, k) => this._releaseCarTo(c, mv.keys[k]));
        this.moving.splice(i, 1);
      }
    }
    this.dynColliders = dyn;
    if (hooks && hooks.onDynColliders) hooks.onDynColliders(dyn);
  }
}
