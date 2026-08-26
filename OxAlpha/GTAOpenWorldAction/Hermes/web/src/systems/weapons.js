// CHROME HARBOR — weapons: defs, hitscan raycasts vs world/entities, NPC shooting.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

export const WEAPONS = {
  fist:    { id: 'fist', name: 'FISTS', melee: true, dmg: 16, rate: 2.2, range: 1.9 },
  pistol:  { id: 'pistol', name: 'P9 SIDEARM', dmg: 24, rate: 3.4, mag: 12, reload: 1.05, spread: 0.014, rng: 75, auto: false, buyPrice: 250 },
  smg:     { id: 'smg', name: 'K-11 SMG', dmg: 13, rate: 10.5, mag: 30, reload: 1.55, spread: 0.038, rng: 58, auto: true, buyPrice: 620 },
  shotgun: { id: 'shotgun', name: 'ROADSWEEPER', dmg: 10, pellets: 7, rate: 1.15, mag: 6, reload: 2.1, spread: 0.07, rng: 28, auto: false, buyPrice: 900 },
  rifle:   { id: 'rifle', name: 'LR CARBINE', dmg: 32, rate: 6.8, mag: 24, reload: 1.85, spread: 0.02, rng: 115, auto: true, buyPrice: 1450 },
};

export class WeaponsSys {
  constructor(ctx) {
    this.ctx = ctx;
    this.WEAPONS = WEAPONS;   // players read defs via ctx.weapons.WEAPONS
    ctx.events.on('gunshot', () => {});
  }

  // main player fire entry (from Player.tryFire)
  fireHitscan({ shooter, origin, dir, def, spread }) {
    const pellets = def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const d = dir.clone();
      if (spread > 0) {
        d.x += (Math.random() - 0.5) * spread * 2;
        d.y += (Math.random() - 0.5) * spread * 2;
        d.z += (Math.random() - 0.5) * spread * 2;
        d.normalize();
      }
      this.traceShot(shooter, origin, d, def);
    }
    this.ctx.particles.muzzle(origin.x + dir.x * 0.2, origin.y, origin.z + dir.z * 0.2, dir);
    this.ctx.audio?.shot(def.id);
    this.ctx.events.emit('gunshot', { x: origin.x, z: origin.z });
    // peds panic
    this.ctx.npcs.alertNear(origin.x, origin.z, 26);
    if (shooter === this.ctx.player) {
      this.ctx.events.emit('crime', { type: 'gunfire', x: origin.x, z: origin.z, severity: 18 });
    }
  }

  traceShot(shooter, origin, dir, def) {
    let bestT = def.rng;
    let hit = null;

    // static world
    const q = [];
    const step = 12;
    const seen = new Set();
    for (let t = 2; t < bestT; t += step) {
      const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
      this.ctx.colliders.query(px, pz, step / 2 + 2, q);
      for (const b of q) {
        if (seen.has(b)) continue;
        seen.add(b);
        // slab
        let tmin = -Infinity, tmax = Infinity;
        if (Math.abs(dir.x) < 1e-9) { if (origin.x < b.x0 || origin.x > b.x1) continue; }
        else {
          let t1 = (b.x0 - origin.x) / dir.x, t2 = (b.x1 - origin.x) / dir.x;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (Math.abs(dir.z) < 1e-9) { if (origin.z < b.z0 || origin.z > b.z1) continue; }
        else {
          let t1 = (b.z0 - origin.z) / dir.z, t2 = (b.z1 - origin.z) / dir.z;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        const tHit = Math.max(tmin, 0);
        if (tmax >= tHit && tHit < bestT) {
          const yAt = origin.y + dir.y * tHit;
          if (yAt >= 0 && yAt <= b.h) { bestT = tHit; hit = { kind: 'wall' }; }
        }
      }
    }

    // ground
    if (dir.y < -0.001 && origin.y + dir.y * bestT < 0.02) {
      const tg = -origin.y / dir.y;
      if (tg < bestT) { bestT = tg; hit = { kind: 'ground' }; }
    }

    // vehicles
    for (const v of this.ctx.vehicles) {
      const ex = v.pos.x - origin.x, ez = v.pos.z - origin.z;
      const along = ex * dir.x + ez * dir.z;
      if (along < 0 || along > bestT + v.spec.len) continue;
      const lat = Math.abs(ex * dir.z - ez * dir.x);
      const r = Math.max(v.spec.wid, v.spec.len * 0.36);
      if (lat < r) {
        const yAt = origin.y + dir.y * along;
        if (yAt < v.spec.h + 0.4) { bestT = along; hit = { kind: 'vehicle', obj: v }; }
      }
    }

    // peds & cops (sphere at torso)
    const tryPed = (p, isCop) => {
      if (!p || p.dead) return;
      const ex = p.pos.x - origin.x, ez = p.pos.z - origin.z;
      const along = ex * dir.x + ez * dir.z;
      if (along < 0.4 || along > bestT) return;
      const cx = origin.x + dir.x * along, cz = origin.z + dir.z * along;
      const dx = p.pos.x - cx, dz = p.pos.z - cz;
      if (dx * dx + dz * dz < 0.42 ** 2 + 0.14) {
        const yAt = origin.y + dir.y * along;
        if (yAt > 0.2 && yAt < 1.95) { bestT = along; hit = { kind: isCop ? 'cop' : 'ped', obj: p }; }
      }
    };
    for (const p of this.ctx.npcs.peds) {
      if (shooter === p) continue;
      tryPed(p, false);
    }
    for (const c of this.ctx.police.cops) tryPed(c, true);
    // player being shot handled via npcShoot below

    const hx = origin.x + dir.x * bestT, hy = origin.y + dir.y * bestT, hz = origin.z + dir.z * bestT;
    this.ctx.particles.tracer(origin.x, origin.y, origin.z, hx, hy, hz);

    if (!hit) return;
    switch (hit.kind) {
      case 'wall':
      case 'ground':
        this.ctx.particles.sparks(hx, hy, hz, 4, '#d8cdb8');
        break;
      case 'vehicle': {
        hit.obj.applyDamage(def.dmg * 0.7, shooter === this.ctx.player ? this.ctx.player : null);
        this.ctx.particles.sparks(hx, hy, hz, 5, '#ffd27e');
        this.ctx.audio?.ricochet();
        if (hit.obj.isPolice) this.ctx.events.emit('crime', { type: 'shoot_police', x: hx, z: hz, severity: 45 });
        break;
      }
      case 'ped':
        hit.obj.takeDamage(def.dmg, { from: shooter });
        this.ctx.particles.bloodPuff(hx, hy, hz);
        if (shooter === this.ctx.player) { this.ctx.hud.hitmark(); this.ctx.audio?.hitmark(); }
        break;
      case 'cop':
        hit.obj.takeDamage(def.dmg, { from: shooter });
        this.ctx.particles.bloodPuff(hx, hy, hz);
        if (shooter === this.ctx.player) { this.ctx.hud.hitmark(); this.ctx.audio?.hitmark(); }
        break;
    }
  }

  // NPCs/cops shooting at the player
  npcShoot({ from, target, origin, accuracy, dmg, cop }) {
    const dir = new THREE.Vector3(target.pos.x - origin.x, (target.pos.y ?? 0) + 1.2 - origin.y, target.pos.z - origin.z);
    const dist = dir.length();
    dir.normalize();
    // accuracy scatter
    const miss = (1 - accuracy) * 0.22;
    dir.x += (Math.random() - 0.5) * miss;
    dir.y += (Math.random() - 0.5) * miss * 0.6;
    dir.z += (Math.random() - 0.5) * miss;
    dir.normalize();

    // does it actually reach? check wall blockage
    let blocked = false;
    const q = [];
    const step = 10;
    const seen = new Set();
    for (let t = 1; t < dist; t += step) {
      const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
      this.ctx.colliders.query(px, pz, step / 2 + 2, q);
      for (const b of q) {
        if (seen.has(b)) continue; seen.add(b);
        let tmin = -Infinity, tmax = Infinity;
        if (Math.abs(dir.x) < 1e-9) { if (origin.x < b.x0 || origin.x > b.x1) continue; }
        else {
          let t1 = (b.x0 - origin.x) / dir.x, t2 = (b.x1 - origin.x) / dir.x;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (Math.abs(dir.z) < 1e-9) { if (origin.z < b.z0 || origin.z > b.z1) continue; }
        else {
          let t1 = (b.z0 - origin.z) / dir.z, t2 = (b.z1 - origin.z) / dir.z;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        const th = Math.max(tmin, 0);
        if (tmax >= th && th < dist) {
          const yAt = origin.y + dir.y * th;
          if (yAt >= 0 && yAt <= b.h) blocked = true;
        }
      }
      if (blocked) break;
    }

    const end = blocked ? 20 : Math.min(dist, 60);
    const hx = origin.x + dir.x * end, hy = origin.y + dir.y * end, hz = origin.z + dir.z * end;
    this.ctx.particles.tracer(origin.x, origin.y, origin.z, hx, hy, hz);
    this.ctx.particles.muzzle(origin.x + dir.x * 0.25, origin.y, origin.z + dir.z * 0.25, dir);
    this.ctx.audio?.shot('pistol');
    this.ctx.events.emit('gunshot', { x: origin.x, z: origin.z });

    if (blocked) { this.ctx.particles.sparks(hx, hy, hz, 3, '#d8cdb8'); return; }

    const hitDist = Math.hypot(target.pos.x - hx, target.pos.z - hz);
    if (!blocked && hitDist < 1.1 && !target.dead) {
      target.applyDamage(dmg, cop ? { cop: true } : { from });
      this.ctx.hud.pulseDamage();
    } else if (Math.random() < 0.5) {
      this.ctx.particles.sparks(hx, hy, hz, 3, '#d8cdb8');
    }
  }
}
