'use strict';
/* GRAYLINE — Night Shift :: bootstrap, input, HUD */
window.G = window.G || {};

(() => {
  const $ = id => document.getElementById(id);
  const view = $('view');
  const ctx = view.getContext('2d');
  const W = view.width, H = view.height;

  const ui = {
    hud: $('hud'), clock: $('clock'), nightLabel: $('nightLabel'),
    powerVal: $('powerVal'), usage: $('usage'),
    officeUI: $('officeUI'), monitorStrip: $('monitorStrip'), monitorUI: $('monitorUI'),
    doorL: $('btnDoorL'), doorR: $('btnDoorR'), lightL: $('btnLightL'), lightR: $('btnLightR'),
    reboot: $('rebootBtn'), closeStrip: $('closeStrip'), map: $('map'),
    captions: $('captions'),
    title: $('titleScreen'), help: $('helpScreen'), pause: $('pauseScreen'),
    over: $('gameoverScreen'), win: $('winScreen'),
    deathCause: $('deathCause'), deathStats: $('deathStats'), winStats: $('winStats')
  };

  G.Art.init();
  G.Game.setCaptionEl(ui.captions);

  let helpOpen = false;
  let helpReturn = null;   // screen element to restore after closing help
  let prevPhase = 'title';
  let lastMapSync = 0;
  G.captionsOn = localStorage.getItem('grayline_caps') !== '0';

  /* ---------- portraits ---------- */

  function drawPortraits() {
    const A = G.Art;
    const pc = $('port-conductor').getContext('2d');
    pc.fillStyle = '#07090d'; pc.fillRect(0, 0, 120, 120);
    pc.fillStyle = A.rgrad(pc, 60, 62, 4, 66, [[0, 'rgba(120,150,190,0.14)'], [1, 'rgba(0,0,0,0)']]);
    pc.fillRect(0, 0, 120, 120);
    A.drawConductor(pc, 52, 108, 96, { lantern: false });

    const pw = $('port-wick').getContext('2d');
    pw.fillStyle = '#07090d'; pw.fillRect(0, 0, 120, 120);
    pw.fillStyle = A.rgrad(pw, 58, 66, 4, 66, [[0, 'rgba(160,220,195,0.13)'], [1, 'rgba(0,0,0,0)']]);
    pw.fillRect(0, 0, 120, 120);
    A.drawWick(pw, 46, 104, 78, {});

    const pg = $('port-girl').getContext('2d');
    pg.fillStyle = '#05070a'; pg.fillRect(0, 0, 120, 120);
    for (let i = 0; i < 900; i++) {
      const v = Math.random() * 200 | 0;
      pg.fillStyle = `rgba(${v},${v},${v},0.5)`;
      pg.fillRect(Math.random() * 120 | 0, Math.random() * 120 | 0, 2, 2);
    }
    A.drawGirl(pg, 60, 56, 1.05, 3);
  }
  drawPortraits();

  /* ---------- audio unlock ---------- */

  function userGesture() {
    G.audio.ensure();
  }
  document.addEventListener('pointerdown', userGesture, { once: false });
  document.addEventListener('keydown', userGesture, { once: false });

  /* ---------- flow control ---------- */

  function showOnly(el) {
    for (const s of [ui.title, ui.help, ui.pause, ui.over, ui.win]) s.classList.add('hidden');
    if (el) el.classList.remove('hidden');
  }

  function startShift() {
    userGesture();
    G.Game.start();
    showOnly(null);
  }

  function toMenu() {
    G.Game.toTitle();
    showOnly(ui.title);
  }

  function openHelp(open) {
    const S = G.Game.state;
    if (open === helpOpen) return;
    helpOpen = open;
    if (open) {
      const visible = [ui.title, ui.pause, ui.over, ui.win].find(s => !s.classList.contains('hidden'));
      helpReturn = visible || null;
      if ((S.phase === 'playing' || S.phase === 'powerless') && !visible) S.paused = true;
      showOnly(ui.help);
      $('capChk').checked = G.captionsOn;
    } else {
      showOnly(helpReturn);
      if (!helpReturn) S.paused = false;
    }
  }

  function setPaused(p) {
    const S = G.Game.state;
    if (helpOpen) return;
    if (p && (S.phase === 'playing' || S.phase === 'powerless')) {
      S.paused = true;
      showOnly(ui.pause);
      $('muteChk').checked = G.audio.muted;
    } else if (!p && S.paused) {
      S.paused = false;
      showOnly(null);
    }
  }

  function fillStats(el, won) {
    const S = G.Game.state;
    const rows = [
      ['survived until', G.fmtTime(Math.min(S.hourF, G.Game.SHIFT_HOURS))],
      ['threats repelled · west', S.stats.repelledW],
      ['threats repelled · east', S.stats.repelledE],
      ['system reboots', S.stats.reboots]
    ];
    if (won) rows.push(['power remaining', Math.max(0, S.power).toFixed(1) + '%']);
    el.innerHTML = rows.map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('');
  }

  function onGameOver() {
    const S = G.Game.state;
    const j = S.jumpscare || {};
    let cause;
    if (j.who === 'conductor') {
      cause = S.power <= 0
        ? 'The lights died first. Then the west door opened on its own.<br>He had been waiting in the dark the whole time.'
        : 'The WEST door stood open.<br>He doesn\'t knock twice.';
    } else if (j.who === 'wick') {
      cause = 'The east hall was dark and quiet.<br>She was already under the desk when you looked down.';
    } else {
      cause = 'Four dead feeds. Five.<br>The static leaned out of the monitor and took the room.';
    }
    ui.deathCause.innerHTML = cause;
    fillStats(ui.deathStats, false);
    showOnly(ui.over);
  }

  function onWin() {
    fillStats(ui.winStats, true);
    showOnly(ui.win);
  }

  /* ---------- input ---------- */

  $('beginBtn').addEventListener('click', startShift);
  $('retryBtn').addEventListener('click', () => { showOnly(null); G.Game.retry(); });
  $('againBtn').addEventListener('click', () => { showOnly(null); G.Game.retry(); });
  $('menuBtn').addEventListener('click', toMenu);
  $('menuBtn2').addEventListener('click', toMenu);
  $('menuBtn3').addEventListener('click', toMenu);
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('restartBtn').addEventListener('click', () => { showOnly(null); G.Game.retry(); });
  $('closeHelpBtn').addEventListener('click', () => openHelp(false));
  $('helpBtn').addEventListener('click', () => openHelp(!helpOpen));
  $('pauseBtn').addEventListener('click', () => setPaused(true));
  $('muteChk').addEventListener('change', e => {
    G.audio.ensure();
    if (G.audio.muted === e.target.checked) G.audio.toggleMute();
  });
  $('capChk').addEventListener('change', e => {
    G.captionsOn = e.target.checked;
    localStorage.setItem('grayline_caps', e.target.checked ? '1' : '0');
  });

  ui.monitorStrip.addEventListener('click', () => G.Game.toggleMonitor());
  ui.closeStrip.addEventListener('click', () => G.Game.toggleMonitor(false));
  ui.reboot.addEventListener('click', () => G.Game.reboot());
  ui.doorL.addEventListener('click', () => G.Game.toggleDoor('L'));
  ui.doorR.addEventListener('click', () => G.Game.toggleDoor('R'));
  ui.lightL.addEventListener('click', () => G.Game.toggleLight('L'));
  ui.lightR.addEventListener('click', () => G.Game.toggleLight('R'));
  ui.map.querySelectorAll('.node').forEach(n => {
    n.addEventListener('click', () => G.Game.selectCam(n.dataset.cam));
  });

  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    const S = G.Game.state;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (!S.paused && !helpOpen) G.Game.toggleMonitor();
      return;
    }
    switch (k) {
      case 'q': G.Game.toggleDoor('L'); break;
      case 'e': G.Game.toggleDoor('R'); break;
      case 'a': G.Game.toggleLight('L'); break;
      case 'd': G.Game.toggleLight('R'); break;
      case 'r': G.Game.reboot(); break;
      case 'h': openHelp(!helpOpen); break;
      case 'm': G.audio.ensure(); G.audio.toggleMute(); break;
      case 'escape':
        if (helpOpen) openHelp(false);
        else setPaused(!S.paused);
        break;
      case 'enter':
        if (S.phase === 'gameover' || S.phase === 'win') { showOnly(null); G.Game.retry(); }
        break;
      default:
        if (/^[1-7]$/.test(k)) {
          G.Game.toggleMonitor(true);
          G.Game.selectCam(G.Game.CAMS[+k - 1]);
        }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  /* ---------- per-frame UI sync ---------- */

  function syncHUD(S) {
    ui.clock.textContent = G.fmtTime(Math.min(S.hourF, 6));
    const pw = Math.max(0, S.power);
    ui.powerVal.textContent = S.phase === 'powerless' ? 'OUT' : pw.toFixed(0) + '%';

    let extras = 0;
    if (S.doors.L) extras++;
    if (S.doors.R) extras++;
    if (S.lights.L) extras++;
    if (S.lights.R) extras++;
    if (S.monitor.up && S.phase === 'playing') extras++;
    const pips = 1 + extras;
    [...ui.usage.children].forEach((el, i) => {
      const on = i < pips && S.phase !== 'powerless';
      el.className = on ? (i >= 4 ? 'on hot' : i >= 2 ? 'on warn' : 'on') : '';
    });

    ui.hud.classList.toggle('lowpower', S.phase === 'playing' && pw < 20);

    // button states
    ui.doorL.classList.toggle('active', S.doors.L);
    ui.doorR.classList.toggle('active', S.doors.R);
    ui.lightL.classList.toggle('active', S.lights.L);
    ui.lightR.classList.toggle('active', S.lights.R);

    const inPlay = S.phase === 'playing';
    ui.officeUI.style.display = (inPlay && !S.monitor.up) ? '' : 'none';
    ui.monitorStrip.style.display = (inPlay && !S.monitor.up) ? '' : 'none';
    ui.monitorUI.style.display = (inPlay && S.monitor.up) ? '' : 'none';
    ui.helpBtn.style.display = ui.pauseBtn.style.display =
      (inPlay || S.phase === 'powerless') ? '' : 'none';

    // reboot availability
    const anyCorrupt = G.Game.CAMS.some(c => S.cams[c].corrupt);
    const ready = inPlay && anyCorrupt && S.rebootT === 0 && S.power > G.Game.REBOOT_COST + 0.5;
    ui.reboot.classList.toggle('ready', !!ready);
    ui.reboot.disabled = !ready;

    // map node states (throttled)
    const now = performance.now();
    if (now - lastMapSync > 140 && S.monitor.up) {
      lastMapSync = now;
      ui.map.querySelectorAll('.node').forEach(n => {
        n.classList.toggle('active', n.dataset.cam === S.monitor.cam);
        n.classList.toggle('corrupt', S.cams[n.dataset.cam].corrupt);
      });
    }
  }

  /* ---------- main loop ---------- */

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = now - last;
    last = now;
    if (dt > 100) dt = 100;
    const S = G.Game.state;

    G.gameUpdate(dt);
    G.Render.tick(dt);

    // phase transitions
    if (prevPhase !== 'gameover' && S.phase === 'gameover') onGameOver();
    if (prevPhase !== 'win' && S.phase === 'win') onWin();
    prevPhase = S.phase;

    syncHUD(S);
    G.Render.draw(ctx, W, H);
  }
  requestAnimationFrame(frame);
})();
