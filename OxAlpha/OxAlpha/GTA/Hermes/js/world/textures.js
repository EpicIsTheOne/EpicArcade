// ============================================================
// NEON MERIDIAN — world/textures.js
// Procedural CanvasTexture library. All original art, generated
// at boot. Shared by materials; repeat-wrapped tiles.
// ============================================================
'use strict';

const TexLib = (() => {
  const cache = {};

  function cv(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return [c, c.getContext('2d')];
  }

  function finish(canvas, repX, repY, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX || 1, repY || 1);
    t.anisotropy = 4;
    if (srgb !== false && THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function noise(ctx, size, alpha, lo, hi) {
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = lo + Math.random() * (hi - lo);
      d[i] = clamp(d[i] * n, 0, 255);
      d[i + 1] = clamp(d[i + 1] * n, 0, 255);
      d[i + 2] = clamp(d[i + 2] * n, 0, 255);
      if (alpha !== undefined) d[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  }

  const T = {};

  T.asphalt = function () {
    const S = 256; const [c, x] = cv(S);
    x.fillStyle = '#43464c'; x.fillRect(0, 0, S, S);
    noise(x, S, undefined, 0.82, 1.12);
    // faint tire wear bands
    x.fillStyle = 'rgba(255,255,255,0.03)';
    x.fillRect(S * 0.22, 0, S * 0.08, S); x.fillRect(S * 0.70, 0, S * 0.08, S);
    return finish(c, 1, 1);
  };

  T.sidewalk = function () {
    const S = 128; const [c, x] = cv(S);
    x.fillStyle = '#8f9094'; x.fillRect(0, 0, S, S);
    noise(x, S, undefined, 0.85, 1.05);
    x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 2;
    for (let i = 0; i <= S; i += S / 4) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
    }
    return finish(c, 1, 1);
  };

  T.grass = function () {
    const S = 128; const [c, x] = cv(S);
    x.fillStyle = '#4a7038'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${30 + Math.random() * 50 | 0},${90 + Math.random() * 60 | 0},${30 + Math.random() * 40 | 0},0.5)`;
      x.fillRect(Math.random() * S, Math.random() * S, 2, 3);
    }
    return finish(c, 1, 1);
  };

  T.sand = function () {
    const S = 128; const [c, x] = cv(S);
    x.fillStyle = '#cdb98c'; x.fillRect(0, 0, S, S);
    noise(x, S, undefined, 0.88, 1.08);
    return finish(c, 1, 1);
  };

  // Facade generator: window pattern baked; separate emissive map with
  // randomly lit windows for nighttime glow.
  function facade(opts) {
    const S = 256;
    const cols = opts.cols, rows = opts.rows;
    const winW = S / cols, winH = S / rows;

    const [bc, bx] = cv(S);
    bx.fillStyle = opts.wall; bx.fillRect(0, 0, S, S);
    noise(bx, S, undefined, 0.82, 1.06);
    if (opts.brickLines) {
      bx.strokeStyle = 'rgba(0,0,0,0.18)'; bx.lineWidth = 1;
      for (let y = 0; y < S; y += 8) { bx.beginPath(); bx.moveTo(0, y); bx.lineTo(S, y); bx.stroke(); }
      for (let y = 0; y < S; y += 16) {
        for (let xx = ((y / 16) % 2) * 8; xx < S; xx += 16) {
          bx.beginPath(); bx.moveTo(xx, y); bx.lineTo(xx, y + 8); bx.stroke();
        }
      }
    }
    // windows: dark glass with slight vertical gradient
    const [ec, ex] = cv(S); // emissive map (lit windows at night)
    ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
    const litRand = mulberry32(opts.seed || 1);

    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const wx = cIdx * winW + winW * 0.18, wy = r * winH + winH * 0.20;
        const ww = winW * 0.64, wh = winH * 0.58;
        const g = bx.createLinearGradient(wx, wy, wx, wy + wh);
        g.addColorStop(0, opts.glassTop); g.addColorStop(1, opts.glassBot);
        bx.fillStyle = g; bx.fillRect(wx, wy, ww, wh);
        bx.strokeStyle = 'rgba(0,0,0,0.45)'; bx.lineWidth = 1.5;
        bx.strokeRect(wx, wy, ww, wh);
        // night lighting: ~38% windows lit, warm or cool
        if (litRand() < opts.litP) {
          const warm = litRand() < 0.72;
          if (warm) ex.fillStyle = `rgba(255,${170 + litRand() * 60 | 0},90,${0.55 + litRand() * 0.45})`;
          else ex.fillStyle = `rgba(${150 + litRand() * 60 | 0},200,255,${0.45 + litRand() * 0.4})`;
          ex.fillRect(wx, wy, ww, wh);
        }
      }
    }
    return { map: finish(bc, 1, 1), emissive: finish(ec, 1, 1, false) };
  }
  T.facade = facade;

  // Prebuilt variants (lazy — need DOM canvas)
  T.facades = function () {
    if (cache.facades) return cache.facades;
    cache.facades = [
      Object.assign(facade({ wall: '#7f8794', glassTop: '#9fc4e8', glassBot: '#31465c', cols: 8, rows: 10, litP: 0.40, seed: 11 }), { id: 'glassBlue' }),
      Object.assign(facade({ wall: '#63666e', glassTop: '#b7d2ea', glassBot: '#27384a', cols: 6, rows: 12, litP: 0.34, seed: 23 }), { id: 'glassDark' }),
      Object.assign(facade({ wall: '#9c8974', glassTop: '#cfe0ee', glassBot: '#4a3d2e', cols: 5, rows: 7, litP: 0.42, seed: 37, brickLines: true }), { id: 'brickWarm' }),
      Object.assign(facade({ wall: '#8a8d84', glassTop: '#bcd4e4', glassBot: '#3a4442', cols: 4, rows: 6, litP: 0.46, seed: 51 }), { id: 'concreteGreen' }),
      Object.assign(facade({ wall: '#b3a48e', glassTop: '#e8dcbf', glassBot: '#574a35', cols: 4, rows: 5, litP: 0.5, seed: 67, brickLines: true }), { id: 'stuccoSand' }),
    ];
    return cache.facades;
  };

  T.headlight = function () {
    const S = 64; const [c, x] = cv(S);
    const g = x.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.4, 'rgba(255,240,190,0.55)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  };

  T.rainStreak = function () {
    const S = 64; const [c, x] = cv(S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(190,210,255,0)');
    g.addColorStop(0.5, 'rgba(190,210,255,0.9)');
    g.addColorStop(1, 'rgba(190,210,255,0)');
    x.fillStyle = g;
    x.fillRect(S * 0.42, 0, S * 0.16, S);
    return new THREE.CanvasTexture(c);
  };

  return T;
})();
