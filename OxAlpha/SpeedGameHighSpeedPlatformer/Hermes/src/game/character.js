import * as THREE from 'three';
import { clamp, lerp } from './mathutil.js';

// JOLT — original lightning-cheetah courier. Fully procedural model + animation.
const MAT = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.62, metalness: opts.metal ?? 0.05, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1 });

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.bodyRoot = new THREE.Group();     // leans/banks, child of root
    this.spinGroup = new THREE.Group();    // full-body spin (attacks)

    const gold = MAT(0xffa63e, { rough: 0.58 });
    const cream = MAT(0xfff1d8, { rough: 0.7 });
    const dark = MAT(0x33241c, { rough: 0.6 });
    const teal = MAT(0x18dfd2, { rough: 0.35, metal: 0.35 });
    const deepTeal = MAT(0x0b7d8f, { rough: 0.4 });
    const magenta = MAT(0xff2fb4, { rough: 0.5 });
    const white = MAT(0xffffff, { rough: 0.25 });
    const black = MAT(0x141420, { rough: 0.4 });
    this.mats = { gold, cream, dark, teal, deepTeal, magenta, white, black };

    const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

    // ---- torso ----
    const torso = new THREE.Group();
    torso.position.y = 0.92;
    const chest = mesh(new THREE.SphereGeometry(0.34, 20, 16), gold, 0, 0.12, 0);
    chest.scale.set(1.0, 1.08, 0.88);
    const belly = mesh(new THREE.SphereGeometry(0.26, 18, 14), cream, 0, 0.02, 0.13);
    belly.scale.set(0.86, 1.0, 0.72);
    torso.add(chest, belly);

    // scarf collar
    const collar = mesh(new THREE.TorusGeometry(0.27, 0.09, 10, 20), magenta, 0, 0.32, 0);
    collar.rotation.x = Math.PI / 2;
    torso.add(collar);
    this.scarf = [];
    for (let i = 0; i < 4; i++) {
      const s = mesh(new THREE.BoxGeometry(0.16 - i * 0.02, 0.03, 0.22 - i * 0.03), magenta, 0, 0.3, -0.28 - i * 0.16);
      s.material = magenta;
      this.scarf.push(s);
      torso.add(s);
    }

    // ---- head ----
    const head = new THREE.Group();
    head.position.set(0, 0.52, 0.06);
    const skull = mesh(new THREE.SphereGeometry(0.30, 22, 18), gold);
    skull.scale.set(1.04, 0.96, 0.98);
    const muzzle = mesh(new THREE.SphereGeometry(0.155, 16, 12), cream, 0, -0.07, 0.26);
    muzzle.scale.set(1.15, 0.78, 0.95);
    const nose = mesh(new THREE.SphereGeometry(0.05, 10, 8), dark, 0, -0.03, 0.40);
    head.add(skull, muzzle, nose);

    // ears
    const earGeo = new THREE.ConeGeometry(0.11, 0.24, 8);
    const earL = mesh(earGeo, gold, -0.19, 0.28, -0.02);
    const earR = mesh(earGeo.clone(), gold, 0.19, 0.28, -0.02);
    earL.rotation.z = 0.35; earR.rotation.z = -0.35;
    const earInL = mesh(new THREE.ConeGeometry(0.055, 0.14, 6), dark, -0.185, 0.27, 0.03);
    earInL.rotation.z = 0.35;
    const earInR = mesh(new THREE.ConeGeometry(0.055, 0.14, 6), dark, 0.185, 0.27, 0.03);
    earInR.rotation.z = -0.35;
    head.add(earL, earR, earInL, earInR);
    this.ears = [earL, earR];

    // hair tufts (lightning spikes)
    for (let i = 0; i < 3; i++) {
      const spike = mesh(new THREE.ConeGeometry(0.07, 0.26, 5), deepTeal, -0.12 + i * 0.12, 0.30, -0.12);
      spike.rotation.x = -0.7 - i * 0.1;
      spike.rotation.z = (i - 1) * 0.3;
      head.add(spike);
    }

    // goggles (forehead)
    const strap = mesh(new THREE.TorusGeometry(0.29, 0.035, 8, 22), black, 0, 0.10, 0.02);
    strap.rotation.x = Math.PI / 2 - 0.25;
    head.add(strap);
    const lensGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.06, 16);
    const gogL = mesh(lensGeo, teal, -0.125, 0.16, 0.235);
    const gogR = mesh(lensGeo.clone(), teal, 0.125, 0.16, 0.235);
    gogL.rotation.x = gogR.rotation.x = Math.PI / 2 - 0.18;
    head.add(gogL, gogR);
    this.goggles = [gogL, gogR];

    // eyes
    const eyeGeo = new THREE.SphereGeometry(0.075, 12, 10);
    const eyeL = mesh(eyeGeo, white, -0.115, -0.01, 0.245);
    const eyeR = mesh(eyeGeo.clone(), white, 0.115, -0.01, 0.245);
    const pupGeo = new THREE.SphereGeometry(0.032, 8, 8);
    const pupL = mesh(pupGeo, black, -0.105, -0.005, 0.305);
    const pupR = mesh(pupGeo.clone(), black, 0.105, -0.005, 0.305);
    head.add(eyeL, eyeR, pupL, pupR);
    this.eyes = [eyeL, eyeR];
    this.pupils = [pupL, pupR];

    torso.add(head);
    this.head = head;

    // ---- arms ----
    const mkArm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.36, 0.26, 0);
      const upper = mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 10), gold, 0, -0.12, 0);
      const fore = mesh(new THREE.CapsuleGeometry(0.065, 0.18, 6, 10), gold, 0, -0.32, 0.03);
      const glove = mesh(new THREE.SphereGeometry(0.10, 12, 10), teal, 0, -0.44, 0.05);
      g.add(upper, fore, glove);
      torso.add(g);
      return g;
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);

    // ---- legs ----
    const mkLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.17, -0.06, 0);
      const thigh = mesh(new THREE.CapsuleGeometry(0.095, 0.2, 6, 10), gold, 0, -0.14, 0);
      const shin = mesh(new THREE.CapsuleGeometry(0.08, 0.2, 6, 10), gold, 0, -0.38, 0.02);
      // rocket boot
      const boot = mesh(new THREE.BoxGeometry(0.17, 0.14, 0.3), deepTeal, 0, -0.56, 0.06);
      const sole = mesh(new THREE.BoxGeometry(0.19, 0.05, 0.34), black, 0, -0.64, 0.06);
      const thruster = mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.09, 10), teal, 0, -0.60, -0.08);
      thruster.rotation.x = Math.PI / 2;
      const glowMat = new THREE.MeshStandardMaterial({ color: 0x66f6ff, emissive: 0x37d8ff, emissiveIntensity: 2.2, roughness: 0.3 });
      const glow = mesh(new THREE.SphereGeometry(0.05, 8, 8), glowMat, 0, -0.60, -0.135);
      this.thrusterGlows = this.thrusterGlows || [];
      this.thrusterGlows.push(glow);
      g.add(thigh, shin, boot, sole, thruster, glow);
      torso.add(g);
      return g;
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);

    // ---- tail (segment chain) ----
    this.tailSegs = [];
    let parent = torso;
    const tailBase = new THREE.Group();
    tailBase.position.set(0, 0.18, -0.3);
    parent.add(tailBase);
    parent = tailBase;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0 : -0.17;
      const ball = mesh(new THREE.SphereGeometry(0.085 - i * 0.012, 10, 8), gold, 0, 0, i === 0 ? 0 : -0.02);
      seg.add(ball);
      if (i === 4) {
        const tip = mesh(new THREE.ConeGeometry(0.05, 0.16, 6), magenta, 0, 0, -0.14);
        tip.rotation.x = -Math.PI / 2;
        seg.add(tip);
        const spark = new THREE.PointLight(0xff2fb4, 1.2, 3.5);
        spark.position.z = -0.2;
        seg.add(spark);
      }
      parent.add(seg);
      this.tailSegs.push(seg);
      parent = seg;
    }

    // spin disc (visible during attacks)
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
    );
    this.disc.visible = false;

    this.spinGroup.add(torso);
    this.bodyRoot.add(this.spinGroup);
    this.root.add(this.bodyRoot);
    this.torso = torso;

    // animation state
    this.phase = 0;
    this.blinkT = 2;
    this._sq = 1; this._lean = 0; this._bank = 0;
  }

  // anim: {dt, speed01, grounded, state, drifting, grinding, wallSide, vy, turning, boost}
  update(a) {
    const dt = a.dt;
    const s = a.speed01 ?? 0;
    // run cycle
    const cycleRate = a.grounded ? (2.2 + s * 15) : 4;
    this.phase += dt * cycleRate;
    const ph = this.phase;

    // defaults
    let legAmp = a.grounded ? lerp(0.25, 1.15, s) : 0.5;
    let armAmp = a.grounded ? lerp(0.2, 1.0, s) : 0.6;
    let legPhaseSpread = Math.PI;

    let hipLrot = Math.sin(ph) * legAmp - 0.1;
    let hipRrot = Math.sin(ph + legPhaseSpread) * legAmp - 0.1;
    let kneeBendL = Math.max(0, -Math.sin(ph)) * legAmp * 1.1;
    let kneeBendR = Math.max(0, -Math.sin(ph + Math.PI)) * legAmp * 1.1;
    let armLrot = Math.sin(ph + Math.PI) * armAmp;
    let armRrot = Math.sin(ph) * armAmp;

    let torsoPitch = a.grounded ? s * 0.55 : clamp(-a.vy * 0.008, -0.3, 0.42);
    let crouch = 0;

    if (!a.grounded) {
      if (a.state === 'chain' || a.state === 'stomp') {
        // tuck
        hipLrot = hipRrot = 1.5; kneeBendL = kneeBendR = 2.0;
        armLrot = armRrot = -2.4;
        torsoPitch = a.state === 'stomp' ? 0.9 : 0.5;
      } else if (a.vy > 2) {
        hipLrot = -0.5; hipRrot = 0.35; armLrot = -1.9; armRrot = -2.2; kneeBendL = 0.4; kneeBendR = 1.1;
      } else {
        hipLrot = 0.3; hipRrot = -0.35; armLrot = -1.2; armRrot = -1.5; kneeBendL = 0.9; kneeBendR = 0.3;
      }
    } else if (a.grinding) {
      crouch = 0.32; hipLrot = 1.15; hipRrot = 1.0; kneeBendL = kneeBendR = 1.5;
      armLrot = -0.9; armRrot = -0.7; torsoPitch = 0.28;
    } else if (a.drifting) {
      crouch = 0.16; hipLrot = 0.75; hipRrot = 0.4; kneeBendL = 1.2; kneeBendR = 0.7;
      torsoPitch = 0.5;
    }

    this.legL.rotation.x = hipLrot; this.legR.rotation.x = hipRrot;
    // fake knees: shin counter-rotation
    this.legL.children[1].rotation.x = -kneeBendL * 0.9;
    this.legR.children[1].rotation.x = -kneeBendR * 0.9;
    this.armL.rotation.x = armLrot; this.armR.rotation.x = armRrot;
    this.armL.rotation.z = 0.18 + Math.abs(Math.sin(ph)) * 0.1 * s;
    this.armR.rotation.z = -0.18 - Math.abs(Math.sin(ph)) * 0.1 * s;

    // banking into turns + drift exaggeration
    const targetBank = clamp((a.turning ?? 0) * (a.drifting ? 1.9 : 0.9), -0.65, 0.65) * (a.grounded ? 1 : 0.5);
    this._bank = lerp(this._bank, targetBank, 1 - Math.exp(-10 * dt));
    const targetLean = torsoPitch;
    this._lean = lerp(this._lean, targetLean, 1 - Math.exp(-9 * dt));

    this.bodyRoot.rotation.set(this._lean, 0, -this._bank);
    const bobY = a.grounded ? Math.abs(Math.sin(ph)) * 0.05 * s : 0;
    const crouchY = (a.grinding ? -0.22 : 0) - (a.drifting ? 0.1 : 0);

    // squash & stretch spring (landings/jumps poke _sq externally)
    this._sq = lerp(this._sq, 1, 1 - Math.exp(-11 * dt));
    const sq = this._sq;
    this.torso.position.y = 0.92 + bobY + crouchY;
    this.torso.scale.set(sq < 1 ? 2 - sq : sq, sq, 1 / ((sq < 1 ? 2 - sq : sq) * 0.5 + 0.5));

    // head looks ahead with slight bob
    this.head.rotation.x = -this._lean * 0.6;
    this.head.rotation.z = this._bank * 0.4;

    // tail wave
    for (let i = 0; i < this.tailSegs.length; i++) {
      const seg = this.tailSegs[i];
      const wag = Math.sin(this.phase * (a.grounded ? 1 : 0.5) + i * 0.9) * (0.12 + s * 0.2);
      seg.rotation.y = wag;
      seg.rotation.x = i === 0 ? -0.5 - s * 0.5 : Math.sin(this.phase * 1.3 + i) * 0.08;
    }

    // scarf flutters back with speed
    for (let i = 0; i < this.scarf.length; i++) {
      const sc = this.scarf[i];
      sc.rotation.x = Math.sin(this.phase * 1.7 + i * 1.1) * (0.15 + s * 0.5) - s * 0.55 - (a.vy != null ? clamp(-a.vy * 0.02, -0.5, 0.5) : 0);
      sc.position.y = 0.3 - i * 0.035;
    }

    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      const closed = this.blinkT > -0.12;
      this.eyes.forEach((e) => e.scale.y = closed ? 0.12 : 1);
      this.pupils.forEach((p) => p.visible = !closed);
      if (this.blinkT < -0.12) this.blinkT = 1.6 + Math.random() * 2.6;
    }

    // spin disc during attacks
    const spinning = a.state === 'chain';
    this.disc.visible = spinning;
    if (spinning) {
      this.spinGroup.rotation.x += dt * 26;
      this.disc.rotation.copy(this.spinGroup.rotation);
    } else {
      this.spinGroup.rotation.x *= Math.exp(-14 * dt);
    }

    // thrusters
    const glowI = a.boost ? 2.6 + Math.sin(performance.now() * 0.04) * 0.8 : (s > 0.5 ? 0.7 : 0.15);
    for (const g of this.thrusterGlows) g.material.emissiveIntensity = glowI;
  }

  // external impulses
  squash(amount) { this._sq = amount; }
}
