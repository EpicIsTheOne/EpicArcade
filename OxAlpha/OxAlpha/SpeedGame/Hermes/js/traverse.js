/* ============================================================
   VOLT RUSH — traverse.js
   Traversal objects: grind rails, launch springs, dash panels,
   moving platforms, loop tracks, checkpoint/finish gates,
   updraft columns, wallrun walls.
   ============================================================ */
(function () {
  'use strict';
  const T = () => (typeof window !== 'undefined' && window.THREE) || (typeof global !== 'undefined' && global.THREE);
  const VM = () => window.VoltMath;

  function stdMat(color, rough = 0.5, metal = 0.4) {
    return new (T().MeshStandardMaterial)({ color, roughness: rough, metalness: metal });
  }
  function emat(color, ei = 1.8) {
    return new (T().MeshStandardMaterial)({ color, emissive: color, emissiveIntensity: ei, roughness: 0.35, metalness: 0.2 });
  }

  /* ---------------- GRIND RAIL ---------------- */
  class Rail {
    constructor(scene, points, opts = {}) {
      this.spline = new (VM().CatmullRom3)(points, !!opts.closed);
      this.alive = true;
      this.kind = 'rail';
      const self = this;
      // THREE.Curve adapter over arc-length parameterization
      const Curve = T().Curve;
      class Adapter extends Curve {
        getPoint(t) {
          const p = self.spline.getPointAt(Math.max(0.0001, Math.min(0.9999, t)) * self.spline.totalLength, {});
          return new (T().Vector3)(p.x, p.y, p.z);
        }
      }
      const segs = Math.max(32, Math.min(220, Math.round(this.spline.totalLength * 3)));
      const tube = new (T().TubeGeometry)(new Adapter(), segs, 0.09, 6, !!opts.closed);
      const mat = new (T().MeshStandardMaterial)({
        color: opts.color || 0x59e8ff, emissive: opts.color || 0x38d6ff,
        emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.7,
      });
      this.mesh = new (T().Mesh)(tube, mat);
      scene.add(this.mesh);
      // support posts every ~12m
      const postMat = stdMat(0x2a3550, 0.5, 0.6);
      this.posts = [];
      for (let s = 4; s < this.spline.totalLength - 2; s += 12) {
        const p = this.spline.getPointAt(s, {});
        // find ground: cast down by scanning colliders later; visual post fixed length
        const post = new (T().Mesh)(new (T().CylinderGeometry)(0.06, 0.08, 6, 6), postMat);
        post.position.set(p.x, p.y - 3, p.z);
        scene.add(post);
        this.posts.push(post);
      }
    }
    dispose(scene) { scene.remove(this.mesh); this.posts.forEach(p => scene.remove(p)); }
  }

  /* ---------------- LAUNCH SPRING ---------------- */
  class Spring {
    constructor(scene, x, y, z, opts = {}) {
      this.pos = { x, y, z };
      this.power = opts.power || 30;
      this.dirY = opts.dirY !== undefined ? opts.dirY : 1;
      this.fwd = opts.fwd || null;    // optional {x,z} forward add
      this.fwdSpeed = opts.fwdSpeed || 0;
      this.kind = 'spring';
      this.alive = true;
      this.cool = 0;
      this.anim = 0;
      const g = new (T().Group)();
      g.position.set(x, y, z);
      const base = new (T().Mesh)(new (T().CylinderGeometry)(0.85, 1.0, 0.3, 14), stdMat(0x303a58, 0.45, 0.5));
      base.position.y = 0.15;
      g.add(base);
      const coil = new (T().Mesh)(new (T().CylinderGeometry)(0.55, 0.55, 0.34, 10), stdMat(0x8892aa, 0.35, 0.8));
      coil.position.y = 0.44;
      g.add(coil);
      const cap = new (T().Mesh)(new (T().CylinderGeometry)(0.95, 0.95, 0.18, 14),
        emat(opts.color || 0xffc93c, 1.8));
      cap.position.y = 0.68;
      g.add(cap);
      this.cap = cap; this.coil = coil;
      this.group = g;
      scene.add(g);
    }
    update(dt) {
      this.cool = Math.max(0, this.cool - dt);
      if (this.anim > 0) {
        this.anim = Math.max(0, this.anim - dt * 4);
        const s = 1 - this.anim * 0.5;
        this.cap.position.y = 0.68 - this.anim * 0.3;
        this.coil.scale.set(1, s, 1);
      }
    }
    fire(player, audio) {
      if (this.cool > 0) return false;
      this.cool = 0.4; this.anim = 1;
      player.vel.y = Math.max(player.vel.y, 0) + this.power * this.dirY;
      if (this.fwd) {
        player.vel.x += this.fwd.x * this.fwdSpeed;
        player.vel.z += this.fwd.z * this.fwdSpeed;
      }
      player.airJumps = 1;
      if (audio) audio.play('spring');
      return true;
    }
  }

  /* ---------------- DASH PANEL ---------------- */
  class DashPanel {
    constructor(scene, x, y, z, dirX, dirZ, opts = {}) {
      this.pos = { x, y, z };
      const L = Math.hypot(dirX, dirZ) || 1;
      this.dir = { x: dirX / L, z: dirZ / L };
      this.speed = opts.speed || 42;
      this.boostTime = opts.boostTime || 1.1;
      this.kind = 'panel';
      this.alive = true;
      this.lastFire = -99;
      const g = new (T().Group)();
      g.position.set(x, y + 0.06, z);
      g.rotation.y = Math.atan2(dirX, dirZ);
      const pad = new (T().Mesh)(new (T().BoxGeometry)(2.6, 0.12, 4.2), stdMat(0x141b30, 0.4, 0.5));
      g.add(pad);
      // chevrons pointing +Z local (direction of travel)
      for (let i = 0; i < 3; i++) {
        const ch = new (T().Mesh)(new (T().BoxGeometry)(1.9, 0.05, 0.42),
          emat(opts.color || 0x37f0ff, 2.0));
        ch.position.set(0, 0.09, -1.2 + i * 1.1);
        ch.rotation.x = 0.5;
        g.add(ch);
      }
      this.group = g;
      this.mats = [];
      g.traverse(o => { if (o.material && o.material.emissive) this.mats.push(o.material); });
      this.pulse = Math.random() * 10;
      scene.add(g);
    }
    update(dt, time) {
      const k = 1.4 + Math.sin(time * 6 + this.pulse) * 0.7;
      for (const m of this.mats) m.emissiveIntensity = k;
    }
    tryFire(player, time, audio) {
      if (time - this.lastFire < 1.0) return false;
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      if (dx * dx + dz * dz > 6.5) return false;
      if (Math.abs((player.pos.y + 0.4) - this.pos.y) > 1.6) return false;
      this.lastFire = time;
      player.vel.x = this.dir.x * this.speed;
      player.vel.z = this.dir.z * this.speed;
      player._applyBoost(this.boostTime, this.speed);
      if (audio) audio.play('panel');
      return true;
    }
  }

  /* ---------------- MOVING PLATFORM ---------------- */
  class MovingPlatform {
    constructor(scene, world, waypoints, opts = {}) {
      this.wps = waypoints.map(w => ({ ...w }));
      this.speed = opts.speed || 3.2;
      this.size = opts.size || { x: 6, y: 0.7, z: 6 };
      this.t = 0; this.seg = 0; this.dirSign = 1;
      this.kind = 'platform';
      this.alive = true;
      this.delta = { x: 0, y: 0, z: 0 };
      const w = this.wps[0];
      this.pos = { x: w.x, y: w.y, z: w.z };

      const geo = new (T().BoxGeometry)(this.size.x, this.size.y, this.size.z);
      const mat = stdMat(opts.color || 0x39456a, 0.45, 0.55);
      this.mesh = new (T().Mesh)(geo, mat);
      this.mesh.castShadow = true; this.mesh.receiveShadow = true;
      this.mesh.position.set(w.x, w.y, w.z);
      scene.add(this.mesh);
      // neon edge strip
      const strip = new (T().Mesh)(new (T().BoxGeometry)(this.size.x * 0.94, 0.06, 0.24),
        emat(opts.accent || 0x37f0ff, 1.6));
      strip.position.set(0, this.size.y / 2 + 0.02, this.size.z / 2 - 0.2);
      this.mesh.add(strip);

      this.collider = world.addCollider({
        kind: 'box', type: 'solid',
        min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 },
        platform: this, tag: 'moving',
      });
      this._syncCollider();
    }
    _syncCollider() {
      const sx = this.size.x / 2, sy = this.size.y / 2, sz = this.size.z / 2;
      const c = this.collider;
      c.min.x = this.pos.x - sx; c.max.x = this.pos.x + sx;
      c.min.y = this.pos.y - sy; c.max.y = this.pos.y + sy;
      c.min.z = this.pos.z - sz; c.max.z = this.pos.z + sz;
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    }
    update(dt) {
      if (this.wps.length < 2) return;
      let remaining = dt * this.speed;
      let guard = 0;
      while (remaining > 0 && guard++ < 8) {
        const cur = this.wps[this.seg];
        const nxt = this.wps[this._nextIdx()];
        const dx = nxt.x - cur.x, dy = nxt.y - cur.y, dz = nxt.z - cur.z;
        const L = Math.hypot(dx, dy, dz) || 1;
        const segRemain = (1 - (this._segF || 0)) * L;
        if (remaining >= segRemain) {
          remaining -= segRemain;
          this.seg = this._nextIdx();
          this._segF = 0;
          if (!this.loopMode && this._atEnd()) this.dirSign *= -1;
        } else {
          this._segF += remaining / L;
          remaining = 0;
        }
      }
      const cur = this.wps[this.seg];
      const nxt = this.wps[this._nextIdx()];
      const f = this._segF || 0;
      const old = { ...this.pos };
      this.pos.x = cur.x + (nxt.x - cur.x) * f;
      this.pos.y = cur.y + (nxt.y - cur.y) * f;
      this.pos.z = cur.z + (nxt.z - cur.z) * f;
      this.delta.x = this.pos.x - old.x;
      this.delta.y = this.pos.y - old.y;
      this.delta.z = this.pos.z - old.z;
      this._syncCollider();
    }
    _nextIdx() {
      let n = this.seg + this.dirSign;
      if (n >= this.wps.length) n = this.wps.length - 2 >= 0 ? this.wps.length - 2 : 0;
      if (n < 0) n = Math.min(1, this.wps.length - 1);
      return n;
    }
    _atEnd() { return this.seg === 0 || this.seg === this.wps.length - 1; }
  }

  /* ---------------- LOOP TRACK ---------------- */
  class LoopTrack {
    constructor(scene, cx, cy, cz, radius, rotY = 0, opts = {}) {
      this.kind = 'loop';
      this.alive = true;
      this.center = { x: cx, y: cy + radius, z: cz };
      // Circle in the YZ plane (travel along ±Z), rotated around Y by rotY.
      // Parametrize so s=0 is the bottom (entry), rising toward +Z first.
      const pts = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const a = -Math.PI / 2 + (i / N) * Math.PI * 2;   // -90° .. +270°
        // bottom at a=-90° (y=0,z=0), tangent +Z there, top (y=2r) at a=+90°
        const yy = radius + radius * Math.sin(a);
        const zz = radius * Math.cos(a);
        const wx = zz * Math.sin(rotY);
        const wz = zz * Math.cos(rotY);
        pts.push({ x: cx + wx, y: cy + yy, z: cz + wz });
        if (i === N) break; // open spline ending back at start point
      }
      this.spline = new (VM().CatmullRom3)(pts, false);
      // duplicate first point so end == start visually
      pts.push({ ...pts[0] });
      this.splineFull = new (VM().CatmullRom3)(pts, false);

      const self = this;
      const Curve = T().Curve;
      class Adapter extends Curve {
        getPoint(t) {
          const s = self.splineFull.getPointAt(Math.max(0.0001, Math.min(0.9999, t)) * self.splineFull.totalLength, {});
          return new (T().Vector3)(s.x, s.y, s.z);
        }
      }
      const tube = new (T().TubeGeometry)(new Adapter(), 72, 0.16, 6, false);
      const mat = emat(opts.color || 0xb44dff, 1.3);
      this.mesh = new (T().Mesh)(tube, mat);
      scene.add(this.mesh);
      this.radius = radius;
    }
  }

  /* ---------------- CHECKPOINT GATE ---------------- */
  class Checkpoint {
    constructor(scene, world, x, y, z, yaw, idx) {
      this.kind = 'checkpoint';
      this.idx = idx;
      this.alive = true;
      this.pos = { x, y, z };
      const g = new (T().Group)();
      g.position.set(x, y, z);
      g.rotation.y = yaw;
      const pillarG = new (T().CylinderGeometry)(0.22, 0.28, 5.2, 8);
      const pm = stdMat(0x27304e, 0.45, 0.55);
      const l = new (T().Mesh)(pillarG, pm); l.position.set(-2.2, 2.6, 0);
      const r = new (T().Mesh)(pillarG, pm); r.position.set(2.2, 2.6, 0);
      g.add(l, r);
      const top = new (T().Mesh)(new (T().BoxGeometry)(5.0, 0.5, 0.5), pm);
      top.position.y = 5.2; g.add(top);
      this.lampMats = [];
      for (const px of [-2.2, 0, 2.2]) {
        const lamp = new (T().Mesh)(new (T().SphereGeometry)(0.16, 8, 8),
          emat(0xffc93c, 1.6));
        lamp.position.set(px, px === 0 ? 5.55 : 5.0, 0);
        g.add(lamp);
        this.lampMats.push(lamp.material);
      }
      this.group = g;
      scene.add(g);
      world.addTrigger({
        min: { x: x - 2.4, y: y, z: z - 1.4 },
        max: { x: x + 2.4, y: y + 5, z: z + 1.4 },
        once: false,
        ref: this,
      });
    }
    setLit(on) {
      for (const m of this.lampMats) {
        m.color.setHex(on ? 0x51ff7e : 0xffc93c);
        m.emissive.setHex(on ? 0x51ff7e : 0xffc93c);
      }
    }
  }

  /* ---------------- FINISH GATE ---------------- */
  class FinishGate {
    constructor(scene, world, x, y, z, yaw) {
      this.kind = 'finish';
      this.pos = { x, y, z };
      const g = new (T().Group)();
      g.position.set(x, y, z);
      g.rotation.y = yaw;
      const pm = stdMat(0x20284a, 0.4, 0.6);
      for (const s of [-1, 1]) {
        const pil = new (T().Mesh)(new (T().BoxGeometry)(0.7, 7.5, 0.7), pm);
        pil.position.set(s * 3.2, 3.75, 0);
        g.add(pil);
      }
      const banner = new (T().Mesh)(new (T().BoxGeometry)(7.2, 1.4, 0.3), emat(0x37f0ff, 1.5));
      banner.position.y = 7.2;
      g.add(banner);
      const stripe = new (T().Mesh)(new (T().PlaneGeometry)(6.2, 5.6),
        new (T().MeshBasicMaterial)({
          color: 0x37f0ff, transparent: true, opacity: 0.10,
          side: T().DoubleSide, depthWrite: false,
        }));
      stripe.position.y = 3.2;
      g.add(stripe);
      this.group = g;
      scene.add(g);
      world.addTrigger({
        min: { x: x - 3, y: y, z: z - 1.6 },
        max: { x: x + 3, y: y + 6.4, z: z + 1.6 },
        once: true,
        ref: this,
      });
    }
  }

  /* ---------------- UPDRAFT COLUMN ---------------- */
  class Updraft {
    constructor(scene, world, x, y, z, h = 26, r = 3.4, strength = 1) {
      this.kind = 'updraft';
      this.alive = true;
      world.addVolume({ type: 'updraft', strength,
        min: { x: x - r, y: y, z: z - r },
        max: { x: x + r, y: y + h, z: z + r } });
      const geo = new (T().CylinderGeometry)(r, r * 0.7, h, 16, 1, true);
      const mat = new (T().MeshBasicMaterial)({
        color: 0x66ccff, transparent: true, opacity: 0.10,
        side: T().DoubleSide, depthWrite: false,
      });
      this.mesh = new (T().Mesh)(geo, mat);
      this.mesh.position.set(x, y + h / 2, z);
      scene.add(this.mesh);
      const ring = new (T().Mesh)(new (T().TorusGeometry)(r * 0.75, 0.1, 6, 24), emat(0x66ccff, 1.4));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 0.3, z);
      scene.add(ring);
      this.ring = ring;
    }
    update(dt, time) {
      this.ring.rotation.z = time * 2;
      this.ring.position.y += Math.sin(time * 3) * dt * 2;
    }
  }

  /* ---------------- WALLRUN WALL ---------------- */
  class RunWall {
    constructor(scene, world, x, y, z, sx, sy, sz, yaw = 0) {
      this.kind = 'wall';
      this.alive = true;
      // NOTE: rotated boxes complicate AABB collision; support only 0/90° yaws
      const rot = ((yaw % Math.PI) + Math.PI) % Math.PI;
      const swap = Math.abs(rot - Math.PI / 2) < 0.01;
      const ex = swap ? sz : sx, ez = swap ? sx : sz;
      world.addCollider(makeAABB(x, y + sy / 2, z, ex, sy, ez, 'wallrun', 'wall'));
      const geo = new (T().BoxGeometry)(sx, sy, sz);
      const mat = stdMat(0x2c3654, 0.5, 0.45);
      this.mesh = new (T().Mesh)(geo, mat);
      this.mesh.position.set(x, y + sy / 2, z);
      this.mesh.rotation.y = yaw;
      scene.add(this.mesh);
      // glow lines
      const line = new (T().Mesh)(new (T().BoxGeometry)(sx * 0.96, 0.12, 0.1), emat(0x37f0ff, 1.4));
      line.position.set(0, sy * 0.32, sz / 2 + 0.02);
      this.mesh.add(line);
      const line2 = line.clone(); line2.position.y = -sy * 0.18;
      this.mesh.add(line2);
    }
  }
  function makeAABB(cx, cy, cz, sx, sy, sz, type, tag) {
    return {
      kind: 'box', type, tag,
      min: { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
      max: { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 },
    };
  }

  window.VoltTraverse = { Rail, Spring, DashPanel, MovingPlatform, LoopTrack, Checkpoint, FinishGate, Updraft, RunWall };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.VoltTraverse;
})();
