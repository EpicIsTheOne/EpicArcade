/* Nyx DAW — tiny static file server (localhost only).
   Binds 127.0.0.1 starting at PORT env or 8760; falls forward if taken.
   Never kills or touches other processes' ports. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const START_PORT = parseInt(process.env.PORT || '8760', 10);
const MAX_TRIES = 25;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav'
};

function start(port) {
  const server = http.createServer(function (req, res) {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch (e) { res.writeHead(400); return res.end('bad request'); }
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(filePath, function (err, data) {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise(function (resolve, reject) {
    server.once('error', function (e) {
      if (e.code === 'EADDRINUSE') resolve(null);
      else reject(e);
    });
    server.listen(port, '127.0.0.1', function () { resolve(server); });
  });
}

(async function main() {
  let port = START_PORT, server = null;
  for (let i = 0; i < MAX_TRIES && !server; i++) {
    server = await start(port);
    if (!server) { console.log('[nyx] port ' + port + ' in use — trying next'); port++; }
  }
  if (!server) { console.error('[nyx] no free port found near ' + START_PORT); process.exit(1); }
  console.log('[nyx] Nyx DAW serving at http://127.0.0.1:' + port + '/');
})();
