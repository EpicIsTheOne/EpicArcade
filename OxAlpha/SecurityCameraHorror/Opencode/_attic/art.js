'use strict';
/* GRAYLINE — Night Shift :: procedural art (backdrops, silhouettes, FX) */
window.G = window.G || {};

G.Art = (() => {
  const BW = 1408, BH = 792;
  let backdrops = {}, noiseTiles = [], scanPat = null, vigCache = new Map();

  /* ================= helpers ================= */

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [p, c] of stops) g.addColorStop(p, c);
    return g;
  }

  function rgrad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [p, c] of stops) g.addColorStop(p, c);
    return g;
  }

  function tubeLight(ctx, x, y, len, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x - len / 2, y - 2, len, 5);
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillStyle = rgrad(ctx, x, y + 4, 4, len * 0.75,
      [[0, color], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.lineTo(x + len / 2 + len * 0.55, y + 340);
    ctx.lineTo(x - len / 2 - len * 0.55, y + 340);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function signPlate(ctx, x, y, w, h, txt, fg, bg) {
    ctx.save();
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = fg;
    ctx.font = `bold ${Math.floor(h * 0.52)}px "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  function bench(ctx, x, y, s, col) {
    ctx.save();
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 120 * s, 10 * s);
    ctx.fillRect(x, y - 26 * s, 120 * s, 8 * s);
    ctx.fillRect(x + 8 * s, y + 10 * s, 8 * s, 34 * s);
    ctx.fillRect(x + 104 * s, y + 10 * s, 8 * s, 34 * s);
    ctx.fillRect(x + 8 * s, y - 44 * s, 8 * s, 22 * s);
    ctx.fillRect(x + 104 * s, y - 44 * s, 8 * s, 22 * s);
    ctx.restore();
  }

  function pillar(ctx, x, topW, botW, top, bot, col, edgeCol) {
    ctx.fillStyle = grad(ctx, x - botW, top, x + botW, top, [[0, shade(col, -18)], [0.5, col], [1, shade(col, -30)]]);
    ctx.beginPath();
    ctx.moveTo(x - topW, top); ctx.lineTo(x + topW, top);
    ctx.lineTo(x + botW, bot); ctx.lineTo(x - botW, bot);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = edgeCol; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = G.clamp((n >> 16) + amt, 0, 255),
      g = G.clamp(((n >> 8) & 255) + amt, 0, 255),
      b = G.clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function grime(ctx, w, h, n, seedBase, alpha) {
    for (let i = 0; i < n; i++) {
      const s = G.hash(seedBase + i * 13.7);
      const x = G.hash(seedBase + i * 7.3) * w, y = G.hash(seedBase + i * 3.1) * h * 0.85;
      ctx.fillStyle = `rgba(0,0,0,${alpha * (0.3 + s * 0.7)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 20 + s * 90, 30 + s * 130, s * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ================= room backdrops ================= */

  function paintPlatform(ctx, w, h, opts) {
    // sky/track pit
    ctx.fillStyle = '#020304'; ctx.fillRect(0, 0, w, h);
    const floorY = h * 0.56;
    // track pit
    ctx.fillStyle = '#04060a'; ctx.fillRect(0, floorY + h * 0.06, w, h);
    ctx.fillStyle = grad(ctx, 0, floorY, 0, floorY + h * 0.08,
      [[0, opts.dark], [1, '#020308']]);
    ctx.fillRect(0, floorY, w, h * 0.07);
    // rails
    ctx.strokeStyle = 'rgba(150,170,190,0.28)'; ctx.lineWidth = 3;
    for (const ry of [floorY + h * 0.028, floorY + h * 0.046]) {
      ctx.beginPath(); ctx.moveTo(w * 0.06, ry + 6); ctx.lineTo(w * 0.94, ry - 4); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(90,110,130,0.16)';
    for (let i = 0; i < 14; i++) {
      const yy = floorY + h * 0.02 + i * (h * 0.006);
      ctx.beginPath(); ctx.moveTo(w * 0.1 + i * 6, yy); ctx.lineTo(w * 0.9 - i * 6, yy); ctx.stroke();
    }
    // platform slab
    ctx.fillStyle = grad(ctx, 0, floorY - h * 0.02, 0, h * 0.78,
      [[0, shade(opts.slab, 10)], [1, shade(opts.slab, -46)]]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.80); ctx.lineTo(0, floorY + h * 0.01);
    ctx.lineTo(w, floorY - h * 0.055); ctx.lineTo(w, h * 0.72);
    ctx.closePath(); ctx.fill();
    // tactile edge stripe
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = opts.edge; ctx.lineWidth = h * 0.011;
    ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.moveTo(0, floorY - h * 0.012); ctx.lineTo(w, floorY - h * 0.075); ctx.stroke();
    ctx.restore();
    // back wall
    ctx.fillStyle = grad(ctx, 0, 0, 0, floorY,
      [[0, shade(opts.wall, -34)], [0.75, opts.wall], [1, shade(opts.wall, -20)]]);
    ctx.fillRect(0, 0, w, floorY);
    // wall tiles
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, h * 0.30); ctx.lineTo(x, floorY - 4); ctx.stroke(); }
    for (let y = h * 0.30; y < floorY; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // ceiling
    ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, w, h * 0.16);
    ctx.fillStyle = grad(ctx, 0, h * 0.10, 0, h * 0.17, [[0, 'rgba(0,0,0,0)'], [1, shade(opts.wall, -50)]]);
    ctx.fillRect(0, h * 0.10, w, h * 0.075);
    // pillars
    for (const px of [w * 0.16, w * 0.42, w * 0.68, w * 0.9]) {
      const depth = 0.8 + G.hash(px) * 0.25;
      pillar(ctx, px, 34 * depth, 46 * depth, h * 0.15, floorY + 6, opts.pillar, 'rgba(0,0,0,0.35)');
    }
    // benches
    bench(ctx, w * 0.24, floorY + h * 0.055, 1.0, shade(opts.slab, -60));
    bench(ctx, w * 0.58, floorY + h * 0.028, 0.82, shade(opts.slab, -60));
    // sign
    signPlate(ctx, w * 0.38, h * 0.185, w * 0.24, h * 0.062,
      opts.sign, opts.signFg || opts.lightCol, 'rgba(8,10,14,0.92)');
    // props
    ctx.fillStyle = 'rgba(10,12,16,0.9)';
    ctx.fillRect(w * 0.79, floorY - h * 0.045, w * 0.045, h * 0.115); // bin
    if (opts.vending) {
      ctx.fillStyle = '#0a0f14';
      ctx.fillRect(w * 0.06, floorY - h * 0.19, w * 0.062, h * 0.21);
      ctx.fillStyle = 'rgba(120,220,190,0.20)';
      ctx.fillRect(w * 0.065, floorY - h * 0.175, w * 0.05, h * 0.10);
    }
    // lights (static base)
    for (const lx of [w * 0.2, w * 0.5, w * 0.8]) {
      tubeLight(ctx, lx, h * 0.145, w * 0.11, opts.lightCol, 0.75);
    }
    grime(ctx, w, h, 10, opts.seed, 0.10);
  }

  function paintConcourse(ctx, w, h) {
    ctx.fillStyle = '#030407'; ctx.fillRect(0, 0, w, h);
    const floorY = h * 0.52;
    // far wall
    ctx.fillStyle = grad(ctx, 0, 0, 0, floorY, [[0, '#101720'], [0.8, '#182230'], [1, '#131a26']]);
    ctx.fillRect(0, 0, w, floorY);
    // big station name
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#9fb8cc';
    ctx.font = `bold ${Math.floor(h * 0.09)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('GRAYLINE DEPOT', w / 2, h * 0.155);
    ctx.restore();
    // ticket windows
    for (let i = 0; i < 4; i++) {
      const tx = w * (0.09 + i * 0.16);
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(tx, h * 0.24, w * 0.115, h * 0.17);
      ctx.strokeStyle = 'rgba(160,180,200,0.25)'; ctx.lineWidth = 3;
      ctx.strokeRect(tx, h * 0.24, w * 0.115, h * 0.17);
      ctx.fillStyle = 'rgba(140,180,210,0.05)';
      ctx.beginPath();
      ctx.moveTo(tx, h * 0.41); ctx.lineTo(tx + w * 0.115, h * 0.24);
      ctx.lineTo(tx + w * 0.115, h * 0.41); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(190,210,230,0.35)';
      ctx.font = `${Math.floor(h * 0.023)}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('TICKETS', tx + w * 0.0575, h * 0.225);
    }
    // departure board
    ctx.fillStyle = '#05070a';
    ctx.fillRect(w * 0.62, h * 0.05, w * 0.31, h * 0.135);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.62, h * 0.05, w * 0.31, h * 0.135);
    const rows = ['03 SOUTHBOUND   DELAYED', '07 NORTHBOUND   CANCELLED', 'X MAINTENANCE   ---'];
    rows.forEach((r, i) => {
      ctx.fillStyle = `rgba(255,176,64,${i === 2 ? 0.28 : 0.62})`;
      ctx.font = `${Math.floor(h * 0.027)}px "Courier New", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(r, w * 0.635, h * 0.085 + i * h * 0.036);
    });
    // clock stuck at 3:07
    ctx.save();
    ctx.translate(w * 0.47, h * 0.115);
    ctx.fillStyle = '#0b0e13';
    ctx.beginPath(); ctx.arc(0, 0, h * 0.038, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(210,225,240,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(210,225,240,0.6)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-Math.PI / 2 + 0.37) * h * 0.02, Math.sin(-Math.PI / 2 + 0.37) * h * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-Math.PI / 2 + 3.77) * h * 0.028, Math.sin(-Math.PI / 2 + 3.77) * h * 0.028); ctx.stroke();
    ctx.restore();
    // floor
    ctx.fillStyle = grad(ctx, 0, floorY, 0, h, [[0, '#232c36'], [1, '#11161d']]);
    ctx.fillRect(0, floorY, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      ctx.beginPath();
      ctx.moveTo(w * (0.5 + (t - 0.5) * 0.25), floorY);
      ctx.lineTo(w * (t - 0.5) * 2.4 + w * 0.5, h);
      ctx.stroke();
    }
    for (const ly of [floorY + h * 0.06, floorY + h * 0.16]) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke();
    }
    // benches + bins + barrier
    bench(ctx, w * 0.13, floorY + h * 0.10, 1.15, '#1a212b');
    bench(ctx, w * 0.68, floorY + h * 0.075, 1.0, '#1a212b');
    // turnstiles row
    for (let i = 0; i < 3; i++) {
      const tx = w * (0.36 + i * 0.09);
      ctx.fillStyle = '#141a22';
      ctx.fillRect(tx, floorY + h * 0.012, w * 0.012, h * 0.075);
      ctx.fillRect(tx, floorY + h * 0.012, w * 0.05, h * 0.012);
    }
    for (const lx of [w * 0.25, w * 0.55, w * 0.85]) tubeLight(ctx, lx, h * 0.035, w * 0.09, '#cfe3ff', 0.6);
    grime(ctx, w, h, 12, 71.3, 0.09);
  }

  function paintTunnel(ctx, w, h, opts) {
    ctx.fillStyle = '#010203'; ctx.fillRect(0, 0, w, h);
    // converging bore
    const vx = w * opts.vx, vy = h * 0.44;
    ctx.fillStyle = grad(ctx, vx, vy - h * 0.3, vx, vy + h * 0.3,
      [[0, opts.tint], [0.5, '#05070c'], [1, opts.tint]]);
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(0, h * 0.10);
    ctx.quadraticCurveTo(w * 0.2, h * 0.02, vx, vy - h * 0.235);
    ctx.quadraticCurveTo(w * 0.98, h * 0.06, w, h * 0.16);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // tube ring shadows
    ctx.strokeStyle = 'rgba(90,110,140,0.07)';
    for (let i = 1; i <= 6; i++) {
      const t = i / 7, rw = G.lerp(w * 0.75, w * 0.09, t), rh = G.lerp(h * 0.62, h * 0.075, t);
      ctx.lineWidth = G.lerp(14, 3, t);
      ctx.beginPath();
      ctx.moveTo(vx - rw, vy + rh * 0.2);
      ctx.quadraticCurveTo(vx - rw * 0.7, vy - rh, vx, vy - rh * 0.86);
      ctx.quadraticCurveTo(vx + rw * 0.7, vy - rh, vx + rw, vy + rh * 0.2);
      ctx.stroke();
    }
    // cable arches
    ctx.strokeStyle = 'rgba(70,90,120,0.16)';
    for (let i = 1; i <= 4; i++) {
      const t = i / 5, rw = G.lerp(w * 0.66, w * 0.08, t), rh = G.lerp(h * 0.5, h * 0.06, t);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(vx - rw, vy + rh * 0.3);
      ctx.quadraticCurveTo(vx, vy - rh * 1.15, vx + rw, vy + rh * 0.3);
      ctx.stroke();
    }
    // floor ballast
    ctx.fillStyle = grad(ctx, 0, h * 0.6, 0, h, [[0, '#0a0d12'], [1, '#04050a']]);
    ctx.fillRect(0, h * 0.62, w, h);
    // rails
    for (const off of [-w * 0.055, w * 0.055]) {
      ctx.strokeStyle = 'rgba(160,180,205,0.30)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(vx + off * 0.14, vy + h * 0.045);
      ctx.lineTo(vx + off * 3.4, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,140,165,0.12)';
    for (let i = 0; i < 9; i++) {
      const t = i / 9, y = G.lerp(vy + h * 0.05, h * 0.99, t * t);
      const spread = G.lerp(0.2, 1.0, t);
      ctx.lineWidth = G.lerp(1.5, 5, t);
      ctx.beginPath();
      ctx.moveTo(vx - w * 0.05 * spread * 3, y); ctx.lineTo(vx + w * 0.05 * spread * 3, y);
      ctx.stroke();
    }
    // service light string receding
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const lx = G.lerp(w * 0.16, vx, Math.pow(t, 0.8));
      const ly = G.lerp(h * 0.30, vy + h * 0.01, Math.pow(t, 0.8));
      ctx.fillStyle = `rgba(255,${opts.warm ? 200 : 225},${opts.warm ? 130 : 170},${0.5 - t * 0.32})`;
      ctx.beginPath(); ctx.arc(lx, ly, G.lerp(7, 2.2, t), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgrad(ctx, lx, ly, 1, G.lerp(46, 12, t), [[0, `rgba(255,214,150,${0.14 - t * 0.1})`], [1, 'rgba(0,0,0,0)']]);
      ctx.beginPath(); ctx.arc(lx, ly, G.lerp(46, 12, t), 0, Math.PI * 2); ctx.fill();
    }
    // signal head near
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(w * opts.sigX - 14, h * 0.34, 28, 84);
    ctx.fillStyle = 'rgba(255,60,60,0.85)';
    ctx.beginPath(); ctx.arc(w * opts.sigX, h * 0.365, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgrad(ctx, w * opts.sigX, h * 0.365, 2, 30, [[0, 'rgba(255,40,40,0.30)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(w * opts.sigX, h * 0.365, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,60,45,0.6)';
    ctx.beginPath(); ctx.arc(w * opts.sigX, h * 0.405, 7, 0, Math.PI * 2); ctx.fill();
    // wall pipes / niche
    ctx.strokeStyle = 'rgba(100,120,150,0.14)'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(w * 0.93, h * 0.30); ctx.lineTo(w * 0.995, h * 0.52); ctx.stroke();
    if (opts.niche) {
      ctx.fillStyle = '#020305';
      ctx.fillRect(w * 0.055, h * 0.40, w * 0.075, h * 0.24);
      ctx.strokeStyle = 'rgba(120,140,170,0.12)';
      ctx.strokeRect(w * 0.055, h * 0.40, w * 0.075, h * 0.24);
      // ladder rungs
      ctx.strokeStyle = 'rgba(140,160,185,0.20)'; ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.062, h * 0.43 + i * h * 0.036);
        ctx.lineTo(w * 0.122, h * 0.43 + i * h * 0.036);
        ctx.stroke();
      }
    }
    grime(ctx, w, h, 8, opts.seed, 0.14);
  }

  function paintCorridor(ctx, w, h) {
    ctx.fillStyle = '#030406'; ctx.fillRect(0, 0, w, h);
    const vx = w * 0.5, vy = h * 0.47;
    // walls converge
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#171d26'], [1, '#0c1117']]);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(vx - w * 0.075, vy - h * 0.20);
    ctx.lineTo(vx - w * 0.075, vy + h * 0.16); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = grad(ctx, w, 0, w * 0.6, h, [[0, '#151b23'], [1, '#0b0f15']]);
    ctx.beginPath();
    ctx.moveTo(w, 0); ctx.lineTo(vx + w * 0.075, vy - h * 0.20);
    ctx.lineTo(vx + w * 0.075, vy + h * 0.16); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // end wall dark
    ctx.fillStyle = '#05070a';
    ctx.fillRect(vx - w * 0.075, vy - h * 0.20, w * 0.15, h * 0.36);
    // pipes overhead
    ctx.strokeStyle = 'rgba(105,125,155,0.30)';
    for (const [py, lw] of [[h * 0.16, 10], [h * 0.205, 6], [h * 0.245, 14]]) {
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py * 0.96); ctx.stroke();
    }
    // pipe brackets
    ctx.fillStyle = 'rgba(60,75,95,0.4)';
    for (const bx of [w * 0.12, w * 0.38, w * 0.63, w * 0.88]) ctx.fillRect(bx, h * 0.145, 8, h * 0.115);
    // floor sheen
    ctx.fillStyle = grad(ctx, 0, vy + h * 0.16, 0, h, [[0, '#12161d'], [1, '#080b10']]);
    ctx.beginPath();
    ctx.moveTo(vx - w * 0.075, vy + h * 0.16); ctx.lineTo(vx + w * 0.075, vy + h * 0.16);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,175,205,0.05)';
    ctx.beginPath();
    ctx.ellipse(vx, h * 0.86, w * 0.16, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // side door frames
    for (const s of [-1, 1]) {
      const dx = vx + s * w * 0.245;
      ctx.fillStyle = '#07090d';
      ctx.fillRect(dx - w * 0.045, vy - h * 0.13, w * 0.09, h * 0.33);
      ctx.strokeStyle = 'rgba(140,160,190,0.18)'; ctx.lineWidth = 3;
      ctx.strokeRect(dx - w * 0.045, vy - h * 0.13, w * 0.09, h * 0.33);
    }
    // wall stains
    for (let i = 0; i < 7; i++) {
      const sx = G.hash(i * 31.7) > 0.5 ? w * G.hash(i * 9.1) : w * (1 - G.hash(i * 9.1));
      ctx.fillStyle = 'rgba(5,8,10,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx, h * (0.3 + G.hash(i * 17.3) * 0.4), 14 + G.hash(i) * 26, 40 + G.hash(i * 3) * 90, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // caged bulb
    ctx.strokeStyle = 'rgba(150,165,185,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(vx, h * 0.02); ctx.lineTo(vx, h * 0.115); ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,150,0.9)';
    ctx.beginPath(); ctx.arc(vx, h * 0.125, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgrad(ctx, vx, h * 0.125, 4, h * 0.34, [[0, 'rgba(255,208,140,0.20)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(vx, h * 0.125, h * 0.34, 0, Math.PI * 2); ctx.fill();
    grime(ctx, w, h, 6, 44.2, 0.12);
  }

  function paintStorage(ctx, w, h) {
    ctx.fillStyle = '#030405'; ctx.fillRect(0, 0, w, h);
    const floorY = h * 0.66;
    // back wall
    ctx.fillStyle = grad(ctx, 0, 0, 0, floorY, [[0, '#0d1218'], [1, '#161d26']]);
    ctx.fillRect(0, 0, w, floorY);
    // floor
    ctx.fillStyle = grad(ctx, 0, floorY, 0, h, [[0, '#181f28'], [1, '#0b0f14']]);
    ctx.fillRect(0, floorY, w, h);
    // shelves left/right
    for (const s of [-1, 1]) {
      const sx = s < 0 ? w * 0.02 : w * 0.74;
      for (let lvl = 0; lvl < 4; lvl++) {
        const sy = floorY - lvl * h * 0.155;
        ctx.fillStyle = '#202832';
        ctx.fillRect(sx, sy, w * 0.24, 10);
        ctx.fillStyle = '#12161d';
        ctx.fillRect(sx + w * 0.235 * (s < 0 ? 1 : 0), sy, 8, -h * 0.155);
        // boxes
        for (let b = 0; b < 5; b++) {
          const bw = w * (0.028 + G.hash(lvl * 7 + b + (s > 0 ? 40 : 0)) * 0.022);
          const bh = h * (0.05 + G.hash(lvl * 13 + b * 3 + (s > 0 ? 40 : 0)) * 0.06);
          const bx = sx + w * 0.012 + b * w * 0.046 + G.hash(b + lvl) * 8;
          if (bx + bw > sx + w * 0.235) continue;
          ctx.fillStyle = `rgb(${34 + G.hash(b + lvl * 2) * 22 | 0},${30 + G.hash(b * 2 + lvl) * 16 | 0},${24 + G.hash(b * 3) * 12 | 0})`;
          ctx.fillRect(bx, sy - bh, bw, bh);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(bx, sy - bh, bw, bh);
          ctx.fillStyle = 'rgba(210,190,150,0.14)';
          ctx.fillRect(bx + bw * 0.2, sy - bh * 0.55, bw * 0.6, 2);
        }
      }
    }
    // plastic sheet curtain center-right
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 7; i++) {
      const px = w * 0.42 + i * w * 0.028;
      ctx.fillStyle = 'rgba(160,180,195,0.16)';
      ctx.beginPath();
      ctx.moveTo(px, h * 0.10);
      ctx.quadraticCurveTo(px + 14, h * 0.5, px + 4 + G.hash(i) * 18, h * 0.88);
      ctx.lineTo(px + w * 0.02, h * 0.88);
      ctx.quadraticCurveTo(px + w * 0.02, h * 0.5, px + w * 0.024, h * 0.10);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // crates foreground
    ctx.fillStyle = '#10141b';
    ctx.fillRect(0, h * 0.86, w * 0.2, h * 0.14);
    ctx.fillRect(w * 0.83, h * 0.82, w * 0.17, h * 0.18);
    // hanging bulb
    ctx.strokeStyle = 'rgba(150,165,185,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.36, 0); ctx.lineTo(w * 0.36, h * 0.14); ctx.stroke();
    ctx.fillStyle = 'rgba(255,222,168,0.95)';
    ctx.beginPath(); ctx.arc(w * 0.36, h * 0.152, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgrad(ctx, w * 0.36, h * 0.152, 4, h * 0.4, [[0, 'rgba(255,216,156,0.16)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(w * 0.36, h * 0.152, h * 0.4, 0, Math.PI * 2); ctx.fill();
    grime(ctx, w, h, 9, 88.9, 0.13);
  }

  /* ================= silhouettes ================= */

  function drawConductor(ctx, x, footY, hgt, opt = {}) {
    const u = hgt / 100;
    ctx.save();
    ctx.translate(x, footY);
    if (opt.flip) ctx.scale(-1, 1);
    // lantern glow behind
    if (opt.lantern !== false) {
      const fl = 0.75 + G.hash(Math.floor(performance.now() / 90)) * 0.25;
      ctx.fillStyle = rgrad(ctx, 26 * u, -46 * u, 2, 60 * u,
        [[0, `rgba(255,196,120,${0.22 * fl})`], [1, 'rgba(0,0,0,0)']]);
      ctx.beginPath(); ctx.arc(26 * u, -46 * u, 60 * u, 0, Math.PI * 2); ctx.fill();
    }
    // body
    ctx.fillStyle = '#07090d';
    ctx.beginPath();
    ctx.moveTo(-13 * u, 0);
    ctx.quadraticCurveTo(-17 * u, -40 * u, -20 * u, -66 * u);
    ctx.quadraticCurveTo(-22 * u, -80 * u, -12 * u, -84 * u);
    ctx.lineTo(12 * u, -84 * u);
    ctx.quadraticCurveTo(22 * u, -80 * u, 20 * u, -66 * u);
    ctx.quadraticCurveTo(17 * u, -40 * u, 13 * u, 0);
    ctx.closePath(); ctx.fill();
    // rim light
    ctx.strokeStyle = 'rgba(150,180,215,0.13)';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(-13 * u, 0);
    ctx.quadraticCurveTo(-17 * u, -40 * u, -20 * u, -66 * u);
    ctx.quadraticCurveTo(-22 * u, -80 * u, -12 * u, -84 * u);
    ctx.stroke();
    // head
    ctx.fillStyle = '#080a0e';
    ctx.beginPath(); ctx.ellipse(0, -91 * u, 8.5 * u, 10 * u, 0, 0, Math.PI * 2); ctx.fill();
    // cap
    ctx.fillStyle = '#05070a';
    ctx.beginPath();
    ctx.ellipse(0, -97 * u, 10 * u, 6 * u, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-14 * u, -98 * u, 26 * u, 3 * u);
    // eyes
    const eg = 0.65 + G.hash(Math.floor(performance.now() / 300)) * 0.35;
    ctx.fillStyle = `rgba(225,235,255,${eg})`;
    ctx.shadowColor = 'rgba(200,220,255,0.9)';
    ctx.shadowBlur = 7 * u;
    ctx.beginPath(); ctx.arc(-3.6 * u, -91 * u, 1.5 * u, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.6 * u, -91 * u, 1.5 * u, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // arm + lantern
    if (opt.lantern !== false) {
      ctx.strokeStyle = '#07090d'; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(14 * u, -72 * u); ctx.lineTo(26 * u, -52 * u); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,180,215,0.10)'; ctx.lineWidth = 1 * u;
      ctx.beginPath(); ctx.moveTo(14 * u, -72 * u); ctx.lineTo(26 * u, -52 * u); ctx.stroke();
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(21 * u, -54 * u, 10 * u, 13 * u);
      ctx.fillStyle = `rgba(255,206,130,${0.55 + fl * 0.35})`;
      ctx.shadowColor = 'rgba(255,190,110,0.95)'; ctx.shadowBlur = 10 * u;
      ctx.beginPath(); ctx.arc(26 * u, -47.5 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawWick(ctx, x, footY, hgt, opt = {}) {
    const u = hgt / 100;
    ctx.save();
    ctx.translate(x, footY);
    if (opt.flip) ctx.scale(-1, 1);
    const sway = Math.sin(performance.now() / 700 + x) * 2 * u;
    // cold aura
    ctx.fillStyle = rgrad(ctx, 0, -30 * u, 4, 70 * u,
      [[0, 'rgba(190,235,215,0.10)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(0, -30 * u, 70 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#080a0c';
    ctx.strokeStyle = 'rgba(170,220,200,0.12)';
    ctx.lineWidth = 1.2 * u;
    // arched spine body
    ctx.beginPath();
    ctx.moveTo(-34 * u, 0);
    ctx.quadraticCurveTo(-30 * u + sway, -26 * u, -6 * u, -34 * u);
    ctx.quadraticCurveTo(16 * u, -40 * u, 22 * u, -26 * u);
    ctx.quadraticCurveTo(26 * u, -12 * u, 20 * u, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // rear leg
    ctx.lineWidth = 4 * u; ctx.lineCap = 'round';
    ctx.strokeStyle = '#080a0c';
    ctx.beginPath(); ctx.moveTo(-26 * u, -8 * u); ctx.lineTo(-40 * u, 0); ctx.stroke();
    // front arms reaching
    ctx.beginPath(); ctx.moveTo(14 * u, -28 * u); ctx.lineTo(30 * u, -10 * u); ctx.lineTo(34 * u, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8 * u, -30 * u); ctx.lineTo(20 * u, -8 * u); ctx.stroke();
    // head raised & tilted
    ctx.save();
    ctx.translate(24 * u, -34 * u);
    ctx.rotate(0.5);
    ctx.fillStyle = '#090b0e';
    ctx.beginPath(); ctx.ellipse(0, -6 * u, 7 * u, 10 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(170,220,200,0.14)'; ctx.lineWidth = 1 * u; ctx.stroke();
    // hair strands
    ctx.strokeStyle = 'rgba(10,13,16,0.95)'; ctx.lineWidth = 1.6 * u;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 2.4 * u, -13 * u);
      ctx.quadraticCurveTo(i * 3.4 * u, 2 * u, i * 4.2 * u + sway, 12 * u);
      ctx.stroke();
    }
    // eyes pale yellow
    const eg = 0.6 + G.hash(Math.floor(performance.now() / 260)) * 0.4;
    ctx.fillStyle = `rgba(235,240,190,${eg})`;
    ctx.shadowColor = 'rgba(230,240,170,0.9)'; ctx.shadowBlur = 6 * u;
    ctx.beginPath(); ctx.arc(-2.6 * u, -7 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2.8 * u, -6.4 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.restore();
  }

  function drawGirl(ctx, cx, cy, s, seed) {
    ctx.save();
    ctx.translate(cx + (G.hash(seed) - 0.5) * 14 * s, cy + (G.hash(seed + 9) - 0.5) * 10 * s);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(205,215,225,0.34)';
    // head
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // shoulders
    ctx.beginPath();
    ctx.moveTo(-46, 76);
    ctx.quadraticCurveTo(-40, 30, -18, 26);
    ctx.lineTo(18, 26);
    ctx.quadraticCurveTo(40, 30, 46, 76);
    ctx.closePath(); ctx.fill();
    // hair curtains
    ctx.fillStyle = 'rgba(120,130,145,0.30)';
    ctx.beginPath(); ctx.ellipse(-24, 14, 12, 40, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, 14, 12, 40, -0.12, 0, Math.PI * 2); ctx.fill();
    // sockets
    ctx.fillStyle = 'rgba(5,6,9,0.95)';
    ctx.beginPath(); ctx.ellipse(-10, -4, 6.5, 10, 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -4, 6.5, 10, -0.08, 0, Math.PI * 2); ctx.fill();
    // mouth
    ctx.beginPath(); ctx.ellipse(0, 16, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ================= jumpscares ================= */

  function easeOut(t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }

  function faceConductor(ctx, W, H, p, side) {
    const e = easeOut(p * 1.35);
    const S = G.lerp(0.45, 1.75, e) * H / 480;
    const cx = W / 2 + (side === 'L' ? -W * 0.06 : W * 0.06) * (1 - e * 0.6);
    const cy = H * G.lerp(0.78, 0.52, e);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(S, S);
    // neck/shoulders
    ctx.fillStyle = '#11151b';
    ctx.fillRect(-90, 150, 180, 260);
    ctx.fillStyle = '#39424e';
    ctx.beginPath(); ctx.ellipse(0, 0, 118, 158, 0, 0, Math.PI * 2); ctx.fill();
    // gaunt shading
    ctx.fillStyle = 'rgba(10,13,18,0.55)';
    ctx.beginPath(); ctx.ellipse(-70, 30, 34, 84, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(70, 30, 34, 84, -0.2, 0, Math.PI * 2); ctx.fill();
    // cap shadow
    ctx.fillStyle = 'rgba(6,8,11,0.92)';
    ctx.beginPath(); ctx.ellipse(0, -108, 128, 62, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-134, -112, 268, 16);
    // eyes hollow
    ctx.fillStyle = '#04050a';
    ctx.beginPath(); ctx.ellipse(-44, -26, 26, 34, 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(44, -26, 26, 34, -0.06, 0, Math.PI * 2); ctx.fill();
    const pr = G.lerp(5, 1.4, e);
    ctx.fillStyle = '#dfe9ff';
    ctx.shadowColor = '#cfe0ff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(-44, -24, pr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(44, -24, pr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // nose shadow
    ctx.fillStyle = 'rgba(8,10,14,0.6)';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-12, 34); ctx.lineTo(12, 34); ctx.closePath(); ctx.fill();
    // mouth gaping
    const mw = G.lerp(30, 62, e), mh = G.lerp(10, 74, e);
    ctx.fillStyle = '#030407';
    ctx.beginPath(); ctx.ellipse(0, 84, mw, mh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,200,210,0.75)';
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(i * 15 - 4, 84 - mh * 0.82, 8, 12);
    }
    ctx.restore();
  }

  function faceWick(ctx, W, H, p, side) {
    const e = easeOut(p * 1.3);
    const S = G.lerp(0.5, 1.9, e) * H / 520;
    const cx = W / 2, cy = G.lerp(-H * 0.1, H * 0.5, e);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(S, S);
    // hair curtain behind
    ctx.fillStyle = '#05070a';
    ctx.beginPath(); ctx.ellipse(0, 30, 150, 220, 0, 0, Math.PI * 2); ctx.fill();
    // long neck
    ctx.fillStyle = '#b9c4ae';
    ctx.fillRect(-26, 90, 52, 300);
    // face pale
    ctx.fillStyle = '#ccd6bd';
    ctx.beginPath(); ctx.ellipse(0, 0, 96, 138, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(90,110,95,0.30)';
    ctx.beginPath(); ctx.ellipse(0, 60, 60, 46, 0, 0, Math.PI * 2); ctx.fill();
    // eyes: big black, dripping
    for (const ex of [-38, 38]) {
      ctx.fillStyle = '#05070a';
      ctx.beginPath(); ctx.ellipse(ex, -26, 20, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(6,9,12,0.85)';
      ctx.beginPath();
      ctx.moveTo(ex - 10, -8);
      ctx.quadraticCurveTo(ex - 4 + Math.sin(e * 9) * 3, 60, ex + 2, 96);
      ctx.lineTo(ex + 10, -6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(240,245,220,0.85)';
      ctx.beginPath(); ctx.arc(ex, -28, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // too-wide smile
    ctx.strokeStyle = '#05070a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-58, 44);
    ctx.quadraticCurveTo(0, 44 + 46 * e, 58, 40);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,215,195,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-58, 44);
    ctx.quadraticCurveTo(0, 44 + 46 * e, 58, 40);
    ctx.stroke();
    // hair front strands
    ctx.strokeStyle = '#070a0d'; ctx.lineWidth = 9;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 20, -120);
      ctx.quadraticCurveTo(i * 26, -60, i * 30, -10 - Math.abs(i) * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function faceGirl(ctx, W, H, p) {
    const e = easeOut(p * 1.2);
    const S = G.lerp(0.6, 2.1, e) * H / 500;
    ctx.save();
    ctx.translate(W / 2 + (G.hash(p * 60) - 0.5) * 26, H * 0.52 + (G.hash(p * 47) - 0.5) * 20);
    ctx.scale(S, S);
    ctx.globalAlpha = 0.55 + e * 0.45;
    ctx.fillStyle = 'rgba(210,218,228,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 0, 100, 140, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-150, 240); ctx.quadraticCurveTo(-120, 90, -40, 80);
    ctx.lineTo(40, 80); ctx.quadraticCurveTo(120, 90, 150, 240);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(8,9,13,0.96)';
    ctx.beginPath(); ctx.ellipse(-36, -20, 26, 38, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(36, -20, 26, 38, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 62, 18, 30 + 20 * e, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // glitch bands over face zone
    for (let i = 0; i < 6; i++) {
      const gy = G.hash(i * 3.3 + Math.floor(p * 40)) * H;
      const gh = 4 + G.hash(i * 7.1) * 26;
      const off = (G.hash(i * 11.7 + Math.floor(p * 55)) - 0.5) * 90;
      ctx.drawImage(ctx.canvas, 0, gy, W, gh, off, gy, W, gh);
    }
  }

  /* ================= post FX ================= */

  function initFX() {
    for (let n = 0; n < 3; n++) {
      const c = mkCanvas(256, 256);
      const id = c.getContext('2d').createImageData(256, 256);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.random() * 255 | 0;
        id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v;
        id.data[i + 3] = Math.random() * 255 | 0;
      }
      c.getContext('2d').putImageData(id, 0, 0);
      noiseTiles.push(c);
    }
    const sp = mkCanvas(4, 3);
    const spx = sp.getContext('2d');
    spx.fillStyle = 'rgba(0,0,0,0.30)';
    spx.fillRect(0, 2, 4, 1);
    scanPat = mkCanvas(4, 3);
    scanPat.getContext('2d').drawImage(sp, 0, 0);
  }

  function drawNoise(ctx, w, h, t, intensity) {
    if (intensity <= 0.002) return;
    const tile = noiseTiles[Math.floor(t * 26 + G.hash(Math.floor(t * 60)) * 3) % 3];
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, intensity);
    const ox = -G.hash(Math.floor(t * 61)) * 256, oy = -G.hash(Math.floor(t * 47)) * 256;
    for (let x = ox; x < w; x += 256) for (let y = oy; y < h; y += 256) ctx.drawImage(tile, x, y);
    ctx.restore();
  }

  function drawScanlines(ctx, w, h) {
    ctx.save();
    const pat = ctx.createPattern(scanPat, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function vignette(ctx, w, h, strength) {
    let v = vigCache.get(w + 'x' + h);
    if (!v) {
      v = mkCanvas(w, h);
      const vc = v.getContext('2d');
      vc.fillStyle = rgrad(vc, w / 2, h / 2, Math.min(w, h) * 0.36, Math.max(w, h) * 0.72,
        [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.62)']]);
      vc.fillRect(0, 0, w, h);
      vigCache.set(w + 'x' + h, v);
    }
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.drawImage(v, 0, 0, w, h);
    ctx.restore();
  }

  function rollingBand(ctx, w, h, t) {
    const y = ((t * 46) % (h + 160)) - 80;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad(ctx, 0, y, 0, y + 90, [[0, 'rgba(180,220,255,0)'], [0.5, 'rgba(180,220,255,0.028)'], [1, 'rgba(180,220,255,0)']]);
    ctx.fillRect(0, y, w, 90);
    ctx.restore();
  }

  function tearBands(ctx, w, h, t, amount) {
    const n = Math.floor(amount * 5);
    for (let i = 0; i < n; i++) {
      const s = G.hash(Math.floor(t * 33) + i * 7.7);
      if (s > 0.55) continue;
      const y = s * h, bh = 3 + G.hash(i + t) * 22;
      const off = (G.hash(i * 3.1 + Math.floor(t * 29)) - 0.5) * 120 * amount;
      ctx.drawImage(ctx.canvas, 0, y, w, bh, off, y, w, bh);
    }
  }

  /* ================= init ================= */

  function init() {
    const defs = {
      platA: c => paintPlatform(c, BW, BH, {
        sign: 'PLATFORM A', wall: '#17222b', slab: '#3a4653', edge: '#d9a832',
        pillar: '#202b34', lightCol: '#bfe9ff', dark: '#071018', seed: 12.7
      }),
      platB: c => paintPlatform(c, BW, BH, {
        sign: 'PLATFORM B', wall: '#241d14', slab: '#4a4033', edge: '#d9a832',
        pillar: '#2c241a', lightCol: '#ffd28a', dark: '#120d06', seed: 55.1,
        vending: true
      }),
      concourse: c => paintConcourse(c, BW, BH),
      tunnelN: c => paintTunnel(c, BW, BH, { vx: 0.42, tint: '#0a1420', sigX: 0.87, warm: true, seed: 3.3 }),
      tunnelS: c => paintTunnel(c, BW, BH, { vx: 0.60, tint: '#0a1a14', sigX: 0.12, warm: false, niche: true, seed: 9.9 }),
      corridor: c => paintCorridor(c, BW, BH),
      storage: c => paintStorage(c, BW, BH)
    };
    for (const k in defs) {
      const c = mkCanvas(BW, BH);
      defs[k](c.getContext('2d'));
      backdrops[k] = c;
    }
    initFX();
  }

  function backdrop(room) { return backdrops[room]; }

  return {
    init, backdrop, BW, BH,
    drawNoise, drawScanlines, vignette, rollingBand, tearBands,
    drawConductor, drawWick, drawGirl,
    faceConductor, faceWick, faceGirl,
    mkCanvas, rgrad, grad, shade, tubeLight
  };
})();
