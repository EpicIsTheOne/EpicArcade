// STARWEAVE — parametric anime portrait painter
// Deterministic: identical `look` params => identical painted character everywhere
// (roster card, splash, dialogue, summon reveal, HUD icon). Consistency by construction.

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// path DSL: m=move l=line q=quad c=cubic z=close
function P(ctx, segs) {
  ctx.beginPath();
  for (const s of segs) {
    switch (s[0]) {
      case 'm': ctx.moveTo(s[1], s[2]); break;
      case 'l': ctx.lineTo(s[1], s[2]); break;
      case 'q': ctx.quadraticCurveTo(s[1], s[2], s[3], s[4]); break;
      case 'c': ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]); break;
      case 'z': ctx.closePath(); break;
    }
  }
}
function fillP(ctx, segs, color) { P(ctx, segs); ctx.fillStyle = color; ctx.fill(); }

const W = 480, H = 640, CX = W / 2;

export function paintPortrait(canvas, unit, opts = {}) {
  const ctx = canvas.getContext('2d');
  const scaleX = canvas.width / W;
  const scaleY = canvas.height / H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, W, H);
  draw(ctx, unit, opts);
}

function draw(ctx, unit, opts) {
  const L = unit.look;
  const elColor = opts.elementColor || '#ffd76e';
  const splash = !!opts.splash;
  const t = opts.time || 0;

  // ---------- BACKGROUND ----------
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#171331');
  bgGrad.addColorStop(0.55, '#231d48');
  bgGrad.addColorStop(1, '#141126');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(CX, 300, 40, CX, 300, 340);
  glow.addColorStop(0, rgba(elColor, splash ? 0.45 : 0.32));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // constellation
  const dots = [[60,80],[120,50],[200,90],[300,60],[400,100],[430,180],[70,220],[40,420],[440,380],[380,520],[90,540]];
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  dots.forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(x, y, i % 3 === 0 ? 2.2 : 1.3, 0, 7); ctx.fill(); });
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  P(ctx, [['m',60,80],['l',120,50],['l',200,90],['l',300,60],['l',400,100],['l',430,180]]);
  ctx.stroke();

  if (splash) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    for (let i = -3; i <= 3; i++) {
      ctx.save();
      ctx.translate(CX, 260);
      ctx.rotate(i * 0.30 + 0.22);
      const g2 = ctx.createLinearGradient(0, -430, 0, 430);
      g2.addColorStop(0, rgba(elColor, 0));
      g2.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      g2.addColorStop(1, rgba(elColor, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(-13, -430, 24 + Math.abs(i) * 7, 860);
      ctx.restore();
    }
    ctx.restore();
    for (let i = 0; i < 20; i++) {
      const px = (i * 97 + (i % 5) * 53) % W;
      const py = (i * 61 + (i % 7) * 41) % H;
      ctx.fillStyle = rgba(i % 2 ? '#ffffff' : elColor, 0.22 + (i % 3) * 0.14);
      ctx.beginPath();
      ctx.arc(px, py, 1.2 + (i % 3), 0, 7);
      ctx.fill();
    }
  }

  backHair(ctx, L);
  accBehind(ctx, L.acc, elColor, t);

  // ---------- BODY ----------
  fillP(ctx, [['m',CX-17,330],['l',CX+17,330],['l',CX+15,396],['l',CX-15,396],['z']], shade(L.skin, -0.07));
  const torso = ctx.createLinearGradient(0, 380, 0, H);
  torso.addColorStop(0, L.out1);
  torso.addColorStop(1, shade(L.out1, -0.12));
  fillP(ctx, [
    ['m',CX-120,H],
    ['c',CX-114,450,CX-76,398,CX-38,386],
    ['l',CX+38,386],
    ['c',CX+76,398,CX+114,450,CX+120,H],
    ['z'],
  ], torso);
  // collar V
  fillP(ctx, [
    ['m',CX-38,386],['q',CX,372,CX+38,386],
    ['l',CX,468],['z'],
  ], L.out2);
  ctx.strokeStyle = rgba(L.out2, 0.9);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  P(ctx, [['m',CX-42,390],['l',CX,470],['l',CX+42,390]]);
  ctx.stroke();
  starGem(ctx, CX, 434, 9, rgba(elColor, 0.95));

  // ---------- HEAD ----------
  fillP(ctx, [
    ['m',CX-76,208],
    ['c',CX-78,156,CX-44,128,CX,128],
    ['c',CX+44,128,CX+78,156,CX+76,208],
    ['c',CX+74,258,CX+40,306,CX,318],
    ['c',CX-40,306,CX-74,258,CX-76,208],
    ['z'],
  ], L.skin);
  // cheek/side shading clipped
  ctx.save();
  P(ctx, [
    ['m',CX-76,208],
    ['c',CX-78,156,CX-44,128,CX,128],
    ['c',CX+44,128,CX+78,156,CX+76,208],
    ['c',CX+74,258,CX+40,306,CX,318],
    ['c',CX-40,306,CX-74,258,CX-76,208],
    ['z'],
  ]);
  ctx.clip();
  ctx.fillStyle = rgba(shade(L.skin, -0.18), 0.30);
  P(ctx, [['m',CX+30,140],['c',CX+86,150,CX+92,260,CX+58,308],['l',CX+90,310],['l',CX+92,140],['z']]);
  ctx.fill();
  ctx.restore();

  // ears
  ctx.fillStyle = shade(L.skin, -0.03);
  P(ctx, [['m',CX-72,222],['q',CX-84,232,CX-73,248],['z']]); ctx.fill();
  P(ctx, [['m',CX+72,222],['q',CX+84,232,CX+73,248],['z']]); ctx.fill();

  // blush
  ctx.fillStyle = 'rgba(255,120,140,0.20)';
  P(ctx, [['m',CX-62,272],['q',CX-47,282,CX-31,271],['q',CX-46,264,CX-62,272],['z']]); ctx.fill();
  P(ctx, [['m',CX+62,272],['q',CX+47,282,CX+31,271],['q',CX+46,264,CX+62,272],['z']]); ctx.fill();
  if (L.acc === 'freckles') {
    ctx.fillStyle = 'rgba(150,85,35,0.55)';
    [[-54,-8],[-44,-3],[-60,2],[54,-8],[44,-3],[60,2]].forEach(([dx,dy])=>{
      ctx.beginPath(); ctx.arc(CX+dx, 268+dy, 1.7, 0, 7); ctx.fill();
    });
  }

  // ---------- EYES ----------
  eyes(ctx, L);

  // nose + mouth
  ctx.strokeStyle = 'rgba(170,110,80,0.55)';
  ctx.lineWidth = 2.5;
  P(ctx, [['m',CX-3,283],['l',CX+2,288]]); ctx.stroke();
  const cheerful = ['spiky','pom','twintails','tuft'].includes(L.hairStyle);
  if (cheerful) {
    fillP(ctx, [['m',CX-11,299],['q',CX,312,CX+11,299],['q',CX,304,CX-11,299],['z']], 'rgba(185,65,75,0.9)');
  } else {
    ctx.strokeStyle = 'rgba(190,70,80,0.85)';
    ctx.lineWidth = 3.5;
    P(ctx, [['m',CX-10,301],['q',CX,309,CX+10,300]]);
    ctx.stroke();
  }

  frontHair(ctx, L);

  // rim light on hair edge
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,242,204,0.30)';
  ctx.lineWidth = 3.5;
  P(ctx, [['m',CX-74,212],['c',CX-78,158,CX-46,127,CX+2,126]]);
  ctx.stroke();
  ctx.restore();

  accFront(ctx, L.acc, L);

  // vignette
  const vg = ctx.createRadialGradient(CX, H * 0.45, H * 0.34, CX, H * 0.5, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,5,18,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ pieces
function starGem(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color || '#ffd76e';
  ctx.fill();
  ctx.restore();
}

function eyes(ctx, L) {
  const eyeY = 250;
  for (const s of [-1, 1]) {
    const x = CX + s * 33;
    const ew = 25, eh = 19;
    // brow
    ctx.strokeStyle = shade(L.hair, -0.30);
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    P(ctx, [['m', x - 20, eyeY - 33], ['q', x, eyeY - 43, x + 20, eyeY - 33 - s * 1]]);
    ctx.stroke();
    // white
    ctx.fillStyle = '#ffffff';
    P(ctx, [['m', x, eyeY - eh], ['c', x + ew * 0.9, eyeY - eh, x + ew, eyeY + eh * 0.6, x, eyeY + eh], ['c', x - ew, eyeY + eh * 0.6, x - ew * 0.9, eyeY - eh, x, eyeY - eh], ['z']]);
    ctx.fill();
    // iris gradient
    const ig = ctx.createLinearGradient(0, eyeY - eh, 0, eyeY + eh);
    ig.addColorStop(0, shade(L.eyes, -0.22));
    ig.addColorStop(0.55, L.eyes);
    ig.addColorStop(1, shade(L.eyes, 0.55));
    ctx.fillStyle = ig;
    P(ctx, [['m', x, eyeY + 1 - eh + 3], ['c', x + ew - 8, eyeY - eh + 3, x + ew - 6, eyeY + eh - 2, x, eyeY + eh - 2], ['c', x - ew + 6, eyeY + eh - 2, x - ew + 8, eyeY - eh + 3, x, eyeY + 1 - eh + 3], ['z']]);
    ctx.fill();
    // pupil
    ctx.fillStyle = 'rgba(18,10,26,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, eyeY + 2, ew - 15, eh - 7, 0, 0, 7);
    ctx.fill();
    // sparkles
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - 6, eyeY - 5, 4.8, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(x + 7, eyeY + 7, 2.4, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    // upper lash
    ctx.strokeStyle = '#241a2e';
    ctx.lineWidth = 5.5;
    P(ctx, [['m', x - ew - 2, eyeY - 5], ['q', x, eyeY - eh - 9, x + ew + 3, eyeY - 8]]);
    ctx.stroke();
    // wing
    ctx.lineWidth = 4;
    P(ctx, [['m', x + s * (ew + 2), eyeY - 8], ['l', x + s * (ew + 9), eyeY - 14]]);
    ctx.stroke();
    // lower lid
    ctx.strokeStyle = 'rgba(96,64,98,0.35)';
    ctx.lineWidth = 2;
    P(ctx, [['m', x - 13, eyeY + eh + 2], ['q', x, eyeY + eh + 6, x + 13, eyeY + eh + 2]]);
    ctx.stroke();
  }
}

function crownMass(ctx, c) {
  const g = ctx.createLinearGradient(0, 90, 0, 300);
  g.addColorStop(0, shade(c, 0.08));
  g.addColorStop(1, c);
  fillP(ctx, [
    ['m',CX-92,240],
    ['c',CX-100,130,CX-48,94,CX,92],
    ['c',CX+48,94,CX+100,130,CX+92,240],
    ['c',CX+80,196,CX+56,172,CX,168],
    ['c',CX-56,172,CX-80,196,CX-92,240],
    ['z'],
  ], g);
}

function shine(ctx, cy, hi) {
  ctx.strokeStyle = hi || 'rgba(255,255,255,0.55)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  P(ctx, [['m',CX-46,cy],['q',CX,cy-15,CX+44,cy]]);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  P(ctx, [['m',CX-62,cy+12],['q',CX-42,cy+4,CX-24,cy+9]]);
  ctx.stroke();
}

function backHair(ctx, L) {
  const c = L.hair;
  switch (L.hairStyle) {
    case 'bob':
      crownMass(ctx, c);
      fillP(ctx, [['m',152,180],['c',132,250,138,320,146,340],['q',156,352,166,338],['c',158,270,164,230,172,200],['z']], c);
      fillP(ctx, [['m',328,180],['c',348,250,342,320,334,340],['q',324,352,314,338],['c',322,270,316,230,308,200],['z']], c);
      break;
    case 'ponytail': {
      crownMass(ctx, c);
      const g = ctx.createLinearGradient(CX + 60, 180, CX + 160, 460);
      g.addColorStop(0, c); g.addColorStop(1, shade(c, -0.12));
      fillP(ctx, [
        ['m',CX+58,166],
        ['c',CX+150,190,CX+158,330,CX+112,452],
        ['q',CX+100,468,CX+90,450],
        ['c',CX+128,336,CX+118,240,CX+52,206],
        ['z'],
      ], g);
      break;
    }
    case 'longveil':
      crownMass(ctx, c);
      fillP(ctx, [['m',152,186],['c',124,300,132,420,142,520],['q',152,536,164,520],['c',152,420,148,300,170,208],['z']], c);
      fillP(ctx, [['m',328,186],['c',356,300,348,420,338,520],['q',328,536,316,520],['c',328,420,332,300,310,208],['z']], c);
      break;
    case 'flowing':
      crownMass(ctx, c);
      fillP(ctx, [['m',150,188],['c',116,300,126,440,138,550],['q',148,564,160,548],['c',148,430,144,300,168,206],['z']], c);
      fillP(ctx, [['m',330,188],['c',364,300,354,440,342,550],['q',332,564,320,548],['c',332,430,336,300,312,206],['z']], c);
      break;
    case 'twintails':
      crownMass(ctx, c);
      for (const s of [-1, 1]) {
        fillP(ctx, [
          ['m',CX + s*80,186],
          ['c',CX + s*136,224,CX + s*146,330,CX + s*106,428],
          ['q',CX + s*94,446,CX + s*84,428],
          ['c',CX + s*114,334,CX + s*104,252,CX + s*66,214],
          ['z'],
        ], c);
      }
      break;
    case 'undercut':
      crownMass(ctx, c);
      fillP(ctx, [
        ['m',CX-66,170],
        ['c',CX-124,220,CX-128,340,CX-96,442],
        ['q',CX-86,458,CX-76,440],
        ['c',CX-100,340,CX-92,256,CX-56,206],
        ['z'],
      ], c);
      break;
    case 'braids':
      crownMass(ctx, c);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? shade(c, -0.05) : c;
          ctx.beginPath();
          ctx.ellipse(CX + s * (82 - i * 5), 252 + i * 36, 15 - i * 1.5, 19, s * 0.14, 0, 7);
          ctx.fill();
        }
      }
      break;
    default: // pom, spiky, buzz, tuft
      crownMass(ctx, c);
  }
}

function frontHair(ctx, L) {
  const c = L.hair;
  const hi = L.hi && L.hi !== c ? L.hi : null;
  switch (L.hairStyle) {
    case 'bob':
      fillP(ctx, [
        ['m',148,238],['c',140,136,192,100,240,98],['c',288,100,340,136,332,238],
        ['l',320,196],['l',298,178],['l',280,198],['l',262,176],['l',242,198],
        ['l',220,176],['l',202,198],['l',182,178],['l',162,196],['z'],
      ], c);
      shine(ctx, 134, hi);
      break;
    case 'ponytail':
      fillP(ctx, [
        ['m',148,238],['c',140,132,192,96,240,94],['c',290,96,342,132,332,238],
        ['l',322,192],['l',298,170],['l',276,192],['l',252,166],['l',228,192],
        ['l',204,168],['l',182,192],['l',162,194],['z'],
      ], c);
      fillP(ctx, [['m',152,200],['c',142,266,150,310,162,348],['q',172,360,178,344],['c',166,300,164,250,174,208],['z']], c);
      shine(ctx, 128, hi);
      break;
    case 'longveil':
      fillP(ctx, [
        ['m',148,240],['c',142,130,192,94,240,92],['c',290,94,340,130,332,240],
        ['l',324,188],['l',280,164],['q',240,180,200,164],['l',156,188],['z'],
      ], c);
      fillP(ctx, [['m',150,192],['c',138,280,146,340,158,396],['q',168,410,176,392],['c',162,330,158,260,170,206],['z']], c);
      fillP(ctx, [['m',330,192],['c',342,280,334,340,322,396],['q',312,410,304,392],['c',318,330,322,260,310,206],['z']], c);
      shine(ctx, 126, hi);
      break;
    case 'flowing':
      fillP(ctx, [
        ['m',148,238],['c',140,134,192,98,240,96],['c',290,98,342,134,332,238],
        ['l',318,190],['l',294,172],['l',272,194],['l',248,170],['l',226,194],
        ['l',202,172],['l',180,196],['l',162,192],['z'],
      ], c);
      shine(ctx, 130, hi);
      break;
    case 'twintails':
      fillP(ctx, [
        ['m',150,232],['c',142,132,192,96,240,94],['c',290,96,340,132,330,232],
        ['l',320,188],['l',296,170],['l',272,190],['l',248,168],['l',226,190],
        ['l',202,170],['l',180,190],['l',160,188],['z'],
      ], c);
      shine(ctx, 128, hi);
      break;
    case 'undercut':
      fillP(ctx, [
        ['m',148,232],['c',142,130,192,94,240,92],['c',294,94,344,132,332,226],
        ['c',312,184,270,158,210,196],['c',176,216,160,222,154,232],['z'],
      ], c);
      shine(ctx, 122, hi);
      break;
    case 'braids':
      fillP(ctx, [
        ['m',150,234],['c',142,134,192,98,240,96],['c',290,98,340,134,330,234],
        ['l',318,190],['l',290,172],['l',266,192],['l',240,172],['l',214,192],
        ['l',190,172],['l',162,190],['z'],
      ], c);
      shine(ctx, 130, hi);
      break;
    case 'spiky':
      fillP(ctx, [
        ['m',148,230],['c',144,148,166,116,188,110],
        ['l',196,78],['q',214,108,226,80],['q',240,110,254,82],
        ['q',266,112,286,84],['q',294,116,314,112],
        ['c',330,120,338,160,332,230],
        ['l',314,184],['l',282,168],['l',252,188],['l',222,166],['l',192,188],['l',162,182],['z'],
      ], c);
      shine(ctx, 120, hi);
      break;
    case 'pom':
      fillP(ctx, [
        ['m',156,224],['c',150,138,192,92,240,90],['c',290,92,332,138,324,224],
        ['l',306,184],['l',284,200],['l',260,178],['l',236,202],['l',212,178],['l',188,200],['l',168,184],['z'],
      ], c);
      shine(ctx, 120, hi);
      break;
    case 'buzz':
      fillP(ctx, [
        ['m',152,222],['c',146,140,192,102,240,100],['c',290,102,336,140,328,222],
        ['l',310,184],['q',240,164,170,184],['z'],
      ], shade(c, -0.04));
      shine(ctx, 126, hi);
      break;
    case 'tuft':
      fillP(ctx, [
        ['m',154,228],['c',148,138,192,98,240,96],['c',290,98,334,138,326,228],
        ['l',304,184],['l',278,198],['l',252,176],['l',226,198],['l',200,180],['l',174,196],['z'],
      ], c);
      // candle flame
      const fg = ctx.createLinearGradient(0, 30, 0, 108);
      fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.5, hi || '#fff3d6'); fg.addColorStop(1, 'rgba(255,215,110,0)');
      fillP(ctx, [['m',CX-16,106],['q',CX-22,58,CX,30],['q',CX+22,58,CX+16,106],['q',CX,96,CX-16,106],['z']], fg);
      shine(ctx, 124, hi);
      break;
    default:
      fillP(ctx, [
        ['m',150,234],['c',142,132,192,96,240,94],['c',290,96,340,132,330,234],
        ['l',316,188],['l',288,170],['l',262,192],['l',236,170],['l',210,192],['l',184,172],['l',162,190],['z'],
      ], c);
      shine(ctx, 130, hi);
  }
}

function accBehind(ctx, acc, elColor, t) {
  if (acc === 'sunhalo') {
    ctx.save();
    ctx.translate(CX, 208);
    const g = ctx.createLinearGradient(-120, 0, 120, 0);
    g.addColorStop(0, '#ffb84d'); g.addColorStop(0.5, '#ffe6a8'); g.addColorStop(1, '#ff9a3c');
    ctx.strokeStyle = g; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(0, 0, 118, 42, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.ellipse(0, 0, 118, 42, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + t * 0.0004;
      starGem(ctx, Math.cos(a) * 118, Math.sin(a) * 42, i % 2 ? 4 : 6);
    }
    ctx.restore();
  }
  if (acc === 'mothveil') {
    for (let i = 0; i < 3; i++) {
      const a = t * 0.0006 + i * 2.09;
      mothGlyph(ctx, CX + Math.cos(a) * 152, 240 + Math.sin(a) * 64, 11, elColor);
    }
  }
  if (acc === 'lantern') {
    ctx.save();
    ctx.translate(CX + 120, 428);
    ctx.rotate(0.08);
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 4;
    P(ctx, [['m',-14,-34],['q',0,-48,14,-34]]);
    ctx.stroke();
    fillP(ctx, [['m',-20,-36],['l',20,-36],['l',17,-26],['l',-17,-26],['z']], '#5a4a2e');
    const lg = ctx.createRadialGradient(0, 4, 4, 0, 4, 44);
    lg.addColorStop(0, 'rgba(255,240,190,0.95)');
    lg.addColorStop(1, 'rgba(255,215,110,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-46, -36, 92, 88);
    fillP(ctx, [['m',-16,-26],['l',16,-26],['l',16,20],['l',-16,20],['z']], '#fff3cf');
    fillP(ctx, [['m',-20,20],['l',20,20],['l',17,30],['l',-17,30],['z']], '#5a4a2e');
    ctx.restore();
  }
}

function mothGlyph(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = rgba(color, 0.8);
  ctx.beginPath();
  ctx.ellipse(-s * 0.7, 0, s * 0.85, s * 0.5, -0.5, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.7, 0, s * 0.85, s * 0.5, 0.5, 0, 7);
  ctx.fill();
  ctx.fillStyle = rgba(color, 0.95);
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.22, s * 0.75, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = rgba(color, 0.95); ctx.lineWidth = 1.6;
  P(ctx, [['m',-s*0.1,-s*0.6],['l',-s*0.4,-s*1.2],['m',s*0.1,-s*0.6],['l',s*0.4,-s*1.2]]);
  ctx.stroke();
  ctx.restore();
}

function accFront(ctx, acc, L) {
  switch (acc) {
    case 'sunhalo':
      fillP(ctx, [
        ['m',CX-22,116],['q',CX,132,CX+22,114],
        ['q',CX+30,128,CX+18,136],['q',CX,146,CX-16,134],['z'],
      ], '#c93b52');
      break;
    case 'mothveil':
      for (const s of [-1, 1]) {
        ctx.strokeStyle = '#e6d7ff'; ctx.lineWidth = 3;
        P(ctx, [['m',CX+s*30,116],['q',CX+s*46,84,CX+s*60,72]]);
        ctx.stroke();
        ctx.fillStyle = '#b06cff';
        ctx.beginPath(); ctx.arc(CX + s * 60, 72, 4.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = 'rgba(176,108,255,0.14)';
      P(ctx, [['m',CX-92,208],['q',CX,148,CX+92,208],['q',CX,190,CX-92,208],['z']]);
      ctx.fill();
      break;
    case 'headband':
      fillP(ctx, [
        ['m',CX-88,168],['q',CX,126,CX+88,168],['l',CX+83,187],['q',CX,147,CX-83,187],['z'],
      ], '#ece6ee');
      starGem(ctx, CX + 62, 163, 7, '#c93b1e');
      break;
    case 'leafpin':
      ctx.fillStyle = '#6ee7b7';
      for (const [dx, dy, rot] of [[-64, 150, -0.6], [-47, 141, -0.15]]) {
        ctx.save();
        ctx.translate(CX + dx, dy);
        ctx.rotate(rot);
        P(ctx, [['m',0,0],['q',14,-11,27,0],['q',14,11,0,0],['z']]);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'pearlpin':
      for (const [dx, dy] of [[-58, 146], [-43, 137], [-29, 143]]) {
        const pg = ctx.createRadialGradient(CX + dx - 2, dy - 2, 1, CX + dx, dy, 7);
        pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#b9d8f5');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(CX + dx, dy, 6, 0, 7); ctx.fill();
      }
      break;
    case 'goggles':
      fillP(ctx, [['m',CX-66,126],['l',CX+66,126],['q',CX+78,145,CX+66,162],['l',CX-66,162],['q',CX-78,145,CX-66,126],['z']], '#3a3a44');
      for (const dx of [-32, 32]) {
        ctx.fillStyle = 'rgba(255,215,110,0.75)';
        ctx.beginPath(); ctx.arc(CX + dx, 144, 12, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(CX + dx, 144, 12, 0, 7); ctx.stroke();
      }
      break;
    case 'helmlamp':
      fillP(ctx, [
        ['m',CX-88,172],['q',CX,104,CX+88,172],['l',CX+81,192],['q',CX,128,CX-81,192],['z'],
      ], '#6f6a63');
      ctx.fillStyle = '#ffe6a8';
      ctx.beginPath(); ctx.arc(CX, 128, 9, 0, 7); ctx.fill();
      break;
    case 'earthread':
      for (const s of [-1, 1]) {
        ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 2;
        P(ctx, [['m',CX+s*74,238],['q',CX+s*81,258,CX+s*73,274]]);
        ctx.stroke();
        ctx.fillStyle = '#ffe6a8';
        ctx.beginPath(); ctx.arc(CX + s * 73, 277, 3.4, 0, 7); ctx.fill();
      }
      break;
  }
}
