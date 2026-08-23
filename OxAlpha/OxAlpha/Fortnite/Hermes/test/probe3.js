// Watch a live match for 90s: report alive-count decay + killfeed entries.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://127.0.0.1:8420/', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 1000)); if (await page.evaluate(() => !!window.__game)) break; }
await page.click('#btnPlay');
await new Promise(r => setTimeout(r, 2000));
await page.evaluate(() => { window.__game.qaJump(); window.__game.qaSteerTo(-80, -80); });
let lastAlive = 48;
for (let i = 0; i < 18; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await page.evaluate(() => ({
    alive: window.__game.countAlive(),
    kf: [...document.querySelectorAll('#killfeed .kf')].slice(0, 4).map(e => e.textContent),
    storm: window.__game.storm.state + ' p' + window.__game.storm.phaseIdx,
  }));
  if (s.alive !== lastAlive) { console.log(`${i * 5}s alive=${s.alive} storm=${s.storm} feed=${JSON.stringify(s.kf)}`); lastAlive = s.alive; }
}
await browser.close();
