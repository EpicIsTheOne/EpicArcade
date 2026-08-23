// ISLEBREAK projectiles: rockets/grenades with gravity-lite arc, splash damage,
// world + build destruction. Pooled meshes.
import * as THREE from 'three';

export class ProjectileSystem {
  constructor(game) {
    this.game = game;
    this.live = [];
    const geo = new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8);
    geo.rotateX(Math.PI / 2);
    this.geo = geo;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x30363e, emissive: 0xff7733, emissiveIntensity: 0.7, roughness: 0.5 });
    // smoke trail pool
    this.trailPool = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: game.fx.impactTex, transparent: true, opacity: 0.5, depthWrite: false,
        color: 0xaaa9a0,
      }));
      s.visible = false;
      s.scale.setScalar(0.6);
      game.scene.add(s);
      this.trailPool.push({ mesh: s, life: 0 });
    }
  }

  spawn(pos, vel, def, owner) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.live.push({ mesh, vel: vel.clone(), def, owner, t: 0 });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      p.vel.y -= 6 * dt;                       // light arc
      const step = p.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      const dir = step.clone().normalize();
      // world hit?
      const hit = g.combat.rayWorld(p.mesh.position, dir, dist + 0.15);
      // character hit?
      const chit = g.combat.raycastCharacters(p.owner, p.mesh.position, dir, dist + 0.15);
      if (hit || chit || p.t > 6) {
        const at = chit
          ? p.mesh.position.clone().addScaledVector(dir, chit.t)
          : hit ? hit.point.clone() : p.mesh.position.clone();
        this.explode(at, p.def, p.owner);
        g.scene.remove(p.mesh);
        this.live.splice(i, 1);
        continue;
      }
      p.mesh.position.add(step);
      p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      // smoke trail
      for (const t of this.trailPool) {
        if (t.life <= 0) {
          t.life = 0.4;
          t.mesh.visible = true;
          t.mesh.position.copy(p.mesh.position);
          break;
        }
      }
    }
    for (const t of this.trailPool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = t.life * 1.2;
      t.mesh.scale.setScalar(0.6 + (0.4 - t.life) * 2);
    }
  }

  explode(pos, def, owner) {
    const g = this.game;
    g.fx.explosion(pos, def.splashRadius);
    g.audio.play('explosion');
    // damage characters in radius
    const R = def.splashRadius;
    const hurt = (c) => {
      if (!c.alive) return;
      const d = Math.hypot(c.pos.x - pos.x, (c.pos.y + 0.9) - pos.y, c.pos.z - pos.z);
      if (d < R) {
        const falloff = 1 - d / R;
        g.combat.applyHit(c, def.splash * falloff, owner, null, true, false);
      }
    };
    hurt(g.player);
    for (const b of g.bots.bots) hurt(b);
    // damage builds & harvestables in radius
    for (const [key, box] of g.physics.builds) {
      const c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
      const d = Math.hypot(c[0] - pos.x, c[1] - pos.y, c[2] - pos.z);
      if (d < R && box.ref?.build) {
        g.builds.damage(box.ref.build, def.dmg * (1 - d / R), owner);
      }
    }
    for (const box of [...g.physics.static]) {
      if (!box.ref?.hp || box.ref.kind === 'monument') continue;
      const c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
      const d = Math.hypot(c[0] - pos.x, c[1] - pos.y, c[2] - pos.z);
      if (d < R) g.harvest.damageCollider(box, def.dmg * (1 - d / R) * 2, owner, { x: c[0], y: c[1], z: c[2] });
    }
  }
}
