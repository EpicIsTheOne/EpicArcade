// Party Blitz — application flow: menus, lobby, match lifecycle, input.
(function () {
  const R = window.PBR;
  const c2d = document.getElementById('cv').getContext('2d');
  const Audio = window.PBAudio;
  const Net = window.PBNet;
  const V = window.PBGAMES;

  const $ = (id) => document.getElementById(id);
  const el = {
    menu: $('screen-menu'), lobby: $('screen-lobby'), podium: $('screen-podium'),
    hud: $('hud'), intro: $('overlay-intro'), count: $('overlay-count'),
    results: $('overlay-results'), banner: $('banner'), bannerText: $('banner-text'),
    toasts: $('toasts'),
    inpName: $('inp-name'), inpCode: $('inp-code'),
    btnCreate: $('btn-create'), btnJoin: $('btn-join'), menuStatus: $('menu-status'),
    lobbyPlayers: $('lobby-players'), btnStart: $('btn-start'), lobbyHint: $('lobby-hint'),
    btnLeave: $('btn-leave'), btnMute: $('btn-mute'), btnCopy: $('btn-copy-code'),
    chkQuick: $('chk-quick'), quickWrap: $('quick-wrap'),
    hudGame: $('hud-game'), hudRound: $('hud-round'), hudTimerFill: $('hud-timer-fill'),
    hudScores: $('hud-scores'), hudHint: $('hud-hint'),
    touch: $('touch-controls'), tcAct: $('tc-act'),
    introRound: $('intro-round'), introName: $('intro-name'), introTag: $('intro-tag'),
    introHowto: $('intro-howto'), introControls: $('intro-controls'),
    countNum: $('count-num'),
    resultsList: $('results-list'), resultsTitle: $('results-title'),
    podiumTop: $('podium-top'), podiumBoard: $('podium-board'),
    btnAgain: $('btn-again'), podiumWait: $('podium-wait'), btnPodiumLeave: $('btn-podium-leave'),
  };

  const App = {
    screen: 'menu',
    myPid: null, roomCode: null, hostPid: null,
    players: new Map(),       // pid -> {pid,name,score,idx,color}
    phase: 'menu',            // menu | lobby | intro | countdown | play | results | podium
    gameKey: null, view: null, roundInfo: null,
    dirHeld: new Set(),
    podiumTimer: null,
  };

  // ------------------------------------------------------------- utilities
  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }
  function showScreen(name) {
    for (const s of [el.menu, el.lobby, el.podium]) hide(s);
    hide(el.hud); hide(el.intro); hide(el.count); hide(el.results);
    if (name === 'menu') show(el.menu);
    if (name === 'lobby') show(el.lobby);
    if (name === 'podium') show(el.podium);
    if (name === 'game') show(el.hud);
    App.screen = name;
  }
  function toast(msg, ms = 2400) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    el.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  }
  function shake(v) { R.shake = Math.max(R.shake, v); }

  // api passed into game views --------------------------------------------
  const api = {
    myPid: () => App.myPid,
    gameKey: () => App.gameKey,
    nameOf: (pid) => (App.players.get(pid) || {}).name || '?',
    colorOf: (pid) => {
      const p = App.players.get(pid);
      return p ? p.color : '#8b93b8';
    },
    playerList: () => [...App.players.values()],
    sfx: (name) => Audio.play(name),
    burst: (x, y, c, n) => x != null && R.burst(x, y, c, n),
    shake,
    toast: (m) => toast(m, 1400),
    sendIn: (k, d, i) => {
      const m = { t: 'in', k };
      if (d) m.d = d;
      if (i != null) m.i = i;
      Net.send(m);
    },
  };

  // ------------------------------------------------------------ connection
  let intent = null; // 'create' | 'join' | null
  let joinedOnce = false;

  function sessionQuery() {
    const name = encodeURIComponent(el.inpName.value.trim() || 'Player');
    if (App.roomCode && App.myPid) return `code=${App.roomCode}&pid=${App.myPid}&name=${name}`;
    return null;
  }
  function connect(intentMode) {
    intent = intentMode;
    const q = sessionQuery();
    Net.connect(q || undefined);
  }

  Net.onOpen = () => {
    hide(el.banner);
    if (!joinedOnce && intent) {
      if (intent === 'create') Net.send({ t: 'create', name: el.inpName.value.trim() || 'Player' });
      else Net.send({ t: 'join', code: el.inpCode.value.trim().toUpperCase(), name: el.inpName.value.trim() || 'Player' });
      joinedOnce = true;
      intent = null;
    } else {
      // reconnection with query params — server auto-rejoins
      if (App.roomCode && App.screen !== 'menu') toast('Reconnected!');
    }
  };
  Net.onClose = (willRetry) => {
    if (App.roomCode && willRetry) {
      el.bannerText.textContent = 'Connection lost — retrying…';
      show(el.banner);
      const q = sessionQuery();
      if (q) Net._lastQuery = q;
    }
  };
  Net.onMsg = handleMessage;

  function resetToMenu(msg) {
    Net.disconnect();
    joinedOnce = false; intent = null;
    App.myPid = null; App.roomCode = null; App.hostPid = null;
    App.players.clear(); App.phase = 'menu'; App.gameKey = null; App.view = null;
    stopPodiumConfetti();
    localStorage.removeItem('pb.session');
    showScreen('menu');
    if (msg) toast(msg);
  }

  // ------------------------------------------------------------- messaging
  function handleMessage(m) {
    switch (m.t) {
      case 'welcome': {
        App.myPid = m.pid;
        App.roomCode = m.code;
        localStorage.setItem('pb.session', JSON.stringify({ pid: m.pid, code: m.code }));
        hide(el.banner);
        break;
      }
      case 'room': {
        if (!App.myPid) break;
        App.hostPid = m.host;
        const seen = new Set();
        let changed = m.players.length !== App.players.size;
        for (const p of m.players) {
          seen.add(p.pid);
          let cur = App.players.get(p.pid);
          if (!cur) {
            cur = { pid: p.pid, name: p.name, score: p.score, idx: App.players.size, color: R.playerColor(App.players.size) };
            App.players.set(p.pid, cur);
            changed = true;
            if (p.pid !== App.myPid && joinedOnce) Audio.play('join');
          } else {
            if (cur.name !== p.name) { cur.name = p.name; changed = true; }
            if (cur.score !== p.score) { cur.score = p.score; changed = true; }
          }
          cur.connected = p.connected;
          cur.isHost = p.host;
        }
        for (const pid of [...App.players.keys()]) {
          if (!seen.has(pid)) { App.players.delete(pid); changed = true; }
        }
        // reindex colors compactly
        let i = 0;
        for (const p of App.players.values()) {
          if (p.idx !== i) { p.idx = i; p.color = R.playerColor(i); }
          i++;
        }

        App.roundInfo = m.round;

        if (m.phase === 'lobby') {
          App.phase = 'lobby';
          renderLobby();
          if (App.screen !== 'lobby') { showScreen('lobby'); stopPodiumConfetti(); }
        } else if (App.screen === 'menu' || App.screen === 'lobby') {
          // joined mid-match: jump straight into spectate/play UI
          enterGameScreen();
        }
        if (changed && (App.screen === 'game')) renderScoreSidebar();
        if (changed && App.screen === 'lobby') renderLobby();
        break;
      }
      case 'intro': {
        App.gameKey = m.key;
        App.view = newView(m.key);
        App.phase = 'intro';
        enterGameScreen();
        const meta = V[m.key].meta;
        el.introRound.textContent = `ROUND ${m.idx + 1} / ${m.total}`;
        el.introName.textContent = meta.name;
        el.introTag.textContent = meta.tagline;
        el.introHowto.innerHTML = '';
        for (const h of meta.howto) {
          const li = document.createElement('li');
          li.textContent = h;
          el.introHowto.appendChild(li);
        }
        el.introControls.textContent = meta.controls;
        el.hudGame.textContent = meta.name;
        el.hudRound.textContent = `${m.idx + 1} / ${m.total}`;
        el.hudHint.textContent = meta.hint;
        el.hudTimerFill.style.width = '100%';
        hide(el.results); hide(el.count);
        show(el.intro);
        Audio.play('whoosh');
        setupTouchFor(m.key);
        renderScoreSidebar();
        break;
      }
      case 'count': {
        hide(el.intro);
        App.phase = 'countdown';
        show(el.count);
        el.countNum.classList.remove('go');
        el.countNum.style.animation = 'none';
        void el.countNum.offsetWidth;
        el.countNum.style.animation = '';
        el.countNum.textContent = m.n;
        Audio.play('tick');
        break;
      }
      case 'go': {
        App.phase = 'play';
        el.countNum.textContent = 'GO!';
        el.countNum.classList.add('go');
        Audio.play('go');
        setTimeout(() => hide(el.count), 500);
        break;
      }
      case 'snap': {
        if (!App.view) break;
        V[App.gameKey].snap(App.view, m.s);
        const frac = m.dur > 0 ? Math.max(0, 1 - m.tm / m.dur) : 1;
        el.hudTimerFill.style.width = (frac * 100).toFixed(1) + '%';
        el.hudTimerFill.style.background = frac < 0.25
          ? 'linear-gradient(90deg,#ff5c7a,#ff9f43)'
          : 'linear-gradient(90deg,var(--p5),var(--p3),var(--p2))';
        break;
      }
      case 'ev': {
        if (!App.view) break;
        const def = V[App.gameKey];
        if (def.event) def.event(App.view, m.k, m, api);
        break;
      }
      case 'results': {
        App.phase = 'results';
        hide(el.count); hide(el.intro);
        renderResults(m.rank);
        Audio.play('fanfare');
        for (const r of m.rank) {
          const p = App.players.get(r.pid);
          if (p) p.score = r.total;
        }
        renderScoreSidebar();
        break;
      }
      case 'final': {
        App.phase = 'podium';
        hide(el.results); hide(el.count); hide(el.intro);
        renderPodium(m.board);
        Audio.play('fanfare');
        break;
      }
      case 'toast': {
        if (App.screen !== 'menu') toast(m.msg);
        break;
      }
      case 'err': {
        toast(m.msg || 'Error');
        if (m.gone) resetToMenu('Room closed');
        break;
      }
    }
  }

  // ------------------------------------------------------------------ views
  function newView(key) {
    const v = {};
    V[key].enter(v);
    return v;
  }

  function enterGameScreen() {
    showScreen('game');
  }

  // ------------------------------------------------------------------ lobby
  function renderLobby() {
    el.btnCopy.textContent = App.roomCode || '----';
    el.lobbyPlayers.innerHTML = '';
    const total = 8;
    const players = [...App.players.values()];
    for (let i = 0; i < Math.max(total, players.length); i++) {
      const div = document.createElement('div');
      div.className = 'pslot';
      const p = players[i];
      if (p) {
        div.classList.add('full');
        if (!p.connected) div.classList.add('off');
        div.innerHTML = `<span class="pdot" style="color:${p.color}"></span>
          <span class="pname"></span>${p.isHost ? '<span class="ptag host">HOST</span>' : ''}`;
        div.querySelector('.pname').textContent = p.name;
        if (p.pid === App.myPid) div.style.borderColor = 'rgba(255,255,255,.35)';
      } else {
        div.innerHTML = `<span class="pdot" style="color:#2a3158"></span><span class="pname" style="color:#4a5378">open slot</span>`;
      }
      el.lobbyPlayers.appendChild(div);
    }
    const meIsHost = App.hostPid === App.myPid;
    const n = players.filter(p => p.connected).length;
    if (meIsHost) {
      el.btnStart.disabled = n < 2;
      el.btnStart.textContent = n < 2 ? 'Need ≥ 2 players…' : '🚀 Start Match!';
    } else {
      el.btnStart.disabled = true;
      el.btnStart.textContent = 'Waiting for host…';
    }
    el.quickWrap.style.display = meIsHost ? '' : 'none';
    el.lobbyHint.textContent = `${n}/8 players · first to the top of the leaderboard after 5 rounds wins`;
  }

  function renderScoreSidebar() {
    const rows = [...App.players.values()].sort((a, b) => b.score - a.score);
    el.hudScores.innerHTML = '';
    for (const p of rows) {
      const div = document.createElement('div');
      div.className = 'hs-row' + (p.pid === App.myPid ? ' me' : '');
      div.innerHTML = `<span class="pdot" style="color:${p.color}"></span><span class="hs-name"></span><span class="hs-score">${p.score}</span>`;
      div.querySelector('.hs-name').textContent = p.name;
      el.hudScores.appendChild(div);
    }
  }

  function renderResults(rank) {
    el.resultsTitle.textContent = 'Round Results';
    el.resultsList.innerHTML = '';
    rank.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'res-row' + (i === 0 ? ' first' : '');
      li.innerHTML = `<span class="res-rank">${['🥇', '🥈', '🥉'][i] || (i + 1)}.</span>
        <span class="res-name"></span>
        <span class="res-total">Σ ${r.total}</span>
        <span class="res-pts">${r.pts > 0 ? '+' + r.pts : '—'}</span>`;
      li.querySelector('.res-name').textContent = r.name;
      if (r.pid === App.myPid) li.style.borderColor = 'rgba(255,255,255,.4)';
      el.resultsList.appendChild(li);
    });
    show(el.results);
  }

  // ----------------------------------------------------------------- podium
  function renderPodium(board) {
    showScreen('podium');
    el.podiumTop.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    const order = [[1, board[1]], [0, board[0]], [2, board[2]]];
    for (const [place, b] of order) {
      if (!b) continue;
      const p = App.players.get(b.pid);
      const col = p ? p.color : '#8b93b8';
      const div = document.createElement('div');
      div.className = `pedestal ped-${place + 1}`;
      div.innerHTML = `
        <div class="ped-face" style="color:${col};background:${col}33;border:3px solid ${col}">
          <span style="filter:none;color:${col}"></span>${medals[place]}</div>
        <div class="ped-name"></div>
        <div class="ped-score">${b.score} pts</div>
        <div class="ped-block">${place + 1}</div>`;
      div.querySelector('.ped-name').textContent = b.name;
      el.podiumTop.appendChild(div);
    }
    el.podiumBoard.innerHTML = '';
    board.forEach((b, i) => {
      if (i < 3) return;
      const li = document.createElement('li');
      li.className = 'pb-row';
      li.innerHTML = `<span class="pb-rank">${i + 1}.</span><span class="pb-name"></span><span class="pb-score">${b.score}</span>`;
      li.querySelector('.pb-name').textContent = b.name;
      el.podiumBoard.appendChild(li);
    });
    const meIsHost = App.hostPid === App.myPid;
    el.btnAgain.classList.toggle('hidden', !meIsHost);
    el.podiumWait.classList.toggle('hidden', meIsHost);
    startPodiumConfetti();
  }
  function startPodiumConfetti() {
    stopPodiumConfetti();
    const cols = R.COLORS;
    App.podiumTimer = setInterval(() => {
      R.burst(Math.random() * 1280, -10, cols[(Math.random() * cols.length) | 0], 8, 160, 1.6, 6);
    }, 420);
  }
  function stopPodiumConfetti() {
    if (App.podiumTimer) { clearInterval(App.podiumTimer); App.podiumTimer = null; }
    R.clearParticles();
  }

  // ------------------------------------------------------------------ input
  const DIRKEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function sendDirVector() {
    let x = 0, y = 0;
    for (const k of App.dirHeld) { x += DV[k][0]; y += DV[k][1]; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    api.sendIn('dir', [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  }

  function gameAction() {
    if (App.phase !== 'play' || !App.gameKey) return;
    const handled = V[App.gameKey].input('act', null, api);
    if (!handled) api.sendIn('act');
  }

  function moveStep(dirName) {
    if (App.phase !== 'play' || !App.gameKey) return;
    const ok = V[App.gameKey].input('step', DV[dirName], api);
    if (!ok) { /* continuous games use held-vector */ }
  }

  window.addEventListener('keydown', (e) => {
    Audio.unlock();
    if (e.repeat) { e.preventDefault(); return; }
    const dir = DIRKEYS[e.code];
    if (dir) e.preventDefault();

    // menu shortcuts
    if (App.screen === 'menu') {
      if (e.code === 'Enter') {
        if (document.activeElement === el.inpCode) el.btnJoin.click();
        else el.btnCreate.click();
      }
      return;
    }

    if (App.phase !== 'play') {
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
      return;
    }

    if (App.gameKey === 'match') {
      const cur = V.match.cursor;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') cur.i = (cur.i - 6 + 24) % 24;
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') cur.i = (cur.i + 6) % 24;
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cur.i = (cur.i + 23) % 24;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') cur.i = (cur.i + 1) % 24;
      else return;
      e.preventDefault();
    } else if (dir) {
      if (App.gameKey === 'tiles' || App.gameKey === 'rush') moveStep(dir);
      else if (App.gameKey === 'dodge') {
        App.dirHeld.add(dir);
        sendDirVector();
      }
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      gameAction();
    }
  });
  window.addEventListener('keyup', (e) => {
    const dir = DIRKEYS[e.code];
    if (dir && App.gameKey === 'dodge') {
      App.dirHeld.delete(dir);
      sendDirVector();
    }
  });

  cv.addEventListener('pointerdown', (e) => {
    Audio.unlock();
    if (App.phase !== 'play' || !App.view || !App.gameKey) return;
    const pt = R.toVirtual(e.clientX, e.clientY);
    if (App.gameKey === 'match') {
      V.match.click(App.view, pt.x, pt.y, api);
    } else {
      gameAction();
    }
  });

  // touch controls
  function setupTouchFor(key) {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const needsPad = key === 'tiles' || key === 'rush' || key === 'dodge';
    el.touch.classList.toggle('hidden', !(isTouch && needsPad));
  }
  el.touch.querySelectorAll('.tc-btn').forEach((b) => {
    const dir = b.dataset.d;
    const down = (e) => {
      e.preventDefault(); Audio.unlock();
      if (App.gameKey === 'dodge') { App.dirHeld.add(dir); sendDirVector(); }
      else moveStep(dir);
    };
    const up = (e) => {
      e.preventDefault();
      if (App.gameKey === 'dodge') { App.dirHeld.delete(dir); sendDirVector(); }
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
  });
  el.tcAct.addEventListener('pointerdown', (e) => {
    e.preventDefault(); Audio.unlock();
    if (App.gameKey === 'match') return;
    gameAction();
  });

  // ---------------------------------------------------------------- buttons
  el.btnCreate.addEventListener('click', () => {
    Audio.unlock(); Audio.play('click');
    const name = el.inpName.value.trim();
    if (!name) { el.menuStatus.textContent = 'Pick a nickname first!'; el.inpName.focus(); return; }
    localStorage.setItem('pb.name', name);
    el.menuStatus.textContent = 'Creating room…';
    App.roomCode = null; App.myPid = null;
    connect('create');
  });
  el.btnJoin.addEventListener('click', () => {
    Audio.unlock(); Audio.play('click');
    const name = el.inpName.value.trim();
    const code = el.inpCode.value.trim().toUpperCase();
    if (!name) { el.menuStatus.textContent = 'Pick a nickname first!'; el.inpName.focus(); return; }
    if (code.length !== 4) { el.menuStatus.textContent = 'Enter the 4-letter room code'; el.inpCode.focus(); return; }
    localStorage.setItem('pb.name', name);
    el.menuStatus.textContent = 'Joining…';
    App.roomCode = null; App.myPid = null;
    connect('join');
  });
  el.btnStart.addEventListener('click', () => {
    Audio.play('click');
    Net.send({ t: 'start', quick: el.chkQuick.checked });
  });
  el.btnAgain.addEventListener('click', () => {
    Audio.play('click');
    Net.send({ t: 'again' });
  });
  function leaveRoom() {
    Audio.play('leave');
    resetToMenu(null);
  }
  el.btnLeave.addEventListener('click', leaveRoom);
  el.btnPodiumLeave.addEventListener('click', leaveRoom);
  el.btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(App.roomCode || '');
      toast('Code copied!');
    } catch (e) {
      toast(`Code: ${App.roomCode}`);
    }
    Audio.play('pop');
  });
  function refreshMuteLabel() { el.btnMute.textContent = Audio.isMuted() ? '🔇' : '🔊'; }
  el.btnMute.addEventListener('click', () => { Audio.toggleMute(); refreshMuteLabel(); });
  refreshMuteLabel();

  el.inpCode.addEventListener('input', () => {
    el.inpCode.value = el.inpCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });
  el.inpName.addEventListener('input', () => {
    el.inpName.value = el.inpName.value.slice(0, 14);
  });

  // deep link ?room=CODE
  try {
    const u = new URLSearchParams(location.search);
    if (u.get('room')) el.inpCode.value = u.get('room').toUpperCase().slice(0, 4);
    const sess = JSON.parse(localStorage.getItem('pb.session') || 'null');
    if (sess && sess.code && !u.get('room')) el.inpCode.value = sess.code;
  } catch (e) {}
  el.inpName.value = localStorage.getItem('pb.name') || '';

  // ------------------------------------------------------------- main loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    R.beginFrame(dt);
    if (App.view && App.gameKey && (App.screen === 'game')) {
      try { V[App.gameKey].draw(App.view, dt, api); }
      catch (e) { /* never let a view error kill the loop */ }
    }
    R.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // keep-alive for dodge direction if socket hiccups mid-hold
  setInterval(() => {
    if (App.phase === 'play' && App.gameKey === 'dodge' && App.dirHeld.size) sendDirVector();
  }, 900);
})();
