// character.js — "KAZE", original wind-sprite courier. Fully procedural model +
// speed-reactive procedural animation: idle / run / sprint-streamline / jump /
// fall / land squash / drift lean / grind stance / Zephyr Strike drill spin.
import * as THREE from 'three';

const TEAL = 0x17c3b2, ORANGE = 0xff9f1c, NAVY = 0x18233f, WHITE = 0xf2fbff, CYAN = 0x53f2e4;

function toonMat(color, opts = {}) {
  const grad = new Uint8Array([80, 160, 235, 255]);
  const gradMap = new THREE.DataTexture(grad, grad.length, 1, THREE.RedFormat);
  gradMap.needsUpdate = true;
  gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;
  return new THREE.MeshToonMaterial({ color, gradientMap: gradMap, ...opts });
}

function glow(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: .4 });
}

export class Character {
  constructor(scene) {
    this.root = new THREE.Group();          // world position + yaw (faces local +Z)
    this.tilt = new THREE.Group();          // lean/pitch/roll/squash
    this.spin = new THREE.Group();          // drill-roll group
    this.root.add(this.tilt); this.tilt.add(this.spin);

    const suit = toonMat(TEAL), dark = toonMat(NAVY), lite = toonMat(WHITE), acc = toonMat(ORANGE);
    this.mats = { suit, dark, lite, acc };

    // ---- torso ----
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.34, 6, 12), suit);
    torso.position.y = 0.86; this.spin.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), lite);
    chest.scale.set(1, 0.72, 0.62); chest.position.set(0, 0.94, 0.20); this.spin.add(chest);
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), glow(CYAN, 2.2));
    emblem.position.set(0, 0.97, 0.30); this.spin.add(emblem);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.09, 14), acc);
    belt.position.y = 0.62; this.spin.add(belt);
    const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.18, 4, 8), dark);
    pack.rotation.x = 0.5; pack.position.set(0, 0.95, -0.26); this.spin.add(pack);

    // ---- head ----
    this.headG = new THREE.Group(); this.headG.position.y = 1.38; this.spin.add(this.headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 14), dark);
    head.scale.set(1, 0.94, 0.98); this.headG.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.212, 14, 10, -0.9, 1.8, 0.85, 0.85), glow(CYAN, 2.6));
    visor.rotation.x = 0.28; this.headG.add(visor);
    // swept-back single fin crest (original silhouette)
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); finShape.quadraticCurveTo(0.1, 0.42, -0.62, 0.58); finShape.quadraticCurveTo(-0.16, 0.3, -0.05, 0);
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false }), acc);
    fin.position.set(0.025, 0.13, -0.02); fin.rotation.y = Math.PI / 2;
    this.headG.add(fin);
    // ear pods
    [-1, 1].forEach(s => {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.07, 10), acc);
      pod.rotation.z = s * Math.PI / 2; pod.position.set(s * 0.24, 0.02, 0); this.headG.add(pod);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026), glow(CYAN, 2));
      dot.position.set(s * 0.285, 0.02, 0); this.headG.add(dot);
    });

    // ---- arms ----
    this.armL = this._makeArm(dark, acc, 1); this.armR = this._makeArm(dark, acc, -1);
    // ---- legs ----
    this.legL = this._makeLeg(suit, acc, 1); this.legR = this._makeLeg(suit, acc, -1);

    // ---- scarf (verlet chain of puffs) ----
    this.scarfPts = []; this.scarfPrev = [];
    this.scarfMeshes = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 * (1 - i * 0.09), 8, 6), i % 2 ? toonMat(ORANGE) : toonMat(0xffc94d));
      scene.add(m); this.scarfMeshes.push(m);
      this.scarfPts.push(new THREE.Vector3()); this.scarfPrev.push(new THREE.Vector3());
      this.scarfInit = false;
    }

    // ---- boost flames ----
    this.flames = [];
    [this.legL.boot, this.legR.boot].forEach(b => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 8), glow(0x66e0ff, 2.4));
      f.rotation.x = Math.PI / 2; f.position.set(0, 0, -0.32); f.visible = false;
      b.add(f); this.flames.push(f);
    });

    this.phase = 0;
    this.spinAngle = 0;
    this.shadowBlob = null;
  }

  _makeArm(matSleeve, matGlove, side) {
    const g = new THREE.Group();
    g.position.set(side * 0.36, 1.12, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 4, 8), matSleeve);
    upper.position.y = -0.17; g.add(upper);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), matGlove);
    fist.position.y = -0.37; g.add(fist);
    this.spin.add(g);
    g.fist = fist;
    return g;
  }
  _makeLeg(matSuit, matBoot, side) {
    const g = new THREE.Group();
    g.position.set(side * 0.155, 0.60, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.22, 4, 8), matSuit);
    thigh.position.y = -0.17; g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.2, 4, 8), matSuit);
    shin.position.y = -0.46; g.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.30), matBoot);
    boot.position.set(0, -0.63, 0.04); g.add(boot);
    this.spin.add(g);
    g.boot = boot;
    return g;
  }

  /** Called every rendered frame with gameplay state. */
  animate(dt, st) {
    // st: {pos, yaw, speed01, grounded, airTime, vy, drifting, turnLean,
    //      grinding, dive, boosting, landT, vel}
    const s = st;
    this.root.position.copy(s.pos);
    this.root.position.y -= 0.12; // collider center -> visual feet offset
    // yaw follow handled by player (smooth); apply:
    this.root.rotation.y = s.yaw;

    const sp = s.speed01;
    const T = this.tilt, S = this.spin;

    // reset per-frame targets
    let leanF = 0, leanR = 0, squash = 1;

    if (s.dive) {
      // Zephyr Strike: drill roll around travel axis, limbs tucked
      this.spinAngle += dt * 22;
      S.rotation.z = this.spinAngle;
      leanF = 1.15; // nearly horizontal
      this._limbTuck(1);
    } else {
      S.rotation.z *= Math.max(0, 1 - dt * 10);
      if (!s.grounded && !s.grinding) {
        // jump tuck rising, spread fall
        const rising = s.vy > 2;
        this._legTarget(this.legL, rising ? -1.15 : -0.45, 0.15);
        this._legTarget(this.legR, rising ? -0.85 : -0.2, -0.15);
        this._armTarget(this.armL, rising ? -2.4 : -0.5, rising ? 0 : 0.5, rising ? 0.5 : 0.35);
        this._armTarget(this.armR, rising ? -2.4 : -0.5, rising ? 0 : -0.5, rising ? -0.5 : -0.35);
        leanF = rising ? 0.25 : 0.05 + Math.sin(performance.now() * 0.004) * 0.05;
      } else if (s.grinding) {
        // sideways surf stance
        this._legTarget(this.legL, -0.28, 0.3); this._legTarget(this.legR, -0.1, -0.3);
        this._armTarget(this.armL, -0.4 + Math.sin(performance.now() * 0.006) * 0.25, 1.1, 0);
        this._armTarget(this.armR, -0.4 - Math.sin(performance.now() * 0.005) * 0.25, -1.1, 0);
        leanF = 0.22;
      } else {
        // run cycle
        this.phase += dt * (5 + sp * 26);
        const amp = Math.min(0.15 + sp * 1.25, 1.25);
        const sw = Math.sin(this.phase), cw = Math.cos(this.phase);
        this._legTarget(this.legL, sw * amp * 0.85, 0);
        this._legTarget(this.legR, -sw * amp * 0.85, 0);
        // arms pump; at sprint (>0.62) sweep back into streamline
        const stream = THREE.MathUtils.smoothstep(sp, 0.62, 0.95);
        const armSwing = -sw * amp * 0.8;
        this._armTarget(this.armL, THREE.MathUtils.lerp(armSwing, -2.75, stream), stream ? 0.25 : 0.12, 0);
        this._armTarget(this.armR, THREE.MathUtils.lerp(-armSwing, -2.75, stream), stream ? -0.25 : -0.12, 0);
        leanF = 0.10 + sp * 0.62;
        squash = 1 - sp * 0.06;
        // bob
        T.position.y = Math.abs(cw) * 0.05 * sp;
      }
      if (s.drifting) {
        leanR = -s.turnLean * 0.55;
        this._armTarget(this.armL, -0.9, 1.25, 0);   // hand down inside
        this._armTarget(this.armR, -1.6, -0.4, 0);
      }
      if (s.landT > 0) { squash = 0.78 + 0.22 * (1 - s.landT); }
    }
    if (s.grounded || s.grinding || s.dive) T.position.y *= Math.max(0, 1 - dt * 8);

    T.rotation.x = THREE.MathUtils.lerp(T.rotation.x, leanF, 1 - Math.pow(0.0001, dt));
    T.rotation.z = THREE.MathUtils.lerp(T.rotation.z, leanR, 1 - Math.pow(0.0001, dt));
    const sy = T.scale.y; T.scale.y = THREE.MathUtils.lerp(sy, squash, 1 - Math.pow(0.001, dt));

    this.headG.rotation.x = -leanF * 0.55; // keep gaze forward

    // flames
    const flameOn = s.boosting || (s.speed01 > 0.8 && s.grounded);
    for (const f of this.flames) {
      f.visible = !!flameOn;
      if (flameOn) { const k = 0.75 + Math.random() * 0.6; f.scale.set(k, 0.8 + Math.random() * 0.7, k); }
    }

    // scarf verlet
    this._scarf(dt, s);
  }

  _legTarget(g, rx, rz) { g.rotation.x += (rx - g.rotation.x) * 0.45; g.rotation.z += ((rz || 0) - g.rotation.z) * 0.45; }
  _armTarget(g, rx, rz, zx) { g.rotation.x += (rx - g.rotation.x) * 0.4; g.rotation.z += ((rz || 0) - g.rotation.z) * 0.4; if (zx !== undefined) g.fist.position.x = zx * 0.001; }
  _limbTuck(k) {
    this._legTarget(this.legL, -1.3 * k, 0.2); this._legTarget(this.legR, -1.3 * k, -0.2);
    this._armTarget(this.armL, -2.9 * k, 0.3); this._armTarget(this.armR, -2.9 * k, -0.3);
  }

  _scarf(dt, s) {
    const anchor = new THREE.Vector3(0, 0.28, -0.24).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw).add(this.root.position);
    if (!this.scarfInit) {
      for (let i = 0; i < 8; i++) { this.scarfPts[i].copy(anchor); this.scarfPrev[i].copy(anchor); }
      this.scarfInit = true;
    }
    this.scarfPts[0].copy(anchor);
    const wind = new THREE.Vector3(s.vel.x, 0, s.vel.z).multiplyScalar(-0.028);
    for (let i = 1; i < 8; i++) {
      const p = this.scarfPts[i], pr = this.scarfPrev[i];
      const vx = (p.x - pr.x) * 0.96, vy = (p.y - pr.y) * 0.96, vz = (p.z - pr.z) * 0.96;
      pr.copy(p);
      p.x += vx + wind.x * (i / 8) - Math.sin(performance.now() * 0.008 + i) * 0.004;
      p.y += vy - 0.012 + Math.sin(performance.now() * 0.011 + i * 1.3) * 0.006;
      p.z += vz + wind.z * (i / 8);
      const prev = this.scarfPts[i - 1];
      const d = new THREE.Vector3().subVectors(p, prev);
      const len = d.length() || 0.001;
      const rest = 0.16;
      p.copy(prev).add(d.multiplyScalar(rest / len));
    }
    for (let i = 0; i < 8; i++) this.scarfMeshes[i].position.copy(this.scarfPts[i]);
  }

  setVisible(v) { this.root.visible = v; }
}
