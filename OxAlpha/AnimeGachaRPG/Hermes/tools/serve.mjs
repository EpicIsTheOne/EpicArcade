// STARWEAVE — tiny static file server (run-scoped)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || '9107', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
};

const server = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      // SPA fallback to index
      fp = path.join(ROOT, 'index.html');
    }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('err');
  }
});

server.on('error', (e) => {
  console.error(`[starweave] port ${PORT} unavailable: ${e.code}. Pick another free port (PORT=xxxx node tools/serve.mjs). Do NOT kill other processes.`);
  process.exit(2);
});
server.listen(PORT, '127.0.0.1', () => console.log(`[starweave] serving ${ROOT} at http://127.0.0.1:${PORT} (pid ${process.pid})`));
