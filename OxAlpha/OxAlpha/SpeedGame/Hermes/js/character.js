/* ============================================================
   VOLT RUSH — character.js
   VOLT: original speedster hero. Fully procedural rigged model +
   procedural animation system (no external assets).
   Silhouette: midnight-navy suit, electric-cyan energy lines,
   swept lightning crest, glowing visor, oversized glow-soled sneakers.
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);

  const COL = {
    suit:   0x182242,
    panel:  0x0d1330,
    trim:   0x27407a,
    glove:  0xeaf6ff,
    shoe:   0xf2f7ff,
    energy: 0x38e1ff,   // primary emissive cyan
    magenta:0xff4fd8,   // rare accent
    visor:  0x9df2ff,
  };

  function mat(color, opts = {}) {
    return new (T().MeshStandardMaterial)(Object.assign({
      color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.25,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.ei ?? 1.0,
    }, {}));
  }
  function emat(color, ei = 1.6) {
    return new (T().MeshStandardMaterial)({
      color, roughness: 0.35, metalness: 0.1,
      emissive: color, emissiveIntensity: ei,
    });
  }

  /* ---------------- build the rig ---------------- */
  function createCharacter() {
    if (!T()) throw new Error('THREE not loaded');
    const M = {
      suit: mat(COL.suit, { rough: 0.6, metal: 0.15 }),
      panel: mat(COL.panel, { rough: 0.45, metal: 0.35 }),
      trim: mat(COL.trim, { rough: 0.4, metal: 0.5 }),
      glove: mat(COL.glove, { rough: 0.5, metal: 0.05 }),
      shoe: mat(COL.shoe, { rough: 0.45, metal: 0.05 }),
      energy: emat(COL.energy, 2.2),
      energySoft: emat(COL.energy, 0.9),
      magenta: emat(COL.magenta, 1.6),
      visor: emat(COL.visor, 1.9),
    };

    const root = new (T()).Group();          // world transform = player pos/yaw
    const body = new (T()).Group();          // lean/bob/crouch applied here
    root.add(body);

    // ---------- torso ----------
    const torso = new (T()).Group(); body.add(torso);
    const chestGeo = new (T()).CylinderGeometry(0.20, 0.155, 0.42, 10);
    const chest = new (T()).Mesh(chestGeo, M.suit); chest.position.y = 0.24; chest.castShadow = true;
    torso.add(chest);
    const bellyGeo = new (T()).CylinderGeometry(0.155, 0.17, 0.18, 10);
    const belly = new (T()).Mesh(bellyGeo, M.panel); belly.position.y = -0.04;
    torso.add(belly);
    // chest core (glowing emblem)
    const core = new (T()).Mesh(new (T()).IcosahedronGeometry(0.062, 1), M.energy);
    core.position.set(0, 0.28, 0.165); torso.add(core);
    // chest chevron plates
    for (const s of [-1, 1]) {
      const plate = new (T()).Mesh(new (T()).BoxGeometry(0.13, 0.16, 0.05), M.trim);
      plate.position.set(s * 0.135, 0.26, 0.09);
      plate.rotation.z = s * -0.22; plate.rotation.x = 0.25;
      torso.add(plate);
    }
    // back thruster pack (small, sleek)
    const pack = new (T()).Mesh(new (T()).BoxGeometry(0.24, 0.2, 0.1), M.panel);
    pack.position.set(0, 0.26, -0.16); torso.add(pack);
    const thrusterL = new (T()).Mesh(new (T()).CylinderGeometry(0.035, 0.05, 0.09, 8), M.magenta);
    thrusterL.rotation.x = Math.PI / 2; thrusterL.position.set(-0.08, 0.26, -0.225); torso.add(thrusterL);
    const thrusterR = thrusterL.clone(); thrusterR.position.x = 0.08; torso.add(thrusterR);

    // ---------- head ----------
    const neck = new (T()).Mesh(new (T()).CylinderGeometry(0.055, 0.065, 0.08, 8), M.panel);
    neck.position.y = 0.48; torso.add(neck);
    const headPivot = new (T()).Group(); headPivot.position.y = 0.53; torso.add(headPivot);
    const skull = new (T()).Mesh(new (T()).SphereGeometry(0.145, 14, 12), M.suit);
    skull.scale.set(1, 1.02, 1.06); skull.castShadow = true; headPivot.add(skull);
    // face shell (slightly forward)
    const face = new (T()).Mesh(new (T()).SphereGeometry(0.125, 12, 10), M.panel);
    face.scale.set(0.92, 0.95, 0.9); face.position.set(0, 0.005, 0.045); headPivot.add(face);
    // visor band
    const visor = new (T()).Mesh(new (T()).BoxGeometry(0.185, 0.045, 0.06), M.visor);
    visor.position.set(0, 0.02, 0.115); headPivot.add(visor);
    // jaw guard
    const jaw = new (T()).Mesh(new (T()).BoxGeometry(0.11, 0.06, 0.09), M.trim);
    jaw.position.set(0, -0.085, 0.075); headPivot.add(jaw);
    // LIGHTNING CREST — swept back double fin (signature silhouette)
    const crestMat = M.energy;
    const crestGeo = new (T()).ConeGeometry(0.035, 0.34, 5);
    const crestA = new (T()).Mesh(crestGeo, crestMat);
    crestA.position.set(-0.05, 0.16, -0.06);
    crestA.rotation.set(-1.15, 0, 0.28); headPivot.add(crestA);
    const crestB = new (T()).Mesh(crestGeo, M.trim);
    crestB.scale.set(0.85, 0.8, 0.85);
    crestB.position.set(0.05, 0.15, -0.06);
    crestB.rotation.set(-1.15, 0, -0.28); headPivot.add(crestB);
    // ear pods
    for (const s of [-1, 1]) {
      const pod = new (T()).Mesh(new (T()).CylinderGeometry(0.045, 0.045, 0.03, 8), M.magenta);
      pod.rotation.z = Math.PI / 2; pod.position.set(s * 0.148, 0.01, 0);
      headPivot.add(pod);
    }

    // ---------- limbs ----------
    function makeArm(side) {
      const shoulder = new (T()).Group();
      shoulder.position.set(side * 0.235, 0.40, 0);
      const pad = new (T()).Mesh(new (T()).SphereGeometry(0.075, 10, 8), M.trim);
      shoulder.add(pad);
      const upper = new (T()).Mesh(new (T()).CylinderGeometry(0.052, 0.048, 0.24, 8), M.suit);
      upper.position.y = -0.13; upper.castShadow = true; shoulder.add(upper);
      const elbow = new (T()).Group(); elbow.position.y = -0.26; shoulder.add(elbow);
      const fore = new (T()).Mesh(new (T()).CylinderGeometry(0.046, 0.042, 0.22, 8), M.panel);
      fore.position.y = -0.115; elbow.add(fore);
      // energy stripe on forearm
      const stripe = new (T()).Mesh(new (T()).BoxGeometry(0.012, 0.14, 0.012), M.energySoft);
      stripe.position.set(side * 0.046, -0.115, 0.02); elbow.add(stripe);
      const hand = new (T()).Mesh(new (T()).SphereGeometry(0.062, 8, 8), M.glove);
      hand.scale.set(1, 1.15, 0.8); hand.position.y = -0.235; elbow.add(hand);
      return { shoulder, elbow };
    }
    function makeLeg(side) {
      const hip = new (T()).Group();
      hip.position.set(side * 0.105, -0.12, 0);
      const thigh = new (T()).Mesh(new (T()).CylinderGeometry(0.068, 0.06, 0.3, 8), M.suit);
      thigh.position.y = -0.16; thigh.castShadow = true; hip.add(thigh);
      const knee = new (T()).Group(); knee.position.y = -0.33; hip.add(knee);
      const kneecap = new (T()).Mesh(new (T()).SphereGeometry(0.06, 8, 8), M.trim);
      knee.add(kneecap);
      const shin = new (T()).Mesh(new (T()).CylinderGeometry(0.056, 0.05, 0.28, 8), M.panel);
      shin.position.y = -0.15; knee.add(shin);
      const ankle = new (T()).Group(); ankle.position.y = -0.31; knee.add(ankle);
      // BIG sneaker — readable silhouette
      const shoe = new (T()).Mesh(new (T()).BoxGeometry(0.115, 0.085, 0.26), M.shoe);
      shoe.position.set(0, -0.035, 0.055); shoe.castShadow = true; ankle.add(shoe);
      const sole = new (T()).Mesh(new (T()).BoxGeometry(0.125, 0.032, 0.27), M.energy);
      sole.position.set(0, -0.082, 0.055); ankle.add(sole);
      return { hip, knee, ankle };
    }
    const armL = makeArm(-1), armR = makeArm(1), legL = makeLeg(-1), legR = makeLeg(1);
    torso.add(armL.shoulder, armR.shoulder, legL.hip, legR.hip);

    // ---------- energy spin-sphere (Surge Attack / boost aura) ----------
    const aura = new (T()).Mesh(
      new (T()).IcosahedronGeometry(0.52, 1),
      new (T()).MeshBasicMaterial({ color: COL.energy, transparent: true, opacity: 0.0, wireframe: true })
    );
    body.add(aura);

    const parts = { root, body, torso, headPivot, core, aura,
      armL, armR, legL, legR, visor };

    /* ---------------- procedural animation ---------------- */
    const anim = {
      phase: 0,           // stride phase
      lean: 0,            // forward lean (rad)
      sideLean: 0,
      crouch: 0,          // 0..1
      squash: 0,          // landing impulse
      spin: 0,            // surge-spin angle
      auraOp: 0,
      bobT: 0,
      state: 'idle',
      prevState: 'idle',
    };

    function setState(s) { anim.prevState = anim.state; anim.state = s; }

    function update(dt, st) {
      // st: {speed, maxSpeed, grounded, drifting, driftDir, grinding, surging, boosting, wallrun, vy}
      const sp = st.speed || 0;
      const sp01 = Math.min(1, sp / 30);
      anim.state = st.state || anim.state;

      // ---- stride phase advances with real distance ----
      if (st.grounded && !st.grinding && sp > 0.5) anim.phase += dt * (2.2 + sp * 0.75);
      else if (!st.grounded) anim.phase += dt * 1.2;

      // ---- targets by state ----
      let tLean = 0, tCrouch = 0, tSideLean = 0, tAura = 0;
      const P = {
        hipL: 0, kneeL: 0, ankL: 0, hipR: 0, kneeR: 0, ankR: 0,
        shLx: 0, shLz: 0.1, elbL: -0.2, shRx: 0, shRz: -0.1, elbR: -0.2,
        headX: 0, headY: 0, bodyY: 0, bodyRotY: 0, armSwing: 0,
      };
      const s = anim.state;

      if (s === 'idle') {
        anim.bobT += dt;
        P.bodyY = Math.sin(anim.bobT * 2.1) * 0.012;
        P.shLz = 0.12 + Math.sin(anim.bobT * 2.1) * 0.02;
        P.shRz = -0.12 - Math.sin(anim.bobT * 2.1) * 0.02;
        P.elbL = P.elbR = -0.35;
        P.headY = Math.sin(anim.bobT * 0.9) * 0.14;
        P.kneeL = P.kneeR = 0.08;
      } else if (st.grinding) {
        // sideways surf stance
        tSideLean = 0.16;
        P.bodyRotY = 0.85;
        const c = Math.sin(anim.phase * 0.5) * 0.1;
        P.hipL = -0.45 + c; P.kneeL = 0.7; P.ankL = -0.3;
        P.hipR = 0.25 - c; P.kneeR = 0.45; P.ankR = -0.25;
        P.shLz = 1.5; P.elbL = -0.5; P.shRx = -0.6; P.shRz = -0.9; P.elbR = -0.7;
        P.headY = -0.5;
      } else if (s === 'jump' || s === 'fall') {
        const rising = (st.vy || 0) > 1;
        if (rising) { // tuck
          P.hipL = -1.15; P.kneeL = 1.9; P.ankL = 0.4;
          P.hipR = -0.65; P.kneeR = 1.4; P.ankR = 0.3;
          P.shLx = -2.4; P.shRx = -2.0; P.elbL = -0.9; P.elbR = -0.9;
          tLean = -0.06;
        } else { // trailing fall
          P.hipL = 0.5; P.kneeL = 0.5;
          P.hipR = 0.3; P.kneeR = 0.75;
          P.shLx = 0.7; P.shRx = 0.9; P.shLz = 0.9; P.shRz = -0.9; P.elbL = -0.3; P.elbR = -0.3;
          tLean = 0.12;
        }
      } else if (s === 'drift') {
        const d = st.driftDir || 0;
        tSideLean = -d * 0.32;         // lean INTO the turn
        tLean = 0.22;
        P.bodyRotY = d * 0.5;
        P.hipL = -0.9; P.kneeL = 1.5; P.ankL = -0.3;
        P.hipR = -0.25; P.kneeR = 0.8; P.ankR = -0.2;
        P.shLx = -0.4; P.elbL = -1.2; P.shRx = 0.9; P.shRz = -0.4; P.elbR = -0.4; // hand down feel
        P.headY = -d * 0.4;
      } else if (s === 'surge') {
        anim.spin += dt * 26;          // rapid spin ball
        tAura = 0.85;
        P.bodyY = 0.05;
      } else { // run / sprint blend
        const ph = anim.phase * Math.PI * 2;
        const amp = 0.55 + sp01 * 0.55;             // bigger strides when fast
        const swing = Math.sin(ph), swing2 = Math.sin(ph + Math.PI);
        P.hipL = swing * amp * 0.85;
        P.hipR = swing2 * amp * 0.85;
        P.kneeL = Math.max(0, -swing) * amp * 1.5 + 0.12;
        P.kneeR = Math.max(0, -swing2) * amp * 1.5 + 0.12;
        P.ankL = -P.hipL * 0.5; P.ankR = -P.hipR * 0.5;
        P.armSwing = swing;
        P.shLx = swing2 * amp * 1.05;
        P.shRx = swing * amp * 1.05;
        P.elbL = -0.5 - Math.max(0, swing2) * 0.7;
        P.elbR = -0.5 - Math.max(0, swing) * 0.7;
        tLean = 0.10 + sp01 * 0.42;                 // lean into speed
        P.bodyY = Math.abs(Math.cos(ph)) * 0.03 * (0.4 + sp01);
        P.headX = -tLean * 0.55;                    // keep eyes up
        if (sp01 > 0.72) tAura = (sp01 - 0.72) * 1.6;
      }

      if (st.boosting) { tAura = Math.max(tAura, 0.5); tLean += 0.1; }
      if (!st.grounded && s !== 'jump' && s !== 'fall' && s !== 'surge') { /* safety */ }

      // ---- smooth blend toward targets ----
      const k = Math.min(1, dt * 14);
      const kp = Math.min(1, dt * 22);
      anim.lean += (tLean - anim.lean) * kp;
      anim.sideLean += (tSideLean - anim.sideLean) * kp;
      anim.crouch += (tCrouch - anim.crouch) * kp;
      anim.auraOp += (tAura - anim.auraOp) * Math.min(1, dt * 10);
      anim.squash = Math.max(0, anim.squash - dt * 4.5);

      // ---- apply pose ----
      body.position.y = P.bodyY - anim.crouch * 0.22 - anim.squash * 0.16;
      body.rotation.x = anim.lean;
      body.rotation.z = anim.sideLean;
      body.rotation.y += ((P.bodyRotY || 0) - body.rotation.y % (Math.PI * 2)) * Math.min(1, dt * 10);
      if (s === 'surge') body.rotation.x = anim.spin;

      torso.position.x = 0;
      headPivot.rotation.x = P.headX;
      headPivot.rotation.y += ((P.headY || 0) - headPivot.rotation.y) * Math.min(1, dt * 8);

      legL.hip.rotation.x += (P.hipL - legL.hip.rotation.x) * kp;
      legR.hip.rotation.x += (P.hipR - legR.hip.rotation.x) * kp;
      legL.knee.rotation.x += (P.kneeL - legL.knee.rotation.x) * kp;
      legR.knee.rotation.x += (P.kneeR - legR.knee.rotation.x) * kp;
      legL.ankle.rotation.x += (P.ankL - legL.ankle.rotation.x) * kp;
      legR.ankle.rotation.x += (P.ankR - legR.ankle.rotation.x) * kp;

      armL.shoulder.rotation.x += ((P.shLx || 0) - armL.shoulder.rotation.x) * kp;
      armR.shoulder.rotation.x += ((P.shRx || 0) - armR.shoulder.rotation.x) * kp;
      armL.shoulder.rotation.z += ((P.shLz || 0) - armL.shoulder.rotation.z) * kp;
      armR.shoulder.rotation.z += ((P.shRz || 0) - armR.shoulder.rotation.z) * kp;
      armL.elbow.rotation.x += ((P.elbL || 0) - armL.elbow.rotation.x) * kp;
      armR.elbow.rotation.x += ((P.elbR || 0) - armR.elbow.rotation.x) * kp;

      aura.material.opacity = anim.auraOp * 0.55;
      aura.rotation.y += dt * 7; aura.rotation.x += dt * 4.3;
      aura.visible = anim.auraOp > 0.02;

      // subtle core pulse
      const pulse = 1.6 + Math.sin(performance.now() * 0.004) * 0.5;
      M.energy.emissiveIntensity = 1.8 + pulse * 0.4;
    }

    function triggerLand(hardness) { anim.squash = Math.min(1, 0.35 + hardness * 0.65); }
    function resetSpin() { anim.spin = 0; body.rotation.x = 0; }

    return { group: root, parts, update, setState, triggerLand, resetSpin, materials: M };
  }

  window.VoltCharacter = { createCharacter, COL };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltCharacter;
})();
