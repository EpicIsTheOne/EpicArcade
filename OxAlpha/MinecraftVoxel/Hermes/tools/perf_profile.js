// Performance profile: fps at several render distances + chunk gen timing.
'use strict';
const puppeteer = require('puppeteer');
async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto('http://127.0.0.1:8477/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => document.getElementById('btnPlay').click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.getElementById('btnCreate').click());
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => window.game && window.game.state === 'playing');
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  for (const rd of [6, 10, 14]) {
    await page.evaluate((d) => {
      window.game.applySettings(Object.assign({}, window.game.settings, { renderDistance: d }));
    }, rd);
    await new Promise(r => setTimeout(r, 12000)); // stream + settle
    const stats = await page.evaluate(() => ({
      rd: window.game.settings.renderDistance,
      fps: window.game.fpsShown,
      chunks: window.game.world.chunks.size,
      tris: (window.game.post && window.game.post.sceneStats) ? window.game.post.sceneStats.tris : 0,
      draws: (window.game.post && window.game.post.sceneStats) ? window.game.post.sceneStats.calls : 0,
    }));
    console.log('RD=' + stats.rd, 'fps=' + stats.fps, 'chunks=' + stats.chunks, 'tris=' + stats.tris.toLocaleString(), 'draws=' + stats.draws);
  }
  // note: headless SwiftShader is CPU-rendered; a real GPU will be much faster
  await browser.close();
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
