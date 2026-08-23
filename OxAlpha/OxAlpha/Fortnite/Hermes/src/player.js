// ISLEBREAK player: third-person controller with sprint/slide/crouch/mantle/
// swim/glide, harvesting, building input, shooting, healing.
// Movement contract (unit-tested): yaw+ = LEFT turn; forward is -Z in yaw space.
import * as THREE from 'three';
import { PhysicsWorld } from './physics.js';
import { CameraRig } from './camera.js';
import { createCharacter, createWeaponProp, animateCharacter } from './character.js';
import { WEAPONS, HEALS } from './weapons.js';
import { BuildSystem, GRID, WALL_H, BUILD_COST } from './build.js';
import { WORLD } from './world.js';

const WALK = 5.4, RUN = 8.2, SPRINT = 10.6;
const JUMP_V = 8.8;
// Asymmetric gravity: readable jump arc on the way up, snappy slam on the way down
const GRAVITY_RISE = 26;
const GRAVITY_FALL = 46;
const FALL_TERMINAL = -58;
const CROUCH_SPEED = 3.2;
const SLIDE_BOOST = 13.5, SLIDE_FRICTION = 6.5, SLIDE_MIN = 2.2, SLIDE_TIME_MAX = 0.85;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 60, 0);
    this.vel = new THREE.Vector3();
    this.radius = 0.42;
    this.height = 1.75;
    this.yaw = 0;              // facing
    this.hp = 100; this.shield = 0;
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.alive = true;
    this.name = 'YOU';
    this.isPlayer = true;
    this.safeZoneImmune = false;
    this.inStorm = false;

    // state machine: lobby | skydive | glide | ground
    this.mode = 'lobby';
    this.crouch = false;
    this.sliding = false;
    this.slideT = 0;
    this.sprint = false;
    this.onGround = false;
    this.airborne = false;
    this.swimming = false;
    this.mantleCd = 0;

    // combat
    this.fireCd = 0;
    this.reloadT = 0;
    this.ads = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.harvestSwing = 0;
    this.harvestTarget = null;
    this.healItem = null;
    this.healT = 0;

    // build selection
    this.buildMode = null;      // null | wall | floor | ramp | cone
    this.buildDir = 0;
    this.buildRotate = 0;
    this.editTarget = null;
    this.lastBuildAt = 0;
    this.turboHeld = false;

    this.rig = createCharacter({ suit: 0x2a3a55 });
    this.mesh = this.rig;
    this.weaponHolder = new THREE.Group();
    this.mesh.add(this.weaponHolder);
    this.weaponProp = null;
    this.pickaxe = createPickaxe();
    this.pickaxe.visible = false;
    this.mesh.add(this.pickaxe);

    this.camRig = new CameraRig(game.camera);
    this.camRig.collideFn = (from, to, r) => game.cameraCollide(from, to, r);
    // keep the orbit camera above the ground
    this.camRig.terrainH = (x, z) => game.island.height(x, z);
    // occluded camera: tuck the body away so it doesn't fill the screen
    this.camRig.tooCloseDist = 2.6;
    this.camRig.onTooClose = (close) => { if (this.alive) this.mesh.visible = !close; };
  }

  terrainH(x, z) { return this.game.island.height(x, z); }

  spawnDropFrom(bargePos) {
    this.mode = 'skydive';
    this.pos.copy(bargePos);
    this.pos.y -= 3;
    this.vel.set(0, -14, 0);
  }

  applyDamage(dmg, source, tag) {
    if (!this.alive) return;
    let d = dmg;
    if (this.shield > 0 && tag !== 'storm') {
      const absorbed = Math.min(this.shield, d);
      this.shield -= absorbed; d -= absorbed;
    }
    this.hp -= d;
    this.game.hud.damageFlash(tag === 'storm' ? 'storm' : source ? source.name : 'hit');
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(source);
    }
  }

  die(source) {
    if (!this.alive) return;
    this.alive = false;
    this.mode = 'dead';
    this.game.onPlayerDeath(source);
  }

  healFinish() {
    const it = this.healItem;
    if (!it) return;
    const def = HEALS[it.id];
    if (def.hp) {
      if (def.full) this.hp = 100;
      else this.hp = Math.min(def.cap ?? 100, this.hp + def.hp);
    }
    if (def.sh) this.shield = Math.min(100, this.shield + def.sh);
    it.count--;
    if (it.count <= 0) {
      const i = this.game.inv.slots.indexOf(it);
      if (i >= 0) this.game.inv.slots[i] = null;
    }
    this.healItem = null;
  }

  // ---------------- main update ----------------
  update(dt, input) {
    if (!this.alive) return;
    const g = this.game;
    this.fireCd -= dt;
    this.mantleCd -= dt;

    if (this.mode === 'skydive') {
      this.updateSkydive(dt, input);
      return;
    }
    if (this.mode === 'glide') {
      this.updateGlide(dt, input);
      return;
    }
    if (this.mode !== 'ground') return;

    // ----- look -----
    const [dyaw, dpitch] = input.consumeLook(this.ads ? 0.62 : 1);
    this.camRig.addLook(dyaw, dpitch);
    this.recoilPitch *= Math.pow(0.001, dt);
    this.recoilYaw *= Math.pow(0.001, dt);
    this.camRig.pitch += this.recoilPitch * dt * 30 * 0; // recoil applied at fire time instead

    // ----- movement intent (relative to camera yaw) -----
    const fx = -Math.sin(this.camRig.yaw), fz = -Math.cos(this.camRig.yaw);
    // NOTE: (rx,rz) = (-cos, sin) is the LEFT-hand vector for forward=(-sin,-cos).
    const rx = -Math.cos(this.camRig.yaw), rz = Math.sin(this.camRig.yaw);
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += fx; mz += fz; }   // W = FORWARD
    if (input.down('KeyS')) { mx -= fx; mz -= fz; }   // S = BACKWARD
    if (input.down('KeyA')) { mx += rx; mz += rz; }   // A = LEFT (rx,rz points left)
    if (input.down('KeyD')) { mx -= rx; mz -= rz; }   // D = RIGHT
    const moving = (mx || mz);
    if (moving) { const il = 1 / Math.hypot(mx, mz); mx *= il; mz *= il; }

    // water check
    const th = this.terrainH(this.pos.x, this.pos.z);
    this.swimming = th < WORLD.waterLevel - 1.2 && this.pos.y < WORLD.waterLevel + 0.4;

    // slide trigger
    if (input.hit('KeyC') && !this.sliding && this.onGround && !this.crouch) {
      const hspd = Math.hypot(this.vel.x, this.vel.z);
      if (hspd > 7 || input.down('ShiftLeft')) {
        this.sliding = true; this.slideT = 0;
        const bs = Math.max(hspd, SLIDE_BOOST);
        const dirx = moving ? mx : fx, dirz = moving ? mz : fz;
        this.vel.x = dirx * bs; this.vel.z = dirz * bs;
      } else {
        this.crouch = !this.crouch;
      }
    }
    if (this.sliding) {
      this.slideT += dt;
      this.vel.x -= this.vel.x * SLIDE_FRICTION * dt;
      this.vel.z -= this.vel.z * SLIDE_FRICTION * dt;
      if (this.slideT > SLIDE_TIME_MAX || Math.hypot(this.vel.x, this.vel.z) < SLIDE_MIN || !this.onGround) {
        this.sliding = false;
      }
    } else {
      this.sprint = input.down('ShiftLeft') && moving && !this.ads;
      this.crouch = input.down('ControlLeft') || input.down('KeyC');
      let target = WALK;
      if (this.crouch) target = CROUCH_SPEED;
      else if (this.sprint) target = SPRINT;
      else if (moving) target = RUN;
      if (this.ads) target = Math.min(target, RUN * 0.72);
      if (this.healItem) target = Math.min(target, WALK * 0.5);
      // accel toward target velocity
      const acc = this.onGround ? 42 : 16;
      const tx = mx * target, tz = mz * target;
      this.vel.x += (tx - this.vel.x) * Math.min(1, acc * dt / Math.max(target, 4));
      this.vel.z += (tz - this.vel.z) * Math.min(1, acc * dt / Math.max(target, 4));
    }

    // jump / swim up
    if (this.swimming) {
      this.vel.y += ((input.down('Space') ? 6 : -1.5) - this.vel.y * 1.6) * dt * 4;
      this.vel.x *= 0.96; this.vel.z *= 0.96;
      this.pos.y = Math.min(this.pos.y, WORLD.waterLevel - 0.2);
    } else {
      if (input.hit('Space') && this.onGround) {
        this.vel.y = JUMP_V;
        this.onGround = false;
        g.audio?.play('jump');
      }
      const grav = this.vel.y > 0 ? GRAVITY_RISE : GRAVITY_FALL;
      this.vel.y = Math.max(this.vel.y - grav * dt, FALL_TERMINAL);
    }

    // integrate with collision
    const body = { pos: this.pos, vel: this.vel, radius: this.radius, height: this.crouch || this.sliding ? 1.15 : this.height };
    const res = g.physics.moveBody(body, dt);

    // ground snap via builds/terrain
    const stepUp = 0.65;
    const gh = Math.max(
      this.terrainH(this.pos.x, this.pos.z),
      g.builds.surfaceAt(this.pos.x, this.pos.z, this.pos.y)
    );
    if (this.vel.y <= 0.01 && this.pos.y <= gh + (res.onGround ? 0.05 : 0.12)) {
      this.pos.y = gh;
      this.vel.y = 0;
      res.onGround = true;
    }
    this.onGround = res.onGround;
    this.airborne = !this.onGround && !this.swimming;

    // mantle: jump held against a chest-high obstacle ahead
    if (!this.onGround && this.vel.y > 0 && input.down('Space') && this.mantleCd <= 0) {
      const aheadX = this.pos.x + fx * 1.0, aheadZ = this.pos.z + fz * 1.0;
      const ghAhead = Math.max(this.terrainH(aheadX, aheadZ), g.builds.surfaceAt(aheadX, aheadZ, this.pos.y + 0.9));
      if (ghAhead > this.pos.y + 0.5 && ghAhead < this.pos.y + 1.9) {
        this.pos.y = ghAhead + 0.05;
        this.vel.y = Math.max(this.vel.y, 2.5);
        this.mantleCd = 0.6;
      }
    }

    // world bounds
    const lim = WORLD.half - 20;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);

    // drowning damage
    if (this.swimming && this.pos.y < WORLD.waterLevel - 1.4) this.applyDamage(2 * dt, null, 'storm');

    this.updateCombat(dt, input, g);
    this.updateBuildEdit(dt, input, g);
    this.updateHarvest(dt, input, g);
    this.updateInteract(dt, input, g);
    if (this.healItem) {
      this.healT += dt;
      if (this.healT >= HEALS[this.healItem.id].time) this.healFinish();
    }
  }

  updateSkydive(dt, input) {
    const g = this.game;
    const [dyaw, dpitch] = input.consumeLook(0.8);
    this.camRig.addLook(dyaw, dpitch);
    // steer with WASD relative to camera yaw
    const fx = -Math.sin(this.camRig.yaw), fz = -Math.cos(this.camRig.yaw);
    const rx = -Math.cos(this.camRig.yaw), rz = Math.sin(this.camRig.yaw);
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += fx; mz += fz; }
    if (input.down('KeyS')) { mx -= fx; mz -= fz; }
    if (input.down('KeyA')) { mx += rx; mz += rz; }   // LEFT
    if (input.down('KeyD')) { mx -= rx; mz -= rz; }   // RIGHT
    const steer = 22;
    this.vel.x += mx * steer * dt;
    this.vel.z += mz * steer * dt;
    const hspd = Math.hypot(this.vel.x, this.vel.z);
    const maxH = 38;
    if (hspd > maxH) { this.vel.x *= maxH / hspd; this.vel.z *= maxH / hspd; }
    this.vel.y = Math.max(this.vel.y - 26 * dt, -52);
    this.pos.addScaledVector(this.vel, dt);
    const th = this.terrainH(this.pos.x, this.pos.z);
    const deployY = th + 46;
    if (this.pos.y <= deployY || input.hit('Space')) {
      this.mode = 'glide';
      g.audio?.play('glide');
    }
  }

  updateGlide(dt, input) {
    const g = this.game;
    const [dyaw, dpitch] = input.consumeLook(0.8);
    this.camRig.addLook(dyaw, dpitch);
    const fx = -Math.sin(this.camRig.yaw), fz = -Math.cos(this.camRig.yaw);
    const rx = -Math.cos(this.camRig.yaw), rz = Math.sin(this.camRig.yaw);
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += fx; mz += fz; }
    if (input.down('KeyS')) { mx -= fx; mz -= fz; }
    if (input.down('KeyA')) { mx += rx; mz += rz; }   // LEFT
    if (input.down('KeyD')) { mx -= rx; mz -= rz; }   // RIGHT
    const glideSpeed = 18.5;
    const tx = mx * glideSpeed, tz = mz * glideSpeed;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * 2.2);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * 2.2);
    const dive = input.down('ShiftLeft');
    const targetVy = dive ? -26 : -9;
    this.vel.y += (targetVy - this.vel.y) * Math.min(1, dt * 2.6);
    this.pos.addScaledVector(this.vel, dt);
    const th = this.terrainH(this.pos.x, this.pos.z);
    const landY = Math.max(th, WORLD.waterLevel - 0.4);
    if (this.pos.y <= landY + 0.2) {
      this.pos.y = landY;
      this.mode = 'ground';
      this.vel.y = 0;
      g.audio?.play('land');
      g.onLanded?.();
    }
    void rx; void rz;
  }

  updateCombat(dt, input, g) {
    const slot = g.inv.current();
    const def = g.inv.weaponDef();

    // ADS state
    const wantAds = input.buttons[2] && def && !this.buildMode;
    this.ads = !!wantAds;

    // weapon switching
    for (let i = 1; i <= 5; i++) {
      if (input.hit('Digit' + i)) { g.inv.sel = i - 1; this.cancelHeal(); this.equipVisual(); }
    }
    if (input.wheelDelta !== 0) {
      g.inv.sel = (g.inv.sel + (input.wheelDelta > 0 ? 1 : -1) + 5) % 5;
      input.wheelDelta = 0;
      this.cancelHeal(); this.equipVisual();
    }

    // reload
    if (input.hit('KeyR') && def && this.reloadT <= 0) this.startReload(def);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0 && def) {
        const s = g.inv.current();
        const need = def.mag - s.ammoInMag;
        const have = g.inv.ammo[def.ammo];
        const take = Math.min(need, have);
        s.ammoInMag += take;
        g.inv.ammo[def.ammo] -= take;
        g.audio?.play('reloadDone');
      }
    }

    // healing cancel on fire
    const wantFire = input.buttons[0];
    if (wantFire && this.healItem) { this.cancelHeal(); return; }

    // use heal (slot has heal item & press fire or E? -> fire uses item when heal selected)
    if (wantFire && slot && slot.kind === 'heal' && !def) {
      if (!this.healItem) this.startHeal(slot);
      return;
    }

    // pickaxe mode (no weapon selected / slot empty)
    if (!def) {
      if (wantFire) this.swingPickaxe(g);
      this.harvesting = this.wantHarvestHold && wantFire;
      return;
    }
    this.harvesting = false;

    // firing
    if (this.reloadT > 0) return;
    const canFire = def.auto ? wantFire : (wantFire && !this._fireHeldLast);
    this._fireHeldLast = wantFire;
    if (canFire && this.fireCd <= 0) {
      const s = g.inv.current();
      if (s.ammoInMag <= 0) {
        this.startReload(def);
      } else {
        s.ammoInMag--;
        this.fireCd = 60 / def.rpm;
        g.combat.fireHitscanOrProjectile(this, def);
        this.recoilPitch += def.recoil;
        this.camRig.pitch += def.recoil * (this.ads ? 0.7 : 1);
        this.camRig.yaw += (Math.random() - 0.5) * def.recoil * 0.5;
        g.audio?.play('shoot', def.cls);
      }
    }
  }

  startReload(def) {
    const s = this.game.inv.current();
    if (!s || s.kind !== 'weapon') return;
    if (s.ammoInMag >= def.mag) return;
    if (this.game.inv.ammo[def.ammo] <= 0) return;
    this.reloadT = def.reload;
    this.game.audio?.play('reloadStart');
  }
  startHeal(slot) {
    const def = HEALS[slot.id];
    if (def.hp && this.hp >= (def.cap ?? 100) && !def.sh) return;
    if (def.sh && this.shield >= 100) return;
    this.healItem = slot;
    this.healT = 0;
    this.game.audio?.play('healStart');
  }
  cancelHeal() { this.healItem = null; this.healT = 0; }

  swingPickaxe(g) {
    if (this.harvestSwing > 0) return;
    this.harvestSwing = 0.45;
    this.wantHarvestHold = true;
    setTimeout(() => { this.wantHarvestHold = false; }, 200);
    g.audio?.play('swing');
    // hit detection at swing midpoint
    setTimeout(() => g.combat.pickaxeHit(this), 180);
  }

  updateHarvest(dt, input, g) {
    this.harvestSwing = Math.max(0, this.harvestSwing - dt);
  }

  // ---------------- building ----------------
  updateBuildEdit(dt, input, g) {
    // toggle modes with Z/X/C/V or F1-F4 style: we use keys Z X C V (C shared with crouch? no—use F-keys alt)
    // Controls: Q = cycle piece, E reserved interact, so:
    //   B toggles build mode; while in build mode:
    //     1/2/3/4 select wall/floor/ramp/cone
    //     R rotates ramp dir; click places; right-click cancels to weapon
    if (input.hit('KeyB')) {
      this.buildMode = this.buildMode ? null : 'wall';
      if (this.buildMode) this.selectTierIfNeeded(g);
      g.audio?.play('uiClick');
    }
    if (this.buildMode) {
      if (input.hit('Digit1')) this.buildMode = 'wall';
      if (input.hit('Digit2')) this.buildMode = 'floor';
      if (input.hit('Digit3')) this.buildMode = 'ramp';
      if (input.hit('Digit4')) this.buildMode = 'cone';
      // tier cycling with T
      if (input.hit('KeyT')) this.cycleTier(g);
      if (input.hit('KeyR')) this.buildRotate = (this.buildRotate + 1) % 4;
      this.updatePreviewAndPlace(input, g);
      return;
    }
    // editing owned walls: G key targets the wall you're looking at
    if (input.hit('KeyG') && this.editCooldown <= 0) {
      const hit = g.combat.rayWorld(this.eyePos(), this.lookDir(), 5.2, (box) => box.ref?.build && box.ref.build.owner === this);
      if (hit && hit.box.ref.build.type === 'wall') {
        g.builds.editWall(hit.box.ref.build);
        g.audio?.play('edit');
        this.editCooldown = 0.25;
      }
    }
    this.editCooldown = (this.editCooldown || 0) - dt;
  }

  selectTierIfNeeded(g) { /* tier = most abundant material */ }
  cycleTier(g) {
    const order = ['wood', 'brick', 'metal'];
    const cur = order.indexOf(this.buildTier || 'wood');
    this.buildTier = order[(cur + 1) % 3];
    g.audio?.play('uiClick');
  }

  eyePos(out) {
    out = out || new THREE.Vector3();
    return out.set(this.pos.x, this.pos.y + 1.58, this.pos.z);
  }
  lookDir(out) {
    out = out || new THREE.Vector3();
    return this.camRig.forward(out);
  }

  computeBuildCell() {
    // place one cell ahead of player based on look direction + pitch
    const f = this.lookDir();
    const px = this.pos.x + f.x * GRID * 0.9;
    const pz = this.pos.z + f.z * GRID * 0.9;
    const py = this.pos.y + 1.2 + f.y * GRID * 0.55;
    const gx = Math.round(px / GRID), gz = Math.round(pz / GRID);
    let gy = Math.round(py / WALL_H);
    gy = Math.max(0, gy);
    // dir: dominant horizontal look axis
    const ax = Math.abs(f.x), az = Math.abs(f.z);
    let dir = 0;
    if (ax > az) dir = f.x > 0 ? 1 : 3;  // +X east, -X west
    else dir = f.z > 0 ? 2 : 0;          // +Z south, -Z north
    return { gx, gy, gz, dir, ok: true };
  }

  updatePreviewAndPlace(input, g) {
    const cell = this.computeBuildCell();
    const type = this.buildMode;
    const dir = (type === 'ramp' || type === 'wall') ? (cell.dir + this.buildRotate) % 4 : 0;
    const occupied = g.builds.occupied(type, cell.gx, cell.gy, cell.gz);
    const buried = g.builds.buried((x, z) => this.game.island.height(x, z), type, cell.gx, cell.gy, cell.gz);
    const matType = this.buildTier || this.bestMat(g);
    const canPay = g.inv.mats[matType] >= BUILD_COST;
    const ok = !occupied && !buried && canPay;
    g.builds.setPreview(type, cell.gx, cell.gy, cell.gz, dir, ok, this.game.island.height);
    this.previewCell = { ...cell, dir, type };
    const wantPlace = input.buttons[0] && (this.turboHeld || !this._placeHeldLast);
    this._placeHeldLast = input.buttons[0];
    if (wantPlace && ok) {
      const piece = g.builds.place(type, matType, cell.gx, cell.gy, cell.gz, dir, this);
      if (piece) {
        g.inv.mats[matType] -= BUILD_COST;
        g.audio?.play('build', matType);
      }
    }
    // exit build mode on right click
    if (input.buttonPressed[2]) { this.buildMode = null; g.builds.clearPreview(); }
  }

  bestMat(g) {
    const m = g.inv.mats;
    return m.brick >= m.wood && m.brick >= m.metal ? 'brick' : (m.metal > m.wood ? 'metal' : 'wood');
  }

  updateInteract(dt, input, g) {
    if (!input.hit('KeyE')) return;
    const chest = g.loot.nearestChest(this.pos, 2.6);
    if (chest) {
      g.loot.openChest(chest, g.inv);
      g.audio?.play('chestOpen');
      return;
    }
    const drop = g.loot.nearestDrop(this.pos, 2.2);
    if (drop) this.tryTake(drop);
  }

  tryTake(drop) {
    const inv = this.game.inv;
    const it = drop.item;
    if (it.kind === 'weapon') {
      const cur = inv.current();
      // auto-pickup if empty hand or better rarity swap hint
      const emptyIdx = inv.slots.findIndex(s => !s);
      inv.addWeapon(it.id);
      this.equipVisual();
    } else if (it.kind === 'heal') {
      inv.addHeal(it.id, it.count || 1);
    } else if (it.kind === 'ammo') {
      inv.addAmmo(it.type, it.n);
    } else if (it.kind === 'mat') {
      inv.addMat(it.type, it.n);
    }
    this.game.loot.takeDrop(drop);
    this.game.audio?.play('pickup');
    this.game.hud.showPickup(it);
  }

  equipVisual() {
    const def = this.game.inv.weaponDef();
    if (this.weaponProp) {
      this.weaponHolder.remove(this.weaponProp);
      this.weaponProp = null;
    }
    this.pickaxe.visible = !def && !this.buildMode;
    if (def) {
      this.weaponProp = createWeaponProp(def);
      this.weaponHolder.add(this.weaponProp);
    }
  }

  syncMesh(dt) {
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    // face movement or camera
    const hspd = Math.hypot(this.vel.x, this.vel.z);
    let faceYaw = this.camRig.yaw;
    if (hspd > 0.5 && !this.ads) {
      const moveYaw = Math.atan2(-this.vel.x, -this.vel.z);
      faceYaw = moveYaw;
    }
    // smooth rotate character toward target
    let d = faceYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 14);
    this.mesh.rotation.y = this.yaw;
    animateCharacter(this.rig.userData.rig, {
      speed: hspd,
      airborne: this.airborne,
      sliding: this.sliding,
      aiming: this.ads,
      firing: this.fireCd > 0.02,
      harvesting: this.harvestSwing > 0,
    }, dt, performance.now() / 1000);
    // weapon holder aims with pitch
    if (this.weaponProp) {
      this.weaponHolder.position.set(0.34, 1.28, -0.28);
      this.weaponHolder.rotation.x = -this.camRig.pitch * 0.7;
    }
    this.pickaxe.visible = !this.weaponProp && !this.buildMode;
  }
}

function createPickaxe() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x6e452a, roughness: 0.9 })
  );
  g.add(handle);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.09, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.4, metalness: 0.7 })
  );
  head.position.y = 0.42;
  g.add(head);
  g.position.set(0.36, 1.1, -0.3);
  g.rotation.z = 0.5;
  return g;
}
