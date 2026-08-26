'use strict';
/* NOVA PATROL — fixed-shooter: waves of alien grunts, divers, spread power-up */
RH.registerGame({
  id: 'nova',
  title: 'NOVA PATROL',
  tagline: 'Hold the line, cadet. The swarm keeps coming.',
  color: '#35f0ff',
  hint: 'ARROWS/WASD MOVE · SPACE FIRE (HOLD OK) · 3 LIVES',
  controls: [['← → ↑ ↓ / WASD', 'MOVE SHIP'], ['SPACE', 'FIRE (HOLD FOR AUTO)'], ['CATCH S', 'SPREAD SHOT']],
  lives: 3,

  reset(api) {
    const W = api.W, H = api.H;
    st.W = W; st.H = H;
    st.ship = { x: W / 2, y: H - 70, cool: 0, inv: 2 };
    st.bullets = []; st.ebullets = []; st.enemies = []; st.drops = [];
    st.wave = 0; st.state = 'cool'; st.coolT = 0.8;
    st.banner = 0; st.bannerTxt = '';
    st.spreadT = 0; st.fireT = 2.2; st.diveT = 3.5;
    if (!st.stars) {
      st.stars = [];
      for (let i = 0; i < 90; i++) st.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.25 + Math.random() * 0.75 });
    }
  },

  update(dt, api) {
    const s = st, inp = api.input, W = s.W, H = s.H;

    // player move
    const ax = inp.axisX(), ay = inp.axisY();
    const sp = 350;
    s.ship.x = clamp(s.ship.x + ax * sp * dt, 24, W - 24);
    s.ship.y = clamp(s.ship.y + ay * sp * dt, H * 0.45, H - 30);
    if (s.ship.inv > 0) s.ship.inv -= dt;
    if (s.spreadT > 0) s.spreadT -= dt;

    // shoot
    s.ship.cool -= dt;
    const firing = inp.actionDown();
    if (firing && s.ship.cool <= 0 && s.state === 'fight') {
      s.ship.cool = s.spreadT > 0 ? 0.11 : 0.17;
      api.audio.play(s.spreadT > 0 ? 'spread' : 'shoot');
      if (s.spreadT > 0) {
        for (const a of [-0.24, 0, 0.24]) {
          s.bullets.push({ x: s.ship.x, y: s.ship.y - 14, vx: Math.sin(a) * 540, vy: -Math.cos(a) * 540 });
        }
      } else {
        s.bullets.push({ x: s.ship.x, y: s.ship.y - 14, vx: 0, vy: -540 });
      }
    }

    // bullets
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > W + 20) s.bullets.splice(i, 1);
    }

    // wave flow
    if (s.state === 'fight' && s.enemies.length === 0) {
      const bonus = 500 + s.wave * 100;
      api.addScore(bonus);
      api.fx.text(W / 2, H / 2 - 40, 'WAVE CLEAR +' + bonus, '#ffd94d', 26);
      s.state = 'cool'; s.coolT = 1.6;
      api.audio.play('wave');
    } else if (s.state === 'cool') {
      s.coolT -= dt;
      if (s.coolT <= 0) spawnWave(api);
    }

    // enemies
    const descend = 4 + s.wave * 0.8;
    s.diveT -= dt;
    const diveEvery = Math.max(1.4, 4.2 - s.wave * 0.3);
    if (s.diveT <= 0 && s.state === 'fight') {
      s.diveT = diveEvery * (0.6 + Math.random() * 0.8);
      const pool = s.enemies.filter(e => !e.dive && e.y > 0);
      if (pool.length) {
        const e = pool[(Math.random() * pool.length) | 0];
        e.dive = true;
        const a = Math.atan2(s.ship.y - e.y, s.ship.x - e.x);
        e.vx = Math.cos(a); e.vy = Math.sin(a);
        e.spd = Math.min(400, 230 + s.wave * 12);
      }
    }

    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      e.t += dt;
      if (!e.dive) {
        if (e.y < e.ty) { e.y += 130 * dt; }
        else { e.ty = Math.min(H - 250, e.ty + descend * dt); }
        e.x = e.baseX + Math.sin(e.t * 1.4 + e.ph) * 26;
      } else {
        // steer gently toward ship while diving
        const want = Math.atan2(s.ship.y - e.y, s.ship.x - e.x);
        let cur = Math.atan2(e.vy, e.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        cur += clamp(d, -1.7 * dt, 1.7 * dt);
        e.vx = Math.cos(cur); e.vy = Math.sin(cur);
        e.x += e.vx * e.spd * dt;
        e.y += e.vy * e.spd * dt;
        if (Math.random() < dt * 18) api.fx.burst(e.x, e.y, '#b26bff', 1, 30, 0.3, 3);
        if (e.y > H + 40 || e.x < -40 || e.x > W + 40) { s.enemies.splice(i, 1); continue; }
      }

      // enemy vs player
      const rr = e.dive ? 20 : 16;
      if (s.ship.inv <= 0 && dist2(e.x, e.y, s.ship.x, s.ship.y) < rr * rr) {
        killEnemy(i, api, false);
        hurtPlayer(api);
        continue;
      }
    }

    // enemy fire
    s.fireT -= dt;
    if (s.fireT <= 0 && s.state === 'fight') {
      s.fireT = Math.max(0.42, 1.5 - s.wave * 0.09) * (0.6 + Math.random() * 0.8);
      const shooters = s.enemies.filter(e => !e.dive && e.y > 20);
      if (shooters.length && s.ebullets.length < 60) {
        const e = shooters[(Math.random() * shooters.length) | 0];
        const a = Math.atan2(s.ship.y - e.y, s.ship.x - e.x) + (Math.random() - 0.5) * 0.28;
        const spd = Math.min(340, 190 + s.wave * 14);
        s.ebullets.push({ x: e.x, y: e.y + 10, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd });
      }
    }
    for (let i = s.ebullets.length - 1; i >= 0; i--) {
      const b = s.ebullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 20 || b.x < -20 || b.x > W + 20) { s.ebullets.splice(i, 1); continue; }
      if (s.ship.inv <= 0 && dist2(b.x, b.y, s.ship.x, s.ship.y) < 13 * 13) {
        s.ebullets.splice(i, 1);
        hurtPlayer(api);
      }
    }

    // player bullets vs enemies
    outer:
    for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
      const b = s.bullets[bi];
      for (let ei = s.enemies.length - 1; ei >= 0; ei--) {
        const e = s.enemies[ei];
        const r = e.tank ? 19 : 15;
        if (dist2(b.x, b.y, e.x, e.y) < r * r) {
          s.bullets.splice(bi, 1);
          e.hp--;
          if (e.hp <= 0) killEnemy(ei, api, true);
          else {
            api.audio.play('bounce');
            api.fx.burst(b.x, b.y, '#ffd94d', 4, 100, 0.3, 3);
            api.addScore(25);
          }
          continue outer;
        }
      }
    }

    // drops
    for (let i = s.drops.length - 1; i >= 0; i--) {
      const d = s.drops[i];
      d.y += 130 * dt;
      d.t += dt;
      if (d.y > H + 20) { s.drops.splice(i, 1); continue; }
      if (dist2(d.x, d.y, s.ship.x, s.ship.y) < 26 * 26) {
        s.drops.splice(i, 1);
        if (d.kind === 'S') { s.spreadT = 9; api.fx.text(d.x, d.y, 'SPREAD!', '#ffb347', 18); }
        else { api.setLives(api.lives + 1); api.fx.text(d.x, d.y, '+1 LIFE', '#ff5d7d', 18); }
        api.audio.play('power');
      }
    }

    if (s.banner > 0) s.banner -= dt;
  },

  drawWorld(g, api, tSec) {
    const s = st, W = s.W;
    // stars twinkle handled in bg; draw game objects

    // drops
    for (const d of s.drops) {
      const c = d.kind === 'S' ? '#ffb347' : '#ff5d7d';
      g.fillStyle = 'rgba(0,0,0,.6)';
      RH.roundRect(g, d.x - 12, d.y - 12, 24, 24, 5); g.fill();
      g.strokeStyle = c; g.lineWidth = 2;
      RH.roundRect(g, d.x - 12, d.y - 12, 24, 24, 5); g.stroke();
      RH.txt(g, d.kind === 'S' ? 'S' : '♥', d.x, d.y + 1, 14, c);
    }

    // enemies
    for (const e of s.enemies) {
      g.save();
      g.translate(e.x, e.y);
      if (e.dive) g.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2);
      if (e.tank) {
        g.fillStyle = '#e33df0';
        hex(g, 0, 0, 19);
        g.fill();
        g.strokeStyle = '#ffa8f5'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#7a1080';
        g.fillRect(-9, -4, 18, 8);
      } else {
        g.fillStyle = '#b26bff';
        g.beginPath();
        g.moveTo(0, -13); g.lineTo(-14, 4); g.lineTo(-7, 12); g.lineTo(7, 12); g.lineTo(14, 4);
        g.closePath(); g.fill();
        g.strokeStyle = '#5a1fa0'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#fff';
        g.fillRect(-6, 0, 4, 4); g.fillRect(3, 0, 4, 4);
      }
      if (e.hp > 1) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(-4, -16, 8, 4); }
      g.restore();
    }

    // player bullets
    g.fillStyle = '#35f0ff';
    for (const b of s.bullets) g.fillRect(b.x - 2, b.y - 7, 4, 14);

    // enemy bullets
    for (const b of s.ebullets) {
      g.fillStyle = '#ff3df5';
      g.beginPath(); g.arc(b.x, b.y, 4.5, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,61,245,.25)';
      g.beginPath(); g.arc(b.x, b.y, 8, 0, 7); g.fill();
    }

    // ship
    const sh = s.ship;
    const blink = sh.inv > 0 && Math.floor(sh.inv * 10) % 2 === 0;
    if (!blink) {
      g.save();
      g.translate(sh.x, sh.y);
      // flame
      const fl = 10 + Math.sin(tSec * 34) * 5;
      g.fillStyle = '#ffd94d';
      g.beginPath(); g.moveTo(-5, 14); g.lineTo(0, 14 + fl); g.lineTo(5, 14); g.closePath(); g.fill();
      // body
      g.fillStyle = '#35f0ff';
      g.beginPath(); g.moveTo(0, -18); g.lineTo(-13, 14); g.lineTo(-5, 10); g.lineTo(0, 14); g.lineTo(5, 10); g.lineTo(13, 14);
      g.closePath(); g.fill();
      g.strokeStyle = '#056a80'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, -4, 3.4, 0, 7); g.fill();
      if (st.spreadT > 0) {
        g.fillStyle = '#ffb347';
        g.fillRect(-17, 4, 5, 8); g.fillRect(12, 4, 5, 8);
      }
      g.restore();
      if (sh.inv > 0) {
        g.strokeStyle = 'rgba(53,240,255,.4)';
        g.lineWidth = 2;
        g.beginPath(); g.arc(sh.x, sh.y, 22, 0, 7); g.stroke();
      }
    }

    // banner
    if (st.banner > 0) {
      g.globalAlpha = Math.min(1, st.banner);
      RH.txt(g, st.bannerTxt, W / 2, 170, 44, '#35f0ff', 'center', 'rgba(0,0,0,.85)');
      g.globalAlpha = 1;
    }
  },

  bg(g, tSec) {
    const s = st;
    const grd = g.createLinearGradient(0, 0, 0, s.H);
    grd.addColorStop(0, '#070318'); grd.addColorStop(1, '#150a3a');
    g.fillStyle = grd;
    g.fillRect(0, 0, s.W, s.H);
    for (const p of s.stars) {
      const yy = (p.y + tSec * 26 * p.z) % s.H;
      g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(tSec * 2 + p.x));
      g.fillStyle = '#cfe6ff';
      g.fillRect(p.x, yy, p.z > 0.75 ? 2 : 1, p.z > 0.75 ? 2 : 1);
    }
    g.globalAlpha = 1;
  },

  /* E2E helper: deterministically destroy nearest enemy */
  testKill(api) {
    const s = st;
    if (!s.enemies.length) return false;
    let best = 0, bd = 1e12;
    s.enemies.forEach((e, i) => { const d = dist2(e.x, e.y, s.ship.x, s.ship.y); if (d < bd) { bd = d; best = i; } });
    killEnemy(best, api, true);
    return true;
  },
});

/* ---- module state ---- */
const st = {
  W: 800, H: 600, stars: null,
  ship: null, bullets: [], ebullets: [], enemies: [], drops: [],
  wave: 0, state: 'cool', coolT: 0,
  banner: 0, bannerTxt: '', spreadT: 0, fireT: 2, diveT: 3,
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; }

function hex(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

function spawnWave(api) {
  const s = st;
  s.wave++;
  s.state = 'fight';
  s.bannerTxt = 'WAVE ' + s.wave;
  s.banner = 1.6;
  api.audio.play('wave');
  const rows = Math.min(2 + Math.ceil(s.wave / 2), 5);
  const cols = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tank = r === 0 && s.wave >= 2;
      s.enemies.push({
        baseX: 92 + c * ((s.W - 184) / (cols - 1)),
        x: 92 + c * ((s.W - 184) / (cols - 1)),
        y: -46 - r * 48,
        ty: 74 + r * 48,
        hp: tank ? 2 : 1,
        tank,
        ph: Math.random() * 6.28,
        t: Math.random() * 2,
        dive: false, vx: 0, vy: 0, spd: 0,
      });
    }
  }
}

function killEnemy(i, api, withScore) {
  const s = st, e = s.enemies[i];
  s.enemies.splice(i, 1);
  api.fx.burst(e.x, e.y, e.tank ? '#ff3df5' : '#b26bff', e.tank ? 26 : 16, 200, 0.55, 4, 120);
  api.audio.play('boom');
  if (withScore) {
    const pts = e.dive ? 200 : e.tank ? 250 : 100;
    api.addScore(pts);
    api.fx.text(e.x, e.y - 10, '+' + pts, '#fff', 14);
    const roll = Math.random();
    if (roll < 0.07) s.drops.push({ x: e.x, y: e.y, kind: 'S', t: 0 });
    else if (roll < 0.085) s.drops.push({ x: e.x, y: e.y, kind: 'L', t: 0 });
  }
}

function hurtPlayer(api) {
  const s = st, sh = s.ship;
  api.setLives(api.lives - 1);
  api.audio.play('hit');
  api.fx.shake(14, 0.5);
  api.fx.flash('#ff3df5', 0.16);
  api.fx.burst(sh.x, sh.y, '#35f0ff', 30, 260, 0.7, 4);
  sh.inv = 2;
  // clear nearby enemy bullets as mercy window
  s.ebullets = s.ebullets.filter(b => dist2(b.x, b.y, sh.x, sh.y) > 160 * 160);
  if (api.lives <= 0) {
    api.audio.play('bigboom');
    api.fx.burst(sh.x, sh.y, '#ff3df5', 36, 320, 0.9, 5);
    api.gameOver();
  }
}
