// CHROME HARBOR — wanted levels, pursuit AI, roadblocks, helicopter, busted/evade loops.
import * as THREE from 'three';
import { Vehicle } from '../entities/vehicle.js';
import { makeHumanoid } from '../entities/rig.js';
import { clamp, wrapAngle, RNG } from '../core/util.js';

const STAR_THRESHOLDS = [22, 85, 190, 330, 500];

// ---------- cop on foot ----------
class CopPed {
  constructor(ctx, x, z) {
    this.ctx = ctx;
    this.rig = makeHumanoid({ shirt: '#26364f', pants: '#1d2735', skin: ['#e8b48a', '#d9a06b', '#b97f52'][Math.floor(Math.random() * 3)], hair: '#20242c' });
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = 0;
    this.health = 65;
    this.dead = false;
    this.deadT = 0;
    this.shootCd = 1 + Math.random();
    this.arrestT = 0;
    this.deployedFrom = null;
    this.rig.attachGun('pistol');
    ctx.scene.add(this.rig.group);
  }
  takeDamage(dmg, src) {
    if (this.dead) return;
    this.health -= dmg;
    if (this.health <= 0) {
      this.dead = true;
      this.rig.st.dead = 1;
      this.ctx.events.emit('copKilled', { cop: this });
      this.ctx.events.emit('crime', { type: 'cop_killer', x: this.pos.x, z: this.pos.z, severity: 130 });
    }
  }
  kill(src) { this.takeDamage(999, src); }
  update(dt, player, police) {
    const st = this.rig.st;
    if (this.dead) {
      this.deadT += dt;
      this.rig.group.rotation.x = Math.min(this.deadT * 3.4, Math.PI / 2) * -1;
      this.rig.update(dt);
      return;
    }
    st.speed01 = 0; st.moving = false;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;

    const los = police.hasLOS(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    this.heading += wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 10);

    if (!player.dead) {
      // arrest check
      if (!player.vehicle && d < 2.4 && player.grounded && los) {
        this.arrestT += dt;
        if (this.arrestT > 0.9 && police.stars > 0) police.bustPlayer();
      } else this.arrestT = 0;

      // shoot
      this.shootCd -= dt;
      if (los && d < 30 && this.shootCd <= 0 && police.stars >= 2) {
        this.shootCd = 1.15 + Math.random() * 0.8;
        st.punchT = 0;
        this.ctx.weapons.npcShoot({
          from: { pos: this.pos, takeDamage: () => {} },
          target: player,
          origin: { x: this.pos.x, y: 1.45, z: this.pos.z },
          accuracy: clamp(1.05 - d / 34, 0.18, 0.72),
          dmg: 7 + Math.random() * 5,
          cop: true,
        });
      }

      // chase on foot
      const stopAt = police.stars >= 2 ? 9 : 2.6;
      if (d > stopAt) {
        const sp = 6.3;
        this.pos.x += dx / d * sp * dt;
        this.pos.z += dz / d * sp * dt;
        st.moving = true; st.run = true; st.speed01 = 0.95;
        st.armed = 'pistol';
      } else {
        st.armed = 'pistol';
        st.aiming = true;
      }
      // building push-out
      const q = this.ctx._qtmp || (this.ctx._qtmp = []);
      this.ctx.colliders.query(this.pos.x, this.pos.z, 0.8, q);
      for (const b of q) {
        const cx = clamp(this.pos.x, b.x0, b.x1), cz = clamp(this.pos.z, b.z0, b.z1);
        const ex = this.pos.x - cx, ez = this.pos.z - cz;
        const dd = Math.hypot(ex, ez);
        if (dd < 0.35) {
          if (dd > 0.001) { this.pos.x += ex / dd * (0.35 - dd); this.pos.z += ez / dd * (0.35 - dd); }
          else this.pos.x += 0.4;
        }
      }
    }
    st.lookYaw = clamp(wrapAngle(Math.atan2(dx, dz) - this.heading), -1, 1) * 0.5;
    this.rig.group.position.copy(this.pos);
    this.rig.group.rotation.y = this.heading;
    this.rig.update(dt);
  }
  dispose() {
    this.ctx.scene.remove(this.rig.group);
    this.rig.mesh.geometry.dispose(); this.rig.mesh.material.dispose();
  }
}

export class Police {
  constructor(ctx) {
    this.ctx = ctx;
    this.heat = 0;
    this.stars = 0;
    this.cars = [];
    this.cops = [];
    this.roadblock = null;
    this.rbTimer = 12;
    this.lastKnown = null;
    this.seen = false;
    this.evadeT = 0;
    this.evadeNeeded = 12;
    this.heli = null;
    this._losT = 0;
    this._spawnT = 0;
    this.musicLevel = 0;

    ctx.events.on('crime', (e) => this.reportCrime(e));
    ctx.events.on('explosion', ({ x, z }) => {
      this.reportCrime({ type: 'explosion', x, z, severity: 60 });
    });
  }

  reportCrime({ type, x, z, severity }) {
    if (this.ctx.player.dead) return;
    // witness model: scale by nearest witness proximity
    let witnessDist = 999;
    for (const p of this.ctx.npcs.peds) {
      if (p.dead) continue;
      witnessDist = Math.min(witnessDist, Math.hypot(p.pos.x - x, p.pos.z - z));
    }
    for (const u of this.cars) witnessDist = Math.min(witnessDist, Math.hypot(u.pos.x - x, u.pos.z - z));
    let factor = clamp(1.25 - witnessDist / 55, 0, 1);
    if (type === 'cop_killer' || type === 'ram_police') factor = 1;   // cops know
    if (factor <= 0.02 && Math.random() < 0.75) return;               // got away with it
    this.addHeat(severity * factor);
    this.ctx.events.emit('crimeWitnessed', { type, severity: severity * factor });
  }

  addHeat(amount) {
    this.heat += amount;
    this.updateStars();
    if (this.stars > 0) {
      this.evadeT = 0;
      this.lastKnown = { x: this.ctx.player.pos.x, z: this.ctx.player.pos.z };
    }
  }

  updateStars() {
    let s = 0;
    for (let i = 0; i < STAR_THRESHOLDS.length; i++) if (this.heat >= STAR_THRESHOLDS[i]) s = i + 1;
    if (s !== this.stars) {
      const prev = this.stars;
      this.stars = s;
      if (s > prev && s > 0) {
        this.ctx.hud.banner(s >= 4 ? `WANTED — ${s} STARS` : `WANTED LEVEL ${s}`,
          s >= 4 ? 'Air support inbound. Run.' : 'Port Vela PD is on you.');
        this.ctx.audio?.stingBad();
      }
      this.ctx.hud.updateStars(s);
    }
  }

  clearWanted() {
    this.heat = 0;
    this.stars = 0;
    this.evadeT = 0;
    this.ctx.hud.updateStars(0);
  }

  respray(veh) {
    const p = this.ctx.player;
    if (p.money < 400) return;
    p.addMoney(-400);
    const tints = [[1.05, .9, .8], [.8, .9, 1.05], [1.08, 1.02, .78], [.82, 1.05, .88], [1, .82, .95]];
    const t = tints[Math.floor(Math.random() * tints.length)];
    veh.bodyMat.color.setRGB(t[0], t[1], t[2]);
    veh.recoloredRecently = true;
    setTimeout(() => veh.recoloredRecently = false, 30000);
    this.clearWanted();
    this.ctx.hud.banner('RESPRAYED', 'Heat cleared. Nice new shine.');
    this.ctx.audio?.jingleWin();
  }

  bustPlayer() {
    if (this.ctx.menus.state !== 'playing') return;
    this.busting = true;
    this.clearWanted();
    this.ctx.menus.showBusted();
  }

  copsWithin(x, z, r) {
    for (const c of this.cars) if (Math.hypot(c.pos.x - x, c.pos.z - z) < r) return true;
    for (const c of this.cops) if (!c.dead && Math.hypot(c.pos.x - x, c.pos.z - z) < r) return true;
    return false;
  }

  nearestCopToLine(x, z, dx, dz, range) {
    let best = null, bd = range * range;
    for (const c of this.cops) {
      if (c.dead) continue;
      const ex = c.pos.x - x, ez = c.pos.z - z;
      const d2 = ex * ex + ez * ez;
      if (d2 > bd) continue;
      if ((ex / Math.sqrt(d2 || 1)) * dx + (ez / Math.sqrt(d2 || 1)) * dz > 0.4) { bd = d2; best = c; }
    }
    return best;
  }

  hasLOS(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1) return true;
    if (len > 130) return false;
    const nx = dx / len, nz = dz / len;
    const q = this.ctx._qtmp2 || (this.ctx._qtmp2 = []);
    const step = 14;
    for (let t = step; t < len; t += step) {
      const px = ax + nx * t, pz = az + nz * t;
      this.ctx.colliders.query(px, pz, step / 2 + 2, q);
      // precise slab test against each box
      for (const b of q) {
        let tmin = -Infinity, tmax = Infinity;
        if (Math.abs(nx) < 1e-9) { if (ax < b.x0 || ax > b.x1) continue; }
        else {
          let t1 = (b.x0 - ax) / nx, t2 = (b.x1 - ax) / nx;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (Math.abs(nz) < 1e-9) { if (az < b.z0 || az > b.z1) continue; }
        else {
          let t1 = (b.z0 - az) / nz, t2 = (b.z1 - az) / nz;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (tmax >= Math.max(tmin, 0) && tmin < len && b.kind !== 'tree') return false;
      }
    }
    return true;
  }

  // ---------------- main update ----------------
  update(dt, player) {
    this._spawnT -= dt;
    this._losT -= dt;

    if (this.stars > 0 && !player.dead) {
      // visibility check (throttled)
      if (this._losT <= 0) {
        this._losT = 0.28;
        let seen = false;
        for (const c of this.cars) {
          if (Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 95 &&
              this.hasLOS(c.pos.x, c.pos.z, player.pos.x, player.pos.z)) { seen = true; break; }
        }
        if (!seen) for (const c of this.cops) {
          if (!c.dead && Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 70 &&
              this.hasLOS(c.pos.x, c.pos.z, player.pos.x, player.pos.z)) { seen = true; break; }
        }
        if (!seen && this.heli && Math.hypot(this.heli.group.position.x - player.pos.x, this.heli.group.position.z - player.pos.z) < 60) seen = true;
        if (seen) {
          this.lastKnown = { x: player.pos.x, z: player.pos.z };
          this.evadeT = 0;
        }
      }
      // evasion progress
      const needed = 9 + this.stars * 3.5;
      if (!this.seenRecently()) {
        this.evadeT += dt;
        if (this.evadeT >= needed) this.evaded();
      }
    }

    // maintain pursuit forces
    if (this.stars > 0 && !player.dead) this.maintainForces(player);

    // drive cop cars
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v.destroyed) { this.cars.splice(i, 1); continue; }
      if (this.stars === 0) {
        v.sirenOn = false;
        // leave the scene
        v.input.throttle = 0.4;
        this.driveAway(v, dt);
        const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
        if (d > 200) { v.dispose(); this.cars.splice(i, 1); }
        continue;
      }
      this.drivePursuit(v, player, dt);
    }

    // cop peds
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      c.update(dt, player, this);
      const far = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) > 170;
      const gone = c.dead && c.deadT > 10;
      if ((far && this.stars === 0) || gone) { c.dispose(); this.cops.splice(i, 1); }
    }

    // roadblock
    if (this.stars >= 3) {
      this.rbTimer -= dt;
      if (this.rbTimer <= 0 && player.vehicle && player.vehicle.spec.len < 8) {
        this.rbTimer = 24;
        this.spawnRoadblock(player);
      }
    }

    // heli
    if (this.stars >= 4) { if (!this.heli) this.spawnHeli(player); }
    else if (this.heli) this.removeHeli();
    if (this.heli) this.updateHeli(dt, player);

    // audio: siren by nearest car, heli chop
    let nd = 1e9;
    for (const c of this.cars) nd = Math.min(nd, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z));
    this.ctx.audio?.siren(this.stars > 0 ? nd : 1e9);
    this.ctx.audio?.helicopter(this.heli ? Math.hypot(this.heli.group.position.x - player.pos.x, this.heli.group.position.z - player.pos.z) : 1e9);
  }

  seenRecently() {
    return this.evadeT === 0 && this.lastKnown &&
      Math.hypot(this.lastKnown.x - this.ctx.player.pos.x, this.lastKnown.z - this.ctx.player.pos.z) < 40 &&
      this.anyUnitNear(50);
  }
  anyUnitNear(r) {
    for (const c of this.cars) if (Math.hypot(c.pos.x - this.ctx.player.pos.x, c.pos.z - this.ctx.player.pos.z) < r) return true;
    return false;
  }

  evaded() {
    this.clearWanted();
    this.ctx.hud.banner('EVADED', 'You lost them.');
    this.ctx.audio?.jingleWin();
  }

  // ---------------- forces ----------------
  maintainForces(player) {
    const wantCars = this.stars === 1 ? 2 : this.stars === 2 ? 3 : this.stars === 3 ? 4 : this.stars === 4 ? 5 : 6;
    if (this._spawnT <= 0 && this.cars.length < wantCars) {
      this._spawnT = 2.2;
      this.spawnCopCar(player);
    }
    const wantCops = this.stars * 2;
    if (this.cops.filter(c => !c.dead).length < wantCops && this._spawnT <= 0) {
      // drop cops near road edges around player's lastKnown
      const lk = this.lastKnown || player.pos;
      const ang = Math.random() * Math.PI * 2;
      const r = 46 + Math.random() * 30;
      const x = clamp(lk.x + Math.cos(ang) * r, -800, 800), z = clamp(lk.z + Math.sin(ang) * r, -760, 600);
      if (this.hasLOS(x, z, x + 1, z + 1)) this.addCop(new CopPed(this.ctx, x, z));
    }
  }

  addCop(c) { this.cops.push(c); }

  spawnCopCar(player) {
    const ang = Math.random() * Math.PI * 2;
    const r = 110 + Math.random() * 60;
    const x = clamp(player.pos.x + Math.cos(ang) * r, -800, 800);
    const z = clamp(player.pos.z + Math.sin(ang) * r, -760, 596);
    const road = this.ctx.plan.roadAt(x, z, 6);
    const heading = road ? (road.axis === 'v' ? (player.pos.z > z ? 0 : Math.PI) : (player.pos.x > x ? Math.PI / 2 : -Math.PI / 2)) : Math.atan2(player.pos.x - x, player.pos.z - z);
    const v = new Vehicle(this.ctx, 'police', x, z, heading, { isPolice: true, paint: '#e8eaee', noPark: true });
    v.ai = { mode: 'police' };
    v.sirenOn = true;
    v.setLights(true);
    this.cars.push(v);
    return v;
  }

  drivePursuit(v, player, dt) {
    v.sirenOn = true;
    const predict = 0.7;
    let tx = player.pos.x, tz = player.pos.z;
    if (player.vehicle) { tx += player.vehicle.vx * predict; tz += player.vehicle.vz * predict; }
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const d = Math.hypot(dx, dz);
    const desiredH = Math.atan2(dx, dz);
    const diff = wrapAngle(desiredH - v.heading);
    v.input.steer = clamp(diff * 2.0, -1, 1);
    const ram = this.stars >= 3;
    const closeDeploy = d < 17 && this.stars <= 2;
    v.input.throttle = closeDeploy ? (v.forwardSpeed > 2 ? -0.6 : 0) : (ram || d > 13 ? 1 : 0.35);
    v.input.handbrake = Math.abs(diff) > 2.2 && v.forwardSpeed > 12;

    // building whisker avoidance
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const q = this.ctx._qtmp2 || (this.ctx._qtmp2 = []);
    for (const side of [-0.55, 0.55]) {
      const wx = Math.sin(v.heading + side), wz = Math.cos(v.heading + side);
      this.ctx.colliders.query(v.pos.x + wx * 9, v.pos.z + wz * 9, 2.4, q);
      let blocked = false;
      for (const b of q) {
        if (b.h < 1.5) continue;
        blocked = true; break;
      }
      if (blocked) {
        v.input.steer = clamp(v.input.steer - Math.sign(side) * 0.9, -1, 1);
        if (v.forwardSpeed > 16) v.input.throttle = 0.25;
      }
    }

    // deploy officers
    if (closeDeploy && v.forwardSpeed < 2.5 && !v.deployed && this.cops.filter(c => !c.dead).length < 6) {
      v.deployed = true;
      const door = v.doorPosition(1);
      this.addCop(new CopPed(this.ctx, door.x, door.z));
      if (this.stars >= 2) {
        const door2 = v.doorPosition(-1);
        this.addCop(new CopPed(this.ctx, door2.x, door2.z));
      }
    }
    if (d > 40) v.deployed = false;
  }

  driveAway(v, dt) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    v.input.steer *= 0.95;
    void fx; void fz; void dt;
  }

  spawnRoadblock(player) {
    const v = player.vehicle;
    const dirX = Math.sin(v.heading), dirZ = Math.cos(v.heading);
    let bx = v.pos.x + dirX * 150, bz = v.pos.z + dirZ * 150;
    // snap to nearest road
    const road = this.ctx.plan.roadAt(bx, bz, 14);
    if (!road) return;
    if (road.axis === 'v') bx = road.r.c; else bz = road.r.c;
    const across = road.axis === 'v' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    for (const off of [-3.2, 3.2]) {
      const cx = bx + across.x * off, cz = bz + across.z * off;
      const cruiser = new Vehicle(this.ctx, 'police', cx, cz,
        road.axis === 'v' ? Math.PI / 2 : 0, { isPolice: true, paint: '#e8eaee' });
      cruiser.sirenOn = true; cruiser.setLights(true);
      this.cars.push(cruiser);
      this.addCop(new CopPed(this.ctx, cx - across.x * 4, cz - across.z * 4));
    }
    this.ctx.hud.toastPrompt('Roadblock ahead!');
  }

  // ---------------- helicopter ----------------
  spawnHeli(player) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#232a33', roughness: .5, metalness: .5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 5.4), bodyMat);
    g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#10151c', roughness: .2, metalness: .8 }));
    nose.position.set(0, 0.1, 2.9); g.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), bodyMat);
    tail.position.set(0, 0.3, -4.4); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.4), bodyMat);
    rotor.position.y = 1.25; g.add(rotor);
    const spot = new THREE.SpotLight('#eaf4ff', 900, 140, 0.32, 0.45, 1.4);
    spot.position.set(0, -0.8, 0);
    g.add(spot, spot.target);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshStandardMaterial({ emissive: '#ff3040', emissiveIntensity: 4, color: '#000' }));
    beacon.position.set(0, -1.1, 0);
    g.add(beacon);
    g.position.set(player.pos.x + 60, 46, player.pos.z - 40);
    this.ctx.scene.add(g);
    this.heli = { group: g, rotor, spot, shootCd: 3, phase: 0 };
    this.ctx.hud.banner('AIR UNIT DEPLOYED', 'Keep moving — that spotlight hurts.');
  }
  removeHeli() {
    if (!this.heli) return;
    this.ctx.scene.remove(this.heli.group);
    this.heli = null;
  }
  updateHeli(dt, player) {
    const h = this.heli;
    h.phase += dt;
    h.rotor.rotation.y += dt * 26;
    const tx = player.pos.x + Math.sin(h.phase * 0.5) * 26;
    const tz = player.pos.z + Math.cos(h.phase * 0.42) * 26;
    h.group.position.x += (tx - h.group.position.x) * Math.min(1, dt * 0.7);
    h.group.position.z += (tz - h.group.position.z) * Math.min(1, dt * 0.7);
    h.group.position.y += (46 + Math.sin(h.phase) * 2 - h.group.position.y) * Math.min(1, dt);
    h.group.rotation.y = Math.atan2(tx - h.group.position.x, tz - h.group.position.z);
    h.spot.target.position.set(player.pos.x, 0, player.pos.z);
    h.spot.target.updateMatrixWorld();
    // suppressive fire at 5 stars
    if (this.stars >= 5) {
      h.shootCd -= dt;
      if (h.shootCd <= 0) {
        h.shootCd = 2.6;
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            if (!this.heli || this.stars < 5) return;
            this.ctx.weapons.npcShoot({
              from: { pos: h.group.position, takeDamage: () => {} },
              target: player,
              origin: { x: h.group.position.x, y: 44, z: h.group.position.z },
              accuracy: 0.5, dmg: 6, cop: true,
            });
          }, i * 140);
        }
      }
    }
  }
}
