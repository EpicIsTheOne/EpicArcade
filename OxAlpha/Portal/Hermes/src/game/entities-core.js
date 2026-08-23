// LIMINAL DYNAMICS — core entities: cubes, buttons, doors
import * as THREE from 'three';

export class WeightedCube {
  constructor(ch, x, y, z, type = 'weight') {
    this.ch = ch;
    this.type = type;
    const s = 0.56;
    this.spawn = new THREE.Vector3(x, y, z);
    this.half = new THREE.Vector3(s / 2, s / 2, s / 2);
    this.body = {
      pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(),
      half: this.half.clone(), lastSide: {}, spin: new THREE.Vector3(),
      held: false, frozen: false, impact: 0,
    };
    const companion = type === 'companion';
    const mat = new THREE.MeshStandardMaterial({
      color: companion ? 0x9d6cf0 : 0xcfd6dd, roughness: 0.32, metalness: 0.62,
      emissive: companion ? 0x5a2fb0 : 0x000000, emissiveIntensity: companion ? 0.4 : 0,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // crisp edges + emblem disc
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(s * 1.001, s * 1.001, s * 1.001)),
      new THREE.LineBasicMaterial({ color: companion ? 0xd9c2ff : 0x39424d }));
    this.mesh.add(edges);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(s * 0.22, s * 0.22, 0.03, 20),
      new THREE.MeshStandardMaterial({
        color: 0x222a33, roughness: 0.4, metalness: 0.8,
        emissive: companion ? 0x7a3fe8 : 0x39424d, emissiveIntensity: companion ? 0.9 : 0.15}));
    disc.rotation.z = Math.PI / 2;
    this.mesh.add(disc);
    ch.group.add(this.mesh);

    if (companion) {
      this.light = new THREE.PointLight(0x9a5cff, 4, 5);
      this.mesh.add(this.light);
    }
  }
  get pos() { return this.body.pos; }

  resetToSpawn() {
    this.body.pos.copy(this.spawn);
    this.body.vel.set(0, 0, 0);
    this.body.lastSide = {};
    this.body.held = false;
    this.body.frozen = false;
    this.body.spin.set(0, 0, 0);
  }

  update(dt) {
    this.mesh.position.copy(this.body.pos);
    this.mesh.rotation.x += this.body.spin.x * dt;
    this.mesh.rotation.y += this.body.spin.y * dt;
    this.mesh.rotation.z += this.body.spin.z * dt;
    if (this.body.impact > 0) {
      if (this.ch.game?.sfx) this.ch.game.sfx.thud(this.body.impact);
      this.body.impact = 0;
    }
    for (const f of this.ch.fizzlers) {
      if (f.active && f.contains(this.body.pos)) {
        this.resetToSpawn();
        if (this.ch.game?.onCubeFizzled) this.ch.game.onCubeFizzled(this);
      }
    }
  }
}

export class FloorButton {
  constructor(ch, x, y, z, opts = {}) {
    this.ch = ch;
    this.pos = new THREE.Vector3(x, y, z);
    this.r = opts.r || 0.72;
    this.latched = !!opts.latch;   // once pressed, stays pressed
    this.state = false;
    this.onPress = opts.onPress?.bind(opts.ctx || ch);
    this.onRelease = opts.onRelease?.bind(opts.ctx || ch);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2c333c, roughness: 0.5, metalness: 0.7 });
    this.base = new THREE.Mesh(new THREE.CylinderGeometry(this.r + 0.22, this.r + 0.28, 0.09, 36), baseMat);
    this.base.position.set(x, y + 0.05, z);
    this.base.receiveShadow = true;
    ch.group.add(this.base);

    this.capMat = new THREE.MeshStandardMaterial({ color: 0xd8dee4, roughness: 0.4, metalness: 0.45, emissive: 0xff5a48, emissiveIntensity: 0 });
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(this.r, this.r, 0.14, 36), this.capMat);
    this.cap.position.set(x, y + 0.13, z);
    this.cap.castShadow = true;
    ch.group.add(this.cap);

    this.lightRingMat = new THREE.MeshBasicMaterial({ color: 0xff5a48, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.r + 0.3, this.r + 0.46, 40), this.lightRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.102, z);
    ch.group.add(ring);
  }

  force(v) { this.setState(v, true); }

  setState(v, silent = false) {
    if (this.state === v) return;
    this.state = v;
    this.capMat.emissive.setHex(v ? 0x37ffa0 : 0xff5a48);
    this.capMat.emissiveIntensity = v ? 1.6 : 0;
    this.lightRingMat.color.setHex(v ? 0x37ffa0 : 0xff5a48);
    this.lightRingMat.opacity = v ? 0.65 : 0.25;
    this.cap.position.y = this.pos.y + (v ? 0.085 : 0.13);
    if (!silent) { if (v && this.onPress) this.onPress(); if (!v && this.onRelease) this.onRelease(); }
    if (!silent && this.ch.game?.sfx) this.ch.game.sfx.button(v);
  }

  update(dt) {
    let pressed = null;
    const px = this.pos.x, pz = this.pos.z, r2 = this.r * this.r;
    for (const b of this.ch.world.dynamics) {
      if (b.held) continue;
      const dx = b.pos.x - px, dz = b.pos.z - pz;
      if (dx * dx + dz * dz < r2 && Math.abs(b.pos.y - (this.pos.y + 0.28)) < 0.42) { pressed = { cube: b }; break; }
    }
    const pl = this.ch.game?.player;
    if (!pressed && pl && !pl.dead) {
      const dx = pl.pos.x - px, dz = pl.pos.z - pz;
      if (dx * dx + dz * dz < r2 && Math.abs((pl.pos.y - 0.9) - (this.pos.y + 0.12)) < 0.55) pressed = { player: pl };
    }
    if (pressed && !this.state) this.setState(true);
    else if (!pressed && this.state && !this.latched) this.setState(false);
  }
}

export class Door {
  constructor(ch, x, y, z, axis, opts = {}) {
    this.ch = ch; this.axis = axis; this.isExit = !!opts.isExit;
    this.w = opts.w ?? 2.4; this.h = opts.h ?? 3.0;
    this.open = false; this.openT = 0;
    this.autoOpenWhen = opts.autoOpenWhen || null;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c2127, roughness: 0.38, metalness: 0.82 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, roughness: 0.34, metalness: 0.72, emissive: 0x2f81c9, emissiveIntensity: 0.16 });
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (axis === 'x') g.rotation.y = Math.PI / 2;
    ch.group.add(g);
    this.grp = g;

    const fw = 0.45;
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, this.h + 0.3, 0.5), frameMat);
      f.position.set(s * (this.w / 2 + fw / 2), 0, 0);
      f.castShadow = true; g.add(f);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(this.w + fw * 2, 0.4, 0.5), frameMat);
    top.position.y = this.h / 2 + 0.15; top.castShadow = true; g.add(top);

    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xff5a48 });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(this.w * 0.92, 0.09), this.stripMat);
    strip.position.set(0, this.h / 2 + 0.02, 0.27);
    g.add(strip);

    this.panels = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(this.w / 2, this.h, 0.22), panelMat);
      p.position.set(s * this.w / 4, 0, 0);
      p.castShadow = true;
      g.add(p);
      this.panels.push({ mesh: p, s });
    }
    const W = axis === 'x' ? this.w + 1.0 : 0.7;
    const D = axis === 'x' ? 0.7 : this.w + 1.0;
    this.solid = ch.world.addSolid(
      new THREE.Vector3(x - W / 2, y - this.h / 2, z - D / 2),
      new THREE.Vector3(x + W / 2, y + this.h / 2, z + D / 2),
      { portalable: false, tag: 'door' });
  }

  setOpen(v, silent = false) {
    if (this.open === v) return;
    this.open = v;
    this.stripMat.color.setHex(v ? 0x37ffa0 : 0xff5a48);
    if (!silent && this.ch.game?.sfx) this.ch.game.sfx.door();
  }

  update(dt) {
    if (this.autoOpenWhen) this.setOpen(!!this.autoOpenWhen(this.ch));
    this.openT += ((this.open ? 1 : 0) - this.openT) * Math.min(1, dt * 5.5);
    if (Math.abs(this.openT - (this.open ? 1 : 0)) < 0.002) this.openT = this.open ? 1 : 0;
    const slide = this.openT * (this.w / 2 + 0.06);
    for (const p of this.panels) p.mesh.position.x = p.s * (this.w / 4 + slide);
    this.solid.disabled = this.openT > 0.7;
  }
}
