// CHROME HARBOR — vehicles: arcade-sim physics, procedural bodies, damage, explosions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, RNG } from '../core/util.js';

const UP = new THREE.Vector3(0, 1, 0);

export const VEHICLE_TYPES = {
  compact: { name: 'Pika', len: 3.9, wid: 1.76, h: 1.44, mass: 1.0, accel: 9.5, top: 34, grip: 8.5, steer: 0.62, hp: 80, seats: [[-0.36, 0.15], [0.36, 0.15]] },
  sedan:   { name: 'Corsair', len: 4.65, wid: 1.86, h: 1.42, mass: 1.15, accel: 8.5, top: 37, grip: 8, steer: 0.58, hp: 100 },
  sports:  { name: 'Vantura GT', len: 4.35, wid: 1.95, h: 1.12, mass: 1.05, accel: 14.5, top: 54, grip: 10.5, steer: 0.68, hp: 90 },
  muscle:  { name: 'Brawler 71', len: 4.9, wid: 1.96, h: 1.3, mass: 1.3, accel: 13, top: 48, grip: 6.4, steer: 0.56, hp: 115 },
  suv:     { name: 'Trailblaze', len: 4.85, wid: 2.0, h: 1.86, mass: 1.45, accel: 7.5, top: 35, grip: 7, steer: 0.52, hp: 130 },
  van:     { name: 'Haulmaster', len: 5.3, wid: 2.08, h: 2.15, mass: 1.6, accel: 6.5, top: 31, grip: 6.5, steer: 0.46, hp: 140 },
  pickup:  { name: 'Longhorn', len: 5.35, wid: 2.0, h: 1.82, mass: 1.5, accel: 8, top: 36, grip: 7, steer: 0.5, hp: 125 },
  taxi:    { name: 'City Cab', len: 4.65, wid: 1.86, h: 1.46, mass: 1.15, accel: 9, top: 38, grip: 8, steer: 0.58, hp: 100 },
  police:  { name: 'PVPD Interceptor', len: 4.85, wid: 1.92, h: 1.44, mass: 1.25, accel: 11.5, top: 47, grip: 9.2, steer: 0.6, hp: 120 },
  bus:     { name: 'Metroliner', len: 10.8, wid: 2.5, h: 3.05, mass: 3.2, accel: 4.5, top: 25, grip: 6, steer: 0.38, hp: 260 },
};

const PAINTS = ['#c23b2e', '#3c6ab3', '#d9dfe6', '#23262c', '#5a6a7a', '#3ca35a', '#d9a53c', '#8858b3', '#b3701e', '#e8e2d2', '#4fa3a8'];

// ---------- body factory ----------
let GLASS_MAT = null, WHEEL_MAT = null, TRIM_C;
function ensureSharedMats() {
  if (!GLASS_MAT) {
    GLASS_MAT = new THREE.MeshStandardMaterial({ color: '#10151c', roughness: 0.12, metalness: 0.85 });
    WHEEL_MAT = new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.85 });
    TRIM_C = new THREE.Color('#17191d');
  }
}

function coloredBox(sx, sy, sz, x, y, z, c, ry = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  paintGeo(g, c);
  return g;
}
function paintGeo(g, hex) {
  const n = g.attributes.position.count;
  const col = new THREE.Color(hex);
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function buildBody(typeName, paintHex) {
  ensureSharedMats();
  const t = VEHICLE_TYPES[typeName];
  const L = t.len, W = t.wid, H = t.h;
  const parts = [];
  const ride = H * 0.28;                 // chassis bottom height
  const bodyTop = ride + H * 0.34;

  // lower hull
  parts.push(coloredBox(W, ride + 0.18, L, 0, ride + 0.09, 0, paintHex));
  // hood + trunk profile by type
  const cabLen = L * ({ sports: 0.42, compact: 0.5, van: 0.72, bus: 0.86, pickup: 0.34, suv: 0.62, police: 0.46, taxi: 0.46, sedan: 0.46, muscle: 0.4 }[typeName]);
  const cabFront = -L * 0.12;            // cabin starts (negative z = front? choose +z = front)
  const cabStart = L * 0.06, cabEnd = cabStart + cabLen;

  if (typeName === 'bus') {
    parts.push(coloredBox(W * 0.98, H * 0.62, L * 0.96, 0, ride + H * 0.42, 0, '#e8eaee'));
    parts.push(coloredBox(W * 0.99, 0.16, L * 0.96, 0, ride + H * 0.30, 0, '#3aa0c8'));
  } else {
    // hood (front = +z)
    const hoodL = L / 2 - cabEnd;
    if (hoodL > 0.3 && typeName !== 'van') parts.push(coloredBox(W * 0.94, H * 0.16, hoodL, 0, bodyTop - 0.02, (cabEnd + L / 2) / 2, paintHex));
    else if (hoodL > 0.3) parts.push(coloredBox(W * 0.94, H * 0.16, hoodL, 0, bodyTop - 0.02, (cabEnd + L / 2) / 2, paintHex));
    // cabin
    const cabH = typeName === 'sports' ? H * 0.26 : H * 0.4;
    parts.push(coloredBox(W * 0.9, cabH, cabLen * 0.94, 0, bodyTop + cabH / 2 - 0.04, cabStart + cabLen / 2, paintHex));
    // trunk
    const trL = cabStart + L / 2;
    if (trL > 0.4 && typeName !== 'pickup') parts.push(coloredBox(W * 0.92, H * 0.14, trL, 0, bodyTop - 0.03, -(cabStart / 2 + L / 4) * 0 + (-L / 2 + cabStart / 2), paintHex));
    if (typeName === 'pickup') { // truck bed
      parts.push(coloredBox(W * 0.92, H * 0.3, trL - 0.2, 0, bodyTop + H * 0.1, (-L / 2 + cabStart / 2) + 0.1, paintHex));
      parts.push(coloredBox(W * 0.8, 0.06, trL - 0.4, 0, bodyTop + H * 0.24, (-L / 2 + cabStart / 2) + 0.1, TRIM_C.getHex()));
    }
    // bumpers
    parts.push(coloredBox(W * 0.98, 0.16, 0.22, 0, ride + 0.1, L / 2 + 0.02, TRIM_C.getHex()));
    parts.push(coloredBox(W * 0.98, 0.16, 0.22, 0, ride + 0.1, -L / 2 - 0.02, TRIM_C.getHex()));
    if (typeName === 'muscle') parts.push(coloredBox(W * 0.86, 0.07, 0.34, 0, bodyTop + cabH + 0.16, -L / 2 + 0.25, TRIM_C.getHex())); // spoiler
  }

  const geo = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());

  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.4 });
  const bodyMesh = new THREE.Mesh(geo, bodyMat);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // glass canopy
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, H * 0.3, cabLen * 0.9), GLASS_MAT);
  canopy.position.set(0, bodyTop + (typeName === 'sports' ? H * 0.13 : H * 0.19), cabStart + cabLen / 2);
  canopy.scale.set(1.005, 0.9, 0.985);
  group.add(canopy);

  // wheels
  const wr = typeName === 'suv' || typeName === 'pickup' || typeName === 'bus' ? Math.min(H * 0.23, 0.46) : typeName === 'sports' ? 0.32 : 0.35;
  const ww = typeName === 'bus' ? 0.4 : 0.26;
  const wb = L * 0.58, track = W * 0.44;
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(wr, wr, ww, 12).rotateZ(Math.PI / 2);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hub = new THREE.Group();
    const wm = new THREE.Mesh(wheelGeo, WHEEL_MAT);
    wm.castShadow = true;
    hub.add(wm);
    hub.position.set(sx * track, wr, sz * wb / 2);
    group.add(hub);
    wheels.push({ hub, mesh: wm, front: sz > 0 });
  }

  // headlights / taillights
  const headMat = new THREE.MeshStandardMaterial({ color: '#dfe6ee', emissive: '#fff6da', emissiveIntensity: 0.15 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#5a1418', emissive: '#ff2e3e', emissiveIntensity: 0.25 });
  const hlGeo = new THREE.BoxGeometry(W * 0.16, 0.09, 0.06);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headMat);
    hl.position.set(sx * W * 0.33, ride + H * 0.2, L / 2 + 0.01);
    group.add(hl);
    const tl = new THREE.Mesh(hlGeo, tailMat);
    tl.position.set(sx * W * 0.33, ride + H * 0.2, -L / 2 - 0.01);
    group.add(tl);
  }
  let lightbar = null;
  if (typeName === 'police') {
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.24),
      new THREE.MeshStandardMaterial({ color: '#401014', emissive: '#ff2030', emissiveIntensity: 0 }));
    rb.position.set(-0.24, bodyTop + H * 0.4 + 0.1, cabStart + cabLen / 2);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.24),
      new THREE.MeshStandardMaterial({ color: '#101a40', emissive: '#2050ff', emissiveIntensity: 0 }));
    bb.position.set(0.24, bodyTop + H * 0.4 + 0.1, cabStart + cabLen / 2);
    group.add(rb, bb);
    lightbar = { r: rb.material, b: bb.material };
    // livery stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W * 1.005, H * 0.16, L * 0.5),
      new THREE.MeshStandardMaterial({ color: '#1c2733', roughness: .5 }));
    stripe.position.set(0, ride + H * 0.18, 0);
    group.add(stripe);
  }
  if (typeName === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.24),
      new THREE.MeshStandardMaterial({ color: '#d9a53c', emissive: '#ffd97e', emissiveIntensity: 0.6 }));
    sign.position.set(0, bodyTop + H * 0.4 + 0.08, cabStart + cabLen / 2);
    group.add(sign);
  }

  return { group, bodyMat, wheels, headMat, tailMat, lightbar, wr, wb };
}

let _idCounter = 1;

export class Vehicle {
  constructor(ctx, typeName, x, z, heading = 0, opts = {}) {
    this.ctx = ctx;
    this.id = _idCounter++;
    this.typeName = typeName;
    this.spec = VEHICLE_TYPES[typeName];
    const rng = opts.rng || new RNG('veh' + this.id);
    this.paint = opts.paint ?? PAINTS[Math.floor(rng.next() * PAINTS.length)];
    if (typeName === 'taxi') this.paint = '#e7b93c';
    if (typeName === 'police') this.paint = '#e8eaee';
    if (opts.isPolice) this.isPolice = true;

    const built = buildBody(typeName, this.paint);
    this.group = built.group;
    this.bodyMat = built.bodyMat;
    this.wheels = built.wheels;
    this.headMat = built.headMat;
    this.tailMat = built.tailMat;
    this.lightbar = built.lightbar;
    this.wheelR = built.wr;

    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.steerAngle = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.driver = null;          // 'player' | Ped | null
    this.ai = null;              // set by traffic/police managers
    this.hp = this.spec.hp;
    this.maxHp = this.spec.hp;
    this.destroyed = false;
    this.burning = false;
    this.fuse = -1;
    this.lightsOn = false;
    this.braking = false;
    this.screechAmt = 0;
    this.lastImpact = 0;
    this.smokeTimer = 0;
    this.sirenOn = false;
    this.parkBrake = !opts.noPark;   // parked cars don't roll

    // suspension visuals
    this._pitch = 0; this._roll = 0; this._lastVF = 0; this._spin = 0;
    this._bodyNode = built.group.children[0];

    this.group.position.copy(this.pos);
    this.group.rotation.y = heading;
    ctx.scene.add(this.group);
    ctx.vehicles.push(this);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    return this.vx * s + this.vz * c;
  }
  fwdVec(out) { out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); return out; }
  rightVec(out) { out.set(-Math.cos(this.heading), 0, Math.sin(this.heading)); return out; }

  seatTransform(seatIdx = 0) {
    const off = this.spec.seats ? this.spec.seats[seatIdx] : [-0.36, 0.1];
    const L = this.spec.len;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading), rz = Math.sin(this.heading);
    return {
      x: this.pos.x + rx * off[0] * this.spec.wid * 0.5 + fx * L * 0.02,
      z: this.pos.z + rz * off[0] * this.spec.wid * 0.5 + fz * L * 0.02,
      heading: this.heading,
    };
  }
  doorPosition(side = 1) {
    const r = this.rightVec(new THREE.Vector3());
    return {
      x: this.pos.x + r.x * side * this.spec.wid * 0.62,
      z: this.pos.z + r.z * side * this.spec.wid * 0.62,
    };
  }

  setLights(on) {
    if (this.lightsOn === on) return;
    this.lightsOn = on;
    this.headMat.emissiveIntensity = on ? 2.6 : 0.15;
  }

  applyDamage(amount, source) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (source) this.lastDamager = source;
    if (this.hp <= 26 && !this.burning && this.hp > -200) {
      this.burning = true;
      this.fuse = 2.2 + Math.random() * 2.4;
    }
    if (this.hp <= 0 && !this.destroyed) this.explode();
  }

  explode() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.burning = false;
    this.hp = 0;
    this.bodyMat.color.setRGB(0.16, 0.15, 0.15);
    this.ctx.particles.explosion(this.pos.x, 0.6, this.pos.z, 1.1 + this.spec.mass * 0.25);
    // pop it a little
    this.vx *= 0.3; this.vz *= 0.3;
    const occupantDead = this.driver === 'player' || (this.driver && this.driver.takeDamage);
    this.ctx.events.emit('vehicleExploded', { vehicle: this, hadDriver: !!this.driver });
    if (this.driver === 'player') {
      this.ctx.player.exitVehicle(true);
      this.ctx.player.applyDamage(105, { explosion: true });
    } else if (this.driver && this.driver.kill) {
      this.driver.kill({ explosion: true });
    }
    this.driver = null;
    this.sirenOn = false;
  }

  update(dt) {
    if (this.destroyed) {
      // settle wreck smoke occasionally
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.4 + Math.random() * 0.5;
        if (this.ctx.camera.position.distanceToSquared(this.group.position) < 90 * 90)
          this.ctx.particles.smoke(this.pos.x, 0.8, this.pos.z, 1, '#2c2e33', 1.6);
      }
      return;
    }

    const t = this.spec;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    let vF = this.vx * s + this.vz * c;         // forward speed
    let vL = this.vx * -c + this.vz * s;        // lateral speed

    // ---- drive ----
    const active = !!this.driver;
    const thr = active ? clamp(this.input.throttle, -1, 1) : 0;
    if (this.burning) { /* engine sputters */ }
    if (thr > 0) {
      const powerCurve = 1 - clamp(vF / t.top, 0, 1) ** 1.7;
      vF += thr * t.accel * powerCurve * dt * (this.burning ? 0.55 : 1);
    } else if (thr < 0) {
      if (vF > 0.6) { vF += thr * t.accel * 1.6 * dt; this.braking = true; }  // brake
      else vF += thr * t.accel * 0.55 * dt * (vF > -t.top * 0.3 ? 1 : 0);     // reverse
    } else this.braking = false;
    if (this.input.handbrake && active) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 9 * dt);

    // drag & rolling resistance
    vF -= vF * Math.abs(vF) * 0.0042 * dt * 60 * 0.016;
    vF -= vF * 0.10 * dt;
    if (!active && Math.abs(vF) > 0) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (this.parkBrake ? 14 : 1.2) * dt);
    if (Math.abs(vF) < 0.05) vF = 0;

    // ---- steering ----
    const steerIn = active ? clamp(this.input.steer, -1, 1) : 0;
    const speedFalloff = 1 / (1 + Math.abs(vF) * 0.055);
    const targetSteer = steerIn * t.steer * speedFalloff;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 9);
    const yawRate = (vF / (t.len * 0.62)) * Math.tan(this.steerAngle) * 1.15;
    this.heading -= yawRate * dt;   // +steer => turn right (heading decreases)

    // ---- grip ----
    const hb = this.input.handbrake && active;
    const grip = hb ? 2.1 : t.grip;
    vL *= Math.exp(-grip * dt);
    // kinetic energy bleed into slide when drifting hard
    this.screechAmt = clamp((Math.abs(vL) - 2.2) / 8, 0, 1) + (hb && Math.abs(vF) > 8 ? 0.5 : 0);
    if (hb && Math.abs(vF) > 4) vF *= Math.exp(-0.25 * dt);

    // recompose
    this.vx = s * vF + -c * vL;
    this.vz = c * vF + s * vL;

    // integrate
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    // world bounds
    const B = this.ctx.plan.bounds;
    this.pos.x = clamp(this.pos.x, B.x0 + 6, B.x1 - 6);
    if (this.pos.z > B.z1 - 8) { // hit water
      this.ctx.events.emit('vehicleHitWater', { vehicle: this });
      if (this.driver === 'player') {
        this.ctx.player.exitVehicle(true);
        this.ctx.player.applyDamage(35, { water: true });
        this.ctx.hud.banner('SWEPT AWAY', 'The tide owns that car now.');
      } else if (this.driver?.kill) this.driver.kill({ drowned: true });
      if (!this.destroyed) this.explode();
      return;
    }

    this.collideStatic(dt);
    this.updateVisuals(dt);

    // burning fuse
    if (this.burning) {
      this.fuse -= dt;
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.06;
        this.ctx.particles.burst(this.ctx.particles.glow, 'ember', this.pos.x, 0.9, this.pos.z, 2, { speed: 2.4, life: 0.5, size: 0.5, color: '#ff7433' });
        this.ctx.particles.smoke(this.pos.x, 1.1, this.pos.z, 1, '#26282c', 1.2);
      }
      if (this.fuse <= 0) this.explode();
    } else if (this.hp < this.maxHp * 0.5) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0 && this.speed > 1) {
        this.smokeTimer = 0.3;
        this.ctx.particles.smoke(this.pos.x + (Math.random() - .5), 0.8, this.pos.z + (Math.random() - .5), 1, this.hp < this.maxHp * 0.28 ? '#33363b' : '#8b929c', 1);
      }
    }

    this._lastVF = vF;
  }

  collideStatic(dt) {
    const t = this.spec;
    const r = t.wid * 0.38;
    const corners = [[t.len * 0.36, t.wid * 0.4], [t.len * 0.36, -t.wid * 0.4], [-t.len * 0.36, t.wid * 0.4], [-t.len * 0.36, -t.wid * 0.4]];
    const q = this.ctx._qtmp || (this.ctx._qtmp = []);
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    for (const [fo, lo] of corners) {
      const px = this.pos.x + s * fo + -c * lo;
      const pz = this.pos.z + c * fo + s * lo;
      this.ctx.colliders.query(px, pz, r, q);
      for (const b of q) {
        if (px > b.x0 - r && px < b.x1 + r && pz > b.z0 - r && pz < b.z1 + r) {
          // push out along min penetration axis
          const penL = px - (b.x0 - r), penR = (b.x1 + r) - px;
          const penT = pz - (b.z0 - r), penB = (b.z1 + r) - pz;
          const m = Math.min(penL, penR, penT, penB);
          let nx = 0, nz = 0;
          if (m === penL) { nx = -1; this.pos.x -= penL; }
          else if (m === penR) { nx = 1; this.pos.x += penR; }
          else if (m === penT) { nz = -1; this.pos.z -= penT; }
          else { nz = 1; this.pos.z += penB; }
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) {
            const impact = -vn;
            this.vx -= nx * vn * 1.45;
            this.vz -= nz * vn * 1.45;
            // scrub some forward speed on hard hits
            if (impact > 3) {
              this.vx *= 0.72; this.vz *= 0.72;
              this.applyDamage(impact * 2.4, { wall: true });
              this.lastImpact = impact;
              if (impact > 5) {
                this.ctx.audio?.crash(clamp(impact / 18, 0.1, 0.85));
                this.ctx.particles.sparks(px, 0.6, pz, 6, '#ffd27e');
                this.ctx.camShake?.(clamp(impact / 30, 0, 0.5));
                this.ctx.events.emit('crash', { vehicle: this, impact });
                if (this.driver === 'player') this.ctx.player.applyDamage(Math.max(0, impact - 9) * 1.4, { crash: true });
              }
            }
          }
        }
      }
    }
  }

  updateVisuals(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;

    // suspension pitch/roll springs
    const acc = (this.forwardSpeed - this._lastVF) / Math.max(dt, 0.001);
    this._pitch += (clamp(acc * 0.006, -0.06, 0.06) - this._pitch) * Math.min(1, dt * 6);
    const latG = this.forwardSpeed * Math.tan(this.steerAngle) / (this.spec.len * 0.62);
    this._roll += (clamp(-latG * 0.028, -0.08, 0.08) - this._roll) * Math.min(1, dt * 6);
    this.group.rotation.x = this._pitch;
    this.group.rotation.z = this._roll;

    // wheels
    this._spin += (this.forwardSpeed / this.wheelR) * dt;
    for (const w of this.wheels) {
      w.mesh.rotation.x = this._spin;
      if (w.front) w.hub.rotation.y = -this.steerAngle * 1.0;
    }

    // brake lights
    const nightBoost = this.lightsOn ? 0.8 : 0.15;
    this.tailMat.emissiveIntensity = this.braking || (this.input.handbrake && this.driver) ? 3.2 : nightBoost;

    // police bar flash
    if (this.lightbar && this.sirenOn) {
      const ph = performance.now() * 0.011 % 2 < 1;
      this.lightbar.r.emissiveIntensity = ph ? 5 : 0.1;
      this.lightbar.b.emissiveIntensity = ph ? 0.1 : 5;
    } else if (this.lightbar) {
      this.lightbar.r.emissiveIntensity = this.lightbar.b.emissiveIntensity = 0.1;
    }
  }

  dispose() {
    const i = this.ctx.vehicles.indexOf(this);
    if (i >= 0) this.ctx.vehicles.splice(i, 1);
    this.ctx.scene.remove(this.group);
    this.group.traverse(o => { o.geometry?.dispose?.(); });
    this.bodyMat.dispose();
  }
}

// vehicle-vs-vehicle collision pass (called once per frame from main)
export function vehicleCollisionPass(ctx) {
  const vs = ctx.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    if (a.destroyed && a.speed < 0.1) continue;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const rr = (Math.max(a.spec.len, a.spec.wid) + Math.max(b.spec.len, b.spec.wid)) * 0.34;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const overlap = rr - d;
      const ma = a.spec.mass, mb = b.spec.mass;
      const totalM = ma + mb;
      // separate
      a.pos.x -= nx * overlap * (mb / totalM); a.pos.z -= nz * overlap * (mb / totalM);
      b.pos.x += nx * overlap * (ma / totalM); b.pos.z += nz * overlap * (ma / totalM);
      // impulse
      const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const imp = -vn * 0.92;
        a.vx -= nx * imp * (mb / totalM); a.vz -= nz * imp * (mb / totalM);
        b.vx += nx * imp * (ma / totalM); b.vz += nz * imp * (ma / totalM);
        const impact = -vn;
        if (impact > 3.5) {
          const dmg = impact * 3.2;
          a.applyDamage(dmg, { vehicle: b }); b.applyDamage(dmg, { vehicle: a });
          if (impact > 5) {
            ctx.audio?.crash(clamp(impact / 20, 0.1, 0.8));
            ctx.particles.sparks((a.pos.x + b.pos.x) / 2, 0.7, (a.pos.z + b.pos.z) / 2, 8, '#ffd27e');
            ctx.events.emit('crash', { vehicle: a, other: b, impact });
            const pd = a.driver === 'player' ? a : (b.driver === 'player' ? b : null);
            if (pd) {
              ctx.camShake?.(clamp(impact / 26, 0, 0.55));
              ctx.player.applyDamage(Math.max(0, impact - 10) * 1.2, { crash: true });
            }
            if ((a.isPolice || b.isPolice) && (a.driver === 'player' || b.driver === 'player')) {
              ctx.events.emit('crime', { type: 'ram_police', x: a.pos.x, z: a.pos.z, severity: 30 });
            }
          }
        }
      }
    }
  }
}
