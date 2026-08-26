// HYPERLINE player — procedural character rig, animation state machine, physics
import * as THREE from 'three';
import CFG from './config.js';
import { G, bus } from './state.js';
import { clamp, damp, lerp, randRange, easeOutCubic } from './utils.js';
import { M, geo } from './materials.js';

function rounded(w, h, d, r = 0.06) {
  // cheap "rounded" box: box with beveled look via slight scale — keep simple boxes
  return new THREE.BoxGeometry(w, h, d);
}

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vy = 0;
    this.laneIdx = 1;
    this.xCur = 0;
    this.grounded = true;
    this.rolling = false;
    this.rollT = 0;
    this.coyoteT = 0;
    this.height = CFG.PHYS.PLAYER_H;
    this.state = 'run';       // run | jump | roll | fly | stumble | dead | board
    this.stumbleT = 0;
    this.deadT = 0;
    this.runPhase = 0;
    this.flying = false;
    this.boardMesh = null;
    this.shieldMesh = null;
    this.jetFlameT = 0;
  }

  build(charDef, quality) {
    const c = charDef.colors;
    const g = new THREE.Group();
    this.root = g;

    const matSkin = new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.75 });
    const matHood = new THREE.MeshStandardMaterial({ color: c.hood, roughness: 0.8 });
    const matPants = new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.85 });
    const matCap = new THREE.MeshStandardMaterial({ color: c.cap, roughness: 0.7 });
    const matShoe = new THREE.MeshStandardMaterial({ color: c.shoe, roughness: 0.6 });

    // body group (bob/lean applied here)
    this.bodyG = new THREE.Group();
    g.add(this.bodyG);

    // torso
    this.torso = new THREE.Mesh(rounded(0.52, 0.62, 0.3), matHood);
    this.torso.position.y = 1.12;
    this.torso.castShadow = true;
    this.bodyG.add(this.torso);
    // hood detail
    const hoodRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 6, 12), matCap);
    hoodRim.position.set(0, 1.38, -0.13);
    hoodRim.rotation.x = Math.PI / 2 + 0.35;
    this.bodyG.add(hoodRim);
    // backpack
    const pack = new THREE.Mesh(rounded(0.34, 0.4, 0.18), matPants);
    pack.position.set(0, 1.16, 0.22);
    pack.castShadow = true;
    this.bodyG.add(pack);
    // head
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(rounded(0.34, 0.34, 0.32), matSkin);
    skull.castShadow = true;
    this.head.add(skull);
    // cap
    const capTop = new THREE.Mesh(rounded(0.37, 0.14, 0.36), matCap);
    capTop.position.y = 0.17;
    this.head.add(capTop);
    const capBrim = new THREE.Mesh(rounded(0.34, 0.045, 0.2), matCap);
    capBrim.position.set(0, 0.115, -0.24);
    this.head.add(capBrim);
    // eyes
    const eyeGeo = geo('eye', () => new THREE.SphereGeometry(0.032, 8, 6));
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14141e });
    for (const ex of [-0.075, 0.075]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(ex, 0.02, -0.165);
      this.head.add(e);
    }
    this.head.position.y = 1.66;
    this.bodyG.add(this.head);

    // arms
    this.armL = this._makeLimb(matSkin, matHood, 0.09, 0.42, 0.3);
    this.armL.pivot.position.set(-0.33, 1.38, 0);
    this.bodyG.add(this.armL.pivot);
    this.armR = this._makeLimb(matSkin, matHood, 0.09, 0.42, 0.3);
    this.armR.pivot.position.set(0.33, 1.38, 0);
    this.bodyG.add(this.armR.pivot);

    // legs
    this.legL = this._makeLimb(matSkin, matPants, 0.11, 0.5, 0.62, matShoe);
    this.legL.pivot.position.set(-0.15, 0.82, 0);
    this.bodyG.add(this.legL.pivot);
    this.legR = this._makeLimb(matSkin, matPants, 0.11, 0.5, 0.62, matShoe);
    this.legR.pivot.position.set(0.15, 0.82, 0);
    this.bodyG.add(this.legR.pivot);

    if (quality.shadows > 0) {
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    }

    // hoverboard mesh (hidden until active)
    this.boardMesh = new THREE.Group();
    const deckM = new THREE.Mesh(geo('boardDeck', () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.55, 0); shape.quadraticCurveTo(-0.7, 0.16, -0.45, 0.16);
      shape.lineTo(0.45, 0.16); shape.quadraticCurveTo(0.7, 0.16, 0.55, 0);
      shape.quadraticCurveTo(0.7, -0.16, 0.45, -0.16);
      shape.lineTo(-0.45, -0.16); shape.quadraticCurveTo(-0.7, -0.16, -0.55, 0);
      return new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false });
    }), new THREE.MeshStandardMaterial({
      color: charDef === null ? 0x35e0d2 : 0x35e0d2,
      roughness: 0.3, metalness: 0.5, emissive: 0x177a70, emissiveIntensity: 0.8,
    }));
    deckM.rotation.x = -Math.PI / 2;
    this.boardMesh.add(deckM);
    this.boardDeckMat = deckM.material;
    this.boardMesh.visible = false;
    g.add(this.boardMesh);

    // shield bubble
    this.shieldMesh = new THREE.Mesh(
      geo('shieldBubble', () => new THREE.SphereGeometry(1.05, 20, 14)),
      new THREE.MeshBasicMaterial({
        color: 0x63b8ff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    g.add(this.shieldMesh);

    // jetpack visual
    this.jetPack = new THREE.Group();
    for (const jx of [-0.16, 0.16]) {
      const tank = new THREE.Mesh(geo('jetTank', () => new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.09, 0.3, 4, 8) : new THREE.CylinderGeometry(0.09, 0.09, 0.44, 8)),
        new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.35, metalness: 0.7 }));
      tank.position.set(jx, 1.2, 0.26);
      this.jetPack.add(tank);
    }
    this.jetPack.visible = false;
    this.bodyG.add(this.jetPack);

    return g;
  }

  setBoardColor(hex) {
    if (this.boardDeckMat) this.boardDeckMat.color.setHex(hex);
  }

  _makeLimb(matEnd, matCloth, rUp, lenUp, lenLo, shoeMat) {
    const pivot = new THREE.Group();
    const up = new THREE.Mesh(new THREE.BoxGeometry(rUp * 2, lenUp, rUp * 2), matCloth);
    up.position.y = -lenUp / 2;
    up.castShadow = true;
    pivot.add(up);
    const joint = new THREE.Group();
    joint.position.y = -lenUp;
    const lo = new THREE.Mesh(new THREE.BoxGeometry(rUp * 1.7, lenLo, rUp * 1.7), matCloth);
    lo.position.y = -lenLo / 2;
    lo.castShadow = true;
    joint.add(lo);
    if (shoeMat) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(rUp * 2.2, 0.12, 0.3), shoeMat);
      shoe.position.set(0, -lenLo - 0.02, -0.06);
      shoe.castShadow = true;
      joint.add(shoe);
    } else {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(rUp * 0.95, 8, 6), matEnd);
      hand.position.y = -lenLo - 0.02;
      joint.add(hand);
    }
    pivot.add(joint);
    return { pivot, joint };
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.vy = 0;
    this.laneIdx = 1;
    this.xCur = 0;
    this.grounded = true;
    this.rolling = false;
    this.rollT = 0;
    this.state = 'run';
    this.stumbleT = 0;
    this.deadT = 0;
    this.flying = false;
    this.height = CFG.PHYS.PLAYER_H;
    this.root.rotation.set(0, 0, 0);
    this.root.visible = true;
    this.boardMesh.visible = false;
    this.shieldMesh.visible = false;
    this.jetPack.visible = false;
  }

  laneSnapSpeed() {
    let s = CFG.LANE_SNAP;
    if (G.boardActive > 0 && window.__save.data.board === 'phantom') s *= 1.15;
    return s;
  }

  jump() {
    if (!this.grounded && this.coyoteT <= 0) return false;
    if (this.flying) return false;
    const sneakerMult = G.fx.sneakers > 0 ? CFG.POWERUPS.SNEAKERS.JUMP_MULT : 1;
    this.vy = CFG.PHYS.JUMP_V * sneakerMult;
    this.grounded = false;
    this.coyoteT = 0;
    this.rolling = false;
    this.height = CFG.PHYS.PLAYER_H;
    this.state = 'jump';
    bus.emit('jump');
    return true;
  }

  roll() {
    if (this.state === 'dead') return false;
    if (this.flying) return false;
    if (!this.grounded) {
      this.vy = CFG.PHYS.FASTFALL_V;   // slam down
    }
    this.rolling = true;
    this.rollT = CFG.PHYS.ROLL_TIME;
    this.height = CFG.PHYS.ROLL_H;
    this.state = 'roll';
    bus.emit('roll');
    return true;
  }

  moveLane(dir) {
    if (this.state === 'dead') return false;
    const target = clamp(this.laneIdx + dir, 0, 2);
    if (target === this.laneIdx) return false;
    this.laneIdx = target;
    bus.emit('lane');
    return true;
  }

  stumble() {
    if (G.invuln > 0 || G.godMode) return 'none';
    if (G.fx.shield) { G.fx.shield = false; G.invuln = 1.2; bus.emit('shieldBreak'); return 'shield'; }
    if (G.boardActive > 0) { this.breakBoard(); return 'shield'; }
    // second stumble while chaser is hot → caught
    if (G.stumbleHeat > 0 || window.__chaserDist < CFG.CHASER.CATCH_ON_STUMBLE_IF_CLOSER_THAN) {
      return 'caught';
    }
    G.invuln = CFG.PHYS.STUMBLE_INVULN;
    G.stumbleHeat = 4.0;
    this.stumbleT = 0.65;
    this.state = 'stumble';
    bus.emit('stumble');
    return 'stumble';
  }

  breakBoard() {
    G.boardActive = 0;
    this.boardMesh.visible = false;
    G.invuln = 1.5;
    bus.emit('boardShatter');
  }

  die(cause) {
    if (G.godMode || this.state === 'dead') return;
    if (cause !== 'fall' && G.fx.shield) {
      G.fx.shield = false; G.invuln = 1.4; bus.emit('shieldBreak'); return;
    }
    if (cause !== 'fall' && G.boardActive > 0) { this.breakBoard(); return; }
    this.state = 'dead';
    this.deadT = 0;
    this.deathCause = cause;
    if (cause === 'hit') this.vy = 6.5;
    bus.emit('death', cause);
  }

  update(dt, speed, world, fxSys, audio) {
    const flying = G.fx.jetpack > 0;
    this.flying = flying;

    // ---- lateral ----
    const targetX = CFG.LANES[this.laneIdx];
    this.xCur = damp(this.xCur, targetX, this.laneSnapSpeed(), dt);
    this.pos.x = this.xCur;

    // ---- vertical / ground ----
    const groundY = world.groundHeightAt(this.pos.x, this.pos.z);
    if (flying) {
      const targetY = CFG.POWERUPS.JETPACK.Y;
      this.pos.y = damp(this.pos.y, targetY, 3.2, dt);
      this.vy = 0;
      this.grounded = false;
      this.rolling = false;
      this.height = CFG.PHYS.PLAYER_H;
      this.state = this.state === 'dead' ? 'dead' : 'fly';
      this.jetFlameT -= dt;
      if (this.jetFlameT <= 0) { this.jetFlameT = 0.04; fxSys && fxSys.jetFlame(this.pos.x + randRange(-0.15, 0.15), this.pos.y + 1.1, this.pos.z + 0.3); }
    } else if (groundY === -Infinity) {
      // over a hole
      this.grounded = false;
      this.vy += -CFG.PHYS.GRAVITY * 0.85 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y < -1.6 && this.state !== 'dead') {
        this.die('fall');
      }
    } else {
      if (this.grounded) {
        // walked off an edge?
        if (this.pos.y > groundY + 0.25) {
          this.grounded = false;
          this.coyoteT = CFG.PHYS.COYOTE;
          this.vy = 0;
        } else {
          this.pos.y = damp(this.pos.y, groundY, 22, dt);
        }
      }
      if (!this.grounded) {
        this.coyoteT -= dt;
        this.vy += -CFG.PHYS.GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.vy <= 0 && this.pos.y <= groundY + 0.02) {
          const hard = groundY < this.pos.y - 0.01;
          this.pos.y = groundY;
          this.vy = 0;
          this.grounded = true;
          this.coyoteT = 0;
          if (this.state !== 'dead' && this.state !== 'stumble') this.state = this.rolling ? 'roll' : 'run';
          bus.emit('land', { hard });
          fxSys && fxSys.dust(this.pos.x, groundY + 0.05, this.pos.z, hard ? 10 : 5);
        }
      }
    }

    // ---- roll timer ----
    if (this.rolling) {
      this.rollT -= dt;
      if (this.rollT <= 0) {
        this.rolling = false;
        this.height = CFG.PHYS.PLAYER_H;
        if (this.grounded) this.state = 'run';
      }
    }

    // ---- stumble recovery ----
    if (this.stumbleT > 0) this.stumbleT -= dt;

    // ---- death anim ----
    if (this.state === 'dead') {
      this.deadT += dt;
      this.vy += -CFG.PHYS.GRAVITY * dt * 0.8;
      this.pos.y = Math.max(this.pos.y + this.vy * dt, groundY === -Infinity ? -3 : groundY);
      this.pos.z -= speed * dt * Math.max(0, 1 - this.deadT * 1.4) * 0.4;   // skid
      if (groundY > -Infinity) {
        // tumble on ground
        this.root.rotation.x += dt * 9;
      } else {
        this.root.rotation.x += dt * 5;
      }
    }

    // ---- apply transforms ----
    this.root.position.copy(this.pos);
    this.animate(dt, speed);
    if (this.shieldMesh.visible || G.fx.shield) {
      this.shieldMesh.visible = G.fx.shield;
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.05;
      this.shieldMesh.scale.setScalar(pulse);
    }
    if (this.boardMesh.visible || G.boardActive > 0) {
      this.boardMesh.visible = G.boardActive > 0;
      this.boardMesh.position.y = this.rolling ? 0.1 : 0.12;
      this.boardMesh.rotation.z = Math.sin(this.runPhase * 0.5) * 0.06;
    }
    this.jetPack.visible = flying;
    // lean into lane change
    const leanTarget = clamp((targetX - this.xCur) * -0.28, -0.45, 0.45);
    this.bodyG.rotation.z = damp(this.bodyG.rotation.z, leanTarget, 10, dt);
  }

  animate(dt, speed) {
    const st = this.state;
    const cadence = 2.1 + speed * 0.085;
    this.runPhase += dt * cadence * Math.PI;
    const p = this.runPhase;
    const B = this.bodyG;

    if (st === 'dead') {
      B.rotation.x = damp(B.rotation.x, 0.4, 4, dt);
      this.armL.pivot.rotation.x = damp(this.armL.pivot.rotation.x, -2.4, 6, dt);
      this.armR.pivot.rotation.x = damp(this.armR.pivot.rotation.x, -2.2, 6, dt);
      return;
    }

    if (st === 'fly') {
      B.rotation.x = damp(B.rotation.x, -0.25, 5, dt);
      B.position.y = damp(B.position.y, Math.sin(p * 0.4) * 0.05, 8, dt);
      // legs dangle
      this.legL.pivot.rotation.x = damp(this.legL.pivot.rotation.x, 0.5 + Math.sin(p) * 0.12, 8, dt);
      this.legR.pivot.rotation.x = damp(this.legR.pivot.rotation.x, 0.35 + Math.sin(p + 1.2) * 0.12, 8, dt);
      this.legL.joint.rotation.x = damp(this.legL.joint.rotation.x, -0.7, 8, dt);
      this.legR.joint.rotation.x = damp(this.legR.joint.rotation.x, -0.5, 8, dt);
      // arms grip straps
      this.armL.pivot.rotation.x = damp(this.armL.pivot.rotation.x, -2.6, 8, dt);
      this.armR.pivot.rotation.x = damp(this.armR.pivot.rotation.x, -2.6, 8, dt);
      this.armL.joint.rotation.x = damp(this.armL.joint.rotation.x, -0.5, 8, dt);
      this.armR.joint.rotation.x = damp(this.armR.joint.rotation.x, -0.5, 8, dt);
      this.head.rotation.x = damp(this.head.rotation.x, 0.25, 6, dt);
      return;
    }

    if (st === 'roll') {
      const t = 1 - this.rollT / CFG.PHYS.ROLL_TIME;   // 0..1
      B.rotation.x = -t * Math.PI * 2;                  // full curl spin
      B.position.y = -0.42 + Math.sin(t * Math.PI) * 0.1;
      this.legL.pivot.rotation.x = -1.9;
      this.legR.pivot.rotation.x = -1.9;
      this.legL.joint.rotation.x = 2.2;
      this.legR.joint.rotation.x = 2.2;
      this.armL.pivot.rotation.x = -2.6;
      this.armR.pivot.rotation.x = -2.6;
      this.head.rotation.x = 0.6;
      return;
    }

    if (!this.grounded && st !== 'stumble') {
      // airborne pose: knees up, arms swept back
      B.rotation.x = damp(B.rotation.x, -0.18, 8, dt);
      B.position.y = damp(B.position.y, 0, 8, dt);
      const rising = this.vy > 0;
      this.legL.pivot.rotation.x = damp(this.legL.pivot.rotation.x, rising ? -1.25 : -0.55, 9, dt);
      this.legR.pivot.rotation.x = damp(this.legR.pivot.rotation.x, rising ? -0.5 : -1.05, 9, dt);
      this.legL.joint.rotation.x = damp(this.legL.joint.rotation.x, rising ? 1.5 : 0.9, 9, dt);
      this.legR.joint.rotation.x = damp(this.legR.joint.rotation.x, rising ? 0.8 : 1.3, 9, dt);
      this.armL.pivot.rotation.x = damp(this.armL.pivot.rotation.x, rising ? 0.9 : -0.7, 8, dt);
      this.armR.pivot.rotation.x = damp(this.armR.pivot.rotation.x, rising ? 0.9 : -0.7, 8, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -0.1, 6, dt);
      return;
    }

    if (st === 'stumble') {
      B.rotation.x = damp(B.rotation.x, 0.55, 10, dt);
      B.position.y = 0;
      this.armL.pivot.rotation.x = -2.9 + Math.sin(p * 2.4) * 0.5;
      this.armR.pivot.rotation.x = -2.7 + Math.sin(p * 2.4 + 1) * 0.5;
      this.legL.pivot.rotation.x = Math.sin(p * 3) * 0.8;
      this.legR.pivot.rotation.x = Math.sin(p * 3 + 2.4) * 0.8;
      this.head.rotation.x = 0.3;
      return;
    }

    // ---- run cycle ----
    const amp = clamp(speed / 40, 0.55, 1.05);
    const swing = Math.sin(p) * 1.05 * amp;
    const swing2 = Math.sin(p + Math.PI) * 1.05 * amp;
    this.legL.pivot.rotation.x = swing;
    this.legR.pivot.rotation.x = swing2;
    // knee bend when leg is back/lifting
    this.legL.joint.rotation.x = Math.max(0, Math.sin(p + 0.6)) * 1.5 * amp;
    this.legR.joint.rotation.x = Math.max(0, Math.sin(p + Math.PI + 0.6)) * 1.5 * amp;
    this.armL.pivot.rotation.x = swing2 * 0.92;
    this.armR.pivot.rotation.x = swing * 0.92;
    this.armL.joint.rotation.x = -0.5 - Math.max(0, swing2) * 0.4;
    this.armR.joint.rotation.x = -0.5 - Math.max(0, swing) * 0.4;
    // torso lean + bob
    B.rotation.x = damp(B.rotation.x, 0.16 + amp * 0.1, 8, dt);
    B.position.y = Math.abs(Math.cos(p)) * 0.055 * amp;
    this.head.rotation.x = damp(this.head.rotation.x, -0.08, 6, dt);
    this.head.rotation.z = Math.sin(p * 0.5) * 0.02;
  }
}
