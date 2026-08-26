/* HOLLOW SIGNAL — local static dev server (Node builtins only).
   Usage: node dev-server.mjs [port]   */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2]) || 8613;

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.json':'application/json', '.ico':'image/x-icon', '.md':'text/markdown; charset=utf-8',
};

const server = http.createServer(async (req,res)=>{
  try{
    let p = decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(p==='/') p='/index.html';
    const fp = normalize(join(root,p));
    if(!fp.startsWith(root)){ res.writeHead(403); res.end(); return; }
    const data = await readFile(fp);
    res.writeHead(200,{'Content-Type':MIME[extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  }catch(e){
    res.writeHead(404); res.end('not found');
  }
});
server.listen(port,()=>console.log(`HOLLOW SIGNAL dev server → http://localhost:${port}`));
server.on('error',e=>{ console.error('server error:',e.message); process.exit(1); });
