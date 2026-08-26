// Tiny static dev server for local verification. Probes a free port, serves cwd.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon'
};

function tryListen(port) {
  return new Promise(res => {
    const s = net.createServer();
    s.once('error', () => res(null));
    s.once('listening', () => s.close(() => res(port)));
    s.listen(port, '127.0.0.1');
  });
}

let port = null;
for (let p = 8932; p < 9040; p++) { if ((await tryListen(p)) !== null) { port = p; break; } }
if (!port) { console.error('NO_FREE_PORT'); process.exit(1); }

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let fp = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!fp.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`READY http://127.0.0.1:${port}/ pid=${process.pid}`);
});
