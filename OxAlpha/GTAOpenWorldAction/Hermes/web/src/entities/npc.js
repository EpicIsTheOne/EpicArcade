// CHROME HARBOR — pedestrian simulation: sidewalk graph, wandering, panic, casualties.
import * as THREE from 'three';
import { makeHumanoid } from './rig.js';
import { RNG, clamp, wrapAngle, resolveCircleAABB } from '../core/util.js';

// ---------- sidewalk graph ----------
export function buildSidewalkGraph(plan) {
  const pts = new Map();
  const key = (x, z) => (Math.round(x * 10) / 10) + ',' + (Math.round(z * 10) / 10);
  const getPt = (x, z) => {
    const k = key(x, z);
    let p = pts.get(k);
    if (!p) { p = { x, z, edges: [] }; pts.set(k, p); }
    return p;
  };
  const link = (a, b) => {
    const pa = getPt(a[0], a[1]), pb = getPt(b[0], b[1]);
    if (pa === pb) return;
    if (!pa.edges.includes(pb)) pa.edges.push(pb);
    if (!pb.edges.includes(pa)) pb.edges.push(pa);
  };
  // group nodes per road line
  const byV = new Map(), byH = new Map();
  for (const n of plan.nodes) {
    if (!byV.has(n.rv)) byV.set(n.rv, []); byV.get(n.rv).push(n);
    if (!byH.has(n.rh)) byH.set(n.rh, []); byH.get(n.rh).push(n);
  }
  const corner = (n, sv, sh) => [
    n.x + sv * (n.rv.w / 2 - 2.3),
    n.z + sh * (n.rh.w / 2 - 2.3),
  ];
  for (const [rv, list] of byV) {
    list.sort((a, b) => a.z - b.z);
    for (let i = 0; i < list.length - 1; i++) {
      const A = list[i], B = list[i + 1];
      for (const sv of [-1, 1]) link(corner(A, sv, -1), corner(B, sv, -1));
      for (const sv of [-1, 1]) link(corner(A, sv, 1), corner(B, sv, 1));
      // crosswalk across the vertical road at A
      for (const sh of [-1, 1]) link(corner(A, -1, sh), corner(A, 1, sh));
    }
    const lastN = list[list.length - 1];
    for (const sh of [-1, 1]) link(corner(lastN, -1, sh), corner(lastN, 1, sh));
  }
  for (const [rh, list] of byH) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 0; i < list.length - 1; i++) {
      const A = list[i], B = list[i + 1];
      for (const sh of [-1, 1]) link(corner(A, -1, sh), corner(B, -1, sh));
      for (const sh of [-1, 1]) link(corner(A, 1, sh), corner(B, 1, sh));
      for (const sv of [-1, 1]) link(corner(A, sv, -1), corner(A, sv, 1));
    }
    const lastN = list[list.length - 1];
    for (const sv of [-1, 1]) link(corner(lastN, sv, -1), corner(lastN, sv, 1));
  }
  return [...pts.values()].filter(p => p.edges.length > 0);
}

let PED_ID = 1;

export class Ped {
  constructor(ctx, x, z, opts = {}) {
    this.ctx = ctx;
    this.id = PED_ID++;
    this.faction = opts.faction || 'civ';   // civ | gang
    this.rig = makeHumanoid(opts.look || {});
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = Math.random() * Math.PI * 2;
    this.health = this.faction === 'gang' ? 70 : 45;
    this.dead = false;
    this.deadT = 0;
    this.state = 'walk';
    this.stateT = 0;
    this.speed = 1.15 + Math.random() * 0.55;
    this.node = null;        // graph point we're heading to
    this.prevNode = null;
    this.idleT = 0;
    this.fleeFrom = null;
    this.panicT = 0;
    this.combatCd = 0;
    this._stepAcc = 0;
    this.ctx.scene.add(this.rig.group);
    this.rig.group.position.copy(this.pos);
  }

  hearDanger(x, z, strength = 1) {
    if (this.dead) return;
    const d = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (d < 26 * strength && this.faction !== 'gang') {
      this.state = 'flee';
      this.fleeFrom = { x, z };
      this.panicT = 5 + Math.random() * 5;
    }
  }

  takeDamage(dmg, src) {
    if (this.dead) return;
    this.health -= dmg;
    this.hearDanger(src?.from?.pos?.x ?? this.pos.x + Math.random(), this.pos.z, 1.4);
    if (this.health <= 0) this.kill(src);
    else if (this.faction === 'civ') {
      this.state = 'flee'; this.fleeFrom = { x: src?.from?.pos?.x ?? this.pos.x + 1, z: src?.from?.pos?.z ?? this.pos.z };
      this.panicT = 8;
    }
  }

  kill(src) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.rig.st.dead = 1;
    this.ctx.events.emit('pedKilled', { ped: this, src });
    if (this.faction === 'civ' && (!src || !src.police)) {
      this.ctx.events.emit('crime', { type: 'murder', x: this.pos.x, z: this.pos.z, severity: 85 });
      if (Math.random() < 0.5) this.ctx.pickups?.dropCash(this.pos.x, this.pos.z, 8 + Math.floor(Math.random() * 24));
    }
    this.ctx.particles.bloodPuff(this.pos.x, 1.2, this.pos.z);
  }

  update(dt, player) {
    const st = this.rig.st;
    if (this.dead) {
      this.deadT += dt;
      // fall over
      this.rig.group.rotation.x = Math.min(this.deadT * 3.4, Math.PI / 2) * -1;
      this.rig.update(dt);
      if (this.deadT > 8) this.rig.group.position.y -= dt * 0.35; // sink out
      return true;
    }

    st.speed01 = 0; st.moving = false;
    this.stateT += dt;
    this.panicT -= dt;

    switch (this.state) {
      case 'walk': this.doWalk(dt, player); break;
      case 'idle':
        this.idleT -= dt;
        st.lookYaw = Math.sin(performance.now() * 0.0006 + this.id) * 0.6;
        if (this.idleT <= 0) this.state = 'walk';
        break;
      case 'flee': this.doFlee(dt, player); break;
      case 'combat': this.doCombat(dt, player); break;
    }

    // gang hostility
    if (this.faction === 'gang' && this.state === 'walk') {
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      const provoked = this.provoked || player.currentWeapon !== 'fist';
      if ((d < 16 && provoked) || d < 5) { this.state = 'combat'; this.provoked = true; }
    }

    // collisions
    const q = this.ctx._qtmp || (this.ctx._qtmp = []);
    this.ctx.colliders.query(this.pos.x, this.pos.z, 0.8, q);
    for (const b of q) resolveCircleAABB(this.pos, 0.32, b);

    // vehicle impacts
    for (const v of this.ctx.vehicles) {
      if (v.destroyed) continue;
      const sp = v.speed;
      if (sp < 3.5) continue;
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      const rr = Math.max(v.spec.len, v.spec.wid) * 0.44 + 0.3;
      if (dx * dx + dz * dz < rr * rr) {
        const byPlayer = v.driver === 'player';
        this.takeDamage(sp * 9, { from: byPlayer ? this.ctx.player : null, vehicle: true });
        if (!this.dead) { this.state = 'flee'; this.fleeFrom = { x: v.pos.x, z: v.pos.z }; this.panicT = 7; }
        if (byPlayer) this.ctx.events.emit('crime', { type: 'ran_over', x: this.pos.x, z: this.pos.z, severity: this.dead ? 55 : 28 });
        v.vx *= 0.96; v.vz *= 0.96;
        break;
      }
    }

    this.rig.group.position.copy(this.pos);
    this.rig.group.rotation.y = this.heading;
    this.rig.update(dt);
    return false;
  }

  setTarget(node) {
    this.node = node;
  }

  doWalk(dt) {
    const st = this.rig.st;
    if (!this.node) { this.state = 'idle'; this.idleT = 1 + Math.random() * 2; return; }
    const dx = this.node.x - this.pos.x, dz = this.node.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      // arrive: choose next
      this.prevNode = this.node;
      const opts = this.node.edges.filter(e => e !== this.prevNode);
      const pool = opts.length ? opts : [this.prevNode].filter(Boolean);
      if (!pool.length) { this.state = 'idle'; this.idleT = 2; return; }
      // mostly continue, sometimes idle/cross naturally (crossings are just edges)
      const next = pool[Math.floor(Math.random() * pool.length)];
      this.node = next;
      if (Math.random() < 0.06) { this.state = 'idle'; this.idleT = 1.5 + Math.random() * 3.5; return; }
      return;
    }
    const sp = this.speed;
    this.pos.x += dx / d * sp * dt;
    this.pos.z += dz / d * sp * dt;
    const targetH = Math.atan2(dx, dz);
    this.heading += wrapAngle(targetH - this.heading) * Math.min(1, dt * 8);
    st.moving = true; st.speed01 = 0.5;
    this._stepAcc += sp * dt;
    if (this._stepAcc > 1.6) { this._stepAcc = 0; /* soft steps skipped for perf */ }
  }

  doFlee(dt, player) {
    const st = this.rig.st;
    if (this.panicT <= 0) { this.state = 'walk'; this.node = null; return; }
    const fx = this.pos.x - this.fleeFrom.x, fz = this.pos.z - this.fleeFrom.z;
    const d = Math.hypot(fx, fz) || 1;
    const nx = this.pos.x + fx / d * 6, nz = this.pos.z + fz / d * 6;
    this.pos.x += fx / d * 5.2 * dt;
    this.pos.z += fz / d * 5.2 * dt;
    this.heading += wrapAngle(Math.atan2(fx, fz) - this.heading) * Math.min(1, dt * 10);
    st.moving = true; st.run = true; st.speed01 = 1;
    // drop back into graph eventually
    if (Math.random() < dt * 0.4) this.node = null;
  }

  doCombat(dt, player) {
    const st = this.rig.st;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.heading += wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 10);
    st.lookYaw = 0;
    if (!player.dead) {
      this.combatCd -= dt;
      if (d > 22) { this.state = 'walk'; return; }
      if (d > 7) {
        this.pos.x += dx / d * 2.6 * dt;
        this.pos.z += dz / d * 2.6 * dt;
        st.moving = true; st.run = true; st.speed01 = 0.8;
      }
      if (this.combatCd <= 0 && d < 26) {
        this.combatCd = 1.1 + Math.random() * 0.8;
        st.aiming = false;
        this.ctx.weapons.npcShoot({
          from: this, target: player,
          origin: { x: this.pos.x, y: 1.4, z: this.pos.z },
          accuracy: clamp(1 - d / 30, 0.15, 0.75),
          dmg: 9,
        });
      }
    }
  }

  dispose() {
    this.ctx.scene.remove(this.rig.group);
    this.rig.mesh.geometry.dispose();
    this.rig.mesh.material.dispose();
  }
}

// ---------------- manager ----------------
export class PedManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.graph = buildSidewalkGraph(ctx.plan);
    this.peds = [];
    this.spawnTimer = 0;
    this.gridCell = 48;
    // listen to danger events
    ctx.events.on('gunshot', ({ x, z }) => this.alertNear(x, z, 30));
    ctx.events.on('explosion', ({ x, z }) => this.alertNear(x, z, 60));
    ctx.events.on('crash', ({ vehicle }) => {
      if (vehicle.driver === 'player' && vehicle.lastImpact > 8)
        this.alertNear(vehicle.pos.x, vehicle.pos.z, 14);
    });
  }

  alertNear(x, z, radius) {
    for (const p of this.peds) p.hearDanger(x, z, radius > 40 ? 2 : 1);
  }

  nearestToLine(x, z, dx, dz, range, arcCos = 0.5) {
    let best = null, bd = range * range;
    for (const p of this.peds) {
      if (p.dead) continue;
      const ex = p.pos.x - x, ez = p.pos.z - z;
      const d2 = ex * ex + ez * ez;
      if (d2 > bd) continue;
      const d = Math.sqrt(d2) || 0.001;
      const dot = (ex / d) * dx + (ez / d) * dz;
      if (dot > arcCos) { bd = d2; best = p; }
    }
    return best;
  }

  desiredCount() { return Math.round(30 * this.ctx.preset.popScale); }

  update(dt, player) {
    // spawn
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      const alive = this.peds.filter(p => !p.dead).length;
      if (alive < this.desiredCount()) this.trySpawn(player);
    }
    // update + cull
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const gone = p.update(dt, player);
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      const tooFar = d > 190;
      const sunk = p.dead && p.deadT > 11;
      if (tooFar || sunk) {
        p.dispose();
        this.peds.splice(i, 1);
      }
    }
  }

  trySpawn(player) {
    if (!this.graph.length) return;
    for (let tries = 0; tries < 8; tries++) {
      const n = this.graph[Math.floor(Math.random() * this.graph.length)];
      const d = Math.hypot(n.x - player.pos.x, n.z - player.pos.z);
      if (d < 42 || d > 150) continue;
      // avoid spawning right in view center
      this.peds.push(new Ped(this.ctx, n.x, n.z, {}));
      const ped = this.peds[this.peds.length - 1];
      ped.setTarget(n.edges[Math.floor(Math.random() * n.edges.length)]);
      ped.prevNode = n;
      return;
    }
  }

  spawnGang(x, z, count, opts) {
    for (let i = 0; i < count; i++) {
      const g = new Ped(this.ctx, x + (Math.random() - 0.5) * 14, z + (Math.random() - 0.5) * 14, {
        faction: 'gang',
        look: { shirt: '#8e1f1a', pants: '#23262c', hair: '#141414' },
      });
      g.provoked = opts?.provoked ?? false;
      g.node = null;
      g.state = 'walk';
      this.peds.push(g);
    }
  }

  clearFaction(faction) {
    for (const p of this.peds) if (p.faction === faction && !p.dead) p.takeDamage(999, { police: true });
  }
}
