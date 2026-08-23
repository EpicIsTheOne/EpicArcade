// Remote players: blocky avatars + floating name tags, position interpolation.
import * as THREE from 'three';

const SKIN = 0xd8a07c, SHIRT = 0x2f9e8f, PANTS = 0x39508f, HAIR = 0x4a3120;

function nameSprite(name) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const x = 128, y = 32;
  c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,.85)';
  c.strokeText(name, x, y);
  c.fillStyle = '#ffe9a8';
  c.fillText(name, x, y);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.5, 0.375, 1);
  return sp;
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> record
    this.root = new THREE.Group();
    this.root.userData.noShadow = true;
    scene.add(this.root);
  }

  _build(name) {
    const g = new THREE.Group();
    const mat = (col) => new THREE.MeshLambertMaterial({ color: col });
    const box = (w, h, d, col, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col));
      m.position.set(x, y, z);
      m.userData.noShadow = true;
      return m;
    };
    // pivot groups so limbs swing from top
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(-0.125, 0.75, 0); legR.position.set(0.125, 0.75, 0);
    legL.add(box(0.22, 0.75, 0.24, PANTS, 0, -0.375, 0));
    legR.add(box(0.22, 0.75, 0.24, PANTS, 0, -0.375, 0));
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.36, 1.42, 0); armR.position.set(0.36, 1.42, 0);
    armL.add(box(0.18, 0.68, 0.22, SHIRT, 0, -0.3, 0));
    armR.add(box(0.18, 0.68, 0.22, SHIRT, 0, -0.3, 0));
    const body = box(0.52, 0.68, 0.28, SHIRT, 0, 1.09, 0);
    const head = new THREE.Group();
    head.position.y = 1.43;
    head.add(box(0.46, 0.46, 0.46, SKIN, 0, 0.23, 0));
    head.add(box(0.48, 0.14, 0.48, HAIR, 0, 0.44, -0.01)); // hair cap
    const tag = nameSprite(name);
    tag.position.y = 2.25;
    for (const p of [legL, legR, armL, armR, body, head, tag]) g.add(p);
    g.userData.noShadow = true;
    this.root.add(g);
    return { group: g, legL, legR, armL, armR, head, phase: 0 };
  }

  add(id, name, s) {
    if (this.map.has(id)) return this.map.get(id);
    const rec = { ...this._build(name), id, name,
      cur: { x: s[0], y: s[1], z: s[2], yaw: s[3] },
      tgt: { x: s[0], y: s[1], z: s[2], yaw: s[3] }, speed: 0, lastY: s[1] };
    rec.group.position.set(s[0], s[1], s[2]);
    this.map.set(id, rec);
    return rec;
  }

  has(id) { return this.map.has(id); }
  get(id) { return this.map.get(id); }

  setState(id, s) {
    const r = this.map.get(id);
    if (!r) return;
    r.tgt.x = s[0]; r.tgt.y = s[1]; r.tgt.z = s[2]; r.tgt.yaw = s[3];
  }

  remove(id) {
    const r = this.map.get(id);
    if (!r) return;
    this.root.remove(r.group);
    r.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    this.map.delete(id);
  }

  update(dt) {
    const k = Math.min(1, dt * 12);
    for (const r of this.map.values()) {
      const c = r.cur, t = r.tgt;
      const dx = t.x - c.x, dz = t.z - c.z;
      const dist = Math.hypot(dx, dz);
      r.speed += (Math.min(dist / Math.max(dt, 1e-4), 6) - r.speed) * Math.min(1, dt * 8);
      c.x += dx * k; c.y += (t.y - c.y) * k; c.z += dz * k;
      let dyaw = t.yaw - c.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      c.yaw += dyaw * Math.min(1, dt * 10);
      const g = r.group;
      g.position.set(c.x, c.y, c.z);
      g.rotation.y = c.yaw;
      // walk cycle
      r.phase += r.speed * dt * 2.6;
      const amp = Math.min(1, r.speed / 4.3) * 0.7;
      const sw = Math.sin(r.phase) * amp;
      r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
      r.armL.rotation.x = -sw * 0.85; r.armR.rotation.x = sw * 0.85;
    }
  }

  count() { return this.map.size; }

  dispose() {
    for (const id of [...this.map.keys()]) this.remove(id);
    if (this.root.parent) this.scene.remove(this.root);
  }
}
