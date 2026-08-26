import * as THREE from 'three';
import { CFG, CONSUMABLES as CONS } from './config.js';
import { S } from './state.js';
import { input, down, pressed } from './input.js';
import { colliders, groundAt, rayCast, damageHarvest, panelDamage } from './world.js';
import { PICKAXE, WEAPONS, rarityMult, tryFire, startReload, updateReload } from './weapons.js';
import { enterBuild, exitBuild, placePiece, cycleMaterial, editAimedPiece, updateGhost } from './building.js';
import { nearestInteractable, openChest, openAmmoBox, pickupItem, selectSlot } from './loot.js';
import { sfx } from './audio.js';
import { spawnParticles } from './fx.js';

const UP = new THREE.Vector3(0, 1, 0);

export function createPlayer(scene, camera) {
  const model = buildPlayerModel();
  scene.add(model.group);

  const p = {
    scene, camera, model,
    pos: new THREE.Vector3(0, 40, 0),
    vel: new THREE.Vector3(),
    yaw: Math.PI, pitch: -0.08,
    yawTarget: null,
    grounded: false,
    crouch: false,
    sliding: false,
    slideT: 0,
    swim: false,
    ads: false,
    bloom: 0,
    fireCooldown: 0,
    reloading: false,
    reloadT: 0,
    sel: 1,
    slots: [ { cat: 'pickaxe' }, null, null, null, null, null ],
    ammo: { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 },
    mats: { wood: CFG.START_WOOD, brick: 0, metal: 0 },
    hp: 100,
    shield: 0,
    casting: null,
    swingT: 0,
    footTimer: 0,
    peakY: 0,
    fallPeak: 0,
    wasAirborne: false,
    god: false,
    dead: false,
    state: 'alive',
    buildCooldown: 0,
    lastPlaceCell: '',
    velLen: 0,
    kills: 0,

    alive() { return !this.dead; },
    get activeWeaponDef() {
      const it = this.slots[this.sel];
      return it && it.cat === 'weapon' ? WEAPONS[it.defId] : null;
    },
    get activeWeaponRarityMult() {
      const it = this.slots[this.sel];
      return it && it.cat === 'weapon' ? rarityMult(it.rarity) : 1;
    },
    headPos(out = new THREE.Vector3()) {
      const eyeH = this.crouch || this.sliding ? CFG.CROUCH_EYE : CFG.EYE_H;
      return out.set(this.pos.x, this.pos.y + eyeH, this.pos.z);
    },
    lookDir(out = new THREE.Vector3()) {
      const cp = Math.cos(this.pitch);
      return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    },
    flatForward(out = new THREE.Vector3()) {
      return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    },
    rightVec(out = new THREE.Vector3()) {
      const f = this.flatForward(new THREE.Vector3());
      return out.copy(f).cross(UP).normalize();
    },
    damage(amount, source) {
      if (this.dead || this.god) return;
      let rem = amount;
      if (this.shield > 0) {
        const absorbed = Math.min(this.shield, rem);
        this.shield -= absorbed;
        rem -= absorbed;
      }
      this.hp -= rem;
      S.emit('playerHurt', { amount });
      sfx.hurt();
      if (this.hp <= 0) {
        this.hp = 0;
        this.die(source);
      }
      S.emit('vitals');
    },
    heal(hp, capHp) {
      this.hp = Math.min(Math.max(capHp ?? 100, this.hp), this.hp + hp);
      if (capHp !== undefined && this.hp > capHp) this.hp = capHp;
      S.emit('vitals');
    },
    addShield(amount, capShield) {
      const cap = capShield ?? 100;
      this.shield = Math.min(cap, this.shield + amount);
      if (this.shield > 100) this.shield = 100;
      S.emit('vitals');
    },
    die(source) {
      if (this.dead) return;
      this.dead = true;
      this.state = 'dead';
      S.match.placement = S.match.alive;
      S.match.alive--;
      S.emit('playerDied', { source });
    },
  };

  S.player = p;
  return p;
}

function buildPlayerModel() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x4a86c8, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3e58, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ color: 0xd9b38c, roughness: 0.9 });

  const bodyGeo = new THREE.CapsuleGeometry(0.32, 0.72, 4, 10);
  const body = new THREE.Mesh(bodyGeo, skin);
  body.position.y = 0.95;
  body.castShadow = true;

  const headGeo = new THREE.SphereGeometry(0.24, 12, 10);
  const head = new THREE.Mesh(headGeo, face);
  head.position.y = 1.62;
  head.castShadow = true;

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.64;

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 3, 8), dark);
  legL.position.set(-0.16, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;

  const armGroup = new THREE.Group();
  armGroup.position.set(0.34, 1.32, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.44, 3, 8), skin);
  arm.position.y = -0.28;
  arm.rotation.x = -Math.PI / 2;
  armGroup.add(arm);
  const heldAnchor = new THREE.Group();
  heldAnchor.position.set(0, -0.5, -0.35);
  armGroup.add(heldAnchor);

  group.add(body, head, helmet, legL, legR, armGroup);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1.4, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8e8f4, side: THREE.DoubleSide })
  );
  canopy.position.y = 3.4;
  canopy.visible = false;
  group.add(canopy);
  return { group, body, head, legL, legR, armGroup, heldAnchor, canopy };
}

const gunMat = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.5, metalness: 0.6 });
const gunAccent = new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.7 });

export function updateHeldModel(p) {
  const anchor = p.model.heldAnchor;
  while (anchor.children.length) anchor.remove(anchor.children[0]);
  const item = p.slots[p.sel];
  if (!item || item.cat === 'pickaxe') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a48 }));
    handle.rotation.z = Math.PI / 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.06), gunAccent);
    blade.position.set(-0.5, 0, 0);
    anchor.add(handle, blade);
  } else if (item.cat === 'weapon') {
    const len = item.defId === 'sniper' ? 1.25 : item.defId === 'shotgun' ? 1.0 : item.defId === 'rocket' ? 1.3 : 0.85;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.13, 0.13), gunMat);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), gunMat);
    stock.position.set(-len / 2 + 0.05, -0.08, 0);
    anchor.add(barrel, stock);
    if (item.defId === 'rocket') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, len, 8), gunMat);
      tube.rotation.z = Math.PI / 2;
      barrel.visible = false;
      anchor.add(tube);
    }
  } else if (item.cat === 'consumable') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({
      color: item.id.includes('Shield') ? 0x57c9ff : 0xf26d6d, emissive: 0x224455, roughness: 0.3,
    }));
    anchor.add(b);
  }
}

export function updatePlayer(p, dt) {
  if (p.dead) {
    updateCamera(p, dt, true);
    return;
  }

  const st = S.match.state;
  if (st !== p._lastState) {
    if (st === 'playing') {
      p.fallPeak = p.pos.y;
      p.vel.set(0, 0, 0);
      p.grounded = false;
    }
    p._lastState = st;
  }

  if (st === 'playing') {
    handleLook(p);
    handleActions(p, dt);
    handleMovement(p, dt);
  } else if (st === 'bus' || st === 'freefall') {
    handleLook(p);
  }
  updateCasting(p, dt);
  updateCamera(p, dt);
  syncModel(p, dt);
}

function handleLook(p) {
  const sens = 0.0022 * S.settings.sens;
  let dx = input.dx;
  let dy = input.dy;
  input.dx = 0; input.dy = 0;
  if (S.settings.invertX) dx = -dx;
  if (S.settings.invertY) dy = -dy;
  p.yaw -= dx * sens;
  p.pitch -= dy * sens;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
}

function handleMovement(p, dt) {
  const f = p.flatForward(new THREE.Vector3());
  const r = new THREE.Vector3().copy(f).cross(UP).normalize();

  let ix = 0, iz = 0;
  if (down('KeyW')) iz += 1;
  if (down('KeyS')) iz -= 1;
  if (down('KeyD')) ix += 1;
  if (down('KeyA')) ix -= 1;

  const wantSprint = down('ShiftLeft') || down('ShiftRight');
  const wantCrouch = down('ControlLeft') || down('KeyC');

  const terrainH = groundAtSafeFast(p.pos.x, p.pos.z);
  const inWaterDepth = CFG.WATER_Y - terrainH;
  p.swim = inWaterDepth > 1.1 && p.pos.y < CFG.WATER_Y + 0.4;

  if (p.sliding) {
    p.slideT -= dt;
    if (p.slideT <= 0 || !p.grounded) p.sliding = false;
  }

  if (!p.swim) {
    if (wantCrouch && wantSprint && p.grounded && !p.crouch && !p.sliding && p.velLen > 6) {
      p.sliding = true;
      p.slideT = 0.8;
      sfx.jump();
    }
    p.crouch = (wantCrouch && !p.sliding) || p.sliding;
  } else {
    p.crouch = false;
    p.sliding = false;
  }

  let speed = p.swim ? CFG.SWIM_SPEED
    : p.crouch ? CFG.CROUCH_SPEED
    : wantSprint ? CFG.SPRINT
    : CFG.WALK;
  if (p.ads) speed *= 0.62;
  if (p.casting) speed *= 0.45;
  if (p.sliding) speed = Math.max(4, 11 * (p.slideT / 0.8));

  const move = new THREE.Vector3();
  if (ix || iz) {
    move.addScaledVector(f, iz).addScaledVector(r, ix);
    move.normalize();
  }
  if (p.swim) {
    p.vel.x = dampTo(p.vel.x, move.x * speed, 6, dt);
    p.vel.z = dampTo(p.vel.z, move.z * speed, 6, dt);
    const surfaceY = CFG.WATER_Y - 0.35;
    if (down('Space')) p.vel.y = 2.4;
    else if (down('ControlLeft') || down('KeyC')) p.vel.y = -2.6;
    else p.vel.y = dampTo(p.vel.y, (surfaceY - p.pos.y) * 3, 4, dt);
    p.grounded = false;
  } else {
    const accel = p.grounded ? 42 : 12;
    p.vel.x = dampTo(p.vel.x, move.x * speed, accel / 7, dt);
    p.vel.z = dampTo(p.vel.z, move.z * speed, accel / 7, dt);
    if (pressed('Space')) {
      if (tryMantle(p)) {
      } else if (p.grounded) {
        p.vel.y = CFG.JUMP_V;
        p.grounded = false;
        sfx.jump();
      }
    }
    p.vel.y -= CFG.GRAVITY * dt;
    if (p.sliding) {
      p.vel.x *= 1 - 0.6 * dt;
      p.vel.z *= 1 - 0.6 * dt;
    }
  }

  const prevPos = p.pos.clone();
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  const hitInfo = resolveHorizontalCollisions(p);
  p.pos.y += p.vel.y * dt;

  const g = groundAt(p.pos.x, p.pos.z, p.pos.y);
  const wasGrounded = p.grounded;
  if (!p.swim) {
    if (p.pos.y <= g + 0.02 && p.vel.y <= 0.01) {
      if (!wasGrounded && p.fallPeak - p.pos.y > 8.5 && !hitInfo.mantled) {
        const dmg = (p.fallPeak - p.pos.y - 8.5) * 6;
        if (dmg > 1) p.damage(dmg, 'fall');
      }
      if (!wasGrounded && p.fallPeak - p.pos.y > 2) sfx.land();
      p.pos.y = g;
      p.vel.y = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
      if (p.pos.y < terrainH - 30) {
        p.damage(1000, 'void');
      }
    }
  }

  if (p.grounded || p.swim) p.fallPeak = p.pos.y;
  else p.fallPeak = Math.max(p.fallPeak, p.pos.y);

  const islandEdge = Math.hypot(p.pos.x, p.pos.z);
  if (islandEdge > 520) {
    p.pos.multiplyScalar(520 / islandEdge);
  }

  p.velLen = Math.hypot(p.vel.x, p.vel.z);
  if ((p.grounded || p.swim) && p.velLen > 1.5) {
    p.footTimer -= dt * p.velLen;
    if (p.footTimer <= 0) {
      p.footTimer = 3.2;
      import('./audio.js').then(a => {});
    }
  }

  if (hitInfo.pushed && p.velLen > 0.5) {
    spawnParticles(prevPos, { count: 1, color: 0xdddddd, speed: 1, life: 0.2, size: 0.2, gravity: 0 });
  }
}

function tryMantle(p) {
  const f = p.flatForward(new THREE.Vector3());
  const probe = p.pos.clone().addScaledVector(f, 0.75);
  const objs = [];
  colliders.query(probe.x, probe.z, 1.2, objs);
  let bestTop = -Infinity;
  for (const o of objs) {
    if (o.dead) continue;
    const bb = o.aabb;
    if (probe.x >= bb.min.x - 0.3 && probe.x <= bb.max.x + 0.3 && probe.z >= bb.min.z - 0.3 && probe.z <= bb.max.z + 0.3) {
      if (bb.max.y > p.pos.y + 0.4 && bb.max.y < p.pos.y + 1.9) {
        bestTop = Math.max(bestTop, bb.max.y);
      }
    }
  }
  if (bestTop > -Infinity) {
    p.pos.set(probe.x, bestTop, probe.z);
    p.vel.y = Math.max(p.vel.y, 2.5);
    p.grounded = false;
    sfx.jump();
    return true;
  }
  return false;
}

function resolveHorizontalCollisions(p) {
  const res = { pushed: false, mantled: false };
  const objs = [];
  colliders.query(p.pos.x, p.pos.z, 1.4, objs);
  const feet = p.pos.y + 0.35;
  const headY = p.pos.y + (p.crouch ? 1.2 : 1.8);
  for (let iter = 0; iter < 2; iter++) {
    for (const o of objs) {
      if (o.dead) continue;
      const bb = o.aabb;
      if (bb.max.y <= feet + 0.25 || bb.min.y >= headY) continue;
      if (o.type === 'build' && (o.gkind === 'ramp')) continue;
      const cx = Math.max(bb.min.x, Math.min(p.pos.x, bb.max.x));
      const cz = Math.max(bb.min.z, Math.min(p.pos.z, bb.max.z));
      const dx = p.pos.x - cx, dz = p.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      const rr = CFG.PLAYER_R;
      if (d2 < rr * rr) {
        if (d2 < 1e-8) {
          p.pos.x += rr;
          res.pushed = true;
          continue;
        }
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        p.pos.x += dx * push;
        p.pos.z += dz * push;
        res.pushed = true;
        const vDotN = p.vel.x * dx + p.vel.z * dz;
        if (vDotN < 0) {
          p.vel.x -= dx / d * vDotN;
          p.vel.z -= dz / d * vDotN;
        }
      }
    }
  }
  return res;
}

function dampTo(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}
function groundAtSafeFast(x, z) {
  return groundAt(x, z, undefined);
}

function handleActions(p, dt) {
  p.fireCooldown -= dt;
  p.buildCooldown -= dt;
  p.bloom = Math.max(0, p.bloom - dt * 0.09);

  const w = p.activeWeaponDef;

  if (input.wheel !== 0) {
    const dir = input.wheel > 0 ? 1 : -1;
    let idx = p.sel;
    for (let i = 0; i < 6; i++) {
      idx = (idx + dir + 6) % 6;
      if (idx === 0 || p.slots[idx]) break;
    }
    if (idx !== p.sel) selectSlot(p, idx);
  }
  for (let i = 1; i <= 6; i++) {
    if (pressed('Digit' + i)) selectSlot(p, i - 1);
  }

  if (pressed('KeyQ')) toggleBuild(p, 'wall');
  else if (pressed('KeyF')) toggleBuild(p, 'floor');
  else if (pressed('KeyV')) toggleBuild(p, 'ramp');
  else if (pressed('KeyB')) toggleBuild(p, 'cone');
  else if (pressed('KeyX')) cycleMaterial();
  if (S.build.mode) {
    if (pressed('KeyG')) editAimedPiece(p);
    if (input.rmb) exitBuild();
    if (input.lmb && p.buildCooldown <= 0) {
      updateGhost(p);
      if (placePiece(p)) p.buildCooldown = 0.12;
    }
    updateGhost(p);
  } else {
    p.ads = !!input.rmb && !!w && !p.reloading;
    if (input.lmb) {
      const item = p.slots[p.sel];
      if (!w || item?.cat === 'pickaxe') {
        if (p.swingT <= 0) swingPickaxe(p);
      } else if (item?.cat === 'weapon') {
        if (w.auto || !p._lmbLatch) {
          tryFire(p, dt);
          p._lmbLatch = true;
        }
      } else if (item?.cat === 'consumable') {
        if (!p.casting) startCast(p, item);
      }
    } else {
      p._lmbLatch = false;
    }
    if (pressed('KeyR') && w) startReload(p);
    updateReload(p, dt);
    if (pressed('KeyE')) doInteract(p);
  }

  if (p.swingT > 0) p.swingT -= dt;
}

function toggleBuild(p, mode) {
  if (S.build.mode === mode) exitBuild();
  else enterBuild(mode);
}

function swingPickaxe(p) {
  p.swingT = 0.5;
  const origin = p.headPos();
  const dir = p.lookDir();
  const hit = rayCast(origin, dir, PICKAXE.range, { player: false });
  if (!hit) { sfx.pickHit(); return; }
  if (hit.kind === 'harvest') {
    const weak = Math.random() < 0.24;
    const amt = PICKAXE.harvestAmt * (weak ? 1.5 : 1);
    const res = damageHarvest(hit.obj, amt, hit.point);
    if (res.matType && p.mats[res.matType] !== undefined) {
      p.mats[res.matType] = Math.min(CFG.MAT_CAP, p.mats[res.matType] + res.mats);
    }
    if (weak) sfx.pickCrit(); else sfx.pickHit();
    S.emit('mats');
    S.emit('toast', { text: `+${res.mats} ${res.matType}` });
  } else if (hit.kind === 'build') {
    import('./building.js').then(b => b.damagePiece(hit.obj, PICKAXE.buildDmg, hit.point));
    sfx.pickHit();
  } else if (hit.kind === 'panel') {
    panelDamage(hit.obj, PICKAXE.buildDmg, hit.point);
    p.mats.wood = Math.min(CFG.MAT_CAP, p.mats.wood + 4);
    S.emit('mats');
    sfx.pickHit();
  } else if (hit.kind === 'bot') {
    import('./bots.js').then(b => b.damageBot(hit.obj, 20, false, p, 'Harvesting Tool'));
    sfx.pickHit();
    S.emit('hitmark', {});
  } else {
    sfx.pickHit();
  }
}

function doInteract(p) {
  const near = nearestInteractable(p.headPos());
  if (!near) return;
  if (near.type === 'chest') openChest(near.obj);
  else if (near.type === 'ammobox') openAmmoBox(near.obj);
  else if (near.type === 'item') pickupItem(p, near.obj);
}

export function startCast(p, item) {
  const def = CONS[item.id];
  if (!def) return;
  if (def.cap !== undefined) {
    if (def.hp !== undefined && p.hp >= Math.min(def.cap, 100)) { S.emit('toast', { text: 'Health full enough' }); return; }
    if (def.shield !== undefined && p.shield >= def.cap) { S.emit('toast', { text: 'Shield full enough' }); return; }
  }
  p.casting = { id: item.id, time: 0, total: def.time };
  sfx.shieldDrink();
  S.emit('castStarted', { dur: def.time });
}

function updateCasting(p, dt) {
  if (!p.casting) return;
  p.casting.time += dt;
  if (p.casting.time >= p.casting.total) {
    const def = CONS[p.casting.id];
    const item = p.slots[p.sel];
    if (item && item.cat === 'consumable' && item.id === p.casting.id) {
      if (def.hp !== undefined) p.heal(def.hp, def.cap);
      if (def.shield !== undefined) p.addShield(def.shield, def.cap);
      item.count--;
      if (item.count <= 0) p.slots[p.sel] = null;
      S.emit('inventoryChanged');
    }
    p.casting = null;
    S.emit('castEnded');
  }
}

function updateCamera(p, dt, deathCam = false) {
  const cam = p.camera;
  if (deathCam) {
    const t = performance.now() * 0.0004;
    const r = 7;
    cam.position.set(p.pos.x + Math.cos(t) * r, p.pos.y + 4, p.pos.z + Math.sin(t) * r);
    cam.lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
    return;
  }
  const look = p.lookDir(new THREE.Vector3());
  const head = p.headPos(new THREE.Vector3());
  const right = new THREE.Vector3().copy(look).cross(UP).normalize();
  const w = p.activeWeaponDef;
  const scoping = p.ads && w?.scope;
  const dist = p.ads ? (scoping ? 0.4 : 2.2) : (p.sliding ? 5.2 : 4.4);
  const shoulder = p.ads ? 0.55 : 0.8;
  const targetFov = p.ads ? (scoping ? 22 : 52) : 72;

  const desired = head.clone()
    .addScaledVector(look, -dist)
    .addScaledVector(right, p.ads ? shoulder : shoulder)
    .add(new THREE.Vector3(0, 0.32, 0));

  const camGround = groundAt(desired.x, desired.z, desired.y) + 0.3;
  if (desired.y < camGround) desired.y = camGround;

  cam.position.lerp(desired, 1 - Math.exp(-(p.ads ? 22 : 16) * dt));
  cam.lookAt(head.clone().addScaledVector(look, 30).addScaledVector(right, shoulder * 0.9));

  if (Math.abs(cam.fov - targetFov) > 0.1) {
    cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-14 * dt));
    cam.updateProjectionMatrix();
  }
}

function syncModel(p, dt) {
  const m = p.model;
  m.group.position.set(p.pos.x, p.pos.y, p.pos.z);
  m.group.rotation.y = p.yaw + Math.PI;
  m.group.scale.y = p.crouch ? 0.72 : 1;
  if (m.canopy) m.canopy.visible = !!p.chuteDeployed;
  const swing = p.swingT > 0 ? Math.sin((0.5 - p.swingT) / 0.5 * Math.PI) * 1.8 : 0;
  m.armGroup.rotation.x = -swing;
  if (p.velLen > 0.5 && (p.grounded || p.swim)) {
    const t = performance.now() * 0.011 * Math.min(p.velLen, 9);
    m.legL.rotation.x = Math.sin(t) * 0.65;
    m.legR.rotation.x = -Math.sin(t) * 0.65;
    m.body.position.y = 0.95 + Math.abs(Math.sin(t)) * 0.04;
  } else {
    m.legL.rotation.x *= 0.8;
    m.legR.rotation.x *= 0.8;
  }
  m.group.visible = !(p.ads && p.activeWeaponDef?.scope);
}

export function givePlayerItem(p, itemId, n = 1) {
  if (WEAPONS[itemId]) {
    let slot = p.slots.findIndex((s, i) => i > 0 && !s);
    if (slot === -1) slot = 1;
    p.slots[slot] = { cat: 'weapon', ...{ defId: itemId, rarity: 4, mag: WEAPONS[itemId].mag } };
    S.emit('inventoryChanged');
    return;
  }
  if (CONS[itemId]) {
    p.slots[2] = { cat: 'consumable', id: itemId, count: n };
    S.emit('inventoryChanged');
    return;
  }
  if (p.ammo[itemId] !== undefined) p.ammo[itemId] += n;
  if (p.mats[itemId] !== undefined) p.mats[itemId] = Math.min(CFG.MAT_CAP, p.mats[itemId] + n);
  S.emit('ammoChanged'); S.emit('mats');
}
