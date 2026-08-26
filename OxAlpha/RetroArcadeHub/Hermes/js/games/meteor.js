'use strict';
/* METEOR RUN — pure dodger: weave through an asteroid storm, near-misses pay */
RH.registerGame({
  id: 'meteor',
  title: 'METEOR RUN',
  tagline: 'No guns. Just you and the rocks.',
  color: '#ffb347',
  hint: 'ARROWS/WASD FLY · SURVIVE · NEAR-MISSES PAY BONUS',
  controls: [['← → ↑ ↓ / WASD', 'FLY SHIP'], ['SURVIVE', 'SCORE TICKS UP'], ['GRAZE ROCKS', 'NEAR-MISS BONUS'], ['SHIELD POD', 'ABSORBS ONE HIT']],
  lives: 1,

  reset(api) {
    const s = mst;
    s.W = api.W; s.H = api.H;
    s.ship = { x: api.W / 2, y: api.H - 120, vx: 0, vy: 0 };
    s.meteors = []; s.pods = [];
    s.elapsed = 0; s.spawnT = 0.6; s.podT = 12;
    s.mult = 1; s.acc = 0; s.hasShield = false;
    if (!s.stars) {
      s.stars = [];
      for (let i = 0; i < 110; i++) s.stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 });
    }
  },

  update(dt, api) {
    const s = mst, inp = api.input, W = s.W, H = s.H;
    s.elapsed += dt;

    // multiplier grows over time
    s.mult = Math.min(5, 1 + Math.floor(s.elapsed / 12) * 0.5);

    // score ticks
    s.acc += 12 * s.mult * dt;
    while (s.acc >= 1) { api.addScore(1); s.acc--; }

    // ship physics (accel + drag)
    const AC = 1500;
    s.ship.vx += inp.axisX() * AC * dt;
    s.ship.vy += inp.axisY() * AC * dt;
    const drag = Math.exp(-6 * dt);
    s.ship.vx *= drag; s.ship.vy *= drag;
    s.ship.x = clamp(s.ship.x + s.ship.vx * dt, 18, W - 18);
    s.ship.y = clamp(s.ship.y + s.ship.vy * dt, 60, H - 18);

    // spawning
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      s.spawnT = Math.max(0.26, 0.95 - s.elapsed * 0.0085) * (0.65 + Math.random() * 0.7);
      if (s.meteors.length < 26) spawnMeteor(s, W);
    }
    s.podT -= dt;
    if (s.podT <= 0) {
      s.podT = 13 + Math.random() * 6;
      if (!s.hasShield && s.pods.length < 1)
        s.pods.push({ x: 40 + Math.random() * (W - 80), y: -20, t: 0 });
    }

    // meteors
    const speedScale = Math.min(2.3, 1 + s.elapsed * 0.013);
    for (let i = s.meteors.length - 1; i >= 0; i--) {
      const m = s.meteors[i];
      const py = m.y;
      m.x += m.vx * speedScale * dt;
      m.y += m.vy * speedScale * dt;
      m.rot += m.vr * dt;
      if (m.x < m.r || m.x > W - m.r) m.vx *= -1;

      // near-miss tracking while vertically close to the ship
      if (Math.abs(m.y - s.ship.y) < 56) {
        const d = Math.sqrt(dist2(m.x, m.y, s.ship.x, s.ship.y)) - m.r;
        if (m.minD === undefined || d < m.minD) m.minD = d;
      }
      if (m.y > s.ship.y && py <= s.ship.y && !m.nmDone) {
        m.nmDone = true;
        if (m.minD !== undefined && m.minD < 38 && m.minD > -6) {
          const bonus = Math.round(30 * s.mult);
          api.addScore(bonus);
          api.audio.play('near');
          api.fx.text(s.ship.x, s.ship.y - 30, 'NEAR MISS +' + bonus, '#7dff3d', 17);
          api.fx.shake(3, 0.12);
        }
      }

      if (m.y > H + m.r + 30) { s.meteors.splice(i, 1); continue; }

      // collision
      if (dist2(m.x, m.y, s.ship.x, s.ship.y) < Math.pow(m.r * 0.82 + 12, 2)) {
        if (s.hasShield) {
          s.hasShield = false;
          s.meteors.splice(i, 1);
          api.audio.play('boom');
          api.fx.burst(m.x, m.y, '#35f0ff', 24, 220, 0.6, 4);
          api.fx.text(s.ship.x, s.ship.y - 34, 'SHIELD DOWN', '#35f0ff', 16);
          api.fx.shake(9, 0.3);
          api.setLives(1); // still one life, shield ate the hit
        } else {
          api.audio.play('bigboom');
          api.fx.burst(s.ship.x, s.ship.y, '#ffb347', 40, 320, 0.9, 5);
          api.fx.burst(s.ship.x, s.ship.y, '#ff5d5d', 30, 220, 0.8, 4);
          api.fx.shake(18, 0.6);
          api.fx.flash('#ff8c42', 0.2);
          api.gameOver();
          return;
        }
      }
    }

    // shield pods
    for (let i = s.pods.length - 1; i >= 0; i--) {
      const p = s.pods[i];
      p.y += 105 * dt; p.t += dt;
      if (p.y > H + 20) { s.pods.splice(i, 1); continue; }
      if (dist2(p.x, p.y, s.ship.x, s.ship.y) < 26 * 26) {
        s.pods.splice(i, 1);
        s.hasShield = true;
        api.audio.play('power');
        api.fx.text(p.x, p.y, 'SHIELD UP', '#35f0ff', 17);
      }
    }
  },

  drawWorld(g, api, tSec) {
    const s = mst;

    // pods
    for (const p of s.pods) {
      const bob = Math.sin(p.t * 6) * 3;
      g.fillStyle = 'rgba(0,0,0,.55)';
      RH.roundRect(g, p.x - 12, p.y - 12 + bob, 24, 24, 6); g.fill();
      g.strokeStyle = '#35f0ff'; g.lineWidth = 2;
      RH.roundRect(g, p.x - 12, p.y - 12 + bob, 24, 24, 6); g.stroke();
      RH.txt(g, '◈', p.x, p.y + bob + 1, 15, '#35f0ff');
    }

    // meteors
    for (const m of s.meteors) {
      g.save();
      g.translate(m.x, m.y);
      g.rotate(m.rot);
      g.beginPath();
      for (let k = 0; k < m.pts.length; k++) {
        const p = m.pts[k];
        const px = Math.cos(p.a) * m.r * p.rr, py = Math.sin(p.a) * m.r * p.rr;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = m.hot ? '#8a5230' : '#6e4326';
      g.fill();
      g.strokeStyle = '#ffb347'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = 'rgba(255,179,71,.5)';
      g.beginPath(); g.arc(m.r * 0.2, -m.r * 0.15, m.r * 0.22, 0, 7); g.fill();
      g.restore();
      // heat trail
      g.globalAlpha = 0.14;
      g.strokeStyle = '#ff8c42'; g.lineWidth = m.r * 0.8;
      g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x - m.vx * 6, m.y - m.vy * 6); g.stroke();
      g.globalAlpha = 1;
    }

    // ship
    const sh = s.ship;
    g.save();
    g.translate(sh.x, sh.y);
    const tilt = clamp(sh.vx / 420, -0.45, 0.45);
    g.rotate(tilt);
    const fl = 9 + Math.sin(tSec * 36) * 4;
    g.fillStyle = '#ffcf5d';
    g.beginPath(); g.moveTo(-4, 13); g.lineTo(0, 13 + fl); g.lineTo(4, 13); g.closePath(); g.fill();
    g.fillStyle = '#f2f4ff';
    g.beginPath(); g.moveTo(0, -16); g.lineTo(-11, 13); g.lineTo(0, 8); g.lineTo(11, 13);
    g.closePath(); g.fill();
    g.strokeStyle = '#5a608a'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#35f0ff';
    g.beginPath(); g.arc(0, -3, 3, 0, 7); g.fill();
    g.restore();

    if (s.hasShield) {
      const pulse = 21 + Math.sin(tSec * 8) * 2.5;
      g.strokeStyle = 'rgba(53,240,255,.85)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(sh.x, sh.y, pulse, 0, 7); g.stroke();
      g.fillStyle = 'rgba(53,240,255,.09)';
      g.beginPath(); g.arc(sh.x, sh.y, pulse, 0, 7); g.fill();
    }

    // mult badge
    RH.txt(g, 'MULT ×' + s.mult.toFixed(1), s.W / 2, 58, 17, s.mult > 1 ? '#7dff3d' : '#9a93d6', 'center', 'rgba(0,0,0,.7)');
  },

  bg(g, tSec) {
    const s = mst, W = s.W, H = s.H;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#12051c'); grd.addColorStop(0.55, '#2a0f14'); grd.addColorStop(1, '#571e07');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (const p of s.stars) {
      g.globalAlpha = 0.25 + 0.6 * p.z;
      g.fillStyle = '#ffe9c9';
      const yy = (p.y * H + tSec * 14 * p.z) % H;
      g.fillRect(p.x * W, yy, p.z > 0.8 ? 2 : 1, p.z > 0.8 ? 2 : 1);
    }
    g.globalAlpha = 1;
  },
});

/* ---- module state ---- */
const mst = { W: 800, H: 600, ship: null, meteors: [], pods: [], stars: null, elapsed: 0, spawnT: 0, podT: 12, mult: 1, acc: 0, hasShield: false };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; }

function spawnMeteor(s, W) {
  const r = 12 + Math.random() * 24;
  const pts = [];
  const n = 7 + ((Math.random() * 4) | 0);
  for (let k = 0; k < n; k++) pts.push({ a: (k / n) * Math.PI * 2, rr: 0.72 + Math.random() * 0.4 });
  s.meteors.push({
    x: r + Math.random() * (W - r * 2),
    y: -r - 20,
    r, pts,
    vx: (Math.random() - 0.5) * 90,
    vy: 130 + Math.random() * 180,
    rot: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 3,
  });
}
