// LIMINAL DYNAMICS — chamber construction kit
import * as THREE from 'three';

// Full room shell: floor, ceiling, four walls. Pass null for any side to skip.
export function room(ch, cx, cz, w, d, h, opts = {}) {
  const k = {
    floor: 'floor', ceil: 'ceiling', n: 'panel', s: 'panel', e: 'panel', w: 'panel',
    ...opts,
  };
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  if (k.floor !== null) ch.box(cx, -0.25, cz, w, 0.5, d, { kind: k.floor === true ? 'floor' : k.floor, mapRepeat: [w / 4, d / 4], tag: 'floor' });
  if (k.ceil !== null) ch.box(cx, h + 0.25, cz, w, 0.5, d, { kind: k.ceil === true ? 'ceiling' : k.ceil, shadow: false, tag: 'ceil' });
  const TH = 0.5;
  if (k.n !== null) ch.box(cx, h / 2, z0 - TH / 2, w + TH * 2, h, TH, { kind: k.n === true ? 'panel' : k.n, portalable: k.n === 'panel' || k.n === true, mapRepeat: [w / 4, h / 4], tag: 'wall-n' });
  if (k.s !== null) ch.box(cx, h / 2, z1 + TH / 2, w + TH * 2, h, TH, { kind: k.s === true ? 'panel' : k.s, portalable: k.s === 'panel' || k.s === true, mapRepeat: [w / 4, h / 4], tag: 'wall-s' });
  if (k.e !== null) ch.box(x1 + TH / 2, h / 2, cz, TH, h, d, { kind: k.e === true ? 'panel' : k.e, portalable: k.e === 'panel' || k.e === true, tag: 'wall-e' });
  if (k.w !== null) ch.box(x0 - TH / 2, h / 2, cz, TH, h, d, { kind: k.w === true ? 'panel' : k.w, portalable: k.w === 'panel' || k.w === true, tag: 'wall-w' });
}

// wall running along X at fixed z (with explicit extents)
export function wallSegX(ch, z, x0, x1, y0, y1, kind = 'panel') {
  return ch.box((x0 + x1) / 2, (y0 + y1) / 2, z - 0.25, x1 - x0, y1 - y0, 0.5,
    { kind, portalable: kind === 'panel', mapRepeat: [(x1 - x0) / 4, (y1 - y0) / 4], tag: 'wallsx' });
}

// wall running along Z at fixed x
export function wallSegZ(ch, x, z0, z1, y0, y1, kind = 'panel') {
  return ch.box(x - 0.25, (y0 + y1) / 2, (z0 + z1) / 2, 0.5, y1 - y0, z1 - z0,
    { kind, portalable: kind === 'panel', tag: 'wallsz' });
}

// visual corridor behind an exit door
export function exitCorridor(ch, x, z, ry = 0, floorY = 0) {
  const grp = new THREE.Group();
  const L = 3.6;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3),
    new THREE.MeshStandardMaterial({ color: 0x0c1118, emissive: 0xbfe3ff, emissiveIntensity: 1.15 }));
  back.position.set(0, 1.5, -L);
  grp.add(back);
  const floorM = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, L),
    new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.7 }));
  floorM.position.set(0, -0.15, -L / 2);
  grp.add(floorM);
  for (const s of [-1, 1]) {
    const wm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, L),
      new THREE.MeshStandardMaterial({ color: 0x272d35, roughness: 0.62 }));
    wm.position.set(s * 1.5, 1.5, -L / 2);
    grp.add(wm);
  }
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, L),
    new THREE.MeshStandardMaterial({ color: 0x1b2026 }));
  ceil.position.set(0, 3.1, -L / 2);
  grp.add(ceil);
  // strip light in corridor ceiling
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.7, L * 0.8),
    new THREE.MeshBasicMaterial({ color: 0xdff1ff }));
  strip.rotation.x = Math.PI / 2;
  strip.position.set(0, 2.94, -L / 2);
  grp.add(strip);
  grp.position.set(x, floorY ?? 0, z);
  grp.rotation.y = ry;
  ch.group.add(grp);
  // ---- collision: computed in WORLD space directly (no double offsets) ----
  // local layout: floor slab z in [0, -3.6], walls at x=±1.5, back wall at z=-3.6
  const fy = floorY ?? 0;
  const cA = Math.abs(Math.cos(ry)), sA = Math.abs(Math.sin(ry));
  // rotate a local (lx, lz) half-extent pair into world half extents
  const rotHalf = (hlx, hlz) => ({
    hx: hlx * cA + hlz * sA,
    hz: hlx * sA + hlz * cA,
  });
  // local centers of the pieces (before ry rotation)
  const pieces = [
    { lx: 0, lz: -L / 2 - 0.35, hlx: 1.65, hlz: L / 2 + 0.55 },   // floor: overlaps doorway a bit
    { lx: 1.65, lz: -L / 2, hlx: 0.15, hlz: L / 2 },              // right wall
    { lx: -1.65, lz: -L / 2, hlx: 0.15, hlz: L / 2 },             // left wall
    { lx: 0, lz: -L - 0.15, hlx: 1.8, hlz: 0.15 },                // back wall
  ];
  for (const p of pieces) {
    const wh = rotHalf(p.hlx, p.hlz);
    const wxo = p.lx * Math.cos(ry) + p.lz * Math.sin(ry);
    const wzo = -p.lx * Math.sin(ry) + p.lz * Math.cos(ry);
    ch.barrier(x + wxo - wh.hx, fy - 0.5, z + wzo - wh.hz,
      wh.hx * 2, p === pieces[0] ? 0.5 : 3.2, wh.hz * 2, 'corridor-floor');
  }
}
