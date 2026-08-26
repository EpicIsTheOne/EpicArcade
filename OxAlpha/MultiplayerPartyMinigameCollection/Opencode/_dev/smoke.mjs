// DEV ONLY — headless protocol smoke test: 3 clients, full quick match.
const PORT = process.argv[2] || 8941;
let started = false;

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/party-minigames`);
  const st = { name, pid: null, key: null, timers: [], ws };
  ws.onopen = () => {
    if (name === 'Alice') ws.send(JSON.stringify({ t: 'create', name }));
    else {
      const iv = setInterval(() => {
        if (global.code) { clearInterval(iv); ws.send(JSON.stringify({ t: 'join', code: global.code, name })); }
      }, 150);
    }
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') {
      st.pid = m.pid;
      if (!global.code) { global.code = m.code; console.log('ROOM=' + m.code); }
    }
    if (m.t === 'err') { console.log('ERR', name, m.msg); }
    if (m.t === 'room' && name === 'Alice' && !started && st.pid &&
        m.players.filter(p => p.connected).length >= 3 && m.phase === 'lobby') {
      started = true;
      setTimeout(() => ws.send(JSON.stringify({ t: 'start', quick: true })), 300);
      log('starting quick match');
    }
    if (m.t === 'intro') { st.key = m.key; stopPlay(st); log('round', m.idx + 1, m.key); }
    if (m.t === 'go') play(st);
    if (m.t === 'results') log(' results:', m.rank.map(r => `${r.name}:+${r.pts}(Σ${r.total})`).join(' '));
    if (m.t === 'final') {
      log('FINAL:', m.board.map(b => `${b.name}:${b.score}`).join(' | '));
      if (name === 'Alice') setTimeout(() => { console.log('SMOKE OK'); process.exit(0); }, 400);
    }
    if (name === 'Alice' && !['snap'].includes(m.t)) log('  [A]', m.t);
  };
  ws.onclose = () => { log('closed', name); };
}

function stopPlay(st) {
  for (const t of st.timers) clearInterval(t);
  st.timers = [];
}
function play(st) {
  stopPlay(st);
  const send = (m) => { if (st.ws.readyState === 1) st.ws.send(JSON.stringify(m)); };
  let lane = 1;
  const k = st.key;
  if (k === 'tiles') st.timers.push(setInterval(() => send({ t: 'in', k: 'step', d: [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)] }), 330));
  else if (k === 'draw') st.timers.push(setInterval(() => send({ t: 'in', k: 'act' }), 500 + Math.random() * 500));
  else if (k === 'rush') {
    st.timers.push(setInterval(() => send({ t: 'in', k: 'act' }), 650));
    st.timers.push(setInterval(() => { lane = Math.floor(Math.random() * 3); send({ t: 'in', k: 'step', d: [0, lane - 1] }); }, 1500));
  } else if (k === 'dodge') st.timers.push(setInterval(() => { const a = Math.random() * 6.28; send({ t: 'in', k: 'dir', d: [+Math.cos(a).toFixed(2), +Math.sin(a).toFixed(2)] }); }, 350));
  else if (k === 'match') st.timers.push(setInterval(() => send({ t: 'in', k: 'tile', i: Math.floor(Math.random() * 24) }), 700));
}

client('Alice'); setTimeout(() => client('Bob'), 600); setTimeout(() => client('Cara'), 1200);
setTimeout(() => { console.log('TIMEOUT — no final'); process.exit(1); }, 5 * 60 * 1000);
