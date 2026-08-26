// VOLT — original speed-runner protagonist. Fully procedural model + animation.
// States: idle, run/sprint (distance-driven cycle), jump/air, fall, land, drift-lean,
// grind, attack-spin (energy ball), stomp dive. Animation adapts to speed.
import * as THREE from 'three';

const CYAN = 0x2ee8ff, MAGENTA = 0xff3d81, DARK = 0x141b2e, WHITE = 0xeaf6ff, GOLD = 0xffd23d;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? .55, metalness: opts.metal ?? .25,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1
  });
}
function limbSeg(len, r0, r1, m) {
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 7), m);
  seg.position.y = -len / 2;
  seg.castShadow = true;
  return seg;
}

export class VoltCharacter {
  constructor() {
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    const M = {
      body: mat(CYAN, { rough: .4, metal: .3 }),
      dark: mat(DARK, { rough: .35, metal: .55 }),
      white: mat(WHITE, { rough: .3, metal: .1 }),
      acc: mat(MAGENTA, { rough: .35, metal: .2, emissive: MAGENTA, ei: .7 }),
      gold: mat(GOLD, { rough: .3, metal: .6, emissive: GOLD, ei: .5 }),
    };
    this.M = M;

    // ---- torso ----
    const torso = new THREE.Group(); this.root.add(torso); this.torso = torso;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(.21, .17, .46, 9), M.body);
    chest.position.y = -.05; chest.castShadow = true; torso.add(chest);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(.16, 9, 7), M.dark);
    belly.position.y = -.32; belly.scale.set(1, .8, .85); torso.add(belly);
    const core = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6),
      new THREE.MeshStandardMaterial({ color: WHITE, emissive: CYAN, emissiveIntensity: 2.4 }));
    core.position.set(0, -.02, .19); torso.add(core);
    const hips = new THREE.Mesh(new THREE.SphereGeometry(.155, 9, 7), M.dark);
    hips.scale.set(1, .75, .9); hips.position.y = -.44; torso.add(hips);

    // ---- head ----
    const headG = new THREE.Group(); headG.position.y = .38; torso.add(headG); this.head = headG;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(.21, 12, 9), M.white);
    skull.scale.set(.95, 1, 1.02); skull.castShadow = true; headG.add(skull);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(.215, 12, 8, 0, Math.PI * 2, Math.PI * .28, Math.PI * .34),
      new THREE.MeshStandardMaterial({ color: 0x061020, roughness: .08, metalness: .8, emissive: 0x0a2a44, emissiveIntensity: .6 }));
    visor.rotation.x = -0.22; headG.add(visor);
    const finGeo = new THREE.ConeGeometry(.07, .34, 6);
    const finL = new THREE.Mesh(finGeo, M.acc); finL.position.set(-.17, .1, -.09); finL.rotation.set(1.9, 0, .45);
    const finR = finL.clone(); finR.position.x = .17; finR.rotation.z = -.45;
    headG.add(finL, finR);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(.06, .3, 6), M.gold);
    crest.position.set(0, .23, -.05); crest.rotation.x = -2.4; headG.add(crest);
    const earL = new THREE.Mesh(new THREE.SphereGeometry(.045, 6, 5), M.acc); earL.position.set(-.2, .04, .02);
    const earR = earL.clone(); earR.position.x = .2; headG.add(earL, earR);

    // ---- arms ----
    this.armL = new THREE.Group(); this.armL.position.set(-.26, .12, 0); torso.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(.26, .12, 0); torso.add(this.armR);
    for (const arm of [this.armL, this.armR]) {
      arm.add(limbSeg(.27, .075, .06, M.body));
      const fore = new THREE.Group(); fore.position.y = -.27; arm.add(fore);
      fore.add(limbSeg(.26, .06, .05, M.white));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.07, 7, 6), M.dark);
      hand.position.y = -.28; hand.castShadow = true; fore.add(hand);
      arm.userData.fore = fore;
    }
    this.armL.rotation.z = 0.18; this.armR.rotation.z = -0.18;

    // ---- legs + boots ----
    this.legL = new THREE.Group(); this.legL.position.set(-.11, -.5, 0); torso.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(.11, -.5, 0); torso.add(this.legR);
    for (const leg of [this.legL, this.legR]) {
      leg.add(limbSeg(.3, .09, .07, M.dark));
      const shin = new THREE.Group(); shin.position.y = -.3; leg.add(shin);
      shin.userData.isShin = true; leg.userData.shin = shin;
      shin.add(limbSeg(.3, .065, .05, M.body));
      const boot = new THREE.Mesh(new THREE.BoxGeometry(.14, .12, .26), M.gold);
      boot.position.set(0, -.34, .05); boot.castShadow = true; shin.add(boot);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(.15, .04, .27),
        new THREE.MeshStandardMaterial({ color: WHITE, emissive: CYAN, emissiveIntensity: 1.8 }));
      sole.position.set(0, -.41, .05); shin.add(sole);
    }
    this._spin = 0; this._squash = 1; this._landT = 0; this._driftLean = 0;
    this._visYaw = 0; this._phase = 0; this._idleT = Math.random() * 10;
    this.shell = null;
  }

  setShell(shellMesh) { this.shell = shellMesh; if (shellMesh.parent !== this.root) this.root.add(shellMesh); }

  // state: {speed, grounded, grinding, drifting, attacking, stomping, vy,
  //         turnRate, justLanded, hasDir, moveYaw}
  update(dt, s) {
    const root = this.root;
    const t = this._idleT += dt;
    const spN = THREE.MathUtils.clamp(s.speed / 24, 0, 1.6);

    // face movement direction
    if ((s.hasDir || s.grinding) && s.moveYaw !== undefined) {
      let d = s.moveYaw - this._visYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this._visYaw += d * Math.min(1, dt * (s.grinding ? 18 : 14));
      this.group.rotation.y = this._visYaw;
    }

    let targetSquash = 1, leanFwd = 0, leanSide = 0;
    const P = {
      legL: [0, 0], legR: [0, 0],
      armL: [-.2, -.4], armR: [-.2, -.4],
      torsoX: 0, rootY: 0
    };

    if (s.attacking) {
      this._spin += dt * (16 + spN * 14);
      root.rotation.x = this._spin;
      root.position.y = -0.55;
      this.torso.rotation.x = 0; this.head.visible = false;
      this.armL.rotation.x = this.armR.rotation.x = -2.6;
      this.armL.rotation.z = 1.2; this.armR.rotation.z = -1.2;
      this.legL.rotation.x = this.legR.rotation.x = -1.9;
      this.legL.userData.shin.rotation.x = this.legR.userData.shin.rotation.x = 2.2;
      if (this.shell) { this.shell.visible = true; this.shell.rotation.y -= dt * 22; }
      return;
    }
    this.head.visible = true;
    if (this.shell) this.shell.visible = false;

    if (s.grinding) {
      this._phase += dt * s.speed * .35;
      const w = Math.sin(this._phase * .5) * .08;
      P.legL = [.5 + w, .8]; P.legR = [-.25 - w, .5];
      P.armL = [-.5 + w, -.9]; P.armR = [.3 - w, -.7];
      leanSide = .38; P.torsoX = .18;
      targetSquash = .94;
    } else if (!s.grounded) {
      if (s.stomping) {
        P.legL = [1.2, .3]; P.legR = [1.2, .3];
        P.armL = [2.6, -.3]; P.armR = [2.6, -.3];
        P.torsoX = 1.1;
      } else if (s.vy > 2) {
        const k = THREE.MathUtils.clamp(s.vy / 13, 0, 1);
        P.legL = [.9 * k, 1.1 * k]; P.legR = [.5 * k, .7 * k];
        P.armL = [-2.4 * k, -.6]; P.armR = [-1.2 * k, -.5];
        P.torsoX = -.12 * k; leanFwd = .1;
      } else {
        const f = THREE.MathUtils.clamp(-s.vy / 20, 0, 1);
        P.legL = [.35 + f * .3, .5]; P.legR = [-.2 - f * .2, .35];
        P.armL = [-1.9 - f, -.4]; P.armR = [-1.6 - f, -.4];
        P.torsoX = .15 * f;
      }
    } else if (s.speed > 0.6) {
      this._phase += dt * (6 + s.speed * 1.05);
      const ph = this._phase, A = .55 + spN * .5;
      const sl = Math.sin(ph), cl = Math.cos(ph);
      P.legL = [sl * A, Math.max(0, -cl) * A * 1.1];
      P.legR = [-sl * A, Math.max(0, cl) * A * 1.1];
      const armA = (.7 + spN * .8);
      P.armL = [-sl * armA, -.9 - Math.max(0, sl) * .5];
      P.armR = [sl * armA, -.9 - Math.max(0, -sl) * .5];
      leanFwd = .12 + spN * .42;
      P.rootY = Math.abs(cl) * .06 * (1 + spN * .5);
      P.torsoX = .06;
      if (spN > .85) { P.armL[1] = P.armR[1] = -0.25; P.armL[0] *= .6; P.armR[0] *= .6; leanFwd += .12; }
    } else {
      const b = Math.sin(t * 2.2);
      P.rootY = b * .012; P.torsoX = .02 + b * .02;
      P.armL = [-.15 - b * .05, -.5]; P.armR = [-.15 + b * .05, -.5];
      P.legL = [0, .05]; P.legR = [0, .05];
      this.head.rotation.y = Math.sin(t * .6) * .3;
    }
    if (!(s.grounded && s.speed <= 0.6)) this.head.rotation.y *= (1 - dt * 8);

    const targetLean = s.drifting ? THREE.MathUtils.clamp(s.turnRate * .55, -.85, .85) : THREE.MathUtils.clamp(s.turnRate * .12, -.25, .25);
    this._driftLean += (targetLean - this._driftLean) * Math.min(1, dt * 8);
    leanSide += this._driftLean;

    if (s.justLanded) this._landT = .22;
    if (this._landT > 0) {
      this._landT -= dt;
      const k = Math.max(0, this._landT / .22);
      targetSquash = 1 - k * .28;
      P.legL = [.3, .8]; P.legR = [-.3, .8];
      P.armL = [-.9, -1]; P.armR = [-.9, -1];
    }

    const L = Math.min(1, dt * 16);
    this._applyLeg(this.legL, P.legL, L); this._applyLeg(this.legR, P.legR, L);
    this._applyArm(this.armL, P.armL, L, 1); this._applyArm(this.armR, P.armR, L, -1);
    this.torso.rotation.x += ((P.torsoX + leanFwd) - this.torso.rotation.x) * L;
    this._squash += (targetSquash - this._squash) * Math.min(1, dt * 14);
    root.scale.set(1 + (1 - this._squash) * .6, this._squash, 1 + (1 - this._squash) * .6);
    root.rotation.x = 0;
    root.position.y = P.rootY - 0.62;
    this.torso.rotation.z = -leanSide * .8;
  }

  _applyLeg(leg, p, L) {
    leg.rotation.x += (p[0] - leg.rotation.x) * L;
    leg.userData.shin.rotation.x += ((p[1] ?? 0) - leg.userData.shin.rotation.x) * L;
  }
  _applyArm(arm, p, L, side) {
    arm.rotation.x += (p[0] - arm.rotation.x) * L;
    arm.rotation.z += ((side * .18) - arm.rotation.z) * L;
    arm.userData.fore.rotation.x += ((p[1] ?? -.4) - arm.userData.fore.rotation.x) * L;
  }

  updateScarf(neckWorldPos, vel, dt) {
    const pts = this.scarfPts ??= Array.from({ length: 5 }, () => new THREE.Vector3());
    pts[0].copy(neckWorldPos);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], cur = pts[i];
      cur.lerp(prev, Math.min(1, dt * 26));
      cur.y -= dt * 1.2;
      const maxD = 0.22;
      const d = cur.distanceTo(prev);
      if (d > maxD) cur.sub(prev).multiplyScalar(maxD / d).add(prev);
    }
    if (!this.scarfMesh) { this.scarfMesh = makeScarf(pts.length); this.scarfMesh.frustumCulled = false; }
    updateScarfGeo(this.scarfMesh, pts, vel.length());
  }
  get scarf() { return this.scarfMesh; }
}

function makeScarf(n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}
function updateScarfGeo(mesh, pts, speed) {
  const pos = mesh.geometry.attributes.position.array;
  const col = mesh.geometry.attributes.color.array;
  const c1 = new THREE.Color(MAGENTA), c2 = new THREE.Color(CYAN);
  const tmp = new THREE.Color();
  for (let i = 0; i < pts.length; i++) {
    const w = .16 * (1 - i / pts.length) * (1 + Math.min(speed / 30, 1));
    const sway = Math.sin(i * 1.7 + performance.now() * .01) * .05 * i;
    pos[i * 6 + 0] = pts[i].x - w + sway;
    pos[i * 6 + 1] = pts[i].y;
    pos[i * 6 + 2] = pts[i].z + sway * .3;
    pos[i * 6 + 3] = pts[i].x + w + sway;
    pos[i * 6 + 4] = pts[i].y;
    pos[i * 6 + 5] = pts[i].z + sway * .3;
    tmp.lerpColors(c1, c2, i / pts.length);
    col[i * 6] = col[i * 6 + 3] = tmp.r; col[i * 6 + 1] = col[i * 6 + 4] = tmp.g; col[i * 6 + 2] = col[i * 6 + 5] = tmp.b;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.color.needsUpdate = true;
}
