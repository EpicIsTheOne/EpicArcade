import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 9741);
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.wasm':'application/wasm'
};
const server = createServer(async (req,res)=>{
  try{
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    const path = normalize(join(root, url));
    if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(path);
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  }catch(e){
    res.writeHead(404); res.end('not found');
  }
});
server.listen(port,'127.0.0.1',()=>{
  console.log(`VoxelForge serving http://127.0.0.1:${port}`);
});
