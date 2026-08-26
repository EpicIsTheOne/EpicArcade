import * as THREE from '../lib/three.module.min.js';
import { CELL, PLOTS, ITEMS } from './data.js';

const GRASS = 0x69a95e, DIRT = 0x8a6f4d, DIRT_DARK = 0x6f5a3e;
const DEP_GEM = { iron_ore: 0x7fb8ff, copper_ore: 0xffa03c };

function textTexture(lines, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#7a5b36';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#4a3520'; g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 118);
  g.fillStyle = opts.fg || '#ffe9c4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const sizes = lines.length > 1 ? [40, 34] : [44];
  lines.forEach((ln, i) => {
    g.font = `900 ${sizes[Math.min(i, sizes.length - 1)]}px Segoe UI, sans-serif`;
    if (opts.stroke) { g.strokeStyle = '#3a2a14'; g.lineWidth = 6; g.strokeText(ln, 128, 64 + (i - (lines.length - 1) / 2) * 42); }
    g.fillText(ln, 128, 64 + (i - (lines.length - 1) / 2) * 42);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state; // { plots:Set<int> }
    this.signs = new Map(); // plotId -> group
    this.depositMeshes = [];
    this.time = 0;

    this._sky();
    this._lights();
    this._ground();
    this._scatter();
    this.refreshPlots();
  }

  _sky() {
    const geo = new THREE.SphereGeometry(420, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4f9de8) },
        mid: { value: new THREE.Color(0xa8d4f2) },
        bot: { value: new THREE.Color(0xe8f3ec) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top,mid,bot;
        void main(){ float h=normalize(vP).y;
          vec3 c = h>0.18 ? mix(mid,top,pow(min((h-0.18)/0.82,1.0),0.8)) : mix(bot,mid,min(h/0.18+0.35,1.0));
          gl_FragColor=vec4(c,1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
    this.scene.fog = new THREE.Fog(0xcfe3ef, 70, 260);
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x54604a, 0.85);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    sun.position.set(34, 52, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
    sun.shadow.camera.near = 5; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  _ground() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(480, 480),
      new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(16, 0, 8);
    grass.receiveShadow = true;
    this.scene.add(grass);

    // dirt pads per plot
    this.pads = [];
    for (const p of PLOTS) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(p.w * CELL - 0.25, 0.12, p.h * CELL - 0.25),
        new THREE.MeshStandardMaterial({ color: DIRT, roughness: 1 })
      );
      pad.position.set((p.x0 + p.w / 2) * CELL - CELL / 2, 0.05, (p.z0 + p.h / 2) * CELL - CELL / 2);
      pad.visible = false;
      pad.receiveShadow = true;
      this.scene.add(pad);
      this.pads.push(pad);
    }

    // build grid (toggled in build mode)
    this.grid = new THREE.GridHelper(32, 16, 0xffffff, 0xffffff);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.13;
    this.grid.position.set(16, 0.135, 8);
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.fenceGroup = new THREE.Group();
    this.scene.add(this.fenceGroup);
    this.forSaleGroup = new THREE.Group();
    this.scene.add(this.forSaleGroup);
  }

  _scatter() {
    const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6);
    const leafG = new THREE.ConeGeometry(1.5, 3.2, 7);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x3f7d43, roughness: 1 });
    const leafM2 = new THREE.MeshStandardMaterial({ color: 0x4f9150, roughness: 1 });
    const rockG = new THREE.DodecahedronGeometry(0.9, 0);
    const rockM = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.95 });
    let rng = 12345;
    const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      let x, z, tries = 0;
      do {
        x = -60 + rand() * 160; z = -55 + rand() * 130; tries++;
      } while (tries < 30 && x > -8 && x < 40 && z > -8 && z < 40); // keep off plots
      if (rand() < 0.72) {
        const t = new THREE.Group();
        const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.y = 0.8; trunk.castShadow = true;
        const l1 = new THREE.Mesh(leafG, rand() < 0.5 ? leafM : leafM2); l1.position.y = 3.0; l1.castShadow = true;
        const l2 = new THREE.Mesh(leafG, leafM); l2.position.y = 4.3; l2.scale.setScalar(0.62); l2.castShadow = true;
        t.add(trunk, l1, l2);
        t.scale.setScalar(0.8 + rand() * 0.9);
        t.position.set(x, 0, z);
        t.rotation.y = rand() * Math.PI * 2;
        this.scene.add(t);
      } else {
        const r = new THREE.Mesh(rockG, rockM);
        r.scale.set(0.7 + rand(), 0.5 + rand() * 0.6, 0.7 + rand());
        r.position.set(x, 0.3, z);
        r.rotation.y = rand() * Math.PI;
        r.castShadow = true;
        this.scene.add(r);
      }
    }
  }

  // ---------- ownership ----------
  plotAt(gx, gz) {
    return PLOTS.find(p => gx >= p.x0 && gx < p.x0 + p.w && gz >= p.z0 && gz < p.z0 + p.h) || null;
  }
  ownedAt(gx, gz) {
    const p = this.plotAt(gx, gz);
    return !!(p && this.state.plots.has(p.id));
  }
  depositAt(gx, gz) {
    for (const p of PLOTS) {
      for (const [dx, dz, res] of p.deps) {
        if (dx === gx && dz === gz) return { res, owned: this.state.plots.has(p.id) };
      }
    }
    return null;
  }
  plotBuyable(id) {
    const p = PLOTS.find(q => q.id === id);
    if (!p || this.state.plots.has(id)) return false;
    const adj = [[p.x0 - 1, p.z0], [p.x0 + p.w, p.z0], [p.x0, p.z0 - 1], [p.x0, p.z0 + p.h]];
    for (const [ax, az] of adj) {
      const ap = this.plotAt(ax, az);
      if (ap && this.state.plots.has(ap.id)) return true;
    }
    return false;
  }

  // ---------- visuals ----------
  refreshPlots() {
    for (const p of PLOTS) this.pads[p.id].visible = this.state.plots.has(p.id);
    this._rebuildFences();
    this._rebuildSignsAndVeils();
    this._rebuildDeposits();
  }

  _rebuildDeposits() {
    for (const d of this.depositMeshes) this.scene.remove(d.group);
    this.depositMeshes = [];
    for (const p of PLOTS) {
      if (!this.state.plots.has(p.id)) continue;
      for (const [gx, gz, res] of p.deps) {
        const group = new THREE.Group();
        const wx = gx * CELL, wz = gz * CELL;
        const rockM = new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.95 });
        const gemC = DEP_GEM[res] || ITEMS[res].color;
        const gemM = new THREE.MeshStandardMaterial({ color: gemC, roughness: 0.3, metalness: 0.1, emissive: gemC, emissiveIntensity: 0.8 });
        const ringM = new THREE.MeshBasicMaterial({ color: gemC, transparent: true, opacity: 0.4, depthWrite: false });
        const rockG = new THREE.DodecahedronGeometry(0.5, 0);
        const gemG = new THREE.OctahedronGeometry(0.3, 0);
        const spots = [[-0.45, -0.3], [0.5, 0.15], [0.1, 0.55]];
        spots.forEach(([ox, oz], i) => {
          const r = new THREE.Mesh(rockG, rockM);
          r.position.set(wx + ox, 0.22, wz + oz);
          r.scale.setScalar(0.75 + i * 0.18);
          r.rotation.y = i * 1.9;
          r.castShadow = true;
          group.add(r);
          const gm = new THREE.Mesh(gemG, gemM);
          gm.position.set(wx + ox * 1.1, 0.5 + i * 0.1, wz + oz * 1.1);
          gm.scale.setScalar(1.25 + i * 0.25);
          gm.rotation.set(0.4 * i, i * 2.1, 0.3 * i);
          group.add(gm);
        });
        // glowing marker ring so deposit cells are obvious while building
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.92, 28), ringM);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wx, 0.17, wz);
        group.add(ring);
        this.scene.add(group);
        this.depositMeshes.push({ group, ringM, gemM, key: `${gx},${gz}`, phase: (gx + gz) * 0.7 });
      }
    }
  }

  _rebuildFences() {
    const g = this.fenceGroup;
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse?.(o => { if (o.geometry && !o.geometry.__shared) o.geometry.dispose?.(); });
      g.remove(c);
    }
    const postM = new THREE.MeshStandardMaterial({ color: 0x574027, roughness: 1 });
    const railM = new THREE.MeshStandardMaterial({ color: 0x6e5334, roughness: 1 });
    const postG = new THREE.BoxGeometry(0.16, 1.15, 0.16);
    postG.__shared = true;
    const railG = new THREE.BoxGeometry(CELL + 0.16, 0.09, 0.07);
    railG.__shared = true;
    const ownedCells = new Set();
    for (const p of PLOTS) {
      if (!this.state.plots.has(p.id)) continue;
      for (let x = p.x0; x < p.x0 + p.w; x++)
        for (let z = p.z0; z < p.z0 + p.h; z++) ownedCells.add(`${x},${z}`);
    }
    const has = (x, z) => ownedCells.has(`${x},${z}`);
    const addPost = (wx, wz) => {
      const m = new THREE.Mesh(postG, postM);
      m.position.set(wx, 0.57, wz); m.castShadow = true;
      g.add(m);
    };
    for (const key of ownedCells) {
      const [x, z] = key.split(',').map(Number);
      const wx = x * CELL, wz = z * CELL;
      if (!has(x + 1, z)) { addPost(wx + CELL, wz); const r1 = new THREE.Mesh(railG, railM), r2 = new THREE.Mesh(railG, railM); r1.position.set(wx + CELL / 2, 0.92, wz); r2.position.set(wx + CELL / 2, 0.5, wz); r1.castShadow = r2.castShadow = true; g.add(r1, r2); }
      if (!has(x - 1, z)) { addPost(wx, wz); const r1 = new THREE.Mesh(railG, railM), r2 = new THREE.Mesh(railG, railM); r1.position.set(wx - CELL / 2, 0.92, wz); r2.position.set(wx - CELL / 2, 0.5, wz); r1.castShadow = r2.castShadow = true; g.add(r1, r2); }
      if (!has(x, z + 1)) { addPost(wx, wz + CELL); const r1 = new THREE.Mesh(railG, railM), r2 = new THREE.Mesh(railG, railM); r1.position.set(wx, 0.92, wz + CELL / 2); r2.position.set(wx, 0.5, wz + CELL / 2); r1.rotation.y = Math.PI / 2; r2.rotation.y = Math.PI / 2; r1.castShadow = r2.castShadow = true; g.add(r1, r2); }
      if (!has(x, z - 1)) { addPost(wx, wz); const r1 = new THREE.Mesh(railG, railM), r2 = new THREE.Mesh(railG, railM); r1.position.set(wx, 0.92, wz); r2.position.set(wx, 0.5, wz); r1.rotation.y = Math.PI / 2; r2.rotation.y = Math.PI / 2; g.add(r1, r2); }
    }
  }

  _rebuildSignsAndVeils() {
    const clear = grp => {
      while (grp.children.length) {
        const c = grp.children.pop();
        c.traverse?.(o => { if (o.material && o.material.map && !o.material.map.__keep) o.material.dispose?.(); });
        grp.remove(c);
      }
    };
    clear(this.forSaleGroup);

    for (const p of PLOTS) {
      if (this.state.plots.has(p.id)) continue;
      const grp = new THREE.Group();
      const cx = (p.x0 + p.w / 2 - 0.5) * CELL, cz = (p.z0 + p.h / 2 - 0.5) * CELL;
      // veil
      const veil = new THREE.Mesh(
        new THREE.PlaneGeometry(p.w * CELL - 0.3, p.h * CELL - 0.3),
        new THREE.MeshBasicMaterial({ color: 0xff5d5d, transparent: true, opacity: 0.07, depthWrite: false })
      );
      veil.rotation.x = -Math.PI / 2;
      veil.position.set(cx, 0.14, cz);
      grp.add(veil);
      // sign post near front-left corner of the plot
      const sx = p.x0 * CELL + 1.6, sz = p.z0 * CELL + 1.6;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), new THREE.MeshStandardMaterial({ color: 0x5b4529 }));
      post.position.set(sx, 0.85, sz); post.castShadow = true;
      const faceM = new THREE.MeshStandardMaterial({ map: textTexture(['FOR SALE', '$' + p.cost]), roughness: 0.8 });
      const sideM = new THREE.MeshStandardMaterial({ color: 0x7a5b36 });
      // BoxGeometry material order: +x,-x,+y,-y,+z,-z
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 0.08),
        [sideM, sideM, sideM, sideM, faceM, faceM]);
      board.position.set(sx, 1.95, sz);
      board.castShadow = true;
      grp.add(post, board);
      this.forSaleGroup.add(grp);
      this.signs.set(p.id, grp);
    }
  }

  setBuildGrid(v) { this.grid.visible = v; }

  update(dt) {
    this.time += dt;
    for (const d of this.depositMeshes) {
      const p = Math.sin(this.time * 2.4 + d.phase);
      d.gemM.emissiveIntensity = 0.75 + p * 0.35;
      d.ringM.opacity = 0.3 + p * 0.18;
    }
  }
}
