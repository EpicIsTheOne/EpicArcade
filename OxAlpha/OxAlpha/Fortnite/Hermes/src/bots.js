// ISLEBREAK bots: 47 AI opponents with drop, loot, rotate, fight, heal,
// cover, panic-building, LOD simulation (near = full physics + mesh anim,
// far = kinematic sim at reduced tick rate).
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { GRID, WALL_H } from './build.js';

const BOT_NAMES = [
  'Vex', 'Marrow', 'Kite', 'Sable', 'Onyx', 'Pike', 'Wren', 'Talon',
  'Frost', 'Ember', 'Grit', 'Halo', 'Jinx', 'Lark', 'Moss', 'Nox',
  'Quill', 'Rook', 'Slate', 'Thorn', 'Umbra', 'Vale', 'Wisp', 'Yarrow',
  'Zephyr', 'Bramble', 'Cinder', 'Dune', 'Flint', 'Gale', 'Hollow', 'Ion',
  'Juno', 'Krow', 'Lyra', 'Mica', 'Nimble', 'Oryx', 'Pyre', 'Reef',
  'Slate2', 'Tide', 'Vane', 'Wolfe', 'Zinc', 'Ash', 'Birch',
];

export class BotManager {
  constructor(game, count = 47) {
    this.game = game;
    this.bots = [];
    this.names = [...BOT_NAMES];
    this.rng = game.rng.fork();
    this.nearTickAcc = 0;
  }

  spawnAll(dropPlane) {
    // hot zones: most bots drop at 3 contested POIs -> early game fights
    const pois = this.game.pois;
    const hot = ['crossroads', 'airstrip', 'harbor'];
    for (let i = 0; i < 47; i++) {
      const bot = this.createBot(i);
      let tx, tz;
      if (this.rng.chance(0.72)) {
        const poi = pois.find(p => p.key === hot[i % hot.length]) || this.rng.pick(pois);
        tx = poi.x + this.rng.range(-poi.r * 1.35, poi.r * 1.35);
        tz = poi.z + this.rng.range(-poi.r * 1.35, poi.r * 1.35);
      } else {
        const poi = this.rng.pick(pois);
        tx = poi.x + this.rng.range(-poi.r * 0.8, poi.r * 0.8);
        tz = poi.z + this.rng.range(-poi.r * 0.8, poi.r * 0.8);
      }
      bot.dropAtPre = new THREE.Vector3(tx, 0, tz);
      bot.state = 'bus';
      bot.busEta = 1 + i * 0.14 + this.rng.range(0, 0.5); // seconds until jump
      bot.pos.copy(dropPlane).add(new THREE.Vector3(this.rng.range(-30, 30), -this.rng.range(0, 4), this.rng.range(-10, 10)));
      bot.vel.set(0, -20, 0);
      this.bots.push(bot);
    }
  }

  createBot(i) {
    const name = this.names[i % this.names.length] + (i >= this.names.length ? '-' + Math.floor(i / this.names.length) : '');
    const skill = this.rng.range(0.25, 1.0);
    const suitPalette = [0x4a3a55, 0x2a4a44, 0x553a2a, 0x33445c, 0x5c3344, 0x3a5548];
    const g = this.game;
    const rig = g.makeBotRig(i);
    const bot = {
      id: 'bot' + i, name, isPlayer: false,
      skill,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      yaw: 0, radius: 0.42, height: 1.75,
      hp: 100, shield: 0, alive: true,
      eliminations: 0,
      applyDamage(dmg, source, tag) {
        if (!this.alive) return;
        let d = dmg;
        if (this.shield > 0 && tag !== 'storm') {
          const absorbed = Math.min(this.shield, d);
          this.shield -= absorbed; d -= absorbed;
        }
        this.hp -= d;
        if (this.hp <= 0) {
          this.hp = 0;
          this.alive = false;
          this.mesh.visible = false;
          g.onElimination(source || null, this, false);
        }
      },
      state: 'bus',           // bus | skydive | glide | loot | rotate | fight | heal | build
      mode: 'skydive',
      inv: null,
      weaponId: null, magAmmo: 0,
      fireCd: 0, reloadT: 0, burstLeft: 0, burstCd: 0,
      target: null, lastSeenT: -99, lastSeenPos: null,
      healT: 0, mats: { wood: 60, brick: 40, metal: 20 },
      inStorm: false, safeZoneImmune: false,
      mesh: rig.group, rig: rig.rig,
      dropAt: null, busEta: 0,
      lootTimer: 0, stuckT: 0, wanderAngle: this.rng.range(0, 6.28),
      buildCd: 0, panicCd: 0,
      simNear: false, nearDist: 9999,
      eliminations: 0,
    };
    return bot;
  }

  aliveCount() {
    let n = 0;
    for (const b of this.bots) if (b.alive) n++;
    return n;
  }

  update(dt, storm) {
    const g = this.game;
    const ppos = g.player.pos;

    // classify near/far
    for (const b of this.bots) {
      if (!b.alive) continue;
      b.nearDist = b.pos.distanceTo(ppos);
      b.simNear = b.nearDist < 260;
    }

    for (const b of this.bots) {
      if (!b.alive) continue;

      if (b.state === 'bus') {
        b.busEta -= dt;
        // ride the plane
        b.pos.addScaledVector(g.dropPlane.vel, dt);
        if (b.busEta <= 0) {
          b.state = 'skydive';
          b.vel.set(0, -18, 0);
          // prefer the pre-planned hot-zone target, else nearest POI to the plane
          if (b.dropAtPre) {
            b.dropAt = b.dropAtPre;
          } else {
            let best = null, bd = Infinity;
            for (const p of g.pois) {
              const d = Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
              if (d < bd) { bd = d; best = p; }
            }
            b.dropAt = new THREE.Vector3(
              best.x + this.rng.range(-best.r * 0.7, best.r * 0.7), 0,
              best.z + this.rng.range(-best.r * 0.7, best.r * 0.7));
          }
        }
        this.syncMesh(b, dt);
        continue;
      }

      if (b.state === 'skydive' || b.state === 'glide') {
        const target = b.dropAt;
        const dx = target.x - b.pos.x, dz = target.z - b.pos.z;
        const hd = Math.hypot(dx, dz) || 1;
        if (b.state === 'skydive') {
          b.vel.x += (dx / hd) * 26 * dt;
          b.vel.z += (dz / hd) * 26 * dt;
          const hs = Math.hypot(b.vel.x, b.vel.z);
          if (hs > 34) { b.vel.x *= 34 / hs; b.vel.z *= 34 / hs; }
          b.vel.y = Math.max(b.vel.y - 26 * dt, -50);
          b.pos.addScaledVector(b.vel, dt);
          const th = g.island.height(b.pos.x, b.pos.z);
          if (b.pos.y <= th + 42) { b.state = 'glide'; }
        } else {
          b.vel.x += ((dx / hd) * 16 - b.vel.x) * Math.min(1, dt * 2);
          b.vel.z += ((dz / hd) * 16 - b.vel.z) * Math.min(1, dt * 2);
          b.vel.y += (-8 - b.vel.y) * Math.min(1, dt * 2);
          b.pos.addScaledVector(b.vel, dt);
          const th = g.island.height(b.pos.x, b.pos.z);
          if (b.pos.y <= th + 0.2) {
            b.pos.y = th; b.vel.set(0, 0, 0);
            b.state = 'loot'; b.lootTimer = this.rng.range(4, 9);
          }
        }
        if (b.simNear) this.syncMesh(b, dt);
        continue;
      }

      // grounded states — far bots simulate on a slow tick
      b.slowAcc = (b.slowAcc || this.rng.next()) + dt;
      const doFull = b.simNear || (b.slowAcc > 0.5 && (b.slowAcc = 0) === 0);

      // perception (cheap): nearest visible enemy
      this.perceive(b, doFull ? dt : dt * 4);

      switch (b.state) {
        case 'loot': this.tickLoot(b, dt, doFull); break;
        case 'rotate': this.tickRotate(b, dt, doFull); break;
        case 'fight': this.tickFight(b, dt, doFull); break;
        case 'heal': this.tickHeal(b, dt, doFull); break;
        default: b.state = 'rotate';
      }

      // storm damage handled by storm.update via applyDamage
      if (b.simNear) this.syncMesh(b, dt);
    }
  }

  perceive(b, dtScale) {
    const g = this.game;
    b.fireCd -= dtScale;
    b.buildCd -= dtScale;
    b.panicCd -= dtScale;
    // find closest enemy
    let best = null, bd = Infinity;
    const consider = (e, epos) => {
      if (!e.alive || e === b) return;
      const d = b.pos.distanceTo(epos);
      const range = e.isPlayer ? 95 : 110;
      if (d < bd && d < range) {
        best = e; bd = d;
      }
    };
    consider(g.player, g.player.pos);
    for (const o of this.bots) consider(o, o.pos);
    // verify LOS (terrain + geometry) before engaging
    if (best) {
      const eye = _v1.set(b.pos.x, b.pos.y + 1.55, b.pos.z);
      const tgt = _v2.set(best.pos.x, best.pos.y + 1.2, best.pos.z);
      if (g.combat.losBlocked(eye, tgt)) best = null;
    }
    if (best) {
      if (b.target !== best) { b.target = best; b.burstCd = 0.2 + this.rng.next() * 0.4; }
      b.lastSeenT = 0;
      b.lastSeenPos = b.lastSeenPos || new THREE.Vector3();
      b.lastSeenPos.copy(best.pos);
      // only engage when armed (unarmed bots keep looting instead of dancing)
      const armed = !!b.weaponId;
      if (armed && b.state !== 'heal') b.state = 'fight';
    } else {
      b.lastSeenT += dtScale;
      if (b.state === 'fight' && b.lastSeenT > 3.5) {
        b.target = null;
        b.state = this.needsHeal(b) ? 'heal' : 'rotate';
      }
    }
  }

  needsHeal(b) {
    return (b.hp < 62 && b.healStock > 0) || (b.shield < 45 && b.shieldStock > 0 && b.hp >= 70);
  }

  tickLoot(b, dt, full) {
    const g = this.game;
    b.lootTimer -= dt;
    // grab nearby drops
    const drop = g.loot.nearestDrop(b.pos, 3.2);
    if (drop) {
      this.botTake(b, drop.item);
      g.loot.takeDrop(drop);
    }
    // open chest if close
    const chest = g.loot.nearestChest(b.pos, 2.4);
    if (chest) {
      g.loot.openChest(chest, null);
      // bots auto-grab one item worth of stats
      b.weaponId = b.weaponId || LootPickWeapon(g.loot.rng, b.skill);
      b.ammoStock = (b.ammoStock || 0) + 60;
      b.healStock = (b.healStock || 0) + 2;
      b.shieldStock = (b.shieldStock || 0) + 1;
      b.shield = Math.min(100, b.shield + 25);
    }
    if (b.lootTimer <= 0) {
      // arm up before leaving
      if (!b.weaponId) {
        b.weaponId = LootPickWeapon(g.loot.rng, b.skill);
        b.ammoStock = 90;
      }
      b.state = 'rotate';
    }
  }

  botTake(b, item) {
    if (item.kind === 'weapon' && (!b.weaponId || this.rng.chance(0.35))) {
      b.weaponId = item.id;
      b.magAmmo = WEAPONS[item.id].mag;
    } else if (item.kind === 'ammo') b.ammoStock = (b.ammoStock || 0) + item.n;
    else if (item.kind === 'heal') {
      if (item.id.startsWith('shield')) b.shieldStock = (b.shieldStock || 0) + 1;
      else b.healStock = (b.healStock || 0) + 1;
    } else if (item.kind === 'mat') {
      b.mats[item.type] += item.n;
    }
  }

  tickRotate(b, dt, full) {
    const g = this.game;
    // goal: stay inside safe zone, prefer POIs / high loot
    const cx = storm_center_x(g), cz = storm_center_z(g);
    const dxs = b.pos.x - cx, dzs = b.pos.z - cz;
    const distToEdge = g.storm.radius - Math.hypot(dxs, dzs);
    let tx, tz;
    if (distToEdge < 30) {
      // head toward zone center-ish with offset
      tx = cx + (b.pos.x - cx) * 0.35;
      tz = cz + (b.pos.z - cz) * 0.35;
    } else {
      // wander toward random POI or drift
      if (!b.rotateTarget || b.pos.distanceTo(b.rotateTarget) < 12) {
        if (this.rng.chance(0.6)) {
          const poi = this.rng.pick(g.pois.filter(p => g.storm.isSafe(p.x, p.z)));
          if (poi) b.rotateTarget = new THREE.Vector3(poi.x + this.rng.range(-30, 30), 0, poi.z + this.rng.range(-30, 30));
        }
        if (!b.rotateTarget) {
          b.wanderAngle += this.rng.range(-1.2, 1.2);
          b.rotateTarget = new THREE.Vector3(
            THREE.MathUtils.clamp(b.pos.x + Math.cos(b.wanderAngle) * 80, -900, 900),
            0,
            THREE.MathUtils.clamp(b.pos.z + Math.sin(b.wanderAngle) * 80, -900, 900));
        }
      }
      tx = b.rotateTarget.x; tz = b.rotateTarget.z;
    }
    this.moveGround(b, tx, tz, dt, true);
    // opportunistically loot en route
    if (full) {
      const drop = g.loot.nearestDrop(b.pos, 3);
      if (drop) { this.botTake(b, drop.item); g.loot.takeDrop(drop); }
    }
    if (this.needsHeal(b)) b.state = 'heal';
  }

  moveGround(b, tx, tz, dt, sprint) {
    const g = this.game;
    const dx = tx - b.pos.x, dz = tz - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) { b.vel.x *= 0.8; b.vel.z *= 0.8; }
    const speed = sprint ? 9.6 : 6.4;
    const wx = (dx / (d || 1)) * speed, wz = (dz / (d || 1)) * speed;
    // obstacle probe: if blocked ahead and can mantle/build ramp, handle in caller
    if (full_ok(b)) {
      const body = { pos: b.pos, vel: b.vel, radius: b.radius, height: b.height };
      b.vel.x += (wx - b.vel.x) * Math.min(1, dt * 8);
      b.vel.z += (wz - b.vel.z) * Math.min(1, dt * 8);
      b.vel.y = Math.max(b.vel.y - 42 * dt, FALL_CAP_BOT);
      const res = g.physics.moveBody(body, dt);
      const gh = Math.max(g.island.height(b.pos.x, b.pos.z), g.builds.surfaceAt(b.pos.x, b.pos.z, b.pos.y));
      if (b.vel.y <= 0 && b.pos.y <= gh + 0.15) { b.pos.y = gh; b.vel.y = 0; res.onGround = true; }
      // stuck detection -> hop or strafe
      const hspd = Math.hypot(b.vel.x, b.vel.z);
      if (res.hitXZ && hspd < 1.5) {
        b.stuckT += dt;
        if (b.stuckT > 0.5) {
          b.vel.y = 8.2; // jump obstacle
          if (b.stuckT > 1.6 && b.buildCd <= 0 && b.skill > 0.55 && b.mats.wood >= 10) {
            // panic ramp
            const gx = Math.round(b.pos.x / GRID), gz = Math.round(b.pos.z / GRID);
            const gy = Math.max(0, Math.round((b.pos.y + 1) / WALL_H));
            g.builds.place('ramp', 'wood', gx, gy, gz, dirFromYaw(Math.atan2(-(wx), -(wz))), b);
            b.mats.wood -= 10;
            b.buildCd = 2.5;
            b.stuckT = 0;
          }
        }
      } else b.stuckT = 0;
    } else {
      // far sim: kinematic glide along terrain
      b.pos.x += wx * dt;
      b.pos.z += wz * dt;
      b.pos.y = Math.max(g.island.height(b.pos.x, b.pos.z), b.pos.y - 20 * dt * 60 * 0.02);
      const gh = g.island.height(b.pos.x, b.pos.z);
      if (b.pos.y < gh) b.pos.y = gh;
    }
    void sprint;
  }

  tickFight(b, dt, full) {
    const g = this.game;
    const t = b.target;
    if (!t || !t.alive) { b.state = 'rotate'; return; }
    const dist = b.pos.distanceTo(t.pos);
    const def = b.weaponId ? WEAPONS[b.weaponId] : null;
    // UNARMED: break off and go find a weapon instead of dancing around
    if (!def) {
      if (dist > 14 || this.rng.chance(dt * 2.5)) {
        b.state = 'loot';
        b.target = null;
        b.lootTimer = this.rng.range(5, 9);
      }
      return;
    }
    // desired range by weapon class
    const wantRange = !def ? 14 :
      def.cls === 'SHOTGUN' ? 9 : def.cls === 'SNIPER' ? 95 : def.cls === 'DMR' ? 70 :
      def.cls === 'SMG' ? 13 : 24;
    // strafe orbit + approach/retreat
    const ang = Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
    const orbitDir = (b.orbit ??= (this.rng.chance(0.5) ? 1 : -1));
    const moveAng = ang + orbitDir * 1.15;
    const rangeErr = dist - wantRange;
    const mx = t.pos.x - Math.sin(moveAng) * wantRange * 0.4 - b.pos.x;
    const mz = t.pos.z - Math.cos(moveAng) * wantRange * 0.4 - b.pos.z;
    const md = Math.hypot(mx, mz) || 1;
    const spd = Math.abs(rangeErr) > 6 ? 9.2 : 6.6;
    this.moveGround(b, b.pos.x + (mx / md) * 10, b.pos.z + (mz / md) * 10, dt, Math.abs(rangeErr) > 6);

    // face target
    b.yaw = Math.atan2(-(t.pos.x - b.pos.x), -(t.pos.z - b.pos.z));

    // shoot
    if (def && full) {
      if (b.magAmmo <= 0) {
        b.reloadT -= dt;
        if (b.reloadT <= 0) {
          const stock = Math.min(def.mag, b.ammoStock || 0);
          if (stock <= 0 && (b.ammoStock ?? 0) <= 0) {
            // out of ammo: swap to pickaxe aggression (close) or flee
            if (dist < 12) b.weaponId = b.weaponId; // keep pressing
            else b.state = 'rotate';
          } else {
            b.magAmmo = stock; b.ammoStock -= stock;
          }
        } else if (b.reloadT <= 0.01) b.reloadT = def.reload;
      } else {
        b.burstCd -= dt;
        if (b.burstCd <= 0) {
          if (b.burstLeft <= 0) b.burstLeft = def.auto ? this.rng.int(3, 7) : 1;
          while (b.burstLeft > 0 && b.fireCd <= 0) {
            b.fireCd = 60 / def.rpm * (def.auto ? 1 : this.rng.range(1.1, 1.8));
            b.burstLeft--;
            b.magAmmo--;
            // accuracy model: hit chance falls with distance & skill
            const skillAcc = 0.42 + b.skill * 0.48;
            const distFactor = clamp01(1 - dist / (def.cls === 'SHOTGUN' ? 26 : def.cls === 'SNIPER' ? 180 : 120));
            const hitChance = skillAcc * (0.35 + 0.65 * distFactor);
            if (this.rng.chance(hitChance)) {
              const dmgRoll = def.dmg * this.rng.range(0.85, 1.05);
              // bots are cautious against other bots (stretches mid-game),
              // full damage against the player
              const botVsBot = !t.isPlayer ? 0.32 : 1;
              const headshot = this.rng.chance(0.12 + b.skill * 0.12);
              g.combat.applyHit(t, headshot ? dmgRoll * def.headMult * botVsBot : dmgRoll * botVsBot, b, def, headshot);
            } else {
              g.fx.tracerMiss(b, t, def);
            }
          }
          if (b.burstLeft <= 0) b.burstCd = def.auto ? this.rng.range(0.25, 0.7) * (1.4 - b.skill * 0.5) : this.rng.range(0.4, 1.1);
        }
      }
    }
    // panic build when low hp & skilled
    if (b.hp < 38 && b.skill > 0.5 && b.panicCd <= 0 && b.mats.wood >= 30) {
      const gx = Math.round(b.pos.x / GRID), gz = Math.round(b.pos.z / GRID);
      const gy = Math.max(0, Math.round((b.pos.y + 1) / WALL_H));
      for (let d = 0; d < 4; d++) {
        const [ox, oz] = dirOffset(d);
        g.builds.place('wall', 'wood', gx + ox, gy, gz + oz, d, b);
      }
      b.mats.wood -= 40;
      b.panicCd = 6;
    }
    // retreat to heal when critical
    if (b.hp < 30 && this.rng.chance(dt * 1.4)) { b.state = 'heal'; b.target = null; }
  }

  tickHeal(b, dt, full) {
    b.healT += dt;
    // crouch behind cover: just stand still (or move away from lastSeen)
    if (b.lastSeenPos && b.pos.distanceTo(b.lastSeenPos) < 30 && this.rng.chance(dt * 2)) {
      const ax = b.pos.x - b.lastSeenPos.x, az = b.pos.z - b.lastSeenPos.z;
      const ad = Math.hypot(ax, az) || 1;
      this.moveGround(b, b.pos.x + ax / ad * 8, b.pos.z + az / ad * 8, dt, false);
    }
    if (b.healT > 2.6) {
      b.healT = 0;
      if (b.hp < 75 && b.healStock > 0) {
        b.healStock--; b.hp = Math.min(100, b.hp + 22);
      } else if (b.shieldStock > 0 && b.shield < 100) {
        b.shieldStock--; b.shield = Math.min(100, b.shield + 34);
      } else {
        b.state = 'rotate';
      }
    }
    if (b.target && b.lastSeenT < 0.4) b.state = 'fight'; // interrupted
  }

  syncMesh(b, dt) {
    b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    const hspd = Math.hypot(b.vel.x, b.vel.z);
    if (hspd > 0.6) {
      const my = Math.atan2(-b.vel.x, -b.vel.z);
      let dy = my - b.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      b.yaw += dy * Math.min(1, dt * 10);
    }
    b.mesh.rotation.y = b.yaw;
    animateRigLite(b.rig, hspd, performance.now() / 1000 + (b.id.charCodeAt(3) || 0));
    b.mesh.visible = b.nearDist < 420;
  }

  // kill feed + elimination handling
  onKill(killer, victim) {
    if (killer) killer.eliminations++;
  }
}

const FALL_CAP_BOT = -50;
function LootPickWeapon(rng, skill) {  const pool = ['stinger-smg', 'raptor-ar', 'breaker-pump'];
  if (skill > 0.45) pool.push('longshot-dmr');
  if (skill > 0.7) pool.push('skycracker', 'boomer-bomb');
  return rng.pick(pool);
}
function full_ok() { return true; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function dirFromYaw(yaw) {
  // map facing yaw to grid dir index 0=-Z(north) .. 3=-X(west)
  const a = ((yaw % Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const oct = Math.round(a / (Math.PI / 2)) % 4;
  return [0, 1, 2, 3][oct];
}
function dirOffset(d) {
  return [[0, -1], [1, 0], [0, 1], [-1, 0]][d].map(v => v);
}
function storm_center_x(g) { return g.storm.center.x; }
function storm_center_z(g) { return g.storm.center.y; }
function animateRigLite(rig, speed, time) {
  if (!rig) return;
  const amp = Math.min(1, speed / 8);
  const s = Math.sin(time * (4 + amp * 6)) * 0.6 * amp;
  rig.legL.rotation.x = s; rig.legR.rotation.x = -s;
  rig.armL.rotation.x = -s * 0.7; rig.armR.rotation.x = s * 0.7;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
