import { chromium } from 'playwright-core';
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,200), '||', (e.stack||'').split('\n')[1] || ''));
await page.goto('http://127.0.0.1:9371/index.html?gfx=low', { waitUntil: 'load' });
await page.waitForFunction('window.__volt && window.__gameReady', null, { timeout: 20000 });
await page.click('#btn-play');
await page.waitForFunction("window.__volt.state()==='playing'", null, { timeout: 30000 });
for (let i=0;i<15;i++) {
  const s = await page.evaluate(() => {
    const g = window.__volt, p = g.director().player;
    return { t:+g.stats().time.toFixed(1), pos:p.pos.toArray().map(v=>+v.toFixed(2)), vy:+p.vel.y.toFixed(2),
             grounded:p.grounded, state:p.state, up:p.up.toArray().map(v=>+v.toFixed(2)),
             world:!!p.world, hp:p.hp };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(250);
}
await browser.close();
