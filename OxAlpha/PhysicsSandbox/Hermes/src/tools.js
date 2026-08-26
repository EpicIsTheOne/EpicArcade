// Interaction tools: grab/drag/throw, impulse, blast, link/rope, freeze,
// duplicate, delete. Owns pointer routing on the canvas.
window.SB = window.SB || {};
(function () {
  const C = () => window.CANNON;
  const T = () => window.THREE;

  /* ================= links (ropes) ================= */
  const Links = {
    list: [],
    add(constraint, entA, entB) {
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: entA && entB ? 0xd9c07a : 0xbfb49a,
        transparent: true, opacity: 0.95,
      }));
      line.frustumCulled = false;
      SB.scene.add(line);
      const rec = { constraint, entA, entB, line };
      rec.aStatic = !entA; rec.bStatic = !entB;
      // world anchor bodies for ground-anchored ends
      if (!entA) {
        const ab = new CANNON.Body({ mass: 0 });
        ab.addShape(new CANNON.Sphere(0.05));
        ab.collisionResponse = false;
        ab.position.copy(constraint.bodyA.position);
        SB.world.addBody(ab);
        rec.anchorBodyA = ab;
      }
      this.list.push(rec);
      return rec;
    },
    removeAllFor(ent) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const r = this.list[i];
        if (r.entA === ent || r.entB === ent) this.removeAt(i);
      }
    },
    removeAt(i) {
      const r = this.list[i];
      try { SB.world.removeConstraint(r.constraint); } catch (e) {}
      if (r.anchorBodyA) { try { SB.world.removeBody(r.anchorBodyA); } catch (e) {} }
      if (r.anchorBodyB) { try { SB.world.removeBody(r.anchorBodyB); } catch (e) {} }
      SB.scene.remove(r.line);
      r.line.geometry.dispose(); r.line.material.dispose();
      this.list.splice(i, 1);
    },
    clear() { while (this.list.length) this.removeAt(this.list.length - 1); },
    update() {
      const tmp = [];
      for (const r of this.list) {
        const pa = (r.entA ? r.entA.bodies[0].position : r.constraint.bodyA.position);
        const pb = (r.entB ? r.entB.bodies[0].position : r.constraint.bodyB.position);
        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
        const rest = r.constraint.distance || dist;
        const sag = Math.max(0, rest - dist) * 2.4 + dist * 0.02;
        const pos = r.line.geometry.attributes.position;
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const x = pa.x + (pb.x - pa.x) * t;
          const y = pa.y + (pb.y - pa.y) * t - Math.sin(t * Math.PI) * sag;
          const z = pa.z + (pb.z - pa.z) * t;
          pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
      }
    },
    count() { return this.list.length; },
  };

  /* ================= tools ================= */
  const TOOLS = ['grab', 'impulse', 'blast', 'link', 'freeze', 'dup', 'delete'];

  const Tools = {
    current: 'grab',
    hoveredEnt: null,
    grabbedEnt: null,
    pendingLink: null,   // {ent} awaiting second click
    raycaster: null,
    ndc: new THREE.Vector2(),
    pointerOnCanvas: false,
    orbiting: false,

    init() {
      this.raycaster = new THREE.Raycaster();
      const el = SB.renderer.domElement;

      el.addEventListener('pointermove', (e) => {
        this.updateNDC(e);
        this.pointerOnCanvas = true;
        if (this.dragging) this.moveDrag();
        else if (!this.orbiting) this.updateHover();
        if (this.pendingLink) this.updateLinkPreview();
      });
      el.addEventListener('pointerleave', () => {
        this.pointerOnCanvas = false;
        this.setHover(null);
      });

      el.addEventListener('pointerdown', (e) => {
        SB.Audio.resume();
        if (e.button !== 0) return;
        this.updateNDC(e);
        const hit = this.pick();
        const ent = hit && hit.entId ? SB.Entities.get(hit.entId) : null;
        switch (this.current) {
          case 'grab': {
            if (!ent) return;
            const dyn = ent.bodies.find(b => b.type === CANNON.Body.DYNAMIC);
            if (!dyn) {
              if (ent.frozen) SB.UI.toast('Frozen — unfreeze first (F)');
              return;
            }
            this.beginDrag(ent, dyn, hit.point);
            break;
          }
          case 'impulse':
            if (ent) this.impulse(ent, hit.point);
            break;
          case 'blast': {
            const p = hit ? hit.point : this.groundPointFallback();
            this.explode(p, 7.2, 27, false);
            break;
          }
          case 'link':
            if (ent || (hit && hit.point)) this.linkStep(ent, hit ? hit.point : null);
            break;
          case 'freeze':
            if (ent && !ent.pinned) {
              const nowFrozen = SB.Entities.toggleFreeze(ent);
              SB.Audio.thud(0.4, 900);
              SB.UI.toast(nowFrozen ? `${ent.label} frozen` : `${ent.label} unfrozen`);
              SB.UI.refreshBadge();
            } else if (ent && ent.pinned) {
              SB.UI.toast(`${ent.label} is part of the playground`);
            }
            break;
          case 'dup':
            if (ent && ent.def) {
              const fresh = SB.Entities.cloneEntity(ent);
              SB.UI.toast(fresh ? `${ent.label} duplicated` : "Can't duplicate this");
            }
            break;
          case 'delete':
            if (ent && !ent.pinned) {
              ent.dispose(true);
              SB.UI.toast('Removed');
            } else if (ent && ent.pinned) {
              SB.UI.toast(`${ent.label} is part of the playground`);
            }
            break;
        }
      });

      // wheel: adjust drag distance while holding, else let OrbitControls zoom
      el.addEventListener('wheel', (e) => {
        if (this.dragging) {
          e.preventDefault(); e.stopPropagation();
          this.dragDist = Math.min(45, Math.max(2, this.dragDist * Math.exp(e.deltaY * 0.0009)));
          this.moveDrag();
        }
      }, { capture: true, passive: false });

      // release / cancel the grab wherever the pointer is
      const release = (e) => {
        if (e.button != null && e.button !== 0 && e.type === 'pointerup') return;
        if (!this.dragConstraint) return;
        this.updateNDC(e);
        this.moveDrag();
        this.endDrag(false);
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', () => { if (this.dragConstraint) this.endDrag(true); });
      window.addEventListener('blur', () => { if (this.dragConstraint) this.endDrag(true); });

      // outline pool
      this.outlineMatSoft = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.22, depthWrite: false });
      this.outlineMatStrong = new THREE.MeshBasicMaterial({ color: 0xffb454, side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false });
      this._outline = null; // {mesh, entId}
    },

    updateNDC(e) {
      const r = SB.renderer.domElement.getBoundingClientRect();
      this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.clientX = e.clientX; this.clientY = e.clientY;
      if (this.hoveredEnt && !this.orbiting) SB.UI.positionBadge(e.clientX, e.clientY);
    },

    pick() {
      this.raycaster.setFromCamera(this.ndc, SB.camera);
      const hits = this.raycaster.intersectObjects(SB.scene.children, true);
      for (const h of hits) {
        if (!h.object.isMesh && !h.object.isGroup) continue;
        if (h.object.isInstancedMesh) continue;
        if (h.object.userData && h.object.userData.noPick) continue;
        if (h.distance < 0.5) continue;
        let o = h.object, entId = null;
        while (o) {
          if (o.userData && o.userData.entId != null) { entId = o.userData.entId; break; }
          o = o.parent;
        }
        return { point: h.point, entId, distance: h.distance, object: h.object };
      }
      return null;
    },

    groundPointFallback() {
      this.raycaster.setFromCamera(this.ndc, SB.camera);
      const ro = this.raycaster.ray.origin, rd = this.raycaster.ray.direction;
      if (rd.y < -0.02) {
        const t = -ro.y / rd.y;
        const p = ro.clone().addScaledVector(rd, t);
        p.x = Math.max(-40, Math.min(40, p.x));
        p.z = Math.max(-40, Math.min(40, p.z));
        return { x: p.x, y: Math.max(0.05, p.y), z: p.z };
      }
      const p = ro.clone().addScaledVector(rd, 24);
      return { x: p.x, y: Math.max(0.6, p.y), z: p.z };
    },

    /* ---------- hover ---------- */
    setHover(ent) {
      if (this.hoveredEnt === ent) return;
      this.hoveredEnt = ent;
      this.refreshOutline();
      if (SB.UI) SB.UI.onHover(ent);
    },
    updateHover() {
      if (!this.pointerOnCanvas) return;
      const hit = this.pick();
      const ent = hit && hit.entId ? SB.Entities.get(hit.entId) : null;
      this.setHover(ent && !ent.disposed ? ent : null);
      if (hit) this._lastHit = hit;
    },

    refreshOutline() {
      if (this._outline) {
        SB.scene.remove(this._outline);
        this._outline = null;
      }
      const ent = this.grabbedEnt || this.hoveredEnt;
      if (!ent || ent.disposed) return;
      if (ent.frozen && this.grabbedEnt !== ent) return; // frozen look is enough
      const src = ent.meshes[0];
      if (!src) return;
      const wrapper = src.clone(true);
      wrapper.traverse((o) => {
        o.castShadow = false; o.receiveShadow = false;
        o.material = this.grabbedEnt === ent ? this.outlineMatStrong : this.outlineMatSoft;
      });
      SB.scene.add(wrapper);
      this._outline = wrapper;
      this._outlineEntId = ent.id;
    },

    syncOutline() {
      const ent = this.grabbedEnt || this.hoveredEnt;
      if (!this._outline) return;
      if (!ent || ent.disposed || this._outlineEntId !== ent.id) { this.refreshOutline(); return; }
      const b = ent.bodies[0];
      this._outline.position.copy(b.position);
      this._outline.quaternion.copy(b.quaternion);
      const pulse = 1.055 + Math.sin(performance.now() * 0.008) * 0.008;
      this._outline.scale.setScalar(pulse);
    },

    /* ---------- grab ---------- */
    beginDrag(ent, body, hitPoint) {
      if (this.grabbedEnt) this.endDrag();
      this.cancelLink();
      const jb = this.ensureJointBody();
      jb.position.copy(hitPoint);
      const pivot = body.pointToLocalFrame(new CANNON.Vec3(hitPoint.x, hitPoint.y, hitPoint.z));
      this.dragConstraint = new CANNON.PointToPointConstraint(
        body, pivot, jb, new CANNON.Vec3(0, 0, 0),
        Math.max(120, body.mass * 320)
      );
      this.dragConstraint.collideConnected = false;
      SB.world.addConstraint(this.dragConstraint);
      this.grabbedEnt = ent;
      this.grabbedBody = body;
      this.jointBody = jb;
      const cp = SB.camera.position;
      this.dragDist = Math.max(2, Math.min(45, Math.hypot(cp.x - hitPoint.x, cp.y - hitPoint.y, cp.z - hitPoint.z)));
      this.samples = [{ t: performance.now(), p: hitPoint.clone ? hitPoint.clone() : new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z) }];
      body.allowSleep = false;
      body.wakeUp();
      document.body.classList.add('dragging');
      this.refreshOutline();
      this.makeGrabLine();
      SB.Audio.swish();
    },
    makeGrabLine() {
      this.removeGrabLine();
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.grabLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffb454, transparent: true, opacity: 0.65,
      }));
      this.grabLine.frustumCulled = false;
      this.grabLine.userData.noPick = true;
      SB.scene.add(this.grabLine);
    },
    removeGrabLine() {
      if (this.grabLine) {
        SB.scene.remove(this.grabLine);
        this.grabLine.geometry.dispose();
        this.grabLine = null;
      }
    },
    ensureJointBody() {
      if (!this._jointBody) {
        const jb = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
        jb.addShape(new CANNON.Sphere(0.08));
        jb.collisionFilterGroup = 0;
        jb.collisionFilterMask = 0;
        SB.world.addBody(jb);
        this._jointBody = jb;
      }
      return this._jointBody;
    },
    moveDrag() {
      if (!this.dragConstraint) return;
      this.raycaster.setFromCamera(this.ndc, SB.camera);
      const target = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, this.dragDist);
      target.y = Math.max(-0.4, Math.min(38, target.y));
      target.x = Math.max(-70, Math.min(70, target.x));
      target.z = Math.max(-70, Math.min(70, target.z));
      this._dragTarget = target;
      this.jointBody.position.copy(target);
      if (this.grabLine) {
        const cam = SB.camera.position;
        const dirv = this.raycaster.ray.direction;
        const pos = this.grabLine.geometry.attributes.position;
        pos.setXYZ(0, cam.x + dirv.x * 1.1, cam.y + dirv.y * 1.1 - 0.25, cam.z + dirv.z * 1.1);
        pos.setXYZ(1, target.x, target.y, target.z);
        pos.needsUpdate = true;
      }
      const now = performance.now();
      this.samples.push({ t: now, p: target.clone() });
      while (this.samples.length > 6 || (this.samples.length > 2 && now - this.samples[0].t > 130)) this.samples.shift();
      const b = this.grabbedBody;
      if (b) b.wakeUp();
    },
    endDrag(cancel) {
      const c = this.dragConstraint;
      if (c) {
        SB.world.removeConstraint(c);
        this.dragConstraint = null;
      }
      this.removeGrabLine();
      const ent = this.grabbedEnt, body = this.grabbedBody;
      this.grabbedEnt = null; this.grabbedBody = null;
      document.body.classList.remove('dragging');
      if (body) {
        body.allowSleep = true;
        if (!cancel && this.samples && this.samples.length >= 2) {
          const a = this.samples[0], z = this.samples[this.samples.length - 1];
          const dt = Math.max(0.03, (z.t - a.t) / 1000);
          const v = new THREE.Vector3().subVectors(z.p, a.p).multiplyScalar(1 / dt);
          const sp = v.length();
          if (sp > 1.5) {
            const capped = Math.min(sp, 26) / sp;
            body.velocity.x += v.x * capped * 0.92;
            body.velocity.y += v.y * capped * 0.92 + 0.7;
            body.velocity.z += v.z * capped * 0.92;
            body.wakeUp();
          }
        }
      }
      this.refreshOutline();
    },

    /* ---------- impulse ---------- */
    impulse(ent, point) {
      const b = ent.bodies.find(x => x.type === CANNON.Body.DYNAMIC);
      if (!b) return;
      this.raycaster.setFromCamera(this.ndc, SB.camera);
      const dir = this.raycaster.ray.direction;
      const k = Math.min(2.4, Math.max(0.28, Math.pow(7 / Math.max(0.6, b.mass), 0.55)));
      const dv = 13.5 * k;
      b.applyImpulse(
        new CANNON.Vec3(dir.x * dv * b.mass, dir.y * dv * b.mass + 2.0 * k * b.mass, dir.z * dv * b.mass),
        new CANNON.Vec3(point.x - b.position.x, point.y - b.position.y, point.z - b.position.z)
      );
      b.wakeUp();
      SB.Audio.pop();
      SB.FX.spark(point, 10, 7, null, 1, 0.85, 0.4);
      SB.FX.shake(0.12);
    },

    /* ---------- explosion ---------- */
    explode(point, radius, power, chainSource) {
      radius = radius || 7.2; power = power || 27;
      const P = new CANNON.Vec3(point.x, point.y, point.z);
      const shatterList = [], affected = [];
      for (const b of SB.world.bodies) {
        if (!b.entityId) continue;
        if (b.type !== CANNON.Body.DYNAMIC) {
          const oe = SB.Entities.get(b.entityId);
          if (oe && oe.frozen && b.position.distanceTo(P) < radius * 0.9) shatterList.push(oe);
          continue;
        }
        const d = b.position.distanceTo(P);
        if (d > radius * 1.25) continue;
        const fall = Math.max(0, 1 - d / radius);
        const k = Math.min(2.4, Math.max(0.3, Math.pow(7 / Math.max(0.6, b.mass), 0.55)));
        const dirv = new CANNON.Vec3(b.position.x - P.x, b.position.y - P.y + 0.6, b.position.z - P.z);
        if (dirv.length() < 0.05) dirv.set(0, 1, 0);
        dirv.normalize();
        const dv = power * fall * k;
        b.velocity.x += dirv.x * dv;
        b.velocity.y += dirv.y * dv + 1.2 * fall;
        b.velocity.z += dirv.z * dv;
        const sp2 = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2 + b.velocity.z ** 2);
        if (sp2 > 42) { const s = 42 / sp2; b.velocity.scale(s, b.velocity); }
        b.angularVelocity.x += (Math.random() - .5) * fall * 9;
        b.angularVelocity.y += (Math.random() - .5) * fall * 9;
        b.angularVelocity.z += (Math.random() - .5) * fall * 9;
        b.wakeUp();
        const oe = SB.Entities.get(b.entityId);
        if (oe) affected.push(oe);
      }
      // chain-detonate other explosives (the detonating one is already disposed)
      const seen = new Set();
      for (const oe of affected) {
        if (seen.has(oe.id)) continue;
        seen.add(oe.id);
        if (oe.explosive && oe.fuseT <= 0 && !oe.disposed) {
          const d = oe.bodies[0].position.distanceTo(P);
          if (d < radius * 1.1) SB.Entities.ignite(oe, 0.12 + Math.random() * 0.3);
        }
      }
      for (const oe of shatterList) {
        if (!oe.disposed) {
          SB.FX.shatterFX(oe.bodies[0].position);
          oe.dispose(false);
        }
      }
      SB.FX.explosion(P, power);
      if (SB.Stats) SB.Stats.booms++;
    },

    /* ---------- link ---------- */
    linkStep(ent, point) {
      if (!this.pendingLink) {
        if (ent) {
          this.pendingLink = { ent };
          SB.Audio.thud(0.3, 700);
          SB.UI.toast('Now click a second object to link');
          this.makePreview();
        } else if (point) {
          // anchor to world
          const anchorEnt = new SB.Entities.Entity('anchor', 'Anchor', null);
          anchorEnt.soundType = 'none';
          const ab = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
          ab.addShape(new CANNON.Sphere(0.06));
          ab.collisionResponse = false;
          ab.position.set(point.x, point.y, point.z);
          anchorEnt.addBody(ab);
          const marker = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xd9c07a }));
          marker.position.copy(ab.position);
          marker.userData.noPick = true;
          anchorEnt.addMesh(marker);
          anchorEnt.customSync = () => { marker.position.copy(ab.position); };
          this.pendingLink = { ent: anchorEnt, isAnchor: true };
          SB.Audio.thud(0.3, 700);
          SB.UI.toast('Anchor placed — click a second object to link');
          this.makePreview();
        }
        return;
      }
      // second pick
      const A = this.pendingLink.ent;
      if (!ent || ent === A) {
        if (ent === A) { this.cancelLink(); SB.UI.toast('Link cancelled'); }
        else SB.UI.toast('Click an object to attach the link');
        return;
      }
      A.link(ent);
      SB.Audio.metal(0.35, 900);
      SB.FX.spark(A.bodies[0].position, 6, 4, null, 0.85, 0.8, 0.55);
      this.clearPending(false);
      SB.UI.toast('Linked!');
    },
    makePreview() {
      this.clearPreview();
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.previewLine = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: 0xffb454, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.9,
      }));
      this.previewLine.frustumCulled = false;
      SB.scene.add(this.previewLine);
    },
    updateLinkPreview() {
      if (!this.previewLine || !this.pendingLink) return;
      const a = this.pendingLink.ent.bodies[0].position;
      const bp = this._lastHit ? this._lastHit.point : this.groundPointFallback();
      const pos = this.previewLine.geometry.attributes.position;
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, bp.x, bp.y, bp.z);
      pos.needsUpdate = true;
      this.previewLine.computeLineDistances();
    },
    clearPreview() {
      if (this.previewLine) {
        SB.scene.remove(this.previewLine);
        this.previewLine.geometry.dispose();
        this.previewLine = null;
      }
    },
    clearPending(removeAnchor) {
      if (this.pendingLink && this.pendingLink.isAnchor && removeAnchor !== false) {
        this.pendingLink.ent.dispose(false);
      }
      this.pendingLink = null;
      this.clearPreview();
    },
    cancelLink() {
      if (this.pendingLink) {
        this.clearPending(true);
        SB.UI && SB.UI.toast('Link cancelled');
      }
    },

    /* ---------- lifecycle hooks used by Entities ---------- */
    onSpawned(ent) {},
    notifyDisposed(ent) {
      if (this.grabbedEnt === ent) this.endDrag(true);
      if (this.hoveredEnt === ent) this.setHover(null);
      if (this.pendingLink && this.pendingLink.ent === ent) this.clearPending(false);
    },

    setTool(name) {
      if (!TOOLS.includes(name)) return;
      if (this.current === 'link' && name !== 'link') this.cancelLink();
      this.current = name;
      document.body.className = document.body.className.replace(/tool-\w+/g, '').trim();
      document.body.classList.add('tool-' + name);
      if (SB.UI) SB.UI.syncDock(name);
    },

    tick(dt, simDt) {
      // hold the grabbed body awake + keep constraint target fresh
      if (this.dragConstraint && this.grabbedBody) {
        this.grabbedBody.wakeUp();
      }
      this.syncOutline();
      Links.update();
      // fuse blink for explosive barrels handled in Entities.updateExplosives
    },
  };

  SB.Tools = Tools;
  SB.Links = Links;
})();
