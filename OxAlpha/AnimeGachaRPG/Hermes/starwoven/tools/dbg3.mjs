import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Users/Epic/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true, args:['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({viewport:{width:1280,height:760}})).newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:53169/?autotest=1',{waitUntil:'networkidle'});
await new Promise(r=>setTimeout(r,800));
await page.click('#btn-new');
await new Promise(r=>setTimeout(r,1200));
for (let i=0;i<30;i++){ if(!(await page.$('.dialogue:not(.hidden)')))break; await page.click('.dialogue'); await new Promise(r=>setTimeout(r,130)); }
console.log('synthetic keydown:', await page.evaluate(()=>{ window.dispatchEvent(new KeyboardEvent('keydown',{key:'f'})); return SW.game.keys['f']; }));
console.log('nearest:', await page.evaluate(()=>{ const g=SW.game; g.active.x=950; g.active.y=700; const it=g.nearestInteractable(); return it? it.kind+'/'+(it.id||'') : 'NULL'; }));
console.log('direct try:', await page.evaluate(()=>SW.game.tryInteract()));
await browser.close();
