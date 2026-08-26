'use strict';
/* TURBO LANES — lane racer: thread traffic at ever-growing speed, near-misses pay */
RH.registerGame({
  id: 'turbo',
  title: 'TURBO LANES',
  tagline: 'Five lanes. No brakes. One legend.',
  color: '#ff3d5e',
  hint: 'LEFT/RIGHT SWITCH LANES · DODGE TRAFFIC · DISTANCE IS SCORE',
  controls: [['← → / A D', 'SWITCH LANE'], ['DISTANCE', 'SCORE IN METERS'], ['CLOSE PASS', '+60 NEAR-MISS'], ['CRASH', 'RUN OVER']],
  lives: 1,

  reset(api) {
    const s = tst;
    s.W = api.W; s.H = api.H;
    s.lane = 2;
    s.x = laneCX(s, 2);
    s.dist = 0; s.lastWhole = 0;
    s.speed = 290;
    s.traffic = [];
    s.spawnT = 1.1;
    s.buildings = [];
    for (let i = 0; i < 26; i++) {
      s.buildings.push({
        x: i * 66 + Math.random() * 20,
        w: 34 + Math.random() * 28,
        h: 18 + Math.random() * 46,
        c: ['#141d3d', '#182450', '#0f1730'][(Math.random() * 3) | 0],
      });
    }
  },

  update(dt, api) {
    const s = tst, inp = api.input, W = s.W, H = s.H;

    // steering
    if (inp.pressed('ArrowLeft') || inp.pressed('KeyA')) { if (s.lane > 0) { s.lane--; api.audio.play('lane'); } }
    if (inp.pressed('ArrowRight') || inp.pressed('KeyD')) { if (s.lane < 4) { s.lane++; api.audio.play('lane'); } }
    const target = laneCX(s, s.lane);
    s.prevX = s.x;
    s.x += (target - s.x) * Math.min(1, dt * 11);
    s.lean = clamp((target - s.x) / 112, -1, 1);

    // speed & distance
    s.speed = Math.min(720, s.speed + 9.5 * dt);
    s.dist += s.speed * dt / 10; // 10px = 1m
    const whole = Math.floor(s.dist);
    if (whole > s.lastWhole) {
      api.addScore(whole - s.lastWhole);
      s.lastWhole = whole;
    }

    // spawn traffic — never wall off every lane
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      s.spawnT = Math.max(0.52, 1.15 - s.dist * 0.00019);
      const maxBlocked = Math.min(3, 1 + Math.floor(s.dist / 700));
      const blocked = 1 + ((Math.random() * maxBlocked) | 0);
      const lanesAvail = [0, 1, 2, 3, 4].filter(L =>
        !s.traffic.some(c => c.lane === L && c.y > -280));
      shuffle(lanesAvail);
      const chosen = lanesAvail.slice(0, Math.min(blocked, lanesAvail.length));
      for (const L of chosen) {
        if (s.traffic.length >= 10) break;
        const truck = Math.random() < 0.22;
        s.traffic.push({
          lane: L,
          x: laneCX(s, L),
          y: truck ? -170 : -110,
          v: s.speed * (0.36 + Math.random() * 0.3),
          w: 56, h: truck ? 128 : 86,
          col: ['#3dc8ff', '#5dff8a', '#ffd94d', '#b26bff', '#f2f4ff'][(Math.random() * 5) | 0],
          passed: false,
          truck,
        });
      }
    }

    // move traffic + interactions
    const px = s.x, py = H - 130;
    for (let i = s.traffic.length - 1; i >= 0; i--) {
      const c = s.traffic[i];
      c.y += (s.speed - c.v) * dt;
      if (c.y > H + 160) { s.traffic.splice(i, 1); continue; }

      // crash check (shrunk boxes)
      if (rectHit(px - 22, py - 38, 44, 76, c.x - c.w / 2 + 7, c.y - c.h / 2 + 7, c.w - 14, c.h - 14)) {
        api.audio.play('bigboom');
        api.fx.burst(px, py, '#ff5d5d', 34, 300, 0.85, 5);
        api.fx.burst(px, py, '#ffd94d', 22, 220, 0.7, 4);
        api.fx.shake(20, 0.65);
        api.fx.flash('#fff', 0.18);
        api.gameOver();
        return;
      }

      // near-miss when passing just beside us
      if (!c.passed && c.y - py > 46) {
        c.passed = true;
        const dx = Math.abs(c.x - px);
        if (dx < 94 && dx > 40) {
          api.addScore(60);
          api.audio.play('near');
          api.fx.text(px, py - 54, 'CLOSE! +60', '#ffd94d', 16);
          api.fx.shake(2.5, 0.1);
        }
      }
    }
  },

  drawWorld(g, api, tSec) {
    const s = tst, W = s.W, H = s.H;
    const roadX = 120, roadW = 560, py = H - 130;

    // shoulders
    g.fillStyle = '#0b1410';
    g.fillRect(0, 118, roadX, H - 118);
    g.fillRect(roadX + roadW, 118, W - roadX - roadW, H - 118);
    // rumble strips
    const ruOff = (s.dist * 10) % 48;
    for (let y = -48 + ruOff; y < H; y += 48) {
      g.fillStyle = '#c33';
      g.fillRect(roadX - 14, y, 14, 24);
      g.fillStyle = '#eee';
      g.fillRect(roadX + roadW, y, 14, 24);
    }
    // asphalt
    g.fillStyle = '#23262e';
    g.fillRect(roadX, 118, roadW, H - 118);

    // lane dashes
    const dashOff = (s.dist * 10) % 56;
    g.fillStyle = 'rgba(255,217,77,.75)';
    for (let L = 1; L < 5; L++) {
      const lx = roadX + L * (roadW / 5);
      for (let y = dashOff - 56; y < H; y += 56) {
        g.fillRect(lx - 2, y, 4, 30);
      }
    }
    // edge lines
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(roadX + 4, 118, 4, H - 118);
    g.fillRect(roadX + roadW - 8, 118, 4, H - 118);

    // lamps
    const lampOff = (s.dist * 10) % 240;
    for (let y = lampOff - 240; y < H; y += 240) {
      g.fillStyle = '#39404f';
      g.fillRect(roadX - 34, y, 6, 60);
      g.fillRect(roadX + roadW + 28, y + 120, 6, 60);
      g.fillStyle = '#ffe9a8';
      g.fillRect(roadX - 40, y - 6, 18, 7);
      g.fillRect(roadX + roadW + 22, y + 114, 18, 7);
      g.globalAlpha = 0.06;
      g.beginPath(); g.arc(roadX - 31, y + 8, 46, 0, 7); g.fill();
      g.beginPath(); g.arc(roadX + roadW + 31, y + 122, 46, 0, 7); g.fill();
      g.globalAlpha = 1;
    }

    // traffic
    for (const c of s.traffic) {
      g.save();
      g.translate(c.x, c.y);
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(-c.w / 2 + 4, -c.h / 2 + 6, c.w, c.h);
      g.fillStyle = c.col;
      RH.roundRect(g, -c.w / 2, -c.h / 2, c.w, c.h, 9); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2;
      RH.roundRect(g, -c.w / 2, -c.h / 2, c.w, c.h, 9); g.stroke();
      // windshield
      g.fillStyle = 'rgba(10,14,26,.8)';
      g.fillRect(-c.w / 2 + 8, -c.h / 2 + 10, c.w - 16, c.h * 0.22);
      // taillights (they face away from us)
      g.fillStyle = '#ff3d3d';
      g.fillRect(-c.w / 2 + 6, c.h / 2 - 8, 10, 5);
      g.fillRect(c.w / 2 - 16, c.h / 2 - 8, 10, 5);
      g.restore();
    }

    // player car
    g.save();
    g.translate(s.x, py);
    g.rotate(s.lean * 0.09);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(-22, -40, 50, 82);
    // headlight beams
    g.globalAlpha = 0.13;
    g.fillStyle = '#fff8d9';
    g.beginPath(); g.moveTo(-18, -44); g.lineTo(-30, -190); g.lineTo(30, -190); g.lineTo(18, -44); g.closePath(); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#ff3d5e';
    RH.roundRect(g, -26, -44, 52, 88, 10); g.fill();
    g.strokeStyle = '#7d0f26'; g.lineWidth = 2;
    RH.roundRect(g, -26, -44, 52, 88, 10); g.stroke();
    g.fillStyle = '#ffb3c0';
    RH.roundRect(g, -18, -34, 36, 18, 4); g.fill();   // windshield
    g.fillStyle = 'rgba(10,14,26,.85)';
    RH.roundRect(g, -18, 12, 36, 14, 4); g.fill();     // rear window
    g.fillStyle = '#231f1f';
    g.fillRect(-30, -30, 7, 22); g.fillRect(23, -30, 7, 22);
    g.fillRect(-30, 12, 7, 22); g.fillRect(23, 12, 7, 22);
    g.fillStyle = '#fff8d9';
    g.fillRect(-20, -46, 10, 5); g.fillRect(10, -46, 10, 5);
    g.restore();

    // speed lines
    if (s.speed > 460) {
      g.globalAlpha = 0.14;
      g.fillStyle = '#fff';
      for (let i = 0; i < 7; i++) {
        const lx = 130 + ((i * 97 + ((tSec * 900) | 0)) % (W - 260));
        g.fillRect(lx, (i * 137 + tSec * s.speed * 2.2) % H, 2, 40);
      }
      g.globalAlpha = 1;
    }

    // meters HUD
    RH.txt(g, Math.floor(s.dist) + ' m', W / 2, 60, 22, '#fff', 'center', 'rgba(0,0,0,.75)');
    // speed gauge
    const gw = 130, gx = W - gw - 26, gy = 52;
    g.fillStyle = 'rgba(0,0,0,.5)';
    RH.roundRect(g, gx, gy, gw, 14, 7); g.fill();
    const f = (s.speed - 290) / (720 - 290);
    g.fillStyle = f > 0.75 ? '#ff3d5e' : '#ffd94d';
    RH.roundRect(g, gx + 2, gy + 2, Math.max(6, (gw - 4) * clamp(f, 0.05, 1)), 10, 5); g.fill();
    RH.txt(g, 'KM/H ' + Math.round(s.speed * 0.6), gx + gw / 2, gy + 26, 12, '#9a93d6', 'center', 'rgba(0,0,0,.7)');
  },

  bg(g) {
    const s = tst;
    const grd = g.createLinearGradient(0, 0, 0, 130);
    grd.addColorStop(0, '#020310'); grd.addColorStop(1, '#0c1230');
    g.fillStyle = grd;
    g.fillRect(0, 0, s.W, 132);
    // skyline parallax
    const off = (s.dist * 0.9) % 1716;
    for (const b of s.buildings) {
      let bx = b.x - off;
      if (bx < -80) bx += 1716;
      g.fillStyle = b.c;
      g.fillRect(bx, 130 - b.h, b.w, b.h);
      g.fillStyle = 'rgba(255,217,77,.28)';
      for (let wy = 130 - b.h + 5; wy < 124; wy += 9) {
        for (let wx = bx + 4; wx < bx + b.w - 5; wx += 8) {
          if (((wx * 13 + wy * 7) | 0) % 11 < 4) g.fillRect(wx, wy, 3, 4);
        }
      }
    }
  },
});

/* ---- module state ---- */
const tst = { W: 800, H: 600, lane: 2, x: 400, lean: 0, dist: 0, lastWhole: 0, speed: 290, traffic: [], spawnT: 1, buildings: [], prevX: 400 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function laneCX(s, L) { const roadX = 120, roadW = 560; return roadX + (L + 0.5) * (roadW / 5); }
function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
