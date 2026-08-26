// CHROME HARBOR — third-person player controller + orbit camera.
// Controls contract: mouse right => camera right, W/A/S/D camera-relative, never inverted.
import * as THREE from 'three';
import { makeHumanoid } from './rig.js';
import { clamp, resolveCircleAABB, wrapAngle, damp } from '../core/util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Player {
  constructor(ctx, x, z) {
    this.ctx = ctx;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = 0;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.armor = 0;
    this.money = 350;
    this.weapons = { fist: { ammo: Infinity } };
    this.currentWeapon = 'fist';
    this.vehicle = null;
    this.seatIdx = 0;
    this.dead = false;
    this.busted = false;
    this.damageFx = 0;
    this.fireCd = 0;
    this.meleeCd = 0;
    this.reloadT = 0;
    this.stepTimer = 0;

    this.rig = makeHumanoid({
      shirt: '#a34a28', pants: '#23262c', skin: '#d9a06b', hair: '#1c1a1c', scale: 1.02,
    });
    this.rig.onFootstep = (run) => ctx.audio?.footstep(run);
    ctx.scene.add(this.rig.group);

    // ---- camera ----
    this.camYaw = Math.PI * 0.15;
    this.camPitch = 0.32;         // orbit pitch: high = looking down
    this.camDist = 5.2;
    this._camDistSmooth = 5.2;
    this._shake = 0;
    this.aiming = false;
    this._lastDistrict = '';
  }

  get armedDef() {
    const w = this.ctx.weapons.WEAPONS[this.currentWeapon];
    return w || null;
  }

  giveWeapon(id, ammo) {
    const cur = this.weapons[id];
    if (!cur) this.weapons[id] = { ammo: ammo ?? 0 };
    else cur.ammo += ammo ?? 60;
    this.currentWeapon = id === 'fist' ? this.currentWeapon : id;
    this.rig.st.armed = id;
    this.rig.attachGun(id);
  }

  addMoney(n, silentDelta) {
    this.money = Math.max(0, Math.round(this.money + n));
    if (!silentDelta) this.ctx.hud.moneyDelta(n);
  }

  applyDamage(dmg, source) {
    if (this.dead) return;
    dmg = Math.round(dmg);
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.65);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.damageFx = Math.min(1, this.damageFx + dmg / 40);
    this.ctx.hud.pulseDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.die(source);
    }
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.rig.st.dead = 1;
    if (this.vehicle) this.exitVehicle(true);
    this.ctx.audio?.stingBad();
    this.ctx.events.emit('playerDied', { source });
    this.ctx.menus.showWasted();
  }

  respawn(at) {
    this.dead = false;
    this.rig.st.dead = 0;
    this.health = 100;
    this.armor = 0;
    this.pos.set(at.x, 0, at.z);
    this.vy = 0;
    this.damageFx = 0;
    this.rig.group.rotation.set(0, 0, 0);
    this.rig.group.position.copy(this.pos);
    this.ctx.police.clearWanted();
  }

  enterVehicle(veh) {
    if (this.vehicle) return;
    this.vehicle = veh;
    veh.driver = 'player';
    veh.parkBrake = false;
    this.rig.group.visible = false;
    this.rig.st.seated = true;
    this.rig.attachGun(null);
    this.aiming = false;
    this.ctx.audio?.doorCar();
    this.ctx.events.emit('playerEnteredVehicle', { vehicle: veh });
    // stolen a car in public? that's a crime if witnessed
    if (!veh.wasStolen) {
      veh.wasStolen = true;
      this.ctx.events.emit('crime', { type: 'carjack', x: veh.pos.x, z: veh.pos.z, severity: 22 });
    }
  }

  exitVehicle(force = false) {
    const veh = this.vehicle;
    if (!veh) return;
    if (!force && Math.abs(veh.forwardSpeed) > 14) return; // too fast to jump out
    this.vehicle = null;
    veh.driver = null;
    if (!veh.destroyed) veh.parkBrake = !veh.destroyed ? false : veh.parkBrake;
    const door = veh.doorPosition(1);
    this.pos.set(door.x, 0, door.z);
    this.resolveCollisions();
    this.rig.group.visible = true;
    this.rig.st.seated = false;
    if (this.currentWeapon !== 'fist') this.rig.attachGun(this.currentWeapon);
    this.ctx.audio?.doorCar();
    this.ctx.events.emit('playerExitedVehicle', { vehicle: veh });
  }

  nearestVehicle(maxR = 3.6) {
    let best = null, bd = maxR * maxR;
    for (const v of this.ctx.vehicles) {
      if (v.destroyed || v.driver) continue;
      const dx = v.pos.x - this.pos.x, dz = v.pos.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      const rr = maxR + Math.max(v.spec.len, v.spec.wid) * 0.42;
      if (d2 < rr * rr && d2 < bd * 10000) {
        // measure to door
        const door = v.doorPosition(1);
        const dd = (door.x - this.pos.x) ** 2 + (door.z - this.pos.z) ** 2;
        if (dd < bd) { bd = dd; best = v; }
      }
    }
    return best;
  }

  update(dt, input) {
    const st = this.rig.st;
    st.speed01 = 0; st.moving = false;

    if (this.dead) {
      this.rig.update(dt);
      this.updateCamera(dt, input, true);
      return;
    }

    this.damageFx = Math.max(0, this.damageFx - dt * 0.7);
    this.fireCd -= dt; this.meleeCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }

    if (this.vehicle) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);

    // interact scan
    if (!this.ctx.menus.blocking) this.scanInteract(input);

    st.aiming = this.aiming && !this.vehicle;
    this.rig.update(dt);

    // rig follows physics
    if (!this.vehicle) {
      this.rig.group.position.copy(this.pos);
      this.rig.group.rotation.y = this.heading;
    } else {
      const s = this.vehicle.seatTransform(this.seatIdx);
      this.rig.group.position.set(s.x, 0.12, s.z);
      this.rig.group.rotation.y = s.heading;
    }

    // head look toward camera while aiming/idle
    const lookOff = wrapAngle(this.camYaw + Math.PI - this.heading);
    st.lookYaw = clamp(this.aiming || this.vehicle ? lookOff : lookOff * 0.35, -1.1, 1.1);
    st.lookPitch = clamp(-this.camPitch * 0.6, -0.6, 0.6);
    st.aimPitch = clamp(-this.camPitch, -1.1, 1.0);

    this.updateCamera(dt, input, false);
  }

  // ---------------- ON FOOT ----------------
  updateOnFoot(dt, input) {
    const st = this.rig.st;
    // camera-relative movement basis
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);   // camera forward (target - cam)
    const rx = -fz, rz = fx;
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += fx; mz += fz; }
    if (input.down('KeyS')) { mx -= fx; mz -= fz; }
    if (input.down('KeyD')) { mx += rx; mz += rz; }
    if (input.down('KeyA')) { mx -= rx; mz -= rz; }
    const mlen = Math.hypot(mx, mz);

    const sprint = input.sprint && mlen > 0;
    const speed = sprint ? 8.2 : 4.4;
    if (mlen > 0) {
      mx /= mlen; mz /= mlen;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      // face movement direction (damped)
      const targetH = Math.atan2(mx, mz);
      this.heading += wrapAngle(targetH - this.heading) * Math.min(1, dt * 12);
      st.speed01 = sprint ? 1 : 0.55;
      st.moving = true;
      st.run = sprint;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = sprint ? 0.26 : 0.42; }
    }

    // jumping
    if (input.hit('Space') && this.grounded) {
      this.vy = 7.4;
      this.grounded = false;
    }
    this.vy -= 21 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }

    // aiming stance
    const wasAiming = this.aiming;
    this.aiming = input.mouse.right && this.currentWeapon !== 'fist';
    if (this.aiming) {
      this.heading += wrapAngle((this.camYaw + Math.PI) - this.heading) * Math.min(1, dt * 16);
    }
    // fire
    const def = this.armedDef;
    if (def && def.melee) {
      if (input.mouse.leftEdge || (input.mouse.left && this.meleeCd <= -0.05)) this.tryMelee();
    } else if (def) {
      const wantFire = def.auto ? input.mouse.left : input.mouse.leftEdge;
      if (wantFire && this.fireCd <= 0 && this.reloadT <= 0) this.tryFire(def);
    }
    if (input.hit('KeyR')) this.startReload();

    // weapon switching
    const order = ['fist', 'pistol', 'smg', 'shotgun', 'rifle'];
    const owned = order.filter(o => this.weapons[o]);
    if (input.mouse.wheel !== 0 && owned.length) {
      let i = owned.indexOf(this.currentWeapon);
      i = (i + (input.mouse.wheel > 0 ? 1 : -1) + owned.length) % owned.length;
      this.selectWeapon(owned[i]);
    }
    for (let n = 1; n <= 5; n++) if (input.hit('Digit' + n)) {
      const w = order[n - 1];
      if (this.weapons[w]) this.selectWeapon(w);
    }

    this.resolveCollisions();

    // deep water pushes back (no swimming)
    if (this.ctx.plan.inWater(this.pos.x, this.pos.z)) {
      this.applyDamage(24 * dt, { water: true });
      this.pos.z -= 12 * dt;
      if (Math.random() < 0.3) this.ctx.particles.splash(this.pos.x, 0.2, this.pos.z, 3);
    }
  }

  selectWeapon(id) {
    this.currentWeapon = id;
    this.rig.st.armed = id === 'fist' ? null : id;
    this.rig.attachGun(id === 'fist' ? null : id);
    this.ctx.hud.updateWeapon(this);
    this.ctx.audio?.uiClick();
  }

  tryMelee() {
    if (this.meleeCd > 0) return;
    this.meleeCd = 0.45;
    this.rig.st.punchT = 0;
    this.ctx.audio?.shot('melee');
    // arc hit check in front
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hit = this.ctx.npcs.nearestToLine(this.pos.x, this.pos.z, fx, fz, 2.0, 1.1);
    if (hit) {
      hit.takeDamage(18, { melee: true, from: this });
      this.ctx.particles.bloodPuff(hit.pos.x, 1.3, hit.pos.z);
      this.ctx.events.emit('crime', { type: 'assault', x: this.pos.x, z: this.pos.z, severity: 26 });
    } else {
      const copHit = this.ctx.police.nearestCopToLine?.(this.pos.x, this.pos.z, fx, fz, 2.0);
      if (copHit) copHit.takeDamage(18, { melee: true, from: this });
    }
  }

  tryFire(def) {
    const inv = this.weapons[this.currentWeapon];
    if (!def.melee) {
      if (inv.ammo <= 0) { this.startReload(); return; }
      inv.ammo--;
    }
    this.fireCd = 1 / def.rate;
    const org = _v.set(this.pos.x, this.pos.y + 1.42, this.pos.z);
    // muzzle slightly ahead along camera aim
    const yaw = this.camYaw + Math.PI;
    const pitch = -this.camPitch;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    org.addScaledVector(dir, 0.55);
    if (this.vehicle) {
      // drive-by: clamp to sides
      const rel = wrapAngle(Math.atan2(dir.x, dir.z) - this.vehicle.heading);
      if (Math.abs(rel) < 0.45 || Math.abs(rel) > Math.PI - 0.45) return; // don't shoot through own windshield
    }
    this.ctx.weapons.fireHitscan({
      shooter: this,
      origin: org, dir,
      def,
      spread: def.spread * (this.aiming ? 0.55 : 1),
    });
    this.ctx.hud.updateWeapon(this);
  }

  startReload() {
    const def = this.armedDef;
    if (!def || def.melee || this.reloadT > 0) return;
    const inv = this.weapons[this.currentWeapon];
    if (!inv || inv.ammo >= def.mag) return;
    if (!this.ammoPool || this.ammoPool[this.currentWeapon] <= 0) { this.ctx.hud.toastPrompt('No spare ammo'); return; }
    this.reloadT = def.reload;
  }
  finishReload() {
    const def = this.armedDef;
    const inv = this.weapons[this.currentWeapon];
    const need = def.mag - inv.ammo;
    const take = Math.min(need, this.ammoPool[this.currentWeapon] || 0);
    inv.ammo += take;
    this.ammoPool[this.currentWeapon] -= take;
    this.ctx.hud.updateWeapon(this);
  }

  // ---------------- DRIVING ----------------
  updateDriving(dt, input) {
    const veh = this.vehicle;
    if (veh.destroyed) { this.exitVehicle(true); return; }
    veh.input.throttle = (input.down('KeyW') ? 1 : 0) + (input.down('KeyS') ? -1 : 0);
    veh.input.steer = (input.down('KeyD') ? 1 : 0) + (input.down('KeyA') ? -1 : 0);
    veh.input.handbrake = input.down('Space');
    this.aiming = false;

    // horn
    if (input.down('KeyQ')) this.ctx.audio?.horn(true);
    else this.ctx.audio?.horn(false);

    // exit
    if (input.hit('KeyE') || input.hit('KeyF')) this.exitVehicle(false);

    // drive-by fire
    const def = this.armedDef;
    if (def && !def.melee && (def.id === 'smg' || def.id === 'pistol' || this.currentWeapon === 'smg' || this.currentWeapon === 'pistol')) {
      const wantFire = def.auto ? input.mouse.left : input.mouse.leftEdge;
      if (wantFire && this.fireCd <= 0 && this.reloadT <= 0) this.tryFire(def);
    }
    if (input.hit('KeyR')) this.startReload();

    // screech + engine audio handled by main loop (needs rpm calc)
  }

  // ---------------- COLLISIONS ----------------
  resolveCollisions() {
    const q = this.ctx._qtmp || (this.ctx._qtmp = []);
    this.ctx.colliders.query(this.pos.x, this.pos.z, 1.2, q);
    for (const b of q) resolveCircleAABB(this.pos, 0.42, b);
    // vs vehicles (circle approx)
    for (const v of this.ctx.vehicles) {
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      const r = Math.max(v.spec.len, v.spec.wid) * 0.46 + 0.35;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.pos.x = v.pos.x + dx / d * r;
        this.pos.z = v.pos.z + dz / d * r;
      }
    }
    const B = this.ctx.plan.bounds;
    this.pos.x = clamp(this.pos.x, B.x0 + 2, B.x1 - 2);
  }

  // ---------------- INTERACTION ----------------
  scanInteract(input) {
    const ctx = this.ctx;
    let prompt = null, action = null;
    if (!this.vehicle) {
      const veh = this.nearestVehicle();
      if (veh) { prompt = `<b>E</b> — Enter ${veh.spec.name}`; action = () => this.enterVehicle(veh); }
    } else {
      // spray shop?
      for (const sp of ctx.plan.landmarks.sprayShops) {
        const d = Math.hypot(sp.inside.x - this.pos.x, sp.inside.z - this.pos.z);
        if (d < 9) {
          const copsNear = ctx.police.copsWithin(this.pos.x, this.pos.z, 70);
          if (ctx.police.stars > 0 && copsNear) prompt = 'Cops too close to respray!';
          else if (ctx.police.stars > 0 || ctx.player.vehicle.recoloredRecently) {
            prompt = ctx.player.money >= 400 ? '<b>E</b> — Respray ($400, clears heat)' : 'Respray costs $400';
            if (ctx.player.money >= 400) action = () => ctx.police.respray(ctx.player.vehicle);
          }
        }
      }
    }
    // interactables registry (missions/stores/safehouse/givers)
    for (const it of ctx.interactables) {
      if (it.enabled === false) continue;
      const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
      if (d < (it.r ?? 3)) { prompt = it.prompt; action = it.action; break; }
    }
    ctx.hud.showPrompt(prompt);
    if (action && (input.hit('KeyE') || input.hit('KeyF'))) action();
  }

  // ---------------- CAMERA ----------------
  updateCamera(dt, input, deathCam) {
    const ctx = this.ctx;
    const sens = 0.0021 * ctx.settings.sensitivity;
    const invY = ctx.settings.invertY ? -1 : 1;
    if (input.locked || input._virtual.active) {
      this.camYaw -= input.mouse.dx * sens;
      this.camPitch += input.mouse.dy * sens * invY;
    }
    this.camPitch = clamp(this.camPitch, -0.55, 1.15);

    let target, dist, height;
    if (this.vehicle) {
      const v = this.vehicle;
      // chase cam: ease toward behind-car unless mouse recently moved
      const speedNorm = clamp(v.speed / v.spec.top, 0, 1);
      const behindYaw = v.heading + Math.PI + (v.forwardSpeed < -0.5 ? Math.PI : 0);
      // re-center strength grows with speed; mouse input temporarily overrides
      if (Math.abs(input.mouse.dx) > 0) this._camFree = 1.4;
      else this._camFree = Math.max(0, (this._camFree || 0) - dt);
      const blend = 1 - Math.exp(-dt * (1.6 + speedNorm * 4) * (this._camFree > 0 ? 0.15 : 1));
      let diff = wrapAngle((behindYaw) - this.camYaw);
      this.camYaw += diff * blend;
      target = _v2.set(v.pos.x - Math.sin(v.heading) * v.spec.len * 0.12, 1.15 + speedNorm * 0.3, v.pos.z - Math.cos(v.heading) * v.spec.len * 0.12);
      dist = 6.4 + speedNorm * 3.4;
      height = this.camPitch;
    } else {
      target = _v2.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      dist = this.aiming ? 2.35 : 5.0;
      height = this.camPitch;
    }

    // shake decay
    this._shake = Math.max(0, this._shake - dt * 1.6);

    const cosP = Math.cos(height);
    let cx = target.x + Math.sin(this.camYaw) * dist * cosP;
    let cz = target.z + Math.cos(this.camYaw) * dist * cosP;
    let cy = target.y + Math.sin(height) * dist + (this.vehicle ? 0.6 : 0.35);

    // wall probe: pull camera in if blocked
    const dx = cx - target.x, dz = cz - target.z;
    const distXZ = Math.hypot(dx, dz);
    if (distXZ > 0.001) {
      const nx = dx / distXZ, nz = dz / distXZ;
      const q = ctx._qtmp || (ctx._qtmp = []);
      ctx.colliders.query(target.x + nx * distXZ * 0.5, target.z + nz * distXZ * 0.5, distXZ * 0.5 + 1, q);
      let bestT = 1;
      for (const b of q) {
        // slab test along segment
        let tmin = 0, tmax = 1;
        if (Math.abs(nx) < 1e-8) { if (target.x < b.x0 || target.x > b.x1) continue; }
        else {
          let t1 = (b.x0 - target.x) / nx, t2 = (b.x1 - target.x) / nx;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (Math.abs(nz) < 1e-8) { if (target.z < b.z0 || target.z > b.z1) continue; }
        else {
          let t1 = (b.z0 - target.z) / nz, t2 = (b.z1 - target.z) / nz;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (tmax >= Math.max(tmin, 0) && tmin < bestT && tmin > 0.02) {
          if (target.y + (cy - target.y) * tmin < b.h) bestT = tmin;
        }
      }
      if (bestT < 1) {
        cx = target.x + dx * bestT * 0.92;
        cz = target.z + dz * bestT * 0.92;
        cy = target.y + (cy - target.y) * bestT * 0.92 + 0.4;
      }
    }

    const cam = ctx.camera;
    const k = 1 - Math.exp(-dt * 22);
    cam.position.x += (cx - cam.position.x) * k;
    cam.position.y += (cy - cam.position.y) * k;
    cam.position.z += (cz - cam.position.z) * k;

    if (deathCam) {
      // slow dramatic rise
      cam.position.y += dt * 2.2;
      this.camYaw += dt * 0.25;
    }

    const sx = (Math.random() - 0.5) * this._shake;
    const sy = (Math.random() - 0.5) * this._shake;
    cam.lookAt(target.x + sx, target.y + sy, target.z);
    cam.position.x += sx * 0.5; cam.position.y += sy * 0.5;
  }

  camShake(amount) { this._shake = Math.min(1, this._shake + amount); }
}
