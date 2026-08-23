// Stylized low-poly character rig (original design: "Kestrels").
// Procedural geometry, simple walk/aim animation via bone-less group transforms.
import * as THREE from 'three';

const SKIN = 0xd9a878;
const SUIT = 0x2a3244;
const SUIT2 = 0x39445c;
const ACCENT = 0x59c8ff;

function limb(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
  );
  m.castShadow = true;
  return m;
}

// Creates a character group. Returns handles for animation.
export function createCharacter(opts = {}) {
  const suit = opts.suit ?? SUIT;
  const accent = opts.accent ?? ACCENT;
  const skin = opts.skin ?? SKIN;
  const g = new THREE.Group();

  // torso pivot at hips (y=0 at feet)
  const hips = new THREE.Group(); hips.position.y = 0.92; g.add(hips);
  const torso = limb(0.62, 0.72, 0.34, suit); torso.position.y = 0.36; hips.add(torso);
  const chestPlate = limb(0.5, 0.34, 0.38, accent); chestPlate.position.set(0, 0.48, -0.02); chestPlate.scale.set(1, 1, 1); hips.add(chestPlate);
  // head
  const neckY = 0.86;
  const head = new THREE.Group(); head.position.y = neckY; hips.add(head);
  const skull = limb(0.4, 0.4, 0.42, skin); skull.position.y = 0.2; head.add(skull);
  const helm = limb(0.46, 0.22, 0.48, suit2Color(suit)); helm.position.y = 0.36; head.add(helm);
  const visor = limb(0.34, 0.09, 0.05, 0x0e141f); visor.position.set(0, 0.22, -0.21); head.add(visor);

  // arms: shoulder pivots
  const armL = new THREE.Group(); armL.position.set(-0.41, 0.62, 0); hips.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.41, 0.62, 0); hips.add(armR);
  const upperL = limb(0.18, 0.52, 0.2, suit2Color(suit)); upperL.position.y = -0.26; armL.add(upperL);
  const upperR = limb(0.18, 0.52, 0.2, suit2Color(suit)); upperR.position.y = -0.26; armR.add(upperR);
  const foreL = limb(0.16, 0.44, 0.18, skin); foreL.position.y = -0.68; armL.add(foreL);
  const foreR = limb(0.16, 0.44, 0.18, skin); foreR.position.y = -0.68; armR.add(foreR);

  // legs: hip pivots (attached to g so they don't inherit torso lean)
  const legL = new THREE.Group(); legL.position.set(-0.17, 0.92, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.17, 0.92, 0); g.add(legR);
  const thighL = limb(0.22, 0.5, 0.24, suit); thighL.position.y = -0.25; legL.add(thighL);
  const thighR = limb(0.22, 0.5, 0.24, suit); thighR.position.y = -0.25; legR.add(thighR);
  const shinL = limb(0.19, 0.46, 0.2, suit2Color(suit)); shinL.position.y = -0.7; legL.add(shinL);
  const shinR = limb(0.19, 0.46, 0.2, suit2Color(suit)); shinR.position.y = -0.7; legR.add(shinR);
  const bootL = limb(0.21, 0.14, 0.3, 0x1c222c); bootL.position.set(0, -0.94, -0.04); legL.add(bootL);
  const bootR = limb(0.21, 0.14, 0.3, 0x1c222c); bootR.position.set(0, -0.94, -0.04); legR.add(bootR);

  // weapon anchor in right hand
  const hand = new THREE.Group(); hand.position.set(0, -0.88, -0.06); armR.add(hand);

  // backpack
  const pack = limb(0.42, 0.5, 0.22, suit2Color(suit)); pack.position.set(0, 0.4, 0.26); hips.add(pack);

  g.userData.rig = { hips, torso, head, armL, armR, legL, legR, hand };
  return g;
}

function suit2Color(base) {
  // slightly lighter variant of the suit color
  const c = new THREE.Color(base);
  c.lerp(new THREE.Color(0xffffff), 0.12);
  return c.getHex();
}

export function createWeaponProp(def) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x272c33, roughness: 0.55, metalness: 0.35 });
  const gripM = new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.9 });
  const accM = new THREE.MeshStandardMaterial({ color: def?.rarity >= 4 ? 0xc06bff : 0x59c8ff, roughness: 0.4, metalness: 0.5 });
  const len = def?.cls === 'SNIPER' || def?.cls === 'DMR' ? 1.15 : def?.cls === 'SHOTGUN' ? 0.85 : def?.cls === 'LAUNCHER' ? 1.0 : 0.75;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, len), body);
  receiver.castShadow = true;
  g.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(def?.cls === 'LAUNCHER' ? 0.05 : 0.025, def?.cls === 'LAUNCHER' ? 0.055 : 0.03, len * 0.7, 8), body);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -(len / 2 + len * 0.32);
  if (def?.cls !== 'LAUNCHER') barrel.position.y = 0.01;
  g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.1), gripM);
  mag.position.set(0, -0.15, 0.02);
  g.add(mag);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), gripM);
  grip.position.set(0, -0.12, 0.18);
  grip.rotation.x = 0.35;
  g.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), accM);
  sight.position.set(0, 0.1, -0.05);
  g.add(sight);
  return g;
}

// Simple procedural animation update.
export function animateCharacter(rig, state, dt, time) {
  const speed = state.speed || 0;
  const walkAmp = Math.min(1, speed / 6.2);
  const freq = 2.1 + walkAmp * 5.2;
  const phase = time * freq;
  const swing = Math.sin(phase) * 0.65 * walkAmp;
  const swing2 = Math.cos(phase) * 0.5 * walkAmp;
  if (state.airborne) {
    rig.legL.rotation.x = 0.5; rig.legR.rotation.x = -0.3;
    rig.armL.rotation.x = -0.7; rig.armR.rotation.x = -0.5;
  } else if (state.sliding) {
    rig.legL.rotation.x = 1.2; rig.legR.rotation.x = 0.4;
    rig.armL.rotation.x = 0.4; rig.armR.rotation.x = 0.9;
  } else {
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
    rig.armL.rotation.x = -swing * 0.85 + (state.aiming ? -1.25 : 0) * 0 + (state.aiming ? 0 : 0) + (state.harvesting ? swingHarvest(time) : 0);
    rig.armR.rotation.x = (state.aiming || state.firing) ? -1.35 : swing * 0.85 + (state.harvesting ? swingHarvest(time) : 0);
  }
  // aim pose: both hands forward when weapon out
  if (state.aiming || state.firing) {
    rig.armL.rotation.x = -1.15; rig.armL.rotation.z = 0.5;
    rig.armR.rotation.x = -1.3; rig.armR.rotation.z = -0.12;
  } else {
    rig.armL.rotation.z = 0.08;
    rig.armR.rotation.z = -0.08;
  }
  // idle bob
  rig.hips.position.y = 0.92 + Math.sin(phase * 2) * 0.02 * walkAmp;
}
function swingHarvest(t) {
  return Math.sin(t * 9) * 1.1 - 0.6;
}
