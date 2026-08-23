// LIMINAL DYNAMICS — chambers 01-04
import * as THREE from 'three';

// ---------- shared helpers ----------
export function room(ch, cx, cz, w, d, h, opts = {}) {
  const k = opts;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  if (k.floor !== null) ch.box(cx, -0.25, cz, w, 0.5, d, { kind: k.floor || 'floor', mapRepeat: [w / 4, d / 4], tag: 'floor' });
  if (k.ceil !== null) ch.box(cx, h + 0.25, cz, w, 0.5, d, { kind: k.ceil || 'ceiling', shadow: false });
  const TH = 0.5;
  if (k.n !== null) ch.box(cx, h / 2, z0 - TH / 2, w + TH * 2, h, TH, { kind: k.n || 'panel', portalable: (k.n || 'panel') === 'panel', mapRepeat: [w / 4, h / 4] });
  if (k.s !== null) ch.box(cx, h / 2, z1 + TH / 2, w + TH * 2, h, TH, { kind: k.s || 'panel', portalable: (k.s || 'panel') === 'panel', mapRepeat: [w / 4, h / 4] });
  if (k.e !== null) ch.box(x1 + TH / 2, h / 2, cz, TH, h, d, { kind: k.e || 'panel', portalable: (k.e || 'panel') === 'panel' });
  if (k.w !== null) ch.box(x0 - TH / 2, h / 2, cz, TH, h, d, { kind: k.w || 'panel', portalable: (k.w || 'panel') === 'panel' });
}

// wall running along X at fixed z
export function wallSegX(ch, z, x0, x1, y0, y1, kind = 'panel') {
  return ch.box((x0 + x1) / 2, (y0 + y1) / 2, z, x1 - x0, y1 - y0, 0.5,
    { kind, portalable: kind === 'panel', mapRepeat: [(x1 - x0) / 4, (y1 - y0) / 4] });
}
// wall running along Z at fixed x
export function wallSegZ(ch, x, z0, z1, y0, y1, kind = 'panel') {
  return ch.box(x, (y0 + y1) / 2, (z0 + z1) / 2, 0.5, y1 - y0, z1 - z0,
    { kind, portalable: kind === 'panel' });
}

export function exitCorridor(ch, x, z, ry) {
  // small visual corridor behind an exit door (facing ry)
  const g = new THREE.Group();
  // simple: floor + two side walls + glowing back panel, oriented by ry
  const L = 4;
  const mk = (w, h, d, px, py, pz, kind = 'metal') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x272d35, roughness: 0.6, metalness: 0.5 }));
    m.position.set(px, py, pz);
    ch.group.add(m);
    return m;
  };
  // build in local space assuming door faces +z->corridor extends -z; rotate whole set
  const grp = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3),
    new THREE.MeshStandardMaterial({ color: 0x0c1118, emissive: 0xbfe3ff, emissiveIntensity: 1.1 }));
  back.position.set(0, 1.5, -L);
  grp.add(back);
  const floorM = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, L),
    new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.7 }));
  floorM.position.set(0, -0.15, -L / 2);
  grp.add(floorM);
  for (const s of [-1, 1]) {
    const wm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, L),
      new THREE.MeshStandardMaterial({ color: 0x272d35, roughness: 0.6 }));
    wm.position.set(s * 1.5, 1.5, -L / 2);
    grp.add(wm);
  }
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, L),
    new THREE.MeshStandardMaterial({ color: 0x1b2026 }));
  ceil.position.set(0, 3.1, -L / 2);
  grp.add(ceil);
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  ch.group.add(grp);
}

// =====================================================================
export const CHAMBERS_A = [
  // ---------------------------------------------------------------- 01
  {
    id: 'ch01', name: 'FIRST LIGHT', sub: 'PAIR PLACEMENT',
    glyphs: ['portal'],
    spawn: [0, 1.2, 4.6], yaw: 0,
    hint: 'LEFT CLICK / RIGHT CLICK place linked rifts on white panels',
    build(ch) {
      room(ch, 0, 0, 16, 12, 5, { floor: 'floor', n: null, s: 'panel', e: 'panel', w: 'panel' });
      // north wall with door hole
      wallSegX(ch, -6, -8, -1.3, 0, 5);
      wallSegX(ch, -6, 1.3, 8, 0, 5);
      wallSegX(ch, -6, -1.3, 1.3, 3, 5);
      // trench
      ch.box(-6.5, -1.375, 0, 9, 2.25, 3, { kind: 'concrete' }); // wait -> replaced below
    },
  },
];
