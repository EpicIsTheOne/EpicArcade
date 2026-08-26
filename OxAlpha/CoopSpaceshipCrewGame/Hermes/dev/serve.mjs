/*
 * Local dev/test rig for ORION RUN.
 *  - Serves the static build folder (so it behaves like the arcade host)
 *  - Terminates /ws/coop-spaceship-crew-game and drives server.mjs via its platform interface
 *  - POST /__shot?name=x.png  -> persists a screenshot into ../screenshots (run evidence)
 *
 * Usage:
 *   node dev/serve.mjs [--port N] [--smoke]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { attachWebSocketServer, bridgePlatformHandlers } from './wslib.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const RUN_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(RUN_DIR, 'Coop Spaceship Crew Game-claudeagent');
const SHOT_DIR = path.join(RUN_DIR, 'screenshots');
const SLUG = 'coop-spaceship-crew-game';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const WANT_SMOKE = args.includes('--smoke');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const u = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(BUILD_DIR, p));
  if (!file.startsWith(BUILD_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

async function loadGameServer() {
  const mod = await import(url.pathToFileURL(path.join(BUILD_DIR, 'server.mjs')).href);
  if (!mod?.default?.create) throw new Error('server.mjs must default-export create()');
  return mod.default;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && u.pathname === '/__shot') {
    const name = (u.searchParams.get('name') || 'shot').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const out = path.join(SHOT_DIR, name + '.png');
        fs.writeFileSync(out, Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: Buffer.concat(chunks).length }));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ ok: false, err: String(e) }));
      }
    });
    return;
  }
  serveStatic(req, res);
});

// Pick a free port deterministically-ish; never kill anything to get one.
async function listenFree(startPort) {
  for (let p = startPort; p < startPort + 40; p++) {
    const ok = await new Promise(resolve => {
      const probe = http.createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port near ' + startPort);
}

const platform = await loadGameServer();
let handlers = null;

const port = await listenFree(parseInt(argOf('--port', '0'), 10) || (57200 + (process.pid % 250)));
attachWebSocketServer(server, '/ws/' + SLUG, bridgePlatformHandlers({
  open: ws => handlers.open(ws),
  message: (ws, m) => handlers.message(ws, m),
  close: ws => handlers.close(ws),
}));
handlers = platform.create({ log: (...a) => console.log(...a) });
setInterval(() => { try { handlers.tick(); } catch (e) { console.error('[tick]', e); } }, platform.tickMs || 100);

await new Promise(r => server.listen(port, '127.0.0.1', r));
console.log(`[serve] build dir: ${BUILD_DIR}`);
console.log(`[serve] http://localhost:${port}/  ws=/ws/${SLUG}`);

/* ------------------------- smoke test ------------------------- */
if (WANT_SMOKE) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function client(pid, name, ci) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${SLUG}`);
    const state = { snaps: 0, lastSnap: null, evs: [], started: false, welcome: null, lobby: null };
    const waiters = [];
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'snap') { state.snaps++; state.lastSnap = m.st; }
      if (m.t === 'ev') state.evs.push(...(m.list || []));
      if (m.t === 'start') state.started = true;
      if (m.t === 'welcome') state.welcome = m;
      if (m.t === 'lobby') state.lobby = m;
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].pred(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
      }
    };
    const send = o => ws.send(JSON.stringify(o));
    const waitFor = (pred, ms = 4000) => new Promise((resolve, reject) => {
      const w = { pred, resolve }; waiters.push(w);
      setTimeout(() => reject(new Error('timeout waiting: ' + pred)), ms);
    });
    ws.onerror = e => console.log('[smoke] ws error', pid, e.message || e);
    return { ws, state, send, waitFor,
      async boot() {
        await waitFor(m => m.t === 'hello', 3000);
        send({ t: 'hello', pid, name, ci });
        await waitFor(m => m.t === 'hi');
        send({ t: 'join', room: 'TEST' });
        return waitFor(m => m.t === 'welcome');
      },
    };
  }

  let failures = 0;
  const check = (label, cond) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failures++;
  };

  try {
    const a = client('pid-A', 'Ada', 0);
    const b = client('pid-B', 'Bo', 1);
    const wa = await a.boot();
    check('host gets lobby welcome with st=null', wa && wa.st === null && Array.isArray(wa.colors));

    // second client joins same room
    b.ws.send(JSON.stringify({ t: 'hello', pid: 'pid-B', name: 'Bo', ci: 1 }));
    await b.waitFor(m => m.t === 'hi');
    b.send({ t: 'join', room: 'TEST' });
    await b.waitFor(m => m.t === 'welcome');
    await sleep(400);

    const la = a.state.lobby, lb = b.state.lobby;
    check('both clients saw roster of 2',
      !!(la && lb && la.players.length === 2 && lb.players.length === 2 &&
        la.hostPid === 'pid-A' && la.players.every(p => p.ready === false)));

    a.send({ t: 'ready', v: true }); b.send({ t: 'ready', v: true });
    // readiness propagates over a different TCP stream than start — wait for it
    const allReady = c => c.state.lobby && c.state.lobby.players.every(p => p.ready || !p.connected);
    for (let i = 0; i < 40 && !(allReady(a) && allReady(b)); i++) await sleep(100);
    check('readiness propagated to roster', allReady(a) && allReady(b));
    a.send({ t: 'start' });
    await Promise.all([a.waitFor(m => m.t === 'start'), b.waitFor(m => m.t === 'start')]);
    check('mission starts for all crew', true);

    // move around + man helm + steer + fire attempt + emote
    a.send({ t: 'move', x: 32.5 * 32, y: 9.5 * 32, fx: 1, fy: 0 });
    await sleep(150);
    a.send({ t: 'station', id: 'helm' });
    a.send({ t: 'helm', kx: 1, ky: 0 });
    b.send({ t: 'move', x: 22.5 * 32, y: 3.5 * 32, fy: 1 });
    await sleep(120);
    b.send({ t: 'station', id: 'weapons' });
    b.send({ t: 'fire' });

    // let the sim run through director events
    await sleep(9000);

    const s = a.state.lastSnap;
    check('snapshots streaming to all crew', a.state.snaps > 18 && b.state.snaps > 18);
    check('snapshot has 2 players synced', s && s.players.length === 2);
    check('both players at their consoles', s && s.players.every(p => p.station));
    check('sector 1 in progress', s && s.sector === 1 && s.phase === 'play');
    check('director produced events', a.state.evs.some(e => e.kind === 'alert' || e.kind === 'log'));

    // disconnect/reconnect mid-mission
    b.ws.close();
    await sleep(700);
    const b2 = client('pid-B', 'Bo', 1);
    const wb2 = await b2.boot();
    check('reconnect restores live mission state', !!(wb2 && wb2.st && wb2.st.phase === 'play'));
    await b2.waitFor(m => m.t === 'snap', 2500);
    check('reconnected client receives snapshots', b2.state.snaps > 0);
    b2.ws.close();

    // offline/static sanity: index.html served
    const idx = await fetch(`http://127.0.0.1:${port}/`).then(r => r.text());
    check('static index served', idx.includes('<canvas'));
    const arc = await fetch(`http://127.0.0.1:${port}/arcade.json`).then(r => r.json());
    check('arcade.json endpoint matches slug', arc.multiplayer && arc.multiplayer.endpoint === '/ws/' + SLUG);
  } catch (e) {
    console.log('FAIL  smoke threw:', e.message);
    failures++;
  }

  console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}
