import puppeteer from 'puppeteer-core';
import fs from 'fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await puppeteer.launch({ executablePath: exe, headless:'shell',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],
  defaultViewport:{width:1280,height:800} });
const page = await browser.newPage();
let errCount=0;
page.on('pageerror', e=>{
  errCount++;
  console.log(`\n===== PAGE ERROR #${errCount}: ${e.message}`);
  if(e.stack) console.log(e.stack.split('\n').slice(0,20).join('\n'));
});
await page.goto('http://127.0.0.1:8520/index.html?qa=1', {waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,4000));
console.log('-- boot ok, starting night 1 --');
await page.evaluate(()=>WD.game.startNight(1));
await new Promise(r=>setTimeout(r,2500));
console.log('-- killing orv (jumpscare path) --');
await page.evaluate(()=>WD.game.die('orv'));
await new Promise(r=>setTimeout(r,2200));
const s1 = await page.evaluate(()=>({scr:WD.state.screen, dead:WD.state.dead}));
console.log('after death:', JSON.stringify(s1));
console.log('-- toMenu + restart night 3 --');
await page.evaluate(()=>WD.ui.toMenu());
await new Promise(r=>setTimeout(r,500));
await page.evaluate(()=>WD.game.startNight(3));
for(let i=0;i<8;i++){
  await new Promise(r=>setTimeout(r,700));
  const s = await page.evaluate(()=>({p:+WD.state.power.toFixed(2), scr:WD.state.screen,
    dead:WD.state.dead, chars:Object.keys(WD.ai.state.chars).length,
    states:Object.entries(WD.ai.state.chars).map(([k,v])=>k+':'+v.state).join(',')}));
  console.log(i, JSON.stringify(s));
  if(errCount>3) break;
}
await browser.close();
console.log('done, errors:', errCount);
