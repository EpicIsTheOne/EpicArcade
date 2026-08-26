'use strict';
/* RETRO-HUB-RUN02 engine: fixed 800x600 canvas loop, phases ready/play/pause/over,
   shared juice (particles, floats, shake, flash), HUD chrome + overlay cards */
RH.engine = (function () {
  const W = 800, H = 600;

  const E = {
    canvas: null, g: null, def: null,
    phase: 'idle',            // idle | ready | playing | paused | over
    score: 0, lives: 3, newBest: false,
    time: 0, overAt: 0,
    shakeAmp: 0, shakeT: 0,
    flashCol: '#fff', flashT: 0,
    quitArmUntil: 0,
    particles: [], floats: [],
    onEnd: null, onQuit: null,
    running: false, raf: 0, last: 0,
  };

  const api = {
    W, H,
    get score() { return E.score; },
    addScore(n) { E.score += Math.round(n); },
    get lives() { return E.lives; },
    setLives(n) { E.lives = Math.max(0, Math.min(9, Math.round(n))); },
    get t() { return E.time; },
    input: RH.input,
    audio: RH.audio,
    fx: null,
    gameOver() { endRun(); },
  };

  /* ---- shared juice ---- */
  function burst(x, y, col, n, spd, life, size, grav) {
    n = n || 14; spd = spd || 160; life = life || 0.55; size = size || 4; grav = grav || 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.25 + Math.random() * 0.75);
      E.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        t: 0, life: life * (0.6 + Math.random() * 0.8),
        col, size: size * (0.5 + Math.random()), grav,
      });
    }
    if (E.particles.length > 420) E.particles.splice(0, E.particles.length - 420);
  }
  function fText(x, y, txt, col, size) {
    E.floats.push({ x, y, txt, col: col || '#fff', size: size || 16, t: 0, life: 0.95 });
    if (E.floats.length > 30) E.floats.shift();
  }
  api.fx = {
    burst,
    text: fText,
    shake(a, d) { E.shakeAmp = Math.max(E.shakeAmp, a || 5); E.shakeT = Math.max(E.shakeT, d || 0.3); },
    flash(c, d) { E.flashCol = c || '#fff'; E.flashT = Math.max(E.flashT, d || 0.12); },
  };

  function fmt(n) { return String(Math.max(0, Math.round(n))).padStart(6, '0'); }

  /* ---- text helper (also exposed for games) ---- */
  function txt(g, s, x, y, size, col, align, shadowCol, weight) {
    g.font = (weight || 'bold') + ' ' + size + 'px Consolas,"Courier New",monospace';
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    if (shadowCol) { g.fillStyle = shadowCol; g.fillText(s, x + 2, y + 2); }
    g.fillStyle = col;
    g.fillText(s, x, y);
  }
  RH.txt = txt;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  RH.roundRect = roundRect;

  /* ---- lifecycle ---- */
  function attach(canvas) {
    E.canvas = canvas;
    E.g = canvas.getContext('2d');
    E.g.imageSmoothingEnabled = false;
  }

  function start(def) {
    E.def = def;
    E.score = 0; E.time = 0; E.newBest = false; E.overAt = 0;
    E.quitArmUntil = 0; E.shakeAmp = 0; E.shakeT = 0; E.flashT = 0;
    E.particles.length = 0; E.floats.length = 0;
    E.lives = def.lives || 1;
    def.reset(api);
    E.phase = 'ready';
    if (!E.running) { E.running = true; E.last = performance.now(); E.raf = requestAnimationFrame(frame); }
  }

  function beginPlay() { if (E.phase === 'ready') E.phase = 'playing'; RH.audio.play('select'); }

  function endRun() {
    if (E.phase !== 'playing') return;
    E.phase = 'over'; E.overAt = performance.now();
    const best = RH.store.best(E.def.id);
    E.newBest = E.score > best;
    RH.audio.play('over');
    if (E.onEnd) E.onEnd(E.def.id, E.score, E.newBest);
  }

  function quit() {
    E.phase = 'idle';
    E.running = false;
    E.def = null;
    cancelAnimationFrame(E.raf);
    if (E.onQuit) E.onQuit();
  }

  function togglePause() {
    if (E.phase === 'playing') { E.phase = 'paused'; E.quitArmUntil = 0; RH.audio.play('move'); }
    else if (E.phase === 'paused') { E.phase = 'playing'; RH.audio.play('move'); }
  }

  /** ESC semantics per phase; hub calls this on raw keydown. nowMs = performance.now() */
  function escPressed(nowMs) {
    if (E.phase === 'playing') {
      E.phase = 'paused';
      E.quitArmUntil = nowMs + 2000;
      RH.audio.play('move');
    } else if (E.phase === 'paused') {
      // first ESC arms the quit, second ESC within the window exits
      if (nowMs < E.quitArmUntil) quit();
      else { E.quitArmUntil = nowMs + 2000; RH.audio.play('move'); }
    } else if (E.phase === 'ready' || E.phase === 'over') {
      quit();
    }
  }

  /** SPACE/ENTER semantics per phase. */
  function primaryPressed(nowMs) {
    if (E.phase === 'ready') beginPlay();
    else if (E.phase === 'over' && nowMs - E.overAt > 600) start(E.def);
  }

  /* ---- main loop ---- */
  function frame(now) {
    if (!E.running) return;
    E.raf = requestAnimationFrame(frame);
    let dt = (now - E.last) / 1000;
    E.last = now;
    if (dt > 0.05) dt = 0.05;
    step(dt);
    draw(now);
  }

  function step(dt) {
    if (E.phase === 'playing') { E.time += dt; E.def.update(dt, api); }
    // effects keep animating in every phase so explosions play out on game-over
    for (let i = E.particles.length - 1; i >= 0; i--) {
      const p = E.particles[i];
      p.t += dt;
      if (p.t >= p.life) { E.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = E.floats.length - 1; i >= 0; i--) {
      const f = E.floats[i];
      f.t += dt; f.y -= 34 * dt;
      if (f.t >= f.life) E.floats.splice(i, 1);
    }
    if (E.shakeT > 0) { E.shakeT -= dt; if (E.shakeT <= 0) E.shakeAmp = 0; }
    if (E.flashT > 0) E.flashT -= dt;
    RH.input.endFrame();
  }

  function draw(now) {
    const g = E.g, def = E.def;
    if (!g || !def) return;
    const tSec = now / 1000;

    g.save();
    if (E.shakeAmp > 0 && E.shakeT > 0) {
      g.translate((Math.random() * 2 - 1) * E.shakeAmp, (Math.random() * 2 - 1) * E.shakeAmp);
    }
    if (def.bg) def.bg(g, tSec, E.phase);
    else { g.fillStyle = '#05030c'; g.fillRect(-40, -40, W + 80, H + 80); }

    if ((E.phase === 'playing' || E.phase === 'paused') && def.drawWorld) {
      def.drawWorld(g, api, tSec);
    }

    for (const p of E.particles) {
      g.globalAlpha = Math.max(0, 1 - p.t / p.life);
      g.fillStyle = p.col;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    for (const f of E.floats) {
      g.globalAlpha = Math.max(0, 1 - f.t / f.life);
      txt(g, f.txt, f.x, f.y, f.size, f.col, 'center', 'rgba(0,0,0,.7)');
    }
    g.globalAlpha = 1;
    g.restore();

    // HUD chrome
    if (E.phase === 'playing' || E.phase === 'paused' || E.phase === 'over') {
      txt(g, 'SCORE ' + fmt(E.score), 18, 28, 19, '#fff', 'left', 'rgba(0,0,0,.65)');
      txt(g, 'BEST ' + fmt(RH.store.best(def.id)), W - 18, 28, 19, '#ffd94d', 'right', 'rgba(0,0,0,.65)');
      for (let i = 0; i < E.lives; i++) {
        const x = W / 2 - (E.lives - 1) * 11 + i * 22;
        g.fillStyle = '#ff5d7d';
        g.beginPath();
        g.moveTo(x, 20); g.lineTo(x + 7, 29); g.lineTo(x, 38); g.lineTo(x - 7, 29);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke();
      }
    }

    if (E.flashT > 0) {
      g.globalAlpha = Math.min(0.8, E.flashT * 6);
      g.fillStyle = E.flashCol;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }

    if (E.phase === 'ready') drawReady(g, def);
    else if (E.phase === 'paused') drawPaused(g, performance.now());
    else if (E.phase === 'over') drawOver(g, def);
  }

  function card(g, y, h) {
    g.fillStyle = 'rgba(4,2,14,.84)';
    g.strokeStyle = 'rgba(255,255,255,.15)';
    g.lineWidth = 2;
    roundRect(g, W / 2 - 300, y, 600, h, 14);
    g.fill(); g.stroke();
  }
  const blinkOn = t => Math.floor(t * 2) % 2 === 0;

  function drawReady(g, def) {
    card(g, H / 2 - 195, 380);
    const cx = W / 2;
    txt(g, def.title, cx, H / 2 - 138, 46, def.color, 'center', 'rgba(0,0,0,.8)');
    txt(g, def.tagline.toUpperCase(), cx, H / 2 - 98, 15, '#9a93d6');
    let y = H / 2 - 52;
    for (const c of def.controls) {
      txt(g, '[ ' + c[0] + ' ]', cx - 60, y, 15, '#ffd94d', 'center', 'rgba(0,0,0,.8)');
      txt(g, c[1], cx + 105, y, 15, '#e8e6ff', 'center', 'rgba(0,0,0,.8)');
      y += 26;
    }
    txt(g, 'BEST  ' + fmt(RH.store.best(def.id)), cx, y + 12, 15, '#ffd94d');
    if (blinkOn(performance.now() / 1000)) {
      txt(g, 'PRESS SPACE TO START', cx, H / 2 + 152, 23, '#fff', 'center', 'rgba(0,0,0,.85)');
    }
  }

  function drawPaused(g, now) {
    card(g, H / 2 - 110, 210);
    const cx = W / 2;
    txt(g, 'PAUSED', cx, H / 2 - 62, 40, '#fff', 'center', 'rgba(0,0,0,.8)');
    txt(g, 'P  RESUME', cx, H / 2 - 6, 17, '#e8e6ff');
    if (now < E.quitArmUntil) {
      if (blinkOn(now / 180)) txt(g, 'ESC AGAIN TO QUIT TO LOBBY', cx, H / 2 + 30, 17, '#ff5d7d');
    } else {
      txt(g, 'ESC  QUIT TO LOBBY', cx, H / 2 + 30, 15, '#9a93d6');
    }
  }

  function drawOver(g, def) {
    card(g, H / 2 - 160, 320);
    const cx = W / 2;
    txt(g, def.overTitle || 'GAME OVER', cx, H / 2 - 108, 44, '#ff5d5d', 'center', 'rgba(0,0,0,.85)');
    txt(g, 'FINAL SCORE', cx, H / 2 - 58, 15, '#9a93d6');
    txt(g, String(Math.round(E.score)), cx, H / 2 - 18, 48, '#fff', 'center', 'rgba(0,0,0,.85)');
    if (E.newBest && blinkOn(performance.now() / 220)) {
      txt(g, '* NEW HIGH SCORE *', cx, H / 2 + 32, 21, '#ffd94d');
    } else if (!E.newBest) {
      txt(g, 'BEST  ' + fmt(RH.store.best(def.id)), cx, H / 2 + 32, 16, '#ffd94d');
    }
    if (blinkOn(performance.now() / 1000)) {
      txt(g, 'SPACE RETRY   ·   ESC LOBBY', cx, H / 2 + 92, 19, '#fff');
    }
  }

  return {
    attach, start, beginPlay, quit, togglePause, escPressed, primaryPressed,
    get phase() { return E.phase; },
    get def() { return E.def; },
    get score() { return E.score; },
    get lives() { return E.lives; },
    get onEnd() { return E.onEnd; },
    set onEnd(f) { E.onEnd = f; },
    get onQuit() { return E.onQuit; },
    set onQuit(f) { E.onQuit = f; },
    get _api() { return api; },
    _endRun: endRun,
  };
})();
