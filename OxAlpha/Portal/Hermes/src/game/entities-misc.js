// LIMINAL DYNAMICS — misc entities: platforms, goo, fizzlers, terminals
import * as THREE from 'three';

export class MovingPlatform {
  constructor(ch, x, y, z, w, h, d, path, speed = 1.6, opts = {}) {
    this.ch = ch;
    this.origin = new THREE.Vector3(x, y, z);
    this.path = path;
    this.speed = speed;
    this.pos = new THREE.Vector3(x, y, z);
    this.prev = new THREE.Vector3(x, y, z);
    this.deltaVec = new THREE.Vector3();
    this.seg = 0;
    this.mat = new THREE.MeshStandardMaterial({ map: ch.T.floor, roughness: 0.5, metalness: 0.4 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    ch.group.add(this.mesh);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 0.06, d * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x11151b, emissive: 0x54b9ff, emissiveIntensity: 1.8 }));
    glow.position.y = -h / 2 - 0.02;
    this.mesh.add(glow);
    this.solid = ch.world.addSolid(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      { portalable: !!opts.portalable, tag: 'platform' });
    this.solid.mover = this;
    this.hw = w / 2; this.hh = h / 2; this.hd = d / 2;
    this.t = 0;
  }

  update(dt) {
    if (!this.path.length) return;
    const tgt = this.path[this.seg];
    const dest = new THREE.Vector3(this.origin.x + tgt.dx, this.origin.y + tgt.dy, this.origin.z + tgt.dz);
    const dir = dest.clone().sub(this.pos);
    const dist = dir.length();
    const step = this.speed * dt;
    if (dist <= step || dist < 1e-5) {
      this.pos.copy(dest);
      this.seg = (this.seg + 1) % this.path.length;
    } else {
      this.pos.addScaledVector(dir.normalize(), step);
    }
    this.deltaVec.copy(this.pos).sub(this.prev);
    this.prev.copy(this.pos);
    this.mesh.position.copy(this.pos);
    this.solid.aabb.min.set(this.pos.x - this.hw, this.pos.y - this.hh, this.pos.z - this.hd);
    this.solid.aabb.max.set(this.pos.x + this.hw, this.pos.y + this.hh, this.pos.z + this.hd);
    // carry riders: only bodies actually resting on THIS platform's top
    if (this.deltaVec.lengthSq() > 1e-8) {
      for (const b of [this.ch.game?.player, ...this.ch.world.dynamics]) {
        if (!b || !b.half) continue;
        const onTop = Math.abs(b.pos.y - b.half.y - (this.pos.y + this.hh)) < 0.14;
        const within = Math.abs(b.pos.x - this.pos.x) < this.hw + b.half.x * 0.5 &&
                       Math.abs(b.pos.z - this.pos.z) < this.hd + b.half.z * 0.5;
        if (onTop && within) {
          b.pos.x += this.deltaVec.x; b.pos.z += this.deltaVec.z;
          b.pos.y += this.deltaVec.y;
        }
      }
    }
  }
}

export class GooPit {
  constructor(ch, x, y, z, w, d, opts = {}) {
    this.ch = ch;
    this.deadly = opts.deadly !== false;
    this.kind = opts.kind || 'acid';
    const colorMap = { acid: 0x9dff3d, coolant: 0x2f9dff, tar: 0x14161c };
    const c = colorMap[this.kind] || 0x9dff3d;
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x0a0d10, roughness: 0.15, metalness: 0.4,
      emissive: c, emissiveIntensity: this.kind === 'tar' ? 0.05 : 0.55,
      transparent: this.kind !== 'tar', opacity: this.kind === 'tar' ? 1 : 0.92,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, d), this.mat);
    this.mesh.position.set(x, y, z);
    this.mesh.receiveShadow = false;
    ch.group.add(this.mesh);
    this.minY = y - 0.12; this.maxY = y + 0.12;
    this.minX = x - w / 2; this.maxX = x + w / 2;
    this.minZ = z - d / 2; this.maxZ = z + d / 2;
    this.t = Math.random() * 10;
    this.light = new THREE.PointLight(c, 1.4, Math.max(w, d));
    this.light.position.set(x, y + 0.7, z);
    ch.group.add(this.light);
  }

  contains(p) {
    return p.x > this.minX && p.x < this.maxX && p.z > this.minZ && p.z < this.maxZ && p.y - 0.9 < this.maxY && p.y > this.minY - 3;
  }

  update(dt) {
    this.t += dt;
    this.mat.emissiveIntensity = (this.kind === 'tar' ? 0.05 : 0.45) + Math.sin(this.t * 2.2) * 0.14;
  }

  tickHazard(game, dt) {
    const pl = game.player;
    if (this.deadly && !pl.dead && this.contains(pl.pos)) {
      game.killPlayer(this.kind === 'coolant' ? 'coolant' : 'acid');
    }
    for (const b of game.world.dynamics) {
      if (b.held) continue;
      if (this.deadly && this.contains(b.pos)) { b.pos.y += 6 * dt; b.vel.y = Math.max(b.vel.y, 0); b.vel.multiplyScalar(0.9); }
    }
  }
}

export class Fizzler {
  constructor(ch, x, y, z, w, h, axis = 'x', opts = {}) {
    this.ch = ch; this.active = true;
    this.minX = x - (axis === 'x' ? w / 2 : 0.12);
    this.maxX = x + (axis === 'x' ? w / 2 : 0.12);
    this.minY = y - h / 2; this.maxY = y + h / 2;
    this.minZ = z - (axis === 'x' ? 0.12 : w / 2);
    this.maxZ = z + (axis === 'x' ? 0.12 : w / 2);
    this.dropsPortals = opts.dropsPortals !== false;

    const mat = new THREE.MeshBasicMaterial({
      color: 0x9be8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? w : 0.24, h), mat);
    this.mesh.position.set(x, y, z);
    if (axis === 'z') this.mesh.rotation.y = Math.PI / 2;
    ch.group.add(this.mesh);
    // edge emitters
    const emitMat = new THREE.MeshStandardMaterial({ color: 0x0c1016, emissive: 0x6fd2ff, emissiveIntensity: 2.2 });
    const L = axis === 'x' ? w : 0.3;
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? L : 0.3, 0.14, axis === 'x' ? 0.3 : L), emitMat);
      bar.position.set(x, y + s * (h / 2), z);
      ch.group.add(bar);
    }
    this.light = new THREE.PointLight(0x6fd2ff, 1.2, Math.max(4, w));
    this.light.position.set(x, y, z);
    ch.group.add(this.light);
  }

  contains(p) {
    return p.x > this.minX && p.x < this.maxX && p.y > this.minY && p.y < this.maxY && p.z > this.minZ && p.z < this.maxZ;
  }

  update(dt, game) {
    if (!this.active) { this.mesh.visible = false; return; }
    const pl = game.player;
    if (this.contains(pl.eyePos ? pl.eyePos() : pl.pos)) {
      game.clearPlayerPortals(this.dropsPortals);
    }
  }
}

export class Terminal {
  constructor(ch, x, y, z, ry, lines, opts = {}) {
    this.ch = ch;
    this.lines = lines;
    this.t = 0;
    const grp = new THREE.Group();
    grp.position.set(x, y, z); grp.rotation.y = ry;
    ch.group.add(grp);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.5, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.16), bodyMat);
    body.castShadow = true;
    grp.add(body);
    // canvas screen with typed text
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256; this.canvas.height = 384;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.tex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.16), this.screenMat);
    screen.position.z = 0.085;
    grp.add(screen);
    this.light = new THREE.PointLight(0x7fd4ff, 0.9, 3);
    this.light.position.set(0, 0, 0.6);
    grp.add(this.light);
    this.charsShown = 0;
    this.totalChars = lines.join('\n').length;
    this.done = false;
  }

  update(dt) {
    this.t += dt;
    if (!this.done) {
      this.charsShown += dt * 28;
      if (this.charsShown >= this.totalChars) { this.charsShown = this.totalChars; this.done = true; }
      // redraw
      const ctx = this.canvas.getContext('2d');
      ctx.fillStyle = '#06121c'; ctx.fillRect(0, 0, 256, 384);
      ctx.strokeStyle = '#1d4a63'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 248, 376);
      ctx.fillStyle = '#7fd4ff';
      ctx.font = '13px "Consolas", monospace';
      let y = 30, budget = Math.floor(this.charsShown);
      for (const line of this.lines) {
        if (budget <= 0) break;
        // simple wrap
        const words = line.split(' ');
        let cur = '';
        for (const wd of words) {
          const test = cur ? cur + ' ' + wd : wd;
          if (test.length > 30) { ctx.fillText(cur, 14, y); y += 18; budget -= cur.length; cur = wd; }
          else cur = test;
          if (budget <= 0) break;
        }
        if (budget > 0) { ctx.fillText(cur, 14, y); y += 18; budget -= cur.length; }
        y += 6;
      }
      // blinking cursor
      if (Math.floor(this.t * 2.5) % 2 === 0) ctx.fillRect(14, y + 2, 9, 13);
      this.tex.needsUpdate = true;
      if (this.done) this.tex.needsUpdate = true;
    }
  }
}
