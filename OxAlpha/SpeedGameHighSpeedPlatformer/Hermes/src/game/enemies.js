import * as THREE from 'three';
import { clamp } from './mathutil.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

const MAT = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.5, metalness: o.m ?? 0.35, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 });

// ======================= ENEMY TYPES =======================
class Enemy {
  constructor(scene, pos) {
    this.scene = scene;
    this.pos = pos.clone();
    this.alive = true;
    this.radius = 1.0;
    this.deathT = 0;
    this.t = Math.random() * 7;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }
  get chainPos() { return this.group.position; }
  die(game, impactVel) {
    if (!this.alive) return;
    this.alive = false;
    this.deathT = 0.001;
    game.onEnemyKilled(this, impactVel);
  }
  updateDead(dt) {
    this.deathT += dt;
    const k = Math.max(0, 1 - this.deathT * 3.5);
    this.group.scale.setScalar(Math.max(0.001, k));
    this.group.rotation.z += dt * 9;
    if (this.deathT > 0.34 && this.group.visible) this.group.visible = false;
  }
  // is the player currently able to damage us?
  playerAttacking(player) {
    return player.state === 'chain' || player.state === 'stomp' ||
      (player.boosting || player.panelTimer > 0 || player.speed > 21);
  }
  tryContactKill(player, game, verticalBias = false) {
    _v1.copy(player.pos).sub(this.chainPos);
    const d = _v1.length();
    const rr = this.radius + 0.75;
    if (d < rr) {
      if (this.playerAttacking(player)) {
        this.die(game, player.vel);
        if (player.state === 'chain') { /* chain bounce handled by player */ }
        else if (!verticalBias) {
          // small reward hop so you can chain through packs
          if (player.state !== 'stomp') player.vel.y = Math.max(player.vel.y, 12);
        }
        return 'killed';
      }
      if (player.hurt(this.chainPos)) return 'hurt';
      // gentle separation
      _v2.copy(_v1).normalize();
      player.vel.addScaledVector(_v2, -6);
      return 'bump';
    }
    return null;
  }
}

export class Gnat extends Enemy {
  constructor(scene, pos, opts = {}) {
    super(scene, pos);
    this.anchor = pos.clone();
    this.patrol = opts.patrol || new THREE.Vector3(3, 0, 0);
    this.pt = Math.random() * 10;
    this.radius = 0.95;
    const bodyMat = MAT(0x2c3550, { r: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), bodyMat);
    body.scale.y = 0.82;
    const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 20), MAT(0xff3050, { e: 0xff2038, ei: 2 }));
    eyeRing.position.z = 0.42;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), MAT(0x8892aa, { m: 0.8 }));
    spike.rotation.x = -Math.PI / 2; spike.position.z = -0.55;
    this.wings = [];
    const wingGeo = new THREE.BoxGeometry(0.65, 0.03, 0.22);
    const wingMat = MAT(0xbfefff, { e: 0x37d8ff, ei: 0.6, r: 0.2 });
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.position.set(s * 0.45, 0.45, 0);
      this.wings.push(w);
      this.group.add(w);
    }
    this.light = new THREE.PointLight(0xff3040, 1.4, 5);
    this.group.add(body, eyeRing, spike, this.light);
    this.mode = 'patrol';
  }
  update(dt, player, game) {
    if (!this.alive) { this.updateDead(dt); return; }
    this.t += dt;
    const toP = _v1.copy(player.pos).sub(this.chainPos);
    const distP = toP.length();
    if (distP < 15 && player.state !== 'dead') this.mode = 'chase'; else if (distP > 22) this.mode = 'patrol';
    let target;
    if (this.mode === 'patrol') {
      this.pt += dt * 0.55;
      target = _v2.copy(this.anchor).addScaledVector(this.patrol, (Math.sin(this.pt) + 1) / 2);
      target.y += Math.sin(this.t * 2.2) * 0.25;
    } else {
      target = _v2.copy(player.pos); target.y += 1.4;
      // hover offset so they swoop rather than stack
      target.addScaledVector(UP, Math.sin(this.t * 3) * 0.5);
    }
    _v3.copy(target).sub(this.chainPos);
    const d = _v3.length();
    const sp = this.mode === 'chase' ? 9.5 : 3;
    if (d > 0.01) {
      _v3.divideScalar(d);
      this.chainPos.addScaledVector(_v3, Math.min(sp * dt, d));
    }
    // face motion/player
    const look = this.mode === 'chase' ? _v1 : _v3;
    if (look.lengthSq() > 0.01) this.group.rotation.y = Math.atan2(look.x, look.z);
    for (let i = 0; i < this.wings.length; i++) this.wings[i].rotation.z = Math.sin(this.t * 40 + i * Math.PI) * 0.7;
    this.tryContactKill(player, game);
  }
}

export class Stomper extends Enemy {
  constructor(scene, pos, opts = {}) {
    super(scene, pos);
    this.a = pos.clone();
    this.b = (opts.to || pos.clone().add(new THREE.Vector3(6, 0, 0)));
    this.pt = Math.random();
    this.dirS = 1;
    this.radius = 1.5;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 14), MAT(0x50304a, { r: 0.55 }));
    body.scale.set(1.15, 0.95, 1.05); body.position.y = 1.5; body.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.1), MAT(0xffd23e, { e: 0xffa200, ei: 2 }));
    visor.position.set(0, 1.62, 0.95);
    this.feet = [];
    const legGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.1, 10);
    const legMat = MAT(0x39465e, { m: 0.6 });
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(s * 0.5, 0.55, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), legMat);
      foot.position.y = -0.5;
      leg.add(foot);
      this.feet.push(leg);
      this.group.add(leg);
    }
    this.bodyMesh = body;
    this.group.add(body, visor);
  }
  update(dt, player, game) {
    if (!this.alive) { this.updateDead(dt); return; }
    this.t += dt;
    this.pt += dt * 0.14 * this.dirS;
    if (this.pt > 1) { this.pt = 1; this.dirS = -1; }
    if (this.pt < 0) { this.pt = 0; this.dirS = 1; }
    this.chainPos.lerpVectors(this.a, this.b, this.pt);
    const stepPhase = Math.sin(this.t * 6) ;
    this.feet[0].rotation.x = stepPhase * 0.5;
    this.feet[1].rotation.x = -stepPhase * 0.5;
    this.group.position.copy(this.chainPos);
    _v1.copy(this.b).sub(this.a);
    this.group.rotation.y = Math.atan2(_v1.x * this.dirS, _v1.z * this.dirS);
    this.bodyMesh.position.y = 1.5 + Math.abs(stepPhase) * 0.08;
    this.tryContactKill(player, game, true);
  }
}

export class Turret extends Enemy {
  constructor(scene, pos, game) {
    super(scene, pos);
    this.radius = 1.1;
    this.fireCool = 1 + Math.random();
    this.base = pos.clone();
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 0.9, 14), MAT(0x3c3550, { r: 0.5 }));
    pod.position.y = 0.45; pod.castShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT(0x574f78, { e: 0x7744ff, ei: 0.4 }));
    dome.position.y = 0.9;
    this.barrel = new THREE.Group();
    this.barrel.position.y = 1.0;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 10), MAT(0x8892aa, { m: 0.85 }));
    tube.rotation.x = Math.PI / 2; tube.position.z = 0.45;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT(0xff3050, { e: 0xff2038, ei: 2.4 }));
    tip.position.z = 0.92;
    this.tipMesh = tip;
    this.barrel.add(tube, tip);
    this.group.add(pod, dome, this.barrel);
    this.gameRef = game;
  }
  update(dt, player, game) {
    if (!this.alive) { this.updateDead(dt); return; }
    this.t += dt;
    const toP = _v1.copy(player.pos).sub(this.base);
    toP.y = 0;
    if (toP.lengthSq() > 0.02) {
      const yaw = Math.atan2(toP.x, toP.z);
      this.group.rotation.y += (yaw - this.group.rotation.y) * clamp(dt * 5, 0, 1);
    }
    const distP = player.pos.distanceTo(this.base);
    this.fireCool -= dt;
    if (distP < 26 && distP > 3 && this.fireCool <= 0 && player.state !== 'dead') {
      this.fireCool = 2.3;
      _v1.copy(player.pos).addScaledVector(UP, 0.4).sub(_v2.copy(this.base).setY(this.base.y + 1));
      _v1.normalize().multiplyScalar(15);
      game.spawnProjectile(_v2.copy(this.base).setY(this.base.y + 1.05), _v1);
    }
    this.tipMesh.material.emissiveIntensity = this.fireCool < 0.4 ? 4 : 2;
    this.tryContactKill(player, game);
  }
}

export class Roller extends Enemy {
  constructor(scene, pos, opts = {}) {
    super(scene, pos);
    this.a = pos.clone(); this.b = opts.to || pos.clone().add(new THREE.Vector3(10, 0, 0));
    this.pt = Math.random(); this.dirS = 1;
    this.speed = opts.speed || 13;
    this.radius = 1.2;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.38, 12, 26), MAT(0x63341f, { r: 0.6 }));
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), MAT(0xff7020, { e: 0xff4000, ei: 1.2 }));
    this.wheelMesh = wheel;
    this.group.add(wheel, hub);
    this.rollA = 0;
    this.axis = _v1.copy(this.b).sub(this.a).normalize().clone();
  }
  update(dt, player, game) {
    if (!this.alive) { this.updateDead(dt); return; }
    this.t += dt;
    this.pt += (dt * this.speed / Math.max(1, this.a.distanceTo(this.b))) * this.dirS;
    if (this.pt > 1) { this.pt = 1; this.dirS = -1; }
    if (this.pt < 0) { this.pt = 0; this.dirS = 1; }
    this.chainPos.lerpVectors(this.a, this.b, this.pt);
    this.chainPos.y += this.radius;
    this.group.position.copy(this.chainPos);
    this.rollA += dt * this.speed * 1.1 * this.dirS;
    this.wheelMesh.rotation.set(0, 0, 0);
    this.group.quaternion.setFromUnitVectors(UP, UP.clone()); // reset
    this.group.rotation.y = Math.atan2(this.axis.x, this.axis.z);
    this.wheelMesh.rotation.x = this.rollA;
    this.tryContactKill(player, game);
  }
}

// ======================= PROJECTILES =======================
export class Projectiles {
  constructor(scene) {
    this.list = [];
    this.scene = scene;
    this.geo = new THREE.SphereGeometry(0.28, 10, 8);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xff4060, emissive: 0xff1030, emissiveIntensity: 2.4, roughness: 0.3 });
    this.pool = [];
  }
  spawn(pos, vel) {
    let p = this.pool.pop();
    if (!p) {
      p = { mesh: new THREE.Mesh(this.geo, this.mat), vel: new THREE.Vector3(), life: 0, alive: false };
      this.scene.add(p.mesh);
    }
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.vel.copy(vel);
    p.life = 6; p.alive = true;
    this.list.push(p);
  }
  update(dt, player, game) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pp = p.mesh.position;
      let dead = p.life <= 0;
      if (!dead && player.state !== 'dead') {
        const d2 = pp.distanceToSquared(player.pos);
        if (d2 < 1.2) {
          player.hurt(pp);
          dead = true;
        } else if ((player.boosting || player.state === 'chain' || player.speed > 24) && d2 < 4.5) {
          // smash projectiles with speed
          dead = true;
          game.onProjectileDestroyed(pp);
        }
      }
      if (pp.y < game.killY) dead = true;
      if (dead) {
        p.alive = false; p.mesh.visible = false;
        this.list.splice(i, 1);
        this.pool.push(p);
      }
    }
  }
}

// ======================= MANAGER =======================
export class Enemies {
  constructor(scene, game) {
    this.list = [];
    this.scene = scene;
    this.game = game;
    this.projectiles = new Projectiles(scene);
  }

  add(type, pos, opts = {}, game) {
    let e;
    switch (type) {
      case 'gnat': e = new Gnat(this.scene, pos, opts); break;
      case 'stomper': e = new Stomper(this.scene, pos, opts); break;
      case 'turret': e = new Turret(this.scene, pos, this.game); break;
      case 'roller': e = new Roller(this.scene, pos, opts); break;
      default: throw new Error('unknown enemy ' + type);
    }
    this.list.push(e);
    return e;
  }

  // best homing-dash target near the player's velocity cone
  findChainTarget(origin, velDir, maxDist) {
    let best = null, bestScore = Infinity;
    const vd = _v1.copy(velDir); vd.y *= 0.4;
    if (vd.lengthSq() < 0.01) vd.set(0, 0, 1);
    vd.normalize();
    for (const e of this.list) {
      if (!e.alive) continue;
      _v2.copy(e.chainPos).sub(origin);
      const d = _v2.length();
      if (d > maxDist) continue;
      _v2.divideScalar(d);
      const dot = _v2.dot(vd);
      if (dot < 0.25) continue;
      const score = d - dot * 14;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  update(dt, player) {
    for (const e of this.list) e.update(dt, player, this.game);
    this.projectiles.update(dt, player, this.game);
  }
}
