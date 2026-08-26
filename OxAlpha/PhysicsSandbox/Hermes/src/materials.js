// Procedural canvas textures + shared materials. Everything generated at boot,
// zero external assets.
window.SB = window.SB || {};
SB.Mats = (function () {
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  function noise(g, w, h, alpha, n) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${(Math.random() * alpha).toFixed(3)})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
  }

  const tex = {};

  function build() {
    // ground: sandy tiles with grid
    tex.ground = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#cfc19a'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.05, 2600);
      g.strokeStyle = 'rgba(120,105,70,.35)'; g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
      g.fillStyle = 'rgba(120,105,70,.10)';
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 14 + Math.random() * 42, 0, 7);
        g.fill();
      }
    }, true);
    tex.ground.repeat.set(26, 26);

    // wooden crate
    tex.crate = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#b98544'; g.fillRect(0, 0, w, h);
      // planks
      g.fillStyle = 'rgba(90,55,20,.28)';
      for (let y = 0; y < 4; y++) g.fillRect(0, y * 64 + 60, w, 4);
      noise(g, w, h, 0.07, 900);
      // frame
      g.strokeStyle = '#8a5a24'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
      // diagonal brace
      g.beginPath(); g.moveTo(16, 16); g.lineTo(w - 16, h - 16); g.stroke();
      g.strokeStyle = 'rgba(60,35,10,.5)'; g.lineWidth = 3;
      g.strokeRect(9, 9, w - 18, h - 18);
      // corner bolts
      g.fillStyle = '#5c3a12';
      [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]].forEach(p => {
        g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fill();
      });
    });

    // metal barrel (teal)
    tex.barrel = canvasTex(256, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#2e6f6d'); grd.addColorStop(.25, '#3f8f8c');
      grd.addColorStop(.5, '#2a6361'); grd.addColorStop(.75, '#3f8f8c'); grd.addColorStop(1, '#275a58');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      // ribs
      g.fillStyle = 'rgba(0,0,0,.30)';
      [52, 128, 204].forEach(y => g.fillRect(0, y, w, 12));
      g.fillStyle = 'rgba(255,255,255,.14)';
      [48, 124, 200].forEach(y => g.fillRect(0, y, w, 4));
      noise(g, w, h, 0.06, 500);
    });

    // explosive barrel
    tex.barrelBoom = canvasTex(256, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#8f2320'); grd.addColorStop(.25, '#c23a33');
      grd.addColorStop(.5, '#87201d'); grd.addColorStop(.75, '#c23a33'); grd.addColorStop(1, '#7c1c1a');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,.32)';
      [40, 216].forEach(y => g.fillRect(0, y, w, 13));
      g.fillStyle = 'rgba(255,255,255,.15)';
      [36, 212].forEach(y => g.fillRect(0, y, w, 4));
      // hazard diamond
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
      g.fillStyle = '#151515'; g.fillRect(-34, -34, 68, 68);
      g.fillStyle = '#ffb454'; g.font = 'bold 46px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.rotate(Math.PI / 4); g.fillText('!', 0, 2);
      g.restore();
      noise(g, w, h, 0.06, 400);
    });

    // concrete
    tex.concrete = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#98a0a6'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.09, 2400);
    }, true);

    // brick
    tex.brick = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#9c5040'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8b49a';
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 32 : 0;
        for (let x = -64; x < w + 64; x += 64) g.fillRect(x + off + 2, row * 32 + 2, 60, 28);
      }
      noise(g, w, h, 0.08, 700);
    });

    // bowling lane wood
    tex.lane = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#d8ab63'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(140,85,30,.35)';
      for (let x = 0; x < w; x += 21) g.fillRect(x, 0, 2, h);
      noise(g, w, h, 0.05, 350);
    }, true);

    // dummy face
    tex.face = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#e8b98a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b2019';
      g.beginPath(); g.arc(44, 52, 8, 0, 7); g.fill();
      g.beginPath(); g.arc(84, 52, 8, 0, 7); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#2b2019'; g.lineCap = 'round';
      g.beginPath(); g.arc(64, 74, 22, 0.25, Math.PI - 0.25); g.stroke();
    });
  }

  // cached plain materials
  const cache = new Map();
  function mat(color, opts) {
    opts = opts || {};
    const key = color + '|' + (opts.roughness || .8) + '|' + (opts.metalness || 0) + '|' + (opts.map ? 'm' : '') + (opts.flat ? 'f' : '');
    if (!cache.has(key)) {
      const m = new THREE.MeshStandardMaterial({
        color, roughness: opts.roughness != null ? opts.roughness : 0.8,
        metalness: opts.metalness || 0,
        map: opts.map || null,
        flatShading: !!opts.flat,
      });
      cache.set(key, m);
    }
    return cache.get(key);
  }

  return { build, tex, mat, canvasTex };
})();
