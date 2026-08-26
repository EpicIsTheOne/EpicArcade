// CHROME HARBOR — traffic: road graph lanes, signal obedience, car following, panic.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { RNG, clamp, wrapAngle } from '../core/util.js';

const TRAFFIC_TYPES = ['compact', 'sedan', 'sedan', 'sports', 'muscle', 'suv', 'van', 'pickup', 'taxi'];

// build directed lane links between nodes
export function buildRoadGraph(plan) {
  const byV = new Map(), byH = new Map();
  for (const n of plan.nodes) {
    if (!byV.has(n.rv)) byV.set(n.rv, []); byV.get(n.rv).push(n);
    if (!byH.has(n.rh)) byH.set(n.rh, []); byH.get(n.rh).push(n);
  }
  for (const list of [...byV.values(), ...byH.values()]) {
    const key = list[0].rv ?? list[0].rh;
  }
  // link consecutive nodes on each line
  function chain(list, axis) {
    list.sort((a, b) => axis === 'v' ? a.z - b.z : a.x - b.x);
    for (let i = 0; i < list.length - 1; i++) {
      const A = list[i], B = list[i + 1];
      A.links = A.links || []; B.links = B.links || [];
      A.links.push({ to: B, axis, dir: 1 });
      B.links.push({ to: A, axis, dir: -1 });
    }
  }
  for (const [rv, list] of byV) chain(list, 'v');
  for (const [rh, list] of byH) chain(list, 'h');
  return plan.nodes;
}

export class TrafficManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.nodes = buildRoadGraph(ctx.plan);
    this.cars = [];        // moving AI vehicles
    this.parked = [];      // static enterable vehicles near player
    this.spawnTimer = 0;
    this.parkTimer = 0;
    this.rng = new RNG('traffic' + ctx.plan.seed);
    this.elapsed = 0;

    ctx.events.on('gunshot', ({ x, z }) => this.panicNear(x, z));
    ctx.events.on('explosion', ({ x, z }) => this.panicNear(x, z));
  }

  panicNear(x, z) {
    for (const c of this.cars) {
      if (Math.hypot(c.pos.x - x, c.pos.z - z) < 26) { c.ai.panic = 6; c.input.throttle = 1; }
    }
  }

  desiredCount() { return Math.round(13 * this.ctx.preset.popScale) + 2; }

  update(dt, player) {
    this.elapsed += dt;
    const city = this.ctx.city;

    // ---- spawn moving traffic ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.5;
      if (this.cars.length < this.desiredCount()) this.trySpawnCar(player);
    }

    // ---- parked cars ----
    this.parkTimer -= dt;
    if (this.parkTimer <= 0) {
      this.parkTimer = 0.8;
      this.refreshParked(player);
    }

    // ---- drive ----
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v.destroyed) { this.cars.splice(i, 1); continue; }
      const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
      if (d > 320 || (v.ai.abandoned && d > 90)) {
        // despawn far cars unless player stole them into motion... stolen ones become driverless wrecks handled elsewhere
        if (!v.driver) { v.dispose(); this.cars.splice(i, 1); continue; }
      }
      this.driveAI(v, dt);
    }

    // parked cars need visual updates only when lights state changes; physics idle skip:
    // they run full update anyway (cheap while stationary)
  }

  trySpawnCar(player) {
    for (let tries = 0; tries < 10; tries++) {
      const node = this.nodes[Math.floor(this.rng.next() * this.nodes.length)];
      const d = Math.hypot(node.x - player.pos.x, node.z - player.pos.z);
      if (d < 70 || d > 240) continue;
      const link = node.links?.[Math.floor(this.rng.next() * node.links.length)];
      if (!link) continue;
      // spawn between nodes on the correct lane side
      const dx = Math.abs(link.to.x - node.x), dz = Math.abs(link.to.z - node.z);
      const len = Math.hypot(dx, dz);
      const t = 0.3 + this.rng.next() * 0.4;
      let px = node.x + (link.to.x - node.x) * t;
      let pz = node.z + (link.to.z - node.z) * t;
      const ux = (link.to.x - node.x) / len, uz = (link.to.z - node.z) / len;
      const rx = -uz * link.dir, rz = ux * link.dir; // right-hand vector
      const road = link.axis === 'v' ? link.to.rv : link.to.rh;
      const laneOff = road.w / 4 + 0.4;
      px += rx * laneOff; pz += rz * laneOff;
      const heading = Math.atan2(ux * link.dir, uz * link.dir);
      // don't spawn inside another car
      let blocked = false;
      for (const o of this.ctx.vehicles) {
        if ((o.pos.x - px) ** 2 + (o.pos.z - pz) ** 2 < 36) { blocked = true; break; }
      }
      if (blocked) continue;
      const typeName = TRAFFIC_TYPES[Math.floor(this.rng.next() * TRAFFIC_TYPES.length)];
      const v = new Vehicle(this.ctx, typeName, px, pz, heading, { rng: this.rng, noPark: true });
      v.ai = {
        mode: 'traffic', from: node, link, panic: 0, waitT: 0,
        cruise: (road.ave ? 0.62 : 0.5) + this.rng.next() * 0.16,
      };
      this.cars.push(v);
      return;
    }
  }

  refreshParked(player) {
    // cull far
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const p = this.parked[i];
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if ((d > 220 && !p.driver && !p.destroyed) || (p.destroyed && d > 260)) {
        p.dispose();
        this.parked.splice(i, 1);
      }
    }
    const want = Math.round(14 * this.ctx.preset.popScale);
    if (this.parked.filter(p => !p.destroyed).length >= want) return;
    const spots = this.ctx.plan.parkedSpots;
    for (let tries = 0; tries < 12; tries++) {
      const s = spots[Math.floor(Math.random() * spots.length)];
      const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
      if (d < 34 || d > 170) continue;
      let occupied = false;
      for (const o of this.ctx.vehicles) {
        if ((o.pos.x - s.x) ** 2 + (o.pos.z - s.z) ** 2 < 20) { occupied = true; break; }
      }
      if (occupied) continue;
      const typeName = TRAFFIC_TYPES[Math.floor(Math.random() * TRAFFIC_TYPES.length)];
      const v = new Vehicle(this.ctx, typeName, s.x, s.z, s.ang, {});
      this.parked.push(v);
      return;
    }
  }

  driveAI(v, dt) {
    const ai = v.ai;
    ai.panic -= dt;
    const player = this.ctx.player;
    const targetSpeed = v.spec.top * ai.cruise * (ai.panic > 0 ? 1.35 : 1);

    // --- obstacle ahead? ---
    let brakeFor = null, brakeDist = 1e9;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    for (const o of this.ctx.vehicles) {
      if (o === v || o.destroyed && o.speed < 0.5) continue;
      const ex = o.pos.x - v.pos.x, ez = o.pos.z - v.pos.z;
      const ahead = ex * fx + ez * fz;
      if (ahead < 0.5 || ahead > 15) continue;
      const lat = Math.abs(ex * fz - ez * fx);
      if (lat < (v.spec.wid + o.spec.wid) * 0.52 && ahead < brakeDist) {
        // ignore oncoming lanes far apart laterally
        brakeDist = ahead; brakeFor = o;
      }
    }
    // player character in front?
    if (!player.vehicle) {
      const ex = player.pos.x - v.pos.x, ez = player.pos.z - v.pos.z;
      const ahead = ex * fx + ez * fz;
      const lat = Math.abs(ex * fz - ez * fx);
      if (ahead > 0 && ahead < 12 && lat < 1.9 && ahead < brakeDist) { brakeDist = ahead; brakeFor = player; }
    }

    // --- signals ---
    let stopLine = null;
    const nextNode = ai.link?.to;
    if (nextNode && ai.panic <= 0) {
      const ndx = nextNode.x - v.pos.x, ndz = nextNode.z - v.pos.z;
      const distTo = ndx * fx + ndz * fz;
      const stopAt = Math.max(nextNode.rv.w, nextNode.rh.w) / 2 + 4.5;
      if (distTo > -2 && distTo < 40) {
        const phase = this.ctx.city.signalPhaseFor(nextNode, ai.link.axis === 'v', this.elapsed);
        if (phase !== 'green') {
          stopLine = distTo - stopAt;
          if (phase === 'yellow' && distTo < stopAt + 6 && v.forwardSpeed > 8) stopLine = null; // run it
        }
      }
    }

    // --- throttle decision ---
    let wantSpeed = targetSpeed;
    if (brakeFor) wantSpeed = Math.min(wantSpeed, Math.max(0, (brakeDist - 5.2) * 1.4));
    if (stopLine !== null) wantSpeed = Math.min(wantSpeed, Math.max(0, stopLine * 1.25));
    if (ai.waitT > 0) { ai.waitT -= dt; wantSpeed = 0; }

    const fs = v.forwardSpeed;
    if (fs < wantSpeed - 0.5) v.input.throttle = clamp((wantSpeed - fs) * 0.4, 0, 1);
    else if (fs > wantSpeed + 1) v.input.throttle = clamp((wantSpeed - fs) * 0.3, -1, 0);
    else v.input.throttle = 0;

    // horn when stuck behind something
    if ((brakeFor || stopLine !== null) && fs < 0.6) {
      ai.honkT = (ai.honkT || 0) + dt;
      if (ai.honkT > 2.2) { ai.honkT = 0; if (Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) < 60) this.ctx.audio?.horn(true), setTimeout(() => this.ctx.audio?.horn(false), 350); }
    } else ai.honkT = 0;

    // --- steering: pure pursuit toward lane target ---
    if (ai.link) {
      const { to, axis, dir } = ai.link;
      const road = axis === 'v' ? to.rv : to.rh;
      const laneOff = road.w / 4 + 0.4;
      const tx = to.x, tz = to.z;
      // aim point: node center offset into our lane
      const ax = tx, az = tz;
      const gx = ax - v.pos.x, gz = az - v.pos.z;
      const desiredH = Math.atan2(gx, gz);
      let diff = wrapAngle(desiredH - v.heading);
      // lane keep: lateral offset error relative to lane center line through `to`
      const rx = -Math.cos(v.heading), rz = Math.sin(v.heading);
      const latErr = (v.pos.x - (ax - fx * (gx * fx + gz * fz))) * rx + (v.pos.z - (az - fz * (gx * fx + gz * fz))) * rz;
      v.input.steer = clamp(diff * 2.2 + latErr * 0.05, -1, 1);

      // arrival -> pick next link
      if (gx * gx + gz * gz < 64) {
        const opts = to.links.filter(l => !(l.axis === ai.link.axis && l.dir === -ai.link.dir));
        let nextLink;
        if (!opts.length) nextLink = to.links.find(l => l.axis === ai.link.axis && l.dir === -ai.link.dir);
        else {
          // prefer straight
          const straight = opts.find(l => l.axis === ai.link.axis && l.dir === ai.link.dir);
          nextLink = (straight && this.rng.next() < 0.62) ? straight : opts[Math.floor(this.rng.next() * opts.length)];
        }
        if (nextLink) ai.link = nextLink;
        else v.ai.mode = 'lost';
      }
    } else if (ai.mode === 'lost' || !ai.link) {
      // wander back onto any road: head to nearest node
      let best = null, bd = 1e9;
      for (const n of this.nodes) {
        const d2 = (n.x - v.pos.x) ** 2 + (n.z - v.pos.z) ** 2;
        if (d2 < bd && n.links?.length) { bd = d2; best = n; }
      }
      if (best) {
        const link = best.links[0];
        ai.link = link;
      }
      v.input.steer *= 0.9;
    }
  }

  // steal handling: when player enters an AI car it leaves management naturally via driver check
}
