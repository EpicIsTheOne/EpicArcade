// DEV ONLY — local harness that loads the game's server.mjs exactly like the
// platform would (no listen inside server.mjs; this wrapper owns the ports).
// Serves the static build folder and bridges /ws/party-minigames to the handler.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(__dirname, '..', 'Multiplayer Party Minigame Collection-opencode');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function freePort(start, cb) {
  const s = net.createServer();
  s.once('error', () => freePort(start + 1, cb));
  s.once('listening', () => s.close(() => cb(start)));
  s.listen(start, '127.0.0.1');
}

freePort(8941, (PORT) => {
  const mod = import(pathToFileUrl(path.join(BUILD, 'server.mjs')));
  let handler = null;
  mod.then((m) => {
    handler = m.default.create({});
    setInterval(() => { try { handler.tick(50); } catch (e) { console.error('tick err', e); } }, 50);
    console.log('[dev] server.mjs loaded, ticking at 50ms');
  }).catch((e) => { console.error('failed to load server.mjs:', e); process.exit(1); });

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fp = path.normalize(path.join(BUILD, urlPath === '/' ? 'index.html' : urlPath));
    if (!fp.startsWith(BUILD)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  let connN = 0;
  server.on('upgrade', (req, sock, head) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/ws/party-minigames')) { sock.destroy(); return; }
    wss.handleUpgrade(req, sock, head, (ws) => {
      const id = 'c' + (++connN);
      const wrap = {
        id,
        send: (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
        close: (code) => { try { ws.close(code || 1000); } catch {} },
        query: u.searchParams,
        ip: req.socket.remoteAddress,
      };
      ws.on('message', (d) => { try { handler.message(wrap, d.toString()); } catch (e) { console.error('msg err', e); } });
      ws.on('close', () => { try { handler.close(wrap); } catch (e) { console.error('close err', e); } });
      ws.on('error', () => {});
      handler.open(wrap);
      console.log(`[dev] ws open ${id} ${u.search}`);
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[dev] http://127.0.0.1:${PORT}/  (serving ${BUILD})`);
  });
});

function pathToFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/').split('?')[0].split('#')[0].replace(/ /g, '%20');
}
