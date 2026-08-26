// probe-qs.mjs — diagnose why real-keyboard double-tap fails headless
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:9371';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(BASE + '/index.html?gfx=low', { waitUntil: 'load' });
await page.waitForFunction('window.__volt && window.__gameReady', null, { timeout: 20000 });
await page.click('#btn-play');
await page.waitForFunction("window.__volt.state()==='playing'", null, { timeout: 30000 });
await page.waitForFunction('window.__volt.stats().grounded', null, { timeout: 15000 }).catch(() => {});

const env = await page.evaluate(() => ({
  hasFocus: document.hasFocus(),
  locked: window.__volt.input.locked,
  visibility: document.visibilityState,
}));
console.log('ENV', JSON.stringify(env));

// does a real keydown reach the handler?
await page.keyboard.press('KeyA');
const keySeen = await page.evaluate(() => !!window.__volt.input.keys['KeyA']);
console.log('real keydown registered KeyA:', keySeen);
await page.evaluate(() => window.__volt.holdKey('KeyA', false));

// double-tap via real events
await page.evaluate(() => window.__volt.lookYaw(Math.PI / 2));
await page.waitForTimeout(250);
const vz0 = (await page.evaluate(() => window.__volt.stats())).vel[2];
let lastTapBefore = await page.evaluate(() => window.__volt.input._lastTap['KeyA']);
await page.keyboard.press('KeyA');
await page.waitForTimeout(90);
await page.keyboard.press('KeyA');
let dvzMax = -1e9;
for (let i = 0; i < 30; i++) {
  const s = await page.evaluate(() => window.__volt.stats());
  dvzMax = Math.max(dvzMax, s.vel[2] - vz0);
  if (dvzMax > 4) break;
  await page.waitForTimeout(30);
}
console.log('real-event double-tap Δvel.z max:', dvzMax.toFixed(2), 'lastTap before:', lastTapBefore);

// same double-tap via synthetic events (bypasses guard)
await page.evaluate(() => window.__volt.warpTo(0, 2, -12));
await page.waitForTimeout(300);
const vz1 = (await page.evaluate(() => window.__volt.stats())).vel[2];
await page.evaluate(() => {
  const fire = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
  fire(); setTimeout(fire, 60);
});
await page.waitForTimeout(400);
const dvzSyn = (await page.evaluate(() => window.__volt.stats())).vel[2] - vz1;
console.log('synthetic-event double-tap Δvel.z:', dvzSyn.toFixed(2));

await browser.close();
