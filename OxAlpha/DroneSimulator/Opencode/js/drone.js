(function () {
  "use strict";
  const DS = (window.DS = window.DS || {});
  const U = DS.util;
  const G = 9.81;

  function buildModel() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x23272e });
    const accent = new THREE.MeshLambertMaterial({ color: 0x2ea8d8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.085, 0.40), dark);
    body.castShadow = true;
    g.add(body);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.05, 0.26), accent);
    canopy.position.set(0, 0.06, -0.02);
    g.add(canopy);
    const camMount = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.09), dark);
    camMount.position.set(0, 0.05, -0.23);
    camMount.rotation.x = 0.12;
    g.add(camMount);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.03, 12),
      new THREE.MeshBasicMaterial({ color: 0x1133aa })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.065, -0.275);
    g.add(lens);

    const armGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.34, 6);
    const motorGeo = new THREE.CylinderGeometry(0.052, 0.058, 0.07, 10);
    const props = [];
    const discs = [];
    const corners = [[-0.235, -0.235], [0.235, -0.235], [-0.235, 0.235], [0.235, 0.235]];
    const ledCols = [0xff3333, 0x33ff55, 0xffffff, 0xffffff];
    const discTex = U.propDiscTexture();
    corners.forEach(([cx, cz], i) => {
      const arm = new THREE.Mesh(armGeo, dark);
      arm.position.set(cx * 0.5, 0, cz * 0.5);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.z = Math.atan2(cz, cx) + Math.PI / 2;
      g.add(arm);
      const motor = new THREE.Mesh(motorGeo, dark);
      motor.position.set(cx, 0.045, cz);
      motor.castShadow = true;
      g.add(motor);
      const pg = new THREE.Group();
      pg.position.set(cx, 0.088, cz);
      for (let b = 0; b < 2; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.30, 0.008, 0.035),
          new THREE.MeshLambertMaterial({ color: 0x39404a })
        );
        blade.rotation.y = b * Math.PI / 2;
        pg.add(blade);
      }
      g.add(pg);
      props.push(pg);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.165, 20),
        new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(cx, 0.095, cz);
      g.add(disc);
      discs.push(disc);
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 8),
        new THREE.MeshBasicMaterial({ color: ledCols[i] })
      );
      led.position.set(cx * 1.15, 0.02, cz * 1.15);
      g.add(led);
    });
    return { group: g, props, discs };
  }

  const VISUAL_SCALE = 1.7;

  function Drone(world, callbacks) {
    this.world = world;
    this.cb = callbacks || {};
    const model = buildModel();
    this.group = model.group;
    this.group.scale.setScalar(VISUAL_SCALE);
    this._props = model.props;
    this._discs = model.discs;

    this.pos = new THREE.Vector3(0, 0.16, 0);
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.yaw = 0;
    this.pitchTilt = 0;
    this.rollTilt = 0;
    this.rate = { x: 0, y: 0, z: 0 };
    this.thrManual = G / 21;
    this.thrEff = 0;
    this.battery = 100;
    this.grounded = true;
    this.crashed = false;
    this.invuln = 0;
    this.lowBatWarned = false;
    this.charging = false;
    this.droneR = 0.21;
    this._prev = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
    this._upV = new THREE.Vector3();
  }

  Drone.prototype.reset = function (pos, yawDeg) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = THREE.MathUtils.degToRad(yawDeg || 0);
    this.pitchTilt = this.rollTilt = 0;
    this.rate.x = this.rate.y = this.rate.z = 0;
    this.thrManual = G / 21;
    this.euler.set(0, this.yaw, 0, "YXZ");
    this.quat.setFromEuler(this.euler);
    this.crashed = false;
    this.invuln = 1.1;
    this.grounded = false;
    this.lowBatWarned = this.battery < 25;
    this.syncGroup();
  };

  Drone.prototype.refillBattery = function () {
    this.battery = 100;
    this.lowBatWarned = false;
  };

  Drone.prototype.charge = function (amount) {
    this.battery = Math.min(100, this.battery + amount);
    if (this.battery > 40) this.lowBatWarned = false;
  };

  Drone.prototype.crash = function () {
    if (this.crashed || this.invuln > 0) return;
    this.crashed = true;
    if (this.cb.onCrash) this.cb.onCrash(this.pos.clone());
  };

  Drone.prototype.update = function (dt, inp, settings) {
    if (this.crashed) return;
    if (this.invuln > 0) this.invuln -= dt;
    this._prev.copy(this.pos);

    const sensPR = settings.sensPitchRoll;
    const sensYaw = settings.sensYaw;
    const sensCl = settings.sensClimb;
    const acro = !settings.assistAngle;
    let thrustMag = 0;

    if (!acro) {
      const maxTilt = Math.min(1.0, 0.60 * sensPR);
      this.pitchTilt = U.damp(this.pitchTilt, -inp.pitch * maxTilt, 7, dt);
      this.rollTilt = U.damp(this.rollTilt, -inp.roll * maxTilt, 9, dt);
      this.yaw -= inp.yaw * 1.85 * sensYaw * dt;
      this.euler.set(this.pitchTilt, this.yaw, this.rollTilt, "YXZ");
      this.quat.setFromEuler(this.euler);

      if (settings.hoverAssist) {
        const vyT = inp.climb * 6.2 * sensCl;
        const cosT = Math.max(0.38, Math.cos(this.pitchTilt) * Math.cos(this.rollTilt));
        let mag = (G + 2.45 * (vyT - this.vel.y)) / cosT;
        thrustMag = U.clamp(mag, 0, 2.75 * G);
      } else {
        this.thrManual = U.clamp(this.thrManual + inp.climb * dt * 1.25, 0, 1);
        thrustMag = this.thrManual * 21;
        thrustMag *= Math.max(0.35, Math.cos(this.pitchTilt));
      }
    } else {
      const pMax = 3.6 * sensPR, yMax = 2.3 * sensYaw;
      this.rate.x = U.damp(this.rate.x, -inp.pitch * pMax, 10, dt);
      this.rate.z = U.damp(this.rate.z, -inp.roll * pMax, 10, dt);
      this.rate.y = U.damp(this.rate.y, -inp.yaw * yMax, 10, dt);
      const wl = Math.hypot(Math.hypot(this.rate.x, this.rate.y), this.rate.z) * dt;
      if (wl > 1e-7) {
        this._tmpV.set(this.rate.x, this.rate.y, this.rate.z).normalize();
        this._tmpQ.setFromAxisAngle(this._tmpV, wl);
        this.quat.multiply(this._tmpQ).normalize();
      }
      this.thrManual = U.clamp(this.thrManual + inp.climb * dt * 1.25, 0, 1);
      thrustMag = this.thrManual * 22.5;
      this.euler.setFromQuaternion(this.quat, "YXZ");
      this.yaw = this.euler.y;
    }

    const depletion = U.smoothstep(this.battery, 0, 14);
    thrustMag *= 0.12 + 0.88 * depletion;
    this.thrEff = thrustMag / (2.75 * G);

    this._upV.set(0, 1, 0).applyQuaternion(this.quat);
    this.vel.addScaledVector(this._upV, thrustMag * dt);
    this.vel.y -= G * dt;

    const spd = this.vel.length();
    const dragK = 0.055 + 0.010 * spd;
    this.vel.addScaledVector(this.vel, -dragK * dt);

    this.pos.addScaledVector(this.vel, dt);

    const gh = this.world.groundAt(this.pos.x, this.pos.z);
    const floor = gh + 0.17;
    this.charging = false;
    if (this.pos.y <= floor) {
      const impact = -this.vel.y;
      const total = spd;
      if ((impact > 7.5 || total > 13.5) && this.battery > 1) {
        this.crash();
        return;
      }
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y = 0;
      const f = Math.exp(-7 * dt);
      this.vel.x *= f; this.vel.z *= f;
      this.grounded = true;
      if (this.world.onPad(this.pos.x, this.pos.z)) this.charging = true;
    } else if (this.pos.y > floor + 0.05) {
      this.grounded = false;
    }
    if (this.grounded && !settings.hoverAssist) {
      this.thrManual = U.clamp(this.thrManual + (inp.climb > 0 ? dt * 1.25 : -dt * 2.5), G / 21, 1);
      if (this.thrManual * 21 > G * 1.02 && !acro) this.grounded = false;
    }

    const drain = (0.32 + this.thrEff * 1.55) * dt;
    this.battery = Math.max(0, this.battery - drain);
    if (this.battery <= 25 && !this.lowBatWarned) {
      this.lowBatWarned = true;
      if (this.cb.onLowBattery) this.cb.onLowBattery();
    }

    const spin = (16 + this.thrEff * 130) * dt;
    for (let i = 0; i < this._props.length; i++) {
      this._props[i].rotation.y += i % 2 ? spin : -spin;
      this._discs[i].material.opacity = 0.10 + this.thrEff * 0.30;
    }

    this.syncGroup();
  };

  Drone.prototype.syncGroup = function () {
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
    this.group.visible = !this.crashed && (this.invuln <= 0 || Math.floor(performance.now() / 90) % 2 === 0);
  };

  Drone.prototype.checkColliders = function (cols) {
    if (this.crashed || this.invuln > 0) return false;
    const p = this.pos, r = this.droneR;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (Math.abs(c.c ? c.c.x - p.x : (c.min.x + c.max.x) / 2 - p.x) > 60) continue;
      if (c.type === "s") {
        const dx = p.x - c.c.x, dy = p.y - c.c.y, dz = p.z - c.c.z;
        const rr = c.r + r;
        if (dx * dx + dy * dy + dz * dz < rr * rr) return true;
      } else {
        const cx = U.clamp(p.x, c.min.x, c.max.x);
        const cy = U.clamp(p.y, c.min.y, c.max.y);
        const cz = U.clamp(p.z, c.min.z, c.max.z);
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        if (dx * dx + dy * dy + dz * dz < r * r) return true;
      }
    }
    return false;
  };

  Object.defineProperty(Drone.prototype, "speed", {
    get() { return Math.hypot(this.vel.x, this.vel.z); }
  });
  Object.defineProperty(Drone.prototype, "vsi", {
    get() { return this.vel.y; }
  });
  Object.defineProperty(Drone.prototype, "altitude", {
    get() { return this.pos.y - this.world.groundAt(this.pos.x, this.pos.z); }
  });
  Object.defineProperty(Drone.prototype, "headingDeg", {
    get() {
      let h = (-this.yaw * 180 / Math.PI) % 360;
      if (h < 0) h += 360;
      return h;
    }
  });

  DS.Drone = Drone;
})();
