import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => console.log('CONSOLE:', m.type(), m.text().slice(0,200)));
await page.goto('http://127.0.0.1:8961', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(`(() => ({
    ready: window.PW ? PW.hook.ready : 'noPW',
    msg: document.getElementById('bootMsg')?.textContent,
    bar: document.getElementById('bootBar')?.style.width,
    assets: !!(window.PW && PW.Assets),
  }))()`);
  console.log(i, JSON.stringify(s));
  if (s.ready) break;
}
await browser.close();
