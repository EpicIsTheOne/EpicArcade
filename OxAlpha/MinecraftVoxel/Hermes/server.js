// Minecraft-Hermes local dev server (project-owned, binds 127.0.0.1 only)
// Port policy: this project claims 8477 (verified free at creation). If occupied
// at launch, pass --port <n> to use another free port. Never kills other processes.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEFAULT_PORT = 8477;
let PORT = DEFAULT_PORT;
const argIdx = process.argv.indexOf('--port');
if (argIdx !== -1 && process.argv[argIdx + 1]) PORT = parseInt(process.argv[argIdx + 1], 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    // Save API: POST /api/save/<name>  (writes into saves/), GET /api/save/<name>
    if (urlPath.startsWith('/api/save/')) {
      const name = urlPath.slice('/api/save/'.length).replace(/[^a-zA-Z0-9_-]/g, '') || 'world';
      const file = path.join(ROOT, 'saves', name + '.json');
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 64 * 1024 * 1024) req.destroy(); });
        req.on('end', () => {
          try {
            JSON.parse(body); // validate
            fs.mkdirSync(path.join(ROOT, 'saves'), { recursive: true });
            fs.writeFileSync(file, body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, bytes: Buffer.byteLength(body) }));
          } catch (e) {
            res.writeHead(400); res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      } else {
        fs.readFile(file, (err, data) => {
          if (err) { res.writeHead(404); res.end(JSON.stringify({ ok: false })); }
          else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(data); }
        });
      }
      return;
    }
    const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const candidates = [path.join(ROOT, 'public', safe), path.join(ROOT, safe)];
    let served = false;
    for (const file of candidates) {
      if (served) break;
      if (!file.startsWith(path.join(ROOT, 'public')) && !file.startsWith(ROOT)) continue;
      try {
        const st = fs.statSync(file);
        if (!st.isFile()) continue;
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(file).pipe(res);
        served = true;
      } catch (e) { void e; }
    }
    if (!served) { res.writeHead(404); res.end('not found'); }
  } catch (e) {
    res.writeHead(500); res.end('server error');
  }
});

server.on('error', (e) => {
  console.error(`[Minecraft-Hermes] port ${PORT} error: ${e.code || e.message}`);
  console.error('Pick another free port and start with: node server.js --port <n>');
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Minecraft-Hermes] serving on http://127.0.0.1:${PORT}/  (pid ${process.pid})`);
});
