// ISLEBREAK combat: hitscan + projectile weapons, damage application,
// headshot zones via collider height test, pickaxe harvesting.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const MAX_RANGE = 420;

export class CombatSystem {
  constructor(game) { this.game = game; this.shotCounter = 0; }

  // Raycast world (static colliders + builds). Returns {t, point, normal, box} or null.
  rayWorld(origin, dir, maxDist, filter = null) {
    let bestT = maxDist, bestBox = null;
    const g = this.game;
    for (const b of g.physics.static) {
      if (b.noHit) continue;
      const t = rayBoxT(origin, dir, b.min, b.max);
      if (t !== null && t < bestT && (!filter || filter(b))) { bestT = t; bestBox = b; }
    }
    for (const b of g.physics.builds.values()) {
      const t = rayBoxT(origin, dir, b.min, b.max);
      if (t !== null && t < bestT && (!filter || filter(b))) { bestT = t; bestBox = b; }
    }
    if (!bestBox) return null;
    const point = new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    // normal from face proximity
    const bb = bestBox;
    const eps = 0.01;
    let n = new THREE.Vector3();
    if (Math.abs(point.x - bb.min[0]) < eps) n.set(-1, 0, 0);
    else if (Math.abs(point.x - bb.max[0]) < eps) n.set(1, 0, 0);
    else if (Math.abs(point.y - bb.min[1]) < eps) n.set(0, -1, 0);
    else if (Math.abs(point.y - bb.max[1]) < eps) n.set(0, 1, 0);
    else if (Math.abs(point.z - bb.min[2]) < eps) n.set(0, 0, -1);
    else n.set(0, 0, 1);
    return { t: bestT, point, normal: n, box: bestBox };
  }

  rayWorldBlocked(origin, dir, dist) {
    return !!this.rayWorld(origin, dir, dist);
  }

  // Terrain-aware line of sight: samples the island heightfield along the ray.
  // Hills now actually block sight/fire. Returns true if blocked.
  terrainLosBlocked(from, to, margin = 0.6) {
    const g = this.game;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.min(24, Math.max(3, Math.floor(len / 9)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const lx = from.x + dx * t, ly = from.y + dy * t, lz = from.z + dz * t;
      if (g.island.height(lx, lz) > ly + margin) return true;
    }
    return false;
  }

  // Full block check: world geometry OR terrain silhouette.
  losBlocked(from, to) {
    if (this.terrainLosBlocked(from, to)) return true;
    const dir = _v2.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const dist = dir.length();
    dir.normalize();
    return !!this.rayWorld(from, dir, Math.max(0.1, dist - 0.6));
  }

  // Character hit test along a ray. Characters have capsule-ish AABB:
  // body box (y..y+1.45), head box (y+1.45..y+1.8).
  raycastCharacters(shooter, origin, dir, maxDist) {
    const g = this.game;
    let best = null, bestT = maxDist;
    const tryChar = (c) => {
      if (!c.alive || c === shooter) return;
      const min = [c.pos.x - 0.42, c.pos.y, c.pos.z - 0.42];
      const max = [c.pos.x + 0.42, c.pos.y + (c.crouch ? 1.2 : 1.5), c.pos.z + 0.42];
      const tb = rayBoxT(origin, dir, min, max);
      if (tb === null || tb >= bestT) return;
      const hmin = [c.pos.x - 0.26, c.pos.y + (c.crouch ? 1.2 : 1.5), c.pos.z - 0.26];
      const hmax = [c.pos.x + 0.26, c.pos.y + (c.crouch ? 1.55 : 1.85), c.pos.z + 0.26];
      const th = rayBoxT(origin, dir, hmin, hmax);
      best = { char: c, head: th !== null && th <= tb + 0.05, t: Math.min(tb, th ?? tb) };
      bestT = best.t;
    };
    tryChar(g.player);
    for (const b of g.bots.bots) tryChar(b);
    return best;
  }

  fireHitscanOrProjectile(shooter, def) {
    const g = this.game;
    this.shotCounter++;
    const origin = _v1.set(shooter.pos.x, shooter.pos.y + 1.55, shooter.pos.z);
    const baseDir = shooter.lookDir ? shooter.lookDir(_v2).clone() : _v2.set(0, 0, -1).clone();
    // muzzle world position (offset right/up/forward)
    const muzzle = origin.clone().addScaledVector(baseDir, 0.9);

    if (def.projectileSpeed) {
      g.fx.muzzleFlash(muzzle);
      const dir = applySpread(baseDir, def.spread, shooter.ads);
      g.projectiles.spawn(muzzle, dir.multiplyScalar(def.projectileSpeed), def, shooter);
      return;
    }

    const pellets = def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const dir = applySpread(baseDir, def.spread * (shooter.ads ? 0.55 : 1), shooter.ads);
      this.fireOneRay(shooter, origin, dir, def, muzzle);
    }
    g.fx.muzzleFlash(muzzle);
    // shell casings / recoil handled by caller
  }

  fireOneRay(shooter, origin, dir, def, muzzle) {
    const g = this.game;
    const wallHit = this.rayWorld(origin, dir, MAX_RANGE);
    const charHit = this.raycastCharacters(shooter, origin, dir, wallHit ? wallHit.t : MAX_RANGE);
    const end = charHit
      ? origin.clone().addScaledVector(dir, charHit.t)
      : wallHit ? wallHit.point.clone() : origin.clone().addScaledVector(dir, MAX_RANGE);
    g.fx.tracer(muzzle, end, def.tracer);
    if (charHit) {
      const dmgBase = def.dmg * (charHit.head ? def.headMult : 1);
      this.applyHit(charHit.char, dmgBase, shooter, def, charHit.hit ?? charHit.head, charHit.head);
      g.fx.impact(end, 'flesh', charHit.head);
    } else if (wallHit) {
      const ref = wallHit.box.ref;
      if (ref && ref.hp) {
        g.harvest.damageCollider(wallHit.box, def.dmg, shooter, end);
      }
      g.fx.impact(end, ref?.kind === 'build' ? ref.harvest : 'world');
    }
  }

  // Direct damage application with shield-first rule + kill credit.
  applyHit(victim, dmg, source, def, showMarker, headshot) {
    const g = this.game;
    victim.applyDamage(dmg, source, def?.cls || 'hit');
    if (source?.isPlayer) g.fx.hitConfirm(headshot);
    if (source?.isPlayer && showMarker) g.hud.hitmarker(headshot);
    if (!victim.alive && source) {
      source.eliminations = (source.eliminations || 0) + 1;
      g.onElimination(source, victim, headshot);
    }
  }

  pickaxeHit(player) {
    const g = this.game;
    const origin = player.eyePos(new THREE.Vector3());
    const d2 = player.lookDir(new THREE.Vector3());
    const wallHit = this.rayWorld(origin, d2, 3.4);
    const charHit = this.raycastCharacters(player, origin, d2, 3.4);
    if (charHit) {
      this.applyHit(charHit.char, 20, player, null, true, false);
      g.fx.impact(origin.clone().addScaledVector(d2, charHit.t), 'flesh');
      return;
    }
    if (!wallHit) { g.audio?.play('whiff'); return; }
    const ref = wallHit.box.ref;
    g.fx.impact(wallHit.point, ref?.harvest || 'world');
    if (ref && ref.hp) {
      g.harvest.damageCollider(wallHit.box, 34, player, wallHit.point);
    } else {
      g.audio?.play('thock');
    }
  }
}

function applySpread(dir, spread, ads) {
  const out = dir.clone();
  if (ads) spread *= 0.6;
  out.x += (Math.random() - 0.5) * 2 * spread;
  out.y += (Math.random() - 0.5) * 2 * spread;
  out.z += (Math.random() - 0.5) * 2 * spread;
  return out.normalize();
}

export function rayBoxT(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (let ax = 0; ax < 3; ax++) {
    const oc = ax === 0 ? o.x : ax === 1 ? o.y : o.z;
    const dc = ax === 0 ? d.x : ax === 1 ? d.y : d.z;
    const mn = min[ax], mxv = max[ax];
    if (Math.abs(dc) < 1e-9) {
      if (oc < mn || oc > mxv) return null;
    } else {
      let t1 = (mn - oc) / dc, t2 = (mxv - oc) / dc;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0.001 ? tmin : (tmax > 0.001 ? 0.001 : null);
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
