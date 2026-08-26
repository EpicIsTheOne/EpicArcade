/* ORION RUN — ship map data, geometry, and rendering (interior + local space) */
'use strict';
(function () {
  const { clamp, lerp } = OR.util;

  /* ---- shared map (KEEP IN SYNC with server.mjs) ---- */
  const TILE = 32;
  const MAPW = 36, MAPH = 20;
  const ROOMS = [
    { id: 'bridge',  name: 'Bridge',       r: [27, 7, 33, 12], hue: 205 },
    { id: 'weapons', name: 'Weapon Bay',   r: [21, 2, 26, 6],  hue: 0 },
    { id: 'shields', name: 'Shield Bay',   r: [21, 13, 26, 17], hue: 190 },
    { id: 'eng',     name: 'Engineering',  r: [3, 7, 10, 12],  hue: 35 },
    { id: 'eroom',   name: 'Engine Room',  r: [3, 14, 10, 17], hue: 20 },
    { id: 'life',    name: 'Life Support', r: [14, 13, 19, 17], hue: 130 },
    { id: 'med',     name: 'Medbay',       r: [13, 2, 17, 6],  hue: 320 },
  ];
  const HALLS = [
    [10, 9, 27, 10], [14, 6, 15, 8], [22, 6, 23, 8],
    [22, 11, 23, 12], [15, 11, 16, 12], [7, 11, 8, 13],
  ];
  const CONSOLES = {
    helm:    { x: 32.5, y: 9.5, label: 'Helm' },
    weapons: { x: 22.5, y: 3.5, label: 'Weapons' },
    shields: { x: 25.5, y: 15.5, label: 'Shields' },
    power:   { x: 4.5, y: 8.5, label: 'Power Grid' },
  };
  const NODES = {
    engines: { x: 6.5, y: 15.5, sys: 'engines' },
    shields: { x: 24.5, y: 16.5, sys: 'shields' },
    weapons: { x: 24.5, y: 3.5, sys: 'weapons' },
    life:    { x: 17.5, y: 15.5, sys: 'life' },
    aux:     { x: 12.0, y: 9.5, sys: 'aux' },
    reactor: { x: 6.5, y: 10.5, sys: 'reactor' },
  };
  const MEDBEDS = [[14, 3], [16, 3]];
  const CX = MAPW / 2 * TILE, CY = MAPH / 2 * TILE; // ship center in tile-space px

  const WALK = new Set();
  const contains = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
    if (ROOMS.some(rm => contains(rm.r, x, y)) || HALLS.some(h => contains(h, x, y))) WALK.add(y * MAPW + x);
  }
  function walkablePx(px, py) {
    return WALK.has(Math.floor(py / TILE) * MAPW + Math.floor(px / TILE));
  }
  function roomAtPx(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    for (const rm of ROOMS) if (contains(rm.r, tx, ty)) return rm;
    return null;
  }

  OR.MAP = { TILE, MAPW, MAPH, ROOMS, HALLS, CONSOLES, NODES, MEDBEDS, CX, CY, WALK, walkablePx, roomAtPx };

  /* ---------------- static layer baking ---------------- */
  let hullCv = null, floorCv = null;
  const PAD = 260; // margin for hull silhouette + space

  function shapeHull(c) {
    // union-of-rounded-rects silhouette + nose + fins
    c.fillStyle = '#0c1524';
    const pad = 12;
    for (const rm of ROOMS) {
      const [x0, y0, x1, y1] = rm.r;
      roundRectFill(c, x0 * TILE - pad, y0 * TILE - pad, (x1 - x0 + 1) * TILE + pad * 2, (y1 - y0 + 1) * TILE + pad * 2, 18);
    }
    for (const h of HALLS) {
      const [x0, y0, x1, y1] = h;
      roundRectFill(c, x0 * TILE - pad + 4, y0 * TILE - pad + 4, (x1 - x0 + 1) * TILE + pad * 2 - 8, (y1 - y0 + 1) * TILE + pad * 2 - 8, 12);
    }
    // nose cone
    c.beginPath();
    c.moveTo((MAPW - 2) * TILE + 30, CY);
    c.lineTo(ROOMS[0].r[2] * TILE + TILE + 6, ROOMS[0].r[1] * TILE - 6);
    c.lineTo(ROOMS[0].r[2] * TILE + TILE + 6, (ROOMS[0].r[3] + 1) * TILE + 6);
    c.closePath(); c.fill();
    // dorsal spine connecting bays
    roundRectFill(c, 13 * TILE - 8, 6 * TILE - 8, 15 * TILE, 8 * TILE, 14);
    // engine nacelles
    for (const yy of [15.2, 16.4]) {
      roundRectFill(c, -46, yy * TILE - 14, 3.2 * TILE, 28, 12);
    }
  }
  function roundRectFill(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
  }

  function bake() {
    if (hullCv) return;
    hullCv = document.createElement('canvas');
    floorCv = document.createElement('canvas');
    hullCv.width = floorCv.width = MAPW * TILE + PAD * 2;
    hullCv.height = floorCv.height = MAPH * TILE + PAD * 2;

    /* --- hull --- */
    let c = hullCv.getContext('2d');
    c.translate(PAD, PAD);
    // outer glow via dilation
    c.save();
    shapeHull(c);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = 'rgba(90,170,255,0.55)';
    c.fillRect(-PAD, -PAD, hullCv.width, hullCv.height);
    c.restore();
    c.filter = 'blur(14px)';
    c.drawImage(hullCv, 0, 0);
    c.filter = 'none';
    // solid hull
    shapeHull(c);
    c.strokeStyle = 'rgba(140,210,255,0.85)';
    c.lineWidth = 2;
    // hull plating detail
    c.save();
    c.globalAlpha = 0.5;
    for (const rm of ROOMS) {
      const [x0, y0, x1, y1] = rm.r;
      roundRectPath(c, x0 * TILE - 12, y0 * TILE - 12, (x1 - x0 + 1) * TILE + 24, (y1 - y0 + 1) * TILE + 24, 14);
      c.stroke();
    }
    c.restore();
    // windows along spine + bridge canopy
    c.fillStyle = 'rgba(120,220,255,0.8)';
    for (let i = 0; i < 6; i++) c.fillRect(13.4 * TILE + i * 26, 5.62 * TILE, 14, 5);
    c.beginPath();
    c.moveTo(33.4 * TILE, 8.4 * TILE); c.lineTo(34.6 * TILE, 9.2 * TILE);
    c.lineTo(34.6 * TILE, 10.8 * TILE); c.lineTo(33.4 * TILE, 11.6 * TILE);
    c.closePath(); c.fill();

    /* --- floor --- */
    c = floorCv.getContext('2d');
    c.translate(PAD, PAD);
    for (const rm of ROOMS) {
      const [x0, y0, x1, y1] = rm.r;
      const x = x0 * TILE, y = y0 * TILE, w = (x1 - x0 + 1) * TILE, h = (y1 - y0 + 1) * TILE;
      const grad = c.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, `hsla(${rm.hue},45%,16%,0.95)`);
      grad.addColorStop(1, `hsla(${rm.hue},50%,10%,0.95)`);
      c.fillStyle = grad;
      roundRectFill(c, x + 2, y + 2, w - 4, h - 4, 8);
      // accent strip
      c.fillStyle = `hsla(${rm.hue},80%,60%,0.5)`;
      c.fillRect(x + 2, y + 2, w - 4, 3);
    }
    for (const h of HALLS) {
      const [x0, y0, x1, y1] = h;
      c.fillStyle = 'rgba(70,95,125,0.28)';
      c.fillRect(x0 * TILE + 2, y0 * TILE + 2, (x1 - x0 + 1) * TILE - 4, (y1 - y0 + 1) * TILE - 4);
    }
    // plate grid
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (let x = 0; x <= MAPW; x++) { c.beginPath(); c.moveTo(x * TILE, 0); c.lineTo(x * TILE, MAPH * TILE); c.stroke(); }
    for (let y = 0; y <= MAPH; y++) { c.beginPath(); c.moveTo(0, y * TILE); c.lineTo(MAPW * TILE, y * TILE); c.stroke(); }
    // room labels
    c.font = `bold 11px ${OR.FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const rm of ROOMS) {
      const [x0, y0, x1, y1] = rm.r;
      c.fillStyle = `hsla(${rm.hue},70%,72%,0.75)`;
      c.fillText(rm.name.toUpperCase(), ((x0 + x1 + 1) / 2) * TILE, y0 * TILE + 14);
    }
    // medbeds
    for (const [bx, by] of MEDBEDS) {
      const x = bx * TILE, y = by * TILE;
      c.save();
      roundRectPath(c, x + 5, y + 8, TILE - 10, TILE - 14, 6);
      c.fillStyle = 'rgba(255,255,255,0.09)'; c.fill();
      c.strokeStyle = 'rgba(255,150,220,0.5)'; c.stroke();
      c.restore();
    }
  }
  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------------- dynamic drawing ---------------- */
  function drawConsole(ctx, key, tm, occupiedByMe, occupiedOther) {
    const con = CONSOLES[key];
    const x = con.x * TILE, y = con.y * TILE;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(10,20,36,0.95)';
    roundRectFill(ctx, -20, -16, 40, 32, 7);
    ctx.strokeStyle = 'rgba(120,180,235,0.6)';
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, -20, -16, 40, 32, 7); ctx.stroke();
    // screen
    const flicker = 0.75 + 0.25 * Math.sin(tm * 7 + x);
    const col = occupiedByMe ? '#59d6ff' : occupiedOther ? '#ffd166' : `rgba(89,214,255,${0.5 * flicker})`;
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillRect(-14, -10, 28, 14);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6,12,24,0.85)';
    for (let i = 0; i < 3; i++) ctx.fillRect(-11, -8 + i * 5, 10 + (i % 2) * 8, 2.5);
    // stand
    ctx.fillStyle = '#1b2b42';
    ctx.fillRect(-6, 16, 12, 6);
    ctx.restore();
  }

  function drawNode(ctx, key, hp, tm, alarm) {
    const n = NODES[key];
    const x = n.x * TILE, y = n.y * TILE;
    ctx.save();
    ctx.translate(x, y);
    const broken = hp <= 25, hurt = hp <= 50;
    if (key === 'reactor') {
      // pulsing core
      const pulse = 0.5 + 0.5 * Math.sin(tm * (broken ? 9 : 3));
      const col = broken ? '#ff5f56' : hurt ? '#ffb454' : '#7dffa8';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7);
      ctx.fillStyle = 'rgba(8,16,30,0.95)'; ctx.fill();
      ctx.strokeStyle = 'rgba(160,200,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 9 + pulse * 3.5, 0, 7);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16 + pulse * 10;
      ctx.globalAlpha = broken ? 0.5 + 0.4 * pulse : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = 'rgba(14,24,42,0.95)';
      roundRectFill(ctx, -15, -12, 30, 24, 5);
      ctx.strokeStyle = hurt ? '#ff5f56' : 'rgba(120,180,235,0.55)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, -15, -12, 30, 24, 5); ctx.stroke();
      ctx.fillStyle = broken ? 'rgba(255,95,86,0.85)' : hurt ? 'rgba(255,180,84,0.8)' : 'rgba(125,255,168,0.65)';
      ctx.fillRect(-10, -6, 20, 4);
      ctx.fillStyle = 'rgba(90,130,180,0.7)';
      ctx.fillRect(-10, 2, 14, 3);
    }
    if (hp < 99.5) {
      // damage sparks handled by fx; small hp pip here
      const w = 30 * clamp(hp / 100, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-15, 16, 30, 3);
      ctx.fillStyle = hp > 50 ? '#7dffa8' : hp > 25 ? '#ffb454' : '#ff5f56';
      ctx.fillRect(-15, 16, w, 3);
    }
    ctx.restore();
    void alarm;
  }

  function drawFire(ctx, tx, ty, tm, seed) {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,190,80,0.55)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-26, -26, 52, 52);
    for (let i = 0; i < 4; i++) {
      const ph = tm * (5 + seed + i) + i * 1.7 + seed * 9;
      const fx = Math.sin(ph) * 7, fy = -Math.abs(Math.cos(ph * 0.9)) * 12 - 2;
      const s = 5 + 3 * Math.sin(ph * 1.3 + i);
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(2, s), 0, 7);
      ctx.fillStyle = i % 2 ? 'rgba(255,150,40,0.75)' : 'rgba(255,210,90,0.8)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBreach(ctx, k, tm) {
    const tx = k % MAPW, ty = (k / MAPW) | 0;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#01030a';
    ctx.beginPath();
    const spikes = 7;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 ? 7 + (i % 3) * 3 : 13;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,95,86,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // hissing streaks
    ctx.strokeStyle = 'rgba(180,230,255,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = tm * 3 + i * 2.1;
      const r1 = 14, r2 = 20 + 6 * Math.abs(Math.sin(a));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrew(ctx, p, tm, isMe) {
    const { x, y } = p;
    ctx.save();
    ctx.translate(x, y);
    if (p.down) {
      ctx.rotate(1.45);
      ctx.globalAlpha = 0.85;
    }
    const col = p.cssColor || '#fff';
    const bob = p.moving ? Math.sin(tm * 11 + (p.seed || 0)) * 1.6 : 0;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 9, 10, 4, 0, 0, 7); ctx.fill();
    // body
    ctx.translate(0, bob * 0.4);
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    // backpack
    ctx.save();
    ctx.rotate(Math.atan2(p.fy || 0, p.fx || 1));
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRectFill(ctx, 4, -6, 7, 12, 3);
    // visor
    ctx.fillStyle = '#0a1626';
    ctx.beginPath(); ctx.ellipse(5, 0, 4.5, 5.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(140,225,255,0.85)';
    ctx.beginPath(); ctx.ellipse(6.4, 0, 2.2, 3.2, 0, 0, 7); ctx.fill();
    ctx.restore();
    if (isMe) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(0, 0, 13.5, tm * 2, tm * 2 + 6.28); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.rotate(0);
    // hp bar
    if (!p.down && p.hp < 99) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-11, -18, 22, 4);
      ctx.fillStyle = p.hp > 50 ? '#7dffa8' : p.hp > 25 ? '#ffb454' : '#ff5f56';
      ctx.fillRect(-11, -18, 22 * clamp(p.hp / 100, 0, 1), 4);
    }
    if (p.down) {
      ctx.fillStyle = '#ff5f56';
      ctx.font = `bold 9px ${OR.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('DOWN', 0, -22);
    }
    // channel progress ring
    if (p.chanProg != null) {
      ctx.strokeStyle = 'rgba(255,210,90,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + p.chanProg * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // name tag (unrotated)
    ctx.save();
    ctx.font = `${isMe ? 'bold ' : ''}10px ${OR.FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const nm = (p.name || '?');
    const tw = ctx.measureText(nm).width;
    ctx.fillRect(x - tw / 2 - 3, y - 34, tw + 6, 12);
    ctx.fillStyle = isMe ? '#ffffff' : 'rgba(207,227,245,0.9)';
    ctx.fillText(nm, x, y - 25);
    if (p.emoteTxt) {
      ctx.font = 'bold 12px ' + OR.FONT;
      const ew = ctx.measureText(p.emoteTxt).width;
      ctx.fillStyle = 'rgba(10,18,32,0.92)';
      roundRectFill(ctx, x - ew / 2 - 6, y - 56, ew + 12, 18, 9);
      ctx.strokeStyle = 'rgba(120,200,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#cfeaff';
      ctx.textAlign = 'left';
      ctx.fillText(p.emoteTxt, x - ew / 2, y - 43);
    }
    ctx.restore();
  }

  /* space entity drawing (coords relative to ship center) */
  function drawRock(ctx, r) {
    ctx.save();
    ctx.translate(CX + r.x, CY + r.y);
    ctx.rotate(r.rot || 0);
    ctx.fillStyle = '#3a4356';
    ctx.beginPath();
    const spikes = 8;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = r.r * (i % 2 ? 0.72 : 1);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5b6880'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(r.r * 0.3, r.r * 0.2, r.r * 0.28, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawFoe(ctx, f, tm) {
    ctx.save();
    ctx.translate(CX + f.x, CY + f.y);
    const ang = Math.atan2(-f.y, -f.x);
    ctx.rotate(ang);
    if (f.tel) {
      ctx.strokeStyle = `rgba(255,95,86,${0.4 + 0.4 * Math.sin(tm * 20)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-900, 0); ctx.stroke();
    }
    ctx.fillStyle = '#8b3040';
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(-14, -13); ctx.lineTo(-8, 0); ctx.lineTo(-14, 13);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff8d7a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(6, 0, 3, 0, 7); ctx.fill();
    ctx.restore();
    // hp bar
    ctx.save();
    ctx.translate(CX + f.x, CY + f.y);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-18, -26, 36, 4);
    ctx.fillStyle = '#ff5f56';
    ctx.fillRect(-18, -26, 36 * clamp(f.hp / f.mhp, 0, 1), 4);
    ctx.restore();
  }
  function drawShot(ctx, s, tm) {
    void tm;
    const x = CX + s.x, y = CY + s.y;
    ctx.save();
    ctx.strokeStyle = s.team === 'us' ? 'rgba(120,255,190,0.95)' : 'rgba(255,110,90,0.95)';
    ctx.lineWidth = 3;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
    const vl = Math.hypot(s.vx || 0, s.vy || 0) || 1;
    const ux = (s.vx || 0) / vl, uy = (s.vy || 0) / vl;
    ctx.beginPath();
    ctx.moveTo(x - ux * 14, y - uy * 14);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }

  OR.draw = { bake, drawConsole, drawNode, drawFire, drawBreach, drawCrew, drawRock, drawFoe, drawShot, roundRectFill, roundRectPath };
})();
