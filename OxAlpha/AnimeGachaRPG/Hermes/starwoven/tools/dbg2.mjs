import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Users/Epic/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true, args:['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({viewport:{width:1280,height:760}})).newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:53169/?autotest=1',{waitUntil:'networkidle'});
await new Promise(r=>setTimeout(r,800));
await page.click('#btn-new');
await new Promise(r=>setTimeout(r,1200));
for (let i=0;i<30;i++){ if(!(await page.$('.dialogue:not(.hidden)')))break; await page.click('.dialogue'); await new Promise(r=>setTimeout(r,130)); }
await page.evaluate(()=>{ const g=SW.game; g.active.x=950; g.active.y=700; });
// 1) direct engine call
console.log('direct tryInteract:', await page.evaluate(()=>SW.game.tryInteract()));
await new Promise(r=>setTimeout(r,400));
console.log('panel after direct:', await page.evaluate(()=>!!document.querySelector('.loom-panel')));
await page.keyboard.press('Escape');
await new Promise(r=>setTimeout(r,300));
// 2) real key event
await page.keyboard.press('f');
await new Promise(r=>setTimeout(r,400));
console.log('keys f registered?', await page.evaluate(()=>SW.game.keys['f']));
console.log('panel after keyF:', await page.evaluate(()=>!!document.querySelector('.loom-panel')));
await browser.close();
