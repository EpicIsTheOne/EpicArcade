// ============================================================
// NEON MERIDIAN — entities/npc.js
// Pedestrians, traffic drivers, police (cars + foot officers).
// All AI feeds the same Vehicle.step / simple kinematics.
// ============================================================
'use strict';

const NPC = (() => {

  // ---------------- pedestrian rig (cheap, shared geo) ----------------
  let pedGeo = null;
  const pedMats = [];
  function initShared() {
    if (pedGeo) return;
    pedGeo = {
      torso: new THREE.BoxGeometry(0.4, 0.62, 0.22),
      head: new THREE.SphereGeometry(0.13, 10, 8),
      leg: (() => { const g = new THREE.BoxGeometry(0.14, 0.78, 0.17); g.translate(0, -0.39, 0); return g; })(),
      arm: (() => { const g = new THREE.BoxGeometry(0.11, 0.6, 0.13); g.translate(0, -0.3, 0); return g; })(),
    };
    const shirts = [0xc2543a, 0x3a6ac2, 0x3ac27e, 0xc2a53a, 0x8a3ac2, 0xd8d3c8, 0x35435a, 0x6a4a36];
    const pants = [0x2a2e36, 0x3d4450, 0x4a4038, 0x25333d];
    const skins = [0xd9a886, 0xb07b54, 0x8a5a3a, 0xe8c39a];
    for (let i = 0; i < shirts.length; i++) {
      pedMats.push({
        shirt: new THREE.MeshLambertMaterial({ color: shirts[i] }),
        pants: new THREE.MeshLambertMaterial({ color: pants[i % pants.length] }),
        skin: new THREE.MeshLambertMaterial({ color: skins[i % skins.length] }),
      });
    }
  }

  function buildPed() {
    initShared();
    const m = pedMats[Math.floor(Math.random() * pedMats.length)];
    const g = new THREE.Group();
    const torso = new THREE.Mesh(pedGeo.torso, m.shirt); torso.position.y = 1.12;
    const head = new THREE.Mesh(pedGeo.head, m.skin); head.position.y = 1.58;
    const legL = new THREE.Mesh(pedGeo.leg, m.pants); legL.position.set(-0.1, 0.8, 0);
    const legR = new THREE.Mesh(pedGeo.leg, m.pants.clone()); legR.position.set(0.1, 0.8, 0);
    const armL = new THREE.Mesh(pedGeo.arm, m.shirt); armL.position.set(-0.26, 1.4, 0);
    const armR = new THREE.Mesh(pedGeo.arm, m.shirt); armR.position.set(0.26, 1.4, 0);
    g.add(torso, head, legL, legR, armL, armR);
    return { root: g, legL, legR, armL, armR };
  }

  // ---------------- Ped ----------------
  class Ped {
    constructor(scene, x, z, corners) {
      this.rig = buildPed();
      this.root = this.rig.root;
      scene.add(this.root);
      this.pos = new THREE.Vector3(x, 0.14, z);
      this.heading = Math.random() * Math.PI * 2;
      this.speed = 0;
      this.state = 'walk';            // walk | flee | dead
      this.stateT = 0;
      this.corners = corners;         // 4 sidewalk corners of home block [{x,z}...]
      this.target = 0;                // index of corner heading to
      this.animPhase = Math.random() * 6;
      this.walkBias = Math.random() * 0.42;
      this.hp = 40;
      this.panicScream = 0;
      this.pickTarget();
      this.sync();
    }

    pickTarget() {
      // nearest corner then walk the loop
      let best = 0, bd = 1e9;
      for (let i = 0; i < 4; i++) {
        const c = this.corners[i];
        const d = (c.x - this.pos.x) ** 2 + (c.z - this.pos.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      this.target = (best + 1 + Math.floor(Math.random() * 3)) % 4;
    }

    cornerPos(i) { return this.corners[(i % 4 + 4) % 4]; }

    update(dt, ctx) {
      if (this.state === 'dead') { this.stateT += dt; return; }
      this.stateT += dt;

      let speed;
      if (this.state === 'flee') {
        speed = 6.2;
        if (this.stateT > 6) { this.state = 'walk'; this.stateT = 0; this.pickTarget(); }
        // run directly away from last danger point
        const dx = this.pos.x - this.dangerPos.x, dz = this.pos.z - this.dangerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.heading = Math.atan2(dx / d, -(dz / d));
      } else {
        speed = 1.35 + this.walkBias;
        const c = this.cornerPos(this.target);
        const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.2) { this.target = (this.target + 1) % 4; }
        else this.heading += angleDelta(this.heading, Math.atan2(dx / d, -(dz / d))) * clamp(dt * 4, 0, 1);
      }

      // obstacle: don't walk into buildings — probe ahead
      const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
      const px = this.pos.x + fx * 1.1, pz = this.pos.z + fz * 1.1;
      for (const col of ctx.colliders) {
        if (col.h < 0.5) continue;
        if (px > col.x0 - 0.3 && px < col.x1 + 0.3 && pz > col.z0 - 0.3 && pz < col.z1 + 0.3) {
          this.heading += 1.8 * dt * 8; // turn away
          speed *= 0.3;
          break;
        }
      }

      this.speed = damp(this.speed, speed, 6, dt);
      this.pos.x += fx * this.speed * dt;
      this.pos.z += fz * this.speed * dt;

      // hit by car?
      for (const v of ctx.vehicles) {
        if (Math.abs(v.speed) < 5) continue;
        const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
        if (Math.abs(dx) < v.halfLen + 0.5 && Math.abs(dz) < v.halfLen + 0.5) {
          this.damage(1000, ctx, v.driver === 'player');
        }
      }

      this.animPhase += dt * this.speed * 2.4;
      if (this.panicScream > 0) this.panicScream -= dt;
      this.sync();
    }

    panic(dangerPos) {
      if (this.state === 'dead') return;
      this.state = 'flee'; this.stateT = 0;
      this.dangerPos = { x: dangerPos.x, z: dangerPos.z };
      this.panicScream = 2;
    }

    damage(amount, ctx, byPlayer) {
      if (this.state === 'dead') return;
      this.hp -= amount;
      if (this.hp <= 0) {
        this.state = 'dead'; this.stateT = 0;
        this.root.rotation.z = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
        this.root.position.y = 0.3;
        ctx.onPedKilled(this, byPlayer);
      } else {
        this.panic(ctx.player ? ctx.player.pos : this.pos);
      }
    }

    sync() {
      this.root.position.copy(this.pos);
      this.root.rotation.y = -this.heading;
      if (this.state !== 'dead') {
        const sw = Math.sin(this.animPhase) * clamp(this.speed / 2, 0.1, 1) * 0.8;
        this.rig.legL.rotation.x = sw;
        this.rig.legR.rotation.x = -sw;
        this.rig.armL.rotation.x = -sw * 0.7;
        this.rig.armR.rotation.x = sw * 0.7;
        if (this.state === 'flee') { this.rig.armL.rotation.x = -1.4; this.rig.armR.rotation.x = -1.4; }
      }
    }
  }

  // ---------------- Traffic driver ----------------
  class TrafficCar {
    constructor(vehicle, fromNode, toNode) {
      this.v = vehicle;
      this.v.driver = 'traffic';
      this.from = fromNode; this.to = toNode;
      this.state = 'drive';
      this.blockedT = 0;
      this.honkT = 0;
      this.panic = false;
    }

    laneTarget(out, layout) {
      // point ahead on current edge with right-hand lane offset
      const a = layout.graph.nodes[this.from], b = layout.graph.nodes[this.to];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const rx = -uz, rz = ux;                       // right of travel
      const off = CONFIG.ROAD_W * 0.22;
      out.set(b.x - ux * 6 + rx * off, 0, b.z - uz * 6 + rz * off);
      return out;
    }

    update(dt, ctx) {
      const v = this.v;
      const layout = ctx.layout;
      const bn = layout.graph.nodes[this.to];

      // arrived at node? pick next
      const distToNode = Math.hypot(bn.x - v.pos.x, bn.z - v.pos.z);
      if (distToNode < 7) {
        const next = this.pickNext(layout);
        this.from = this.to; this.to = next;
      }

      // traffic light check
      let stopForLight = false;
      if (bn.light && distToNode < 12 && distToNode > 6.5) {
        const greenNS = ctx.lightPhase < 14;
        const travelNS = Math.abs(bn.x - layout.graph.nodes[this.from].x) < 1;
        if ((travelNS && !greenNS) || (!travelNS && greenNS)) stopForLight = true;
      }

      // obstacle ahead (vehicles & peds & player)
      let brakeFor = 0;
      const f = v.forward;
      for (const o of ctx.vehicles) {
        if (o === v) continue;
        const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * -f.z + dz * f.x);
        if (ahead > 0 && ahead < 9 && side < 2.2) brakeFor = Math.max(brakeFor, 1 - ahead / 9);
      }
      for (const p of ctx.peds) {
        if (p.state === 'dead') continue;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * -f.z + dz * f.x);
        if (ahead > 0 && ahead < 8 && side < 1.8) brakeFor = Math.max(brakeFor, 1 - ahead / 8);
      }
      if (ctx.player && !ctx.player.inVehicle) {
        const dx = ctx.player.pos.x - v.pos.x, dz = ctx.player.pos.z - v.pos.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * -f.z + dz * f.x);
        if (ahead > 0 && ahead < 8 && side < 1.8) { brakeFor = Math.max(brakeFor, 1 - ahead / 8); }
      }

      // steer toward lane target
      const tgt = this.laneTarget(TRAFFIC_TMP, layout);
      const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z;
      const desired = Math.atan2(dx, -dz);
      const delta = angleDelta(v.heading, desired);
      v.steerInput = clamp(delta * 2.2, -1, 1);

      const limit = layout.graph.nodes[this.from].speedLimit || 14;
      const cruise = this.panic ? limit * 1.3 : limit * 0.8;
      if (stopForLight || brakeFor > 0.05) {
        v.throttle = 0;
        v.brake = stopForLight ? (distToNode < 9 ? 0.8 : 0.35) : brakeFor;
        if (brakeFor > 0.4 && v.speed < 1 && Math.random() < dt * 0.5) ctx.audio.play('horn');
      } else {
        v.brake = 0;
        v.throttle = v.speed < cruise ? 0.75 : 0;
      }

      // stuck logic
      if (v.speed < 0.4 && v.throttle > 0) {
        this.blockedT += dt;
        if (this.blockedT > 4) { v.brake = 0; v.throttle = 0; v.speed = -2.5; if (this.blockedT > 6) this.blockedT = 0; }
      } else this.blockedT = Math.max(0, this.blockedT - dt);

      v.headlightsOn = ctx.night;
      v.step(dt, ctx.world, ctx.vehicles);
    }

    pickNext(layout) {
      const nodes = layout.graph.nodes;
      const a = nodes[this.from], b = nodes[this.to];
      const opts = [];
      for (const [n1, n2] of layout.graph.edges) {
        if (n1 === this.to) opts.push(n2);
        else if (n2 === this.to) opts.push(n1);
      }
      if (!opts.length) return this.from;
      // prefer straight; weight by direction
      const curUx = b.x - a.x, curUz = b.z - a.z;
      let best = opts[0], bestScore = -1e9;
      for (const o of opts) {
        const n = nodes[o];
        const ux = n.x - b.x, uz = n.z - b.z;
        const dot = (ux * curUx + uz * curUz);
        let score = dot + (Math.random() - 0.35) * 30;   // mostly straight, some turns
        if (o === this.from) score -= 100;               // avoid U-turn
        if (score > bestScore) { bestScore = score; best = o; }
      }
      return best;
    }
  }
  const TRAFFIC_TMP = new THREE.Vector3();

  // ---------------- Police ----------------
  class PoliceUnit {
    constructor(vehicle) {
      this.v = vehicle;
      this.v.driver = 'police';
      this.v.sirenOn = true;
      this.mode = 'pursuit';        // pursuit | search | retreat
      this.footOfficer = null;
      this.ramT = 0;
    }

    update(dt, ctx) {
      const v = this.v;
      v.headlightsOn = true;
      const target = ctx.player;
      const tp = (ctx.lastKnown && this.mode === 'search') ? ctx.lastKnown : target.pos;

      if (this.mode === 'retreat') {
        // drive away & despawn
        const dx = v.pos.x - tp.x, dz = v.pos.z - tp.z;
        const desired = Math.atan2(dx, -dz);
        v.steerInput = clamp(angleDelta(v.heading, desired) * 2, -1, 1);
        v.throttle = 0.9; v.brake = 0;
        v.step(dt, ctx.world, ctx.vehicles);
        return;
      }

      const distToPlayer = Math.hypot(target.pos.x - v.pos.x, target.pos.z - v.pos.z);

      // player on foot & close -> stop and deploy officer
      if (!target.inVehicle && distToPlayer < 22 && v.speed < 6) {
        v.throttle = 0; v.brake = 1;
        if (!this.footOfficer && ctx.spawnFootOfficer) {
          this.footOfficer = ctx.spawnFootOfficer(v.pos.x, v.pos.z);
        }
      } else {
        // pursue via direct steering (roads are dense; arcade pursuit)
        const lead = clamp(distToPlayer / 30, 0.4, 1.6);
        const px = tp.x, pz = tp.z;
        const desired = Math.atan2(px - v.pos.x, -(pz - v.pos.z));
        const delta = angleDelta(v.heading, desired);
        v.steerInput = clamp(delta * 2.4, -1, 1);
        // slow for hard turns
        const hard = Math.abs(delta) > 1.1;
        v.throttle = hard ? 0.35 : 1;
        v.brake = (Math.abs(delta) > 2.2 && v.speed > 8) ? 0.6 : 0;
        // stuck? reverse a moment
        if (v.speed < 0.5 && v.throttle > 0.5) {
          this.ramT += dt;
          if (this.ramT > 1.6) { v.speed = -4; if (this.ramT > 2.6) this.ramT = 0; }
        } else this.ramT = Math.max(0, this.ramT - dt);
      }

      // drop foot officer chase if player flees far in car
      if (this.footOfficer && distToPlayer > 60) {
        ctx.despawnFootOfficer(this.footOfficer);
        this.footOfficer = null;
      }

      v.step(dt, ctx.world, ctx.vehicles);
    }
  }

  // foot officer: simple chaser with pistol
  class FootCop {
    constructor(scene, x, z) {
      this.rig = buildPed();
      // repaint as officer
      const uniform = new THREE.MeshLambertMaterial({ color: 0x2a3a5e });
      this.rig.root.children.forEach(ch => { if (ch.material && ch.material.color) ch.material = uniform; });
      this.root = this.rig.root;
      scene.add(this.root);
      this.pos = new THREE.Vector3(x, 0.14, z);
      this.heading = 0;
      this.speed = 0;
      this.hp = 60;
      this.fireT = 1.2;
      this.dead = false;
    }

    update(dt, ctx) {
      if (this.dead) return;
      const p = ctx.player.pos;
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.heading = Math.atan2(dx / d, -(dz / d));
      const want = d > 9 ? 5.4 : (d < 6 ? 0 : 2);
      this.speed = damp(this.speed, want, 6, dt);
      const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
      // building probe
      const px = this.pos.x + fx * 0.9, pz = this.pos.z + fz * 0.9;
      let blocked = false;
      for (const col of ctx.colliders) {
        if (col.h < 0.5) continue;
        if (px > col.x0 - 0.3 && px < col.x1 + 0.3 && pz > col.z0 - 0.3 && pz < col.z1 + 0.3) { blocked = true; break; }
      }
      if (!blocked) { this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt; }
      else this.heading += dt * 5;

      // shoot at player
      this.fireT -= dt;
      if (d < 30 && this.fireT <= 0 && !ctx.player.dead) {
        this.fireT = 1.1 + Math.random() * 0.7;
        ctx.onCopShoot(this);
      }

      this.animPhase = (this.animPhase || 0) + dt * this.speed * 2.2;
      const sw = Math.sin(this.animPhase) * clamp(this.speed / 2, 0.1, 1) * 0.8;
      this.rig.legL.rotation.x = sw; this.rig.legR.rotation.x = -sw;
      this.rig.armL.rotation.x = -sw * 0.7; this.rig.armR.rotation.x = d < 30 ? -Math.PI / 2 : sw * 0.7;
      this.root.position.copy(this.pos);
      this.root.rotation.y = -this.heading;
    }
  }

  // ---------------- Manager ----------------
  class NPCManager {
    constructor(scene, layout, quality) {
      this.scene = scene;
      this.layout = layout;
      this.quality = quality;
      this.peds = [];
      this.traffic = [];
      this.police = [];
      this.footCops = [];
      this.pedBudget = CONFIG.NPC_COUNT_TARGET[quality.npcDensity] || 90;
      this.trafficBudget = CONFIG.TRAFFIC_TARGET[quality.traffic] || 20;
      this.spawnT = 0;
    }

    /** Sidewalk corners for block (i,j). */
    blockCorners(i, j) {
      const B = CONFIG.BLOCK, RW = CONFIG.ROAD_W, SW = CONFIG.SIDEWALK_W;
      const x0 = i * B + RW / 2 + SW / 2, z0 = j * B + RW / 2 + SW / 2;
      const x1 = (i + 1) * B - RW / 2 - SW / 2, z1 = (j + 1) * B - RW / 2 - SW / 2;
      return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
    }

    update(dt, ctx) {
      // --- spawn management (ring around player) ---
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.5;
        this.manageSpawns(ctx);
      }
      // --- despawn far ---
      const pp = ctx.player.pos;
      for (let i = this.peds.length - 1; i >= 0; i--) {
        const p = this.peds[i];
        const d = Math.hypot(p.pos.x - pp.x, p.pos.z - pp.z);
        if (d > 240 || (p.state === 'dead' && p.stateT > 16)) {
          this.scene.remove(p.root); this.peds.splice(i, 1);
        }
      }
      for (let i = this.traffic.length - 1; i >= 0; i--) {
        const t = this.traffic[i];
        if (Math.hypot(t.v.pos.x - pp.x, t.v.pos.z - pp.z) > 300 || t.v.hp <= 0) {
          t.v.dispose(this.scene);
          this.traffic.splice(i, 1);
        }
      }

      // --- update peds (ctx.danger set by crimes) ---
      const pedCtx = {
        colliders: ctx.world.colliders, vehicles: ctx.vehicles,
        player: ctx.player, onPedKilled: ctx.onPedKilled, danger: ctx.danger,
      };
      for (const p of this.peds) p.update(dt, pedCtx);

      // --- update traffic ---
      for (const t of this.traffic) t.update(dt, ctx);

      // --- police ---
      for (const u of this.police) u.update(dt, ctx);
      for (let i = this.footCops.length - 1; i >= 0; i--) {
        const c = this.footCops[i];
        c.update(dt, ctx);
        if (c.dead && (c.deadT = (c.deadT || 0) + dt) > 12) {
          this.scene.remove(c.root); this.footCops.splice(i, 1);
        }
      }
    }

    manageSpawns(ctx) {
      const pp = ctx.player.pos;
      const rng = Math.random;
      // peds
      let liveWalkers = this.peds.filter(p => p.state !== 'dead').length;
      if (liveWalkers < this.pedBudget) {
        const n = Math.min(3, this.pedBudget - liveWalkers);
        for (let k = 0; k < n; k++) {
          const ang = rng() * Math.PI * 2;
          const dist = 90 + rng() * 110;
          const x = pp.x + Math.cos(ang) * dist, z = pp.z + Math.sin(ang) * dist;
          if (x < 10 || z < 10 || x > this.layout.size - 10 || z > this.layout.size - 10) continue;
          if (this.layout.districtAt(x, z) === 'park' && rng() < 0.5) continue;
          const bi = clamp(Math.floor(x / CONFIG.BLOCK), 0, CONFIG.GRID - 1);
          const bj = clamp(Math.floor(z / CONFIG.BLOCK), 0, CONFIG.GRID - 1);
          this.peds.push(new Ped(this.scene, x, z, this.blockCorners(bi, bj)));
        }
      }
      // traffic
      if (this.traffic.length < this.trafficBudget) {
        const ang = rng() * Math.PI * 2;
        const dist = 120 + rng() * 120;
        const x = pp.x + Math.cos(ang) * dist, z = pp.z + Math.sin(ang) * dist;
        // snap to nearest road node edge
        const gi = clamp(Math.round(x / CONFIG.BLOCK), 0, CONFIG.GRID);
        const gj = clamp(Math.round(z / CONFIG.BLOCK), 0, CONFIG.GRID);
        const nodes = this.layout.graph.nodes;
        const nIdx = this.layout.graph.nodeIdx[gi + ',' + gj];
        if (nIdx === undefined) return;
        const node = nodes[nIdx];
        const nbrs = [];
        for (const [a, b] of this.layout.graph.edges) {
          if (a === nIdx) nbrs.push(b); else if (b === nIdx) nbrs.push(a);
        }
        if (!nbrs.length) return;
        const to = nbrs[Math.floor(rng() * nbrs.length)];
        const clsIds = Vehicle.VehicleClasses ? ['compact', 'sedan', 'sedan', 'taxi', 'sports', 'pickup', 'van'] : ['compact', 'sedan'];
        const cls = clsIds[Math.floor(rng() * clsIds.length)];
        const v = new Vehicle(cls, node.x, node.z, 0);
        // face the neighbor
        const tn = nodes[to];
        v.heading = Math.atan2(tn.x - node.x, -(tn.z - node.z));
        v.speed = 8;
        this.scene.add(v.mesh.group);
        this.traffic.push(new TrafficCar(v, nIdx, to));
      }
    }

    panicAt(pos, radius) {
      for (const p of this.peds) {
        if (p.state === 'dead') continue;
        if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < radius) p.panic(pos);
      }
      for (const t of this.traffic) {
        if (Math.hypot(t.v.pos.x - pos.x, t.v.pos.z - pos.z) < radius * 0.8) t.panic = true;
      }
    }

    nearbyWitness(pos, radius) {
      for (const p of this.peds) {
        if (p.state !== 'dead' && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < radius) return true;
      }
      for (const t of this.traffic) {
        if (Math.hypot(t.v.pos.x - pos.x, t.v.pos.z - pos.z) < radius) return true;
      }
      return false;
    }
  }

  return { NPCManager, Ped, TrafficCar, PoliceUnit, FootCop, buildPed };
})();

if (typeof module !== 'undefined') module.exports = { NPC: null };
