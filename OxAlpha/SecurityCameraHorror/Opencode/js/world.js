'use strict';
/* GRAYLINE — Night Shift :: map, rooms, figures, post FX */
window.G = window.G || {};

G.CAM_ORDER = ['west_corridor', 'stacks_a', 'manifest', 'cold_store', 'east_hall', 'boiler', 'dock', 'atrium'];

G.MAP = {
  names: {
    west_corridor: 'WEST CORRIDOR',
    stacks_a: 'CRATE STACKS A',
    manifest: 'MANIFEST OFFICE',
    cold_store: 'COLD STORE',
    east_hall: 'EAST SERVICE HALL',
    boiler: 'BOILER NOOK',
    dock: 'LOADING DOCK',
    atrium: 'ATRIUM'
  },
  adj: {
    atrium: ['stacks_a', 'manifest', 'cold_store', 'east_hall'],
    stacks_a: ['atrium', 'manifest', 'west_corridor'],
    manifest: ['atrium', 'stacks_a', 'west_corridor'],
    west_corridor: ['stacks_a', 'manifest', 'LDOOR'],
    cold_store: ['atrium', 'east_hall', 'boiler'],
    east_hall: ['atrium', 'cold_store', 'boiler', 'dock', 'RDOOR'],
    boiler: ['cold_store', 'east_hall', 'RDOOR'],
    dock: ['east_hall', 'HATCH'],
    LDOOR: [], RDOOR: [],
    HATCH: ['dock', 'atrium']
  },
  _dist: {},
  dist(from, target) {
    const m = this._dist[target] || (() => {
      const mm = {}; mm[target] = 0;
      const und = {};
      const link = (a, b) => { (und[a] = und[a] || new Set()).add(b); (und[b] = und[b] || new Set()).add(a); };
      for (const a in this.adj) for (const b of this.adj[a]) link(a, b);
      const q = [target];
      while (q.length) {
        const cur = q.shift();
        for (const n of und[cur]) if (mm[n] === undefined) { mm[n] = mm[cur] + 1; q.push(n); }
      }
      this._dist[target] = mm;
      return mm;
    })();
    const d = m[from];
    return d === undefined ? 99 : d;
  }
};

/* ---------------- figures ---------------- */
G.FIG = {
  foreman(ctx, x, y, h, t, a) {
    const sway = Math.sin(t * 0.8) * h * 0.006;
    ctx.save(); ctx.translate(x + sway, y); ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(190,185,175,0.22)';
    ctx.fillStyle = '#07070b'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-h * 0.085, 0);
    ctx.lineTo(-h * 0.075, -h * 0.42);
    ctx.lineTo(-h * 0.10, -h * 0.80);
    ctx.quadraticCurveTo(0, -h * 0.88, h * 0.10, -h * 0.80);
    ctx.lineTo(h * 0.075, -h * 0.42);
    ctx.lineTo(h * 0.085, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.10, -h * 0.78); ctx.lineTo(-h * 0.13, -h * 0.30);
    ctx.moveTo(h * 0.10, -h * 0.78); ctx.lineTo(h * 0.13, -h * 0.30);
    ctx.stroke();
    const tilt = Math.sin(t * 0.55) * 0.12;
    ctx.save(); ctx.translate(0, -h * 0.875); ctx.rotate(tilt);
    ctx.fillStyle = '#07070b';
    ctx.beginPath(); ctx.ellipse(0, 0, h * 0.052, h * 0.068, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8b2a4';
    ctx.beginPath(); ctx.ellipse(h * 0.008, h * 0.004, h * 0.034, h * 0.05, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#10100e';
    ctx.beginPath(); ctx.ellipse(h * 0.022, -h * 0.008, h * 0.007, h * 0.010, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-h * 0.004, -h * 0.008, h * 0.007, h * 0.010, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.restore();
  },

  mange(ctx, x, y, w, t, a) {
    const jx = (G.hash(Math.floor(t * 11)) - 0.5) * w * 0.05;
    const jy = (G.hash(Math.floor(t * 9) + 7) - 0.5) * w * 0.03;
    ctx.save(); ctx.translate(x + jx, y + jy); ctx.globalAlpha = a;
    ctx.fillStyle = '#0a0910';
    for (let i = 6; i >= 0; i--) {
      const r = w * (0.34 - i * 0.032);
      const ox = (G.hash(i * 17.3 + Math.floor(t * 8)) - 0.5) * w * 0.5;
      const oy = -r * 0.55 - G.hash(i * 7.9) * w * 0.28;
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(40,36,54,0.65)'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const s = G.hash(i * 31.7), e = G.hash(i * 13.1 + Math.floor(t * 7));
      ctx.beginPath();
      ctx.moveTo((s - 0.5) * w * 0.6, -w * 0.25);
      ctx.bezierCurveTo((s - 0.5) * w, -w * 0.05, (e - 0.5) * w, w * 0.06, (e - 0.5) * w * 0.9, w * 0.14);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const ox = (G.hash(i * 23.1) - 0.5) * w * 0.34;
      const oy = -w * (0.38 + G.hash(i * 9.7) * 0.16);
      const r = 2.2 + G.hash(i * 41.3) * 2.4;
      ctx.fillStyle = 'rgba(207,200,184,' + (0.85 * a).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#14121a';
      ctx.beginPath(); ctx.arc(ox, oy, r * 0.4, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  },

  wick(ctx, x, y, r, t, a) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
    g.addColorStop(0, 'rgba(255,236,190,0.95)');
    g.addColorStop(0.35, 'rgba(255,150,50,0.55)');
    g.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45 * (0.85 + 0.15 * Math.sin(t * 9)), 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffc37a';
    for (let i = 0; i < 6; i++) {
      const ang = t * 2 + i * 1.047 + G.hash(i) * 6.28;
      const d = r * (1.5 + G.hash(i * 3.3) * 0.7 + Math.sin(t * 3 + i) * 0.15);
      ctx.fillRect(Math.cos(ang) * d, Math.sin(ang) * d, 1.6, 1.6);
    }
    ctx.restore();
  }
};

/* ---------------- draw helpers ---------------- */
function vg(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  for (const s of stops) g.addColorStop(s[0], s[1]);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
function poly(ctx, pts, fill) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function fl(t, seed, lo, hi) {
  const v = Math.sin(t * 13.7 + seed) * Math.sin(t * 7.3 + seed * 2.1) * Math.sin(t * 2.9 + seed * 0.7);
  return lo + (hi - lo) * (0.5 + 0.5 * v);
}
function box(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
}
function label(ctx, txt, x, y, size, col, align) {
  ctx.font = '700 ' + size + 'px Consolas,monospace';
  ctx.textAlign = align || 'left';
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}

/* ---------------- rooms ---------------- */
G.ROOMS = {

  west_corridor: {
    anchors: [{ x: 500, y: 545, h: 330 }, { x: 800, y: 520, h: 280 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#10131a'], [0.62, '#151a24'], [1, '#0c0e14']]);
      poly(ctx, [[380, 720], [520, 430], [760, 430], [900, 720]], '#1d222e');
      poly(ctx, [[900, 720], [760, 430], [1280, 300], [1280, 720]], '#12151d');
      poly(ctx, [[380, 720], [520, 430], [0, 300], [0, 720]], '#12151d');
      poly(ctx, [[520, 430], [760, 430], [760, 250], [520, 250]], '#0d1017');
      ctx.strokeStyle = 'rgba(140,150,170,0.14)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 300); ctx.lineTo(520, 250);
      ctx.moveTo(1280, 300); ctx.lineTo(760, 250);
      ctx.stroke();
      box(ctx, 596, 262, 90, 16, 'rgba(210,225,255,' + fl(E.t, 3.1, 0.06, 0.30).toFixed(3) + ')');
      box(ctx, 120, 120, 130, 12, 'rgba(200,215,240,' + fl(E.t, 8.7, 0.04, 0.16).toFixed(3) + ')');
      box(ctx, 1040, 120, 130, 12, 'rgba(200,215,240,' + fl(E.t, 5.2, 0.04, 0.18).toFixed(3) + ')');
      box(ctx, 600, 330, 80, 100, '#0a0c11', 'rgba(160,170,190,0.15)');
      label(ctx, 'EXIT', 640, 356, 13, 'rgba(120,220,150,' + fl(E.t, 2.4, 0.25, 0.55).toFixed(2) + ')', 'center');
      box(ctx, 60, 340, 26, 180, '#171b25');
      ctx.fillStyle = 'rgba(150,160,180,0.10)'; ctx.fillRect(64, 350, 18, 160);
      label(ctx, 'SECTOR W', 200, 200, 20, 'rgba(200,210,230,0.10)', 'center');
    }
  },

  stacks_a: {
    anchors: [{ x: 420, y: 565, h: 330 }, { x: 880, y: 550, h: 300 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#141109'], [0.6, '#181309'], [1, '#0d0b06']]);
      ctx.fillStyle = '#1f1910';
      const stackCol = (bx, by, cols) => {
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < 3; r++) {
            const w = 74 - c * 8, h = 52 - c * 5;
            box(ctx, bx + c * 118, by - r * (h + 4), w, h, c % 2 ? '#241c11' : '#1e1710', 'rgba(200,170,110,0.10)');
          }
        }
      };
      stackCol(30, 630, 2); stackCol(1010, 615, 2); stackCol(700, 486, 1);
      box(ctx, 300, 566, 84, 60, '#26201a', 'rgba(220,180,90,0.14)');
      ctx.save(); ctx.translate(342, 596); ctx.rotate(-0.08);
      for (let i = -1; i <= 1; i++) { ctx.fillStyle = 'rgba(220,180,60,' + (i % 2 ? 0.5 : 0.15) + ')'; ctx.fillRect(i * 12 - 5, -14, 10, 28); }
      ctx.restore();
      box(ctx, 540, 90, 150, 14, 'rgba(255,220,150,' + fl(E.t, 6.6, 0.05, 0.13).toFixed(3) + ')');
      label(ctx, 'STACKS A', 640, 170, 22, 'rgba(220,200,160,0.09)', 'center');
      ctx.fillStyle = 'rgba(200,180,140,0.06)'; ctx.fillRect(0, 660, 1280, 60);
    }
  },

  manifest: {
    anchors: [{ x: 480, y: 575, h: 310 }, { x: 850, y: 558, h: 290 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#0e1613'], [0.6, '#122019'], [1, '#0a100d']]);
      box(ctx, 80, 180, 260, 260, '#15221b', 'rgba(140,190,160,0.10)');
      for (let i = 0; i < 4; i++) box(ctx, 92, 196 + i * 62, 236, 46, 'rgba(10,16,12,0.8)', 'rgba(140,190,160,0.08)');
      box(ctx, 940, 180, 260, 260, '#15221b', 'rgba(140,190,160,0.10)');
      for (let i = 0; i < 4; i++) box(ctx, 952, 196 + i * 62, 236, 46, 'rgba(10,16,12,0.8)', 'rgba(140,190,160,0.08)');
      poly(ctx, [[300, 640], [340, 470], [640, 470], [680, 640]], '#1c2a22');
      poly(ctx, [[640, 640], [600, 470], [900, 470], [940, 640]], '#19251e');
      ctx.save(); ctx.translate(400, 486); ctx.rotate(-0.02);
      ctx.fillStyle = 'rgba(225,218,195,0.72)'; ctx.fillRect(0, 0, 92, 58);
      ctx.strokeStyle = 'rgba(120,120,110,0.4)';
      ctx.beginPath(); ctx.moveTo(10, 12); ctx.lineTo(78, 12); ctx.moveTo(10, 24); ctx.lineTo(70, 24); ctx.moveTo(10, 36); ctx.lineTo(62, 36); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(225,218,195,0.5)'; ctx.fillRect(762, 502, 76, 44);
      ctx.save();
      ctx.translate(560, 120);
      ctx.fillStyle = 'rgba(235,225,190,' + fl(E.t, 4.4, 0.10, 0.20).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.lineTo(60, 300); ctx.lineTo(-60, 300); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0c120f'; ctx.fillRect(-30, -14, 60, 16);
      ctx.strokeStyle = 'rgba(150,150,140,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -120); ctx.lineTo(0, -14); ctx.stroke();
      ctx.restore();
      label(ctx, 'MANIFEST OFFICE', 640, 692, 20, 'rgba(180,220,190,0.10)', 'center');
    }
  },

  cold_store: {
    anchors: [{ x: 520, y: 585, h: 320 }, { x: 820, y: 562, h: 295 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#0b1322'], [0.6, '#0e1828'], [1, '#080d16']]);
      box(ctx, 60, 60, 300, 200, '#131e30', 'rgba(160,200,240,0.12)');
      label(ctx, 'COLD STORE', 84, 116, 24, 'rgba(170,210,245,0.5)');
      label(ctx, '-18C  KEEP SHUT', 84, 148, 16, 'rgba(170,210,245,0.35)');
      for (let i = 0; i < 12; i++) {
        const x = 420 + i * 72;
        const sway = Math.sin(E.t * 1.3 + i * 0.9) * 6;
        ctx.fillStyle = 'rgba(175,205,230,' + (0.13 + (i % 3) * 0.03).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + 34, 0);
        ctx.lineTo(x + 34 + sway, 620 + (i % 4) * 30);
        ctx.lineTo(x + sway, 620 + ((i + 2) % 4) * 30);
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 7; i++) {
        const p = (E.t * 0.14 + G.hash(i * 3.7)) % 1;
        ctx.fillStyle = 'rgba(190,215,240,' + (0.16 * (p < 0.5 ? p * 2 : (1 - p) * 2)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(G.hash(i * 7.1) * 1200 + 40, 640 - p * 480, 3 + p * 5, 0, 6.283); ctx.fill();
      }
      box(ctx, 1080, 420, 160, 240, '#101a2a', 'rgba(160,200,240,0.14)');
      ctx.fillStyle = 'rgba(160,200,240,0.2)';
      ctx.fillRect(1100, 450, 120, 10); ctx.fillRect(1100, 480, 120, 10);
      ctx.fillStyle = 'rgba(190,220,250,0.10)';
      for (let i = 0; i < 5; i++) ctx.fillRect(0, 660 + i * 12, 1280, 3);
    }
  },

  east_hall: {
    anchors: [{ x: 430, y: 592, h: 330 }, { x: 900, y: 576, h: 305 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#150f0a'], [0.6, '#1a130c'], [1, '#0e0a06']]);
      ctx.strokeStyle = 'rgba(190,140,80,0.16)'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const y = 70 + i * 46;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y + 8); ctx.stroke();
      }
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const x = 140 + i * 240;
        ctx.strokeRect(x - 14, 92, 28, 20);
        ctx.fillStyle = 'rgba(220,160,80,0.10)'; ctx.fillRect(x - 14, 92, 28, 20);
      }
      const sw = Math.sin(E.t * 1.7) * 0.09;
      ctx.save(); ctx.translate(640, 116); ctx.rotate(sw);
      ctx.strokeStyle = 'rgba(200,200,200,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 70); ctx.stroke();
      const g = ctx.createRadialGradient(0, 90, 4, 0, 90, 320);
      g.addColorStop(0, 'rgba(255,225,160,' + fl(E.t, 9.9, 0.14, 0.26).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,225,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-16, 86); ctx.lineTo(16, 86); ctx.lineTo(150, 560); ctx.lineTo(-150, 560); ctx.closePath(); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(230,180,60,0.20)' : 'rgba(20,16,10,0.85)';
        ctx.fillRect(i * 80, 640, 80, 22);
      }
      label(ctx, 'SERVICE HALL E', 640, 200, 20, 'rgba(230,190,120,0.10)', 'center');
    }
  },

  boiler: {
    anchors: [{ x: 560, y: 602, h: 330 }, { x: 950, y: 586, h: 300 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#100d10'], [0.6, '#151013'], [1, '#0a0709']]);
      ctx.fillStyle = '#191318';
      ctx.beginPath(); ctx.ellipse(260, 380, 190, 250, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(200,160,120,0.10)'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.ellipse(260, 380, 190 - i * 4, 250 - i * 4, 0, -1.2, 1.2); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(220,180,140,0.14)';
      ctx.beginPath();
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
        ctx.moveTo(150 + c * 74, 200 + r * 66); ctx.lineTo(158 + c * 74, 206 + r * 66);
      }
      ctx.stroke();
      box(ctx, 360, 240, 90, 70, '#0d0a0c', 'rgba(200,160,120,0.16)');
      ctx.strokeStyle = 'rgba(220,200,160,0.5)';
      ctx.beginPath(); ctx.arc(405, 275, 24, 0, 6.283); ctx.stroke();
      const na = -2.2 + Math.sin(E.t * 0.7) * 0.5 + G.hash(Math.floor(E.t * 3)) * 0.1;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(405, 275); ctx.lineTo(405 + Math.cos(na) * 20, 275 + Math.sin(na) * 20); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,150,110,0.2)';
      ctx.beginPath(); ctx.moveTo(450, 270); ctx.lineTo(700, 250); ctx.lineTo(700, 300);
      ctx.moveTo(700, 250); ctx.lineTo(1000, 260); ctx.stroke();
      const fg = ctx.createRadialGradient(640, 660, 10, 640, 660, 320);
      fg.addColorStop(0, 'rgba(255,130,40,' + fl(E.t, 7.7, 0.20, 0.38).toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(255,130,40,0)');
      ctx.fillStyle = fg; ctx.fillRect(320, 420, 640, 300);
      box(ctx, 560, 640, 170, 60, '#0b0709');
      ctx.strokeStyle = 'rgba(255,150,60,0.5)';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath(); ctx.moveTo(572 + i * 22, 650); ctx.lineTo(572 + i * 22, 692); ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const p = (E.t * 0.3 + G.hash(i * 5.3)) % 1;
        ctx.strokeStyle = 'rgba(200,200,220,' + (0.10 * (1 - p)).toFixed(3) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(660 + G.hash(i) * 60, 600 - p * 420);
        ctx.bezierCurveTo(640 + G.hash(i * 2) * 80, 520 - p * 420, 700 + G.hash(i * 3) * 60, 440 - p * 420, 660 + G.hash(i * 4) * 80, 340 - p * 300);
        ctx.stroke();
      }
    }
  },

  dock: {
    anchors: [{ x: 480, y: 592, h: 340 }, { x: 860, y: 572, h: 310 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#111217'], [0.6, '#16181e'], [1, '#0c0d11']]);
      for (let i = 0; i < 20; i++) {
        box(ctx, 60 + i * 60, 40, 34, 460, i % 2 ? '#191c23' : '#15171d', 'rgba(150,160,180,0.07)');
      }
      box(ctx, 60, 40, 1170, 30, '#1d2028');
      ctx.strokeStyle = 'rgba(200,205,220,0.14)'; ctx.lineWidth = 2;
      ctx.strokeRect(60, 40, 1170, 460);
      ctx.strokeStyle = 'rgba(180,185,200,0.2)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(1140, 70); ctx.lineTo(1140, 20); ctx.lineTo(1240, 20); ctx.stroke();
      box(ctx, 1120, 60, 44, 30, '#23262e', 'rgba(200,205,220,0.2)');
      const stack = (bx, by) => {
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++)
          box(ctx, bx + c * 78, by - r * 56, 74, 52, r + c === 1 ? '#1c1f27' : '#21252e', 'rgba(190,200,220,0.10)');
      };
      stack(940, 620); stack(180, 640);
      ctx.fillStyle = 'rgba(190,200,225,0.06)';
      for (let i = 0; i < 6; i++) ctx.fillRect(140 + i * 170, 668, 90, 4);
      label(ctx, 'DOCK 3', 90, 556, 26, 'rgba(210,215,230,0.12)');
      box(ctx, 90, 568, 150, 8, 'rgba(230,190,60,0.25)');
    }
  },

  atrium: {
    anchors: [{ x: 400, y: 585, h: 340 }, { x: 900, y: 568, h: 315 }],
    draw(ctx, E) {
      vg(ctx, 0, 0, 1280, 720, [[0, '#0c0d15'], [0.55, '#11121c'], [1, '#080910']]);
      poly(ctx, [[420, 60], [760, 60], [900, 300], [330, 300]], 'rgba(165,185,225,0.05)');
      ctx.strokeStyle = 'rgba(165,185,225,0.10)';
      ctx.strokeRect(420, 60, 340, 6);
      poly(ctx, [[880, 640], [1040, 300], [1130, 300], [1030, 640]], '#151623');
      for (let i = 0; i < 9; i++) {
        const p = i / 9;
        ctx.fillStyle = '#191a28';
        ctx.fillRect(880 + p * 150, 640 - p * 340, 90 - p * 20, 12);
      }
      ctx.strokeStyle = 'rgba(170,175,205,0.18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(60, 260); ctx.lineTo(760, 260); ctx.stroke();
      ctx.lineWidth = 2;
      for (let x = 80; x < 760; x += 68) { ctx.beginPath(); ctx.moveTo(x, 260); ctx.lineTo(x, 292); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(60, 292); ctx.lineTo(760, 292); ctx.stroke();
      for (const cx of [180, 620]) {
        ctx.fillStyle = '#141522';
        ctx.fillRect(cx - 26, 292, 52, 348);
        ctx.fillStyle = 'rgba(170,175,205,0.10)';
        ctx.fillRect(cx - 26, 292, 8, 348);
      }
      ctx.strokeStyle = 'rgba(190,195,220,0.16)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(640, 620, 210, 52, 0, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(640, 620, 150, 36, 0, 0, 6.283); ctx.stroke();
      label(ctx, 'GRAYLINE FREIGHT & STORAGE', 640, 626, 15, 'rgba(190,195,220,0.10)', 'center');
      label(ctx, 'ATRIUM', 640, 200, 22, 'rgba(190,195,220,0.07)', 'center');
    }
  }
};

/* ---------------- office ---------------- */
G.OFFICE = {
  draw(ctx, S) {
    const t = S.t;
    vg(ctx, 0, 0, 1280, 720, [[0, S.blackout ? '#030304' : '#0a0a10'], [0.7, S.blackout ? '#050506' : '#12121a'], [1, '#07070b']]);
    ctx.strokeStyle = 'rgba(120,125,145,0.10)'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 52); ctx.lineTo(1280, 52);
    ctx.moveTo(0, 74); ctx.lineTo(1280, 74);
    ctx.stroke();

    const doorway = (x, w, side) => {
      const lit = !S.blackout && S.lights[side];
      box(ctx, x - 16, 96, w + 32, 540, '#101018');
      box(ctx, x, 110, w, 512, '#020204');
      if (lit) {
        const lg = ctx.createLinearGradient(0, 110, 0, 622);
        lg.addColorStop(0, 'rgba(216,201,160,0.32)');
        lg.addColorStop(0.6, 'rgba(190,172,130,0.15)');
        lg.addColorStop(1, 'rgba(160,140,100,0.06)');
        ctx.fillStyle = lg; ctx.fillRect(x, 110, w, 512);
        ctx.strokeStyle = 'rgba(230,215,170,0.22)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + w * 0.5, 130); ctx.lineTo(x + w * 0.5, 600); ctx.stroke();
      }
      if (S.doors[side]) {
        const dg = ctx.createLinearGradient(0, 110, 0, 622);
        dg.addColorStop(0, '#2a2c33'); dg.addColorStop(1, '#191b20');
        ctx.fillStyle = dg; ctx.fillRect(x, 110, w, 512);
        ctx.fillStyle = 'rgba(230,180,60,0.55)';
        for (let yy = 150; yy < 600; yy += 46) ctx.fillRect(x, yy, w, 14);
        ctx.strokeStyle = '#3a3d46'; ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, 112, w - 4, 508);
      } else if (!lit) {
        const occ = S.atDoor[side];
        if (occ === 'foreman') {
          ctx.fillStyle = 'rgba(184,178,164,' + (0.10 + 0.08 * Math.sin(t * 2.1)).toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(x + w / 2, 240, 10, 14, 0, 0, 6.283); ctx.fill();
        }
      }
      const occ = S.atDoor[side];
      if (lit && occ) {
        const cx = x + w / 2, fy = 618;
        if (occ === 'foreman') G.FIG.foreman(ctx, cx, fy, 430, t, 0.96);
        else if (occ === 'mange') G.FIG.mange(ctx, cx, fy - 40, w * 0.66, t, 0.96);
      }
      let ledCol = null, blinkOn = true;
      if (!S.blackout) {
        if (S.doors[side]) ledCol = '#ff4b47';
        else if (occ) { ledCol = '#ff4b47'; blinkOn = Math.sin(t * 9) > -0.2; }
        else ledCol = 'rgba(89,217,140,0.55)';
      }
      if (ledCol && blinkOn) {
        ctx.fillStyle = ledCol;
        ctx.shadowColor = ledCol; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(side === 'L' ? x - 30 : x + w + 30, 78, 6, 0, 6.283); ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    doorway(64, 214, 'L');
    doorway(1002, 214, 'R');

    box(ctx, 560, 40, 160, 146, '#0b0c11', 'rgba(150,155,175,0.16)');
    ctx.fillStyle = '#050507';
    for (let i = 0; i < 6; i++) ctx.fillRect(572, 52 + i * 22, 136, 12);
    if (S.wickAtHatch && !S.hatch && !S.blackout) {
      const gx = 640 + Math.sin(t * 2.2) * 26, gy = 118 + Math.cos(t * 1.7) * 14;
      const wg = ctx.createRadialGradient(gx, gy, 1, gx, gy, 26);
      wg.addColorStop(0, 'rgba(255,190,110,0.5)');
      wg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(gx, gy, 26, 0, 6.283); ctx.fill();
    }
    let hatchLed = null;
    if (!S.blackout) {
      if (S.wickAtHatch) hatchLed = Math.sin(t * 9) > -0.2 ? '#ff4b47' : null;
      else if (S.hatch) hatchLed = '#ffb347';
    }
    if (hatchLed) {
      ctx.fillStyle = hatchLed; ctx.shadowColor = hatchLed; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(742, 60, 6, 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0;
    }

    label(ctx, 'WEST', 30, 96, 15, 'rgba(216,205,180,0.35)');
    ctx.textAlign = 'right';
    label(ctx, 'EAST', 1250, 96, 15, 'rgba(216,205,180,0.35)');
    ctx.textAlign = 'left';

    if (!S.blackout) {
      ctx.save();
      ctx.translate(370, 268); ctx.rotate(-0.015);
      box(ctx, 0, 0, 130, 168, '#1c1a14', 'rgba(220,200,150,0.14)');
      box(ctx, 8, 8, 114, 152, '#211e15');
      label(ctx, 'GRAYLINE', 65, 52, 17, 'rgba(228,214,178,0.55)', 'center');
      label(ctx, 'FREIGHT & STORAGE', 65, 74, 12, 'rgba(228,214,178,0.40)', 'center');
      label(ctx, 'SAFETY FIRST', 65, 96, 12, 'rgba(228,214,178,0.40)', 'center');
      ctx.fillStyle = 'rgba(228,214,178,0.25)';
      ctx.fillRect(24, 116, 82, 3); ctx.fillRect(24, 126, 60, 3);
      ctx.restore();
    }

    poly(ctx, [[110, 720], [250, 592], [1030, 592], [1170, 720]], S.blackout ? '#0a0a0c' : '#181820');
    ctx.strokeStyle = 'rgba(150,150,175,0.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(250, 592); ctx.lineTo(1030, 592); ctx.stroke();

    box(ctx, 300, 540, 130, 60, '#101016', 'rgba(160,160,185,0.14)');
    ctx.fillStyle = '#d8d2c0';
    ctx.beginPath(); ctx.ellipse(348, 536, 17, 22, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#8a8578'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(348, 536, 17, 3.4, 6.0); ctx.stroke();
    box(ctx, 392, 548, 26, 40, '#3a2c1c', 'rgba(200,170,110,0.2)');

    box(ctx, 690, 420, 210, 176, '#131319', 'rgba(160,160,185,0.18)');
    const mg = ctx.createLinearGradient(0, 430, 0, 586);
    mg.addColorStop(0, S.blackout ? '#050605' : '#07120a');
    mg.addColorStop(1, S.blackout ? '#030403' : '#040906');
    ctx.fillStyle = mg; ctx.fillRect(702, 432, 186, 152);
    if (!S.blackout) {
      ctx.fillStyle = 'rgba(120,230,150,' + fl(t, 1.3, 0.5, 0.85).toFixed(2) + ')';
      ctx.font = '12px Consolas,monospace'; ctx.textAlign = 'left';
      ctx.fillText('> FEEDS ONLINE', 710, 456);
      ctx.fillText('> PWR ' + Math.max(0, Math.round(S.power || 0)) + '%', 710, 474);
      ctx.fillText('> SHIFT ACTIVE', 710, 492);
      ctx.fillText('> _', 710, 510);
    }
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(760, 596, 70, 12);

    const fx = 480, fy = 470;
    box(ctx, fx - 34, fy - 10, 68, 96, '#15151c', 'rgba(160,160,185,0.16)');
    ctx.save();
    ctx.translate(fx, fy + 38);
    ctx.strokeStyle = 'rgba(190,190,210,0.35)'; ctx.lineWidth = 3;
    for (let b = 0; b < 3; b++) {
      const a = t * 9 + b * 2.094;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 13 - 6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,160,185,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(fx, fy + 32, 30, 0, 6.283); ctx.stroke();

    if (S.blackout) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, 1280, 720);
      const bl = Math.sin(t * 2.4) > 0.6 ? 0.5 : 0.18;
      ctx.fillStyle = 'rgba(255,60,50,' + bl.toFixed(2) + ')';
      ctx.shadowColor = '#f33'; ctx.shadowBlur = 12;
      ctx.fillRect(636, 644, 8, 4);
      ctx.shadowBlur = 0;
      label(ctx, 'POWER DEPLETED — LOCKS RELEASED', 640, 320, 15, 'rgba(120,130,160,0.10)', 'center');
    }

    if (S.flicker > 0 && !S.blackout) {
      const v = Math.random();
      if (v < 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, 1280, 720); }
      else { ctx.fillStyle = 'rgba(255,240,210,0.05)'; ctx.fillRect(0, 0, 1280, 720); }
    }
  }
};

/* ---------------- post FX ---------------- */
G.FX = {
  tiles: [], vig: null,
  init() {
    for (let k = 0; k < 3; k++) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 144;
      const x = c.getContext('2d');
      const img = x.createImageData(256, 144);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      this.tiles.push(c);
    }
    const vc = document.createElement('canvas');
    vc.width = 1280; vc.height = 720;
    const vx = vc.getContext('2d');
    const g = vx.createRadialGradient(640, 360, 260, 640, 360, 780);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    vx.fillStyle = g; vx.fillRect(0, 0, 1280, 720);
    this.vig = vc;
  },
  post(ctx, o) {
    o = o || {};
    const tears = o.tears || 0;
    for (let i = 0; i < tears; i++) {
      const y = Math.random() * 700, h = 6 + Math.random() * 36;
      const dx = (Math.random() - 0.5) * 56;
      ctx.drawImage(ctx.canvas, 0, y, 1280, h, dx, y, 1280, h);
    }
    if (o.grain !== 0) {
      const tile = this.tiles[(Math.random() * 3) | 0];
      ctx.save();
      ctx.globalAlpha = o.grain === undefined ? 0.08 : o.grain;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tile, 0, 0, 1280, 720);
      ctx.restore();
    }
    if (this.vig) ctx.drawImage(this.vig, 0, 0);
  },
  scareFace(ctx, kind, p, reduce) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 720);
    const shake = 10 + 16 * Math.min(1, p * 3);
    const dx = (Math.random() - 0.5) * shake, dy = (Math.random() - 0.5) * shake;
    const pop = 1 + 0.3 * Math.min(1, p * 4);
    ctx.save();
    ctx.translate(640 + dx, 380 + dy); ctx.scale(pop, pop);
    if (kind === 'foreman') {
      ctx.fillStyle = '#cfc6b4';
      ctx.beginPath(); ctx.ellipse(0, 0, 150, 215, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#0a0a0c';
      ctx.beginPath(); ctx.ellipse(-56, -46, 34, 48, 0.1, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(56, -46, 34, 48, -0.1, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(60,56,48,0.7)';
      ctx.beginPath(); ctx.ellipse(-56, -40, 14, 20, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(56, -40, 14, 20, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#141210'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-84, 96); ctx.quadraticCurveTo(0, 138 + Math.sin(p * 30) * 8, 84, 96); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-120, -140); ctx.lineTo(-90, -60); ctx.lineTo(-104, -10);
      ctx.moveTo(110, -150); ctx.lineTo(88, -70);
      ctx.stroke();
    } else if (kind === 'mange') {
      ctx.fillStyle = '#0b0a12';
      ctx.beginPath();
      ctx.ellipse(0, 20, 260, 230, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(50,44,66,0.8)'; ctx.lineWidth = 5;
      for (let i = 0; i < 14; i++) {
        const a = i * 0.449 + p * 0.6;
        ctx.beginPath(); ctx.moveTo(0, 20);
        ctx.quadraticCurveTo(Math.cos(a) * 200, 20 + Math.sin(a) * 160 - 60, Math.cos(a) * 420, 20 + Math.sin(a) * 380);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const ox = (G.hash(i * 13.7 + 2) - 0.5) * 340;
        const oy = -120 + G.hash(i * 7.1) * 260;
        const r = 10 + G.hash(i * 3.3) * 26;
        ctx.fillStyle = '#d8d2c2';
        ctx.beginPath(); ctx.arc(ox, oy, r, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#0c0a10';
        ctx.beginPath(); ctx.arc(ox + Math.sin(p * 20 + i) * r * 0.25, oy, r * 0.42, 0, 6.283); ctx.fill();
      }
    } else {
      const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 460);
      g.addColorStop(0, 'rgba(255,170,70,0.85)');
      g.addColorStop(0.5, 'rgba(200,80,20,0.4)');
      g.addColorStop(1, 'rgba(60,10,0,0)');
      ctx.fillStyle = g; ctx.fillRect(-640, -380, 1280, 760);
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath(); ctx.arc(-90, -70, 46, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(90, -70, 46, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#1a0d05';
      ctx.beginPath(); ctx.arc(-90 + Math.sin(p * 26) * 8, -70, 18, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(90 + Math.sin(p * 26 + 2) * 8, -70, 18, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#120800'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(-170, 90);
      for (let i = 0; i <= 10; i++) ctx.lineTo(-170 + i * 34, 90 + (i % 2 ? 66 : -8));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,120,0.7)'; ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const a = G.hash(i * 9.1) * 6.28;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 200, Math.sin(a) * 200);
        ctx.lineTo(Math.cos(a) * (300 + p * 200), Math.sin(a) * (300 + p * 200)); ctx.stroke();
      }
    }
    ctx.restore();
    const tile = this.tiles[(Math.random() * 3) | 0];
    ctx.save();
    ctx.globalAlpha = 0.30; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, 0, 0, 1280, 720);
    ctx.restore();
    if (!reduce) {
      const seg = Math.floor(p * 16);
      if (seg % 4 === 1) {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1280, 720);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
};
