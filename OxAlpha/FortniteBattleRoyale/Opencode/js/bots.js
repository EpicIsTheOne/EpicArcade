import * as THREE from 'three';
import { CFG } from './config.js';
import { S } from './state.js';
import { mulberry32, rand, randInt, pick, clamp, dist2D } from './utils.js';
import { heightAt } from './terrain.js';
import { groundAt, colliders, rayCast } from './world.js';
import { tracer, impact, bloodPuff, muzzle } from './fx.js';
import { WEAPONS, makeWeaponInstance, rarityMult } from './weapons.js';
import { botDropCache } from './loot.js';
import { sfx } from './audio.js';

const NAMES = [
  'NovaFox', 'DriftKing', 'BlazeUp', 'GhostPine', 'Riptide', 'SkyHavoc', 'CobaltAce', 'MirageMist',
  'TurboTide', 'EmberOwl', 'FrostByte', 'ZephyrKid', 'OnyxWolf', 'SolarFlair', 'VexViper', 'NimbusNinja',
  'QuartzQueen', 'RogueRocket', 'StaticStorm', 'TitanTide', 'UmbraUrchin', 'VoltVoyager', 'WildfireWren',
  'XenonX', 'YonderYeti', 'ZenZephyr', 'AuroraAce', 'BoltBadger', 'CinderCloud', 'DuneDrifter',
  'EchoEel', 'FlintFox', 'GaleGlider', 'HorizonHawk', 'IonIbis', 'JetJaguar', 'KrakenKite', 'LumenLynx',
  'MeteorMoth', 'NeonNewt', 'OrbitOtter', 'PrismPanther', 'RadiantRay',
];

const SKINS = [0xc84a4a, 0x4ac87a, 0x4a7dc8, 0xc8a94a, 0x9a4ac8, 0x4ac8c8, 0xd0d0d0, 0x555f6e, 0xe07b3a, 0x7a5c3c];
const skinMats = SKINS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.85 });
const faceMat = new THREE.MeshStandardMaterial({ color: 0xd9b38c, roughness: 0.9 });
const gunMatB = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.5, metalness: 0.5 });
const chuteMat = new THREE.MeshStandardMaterial({ color: 0xd8d8e8, side: THREE.DoubleSide });

let sceneRef = null;
let rng = mulberry32(CFG.SEED + 4242);
let directorTimer = 14;

export function initBots(scene) {
  sceneRef = scene;
}

function makeBotMesh(colorIdx) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 4, 8), skinMats[colorIdx]);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), faceMat);
  head.position.y = 1.62;
  head.castShadow = true;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), gunMatB);
  gun.position.set(0.35, 1.15, -0.35);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.48, 3, 6), darkMat);
  legL.position.set(-0.15, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  const hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x661111, depthTest: false }));
  hpBg.scale.set(1.1, 0.12, 1);
  hpBg.position.y = 2.15;
  const hpFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x33dd44, depthTest: false }));
  hpFg.scale.set(1.05, 0.08, 1);
  hpFg.position.set(0, 2.15, 0.001);
  const chute = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.1, 8, 1, true), chuteMat);
  chute.position.y = 3.1;
  chute.visible = false;
  g.add(body, head, gun, legL, legR, hpBg, hpFg, chute);
  g.visible = false;
  return { group: g, body, head, legL, legR, hpBg, hpFg, chute };
}

export function spawnBots(busPath, playerLandingHint) {
  S.bots.length = 0;
  rng = mulberry32(CFG.SEED + randInt(Math.random, 0, 99999));
  const usedNames = new Set();
  for (let i = 0; i < CFG.TOTAL_PLAYERS - 1; i++) {
    let name = pick(rng, NAMES);
    let guard = 0;
    while (usedNames.has(name) && guard++ < 50) name = pick(rng, NAMES) + randInt(rng, 2, 99);
    usedNames.add(name);

    const t = rand(rng, 0.12, 0.88);
    const jumpPos = busPath.pointAt(t);
    let landX, landZ;
    if (playerLandingHint && rng() < 0.3) {
      landX = playerLandingHint.x + rand(rng, -50, 50);
      landZ = playerLandingHint.z + rand(rng, -50, 50);
    } else {
      const ang = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * CFG.ISLAND_R * 0.92;
      landX = Math.cos(ang) * d;
      landZ = Math.sin(ang) * d;
      if (heightAt(landX, landZ) < 1.5) { landX *= 0.5; landZ *= 0.5; }
    }
    const wdef = pick(rng, ['ar', 'smg', 'smg', 'shotgun', 'ar', 'sniper']);
    const rar = rng() < 0.18 ? 4 : randInt(rng, 0, 3);

    const bot = {
      id: i, name,
      skill: rand(rng, 0.15, 0.95),
      pos: jumpPos.clone(),
      yaw: rand(rng, 0, Math.PI * 2),
      hp: 100, shield: rng() < 0.4 ? randInt(rng, 20, 70) : 0,
      alive: true,
      state: 'bus',
      jumpT: t,
      land: new THREE.Vector3(landX, 0, landZ),
      airT: 0,
      weapon: makeWeaponInstance(wdef, rar),
      magLoaded: WEAPONS[wdef].mag,
      reloadT: 0,
      fireT: rand(rng, 0, 1),
      burstLeft: 0,
      target: null,
      waypoint: null,
      wpT: 0,
      mode: 'drop',
      healT: 0,
      panicCd: 0,
      coverPt: null,
      farAcc: rand(rng, 0, 0.45),
      lastHitT: -99,
      stagedFight: false,
      strafeDir: rng() < 0.5 ? 1 : -1,
      mesh: makeBotMesh(randInt(rng, 0, SKINS.length - 1)),
    };
    bot.land.y = Math.max(heightAt(landX, landZ), 0.5);
    sceneRef.add(bot.mesh.group);
    S.bots.push(bot);
  }
}

export function aliveBots() {
  let n = 0;
  for (const b of S.bots) if (b.alive) n++;
  return n;
}

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function updateBots(dt, busProgress, busPos) {
  const pp = S.player ? S.player.pos : null;
  directorTimer -= dt;
  if (directorTimer <= 0) {
    runDirector();
    directorTimer = S.match.alive <= 8 ? 8 : 24;
  }

  for (const b of S.bots) {
    if (!b.alive) continue;
    b.panicCd -= dt;

    if (b.state === 'bus') {
      if (busProgress >= b.jumpT) {
        b.state = 'skydive';
        b.airT = 0;
        if (busPos) b.pos.copy(busPos);
        _jumpStart.set(b, b.pos.clone());
      } else continue;
    }

    const distToPlayer = pp ? b.pos.distanceTo(pp) : 9999;

    if (b.state === 'skydive') {
      b.airT += dt;
      const totalAirT = 9 + (b.skill * 4);
      const k = clamp(b.airT / totalAirT, 0, 1);
      const start = _jumpStart.get(b) || b.pos;
      const arcY = Math.max(b.land.y, start.y * (1 - k) ** 1.4 + b.land.y * (1 - (1 - k) ** 1.4));
      b.pos.x += (b.land.x - b.pos.x) * clamp(dt * 0.55, 0, 1);
      b.pos.z += (b.land.z - b.pos.z) * clamp(dt * 0.55, 0, 1);
      b.pos.y = arcY;
      b.mesh.chute.visible = k > 0.55 && distToPlayer < 260;
      if (k >= 1 || b.pos.y <= b.land.y + 0.1) {
        b.state = 'ground';
        b.pos.y = groundAt(b.pos.x, b.pos.z, b.pos.y + 1);
        b.mesh.chute.visible = false;
        b.mode = 'loot';
        b.wpT = 0;
      }
      updateBotVisual(b, dt, distToPlayer);
      continue;
    }

    if (distToPlayer > 175) {
      farSim(b, dt);
    } else {
      nearSim(b, dt, distToPlayer);
    }
    updateBotVisual(b, dt, distToPlayer);
  }
}

const _jumpStart = new Map();

function farSim(b, dt) {
  b.farAcc += dt;
  if (b.farAcc < 0.45) return;
  const step = b.farAcc;
  b.farAcc = 0;

  if (S.storm && isOutsideCircle(b.pos, S.storm.cur)) {
    b.mode = 'rotate';
    b.waypoint = insideCirclePoint(S.storm.target || S.storm.cur);
  }

  if (!b.waypoint || b.wpT <= 0) {
    pickWaypoint(b);
    b.wpT = rand(rng, 4, 9);
  }
  b.wpT -= step;

  moveTowardsFlat(b, b.waypoint, 6.6 * step);

  if (S.storm && isOutsideCircle(b.pos, S.storm.cur)) {
    const dps = S.storm.dps;
    applyRawDamage(b, dps * step * 1.2, null, 'the Storm');
  }

  if (b.hp < 55 && b.healT <= 0 && rng() < 0.3) {
    b.healT = 3;
  }
  if (b.healT > 0) {
    b.healT -= step;
    if (b.healT <= 0) {
      b.hp = Math.min(100, b.hp + rand(rng, 20, 45));
    }
  }

  if (rng() < 0.05) {
    for (const o of S.bots) {
      if (!o.alive || o === b || o.state !== 'ground') continue;
      if (o.pos.distanceTo(b.pos) < 26 && rng() < 0.5) {
        const winnerSkill = b.skill / (b.skill + o.skill);
        const loser = rng() < winnerSkill ? o : b;
        const dmg = rand(rng, 34, 78);
        applyRawDamage(loser, dmg, loser === o ? b : o, b.weapon.defId);
        break;
      }
    }
  }
}

function pickWaypoint(b) {
  if (S.storm) {
    const c = S.storm.cur;
    const ang = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * c.r * 0.75;
    b.waypoint = new THREE.Vector3(c.cx + Math.cos(ang) * rr, 0, c.cz + Math.sin(ang) * rr);
    return;
  }
  const ang = rng() * Math.PI * 2;
  b.waypoint = new THREE.Vector3(b.pos.x + Math.cos(ang) * 60, 0, b.pos.z + Math.sin(ang) * 60);
}

function moveTowardsFlat(b, wp, dist) {
  const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return true;
  const nx = dx / d, nz = dz / d;
  const nxPos = b.pos.x + nx * dist, nzPos = b.pos.z + nz * dist;
  if (heightAt(nxPos, nzPos) < CFG.WATER_Y - 0.4) {
    const tx = -nz, tz = nx;
    b.pos.x += tx * dist;
    b.pos.z += tz * dist;
  } else {
    b.pos.x = nxPos;
    b.pos.z = nzPos;
  }
  b.yaw = Math.atan2(-nx, -nz);
  b.pos.y = groundAt(b.pos.x, b.pos.z, b.pos.y + 1.2);
  return d < 2;
}

function nearSim(b, dt, distToPlayer) {
  if (b.reloadT > 0) {
    b.reloadT -= dt;
    if (b.reloadT <= 0) b.magLoaded = WEAPONS[b.weapon.defId].mag;
  }

  if (S.storm && isOutsideCircle(b.pos, S.storm.cur)) {
    b.mode = 'rotate';
    if (!b.waypoint || isOutsideCircle(b.waypoint, S.storm.target || S.storm.cur)) {
      b.waypoint = insideCirclePoint(S.storm.target || S.storm.cur);
    }
  }

  acquireTarget(b, distToPlayer);

  if (b.target && targetAlive(b.target)) {
    combatBehavior(b, dt, distToPlayer);
  } else {
    b.target = null;
    normalBehavior(b, dt);
  }

  if (b.hp < 42 && b.panicCd <= 0 && b.skill > 0.45 && b.target) {
    panicBuild(b);
  }

  if (S.storm && isOutsideCircle(b.pos, S.storm.cur)) {
    applyRawDamage(b, S.storm.dps * dt, null, 'the Storm');
  }
}

function acquireTarget(b, distToPlayer) {
  if (b.target && targetAlive(b.target) && b.pos.distanceTo(targetPos(b.target)) < 70) return;
  b.target = null;
  let best = null, bestD = 62;
  if (S.player && !S.player.dead && distToPlayer < bestD) {
    best = S.player;
    bestD = distToPlayer;
  }
  for (const o of S.bots) {
    if (!o.alive || o === b || o.state !== 'ground') continue;
    const d = o.pos.distanceTo(b.pos);
    if (d < bestD) { best = o; bestD = d; }
  }
  if (best && hasLOS(b, best)) b.target = best;
}

function hasLOS(b, target) {
  const from = _v.set(b.pos.x, b.pos.y + 1.55, b.pos.z);
  const tp = targetPos(target);
  const dir = new THREE.Vector3(tp.x - from.x, tp.y + 1.2 - from.y, tp.z - from.z);
  const d = dir.length();
  dir.normalize();
  const hit = rayCast(from.clone(), dir, d - 0.6, { bots: false, player: false });
  return !hit;
}

function combatBehavior(b, dt, distToPlayer) {
  const tp = targetPos(b.target);
  const dx = tp.x - b.pos.x, dz = tp.z - b.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d, nz = dz / d;

  b.yaw = Math.atan2(-nx, -nz);

  const w = WEAPONS[b.weapon.defId];
  const idealRange = w.id === 'shotgun' ? 9 : w.id === 'smg' ? 16 : 26;
  let mvx = 0, mvz = 0;
  if (d > idealRange + 6) { mvx = nx; mvz = nz; }
  else if (d < idealRange - 4) { mvx = -nx; mvz = -nz; }
  mvx += -nz * b.strafeDir * 0.8;
  mvz += nx * b.strafeDir * 0.8;
  const ml = Math.hypot(mvx, mvz) || 1;
  const spd = 5.6;
  const stepX = mvx / ml * spd * dt, stepZ = mvz / ml * spd * dt;
  if (heightAt(b.pos.x + stepX, b.pos.z + stepZ) > CFG.WATER_Y - 0.4) {
    b.pos.x += stepX; b.pos.z += stepZ;
  }
  b.pos.y = groundAt(b.pos.x, b.pos.z, b.pos.y + 1.2);
  if (rng() < dt * 0.4) b.strafeDir *= -1;

  if (b.reloadT > 0) return;
  b.fireT -= dt;
  if (b.fireT > 0) return;

  if (b.magLoaded <= 0) {
    b.reloadT = w.reload;
    return;
  }

  if (b.burstLeft <= 0) {
    b.burstLeft = w.auto ? randInt(rng, 3, 6) : 1;
    b.fireT = rand(rng, 0.35, 0.9) * (1.4 - b.skill * 0.6);
    return;
  }
  b.burstLeft--;
  b.fireT = 1 / w.rof;
  b.magLoaded--;

  botShoot(b, w, d);
}

function botShoot(b, w, dist) {
  const from = new THREE.Vector3(b.pos.x, b.pos.y + 1.5, b.pos.z).addScaledVector(new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw)), 0.5);
  const tp = targetPos(b.target);
  const aim = new THREE.Vector3(tp.x, tp.y + 1.2, tp.z);
  const err = (1 - b.skill) * 0.09 + dist * 0.0009;
  const hitChance = clamp(0.72 - err * 4 - dist * 0.004 + b.skill * 0.25, 0.08, 0.85);
  const hit = rng() < hitChance;

  let end;
  if (hit) {
    end = aim.clone().addScaledVector(new THREE.Vector3(rand(rng, -1, 1), rand(rng, -1, 1), rand(rng, -1, 1)), 0.2);
  } else {
    end = aim.clone().addScaledVector(new THREE.Vector3(rand(rng, -1, 1), rand(rng, -0.4, 1), rand(rng, -1, 1)).normalize(), 1.2 + rand(rng, 0, 2));
  }
  muzzle(from);
  const camD = from.distanceTo(S.camera.position);
  if (camD < 160) {
    tracer(from, end, 0xffc46a);
    if (w.sound && camD < 120) sfx[w.sound]?.();
  }

  if (hit) {
    const isHead = rng() < 0.13;
    let dmg = w.dmg * rarityMult(b.weapon.rarity) * (w.pellet > 1 ? 4.5 : 1);
    if (isHead) dmg *= 1.5;
    if (b.target === S.player) {
      S.player.damage(dmg, `${b.name}'s ${w.name}`);
    } else {
      damageBot(b.target, dmg, isHead, b, w.name);
    }
    bloodPuff(end);
  } else {
    impact(end, 0xbfa77a);
  }
}

function panicBuild(b) {
  b.panicCd = 9;
  import('./building.js').then(mod => {
    const gx = Math.round((b.pos.x - Math.sin(b.yaw) * 2.5) / CFG.CELL);
    const gz = Math.round((b.pos.z - Math.cos(b.yaw) * 2.5) / CFG.CELL);
    const gy = Math.max(Math.round(b.pos.y / CFG.CELL), 0);
    if (!S.build.pieces.has(`${gx},${gy},${gz}`)) {
      const rot = yawToRot(b.yaw);
      mod.spawnPiece('wall', gx, gy, gz, rot, 'wood', false);
    }
  });
}
function yawToRot(yaw) {
  const a = ((-yaw) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / (Math.PI / 2)) % 4;
}

function normalBehavior(b, dt) {
  if (b.hp < 52 && b.healT <= 0) {
    b.healT = 3.2;
    return;
  }
  if (b.healT > 0) {
    b.healT -= dt;
    if (b.healT <= 0) b.hp = Math.min(100, b.hp + 40);
    return;
  }

  if (!b.waypoint || b.wpT <= 0) {
    if (b.mode === 'loot') {
      const spot = findNearbyLoot(b);
      if (spot) {
        b.waypoint = spot;
        b.wpT = 12;
      } else {
        b.mode = 'roam';
        pickWaypoint(b);
        b.wpT = rand(rng, 6, 11);
      }
    } else {
      pickWaypoint(b);
      b.wpT = rand(rng, 6, 11);
    }
  }
  b.wpT -= dt;

  const arrived = moveTowardsFlat(b, b.waypoint, 6.2 * dt);
  if (arrived) {
    b.wpT = 0;
    if (b.mode === 'loot') tryGrabLoot(b);
  }

  if (b.weapon.rarity >= 2 && rng() < dt * 0.02) {
    b.shield = Math.min(100, b.shield + 20);
  }
}

function findNearbyLoot(b) {
  let best = null, bestD = 80;
  for (const li of S.lootItems) {
    if (li.taken) continue;
    const d = li.pos.distanceTo(b.pos);
    if (d < bestD) { bestD = d; best = li.pos; }
  }
  for (const c of S.chests) {
    if (c.opened) continue;
    const d = c.pos.distanceTo(b.pos);
    if (d < bestD) { bestD = d; best = c.pos; }
  }
  if (!best) return null;
  return new THREE.Vector3(best.x, 0, best.z);
}

function tryGrabLoot(b) {
  for (const li of S.lootItems) {
    if (!li.taken && li.pos.distanceTo(b.pos) < 2.4) {
      import('./loot.js').then(l => l.removeWorldItem(li));
      if (li.item.cat === 'weapon') {
        const curMult = rarityMult(b.weapon.rarity);
        const newMult = rarityMult(li.item.rarity || 0);
        if (newMult > curMult) {
          b.weapon = { cat: 'weapon', defId: li.item.defId, rarity: li.item.rarity };
          b.magLoaded = WEAPONS[b.weapon.defId].mag;
        }
      }
      break;
    }
  }
  for (const c of S.chests) {
    if (!c.opened && c.pos.distanceTo(b.pos) < 2.8) {
      import('./loot.js').then(l => l.openChest(c));
      if (rng() < 0.6) {
        b.weapon.rarity = Math.min(4, b.weapon.rarity + 1);
      }
      break;
    }
  }
  b.mode = 'loot';
}

export function damageBot(bot, amount, isHead, attacker, weaponName) {
  if (!bot.alive) return;
  let rem = amount;
  if (bot.shield > 0) {
    const ab = Math.min(bot.shield, rem);
    bot.shield -= ab;
    rem -= ab;
  }
  bot.hp -= rem;
  bot.lastHitT = performance.now() * 0.001;
  if (attacker && attacker !== bot && (attacker === S.player || attacker.isBot)) {
    bot.target = attacker;
  }
  if (bot.hp <= 0) {
    killBot(bot, attacker, weaponName);
  }
}

function applyRawDamage(bot, amount, attacker, weaponName) {
  damageBot(bot, amount, false, attacker, weaponName);
}

function killBot(bot, attacker, weaponName) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.hp = 0;
  sceneRef.remove(bot.mesh.group);
  S.match.alive--;
  botDropCache(bot);
  const byPlayer = attacker === S.player;
  if (byPlayer) {
    S.match.kills++;
    sfx.elim();
  }
  S.emit('kill', {
    victim: bot.name,
    killer: byPlayer ? 'You' : attacker?.name || weaponName || 'the Storm',
    byPlayer,
    remaining: S.match.alive,
  });
  if (S.match.alive <= 1 && S.player && !S.player.dead) {
    S.emit('victory');
  }
}

export function explosionDamageBots(pos, radius, dmg, sourcePlayer) {
  for (const b of S.bots) {
    if (!b.alive) continue;
    const d = b.pos.distanceTo(pos);
    if (d < radius) {
      damageBot(b, dmg * (1 - d / radius), false, sourcePlayer ? S.player : null, 'explosion');
    }
  }
}

export function forceEliminations(count) {
  const candidates = S.bots.filter(b => b.alive && b !== S.player);
  for (let i = 0; i < count && candidates.length; i++) {
    const idx = randInt(rng, 0, candidates.length - 1);
    const victim = candidates.splice(idx, 1)[0];
    const others = S.bots.filter(b => b.alive && b !== victim);
    const killer = others.length ? pick(rng, others) : null;
    killBot(victim, killer, 'eliminated');
  }
}

function runDirector() {
  const far = S.bots.filter(b => b.alive && b.state === 'ground' && !b.stagedFight &&
    (!S.player || b.pos.distanceTo(S.player.pos) > 180));
  if (far.length < 2) return;
  const maxPairs = S.match.alive > 16 ? 1 : 3;
  const pairs = [];
  for (let i = 0; i < far.length && pairs.length < maxPairs; i++) {
    for (let j = i + 1; j < far.length; j++) {
      if (far[i].pos.distanceTo(far[j].pos) < 110) {
        pairs.push([far[i], far[j]]);
        break;
      }
    }
  }
  for (const [a, bb] of pairs) {
    a.stagedFight = true;
    bb.stagedFight = true;
    setTimeout(() => {
      if (!a.alive || !bb.alive) return;
      const aw = a.skill / (a.skill + bb.skill);
      const loser = rng() < aw ? bb : a;
      const winner = loser === a ? bb : a;
      if (loser.alive && winner.alive) killBot(loser, winner, WEAPONS[winner.weapon.defId].name);
      if (a.alive) a.stagedFight = false;
      if (bb.alive) bb.stagedFight = false;
    }, rand(rng, 2500, 7000));
  }
}

function targetAlive(t) {
  if (t === S.player) return !S.player.dead;
  return t.alive;
}
function targetPos(t) {
  return t === S.player ? S.player.pos : t.pos;
}

function isOutsideCircle(pos, circle) {
  const dx = pos.x - circle.cx, dz = pos.z - circle.cz;
  return dx * dx + dz * dz > circle.r * circle.r;
}
function insideCirclePoint(circle) {
  const ang = rng() * Math.PI * 2;
  const rr = Math.sqrt(rng()) * circle.r * 0.6;
  return new THREE.Vector3(circle.cx + Math.cos(ang) * rr, 0, circle.cz + Math.sin(ang) * rr);
}

function updateBotVisual(b, dt, distToPlayer) {
  const m = b.mesh;
  const vis = distToPlayer < 240;
  m.group.visible = vis;
  if (!vis) return;
  m.group.position.copy(b.pos);
  m.group.rotation.y = b.yaw + Math.PI;
  const walking = b.state === 'ground' && b.wpT !== undefined;
  const t = performance.now() * 0.01;
  m.legL.rotation.x = walking ? Math.sin(t) * 0.5 : 0;
  m.legR.rotation.x = walking ? -Math.sin(t) * 0.5 : 0;

  const now = performance.now() * 0.001;
  const showHp = now - b.lastHitT < 2.5;
  m.hpBg.visible = showHp;
  m.hpFg.visible = showHp;
  if (showHp) {
    const frac = clamp(b.hp / 100, 0, 1);
    m.hpFg.scale.x = 1.05 * frac;
    m.hpFg.position.x = -(1.05 * (1 - frac)) / 2;
    m.hpFg.material.color.setHex(frac > 0.5 ? 0x33dd44 : frac > 0.25 ? 0xddcc33 : 0xdd4433);
  }
}

export function debugKillAll() {
  for (const b of S.bots) if (b.alive) killBot(b, S.bots.find(o => o.alive && o !== b), 'debug');
}
