import * as THREE from 'three';
import { CFG, RARITY } from './config.js';
import { clamp } from './utils.js';
import { S } from './state.js';
import { rayCast, explosionDamage, applyExplosionResults } from './world.js';
import { tracer, muzzle, impact, explosion as fxExplosion, shake } from './fx.js';
import { sfx } from './audio.js';

export const WEAPONS = {
  ar: {
    id: 'ar', name: 'Raptor AR', class: 'Assault Rifle', ammo: 'medium',
    dmg: 31, headMult: 1.6, rof: 5.2, mag: 30, reload: 2.3,
    spreadHip: 0.021, spreadAds: 0.004, bloom: 0.011, recoil: 0.011,
    range: 240, auto: true, sound: 'ar', tracerEvery: 1,
    pellet: 1,
  },
  smg: {
    id: 'smg', name: 'Stinger SMG', class: 'SMG', ammo: 'light',
    dmg: 17, headMult: 1.5, rof: 11, mag: 32, reload: 1.9,
    spreadHip: 0.03, spreadAds: 0.014, bloom: 0.007, recoil: 0.005,
    range: 140, auto: true, sound: 'smg', tracerEvery: 1, pellet: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'Boomhound Pump', class: 'Shotgun', ammo: 'shells',
    dmg: 11, headMult: 1.7, rof: 1.05, mag: 5, reload: 3.2,
    spreadHip: 0.052, spreadAds: 0.04, bloom: 0, recoil: 0.035,
    range: 42, auto: false, sound: 'shotgun', tracerEvery: 99, pellet: 9,
  },
  sniper: {
    id: 'sniper', name: 'Vantage Bolt', class: 'Sniper Rifle', ammo: 'heavy',
    dmg: 105, headMult: 2.0, rof: 0.75, mag: 1, reload: 2.6,
    spreadHip: 0.045, spreadAds: 0.0012, bloom: 0, recoil: 0.055,
    range: 400, auto: false, sound: 'sniper', tracerEvery: 1, scope: true, pellet: 1,
  },
  rocket: {
    id: 'rocket', name: 'Skybreaker RPG', class: 'Explosive Weapon', ammo: 'rockets',
    dmg: 108, headMult: 1, rof: 0.55, mag: 1, reload: 2.8,
    spreadHip: 0.01, spreadAds: 0.004, bloom: 0, recoil: 0.04,
    range: 300, auto: false, sound: 'rocketFire', projectile: true, blastR: 6.5, pellet: 1,
  },
};

export const PICKAXE = { name: 'Harvesting Tool', dmg: 24, buildDmg: 55, harvestAmt: 26, range: 3.6 };

const projectiles = [];
let projScene = null;

const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();

export function initWeapons(scene) {
  projScene = scene;
}

function camOrigin() {
  const c = S.camera;
  _o.setFromMatrixPosition(c.matrixWorld);
  return _o;
}
function camDir(out) {
  c_getWorldDirection(S.camera, out);
  return out;
}
function c_getWorldDirection(cam, out) {
  return cam.getWorldDirection(out);
}

export function currentSpread(player) {
  const w = player.activeWeaponDef;
  if (!w) return 0.02;
  const moving = player.velLen > 1 ? 1 : 0;
  const base = player.ads ? w.spreadAds : w.spreadHip;
  return base + player.bloom + moving * (player.ads ? 0.004 : 0.012) * (player.crouch ? 0.5 : 1);
}

export function tryFire(player, dt) {
  const w = player.activeWeaponDef;
  if (!w) return;
  if (player.fireCooldown > 0) return;
  if (player.reloading) return;
  const slotItem = player.slots[player.sel];
  if (!slotItem || slotItem.cat !== 'weapon') return;
  if (slotItem.mag <= 0) {
    startReload(player);
    return;
  }
  player.fireCooldown = 1 / w.rof;
  slotItem.mag--;
  player.bloom = Math.min(player.bloom + w.bloom, w.bloom * 9);
  sfx[w.sound]();
  shake(w.recoil * 3);

  if (w.projectile) {
    fireRocket(player, w);
  } else {
    const origin = camOrigin().clone();
    const baseDir = camDir(new THREE.Vector3());
    const pellets = w.pellet || 1;
    let anyHit = null;
    for (let i = 0; i < pellets; i++) {
      const dir = baseDir.clone();
      const sp = currentSpread(player);
      dir.x += (Math.random() - 0.5) * sp * 2;
      dir.y += (Math.random() - 0.5) * sp * 2;
      dir.z += (Math.random() - 0.5) * sp * 2;
      dir.normalize();
      const hit = rayCast(origin, dir, w.range, {});
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, w.range * 0.6);
      const muzPos = muzzleWorldPos();
      tracer(muzPos, end, 0xffe08a);
      if (hit) {
        resolveHit(hit, w, player);
        anyHit = hit;
      }
    }
    if (anyHit && anyHit.kind === 'bot') {
      S.emit('hitmark', { head: anyHit.part === 'head' });
    } else if (anyHit && anyHit.kind === 'player') {
      S.emit('hitmark', {});
    }
    if (pellets === 1 && (!anyHit || anyHit.kind !== 'bot')) {
      S.emit('tracerOnly', {});
    }
  }

  S.emit('ammoChanged');
  if (slotItem.mag <= 0) startReload(player);
}

export function muzzleWorldPos() {
  const p = S.player;
  if (!p) return new THREE.Vector3();
  const fwd = camDir(_dir).clone();
  return p.headPos().addScaledVector(fwd, 0.9).addScaledVector(p.rightVec(), 0.28);
}

function resolveHit(hit, w, shooterPlayer) {
  const rarityMult = shooterPlayer.activeWeaponRarityMult || 1;
  const isHead = hit.part === 'head';
  let dmg = w.dmg * rarityMult;
  if (isHead) dmg *= w.headMult;

  if (hit.kind === 'bot') {
    import('./bots.js').then(b => b.damageBot(hit.obj, dmg, isHead, shooterPlayer, w.name));
    impact(hit.point, 0x7fd4ff);
  } else if (hit.kind === 'panel') {
    import('./world.js').then(wo => wo.panelDamage(hit.obj, w.id === 'shotgun' ? dmg * 0.4 : dmg, hit.point));
  } else if (hit.kind === 'build') {
    import('./building.js').then(b => b.damagePiece(hit.obj, dmg, hit.point));
  } else if (hit.kind === 'harvest') {
    import('./world.js').then(wo => wo.damageHarvest(hit.obj, dmg, hit.point));
  } else if (hit.kind === 'terrain' || hit.kind === 'water') {
    impact(hit.point, 0xbfa77a);
  }
}

const rocketsFired = [];
export function fireRocket(player, w) {
  const origin = muzzleWorldPos();
  const dir = camDir(new THREE.Vector3()).normalize();
  const geo = new THREE.ConeGeometry(0.16, 0.7, 8);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff8844 }));
  mesh.position.copy(origin);
  projScene.add(mesh);
  const proj = {
    mesh, pos: origin.clone(), vel: dir.multiplyScalar(34), life: 5, owner: player,
    trail: 0,
  };
  projectiles.push(proj);
}

export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.life -= dt;
    const step = pr.vel.length() * dt;
    const dir = pr.vel.clone().normalize();
    const hit = rayCast(pr.pos, dir, step + 0.3, { bots: true });
    pr.pos.addScaledVector(dir, step);
    pr.mesh.position.copy(pr.pos);
    pr.mesh.lookAt(pr.pos.clone().add(dir));
    pr.trail -= dt;
    if (pr.trail <= 0) {
      pr.trail = 0.03;
      import('./fx.js').then(fx => fx.spawnParticles(pr.pos, { count: 2, color: 0x999999, speed: 1, life: 0.5, size: 0.6, gravity: -1 }));
    }
    let boomAt = null;
    if (hit) boomAt = hit.point;
    else if (pr.life <= 0) boomAt = pr.pos;
    if (boomAt) {
      projScene.remove(pr.mesh);
      projectiles.splice(i, 1);
      detonate(boomAt, pr.owner);
    }
  }
}

export function detonate(pos, owner) {
  const w = WEAPONS.rocket;
  fxExplosion(pos, w.blastR);
  const results = explosionDamage(pos, w.blastR, w.dmg, !!owner && owner.isDebugFalse !== true ? owner : null);
  applyExplosionResults(results);
  const distToCam = pos.distanceTo(S.camera.position);
  sfx.explosion(distToCam);
}

export function startReload(player) {
  const item = player.slots[player.sel];
  if (!item || item.cat !== 'weapon') return;
  const w = WEAPONS[item.defId];
  if (!w || item.mag >= w.mag) return;
  const reserve = player.ammo[w.ammo] || 0;
  if (reserve <= 0) return;
  if (player.reloading) return;
  player.reloading = true;
  player.reloadT = w.reload;
  sfx.reloadStart();
  S.emit('reloadStarted', { dur: w.reload });
}

export function updateReload(player, dt) {
  if (!player.reloading) return;
  player.reloadT -= dt;
  if (player.reloadT <= 0) {
    const item = player.slots[player.sel];
    const w = WEAPONS[item.defId];
    const need = w.mag - item.mag;
    const take = Math.min(need, player.ammo[w.ammo]);
    item.mag += take;
    player.ammo[w.ammo] -= take;
    player.reloading = false;
    sfx.reloadEnd();
    S.emit('ammoChanged');
  }
}

export function makeWeaponInstance(defId, rarityIdx) {
  return { cat: 'weapon', defId, rarity: rarityIdx, mag: WEAPONS[defId].mag };
}

export function rarityMult(idx) {
  return RARITY[clamp(idx, 0, 4)].mult;
}
