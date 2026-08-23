// Visual QA: force high quality, screenshot key vantage points.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)));
await page.goto('http://127.0.0.1:8420/', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 1000)); if (await page.evaluate(() => !!window.__game)) break; }
await page.evaluate(() => window.__game.setQuality('high'));
await page.evaluate(() => document.getElementById('lobby').classList.add('hidden'));
await new Promise(r => setTimeout(r, 3000));

const spots = [
  ['v-harbor', -620, -520, 30], ['v-spire', 480, -600, 40], ['v-crossroads', -80, -80, 25],
  ['v-quarry', -640, 420, 35], ['v-observatory', 700, 700, 45], ['v-lighthouse', 840, -140, 50],
];
for (const [name, x, z, h] of spots) {
  await page.evaluate(([x, z, h]) => {
    const g = window.__game;
    g.qaTeleport(x, z);
    g.player.pos.y = g.island.height(x, z) + h;
    g.player.mode = 'ground';
    g.player.vel.set(0, 0, 0);
    g.player.camRig.yaw = Math.random() * 6.28;
    g.player.camRig.pitch = -0.65;
    g.camOverride = true;
  }, [x, z, h]);
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: `qa/shots/${name}.png` });
  console.log('shot', name);
}
await browser.close();
