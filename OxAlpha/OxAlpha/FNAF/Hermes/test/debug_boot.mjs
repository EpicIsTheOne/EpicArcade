import puppeteer from 'puppeteer-core';
import fs from 'fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(c=>fs.existsSync(c));
const browser = await puppeteer.launch({ executablePath: exe, headless:'shell',
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],
  defaultViewport:{width:1280,height:800} });
const page = await browser.newPage();
page.on('console', m=>console.log('[console]', m.type(), m.text().slice(0,200)));
page.on('pageerror', e=>console.log('[pageerror]', e.message.slice(0,300)));
page.on('requestfailed', r=>console.log('[reqfail]', r.url().slice(0,120), r.failure()?.errorText));
page.on('response', r=>{ if(r.status()>=400) console.log('[http'+r.status()+']', r.url().slice(0,120)); });
await page.goto('http://127.0.0.1:8520/index.html', {waitUntil:'networkidle2', timeout:60000});
await new Promise(r=>setTimeout(r,4000));
const info = await page.evaluate(()=>({
  title: document.title,
  hasWD: typeof window.WD !== 'undefined',
  hasTHREE: typeof window.THREE !== 'undefined',
  scripts: [...document.querySelectorAll('script')].map(s=>s.src.split('/').slice(-1)[0]||'inline'),
  bodyChildren: document.body.children.length,
}));
console.log(JSON.stringify(info,null,1));
const shot = 'screenshots/debug_boot.png';
await page.screenshot({path:shot});
console.log('shot saved', shot);
await browser.close();
