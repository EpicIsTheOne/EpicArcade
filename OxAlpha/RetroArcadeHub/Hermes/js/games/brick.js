'use strict';
/* BRICK FURY — breaker: combos, power-ups, endless levels */
RH.registerGame({
  id: 'brick',
  title: 'BRICK FURY',
  tagline: 'One ball. A thousand bricks. Keep the combo alive.',
  color: '#5dff8a',
  hint: 'ARROWS/WASD MOVE PADDLE · SPACE LAUNCH · CATCH POWER-UPS',
  controls: [['← → / A D', 'MOVE PADDLE'], ['SPACE', 'LAUNCH BALL'], ['COMBO', 'CHAIN BRICKS = MORE PTS'], ['PODS', 'WIDE·MULTI·SLOW·LIFE·PTS']],
  lives: 3,

  reset(api) {
    const s = bst;
    s.W = api.W; s.H = api.H;
    s.level = 1;
    s.combo = 0;
    s.wideT = 0; s.slowT = 0;
    s.banner = 0; s.bannerTxt = '';
    s.paddle = { x: api.W / 2, y: api.H - 46, w: 112, tw: 112 };
    s.balls = [];
    s.pods = [];
    buildLevel(s);
    respawnBall(s, true);
  },

  update(dt, api) {
    const s = bst, inp = api.input, W = s.W;

    if (s.banner > 0) {
      s.banner -= dt;
      if (s.state === 'clear') return; // freeze during level-up banner
    }

    // paddle
    const pw = s.wideT > 0 ? 168 : 112;
    s.paddle.tw = pw;
    s.paddle.w += (s.paddle.tw - s.paddle.w) * Math.min(1, dt * 10);
    const pv = 540;
    s.paddle.x = clamp(s.paddle.x + inp.axisX() * pv * dt, 34 + s.paddle.w / 2, W - 34 - s.paddle.w / 2);

    if (s.wideT > 0) s.wideT -= dt;
    if (s.slowT > 0) s.slowT -= dt;

    // stuck ball follows paddle
    for (const b of s.balls) {
      if (b.stuck) {
        b.x = s.paddle.x;
        b.y = s.paddle.y - 14;
      }
    }
    if (inp.pressed('Space')) {
      for (const b of s.balls) if (b.stuck) launch(b);
    }

    // balls
    const sdt = dt * (s.slowT > 0 ? 0.68 : 1);
    for (let bi = s.balls.length - 1; bi >= 0; bi--) {
      const b = s.balls[bi];
      if (b.stuck) continue;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 7) b.trail.shift();

      // substep to avoid tunneling
      let remain = sdt;
      while (remain > 0) {
        const spd = Math.hypot(b.vx, b.vy);
        const stepLen = Math.min(6, spd * remain);
        if (stepLen <= 0.0001) break;
        const k = stepLen / spd;
        b.x += b.vx * k; b.y += b.vy * k;
        remain -= stepLen / spd; // advance time by stepLen/speed
        // walls
        if (b.x < 38 + b.r) { b.x = 38 + b.r; b.vx = Math.abs(b.vx); api.audio.play('bounce'); }
        if (b.x > W - 38 - b.r) { b.x = W - 38 - b.r; b.vx = -Math.abs(b.vx); api.audio.play('bounce'); }
        if (b.y < 64 + b.r) { b.y = 64 + b.r; b.vy = Math.abs(b.vy); api.audio.play('bounce'); }
        // paddle
        const p = s.paddle;
        if (b.vy > 0 && b.y + b.r >= p.y && b.y + b.r <= p.y + 16 &&
            b.x > p.x - p.w / 2 - b.r && b.x < p.x + p.w / 2 + b.r) {
          b.y = p.y - b.r;
          const rel = clamp((b.x - p.x) / (p.w / 2), -1, 1);
          const ang = -Math.PI / 2 + rel * 1.08; // ±62°
          const spd2 = Math.min(580, Math.hypot(b.vx, b.vy) + 9);
          b.vx = Math.cos(ang) * spd2; b.vy = Math.sin(ang) * spd2;
          if (s.combo >= 3) api.fx.text(p.x, p.y - 26, 'COMBO ×' + s.combo, '#ffd94d', 16);
          s.combo = 0;
          api.audio.play('bounce');
        }
        // bricks
        brickCollide(s, b, api);
      }

      // lost ball
      if (b.y > s.H + 24) {
        s.balls.splice(bi, 1);
        if (s.balls.length === 0) {
          api.setLives(api.lives - 1);
          api.audio.play('hit');
          api.fx.shake(12, 0.45);
          api.fx.flash('#ff5d5d', 0.14);
          s.combo = 0;
          s.wideT = 0; s.slowT = 0;
          if (api.lives <= 0) { api.gameOver(); return; }
          respawnBall(s, true);
        }
      }
    }

    // pods
    for (let i = s.pods.length - 1; i >= 0; i--) {
      const d = s.pods[i];
      d.y += 150 * dt;
      if (d.y > s.H + 20) { s.pods.splice(i, 1); continue; }
      const p = s.paddle;
      if (d.y > p.y - 10 && d.y < p.y + 18 && Math.abs(d.x - p.x) < p.w / 2 + 14) {
        s.pods.splice(i, 1);
        applyPod(s, d.kind, api);
      }
    }
  },

  drawWorld(g, api, tSec) {
    const s = bst, W = s.W, H = s.H;

    // rails
    g.fillStyle = 'rgba(93,255,138,.16)';
    g.fillRect(30, 58, 8, H - 58);
    g.fillRect(W - 38, 58, 8, H - 58);
    g.fillRect(30, 58, W - 60, 6);

    // bricks
    for (const br of s.bricks) {
      if (!br.alive) continue;
      g.fillStyle = br.col;
      g.fillRect(br.x, br.y, br.bw, br.bh);
      if (br.maxHp > 1 && br.hp === br.maxHp) {
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(br.x + 3, br.y + 3, br.bw - 6, 4);
      }
      if (br.hp < br.maxHp) {
        g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(br.x + br.bw * 0.25, br.y); g.lineTo(br.x + br.bw * 0.45, br.y + br.bh);
        g.moveTo(br.x + br.bw * 0.7, br.y); g.lineTo(br.x + br.bw * 0.6, br.y + br.bh * 0.6);
        g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,.4)';
      g.strokeRect(br.x + 0.5, br.y + 0.5, br.bw - 1, br.bh - 1);
    }

    // pods
    for (const d of s.pods) {
      const c = POD_COL[d.kind] || '#fff';
      g.fillStyle = 'rgba(0,0,0,.6)';
      RH.roundRect(g, d.x - 15, d.y - 11, 30, 22, 5); g.fill();
      g.strokeStyle = c; g.lineWidth = 2;
      RH.roundRect(g, d.x - 15, d.y - 11, 30, 22, 5); g.stroke();
      RH.txt(g, d.kind, d.x, d.y + 1, 12, c);
    }

    // balls
    for (const b of s.balls) {
      b.trail.forEach((tp, i) => {
        g.globalAlpha = (i / b.trail.length) * 0.3;
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(tp.x, tp.y, b.r * 0.8, 0, 7); g.fill();
      });
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.4)';
      g.beginPath(); g.arc(b.x, b.y, b.r + 3, 0, 7); g.stroke();
      if (b.stuck) {
        g.setLineDash([4, 8]);
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.moveTo(b.x, b.y - 12); g.lineTo(b.x, b.y - 90); g.stroke();
        g.setLineDash([]);
      }
    }

    // paddle
    const p = s.paddle;
    const pc = s.wideT > 0 ? '#ffd94d' : '#35f0ff';
    g.fillStyle = pc;
    RH.roundRect(g, p.x - p.w / 2, p.y - 7, p.w, 14, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
    RH.roundRect(g, p.x - p.w / 2, p.y - 7, p.w, 14, 7); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(p.x - 3, p.y - 4, 6, 8);

    // status line
    if (s.combo >= 3) RH.txt(g, 'COMBO ×' + s.combo, W - 120, 58, 16, '#ffd94d', 'center', 'rgba(0,0,0,.7)');
    if (s.slowT > 0) RH.txt(g, 'SLOW', 70, 58, 13, '#b26bff', 'center', 'rgba(0,0,0,.7)');
    if (s.wideT > 0) RH.txt(g, 'WIDE', 130, 58, 13, '#ffd94d', 'center', 'rgba(0,0,0,.7)');
    RH.txt(g, 'LVL ' + s.level, 62, 28, 17, '#5dff8a', 'center', 'rgba(0,0,0,.7)');

    if (s.banner > 0) {
      g.globalAlpha = Math.min(1, s.banner);
      RH.txt(g, s.bannerTxt, W / 2, H / 2 - 40, 44, '#5dff8a', 'center', 'rgba(0,0,0,.85)');
      g.globalAlpha = 1;
    }
  },

  bg(g) {
    const s = bst;
    g.fillStyle = '#0a0722';
    g.fillRect(0, 0, s.W, s.H);
    g.strokeStyle = 'rgba(93,255,138,.05)';
    g.lineWidth = 1;
    for (let x = 0; x < s.W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s.H); g.stroke(); }
    for (let y = 0; y < s.H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(s.W, y); g.stroke(); }
  },

  testKill(api) {
    const s = bst;
    const alive = s.bricks.filter(b => b.alive);
    if (!alive.length) return false;
    const br = alive[(Math.random() * alive.length) | 0];
    hitBrick(s, br, api);
    return true;
  },
});

/* ---- module state ---- */
const bst = { W: 800, H: 600, level: 1, combo: 0, paddle: null, balls: [], bricks: [], pods: [], wideT: 0, slowT: 0, banner: 0, bannerTxt: '', state: 'fight' };
const ROW_COL = ['#ff5d5d', '#ff9e3d', '#ffe14d', '#5dff8a', '#35f0ff', '#b26bff', '#ff5dd4'];
const POD_COL = { WIDE: '#ffd94d', MULTI: '#ff5dd4', SLOW: '#b26bff', LIFE: '#ff5d7d', PTS: '#5dff8a' };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildLevel(s) {
  const rng = mulberry32(s.level * 7919 + 17);
  const cols = 11, sideM = 42, gap = 5;
  const bw = (s.W - sideM * 2 - (cols - 1) * gap) / cols;
  const bh = 22;
  const rows = 3 + Math.min(s.level, 4);
  const top = 92;
  s.bricks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.07) continue; // holes for variety
      const hpTop = Math.min(1 + Math.floor((s.level - 1) / 2), 2);
      let hp = r < hpTop ? 2 : 1;
      if (s.level >= 3 && rng() < 0.12) hp = 3;
      s.bricks.push({
        x: sideM + c * (bw + gap), y: top + r * (bh + gap),
        bw, bh, hp, maxHp: hp,
        col: ROW_COL[r % ROW_COL.length],
        alive: true,
      });
    }
  }
}

function mkBall(s) {
  return { x: s.paddle.x, y: s.paddle.y - 14, vx: 0, vy: 0, r: 7, stuck: true, trail: [] };
}
function respawnBall(s, stuck) {
  s.balls = [mkBall(s)];
  if (!stuck) launch(s.balls[0]);
}
function launch(b) {
  const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
  const spd = 330 + bst.level * 22;
  b.vx = Math.cos(ang) * spd;
  b.vy = Math.sin(ang) * spd;
  b.stuck = false;
  RH.audio.play('select');
}

function brickCollide(s, b, api) {
  for (const br of s.bricks) {
    if (!br.alive) continue;
    // circle vs rect (closest point)
    const cx = clamp(b.x, br.x, br.x + br.bw);
    const cy = clamp(b.y, br.y, br.y + br.bh);
    const dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy <= b.r * b.r) {
      // bounce axis: pick dominant penetration
      const ox = Math.min(Math.abs(b.x - br.x), Math.abs(br.x + br.bw - b.x));
      const oy = Math.min(Math.abs(b.y - br.y), Math.abs(br.y + br.bh - b.y));
      if (oy < ox) b.vy = -b.vy; else b.vx = -b.vx;
      hitBrick(s, br, api);
      break;
    }
  }
}

function hitBrick(s, br, api) {
  br.hp--;
  api.audio.play('brick');
  if (br.hp <= 0) {
    br.alive = false;
    const mult = 1 + 0.5 * Math.min(s.combo, 10);
    const pts = Math.round(50 * mult);
    api.addScore(pts);
    api.fx.text(br.x + br.bw / 2, br.y + br.bh / 2, '+' + pts, br.col, 14);
    api.fx.burst(br.x + br.bw / 2, br.y + br.bh / 2, br.col, 10, 140, 0.45, 3.5, 200);
    s.combo++;
    api.fx.shake(2.5, 0.1);
    // pod drop
    if (Math.random() < 0.13) {
      const kinds = ['WIDE', 'MULTI', 'SLOW', 'PTS', 'PTS', 'LIFE'];
      const kind = kinds[(Math.random() * kinds.length) | 0];
      s.pods.push({ x: br.x + br.bw / 2, y: br.y, kind });
    }
    // level clear?
    if (!s.bricks.some(b => b.alive)) {
      api.addScore(500);
      s.level++;
      s.bannerTxt = 'LEVEL ' + s.level;
      s.banner = 1.7;
      s.state = 'clear';
      api.audio.play('wave');
      setTimeout(() => {
        if (!RH.engine.def || RH.engine.def.id !== 'brick') return;
        if (RH.engine.phase !== 'playing' && RH.engine.phase !== 'paused') return;
        buildLevel(s);
        respawnBall(s, true);
        s.state = 'fight';
      }, 1400);
    }
  } else {
    api.addScore(10);
    api.fx.burst(br.x + br.bw / 2, br.y + br.bh / 2, br.col, 5, 100, 0.3, 3);
  }
}

function applyPod(s, kind, api) {
  api.audio.play('power');
  const p = s.paddle;
  switch (kind) {
    case 'WIDE': s.wideT = 10; api.fx.text(p.x, p.y - 30, 'WIDE!', '#ffd94d', 17); break;
    case 'SLOW': s.slowT = 8; api.fx.text(p.x, p.y - 30, 'SLOW!', '#b26bff', 17); break;
    case 'LIFE':
      api.setLives(api.lives + 1);
      api.fx.text(p.x, p.y - 30, '+1 LIFE', '#ff5d7d', 17);
      break;
    case 'PTS':
      api.addScore(250);
      api.fx.text(p.x, p.y - 30, '+250', '#5dff8a', 17);
      break;
    case 'MULTI': {
      const cur = s.balls.filter(b => !b.stuck);
      const room = 6 - s.balls.length;
      for (let i = 0; i < Math.min(cur.length, room); i++) {
        const b = cur[i];
        const spd = Math.hypot(b.vx, b.vy);
        const a = Math.atan2(b.vy, b.vx);
        for (const da of [-0.5, 0.5]) {
          if (s.balls.length >= 6) break;
          s.balls.push({ x: b.x, y: b.y, vx: Math.cos(a + da) * spd, vy: Math.sin(a + da) * spd, r: 7, stuck: false, trail: [] });
        }
      }
      api.fx.text(p.x, p.y - 30, 'MULTI!', '#ff5dd4', 17);
      break;
    }
  }
}
