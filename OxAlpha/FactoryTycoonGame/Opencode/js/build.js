import * as THREE from '../lib/three.module.min.js';
import { CELL, MACHINES, SOLID } from './data.js';

const VALID = 0x35e06a, INVALID = 0xff4d4d;

// Ghost preview + placement/demolish logic.
export class Builder {
  constructor({ scene, camera, game }) {
    this.scene = scene;
    this.camera = camera;
    this.game = game;
    this.mode = null;          // null | 'place' | 'demolish'
    this.selType = 'extractor';
    this.rot = 0;
    this.valid = false;
    this.gx = 0; this.gz = 0;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
    this.hit = new THREE.Vector3();

    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    scene.add(this.ghost);
    this._buildGhost();
  }

  _buildGhost() {
    const g = this.ghost;
    while (g.children.length) { const c = g.children.pop(); g.remove(c); }

    const h = MACHINES[this.selType].h;
    const quadMat = new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    this.quadMat = quadMat;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94), quadMat);
    quad.rotation.x = -Math.PI / 2;
    quad.position.y = 0.16;
    g.add(quad);

    // wireframe box of machine height
    const boxG = new THREE.BoxGeometry(CELL * 0.94, h, CELL * 0.94);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxG),
      new THREE.LineBasicMaterial({ color: VALID, transparent: true, opacity: 0.85 })
    );
    edges.position.y = h / 2 + 0.14;
    this.edgeMat = edges.material;
    g.add(edges);

    // direction arrow (points +X at rot 0)
    const arrowMat = new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.9 });
    this.arrowMat = arrowMat;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.12), arrowMat);
    shaft.position.set(-0.25, 0.22, 0);
    const headG = new THREE.ConeGeometry(0.17, 0.34, 4);
    headG.rotateZ(-Math.PI / 2);
    const head = new THREE.Mesh(headG, arrowMat);
    head.position.set(0.28, 0.22, 0);
    const arrow = new THREE.Group();
    arrow.add(shaft, head);
    if (this.selType !== 'storage') arrow.visible = true; else arrow.visible = false;
    this.arrow = arrow;
    g.add(arrow);

    g.rotation.y = -this.rot * Math.PI / 2;
  }

  setType(t) {
    this.selType = t;
    this.mode = 'place';
    this._buildGhost();
  }
  cycleRot(dir = 1) {
    this.rot = ((this.rot + dir) % 4 + 4) % 4;
    this.ghost.rotation.y = -this.rot * Math.PI / 2;
  }
  setMode(m) {
    this.mode = m;
    this.ghost.visible = false;
    if (m === 'place') this._buildGhost();
  }

  _aimPoint() {
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); // crosshair center
    const p = this.ray.ray.intersectPlane(this.plane, this.hit);
    return p;
  }

  update(world, machineAt, playerCell) {
    if (!this.mode || this.game.paused) { this.ghost.visible = false; return null; }

    if (this.mode === 'demolish') {
      const hit = this._aimPoint();
      let target = null;
      if (hit) {
        const gx = Math.round(hit.x / CELL), gz = Math.round(hit.z / CELL);
        target = machineAt(gx, gz);
        this.gx = gx; this.gz = gz;
      }
      this.target = target;
      this.ghost.visible = false;
      return target ? { demolishTarget: target } : null;
    }

    const hit = this._aimPoint();
    if (!hit) { this.ghost.visible = false; return null; }
    const gx = Math.round(hit.x / CELL), gz = Math.round(hit.z / CELL);
    this.gx = gx; this.gz = gz;

    this.valid = this.checkValid(gx, gz, world, machineAt, playerCell);
    const col = this.valid ? VALID : INVALID;
    this.quadMat.color.setHex(col);
    this.edgeMat.color.setHex(col);
    this.arrowMat.color.setHex(col);

    this.ghost.position.set(gx * CELL, 0, gz * CELL);
    this.ghost.visible = true;
    return { placeReady: this.valid };
  }

  checkValid(gx, gz, world, machineAt, playerCell) {
    if (!world.ownedAt(gx, gz)) return false;
    if (machineAt(gx, gz)) return false;
    const dep = world.depositAt(gx, gz);
    if (this.selType === 'extractor') return !!(dep && dep.owned);
    if (dep) return false;
    if (playerCell && playerCell[0] === gx && playerCell[1] === gz && SOLID.has(this.selType)) return false;
    if (this.game && typeof this.game.money === 'number' && this.game.money < MACHINES[this.selType].cost) return false;
    return true;
  }
}
