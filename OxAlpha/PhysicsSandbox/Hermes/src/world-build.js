// Physics contact materials, the static playground, and content presets.
window.SB = window.SB || {};
SB.WorldBuild = (function () {
  const C = () => window.CANNON;
  const T = () => window.THREE;

  /* ---------------- physics materials ---------------- */
  function setupPhysics() {
    const P = {};
    P.defaultMat = new CANNON.Material('default');
    P.metalMat = new CANNON.Material('metal');
    P.rubberMat = new CANNON.Material('rubber');
    P.wheelMat = new CANNON.Material('wheel');
    P.groundMat = new CANNON.Material('ground');

    const cm = (a, b, friction, restitution) => {
      SB.world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
    };
    cm(P.defaultMat, P.groundMat, 0.5, 0.12);
    cm(P.defaultMat, P.defaultMat, 0.42, 0.1);
    cm(P.metalMat, P.groundMat, 0.38, 0.18);
    cm(P.metalMat, P.metalMat, 0.28, 0.22);
    cm(P.rubberMat, P.groundMat, 0.7, 0.72);
    cm(P.rubberMat, P.defaultMat, 0.55, 0.6);
    cm(P.wheelMat, P.groundMat, 0.62, 0.08);
    cm(P.wheelMat, P.defaultMat, 0.55, 0.1);

    SB.world.defaultContactMaterial.friction = 0.42;
    SB.world.defaultContactMaterial.restitution = 0.12;
    SB.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    SB.world.defaultContactMaterial.contactEquationRelaxation = 4;

    SB.Phys = P;
  }

  /* ---------------- mesh helpers ---------------- */
  function slab(sx, sy, sz, x, y, z, material, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material || SB.Mats.mat(0x9aa0a6, { map: SB.Mats.tex.concrete, roughness: .92 }));
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    SB.scene.add(m);
    return m;
  }

  function staticBox(sx, sy, sz, x, y, z, material, ry) {
    const body = new CANNON.Body({ mass: 0, material: SB.Phys.groundMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    body.position.set(x, y, z);
    if (ry) {
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
      body.quaternion.copy(q);
    }
    SB.world.addBody(body);
    return { body, mesh: slab(sx, sy, sz, x, y, z, material, ry) };
  }

  // rotated (tilted) static box for ramps/wedges
  function tiltedBox(sx, sy, sz, x, y, z, tiltAxis, angle, material) {
    const body = new CANNON.Body({ mass: 0, material: SB.Phys.groundMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
    body.position.set(x, y, z);
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(tiltAxis[0], tiltAxis[1], tiltAxis[2]), angle);
    body.quaternion.copy(q);
    SB.world.addBody(body);
    const m = slab(sx, sy, sz, x, y, z, material);
    m.quaternion.copy(q);
    return { body, mesh: m };
  }

  /* ---------------- static playground ---------------- */
  function buildStatics() {
    const M = SB.Mats;

    // ground plane (physics) + textured ground (visual)
    const gBody = new CANNON.Body({ mass: 0, material: SB.Phys.groundMat });
    gBody.addShape(new CANNON.Plane());
    const qg = new CANNON.Quaternion();
    qg.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    gBody.quaternion.copy(qg);
    SB.world.addBody(gBody);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ map: M.tex.ground, roughness: .95 })
    );
    ground.material.map = M.tex.ground.clone();
    ground.material.map.needsUpdate = true;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    SB.scene.add(ground);

    const concrete = () => SB.Mats.mat(0xffffff, { map: M.tex.concrete, roughness: .93 });

    // perimeter walls (keep the toys roughly in play)
    const B = 32, H = 1.15, TH = 0.9;
    staticBox(B * 2 + TH * 2, H, TH, 0, H / 2, -B, concrete());
    staticBox(B * 2 + TH * 2, H, TH, 0, H / 2, B, concrete());
    staticBox(TH, H, B * 2 + TH * 2, -B, H / 2, 0, concrete());
    staticBox(TH, H, B * 2 + TH * 2, B, H / 2, 0, concrete());
    // corner pillars
    [[-B, -B], [B, -B], [-B, B], [B, B]].forEach(([x, z]) => {
      staticBox(1.6, 2.6, 1.6, x, 1.3, z, concrete());
    });

    // east ramp up to a platform (drop-off edge)
    {
      const ang = Math.atan2(3.1, 10.4);
      tiltedBox(11.6, 0.5, 4.4, 7.4, 1.52, 0, [0, 0, 1], ang, concrete()); // ascends toward +X (deck)
      staticBox(8, 0.5, 8, 16.2, 3.05, 0, concrete());                 // deck top at ~3.3
      [[13, 3.3], [19, 3.3], [13, -3.3], [19, -3.3]].forEach(([x, z]) => {
        staticBox(0.7, 2.9, 0.7, x, 1.45, z, concrete());              // legs
      });
      staticBox(0.35, 1.1, 8, 20.2, 3.85, 0, concrete());              // back rail
    }

    // west scaffold tower (two decks)
    {
      staticBox(4.4, 0.4, 4.4, -15, 2.5, -2, concrete());
      staticBox(4.4, 0.4, 4.4, -15, 5.0, -2, concrete());
      [[-17, -4], [-13, -4], [-17, 0], [-13, 0]].forEach(([x, z]) => {
        staticBox(0.5, 5.0, 0.5, x, 2.5, z, concrete());
      });
      staticBox(4.4, 0.9, 0.25, -15, 5.6, -4, concrete());             // rails
      staticBox(0.25, 0.9, 4.4, -17, 5.6, -2, concrete());
    }

    // steep wedge south (slide tests)
    tiltedBox(7, 0.5, 9, 0, 2.1, 17.5, [1, 0, 0], 0.44, concrete());

    // seesaw: static fulcrum + hinged plank (dynamic entity)
    {
      const fx = -6.5, fz = 5;
      tiltedBox(1.4, 1.1, 1.4, fx, 0.28, fz, [0, 0, 1], Math.PI / 4, concrete());
      const anchor = new CANNON.Body({ mass: 0 });
      anchor.addShape(new CANNON.Sphere(0.05));
      anchor.position.set(fx, 0.78, fz);
      anchor.collisionResponse = false;
      SB.world.addBody(anchor);

      const plankEnt = new SB.Entities.Entity('seesaw', 'Seesaw', null);
      plankEnt.pinned = true;
      plankEnt.soundType = 'wood';
      const pb = new CANNON.Body({
        mass: 10, material: SB.Phys.defaultMat,
        position: new CANNON.Vec3(fx, 0.82, fz),
        linearDamping: 0.02, angularDamping: 0.06,
      });
      pb.addShape(new CANNON.Box(new CANNON.Vec3(2.6, 0.075, 0.62)));
      plankEnt.addBody(pb);
      const pm = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.15, 1.24), SB.Mats.mat(0xd8b06a, { roughness: .75 }));
      pm.castShadow = pm.receiveShadow = true;
      plankEnt.addMesh(pm);
      const hinge = new CANNON.HingeConstraint(anchor, pb, {
        pivotA: new CANNON.Vec3(0, 0.02, 0), axisA: new CANNON.Vec3(0, 0, 1),
        pivotB: new CANNON.Vec3(0, 0, 0), axisB: new CANNON.Vec3(0, 0, 1),
      });
      hinge.collideConnected = false;
      plankEnt.addConstraint(hinge);
    }

    // pendulum gallows northeast
    {
      const px = 14, pz = -14;
      staticBox(0.5, 4.4, 0.5, px - 1.6, 2.2, pz, concrete());
      staticBox(0.5, 4.4, 0.5, px + 1.6, 2.2, pz, concrete());
      staticBox(4.2, 0.4, 0.5, px, 4.4, pz, concrete());

      const anchor = new CANNON.Body({ mass: 0 });
      anchor.addShape(new CANNON.Sphere(0.04));
      anchor.position.set(px, 4.15, pz);
      anchor.collisionResponse = false;
      SB.world.addBody(anchor);

      const pend = new SB.Entities.Entity('pendulum', 'Wrecking Ball', null);
      pend.pinned = true;
      pend.soundType = 'metal';
      let prev = anchor, py = 4.15;
      const linkGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6);
      linkGeo.rotateX(Math.PI / 2); // hang along Y visually below
      for (let i = 0; i < 3; i++) {
        const link = new CANNON.Body({ mass: 0.6, position: new CANNON.Vec3(px, py - 0.75 * (i + 0.5), pz) });
        link.addShape(new CANNON.Sphere(0.09));
        link.linearDamping = 0.05; link.angularDamping = 0.2;
        pend.addBody(link);
        const lm = new THREE.Mesh(linkGeo, SB.Mats.mat(0x555c63, { metalness: .7, roughness: .45 }));
        lm.castShadow = true;
        pend.addMesh(lm);
        pend.customSyncChain = true;
        const dc = new CANNON.DistanceConstraint(prev, link, 0.75, 1e6);
        dc.collideConnected = false;
        pend.constraints.push(dc);
        SB.world.addConstraint(dc);
        prev = link;
      }
      const ball = new CANNON.Body({
        mass: 26, position: new CANNON.Vec3(px, py - 2.6, pz),
        linearDamping: 0.01, angularDamping: 0.1,
      });
      ball.addShape(new CANNON.Sphere(0.55));
      pend.addBody(ball);
      const bm = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 16), SB.Mats.mat(0x3c4046, { metalness: .8, roughness: .35 }));
      bm.castShadow = true;
      pend.addMesh(bm);
      const dc2 = new CANNON.DistanceConstraint(prev, ball, 0.95, 1e6);
      dc2.collideConnected = false;
      pend.constraints.push(dc2);
      SB.world.addConstraint(dc2);

      pend.customSync = () => {
        for (let i = 0; i < pend.bodies.length; i++) {
          pend.meshes[i].position.copy(pend.bodies[i].position);
          pend.meshes[i].quaternion.copy(pend.bodies[i].quaternion);
        }
      };
    }

    // bowling lane northwest
    {
      const laneM = SB.Mats.mat(0xffffff, { map: M.tex.lane, roughness: .5 });
      staticBox(2.1, 0.24, 12.5, -14, 0.12, -11, laneM);
    }
  }

  /* ---------------- dynamic scenery & presets ---------------- */

  function place(ent, x, y, z) {
    if (!ent) return null;
    ent.setPosition(x, y, z);
    return ent;
  }

  // idempotent presets: rebuilds clear their previous copies first
  function clearTag(tag) {
    const victims = [];
    for (const e of SB.Entities.values()) {
      if (e.tag === tag && !e.disposed && e !== (SB.Tools && SB.Tools.grabbedEnt)) victims.push(e);
    }
    victims.forEach(e => e.dispose(false));
  }

  function pyramid(atX, atZ, base) {
    base = base || 5;
    clearTag('pyramid');
    const s = 0.85;
    let layer = 0;
    for (let row = base; row >= 1; row--) {
      for (let i = 0; i < row; i++) {
        const x = atX + (i - (row - 1) / 2) * (s + 0.03);
        const z = atZ;
        const y = s / 2 + layer * (s + 0.01) + 0.02;
        const ent = place(SB.Entities.spawn('crate', { x, y, z }), x, y, z);
        if (ent) ent.tag = 'pyramid';
      }
      layer++;
    }
  }

  function dominoRun() {
    clearTag('domino');
    const pts = [];
    const n = 15;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -5 + t * 12.2;
      const z = 11.5 + Math.sin(t * 2.6) * 2.0 + t * 2.2;
      pts.push([x, z]);
    }
    pts.forEach(([x, z], i) => {
      const nxt = pts[Math.min(i + 1, n - 1)];
      const prv = pts[Math.max(i - 1, 0)];
      const yaw = Math.atan2(nxt[0] - prv[0], nxt[1] - prv[1]) + Math.PI / 2;
      const e = SB.Entities.spawn('domino', { x, y: 0.61, z });
      if (!e) return;
      e.bodies[0].quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
      e.meshes[0].quaternion.copy(e.bodies[0].quaternion);
      e.tag = 'domino';
    });
    // pay-load at the end: boom barrels + crate stack
    const b1 = place(SB.Entities.spawn('barrelBoom', { x: 9.6, y: 0.65, z: 16.4 }), 9.6, 0.65, 16.4); if (b1) b1.tag = 'domino';
    const b2 = place(SB.Entities.spawn('barrelBoom', { x: 10.9, y: 0.65, z: 15.2 }), 10.9, 0.65, 15.2); if (b2) b2.tag = 'domino';
    for (let i = 0; i < 3; i++) {
      const c = place(SB.Entities.spawn('crate', { x: 11.8, y: 0.46 + i * 0.88, z: 17.6 }), 11.8, 0.46 + i * 0.88, 17.6);
      if (c) c.tag = 'domino';
    }
    return pts;
  }

  function bowling() {
    clearTag('bowling');
    const lx = -14, lz = -15.9;   // pin deck (far end of lane)
    const k = 0.72;
    const rows = [[0], [-0.42, 0.42], [-0.84, 0, 0.84], [-1.26, -0.42, 0.42, 1.26]];
    rows.forEach((row, r) => {
      row.forEach((off0) => {
        const off = off0 * k;
        const p = place(SB.Entities.spawn('pin', { x: lx + off, y: 0.53, z: lz - r * 0.52 }), lx + off, 0.53, lz - r * 0.52);
        if (p) p.tag = 'bowling';
      });
    });
    const bo = place(SB.Entities.spawn('boulder', { x: lx, y: 1.3, z: lz + 8.2 }), lx, 1.3, lz + 8.2);
    if (bo) bo.tag = 'bowling';
  }

  function brickWall() {
    clearTag('wall');
    const bx = -2, bz = -21;
    const bw = 0.94, bh = 0.46;
    for (let row = 0; row < 5; row++) {
      const cols = 7 - (row % 2 ? 1 : 0);
      for (let c = 0; c < cols; c++) {
        const x = bx + (c - (cols - 1) / 2) * (bw + 0.02) + (row % 2 ? (bw + 0.02) / 2 : 0);
        const y = bh / 2 + row * (bh + 0.008);
        const e = place(SB.Entities.spawn('brick', { x, y, z: bz }), x, y, bz);
        if (!e) continue;
        e.bodies[0].sleepSpeedLimit = 0.4;
        e.tag = 'wall';
      }
    }
  }

  function starters() {
    place(SB.Entities.spawn('crate', { x: 2.2, y: 0.46, z: -2 }), 2.2, 0.46, -2);
    place(SB.Entities.spawn('crate', { x: 2.2, y: 1.34, z: -2 }), 2.2, 1.34, -2);
    const pl = SB.Entities.spawn('plank', { x: -1.8, y: 1.1, z: -1 });
    if (pl) {
      pl.setPosition(-1.8, 1.1, -1);
      pl.bodies[0].quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), 0.5);
      pl.meshes[0].quaternion.copy(pl.bodies[0].quaternion);
    }
    place(SB.Entities.spawn('ball', { x: 0.6, y: 0.5, z: 0.6 }), 0.6, 0.5, 0.6);
    place(SB.Entities.spawn('barrel', { x: -3.6, y: 0.66, z: 1.2 }), -3.6, 0.66, 1.2);
    place(SB.Entities.spawn('dummy', { x: 5.5, y: 0.2, z: 3.5 }), 5.5, 0.2, 3.5);
  }

  function buildPresets(opts) {
    opts = opts || {};
    if (opts.full !== false) {
      pyramid(0, 7, 5);
      dominoRun();
      bowling();
      brickWall();
      starters();
    } else {
      starters();
    }
  }

  function resetSandbox(full) {
    SB.Entities.clearAll(true); // keep pinned playground contraptions (seesaw, pendulum)
    SB.Tools.cancelLink();
    if (full !== false) buildPresets({ full: true });
    else starters();
    SB.FX.dust({ x: 0, y: 0.5, z: 0 }, 30, 2.2);
  }

  return { setupPhysics, buildStatics, buildPresets, resetSandbox, pyramid, bowling, brickWall, dominoRun, brickWallRef: brickWall };
})();
