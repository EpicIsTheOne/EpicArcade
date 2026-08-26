// Tiny static dev server for local testing (no dependencies).
// Also accepts POST /__shot to persist screenshot dataURLs into screenshots/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.dirname(url.fileURLToPath(import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

let basePort = Number(process.argv[2] || process.env.PORT || 8614);
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && u.pathname === '/__shot') {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size < 25 * 1024 * 1024) chunks.push(c); });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const name = String(body.name || 'shot').replace(/[^a-z0-9_-]/gi, '_');
        const m = /^data:image\/(\w+);base64,(.*)$/s.exec(body.data || '');
        if (!m) throw new Error('bad data url');
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
        const out = path.join(root, 'screenshots', `${name}.${ext}`);
        fs.writeFileSync(out, Buffer.from(m[2], 'base64'));
        console.log(`[shot] ${out}`);
        res.writeHead(200); res.end('ok ' + out);
      } catch (e) {
        res.writeHead(400); res.end('err ' + e.message);
      }
    });
    return;
  }
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && basePort < basePort + 25) {
    basePort += 1;
    server.listen(basePort);
  } else {
    console.error('server error', e.message);
    process.exit(1);
  }
});

server.listen(basePort, () => {
  console.log(`READY http://localhost:${server.address().port}/`);
});
