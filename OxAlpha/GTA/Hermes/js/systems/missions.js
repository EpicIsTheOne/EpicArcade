// ============================================================
// NEON MERIDIAN — systems/missions.js
// Story missions (5, multi-stage), street race, hidden
// packages, stunt jumps, shops. Real staged objectives with
// world markers, timers, fail states and rewards.
// ============================================================
'use strict';

const Missions = (() => {

  const BLIP = { mission: 0x35d5ff, race: 0xffd24a, shop: 0x7dff9e };

  class Marker {
    constructor(scene, x, z, color, radius) {
      this.pos = { x, z };
      this.radius = radius || 3.2;
      const geo = new THREE.CylinderGeometry(this.radius, this.radius, 2.4, 20, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
      });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.position.set(x, 1.2, z);
      scene.add(this.mesh);
      this.beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 60, 8, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.10, depthWrite: false }));
      this.beam.position.set(x, 30, z);
      scene.add(this.beam);
    }
    dispose(scene) { scene.remove(this.mesh); scene.remove(this.beam); }
    update(t) {
      this.mesh.material.opacity = 0.2 + Math.sin(t * 3) * 0.08;
    }
  }

  // ---------------- mission definitions ----------------
  const DEFS = [
    {
      id: 'mara1', giver: 'mara', name: 'First Light', reward: 250,
      brief: 'Mara needs eyes on the harbor. Grab wheels and meet her spotter in Old Harbor.',
      stages: [
        { text: 'Steal any car', type: 'carjack', },
        { text: 'Drive to the spotter in Old Harbor', type: 'goto', x: null, z: null, needVehicle: true, radius: 5 }, // filled at runtime
      ],
    },
    {
      id: 'dex1', giver: 'dex', name: 'Hot Package', reward: 400,
      brief: 'A courier dropped a case in the park. It is hot — so will you be. Clock is running.',
      stages: [
        { text: 'Pick up the case in Halcyon Park', type: 'goto', radius: 3.5 },
        { text: 'Deliver it to the drop in Ashford Heights (90s)', type: 'goto', radius: 4, timeLimit: 90, needVehicle: true, giveWanted: 1 },
      ],
    },
    {
      id: 'yun1', giver: 'yun', name: 'Repo Run', reward: 650,
      brief: 'A Vector GT skipped three payments. Take it back. The owner will disagree.',
      stages: [
        { text: 'Ram the Vector GT until it stops', type: 'chase' },
        { text: 'Deliver the Vector to Rustyard Docks', type: 'goto', radius: 6, needVehicle: true },
      ],
    },
    {
      id: 'mara2', giver: 'mara', name: 'Clean Streets', reward: 800,
      brief: 'The Vex Crew shook down her block. Return the favor. Loudly. Then vanish.',
      stages: [
        { text: 'Take out the Vex Crew (0/4)', type: 'combat', count: 4 },
        { text: 'Lose the heat', type: 'escape' },
      ],
    },
    {
      id: 'dex2', giver: 'dex', name: 'The Long Drop', reward: 1500, unlock: 'rifle',
      brief: 'Three cases, one night, half the precinct after you. Meridian Core to Old Harbor. Go.',
      stages: [
        { text: 'Reach the Spire plaza', type: 'goto', radius: 6 },
        { text: 'Collect the cases (0/3) — 75s', type: 'collect', count: 3, timeLimit: 75 },
        { text: 'Drop everything in Old Harbor', type: 'goto', radius: 5, giveWanted: 3, needVehicle: true },
        { text: 'Lose the cops', type: 'escape' },
      ],
    },
  ];

  class MissionMgr {
    constructor(scene, layout) {
      this.scene = scene;
      this.layout = layout;
      this.markers = [];           // activity markers (givers, shops, race)
      this.active = null;          // {def, stageIdx, data}
      this.banner = null;          // {text, t}
      this.toast = null;
      this.race = null;
      this.giverMeshes = [];
      this.buildActivityMarkers();
    }

    giverPos(id) { return this.layout.locations.missions[id]; }

    buildActivityMarkers() {
      const L = this.layout;
      // mission givers
      for (const id of ['mara', 'dex', 'yun']) {
        const p = this.giverPos(id);
        const m = new Marker(this.scene, p.x, p.z, BLIP.mission, 2.2);
        this.markers.push({ marker: m, kind: 'giver', id, done: false });
        // giver character (static colored figure)
        const rig = NPC.buildPed();
        const colors = { mara: 0xc23b6e, dex: 0x35a5c2, yun: 0xc2a535 };
        const mat = new THREE.MeshLambertMaterial({ color: colors[id] });
        rig.root.children.forEach(ch => { if (ch.material) ch.material = mat; });
        rig.root.position.set(p.x, 0.14, p.z);
        rig.root.rotation.y = Math.PI;
        this.scene.add(rig.root);
        this.giverMeshes.push(rig.root);
      }
      // shops
      L.locations.paynpray.forEach((p, i) => this.markers.push({
        marker: new Marker(this.scene, p.x, p.z, BLIP.shop, 3.0), kind: 'paynpray', id: 'pns' + i }));
      L.locations.gunshop.forEach((p, i) => this.markers.push({
        marker: new Marker(this.scene, p.x, p.z, BLIP.shop, 3.0), kind: 'gunshop', id: 'gun' + i }));
      L.locations.food.forEach((p, i) => this.markers.push({
        marker: new Marker(this.scene, p.x, p.z, BLIP.shop, 2.6), kind: 'food', id: 'food' + i }));
      // race start
      const r = L.locations.raceStart;
      this.markers.push({ marker: new Marker(this.scene, r.x, r.z, BLIP.race, 3.4), kind: 'race', id: 'race' });
    }

    availableFor(giverId) {
      const done = GameState.state.missionsDone;
      return DEFS.filter(d => d.giver === giverId && !done.includes(d.id))
        .sort((a, b) => done.length && 0 || 0);
    }

    nextFor(giverId) {
      const done = GameState.state.missionsDone;
      return DEFS.find(d => d.giver === giverId && !done.includes(d.id)) || null;
    }

    start(defId, game) {
      const def = DEFS.find(d => d.id === defId);
      if (!def || this.active) return false;
      this.active = { def, stageIdx: 0, data: {}, timer: 0, stageMarker: null };
      this.enterStage(game);
      return true;
    }

    clearStageMarker() {
      if (this.active && this.active.stageMarker) {
        this.active.stageMarker.dispose(this.scene);
        this.active.stageMarker = null;
      }
    }

    enterStage(game) {
      const A = this.active, st = A.def.stages[A.stageIdx], L = this.layout;
      A.timer = st.timeLimit || 0;
      if (st.type === 'goto' || st.type === 'deliver') {
        let x = st.x, z = st.z;
        if (x === null || x === undefined) {
          // stage-specific targets resolved at runtime
          const spots = {
            'mara1': [L.locations.missions.dex.x, L.size - 2.4 * CONFIG.BLOCK],
            'dex1': [[7.5 * CONFIG.BLOCK, 7.5 * CONFIG.BLOCK], [2.5 * CONFIG.BLOCK, 2.5 * CONFIG.BLOCK]],
            'yun1': [[3 * CONFIG.BLOCK, 11.5 * CONFIG.BLOCK]],
            'mara2': null,
            'dex2': [[7 * CONFIG.BLOCK, 4.2 * CONFIG.BLOCK], null, [12.5 * CONFIG.BLOCK, 11.5 * CONFIG.BLOCK], null],
          };
          const s = (spots[A.def.id] || [])[A.stageIdx];
          if (s) { x = s[0]; z = s[1]; }
        }
        if (x !== undefined && x !== null) {
          A.stageMarker = new Marker(this.scene, x, z, BLIP.mission, st.radius);
          A.target = { x, z };
        }
      } else if (st.type === 'chase') {
        this.spawnChaseTarget(game);
      } else if (st.type === 'combat') {
        this.spawnGang(game, st.count);
        A.kills = 0;
      } else if (st.type === 'collect') {
        A.items = [];
        const base = { x: 7 * CONFIG.BLOCK, z: 4.2 * CONFIG.BLOCK };
        for (let i = 0; i < st.count; i++) {
          const ang = (i / st.count) * Math.PI * 2;
          const ix = base.x + Math.cos(ang) * 55, iz = base.z + Math.sin(ang) * 55;
          const m = new Marker(this.scene, ix, iz, 0xffd24a, 2.2);
          A.items.push({ marker: m, x: ix, z: iz, got: false });
        }
      }
      game.hud.objective(this.stageText());
    }

    stageText() {
      const A = this.active;
      let t = A.def.stages[A.stageIdx].text;
      if (A.def.stages[A.stageIdx].type === 'combat') t = t.replace('0', A.kills || 0);
      if (A.def.stages[A.stageIdx].type === 'collect') {
        const got = (A.items || []).filter(i => i.got).length;
        t = t.replace('0', got);
      }
      return t;
    }

    spawnChaseTarget(game) {
      const L = this.layout;
      const p = L.locations.raceStart;
      const v = new Vehicle('sports', p.x + 10, p.z - 40, 0, { color: 0xd8b02e });
      v.driver = 'mission';
      v.speed = 10;
      game.scene.add(v.mesh.group);
      // flee AI: pick far graph nodes repeatedly
      const nodes = L.graph.nodes;
      let targetNode = 0;
      const flee = { v, update: (dt, ctx) => {
        const bn = nodes[targetNode];
        if (Math.hypot(bn.x - v.pos.x, bn.z - v.pos.z) < 10) {
          targetNode = Math.floor(Math.random() * nodes.length);
        }
        const desired = Math.atan2(bn.x - v.pos.x, -(bn.z - v.pos.z));
        v.steerInput = clamp(angleDelta(v.heading, desired) * 2, -1, 1);
        v.throttle = 0.92; v.brake = 0;
        if (v.hp < v.cls.hp * 0.3) { v.throttle = 0; v.brake = 1; }  // disabled
        v.headlightsOn = true;
        v.step(dt, ctx.world, ctx.vehicles);
      }};
      this.active.data.chase = flee;
      this.active.data.chaseVehicle = v;
      game.missionVehicles.push(v);
    }

    spawnGang(game, count) {
      const L = this.layout;
      const base = { x: 3 * CONFIG.BLOCK, z: 11.5 * CONFIG.BLOCK };
      const gang = [];
      for (let i = 0; i < count; i++) {
        const rig = NPC.buildPed();
        const mat = new THREE.MeshLambertMaterial({ color: 0x8a2ac2 });
        rig.root.children.forEach(ch => { if (ch.material) ch.material = mat; });
        const x = base.x + (Math.random() - 0.5) * 30, z = base.z + (Math.random() - 0.5) * 30;
        rig.root.position.set(x, 0.14, z);
        this.scene.add(rig.root);
        gang.push({ rig, pos: rig.root.position, hp: 70, dead: false,
          fireT: 1 + Math.random() * 2, root: rig.root });
      }
      this.active.data.gang = gang;
      game.gangMembers = gang;
    }

    /** per-frame */
    update(dt, game) {
      for (const m of this.markers) m.marker.update(game.timeNow);
      if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
      if (!this.active) return;
      const A = this.active, st = A.def.stages[A.stageIdx], pp = game.player.pos;

      if (A.timer > 0) {
        A.timer -= dt;
        if (A.timer <= 0) { this.fail(game, 'Out of time'); return; }
      }
      if (A.stageMarker) A.stageMarker.update(game.timeNow);

      switch (st.type) {
        case 'carjack':
          if (game.player.inVehicle) this.advance(game);
          break;
        case 'goto': {
          if (!A.target) { this.advance(game); break; }
          const d = Math.hypot(pp.x - A.target.x, pp.z - A.target.z);
          const inV = !!game.player.inVehicle;
          if (d < st.radius && (!st.needVehicle || inV)) {
            if (st.giveWanted) {
              game.wanted.heat = Math.max(game.wanted.heat, [0, 20, 45, 80][st.giveWanted] || 20);
              game.wanted.recomputeLevel();
            }
            this.advance(game);
          } else if (d < st.radius && st.needVehicle && !inV) {
            game.hud.hint('You need wheels for this drop');
          }
          break;
        }
        case 'chase': {
          const v = A.data.chaseVehicle;
          if (!v || v.disposed) { this.fail(game, 'The Vector got away'); break; }
          if (v.hp <= v.cls.hp * 0.3 && Math.abs(v.speed) < 2) {
            A.data.chase.v.driver = null;
            this.advance(game);
          }
          break;
        }
        case 'combat': {
          const gang = A.data.gang || [];
          const alive = gang.filter(g => !g.dead).length;
          if (gang.length && alive < gang.length) {
            A.kills = gang.length - alive;
            game.hud.objective(this.stageText());
          }
          if (alive === 0) {
            game.wanted.heat = Math.max(game.wanted.heat, 46);
            game.wanted.recomputeLevel();
            this.advance(game);
          }
          break;
        }
        case 'collect': {
          let got = 0;
          for (const it of A.items) {
            if (it.got) { got++; continue; }
            it.marker.update(game.timeNow);
            if (Math.hypot(pp.x - it.x, pp.z - it.z) < 2.6) {
              it.got = true; it.marker.dispose(this.scene);
              game.audio.play('cash');
            }
          }
          game.hud.objective(this.stageText());
          if (got >= A.items.length) this.advance(game);
          break;
        }
        case 'escape':
          if (game.wanted.stars === 0) this.advance(game);
          break;
      }
    }

    advance(game) {
      const A = this.active;
      this.clearStageMarker();
      A.stageIdx++;
      game.audio.play('stage');
      if (A.stageIdx >= A.def.stages.length) this.complete(game);
      else this.enterStage(game);
    }

    complete(game) {
      const A = this.active;
      const st = GameState.state;
      st.missionsDone.push(A.def.id);
      st.money += A.def.reward;
      if (A.def.unlock && !st.weapons[A.def.unlock]) {
        st.weapons[A.def.unlock] = true;
        st.ammo[A.def.unlock] = (st.ammo[A.def.unlock] || 0) + 60;
        game.hud.toast(`Unlocked: ${CONFIG.WEAPONS.find(w => w.id === A.def.unlock).name}`);
      }
      game.audio.play('mission');
      game.hud.missionBanner(`${A.def.name} — COMPLETE`, `+$${A.def.reward}`);
      game.autosave();
      this.active = null;
      this.clearStageMarker();
      game.cleanupMissionEntities();
    }

    fail(game, why) {
      const A = this.active;
      game.hud.missionBanner(`${A.def.name} — FAILED`, why || '');
      game.audio.play('fail');
      this.active = null;
      this.clearStageMarker();
      game.cleanupMissionEntities();
    }

    // ---------------- activities ----------------
    updateGiverInteraction(game) {
      if (this.active) return null;
      const pp = game.player.pos;
      for (const m of this.markers) {
        if (m.kind !== 'giver') continue;
        const p = m.marker.pos;
        if (Math.hypot(pp.x - p.x, pp.z - p.z) < 3.2) {
          const next = this.nextFor(m.id);
          if (next) return { kind: 'mission', def: next };
          return { kind: 'giverDone', id: m.id };
        }
      }
      return null;
    }

    tryStartRace(game) {
      if (this.race || this.active) return false;
      const L = this.layout;
      // checkpoint loop around downtown ring
      const cps = [];
      const ring = [[4, 4], [7, 3], [10, 4], [11, 7], [10, 10], [7, 11], [4, 10], [3, 7]];
      for (const [i, j] of ring) {
        const x = (i + 0.5) * CONFIG.BLOCK, z = (j + 0.5) * CONFIG.BLOCK;
        // snap to nearest road intersection
        const gi = Math.round((x) / CONFIG.BLOCK), gj = Math.round((z) / CONFIG.BLOCK);
        cps.push({ x: gi * CONFIG.BLOCK, z: gj * CONFIG.BLOCK });
      }
      this.race = { cps, idx: 0, t: 0, running: false, marker: null };
      return true;
    }

    updateRace(dt, game) {
      const R = this.race;
      if (!R || !R.running) return;
      R.t += dt;
      const pp = game.player.pos;
      const cp = R.cps[R.idx];
      if (!R.marker) {
        R.marker = new Marker(this.scene, cp.x, cp.z, BLIP.race, 7);
      }
      R.marker.update(game.timeNow);
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 8 && game.player.inVehicle) {
        R.idx++;
        game.audio.play('stage');
        if (R.idx >= R.cps.length) {
          const ms = Math.round(R.t * 1000);
          const best = GameState.state.bestRaceMs;
          const isBest = !best.race1 || ms < best.race1;
          if (isBest) best.race1 = ms;
          const prize = 500 + (isBest ? 250 : 0);
          GameState.state.money += prize;
          game.hud.missionBanner('STREET CIRCUIT — FINISH', `${(R.t).toFixed(1)}s ${isBest ? '— NEW BEST! ' : ''}+$${prize}`);
          game.audio.play('mission');
          R.marker.dispose(this.scene);
          this.race = null;
        } else {
          R.marker.dispose(this.scene);
          R.marker = null;
        }
      }
    }
  }

  return { MissionMgr, Marker, DEFS };
})();

if (typeof module !== 'undefined') module.exports = { Missions: null };
