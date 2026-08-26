// PRISM PULSE — tiny static server for local testing. Node builtins only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) throw new Error('traversal');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  // unique per-run filename: parallel agents clobber generic "server.json"
  const out = process.env.RUN_DIR ? join(process.env.RUN_DIR, 'rhythm-run01-server.json') : 'rhythm-run01-server.json';
  writeFileSync(out, JSON.stringify({ port, pid: process.pid, startedAt: new Date().toISOString() }, null, 1));
  console.log('SERVING port=' + port + ' pid=' + process.pid);
});
