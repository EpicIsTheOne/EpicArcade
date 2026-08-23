import puppeteer from 'puppeteer-core';
import fs from 'fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await puppeteer.launch({ executablePath: exe, headless:'shell',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],
  defaultViewport:{width:1280,height:800} });
const page = await browser.newPage();
page.on('pageerror', e=>{
  console.log('[pageerror]', e.message);
  if(e.stack) console.log(e.stack.split('\n').slice(0,14).join('\n'));
});
await page.goto('http://127.0.0.1:8520/index.html?qa=1', {waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4000));
// jump straight into the suspected zone: night 3, drain power, wait through blackout
await page.evaluate(()=>{ WD.game.startNight(3); });
await new Promise(r=>setTimeout(r,800));
await page.evaluate(()=>{ WD.state.monitor=false; WD.qa.addPower(-99.9); });
for(let i=0;i<24;i++){
  await new Promise(r=>setTimeout(r,1000));
  const s = await page.evaluate(()=>({p:+WD.state.power.toFixed(2), out:WD.state.powerOut,
    bt:+(WD.state.blackoutT||0).toFixed(1), dead:WD.state.dead, by:WD.state.deadBy,
    scr:WD.state.screen}));
  console.log(i, JSON.stringify(s));
  if(s.dead) break;
}
await browser.close();
console.log('done');
