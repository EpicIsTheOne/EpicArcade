// CHROME HARBOR — procedural humanoid rigs: skinned boxes + code-driven animation.
// One SkinnedMesh per character => 1 draw call each, real walk/aim/drive/death poses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp } from '../core/util.js';

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

// box centered at (cx,cy,cz) sized (sx,sy,sz), all vertices weighted to boneIdx, colored
function part(sx, sy, sz, cx, cy, cz, boneIdx, colorHex) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    idx[i * 4] = boneIdx; wgt[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
  const c = new THREE.Color(colorHex);
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

const SKINS = ['#e8b48a', '#d9a06b', '#b97f52', '#8a5a38', '#f0c8a0', '#a06a45'];
const SHIRTS = ['#c23b2e', '#3c6ab3', '#3ca35a', '#d9c04a', '#8858b3', '#d97b3c', '#4fa3a8', '#c25a8a', '#5a6a7a'];
const PANTS = ['#33383f', '#3d4a5c', '#4a4038', '#2c3038', '#50565e', '#5c4a3a'];

export function makeHumanoid(opts = {}) {
  const rng = opts.rng || Math.random;
  const scale = opts.scale ?? (0.94 + rng() * 0.12);
  const shirt = opts.shirt ?? SHIRTS[Math.floor(rng() * SHIRTS.length)];
  const pantsC = opts.pants ?? PANTS[Math.floor(rng() * PANTS.length)];
  const skin = opts.skin ?? SKINS[Math.floor(rng() * SKINS.length)];
  const hairC = opts.hair ?? (rng() < 0.3 ? '#2a2018' : rng() < 0.5 ? '#4a3620' : '#1a1a1e');
  const shoeC = '#1c1e24';

  // ---- skeleton ----
  const bones = [];
  const B = (name, px, py, pz, parent) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(px, py, pz);
    (parent || hips).add(b);
    b._idx = bones.length;
    bones.push(b);
    return b;
  };
  const root = new THREE.Object3D();       // feet origin
  const hips = new THREE.Bone(); hips.position.y = 0.96; root.add(hips);
  hips._idx = bones.length; bones.push(hips);

  const spine = B('spine', 0, 0.24, 0, hips);
  const chest = B('chest', 0, 0.30, 0, spine);
  const neck = B('neck', 0, 0.30, 0, chest);
  const head = B('head', 0, 0.10, 0, neck);
  const armLU = B('armLU', -0.26, 0.24, 0, chest);
  const armLF = B('armLF', 0, -0.32, 0, armLU);
  const armRU = B('armRU', 0.26, 0.24, 0, chest);
  const armRF = B('armRF', 0, -0.32, 0, armRU);
  const legLT = B('legLT', -0.11, -0.06, 0, hips);
  const legLS = B('legLS', 0, -0.46, 0, legLT);
  const legRT = B('legRT', 0.11, -0.06, 0, hips);
  const legRS = B('legRS', 0, -0.46, 0, legRT);

  // ---- geometry (merged parts) ----
  const geos = [
    part(0.32, 0.22, 0.21, 0, -0.03, 0, hips._idx, pantsC),                 // pelvis
    part(0.34, 0.34, 0.23, 0, 0.13, 0, spine._idx, shirt),                  // torso
    part(0.40, 0.32, 0.25, 0, 0.15, 0, chest._idx, shirt),                  // chest
    part(0.22, 0.26, 0.24, 0, 0.14, 0.01, head._idx, skin),                 // head
    part(0.24, 0.12, 0.26, 0, 0.245, -0.015, head._idx, hairC),             // hair cap
    part(0.13, 0.32, 0.15, 0, -0.16, 0, armLU._idx, shirt),                 // L upper arm
    part(0.11, 0.20, 0.13, 0, -0.12, 0, armLF._idx, shirt),                 // L forearm sleeve
    part(0.10, 0.14, 0.11, 0, -0.29, 0, armLF._idx, skin),                  // L hand
    part(0.13, 0.32, 0.15, 0, -0.16, 0, armRU._idx, shirt),                 // R upper arm
    part(0.11, 0.20, 0.13, 0, -0.12, 0, armRF._idx, shirt),                 // R forearm
    part(0.10, 0.14, 0.11, 0, -0.29, 0, armRF._idx, skin),                  // R hand
    part(0.16, 0.46, 0.18, 0, -0.23, 0, legLT._idx, pantsC),                // L thigh
    part(0.14, 0.42, 0.16, 0, -0.21, 0, legLS._idx, pantsC),                // L shin
    part(0.13, 0.09, 0.27, 0, -0.44, 0.05, legLS._idx, shoeC),              // L shoe
    part(0.16, 0.46, 0.18, 0, -0.23, 0, legRT._idx, pantsC),                // R thigh
    part(0.14, 0.42, 0.16, 0, -0.21, 0, legRS._idx, pantsC),                // R shin
    part(0.13, 0.09, 0.27, 0, -0.44, 0.05, legRS._idx, shoeC),              // R shoe
  ];
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const mesh = new THREE.SkinnedMesh(merged, mat);
  mesh.castShadow = true;
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  root.updateMatrixWorld(true);

  // inner group carries the walk-bob so physics position stays clean
  const inner = new THREE.Group();
  // reparent: outer.group -> inner -> mesh
  const group = new THREE.Group();
  group.add(inner);
  inner.add(mesh);

  const rig = {
    group, mesh, bones,
    height: 1.78 * scale,
    st: {
      speed01: 0, moving: false, run: false,
      aiming: false, armed: null,          // 'pistol' | 'smg' | 'shotgun' | 'rifle'
      aimPitch: 0, lookYaw: 0, lookPitch: 0,
      seated: false, punchT: -1, crouch: 0, dead: 0,
      stridePhase: Math.floor(rng() * 6.28),
      _stepFlag: false,
    },
    onFootstep: null,
    gunMesh: null,

    attachGun(kind) {
      if (this.gunMesh) { armRF.remove(this.gunMesh); this.gunMesh = null; }
      if (!kind || kind === 'fist') return;
      const g = new THREE.Group();
      const dark = new THREE.MeshStandardMaterial({ color: '#23262c', roughness: .5, metalness: .55 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(kind === 'pistol' ? 0.05 : 0.07, kind === 'pistol' ? 0.09 : 0.12, kind === 'pistol' ? 0.19 : 0.42), dark);
      body.position.set(0, -0.31, 0.1);
      g.add(body);
      const barrelTipY = kind === 'pistol' ? -0.31 : -0.31;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, kind === 'pistol' ? 0.08 : 0.16), dark);
      tip.position.set(0, barrelTipY, kind === 'pistol' ? 0.22 : 0.34);
      g.add(tip);
      armRF.add(g);
      this.gunMesh = g;
      g.visible = true;
    },

    update(dt, tNow) {
      const s = this.st;
      const k = Math.min(1, dt * 13);
      // target euler per bone
      const setT = (bone, x, y = 0, z = 0) => {
        _q.setFromEuler(_e.set(x, y, z));
        bone.quaternion.slerp(_q, k);
      };

      if (s.dead > 0) {
        // limp sprawl
        setT(armLU, 0.3, 0, 0.9); setT(armRU, 0.3, 0, -0.9);
        setT(armLF, -0.3); setT(armRF, -0.3);
        setT(legLT, 0.25, 0, 0.15); setT(legRT, 0.2, 0, -0.2);
        setT(legLS, -0.3); setT(legRS, -0.2);
        setT(spine, 0.1); setT(chest, 0.05); setT(head, 0.2);
        return;
      }

      if (s.seated) {
        setT(legLT, -1.42, 0, 0.06); setT(legRT, -1.42, 0, -0.06);
        setT(legLS, 1.28); setT(legRS, 1.28);
        setT(armLU, -0.85, 0, 0.32); setT(armRU, -0.85, 0, -0.32);
        setT(armLF, -0.55); setT(armRF, -0.55);
        setT(spine, 0.06); setT(head, s.lookPitch * 0.5, s.lookYaw * 0.6);
        return;
      }

      // ---- locomotion ----
      const sp = s.speed01;
      const freq = 5.4 + sp * 6.2;
      s.stridePhase += dt * freq * (s.moving ? 1 : 0);
      const ph = s.stridePhase;
      const amp = s.moving ? (s.run ? 0.72 : 0.5) * (0.4 + sp * 0.8) : 0;

      let thighL = Math.sin(ph) * amp;
      let thighR = Math.sin(ph + Math.PI) * amp;
      let shinL = Math.max(0, -Math.sin(ph - 0.6)) * amp * 1.15;
      let shinR = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * amp * 1.15;

      const cr = s.crouch;
      setT(legLT, thighL - cr * 0.9, 0, 0.04);
      setT(legRT, thighR - cr * 0.9, 0, -0.04);
      setT(legLS, shinL + cr * 1.4); setT(legRS, shinR + cr * 1.4);

      const lean = (s.run ? 0.24 : 0.08) * sp + cr * 0.35;
      setT(spine, lean * 0.6, Math.sin(ph) * 0.04 * sp);
      setT(chest, lean * 0.5, Math.sin(ph + Math.PI) * 0.05 * sp);

      // ---- arms ----
      const armed = s.armed && s.armed !== 'fist';
      if (s.punchT >= 0) {
        const p = clamp(s.punchT, 0, 1);
        const ext = Math.sin(Math.min(p, 0.5) / 0.5 * Math.PI * 0.5) * (p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5);
        setT(armRU, lerp(-0.1, -Math.PI / 2 * 0.95, ext), 0, -0.15 * (1 - ext));
        setT(armRF, lerp(-0.35, -0.05, ext));
        setT(armLU, 0.25, 0, 0.25); setT(armLF, -0.9);
      } else if (s.aiming && armed) {
        const ap = s.aimPitch;
        const twoHand = s.armed !== 'pistol';
        setT(armRU, -Math.PI / 2 + ap * 0.9, 0, -0.06);
        setT(armRF, -0.12);
        if (twoHand) {
          setT(armLU, -Math.PI / 2 + ap * 0.85, 0.45, 0.28);
          setT(armLF, -0.55);
        } else {
          setT(armLU, -0.25, 0, 0.3); setT(armLF, -0.75);
        }
        setT(chest, 0.02, -0.14);
      } else if (armed) {
        // lowered carry
        setT(armRU, -0.55, 0, -0.1); setT(armRF, -0.85);
        setT(armLU, Math.sin(ph + Math.PI) * amp * 0.6, 0, 0.06); setT(armLF, -0.35);
      } else {
        setT(armLU, Math.sin(ph + Math.PI) * amp * 0.85, 0, 0.07);
        setT(armRU, Math.sin(ph) * amp * 0.85, 0, -0.07);
        setT(armLF, s.moving ? -0.35 : -0.18);
        setT(armRF, s.moving ? -0.35 : -0.18);
      }

      setT(neck, s.lookPitch * 0.4, s.lookYaw * 0.55);
      setT(head, s.lookPitch * 0.5, s.lookYaw * 0.45);

      if (s.punchT >= 0) s.punchT += dt * 2.6;
      if (s.punchT > 1) s.punchT = -1;

      // walk bob + footstep trigger
      inner.position.y = s.moving ? Math.abs(Math.sin(ph)) * 0.045 * (0.4 + sp) : 0;
      inner.position.z = 0;
      const foot = Math.sin(ph);
      if (s.moving && this.onFootstep) {
        if (foot > 0.92 && !s._stepFlag) { s._stepFlag = true; this.onFootstep(s.run); }
        else if (foot < -0.92 && s._stepFlag) { s._stepFlag = false; this.onFootstep(s.run); }
      }
    },
  };
  group.scale.setScalar(scale);
  return rig;
}

// quick factory variety for pedestrians
export function randomPedLook() {
  return {}; // makeHumanoid already randomizes; hook kept for future uniforms
}
