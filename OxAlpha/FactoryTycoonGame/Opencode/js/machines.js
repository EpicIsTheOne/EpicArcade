import * as THREE from '../lib/three.module.min.js';
import {
  CELL, ITEMS, MACHINES, RECIPES, SMELT_MAP, DIRS, BASE,
  BELT_GAP, OUT_CAP, STORAGE_CAP, isOre,
} from './data.js';

// ---------------- shared geometry / material caches ----------------
const geoCache = new Map();
const G = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const matCache = new Map();
const M = (color, opts = {}) => {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.8, metalness: opts.m ?? 0.05 }));
  return matCache.get(key);
};

const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 14) => G(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));

function beltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#23262c'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#3a3f49'; g.lineWidth = 7;
  for (let i = -1; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 40, 58); g.lineTo(i * 40 + 22, 32); g.lineTo(i * 40, 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.__keep = true;
  return t;
}
let BELT_TEX = null;
let BELT_MAT = null;

function signTex(main) {
  const key = '$sign:' + main;
  if (matCache.has(key)) return matCache.get(key).map;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2f6b45'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffe066'; g.font = '900 84px Segoe UI';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(main, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.__keep = true;
  matCache.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  return t;
}

// light colors
const LIGHT_OK = 0x35e06a, LIGHT_WARN = 0xffc93a, LIGHT_ERR = 0xff4d4d, LIGHT_IDLE = 0x5aa0ff;

// ---------------- machine construction ----------------
function buildGroup(type) {
  const grp = new THREE.Group();
  const parts = {};
  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); grp.add(mesh); return mesh; };

  if (type === 'extractor') {
    const bodyM = M(0xe0b13e, { r: 0.55 });
    add(new THREE.Mesh(box(1.15, 0.85, 1.15), bodyM), 0, 0.43, 0);
    add(new THREE.Mesh(box(1.35, 0.16, 1.35), M(0x8f6f22)), 0, 0.08, 0);
    parts.tower = add(new THREE.Mesh(box(0.42, 1.0, 0.42), M(0xc99a30)), -0.25, 1.3, 0);
    // drill
    const drillG = G('drill', () => {
      const g = new THREE.ConeGeometry(0.26, 0.75, 8);
      g.rotateX(Math.PI);
      return g;
    });
    parts.drill = add(new THREE.Mesh(drillG, M(0xb9bec9, { m: 0.7, r: 0.35 })), 0.28, 0.62, 0);
    parts.drillArm = add(new THREE.Mesh(cyl(0.09, 0.09, 0.7), M(0x777d85, { m: 0.6, r: 0.4 })), 0.28, 1.12, 0);
    // output chute on +X
    add(new THREE.Mesh(box(0.34, 0.2, 0.6), M(0x6f5a20)), 0.72, 0.62, 0);
  }

  else if (type === 'conveyor') {
    if (!BELT_TEX) BELT_TEX = beltTexture();
    if (!BELT_MAT) BELT_MAT = new THREE.MeshStandardMaterial({ map: BELT_TEX, roughness: 0.85 });
    add(new THREE.Mesh(box(1.96, 0.14, 1.3), M(0x3c4048)), 0, 0.07, 0);
    const belt = new THREE.Mesh(G('beltTop', () => { const p = new THREE.PlaneGeometry(1.92, 1.06); p.rotateX(-Math.PI / 2); return p; }), BELT_MAT);
    add(belt, 0, 0.145, 0);
    parts.beltMat = BELT_MAT;
    add(new THREE.Mesh(box(1.96, 0.3, 0.09), M(0x707684, { m: 0.4, r: 0.5 })), 0, 0.24, 0.62);
    add(new THREE.Mesh(box(1.96, 0.3, 0.09), M(0x707684, { m: 0.4, r: 0.5 })), 0, 0.24, -0.62);
    legs(grp);
  }

  else if (type === 'smelter') {
    add(new THREE.Mesh(box(1.7, 1.3, 1.7), M(0x8a4d3d, { r: 0.9 })), 0, 0.65, 0);
    add(new THREE.Mesh(box(1.82, 0.18, 1.82), M(0x5d332a)), 0, 0.09, 0);
    parts.chimney = add(new THREE.Mesh(cyl(0.17, 0.22, 0.95, 10), M(0x4c4c52, { m: 0.5, r: 0.6 })), -0.45, 1.72, -0.45);
    // glowing front window (+X face)
    parts.winMat = new THREE.MeshStandardMaterial({ color: 0xff7a26, emissive: 0xff7a26, emissiveIntensity: 0.15, roughness: 0.5 });
    parts.win = add(new THREE.Mesh(G('win', () => new THREE.PlaneGeometry(0.85, 0.55)), parts.winMat), 0.86, 0.68, 0);
    parts.win.rotation.y = Math.PI / 2;
    add(new THREE.Mesh(box(0.3, 0.16, 0.5), M(0x3d3d44)), 0.88, 1.18, 0);
  }

  else if (type === 'assembler') {
    add(new THREE.Mesh(box(1.8, 1.0, 1.8), M(0x5a6b8c, { r: 0.65 })), 0, 0.5, 0);
    add(new THREE.Mesh(box(1.94, 0.16, 1.94), M(0x39465e)), 0, 0.08, 0);
    // corner pillars
    [[-0.78, -0.78], [0.78, -0.78], [-0.78, 0.78], [0.78, 0.78]].forEach(([px, pz]) =>
      add(new THREE.Mesh(cyl(0.07, 0.07, 1.15, 8), M(0x39465e)), px, 0.57, pz));
    // spinning gear disc on top
    const gear = new THREE.Group();
    const disc = new THREE.Mesh(cyl(0.52, 0.52, 0.12, 18), M(0xd7b23c, { m: 0.55, r: 0.4 }));
    gear.add(disc);
    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(box(0.16, 0.12, 0.2), M(0xb89a30, { m: 0.55, r: 0.4 }));
      const a = (i / 8) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.58, 0, Math.sin(a) * 0.58);
      tooth.rotation.y = -a;
      gear.add(tooth);
    }
    gear.position.set(0, 1.12, 0);
    grp.add(gear);
    parts.gear = gear;
    parts.head = add(new THREE.Mesh(box(0.4, 0.3, 0.4), M(0x8fa3c7, { m: 0.4, r: 0.5 })), 0.55, 1.08, 0);
  }

  else if (type === 'storage') {
    add(new THREE.Mesh(box(1.8, 0.12, 1.8), M(0x6e5334)), 0, 0.06, 0);
    parts.crateA = add(new THREE.Mesh(box(0.85, 0.85, 0.85), M(0x9a7748, { r: 0.9 })), -0.42, 0.55, -0.4);
    parts.crateB = add(new THREE.Mesh(box(0.85, 0.85, 0.85), M(0x8a6a3e, { r: 0.9 })), 0.48, 0.55, 0.42);
    parts.crateC = add(new THREE.Mesh(box(0.72, 0.72, 0.72), M(0xa9855a, { r: 0.9 })), -0.38, 1.33, -0.36);
    [[parts.crateA, 0.87], [parts.crateB, 0.87], [parts.crateC, 0.74]].forEach(([cr, w]) => {
      const strap = new THREE.Mesh(box(w, 0.1, w + 0.02), M(0x5c4626));
      cr.add(strap);
    });
  }

  else if (type === 'seller') {
    add(new THREE.Mesh(box(1.75, 1.35, 1.45), M(0x3f9d5f, { r: 0.7 })), 0, 0.67, -0.15);
    add(new THREE.Mesh(box(1.9, 0.14, 1.6), M(0x2c7247)), 0, 0.07, -0.15);
    // counter on +X side
    add(new THREE.Mesh(box(0.5, 0.75, 1.3), M(0x8a6f4d)), 0.75, 0.37, 0);
    // awning stripes
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(box(0.36, 0.07, 0.85), M(i % 2 ? 0xf2f2f2 : 0x2f8f55));
      add(stripe, -0.7 + i * 0.35, 1.62, 0.28);
      stripe.rotation.x = -0.28;
    }
    // $ sign board facing +X
    const sb = new THREE.Mesh(G('$board', () => new THREE.PlaneGeometry(0.9, 0.9)), new THREE.MeshStandardMaterial({ map: signTex('$'), roughness: 0.7 }));
    add(sb, 0.89, 1.05, -0.15);
    sb.rotation.y = Math.PI / 2;
    // coin that pops on sale
    parts.coin = add(new THREE.Mesh(
      cyl(0.22, 0.22, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.25, emissive: 0xaa8800, emissiveIntensity: 0.4 })
    ), 0, 2.0, 0);
    parts.coin.rotation.x = Math.PI / 2;
    parts.coin.visible = false;
  }

  // status light on a small pole at the front-right corner (+X/+Z)
  if (type !== 'conveyor') {
    const pole = new THREE.Mesh(cyl(0.03, 0.03, 0.5, 6), M(0x2b2e33));
    add(pole, type === 'seller' ? 0.55 : 0.62, type === 'seller' ? 1.55 : (MACHINES[type].h + 0.1), 0.55);
    const bulbM = new THREE.MeshStandardMaterial({ color: LIGHT_IDLE, emissive: LIGHT_IDLE, emissiveIntensity: 2.4 });
    const bulb = new THREE.Mesh(G('bulb', () => new THREE.SphereGeometry(0.09, 10, 8)), bulbM);
    add(bulb, type === 'seller' ? 0.55 : 0.62, type === 'seller' ? 1.83 : (MACHINES[type].h + 0.38), 0.55);
    parts.bulbM = bulbM;
  }

  grp.traverse(o => { if (o.isMesh && o.geometry.type !== 'PlaneGeometry') o.castShadow = true; });
  return { grp, parts };
}

function legs(grp) {
  const lm = M(0x272a30);
  const lg = box(0.1, 0.16, 0.1);
  [[-0.85, 0.5], [0.85, 0.5], [-0.85, -0.5], [0.85, -0.5]].forEach(([px, pz]) => {
    const l = new THREE.Mesh(lg, lm);
    l.position.set(px, 0.08, pz * 1.1);
    grp.add(l);
  });
}

// item meshes (pooled)
const itemPool = new Map(); // type -> Mesh[]
const activeItems = new Set();
function itemMesh(type) {
  let arr = itemPool.get(type);
  if (!arr) { arr = []; itemPool.set(type, arr); }
  let m = arr.pop();
  if (!m) {
    if (activeItems.size > 380) return null; // hard cap
    const col = ITEMS[type].color;
    m = new THREE.Mesh(G('itemCube', () => new THREE.BoxGeometry(0.34, 0.3, 0.34)),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.15, emissive: col, emissiveIntensity: 0.12 }));
  }
  m.visible = true;
  activeItems.add(m);
  return m;
}
export function releaseItemMesh(m) {
  m.visible = false;
  activeItems.delete(m);
  itemPool.get(m.userData.type)?.push(m);
}

// ---------------- runtime factory ----------------
export function createMachine(scene, type, gx, gz, rot) {
  const { grp, parts } = buildGroup(type);
  grp.position.set(gx * CELL, 0, gz * CELL);
  grp.rotation.y = -rot * Math.PI / 2;
  scene.add(grp);
  const dep = type === 'extractor' ? null : undefined; // set by caller via linkDeposits
  const m = {
    type, gx, gz, rot, grp, parts,
    in: {}, out: [], items: [],
    prodT: 0, workT: 0, working: null, animT: Math.random() * 10,
    deposit: null, _light: '', fxT: -10,
  };
  syncRot(m);
  return m;
}
export function linkDeposits(m, world) {
  if (m.type !== 'extractor') return;
  m.deposit = world.depositAt(m.gx, m.gz);
}
export function disposeMachine(scene, m) {
  scene.remove(m.grp);
  for (const it of m.items) releaseItemMesh(it.mesh);
  m.items.length = 0;
}

export function syncRot(m) {
  m.grp.rotation.y = -m.rot * Math.PI / 2;
}

// ---------------- simulation ----------------
function setLight(m, state) {
  if (m._light === state) return;
  m._light = state;
  if (!m.parts.bulbM) return;
  const c = state === 'ok' ? LIGHT_OK : state === 'warn' ? LIGHT_WARN : state === 'err' ? LIGHT_ERR : LIGHT_IDLE;
  m.parts.bulbM.color.setHex(c);
  m.parts.bulbM.emissive.setHex(c);
}

export function frontCell(m) {
  const d = DIRS[m.rot];
  return [m.gx + d[0], m.gz + d[1]];
}

// ctx: { at(gx,gz), up(id), sell(type, wx, wz), time }
export function tryInsert(target, type, ctx) {
  switch (target.type) {
    case 'seller':
      ctx.sell(type, target.gx * CELL, target.gz * CELL);
      target.fxT = ctx.time;
      return true;
    case 'conveyor': {
      const q = target.items;
      if (q.length >= 3) return false;
      if (q.length && q[q.length - 1].t < 0.44) return false;
      const mesh = itemMesh(type);
      const rec = { type, t: 0, mesh };
      if (mesh) mesh.userData.type = type;
      q.push(rec);
      return true;
    }
    case 'storage': {
      if (target.items.length >= STORAGE_CAP) return false;
      const mesh = itemMesh(type);
      const rec = { type, mesh };
      if (mesh) mesh.userData.type = type;
      target.items.push(rec);
      return true;
    }
    case 'smelter': {
      if (!isOre(type)) return false;
      if ((target.in[type] || 0) >= 4) return false;
      target.in[type] = (target.in[type] || 0) + 1;
      return true;
    }
    case 'assembler': {
      const needed = RECIPES.some(r => r.inputs[type]);
      if (!needed) return false;
      if ((target.in[type] || 0) >= 6) return false;
      target.in[type] = (target.in[type] || 0) + 1;
      return true;
    }
    default: return false;
  }
}

function flushOut(m, ctx) {
  while (m.out.length) {
    const [fx, fz] = frontCell(m);
    const nxt = ctx.at(fx, fz);
    if (nxt && tryInsert(nxt, m.out[0], ctx)) m.out.shift();
    else break;
  }
}

export function updateMachine(m, dt, ctx) {
  m.animT += dt;
  const P = m.parts;

  switch (m.type) {
    case 'extractor': {
      if (!m.deposit || !m.deposit.owned) { setLight(m, 'err'); break; }
      const rate = 1 + 0.3 * ctx.up('drill');
      if (P.drill) P.drill.rotation.y += dt * (7 * rate);
      if (P.drillArm) P.drillArm.rotation.y -= dt * (4 * rate);
      if (m.out.length < OUT_CAP) {
        m.prodT += dt * rate;
        setLight(m, 'ok');
        if (m.prodT >= BASE.extractorTime) {
          m.prodT = 0;
          m.out.push(m.deposit.res);
        }
      } else {
        m.prodT = Math.min(m.prodT, BASE.extractorTime);
        setLight(m, 'warn');
      }
      flushOut(m, ctx);
      break;
    }

    case 'conveyor': {
      const spd = BASE.beltSpeed * (1 + 0.35 * ctx.up('belt'));
      const q = m.items;
      for (let i = 0; i < q.length; i++) {
        const lim = i === 0 ? 1 : Math.max(q[i - 1].t - BELT_GAP, q[i].t);
        q[i].t = Math.min(lim, q[i].t + dt * spd);
      }
      if (q.length && q[0].t >= 1) {
        const [fx, fz] = frontCell(m);
        const nxt = ctx.at(fx, fz);
        if (nxt && tryInsert(nxt, q[0].type, ctx)) {
          releaseItemMesh(q[0].mesh);
          q.shift();
        }
      }
      if (P.beltMat) P.beltMat.map.offset.x -= dt * spd * 0.42;
      break;
    }

    case 'smelter': {
      const rate = 1 + 0.3 * ctx.up('furn');
      if (m.working) {
        m.workT += dt * rate;
        if (m.workT >= BASE.smelterTime) {
          m.out.push(SMELT_MAP[m.working]);
          m.working = null;
          m.workT = 0;
        }
      }
      if (!m.working) {
        for (const ore of ['iron_ore', 'copper_ore']) {
          if ((m.in[ore] || 0) > 0) { m.in[ore]--; m.working = ore; m.workT = 0; break; }
        }
      }
      if (P.winMat) P.winMat.emissiveIntensity = m.working ? 1.1 + Math.sin(m.animT * 7) * 0.5 : 0.15;
      if (m.out.length >= OUT_CAP && m.working) setLight(m, 'warn');
      else if (m.working) setLight(m, 'ok');
      else setLight(m, Object.values(m.in).some(v => v > 0) ? 'ok' : 'err');
      flushOut(m, ctx);
      break;
    }

    case 'assembler': {
      const rate = 1 + 0.3 * ctx.up('asm');
      if (m.working) {
        m.workT += dt * rate;
        if (P.gear) P.gear.rotation.y += dt * 5;
        if (m.workT >= m.working.time) {
          m.out.push(m.working.out);
          m.working = null;
          m.workT = 0;
        }
      }
      if (!m.working) {
        for (const r of RECIPES) {
          if (Object.entries(r.inputs).every(([t, n]) => (m.in[t] || 0) >= n)) {
            for (const [t, n] of Object.entries(r.inputs)) m.in[t] -= n;
            m.working = r;
            m.workT = 0;
            break;
          }
        }
      }
      if (P.gear && !m.working) P.gear.rotation.y += dt * 0.6;
      if (m.out.length >= OUT_CAP && m.working) setLight(m, 'warn');
      else if (m.working) setLight(m, 'ok');
      else setLight(m, 'err');
      flushOut(m, ctx);
      break;
    }

    case 'storage': {
      if (m.items.length) {
        const [fx, fz] = frontCell(m);
        const nxt = ctx.at(fx, fz);
        if (nxt && tryInsert(nxt, m.items[0].type, ctx)) {
          releaseItemMesh(m.items[0].mesh);
          m.items.shift();
        }
      }
      setLight(m, m.items.length >= STORAGE_CAP ? 'warn' : m.items.length ? 'ok' : 'idle');
      break;
    }

    case 'seller': {
      setLight(m, 'ok');
      if (P.coin) {
        const k = ctx.time - m.fxT;
        if (k < 0.5) {
          P.coin.visible = true;
          const s = 1 + Math.sin(Math.min(k / 0.5, 1) * Math.PI) * 0.9;
          P.coin.scale.setScalar(s);
          P.coin.position.y = 2.0 + k * 0.8;
          P.coin.rotation.z += dt * 9;
        } else P.coin.visible = false;
      }
      break;
    }
  }
}

// position conveyor/storage item visuals
export function syncItemVisuals(state, dt) {
  for (const m of state.machines.values()) {
    if (m.type === 'conveyor') {
      const d = DIRS[m.rot];
      for (const it of m.items) {
        if (!it.mesh) continue;
        it.mesh.position.set(
          m.gx * CELL + d[0] * (it.t - 0.5) * CELL,
          0.34 + Math.sin((m.animT + it.t * 6)) * 0.012,
          m.gz * CELL + d[1] * (it.t - 0.5) * CELL
        );
        it.mesh.rotation.y = -(m.rot) * Math.PI / 2 + m.animT * 0.7;
      }
    } else if (m.type === 'storage') {
      for (let i = 0; i < Math.min(m.items.length, 8); i++) {
        const it = m.items[i];
        if (!it.mesh) continue;
        it.mesh.position.set(m.gx * CELL - 0.6 + (i % 4) * 0.4, 1.02 + Math.floor(i / 4) * 0.34, m.gz * CELL + 0.55);
        it.mesh.rotation.y = m.animT * 0.3 + i;
      }
    }
  }
}

// ---------------- status text ----------------
const pct = a => Math.round(a * 100);
export function statusOf(m) {
  switch (m.type) {
    case 'extractor':
      if (!m.deposit || !m.deposit.owned) return ['err', 'No deposit! Move me onto ore.'];
      if (m._light === 'warn') return ['warn', `OUTPUT JAMMED — ${pct(m.prodT / BASE.extractorTime)}% mined`];
      return ['ok', `Mining ${ITEMS[m.deposit.res].name} — ${pct(m.prodT / BASE.extractorTime)}%`];
    case 'conveyor':
      return ['ok', m.items.length ? `Moving ${m.items.length} item${m.items.length > 1 ? 's' : ''}` : 'Idle — nothing to carry'];
    case 'smelter': {
      if (m.working) {
        if (m._light === 'warn') return ['warn', `OUTPUT FULL — smelting ${pct(m.workT / BASE.smelterTime)}%`];
        return ['ok', `Smelting ${ITEMS[m.working].name} — ${pct(m.workT / BASE.smelterTime)}%`];
      }
      const has = Object.entries(m.in).filter(([t, n]) => n > 0).map(([t]) => ITEMS[t].name);
      return has.length ? ['ok', 'Loading ' + has.join(', ')] : ['err', 'Starved — needs Ore'];
    }
    case 'assembler': {
      if (m.working) {
        const r = m.working;
        if (m._light === 'warn') return ['warn', `OUTPUT FULL — crafting ${ITEMS[r.out].name}`];
        return ['ok', `Crafting ${ITEMS[r.out].name} — ${pct(m.workT / r.time)}%`];
      }
      const missing = [];
      for (const r of RECIPES) {
        const miss = Object.entries(r.inputs).filter(([t, n]) => (m.in[t] || 0) < n).map(([t]) => ITEMS[t].name);
        if (miss.length) missing.push(...miss);
      }
      return missing.length ? ['err', 'Waiting: ' + [...new Set(missing)].join(', ')] : ['ok', 'Starting craft…'];
    }
    case 'storage':
      return [m.items.length >= STORAGE_CAP ? 'warn' : 'ok', `${m.items.length} / ${STORAGE_CAP} stored`];
    case 'seller':
      return ['ok', 'Buys anything — cha-ching!'];
  }
  return ['', ''];
}

export function bufChips(m) {
  const chips = [];
  const add = (t, n) => { if (n > 0) chips.push(`${ITEMS[t].name} ×${n}`); };
  if (m.in) for (const [t, n] of Object.entries(m.in)) add(t, n);
  if (m.working) chips.push('▶ ' + (typeof m.working === 'string' ? ITEMS[SMELT_MAP[m.working]].name : ITEMS[m.working.out].name));
  if (m.out) for (const t of m.out) add(t, 1);
  if (m.items) {
    const counts = {};
    for (const it of m.items) counts[it.type] = (counts[it.type] || 0) + 1;
    for (const [t, n] of Object.entries(counts)) add(t, n);
  }
  return chips;
}
