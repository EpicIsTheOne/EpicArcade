// Diagnose why bots aren't fighting: sample bot states + distances.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)));
await page.goto('http://127.0.0.1:8420/', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 1000)); if (await page.evaluate(() => !!window.__game)) break; }
await page.click('#btnPlay');
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { window.__game.qaJump(); window.__game.qaSteerTo(-80, -80); });
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 8000));
  const s = await page.evaluate(() => {
    const g = window.__game;
    const states = {};
    let armed = 0, minDist = 1e9;
    for (const b of g.bots.bots) {
      if (!b.alive) continue;
      states[b.state] = (states[b.state] || 0) + 1;
      if (b.weaponId) armed++;
      for (const o of g.bots.bots) {
        if (o === b || !o.alive) continue;
        const d = b.pos.distanceTo(o.pos);
        if (d < minDist) minDist = d;
      }
    }
    return { t: Math.round(g.matchTime), alive: g.countAlive(), states, armed, minDist: Math.round(minDist), storm: g.storm.state };
  });
  console.log(JSON.stringify(s));
}
await browser.close();
