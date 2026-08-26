// HYPERLINE collectibles — coins, gems, mystery boxes, powerup pickups
import * as THREE from 'three';
import CFG from './config.js';
import { M, geo } from './materials.js';
import { randRange, choice, pick } from './utils.js';

const COIN_R = 0.34;
const L = CFG.WORLD.CHUNK_LEN;

export class Collectibles {
  constructor() {
    this.items = [];
    this.free = { coin: [], gem: [], box: [], pu: [] };
  }

  init(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.coinGeo = geo('coin', () => new THREE.CylinderGeometry(COIN_R, COIN_R, 0.09, 18));
    this.gemGeo = geo('gem', () => new THREE.OctahedronGeometry(0.4, 0));
    this.boxGeo = geo('mysteryBox', () => new THREE.BoxGeometry(0.72, 0.72, 0.72));
    // small floating powerup capsule
    this.puGeo = geo('puPickup', () => new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.3, 0.42, 6, 10) : new THREE.SphereGeometry(0.42, 12, 10));
    this.prewarm(140);
  }

  prewarm(n) {
    for (let i = 0; i < n; i++) this.release(this.acquire('coin'));
  }

  acquire(kind) {
    const freeArr = this.free[kind];
    let m = freeArr && freeArr.pop();
    if (m) { m.visible = true; return m; }
    switch (kind) {
      case 'coin': m = new THREE.Mesh(this.coinGeo, M('coin')); break;
      case 'gem': m = new THREE.Mesh(this.gemGeo, M('gem')); break;
      case 'box': m = new THREE.Mesh(this.boxGeo, M('box')); break;
      case 'pu': {
        m = new THREE.Group();
        const shellMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.3, metalness: 0.5,
          emissive: 0x888888, emissiveIntensity: 0.35,
        });
        const shell = new THREE.Mesh(this.puGeo, shellMat);
        m.add(shell);
        m.userData.shell = shell;
        break;
      }
    }
    this.scene.add(m);
    return m;
  }

  release(m) {
    m.visible = false;
    if (m.parent) m.parent.remove(m);
  }

  spawn(kind, x, y, z, data) {
    if (z > -8) return null;   // never right at spawn
    const mesh = this.acquire(kind);
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, randRange(0, Math.PI * 2), kind === 'coin' ? Math.PI / 2 : 0);
    const it = {
      kind, x, y, z, mesh,
      taken: false, phase: randRange(0, Math.PI * 2),
      baseY: y, data: data || {},
    };
    if (kind === 'pu') {
      it.data.kind = it.data.kind || choice(['magnet', 'jetpack', 'x2', 'sneakers', 'shield']);
      const col = PU_COLORS[it.data.kind];
      const shell = mesh.userData.shell;
      shell.material.color.setHex(col.body);
      shell.material.emissive.setHex(col.glow);
      // icon ring
      if (!mesh.userData.ring) {
        const ring = new THREE.Mesh(geo('puRing', () => new THREE.TorusGeometry(0.52, 0.05, 8, 20)),
          new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ring.rotation.x = Math.PI / 2;
        mesh.add(ring);
        mesh.userData.ring = ring;
      }
      mesh.userData.ring.material.color.setHex(col.glow);
    }
    this.items.push(it);
    return it;
  }

  spawnCoin(x, z, y) { return this.spawn('coin', x, y ?? 1.1, z); }

  coinLine(chunk, lane, zStart, n, spacing = 2.2, yFn) {
    const x = CFG.LANES[lane];
    for (let i = 0; i < n; i++) {
      this.spawnCoin(x, zStart - i * spacing, yFn ? yFn(i) : 1.1);
    }
  }

  coinArcOver(chunk, lane, zCenter) { this.coinArcOverLong(chunk, lane, zCenter, 5); }

  coinArcOverLong(chunk, lane, zCenter, spanLen) {
    const x = CFG.LANES[lane];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = zCenter + spanLen / 2 - t * spanLen;
      const y = 1.0 + Math.sin(t * Math.PI) * 2.1;
      this.spawnCoin(x, z, y);
    }
  }

  decorateChunk(chunk, sec, world) {
    const rng = Math.random;
    // base line of coins on a random lane
    if (rng() < 0.75) {
      const lane = (rng() * 3) | 0;
      this.coinLine(chunk, lane, chunk.z1 - randRange(6, 16), 4 + ((rng() * 4) | 0));
    }
    // gem rare
    if (rng() < 0.14) {
      this.spawn('gem', choice(CFG.LANES), randRange(1.2, 2.4), chunk.z1 - randRange(8, L - 6));
    }
    // mystery box
    if (rng() < 0.11) {
      this.spawn('box', choice(CFG.LANES), 1.25, chunk.z1 - randRange(8, L - 6));
    }
    // powerup pickup — luck upgrade raises odds
    const saveData = world.deps.save.data;
    const luck = saveData.upg.luck;
    const puChance = 0.085 + luck * 0.02;
    if (rng() < puChance) {
      const lane = (rng() * 3) | 0;
      this.spawn('pu', CFG.LANES[lane], 1.35, chunk.z1 - randRange(8, L - 6));
    }
  }

  update(dt, player, hooks) {
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const magnetR = hooks.magnetRadius();
    const collectR = 0.95 + (player.flying ? 0.6 : 0);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      // cull behind
      if (it.z > pz + 26) {
        this.release(it.mesh);
        this.items.splice(i, 1);
        continue;
      }
      it.phase += dt * 3.4;
      // magnet attraction
      if ((it.kind === 'coin' || it.kind === 'gem') && magnetR > 0) {
        const dz = pz - it.z, dx = px - it.x, dy = py + 0.9 - it.y;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < magnetR * magnetR && it.z > pz - 30) {
          const d = Math.sqrt(d2) || 1;
          const pull = (14 / d) * dt * 60;
          it.x += dx / d * pull;
          it.y += dy / d * pull;
          it.z += dz / d * pull * 1.15;
        }
      }
      // write transform
      it.mesh.position.set(it.x, it.y + Math.sin(it.phase) * 0.09, it.z);
      it.mesh.rotation.y += dt * 2.6;

      // collect check
      const dx = px - it.x, dy = (py + player.height * 0.55) - it.y, dz = pz - it.z;
      if (!it.taken && dx * dx + dy * dy * 0.7 + dz * dz < collectR * collectR) {
        it.taken = true;
        hooks.onCollect(it);
        this.release(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  clearRunItems() {
    for (const it of this.items) this.release(it.mesh);
    this.items.length = 0;
  }
}

export const PU_COLORS = {
  magnet: { body: 0xe74c3c, glow: 0xff6b5c },
  jetpack: { body: 0xffa03c, glow: 0xffd36b },
  x2: { body: 0xffc93c, glow: 0xfff0a0 },
  sneakers: { body: 0x8a5cff, glow: 0xb38bff },
  shield: { body: 0x2b8cff, glow: 0x7fc4ff },
};
