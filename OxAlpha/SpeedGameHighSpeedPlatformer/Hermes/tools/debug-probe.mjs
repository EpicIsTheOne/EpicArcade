import { chromium } from 'playwright-core';
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,200)));
await page.goto('http://127.0.0.1:8942/index.html?qa=1&autopilot=1&gfx=low&level=coast', { waitUntil: 'load' });
await page.waitForFunction('window.__VR && window.__VR.ready', null, { timeout: 30000 });
await page.waitForFunction("window.__VR.state === 'PLAY'", null, { timeout: 30000 });
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const g = window.__VR, w = g.world;
  const res = [];
  // vertical drop probes over the suspicious strip
  for (let x = -12; x <= 18; x += 2) {
    for (let z = 84; z <= 144; z += 2) {
      const h = w.groundBelow(x, 12, z, 12);
      res.push([x, z, h ? +h.y.toFixed(2) : 'none', h ? [+h.normal.x.toFixed(2), +h.normal.y.toFixed(2), +h.normal.z.toFixed(2)] : null]);
    }
  }
  return res;
});
// print anomalies: missing ground or tilted normals
for (const [x, z, y, n] of out) {
  if (y === 'none' || Math.abs(y - 5.5) > 2.2 || (n && n[1] < 0.98)) console.log('anomaly', x, z, y, JSON.stringify(n));
}
console.log('probes done', out.length);
await browser.close();
