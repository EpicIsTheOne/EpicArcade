import { chromium } from 'playwright-core';
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,300)));
await page.goto('http://127.0.0.1:8942/index.html?qa=1&autopilot=1&gfx=low&level=coast', { waitUntil: 'load' });
await page.waitForFunction('window.__VR && window.__VR.ready', null, { timeout: 30000 });
await page.waitForFunction("window.__VR.state === 'PLAY'", null, { timeout: 30000 });
for (let i = 0; i < 14; i++) {
  const s = await page.evaluate(() => {
    const g = window.__VR, p = g.player, ap = g.autopilot;
    const wps = g.level.def.waypoints;
    const wi = Math.min(ap.wpIndex, wps.length-1);
    return {
      t: +g.runTime.toFixed(1),
      pos: p.pos.toArray().map(v=>+v.toFixed(1)),
      vel: p.vel.toArray().map(v=>+v.toFixed(1)),
      spd: +p.speed.toFixed(1),
      camYaw: +g.chaseCam.yaw.toFixed(2), pYaw: +p.yaw.toFixed(2),
      wpIdx: ap.wpIndex, wp: wps[wi],
      keys: Object.entries(ap.vinput.keys).filter(([k,v])=>v).map(([k])=>k)
    };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(600);
}
await browser.close();
