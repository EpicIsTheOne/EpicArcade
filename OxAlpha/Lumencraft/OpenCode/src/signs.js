// In-world text signs: canvas sprite labels above sign blocks (same sprite
// technique as remote-player name tags). Managed by the net layer.
import * as THREE from 'three';

function signTexture(text, owner) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 84;
  const c = cv.getContext('2d');
  // parchment plate
  c.fillStyle = 'rgba(196, 160, 100, .94)';
  c.fillRect(4, 4, 248, 76);
  c.strokeStyle = 'rgba(80, 55, 25, .95)';
  c.lineWidth = 4;
  c.strokeRect(4, 4, 248, 76);
  // text: wrap at ~26 chars, 2 lines
  const t = String(text || '');
  const lines = [];
  let rest = t;
  while (rest.length && lines.length < 2) {
    if (rest.length <= 26) { lines.push(rest); rest = ''; }
    else {
      let cut = rest.lastIndexOf(' ', 26);
      if (cut < 10) cut = 26;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
  }
  if (rest.length) lines[1] = (lines[1] || '') + '…';
  c.fillStyle = '#2a1c0c';
  c.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText(lines[0] || '', 128, 38);
  if (lines[1]) c.fillText(lines[1], 128, 66);
  // owner tag bottom-right, tiny
  c.font = '13px "Segoe UI", system-ui, sans-serif';
  c.fillStyle = 'rgba(60, 40, 15, .8)';
  c.textAlign = 'right';
  c.fillText('— ' + (owner || '?'), 246, 76);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SignManager {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // "x,y,z" -> sprite
    this.root = new THREE.Group();
    this.root.userData.noShadow = true;
    scene.add(this.root);
  }

  set(x, y, z, text, owner) {
    const key = x + ',' + y + ',' + z;
    this.remove(key);
    const tex = signTexture(text, owner);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    }));
    sp.scale.set(1.7, 0.56, 1);
    sp.position.set(x + 0.5, y + 1.45, z + 0.5);
    sp.userData.noShadow = true;
    this.root.add(sp);
    this.map.set(key, sp);
  }

  remove(key) {
    const sp = this.map.get(key);
    if (!sp) return;
    this.root.remove(sp);
    if (sp.material.map) sp.material.map.dispose();
    sp.material.dispose();
    this.map.delete(key);
  }

  reset(entries) {
    for (const key of [...this.map.keys()]) this.remove(key);
    for (const s of (entries || [])) {
      if (Array.isArray(s) && s.length >= 5) this.set(s[0], s[1], s[2], s[4], s[3]);
    }
  }

  has(key) { return this.map.has(key); }

  dispose() {
    for (const key of [...this.map.keys()]) this.remove(key);
    if (this.root.parent) this.scene.remove(this.root);
  }
}
