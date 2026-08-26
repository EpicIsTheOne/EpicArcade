import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const pidFile = process.argv.includes("--pidfile")
  ? process.argv[process.argv.indexOf("--pidfile") + 1]
  : null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const CANONICAL = path.join(root, "tools", "ct-canonical.html");

const port = await getFreePort();
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath === "/index.html") {
    fs.readFile(CANONICAL, (err, data) => {
      if (err) { res.writeHead(500); res.end("missing canonical build"); return; }
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
      res.end(data);
    });
    return;
  }
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(path.normalize(root))) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  const line = JSON.stringify({ pid: process.pid, port });
  if (pidFile) fs.writeFileSync(pidFile, line);
  console.log("DEVSERVER_READY http://127.0.0.1:" + port + " " + line);
});
