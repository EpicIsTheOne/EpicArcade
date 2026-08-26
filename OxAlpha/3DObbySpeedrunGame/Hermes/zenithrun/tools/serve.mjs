/* ZENITH RUN dev static server · ox-alpha piagent run-01
   Serves zenithrun/ web root on a probed free port; writes server.json. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.json':'application/json', '.ico':'image/x-icon',
  '.webm':'video/webm', '.wav':'audio/wav', '.map':'application/json'
};

function probe(port){
  return new Promise((res,rej)=>{
    const srv = net.createServer();
    srv.once('error', rej);
    srv.listen(port, ()=>{ const p = srv.address().port; srv.close(()=>res(p)); });
  });
}

async function main(){
  let port = 8930 + Math.floor(Math.random()*120);
  for (let i=0;i<40;i++){
    try { port = await probe(port); break; }
    catch(e){ port++; }
  }
  const server = http.createServer((req,res)=>{
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') u = '/index.html';
    const fp = path.join(ROOT, path.normalize(u).replace(/^([.][.][\\/])+/, ''));
    if (!fp.startsWith(ROOT)){ res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err,data)=>{
      if (err){ res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, {'Content-Type': MIME[path.extname(fp)]||'application/octet-stream',
                          'Cache-Control':'no-store'});
      res.end(data);
    });
  });
  server.listen(port, '127.0.0.1', ()=>{
    const info = { project:'ZENITH RUN', port, pid: process.pid,
                   started: new Date().toISOString(), root: ROOT };
    fs.writeFileSync(path.join(__dirname,'..','server.json'), JSON.stringify(info,null,2));
    console.log('ZENITH RUN serving http://127.0.0.1:'+port+' (pid '+process.pid+')');
  });
}
main();
