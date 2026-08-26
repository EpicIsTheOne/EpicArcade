// Two-client reproduction of the smoke 'start' hang, with full message tracing
import http from 'node:http';
import urlmod from 'node:url';
import pathmod from 'node:path';
import { attachWebSocketServer, bridgePlatformHandlers } from './wslib.mjs';

const BUILD = pathmod.join(pathmod.dirname(urlmod.fileURLToPath(import.meta.url)), '..', 'Coop Spaceship Crew Game-claudeagent');
const plat = await import(urlmod.pathToFileURL(pathmod.join(BUILD, 'server.mjs')).href);
const handlers = plat.default.create({ log: (...a) => console.log('[srv]', ...a) });

const srv = http.createServer();
attachWebSocketServer(srv, '/ws/x', bridgePlatformHandlers({
  open: ws => handlers.open(ws),
  message: (ws, m) => handlers.message(ws, m),
  close: ws => handlers.close(ws),
}));
setInterval(() => handlers.tick(), 100);
await new Promise(r => srv.listen(57442, '127.0.0.1', r));
console.log('up');

function client(pid, name) {
  const ws = new WebSocket('ws://127.0.0.1:57442/ws/x');
  const state = { msgs: [] };
  ws.onmessage = e => { state.msgs.push(e.data.slice(0, 60)); console.log('>>', pid, e.data.slice(0, 70)); };
  ws.onerror = e => console.log('!!', pid, e.message || e);
  const send = o => { console.log('->', pid, JSON.stringify(o)); ws.send(JSON.stringify(o)); };
  const waitFor = async (desc, pred, ms = 4000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const hit = state.msgs.find(s => pred(s));
      if (hit) { clearInterval(iv); resolve(hit); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout: ' + desc)); }
    }, 50);
  });
  return { state, send, waitFor };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const a = client('A', 'Ada');
const b = client('B', 'Bo');
await sleep(300);
a.send({ t: 'hello', pid: 'pid-A', name: 'Ada', ci: 0 });
await sleep(150);
a.send({ t: 'join', room: 'TEST' });
await sleep(300);
b.send({ t: 'hello', pid: 'pid-B', name: 'Bo', ci: 1 });
await sleep(150);
b.send({ t: 'join', room: 'TEST' });
await sleep(400);

console.log('--- ready/start ---');
a.send({ t: 'ready', v: true });
b.send({ t: 'ready', v: true });
a.send({ t: 'start' });

try {
  await a.waitFor('A start', s => s.includes('"t":"start"'));
  await b.waitFor('B start', s => s.includes('"t":"start"'));
  console.log('START RECEIVED BY BOTH');
} catch (e) {
  console.log('ERR', e.message);
}
await sleep(500);
process.exit(0);
