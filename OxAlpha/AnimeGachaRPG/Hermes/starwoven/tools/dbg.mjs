import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Users/Epic/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:53169/?autotest=1', { waitUntil: 'networkidle' });
await new Promise(r => setTimeout(r, 800));
await page.click('#btn-new');
await new Promise(r => setTimeout(r, 1200));
for (let i = 0; i < 30; i++) {
  if (!(await page.$('.dialogue:not(.hidden)'))) break;
  await page.click('.dialogue'); await new Promise(r => setTimeout(r, 130));
}
await new Promise(r => setTimeout(r, 300));
console.log('state:', await page.evaluate(() => SW.game.state));
console.log('panelOpen:', await page.evaluate(() => SW.ui.panelOpen));
console.log('talkedSelene flag:', await page.evaluate(() => SW.save.story.step));
// teleport to loom & inspect nearest interactable
console.log('near:', await page.evaluate(() => {
  const g = SW.game;
  const loom = g.zone.def.pois.find(p => p.id === 'loom');
  g.active.x = loom.x; g.active.y = loom.y + 80;
  const it = g.nearestInteractable();
  return JSON.stringify({ pos: [g.active.x, g.active.y], it });
}));
await page.keyboard.press('f');
await new Promise(r => setTimeout(r, 600));
console.log('after F: state=', await page.evaluate(() => SW.game.state),
  'loomTouched=', await page.evaluate(() => window.SW && document.querySelector('.loom-panel') ? 'panel-open' : 'no-panel'),
  'step=', await page.evaluate(() => SW.save.story.step));
await browser.close();
