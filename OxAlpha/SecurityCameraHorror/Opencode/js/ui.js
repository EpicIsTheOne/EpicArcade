'use strict';
/* GRAYLINE — Night Shift :: DOM UI — HUD, screens, toasts, jumpscare player */
window.G = window.G || {};

G.ui = {
  el: {},
  hudAcc: 0,
  screenName: null,

  init() {
    const ids = ['view', 'fxview', 'hud', 'hud-clock', 'hud-night', 'power-pct', 'power-fill', 'pips',
      'warn', 'feedinfo', 'feed-label', 'feed-sig', 'feed-boost',
      'sidebar', 'ctrls', 'toasts', 'overlay',
      'b-cam', 'b-light-L', 'b-door-L', 'b-hatch', 'b-door-R', 'b-light-R', 'b-boost', 'b-mute'];
    for (const id of ids) this.el[id.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = document.getElementById(id);
    this.fx = this.el.fxview.getContext('2d');
    this.buildSidebar();
    this.bindButtons();
  },

  buildSidebar() {
    const sb = this.el.sidebar;
    sb.innerHTML = '';
    G.CAM_ORDER.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = 'camrow';
      b.dataset.node = id;
      b.innerHTML = '<span class="key">' + (i + 1) + '</span>' + G.MAP.names[id] +
        '<div class="sigbar"><div class="sigfill"></div></div>';
      b.addEventListener('click', () => { G.game.setCam(id); b.blur(); });
      sb.appendChild(b);
    });
  },

  bindButtons() {
    const g = () => G.game;
    const on = (el, fn) => el.addEventListener('click', () => { fn(); el.blur(); });
    on(this.el.bCam, () => g().toggleCams());
    on(this.el.bDoorL, () => g().toggleDoor('L'));
    on(this.el.bDoorR, () => g().toggleDoor('R'));
    on(this.el.bLightL, () => g().toggleLight('L'));
    on(this.el.bLightR, () => g().toggleLight('R'));
    on(this.el.bHatch, () => g().toggleHatch());
    on(this.el.bMute, () => {
      G.audio.ensure();
      const muted = G.audio.toggleMute();
      this.el.bMute.textContent = muted ? 'UNMUTE' : 'MUTE';
    });
    this.el.bBoost.addEventListener('pointerdown', e => { e.preventDefault(); g().setBoost(true); });
    window.addEventListener('pointerup', () => g().setBoost(false));
  },

  /* ---------- generic ---------- */
  hideOverlay() {
    this.el.overlay.innerHTML = '';
    this.el.overlay.classList.add('empty');
    this.screenName = null;
  },

  screen(name, html) {
    this.el.overlay.classList.remove('empty');
    this.el.overlay.innerHTML = html;
    this.screenName = name;
    return this.el.overlay.firstElementChild;
  },

  toast(msg, alert) {
    const t = document.createElement('div');
    t.className = 'toast' + (alert ? ' alert' : '');
    t.textContent = msg;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2800);
  },

  /* ---------- screens ---------- */
  showTitle() {
    const g = G.game;
    this.leaveNight();
    const best = g.loadProgress();
    const sc = this.screen('title',
      '<div class="screen">' +
        '<div class="title-logo">GRAYLINE</div>' +
        '<div class="title-sub">FREIGHT &amp; STORAGE — NIGHT WATCH TERMINAL v2.3</div>' +
        '<div class="menu">' +
          '<button class="mbtn primary" id="m-start">CLOCK IN — NIGHT ' + best + '</button>' +
          '<button class="mbtn" id="m-help">SITE ORIENTATION</button>' +
          '<button class="mbtn" id="m-settings">SETTINGS</button>' +
        '</div>' +
        '<div class="footer-hint">HEADPHONES RECOMMENDED · M MUTE · ESC PAUSE</div>' +
      '</div>');
    sc.querySelector('#m-start').addEventListener('click', () => { G.audio.ensure(); g.startNight(best); });
    sc.querySelector('#m-help').addEventListener('click', () => this.showHelp());
    sc.querySelector('#m-settings').addEventListener('click', () => this.showSettings());
  },

  showBriefing(night) {
    const paras = [
      'NEW HIRE PACKET — GRAYLINE FREIGHT & STORAGE, PIER 9 ANNEX',
      'Shift runs 12 AM to 6 AM. Your job is simple: keep the building — and yourself — intact until sunrise.',
      'After dark, things move through the depot. You will hear them before you see them. Camera signal drifts all night; feeds lie when it drops low. HOLD BOOST to cut through static — boosting eats battery.',
      'Your booth has a WEST DOOR, an EAST DOOR and an overhead HATCH SHUTTER. Closed barriers drain battery fast. If the battery dies, the locks release.',
      'Tap a hall LIGHT to check the doorway. If something is standing there, shut the door and wait it out. It loses interest. Eventually.',
      'WICK only moves when nobody is watching its camera. Pin it on a feed and it freezes.',
      'Do not open for anyone. Do not follow the voices. Clock out at 6 AM.\n— MGMT'
    ];
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const sc = this.screen('briefing',
      '<div class="screen"><div class="panel">' +
        '<div class="screen-title">NIGHT ' + night + ' BRIEFING</div>' +
        '<div class="memo-body" id="memo"></div>' +
        '<div class="row-btns">' +
          '<button class="mbtn" id="b-skip">SKIP</button>' +
          '<button class="mbtn primary" id="b-begin">BEGIN SHIFT</button>' +
        '</div>' +
      '</div></div>');
    const memo = sc.querySelector('#memo');
    let pi = 0, ci = 0, done = false;
    const render = txt => { memo.innerHTML = txt; memo.scrollTop = memo.scrollHeight; };
    const finish = () => { done = true; render(paras.map(p => '<p>' + esc(p) + '</p>').join('')); };
    const timer = setInterval(() => {
      if (done) return;
      if (pi >= paras.length) { finish(); return; }
      ci += 2;
      const p = paras[pi];
      if (ci >= p.length) {
        pi++; ci = 0;
        render(paras.slice(0, pi).map(x => '<p>' + esc(x) + '</p>').join(''));
      } else {
        render(paras.slice(0, pi).map(x => '<p>' + esc(x) + '</p>').join('') +
          '<p>' + esc(p.slice(0, ci)) + '<span class="memo-cursor"></span></p>');
        if (ci % 6 === 0) G.audio.typeTick();
      }
    }, 28);
    sc.querySelector('#b-skip').addEventListener('click', () => { done = true; clearInterval(timer); finish(); });
    sc.querySelector('#b-begin').addEventListener('click', () => {
      done = true; clearInterval(timer);
      G.audio.ensure();
      G.game.resetRuntime();
      G.game.begin();
    });
  },

  showHelp(back) {
    this.helpBack = back || (() => this.showTitle());
    const sc = this.screen('help',
      '<div class="screen"><div class="panel">' +
        '<div class="screen-title">SITE ORIENTATION</div>' +
        '<div class="dossier"><h3><span class="tag">WEST APPROACH</span>THE FOREMAN</h3>' +
          '<p>A tall silhouette in an old slicker. Walks the west rooms toward your WEST DOOR. Heavy footsteps mean close; knocking means closer. Light the hall to confirm. Shut the door. Wait until he moves off.</p></div>' +
        '<div class="dossier"><h3><span class="tag">EAST APPROACH</span>THE MANGE</h3>' +
          '<p>A writhing nest of cabling and worse. Fast, erratic, favors the east service halls. Skittering in the walls is your warning. Slam the EAST DOOR early, release once the sound stops.</p></div>' +
        '<div class="dossier"><h3><span class="tag">VENT NETWORK</span>WICK</h3>' +
          '<p>A cold ember crawling the ceiling vents toward the hatch above your desk. It only travels while its camera is unobserved — pin it on a feed and it freezes. Blinking hatch light means DROP THE SHUTTER.</p></div>' +
        '<table class="ctrl-table">' +
          '<tr><td><kbd>SPACE</kbd></td><td>raise / lower camera monitor</td></tr>' +
          '<tr><td><kbd>1</kbd>–<kbd>8</kbd> / <kbd>←</kbd> <kbd>→</kbd></td><td>switch camera feed</td></tr>' +
          '<tr><td><kbd>B</kbd> hold</td><td>SIGNAL BOOST — cuts static, drains battery</td></tr>' +
          '<tr><td><kbd>A</kbd> / <kbd>D</kbd></td><td>west / east door</td></tr>' +
          '<tr><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>west / east hall light</td></tr>' +
          '<tr><td><kbd>W</kbd></td><td>hatch shutter</td></tr>' +
          '<tr><td><kbd>M</kbd> / <kbd>ESC</kbd></td><td>mute / pause</td></tr>' +
        '</table>' +
        '<p style="margin-top:14px;font-size:14px;color:#bfae8e;line-height:1.6">Everything draws one battery. Dead battery means dead locks. Survive until 6 AM.</p>' +
        '<div class="row-btns"><button class="mbtn" id="b-back">BACK</button></div>' +
      '</div></div>');
    sc.querySelector('#b-back').addEventListener('click', () => this.helpBack());
  },

  showSettings() {
    const sc = this.screen('settings',
      '<div class="screen"><div class="panel">' +
        '<div class="screen-title">SETTINGS</div>' +
        '<div class="set-row"><span>MASTER VOLUME</span><input type="range" id="s-vol" min="0" max="100" step="5"></div>' +
        '<div class="set-row"><span>REDUCE FLASHING</span><input type="checkbox" id="s-flash"></div>' +
        '<div class="set-row"><span>NIGHT PROGRESS</span><button class="mbtn danger" id="s-reset" style="min-width:170px;padding:8px 14px;font-size:14px">RESET TO NIGHT 1</button></div>' +
        '<div class="row-btns"><button class="mbtn" id="b-back">BACK</button></div>' +
      '</div></div>');
    const vol = sc.querySelector('#s-vol');
    vol.value = Math.round(G.audio.vol() * 100);
    vol.addEventListener('input', () => G.audio.setVol(vol.value / 100));
    const flash = sc.querySelector('#s-flash');
    flash.checked = localStorage.getItem('grayline_flash') === '1';
    flash.addEventListener('change', () => localStorage.setItem('grayline_flash', flash.checked ? '1' : '0'));
    sc.querySelector('#s-reset').addEventListener('click', () => {
      G.game.resetProgress();
      const st = sc.querySelector('#m-start-note');
      this.toast('PROGRESS RESET');
      if (st) st.textContent = '';
    });
    sc.querySelector('#b-back').addEventListener('click', () => this.showTitle());
  },

  showPause() {
    const sc = this.screen('pause',
      '<div class="screen"><div class="panel" style="text-align:center">' +
        '<div class="screen-title">SHIFT PAUSED</div>' +
        '<div class="row-btns" style="flex-direction:column;align-items:center;gap:12px;margin-top:24px">' +
          '<button class="mbtn primary" id="p-resume">RESUME</button>' +
          '<button class="mbtn" id="p-restart">RESTART NIGHT</button>' +
          '<button class="mbtn danger" id="p-quit">QUIT TO MENU</button>' +
        '</div>' +
      '</div></div>');
    sc.querySelector('#p-resume').addEventListener('click', () => this.resume());
    sc.querySelector('#p-restart').addEventListener('click', () => { G.game.paused = false; G.game.quickStart(); });
    sc.querySelector('#p-quit').addEventListener('click', () => { G.game.paused = false; this.showTitle(); });
  },

  resume() {
    G.game.paused = false;
    this.hideOverlay();
  },

  showWin(g) {
    this.leaveNight();
    const rank = (g.power >= 40 && g.stats.closeCalls <= 3) ? 'UNSHAKEN'
      : (g.stats.closeCalls <= 7 ? 'STEADY HANDS' : 'BY A THREAD');
    const sc = this.screen('win',
      '<div class="screen"><div class="panel" style="text-align:center;border-color:rgba(89,217,140,.4)">' +
        '<div class="screen-title" style="color:#a9edc3">06:00 AM — SHIFT COMPLETE</div>' +
        '<div class="big-verdict">“' + rank + '”</div>' +
        '<div class="stats-grid">' +
          '<span class="k">BATTERY LEFT</span><span class="v">' + Math.round(g.power) + '%</span>' +
          '<span class="k">DOORS HELD</span><span class="v">' + g.stats.blocks + '</span>' +
          '<span class="k">CLOSE CALLS</span><span class="v">' + g.stats.closeCalls + '</span>' +
          '<span class="k">NEXT SHIFT</span><span class="v">NIGHT ' + (g.night + 1) + '</span>' +
        '</div>' +
        '<div class="row-btns">' +
          '<button class="mbtn primary" id="w-next">CLOCK IN AGAIN</button>' +
          '<button class="mbtn" id="w-menu">MENU</button>' +
        '</div>' +
      '</div></div>');
    sc.querySelector('#w-next').addEventListener('click', () => g.startNight(g.night + 1));
    sc.querySelector('#w-menu').addEventListener('click', () => this.showTitle());
  },

  showLose(kind, g) {
    this.leaveNight();
    const effKind = (kind !== 'wick' && g && g.blackout && kind === 'foreman' && g.doomT <= 0) ? 'blackout' : kind;
    const CAUSE = {
      foreman: ['THE FOREMAN reached your WEST DOOR.', 'Footsteps on the west side mean check the hallway with a light. Shut the door only when something is there — battery is life.'],
      mange: ['THE MANGE poured through the EAST DOOR.', 'Skittering in the east walls is your only warning. Slam the door early, release it once the sound stops.'],
      wick: ['WICK dropped through the hatch above you.', 'It only moves while unwatched. Keep its camera up, and drop the shutter the moment the hatch light blinks.'],
      blackout: ['THE DARK FOUND YOU.', 'The battery ran dry and every lock released. Close doors only when you must — and pray for sunrise.']
    };
    const c = CAUSE[effectKindFix(effKind)] || CAUSE.foreman;
    function effectKindFix(k) { return CAUSE[k] ? k : 'foreman'; }
    const sc = this.screen('lose',
      '<div class="screen"><div class="panel" style="border-color:rgba(255,75,71,.45)">' +
        '<div class="screen-title" style="color:#ff8d8a">FEED TERMINATED</div>' +
        '<div class="lose-cause">' + c[0] + '</div>' +
        '<div class="lose-tip">' + c[1] + '</div>' +
        '<div class="stats-grid">' +
          '<span class="k">SURVIVED UNTIL</span><span class="v">' + ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM'][G.clamp(g ? g.hour : 0, 0, 5)] + '</span>' +
          '<span class="k">NIGHT</span><span class="v">' + (g ? g.night : 1) + '</span>' +
        '</div>' +
        '<div class="row-btns">' +
          '<button class="mbtn primary" id="l-retry">TRY AGAIN</button>' +
          '<button class="mbtn" id="l-menu">MENU</button>' +
        '</div>' +
      '</div></div>');
    sc.querySelector('#l-retry').addEventListener('click', () => g.startNight(g.night));
    sc.querySelector('#l-menu').addEventListener('click', () => this.showTitle());
  },

  /* ---------- night chrome ---------- */
  enterNight(g) {
    this.hideOverlay();
    this.hideScare();
    this.el.hud.classList.remove('hidden');
    this.el.ctrls.classList.remove('hidden');
    this.syncButtons(g);
    this.syncSidebar(g);
  },

  leaveNight() {
    this.el.hud.classList.add('hidden');
    this.el.ctrls.classList.add('hidden');
    this.el.feedinfo.classList.add('hidden');
    this.el.sidebar.classList.add('hidden');
    this.el.warn.classList.add('hidden');
  },

  syncButtons(g) {
    const tog = (el, on2) => el.classList.toggle('on', !!on2);
    tog(this.el.bCam, g.camsUp);
    tog(this.el.bDoorL, g.doors.L);
    tog(this.el.bDoorR, g.doors.R);
    tog(this.el.bHatch, g.hatch);
    this.el.bLightL.classList.toggle('lit', !!g.lights.L);
    this.el.bLightR.classList.toggle('lit', !!g.lights.R);
    this.el.bLightL.classList.remove('on');
    this.el.bLightR.classList.remove('on');
    tog(this.el.bBoost, g.boostEase > 0.25 || (g.boostHeld && g.camsUp));
    this.el.bMute.textContent = G.audio.muted ? 'UNMUTE' : 'MUTE';
    [this.el.bCam, this.el.bDoorL, this.el.bDoorR, this.el.bHatch].forEach(b => { b.disabled = !!g.blackout; });
    this.syncSidebar(g);
  },

  syncSidebar(g) {
    if (!this.el.sidebar || !this.el.sidebar.children.length) return;
    for (const row of this.el.sidebar.children) {
      const id = row.dataset.node;
      row.classList.toggle('cur', g.camsUp && g.curCam === id);
      const sig = g.effSig(id);
      row.querySelector('.sigfill').style.width = Math.round(sig * 100) + '%';
      row.classList.toggle('blind', sig < 0.42);
    }
  },

  hudTick(dt, g) {
    this.hudAcc += dt;
    if (this.hudAcc < 0.1) return;
    this.hudAcc = 0;
    if (g.mode !== 'night' && g.mode !== 'jumpscare') return;

    this.el.hudClock.textContent = G.fmtTime(Math.min(g.hourFloat(), 5.99));
    this.el.hudNight.textContent = 'NIGHT ' + g.night;
    const p = Math.max(0, g.power);
    this.el.powerPct.textContent = Math.round(p) + '%';
    this.el.powerFill.style.width = p + '%';
    this.el.powerFill.style.background = p < 12 ? '#ff4b47' : (p < 25 ? '#ff7a47' : '#ffb347');
    const nPips = G.clamp(Math.ceil((g.rate || 0.1) / 0.09), 1, 5);
    let pipHtml = '';
    for (let i = 0; i < nPips; i++) pipHtml += '<i></i>';
    this.el.pips.innerHTML = pipHtml;
    this.el.pips.style.color = nPips >= 4 ? '#ff4b47' : '#ffb347';

    const low = !g.blackout && g.mode === 'night';
    this.el.warn.classList.toggle('hidden', !(low && p < 25));
    this.el.warn.textContent = p < 12 ? 'CRITICAL POWER' : 'LOW POWER';

    const feeds = g.camsUp && !g.blackout;
    this.el.feedinfo.classList.toggle('hidden', !feeds);
    this.el.sidebar.classList.toggle('hidden', !feeds);
    if (feeds) {
      const camIdx = G.CAM_ORDER.indexOf(g.curCam);
      this.el.feedLabel.textContent = 'CAM ' + String(camIdx + 1).padStart(2, '0') + ' · ' + G.MAP.names[g.curCam];
      const es = g.effSig(g.curCam);
      this.el.feedSig.textContent = 'SIG ' + String(Math.round(es * 100)).padStart(2, '0') + '%';
      this.el.feedSig.style.color = es < 0.42 ? '#ff8d8a' : '#cfe3d6';
      this.el.feedBoost.classList.toggle('hidden', g.boostEase <= 0.3);
      this.syncSidebar(g);
    }
  },

  /* ---------- jumpscare ---------- */
  playScare(kind, cb) {
    const cv = this.el.fxview;
    cv.classList.remove('hidden');
    const ctx = this.fx;
    const dur = 1150;
    const t0 = performance.now();
    const reduce = localStorage.getItem('grayline_flash') === '1';
    const stepFn = now => {
      const p = (now - t0) / dur;
      if (p >= 1) {
        this.hideScare();
        if (cb) cb();
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      G.FX.scareFace(ctx, kind, p, reduce);
      requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  },

  hideScare() {
    this.el.fxview.classList.add('hidden');
  }
};
