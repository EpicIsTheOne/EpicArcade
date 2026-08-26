// Velocity Rush — static dev server (project-local tool)
// Binds 127.0.0.1 on the port given via --port or PORT env (default 8942).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argPort = process.argv.includes('--port') ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10) : null;
const wantPort = argPort || parseInt(process.env.PORT || '8942', 10);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(root, urlPath));
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
});

server.on('error', (e) => {
  console.error(`[server] port ${wantPort} unavailable (${e.code}). Choose another free port; do NOT kill foreign processes.`);
  process.exit(2);
});

server.listen(wantPort, HOST, () => {
  const { port } = server.address();
  const pid = process.pid;
  fs.writeFileSync(path.join(root, 'server.json'), JSON.stringify({
    port, pid, host: HOST, url: `http://${HOST}:${port}/`,
    started: new Date().toISOString(), project: 'Velocity Rush (SpeedGame High Speed Platformer)'
  }, null, 2));
  console.log(`[server] Velocity Rush serving ${root}`);
  console.log(`[server] PID ${pid} -> http://${HOST}:${port}/`);
});
