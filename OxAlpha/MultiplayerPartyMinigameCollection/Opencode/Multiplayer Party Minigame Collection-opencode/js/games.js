// Party Blitz — client view layer for the five minigames.
// All gameplay is server-authoritative; these are interpolated renderers.
(function () {
  const R = window.PBR;
  const c2d = document.getElementById('cv').getContext('2d');

  const V = {}; // view registry keyed by game key
  window.PBGAMES = V;

  // shared helpers ----------------------------------------------------------
  function lerpTo(cur, target, dt, rate) {
    return cur + (target - cur) * Math.min(1, dt * rate);
  }
  function initials(name) {
    return (name || '?').trim().slice(0, 2).toUpperCase();
  }

  // ======================================================================
  // TILE TROUBLE
  // ======================================================================
  V.tiles = {
    meta: {
      name: 'Tile Trouble',
      tagline: 'The island is crumbling. Don’t fall!',
      howto: [
        'Tiles shake, then vanish into the void.',
        'Hop between safe tiles — one step at a time.',
        'Last player standing scores highest!',
      ],
      controls: 'MOVE: WASD / Arrows / D-pad · one tile per hop',
      hint: 'Move before your tile crumbles!',
    },
    enter(v) {
      v.me = { x: 4, y: 3 };
      v.players = new Map(); // pid -> {x,y,tx,ty,alive}
      v.alive = []; v.warn = new Set();
      v.W = 9; v.H = 7;
    },
    snap(v, s) {
      v.W = s.W; v.H = s.H;
      v.alive = s.a;
      v.warn = new Set(s.w);
      for (const [pid, x, y, al] of s.p) {
        let p = v.players.get(pid);
        if (!p) { p = { x, y, tx: x, ty: y, alive: true, deadT: 0 }; v.players.set(pid, p); }
        p.tx = x; p.ty = y;
        p.alive = !!al;
      }
    },
    event(v, kind, data, api) {
      if (kind === 'crumble') { api.sfx('whoosh'); api.shake(0.25); }
      if (kind === 'elim') {
        api.sfx('elim');
        const pos = this.entityPos(v, data.pid);
        if (pos) api.burst(pos.x, pos.y, api.colorOf(data.pid), 22);
      }
    },
    entityPos(v, pid) {
      const p = v.players.get(pid);
      if (!p) return null;
      return this.boardToXY(v, p.x + 0.5, p.y + 0.5);
    },
    boardToXY(v, fx, fy) {
      const TS = 66, GP = 7;
      const bw = v.W * (TS + GP) - GP, bh = v.H * (TS + GP) - GP;
      return { x: 1280 / 2 - bw / 2 + fx * (TS + GP), y: 720 / 2 + 26 - bh / 2 + fy * (TS + GP) };
    },
    draw(v, dt, api) {
      const TS = 66, GP = 7;
      for (const p of v.players.values()) {
        p.x = lerpTo(p.x, p.tx, dt, 16);
        p.y = lerpTo(p.y, p.ty, dt, 16);
        if (!p.alive) p.deadT = Math.min(1, p.deadT + dt * 1.6);
      }
      for (let i = 0; i < v.alive.length; i++) {
        const cx = i % v.W, cy = (i / v.W) | 0;
        const pos = this.boardToXY(v, cx, cy);
        if (!v.alive[i]) {
          c2d.globalAlpha = 0.06;
          c2d.fillStyle = '#8b93b8';
          R.roundRect(pos.x, pos.y, TS, TS, 12); c2d.fill();
          c2d.globalAlpha = 1;
          continue;
        }
        const warned = v.warn.has(i);
        if (warned) {
          const j = Math.sin(R.time * 34 + i * 7) * 3;
          c2d.save(); c2d.translate(j, Math.cos(R.time * 41 + i) * 2);
          const pulse = (Math.sin(R.time * 10) + 1) / 2;
          c2d.fillStyle = `rgba(255,${80 + pulse * 60 | 0},60,${0.75 + pulse * 0.2})`;
        } else {
          c2d.fillStyle = '#232c52';
        }
        c2d.strokeStyle = warned ? '#ff5c5c' : 'rgba(255,255,255,.08)';
        c2d.lineWidth = 2;
        R.roundRect(pos.x, pos.y, TS, TS, 12); c2d.fill(); c2d.stroke();
        if (warned) c2d.restore();
        else {
          c2d.fillStyle = 'rgba(255,255,255,.03)';
          R.roundRect(pos.x + 5, pos.y + 5, TS - 10, (TS - 10) / 2, 8); c2d.fill();
        }
      }
      // players
      for (const [pid, p] of v.players) {
        const col = api.colorOf(pid);
        const pos = this.boardToXY(v, p.x + 0.5, p.y + 0.5);
        c2d.globalAlpha = p.alive ? 1 : (1 - p.deadT) * 0.5;
        if (pid === api.myPid()) {
          c2d.strokeStyle = '#fff'; c2d.lineWidth = 3;
          c2d.beginPath(); c2d.arc(pos.x, pos.y, 27 + Math.sin(R.time * 6) * 2, 0, Math.PI * 2); c2d.stroke();
        }
        c2d.fillStyle = col;
        c2d.shadowColor = col; c2d.shadowBlur = p.alive ? 16 : 0;
        c2d.beginPath(); c2d.arc(pos.x, pos.y, 21, 0, Math.PI * 2); c2d.fill();
        c2d.shadowBlur = 0;
        R.text(initials(api.nameOf(pid)), pos.x, pos.y + 1, 15, '#10142a');
        c2d.globalAlpha = 1;
      }
    },
    input(k, d, api) {
      if (api.gameKey() !== 'tiles') return false;
      if (k === 'step') { api.sendIn('step', d); return true; }
      return false;
    },
  };

  // ======================================================================
  // QUICK DRAW
  // ======================================================================
  V.draw = {
    meta: {
      name: 'Quick Draw',
      tagline: 'Wait for GREEN… then slam it!',
      howto: [
        'The orb glows RED — hold your nerve.',
        'The instant it turns GREEN, hit ACTION.',
        'First tap wins the round. Jump the gun and you’re stunned!',
      ],
      controls: 'ACTION: SPACE / Click / Tap A',
      hint: 'GREEN means GO. Red means NO.',
    },
    enter(v) {
      v.phase = 0; v.winner = null;
      v.flash = 0; v.pulse = 0;
      v.wins = new Map();
    },
    snap(v, s) {
      v.trial = s.tr; v.total = s.tt;
      if (s.ph === 1 && v.phase !== 1) v.pulse = 1;
      v.phase = s.ph;
      if (s.w) v.winner = s.w;
    },
    event(v, kind, data, api) {
      if (kind === 'signal') { api.sfx('tick'); v.flashG = 0.3; }
      if (kind === 'reset') { v.winner = null; v.phase = 0; }
      if (kind === 'score') {
        v.wins.set(data.pid, (v.wins.get(data.pid) || 0) + 1);
        api.sfx(data.pid === api.myPid() ? 'go' : 'score');
        api.burst(640, 340, api.colorOf(data.pid), 24);
      }
      if (kind === 'early') {
        api.sfx('bad');
        if (data.pid === api.myPid()) api.toast('Too early! Stunned…');
      }
    },
    entityPos() { return { x: 640, y: 340 }; },
    draw(v, dt, api) {
      v.pulse = Math.max(0, v.pulse - dt * 3);
      const go = v.phase === 1 && !v.winner;
      const baseR = 150 + Math.sin(R.time * 2) * 4 + v.pulse * 18;
      // halo
      const col = go ? '#4ade80' : v.winner ? api.colorOf(v.winner) : '#ff5c7a';
      const g = c2d.createRadialGradient(640, 340, 40, 640, 340, baseR + 90);
      g.addColorStop(0, col + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = g;
      c2d.fillRect(340, 100, 600, 500);
      // orb
      c2d.fillStyle = go ? '#4ade80' : '#2a3158';
      c2d.strokeStyle = col; c2d.lineWidth = 6;
      c2d.shadowColor = col; c2d.shadowBlur = go ? 50 : 16;
      c2d.beginPath(); c2d.arc(640, 340, baseR, 0, Math.PI * 2); c2d.fill(); c2d.stroke();
      c2d.shadowBlur = 0;
      R.text(go ? 'TAP!' : v.winner ? '★' : 'WAIT…', 640, 340, go ? 74 : 56,
        go || v.winner ? '#10142a' : '#8b93b8');
      // trial pips
      const total = v.total || 8, tr = v.trial || 0;
      for (let i = 0; i < total; i++) {
        c2d.fillStyle = i < tr ? '#3ddcff' : 'rgba(255,255,255,.12)';
        c2d.beginPath();
        c2d.arc(640 - (total - 1) * 11 + i * 22, 545, 7, 0, Math.PI * 2); c2d.fill();
      }
      // player chips with wins
      const ps = [...api.playerList()];
      ps.forEach((pl, i) => {
        const ang = -Math.PI / 2 + (i / ps.length) * Math.PI * 2;
        const rr = 235;
        const x = 640 + Math.cos(ang) * rr * 1.35, y = 350 + Math.sin(ang) * rr * 0.82;
        const wins = v.wins.get(pl.pid) || 0;
        c2d.fillStyle = pl.color;
        c2d.beginPath(); c2d.arc(x, y, 20, 0, Math.PI * 2); c2d.fill();
        if (pl.pid === api.myPid()) { c2d.strokeStyle = '#fff'; c2d.lineWidth = 2.5; c2d.stroke(); }
        R.text(String(wins), x + 30, y, 20, '#ffc93c', 'left');
        R.text(initials(pl.name), x, y + 1, 13, '#10142a');
      });
    },
    input(k, d, api) {
      if (k === 'act') { api.sendIn('act'); return true; }
      return false;
    },
  };

  // ======================================================================
  // LANE RUSH
  // ======================================================================
  V.rush = {
    meta: {
      name: 'Lane Rush',
      tagline: 'Race to the flag — surf the beat!',
      howto: [
        'Everyone auto-runs down three lanes. Dodge barriers.',
        'Tap ACTION exactly on the beat to BOOST (mistime = stumble!).',
        'First to the finish line takes the crown.',
      ],
      controls: 'LANES: Up/Down or Left/Right · BOOST: SPACE / Tap A (on beat!)',
      hint: 'Tap on the beat marker to boost',
    },
    enter(v) {
      v.obs = []; v.runners = new Map();
      v.F = 100; v.clk = 0; v.pe = 0.85;
    },
    snap(v, s) {
      v.F = s.F; v.clk = s.clk; v.pe = s.pe;
      v.obs = s.o;
      for (const [pid, prog, lane, fin, boost, stun] of s.p) {
        let r = v.runners.get(pid);
        if (!r) { r = { prog: 0, lane: 1 }; v.runners.set(pid, r); }
        r.progT = prog; r.laneT = lane; r.fin = fin; r.boost = boost; r.stun = stun;
      }
    },
    event(v, kind, data, api) {
      if (kind === 'hit') { api.sfx('hit'); api.shake(0.4); const p = this.entityPos(v, data.pid); if (p) api.burst(p.x, p.y, '#ff5c7a', 14); }
      if (kind === 'boost') { if (data.pid === api.myPid()) api.sfx('boost'); }
      if (kind === 'stumble') { if (data.pid === api.myPid()) api.sfx('stumble'); }
      if (kind === 'finish') { api.sfx('go'); const p = this.entityPos(v, data.pid); if (p) api.burst(p.x, p.y, '#4ade80', 20); }
    },
    entityPos(v, pid) {
      const r = v.runners.get(pid);
      if (!r) return null;
      return this.worldToXY(v, r.prog, r.laneV == null ? r.lane : r.laneV);
    },
    worldToXY(v, prog, lane) {
      const camProg = v.camProg == null ? 0 : v.camProg;
      const x = 200 + (prog - camProg) * 46;
      const y = 250 + lane * 130;
      return { x, y };
    },
    draw(v, dt, api) {
      const me = v.runners.get(api.myPid());
      const meProg = me ? me.prog : 0;
      v.camProg = lerpTo(v.camProg == null ? meProg : v.camProg, meProg, dt, 5);

      // lanes
      for (let l = 0; l < 3; l++) {
        const y = 250 + l * 130;
        c2d.fillStyle = l % 2 ? 'rgba(255,255,255,.028)' : 'rgba(255,255,255,.05)';
        R.roundRect(-20, y - 58, 1320, 122, 18); c2d.fill();
      }
      // distance ticks every 10 units
      const startU = Math.floor((v.camProg - 5) / 10) * 10;
      for (let u = startU; u <= v.camProg + 26; u += 10) {
        if (u < 0 || u > v.F) continue;
        const x = 200 + (u - v.camProg) * 46;
        c2d.strokeStyle = 'rgba(255,255,255,.07)';
        c2d.lineWidth = 3;
        c2d.setLineDash([12, 14]);
        c2d.beginPath(); c2d.moveTo(x, 190); c2d.lineTo(x, 640); c2d.stroke();
        c2d.setLineDash([]);
        R.text(u + 'm', x, 172, 17, 'rgba(139,147,184,.8)');
      }
      // obstacles
      for (const [d, l] of v.obs) {
        const x = 200 + (d - v.camProg) * 46;
        if (x < -60 || x > 1340) continue;
        const y = 250 + l * 130;
        c2d.fillStyle = '#ff5c7a';
        c2d.strokeStyle = 'rgba(255,255,255,.35)';
        c2d.lineWidth = 3;
        R.roundRect(x - 14, y - 48, 28, 96, 9); c2d.fill(); c2d.stroke();
        c2d.fillStyle = 'rgba(255,255,255,.25)';
        for (let s = 0; s < 3; s++) { c2d.fillRect(x - 7, y - 38 + s * 26, 14, 7); }
      }
      // finish line
      const fx = 200 + (v.F - v.camProg) * 46;
      if (fx < 1400) {
        for (let yy = 180; yy < 650; yy += 24) {
          for (let xx = 0; xx < 2; xx++) {
            c2d.fillStyle = ((yy / 24 | 0) + xx) % 2 ? '#eef2ff' : '#10142a';
            c2d.fillRect(fx + xx * 14, yy, 14, 24);
          }
        }
        R.text('FINISH', fx + 14, 160, 22, '#ffc93c');
      }
      // runners
      for (const [pid, r] of v.runners) {
        r.laneV = lerpTo(r.laneV == null ? r.lane : r.laneV, r.laneT, dt, 14);
        r.prog = r.progT;
        const pos = this.worldToXY(v, r.prog, r.laneV);
        const col = api.colorOf(pid);
        const bob = r.stun ? 0 : Math.abs(Math.sin(r.prog * 3)) * -6;
        c2d.save(); c2d.translate(pos.x, pos.y + bob);
        if (r.boost) { // flame trail
          c2d.fillStyle = 'rgba(255,201,60,.5)';
          c2d.beginPath();
          c2d.ellipse(-26, 6, 26, 10, 0, 0, Math.PI * 2); c2d.fill();
        }
        if (r.fin) { c2d.globalAlpha = .85; }
        c2d.fillStyle = col;
        c2d.shadowColor = col; c2d.shadowBlur = r.boost ? 26 : 10;
        c2d.beginPath(); c2d.arc(0, 0, 23, 0, Math.PI * 2); c2d.fill();
        c2d.shadowBlur = 0;
        if (r.stun) {
          R.text('✖', 0, 1, 22, '#ff5c7a');
        } else {
          R.text(initials(api.nameOf(pid)), 0, 1, 14, '#10142a');
        }
        if (pid === api.myPid()) {
          c2d.strokeStyle = '#fff'; c2d.lineWidth = 3;
          c2d.beginPath(); c2d.arc(0, 0, 29, 0, Math.PI * 2); c2d.stroke();
        }
        c2d.globalAlpha = 1;
        c2d.restore();
      }
      // beat metronome
      const bw = 420, bx = 640 - bw / 2, by = 672;
      c2d.fillStyle = 'rgba(255,255,255,.08)';
      R.roundRect(bx, by, bw, 26, 13); c2d.fill();
      const ph = (v.clk % v.pe) / v.pe;
      const mx = bx + ph * bw;
      // sweet zone near boundary
      const zoneW = 0.15 / v.pe * bw;
      c2d.fillStyle = 'rgba(74,222,128,.3)';
      R.roundRect(bx - zoneW / 2, by, zoneW, 26, 8); c2d.fill();
      R.roundRect(bx + bw - zoneW / 2, by, zoneW, 26, 8); c2d.fill();
      c2d.fillStyle = '#ffc93c';
      c2d.beginPath();
      c2d.moveTo(mx, by - 6); c2d.lineTo(mx + 9, by - 20); c2d.lineTo(mx - 9, by - 20);
      c2d.closePath(); c2d.fill();
      R.text('BEAT', bx - 52, by + 13, 15, 'rgba(139,147,184,.9)', 'center');
    },
    input(k, d, api) {
      if (api.gameKey() !== 'rush') return false;
      if (k === 'step') { api.sendIn('step', d); return true; }
      if (k === 'act') { api.sendIn('act'); return true; }
      return false;
    },
  };

  // ======================================================================
  // DODGE FRENZY
  // ======================================================================
  V.dodge = {
    meta: {
      name: 'Dodge Frenzy',
      tagline: 'Bouncing balls. Three hearts. Survive.',
      howto: [
        'Dodge the balls ricocheting around the arena.',
        'You have 3 hearts — each hit costs one.',
        'More balls join the party. Last one standing wins!',
      ],
      controls: 'MOVE: WASD / Arrows / D-pad (hold)',
      hint: 'Keep moving — invulnerable briefly after a hit',
    },
    enter(v) {
      v.players = new Map(); v.balls = [];
      v.R = 1;
    },
    snap(v, s) {
      v.R = s.R;
      for (const [pid, x, y, hp, inv, alive] of s.p) {
        let p = v.players.get(pid);
        if (!p) { p = { x, y, tx: x, ty: y }; v.players.set(pid, p); }
        p.tx = x; p.ty = y; p.hp = hp; p.inv = inv; p.alive = alive;
      }
      const seen = new Set();
      for (const b of v.balls) b.seen = false;
      for (const [x, y, r] of s.b) {
        let best = null, bd = 1e9;
        for (const b of v.balls) {
          if (b.seen) continue;
          const d = (b.tx - x) ** 2 + (b.ty - y) ** 2;
          if (d < bd) { bd = d; best = b; }
        }
        if (best && bd < 0.09) { best.tx = x; best.ty = y; best.r = r; best.seen = true; }
        else v.balls.push({ x, y, tx: x, ty: y, r, seen: true });
      }
      v.players.forEach((p, pid) => { if (!s.p.find(q => q[0] === pid)) p.gone = true; });
    },
    event(v, kind, data, api) {
      if (kind === 'hit') {
        api.sfx('hit'); api.shake(0.5);
        const p = this.entityPos(v, data.pid);
        if (p) api.burst(p.x, p.y, api.colorOf(data.pid), 18);
        if (data.pid === api.myPid()) api.toast(`${'❤'.repeat(Math.max(0, data.hp)) || '💀'} Ouch!`);
      }
      if (kind === 'newball') api.sfx('pop');
      if (kind === 'elim') {
        api.sfx('elim');
        const p = this.entityPos(v, data.pid);
        if (p) api.burst(p.x, p.y, api.colorOf(data.pid), 26);
      }
    },
    entityPos(v, pid) {
      const p = v.players.get(pid);
      return p ? this.normToXY(v, p.x, p.y) : null;
    },
    normToXY(v, nx, ny) {
      const rad = Math.min(1280, 720) * 0.44;
      return { x: 640 + nx * rad, y: 372 + ny * rad };
    },
    draw(v, dt, api) {
      const rad = Math.min(1280, 720) * 0.44;
      const cx = 640, cy = 372;
      // arena
      c2d.strokeStyle = 'rgba(61,220,255,.4)';
      c2d.lineWidth = 5;
      c2d.shadowColor = 'rgba(61,220,255,.5)'; c2d.shadowBlur = 26;
      c2d.beginPath(); c2d.arc(cx, cy, rad, 0, Math.PI * 2); c2d.stroke();
      c2d.shadowBlur = 0;
      c2d.fillStyle = 'rgba(19,26,48,.55)';
      c2d.beginPath(); c2d.arc(cx, cy, rad - 4, 0, Math.PI * 2); c2d.fill();

      for (const b of v.balls) {
        b.x = lerpTo(b.x, b.tx, dt, 18);
        b.y = lerpTo(b.y, b.ty, dt, 18);
        const pos = this.normToXY(v, b.x, b.y);
        c2d.fillStyle = '#ff9f43';
        c2d.shadowColor = '#ff9f43'; c2d.shadowBlur = 20;
        c2d.beginPath(); c2d.arc(pos.x, pos.y, b.r * rad, 0, Math.PI * 2); c2d.fill();
        c2d.shadowBlur = 0;
        c2d.fillStyle = 'rgba(255,255,255,.35)';
        c2d.beginPath(); c2d.arc(pos.x - b.r * rad * .3, pos.y - b.r * rad * .3, b.r * rad * .35, 0, Math.PI * 2); c2d.fill();
      }
      for (const [pid, p] of v.players) {
        p.x = lerpTo(p.x, p.tx, dt, 18);
        p.y = lerpTo(p.y, p.ty, dt, 18);
        const pos = this.normToXY(v, p.x, p.y);
        const col = api.colorOf(pid);
        if (p.alive === false) {
          c2d.globalAlpha = 0.18;
        } else if (p.inv) {
          c2d.globalAlpha = (Math.sin(R.time * 18) + 1) / 2 * 0.5 + 0.4;
        }
        c2d.fillStyle = col;
        c2d.shadowColor = col; c2d.shadowBlur = p.inv ? 0 : 14;
        c2d.beginPath(); c2d.arc(pos.x, pos.y, 20, 0, Math.PI * 2); c2d.fill();
        c2d.shadowBlur = 0;
        R.text(initials(api.nameOf(pid)), pos.x, pos.y + 1, 14, '#10142a');
        if (pid === api.myPid()) {
          c2d.strokeStyle = '#fff'; c2d.lineWidth = 3;
          c2d.beginPath(); c2d.arc(pos.x, pos.y, 26, 0, Math.PI * 2); c2d.stroke();
        }
        // hearts
        if (p.alive !== false) {
          const hh = typeof p.hp === 'number' ? p.hp : 3;
          for (let h = 0; h < 3; h++) {
            R.text(h < hh ? '❤' : '🖤', pos.x - 22 + h * 16, pos.y - 32, 13,
              h < hh ? '#ff5c7a' : 'rgba(255,255,255,.2)');
          }
        }
        c2d.globalAlpha = 1;
      }
    },
    input(k, d, api) {
      if (api.gameKey() !== 'dodge') return false;
      if (k === 'dir') { api.sendIn('dir', d); return true; }
      return false;
    },
  };

  // ======================================================================
  // MIND MATCH
  // ======================================================================
  const SYM_COLORS = ['#ff5c7a','#ffc93c','#3ddcff','#8b5cff','#4ade80','#ff9f43','#f472b6','#60a5fa','#a3e635','#f97316','#22d3ee','#e879f9'];
  function drawSymbol(id, x, y, s, alpha) {
    c2d.save();
    c2d.translate(x, y);
    c2d.globalAlpha = alpha == null ? 1 : alpha;
    c2d.fillStyle = SYM_COLORS[id % SYM_COLORS.length];
    c2d.strokeStyle = c2d.fillStyle;
    c2d.lineWidth = s * 0.16;
    const u = s;
    switch (id % 12) {
      case 0: c2d.beginPath(); c2d.arc(0, 0, u, 0, Math.PI * 2); c2d.fill(); break;
      case 1: R.roundRect(-u, -u, u * 2, u * 2, u * .3); c2d.fill(); break;
      case 2: c2d.beginPath(); c2d.moveTo(0, -u); c2d.lineTo(u, u); c2d.lineTo(-u, u); c2d.closePath(); c2d.fill(); break;
      case 3: { c2d.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? u * .45 : u; const a = -Math.PI / 2 + i * Math.PI / 5; c2d[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } c2d.closePath(); c2d.fill(); break; }
      case 4: c2d.beginPath(); c2d.moveTo(0, -u); c2d.lineTo(u, 0); c2d.lineTo(0, u); c2d.lineTo(-u, 0); c2d.closePath(); c2d.fill(); break;
      case 5: c2d.beginPath(); c2d.arc(0, 0, u, 0, Math.PI * 2); c2d.stroke(); break;
      case 6: { c2d.beginPath(); const dir = -1; c2d.arc(u * dir * .4, -u * .3, u * .62, Math.PI * .78, Math.PI * 2.22); c2d.arc(u * dir * .95, -u * .3, u * .62, Math.PI * 1.78, Math.PI * 3.22, true); c2d.closePath(); c2d.fill(); break; }
      case 7: { c2d.beginPath(); c2d.moveTo(u * .3, -u); c2d.lineTo(-u * .55, u * .15); c2d.lineTo(-u * .02, u * .15); c2d.lineTo(-u * .3, u); c2d.lineTo(u * .55, -u * .15); c2d.lineTo(u * .02, -u * .15); c2d.closePath(); c2d.fill(); break; }
      case 8: { c2d.lineWidth = u * .5; c2d.lineCap = 'round'; c2d.beginPath(); c2d.moveTo(-u, -u); c2d.lineTo(u, u); c2d.moveTo(u, -u); c2d.lineTo(-u, u); c2d.stroke(); break; }
      case 9: { c2d.beginPath(); c2d.moveTo(0, -u); c2d.bezierCurveTo(u * 1.3, -u * .2, u * .8, u * .9, 0, u); c2d.bezierCurveTo(-u * .8, u * .9, -u * 1.3, -u * .2, 0, -u); c2d.fill(); break; }
      case 10: { c2d.beginPath(); c2d.moveTo(0, u * 1.1); c2d.quadraticCurveTo(-u * 1.1, -u * .2, -u * .35, -u * .55); c2d.quadraticCurveTo(0, -u * 1.1, u * .35, -u * .55); c2d.quadraticCurveTo(u * 1.1, -u * .2, 0, u * 1.1); c2d.fill(); break; }
      default: { c2d.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; c2d[i ? 'lineTo' : 'moveTo'](Math.cos(a) * u, Math.sin(a) * u); } c2d.closePath(); c2d.fill(); break; }
    }
    c2d.restore();
  }

  V.match = {
    meta: {
      name: 'Mind Match',
      tagline: 'Flip fast, match pairs, steal the board!',
      howto: [
        'One shared board — everyone hunts at once.',
        'Flip two cards: match keeps them face-up (+1 pair).',
        'Mismatch flips back after a moment. Most pairs wins!',
      ],
      controls: 'FLIP: Click / Tap a card (or arrows + SPACE)',
      hint: 'Click two cards — matches stay revealed',
    },
    enter(v) {
      v.cards = new Array(24).fill(-1);
      v.anim = new Map(); // idx -> flip anim t
      v.selCursor = 0;
      v.cols = 6; v.rows = 4;
    },
    snap(v, s) {
      for (let i = 0; i < s.c.length; i++) {
        if (v.cards[i] !== s.c[i]) { v.cards[i] = s.c[i]; v.anim.set(i, 0); }
      }
      v.pw = new Map(s.pw);
    },
    event(v, kind, data, api) {
      if (kind === 'flip') { api.sfx('flip'); }
      if (kind === 'pair') {
        api.sfx('pair');
        for (const i of [data.a, data.b]) {
          const pos = this.cardPos(v, i);
          api.burst(pos.x, pos.y, SYM_COLORS[v.cards[i] % SYM_COLORS.length], 16);
        }
        if (data.pid === api.myPid()) api.toast(`Pair! ${data.n}`);
      }
      if (kind === 'miss') { api.sfx('bad'); }
      if (kind === 'unflip') { v.anim.set(data.i, 0); }
    },
    entityPos() { return null; },
    cardPos(v, i) {
      const CW = 118, CH = 138, GP = 14;
      const cols = v.cols, rows = v.rows;
      const ox = 640 - (cols * (CW + GP) - GP) / 2 + CW / 2;
      const oy = 372 - (rows * (CH + GP) - GP) / 2 + CH / 2;
      return { x: ox + (i % cols) * (CW + GP), y: oy + ((i / cols) | 0) * (CH + GP), CW, CH };
    },
    cardAt(v, vx, vy) {
      for (let i = 0; i < v.cards.length; i++) {
        const p = this.cardPos(v, i);
        if (Math.abs(vx - p.x) <= p.CW / 2 && Math.abs(vy - p.y) <= p.CH / 2) return i;
      }
      return -1;
    },
    draw(v, dt, api) {
      for (const [i, t] of [...v.anim]) {
        const nt = t + dt * 5;
        if (nt >= 1) v.anim.delete(i); else v.anim.set(i, nt);
      }
      for (let i = 0; i < v.cards.length; i++) {
        const val = v.cards[i];
        const p = this.cardPos(v, i);
        const fl = v.anim.get(i) || 0;
        const squash = fl > 0 ? Math.abs(Math.cos(fl * Math.PI)) : 1;
        const matched = val >= 100;
        const shown = val >= 0;
        c2d.save();
        c2d.translate(p.x, p.y);
        c2d.scale(squash, 1);
        if (!shown) {
          c2d.fillStyle = '#1c2447';
          c2d.strokeStyle = 'rgba(139,92,255,.5)'; c2d.lineWidth = 3;
          R.roundRect(-p.CW / 2, -p.CH / 2, p.CW, p.CH, 14); c2d.fill(); c2d.stroke();
          // decorative ?
          c2d.fillStyle = 'rgba(139,92,255,.28)';
          R.text('?', 0, 2, 52, 'rgba(139,92,255,.35)', 'center');
        } else {
          c2d.globalAlpha = matched ? 0.88 : 1;
          c2d.fillStyle = matched ? '#182142' : '#eef2ff';
          c2d.strokeStyle = matched ? SYM_COLORS[(val - 100) % SYM_COLORS.length] : 'rgba(255,255,255,.6)';
          c2d.lineWidth = 3;
          R.roundRect(-p.CW / 2, -p.CH / 2, p.CW, p.CH, 14); c2d.fill(); c2d.stroke();
          drawSymbol(matched ? val - 100 : val, 0, 0, 26, matched ? .8 : 1);
        }
        c2d.restore();
        c2d.globalAlpha = 1;
      }
      // pair counts row
      let x = 640;
      const list = [...(v.pw ? v.pw.entries() : [])].sort((a, b) => b[1] - a[1]);
      const totalW = list.length * 150;
      x = 640 - totalW / 2 + 75;
      for (const [pid, n] of list) {
        c2d.fillStyle = api.colorOf(pid);
        c2d.beginPath(); c2d.arc(x - 34, 690, 13, 0, Math.PI * 2); c2d.fill();
        R.text(String(n), x - 34, 691, 12, '#10142a');
        R.text(`${n} pair${n === 1 ? '' : 's'}`, x, 690, 17, '#eef2ff', 'left', 800);
        x += 150;
      }
    },
    click(v, vx, vy, api) {
      const i = this.cardAt(v, vx, vy);
      if (i >= 0) api.sendIn('tile', null, i);
    },
    input(k, d, api) {
      return false;
    },
  };

  // keyboard cursor for match game
  V.match.cursor = { i: 0 };
})();
