// ISLEBREAK local server — binds 127.0.0.1 only, port from PORTS.txt
// Never kills anything; if port busy at startup, pick another free one.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '.');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function freePort(start) {
  return new Promise((res) => {
    const probe = http.createServer();
    probe.once('error', () => res(freePort(start + Math.floor(Math.random() * 7) + 1)));
    probe.once('listening', () => probe.close(() => res(start)));
    probe.listen(start, '127.0.0.1');
  });
}

const preferred = parseInt(fs.readFileSync(path.join(ROOT, 'PORTS.txt'), 'utf8').trim(), 10);
const PORT = await freePort(preferred);

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('nope'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found: ' + p); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

srv.listen(PORT, '127.0.0.1', () => {
  console.log(`ISLEBREAK serving on http://127.0.0.1:${PORT}/ (preferred ${preferred})`);
});
