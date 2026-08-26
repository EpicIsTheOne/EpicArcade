// Spawnable entities: props, bombs, carts, ragdolls. Each entity owns its
// bodies/meshes/constraints and stays in sync through the main loop.
window.SB = window.SB || {};
SB.Entities = (function () {
  const C = () => window.CANNON;
  const T = () => window.THREE;

  let nextId = 1;
  const all = new Map(); // id -> entity
  const explosives = new Set();
  const pendingBooms = []; // {entId, at} sim-time scheduled detonations

  function countDynamicBodies() {
    let n = 0;
    for (const e of all.values()) if (!e.isStaticLevel) n += e.bodies.length;
    return n;
  }

  class Entity {
    constructor(kind, label, def) {
      this.id = nextId++;
      this.kind = kind;
      this.label = label;
      this.def = def || null;      // clone recipe: {kind, params}
      this.bodies = [];
      this.meshes = [];
      this.constraints = [];
      this.pinned = false;         // protected from auto-despawn
      this.frozen = false;
      this.soundType = 'wood';
      this.mass = 0;
      this.onCollide = null;       // (entityOther|staticHit, relVel, worldPoint)
      this.outline = null;
      all.set(this.id, this);
    }
    addBody(b) {
      b.entityId = this.id;
      this.bodies.push(b);
      SB.world.addBody(b);
      b.addEventListener('collide', (ev) => {
        const v = ev.contact ? ev.contact.getImpactVelocityAlongNormal() : 0;
        const other = ev.body;
        if (Math.abs(v) > 0.9 && this.soundType !== 'none') {
          SB.Audio.collide(this.soundType, Math.abs(v), b.id, other ? other.id : 0);
          if (Math.abs(v) > 5.5) {
            const p = b.position;
            SB.FX.impact({ x: p.x, y: p.y, z: p.z }, Math.min(1, Math.abs(v) / 16), this.soundType);
          }
        }
        if (this.onCollide) this.onCollide(other, v);
      });
      return b;
    }
    addMesh(m) {
      m.userData.entId = this.id;
      m.traverse((o) => { o.userData.entId = this.id; });
      this.meshes.push(m);
      SB.scene.add(m);
      return m;
    }
    addConstraint(c) {
      c.entityIds = [this.id];
      this.constraints.push(c);
      SB.world.addConstraint(c);
      return c;
    }
    // link two entities with a distance constraint; returns the constraint record
    link(other, maxForce) {
      const a = this.bodies[0], b = other.bodies[0];
      const d = a.position.distanceTo(b.position);
      const c = new CANNON.DistanceConstraint(a, b, d * 0.94, maxForce == null ? 1e5 : maxForce);
      c.collideConnected = false;
      SB.world.addConstraint(c);
      SB.Links.add(c, this, other);
      return c;
    }
    setPosition(x, y, z, q) {
      this.bodies.forEach((b) => {
        b.position.set(x, y, z);
        if (q) b.quaternion.copy(q);
        b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
        b.wakeUp();
      });
    }
    wakeAll() { this.bodies.forEach(b => b.wakeUp()); }
    setMass(m) {
      const old = this._appliedMass;
      if (old && old > 0) {
        const k = m / old;
        this.bodies.forEach((b) => {
          if (b.type === CANNON.Body.DYNAMIC) { b.mass *= k; b.updateMassProperties(); }
        });
      } else {
        this.bodies.forEach((b) => { if (b.type === CANNON.Body.DYNAMIC) b.updateMassProperties(); });
      }
      this._appliedMass = m;
      this._mass = m;
      this.wakeAll();
    }
    dispose(poofFX) {
      if (poofFX) {
        const p = this.bodies[0] ? this.bodies[0].position : null;
        if (p) {
          SB.Audio.poof();
          SB.FX.dust(p, 8, 1);
          SB.FX.spark(p, 6, 4, null, 0.9, 0.85, 0.7);
        }
      }
      SB.Links.removeAllFor(this);
      this.constraints.forEach(c => { try { SB.world.removeConstraint(c); } catch (e) {} });
      this.bodies.forEach(b => { try { SB.world.removeBody(b); } catch (e) {} });
      this.meshes.forEach(m => SB.scene.remove(m));
      if (this.outline) { SB.scene.remove(this.outline.mesh); }
      explosives.delete(this.id);
      all.delete(this.id);
      if (SB.Tools) SB.Tools.notifyDisposed(this);
    }
  }

  // `mass` reflects the entity's nominal total (used by UI / scaling)
  Object.defineProperty(Entity.prototype, 'mass', {
    get() { return this._mass || 0; },
    set(v) { this._mass = v; this._appliedMass = v; },
  });

  /* ============================================================
   * prop builders
   * ============================================================ */

  function stdMesh(geo, material, castShadow) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = castShadow !== false;
    m.receiveShadow = true;
    return m;
  }

  // generic single-body box prop
  function boxProp(opts) {
    const e = new Entity(opts.kind, opts.label, { kind: opts.kind, params: {} });
    e.soundType = opts.soundType || 'wood';
    const hx = opts.sx / 2, hy = opts.sy / 2, hz = opts.sz / 2;
    const body = new CANNON.Body({
      mass: opts.mass,
      material: opts.physMat,
      position: new CANNON.Vec3(opts.pos.x, opts.pos.y, opts.pos.z),
      linearDamping: 0.02, angularDamping: 0.05,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.allowSleep = true; body.sleepSpeedLimit = 0.32; body.sleepTimeLimit = 0.55;
    e.addBody(body);
    const geo = new THREE.BoxGeometry(opts.sx, opts.sy, opts.sz);
    const mesh = stdMesh(geo, opts.mat3);
    if (opts.map) mesh.material = mesh.material.clone(), mesh.material.map = opts.map;
    e.addMesh(mesh);
    e.mass = opts.mass;
    return e;
  }

  const SPAWNERS = {

    crate(pos) {
      const e = boxProp({
        kind: 'crate', label: 'Crate', pos,
        sx: 0.85, sy: 0.85, sz: 0.85, mass: 9,
        mat3: SB.Mats.mat(0xffffff, { map: SB.Mats.tex.crate, roughness: .82 }),
      });
      return e;
    },

    plank(pos) {
      const e = boxProp({
        kind: 'plank', label: 'Plank', pos,
        sx: 2.6, sy: 0.14, sz: 0.55, mass: 6, soundType: 'wood',
        mat3: SB.Mats.mat(0xd8b06a, { roughness: .75 }),
      });
      return e;
    },

    heavy(pos) {
      const e = boxProp({
        kind: 'heavy', label: 'Steel Block', pos,
        sx: 0.95, sy: 0.95, sz: 0.95, mass: 90, soundType: 'metal',
        mat3: SB.Mats.mat(0x454c54, { roughness: .38, metalness: .85 }),
      });
      return e;
    },

    foam(pos) {
      const e = boxProp({
        kind: 'foam', label: 'Foam Cube', pos,
        sx: 0.75, sy: 0.75, sz: 0.75, mass: 0.5, soundType: 'cloth',
        mat3: SB.Mats.mat(0xa8e6cf, { roughness: .95 }),
      });
      return e;
    },

    brickProp(pos) {
      const e = boxProp({
        kind: 'brick', label: 'Brick', pos,
        sx: 0.92, sy: 0.44, sz: 0.46, mass: 5, soundType: 'stone',
        mat3: SB.Mats.mat(0xffffff, { map: SB.Mats.tex.brick, roughness: .9 }),
      });
      return e;
    },

    barrel(pos, explosive) {
      const e = new Entity(explosive ? 'barrelBoom' : 'barrel', explosive ? 'Boom Barrel' : 'Barrel',
        { kind: explosive ? 'barrelBoom' : 'barrel', params: {} });
      e.soundType = 'metal';
      const r = 0.44, h = 1.15, seg = 12;
      const body = new CANNON.Body({
        mass: explosive ? 11 : 15,
        material: SB.Phys.metalMat,
        position: new CANNON.Vec3(pos.x, pos.y, pos.z),
        linearDamping: 0.02, angularDamping: 0.08,
      });
      // cannon cylinders lie along local Z — stand them up with a baked rotation
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
      body.addShape(new CANNON.Cylinder(r, r, h, seg), new CANNON.Vec3(), q);
      body.allowSleep = true; body.sleepSpeedLimit = 0.32; body.sleepTimeLimit = 0.55;
      e.addBody(body);
      const mesh = stdMesh(
        new THREE.CylinderGeometry(r, r, h, 18),
        SB.Mats.mat(0xffffff, { map: explosive ? SB.Mats.tex.barrelBoom : SB.Mats.tex.barrel, roughness: .5, metalness: .35 })
      );
      e.addMesh(mesh);
      if (explosive) armExplosive(e, { radius: 7.2, power: 26 });
      e.mass = body.mass;
      return e;
    },

    ball(pos) {
      const e = new Entity('ball', 'Rubber Ball', { kind: 'ball', params: {} });
      e.soundType = 'rubber';
      const r = 0.38;
      const body = new CANNON.Body({
        mass: 2.2,
        material: SB.Phys.rubberMat,
        position: new CANNON.Vec3(pos.x, pos.y, pos.z),
        linearDamping: 0.005, angularDamping: 0.03,
      });
      body.addShape(new CANNON.Sphere(r));
      body.allowSleep = true; body.sleepSpeedLimit = 0.25; body.sleepTimeLimit = 0.7;
      e.addBody(body);
      const hue = Math.random();
      const col = new THREE.Color().setHSL(hue, 0.72, 0.5);
      e.addMesh(stdMesh(new THREE.SphereGeometry(r, 24, 18), SB.Mats.mat(col.getHex(), { roughness: .42 })));
      e.mass = 2.2;
      return e;
    },

    boulder(pos) {
      const e = new Entity('boulder', 'Boulder', { kind: 'boulder', params: {} });
      e.soundType = 'stone';
      const r = 0.62;
      const body = new CANNON.Body({
        mass: 34,
        material: SB.Phys.defaultMat,
        position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      });
      body.addShape(new CANNON.Sphere(r));
      body.allowSleep = true; body.sleepSpeedLimit = 0.32; body.sleepTimeLimit = 0.55;
      e.addBody(body);
      e.addMesh(stdMesh(new THREE.DodecahedronGeometry(r, 1), SB.Mats.mat(0x8d8776, { roughness: .95, flat: true })));
      e.mass = 34;
      return e;
    },

    barrelBoom(pos) { return SPAWNERS.barrel(pos, true); },

    domino(pos) {
      const e = boxProp({
        kind: 'domino', label: 'Domino', pos,
        sx: 0.52, sy: 1.18, sz: 0.17, mass: 1.4, soundType: 'wood',
        mat3: SB.Mats.mat(0xe8e2d2, { roughness: .6 }),
      });
      e.bodies[0].angularDamping = 0.04;
      return e;
    },

    pin(pos) {
      const e = new Entity('pin', 'Bowling Pin', { kind: 'pin', params: {} });
      e.soundType = 'wood';
      const r = 0.17, h = 0.55;
      const body = new CANNON.Body({
        mass: 1.1,
        material: SB.Phys.defaultMat,
        position: new CANNON.Vec3(pos.x, pos.y, pos.z),
        angularDamping: 0.12,
      });
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
      body.addShape(new CANNON.Cylinder(r * 0.62, r, h, 10), new CANNON.Vec3(), q);
      body.allowSleep = true; body.sleepSpeedLimit = 0.3; body.sleepTimeLimit = 0.5;
      e.addBody(body);
      const g = new THREE.Group();
      const white = stdMesh(new THREE.CylinderGeometry(r * 0.62, r, h, 14), SB.Mats.mat(0xf2ede2, { roughness: .35 }));
      const stripe = stdMesh(new THREE.CylinderGeometry(r * 0.68, r * 0.66, 0.09, 14), SB.Mats.mat(0xc23a33, { roughness: .35 }));
      stripe.position.y = -0.04;
      const neck = stdMesh(new THREE.SphereGeometry(r * 0.52, 12, 10), SB.Mats.mat(0xf2ede2, { roughness: .35 }));
      neck.position.y = h / 2 + 0.09;
      g.add(white, stripe, neck);
      e.addMesh(g);
      e.mass = 1.1;
      return e;
    },

    bomb(pos) {
      const e = new Entity('bomb', 'Bomb', { kind: 'bomb', params: {} });
      e.soundType = 'metal';
      const r = 0.3;
      const body = new CANNON.Body({
        mass: 5.5,
        material: SB.Phys.metalMat,
        position: new CANNON.Vec3(pos.x, pos.y, pos.z),
        linearDamping: 0.05, angularDamping: 0.15,
      });
      body.addShape(new CANNON.Sphere(r));
      body.allowSleep = true; body.sleepSpeedLimit = 0.3; body.sleepTimeLimit = 0.6;
      e.addBody(body);
      const g = new THREE.Group();
      const sphere = stdMesh(new THREE.SphereGeometry(r, 22, 16), SB.Mats.mat(0x1d2126, { roughness: .3, metalness: .55 }));
      const fuse = stdMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), SB.Mats.mat(0xc9a15f, { roughness: .9 }));
      fuse.position.y = r + 0.08;
      fuse.rotation.z = 0.3;
      const cap = stdMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.09, 10), SB.Mats.mat(0x8f2320, { roughness: .5 }));
      cap.position.y = r + 0.01;
      g.add(sphere, fuse, cap);
      e.addMesh(g);
      e.glowMat = sphere.material = sphere.material.clone();
      armExplosive(e, { radius: 7.6, power: 30, hp: 14, fragile: true });
      e.mass = 5.5;
      return e;
    },

    /* ---------- cart ---------- */
    cart(pos) {
      const e = new Entity('cart', 'Cart', { kind: 'cart', params: {} });
      e.soundType = 'metal';
      const chassis = new CANNON.Body({
        mass: 24,
        material: SB.Phys.metalMat,
        position: new CANNON.Vec3(pos.x, pos.y + 0.55, pos.z),
        linearDamping: 0.02, angularDamping: 0.1,
      });
      chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.14, 0.62)));
      chassis.allowSleep = true; chassis.sleepSpeedLimit = 0.3; chassis.sleepTimeLimit = 0.8;
      e.addBody(chassis);

      const cg = new THREE.Group();
      const bed = stdMesh(new THREE.BoxGeometry(1.9, 0.28, 1.24), SB.Mats.mat(0xc23a33, { roughness: .55, metalness: .25 }));
      const rimMat = SB.Mats.mat(0x33383e, { roughness: .6, metalness: .5 });
      [[-0.88, -0.62], [-0.88, 0.62], [0.88, -0.62], [0.88, 0.62]].forEach(([x, z]) => {
        const post = stdMesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), rimMat);
        post.position.set(x, 0.36, z);
        cg.add(post);
      });
      cg.add(bed);
      e.addMesh(cg);

      const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const hubGeo = new THREE.SphereGeometry(0.13, 10, 8);
      const tireMat = SB.Mats.mat(0x22262b, { roughness: .85 });
      const hubMat = SB.Mats.mat(0xd8d2c4, { roughness: .4, metalness: .4 });

      [[-0.78, 0.66], [-0.78, -0.66], [0.78, 0.66], [0.78, -0.66]].forEach(([x, z]) => {
        const w = new CANNON.Body({
          mass: 3.2,
          material: SB.Phys.wheelMat,
          position: new CANNON.Vec3(pos.x + x, pos.y + 0.34 - 0.21, pos.z + z),
        });
        w.addShape(new CANNON.Sphere(0.34)); // sphere collider rolls smoothly
        w.allowSleep = true; w.sleepSpeedLimit = 0.3; w.sleepTimeLimit = 0.8;
        e.addBody(w);
        const wm = new THREE.Group();
        const tire = stdMesh(wheelGeo, tireMat);
        const hubA = stdMesh(hubGeo, hubMat); hubA.scale.set(0.7, 1, 1);
        wm.add(tire, hubA);
        e.addMesh(wm);
        w.meshRef = wm;
        const hinge = new CANNON.HingeConstraint(chassis, w, {
          pivotA: new CANNON.Vec3(x, -0.21, z), axisA: new CANNON.Vec3(1, 0, 0),
          pivotB: new CANNON.Vec3(0, 0, 0), axisB: new CANNON.Vec3(1, 0, 0),
        });
        hinge.collideConnected = false;
        e.addConstraint(hinge);
      });

      // wheels are stored relative to entity meshes but need individual sync:
      e.customSync = () => {
        e.meshes[0].position.copy(chassis.position);
        e.meshes[0].quaternion.copy(chassis.quaternion);
        for (let i = 1; i < e.meshes.length; i++) {
          const wb = e.bodies[i];
          e.meshes[i].position.copy(wb.position);
          e.meshes[i].quaternion.copy(wb.quaternion);
        }
      };
      e.mass = chassis.mass;
      return e;
    },

    /* ---------- ragdoll dummy ---------- */
    dummy(pos) {
      const e = new Entity('dummy', 'Crash Dummy', { kind: 'dummy', params: {} });
      e.soundType = 'cloth';
      const M = SB.Mats;
      const shirt = M.mat(0xe07b39, { roughness: .85 });
      const pants = M.mat(0x3f5e8c, { roughness: .85 });
      const skin = M.mat(0xe8b98a, { roughness: .7 });
      const shoe = M.mat(0x2c2f33, { roughness: .8 });

      function part(sx, sy, sz, ox, oy, oz, m, sphereR) {
        const b = new CANNON.Body({
          mass: m,
          material: SB.Phys.defaultMat,
          position: new CANNON.Vec3(pos.x + ox, pos.y + oy + 1.05, pos.z + oz),
          linearDamping: 0.08, angularDamping: 0.25,
        });
        if (sphereR) b.addShape(new CANNON.Sphere(sphereR));
        else b.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
        b.allowSleep = true; b.sleepSpeedLimit = 0.35; b.sleepTimeLimit = 0.6;
        e.addBody(b);
        const mesh = sphereR
          ? stdMesh(new THREE.SphereGeometry(sphereR, 16, 12), skin)
          : stdMesh(new THREE.BoxGeometry(sx, sy, sz), m);
        e.addMesh(mesh);
        return b;
      }

      const pelvis = part(0.34, 0.2, 0.23, 0, 0, 0, pants);
      const torso = part(0.4, 0.52, 0.25, 0, 0.37, 0, shirt);
      // head with face texture on front (+Z)
      const headB = new CANNON.Body({
        mass: 1.1, material: SB.Phys.defaultMat,
        position: new CANNON.Vec3(pos.x, pos.y + 0.86 + 1.05, pos.z),
        linearDamping: 0.08, angularDamping: 0.3,
      });
      headB.addShape(new CANNON.Sphere(0.155));
      headB.allowSleep = true; headB.sleepSpeedLimit = 0.35; headB.sleepTimeLimit = 0.6;
      e.addBody(headB);
      const headM = stdMesh(new THREE.SphereGeometry(0.155, 18, 14), skin.clone());
      headM.material.map = SB.Mats.tex.face;
      headM.material.needsUpdate = true;
      e.addMesh(headM);

      const uArmL = part(0.13, 0.34, 0.13, -0.29, 0.48, 0, shirt);
      const uArmR = part(0.13, 0.34, 0.13, 0.29, 0.48, 0, shirt);
      const lArmL = part(0.115, 0.32, 0.115, -0.29, 0.15, 0, skin);
      const lArmR = part(0.115, 0.32, 0.115, 0.29, 0.15, 0, skin);
      const thighL = part(0.15, 0.38, 0.16, -0.1, -0.29, 0, pants);
      const thighR = part(0.15, 0.38, 0.16, 0.1, -0.29, 0, pants);
      const shinL = part(0.13, 0.37, 0.14, -0.1, -0.67, 0, shoe);
      const shinR = part(0.13, 0.37, 0.14, 0.1, -0.67, 0, shoe);

      function joint(a, b, pa, pb, angle, twist) {
        const c = new CANNON.ConeTwistConstraint(a, b, {
          pivotA: new CANNON.Vec3(pa[0], pa[1], pa[2]),
          pivotB: new CANNON.Vec3(pb[0], pb[1], pb[2]),
          axisA: new CANNON.Vec3(0, 1, 0), axisB: new CANNON.Vec3(0, 1, 0),
          angle: angle, twistAngle: twist == null ? Math.PI / 8 : twist,
          maxForce: 1e5,
        });
        c.collideConnected = false;
        e.addConstraint(c);
      }
      joint(pelvis, torso, [0, 0.1, 0], [0, -0.27, 0], Math.PI / 8);
      joint(torso, headB, [0, 0.28, 0], [0, -0.16, 0], Math.PI / 6);
      joint(torso, uArmL, [-0.2, 0.19, 0], [0, 0.18, 0], Math.PI / 2.4);
      joint(torso, uArmR, [0.2, 0.19, 0], [0, 0.18, 0], Math.PI / 2.4);
      joint(uArmL, lArmL, [0, -0.18, 0], [0, 0.17, 0], Math.PI / 5);
      joint(uArmR, lArmR, [0, -0.18, 0], [0, 0.17, 0], Math.PI / 5);
      joint(pelvis, thighL, [-0.1, -0.1, 0], [0, 0.2, 0], Math.PI / 4);
      joint(pelvis, thighR, [0.1, -0.1, 0], [0, 0.2, 0], Math.PI / 4);
      joint(thighL, shinL, [0, -0.2, 0], [0, 0.19, 0], Math.PI / 5);
      joint(thighR, shinR, [0, -0.2, 0], [0, 0.19, 0], Math.PI / 5);

      // group-level sync (each mesh maps 1:1 to each body by index)
      e.customSync = () => {
        for (let i = 0; i < e.bodies.length; i++) {
          e.meshes[i].position.copy(e.bodies[i].position);
          e.meshes[i].quaternion.copy(e.bodies[i].quaternion);
        }
      };
      e.mass = 14;
      e.isDummy = true;
      return e;
    },
  };

  /* ---------- explosive behaviour ---------- */
  function armExplosive(e, cfg) {
    e.explosive = Object.assign({ hp: 10, armed: true }, cfg);
    e.fuseT = 0; // >0 while counting down
    explosives.add(e.id);
    e.onCollide = (other, relVel) => {
      if (!e.explosive || e.fuseT > 0) return;
      const dmg = Math.max(0, Math.abs(relVel) - 4.5);
      if (dmg <= 0) return;
      e.explosive.hp -= dmg;
      if (e.explosive.hp <= 0) ignite(e, 0.05 + Math.random() * 0.1);
    };
  }

  function ignite(e, delay) {
    if (e.fuseT > 0 || e.disposed) return;
    e.fuseT = delay != null ? delay : 1.35;
    e.fuseTotal = e.fuseT;
    e.wakeAll && e.wakeAll();
  }

  function updateExplosives(simDt) {
    for (const id of Array.from(explosives)) {
      const e = all.get(id);
      if (!e) { explosives.delete(id); continue; }
      if (e.fuseT > 0) {
        e.fuseT -= simDt;
        const phase = (performance.now() * 0.001) % 0.3 < 0.15;
        if (e.glowMat && e.glowMat.emissive) e.glowMat.emissive.setHex(phase ? 0xff2200 : 0x220000);
        if (e.meshes[0] && e.kind === 'barrelBoom') {
          e.meshes[0].material.emissive = e.meshes[0].material.emissive || new THREE.Color();
          e.meshes[0].material.emissive.setHex(phase ? 0xaa1400 : 0x000000);
        }
        if ((e._beepAt | 0) !== Math.ceil(e.fuseT / 0.32)) {
          e._beepAt = Math.ceil(e.fuseT / 0.32);
          SB.Audio.beep(e.fuseT < 0.5);
        }
        if (e.fuseT <= 0) detonate(e);
      }
    }
    // scheduled chain booms
    for (let i = pendingBooms.length - 1; i >= 0; i--) {
      const pb = pendingBooms[i];
      pb.at -= simDt;
      if (pb.at <= 0) {
        pendingBooms.splice(i, 1);
        const ent = all.get(pb.entId);
        if (ent && !ent.disposed) detonate(ent);
      }
    }
  }

  function detonate(e) {
    if (e.disposed) return;
    const p = e.bodies[0] ? e.bodies[0].position : { x: 0, y: 1, z: 0 };
    const cfg = e.explosive || { radius: 7, power: 26 };
    e.dispose(false);
    SB.Tools.explode({ x: p.x, y: p.y, z: p.z }, cfg.radius, cfg.power, true);
    SB.FX.debris.burst(p, e.kind === 'barrelBoom' ? 14 : 10, 'metal');
  }

  /* ---------- public API ---------- */

  function spawn(kind, pos, extra) {
    const fn = SPAWNERS[kind];
    if (!fn) return null;
    const e = fn(pos, extra);
    if (e) {
      // normalize applied-mass baseline to the real sum of dynamic parts
      let dyn = 0;
      e.bodies.forEach((b) => { if (b.type === CANNON.Body.DYNAMIC) dyn += b.mass; });
      if (dyn > 0) { e._appliedMass = dyn; e._mass = dyn; }
      if (SB.Tools) SB.Tools.onSpawned(e);
    }
    return e;
  }

  function cloneEntity(ent) {
    if (!ent.def) return null;
    const src = ent.bodies[0];
    if (!src) return null;
    const off = 0.65;
    const pos = { x: src.position.x + off, y: src.position.y + 0.45, z: src.position.z + off * 0.5 };
    const fresh = spawn(ent.def.kind, pos);
    if (fresh) {
      fresh.bodies.forEach(b => b.quaternion.copy(src.quaternion));
      SB.Audio.swish();
      SB.FX.dust(src.position, 5, 0.8);
    }
    return fresh;
  }

  function toggleFreeze(ent) {
    const B = CANNON.Body;
    const first = ent.bodies[0];
    if (!first) return false;
    if (!ent.frozen) {
      ent.frozen = true;
      ent._savedDamp = [first.linearDamping, first.angularDamping];
      ent.bodies.forEach((b) => {
        b.type = B.STATIC;
        b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
        b.updateMassProperties();
        b.aabbNeedsUpdate = true;
      });
      applyFrozenLook(ent, true);
    } else {
      ent.frozen = false;
      ent.bodies.forEach((b) => {
        b.type = B.DYNAMIC;
        b.updateMassProperties();
        b.wakeUp();
        b.aabbNeedsUpdate = true;
      });
      applyFrozenLook(ent, false);
    }
    // wake neighbours so stacks re-settle correctly
    ent.bodies.forEach((b) => {
      const p = b.position;
      SB.world.bodies.forEach((o) => {
        if (o.entityId && o !== b && Math.abs(o.position.x - p.x) < 2.5 &&
            Math.abs(o.position.y - p.y) < 2.5 && Math.abs(o.position.z - p.z) < 2.5) o.wakeUp();
      });
    });
    return ent.frozen;
  }

  function applyFrozenLook(ent, frozenOn) {
    ent.meshes.forEach((m) => {
      m.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.userData.baseMat) o.userData.baseMat = o.material;
        if (frozenOn) {
          if (!o.userData.frozenMat) {
            const f = o.userData.baseMat.clone();
            f.transparent = true; f.opacity = 0.92;
            f.emissive = new THREE.Color(0x2e6f8f);
            f.emissiveIntensity = 0.55;
            o.userData.frozenMat = f;
          }
          o.material = o.userData.frozenMat;
        } else {
          o.material = o.userData.baseMat;
        }
      });
    });
  }

  function get(id) { return all.get(id); }
  function values() { return all.values(); }
  function size() { return all.size; }

  // despawn oldest non-pinned entity when over budget
  function enforceBudget(maxDyn, maxDummies) {
    let dyn = 0, dummies = 0;
    for (const e of all.values()) {
      if (e.pinned) continue;
      dyn += e.bodies.length;
      if (e.isDummy) dummies++;
    }
    const victims = [];
    if (dyn > maxDyn || dummies > maxDummies) {
      for (const e of all.values()) {
        if (e.pinned) continue;
        victims.push(e);
      }
      victims.sort((a, b) => a.id - b.id);
      for (const v of victims) {
        if (dyn <= maxDyn && dummies <= maxDummies) break;
        if (v.disposed) continue;
        dyn -= v.bodies.length;
        if (v.isDummy) dummies--;
        v.dispose(true);
      }
    }
  }

  function clearAll(keepPinned) {
    for (const e of Array.from(all.values())) {
      if (keepPinned && e.pinned) continue;
      if (e === (SB.Tools && SB.Tools.grabbedEnt)) continue;
      e.dispose(false);
    }
    pendingBooms.length = 0;
  }

  function resetVisualState() {
    // called after reset: clear fuse glow leftovers etc.
  }

  return {
    Entity, spawn, cloneEntity, toggleFreeze, get, values, size,
    countDynamicBodies, enforceBudget, clearAll, updateExplosives,
    ignite, armExplosive, pendingBooms, explosives, resetVisualState,
  };
})();
