// Original enemies & hazards built for flow: destroy on the move, never stall.
// drone (hover bot), walker (patrol bot), spikeball (invulnerable rotating hazard).
import * as THREE from 'three';

export class Enemies {
  constructor(scene) {
    this.list = [];
    this.scene = scene;
  }
  spawn(spec) {
    let e = null;
    if (spec.type === 'drone') e = this._drone(spec);
    else if (spec.type === 'walker') e = this._walker(spec);
    else if (spec.type === 'spike') e = this._spike(spec);
    if (e) {
      e.destroyed = false; e.invuln = !!spec.invuln;
      e.destroy = (player) => {
        if (e.destroyed) return;
        e.destroyed = true;
        e.group.visible = false;
      };
      this.list.push(e);
    }
    return e;
  }
  _base(pos, r) {
    const g = new THREE.Group();
    g.position.copy(pos);
    this.scene.add(g);
    return { pos: pos.clone(), group: g, r, t: Math.random() * 10 };
  }
  _drone(spec) {
    const e = this._base(spec.pos, .9);
    const body = new THREE.Mesh(new THREE.SphereGeometry(.55, 12, 9),
      new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: .4, metalness: .6 }));
    body.castShadow = true; e.group.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x300010, emissive: 0xff2040, emissiveIntensity: 2.5 }));
    eye.position.set(0, 0, .42); e.group.add(eye); e.eye = eye;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.75, .07, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0x11151f, emissive: 0xff3d81, emissiveIntensity: .9 }));
    ring.rotation.x = Math.PI / 2; e.group.add(ring); e.ring = ring;
    e.anchor = spec.pos.clone();
    e.range = spec.range ?? 8;
    e.speed = spec.speed ?? 3.2;
    e.update = (dt, player) => {
      e.t += dt;
      // bob + slow chase when player near
      const target = e.anchor.clone();
      if (!player.dead && player.pos.distanceTo(e.pos) < 20) {
        target.copy(player.pos); target.y += 1.4;
      }
      const to = target.clone().sub(e.pos);
      const d = to.length();
      if (d > 1) to.multiplyScalar(Math.min(e.speed, d * 2) / d);
      e.pos.addScaledVector(to, dt);
      // keep within anchor range
      const ad = e.pos.distanceTo(e.anchor);
      if (ad > e.range + 14) e.pos.lerp(e.anchor, dt);
      e.group.position.copy(e.pos);
      e.group.position.y += Math.sin(e.t * 3) * .18;
      e.ring.rotation.z += dt * 2.4;
      e.eye.material.emissiveIntensity = 2 + Math.sin(e.t * 7) * .8;
    };
    return e;
  }
  _walker(spec) {
    const e = this._base(spec.pos, .95);
    const body = new THREE.Mesh(new THREE.BoxGeometry(.9, .8, .9),
      new THREE.MeshStandardMaterial({ color: 0x39508a, roughness: .5, metalness: .5 }));
    body.castShadow = true; e.group.add(body); e.body = body;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.5, .14, .06),
      new THREE.MeshStandardMaterial({ color: 0x200, emissive: 0xffaa00, emissiveIntensity: 2 }));
    eye.position.set(0, .12, .46); e.group.add(eye);
    const legGeo = new THREE.CylinderGeometry(.07, .05, .7, 6);
    e.legs = [];
    for (const sx of [-.3, .3]) for (const sz of [-.28, .28]) {
      const l = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x141b2e }));
      l.position.set(sx, -.7, sz); e.group.add(l); e.legs.push(l);
    }
    e.a = spec.pos.clone(); e.b = spec.b ? spec.b.clone() : spec.pos.clone().add(new THREE.Vector3(6, 0, 0));
    e.dirT = 0; e.speed = spec.speed ?? 2.4;
    e.update = (dt, player) => {
      e.t += dt;
      e.dirT += dt * e.speed / e.a.distanceTo(e.b);
      if (e.dirT > 1 || e.dirT < 0) { e.speed *= -1; e.dirT = THREE.MathUtils.clamp(e.dirT, 0, 1); }
      e.pos.copy(e.a).lerp(e.b, e.dirT);
      e.group.position.copy(e.pos);
      e.body.rotation.y = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
      e.legs.forEach((l, i) => l.rotation.x = Math.sin(e.t * 6 + i * Math.PI / 2) * .4);
    };
    return e;
  }
  _spike(spec) {
    const e = this._base(spec.pos, 1.15);
    e.invuln = true;
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.85, 0),
      new THREE.MeshStandardMaterial({ color: 0x232a3d, roughness: .3, metalness: .8, flatShading: true }));
    ball.castShadow = true; e.group.add(ball); e.ball = ball;
    const spikes = [];
    const sg = new THREE.ConeGeometry(.13, .5, 5);
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x8892aa, metalness: .9, roughness: .25 }));
      const dir = new THREE.Vector3().randomDirection();
      s.position.copy(dir.clone().multiplyScalar(.85));
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      e.group.add(s);
    }
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08, spec.len??4, 6), new THREE.MeshStandardMaterial({color:0x444c66}));
    pivot.position.y = -(spec.len??4)/2; e.group.add(pivot);
    e.pivotLen = spec.len ?? 4;
    e.spinAxis = spec.axis ?? 'z';
    e.spinSpeed = spec.speed ?? 1.6;
    e.harmless = false;
    e.isHazardOnly = true;
    e.update = (dt) => {
      e.t += dt * e.spinSpeed;
      // rotate whole assembly around anchor
      e.group.rotation.z = e.spinAxis==='z'? e.t : 0;
      e.group.rotation.x = e.spinAxis==='x'? e.t : 0;
      // hazard position at end of arm
      const a = e.t % (Math.PI*2);
      e.pos.copy(e.group.position).add(new THREE.Vector3(Math.sin(a)*0, -Math.cos(a)*(e.pivotLen), 0).applyAxisAngle(new THREE.Vector3(0,0,1), 0));
      e.pos.set(
        e.group.position.x,
        e.group.position.y - Math.cos(a) * e.pivotLen,
        e.group.position.z
      );
      if (e.spinAxis==='x'){ e.pos.set(e.group.position.x, e.group.position.y - Math.cos(a)*e.pivotLen, e.group.position.z); }
    };
    return e;
  }
  update(dt, player, fx, audio, director) {
    for (const e of this.list) {
      if (e.destroyed) continue;
      e.update(dt, player);
      // contact
      const d = e.pos.distanceTo(player.pos);
      const hitR = e.r + 0.62;
      if (d < hitR) {
        const attacking = player.attacking && !e.isHazardOnly;
        if (attacking || (player.stomping)) {
          player.hitEnemy(e);
          fx.burst(e.pos, 18, 0xffb02f, 6, .5);
          fx.burst(e.pos, 10, 0xffffff, 8, .3);
        } else if (e.isHazardOnly || !player.attacking) {
          if (player.hurt(e.pos)) {
            fx.burst(player.pos, 16, 0xff3050, 6, .5);
            director?.shake(.5);
          } else {
            // push apart so we don't grind against it while invulnerable
            const away = player.pos.clone().sub(e.pos).normalize();
            player.pos.addScaledVector(away, (hitR - d));
          }
        }
      }
    }
  }
  destroyedCount() { return this.list.filter(e => e.destroyed).length; }
}
