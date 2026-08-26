// enemies.js — original hostile bots built from primitives.
// Killed by any attack state (boost ram / jump stomp / Zephyr Strike dive);
// otherwise they hurt the player on contact.
import * as THREE from 'three';

function bodyMat(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: .55, metalness: .35 }); }
function eyeMat(c = 0xff2244) { return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c), emissiveIntensity: 2.4 }); }

export class Enemy {
  constructor(type, pos, opts = {}) {
    this.type = type;
    this.pos = pos.clone();
    this.home = pos.clone();
    this.alive = true;
    this.radius = opts.radius || 0.9;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.t = Math.random() * 10;
    this.deadT = 0;
  }
  kill(fx) {
    if (!this.alive) return;
    this.alive = false;
    fx.burst(this.pos, 26, { color: '#ff8c42', speed: 11, life: .7, size: .6, upBias: 1.4 });
    fx.burst(this.pos, 12, { color: '#ffe29a', speed: 6, life: .5, size: .5 });
    this.group.visible = false;
  }
  baseUpdate(dt, player, game) {
    this.t += dt;
    if (!this.alive) return false;
    this.group.position.copy(this.pos);
    const dToP = this.pos.distanceTo(player.pos);
    // contact resolution
    if (dToP < this.radius + player.radius && player.invulnT <= 0) {
      if (player.isAttacking()) {
        game.killEnemy(this, player.boosting ? 'ram' : (!player.grounded && player.vel.y < -3.5 ? 'stomp' : 'attack'));
        return true;
      } else {
        if (player.hurt(this.pos)) game.onPlayerHit();
      }
    }
    return true;
  }
}

/** SCRAPPER — patrolling hover-crab that lunges when close. */
export class Scrapper extends Enemy {
  constructor(pos, opts = {}) {
    super('scrapper', pos, opts);
    this.range = opts.range ?? 6;
    this.axis = opts.axis || 'x';
    this.speed = opts.speed || 3.2;
    this.lungeCd = 0;

    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), bodyMat(0xd8453e));
    shell.scale.set(1.25, 0.75, 1); this.group.add(shell);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), bodyMat(0x8c241f));
    belly.position.y = -0.18; this.group.add(belly);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), eyeMat());
    eye.position.set(0, 0.18, 0.52); this.group.add(eye); this.eye = eye;
    [-1, 1].forEach(s => {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), bodyMat(0xf2f0e6));
      claw.rotation.x = Math.PI / 2; claw.position.set(s * 0.55, -0.1, 0.35);
      this.group.add(claw);
    });
  }
  update(dt, player, game) {
    if (!this.baseUpdate(dt, player, game)) return;
    // patrol back/forth on axis
    const off = Math.sin(this.t * this.speed / this.range) * this.range;
    this.pos.copy(this.home);
    if (this.axis === 'x') this.pos.x += off; else this.pos.z += off;
    this.pos.y += Math.sin(this.t * 3) * 0.15 + 0.55;
    // face player when near
    const d = this.pos.distanceTo(player.pos);
    if (d < 16) {
      this.group.lookAt(player.pos.x, this.pos.y, player.pos.z);
      if (d < 9 && this.lungeCd <= 0) {
        this.lungeCd = 2.4;
        const dir = new THREE.Vector3().subVectors(player.pos, this.pos).normalize();
        this.pos.addScaledVector(dir, 3.2);
      }
    } else this.group.rotation.y += dt;
    this.eye.material.emissiveIntensity = d < 12 ? 3.4 : 1.6;
    this.lungeCd -= dt;
  }
}

/** BOLTURRET — floor turret firing slow dodgeable orbs. */
export class Turret extends Enemy {
  constructor(pos, opts = {}) {
    super('turret', pos, opts);
    this.cd = 1.4 + Math.random();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.82, 0.5, 10), bodyMat(0x394066));
    base.position.y = 0.25; this.group.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat(0x50599a));
    dome.position.y = 0.5; this.group.add(dome);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.85, 8), bodyMat(0x22283f));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.62, 0.35); this.group.add(barrel);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), eyeMat(0x66aaff));
    eye.position.set(0, 0.68, 0.28); this.group.add(eye); this.eye = eye;
  }
  update(dt, player, game) {
    if (!this.baseUpdate(dt, player, game)) return;
    this.cd -= dt;
    const d = this.pos.distanceTo(player.pos);
    if (d < 34) {
      this.group.lookAt(player.pos.x, player.pos.y, player.pos.z);
      if (this.cd <= 0) {
        this.cd = 2.1;
        const dir = new THREE.Vector3().subVectors(player.pos, this.pos).normalize();
        game.spawnOrb(this.pos.clone().addScaledVector(dir, 1), dir.multiplyScalar(13));
        game.audio.tone('square', 340, 180, 0.12, 0.08);
      }
    }
  }
}

/** ZINGER — figure-8 patrol drone that swoops. */
export class Zinger extends Enemy {
  constructor(pos, opts = {}) {
    super('zinger', pos, opts);
    this.R = opts.radius || 7;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), bodyMat(0xb03bd6));
    this.group.add(core); this.core = core;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.07, 8, 20), eyeMat(0xdd77ff));
    ring.rotation.x = Math.PI / 2; this.group.add(ring); this.ring = ring;
    this.hoverY = pos.y;
  }
  update(dt, player, game) {
    if (!this.baseUpdate(dt, player, game)) return;
    const a = this.t * 1.1;
    this.pos.set(
      this.home.x + Math.sin(a) * this.R,
      this.hoverY + Math.sin(a * 2) * 0.8,
      this.home.z + Math.sin(a * 2) * this.R * 0.55
    );
    this.core.rotation.y += dt * 4;
    this.ring.rotation.z += dt * 2.4;
  }
}
