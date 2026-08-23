// LIMINAL DYNAMICS — Chamber class + declarative build helpers
import * as THREE from 'three';
import { makeSignTexture, makeTextures } from './textures.js';
import { WeightedCube, FloorButton, Door } from './entities-core.js';
import { MovingPlatform, GooPit, Fizzler, Terminal } from './entities-misc.js';

export class Chamber {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();
    this.world = null;
    this.scene = null;
    this.T = null;
    this.playerSpawn = new THREE.Vector3(0, 1.2, 8);
    this.spawnYaw = 0;
    this.exitPos = new THREE.Vector3(0, 1, -6);
    this.exitRotY = 0;
    this.entities = [];
    this.cubes = [];
    this.buttons = [];
    this.doors = [];
    this.hazards = [];
    this.movers = [];
    this.fizzlers = [];
    this.terminals = [];
    this.signs = [];
    this.solved = false;
    this.onSolved = null;
    this.game = null;
  }

  // ---------- primitives ----------
  box(x, y, z, w, h, d, opts = {}) {
    const T = this.T;
    const kind = opts.kind || 'metal';
    let mat;
    if (opts.mat) mat = opts.mat;
    else if (kind === 'panel') mat = this._texMat(T.panel, 0xdde2e6, 0.42, 0.06, opts.mapRepeat);
    else if (kind === 'floor') mat = this._texMat(T.floor, 0xffffff, 0.62, 0.18, opts.mapRepeat);
    else if (kind === 'hazard') mat = this._texMat(T.hazard, 0xffffff, 0.7, 0.1, null);
    else if (kind === 'concrete') mat = this._texMat(T.concrete, 0xffffff, 0.92, 0.02, opts.mapRepeat);
    else if (kind === 'ceiling') mat = this._texMat(T.ceiling, 0xffffff, 0.8, 0.25, opts.mapRepeat);
    else if (kind === 'emissive') mat = new THREE.MeshStandardMaterial({ color: 0x11151b, emissive: opts.emissive ?? 0x9fd8ff, emissiveIntensity: opts.intensity ?? 2.4 });
    else if (kind === 'glass') mat = new THREE.MeshPhysicalMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    else mat = this._texMat(T.metal, 0xffffff, 0.55, 0.55, opts.mapRepeat);

    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.shadow !== false && kind !== 'emissive' && kind !== 'glass';
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const solid = this.world.addSolid(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      { portalable: !!opts.portalable, tag: opts.tag || kind });
    solid.chamber = this;
    solid.mesh = mesh;
    return solid;
  }

  _texMat(base, color, rough, metal, repeat) {
    const mat = new THREE.MeshStandardMaterial({ map: base, color, roughness: rough, metalness: metal });
    if (repeat) {
      mat.map = base.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(repeat[0], repeat[1]);
    }
    return mat;
  }

  barrier(x, y, z, w, h, d, tag = 'barrier') {
    const s = this.world.addSolid(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2), { portalable: false, tag });
    s.chamber = this;
    return s;
  }

  sign(x, y, z, ry, num, name, glyphs) {
    const tex = makeSignTexture(num, name, glyphs || []);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    this.group.add(m);
    this.signs.push(m);
    return m;
  }

  lightPanel(x, y, z, w, d, colorHex = 0xbfe3ff, intensity = 2.2) {
    return this.box(x, y, z, w, 0.08, d, { kind: 'emissive', emissive: colorHex, intensity });
  }

  // ---------- entity factories ----------
  cube(x, y, z, type = 'weight') {
    const c = new WeightedCube(this, x, y, z, type);
    this.cubes.push(c); this.entities.push(c);
    this.world.dynamics.push(c.body);
    return c;
  }
  button(x, y, z, opts = {}) {
    const b = new FloorButton(this, x, y, z, opts);
    this.buttons.push(b); this.entities.push(b);
    return b;
  }
  door(x, y, z, axis, opts = {}) {
    const d = new Door(this, x, y, z, axis, opts);
    this.doors.push(d); this.entities.push(d);
    return d;
  }
  exitDoor(x, y, z, ry = 0, opts = {}) {
    const d = this.door(x, y, z, (Math.round(ry / Math.PI) % 2 === 0) ? 'z' : 'x', { ...opts, isExit: true });
    this.exitPos.set(x, y, z);
    this.exitRotY = ry;
    return d;
  }
  platform(x, y, z, w, h, d, path, speed = 1.6, opts = {}) {
    const m = new MovingPlatform(this, x, y, z, w, h, d, path, speed, opts);
    this.movers.push(m); this.entities.push(m);
    return m;
  }
  gooPit(x, y, z, w, d, opts = {}) {
    const g = new GooPit(this, x, y, z, w, d, opts);
    this.hazards.push(g); this.entities.push(g);
    return g;
  }
  fizzler(x, y, z, w, h, axis = 'x', opts = {}) {
    const f = new Fizzler(this, x, y, z, w, h, axis, opts);
    this.fizzlers.push(f); this.entities.push(f);
    return f;
  }
  terminal(x, y, z, ry, lines, opts = {}) {
    const t = new Terminal(this, x, y, z, ry, lines, opts);
    this.terminals.push(t); this.entities.push(t);
    return t;
  }

  // ---------- lifecycle ----------
  attach(world, scene, game) {
    this.world = world;
    this.scene = scene;
    this.game = game;
    this.T = game.textures;
    scene.add(this.group);
    this.def.build(this);
    return this;
  }

  reset() {
    this.solved = false;
    for (const c of this.cubes) c.resetToSpawn();
    for (const b of this.buttons) b.force(false);
    for (const m of this.movers) m.seg = 0;
    for (const d of this.doors) d.setOpen(false, true);
  }

  update(dt) {
    for (const e of this.entities) e.update?.(dt, this.game);
    for (const h of this.hazards) if (h.tickHazard) h.tickHazard(this.game, 1 / 120);
    if (!this.solved && this.def.checkWin && this.def.checkWin(this)) {
      this.solved = true;
      this.onSolved?.(this);
    }
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) { m.map?.dispose?.(); m.dispose(); }
    });
    this.scene?.remove(this.group);
    // remove solids owned by THIS chamber only (unowned legacy solids stay)
    if (this.world) {
      this.world.solids = this.world.solids.filter(s => s.chamber !== this);
      this.world.dynamics = this.world.dynamics.filter(b => !this.cubes.some(c => c.body === b));
    }
  }

  /** Purge any solids not owned by the CURRENT chamber. Call after building a new chamber. */
  static purgeUnowned(world, owner) {
    world.solids = world.solids.filter(s => s.chamber === owner || s.chamber == null);
    // portals sitting on removed hosts are invalid now
    for (const id of ['blue', 'amber']) {
      const p = world.portals[id];
      if (p && p.active && p.host && p.host.chamber !== owner && !world.solids.includes(p.host)) {
        p.deactivate();
        if (p._solidMarker) p._solidMarker.host = null;
      }
    }
  }
}
