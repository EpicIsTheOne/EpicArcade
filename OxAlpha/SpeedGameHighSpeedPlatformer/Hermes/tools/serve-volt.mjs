// Static file server for the VOLT RUNNER build (web root = <repo>/voltrunner/).
// Isolated port recorded in voltrunner/server.json. No dependencies.
import http from 'node:http';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../voltrunner/', import.meta.url));
const argPort = Number(process.argv[2] || 0); // never trust ambient PORT env

function isFree(port) {
  return new Promise((res) => {
    const s = http.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}

let port = argPort;
if (!port) {
  for (const p of [9371, 9372, 9373, 9414, 9415, 9561, 9612]) {
    if (await isFree(p)) { port = p; break; }
  }
  if (!port) { console.error('no free port found'); process.exit(1); }
} else {
  if (!(await isFree(port))) { console.error(`port ${port} busy`); process.exit(1); }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = normalize(join(root, urlPath));
  if (!filePath.startsWith(normalize(root))) { res.writeHead(403); res.end(); return; }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  writeFileSync(join(root, 'server.json'), JSON.stringify({
    port, pid: process.pid, root: 'voltrunner/', startedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`VOLT RUNNER serving http://127.0.0.1:${port}/  (pid ${process.pid})`);
});
