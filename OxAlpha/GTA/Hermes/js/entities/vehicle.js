// ============================================================
// NEON MERIDIAN — entities/vehicle.js
// Vehicle physics (bicycle model + arcade grip), per-class
// procedural meshes, damage, lights. Steering uses the shared
// verified ControlsMath (A=left, D=right, never inverted).
// ============================================================
'use strict';

const VehicleClasses = {
  compact: { id: 'compact', name: 'Pico',        accel: 9.5,  top: 33, reverseTop: 9,  brake: 22, drag: 0.55, grip: 1.00, wheelbase: 2.45, w: 1.72, l: 3.95, h: 1.45, hp: 90,  seatY: 0.65 },
  sedan:   { id: 'sedan',   name: 'Meridian LS', accel: 9.0,  top: 38, reverseTop: 10, brake: 24, drag: 0.50, grip: 1.00, wheelbase: 2.78, w: 1.86, l: 4.65, h: 1.42, hp: 110, seatY: 0.62 },
  taxi:    { id: 'taxi',    name: 'City Cab',    accel: 9.2,  top: 37, reverseTop: 10, brake: 24, drag: 0.50, grip: 1.00, wheelbase: 2.78, w: 1.86, l: 4.65, h: 1.46, hp: 110, seatY: 0.62 },
  sports:  { id: 'sports',  name: 'Vector GT',   accel: 16.5, top: 55, reverseTop: 12, brake: 30, drag: 0.42, grip: 1.10, wheelbase: 2.62, w: 1.94, l: 4.35, h: 1.16, hp: 95,  seatY: 0.48 },
  pickup:  { id: 'pickup',  name: 'Hauler',      accel: 8.0,  top: 35, reverseTop: 9,  brake: 20, drag: 0.60, grip: 0.90, wheelbase: 3.10, w: 1.98, l: 5.25, h: 1.82, hp: 140, seatY: 0.85 },
  van:     { id: 'van',     name: 'Boxvan',      accel: 7.0,  top: 31, reverseTop: 9,  brake: 19, drag: 0.62, grip: 0.88, wheelbase: 3.00, w: 1.96, l: 5.05, h: 2.25, hp: 130, seatY: 0.95 },
  police:  { id: 'police',  name: 'Interceptor', accel: 12.5, top: 46, reverseTop: 11, brake: 27, drag: 0.46, grip: 1.06, wheelbase: 2.82, w: 1.90, l: 4.75, h: 1.46, hp: 120, seatY: 0.62 },
};

const VehiclePalette = [0xc23b2e, 0x2e6dc2, 0xd8d8dc, 0x22262c, 0x3f8f4f, 0xd8a02e, 0x7a4dc2, 0xd86a9e, 0x4dc2b4, 0x8a8f96];

const Vehicle = (() => {

  function buildMesh(cls, colorHex, isPolice) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex, roughness: 0.35, metalness: 0.55,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0e141c, roughness: 0.12, metalness: 0.8,
    });
    const W = cls.w, L = cls.l, H = cls.h;

    // chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.52, L), bodyMat);
    chassis.position.y = H * 0.38;
    chassis.castShadow = true;
    g.add(chassis);

    // cabin
    const cabL = L * (cls.id === 'van' || cls.id === 'pickup' ? 0.45 : 0.52);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, H * 0.5, cabL), glassMat);
    cab.position.set(0, H * 0.78, cls.id === 'pickup' ? L * 0.08 : -L * 0.05);
    cab.castShadow = true;
    g.add(cab);

    if (cls.id === 'pickup') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, H * 0.3, L * 0.4), bodyMat);
      bed.position.set(0, H * 0.62, L * 0.28);
      g.add(bed);
    }
    if (cls.id === 'van') {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, H * 0.3, L * 0.2), bodyMat);
      hood.position.set(0, H * 0.5, L * 0.42);
      g.add(hood);
    }
    if (cls.id === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd24a, emissiveIntensity: 0.9 }));
      sign.position.set(0, H * 1.08, -L * 0.05);
      g.add(sign);
    }

    // police lightbar (two emissive boxes, flash handled per-frame)
    let lightbar = null;
    if (isPolice) {
      const barMatR = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2030, emissiveIntensity: 0 });
      const barMatB = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2040ff, emissiveIntensity: 0 });
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.28), barMatR);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.28), barMatB);
      barR.position.set(-0.26, H * 1.06, -L * 0.05);
      barB.position.set(0.26, H * 1.06, -L * 0.05);
      g.add(barR, barB);
      lightbar = { r: barMatR, b: barMatB, phase: Math.random() * 2 };
      // white/black two-tone
      const doors = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, H * 0.3, L * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.4 }));
      doors.position.set(0, H * 0.34, 0);
      g.add(doors);
    }

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(H * 0.30, H * 0.30, 0.24, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.9 });
    const hubGeo = new THREE.CylinderGeometry(H * 0.13, H * 0.13, 0.26, 8);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.8 });
    const wheels = [];
    const wx = W / 2 - 0.06, wzF = L * 0.32, wzR = -L * 0.32;
    for (const [x, z, front] of [[-wx, wzF, 1], [wx, wzF, 1], [-wx, wzR, 0], [wx, wzR, 0]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, H * 0.30, z);
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, hubMat);
      pivot.add(tire, hub);
      g.add(pivot);
      wheels.push({ pivot, tire, hub, front: !!front });
    }

    // head/tail lights (emissive)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e0, emissive: 0xfff2cc, emissiveIntensity: 0 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2a1a, emissiveIntensity: 0 });
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), headMat);
      hl.position.set(s * W * 0.3, H * 0.45, L / 2 + 0.01);
      g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), tailMat);
      tl.position.set(s * W * 0.3, H * 0.45, -L / 2 - 0.01);
      g.add(tl);
    }

    return { group: g, wheels, bodyMat, headMat, tailMat, lightbar };
  }

  let NEXT_ID = 1;

  class Vehicle {
    constructor(clsId, x, z, heading, opts) {
      const cls = VehicleClasses[clsId];
      this.cls = cls;
      this.id = NEXT_ID++;
      this.kind = clsId;
      this.isPolice = clsId === 'police';
      const palette = this.isPolice ? [0xe8e8ec] : VehiclePalette;
      const color = (opts && opts.color) !== undefined ? opts.color
        : palette[Math.floor(Math.random() * palette.length)];
      this.mesh = buildMesh(cls, color, this.isPolice);
      this.pos = new THREE.Vector3(x, 0, z);
      this.heading = heading || 0;          // GAME convention: +heading = right turn
      this.speed = 0;
      this.steer = 0;
      this.steerInput = 0;                  // -1..1 set by driver each frame
      this.throttle = 0;                    // 0..1
      this.brake = 0;                       // 0..1
      this.handbrake = false;
      this.hp = cls.hp;
      this.maxHp = cls.hp;
      this.driver = null;                   // 'player' | 'traffic' | 'police' | null
      this.brakeLight = 0;
      this.headlightsOn = false;
      this.smokeT = 0;
      this.wheelSpin = 0;
      this.lastImpactSpeed = 0;
      this.sirenOn = false;
      this.aiState = {};                    // scratch for traffic/police AI
      this.syncMesh();
    }

    get forward() {
      return { x: Math.sin(this.heading), z: -Math.cos(this.heading) };
    }
    get halfLen() { return this.cls.l / 2; }
    get halfWid() { return this.cls.w / 2; }

    /** Physics integration. colliders: array of Collider; vehicles: other cars. */
    step(dt, world, vehicles) {
      const cls = this.cls;
      const dead = this.hp <= 0;

      // --- longitudinal ---
      let accel = 0;
      if (!dead) {
        if (this.throttle > 0) {
          const topSpeed = cls.top * (this.hp < cls.hp * 0.35 ? 0.7 : 1);
          if (this.speed < topSpeed) accel = cls.accel * this.throttle * (1.05 - 0.55 * this.speed / cls.top);
        } else if (this.brake > 0) {
          if (this.speed > 0.5) accel = -cls.brake * this.brake;
          else if (this.speed > -cls.reverseTop) accel = -cls.accel * 0.55 * this.brake; // reverse
        }
      }
      // drag + rolling
      accel -= this.speed * cls.drag * 0.14 * (this.handbrake ? 4 : 1);
      if (this.handbrake && Math.abs(this.speed) > 0.4) {
        // handbrake: strong decel + oversteer-ish extra yaw authority
        accel -= Math.sign(this.speed) * 6;
      }
      this.speed += accel * dt;
      if (Math.abs(this.speed) < 0.15 && this.throttle === 0 && this.brake === 0) this.speed = 0;

      // --- steering (verified math; sign convention: +steer = right) ---
      const steerLimit = ControlsMath.steerLimit(Math.abs(this.speed));
      const target = clamp(this.steerInput, -1, 1) * steerLimit;
      const rate = 4.5;
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
      const yawRate = ControlsMath.vehicleYawRate(this.speed, this.steer * (this.handbrake ? 1.35 : 1), cls.wheelbase);
      this.heading += yawRate * dt;

      // --- integrate ---
      const f = this.forward;
      this.pos.x += f.x * this.speed * dt;
      this.pos.z += f.z * this.speed * dt;

      // --- static collisions (AABB vs circle-ish car) ---
      const r = this.halfLen * 0.72;
      for (const c of world.colliders) {
        if (!c.solid) continue;
        // quick reject
        if (this.pos.x < c.x0 - r || this.pos.x > c.x1 + r || this.pos.z < c.z0 - r || this.pos.z > c.z1 + r) continue;
        // find closest point on box
        const cx = clamp(this.pos.x, c.x0, c.x1);
        const cz = clamp(this.pos.z, c.z0, c.z1);
        let dx = this.pos.x - cx, dz = this.pos.z - cz;
        let d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-4) { dx = f.x; dz = f.z; d = 1; }   // dead center: push back along heading
          const nx = dx / d, nz = dz / d;
          this.pos.x += nx * (r - d);
          this.pos.z += nz * (r - d);
          const impact = Math.abs(this.speed);
          this.speed *= -0.28;
          this.registerImpact(impact);
        }
      }

      // --- vehicle-vehicle ---
      if (vehicles) {
        for (const o of vehicles) {
          if (o === this || o.disposed) continue;
          const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
          const rr = (this.halfLen + o.halfLen) * 0.62;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const nx = dx / d, nz = dz / d;
            const push = (rr - d) / 2;
            this.pos.x -= nx * push; this.pos.z -= nz * push;
            o.pos.x += nx * push; o.pos.z += nz * push;
            const rel = this.speed - o.speed;
            if (rel > 0) {
              this.registerImpact(rel * 0.5);
              o.registerImpact(rel * 0.5);
            }
            const avg = (this.speed + o.speed) / 2;
            this.speed = avg * 0.72 + this.speed * 0.28;
            o.speed = avg * 0.72 + o.speed * 0.28;
          }
        }
      }

      // --- visuals ---
      this.wheelSpin += this.speed * dt / (this.cls.h * 0.30);
      this.brakeLight = this.brake > 0.05 ? 1 : 0;
      this.syncMesh();
    }

    registerImpact(speed) {
      if (speed > 4) {
        this.lastImpactSpeed = speed;
        this.hp -= (speed - 3) * 2.2;
        if (this.hp < 0) this.hp = 0;
        this.mesh.bodyMat.color.multiplyScalar(0.965);  // scuff darker
      }
    }

    syncMesh() {
      this.mesh.group.position.copy(this.pos);
      this.mesh.group.rotation.y = -this.heading;   // three.js mapping (verified)
      for (const w of this.mesh.wheels) {
        w.tire.rotation.x = this.wheelSpin;
        w.hub.rotation.x = this.wheelSpin;
        if (w.front) w.pivot.rotation.y = -this.steer * 0.55;
      }
      this.mesh.tailMat.emissiveIntensity = this.brakeLight ? 2.2 : (this.headlightsOn ? 0.5 : 0);
      this.mesh.headMat.emissiveIntensity = this.headlightsOn ? 1.8 : 0;
      if (this.mesh.lightbar) {
        const t = performance.now() / 1000;
        const on = this.sirenOn;
        this.mesh.lightbar.r.emissiveIntensity = on ? (Math.sin(t * 12) > 0 ? 3 : 0.1) : 0;
        this.mesh.lightbar.b.emissiveIntensity = on ? (Math.sin(t * 12) <= 0 ? 3 : 0.1) : 0.05;
      }
    }

    /** Player or AI seat position for camera. */
    seatWorldPos(out) {
      const f = this.forward;
      out.set(this.pos.x, this.pos.y + this.cls.h + 0.4, this.pos.z);
      return out;
    }

    dispose(scene) {
      scene.remove(this.mesh.group);
      this.disposed = true;
    }
  }

  Vehicle.VehicleClasses = VehicleClasses;
  Vehicle.VehiclePalette = VehiclePalette;
  return Vehicle;
})();

if (typeof module !== 'undefined') module.exports = { Vehicle: null };
