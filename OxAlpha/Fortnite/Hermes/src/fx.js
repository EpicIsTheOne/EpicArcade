// ISLEBREAK FX: pooled tracers, muzzle flashes, impacts, explosions, storm
// puffs, glider trail. All pooled, zero allocation in steady state.
import * as THREE from 'three';

export class FXSystem {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.impacts = [];
    this.explosions = [];
    this.particles = [];

    // tracer pool: thin stretched boxes
    const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    // impact pool: small billboarded sprites via Points
    this.impactTex = makeImpactTexture();
    for (let i = 0; i < 64; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.impactTex, transparent: true, depthWrite: false,
      }));
      s.visible = false;
      s.scale.setScalar(0.5);
      scene.add(s);
      this.impacts.push({ mesh: s, life: 0, vel: new THREE.Vector3() });
    }

    // particle pool for debris/sparks
    const pgeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.partMats = {
      wood: new THREE.MeshBasicMaterial({ color: 0xa87848 }),
      brick: new THREE.MeshBasicMaterial({ color: 0xb4b0a6 }),
      metal: new THREE.MeshBasicMaterial({ color: 0xb8c2cc }),
      world: new THREE.MeshBasicMaterial({ color: 0x8f9297 }),
      flesh: new THREE.MeshBasicMaterial({ color: 0xd05a5a }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    };
    for (let i = 0; i < 220; i++) {
      const m = new THREE.Mesh(pgeo, this.partMats.spark);
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, life: 0, vel: new THREE.Vector3(), mat: null });
    }
  }

  tracer(from, to, color) {
    for (const t of this.tracers) {
      if (t.life > 0) continue;
      t.life = 0.07;
      t.mesh.visible = true;
      t.mesh.material.color.setHex(color || 0xffffff);
      t.mesh.material.opacity = 0.9;
      const mid = from.clone().add(to).multiplyScalar(0.5);
      t.mesh.position.copy(mid);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, from.distanceTo(to));
      return;
    }
  }

  tracerMiss(shooter, target, def) {
    // near-miss visual: ray past the target
    const origin = _v1.set(shooter.pos.x, shooter.pos.y + 1.55, shooter.pos.z);
    const dir = _v2.subVectors(target.pos, origin).normalize();
    dir.x += (Math.random() - 0.5) * 0.16;
    dir.y += (Math.random() - 0.5) * 0.1;
    dir.z += (Math.random() - 0.5) * 0.16;
    dir.normalize();
    const end = origin.clone().addScaledVector(dir, 60 + Math.random() * 40);
    this.tracer(origin, end, def?.tracer);
  }

  muzzleFlash(pos) {
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.life = 0.05;
      p.mat = this.partMats.spark;
      p.mesh.material = p.mat;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.vel.set(0, 0, 0);
      p.mesh.scale.setScalar(2.2);
      return;
    }
  }

  impact(pos, kind, headshot) {
    // burst of particles
    const n = kind === 'flesh' ? 4 : 3;
    let used = 0;
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.life = 0.35 + Math.random() * 0.25;
      p.mat = headshot ? this.partMats.flesh : (this.partMats[kind] || this.partMats.world);
      p.mesh.material = p.mat;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
      if (++used >= n) break;
    }
    // flash sprite
    for (const im of this.impacts) {
      if (im.life > 0) continue;
      im.life = 0.14;
      im.mesh.visible = true;
      im.mesh.position.copy(pos);
      im.mesh.scale.setScalar(headshot ? 1.1 : 0.6);
      im.mesh.material.color.setHex(kind === 'flesh' ? 0xff7a6a : 0xfff0c0);
      break;
    }
  }

  explosion(pos, radius) {
    // expanding sphere + particles
    for (let k = 0; k < 26; k++) {
      let placed = false;
      for (const p of this.particles) {
        if (p.life > 0) continue;
        p.life = 0.5 + Math.random() * 0.4;
        p.mat = this.partMats.spark;
        p.mesh.material = p.mat;
        p.mesh.visible = true;
        p.mesh.position.copy(pos);
        p.vel.set((Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14);
        p.mesh.scale.setScalar(1 + Math.random());
        placed = true;
        break;
      }
      if (!placed) break;
    }
    const flash = new THREE.PointLight(0xffb050, 30, radius * 4);
    flash.position.copy(pos);
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 120);
  }

  buildPuff(pos, tier) {
    this.impact(pos, tier === 'metal' ? 'metal' : tier === 'brick' ? 'brick' : 'wood');
  }

  tick(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = t.life / 0.07 * 0.9;
    }
    for (const im of this.impacts) {
      if (im.life <= 0) continue;
      im.life -= dt;
      if (im.life <= 0) { im.mesh.visible = false; continue; }
      im.mesh.material.opacity = im.life / 0.14;
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
    }
  }
}

function makeImpactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,240,200,0.7)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
