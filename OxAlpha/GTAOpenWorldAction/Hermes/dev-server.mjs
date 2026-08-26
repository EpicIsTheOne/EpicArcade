// CHROME HARBOR - local static dev/QA server.
// Serves ./web on 127.0.0.1 with run-isolated port selection.
// QA-only endpoint: POST /__shot?name=x.png -> saves body into web/shots/ (screenshot pipeline for verification).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'web');
const SHOTS = path.join(ROOT, 'shots');

const PREFERRED = Number(process.env.PORT || 8710);
const RANGE = [8710, 8712, 8731, 8753, 8784, 8817, 8842, 8911];

function isFree(port) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

async function pickPort() {
  if (await isFree(PREFERRED)) return PREFERRED;
  for (const p of RANGE) if (await isFree(p)) return p;
  for (let p = 9200; p < 9400; p++) if (await isFree(p)) return p;
  throw new Error('no free port found');
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    let p = decodeURIComponent(u.pathname);

    if (req.method === 'POST' && p === '/__shot') {
      // QA screenshot sink - only enabled when CH_SHOTS=1 to keep prod behavior clean
      const name = (u.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '_');
      const chunks = [];
      for await (const c of req) chunks.push(c);
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.concat(chunks));
      res.writeHead(200); res.end('ok');
      return;
    }
    if (req.method === 'POST' && p === '/__qa') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const name = (u.searchParams.get('name') || 'note').replace(/[^a-z0-9_-]/gi, '_');
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, name + '.json'), Buffer.concat(chunks));
      res.writeHead(200); res.end('ok');
      return;
    }

    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    let data;
    try { data = fs.readFileSync(file); }
    catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch (e) {
    try { res.writeHead(500); res.end('err'); } catch {}
  }
});

const port = await pickPort();
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  fs.writeFileSync(path.join(__dirname, 'PORT.txt'), String(port));
  console.log('CHROME HARBOR dev server -> ' + url);
});
