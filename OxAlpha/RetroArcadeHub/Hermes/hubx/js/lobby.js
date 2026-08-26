/* @oxalpha-retrohub-run02 */
/* RETRO ARCADE HUB — lobby: cabinets, themes rack, high scores, ticker, help */
ARC.lobby = (() => {
  const U = ARC.util;
  const $ = s => document.querySelector(s);

  let selected = 0;
  let cabEls = [], promoCanvases = [], rackEls = [];
  let helpOpen = false;

  function build() {
    const wrap = $('#cabinets');
    ARC.games.forEach((g, i) => {
      const el = document.createElement('div');
      el.className = 'cab';
      el.setAttribute('role', 'option');
      el.innerHTML = `
        <div class="cab-inner">
          <div class="cab-marquee">${g.name}</div>
          <div class="cab-screen"><canvas width="150" height="200"></canvas></div>
          <div class="cab-tag"><span class="cab-hi" id="hi-${g.id}">HI 0000000</span><span>${g.id.toUpperCase()}</span></div>
          <div class="cab-coin"><span>INSERT COIN</span></div>
        </div>`;
      el.style.setProperty('--gm1', g.gm1);
      el.style.setProperty('--gm2', g.gm2);
      el.style.setProperty('--gm-glow', g.gmGlow);
      el.addEventListener('mouseenter', () => select(i, false));
      el.addEventListener('click', () => { if (selected === i) ARC.app.launch(i); else select(i, true); });
      wrap.appendChild(el);
      cabEls.push(el);
      promoCanvases.push(el.querySelector('canvas').getContext('2d'));
    });

    // theme rack
    const rack = $('#rack-items');
    ARC.store.THEMES.forEach(t => {
      const it = document.createElement('div');
      it.className = 'rack-item';
      const v = t.vars;
      it.innerHTML = `<span class="sw"><i style="background:${v['--accent']}"></i><i style="background:${v['--accent2']}"></i><i style="background:${v['--bg2']}"></i></span><span class="nm">${t.name}</span><span class="req"></span>`;
      it.addEventListener('click', () => {
        if (ARC.store.unlockedThemes().includes(t.id)) {
          ARC.store.applyTheme(t.id);
          ARC.audio.sfx.uiOk();
          refresh();
        }
      });
      rack.appendChild(it);
      rackEls.push(it);
    });

    // help content
    const hg = $('#help-games');
    ARC.games.forEach(g => {
      const d = document.createElement('div');
      d.className = 'help-game';
      d.style.setProperty('--hg', g.color);
      d.innerHTML = `<h3>${g.name}</h3><p>${g.help}</p><p><b>${g.controls.join(' · ')}</b></p>`;
      hg.appendChild(d);
    });
    $('#help-close').addEventListener('click', () => toggleHelp(false));

    $('#snd-state').textContent = ARC.store.isMuted() ? 'OFF' : 'ON';
    select(0, false);
    refresh();
  }

  function select(i, sound) {
    selected = U.clamp(i, 0, ARC.games.length - 1);
    cabEls.forEach((el, k) => el.classList.toggle('selected', k === selected));
    if (sound !== false) ARC.audio.sfx.uiMove();
    cabEls[selected].scrollIntoView({ block: 'nearest' });
  }

  function refresh() {
    // career
    $('#career-total').textContent = U.pad7(ARC.store.total());
    // cab hi-scores
    ARC.games.forEach(g => {
      $(`#hi-${g.id}`).textContent = 'HI ' + U.pad7(ARC.store.best(g.id));
    });
    // theme name + rack states
    const cur = ARC.store.currentTheme();
    const curT = ARC.store.THEMES.find(t => t.id === cur);
    $('#theme-name').textContent = 'THEME: ' + (curT ? curT.name : cur.toUpperCase());
    const unlocked = ARC.store.unlockedThemes();
    rackEls.forEach((el, i) => {
      const t = ARC.store.THEMES[i];
      el.classList.toggle('locked', !unlocked.includes(t.id));
      el.classList.toggle('active', t.id === cur);
      el.querySelector('.req').textContent = t.req === 0 ? '' : (unlocked.includes(t.id) ? '★' : U.pad7(t.req));
    });
    // high-score board (per-game bests ranked)
    const bi = $('#board-items');
    bi.innerHTML = '';
    [...ARC.games].map(g => ({ n: g.name, s: ARC.store.best(g.id), id: g.id }))
      .sort((a, b) => b.s - a.s)
      .forEach((r, i) => {
        const d = document.createElement('div');
        d.className = 'board-item' + (i === 0 && r.s > 0 ? ' first' : '');
        d.innerHTML = `<span class="n">${r.n}</span><span class="s">${U.pad7(r.s)}</span>`;
        bi.appendChild(d);
      });
    if (!ARC.store.runs().length) {
      const d = document.createElement('div');
      d.className = 'board-item';
      d.innerHTML = '<span class="n">no runs yet…</span>';
      bi.appendChild(d);
    }
    // ticker
    const runs = ARC.store.runs();
    const tk = $('#ticker');
    tk.innerHTML = runs.length
      ? runs.map(r => {
          const g = ARC.games.find(x => x.id === r.g);
          return `<b>${g ? g.name : r.g}</b> ${U.pad7(r.s)}${r.nb ? ' <span style="color:#ff2e88">★NEW</span>' : ''}<span class="sep">◆</span>`;
        }).join('')
      : 'INSERT COIN — SELECT A CABINET AND PRESS ENTER<span class="sep">◆</span>EARN CAREER SCORE TO UNLOCK CABINET THEMES<span class="sep">◆</span>PRESS H FOR HOW TO PLAY';
  }

  function toggleHelp(force) {
    helpOpen = force !== undefined ? force : !helpOpen;
    $('#help-overlay').hidden = !helpOpen;
    ARC.audio.sfx.uiOk();
  }

  // ---- background fx ----
  let shootT = 3, shoots = [];
  function drawBg(t, dt) {
    const cv = $('#bgfx'), c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);

    // perspective grid
    const hz = H * .42;
    c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#26264a';
    c.globalAlpha = .5; c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const x0 = W / 2 + (i - 6) * 26, x1 = W / 2 + (i - 6) * 260;
      c.moveTo(W / 2 + (x0 - W / 2) * .4, hz);
      c.lineTo(x1, H);
    }
    const scroll = (t * 40) % 44;
    for (let y = hz + scroll, k = 0; y < H; y += 44 * ++k * .35 + 20) c.moveTo(0, y), c.lineTo(W, y);
    c.stroke();

    // horizon glow line
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim() || '#28e0ff';
    c.globalAlpha = .8;
    const lg = c.createLinearGradient(0, hz - 40, 0, hz + 40);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(.5, acc); lg.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = .25; c.fillStyle = lg;
    c.fillRect(0, hz - 40, W, 80);

    // shooting stars
    shootT -= dt;
    if (shootT <= 0) { shootT = U.rand(2, 6); shoots.push({ x: U.rand(0, W), y: U.rand(0, hz * .8), vx: U.rand(-260, -140), vy: U.rand(60, 130), t: 0 }); }
    c.globalAlpha = 1;
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.t > .8 || s.x < -30) { shoots.splice(i, 1); continue; }
      c.strokeStyle = 'rgba(255,255,255,.7)';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + 22, s.y - 8); c.stroke();
    }

    c.globalAlpha = 1;
  }

  function update(t, dt) {
    drawBg(t, dt);
    // promo attract screens (~20fps is plenty)
    ARC.games.forEach((g, i) => {
      const c = promoCanvases[i];
      g.cls.prototype.promo.call({ W: 480, H: 640 }, c, 150, 200, t + i * 1.7);
    });

    const inp = ARC.input;
    if (helpOpen) {
      if (inp.anyPressed('KeyH', 'Escape')) toggleHelp(false);
      return;
    }
    if (inp.pressed('ArrowLeft')) select(selected - 1, true);
    if (inp.pressed('ArrowRight')) select(selected + 1, true);
    if (inp.pressed('ArrowUp') || inp.pressed('ArrowDown')) ARC.audio.sfx.uiMove();
    if (inp.anyPressed('Enter', 'Space')) ARC.app.launch(selected);
    if (inp.pressed('KeyT')) {
      const th = ARC.store.cycleTheme(1);
      ARC.audio.sfx.uiOk();
      refresh();
    }
    if (inp.pressed('KeyH')) toggleHelp(true);
    if (inp.pressed('KeyM')) ARC.app.toggleMute();
  }

  return { build, select, refresh, update, toggleHelp, get selected() { return selected; } };
})();
