// Static dev server for KINETIC RUSH. Port recorded in PORT.txt (default 8871).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const pub = path.join(root, 'public');
// PORT.txt is authoritative for this run; env PORT is ignored because the host
// environment exports an unrelated global PORT.
let port = 0;
try { port = parseInt(fs.readFileSync(path.join(root, 'PORT.txt'), 'utf8').trim(), 10); } catch {}
if (!port) port = parseInt(process.env.PORT || '', 10);
if (!port) port = 7878;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(pub, urlPath));
    if (!filePath.startsWith(pub)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end();
  }
});

server.on('error', (e) => {
  console.error('server error', e.code);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => console.log(`KINETIC RUSH serving http://127.0.0.1:${port}/`));
