// CHROME HARBOR — missions, races, taxi fares, stunts, robberies.
import * as THREE from 'three';
import { Vehicle } from '../entities/vehicle.js';
import { clamp, RNG } from '../core/util.js';

// ---------------- reusable objective marker ----------------
class Marker {
  constructor(ctx) {
    this.ctx = ctx;
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 46, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 23;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.6, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.75, depthWrite: false }),
    );
    ring.position.y = 0.12;
    g.add(beam, ring);
    g.visible = false;
    ctx.scene.add(g);
    this.group = g;
    this.ring = ring;
    this.radius = 3;
  }
  show(x, z, colorHex = '#ffd24a', radius = 3) {
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.radius = radius;
    this.ring.scale.setScalar(radius / 2.4);
    this.group.children.forEach(c => c.material.color.set(colorHex));
  }
  hide() { this.group.visible = false; }
  pulse(t) {
    if (!this.group.visible) return;
    const k = 0.55 + Math.sin(t * 4) * 0.25;
    this.ring.material.opacity = k;
    this.group.children[0].material.opacity = 0.1 + k * 0.14;
  }
}

export class MissionManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null;          // current mission runner
    this.done = {};              // persisted completion flags
    this.marker = new Marker(ctx);
    this.t = 0;
    this.blips = [];             // [{x,z,color,char}]
    this.taxiState = null;
    this.stuntRamps = [
      { x: -356, z: 520 }, { x: 484, z: 180 }, { x: 172, z: -560 },
    ];
    this._setupInteractables();
    ctx.events.on('pedKilled', ({ ped }) => {
      // gang kill tracking for M3
      if (this.active?.def.id === 'm3' && ped.faction === 'gang') this.active.data.kills++;
      if (this.active?.def.id === 'm3' && this.active.stepIdx === 2) {
        const alive = ctx.npcs.peds.filter(p => p.faction === 'gang' && !p.dead).length;
        if (alive === 0) this.active.next();
      }
      if (this.active?.def.id === 'm3' && this.active.stepIdx === 3) {
        const alive = ctx.npcs.peds.filter(p => p.faction === 'gang' && !p.dead).length;
        if (alive === 0) this.active.next();
      }
    });
  }

  _setupInteractables() {
    const ctx = this.ctx;
    const LM = ctx.plan.landmarks;

    const giver = (spot, def) => {
      ctx.interactables.push({
        x: spot.x, z: spot.z, r: 3.2,
        prompt: () => this.done[def.id] ? null : `<b>E</b> — Talk to ${spot.name}`,
        action: () => {
          if (this.active) { ctx.hud.toastPrompt('Finish your current job first.'); return; }
          if (this.done[def.id]) { ctx.hud.toastPrompt(def.doneText || 'Nothing more for you here.'); return; }
          if (def.requires && !def.requires.every(id => this.done[id])) {
            ctx.hud.toastPrompt(def.lockedText || 'Come back when you\'re more established.');
            return;
          }
          def.start(this);
        },
        isMission: def,
      });
    };

    giver(LM.fixers.k, DEFS.m1);
    giver(LM.fixers.dario, DEFS.m2);
    giver(LM.fixers.tiny, DEFS.m3);
    giver(LM.fixers.marisol, DEFS.m4);
    giver(LM.fixers.k, DEFS.m5);
    // race replay
    ctx.interactables.push({
      x: LM.fixers.marisol.x, z: LM.fixers.marisol.z - 8, r: 3,
      prompt: '<b>E</b> — Street Race ($100 entry)',
      action: () => {
        if (this.active) return ctx.hud.toastPrompt('Finish your current job first.');
        if (ctx.player.money < 100) return ctx.hud.toastPrompt('Need $100 to enter.');
        ctx.player.addMoney(-100);
        startRace(this, true);
      },
    });
    // safehouse
    ctx.interactables.push({
      x: LM.safehouse.x + 2, z: LM.safehouse.z + 13, r: 3.4,
      prompt: '<b>E</b> — Safehouse: rest & save',
      action: () => {
        ctx.saveGame();
        ctx.player.health = 100;
        ctx.hud.banner('SAFEHOUSE', 'Progress saved. Health restored.');
        ctx.audio?.jingleWin();
      },
    });
    // store robberies
    LM.stores.forEach((st, i) => {
      ctx.interactables.push({
        x: st.counter.x, z: st.counter.z + 2.4, r: 2.6,
        prompt: () => playerArmed(ctx) ? '<b>E</b> — Hold up register' : 'Register (come armed...)',
        action: () => robStore(this, st),
      });
    });
  }

  update(dt, player) {
    this.t += dt;
    this.marker.pulse(this.t);
    this.updateBlips();
    if (this.taxiState) this.updateTaxi(dt, player);

    // stunt ramps
    if (player.vehicle) {
      const v = player.vehicle;
      if (!player.vehicle.airborneT) player.vehicle.airborneT = 0;
      const groundedApprox = Math.abs(v.forwardSpeed) > 3;
      void groundedApprox;
    }

    const a = this.active;
    if (!a) return;
    a.timeLeft -= dt;
    if (a.timeLimit) this.ctx.hud.setObjectiveTimer(Math.max(0, a.timeLeft));
    if (a.timeLimit && a.timeLeft <= 0) { this.fail('Out of time.'); return; }
    a.check(player, dt);
  }

  updateBlips() {
    const blips = [];
    // mission givers
    const LM = this.ctx.plan.landmarks;
    for (const [key, spot] of Object.entries(LM.fixers)) {
      const hasWork = Object.values(DEFS).some(d => d.giverKey === key && !this.done[d.id] &&
        (!d.requires || d.requires.every(r => this.done[r])));
      if (hasWork) blips.push({ x: spot.x, z: spot.z, color: '#7ee787', char: spot.name[0] });
    }
    if (this.active?.blip) blips.push(this.active.blip());
    if (this.taxiState) blips.push({ x: this.taxiState.target.x, z: this.targetZ ?? this.taxiState.target.z, color: '#ffb43a', char: '$' });
    this.blips = blips;
  }

  start(defId) {
    const def = DEFS[defId];
    this.active = {
      def, stepIdx: -1, data: {}, timeLeft: Infinity, timeLimit: 0,
      next: () => this.advance(),
      check: () => {},
      blip: () => this._blip,
    };
    this.ctx.hud.banner(def.title, def.intro);
    this.ctx.hud.dialog(def.giverName, def.introLine, 5);
    this.advance();
  }

  advance() {
    const a = this.active;
    if (!a) return;
    a.stepIdx++;
    const step = a.def.steps[a.stepIdx];
    if (!step) { this.complete(); return; }
    a.timeLimit = step.time ?? 0;
    a.timeLeft = step.time ?? Infinity;
    a.check = step.setup(this, a) || (() => {});
    if (step.obj) this.ctx.hud.setObjective(a.def.short, step.obj);
  }

  complete() {
    const a = this.active;
    this.done[a.def.id] = true;
    this.ctx.player.addMoney(a.def.reward);
    this.ctx.hud.clearObjective();
    this.ctx.hud.banner('MISSION PASSED', `${a.def.title} — ${fmt$(a.def.reward)}`);
    this.ctx.audio?.jingleWin();
    this.ctx.saveGame();
    this.cleanupEntities();
    this.active = null;
    this._blip = null;
  }

  fail(reason) {
    const a = this.active;
    this.ctx.hud.clearObjective();
    this.ctx.hud.banner('MISSION FAILED', reason);
    this.ctx.audio?.stingBad();
    this.cleanupEntities();
    this.active = null;
    this._blip = null;
  }

  cleanupEntities() {
    const a = this._lastRunnerData;
    void a;
    this.marker.hide();
    // despawn mission vehicles flagged temp
    for (const v of [...this.ctx.vehicles]) {
      if (v.missionTemp && v.driver !== 'player') v.dispose();
    }
    this.ctx.npcs.clearFaction('gang');
    this.ctx.police.clearWanted();
  }

  // helper used by step setups
  setBlip(x, z, color = '#ffd24a', char = '') {
    this._blip = { x, z, color, char };
    this.marker.show(x, z, color);
  }
  clearBlip() { this._blip = null; this.marker.hide(); }

  gotoStep(x, z, opts = {}) {
    const self = this;
    return function setup(m) {
      m.setBlip(x, z, opts.color ?? '#ffd24a');
      return (player) => {
        const d = Math.hypot(player.pos.x - x, player.pos.z - z);
        const inVehOk = !opts.requireVehicle || !!player.vehicle;
        const noVehOk = !opts.onFoot || !player.vehicle;
        if (d < (opts.r ?? 5) && inVehOk && noVehOk) { self.clearBlip(); m.next(); }
      };
    };
  }

  // ------------- taxi activity -------------
  tryStartTaxi() {
    const p = this.ctx.player;
    if (p.vehicle?.typeName !== 'taxi' || this.taxiState) return false;
    this.newFare();
    this.ctx.hud.banner('TAXI DUTY', 'Pick up fares. Beat the clock.');
    return true;
  }
  newFare() {
    const rng = new RNG('fare' + Math.random());
    const plan = this.ctx.plan;
    let px, pz;
    do { const rp = plan.randomRoadPoint(rng); px = rp.x; pz = rp.z; } while (Math.hypot(px - this.ctx.player.pos.x, pz - this.ctx.player.pos.z) < 80);
    this.taxiState = { phase: 'pickup', target: { x: px, z: pz }, faresDone: 0 };
    this.ctx.hud.setObjective('TAXI', 'Pick up the fare');
  }
  updateTaxi(dt, player) {
    const ts = this.taxiState;
    if (!player.vehicle || player.vehicle.typeName !== 'taxi') {
      if (ts.phase !== 'offboard') { this.endTaxi(); return; }
    }
    void dt;
    const tx = ts.target.x, tz = ts.target.z;
    this.marker.show(tx, tz, ts.phase === 'pickup' ? '#ffb43a' : '#7ee787', 3.4);
    const d = Math.hypot(player.pos.x - tx, player.pos.z - tz);
    if (ts.phase === 'pickup' && d < 5 && player.vehicle.speed < 1.5) {
      const rng = new RNG('drop' + Math.random());
      let dx, dz;
      do { const rp = this.ctx.plan.randomRoadPoint(rng); dx = rp.x; dz = rp.z; } while (Math.hypot(dx - tx, dz - tz) < 140);
      ts.target = { x: dx, z: dz };
      ts.dropBy = performance.now() + 75000;
      ts.phase = 'drop';
      ts.farePay = 40 + Math.floor(Math.random() * 60);
      this.ctx.hud.setObjective('TAXI', 'Drop off — $' + ts.farePay);
    } else if (ts.phase === 'drop') {
      if (performance.now() > ts.dropBy) {
        this.ctx.hud.toastPrompt('Fare walked. Taxi duty over.');
        this.endTaxi(); return;
      }
      if (d < 5 && player.vehicle.speed < 1.5) {
        player.addMoney(ts.farePay);
        ts.faresDone++;
        if (ts.faresDone >= 5) {
          player.addMoney(150);
          this.ctx.hud.banner('SHIFT COMPLETE', '5 fares! Bonus $150.');
          this.endTaxi(); return;
        }
        this.newFareContinued(ts);
      }
    }
  }
  newFareContinued(ts) {
    const rng = new RNG('fare2' + Math.random());
    let px, pz;
    do { const rp = this.ctx.plan.randomRoadPoint(rng); px = rp.x; pz = rp.z; } while (Math.hypot(px - this.ctx.player.pos.x, pz - this.ctx.player.pos.z) < 80);
    ts.phase = 'pickup';
    ts.target = { x: px, z: pz };
    this.ctx.hud.setObjective('TAXI', `Fare ${ts.faresDone + 1}/5 — pick up`);
  }
  endTaxi() {
    this.taxiState = null;
    this.marker.hide();
    this.ctx.hud.clearObjective();
  }
}

function fmt$(n) { return '$' + n.toLocaleString('en-US'); }
function playerArmed(ctx) { return ctx.player.currentWeapon !== 'fist'; }

// ---------------- store robbery ----------------
function robStore(mgr, st) {
  const ctx = mgr.ctx;
  if (st.robbing) return;
  if (!playerArmed(ctx)) { ctx.hud.toastPrompt('The clerk laughs you off. Come armed.'); return; }
  st.robbing = true;
  ctx.hud.dialog('CLERK', 'Whoa whoa! Take it! Take it!', 3);
  setTimeout(() => {
    st.robbing = false;
    if (!st.robbedRecently || performance.now() - st.robbedRecently > 120000) {
      const cash = 120 + Math.floor(Math.random() * 160);
      ctx.player.addMoney(cash);
      st.robbedRecently = performance.now();
      ctx.pickups.dropCash(st.door.x + 1, st.door.z + 1, cash);
    }
    ctx.events.emit('crime', { type: 'robbery', x: st.x, z: st.z, severity: 150 });
    ctx.hud.toastPrompt('Register emptied. Someone definitely called the cops.');
  }, 1600);
}

// ---------------- race activity ----------------
function buildRaceCheckpoints(plan) {
  // marina loop using road nodes near fixed points
  const pts = [
    [588, 420], [690, 332], [690, 140], [588, 44], [484, -56], [376, 44],
    [272, 140], [272, 332], [376, 432], [484, 522], [588, 600],
  ].map(([x, z]) => {
    const r = plan.roadAt(x, z, 10);
    return { x: r ? (r.axis === 'v' ? r.r.c : x) : x, z: r ? (r.axis === 'h' ? r.r.c : z) : z };
  });
  return pts;
}

function startRace(mgr, replayable) {
  const ctx = mgr.ctx;
  const cps = buildRaceCheckpoints(ctx.plan);
  const state = mgr.activeRace = { cps, idx: 0, lap: 1, laps: 2, opponents: [], t0: performance.now() };

  // opponent cars
  const startPos = cps[cps.length - 1];
  for (let i = 0; i < 2; i++) {
    const v = new Vehicle(ctx, i === 0 ? 'sports' : 'muscle', startPos.x + (i ? 4 : -4), startPos.z - 8 - i * 5, 0, { missionTemp: true });
    v.ai = { mode: 'race', cpIdx: 0, rubber: 0.86 + i * 0.06 };
    mgr.cars = mgr.cars || [];
    state.opponents.push(v);
  }
  mgr.active = {
    def: { id: 'race', title: 'PALM SHORES GP', short: 'RACE', reward: replayable ? 500 : 800, steps: [] },
    stepIdx: 0, data: {}, timeLeft: Infinity, timeLimit: 0,
    next: () => {}, check: () => {}, blip: () => ({ ...cps[state.idx], color: '#4fd8e0', char: '' }),
  };
  ctx.hud.banner('PALM SHORES GP', '2 laps. Checkpoints glow cyan. Don\'t embarrass us.');
  ctx.hud.setObjective('RACE', `Checkpoint 1/${cps.length} — Lap 1/${state.laps}`);

  const tick = setInterval(() => {
    if (!mgr.activeRace) { clearInterval(tick); return; }
    const p = ctx.player;
    const target = state.cps[state.idx];
    mgr.marker.show(target.x, target.z, '#4fd8e0', 5);
    if (!p.vehicle) return; // must stay in car
    if (Math.hypot(p.pos.x - target.x, p.pos.z - target.z) < 9) {
      state.idx++;
      ctx.audio?.hitmark();
      if (state.idx >= state.cps.length) {
        state.idx = 0; state.lap++;
        if (state.lap > state.laps) {
          // finish
          const oppsDone = state.opponents.filter(o => o.ai.cpIdx >= state.cps.length * state.laps).length;
          clearInterval(tick);
          mgr.marker.hide();
          mgr.activeRace = null;
          const won = oppsDone === 0;
          for (const o of state.opponents) o.dispose();
          if (won) {
            ctx.player.addMoney(mgr.active.def.reward);
            ctx.save.stats = ctx.save.stats || {};
            ctx.save.stats.racesWon = (ctx.save.stats.racesWon || 0) + 1;
            ctx.hud.banner('RACE WON', `$${mgr.active.def.reward} — clean driving.`);
            ctx.audio?.jingleWin();
          } else {
            ctx.hud.banner('RACE LOST', 'They edged you out.');
          }
          mgr.active = null;
          ctx.hud.clearObjective();
          return;
        }
        ctx.hud.setObjective('RACE', `Checkpoint 1 — Lap ${state.lap}/${state.laps}`);
      } else {
        ctx.hud.setObjective('RACE', `Checkpoint ${state.idx + 1}/${state.cps.length} — Lap ${state.lap}/${state.laps}`);
      }
    }
    // drive opponents
    for (const o of state.opponents) {
      if (o.destroyed) continue;
      const tgt = state.cps[o.ai.cpIdx % state.cps.length];
      const dx = tgt.x - o.pos.x, dz = tgt.z - o.pos.z;
      const desiredH = Math.atan2(dx, dz);
      const diff = wrapAngle(desiredH - o.heading);
      o.input.steer = clamp(diff * 2, -1, 1);
      const distToPlayer = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      const rubber = clamp(distToPlayer / 220, 0.82, 1.15) * o.ai.rubber;
      o.input.throttle = Math.abs(diff) < 1.4 ? rubber : 0.45;
      if (Math.hypot(tgt.x - o.pos.x, tgt.z - o.pos.z) < 10) o.ai.cpIdx++;
    }
  }, 50);
}

// ---------------- mission definitions ----------------
export const DEFS = {
  m1: {
    id: 'm1', title: 'WHEELS OF PENANCE', short: 'M1',
    giverKey: 'k', giverName: 'K',
    intro: 'A collector wants a Vantura GT. One is sitting at the Palm Shores valet, keys in.',
    introLine: 'Grab the gold Vantura at the marina hotel and bring it to Tiny\'s dock garage. Clock\'s running.',
    reward: 350,
    doneText: 'The buyer loved it. That chapter\'s closed.',
    steps: [
      { obj: 'Steal the gold Vantura GT at Palm Shores', time: 150,
        setup(m) {
          const ctx = m.ctx;
          const spot = ctx.snapWalkable(540, 480, { veh: true });
          const car = new Vehicle(ctx, 'sports', spot.x, spot.z, 0, { paint: '#e0a83c', missionTemp: true });
          m.data.car = car;
          m.setBlip(car.pos.x, car.pos.z, '#ffd24a');
          return (p) => {
            if (car.destroyed) return m.fail('You wrecked the merchandise!');
            if (p.vehicle === car) { m.clearBlip(); m.next(); }
          };
        } },
      { obj: 'Deliver it to Tiny\'s dock garage in Ironworks', time: 110,
        setup(m) {
          const g = m.ctx.snapWalkable(-664, 380, { veh: true });
          const tx = g.x, tz = g.z;
          m.setBlip(tx, tz, '#ffd24a', '');
          return (p) => {
            if (m.data.car.destroyed) return m.fail('The Vantura is scrap now.');
            if (p.vehicle === m.data.car && Math.hypot(p.pos.x - tx, p.pos.z - tz) < 8 && p.vehicle.speed < 2) {
              m.clearBlip(); m.next();
            }
          };
        } },
    ],
  },

  m2: {
    id: 'm2', title: 'HOT PACKAGE', short: 'M2',
    giverKey: 'dario', giverName: 'Dario',
    requires: ['m1'],
    intro: 'A briefcase needs moving through Meridian. Police may be tipped — lose them en route.',
    introLine: 'Case is in Midtown. Cops got a whisper, so expect heat. Lose them before you deliver to my guy in Old Town.',
    reward: 500,
    doneText: 'Clean run. The client pays on delivery, every time.',
    steps: [
      { obj: 'Collect the briefcase in Meridian Midtown',
        setup(m) {
          const { x, z } = m.ctx.snapWalkable(-92, 190);
          m.setBlip(x, z, '#ffd24a');
          return (p) => {
            if (Math.hypot(p.pos.x - x, p.pos.z - z) < 4.5) {
              m.ctx.hud.toastPrompt('Briefcase secured.');
              m.ctx.police.addHeat(90); // tipped off!
              m.ctx.hud.banner('TIPPED OFF', 'A patrol got the call. Lose them or outrun them.');
              m.clearBlip(); m.next();
            }
          };
        } },
      { obj: 'Lose the police', time: 180,
        setup(m) {
          return (p) => {
            if (m.ctx.police.stars === 0) { m.next(); }
          };
        } },
      { obj: 'Deliver the case to Cannery Row', time: 120,
        setup(m) {
          const { x, z } = m.ctx.snapWalkable(430, -300);
          m.setBlip(x, z, '#ffd24a');
          return (p) => {
            if (Math.hypot(p.pos.x - x, p.pos.z - z) < 5) { m.clearBlip(); m.next(); }
          };
        } },
    ],
  },

  m3: {
    id: 'm3', title: 'CLEANUP CREW', short: 'M3',
    giverKey: 'tiny', giverName: 'Tiny',
    requires: ['m1'],
    intro: 'Copperheads jumped my crew at the container yard. Return the favor. K-11 on the house after.',
    introLine: 'Five of them are squatting in MY yard. Make the point permanent, then handle whoever comes crying.',
    reward: 650,
    doneText: 'Yard\'s quiet. Nobody squats on Tiny twice.',
    steps: [
      { obj: 'Go to the Ironworks container yard',
        setup(m) {
          const { x, z } = m.ctx.snapWalkable(-560, 300, { veh: true });
          m.data.yard = { x, z };
          m.setBlip(x, z, '#ff6a5e');
          return (p) => {
            if (Math.hypot(p.pos.x - x, p.pos.z - z) < 30) {
              m.ctx.npcs.spawnGang(x, z, 5, {});
              m.ctx.hud.toastPrompt('Copperheads spotted — light \'em up.');
              m.clearBlip(); m.next();
            }
          };
        } },
      { obj: 'Eliminate the Copperheads (0/5)',
        setup(m, a) {
          a.data.kills = 0;
          return () => {
            m.ctx.hud.setObjective('CLEANUP CREW', `Eliminate the Copperheads (${Math.min(5, a.data.kills)}/5)`);
          };
        } },
      { obj: 'Handle the retaliation wave',
        setup(m) {
          setTimeout(() => {
            if (m.active?.def.id === 'm3') {
              const y = m.data.yard || { x: -560, z: 300 };
              m.ctx.npcs.spawnGang(y.x, y.z, 3, { provoked: true });
              m.ctx.hud.toastPrompt('Retaliation crew incoming!');
            }
          }, 2500);
          return () => {
            const alive = m.ctx.npcs.peds.filter(pp => pp.faction === 'gang' && !pp.dead).length;
            if (alive > 0) m.ctx.hud.setObjective('CLEANUP CREW', `Survive & eliminate (${alive} left)`);
          };
        } },
      { obj: 'Reward: K-11 SMG added to your arsenal',
        setup(m) {
          return () => {
            m.ctx.player.giveWeapon('smg', 90);
            m.ctx.player.ammoPool.smg = (m.ctx.player.ammoPool.smg || 0) + 90;
            m.next();
          };
        } },
    ],
  },

  m4: {
    id: 'm4', title: 'BOARDWORK RIVALRY', short: 'M4',
    giverKey: 'marisol', giverName: 'Marisol',
    requires: [],
    intro: 'Two clowns keep winning my street races. Humiliate them around Palm Shores.',
    introLine: 'Two laps around the shore circuit. Beat both of them and the purse is yours.',
    reward: 800,
    doneText: 'That was beautiful. They quit racing, I hear.',
    steps: [
      { obj: 'Get any car and win the Palm Shores GP',
        setup(m) {
          startRace(m, false);
          return () => {};
        } },
    ],
  },

  m5: {
    id: 'm5', title: 'THE VAULT JOB', short: 'M5',
    giverKey: 'k', giverName: 'K',
    requires: ['m1', 'm2', 'm3', 'm4'],
    intro: 'Spire District Federal vault. We crack it loud, we leave richer, we vanish.',
    introLine: 'Crack the vault downtown. Alarm brings everyone — respray if you have to, then bring the bonds to Marisol.',
    reward: 2000,
    doneText: 'Port Vela will remember this week. Lay low, champ.',
    steps: [
      { obj: 'Crack the vault at Spire District Federal',
        setup(m) {
          const { x, z } = m.ctx.snapWalkable(-36, -110);
          m.setBlip(x, z, '#ffd24a');
          let hold = 0;
          return (p) => {
            const d = Math.hypot(p.pos.x - x, p.pos.z - z);
            if (d < 6 && p.currentWeapon !== 'fist') {
              hold += 1 / 60;
              m.ctx.hud.setObjective('THE VAULT JOB', `Cracking vault… ${Math.min(100, Math.floor(hold * 40))}%`);
              if (hold >= 2.5) {
                m.ctx.police.addHeat(210);
                m.ctx.hud.banner('ALARM TRIGGERED', 'Three stars of trouble incoming. Move!');
                m.clearBlip(); m.next();
              }
            } else {
              hold = 0;
              m.ctx.hud.setObjective('THE VAULT JOB', 'Crack the vault — get close & draw your weapon');
            }
          };
        } },
      { obj: 'Shake the heat (respray works)', time: 240,
        setup(m) {
          return () => {
            if (m.ctx.police.stars === 0) { m.next(); }
          };
        } },
      { obj: 'Deliver the bearer bonds to Marisol at Palm Shores', time: 150,
        setup(m) {
          const { x, z } = m.ctx.snapWalkable(540, 512);
          m.setBlip(x, z, '#ffd24a');
          return (p) => {
            if (Math.hypot(p.pos.x - x, p.pos.z - z) < 5) {
              p.addMoney(400); // bonus bonds
              m.clearBlip(); m.next();
            }
          };
        } },
      { obj: '',
        setup(m) {
          m.ctx.player.giveWeapon('rifle', 72);
          m.ctx.player.ammoPool.rifle = (m.ctx.player.ammoPool.rifle || 0) + 72;
          return () => { m.next(); };
        } },
    ],
  },
};
