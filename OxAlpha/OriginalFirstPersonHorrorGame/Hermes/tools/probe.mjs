import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',
  args:['--window-size=1280,720','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${path.join(root,'tools','.chrome-profile')}`],
  defaultViewport:{width:1280,height:720}});
const page=await browser.newPage();
page.on('console',m=>console.log('[console.'+m.type()+']',m.text().slice(0,300)));
page.on('pageerror',e=>console.log('[PAGEERROR]',e.message.slice(0,500)));
await page.goto('http://localhost:8642/?debug=1',{waitUntil:'load'});
await sleep(2000);
console.log('state0=',await page.evaluate(()=>HG.Game.state));
await page.click('#btnStart');
await sleep(600);
console.log('state1=',await page.evaluate(()=>HG.Game.state));
// instrument: check listener presence by dispatching click manually
const r=await page.evaluate(()=>{
  const el=document.getElementById('intro');
  const rect=el.getBoundingClientRect();
  return {rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height},
    pointerEvents:getComputedStyle(el).pointerEvents, z:getComputedStyle(el).zIndex,
    topAtCenter:document.elementFromPoint(640,360)?.id||document.elementFromPoint(640,360)?.tagName};
});
console.log('intro probe:',JSON.stringify(r));
await page.evaluate(()=>document.getElementById('intro').click());
await sleep(700);
console.log('state2=',await page.evaluate(()=>HG.Game.state));
await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
console.log('pos=',await page.evaluate(()=>({x:HG.Player.x.toFixed(2),z:HG.Player.z.toFixed(2),frozen:HG.Player.frozen})));
await browser.close();
