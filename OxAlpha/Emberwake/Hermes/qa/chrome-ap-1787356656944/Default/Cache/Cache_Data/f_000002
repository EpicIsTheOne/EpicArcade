/* Emberwake — sim.js
 * The COMPLETE game simulation as a pure-logic module: state machine, flame economy,
 * caravan AI, enemy AI, combat, shrines/shop, objectives, scoring, win/lose.
 * ZERO dependencies on browser APIs — boots under Node for full playthrough QA.
 * Dual-export: browser global `window.EWSim`, Node `module.exports`.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./rng.js'), require('./world.js'));
  else root.EWSim = factory(root.EmberRNG, root.EmberWorld);
})(typeof self !== 'undefined' ? self : this, function (RNG, World) {
  'use strict';

  // ---------- tuning ----------
  var T = {
    FUEL_MAX: 100, FUEL_START: 80,
    BURN: [0.55, 1.15, 2.0],
    BANK_BURN: 0.06,
    SPRINT_BURN_MULT: 1.6,
    GUST_BURN_MULT: 2.6,
    FISSURE_TRICKLE: 3.2,
    FLARE_COST: 18, FLARE_R: 8.5, FLARE_RECOVER: 0.9,
    WARM_R: [5.5, 8.5, 12.5],
    BANK_WARM_R: 1.6,
    KEEP_SPEED: 4.2, SPRINT_MULT: 1.55,
    BEETLE_SPEED: 5.6, BEETLE_SEP: 2.2,
    BEETLE_HIT_R: 0.85,
    HOLLOW: {
      SPEED: 3.4, SPEED_CINDER: 3.9, HP: 2,
      DMG: 34, ATK_CD: 1.0, BURN_DPS: 4.0, BURN_R: 2.2,
      AVOID_R: 6.5, SPAWN_MIN_D: 26, SPAWN_MAX_D: 44
    },
    WISP: { SPEED: 2.1, LURE_TIME: 4.0, LURE_R: 1.1, BURN_R: 3.0 },
    WARDEN: { SPEED: 1.5, HP: 3, DMG: 55, ATK_CD: 2.2 },
    WRAITH: {
      HP: 10, SPEED: 5.2, DIVE_SPEED: 10.5,
      SNUFF_R: 8, SNUFF_DPS: 3.0, SUMMON_CD: 9, DIVE_CD: 7.5,
      TELEGRAPH_T: 1.1, DIVE_DUR: 2.0, DIVE_TOUCH_R: 1.6, KEEPER_SLAM: 8
    },
    DARK_DPS: 2.6,
    EMBER_DARK: 2.2, EMBER_OUT_GRACE: 6,
    MOSS_FUEL: 9, MOSS_R: 1.6,
    SHARD_SCORE: 60,
    SHRINE_SCORE: 400, BEETLE_SCORE: 1500,
    DIST_MULT: 2,
    TIME_BONUS: 8,
    DARK_SPAWN_INTERVAL: 11,
    DARK_SPAWN_MAX: 3,
    CINDER_SPAWN_INTERVAL: 8.5,
    CINDER_SPAWN_MAX: 3,
    WARDEN_COUNT: 3
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function d2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

  var NAMES = ['Bramble', 'Cinder', 'Juniper', 'Wick', 'Marzen', 'Soot', 'Tansy', 'Emberly'];

  function createSim(opts) {
    opts = opts || {};
    var world = World.create({ seed: opts.seed || 'EMBERWAKE-1' });
    var rng = RNG.makeRng((opts.seed || 'EMBERWAKE-1') + ':sim');
    var hardMode = !!opts.hard;
    var HARD = hardMode ? 1.25 : 1.0;

    // ---------- state ----------
    var S = {
      t: 0,
      phase: 'play',
      phaseT: 0,
      world: null,
      keeper: {
        x: world.spawn.x, z: world.spawn.z,
        vx: 0, vz: 0, face: 0,
        fuel: T.FUEL_START, fuelMax: T.FUEL_MAX,
        level: 1, banked: false,
        flareCd: 0, flareRecover: 0,
        sprint: 0, gust: 0, gustT: 0,
        emberOutT: 0,
        upgrades: { wick: 0, flareF: 0, emberH: 0, mettle: 0, mossAff: 0, aura: 0 }
      },
      beetles: [],
      hollows: [], wisps: [], wardens: [],
      wraith: null,
      shards: 0, score: 0,
      shrinesLit: 0,
      distance: 0,
      mossEaten: 0, hollowsSlain: 0, wispsBanished: 0, wardensFelled: 0, flaresUsed: 0,
      spawnTimer: 4.5,
      wardenSpawned: false,
      wraithSpawned: false,
      wraithDefeated: false,
      events: [],
      rng: rng
    };
    S.world = world;

    (function initBeetles() {
      for (var i = 0; i < 5; i++) {
        S.beetles.push({
          name: NAMES[i % NAMES.length], shell: i,
          x: world.spawn.x - (i + 1) * 2.1, z: world.spawn.z + (i % 2 ? 1.4 : -1.4),
          hp: 100, maxHp: 100, shields: 0, maxShields: 2,
          state: 'follow', lureT: 0, lureWisp: null,
          hurtCd: 0, anim: rng() * 6, alive: true
        });
      }
    })();

    S.pushEvent = function (type, data) { S.events.push({ type: type, data: data || {} }); };

    // ---------- derived values ----------
    function burnRate() {
      var k = S.keeper;
      var base = k.banked ? T.BANK_BURN : T.BURN[k.level];
      var m = 1;
      m *= 1 - 0.2 * k.upgrades.wick;
      if (k.sprint > 0) m *= T.SPRINT_BURN_MULT;
      if (k.gust > 0) m *= T.GUST_BURN_MULT;
      if (world.regionAtX(k.x).key === 'cinder') m *= 1.15;
      return base * m;
    }

    function warmRadius() {
      var k = S.keeper;
      if (k.banked) return T.BANK_WARM_R;
      var r = T.WARM_R[k.level];
      r *= 1 + 0.12 * k.upgrades.aura;
      return r;
    }

    function flareRadius() { return T.FLARE_R * (1 + 0.35 * S.keeper.upgrades.flareF); }
    function fuelMax() { return T.FUEL_MAX + 25 * S.keeper.upgrades.emberH; }
    function inFissure(x, z) { return !!fissureAt(x, z); }
    function fissureAt(x, z) {
      for (var i = 0; i < world.fissures.length; i++) {
        var f = world.fissures[i];
        var dx = x - f.x, dz = z - f.z;
        var c = Math.cos(-f.rot), s = Math.sin(-f.rot);
        var lx = dx * c - dz * s, lz = dx * s + dz * c;
        if ((lx * lx) / (f.rx * f.rx) + (lz * lz) / (f.rz * f.rz) < 1) return f;
      }
      return null;
    }
    function onPondIce(x, z) {
      for (var i = 0; i < world.ponds.length; i++) {
        var p = world.ponds[i];
        if (d2(x, z, p.x, p.z) < p.r) return true;
      }
      return false;
    }

    // ---------- input ----------
    S.input = { mx: 0, mz: 0, level: 1, bank: 0, sprint: 0, flare: 0, interact: 0 };

    S.applyInput = function (inp) {
      var I = S.input;
      I.mx = clamp(inp.mx || 0, -1, 1);
      I.mz = clamp(inp.mz || 0, -1, 1);
      I.level = inp.level | 0;
      I.bank = inp.bank | 0;
      I.sprint = inp.sprint | 0;
      I.flare = inp.flare | 0;
      I.interact = inp.interact | 0;
    };

    // ---------- keeper movement ----------
    function moveKeeper(dt) {
      var k = S.keeper, I = S.input;
      var slow = onPondIce(k.x, k.z) ? 0.55 : 1.0;
      var spd = T.KEEP_SPEED * (k.sprint > 0 ? T.SPRINT_MULT : 1) * slow;
      var al = Math.sqrt(I.mx * I.mx + I.mz * I.mz);
      if (al > 0.01) {
        var nx = I.mx / al, nz = I.mz / al;
        k.x += nx * spd * dt;
        k.z += nz * spd * dt;
        k.face = Math.atan2(nx, nz);
        if (k.sprint > 0 && al > 0.01) k.sprint = Math.max(0, k.sprint - dt);
      } else if (k.sprint > 0) {
        k.sprint = Math.max(0, k.sprint - dt);
      }
      // gust push
      if (k.gust > 0 && k.gustDirX !== undefined) {
        k.x += k.gustDirX * 1.2 * dt;
        k.z += k.gustDirZ * 1.2 * dt;
      }
      // soft bounds
      k.x = clamp(k.x, -440, 440);
      k.z = clamp(k.z, -240, 240);
    }

    // ---------- flame economy ----------
    function updateFlame(dt) {
      var k = S.keeper;
      k.fuelMax = fuelMax();
      k.fuel -= burnRate() * dt;
      var fis = fissureAt(k.x, k.z);
      if (fis) k.fuel += T.FISSURE_TRICKLE * (fis.rich ? 2.4 : 1.0) * dt;
      k.fuel = clamp(k.fuel, 0, k.fuelMax);

      if (k.fuel <= 0) {
        k.emberOutT += dt;
        if (k.emberOutT >= T.EMBER_OUT_GRACE) {
          S.phase = 'gameover';
          S.phaseT = 0;
          S.deathCause = 'The Mother Ember guttered out in the dark.';
          S.pushEvent('gameover', { cause: S.deathCause });
        }
      } else {
        k.emberOutT = 0;
      }
    }

    // ---------- gathering ----------
    function updateGather(dt) {
      var k = S.keeper;
      var props = world.props;
      for (var i = props.length - 1; i >= 0; i--) {
        var p = props[i];
        if (p.dead) continue;
        if (p.kind === 'moss') {
          if (!k.banked && d2(k.x, k.z, p.x, p.z) < T.MOSS_R + 0.6) {
            p.dead = true;
            var gain = T.MOSS_FUEL * (1 + 0.5 * k.upgrades.mossAff);
            k.fuel = clamp(k.fuel + gain, 0, k.fuelMax);
            S.mossEaten++;
            S.pushEvent('moss', { gain: gain });
            if (S.mossEaten % 7 === 0) S.pushEvent('chirp', {});
          }
        } else if (p.kind === 'shard') {
          if (d2(k.x, k.z, p.x, p.z) < T.MOSS_R + 0.8) {
            p.dead = true;
            S.shards++;
            S.score += T.SHARD_SCORE;
            S.pushEvent('shard', {});
          }
        } else if (p.kind === 'cache') {
          if (!k.banked && d2(k.x, k.z, p.x, p.z) < T.MOSS_R + 1.0) {
            p.dead = true;
            k.fuel = clamp(k.fuel + 24, 0, fuelMax());
            S.score += 10;
            S.pushEvent('cache', {});
          }
        }
      }
    }

    // ---------- caravan AI ----------
    function updateBeetles(dt) {
      var k = S.keeper;
      var wr = warmRadius();
      for (var i = 0; i < S.beetles.length; i++) {
        var b = S.beetles[i];
        if (!b.alive) continue;
        b.hurtCd = Math.max(0, b.hurtCd - dt);
        var tx, tz, sp = T.BEETLE_SPEED;

        if (b.state === 'lured' && b.lureWisp && b.lureWisp.alive) {
          tx = b.lureWisp.x; tz = b.lureWisp.z;
          b.lureT -= dt;
          if (b.lureT <= 0 || d2(b.x, b.z, tx, tz) < 0.7) {
            b.state = 'follow'; b.lureWisp = null; b.lureT = 0;
          }
        } else if (b.scatterT > 0) {
          // flee radially from the keeper (the Wraith's strike point) — pure instinct
          b.scatterT -= dt;
          var fx2 = b.x - k.x, fz2 = b.z - k.z;
          var fl2 = Math.sqrt(fx2 * fx2 + fz2 * fz2) || 1;
          tx = b.x + fx2 / fl2 * 4.5; tz = b.z + fz2 / fl2 * 4.5;
          sp = T.BEETLE_SPEED * 1.25;
        } else {
          if (b.state === 'lured') { b.state = 'follow'; b.lureWisp = null; b.lureT = 0; }
          // follow slot behind keeper, offset laterally; when the flame is banked
          // the whole caravan huddles in tight around the dying ember
          var sep = k.banked ? 1.05 : T.BEETLE_SEP;
          var slotAng = k.face + Math.PI + (i - (S.beetles.length - 1) / 2) * 0.35;
          tx = k.x + Math.sin(slotAng) * sep;
          tz = k.z + Math.cos(slotAng) * sep;
        }

        var dx = tx - b.x, dz = tz - b.z;
        var dl = Math.sqrt(dx * dx + dz * dz);
        // caravan leash: beetles never fall more than 16m behind — they hurry to keep up,
        // so a sprinting keeper visibly drags his family along rather than abandoning them
        if (b.state !== 'lured' && !(b.scatterT > 0)) {
          var leashD = d2(b.x, b.z, k.x, k.z);
          if (leashD > 16) {
            tx = k.x; tz = k.z;
            sp = T.KEEP_SPEED * T.SPRINT_MULT + 1.2;
            dx = tx - b.x; dz = tz - b.z;
            dl = Math.sqrt(dx * dx + dz * dz);
          }
        }
        var step = Math.min(dl, sp * dt);
        var dx2 = dx / (dl || 1), dz2 = dz / (dl || 1);
        if (dl > 0.001) { b.fx = dx2; b.fz = dz2; }
        b.x += dx2 * step;
        b.z += dz2 * step;

            // separation from other beetles
        for (var j = i + 1; j < S.beetles.length; j++) {
          var o = S.beetles[j];
          if (!o.alive) continue;
          var sx = o.x - b.x, sz = o.z - b.z;
          var sl = Math.sqrt(sx * sx + sz * sz);
          if (sl < 1.0 && sl > 0.0001) {
            var push = (1.0 - sl) * 0.5;
            b.x -= sx / sl * push; b.z -= sz / sl * push;
            o.x += sx / sl * push; o.z += sz / sl * push;
          }
        }

        // darkness damage (scattering beetles run on instinct — immune while fleeing)
        var dk = d2(b.x, b.z, k.x, k.z);
        if (dk > wr && !k.banked && !(b.scatterT > 0)) {
          b.hp -= T.DARK_DPS * dt;
          if (Math.random() < dt * 0.5) S.pushEvent('beetleCold', { name: b.name });
        }
        if (b.hp <= 0) killBeetle(b, 'the cold took her');
      }
    }

    function killBeetle(b, why) {
      if (!b.alive) return;
      b.alive = false;
      S.pushEvent('beetleDeath', { name: b.name, why: why || '' });
      checkCaravanLoss();
    }

    function checkCaravanLoss() {
      var alive = 0;
      for (var i = 0; i < S.beetles.length; i++) if (S.beetles[i].alive) alive++;
      if (alive === 0 && S.phase === 'play') {
        S.phase = 'gameover';
        S.phaseT = 0;
        S.deathCause = 'The last lantern-beetle fell. The caravan is no more.';
        S.pushEvent('gameover', { cause: S.deathCause });
      }
    }

    // ---------- enemies: hollows ----------
    function spawnHollows(n, shades) {
      if (S.hollows.length > 8) return;
      var k = S.keeper;
      var region = world.regionAtX(k.x);
      for (var i = 0; i < n; i++) {
        var ang = rng() * Math.PI * 2;
        var dd = rng.range(T.HOLLOW.SPAWN_MIN_D, T.HOLLOW.SPAWN_MAX_D);
        var hx = k.x + Math.cos(ang) * dd, hz = k.z + Math.sin(ang) * dd;
        if (Math.abs(hx) > 430 || Math.abs(hz) > 230) continue;
        S.hollows.push({
          x: hx, z: hz, hp: shades ? 1 : T.HOLLOW.HP,
          shade: !!shades,
          atkCd: 0, skitterCd: rng.range(2, 6), anim: rng() * 6, alive: true,
          fleeT: 0
        });
      }
    }

    function updateHollows(dt) {
      var k = S.keeper;
      var wr = warmRadius();
      var cinder = world.regionAtX(k.x).key === 'cinder';
      var spd = cinder ? T.HOLLOW.SPEED_CINDER : T.HOLLOW.SPEED;
      for (var i = S.hollows.length - 1; i >= 0; i--) {
        var h = S.hollows[i];
        if (!h.alive) continue;
        h.atkCd = Math.max(0, h.atkCd - dt);
        h.skitterCd -= dt;
        if (h.skitterCd <= 0) { h.skitterCd = rng.range(3, 8); S.pushEvent('skitter', {}); }

        var dk = d2(h.x, h.z, k.x, k.z);
        var targetX = k.x, targetZ = k.z;
        // prefer nearest beetle outside warm radius
        var bestB = null, bestD = 1e9;
        for (var j = 0; j < S.beetles.length; j++) {
          var b = S.beetles[j];
          if (!b.alive) continue;
          var bd = d2(h.x, h.z, b.x, b.z);
          var inWarm = d2(b.x, b.z, k.x, k.z) <= wr;
          if (!inWarm && bd < bestD) { bestD = bd; bestB = b; }
        }
        if (bestB && bestD < dk * 1.6) { targetX = bestB.x; targetZ = bestB.z; }

        var fleeing = dk < T.HOLLOW.AVOID_R && !k.banked;
        if (h.fleeT > 0) { h.fleeT -= dt; fleeing = true; }
        var mvx, mvz;
        if (fleeing) {
          mvx = h.x - k.x; mvz = h.z - k.z;
        } else {
          mvx = targetX - h.x; mvz = targetZ - h.z;
        }
        var ml = Math.sqrt(mvx * mvx + mvz * mvz) || 1;
        h.x += mvx / ml * spd * dt;
        h.z += mvz / ml * spd * dt;

        // lantern contact burns hollows
        if (!k.banked && dk < T.HOLLOW.BURN_R + 0.5) {
          h.hp -= T.HOLLOW.BURN_DPS * dt;
        }
        // attack keeper? no — attack beetles
        if (bestB && d2(h.x, h.z, bestB.x, bestB.z) < T.BEETLE_HIT_R + 0.55) {
          if (h.atkCd <= 0) {
            h.atkCd = T.HOLLOW.ATK_CD;
            hitBeetle(bestB, T.HOLLOW.DMG, 'a hollow tore into her');
          }
        }
        if (h.hp <= 0) {
          h.alive = false;
          S.hollowsSlain++;
          S.score += 25;
          S.pushEvent('hollowDie', {});
        }
      }
      // purge dead
      for (var q = S.hollows.length - 1; q >= 0; q--) if (!S.hollows[q].alive) S.hollows.splice(q, 1);
    }

    function hitBeetle(b, dmg, why) {
      if (!b.alive) return;
      S.pushEvent('beetleHurt', { name: b.name });
      if (b.shields > 0) {
        b.shields--;
        S.pushEvent('shieldPop', { name: b.name });
        b.hp = Math.max(b.hp, 40);
        return;
      }
      b.hp -= dmg;
      if (b.hp <= 0) killBeetle(b, why);
    }

    // ---------- enemies: wisps ----------
    function updateWisps(dt) {
      for (var i = S.wisps.length - 1; i >= 0; i--) {
        var w = S.wisps[i];
        if (!w.alive) continue;
        // find nearest beetle within influence
        var bestB = null, bestD = 1e9;
        for (var j = 0; j < S.beetles.length; j++) {
          var b = S.beetles[j];
          if (!b.alive) continue;
          var bd = d2(w.x, w.z, b.x, b.z);
          if (bd < bestD) { bestD = bd; bestB = b; }
        }
        var tgtX = bestB ? bestB.x : w.x, tgtZ = bestB ? bestB.z : w.z;
        // drift toward beetle but keep ~2m standoff unless luring
        var wl = d2(w.x, w.z, tgtX, tgtZ);
        if (wl > (bestB && bestB.state === 'lured' ? 0.5 : 2.0)) {
          var mx = tgtX - w.x, mz = tgtZ - w.z;
          var ml = Math.sqrt(mx * mx + mz * mz) || 1;
          w.x += mx / ml * T.WISP.SPEED * dt;
          w.z += mz / ml * T.WISP.SPEED * dt;
        }
        // lure trigger
        if (bestB && bestB.state !== 'lured' && bestD < 3.0 && rng() < dt * 0.5) {
          bestB.state = 'lured';
          bestB.lureWisp = w;
          bestB.lureT = T.WISP.LURE_TIME;
          S.pushEvent('lureStart', { name: bestB.name });
        }
        // burned away by lantern or flare
        var wk = S.keeper;
        var dwk = d2(w.x, w.z, wk.x, wk.z);
        var burningNear = (!wk.banked && dwk < T.WISP.BURN_R + 1.0) ||
          (!wk.banked && wk.level === 2 && dwk < T.WISP.BURN_R + 3.0);
        if (burningNear) {
          w.burnAcc = (w.burnAcc || 0) + dt;
          if (w.burnAcc > 1.2) banishWisp(i, w);
        } else {
          w.burnAcc = 0;
        }
        // lured beetle strays too long → she is lost to the dark
        if (bestB && bestB.state === 'lured' && bestB.lureWisp === w) {
          if (d2(bestB.x, bestB.z, S.keeper.x, S.keeper.z) > warmRadius() + 14) {
            killBeetle(bestB, 'followed the false light');
          }
        }
      }
      for (var q = S.wisps.length - 1; q >= 0; q--) if (!S.wisps[q].alive) S.wisps.splice(q, 1);
    }

    function banishWisp(idx, w) {
      w.alive = false;
      S.wispsBanished++;
      S.score += 40;
      S.pushEvent('wispDie', {});
    }

    // ---------- enemies: wardens ----------
    function spawnWardens() {
      var k = S.keeper;
      for (var i = 0; i < T.WARDEN_COUNT; i++) {
        var ang = rng() * Math.PI * 2;
        var dd = rng.range(30, 50);
        S.wardens.push({
          x: clamp(k.x + Math.cos(ang) * dd, 220, 430),
          z: clamp(k.z + Math.sin(ang) * dd, -220, 220),
          hp: T.WARDEN.HP, atkCd: 0, stepT: rng() * 2, alive: true
        });
      }
      S.wardenSpawned = true;
      S.pushEvent('wardens', { count: T.WARDEN_COUNT });
    }

    function updateWardens(dt) {
      for (var i = S.wardens.length - 1; i >= 0; i--) {
        var wd = S.wardens[i];
        if (!wd.alive) continue;
        wd.atkCd = Math.max(0, wd.atkCd - dt);
        wd.stepT -= dt;
        if (wd.stepT <= 0) { wd.stepT = 1.1; S.pushEvent('wardenStep', {}); }
        // stalk nearest beetle
        var bestB = null, bestD = 1e9;
        for (var j = 0; j < S.beetles.length; j++) {
          var b = S.beetles[j];
          if (!b.alive) continue;
          var bd = d2(wd.x, wd.z, b.x, b.z);
          if (bd < bestD) { bestD = bd; bestB = b; }
        }
        if (bestB) {
          // wardens halt at the arena threshold — the Gate belongs to the Wraith
          var tgtX2 = bestB.x, tgtZ2 = bestB.z;
          if (tgtX2 > 348) { tgtX2 = Math.min(tgtX2, 346); }
          var mx = tgtX2 - wd.x, mz = tgtZ2 - wd.z;
          var ml = Math.sqrt(mx * mx + mz * mz) || 1;
          if (d2(wd.x, wd.z, tgtX2, tgtZ2) > 1.4) {
            wd.x += mx / ml * T.WARDEN.SPEED * dt;
            wd.z += mz / ml * T.WARDEN.SPEED * dt;
          }
          if (d2(wd.x, wd.z, bestB.x, bestB.z) < 1.6 && wd.atkCd <= 0 && bestB.x <= 348) {
            wd.atkCd = T.WARDEN.ATK_CD;
            hitBeetle(bestB, T.WARDEN.DMG, 'a Frost Warden touched her');
          }
        }
      }
      for (var q = S.wardens.length - 1; q >= 0; q--) if (!S.wardens[q].alive) S.wardens.splice(q, 1);
    }

    // ---------- boss: the Night-Wraith ----------
    function spawnWraith() {
      S.wraith = {
        x: S.keeper.x + 30, z: S.keeper.z,
        hp: T.WRAITH.HP, maxHp: T.WRAITH.HP,
        state: 'circle', stateT: 3.0,
        ang: 0, summonT: T.WRAITH.SUMMON_CD, diveT: T.WRAITH.DIVE_CD,
        teleX: 0, teleZ: 0, hurtFlash: 0, alive: true
      };
      S.wraithSpawned = true;
      S.pushEvent('wraithSpawn', {});
    }

    function updateWraith(dt) {
      var W = S.wraith;
      if (!W || !W.alive) return;
      var k = S.keeper;
      W.stateT -= dt;
      W.summonT -= dt;
      W.diveT -= dt;
      W.hurtFlash = Math.max(0, W.hurtFlash - dt);

      if (W.state === 'circle') {
        W.ang += dt * 0.55;
        var cx = k.x + Math.cos(W.ang) * 9.5, cz = k.z + Math.sin(W.ang) * 9.5;
        var mx = cx - W.x, mz = cz - W.z;
        var ml = Math.sqrt(mx * mx + mz * mz) || 1;
        W.x += mx / ml * T.WRAITH.SPEED * dt;
        W.z += mz / ml * T.WRAITH.SPEED * dt;
        // snuff aura while circling close — only during circle phase (drain/punish rhythm)
        var dk = d2(W.x, W.z, k.x, k.z);
        if (dk < T.WRAITH.SNUFF_R && W.state === 'circle') {
          k.fuel = clamp(k.fuel - T.WRAITH.SNUFF_DPS * dt, 0, fuelMax());
        }
        if (W.summonT <= 0) {
          W.summonT = T.WRAITH.SUMMON_CD;
          spawnHollows(2, true);
          S.pushEvent('wraithSummon', {});
        }
        if (W.diveT <= 0) {
          W.state = 'telegraph';
          W.stateT = T.WRAITH.TELEGRAPH_T;
          W.teleX = k.x; W.teleZ = k.z;   // strike point locked NOW — dodgeable
          // the caravan scatters from the coming cold — their own survival instinct
          for (var sc = 0; sc < S.beetles.length; sc++) {
            var sb = S.beetles[sc];
            if (sb.alive) sb.scatterT = T.WRAITH.TELEGRAPH_T + T.WRAITH.DIVE_DUR;
          }
          S.pushEvent('wraithTelegraph', {});
        }
      } else if (W.state === 'telegraph') {
        // hover toward the locked strike point
        var tx = W.teleX - W.x, tz = W.teleZ - W.z;
        var tl = Math.sqrt(tx * tx + tz * tz) || 1;
        W.x += tx / tl * Math.min(tl, 6 * dt);
        W.z += tz / tl * Math.min(tl, 6 * dt);
        if (W.stateT <= 0) {
          W.state = 'dive';
          W.stateT = T.WRAITH.DIVE_DUR;
          S.pushEvent('wraithDive', {});
        }
      } else if (W.state === 'dive') {
        // dives THROUGH the locked point and beyond — a dodgeable line attack
        var mx2 = W.teleX - W.x, mz2 = W.teleZ - W.z;
        var ml2 = Math.sqrt(mx2 * mx2 + mz2 * mz2) || 1;
        W.x += mx2 / ml2 * T.WRAITH.DIVE_SPEED * dt;
        W.z += mz2 / ml2 * T.WRAITH.DIVE_SPEED * dt;
        // touching beetles during dive is lethal — ONE strike per dive, and only
        // inside the strike zone near the locked point (past that, it's climbing away)
        for (var j = 0; j < S.beetles.length; j++) {
          var b = S.beetles[j];
          if (b.alive && d2(W.x, W.z, b.x, b.z) < T.WRAITH.DIVE_TOUCH_R + 0.6 &&
              d2(W.x, W.z, W.teleX, W.teleZ) < 5.5) {
            hitBeetle(b, T.WRAITH.DMG, 'the Night-Wraith consumed her');
            W.state = 'circle';
            W.diveT = T.WRAITH.DIVE_CD;
            W.stateT = 3.0;
            break;
          }
        }
        if (W.state === 'dive' && d2(W.x, W.z, k.x, k.z) < T.WRAITH.DIVE_TOUCH_R && !k.banked) {
          k.fuel = clamp(k.fuel - T.WRAITH.KEEPER_SLAM, 8, fuelMax()); // singed, floor at 8 so it never insta-ends the run
          S.pushEvent('wraithSlam', {});
          W.state = 'circle';
          W.diveT = T.WRAITH.DIVE_CD;
          W.stateT = 3.0;
        }
        if (W.stateT <= 0 || d2(W.x, W.z, W.teleX, W.teleZ) < 1.0) {
          W.state = 'circle';
          W.diveT = T.WRAITH.DIVE_CD;
          W.stateT = 3.0;
        }
      }

      // flare damage windows handled in tryFlare()
    }

    function damageWraith(amount) {
      var W = S.wraith;
      if (!W || !W.alive) return false;
      W.hp -= amount;
      W.hurtFlash = 0.3;
      if (W.hp <= 0) {
        W.alive = false;
        S.wraithDefeated = true;
        S.score += 3000;
        S.pushEvent('wraithDie', {});
        startVictory();
        return true;
      }
      return false;
    }

    // ---------- flare ----------
    function tryFlare() {
      var k = S.keeper;
      if (k.flareRecover > 0 || k.banked) return false;
      if (k.fuel < T.FLARE_COST) { S.pushEvent('flareFail', {}); return false; }
      k.fuel -= T.FLARE_COST;
      k.flareRecover = T.FLARE_RECOVER;
      S.flaresUsed++;
      var fr = flareRadius();
      S.pushEvent('flare', { r: fr });

      var kills = 0;
      for (var i = S.hollows.length - 1; i >= 0; i--) {
        var h = S.hollows[i];
        if (h.alive && d2(h.x, h.z, k.x, k.z) < fr) { h.alive = false; S.hollowsSlain++; S.score += 25; kills++; }
      }
      for (var wq = S.wisps.length - 1; wq >= 0; wq--) {
        var w = S.wisps[wq];
        if (w.alive && d2(w.x, w.z, k.x, k.z) < fr * 1.2) banishWisp(wq, w);
      }
      for (var wd2i = S.wardens.length - 1; wd2i >= 0; wd2i--) {
        var wd = S.wardens[wd2i];
        if (wd.alive && d2(wd.x, wd.z, k.x, k.z) < fr) {
          wd.hp -= 2;
          if (wd.hp <= 0) { wd.alive = false; S.wardensFelled++; S.score += 250; S.pushEvent('wardenDie', {}); }
        }
      }
      if (kills > 0) S.pushEvent('flareKill', { n: kills });
      // purge the annihilated immediately
      for (var pq = S.hollows.length - 1; pq >= 0; pq--) if (!S.hollows[pq].alive) S.hollows.splice(pq, 1);
      for (var pw = S.wardens.length - 1; pw >= 0; pw--) if (!S.wardens[pw].alive) S.wardens.splice(pw, 1);
      if (S.wraith && S.wraith.alive) {
        var dw = d2(S.wraith.x, S.wraith.z, k.x, k.z);
        if (dw < fr + 3.5) {
          var dmg = (S.wraith.state === 'dive' || S.wraith.state === 'telegraph') ? 2 : 1;
          damageWraith(dmg);
        }
      }
      return true;
    }
    function W_inDive() { return S.wraith && S.wraith.state === 'dive'; }

    // ---------- wayshrines & shop ----------
    function nearestShrine() {
      var best = null, bestD = 1e9;
      for (var i = 0; i < world.shrines.length; i++) {
        var s = world.shrines[i];
        var dd = d2(S.keeper.x, S.keeper.z, s.x, s.z);
        if (dd < bestD) { bestD = dd; best = s; }
      }
      return { shrine: best, dist: bestD };
    }

    function canInteract() {
      var ns = nearestShrine();
      return ns.dist < 4.5 && !ns.shrine.lit;
    }

    function doInteract() {
      var ns = nearestShrine();
      if (ns.dist < 4.5 && !ns.shrine.lit) {
        ns.shrine.lit = true;
        S.shrinesLit++;
        S.score += T.SHRINE_SCORE;
        // relight bonus: fuel top-up and beetle heal
        var k = S.keeper;
        k.fuel = clamp(k.fuel + 45, 0, fuelMax());
        for (var i = 0; i < S.beetles.length; i++) {
          var b = S.beetles[i];
          if (b.alive) {
            b.hp = b.maxHp;
            b.shields = Math.min(b.maxShields, b.shields + (k.upgrades.mettle > 0 ? 2 : 1));
          }
        }
        // clear nearby enemies
        for (var h = S.hollows.length - 1; h >= 0; h--) {
          if (d2(S.hollows[h].x, S.hollows[h].z, ns.shrine.x, ns.shrine.z) < 16) S.hollows[h].alive = false;
        }
        for (var w2 = S.wisps.length - 1; w2 >= 0; w2--) {
          if (d2(S.wisps[w2].x, S.wisps[w2].z, ns.shrine.x, ns.shrine.z) < 16) S.wisps[w2].alive = false;
        }
        S.pushEvent('shrineLit', { index: ns.shrine.index });
        if (ns.shrine.index === world.shrines.length - 1) {
          S.pushEvent('gateHint', {});
        }
        return true;
      }
      return false;
    }

    // upgrade catalog (presentation layer reads this for shop UI)
    var SHOP = [
      { id: 'wick', name: 'Wick Trimming', desc: 'Burn 20% less fuel per tier.', costs: [6, 12, 20], max: 3 },
      { id: 'emberH', name: 'Ember Heart', desc: '+25 max fuel per tier.', costs: [5, 10, 16], max: 3 },
      { id: 'aura', name: 'Warm Aura', desc: '+12% safe-light radius per tier.', costs: [5, 11, 18], max: 3 },
      { id: 'flareF', name: 'Flare Focus', desc: '+35% flare radius per tier.', costs: [6, 12, 19], max: 3 },
      { id: 'mettle', name: 'Beetle Mettle', desc: 'Caravan gains regrowing shields.', costs: [8, 14], max: 2 },
      { id: 'mossAff', name: 'Moss Affinity', desc: 'Embermoss restores +50% more per tier.', costs: [4, 9], max: 2 }
    ];
    S.SHOP = SHOP;

    function buyUpgrade(id) {
      if (S.phase !== 'shrine') return false;
      var entry = null;
      for (var i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) entry = SHOP[i];
      if (!entry) return false;
      var lvl = S.keeper.upgrades[id] || 0;
      if (lvl >= entry.max) return false;
      var cost = entry.costs[lvl];
      if (S.shards < cost) { S.pushEvent('shopDeny', { id: id }); return false; }
      S.shards -= cost;
      S.keeper.upgrades[id] = lvl + 1;
      if (id === 'emberH') S.keeper.fuel += 25;
      S.pushEvent('upgrade', { id: id, level: lvl + 1 });
      return true;
    }
    S.buyUpgrade = buyUpgrade;

    function healBeetles() {
      if (S.phase !== 'shrine') return false;
      var cost = 3;
      var healed = false;
      for (var i = 0; i < S.beetles.length; i++) {
        var b = S.beetles[i];
        if (b.alive && (b.hp < b.maxHp || b.shields < b.maxShields)) {
          if (S.shards >= cost) {
            S.shards -= cost;
            b.hp = b.maxHp;
            b.shields = b.maxShields;
            healed = true;
          }
        } else if (!b.alive && S.shards >= 12) {
          S.shards -= 12;
          b.alive = true;
          b.hp = b.maxHp * 0.6;
          b.shields = 0;
          healed = true;
          S.pushEvent('beetleRevived', { name: b.name });
        }
      }
      if (healed) S.pushEvent('caravanHealed', {});
      else S.pushEvent('shopDeny', { id: 'heal' });
      return healed;
    }
    S.healBeetles = healBeetles;

    // ---------- objectives / director ----------
    function director(dt) {
      var k = S.keeper;
      var region = world.regionAtX(k.x);

      // periodic spawns while playing
      if (S.phase === 'play') {
        S.spawnTimer -= dt;
        var interval = (region.key === 'cinder' ? T.CINDER_SPAWN_INTERVAL : T.DARK_SPAWN_INTERVAL);
        if (S.spawnTimer <= 0 && S.hollows.length < (region.key === 'cinder' ? T.CINDER_SPAWN_MAX : T.DARK_SPAWN_MAX) + 2) {
          S.spawnTimer = interval;
          spawnHollows(region.key === 'cinder' ? T.CINDER_SPAWN_MAX : T.DARK_SPAWN_MAX - 1);
        }
        // wisps only in the Hushpines proper (not the boss arena)
        if (region.key === 'hushpines' && S.wisps.length < 2 && rng() < dt * 0.06) {
          var ang = rng() * Math.PI * 2;
          S.wisps.push({
            x: k.x + Math.cos(ang) * 24, z: k.z + Math.sin(ang) * 24,
            alive: true, burnAcc: 0
          });
          S.pushEvent('wispNear', {});
        }
        // wardens once we enter Cinder Reach — but they never enter the Dawn Gate arena
        if (region.key === 'cinder' && !S.wardenSpawned && k.x <= 350) spawnWardens();
        // boss at Dawn Gate proximity
        if (!S.wraithSpawned && k.x > 360) spawnWraith();
      }
    }

    function startVictory() {
      S.phase = 'victory';
      S.phaseT = 0;
      computeFinalScore();
      S.pushEvent('victory', { score: S.score });
    }

    function computeFinalScore() {
      var alive = 0;
      for (var i = 0; i < S.beetles.length; i++) if (S.beetles[i].alive) alive++;
      S.finalStats = {
        beetlesAlive: alive,
        beetlesTotal: S.beetles.length,
        shrines: S.shrinesLit,
        distance: Math.round(S.distance),
        shardsBanked: S.shards,
        timeSec: Math.round(S.t),
        hollowsSlain: S.hollowsSlain,
        flares: S.flaresUsed
      };
      var score = S.score;
      score += alive * T.BEETLE_SCORE;
      score += S.shrinesLit * T.SHRINE_SCORE;
      score += Math.round(S.distance) * T.DIST_MULT;
      score += Math.max(0, 1800 - Math.round(S.t)) * (T.TIME_BONUS / 10);
      S.score = Math.round(score);
      var rank;
      if (S.score >= 16000) rank = 'EMBER LEGEND';
      else if (S.score >= 12000) rank = 'DAWNFATHER';
      else if (S.score >= 9000) rank = 'LANTERN-SAINT';
      else if (S.score >= 6000) rank = 'KEEPER';
      else rank = 'STRAY FLAME';
      S.finalStats.rank = rank;
    }

    function gameOver(cause) {
      S.phase = 'gameover';
      S.phaseT = 0;
      S.deathCause = cause;
      S.pushEvent('gameover', { cause: cause });
    }

    // ---------- wind gusts ----------
    function updateWind(dt) {
      var k = S.keeper;
      k.gustT -= dt;
      if (k.gustT <= 0) {
        k.gustT = rng.range(9, 16);
        if (world.regionAtX(k.x).key === 'glasswind' || world.regionAtX(k.x).key === 'cinder') {
          k.gust = 2.2;
          var gdir = rng.range(-1, 1);
          var gl = Math.sqrt(gdir * gdir + 0.6 * 0.6);
          k.gustDirX = gdir / gl;
          k.gustDirZ = 0.6 / gl * (rng() < 0.5 ? 1 : -1);
          S.pushEvent('gustStart', { dirX: gdir });
        }
      }
      if (k.gust > 0) k.gust = Math.max(0, k.gust - dt);
    }

    // ---------- main tick ----------
    S.update = function (dt, input) {
      if (input) S.applyInput(input);
      S.events.length = 0;
      S.phaseT += dt;

      if (S.phase === 'play') {
        S.t += dt;
        var k = S.keeper;

        // level/bank/sprint/flare/interact from input
        k.level = clamp(S.input.level, 0, 2);
        k.banked = !!S.input.bank;
        k.sprint = S.input.sprint ? Math.max(k.sprint, 0.35) : Math.max(0, k.sprint - dt);
        k.flareRecover = Math.max(0, k.flareRecover - dt);

        moveKeeper(dt);
        updateFlame(dt);
        if (S.input.interact && canInteract()) {
          doInteract();
          S.phase = 'shrine';
          S.phaseT = 0;
          S.pushEvent('shrineOpen', {});
        }
        if (S.input.flare) tryFlare();
        updateGather(dt);
        updateBeetles(dt);
        updateHollows(dt);
        updateWisps(dt);
        updateWardens(dt);
        updateWraith(dt);
        updateWind(dt);
        director(dt);

        // distance metric: road progress via projection onto road points
        var nr = world.roadNearest(k.x, k.z);
        var prog = nr.idx / (world.roadLength - 1);
        if (prog > S.distance / (400 * 2)) S.distance = prog * 800;
      } else if (S.phase === 'shrine') {
        // caravan rests; nothing moves
        k = S.keeper;
        k.fuel = clamp(k.fuel + 1.2 * dt, 0, fuelMax());
        // leaving shrine
        if (S.input.interact === 2) {
          S.phase = 'play';
          S.phaseT = 0;
          S.pushEvent('shrineClose', {});
        }
      } else if (S.phase === 'victory') {
        // gentle drift; presentation takes over
      } else if (S.phase === 'gameover') {
        // frozen scene
      }

      return S.events;
    };

    // expose helpers for UI/QA
    S.helpers = {
      warmRadius: warmRadius,
      flareRadius: flareRadius,
      burnRate: burnRate,
      inFissure: inFissure,
      onPondIce: onPondIce,
      canInteract: canInteract,
      nearestShrine: nearestShrine,
      damageWraith: damageWraith,
      tryFlare: tryFlare,
      doInteract: doInteract,
      spawnHollows: spawnHollows,
      spawnWraith: spawnWraith,
      killBeetle: killBeetle,
      gameOver: gameOver,
      hitBeetle: hitBeetle,
      compassDeg: function (yaw) {
        var tgt = null;
        for (var i = 0; i < world.shrines.length; i++) if (!world.shrines[i].lit) { tgt = world.shrines[i]; break; }
        if (!tgt) tgt = world.dawnGate;
        var dx = tgt.x - S.keeper.x, dz = tgt.z - S.keeper.z;
        var rel = Math.atan2(dx, dz) - (yaw || 0);
        return rel * 180 / Math.PI;
      }
    };

    return S;
  }

  return { createSim: createSim, TUNING: T, NAMES: NAMES };
});
